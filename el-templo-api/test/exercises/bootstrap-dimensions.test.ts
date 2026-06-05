/**
 * Integration test for the heuristic dimension bootstrap (`bootstrap-dimensions.ts`),
 * reworked for "Progresión por ruta + Habilidad". Runs against real MySQL
 * (eltemplo_test_<worker>), CI-only — do NOT run the suite locally (project policy:
 * local gate is tsc).
 *
 * Contract under test:
 *   A. runBootstrap inserts a `pending` proposal: a step token in the name yields
 *      proposed_step (the rank within the route's progression).
 *   B. Idempotency (D-06): a second runBootstrap creates NO duplicate proposal.
 *   C. A route_pending = 1 exercise gets a guessed proposed_route + NULL step; a
 *      normally routed exercise gets proposed_route = NULL.
 *   D. A non-default variant token yields proposed_habilidad (and NULL step when no
 *      step token is present → the "unknown" path, confidence 0).
 *   E. runBootstrap writes NO exercises truth column (progression_step / habilidad /
 *      route / route_pending unchanged on the seeded rows).
 *
 * Seeds exercises directly via Drizzle (NOT via API). Cleans up only the rows it
 * seeds, in afterEach (proposals THEN exercises — FK order).
 */

import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { inArray } from "drizzle-orm";
import { createTestApp } from "../helpers";
import * as schema from "../../src/db/schema";
import { runBootstrap } from "../../bootstrap-dimensions";

describe("bootstrap-dimensions (progresión por ruta)", () => {
  let app: FastifyInstance;

  const MARK = `BOOTSTRAP_TEST_${Date.now()}`;
  const seededIds: number[] = [];

  async function seedExercise(opts: {
    name: string;
    route: string;
    position?: string;
    routePending?: boolean;
  }): Promise<number> {
    const [res] = await app.db
      .insert(schema.exercises)
      .values({
        pattern: "test",
        category: "test",
        exercise: opts.name,
        position: opts.position ?? null,
        effort: "CON",
        route: opts.route,
        routePending: opts.routePending ?? false,
        dificultadLineal: 1,
      })
      .$returningId();
    seededIds.push(res.id);
    return res.id;
  }

  async function getProposals(exerciseId: number): Promise<
    {
      id: number;
      proposedStep: number | null;
      proposedHabilidad: string | null;
      proposedRoute: string | null;
      status: "pending" | "accepted" | "rejected";
      engine: string | null;
    }[]
  > {
    return app.db
      .select({
        id: schema.exerciseDimensionProposals.id,
        proposedStep: schema.exerciseDimensionProposals.proposedStep,
        proposedHabilidad: schema.exerciseDimensionProposals.proposedHabilidad,
        proposedRoute: schema.exerciseDimensionProposals.proposedRoute,
        status: schema.exerciseDimensionProposals.status,
        engine: schema.exerciseDimensionProposals.engine,
      })
      .from(schema.exerciseDimensionProposals)
      .where(
        inArray(schema.exerciseDimensionProposals.exerciseId, [exerciseId]),
      );
  }

  async function getExercise(id: number): Promise<{
    progressionStep: number | null;
    habilidad: string | null;
    route: string;
    routePending: boolean;
  }> {
    const [row] = await app.db
      .select({
        progressionStep: schema.exercises.progressionStep,
        habilidad: schema.exercises.habilidad,
        route: schema.exercises.route,
        routePending: schema.exercises.routePending,
      })
      .from(schema.exercises)
      .where(inArray(schema.exercises.id, [id]));
    return row;
  }

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterEach(async () => {
    if (seededIds.length > 0) {
      await app.db
        .delete(schema.exerciseDimensionProposals)
        .where(
          inArray(schema.exerciseDimensionProposals.exerciseId, seededIds),
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

  it("A — inserts a pending proposal: a step token maps to proposed_step", async () => {
    // PL progression steps: [FLOOR, TUCK, ADV TUCK, STRADDLE, FULL] → TUCK = 1.
    const id = await seedExercise({
      name: `${MARK}_A Tuck Planche`,
      route: "PL",
    });

    await runBootstrap(app.db);

    const proposals = await getProposals(id);
    expect(proposals).toHaveLength(1);
    const p = proposals[0];
    expect(p.status).toBe("pending");
    expect(p.engine).toBe("route-progression-v1");
    expect(p.proposedStep).toBe(1);
    expect(p.proposedHabilidad).toBeNull();
  });

  it("B — is idempotent: a second run creates no duplicate proposal (D-06)", async () => {
    // FL steps: [TUCK, ADV TUCK, SUPER ADV, STRADDLE, HALF LAYOUT, FULL] → FULL = 5.
    const id = await seedExercise({
      name: `${MARK}_B Full Front Lever`,
      route: "FL",
    });

    await runBootstrap(app.db);
    await runBootstrap(app.db);

    const proposals = await getProposals(id);
    expect(proposals).toHaveLength(1);
    expect(proposals[0].proposedStep).toBe(5);
  });

  it("C — route_pending gets a guessed proposed_route + NULL step; a routed exercise gets NULL route (D-03)", async () => {
    const pendingId = await seedExercise({
      name: `${MARK}_C Front Lever Raise`,
      route: "",
      routePending: true,
    });
    const routedId = await seedExercise({
      name: `${MARK}_C Planche Lean`,
      route: "PL",
      routePending: false,
    });

    await runBootstrap(app.db);

    const pending = (await getProposals(pendingId))[0];
    const routed = (await getProposals(routedId))[0];
    // route_pending → best-guess route from the name ("front lever" → "FL"), no step.
    expect(pending.proposedRoute).toBe("FL");
    expect(pending.proposedStep).toBeNull();
    // normally routed → never re-propose the route → NULL.
    expect(routed.proposedRoute).toBeNull();
  });

  it("D — a non-default variant token yields proposed_habilidad", async () => {
    // MU habilidades include WIDE; no step token present → unknown path, step NULL.
    const id = await seedExercise({
      name: `${MARK}_D Wide Muscle Up`,
      route: "MU",
    });

    await runBootstrap(app.db);

    const p = (await getProposals(id))[0];
    expect(p.proposedHabilidad).toBe("WIDE");
    expect(p.proposedStep).toBeNull();
  });

  it("E — writes NO exercises truth column (progression_step/habilidad/route/route_pending unchanged)", async () => {
    // BL steps: [TUCK, ADV TUCK, SUPER ADV, STRADDLE, HALF LAYOUT, FULL] → STRADDLE = 3.
    const id = await seedExercise({
      name: `${MARK}_E Straddle Back Lever`,
      route: "BL",
      routePending: false,
    });

    const before = await getExercise(id);
    await runBootstrap(app.db);
    const after = await getExercise(id);

    // The bootstrap inserts ONLY into the proposals table.
    expect(after.progressionStep).toBe(before.progressionStep);
    expect(after.progressionStep).toBeNull();
    expect(after.habilidad).toBe(before.habilidad);
    expect(after.habilidad).toBeNull();
    expect(after.route).toBe(before.route);
    expect(after.route).toBe("BL");
    expect(after.routePending).toBe(before.routePending);
    expect(after.routePending).toBe(false);

    // ...but it DID create the proposal (STRADDLE → step 3).
    const p = (await getProposals(id))[0];
    expect(p.proposedStep).toBe(3);
  });
});
