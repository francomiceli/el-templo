/**
 * Phase 125 Plan 02 — Integration test for the profe proposal-review flow
 * (`ProposalService`). Runs against real MySQL (eltemplo_test_<worker>),
 * CI-only — do NOT run the suite locally (project policy: local gate is tsc).
 *
 * Contract under test (D-02/D-07):
 *   A. accept writes truth columns: resolves/creates exercise_subfamilies, sets
 *      exercises.subfamily_id + leverage; the proposal flips to `accepted`.
 *   B. accept on a route_pending row sets exercises.route + route_pending=0.
 *   C. reject flips the proposal to `rejected` and leaves exercises untouched
 *      (subfamily_id / leverage / route all unchanged).
 *   D. accept with inline override fields uses the overrides, not the proposed
 *      values.
 *   E. bulk-accept-group accepts every proposal in a route group.
 *   F. listProposals returns pending proposals filtered by route, each row
 *      carrying the exercise name + current route.
 *
 * Seeds exercises + proposals directly via Drizzle (NOT via API) with a unique
 * MARK so the test only touches its own rows. Real clock (fake timers desync
 * from MySQL). FK-safe cleanup in afterEach: delete proposals THEN exercises
 * THEN seeded subfamilies.
 */

import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { inArray, eq } from "drizzle-orm";
import { createTestApp } from "../helpers";
import * as schema from "../../src/db/schema";
import { ProposalService } from "../../src/modules/admin/proposal-service";

describe("ProposalService — proposal review (Phase 125 Plan 02)", () => {
  let app: FastifyInstance;
  let service: ProposalService;

  const MARK = `PROP_TEST_${Date.now()}`;
  const seededExerciseIds: number[] = [];
  const seededProposalIds: number[] = [];
  const seededSubfamilyRoutes = new Set<string>();

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
    seededExerciseIds.push(res.id);
    return res.id;
  }

  async function seedProposal(opts: {
    exerciseId: number;
    proposedSubfamily: string | null;
    proposedLeverage?: string | null;
    proposedRoute?: string | null;
  }): Promise<number> {
    const [res] = await app.db
      .insert(schema.exerciseDimensionProposals)
      .values({
        exerciseId: opts.exerciseId,
        proposedSubfamily: opts.proposedSubfamily,
        proposedLeverage: opts.proposedLeverage ?? null,
        proposedRoute: opts.proposedRoute ?? null,
        engine: "heuristic-test",
      })
      .$returningId();
    seededProposalIds.push(res.id);
    return res.id;
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
      .where(eq(schema.exercises.id, id));
    return row;
  }

  async function getProposalStatus(id: number): Promise<string> {
    const [row] = await app.db
      .select({ status: schema.exerciseDimensionProposals.status })
      .from(schema.exerciseDimensionProposals)
      .where(eq(schema.exerciseDimensionProposals.id, id));
    return row.status;
  }

  async function getSubfamily(id: number): Promise<{
    route: string;
    name: string;
  }> {
    const [row] = await app.db
      .select({
        route: schema.exerciseSubfamilies.route,
        name: schema.exerciseSubfamilies.name,
      })
      .from(schema.exerciseSubfamilies)
      .where(eq(schema.exerciseSubfamilies.id, id));
    return row;
  }

  beforeAll(async () => {
    app = await createTestApp();
    service = new ProposalService(app.db);
  });

  afterEach(async () => {
    if (seededProposalIds.length > 0) {
      await app.db
        .delete(schema.exerciseDimensionProposals)
        .where(
          inArray(schema.exerciseDimensionProposals.id, seededProposalIds),
        );
      seededProposalIds.length = 0;
    }
    if (seededExerciseIds.length > 0) {
      // Detach the subfamily FK before deleting the catalog rows below.
      await app.db
        .update(schema.exercises)
        .set({ subfamilyId: null })
        .where(inArray(schema.exercises.id, seededExerciseIds));
      await app.db
        .delete(schema.exercises)
        .where(inArray(schema.exercises.id, seededExerciseIds));
      seededExerciseIds.length = 0;
    }
    // Clean any subfamilies the accept flow created for our marked routes.
    for (const route of seededSubfamilyRoutes) {
      await app.db
        .delete(schema.exerciseSubfamilies)
        .where(eq(schema.exerciseSubfamilies.route, route));
    }
    seededSubfamilyRoutes.clear();
  });

  afterAll(async () => {
    await app.close();
  });

  it("A — accept resolves/creates subfamily + sets subfamily_id + leverage; proposal → accepted", async () => {
    const route = `${MARK}_A`;
    seededSubfamilyRoutes.add(route);
    const exId = await seedExercise({ name: `${MARK}_A_ex`, route });
    const propId = await seedProposal({
      exerciseId: exId,
      proposedSubfamily: "Planche",
      proposedLeverage: "tuck",
    });

    await service.accept(propId);

    const ex = await getExercise(exId);
    expect(ex.subfamilyId).not.toBeNull();
    expect(ex.leverage).toBe("tuck");
    expect(await getProposalStatus(propId)).toBe("accepted");

    const sf = await getSubfamily(ex.subfamilyId as number);
    expect(sf.route).toBe(route);
    expect(sf.name).toBe("Planche");
  });

  it("B — accept on a route_pending row sets route + clears route_pending", async () => {
    const route = ""; // route_pending rows have an empty route until accept
    const exId = await seedExercise({
      name: `${MARK}_B_ex`,
      route,
      routePending: true,
    });
    const propId = await seedProposal({
      exerciseId: exId,
      proposedSubfamily: "Front Lever",
      proposedLeverage: "straddle",
      proposedRoute: `${MARK}_B_FL`,
    });
    seededSubfamilyRoutes.add(`${MARK}_B_FL`);

    await service.accept(propId);

    const ex = await getExercise(exId);
    expect(ex.route).toBe(`${MARK}_B_FL`);
    expect(ex.routePending).toBe(false);
    expect(ex.subfamilyId).not.toBeNull();
    // subfamily resolved against the NEW (proposed) route.
    const sf = await getSubfamily(ex.subfamilyId as number);
    expect(sf.route).toBe(`${MARK}_B_FL`);
  });

  it("C — reject flips status and leaves exercises untouched", async () => {
    const route = `${MARK}_C`;
    const exId = await seedExercise({ name: `${MARK}_C_ex`, route });
    const propId = await seedProposal({
      exerciseId: exId,
      proposedSubfamily: "Back Lever",
      proposedLeverage: "full",
    });

    const before = await getExercise(exId);
    await service.reject(propId);

    const after = await getExercise(exId);
    expect(await getProposalStatus(propId)).toBe("rejected");
    expect(after.subfamilyId).toBe(before.subfamilyId); // still null
    expect(after.leverage).toBe(before.leverage); // still null
    expect(after.route).toBe(before.route);
    expect(after.routePending).toBe(before.routePending);
  });

  it("D — accept uses inline override fields over the proposed values", async () => {
    const route = `${MARK}_D`;
    seededSubfamilyRoutes.add(route);
    const exId = await seedExercise({ name: `${MARK}_D_ex`, route });
    const propId = await seedProposal({
      exerciseId: exId,
      proposedSubfamily: "WrongName",
      proposedLeverage: "tuck",
    });

    await service.accept(propId, {
      proposedSubfamily: "CorrectName",
      proposedLeverage: "full",
    });

    const ex = await getExercise(exId);
    expect(ex.leverage).toBe("full");
    const sf = await getSubfamily(ex.subfamilyId as number);
    expect(sf.name).toBe("CorrectName");
  });

  it("E — bulk-accept-group accepts every proposal in a route group", async () => {
    const route = `${MARK}_E`;
    seededSubfamilyRoutes.add(route);
    const ex1 = await seedExercise({ name: `${MARK}_E_ex1`, route });
    const ex2 = await seedExercise({ name: `${MARK}_E_ex2`, route });
    const p1 = await seedProposal({
      exerciseId: ex1,
      proposedSubfamily: "Handstand",
      proposedLeverage: "tuck",
    });
    const p2 = await seedProposal({
      exerciseId: ex2,
      proposedSubfamily: "Handstand",
      proposedLeverage: "straddle",
    });

    const count = await service.bulkAccept([p1, p2]);

    expect(count).toBe(2);
    expect(await getProposalStatus(p1)).toBe("accepted");
    expect(await getProposalStatus(p2)).toBe("accepted");
    const e1 = await getExercise(ex1);
    const e2 = await getExercise(ex2);
    expect(e1.subfamilyId).not.toBeNull();
    expect(e2.subfamilyId).not.toBeNull();
  });

  it("F — listProposals returns pending proposals filtered by route with the exercise name", async () => {
    const route = `${MARK}_F`;
    const exId = await seedExercise({ name: `${MARK}_F_ex`, route });
    await seedProposal({
      exerciseId: exId,
      proposedSubfamily: "Muscle Up",
      proposedLeverage: null,
    });

    const result = await service.listProposals({ route });

    expect(result.total).toBeGreaterThanOrEqual(1);
    const row = result.proposals.find((p) => p.exerciseId === exId);
    expect(row).toBeDefined();
    expect(row?.exerciseName).toBe(`${MARK}_F_ex`);
    expect(row?.currentRoute).toBe(route);
    expect(row?.status).toBe("pending");
  });
});
