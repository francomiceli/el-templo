/**
 * Línea del pase especial (2026-09-29, yoga de Moreno) — el consumo de clases
 * se rutea al pase de la LÍNEA de la actividad.
 *
 * Un socio con pase de Aura (línea NULL) y pase de Yoga ('Yoga') que asiste a
 * una clase de Yoga descuenta del pase de Yoga y deja intacto el de Aura (y
 * viceversa). Puntos de decremento/restauración cubiertos:
 *   (1) check-in de coach a Yoga   → baja el pase de Yoga, Aura intacto
 *   (2) check-in de coach a Aura   → baja el pase de Aura, Yoga intacto
 *   (3) undo del check-in de Yoga  → vuelve el pase de Yoga, Aura intacto
 *   (4) regla diaria por línea     → Yoga + Aura el mismo día OK, dos Yoga → 400
 *   (5) no-show (job mark-no-shows) sobre Yoga descuenta el pase de Yoga
 *   (6) no-show de Yoga + Aura en la misma pasada → cada pase baja 1
 *   (7) no-show de Yoga con SOLO pase de Aura → no toca el pase de Aura
 *
 * Molde: test/attendance/especial-consumption.test.ts (161-03). Se usa el
 * check-in de coach (POST /slot/:scheduleId/:date/check-in) porque toma el
 * scheduleId directo, sin depender de la ventana de ±20 min del QR.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import * as schema from "../../src/db/schema";
import { TENANT_TEMPLO } from "../fixtures/second-tenant";
import {
  createTestApp,
  getAuthToken,
  cleanAllTestData,
  todayStr,
  dateOffsetStr,
} from "../helpers";
import { createMember, assignPlan } from "../subscriptions/_helpers";
import { runMarkNoShows } from "../../src/jobs/mark-no-shows";

let app: FastifyInstance;
let adminToken: string;

// Fixtures recreadas por test (cleanAllTestData corre en beforeEach).
let auraPlanId: number;
let yogaPlanId: number;
let auraScheduleId: number;
let yogaScheduleId: number;
let yoga2ScheduleId: number;

beforeAll(async () => {
  app = await createTestApp();
  adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await cleanAllTestData(app);

  auraPlanId = await insertEspecialPlan("Pase Aura 192-line", null);
  yogaPlanId = await insertEspecialPlan("Pase Yoga 192-line", "Yoga");

  auraScheduleId = await createActivityWithSchedule("Verticales", null, "10:00");
  yogaScheduleId = await createActivityWithSchedule(
    "Yoga regenerativo",
    "Yoga",
    "12:00",
  );
  yoga2ScheduleId = await createActivityWithSchedule(
    "Yoga para calisténicos",
    "Yoga",
    "16:00",
  );
});

/** Pase especial de la línea dada (budget 2, externo). Mismo shape que la migración 0179. */
async function insertEspecialPlan(
  name: string,
  specialLine: string | null,
): Promise<number> {
  const res = await app.db.insert(schema.subscriptionPlans).values({
    name,
    planTier: "other",
    bookingMode: "flexible",
    planCategory: "especial",
    priceRegular: 10000,
    priceZero: 10000,
    durationDays: 30,
    classesPerWeek: null,
    monthlyClassBudget: 2,
    requiresPresencial: false,
    specialLine,
    country: "AR",
    currency: "ARS",
  });
  return Number(res[0].insertId);
}

/** Actividad especial de la línea dada + un slot de sábado en la sede 1. */
async function createActivityWithSchedule(
  name: string,
  specialLine: string | null,
  startTime: string,
): Promise<number> {
  const actRes = await app.db.insert(schema.activities).values({
    name,
    isActive: true,
    isSpecial: true,
    specialLine,
  });
  const activityId = Number(actRes[0].insertId);
  const [h] = startTime.split(":");
  const schedRes = await app.db.insert(schema.schedules).values({
    tenantId: TENANT_TEMPLO,
    branchId: 1,
    activityId,
    dayOfWeek: 6,
    startTime,
    endTime: `${String(Number(h) + 1).padStart(2, "0")}:00`,
    isActive: true,
  });
  return Number(schedRes[0].insertId);
}

/** Socio con pase de Aura + pase de Yoga (2 clases cada uno), asignados por la API. */
async function memberWithBothPasses(email: string): Promise<{
  memberId: number;
  auraSubId: number;
  yogaSubId: number;
}> {
  const member = await createMember(app, { email });
  const ra = await assignPlan(app, adminToken, member.id, {
    planId: auraPlanId,
  });
  expect(ra.statusCode).toBe(201);
  expect(ra.body.classesRemaining).toBe(2);
  const ry = await assignPlan(app, adminToken, member.id, {
    planId: yogaPlanId,
  });
  expect(ry.statusCode).toBe(201);
  expect(ry.body.classesRemaining).toBe(2);
  return {
    memberId: member.id as number,
    auraSubId: ra.body.id as number,
    yogaSubId: ry.body.id as number,
  };
}

async function coachCheckIn(
  scheduleId: number,
  memberId: number,
  date: string = todayStr(),
): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  const res = await app.inject({
    method: "POST",
    url: `/api/admin/attendance/slot/${scheduleId}/${date}/check-in`,
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { memberId },
  });
  return { statusCode: res.statusCode, body: JSON.parse(res.body) };
}

async function removeCheckIn(attendanceId: number): Promise<number> {
  const res = await app.inject({
    method: "DELETE",
    url: `/api/admin/attendance/${attendanceId}`,
    headers: { authorization: `Bearer ${adminToken}` },
  });
  return res.statusCode;
}

/** classesRemaining actual de una sub (lectura directa del row). */
async function remaining(subId: number): Promise<number | null> {
  const [row] = await app.db
    .select({ cr: schema.subscriptions.classesRemaining })
    .from(schema.subscriptions)
    .where(
      and(
        eq(schema.subscriptions.tenantId, TENANT_TEMPLO),
        eq(schema.subscriptions.id, subId),
      ),
    );
  return row?.cr ?? null;
}

/** Reserva pasada sin asistir → candidata a no-show del job. */
async function insertPastBooking(
  memberId: number,
  scheduleId: number,
  date: string,
): Promise<void> {
  await app.db.insert(schema.bookings).values({
    tenantId: TENANT_TEMPLO,
    memberId,
    scheduleId,
    bookingDate: date,
    status: "reservado",
  });
}

describe("Consumo por línea del pase — Yoga vs Aura (2026-09-29)", () => {
  it("(1) check-in a Yoga descuenta del pase de Yoga y NO del de Aura", async () => {
    const m = await memberWithBothPasses("el-1@test.com");

    const r = await coachCheckIn(yogaScheduleId, m.memberId);
    expect(r.statusCode).toBe(201);

    expect(await remaining(m.yogaSubId)).toBe(1);
    expect(await remaining(m.auraSubId)).toBe(2);
  });

  it("(2) check-in a Aura descuenta del pase de Aura y NO del de Yoga", async () => {
    const m = await memberWithBothPasses("el-2@test.com");

    const r = await coachCheckIn(auraScheduleId, m.memberId);
    expect(r.statusCode).toBe(201);

    expect(await remaining(m.auraSubId)).toBe(1);
    expect(await remaining(m.yogaSubId)).toBe(2);
  });

  it("(3) undo del check-in de Yoga restaura el pase de Yoga (vuelve a 2) y no toca Aura", async () => {
    const m = await memberWithBothPasses("el-3@test.com");

    // Una clase de cada línea: Aura queda en 1, Yoga en 1.
    const rAura = await coachCheckIn(auraScheduleId, m.memberId);
    expect(rAura.statusCode).toBe(201);
    const rYoga = await coachCheckIn(yogaScheduleId, m.memberId);
    expect(rYoga.statusCode).toBe(201);
    expect(await remaining(m.auraSubId)).toBe(1);
    expect(await remaining(m.yogaSubId)).toBe(1);

    const undoStatus = await removeCheckIn(
      (rYoga.body.attendance as { id: number }).id,
    );
    expect(undoStatus).toBe(200);

    // Yoga vuelve a 2; Aura sigue en 1 (no recibió la clase restaurada).
    expect(await remaining(m.yogaSubId)).toBe(2);
    expect(await remaining(m.auraSubId)).toBe(1);
  });

  it("(4) regla diaria por línea: Yoga + Aura el mismo día OK, un SEGUNDO Yoga el mismo día → 400", async () => {
    const m = await memberWithBothPasses("el-4@test.com");

    expect((await coachCheckIn(yogaScheduleId, m.memberId)).statusCode).toBe(
      201,
    );
    expect((await coachCheckIn(auraScheduleId, m.memberId)).statusCode).toBe(
      201,
    );
    expect(await remaining(m.yogaSubId)).toBe(1);
    expect(await remaining(m.auraSubId)).toBe(1);

    // Otra clase de Yoga (otro horario) el mismo día: bloqueada intra-línea.
    const rYoga2 = await coachCheckIn(yoga2ScheduleId, m.memberId);
    expect(rYoga2.statusCode).toBe(400);
    // Y no descontó nada.
    expect(await remaining(m.yogaSubId)).toBe(1);
    expect(await remaining(m.auraSubId)).toBe(1);
  });

  it("(5) no-show sobre una reserva de Yoga descuenta del pase de Yoga (job mark-no-shows), Aura intacto", async () => {
    const m = await memberWithBothPasses("el-5@test.com");
    await insertPastBooking(m.memberId, yogaScheduleId, dateOffsetStr(-2));

    const result = await runMarkNoShows(app.db);
    expect(result.updated).toBeGreaterThanOrEqual(1);
    expect(result.decremented).toBeGreaterThanOrEqual(1);

    expect(await remaining(m.yogaSubId)).toBe(1);
    expect(await remaining(m.auraSubId)).toBe(2);
  });

  it("(6) no-show de Yoga y de Aura en la misma pasada → cada pase baja exactamente 1", async () => {
    const m = await memberWithBothPasses("el-6@test.com");
    await insertPastBooking(m.memberId, yogaScheduleId, dateOffsetStr(-2));
    await insertPastBooking(m.memberId, auraScheduleId, dateOffsetStr(-2));

    const result = await runMarkNoShows(app.db);
    expect(result.updated).toBeGreaterThanOrEqual(2);
    expect(result.decremented).toBeGreaterThanOrEqual(2);

    expect(await remaining(m.yogaSubId)).toBe(1);
    expect(await remaining(m.auraSubId)).toBe(1);
  });

  it("(7) no-show de Yoga con SOLO pase de Aura → el pase de Aura NO se descuenta", async () => {
    const member = await createMember(app, { email: "el-7@test.com" });
    const ra = await assignPlan(app, adminToken, member.id, {
      planId: auraPlanId,
    });
    expect(ra.statusCode).toBe(201);
    const auraSubId = ra.body.id as number;

    await insertPastBooking(
      member.id as number,
      yogaScheduleId,
      dateOffsetStr(-2),
    );

    await runMarkNoShows(app.db);

    expect(await remaining(auraSubId)).toBe(2);
  });
});
