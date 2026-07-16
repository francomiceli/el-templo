/**
 * Phase 119 (D-03 revised) — self-service trial cancel / change.
 *
 *   - POST /api/members/scheduling/cancel-trial cancels the non-cancelled
 *     is_trial booking and reverts the user prueba→freemium (so they re-enter
 *     the funnel and can rebook — the "change" flow is cancel-then-rebook).
 *   - Blocked inside the 24h window (same-day reservations stay locked).
 *   - trial-eligibility exposes bookingId / startTime / canModify so the app
 *     knows whether to show the cancel/change affordances.
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import type { FastifyInstance } from "fastify";
import { and, eq, ne } from "drizzle-orm";
import {
  createTestApp,
  getAuthToken,
  createEligibleFreemium,
  cleanAllTestData,
} from "./helpers";
import * as schema from "../src/db/schema";

const ADMIN_URL = "/api/admin/scheduling";
const RESERVE_TRIAL_URL = "/api/members/scheduling/reserve-trial";
const CANCEL_TRIAL_URL = "/api/members/scheduling/cancel-trial";
const ELIGIBILITY_URL = "/api/members/scheduling/trial-eligibility";

describe("POST /api/members/scheduling/cancel-trial (Phase 119)", () => {
  let app: FastifyInstance;
  let adminToken: string;
  let physicalBranchId: number;
  let thursdayScheduleId: number; // dayOfWeek 4, >24h from the pinned Wed
  let todayScheduleId: number; // dayOfWeek 3 (Wed), same-day = inside 24h

  beforeAll(async () => {
    // Wednesday 10:00 UTC. A Thursday slot is >24h out; a same-day 11:00 slot is
    // ~1h out (inside the 24h window) but still bookable (>5min before start).
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-03-11T10:00:00Z"));

    app = await createTestApp();
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");

    const [physical] = await app.db
      .select({ id: schema.branches.id })
      .from(schema.branches)
      .where(eq(schema.branches.code, "TEST"))
      .limit(1);
    physicalBranchId = physical.id;
  });

  afterAll(async () => {
    vi.useRealTimers();
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    const activityRes = await app.inject({
      method: "POST",
      url: `${ADMIN_URL}/activities`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: "Calistenia", description: "Clase grupal" },
    });
    const activityId = JSON.parse(activityRes.body).id;

    const mkSchedule = async (dayOfWeek: number, startTime: string) => {
      const res = await app.inject({
        method: "POST",
        url: `${ADMIN_URL}/schedules`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          branchId: physicalBranchId,
          activityId,
          dayOfWeek,
          startTime,
          endTime: "23:59",
        },
      });
      return JSON.parse(res.body).id as number;
    };
    thursdayScheduleId = await mkSchedule(4, "10:00");
    todayScheduleId = await mkSchedule(3, "11:00"); // Wed, ~1h ahead
  });

  /** Thursday after the pinned Wednesday — a >24h future slot. */
  const THURSDAY = "2026-03-12";
  const TODAY = "2026-03-11";

  async function freemiumToken(): Promise<{ id: number; token: string }> {
    // Con teléfono: desde 165 la reserva de prueba exige phone (PHONE_REQUIRED);
    // acá el foco es el flujo de cancelación, no ese guard.
    const { id, email } = await createEligibleFreemium(app, {
      phone: "1122334455",
    });
    const token = await getAuthToken(app, email, "pass123456");
    return { id, token };
  }

  async function reserveTrial(
    token: string,
    scheduleId: number,
    date: string,
  ): Promise<number> {
    const res = await app.inject({
      method: "POST",
      url: RESERVE_TRIAL_URL,
      headers: { authorization: `Bearer ${token}` },
      payload: { scheduleId, date, branchId: physicalBranchId },
    });
    expect(res.statusCode).toBe(201);
    return JSON.parse(res.body).bookingId as number;
  }

  function cancelTrial(token: string) {
    return app.inject({
      method: "POST",
      url: CANCEL_TRIAL_URL,
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    });
  }

  it("cancels a >24h trial and reverts prueba→freemium", async () => {
    const { id, token } = await freemiumToken();
    const bookingId = await reserveTrial(token, thursdayScheduleId, THURSDAY);

    const res = await cancelTrial(token);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).cancelled).toBe(true);

    // Booking cancelled.
    const [booking] = await app.db
      .select({ status: schema.bookings.status })
      .from(schema.bookings)
      .where(eq(schema.bookings.id, bookingId));
    expect(booking.status).toBe("cancelado");

    // User back to freemium, with a prueba→freemium history row.
    const [user] = await app.db
      .select({ status: schema.users.status })
      .from(schema.users)
      .where(eq(schema.users.id, id));
    expect(user.status).toBe("freemium");

    const history = await app.db
      .select({
        fromStatus: schema.userStatusHistory.fromStatus,
        toStatus: schema.userStatusHistory.toStatus,
      })
      .from(schema.userStatusHistory)
      .where(eq(schema.userStatusHistory.userId, id));
    expect(history).toContainEqual({
      fromStatus: "prueba",
      toStatus: "freemium",
    });
  });

  it("lets a freemium rebook after cancelling (change flow)", async () => {
    const { id, token } = await freemiumToken();
    await reserveTrial(token, thursdayScheduleId, THURSDAY);
    expect((await cancelTrial(token)).statusCode).toBe(200);

    // After cancel the user is freemium again → rebooking succeeds (the
    // one-per-lifetime guard ignores cancelled trials).
    const newBookingId = await reserveTrial(
      token,
      thursdayScheduleId,
      THURSDAY,
    );
    expect(newBookingId).toBeGreaterThan(0);

    const active = await app.db
      .select({ id: schema.bookings.id })
      .from(schema.bookings)
      .where(
        and(
          eq(schema.bookings.memberId, id),
          eq(schema.bookings.isTrial, true),
          ne(schema.bookings.status, "cancelado"),
        ),
      );
    expect(active).toHaveLength(1);
  });

  it("blocks cancelling inside the 24h window (same-day)", async () => {
    const { id, token } = await freemiumToken();
    await reserveTrial(token, todayScheduleId, TODAY);

    const res = await cancelTrial(token);
    expect(res.statusCode).toBe(400);

    // Booking untouched, user still 'prueba'.
    const [user] = await app.db
      .select({ status: schema.users.status })
      .from(schema.users)
      .where(eq(schema.users.id, id));
    expect(user.status).toBe("prueba");
  });

  it("409 when the user has no trial booking", async () => {
    const { token } = await freemiumToken();
    const res = await cancelTrial(token);
    expect(res.statusCode).toBe(409);
  });

  it("trial-eligibility exposes bookingId, startTime and canModify", async () => {
    const { token } = await freemiumToken();
    const bookingId = await reserveTrial(token, thursdayScheduleId, THURSDAY);

    const res = await app.inject({
      method: "GET",
      url: ELIGIBILITY_URL,
      headers: { authorization: `Bearer ${token}` },
    });
    const body = JSON.parse(res.body);
    expect(body.alreadyBooked).toBe(true);
    expect(body.booking.bookingId).toBe(bookingId);
    expect(body.booking.startTime).toMatch(/^10:00/);
    expect(body.booking.canModify).toBe(true); // Thursday is >24h away
  });

  it("canModify is false for a same-day booking", async () => {
    const { token } = await freemiumToken();
    await reserveTrial(token, todayScheduleId, TODAY);

    const res = await app.inject({
      method: "GET",
      url: ELIGIBILITY_URL,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(JSON.parse(res.body).booking.canModify).toBe(false);
  });
});
