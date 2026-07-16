/**
 * Phase 102 + 103: Trial endpoint integration tests.
 *
 * Phase 103 split the trial flow into two phases:
 *   1. Create the prueba user via POST /api/admin/members (defaults
 *      status='prueba' — see members-status-filter.test.ts).
 *   2. Book the trial via POST /api/admin/scheduling/trials with
 *      `{userId, scheduleId, bookingDate}`.
 *
 * Covers:
 *   R2  — Trial bookings do NOT consume schedule capacity.
 *   R3  — POST /trials creates a booking with is_trial=true (Phase 103).
 *   R4  — Second trial for the same user → 409.
 *   Plus: 409 for non-prueba user, 409 for cross-branch user,
 *         GET /trials/eligible filtering, GET /trials grouped listing,
 *         103-07 conversion hooks, 403 for non-staff JWTs, 400 for
 *         missing/wrong-type body fields.
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
import { and, eq, sql } from "drizzle-orm";
import {
  createTestApp,
  getAuthToken,
  registerUser,
  cleanAllTestData,
} from "../helpers";
import { bookings } from "../../src/db/schema/bookings";
import { users } from "../../src/db/schema/users";
import { branches } from "../../src/db/schema/branches";

const ADMIN_URL = "/api/admin/scheduling";
const MEMBER_URL = "/api/members/scheduling";
const TRIALS_URL = `${ADMIN_URL}/trials`;
const ELIGIBLE_URL = `${TRIALS_URL}/eligible`;
const ADMIN_MEMBERS_URL = "/api/admin/members";

describe("Scheduling Trials API (Phase 102 + 103)", () => {
  let app: FastifyInstance;
  let adminToken: string;
  let testBranchId: number;

  beforeAll(async () => {
    // Wednesday 10:00 UTC — mid-week so Mon-Sat window + booking date checks
    // land on valid future slots.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-03-11T10:00:00Z"));

    app = await createTestApp();
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");

    const [branch] = await app.db
      .select({ id: branches.id })
      .from(branches)
      .where(eq(branches.isVirtual, false));
    testBranchId = branch.id;
  });

  afterAll(async () => {
    vi.useRealTimers();
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
  });

  // ─── Helpers ────────────────────────────────────────────────────────────

  async function createActivity(name = "Calistenia"): Promise<{ id: number }> {
    const res = await app.inject({
      method: "POST",
      url: `${ADMIN_URL}/activities`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name, description: "Clase grupal" },
    });
    expect(res.statusCode).toBe(201);
    return JSON.parse(res.body);
  }

  async function createScheduleSlot(
    activityId: number,
    dayOfWeek: number,
    startTime: string,
    endTime: string,
    branchId?: number,
  ): Promise<{ id: number }> {
    const res = await app.inject({
      method: "POST",
      url: `${ADMIN_URL}/schedules`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        branchId: branchId ?? testBranchId,
        activityId,
        dayOfWeek,
        startTime,
        endTime,
      },
    });
    expect(res.statusCode).toBe(201);
    return JSON.parse(res.body);
  }

  function getDateForDayOfWeek(dayOfWeek: number): string {
    const now = new Date();
    const currentDay = now.getDay();
    const diffToMonday = currentDay === 0 ? -6 : 1 - currentDay;
    const monday = new Date(now);
    monday.setDate(now.getDate() + diffToMonday);
    const target = new Date(monday);
    target.setDate(monday.getDate() + (dayOfWeek - 1));
    return target.toISOString().split("T")[0];
  }

  /** Pick a future dayOfWeek/startTime/date within the booking window. */
  function getFutureSlot(): {
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    date: string;
  } {
    // Fake time is pinned to Wed 10:00 UTC (see beforeAll). Thursday 10:00 is
    // a reliably valid future slot for reserve-window validation.
    return {
      dayOfWeek: 4, // Thursday (ISO)
      startTime: "10:00",
      endTime: "11:00",
      date: getDateForDayOfWeek(4),
    };
  }

  /**
   * Phase 103: create a prueba user via /admin/members. Returns the user
   * id so a subsequent POST /trials can attach a booking.
   */
  let pruebaCounter = 0;
  async function createPruebaUser(
    overrides: Partial<{
      firstName: string;
      lastName: string;
      phone: string;
      dni: string;
      branchId: number;
      email: string;
    }> = {},
  ): Promise<number> {
    pruebaCounter += 1;
    const seq = String(pruebaCounter).padStart(4, "0");
    const stamp = `${Date.now() % 100000}${seq}`;
    const res = await app.inject({
      method: "POST",
      url: ADMIN_MEMBERS_URL,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        email: overrides.email ?? `prueba${stamp}@test.com`,
        firstName: overrides.firstName ?? "Trial",
        lastName: overrides.lastName ?? `User${seq}`,
        phone: overrides.phone ?? `+549115555${seq}`,
        dni: overrides.dni ?? `TR${stamp}`,
        branchId: overrides.branchId ?? testBranchId,
      },
    });
    if (res.statusCode !== 201) {
      throw new Error(`createPruebaUser failed: ${res.statusCode} ${res.body}`);
    }
    const body = JSON.parse(res.body) as { id: number; status: string };
    expect(body.status).toBe("prueba");
    return body.id;
  }

  // ─── R3: happy path ─────────────────────────────────────────────────────

  it("POST /trials creates booking with is_trial=true for an existing prueba user (R3)", async () => {
    const activity = await createActivity();
    const futureSlot = getFutureSlot();
    const slot = await createScheduleSlot(
      activity.id,
      futureSlot.dayOfWeek,
      futureSlot.startTime,
      futureSlot.endTime,
    );

    const userId = await createPruebaUser({
      firstName: "Juan",
      lastName: "Pérez",
    });

    const res = await app.inject({
      method: "POST",
      url: TRIALS_URL,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        userId,
        scheduleId: slot.id,
        bookingDate: futureSlot.date,
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.bookingId).toBeTruthy();
    expect(body).not.toHaveProperty("userId"); // booking-only response

    const [bookingRow] = await app.db
      .select({
        id: bookings.id,
        memberId: bookings.memberId,
        scheduleId: bookings.scheduleId,
        bookingDate: bookings.bookingDate,
        status: bookings.status,
        isTrial: bookings.isTrial,
      })
      .from(bookings)
      .where(eq(bookings.id, body.bookingId));
    expect(bookingRow).toBeTruthy();
    expect(bookingRow.memberId).toBe(userId);
    expect(bookingRow.scheduleId).toBe(slot.id);
    expect(bookingRow.bookingDate).toBe(futureSlot.date);
    expect(bookingRow.status).toBe("reservado");
    expect(Boolean(bookingRow.isTrial)).toBe(true);
  });

  // ─── R2: capacity exclusion ─────────────────────────────────────────────

  it("Trial booking does not consume schedule capacity (R2)", async () => {
    // Reduce branch capacity so we can fill it quickly.
    await app.db
      .update(branches)
      .set({ maxCapacity: 2 })
      .where(eq(branches.id, testBranchId));

    try {
      const activity = await createActivity();
      const futureSlot = getFutureSlot();
      const slot = await createScheduleSlot(
        activity.id,
        futureSlot.dayOfWeek,
        futureSlot.startTime,
        futureSlot.endTime,
      );

      // Fill the slot to maxCapacity=2 with non-trial bookings via admin add.
      const memberA = await registerUser(app, {
        email: "capA@test.com",
        password: "pass123456",
        branchId: testBranchId,
        dni: "60000001",
        phone: "+5491155550001",
      });
      const memberB = await registerUser(app, {
        email: "capB@test.com",
        password: "pass123456",
        branchId: testBranchId,
        dni: "60000002",
        phone: "+5491155550002",
      });

      const addA = await app.inject({
        method: "POST",
        url: `${ADMIN_URL}/bookings`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          scheduleId: slot.id,
          memberId: (memberA.user as { id: number }).id,
          date: futureSlot.date,
        },
      });
      expect(addA.statusCode).toBe(201);
      expect(JSON.parse(addA.body).booking.status).toBe("reservado");

      const addB = await app.inject({
        method: "POST",
        url: `${ADMIN_URL}/bookings`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          scheduleId: slot.id,
          memberId: (memberB.user as { id: number }).id,
          date: futureSlot.date,
        },
      });
      expect(addB.statusCode).toBe(201);
      expect(JSON.parse(addB.body).booking.status).toBe("reservado");

      // Snapshot non-trial count before the trial.
      const [beforeCount] = await app.db
        .select({ count: sql<number>`COUNT(*)` })
        .from(bookings)
        .where(
          and(
            eq(bookings.scheduleId, slot.id),
            eq(bookings.bookingDate, futureSlot.date),
            eq(bookings.isTrial, false),
            sql`${bookings.status} IN ('reservado', 'qr_escaneado', 'confirmado')`,
          ),
        );
      expect(Number(beforeCount?.count ?? 0)).toBe(2);

      // Add a trial — must succeed even though capacity=2 is full with non-trials.
      const trialUserId = await createPruebaUser({
        firstName: "Lead",
        lastName: "Prospecto",
      });
      const trialRes = await app.inject({
        method: "POST",
        url: TRIALS_URL,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          userId: trialUserId,
          scheduleId: slot.id,
          bookingDate: futureSlot.date,
        },
      });
      expect(trialRes.statusCode).toBe(201);

      // Non-trial count unchanged.
      const [afterCount] = await app.db
        .select({ count: sql<number>`COUNT(*)` })
        .from(bookings)
        .where(
          and(
            eq(bookings.scheduleId, slot.id),
            eq(bookings.bookingDate, futureSlot.date),
            eq(bookings.isTrial, false),
            sql`${bookings.status} IN ('reservado', 'qr_escaneado', 'confirmado')`,
          ),
        );
      expect(Number(afterCount?.count ?? 0)).toBe(2);

      // Weekly grid bookedCount reflects 2 (non-trials only).
      const weekStart = getDateForDayOfWeek(1);
      const gridRes = await app.inject({
        method: "GET",
        url: `${ADMIN_URL}/schedules/weekly?branchId=${testBranchId}&weekStart=${weekStart}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(gridRes.statusCode).toBe(200);
      const grid = JSON.parse(gridRes.body);
      const slotView = grid.slots.find(
        (s: { id: number; bookedCount: number }) => s.id === slot.id,
      );
      expect(slotView).toBeTruthy();
      expect(slotView.bookedCount).toBe(2);
      expect(slotView.trialCount).toBe(1); // 102-06: exposed alongside bookedCount
      expect(slotView.isFull).toBe(true);

      // Slot detail returns 3 bookings (2 regular + 1 trial), with isTrial flag.
      const detailRes = await app.inject({
        method: "GET",
        url: `${ADMIN_URL}/schedules/${slot.id}/detail?date=${futureSlot.date}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(detailRes.statusCode).toBe(200);
      const detail = JSON.parse(detailRes.body);
      expect(detail.bookings.length).toBe(3);
      const trialBookings = detail.bookings.filter(
        (b: { isTrial: boolean }) => b.isTrial === true,
      );
      const regularBookings = detail.bookings.filter(
        (b: { isTrial: boolean }) => b.isTrial === false,
      );
      expect(trialBookings.length).toBe(1);
      expect(regularBookings.length).toBe(2);

      // A paying member reserving on the still-full slot must be waitlisted
      // (capacity reached by non-trials; the trial didn't take a seat).
      const planRes = await app.inject({
        method: "POST",
        url: `/api/admin/subscriptions/plans`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          name: "Cap-Test Plan",
          planTier: "flex",
          bookingMode: "flexible",
          priceRegular: 10000,
          priceZero: 8000,
          durationDays: 30,
          classesPerWeek: 5,
          multiBranch: false,
        },
      });
      expect(planRes.statusCode).toBe(201);
      const plan = JSON.parse(planRes.body);

      const memberC = await registerUser(app, {
        email: "capC@test.com",
        password: "pass123456",
        branchId: testBranchId,
        dni: "60000003",
        phone: "+5491155550003",
      });
      const memberCId = (memberC.user as { id: number }).id;

      const assignRes = await app.inject({
        method: "POST",
        url: `/api/admin/subscriptions/members/${memberCId}/subscription/assign`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          planId: plan.id,
          branchId: testBranchId,
          startDate: "2026-03-01",
          priceTypeApplied: "regular",
          paymentMethod: "cash",
        },
      });
      expect(assignRes.statusCode).toBe(201);
      const subscription = JSON.parse(assignRes.body);

      await app.inject({
        method: "POST",
        url: `/api/admin/payments/members/${memberCId}/payments`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          amount: 10000,
          paymentMethod: "cash",
          paymentDate: "2026-03-10",
          subscriptionId: subscription.id,
        },
      });

      const memberCToken = await getAuthToken(
        app,
        "capC@test.com",
        "pass123456",
      );

      const reserveRes = await app.inject({
        method: "POST",
        url: `${MEMBER_URL}/reserve`,
        headers: { authorization: `Bearer ${memberCToken}` },
        payload: { scheduleId: slot.id, date: futureSlot.date },
      });
      expect(reserveRes.statusCode).toBe(201);
      expect(JSON.parse(reserveRes.body).status).toBe("lista_espera");
    } finally {
      await app.db
        .update(branches)
        .set({ maxCapacity: 22 })
        .where(eq(branches.id, testBranchId));
    }
  });

  // ─── R4: one-trial-per-user guard ──────────────────────────────────────

  it("Second trial booking for same user returns 409 with DD/MM/YYYY (R4)", async () => {
    const activity = await createActivity();
    const futureSlot = getFutureSlot();
    const slot = await createScheduleSlot(
      activity.id,
      futureSlot.dayOfWeek,
      futureSlot.startTime,
      futureSlot.endTime,
    );

    const userId = await createPruebaUser();

    const first = await app.inject({
      method: "POST",
      url: TRIALS_URL,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        userId,
        scheduleId: slot.id,
        bookingDate: futureSlot.date,
      },
    });
    expect(first.statusCode).toBe(201);

    const second = await app.inject({
      method: "POST",
      url: TRIALS_URL,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        userId,
        scheduleId: slot.id,
        bookingDate: futureSlot.date,
      },
    });
    expect(second.statusCode).toBe(409);
    const body = JSON.parse(second.body);
    const [y, m, d] = futureSlot.date.split("-");
    const expectedDate = `${d}/${m}/${y}`;
    expect(body.message).toBe(
      `El alumno ya tiene una sesión de prueba reservada para el ${expectedDate}`,
    );
  });

  // ─── 102-06: cancelled trials don't block re-creation ──────────────────

  it("Cancelling a trial booking lets the same user book a new one (102-06)", async () => {
    const activity = await createActivity();
    const futureSlot = getFutureSlot();
    // Two slots so the second booking doesn't hit the
    // (member_id, schedule_id, booking_date) unique constraint left by the
    // cancelled-but-not-deleted first booking.
    const slotA = await createScheduleSlot(
      activity.id,
      futureSlot.dayOfWeek,
      "10:00",
      "11:00",
    );
    const slotB = await createScheduleSlot(
      activity.id,
      futureSlot.dayOfWeek,
      "12:00",
      "13:00",
    );

    const userId = await createPruebaUser();

    const first = await app.inject({
      method: "POST",
      url: TRIALS_URL,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        userId,
        scheduleId: slotA.id,
        bookingDate: futureSlot.date,
      },
    });
    expect(first.statusCode).toBe(201);
    const firstBody = JSON.parse(first.body);

    const cancelRes = await app.inject({
      method: "DELETE",
      url: `${ADMIN_URL}/bookings/${firstBody.bookingId}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(cancelRes.statusCode).toBe(200);

    // Same user re-books on a different slot — cancelled trial doesn't count.
    const second = await app.inject({
      method: "POST",
      url: TRIALS_URL,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        userId,
        scheduleId: slotB.id,
        bookingDate: futureSlot.date,
      },
    });
    expect(second.statusCode).toBe(201);
  });

  // ─── 103: status guard ────────────────────────────────────────────────

  it("POST /trials returns 409 if user is not in 'prueba' state", async () => {
    const activity = await createActivity();
    const futureSlot = getFutureSlot();
    const slot = await createScheduleSlot(
      activity.id,
      futureSlot.dayOfWeek,
      futureSlot.startTime,
      futureSlot.endTime,
    );

    // Self-registered user → status='freemium', not 'prueba'.
    const reg = await registerUser(app, {
      email: "freemium-trial@test.com",
      password: "pass123456",
      branchId: testBranchId,
      dni: "60000700",
      phone: "+5491155557007",
    });
    const userId = (reg.user as { id: number }).id;

    const res = await app.inject({
      method: "POST",
      url: TRIALS_URL,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        userId,
        scheduleId: slot.id,
        bookingDate: futureSlot.date,
      },
    });
    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).message).toContain("prueba");
  });

  // ─── 165 D-03: phone guard ────────────────────────────────────────────

  it("POST /trials returns 409 (actionable) if the prueba lead has no phone", async () => {
    const activity = await createActivity();
    const futureSlot = getFutureSlot();
    const slot = await createScheduleSlot(
      activity.id,
      futureSlot.dayOfWeek,
      futureSlot.startTime,
      futureSlot.endTime,
    );

    // A legacy prueba lead with no phone on file (D-03: bookTrial must reject).
    const userId = await createPruebaUser();
    await app.db
      .update(users)
      .set({ phone: null })
      .where(eq(users.id, userId));

    const res = await app.inject({
      method: "POST",
      url: TRIALS_URL,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        userId,
        scheduleId: slot.id,
        bookingDate: futureSlot.date,
      },
    });
    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).message).toContain("teléfono");

    // No booking was created (guard runs before the tx).
    const rows = await app.db
      .select({ id: bookings.id })
      .from(bookings)
      .where(eq(bookings.memberId, userId));
    expect(rows).toHaveLength(0);
  });

  // ─── 103: branch guard ────────────────────────────────────────────────

  it("POST /trials returns 409 if user belongs to another branch", async () => {
    // Need a second branch.
    const [otherBranch] = await app.db
      .select({ id: branches.id })
      .from(branches)
      .where(and(eq(branches.isVirtual, false), sql`id != ${testBranchId}`))
      .limit(1);
    expect(otherBranch).toBeTruthy();

    const activity = await createActivity();
    const futureSlot = getFutureSlot();
    const slot = await createScheduleSlot(
      activity.id,
      futureSlot.dayOfWeek,
      futureSlot.startTime,
      futureSlot.endTime,
      testBranchId,
    );

    const userId = await createPruebaUser({ branchId: otherBranch.id });

    const res = await app.inject({
      method: "POST",
      url: TRIALS_URL,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        userId,
        scheduleId: slot.id,
        bookingDate: futureSlot.date,
      },
    });
    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).message).toContain("otra sede");
  });

  // ─── 103: 404 missing schedule ────────────────────────────────────────

  it("POST /trials returns 404 if schedule does not exist", async () => {
    const userId = await createPruebaUser();
    const res = await app.inject({
      method: "POST",
      url: TRIALS_URL,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        userId,
        scheduleId: 999999,
        bookingDate: "2026-04-01",
      },
    });
    expect(res.statusCode).toBe(404);
  });

  // ─── 103: 404 missing user ────────────────────────────────────────────

  it("POST /trials returns 404 if user does not exist", async () => {
    const activity = await createActivity();
    const futureSlot = getFutureSlot();
    const slot = await createScheduleSlot(
      activity.id,
      futureSlot.dayOfWeek,
      futureSlot.startTime,
      futureSlot.endTime,
    );
    const res = await app.inject({
      method: "POST",
      url: TRIALS_URL,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        userId: 999999,
        scheduleId: slot.id,
        bookingDate: futureSlot.date,
      },
    });
    expect(res.statusCode).toBe(404);
  });

  // ─── 103: GET /trials/eligible ────────────────────────────────────────

  it("GET /trials/eligible lists prueba users without a trial booking", async () => {
    const u1 = await createPruebaUser({ firstName: "Eligible1" });
    const u2 = await createPruebaUser({ firstName: "Eligible2" });
    const u3 = await createPruebaUser({ firstName: "AlreadyBooked" });

    // Book u3 so they become ineligible.
    const activity = await createActivity();
    const futureSlot = getFutureSlot();
    const slot = await createScheduleSlot(
      activity.id,
      futureSlot.dayOfWeek,
      futureSlot.startTime,
      futureSlot.endTime,
    );
    const bookRes = await app.inject({
      method: "POST",
      url: TRIALS_URL,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        userId: u3,
        scheduleId: slot.id,
        bookingDate: futureSlot.date,
      },
    });
    expect(bookRes.statusCode).toBe(201);

    const res = await app.inject({
      method: "GET",
      url: `${ELIGIBLE_URL}?branchId=${testBranchId}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      users: Array<{ id: number; firstName: string }>;
    };
    const ids = body.users.map((u) => u.id);
    expect(ids).toContain(u1);
    expect(ids).toContain(u2);
    expect(ids).not.toContain(u3);
  });

  it("GET /trials/eligible filters by branch", async () => {
    const [otherBranch] = await app.db
      .select({ id: branches.id })
      .from(branches)
      .where(and(eq(branches.isVirtual, false), sql`id != ${testBranchId}`))
      .limit(1);
    expect(otherBranch).toBeTruthy();

    const here = await createPruebaUser({ firstName: "InBranch" });
    const there = await createPruebaUser({
      firstName: "OtherBranch",
      branchId: otherBranch.id,
    });

    const res = await app.inject({
      method: "GET",
      url: `${ELIGIBLE_URL}?branchId=${testBranchId}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const ids = (
      JSON.parse(res.body) as { users: Array<{ id: number }> }
    ).users.map((u) => u.id);
    expect(ids).toContain(here);
    expect(ids).not.toContain(there);
  });

  it("GET /trials/eligible excludes non-prueba users (freemium/activo)", async () => {
    const reg = await registerUser(app, {
      email: "free-eligible@test.com",
      password: "pass123456",
      branchId: testBranchId,
      dni: "60000800",
      phone: "+5491155558800",
    });
    const freemiumId = (reg.user as { id: number }).id;

    const res = await app.inject({
      method: "GET",
      url: `${ELIGIBLE_URL}?branchId=${testBranchId}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const ids = (
      JSON.parse(res.body) as { users: Array<{ id: number }> }
    ).users.map((u) => u.id);
    expect(ids).not.toContain(freemiumId);
  });

  it("GET /trials/eligible includes a prueba user whose only trial already passed (re-bookable after a no-show)", async () => {
    const activity = await createActivity();
    const futureSlot = getFutureSlot();
    const slot = await createScheduleSlot(
      activity.id,
      futureSlot.dayOfWeek,
      futureSlot.startTime,
      futureSlot.endTime,
    );
    const userId = await createPruebaUser({ firstName: "PastTrial" });

    // A past-dated trial left open ('reservado') — the alumno never showed and
    // nothing closed it. Inserted directly since the API only books future
    // dates. Before the fix this hid the alumno from the picker forever.
    await app.db.insert(bookings).values({
      memberId: userId,
      scheduleId: slot.id,
      bookingDate: "2026-03-05", // past (pinned now = 2026-03-11)
      status: "reservado",
      isTrial: true,
    });

    const res = await app.inject({
      method: "GET",
      url: `${ELIGIBLE_URL}?branchId=${testBranchId}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const ids = (
      JSON.parse(res.body) as { users: Array<{ id: number }> }
    ).users.map((u) => u.id);
    expect(ids).toContain(userId);
  });

  it("POST /trials re-books a user whose previous trial passed, closing the stale one as no_show", async () => {
    const activity = await createActivity();
    const futureSlot = getFutureSlot();
    const slot = await createScheduleSlot(
      activity.id,
      futureSlot.dayOfWeek,
      futureSlot.startTime,
      futureSlot.endTime,
    );
    const userId = await createPruebaUser({ firstName: "Rebook" });

    // Stale past trial in an active status (didn't show, never closed).
    const [stale] = await app.db
      .insert(bookings)
      .values({
        memberId: userId,
        scheduleId: slot.id,
        bookingDate: "2026-03-05",
        status: "reservado",
        isTrial: true,
      })
      .$returningId();

    const res = await app.inject({
      method: "POST",
      url: TRIALS_URL,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { userId, scheduleId: slot.id, bookingDate: futureSlot.date },
    });
    expect(res.statusCode).toBe(201);

    // The stale trial is now closed as no_show.
    const [staleRow] = await app.db
      .select({ status: bookings.status })
      .from(bookings)
      .where(eq(bookings.id, stale.id));
    expect(staleRow.status).toBe("no_show");

    // Exactly one active trial remains — the freshly booked future one.
    const active = (
      await app.db
        .select({ status: bookings.status, date: bookings.bookingDate })
        .from(bookings)
        .where(and(eq(bookings.memberId, userId), eq(bookings.isTrial, true)))
    ).filter((r) => r.status === "reservado");
    expect(active).toHaveLength(1);
    expect(active[0].date).toBe(futureSlot.date);
  });

  // ─── 102-06: list trials grouped by branch ────────────────────────────

  it("GET /trials lists active trials for a date grouped by branch (102-06)", async () => {
    const activity = await createActivity();
    const futureSlot = getFutureSlot();

    // Morning slot (07:00 → TM shift) and afternoon slot (18:00 → TT shift).
    const morningSlot = await createScheduleSlot(
      activity.id,
      futureSlot.dayOfWeek,
      "07:00",
      "08:00",
    );
    const afternoonSlot = await createScheduleSlot(
      activity.id,
      futureSlot.dayOfWeek,
      "18:00",
      "19:00",
    );

    async function bookTrial(firstName: string, slotId: number): Promise<void> {
      const userId = await createPruebaUser({ firstName });
      const r = await app.inject({
        method: "POST",
        url: TRIALS_URL,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          userId,
          scheduleId: slotId,
          bookingDate: futureSlot.date,
        },
      });
      expect(r.statusCode).toBe(201);
    }
    await bookTrial("Morning", morningSlot.id);
    await bookTrial("Afternoon1", afternoonSlot.id);
    await bookTrial("Afternoon2", afternoonSlot.id);

    // Cancel one — must not appear in the listing.
    const cancelRes = await app.inject({
      method: "DELETE",
      url: `${ADMIN_URL}/bookings/${
        JSON.parse(
          (
            await app.inject({
              method: "GET",
              url: `${ADMIN_URL}/schedules/${afternoonSlot.id}/detail?date=${futureSlot.date}`,
              headers: { authorization: `Bearer ${adminToken}` },
            })
          ).body,
        ).bookings.find(
          (b: { memberName: string }) =>
            b.memberName && b.memberName.startsWith("Afternoon2 "),
        ).id
      }`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(cancelRes.statusCode).toBe(200);

    // all — returns TM (1) + TT (1 remaining after cancel) = 2 trials.
    const allRes = await app.inject({
      method: "GET",
      url: `${TRIALS_URL}?date=${futureSlot.date}&shift=all`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(allRes.statusCode).toBe(200);
    const all = JSON.parse(allRes.body);
    expect(all.date).toBe(futureSlot.date);
    expect(all.groups).toHaveLength(1); // single branch
    expect(all.groups[0].branchId).toBe(testBranchId);
    const names = all.groups[0].trials.map(
      (t: { firstName: string }) => t.firstName,
    );
    expect(names).toContain("Morning");
    expect(names).toContain("Afternoon1");
    expect(names).not.toContain("Afternoon2"); // cancelled

    // TT shift only.
    const tt = await app.inject({
      method: "GET",
      url: `${TRIALS_URL}?date=${futureSlot.date}&shift=TT`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(tt.statusCode).toBe(200);
    const ttBody = JSON.parse(tt.body);
    const ttNames = ttBody.groups[0].trials.map(
      (t: { firstName: string }) => t.firstName,
    );
    expect(ttNames).toEqual(["Afternoon1"]);
  });

  // ─── 102-07: converted_at hook ────────────────────────────────────────

  it("Assigning first plan to a lead sets users.converted_at (102-07)", async () => {
    const activity = await createActivity();
    const futureSlot = getFutureSlot();
    const slot = await createScheduleSlot(
      activity.id,
      futureSlot.dayOfWeek,
      futureSlot.startTime,
      futureSlot.endTime,
    );

    const leadUserId = await createPruebaUser({ firstName: "ConvertMe" });
    const trialRes = await app.inject({
      method: "POST",
      url: TRIALS_URL,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        userId: leadUserId,
        scheduleId: slot.id,
        bookingDate: futureSlot.date,
      },
    });
    expect(trialRes.statusCode).toBe(201);

    // converted_at starts NULL.
    const [beforeRow] = await app.db
      .select({ convertedAt: users.convertedAt })
      .from(users)
      .where(eq(users.id, leadUserId));
    expect(beforeRow.convertedAt).toBeNull();

    const planRes = await app.inject({
      method: "POST",
      url: `/api/admin/subscriptions/plans`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        name: "Convert Test Plan",
        planTier: "flex",
        bookingMode: "flexible",
        priceRegular: 10000,
        priceZero: 8000,
        // 365d so end_date stays >= MySQL's real CURDATE(); the JS-side
        // fakeTimer doesn't affect server-side CURDATE() so a 30d plan
        // would look "expired" and recomputeUserStatus would no-op.
        durationDays: 365,
        classesPerWeek: 3,
        multiBranch: false,
      },
    });
    expect(planRes.statusCode).toBe(201);
    const plan = JSON.parse(planRes.body);

    const assignRes = await app.inject({
      method: "POST",
      url: `/api/admin/subscriptions/members/${leadUserId}/subscription/assign`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        planId: plan.id,
        branchId: testBranchId,
        startDate: "2026-03-01",
        priceTypeApplied: "regular",
        paymentMethod: "cash",
      },
    });
    expect(assignRes.statusCode).toBe(201);

    const [afterRow] = await app.db
      .select({ convertedAt: users.convertedAt })
      .from(users)
      .where(eq(users.id, leadUserId));
    expect(afterRow.convertedAt).not.toBeNull();
  });

  it("GET /api/admin/reports/trial-conversion reflects converted vs pending (102-07)", async () => {
    const activity = await createActivity();
    const futureSlot = getFutureSlot();
    const slot = await createScheduleSlot(
      activity.id,
      futureSlot.dayOfWeek,
      futureSlot.startTime,
      futureSlot.endTime,
    );

    async function createAndMaybeConvert(
      firstName: string,
      convert: boolean,
    ): Promise<number> {
      const userId = await createPruebaUser({ firstName });
      const trialRes = await app.inject({
        method: "POST",
        url: TRIALS_URL,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          userId,
          scheduleId: slot.id,
          bookingDate: futureSlot.date,
        },
      });
      expect(trialRes.statusCode).toBe(201);

      if (convert) {
        const planRes = await app.inject({
          method: "POST",
          url: `/api/admin/subscriptions/plans`,
          headers: { authorization: `Bearer ${adminToken}` },
          payload: {
            name: `Conv Plan ${firstName}`,
            planTier: "flex",
            bookingMode: "flexible",
            priceRegular: 10000,
            priceZero: 8000,
            // See "Convert Test Plan" above — 365d to outlive MySQL CURDATE().
            durationDays: 365,
            classesPerWeek: 3,
            multiBranch: false,
          },
        });
        const plan = JSON.parse(planRes.body);
        const assignRes = await app.inject({
          method: "POST",
          url: `/api/admin/subscriptions/members/${userId}/subscription/assign`,
          headers: { authorization: `Bearer ${adminToken}` },
          payload: {
            planId: plan.id,
            branchId: testBranchId,
            startDate: "2026-03-01",
            priceTypeApplied: "regular",
            paymentMethod: "cash",
          },
        });
        expect(assignRes.statusCode).toBe(201);
      }
      return userId;
    }

    await createAndMaybeConvert("Converted", true);
    const pendingUserId = await createAndMaybeConvert("Pending", false);

    const res = await app.inject({
      method: "GET",
      url: `/api/admin/reports/trial-conversion`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);

    expect(body.totals.trialsCount).toBeGreaterThanOrEqual(2);
    expect(body.totals.convertedCount).toBeGreaterThanOrEqual(1);
    expect(body.totals.conversionRatePct).toBeGreaterThan(0);
    expect(body.totals.conversionRatePct).toBeLessThanOrEqual(100);

    const pendingIds = body.pendingLeads.map(
      (l: { userId: number }) => l.userId,
    );
    expect(pendingIds).toContain(pendingUserId);

    const branchRow = body.byBranch.find(
      (r: { branchId: number }) => r.branchId === testBranchId,
    );
    expect(branchRow).toBeTruthy();
    expect(branchRow.trialsCount).toBeGreaterThanOrEqual(2);
  });

  it("Assigning a plan to a non-lead leaves converted_at NULL (102-07)", async () => {
    const member = await registerUser(app, {
      email: "noleadconvert@test.com",
      password: "pass123456",
      branchId: testBranchId,
      dni: "60000500",
      phone: "+5491155559502",
    });
    const memberId = (member.user as { id: number }).id;

    const planRes = await app.inject({
      method: "POST",
      url: `/api/admin/subscriptions/plans`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        name: "Non-Lead Plan",
        planTier: "flex",
        bookingMode: "flexible",
        priceRegular: 10000,
        priceZero: 8000,
        durationDays: 30,
        classesPerWeek: 3,
        multiBranch: false,
      },
    });
    expect(planRes.statusCode).toBe(201);
    const plan = JSON.parse(planRes.body);

    const assignRes = await app.inject({
      method: "POST",
      url: `/api/admin/subscriptions/members/${memberId}/subscription/assign`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        planId: plan.id,
        branchId: testBranchId,
        startDate: "2026-03-01",
        priceTypeApplied: "regular",
        paymentMethod: "cash",
      },
    });
    expect(assignRes.statusCode).toBe(201);

    const [row] = await app.db
      .select({ convertedAt: users.convertedAt })
      .from(users)
      .where(eq(users.id, memberId));
    expect(row.convertedAt).toBeNull();
  });

  // ─── AuthZ ──────────────────────────────────────────────────────────────

  it("403 when a non-staff (member) JWT calls /trials", async () => {
    const memberReg = await registerUser(app, {
      email: "member-trial@test.com",
      password: "pass123456",
      branchId: testBranchId,
      dni: "60000099",
      phone: "+5491155559900",
    });
    const memberToken = await getAuthToken(
      app,
      "member-trial@test.com",
      "pass123456",
    );
    expect(memberReg).toBeTruthy();

    const activity = await createActivity();
    const futureSlot = getFutureSlot();
    const slot = await createScheduleSlot(
      activity.id,
      futureSlot.dayOfWeek,
      futureSlot.startTime,
      futureSlot.endTime,
    );

    const res = await app.inject({
      method: "POST",
      url: TRIALS_URL,
      headers: { authorization: `Bearer ${memberToken}` },
      payload: {
        userId: 1,
        scheduleId: slot.id,
        bookingDate: futureSlot.date,
      },
    });
    expect(res.statusCode).toBe(403);
  });

  // ─── JSON Schema validation ─────────────────────────────────────────────

  it("400 when required body fields are missing", async () => {
    const res = await app.inject({
      method: "POST",
      url: TRIALS_URL,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        userId: 1,
        // scheduleId, bookingDate missing
      },
    });
    expect(res.statusCode).toBe(400);
  });

  // Note: `additionalProperties: false` under Fastify's default AJV config
  // REMOVES extra properties silently rather than rejecting. We exercise
  // the schema's presence instead by sending a body with wrong types, which
  // must yield 400 from the validator (not reach the handler).
  it("400 on wrong field types (schema validation enforced)", async () => {
    const res = await app.inject({
      method: "POST",
      url: TRIALS_URL,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        userId: "not-a-number",
        scheduleId: 1,
        bookingDate: "2026-04-01",
      },
    });
    expect(res.statusCode).toBe(400);
  });

  // ─── Admin remove booking — no_show path ────────────────────────────────

  it("DELETE /admin/scheduling/bookings/:id cancels a no_show trial so the alumno can be reassigned", async () => {
    const activity = await createActivity();
    const futureSlot = getFutureSlot();
    const slot = await createScheduleSlot(
      activity.id,
      futureSlot.dayOfWeek,
      futureSlot.startTime,
      futureSlot.endTime,
    );

    const userId = await createPruebaUser();

    // 1) Book a trial.
    const bookRes = await app.inject({
      method: "POST",
      url: TRIALS_URL,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        userId,
        scheduleId: slot.id,
        bookingDate: futureSlot.date,
      },
    });
    expect(bookRes.statusCode).toBe(201);
    const { bookingId } = JSON.parse(bookRes.body) as { bookingId: number };

    // 2) Simulate the booking ending up in 'no_show' (background job or
    //    manual transition — irrelevant to the fix, only the status matters).
    await app.db
      .update(bookings)
      .set({ status: "no_show" })
      .where(eq(bookings.id, bookingId));

    // 3) Admin removes the booking.
    const delRes = await app.inject({
      method: "DELETE",
      url: `${ADMIN_URL}/bookings/${bookingId}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(delRes.statusCode).toBe(200);

    // 4) The booking is now status='cancelado' (was 'no_show' before).
    const [row] = await app.db
      .select({ status: bookings.status })
      .from(bookings)
      .where(eq(bookings.id, bookingId));
    expect(row.status).toBe("cancelado");

    // 5) The alumno is now eligible for a new trial (priorTrial guard
    //    excludes cancelled rows).
    const reAssignRes = await app.inject({
      method: "POST",
      url: TRIALS_URL,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        userId,
        scheduleId: slot.id,
        bookingDate: futureSlot.date,
      },
    });
    expect(reAssignRes.statusCode).toBe(201);
  });
});
