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

  const tipoDoc = trimOrNull(row[COL_TIPO_DOC] ?? row["Tipo de documento"]);

  return {
    email,
    firstName: (row[COL_NOMBRE] ?? row["Nombre"] ?? "").trim(),
    lastName: (row[COL_APELLIDO] ?? row["Apellido"] ?? "").trim(),
    phone: celular,
    dni: (row[COL_NUM_DOC] ?? row["N\u00famero de documento"] ?? "").trim(),
    documentType: tipoDoc || "DNI",
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
