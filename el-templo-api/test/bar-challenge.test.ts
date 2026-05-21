/**
 * Bar Challenge Module Integration Tests (Phase 115 — R2, R11, D-11..D-14)
 *
 * Covers the four SPEC acceptance cases plus defensive bounds:
 *   1. 200 + DB persisted: secondsHeld=90 → completed=true.
 *   2. 200 + DB persisted: secondsHeld=47 → completed=false.
 *   3. 409 already_attempted: second POST does not mutate the first attempt.
 *   4. 401: missing Authorization header.
 *   5. 400 (D-13): secondsHeld>600 rejected by JSON schema.
 *   6. 400 (D-13): missing secondsHeld field rejected by JSON schema.
 *
 * Pattern mirrors `notifications.test.ts` and `admin-leads-patch.test.ts`:
 * createTestApp once, cleanAllTestData between tests, registerUser via
 * helpers to get a fresh member token per case.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { createTestApp, registerUser, cleanAllTestData } from "./helpers";
import * as schema from "../src/db/schema";

describe("POST /api/bar-challenge/result (Phase 115 R2 + R11)", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await cleanAllTestData(app);
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
  });

  /**
   * Create a fresh member, return { token, userId }. Each test gets its own
   * user so single-attempt enforcement does not bleed across cases.
   */
  async function makeMember(): Promise<{ token: string; userId: number }> {
    const unique = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const email = `bar-challenge-${unique}@test.com`;
    const result = await registerUser(app, {
      email,
      password: "pass123456",
      firstName: "Bar",
      lastName: "Challenger",
      branchId: 1,
    });
    const user = result.user as { id: number };
    return { token: result.token, userId: user.id };
  }

  it("200 + completed=true when secondsHeld=90 (R2 case a)", async () => {
    const { token, userId } = await makeMember();

    const res = await app.inject({
      method: "POST",
      url: "/api/bar-challenge/result",
      headers: { authorization: `Bearer ${token}` },
      payload: { secondsHeld: 90 },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ completed: true, seconds: 90 });

    const [row] = await app.db
      .select({
        completed: schema.users.barChallengeCompleted,
        seconds: schema.users.barChallengeSeconds,
        attemptedAt: schema.users.barChallengeAttemptedAt,
      })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);

    expect(row).toBeDefined();
    // MySQL2 returns BOOLEAN as 0/1; either falsey vs truthy check is safe.
    expect(Boolean(row.completed)).toBe(true);
    expect(row.seconds).toBe(90);
    expect(row.attemptedAt).not.toBeNull();
  });

  it("200 + completed=false when secondsHeld=47 (R2 case b)", async () => {
    const { token, userId } = await makeMember();

    const res = await app.inject({
      method: "POST",
      url: "/api/bar-challenge/result",
      headers: { authorization: `Bearer ${token}` },
      payload: { secondsHeld: 47 },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ completed: false, seconds: 47 });

    const [row] = await app.db
      .select({
        completed: schema.users.barChallengeCompleted,
        seconds: schema.users.barChallengeSeconds,
        attemptedAt: schema.users.barChallengeAttemptedAt,
      })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);

    expect(Boolean(row.completed)).toBe(false);
    expect(row.seconds).toBe(47);
    expect(row.attemptedAt).not.toBeNull();
  });

  it("409 already_attempted on second POST + first attempt preserved (R11)", async () => {
    const { token, userId } = await makeMember();

    const first = await app.inject({
      method: "POST",
      url: "/api/bar-challenge/result",
      headers: { authorization: `Bearer ${token}` },
      payload: { secondsHeld: 90 },
    });
    expect(first.statusCode).toBe(200);

    const second = await app.inject({
      method: "POST",
      url: "/api/bar-challenge/result",
      headers: { authorization: `Bearer ${token}` },
      payload: { secondsHeld: 30 },
    });

    expect(second.statusCode).toBe(409);
    expect(second.json()).toMatchObject({
      error: "already_attempted",
      message: "Ya registraste tu intento",
    });

    // First attempt remains authoritative — UPDATE conditional did not touch
    // the row, so seconds is still 90 (not 30).
    const [row] = await app.db
      .select({
        completed: schema.users.barChallengeCompleted,
        seconds: schema.users.barChallengeSeconds,
      })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);

    expect(Boolean(row.completed)).toBe(true);
    expect(row.seconds).toBe(90);
  });

  it("401 when no Authorization header is provided", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/bar-challenge/result",
      payload: { secondsHeld: 90 },
    });

    expect(res.statusCode).toBe(401);
  });

  it("400 when secondsHeld exceeds the 600s upper bound (D-13)", async () => {
    const { token } = await makeMember();

    const res = await app.inject({
      method: "POST",
      url: "/api/bar-challenge/result",
      headers: { authorization: `Bearer ${token}` },
      payload: { secondsHeld: 700 },
    });

    expect(res.statusCode).toBe(400);
  });

  it("400 when body is missing the secondsHeld field (D-13)", async () => {
    const { token } = await makeMember();

    const res = await app.inject({
      method: "POST",
      url: "/api/bar-challenge/result",
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    });

    expect(res.statusCode).toBe(400);
  });
});
