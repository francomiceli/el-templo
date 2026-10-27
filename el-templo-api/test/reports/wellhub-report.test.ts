/**
 * Fase 204 (D-14/D-16/D-22) — reporte Wellhub por sede y mes + categoria
 * "Wellhub" del log de accesos.
 *
 * Las personas son las del brief (fixtures de `wellhub-personas.ts`): visitante
 * nuevo, ex-alumno inactivo y socio activo con gympass_id. El mes y las fechas
 * se calculan en la tz de la sede (`branchToday`), nunca fijos. Todo por
 * `app.inject`; ningun id de `users` hardcodeado.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import * as schema from "../../src/db/schema";
import { addDays, shiftMonth } from "../../src/modules/shared/date-utils";
import { tenantValues, tenantWhere } from "../../src/modules/shared/tenant";
import {
  cleanAllTestData,
  createTestApp,
  createTestPlan,
  getAuthToken,
} from "../helpers";
import {
  TEMPLO_CTX,
  branchToday,
  createWellhubExAlumno,
  createWellhubSocioActivo,
  createWellhubVisitor,
  insertActivityWithSchedule,
  insertAttendance,
  insertBooking,
  insertWellhubBookingRow,
  insertWellhubSlot,
} from "../fixtures/wellhub-personas";

const BRANCH_ID = 1;
const REPORT_URL = "/api/admin/reports/wellhub";
const ACCESS_URL = "/api/admin/reports/access";

interface ReportBody {
  month: string;
  branchId: number | null;
  validatedVisits: number;
  manualVisits: number;
  people: {
    unique: number;
    nuevos: number;
    exAlumnos: number;
    socios: number;
    visitsPerPerson: number;
  };
  peopleList: Array<{
    userId: number;
    name: string;
    kind: "nuevo" | "ex_alumno" | "socio";
    validatedVisits: number;
    manualVisits: number;
  }>;
  bookings: {
    confirmed: number;
    canceled: number;
    lateCanceled: number;
    rejected: number;
    noShows: number;
  };
  conversions: {
    count: number;
    ratePct: number;
    items: Array<{
      userId: number;
      name: string;
      kind: string;
      planName: string;
      localDate: string;
      branchName: string;
    }>;
  };
}

describe("Fase 204 D-14/D-16: reporte Wellhub y log de accesos", () => {
  let app: FastifyInstance;
  let adminToken: string;
  let planId: number;
  let planName: string;

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
  });

  afterAll(async () => {
    await cleanAllTestData(app);
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    planName = `Plan 204-11 ${Date.now().toString(36)}`;
    const plan = await createTestPlan(app, adminToken, {
      name: planName,
      classesPerWeek: 3,
      durationDays: 30,
    });
    planId = plan.id;
  });

  async function getReport(query: string): Promise<{
    statusCode: number;
    body: ReportBody;
  }> {
    const res = await app.inject({
      method: "GET",
      url: `${REPORT_URL}?${query}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    return { statusCode: res.statusCode, body: JSON.parse(res.body) };
  }

  /** Mes actual de la sede y su primer dia. */
  async function currentMonth(): Promise<{
    today: string;
    month: string;
    monthStart: string;
  }> {
    const today = await branchToday(app, BRANCH_ID);
    const month = today.slice(0, 7);
    return { today, month, monthStart: `${month}-01` };
  }

  /**
   * Siembra el caso del brief en el mes actual:
   *   - visitante nuevo: 2 visitas 'wellhub' + 1 'wellhub_manual' (y una
   *     suscripcion que arranca MANANA, para colgarle la conversion);
   *   - ex-alumno (suscripcion vencida): 1 'wellhub' hoy;
   *   - socio activo: 1 'wellhub' hoy.
   */
  async function seedMonth() {
    const { today, monthStart } = await currentMonth();

    const visitor = await createWellhubVisitor(app, { branchId: BRANCH_ID });
    await insertAttendance(app, {
      memberId: visitor.id,
      branchId: BRANCH_ID,
      sessionDate: monthStart,
      source: "wellhub",
    });
    await insertAttendance(app, {
      memberId: visitor.id,
      branchId: BRANCH_ID,
      sessionDate: monthStart,
      source: "wellhub",
    });
    await insertAttendance(app, {
      memberId: visitor.id,
      branchId: BRANCH_ID,
      sessionDate: monthStart,
      source: "wellhub_manual",
    });

    const exAlumno = await createWellhubExAlumno(app, adminToken, {
      branchId: BRANCH_ID,
      planId,
    });
    await insertAttendance(app, {
      memberId: exAlumno.id,
      branchId: BRANCH_ID,
      sessionDate: today,
      source: "wellhub",
    });

    const socio = await createWellhubSocioActivo(app, adminToken, {
      planId,
      branchId: BRANCH_ID,
    });
    // El alta arranca "hoy" en UTC: se fija el inicio al primer dia del mes para que
    // la visita de hoy (fecha local de la sede) quede cubierta sin depender de la hora.
    await app.db
      .update(schema.subscriptions)
      .set({ startDate: monthStart })
      .where(
        and(
          tenantWhere(schema.subscriptions, TEMPLO_CTX),
          eq(schema.subscriptions.id, socio.subscriptionId),
        ),
      );
    await insertAttendance(app, {
      memberId: socio.id,
      branchId: BRANCH_ID,
      sessionDate: today,
      source: "wellhub",
    });

    return { visitor, exAlumno, socio, today, monthStart };
  }

  it("reporte: visitas validadas y a mano por sede y mes", async () => {
    const { monthStart } = await seedMonth();
    const month = monthStart.slice(0, 7);

    const { statusCode, body } = await getReport(
      `month=${month}&branchId=${BRANCH_ID}`,
    );

    expect(statusCode).toBe(200);
    expect(body.month).toBe(month);
    expect(body.branchId).toBe(BRANCH_ID);
    // Validadas: visitante 2 + ex-alumno 1 + socio 1. A mano: solo la del visitante,
    // y NO suma a las validadas.
    expect(body.validatedVisits).toBe(4);
    expect(body.manualVisits).toBe(1);
  });

  it("reporte: personas clasificadas en nuevos, ex-alumnos y socios", async () => {
    const { visitor, exAlumno, socio, monthStart } = await seedMonth();
    const month = monthStart.slice(0, 7);

    const { statusCode, body } = await getReport(
      `month=${month}&branchId=${BRANCH_ID}`,
    );

    expect(statusCode).toBe(200);
    expect(body.people.unique).toBe(3);
    expect(body.people.nuevos).toBe(1);
    expect(body.people.exAlumnos).toBe(1);
    expect(body.people.socios).toBe(1);
    // 5 visitas (4 validadas + 1 a mano) / 3 personas = 1.666... -> 1 decimal.
    expect(body.people.visitsPerPerson).toBe(1.7);

    const byId = new Map(body.peopleList.map((p) => [p.userId, p]));
    expect(body.peopleList).toHaveLength(3);
    expect(byId.get(visitor.id)).toMatchObject({
      kind: "nuevo",
      validatedVisits: 2,
      manualVisits: 1,
    });
    expect(byId.get(exAlumno.id)).toMatchObject({
      kind: "ex_alumno",
      validatedVisits: 1,
      manualVisits: 0,
    });
    expect(byId.get(socio.id)).toMatchObject({
      kind: "socio",
      validatedVisits: 1,
      manualVisits: 0,
    });
    // Ordenado por visitas (la persona con mas visitas, primero).
    expect(body.peopleList[0].userId).toBe(visitor.id);
  });

  it("reporte: reservas, cancelaciones, no-shows y conversiones con tasa a socio", async () => {
    const { visitor, exAlumno, socio, today, monthStart } = await seedMonth();
    const month = monthStart.slice(0, 7);

    // Reservas: una por estado en un slot del mes + una confirmada en el mes siguiente
    // (no debe contarse).
    const { activityId, scheduleId } = await insertActivityWithSchedule(app, {
      branchId: BRANCH_ID,
    });
    const slotRowId = await insertWellhubSlot(app, {
      branchId: BRANCH_ID,
      activityId,
      scheduleId,
      sessionDate: monthStart,
    });
    // `wellhub_classes` es unica por (sede, actividad): el slot del mes siguiente
    // va en otra actividad.
    const nextMonthClass = await insertActivityWithSchedule(app, {
      branchId: BRANCH_ID,
    });
    const nextMonthSlotRowId = await insertWellhubSlot(app, {
      branchId: BRANCH_ID,
      activityId: nextMonthClass.activityId,
      scheduleId: nextMonthClass.scheduleId,
      sessionDate: `${shiftMonth(month, 1)}-01`,
    });
    await insertWellhubBookingRow(app, {
      userId: visitor.id,
      bookingId: null,
      wellhubSlotRowId: slotRowId,
      status: "confirmed",
    });
    await insertWellhubBookingRow(app, {
      userId: exAlumno.id,
      bookingId: null,
      wellhubSlotRowId: slotRowId,
      status: "canceled",
    });
    await insertWellhubBookingRow(app, {
      userId: socio.id,
      bookingId: null,
      wellhubSlotRowId: slotRowId,
      status: "late_canceled",
    });
    await insertWellhubBookingRow(app, {
      userId: visitor.id,
      bookingId: null,
      wellhubSlotRowId: slotRowId,
      status: "rejected",
    });
    await insertWellhubBookingRow(app, {
      userId: visitor.id,
      bookingId: null,
      wellhubSlotRowId: nextMonthSlotRowId,
      status: "confirmed",
    });

    // No-shows: solo cuenta el de reserva Wellhub. El del socio con reserva propia
    // (source NULL) queda afuera.
    await insertBooking(app, {
      memberId: visitor.id,
      scheduleId,
      bookingDate: monthStart,
      status: "no_show",
      source: "wellhub",
    });
    await insertBooking(app, {
      memberId: socio.id,
      scheduleId,
      bookingDate: monthStart,
      status: "no_show",
      source: null,
    });

    // Conversion del visitante: cuelga de una suscripcion programada (manana).
    const [sub] = await app.db.insert(schema.subscriptions).values(
      tenantValues(TEMPLO_CTX, {
        userId: visitor.id,
        planId,
        branchId: BRANCH_ID,
        status: "scheduled" as const,
        startDate: addDays(today, 1),
        endDate: addDays(today, 31),
        pricePaid: 15000,
        priceTypeApplied: "regular" as const,
      }),
    );
    await app.db.insert(schema.wellhubConversions).values(
      tenantValues(TEMPLO_CTX, {
        userId: visitor.id,
        subscriptionId: Number(sub.insertId),
        planId,
        branchId: BRANCH_ID,
        fromStatus: "wellhub",
        kind: "nuevo",
        localDate: today,
      }),
    );

    const { statusCode, body } = await getReport(
      `month=${month}&branchId=${BRANCH_ID}`,
    );

    expect(statusCode).toBe(200);
    expect(body.bookings).toEqual({
      confirmed: 1,
      canceled: 1,
      lateCanceled: 1,
      rejected: 1,
      noShows: 1,
    });
    expect(body.conversions.count).toBe(1);
    // 1 conversion / 3 personas unicas = 33 %.
    expect(body.conversions.ratePct).toBe(33);
    expect(body.conversions.items).toHaveLength(1);
    expect(body.conversions.items[0]).toMatchObject({
      userId: visitor.id,
      kind: "nuevo",
      planName,
      localDate: today,
    });
    expect(body.conversions.items[0].branchName.length).toBeGreaterThan(0);
  });

  it("reporte: el mes se corta con la fecha local de la sede", async () => {
    const { month, monthStart } = await currentMonth();
    const nextMonth = shiftMonth(month, 1);
    const nextMonthStart = `${nextMonth}-01`;
    const lastDayOfMonth = addDays(nextMonthStart, -1);
    const lastDayOfPrevMonth = addDays(monthStart, -1);

    const visitor = await createWellhubVisitor(app, { branchId: BRANCH_ID });
    for (const sessionDate of [
      lastDayOfPrevMonth,
      lastDayOfMonth,
      nextMonthStart,
    ]) {
      await insertAttendance(app, {
        memberId: visitor.id,
        branchId: BRANCH_ID,
        sessionDate,
        source: "wellhub",
        // El timestamp UTC cae en otro mes que la fecha local: no debe influir.
        checkedInAt: new Date(`${sessionDate}T02:00:00Z`),
      });
    }

    const current = await getReport(`month=${month}&branchId=${BRANCH_ID}`);
    expect(current.statusCode).toBe(200);
    // Solo la del ultimo dia del mes: la del mes anterior y la del siguiente quedan afuera.
    expect(current.body.validatedVisits).toBe(1);
    expect(current.body.people.unique).toBe(1);

    const next = await getReport(`month=${nextMonth}&branchId=${BRANCH_ID}`);
    expect(next.statusCode).toBe(200);
    expect(next.body.validatedVisits).toBe(1);
  });

  it("reporte: mes inválido responde 400", async () => {
    const wrongMonth = await getReport("month=2026-13");
    expect(wrongMonth.statusCode).toBe(400);
    expect((wrongMonth.body as unknown as { message: string }).message).toBe(
      "Mes inválido, usá AAAA-MM",
    );

    // El formato roto lo corta el schema (querystring), antes del servicio.
    const wrongFormat = await getReport("month=octubre");
    expect(wrongFormat.statusCode).toBe(400);
  });

  it("log de accesos: source=wellhub trae visitas validadas y a mano", async () => {
    const { today } = await currentMonth();
    const visitor = await createWellhubVisitor(app, { branchId: BRANCH_ID });
    const base = { memberId: visitor.id, branchId: BRANCH_ID, sessionDate: today };
    await insertAttendance(app, { ...base, source: "wellhub" });
    await insertAttendance(app, { ...base, source: "wellhub_manual" });
    await insertAttendance(app, { ...base, source: "qr" });
    await insertAttendance(app, { ...base, source: "manual" });

    const sourcesOf = async (query: string): Promise<string[]> => {
      const res = await app.inject({
        method: "GET",
        url: `${ACCESS_URL}?branchId=${BRANCH_ID}&${query}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as { rows: Array<{ source: string }> };
      return body.rows.map((r) => r.source).sort();
    };

    expect(await sourcesOf("source=wellhub")).toEqual([
      "wellhub",
      "wellhub_manual",
    ]);
    expect(await sourcesOf("source=manual")).toEqual(["manual"]);
    expect(await sourcesOf("source=qr")).toEqual(["qr"]);
    // Sin filtro vuelven las cuatro, con su fuente real (no "manual" para Wellhub).
    expect(await sourcesOf("")).toEqual([
      "manual",
      "qr",
      "wellhub",
      "wellhub_manual",
    ]);
  });
});
