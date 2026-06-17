/**
 * Phase 97.5 DRIFT-01 — RED integration test for raw-SQL <-> Drizzle
 * column-name drift on `subscriptions.subscription_status`.
 *
 * This file MUST FAIL on master HEAD (3f330787). It reproduces the prod
 * bug class diagnosed in `.planning/debug/bot-raw-sql-status-column-drift.md`:
 *
 *   - `el-templo-bot/src/ai/tools.ts:495`   SELECT `sub.status` (wrong)
 *   - `el-templo-bot/src/ai/tools.ts:500`   WHERE  `sub.status` (wrong)
 *   - `el-templo-bot/src/state/machine.ts:77` SELECT `s.status` (wrong)
 *
 * The Drizzle column is declared with SQL name `subscription_status`
 * (`el-templo-api/src/db/schema/subscriptions.ts:18-23, :51`). On master
 * any SELECT that emits `sub.status` / `s.status` against the real
 * `eltemplo_test` schema rejects with MySQL errno 1054 / sqlState 42S22
 * `Unknown column 'sub.status' in 'field list'`.
 *
 * The Phase 97.5 D-04 Option B fix renames the JS-side property to match
 * the SQL column (`status` -> `subscription_status`) in both inline
 * `SubscriptionRow` interfaces, in all 3 raw-SQL references, and in the
 * 3 substantive JS-side reads (`tools.ts:538`, `machine.ts:90`, `:116`).
 * Post-fix this file turns GREEN.
 *
 * Pattern: mirrors `el-templo-api/test/whatsapp/ai-tools.test.ts:1-43`
 * (pool + drizzle direct — the Fastify-app test helper is NOT used here;
 * bot-tool integration tests do not boot Fastify per PATTERNS.md drift
 * item 1). MySQL-errno catch+assert shape mirrors
 * `el-templo-api/test/whatsapp/v5-3-3-booking.integration.test.ts:486-549`
 * (Phase 95 BUG-03 candidate (vi) — the only existing precedent in repo).
 *
 * Standards (CLAUDE.md): no `any`; `catch (err: unknown)` with
 * `instanceof Error` narrowing; no `console.*`. TST-prefixed namespace
 * per Phase 98 D-05 precedent (`TSTMBR` fits `branches.code varchar(10)`).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "../../src/db/schema/index";
import { executeTool } from "../../../el-templo-bot/src/ai/tools";
import { determineClientState } from "../../../el-templo-bot/src/state/machine";

type DB = ReturnType<typeof drizzle<typeof schema>>;

// ─── Test Setup ──────────────────────────────────────────────────────────────

let pool: mysql.Pool;
let db: DB;

const PHONE = "5491100099001";

beforeAll(async () => {
  pool = mysql.createPool({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: "eltemplo_test",
  });
  db = drizzle(pool, { schema, mode: "default" });
});

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  // Reverse-FK-order cleanup, TST* namespace per Phase 98 D-05.
  // Runs FIRST so a previous partial-failure does not poison this run.
  // `attendance` MUST be deleted before `users` (FK attendance.member_id
  // -> users.id) and before `branches` (FK attendance.branch_id).
  await pool.execute("DELETE FROM bookings");
  await pool.execute("DELETE FROM attendance");
  await pool.execute("DELETE FROM subscriptions");
  await pool.execute("DELETE FROM schedules");
  await pool.execute("DELETE FROM subscription_plans WHERE name LIKE 'Test%'");
  await pool.execute("DELETE FROM users WHERE email LIKE 'test-mbr-drift-%'");
  await pool.execute("DELETE FROM activities WHERE name LIKE 'Test%'");
  await pool.execute("DELETE FROM branches WHERE code LIKE 'TST%'");

  // Seed minimal user -> branch -> plan -> ACTIVE subscription chain.
  // The drift fires whenever the SELECT actually emits the column to MySQL
  // (it is a parse-time/field-list error, not a row-evaluation error), so
  // technically any non-empty query path triggers it — but seeding an
  // active subscription is required for the POST-fix GREEN assertions
  // (statusText "Activa", client state "active_member").
  const [b] = await pool.execute(
    `INSERT INTO branches (name, code, max_capacity, is_active, created_at, updated_at)
     VALUES ('TST MembershipDrift', 'TSTMBR', 20, true, NOW(), NOW())`,
  );
  const branchId = (b as { insertId: number }).insertId;

  const [u] = await pool.execute(
    `INSERT INTO users (email, password_hash, first_name, last_name, phone, role, branch_id, is_active, created_at, updated_at)
     VALUES ('test-mbr-drift-1@test.com', 'hash', 'DriftJuan', 'DriftPerez', ?, 'member', ?, true, NOW(), NOW())`,
    [PHONE, branchId],
  );
  const userId = (u as { insertId: number }).insertId;

  const [p] = await pool.execute(
    `INSERT INTO subscription_plans (name, plan_tier, booking_mode, price_regular, price_zero, duration_days, classes_per_week, multi_branch, is_trial, is_active, is_archived, created_at, updated_at)
     VALUES ('Test MembershipDrift Plan', 'foundation', 'fixed', 15000, 12000, 30, 3, false, false, true, false, NOW(), NOW())`,
  );
  const planId = (p as { insertId: number }).insertId;

  // ACTIVE subscription with a far-future end_date so determineClientState
  // does NOT fall into the "expired_member" branch on the date check.
  // Uses the prod SQL column name in the INSERT (`subscription_status`),
  // so the seed succeeds against the migrated schema regardless of whether
  // the bot SELECT is fixed.
  await pool.execute(
    `INSERT INTO subscriptions (user_id, plan_id, branch_id, subscription_status, start_date, end_date, price_paid, price_type_applied, created_at, updated_at)
     VALUES (?, ?, ?, 'active', '2026-06-01', '2099-06-01', 15000, 'regular', NOW(), NOW())`,
    [userId, planId, branchId],
  );

  // Seed at least one attendance row so determineClientState's
  // `active_member` branch resolves (not `inactive_member`). The bot's
  // machine.ts:99-105 query is on `attendance.member_id = userId` with
  // `created_at > NOW() - INTERVAL 30 DAY`. Seed an attendance row dated
  // today against this user so recentAttendance > 0.
  // Schema reference: `el-templo-api/src/db/schema/attendance.ts:24-51` —
  // required columns: member_id, branch_id; checked_in_at + created_at
  // default to NOW(); status/source have enum defaults; no `updated_at`.
  await pool.execute(
    `INSERT INTO attendance (member_id, branch_id, created_at)
     VALUES (?, ?, NOW())`,
    [userId, branchId],
  );
});

// ─── DRIFT-01: checkMembership (tools.ts) ────────────────────────────────────

describe("DRIFT-01 — checkMembership SQL references sub.status (must be sub.subscription_status)", () => {
  // RED on master HEAD `3f330787`: the SELECT at `el-templo-bot/src/ai/tools.ts:495`
  // emits `sub.status` which does not exist on the migrated `subscriptions`
  // table (the SQL column name is `subscription_status` per the Drizzle
  // mysqlEnum at `el-templo-api/src/db/schema/subscriptions.ts:18-23`).
  // MySQL responds with errno 1054 / sqlState 42S22 `Unknown column`.
  //
  // POST-FIX (Phase 97.5 Task 3 — D-04 Option B inline rename):
  //   - rename `SubscriptionRow.status` -> `subscription_status` at tools.ts:454
  //   - rename SQL `sub.status` -> `sub.subscription_status` at tools.ts:495
  //   - rename SQL `sub.status` -> `sub.subscription_status` at tools.ts:500
  //   - rename JS read `sub.status` -> `sub.subscription_status` at tools.ts:538
  // The call then resolves with a formatted membership string.
  it("RED: executeTool('check_membership') resolves with the seeded active subscription (FAILS on master with SQL error)", async () => {
    let result: string | undefined;
    let caught: unknown;
    try {
      result = await executeTool("check_membership", { phone: PHONE }, db);
    } catch (err: unknown) {
      caught = err;
    }

    expect(caught).toBeUndefined();
    expect(typeof result).toBe("string");
    expect(result).toContain("DriftJuan"); // user.first_name surfaced
    expect(result).toContain("Activa"); // formatted statusText post-fix
  });

  it("RED: check_membership does not throw the `sub.status` SQL error specifically (FAILS on master)", async () => {
    let caughtMessage = "";
    try {
      await executeTool("check_membership", { phone: PHONE }, db);
    } catch (err: unknown) {
      caughtMessage = err instanceof Error ? err.message : String(err);
    }

    // On master: caughtMessage contains
    //   "Unknown column 'sub.status' in 'field list'"
    // (verbatim — see PATTERNS.md drift item 6 / debug/bot-raw-sql-status-column-drift.md).
    // Post-fix: caughtMessage stays "" (no throw).
    expect(caughtMessage).not.toMatch(/sub\.status|Unknown column/i);
  });
});

// ─── DRIFT-01: determineClientState (machine.ts) ─────────────────────────────

describe("DRIFT-01 — determineClientState SQL references s.status (must be s.subscription_status)", () => {
  // RED on master HEAD `3f330787`: the SELECT at
  // `el-templo-bot/src/state/machine.ts:77` emits `s.status`. Same drift class
  // as checkMembership — MySQL errno 1054 / sqlState 42S22.
  //
  // CRITICAL ASSERTION-SHAPE NOTE (PATTERNS.md interfaces block + machine.ts:130-134):
  //   determineClientState has an OUTER try/catch at :130-134 that SWALLOWS
  //   the SQL error and returns `{ state: "lead", userId: null }`. So we
  //   CANNOT assert on a thrown error here — instead we assert on the
  //   RESULT SHAPE. On master: result.state === "lead". Post-fix:
  //   result.state === "active_member" (seeded active sub + recent attendance).
  //
  // POST-FIX (Phase 97.5 Task 3 — D-04 Option B inline rename):
  //   - rename `SubscriptionRow.status` -> `subscription_status` at machine.ts:40
  //   - rename SQL `s.status` -> `s.subscription_status` at machine.ts:77
  //   - rename JS read `s.status` -> `s.subscription_status` at machine.ts:90
  //   - rename JS read `s.status` -> `s.subscription_status` at machine.ts:116
  it("RED: determineClientState returns 'active_member' for the seeded active subscription (FAILS on master — returns 'lead')", async () => {
    let result: { state: string; userId: number | null } | undefined;
    let caught: unknown;
    try {
      result = await determineClientState(PHONE, db);
    } catch (err: unknown) {
      caught = err;
    }

    expect(caught).toBeUndefined();
    expect(result?.state).toBe("active_member");
  });
});
