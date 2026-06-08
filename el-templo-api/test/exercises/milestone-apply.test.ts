/**
 * Integration test for the milestone APPLY engine (`bootstrap-milestones.ts`
 * --apply), phase 135 block A. Runs against real MySQL (eltemplo_test_<worker>),
 * CI-only — do NOT run the suite locally (project policy: local gate is tsc).
 *
 * Contract under test (D-02/D-03/D-04 + milestone-only guard):
 *   A. After seeding a backbone route + several exercises and running the
 *      proposal-writer (all milestone proposals 'pending', NO pending dimension
 *      proposals), --apply writes exercises.milestone_exercise_id: NULL for
 *      hitos, the hito id for variantes (matching the proposals); all applied
 *      milestone proposals flip to status='accepted'.
 *   B. Re-running --apply is a no-op for already-accepted proposals: counts of
 *      accepted-this-run = 0, and no milestone_exercise_id changes.
 *   C. A milestone proposal pre-set to 'accepted'/'rejected' (coach correction)
 *      is NOT re-touched by --apply.
 *   D. Milestone-only guard: when a pending exercise_dimension_proposals row
 *      exists for a seeded exercise, --apply ABORTS without accepting any
 *      milestone proposal (milestone_exercise_id unchanged, proposals still
 *      'pending') and signals the abort (result.aborted === true).
 *
 * Seeds exercises + a route directly via Drizzle (NOT via API) with a unique
 * MARK so the test only touches its own rows. FK-safe cleanup in afterEach:
 * delete proposals (milestone + dimension) THEN exercises THEN any route the
 * test created.
 */

import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { inArray, eq } from "drizzle-orm";
import { createTestApp } from "../helpers";
import * as schema from "../../src/db/schema";
import {
  runBootstrapMilestones,
  runApplyMilestones,
} from "../../bootstrap-milestones";

describe("milestone apply (bootstrap-milestones --apply)", () => {
  let app: FastifyInstance;

  const MARK = `MA${`${Date.now()}`.slice(-9)}`;
  // Use the FL vocab route so the heuristic groups by movement token (FRONT
  // LEVER). The route may already exist (seed/migrations) — create it only if
  // absent and remember whether WE created it (so cleanup is FK-safe).
  const ROUTE_CODE = "FL";
  let createdRouteId: number | null = null;

  const seededExerciseIds: number[] = [];

  async function ensureRoute(): Promise<void> {
    const existing = await app.db
      .select({ id: schema.routes.id })
      .from(schema.routes)
      .where(eq(schema.routes.code, ROUTE_CODE));
    if (existing.length === 0) {
      const [row] = await app.db
        .insert(schema.routes)
        .values({
          code: ROUTE_CODE,
          displayName: "Front Lever (test)",
          excludedFromTree: false,
        })
        .$returningId();
      createdRouteId = row.id;
    }
  }

  /**
   * Seed an exercise in the milestone-candidate scope (canonical NULL, effort
   * CON, habilidad NULL, milestone NULL). `position` carries the step token so
   * classify() buckets grouped exercises into the SAME step.
   */
  async function seedExercise(opts: {
    name: string;
    position?: string | null;
  }): Promise<number> {
    const [res] = await app.db
      .insert(schema.exercises)
      .values({
        pattern: "test",
        category: "test",
        exercise: opts.name,
        position: opts.position ?? null,
        effort: "CON",
        route: ROUTE_CODE,
        dificultadLineal: 1,
      })
      .$returningId();
    seededExerciseIds.push(res.id);
    return res.id;
  }

  async function getMilestoneId(exerciseId: number): Promise<number | null> {
    const [row] = await app.db
      .select({ milestoneExerciseId: schema.exercises.milestoneExerciseId })
      .from(schema.exercises)
      .where(eq(schema.exercises.id, exerciseId));
    return row?.milestoneExerciseId ?? null;
  }

  async function getMilestoneProposal(exerciseId: number): Promise<{
    proposedMilestoneExerciseId: number | null;
    status: "pending" | "accepted" | "rejected";
  } | null> {
    const [row] = await app.db
      .select({
        proposedMilestoneExerciseId:
          schema.exerciseMilestoneProposals.proposedMilestoneExerciseId,
        status: schema.exerciseMilestoneProposals.status,
      })
      .from(schema.exerciseMilestoneProposals)
      .where(eq(schema.exerciseMilestoneProposals.exerciseId, exerciseId));
    return row ?? null;
  }

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterEach(async () => {
    if (seededExerciseIds.length > 0) {
      await app.db
        .delete(schema.exerciseMilestoneProposals)
        .where(
          inArray(
            schema.exerciseMilestoneProposals.exerciseId,
            seededExerciseIds,
          ),
        );
      await app.db
        .delete(schema.exerciseDimensionProposals)
        .where(
          inArray(
            schema.exerciseDimensionProposals.exerciseId,
            seededExerciseIds,
          ),
        );
      // Clear self-FK milestone pointers before deleting (ON DELETE SET NULL
      // covers this, but be explicit to avoid ordering surprises).
      await app.db
        .update(schema.exercises)
        .set({ milestoneExerciseId: null })
        .where(inArray(schema.exercises.id, seededExerciseIds));
      await app.db
        .delete(schema.exercises)
        .where(inArray(schema.exercises.id, seededExerciseIds));
      seededExerciseIds.length = 0;
    }
    if (createdRouteId !== null) {
      await app.db
        .delete(schema.routes)
        .where(eq(schema.routes.id, createdRouteId));
      createdRouteId = null;
    }
  });

  afterAll(async () => {
    await app.close();
  });

  it("A — apply writes milestone_exercise_id (hito NULL, variante hito id) and flips proposals to accepted", async () => {
    await ensureRoute();
    // Both names contain the FRONT LEVER movement token; same position token →
    // same step → same group. The shorter name (fewer tokens) wins as hito.
    const hitoId = await seedExercise({
      name: `${MARK} Front Lever`,
      position: "TUCK",
    });
    const variantId = await seedExercise({
      name: `${MARK} Tuck Front Lever Hold Variant`,
      position: "TUCK",
    });

    await runBootstrapMilestones(app.db);

    // Sanity: both seeded exercises got a pending milestone proposal.
    const hitoProp = await getMilestoneProposal(hitoId);
    const varProp = await getMilestoneProposal(variantId);
    expect(hitoProp?.status).toBe("pending");
    expect(varProp?.status).toBe("pending");
    expect(hitoProp?.proposedMilestoneExerciseId).toBeNull();
    expect(varProp?.proposedMilestoneExerciseId).toBe(hitoId);

    const result = await runApplyMilestones(app.db);
    expect(result.aborted).toBe(false);
    expect(result.hitosAccepted).toBeGreaterThanOrEqual(1);
    expect(result.variantesAccepted).toBeGreaterThanOrEqual(1);

    // Truth columns written: hito stays NULL, variante points at the hito.
    expect(await getMilestoneId(hitoId)).toBeNull();
    expect(await getMilestoneId(variantId)).toBe(hitoId);

    // Proposals flipped to accepted.
    expect((await getMilestoneProposal(hitoId))?.status).toBe("accepted");
    expect((await getMilestoneProposal(variantId))?.status).toBe("accepted");
  });

  it("B — re-running apply is a no-op for accepted proposals", async () => {
    await ensureRoute();
    const hitoId = await seedExercise({
      name: `${MARK} Front Lever`,
      position: "TUCK",
    });
    const variantId = await seedExercise({
      name: `${MARK} Tuck Front Lever Hold Variant`,
      position: "TUCK",
    });

    await runBootstrapMilestones(app.db);
    await runApplyMilestones(app.db);

    // After the first apply the hito stays NULL and the variante points at it.
    expect(await getMilestoneId(hitoId)).toBeNull();
    const variantBefore = await getMilestoneId(variantId);
    expect(variantBefore).toBe(hitoId);

    const second = await runApplyMilestones(app.db);
    // Nothing pending → nothing accepted this run.
    expect(second.aborted).toBe(false);
    expect(second.hitosAccepted).toBe(0);
    expect(second.variantesAccepted).toBe(0);
    // milestone_exercise_id unchanged.
    expect(await getMilestoneId(variantId)).toBe(variantBefore);
  });

  it("C — a coach-corrected accepted/rejected proposal is not re-touched", async () => {
    await ensureRoute();
    const hitoId = await seedExercise({
      name: `${MARK} Front Lever`,
      position: "TUCK",
    });
    const variantId = await seedExercise({
      name: `${MARK} Tuck Front Lever Hold Variant`,
      position: "TUCK",
    });

    await runBootstrapMilestones(app.db);

    // Simulate a coach correction: pre-set the variante's proposal to 'rejected'
    // with a known (different) milestone target that --apply must NOT touch.
    await app.db
      .update(schema.exerciseMilestoneProposals)
      .set({ status: "rejected" })
      .where(eq(schema.exerciseMilestoneProposals.exerciseId, variantId));

    await runApplyMilestones(app.db);

    // The rejected proposal is untouched: still rejected, and the truth column
    // was never written for it (stays NULL — apply skipped the rejected row).
    const varProp = await getMilestoneProposal(variantId);
    expect(varProp?.status).toBe("rejected");
    expect(await getMilestoneId(variantId)).toBeNull();
    // The hito's pending proposal still applied normally (stays NULL hito).
    expect(await getMilestoneId(hitoId)).toBeNull();
  });

  it("D — apply ABORTS (no milestone write) when a pending dimension proposal exists", async () => {
    await ensureRoute();
    const hitoId = await seedExercise({
      name: `${MARK} Front Lever`,
      position: "TUCK",
    });
    const variantId = await seedExercise({
      name: `${MARK} Tuck Front Lever Hold Variant`,
      position: "TUCK",
    });

    await runBootstrapMilestones(app.db);

    // Inject a pending DIMENSION proposal for a seeded exercise → guard must trip.
    await app.db.insert(schema.exerciseDimensionProposals).values({
      exerciseId: hitoId,
      proposedStep: 1,
      status: "pending",
      engine: "test",
    });

    const result = await runApplyMilestones(app.db);

    expect(result.aborted).toBe(true);
    expect(result.pendingDimensionCount).toBeGreaterThanOrEqual(1);
    expect(result.hitosAccepted).toBe(0);
    expect(result.variantesAccepted).toBe(0);

    // No milestone write happened; milestone proposals still pending.
    expect(await getMilestoneId(hitoId)).toBeNull();
    expect(await getMilestoneId(variantId)).toBeNull();
    expect((await getMilestoneProposal(hitoId))?.status).toBe("pending");
    expect((await getMilestoneProposal(variantId))?.status).toBe("pending");
  });
});
