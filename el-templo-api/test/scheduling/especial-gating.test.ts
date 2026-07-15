/**
 * Fase 161-06 (GATE-01/03/04, D-04, D-06, D-07) — enforcement del pase
 * "Actividades con Aura" en BookingService.reserve() + adminAddBooking.
 *
 * Casos cubiertos:
 *  (1) GATE-01/03: member sin pase reserva una especial → 400 code=PASS_REQUIRED.
 *  (2) GATE-03:    el mismo socio reserva una REGULAR → 201 (acceso regular intacto).
 *  (3) GATE-04:    externo-solo-pase reserva una regular → 400 "pase solo especiales".
 *  (4) D-04:       pase (budget 2) reserva 2 especiales futuras → OK; la 3ª → 400
 *                  saldo comprometido; cancelar una libera el cupo → la 3ª ahora OK.
 *  (5) D-06:       especial a más de 2 días pero dentro del período del pase → 201.
 *  (6) D-07:       staff reserva una especial para un member SIN pase vía booking
 *                  admin → 201 (bypass, sin PASS_REQUIRED, con aviso).
 *  (7) Regresión sub scheduled: pase especial en status `scheduled` (startDate =
 *                  mañana) reserva una especial dentro de la ventana → 201 (no rompe
 *                  el bloque coverage-from tras el reemplazo por pickSubscriptionForActivity).
 *  (8) D-05 mezclable: pase (budget 2) reserva Verticales Y Acrobacias (2 especiales
 *                  DISTINTAS) → ambas OK, ambas contra el mismo budget sin fricción.
 *
 * Análogo estructural directo: test/scheduling-reserve-coverage.test.ts (pin del
 * reloj a un miércoles, actividades/horarios por la API admin, subs por inserción
 * directa para tunear estado/vencimiento/saldo por caso).
 *
 * Los planes especiales reales entran por la migración 0179; acá se insertan por
 * DB para controlar planCategory/monthlyClassBudget sin pasar por assertPlanInvariants
 * (que hoy trata especial como online — callsite diferido al Plan 02).
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
  registerUser,
  cleanAllTestData,
} from "../helpers";
import * as schema from "../../src/db/schema";

const ADMIN_URL = "/api/admin/scheduling";
const RESERVE_URL = "/api/members/scheduling/reserve";
const MEMBER_CANCEL_URL = "/api/members/scheduling/bookings";
const ADMIN_BOOK_URL = `${ADMIN_URL}/bookings`;

// Pinned "now" = Wednesday 2026-03-11. Regular slot lands on the next-day
// Thursday (+1d, within the +2 member window). Special slots are Saturdays,
// deliberately beyond +2 so only the extended pass window (D-06) reaches them.
const REGULAR_DATE = "2026-03-12"; // Thursday
const SAT_1 = "2026-03-14"; // Saturday (3 días out — beyond +2)
const SAT_2 = "2026-03-21"; // next Saturday
const SAT_3 = "2026-03-28"; // third Saturday

describe("Fase 161-06 — gating del pase de actividades especiales", () => {
  let app: FastifyInstance;
  let adminToken: string;
  let testBranchId: number;

  let presencialPlanId: number;
  let especialPlanId: number;
  let regularScheduleId: number;
  let verticalesScheduleId: number;
  let acrobaciasScheduleId: number;

  beforeAll(async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-03-11T10:00:00Z")); // Wednesday

    app = await createTestApp();
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");

    const [branch] = await app.db
      .select({ id: schema.branches.id })
      .from(schema.branches)
      .where(eq(schema.branches.isVirtual, false))
      .limit(1);
    testBranchId = branch.id;
  });

  afterAll(async () => {
    vi.useRealTimers();
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);

    // Planes por DB (bypass de assertPlanInvariants para el especial).
    const presencialRes = await app.db.insert(schema.subscriptionPlans).values({
      name: "Presencial Mensual",
      planTier: "flex",
      bookingMode: "flexible",
      planCategory: "presencial",
      priceRegular: 15000,
      priceZero: 10000,
      durationDays: 30,
      classesPerWeek: 3,
    });
    presencialPlanId = Number(presencialRes[0].insertId);

    const especialRes = await app.db.insert(schema.subscriptionPlans).values({
      name: "Actividades con Aura — Externo",
      planTier: "flex",
      bookingMode: "flexible",
      planCategory: "especial",
      priceRegular: 20000,
      priceZero: 20000,
      durationDays: 30,
      classesPerWeek: null,
      monthlyClassBudget: 2,
    });
    especialPlanId = Number(especialRes[0].insertId);

    // Actividades por la API admin (ejercita el wiring de isSpecial del Plan 05).
    regularScheduleId = await createActivityAndSchedule(
      "Calistenia",
      false,
      4, // Thursday
      "10:00",
      "11:00",
    );
    verticalesScheduleId = await createActivityAndSchedule(
      "Verticales",
      true,
      6, // Saturday
      "10:00",
      "11:00",
    );
    acrobaciasScheduleId = await createActivityAndSchedule(
      "Acrobacias",
      true,
      6, // Saturday
      "12:00",
      "13:00",
    );
  });

  /** Crea una actividad (con flag isSpecial) + un horario y devuelve el scheduleId. */
  async function createActivityAndSchedule(
    name: string,
    isSpecial: boolean,
    dayOfWeek: number,
    startTime: string,
    endTime: string,
  ): Promise<number> {
    const actRes = await app.inject({
      method: "POST",
      url: `${ADMIN_URL}/activities`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name, isSpecial },
    });
    expect(actRes.statusCode).toBe(201);
    const activityId = JSON.parse(actRes.body).id as number;

    const schRes = await app.inject({
      method: "POST",
      url: `${ADMIN_URL}/schedules`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        branchId: testBranchId,
        activityId,
        dayOfWeek,
        startTime,
        endTime,
      },
    });
    expect(schRes.statusCode).toBe(201);
    return JSON.parse(schRes.body).id as number;
  }

  /** Registra un member y devuelve {id, token}. */
  async function createMemberToken(
    email: string,
  ): Promise<{ id: number; token: string }> {
    const result = await registerUser(app, {
      email,
      password: "pass123456",
      branchId: testBranchId,
    });
    const id = (result.user as { id: number }).id;
    const token = await getAuthToken(app, email, "pass123456");
    return { id, token };
  }

  /** Inserta una suscripción directamente para tunear estado/vencimiento/saldo. */
  async function insertSub(
    userId: number,
    planId: number,
    status: "active" | "scheduled",
    startDate: string,
    endDate: string | null,
    classesRemaining: number | null,
  ): Promise<void> {
    await app.db.insert(schema.subscriptions).values({
      userId,
      planId,
      branchId: testBranchId,
      status,
      startDate,
      endDate,
      pricePaid: 20000,
      priceTypeApplied: "regular",
      classesRemaining,
    });
  }

  async function reserve(
    token: string,
    scheduleId: number,
    date: string,
  ): Promise<{ statusCode: number; body: Record<string, unknown> }> {
    const res = await app.inject({
      method: "POST",
      url: RESERVE_URL,
      headers: { authorization: `Bearer ${token}` },
      payload: { scheduleId, date },
    });
    return { statusCode: res.statusCode, body: JSON.parse(res.body) };
  }

  async function cancel(token: string, bookingId: number): Promise<number> {
    const res = await app.inject({
      method: "DELETE",
      url: `${MEMBER_CANCEL_URL}/${bookingId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    return res.statusCode;
  }

  // ── (1) GATE-01/03 ──────────────────────────────────────────────────────
  it("(1) GATE-01/03: member sin pase reserva una especial → 400 PASS_REQUIRED", async () => {
    const { id, token } = await createMemberToken("gate-socio-1@test.com");
    // Socio: SOLO presencial, sin pase especial.
    await insertSub(
      id,
      presencialPlanId,
      "active",
      "2026-02-14",
      "2026-04-15",
      10,
    );

    const { statusCode, body } = await reserve(
      token,
      verticalesScheduleId,
      SAT_1,
    );
    expect(statusCode).toBe(400);
    expect(body.code).toBe("PASS_REQUIRED");
  });

  // ── (2) GATE-03: acceso regular intacto ─────────────────────────────────
  it("(2) GATE-03: el mismo socio reserva una REGULAR → 201 (acceso intacto)", async () => {
    const { id, token } = await createMemberToken("gate-socio-2@test.com");
    await insertSub(
      id,
      presencialPlanId,
      "active",
      "2026-02-14",
      "2026-04-15",
      10,
    );

    const { statusCode, body } = await reserve(
      token,
      regularScheduleId,
      REGULAR_DATE,
    );
    expect(statusCode).toBe(201);
    expect(body.status).toBe("reservado");
    expect(body.code).toBeUndefined();
  });

  // ── (3) GATE-04: externo-solo-pase NO puede reservar regulares ──────────
  it("(3) GATE-04: externo-solo-pase reserva una regular → 400 pase solo especiales", async () => {
    const { id, token } = await createMemberToken("gate-externo-3@test.com");
    // Externo: SOLO pase especial, sin presencial/online.
    await insertSub(
      id,
      especialPlanId,
      "active",
      "2026-02-14",
      "2026-04-15",
      2,
    );

    const { statusCode, body } = await reserve(
      token,
      regularScheduleId,
      REGULAR_DATE,
    );
    expect(statusCode).toBe(400);
    expect(body.code).not.toBe("PASS_REQUIRED");
    expect(String(body.message)).toMatch(/pase solo habilita/i);
  });

  // ── (4) D-04: budget cuenta reservas futuras pendientes; cancelar libera ─
  it("(4) D-04: 2 especiales OK, la 3ª bloqueada por saldo; cancelar libera el cupo", async () => {
    const { id, token } = await createMemberToken("d04@test.com");
    // Pase budget 2 (classesRemaining=2, se descuenta al check-in, no en reserva).
    await insertSub(
      id,
      especialPlanId,
      "active",
      "2026-02-14",
      "2026-04-15",
      2,
    );

    const r1 = await reserve(token, verticalesScheduleId, SAT_1);
    expect(r1.statusCode).toBe(201);
    const r2 = await reserve(token, verticalesScheduleId, SAT_2);
    expect(r2.statusCode).toBe(201);

    // 3ª reserva: 2 futuras pendientes >= budget 2 → bloqueada por saldo.
    const r3 = await reserve(token, verticalesScheduleId, SAT_3);
    expect(r3.statusCode).toBe(400);
    expect(String(r3.body.message)).toMatch(/comprometidas|liberar cupo/i);

    // Cancelar la 1ª libera el cupo comprometido.
    const cancelStatus = await cancel(token, Number(r1.body.id));
    expect(cancelStatus).toBe(200);

    // Ahora la 3ª entra (1 futura pendiente < budget 2).
    const r3bis = await reserve(token, verticalesScheduleId, SAT_3);
    expect(r3bis.statusCode).toBe(201);
  });

  // ── (5) D-06: ventana extendida dentro del período del pase ─────────────
  it("(5) D-06: especial a más de 2 días pero dentro del pase → 201", async () => {
    const { id, token } = await createMemberToken("d06@test.com");
    // Pase vigente hasta 2026-04-15; SAT_1 (2026-03-14) está a 3 días (> +2).
    await insertSub(
      id,
      especialPlanId,
      "active",
      "2026-02-14",
      "2026-04-15",
      2,
    );

    const { statusCode, body } = await reserve(
      token,
      verticalesScheduleId,
      SAT_1,
    );
    expect(statusCode).toBe(201);
    expect(body.status).toBe("reservado");
  });

  // ── (6) D-07: staff bypass en booking admin ─────────────────────────────
  it("(6) D-07: staff reserva especial para un member SIN pase → 201 (bypass, con aviso)", async () => {
    const { id } = await createMemberToken("d07@test.com");
    // Socio sin pase especial.
    await insertSub(
      id,
      presencialPlanId,
      "active",
      "2026-02-14",
      "2026-04-15",
      10,
    );

    const res = await app.inject({
      method: "POST",
      url: ADMIN_BOOK_URL,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { scheduleId: verticalesScheduleId, memberId: id, date: SAT_1 },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body) as {
      booking: { status: string };
      warnings: string[];
    };
    expect(body.booking.status).toBe("reservado");
    expect(body.warnings.some((w) => /pase de actividades/i.test(w))).toBe(
      true,
    );
  });

  // ── (7) Regresión sub scheduled (coverage-from) ─────────────────────────
  it("(7) Regresión: pase especial scheduled (startDate mañana) reserva dentro de ventana → 201", async () => {
    const { id, token } = await createMemberToken("scheduled@test.com");
    // Pase especial que ARRANCA mañana (2026-03-12) — status scheduled.
    // SAT_1 (2026-03-14) cae dentro de su período → NO debe rechazarse por
    // coverage-from (verifica que pickSubscriptionForActivity no rompió el flujo).
    await insertSub(
      id,
      especialPlanId,
      "scheduled",
      "2026-03-12",
      "2026-04-11",
      2,
    );

    const { statusCode, body } = await reserve(
      token,
      verticalesScheduleId,
      SAT_1,
    );
    expect(statusCode).toBe(201);
    expect(body.status).toBe("reservado");
  });

  // ── (8) D-05 mezclable: 2 especiales DISTINTAS contra el mismo budget ───
  it("(8) D-05: reserva Verticales Y Acrobacias (distintas) contra el mismo budget → ambas OK", async () => {
    const { id, token } = await createMemberToken("d05@test.com");
    await insertSub(
      id,
      especialPlanId,
      "active",
      "2026-02-14",
      "2026-04-15",
      2,
    );

    // Dos actividades ESPECIALES distintas, en 2 sábados distintos (la regla de
    // "una reserva por día" impide 2 el mismo día). Ambas contra el mismo pase.
    const rVert = await reserve(token, verticalesScheduleId, SAT_1);
    expect(rVert.statusCode).toBe(201);
    const rAcro = await reserve(token, acrobaciasScheduleId, SAT_2);
    expect(rAcro.statusCode).toBe(201);
  });
});
