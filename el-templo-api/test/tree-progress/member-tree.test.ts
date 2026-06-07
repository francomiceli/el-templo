import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { createTestApp, registerUser, cleanAllTestData } from "../helpers";
import * as schema from "../../src/db/schema";

/**
 * Integration test for GET /api/tree-progress/me (TREE-06), reworked for
 * "Progresión por ruta + Habilidad". The response keeps the `subfamilies[]` field
 * name for the member-app contract, but each group is now one ROUTE.
 *
 * Seeds a real backbone graph in the per-worker MySQL test DB:
 *   - route PULLR (PULL → Tracción) with 3 canonical nodes at dl 2/5/8
 *   - route PUSHR (PUSH → Empuje) with 2 canonical nodes at dl 1/9
 *   - exercise_progressions edges so the nodes are real graph nodes
 *   - OFF-graph exercises (non-canonical / off-effort / habilidad variant /
 *     excluded route / milestone variante) that MUST NOT appear in the tree
 *
 * Asserts: 5-category grouping order, per-route %, reached-by-ceiling,
 * 401-without-token, and own-scope isolation (member A's higher level never leaks
 * into member B's tree). The structure source is the shared backbone predicate
 * (src/modules/exercises/backbone-scope.ts), mirrored by rebuild-progression-graph:
 *   canonical_exercise_id IS NULL AND effort IN ('CON','EXC','ISO')
 *   AND habilidad IS NULL AND milestone_exercise_id IS NULL
 *   AND routes.excluded_from_tree = false
 */
describe("GET /api/tree-progress/me", () => {
  let app: FastifyInstance;

  // ── Seed helpers ─────────────────────────────────────────────────────────

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
    canonicalExerciseId?: number | null;
    habilidad?: string | null;
    milestoneExerciseId?: number | null;
  }): Promise<number> {
    const [row] = await app.db
      .insert(schema.exercises)
      .values({
        pattern: opts.pattern,
        category: opts.pattern, // fine category unused by the tree; mirror pattern
        exercise: opts.name,
        effort: opts.effort,
        difficulty: 1,
        dificultadLineal: opts.dl,
        route: opts.route,
        habilidad: opts.habilidad ?? null,
        canonicalExerciseId: opts.canonicalExerciseId ?? null,
        milestoneExerciseId: opts.milestoneExerciseId ?? null,
      })
      .$returningId();
    return row.id;
  }

  async function linkEdge(fromId: number, toId: number): Promise<void> {
    await app.db
      .insert(schema.exerciseProgressions)
      .values({ fromExerciseId: fromId, toExerciseId: toId, source: "auto" });
  }

  /**
   * Seed a single exercise_adjustments row for the latest-dominado seam (phase
   * 131, ADJUST-04). `createdAt` is explicit so the latest-wins ordering is
   * deterministic across rows.
   */
  async function seedAdjustment(opts: {
    memberId: number;
    exerciseId: number;
    toExerciseId: number;
    status: "dominado" | "bajado";
    createdAt: Date;
  }): Promise<void> {
    await app.db.insert(schema.exerciseAdjustments).values({
      memberId: opts.memberId,
      exerciseId: opts.exerciseId,
      toExerciseId: opts.toExerciseId,
      status: opts.status,
      dayId: "W1-lunes-sigma",
      date: "2026-06-05",
      createdAt: opts.createdAt,
    });
  }

  async function setLevel(
    userId: number,
    level: "alfa" | "delta" | "sigma" | "omega" | "spartan",
  ): Promise<void> {
    await app.db
      .update(schema.users)
      .set({ level })
      .where(eq(schema.users.id, userId));
  }

  /**
   * Seed the standard two-route graph plus off-graph noise.
   * Returns the created route ids and the node exercise ids by dl.
   */
  async function seedGraph(): Promise<{
    routeA: number;
    routeB: number;
    aNodes: number[];
    bNodes: number[];
  }> {
    const routeA = await createRoute("PULLR", "Dominadas");
    const routeB = await createRoute("PUSHR", "Fondos");

    // Route A (PULL → Tracción): dl 2, 5, 8
    const a2 = await createExercise({
      name: "Pull node dl2",
      pattern: "PULL",
      effort: "CON",
      dl: 2,
      route: "PULLR",
    });
    const a5 = await createExercise({
      name: "Pull node dl5",
      pattern: "PULL",
      effort: "CON",
      dl: 5,
      route: "PULLR",
    });
    const a8 = await createExercise({
      name: "Pull node dl8",
      pattern: "PULL",
      effort: "CON",
      dl: 8,
      route: "PULLR",
    });
    await linkEdge(a2, a5);
    await linkEdge(a5, a8);

    // Route B (PUSH → Empuje): dl 1, 9
    const b1 = await createExercise({
      name: "Push node dl1",
      pattern: "PUSH",
      effort: "CON",
      dl: 1,
      route: "PUSHR",
    });
    const b9 = await createExercise({
      name: "Push node dl9",
      pattern: "PUSH",
      effort: "CON",
      dl: 9,
      route: "PUSHR",
    });
    await linkEdge(b1, b9);

    // OFF-graph noise that must NEVER appear:
    // (1) non-canonical (canonical_exercise_id NOT NULL)
    await createExercise({
      name: "Off-graph soft-merged dupe",
      pattern: "PULL",
      effort: "CON",
      dl: 3,
      route: "PULLR",
      canonicalExerciseId: a2,
    });
    // (2) off-effort (effort NOT IN CON/EXC/ISO)
    await createExercise({
      name: "Off-graph cardio",
      pattern: "PUSH",
      effort: "",
      dl: 4,
      route: "PUSHR",
    });
    // (3) Habilidad variant (habilidad != NULL → off the backbone)
    await createExercise({
      name: "Off-graph habilidad variant",
      pattern: "PULL",
      effort: "CON",
      dl: 6,
      route: "PULLR",
      habilidad: "WIDE",
    });
    // (4) excluded route (movilidad/games never enter the strength tree)
    await createRoute("EXCLR", "Movilidad de prueba", true);
    await createExercise({
      name: "Off-graph excluded-route node",
      pattern: "PULL",
      effort: "CON",
      dl: 7,
      route: "EXCLR",
    });
    // (5) milestone VARIANTE (milestone_exercise_id NOT NULL → off the backbone,
    //     phase 133 R1-FILTER). At dl 4 it would be reached by any sigma+ member
    //     and would inflate Tracción's counts/percent if it leaked into the tree.
    await createExercise({
      name: "Off-graph milestone variante",
      pattern: "PULL",
      effort: "CON",
      dl: 4,
      route: "PULLR",
      milestoneExerciseId: a2,
    });

    return { routeA, routeB, aNodes: [a2, a5, a8], bNodes: [b1, b9] };
  }

  function findCategory(
    body: { categories: Array<{ key: string }> },
    key: string,
  ): {
    key: string;
    percent: number;
    totalNodes: number;
    reachedNodes: number;
    subfamilies: Array<{
      id: number;
      percent: number;
      totalNodes: number;
      reachedNodes: number;
      nodes: Array<{ exerciseId: number; reached: boolean; name: string }>;
    }>;
  } {
    const cat = body.categories.find((c) => c.key === key);
    if (!cat) throw new Error(`category ${key} missing from response`);
    return cat as never;
  }

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    // exercise_adjustments / exercise_progressions are not in cleanAllTestData
    // (exercises + routes ARE); wipe them so each test starts from an empty graph.
    // Adjustments first (FK → exercises/users), then edges.
    await app.db.delete(schema.exerciseAdjustments);
    await app.db.delete(schema.exerciseProgressions);
  });

  it("returns 401 for unauthenticated request", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/tree-progress/me",
    });
    expect(res.statusCode).toBe(401);
  });

  it("groups by the 5 thematic categories in fixed order", async () => {
    await seedGraph();
    const { token } = await registerUser(app, {
      email: `tree-order-${Date.now()}@test.com`,
      password: "password123",
      branchId: 1,
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/tree-progress/me",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.categories.map((c: { key: string }) => c.key)).toEqual([
      "Tracción",
      "Empuje",
      "Piernas",
      "Core",
      "Movilidad",
    ]);
  });

  it("computes per-route % from the member's level ceiling and never shows off-graph nodes", async () => {
    const { aNodes, bNodes } = await seedGraph();
    const reg = await registerUser(app, {
      email: `tree-sigma-${Date.now()}@test.com`,
      password: "password123",
      branchId: 1,
    });
    const memberId = (reg.user as { id: number }).id;
    // sigma ceiling = 8 → A: dl2,5,8 all reached (100%); B: dl1 reached, dl9 not (50%)
    await setLevel(memberId, "sigma");

    const res = await app.inject({
      method: "GET",
      url: "/api/tree-progress/me",
      headers: { authorization: `Bearer ${reg.token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);

    const traccion = findCategory(body, "Tracción");
    expect(traccion.subfamilies).toHaveLength(1);
    const subA = traccion.subfamilies[0];
    expect(subA.totalNodes).toBe(3);
    expect(subA.reachedNodes).toBe(3);
    expect(subA.percent).toBe(100);
    expect(traccion.percent).toBe(100);

    const empuje = findCategory(body, "Empuje");
    expect(empuje.subfamilies).toHaveLength(1);
    const subB = empuje.subfamilies[0];
    expect(subB.totalNodes).toBe(2);
    expect(subB.reachedNodes).toBe(1);
    expect(subB.percent).toBe(50);

    // below-ceiling node reached, above-ceiling node not reached
    const b1 = subB.nodes.find((n) => n.exerciseId === bNodes[0]);
    const b9 = subB.nodes.find((n) => n.exerciseId === bNodes[1]);
    expect(b1?.reached).toBe(true);
    expect(b9?.reached).toBe(false);

    // off-graph nodes never appear anywhere
    const allNodeIds = body.categories.flatMap(
      (c: { subfamilies: Array<{ nodes: Array<{ exerciseId: number }> }> }) =>
        c.subfamilies.flatMap((s) => s.nodes.map((n) => n.exerciseId)),
    );
    expect(allNodeIds.sort()).toEqual([...aNodes, ...bNodes].sort());

    // empty categories still render with percent 0
    expect(findCategory(body, "Piernas").percent).toBe(0);
    expect(findCategory(body, "Core").subfamilies).toHaveLength(0);
    expect(findCategory(body, "Movilidad").totalNodes).toBe(0);
  });

  it("scopes strictly to the requesting member (A's higher level never leaks into B)", async () => {
    await seedGraph();

    const regA = await registerUser(app, {
      email: `tree-A-${Date.now()}@test.com`,
      password: "password123",
      branchId: 1,
    });
    const regB = await registerUser(app, {
      email: `tree-B-${Date.now()}@test.com`,
      password: "password123",
      branchId: 1,
    });
    const idA = (regA.user as { id: number }).id;
    const idB = (regB.user as { id: number }).id;

    await setLevel(idA, "spartan"); // ceiling 12 → everything reached
    await setLevel(idB, "alfa"); // ceiling 3 → only dl2 in route A reached

    const resA = await app.inject({
      method: "GET",
      url: "/api/tree-progress/me",
      headers: { authorization: `Bearer ${regA.token}` },
    });
    const resB = await app.inject({
      method: "GET",
      url: "/api/tree-progress/me",
      headers: { authorization: `Bearer ${regB.token}` },
    });

    const bodyA = JSON.parse(resA.body);
    const bodyB = JSON.parse(resB.body);

    // A (spartan): Tracción 100%
    expect(findCategory(bodyA, "Tracción").percent).toBe(100);
    // B (alfa): Tracción only dl2 of {2,5,8} reached → 1/3 = 33%
    const subB = findCategory(bodyB, "Tracción").subfamilies[0];
    expect(subB.reachedNodes).toBe(1);
    expect(subB.percent).toBe(33);
  });

  // ── Phase 131 (ADJUST-04): latest-dominado enriches "reached" ─────────────

  it("A — a latest 'dominado' record marks an above-ceiling node as reached", async () => {
    const { bNodes } = await seedGraph();
    const reg = await registerUser(app, {
      email: `tree-dominado-${Date.now()}@test.com`,
      password: "password123",
      branchId: 1,
    });
    const memberId = (reg.user as { id: number }).id;
    // alfa ceiling = 3 → in Empuje, dl1 reached by ceiling, dl9 NOT.
    await setLevel(memberId, "alfa");

    // The member dominated the dl9 node (above ceiling, no completed session).
    await seedAdjustment({
      memberId,
      exerciseId: bNodes[1], // dl9
      toExerciseId: bNodes[0],
      status: "dominado",
      createdAt: new Date("2026-06-05T10:00:00Z"),
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/tree-progress/me",
      headers: { authorization: `Bearer ${reg.token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const empuje = findCategory(body, "Empuje");
    const subB = empuje.subfamilies[0];

    // Both dl1 (ceiling) and dl9 (dominado) now reached → 100%.
    const b9 = subB.nodes.find((n) => n.exerciseId === bNodes[1]);
    expect(b9?.reached).toBe(true);
    expect(subB.reachedNodes).toBe(2);
    expect(subB.totalNodes).toBe(2);
    expect(subB.percent).toBe(100);
  });

  it("B — latest record wins: a 'bajado' after a 'dominado' un-counts the node", async () => {
    const { bNodes } = await seedGraph();
    const reg = await registerUser(app, {
      email: `tree-latest-${Date.now()}@test.com`,
      password: "password123",
      branchId: 1,
    });
    const memberId = (reg.user as { id: number }).id;
    await setLevel(memberId, "alfa"); // ceiling 3 → dl9 not reached by proxy

    // Earlier dominado, then a LATER bajado for the same node → latest is bajado.
    await seedAdjustment({
      memberId,
      exerciseId: bNodes[1], // dl9
      toExerciseId: bNodes[0],
      status: "dominado",
      createdAt: new Date("2026-06-05T10:00:00Z"),
    });
    await seedAdjustment({
      memberId,
      exerciseId: bNodes[1], // dl9
      toExerciseId: bNodes[0],
      status: "bajado",
      createdAt: new Date("2026-06-05T11:00:00Z"),
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/tree-progress/me",
      headers: { authorization: `Bearer ${reg.token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const subB = findCategory(body, "Empuje").subfamilies[0];

    // dl9's latest record is bajado → NOT reached. Only dl1 (ceiling) counts.
    const b9 = subB.nodes.find((n) => n.exerciseId === bNodes[1]);
    expect(b9?.reached).toBe(false);
    expect(subB.reachedNodes).toBe(1);
    expect(subB.percent).toBe(50);
  });

  it("C — the level-ceiling proxy still marks nodes reached with no adjustment records (no regression)", async () => {
    const { aNodes } = await seedGraph();
    const reg = await registerUser(app, {
      email: `tree-noreg-${Date.now()}@test.com`,
      password: "password123",
      branchId: 1,
    });
    const memberId = (reg.user as { id: number }).id;
    // sigma ceiling = 8 → Tracción dl2,5,8 all reached purely by ceiling.
    await setLevel(memberId, "sigma");

    const res = await app.inject({
      method: "GET",
      url: "/api/tree-progress/me",
      headers: { authorization: `Bearer ${reg.token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const subA = findCategory(body, "Tracción").subfamilies[0];
    expect(subA.totalNodes).toBe(aNodes.length);
    expect(subA.reachedNodes).toBe(3);
    expect(subA.percent).toBe(100);
  });
});
