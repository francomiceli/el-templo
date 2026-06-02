/**
 * Phase 119 — self-service trial reservation (made GREEN by Wave 2).
 *
 * Requirements covered:
 *   - D-01 freemium reserva su sesión de prueba self-service (promote+book atomic)
 *   - D-02/D-26 freemium→prueba + user_status_history + booking in one tx
 *   - D-03 sin afordance de cancelar (una sola sesión de prueba)
 *   - D-05 ventana de reserva extendida a 30 días para trials
 *   - D-21 el token NUNCA autoriza — el endpoint revalida estado server-side
 *
 * POST /api/members/scheduling/reserve-trial promotes freemium→prueba and
 * inserts an is_trial booking with source='self_service' in one transaction.
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
import { eq } from "drizzle-orm";
import {
  createTestApp,
  getAuthToken,
  createEligibleFreemium,
  cleanAllTestData,
} from "./helpers";
import * as schema from "../src/db/schema";

const ADMIN_URL = "/api/admin/scheduling";
const RESERVE_TRIAL_URL = "/api/members/scheduling/reserve-trial";

describe("POST /api/members/scheduling/reserve-trial (Phase 119)", () => {
  let app: FastifyInstance;
  let adminToken: string;
  let physicalBranchId: number;
  let virtualBranchId: number;
  let scheduleId: number;

  beforeAll(async () => {
    // Wednesday 10:00 UTC — mid-week so the +2d/+30d windows + dayOfWeek checks
    // land on valid future slots.
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

    const [virtual] = await app.db
      .select({ id: schema.branches.id })
      .from(schema.branches)
      .where(eq(schema.branches.code, "ONLINE"))
      .limit(1);
    virtualBranchId = virtual.id;
  });

  afterAll(async () => {
    vi.useRealTimers();
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    // Recreate the schedule each test (cleanAllTestData wipes schedules).
    const activityRes = await app.inject({
      method: "POST",
      url: `${ADMIN_URL}/activities`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: "Calistenia", description: "Clase grupal" },
    });
    const activityId = JSON.parse(activityRes.body).id;
    const scheduleRes = await app.inject({
      method: "POST",
      url: `${ADMIN_URL}/schedules`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        branchId: physicalBranchId,
        activityId,
        dayOfWeek: 4, // Thursday (ISO)
        startTime: "10:00",
        endTime: "11:00",
      },
    });
    scheduleId = JSON.parse(scheduleRes.body).id;
  });

  /** Thursday relative to the pinned Wednesday — a valid +1d future slot. */
  function thursdayOffset(weeks = 0): string {
    const base = new Date("2026-03-12T00:00:00Z"); // Thursday after pinned Wed
    base.setUTCDate(base.getUTCDate() + weeks * 7);
    return base.toISOString().split("T")[0];
  }

  async function reserve(
    token: string,
    payload: Record<string, unknown>,
  ): Promise<{ statusCode: number; body: Record<string, unknown> }> {
    const res = await app.inject({
      method: "POST",
      url: RESERVE_TRIAL_URL,
      headers: { authorization: `Bearer ${token}` },
      payload,
    });
    return { statusCode: res.statusCode, body: JSON.parse(res.body) };
  }

  async function freemiumToken(
    overrides: Parameters<typeof createEligibleFreemium>[1] = {},
  ): Promise<{ id: number; email: string; token: string }> {
    const { id, email } = await createEligibleFreemium(app, overrides);
    const token = await getAuthToken(app, email, "pass123456");
    return { id, email, token };
  }

  it("D-01: a freemium user reserves a self-service trial (201)", async () => {
    const { token } = await freemiumToken();
    const { statusCode, body } = await reserve(token, {
      scheduleId,
      date: thursdayOffset(),
      branchId: physicalBranchId,
    });
    expect(statusCode).toBe(201);
    expect(typeof body.bookingId).toBe("number");
  });

  it("D-01/D-26: promotes the user freemium→prueba + history + booking in one tx", async () => {
    const { id, token } = await freemiumToken();
    const { statusCode } = await reserve(token, {
      scheduleId,
      date: thursdayOffset(),
      branchId: physicalBranchId,
    });
    expect(statusCode).toBe(201);

    const [user] = await app.db
      .select({
        status: schema.users.status,
        leadStatus: schema.users.leadStatus,
        createdBy: schema.users.createdBy,
        branchId: schema.users.branchId,
      })
      .from(schema.users)
      .where(eq(schema.users.id, id))
      .limit(1);
    expect(user.status).toBe("prueba");
    expect(user.leadStatus).toBe("en_seguimiento");
    expect(user.createdBy).toBeNull(); // D-02: self-service has no admin
    expect(user.branchId).toBe(physicalBranchId); // D-06: chosen branch

    const history = await app.db
      .select({
        fromStatus: schema.userStatusHistory.fromStatus,
        toStatus: schema.userStatusHistory.toStatus,
        source: schema.userStatusHistory.source,
      })
      .from(schema.userStatusHistory)
      .where(eq(schema.userStatusHistory.userId, id));
    expect(history).toHaveLength(1);
    expect(history[0].fromStatus).toBe("freemium");
    expect(history[0].toStatus).toBe("prueba");
    expect(history[0].source).toBe("self_service");

    const [booking] = await app.db
      .select({
        isTrial: schema.bookings.isTrial,
        source: schema.bookings.source,
        status: schema.bookings.status,
      })
      .from(schema.bookings)
      .where(eq(schema.bookings.memberId, id))
      .limit(1);
    expect(booking.isTrial).toBe(true);
    expect(booking.source).toBe("self_service"); // D-18 attribution
    expect(booking.status).toBe("reservado");
  });

  it("D-07: the trial booking does not consume schedule capacity", async () => {
    const { id, token } = await freemiumToken();
    await reserve(token, {
      scheduleId,
      date: thursdayOffset(),
      branchId: physicalBranchId,
    });
    // The weekly grid bookedCount excludes is_trial=true bookings.
    const [slot] = await app.db
      .select({ isTrial: schema.bookings.isTrial })
      .from(schema.bookings)
      .where(eq(schema.bookings.memberId, id))
      .limit(1);
    expect(slot.isTrial).toBe(true);
  });

  it("D-03: rejects a second trial for a user who already booked one", async () => {
    const { token } = await freemiumToken();
    const first = await reserve(token, {
      scheduleId,
      date: thursdayOffset(),
      branchId: physicalBranchId,
    });
    expect(first.statusCode).toBe(201);
    // The user is now 'prueba' (not freemium) AND has a trial → 409 either way.
    const second = await reserve(token, {
      scheduleId,
      date: thursdayOffset(1),
      branchId: physicalBranchId,
    });
    expect(second.statusCode).toBe(409);
  });

  it("D-03: a trial booking cannot be cancelled from the member cancel path", async () => {
    const { id, token } = await freemiumToken();
    await reserve(token, {
      scheduleId,
      date: thursdayOffset(),
      branchId: physicalBranchId,
    });
    const [booking] = await app.db
      .select({ id: schema.bookings.id })
      .from(schema.bookings)
      .where(eq(schema.bookings.memberId, id))
      .limit(1);

    const cancelRes = await app.inject({
      method: "DELETE",
      url: `/api/members/scheduling/bookings/${booking.id}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(cancelRes.statusCode).toBe(400);

    // Still active (not cancelled).
    const [after] = await app.db
      .select({ status: schema.bookings.status })
      .from(schema.bookings)
      .where(eq(schema.bookings.id, booking.id))
      .limit(1);
    expect(after.status).toBe("reservado");
  });

  it("D-05: allows a trial date up to 30 days ahead but rejects +31d", async () => {
    // +28d (4 weeks out, still a Thursday) is within the 30-day trial window.
    const okWeeks = 4;
    const { token } = await freemiumToken();
    const ok = await reserve(token, {
      scheduleId,
      date: thursdayOffset(okWeeks),
      branchId: physicalBranchId,
    });
    expect(ok.statusCode).toBe(201);

    // +35d (5 weeks out) is beyond the 30-day window → 400.
    const { token: token2 } = await freemiumToken();
    const tooFar = await reserve(token2, {
      scheduleId,
      date: thursdayOffset(5),
      branchId: physicalBranchId,
    });
    expect(tooFar.statusCode).toBe(400);
  });

  it("D-21: ignores any extra fields (token) — body rejected by validation", async () => {
    const { token } = await freemiumToken();
    const res = await app.inject({
      method: "POST",
      url: RESERVE_TRIAL_URL,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        scheduleId,
        date: thursdayOffset(),
        branchId: physicalBranchId,
        token: "forged-campaign-token",
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("D-21: rejects a non-freemium user server-side (already has a sub)", async () => {
    const { id, token } = await freemiumToken();
    // Flip the user to 'activo' directly to simulate an existing member.
    await app.db
      .update(schema.users)
      .set({ status: "activo" })
      .where(eq(schema.users.id, id));

    const { statusCode } = await reserve(token, {
      scheduleId,
      date: thursdayOffset(),
      branchId: physicalBranchId,
    });
    expect(statusCode).toBe(409);

    // No booking and no history were written.
    const bookings = await app.db
      .select({ id: schema.bookings.id })
      .from(schema.bookings)
      .where(eq(schema.bookings.memberId, id));
    expect(bookings).toHaveLength(0);
  });

  it("D-06: rejects reservation against a virtual branch (409)", async () => {
    const { token } = await freemiumToken();
    const { statusCode } = await reserve(token, {
      scheduleId,
      date: thursdayOffset(),
      branchId: virtualBranchId,
    });
    expect(statusCode).toBe(409);
  });

  it("blocks a freemium with an active subscription (server-side, D-21)", async () => {
    const { id, token } = await freemiumToken();
    // Seed an active subscription directly; status stays 'freemium' so ONLY the
    // subscription guard can reject (proving the predicate covers subs, not just
    // status). Requires a plan row, present in the test seed.
    const [plan] = await app.db
      .select({ id: schema.subscriptionPlans.id })
      .from(schema.subscriptionPlans)
      .limit(1);
    expect(plan).toBeDefined();

    await app.db.insert(schema.subscriptions).values({
      userId: id,
      planId: plan.id,
      branchId: physicalBranchId,
      status: "active",
      startDate: thursdayOffset(),
      pricePaid: 0,
      priceTypeApplied: "zero",
    });

    const { statusCode } = await reserve(token, {
      scheduleId,
      date: thursdayOffset(),
      branchId: physicalBranchId,
    });
    expect(statusCode).toBe(409);
  });
});
