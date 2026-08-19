/**
 * TvService — expire-on-read, clamp y armado del payload (fase 164, plan 05).
 *
 * El plan no listaba archivo de test para el servicio, pero su propio
 * `<threat_model>` asigna `mitigate` a tres amenazas que solo se pueden
 * verificar ejercitandolo:
 *
 *  - T-164-21: el payload no puede llevar datos de socio.
 *  - T-164-22: sin sesion aprobada el reposo es SILENCIOSO (D-09) — ni un campo
 *    de error que le cuente a un socio la cocina interna del gimnasio.
 *  - T-164-23: un estado de AYER no se puede mostrar como si fuera de hoy, y la
 *    caducidad se decide en la TZ de la SEDE (cubierto con Europe/Madrid).
 *
 * Integracion contra MySQL real: el expire-on-read depende de como el driver
 * devuelve la columna `class_date`, que es exactamente donde estaba el riesgo.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { createTestApp, cleanAllTestData } from "../helpers";
import * as schema from "../../src/db/schema";
import { TvService } from "../../src/modules/tv/service";
import { resolveClassDay } from "../../src/modules/tv/class-day";
import type { TvControlState } from "../../src/modules/tv/types";

const AR_TZ = "America/Argentina/Buenos_Aires";
const ES_TZ = "Europe/Madrid";

// Martes de la semana 1 del ancla SPOM (WEEK_ONE_MONDAY = 2026-02-23).
const TUESDAY_NOON_UTC = new Date("2026-02-24T15:00:00Z");
const TUESDAY_DATE = "2026-02-24";
const MONDAY_DATE = "2026-02-23";

let app: FastifyInstance;
let service: TvService;
let branchArId: number;
let branchEsId: number;
let exerciseId: number;

function code(prefix: string): string {
  return `${prefix}${Date.now().toString(36).slice(-5)}`;
}

async function seedBranches(): Promise<void> {
  const [ar] = await app.db
    .insert(schema.branches)
    .values({ name: "Mogotes", code: code("TVS"), timezone: AR_TZ })
    .$returningId();
  const [es] = await app.db
    .insert(schema.branches)
    .values({ name: "Barcelona", code: code("TVE"), timezone: ES_TZ })
    .$returningId();
  branchArId = ar.id;
  branchEsId = es.id;

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

/**
 * Siembra una sesion aprobada del martes W1 para un nivel, con un ejercicio
 * "main" por bloque mas una movilidad, y `exerciseCount` ejercicios en NUCLEUS.
 */
async function seedSession(opts: {
  level: string;
  roles: string[];
  nucleusExercises?: number;
  mobilityName?: string;
}): Promise<void> {
  const [session] = await app.db
    .insert(schema.sessions)
    .values({
      dayId: `W1-martes-${opts.level}`,
      week: 1,
      day: "martes",
      levelGroup: opts.level === "sigma" ? "sigma" : "alfa_delta",
      blockCount: opts.roles.length,
      status: "approved",
    })
    .$returningId();

  for (let i = 0; i < opts.roles.length; i++) {
    const role = opts.roles[i];
    const [block] = await app.db
      .insert(schema.sessionBlocks)
      .values({
        sessionId: session.id,
        blockId: `B-${session.id}-${i}`,
        role,
        route: "OAP",
        pattern: "TRACCION",
        intensity: 70,
        repsBudget: 40,
        formatId: 1,
        formatName: "AMRAP",
        formatParams:
          role === "NUCLEUS"
            ? { type: "amrap", minutes: 10 }
            : { type: "tabata", workSeconds: 20, restSeconds: 10, rounds: 8 },
        exerciseCount: 1,
        sortOrder: i,
      })
      .$returningId();

    const count = role === "NUCLEUS" ? (opts.nucleusExercises ?? 1) : 1;
    for (let e = 0; e < count; e++) {
      await app.db.insert(schema.sessionPrescriptions).values({
        blockId: block.id,
        exerciseId,
        exerciseName: `${role}-${opts.level}-${e}`,
        contraction: "CON",
        reps: 8,
        repsMax: 10,
        seconds: 0,
        rest: 60,
        sortOrder: e,
        exerciseType: "main",
      });
    }
    await app.db.insert(schema.sessionPrescriptions).values({
      blockId: block.id,
      exerciseId,
      exerciseName: opts.mobilityName ?? "Movilidad de hombro",
      contraction: "ISO",
      reps: 0,
      seconds: 20,
      rest: 0,
      sortOrder: 999,
      exerciseType: "mobility",
    });
  }
}

async function writeState(opts: {
  branchId: number;
  classDate: string;
  blockRole: string;
  level: string;
  exerciseIndex?: number;
  screen?: string;
  timerStatus?: string;
  timerStartedAt?: Date | null;
}): Promise<void> {
  await app.db.insert(schema.tvClassState).values({
    branchId: opts.branchId,
    classDate: opts.classDate,
    blockRole: opts.blockRole,
    level: opts.level,
    exerciseIndex: opts.exerciseIndex ?? 0,
    screen: opts.screen ?? "class",
    timerStatus: opts.timerStatus ?? "idle",
    timerStartedAt: opts.timerStartedAt ?? null,
  });
}

beforeAll(async () => {
  app = await createTestApp();
  service = new TvService(app.db, app.log);
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await cleanAllTestData(app);
  await seedBranches();
});

describe("TvService.readState — expire-on-read (D-07 / T-164-23)", () => {
  it("devuelve el estado cuando la fila es del dia en curso", async () => {
    await writeState({
      branchId: branchArId,
      classDate: TUESDAY_DATE,
      blockRole: "NUCLEUS",
      level: "delta",
      exerciseIndex: 2,
      timerStatus: "running",
      timerStartedAt: new Date("2026-02-24T15:00:00.123Z"),
    });

    const state = await service.readState(branchArId, TUESDAY_DATE);

    expect(state).not.toBeNull();
    expect(state?.blockRole).toBe("NUCLEUS");
    expect(state?.level).toBe("delta");
    expect(state?.exerciseIndex).toBe(2);
    expect(state?.timerStatus).toBe("running");
    // Epoch ms con milisegundos conservados (timestamp fsp 3 de la fase 01).
    expect(state?.timerStartedAt).toBe(
      new Date("2026-02-24T15:00:00.123Z").getTime(),
    );
  });

  it("trata la fila de AYER como inexistente y no la borra (sin cron)", async () => {
    await writeState({
      branchId: branchArId,
      classDate: MONDAY_DATE,
      blockRole: "EPIKOS",
      level: "sigma",
    });

    expect(await service.readState(branchArId, TUESDAY_DATE)).toBeNull();

    // La fila sigue en la DB: caduca al LEER, se sobreescribe al iniciar clase.
    const rows = await app.db
      .select()
      .from(schema.tvClassState)
      .where(eq(schema.tvClassState.branchId, branchArId));
    expect(rows).toHaveLength(1);
  });

  it("una sede sin estado devuelve null, no un error", async () => {
    expect(await service.readState(branchEsId, TUESDAY_DATE)).toBeNull();
  });
});

describe("TvService.clampState — el nivel nunca rompe el bloque (Pitfall 1)", () => {
  async function classDayWithLevels() {
    await seedSession({
      level: "alfa",
      roles: ["INITIUM", "NUCLEUS"],
      nucleusExercises: 2,
    });
    await seedSession({
      level: "delta",
      roles: ["INITIUM", "NUCLEUS", "EPIKOS"],
      nucleusExercises: 5,
    });
    return resolveClassDay(
      app.db,
      { id: branchArId, timezone: AR_TZ },
      TUESDAY_NOON_UTC,
    );
  }

  const baseState: TvControlState = {
    screen: "class",
    blockRole: "NUCLEUS",
    level: "delta",
    exerciseIndex: 0,
    timerStatus: "idle",
    timerStartedAt: null,
    pausedAt: null,
    pausedAccumMs: 0,
    soundEnabled: false,
    deuterosAutoRotate: true,
    deuterosPinnedAt: null,
  };

  it("un rol que ya no esta en el roster cae al primer bloque", async () => {
    const classDay = await classDayWithLevels();
    const clamped = service.clampState(
      { ...baseState, blockRole: "DEUTEROS_2" },
      classDay,
    );
    expect(clamped.blockRole).toBe("INITIUM");
  });

  it("un nivel sin sesion cae al primer nivel disponible", async () => {
    const classDay = await classDayWithLevels();
    const clamped = service.clampState(
      { ...baseState, level: "sigma" },
      classDay,
    );
    expect(classDay.levels).toEqual(["alfa", "delta"]);
    expect(clamped.level).toBe("alfa");
  });

  it("el indice de ejercicio se clampa contra la lista del (rol, nivel) vigente", async () => {
    const classDay = await classDayWithLevels();

    // delta tiene 5 ejercicios en NUCLEUS: el indice 4 es valido.
    expect(
      service.clampState({ ...baseState, exerciseIndex: 4 }, classDay)
        .exerciseIndex,
    ).toBe(4);

    // El MISMO indice en alfa (2 ejercicios) se clampa al ultimo: cambiar de
    // nivel no puede dejar el resaltado apuntando fuera de la lista.
    expect(
      service.clampState(
        { ...baseState, level: "alfa", exerciseIndex: 4 },
        classDay,
      ).exerciseIndex,
    ).toBe(1);

    // Un indice negativo (dato corrupto) tampoco puede salir.
    expect(
      service.clampState({ ...baseState, exerciseIndex: -3 }, classDay)
        .exerciseIndex,
    ).toBe(0);
  });
});

describe("TvService.buildPollPayload — contrato del poll", () => {
  it("sin sesion aprobada el payload es reposo SIN campo de error (D-09)", async () => {
    // Ni sesiones ni estado: el caso de un dia sin clase.
    const payload = await service.buildPollPayload(
      branchArId,
      TUESDAY_NOON_UTC,
    );

    expect(payload.screen).toBe("idle");
    expect(payload.class).toBeNull();
    // El reposo es indistinguible de "no hay clase": ni error, ni mensaje.
    expect(Object.keys(payload).sort()).toEqual([
      "branch",
      "class",
      "screen",
      "serverNow",
    ]);
    // El reloj de la sede sigue publicandose: el TV muestra hora y fecha.
    expect(payload.branch.name).toBe("MOGOTES");
    expect(payload.branch.dateLabel).toBe("MARTES · SEMANA 1");
    expect(payload.branch.utcOffsetMinutes).toBe(-180);
    expect(payload.serverNow).toBe(TUESDAY_NOON_UTC.getTime());
  });

  it("con sesion aprobada pero sin clase iniciada tambien queda en reposo", async () => {
    await seedSession({ level: "alfa", roles: ["INITIUM", "NUCLEUS"] });

    const payload = await service.buildPollPayload(
      branchArId,
      TUESDAY_NOON_UTC,
    );

    expect(payload.screen).toBe("idle");
    expect(payload.class).toBeNull();
  });

  it("arma el bloque en curso con roster, etiquetas, movilidad y timer", async () => {
    await seedSession({
      level: "alfa",
      roles: ["INITIUM", "NUCLEUS", "EPIKOS"],
      nucleusExercises: 3,
    });
    await seedSession({ level: "delta", roles: ["INITIUM", "NUCLEUS"] });
    await writeState({
      branchId: branchArId,
      classDate: TUESDAY_DATE,
      blockRole: "NUCLEUS",
      level: "alfa",
      exerciseIndex: 1,
      timerStatus: "running",
      timerStartedAt: new Date("2026-02-24T14:58:00.000Z"),
    });

    const payload = await service.buildPollPayload(
      branchArId,
      TUESDAY_NOON_UTC,
    );

    expect(payload.screen).toBe("class");
    const cls = payload.class!;
    expect(cls.mode).toBe("regular");
    expect(cls.levels).toEqual(["alfa", "delta"]);
    expect(cls.level).toBe("alfa");
    expect(cls.levelLabel).toBe("NIVEL α");
    expect(cls.blocks.map((b) => b.role)).toEqual([
      "INITIUM",
      "NUCLEUS",
      "EPIKOS",
    ]);
    // blockIndex DERIVADO del roster, no persistido.
    expect(cls.blockRole).toBe("NUCLEUS");
    expect(cls.blockIndex).toBe(1);
    // La etiqueta del formato ahora es formatName + params compactos, igual que el PDF
    // de planis (formatNameWithParams, espejo de session-data-transformer.ts).
    expect(cls.title).toBe("NUCLEUS · AMRAP 10'");
    expect(cls.mobilityLine).toBe('MOVILIDAD · Movilidad de hombro 20"');
    // Rediseño fase 164: `state.level` es alfa, su par es [alfa, delta]
    // (`LEVEL_PAIRS`/`pairFor` en roster.ts) y AMBOS estan presentes hoy en
    // NUCLEUS -> dos columnas, alfa primero (orden del par).
    expect(cls.columns).toHaveLength(2);
    // El nombre completo de la ruta (OAP → "Dominadas"), igual que el PDF de
    // planis: `getRouteLabel` (espejo de `route-labels.ts` del admin).
    expect(cls.columns[0].header).toBe("NIVEL α | Dominadas 70%");
    expect(cls.columns[0].exercises).toHaveLength(3);
    expect(cls.columns[0].exercises[0].contraction).toBe("CON");
    expect(cls.columns[0].exercises[0].dose).toBe("8-10");
    // La columna delta resuelve SU PROPIO bloque NUCLEUS (1 ejercicio: el
    // default de `seedSession` cuando no se pasa `nucleusExercises`).
    expect(cls.columns[1].header).toBe("NIVEL Δ | Dominadas 70%");
    expect(cls.columns[1].exercises).toHaveLength(1);
    expect(cls.exerciseIndex).toBe(1);
    // El timer viaja como spec + sello, nunca como segundos restantes.
    expect(cls.timer.spec).toEqual({ kind: "countdown", totalMs: 600_000 });
    expect(cls.timer.status).toBe("running");
    expect(cls.timer.startedAt).toBe(
      new Date("2026-02-24T14:58:00.000Z").getTime(),
    );
    expect(cls.timer.soundEnabled).toBe(false);
  });

  it("DEUTEROS_1/DEUTEROS_2 cuentan como UN bloque visual (C1)", async () => {
    await seedSession({
      level: "alfa",
      roles: ["INITIUM", "NUCLEUS", "DEUTEROS_1", "DEUTEROS_2", "EPIKOS"],
    });
    await writeState({
      branchId: branchArId,
      classDate: TUESDAY_DATE,
      blockRole: "DEUTEROS_2",
      level: "alfa",
    });

    const cls = (await service.buildPollPayload(branchArId, TUESDAY_NOON_UTC))
      .class!;

    // El roster REAL sigue teniendo 5 entradas (identidad real, sin tocar).
    expect(cls.blocks.map((b) => b.role)).toEqual([
      "INITIUM",
      "NUCLEUS",
      "DEUTEROS_1",
      "DEUTEROS_2",
      "EPIKOS",
    ]);
    expect(cls.blockIndex).toBe(3);
    // Pero el bloque VISUAL colapsa DEUTEROS_1+DEUTEROS_2 en uno: 4 grupos, no
    // 5, y estando en DEUTEROS_2 el indice visual es el mismo que en DEUTEROS_1.
    expect(cls.visualBlockCount).toBe(4);
    expect(cls.visualBlockIndex).toBe(2);
  });

  it("deuteros con timer corriendo: la estación mostrada rota I→II cada 10s, timer estable", async () => {
    await seedSession({
      level: "alfa",
      roles: ["INITIUM", "NUCLEUS", "DEUTEROS_1", "DEUTEROS_2", "EPIKOS"],
    });
    // Profe parado en DEUTEROS_1, timer corriendo desde TUESDAY_NOON. La rotación
    // arranca prendida por default (columna DB) y no hay pisada (pinned_at NULL).
    await writeState({
      branchId: branchArId,
      classDate: TUESDAY_DATE,
      blockRole: "DEUTEROS_1",
      level: "alfa",
      timerStatus: "running",
      timerStartedAt: TUESDAY_NOON_UTC,
    });

    // A los 3s de arrancado: primera ventana de 10s → estación I.
    const at3 = new Date(TUESDAY_NOON_UTC.getTime() + 3_000);
    const cls3 = (await service.buildPollPayload(branchArId, at3)).class!;
    expect(cls3.blockRole).toBe("DEUTEROS_1");

    // A los 13s: segunda ventana → estación II, SIN que el profe toque nada.
    const at13 = new Date(TUESDAY_NOON_UTC.getTime() + 13_000);
    const cls13 = (await service.buildPollPayload(branchArId, at13)).class!;
    expect(cls13.blockRole).toBe("DEUTEROS_2");

    // El timer NO cambia con la rotación: mismo spec en las dos ventanas (los dos
    // deuteros comparten formato; el spec sale del bloque persistido, estable).
    expect(cls13.timer.spec).toEqual(cls3.timer.spec);
    expect(cls13.timer.startedAt).toBe(cls3.timer.startedAt);
  });

  it("deuteros con timer IDLE no rota: queda en la estación elegida", async () => {
    await seedSession({
      level: "alfa",
      roles: ["INITIUM", "NUCLEUS", "DEUTEROS_1", "DEUTEROS_2", "EPIKOS"],
    });
    await writeState({
      branchId: branchArId,
      classDate: TUESDAY_DATE,
      blockRole: "DEUTEROS_1",
      level: "alfa",
      // timerStatus default "idle": sin timer corriendo no hay rotación.
    });

    const at13 = new Date(TUESDAY_NOON_UTC.getTime() + 13_000);
    const cls = (await service.buildPollPayload(branchArId, at13)).class!;
    expect(cls.blockRole).toBe("DEUTEROS_1");
  });

  it("desde DEUTEROS_1 el indice visual es el mismo que desde DEUTEROS_2 (mismo grupo)", async () => {
    await seedSession({
      level: "alfa",
      roles: ["INITIUM", "NUCLEUS", "DEUTEROS_1", "DEUTEROS_2", "EPIKOS"],
    });
    await writeState({
      branchId: branchArId,
      classDate: TUESDAY_DATE,
      blockRole: "DEUTEROS_1",
      level: "alfa",
    });

    const cls = (await service.buildPollPayload(branchArId, TUESDAY_NOON_UTC))
      .class!;

    expect(cls.blockIndex).toBe(2);
    expect(cls.visualBlockCount).toBe(4);
    expect(cls.visualBlockIndex).toBe(2);
  });

  it("la movilidad sale del nivel canonico (kairos), no del nivel del control (KAIROS-01 en TV)", async () => {
    // La movilidad se guarda por nivel y cada nivel la sortea aparte: aca cada
    // sesion trae una movilidad DISTINTA. El PDF/editor muestran la de kairos
    // (canonica); la TV tiene que mostrar la MISMA aunque el control este en alfa.
    await seedSession({
      level: "kairos",
      roles: ["NUCLEUS"],
      mobilityName: "Movilidad canonica de kairos",
    });
    await seedSession({
      level: "alfa",
      roles: ["NUCLEUS"],
      mobilityName: "Movilidad de alfa",
    });
    await writeState({
      branchId: branchArId,
      classDate: TUESDAY_DATE,
      blockRole: "NUCLEUS",
      level: "alfa",
    });

    const cls = (
      await service.buildPollPayload(branchArId, TUESDAY_NOON_UTC)
    ).class!;

    // El control esta en alfa (la columna visible es la de alfa)...
    expect(cls.level).toBe("alfa");
    expect(cls.columns[0].header).toBe("NIVEL α | Dominadas 70%");
    // ...pero la linea de movilidad es la del nivel canonico (kairos), igual que el PDF.
    expect(cls.mobilityLine).toBe(
      'MOVILIDAD · Movilidad canonica de kairos 20"',
    );
  });

  it("si no hay kairos, la movilidad cae al siguiente nivel canonico (alfa)", async () => {
    await seedSession({
      level: "alfa",
      roles: ["NUCLEUS"],
      mobilityName: "Movilidad de alfa",
    });
    await seedSession({
      level: "delta",
      roles: ["NUCLEUS"],
      mobilityName: "Movilidad de delta",
    });
    await writeState({
      branchId: branchArId,
      classDate: TUESDAY_DATE,
      blockRole: "NUCLEUS",
      level: "delta",
    });

    const cls = (
      await service.buildPollPayload(branchArId, TUESDAY_NOON_UTC)
    ).class!;

    expect(cls.level).toBe("delta");
    // Sin kairos, el canonico es alfa (no el nivel del control).
    expect(cls.mobilityLine).toBe('MOVILIDAD · Movilidad de alfa 20"');
  });

  it("INITIUM es lista compartida: selector de nivel neutralizado y header propio", async () => {
    await seedSession({ level: "alfa", roles: ["INITIUM", "NUCLEUS"] });
    await writeState({
      branchId: branchArId,
      classDate: TUESDAY_DATE,
      blockRole: "INITIUM",
      level: "alfa",
    });

    const cls = (await service.buildPollPayload(branchArId, TUESDAY_NOON_UTC))
      .class!;

    expect(cls.blocks[0].shared).toBe(true);
    expect(cls.levelLabel).toBe("TODOS LOS NIVELES");
    // Bloque shared -> UNA sola columna, con la lista comun. El header lista
    // los niveles del dia con sus simbolos (UAT 2026-08-18): solo alfa
    // seedeado -> "NIVELES α".
    expect(cls.columns).toHaveLength(1);
    expect(cls.columns[0].header).toBe("INITIUM | NIVELES α");
    expect(cls.columns[0].exercises[0].contraction).toBe("CON");
    // Formato dictado por la estructura (tabata): sin volumen inventado.
    expect(cls.columns[0].exercises[0].dose).toBe("");
    expect(cls.timer.spec).toEqual({
      kind: "work_rest",
      workMs: 20_000,
      restMs: 10_000,
      rounds: 8,
    });
  });

  it("con un solo nivel del par presente hoy, la columna es UNA sola", async () => {
    // Solo alfa tiene sesion aprobada: el par de alfa es [alfa, delta]
    // (`pairFor`), pero delta no esta en `classDay.levels` -> se filtra.
    await seedSession({ level: "alfa", roles: ["INITIUM", "NUCLEUS"] });
    await writeState({
      branchId: branchArId,
      classDate: TUESDAY_DATE,
      blockRole: "NUCLEUS",
      level: "alfa",
    });

    const cls = (await service.buildPollPayload(branchArId, TUESDAY_NOON_UTC))
      .class!;

    expect(cls.columns).toHaveLength(1);
    expect(cls.columns[0].header).toBe("NIVEL α | Dominadas 70%");
  });

  it("una prescripcion ISO en segundos se formatea con comillas (dose) y su contraccion cruda viaja en `contraction`", async () => {
    // Bloque armado a mano (sin `seedSession`, que solo produce CON con reps)
    // para ejercitar la rama de `prescriptionVolume` que formatea segundos.
    const [session] = await app.db
      .insert(schema.sessions)
      .values({
        dayId: "W1-martes-alfa",
        week: 1,
        day: "martes",
        levelGroup: "alfa_delta",
        blockCount: 1,
        status: "approved",
      })
      .$returningId();
    const [block] = await app.db
      .insert(schema.sessionBlocks)
      .values({
        sessionId: session.id,
        blockId: `B-${session.id}-0`,
        role: "NUCLEUS",
        route: "OAP",
        pattern: "TRACCION",
        intensity: 70,
        repsBudget: 40,
        formatId: 1,
        formatName: "AMRAP",
        formatParams: { type: "amrap", minutes: 10 },
        exerciseCount: 1,
        sortOrder: 0,
      })
      .$returningId();
    await app.db.insert(schema.sessionPrescriptions).values({
      blockId: block.id,
      exerciseId,
      exerciseName: "Plancha isometrica",
      contraction: "ISO",
      reps: 0,
      seconds: 20,
      rest: 0,
      sortOrder: 0,
      exerciseType: "main",
    });
    await writeState({
      branchId: branchArId,
      classDate: TUESDAY_DATE,
      blockRole: "NUCLEUS",
      level: "alfa",
    });

    const cls = (await service.buildPollPayload(branchArId, TUESDAY_NOON_UTC))
      .class!;

    expect(cls.columns).toHaveLength(1);
    expect(cls.columns[0].exercises[0].contraction).toBe("ISO");
    expect(cls.columns[0].exercises[0].dose).toBe('20"');
  });

  it("el payload no lleva NI UN dato de socio (T-164-21)", async () => {
    await seedSession({ level: "alfa", roles: ["INITIUM", "NUCLEUS"] });
    await writeState({
      branchId: branchArId,
      classDate: TUESDAY_DATE,
      blockRole: "NUCLEUS",
      level: "alfa",
    });

    const payload = await service.buildPollPayload(
      branchArId,
      TUESDAY_NOON_UTC,
    );

    const serialized = JSON.stringify(payload).toLowerCase();
    for (const forbidden of [
      "email",
      "dni",
      "phone",
      "firstname",
      "lastname",
      "userid",
      "member",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("el estado de otra sede no se filtra: cada sede lee solo su propio estado (T-164-20)", async () => {
    await seedSession({ level: "alfa", roles: ["INITIUM", "NUCLEUS"] });
    // Clase iniciada en Barcelona, NO en la sede que se consulta.
    await writeState({
      branchId: branchEsId,
      classDate: TUESDAY_DATE,
      blockRole: "NUCLEUS",
      level: "alfa",
    });

    const payload = await service.buildPollPayload(
      branchArId,
      TUESDAY_NOON_UTC,
    );

    expect(payload.screen).toBe("idle");
    expect(payload.class).toBeNull();
  });

  it("el estado caduca en la TZ de la SEDE, no en UTC (Europe/Madrid, T-164-23)", async () => {
    // 23:30 UTC del martes: en Barcelona (UTC+1) ya es miercoles 00:30, asi que
    // un estado con class_date del martes esta VENCIDO para esa sede. En Mar del
    // Plata (UTC-3) todavia son las 20:30 del martes y el mismo estado vive.
    const borderInstant = new Date("2026-02-24T23:30:00Z");

    await writeState({
      branchId: branchEsId,
      classDate: TUESDAY_DATE,
      blockRole: "NUCLEUS",
      level: "alfa",
    });
    await writeState({
      branchId: branchArId,
      classDate: TUESDAY_DATE,
      blockRole: "NUCLEUS",
      level: "alfa",
    });

    const [esBranch] = await app.db
      .select({ timezone: schema.branches.timezone })
      .from(schema.branches)
      .where(eq(schema.branches.id, branchEsId));
    expect(esBranch.timezone).toBe(ES_TZ);

    // El martes 2026-02-24 en Barcelona ya paso -> el estado no se lee.
    expect(await service.readState(branchEsId, "2026-02-25")).toBeNull();
    // Y para la sede argentina, en el MISMO instante, sigue vigente.
    expect(await service.readState(branchArId, TUESDAY_DATE)).not.toBeNull();

    // Extremo a extremo: la pantalla de Barcelona amanece en reposo sin cron.
    const payload = await service.buildPollPayload(branchEsId, borderInstant);
    expect(payload.screen).toBe("idle");
    expect(payload.branch.utcOffsetMinutes).toBe(60);
  });
});
