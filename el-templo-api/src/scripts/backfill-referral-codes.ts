/**
 * backfill-referral-codes.ts -- ONE-SHOT, A DEMANDA (D-25/D-17)
 *
 * Puebla `users.referral_code` para los ~2000 socios que existían antes de la
 * feature de referidos (fase 157). Los socios NUEVOS reciben su código en el
 * alta/registro (generación eager, plan 03); este script cierra solo el borde
 * de los históricos, y se corre UNA vez a mano antes de lanzar la fase 158.
 *
 * Idempotencia: SÍ. Selecciona únicamente `referral_code IS NULL`, así que una
 * 2da corrida no toca a quienes ya tienen código — re-correr es seguro y no
 * cambia códigos asignados. Best-effort por socio: si uno colisiona de forma
 * irrecuperable, loguea y sigue con el resto (no aborta el batch).
 *
 * Reusa `ReferralService.generateReferralCode` (NO reimplementa el formato).
 *
 * NO está cableado a ningún pipeline: no figura en package.json scripts de
 * arranque, ni en el runner de migraciones, ni en el deploy. Solo a demanda.
 *
 * Usage (local):
 *   pnpm tsx src/scripts/backfill-referral-codes.ts            # dry run
 *   pnpm tsx src/scripts/backfill-referral-codes.ts --apply    # real
 *
 * Usage (server, post-deploy):
 *   NODE_ENV=production node dist/scripts/backfill-referral-codes.js
 *   NODE_ENV=production node dist/scripts/backfill-referral-codes.js --apply
 *
 * EXECUTED IN PROD: <FILL DATE WHEN APPLIED>
 */

import "dotenv/config";
import { drizzle } from "drizzle-orm/mysql2";
import type { MySql2Database } from "drizzle-orm/mysql2";
import { isNull } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import { createSingleConnection } from "../db/index";
import * as schema from "../db/schema";
import { users } from "../db/schema";
import { ReferralService } from "../modules/referrals/service";

type DbInstance = MySql2Database<typeof schema>;

/** Logger mínimo para reusar ReferralService fuera de Fastify (solo usa warn). */
const scriptLog = {
  info: (...args: unknown[]) => console.log(...args),
  warn: (...args: unknown[]) => console.warn(...args),
  error: (...args: unknown[]) => console.error(...args),
} as unknown as FastifyBaseLogger;

export interface BackfillResult {
  /** Socios sin referral_code al momento de correr (los candidatos). */
  candidates: number;
  /** Cuántos recibieron código efectivamente (0 en dry-run). */
  assigned: number;
  /** Socios que fallaron irrecuperablemente (colisión persistente). */
  errors: number;
}

/**
 * Lógica pura del backfill, invocable desde el CLI y desde los tests. En
 * dry-run reporta cuántos socios recibirían código sin escribir; con
 * `{ apply: true }` persiste. Reusa `generateReferralCode` (idempotente y
 * best-effort por socio).
 */
export async function backfillReferralCodes(
  db: DbInstance,
  options: { apply: boolean },
): Promise<BackfillResult> {
  const service = new ReferralService(db, scriptLog);

  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(isNull(users.referralCode));

  const candidates = rows.length;
  if (!options.apply) {
    return { candidates, assigned: 0, errors: 0 };
  }

  let assigned = 0;
  let errors = 0;
  for (const row of rows) {
    try {
      await service.generateReferralCode(row.id);
      assigned++;
    } catch (err: unknown) {
      errors++;
      console.error(
        `  ✗ user ${row.id}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  return { candidates, assigned, errors };
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const mode = apply ? "APPLY" : "DRY-RUN";

  console.log(`\n=== Backfill Referral Codes (fase 157, D-25) ===`);
  console.log(`Mode: ${mode}`);
  console.log(`Database: ${process.env.DB_NAME || "eltemplo"}`);
  console.log(`Timestamp: ${new Date().toISOString()}\n`);

  const { connection } = await createSingleConnection();
  const db = drizzle(connection, { schema, mode: "default" });

  try {
    const result = await backfillReferralCodes(db, { apply });
    if (!apply) {
      console.log(
        `Socios sin código: ${result.candidates}. Re-correr con --apply para persistir.\n`,
      );
    } else {
      console.log(`\n✓ APPLY COMPLETE`);
      console.log(`  candidatos: ${result.candidates}`);
      console.log(`  asignados:  ${result.assigned}`);
      console.log(`  errores:    ${result.errors}\n`);
    }
  } finally {
    await connection.end();
  }
}

// Solo corre el CLI al ejecutarse directo; los tests importan las funciones sin
// disparar la conexión (VITEST lo setea el runner).
if (!process.env.VITEST) {
  main().catch((err) => {
    console.error("\n✗ FATAL:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
