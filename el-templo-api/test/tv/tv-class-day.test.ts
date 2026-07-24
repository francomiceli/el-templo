/**
 * resolveClassDay — "que clase es la de hoy" para una sede (fase 164, plan 05).
 *
 * Integracion contra el MySQL de tests: lo que se prueba es justamente el cruce
 * entre tablas (day_modes + sessions + session_blocks + session_prescriptions)
 * y la resolucion de la fecha en la TZ de la SEDE, que es donde se rompen las
 * cosas de verdad (una sede espanola limpiando el estado a la hora argentina).
 *
 * Todas las corridas inyectan `now`: sin eso el test dependeria del reloj de la
 * maquina y seria verde o rojo segun el dia en que se corre.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { createTestApp, cleanAllTestData } from "../helpers";
import * as schema from "../../src/db/schema";
import { resolveClassDay } from "../../src/modules/tv/class-day";
import { buildRoster } from "../../src/modules/tv/roster";

const AR_TZ = "America/Argentina/Buenos_Aires";
const ES_TZ = "Europe/Madrid";

// Semana 1 del ancla SPOM (WEEK_ONE_MONDAY = 2026-02-23, lunes).
const TUESDAY_NOON_UTC = new Date("2026-02-24T15:00:00Z"); // martes, W1
const WEDNESDAY_NOON_UTC = new Date("2026-02-25T15:00:00Z"); // miercoles, W1
const SATURDAY_NOON_UTC = new Date("2026-02-28T15:00:00Z"); // sabado, W1
const SUNDAY_NOON_UTC = new Date("2026-03-01T15:00:00Z"); // domingo

let app: FastifyInstance;
let branchAr: { id: number; timezone: string };
let branchEs: { id: number; timezone: string };
let exerciseId: number;

function code(prefix: string): string {
  return `${prefix}${Date.now().toString(36).slice(-5)}`;
}

async function seedBranchesAndExercise(): Promise<void> {
  const [ar] = await app.db
    .insert(schema.branches)
    .values({
      name: "TV-AR",
      code: code("TVAR"),
      country: "AR",
      timezone: AR_TZ,
    })
    .$returningId();
  const [es] = await app.db
    .insert(schema.branches)
    .values({
      name: "TV-ES",
      code: code("TVES"),
      country: "ES",
      timezone: ES_TZ,
    })
    .$returningId();
  branchAr = { id: ar.id, timezone: AR_TZ };
  branchEs = { id: es.id, timezone: ES_TZ };

  const [ex] = await app.db
    .insert(schema.exercises)
    .values({
      pattern: "TRACCION",
      category: "pull",
      exercise: "Dominadas",
      effort: "high",
      route: "OAP",
      videoUrl: "exercises/42.mp4",
    })
    .$returningId();
  exerciseId = ex.id;
}

/** Crea una sesion aprobada con un bloque por rol y un ejercicio por bloque. */
async function seedSession(opts: {
  week: number;
  day: string;
  level: string;
  roles: string[];
  status?: string;
  sessionMode?: string;
}): Promise<void> {
  const [session] = await app.db
    .insert(schema.sessions)
    .values({
      dayId: `W${opts.week}-${opts.day}-${opts.level}`,
      week: opts.week,
      day: opts.day,
      levelGroup: opts.level === "sigma" ? "sigma" : "alfa_delta",
      blockCount: opts.roles.length,
      status: opts.status ?? "approved",
      sessionMode: opts.sessionMode ?? "regular",
    })
    .$returningId();

  for (let i = 0; i < opts.roles.length; i++) {
    const [block] = await app.db
      .insert(schema.sessionBlocks)
      .values({
        sessionId: session.id,
        blockId: `B-${session.id}-${i}`,
        role: opts.roles[i],
        route: "OAP",
        pattern: "TRACCION",
        intensity: 70,
        repsBudget: 40,
        formatId: 1,
        formatName: "AMRAP",
        formatParams: { type: "amrap", minutes: 10 },
        exerciseCount: 1,
        // sortOrder invertido a proposito: el roster ordena por ROL, no por esto.
        sortOrder: opts.roles.length - i,
      })
      .$returningId();

    await app.db.insert(schema.sessionPrescriptions).values([
      {
        blockId: block.id,
        exerciseId,
        exerciseName: `Ejercicio ${opts.roles[i]} ${opts.level}`,
        contraction: "CON",
        reps: 10,
        seconds: 0,
        rest: 60,
        sortOrder: 1,
        exerciseType: "main",
      },
      {
        blockId: block.id,
        exerciseId,
        exerciseName: "Movilidad de hombro",
        contraction: "ISO",
        reps: 0,
        seconds: 20,
        rest: 0,
        sortOrder: 999,
        exerciseType: "mobility",
      },
    ]);
  }
}

async function setDayMode(dayOfWeek: number, mode: string): Promise<void> {
  await app.db
    .delete(schema.dayModes)
    .where(eq(schema.dayModes.dayOfWeek, dayOfWeek));
  await app.db.insert(schema.dayModes).values({ dayOfWeek, sessionMode: mode });
}

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await cleanAllTestData(app);
  await seedBranchesAndExercise();
});

describe("resolveClassDay — sesion del dia por sede", () => {
  it("un dia habil con 3 niveles aprobados resuelve modo regular, niveles y roster", async () => {
    await setDayMode(2, "regular");
    for (const level of ["alfa", "delta", "sigma"]) {
      await seedSession({
        week: 1,
        day: "martes",
        level,
        roles: ["INITIUM", "NUCLEUS", "DEUTEROS_1", "EPIKOS"],
      });
    }

    const classDay = await resolveClassDay(app.db, branchAr, TUESDAY_NOON_UTC);

    expect(classDay.date).toBe("2026-02-24");
    expect(classDay.week).toBe(1);
    expect(classDay.dayName).toBe("martes");
    expect(classDay.mode).toBe("regular");
    expect(classDay.approved).toBe(true);
    // Orden canonico kairos-first: sin sesion kairos, arranca en alfa.
    expect(classDay.levels).toEqual(["alfa", "delta", "sigma"]);
    expect(classDay.sessions).toHaveLength(3);

    // El roster sale en orden canonico por rol, no por el sortOrder invertido
    // con el que se sembraron los bloques.
    expect(buildRoster(classDay).map((b) => b.role)).toEqual([
      "INITIUM",
      "NUCLEUS",
      "DEUTEROS_1",
      "EPIKOS",
    ]);

    // Las prescripciones vienen hidratadas, con la key del video del ejercicio
    // y la movilidad separable por exerciseType.
    const alfa = classDay.sessions.find((s) => s.memberLevel === "alfa")!;
    const initium = alfa.blocks.find((b) => b.role === "INITIUM")!;
    expect(initium.prescriptions).toHaveLength(2);
    expect(initium.prescriptions[0].videoKey).toBe("exercises/42.mp4");
    expect(
      initium.prescriptions.filter((p) => p.exerciseType === "mobility"),
    ).toHaveLength(1);
  });

  it("una sesion en draft NO cuenta: el TV queda en reposo sin error (D-09)", async () => {
    await setDayMode(3, "regular");
    await seedSession({
      week: 1,
      day: "miercoles",
      level: "alfa",
      roles: ["INITIUM", "NUCLEUS"],
      status: "draft",
    });

    const classDay = await resolveClassDay(
      app.db,
      branchAr,
      WEDNESDAY_NOON_UTC,
    );

    expect(classDay.approved).toBe(false);
    expect(classDay.sessions).toEqual([]);
    expect(classDay.levels).toEqual([]);
    // La fecha y la semana igual se resuelven: el reloj del TV sigue andando.
    expect(classDay.date).toBe("2026-02-25");
    expect(classDay.dayName).toBe("miercoles");
  });

  it("el sabado es dia ROM: zonas del cuerpo y solo dos tiers (D-23)", async () => {
    await setDayMode(6, "rom");
    for (const level of ["alfa", "delta"]) {
      await seedSession({
        week: 1,
        day: "sabado",
        level,
        roles: ["INITIUM", "ROM_LOWER", "ROM_CORE", "ROM_UPPER"],
        sessionMode: "rom",
      });
    }

    const classDay = await resolveClassDay(app.db, branchAr, SATURDAY_NOON_UTC);

    expect(classDay.dayName).toBe("sabado");
    expect(classDay.mode).toBe("rom");
    expect(classDay.approved).toBe(true);
    expect(classDay.levels).toEqual(["alfa", "delta"]);
    expect(buildRoster(classDay).map((b) => b.role)).toEqual([
      "INITIUM",
      "ROM_LOWER",
      "ROM_CORE",
      "ROM_UPPER",
    ]);
  });

  it("dos sedes con el MISMO instante resuelven dias distintos segun su TZ (D-14)", async () => {
    // 23:30 UTC: en Buenos Aires (UTC-3) todavia es martes 20:30; en Madrid
    // (UTC+1) ya es miercoles 00:30. Si la fecha se calculara en UTC o con la
    // TZ del server, las dos sedes verian la misma clase — y una de las dos
    // estaria mostrando la plani equivocada.
    const borderInstant = new Date("2026-02-24T23:30:00Z");
    await setDayMode(2, "regular");
    await setDayMode(3, "regular");
    await seedSession({
      week: 1,
      day: "martes",
      level: "alfa",
      roles: ["INITIUM", "NUCLEUS"],
    });
    await seedSession({
      week: 1,
      day: "miercoles",
      level: "alfa",
      roles: ["INITIUM", "EPIKOS"],
    });

    const ar = await resolveClassDay(app.db, branchAr, borderInstant);
    const es = await resolveClassDay(app.db, branchEs, borderInstant);

    expect(ar.date).toBe("2026-02-24");
    expect(ar.dayName).toBe("martes");
    expect(es.date).toBe("2026-02-25");
    expect(es.dayName).toBe("miercoles");
    expect(ar.date).not.toBe(es.date);

    // Y cada una resuelve SU sesion: la de martes no tiene EPIKOS.
    expect(buildRoster(ar).map((b) => b.role)).toEqual(["INITIUM", "NUCLEUS"]);
    expect(buildRoster(es).map((b) => b.role)).toEqual(["INITIUM", "EPIKOS"]);
  });

  it("el domingo no hay clase y no se consulta la DB de sesiones", async () => {
    // Sembrar una sesion de domingo (que no deberia existir) prueba que el
    // corte es por dia y no por ausencia de datos.
    await seedSession({
      week: 1,
      day: "domingo",
      level: "alfa",
      roles: ["INITIUM"],
    });

    const classDay = await resolveClassDay(app.db, branchAr, SUNDAY_NOON_UTC);

    expect(classDay.dayName).toBe("domingo");
    expect(classDay.approved).toBe(false);
    expect(classDay.sessions).toEqual([]);
    expect(buildRoster(classDay)).toEqual([]);
  });

  it("nunca lanza cuando no hay ninguna sesion sembrada para el dia", async () => {
    await setDayMode(2, "regular");

    await expect(
      resolveClassDay(app.db, branchAr, TUESDAY_NOON_UTC),
    ).resolves.toMatchObject({ approved: false, levels: [], sessions: [] });
  });
});
