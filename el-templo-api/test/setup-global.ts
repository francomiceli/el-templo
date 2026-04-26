/**
 * Vitest globalSetup: runs once in the main process before any worker spawns.
 *
 * Wipes any leftover per-worker test databases from previous runs
 * (`eltemplo_test_*`) so workers start from a clean slate. Per-worker DB
 * provisioning lives in test/setup.ts (a setupFiles entry — runs once per
 * worker once it starts).
 */

import dotenv from "dotenv";
import mysql from "mysql2/promise";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env.development") });
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const DB_HOST = process.env.DB_HOST || "localhost";
const DB_PORT = Number(process.env.DB_PORT) || 3306;
const DB_USER = process.env.DB_USER || "root";
const DB_PASSWORD = process.env.DB_PASSWORD || "";

export async function setup(): Promise<void> {
  const conn = await mysql.createConnection({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
  });

  // Drop any leftover per-worker DBs (e.g. eltemplo_test_1, _2, ...) plus the
  // legacy unsuffixed `eltemplo_test`. Keeps disk tidy across local dev runs.
  const [rows] = (await conn.query(
    `SELECT SCHEMA_NAME AS name FROM information_schema.SCHEMATA
     WHERE SCHEMA_NAME = 'eltemplo_test'
        OR SCHEMA_NAME LIKE 'eltemplo_test\\_%'`,
  )) as unknown as [Array<{ name: string }>];

  for (const row of rows) {
    await conn.query(`DROP DATABASE IF EXISTS \`${row.name}\``);
  }

  await conn.end();
}

export async function teardown(): Promise<void> {
  // No-op: per-worker DBs are dropped at the start of the next run.
}
