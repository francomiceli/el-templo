/**
 * Socios Vigentes Import Script (Second Pass)
 *
 * Enriches subscription data with full history from "socios vigentes" CSVs.
 * Must run AFTER import-members.ts (first pass).
 *
 * What it does:
 *   - Creates a subscription record per vigencia row (full history)
 *   - Sets real start_date/end_date from Vigencia column
 *   - Updates user's createdAt to oldest subscription start date
 *   - Removes first-pass subscriptions that are superseded by vigentes data
 *   - Determines active/inactive status from subscription end dates
 *
 * Usage:
 *   pnpm tsx src/db/import-vigentes.ts --data-dir /path/to/csvs [--execute]
 */

import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { eq, inArray, and, sql } from "drizzle-orm";
import { users } from "./schema/users.js";
import { branches } from "./schema/branches.js";
import { subscriptionPlans } from "./schema/subscription-plans.js";
import { subscriptions } from "./schema/subscriptions.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface VigenciaRow {
  email: string;
  socioName: string;
  phone: string | null;
  planName: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  medioPago: string;
  branchName: string;
}

interface MemberHistory {
  email: string;
  rows: VigenciaRow[];
  oldestStartDate: string; // YYYY-MM-DD
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Strip accents from a string for comparison. */
function stripAccents(str: string): string {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * Parse "DD/MM/YYYY al DD/MM/YYYY" into { startDate, endDate } as YYYY-MM-DD.
 */
export function parseVigencia(
  vigencia: string,
): { startDate: string; endDate: string } | null {
  const trimmed = vigencia.trim();
  if (!trimmed) return null;

  const parts = trimmed.split(" al ");
  if (parts.length !== 2) return null;

  const start = parseDateDMY(parts[0]);
  const end = parseDateDMY(parts[1]);
  if (!start || !end) return null;

  return { startDate: start, endDate: end };
}

/** Parse DD/MM/YYYY to YYYY-MM-DD. */
function parseDateDMY(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const parts = trimmed.split("/");
  if (parts.length !== 3) return null;

  const day = parts[0].padStart(2, "0");
  const month = parts[1].padStart(2, "0");
  const year = parts[2];

  if (!year || !month || !day) return null;
  return `${year}-${month}-${day}`;
}

/**
 * Map Medio de pago to price_type_applied enum.
 */
function mapMedioPago(medio: string): "regular" | "zero" | "credit_card" {
  const normalized = medio.trim().toLowerCase();
  if (normalized === "tarjeta" || normalized === "tarjeta de credito") {
    return "credit_card";
  }
  // "Efectivo" and everything else → regular
  return "regular";
}

// ─── CSV Parsing ────────────────────────────────────────────────────────────

/**
 * Parse all "socios vigentes *.csv" files from a directory.
 */
export function parseAllVigentesCsvs(dataDir: string): VigenciaRow[] {
  const files = fs.readdirSync(dataDir).filter((f) => {
    const lower = f.toLowerCase();
    return lower.startsWith("socios vigentes") && lower.endsWith(".csv");
  });

  const allRows: VigenciaRow[] = [];

  for (const file of files) {
    // Extract branch name: "socios vigentes alem csv.csv" -> "alem"
    const match = file.match(/socios vigentes (.+?)(?:\s+csv)?\.csv/i);
    if (!match) continue;
    const branchKey = match[1].trim().toLowerCase();
    const branchName = branchKey.charAt(0).toUpperCase() + branchKey.slice(1);

    const filePath = path.join(dataDir, file);
    const rawContent = fs.readFileSync(filePath, "utf-8");

    const records: Record<string, string>[] = parse(rawContent, {
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
      trim: false,
    });

    for (const record of records) {
      const email = (record["Email"] ?? "").trim().toLowerCase();
      if (!email) continue;

      const vigenciaStr = (record["Vigencia"] ?? "").trim();
      const vigencia = parseVigencia(vigenciaStr);
      if (!vigencia) continue;

      const planName = (record["Servicio/Membresia"] ?? "").trim();
      if (!planName) continue;

      allRows.push({
        email,
        socioName: (record["Socio"] ?? "").trim(),
        phone:
          (record["Celular"] ?? "").trim() ||
          (record["Telefono"] ?? "").trim() ||
          null,
        planName,
        startDate: vigencia.startDate,
        endDate: vigencia.endDate,
        medioPago: (record["Medio de pago"] ?? "Efectivo").trim(),
        branchName,
      });
    }
  }

  return allRows;
}

/**
 * Group rows by email and compute per-member history.
 */
export function groupByMember(rows: VigenciaRow[]): MemberHistory[] {
  const groups = new Map<string, VigenciaRow[]>();

  for (const row of rows) {
    const existing = groups.get(row.email);
    if (existing) {
      existing.push(row);
    } else {
      groups.set(row.email, [row]);
    }
  }

  const histories: MemberHistory[] = [];

  for (const [email, memberRows] of groups.entries()) {
    // Sort by start date ascending
    memberRows.sort((a, b) => a.startDate.localeCompare(b.startDate));

    histories.push({
      email,
      rows: memberRows,
      oldestStartDate: memberRows[0].startDate,
    });
  }

  return histories;
}

// ─── Main ───────────────────────────────────────────────────────────────────

interface VigentesReport {
  timestamp: string;
  mode: "dry-run" | "execute";
  summary: {
    totalRows: number;
    uniqueMembers: number;
    membersNotFoundInDb: number;
    subscriptionsToCreate: number;
    subscriptionsAlreadyExist: number;
    firstPassSubsKept: number;
  };
  execution?: {
    subscriptionsCreated: number;
    subscriptionsUpdated: number;
    firstPassSubsKept: number;
    usersUpdatedIngreso: number;
    usersMarkedInactive: number;
  };
}

async function main(): Promise<void> {
  // ── Parse CLI args ──────────────────────────────────────────────
  const args = process.argv.slice(2);
  const dataDirIdx = args.indexOf("--data-dir");
  if (dataDirIdx === -1 || !args[dataDirIdx + 1]) {
    console.error(
      "Usage: pnpm tsx src/db/import-vigentes.ts --data-dir /path/to/csvs [--execute]",
    );
    process.exit(1);
  }
  const dataDir = args[dataDirIdx + 1];
  const executeMode = args.includes("--execute");

  // ── Safety gate ─────────────────────────────────────────────────
  if (executeMode && process.env.NODE_ENV === "production") {
    if (process.env.CONFIRM_IMPORT !== "yes") {
      throw new Error(
        "SAFETY: Set CONFIRM_IMPORT=yes to run --execute in production.",
      );
    }
  }

  // ── Load .env ───────────────────────────────────────────────────
  const dotenv = await import("dotenv");
  const nodePath = await import("node:path");
  const envFile =
    process.env.NODE_ENV === "production"
      ? ".env.production"
      : ".env.development";
  dotenv.config({ path: nodePath.resolve(process.cwd(), envFile) });
  dotenv.config({ path: nodePath.resolve(process.cwd(), ".env") });

  // ── Connect to database ─────────────────────────────────────────
  const { createSingleConnection } = await import("./index.js");
  const { db, connection } = await createSingleConnection();

  try {
    console.log(`\nSocios Vigentes Import (Second Pass)`);
    console.log(`Mode: ${executeMode ? "EXECUTE" : "DRY-RUN"}`);
    console.log(`Data dir: ${dataDir}\n`);

    // ── Step 1: Parse CSVs ────────────────────────────────────────
    const allRows = parseAllVigentesCsvs(dataDir);
    const histories = groupByMember(allRows);

    console.log(`--- CSV Summary ---`);
    console.log(`  Total rows: ${allRows.length}`);
    console.log(`  Unique members: ${histories.length}`);

    // ── Step 2: Load DB lookups ───────────────────────────────────
    const dbBranches = await db
      .select({ id: branches.id, name: branches.name, code: branches.code })
      .from(branches);

    const branchIdLookup = new Map<string, number>();
    for (const b of dbBranches) {
      const parts = b.name.split(" ");
      const suffix = parts[parts.length - 1];
      branchIdLookup.set(stripAccents(suffix).toLowerCase(), b.id);
      branchIdLookup.set(b.code.toLowerCase(), b.id);
    }

    const dbPlans = await db
      .select({ id: subscriptionPlans.id, name: subscriptionPlans.name })
      .from(subscriptionPlans);

    const existingUsers: Array<{
      id: number;
      email: string;
      createdAt: Date | null;
    }> = await db
      .select({
        id: users.id,
        email: users.email,
        createdAt: users.createdAt,
      })
      .from(users);

    const userByEmail = new Map<
      string,
      { id: number; createdAt: Date | null }
    >();
    for (const u of existingUsers) {
      userByEmail.set(u.email.trim().toLowerCase(), {
        id: u.id,
        createdAt: u.createdAt,
      });
    }

    // Plan name matching (same logic as first pass)
    function findPlanId(csvPlanName: string): number | null {
      const normalized = stripAccents(csvPlanName.trim().toUpperCase());
      const withPlus = normalized.replace(/\s+PLUS$/i, "+");

      for (const plan of dbPlans) {
        const planNorm = stripAccents(plan.name.trim().toUpperCase());
        if (normalized === planNorm) return plan.id;
        if (withPlus === planNorm) return plan.id;
        const planExpanded = planNorm.replace(/\+$/, " PLUS");
        if (normalized === planExpanded) return plan.id;
      }
      return null;
    }

    // ── Step 3: Analyze what needs to happen ──────────────────────
    const today = new Date().toISOString().split("T")[0];
    let membersNotFound = 0;
    let subsToCreate = 0;
    let subsAlreadyExist = 0;
    let firstPassToRemove = 0;

    // Pre-load existing subscriptions for vigentes members
    const vigentesUserIds: number[] = [];
    for (const h of histories) {
      const user = userByEmail.get(h.email);
      if (user) vigentesUserIds.push(user.id);
    }

    // Load all existing subscriptions for these users
    const existingSubs: Array<{
      id: number;
      userId: number;
      planId: number;
      startDate: string;
      endDate: string | null;
      notes: string | null;
    }> =
      vigentesUserIds.length > 0
        ? await db
            .select({
              id: subscriptions.id,
              userId: subscriptions.userId,
              planId: subscriptions.planId,
              startDate: subscriptions.startDate,
              endDate: subscriptions.endDate,
              notes: subscriptions.notes,
            })
            .from(subscriptions)
            .where(inArray(subscriptions.userId, vigentesUserIds))
        : [];

    // Index existing subs by "userId:planId:endDate"
    const existingSubKeys = new Set<string>();
    const existingSubsByUser = new Map<number, typeof existingSubs>();
    for (const s of existingSubs) {
      existingSubKeys.add(`${s.userId}:${s.planId}:${s.endDate ?? ""}`);
      const userSubs = existingSubsByUser.get(s.userId) ?? [];
      userSubs.push(s);
      existingSubsByUser.set(s.userId, userSubs);
    }

    // Track which vigentes sub keys we're creating
    const vigentesSubKeys = new Map<number, Set<string>>(); // userId -> set of "planId:endDate"

    for (const history of histories) {
      const user = userByEmail.get(history.email);
      if (!user) {
        membersNotFound++;
        continue;
      }

      const memberVigentesKeys = new Set<string>();

      for (const row of history.rows) {
        const planId = findPlanId(row.planName);
        if (!planId) continue;

        const key = `${user.id}:${planId}:${row.endDate}`;
        memberVigentesKeys.add(`${planId}:${row.endDate}`);

        if (existingSubKeys.has(key)) {
          subsAlreadyExist++;
        } else {
          subsToCreate++;
        }
      }

      vigentesSubKeys.set(user.id, memberVigentesKeys);

      // First-pass subs that match a vigentes row (same planId+endDate)
      // will be updated in-place. Non-matching first-pass subs are kept
      // as-is — they may represent a current plan not yet in vigentes history.
      vigentesSubKeys.set(user.id, memberVigentesKeys);
    }

    console.log(`\n--- Analysis ---`);
    console.log(`  Members not found in DB: ${membersNotFound}`);
    console.log(`  Subscriptions to create: ${subsToCreate}`);
    console.log(`  Subscriptions already exist: ${subsAlreadyExist}`);
    console.log(
      `  First-pass subs kept (not in vigentes): ${firstPassToRemove}`,
    );

    const report: VigentesReport = {
      timestamp: new Date().toISOString(),
      mode: executeMode ? "execute" : "dry-run",
      summary: {
        totalRows: allRows.length,
        uniqueMembers: histories.length,
        membersNotFoundInDb: membersNotFound,
        subscriptionsToCreate: subsToCreate,
        subscriptionsAlreadyExist: subsAlreadyExist,
        firstPassSubsKept: firstPassToRemove,
      },
    };

    // ── Execute mode ──────────────────────────────────────────────
    if (executeMode) {
      console.log(`\n=== EXECUTING VIGENTES IMPORT ===\n`);

      let subscriptionsCreated = 0;
      let subscriptionsUpdated = 0;
      let firstPassKept = 0;
      let usersUpdatedIngreso = 0;
      let usersMarkedInactive = 0;

      for (const history of histories) {
        const user = userByEmail.get(history.email);
        if (!user) continue;

        // Determine branch from latest row
        const latestRow = history.rows[history.rows.length - 1];
        const branchKey = latestRow.branchName.toLowerCase();
        const branchId = branchIdLookup.get(branchKey);
        if (!branchId) {
          console.error(
            `  Skipping ${history.email}: no branch mapping for "${latestRow.branchName}"`,
          );
          continue;
        }

        // Create/update subscriptions for each row
        for (const row of history.rows) {
          const planId = findPlanId(row.planName);
          if (!planId) {
            console.error(
              `  Skipping sub for ${row.email}: plan "${row.planName}" not found`,
            );
            continue;
          }

          const rowBranchId =
            branchIdLookup.get(row.branchName.toLowerCase()) ?? branchId;
          const status = row.endDate >= today ? "active" : "expired";
          const priceType = mapMedioPago(row.medioPago);

          const key = `${user.id}:${planId}:${row.endDate}`;

          if (existingSubKeys.has(key)) {
            // Update existing subscription with correct startDate and payment
            const existing = existingSubs.find(
              (s) =>
                s.userId === user.id &&
                s.planId === planId &&
                s.endDate === row.endDate,
            );
            if (existing) {
              await db
                .update(subscriptions)
                .set({
                  startDate: row.startDate,
                  status,
                  priceTypeApplied: priceType,
                  branchId: rowBranchId,
                  notes: "Importado desde CSV (vigentes)",
                })
                .where(eq(subscriptions.id, existing.id));
              subscriptionsUpdated++;
            }
          } else {
            // Create new subscription
            await db.insert(subscriptions).values({
              userId: user.id,
              planId,
              branchId: rowBranchId,
              status,
              startDate: row.startDate,
              endDate: row.endDate,
              pricePaid: 0,
              priceTypeApplied: priceType,
              notes: "Importado desde CSV (vigentes)",
            });
            subscriptionsCreated++;
          }
        }

        // Count first-pass subs kept (not covered by vigentes)
        const memberVKeys = vigentesSubKeys.get(user.id);
        const userSubs = existingSubsByUser.get(user.id) ?? [];
        for (const s of userSubs) {
          if (s.notes === "Importado desde CSV") {
            const subKey = `${s.planId}:${s.endDate ?? ""}`;
            if (!memberVKeys?.has(subKey)) {
              firstPassKept++;
            }
          }
        }

        // Update user's createdAt to oldest subscription start date
        const oldestDate = new Date(history.oldestStartDate + "T00:00:00");
        if (!user.createdAt || oldestDate < user.createdAt) {
          await db
            .update(users)
            .set({ createdAt: oldestDate })
            .where(eq(users.id, user.id));
          usersUpdatedIngreso++;
        }

        // Determine if user should be active or inactive
        // Active = has at least one subscription with endDate >= today
        const hasActiveSub = history.rows.some((r) => r.endDate >= today);
        await db
          .update(users)
          .set({ isActive: hasActiveSub })
          .where(eq(users.id, user.id));
        if (!hasActiveSub) {
          usersMarkedInactive++;
        }
      }

      report.execution = {
        subscriptionsCreated,
        subscriptionsUpdated,
        firstPassSubsKept: firstPassKept,
        usersUpdatedIngreso,
        usersMarkedInactive,
      };

      console.log(`=== EXECUTION SUMMARY ===`);
      console.log(`  Subscriptions created: ${subscriptionsCreated}`);
      console.log(`  Subscriptions updated: ${subscriptionsUpdated}`);
      console.log(`  First-pass subs kept: ${firstPassKept}`);
      console.log(`  Users fecha ingreso updated: ${usersUpdatedIngreso}`);
      console.log(`  Users marked inactive: ${usersMarkedInactive}`);

      // Cleanup: deactivate any member on a physical branch who is active
      // but has zero subscriptions (not from CSV, not from app — orphan state)
      const onlineBranches = dbBranches
        .filter((b) => b.name.includes("Online") || b.name.includes("Park"))
        .map((b) => b.id);

      const cleanupResult = await db.execute(sql`
        UPDATE ${users} u
        SET u.is_active = 0
        WHERE u.is_active = 1
          AND u.role = 'member'
          AND u.branch_id NOT IN (${sql.join(
            onlineBranches.map((id) => sql`${id}`),
            sql`,`,
          )})
          AND NOT EXISTS (
            SELECT 1 FROM ${subscriptions} s WHERE s.user_id = u.id
          )
      `);
      const cleanupCount =
        (cleanupResult as unknown as [{ affectedRows: number }])[0]
          ?.affectedRows ?? 0;
      console.log(
        `  Cleanup — active members with no subs deactivated: ${cleanupCount}`,
      );
    }

    // ── Write report ──────────────────────────────────────────────
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const reportPath = path.join(dataDir, `vigentes-report-${timestamp}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\nReport written to: ${reportPath}`);

    console.log("\n" + "=".repeat(50));
    console.log(executeMode ? "IMPORT COMPLETE" : "DRY-RUN COMPLETE");
    console.log("=".repeat(50));
  } finally {
    await connection.end();
  }
}

// ─── Entry point ────────────────────────────────────────────────────────────

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Import failed:", message);
    process.exit(1);
  });

export { main };
