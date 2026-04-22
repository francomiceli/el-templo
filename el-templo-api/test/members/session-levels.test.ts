/**
 * Phase 99 R11 — Admin session-level counts endpoint
 *
 * GET /api/admin/members/:userId/session-levels?days=30
 * Returns per-level completion counts in the last N days (non-zero only).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import {
  createTestApp,
  getAuthToken,
  registerUser,
  cleanAllTestData,
} from "../helpers";
import * as schema from "../../src/db/schema";

type Level = "alfa" | "delta" | "sigma" | "omega" | "spartan";

describe("GET /api/admin/members/:userId/session-levels (Phase 99 R11)", () => {
  let app: FastifyInstance;
  let adminToken: string;
  let memberToken: string;
  let targetUserId: number;

  /**
   * Insert a completed_sessions row at a specific relative date offset.
   * `daysAgo=0` means today.
   */
  async function insertCompletedSession(
    userId: number,
    level: Level,
    daysAgo: number,
    suffix = "",
  ): Promise<void> {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    const date = d.toISOString().slice(0, 10);
    const startedAt = new Date(`${date}T10:00:00Z`);
    const completedAt = new Date(startedAt.getTime() + 45 * 60 * 1000);

    await app.db.insert(schema.completedSessions).values({
      userId,
      dayId: `W1-lunes-${level}-${daysAgo}${suffix}`,
      date,
      branchId: 1,
      startedAt,
      completedAt,
      rpe: null,
      blocksCompleted: JSON.stringify(["NUCLEUS"]),
      sessionLevel: level,
    });
  }

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");

    // Register a target member
    const result = await registerUser(app, {
      email: `session-levels-target-${Date.now()}@test.com`,
      password: "password123",
      branchId: 1,
    });
    targetUserId = (result.user as { id: number }).id;

    // Register a second user (role=member) so we can assert 403 for members
    const memberResult = await registerUser(app, {
      email: `session-levels-member-${Date.now()}@test.com`,
      password: "password123",
      branchId: 1,
    });
    memberToken = memberResult.token;
  });

  it("GET /admin/members/:userId/session-levels — returns non-zero level counts within default 30-day window", async () => {
    // 12 sigma within 30d window
    for (let i = 0; i < 12; i++) {
      await insertCompletedSession(targetUserId, "sigma", i, `-s${i}`);
    }
    // 4 omega within 30d window
    for (let i = 0; i < 4; i++) {
      await insertCompletedSession(targetUserId, "omega", i + 5, `-o${i}`);
    }
    // 1 alfa OUTSIDE the 30d window (100 days ago)
    await insertCompletedSession(targetUserId, "alfa", 100, "-old");

    const res = await app.inject({
      method: "GET",
      url: `/api/admin/members/${targetUserId}/session-levels`,
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.counts).toBeInstanceOf(Array);
    expect(body.counts).toHaveLength(2);

    const map = new Map<string, number>(
      body.counts.map((c: { level: string; count: number }) => [
        c.level,
        c.count,
      ]),
    );
    expect(map.get("sigma")).toBe(12);
    expect(map.get("omega")).toBe(4);
    expect(map.has("alfa")).toBe(false);
  });

  it("GET /admin/members/:userId/session-levels?days=365 includes older completions outside 30d window", async () => {
    await insertCompletedSession(targetUserId, "sigma", 2, "-a");
    await insertCompletedSession(targetUserId, "omega", 5, "-b");
    await insertCompletedSession(targetUserId, "alfa", 100, "-c");

    const res = await app.inject({
      method: "GET",
      url: `/api/admin/members/${targetUserId}/session-levels?days=365`,
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.counts).toHaveLength(3);

    const map = new Map<string, number>(
      body.counts.map((c: { level: string; count: number }) => [
        c.level,
        c.count,
      ]),
    );
    expect(map.get("sigma")).toBe(1);
    expect(map.get("omega")).toBe(1);
    expect(map.get("alfa")).toBe(1);
  });

  it("GET /admin/members/:userId/session-levels — returns 403 for member-role callers", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/admin/members/${targetUserId}/session-levels`,
      headers: { authorization: `Bearer ${memberToken}` },
    });

    // MEMBER_ROLES guard rejects non-admin/coach/owner/gestion/recepcion callers.
    expect([401, 403]).toContain(res.statusCode);
    expect(res.statusCode).toBe(403);
  });

  it("GET /admin/members/:userId/session-levels — returns empty counts for user with zero completions", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/admin/members/${targetUserId}/session-levels`,
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.counts).toEqual([]);
  });

  it("GET /admin/members/:userId/session-levels — returns 401 without authentication", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/admin/members/${targetUserId}/session-levels`,
    });
    expect(res.statusCode).toBe(401);
  });
});

describe("Phase 99 R8 rename-parity — sessionLevel column is queryable", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("SELECT session_level FROM completed_sessions via Drizzle sessionLevel works", async () => {
    // A passing query proves the post-rename schema matches the DB column name.
    const rows = await app.db
      .select({ level: schema.completedSessions.sessionLevel })
      .from(schema.completedSessions)
      .where(eq(schema.completedSessions.userId, -1));
    expect(Array.isArray(rows)).toBe(true);
  });
});
