import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { createTestApp, registerUser, cleanAllTestData } from "../helpers";
import * as schema from "../../src/db/schema";

/**
 * Integration test for GET /api/tree-progress/me (Phase 127 Plan 01, TREE-06).
 *
 * Seeds a real 126-style graph in the per-worker MySQL test DB:
 *   - subfamily A (PULL → Tracción) with 3 canonical nodes at dl 2/5/8
 *   - subfamily B (PUSH → Empuje) with 2 canonical nodes at dl 1/9
 *   - exercise_progressions edges so the nodes are real graph nodes
 *   - three OFF-graph exercises (non-canonical / off-effort / NULL subfamily)
 *     that MUST NOT appear in the tree
 *
 * Asserts: 5-category grouping order, per-subfamily %, reached-by-ceiling,
 * 401-without-token, and own-scope isolation (member A's higher level never
 * leaks into member B's tree).
 */
describe("GET /api/tree-progress/me", () => {
  let app: FastifyInstance;

  // ── Seed helpers ─────────────────────────────────────────────────────────

  async function createSubfamily(
    route: string,
    name: string,
    sortOrder: number,
  ): Promise<number> {
    const [row] = await app.db
      .insert(schema.exerciseSubfamilies)
      .values({ route, name, sortOrder })
      .$returningId();
    return row.id;
  }

  async function createExercise(opts: {
    name: string;
    pattern: string;
    effort: string;
    dl: number;
    subfamilyId: number | null;
    canonicalExerciseId?: number | null;
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
        route: "TEST",
        subfamilyId: opts.subfamilyId,
        canonicalExerciseId: opts.canonicalExerciseId ?? null,
      })
      .$returningId();
    return row.id;
  }

  async function linkEdge(fromId: number, toId: number): Promise<void> {
    await app.db
      .insert(schema.exerciseProgressions)
      .values({ fromExerciseId: fromId, toExerciseId: toId, source: "auto" });
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
   * Seed the standard two-subfamily graph plus off-graph noise.
   * Returns the created subfamily ids and the node exercise ids by dl.
   */
  async function seedGraph(): Promise<{
    subA: number;
    subB: number;
    aNodes: number[];
    bNodes: number[];
  }> {
    const subA = await createSubfamily("PULLR", "Dominadas", 1);
    const subB = await createSubfamily("PUSHR", "Fondos", 2);

    // Subfamily A (PULL → Tracción): dl 2, 5, 8
    const a2 = await createExercise({
      name: "Pull node dl2",
      pattern: "PULL",
      effort: "CON",
      dl: 2,
      subfamilyId: subA,
    });
    const a5 = await createExercise({
      name: "Pull node dl5",
      pattern: "PULL",
      effort: "CON",
      dl: 5,
      subfamilyId: subA,
    });
    const a8 = await createExercise({
      name: "Pull node dl8",
      pattern: "PULL",
      effort: "CON",
      dl: 8,
      subfamilyId: subA,
    });
    await linkEdge(a2, a5);
    await linkEdge(a5, a8);

    // Subfamily B (PUSH → Empuje): dl 1, 9
    const b1 = await createExercise({
      name: "Push node dl1",
      pattern: "PUSH",
      effort: "CON",
      dl: 1,
      subfamilyId: subB,
    });
    const b9 = await createExercise({
      name: "Push node dl9",
      pattern: "PUSH",
      effort: "CON",
      dl: 9,
      subfamilyId: subB,
    });
    await linkEdge(b1, b9);

    // OFF-graph noise that must NEVER appear:
    // (1) non-canonical (canonical_exercise_id NOT NULL)
    await createExercise({
      name: "Off-graph soft-merged dupe",
      pattern: "PULL",
      effort: "CON",
      dl: 3,
      subfamilyId: subA,
      canonicalExerciseId: a2,
    });
    // (2) off-effort (effort NOT IN CON/EXC/ISO)
    await createExercise({
      name: "Off-graph cardio",
      pattern: "PUSH",
      effort: "",
      dl: 4,
      subfamilyId: subB,
    });
    // (3) NULL subfamily_id (unconfirmed)
    await createExercise({
      name: "Off-graph unconfirmed",
      pattern: "PULL",
      effort: "CON",
      dl: 6,
      subfamilyId: null,
    });

    return { subA, subB, aNodes: [a2, a5, a8], bNodes: [b1, b9] };
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
    // exercise_subfamilies / exercise_progressions are not in cleanAllTestData;
    // wipe them so each test starts from an empty graph.
    await app.db.delete(schema.exerciseProgressions);
    await app.db.delete(schema.exerciseSubfamilies);
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

  it("computes per-subfamily % from the member's level ceiling and never shows off-graph nodes", async () => {
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
    await setLevel(idB, "alfa"); // ceiling 3 → only dl2 in subfamily A reached

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
});
