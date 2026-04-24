/**
 * Phase 102 Plan 02: Trial endpoint integration tests.
 *
 * Covers requirements:
 *   R2  — Trial bookings do NOT consume schedule capacity.
 *   R3  — POST /api/admin/scheduling/trials creates a user (email=null) and
 *         a booking (is_trial=true) atomically.
 *   R4  — Second trial for the same phone → 409 with Spanish DD/MM/YYYY msg.
 *   Plus: no-orphan-user on guard rejection (404 + 409 paths), 403 for
 *   non-staff JWTs, 400 for missing body fields.
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
import { schedules } from "../../src/db/schema/schedules";
import { activities } from "../../src/db/schema/activities";
import { users } from "../../src/db/schema/users";
import { branches } from "../../src/db/schema/branches";

const ADMIN_URL = "/api/admin/scheduling";
const MEMBER_URL = "/api/members/scheduling";
const TRIALS_URL = `${ADMIN_URL}/trials`;

describe("Scheduling Trials API (Phase 102 Plan 02)", () => {
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

  async function countUsersByPhone(phone: string): Promise<number> {
    const [row] = await app.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(users)
      .where(eq(users.phone, phone));
    return Number(row?.count ?? 0);
  }

  // ─── R3: happy path ─────────────────────────────────────────────────────

  it("POST /trials creates user with null email + booking is_trial=true (R3)", async () => {
    const activity = await createActivity();
    const futureSlot = getFutureSlot();
    const slot = await createScheduleSlot(
      activity.id,
      futureSlot.dayOfWeek,
      futureSlot.startTime,
      futureSlot.endTime,
    );

    const phone = "+5491155551001";
    const res = await app.inject({
      method: "POST",
      url: TRIALS_URL,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        firstName: "Juan",
        lastName: "Pérez",
        phone,
        branchId: testBranchId,
        scheduleId: slot.id,
        bookingDate: futureSlot.date,
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.userId).toBeTruthy();
    expect(body.bookingId).toBeTruthy();

    // DB assertion: user row has null email and the correct phone.
    const [userRow] = await app.db
      .select({
        id: users.id,
        email: users.email,
        phone: users.phone,
        firstName: users.firstName,
        lastName: users.lastName,
        level: users.level,
        role: users.role,
        isActive: users.isActive,
        branchId: users.branchId,
      })
      .from(users)
      .where(eq(users.id, body.userId));
    expect(userRow).toBeTruthy();
    expect(userRow.email).toBeNull();
    expect(userRow.phone).toBe(phone);
    expect(userRow.firstName).toBe("Juan");
    expect(userRow.lastName).toBe("Pérez");
    expect(userRow.level).toBe("alfa");
    expect(userRow.role).toBe("member");
    expect(Boolean(userRow.isActive)).toBe(true);
    expect(userRow.branchId).toBe(testBranchId);

    // DB assertion: booking row has is_trial=1, status=reservado.
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
    expect(bookingRow.memberId).toBe(body.userId);
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
      const trialRes = await app.inject({
        method: "POST",
        url: TRIALS_URL,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          firstName: "Lead",
          lastName: "Prospecto",
          phone: "+5491155559999",
          branchId: testBranchId,
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
      // Use setupMemberWithSubscription pattern: create plan + member + sub.
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

  // ─── R4: one-per-phone guard + DD/MM/YYYY ───────────────────────────────

  it("Second trial for same phone returns 409 with DD/MM/YYYY Spanish message (R4)", async () => {
    const activity = await createActivity();
    const futureSlot = getFutureSlot();
    const slot = await createScheduleSlot(
      activity.id,
      futureSlot.dayOfWeek,
      futureSlot.startTime,
      futureSlot.endTime,
    );

    const phone = "+5491155552001";

    // First trial — success.
    const first = await app.inject({
      method: "POST",
      url: TRIALS_URL,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        firstName: "Juan",
        lastName: "Pérez",
        phone,
        branchId: testBranchId,
        scheduleId: slot.id,
        bookingDate: futureSlot.date,
      },
    });
    expect(first.statusCode).toBe(201);

    // Second trial — 409, exact Spanish message with DD/MM/YYYY.
    const second = await app.inject({
      method: "POST",
      url: TRIALS_URL,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        firstName: "Juan",
        lastName: "Pérez",
        phone,
        branchId: testBranchId,
        scheduleId: slot.id,
        bookingDate: futureSlot.date,
      },
    });
    expect(second.statusCode).toBe(409);
    const body = JSON.parse(second.body);
    const [y, m, d] = futureSlot.date.split("-");
    const expectedDate = `${d}/${m}/${y}`;
    expect(body.message).toBe(
      `Esta persona ya tuvo una sesión de prueba el ${expectedDate}`,
    );
  });

  // ─── 102-06: cancelled trials don't block re-creation ──────────────────

  it("Cancelling a trial booking frees the phone for a new trial (102-06)", async () => {
    const activity = await createActivity();
    const futureSlot = getFutureSlot();
    const slot = await createScheduleSlot(
      activity.id,
      futureSlot.dayOfWeek,
      futureSlot.startTime,
      futureSlot.endTime,
    );

    const phone = "+5491155557001";

    // First trial — success.
    const first = await app.inject({
      method: "POST",
      url: TRIALS_URL,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        firstName: "Juan",
        lastName: "Pérez",
        phone,
        branchId: testBranchId,
        scheduleId: slot.id,
        bookingDate: futureSlot.date,
      },
    });
    expect(first.statusCode).toBe(201);
    const firstBody = JSON.parse(first.body);

    // Admin cancels the trial booking.
    const cancelRes = await app.inject({
      method: "DELETE",
      url: `${ADMIN_URL}/bookings/${firstBody.bookingId}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(cancelRes.statusCode).toBe(200);

    // Second trial for the same phone — must succeed (cancelled doesn't count).
    // Note: a new user row is created because we match on phone, and the
    // prior user still exists with that phone. That's acceptable; the guard
    // is "one active trial at a time", not "one lead row per phone ever".
    const second = await app.inject({
      method: "POST",
      url: TRIALS_URL,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        firstName: "Juan",
        lastName: "Pérez",
        phone,
        branchId: testBranchId,
        scheduleId: slot.id,
        bookingDate: futureSlot.date,
      },
    });
    expect(second.statusCode).toBe(201);
  });

  // ─── Atomicity: no orphan user on guard rejection ───────────────────────

  it("404 on missing scheduleId creates no user row (no-orphan-user)", async () => {
    const phone = "+5491155553001";
    const before = await countUsersByPhone(phone);

    const res = await app.inject({
      method: "POST",
      url: TRIALS_URL,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        firstName: "Orphan",
        lastName: "Check",
        phone,
        branchId: testBranchId,
        scheduleId: 999999,
        bookingDate: "2026-04-01",
      },
    });
    expect(res.statusCode).toBe(404);

    const after = await countUsersByPhone(phone);
    expect(after).toBe(before);
  });

  it("409 duplicate-phone creates no extra user row (no-orphan-user)", async () => {
    const activity = await createActivity();
    const futureSlot = getFutureSlot();
    const slot = await createScheduleSlot(
      activity.id,
      futureSlot.dayOfWeek,
      futureSlot.startTime,
      futureSlot.endTime,
    );

    const phone = "+5491155554001";

    // First trial — success.
    const first = await app.inject({
      method: "POST",
      url: TRIALS_URL,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        firstName: "First",
        lastName: "Try",
        phone,
        branchId: testBranchId,
        scheduleId: slot.id,
        bookingDate: futureSlot.date,
      },
    });
    expect(first.statusCode).toBe(201);

    const before = await countUsersByPhone(phone);
    expect(before).toBe(1);

    // Second trial — 409, must NOT create a new user row.
    const second = await app.inject({
      method: "POST",
      url: TRIALS_URL,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        firstName: "Second",
        lastName: "Try",
        phone,
        branchId: testBranchId,
        scheduleId: slot.id,
        bookingDate: futureSlot.date,
      },
    });
    expect(second.statusCode).toBe(409);

    const after = await countUsersByPhone(phone);
    expect(after).toBe(1);
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

    // Two trials in the afternoon, one in the morning.
    async function create(
      phone: string,
      firstName: string,
      slotId: number,
    ): Promise<void> {
      const r = await app.inject({
        method: "POST",
        url: TRIALS_URL,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          firstName,
          lastName: "Test",
          phone,
          branchId: testBranchId,
          scheduleId: slotId,
          bookingDate: futureSlot.date,
        },
      });
      expect(r.statusCode).toBe(201);
    }
    await create("+5491155558001", "Morning", morningSlot.id);
    await create("+5491155558002", "Afternoon1", afternoonSlot.id);
    await create("+5491155558003", "Afternoon2", afternoonSlot.id);

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
          (b: { memberName: string }) => b.memberName === "Afternoon2 Test",
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

  // ─── AuthZ ──────────────────────────────────────────────────────────────

  it("403 when a non-staff (member) JWT calls /trials", async () => {
    // Register a plain member user.
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
        firstName: "Nope",
        lastName: "NotAllowed",
        phone: "+5491155559901",
        branchId: testBranchId,
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
        firstName: "Only",
        // lastName, phone, branchId, scheduleId, bookingDate missing
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
        firstName: "Bob",
        lastName: "Smith",
        phone: "+54911",
        branchId: "not-a-number",
        scheduleId: 1,
        bookingDate: "2026-04-01",
      },
    });
    expect(res.statusCode).toBe(400);
  });
});
