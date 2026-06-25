import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { and, eq, isNotNull } from "drizzle-orm";
import {
  createTestApp,
  registerUser,
  createStaffUser,
  getAuthToken,
  cleanAllTestData,
} from "../helpers";
import * as schema from "../../src/db/schema";
import { backboneNodeConditions } from "../../src/modules/exercises/backbone-scope";
import { TRAINING_EXCLUSIVE_COACH_EMAIL } from "../../src/modules/shared/permissions";

/**
 * Integration test for Plan 135-03 (D-11): GET /admin/tree-editor/tree embeds
 * `variants[]` under each hito node — the exercises whose TRUTH column
 * `milestone_exercise_id` points at that hito — loaded by a SEPARATE batched
 * query, grouped in JS, ordered by dl ascending.
 *
 * The load-bearing guarantee (B-NOREGRESION): variantes are OFF the backbone
 * node set. They must appear ONLY inside `variants[]`, NEVER as top-level
 * backbone nodes — because member-tree / getNeighbor / rebuild all read the
 * same `backboneNodeConditions()` predicate (`milestone_exercise_id IS NULL`).
 * If that predicate were ever loosened, a variante would leak into the node set
 * and this test fails loudly.
 *
 * Seeds (per-worker MySQL test DB):
 *   route PULLR (PULL → Tracción), CON:
 *     hHito (dl3)  — a hito WITH variants
 *       vLow  (dl1, milestone=hHito)
 *       vHigh (dl5, milestone=hHito)
 *     hBare (dl7)  — a hito with NO variants → variants []
 */
describe("tree-editor /tree embeds variants[] per hito (D-11)", () => {
  let app: FastifyInstance;
  let coachToken: string;

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
    milestoneExerciseId?: number | null;
  }): Promise<number> {
    const [row] = await app.db
      .insert(schema.exercises)
      .values({
        pattern: opts.pattern,
        category: opts.pattern,
        exercise: opts.name,
        effort: opts.effort,
        difficulty: 1,
        dificultadLineal: opts.dl,
        route: opts.route,
        habilidad: null,
        milestoneExerciseId: opts.milestoneExerciseId ?? null,
        progressionStep: null,
      })
      .$returningId();
    return row.id;
  }

  function authHeaders(token: string): { authorization: string } {
    return { authorization: `Bearer ${token}` };
  }

  /**
   * Seed one route with two hitos; the first hito owns two variantes (one below,
   * one above its dl). Returns the ids so the assertions can pinpoint grouping.
   */
  async function seedWithVariants(): Promise<{
    hHito: number;
    hBare: number;
    vLow: number;
    vHigh: number;
  }> {
    await createRoute("PULLR", "Dominadas");

    const hHito = await createExercise({
      name: "Hito dl3",
      pattern: "PULL",
      effort: "CON",
      dl: 3,
      route: "PULLR",
    });
    const hBare = await createExercise({
      name: "Hito sin variantes dl7",
      pattern: "PULL",
      effort: "CON",
      dl: 7,
      route: "PULLR",
    });
    // Variantes hang off hHito via the TRUTH column. Inserted high-dl FIRST to
    // prove the query orders by dl asc (insertion order would give vHigh,vLow).
    const vHigh = await createExercise({
      name: "Variante dl5",
      pattern: "PULL",
      effort: "CON",
      dl: 5,
      route: "PULLR",
      milestoneExerciseId: hHito,
    });
    const vLow = await createExercise({
      name: "Variante dl1",
      pattern: "PULL",
      effort: "CON",
      dl: 1,
      route: "PULLR",
      milestoneExerciseId: hHito,
    });

    return { hHito, hBare, vLow, vHigh };
  }

  /** Pull every node id across all categories/routes/partitions of the payload. */
  function allBackboneNodeIds(body: {
    categories: Array<{
      routes: Array<{
        partitions: Array<{ nodes: Array<{ exerciseId: number }> }>;
      }>;
    }>;
  }): number[] {
    const ids: number[] = [];
    for (const cat of body.categories) {
      for (const rt of cat.routes) {
        for (const part of rt.partitions) {
          for (const n of part.nodes) ids.push(n.exerciseId);
        }
      }
    }
    return ids;
  }

  function findNode(
    body: {
      categories: Array<{
        routes: Array<{
          partitions: Array<{
            nodes: Array<{
              exerciseId: number;
              variants: Array<{ id: number; name: string; dl: number }>;
            }>;
          }>;
        }>;
      }>;
    },
    exerciseId: number,
  ):
    | { exerciseId: number; variants: Array<{ id: number; dl: number }> }
    | undefined {
    for (const cat of body.categories) {
      for (const rt of cat.routes) {
        for (const part of rt.partitions) {
          for (const n of part.nodes) {
            if (n.exerciseId === exerciseId) return n;
          }
        }
      }
    }
    return undefined;
  }

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    await app.db.delete(schema.exerciseProgressions);

    // The editor is restricted to the exclusive training coach (see
    // canAccessTraining) — seed THAT coach so editor calls are authorized.
    await createStaffUser(app, {
      email: TRAINING_EXCLUSIVE_COACH_EMAIL,
      password: "password123",
      firstName: "Fran",
      lastName: "Scaine",
      role: "coach",
      branchId: 1,
    });
    coachToken = await getAuthToken(
      app,
      TRAINING_EXCLUSIVE_COACH_EMAIL,
      "password123",
    );
  });

  it("groups variants[] under their hito, ordered by dl ascending", async () => {
    const { hHito, vLow, vHigh } = await seedWithVariants();

    const res = await app.inject({
      method: "GET",
      url: "/api/admin/tree-editor/tree",
      headers: authHeaders(coachToken),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);

    const hitoNode = findNode(body, hHito);
    expect(hitoNode).toBeDefined();
    // Exactly the two variantes, ordered dl asc (vLow dl1, vHigh dl5) — proving
    // the dl-asc orderBy despite vHigh being inserted first.
    expect(hitoNode?.variants.map((v) => v.id)).toEqual([vLow, vHigh]);
    expect(hitoNode?.variants.map((v) => v.dl)).toEqual([1, 5]);
    // Item shape is {id,name,dl} verbatim — name carried through.
    expect(hitoNode?.variants[0]).toMatchObject({
      id: vLow,
      name: "Variante dl1",
      dl: 1,
    });
  });

  it("a hito with no variants carries variants []", async () => {
    const { hBare } = await seedWithVariants();

    const res = await app.inject({
      method: "GET",
      url: "/api/admin/tree-editor/tree",
      headers: authHeaders(coachToken),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);

    const bareNode = findNode(body, hBare);
    expect(bareNode).toBeDefined();
    expect(bareNode?.variants).toEqual([]);
  });

  it("backbone node-set excludes variants — they never appear as top-level nodes (B-NOREGRESION)", async () => {
    const { hHito, hBare, vLow, vHigh } = await seedWithVariants();

    const res = await app.inject({
      method: "GET",
      url: "/api/admin/tree-editor/tree",
      headers: authHeaders(coachToken),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);

    const nodeIds = allBackboneNodeIds(body);
    // Hitos ARE backbone nodes.
    expect(nodeIds).toContain(hHito);
    expect(nodeIds).toContain(hBare);
    // Variantes are NOT backbone nodes — only inside variants[].
    expect(nodeIds).not.toContain(vLow);
    expect(nodeIds).not.toContain(vHigh);

    // Cross-check against the shared backbone predicate itself: every exercise
    // with a non-null milestone_exercise_id (i.e. a variante) must be ABSENT
    // from the predicate's selection. This is the exact guarantee member-tree /
    // getNeighbor / rebuild rely on; it fails loudly if the predicate is ever
    // loosened to admit milestone_exercise_id IS NOT NULL rows.
    const backboneRows = await app.db
      .select({ id: schema.exercises.id })
      .from(schema.exercises)
      // The predicate references routes.* (condition 5), so join routes exactly
      // as loadGraphNodes does — this IS the backbone node-set query.
      .innerJoin(schema.routes, eq(schema.exercises.route, schema.routes.code))
      .where(and(...backboneNodeConditions()));
    const backboneIds = new Set(backboneRows.map((r) => r.id));
    expect(backboneIds.has(vLow)).toBe(false);
    expect(backboneIds.has(vHigh)).toBe(false);

    // And the variantes DO exist as rows flagged off-backbone (non-null milestone).
    const variantRows = await app.db
      .select({ id: schema.exercises.id })
      .from(schema.exercises)
      .where(isNotNull(schema.exercises.milestoneExerciseId));
    const variantIds = new Set(variantRows.map((r) => r.id));
    expect(variantIds.has(vLow)).toBe(true);
    expect(variantIds.has(vHigh)).toBe(true);
  });

  it("rejects a MEMBER token with 403", async () => {
    await seedWithVariants();
    const { token } = await registerUser(app, {
      email: `tree-variants-member-${Date.now()}@test.com`,
      password: "password123",
      branchId: 1,
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/admin/tree-editor/tree",
      headers: authHeaders(token),
    });
    expect(res.statusCode).toBe(403);
  });
});
