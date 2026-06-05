/**
 * Integration test for the profe proposal-review flow (`ProposalService`),
 * reworked for "Progresión por ruta + Habilidad". Runs against real MySQL
 * (eltemplo_test_<worker>), CI-only — do NOT run the suite locally (project
 * policy: local gate is tsc).
 *
 * Contract under test (D-02/D-07):
 *   A. accept writes truth columns: sets exercises.progression_step + habilidad;
 *      the proposal flips to `accepted`.
 *   B. accept on a route_pending row sets exercises.route + route_pending=0 and
 *      still writes the step.
 *   C. reject flips the proposal to `rejected` and leaves exercises untouched
 *      (progression_step / habilidad / route all unchanged).
 *   D. accept with inline override fields uses the overrides, not the proposed
 *      values.
 *   E. bulk-accept accepts every proposal in the list.
 *   F. listProposals returns pending proposals filtered by route, each row
 *      carrying the exercise name + current route + proposed step/habilidad.
 *
 * Seeds exercises + proposals directly via Drizzle (NOT via API) with a unique
 * MARK so the test only touches its own rows. Real clock (fake timers desync from
 * MySQL). FK-safe cleanup in afterEach: delete proposals THEN exercises.
 */

import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { inArray, eq } from "drizzle-orm";
import { createTestApp } from "../helpers";
import * as schema from "../../src/db/schema";
import { ProposalService } from "../../src/modules/admin/proposal-service";

describe("ProposalService — proposal review (progresión por ruta)", () => {
  let app: FastifyInstance;
  let service: ProposalService;

  // Keep MARK short: it prefixes `route` (varchar(20)) with suffixes up to `_B_FL`,
  // so MARK must stay <= 15 chars. `PR` + last 9 digits of the timestamp = 11 chars.
  const MARK = `PR${`${Date.now()}`.slice(-9)}`;
  const seededExerciseIds: number[] = [];
  const seededProposalIds: number[] = [];

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
    proposedStep?: number | null;
    proposedHabilidad?: string | null;
    proposedRoute?: string | null;
  }): Promise<number> {
    const [res] = await app.db
      .insert(schema.exerciseDimensionProposals)
      .values({
        exerciseId: opts.exerciseId,
        proposedStep: opts.proposedStep ?? null,
        proposedHabilidad: opts.proposedHabilidad ?? null,
        proposedRoute: opts.proposedRoute ?? null,
        engine: "heuristic-test",
      })
      .$returningId();
    seededProposalIds.push(res.id);
    return res.id;
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
      await app.db
        .delete(schema.exercises)
        .where(inArray(schema.exercises.id, seededExerciseIds));
      seededExerciseIds.length = 0;
    }
  });

  afterAll(async () => {
    await app.close();
  });

  it("A — accept sets progression_step + habilidad; proposal → accepted", async () => {
    const route = `${MARK}_A`;
    const exId = await seedExercise({ name: `${MARK}_A_ex`, route });
    const propId = await seedProposal({
      exerciseId: exId,
      proposedStep: 2,
      proposedHabilidad: null,
    });

    await service.accept(propId);

    const ex = await getExercise(exId);
    expect(ex.progressionStep).toBe(2);
    expect(ex.habilidad).toBeNull();
    // route is untouched (not a route_pending row, no override).
    expect(ex.route).toBe(route);
    expect(await getProposalStatus(propId)).toBe("accepted");
  });

  it("B — accept on a route_pending row sets route + clears route_pending + writes step", async () => {
    const route = ""; // route_pending rows have an empty route until accept
    const exId = await seedExercise({
      name: `${MARK}_B_ex`,
      route,
      routePending: true,
    });
    const propId = await seedProposal({
      exerciseId: exId,
      proposedStep: 1,
      proposedRoute: `${MARK}_B_FL`,
    });

    await service.accept(propId);

    const ex = await getExercise(exId);
    expect(ex.route).toBe(`${MARK}_B_FL`);
    expect(ex.routePending).toBe(false);
    expect(ex.progressionStep).toBe(1);
  });

  it("C — reject flips status and leaves exercises untouched", async () => {
    const route = `${MARK}_C`;
    const exId = await seedExercise({ name: `${MARK}_C_ex`, route });
    const propId = await seedProposal({
      exerciseId: exId,
      proposedStep: 3,
      proposedHabilidad: "RINGS",
    });

    const before = await getExercise(exId);
    await service.reject(propId);

    const after = await getExercise(exId);
    expect(await getProposalStatus(propId)).toBe("rejected");
    expect(after.progressionStep).toBe(before.progressionStep); // still null
    expect(after.progressionStep).toBeNull();
    expect(after.habilidad).toBe(before.habilidad); // still null
    expect(after.route).toBe(before.route);
    expect(after.routePending).toBe(before.routePending);
  });

  it("D — accept uses inline override fields over the proposed values", async () => {
    const route = `${MARK}_D`;
    const exId = await seedExercise({ name: `${MARK}_D_ex`, route });
    const propId = await seedProposal({
      exerciseId: exId,
      proposedStep: 2,
      proposedHabilidad: "WRONG",
    });

    await service.accept(propId, {
      proposedStep: 5,
      proposedHabilidad: "RINGS",
    });

    const ex = await getExercise(exId);
    expect(ex.progressionStep).toBe(5);
    expect(ex.habilidad).toBe("RINGS");
  });

  it("E — bulk-accept accepts every proposal in the list", async () => {
    const route = `${MARK}_E`;
    const ex1 = await seedExercise({ name: `${MARK}_E_ex1`, route });
    const ex2 = await seedExercise({ name: `${MARK}_E_ex2`, route });
    const p1 = await seedProposal({ exerciseId: ex1, proposedStep: 1 });
    const p2 = await seedProposal({ exerciseId: ex2, proposedStep: 2 });

    const count = await service.bulkAccept([p1, p2]);

    expect(count).toBe(2);
    expect(await getProposalStatus(p1)).toBe("accepted");
    expect(await getProposalStatus(p2)).toBe("accepted");
    const e1 = await getExercise(ex1);
    const e2 = await getExercise(ex2);
    expect(e1.progressionStep).toBe(1);
    expect(e2.progressionStep).toBe(2);
  });

  it("F — listProposals returns pending proposals filtered by route with name + proposed fields", async () => {
    const route = `${MARK}_F`;
    const exId = await seedExercise({ name: `${MARK}_F_ex`, route });
    await seedProposal({
      exerciseId: exId,
      proposedStep: 4,
      proposedHabilidad: "WIDE",
    });

    const result = await service.listProposals({ route });

    expect(result.total).toBeGreaterThanOrEqual(1);
    const row = result.proposals.find((p) => p.exerciseId === exId);
    expect(row).toBeDefined();
    expect(row?.exerciseName).toBe(`${MARK}_F_ex`);
    expect(row?.currentRoute).toBe(route);
    expect(row?.proposedStep).toBe(4);
    expect(row?.proposedHabilidad).toBe("WIDE");
    expect(row?.status).toBe("pending");
  });
});
