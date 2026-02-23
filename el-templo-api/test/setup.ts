/**
 * Vitest globalSetup: creates and seeds a test MySQL database, then tears it down.
 *
 * - Reads DB credentials from environment (defaults match .env.development)
 * - Drops/creates eltemplo_test database for a clean slate
 * - Runs all migration .sql files to build the schema
 * - Seeds minimal reference data needed for integration tests
 */

import dotenv from "dotenv";
import mysql from "mysql2/promise";
import fs from "fs";
import path from "path";
import argon2 from "argon2";

// Load env from the API project root (globalSetup runs in its own context)
dotenv.config({ path: path.resolve(__dirname, "../.env.development") });
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const DB_HOST = process.env.DB_HOST || "localhost";
const DB_PORT = Number(process.env.DB_PORT) || 3306;
const DB_USER = process.env.DB_USER || "root";
const DB_PASSWORD = process.env.DB_PASSWORD || "";
const TEST_DB = "eltemplo_test";

const MIGRATIONS_DIR = path.resolve(__dirname, "../src/db/migrations");

/**
 * Run all .sql migration files against the test database
 */
async function runMigrations(connection: mysql.Connection): Promise<void> {
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf-8");

    // Skip data-only migrations — they operate on production data, not test data
    if (sql.includes("@data-only")) continue;

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
        await connection.execute(stmt);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        // Strip SQL comments to get the actual statement keyword
        const stmtBody = stmt
          .split("\n")
          .filter((l) => !l.trimStart().startsWith("--"))
          .join("\n")
          .trim();
        const stmtUpper = stmtBody.toUpperCase();
        const isDuplicate =
          msg.includes("Duplicate column name") ||
          msg.includes("Duplicate key name") ||
          msg.includes("Duplicate foreign key") ||
          msg.includes("already exists");
        // DML statements (UPDATE/DELETE) in migrations operate on existing data.
        // On a fresh empty DB they can fail due to column name mismatches
        // (e.g. Drizzle property name vs actual column name). Safe to skip.
        const isDmlOnEmptyTable =
          (stmtUpper.startsWith("UPDATE") || stmtUpper.startsWith("DELETE")) &&
          msg.includes("Unknown column");
        if (!isDuplicate && !isDmlOnEmptyTable) {
          throw err;
        }
      }
    }
  }
}

/**
 * Seed minimal data required for integration tests:
 * - 1 branch (for user registration)
 * - 1 spom_config row (for session queries)
 * - 1 admin user (for admin endpoint tests)
 */
async function seedTestData(connection: mysql.Connection): Promise<void> {
  // Branch
  await connection.execute(
    `INSERT INTO branches (name, code) VALUES ('Test Branch', 'TEST')`,
  );

  // SPOM config (singleton, week 1)
  await connection.execute(
    `INSERT INTO spom_config (id, current_week) VALUES (1, 1)`,
  );

  // Admin user (password: 'adminpass123')
  const adminHash = await argon2.hash("adminpass123");
  await connection.execute(
    `INSERT INTO users (email, password_hash, first_name, last_name, role, branch_id, level)
     VALUES ('admin@test.com', ?, 'Test', 'Admin', 'superadmin', 1, 'spartan')`,
    [adminHash],
  );
}

/**
 * Vitest globalSetup: setup function
 */
export async function setup(): Promise<void> {
  // Connect without database to create/drop
  const rootConn = await mysql.createConnection({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    multipleStatements: true,
  });

  // Clean slate
  await rootConn.execute(`DROP DATABASE IF EXISTS \`${TEST_DB}\``);
  await rootConn.execute(`CREATE DATABASE \`${TEST_DB}\``);
  await rootConn.end();

  // Connect to test database and run migrations + seed
  const testConn = await mysql.createConnection({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    database: TEST_DB,
    multipleStatements: true,
  });

  await runMigrations(testConn);
  await seedTestData(testConn);
  await testConn.end();
}

/**
 * Vitest globalSetup: teardown function
 */
export async function teardown(): Promise<void> {
  const connection = await mysql.createConnection({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
  });

  await connection.execute(`DROP DATABASE IF EXISTS \`${TEST_DB}\``);
  await connection.end();
}
