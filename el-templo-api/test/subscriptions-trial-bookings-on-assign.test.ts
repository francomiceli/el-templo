/**
 * SP pendiente al cargar la primera membresía (2026-10-01, caso Sofía Santana):
 * ver src/modules/subscriptions/trial-bookings-on-assign.ts.
 *
 * Un lead en 'prueba' con su Sesión de Prueba agendada a futuro recibe una
 * membresía antes de esa fecha. assignPlan resuelve la SP (pasa a reserva del
 * plan o se cancela), deja rastro en audit_log y lo devuelve en
 * `trialBookings` para avisarle a gestión.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import {
  createTestApp,
  getAuthToken,
  cleanAllTestData,
  todayStr,
} from "./helpers";
import { users } from "../src/db/schema/users";
import { bookings } from "../src/db/schema/bookings";
import { schedules } from "../src/db/schema/schedules";
import { activities } from "../src/db/schema/activities";
import { subscriptionPlans } from "../src/db/schema/subscription-plans";
import { auditLog } from "../src/db/schema/audit-log";
import { tenantWhere } from "../src/modules/shared/tenant";
import { TENANT_TEMPLO } from "./fixtures/second-tenant";

const TEMPLO_CTX = { tenantId: TENANT_TEMPLO };
const BRANCH_ID = 1; // seeded by test setup

interface TrialBookingChangeBody {
  bookingId: number;
  date: string;
  startTime: string;
  activityName: string;
  branchName: string;
  outcome: "converted" | "cancelled" | "kept";
  reason: string | null;
}

/** Plain date-shifter (date-only fields, aritmética UTC). */
function shiftDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0];
}

/** Día ISO (1=lunes … 7=domingo) de una fecha YYYY-MM-DD. */
function isoDow(iso: string): number {
  const day = new Date(`${iso}T12:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

/** Fecha a futuro (>= 3 días) que no cae domingo — la grilla es lun-sáb. */
function futureWeekday(minOffset: number): string {
  let date = shiftDays(todayStr(), minOffset);
  if (isoDow(date) === 7) date = shiftDays(date, 1);
  return date;
}

describe("SP pendiente al cargar la membresía (trial-bookings-on-assign)", () => {
  let app: FastifyInstance;
  let adminToken: string;
  let activityId: number;
  let flexPlanId: number;
  let fixedPlanId: number;
  let leadSeq = 0;

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);

    const [actRow] = await app.db
      .insert(activities)
      .values({ name: "Calistenia SP Assign" })
      .$returningId();
    activityId = actRow.id;

    const [flexRow] = await app.db
      .insert(subscriptionPlans)
      .values({
        name: "Flex SP Assign",
        planTier: "flex",
        bookingMode: "flexible",
        planCategory: "presencial",
        priceRegular: 10000,
        priceZero: 0,
        durationDays: 30,
        classesPerWeek: 3,
      })
      .$returningId();
    flexPlanId = flexRow.id;

    const [fixedRow] = await app.db
      .insert(subscriptionPlans)
      .values({
        name: "Fijo SP Assign",
        planTier: "foundation",
        bookingMode: "fixed",
        planCategory: "presencial",
        priceRegular: 10000,
        priceZero: 0,
        durationDays: 30,
        classesPerWeek: 1,
      })
      .$returningId();
    fixedPlanId = fixedRow.id;
  });

  // ─── Helpers ────────────────────────────────────────────────────────────

  async function createSchedule(
    dayOfWeek: number,
    startTime: string,
  ): Promise<number> {
    const endHour = String(Number(startTime.slice(0, 2)) + 1).padStart(2, "0");
    const [row] = await app.db
      .insert(schedules)
      .values({
        activityId,
        branchId: BRANCH_ID,
        dayOfWeek,
        startTime,
        endTime: `${endHour}:00`,
        isActive: true,
      })
      .$returningId();
    return row.id;
  }

  async function createTrialLead(): Promise<number> {
    leadSeq += 1;
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/members/trial",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        firstName: "Sofia",
        lastName: `SP${leadSeq}`,
        phone: `11410000${String(leadSeq).padStart(2, "0")}`,
        branchId: BRANCH_ID,
      },
    });
    expect(res.statusCode).toBe(201);
    return (JSON.parse(res.body) as { id: number }).id;
  }

  async function seedBooking(
    userId: number,
    scheduleId: number,
    bookingDate: string,
    isTrial: boolean,
    status: "reservado" | "confirmado" = "reservado",
  ): Promise<number> {
    const [row] = await app.db
      .insert(bookings)
      .values({ memberId: userId, scheduleId, bookingDate, status, isTrial })
      .$returningId();
    return row.id;
  }

  async function assign(
    userId: number,
    planId: number,
    extra: { startDate?: string; scheduleIds?: number[] } = {},
  ) {
    const res = await app.inject({
      method: "POST",
      url: `/api/admin/subscriptions/members/${userId}/subscription/assign`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        planId,
        branchId: BRANCH_ID,
        // Ayer, no hoy: el plan tiene que estar vigente tanto para node (UTC)
        // como para el CURDATE() de MySQL, que local puede estar en hora AR.
        startDate: extra.startDate ?? shiftDays(todayStr(), -1),
        priceTypeApplied: "regular",
        paymentMethod: "cash",
        ...(extra.scheduleIds ? { scheduleIds: extra.scheduleIds } : {}),
      },
    });
    expect(res.statusCode, res.body).toBe(201);
    return JSON.parse(res.body) as { trialBookings?: TrialBookingChangeBody[] };
  }

  async function readBooking(id: number) {
    const [row] = await app.db
      .select({ isTrial: bookings.isTrial, status: bookings.status })
      .from(bookings)
      .where(and(tenantWhere(bookings, TEMPLO_CTX), eq(bookings.id, id)));
    return row;
  }

  async function auditActionsFor(bookingId: number): Promise<string[]> {
    const rows = await app.db
      .select({ action: auditLog.action })
      .from(auditLog)
      .where(
        and(
          tenantWhere(auditLog, TEMPLO_CTX),
          eq(auditLog.targetKind, "booking"),
          eq(auditLog.targetId, bookingId),
        ),
      );
    return rows.map((r) => r.action);
  }

  // ─── Tests ──────────────────────────────────────────────────────────────

  it("plan flexible: la SP futura pasa a reserva del plan, con aviso y rastro en audit_log", async () => {
    const spDate = futureWeekday(5);
    const scheduleId = await createSchedule(isoDow(spDate), "10:00");
    const userId = await createTrialLead();
    const spId = await seedBooking(userId, scheduleId, spDate, true);

    const body = await assign(userId, flexPlanId);

    expect(body.trialBookings).toEqual([
      expect.objectContaining({
        bookingId: spId,
        date: spDate,
        startTime: "10:00",
        activityName: "Calistenia SP Assign",
        outcome: "converted",
        reason: null,
      }),
    ]);
    expect(await readBooking(spId)).toEqual({
      isTrial: false,
      status: "reservado",
    });
    expect(await auditActionsFor(spId)).toEqual(["trial_booking_converted"]);
  });

  it("la conversión del lead se registra igual (converted_at/ganado) aunque la SP pierda is_trial", async () => {
    const spDate = futureWeekday(5);
    const scheduleId = await createSchedule(isoDow(spDate), "10:00");
    const userId = await createTrialLead();
    await seedBooking(userId, scheduleId, spDate, true);

    await assign(userId, flexPlanId);

    const [lead] = await app.db
      .select({
        convertedAt: users.convertedAt,
        leadStatus: users.leadStatus,
        status: users.status,
      })
      .from(users)
      .where(and(tenantWhere(users, TEMPLO_CTX), eq(users.id, userId)));
    expect(lead.convertedAt).not.toBeNull();
    expect(lead.leadStatus).toBe("ganado");
    expect(lead.status).toBe("activo");
  });

  it("plan flexible: si ya tiene otra clase ese día, la SP se cancela", async () => {
    const spDate = futureWeekday(5);
    const spSchedule = await createSchedule(isoDow(spDate), "10:00");
    const otherSchedule = await createSchedule(isoDow(spDate), "18:00");
    const userId = await createTrialLead();
    const spId = await seedBooking(userId, spSchedule, spDate, true);
    await seedBooking(userId, otherSchedule, spDate, false);

    const body = await assign(userId, flexPlanId);

    expect(body.trialBookings).toEqual([
      expect.objectContaining({
        bookingId: spId,
        outcome: "cancelled",
        reason: "Ya tiene otra clase reservada ese día.",
      }),
    ]);
    expect(await readBooking(spId)).toEqual({
      isTrial: true,
      status: "cancelado",
    });
    expect(await auditActionsFor(spId)).toEqual(["trial_booking_cancelled"]);
  });

  it("plan fijo: la SP en uno de sus horarios fijos pasa a reserva normal, sin duplicar la del turno fijo", async () => {
    const spDate = futureWeekday(5);
    const anchor = await createSchedule(isoDow(spDate), "10:00");
    const userId = await createTrialLead();
    const spId = await seedBooking(userId, anchor, spDate, true);

    const body = await assign(userId, fixedPlanId, { scheduleIds: [anchor] });

    expect(body.trialBookings).toEqual([
      expect.objectContaining({ bookingId: spId, outcome: "converted" }),
    ]);
    const sameSlot = await app.db
      .select({ id: bookings.id, isTrial: bookings.isTrial })
      .from(bookings)
      .where(
        and(
          tenantWhere(bookings, TEMPLO_CTX),
          eq(bookings.memberId, userId),
          eq(bookings.scheduleId, anchor),
          eq(bookings.bookingDate, spDate),
        ),
      );
    expect(sameSlot).toEqual([{ id: spId, isTrial: false }]);
  });

  it("plan fijo: la SP en un horario que no es de su plan se cancela", async () => {
    const spDate = futureWeekday(5);
    const spSchedule = await createSchedule(isoDow(spDate), "18:00");
    // Turno fijo en OTRO día de la semana.
    const anchorDow = isoDow(spDate) === 1 ? 2 : 1;
    const anchor = await createSchedule(anchorDow, "10:00");
    const userId = await createTrialLead();
    const spId = await seedBooking(userId, spSchedule, spDate, true);

    const body = await assign(userId, fixedPlanId, { scheduleIds: [anchor] });

    expect(body.trialBookings).toEqual([
      expect.objectContaining({
        bookingId: spId,
        outcome: "cancelled",
        reason: "Su plan fijo no incluye ese horario.",
      }),
    ]);
    expect((await readBooking(spId)).status).toBe("cancelado");
  });

  it("plan que arranca más adelante: la SP dentro del plan no se toca, pero se avisa", async () => {
    const startDate = shiftDays(todayStr(), 3);
    const spDate = futureWeekday(5);
    const scheduleId = await createSchedule(isoDow(spDate), "10:00");
    const userId = await createTrialLead();
    const spId = await seedBooking(userId, scheduleId, spDate, true);

    const body = await assign(userId, flexPlanId, { startDate });

    expect(body.trialBookings).toEqual([
      expect.objectContaining({
        bookingId: spId,
        outcome: "kept",
        reason: "El plan todavía no arrancó: la sesión sigue como prueba.",
      }),
    ]);
    expect(await readBooking(spId)).toEqual({
      isTrial: true,
      status: "reservado",
    });
    expect(await auditActionsFor(spId)).toEqual([]);
  });

  it("SP pasada o fuera del período del plan: no se toca ni se informa", async () => {
    const pastDate = shiftDays(todayStr(), -7);
    const pastSchedule = await createSchedule(
      isoDow(pastDate) === 7 ? 1 : isoDow(pastDate),
      "10:00",
    );
    // Después del fin del plan (30 días).
    const lateDate = futureWeekday(40);
    const lateSchedule = await createSchedule(isoDow(lateDate), "11:00");
    const userId = await createTrialLead();
    const pastId = await seedBooking(
      userId,
      pastSchedule,
      pastDate,
      true,
      "confirmado",
    );
    const lateId = await seedBooking(userId, lateSchedule, lateDate, true);

    const body = await assign(userId, flexPlanId);

    expect(body.trialBookings).toEqual([]);
    expect(await readBooking(pastId)).toEqual({
      isTrial: true,
      status: "confirmado",
    });
    expect(await readBooking(lateId)).toEqual({
      isTrial: true,
      status: "reservado",
    });
  });

  it("socio sin SP: trialBookings vacío", async () => {
    const userId = await createTrialLead();
    const body = await assign(userId, flexPlanId);
    expect(body.trialBookings).toEqual([]);
  });
});
