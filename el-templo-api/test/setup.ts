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
import { execSync } from "child_process";
import argon2 from "argon2";

dotenv.config({ path: path.resolve(__dirname, "../.env.development") });
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const DB_HOST = process.env.DB_HOST || "localhost";
const DB_PORT = Number(process.env.DB_PORT) || 3306;
const DB_USER = process.env.DB_USER || "root";
const DB_PASSWORD = process.env.DB_PASSWORD || "";
const TEST_DB = "eltemplo_test";

async function seedTestData(conn: mysql.Connection): Promise<void> {
  await conn.query(
    "INSERT INTO branches (name, code) VALUES ('Test Branch', 'TEST')",
  );
  await conn.query(
    "INSERT INTO branches (name, code, is_virtual) VALUES ('Templo Online', 'ONLINE', true)",
  );
  await conn.query("INSERT INTO spom_config (id, current_week) VALUES (1, 1)");
  const hash = await argon2.hash("adminpass123");
  await conn.query(
    "INSERT INTO users (email, password_hash, first_name, last_name, role, branch_id, level) VALUES ('admin@test.com', ?, 'Test', 'Admin', 'superadmin', 1, 'spartan')",
    [hash],
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

  // Use drizzle-kit push to create schema from TypeScript definitions
  execSync("npx drizzle-kit push --force", {
    cwd: path.resolve(__dirname, ".."),
    stdio: "pipe",
    timeout: 60000,
    env: { ...process.env, DB_NAME: TEST_DB },
  });

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
