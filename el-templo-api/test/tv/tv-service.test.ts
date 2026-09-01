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
  /** Fase 178: día combos/técnica en vez de regular (default). */
  sessionMode?: string;
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
      sessionMode: opts.sessionMode ?? "regular",
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

  it("ROM: el header de columna es sólo el tier (BASICO/AVANZADO), sin ruta ni intensidad", async () => {
    await seedSession({
      level: "alfa",
      roles: ["INITIUM", "ROM_LOWER", "ROM_CORE", "ROM_UPPER"],
      sessionMode: "rom",
    });
    await seedSession({
      level: "delta",
      roles: ["INITIUM", "ROM_LOWER", "ROM_CORE", "ROM_UPPER"],
      sessionMode: "rom",
    });
    await writeState({
      branchId: branchArId,
      classDate: TUESDAY_DATE,
      blockRole: "ROM_LOWER",
      level: "alfa",
    });

    const cls = (await service.buildPollPayload(branchArId, TUESDAY_NOON_UTC))
      .class!;

    expect(cls.mode).toBe("rom");
    // alfa+delta presentes -> dos columnas. En ROM el header es sólo el tier
    // (BASICO/AVANZADO): la ruta es el rol de la zona y la intensidad un 50 fijo
    // informativo, nada de eso va en pantalla (antes salía "BASICO | ROM_LOWER 50%").
    expect(cls.columns.map((c) => c.header)).toEqual(["BÁSICO", "AVANZADO"]);
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

  it("deuteros con AMBOS presentes: el payload trae 4 columnas (2×2 level-major) y el panel distingue los dos deuteros", async () => {
    await seedSession({
      level: "alfa",
      roles: ["INITIUM", "NUCLEUS", "DEUTEROS_1", "DEUTEROS_2", "EPIKOS"],
    });
    await seedSession({
      level: "delta",
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

    // El par de alfa es [alfa, delta], ambos presentes en los dos deuteros →
    // 2 niveles × 2 deuteros = 4 columnas. Orden level-major de la grilla 2×2
    // (fila = nivel, columna = deutero): [α·D1, α·D2, Δ·D1, Δ·D2].
    expect(cls.columns).toHaveLength(4);
    const headers = cls.columns.map((c) => c.header);
    expect(headers[0]).toMatch(/^NIVEL α \|/);
    expect(headers[1]).toMatch(/^NIVEL α \|/);
    expect(headers[2]).toMatch(/^NIVEL Δ \|/);
    expect(headers[3]).toMatch(/^NIVEL Δ \|/);
    // El rótulo del deutero YA NO va en el header de la celda (sólo NIVEL |
    // RUTA %): la identidad DEUTEROS I/II la trae `payload.deuteros`, que el
    // kiosco pinta como cabecera izquierda/derecha del 2×2, en orden I → II.
    for (const h of headers) expect(h).not.toContain("DEUTEROS");
    expect(cls.deuteros?.map((g) => g.label)).toEqual([
      "DEUTEROS I",
      "DEUTEROS II",
    ]);
    for (const col of cls.columns) {
      expect(col.exercises.length).toBeGreaterThan(0);
    }
  });

  it("con SOLO un deutero presente hoy, el payload trae 2 columnas — sin columna vacía ni rota (guard)", async () => {
    // DEUTEROS_2 no existe en NINGUN nivel del día: un día regular real que
    // todavía no tiene el segundo deutero cargado.
    await seedSession({
      level: "alfa",
      roles: ["INITIUM", "NUCLEUS", "DEUTEROS_1", "EPIKOS"],
    });
    await seedSession({
      level: "delta",
      roles: ["INITIUM", "NUCLEUS", "DEUTEROS_1", "EPIKOS"],
    });
    await writeState({
      branchId: branchArId,
      classDate: TUESDAY_DATE,
      blockRole: "DEUTEROS_1",
      level: "alfa",
    });

    const cls = (await service.buildPollPayload(branchArId, TUESDAY_NOON_UTC))
      .class!;

    // Ni el roster real trae DEUTEROS_2 (findCanonicalBlock no lo encuentra)...
    expect(cls.blocks.map((b) => b.role)).not.toContain("DEUTEROS_2");
    // ...ni las columnas: 2 (D1 × par de niveles), ninguna vacía ni con una
    // celda de un DEUTEROS_2 inexistente. El header de la celda es sólo
    // NIVEL | RUTA % — el rótulo del deutero vive en el panel.
    expect(cls.columns).toHaveLength(2);
    expect(cls.columns.map((c) => c.header)).toEqual([
      expect.stringMatching(/^NIVEL α \|/),
      expect.stringMatching(/^NIVEL Δ \|/),
    ]);
    for (const col of cls.columns) {
      expect(col.header).not.toContain("DEUTEROS");
      expect(col.exercises.length).toBeGreaterThan(0);
    }
    // El panel trae UN solo deutero (I) — no inventa el II ausente.
    expect(cls.deuteros?.map((g) => g.label)).toEqual(["DEUTEROS I"]);
  });

  it("el alt es un bloque navegable propio: título/columnas propias, y comparte visualBlockIndex con el II (combos)", async () => {
    // Día combos de un solo nivel, con el 5º bloque alt generado. El alt YA
    // NO es un toggle: es un rol mas del roster, con su propia entrada.
    await seedSession({
      level: "alfa",
      roles: [
        "INITIUM",
        "COMBOS_I",
        "COMBOS_II",
        "COMBOS_II_ALT",
        "STRETCHING",
      ],
      sessionMode: "combos",
    });
    await writeState({
      branchId: branchArId,
      classDate: TUESDAY_DATE,
      blockRole: "COMBOS_II",
      level: "alfa",
      timerStatus: "running",
      timerStartedAt: new Date("2026-02-24T14:58:00.000Z"),
    });

    const enII = (await service.buildPollPayload(branchArId, TUESDAY_NOON_UTC))
      .class!;
    expect(enII.blockRole).toBe("COMBOS_II");
    expect(enII.title).toContain("COMBOS II");
    expect(enII.title).not.toContain("ALT");
    // El alt ya esta en el roster real (boton navegable propio).
    expect(enII.blocks.map((b) => b.role)).toContain("COMBOS_II_ALT");

    // El profe navega al alt: TvService.writeState escribe blockRole=ALT
    // directo (probado en integracion, tv-control.test.ts). Acá se simula el
    // estado ya persistido para verificar el armado del payload solo.
    await app.db
      .update(schema.tvClassState)
      .set({ blockRole: "COMBOS_II_ALT" })
      .where(eq(schema.tvClassState.branchId, branchArId));

    const enAlt = (await service.buildPollPayload(branchArId, TUESDAY_NOON_UTC))
      .class!;
    expect(enAlt.blockRole).toBe("COMBOS_II_ALT");
    expect(enAlt.title).toContain("COMBOS II ALT");
    expect(enAlt.blocks.map((b) => b.role)).toContain("COMBOS_II_ALT");

    // El sello del timer viaja tal cual esta persistido (acá no cambio: solo
    // se toco blockRole a mano, sin pasar por applyBlockRole).
    expect(enAlt.timer.startedAt).toBe(enII.timer.startedAt);
    expect(enAlt.timer.status).toBe(enII.timer.status);
    expect(enAlt.timer.spec).toEqual(enII.timer.spec);

    // El bloque visual sigue siendo el mismo grupo (el II): comparten los
    // puntitos "BLOQUE n / M".
    expect(enAlt.visualBlockIndex).toBe(enII.visualBlockIndex);
    expect(enAlt.visualBlockCount).toBe(enII.visualBlockCount);
    // blockIndex SI distingue las dos entradas de roster.
    expect(enAlt.blockIndex).not.toBe(enII.blockIndex);
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

    const cls = (await service.buildPollPayload(branchArId, TUESDAY_NOON_UTC))
      .class!;

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

    const cls = (await service.buildPollPayload(branchArId, TUESDAY_NOON_UTC))
      .class!;

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

  it("la lista compartida de STRETCHING sale del nivel canonico (kairos), no del control", async () => {
    // STRETCHING es un bloque comun, pero hoy cada nivel guarda el suyo y pueden
    // divergir (kairos limpio a mano, otros con los defaults del generador). La
    // columna shared tiene que mostrar SIEMPRE el canonico (kairos-first), igual
    // que la movilidad, el editor y el PDF — aunque el control este en alfa. El
    // helper nombra cada ejercicio `STRETCHING-<nivel>-0`, asi que el nombre
    // delata que nivel se leyo.
    // sessionMode "tecnica": STRETCHING solo esta en el roster de combos/tecnica
    // (`TECNICA_ROLES`/`COMBOS_ROLES`), no en el regular — sin esto clampState lo
    // reemplaza por INITIUM (tambien shared) y el test leeria el bloque equivocado.
    await seedSession({
      level: "kairos",
      roles: ["INITIUM", "STRETCHING"],
      sessionMode: "tecnica",
    });
    await seedSession({
      level: "alfa",
      roles: ["INITIUM", "STRETCHING"],
      sessionMode: "tecnica",
    });
    await writeState({
      branchId: branchArId,
      classDate: TUESDAY_DATE,
      blockRole: "STRETCHING",
      level: "alfa",
    });

    const cls = (await service.buildPollPayload(branchArId, TUESDAY_NOON_UTC))
      .class!;

    // El control esta en alfa, pero la lista shared es la de kairos (canonica).
    expect(cls.level).toBe("alfa");
    expect(cls.columns).toHaveLength(1);
    expect(cls.columns[0].exercises[0].name).toBe("STRETCHING-kairos-0");
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

/**
 * Regresión del "40-16": `reps_max` (y `seconds_max`) son campos específicos de
 * formatos de rango que pueden quedar stale en la fila cuando el bloque cambia a
 * un formato sin rango. El render (`prescriptionVolume`) solo debe mostrar el
 * rango cuando es válido (techo > piso); un `reps_max <= reps` es basura y NO
 * debe imprimirse (antes se veía "40-16" en el TV, con 16 < 40).
 */
describe("TvService.buildPollPayload — dose ignora rangos inválidos (stale)", () => {
  async function seedNucleusPair() {
    await seedSession({ level: "alfa", roles: ["INITIUM", "NUCLEUS"] });
    await seedSession({ level: "delta", roles: ["INITIUM", "NUCLEUS"] });
    await writeState({
      branchId: branchArId,
      classDate: TUESDAY_DATE,
      blockRole: "NUCLEUS",
      level: "alfa",
    });
  }

  async function patchAlfaMain(fields: {
    reps: number;
    repsMax?: number | null;
    seconds?: number;
    secondsMax?: number | null;
  }) {
    await app.db
      .update(schema.sessionPrescriptions)
      .set({
        reps: fields.reps,
        repsMax: fields.repsMax ?? null,
        seconds: fields.seconds ?? 0,
        secondsMax: fields.secondsMax ?? null,
      })
      .where(eq(schema.sessionPrescriptions.exerciseName, "NUCLEUS-alfa-0"));
  }

  async function alfaMainDose(): Promise<string> {
    const cls = (await service.buildPollPayload(branchArId, TUESDAY_NOON_UTC))
      .class!;
    return cls.columns[0].exercises[0].dose;
  }

  it("no muestra rango cuando reps_max quedó stale (<= reps): el bug 40-16", async () => {
    await seedNucleusPair();
    await patchAlfaMain({ reps: 40, repsMax: 16 });
    expect(await alfaMainDose()).toBe("40");
  });

  it("tampoco muestra rango cuando reps_max == reps (rango degenerado)", async () => {
    await seedNucleusPair();
    await patchAlfaMain({ reps: 40, repsMax: 40 });
    expect(await alfaMainDose()).toBe("40");
  });

  it("sigue mostrando el rango cuando es válido (reps_max > reps)", async () => {
    await seedNucleusPair();
    await patchAlfaMain({ reps: 40, repsMax: 45 });
    expect(await alfaMainDose()).toBe("40-45");
  });

  it("no muestra rango cuando seconds_max quedó stale (<= seconds)", async () => {
    await seedNucleusPair();
    await patchAlfaMain({ reps: 0, seconds: 30, secondsMax: 20 });
    expect(await alfaMainDose()).toBe('30"');
  });

  it("sigue mostrando el rango de segundos cuando es válido (seconds_max > seconds)", async () => {
    await seedNucleusPair();
    await patchAlfaMain({ reps: 0, seconds: 30, secondsMax: 45 });
    expect(await alfaMainDose()).toBe('30-45"');
  });
});
