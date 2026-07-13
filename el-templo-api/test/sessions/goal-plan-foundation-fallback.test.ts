import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import * as schema from "../../src/db/schema";
import { createTestApp, getAuthToken, registerUser } from "../helpers";

/**
 * Goal-plan → Foundation session fallback.
 *
 * A goal-plan member (program with a non-null goalPlanType, e.g. "Desafío 30
 * Días" = full_body) reads sessions from GP-{type}-W{week}-{day}-{level} dayIds.
 * Those libraries are authored up to a fixed week while /daily and /weekly index
 * by CALENDAR week, so once the calendar passes the last authored week the
 * member has no curated session. Instead of a 404 (empty "no tengo ejercicios"
 * card), they fall back to the Foundation (templo) session W{week}-{day}-{level}
 * for the same week/day/level — the same content presencial members receive.
 *
 * Anchor: WEEK_ONE_MONDAY = 2026-02-23 (Monday of week 1).
 *   2026-02-24 = Tuesday (martes) of week 1.
 *   2026-02-25 = Wednesday (miércoles) of week 1.
 *   2026-02-26 = Thursday (jueves) of week 1.
 *   2026-03-09 = Monday of week 3, 2026-03-10 = Tuesday of week 3.
 */
describe("Goal-plan → Foundation session fallback", () => {
  let app: FastifyInstance;
  let memberToken: string;
  let memberId: number;

  beforeAll(async () => {
    app = await createTestApp();

    const reg = await registerUser(app, {
      email: "gp-fallback-member@test.com",
      password: "password123",
      branchId: 1,
    });
    memberToken = await getAuthToken(
      app,
      "gp-fallback-member@test.com",
      "password123",
    );
    memberId = (reg.user as { id: number }).id;

    // Pin the member to alfa so effectiveLevel is deterministic on normal days.
    await app.db
      .update(schema.users)
      .set({ level: "alfa" })
      .where(eq(schema.users.id, memberId));

    // A goal-plan program (goalPlanType != null) — mirrors "Desafío 30 Días".
    const [program] = await app.db
      .insert(schema.programs)
      .values({
        name: "GP Fallback Test Program (full_body)",
        durationWeeks: 4,
        sessionsPerWeekToAdvance: 3,
        goalPlanType: "full_body",
        isActive: true,
      })
      .$returningId();

    // Active enrollment, no presencial subscription. Point the user's pointer at
    // it so resolveSessionView deterministically serves the program view.
    const [enrollment] = await app.db
      .insert(schema.programEnrollments)
      .values({
        userId: memberId,
        programId: program.id,
        status: "active",
        currentWeek: 1,
        source: "admin_addon",
      })
      .$returningId();
    await app.db
      .update(schema.users)
      .set({ currentProgramEnrollmentId: enrollment.id })
      .where(eq(schema.users.id, memberId));
  });

  afterAll(async () => {
    await app.close();
  });

  it("daily — falls back to the Foundation session when the goal-plan session is missing", async () => {
    // Seed ONLY the Foundation session (W1-martes-alfa). No GP session exists.
    // With the fallback the member gets W1-martes-alfa; without it the server
    // looks up GP-full_body-W1-martes-alfa (not seeded) and returns 404 — the
    // falsifiable proof.
    await app.db.insert(schema.sessions).values({
      dayId: "W1-martes-alfa",
      week: 1,
      day: "martes",
      levelGroup: "alfa_delta",
      blockCount: 0,
      status: "approved",
      sessionMode: "regular",
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/sessions/daily?date=2026-02-24",
      headers: { authorization: `Bearer ${memberToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.dayId).toBe("W1-martes-alfa");
    expect(body.view).toBe("program");
  });

  it("daily — prefers the curated goal-plan session over the Foundation fallback", async () => {
    // Seed BOTH the Foundation and the curated GP session for the same day.
    // The curated goal-plan session must win (candidate order: GP > Foundation).
    await app.db.insert(schema.sessions).values({
      dayId: "W1-miercoles-alfa",
      week: 1,
      day: "miercoles",
      levelGroup: "alfa_delta",
      blockCount: 0,
      status: "approved",
      sessionMode: "regular",
    });
    await app.db.insert(schema.sessions).values({
      dayId: "GP-full_body-W1-miercoles-alfa",
      week: 1,
      day: "miercoles",
      levelGroup: "alfa_delta",
      blockCount: 0,
      status: "approved",
      sessionMode: "regular",
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/sessions/daily?date=2026-02-25",
      headers: { authorization: `Bearer ${memberToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.dayId).toBe("GP-full_body-W1-miercoles-alfa");
    expect(body.view).toBe("program");
  });

  it("daily — still 404s when neither goal-plan nor Foundation session exists", async () => {
    // 2026-02-26 (jueves, week 1) has no session of any kind seeded. The
    // fallback must not fabricate a session out of thin air.
    const res = await app.inject({
      method: "GET",
      url: "/api/sessions/daily?date=2026-02-26",
      headers: { authorization: `Bearer ${memberToken}` },
    });

    expect(res.statusCode).toBe(404);
  });

  it("weekly — the day resolves to the Foundation session when the goal-plan session is missing", async () => {
    // Seed ONLY the Foundation session for Tuesday of week 3.
    await app.db.insert(schema.sessions).values({
      dayId: "W3-martes-alfa",
      week: 3,
      day: "martes",
      levelGroup: "alfa_delta",
      blockCount: 0,
      status: "approved",
      sessionMode: "regular",
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/sessions/weekly?weekStart=2026-03-09",
      headers: { authorization: `Bearer ${memberToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.view).toBe("program");
    // Tuesday of week 3 falls back to the Foundation session.
    expect(body.sessions["2026-03-10"]).not.toBeNull();
    expect(body.sessions["2026-03-10"].dayId).toBe("W3-martes-alfa");
  });
});
