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

// ─── Stub implementations (to be filled in GREEN phase) ─────────────────────

export function parseCsvRow(
  _row: Record<string, string>,
  _branchName: string,
): ParsedMember | null {
  throw new Error("Not implemented");
}

export function resolveDuplicates(_members: ParsedMember[]): ResolvedMember[] {
  throw new Error("Not implemented");
}

export function mapPlanName(
  _csvPlanName: string,
  _existingPlans: { id: number; name: string }[],
): PlanMapping {
  throw new Error("Not implemented");
}

export function parseAllCsvs(_dataDir: string): {
  members: ParsedMember[];
  branchMap: Map<string, string>;
} {
  throw new Error("Not implemented");
}
