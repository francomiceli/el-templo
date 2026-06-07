/**
 * Phase 133 Plan 01: integration tests for migration 0145 milestone exercise id.
 *
 * Coverage (per acceptance criteria of 133-01-PLAN.md):
 *   1. Schema shape: exercises.milestone_exercise_id INT nullable default NULL;
 *      exercise_milestone_proposals table with expected columns.
 *   2. FK constraints: exercises_milestone_exercise_id_exercises_id_fk (self-FK,
 *      DELETE_RULE = SET NULL), exercise_milestone_proposals_exercise_id_exercises_id_fk
 *      (DELETE_RULE = CASCADE), exercise_milestone_proposals_proposed_milestone_exercise_id_fk
 *      (DELETE_RULE = SET NULL).
 *   3. Indexes: exercises_milestone_idx on exercises; UNIQUE
 *      exercise_milestone_proposals_exercise_uq and
 *      exercise_milestone_proposals_status_idx on the proposals table.
 *   4. Drizzle round-trip: insert a milestone exercise + a variant pointing at
 *      it + a pending proposal, and read them back.
 *   5. Idempotency: the migration row appears exactly once in _migrations.
 *
 * The migration was applied to the per-worker test DB by pnpm db:migrate
 * before the test suite started (test/setup.ts).
 */
import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { sql, inArray, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { createTestApp } from "../helpers";
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
  NON_UNIQUE: number;
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

async function getFK(
  app: FastifyInstance,
  constraintName: string,
): Promise<{ fk: FKRow | undefined; deleteRule: string | undefined }> {
  const fkResult = (await app.db.execute(
    sql`SELECT CONSTRAINT_NAME, TABLE_NAME, COLUMN_NAME,
               REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
        FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = DATABASE()
          AND CONSTRAINT_NAME = ${constraintName}
          AND REFERENCED_TABLE_NAME IS NOT NULL`,
  )) as unknown as [FKRow[]];
  const fkRows = Array.isArray(fkResult) ? fkResult[0] : (fkResult as FKRow[]);
  const fk = Array.isArray(fkRows) ? fkRows[0] : undefined;

  const ruleResult = (await app.db.execute(
    sql`SELECT CONSTRAINT_NAME, DELETE_RULE
        FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS
        WHERE CONSTRAINT_SCHEMA = DATABASE()
          AND CONSTRAINT_NAME = ${constraintName}`,
  )) as unknown as [ReferentialRow[]];
  const ruleRows = Array.isArray(ruleResult)
    ? ruleResult[0]
    : (ruleResult as ReferentialRow[]);
  const rule = Array.isArray(ruleRows) ? ruleRows[0] : undefined;
  return { fk, deleteRule: rule?.DELETE_RULE };
}

async function getIndexes(
  app: FastifyInstance,
  tableName: string,
  indexNames: string[],
): Promise<IndexRow[]> {
  const namesList = sql.join(
    indexNames.map((n) => sql`${n}`),
    sql`, `,
  );
  const idxResult = (await app.db.execute(
    sql`SELECT INDEX_NAME, COLUMN_NAME, NON_UNIQUE
        FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = ${tableName}
          AND INDEX_NAME IN (${namesList})`,
  )) as unknown as [IndexRow[]];
  const idxRows = Array.isArray(idxResult)
    ? idxResult[0]
    : (idxResult as IndexRow[]);
  return Array.isArray(idxRows) ? idxRows : [];
}

describe("Migration 0145 — milestone exercise id", () => {
  let app: FastifyInstance;

  const seededIds: number[] = [];

  async function seedExercise(opts: {
    name: string;
    milestoneExerciseId?: number | null;
  }): Promise<number> {
    const [res] = await app.db
      .insert(schema.exercises)
      .values({
        pattern: "test",
        category: "test",
        exercise: opts.name,
        effort: "CON",
        route: "PULLR",
        dificultadLineal: 1,
        milestoneExerciseId: opts.milestoneExerciseId ?? null,
      })
      .$returningId();
    seededIds.push(res.id);
    return res.id;
  }

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterEach(async () => {
    if (seededIds.length > 0) {
      await app.db
        .delete(schema.exerciseMilestoneProposals)
        .where(
          inArray(schema.exerciseMilestoneProposals.exerciseId, seededIds),
        );
      await app.db
        .delete(schema.exercises)
        .where(inArray(schema.exercises.id, seededIds));
      seededIds.length = 0;
    }
  });

  afterAll(async () => {
    await app.close();
  });

  // ─── Test 1: column shapes ─────────────────────────────────────────────
  it("Test 1: exercises has milestone_exercise_id INT nullable default NULL", async () => {
    const col = await getColumn(app, "exercises", "milestone_exercise_id");
    expect(col).toBeDefined();
    expect(col?.DATA_TYPE.toLowerCase()).toBe("int");
    expect(col?.IS_NULLABLE).toBe("YES");
    expect(col?.COLUMN_DEFAULT).toBeNull();
  });

  it("Test 1b: exercise_milestone_proposals has the expected column shapes", async () => {
    const exerciseId = await getColumn(
      app,
      "exercise_milestone_proposals",
      "exercise_id",
    );
    expect(exerciseId).toBeDefined();
    expect(exerciseId?.DATA_TYPE.toLowerCase()).toBe("int");
    expect(exerciseId?.IS_NULLABLE).toBe("NO");

    const proposed = await getColumn(
      app,
      "exercise_milestone_proposals",
      "proposed_milestone_exercise_id",
    );
    expect(proposed).toBeDefined();
    expect(proposed?.DATA_TYPE.toLowerCase()).toBe("int");
    expect(proposed?.IS_NULLABLE).toBe("YES");

    const movementToken = await getColumn(
      app,
      "exercise_milestone_proposals",
      "movement_token",
    );
    expect(movementToken).toBeDefined();
    expect(movementToken?.COLUMN_TYPE.toLowerCase()).toBe("varchar(100)");
    expect(movementToken?.IS_NULLABLE).toBe("YES");

    const stepRank = await getColumn(
      app,
      "exercise_milestone_proposals",
      "step_rank",
    );
    expect(stepRank).toBeDefined();
    expect(stepRank?.DATA_TYPE.toLowerCase()).toBe("int");
    expect(stepRank?.IS_NULLABLE).toBe("YES");

    const status = await getColumn(
      app,
      "exercise_milestone_proposals",
      "status",
    );
    expect(status).toBeDefined();
    expect(status?.DATA_TYPE.toLowerCase()).toBe("enum");
    expect(status?.IS_NULLABLE).toBe("NO");
    expect(status?.COLUMN_DEFAULT).toBe("pending");
    const ct = status?.COLUMN_TYPE.toLowerCase() ?? "";
    expect(ct).toContain("pending");
    expect(ct).toContain("accepted");
    expect(ct).toContain("rejected");

    const engine = await getColumn(
      app,
      "exercise_milestone_proposals",
      "engine",
    );
    expect(engine).toBeDefined();
    expect(engine?.COLUMN_TYPE.toLowerCase()).toBe("varchar(30)");
    expect(engine?.IS_NULLABLE).toBe("NO");
  });

  // ─── Test 2: FK constraints ────────────────────────────────────────────
  it("Test 2: exercises_milestone_exercise_id_exercises_id_fk → exercises(id) ON DELETE SET NULL", async () => {
    const { fk, deleteRule } = await getFK(
      app,
      "exercises_milestone_exercise_id_exercises_id_fk",
    );
    expect(fk).toBeDefined();
    expect(fk?.TABLE_NAME).toBe("exercises");
    expect(fk?.COLUMN_NAME).toBe("milestone_exercise_id");
    expect(fk?.REFERENCED_TABLE_NAME).toBe("exercises");
    expect(fk?.REFERENCED_COLUMN_NAME).toBe("id");
    expect(deleteRule).toBe("SET NULL");
  });

  it("Test 2b: proposals exercise_id FK → exercises(id) ON DELETE CASCADE", async () => {
    const { fk, deleteRule } = await getFK(
      app,
      "exercise_milestone_proposals_exercise_id_exercises_id_fk",
    );
    expect(fk).toBeDefined();
    expect(fk?.TABLE_NAME).toBe("exercise_milestone_proposals");
    expect(fk?.COLUMN_NAME).toBe("exercise_id");
    expect(fk?.REFERENCED_TABLE_NAME).toBe("exercises");
    expect(fk?.REFERENCED_COLUMN_NAME).toBe("id");
    expect(deleteRule).toBe("CASCADE");
  });

  it("Test 2c: proposals proposed_milestone FK → exercises(id) ON DELETE SET NULL", async () => {
    const { fk, deleteRule } = await getFK(
      app,
      "exercise_milestone_proposals_proposed_milestone_exercise_id_fk",
    );
    expect(fk).toBeDefined();
    expect(fk?.TABLE_NAME).toBe("exercise_milestone_proposals");
    expect(fk?.COLUMN_NAME).toBe("proposed_milestone_exercise_id");
    expect(fk?.REFERENCED_TABLE_NAME).toBe("exercises");
    expect(fk?.REFERENCED_COLUMN_NAME).toBe("id");
    expect(deleteRule).toBe("SET NULL");
  });

  // ─── Test 3: indexes ───────────────────────────────────────────────────
  it("Test 3: exercises_milestone_idx exists on exercises", async () => {
    const idxRows = await getIndexes(app, "exercises", [
      "exercises_milestone_idx",
    ]);
    const idx = idxRows.find((r) => r.INDEX_NAME === "exercises_milestone_idx");
    expect(idx).toBeDefined();
    expect(idx?.COLUMN_NAME).toBe("milestone_exercise_id");
  });

  it("Test 3b: proposals has UNIQUE exercise_uq and status idx", async () => {
    const idxRows = await getIndexes(app, "exercise_milestone_proposals", [
      "exercise_milestone_proposals_exercise_uq",
      "exercise_milestone_proposals_status_idx",
    ]);
    const uq = idxRows.find(
      (r) => r.INDEX_NAME === "exercise_milestone_proposals_exercise_uq",
    );
    expect(uq).toBeDefined();
    expect(uq?.COLUMN_NAME).toBe("exercise_id");
    expect(Number(uq?.NON_UNIQUE)).toBe(0);

    const statusIdx = idxRows.find(
      (r) => r.INDEX_NAME === "exercise_milestone_proposals_status_idx",
    );
    expect(statusIdx).toBeDefined();
    expect(statusIdx?.COLUMN_NAME).toBe("status");
    expect(Number(statusIdx?.NON_UNIQUE)).toBe(1);
  });

  // ─── Test 4: drizzle round-trip ────────────────────────────────────────
  it("Test 4: drizzle insert+select preserves milestone link and pending proposal", async () => {
    // Hito (milestone): milestone_exercise_id stays NULL → backbone.
    const milestoneId = await seedExercise({ name: "T4 Pull Up (hito)" });

    // Variante colgando del hito.
    const variantId = await seedExercise({
      name: "T4 Pull Up supino (variante)",
      milestoneExerciseId: milestoneId,
    });

    // Propuesta pending: otro ejercicio propuesto como variante del hito.
    const candidateId = await seedExercise({ name: "T4 Pull Up anillas" });
    await app.db.insert(schema.exerciseMilestoneProposals).values({
      exerciseId: candidateId,
      proposedMilestoneExerciseId: milestoneId,
      movementToken: "pull_up",
      stepRank: 3,
      engine: "milestone-heuristic-v1",
      confidence: 80,
    });

    const [milestoneRow] = await app.db
      .select({
        id: schema.exercises.id,
        milestoneExerciseId: schema.exercises.milestoneExerciseId,
      })
      .from(schema.exercises)
      .where(eq(schema.exercises.id, milestoneId))
      .limit(1);
    expect(milestoneRow).toBeDefined();
    expect(milestoneRow.milestoneExerciseId).toBeNull();

    const [variantRow] = await app.db
      .select({
        id: schema.exercises.id,
        milestoneExerciseId: schema.exercises.milestoneExerciseId,
      })
      .from(schema.exercises)
      .where(eq(schema.exercises.id, variantId))
      .limit(1);
    expect(variantRow).toBeDefined();
    expect(variantRow.milestoneExerciseId).toBe(milestoneId);

    const [proposalRow] = await app.db
      .select({
        exerciseId: schema.exerciseMilestoneProposals.exerciseId,
        proposedMilestoneExerciseId:
          schema.exerciseMilestoneProposals.proposedMilestoneExerciseId,
        movementToken: schema.exerciseMilestoneProposals.movementToken,
        stepRank: schema.exerciseMilestoneProposals.stepRank,
        status: schema.exerciseMilestoneProposals.status,
        engine: schema.exerciseMilestoneProposals.engine,
        confidence: schema.exerciseMilestoneProposals.confidence,
      })
      .from(schema.exerciseMilestoneProposals)
      .where(eq(schema.exerciseMilestoneProposals.exerciseId, candidateId))
      .limit(1);
    expect(proposalRow).toBeDefined();
    expect(proposalRow.proposedMilestoneExerciseId).toBe(milestoneId);
    expect(proposalRow.movementToken).toBe("pull_up");
    expect(proposalRow.stepRank).toBe(3);
    expect(proposalRow.status).toBe("pending");
    expect(proposalRow.engine).toBe("milestone-heuristic-v1");
    expect(proposalRow.confidence).toBe(80);
  });

  // ─── Test 5: idempotency — migration row count ─────────────────────────
  it("Test 5: _migrations has exactly one row for 0145_milestone_exercise_id.sql", async () => {
    const result = (await app.db.execute(
      sql`SELECT COUNT(*) AS n FROM _migrations WHERE name = '0145_milestone_exercise_id.sql'`,
    )) as unknown as [CountRow[]];
    const rows = Array.isArray(result) ? result[0] : (result as CountRow[]);
    const row = Array.isArray(rows) ? rows[0] : undefined;
    expect(Number(row?.n)).toBe(1);
  });
});
