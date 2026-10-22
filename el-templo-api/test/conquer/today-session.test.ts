/**
 * Fase 201 Plan 07 (S12-2, D-16, D-18, D-13, T-201-21..25): Hoy y guardado de
 * la sesión de Conquer.
 *
 *   - GET /api/members/conquer/today?day=
 *   - PUT /api/members/conquer/sessions
 *   - GET /api/members/conquer/state  (member.home)
 *
 * Integración contra el MySQL de tests. Usuarios SIEMPRE con fábricas. El
 * historial de días pasados se inserta DIRECTO con `insertConquerSession`, en
 * semanas ANTERIORES a la actual para no tocar "qué día toca" (D-16). Todas las
 * fechas son relativas al "hoy" de la sede del alumno.
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterEach,
  afterAll,
  vi,
} from "vitest";
import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import * as schema from "../../src/db/schema";
import { addDaysIso, mondayOfIso } from "../../src/modules/conquer/calendar";
import { tenantWhere } from "../../src/modules/shared/tenant";
import { cleanAllTestData, createTestApp, createTestMember } from "../helpers";
import {
  limpiarSegundoGimnasio,
  seedSecondTenant,
  TENANT_DOS,
  type SegundoGimnasio,
} from "../fixtures/second-tenant";
import { clearModuleFlags, setModuleFlag } from "../fixtures/module-flags";
import {
  CONQUER_SESSIONS_URL,
  CONQUER_STATE_URL,
  CONQUER_TODAY_URL,
  conquerExerciseIds,
  conquerStepUrl,
  createActiveConquerMember,
  insertConquerMember,
  insertConquerSession,
  memberToday,
  readConquerSessions,
  readConquerSteps,
  readSessionSteps,
  sessionBodyFromToday,
  TEMPLO_CTX,
  type TodayBody,
  type TodayExerciseBody,
} from "./_helpers";

interface SaveBody {
  sessionId: number;
  date: string;
  dayKey: string;
  lighting: { primary: string[]; secondary: string[] };
}

interface HomeBody {
  weekMonday: string;
  plan: { dayKey: string; label: string; done: boolean }[];
  nextDayKey: string | null;
  weekComplete: boolean;
  lastByDay: {
    dayKey: string;
    label: string;
    date: string | null;
    e1: {
      exerciseName: string;
      value: number;
      unit: string;
      unilateral: boolean;
    }[];
  }[];
}

interface StateBody {
  status: string;
  member: { home: HomeBody } | null;
}

interface ErrorBody {
  error: string;
  code?: string;
}

let app: FastifyInstance;
let gym2: SegundoGimnasio;

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

async function getToday(token: string, day?: string) {
  return app.inject({
    method: "GET",
    url:
      day === undefined ? CONQUER_TODAY_URL : `${CONQUER_TODAY_URL}?day=${day}`,
    headers: auth(token),
  });
}

/** `GET /today` que tiene que responder 200; devuelve el body tipado. */
async function today(token: string, day?: string): Promise<TodayBody> {
  const res = await getToday(token, day);
  expect(res.statusCode, res.body).toBe(200);
  return res.json<TodayBody>();
}

async function putSession(token: string, payload: unknown) {
  return app.inject({
    method: "PUT",
    url: CONQUER_SESSIONS_URL,
    headers: auth(token),
    payload: payload as Record<string, unknown>,
  });
}

async function getState(token: string) {
  return app.inject({
    method: "GET",
    url: CONQUER_STATE_URL,
    headers: auth(token),
  });
}

function exerciseOf(body: TodayBody, code: string): TodayExerciseBody {
  const found = body.exercises.find((e) => e.code === code);
  if (!found) throw new Error(`Hoy no trae ${code}`);
  return found;
}

function stepOf(body: TodayBody, code: string, step: string) {
  const found = exerciseOf(body, code).steps.find((s) => s.step === step);
  if (!found) throw new Error(`Hoy no trae ${code}:${step}`);
  return found;
}

/** Lunes de la semana de `hoy` corrido `weeksAgo` semanas atrás. */
function weeksAgo(hoy: string, weeksAgo: number): string {
  return addDaysIso(mondayOfIso(hoy), -7 * weeksAgo);
}

beforeAll(async () => {
  app = await createTestApp();
});

beforeEach(async () => {
  await cleanAllTestData(app);
  gym2 = await seedSecondTenant(app);
});

afterEach(async () => {
  vi.useRealTimers();
  await clearModuleFlags(app, TENANT_DOS);
});

afterAll(async () => {
  await cleanAllTestData(app);
  await limpiarSegundoGimnasio(app);
  await app.close();
});

describe("GET /api/members/conquer/today", () => {
  it("sin historial: propone Plancha con cada contador precargado con el objetivo (S12-2)", async () => {
    const { userId, token } = await createActiveConquerMember(app, {
      level: "toro",
      daysCount: 4,
    });

    const body = await today(token);

    expect(body.date).toBe(await memberToday(app, userId));
    expect(body.weekMonday).toBe(mondayOfIso(body.date));
    expect(body.dayKey).toBe("plancha");
    expect(body.label).toBe("Plancha");
    expect(body.level).toBe("toro");
    expect(body.alreadySaved).toBe(false);
    expect(body.pain).toBe(0);
    expect(body.finisher).toBe("Tuck planche hold o lean, 20–30 s");
    expect(body.weekComplete).toBe(false);
    expect(body.nextDayKey).toBe("plancha");
    // Toro suma el sábado de combos al final del plan (201-10, §3.2, D-16).
    expect(body.plan.map((d) => [d.dayKey, d.done])).toEqual([
      ["plancha", false],
      ["front", false],
      ["vertical", false],
      ["dominadas", false],
      ["sabado", false],
    ]);
    expect(body.exercises.map((e) => e.code)).toEqual([
      "planche_hold",
      "planche_press",
      "lsit_plancha",
    ]);

    // Planche press (reps): piso 3 en cada escalón con el modo de la tabla de Toro.
    const press = exerciseOf(body, "planche_press");
    expect(press.unit).toBe("reps");
    expect(press.steps.map((s) => s.step)).toEqual(["e1", "e2", "e3", "hold"]);
    expect(stepOf(body, "planche_press", "e1")).toMatchObject({
      rungName: "tuck",
      mode: "completa",
      target: 3,
      value: 3,
      estado: "sin_datos",
    });
    expect(stepOf(body, "planche_press", "e2")).toMatchObject({
      mode: "negativa",
      target: 3,
      value: 3,
    });
    expect(stepOf(body, "planche_press", "e3")).toMatchObject({
      rungName: "lean",
      target: 3,
      value: 3,
    });

    // Planche hold (segundos): piso 4 s; el hold final no tiene objetivo y precarga 8.
    expect(exerciseOf(body, "planche_hold").unit).toBe("s");
    expect(stepOf(body, "planche_hold", "e1")).toMatchObject({
      mode: "hold",
      target: 4,
      value: 4,
      estado: "sin_datos",
    });
    expect(stepOf(body, "planche_hold", "hold")).toMatchObject({
      target: null,
      estado: null,
      value: 8,
    });
  });

  it("trae los peldaños elegibles de la escalera por position y los flags del peldaño actual", async () => {
    const { token } = await createActiveConquerMember(app, {
      level: "toro",
      daysCount: 4,
    });

    const body = await today(token);

    const press = exerciseOf(body, "planche_press");
    expect(press.rungs.map((r) => r.code)).toEqual([
      "full",
      "half_lay",
      "straddle",
      "super_adv_tuck",
      "adv_tuck",
      "tuck",
      "lean",
    ]);
    expect(press.rungs.map((r) => r.position)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(stepOf(body, "planche_press", "e1").brazosRectos).toBe(true);
    expect(stepOf(body, "planche_press", "e1").unilateral).toBe(false);
    // One arm / archer arranca en OAP asistida (unilateral) y termina en dominada.
    const dominadas = await today(token, "dominadas");
    expect(stepOf(dominadas, "one_arm_archer", "e1").unilateral).toBe(true);
    expect(stepOf(dominadas, "one_arm_archer", "e3").unilateral).toBe(false);
  });

  it("el alumno puede elegir otro día con ?day= (D-16)", async () => {
    const { token } = await createActiveConquerMember(app, {
      level: "toro",
      daysCount: 4,
    });

    const body = await today(token, "vertical");

    expect(body.dayKey).toBe("vertical");
    expect(body.exercises.map((e) => e.code)).toEqual([
      "hspu",
      "press_90",
      "planche_pushup",
    ]);
    // Lo que "toca" sigue siendo el primero que falta.
    expect(body.nextDayKey).toBe("plancha");
  });

  it("historial en el rango: el objetivo sube un incremento y el techo se marca (S12-5)", async () => {
    const { userId, token } = await createActiveConquerMember(app, {
      level: "toro",
      daysCount: 4,
    });
    const hoy = await memberToday(app, userId);
    const hace2 = weeksAgo(hoy, 2);
    const hace1 = weeksAgo(hoy, 1);
    await insertConquerSession(app, {
      userId,
      date: hace2,
      dayKey: "plancha",
      steps: [
        { exerciseCode: "planche_press", step: "e1", value: 6 },
        { exerciseCode: "planche_hold", step: "e1", value: 10 },
      ],
    });
    await insertConquerSession(app, {
      userId,
      date: hace1,
      dayKey: "plancha",
      steps: [
        { exerciseCode: "planche_press", step: "e1", value: 7 },
        { exerciseCode: "planche_hold", step: "e1", value: 12 },
        { exerciseCode: "planche_hold", step: "hold", value: 15 },
      ],
    });

    const body = await today(token);

    expect(stepOf(body, "planche_press", "e1")).toMatchObject({
      target: 8,
      value: 8,
      estado: "rango",
    });
    expect(stepOf(body, "planche_hold", "e1")).toMatchObject({
      target: 12,
      value: 12,
      estado: "techo1",
    });
    // El hold final precarga la última marca, no un objetivo.
    expect(stepOf(body, "planche_hold", "hold")).toMatchObject({
      target: null,
      estado: null,
      value: 15,
    });
  });

  it("con la sesión del día ya guardada: alreadySaved, lo guardado y el MISMO objetivo", async () => {
    const { token } = await createActiveConquerMember(app, {
      level: "toro",
      daysCount: 4,
    });
    const antes = await today(token);
    const save = await putSession(
      token,
      sessionBodyFromToday(antes, { planche_press: { e1: 5 } }, 3),
    );
    expect(save.statusCode, save.body).toBe(200);

    const despues = await today(token, "plancha");

    expect(despues.alreadySaved).toBe(true);
    expect(despues.pain).toBe(3);
    expect(stepOf(despues, "planche_press", "e1").value).toBe(5);
    // El objetivo se calcula SIN la sesión de hoy: sigue siendo el que se mostró.
    expect(stepOf(despues, "planche_press", "e1").target).toBe(3);
    expect(stepOf(despues, "planche_press", "e1").estado).toBe("sin_datos");
  });

  it("?day= con un día que no es del plan o mal formado: 400", async () => {
    const { token } = await createActiveConquerMember(app, {
      level: "novillo",
      daysCount: 4,
    });

    const sabado = await getToday(token, "sabado");
    const inexistente = await getToday(token, "inexistente");
    const malFormado = await getToday(token, "Plan-cha!");

    expect(sabado.statusCode).toBe(400);
    expect(sabado.json<ErrorBody>().code).toBe("CONQUER_DIA_INVALIDO");
    expect(inexistente.statusCode).toBe(400);
    expect(inexistente.json<ErrorBody>().code).toBe("CONQUER_DIA_INVALIDO");
    expect(malFormado.statusCode).toBe(400);
  });
});

describe("PUT /api/members/conquer/sessions — qué día toca (D-16) y Semana completa", () => {
  it("al guardar Plancha, Hoy pasa a Front y Inicio marca Plancha como hecho", async () => {
    const { userId, token } = await createActiveConquerMember(app, {
      level: "toro",
      daysCount: 4,
    });
    const inicio = await today(token);

    const save = await putSession(token, sessionBodyFromToday(inicio));
    expect(save.statusCode, save.body).toBe(200);

    const siguiente = await today(token);
    expect(siguiente.dayKey).toBe("front");
    expect(siguiente.nextDayKey).toBe("front");
    expect(siguiente.plan.map((d) => d.done)).toEqual([
      true,
      false,
      false,
      false,
      false,
    ]);

    const state = (await getState(token)).json<StateBody>();
    const home = state.member?.home;
    expect(home?.plan[0]).toEqual({
      dayKey: "plancha",
      label: "Plancha",
      done: true,
    });
    expect(home?.nextDayKey).toBe("front");
    expect(home?.weekComplete).toBe(false);
    expect(home?.weekMonday).toBe(mondayOfIso(await memberToday(app, userId)));
  });

  it("con los 4 días guardados: Semana completa y Hoy vuelve al primer día del plan", async () => {
    const { token } = await createActiveConquerMember(app, {
      level: "novillo",
      daysCount: 4,
    });

    for (const dayKey of ["plancha", "front", "vertical", "dominadas"]) {
      const vista = await today(token, dayKey);
      const res = await putSession(token, sessionBodyFromToday(vista));
      expect(res.statusCode, `${dayKey}: ${res.body}`).toBe(200);
    }

    const body = await today(token);
    expect(body.weekComplete).toBe(true);
    expect(body.nextDayKey).toBeNull();
    expect(body.plan.every((d) => d.done)).toBe(true);
    expect(body.dayKey).toBe("plancha");
    // Puede repetir cualquiera: pide otro día y lo recibe.
    expect((await today(token, "vertical")).dayKey).toBe("vertical");
  });
});

describe("GET /api/members/conquer/state — member.home", () => {
  it("la última sesión de cada día trae los E1 de sus ejercicios; los días sin sesión, fecha null", async () => {
    const { userId, token } = await createActiveConquerMember(app, {
      level: "toro",
      daysCount: 4,
    });
    const hoy = await memberToday(app, userId);
    const vieja = weeksAgo(hoy, 3);
    const reciente = weeksAgo(hoy, 1);
    await insertConquerSession(app, {
      userId,
      date: vieja,
      dayKey: "plancha",
      steps: [
        { exerciseCode: "planche_hold", step: "e1", value: 5 },
        { exerciseCode: "planche_press", step: "e1", value: 4 },
      ],
    });
    await insertConquerSession(app, {
      userId,
      date: reciente,
      dayKey: "plancha",
      steps: [
        { exerciseCode: "planche_hold", step: "e1", value: 9 },
        { exerciseCode: "planche_press", step: "e1", value: 6 },
        { exerciseCode: "planche_press", step: "e2", value: 99 },
      ],
    });

    const home = (await getState(token)).json<StateBody>().member?.home;

    expect(home?.lastByDay.map((d) => d.dayKey)).toEqual([
      "plancha",
      "front",
      "vertical",
      "dominadas",
    ]);
    expect(home?.lastByDay[0]).toEqual({
      dayKey: "plancha",
      label: "Plancha",
      date: reciente,
      e1: [
        {
          exerciseName: "Planche hold",
          value: 9,
          unit: "s",
          unilateral: false,
        },
        {
          exerciseName: "Planche press",
          value: 6,
          unit: "reps",
          unilateral: false,
        },
      ],
    });
    expect(home?.lastByDay[1]).toEqual({
      dayKey: "front",
      label: "Front",
      date: null,
      e1: [],
    });
    // Las sesiones de semanas pasadas no marcan el día como hecho.
    expect(home?.plan.every((d) => !d.done)).toBe(true);
  });

  it("la marca de un peldaño unilateral viene con unilateral true (por lado) y la de uno bilateral con false", async () => {
    const { userId, token } = await createActiveConquerMember(app, {
      level: "toro",
      daysCount: 4,
    });
    const hoy = await memberToday(app, userId);
    await insertConquerSession(app, {
      userId,
      date: weeksAgo(hoy, 1),
      dayKey: "dominadas",
      steps: [
        {
          exerciseCode: "one_arm_archer",
          step: "e1",
          value: 4,
          rungCode: "archer",
        },
        {
          exerciseCode: "muscle_up",
          step: "e1",
          value: 3,
        },
      ],
    });

    const home = (await getState(token)).json<StateBody>().member?.home;
    const dominadas = home?.lastByDay.find((d) => d.dayKey === "dominadas");

    // Fase 201 §1.4: el app escribe "4 por lado" solo si el peldaño guardado es unilateral
    expect(dominadas?.e1).toEqual([
      {
        exerciseName: "One arm / archer",
        value: 4,
        unit: "reps",
        unilateral: true,
      },
      {
        exerciseName: "Muscle-up",
        value: 3,
        unit: "reps",
        unilateral: false,
      },
    ]);
  });

  it("un alumno que no está activo no recibe home", async () => {
    const socio = await createTestMember(app);
    await insertConquerMember(app, socio.id);

    const res = await getState(socio.token);

    expect(res.statusCode).toBe(200);
    expect(res.json<StateBody>()).toMatchObject({
      status: "pedido",
      member: null,
    });
  });
});

describe("PUT /api/members/conquer/sessions — guardado", () => {
  it("guardar sin tocar nada cuenta como objetivo cumplido: value == prev_target (D-18)", async () => {
    const { userId, token } = await createActiveConquerMember(app, {
      level: "toro",
      daysCount: 4,
    });
    const hoy = await memberToday(app, userId);
    await insertConquerSession(app, {
      userId,
      date: weeksAgo(hoy, 2),
      dayKey: "plancha",
      steps: [
        { exerciseCode: "planche_press", step: "e1", value: 6 },
        { exerciseCode: "planche_hold", step: "e1", value: 10 },
        { exerciseCode: "planche_hold", step: "hold", value: 15 },
      ],
    });
    await insertConquerSession(app, {
      userId,
      date: weeksAgo(hoy, 1),
      dayKey: "plancha",
      steps: [
        { exerciseCode: "planche_press", step: "e1", value: 7 },
        { exerciseCode: "planche_hold", step: "e1", value: 12 },
      ],
    });
    const vista = await today(token);

    const res = await putSession(token, sessionBodyFromToday(vista));

    expect(res.statusCode, res.body).toBe(200);
    const saved = await readSessionSteps(app, res.json<SaveBody>().sessionId);
    expect(saved.size).toBe(12);
    const actuales = await readConquerSteps(app, userId);
    for (const exercise of vista.exercises) {
      for (const step of exercise.steps) {
        const row = saved.get(`${exercise.code}:${step.step}`);
        expect(row, `${exercise.code}:${step.step}`).toBeDefined();
        expect(row?.value).toBe(step.value);
        if (step.step === "hold") {
          // El hold no tiene objetivo: no hay prev.
          expect(row?.prevTarget).toBeNull();
        } else {
          expect(row?.prevTarget).toBe(step.target);
          expect(row?.value).toBe(row?.prevTarget);
        }
        // Snapshot del peldaño y modo del escalón actual (A1).
        const actual = actuales.get(`${exercise.code}:${step.step}`);
        expect(row?.rungCode).toBe(actual?.rungCode);
        expect(row?.mode).toBe(actual?.mode);
      }
    }
    expect(saved.get("planche_press:e1")).toMatchObject({
      value: 8,
      prevTarget: 8,
    });
    expect(saved.get("planche_hold:hold")?.value).toBe(15);
  });

  it("re-guardar el mismo día y día del plan sobrescribe: una sola sesión, marcas nuevas y el prev de la primera vez (§9, §4.6)", async () => {
    const { userId, token } = await createActiveConquerMember(app, {
      level: "toro",
      daysCount: 4,
    });
    const hoy = await memberToday(app, userId);
    for (const k of [2, 1]) {
      await insertConquerSession(app, {
        userId,
        date: weeksAgo(hoy, k),
        dayKey: "plancha",
        steps: [{ exerciseCode: "planche_press", step: "e1", value: 5 }],
      });
    }
    const vista = await today(token);
    expect(stepOf(vista, "planche_press", "e1").target).toBe(6);
    const primera = await putSession(token, sessionBodyFromToday(vista));
    expect(primera.statusCode, primera.body).toBe(200);

    const segunda = await putSession(
      token,
      sessionBodyFromToday(vista, { planche_press: { e1: 2 } }, 4),
    );

    expect(segunda.statusCode, segunda.body).toBe(200);
    expect(segunda.json<SaveBody>().sessionId).toBe(
      primera.json<SaveBody>().sessionId,
    );
    const sesiones = (await readConquerSessions(app, userId)).filter(
      (s) => s.sessionDate === hoy,
    );
    expect(sesiones).toHaveLength(1);
    expect(sesiones[0].pain).toBe(4);
    const saved = await readSessionSteps(
      app,
      segunda.json<SaveBody>().sessionId,
    );
    expect(saved.size).toBe(12);
    // El valor es el nuevo; el prev sigue siendo el objetivo mostrado (6), no el
    // que saldría contando la sesión que se sobrescribe (7).
    expect(saved.get("planche_press:e1")).toMatchObject({
      value: 2,
      prevTarget: 6,
    });
  });

  it("la fecha la fija el servidor: un date del body se ignora (T-201-21)", async () => {
    const { userId, token } = await createActiveConquerMember(app, {
      level: "toro",
      daysCount: 4,
    });
    const hoy = await memberToday(app, userId);
    const vista = await today(token);
    const body = sessionBodyFromToday(vista);

    const res = await putSession(token, {
      ...body,
      date: addDaysIso(hoy, -1),
      sessionDate: addDaysIso(hoy, -1),
      exercises: body.exercises.map((e) => ({
        ...e,
        prevTarget: 99,
        rungId: 1,
      })),
    });

    expect(res.statusCode, res.body).toBe(200);
    expect(res.json<SaveBody>().date).toBe(hoy);
    const sesiones = await readConquerSessions(app, userId);
    expect(sesiones.map((s) => s.sessionDate)).toEqual([hoy]);
    const saved = await readSessionSteps(app, res.json<SaveBody>().sessionId);
    expect(saved.get("planche_press:e1")?.prevTarget).toBe(3);
  });

  const validValues = { e1: 3, e2: 3, e3: 3, hold: 8 };

  // Cada caso arma el body inválido a partir del Hoy de un Novillo de 4 días.
  it.each<[string, (ids: Map<string, number>) => unknown]>([
    [
      "molestia 11",
      (ids) => ({
        dayKey: "plancha",
        pain: 11,
        exercises: ["planche_hold", "planche_press", "lsit_plancha"].map(
          (c) => ({ exerciseId: ids.get(c), ...validValues }),
        ),
      }),
    ],
    [
      "molestia negativa",
      (ids) => ({
        dayKey: "plancha",
        pain: -1,
        exercises: ["planche_hold", "planche_press", "lsit_plancha"].map(
          (c) => ({ exerciseId: ids.get(c), ...validValues }),
        ),
      }),
    ],
    [
      "101 repeticiones en un ejercicio de reps",
      (ids) => ({
        dayKey: "plancha",
        pain: 0,
        exercises: [
          { exerciseId: ids.get("planche_hold"), ...validValues },
          { exerciseId: ids.get("planche_press"), ...validValues, e1: 101 },
          { exerciseId: ids.get("lsit_plancha"), ...validValues },
        ],
      }),
    ],
    [
      "601 segundos en un ejercicio de segundos",
      (ids) => ({
        dayKey: "plancha",
        pain: 0,
        exercises: [
          { exerciseId: ids.get("planche_hold"), ...validValues, e1: 601 },
          { exerciseId: ids.get("planche_press"), ...validValues },
          { exerciseId: ids.get("lsit_plancha"), ...validValues },
        ],
      }),
    ],
    [
      "601 segundos en el hold final",
      (ids) => ({
        dayKey: "plancha",
        pain: 0,
        exercises: [
          { exerciseId: ids.get("planche_hold"), ...validValues },
          { exerciseId: ids.get("planche_press"), ...validValues, hold: 601 },
          { exerciseId: ids.get("lsit_plancha"), ...validValues },
        ],
      }),
    ],
    [
      "valor negativo",
      (ids) => ({
        dayKey: "plancha",
        pain: 0,
        exercises: [
          { exerciseId: ids.get("planche_hold"), ...validValues },
          { exerciseId: ids.get("planche_press"), ...validValues, e2: -1 },
          { exerciseId: ids.get("lsit_plancha"), ...validValues },
        ],
      }),
    ],
    [
      "falta un ejercicio",
      (ids) => ({
        dayKey: "plancha",
        pain: 0,
        exercises: ["planche_hold", "planche_press"].map((c) => ({
          exerciseId: ids.get(c),
          ...validValues,
        })),
      }),
    ],
    [
      "un ejercicio de otro día",
      (ids) => ({
        dayKey: "plancha",
        pain: 0,
        exercises: ["planche_hold", "planche_press", "front_hold"].map((c) => ({
          exerciseId: ids.get(c),
          ...validValues,
        })),
      }),
    ],
    [
      "un ejercicio repetido",
      (ids) => ({
        dayKey: "plancha",
        pain: 0,
        exercises: ["planche_hold", "planche_press", "planche_press"].map(
          (c) => ({ exerciseId: ids.get(c), ...validValues }),
        ),
      }),
    ],
    [
      "el día sábado en un Novillo",
      (ids) => ({
        dayKey: "sabado",
        pain: 0,
        exercises: ["planche_hold", "planche_press", "lsit_plancha"].map(
          (c) => ({ exerciseId: ids.get(c), ...validValues }),
        ),
      }),
    ],
    [
      "un día inexistente",
      (ids) => ({
        dayKey: "inexistente",
        pain: 0,
        exercises: ["planche_hold", "planche_press", "lsit_plancha"].map(
          (c) => ({ exerciseId: ids.get(c), ...validValues }),
        ),
      }),
    ],
    ["sin ejercicios", () => ({ dayKey: "plancha", pain: 0, exercises: [] })],
    [
      "sin molestia",
      (ids) => ({
        dayKey: "plancha",
        exercises: ["planche_hold", "planche_press", "lsit_plancha"].map(
          (c) => ({ exerciseId: ids.get(c), ...validValues }),
        ),
      }),
    ],
  ])("body inválido (%s): 400 y no se guarda nada", async (_caso, armar) => {
    const { userId, token } = await createActiveConquerMember(app, {
      level: "novillo",
      daysCount: 4,
    });
    const ids = await conquerExerciseIds(app);

    const res = await putSession(token, armar(ids));

    expect(res.statusCode, res.body).toBe(400);
    expect(await readConquerSessions(app, userId)).toEqual([]);
  });

  it("los 400 de negocio traen su code", async () => {
    const { token } = await createActiveConquerMember(app, {
      level: "novillo",
      daysCount: 4,
    });
    const ids = await conquerExerciseIds(app);
    const base = {
      pain: 0,
      exercises: ["planche_hold", "planche_press"].map((c) => ({
        exerciseId: ids.get(c),
        ...validValues,
      })),
    };

    const faltante = await putSession(token, { dayKey: "plancha", ...base });
    const dia = await putSession(token, { dayKey: "sabado", ...base });

    expect(faltante.json<ErrorBody>().code).toBe(
      "CONQUER_EJERCICIOS_INVALIDOS",
    );
    expect(dia.json<ErrorBody>().code).toBe("CONQUER_DIA_INVALIDO");
  });
});

describe("la fecha de Hoy es la de la sede, no la de UTC (A16, T-201-21)", () => {
  it("a las 23:30 en la sede (ya es el día siguiente en UTC) Hoy y el guardado usan el día de la sede", async () => {
    // 23:30 en Buenos Aires = 02:30 UTC del día siguiente. Se fija ANTES de
    // loguear para que los tokens se emitan con el reloj ya corrido.
    const noche = new Date();
    noche.setUTCHours(2, 30, 0, 0);
    if (noche.getTime() <= Date.now()) noche.setUTCDate(noche.getUTCDate() + 1);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(noche);
    const fechaUtc = noche.toISOString().slice(0, 10);
    const { userId, token } = await createActiveConquerMember(app, {
      level: "toro",
      daysCount: 4,
    });
    const hoy = await memberToday(app, userId);

    const vista = await today(token);
    const res = await putSession(token, sessionBodyFromToday(vista));

    expect(hoy).toBe(addDaysIso(fechaUtc, -1));
    expect(vista.date).toBe(hoy);
    expect(vista.weekMonday).toBe(mondayOfIso(hoy));
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json<SaveBody>().date).toBe(hoy);
    const sesiones = await readConquerSessions(app, userId);
    expect(sesiones.map((s) => s.sessionDate)).toEqual([hoy]);
    const siguiente = await today(token);
    expect(siguiente.plan[0].done).toBe(true);
    expect(siguiente.dayKey).toBe("front");
  });
});

describe("PUT /api/members/conquer/sessions — mapa muscular (D-13 a)", () => {
  async function guardarPlancha(
    edits: Record<string, Partial<Record<"e1" | "e2" | "e3" | "hold", number>>>,
  ) {
    const { token } = await createActiveConquerMember(app, {
      level: "toro",
      daysCount: 4,
    });
    const vista = await today(token);
    const res = await putSession(token, sessionBodyFromToday(vista, edits));
    expect(res.statusCode, res.body).toBe(200);
    return res.json<SaveBody>();
  }

  const ceros = { e1: 0, e2: 0, e3: 0, hold: 0 };

  it("con todo cargado se encienden los principales y los secundarios de Plancha", async () => {
    const body = await guardarPlancha({});

    expect(body.lighting.primary).toEqual(
      expect.arrayContaining(["deltoids", "chest", "abs"]),
    );
    expect(body.lighting.secondary).toEqual(
      expect.arrayContaining(["triceps"]),
    );
    // Una zona principal no se repite como secundaria.
    expect(
      body.lighting.secondary.filter((z) => body.lighting.primary.includes(z)),
    ).toEqual([]);
  });

  it("con todo en 0 no se enciende nada", async () => {
    const body = await guardarPlancha({
      planche_hold: ceros,
      planche_press: ceros,
      lsit_plancha: ceros,
    });

    expect(body.lighting).toEqual({ primary: [], secondary: [] });
  });

  it("el hold final solo no cuenta: sin E1-E3 no se enciende nada", async () => {
    const body = await guardarPlancha({
      planche_hold: { e1: 0, e2: 0, e3: 0, hold: 30 },
      planche_press: { e1: 0, e2: 0, e3: 0, hold: 30 },
      lsit_plancha: { e1: 0, e2: 0, e3: 0, hold: 30 },
    });

    expect(body.lighting).toEqual({ primary: [], secondary: [] });
  });

  it("un solo ejercicio trabajado enciende los principales (3 series) pero no los secundarios (hacen falta 4)", async () => {
    const body = await guardarPlancha({
      planche_hold: ceros,
      lsit_plancha: ceros,
    });

    expect(body.lighting.primary).toEqual(
      expect.arrayContaining(["deltoids", "chest", "abs"]),
    );
    expect(body.lighting.secondary).toEqual([]);
  });
});

describe("Conquer del alumno: quién puede y aislamiento entre gimnasios", () => {
  const sesionValida = {
    dayKey: "plancha",
    pain: 0,
    exercises: [{ exerciseId: 1, e1: 0, e2: 0, e3: 0, hold: 0 }],
  };

  async function pedirRutas(token: string) {
    return [
      await getToday(token),
      await putSession(token, sesionValida),
      await app.inject({
        method: "PUT",
        url: conquerStepUrl(1, "e1"),
        headers: auth(token),
        payload: { rungId: 1, mode: "completa" },
      }),
    ];
  }

  it("un socio con pedido (todavía no activo): 409 CONQUER_NO_ACTIVO en las 3 rutas", async () => {
    const socio = await createTestMember(app);
    await insertConquerMember(app, socio.id);

    for (const res of await pedirRutas(socio.token)) {
      expect(res.statusCode, res.body).toBe(409);
      expect(res.json<ErrorBody>().code).toBe("CONQUER_NO_ACTIVO");
    }
  });

  it("un socio bloqueado (sin fila): 409 CONQUER_NO_ACTIVO en las 3 rutas", async () => {
    const socio = await createTestMember(app);

    for (const res of await pedirRutas(socio.token)) {
      expect(res.statusCode, res.body).toBe(409);
      expect(res.json<ErrorBody>().code).toBe("CONQUER_NO_ACTIVO");
    }
  });

  it("sin token: 401 en las 3 rutas", async () => {
    const res = [
      await app.inject({ method: "GET", url: CONQUER_TODAY_URL }),
      await app.inject({
        method: "PUT",
        url: CONQUER_SESSIONS_URL,
        payload: sesionValida,
      }),
      await app.inject({
        method: "PUT",
        url: conquerStepUrl(1, "e1"),
        payload: { rungId: 1, mode: "completa" },
      }),
    ];

    expect(res.map((r) => r.statusCode)).toEqual([401, 401, 401]);
  });

  it("gimnasio 2 sin el módulo: 404 en las 3 rutas", async () => {
    const [socio2] = gym2.socios;

    for (const res of await pedirRutas(socio2.token)) {
      expect(res.statusCode, res.body).toBe(404);
    }
  });

  it("gimnasio 2 con el módulo: un socio sin Conquer recibe 409, nunca datos del gimnasio 1", async () => {
    await setModuleFlag(app, TENANT_DOS, "templo-training", true);
    const { userId } = await createActiveConquerMember(app, {
      level: "toro",
      daysCount: 4,
    });
    const [socio2] = gym2.socios;

    for (const res of await pedirRutas(socio2.token)) {
      expect(res.statusCode, res.body).toBe(409);
      expect(res.json<ErrorBody>().code).toBe("CONQUER_NO_ACTIVO");
    }
    expect(await readConquerSessions(app, userId)).toEqual([]);
  });

  it("el alumno del gimnasio 1 no escribe en la sesión de otro alumno del mismo día", async () => {
    const a = await createActiveConquerMember(app, {
      level: "toro",
      daysCount: 4,
    });
    const b = await createActiveConquerMember(app, {
      level: "toro",
      daysCount: 4,
    });
    const vistaA = await today(a.token);
    const resA = await putSession(a.token, sessionBodyFromToday(vistaA));
    expect(resA.statusCode, resA.body).toBe(200);

    const vistaB = await today(b.token);

    // B sigue con Plancha pendiente y sin sesión: lo de A no se le filtra.
    expect(vistaB.alreadySaved).toBe(false);
    expect(vistaB.plan[0].done).toBe(false);
    const filasB = await app.db
      .select({ id: schema.conquerSessions.id })
      .from(schema.conquerSessions)
      .where(
        and(
          tenantWhere(schema.conquerSessions, TEMPLO_CTX),
          eq(schema.conquerSessions.userId, b.userId),
        ),
      );
    expect(filasB).toEqual([]);
  });
});
