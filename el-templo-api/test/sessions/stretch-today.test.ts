/**
 * Fase 213 Plan 04 (D-01, D-05, D-06, D-09, D-13, D-15, D-16): la oferta del día.
 *
 *   GET /api/sessions/stretch/today
 *
 * Reloj: cada caso fija solo `Date` en la hora de pared de la sede (21:05 por
 * defecto) del último día de la semana que pida, calculado desde el `Date.now()`
 * real y acotado a la semana 51 del plan. El reloj se fija ANTES de loguear (el
 * socio se crea ya con el reloj puesto) y se restaura en `afterEach`. Sin fechas
 * de calendario fijas ni ids de usuario fijos.
 *
 * `stretch_catalog` se re-siembra en cada caso (en CI la semilla de la migración
 * inserta 0 filas porque `exercises` está vacía). La sede 1 se fuerza a la zona
 * del caso (otros archivos le cambian la zona) y `day_modes` del día se fuerza
 * al modo del caso.
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  vi,
} from "vitest";
import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import * as schema from "../../src/db/schema";
import type { StretchArm } from "../../src/db/schema/stretch";
import { createTestApp, cleanAllTestData } from "../helpers";
import { tenantValues, tenantWhere } from "../../src/modules/shared/tenant";
import { shiftDate } from "../../src/modules/shared/week-dates";
import type { StretchTodayView } from "../../src/modules/sessions/stretch-service";
import { stretchArm } from "../../src/modules/sessions/stretch-timing";
import { CTX_TEMPLO, dayIdFor } from "./_free-blocks-fixtures";
import {
  AR_TZ,
  BRANCH_ID,
  DOW,
  LEVEL,
  NOMBRES_CATALOGO,
  arrangeStretchScenario,
  restoreStretchScenario,
  localClock,
  seedAttendance,
  seedClass,
  seedStretchSession,
  type Arranged,
  type ArrangeOpts,
} from "./_stretch-fixtures";

const ES_TZ = "Europe/Madrid";

describe("oferta de estiramiento del día: GET /api/sessions/stretch/today (213-04)", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    vi.useRealTimers();
    // La sede 1 vuelve a Buenos Aires (el caso de Madrid le cambia la zona).
    await app.db
      .update(schema.branches)
      .set({ timezone: AR_TZ })
      .where(
        and(
          tenantWhere(schema.branches, CTX_TEMPLO),
          eq(schema.branches.id, BRANCH_ID),
        ),
      );
    await cleanAllTestData(app);
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
  });

  afterEach(async () => {
    vi.useRealTimers();
    await restoreStretchScenario(app);
  });

  // ─── helpers ───────────────────────────────────────────────────────────

  /** Escenario completo de la oferta (ver `arrangeStretchScenario`). */
  function arrange(opts: ArrangeOpts = {}): Promise<Arranged> {
    return arrangeStretchScenario(app, opts);
  }

  async function getToday(
    token: string,
  ): Promise<{ status: number; body: StretchTodayView }> {
    const res = await app.inject({
      method: "GET",
      url: "/api/sessions/stretch/today",
      headers: { authorization: `Bearer ${token}` },
    });
    return {
      status: res.statusCode,
      body: JSON.parse(res.body) as StretchTodayView,
    };
  }

  async function offerRows(userId: number) {
    return app.db
      .select()
      .from(schema.stretchOffers)
      .where(
        and(
          tenantWhere(schema.stretchOffers, CTX_TEMPLO),
          eq(schema.stretchOffers.userId, userId),
        ),
      );
  }

  // ─── casos ─────────────────────────────────────────────────────────────

  it("(a) clase General terminada con asistencia QR: available con la rutina del día y la fila creada", async () => {
    const { date, member, attendanceId } = await arrange();

    const { status, body } = await getToday(member.token);

    expect(status).toBe(200);
    expect(body.status).toBe("available");
    expect(body.localDate).toBe(date);
    // Con 20 ejercicios en la lista la regla llena la meta de 5.
    expect(body.exercises).toHaveLength(5);
    for (const e of body.exercises) {
      expect(NOMBRES_CATALOGO.has(e.name)).toBe(true);
      expect(e.secondsPerSide).toBe(45);
      expect(e.transitionSeconds).toBe(10);
    }
    // Los prescritos que están en la lista van primero y siempre entran.
    const nombres = body.exercises.map((e) => e.name);
    expect(nombres).toContain("QUAD STANDING STRETCH");
    expect(nombres).toContain("PIKE STANDING");
    expect(body.plannedSeconds).toBeGreaterThan(0);
    expect(body.minutes).toBe(Math.round((body.plannedSeconds ?? 0) / 60));
    expect(body.minutes).toBeGreaterThan(0);
    expect(body.completedAt).toBeNull();
    expect(body.auraAwarded).toBe(false);

    const rows = await offerRows(member.id);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.id).toBe(body.offerId);
    expect(row.localDate).toBe(date);
    expect(row.attendanceId).toBe(attendanceId);
    expect(row.branchId).toBe(BRANCH_ID);
    expect(row.sourceDayId).toBe(dayIdFor(date, LEVEL));
    expect(row.classEndAt.getTime()).toBe(
      localClock(AR_TZ, date, "21:00").getTime(),
    );
    expect(row.plannedSeconds).toBe(body.plannedSeconds);
    expect(row.exercises.map((e) => e.name)).toEqual(nombres);
    expect(row.arm).toBe(stretchArm(member.id));
    expect(row.pushDecision).toBe(row.arm === "control" ? "control" : null);
  });

  it("(a2) el grupo del experimento queda fijo en la fila: control nace con push_decision control, los otros con null", async () => {
    const arms: StretchArm[] = ["control", "push_30", "push_60"];
    for (const arm of arms) {
      const { member } = await arrange({ arm });
      expect(stretchArm(member.id)).toBe(arm);

      const { body } = await getToday(member.token);
      expect(body.status).toBe("available");

      const [row] = await offerRows(member.id);
      expect(row.arm).toBe(arm);
      expect(row.pushDecision).toBe(arm === "control" ? "control" : null);
    }
  });

  it("(b) durante la clase (hora local antes del fin) devuelve none y no crea fila", async () => {
    const { member } = await arrange({ clock: "20:30" });

    const { status, body } = await getToday(member.token);

    expect(status).toBe(200);
    expect(body.status).toBe("none");
    expect(body.offerId).toBeNull();
    expect(body.exercises).toEqual([]);
    expect(await offerRows(member.id)).toHaveLength(0);
  });

  it("(c) una reserva sin check-in no habilita la oferta", async () => {
    const { date, member, scheduleId } = await arrange({ attend: false });
    await app.db.insert(schema.bookings).values(
      tenantValues(CTX_TEMPLO, {
        memberId: member.id,
        scheduleId,
        bookingDate: date,
      }),
    );

    const { body } = await getToday(member.token);

    expect(body.status).toBe("none");
    expect(await offerRows(member.id)).toHaveLength(0);
  });

  it("(d) visita Wellhub sin schedule_id devuelve none", async () => {
    const { date, member } = await arrange({ attend: false });
    await seedAttendance(app, {
      memberId: member.id,
      branchId: BRANCH_ID,
      scheduleId: null,
      sessionDate: date,
      source: "wellhub",
    });

    const { body } = await getToday(member.token);

    expect(body.status).toBe("none");
    expect(await offerRows(member.id)).toHaveLength(0);
  });

  it("(e1) actividad especial (Open Gym) devuelve none", async () => {
    const { member } = await arrange({
      activityName: "Open Gym",
      isSpecial: true,
    });

    const { body } = await getToday(member.token);

    expect(body.status).toBe("none");
    expect(await offerRows(member.id)).toHaveLength(0);
  });

  it("(e2) actividad que no es General (Yoga) devuelve none", async () => {
    const { member } = await arrange({ activityName: "Yoga" });

    const { body } = await getToday(member.token);

    expect(body.status).toBe("none");
    expect(await offerRows(member.id)).toHaveLength(0);
  });

  it("(f) día ROM devuelve none y no crea fila (D-06)", async () => {
    const { member } = await arrange({ dia: "sabado", mode: "rom" });

    const { body } = await getToday(member.token);

    expect(body.status).toBe("none");
    expect(await offerRows(member.id)).toHaveLength(0);
  });

  it("(g) día de técnica con bloque STRETCHING (la movilidad viene como main): available con esos ejercicios", async () => {
    const { member, date } = await arrange({ dia: "jueves", mode: "tecnica" });

    const { body } = await getToday(member.token);

    expect(body.status).toBe("available");
    const nombres = body.exercises.map((e) => e.name);
    expect(nombres).toContain("WARRIOR STRETCH");
    expect(nombres).toContain("COBRA STRETCH");
    const [row] = await offerRows(member.id);
    expect(row.sourceDayId).toBe(dayIdFor(date, LEVEL));
  });

  it("(h) día de combos devuelve available", async () => {
    const { member } = await arrange({ dia: "martes", mode: "combos" });

    const { body } = await getToday(member.token);

    expect(body.status).toBe("available");
    expect(body.exercises.length).toBeGreaterThan(0);
  });

  it("(i) dos asistencias el mismo día = una sola fila, la de la clase que termina primero (D-09)", async () => {
    const { date, member, dia } = await arrange();
    // Segunda clase General 18:00-19:00: termina antes que la de 20:00-21:00.
    const temprana = await seedClass(app, {
      branchId: BRANCH_ID,
      dayOfWeek: DOW[dia],
      startTime: "18:00",
      endTime: "19:00",
    });
    const tempranaAttendanceId = await seedAttendance(app, {
      memberId: member.id,
      branchId: BRANCH_ID,
      scheduleId: temprana.scheduleId,
      sessionDate: date,
    });

    const primera = await getToday(member.token);
    const segunda = await getToday(member.token);

    expect(primera.body.status).toBe("available");
    expect(segunda.body.offerId).toBe(primera.body.offerId);
    const rows = await offerRows(member.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].attendanceId).toBe(tempranaAttendanceId);
    expect(rows[0].classEndAt.getTime()).toBe(
      localClock(AR_TZ, date, "19:00").getTime(),
    );
  });

  it("(j) la primera consulta congela la rutina: desactivar el catálogo después no la cambia", async () => {
    const { member } = await arrange();

    const primera = await getToday(member.token);
    await app.db
      .update(schema.stretchCatalog)
      .set({ isActive: false })
      .where(tenantWhere(schema.stretchCatalog, CTX_TEMPLO));
    const segunda = await getToday(member.token);

    expect(primera.body.status).toBe("available");
    expect(segunda.body.status).toBe("available");
    expect(segunda.body.exercises.map((e) => e.exerciseId)).toEqual(
      primera.body.exercises.map((e) => e.exerciseId),
    );
    expect(segunda.body.plannedSeconds).toBe(primera.body.plannedSeconds);
    expect(await offerRows(member.id)).toHaveLength(1);
  });

  it("(k) con completed_at seteado en la fila devuelve done", async () => {
    const { member } = await arrange();
    const primera = await getToday(member.token);
    const completedAt = new Date();
    await app.db
      .update(schema.stretchOffers)
      .set({ completedAt, auraAwarded: true })
      .where(
        and(
          tenantWhere(schema.stretchOffers, CTX_TEMPLO),
          eq(schema.stretchOffers.userId, member.id),
        ),
      );

    const { body } = await getToday(member.token);

    expect(body.status).toBe("done");
    expect(body.offerId).toBe(primera.body.offerId);
    expect(body.completedAt).not.toBeNull();
    expect(body.auraAwarded).toBe(true);
    expect(body.exercises).toHaveLength(primera.body.exercises.length);
  });

  it("(l) una oferta de ayer sin asistencia hoy devuelve none y no crea fila nueva (D-12)", async () => {
    const { date, member } = await arrange({ attend: false });
    const ayer = shiftDate(date, -1);
    const exerciseId = (
      await app.db
        .select({ id: schema.stretchCatalog.exerciseId })
        .from(schema.stretchCatalog)
        .where(tenantWhere(schema.stretchCatalog, CTX_TEMPLO))
        .limit(1)
    )[0].id;
    await app.db.insert(schema.stretchOffers).values(
      tenantValues(CTX_TEMPLO, {
        userId: member.id,
        localDate: ayer,
        branchId: BRANCH_ID,
        sourceDayId: dayIdFor(ayer, LEVEL),
        classEndAt: new Date(),
        exercises: [
          { exerciseId, name: "CAT COW", family: "FL" as const, sides: 1 },
        ],
        plannedSeconds: 330,
        arm: "push_30" as const,
      }),
    );

    const { body } = await getToday(member.token);

    expect(body.status).toBe("none");
    expect(body.offerId).toBeNull();
    const rows = await offerRows(member.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].localDate).toBe(ayer);
  });

  it("(m) el nivel del espejo presencial manda sobre users.level (SPEC 2.3)", async () => {
    const { date, member } = await arrange();
    // El socio es sigma, pero ese día entrenó en alfa: la sesión es la de alfa.
    const sesionAlfa = await seedStretchSession(app, {
      date,
      level: "alfa",
      mode: "regular",
      blocks: [
        { role: "INITIUM", route: "OAP" },
        {
          role: "NUCLEUS",
          route: "OAP",
          mobility: [{ name: "CAT COW", mobilityRelated: "FL" }],
        },
      ],
    });
    await app.db.insert(schema.completedSessions).values(
      tenantValues(CTX_TEMPLO, {
        userId: member.id,
        dayId: `presencial-${date}`,
        sessionLevel: "alfa" as const,
        date,
        branchId: BRANCH_ID,
        startedAt: new Date(),
        completedAt: new Date(),
        blocksCompleted: [],
      }),
    );

    const { body } = await getToday(member.token);

    expect(body.status).toBe("available");
    const [row] = await offerRows(member.id);
    expect(row.sourceDayId).toBe(sesionAlfa.dayId);
    expect(row.sourceDayId).not.toBe(dayIdFor(date, LEVEL));
    // El prescrito de la sesión alfa (CAT COW, FL) va primero.
    expect(body.exercises[0].name).toBe("CAT COW");
  });

  it("(n) sede en Europe/Madrid: el fin de la clase es la hora de la sede, no la del proceso", async () => {
    const { member, date } = await arrange({ tz: ES_TZ });

    // 21:05 de Madrid: la clase de 20:00-21:00 ya terminó en la sede.
    const { body } = await getToday(member.token);

    expect(body.status).toBe("available");
    expect(body.localDate).toBe(date);
    const [row] = await offerRows(member.id);
    expect(row.classEndAt.getTime()).toBe(
      localClock(ES_TZ, date, "21:00").getTime(),
    );
  });

  it("sin token responde 401", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/sessions/stretch/today",
    });

    expect(res.statusCode).toBe(401);
  });
});
