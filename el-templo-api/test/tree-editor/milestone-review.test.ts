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
import {
  createTestApp,
  registerUser,
  createStaffUser,
  getAuthToken,
  cleanAllTestData,
} from "../helpers";
import * as schema from "../../src/db/schema";
import { TreeEditorService } from "../../src/modules/tree-editor/service";
import { ExerciseProgressionService } from "../../src/modules/sessions/progressions/exercise-progression-service";

describe("tree-editor milestone review (hito/variante, R1-REV)", () => {
  let app: FastifyInstance;
  let service: TreeEditorService;
  let coachToken: string;

  function authHeaders(token: string): { authorization: string } {
    return { authorization: `Bearer ${token}` };
  }

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

  /** Insert a milestone proposal for an exercise (engine NOT NULL). */
  async function seedMilestoneProposal(opts: {
    exerciseId: number;
    proposedMilestoneExerciseId?: number | null;
    movementToken?: string | null;
    stepRank?: number | null;
    confidence?: number | null;
    status?: "pending" | "accepted" | "rejected";
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
        status: opts.status ?? "pending",
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

    // Fresh coach token per test (the user is wiped by cleanAllTestData).
    const email = `milestone-review-coach-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}@test.com`;
    await createStaffUser(app, {
      email,
      password: "password123",
      firstName: "Coach",
      lastName: "Milestone",
      role: "coach",
      branchId: 1,
    });
    coachToken = await getAuthToken(app, email, "password123");
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

  // ── Test 8: listMilestoneReview (drawer read) ───────────────────────────────

  it("8 — listMilestoneReview returns only PENDING proposals of the route with the row shape", async () => {
    await createRoute("MR1", "Ruta Uno");
    await createRoute("MR2", "Ruta Dos");
    const m = await createExercise({
      name: "T8 M",
      pattern: "PULL",
      effort: "CON",
      dl: 1,
      route: "MR1",
    });
    const p1 = await createExercise({
      name: "T8 P1",
      pattern: "PULL",
      effort: "CON",
      dl: 2,
      route: "MR1",
    });
    const p2 = await createExercise({
      name: "T8 P2",
      pattern: "PULL",
      effort: "EXC",
      dl: 4,
      route: "MR1",
    });
    const acceptedEx = await createExercise({
      name: "T8 accepted",
      pattern: "PULL",
      effort: "CON",
      dl: 5,
      route: "MR1",
    });
    const rejectedEx = await createExercise({
      name: "T8 rejected",
      pattern: "PULL",
      effort: "CON",
      dl: 6,
      route: "MR1",
    });
    const otherRouteEx = await createExercise({
      name: "T8 other",
      pattern: "PUSH",
      effort: "CON",
      dl: 1,
      route: "MR2",
    });

    await seedMilestoneProposal({
      exerciseId: p1,
      proposedMilestoneExerciseId: m,
      movementToken: "OA",
      stepRank: 2,
      confidence: 80,
    });
    await seedMilestoneProposal({
      exerciseId: p2,
      proposedMilestoneExerciseId: null,
      movementToken: null,
      stepRank: null,
      confidence: 40,
    });
    await seedMilestoneProposal({ exerciseId: acceptedEx, status: "accepted" });
    await seedMilestoneProposal({ exerciseId: rejectedEx, status: "rejected" });
    await seedMilestoneProposal({ exerciseId: otherRouteEx });

    const rows = await service.listMilestoneReview("MR1");

    expect(rows.map((r) => r.exerciseId).sort((a, b) => a - b)).toEqual(
      [p1, p2].sort((a, b) => a - b),
    );
    const row1 = rows.find((r) => r.exerciseId === p1);
    expect(row1).toEqual({
      exerciseId: p1,
      name: "T8 P1",
      dl: 2,
      effort: "CON",
      movementToken: "OA",
      stepRank: 2,
      proposedMilestoneExerciseId: m,
      status: "pending",
      confidence: 80,
    });
    const row2 = rows.find((r) => r.exerciseId === p2);
    expect(row2).toEqual({
      exerciseId: p2,
      name: "T8 P2",
      dl: 4,
      effort: "EXC",
      movementToken: null,
      stepRank: null,
      proposedMilestoneExerciseId: null,
      status: "pending",
      confidence: 40,
    });
  });

  // ── Test 9: getVariants (truth, not proposals) ──────────────────────────────

  it("9 — getVariants returns the exercises whose milestone_exercise_id = hito (truth column)", async () => {
    await createRoute("MR1", "Ruta Uno");
    const m = await createExercise({
      name: "T9 M",
      pattern: "PULL",
      effort: "CON",
      dl: 1,
      route: "MR1",
    });
    const v1 = await createExercise({
      name: "T9 V1",
      pattern: "PULL",
      effort: "CON",
      dl: 2,
      route: "MR1",
      milestoneExerciseId: m,
    });
    const v2 = await createExercise({
      name: "T9 V2",
      pattern: "PULL",
      effort: "CON",
      dl: 3,
      route: "MR1",
      milestoneExerciseId: m,
    });
    // Proposal-only variante: must NOT appear (truth not written yet).
    const proposedOnly = await createExercise({
      name: "T9 proposed",
      pattern: "PULL",
      effort: "CON",
      dl: 4,
      route: "MR1",
    });
    await seedMilestoneProposal({
      exerciseId: proposedOnly,
      proposedMilestoneExerciseId: m,
    });

    const variants = await service.getVariants(m);

    expect(variants).toEqual([
      { id: v1, name: "T9 V1", dl: 2 },
      { id: v2, name: "T9 V2", dl: 3 },
    ]);
    expect(variants.map((v) => v.id)).not.toContain(proposedOnly);
  });

  // ── Test 10: promoteToMilestone (transactional swap) ────────────────────────

  it("10 — promote swaps roles transactionally: ex-hito + other variantes re-point, incident edges follow", async () => {
    await createRoute("MR1", "Ruta Uno");
    const a = await createExercise({
      name: "T10 A",
      pattern: "PULL",
      effort: "CON",
      dl: 1,
      route: "MR1",
    });
    const m = await createExercise({
      name: "T10 M",
      pattern: "PULL",
      effort: "CON",
      dl: 3,
      route: "MR1",
    });
    const b = await createExercise({
      name: "T10 B",
      pattern: "PULL",
      effort: "CON",
      dl: 5,
      route: "MR1",
    });
    const x = await createExercise({
      name: "T10 X",
      pattern: "PULL",
      effort: "CON",
      dl: 3,
      route: "MR1",
      milestoneExerciseId: m,
    });
    const y = await createExercise({
      name: "T10 Y",
      pattern: "PULL",
      effort: "CON",
      dl: 4,
      route: "MR1",
      milestoneExerciseId: m,
    });
    await linkEdge(a, m, "auto");
    await linkEdge(m, b, "manual");

    const result = await service.promoteToMilestone(x);
    expect(result.ok).toBe(true);

    // Roles swapped.
    expect((await getExerciseRow(x)).milestoneExerciseId).toBeNull();
    expect((await getExerciseRow(m)).milestoneExerciseId).toBe(x);
    expect((await getExerciseRow(y)).milestoneExerciseId).toBe(x);

    // Incident edges re-pointed, SAME sources, no self-edges, no duplicates.
    const edges = await getEdges();
    expect(edges).toContainEqual({ from: a, to: x, source: "auto" });
    expect(edges).toContainEqual({ from: x, to: b, source: "manual" });
    expect(edges.filter((e) => e.from === m || e.to === m)).toHaveLength(0);
    expect(edges.filter((e) => e.from === e.to)).toHaveLength(0);
    const keys = edges.map((e) => `${e.from}→${e.to}`);
    expect(new Set(keys).size).toBe(keys.length);

    // Integrity: ZERO rows whose milestone_exercise_id points at a variante.
    const classified = await app.db
      .select({
        id: schema.exercises.id,
        milestoneExerciseId: schema.exercises.milestoneExerciseId,
      })
      .from(schema.exercises);
    const milestoneOf = new Map(
      classified.map((r) => [r.id, r.milestoneExerciseId]),
    );
    for (const r of classified) {
      if (r.milestoneExerciseId !== null) {
        expect(milestoneOf.get(r.milestoneExerciseId)).toBeNull();
      }
    }
  });

  it("10b — promote deletes would-be self-edges and resolves UNIQUE(from,to) collisions by dropping the old edge", async () => {
    await createRoute("MR1", "Ruta Uno");
    const a = await createExercise({
      name: "T10b A",
      pattern: "PULL",
      effort: "CON",
      dl: 1,
      route: "MR1",
    });
    const m = await createExercise({
      name: "T10b M",
      pattern: "PULL",
      effort: "CON",
      dl: 3,
      route: "MR1",
    });
    const x = await createExercise({
      name: "T10b X",
      pattern: "PULL",
      effort: "CON",
      dl: 3,
      route: "MR1",
      milestoneExerciseId: m,
    });
    // a→m would re-point to a→x, which ALREADY exists → the old edge dies.
    await linkEdge(a, m, "manual");
    await linkEdge(a, x, "auto");
    // x→m would re-point to x→x (self-edge) → deleted.
    await linkEdge(x, m, "auto");

    await service.promoteToMilestone(x);

    const edges = await getEdges();
    // The pre-existing a→x survives untouched; a→m and x→m are gone.
    expect(edges).toEqual([{ from: a, to: x, source: "auto" }]);
  });

  // ── Test 11: promote validations ────────────────────────────────────────────

  it("11 — promote on a non-variante → 400; non-existent exercise → 404", async () => {
    await createRoute("MR1", "Ruta Uno");
    const hito = await createExercise({
      name: "T11 hito",
      pattern: "PULL",
      effort: "CON",
      dl: 1,
      route: "MR1",
    });

    await expect(service.promoteToMilestone(hito)).rejects.toMatchObject({
      statusCode: 400,
    });
    await expect(service.promoteToMilestone(9999999)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  // ── HTTP surface: authz per endpoint (T-133-40, patrón T-128-03) ────────────

  /** Every new endpoint as [method, url, payload] — the 5 routes of R1-REV. */
  function milestoneEndpoints(
    ids: { exerciseId: number; milestoneExerciseId: number } = {
      exerciseId: 1,
      milestoneExerciseId: 2,
    },
  ): Array<[string, string, object | undefined]> {
    return [
      ["GET", "/api/admin/tree-editor/milestone-review?route=MR1", undefined],
      [
        "GET",
        `/api/admin/tree-editor/milestone/${ids.milestoneExerciseId}/variants`,
        undefined,
      ],
      [
        "POST",
        "/api/admin/tree-editor/milestone-review/accept",
        {
          exerciseId: ids.exerciseId,
          role: "variante",
          milestoneExerciseId: ids.milestoneExerciseId,
        },
      ],
      [
        "POST",
        "/api/admin/tree-editor/milestone-review/reject",
        { exerciseId: ids.exerciseId },
      ],
      [
        "POST",
        "/api/admin/tree-editor/milestone/promote",
        { exerciseId: ids.exerciseId },
      ],
    ];
  }

  it("12 — rejects an unauthenticated request with 401 on every milestone endpoint", async () => {
    for (const [method, url, payload] of milestoneEndpoints()) {
      const res = await app.inject({ method: method as "GET", url, payload });
      expect(res.statusCode).toBe(401);
    }
  });

  it("13 — rejects a MEMBER token with 403 on every milestone endpoint", async () => {
    const { token } = await registerUser(app, {
      email: `milestone-review-member-${Date.now()}@test.com`,
      password: "password123",
      branchId: 1,
    });
    for (const [method, url, payload] of milestoneEndpoints()) {
      const res = await app.inject({
        method: method as "GET",
        url,
        headers: authHeaders(token),
        payload,
      });
      expect(res.statusCode).toBe(403);
    }
  });

  it("14 — coach gets 200 on every milestone endpoint (full happy path over HTTP, truth verified in DB)", async () => {
    await createRoute("MR1", "Ruta Uno");
    const m = await createExercise({
      name: "T14 M",
      pattern: "PULL",
      effort: "CON",
      dl: 1,
      route: "MR1",
    });
    const x = await createExercise({
      name: "T14 X",
      pattern: "PULL",
      effort: "CON",
      dl: 3,
      route: "MR1",
    });
    const r = await createExercise({
      name: "T14 R",
      pattern: "PULL",
      effort: "CON",
      dl: 4,
      route: "MR1",
    });
    const dimId = await seedDimensionProposal({
      exerciseId: x,
      proposedStep: 2,
    });
    await seedMilestoneProposal({
      exerciseId: x,
      proposedMilestoneExerciseId: m,
    });
    await seedMilestoneProposal({ exerciseId: r });

    // GET /milestone-review → the two pending rows.
    const listRes = await app.inject({
      method: "GET",
      url: "/api/admin/tree-editor/milestone-review?route=MR1",
      headers: authHeaders(coachToken),
    });
    expect(listRes.statusCode).toBe(200);
    const listBody = JSON.parse(listRes.body);
    expect(
      listBody.rows
        .map((row: { exerciseId: number }) => row.exerciseId)
        .sort((a: number, b: number) => a - b),
    ).toEqual([x, r].sort((a, b) => a - b));

    // E2E: POST accept variante → 200 + truth written atomically.
    const acceptRes = await app.inject({
      method: "POST",
      url: "/api/admin/tree-editor/milestone-review/accept",
      headers: authHeaders(coachToken),
      payload: { exerciseId: x, role: "variante", milestoneExerciseId: m },
    });
    expect(acceptRes.statusCode).toBe(200);
    expect(JSON.parse(acceptRes.body).ok).toBe(true);
    const xRow = await getExerciseRow(x);
    expect(xRow.milestoneExerciseId).toBe(m);
    expect(xRow.progressionStep).toBe(2);
    expect(await getDimensionProposalStatus(dimId)).toBe("accepted");
    expect(await getMilestoneProposalStatus(x)).toBe("accepted");

    // GET variants of the hito → the freshly accepted variante.
    const variantsRes = await app.inject({
      method: "GET",
      url: `/api/admin/tree-editor/milestone/${m}/variants`,
      headers: authHeaders(coachToken),
    });
    expect(variantsRes.statusCode).toBe(200);
    expect(
      JSON.parse(variantsRes.body).variants.map((v: { id: number }) => v.id),
    ).toEqual([x]);

    // POST reject → 200, status-only.
    const rejectRes = await app.inject({
      method: "POST",
      url: "/api/admin/tree-editor/milestone-review/reject",
      headers: authHeaders(coachToken),
      payload: { exerciseId: r },
    });
    expect(rejectRes.statusCode).toBe(200);
    expect(await getMilestoneProposalStatus(r)).toBe("rejected");
    expect((await getExerciseRow(r)).milestoneExerciseId).toBeNull();

    // POST promote → 200 + swap verified.
    const promoteRes = await app.inject({
      method: "POST",
      url: "/api/admin/tree-editor/milestone/promote",
      headers: authHeaders(coachToken),
      payload: { exerciseId: x },
    });
    expect(promoteRes.statusCode).toBe(200);
    expect((await getExerciseRow(x)).milestoneExerciseId).toBeNull();
    expect((await getExerciseRow(m)).milestoneExerciseId).toBe(x);
  });

  it("15 — HTTP validation errors are typed 400/404, never 500 (Tests 7/11 over the wire)", async () => {
    await createRoute("MR1", "Ruta Uno");
    const hito = await createExercise({
      name: "T15 hito",
      pattern: "PULL",
      effort: "CON",
      dl: 1,
      route: "MR1",
    });
    const x = await createExercise({
      name: "T15 X",
      pattern: "PULL",
      effort: "CON",
      dl: 3,
      route: "MR1",
    });

    // accept variante without milestoneExerciseId → 400 (handler guard).
    const missingTarget = await app.inject({
      method: "POST",
      url: "/api/admin/tree-editor/milestone-review/accept",
      headers: authHeaders(coachToken),
      payload: { exerciseId: x, role: "variante" },
    });
    expect(missingTarget.statusCode).toBe(400);

    // accept variante against a non-existent hito → 404.
    const ghostTarget = await app.inject({
      method: "POST",
      url: "/api/admin/tree-editor/milestone-review/accept",
      headers: authHeaders(coachToken),
      payload: {
        exerciseId: x,
        role: "variante",
        milestoneExerciseId: 9999999,
      },
    });
    expect(ghostTarget.statusCode).toBe(404);

    // body with extra properties: additionalProperties:false + Fastify's Ajv
    // (removeAdditional) STRIPS the unknown key at the schema boundary — the
    // injected field never reaches the handler/service (T-133-43). Same
    // platform contract as every existing tree-editor endpoint.
    const extraProps = await app.inject({
      method: "POST",
      url: "/api/admin/tree-editor/milestone-review/accept",
      headers: authHeaders(coachToken),
      payload: { exerciseId: x, role: "hito", hack: true },
    });
    expect(extraProps.statusCode).toBe(200);
    expect((await getExerciseRow(x)).milestoneExerciseId).toBeNull();

    // reject without a pending proposal → 404.
    const rejectNothing = await app.inject({
      method: "POST",
      url: "/api/admin/tree-editor/milestone-review/reject",
      headers: authHeaders(coachToken),
      payload: { exerciseId: x },
    });
    expect(rejectNothing.statusCode).toBe(404);

    // promote a non-variante → 400.
    const promoteHito = await app.inject({
      method: "POST",
      url: "/api/admin/tree-editor/milestone/promote",
      headers: authHeaders(coachToken),
      payload: { exerciseId: hito },
    });
    expect(promoteHito.statusCode).toBe(400);

    // GET milestone-review without route → 400 (querystring schema).
    const noRoute = await app.inject({
      method: "GET",
      url: "/api/admin/tree-editor/milestone-review",
      headers: authHeaders(coachToken),
    });
    expect(noRoute.statusCode).toBe(400);
  });
});
