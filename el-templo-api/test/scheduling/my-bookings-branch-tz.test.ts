/**
 * Fase 199 Plan 06 (D-03/D-04/D-06): GET /api/members/scheduling/my-bookings
 * enriquecido de forma ADITIVA con la sede de la CLASE (id, nombre, zona
 * horaria) y la hora de asistencia registrada (`checkedInAt`), conservando la
 * categoría de la reserva (`isSpecial` / `specialLine`).
 *
 * Sin declarar los campos en el response schema Fastify los recortaría en
 * silencio: estos tests leen el JSON real de la respuesta, no el servicio.
 *
 * Las fechas se calculan dentro de cada `it` relativas a hoy (el endpoint no
 * filtra por pasado/futuro: solo por la semana pedida), sin ids de `users`
 * hardcodeados.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import {
  createTestApp,
  getAuthToken,
  registerUser,
  cleanAllTestData,
  todayStr,
} from "../helpers";
import { activities } from "../../src/db/schema/activities";
import { branches } from "../../src/db/schema/branches";
import { schedules } from "../../src/db/schema/schedules";
import { bookings } from "../../src/db/schema/bookings";
import { attendance } from "../../src/db/schema/attendance";
import { addDays } from "../../src/modules/shared/date-utils";

const MEMBER_URL = "/api/members/scheduling";
const DEFAULT_TZ = "America/Argentina/Buenos_Aires";
const MADRID_CODE = "TZMAD199";

interface MyBookingRow {
  id: number;
  memberId: number;
  scheduleId: number;
  bookingDate: string;
  isSpecial: boolean;
  specialLine: string | null;
  branchId: number;
  branchName: string;
  branchTimezone: string;
  checkedInAt: string | null;
}

/** Lunes (UTC) de la semana en curso: ancla de la semana consultada. */
function mondayOfThisWeek(): string {
  const today = todayStr();
  const dow = new Date(`${today}T12:00:00Z`).getUTCDay(); // 0 = domingo
  const back = dow === 0 ? 6 : dow - 1;
  return addDays(today, -back);
}

describe("Fase 199-06: my-bookings con sede, zona y asistencia (D-03/D-04/D-06)", () => {
  let app: FastifyInstance;
  let testBranchId: number;
  let testBranchName: string;
  let testBranchTz: string;
  let madridBranchId: number;
  let memberId: number;
  let memberToken: string;
  let seq = 0;

  beforeAll(async () => {
    app = await createTestApp();

    const [branch] = await app.db
      .select({
        id: branches.id,
        name: branches.name,
        timezone: branches.timezone,
      })
      .from(branches)
      .where(eq(branches.isVirtual, false))
      .limit(1);
    testBranchId = branch.id;
    testBranchName = branch.name;
    testBranchTz = branch.timezone;

    // Sede propia de este test con zona distinta a la default (no se muta la
    // sede sembrada: otros archivos del worker la leen).
    await app.db
      .insert(branches)
      .values({
        name: "Sede Madrid 199-06",
        code: MADRID_CODE,
        timezone: "Europe/Madrid",
      })
      .onDuplicateKeyUpdate({ set: { timezone: "Europe/Madrid" } });
    const [madrid] = await app.db
      .select({ id: branches.id })
      .from(branches)
      .where(eq(branches.code, MADRID_CODE));
    madridBranchId = madrid.id;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    seq += 1;
    const email = `mybk-tz-${seq}-${Date.now()}@test.com`;
    const registered = await registerUser(app, {
      email,
      password: "pass123456",
      branchId: testBranchId,
    });
    memberId = (registered.user as { id: number }).id;
    memberToken = await getAuthToken(app, email, "pass123456");
  });

  async function seedSchedule(opts: {
    branchId: number;
    dayOfWeek: number;
    isSpecial?: boolean;
    specialLine?: string | null;
    startTime?: string;
  }): Promise<number> {
    const [activity] = await app.db
      .insert(activities)
      .values({
        name: opts.isSpecial ? "Yoga" : "General",
        description: "199-06",
        isSpecial: opts.isSpecial ?? false,
        specialLine: opts.specialLine ?? null,
      })
      .$returningId();
    const [schedule] = await app.db
      .insert(schedules)
      .values({
        branchId: opts.branchId,
        activityId: activity.id,
        dayOfWeek: opts.dayOfWeek,
        startTime: opts.startTime ?? "19:00",
        endTime: "20:00",
      })
      .$returningId();
    return schedule.id;
  }

  async function book(
    forMemberId: number,
    scheduleId: number,
    bookingDate: string,
  ): Promise<void> {
    await app.db.insert(bookings).values({
      memberId: forMemberId,
      scheduleId,
      bookingDate,
      status: "reservado",
    });
  }

  async function getMyBookings(
    weekStart: string,
    token = memberToken,
  ): Promise<MyBookingRow[]> {
    const res = await app.inject({
      method: "GET",
      url: `${MEMBER_URL}/my-bookings?weekStart=${weekStart}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode, res.body).toBe(200);
    return (JSON.parse(res.body) as { bookings: MyBookingRow[] }).bookings;
  }

  it("trae la sede de la clase (id, nombre, zona) y checkedInAt null sin asistencia", async () => {
    const weekStart = mondayOfThisWeek();
    const scheduleId = await seedSchedule({
      branchId: testBranchId,
      dayOfWeek: 1,
    });
    await book(memberId, scheduleId, weekStart);

    const rows = await getMyBookings(weekStart);

    expect(rows).toHaveLength(1);
    expect(rows[0].branchId).toBe(testBranchId);
    expect(rows[0].branchName).toBe(testBranchName);
    expect(rows[0].branchTimezone).toBe(testBranchTz);
    expect(rows[0].branchTimezone.length).toBeGreaterThan(0);
    expect(rows[0].checkedInAt).toBeNull();
  });

  it("la sede sembrada por defecto reporta la zona default de Argentina", async () => {
    const weekStart = mondayOfThisWeek();
    const scheduleId = await seedSchedule({
      branchId: testBranchId,
      dayOfWeek: 1,
    });
    await book(memberId, scheduleId, weekStart);

    const rows = await getMyBookings(weekStart);

    // La columna es NOT NULL con default: la zona de la sede de test ES la
    // default (el `?? DEFAULT_TENANT_TIMEZONE` del servicio es defensivo).
    expect(testBranchTz).toBe(DEFAULT_TZ);
    expect(rows[0].branchTimezone).toBe(DEFAULT_TZ);
  });

  it("una clase en una sede con zona Europe/Madrid devuelve esa zona (sede de la CLASE, no la del socio)", async () => {
    const weekStart = mondayOfThisWeek();
    const scheduleId = await seedSchedule({
      branchId: madridBranchId,
      dayOfWeek: 1,
    });
    await book(memberId, scheduleId, weekStart);

    const rows = await getMyBookings(weekStart);

    expect(rows).toHaveLength(1);
    // El socio es de testBranchId; la clase es de Madrid.
    expect(rows[0].branchId).toBe(madridBranchId);
    expect(rows[0].branchName).toBe("Sede Madrid 199-06");
    expect(rows[0].branchTimezone).toBe("Europe/Madrid");
  });

  it("dos reservas en sedes distintas traen cada una su sede y su zona", async () => {
    const weekStart = mondayOfThisWeek();
    const scheduleLocal = await seedSchedule({
      branchId: testBranchId,
      dayOfWeek: 1,
    });
    const scheduleMadrid = await seedSchedule({
      branchId: madridBranchId,
      dayOfWeek: 2,
    });
    await book(memberId, scheduleLocal, weekStart);
    await book(memberId, scheduleMadrid, addDays(weekStart, 1));

    const rows = await getMyBookings(weekStart);

    expect(rows).toHaveLength(2);
    const local = rows.find((r) => r.scheduleId === scheduleLocal);
    const madrid = rows.find((r) => r.scheduleId === scheduleMadrid);
    expect(local?.branchTimezone).toBe(testBranchTz);
    expect(madrid?.branchTimezone).toBe("Europe/Madrid");
  });

  it("checkedInAt es un ISO string cuando hay asistencia para ESA clase y fecha", async () => {
    const weekStart = mondayOfThisWeek();
    const scheduleId = await seedSchedule({
      branchId: testBranchId,
      dayOfWeek: 1,
    });
    await book(memberId, scheduleId, weekStart);
    await app.db.insert(attendance).values({
      memberId,
      branchId: testBranchId,
      scheduleId,
      sessionDate: weekStart,
    });
    const [saved] = await app.db
      .select({ checkedInAt: attendance.checkedInAt })
      .from(attendance)
      .where(
        and(
          eq(attendance.memberId, memberId),
          eq(attendance.scheduleId, scheduleId),
        ),
      );

    const rows = await getMyBookings(weekStart);

    expect(rows).toHaveLength(1);
    expect(typeof rows[0].checkedInAt).toBe("string");
    expect(rows[0].checkedInAt).toBe(saved.checkedInAt.toISOString());
    expect(new Date(rows[0].checkedInAt as string).toString()).not.toBe(
      "Invalid Date",
    );
  });

  it("una asistencia de OTRA clase o de OTRA fecha no marca la reserva", async () => {
    const weekStart = mondayOfThisWeek();
    const scheduleA = await seedSchedule({
      branchId: testBranchId,
      dayOfWeek: 1,
    });
    const scheduleB = await seedSchedule({
      branchId: testBranchId,
      dayOfWeek: 1,
      startTime: "20:00",
    });
    await book(memberId, scheduleA, weekStart);
    // Misma clase, otro día de la semana consultada.
    await app.db.insert(attendance).values({
      memberId,
      branchId: testBranchId,
      scheduleId: scheduleA,
      sessionDate: addDays(weekStart, 1),
    });
    // Otra clase, mismo día.
    await app.db.insert(attendance).values({
      memberId,
      branchId: testBranchId,
      scheduleId: scheduleB,
      sessionDate: weekStart,
    });

    const rows = await getMyBookings(weekStart);

    expect(rows).toHaveLength(1);
    expect(rows[0].scheduleId).toBe(scheduleA);
    expect(rows[0].checkedInAt).toBeNull();
  });

  it("la asistencia de otro socio a la misma clase no marca mi reserva", async () => {
    const weekStart = mondayOfThisWeek();
    const scheduleId = await seedSchedule({
      branchId: testBranchId,
      dayOfWeek: 1,
    });
    await book(memberId, scheduleId, weekStart);
    const other = await registerUser(app, {
      email: `mybk-tz-other-${Date.now()}@test.com`,
      password: "pass123456",
      branchId: testBranchId,
    });
    const otherId = (other.user as { id: number }).id;
    await app.db.insert(attendance).values({
      memberId: otherId,
      branchId: testBranchId,
      scheduleId,
      sessionDate: weekStart,
    });

    const rows = await getMyBookings(weekStart);

    expect(rows).toHaveLength(1);
    expect(rows[0].checkedInAt).toBeNull();
  });

  it("dos asistencias para la misma clase y fecha no duplican la reserva: gana la más temprana", async () => {
    const weekStart = mondayOfThisWeek();
    const scheduleId = await seedSchedule({
      branchId: testBranchId,
      dayOfWeek: 1,
    });
    await book(memberId, scheduleId, weekStart);
    const early = new Date(`${weekStart}T22:00:00Z`);
    const late = new Date(`${weekStart}T23:30:00Z`);
    // Se insertan en orden inverso: el orden por id no puede dar el resultado.
    await app.db.insert(attendance).values({
      memberId,
      branchId: testBranchId,
      scheduleId,
      sessionDate: weekStart,
      checkedInAt: late,
    });
    await app.db.insert(attendance).values({
      memberId,
      branchId: testBranchId,
      scheduleId,
      sessionDate: weekStart,
      checkedInAt: early,
    });

    const rows = await getMyBookings(weekStart);

    expect(rows).toHaveLength(1);
    expect(rows[0].checkedInAt).toBe(early.toISOString());
  });

  it("una asistencia sin clase (check-in forzado, scheduleId null) no marca ninguna reserva", async () => {
    const weekStart = mondayOfThisWeek();
    const scheduleId = await seedSchedule({
      branchId: testBranchId,
      dayOfWeek: 1,
    });
    await book(memberId, scheduleId, weekStart);
    await app.db.insert(attendance).values({
      memberId,
      branchId: testBranchId,
      scheduleId: null,
      sessionDate: weekStart,
    });

    const rows = await getMyBookings(weekStart);

    expect(rows).toHaveLength(1);
    expect(rows[0].checkedInAt).toBeNull();
  });

  it("no incluye reservas ajenas", async () => {
    const weekStart = mondayOfThisWeek();
    const scheduleId = await seedSchedule({
      branchId: testBranchId,
      dayOfWeek: 1,
    });
    await book(memberId, scheduleId, weekStart);
    const otherEmail = `mybk-tz-ajeno-${Date.now()}@test.com`;
    const other = await registerUser(app, {
      email: otherEmail,
      password: "pass123456",
      branchId: testBranchId,
    });
    const otherId = (other.user as { id: number }).id;
    const otherSchedule = await seedSchedule({
      branchId: madridBranchId,
      dayOfWeek: 2,
    });
    await book(otherId, otherSchedule, addDays(weekStart, 1));
    const otherToken = await getAuthToken(app, otherEmail, "pass123456");

    const mine = await getMyBookings(weekStart);
    const theirs = await getMyBookings(weekStart, otherToken);

    expect(mine.map((r) => r.memberId)).toEqual([memberId]);
    expect(mine.map((r) => r.scheduleId)).toEqual([scheduleId]);
    expect(theirs.map((r) => r.memberId)).toEqual([otherId]);
    expect(theirs[0].branchTimezone).toBe("Europe/Madrid");
  });

  it("D-06: cada reserva trae su categoría (isSpecial / specialLine) además de los campos nuevos", async () => {
    const weekStart = mondayOfThisWeek();
    const regular = await seedSchedule({
      branchId: testBranchId,
      dayOfWeek: 1,
    });
    const special = await seedSchedule({
      branchId: testBranchId,
      dayOfWeek: 1,
      isSpecial: true,
      specialLine: "yoga",
      startTime: "20:00",
    });
    const aura = await seedSchedule({
      branchId: testBranchId,
      dayOfWeek: 2,
      isSpecial: true,
      specialLine: null,
    });
    await book(memberId, regular, weekStart);
    await book(memberId, special, weekStart);
    await book(memberId, aura, addDays(weekStart, 1));

    const rows = await getMyBookings(weekStart);

    expect(rows).toHaveLength(3);
    const byId = new Map(rows.map((r) => [r.scheduleId, r]));
    expect(byId.get(regular)?.isSpecial).toBe(false);
    expect(byId.get(regular)?.specialLine).toBeNull();
    expect(byId.get(special)?.isSpecial).toBe(true);
    expect(byId.get(special)?.specialLine).toBe("yoga");
    expect(byId.get(aura)?.isSpecial).toBe(true);
    expect(byId.get(aura)?.specialLine).toBeNull();
    for (const r of rows) {
      expect(typeof r.isSpecial).toBe("boolean");
      expect(typeof r.branchTimezone).toBe("string");
      expect(r.branchId).toBe(testBranchId);
    }
  });

  it("401 sin token", async () => {
    const res = await app.inject({
      method: "GET",
      url: `${MEMBER_URL}/my-bookings?weekStart=${mondayOfThisWeek()}`,
    });
    expect(res.statusCode).toBe(401);
  });
});
