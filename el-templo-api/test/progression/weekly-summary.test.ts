import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { createTestApp, registerUser, cleanAllTestData } from "../helpers";
import * as schema from "../../src/db/schema";

describe("GET /api/progression/weekly-summary", () => {
  let app: FastifyInstance;
  let memberToken: string;
  let memberId: number;

  /**
   * Calculate the current Monday-Sunday week boundaries,
   * matching the endpoint logic.
   */
  function getCurrentWeekBounds(): { weekStart: string; weekEnd: string } {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon...
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(now);
    monday.setDate(now.getDate() + diffToMonday);
    const weekStart = monday.toISOString().split("T")[0];
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const weekEnd = sunday.toISOString().split("T")[0];
    return { weekStart, weekEnd };
  }

  /**
   * Insert a completed session for a given user on a given date.
   */
  async function insertSession(
    userId: number,
    date: string,
    opts: { rpe?: number; startedAt?: Date; completedAt?: Date } = {},
  ): Promise<void> {
    const startedAt = opts.startedAt ?? new Date(`${date}T10:00:00`);
    const completedAt =
      opts.completedAt ?? new Date(startedAt.getTime() + 45 * 60000); // 45 min default
    await app.db.insert(schema.completedSessions).values({
      userId,
      dayId: `W1-test-${Date.now()}`,
      date,
      branchId: 1,
      startedAt,
      completedAt,
      rpe: opts.rpe ?? null,
      blocksCompleted: JSON.stringify(["NUCLEUS"]),
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
    // Register a fresh member
    const result = await registerUser(app, {
      email: `ws-member-${Date.now()}@test.com`,
      password: "password123",
      branchId: 1,
    });
    memberToken = result.token;
    memberId = (result.user as { id: number }).id;
  });

  it("returns 200 with weekly summary fields for authenticated member", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/progression/weekly-summary",
      headers: { authorization: `Bearer ${memberToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toHaveProperty("sessionsCompleted");
    expect(body).toHaveProperty("totalMinutes");
    expect(body).toHaveProperty("averageRpe");
    expect(body).toHaveProperty("weekStart");
    expect(body).toHaveProperty("weekEnd");
    expect(body).toHaveProperty("sessionBudget");
  });

  it("returns zeroed stats when no sessions exist in current week", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/progression/weekly-summary",
      headers: { authorization: `Bearer ${memberToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.sessionsCompleted).toBe(0);
    expect(body.totalMinutes).toBe(0);
    expect(body.averageRpe).toBeNull();

    // Verify week bounds are current Mon-Sun
    const { weekStart, weekEnd } = getCurrentWeekBounds();
    expect(body.weekStart).toBe(weekStart);
    expect(body.weekEnd).toBe(weekEnd);
  });

  it("returns correct aggregates with multiple sessions in current week", async () => {
    const { weekStart } = getCurrentWeekBounds();

    // Insert 3 sessions in the current week
    // Session 1: 45 min, RPE 6
    await insertSession(memberId, weekStart, {
      rpe: 6,
      startedAt: new Date(`${weekStart}T10:00:00`),
      completedAt: new Date(`${weekStart}T10:45:00`),
    });

    // Session 2: 60 min, RPE 8 (next day)
    const day2 = new Date(weekStart);
    day2.setDate(day2.getDate() + 1);
    const day2Str = day2.toISOString().split("T")[0];
    await insertSession(memberId, day2Str, {
      rpe: 8,
      startedAt: new Date(`${day2Str}T09:00:00`),
      completedAt: new Date(`${day2Str}T10:00:00`),
    });

    // Session 3: 30 min, no RPE
    const day3 = new Date(weekStart);
    day3.setDate(day3.getDate() + 2);
    const day3Str = day3.toISOString().split("T")[0];
    await insertSession(memberId, day3Str, {
      startedAt: new Date(`${day3Str}T11:00:00`),
      completedAt: new Date(`${day3Str}T11:30:00`),
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/progression/weekly-summary",
      headers: { authorization: `Bearer ${memberToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.sessionsCompleted).toBe(3);
    expect(body.totalMinutes).toBe(135); // 45 + 60 + 30
    // Average RPE: (6 + 8) / 2 = 7.0 (null RPE excluded)
    expect(body.averageRpe).toBe(7);
  });

  it("excludes sessions from previous weeks", async () => {
    const { weekStart } = getCurrentWeekBounds();

    // Insert a session in the PREVIOUS week (7 days before Monday)
    const lastWeek = new Date(weekStart);
    lastWeek.setDate(lastWeek.getDate() - 1); // Sunday of last week
    const lastWeekStr = lastWeek.toISOString().split("T")[0];
    await insertSession(memberId, lastWeekStr, {
      rpe: 5,
      startedAt: new Date(`${lastWeekStr}T10:00:00`),
      completedAt: new Date(`${lastWeekStr}T11:00:00`),
    });

    // Insert a session in the current week
    await insertSession(memberId, weekStart, {
      rpe: 7,
      startedAt: new Date(`${weekStart}T10:00:00`),
      completedAt: new Date(`${weekStart}T10:40:00`),
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/progression/weekly-summary",
      headers: { authorization: `Bearer ${memberToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    // Only the current week session should count
    expect(body.sessionsCompleted).toBe(1);
    expect(body.totalMinutes).toBe(40);
    expect(body.averageRpe).toBe(7);
  });

  it("returns 401 for unauthenticated request", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/progression/weekly-summary",
    });

    expect(res.statusCode).toBe(401);
  });

  it("returns sessionBudget from active subscription classesPerWeek", async () => {
    // Create a subscription plan with classesPerWeek = 3
    const [plan] = await app.db
      .insert(schema.subscriptionPlans)
      .values({
        name: "Test Plan 3x",
        planTier: "foundation",
        bookingMode: "flexible",
        priceRegular: 10000,
        priceZero: 8000,
        durationDays: 30,
        classesPerWeek: 3,
      })
      .$returningId();

    // Create active subscription for the member
    await app.db.insert(schema.subscriptions).values({
      userId: memberId,
      planId: plan.id,
      branchId: 1,
      status: "active",
      startDate: new Date().toISOString().split("T")[0],
      pricePaid: 10000,
      priceTypeApplied: "regular",
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/progression/weekly-summary",
      headers: { authorization: `Bearer ${memberToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.sessionBudget).toBe(3);
  });

  it("returns sessionBudget as null when no active subscription exists", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/progression/weekly-summary",
      headers: { authorization: `Bearer ${memberToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.sessionBudget).toBeNull();
  });
});
