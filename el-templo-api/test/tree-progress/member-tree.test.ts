import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import { createTestApp, registerUser, cleanAllTestData } from "../helpers";
import * as schema from "../../src/db/schema";
import {
  tenantWhere,
  type TenantContext,
} from "../../src/modules/shared/tenant";

// Archivo single-tenant (solo El Templo): filtro preciso, no exencion.
const CTX_TEMPLO: TenantContext = { tenantId: 1 };

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

  /**
   * Seed a completed session whose `exercisesCompleted` references a
   * session_prescriptions row resolving to `exerciseId`. Mirrors the
   * prescription→exercise resolution of loadCompletedExerciseIds (branch b /
   * the second "dominado" signal of D-01). Builds the minimal FK chain:
   * session → session_block → session_prescription, then a completed_session
   * pointing at that prescription id.
   */
  async function seedCompletedSession(opts: {
    userId: number;
    exerciseId: number;
  }): Promise<void> {
    const dayId = `W1-lunes-sigma-${opts.exerciseId}`;
    const [session] = await app.db
      .insert(schema.sessions)
      .values({
        dayId,
        week: 1,
        day: "lunes",
        levelGroup: "sigma",
        blockCount: 1,
      })
      .$returningId();
    const [block] = await app.db
      .insert(schema.sessionBlocks)
      .values({
        sessionId: session.id,
        blockId: "NUCLEUS-1",
        role: "NUCLEUS",
        route: "PULLR",
        pattern: "PULL",
        intensity: 1,
        repsBudget: 24,
        formatId: 1,
        formatName: "Straight Sets",
        exerciseCount: 1,
        sortOrder: 0,
      })
      .$returningId();
    const [prescription] = await app.db
      .insert(schema.sessionPrescriptions)
      .values({
        blockId: block.id,
        exerciseId: opts.exerciseId,
        exerciseName: "Completed node",
        contraction: "CON",
        reps: 8,
        seconds: 0,
        rest: 60,
        sortOrder: 0,
      })
      .$returningId();
    await app.db.insert(schema.completedSessions).values({
      userId: opts.userId,
      dayId,
      sessionLevel: "sigma",
      date: "2026-06-05",
      branchId: 1,
      startedAt: new Date("2026-06-05T10:00:00Z"),
      completedAt: new Date("2026-06-05T11:00:00Z"),
      blocksCompleted: ["NUCLEUS"],
      exercisesCompleted: { NUCLEUS: [prescription.id] },
    });
  }

  async function setLevel(
    userId: number,
    level: "alfa" | "delta" | "sigma" | "omega" | "spartan",
  ): Promise<void> {
    await app.db
      .update(schema.users)
      .set({ level })
      .where(
        and(tenantWhere(schema.users, CTX_TEMPLO), eq(schema.users.id, userId)),
      );
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
      nodes: Array<{
        exerciseId: number;
        reached: boolean;
        name: string;
        state: "dominado" | "en_progreso" | "disponible" | "bloqueado";
        band: "alfa" | "delta" | "sigma" | "omega" | "spartan";
      }>;
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

  // ── Phase 134 (R6, D-01..D-08): node states + difficulty band ─────────────

  it("S1 — dl <= ceiling alone yields disponible/en_progreso, NEVER dominado (D-01)", async () => {
    const { aNodes } = await seedGraph();
    const reg = await registerUser(app, {
      email: `tree-s1-${Date.now()}@test.com`,
      password: "password123",
      branchId: 1,
    });
    const memberId = (reg.user as { id: number }).id;
    // sigma ceiling = 8 → Tracción dl2,5,8 all below/at ceiling, NO evidence.
    await setLevel(memberId, "sigma");

    const res = await app.inject({
      method: "GET",
      url: "/api/tree-progress/me",
      headers: { authorization: `Bearer ${reg.token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const subA = findCategory(body, "Tracción").subfamilies[0];

    // No node is dominado purely by ceiling (heart of D-01/R5).
    for (const n of subA.nodes) expect(n.state).not.toBe("dominado");
    // Every node is reachable by ceiling → all disponible-base; exactly one
    // becomes the frontier, the rest stay disponible.
    const states = subA.nodes.map((n) => n.state).sort();
    expect(states).toEqual(["disponible", "disponible", "en_progreso"].sort());
  });

  it("S2 — exactly one en_progreso (frontier) per route, the first non-dominado disponible (D-02)", async () => {
    const { aNodes, bNodes } = await seedGraph();
    const reg = await registerUser(app, {
      email: `tree-s2-${Date.now()}@test.com`,
      password: "password123",
      branchId: 1,
    });
    const memberId = (reg.user as { id: number }).id;
    // alfa ceiling = 3 → A: dl2 disponible-base, dl5/dl8 above ceiling; B: dl1
    // disponible-base, dl9 above ceiling. No evidence, no edges dominated.
    await setLevel(memberId, "alfa");

    const res = await app.inject({
      method: "GET",
      url: "/api/tree-progress/me",
      headers: { authorization: `Bearer ${reg.token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const subA = findCategory(body, "Tracción").subfamilies[0];
    const subB = findCategory(body, "Empuje").subfamilies[0];

    // Exactly one frontier per route.
    expect(subA.nodes.filter((n) => n.state === "en_progreso")).toHaveLength(1);
    expect(subB.nodes.filter((n) => n.state === "en_progreso")).toHaveLength(1);
    // The frontier is the lowest-dl reachable node (the route's "next up").
    const frontierA = subA.nodes.find((n) => n.state === "en_progreso");
    const frontierB = subB.nodes.find((n) => n.state === "en_progreso");
    expect(frontierA?.exerciseId).toBe(aNodes[0]); // dl2
    expect(frontierB?.exerciseId).toBe(bNodes[0]); // dl1
  });

  it("S3 — bloqueado: dl > ceiling AND a graph prereq not dominated (D-04/D-06)", async () => {
    const { aNodes } = await seedGraph();
    const reg = await registerUser(app, {
      email: `tree-s3-${Date.now()}@test.com`,
      password: "password123",
      branchId: 1,
    });
    const memberId = (reg.user as { id: number }).id;
    // alfa ceiling = 3 → A: dl2 reachable; dl5 has prereq dl2 (edge dl2→dl5);
    // dl8 has prereq dl5. Nothing dominated → dl5 and dl8 are bloqueado.
    await setLevel(memberId, "alfa");

    const res = await app.inject({
      method: "GET",
      url: "/api/tree-progress/me",
      headers: { authorization: `Bearer ${reg.token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const subA = findCategory(body, "Tracción").subfamilies[0];

    const dl5 = subA.nodes.find((n) => n.exerciseId === aNodes[1]);
    const dl8 = subA.nodes.find((n) => n.exerciseId === aNodes[2]);
    // dl5 > ceiling(3) and its only prereq dl2 is NOT dominated → bloqueado.
    expect(dl5?.state).toBe("bloqueado");
    expect(dl8?.state).toBe("bloqueado");
  });

  it("S4 — disponible via D-06: dl > ceiling but all graph prereqs dominated (hybrid gating)", async () => {
    const { aNodes } = await seedGraph();
    const reg = await registerUser(app, {
      email: `tree-s4-${Date.now()}@test.com`,
      password: "password123",
      branchId: 1,
    });
    const memberId = (reg.user as { id: number }).id;
    // alfa ceiling = 3 → dl5 is above ceiling. Dominate its prereq dl2 so the
    // graph unlocks dl5 even though dl5 > ceiling (D-06 hybrid).
    await setLevel(memberId, "alfa");
    await seedAdjustment({
      memberId,
      exerciseId: aNodes[0], // dl2 (prereq of dl5)
      toExerciseId: aNodes[1],
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
    const subA = findCategory(body, "Tracción").subfamilies[0];

    // dl2 dominated (evidence) → dominado. dl5 unlocked by graph → disponible
    // or en_progreso (frontier), NEVER bloqueado.
    const dl2 = subA.nodes.find((n) => n.exerciseId === aNodes[0]);
    const dl5 = subA.nodes.find((n) => n.exerciseId === aNodes[1]);
    expect(dl2?.state).toBe("dominado");
    expect(dl5?.state).not.toBe("bloqueado");
    // dl5 is now the route frontier (first non-dominado, prereqs satisfied).
    expect(dl5?.state).toBe("en_progreso");
    // dl8 still has prereq dl5 not dominated and dl8 > ceiling → bloqueado.
    const dl8 = subA.nodes.find((n) => n.exerciseId === aNodes[2]);
    expect(dl8?.state).toBe("bloqueado");
  });

  it("S5 — dominado by latest exercise_adjustments=dominado; a later bajado un-dominates (D-01 latest-per-node)", async () => {
    const { aNodes } = await seedGraph();
    const reg = await registerUser(app, {
      email: `tree-s5-${Date.now()}@test.com`,
      password: "password123",
      branchId: 1,
    });
    const memberId = (reg.user as { id: number }).id;
    await setLevel(memberId, "alfa"); // ceiling 3 → dl8 above ceiling

    // First a dominado on dl8 → state dominado.
    await seedAdjustment({
      memberId,
      exerciseId: aNodes[2], // dl8
      toExerciseId: aNodes[1],
      status: "dominado",
      createdAt: new Date("2026-06-05T10:00:00Z"),
    });
    const res1 = await app.inject({
      method: "GET",
      url: "/api/tree-progress/me",
      headers: { authorization: `Bearer ${reg.token}` },
    });
    const body1 = JSON.parse(res1.body);
    const dl8a = findCategory(body1, "Tracción").subfamilies[0].nodes.find(
      (n) => n.exerciseId === aNodes[2],
    );
    expect(dl8a?.state).toBe("dominado");

    // Then a LATER bajado for the same node → latest wins → no longer dominado.
    await seedAdjustment({
      memberId,
      exerciseId: aNodes[2], // dl8
      toExerciseId: aNodes[1],
      status: "bajado",
      createdAt: new Date("2026-06-05T11:00:00Z"),
    });
    const res2 = await app.inject({
      method: "GET",
      url: "/api/tree-progress/me",
      headers: { authorization: `Bearer ${reg.token}` },
    });
    const body2 = JSON.parse(res2.body);
    const dl8b = findCategory(body2, "Tracción").subfamilies[0].nodes.find(
      (n) => n.exerciseId === aNodes[2],
    );
    // dl8 > ceiling, prereq dl5 not dominated → bloqueado once un-dominated.
    expect(dl8b?.state).toBe("bloqueado");
  });

  it("S6 — dominado by a completed session (prescription → exercise resolution, D-01)", async () => {
    const { bNodes } = await seedGraph();
    const reg = await registerUser(app, {
      email: `tree-s6-${Date.now()}@test.com`,
      password: "password123",
      branchId: 1,
    });
    const memberId = (reg.user as { id: number }).id;
    await setLevel(memberId, "alfa"); // ceiling 3 → dl9 above ceiling

    // Complete a session whose prescription resolves to the dl9 node.
    await seedCompletedSession({ userId: memberId, exerciseId: bNodes[1] });

    const res = await app.inject({
      method: "GET",
      url: "/api/tree-progress/me",
      headers: { authorization: `Bearer ${reg.token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const subB = findCategory(body, "Empuje").subfamilies[0];
    const dl9 = subB.nodes.find((n) => n.exerciseId === bNodes[1]);
    expect(dl9?.state).toBe("dominado");
  });

  it("S7 — band is derived from dificultadLineal (D-08): alfa/delta/sigma/omega/spartan", async () => {
    // Bands: alfa[1..3] delta[4..6] sigma[7..8] omega[9..10] spartan[11..12].
    // Seeded backbone covers dl 1,2,5,8,9 → alfa,alfa,delta,sigma,omega.
    const { aNodes, bNodes } = await seedGraph();
    const reg = await registerUser(app, {
      email: `tree-s7-${Date.now()}@test.com`,
      password: "password123",
      branchId: 1,
    });
    await setLevel((reg.user as { id: number }).id, "spartan");

    const res = await app.inject({
      method: "GET",
      url: "/api/tree-progress/me",
      headers: { authorization: `Bearer ${reg.token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const subA = findCategory(body, "Tracción").subfamilies[0];
    const subB = findCategory(body, "Empuje").subfamilies[0];
    const bandOf = (
      nodes: Array<{ exerciseId: number; band: string }>,
      id: number,
    ) => nodes.find((n) => n.exerciseId === id)?.band;

    expect(bandOf(subA.nodes, aNodes[0])).toBe("alfa"); // dl2
    expect(bandOf(subA.nodes, aNodes[1])).toBe("delta"); // dl5
    expect(bandOf(subA.nodes, aNodes[2])).toBe("sigma"); // dl8
    expect(bandOf(subB.nodes, bNodes[0])).toBe("alfa"); // dl1
    expect(bandOf(subB.nodes, bNodes[1])).toBe("omega"); // dl9
  });

  it("S8 — reached flag and percent are unchanged by the state layer (D-05)", async () => {
    const { bNodes } = await seedGraph();
    const reg = await registerUser(app, {
      email: `tree-s8-${Date.now()}@test.com`,
      password: "password123",
      branchId: 1,
    });
    const memberId = (reg.user as { id: number }).id;
    // sigma ceiling = 8 → Empuje dl1 reached, dl9 not → 50% (same as the legacy
    // assertion in the per-route % test; the state layer must not move it).
    await setLevel(memberId, "sigma");

    const res = await app.inject({
      method: "GET",
      url: "/api/tree-progress/me",
      headers: { authorization: `Bearer ${reg.token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const subB = findCategory(body, "Empuje").subfamilies[0];
    expect(subB.reachedNodes).toBe(1);
    expect(subB.percent).toBe(50);
    const b1 = subB.nodes.find((n) => n.exerciseId === bNodes[0]);
    const b9 = subB.nodes.find((n) => n.exerciseId === bNodes[1]);
    expect(b1?.reached).toBe(true);
    expect(b9?.reached).toBe(false);
  });

  it("S9 — a prereq dominated via a completed session unlocks the downstream node (D-06 uses the full D-01 evidence)", async () => {
    const { aNodes } = await seedGraph();
    const reg = await registerUser(app, {
      email: `tree-s9-${Date.now()}@test.com`,
      password: "password123",
      branchId: 1,
    });
    const memberId = (reg.user as { id: number }).id;
    // alfa ceiling = 3 → dl5 (aNodes[1]) is above ceiling, gated by its prereq
    // dl2 (aNodes[0]). Dominate dl2 by a COMPLETED SESSION (not an adjustment).
    // The D-06 gating must treat session-evidence as "dominado" exactly like an
    // adjustment record (parity with D-01), else dl5 stays wrongly bloqueado.
    await setLevel(memberId, "alfa");
    await seedCompletedSession({ userId: memberId, exerciseId: aNodes[0] });

    const res = await app.inject({
      method: "GET",
      url: "/api/tree-progress/me",
      headers: { authorization: `Bearer ${reg.token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const subA = findCategory(body, "Tracción").subfamilies[0];
    const dl2 = subA.nodes.find((n) => n.exerciseId === aNodes[0]);
    const dl5 = subA.nodes.find((n) => n.exerciseId === aNodes[1]);
    // dl2 dominated by session → dominado; dl5 unlocked by the graph (D-06),
    // becomes the route frontier, NEVER bloqueado.
    expect(dl2?.state).toBe("dominado");
    expect(dl5?.state).not.toBe("bloqueado");
    expect(dl5?.state).toBe("en_progreso");
  });
});
