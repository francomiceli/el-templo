/**
 * CSV Member Import Script
 *
 * Processes 5 branch CSV files, resolves cross-branch duplicates,
 * creates legacy plans as archived records, and upserts all member data.
 *
 * Usage:
 *   pnpm tsx src/db/import-members.ts --data-dir /path/to/csvs [--execute]
 *
 * Pure functions are exported for unit testing.
 */

import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { eq, and } from "drizzle-orm";
import { users } from "./schema/users.js";
import { branches } from "./schema/branches.js";
import { subscriptionPlans } from "./schema/subscription-plans.js";
import { subscriptions } from "./schema/subscriptions.js";
import { memberNotes } from "./schema/member-notes.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ParsedMember {
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  dni: string;
  documentType: string;
  address: string | null;
  dateOfBirth: string | null; // YYYY-MM-DD
  gender: "male" | "female" | null;
  isActive: boolean;
  branchName: string;
  observaciones: string | null;
  creadorLegajo: string | null;
  planName: string | null; // "Ultimo servicio/membresia vigente"
  vencimiento: string | null; // YYYY-MM-DD
  fechaIngreso: string | null; // YYYY-MM-DD
}

export interface ResolvedMember extends ParsedMember {
  mergedFrom?: string[]; // branch names if merged from duplicates
}

interface PlanMapping {
  planId: number | null;
  isLegacy: boolean;
  normalizedName: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Trim a string, return null if empty after trimming */
function trimOrNull(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Parse DD/MM/YYYY (or D/M/YYYY) to YYYY-MM-DD.
 * Returns null for blank/invalid input.
 */
function parseDateDMY(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;

  const parts = trimmed.split("/");
  if (parts.length !== 3) return null;

  const day = parts[0].padStart(2, "0");
  const month = parts[1].padStart(2, "0");
  const year = parts[2];

  if (!year || !month || !day) return null;
  return `${year}-${month}-${day}`;
}

/**
 * Strip accents from a string for comparison.
 * e.g., "Sesion" matches "Sesión"
 */
function stripAccents(str: string): string {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// ─── CSV column name constants ──────────────────────────────────────────────
// Column names in the CSV files (with accents as they appear in the actual files)

const COL_APELLIDO = "Apellido";
const COL_NOMBRE = "Nombre";
const COL_EMAIL = "Email";
const COL_TELEFONO = "Tel\u00e9fono"; // Teléfono
const COL_CELULAR = "Celular";
const COL_ACTIVO = "Activo";
const COL_TIPO_DOC = "Tipo de documento";
const COL_NUM_DOC = "N\u00famero de documento"; // Número de documento
const COL_FECHA_NAC = "Fecha de nacimiento";
const COL_SEXO = "Sexo";
const COL_DOMICILIO = "Domicilio";
const COL_OBSERVACIONES = "Observaciones";
const COL_PLAN = "\u00daltimo servicio/membres\u00eda vigente"; // Último servicio/membresía vigente
const COL_VENCIMIENTO = "Vencimiento";
const COL_FECHA_INGRESO = "Fecha de ingreso";
const COL_CREADOR = "Creador del legajo";

// ─── Pure Functions ─────────────────────────────────────────────────────────

/**
 * Parse a single CSV row into a ParsedMember, or null if it should be skipped.
 * Skips rows with blank email.
 */
export function parseCsvRow(
  row: Record<string, string>,
  branchName: string,
): ParsedMember | null {
  const email = trimOrNull(row[COL_EMAIL] ?? row["Email"]);
  if (!email) return null;

  const sexo = (row[COL_SEXO] ?? row["Sexo"] ?? "").trim();
  let gender: "male" | "female" | null = null;
  if (sexo === "Masculino") gender = "male";
  else if (sexo === "Femenino") gender = "female";

  const activo = (row[COL_ACTIVO] ?? row["Activo"] ?? "").trim();
  const isActive = activo === "Si";

  const celular = trimOrNull(row[COL_CELULAR] ?? row["Celular"]);

  const tipoDocRaw = trimOrNull(row[COL_TIPO_DOC] ?? row["Tipo de documento"]);
  const VALID_DOC_TYPES = ["DNI", "Pasaporte", "NIE", "NIF", "Otro"];
  const DOC_TYPE_MAP: Record<string, string> = {
    CDI: "Otro",
    "CI Extranjera": "Otro",
    CUIL: "Otro",
  };
  const tipoDoc =
    tipoDocRaw && VALID_DOC_TYPES.includes(tipoDocRaw)
      ? tipoDocRaw
      : tipoDocRaw && DOC_TYPE_MAP[tipoDocRaw]
        ? DOC_TYPE_MAP[tipoDocRaw]
        : "DNI";

  return {
    email,
    firstName: (row[COL_NOMBRE] ?? row["Nombre"] ?? "").trim(),
    lastName: (row[COL_APELLIDO] ?? row["Apellido"] ?? "").trim(),
    phone: celular,
    dni: (row[COL_NUM_DOC] ?? row["N\u00famero de documento"] ?? "").trim(),
    documentType: tipoDoc,
    address: trimOrNull(row[COL_DOMICILIO] ?? row["Domicilio"]),
    dateOfBirth: parseDateDMY(row[COL_FECHA_NAC] ?? row["Fecha de nacimiento"]),
    gender,
    isActive,
    branchName,
    observaciones: trimOrNull(row[COL_OBSERVACIONES] ?? row["Observaciones"]),
    creadorLegajo: trimOrNull(row[COL_CREADOR] ?? row["Creador del legajo"]),
    planName: trimOrNull(
      row[COL_PLAN] ?? row["\u00daltimo servicio/membres\u00eda vigente"],
    ),
    vencimiento: parseDateDMY(row[COL_VENCIMIENTO] ?? row["Vencimiento"]),
    fechaIngreso: parseDateDMY(
      row[COL_FECHA_INGRESO] ?? row["Fecha de ingreso"],
    ),
  };
}

/**
 * Resolve cross-branch duplicates (same DNI).
 * Active-branch-wins logic, with data merging.
 */
export function resolveDuplicates(members: ParsedMember[]): ResolvedMember[] {
  // Group by DNI (normalized: trim, lowercase)
  const groups = new Map<string, ParsedMember[]>();
  for (const m of members) {
    const key = m.dni.trim().toLowerCase();
    const group = groups.get(key);
    if (group) {
      group.push(m);
    } else {
      groups.set(key, [m]);
    }
  }

  const resolved: ResolvedMember[] = [];

  for (const group of groups.values()) {
    if (group.length === 1) {
      // No duplicate -- pass through
      resolved.push({ ...group[0] });
      continue;
    }

    // Pick the "primary" record using active-branch-wins logic
    const sorted = [...group].sort((a, b) => {
      // Active wins over inactive
      if (a.isActive && !b.isActive) return -1;
      if (!a.isActive && b.isActive) return 1;

      // Same active status: most recent fechaIngreso wins
      const dateA = a.fechaIngreso ?? "0000-00-00";
      const dateB = b.fechaIngreso ?? "0000-00-00";
      return dateB.localeCompare(dateA); // descending
    });

    const primary = sorted[0];

    // Merge data from all records: prefer non-blank, prefer primary (active/recent) version
    const merged: ResolvedMember = { ...primary };

    for (let i = 1; i < sorted.length; i++) {
      const other = sorted[i];
      // For nullable string fields, fill in blanks from other records
      if (!merged.phone && other.phone) merged.phone = other.phone;
      if (!merged.address && other.address) merged.address = other.address;
      if (!merged.dateOfBirth && other.dateOfBirth)
        merged.dateOfBirth = other.dateOfBirth;
      if (!merged.gender && other.gender) merged.gender = other.gender;
      if (!merged.planName && other.planName) merged.planName = other.planName;
      if (!merged.vencimiento && other.vencimiento)
        merged.vencimiento = other.vencimiento;
      if (!merged.fechaIngreso && other.fechaIngreso)
        merged.fechaIngreso = other.fechaIngreso;
    }

    // Combine Observaciones from all branches with branch prefix
    const obsEntries: string[] = [];
    for (const m of group) {
      if (m.observaciones) {
        obsEntries.push(`[${m.branchName}] ${m.observaciones}`);
      }
    }
    merged.observaciones = obsEntries.length > 0 ? obsEntries.join("\n") : null;

    // Combine Creador del legajo from all branches
    const creadorEntries: string[] = [];
    for (const m of group) {
      if (m.creadorLegajo) {
        creadorEntries.push(`[${m.branchName}] ${m.creadorLegajo}`);
      }
    }
    merged.creadorLegajo =
      creadorEntries.length > 0 ? creadorEntries.join("\n") : null;

    merged.mergedFrom = group.map((m) => m.branchName);
    resolved.push(merged);
  }

  return resolved;
}

/**
 * Map a CSV plan name to an existing plan or flag it as legacy.
 */
export function mapPlanName(
  csvPlanName: string,
  existingPlans: { id: number; name: string }[],
): PlanMapping {
  const normalizedName = csvPlanName.trim().toUpperCase();

  // Normalize for matching: strip accents for accent-insensitive comparison
  const normalizedForMatch = stripAccents(normalizedName);

  // Handle PLUS / + variants: "FLEX PLUS" should match "Flex+"
  const withPlusNormalized = normalizedForMatch.replace(/\s+PLUS$/i, "+");

  for (const plan of existingPlans) {
    const planNormalized = stripAccents(plan.name.trim().toUpperCase());

    // Direct match
    if (normalizedForMatch === planNormalized) {
      return { planId: plan.id, isLegacy: false, normalizedName };
    }

    // PLUS -> + variant match
    if (withPlusNormalized === planNormalized) {
      return { planId: plan.id, isLegacy: false, normalizedName };
    }

    // Also try the reverse: plan name with + expanded to PLUS
    const planWithPlusExpanded = planNormalized.replace(/\+$/, " PLUS");
    if (normalizedForMatch === planWithPlusExpanded) {
      return { planId: plan.id, isLegacy: false, normalizedName };
    }
  }

  // No match found -- this is a legacy plan
  return { planId: null, isLegacy: true, normalizedName };
}

/**
 * Parse all CSV files in a directory matching the "alumnos branch *.csv" pattern.
 * Handles CSVs with leading blank rows (finds the header row dynamically).
 */
export function parseAllCsvs(dataDir: string): {
  members: ParsedMember[];
  branchMap: Map<string, string>;
} {
  const files = fs.readdirSync(dataDir).filter((f) => {
    const lower = f.toLowerCase();
    return lower.startsWith("alumnos branch") && lower.endsWith(".csv");
  });

  const branchMap = new Map<string, string>();
  const allMembers: ParsedMember[] = [];

  // Known header field to detect the header row
  const HEADER_MARKER = "Apellido";

  for (const file of files) {
    // Extract branch name from filename: "alumnos branch alem.csv" -> "alem"
    const match = file.match(/alumnos branch (.+)\.csv/i);
    if (!match) continue;
    const branchKey = match[1].toLowerCase();

    // Capitalize first letter for branch name: "alem" -> "Alem"
    const branchName = branchKey.charAt(0).toUpperCase() + branchKey.slice(1);
    branchMap.set(branchKey, branchName);

    const filePath = path.join(dataDir, file);
    const rawContent = fs.readFileSync(filePath, "utf-8");

    // Find the header row -- some CSVs have leading blank rows
    const lines = rawContent.split("\n");
    let headerLineIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(HEADER_MARKER)) {
        headerLineIndex = i;
        break;
      }
    }

    if (headerLineIndex === -1) {
      // No header found, skip file
      continue;
    }

    // Rebuild content from header row onward
    const contentFromHeader = lines.slice(headerLineIndex).join("\n");

    const records: Record<string, string>[] = parse(contentFromHeader, {
      columns: true,
      skip_empty_lines: false, // We handle blank rows ourselves
      relax_column_count: true,
      trim: false, // We trim in parseCsvRow
    });

    for (const record of records) {
      // Skip completely blank rows (all values empty)
      const values = Object.values(record);
      if (values.every((v) => !v || v.trim() === "")) continue;

      const member = parseCsvRow(record, branchName);
      if (member) {
        allMembers.push(member);
      }
    }
  }

  return { members: allMembers, branchMap };
}

// ─── Database Import (main) ─────────────────────────────────────────────────

interface ImportReport {
  timestamp: string;
  mode: "dry-run" | "execute";
  summary: {
    perBranch: Record<
      string,
      { totalRows: number; validRows: number; skippedRows: number }
    >;
    totalParsed: number;
    duplicatesResolved: number;
    uniqueMembers: number;
    currentPlanMatches: number;
    legacyPlanMatches: number;
    noPlanMembers: number;
    legacyPlanNames: string[];
  };
  members: Array<{
    email: string;
    dni: string;
    branchName: string;
    action: "create" | "update" | "unchanged";
    planMatch: string | null;
    isLegacy: boolean;
    mergedFrom?: string[];
  }>;
  orphans: string[];
  execution?: {
    usersCreated: number;
    usersUpdated: number;
    usersUnchanged: number;
    legacyPlansCreated: number;
    notesCreated: number;
    subscriptionsCreated: number;
  };
}

/**
 * Main import function. Reads CSVs, resolves duplicates, and either
 * prints a dry-run summary or writes to the database.
 */
async function main(): Promise<void> {
  // ── Parse CLI args ──────────────────────────────────────────────
  const args = process.argv.slice(2);
  const dataDirIdx = args.indexOf("--data-dir");
  if (dataDirIdx === -1 || !args[dataDirIdx + 1]) {
    console.error(
      "Usage: pnpm tsx src/db/import-members.ts --data-dir /path/to/csvs [--execute]",
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
    console.log(`\nCSV Member Import`);
    console.log(`Mode: ${executeMode ? "EXECUTE" : "DRY-RUN"}`);
    console.log(`Data dir: ${dataDir}\n`);

    // ── Step 1: Load branch mapping from DB ─────────────────────
    const dbBranches = await db
      .select({ id: branches.id, name: branches.name, code: branches.code })
      .from(branches);

    // Build branch name -> branchId lookup
    // CSV branch names map to DB: "Alem" -> "El Templo Alem", etc.
    // Use accent-insensitive matching (DB may have "Constitucion" with accent)
    const branchIdLookup = new Map<string, number>();
    for (const b of dbBranches) {
      // Match by suffix: "El Templo Alem" contains "Alem"
      const parts = b.name.split(" ");
      const suffix = parts[parts.length - 1];
      branchIdLookup.set(stripAccents(suffix).toLowerCase(), b.id);
      // Also match by code
      branchIdLookup.set(b.code.toLowerCase(), b.id);
    }

    // ── Step 2: Parse all CSVs ──────────────────────────────────
    const { members: allMembers, branchMap } = parseAllCsvs(dataDir);

    // Validate all CSV branch names map to DB branches
    const perBranch: Record<
      string,
      { totalRows: number; validRows: number; skippedRows: number }
    > = {};

    // Count per-branch stats from raw CSVs (re-parse for stats)
    for (const [branchKey, branchName] of branchMap.entries()) {
      const branchMembers = allMembers.filter(
        (m) => m.branchName === branchName,
      );
      const branchId = branchIdLookup.get(branchKey);
      if (!branchId) {
        console.error(
          `WARNING: Branch "${branchName}" (key: ${branchKey}) not found in database!`,
        );
      }

      // Count raw rows from file for reporting
      const filePath = path.join(dataDir, `alumnos branch ${branchKey}.csv`);
      let rawRowCount = 0;
      if (fs.existsSync(filePath)) {
        const rawContent = fs.readFileSync(filePath, "utf-8");
        const lines = rawContent.split("\n");
        const headerIdx = lines.findIndex((l) => l.includes("Apellido"));
        if (headerIdx >= 0) {
          // Count non-empty lines after header
          rawRowCount = lines
            .slice(headerIdx + 1)
            .filter(
              (l) =>
                l.trim() !== "" && !l.split(",").every((c) => c.trim() === ""),
            ).length;
        }
      }

      perBranch[branchName] = {
        totalRows: rawRowCount,
        validRows: branchMembers.length,
        skippedRows: rawRowCount - branchMembers.length,
      };
    }

    console.log("--- Per Branch ---");
    for (const [name, stats] of Object.entries(perBranch)) {
      console.log(
        `  ${name}: ${stats.totalRows} total, ${stats.validRows} valid, ${stats.skippedRows} skipped`,
      );
    }

    // ── Step 3: Resolve duplicates ──────────────────────────────
    const resolved = resolveDuplicates(allMembers);
    const duplicateCount = allMembers.length - resolved.length;

    console.log(
      `\n--- Duplicates: ${duplicateCount} cross-branch duplicates resolved ---`,
    );
    console.log(
      `  ${allMembers.length} parsed -> ${resolved.length} unique members`,
    );

    // ── Step 4: Load existing plans and map ─────────────────────
    const dbPlans: Array<{ id: number; name: string; isArchived: boolean }> =
      await db
        .select({
          id: subscriptionPlans.id,
          name: subscriptionPlans.name,
          isArchived: subscriptionPlans.isArchived,
        })
        .from(subscriptionPlans);

    const planMappings = new Map<
      string,
      { planId: number | null; isLegacy: boolean; normalizedName: string }
    >();
    let currentPlanMatches = 0;
    let legacyPlanMatches = 0;
    let noPlanMembers = 0;

    for (const m of resolved) {
      if (!m.planName) {
        noPlanMembers++;
        continue;
      }

      if (!planMappings.has(m.planName)) {
        const mapping = mapPlanName(m.planName, dbPlans);
        planMappings.set(m.planName, mapping);
      }

      const mapping = planMappings.get(m.planName)!;
      if (mapping.isLegacy) {
        legacyPlanMatches++;
      } else {
        currentPlanMatches++;
      }
    }

    // Collect unique legacy plan names
    const legacyPlanNames = [...planMappings.entries()]
      .filter(([, mapping]) => mapping.isLegacy)
      .map(([, mapping]) => mapping.normalizedName)
      .filter((name, idx, arr) => arr.indexOf(name) === idx);

    console.log("\n--- Plan Mapping ---");
    console.log(`  Current plan matches: ${currentPlanMatches}`);
    console.log(`  Legacy plan matches: ${legacyPlanMatches}`);
    console.log(`  No plan: ${noPlanMembers}`);
    console.log(`  Unique legacy plan names (${legacyPlanNames.length}):`);
    for (const name of legacyPlanNames) {
      console.log(`    - ${name}`);
    }

    // ── Step 5: Check existing users (for orphan detection and create/update) ──
    const existingUsers: Array<{
      id: number;
      email: string;
      dni: string | null;
      role: string;
    }> = await db
      .select({
        id: users.id,
        email: users.email,
        dni: users.dni,
        role: users.role,
      })
      .from(users);

    const existingByDni = new Map<string, { id: number; email: string }>();
    const existingByEmail = new Map<
      string,
      { id: number; dni: string | null }
    >();
    for (const u of existingUsers) {
      if (u.dni)
        existingByDni.set(u.dni.trim().toLowerCase(), {
          id: u.id,
          email: u.email,
        });
      existingByEmail.set(u.email.trim().toLowerCase(), {
        id: u.id,
        dni: u.dni,
      });
    }

    // Determine create vs update for each resolved member
    const memberActions: Array<{
      member: ResolvedMember;
      action: "create" | "update" | "unchanged";
      existingUserId?: number;
    }> = [];

    for (const m of resolved) {
      const dniKey = m.dni.trim().toLowerCase();
      const emailKey = m.email.trim().toLowerCase();

      const byDni = existingByDni.get(dniKey);
      const byEmail = existingByEmail.get(emailKey);

      if (byDni) {
        memberActions.push({
          member: m,
          action: "update",
          existingUserId: byDni.id,
        });
      } else if (byEmail) {
        memberActions.push({
          member: m,
          action: "update",
          existingUserId: byEmail.id,
        });
      } else {
        memberActions.push({ member: m, action: "create" });
      }
    }

    // Detect orphan members (existing DB users not in any CSV)
    const resolvedDnis = new Set(
      resolved.map((m) => m.dni.trim().toLowerCase()),
    );
    const orphanUsers = existingUsers.filter(
      (u) =>
        u.role === "member" &&
        u.dni &&
        !resolvedDnis.has(u.dni.trim().toLowerCase()),
    );

    const createCount = memberActions.filter(
      (a) => a.action === "create",
    ).length;
    const updateCount = memberActions.filter(
      (a) => a.action === "update",
    ).length;

    console.log("\n--- Import Actions ---");
    console.log(`  Members to create: ${createCount}`);
    console.log(`  Members to update: ${updateCount}`);
    console.log(`  Orphan members (in DB, not in CSV): ${orphanUsers.length}`);
    console.log(
      `  Subscriptions to create: ${resolved.filter((m) => m.planName).length}`,
    );
    console.log(
      `  Notes to create: ${resolved.filter((m) => m.observaciones || m.creadorLegajo).length}`,
    );

    // Build the report
    const report: ImportReport = {
      timestamp: new Date().toISOString(),
      mode: executeMode ? "execute" : "dry-run",
      summary: {
        perBranch,
        totalParsed: allMembers.length,
        duplicatesResolved: duplicateCount,
        uniqueMembers: resolved.length,
        currentPlanMatches,
        legacyPlanMatches,
        noPlanMembers,
        legacyPlanNames,
      },
      members: memberActions.map((a) => ({
        email: a.member.email,
        dni: a.member.dni,
        branchName: a.member.branchName,
        action: a.action,
        planMatch: a.member.planName,
        isLegacy: a.member.planName
          ? (planMappings.get(a.member.planName)?.isLegacy ?? false)
          : false,
        mergedFrom: a.member.mergedFrom,
      })),
      orphans: orphanUsers.map((u) => u.email),
    };

    // ── Execute mode: write to DB ───────────────────────────────
    if (executeMode) {
      console.log("\n=== EXECUTING DATABASE IMPORT ===\n");

      const argon2 = await import("argon2");

      // Hash temp password once
      const tempPasswordHash = await argon2.hash("eltemplo2026");
      console.log("Temp password hashed.");

      // 1. Create archived legacy plans
      let legacyPlansCreated = 0;
      const legacyPlanIdMap = new Map<string, number>(); // normalizedName -> planId

      for (const legacyName of legacyPlanNames) {
        // Check if it already exists (case-insensitive)
        const existing = dbPlans.find(
          (p) => p.name.toUpperCase() === legacyName,
        );
        if (existing) {
          legacyPlanIdMap.set(legacyName, existing.id);
          continue;
        }

        const [result] = await db
          .insert(subscriptionPlans)
          .values({
            name: legacyName,
            planTier: "other",
            bookingMode: "flexible",
            priceRegular: 0,
            priceZero: 0,
            durationDays: 30,
            isActive: false,
            isArchived: true,
          })
          .$returningId();

        legacyPlanIdMap.set(legacyName, result.id);
        legacyPlansCreated++;
      }
      console.log(`Legacy plans created: ${legacyPlansCreated}`);

      // Rebuild full plan lookup (including newly created legacy plans)
      const allPlans: Array<{ id: number; name: string }> = await db
        .select({ id: subscriptionPlans.id, name: subscriptionPlans.name })
        .from(subscriptionPlans);

      // 2. Find superadmin for note authorId
      const [superadmin] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.role, "superadmin"))
        .limit(1);
      const noteAuthorId = superadmin?.id ?? 1;

      // 3. UPSERT members
      let usersCreated = 0;
      let usersUpdated = 0;
      let usersUnchanged = 0;
      let notesCreated = 0;
      let subscriptionsCreated = 0;

      for (const action of memberActions) {
        const m = action.member;
        const branchKey = m.branchName.toLowerCase();
        const branchId = branchIdLookup.get(branchKey);

        if (!branchId) {
          console.error(
            `  Skipping ${m.email}: no branch mapping for "${m.branchName}"`,
          );
          continue;
        }

        let userId: number;

        if (action.action === "create") {
          // INSERT new user
          const insertValues: Record<string, unknown> = {
            email: m.email,
            passwordHash: tempPasswordHash,
            firstName: m.firstName || null,
            lastName: m.lastName || null,
            role: "member",
            branchId,
            level: "alfa",
            phone: m.phone,
            dni: m.dni,
            documentType: m.documentType,
            address: m.address,
            dateOfBirth: m.dateOfBirth,
            gender: m.gender,
            isActive: m.isActive,
          };

          // Use fechaIngreso as createdAt if available
          if (m.fechaIngreso) {
            insertValues.createdAt = new Date(m.fechaIngreso + "T00:00:00");
          }

          const [result] = await db
            .insert(users)
            .values(insertValues as typeof users.$inferInsert)
            .$returningId();

          userId = result.id;
          usersCreated++;
        } else if (action.existingUserId) {
          // UPDATE existing user (merge: don't overwrite existing non-null with null)
          userId = action.existingUserId;

          const updateFields: Record<string, unknown> = {};
          if (m.firstName) updateFields.firstName = m.firstName;
          if (m.lastName) updateFields.lastName = m.lastName;
          if (m.phone) updateFields.phone = m.phone;
          if (m.documentType) updateFields.documentType = m.documentType;
          if (m.address) updateFields.address = m.address;
          if (m.dateOfBirth) updateFields.dateOfBirth = m.dateOfBirth;
          if (m.gender) updateFields.gender = m.gender;
          // Always update branchId and isActive from CSV
          updateFields.branchId = branchId;
          updateFields.isActive = m.isActive;

          if (Object.keys(updateFields).length > 0) {
            await db
              .update(users)
              .set(updateFields)
              .where(eq(users.id, userId));
            usersUpdated++;
          } else {
            usersUnchanged++;
          }
        } else {
          continue;
        }

        // 4. Create member_notes for Observaciones
        if (m.observaciones) {
          // Check if note already exists (idempotent)
          const existingNote = await db
            .select({ id: memberNotes.id })
            .from(memberNotes)
            .where(
              and(
                eq(memberNotes.userId, userId),
                eq(memberNotes.content, m.observaciones),
              ),
            )
            .limit(1);

          if (existingNote.length === 0) {
            await db.insert(memberNotes).values({
              userId,
              authorId: noteAuthorId,
              content: m.observaciones,
            });
            notesCreated++;
          }
        }

        // Create note for Creador del legajo
        if (m.creadorLegajo) {
          const creadorContent = `Creador del legajo: ${m.creadorLegajo}`;
          const existingCreadorNote = await db
            .select({ id: memberNotes.id })
            .from(memberNotes)
            .where(
              and(
                eq(memberNotes.userId, userId),
                eq(memberNotes.content, creadorContent),
              ),
            )
            .limit(1);

          if (existingCreadorNote.length === 0) {
            await db.insert(memberNotes).values({
              userId,
              authorId: noteAuthorId,
              content: creadorContent,
            });
            notesCreated++;
          }
        }

        // 5. Create subscriptions for members with plan names
        if (m.planName) {
          const mapping = planMappings.get(m.planName);
          let planId: number | null = null;

          if (mapping && !mapping.isLegacy) {
            planId = mapping.planId;
          } else if (mapping?.isLegacy) {
            // Look up from legacy plan map or all plans
            planId = legacyPlanIdMap.get(mapping.normalizedName) ?? null;
            if (!planId) {
              // Try matching from allPlans
              const match = allPlans.find(
                (p) => p.name.toUpperCase() === mapping.normalizedName,
              );
              if (match) planId = match.id;
            }
          }

          if (planId) {
            // Determine subscription status
            let status: "active" | "expired" | "cancelled" = "cancelled";
            if (m.isActive && m.vencimiento) {
              const today = new Date().toISOString().split("T")[0];
              status = m.vencimiento >= today ? "active" : "expired";
            } else if (m.isActive) {
              status = "active";
            }

            // Check if subscription already exists (idempotent)
            const existingSub = await db
              .select({ id: subscriptions.id })
              .from(subscriptions)
              .where(
                and(
                  eq(subscriptions.userId, userId),
                  eq(subscriptions.planId, planId),
                ),
              )
              .limit(1);

            if (existingSub.length === 0) {
              const startDate =
                m.fechaIngreso ?? new Date().toISOString().split("T")[0];

              await db.insert(subscriptions).values({
                userId,
                planId,
                branchId,
                status,
                startDate,
                endDate: m.vencimiento,
                pricePaid: 0,
                priceTypeApplied: "regular",
                notes: "Importado desde CSV",
              });
              subscriptionsCreated++;
            }
          }
        }
      }

      report.execution = {
        usersCreated,
        usersUpdated,
        usersUnchanged,
        legacyPlansCreated,
        notesCreated,
        subscriptionsCreated,
      };

      console.log("\n=== EXECUTION SUMMARY ===");
      console.log(`  Users created: ${usersCreated}`);
      console.log(`  Users updated: ${usersUpdated}`);
      console.log(`  Users unchanged: ${usersUnchanged}`);
      console.log(`  Legacy plans created: ${legacyPlansCreated}`);
      console.log(`  Notes created: ${notesCreated}`);
      console.log(`  Subscriptions created: ${subscriptionsCreated}`);
    }

    // ── Write JSON report ─────────────────────────────────────────
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const reportPath = path.join(dataDir, `import-report-${timestamp}.json`);
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

if (typeof require !== "undefined" && require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error("Import failed:", message);
      process.exit(1);
    });
}

export { main };
