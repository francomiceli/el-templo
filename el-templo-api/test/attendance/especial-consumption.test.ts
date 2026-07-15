/**
 * Fase 161 Plan 03 (GATE-02) — consumo de clases ruteado por actividad.
 *
 * Verifica que asistir a una actividad ESPECIAL descuente del pase (sub
 * `planCategory:'especial'`) y asistir a una REGULAR descuente del presencial,
 * SIN cruces entre ambos budgets. Cubre los puntos de decremento que el plan
 * ruteó vía `pickSubscriptionForActivity`:
 *   (1) check-in a la especial   → pase baja 1, presencial intacto (GATE-02)
 *   (2) check-in a la regular    → presencial baja 1, pase intacto
 *   (3) undo del check-in especial → pase vuelve a 2
 *   (4) no-show sobre la especial (job mark-no-shows) → pase baja, presencial intacto
 *
 * Se usa el flujo de check-in de coach (POST /slot/:scheduleId/:date/check-in)
 * porque toma el `scheduleId` directo (resuelve `is_special`) sin depender de la
 * ventana de ±20 min del QR. Los planes especiales se seedean vía Drizzle (mismo
 * shape que la migración 0179), igual que en especial-pass.test.ts, porque la
 * ruta admin create-plan todavía no persiste monthly_class_budget.
 *
 * Análogo estructural: test/subscriptions/class-tracking.test.ts +
 * test/subscriptions/especial-pass.test.ts.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import * as schema from "../../src/db/schema";
import {
  createTestApp,
  getAuthToken,
  cleanAllTestData,
  todayStr,
  dateOffsetStr,
} from "../helpers";
import {
  createPlan,
  createMember,
  assignPlan,
} from "../subscriptions/_helpers";
import { runMarkNoShows } from "../../src/jobs/mark-no-shows";

let app: FastifyInstance;
let adminToken: string;

// Fixtures recreadas por test (cleanAllTestData corre en beforeEach).
let presencialPlanId: number;
let socioPassId: number;
let especialScheduleId: number;
let regularScheduleId: number;

beforeAll(async () => {
  app = await createTestApp();
  adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await cleanAllTestData(app);

  const presencial = await createPlan(app, adminToken, {
    name: "Presencial 161-03",
    planCategory: "presencial",
    classesPerWeek: 3,
    durationDays: 30,
  });
  presencialPlanId = presencial.id;

  // Pase Socio (requires_presencial=1, budget=2). Mismo INSERT que la migración 0179.
  const passRes = await app.db.insert(schema.subscriptionPlans).values({
    name: "Pase Socio 161-03",
    planTier: "other",
    bookingMode: "flexible",
    planCategory: "especial",
    priceRegular: 10000,
    priceZero: 10000,
    durationDays: 30,
    classesPerWeek: null,
    monthlyClassBudget: 2,
    requiresPresencial: true,
    country: "AR",
    currency: "ARS",
  });
  socioPassId = Number(passRes[0].insertId);

  especialScheduleId = await createActivityWithSchedule("Verticales", true);
  regularScheduleId = await createActivityWithSchedule("Funcional", false);
});

/** Crea una actividad (especial o regular) + un slot de sábado en la sede 1. */
async function createActivityWithSchedule(
  name: string,
  isSpecial: boolean,
): Promise<number> {
  const actRes = await app.db.insert(schema.activities).values({
    name,
    isActive: true,
    isSpecial,
  });
  const activityId = Number(actRes[0].insertId);
  const schedRes = await app.db.insert(schema.schedules).values({
    branchId: 1,
    activityId,
    dayOfWeek: 6,
    startTime: "10:00",
    endTime: "11:00",
    isActive: true,
  });
  return Number(schedRes[0].insertId);
}

/** Socio con presencial (15 clases) + pase (2 clases) activos en paralelo. */
async function memberWithBothSubs(email: string): Promise<{
  memberId: number;
  presencialSubId: number;
  especialSubId: number;
  presencialRemaining: number;
}> {
  const member = await createMember(app, { email });
  const rp = await assignPlan(app, adminToken, member.id, {
    planId: presencialPlanId,
  });
  expect(rp.statusCode).toBe(201);
  const re = await assignPlan(app, adminToken, member.id, {
    planId: socioPassId,
  });
  expect(re.statusCode).toBe(201);
  expect(re.body.classesRemaining).toBe(2);
  return {
    memberId: member.id as number,
    presencialSubId: rp.body.id as number,
    especialSubId: re.body.id as number,
    presencialRemaining: rp.body.classesRemaining as number,
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
    .where(eq(schema.subscriptions.id, subId));
  return row?.cr ?? null;
}

describe("Consumo por actividad — especial vs presencial (fase 161-03, GATE-02)", () => {
  it("(1) GATE-02: check-in a la especial descuenta del pase y NO del presencial", async () => {
    const m = await memberWithBothSubs("ec-1@test.com");

    const r = await coachCheckIn(especialScheduleId, m.memberId);
    expect(r.statusCode).toBe(201);

    // El pase baja de 2 a 1...
    expect(await remaining(m.especialSubId)).toBe(1);
    // ...y el presencial NO se toca (aserción central del gating).
    expect(await remaining(m.presencialSubId)).toBe(m.presencialRemaining);
  });

  it("(2) check-in a la regular descuenta del presencial y NO del pase", async () => {
    const m = await memberWithBothSubs("ec-2@test.com");

    const r = await coachCheckIn(regularScheduleId, m.memberId);
    expect(r.statusCode).toBe(201);

    expect(await remaining(m.presencialSubId)).toBe(m.presencialRemaining - 1);
    expect(await remaining(m.especialSubId)).toBe(2);
  });

  it("(3) undo del check-in a la especial restaura la clase al pase (vuelve a 2)", async () => {
    const m = await memberWithBothSubs("ec-3@test.com");

    const r = await coachCheckIn(especialScheduleId, m.memberId);
    expect(r.statusCode).toBe(201);
    expect(await remaining(m.especialSubId)).toBe(1);

    const attendance = r.body.attendance as { id: number };
    const undoStatus = await removeCheckIn(attendance.id);
    expect(undoStatus).toBe(200);

    // El pase vuelve a 2; el presencial sigue intacto.
    expect(await remaining(m.especialSubId)).toBe(2);
    expect(await remaining(m.presencialSubId)).toBe(m.presencialRemaining);
  });

  it("(4) no-show sobre una reserva de especial descuenta del pase (job mark-no-shows), presencial intacto", async () => {
    const m = await memberWithBothSubs("ec-4@test.com");

    // Reserva pasada sin asistir sobre la actividad especial → candidata a no-show.
    await app.db.insert(schema.bookings).values({
      memberId: m.memberId,
      scheduleId: especialScheduleId,
      bookingDate: dateOffsetStr(-2),
      status: "reservado",
    });

    const result = await runMarkNoShows(app.db);
    expect(result.updated).toBeGreaterThanOrEqual(1);
    expect(result.decremented).toBeGreaterThanOrEqual(1);

    expect(await remaining(m.especialSubId)).toBe(1);
    expect(await remaining(m.presencialSubId)).toBe(m.presencialRemaining);
  });
});
