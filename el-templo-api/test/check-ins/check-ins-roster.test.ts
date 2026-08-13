/**
 * Registros del día para el staff — GET /api/admin/check-ins/roster + campo
 * `checkIn` en la lista de asistencia del slot.
 *
 * Testea contra MySQL real: lista los asistentes de HOY de una sede con su
 * registro diario más reciente (energía/sueño/molestias), aplica el fallback de
 * 7 días cuando no registraron el día, ordena "peor primero", filtra por sede, y
 * restringe la audiencia a coach + admin/dueño (gestión/recepción NO). La fecha
 * se pasa explícita por query/param para no depender del reloj del server.
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from "vitest";
import type { FastifyInstance } from "fastify";
import {
  createTestApp,
  cleanAllTestData,
  createStaffUser,
  getAuthToken,
} from "../helpers";
import * as schema from "../../src/db/schema";

const TODAY = "2026-06-15";
const TWO_DAYS_AGO = "2026-06-13"; // dentro de la ventana de 7 días
const TEN_DAYS_AGO = "2026-06-05"; // fuera de la ventana

let seq = 0;

describe("Registros del día del staff (check-ins roster + slot)", () => {
  let app: FastifyInstance;
  let branchId: number;
  let otherBranchId: number;
  let coachToken: string;
  let adminToken: string;
  let ownerToken: string;
  let gestionToken: string;
  let recepcionToken: string;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    seq += 1;
    branchId = await insertBranch(`RD-${seq}`);
    otherBranchId = await insertBranch(`RD-OTHER-${seq}`);

    const stamp = `${seq}-${Date.now()}`;
    await createStaffUser(app, {
      email: `coach-${stamp}@test.com`,
      password: "secret123",
      firstName: "Caro",
      lastName: "Coach",
      role: "coach",
      branchId,
      country: "AR",
    });
    coachToken = await getAuthToken(app, `coach-${stamp}@test.com`, "secret123");

    await createStaffUser(app, {
      email: `admin-${stamp}@test.com`,
      password: "secret123",
      firstName: "Ana",
      lastName: "Admin",
      role: "admin",
      branchId,
      country: "AR",
    });
    adminToken = await getAuthToken(app, `admin-${stamp}@test.com`, "secret123");

    await createStaffUser(app, {
      email: `owner-${stamp}@test.com`,
      password: "secret123",
      firstName: "Otto",
      lastName: "Owner",
      role: "owner",
      branchId,
      country: "AR",
    });
    ownerToken = await getAuthToken(app, `owner-${stamp}@test.com`, "secret123");

    await createStaffUser(app, {
      email: `gestion-${stamp}@test.com`,
      password: "secret123",
      firstName: "Gaby",
      lastName: "Gestion",
      role: "gestion",
      branchId,
      country: "AR",
    });
    gestionToken = await getAuthToken(
      app,
      `gestion-${stamp}@test.com`,
      "secret123",
    );

    await createStaffUser(app, {
      email: `recepcion-${stamp}@test.com`,
      password: "secret123",
      firstName: "Rita",
      lastName: "Recepcion",
      role: "recepcion",
      branchId,
      country: "AR",
    });
    recepcionToken = await getAuthToken(
      app,
      `recepcion-${stamp}@test.com`,
      "secret123",
    );
  });

  // ─── helpers de seed ──────────────────────────────────────────────────────

  async function insertBranch(code: string): Promise<number> {
    const res = await app.db.insert(schema.branches).values({
      name: code,
      code,
      country: "AR",
      timezone: "America/Argentina/Buenos_Aires",
    });
    return Number(res[0].insertId);
  }

  async function insertMember(firstName: string, bId: number): Promise<number> {
    seq += 1;
    const res = await app.db.insert(schema.users).values({
      email: `rd-m-${seq}-${Date.now()}@test.com`,
      passwordHash: "x",
      firstName,
      lastName: `M${seq}`,
      role: "member",
      status: "activo",
      branchId: bId,
    });
    return Number(res[0].insertId);
  }

  async function insertSchedule(bId: number): Promise<number> {
    const [act] = await app.db.insert(schema.activities).values({
      name: `Act-${seq}-${Date.now()}`,
      branchId: bId,
    });
    const [sch] = await app.db.insert(schema.schedules).values({
      activityId: Number(act.insertId),
      branchId: bId,
      dayOfWeek: 1,
      startTime: "10:00",
      endTime: "11:00",
      isActive: true,
    });
    return Number(sch.insertId);
  }

  async function book(
    memberId: number,
    scheduleId: number,
    bId: number,
    date: string,
  ): Promise<void> {
    await app.db.insert(schema.bookings).values({
      memberId,
      scheduleId,
      branchId: bId,
      bookingDate: date,
      status: "reservado",
    });
  }

  async function attend(
    memberId: number,
    bId: number,
    date: string,
  ): Promise<void> {
    await app.db.insert(schema.attendance).values({
      memberId,
      branchId: bId,
      sessionDate: date,
      checkedInAt: new Date(`${date}T10:05:00Z`),
      source: "qr",
    });
  }

  async function seedCheckIn(
    userId: number,
    questionType: "energy" | "soreness" | "sleep",
    value: string,
    date: string,
    bodyArea?: string,
  ): Promise<void> {
    await app.db.insert(schema.checkInResponses).values({
      userId,
      questionType,
      value,
      bodyArea: bodyArea ?? null,
      date,
    });
  }

  function roster(token: string, bId: number = branchId, date = TODAY) {
    return app.inject({
      method: "GET",
      url: `/api/admin/check-ins/roster?branchId=${bId}&date=${date}`,
      headers: { authorization: `Bearer ${token}` },
    });
  }

  // ─── roster ───────────────────────────────────────────────────────────────

  it("lista los asistentes con su registro, el más preocupante primero", async () => {
    const scheduleId = await insertSchedule(branchId);
    const worst = await insertMember("Ana", branchId);
    const ok = await insertMember("Bruno", branchId);
    const noReg = await insertMember("Dario", branchId);

    await book(worst, scheduleId, branchId, TODAY);
    await book(ok, scheduleId, branchId, TODAY);
    await book(noReg, scheduleId, branchId, TODAY);

    // Ana llegó mal (energía baja + mal sueño); Bruno normal; Dario no registró.
    await seedCheckIn(worst, "energy", "bajo", TODAY);
    await seedCheckIn(worst, "sleep", "mal", TODAY);
    await seedCheckIn(ok, "energy", "normal", TODAY);

    const res = await roster(coachToken);
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);

    expect(body.attendeeCount).toBe(3); // los tres asisten
    expect(body.entries).toHaveLength(2); // sólo los dos con registro
    expect(body.entries[0].memberId).toBe(worst); // peor primero
    expect(body.entries[0].checkIn).toMatchObject({
      energy: "bajo",
      sleep: "mal",
      daysAgo: 0,
    });
    expect(body.entries[1].memberId).toBe(ok);
  });

  it("aplica el fallback: muestra el último registro de los últimos 7 días", async () => {
    const scheduleId = await insertSchedule(branchId);
    const m = await insertMember("Carla", branchId);
    await book(m, scheduleId, branchId, TODAY);
    // No registró hoy, pero sí hace 2 días.
    await seedCheckIn(m, "energy", "alto", TWO_DAYS_AGO);

    const res = await roster(coachToken);
    const body = JSON.parse(res.body);
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0].checkIn).toMatchObject({
      energy: "alto",
      daysAgo: 2,
      date: TWO_DAYS_AGO,
    });
  });

  it("excluye registros de más de 7 días (pero cuenta al asistente)", async () => {
    const scheduleId = await insertSchedule(branchId);
    const m = await insertMember("Vieja", branchId);
    await book(m, scheduleId, branchId, TODAY);
    await seedCheckIn(m, "energy", "normal", TEN_DAYS_AGO);

    const res = await roster(coachToken);
    const body = JSON.parse(res.body);
    expect(body.attendeeCount).toBe(1);
    expect(body.entries).toHaveLength(0);
  });

  it("cuenta a los que asisten por asistencia registrada (walk-in), no sólo reserva", async () => {
    const m = await insertMember("Elena", branchId);
    await attend(m, branchId, TODAY); // sin reserva, sólo attendance
    await seedCheckIn(m, "sleep", "bien", TODAY);

    const res = await roster(coachToken);
    const body = JSON.parse(res.body);
    expect(body.attendeeCount).toBe(1);
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0].memberId).toBe(m);
    expect(body.entries[0].checkIn.sleep).toBe("bien");
  });

  it("filtra por sede: no muestra asistentes de otra sucursal", async () => {
    const scheduleId = await insertSchedule(otherBranchId);
    const m = await insertMember("Ajeno", otherBranchId);
    await book(m, scheduleId, otherBranchId, TODAY);
    await seedCheckIn(m, "energy", "bajo", TODAY);

    const res = await roster(coachToken, branchId);
    const body = JSON.parse(res.body);
    expect(body.attendeeCount).toBe(0);
    expect(body.entries).toHaveLength(0);
  });

  it("incluye la zona del cuerpo cuando hay molestia", async () => {
    const scheduleId = await insertSchedule(branchId);
    const m = await insertMember("Sore", branchId);
    await book(m, scheduleId, branchId, TODAY);
    await seedCheckIn(m, "soreness", "moderada", TODAY, "espalda");

    const res = await roster(coachToken);
    const body = JSON.parse(res.body);
    expect(body.entries[0].checkIn).toMatchObject({
      soreness: "moderada",
      sorenessBodyArea: "espalda",
    });
  });

  // ─── audiencia (coach + admin/dueño; NO gestión/recepción) ──────────────────

  it("permite el acceso a coach, admin y dueño", async () => {
    for (const token of [coachToken, adminToken, ownerToken]) {
      const res = await roster(token);
      expect(res.statusCode).toBe(200);
    }
  });

  it("rechaza a gestión y recepción con 403", async () => {
    const g = await roster(gestionToken);
    expect(g.statusCode).toBe(403);
    const r = await roster(recepcionToken);
    expect(r.statusCode).toBe(403);
  });

  it("rechaza sin autenticación con 401", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/admin/check-ins/roster?branchId=${branchId}&date=${TODAY}`,
    });
    expect(res.statusCode).toBe(401);
  });

  // ─── campo checkIn en la lista de asistencia del slot ───────────────────────

  it("expone checkIn en el slot para coach, y lo oculta (null) para recepción", async () => {
    const scheduleId = await insertSchedule(branchId);
    const m = await insertMember("Slot", branchId);
    await book(m, scheduleId, branchId, TODAY);
    await seedCheckIn(m, "energy", "bajo", TODAY);

    const slotUrl = `/api/admin/attendance/slot/${scheduleId}/${TODAY}`;

    const coachRes = await app.inject({
      method: "GET",
      url: slotUrl,
      headers: { authorization: `Bearer ${coachToken}` },
    });
    expect(coachRes.statusCode).toBe(200);
    const coachMember = JSON.parse(coachRes.body).members.find(
      (x: { memberId: number }) => x.memberId === m,
    );
    expect(coachMember.checkIn).toMatchObject({ energy: "bajo", daysAgo: 0 });

    const recepRes = await app.inject({
      method: "GET",
      url: slotUrl,
      headers: { authorization: `Bearer ${recepcionToken}` },
    });
    expect(recepRes.statusCode).toBe(200);
    const recepMember = JSON.parse(recepRes.body).members.find(
      (x: { memberId: number }) => x.memberId === m,
    );
    expect(recepMember.checkIn).toBeNull();
  });
});
