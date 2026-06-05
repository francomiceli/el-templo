/**
 * Phase 125 Plan 01 — Integration test for the heuristic dimension bootstrap
 * (`bootstrap-dimensions.ts`). Runs against real MySQL (eltemplo_test_<worker>),
 * CI-only — do NOT run the suite locally (project policy: local gate is tsc).
 *
 * Contract under test (TREE-02, D-01/D-03/D-06):
 *   A. runBootstrap inserts a `pending` proposal for a seeded exercise: the
 *      route code maps to the canonical sub-family name and a leverage keyword
 *      in the name yields proposed_leverage.
 *   B. Idempotency (D-06): a second runBootstrap creates NO duplicate proposal
 *      for the same exercise.
 *   C. A route_pending = 1 exercise gets a non-null proposed_route; a normally
 *      routed exercise gets proposed_route = NULL.
 *   D. An exercise whose name has no leverage keyword gets proposed_leverage =
 *      NULL.
 *   E. runBootstrap writes NO exercises truth column (subfamily_id / leverage /
 *      route / route_pending unchanged on the seeded rows).
 *
 * Seeds exercises directly via Drizzle (NOT via API). Real clock (fake timers
 * desync from MySQL). Cleans up only the rows it seeds, in afterEach — deleting
 * seeded proposals THEN seeded exercises (FK order; the FK is ON DELETE CASCADE
 * but we delete explicitly so the test stays self-contained).
 */

import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { inArray } from "drizzle-orm";
import { createTestApp } from "../helpers";
import * as schema from "../../src/db/schema";
import { runBootstrap } from "../../bootstrap-dimensions";

describe("bootstrap-dimensions (Phase 125 Plan 01)", () => {
  let app: FastifyInstance;

  // Unique marker so the test only ever touches and cleans its own rows even if
  // a real catalog is present in the per-worker DB.
  const MARK = `BOOTSTRAP_TEST_${Date.now()}`;
  const seededIds: number[] = [];

  /**
   * Insert one exercise (filling the NOT NULL columns) and track its id for
   * cleanup. `name` carries the MARK so it stays scoped to the test.
   */
  async function seedExercise(opts: {
    name: string;
    route: string;
    routePending?: boolean;
  }): Promise<number> {
    const [res] = await app.db
      .insert(schema.exercises)
      .values({
        pattern: "test",
        category: "test",
        exercise: opts.name,
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
      proposedSubfamily: string | null;
      proposedLeverage: string | null;
      proposedRoute: string | null;
      status: "pending" | "accepted" | "rejected";
      engine: string | null;
    }[]
  > {
    return app.db
      .select({
        id: schema.exerciseDimensionProposals.id,
        proposedSubfamily: schema.exerciseDimensionProposals.proposedSubfamily,
        proposedLeverage: schema.exerciseDimensionProposals.proposedLeverage,
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
    subfamilyId: number | null;
    leverage: string | null;
    route: string;
    routePending: boolean;
  }> {
    const [row] = await app.db
      .select({
        subfamilyId: schema.exercises.subfamilyId,
        leverage: schema.exercises.leverage,
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
      // Delete seeded proposals first (explicit FK order), then exercises.
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

  it("A — inserts a pending proposal: route maps to sub-family, name keyword maps to leverage", async () => {
    const id = await seedExercise({
      name: `${MARK}_A Tuck Planche`,
      route: "PL",
    });

    await runBootstrap(app.db);

    const proposals = await getProposals(id);
    expect(proposals).toHaveLength(1);
    const p = proposals[0];
    expect(p.status).toBe("pending");
    expect(p.engine).toBe("heuristic-v1");
    // route PL → canonical sub-family "Planche"
    expect(p.proposedSubfamily).toBe("Planche");
    // "tuck" keyword in the name → leverage "Tuck"
    expect(p.proposedLeverage).toBe("Tuck");
  });

  it("B — is idempotent: a second run creates no duplicate proposal (D-06)", async () => {
    const id = await seedExercise({
      name: `${MARK}_B Full Front Lever`,
      route: "FL",
    });

    await runBootstrap(app.db);
    await runBootstrap(app.db);

    const proposals = await getProposals(id);
    expect(proposals).toHaveLength(1);
    expect(proposals[0].proposedSubfamily).toBe("Front Lever");
  });

  it("C — route_pending gets a guessed proposed_route; a routed exercise gets NULL (D-03)", async () => {
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
    // route_pending → best-guess route from the name ("front lever" → "FL")
    expect(pending.proposedRoute).toBe("FL");
    // normally routed → never overwrite the route → NULL
    expect(routed.proposedRoute).toBeNull();
  });

  it("D — an exercise with no leverage keyword gets proposed_leverage = NULL", async () => {
    const id = await seedExercise({
      name: `${MARK}_D Muscle Up`,
      route: "MU",
    });

    await runBootstrap(app.db);

    const p = (await getProposals(id))[0];
    expect(p.proposedSubfamily).toBe("Muscle Up");
    expect(p.proposedLeverage).toBeNull();
  });

  it("E — writes NO exercises truth column (subfamily_id/leverage/route/route_pending unchanged)", async () => {
    const id = await seedExercise({
      name: `${MARK}_E Straddle Back Lever`,
      route: "BL",
      routePending: false,
    });

    const before = await getExercise(id);
    await runBootstrap(app.db);
    const after = await getExercise(id);

    // The bootstrap inserts ONLY into the proposals table.
    expect(after.subfamilyId).toBe(before.subfamilyId);
    expect(after.subfamilyId).toBeNull();
    expect(after.leverage).toBe(before.leverage);
    expect(after.leverage).toBeNull();
    expect(after.route).toBe(before.route);
    expect(after.route).toBe("BL");
    expect(after.routePending).toBe(before.routePending);
    expect(after.routePending).toBe(false);

    // ...but it DID create the proposal (leverage keyword "straddle" matched).
    const p = (await getProposals(id))[0];
    expect(p.proposedSubfamily).toBe("Back Lever");
    expect(p.proposedLeverage).toBe("Straddle");
  });
});
