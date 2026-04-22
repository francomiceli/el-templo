/**
 * Vitest globalSetup: creates and seeds a test MySQL database.
 *
 * Uses mysql2/promise for database creation (works in CI Docker containers),
 * drizzle-kit push for schema from TypeScript definitions, and mysql2/promise
 * again for seed data.
 */

import dotenv from "dotenv";
import mysql from "mysql2/promise";
import path from "path";
import fs from "fs";
import argon2 from "argon2";

dotenv.config({ path: path.resolve(__dirname, "../.env.development") });
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const DB_HOST = process.env.DB_HOST || "localhost";
const DB_PORT = Number(process.env.DB_PORT) || 3306;
const DB_USER = process.env.DB_USER || "root";
const DB_PASSWORD = process.env.DB_PASSWORD || "";
const TEST_DB = "eltemplo_test";

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

export async function setup(): Promise<void> {
  // Connect without database to create/drop (uses TCP, works in CI containers)
  const rootConn = await mysql.createConnection({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    multipleStatements: true,
  });

  await rootConn.execute(`DROP DATABASE IF EXISTS \`${TEST_DB}\``);
  await rootConn.execute(`CREATE DATABASE \`${TEST_DB}\``);
  await rootConn.end();

  // Apply committed SQL migrations with FK checks disabled.
  //
  // Historical note: this used `drizzle-kit push` but that now fails because
  // Drizzle's auto-generated FK name for subscription_schedule_changes
  // exceeds MySQL's 64-char identifier limit. Production migrations use
  // short, explicit FK names so they don't hit the limit — per CLAUDE.md the
  // _migrations table (and the hand-written .sql files under
  // src/db/migrations) is the single source of truth, including for tests.
  //
  // Data-only migrations (e.g. 0017_add_coach_user.sql) reference seed rows
  // that only exist in the production DB. Running the test DB migrations in
  // order with FK checks off lets DDL/ALTER migrations apply cleanly while
  // data INSERTs against missing rows fail silently (swallowed below) — the
  // post-migration seedTestData() below installs the rows the test suite
  // actually uses.
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
        // Tolerate duplicate definitions (idempotent reruns) and data-only
        // migrations that reference seed rows not present in the fresh test
        // DB (e.g. INSERT … WHERE branch_id=1 before branches are seeded).
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

  // Seed test data
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

export async function teardown(): Promise<void> {
  // no-op
}
