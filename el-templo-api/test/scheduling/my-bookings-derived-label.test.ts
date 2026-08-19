/**
 * Phase 160 Plan 06 (SEM-14): etiqueta de clase derivada en las DOS fuentes
 * de ReservasPage del socio.
 *
 * `getWeeklyGrid` (159-06) ya deriva "Combos"/"Tecnica"/"General" de la
 * sesion aprobada del dia para el grid admin. Este plan aplica la MISMA
 * derivacion (via el helper compartido scheduling/derived-label.ts) a las
 * dos fuentes que alimentan la pantalla de reservas del socio:
 *
 * - `getMyBookings` (GET /api/members/scheduling/my-bookings) — reservas
 *   proximas del socio.
 * - `getMyWeeklyAttendance` (GET /api/members/scheduling/weekly, campo
 *   `myAttendance`) — linea "Asististe" de clases ya cursadas.
 *
 * Sin esto, un socio que reservo un miercoles de Tecnica veia "General" en
 * sus reservas, y ademas "Asististe" (asistencia) y "proximas reservas" del
 * MISMO dia podian mostrar nombres distintos entre si (el blocker que
 * marco el checker). Corre en CI contra el MySQL de test; el gate local es
 * solo tsc (no se corre el suite completo localmente).
 *
 * Casos:
 * - Reservas: combos -> "Combos", tecnica -> "Tecnica", dia sin sesion
 *   combos/tecnica -> conserva "General", actividad isSpecial en el mismo
 *   dia de combos NO se renombra (D-17).
 * - Asistencia: misma derivacion (combos/tecnica/General/isSpecial guard)
 *   sobre `getMyWeeklyAttendance`.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import {
  createTestApp,
  getAuthToken,
  registerUser,
  cleanAllTestData,
} from "../helpers";
import { activities } from "../../src/db/schema/activities";
import { branches } from "../../src/db/schema/branches";
import { schedules } from "../../src/db/schema/schedules";
import { sessions } from "../../src/db/schema/sessions";
import { bookings } from "../../src/db/schema/bookings";
import { attendance } from "../../src/db/schema/attendance";

const MEMBER_URL = "/api/members/scheduling";

interface BookingRow {
  id: number;
  scheduleId: number;
  activityName: string;
  dayOfWeek: number;
  isSpecial: boolean;
}

interface AttendanceRow {
  id: number;
  scheduleId: number;
  activityName: string;
  dayOfWeek: number;
}

describe("Phase 160-06: etiqueta derivada en getMyBookings y getMyWeeklyAttendance (SEM-14)", () => {
  let app: FastifyInstance;
  let testBranchId: number;
  let memberId: number;
  let memberToken: string;

  // Semana 5 SPOM (WEEK_ONE_MONDAY=2026-02-23): lunes 2026-03-23. Distinta
  // de la semana usada por derived-class-label.test.ts (159-06, semana 3)
  // para no colisionar si corren en paralelo contra el mismo MySQL de test.
  const WEEK = 5;
  const WEEK_START = "2026-03-23";
  const DAY_LUNES = 1; // sin sesion combos/tecnica -> conserva "General"
  const DAY_MARTES = 2; // combos
  const DAY_MIERCOLES = 3; // tecnica

  beforeAll(async () => {
    app = await createTestApp();

    const [branch] = await app.db
      .select({ id: branches.id })
      .from(branches)
      .where(eq(branches.isVirtual, false))
      .limit(1);
    testBranchId = branch.id;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    // cleanAllTestData borra users -- re-crear el socio en cada caso.
    const registered = await registerUser(app, {
      email: "sem14-derived@test.com",
      password: "pass123456",
      branchId: testBranchId,
    });
    memberId = (registered.user as { id: number }).id;
    memberToken = await getAuthToken(
      app,
      "sem14-derived@test.com",
      "pass123456",
    );
  });

  async function insertApprovedSession(
    day: string,
    sessionMode: string,
  ): Promise<void> {
    await app.db.insert(sessions).values({
      dayId: `W${WEEK}-${day}-alfa_delta-${sessionMode}-${Math.random()
        .toString(36)
        .slice(2, 8)}`,
      week: WEEK,
      day,
      levelGroup: "alfa_delta",
      blockCount: 1,
      sessionMode,
      status: "approved",
    });
  }

  async function seedActivitiesAndSchedules(): Promise<{
    generalId: number;
    specialId: number;
    scheduleLunesId: number;
    scheduleMartesId: number;
    scheduleMiercolesId: number;
    scheduleSpecialMartesId: number;
  }> {
    const [general] = await app.db
      .insert(activities)
      .values({ name: "General", description: "Clase grupal" })
      .$returningId();
    const [special] = await app.db
      .insert(activities)
      .values({
        name: "Yoga",
        description: "Actividad especial",
        isSpecial: true,
      })
      .$returningId();

    const [scheduleLunes] = await app.db
      .insert(schedules)
      .values({
        branchId: testBranchId,
        activityId: general.id,
        dayOfWeek: DAY_LUNES,
        startTime: "08:00",
        endTime: "09:00",
      })
      .$returningId();
    const [scheduleMartes] = await app.db
      .insert(schedules)
      .values({
        branchId: testBranchId,
        activityId: general.id,
        dayOfWeek: DAY_MARTES,
        startTime: "08:00",
        endTime: "09:00",
      })
      .$returningId();
    const [scheduleMiercoles] = await app.db
      .insert(schedules)
      .values({
        branchId: testBranchId,
        activityId: general.id,
        dayOfWeek: DAY_MIERCOLES,
        startTime: "08:00",
        endTime: "09:00",
      })
      .$returningId();
    const [scheduleSpecialMartes] = await app.db
      .insert(schedules)
      .values({
        branchId: testBranchId,
        activityId: special.id,
        dayOfWeek: DAY_MARTES,
        startTime: "09:00",
        endTime: "10:00",
      })
      .$returningId();

    return {
      generalId: general.id,
      specialId: special.id,
      scheduleLunesId: scheduleLunes.id,
      scheduleMartesId: scheduleMartes.id,
      scheduleMiercolesId: scheduleMiercoles.id,
      scheduleSpecialMartesId: scheduleSpecialMartes.id,
    };
  }

  async function getMyBookings(): Promise<{
    statusCode: number;
    bookings: BookingRow[];
  }> {
    const res = await app.inject({
      method: "GET",
      url: `${MEMBER_URL}/my-bookings?weekStart=${WEEK_START}`,
      headers: { authorization: `Bearer ${memberToken}` },
    });
    const body = JSON.parse(res.body) as { bookings: BookingRow[] };
    return { statusCode: res.statusCode, bookings: body.bookings };
  }

  async function getMyWeeklyAttendance(): Promise<{
    statusCode: number;
    myAttendance: AttendanceRow[];
  }> {
    const res = await app.inject({
      method: "GET",
      url: `${MEMBER_URL}/weekly?weekStart=${WEEK_START}&branchId=${testBranchId}`,
      headers: { authorization: `Bearer ${memberToken}` },
    });
    const body = JSON.parse(res.body) as { myAttendance: AttendanceRow[] };
    return { statusCode: res.statusCode, myAttendance: body.myAttendance };
  }

  it("getMyBookings deriva Combos/Tecnica/General y respeta la guarda isSpecial", async () => {
    const {
      generalId,
      specialId,
      scheduleLunesId,
      scheduleMartesId,
      scheduleMiercolesId,
      scheduleSpecialMartesId,
    } = await seedActivitiesAndSchedules();

    await insertApprovedSession("martes", "combos");
    await insertApprovedSession("miercoles", "tecnica");
    // Lunes: sin sesion combos/tecnica -> conserva "General".

    await app.db.insert(bookings).values([
      {
        memberId,
        scheduleId: scheduleLunesId,
        bookingDate: "2026-03-23", // lunes
        status: "reservado",
      },
      {
        memberId,
        scheduleId: scheduleMartesId,
        bookingDate: "2026-03-24", // martes
        status: "reservado",
      },
      {
        memberId,
        scheduleId: scheduleMiercolesId,
        bookingDate: "2026-03-25", // miercoles
        status: "reservado",
      },
      {
        // Guarda D-17: misma fecha (martes) de combos, actividad especial
        // -- no debe renombrarse.
        memberId,
        scheduleId: scheduleSpecialMartesId,
        bookingDate: "2026-03-24",
        status: "reservado",
      },
    ]);

    const { statusCode, bookings: rows } = await getMyBookings();
    expect(statusCode).toBe(200);

    const lunes = rows.find((r) => r.scheduleId === scheduleLunesId);
    const martes = rows.find((r) => r.scheduleId === scheduleMartesId);
    const miercoles = rows.find((r) => r.scheduleId === scheduleMiercolesId);
    const specialMartes = rows.find(
      (r) => r.scheduleId === scheduleSpecialMartesId,
    );

    expect(lunes?.activityName).toBe("General");
    expect(martes?.activityName).toBe("Combos");
    expect(miercoles?.activityName).toBe("Técnica");
    expect(specialMartes?.activityName).toBe("Yoga");
    expect(specialMartes?.isSpecial).toBe(true);

    // Sanity: los ids de actividad usados en el seed siguen siendo los
    // esperados (evita falsos positivos si el seed cambia).
    expect(generalId).toBeGreaterThan(0);
    expect(specialId).toBeGreaterThan(0);
  });

  it("getMyWeeklyAttendance ('Asististe') deriva la MISMA etiqueta que las reservas del mismo dia", async () => {
    const {
      scheduleLunesId,
      scheduleMartesId,
      scheduleMiercolesId,
      scheduleSpecialMartesId,
    } = await seedActivitiesAndSchedules();

    await insertApprovedSession("martes", "combos");
    await insertApprovedSession("miercoles", "tecnica");

    await app.db.insert(attendance).values([
      {
        memberId,
        branchId: testBranchId,
        scheduleId: scheduleLunesId,
        sessionDate: "2026-03-23",
        checkedInAt: new Date("2026-03-23T11:00:00Z"),
        status: "confirmado",
        source: "manual",
      },
      {
        memberId,
        branchId: testBranchId,
        scheduleId: scheduleMartesId,
        sessionDate: "2026-03-24",
        checkedInAt: new Date("2026-03-24T11:00:00Z"),
        status: "confirmado",
        source: "manual",
      },
      {
        memberId,
        branchId: testBranchId,
        scheduleId: scheduleMiercolesId,
        sessionDate: "2026-03-25",
        checkedInAt: new Date("2026-03-25T11:00:00Z"),
        status: "confirmado",
        source: "manual",
      },
      {
        // Guarda D-17: asistencia a una actividad especial el mismo dia de
        // combos -- no debe renombrarse.
        memberId,
        branchId: testBranchId,
        scheduleId: scheduleSpecialMartesId,
        sessionDate: "2026-03-24",
        checkedInAt: new Date("2026-03-24T12:00:00Z"),
        status: "confirmado",
        source: "manual",
      },
    ]);

    const { statusCode, myAttendance } = await getMyWeeklyAttendance();
    expect(statusCode).toBe(200);

    const lunes = myAttendance.find((r) => r.scheduleId === scheduleLunesId);
    const martes = myAttendance.find((r) => r.scheduleId === scheduleMartesId);
    const miercoles = myAttendance.find(
      (r) => r.scheduleId === scheduleMiercolesId,
    );
    const specialMartes = myAttendance.find(
      (r) => r.scheduleId === scheduleSpecialMartesId,
    );

    expect(lunes?.activityName).toBe("General");
    expect(martes?.activityName).toBe("Combos");
    expect(miercoles?.activityName).toBe("Técnica");
    expect(specialMartes?.activityName).toBe("Yoga");
  });
});
