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
let deviceId: number;
let exerciseId: number;

function code(prefix: string): string {
  return `${prefix}${Date.now().toString(36).slice(-5)}`;
}

async function seedBranchesAndDevice(): Promise<void> {
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

  const [device] = await app.db
    .insert(schema.tvDevices)
    .values({ branchId: ar.id, tokenHash: code("hash").padEnd(64, "0") })
    .$returningId();
  deviceId = device.id;

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
      exerciseName: "Movilidad de hombro",
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
  await seedBranchesAndDevice();
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
      { id: deviceId, branchId: branchArId },
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
      { id: deviceId, branchId: branchArId },
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
      { id: deviceId, branchId: branchArId },
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
    expect(cls.title).toBe("NUCLEUS · AMRAP - 10 min");
    expect(cls.listHeader).toBe("NIVEL α | OAP 70%");
    expect(cls.mobilityLine).toBe('MOVILIDAD · Movilidad de hombro 20"');
    expect(cls.exercises).toHaveLength(3);
    expect(cls.exercises[0].rx).toBe("8-10 CON.");
    expect(cls.exerciseIndex).toBe(1);
    // El timer viaja como spec + sello, nunca como segundos restantes.
    expect(cls.timer.spec).toEqual({ kind: "countdown", totalMs: 600_000 });
    expect(cls.timer.status).toBe("running");
    expect(cls.timer.startedAt).toBe(
      new Date("2026-02-24T14:58:00.000Z").getTime(),
    );
    expect(cls.timer.soundEnabled).toBe(false);
  });

  it("INITIUM es lista compartida: selector de nivel neutralizado y header propio", async () => {
    await seedSession({ level: "alfa", roles: ["INITIUM", "NUCLEUS"] });
    await writeState({
      branchId: branchArId,
      classDate: TUESDAY_DATE,
      blockRole: "INITIUM",
      level: "alfa",
    });

    const cls = (
      await service.buildPollPayload(
        { id: deviceId, branchId: branchArId },
        TUESDAY_NOON_UTC,
      )
    ).class!;

    expect(cls.blocks[0].shared).toBe(true);
    expect(cls.levelLabel).toBe("TODOS LOS NIVELES");
    expect(cls.listHeader).toBe("INITIUM | TODOS LOS NIVELES");
    // Formato dictado por la estructura (tabata): sin volumen inventado.
    expect(cls.exercises[0].rx).toBe("CON.");
    expect(cls.timer.spec).toEqual({
      kind: "work_rest",
      workMs: 20_000,
      restMs: 10_000,
      rounds: 8,
    });
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
      { id: deviceId, branchId: branchArId },
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

  it("el estado de otra sede no se filtra: la sede sale de la fila del device (T-164-20)", async () => {
    await seedSession({ level: "alfa", roles: ["INITIUM", "NUCLEUS"] });
    // Clase iniciada en Barcelona, NO en la sede del televisor.
    await writeState({
      branchId: branchEsId,
      classDate: TUESDAY_DATE,
      blockRole: "NUCLEUS",
      level: "alfa",
    });

    const payload = await service.buildPollPayload(
      { id: deviceId, branchId: branchArId },
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

    // Extremo a extremo: el TV de Barcelona amanece en reposo sin cron.
    const [esDevice] = await app.db
      .insert(schema.tvDevices)
      .values({ branchId: branchEsId, tokenHash: code("es").padEnd(64, "1") })
      .$returningId();
    const payload = await service.buildPollPayload(
      { id: esDevice.id, branchId: branchEsId },
      borderInstant,
    );
    expect(payload.screen).toBe("idle");
    expect(payload.branch.utcOffsetMinutes).toBe(60);
  });
});
