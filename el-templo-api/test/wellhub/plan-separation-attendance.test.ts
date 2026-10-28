/**
 * Fase 204 D-18 — separacion plan vs Wellhub, lado asistencia.
 *
 * Una reserva o visita Wellhub de un socio activo NO le descuenta clases ni
 * consume su limite. Sitios cubiertos (matriz de fugas #1-#4 de 204-RESEARCH):
 *   #1 job mark-no-shows: el no-show Wellhub queda `no_show` pero no descuenta.
 *   #2 QR `bookingsInRange`: el QR del socio nunca consume una reserva Wellhub.
 *   #3 guardas de "una asistencia por dia" (fast path + dentro de la tx).
 *   #4 `countWeeklyAttendance`: las visitas Wellhub no gastan el cupo semanal.
 *
 * Control: una reserva propia con `source` NULL (filas legacy) SIGUE
 * descontando (helper NULL-safe).
 *
 * El QR exige que la clase este a +-20 min de "ahora" en la tz de la sede: se
 * siembra el slot con la hora actual de la sede (nada de fechas fijas).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import * as schema from "../../src/db/schema";
import { tenantWhere } from "../../src/modules/shared/tenant";
import { getWeekRange } from "../../src/modules/shared/date-utils";
import { generateQrToken } from "../../src/modules/shared/qr-token";
import { runMarkNoShows } from "../../src/jobs/mark-no-shows";
import {
  createTestApp,
  createTestPlan,
  cleanAllTestData,
  dateOffsetStr,
  getAuthToken,
} from "../helpers";
import {
  TEMPLO_CTX,
  branchToday,
  createWellhubSocioActivo,
  getBranchTimezone,
  insertActivityWithSchedule,
  insertAttendance,
  insertBooking,
  nowHHMMInTz,
} from "../fixtures/wellhub-personas";

const BRANCH_ID = 1;
const CHECK_IN_URL = "/api/members/attendance/check-in";

describe("Fase 204 D-18: separación plan vs Wellhub (asistencia)", () => {
  let app: FastifyInstance;
  let adminToken: string;
  let tz: string;
  let today: string;
  let planId: number;
  let planSemanalId: number;

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
    tz = await getBranchTimezone(app, BRANCH_ID);
  });

  afterAll(async () => {
    await cleanAllTestData(app);
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    today = await branchToday(app, BRANCH_ID);
    const suffix = Date.now().toString(36);
    // Plan con cupo mensual trackeado (classesPerWeek 3 x 30 dias).
    const plan = await createTestPlan(app, adminToken, {
      name: `Plan 204-02 ${suffix}`,
      classesPerWeek: 3,
      durationDays: 30,
    });
    planId = plan.id;
    // Plan de 1 clase por semana para el limite semanal.
    const semanal = await createTestPlan(app, adminToken, {
      name: `Plan semanal 204-02 ${suffix}`,
      classesPerWeek: 1,
      durationDays: 30,
    });
    planSemanalId = semanal.id;
  });

  async function remaining(subId: number): Promise<number | null> {
    const [row] = await app.db
      .select({ cr: schema.subscriptions.classesRemaining })
      .from(schema.subscriptions)
      .where(
        and(
          tenantWhere(schema.subscriptions, TEMPLO_CTX),
          eq(schema.subscriptions.id, subId),
        ),
      );
    return row?.cr ?? null;
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

  async function countAttendance(
    memberId: number,
    source: "qr" | "manual" | "wellhub" | "wellhub_manual",
  ): Promise<number> {
    const rows = await app.db
      .select({ id: schema.attendance.id })
      .from(schema.attendance)
      .where(
        and(
          tenantWhere(schema.attendance, TEMPLO_CTX),
          eq(schema.attendance.memberId, memberId),
          eq(schema.attendance.source, source),
        ),
      );
    return rows.length;
  }

  /** Clase "ahora mismo" en la sede: cae dentro de la ventana +-20 min del QR. */
  async function scheduleAhora(): Promise<{ scheduleId: number }> {
    const hhmm = nowHHMMInTz(tz);
    const { scheduleId } = await insertActivityWithSchedule(app, {
      branchId: BRANCH_ID,
      startTime: hhmm,
      endTime: hhmm,
    });
    return { scheduleId };
  }

  async function qrCheckIn(token: string) {
    return app.inject({
      method: "POST",
      url: CHECK_IN_URL,
      headers: { authorization: `Bearer ${token}` },
      payload: { qrToken: generateQrToken(BRANCH_ID) },
    });
  }

  it("no-show Wellhub de un socio activo: queda no_show y no descuenta clases", async () => {
    const socio = await createWellhubSocioActivo(app, adminToken, { planId });
    const antes = await remaining(socio.subscriptionId);
    expect(antes).not.toBeNull();

    const { scheduleId } = await insertActivityWithSchedule(app, {
      branchId: BRANCH_ID,
    });
    const bookingId = await insertBooking(app, {
      memberId: socio.id,
      scheduleId,
      bookingDate: dateOffsetStr(-2),
      status: "reservado",
      source: "wellhub",
    });

    const result = await runMarkNoShows(app.db);
    expect(result.updated).toBeGreaterThanOrEqual(1);

    // Sigue marcandose no_show (el reporte de Wellhub lo necesita)...
    expect(await bookingStatus(bookingId)).toBe("no_show");
    // ...pero el plan del socio queda intacto.
    expect(await remaining(socio.subscriptionId)).toBe(antes);
  });

  it("no-show propio con source NULL sigue descontando", async () => {
    const socio = await createWellhubSocioActivo(app, adminToken, { planId });
    const antes = await remaining(socio.subscriptionId);
    expect(antes).not.toBeNull();

    const { scheduleId } = await insertActivityWithSchedule(app, {
      branchId: BRANCH_ID,
    });
    const bookingId = await insertBooking(app, {
      memberId: socio.id,
      scheduleId,
      bookingDate: dateOffsetStr(-2),
      status: "reservado",
      source: null,
    });

    const result = await runMarkNoShows(app.db);
    expect(result.decremented).toBeGreaterThanOrEqual(1);

    expect(await bookingStatus(bookingId)).toBe("no_show");
    expect(await remaining(socio.subscriptionId)).toBe((antes ?? 0) - 1);
  });

  it("visita wellhub hoy no bloquea el QR propio", async () => {
    const socio = await createWellhubSocioActivo(app, adminToken, { planId });
    const antes = await remaining(socio.subscriptionId);
    expect(antes).not.toBeNull();

    await insertAttendance(app, {
      memberId: socio.id,
      branchId: BRANCH_ID,
      sessionDate: today,
      source: "wellhub",
    });
    const { scheduleId } = await scheduleAhora();
    await insertBooking(app, {
      memberId: socio.id,
      scheduleId,
      bookingDate: today,
      status: "reservado",
      source: null,
    });

    const res = await qrCheckIn(socio.token);
    expect(res.statusCode).toBe(201);
    expect(await countAttendance(socio.id, "qr")).toBe(1);
    expect(await remaining(socio.subscriptionId)).toBe((antes ?? 0) - 1);
  });

  it("visita wellhub_manual hoy no bloquea el QR propio", async () => {
    const socio = await createWellhubSocioActivo(app, adminToken, { planId });

    await insertAttendance(app, {
      memberId: socio.id,
      branchId: BRANCH_ID,
      sessionDate: today,
      source: "wellhub_manual",
    });
    const { scheduleId } = await scheduleAhora();
    await insertBooking(app, {
      memberId: socio.id,
      scheduleId,
      bookingDate: today,
      status: "reservado",
      source: null,
    });

    const res = await qrCheckIn(socio.token);
    expect(res.statusCode).toBe(201);
    expect(await countAttendance(socio.id, "qr")).toBe(1);
  });

  it("visitas Wellhub de la semana no consumen el límite semanal", async () => {
    // Plan de 1 clase por semana: si las visitas Wellhub contaran, el QR
    // propio quedaria bloqueado por "limite semanal".
    const socio = await createWellhubSocioActivo(app, adminToken, {
      planId: planSemanalId,
    });

    // Visitas Wellhub el lunes de esta semana (misma ventana que el conteo).
    const { monday } = getWeekRange(new Date());
    const lunes = new Date(`${monday}T12:00:00Z`);
    await insertAttendance(app, {
      memberId: socio.id,
      branchId: BRANCH_ID,
      sessionDate: monday,
      source: "wellhub",
      checkedInAt: lunes,
    });
    await insertAttendance(app, {
      memberId: socio.id,
      branchId: BRANCH_ID,
      sessionDate: monday,
      source: "wellhub_manual",
      checkedInAt: lunes,
    });

    const { scheduleId } = await scheduleAhora();
    await insertBooking(app, {
      memberId: socio.id,
      scheduleId,
      bookingDate: today,
      status: "reservado",
      source: null,
    });

    const res = await qrCheckIn(socio.token);
    expect(res.statusCode).toBe(201);
    expect(await countAttendance(socio.id, "qr")).toBe(1);
  });

  it("una asistencia propia de la semana SÍ consume el límite semanal (control)", async () => {
    const socio = await createWellhubSocioActivo(app, adminToken, {
      planId: planSemanalId,
    });

    const { monday } = getWeekRange(new Date());
    await insertAttendance(app, {
      memberId: socio.id,
      branchId: BRANCH_ID,
      sessionDate: monday,
      source: "qr",
      checkedInAt: new Date(`${monday}T12:00:00Z`),
    });

    const { scheduleId } = await scheduleAhora();
    await insertBooking(app, {
      memberId: socio.id,
      scheduleId,
      bookingDate: today,
      status: "reservado",
      source: null,
    });

    const res = await qrCheckIn(socio.token);
    expect(res.statusCode).toBe(400);
    expect(res.body).toContain("limite semanal");
  });

  it("el QR del socio no consume la reserva Wellhub de la clase", async () => {
    const socio = await createWellhubSocioActivo(app, adminToken, { planId });
    const antes = await remaining(socio.subscriptionId);
    expect(antes).not.toBeNull();

    // Unica reserva de hoy: la de Wellhub, en una clase dentro de la ventana.
    const { scheduleId } = await scheduleAhora();
    const bookingId = await insertBooking(app, {
      memberId: socio.id,
      scheduleId,
      bookingDate: today,
      status: "reservado",
      source: "wellhub",
    });

    const res = await qrCheckIn(socio.token);
    // Sin reserva propia el QR se rechaza...
    expect(res.statusCode).toBe(400);
    // ...la reserva Wellhub no pasa a qr_escaneado, no hay asistencia y no se
    // descuenta nada del plan.
    expect(await bookingStatus(bookingId)).toBe("reservado");
    expect(await countAttendance(socio.id, "qr")).toBe(0);
    expect(await remaining(socio.subscriptionId)).toBe(antes);
  });
});
