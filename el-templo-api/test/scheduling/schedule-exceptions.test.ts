/**
 * Per-date schedule cancellation (schedule_exceptions).
 *
 * Covers the cancel-one-occurrence flow: POST /schedules/:id/cancel-date
 * cancels a single date of a recurring slot (bookings + credits) without
 * deactivating the template, DELETE /schedules/:id/cancel-date/:date undoes
 * it, and the member/admin grids + booking guards respect the exception.
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
import { eq, and } from "drizzle-orm";
import {
  createTestApp,
  getAuthToken,
  registerUser,
  cleanAllTestData,
  dateOffsetStr,
} from "../helpers";
import { bookings } from "../../src/db/schema/bookings";
import { schedules } from "../../src/db/schema/schedules";
import { scheduleExceptions } from "../../src/db/schema/schedule-exceptions";
import { subscriptions } from "../../src/db/schema/subscriptions";
import { financialTransactions } from "../../src/db/schema/financial-transactions";
import { transactionLinks } from "../../src/db/schema/transaction-links";
import { TENANT_TEMPLO } from "../fixtures/second-tenant";
import { tenantValues } from "../../src/modules/shared/tenant";

/**
 * Fase 172: `finance` entra en `TENANT_STRICT_MODULES`. El seed de cobro de
 * este archivo estampa el gimnasio explicito en vez de depender del `DEFAULT 1`
 * de la columna `tenant_id`.
 */
const TEMPLO_CTX = { tenantId: TENANT_TEMPLO };
import { users } from "../../src/db/schema/users";
import { branches } from "../../src/db/schema/branches";

const ADMIN_URL = "/api/admin/scheduling";
const MEMBER_URL = "/api/members/scheduling";
const SUBSCRIPTIONS_URL = "/api/admin/subscriptions";

describe("Schedule Exceptions (cancel single date)", () => {
  let app: FastifyInstance;
  let adminToken: string;
  let adminUserId: number;
  let testBranchId: number;

  // Pinned to Wednesday 2026-03-11 10:00 UTC (07:00 ART) — same convention
  // as scheduling.test.ts. This week's Friday is 2026-03-13 (inside the +2d
  // member booking window), next Friday is 2026-03-20, last Friday 2026-03-06.
  const FRIDAY = 5;
  const THIS_FRIDAY = "2026-03-13";
  const NEXT_FRIDAY = "2026-03-20";
  const PAST_FRIDAY = "2026-03-06";
  const THIS_MONDAY = "2026-03-09";
  const NEXT_MONDAY = "2026-03-16";

  const basePlan = {
    name: "Plan Exceptions Test",
    planTier: "flex",
    bookingMode: "flexible",
    priceRegular: 15000,
    priceZero: 10000,
    durationDays: 30,
    classesPerWeek: 3,
    multiBranch: false,
  };

  beforeAll(async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-03-11T10:00:00Z")); // Wednesday

    app = await createTestApp();
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");

    const [adminUser] = await app.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, "admin@test.com"));
    adminUserId = adminUser.id;

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

  // ─── Helpers ──────────────────────────────────────────────────────────────

  async function createPlan(
    overrides: Record<string, unknown> = {},
  ): Promise<{ id: number }> {
    const res = await app.inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}/plans`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { ...basePlan, ...overrides },
    });
    expect(res.statusCode).toBe(201);
    return JSON.parse(res.body);
  }

  async function createMember(
    email: string,
    dni: string,
  ): Promise<{ id: number }> {
    const result = await registerUser(app, {
      email,
      password: "pass123456",
      firstName: "Exception",
      lastName: "Tester",
      branchId: testBranchId,
      dni,
    });
    return { id: (result.user as { id: number }).id };
  }

  async function recordPayment(
    userId: number,
    subscriptionId: number,
  ): Promise<void> {
    const [inserted] = await app.db.insert(financialTransactions).values(
      tenantValues(TEMPLO_CTX, {
        memberId: userId,
        kind: "plan_charge",
        direction: "inflow",
        amount: basePlan.priceRegular,
        currency: "ARS",
        paymentMethod: "cash",
        transactionDate: "2026-03-10",
        effectiveDate: "2026-03-10",
        branchId: testBranchId,
        recordedBy: adminUserId,
      }),
    );
    const txnId = (inserted as { insertId: number }).insertId;
    await app.db.insert(transactionLinks).values(
      tenantValues(TEMPLO_CTX, {
        transactionId: txnId,
        targetKind: "subscription",
        targetId: subscriptionId,
        allocatedAmount: basePlan.priceRegular,
      }),
    );
  }

  /** Flexible-plan member with paid active subscription + auth token. */
  async function setupFlexibleMember(
    email: string,
    dni: string,
  ): Promise<{ memberId: number; memberToken: string }> {
    const plan = await createPlan({ name: `Flex ${dni}` });
    const member = await createMember(email, dni);
    const assignRes = await app.inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription/assign`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        planId: plan.id,
        branchId: testBranchId,
        startDate: dateOffsetStr(-25),
        priceTypeApplied: "regular",
        paymentMethod: "cash",
      },
    });
    expect(assignRes.statusCode).toBe(201);
    const subscription = JSON.parse(assignRes.body);
    await recordPayment(member.id, subscription.id);
    const memberToken = await getAuthToken(app, email, "pass123456");
    return { memberId: member.id, memberToken };
  }

  async function createFridaySlot(activityName: string): Promise<number> {
    const actRes = await app.inject({
      method: "POST",
      url: `${ADMIN_URL}/activities`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: activityName, description: "test" },
    });
    expect(actRes.statusCode).toBe(201);
    const activity = JSON.parse(actRes.body);

    const [slotRow] = await app.db
      .insert(schedules)
      .values({
        branchId: testBranchId,
        activityId: activity.id,
        dayOfWeek: FRIDAY,
        startTime: "20:00",
        endTime: "21:00",
        isActive: true,
      })
      .$returningId();
    return slotRow.id;
  }

  async function cancelDate(
    scheduleId: number,
    date: string,
    reason?: string | null,
  ) {
    return app.inject({
      method: "POST",
      url: `${ADMIN_URL}/schedules/${scheduleId}/cancel-date`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { date, reason: reason ?? null },
    });
  }

  // ─── Cancel one occurrence ────────────────────────────────────────────────

  it("cancels only that date's bookings, keeps the template active", async () => {
    const { memberToken } = await setupFlexibleMember(
      "exc-cancel@test.com",
      "71030001",
    );
    const scheduleId = await createFridaySlot("ExcCancelAct");

    const reserveRes = await app.inject({
      method: "POST",
      url: `${MEMBER_URL}/reserve`,
      headers: { authorization: `Bearer ${memberToken}` },
      payload: { scheduleId, date: THIS_FRIDAY },
    });
    expect(reserveRes.statusCode).toBe(201);
    const booking = JSON.parse(reserveRes.body);

    const res = await cancelDate(scheduleId, THIS_FRIDAY, "Mantenimiento");
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.exceptionDate).toBe(THIS_FRIDAY);
    expect(body.cancelledBookings).toBe(1);
    expect(body.creditsGranted).toBe(0); // flexible plan: no credits

    // The booking for that date is cancelled...
    const [bookingRow] = await app.db
      .select({ status: bookings.status })
      .from(bookings)
      .where(eq(bookings.id, booking.id));
    expect(bookingRow.status).toBe("cancelado");

    // ...but the recurring template stays ACTIVE (this is the whole point —
    // the toggle flow would have flipped isActive=false for every week).
    const [scheduleRow] = await app.db
      .select({ isActive: schedules.isActive })
      .from(schedules)
      .where(eq(schedules.id, scheduleId));
    expect(scheduleRow.isActive).toBe(true);
  });

  it("hides the slot-date from the member grid but keeps other weeks visible", async () => {
    const { memberToken } = await setupFlexibleMember(
      "exc-grid@test.com",
      "71030002",
    );
    const scheduleId = await createFridaySlot("ExcGridAct");

    const res = await cancelDate(scheduleId, THIS_FRIDAY, "Evento privado");
    expect(res.statusCode).toBe(200);

    // Member grid this week: the slot is gone.
    const thisWeek = await app.inject({
      method: "GET",
      url: `${MEMBER_URL}/weekly?weekStart=${THIS_MONDAY}`,
      headers: { authorization: `Bearer ${memberToken}` },
    });
    expect(thisWeek.statusCode).toBe(200);
    const thisWeekSlots = JSON.parse(thisWeek.body).slots as Array<{
      id: number;
    }>;
    expect(thisWeekSlots.find((s) => s.id === scheduleId)).toBeUndefined();

    // Member grid next week: the slot is back (exception is date-scoped).
    const nextWeek = await app.inject({
      method: "GET",
      url: `${MEMBER_URL}/weekly?weekStart=${NEXT_MONDAY}`,
      headers: { authorization: `Bearer ${memberToken}` },
    });
    expect(nextWeek.statusCode).toBe(200);
    const nextWeekSlots = JSON.parse(nextWeek.body).slots as Array<{
      id: number;
      cancelledForDate: boolean;
    }>;
    const nextWeekSlot = nextWeekSlots.find((s) => s.id === scheduleId);
    expect(nextWeekSlot).toBeDefined();
    expect(nextWeekSlot?.cancelledForDate).toBe(false);

    // Admin grid this week: slot present, flagged with the reason.
    const adminGrid = await app.inject({
      method: "GET",
      url: `${ADMIN_URL}/schedules/weekly?branchId=${testBranchId}&weekStart=${THIS_MONDAY}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(adminGrid.statusCode).toBe(200);
    const adminSlots = JSON.parse(adminGrid.body).slots as Array<{
      id: number;
      isActive: boolean;
      cancelledForDate: boolean;
      exceptionReason: string | null;
    }>;
    const adminSlot = adminSlots.find((s) => s.id === scheduleId);
    expect(adminSlot).toBeDefined();
    expect(adminSlot?.isActive).toBe(true);
    expect(adminSlot?.cancelledForDate).toBe(true);
    expect(adminSlot?.exceptionReason).toBe("Evento privado");
  });

  it("blocks member reservations and admin adds on the cancelled date", async () => {
    const { memberId, memberToken } = await setupFlexibleMember(
      "exc-block@test.com",
      "71030003",
    );
    const scheduleId = await createFridaySlot("ExcBlockAct");

    const res = await cancelDate(scheduleId, THIS_FRIDAY, "Cerrado por obra");
    expect(res.statusCode).toBe(200);

    // Member reserve → 400 carrying the admin's reason.
    const reserveRes = await app.inject({
      method: "POST",
      url: `${MEMBER_URL}/reserve`,
      headers: { authorization: `Bearer ${memberToken}` },
      payload: { scheduleId, date: THIS_FRIDAY },
    });
    expect(reserveRes.statusCode).toBe(400);
    expect(JSON.parse(reserveRes.body).message).toBe("Cerrado por obra");

    // Admin add booking → 409.
    const adminAddRes = await app.inject({
      method: "POST",
      url: `${ADMIN_URL}/bookings`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { scheduleId, memberId, date: THIS_FRIDAY },
    });
    expect(adminAddRes.statusCode).toBe(409);
  });

  it("surfaces the exception in slot detail", async () => {
    const scheduleId = await createFridaySlot("ExcDetailAct");
    const res = await cancelDate(scheduleId, THIS_FRIDAY, "Feriado puente");
    expect(res.statusCode).toBe(200);

    const detailRes = await app.inject({
      method: "GET",
      url: `${ADMIN_URL}/schedules/${scheduleId}/detail?date=${THIS_FRIDAY}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(detailRes.statusCode).toBe(200);
    const detail = JSON.parse(detailRes.body);
    expect(detail.cancelledForDate).toBe(true);
    expect(detail.exceptionReason).toBe("Feriado puente");
    expect(detail.exceptionCreatedAt).toBeTruthy();

    // Another date of the same slot is unaffected.
    const otherRes = await app.inject({
      method: "GET",
      url: `${ADMIN_URL}/schedules/${scheduleId}/detail?date=${NEXT_FRIDAY}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(otherRes.statusCode).toBe(200);
    const other = JSON.parse(otherRes.body);
    expect(other.cancelledForDate).toBe(false);
    expect(other.exceptionCreatedAt).toBeNull();
  });

  // ─── Validation ───────────────────────────────────────────────────────────

  it("rejects duplicates, wrong day, past dates, inactive slots and unknown schedules", async () => {
    const scheduleId = await createFridaySlot("ExcValAct");

    // First cancel OK, duplicate → 409.
    expect((await cancelDate(scheduleId, THIS_FRIDAY)).statusCode).toBe(200);
    expect((await cancelDate(scheduleId, THIS_FRIDAY)).statusCode).toBe(409);

    // Date not matching the slot's dayOfWeek (2026-03-12 is a Thursday) → 400.
    expect((await cancelDate(scheduleId, "2026-03-12")).statusCode).toBe(400);

    // Past occurrence → 400.
    expect((await cancelDate(scheduleId, PAST_FRIDAY)).statusCode).toBe(400);

    // Unknown schedule → 404.
    expect((await cancelDate(999999, NEXT_FRIDAY)).statusCode).toBe(404);

    // Deactivated template → 400 (per-date exception is meaningless there).
    await app.db
      .update(schedules)
      .set({ isActive: false })
      .where(eq(schedules.id, scheduleId));
    expect((await cancelDate(scheduleId, NEXT_FRIDAY)).statusCode).toBe(400);
  });

  // ─── Restore ──────────────────────────────────────────────────────────────

  it("restore removes the exception, restores its bookings and re-opens reservations", async () => {
    const { memberToken } = await setupFlexibleMember(
      "exc-restore@test.com",
      "71030004",
    );
    const scheduleId = await createFridaySlot("ExcRestoreAct");

    const reserveRes = await app.inject({
      method: "POST",
      url: `${MEMBER_URL}/reserve`,
      headers: { authorization: `Bearer ${memberToken}` },
      payload: { scheduleId, date: THIS_FRIDAY },
    });
    expect(reserveRes.statusCode).toBe(201);
    const booking = JSON.parse(reserveRes.body);

    expect((await cancelDate(scheduleId, THIS_FRIDAY)).statusCode).toBe(200);

    const restoreRes = await app.inject({
      method: "DELETE",
      url: `${ADMIN_URL}/schedules/${scheduleId}/cancel-date/${THIS_FRIDAY}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(restoreRes.statusCode).toBe(200);
    const restoreBody = JSON.parse(restoreRes.body);
    expect(restoreBody.restored).toBe(true);
    expect(restoreBody.restoredBookings).toBe(1);

    // Booking is back to reservado.
    const [bookingRow] = await app.db
      .select({ status: bookings.status })
      .from(bookings)
      .where(eq(bookings.id, booking.id));
    expect(bookingRow.status).toBe("reservado");

    // Exception row is gone; restoring again → 404.
    const [exceptionRow] = await app.db
      .select({ id: scheduleExceptions.id })
      .from(scheduleExceptions)
      .where(
        and(
          eq(scheduleExceptions.scheduleId, scheduleId),
          eq(scheduleExceptions.exceptionDate, THIS_FRIDAY),
        ),
      );
    expect(exceptionRow).toBeUndefined();
    const again = await app.inject({
      method: "DELETE",
      url: `${ADMIN_URL}/schedules/${scheduleId}/cancel-date/${THIS_FRIDAY}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(again.statusCode).toBe(404);
  });

  it("restore does NOT resurrect member-initiated cancellations from before the exception", async () => {
    const { memberToken } = await setupFlexibleMember(
      "exc-norestore@test.com",
      "71030005",
    );
    const scheduleId = await createFridaySlot("ExcNoRestoreAct");

    const reserveRes = await app.inject({
      method: "POST",
      url: `${MEMBER_URL}/reserve`,
      headers: { authorization: `Bearer ${memberToken}` },
      payload: { scheduleId, date: THIS_FRIDAY },
    });
    expect(reserveRes.statusCode).toBe(201);
    const booking = JSON.parse(reserveRes.body);

    // Member cancels their own booking BEFORE the exception exists.
    const cancelOwn = await app.inject({
      method: "DELETE",
      url: `${MEMBER_URL}/bookings/${booking.id}`,
      headers: { authorization: `Bearer ${memberToken}` },
    });
    expect(cancelOwn.statusCode).toBe(200);

    // Advance the (faked) clock past MySQL's 1s timestamp resolution so the
    // member's cancelledAt is strictly before the exception's createdAt.
    //
    // El salto es RELATIVO al ahora del reloj falso, nunca a un instante fijo:
    // useFakeTimers corre con shouldAdvanceTime, así que el reloj avanza con el
    // tiempo real desde el beforeAll. Con un destino absoluto ("10:00:10"), un
    // runner lento que tarde más de 10 s en llegar hasta acá convierte el
    // avance en un RETROCESO — cancelledAt queda DESPUÉS del createdAt de la
    // excepción, el restore la resucita y el test falla. Pasó en CI de staging
    // el 2026-07-29 (verde en master, rojo en staging, mismo commit).
    vi.setSystemTime(new Date(Date.now() + 10_000));

    expect((await cancelDate(scheduleId, THIS_FRIDAY)).statusCode).toBe(200);

    const restoreRes = await app.inject({
      method: "DELETE",
      url: `${ADMIN_URL}/schedules/${scheduleId}/cancel-date/${THIS_FRIDAY}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(restoreRes.statusCode).toBe(200);
    expect(JSON.parse(restoreRes.body).restoredBookings).toBe(0);

    const [bookingRow] = await app.db
      .select({ status: bookings.status })
      .from(bookings)
      .where(eq(bookings.id, booking.id));
    expect(bookingRow.status).toBe("cancelado");
  });

  // ─── Fixed-plan credits ───────────────────────────────────────────────────

  it("grants +1 replacement credit to fixed-plan members, only for that date", async () => {
    const plan = await createPlan({
      name: "Fixed Exception Plan",
      bookingMode: "fixed",
      classesPerWeek: 1,
      durationDays: 60,
    });
    const member = await createMember("exc-fixed@test.com", "71030006");
    const scheduleId = await createFridaySlot("ExcFixedAct");

    const assignRes = await app.inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription/assign`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        planId: plan.id,
        branchId: testBranchId,
        startDate: dateOffsetStr(-25),
        priceTypeApplied: "regular",
        paymentMethod: "cash",
        scheduleIds: [scheduleId],
        priceOverrideAmount: 0,
        priceOverrideReason: "test no-charge",
      },
    });
    expect(assignRes.statusCode).toBe(201);
    const subscription = JSON.parse(assignRes.body);

    // Fixed generation created one booking per future Friday.
    const before = await app.db
      .select({ bookingDate: bookings.bookingDate, status: bookings.status })
      .from(bookings)
      .where(eq(bookings.memberId, member.id));
    expect(
      before.some(
        (b) => b.bookingDate === THIS_FRIDAY && b.status === "reservado",
      ),
    ).toBe(true);
    expect(
      before.some(
        (b) => b.bookingDate === NEXT_FRIDAY && b.status === "reservado",
      ),
    ).toBe(true);

    const res = await cancelDate(scheduleId, THIS_FRIDAY, "Cerrado");
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.cancelledBookings).toBe(1);
    expect(body.affectedFixedMembers).toBe(1);
    expect(body.creditsGranted).toBe(1);

    // Only THIS_FRIDAY's booking was cancelled; next week's survives.
    const after = await app.db
      .select({ bookingDate: bookings.bookingDate, status: bookings.status })
      .from(bookings)
      .where(eq(bookings.memberId, member.id));
    expect(after.find((b) => b.bookingDate === THIS_FRIDAY)?.status).toBe(
      "cancelado",
    );
    expect(after.find((b) => b.bookingDate === NEXT_FRIDAY)?.status).toBe(
      "reservado",
    );

    const [subRow] = await app.db
      .select({ replacementCredits: subscriptions.replacementCredits })
      .from(subscriptions)
      .where(eq(subscriptions.id, subscription.id));
    expect(subRow.replacementCredits).toBe(1);
  });
});
