/**
 * Phase 114 Plan 01: integration tests for migration 0121 users lead fields.
 *
 * Coverage (per acceptance criteria of 114-01-PLAN.md):
 *   1. Schema shape: lead_status ENUM nullable no default, lead_notes TEXT
 *      nullable, created_by INT nullable.
 *   2. FK constraint users_created_by_users_id_fk → users(id), DELETE_RULE
 *      = SET NULL.
 *   3. Indexes idx_users_lead_status and idx_users_created_by exist on the
 *      users table.
 *   4. Drizzle round-trip: insert + select preserves lead_status, lead_notes,
 *      created_by (including the self-ref link).
 *   5. Idempotency: the migration row appears exactly once in _migrations.
 *
 * The migration was applied to the per-worker test DB by pnpm db:migrate
 * before the test suite started (test/setup.ts).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { sql, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { createTestApp, cleanAllTestData } from "../helpers";
import * as schema from "../../src/db/schema";

interface ColumnRow {
  COLUMN_NAME: string;
  DATA_TYPE: string;
  COLUMN_TYPE: string;
  IS_NULLABLE: string;
  COLUMN_DEFAULT: string | null;
}

interface FKRow {
  CONSTRAINT_NAME: string;
  TABLE_NAME: string;
  COLUMN_NAME: string;
  REFERENCED_TABLE_NAME: string | null;
  REFERENCED_COLUMN_NAME: string | null;
}

interface ReferentialRow {
  CONSTRAINT_NAME: string;
  DELETE_RULE: string;
}

interface IndexRow {
  INDEX_NAME: string;
  COLUMN_NAME: string;
}

interface CountRow {
  n: number;
}

async function getColumn(
  app: FastifyInstance,
  tableName: string,
  columnName: string,
): Promise<ColumnRow | undefined> {
  const result = (await app.db.execute(
    sql`SELECT COLUMN_NAME, DATA_TYPE, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = ${tableName}
          AND COLUMN_NAME = ${columnName}`,
  )) as unknown as [ColumnRow[]];
  const rows = Array.isArray(result) ? result[0] : (result as ColumnRow[]);
  return Array.isArray(rows) ? rows[0] : undefined;
}

describe("Migration 0121 — users lead fields", () => {
  let app: FastifyInstance;
  let presentialBranchId: number;

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
  });

  afterAll(async () => {
    await cleanAllTestData(app);
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
  });

  // ─── Test 1: column shape ──────────────────────────────────────────────
  it("Test 1: users has lead_status ENUM nullable with no default", async () => {
    const col = await getColumn(app, "users", "lead_status");
    expect(col).toBeDefined();
    expect(col?.DATA_TYPE.toLowerCase()).toBe("enum");
    expect(col?.IS_NULLABLE).toBe("YES");
    expect(col?.COLUMN_DEFAULT).toBeNull();
    const ct = col?.COLUMN_TYPE.toLowerCase() ?? "";
    expect(ct).toContain("en_seguimiento");
    expect(ct).toContain("cerrado");
    expect(ct).toContain("perdido");
  });

  it("Test 1b: users has lead_notes TEXT nullable", async () => {
    const col = await getColumn(app, "users", "lead_notes");
    expect(col).toBeDefined();
    expect(col?.DATA_TYPE.toLowerCase()).toBe("text");
    expect(col?.IS_NULLABLE).toBe("YES");
  });

  it("Test 1c: users has created_by INT nullable", async () => {
    const col = await getColumn(app, "users", "created_by");
    expect(col).toBeDefined();
    expect(col?.DATA_TYPE.toLowerCase()).toBe("int");
    expect(col?.IS_NULLABLE).toBe("YES");
  });

  // ─── Test 2: FK constraint ─────────────────────────────────────────────
  it("Test 2: users_created_by_users_id_fk → users(id) ON DELETE SET NULL", async () => {
    const fkResult = (await app.db.execute(
      sql`SELECT CONSTRAINT_NAME, TABLE_NAME, COLUMN_NAME,
                 REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
          FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
          WHERE TABLE_SCHEMA = DATABASE()
            AND CONSTRAINT_NAME = 'users_created_by_users_id_fk'
            AND REFERENCED_TABLE_NAME IS NOT NULL`,
    )) as unknown as [FKRow[]];
    const fkRows = Array.isArray(fkResult)
      ? fkResult[0]
      : (fkResult as FKRow[]);
    const fk = Array.isArray(fkRows) ? fkRows[0] : undefined;
    expect(fk).toBeDefined();
    expect(fk?.REFERENCED_TABLE_NAME).toBe("users");
    expect(fk?.REFERENCED_COLUMN_NAME).toBe("id");
    expect(fk?.COLUMN_NAME).toBe("created_by");

    const ruleResult = (await app.db.execute(
      sql`SELECT CONSTRAINT_NAME, DELETE_RULE
          FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS
          WHERE CONSTRAINT_SCHEMA = DATABASE()
            AND CONSTRAINT_NAME = 'users_created_by_users_id_fk'`,
    )) as unknown as [ReferentialRow[]];
    const ruleRows = Array.isArray(ruleResult)
      ? ruleResult[0]
      : (ruleResult as ReferentialRow[]);
    const rule = Array.isArray(ruleRows) ? ruleRows[0] : undefined;
    expect(rule).toBeDefined();
    expect(rule?.DELETE_RULE).toBe("SET NULL");
  });

  // ─── Test 3: indexes ───────────────────────────────────────────────────
  it("Test 3: idx_users_lead_status and idx_users_created_by exist", async () => {
    const idxResult = (await app.db.execute(
      sql`SELECT INDEX_NAME, COLUMN_NAME
          FROM INFORMATION_SCHEMA.STATISTICS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'users'
            AND INDEX_NAME IN ('idx_users_lead_status', 'idx_users_created_by')`,
    )) as unknown as [IndexRow[]];
    const idxRows = Array.isArray(idxResult)
      ? idxResult[0]
      : (idxResult as IndexRow[]);
    const names = new Set((idxRows ?? []).map((r) => r.INDEX_NAME));
    expect(names.has("idx_users_lead_status")).toBe(true);
    expect(names.has("idx_users_created_by")).toBe(true);

    const leadStatusIdx = idxRows.find(
      (r) => r.INDEX_NAME === "idx_users_lead_status",
    );
    expect(leadStatusIdx?.COLUMN_NAME).toBe("lead_status");
    const createdByIdx = idxRows.find(
      (r) => r.INDEX_NAME === "idx_users_created_by",
    );
    expect(createdByIdx?.COLUMN_NAME).toBe("created_by");
  });

  // ─── Test 4: drizzle round-trip ────────────────────────────────────────
  it("Test 4: drizzle insert+select preserves lead fields and self-ref FK", async () => {
    const passwordHash = "x".repeat(64);
    // Insert admin user (the lead creator) — no lead fields.
    const [adminRow] = await app.db
      .insert(schema.users)
      .values({
        email: `t4-admin-${Date.now()}@test.local`,
        passwordHash,
        firstName: "Admin",
        lastName: "Tester",
        role: "admin",
        branchId: presentialBranchId,
        level: "spartan",
      })
      .$returningId();

    // Insert lead created by the admin above.
    const [leadRow] = await app.db
      .insert(schema.users)
      .values({
        email: `t4-lead-${Date.now()}@test.local`,
        passwordHash,
        firstName: "Lead",
        lastName: "Tester",
        role: "member",
        branchId: presentialBranchId,
        status: "prueba",
        leadStatus: "en_seguimiento",
        leadNotes: "test note",
        createdBy: adminRow.id,
      })
      .$returningId();

    const [readBack] = await app.db
      .select({
        id: schema.users.id,
        leadStatus: schema.users.leadStatus,
        leadNotes: schema.users.leadNotes,
        createdBy: schema.users.createdBy,
        status: schema.users.status,
      })
      .from(schema.users)
      .where(eq(schema.users.id, leadRow.id))
      .limit(1);

    expect(readBack).toBeDefined();
    expect(readBack.leadStatus).toBe("en_seguimiento");
    expect(readBack.leadNotes).toBe("test note");
    expect(readBack.createdBy).toBe(adminRow.id);
    expect(readBack.status).toBe("prueba");

    // Sanity: a user inserted without lead fields keeps them NULL.
    const [bareRow] = await app.db
      .insert(schema.users)
      .values({
        email: `t4-bare-${Date.now()}@test.local`,
        passwordHash,
        firstName: "Bare",
        lastName: "User",
        role: "member",
        branchId: presentialBranchId,
      })
      .$returningId();

    const [bareReadBack] = await app.db
      .select({
        leadStatus: schema.users.leadStatus,
        leadNotes: schema.users.leadNotes,
        createdBy: schema.users.createdBy,
      })
      .from(schema.users)
      .where(eq(schema.users.id, bareRow.id))
      .limit(1);
    expect(bareReadBack.leadStatus).toBeNull();
    expect(bareReadBack.leadNotes).toBeNull();
    expect(bareReadBack.createdBy).toBeNull();
  });

  // ─── Test 5: idempotency — migration row count ─────────────────────────
  it("Test 5: _migrations has exactly one row for 0121_users_lead_fields.sql", async () => {
    const result = (await app.db.execute(
      sql`SELECT COUNT(*) AS n FROM _migrations WHERE name = '0121_users_lead_fields.sql'`,
    )) as unknown as [CountRow[]];
    const rows = Array.isArray(result) ? result[0] : (result as CountRow[]);
    const row = Array.isArray(rows) ? rows[0] : undefined;
    expect(Number(row?.n)).toBe(1);
  });
});
