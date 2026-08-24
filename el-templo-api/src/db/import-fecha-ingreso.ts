/**
 * Import Fecha de Ingreso (member join dates) — Task 3.
 *
 * Parses all CSVs in a given data directory (expected pattern
 * "Socios segun fecha de ingreso *.csv"), collects the earliest
 * fecha de ingreso per email, and overwrites users.created_at with
 * that date. The CSV is treated as the source of truth (policy A).
 *
 * Files are semicolon-delimited, latin-1 encoded, with a leading
 * blank line before the header row:
 *   Socio;Email;Telefono;Celular;Domicilio;Fecha de ingreso
 *
 * Members whose email doesn't match a DB user are skipped + logged.
 *
 * `--tenant=<id>` es OBLIGATORIO (fase 169 D-06, retrofit fase 173 D-03): este
 * script escribe `users.created_at` en batch sin request y sin JWT, así que el
 * gimnasio sólo puede venir del flag — se valida ANTES incluso de mirar
 * `--data-dir`, así que falta cualquiera de los dos corta con exit 2 y sin
 * tocar la base.
 *
 * Usage:
 *   pnpm tsx src/db/import-fecha-ingreso.ts --tenant=<id> --data-dir /path [--execute]
 */

import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { and, eq, inArray } from "drizzle-orm";
import { users } from "./schema/users.js";
import {
  failTenantArg,
  queryFnFromConnection,
  requireTenant,
} from "./scripts/require-tenant.js";
import { tenantWhere } from "../modules/shared/tenant.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Parse DD/MM/YYYY → YYYY-MM-DD. Returns null on malformed input. */
function parseDateDMY(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed.includes("/")) return null;
  const parts = trimmed.split("/");
  if (parts.length !== 3) return null;
  const [d, m, y] = parts;
  if (!d || !m || !y || y.length !== 4) return null;
  const iso = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  // Reject obviously bogus dates (year < 2000 or > current+1)
  const year = Number(y);
  if (year < 2000 || year > new Date().getFullYear() + 1) return null;
  return iso;
}

/**
 * Repair mojibake: some fields in these POS CSVs are UTF-8 bytes
 * mis-stored as Latin-1. Same logic as import-turnos.
 */
function repairMojibake(s: string): string {
  if (!s) return s;
  if (!/[ÃÂ]/.test(s)) return s;
  try {
    const repaired = Buffer.from(s, "latin1").toString("utf8");
    if (/[ÃÂ]/.test(repaired)) return s;
    return repaired;
  } catch {
    return s;
  }
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ParsedIngreso {
  email: string;
  memberName: string;
  fechaIngreso: string; // YYYY-MM-DD
  sourceFile: string;
}

// ─── Pure parsing ───────────────────────────────────────────────────────────

export function parseIngresoCsv(
  content: string,
  sourceFile: string,
): ParsedIngreso[] {
  // The files have a leading empty row with just ";;;;;" before the header.
  // Strip lines until we find the header marker "Socio;Email".
  const lines = content.split(/\r?\n/);
  const headerIdx = lines.findIndex((l) => l.startsWith("Socio;Email"));
  if (headerIdx === -1) return [];

  const fromHeader = lines.slice(headerIdx).join("\n");
  const records: Array<Record<string, string>> = parse(fromHeader, {
    columns: true,
    delimiter: ";",
    skip_empty_lines: true,
    relax_column_count: true,
    trim: false,
  });

  const out: ParsedIngreso[] = [];
  for (const r of records) {
    const email = repairMojibake((r["Email"] ?? "").trim()).toLowerCase();
    if (!email) continue;
    const fechaIngreso = parseDateDMY(r["Fecha de ingreso"] ?? "");
    if (!fechaIngreso) continue;
    out.push({
      email,
      memberName: repairMojibake((r["Socio"] ?? "").trim()),
      fechaIngreso,
      sourceFile,
    });
  }
  return out;
}

export function parseAllIngresoCsvs(dataDir: string): ParsedIngreso[] {
  const files = fs.readdirSync(dataDir).filter((f) => {
    const lower = f.toLowerCase();
    return (
      lower.startsWith("socios segun fecha de ingreso") &&
      lower.endsWith(".csv")
    );
  });
  const all: ParsedIngreso[] = [];
  for (const file of files) {
    const content = fs.readFileSync(path.join(dataDir, file), "latin1");
    const parsed = parseIngresoCsv(content, file);
    all.push(...parsed);
  }
  return all;
}

/**
 * Dedupe: one entry per email, take earliest fecha de ingreso.
 * Returns sorted by email for stable reports.
 */
export function dedupeByEmailEarliest(
  rows: ParsedIngreso[],
): Map<string, ParsedIngreso> {
  const out = new Map<string, ParsedIngreso>();
  for (const r of rows) {
    const existing = out.get(r.email);
    if (!existing || r.fechaIngreso < existing.fechaIngreso) {
      out.set(r.email, r);
    }
  }
  return out;
}

// ─── Main ───────────────────────────────────────────────────────────────────

interface ImportReport {
  timestamp: string;
  mode: "dry-run" | "execute";
  summary: {
    totalRows: number;
    uniqueEmails: number;
    matchedUsers: number;
    unmatchedEmails: number;
    updatesApplied: number;
    unchangedAlreadyMatching: number;
    dateRangeParsed: { min: string; max: string } | null;
  };
  unmatched: string[];
  perUser: Array<{
    userId: number;
    email: string;
    memberName: string;
    oldCreatedAt: string;
    newCreatedAt: string;
    changed: boolean;
  }>;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
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
    // Gimnasio: ANTES de cualquier otra validación de uso (fase 169 D-06,
    // retrofit 173 D-03). Si falta `--tenant`, si el id no es un entero
    // positivo o si no existe esa fila en `tenants`, esto corta con exit 2
    // antes de mirar `--data-dir` y sin haber leído ni escrito una sola fila.
    const ctx = await requireTenant(queryFnFromConnection(connection), args);

    const dataDirIdx = args.indexOf("--data-dir");
    if (dataDirIdx === -1 || !args[dataDirIdx + 1]) {
      console.error(
        "Usage: pnpm tsx src/db/import-fecha-ingreso.ts --tenant=<id> --data-dir /path [--execute]",
      );
      process.exit(1);
    }
    const dataDir = args[dataDirIdx + 1];

    console.log(`\nFecha de Ingreso Import`);
    console.log(`Mode: ${executeMode ? "EXECUTE" : "DRY-RUN"}`);
    console.log(`Tenant: ${ctx.tenantId}`);
    console.log(`Data dir: ${dataDir}\n`);

    const rows = parseAllIngresoCsvs(dataDir);
    const byEmail = dedupeByEmailEarliest(rows);

    const dates = [...byEmail.values()].map((r) => r.fechaIngreso);
    const minDate = dates.length
      ? dates.reduce((a, b) => (a < b ? a : b))
      : null;
    const maxDate = dates.length
      ? dates.reduce((a, b) => (a > b ? a : b))
      : null;

    console.log(`Rows parsed:     ${rows.length}`);
    console.log(`Unique emails:   ${byEmail.size}`);
    if (minDate && maxDate) {
      console.log(`Date range:      ${minDate} → ${maxDate}`);
    }

    // Load matching users
    const emails = [...byEmail.keys()];
    const dbUsers = emails.length
      ? await db
          .select({
            id: users.id,
            email: users.email,
            createdAt: users.createdAt,
          })
          .from(users)
          .where(and(tenantWhere(users, ctx), inArray(users.email, emails)))
      : [];

    const userByEmail = new Map<
      string,
      { id: number; email: string; createdAt: Date }
    >();
    for (const u of dbUsers) {
      if (!u.email) continue;
      userByEmail.set(u.email.toLowerCase(), {
        id: u.id,
        email: u.email,
        createdAt: u.createdAt,
      });
    }

    const unmatched: string[] = [];
    const perUser: ImportReport["perUser"] = [];
    let updatesApplied = 0;
    let unchanged = 0;

    for (const [email, ingreso] of byEmail.entries()) {
      const user = userByEmail.get(email);
      if (!user) {
        unmatched.push(email);
        continue;
      }
      const oldIso = user.createdAt.toISOString().slice(0, 10);
      const newIso = ingreso.fechaIngreso;
      const changed = oldIso !== newIso;
      perUser.push({
        userId: user.id,
        email,
        memberName: ingreso.memberName,
        oldCreatedAt: oldIso,
        newCreatedAt: newIso,
        changed,
      });
      if (changed) updatesApplied++;
      else unchanged++;
    }

    console.log(`\n--- Matching ---`);
    console.log(`  Matched users:       ${userByEmail.size}`);
    console.log(`  Unmatched emails:    ${unmatched.length}`);
    console.log(`  Updates (different): ${updatesApplied}`);
    console.log(`  Unchanged:           ${unchanged}`);

    if (executeMode) {
      console.log(`\n=== EXECUTING ===\n`);
      let done = 0;
      for (const p of perUser) {
        if (!p.changed) continue;
        await db
          .update(users)
          .set({ createdAt: new Date(p.newCreatedAt + "T00:00:00Z") })
          .where(and(tenantWhere(users, ctx), eq(users.id, p.userId)));
        done++;
      }
      console.log(`Rows updated: ${done}`);
    }

    const report: ImportReport = {
      timestamp: new Date().toISOString(),
      mode: executeMode ? "execute" : "dry-run",
      summary: {
        totalRows: rows.length,
        uniqueEmails: byEmail.size,
        matchedUsers: userByEmail.size,
        unmatchedEmails: unmatched.length,
        updatesApplied,
        unchangedAlreadyMatching: unchanged,
        dateRangeParsed:
          minDate && maxDate ? { min: minDate, max: maxDate } : null,
      },
      unmatched,
      perUser,
    };

    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const reportPath = path.join(dataDir, `import-fecha-ingreso-${stamp}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\nReport: ${reportPath}`);
    console.log("=".repeat(50));
    console.log(executeMode ? "IMPORT COMPLETE" : "DRY-RUN COMPLETE");
    console.log("=".repeat(50));
  } finally {
    await connection.end();
  }
}

if (typeof require !== "undefined" && require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((err: unknown) => failTenantArg(err, "import-fecha-ingreso"));
}

export { main };
