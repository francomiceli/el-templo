/**
 * Fase 165-05 (SELF-01 / D-01) — E2E del funnel self-service freemium→prueba.
 *
 * Este es también el TEST DE REGRESIÓN del milestone: valida que el funnel de
 * Phase 119, los writes de la máquina de estados de Phase 163 (reset/source) y
 * el teléfono obligatorio de Phase 165 conviven en un único recorrido:
 *
 *   POST /api/auth/register                        → user queda 'freemium'
 *   GET  /api/members/scheduling/trial-eligibility → eligible:true, phoneRequired según perfil
 *   POST /api/members/scheduling/reserve-trial     → promueve freemium→prueba,
 *        booking is_trial source 'self_service', lead en_seguimiento source 'auto' (163)
 *   GET  /api/admin/reports/trial-sessions         → el lead aparece con su teléfono
 *
 * Más los negativos clave del funnel:
 *   - sub activa → NO elegible
 *   - segunda prueba → 409 (una por vida)
 *   - cancel self-service → revierte prueba→freemium
 *   - sin teléfono → 400 PHONE_REQUIRED
 *   - con teléfono en el body → 201 + users.phone persistido (normalizado)
 *
 * Regla de fecha: helper LOCAL (CURDATE es ART) — se reserva una prueba a +3
 * días LOCALES sobre un schedule cuyo dayOfWeek coincide; NO se usan offsets UTC
 * ni fake timers (evita el split-brain entre el Date de JS y CURDATE de MySQL).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import {
  createTestApp,
  getAuthToken,
  registerUser,
  createEligibleFreemium,
  cleanAllTestData,
} from "./helpers";
import * as schema from "../src/db/schema";
import { tenantWhere } from "../src/modules/shared/tenant";

// El gimnasio de los fixtures (El Templo = tenant 1).
const CTX = { tenantId: 1 };

const ADMIN_SCHED_URL = "/api/admin/scheduling";
const ELIGIBILITY_URL = "/api/members/scheduling/trial-eligibility";
const RESERVE_TRIAL_URL = "/api/members/scheduling/reserve-trial";
const CANCEL_TRIAL_URL = "/api/members/scheduling/cancel-trial";
const TRIAL_REPORT_URL = "/api/admin/reports/trial-sessions";

/**
 * Fecha (YYYY-MM-DD) + dayOfWeek para hoy + `days`, calculado en la fecha LOCAL
 * del proceso. MySQL evalúa CURDATE()/NOW() en la tz del server (ART); calcular
 * en UTC corre un día tras las 21:00 ART y desalinea el slot con la validación
 * server-side (mismo bug latente que 163/164 documentan).
 *
 * La API de schedules acepta dayOfWeek 1..6 (Lun=1..Sáb=6, sin domingos — el
 * gym no abre domingo). JS getDay() ya devuelve Lun=1..Sáb=6, así que basta con
 * saltear el domingo (getDay()===0) y usar getDay() directo; es la misma
 * convención que valida reserve-trial contra el schedule.
 */
function localTrialDate(minDays: number): { date: string; dayOfWeek: number } {
  const d = new Date();
  d.setDate(d.getDate() + minDays);
  if (d.getDay() === 0) d.setDate(d.getDate() + 1); // saltear domingo (cerrado)
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const date = `${d.getFullYear()}-${mm}-${dd}`;
  return { date, dayOfWeek: d.getDay() }; // Lun=1..Sáb=6
}

describe("E2E self-service trial funnel (Fase 165-05, SELF-01)", () => {
  let app: FastifyInstance;
  let adminToken: string; // admin@test.com = owner (scope global) → ve todo el reporte
  let physicalBranchId: number;
  let virtualBranchId: number;
  let scheduleId: number;
  // Slot de prueba a +3 días LOCALES (>24h, dentro de la ventana de 30 días).
  const trial = localTrialDate(3);

  beforeAll(async () => {
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
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    // cleanAllTestData borra activities + schedules → recrear el slot por test,
    // con el dayOfWeek que matchea la fecha de prueba LOCAL (+3d).
    const activityRes = await app.inject({
      method: "POST",
      url: `${ADMIN_SCHED_URL}/activities`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: "Calistenia", description: "Clase grupal" },
    });
    const activityId = JSON.parse(activityRes.body).id;
    const scheduleRes = await app.inject({
      method: "POST",
      url: `${ADMIN_SCHED_URL}/schedules`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        branchId: physicalBranchId,
        activityId,
        dayOfWeek: trial.dayOfWeek,
        startTime: "10:00",
        endTime: "11:00",
      },
    });
    scheduleId = JSON.parse(scheduleRes.body).id;
  });

  // --- helpers de recorrido -------------------------------------------------

  async function getEligibility(
    token: string,
  ): Promise<{ statusCode: number; body: Record<string, unknown> }> {
    const res = await app.inject({
      method: "GET",
      url: ELIGIBILITY_URL,
      headers: { authorization: `Bearer ${token}` },
    });
    return { statusCode: res.statusCode, body: JSON.parse(res.body) };
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

  /** Registra un freemium CON teléfono (el registro genera dni/phone únicos). */
  async function registerFreemium(): Promise<{ id: number; token: string }> {
    const email = `e2e-${Date.now().toString(36)}${Math.random()
      .toString(36)
      .slice(2, 6)}@test.com`;
    const { token, user } = await registerUser(app, {
      email,
      password: "pass123456",
      branchId: physicalBranchId,
    });
    return { id: (user as { id: number }).id, token };
  }

  /** Crea un freemium elegible SIN teléfono y devuelve su token (negativos). */
  async function phonelessFreemiumToken(): Promise<{
    id: number;
    token: string;
  }> {
    const { id, email } = await createEligibleFreemium(app, {
      branchId: physicalBranchId,
      phone: null,
    });
    const token = await getAuthToken(app, email, "pass123456");
    return { id, token };
  }

  // --- HAPPY PATH -----------------------------------------------------------

  it("recorre el funnel completo: register → eligibility → reserve → reporte", async () => {
    // (1) register → freemium
    const { id, token } = await registerFreemium();
    const [afterRegister] = await app.db
      .select({ status: schema.users.status, phone: schema.users.phone })
      .from(schema.users)
      .where(and(tenantWhere(schema.users, CTX), eq(schema.users.id, id)))
      .limit(1);
    expect(
      afterRegister.status,
      "el register debe dejar al user en freemium",
    ).toBe("freemium");
    // El registro captura teléfono (D-05: no cambia) → phoneRequired será false.
    expect(afterRegister.phone).toBeTruthy();

    // (2) eligibility → elegible, no reservó, phoneRequired false (tiene teléfono)
    const elig = await getEligibility(token);
    expect(elig.statusCode).toBe(200);
    expect(
      elig.body.eligible,
      "freemium sin sub ni prueba debe ser elegible",
    ).toBe(true);
    expect(elig.body.alreadyBooked).toBe(false);
    expect(
      elig.body.phoneRequired,
      "con teléfono en el perfil no se pide",
    ).toBe(false);

    // (3) reserve-trial → 201 + promoción atómica multi-tabla
    const reserved = await reserve(token, {
      scheduleId,
      date: trial.date,
      branchId: physicalBranchId,
    });
    expect(reserved.statusCode, JSON.stringify(reserved.body)).toBe(201);
    expect(typeof reserved.body.bookingId).toBe("number");

    // users: freemium→prueba, lead en_seguimiento, source 'auto' (163-03)
    const [user] = await app.db
      .select({
        status: schema.users.status,
        leadStatus: schema.users.leadStatus,
        leadStatusSource: schema.users.leadStatusSource,
        branchId: schema.users.branchId,
      })
      .from(schema.users)
      .where(and(tenantWhere(schema.users, CTX), eq(schema.users.id, id)))
      .limit(1);
    expect(user.status, "reserve promueve a prueba").toBe("prueba");
    expect(user.leadStatus, "el lead entra en seguimiento").toBe(
      "en_seguimiento",
    );
    expect(
      user.leadStatusSource,
      "el reset/alta del lead es automatismo legítimo (163 D-07)",
    ).toBe("auto");
    expect(user.branchId, "la sucursal elegida queda en el perfil").toBe(
      physicalBranchId,
    );

    // user_status_history: freemium→prueba source 'self_service'
    const history = await app.db
      .select({
        fromStatus: schema.userStatusHistory.fromStatus,
        toStatus: schema.userStatusHistory.toStatus,
        source: schema.userStatusHistory.source,
      })
      .from(schema.userStatusHistory)
      .where(
        and(
          tenantWhere(schema.userStatusHistory, CTX),
          eq(schema.userStatusHistory.userId, id),
        ),
      );
    expect(history).toHaveLength(1);
    expect(history[0].fromStatus).toBe("freemium");
    expect(history[0].toStatus).toBe("prueba");
    expect(history[0].source, "atribución self-service").toBe("self_service");

    // bookings: is_trial=1, source 'self_service', reservado
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
    expect(booking.source, "atribución self-service en el booking").toBe(
      "self_service",
    );
    expect(booking.status).toBe("reservado");

    // (4) reporte admin → el lead aparece y trae su teléfono (165-03)
    const reportRes = await app.inject({
      method: "GET",
      url: TRIAL_REPORT_URL,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(reportRes.statusCode).toBe(200);
    const report = JSON.parse(reportRes.body);
    const row = report.rows.find((r: { userId: number }) => r.userId === id);
    expect(
      row,
      "el lead recién promovido aparece en el reporte de SP",
    ).toBeDefined();
    expect(row.phone, "el reporte trae el teléfono del lead (recupero)").toBe(
      afterRegister.phone,
    );
  });

  // --- NEGATIVOS ------------------------------------------------------------

  it("negativo: un freemium con sub activa NO es elegible", async () => {
    const { id, token } = await registerFreemium();
    // Sembrar una sub activa directamente (status queda 'freemium' para que SOLO
    // el guard de suscripción pueda rechazar). cleanAllTestData borra planes.
    const [plan] = await app.db
      .insert(schema.subscriptionPlans)
      .values({
        name: "E2E Guard Plan",
        planTier: "foundation",
        bookingMode: "flexible",
        planCategory: "presencial",
        priceRegular: 10000,
        priceZero: 0,
        durationDays: 30,
      })
      .$returningId();
    await app.db.insert(schema.subscriptions).values({
      userId: id,
      planId: plan.id,
      branchId: physicalBranchId,
      status: "active",
      startDate: trial.date,
      pricePaid: 0,
      priceTypeApplied: "zero",
    });

    const elig = await getEligibility(token);
    expect(elig.statusCode).toBe(200);
    expect(elig.body.eligible, "con sub activa no es elegible").toBe(false);
    expect(elig.body.alreadyBooked).toBe(false);
  });

  it("negativo: segunda prueba rechazada (una por vida)", async () => {
    const { token } = await registerFreemium();
    const first = await reserve(token, {
      scheduleId,
      date: trial.date,
      branchId: physicalBranchId,
    });
    expect(first.statusCode).toBe(201);
    // Ya es 'prueba' con un trial vigente → 409 en cualquier caso.
    const second = await reserve(token, {
      scheduleId,
      date: trial.date,
      branchId: physicalBranchId,
    });
    expect(second.statusCode, "no se permite una segunda prueba").toBe(409);
  });

  it("negativo: cancel self-service revierte prueba→freemium", async () => {
    const { id, token } = await registerFreemium();
    const reserved = await reserve(token, {
      scheduleId,
      date: trial.date,
      branchId: physicalBranchId,
    });
    expect(reserved.statusCode).toBe(201);

    const cancelRes = await app.inject({
      method: "POST",
      url: CANCEL_TRIAL_URL,
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    });
    expect(cancelRes.statusCode, "cancelar a >24h está permitido").toBe(200);
    expect(JSON.parse(cancelRes.body).cancelled).toBe(true);

    // Booking cancelado + user de vuelta a freemium (re-entra al funnel).
    const [booking] = await app.db
      .select({ status: schema.bookings.status })
      .from(schema.bookings)
      .where(eq(schema.bookings.memberId, id))
      .limit(1);
    expect(booking.status).toBe("cancelado");
    const [user] = await app.db
      .select({ status: schema.users.status })
      .from(schema.users)
      .where(and(tenantWhere(schema.users, CTX), eq(schema.users.id, id)))
      .limit(1);
    expect(user.status, "cancelar revierte prueba→freemium").toBe("freemium");
  });

  it("negativo: freemium sin teléfono reservando sin teléfono → 400 PHONE_REQUIRED", async () => {
    const { id, token } = await phonelessFreemiumToken();
    const { statusCode, body } = await reserve(token, {
      scheduleId,
      date: trial.date,
      branchId: physicalBranchId,
    });
    expect(statusCode).toBe(400);
    expect(body.code).toBe("PHONE_REQUIRED");

    // El guard corre antes de la tx: sin promoción ni booking.
    const [user] = await app.db
      .select({ status: schema.users.status, phone: schema.users.phone })
      .from(schema.users)
      .where(and(tenantWhere(schema.users, CTX), eq(schema.users.id, id)))
      .limit(1);
    expect(user.status).toBe("freemium");
    expect(user.phone).toBeNull();
    const bookings = await app.db
      .select({ id: schema.bookings.id })
      .from(schema.bookings)
      .where(eq(schema.bookings.memberId, id));
    expect(bookings).toHaveLength(0);
  });

  it("positivo phone: freemium sin teléfono enviándolo en el body → 201 + persistido (normalizado)", async () => {
    const { id, token } = await phonelessFreemiumToken();
    // eligibility debe pedir teléfono de antemano.
    const elig = await getEligibility(token);
    expect(elig.body.eligible).toBe(true);
    expect(elig.body.phoneRequired, "sin teléfono en el perfil se pide").toBe(
      true,
    );

    const { statusCode, body } = await reserve(token, {
      scheduleId,
      date: trial.date,
      branchId: physicalBranchId,
      // WR-02: se sanea preservando el prefijo país (no se trunca a 10).
      phone: "+54 9 11 2233-4455",
    });
    expect(statusCode, JSON.stringify(body)).toBe(201);
    expect(typeof body.bookingId).toBe("number");

    const [user] = await app.db
      .select({ status: schema.users.status, phone: schema.users.phone })
      .from(schema.users)
      .where(and(tenantWhere(schema.users, CTX), eq(schema.users.id, id)))
      .limit(1);
    expect(user.status).toBe("prueba");
    // WR-02: número completo con país → wa.me-resolvable (ya no "1122334455").
    expect(user.phone).toBe("+5491122334455");
  });

  it("positivo phone ES: '+34 612 345 678' persiste completo (WR-02, no truncado)", async () => {
    const { id, token } = await phonelessFreemiumToken();
    const { statusCode, body } = await reserve(token, {
      scheduleId,
      date: trial.date,
      branchId: physicalBranchId,
      phone: "+34 612 345 678",
    });
    expect(statusCode, JSON.stringify(body)).toBe(201);

    const [user] = await app.db
      .select({ status: schema.users.status, phone: schema.users.phone })
      .from(schema.users)
      .where(and(tenantWhere(schema.users, CTX), eq(schema.users.id, id)))
      .limit(1);
    expect(user.status).toBe("prueba");
    // normalizePhone truncaba a "4612345678" (dígito de país perdido). Ahora intacto.
    expect(user.phone).toBe("+34612345678");
  });

  it("negativo phone no-numérico: 'abc' NO promueve el lead (CR-01/WR-03)", async () => {
    const { id, token } = await phonelessFreemiumToken();
    // "abc" no tiene dígitos: WR-03 (pattern ≥6 dígitos) lo rechaza en el borde,
    // y el guard del service (CR-01) es el respaldo. El invariante crítico: el
    // teléfono NUNCA se dropea silenciosamente → el lead sigue freemium sin SP.
    const { statusCode } = await reserve(token, {
      scheduleId,
      date: trial.date,
      branchId: physicalBranchId,
      phone: "abc",
    });
    expect(statusCode).toBe(400);

    const [user] = await app.db
      .select({ status: schema.users.status, phone: schema.users.phone })
      .from(schema.users)
      .where(and(tenantWhere(schema.users, CTX), eq(schema.users.id, id)))
      .limit(1);
    expect(user.status).toBe("freemium");
    expect(user.phone).toBeNull();
    const bookings = await app.db
      .select({ id: schema.bookings.id })
      .from(schema.bookings)
      .where(eq(schema.bookings.memberId, id));
    expect(bookings).toHaveLength(0);
  });
});
