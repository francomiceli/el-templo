/**
 * dry-run-reassign-multibranch.ts -- A DEMANDA
 *
 * Corre la lógica del cron de recategorización multisucursal
 * (runReassignMultibranch) en modo DRY-RUN por defecto: NO escribe, solo lista
 * qué miembros reasignaría y por qué se saltearon los demás. Sirve para
 * validar contra datos reales que la query/lógica hace lo esperado ANTES de
 * confiar en el cron mensual.
 *
 * NO está cableado a ningún pipeline (ni package.json de arranque, ni deploy,
 * ni el runner de migraciones). Solo a demanda.
 *
 * Usage (local):
 *   pnpm tsx src/scripts/dry-run-reassign-multibranch.ts            # dry-run
 *   pnpm tsx src/scripts/dry-run-reassign-multibranch.ts --apply    # escribe
 *
 * Usage (server, post-deploy):
 *   NODE_ENV=production node dist/scripts/dry-run-reassign-multibranch.js
 *   NODE_ENV=production node dist/scripts/dry-run-reassign-multibranch.js --apply
 */

import "dotenv/config";
import { drizzle } from "drizzle-orm/mysql2";
import { createSingleConnection } from "../db/index";
import * as schema from "../db/schema";
import { runReassignMultibranch } from "../jobs/reassign-multibranch";

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const mode = apply ? "APPLY" : "DRY-RUN";

  console.log(`\n=== Recategorización multisucursal (${mode}) ===`);
  console.log(`Database: ${process.env.DB_NAME || "eltemplo"}`);
  console.log(`Timestamp: ${new Date().toISOString()}\n`);

  const { connection } = await createSingleConnection();
  const db = drizzle(connection, { schema, mode: "default" });

  try {
    const res = await runReassignMultibranch(db, { dryRun: !apply });

    console.log(`Candidatos (members multisucursal activos): ${res.candidates}`);
    console.log(`Reasignaciones: ${res.changes.length}`);
    for (const c of res.changes) {
      console.log(
        `  member ${c.memberId}: sede ${c.fromBranchId} → ${c.toBranchId} ` +
          `(${c.toBranchCount}/${c.totalAttendances} asistencias)`,
      );
    }

    // Agrupar los salteados por motivo para leer de un vistazo.
    const byReason = new Map<string, number>();
    for (const s of res.skipped) {
      byReason.set(s.reason, (byReason.get(s.reason) ?? 0) + 1);
    }
    console.log(`\nSalteados: ${res.skipped.length}`);
    for (const [reason, n] of byReason) {
      console.log(`  ${reason}: ${n}`);
    }

    if (!apply) {
      console.log(`\nDRY-RUN: no se escribió nada. Re-correr con --apply.\n`);
    } else {
      console.log(`\n✓ APPLY COMPLETE — ${res.changes.length} reasignados.\n`);
    }
  } finally {
    await connection.end();
  }
}

// Solo corre el CLI al ejecutarse directo; los tests importan la lógica del
// job sin disparar la conexión.
if (!process.env.VITEST) {
  main().catch((err) => {
    console.error("\n✗ FATAL:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
