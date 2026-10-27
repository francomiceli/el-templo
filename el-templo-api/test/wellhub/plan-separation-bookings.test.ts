/**
 * Fase 204 D-18 — separacion plan vs Wellhub, lado reservas y webhook.
 *
 * Una reserva Wellhub NO consume el plan del socio. Sitios cubiertos (matriz de
 * fugas #7-#11 de 204-RESEARCH):
 *   #7  regla de "una reserva por dia" (8b) de `reserve()`.
 *   #8  `countWeeklyBookings` (reserva propia y alta del staff).
 *   #9  `countFuturePendingBookings` (presupuesto de reservas pendientes).
 *   #10 guard "una visita por dia" del webhook de check-in (A1: solo contra
 *       visitas Wellhub, la asistencia propia no la bloquea).
 *   #11 `todayBooking` del webhook: la visita solo confirma la reserva Wellhub.
 *
 * Controles: una reserva propia con `source` NULL (filas legacy) SIGUE contando.
 *
 * Nota sobre `countBonusBookings` (plan 'fixed' + bonus): comparte el mismo
 * predicado `notWellhubBookingSql()` que los otros contadores, pero armar un
 * plan fijo con `subscription_schedules` excede esta suite: queda cubierto por
 * lectura de codigo (ver 204-03-SUMMARY).
 *
 * Fechas: siempre relativas a "hoy" en la tz de la sede. La clase propia se
 * reserva "manana" (o pasado manana si manana es domingo: el limite semanal
 * cuenta de lunes a sabado).
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
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import * as schema from "../../src/db/schema";
import { tenantWhere } from "../../src/modules/shared/tenant";
import { addDays, todayInTz } from "../../src/modules/shared/date-utils";
import {
  createTestApp,
  createTestPlan,
  cleanAllTestData,
  getAuthToken,
  registerUser,
} from "../helpers";
import {
  createActiveSub,
  createTrialPlan,
  fixtureCtx,
} from "../invitations/_helpers";
import {
  TEMPLO_CTX,
  WELLHUB_TEST_SECRET,
  branchToday,
  checkinPayload,
  createWellhubSocioActivo,
  getBranchTimezone,
  insertActivityWithSchedule,
  insertAttendance,
  insertBooking,
  postWellhubWebhook,
  signWellhub,
  stubValidateFetch,
  uniqueGymId,
} from "../fixtures/wellhub-personas";

const BRANCH_ID = 1;
const RESERVE_URL = "/api/members/scheduling/reserve";
const ADMIN_BOOKINGS_URL = "/api/admin/scheduling/bookings";

/** Dia ISO (1=lunes..7=domingo) de una fecha YYYY-MM-DD. */
function isoDow(date: string): number {
  const js = new Date(`${date}T12:00:00Z`).getUTCDay();
  return js === 0 ? 7 : js;
}

describe("Fase 204 D-18: separación plan vs Wellhub (reservas y webhook)", () => {
  let app: FastifyInstance;
  let adminToken: string;
  let tz: string;
  let today: string;
  /** Fecha de la clase propia: manana, o pasado manana si manana es domingo. */
  let classDate: string;
  let originalGymId: number | null = null;
  let gymId: number;
  let planUnaPorSemanaId: number;
  let planTresPorSemanaId: number;

  beforeAll(async () => {
    process.env.WELLHUB_API_KEY = "test-api-key";
    process.env.WELLHUB_WEBHOOK_SECRET = WELLHUB_TEST_SECRET;

    app = await createTestApp();
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
    tz = await getBranchTimezone(app, BRANCH_ID);

    // La sede 1 se mapea a un gym id de Wellhub unico para los tests del webhook.
    const [branch] = await app.db
      .select({ wellhubGymId: schema.branches.wellhubGymId })
      .from(schema.branches)
      .where(
        and(
          tenantWhere(schema.branches, TEMPLO_CTX),
          eq(schema.branches.id, BRANCH_ID),
        ),
      );
    originalGymId = branch?.wellhubGymId ?? null;
    gymId = uniqueGymId();
    await app.db
      .update(schema.branches)
      .set({ wellhubGymId: gymId })
      .where(
        and(
          tenantWhere(schema.branches, TEMPLO_CTX),
          eq(schema.branches.id, BRANCH_ID),
        ),
      );
  });

  afterAll(async () => {
    delete process.env.WELLHUB_API_KEY;
    delete process.env.WELLHUB_WEBHOOK_SECRET;
    vi.unstubAllGlobals();
    await cleanAllTestData(app);
    await app.db
      .update(schema.branches)
      .set({ wellhubGymId: originalGymId })
      .where(
        and(
          tenantWhere(schema.branches, TEMPLO_CTX),
          eq(schema.branches.id, BRANCH_ID),
        ),
      );
    await app.close();
  });

  beforeEach(async () => {
    vi.unstubAllGlobals();
    await cleanAllTestData(app);
    today = await branchToday(app, BRANCH_ID);
    const manana = addDays(today, 1);
    classDate = isoDow(manana) === 7 ? addDays(today, 2) : manana;

    const suffix = Date.now().toString(36);
    // Plan de 1 clase por semana (limite semanal chico, facil de agotar).
    const unaPorSemana = await createTestPlan(app, adminToken, {
      name: `Plan 1x 204-03 ${suffix}`,
      classesPerWeek: 1,
      durationDays: 30,
    });
    planUnaPorSemanaId = unaPorSemana.id;
    // Plan de 3 clases por semana: no se agota con las reservas del test.
    const tresPorSemana = await createTestPlan(app, adminToken, {
      name: `Plan 3x 204-03 ${suffix}`,
      classesPerWeek: 3,
      durationDays: 30,
    });
    planTresPorSemanaId = tresPorSemana.id;
  });

  /** Dos clases (actividades distintas) el mismo dia de la semana de `date`. */
  async function dosClasesEl(date: string): Promise<{
    propia: number;
    otra: number;
  }> {
    const dayOfWeek = isoDow(date);
    const a = await insertActivityWithSchedule(app, {
      branchId: BRANCH_ID,
      name: `Propia 204-03 ${Date.now().toString(36)}`,
      dayOfWeek,
      startTime: "10:00",
      endTime: "11:00",
    });
    const b = await insertActivityWithSchedule(app, {
      branchId: BRANCH_ID,
      name: `Otra 204-03 ${Date.now().toString(36)}`,
      dayOfWeek,
      startTime: "12:00",
      endTime: "13:00",
    });
    return { propia: a.scheduleId, otra: b.scheduleId };
  }

  async function memberReserve(token: string, scheduleId: number, date: string) {
    return app.inject({
      method: "POST",
      url: RESERVE_URL,
      headers: { authorization: `Bearer ${token}` },
      payload: { scheduleId, date },
    });
  }

  async function bookingStatus(bookingId: number): Promise<string | undefined> {
    const [row] = await app.db
      .select({ status: schema.bookings.status })
      .from(schema.bookings)
      .where(
        and(
          tenantWhere(schema.bookings, TEMPLO_CTX),
          eq(schema.bookings.id, bookingId),
        ),
      );
    return row?.status;
  }

  async function attendanceRows(memberId: number) {
    return app.db
      .select({
        source: schema.attendance.source,
        scheduleId: schema.attendance.scheduleId,
      })
      .from(schema.attendance)
      .where(
        and(
          tenantWhere(schema.attendance, TEMPLO_CTX),
          eq(schema.attendance.memberId, memberId),
        ),
      );
  }

  async function postCheckin(gympassId: string) {
    const raw = checkinPayload({ token: gympassId, gymId });
    return postWellhubWebhook(app, raw, signWellhub(raw));
  }

  // ─── #7-#9: reservas ───────────────────────────────────────────────────────

  it("una reserva Wellhub no consume el límite semanal del socio (reserva propia)", async () => {
    const socio = await createWellhubSocioActivo(app, adminToken, {
      planId: planUnaPorSemanaId,
    });
    const { propia, otra } = await dosClasesEl(classDate);
    await insertBooking(app, {
      memberId: socio.id,
      scheduleId: otra,
      bookingDate: classDate,
      status: "reservado",
      source: "wellhub",
    });

    const res = await memberReserve(socio.token, propia, classDate);
    expect(res.statusCode).toBe(201);
  });

  it("una reserva Wellhub no consume el límite semanal cuando la carga el staff", async () => {
    const socio = await createWellhubSocioActivo(app, adminToken, {
      planId: planUnaPorSemanaId,
    });
    const { propia, otra } = await dosClasesEl(classDate);
    await insertBooking(app, {
      memberId: socio.id,
      scheduleId: otra,
      bookingDate: classDate,
      status: "reservado",
      source: "wellhub",
    });

    // El alta del staff nunca bloquea: el limite semanal solo se informa como
    // warning. Sin la reserva propia contada, el warning no debe aparecer.
    const res = await app.inject({
      method: "POST",
      url: ADMIN_BOOKINGS_URL,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { scheduleId: propia, memberId: socio.id, date: classDate },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body) as { warnings: string[] };
    expect(body.warnings.some((w) => w.includes("Limite semanal"))).toBe(false);
  });

  it("control: una reserva propia con source NULL sí consume el límite semanal", async () => {
    const socio = await createWellhubSocioActivo(app, adminToken, {
      planId: planUnaPorSemanaId,
    });
    const { propia, otra } = await dosClasesEl(classDate);
    await insertBooking(app, {
      memberId: socio.id,
      scheduleId: otra,
      bookingDate: classDate,
      status: "reservado",
      source: null,
    });

    // Member: el limite semanal corta la reserva.
    const res = await memberReserve(socio.token, propia, classDate);
    expect(res.statusCode).toBe(400);
    expect(res.body).toContain("limite semanal");

    // Staff: el mismo conteo aparece como warning.
    const admin = await app.inject({
      method: "POST",
      url: ADMIN_BOOKINGS_URL,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { scheduleId: propia, memberId: socio.id, date: classDate },
    });
    expect(admin.statusCode).toBe(201);
    const body = JSON.parse(admin.body) as { warnings: string[] };
    expect(body.warnings.some((w) => w.includes("Limite semanal"))).toBe(true);
  });

  it("una reserva Wellhub hoy no dispara la regla de una reserva por día", async () => {
    // Plan de 3 por semana: el limite semanal no interviene, solo la regla 8b.
    const socio = await createWellhubSocioActivo(app, adminToken, {
      planId: planTresPorSemanaId,
    });
    const { propia, otra } = await dosClasesEl(classDate);
    await insertBooking(app, {
      memberId: socio.id,
      scheduleId: otra,
      bookingDate: classDate,
      status: "reservado",
      source: "wellhub",
    });

    const res = await memberReserve(socio.token, propia, classDate);
    expect(res.statusCode).toBe(201);
  });

  it("control: una reserva propia el mismo día sí dispara la regla de una reserva por día", async () => {
    const socio = await createWellhubSocioActivo(app, adminToken, {
      planId: planTresPorSemanaId,
    });
    const { propia, otra } = await dosClasesEl(classDate);
    await insertBooking(app, {
      memberId: socio.id,
      scheduleId: otra,
      bookingDate: classDate,
      status: "reservado",
      source: null,
    });

    const res = await memberReserve(socio.token, propia, classDate);
    expect(res.statusCode).toBe(409);
  });

  it("una reserva Wellhub futura no consume el presupuesto de reservas", async () => {
    // La regla de presupuesto (5c) aplica a especiales y al plan Invitacion
    // (is_trial + paquete). Se usa el plan Invitacion con saldo EXACTO de 1:
    // si la reserva Wellhub pendiente contara, comprometeria el unico acceso
    // y la reserva propia seria rechazada.
    const ctx = fixtureCtx(app);
    const suffix = Date.now().toString(36);
    const email = `wh-budget-${suffix}@test.com`;
    const reg = await registerUser(app, {
      email,
      password: "pass123456",
      branchId: BRANCH_ID,
    });
    const userId = (reg.user as { id: number }).id;
    const token = await getAuthToken(app, email, "pass123456");

    const trial = await createTrialPlan(ctx);
    const sub = await createActiveSub(ctx, {
      userId,
      planId: trial.id,
      branchId: BRANCH_ID,
    });
    await app.db
      .update(schema.subscriptions)
      .set({ classesRemaining: 1, classesBudget: 3 })
      .where(
        and(
          tenantWhere(schema.subscriptions, TEMPLO_CTX),
          eq(schema.subscriptions.id, sub.id),
        ),
      );

    // Reserva Wellhub pendiente lejos de la ventana (no interfiere con la
    // regla diaria ni la semanal): hoy + 9 dias.
    const lejos = addDays(todayInTz(tz), 9);
    const lejana = await insertActivityWithSchedule(app, {
      branchId: BRANCH_ID,
      dayOfWeek: isoDow(lejos),
    });
    await insertBooking(app, {
      memberId: userId,
      scheduleId: lejana.scheduleId,
      bookingDate: lejos,
      status: "reservado",
      source: "wellhub",
    });

    const propia = await insertActivityWithSchedule(app, {
      branchId: BRANCH_ID,
      dayOfWeek: isoDow(classDate),
    });
    const res = await memberReserve(token, propia.scheduleId, classDate);
    expect(res.statusCode).toBe(201);
  });

  // ─── #10-#11: webhook de check-in ──────────────────────────────────────────

  it("check-in Wellhub después del QR propio: se valida y quedan las dos asistencias", async () => {
    const socio = await createWellhubSocioActivo(app, adminToken, {
      planId: planTresPorSemanaId,
    });
    stubValidateFetch();

    // El socio ya hizo su propia clase hoy por QR.
    await insertAttendance(app, {
      memberId: socio.id,
      branchId: BRANCH_ID,
      sessionDate: today,
      source: "qr",
    });

    const res = await postCheckin(socio.gympassId);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).outcome).toBe("processed");

    const rows = await attendanceRows(socio.id);
    expect(rows.filter((r) => r.source === "qr")).toHaveLength(1);
    expect(rows.filter((r) => r.source === "wellhub")).toHaveLength(1);
  });

  it("check-in Wellhub confirma solo la reserva Wellhub, no la propia", async () => {
    const socio = await createWellhubSocioActivo(app, adminToken, {
      planId: planTresPorSemanaId,
    });
    stubValidateFetch();

    const { propia, otra } = await dosClasesEl(today);
    const propiaBookingId = await insertBooking(app, {
      memberId: socio.id,
      scheduleId: propia,
      bookingDate: today,
      status: "reservado",
      source: null,
    });
    const wellhubBookingId = await insertBooking(app, {
      memberId: socio.id,
      scheduleId: otra,
      bookingDate: today,
      status: "reservado",
      source: "wellhub",
    });

    const res = await postCheckin(socio.gympassId);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).outcome).toBe("processed");

    expect(await bookingStatus(wellhubBookingId)).toBe("confirmado");
    expect(await bookingStatus(propiaBookingId)).toBe("reservado");

    // La visita Wellhub quedo ligada a la clase Wellhub, no a la propia.
    const rows = await attendanceRows(socio.id);
    const visita = rows.find((r) => r.source === "wellhub");
    expect(visita?.scheduleId).toBe(otra);
  });
});
