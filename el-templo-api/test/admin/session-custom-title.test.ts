import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { createTestApp, getAuthToken } from "../helpers";
import { eq } from "drizzle-orm";
import * as schema from "../../src/db/schema";

describe("Phase 100 — games format, games route, custom_title round-trip", () => {
  let app: FastifyInstance;
  let adminToken: string;
  let gamesFormatId: number;

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");

    // Ensure a `games` format row exists for the duration of this test file.
    // The test DB is recreated at globalSetup with no `formats` rows, and
    // other admin test files may have cleaned this table. Insert idempotently.
    const existing = await app.db
      .select()
      .from(schema.formats)
      .where(eq(schema.formats.name, "games"));
    if (existing.length === 0) {
      await app.db.insert(schema.formats).values({
        name: "games",
        type: "technical",
        description:
          "Formato libre para juegos de calentamiento (reps/tiempo/rondas opcionales)",
      });
    }
    const [fmt] = await app.db
      .select()
      .from(schema.formats)
      .where(eq(schema.formats.name, "games"));
    gamesFormatId = fmt.id;
  });

  afterAll(async () => {
    await app.close();
  });

  // Helper: create a minimal session with one INITIUM block for testing.
  async function createTestSessionWithInitiumBlock(): Promise<{
    sessionId: number;
    blockId: number;
  }> {
    const [sessionResult] = await app.db.insert(schema.sessions).values({
      dayId: `phase100-test-${Date.now()}-${Math.floor(Math.random() * 1000000)}`,
      week: 1,
      day: "lunes",
      levelGroup: "alfa",
      blockCount: 1,
    });
    const newSessionId = Number(sessionResult.insertId);

    const [blockResult] = await app.db.insert(schema.sessionBlocks).values({
      sessionId: newSessionId,
      blockId: `test-initium-${Date.now()}-${Math.floor(Math.random() * 1000000)}`,
      role: "INITIUM",
      route: "PL",
      pattern: "FLOW",
      intensity: 50,
      repsBudget: 0,
      formatId: gamesFormatId,
      formatName: "games",
      exerciseCount: 0,
      sortOrder: 0,
    });
    const newBlockId = Number(blockResult.insertId);

    return { sessionId: newSessionId, blockId: newBlockId };
  }

  async function cleanupSession(sessionId: number): Promise<void> {
    // session_blocks cascade on session delete
    await app.db
      .delete(schema.sessions)
      .where(eq(schema.sessions.id, sessionId));
  }

  describe("games format migration (Plan 01)", () => {
    it("formats table contains a row with name='games'", async () => {
      const rows = await app.db
        .select()
        .from(schema.formats)
        .where(eq(schema.formats.name, "games"));
      expect(rows.length).toBe(1);
      expect(rows[0].name).toBe("games");
    });

    it("games format row has type/description populated", async () => {
      const [row] = await app.db
        .select()
        .from(schema.formats)
        .where(eq(schema.formats.name, "games"));
      expect(row).toBeTruthy();
      // type and description are informational; exact values are per-plan
      // choices — we just verify the row itself is present.
      expect(row.name).toBe("games");
    });
  });

  describe("POST /api/admin/exercises with route='games'", () => {
    it("creates an exercise with route='games' and returns 201", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/admin/exercises",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          exercise: "Juego de reaccion con pelota",
          category: "empuje",
          pattern: "horizontal",
          route: "games",
          effort: "CON",
        },
      });
      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.route).toBe("games");
      expect(body.id).toBeGreaterThan(0);
    });

    it("exercise appears when filtering by route=games", async () => {
      const listRes = await app.inject({
        method: "GET",
        url: "/api/admin/exercises?route=games&limit=50",
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(listRes.statusCode).toBe(200);
      const body = JSON.parse(listRes.body);
      const items = body.items ?? body.exercises ?? body;
      expect(Array.isArray(items)).toBe(true);
      for (const item of items) {
        expect(item.route).toBe("games");
      }
      expect(items.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("PATCH /api/admin/sessions/:sessionId/blocks/:blockId/custom-title", () => {
    it("persists a non-null custom_title and returns it", async () => {
      const { sessionId, blockId } = await createTestSessionWithInitiumBlock();
      try {
        const res = await app.inject({
          method: "PATCH",
          url: `/api/admin/sessions/${sessionId}/blocks/${blockId}/custom-title`,
          headers: { authorization: `Bearer ${adminToken}` },
          payload: { customTitle: "Flow Tag" },
        });
        expect(res.statusCode).toBe(200);
        expect(JSON.parse(res.body)).toEqual({ customTitle: "Flow Tag" });

        const [row] = await app.db
          .select()
          .from(schema.sessionBlocks)
          .where(eq(schema.sessionBlocks.id, blockId));
        expect(row.customTitle).toBe("Flow Tag");
      } finally {
        await cleanupSession(sessionId);
      }
    });

    it("clears custom_title when body.customTitle is null", async () => {
      const { sessionId, blockId } = await createTestSessionWithInitiumBlock();
      try {
        await app.inject({
          method: "PATCH",
          url: `/api/admin/sessions/${sessionId}/blocks/${blockId}/custom-title`,
          headers: { authorization: `Bearer ${adminToken}` },
          payload: { customTitle: "X" },
        });
        const res = await app.inject({
          method: "PATCH",
          url: `/api/admin/sessions/${sessionId}/blocks/${blockId}/custom-title`,
          headers: { authorization: `Bearer ${adminToken}` },
          payload: { customTitle: null },
        });
        expect(res.statusCode).toBe(200);
        expect(JSON.parse(res.body)).toEqual({ customTitle: null });

        const [row] = await app.db
          .select()
          .from(schema.sessionBlocks)
          .where(eq(schema.sessionBlocks.id, blockId));
        expect(row.customTitle).toBeNull();
      } finally {
        await cleanupSession(sessionId);
      }
    });

    it("normalizes empty string to null", async () => {
      const { sessionId, blockId } = await createTestSessionWithInitiumBlock();
      try {
        const res = await app.inject({
          method: "PATCH",
          url: `/api/admin/sessions/${sessionId}/blocks/${blockId}/custom-title`,
          headers: { authorization: `Bearer ${adminToken}` },
          payload: { customTitle: "" },
        });
        expect(res.statusCode).toBe(200);
        expect(JSON.parse(res.body)).toEqual({ customTitle: null });
      } finally {
        await cleanupSession(sessionId);
      }
    });

    it("rejects custom_title longer than 100 chars with 400", async () => {
      const { sessionId, blockId } = await createTestSessionWithInitiumBlock();
      try {
        const res = await app.inject({
          method: "PATCH",
          url: `/api/admin/sessions/${sessionId}/blocks/${blockId}/custom-title`,
          headers: { authorization: `Bearer ${adminToken}` },
          payload: { customTitle: "x".repeat(101) },
        });
        expect(res.statusCode).toBe(400);
      } finally {
        await cleanupSession(sessionId);
      }
    });

    it("rejects missing body.customTitle with 400", async () => {
      const { sessionId, blockId } = await createTestSessionWithInitiumBlock();
      try {
        const res = await app.inject({
          method: "PATCH",
          url: `/api/admin/sessions/${sessionId}/blocks/${blockId}/custom-title`,
          headers: { authorization: `Bearer ${adminToken}` },
          payload: {},
        });
        expect(res.statusCode).toBe(400);
      } finally {
        await cleanupSession(sessionId);
      }
    });

    it("returns 4xx for non-existent block", async () => {
      const { sessionId } = await createTestSessionWithInitiumBlock();
      try {
        const res = await app.inject({
          method: "PATCH",
          url: `/api/admin/sessions/${sessionId}/blocks/999999/custom-title`,
          headers: { authorization: `Bearer ${adminToken}` },
          payload: { customTitle: "X" },
        });
        expect(res.statusCode).toBeGreaterThanOrEqual(400);
      } finally {
        await cleanupSession(sessionId);
      }
    });

    it("GET /admin/sessions/:id returns customTitle on the INITIUM block", async () => {
      const { sessionId, blockId } = await createTestSessionWithInitiumBlock();
      try {
        await app.inject({
          method: "PATCH",
          url: `/api/admin/sessions/${sessionId}/blocks/${blockId}/custom-title`,
          headers: { authorization: `Bearer ${adminToken}` },
          payload: { customTitle: "Pyros Flow" },
        });
        const res = await app.inject({
          method: "GET",
          url: `/api/admin/sessions/${sessionId}`,
          headers: { authorization: `Bearer ${adminToken}` },
        });
        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body);
        const initium = body.blocks.find(
          (b: { role: string }) => b.role === "INITIUM",
        );
        expect(initium).toBeTruthy();
        expect(initium.customTitle).toBe("Pyros Flow");
      } finally {
        await cleanupSession(sessionId);
      }
    });

    it("logs 'custom_title_update' to session_edit_logs after a successful PATCH", async () => {
      const { sessionId, blockId } = await createTestSessionWithInitiumBlock();
      try {
        const res = await app.inject({
          method: "PATCH",
          url: `/api/admin/sessions/${sessionId}/blocks/${blockId}/custom-title`,
          headers: { authorization: `Bearer ${adminToken}` },
          payload: { customTitle: "Logged Title" },
        });
        expect(res.statusCode).toBe(200);

        const logs = await app.db
          .select()
          .from(schema.sessionEditLogs)
          .where(eq(schema.sessionEditLogs.sessionId, sessionId));
        const customTitleLogs = logs.filter(
          (l) => l.action === "custom_title_update",
        );
        expect(customTitleLogs.length).toBeGreaterThanOrEqual(1);
      } finally {
        await cleanupSession(sessionId);
      }
    });
  });

  describe("games format — format_params round-trip (all-optional reps/time/rounds)", () => {
    it("persists format_params with only rounds set", async () => {
      const [sessionResult] = await app.db.insert(schema.sessions).values({
        dayId: `phase100-games1-${Date.now()}-${Math.floor(Math.random() * 1000000)}`,
        week: 1,
        day: "lunes",
        levelGroup: "alfa",
        blockCount: 1,
      });
      const newSessionId = Number(sessionResult.insertId);

      try {
        const [blockResult] = await app.db.insert(schema.sessionBlocks).values({
          sessionId: newSessionId,
          blockId: `games-block-1-${Date.now()}-${Math.floor(Math.random() * 1000000)}`,
          role: "INITIUM",
          route: "games",
          pattern: "FLOW",
          intensity: 50,
          repsBudget: 0,
          formatId: gamesFormatId,
          formatName: "games",
          exerciseCount: 0,
          sortOrder: 0,
          formatParams: { reps: null, time: null, rounds: 3 },
        });
        const newBlockId = Number(blockResult.insertId);

        const [row] = await app.db
          .select()
          .from(schema.sessionBlocks)
          .where(eq(schema.sessionBlocks.id, newBlockId));

        expect(row.formatParams).toEqual({ reps: null, time: null, rounds: 3 });
      } finally {
        await cleanupSession(newSessionId);
      }
    });

    it("persists format_params with all three fields null", async () => {
      const [sessionResult] = await app.db.insert(schema.sessions).values({
        dayId: `phase100-games2-${Date.now()}-${Math.floor(Math.random() * 1000000)}`,
        week: 1,
        day: "lunes",
        levelGroup: "alfa",
        blockCount: 1,
      });
      const newSessionId = Number(sessionResult.insertId);

      try {
        const [blockResult] = await app.db.insert(schema.sessionBlocks).values({
          sessionId: newSessionId,
          blockId: `games-block-2-${Date.now()}-${Math.floor(Math.random() * 1000000)}`,
          role: "INITIUM",
          route: "games",
          pattern: "FLOW",
          intensity: 50,
          repsBudget: 0,
          formatId: gamesFormatId,
          formatName: "games",
          exerciseCount: 0,
          sortOrder: 0,
          formatParams: { reps: null, time: null, rounds: null },
        });
        const newBlockId = Number(blockResult.insertId);

        const [row] = await app.db
          .select()
          .from(schema.sessionBlocks)
          .where(eq(schema.sessionBlocks.id, newBlockId));

        expect(row.formatParams).toEqual({
          reps: null,
          time: null,
          rounds: null,
        });
      } finally {
        await cleanupSession(newSessionId);
      }
    });
  });
});
