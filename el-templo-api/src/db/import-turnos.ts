/**
 * CSV Turnos (Reservations) Import Script
 *
 * Processes 15 branch CSVs (5 branches × 3 future weeks) describing each
 * member's currently-reserved slots in the old POS system. Infers a
 * recurring fixed schedule per member (slots appearing in ≥2 of 3 weeks,
 * capped at plan.classesPerWeek) and creates:
 *
 *   - `subscription_schedules` rows (the recurring template)
 *   - `bookings` rows (literal reservations for each CSV row)
 *
 * Unmatched members (no active subscription in DB) are skipped and logged.
 * Existing schedules/bookings for processed members are overwritten.
 *
 * Usage:
 *   pnpm tsx src/db/import-turnos.ts --data-dir /path/to/csvs [--execute]
 */

import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { eq, and, gte, lte, inArray, sql } from "drizzle-orm";
import { users } from "./schema/users.js";
import { branches } from "./schema/branches.js";
import { subscriptions } from "./schema/subscriptions.js";
import { subscriptionPlans } from "./schema/subscription-plans.js";
import { subscriptionSchedules } from "./schema/subscription-schedules.js";
import { schedules } from "./schema/schedules.js";
import { bookings } from "./schema/bookings.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface TurnoRow {
  email: string;
  memberName: string;
  branchKey: string; // "alem" | "constitucion" | ...
  date: string; // YYYY-MM-DD
  weekday: number; // 1=Mon..6=Sat (ISO)
  startTime: string; // HH:MM
  csvPlanName: string;
}

interface MemberTurnos {
  email: string;
  memberName: string;
  rows: TurnoRow[];
  slotWeeks: Map<string, Set<string>>; // "branchKey|weekday|startTime" -> set of ISO week keys
}

interface MemberOutcome {
  email: string;
  memberName: string;
  userId: number | null;
  subscriptionId: number | null;
  planName: string | null;
  classesPerWeek: number | null;
  fixedSlots: Array<{ branchKey: string; weekday: number; startTime: string }>;
  overflowSlots: Array<{
    branchKey: string;
    weekday: number;
    startTime: string;
  }>;
  bookingsCreated: number;
  schedulesCreated: number;
  skipReason: string | null;
  warnings: string[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function branchKeyFromFilename(filename: string): string | null {
  const base = stripAccents(filename.toLowerCase());
  if (base.includes("alem")) return "alem";
  if (base.includes("constitucion")) return "constitucion";
  if (base.includes("jujuy")) return "jujuy";
  if (base.includes("mogotes")) return "mogotes";
  if (base.includes("moreno")) return "moreno";
  return null;
}

/** Parse DD/MM/YYYY → YYYY-MM-DD; returns null if invalid. */
function parseDateDMY(s: string): string | null {
  if (!s || !s.includes("/")) return null;
  const [d, m, y] = s.split("/");
  if (!d || !m || !y) return null;
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

/** ISO weekday (Mon=1..Sun=7). Our schedules use 1=Mon..6=Sat. */
function isoWeekday(yyyymmdd: string): number {
  const d = new Date(yyyymmdd + "T00:00:00Z");
  const day = d.getUTCDay(); // 0=Sun..6=Sat
  return day === 0 ? 7 : day;
}

/** ISO week key "YYYY-Www" to group rows across weeks. */
function isoWeekKey(yyyymmdd: string): string {
  const d = new Date(yyyymmdd + "T00:00:00Z");
  const tmp = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
  const dayNum = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(
    ((tmp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
  return `${tmp.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function normalizeHora(h: string): string {
  const trimmed = h.trim();
  if (/^\d{2}:\d{2}$/.test(trimmed)) return trimmed;
  if (/^\d{1,2}$/.test(trimmed)) return `${trimmed.padStart(2, "0")}:00`;
  return trimmed;
}

/**
 * Repair mojibake: the CSV reads as Latin-1, but some fields (notably
 * email addresses with ñ/í/á) are UTF-8 bytes mis-interpreted as Latin-1.
 * Re-encoding as Latin-1 bytes and decoding as UTF-8 recovers the original.
 * Returns the repaired string iff it looks cleaner (fewer mojibake markers);
 * otherwise returns the input unchanged.
 */
function repairMojibake(s: string): string {
  if (!s) return s;
  if (!/[ÃÂ]/.test(s)) return s; // no mojibake markers
  try {
    const repaired = Buffer.from(s, "latin1").toString("utf8");
    // If repair didn't actually help (still has markers), keep original
    if (/[ÃÂ]/.test(repaired)) return s;
    return repaired;
  } catch {
    return s;
  }
}

// ─── Pure parsing ───────────────────────────────────────────────────────────

export function parseTurnoCsvRow(
  row: Record<string, string>,
  branchKey: string,
): TurnoRow | null {
  const email = repairMojibake((row["Email"] ?? "").trim()).toLowerCase();
  if (!email) return null;
  const fecha = (row["Fecha"] ?? "").trim();
  const hora = normalizeHora(row["Hora"] ?? "");
  const csvPlanName = (row["Servicio/Membresia"] ?? "").trim();
  const date = parseDateDMY(fecha);
  if (!date || !hora) return null;
  return {
    email,
    memberName: repairMojibake((row["Socio"] ?? "").trim()),
    branchKey,
    date,
    weekday: isoWeekday(date),
    startTime: hora,
    csvPlanName,
  };
}

export function parseAllTurnosCsvs(dataDir: string): TurnoRow[] {
  const files = fs.readdirSync(dataDir).filter((f) => {
    const lower = f.toLowerCase();
    return lower.startsWith("socios") && lower.endsWith(".csv");
  });
  const all: TurnoRow[] = [];
  for (const file of files) {
    const branchKey = branchKeyFromFilename(file);
    if (!branchKey) continue;
    const content = fs.readFileSync(path.join(dataDir, file), "latin1");
    const records: Array<Record<string, string>> = parse(content, {
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
      trim: false,
    });
    for (const r of records) {
      const parsed = parseTurnoCsvRow(r, branchKey);
      if (parsed) all.push(parsed);
    }
  }
  return all;
}

/** Group rows by email; build slot→weeks map. */
export function groupByMember(rows: TurnoRow[]): Map<string, MemberTurnos> {
  const byEmail = new Map<string, MemberTurnos>();
  for (const r of rows) {
    let m = byEmail.get(r.email);
    if (!m) {
      m = {
        email: r.email,
        memberName: r.memberName,
        rows: [],
        slotWeeks: new Map(),
      };
      byEmail.set(r.email, m);
    }
    m.rows.push(r);
    const slotKey = `${r.branchKey}|${r.weekday}|${r.startTime}`;
    const wkKey = isoWeekKey(r.date);
    let wks = m.slotWeeks.get(slotKey);
    if (!wks) {
      wks = new Set();
      m.slotWeeks.set(slotKey, wks);
    }
    wks.add(wkKey);
  }
  return byEmail;
}

/**
 * Decide which slots are "fixed" for a member.
 * Rule: slot appears in ≥2 distinct weeks. Cap at classesPerWeek (if plan has one).
 * Prefer slots appearing in more weeks; break ties by earliest weekday then earliest time.
 */
export function inferFixedSlots(
  slotWeeks: Map<string, Set<string>>,
  classesPerWeek: number | null,
): {
  fixed: Array<{ branchKey: string; weekday: number; startTime: string }>;
  overflow: Array<{ branchKey: string; weekday: number; startTime: string }>;
} {
  const candidates = [...slotWeeks.entries()]
    .filter(([, wks]) => wks.size >= 2)
    .map(([k, wks]) => {
      const [branchKey, wdStr, startTime] = k.split("|");
      return {
        branchKey,
        weekday: Number(wdStr),
        startTime,
        weekCount: wks.size,
      };
    })
    .sort((a, b) => {
      if (b.weekCount !== a.weekCount) return b.weekCount - a.weekCount;
      if (a.weekday !== b.weekday) return a.weekday - b.weekday;
      return a.startTime.localeCompare(b.startTime);
    });

  if (classesPerWeek === null) {
    return {
      fixed: candidates.map(({ branchKey, weekday, startTime }) => ({
        branchKey,
        weekday,
        startTime,
      })),
      overflow: [],
    };
  }

  const fixed = candidates
    .slice(0, classesPerWeek)
    .map(({ branchKey, weekday, startTime }) => ({
      branchKey,
      weekday,
      startTime,
    }));
  const overflow = candidates
    .slice(classesPerWeek)
    .map(({ branchKey, weekday, startTime }) => ({
      branchKey,
      weekday,
      startTime,
    }));
  return { fixed, overflow };
}

// ─── Main ───────────────────────────────────────────────────────────────────

interface ImportReport {
  timestamp: string;
  mode: "dry-run" | "execute";
  summary: {
    totalRows: number;
    uniqueMembers: number;
    matched: number;
    skippedNoUser: number;
    skippedNoSubscription: number;
    fixedSlotsCreated: number;
    bookingsCreated: number;
    overCapMembers: number;
    missingScheduleSlots: number;
  };
  perMember: MemberOutcome[];
  dateRange: { min: string; max: string } | null;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dataDirIdx = args.indexOf("--data-dir");
  if (dataDirIdx === -1 || !args[dataDirIdx + 1]) {
    console.error(
      "Usage: pnpm tsx src/db/import-turnos.ts --data-dir /path/to/csvs [--execute]",
    );
    process.exit(1);
  }
  const dataDir = args[dataDirIdx + 1];
  const executeMode = args.includes("--execute");

  if (executeMode && process.env.NODE_ENV === "production") {
    if (process.env.CONFIRM_IMPORT !== "yes") {
      throw new Error(
        "SAFETY: Set CONFIRM_IMPORT=yes to run --execute in production.",
      );
    }
  }

  const dotenv = await import("dotenv");
  const envFile =
    process.env.NODE_ENV === "production"
      ? ".env.production"
      : ".env.development";
  dotenv.config({ path: path.resolve(process.cwd(), envFile) });
  dotenv.config({ path: path.resolve(process.cwd(), ".env") });

  const { createSingleConnection } = await import("./index.js");
  const { db, connection } = await createSingleConnection();

  try {
    console.log(`\nCSV Turnos Import`);
    console.log(`Mode: ${executeMode ? "EXECUTE" : "DRY-RUN"}`);
    console.log(`Data dir: ${dataDir}\n`);

    // ── Step 1: Parse CSVs ──
    const rows = parseAllTurnosCsvs(dataDir);
    const byMember = groupByMember(rows);

    const minDate = rows.reduce<string | null>(
      (acc, r) => (!acc || r.date < acc ? r.date : acc),
      null,
    );
    const maxDate = rows.reduce<string | null>(
      (acc, r) => (!acc || r.date > acc ? r.date : acc),
      null,
    );
    console.log(`Parsed ${rows.length} rows, ${byMember.size} unique members`);
    console.log(`Date range: ${minDate} → ${maxDate}\n`);

    // ── Step 2: Load DB reference data ──
    const dbBranches = await db
      .select({ id: branches.id, name: branches.name, code: branches.code })
      .from(branches);
    const branchKeyToId = new Map<string, number>();
    for (const b of dbBranches) {
      const suffix = stripAccents(b.name.split(" ").pop() ?? "").toLowerCase();
      branchKeyToId.set(suffix, b.id);
      branchKeyToId.set(b.code.toLowerCase(), b.id);
    }

    // Schedule lookup: (branchId, weekday, startTime) → scheduleId
    // (activity_id is already set on each schedule row; we don't need to join.)
    const allSchedules = await db
      .select({
        id: schedules.id,
        branchId: schedules.branchId,
        dayOfWeek: schedules.dayOfWeek,
        startTime: schedules.startTime,
        activityId: schedules.activityId,
      })
      .from(schedules)
      .where(eq(schedules.isActive, true));
    const scheduleLookup = new Map<string, number>();
    for (const s of allSchedules) {
      scheduleLookup.set(`${s.branchId}|${s.dayOfWeek}|${s.startTime}`, s.id);
    }

    // ── Step 3: Resolve each member → user → subscription → plan ──
    const allEmails = [...byMember.keys()];
    const dbUsers = allEmails.length
      ? await db
          .select({ id: users.id, email: users.email })
          .from(users)
          .where(inArray(users.email, allEmails))
      : [];
    const userByEmail = new Map<string, number>();
    for (const u of dbUsers) userByEmail.set(u.email.toLowerCase(), u.id);

    const userIds = dbUsers.map((u) => u.id);
    const today = new Date().toISOString().split("T")[0];
    const activeSubs = userIds.length
      ? await db
          .select({
            id: subscriptions.id,
            userId: subscriptions.userId,
            planId: subscriptions.planId,
            branchId: subscriptions.branchId,
            status: subscriptions.status,
            endDate: subscriptions.endDate,
          })
          .from(subscriptions)
          .where(
            and(
              inArray(subscriptions.userId, userIds),
              inArray(subscriptions.status, ["active", "paused"]),
            ),
          )
      : [];
    const subByUserId = new Map<number, (typeof activeSubs)[number]>();
    for (const s of activeSubs) {
      if (s.endDate && s.endDate < today) continue; // already expired
      const existing = subByUserId.get(s.userId);
      if (!existing) subByUserId.set(s.userId, s);
    }

    const planIds = [...new Set(activeSubs.map((s) => s.planId))];
    const plansById = new Map<
      number,
      {
        id: number;
        name: string;
        classesPerWeek: number | null;
        bookingMode: string;
      }
    >();
    if (planIds.length) {
      const dbPlans = await db
        .select({
          id: subscriptionPlans.id,
          name: subscriptionPlans.name,
          classesPerWeek: subscriptionPlans.classesPerWeek,
          bookingMode: subscriptionPlans.bookingMode,
        })
        .from(subscriptionPlans)
        .where(inArray(subscriptionPlans.id, planIds));
      for (const p of dbPlans) plansById.set(p.id, p);
    }

    // ── Step 4: Compute per-member outcomes ──
    const outcomes: MemberOutcome[] = [];
    for (const m of byMember.values()) {
      const outcome: MemberOutcome = {
        email: m.email,
        memberName: m.memberName,
        userId: null,
        subscriptionId: null,
        planName: null,
        classesPerWeek: null,
        fixedSlots: [],
        overflowSlots: [],
        bookingsCreated: 0,
        schedulesCreated: 0,
        skipReason: null,
        warnings: [],
      };

      const userId = userByEmail.get(m.email);
      if (!userId) {
        outcome.skipReason = "no_user";
        outcomes.push(outcome);
        continue;
      }
      outcome.userId = userId;

      const sub = subByUserId.get(userId);
      if (!sub) {
        outcome.skipReason = "no_active_subscription";
        outcomes.push(outcome);
        continue;
      }
      outcome.subscriptionId = sub.id;

      const plan = plansById.get(sub.planId);
      outcome.planName = plan?.name ?? null;
      outcome.classesPerWeek = plan?.classesPerWeek ?? null;

      const { fixed, overflow } = inferFixedSlots(
        m.slotWeeks,
        plan?.classesPerWeek ?? null,
      );
      outcome.fixedSlots = fixed;
      outcome.overflowSlots = overflow;

      outcomes.push(outcome);
    }

    // Aggregate counts
    const report: ImportReport = {
      timestamp: new Date().toISOString(),
      mode: executeMode ? "execute" : "dry-run",
      dateRange: minDate && maxDate ? { min: minDate, max: maxDate } : null,
      summary: {
        totalRows: rows.length,
        uniqueMembers: byMember.size,
        matched: outcomes.filter((o) => o.skipReason === null).length,
        skippedNoUser: outcomes.filter((o) => o.skipReason === "no_user")
          .length,
        skippedNoSubscription: outcomes.filter(
          (o) => o.skipReason === "no_active_subscription",
        ).length,
        fixedSlotsCreated: 0,
        bookingsCreated: 0,
        overCapMembers: outcomes.filter((o) => o.overflowSlots.length > 0)
          .length,
        missingScheduleSlots: 0,
      },
      perMember: outcomes,
    };

    console.log("--- Matching ---");
    console.log(`  Matched to active subscription: ${report.summary.matched}`);
    console.log(
      `  Skipped (no user in DB):        ${report.summary.skippedNoUser}`,
    );
    console.log(
      `  Skipped (no active sub):        ${report.summary.skippedNoSubscription}`,
    );
    console.log(
      `  Members over cap (overflow):    ${report.summary.overCapMembers}`,
    );

    // ── Step 5: Execute writes ──
    if (executeMode) {
      console.log("\n=== EXECUTING DATABASE IMPORT ===\n");

      const processedMemberIds: number[] = [];
      const processedSubIds: number[] = [];
      for (const o of outcomes) {
        if (o.skipReason) continue;
        if (o.userId) processedMemberIds.push(o.userId);
        if (o.subscriptionId) processedSubIds.push(o.subscriptionId);
      }

      // Wipe existing schedule + booking state for processed members in the date range
      if (processedSubIds.length) {
        await db
          .delete(subscriptionSchedules)
          .where(
            inArray(subscriptionSchedules.subscriptionId, processedSubIds),
          );
      }
      if (processedMemberIds.length && minDate && maxDate) {
        await db
          .delete(bookings)
          .where(
            and(
              inArray(bookings.memberId, processedMemberIds),
              gte(bookings.bookingDate, minDate),
              lte(bookings.bookingDate, maxDate),
            ),
          );
      }

      let fixedSlotsCreated = 0;
      let bookingsCreated = 0;
      let missingScheduleSlots = 0;

      for (const o of outcomes) {
        if (o.skipReason || !o.userId || !o.subscriptionId) continue;
        const member = byMember.get(o.email);
        if (!member) continue;

        // Insert subscription_schedules for fixed slots
        for (const slot of o.fixedSlots) {
          const branchId = branchKeyToId.get(slot.branchKey);
          if (!branchId) {
            o.warnings.push(`No DB branch for "${slot.branchKey}"`);
            continue;
          }
          const scheduleId = scheduleLookup.get(
            `${branchId}|${slot.weekday}|${slot.startTime}`,
          );
          if (!scheduleId) {
            missingScheduleSlots++;
            o.warnings.push(
              `No schedule row for ${slot.branchKey} day=${slot.weekday} time=${slot.startTime}`,
            );
            continue;
          }
          try {
            await db.insert(subscriptionSchedules).values({
              subscriptionId: o.subscriptionId,
              scheduleId,
            });
            o.schedulesCreated++;
            fixedSlotsCreated++;
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            if (!msg.includes("Duplicate")) throw err;
          }
        }

        // Insert bookings for every CSV row for this member
        for (const row of member.rows) {
          const branchId = branchKeyToId.get(row.branchKey);
          if (!branchId) continue;
          const scheduleId = scheduleLookup.get(
            `${branchId}|${row.weekday}|${row.startTime}`,
          );
          if (!scheduleId) {
            missingScheduleSlots++;
            o.warnings.push(
              `Skipped booking ${row.date} ${row.startTime}@${row.branchKey}: no schedule row`,
            );
            continue;
          }
          try {
            await db.insert(bookings).values({
              memberId: o.userId,
              scheduleId,
              bookingDate: row.date,
              status: "reservado",
            });
            o.bookingsCreated++;
            bookingsCreated++;
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            if (!msg.includes("Duplicate")) throw err;
          }
        }
      }

      report.summary.fixedSlotsCreated = fixedSlotsCreated;
      report.summary.bookingsCreated = bookingsCreated;
      report.summary.missingScheduleSlots = missingScheduleSlots;

      console.log("\n=== EXECUTION SUMMARY ===");
      console.log(`  Fixed schedule rows created: ${fixedSlotsCreated}`);
      console.log(`  Bookings created:            ${bookingsCreated}`);
      console.log(`  Missing schedule slot refs:  ${missingScheduleSlots}`);
    } else {
      // Dry-run: still compute projected counts so report is meaningful
      let projectedFixed = 0;
      let projectedBookings = 0;
      let projectedMissing = 0;
      for (const o of outcomes) {
        if (o.skipReason || !o.userId || !o.subscriptionId) continue;
        const member = byMember.get(o.email);
        if (!member) continue;
        for (const slot of o.fixedSlots) {
          const branchId = branchKeyToId.get(slot.branchKey);
          if (!branchId) continue;
          const scheduleId = scheduleLookup.get(
            `${branchId}|${slot.weekday}|${slot.startTime}`,
          );
          if (scheduleId) projectedFixed++;
          else projectedMissing++;
        }
        for (const row of member.rows) {
          const branchId = branchKeyToId.get(row.branchKey);
          if (!branchId) continue;
          const scheduleId = scheduleLookup.get(
            `${branchId}|${row.weekday}|${row.startTime}`,
          );
          if (scheduleId) projectedBookings++;
          else projectedMissing++;
        }
      }
      report.summary.fixedSlotsCreated = projectedFixed;
      report.summary.bookingsCreated = projectedBookings;
      report.summary.missingScheduleSlots = projectedMissing;

      console.log("\n--- Projected (dry-run) ---");
      console.log(`  Fixed schedule rows to create: ${projectedFixed}`);
      console.log(`  Bookings to create:            ${projectedBookings}`);
      console.log(`  Missing schedule slot refs:    ${projectedMissing}`);
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const reportPath = path.join(
      dataDir,
      `import-turnos-report-${timestamp}.json`,
    );
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\nReport: ${reportPath}`);
    console.log("=".repeat(50));
    console.log(
      executeMode ? "TURNOS IMPORT COMPLETE" : "TURNOS DRY-RUN COMPLETE",
    );
    console.log("=".repeat(50));
  } finally {
    await connection.end();
  }
}

// Silence unused-import warnings for helpers used only via sql template
void sql;

if (typeof require !== "undefined" && require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Import failed:", msg);
      process.exit(1);
    });
}

export { main };
