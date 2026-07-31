/**
 * Phase 111 Plan 06: integration tests for migration 0109 reconcile Soledad
 * Mailland.
 *
 * The migration is a one-shot data fix that reconciles the inconsistent state
 * left by the bug. Tests cover:
 *
 *   1. Source -> target: seed the buggy production state, apply the migration,
 *      assert all 6 target-state conditions hold.
 *   2. Idempotency (manual re-apply): apply the migration twice from the buggy
 *      state, assert second apply produces the same final snapshot (audit_log
 *      not duplicated, balances not re-touched).
 *   3. Idempotency (already-target): seed the already-migrated state plus the
 *      audit_log row, apply the migration, assert zero state change.
 *   4. Owner-fallback: seed without any owner-role user, apply, assert the
 *      audit row's actor_id falls back to user 1.
 *
 * The migration SQL is read from disk and split via splitSqlStatements()
 * exported from src/db/run-migrations.ts so the test exercises the EXACT same
 * parser used in production. A guard assertion also fails fast if any future
 * comment in the SQL contains an inline semicolon (Phase 103-01 invariant).
 *
 * The hardcoded IDs (34, 5588, 5912, 6132, 6382, 14, 16, 20, 1125) match the
 * production state documented in 111-CONTEXT.md.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { readFileSync } from "node:fs";
import path from "node:path";
import { sql, eq, and, inArray } from "drizzle-orm";
import argon2 from "argon2";
import { createTestApp } from "../helpers";
import { splitSqlStatements } from "../../src/db/run-migrations";
import * as schema from "../../src/db/schema";
import { TENANT_TEMPLO } from "../fixtures/second-tenant";
import { tenantWhere } from "../../src/modules/shared/tenant";

/**
 * Fase 172: `finance` entra en `TENANT_STRICT_MODULES`. Todas las filas que
 * este archivo siembra son de El Templo (son los ids de PRODUCCION del incidente
 * de 2026-04), asi que el gimnasio va explicito en cada INSERT, DELETE y SELECT.
 */
const TEMPLO_CTX = { tenantId: TENANT_TEMPLO };

const MIGRATION_PATH = path.resolve(
  __dirname,
  "../../src/db/migrations/0109_reconcile_soledad_mailland.sql",
);

// IDs taken from production state (verified via SSH on 30/04/2026, recorded in
// 111-CONTEXT.md interfaces section). The migration's WHERE clauses target
// these literal values; tests must seed them exactly.
const TX_ID = 34;
const DELETED_USER_ID = 5588;
const ACTIVE_USER_ID = 5912;
const SUB_CANCELLED_ID = 6132;
const SUB_OTHER_CANCELLED_ID = 6134;
const SUB_OTHER_CANCELLED_2_ID = 6381;
const SUB_ACTIVE_ID = 6382;
const BALANCE_ID_14 = 14;
const BALANCE_ID_16 = 16;
const BALANCE_ID_20 = 20;
const BALANCE_ID_21 = 21;
const ENROLLMENT_ID = 1125;

interface BalanceRow {
  id: number;
  amount: number;
  memberId: number;
}

interface AuditRow {
  id: number;
  actorId: number;
  action: string;
  targetKind: string;
  targetId: number;
  reason: string | null;
}

interface EnrollmentRow {
  id: number;
  status: string;
  cancelledAt: Date | null;
}

interface SnapshotShape {
  txMemberId: number | null;
  linkTargetId: number | null;
  balanceIdsRemaining: number[];
  balanceAmountFor6382: number | null;
  enrollmentStatus: string | null;
  enrollmentCancelledAtIsNull: boolean;
  auditCount: number;
  auditReason: string | null;
  auditActorId: number | null;
}

describe("Migration 0109 — reconcile Soledad Mailland", () => {
  let app: FastifyInstance;
  let testBranchId: number;
  let onlineBranchId: number;
  let testPlanId: number;
  let testProgramId: number;
  let argonHash: string;
  let migrationStatements: string[];

  beforeAll(async () => {
    app = await createTestApp();
    argonHash = await argon2.hash("test-password-ignored");

    const branches = (await app.db.select().from(schema.branches)) as Array<{
      id: number;
      code: string;
    }>;
    const test = branches.find((b) => b.code === "TEST");
    const online = branches.find((b) => b.code === "ONLINE");
    if (!test || !online) {
      throw new Error(
        `Test fixture missing branches: test=${test?.id} online=${online?.id}`,
      );
    }
    testBranchId = test.id;
    onlineBranchId = online.id;

    // One subscription_plan to satisfy the FK from subscriptions.plan_id.
    const [planRow] = await app.db
      .insert(schema.subscriptionPlans)
      .values({
        name: "Reconcile Test Plan",
        planTier: "foundation",
        bookingMode: "flexible",
        planCategory: "presencial",
        priceRegular: 65000,
        priceZero: 0,
        durationDays: 30,
      })
      .$returningId();
    testPlanId = planRow.id;

    // One program to satisfy the FK from program_enrollments.program_id.
    const [programRow] = await app.db
      .insert(schema.programs)
      .values({
        name: "Reconcile Test Program",
        durationWeeks: 12,
        sessionsPerWeekToAdvance: 3,
      })
      .$returningId();
    testProgramId = programRow.id;

    // Read and pre-split the migration SQL once. The guard below verifies the
    // Phase 103-01 invariant: no `;` inside `--` comment lines.
    const sqlSource = readFileSync(MIGRATION_PATH, "utf8");
    const offendingComments = sqlSource
      .split("\n")
      .filter((line) => /^\s*--/.test(line) && line.includes(";"));
    expect(offendingComments).toEqual([]);
    migrationStatements = splitSqlStatements(sqlSource);
    expect(migrationStatements.length).toBeGreaterThan(0);
  });

  afterAll(async () => {
    // Best-effort cleanup of the explicit-ID rows we inserted. Use a single
    // pool connection so SET FOREIGN_KEY_CHECKS=0 stays in scope for the
    // whole sequence.
    const conn = await app.dbPool.getConnection();
    try {
      await conn.query("SET FOREIGN_KEY_CHECKS=0");
      await conn.query(
        `DELETE FROM transaction_links WHERE transaction_id = ${TX_ID} AND tenant_id = ?`,
        [TENANT_TEMPLO],
      );
      await conn.query(
        `DELETE FROM financial_transactions WHERE id = ${TX_ID} AND tenant_id = ?`,
        [TENANT_TEMPLO],
      );
      await conn.query(
        `DELETE FROM balances WHERE id IN (${BALANCE_ID_14}, ${BALANCE_ID_16}, ${BALANCE_ID_20}, ${BALANCE_ID_21}) AND tenant_id = ?`,
        [TENANT_TEMPLO],
      );
      await conn.query(
        `DELETE FROM program_enrollments WHERE id = ${ENROLLMENT_ID}`,
      );
      await conn.query(
        `DELETE FROM subscriptions WHERE id IN (${SUB_CANCELLED_ID}, ${SUB_OTHER_CANCELLED_ID}, ${SUB_OTHER_CANCELLED_2_ID}, ${SUB_ACTIVE_ID})`,
      );
      await conn.query(
        `DELETE FROM users WHERE id IN (${DELETED_USER_ID}, ${ACTIVE_USER_ID})`,
      );
      // Clean up the Test 4 fallback user (only present if Test 4 inserted
      // explicit id=1 because the per-worker DB lacked a low-id founder row).
      await conn.query(
        `DELETE FROM users WHERE email = 'fallback-actor-1@test.local'`,
      );
      await conn.query(
        `DELETE FROM audit_log WHERE action = 'reconciliation' AND target_id = ${ACTIVE_USER_ID}`,
      );
      await conn.query("SET FOREIGN_KEY_CHECKS=1");
    } finally {
      conn.release();
    }
    await app.close();
  });

  /**
   * Wipe just the rows we touch — keeps tests independent from each other
   * without disturbing the broader test DB state.
   */
  async function resetTouchedRows(): Promise<void> {
    const conn = await app.dbPool.getConnection();
    try {
      await conn.query("SET FOREIGN_KEY_CHECKS=0");
      await conn.query(
        `DELETE FROM transaction_links WHERE transaction_id = ${TX_ID} AND tenant_id = ?`,
        [TENANT_TEMPLO],
      );
      await conn.query(
        `DELETE FROM financial_transactions WHERE id = ${TX_ID} AND tenant_id = ?`,
        [TENANT_TEMPLO],
      );
      await conn.query(
        `DELETE FROM balances WHERE id IN (${BALANCE_ID_14}, ${BALANCE_ID_16}, ${BALANCE_ID_20}, ${BALANCE_ID_21}) AND tenant_id = ?`,
        [TENANT_TEMPLO],
      );
      await conn.query(
        `DELETE FROM program_enrollments WHERE id = ${ENROLLMENT_ID}`,
      );
      await conn.query(
        `DELETE FROM subscriptions WHERE id IN (${SUB_CANCELLED_ID}, ${SUB_OTHER_CANCELLED_ID}, ${SUB_OTHER_CANCELLED_2_ID}, ${SUB_ACTIVE_ID})`,
      );
      await conn.query(
        `DELETE FROM users WHERE id IN (${DELETED_USER_ID}, ${ACTIVE_USER_ID})`,
      );
      await conn.query(
        `DELETE FROM audit_log WHERE action = 'reconciliation' AND target_id = ${ACTIVE_USER_ID}`,
      );
      await conn.query("SET FOREIGN_KEY_CHECKS=1");
    } finally {
      conn.release();
    }
  }

  /**
   * Seed the BUGGY production state — the inputs to the migration.
   *
   * Two users (5588 deleted, 5912 active), four subscriptions (one active),
   * one financial_transaction (id=34) attributed to the deleted user, one
   * transaction_link pointing at the cancelled sub, four balances rows
   * (three orphan + one for the active sub still showing the debt),
   * and one program_enrollment dangling under the deleted user.
   *
   * Uses a single pooled connection with FK checks off so the explicit IDs
   * don't trip the references between tables that we seed in one go.
   */
  async function seedBuggyState(opts?: {
    omitOwnerRole?: boolean;
  }): Promise<void> {
    const conn = await app.dbPool.getConnection();
    try {
      await conn.query("SET FOREIGN_KEY_CHECKS=0");

      // Users — 5588 soft-deleted, 5912 active. If omitOwnerRole is true, the
      // test/setup admin@test.com user is temporarily reassigned to a
      // non-owner role so the COALESCE fallback (user id 1) is exercised.
      // Phase 103 backfill seeded admin@test.com as 'owner' with low id.
      await conn.query(
        `INSERT INTO users (id, email, password_hash, first_name, last_name, role, branch_id, level, status, deleted_at)
         VALUES (?, ?, ?, ?, ?, 'member', ?, 'alfa', 'inactivo', NOW())`,
        [
          DELETED_USER_ID,
          `soledad-deleted-${DELETED_USER_ID}@test.local`,
          argonHash,
          "Soledad",
          "Mailland (deleted)",
          onlineBranchId,
        ],
      );
      await conn.query(
        `INSERT INTO users (id, email, password_hash, first_name, last_name, role, branch_id, level, status)
         VALUES (?, ?, ?, ?, ?, 'member', ?, 'alfa', 'prueba')`,
        [
          ACTIVE_USER_ID,
          `soledad-active-${ACTIVE_USER_ID}@test.local`,
          argonHash,
          "Soledad",
          "Mailland",
          testBranchId,
        ],
      );

      // Subscriptions: 6132 cancelled (where the link wrongly points), 6134
      // and 6381 cancelled (orphan balances target them), 6382 active
      // scheduled (where the link should point after the migration).
      const today = new Date().toISOString().slice(0, 10);
      const future = new Date(Date.now() + 30 * 86400000)
        .toISOString()
        .slice(0, 10);
      for (const subRow of [
        { id: SUB_CANCELLED_ID, status: "cancelled", userId: DELETED_USER_ID },
        {
          id: SUB_OTHER_CANCELLED_ID,
          status: "cancelled",
          userId: DELETED_USER_ID,
        },
        {
          id: SUB_OTHER_CANCELLED_2_ID,
          status: "cancelled",
          userId: DELETED_USER_ID,
        },
        { id: SUB_ACTIVE_ID, status: "scheduled", userId: ACTIVE_USER_ID },
      ]) {
        await conn.query(
          `INSERT INTO subscriptions (id, user_id, plan_id, branch_id, subscription_status, start_date, end_date, price_paid, currency, price_type_applied)
           VALUES (?, ?, ?, ?, ?, ?, ?, 65000, 'ARS', 'regular')`,
          [
            subRow.id,
            subRow.userId,
            testPlanId,
            testBranchId,
            subRow.status,
            today,
            future,
          ],
        );
      }

      // Financial transaction id=34 attributed to the DELETED user 5588.
      await conn.query(
        `INSERT INTO financial_transactions (id, tenant_id, member_id, kind, direction, amount, currency, payment_method, transaction_date, effective_date, branch_id, recorded_by)
         VALUES (?, ?, ?, 'plan_charge', 'inflow', 65000, 'ARS', 'cash', ?, ?, ?, ?)`,
        [
          TX_ID,
          TENANT_TEMPLO,
          DELETED_USER_ID,
          today,
          today,
          testBranchId,
          ACTIVE_USER_ID,
        ],
      );

      // Transaction link incorrectly pointing at the cancelled sub 6132.
      await conn.query(
        `INSERT INTO transaction_links (tenant_id, transaction_id, target_kind, target_id, allocated_amount)
         VALUES (?, ?, 'subscription', ?, 65000)`,
        [TENANT_TEMPLO, TX_ID, SUB_CANCELLED_ID],
      );

      // Balances:
      //  - id=14 target sub 6132 (cancelled), amount 0, member 5588
      //  - id=16 target sub 6134 (cancelled), amount 65000, member 5588
      //  - id=20 target sub 6381 (cancelled), amount 65000, member 5588
      //  - id=21 target sub 6382 (active), amount 65000, member 5912
      await conn.query(
        `INSERT INTO balances (id, tenant_id, member_id, target_kind, target_id, currency, amount)
         VALUES (?, ?, ?, 'subscription', ?, 'ARS', 0)`,
        [BALANCE_ID_14, TENANT_TEMPLO, DELETED_USER_ID, SUB_CANCELLED_ID],
      );
      await conn.query(
        `INSERT INTO balances (id, tenant_id, member_id, target_kind, target_id, currency, amount)
         VALUES (?, ?, ?, 'subscription', ?, 'ARS', 65000)`,
        [BALANCE_ID_16, TENANT_TEMPLO, DELETED_USER_ID, SUB_OTHER_CANCELLED_ID],
      );
      await conn.query(
        `INSERT INTO balances (id, tenant_id, member_id, target_kind, target_id, currency, amount)
         VALUES (?, ?, ?, 'subscription', ?, 'ARS', 65000)`,
        [
          BALANCE_ID_20,
          TENANT_TEMPLO,
          DELETED_USER_ID,
          SUB_OTHER_CANCELLED_2_ID,
        ],
      );
      await conn.query(
        `INSERT INTO balances (id, tenant_id, member_id, target_kind, target_id, currency, amount)
         VALUES (?, ?, ?, 'subscription', ?, 'ARS', 65000)`,
        [BALANCE_ID_21, TENANT_TEMPLO, ACTIVE_USER_ID, SUB_ACTIVE_ID],
      );

      // Program enrollment dangling under the deleted user.
      await conn.query(
        `INSERT INTO program_enrollments (id, user_id, program_id, status)
         VALUES (?, ?, ?, 'active')`,
        [ENROLLMENT_ID, DELETED_USER_ID, testProgramId],
      );

      // Owner-fallback fixture: temporarily downgrade any owner-role users so
      // the migration's COALESCE((SELECT id FROM users WHERE role='owner'...), 1)
      // takes the fallback branch. Also guarantee user id 1 exists so the FK
      // on audit_log.actor_id resolves — in production the founder seed sits
      // at id 1, but per-worker test DBs auto-increment from whatever the
      // migration seed populated first.
      if (opts?.omitOwnerRole) {
        await conn.query(
          `UPDATE users SET role = 'member' WHERE role = 'owner'`,
        );
        await conn.query(
          `INSERT IGNORE INTO users (id, email, password_hash, first_name, last_name, role, branch_id, level)
           VALUES (1, ?, ?, 'Fallback', 'Founder', 'member', ?, 'alfa')`,
          [`fallback-actor-1@test.local`, argonHash, testBranchId],
        );
      }

      await conn.query("SET FOREIGN_KEY_CHECKS=1");
    } finally {
      conn.release();
    }
  }

  /**
   * Restore any users we downgraded to 'member' for the owner-fallback test.
   * Only relevant after Test 4. Keeps the rest of the DB consistent so other
   * test files in this worker keep their seeded admin@test.com owner.
   */
  async function restoreOwnerRole(): Promise<void> {
    const conn = await app.dbPool.getConnection();
    try {
      await conn.query("SET FOREIGN_KEY_CHECKS=0");
      await conn.query(
        `UPDATE users SET role = 'owner' WHERE email = 'admin@test.com'`,
      );
      await conn.query("SET FOREIGN_KEY_CHECKS=1");
    } finally {
      conn.release();
    }
  }

  /**
   * Seed the TARGET state directly (the post-migration state). Used by Test 3
   * to verify that re-running the migration on already-migrated data is a
   * no-op.
   *
   * If opts.withAuditRow is true, also pre-insert the audit_log row so the
   * NOT EXISTS guard in the migration's INSERT statement matches and skips.
   */
  async function seedTargetState(opts?: {
    withAuditRow?: boolean;
  }): Promise<void> {
    const conn = await app.dbPool.getConnection();
    try {
      await conn.query("SET FOREIGN_KEY_CHECKS=0");

      // Same users as the buggy state.
      await conn.query(
        `INSERT INTO users (id, email, password_hash, first_name, last_name, role, branch_id, level, status, deleted_at)
         VALUES (?, ?, ?, ?, ?, 'member', ?, 'alfa', 'inactivo', NOW())`,
        [
          DELETED_USER_ID,
          `soledad-deleted-${DELETED_USER_ID}@test.local`,
          argonHash,
          "Soledad",
          "Mailland (deleted)",
          onlineBranchId,
        ],
      );
      await conn.query(
        `INSERT INTO users (id, email, password_hash, first_name, last_name, role, branch_id, level, status)
         VALUES (?, ?, ?, ?, ?, 'member', ?, 'alfa', 'prueba')`,
        [
          ACTIVE_USER_ID,
          `soledad-active-${ACTIVE_USER_ID}@test.local`,
          argonHash,
          "Soledad",
          "Mailland",
          testBranchId,
        ],
      );

      const today = new Date().toISOString().slice(0, 10);
      const future = new Date(Date.now() + 30 * 86400000)
        .toISOString()
        .slice(0, 10);
      for (const subRow of [
        { id: SUB_CANCELLED_ID, status: "cancelled", userId: DELETED_USER_ID },
        {
          id: SUB_OTHER_CANCELLED_ID,
          status: "cancelled",
          userId: DELETED_USER_ID,
        },
        {
          id: SUB_OTHER_CANCELLED_2_ID,
          status: "cancelled",
          userId: DELETED_USER_ID,
        },
        { id: SUB_ACTIVE_ID, status: "scheduled", userId: ACTIVE_USER_ID },
      ]) {
        await conn.query(
          `INSERT INTO subscriptions (id, user_id, plan_id, branch_id, subscription_status, start_date, end_date, price_paid, currency, price_type_applied)
           VALUES (?, ?, ?, ?, ?, ?, ?, 65000, 'ARS', 'regular')`,
          [
            subRow.id,
            subRow.userId,
            testPlanId,
            testBranchId,
            subRow.status,
            today,
            future,
          ],
        );
      }

      // Tx already reassigned to 5912.
      await conn.query(
        `INSERT INTO financial_transactions (id, tenant_id, member_id, kind, direction, amount, currency, payment_method, transaction_date, effective_date, branch_id, recorded_by)
         VALUES (?, ?, ?, 'plan_charge', 'inflow', 65000, 'ARS', 'cash', ?, ?, ?, ?)`,
        [
          TX_ID,
          TENANT_TEMPLO,
          ACTIVE_USER_ID,
          today,
          today,
          testBranchId,
          ACTIVE_USER_ID,
        ],
      );

      // Link already moved to sub 6382.
      await conn.query(
        `INSERT INTO transaction_links (tenant_id, transaction_id, target_kind, target_id, allocated_amount)
         VALUES (?, ?, 'subscription', ?, 65000)`,
        [TENANT_TEMPLO, TX_ID, SUB_ACTIVE_ID],
      );

      // Orphan balances 14, 16, 20 already deleted. Only id=21 remains, with
      // amount already zeroed by the prior run of step 4.
      await conn.query(
        `INSERT INTO balances (id, tenant_id, member_id, target_kind, target_id, currency, amount)
         VALUES (?, ?, ?, 'subscription', ?, 'ARS', 0)`,
        [BALANCE_ID_21, TENANT_TEMPLO, ACTIVE_USER_ID, SUB_ACTIVE_ID],
      );

      // Enrollment already cancelled.
      await conn.query(
        `INSERT INTO program_enrollments (id, user_id, program_id, status, cancelled_at)
         VALUES (?, ?, ?, 'cancelled', NOW())`,
        [ENROLLMENT_ID, DELETED_USER_ID, testProgramId],
      );

      // Optionally pre-insert the audit_log reconciliation row so the
      // NOT EXISTS guard in the migration trips and the INSERT is skipped.
      if (opts?.withAuditRow) {
        // Resolve an actor: the seed admin@test.com or fallback id 1.
        const [actorRows] = (await conn.query(
          `SELECT id FROM users WHERE role = 'owner' ORDER BY id LIMIT 1`,
        )) as unknown as [Array<{ id: number }>];
        const actorId = actorRows[0]?.id ?? 1;
        await conn.query(
          `INSERT INTO audit_log (actor_id, action, target_kind, target_id, payload_json, reason, created_at)
           VALUES (?, 'reconciliation', 'member', ?, ?, ?, NOW())`,
          [
            actorId,
            ACTIVE_USER_ID,
            JSON.stringify({
              originalMember: DELETED_USER_ID,
              mergedInto: ACTIVE_USER_ID,
              actions: [
                "tx_reassigned",
                "link_moved",
                "balances_cleared",
                "balance_zeroed",
                "enrollment_cancelled",
              ],
              transactionId: TX_ID,
              fromSubId: SUB_CANCELLED_ID,
              toSubId: SUB_ACTIVE_ID,
              enrollmentId: ENROLLMENT_ID,
            }),
            "Reconciliación caso Soledad Mailland — phase 111",
          ],
        );
      }

      await conn.query("SET FOREIGN_KEY_CHECKS=1");
    } finally {
      conn.release();
    }
  }

  /**
   * Motivo de la exencion `tenant-safe:` que se le antepone a CADA statement.
   *
   * La 0109 es un data-fix de una sola vez escrito en 2026-04, cuando `tenant_id`
   * todavia no existia: sus WHERE apuntan a ids literales de produccion y el
   * archivo de migracion es INMUTABLE (el `_migrations` de la base lo da por
   * aplicado). Acotarlo no es una opcion — habria que reescribir historia — y
   * dejarlo pelado hace throw con `finance` en `TENANT_STRICT_MODULES`. La
   * anotacion va ACA, en el punto de aplicacion del test, y NO en el .sql: en
   * produccion las migraciones no corren por el pool que el sentinel intercepta.
   */
  const MOTIVO_EXENCION =
    "/* tenant-safe: migracion historica 0109, data-fix de una sola vez sobre " +
    "ids literales de produccion, escrita antes de que existiera tenant_id */\n";

  async function applyMigration(): Promise<void> {
    for (const stmt of migrationStatements) {
      await app.db.execute(sql.raw(MOTIVO_EXENCION + stmt));
    }
  }

  /**
   * Capture the relevant state into a comparable snapshot. Used by the
   * idempotency tests to verify that re-running the migration changes
   * nothing.
   */
  async function captureSnapshot(): Promise<SnapshotShape> {
    const [tx] = (await app.db
      .select({ memberId: schema.financialTransactions.memberId })
      .from(schema.financialTransactions)
      .where(
        and(
          tenantWhere(schema.financialTransactions, TEMPLO_CTX),
          eq(schema.financialTransactions.id, TX_ID),
        ),
      )) as Array<{
      memberId: number;
    }>;

    const [link] = (await app.db
      .select({ targetId: schema.transactionLinks.targetId })
      .from(schema.transactionLinks)
      .where(
        and(
          tenantWhere(schema.transactionLinks, TEMPLO_CTX),
          eq(schema.transactionLinks.transactionId, TX_ID),
        ),
      )) as Array<{
      targetId: number;
    }>;

    const remainingBalances = (await app.db
      .select({ id: schema.balances.id })
      .from(schema.balances)
      .where(
        and(
          tenantWhere(schema.balances, TEMPLO_CTX),
          inArray(schema.balances.id, [
            BALANCE_ID_14,
            BALANCE_ID_16,
            BALANCE_ID_20,
          ]),
        ),
      )) as Array<{ id: number }>;

    const [bal6382] = (await app.db
      .select({ amount: schema.balances.amount })
      .from(schema.balances)
      .where(
        and(
          tenantWhere(schema.balances, TEMPLO_CTX),
          eq(schema.balances.targetKind, "subscription"),
          eq(schema.balances.targetId, SUB_ACTIVE_ID),
        ),
      )) as Array<{ amount: number }>;

    const [enrollment] = (await app.db
      .select({
        status: schema.programEnrollments.status,
        cancelledAt: schema.programEnrollments.cancelledAt,
      })
      .from(schema.programEnrollments)
      .where(eq(schema.programEnrollments.id, ENROLLMENT_ID))) as Array<{
      status: string;
      cancelledAt: Date | null;
    }>;

    const auditRows = (await app.db
      .select({
        actorId: schema.auditLog.actorId,
        reason: schema.auditLog.reason,
      })
      .from(schema.auditLog)
      .where(
        and(
          eq(schema.auditLog.action, "reconciliation"),
          eq(schema.auditLog.targetId, ACTIVE_USER_ID),
        ),
      )) as Array<{ actorId: number; reason: string | null }>;

    return {
      txMemberId: tx?.memberId ?? null,
      linkTargetId: link?.targetId ?? null,
      balanceIdsRemaining: remainingBalances.map((r) => r.id).sort(),
      balanceAmountFor6382: bal6382?.amount ?? null,
      enrollmentStatus: enrollment?.status ?? null,
      enrollmentCancelledAtIsNull: enrollment?.cancelledAt == null,
      auditCount: auditRows.length,
      auditReason: auditRows[0]?.reason ?? null,
      auditActorId: auditRows[0]?.actorId ?? null,
    };
  }

  beforeEach(async () => {
    await resetTouchedRows();
  });

  // ─── Test 1: source -> target ─────────────────────────────────────────
  it("Test 1: applies all 6 target-state changes from buggy state", async () => {
    await seedBuggyState();

    await applyMigration();

    // 1. financial_transactions.id=34 reassigned to 5912.
    const [txRow] = (await app.db
      .select({ memberId: schema.financialTransactions.memberId })
      .from(schema.financialTransactions)
      .where(
        and(
          tenantWhere(schema.financialTransactions, TEMPLO_CTX),
          eq(schema.financialTransactions.id, TX_ID),
        ),
      )) as Array<{
      memberId: number;
    }>;
    expect(txRow.memberId).toBe(ACTIVE_USER_ID);

    // 2. transaction_links for tx 34 now point at sub 6382.
    const [linkRow] = (await app.db
      .select({ targetId: schema.transactionLinks.targetId })
      .from(schema.transactionLinks)
      .where(
        and(
          tenantWhere(schema.transactionLinks, TEMPLO_CTX),
          eq(schema.transactionLinks.transactionId, TX_ID),
        ),
      )) as Array<{
      targetId: number;
    }>;
    expect(linkRow.targetId).toBe(SUB_ACTIVE_ID);

    // 3. Orphan balances 14, 16, 20 deleted.
    const remaining = (await app.db
      .select({ id: schema.balances.id })
      .from(schema.balances)
      .where(
        and(
          tenantWhere(schema.balances, TEMPLO_CTX),
          inArray(schema.balances.id, [
            BALANCE_ID_14,
            BALANCE_ID_16,
            BALANCE_ID_20,
          ]),
        ),
      )) as Array<{ id: number }>;
    expect(remaining).toHaveLength(0);

    // 4. Balance for sub 6382 explicitly zeroed.
    const [bal] = (await app.db
      .select({ amount: schema.balances.amount })
      .from(schema.balances)
      .where(
        and(
          tenantWhere(schema.balances, TEMPLO_CTX),
          eq(schema.balances.targetKind, "subscription"),
          eq(schema.balances.targetId, SUB_ACTIVE_ID),
        ),
      )) as Array<{ amount: number }>;
    expect(bal.amount).toBe(0);

    // 5. program_enrollments.id=1125 cancelled with cancelled_at set.
    const [enr] = (await app.db
      .select({
        status: schema.programEnrollments.status,
        cancelledAt: schema.programEnrollments.cancelledAt,
      })
      .from(schema.programEnrollments)
      .where(
        eq(schema.programEnrollments.id, ENROLLMENT_ID),
      )) as Array<EnrollmentRow>;
    expect(enr.status).toBe("cancelled");
    expect(enr.cancelledAt).not.toBeNull();

    // 6. audit_log row created with correct shape.
    const audits = (await app.db
      .select({
        actorId: schema.auditLog.actorId,
        action: schema.auditLog.action,
        targetKind: schema.auditLog.targetKind,
        targetId: schema.auditLog.targetId,
        reason: schema.auditLog.reason,
      })
      .from(schema.auditLog)
      .where(
        and(
          eq(schema.auditLog.action, "reconciliation"),
          eq(schema.auditLog.targetId, ACTIVE_USER_ID),
        ),
      )) as Array<{
      actorId: number;
      action: string;
      targetKind: string;
      targetId: number;
      reason: string | null;
    }>;
    expect(audits).toHaveLength(1);
    expect(audits[0].targetKind).toBe("member");
    expect(audits[0].reason).toMatch(/^Reconciliación caso Soledad Mailland/);
    expect(audits[0].actorId).toBeGreaterThan(0);
  });

  // ─── Test 2: idempotency via manual re-apply ───────────────────────────
  it("Test 2: re-applying after first run does not duplicate audit row or change state", async () => {
    await seedBuggyState();

    await applyMigration();
    const snapshot1 = await captureSnapshot();

    await applyMigration();
    const snapshot2 = await captureSnapshot();

    expect(snapshot2).toEqual(snapshot1);
    expect(snapshot2.auditCount).toBe(1);
    expect(snapshot2.txMemberId).toBe(ACTIVE_USER_ID);
    expect(snapshot2.linkTargetId).toBe(SUB_ACTIVE_ID);
    expect(snapshot2.balanceIdsRemaining).toEqual([]);
    expect(snapshot2.balanceAmountFor6382).toBe(0);
    expect(snapshot2.enrollmentStatus).toBe("cancelled");
    expect(snapshot2.enrollmentCancelledAtIsNull).toBe(false);
  });

  // ─── Test 3: idempotency starting from already-target state ────────────
  it("Test 3: applying when already in target state (with prior audit row) is a no-op", async () => {
    await seedTargetState({ withAuditRow: true });
    const before = await captureSnapshot();

    await applyMigration();
    const after = await captureSnapshot();

    expect(after).toEqual(before);
    expect(after.auditCount).toBe(1);
  });

  // ─── Test 4: actor_id falls back to 1 when no owner role exists ────────
  it("Test 4: falls back to user id 1 when no owner role exists", async () => {
    await seedBuggyState({ omitOwnerRole: true });

    try {
      await applyMigration();

      const [audit] = (await app.db
        .select({ actorId: schema.auditLog.actorId })
        .from(schema.auditLog)
        .where(
          and(
            eq(schema.auditLog.action, "reconciliation"),
            eq(schema.auditLog.targetId, ACTIVE_USER_ID),
          ),
        )) as Array<{ actorId: number }>;
      expect(audit.actorId).toBe(1);
    } finally {
      // Restore admin@test.com's owner role so subsequent test files in this
      // worker keep their fixture intact.
      await restoreOwnerRole();
    }
  });
});
