import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq, and } from "drizzle-orm";
import {
  createTestApp,
  registerUser,
  createStaffUser,
  getAuthToken,
  cleanAllTestData,
} from "../helpers";
import * as schema from "../../src/db/schema";

/**
 * Integration test for the admin/coach tree editor (TREE-07), reworked for
 * "Progresión por ruta + Habilidad". The partition axis is now `(route × effort)`
 * (sub-families are gone) and the GET response groups categories → routes[].
 *
 * Seeds a real two-partition graph in the per-worker MySQL test DB:
 *   - route PULLR (PULL → Tracción): 3 canonical CON nodes at dl 1/3/5, auto chain
 *   - route PUSHR (PUSH → Empuje):   2 canonical CON nodes at dl 1/5,   auto chain
 *
 * Covers every editor route:
 *   - GET  /tree        → editable structure, auto/manual tagged, no 'reached'
 *   - POST /reorder     → rewrites partition as manual chain + clears its auto
 *   - POST /precedence  → add/remove a single manual cross-edge, idempotent add
 *   - POST /regroup     → reassign exercises.route + bounded incident-edge prune
 *   - AUTH              → member→403, no token→401, bad ids→4xx not 500
 */
describe("tree-editor admin routes (progresión por ruta)", () => {
  let app: FastifyInstance;
  let coachToken: string;

  // ── Seed helpers ───────────────────────────────────────────────────────────

  /** Insert one route (the INNER-JOIN target via exercises.route = routes.code). */
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
        habilidad: opts.habilidad ?? null,
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

  /**
   * Seed two partitions (route codes are also the partition dimension):
   *   PULLR (CON): a1(dl1) → a3(dl3) → a5(dl5)  auto
   *   PUSHR (CON): b1(dl1) → b5(dl5)            auto
   */
  async function seedGraph(): Promise<{
    routeA: number;
    routeB: number;
    a1: number;
    a3: number;
    a5: number;
    b1: number;
    b5: number;
  }> {
    const routeA = await createRoute("PULLR", "Dominadas");
    const routeB = await createRoute("PUSHR", "Fondos");

    const a1 = await createExercise({
      name: "A dl1",
      pattern: "PULL",
      effort: "CON",
      dl: 1,
      route: "PULLR",
    });
    const a3 = await createExercise({
      name: "A dl3",
      pattern: "PULL",
      effort: "CON",
      dl: 3,
      route: "PULLR",
    });
    const a5 = await createExercise({
      name: "A dl5",
      pattern: "PULL",
      effort: "CON",
      dl: 5,
      route: "PULLR",
    });
    await linkEdge(a1, a3, "auto");
    await linkEdge(a3, a5, "auto");

    const b1 = await createExercise({
      name: "B dl1",
      pattern: "PUSH",
      effort: "CON",
      dl: 1,
      route: "PUSHR",
    });
    const b5 = await createExercise({
      name: "B dl5",
      pattern: "PUSH",
      effort: "CON",
      dl: 5,
      route: "PUSHR",
    });
    await linkEdge(b1, b5, "auto");

    return { routeA, routeB, a1, a3, a5, b1, b5 };
  }

  function authHeaders(token: string): { authorization: string } {
    return { authorization: `Bearer ${token}` };
  }

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    // exercise_progressions is not in cleanAllTestData (exercises + routes ARE).
    await app.db.delete(schema.exerciseProgressions);

    // Fresh coach token per test (the user is wiped by cleanAllTestData).
    const email = `tree-editor-coach-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}@test.com`;
    await createStaffUser(app, {
      email,
      password: "password123",
      firstName: "Coach",
      lastName: "Editor",
      role: "coach",
      branchId: 1,
    });
    coachToken = await getAuthToken(app, email, "password123");
  });

  // ── AUTH (T-128-03) ─────────────────────────────────────────────────────────

  it("rejects an unauthenticated request with 401 on every route", async () => {
    const routes: Array<[string, string, object | undefined]> = [
      ["GET", "/api/admin/tree-editor/tree", undefined],
      [
        "POST",
        "/api/admin/tree-editor/reorder",
        { route: "PULLR", effort: "CON", orderedExerciseIds: [1] },
      ],
      [
        "POST",
        "/api/admin/tree-editor/precedence",
        { fromExerciseId: 1, toExerciseId: 2, op: "add" },
      ],
      [
        "POST",
        "/api/admin/tree-editor/regroup",
        { exerciseIds: [1], targetRoute: "PUSHR" },
      ],
    ];
    for (const [method, url, payload] of routes) {
      const res = await app.inject({ method: method as "GET", url, payload });
      expect(res.statusCode).toBe(401);
    }
  });

  it("rejects a MEMBER token with 403 on every route", async () => {
    const { a1, a3, a5 } = await seedGraph();
    const { token } = await registerUser(app, {
      email: `tree-editor-member-${Date.now()}@test.com`,
      password: "password123",
      branchId: 1,
    });

    const calls: Array<[string, string, object | undefined]> = [
      ["GET", "/api/admin/tree-editor/tree", undefined],
      [
        "POST",
        "/api/admin/tree-editor/reorder",
        { route: "PULLR", effort: "CON", orderedExerciseIds: [a5, a3, a1] },
      ],
      [
        "POST",
        "/api/admin/tree-editor/precedence",
        { fromExerciseId: a5, toExerciseId: a1, op: "add" },
      ],
      [
        "POST",
        "/api/admin/tree-editor/regroup",
        { exerciseIds: [a1], targetRoute: "PUSHR" },
      ],
    ];
    for (const [method, url, payload] of calls) {
      const res = await app.inject({
        method: method as "GET",
        url,
        headers: authHeaders(token),
        payload,
      });
      expect(res.statusCode).toBe(403);
    }
  });

  // ── READ (D-06) ─────────────────────────────────────────────────────────────

  it("GET /tree returns the editable structure tagged auto, with no 'reached' field", async () => {
    const { routeA, a1, a3, a5 } = await seedGraph();

    const res = await app.inject({
      method: "GET",
      url: "/api/admin/tree-editor/tree",
      headers: authHeaders(coachToken),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);

    const traccion = body.categories.find(
      (c: { key: string }) => c.key === "Tracción",
    );
    expect(traccion).toBeDefined();
    const rtA = traccion.routes.find((r: { id: number }) => r.id === routeA);
    expect(rtA).toBeDefined();
    const conPart = rtA.partitions.find(
      (p: { effort: string }) => p.effort === "CON",
    );
    expect(conPart.overridden).toBe(false);
    // auto order = dl ascending: a1, a3, a5
    expect(
      conPart.nodes.map((n: { exerciseId: number }) => n.exerciseId),
    ).toEqual([a1, a3, a5]);
    for (const node of conPart.nodes) {
      expect(node.orderSource).toBe("auto");
      expect(node).not.toHaveProperty("reached");
    }
  });

  // ── REORDER (D-02/D-03) ─────────────────────────────────────────────────────

  it("POST /reorder rewrites the partition as manual edges and clears its auto edges", async () => {
    const { routeA, a1, a3, a5, b1, b5 } = await seedGraph();

    const res = await app.inject({
      method: "POST",
      url: "/api/admin/tree-editor/reorder",
      headers: authHeaders(coachToken),
      payload: {
        route: "PULLR",
        effort: "CON",
        orderedExerciseIds: [a5, a1, a3],
      },
    });
    expect(res.statusCode).toBe(200);

    const edges = await getEdges();
    // Partition A now has exactly the manual chain a5→a1→a3 (no auto in A).
    const aEdges = edges.filter(
      (e) => [a1, a3, a5].includes(e.from) && [a1, a3, a5].includes(e.to),
    );
    expect(aEdges).toEqual(
      [
        { from: a5, to: a1, source: "manual" },
        { from: a1, to: a3, source: "manual" },
      ].sort((x, y) => x.from - y.from || x.to - y.to),
    );
    // Partition B untouched (still its single auto edge).
    const bEdges = edges.filter(
      (e) => [b1, b5].includes(e.from) && [b1, b5].includes(e.to),
    );
    expect(bEdges).toEqual([{ from: b1, to: b5, source: "auto" }]);

    // GET now reports the partition overridden, in the manual order.
    const treeRes = await app.inject({
      method: "GET",
      url: "/api/admin/tree-editor/tree",
      headers: authHeaders(coachToken),
    });
    const body = JSON.parse(treeRes.body);
    const traccion = body.categories.find(
      (c: { key: string }) => c.key === "Tracción",
    );
    const rtA = traccion.routes.find((r: { id: number }) => r.id === routeA);
    const conPart = rtA.partitions.find(
      (p: { effort: string }) => p.effort === "CON",
    );
    expect(conPart.overridden).toBe(true);
    expect(
      conPart.nodes.map((n: { exerciseId: number }) => n.exerciseId),
    ).toEqual([a5, a1, a3]);
  });

  it("POST /reorder is idempotent (re-applying the same order converges)", async () => {
    const { a1, a3, a5 } = await seedGraph();
    const payload = {
      route: "PULLR",
      effort: "CON",
      orderedExerciseIds: [a5, a1, a3],
    };
    await app.inject({
      method: "POST",
      url: "/api/admin/tree-editor/reorder",
      headers: authHeaders(coachToken),
      payload,
    });
    const first = await getEdges();
    await app.inject({
      method: "POST",
      url: "/api/admin/tree-editor/reorder",
      headers: authHeaders(coachToken),
      payload,
    });
    const second = await getEdges();
    expect(second).toEqual(first);
  });

  it("POST /reorder of a single-node partition returns an explicit no-op and writes nothing (WR-04)", async () => {
    await seedGraph();
    // A brand-new route with exactly ONE CON node — a single-node partition.
    const routeC = await createRoute("PULLS", "Una sola");
    const c1 = await createExercise({
      name: "C dl1",
      pattern: "PULL",
      effort: "CON",
      dl: 1,
      route: "PULLS",
    });
    const before = await getEdges();

    const res = await app.inject({
      method: "POST",
      url: "/api/admin/tree-editor/reorder",
      headers: authHeaders(coachToken),
      payload: { route: "PULLS", effort: "CON", orderedExerciseIds: [c1] },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    // Explicit single-node signal, no edges written/deleted.
    expect(body.singleNode).toBe(true);
    expect(body.edgesWritten).toBe(0);
    expect(body.edgesDeleted).toBe(0);
    expect(typeof body.message).toBe("string");

    // Nothing touched in the DB → no half-locked partition.
    const after = await getEdges();
    expect(after).toEqual(before);

    // The partition is NOT marked overridden (no manual edge exists for it).
    const treeRes = await app.inject({
      method: "GET",
      url: "/api/admin/tree-editor/tree",
      headers: authHeaders(coachToken),
    });
    const tree = JSON.parse(treeRes.body);
    const traccion = tree.categories.find(
      (c: { key: string }) => c.key === "Tracción",
    );
    const rtC = traccion.routes.find((r: { id: number }) => r.id === routeC);
    const conPart = rtC.partitions.find(
      (p: { effort: string }) => p.effort === "CON",
    );
    expect(conPart.overridden).toBe(false);
  });

  it("POST /reorder with an id set not matching the partition → 400 (not 500)", async () => {
    const { a1, a3 } = await seedGraph();
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/tree-editor/reorder",
      headers: authHeaders(coachToken),
      // missing a5
      payload: {
        route: "PULLR",
        effort: "CON",
        orderedExerciseIds: [a1, a3],
      },
    });
    expect(res.statusCode).toBe(400);
  });

  // ── PRECEDENCE (D-04) ───────────────────────────────────────────────────────

  it("POST /precedence adds then removes a single manual cross-edge, idempotent add", async () => {
    const { a5, b1 } = await seedGraph();

    // add a5 → b1 (cross-partition precedence)
    const add = await app.inject({
      method: "POST",
      url: "/api/admin/tree-editor/precedence",
      headers: authHeaders(coachToken),
      payload: { fromExerciseId: a5, toExerciseId: b1, op: "add" },
    });
    expect(add.statusCode).toBe(200);
    let edges = await getEdges();
    expect(edges).toContainEqual({ from: a5, to: b1, source: "manual" });

    // idempotent add (no duplicate)
    const addAgain = await app.inject({
      method: "POST",
      url: "/api/admin/tree-editor/precedence",
      headers: authHeaders(coachToken),
      payload: { fromExerciseId: a5, toExerciseId: b1, op: "add" },
    });
    expect(addAgain.statusCode).toBe(200);
    const dupCount = (await getEdges()).filter(
      (e) => e.from === a5 && e.to === b1,
    ).length;
    expect(dupCount).toBe(1);

    // remove
    const remove = await app.inject({
      method: "POST",
      url: "/api/admin/tree-editor/precedence",
      headers: authHeaders(coachToken),
      payload: { fromExerciseId: a5, toExerciseId: b1, op: "remove" },
    });
    expect(remove.statusCode).toBe(200);
    edges = await getEdges();
    expect(edges).not.toContainEqual({ from: a5, to: b1, source: "manual" });
  });

  it("POST /precedence rejects from===to with 400", async () => {
    const { a1 } = await seedGraph();
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/tree-editor/precedence",
      headers: authHeaders(coachToken),
      payload: { fromExerciseId: a1, toExerciseId: a1, op: "add" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("POST /precedence rejects a SAME-partition add with 400 and writes nothing (WR-01)", async () => {
    const { a1, a5 } = await seedGraph();
    const before = await getEdges();

    // a1 and a5 live in the SAME (route PULLR × CON) partition. A precedence edge
    // here would falsely lock the partition's auto backbone in rebuild and collide
    // with the auto chain in getNeighbor — reorder owns same-partition ordering
    // (D-03/D-04). It must be rejected at the service boundary.
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/tree-editor/precedence",
      headers: authHeaders(coachToken),
      payload: { fromExerciseId: a1, toExerciseId: a5, op: "add" },
    });
    expect(res.statusCode).toBe(400);

    // Nothing was written: the edge set is byte-identical to before the call,
    // and in particular no manual a1→a5 row exists.
    const after = await getEdges();
    expect(after).toEqual(before);
    expect(after).not.toContainEqual({ from: a1, to: a5, source: "manual" });
  });

  it("POST /precedence remove never deletes an auto edge", async () => {
    const { a1, a3 } = await seedGraph();
    // a1→a3 exists as auto; remove must be a no-op on auto edges.
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/tree-editor/precedence",
      headers: authHeaders(coachToken),
      payload: { fromExerciseId: a1, toExerciseId: a3, op: "remove" },
    });
    expect(res.statusCode).toBe(200);
    const edges = await getEdges();
    expect(edges).toContainEqual({ from: a1, to: a3, source: "auto" });
  });

  it("POST /precedence with a non-existent node id → 404 (not 500)", async () => {
    const { a1 } = await seedGraph();
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/tree-editor/precedence",
      headers: authHeaders(coachToken),
      payload: { fromExerciseId: a1, toExerciseId: 9999999, op: "add" },
    });
    expect(res.statusCode).toBe(404);
  });

  // ── REGROUP (D-05) ──────────────────────────────────────────────────────────

  it("POST /regroup reassigns exercises.route and prunes only the broken incident edge", async () => {
    const { a1, a3, a5, b1, b5 } = await seedGraph();

    // Move a5 from route PULLR to route PUSHR. a3→a5 (was same-partition in PULLR)
    // becomes cross-partition → pruned. a1→a3 (both still in PULLR) survives.
    // b1→b5 (both still in PUSHR) survives.
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/tree-editor/regroup",
      headers: authHeaders(coachToken),
      payload: { exerciseIds: [a5], targetRoute: "PUSHR" },
    });
    expect(res.statusCode).toBe(200);

    // route changed
    const [moved] = await app.db
      .select({ route: schema.exercises.route })
      .from(schema.exercises)
      .where(eq(schema.exercises.id, a5));
    expect(moved.route).toBe("PUSHR");

    const edges = await getEdges();
    // a3→a5 pruned (now cross-partition); a1→a3 and b1→b5 survive.
    expect(edges).not.toContainEqual({ from: a3, to: a5, source: "auto" });
    expect(edges).toContainEqual({ from: a1, to: a3, source: "auto" });
    expect(edges).toContainEqual({ from: b1, to: b5, source: "auto" });

    // Edge between two non-moved nodes (a1→a3) is never touched.
    const a1a3 = await app.db
      .select({ id: schema.exerciseProgressions.id })
      .from(schema.exerciseProgressions)
      .where(
        and(
          eq(schema.exerciseProgressions.fromExerciseId, a1),
          eq(schema.exerciseProgressions.toExerciseId, a3),
        ),
      );
    expect(a1a3).toHaveLength(1);
  });

  it("POST /regroup with a non-existent target route → 404 (not 500)", async () => {
    const { a1 } = await seedGraph();
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/tree-editor/regroup",
      headers: authHeaders(coachToken),
      payload: { exerciseIds: [a1], targetRoute: "NOPE_ROUTE" },
    });
    expect(res.statusCode).toBe(404);
  });

  it("POST /regroup with a non-existent exercise id → 404 (not 500)", async () => {
    await seedGraph();
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/tree-editor/regroup",
      headers: authHeaders(coachToken),
      payload: { exerciseIds: [9999999], targetRoute: "PUSHR" },
    });
    expect(res.statusCode).toBe(404);
  });
});
