/**
 * Fase 201 Plan 08 (§7.1, §4.6, A8, D-13 b): Progreso del alumno.
 *
 *   - GET /api/members/conquer/progress
 *
 * Integración contra el MySQL de tests. El historial va en semanas anteriores
 * con `insertConquerSession`; "hoy" solo por `PUT /sessions`. Todas las fechas
 * son relativas al "hoy" de la sede del alumno.
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterEach,
  afterAll,
} from "vitest";
import type { FastifyInstance } from "fastify";
import * as schema from "../../src/db/schema";
import { tenantValues } from "../../src/modules/shared/tenant";
import { cleanAllTestData, createTestApp, createTestMember } from "../helpers";
import {
  limpiarSegundoGimnasio,
  seedSecondTenant,
  TENANT_DOS,
  type SegundoGimnasio,
} from "../fixtures/second-tenant";
import { clearModuleFlags, setModuleFlag } from "../fixtures/module-flags";
import {
  conquerExerciseIds,
  conquerRungId,
  conquerStepUrl,
  createActiveConquerMember,
  fetchProgress,
  getProgressRaw,
  insertConquerSession,
  memberToday,
  saveTodaySession,
  weeksAgo,
  type ConquerErrorBody,
  type ProgressBody,
  type ProgressExerciseBody,
} from "./_helpers";

let app: FastifyInstance;
let gym2: SegundoGimnasio;

beforeAll(async () => {
  app = await createTestApp();
});

beforeEach(async () => {
  await cleanAllTestData(app);
  gym2 = await seedSecondTenant(app);
});

afterEach(async () => {
  await clearModuleFlags(app, TENANT_DOS);
});

afterAll(async () => {
  await cleanAllTestData(app);
  await limpiarSegundoGimnasio(app);
  await app.close();
});

/** El ejercicio `exerciseId` dentro de los días del Progreso. */
function exerciseIn(
  body: ProgressBody,
  exerciseId: number,
): ProgressExerciseBody {
  const found = body.days
    .flatMap((d) => d.exercises)
    .find((e) => e.exerciseId === exerciseId);
  if (!found) throw new Error(`Progreso no trae el ejercicio ${exerciseId}`);
  return found;
}

/** Cambia a mano el peldaño del E1 de un ejercicio (PUT /steps). */
async function changeE1Rung(
  token: string,
  exerciseId: number,
  rungId: number,
): Promise<void> {
  const res = await app.inject({
    method: "PUT",
    url: conquerStepUrl(exerciseId, "e1"),
    headers: { authorization: `Bearer ${token}` },
    payload: { rungId, mode: "completa" },
  });
  expect(res.statusCode, res.body).toBe(200);
}

describe("GET /api/members/conquer/progress — acierto (A8)", () => {
  it("el % de acierto y el Δ cuentan TODO el historial con prev_target y no se borran al cambiar de peldaño", async () => {
    const { userId, token } = await createActiveConquerMember(app, {
      level: "toro",
      daysCount: 4,
    });
    const ids = await conquerExerciseIds(app);
    const pressId = ids.get("planche_press") ?? 0;
    const hoy = await memberToday(app, userId);
    // 7 >= 7 (acierto), 5 < 8 (fallo), 9 >= 8 (acierto). La primera marca no
    // tiene prev_target: no entra al cálculo.
    const marcas: [number, number, number | null][] = [
      [4, 3, null],
      [3, 7, 7],
      [2, 5, 8],
      [1, 9, 8],
    ];
    for (const [semanas, value, prevTarget] of marcas) {
      await insertConquerSession(app, {
        userId,
        date: weeksAgo(hoy, semanas),
        dayKey: "plancha",
        steps: [
          { exerciseCode: "planche_press", step: "e1", value, prevTarget },
        ],
      });
    }
    // Cambio de peldaño DESPUÉS de las marcas: el escalón reinicia desde hoy.
    await changeE1Rung(
      token,
      pressId,
      await conquerRungId(app, "palanca", "adv_tuck"),
    );

    const body = await fetchProgress(app, token);

    expect(body.accuracy).toEqual({ n: 3, hits: 2, pct: 67, delta: -0.7 });
    expect(body.sessionsCount).toBe(4);
    // El escalón sí reinició: sin marcas desde el cambio.
    const press = exerciseIn(body, pressId);
    expect(press.e1Curve).toEqual([]);
    expect(press.steps[0]).toMatchObject({
      step: "e1",
      rungName: "adv tuck",
      last: null,
      target: 3,
      estado: "sin_datos",
    });
  });

  it("sin historial: acierto vacío (n 0, pct y delta null) y nada para subir ni calibrar", async () => {
    const { token } = await createActiveConquerMember(app, {
      level: "toro",
      daysCount: 4,
    });

    const body = await fetchProgress(app, token);

    expect(body.accuracy).toEqual({ n: 0, hits: 0, pct: null, delta: null });
    expect(body.sessionsCount).toBe(0);
    expect(body.weekLighting).toEqual({ primary: [], secondary: [] });
    expect(body.subir).toEqual([]);
    expect(body.calibrations).toEqual([]);
  });
});

describe("GET /api/members/conquer/progress — curva del E1", () => {
  it("e1Curve trae los valores de la más vieja a la más nueva, con la última marca y el próximo objetivo", async () => {
    const { userId, token } = await createActiveConquerMember(app, {
      level: "toro",
      daysCount: 4,
    });
    const ids = await conquerExerciseIds(app);
    const pressId = ids.get("planche_press") ?? 0;
    const hoy = await memberToday(app, userId);
    for (const [i, value] of [4, 5, 6].entries()) {
      await insertConquerSession(app, {
        userId,
        date: weeksAgo(hoy, 3 - i),
        dayKey: "plancha",
        steps: [{ exerciseCode: "planche_press", step: "e1", value }],
      });
    }

    const press = exerciseIn(await fetchProgress(app, token), pressId);

    expect(press.e1Curve).toEqual([4, 5, 6]);
    expect(press.steps.map((s) => s.step)).toEqual(["e1", "e2", "e3", "hold"]);
    expect(press.steps[0]).toMatchObject({
      rungName: "tuck",
      mode: "completa",
      last: 6,
      target: 7,
      estado: "rango",
    });
    // Sin marcas en e2: sin última marca y en el piso.
    expect(press.steps[1]).toMatchObject({
      mode: "negativa",
      last: null,
      target: 3,
      estado: "sin_datos",
    });
    // El hold no tiene objetivo ni estado.
    expect(press.steps[3]).toMatchObject({ target: null, estado: null });
  });

  it("e1Curve cuenta solo desde el último cambio de peldaño", async () => {
    const { userId, token } = await createActiveConquerMember(app, {
      level: "toro",
      daysCount: 4,
    });
    const ids = await conquerExerciseIds(app);
    const pressId = ids.get("planche_press") ?? 0;
    const hoy = await memberToday(app, userId);
    for (const [i, value] of [4, 5].entries()) {
      await insertConquerSession(app, {
        userId,
        date: weeksAgo(hoy, 2 - i),
        dayKey: "plancha",
        steps: [{ exerciseCode: "planche_press", step: "e1", value }],
      });
    }
    await changeE1Rung(
      token,
      pressId,
      await conquerRungId(app, "palanca", "adv_tuck"),
    );
    // Primera sesión con el peldaño nuevo: 3 repeticiones en adv tuck.
    await saveTodaySession(app, token, { edits: { planche_press: { e1: 3 } } });

    const press = exerciseIn(await fetchProgress(app, token), pressId);

    expect(press.e1Curve).toEqual([3]);
    expect(press.steps[0]).toMatchObject({
      rungName: "adv tuck",
      last: 3,
      target: 4,
      estado: "rango",
    });
  });
});

describe("GET /api/members/conquer/progress — figura de la semana (D-13 b)", () => {
  it("enciende solo lo trabajado esta semana, suma sesiones de días distintos y no cuenta la semana pasada", async () => {
    const { userId, token } = await createActiveConquerMember(app, {
      level: "toro",
      daysCount: 4,
    });
    const hoy = await memberToday(app, userId);
    // Plancha de hoy: solo Planche hold con valor (3 series). Los otros dos en 0.
    await saveTodaySession(app, token, {
      day: "plancha",
      edits: {
        planche_hold: { e1: 5, e2: 5, e3: 5 },
        planche_press: { e1: 0, e2: 0, e3: 0 },
        lsit_plancha: { e1: 0, e2: 0, e3: 0 },
      },
    });

    const uno = await fetchProgress(app, token);

    // Principales con 3 series (>= 2). Las secundarias con 3 series (< 4) no se encienden.
    expect(uno.weekLighting).toEqual({
      primary: ["chest", "deltoids", "abs"],
      secondary: [],
    });

    // Vertical de hoy (inserción directa): HSPU suma deltoides y tríceps como
    // principales y repite antebrazo como secundario: 3 + 3 = 6 series (>= 4).
    await insertConquerSession(app, {
      userId,
      date: hoy,
      dayKey: "vertical",
      steps: [{ exerciseCode: "hspu", step: "e1", value: 5 }],
    });
    // Una sesión de la semana pasada NO cuenta: encendería la espalda alta.
    await insertConquerSession(app, {
      userId,
      date: weeksAgo(hoy, 1),
      dayKey: "front",
      steps: [{ exerciseCode: "front_hold", step: "e1", value: 5 }],
    });

    const dos = await fetchProgress(app, token);

    expect(dos.weekLighting).toEqual({
      primary: ["chest", "deltoids", "triceps", "abs"],
      secondary: ["forearm"],
    });
    expect(dos.weekLighting.primary).not.toContain("upper-back");
    expect(dos.weekLighting.primary).not.toContain("quadriceps");
  });
});

describe("GET /api/members/conquer/progress — días del plan y conteos", () => {
  it("Novillo de 3 días: solo los días de su plan, con los ejercicios de cada día", async () => {
    const { token } = await createActiveConquerMember(app, {
      level: "novillo",
      daysCount: 3,
    });

    const body = await fetchProgress(app, token);

    expect(body.days.map((d) => [d.dayKey, d.label, d.sessionsCount])).toEqual([
      ["empuje", "Empuje", 0],
      ["traccion", "Tracción", 0],
      ["mixto", "Mixto", 0],
    ]);
    expect(body.days.map((d) => d.exercises.map((e) => e.name))).toEqual([
      ["Planche hold", "HSPU", "Planche push-up"],
      ["Front lever hold", "Pull-ups en front lever", "Muscle-up"],
      ["Planche press", "One arm / archer", "90° press"],
    ]);
    for (const exercise of body.days.flatMap((d) => d.exercises)) {
      expect(exercise.steps.map((s) => s.step)).toEqual([
        "e1",
        "e2",
        "e3",
        "hold",
      ]);
    }
  });

  it("cada escalón trae unilateral del peldaño ACTUAL: One arm / archer arranca por lado y pasa a bilateral al cambiar el peldaño (§1.4)", async () => {
    const { token } = await createActiveConquerMember(app, {
      level: "toro",
      daysCount: 4,
    });
    const ids = await conquerExerciseIds(app);
    const archerId = ids.get("one_arm_archer") ?? 0;
    const pressId = ids.get("planche_press") ?? 0;

    const before = await fetchProgress(app, token);

    const archer = exerciseIn(before, archerId);
    expect(archer.steps.map((s) => [s.step, s.unilateral])).toEqual([
      ["e1", true],
      ["e2", true],
      ["e3", false],
      ["hold", false],
    ]);
    expect(exerciseIn(before, pressId).steps.map((s) => s.unilateral)).toEqual([
      false,
      false,
      false,
      false,
    ]);

    await changeE1Rung(
      token,
      archerId,
      await conquerRungId(app, "trac", "dominada"),
    );

    const after = await fetchProgress(app, token);
    expect(exerciseIn(after, archerId).steps[0]).toMatchObject({
      step: "e1",
      rungName: "dominada",
      unilateral: false,
    });
  });

  it("sessionsCount total y por día cuentan todo el historial", async () => {
    const { userId, token } = await createActiveConquerMember(app, {
      level: "toro",
      daysCount: 4,
    });
    const hoy = await memberToday(app, userId);
    for (const [semanas, dayKey, exerciseCode] of [
      [2, "plancha", "planche_press"],
      [1, "plancha", "planche_press"],
      [1, "front", "front_hold"],
    ] as const) {
      await insertConquerSession(app, {
        userId,
        date: weeksAgo(hoy, semanas),
        dayKey,
        steps: [{ exerciseCode, step: "e1", value: 5 }],
      });
    }
    await saveTodaySession(app, token, { day: "vertical" });

    const body = await fetchProgress(app, token);

    expect(body.sessionsCount).toBe(4);
    expect(body.days.map((d) => [d.dayKey, d.sessionsCount])).toEqual([
      ["plancha", 2],
      ["front", 1],
      ["vertical", 1],
      ["dominadas", 0],
    ]);
  });
});

describe("GET /api/members/conquer/progress — acceso", () => {
  it("el historial de un alumno no aparece en el Progreso de otro", async () => {
    const a = await createActiveConquerMember(app, {
      level: "toro",
      daysCount: 4,
    });
    const b = await createActiveConquerMember(app, {
      level: "toro",
      daysCount: 4,
    });
    await saveTodaySession(app, a.token, { day: "plancha" });

    const deA = await fetchProgress(app, a.token);
    const deB = await fetchProgress(app, b.token);

    expect(deA.sessionsCount).toBe(1);
    expect(deB.sessionsCount).toBe(0);
    expect(deB.weekLighting).toEqual({ primary: [], secondary: [] });
  });

  it("gimnasio 2: un alumno de otro gimnasio no ve el catálogo ni el historial de El Templo", async () => {
    const templo = await createActiveConquerMember(app, {
      level: "toro",
      daysCount: 4,
    });
    await saveTodaySession(app, templo.token, { day: "plancha" });
    await setModuleFlag(app, TENANT_DOS, "templo-training", true);
    const [socio2] = gym2.socios;
    await app.db.insert(schema.conquerMembers).values(
      tenantValues(
        { tenantId: TENANT_DOS },
        {
          userId: socio2.id,
          status: "activo" as const,
          level: "toro" as const,
          daysCount: 4,
        },
      ),
    );

    const res = await getProgressRaw(app, socio2.token);

    expect(res.statusCode, res.body).toBe(200);
    const body = res.json<ProgressBody>();
    expect(body.sessionsCount).toBe(0);
    expect(body.days).toEqual([]);
  });

  it("sin Conquer activo: 409 CONQUER_NO_ACTIVO; sin token: 401", async () => {
    const socio = await createTestMember(app);

    const res = await getProgressRaw(app, socio.token);
    const sinToken = await app.inject({
      method: "GET",
      url: "/api/members/conquer/progress",
    });

    expect(res.statusCode, res.body).toBe(409);
    expect(res.json<ConquerErrorBody>().code).toBe("CONQUER_NO_ACTIVO");
    expect(sinToken.statusCode).toBe(401);
  });
});
