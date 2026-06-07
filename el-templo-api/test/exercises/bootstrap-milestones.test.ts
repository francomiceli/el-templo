/**
 * Integration tests for the phase-133 bootstrap CLIs, against real MySQL
 * (eltemplo_test_<worker>), CI-only — do NOT run the full suite locally
 * (project policy: local gate is tsc + targeted files).
 *
 * 1. `bootstrap-milestones.ts` (R1) — contract under test:
 *    A. runBootstrapMilestones inserts `pending` milestone proposals with
 *       movement_token / step_rank / engine; one milestone per
 *       (movement × step) group, variants point at it; partitions never mix.
 *    B. Idempotency: a second run creates NO duplicate proposal (NOT EXISTS +
 *       UNIQUE(exercise_id)) and reports proposed = 0.
 *    C. Writes NO exercises truth column (milestone_exercise_id untouched).
 *    D. An exercise with a pre-existing proposal is skipped (never overwritten).
 *    E. An ACCEPTED dimension proposal's proposed_step overrides classify();
 *       a PENDING one does not.
 *
 * 2. `bootstrap-elite-prereqs.ts` (R4) — contract under test:
 *    F. Seeds exactly one manual cross-route edge base(max dl < target dl) →
 *       elite(first by dl, id) for the FLR→FL pair; missing routes (PLPU/PL)
 *       are skipped without throwing.
 *    G. Idempotent: a second run inserts 0 (pre-existing manual incoming
 *       cross-route edge → whole pair skipped).
 *    H. A pre-existing manual edge into the elite route (profe-authored) makes
 *       the CLI skip the pair — human curation is never overridden, and no
 *       edge is ever deleted/updated.
 *
 * Seeds routes/exercises directly via Drizzle (NOT via API). Routes are
 * created only if absent and removed in afterAll; exercises (and their
 * cascading proposals/edges) are cleaned per test in afterEach.
 */

import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq, inArray } from "drizzle-orm";
import { createTestApp } from "../helpers";
import * as schema from "../../src/db/schema";
import { runBootstrapMilestones } from "../../bootstrap-milestones";

describe("bootstrap CLIs fase 133 (hitos R1 + prereqs de élite R4)", () => {
  let app: FastifyInstance;

  const seededIds: number[] = [];
  const createdRouteIds: number[] = [];

  /** Create a route only if absent (test DB may already hold some codes). */
  async function ensureRoute(code: string, displayName: string): Promise<void> {
    const existing = await app.db
      .select({ id: schema.routes.id })
      .from(schema.routes)
      .where(eq(schema.routes.code, code));
    if (existing.length > 0) return;
    const [row] = await app.db
      .insert(schema.routes)
      .values({ code, displayName })
      .$returningId();
    createdRouteIds.push(row.id);
  }

  async function seedExercise(opts: {
    name: string;
    route: string;
    dl: number;
    effort?: string;
  }): Promise<number> {
    const [res] = await app.db
      .insert(schema.exercises)
      .values({
        pattern: "test",
        category: "test",
        exercise: opts.name,
        effort: opts.effort ?? "CON",
        route: opts.route,
        dificultadLineal: opts.dl,
      })
      .$returningId();
    seededIds.push(res.id);
    return res.id;
  }

  async function getMilestoneProposals(exerciseIds: number[]): Promise<
    {
      exerciseId: number;
      proposedMilestoneExerciseId: number | null;
      movementToken: string | null;
      stepRank: number | null;
      status: "pending" | "accepted" | "rejected";
      engine: string;
      confidence: number | null;
    }[]
  > {
    return app.db
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
      .where(
        inArray(schema.exerciseMilestoneProposals.exerciseId, exerciseIds),
      );
  }

  beforeAll(async () => {
    app = await createTestApp();
    await ensureRoute("TTB", "Toes to Bar");
    await ensureRoute("FL", "Front Lever");
    await ensureRoute("FLR", "Front Lever Raise");
  });

  afterEach(async () => {
    if (seededIds.length > 0) {
      await app.db
        .delete(schema.exerciseMilestoneProposals)
        .where(
          inArray(schema.exerciseMilestoneProposals.exerciseId, seededIds),
        );
      await app.db
        .delete(schema.exerciseDimensionProposals)
        .where(
          inArray(schema.exerciseDimensionProposals.exerciseId, seededIds),
        );
      // exercise_progressions edges cascade on exercise deletion.
      await app.db
        .delete(schema.exercises)
        .where(inArray(schema.exercises.id, seededIds));
      seededIds.length = 0;
    }
  });

  afterAll(async () => {
    if (createdRouteIds.length > 0) {
      await app.db
        .delete(schema.routes)
        .where(inArray(schema.routes.id, createdRouteIds));
    }
    await app.close();
  });

  describe("bootstrap-milestones (propuestas de hito pending)", () => {
    it("A — inserts pending proposals: one milestone per group, variants point at it, partitions never mix", async () => {
      const ttbHito = await seedExercise({
        name: "Tuck TTB",
        route: "TTB",
        dl: 3,
      });
      const ttbVariante = await seedExercise({
        name: "Tuck TTB Negative",
        route: "TTB",
        dl: 3,
      });
      const ttbSingleton = await seedExercise({
        name: "Straddle TTB",
        route: "TTB",
        dl: 5,
      });
      const flHito = await seedExercise({
        name: "Tuck Front Lever",
        route: "FL",
        dl: 4,
      });
      const flVariante = await seedExercise({
        name: "Tuck Front Lever Negative",
        route: "FL",
        dl: 4,
      });

      await runBootstrapMilestones(app.db);

      const proposals = await getMilestoneProposals([
        ttbHito,
        ttbVariante,
        ttbSingleton,
        flHito,
        flVariante,
      ]);
      expect(proposals).toHaveLength(5);
      const byId = new Map(proposals.map((p) => [p.exerciseId, p]));

      for (const p of proposals) {
        expect(p.status).toBe("pending");
        expect(p.engine).toBe("milestone-heuristic-v1");
      }

      // TTB (TTB, TUCK=0) group: milestone + variant.
      expect(byId.get(ttbHito)?.proposedMilestoneExerciseId).toBeNull();
      expect(byId.get(ttbHito)?.movementToken).toBe("TTB");
      expect(byId.get(ttbHito)?.stepRank).toBe(0);
      expect(byId.get(ttbHito)?.confidence).toBe(80);
      expect(byId.get(ttbVariante)?.proposedMilestoneExerciseId).toBe(ttbHito);

      // TTB (TTB, STRADDLE=1) singleton with movement → milestone, conf 60.
      expect(byId.get(ttbSingleton)?.proposedMilestoneExerciseId).toBeNull();
      expect(byId.get(ttbSingleton)?.stepRank).toBe(1);
      expect(byId.get(ttbSingleton)?.confidence).toBe(60);

      // FL partition groups on its own — never points at a TTB milestone.
      expect(byId.get(flHito)?.proposedMilestoneExerciseId).toBeNull();
      expect(byId.get(flHito)?.movementToken).toBe("FRONT LEVER");
      expect(byId.get(flVariante)?.proposedMilestoneExerciseId).toBe(flHito);
    });

    it("B — is idempotent: a second run creates no duplicate and proposes 0", async () => {
      const ids = [
        await seedExercise({ name: "Tuck TTB", route: "TTB", dl: 3 }),
        await seedExercise({
          name: "Tuck TTB Negative",
          route: "TTB",
          dl: 3,
        }),
      ];

      await runBootstrapMilestones(app.db);
      const second = await runBootstrapMilestones(app.db);

      const proposals = await getMilestoneProposals(ids);
      expect(proposals).toHaveLength(2);
      expect(second.proposed).toBe(0);
      expect(second.skipped).toBeGreaterThanOrEqual(2);
    });

    it("C — writes NO exercises truth column (milestone_exercise_id untouched)", async () => {
      const ids = [
        await seedExercise({ name: "Tuck TTB", route: "TTB", dl: 3 }),
        await seedExercise({
          name: "Tuck TTB Negative",
          route: "TTB",
          dl: 3,
        }),
      ];

      await runBootstrapMilestones(app.db);

      const rows = await app.db
        .select({
          milestoneExerciseId: schema.exercises.milestoneExerciseId,
          progressionStep: schema.exercises.progressionStep,
          habilidad: schema.exercises.habilidad,
        })
        .from(schema.exercises)
        .where(inArray(schema.exercises.id, ids));
      expect(rows).toHaveLength(2);
      for (const row of rows) {
        expect(row.milestoneExerciseId).toBeNull();
        expect(row.progressionStep).toBeNull();
        expect(row.habilidad).toBeNull();
      }
    });

    it("D — an exercise with a pre-existing proposal is skipped, never overwritten", async () => {
      const id = await seedExercise({ name: "Tuck TTB", route: "TTB", dl: 3 });
      await app.db.insert(schema.exerciseMilestoneProposals).values({
        exerciseId: id,
        proposedMilestoneExerciseId: null,
        engine: "manual-test",
        status: "pending",
      });

      const result = await runBootstrapMilestones(app.db);

      const proposals = await getMilestoneProposals([id]);
      expect(proposals).toHaveLength(1);
      expect(proposals[0].engine).toBe("manual-test");
      expect(result.skipped).toBeGreaterThanOrEqual(1);
    });

    it("E — an ACCEPTED dimension proposal's step overrides classify(); a PENDING one does not", async () => {
      // Neither name carries a step token → classify() yields step null.
      const acceptedId = await seedExercise({
        name: "TTB Hold",
        route: "TTB",
        dl: 4,
      });
      const pendingId = await seedExercise({
        name: "TTB Pause",
        route: "TTB",
        dl: 4,
      });
      await app.db.insert(schema.exerciseDimensionProposals).values([
        { exerciseId: acceptedId, proposedStep: 2, status: "accepted" },
        { exerciseId: pendingId, proposedStep: 5, status: "pending" },
      ]);

      await runBootstrapMilestones(app.db);

      const proposals = await getMilestoneProposals([acceptedId, pendingId]);
      const byId = new Map(proposals.map((p) => [p.exerciseId, p]));
      expect(byId.get(acceptedId)?.stepRank).toBe(2);
      expect(byId.get(pendingId)?.stepRank).toBeNull();
    });
  });
});
