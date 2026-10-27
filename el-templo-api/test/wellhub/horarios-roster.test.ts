/**
 * Fase 204 D-10 — Horarios marca las reservas Wellhub.
 *
 * Los dos rosters de Horarios exponen el origen de cada reserva:
 *   - vista de hoy/pasado (`GET /api/admin/attendance/slot/:scheduleId/:date`):
 *     `isWellhub` desde la reserva (antes del check-in) o desde la visita
 *     (`wellhub` / `wellhub_manual`). Marca la reserva, no a la persona: un socio
 *     activo que reservó por Wellhub tambien sale true.
 *   - vista futura (`GET /api/admin/scheduling/schedules/:scheduleId/detail`):
 *     cada reserva trae `source` ('wellhub' o null en filas propias/legacy).
 *
 * Todo via `app.inject` para ejercitar la serializacion de la respuesta
 * (fast-json-stringify descarta lo que el schema no declara).
 * Fechas relativas a "hoy" en la tz de la sede.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import {
  createTestApp,
  createTestMember,
  createTestPlan,
  cleanAllTestData,
  dateOffsetStr,
  getAuthToken,
} from "../helpers";
import {
  branchToday,
  createWellhubSocioActivo,
  createWellhubVisitor,
  insertActivityWithSchedule,
  insertAttendance,
  insertBooking,
} from "../fixtures/wellhub-personas";

const BRANCH_ID = 1;

interface RosterMember {
  memberId: number;
  bookingId: number | null;
  attendanceId: number | null;
  source: string | null;
  isWellhub: boolean;
}

interface RosterBody {
  members: RosterMember[];
}

interface DetailBooking {
  id: number;
  memberId: number;
  source?: string | null;
}

interface DetailBody {
  bookings: DetailBooking[];
}

describe("Fase 204 D-10: Horarios marca las reservas Wellhub", () => {
  let app: FastifyInstance;
  let adminToken: string;
  let today: string;
  let planId: number;

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
    today = await branchToday(app, BRANCH_ID);
    const plan = await createTestPlan(app, adminToken, {
      name: `Plan 204-06 ${Date.now().toString(36)}`,
      classesPerWeek: 3,
      durationDays: 30,
    });
    planId = plan.id;
  });

  async function getRoster(scheduleId: number, date: string) {
    const res = await app.inject({
      method: "GET",
      url: `/api/admin/attendance/slot/${scheduleId}/${date}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    return {
      statusCode: res.statusCode,
      body: JSON.parse(res.body) as RosterBody,
    };
  }

  async function getDetail(scheduleId: number, date: string) {
    const res = await app.inject({
      method: "GET",
      url: `/api/admin/scheduling/schedules/${scheduleId}/detail?date=${date}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    return {
      statusCode: res.statusCode,
      body: JSON.parse(res.body) as DetailBody,
    };
  }

  it("roster de hoy: visitante con reserva Wellhub sale isWellhub antes del check-in", async () => {
    const { scheduleId } = await insertActivityWithSchedule(app, {
      branchId: BRANCH_ID,
    });
    const visitor = await createWellhubVisitor(app, { branchId: BRANCH_ID });
    const bookingId = await insertBooking(app, {
      memberId: visitor.id,
      scheduleId,
      bookingDate: today,
      source: "wellhub",
    });

    const { statusCode, body } = await getRoster(scheduleId, today);

    expect(statusCode).toBe(200);
    const item = body.members.find((m) => m.memberId === visitor.id);
    expect(item).toBeDefined();
    expect(item?.bookingId).toBe(bookingId);
    expect(item?.attendanceId).toBeNull();
    expect(item?.isWellhub).toBe(true);
  });

  it("roster de hoy: socio activo que reservó por Wellhub sale isWellhub", async () => {
    const { scheduleId } = await insertActivityWithSchedule(app, {
      branchId: BRANCH_ID,
    });
    const socio = await createWellhubSocioActivo(app, adminToken, { planId });
    await insertBooking(app, {
      memberId: socio.id,
      scheduleId,
      bookingDate: today,
      source: "wellhub",
    });

    const { statusCode, body } = await getRoster(scheduleId, today);

    expect(statusCode).toBe(200);
    const item = body.members.find((m) => m.memberId === socio.id);
    expect(item?.isWellhub).toBe(true);
  });

  it("roster de hoy: reserva propia sale isWellhub false", async () => {
    const { scheduleId } = await insertActivityWithSchedule(app, {
      branchId: BRANCH_ID,
    });
    // Una reserva propia con source NULL (legacy) y otra con source 'admin'.
    const legacy = await createTestMember(app, { branchId: BRANCH_ID });
    const byAdmin = await createTestMember(app, { branchId: BRANCH_ID });
    await insertBooking(app, {
      memberId: legacy.id,
      scheduleId,
      bookingDate: today,
      source: null,
    });
    await insertBooking(app, {
      memberId: byAdmin.id,
      scheduleId,
      bookingDate: today,
      source: "admin",
    });
    // Asistencia propia (qr) de un tercero sin reserva: tampoco es Wellhub.
    const walkIn = await createTestMember(app, { branchId: BRANCH_ID });
    await insertAttendance(app, {
      memberId: walkIn.id,
      branchId: BRANCH_ID,
      scheduleId,
      sessionDate: today,
      source: "qr",
    });

    const { statusCode, body } = await getRoster(scheduleId, today);

    expect(statusCode).toBe(200);
    for (const id of [legacy.id, byAdmin.id, walkIn.id]) {
      const item = body.members.find((m) => m.memberId === id);
      expect(item).toBeDefined();
      expect(item?.isWellhub).toBe(false);
    }
  });

  it("roster de hoy: visita wellhub_manual sale isWellhub", async () => {
    const { scheduleId } = await insertActivityWithSchedule(app, {
      branchId: BRANCH_ID,
    });
    // Con reserva Wellhub y presente a mano.
    const withBooking = await createWellhubVisitor(app, {
      branchId: BRANCH_ID,
    });
    await insertBooking(app, {
      memberId: withBooking.id,
      scheduleId,
      bookingDate: today,
      status: "confirmado",
      source: "wellhub",
    });
    const attendanceId = await insertAttendance(app, {
      memberId: withBooking.id,
      branchId: BRANCH_ID,
      scheduleId,
      sessionDate: today,
      source: "wellhub_manual",
    });
    // Visita Wellhub sin reserva (walk-in): tambien sale isWellhub.
    const walkIn = await createWellhubVisitor(app, { branchId: BRANCH_ID });
    await insertAttendance(app, {
      memberId: walkIn.id,
      branchId: BRANCH_ID,
      scheduleId,
      sessionDate: today,
      source: "wellhub_manual",
    });

    const { statusCode, body } = await getRoster(scheduleId, today);

    expect(statusCode).toBe(200);
    const booked = body.members.find((m) => m.memberId === withBooking.id);
    expect(booked?.attendanceId).toBe(attendanceId);
    expect(booked?.source).toBe("wellhub_manual");
    expect(booked?.isWellhub).toBe(true);
    const walk = body.members.find((m) => m.memberId === walkIn.id);
    expect(walk?.bookingId).toBeNull();
    expect(walk?.source).toBe("wellhub_manual");
    expect(walk?.isWellhub).toBe(true);
  });

  it("detalle futuro: la reserva Wellhub trae source wellhub y la propia null", async () => {
    // Fecha futura que no caiga domingo (dayOfWeek del schema: 1=lunes..6=sabado).
    let offset = 3;
    let futureDate = dateOffsetStr(offset);
    while (new Date(`${futureDate}T00:00:00Z`).getUTCDay() === 0) {
      offset += 1;
      futureDate = dateOffsetStr(offset);
    }
    const dayOfWeek = new Date(`${futureDate}T00:00:00Z`).getUTCDay();
    const { scheduleId } = await insertActivityWithSchedule(app, {
      branchId: BRANCH_ID,
      dayOfWeek,
    });
    const visitor = await createWellhubVisitor(app, { branchId: BRANCH_ID });
    const own = await createTestMember(app, { branchId: BRANCH_ID });
    await insertBooking(app, {
      memberId: visitor.id,
      scheduleId,
      bookingDate: futureDate,
      source: "wellhub",
    });
    await insertBooking(app, {
      memberId: own.id,
      scheduleId,
      bookingDate: futureDate,
      source: null,
    });

    const { statusCode, body } = await getDetail(scheduleId, futureDate);

    expect(statusCode).toBe(200);
    const wellhubBooking = body.bookings.find((b) => b.memberId === visitor.id);
    expect(wellhubBooking?.source).toBe("wellhub");
    const ownBooking = body.bookings.find((b) => b.memberId === own.id);
    expect(ownBooking).toBeDefined();
    // Fila propia/legacy: source viaja explicito como null (no omitido).
    expect(ownBooking?.source).toBeNull();
  });
});
