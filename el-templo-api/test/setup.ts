/**
 * Vitest setupFiles: per-worker test DB provisioning.
 *
 * Each vitest worker (process) gets its own database (eltemplo_test_<POOL_ID>)
 * so workers never share state. Within a worker, the DB is created exactly
 * once (cached promise) regardless of how many test files run there.
 *
 * Cross-run cleanup of stale per-worker DBs is handled by globalSetup
 * (test/setup-global.ts), which runs once in the main process before workers
 * spawn.
 */

import dotenv from "dotenv";
import mysql from "mysql2/promise";
import path from "path";
import fs from "fs";
import argon2 from "argon2";
import { beforeAll } from "vitest";

dotenv.config({ path: path.resolve(__dirname, "../.env.development") });
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const DB_HOST = process.env.DB_HOST || "localhost";
const DB_PORT = Number(process.env.DB_PORT) || 3306;
const DB_USER = process.env.DB_USER || "root";
const DB_PASSWORD = process.env.DB_PASSWORD || "";

// VITEST_POOL_ID is "1", "2", ... when fileParallelism is on. Falls back to
// "1" for single-worker mode so the DB name is always deterministic.
const POOL_ID = process.env.VITEST_POOL_ID || "1";
const TEST_DB = `eltemplo_test_${POOL_ID}`;

/**
 * El Templo. Mismo valor que la constante `TENANT_TEMPLO` del fixture del
 * gimnasio 2 (vive en `test/fixtures/`), declarado acá y no importado a
 * propósito: ese fixture importa `test/helpers.ts`, que importa `buildApp` — y
 * este archivo corre ANTES de que exista una app (fija `process.env.DB_NAME` en
 * el load del módulo). Traer la cadena entera del app a `setupFiles` por una
 * constante numérica sería peor que repetirla.
 *
 * OJO AL EDITAR: el Test 13 de la bateria iso-02 de tenancy prueba que la
 * siembra del gimnasio 2 es OPT-IN por archivo y no esta enchufada a este setup
 * global, y lo prueba buscando TRES marcas por SUBSTRING en este archivo (el
 * nombre del modulo del fixture, el de su funcion de siembra y el de su
 * constante de tenant). El gate no distingue codigo de comentario: escribir
 * cualquiera de las tres aca —aunque sea para explicar por que NO se usan— lo
 * pone en rojo. Paso entre el 172-13 y el 172-16.
 *
 * Existe para que los seeds de `cash_registers` de abajo nombren el gimnasio en
 * vez de dejar un `1` mágico o —peor— caer en el DEFAULT de la columna (T-168-15).
 */
const TENANT_TEMPLO = 1;

// Override DB_NAME so buildApp's database plugin connects to the per-worker DB.
// This must happen at module load time (top-level), before any test code
// constructs a Fastify app.
process.env.DB_NAME = TEST_DB;

async function seedTestData(conn: mysql.Connection): Promise<void> {
  // Migrations may have already inserted some of these rows (e.g. Templo
  // Online branch is seeded by a later data migration). Use INSERT IGNORE
  // to keep the seed idempotent across migration drift.
  await conn.query(
    "INSERT IGNORE INTO branches (name, code) VALUES ('Test Branch', 'TEST')",
  );
  await conn.query(
    "INSERT IGNORE INTO branches (name, code, is_virtual) VALUES ('Templo Online', 'ONLINE', true)",
  );
  await conn.query(
    "INSERT IGNORE INTO spom_config (id, current_week) VALUES (1, 1)",
  );
  const hash = await argon2.hash("adminpass123");
  // Pin to the oldest Test Branch so the FK resolves even if other seed
  // branches were inserted by migrations first.
  const [branchRows] = (await conn.query(
    "SELECT id FROM branches WHERE code = 'TEST' LIMIT 1",
  )) as unknown as [Array<{ id: number }>];
  const testBranchId = branchRows[0]?.id ?? 1;
  // Fase 173 (ADO-02): `tenant_id` EXPLÍCITO en el INSERT en vez de confiar en
  // el DEFAULT 1 de la columna. `users` es una de las 8 tablas que esta fase
  // vuelve strict: el admin canónico de la suite es y va a ser siempre El
  // Templo, pero dejarlo en el DEFAULT deja esa decisión implícita justo en la
  // tabla que se vuelve strict (mismo riesgo, T-168-15, que ya mordió a
  // `cash_registers` acá abajo en la fase 172 — este INSERT usa una conexión
  // mysql2 propia, no `app.dbPool`, así que el sentinel no lo ve, pero el
  // riesgo real de estampar en el gimnasio equivocado no depende de que haya
  // un vigilante mirando).
  await conn.query(
    "INSERT IGNORE INTO users (email, password_hash, first_name, last_name, role, branch_id, level, tenant_id) VALUES ('admin@test.com', ?, 'Test', 'Admin', 'owner', ?, 'spartan', ?)",
    [hash, testBranchId, TENANT_TEMPLO],
  );

  // Phase 138: cash_registers. The migration 0154 seed is SELECT-driven off
  // the branches that exist AT MIGRATION TIME, but the test branches (TEST,
  // ONLINE) are inserted AFTER migrations run, so no efectivo caja exists for
  // them. Seed cajas here (post-branch-insert) so TransactionService.create()'s
  // resolver (which throws "No existe caja efectivo ..." when absent) resolves
  // for every non-virtual branch the suite uses. Mirrors the migration's seed:
  // 1 efectivo per active non-virtual branch (currency from country) + 1
  // efectivo central + banco ARS + banco EUR. Idempotent via INSERT IGNORE on
  // a UNIQUE-free table — guard each insert with a NOT EXISTS probe.
  // NOTE: unlike the production migration seed (which restricts to active,
  // non-virtual branches), the test seed covers EVERY branch that exists at
  // seed time — the suite freely assigns plans/charges against any branch
  // (including the inactive PARK fixture and the virtual ONLINE branch), and
  // the resolver hard-throws when a cash payment hits a branch with no efectivo
  // caja. Seeding all branches keeps existing create()-path tests green.
  //
  // Fase 172 (ADO-01): los cuatro seeds nombran `tenant_id` EXPLÍCITAMENTE y sus
  // sondas `NOT EXISTS` filtran por gimnasio. Dos motivos, y el segundo es el que
  // importa:
  //   1. El del gimnasio: sin la columna, la caja cae en el DEFAULT 1 de la tabla
  //      y "funciona" hasta que exista una sede de otro gimnasio a esta altura
  //      (T-168-15). El de cada sede sale de `b.tenant_id`, no de un literal.
  //   2. El de la sonda: sin `cr.tenant_id` en el NOT EXISTS, la caja del
  //      gimnasio 2 de una corrida anterior haría creer que la de El Templo ya
  //      existe, y el seed se saltearía en silencio.
  // Ojo con la asimetría: estas queries van por una conexión mysql2 PROPIA de
  // este archivo, no por `app.dbPool`, así que el sentinel de la fase 170 NO las
  // ve y nunca habrían hecho throw. Se migran igual porque el riesgo real (una
  // caja estampada en el gimnasio equivocado) no depende de que haya un vigilante
  // mirando.
  await conn.query(
    `INSERT INTO cash_registers (tenant_id, name, type, branch_id, currency, opening_balance, cutoff_date, is_active)
       SELECT b.tenant_id, CONCAT('Efectivo ', b.name), 'efectivo', b.id,
              CASE WHEN b.country = 'ES' THEN 'EUR' ELSE 'ARS' END,
              0, '2020-01-01', true
         FROM branches b
        WHERE NOT EXISTS (
            SELECT 1 FROM cash_registers cr
             WHERE cr.tenant_id = b.tenant_id
               AND cr.type = 'efectivo' AND cr.branch_id = b.id
          )`,
  );
  await conn.query(
    `INSERT INTO cash_registers (tenant_id, name, type, branch_id, currency, opening_balance, cutoff_date, is_active)
       SELECT ${TENANT_TEMPLO}, 'Efectivo Central', 'efectivo', NULL, 'ARS', 0, '2020-01-01', true
        WHERE NOT EXISTS (
          SELECT 1 FROM cash_registers cr
           WHERE cr.tenant_id = ${TENANT_TEMPLO}
             AND cr.type = 'efectivo' AND cr.branch_id IS NULL AND cr.currency = 'ARS'
        )`,
  );
  await conn.query(
    `INSERT INTO cash_registers (tenant_id, name, type, branch_id, currency, opening_balance, cutoff_date, is_active)
       SELECT ${TENANT_TEMPLO}, 'Banco ARS', 'banco', NULL, 'ARS', 0, '2020-01-01', true
        WHERE NOT EXISTS (
          SELECT 1 FROM cash_registers cr
           WHERE cr.tenant_id = ${TENANT_TEMPLO}
             AND cr.type = 'banco' AND cr.currency = 'ARS'
        )`,
  );
  await conn.query(
    `INSERT INTO cash_registers (tenant_id, name, type, branch_id, currency, opening_balance, cutoff_date, is_active)
       SELECT ${TENANT_TEMPLO}, 'Banco EUR', 'banco', NULL, 'EUR', 0, '2020-01-01', true
        WHERE NOT EXISTS (
          SELECT 1 FROM cash_registers cr
           WHERE cr.tenant_id = ${TENANT_TEMPLO}
             AND cr.type = 'banco' AND cr.currency = 'EUR'
        )`,
  );
}

async function provisionWorkerDB(): Promise<void> {
  // Connect without database. With pool: 'forks' + isolate: true (default),
  // each test file runs in a fresh process, so the in-memory provisionPromise
  // cache resets between files. We rely instead on the DB itself as the cache
  // key: globalSetup drops all eltemplo_test_* DBs at the start of every run,
  // so if our worker's DB already exists, an earlier file on this fork did
  // the provisioning and we can reuse it.
  const rootConn = await mysql.createConnection({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    multipleStatements: true,
  });

  const [existing] = (await rootConn.query(
    `SELECT SCHEMA_NAME AS name FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?`,
    [TEST_DB],
  )) as unknown as [Array<{ name: string }>];
  if (existing.length > 0) {
    await rootConn.end();
    return;
  }

  await rootConn.execute(`CREATE DATABASE \`${TEST_DB}\``);
  await rootConn.end();

  // Apply committed SQL migrations with FK checks disabled.
  //
  // The _migrations table (and the hand-written .sql files under
  // src/db/migrations) is the single source of truth, including for tests
  // (per CLAUDE.md). Data-only migrations that reference seed rows missing
  // from a fresh test DB are tolerated below; the post-migration
  // seedTestData() installs the rows the test suite actually uses.
  const migrationsDir = path.resolve(
    __dirname,
    "..",
    "src",
    "db",
    "migrations",
  );
  const migrationFiles = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const migrateConn = await mysql.createConnection({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    database: TEST_DB,
    multipleStatements: true,
  });

  await migrateConn.query("SET FOREIGN_KEY_CHECKS=0");
  await migrateConn.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  for (const file of migrationFiles) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf-8");
    let statements: string[];
    if (sql.includes("--> statement-breakpoint")) {
      statements = sql
        .split("--> statement-breakpoint")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    } else {
      statements = sql
        .split(";")
        .map((s) =>
          s
            .split("\n")
            .filter((line) => !line.trimStart().startsWith("--"))
            .join("\n")
            .trim(),
        )
        .filter((s) => s.length > 0);
    }
    for (const stmt of statements) {
      try {
        await migrateConn.execute(stmt);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        const tolerated =
          msg.includes("Duplicate") ||
          msg.includes("already exists") ||
          msg.includes("Can't DROP") ||
          msg.includes("foreign key constraint fails") ||
          msg.includes("Unknown column") ||
          msg.includes("Table") ||
          msg.includes("Cannot add or update") ||
          msg.includes("doesn't exist");
        if (!tolerated) throw err;
      }
    }
    try {
      await migrateConn.execute("INSERT INTO _migrations (name) VALUES (?)", [
        file,
      ]);
    } catch {
      /* idempotent */
    }
  }

  await migrateConn.query("SET FOREIGN_KEY_CHECKS=1");
  await migrateConn.end();

  // Seed test data.
  const conn = await mysql.createConnection({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    database: TEST_DB,
  });
  await seedTestData(conn);
  await conn.end();
}

// Cache the provisioning promise at module level so it runs exactly once per
// worker, regardless of how many test files import this setup.
let provisionPromise: Promise<void> | null = null;

beforeAll(async () => {
  if (!provisionPromise) {
    provisionPromise = provisionWorkerDB();
  }
  await provisionPromise;
});
