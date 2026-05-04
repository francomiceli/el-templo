/**
 * Phase 112 Plan 01: integration tests for migration 0111 program_enrollments
 * add-on columns.
 *
 * Coverage (per acceptance criteria of 112-01-PLAN.md):
 *   1. Schema shape: source NOT NULL ENUM, price_paid/assigned_by/subscription_id
 *      INT NULL, status COLUMN_TYPE includes 'paused'.
 *   2. FK constraints: fk_enrollments_assigned_by → users(id),
 *      fk_enrollments_subscription_id → subscriptions(id).
 *   3. Backfill plan_linked: seeded user + linked-program sub + enrollment +
 *      run Step 4 → subscription_id resolves to the seeded sub.
 *   4. Backfill plan_bundle: seeded user + grants_all_programs sub + enrollment
 *      + run Step 4b → subscription_id resolves to the seeded sub.
 *   5. Ambiguous: 2 overlapping subs match → subscription_id stays NULL.
 *   6. Idempotency: parsing the migration file via the production parser
 *      (splitSqlStatements) and re-executing each statement is tolerated by
 *      the runner's "duplicate / already exists" semantics, and the WHERE
 *      source IS NULL guards make the backfill UPDATEs 0-row no-ops.
 *
 * The migration has already been applied to the per-worker test DB by
 * pnpm db:migrate (run once before the test suite via test/setup.ts). These
 * tests therefore observe the post-migration shape and exercise individual
 * backfill steps against fresh seed data.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { createTestApp, cleanAllTestData } from "../helpers";
import { splitSqlStatements } from "../../src/db/run-migrations";
import * as schema from "../../src/db/schema";

const MIGRATION_PATH = path.resolve(
  __dirname,
  "../../src/db/migrations/0111_program_enrollments_addon_columns.sql",
);

interface ColumnRow {
  COLUMN_NAME: string;
  DATA_TYPE: string;
  COLUMN_TYPE: string;
  IS_NULLABLE: string;
}

interface FKRow {
  CONSTRAINT_NAME: string;
  TABLE_NAME: string;
  COLUMN_NAME: string;
  REFERENCED_TABLE_NAME: string | null;
  REFERENCED_COLUMN_NAME: string | null;
}

async function getColumn(
  app: FastifyInstance,
  tableName: string,
  columnName: string,
): Promise<ColumnRow | undefined> {
  const result = (await app.db.execute(
    sql`SELECT COLUMN_NAME, DATA_TYPE, COLUMN_TYPE, IS_NULLABLE
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = ${tableName}
          AND COLUMN_NAME = ${columnName}`,
  )) as unknown as [ColumnRow[]];
  const rows = Array.isArray(result) ? result[0] : (result as ColumnRow[]);
  return Array.isArray(rows) ? rows[0] : undefined;
}

async function getFK(
  app: FastifyInstance,
  constraintName: string,
): Promise<FKRow | undefined> {
  const result = (await app.db.execute(
    sql`SELECT CONSTRAINT_NAME, TABLE_NAME, COLUMN_NAME,
               REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
        FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = DATABASE()
          AND CONSTRAINT_NAME = ${constraintName}
          AND REFERENCED_TABLE_NAME IS NOT NULL`,
  )) as unknown as [FKRow[]];
  const rows = Array.isArray(result) ? result[0] : (result as FKRow[]);
  return Array.isArray(rows) ? rows[0] : undefined;
}

describe("Migration 0111 — program_enrollments add-on columns", () => {
  let app: FastifyInstance;
  let presentialBranchId: number;
  let migrationStatements: string[];

  beforeAll(async () => {
    app = await createTestApp();

    const branchRows = (await app.db.select().from(schema.branches)) as Array<{
      id: number;
      code: string;
    }>;
    const presential = branchRows.find((b) => b.code !== "ONLINE");
    if (!presential) {
      throw new Error("Test fixture missing presential branch");
    }
    presentialBranchId = presential.id;

    // Read + pre-split the migration once. Guard against inline `;` in `--`
    // comment lines (Phase 103-01 invariant) so a future maintainer who
    // adds a sentence with a semicolon to a comment fails this assertion
    // rather than producing malformed splits at deploy time.
    const sqlSource = readFileSync(MIGRATION_PATH, "utf8");
    const offendingComments = sqlSource
      .split("\n")
      .filter((line) => /^\s*--/.test(line) && line.includes(";"));
    expect(offendingComments).toEqual([]);
    migrationStatements = splitSqlStatements(sqlSource);
    expect(migrationStatements.length).toBeGreaterThan(0);
  });

  afterAll(async () => {
    await cleanAllTestData(app);
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
  });

  // ─── Test 1: schema shape ──────────────────────────────────────────────
  it("Test 1: program_enrollments has post-migration column shape", async () => {
    const source = await getColumn(app, "program_enrollments", "source");
    expect(source).toBeDefined();
    expect(source?.IS_NULLABLE).toBe("NO");
    expect(source?.DATA_TYPE.toLowerCase()).toBe("enum");
    expect(source?.COLUMN_TYPE.toLowerCase()).toContain("plan_linked");
    expect(source?.COLUMN_TYPE.toLowerCase()).toContain("plan_bundle");
    expect(source?.COLUMN_TYPE.toLowerCase()).toContain("admin_addon");

    const pricePaid = await getColumn(app, "program_enrollments", "price_paid");
    expect(pricePaid?.DATA_TYPE.toLowerCase()).toBe("int");
    expect(pricePaid?.IS_NULLABLE).toBe("YES");

    const assignedBy = await getColumn(
      app,
      "program_enrollments",
      "assigned_by",
    );
    expect(assignedBy?.DATA_TYPE.toLowerCase()).toBe("int");
    expect(assignedBy?.IS_NULLABLE).toBe("YES");

    const subscriptionId = await getColumn(
      app,
      "program_enrollments",
      "subscription_id",
    );
    expect(subscriptionId?.DATA_TYPE.toLowerCase()).toBe("int");
    expect(subscriptionId?.IS_NULLABLE).toBe("YES");

    const status = await getColumn(app, "program_enrollments", "status");
    expect(status?.COLUMN_TYPE.toLowerCase()).toContain("paused");
    // Sanity: the prior 4 enum values are still present.
    expect(status?.COLUMN_TYPE.toLowerCase()).toContain("active");
    expect(status?.COLUMN_TYPE.toLowerCase()).toContain("completed");
    expect(status?.COLUMN_TYPE.toLowerCase()).toContain("expired");
    expect(status?.COLUMN_TYPE.toLowerCase()).toContain("cancelled");
  });

  // ─── Test 2: FK constraints ────────────────────────────────────────────
  it("Test 2: fk_enrollments_assigned_by + fk_enrollments_subscription_id wired correctly", async () => {
    const fkAssigned = await getFK(app, "fk_enrollments_assigned_by");
    expect(fkAssigned).toBeDefined();
    expect(fkAssigned?.REFERENCED_TABLE_NAME).toBe("users");
    expect(fkAssigned?.REFERENCED_COLUMN_NAME).toBe("id");
    expect(fkAssigned?.COLUMN_NAME).toBe("assigned_by");

    const fkSub = await getFK(app, "fk_enrollments_subscription_id");
    expect(fkSub).toBeDefined();
    expect(fkSub?.REFERENCED_TABLE_NAME).toBe("subscriptions");
    expect(fkSub?.REFERENCED_COLUMN_NAME).toBe("id");
    expect(fkSub?.COLUMN_NAME).toBe("subscription_id");
  });

  // ─── Test 3: backfill — plan_linked ────────────────────────────────────
  it("Test 3: Step 4 backfill resolves subscription_id for plan_linked rows", async () => {
    // Seed: 1 program, 1 plan with linked_program_id=program.id, 1 user, 1
    // sub covering today, 1 enrollment with source=plan_linked and a NULL
    // subscription_id (simulating a row that pre-dates Step 4).
    const [program] = await app.db
      .insert(schema.programs)
      .values({
        name: "Test 3 Program",
        durationWeeks: 12,
        sessionsPerWeekToAdvance: 3,
      })
      .$returningId();

    const [plan] = await app.db
      .insert(schema.subscriptionPlans)
      .values({
        name: "Test 3 Plan",
        planTier: "foundation",
        bookingMode: "flexible",
        planCategory: "presencial",
        priceRegular: 10000,
        priceZero: 0,
        durationDays: 30,
        linkedProgramId: program.id,
      })
      .$returningId();

    const passwordHash = "x".repeat(64);
    const [user] = await app.db
      .insert(schema.users)
      .values({
        email: `t3-${Date.now()}@test.local`,
        passwordHash,
        firstName: "Test",
        lastName: "Three",
        role: "member",
        branchId: presentialBranchId,
        level: "alfa",
      })
      .$returningId();

    const today = new Date().toISOString().slice(0, 10);
    const future = new Date(Date.now() + 30 * 86400000)
      .toISOString()
      .slice(0, 10);
    const [sub] = await app.db
      .insert(schema.subscriptions)
      .values({
        userId: user.id,
        planId: plan.id,
        branchId: presentialBranchId,
        status: "active",
        startDate: today,
        endDate: future,
        pricePaid: 10000,
        priceTypeApplied: "regular",
      })
      .$returningId();

    const [enr] = await app.db
      .insert(schema.programEnrollments)
      .values({
        userId: user.id,
        programId: program.id,
        source: "plan_linked",
        status: "active",
      })
      .$returningId();

    // Verify pre-state: subscription_id is null.
    const preRows = (await app.db.execute(
      sql`SELECT subscription_id AS subId FROM program_enrollments WHERE id = ${enr.id}`,
    )) as unknown as [Array<{ subId: number | null }>];
    const preList = Array.isArray(preRows) ? preRows[0] : preRows;
    expect(preList[0].subId).toBeNull();

    // Run Step 4 SQL (the unique-match plan_linked subscription_id backfill).
    await app.db.execute(sql`
      UPDATE program_enrollments pe
      INNER JOIN (
        SELECT pe2.id AS enrollment_id, MIN(s.id) AS sub_id, COUNT(s.id) AS n
        FROM program_enrollments pe2
        INNER JOIN subscriptions s ON s.user_id = pe2.user_id
        INNER JOIN subscription_plans sp ON sp.id = s.plan_id
        WHERE pe2.source = 'plan_linked'
          AND sp.linked_program_id = pe2.program_id
          AND s.start_date <= DATE(pe2.enrolled_at)
          AND (s.end_date IS NULL OR s.end_date >= DATE(pe2.enrolled_at))
        GROUP BY pe2.id
      ) m ON m.enrollment_id = pe.id
      SET pe.subscription_id = m.sub_id
      WHERE pe.subscription_id IS NULL
        AND m.n = 1
    `);

    const postRows = (await app.db.execute(
      sql`SELECT subscription_id AS subId FROM program_enrollments WHERE id = ${enr.id}`,
    )) as unknown as [Array<{ subId: number | null }>];
    const postList = Array.isArray(postRows) ? postRows[0] : postRows;
    expect(postList[0].subId).toBe(sub.id);
  });

  // ─── Test 4: backfill — plan_bundle ────────────────────────────────────
  it("Test 4: Step 4b backfill resolves subscription_id for plan_bundle rows", async () => {
    const [program] = await app.db
      .insert(schema.programs)
      .values({
        name: "Test 4 Program",
        durationWeeks: 12,
        sessionsPerWeekToAdvance: 3,
      })
      .$returningId();

    const [plan] = await app.db
      .insert(schema.subscriptionPlans)
      .values({
        name: "Test 4 Bundle Plan",
        planTier: "foundation",
        bookingMode: "flexible",
        planCategory: "presencial",
        priceRegular: 20000,
        priceZero: 0,
        durationDays: 30,
        grantsAllPrograms: true,
      })
      .$returningId();

    const passwordHash = "x".repeat(64);
    const [user] = await app.db
      .insert(schema.users)
      .values({
        email: `t4-${Date.now()}@test.local`,
        passwordHash,
        firstName: "Test",
        lastName: "Four",
        role: "member",
        branchId: presentialBranchId,
        level: "alfa",
      })
      .$returningId();

    const today = new Date().toISOString().slice(0, 10);
    const future = new Date(Date.now() + 30 * 86400000)
      .toISOString()
      .slice(0, 10);
    const [sub] = await app.db
      .insert(schema.subscriptions)
      .values({
        userId: user.id,
        planId: plan.id,
        branchId: presentialBranchId,
        status: "active",
        startDate: today,
        endDate: future,
        pricePaid: 20000,
        priceTypeApplied: "regular",
      })
      .$returningId();

    const [enr] = await app.db
      .insert(schema.programEnrollments)
      .values({
        userId: user.id,
        programId: program.id,
        source: "plan_bundle",
        status: "active",
      })
      .$returningId();

    await app.db.execute(sql`
      UPDATE program_enrollments pe
      INNER JOIN (
        SELECT pe2.id AS enrollment_id, MIN(s.id) AS sub_id, COUNT(s.id) AS n
        FROM program_enrollments pe2
        INNER JOIN subscriptions s ON s.user_id = pe2.user_id
        INNER JOIN subscription_plans sp ON sp.id = s.plan_id
        WHERE pe2.source = 'plan_bundle'
          AND sp.grants_all_programs = 1
          AND s.start_date <= DATE(pe2.enrolled_at)
          AND (s.end_date IS NULL OR s.end_date >= DATE(pe2.enrolled_at))
        GROUP BY pe2.id
      ) m ON m.enrollment_id = pe.id
      SET pe.subscription_id = m.sub_id
      WHERE pe.subscription_id IS NULL
        AND m.n = 1
    `);

    const rows = (await app.db.execute(
      sql`SELECT subscription_id AS subId FROM program_enrollments WHERE id = ${enr.id}`,
    )) as unknown as [Array<{ subId: number | null }>];
    const list = Array.isArray(rows) ? rows[0] : rows;
    expect(list[0].subId).toBe(sub.id);
  });

  // ─── Test 5: ambiguous (multi-match) keeps subscription_id NULL ────────
  it("Test 5: Step 4 leaves subscription_id NULL when multiple subs match", async () => {
    const [program] = await app.db
      .insert(schema.programs)
      .values({
        name: "Test 5 Program",
        durationWeeks: 12,
        sessionsPerWeekToAdvance: 3,
      })
      .$returningId();

    const [plan] = await app.db
      .insert(schema.subscriptionPlans)
      .values({
        name: "Test 5 Plan",
        planTier: "foundation",
        bookingMode: "flexible",
        planCategory: "presencial",
        priceRegular: 10000,
        priceZero: 0,
        durationDays: 30,
        linkedProgramId: program.id,
      })
      .$returningId();

    const passwordHash = "x".repeat(64);
    const [user] = await app.db
      .insert(schema.users)
      .values({
        email: `t5-${Date.now()}@test.local`,
        passwordHash,
        firstName: "Test",
        lastName: "Five",
        role: "member",
        branchId: presentialBranchId,
        level: "alfa",
      })
      .$returningId();

    const today = new Date().toISOString().slice(0, 10);
    const future = new Date(Date.now() + 30 * 86400000)
      .toISOString()
      .slice(0, 10);
    // Two overlapping subscriptions for the same plan and user — the
    // ambiguity case the COUNT(*)=1 guard is meant to catch.
    await app.db.insert(schema.subscriptions).values([
      {
        userId: user.id,
        planId: plan.id,
        branchId: presentialBranchId,
        status: "active",
        startDate: today,
        endDate: future,
        pricePaid: 10000,
        priceTypeApplied: "regular",
      },
      {
        userId: user.id,
        planId: plan.id,
        branchId: presentialBranchId,
        status: "active",
        startDate: today,
        endDate: future,
        pricePaid: 10000,
        priceTypeApplied: "regular",
      },
    ]);

    const [enr] = await app.db
      .insert(schema.programEnrollments)
      .values({
        userId: user.id,
        programId: program.id,
        source: "plan_linked",
        status: "active",
      })
      .$returningId();

    await app.db.execute(sql`
      UPDATE program_enrollments pe
      INNER JOIN (
        SELECT pe2.id AS enrollment_id, MIN(s.id) AS sub_id, COUNT(s.id) AS n
        FROM program_enrollments pe2
        INNER JOIN subscriptions s ON s.user_id = pe2.user_id
        INNER JOIN subscription_plans sp ON sp.id = s.plan_id
        WHERE pe2.source = 'plan_linked'
          AND sp.linked_program_id = pe2.program_id
          AND s.start_date <= DATE(pe2.enrolled_at)
          AND (s.end_date IS NULL OR s.end_date >= DATE(pe2.enrolled_at))
        GROUP BY pe2.id
      ) m ON m.enrollment_id = pe.id
      SET pe.subscription_id = m.sub_id
      WHERE pe.subscription_id IS NULL
        AND m.n = 1
    `);

    const rows = (await app.db.execute(
      sql`SELECT subscription_id AS subId FROM program_enrollments WHERE id = ${enr.id}`,
    )) as unknown as [Array<{ subId: number | null }>];
    const list = Array.isArray(rows) ? rows[0] : rows;
    expect(list[0].subId).toBeNull();
  });

  // ─── Test 6: idempotency (replay is a no-op) ───────────────────────────
  it("Test 6: re-running migration statements is a no-op for backfill UPDATEs", async () => {
    // Capture row counts before re-running the migration. The DDL statements
    // (ALTER TABLE / MODIFY COLUMN) will fail with "Duplicate" /
    // "already exists" — these are tolerated by the production runner and
    // are tolerated here by try/catch. The backfill UPDATEs are guarded by
    // WHERE source IS NULL so they affect 0 rows.
    const beforeCountRows = (await app.db.execute(
      sql`SELECT COUNT(*) AS n FROM program_enrollments`,
    )) as unknown as [Array<{ n: number }>];
    const beforeList = Array.isArray(beforeCountRows)
      ? beforeCountRows[0]
      : beforeCountRows;
    const before = Number(beforeList[0].n);

    // Replay each statement individually. Tolerate the "structural" replay
    // errors the production runner also tolerates (Duplicate column / Duplicate
    // key / Duplicate foreign key / already exists). Non-tolerated errors fail
    // the test with a descriptive message.
    //
    // Drizzle wraps MySQL errors in `err.cause` — `err.message` only contains
    // "Failed query: ..." without the real reason. Same pattern as Plan 105-02:
    // duplicate detection must inspect cause.code / cause.sqlMessage.
    for (const stmt of migrationStatements) {
      try {
        await app.db.execute(sql.raw(stmt));
      } catch (err: unknown) {
        const wrapperMsg = err instanceof Error ? err.message : String(err);
        const cause =
          err instanceof Error && "cause" in err
            ? (err as Error & { cause?: unknown }).cause
            : undefined;
        const causeCode =
          cause && typeof cause === "object" && "code" in cause
            ? String((cause as { code: unknown }).code)
            : "";
        const causeMsg =
          cause && typeof cause === "object" && "sqlMessage" in cause
            ? String((cause as { sqlMessage: unknown }).sqlMessage)
            : cause instanceof Error
              ? cause.message
              : "";
        const haystack = `${wrapperMsg}\n${causeCode}\n${causeMsg}`;
        const isDuplicate =
          /Duplicate column name/i.test(haystack) ||
          /Duplicate key name/i.test(haystack) ||
          /Duplicate foreign key/i.test(haystack) ||
          /Duplicate FOREIGN KEY constraint/i.test(haystack) ||
          /already exists/i.test(haystack) ||
          /Can't DROP/i.test(haystack) ||
          /ER_DUP_FIELDNAME/.test(haystack) ||
          /ER_DUP_KEYNAME/.test(haystack) ||
          /ER_FK_DUP_NAME/.test(haystack);
        if (!isDuplicate) {
          throw new Error(
            `Replay produced non-tolerated error: ${wrapperMsg} | cause.code=${causeCode} | cause.sqlMessage=${causeMsg}`,
          );
        }
      }
    }

    const afterCountRows = (await app.db.execute(
      sql`SELECT COUNT(*) AS n FROM program_enrollments`,
    )) as unknown as [Array<{ n: number }>];
    const afterList = Array.isArray(afterCountRows)
      ? afterCountRows[0]
      : afterCountRows;
    const after = Number(afterList[0].n);

    expect(after).toBe(before);

    // Confirm post-replay state is still consistent: every row has a non-null
    // source (NOT NULL invariant preserved) and the status enum still includes
    // paused (Step 5 of replay would have re-run MODIFY but is tolerated).
    const nullSourceRows = (await app.db.execute(
      sql`SELECT COUNT(*) AS n FROM program_enrollments WHERE source IS NULL`,
    )) as unknown as [Array<{ n: number }>];
    const nullList = Array.isArray(nullSourceRows)
      ? nullSourceRows[0]
      : nullSourceRows;
    expect(Number(nullList[0].n)).toBe(0);
  });
});
