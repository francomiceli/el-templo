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
  await conn.query(
    "INSERT IGNORE INTO users (email, password_hash, first_name, last_name, role, branch_id, level) VALUES ('admin@test.com', ?, 'Test', 'Admin', 'owner', ?, 'spartan')",
    [hash, testBranchId],
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
