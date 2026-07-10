import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { createTestApp, getAuthToken } from "../helpers";
import { inArray } from "drizzle-orm";
import * as schema from "../../src/db/schema";
import { FULL_BODY_ROUTE } from "../../src/modules/admin/exercise-swap-service";

describe("FULLBODY route — GET /admin/exercises/pool accepts every exercise", () => {
  let app: FastifyInstance;
  let adminToken: string;
  let defaultFormatId: number;
  const seededExerciseIds: number[] = [];
  const seededSessionIds: number[] = [];

  /** One exercise per route, unique names to avoid cross-test collisions */
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
  const SEED_EXERCISES = [
    { route: "PL", name: `fullbody-pool-pl-${stamp}` },
    { route: "FL", name: `fullbody-pool-fl-${stamp}` },
    { route: "DS", name: `fullbody-pool-ds-${stamp}` },
  ];

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");

    // Ensure canonical route codes used by the seed exercises exist.
    // Migration 0172 inserts FULLBODY, but cleanAllTestData (used by other
    // test files sharing this worker DB) wipes `routes` — re-insert defensively.
    const existing = await app.db.select().from(schema.routes);
    const codes = new Set(existing.map((r) => r.code));
    const toInsert = ["PL", "FL", "DS"].filter((c) => !codes.has(c));
    if (toInsert.length > 0) {
      await app.db
        .insert(schema.routes)
        .values(toInsert.map((code) => ({ code })));
    }
    if (!codes.has(FULL_BODY_ROUTE)) {
      await app.db.insert(schema.routes).values({
        code: FULL_BODY_ROUTE,
        displayName: "Full Body",
        excludedFromTree: true,
      });
    }

    // Ensure at least one format row exists (session_blocks.format_id is NOT NULL).
    const formats = await app.db.select().from(schema.formats);
    if (formats.length === 0) {
      await app.db.insert(schema.formats).values({
        name: "fullbody-test-format",
        type: "technical",
        description: "Placeholder for fullbody pool test blocks",
      });
    }
    const [fmt] = await app.db.select().from(schema.formats);
    defaultFormatId = fmt.id;

    for (const ex of SEED_EXERCISES) {
      const [res] = await app.db
        .insert(schema.exercises)
        .values({
          pattern: "test",
          category: "test",
          exercise: ex.name,
          effort: "CON",
          route: ex.route,
          dificultadLineal: 1,
        })
        .$returningId();
      seededExerciseIds.push(res.id);
    }
  });

  afterAll(async () => {
    if (seededSessionIds.length > 0) {
      await app.db
        .delete(schema.sessions)
        .where(inArray(schema.sessions.id, seededSessionIds));
    }
    if (seededExerciseIds.length > 0) {
      await app.db
        .delete(schema.exercises)
        .where(inArray(schema.exercises.id, seededExerciseIds));
    }
    await app.close();
  });

  async function createBlockWithRoute(route: string): Promise<number> {
    const [sessionResult] = await app.db.insert(schema.sessions).values({
      dayId: `fullbody-pool-${Date.now()}-${Math.floor(Math.random() * 1000000)}`,
      week: 1,
      day: "lunes",
      levelGroup: "alfa",
      blockCount: 1,
    });
    const sessionId = Number(sessionResult.insertId);
    seededSessionIds.push(sessionId);

    const [blockResult] = await app.db.insert(schema.sessionBlocks).values({
      sessionId,
      blockId: `fullbody-block-${Date.now()}-${Math.floor(Math.random() * 1000000)}`,
      role: "NUCLEUS",
      route,
      pattern: "test",
      intensity: 50,
      repsBudget: 0,
      formatId: defaultFormatId,
      formatName: "Combos",
      exerciseCount: 0,
      sortOrder: 0,
    });
    return Number(blockResult.insertId);
  }

  it("FULLBODY appears in GET /admin/routes (route dropdown source)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/routes",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const fullBody = body.routes.find(
      (r: { code: string }) => r.code === FULL_BODY_ROUTE,
    );
    expect(fullBody).toBeDefined();
    expect(fullBody.displayName).toBe("Full Body");
  });

  it("returns exercises from every route when the block route is FULLBODY", async () => {
    const blockId = await createBlockWithRoute(FULL_BODY_ROUTE);

    const res = await app.inject({
      method: "GET",
      url: `/api/admin/exercises/pool?route=${FULL_BODY_ROUTE}&blockId=${blockId}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const poolIds = body.exercises.map((e: { id: number }) => e.id);
    for (const id of seededExerciseIds) {
      expect(poolIds).toContain(id);
    }
    const poolRoutes = new Set(
      body.exercises.map((e: { route: string }) => e.route),
    );
    expect(poolRoutes.size).toBeGreaterThanOrEqual(3);
  });

  it("keeps the strict single-route filter for regular routes", async () => {
    const blockId = await createBlockWithRoute("PL");

    const res = await app.inject({
      method: "GET",
      url: `/api/admin/exercises/pool?route=PL&blockId=${blockId}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const poolIds = body.exercises.map((e: { id: number }) => e.id);
    expect(poolIds).toContain(seededExerciseIds[0]); // PL
    expect(poolIds).not.toContain(seededExerciseIds[1]); // FL
    expect(poolIds).not.toContain(seededExerciseIds[2]); // DS
  });
});
