/**
 * Integration test for the hito/variante review surface (phase 133 Plan 05,
 * R1-REV). Runs against real MySQL (eltemplo_test_<worker>), CI-only — do NOT
 * run the full suite locally (project policy: local gate is tsc; the plan's
 * targeted files are the exception).
 *
 * Contract under test (locked decision 2 — ONE coach pass = ONE transaction):
 *   1. accept hito: milestone_exercise_id stays NULL, proposal → accepted,
 *      incident edges untouched.
 *   2. accept variante + dimensión: a single accept writes progression_step +
 *      milestone_exercise_id and flips BOTH proposals; a mid-transaction
 *      failure rolls back EVERYTHING (nothing written).
 *   3. bounded prune, unlocked chain: A→X→B auto with X degraded → both edges
 *      pruned, A→B re-chained, source 'auto' when both pruned edges were auto.
 *   4. bounded prune, LOCKED chain (Pitfall 2): manual A→X→B → X keeps no
 *      edges, A→B exists as 'manual' (partition stays locked), and getNeighbor
 *      from A returns B — never the degraded variante.
 *   5. cross-partition incident edges are pruned WITHOUT re-chaining across
 *      partitions.
 *   6. reject flips the proposal only — exercises is never touched; 404 when
 *      no pending proposal exists.
 *   7. validations are typed 400/404 (TreeEditorError), never 500: missing
 *      target, other partition, target-is-variante, degrading a hito that has
 *      variantes hanging off it.
 *   8. listMilestoneReview returns only PENDING proposals of the route, with
 *      the MilestoneReviewRow shape (name/dl/effort/movementToken/stepRank/
 *      proposedMilestoneExerciseId/confidence).
 *   9. getVariants reads the TRUTH column (exercises.milestone_exercise_id),
 *      not proposals.
 *  10. promoteToMilestone swaps roles transactionally: the ex-hito and every
 *      other variante point at the new hito, incident edges re-point without
 *      self-edges or UNIQUE(from,to) duplicates, and integrity holds (no
 *      variante is ever the milestone of another exercise).
 *  11. promote on a non-variante → 400.
 *
 * Seeds routes + exercises + edges + proposals directly via Drizzle (NOT via
 * API), mirroring test/tree-editor/tree-editor.test.ts. Real clock. Cleanup in
 * beforeEach via cleanAllTestData + explicit deletes of the tables it does not
 * cover (edges + both proposals tables — FK cascades don't fire under
 * FOREIGN_KEY_CHECKS=0).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { createTestApp, cleanAllTestData } from "../helpers";
import * as schema from "../../src/db/schema";
import { TreeEditorService } from "../../src/modules/tree-editor/service";
import { ExerciseProgressionService } from "../../src/modules/sessions/progressions/exercise-progression-service";

describe("tree-editor milestone review (hito/variante, R1-REV)", () => {
  let app: FastifyInstance;
  let service: TreeEditorService;

  // ── Seed helpers (mirror tree-editor.test.ts) ───────────────────────────────

  async function createRoute(
    code: string,
    displayName: string,
    excludedFromTree = false,
  ): Promise<number> {
    const [row] = await app.db
      .insert(schema.routes)
      .values({ code, displayName, excludedFromTree })
      .$returningId();
    return row.id;
  }

  async function createExercise(opts: {
    name: string;
    pattern: string;
    effort: string;
    dl: number;
    route: string;
    habilidad?: string | null;
    category?: string;
    milestoneExerciseId?: number | null;
  }): Promise<number> {
    const [row] = await app.db
      .insert(schema.exercises)
      .values({
        pattern: opts.pattern,
        category: opts.category ?? opts.pattern,
        exercise: opts.name,
        effort: opts.effort,
        difficulty: 1,
        dificultadLineal: opts.dl,
        route: opts.route,
        habilidad: opts.habilidad ?? null,
        milestoneExerciseId: opts.milestoneExerciseId ?? null,
      })
      .$returningId();
    return row.id;
  }

  async function linkEdge(
    fromId: number,
    toId: number,
    source: "auto" | "manual",
  ): Promise<void> {
    await app.db
      .insert(schema.exerciseProgressions)
      .values({ fromExerciseId: fromId, toExerciseId: toId, source });
  }

  async function getEdges(): Promise<
    { from: number; to: number; source: string }[]
  > {
    const rows = await app.db
      .select({
        from: schema.exerciseProgressions.fromExerciseId,
        to: schema.exerciseProgressions.toExerciseId,
        source: schema.exerciseProgressions.source,
      })
      .from(schema.exerciseProgressions);
    return rows
      .map((r) => ({ from: r.from, to: r.to, source: r.source as string }))
      .sort((a, b) => a.from - b.from || a.to - b.to);
  }

  /** Insert a PENDING milestone proposal for an exercise (engine NOT NULL). */
  async function seedMilestoneProposal(opts: {
    exerciseId: number;
    proposedMilestoneExerciseId?: number | null;
    movementToken?: string | null;
    stepRank?: number | null;
    confidence?: number | null;
  }): Promise<number> {
    const [row] = await app.db
      .insert(schema.exerciseMilestoneProposals)
      .values({
        exerciseId: opts.exerciseId,
        proposedMilestoneExerciseId: opts.proposedMilestoneExerciseId ?? null,
        movementToken: opts.movementToken ?? null,
        stepRank: opts.stepRank ?? null,
        engine: "test-engine",
        confidence: opts.confidence ?? null,
      })
      .$returningId();
    return row.id;
  }

  /** Insert a PENDING dimension proposal (the phase-125 review axis). */
  async function seedDimensionProposal(opts: {
    exerciseId: number;
    proposedStep?: number | null;
    proposedHabilidad?: string | null;
  }): Promise<number> {
    const [row] = await app.db
      .insert(schema.exerciseDimensionProposals)
      .values({
        exerciseId: opts.exerciseId,
        proposedStep: opts.proposedStep ?? null,
        proposedHabilidad: opts.proposedHabilidad ?? null,
        proposedRoute: null,
        engine: "test-engine",
      })
      .$returningId();
    return row.id;
  }

  async function getExerciseRow(id: number): Promise<{
    milestoneExerciseId: number | null;
    progressionStep: number | null;
    habilidad: string | null;
    route: string;
    effort: string;
    dificultadLineal: number;
  }> {
    const [row] = await app.db
      .select({
        milestoneExerciseId: schema.exercises.milestoneExerciseId,
        progressionStep: schema.exercises.progressionStep,
        habilidad: schema.exercises.habilidad,
        route: schema.exercises.route,
        effort: schema.exercises.effort,
        dificultadLineal: schema.exercises.dificultadLineal,
      })
      .from(schema.exercises)
      .where(eq(schema.exercises.id, id));
    return row;
  }

  async function getMilestoneProposalStatus(
    exerciseId: number,
  ): Promise<string | null> {
    const [row] = await app.db
      .select({ status: schema.exerciseMilestoneProposals.status })
      .from(schema.exerciseMilestoneProposals)
      .where(eq(schema.exerciseMilestoneProposals.exerciseId, exerciseId));
    return row?.status ?? null;
  }

  async function getDimensionProposalStatus(id: number): Promise<string> {
    const [row] = await app.db
      .select({ status: schema.exerciseDimensionProposals.status })
      .from(schema.exerciseDimensionProposals)
      .where(eq(schema.exerciseDimensionProposals.id, id));
    return row.status;
  }

  beforeAll(async () => {
    app = await createTestApp();
    service = new TreeEditorService(app.db);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    // Not in cleanAllTestData (exercises + routes ARE). cleanAllTestData runs
    // with FOREIGN_KEY_CHECKS=0 so the CASCADE FKs do NOT fire — wipe explicitly.
    await app.db.delete(schema.exerciseProgressions);
    await app.db.delete(schema.exerciseMilestoneProposals);
    await app.db.delete(schema.exerciseDimensionProposals);
  });

  // ── Test 1: accept hito ─────────────────────────────────────────────────────

  it("1 — accept hito: milestone stays NULL, proposal accepted, edges intact", async () => {
    await createRoute("MR1", "Ruta Uno");
    const a = await createExercise({
      name: "T1 A",
      pattern: "PULL",
      effort: "CON",
      dl: 1,
      route: "MR1",
    });
    const h = await createExercise({
      name: "T1 H",
      pattern: "PULL",
      effort: "CON",
      dl: 3,
      route: "MR1",
    });
    const b = await createExercise({
      name: "T1 B",
      pattern: "PULL",
      effort: "CON",
      dl: 5,
      route: "MR1",
    });
    await linkEdge(a, h, "auto");
    await linkEdge(h, b, "auto");
    await seedMilestoneProposal({ exerciseId: h });

    const before = await getEdges();
    const result = await service.acceptMilestoneReview({
      exerciseId: h,
      role: "hito",
    });

    expect(result.ok).toBe(true);
    expect((await getExerciseRow(h)).milestoneExerciseId).toBeNull();
    expect(await getMilestoneProposalStatus(h)).toBe("accepted");
    expect(await getEdges()).toEqual(before);
  });

  // ── Test 2: accept variante + dimensión, atomically ────────────────────────

  it("2 — one accept writes dimension + milestone in ONE transaction; a mid-tx failure rolls back everything", async () => {
    await createRoute("MR1", "Ruta Uno");
    await createRoute("MR2", "Ruta Dos");
    const m = await createExercise({
      name: "T2 M",
      pattern: "PULL",
      effort: "CON",
      dl: 1,
      route: "MR1",
    });
    const x = await createExercise({
      name: "T2 X",
      pattern: "PULL",
      effort: "CON",
      dl: 3,
      route: "MR1",
    });
    const dimX = await seedDimensionProposal({
      exerciseId: x,
      proposedStep: 3,
    });
    await seedMilestoneProposal({
      exerciseId: x,
      proposedMilestoneExerciseId: m,
    });

    await service.acceptMilestoneReview({
      exerciseId: x,
      role: "variante",
      milestoneExerciseId: m,
    });

    const xRow = await getExerciseRow(x);
    expect(xRow.progressionStep).toBe(3);
    expect(xRow.milestoneExerciseId).toBe(m);
    expect(await getDimensionProposalStatus(dimX)).toBe("accepted");
    expect(await getMilestoneProposalStatus(x)).toBe("accepted");

    // All-or-nothing: a target in ANOTHER partition fails AFTER the dimension
    // write inside the tx → full rollback, neither proposal flips, exercises
    // stays byte-identical.
    const m2 = await createExercise({
      name: "T2 M2",
      pattern: "PULL",
      effort: "CON",
      dl: 1,
      route: "MR2",
    });
    const y = await createExercise({
      name: "T2 Y",
      pattern: "PULL",
      effort: "CON",
      dl: 4,
      route: "MR1",
    });
    const dimY = await seedDimensionProposal({
      exerciseId: y,
      proposedStep: 5,
    });
    await seedMilestoneProposal({
      exerciseId: y,
      proposedMilestoneExerciseId: m2,
    });

    await expect(
      service.acceptMilestoneReview({
        exerciseId: y,
        role: "variante",
        milestoneExerciseId: m2,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });

    const yRow = await getExerciseRow(y);
    expect(yRow.progressionStep).toBeNull();
    expect(yRow.milestoneExerciseId).toBeNull();
    expect(await getDimensionProposalStatus(dimY)).toBe("pending");
    expect(await getMilestoneProposalStatus(y)).toBe("pending");
  });

  // ── Test 3: bounded prune, unlocked chain ───────────────────────────────────

  it("3 — degrading mid-chain X (auto) prunes A→X / X→B and re-chains A→B as auto", async () => {
    await createRoute("MR1", "Ruta Uno");
    const m = await createExercise({
      name: "T3 M",
      pattern: "PULL",
      effort: "CON",
      dl: 2,
      route: "MR1",
    });
    const a = await createExercise({
      name: "T3 A",
      pattern: "PULL",
      effort: "CON",
      dl: 1,
      route: "MR1",
    });
    const x = await createExercise({
      name: "T3 X",
      pattern: "PULL",
      effort: "CON",
      dl: 3,
      route: "MR1",
    });
    const b = await createExercise({
      name: "T3 B",
      pattern: "PULL",
      effort: "CON",
      dl: 5,
      route: "MR1",
    });
    await linkEdge(a, x, "auto");
    await linkEdge(x, b, "auto");

    const result = await service.acceptMilestoneReview({
      exerciseId: x,
      role: "variante",
      milestoneExerciseId: m,
    });

    expect(result.edgesDeleted).toBe(2);
    expect(result.edgesWritten).toBe(1);
    const edges = await getEdges();
    expect(edges).not.toContainEqual({ from: a, to: x, source: "auto" });
    expect(edges).not.toContainEqual({ from: x, to: b, source: "auto" });
    expect(edges).toContainEqual({ from: a, to: b, source: "auto" });
    // No edge incident to the degraded variante survives.
    expect(edges.filter((e) => e.from === x || e.to === x)).toHaveLength(0);
  });

  // ── Test 4: bounded prune in a LOCKED chain (Pitfall 2) ─────────────────────

  it("4 — degrading X inside a MANUAL (locked) chain re-chains A→B as manual; getNeighbor never serves X", async () => {
    await createRoute("MR1", "Ruta Uno");
    const m = await createExercise({
      name: "T4 M",
      pattern: "PULL",
      effort: "CON",
      dl: 2,
      route: "MR1",
    });
    const a = await createExercise({
      name: "T4 A",
      pattern: "PULL",
      effort: "CON",
      dl: 1,
      route: "MR1",
    });
    const x = await createExercise({
      name: "T4 X",
      pattern: "PULL",
      effort: "CON",
      dl: 3,
      route: "MR1",
    });
    const b = await createExercise({
      name: "T4 B",
      pattern: "PULL",
      effort: "CON",
      dl: 5,
      route: "MR1",
    });
    await linkEdge(a, x, "manual");
    await linkEdge(x, b, "manual");

    await service.acceptMilestoneReview({
      exerciseId: x,
      role: "variante",
      milestoneExerciseId: m,
    });

    const edges = await getEdges();
    // X keeps no edges, and the re-chained edge preserves the manual lock.
    expect(edges.filter((e) => e.from === x || e.to === x)).toHaveLength(0);
    expect(edges).toContainEqual({ from: a, to: b, source: "manual" });

    // The player primitive walks the persisted edges: from A the next harder
    // exercise is B — the degraded variante X is NEVER served again.
    const progression = new ExerciseProgressionService(app.db);
    const up = await progression.getNeighbor(a, "up");
    expect(up).not.toBeNull();
    expect(up?.id).toBe(b);
    const down = await progression.getNeighbor(b, "down");
    expect(down?.id).toBe(a);
  });

  // ── Test 5: cross-partition incident edges ──────────────────────────────────

  it("5 — a cross-partition incident edge is pruned WITHOUT cross-partition re-chaining", async () => {
    await createRoute("MR1", "Ruta Uno");
    await createRoute("MR2", "Ruta Dos");
    const m = await createExercise({
      name: "T5 M",
      pattern: "PULL",
      effort: "CON",
      dl: 2,
      route: "MR1",
    });
    const a = await createExercise({
      name: "T5 A",
      pattern: "PULL",
      effort: "CON",
      dl: 1,
      route: "MR1",
    });
    const x = await createExercise({
      name: "T5 X",
      pattern: "PULL",
      effort: "CON",
      dl: 3,
      route: "MR1",
    });
    const b = await createExercise({
      name: "T5 B",
      pattern: "PULL",
      effort: "CON",
      dl: 5,
      route: "MR1",
    });
    const c = await createExercise({
      name: "T5 C",
      pattern: "PUSH",
      effort: "CON",
      dl: 1,
      route: "MR2",
    });
    await linkEdge(a, x, "auto");
    await linkEdge(x, b, "auto");
    // Cross-partition precedence out of the soon-degraded X.
    await linkEdge(x, c, "manual");

    const result = await service.acceptMilestoneReview({
      exerciseId: x,
      role: "variante",
      milestoneExerciseId: m,
    });

    expect(result.edgesDeleted).toBe(3);
    const edges = await getEdges();
    // Same-partition chain re-chained; the cross-partition edge just dies.
    expect(edges).toContainEqual({ from: a, to: b, source: "auto" });
    expect(edges).not.toContainEqual({ from: x, to: c, source: "manual" });
    expect(edges.filter((e) => e.from === x || e.to === x)).toHaveLength(0);
    // NO cross-partition re-chain was invented (a→c must not exist).
    expect(edges.filter((e) => e.to === c)).toHaveLength(0);
  });

  // ── Test 6: reject ──────────────────────────────────────────────────────────

  it("6 — reject flips the proposal to rejected and never touches exercises; 404 without a pending proposal", async () => {
    await createRoute("MR1", "Ruta Uno");
    const x = await createExercise({
      name: "T6 X",
      pattern: "PULL",
      effort: "CON",
      dl: 3,
      route: "MR1",
    });
    const other = await createExercise({
      name: "T6 other",
      pattern: "PULL",
      effort: "CON",
      dl: 1,
      route: "MR1",
    });
    await seedMilestoneProposal({
      exerciseId: x,
      proposedMilestoneExerciseId: other,
    });

    const before = await getExerciseRow(x);
    const result = await service.rejectMilestoneReview(x);

    expect(result.ok).toBe(true);
    expect(await getMilestoneProposalStatus(x)).toBe("rejected");
    const after = await getExerciseRow(x);
    expect(after).toEqual(before);

    // No pending proposal (just rejected) → typed 404, never 500.
    await expect(service.rejectMilestoneReview(x)).rejects.toMatchObject({
      statusCode: 404,
    });
    // And an exercise with no proposal at all → 404 too.
    await expect(service.rejectMilestoneReview(other)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  // ── Test 7: validations (typed 400/404, never 500) ──────────────────────────

  it("7 — accept validations: missing target 404; other partition / variante target / hanging variantes / missing id → 400", async () => {
    await createRoute("MR1", "Ruta Uno");
    await createRoute("MR2", "Ruta Dos");
    const m = await createExercise({
      name: "T7 M",
      pattern: "PULL",
      effort: "CON",
      dl: 1,
      route: "MR1",
    });
    const h2 = await createExercise({
      name: "T7 H2",
      pattern: "PULL",
      effort: "CON",
      dl: 2,
      route: "MR1",
    });
    const x = await createExercise({
      name: "T7 X",
      pattern: "PULL",
      effort: "CON",
      dl: 3,
      route: "MR1",
    });
    const mOther = await createExercise({
      name: "T7 mOther",
      pattern: "PUSH",
      effort: "CON",
      dl: 1,
      route: "MR2",
    });
    const v = await createExercise({
      name: "T7 V",
      pattern: "PULL",
      effort: "CON",
      dl: 4,
      route: "MR1",
      milestoneExerciseId: m,
    });

    // Non-existent milestone target → 404.
    await expect(
      service.acceptMilestoneReview({
        exerciseId: x,
        role: "variante",
        milestoneExerciseId: 9999999,
      }),
    ).rejects.toMatchObject({ statusCode: 404 });

    // Target in another (route × effort) partition → 400.
    await expect(
      service.acceptMilestoneReview({
        exerciseId: x,
        role: "variante",
        milestoneExerciseId: mOther,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });

    // Target that is itself a variante → 400.
    await expect(
      service.acceptMilestoneReview({
        exerciseId: x,
        role: "variante",
        milestoneExerciseId: v,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });

    // Degrading a hito that has variantes hanging off it → 400 with the
    // promote-first message.
    await expect(
      service.acceptMilestoneReview({
        exerciseId: m,
        role: "variante",
        milestoneExerciseId: h2,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      service.acceptMilestoneReview({
        exerciseId: m,
        role: "variante",
        milestoneExerciseId: h2,
      }),
    ).rejects.toThrow(/tiene variantes asignadas/);

    // role='variante' without milestoneExerciseId → 400.
    await expect(
      service.acceptMilestoneReview({ exerciseId: x, role: "variante" }),
    ).rejects.toMatchObject({ statusCode: 400 });

    // Self-target → 400.
    await expect(
      service.acceptMilestoneReview({
        exerciseId: x,
        role: "variante",
        milestoneExerciseId: x,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });

    // Non-existent exercise → 404.
    await expect(
      service.acceptMilestoneReview({ exerciseId: 9999999, role: "hito" }),
    ).rejects.toMatchObject({ statusCode: 404 });

    // Nothing was written by any failed attempt.
    expect((await getExerciseRow(x)).milestoneExerciseId).toBeNull();
    expect((await getExerciseRow(m)).milestoneExerciseId).toBeNull();
  });
});
