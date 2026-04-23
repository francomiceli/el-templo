import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { createTestApp, getAuthToken } from "../helpers";
import { eq } from "drizzle-orm";
import * as schema from "../../src/db/schema";

describe("coach-override block route — PATCH /admin/sessions/:sessionId/blocks/:blockId/route + GET /admin/routes", () => {
  let app: FastifyInstance;
  let adminToken: string;
  let defaultFormatId: number;

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");

    // Ensure a minimum set of canonical route codes exists in the test DB.
    const existing = await app.db.select().from(schema.routes);
    const codes = new Set(existing.map((r) => r.code));
    const toInsert = ["PL", "FL", "HSPU"].filter((c) => !codes.has(c));
    if (toInsert.length > 0) {
      await app.db
        .insert(schema.routes)
        .values(toInsert.map((code) => ({ code })));
    }

    // Ensure at least one format row exists (session_blocks.format_id is NOT NULL).
    const formats = await app.db.select().from(schema.formats);
    if (formats.length === 0) {
      await app.db.insert(schema.formats).values({
        name: "route-test-format",
        type: "technical",
        description: "Placeholder for route-update test blocks",
      });
    }
    const [fmt] = await app.db.select().from(schema.formats);
    defaultFormatId = fmt.id;
  });

  afterAll(async () => {
    await app.close();
  });

  async function createSessionWithBlock(
    role: string,
    route: string,
  ): Promise<{
    sessionId: number;
    blockId: number;
  }> {
    const [sessionResult] = await app.db.insert(schema.sessions).values({
      dayId: `route-update-${Date.now()}-${Math.floor(Math.random() * 1000000)}`,
      week: 1,
      day: "lunes",
      levelGroup: "alfa",
      blockCount: 1,
    });
    const sessionId = Number(sessionResult.insertId);

    const [blockResult] = await app.db.insert(schema.sessionBlocks).values({
      sessionId,
      blockId: `route-block-${Date.now()}-${Math.floor(Math.random() * 1000000)}`,
      role,
      route,
      pattern: "FLOW",
      intensity: 50,
      repsBudget: 0,
      formatId: defaultFormatId,
      formatName: "route-test-format",
      exerciseCount: 0,
      sortOrder: 0,
    });
    const blockId = Number(blockResult.insertId);

    return { sessionId, blockId };
  }

  async function cleanupSession(sessionId: number): Promise<void> {
    await app.db
      .delete(schema.sessions)
      .where(eq(schema.sessions.id, sessionId));
  }

  describe("GET /admin/routes", () => {
    it("returns the list of canonical route codes", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/admin/routes",
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(Array.isArray(body.routes)).toBe(true);
      expect(body.routes.length).toBeGreaterThan(0);
      const codes = body.routes.map((r: { code: string }) => r.code);
      expect(codes).toContain("PL");
      expect(codes).toContain("FL");
    });
  });

  describe("PATCH /admin/sessions/:sessionId/blocks/:blockId/route", () => {
    it("updates a NUCLEUS block's route and returns the new value", async () => {
      const { sessionId, blockId } = await createSessionWithBlock(
        "NUCLEUS",
        "PL",
      );
      try {
        const res = await app.inject({
          method: "PATCH",
          url: `/api/admin/sessions/${sessionId}/blocks/${blockId}/route`,
          headers: { authorization: `Bearer ${adminToken}` },
          payload: { route: "FL" },
        });
        expect(res.statusCode).toBe(200);
        expect(JSON.parse(res.body)).toEqual({ route: "FL" });

        const [row] = await app.db
          .select()
          .from(schema.sessionBlocks)
          .where(eq(schema.sessionBlocks.id, blockId));
        expect(row.route).toBe("FL");
      } finally {
        await cleanupSession(sessionId);
      }
    });

    it("rejects updating an INITIUM block's route with 4xx", async () => {
      const { sessionId, blockId } = await createSessionWithBlock(
        "INITIUM",
        "PL",
      );
      try {
        const res = await app.inject({
          method: "PATCH",
          url: `/api/admin/sessions/${sessionId}/blocks/${blockId}/route`,
          headers: { authorization: `Bearer ${adminToken}` },
          payload: { route: "FL" },
        });
        expect(res.statusCode).toBeGreaterThanOrEqual(400);
        const body = JSON.parse(res.body);
        expect(body.message ?? body.error ?? "").toMatch(/INITIUM/i);

        // DB must be unchanged
        const [row] = await app.db
          .select()
          .from(schema.sessionBlocks)
          .where(eq(schema.sessionBlocks.id, blockId));
        expect(row.route).toBe("PL");
      } finally {
        await cleanupSession(sessionId);
      }
    });

    it("rejects unknown route codes with 4xx", async () => {
      const { sessionId, blockId } = await createSessionWithBlock(
        "NUCLEUS",
        "PL",
      );
      try {
        const res = await app.inject({
          method: "PATCH",
          url: `/api/admin/sessions/${sessionId}/blocks/${blockId}/route`,
          headers: { authorization: `Bearer ${adminToken}` },
          payload: { route: "NOT_A_REAL_ROUTE" },
        });
        expect(res.statusCode).toBeGreaterThanOrEqual(400);

        const [row] = await app.db
          .select()
          .from(schema.sessionBlocks)
          .where(eq(schema.sessionBlocks.id, blockId));
        expect(row.route).toBe("PL");
      } finally {
        await cleanupSession(sessionId);
      }
    });

    it("rejects missing body.route with 400", async () => {
      const { sessionId, blockId } = await createSessionWithBlock(
        "NUCLEUS",
        "PL",
      );
      try {
        const res = await app.inject({
          method: "PATCH",
          url: `/api/admin/sessions/${sessionId}/blocks/${blockId}/route`,
          headers: { authorization: `Bearer ${adminToken}` },
          payload: {},
        });
        expect(res.statusCode).toBe(400);
      } finally {
        await cleanupSession(sessionId);
      }
    });

    it("returns 4xx for non-existent block", async () => {
      const { sessionId } = await createSessionWithBlock("NUCLEUS", "PL");
      try {
        const res = await app.inject({
          method: "PATCH",
          url: `/api/admin/sessions/${sessionId}/blocks/999999/route`,
          headers: { authorization: `Bearer ${adminToken}` },
          payload: { route: "FL" },
        });
        expect(res.statusCode).toBeGreaterThanOrEqual(400);
      } finally {
        await cleanupSession(sessionId);
      }
    });

    it("logs 'route_update' to session_edit_logs after a successful PATCH", async () => {
      const { sessionId, blockId } = await createSessionWithBlock(
        "NUCLEUS",
        "PL",
      );
      try {
        const res = await app.inject({
          method: "PATCH",
          url: `/api/admin/sessions/${sessionId}/blocks/${blockId}/route`,
          headers: { authorization: `Bearer ${adminToken}` },
          payload: { route: "HSPU" },
        });
        expect(res.statusCode).toBe(200);

        const logs = await app.db
          .select()
          .from(schema.sessionEditLogs)
          .where(eq(schema.sessionEditLogs.sessionId, sessionId));
        const routeLogs = logs.filter((l) => l.action === "route_update");
        expect(routeLogs.length).toBeGreaterThanOrEqual(1);
      } finally {
        await cleanupSession(sessionId);
      }
    });
  });
});
