/**
 * Integration tests for the ratings module (Phase 143).
 *
 * Endpoints:
 *  - GET    /api/admin/ratings/coaches?branchId
 *  - GET    /api/admin/ratings/roster?branchId&weekStart
 *  - POST   /api/admin/ratings/roster        (assign coach, immediate)
 *  - GET    /api/admin/ratings               (owner-only view)
 *  - GET    /api/members/ratings/pending
 *  - POST   /api/members/ratings             (submit)
 *
 * Coverage:
 *  - Roster upsert persists; re-assigning the same slot replaces (no duplicate).
 *  - Attribution: a rating resolves the coachId from the roster vigente that
 *    week by (dayOfWeek, slot derived from startTime<12:00). A roster change in
 *    another week does NOT affect a past class's attribution.
 *  - Pending (D-P3/D-P4): <48h + coach assigned → returns the class (no coach);
 *    >48h → null; two unrated → only the last; already-rated → null (D-P2);
 *    no coach in roster → null (D-Q3).
 *  - One-shot (D-P2): second submit for the same class → 400.
 *  - No-coach (D-Q3): submit for a slot without roster → 400, no row inserted.
 *  - Owner-only (D-M3): GET view with member → 403; coach → 403; owner → 200.
 *  - Branch scope (T-143-05): coach assigning roster outside their branches → 403.
 *  - Average (D-O1): owner view returns correct AVG + count per coach.
 *
 * Runs against the per-worker test MySQL DB. The suite runs in CI on push;
 * locally only `pnpm exec tsc --noEmit` is run.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq, and } from "drizzle-orm";
import {
  createTestApp,
  cleanAllTestData,
  createStaffUser,
  getAuthToken,
  registerUser,
} from "../helpers";
import * as schema from "../../src/db/schema";

const ADMIN_BASE = "/api/admin/ratings";
const MEMBER_BASE = "/api/members/ratings";

function nextSuffix(prefix: string): string {
  const t = Date.now().toString(36).slice(-5);
  const r = Math.floor(Math.random() * 1000)
    .toString(36)
    .padStart(2, "0");
  return `${prefix}${t}${r}`;
}

/** "YYYY-MM-DD" for `daysAgo` days before today (UTC noon). */
function dateDaysAgo(daysAgo: number): string {
  const d = new Date();
  d.setUTCHours(12, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().split("T")[0];
}

/** ISO Monday ("YYYY-MM-DD") of the week containing dateStr. */
function isoMonday(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  const day = d.getUTCDay(); // 0=Sun..6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().split("T")[0];
}

/** ISO day-of-week (1=Mon..7=Sun) of dateStr. */
function isoDow(dateStr: string): number {
  const day = new Date(dateStr + "T12:00:00Z").getUTCDay();
  return day === 0 ? 7 : day;
}

/**
 * Nth most recent class-eligible day ("YYYY-MM-DD"), counting back over
 * Mon-Sat only. The roster has no Sunday slots (dayOfWeek 1..6), so a class
 * date landing on a Sunday can't get a coach assigned — which made these tests
 * flaky depending on which weekday CI ran on. classDaysAgo(0) is the most
 * recent non-Sunday day, classDaysAgo(1) the one before it, etc.
 */
function classDaysAgo(n: number): string {
  let back = 0;
  let seen = 0;
  for (;;) {
    const day = dateDaysAgo(back);
    if (isoDow(day) !== 7) {
      if (seen === n) return day;
      seen++;
    }
    back++;
  }
}

interface SeededContext {
  arBranchId: number;
  esBranchId: number;
  ownerToken: string;
  coachArToken: string;
  coachArId: number;
  coachAr2Id: number;
  coachEsId: number;
  scheduleMorningId: number;
  scheduleAfternoonId: number;
  memberId: number;
  memberToken: string;
}

async function seedFixtures(app: FastifyInstance): Promise<SeededContext> {
  const [ar] = await app.db
    .insert(schema.branches)
    .values({
      name: "AR-Ratings-Test",
      code: nextSuffix("ARR"),
      country: "AR",
      isVirtual: false,
      isActive: true,
      timezone: "America/Argentina/Buenos_Aires",
    })
    .$returningId();
  const [es] = await app.db
    .insert(schema.branches)
    .values({
      name: "ES-Ratings-Test",
      code: nextSuffix("ESR"),
      country: "ES",
      isVirtual: false,
      isActive: true,
      timezone: "Europe/Madrid",
    })
    .$returningId();

  const [activity] = await app.db
    .insert(schema.activities)
    .values({ name: "Calistenia", isActive: true })
    .$returningId();

  // Morning schedule (startTime < 12:00 → "morning") and afternoon schedule.
  const [schedMorning] = await app.db
    .insert(schema.schedules)
    .values({
      branchId: ar.id,
      activityId: activity.id,
      dayOfWeek: 1,
      startTime: "09:00",
      endTime: "10:00",
      isActive: true,
    })
    .$returningId();
  const [schedAfternoon] = await app.db
    .insert(schema.schedules)
    .values({
      branchId: ar.id,
      activityId: activity.id,
      dayOfWeek: 1,
      startTime: "18:00",
      endTime: "19:00",
      isActive: true,
    })
    .$returningId();

  // Owner (global), coach AR (user_branches→AR), coach ES (user_branches→ES).
  await createStaffUser(app, {
    email: "owner-ratings@test.com",
    password: "owner-pass-123",
    firstName: "Owner",
    lastName: "Boss",
    role: "owner",
    branchId: ar.id,
  });
  const ownerToken = await getAuthToken(
    app,
    "owner-ratings@test.com",
    "owner-pass-123",
  );

  const coachArId = await createStaffUser(app, {
    email: "coach-ar-ratings@test.com",
    password: "coach-pass-123",
    firstName: "Carlos",
    lastName: "Profe",
    role: "coach",
    branchId: ar.id,
  });
  const coachArToken = await getAuthToken(
    app,
    "coach-ar-ratings@test.com",
    "coach-pass-123",
  );

  // A second AR coach, for effective-dated tests that swap coaches within AR.
  const coachAr2Id = await createStaffUser(app, {
    email: "coach-ar2b-ratings@test.com",
    password: "coach-pass-123",
    firstName: "Diego",
    lastName: "Profe",
    role: "coach",
    branchId: ar.id,
  });

  const coachEsId = await createStaffUser(app, {
    email: "coach-es-ratings@test.com",
    password: "coach-pass-123",
    firstName: "Elena",
    lastName: "Profe",
    role: "coach",
    branchId: es.id,
  });

  const memberReg = await registerUser(app, {
    email: "member-ratings@test.com",
    password: "member-pass-123",
    firstName: "Mati",
    lastName: "Alumno",
    branchId: ar.id,
  });
  const memberId = (memberReg.user as { id: number }).id;
  const memberToken = memberReg.token;

  return {
    arBranchId: ar.id,
    esBranchId: es.id,
    ownerToken,
    coachArToken,
    coachArId,
    coachAr2Id,
    coachEsId,
    scheduleMorningId: schedMorning.id,
    scheduleAfternoonId: schedAfternoon.id,
    memberId,
    memberToken,
  };
}

/** Insert a confirmed attendance with a controlled checkedInAt. */
async function seedAttendance(
  app: FastifyInstance,
  params: {
    memberId: number;
    branchId: number;
    scheduleId: number;
    sessionDate: string;
    checkedInAt: Date;
  },
): Promise<void> {
  await app.db.insert(schema.attendance).values({
    memberId: params.memberId,
    branchId: params.branchId,
    scheduleId: params.scheduleId,
    sessionDate: params.sessionDate,
    status: "confirmado",
    source: "qr",
    checkedInAt: params.checkedInAt,
  });
}

/** Assign a roster slot via the API as the owner (immediate persistence). */
async function assignRoster(
  app: FastifyInstance,
  ownerToken: string,
  body: {
    branchId: number;
    weekStartDate: string;
    dayOfWeek: number;
    slot: "morning" | "afternoon";
    coachId: number;
  },
): Promise<number> {
  const res = await app.inject({
    method: "POST",
    url: `${ADMIN_BASE}/roster`,
    headers: { authorization: `Bearer ${ownerToken}` },
    payload: body,
  });
  return res.statusCode;
}

/**
 * Seed a roster change-point directly in the DB, bypassing the API's
 * "no editing the past" guard. Used to set up historical change-points (the way
 * production accumulates them over time / via the collapse migration) so
 * attribution/inheritance can be exercised for past classes.
 */
async function seedRoster(
  app: FastifyInstance,
  row: {
    branchId: number;
    weekStartDate: string;
    dayOfWeek: number;
    slot: "morning" | "afternoon";
    coachId: number;
  },
): Promise<void> {
  await app.db.insert(schema.classCoachAssignments).values(row);
}

describe("Ratings module (Phase 143)", () => {
  let app: FastifyInstance;
  let ctx: SeededContext;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    await app.db.delete(schema.coachRatings);
    await app.db.delete(schema.classCoachAssignments);
    ctx = await seedFixtures(app);
  });

  it("owner assigns a coach to a roster slot (immediate persistence) and reassigning replaces it", async () => {
    const week = isoMonday(dateDaysAgo(0));
    const status1 = await assignRoster(app, ctx.ownerToken, {
      branchId: ctx.arBranchId,
      weekStartDate: week,
      dayOfWeek: 1,
      slot: "morning",
      coachId: ctx.coachArId,
    });
    expect(status1).toBe(204);

    // A second coach in AR for the reassign case.
    const coachAr2Id = await createStaffUser(app, {
      email: "coach-ar2-ratings@test.com",
      password: "coach-pass-123",
      firstName: "Diego",
      lastName: "Profe",
      role: "coach",
      branchId: ctx.arBranchId,
    });

    const status2 = await assignRoster(app, ctx.ownerToken, {
      branchId: ctx.arBranchId,
      weekStartDate: week,
      dayOfWeek: 1,
      slot: "morning",
      coachId: coachAr2Id,
    });
    expect(status2).toBe(204);

    // Exactly one row for the slot, now pointing at the second coach.
    const rows = await app.db
      .select()
      .from(schema.classCoachAssignments)
      .where(
        and(
          eq(schema.classCoachAssignments.branchId, ctx.arBranchId),
          eq(schema.classCoachAssignments.weekStartDate, week),
          eq(schema.classCoachAssignments.dayOfWeek, 1),
          eq(schema.classCoachAssignments.slot, "morning"),
        ),
      );
    expect(rows).toHaveLength(1);
    expect(rows[0].coachId).toBe(coachAr2Id);
  });

  it("coach cannot assign roster outside their branches (403 branch scope)", async () => {
    const week = isoMonday(dateDaysAgo(0));
    const res = await app.inject({
      method: "POST",
      url: `${ADMIN_BASE}/roster`,
      headers: { authorization: `Bearer ${ctx.coachArToken}` },
      payload: {
        branchId: ctx.esBranchId, // AR coach trying to write ES roster
        weekStartDate: week,
        dayOfWeek: 1,
        slot: "morning",
        coachId: ctx.coachEsId,
      },
    });
    expect(res.statusCode).toBe(403);
  });

  it("roster WRITE is owner-only: a coach cannot assign even within their own branch", async () => {
    const week = isoMonday(dateDaysAgo(0));
    const res = await app.inject({
      method: "POST",
      url: `${ADMIN_BASE}/roster`,
      headers: { authorization: `Bearer ${ctx.coachArToken}` },
      payload: {
        branchId: ctx.arBranchId, // AR coach, AR slot — branch scope is fine
        weekStartDate: week,
        dayOfWeek: 1,
        slot: "morning",
        coachId: ctx.coachArId,
      },
    });
    expect(res.statusCode).toBe(403); // owner-only WRITE, not branch scope
  });

  it("roster READ is open to non-owner staff (Horarios surface): gestion gets 200, but cannot assign (403)", async () => {
    const week = isoMonday(dateDaysAgo(0));
    await createStaffUser(app, {
      email: "gestion-ratings@test.com",
      password: "gestion-pass-123",
      firstName: "Gabi",
      lastName: "Gestion",
      role: "gestion",
      branchId: ctx.arBranchId,
    });
    const gestionToken = await getAuthToken(
      app,
      "gestion-ratings@test.com",
      "gestion-pass-123",
    );

    const coachesRes = await app.inject({
      method: "GET",
      url: `${ADMIN_BASE}/coaches?branchId=${ctx.arBranchId}`,
      headers: { authorization: `Bearer ${gestionToken}` },
    });
    expect(coachesRes.statusCode).toBe(200);

    const rosterRes = await app.inject({
      method: "GET",
      url: `${ADMIN_BASE}/roster?branchId=${ctx.arBranchId}&weekStart=${week}`,
      headers: { authorization: `Bearer ${gestionToken}` },
    });
    expect(rosterRes.statusCode).toBe(200);

    const writeRes = await app.inject({
      method: "POST",
      url: `${ADMIN_BASE}/roster`,
      headers: { authorization: `Bearer ${gestionToken}` },
      payload: {
        branchId: ctx.arBranchId,
        weekStartDate: week,
        dayOfWeek: 1,
        slot: "morning",
        coachId: ctx.coachArId,
      },
    });
    expect(writeRes.statusCode).toBe(403);
  });

  it("attributes the submitted rating to the coach effective that week; a LATER change-point does not affect it", async () => {
    const sessionDate = classDaysAgo(0);
    const week = isoMonday(sessionDate);
    const dow = isoDow(sessionDate);

    await seedAttendance(app, {
      memberId: ctx.memberId,
      branchId: ctx.arBranchId,
      scheduleId: ctx.scheduleMorningId, // 09:00 → morning
      sessionDate,
      checkedInAt: new Date(),
    });
    await assignRoster(app, ctx.ownerToken, {
      branchId: ctx.arBranchId,
      weekStartDate: week,
      dayOfWeek: dow,
      slot: "morning",
      coachId: ctx.coachArId,
    });
    // A change-point in a FUTURE week must not affect this week's attribution
    // (its week is > the class week, excluded by the "<=" resolution).
    await assignRoster(app, ctx.ownerToken, {
      branchId: ctx.arBranchId,
      weekStartDate: isoMonday(dateDaysAgo(-14)), // two weeks ahead
      dayOfWeek: dow,
      slot: "morning",
      coachId: ctx.coachAr2Id,
    });

    const res = await app.inject({
      method: "POST",
      url: MEMBER_BASE,
      headers: { authorization: `Bearer ${ctx.memberToken}` },
      payload: { sessionDate, scheduleId: ctx.scheduleMorningId, stars: 5 },
    });
    expect(res.statusCode).toBe(201);

    const rows = await app.db
      .select()
      .from(schema.coachRatings)
      .where(eq(schema.coachRatings.memberId, ctx.memberId));
    expect(rows).toHaveLength(1);
    expect(rows[0].coachId).toBe(ctx.coachArId);
    expect(rows[0].stars).toBe(5);
  });

  it("attribution inherits the last change-point when the class's week has none (effective-dated)", async () => {
    const sessionDate = classDaysAgo(0);
    const dow = isoDow(sessionDate);

    await seedAttendance(app, {
      memberId: ctx.memberId,
      branchId: ctx.arBranchId,
      scheduleId: ctx.scheduleMorningId,
      sessionDate,
      checkedInAt: new Date(),
    });
    // Only a PAST change-point exists (seeded directly — the API guards past
    // weeks). The class's week has no row of its own, so it inherits coachAr.
    await seedRoster(app, {
      branchId: ctx.arBranchId,
      weekStartDate: isoMonday(dateDaysAgo(21)),
      dayOfWeek: dow,
      slot: "morning",
      coachId: ctx.coachArId,
    });

    const res = await app.inject({
      method: "POST",
      url: MEMBER_BASE,
      headers: { authorization: `Bearer ${ctx.memberToken}` },
      payload: { sessionDate, scheduleId: ctx.scheduleMorningId, stars: 4 },
    });
    expect(res.statusCode).toBe(201);

    const rows = await app.db
      .select()
      .from(schema.coachRatings)
      .where(eq(schema.coachRatings.memberId, ctx.memberId));
    expect(rows).toHaveLength(1);
    expect(rows[0].coachId).toBe(ctx.coachArId);
  });

  it("rejects editing the roster of a past week (history is frozen)", async () => {
    const status = await assignRoster(app, ctx.ownerToken, {
      branchId: ctx.arBranchId,
      weekStartDate: isoMonday(dateDaysAgo(14)),
      dayOfWeek: 1,
      slot: "morning",
      coachId: ctx.coachArId,
    });
    expect(status).toBe(400);
  });

  it("a change propagates forward: a future week reflects the current-week coach", async () => {
    const week = isoMonday(dateDaysAgo(0));
    await assignRoster(app, ctx.ownerToken, {
      branchId: ctx.arBranchId,
      weekStartDate: week,
      dayOfWeek: 1,
      slot: "morning",
      coachId: ctx.coachArId,
    });

    const futureWeek = isoMonday(dateDaysAgo(-28)); // 4 weeks ahead
    const res = await app.inject({
      method: "GET",
      url: `${ADMIN_BASE}/roster?branchId=${ctx.arBranchId}&weekStart=${futureWeek}`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
    const cells = JSON.parse(res.body) as Array<{
      dayOfWeek: number;
      slot: string;
      coachId: number;
    }>;
    const cell = cells.find((c) => c.dayOfWeek === 1 && c.slot === "morning");
    expect(cell?.coachId).toBe(ctx.coachArId);
  });

  it("a forward change does not wipe a planned later change (two change-points)", async () => {
    const week = isoMonday(dateDaysAgo(0));
    const midWeek = isoMonday(dateDaysAgo(-14)); // 2 weeks ahead
    // coachAr from now, coachAr2 planned from 2 weeks ahead.
    await assignRoster(app, ctx.ownerToken, {
      branchId: ctx.arBranchId,
      weekStartDate: week,
      dayOfWeek: 1,
      slot: "morning",
      coachId: ctx.coachArId,
    });
    await assignRoster(app, ctx.ownerToken, {
      branchId: ctx.arBranchId,
      weekStartDate: midWeek,
      dayOfWeek: 1,
      slot: "morning",
      coachId: ctx.coachAr2Id,
    });

    const coachAt = async (weekStart: string): Promise<number | undefined> => {
      const res = await app.inject({
        method: "GET",
        url: `${ADMIN_BASE}/roster?branchId=${ctx.arBranchId}&weekStart=${weekStart}`,
        headers: { authorization: `Bearer ${ctx.ownerToken}` },
      });
      const cells = JSON.parse(res.body) as Array<{
        dayOfWeek: number;
        slot: string;
        coachId: number;
      }>;
      return cells.find((c) => c.dayOfWeek === 1 && c.slot === "morning")
        ?.coachId;
    };

    expect(await coachAt(week)).toBe(ctx.coachArId);
    expect(await coachAt(isoMonday(dateDaysAgo(-7)))).toBe(ctx.coachArId); // 1w
    expect(await coachAt(midWeek)).toBe(ctx.coachAr2Id); // 2w onward
    expect(await coachAt(isoMonday(dateDaysAgo(-28)))).toBe(ctx.coachAr2Id); // 4w
  });

  it("setting a coach already inherited creates no redundant change-point", async () => {
    const week = isoMonday(dateDaysAgo(0));
    await assignRoster(app, ctx.ownerToken, {
      branchId: ctx.arBranchId,
      weekStartDate: week,
      dayOfWeek: 1,
      slot: "morning",
      coachId: ctx.coachArId,
    });
    // Re-set the SAME coach two weeks ahead: it is already inherited → no row.
    await assignRoster(app, ctx.ownerToken, {
      branchId: ctx.arBranchId,
      weekStartDate: isoMonday(dateDaysAgo(-14)),
      dayOfWeek: 1,
      slot: "morning",
      coachId: ctx.coachArId,
    });

    const rows = await app.db
      .select()
      .from(schema.classCoachAssignments)
      .where(
        and(
          eq(schema.classCoachAssignments.branchId, ctx.arBranchId),
          eq(schema.classCoachAssignments.dayOfWeek, 1),
          eq(schema.classCoachAssignments.slot, "morning"),
        ),
      );
    expect(rows).toHaveLength(1);
    expect(rows[0].weekStartDate).toBe(week);
  });

  it("one-week exception works via two changes (substitute then back)", async () => {
    const week = isoMonday(dateDaysAgo(0));
    const nextWeek = isoMonday(dateDaysAgo(-7));
    const backWeek = isoMonday(dateDaysAgo(-14));
    await assignRoster(app, ctx.ownerToken, {
      branchId: ctx.arBranchId,
      weekStartDate: week,
      dayOfWeek: 1,
      slot: "morning",
      coachId: ctx.coachArId,
    });
    // Substitute for exactly one week, then back to the original.
    await assignRoster(app, ctx.ownerToken, {
      branchId: ctx.arBranchId,
      weekStartDate: nextWeek,
      dayOfWeek: 1,
      slot: "morning",
      coachId: ctx.coachAr2Id,
    });
    await assignRoster(app, ctx.ownerToken, {
      branchId: ctx.arBranchId,
      weekStartDate: backWeek,
      dayOfWeek: 1,
      slot: "morning",
      coachId: ctx.coachArId,
    });

    const coachAt = async (weekStart: string): Promise<number | undefined> => {
      const res = await app.inject({
        method: "GET",
        url: `${ADMIN_BASE}/roster?branchId=${ctx.arBranchId}&weekStart=${weekStart}`,
        headers: { authorization: `Bearer ${ctx.ownerToken}` },
      });
      const cells = JSON.parse(res.body) as Array<{
        dayOfWeek: number;
        slot: string;
        coachId: number;
      }>;
      return cells.find((c) => c.dayOfWeek === 1 && c.slot === "morning")
        ?.coachId;
    };

    expect(await coachAt(week)).toBe(ctx.coachArId);
    expect(await coachAt(nextWeek)).toBe(ctx.coachAr2Id);
    expect(await coachAt(backWeek)).toBe(ctx.coachArId);
    // Three distinct change-points remain.
    const rows = await app.db
      .select()
      .from(schema.classCoachAssignments)
      .where(
        and(
          eq(schema.classCoachAssignments.branchId, ctx.arBranchId),
          eq(schema.classCoachAssignments.dayOfWeek, 1),
          eq(schema.classCoachAssignments.slot, "morning"),
        ),
      );
    expect(rows).toHaveLength(3);
  });

  it("pending returns the recent in-person class within 48h (no coach exposed) and null past 48h", async () => {
    const sessionDate = classDaysAgo(0);
    const week = isoMonday(sessionDate);
    const dow = isoDow(sessionDate);

    await seedAttendance(app, {
      memberId: ctx.memberId,
      branchId: ctx.arBranchId,
      scheduleId: ctx.scheduleMorningId,
      sessionDate,
      checkedInAt: new Date(),
    });
    await assignRoster(app, ctx.ownerToken, {
      branchId: ctx.arBranchId,
      weekStartDate: week,
      dayOfWeek: dow,
      slot: "morning",
      coachId: ctx.coachArId,
    });

    const res = await app.inject({
      method: "GET",
      url: `${MEMBER_BASE}/pending`,
      headers: { authorization: `Bearer ${ctx.memberToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as Record<string, unknown> | null;
    expect(body).not.toBeNull();
    expect(body!.scheduleId).toBe(ctx.scheduleMorningId);
    expect(body!.activityName).toBe("Calistenia");
    // D-A3: the pending payload must NOT expose the coach.
    expect(body).not.toHaveProperty("coachId");
    expect(body).not.toHaveProperty("coachName");

    // Older than 48h → no longer pending.
    await app.db.delete(schema.attendance);
    const oldDate = dateDaysAgo(3);
    await seedAttendance(app, {
      memberId: ctx.memberId,
      branchId: ctx.arBranchId,
      scheduleId: ctx.scheduleMorningId,
      sessionDate: oldDate,
      checkedInAt: new Date(Date.now() - 72 * 60 * 60 * 1000),
    });
    const res2 = await app.inject({
      method: "GET",
      url: `${MEMBER_BASE}/pending`,
      headers: { authorization: `Bearer ${ctx.memberToken}` },
    });
    expect(res2.statusCode).toBe(200);
    expect(JSON.parse(res2.body)).toBeNull();
  });

  it("pending returns only the last unrated class when there are several", async () => {
    const today = classDaysAgo(0);
    const yesterday = classDaysAgo(1);
    const week = isoMonday(today);

    // Two confirmed classes within 48h, both with a coach assigned.
    await seedAttendance(app, {
      memberId: ctx.memberId,
      branchId: ctx.arBranchId,
      scheduleId: ctx.scheduleAfternoonId,
      sessionDate: yesterday,
      checkedInAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    });
    await seedAttendance(app, {
      memberId: ctx.memberId,
      branchId: ctx.arBranchId,
      scheduleId: ctx.scheduleMorningId,
      sessionDate: today,
      checkedInAt: new Date(),
    });
    // Seed directly: yesterday may fall in a prior ISO week (Mondays), which the
    // API guards as "past". Attribution/inheritance is what we exercise here.
    await seedRoster(app, {
      branchId: ctx.arBranchId,
      weekStartDate: week,
      dayOfWeek: isoDow(today),
      slot: "morning",
      coachId: ctx.coachArId,
    });
    await seedRoster(app, {
      branchId: ctx.arBranchId,
      weekStartDate: isoMonday(yesterday),
      dayOfWeek: isoDow(yesterday),
      slot: "afternoon",
      coachId: ctx.coachArId,
    });

    const res = await app.inject({
      method: "GET",
      url: `${MEMBER_BASE}/pending`,
      headers: { authorization: `Bearer ${ctx.memberToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { sessionDate: string };
    // Only the LAST class (today) — no queue (D-P4).
    expect(body.sessionDate).toBe(today);
  });

  it("pending is null when the class already has a rating (one-shot D-P2)", async () => {
    const sessionDate = classDaysAgo(0);
    const week = isoMonday(sessionDate);
    await seedAttendance(app, {
      memberId: ctx.memberId,
      branchId: ctx.arBranchId,
      scheduleId: ctx.scheduleMorningId,
      sessionDate,
      checkedInAt: new Date(),
    });
    await assignRoster(app, ctx.ownerToken, {
      branchId: ctx.arBranchId,
      weekStartDate: week,
      dayOfWeek: isoDow(sessionDate),
      slot: "morning",
      coachId: ctx.coachArId,
    });
    // Submit once.
    const submit1 = await app.inject({
      method: "POST",
      url: MEMBER_BASE,
      headers: { authorization: `Bearer ${ctx.memberToken}` },
      payload: { sessionDate, scheduleId: ctx.scheduleMorningId, stars: 4 },
    });
    expect(submit1.statusCode).toBe(201);

    const pending = await app.inject({
      method: "GET",
      url: `${MEMBER_BASE}/pending`,
      headers: { authorization: `Bearer ${ctx.memberToken}` },
    });
    expect(JSON.parse(pending.body)).toBeNull();

    // Second submit → 400 (one-shot, D-P2).
    const submit2 = await app.inject({
      method: "POST",
      url: MEMBER_BASE,
      headers: { authorization: `Bearer ${ctx.memberToken}` },
      payload: { sessionDate, scheduleId: ctx.scheduleMorningId, stars: 1 },
    });
    expect(submit2.statusCode).toBe(400);

    // Still exactly one rating row.
    const rows = await app.db
      .select()
      .from(schema.coachRatings)
      .where(eq(schema.coachRatings.memberId, ctx.memberId));
    expect(rows).toHaveLength(1);
  });

  it("pending is null and submit is rejected when no coach is assigned (no-orphan D-Q3)", async () => {
    const sessionDate = classDaysAgo(0);
    await seedAttendance(app, {
      memberId: ctx.memberId,
      branchId: ctx.arBranchId,
      scheduleId: ctx.scheduleMorningId,
      sessionDate,
      checkedInAt: new Date(),
    });
    // No roster assignment for this class.

    const pending = await app.inject({
      method: "GET",
      url: `${MEMBER_BASE}/pending`,
      headers: { authorization: `Bearer ${ctx.memberToken}` },
    });
    expect(JSON.parse(pending.body)).toBeNull();

    const submit = await app.inject({
      method: "POST",
      url: MEMBER_BASE,
      headers: { authorization: `Bearer ${ctx.memberToken}` },
      payload: { sessionDate, scheduleId: ctx.scheduleMorningId, stars: 5 },
    });
    expect(submit.statusCode).toBe(400);

    const rows = await app.db.select().from(schema.coachRatings);
    expect(rows).toHaveLength(0);
  });

  it("owner-only ratings view: member 403, coach 403, owner 200 (D-M3)", async () => {
    const memberRes = await app.inject({
      method: "GET",
      url: ADMIN_BASE,
      headers: { authorization: `Bearer ${ctx.memberToken}` },
    });
    expect(memberRes.statusCode).toBe(403);

    const coachRes = await app.inject({
      method: "GET",
      url: ADMIN_BASE,
      headers: { authorization: `Bearer ${ctx.coachArToken}` },
    });
    expect(coachRes.statusCode).toBe(403);

    const ownerRes = await app.inject({
      method: "GET",
      url: ADMIN_BASE,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    expect(ownerRes.statusCode).toBe(200);
  });

  it("owner view returns the correct per-coach average and count (D-O1)", async () => {
    // Three classes for the same coach/slot across different days, rated 5,3,4.
    const week = isoMonday(classDaysAgo(0));
    const days = [classDaysAgo(0), classDaysAgo(1), classDaysAgo(2)];
    const stars = [5, 3, 4];

    for (let i = 0; i < days.length; i++) {
      await seedAttendance(app, {
        memberId: ctx.memberId,
        branchId: ctx.arBranchId,
        scheduleId: ctx.scheduleMorningId,
        sessionDate: days[i],
        checkedInAt: new Date(Date.now() - i * 60 * 1000),
      });
      // Seed directly: earlier class days may fall in prior ISO weeks that the
      // API guards as "past".
      await seedRoster(app, {
        branchId: ctx.arBranchId,
        weekStartDate: isoMonday(days[i]),
        dayOfWeek: isoDow(days[i]),
        slot: "morning",
        coachId: ctx.coachArId,
      });
      const submit = await app.inject({
        method: "POST",
        url: MEMBER_BASE,
        headers: { authorization: `Bearer ${ctx.memberToken}` },
        payload: {
          sessionDate: days[i],
          scheduleId: ctx.scheduleMorningId,
          stars: stars[i],
        },
      });
      expect(submit.statusCode).toBe(201);
    }
    void week;

    const ownerRes = await app.inject({
      method: "GET",
      url: ADMIN_BASE,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    expect(ownerRes.statusCode).toBe(200);
    const body = JSON.parse(ownerRes.body) as {
      perCoach: Array<{
        coachId: number;
        averageStars: number;
        ratingCount: number;
      }>;
      recent: Array<{ stars: number }>;
    };

    const coachSummary = body.perCoach.find((c) => c.coachId === ctx.coachArId);
    expect(coachSummary).toBeDefined();
    expect(coachSummary!.ratingCount).toBe(3);
    // AVG(5,3,4) = 4.
    expect(coachSummary!.averageStars).toBeCloseTo(4, 5);
    expect(body.recent.length).toBeGreaterThanOrEqual(3);
  });

  it("lists coaches assignable to a branch", async () => {
    const res = await app.inject({
      method: "GET",
      url: `${ADMIN_BASE}/coaches?branchId=${ctx.arBranchId}`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as Array<{ id: number }>;
    const ids = body.map((c) => c.id);
    expect(ids).toContain(ctx.coachArId);
    // The ES coach is not in the AR branch.
    expect(ids).not.toContain(ctx.coachEsId);
  });
});
