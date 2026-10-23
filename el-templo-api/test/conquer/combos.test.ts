/**
 * Fase 201 Plan 10 (§3, S12-3, D-14, T-201-33/34/35): combos de Toro.
 *
 *   - GET /api/members/conquer/today  (opening / saturday)
 *   - PUT /api/members/conquer/sessions  (opening, push, pull)
 *   - POST /api/members/conquer/combos/:comboKey/subir
 *
 * Integración contra el MySQL de tests. Usuarios SIEMPRE con fábricas. El
 * historial de semanas anteriores se inserta DIRECTO con `insertConquerSession`
 * (lunes de semanas pasadas); todas las fechas son relativas al "hoy" de la
 * sede del alumno. `activation_date` se corre hacia atrás cuando el historial
 * insertado tiene que contar para la regla de Subir (D-14).
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
import { and, eq } from "drizzle-orm";
import * as schema from "../../src/db/schema";
import { addDaysIso } from "../../src/modules/conquer/calendar";
import { CONQUER_SETTING_KEYS } from "../../src/modules/conquer/settings";
import { tenantValues, tenantWhere } from "../../src/modules/shared/tenant";
import { cleanAllTestData, createTestApp, createTestMember } from "../helpers";
import {
  limpiarSegundoGimnasio,
  seedSecondTenant,
  TENANT_DOS,
  type SegundoGimnasio,
} from "../fixtures/second-tenant";
import { clearModuleFlags, setModuleFlag } from "../fixtures/module-flags";
import {
  clearConquerSettings,
  conquerRungId,
  createActiveConquerMember,
  fetchProgress,
  fetchToday,
  insertConquerSession,
  memberToday,
  patchConquerMember,
  postComboSubir,
  putSessionRaw,
  readComboState,
  readConquerAlerts,
  readConquerSessions,
  saturdayBody,
  sessionBodyFromToday,
  setComboState,
  TEMPLO_CTX,
  weeksAgo,
  type ConquerErrorBody,
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
  await clearConquerSettings(app);
  await clearModuleFlags(app, TENANT_DOS);
});

afterAll(async () => {
  await cleanAllTestData(app);
  await limpiarSegundoGimnasio(app);
  await app.close();
});

/** Toro de 4 días con la activación 60 días atrás (el historial insertado cuenta para D-14). */
async function createToro(
  opts: { activadoHaceDias?: number } = {},
): Promise<{ userId: number; token: string; hoy: string }> {
  const { userId, token } = await createActiveConquerMember(app, {
    level: "toro",
    daysCount: 4,
  });
  const hoy = await memberToday(app, userId);
  await patchConquerMember(app, userId, {
    activationDate: addDaysIso(hoy, -(opts.activadoHaceDias ?? 60)),
  });
  return { userId, token, hoy };
}

/**
 * Inserta una sesión de Plancha con el combo de apertura cumplido (o no) en
 * cada una de las semanas `weeks` atrás (1 = la semana pasada).
 */
async function sembrarApertura(
  userId: number,
  hoy: string,
  weeks: number[],
  combo: { rungCode?: string; series?: number; target?: number } = {},
): Promise<void> {
  for (const n of weeks) {
    await insertConquerSession(app, {
      userId,
      date: weeksAgo(hoy, n),
      dayKey: "plancha",
      steps: [],
      combo: {
        rungCode: combo.rungCode ?? "straddle",
        series: combo.series ?? 3,
        target: combo.target ?? 3,
      },
    });
  }
}

/** Sesiones del alumno con sus columnas de combo. */
async function sesionesDe(userId: number) {
  return readConquerSessions(app, userId);
}

async function putApertura(
  token: string,
  rungId: number,
  series: number,
  dayKey?: string,
) {
  const hoy = await fetchToday(app, token, dayKey);
  return putSessionRaw(app, token, {
    ...sessionBodyFromToday(hoy),
    opening: { rungId, series },
  });
}

async function setComboWeeksN(n: number): Promise<void> {
  await app.db.insert(schema.tenantSettings).values(
    tenantValues(TEMPLO_CTX, {
      settingKey: CONQUER_SETTING_KEYS.comboWeeksN,
      settingValue: String(n),
    }),
  );
}

describe("combo de apertura — objetivo (§3.2, A11)", () => {
  it("desde la semana 3 del bloque el objetivo es 4 y el contador viene precargado con 4", async () => {
    const { token } = await createToro({ activadoHaceDias: 15 });

    const hoy = await fetchToday(app, token);

    expect(hoy.opening).toMatchObject({ target: 4, value: 4 });
  });

  it("en la semana 1 del bloque el objetivo es 3", async () => {
    const { token } = await createToro({ activadoHaceDias: 0 });

    const hoy = await fetchToday(app, token);

    expect(hoy.opening).toMatchObject({ target: 3, value: 3 });
  });
});

describe("PUT /sessions — apertura (§3.3, T-201-34)", () => {
  it("guardar la apertura con straddle y 4 series deja combo_rung_id, combo_series y combo_target en la fila (objetivo del día)", async () => {
    const { userId, token, hoy } = await createToro({ activadoHaceDias: 15 });
    const straddle = await conquerRungId(app, "palanca", "straddle");

    const res = await putApertura(token, straddle, 4);

    expect(res.statusCode, res.body).toBe(200);
    const [fila] = await sesionesDe(userId);
    expect(fila).toMatchObject({
      dayKey: "plancha",
      comboRungId: straddle,
      comboSeries: 4,
      comboTarget: 4,
      pushRungId: null,
      pullRungId: null,
    });
    const vista = await fetchToday(app, token, "plancha");
    expect(vista.alreadySaved).toBe(true);
    expect(vista.opening).toMatchObject({ value: 4, rungId: straddle });
    expect(await readComboState(app, userId)).toEqual({
      plancha: { rungId: straddle, since: hoy },
    });
  });

  it("un Toro que guarda SIN apertura recibe 200, la fila queda con combo_* NULL y esa semana no cuenta para subir", async () => {
    const { userId, token, hoy } = await createToro();
    await sembrarApertura(userId, hoy, [1]);
    const straddle = await conquerRungId(app, "palanca", "straddle");
    // Combo ya en marcha en straddle: guardar el mismo peldaño no reinicia la cuenta.
    await setComboState(app, userId, {
      plancha: { rungCode: "straddle", since: addDaysIso(hoy, -60) },
    });

    const sin = await putSessionRaw(
      app,
      token,
      sessionBodyFromToday(await fetchToday(app, token)),
    );

    expect(sin.statusCode, sin.body).toBe(200);
    const [hoyFila] = (await sesionesDe(userId)).filter(
      (s) => s.sessionDate === hoy,
    );
    expect(hoyFila).toMatchObject({
      comboRungId: null,
      comboSeries: null,
      comboTarget: null,
    });
    expect((await fetchToday(app, token, "plancha")).opening?.subir.ready).toBe(
      false,
    );

    // Con la apertura cumplida esta semana (objetivo 4: semana >= 3 del bloque),
    // la semana pasada + esta suman 2 seguidas.
    const con = await putApertura(token, straddle, 4);
    expect(con.statusCode, con.body).toBe(200);
    expect((await fetchToday(app, token, "plancha")).opening?.subir.ready).toBe(
      true,
    );
  });

  it("un rungId de otra escalera es 400 CONQUER_PELDANO_INVALIDO y no guarda nada", async () => {
    const { userId, token } = await createToro();
    const deOtraEscalera = await conquerRungId(app, "p90", "full");

    const res = await putApertura(token, deOtraEscalera, 3);

    expect(res.statusCode, res.body).toBe(400);
    expect(res.json<ConquerErrorBody>().code).toBe("CONQUER_PELDANO_INVALIDO");
    expect(await sesionesDe(userId)).toEqual([]);
  });

  it("un rungId inexistente es 400 CONQUER_PELDANO_INVALIDO", async () => {
    const { token } = await createToro();

    const res = await putApertura(token, 999999999, 3);

    expect(res.statusCode, res.body).toBe(400);
    expect(res.json<ConquerErrorBody>().code).toBe("CONQUER_PELDANO_INVALIDO");
  });

  it.each([
    ["opening", 11],
    ["opening", -1],
    ["push", 14],
    ["pull", 14],
  ])(
    "T-201-35: %s con %i series es 400 y no guarda nada",
    async (campo, series) => {
      const { userId, token } = await createToro();
      const straddle = await conquerRungId(app, "palanca", "straddle");
      const vista = await fetchToday(app, token);

      const res = await putSessionRaw(app, token, {
        ...sessionBodyFromToday(vista),
        [campo]: { rungId: straddle, series },
      });

      expect(res.statusCode, res.body).toBe(400);
      expect(await sesionesDe(userId)).toEqual([]);
    },
  );

  it("push o pull en un día normal es 409 CONQUER_SIN_COMBOS", async () => {
    const { userId, token } = await createToro();
    const straddle = await conquerRungId(app, "palanca", "straddle");
    const vista = await fetchToday(app, token);

    const res = await putSessionRaw(app, token, {
      ...sessionBodyFromToday(vista),
      push: { rungId: straddle, series: 13 },
    });

    expect(res.statusCode, res.body).toBe(409);
    expect(res.json<ConquerErrorBody>().code).toBe("CONQUER_SIN_COMBOS");
    expect(await sesionesDe(userId)).toEqual([]);
  });
});

describe("Subir la progresión de arranque del combo (D-14)", () => {
  it("apertura cumplida las 2 semanas anteriores: Hoy y Progreso ofrecen Subir, POST sube a half lay y después ya no toca", async () => {
    const { userId, token, hoy } = await createToro();
    await sembrarApertura(userId, hoy, [1, 2]);
    const halfLay = await conquerRungId(app, "palanca", "half_lay");

    const antes = await fetchToday(app, token, "plancha");
    expect(antes.opening?.subir).toEqual({
      ready: true,
      toRungName: "half lay",
    });
    expect((await fetchProgress(app, token)).comboSubir).toEqual([
      {
        comboKey: "plancha",
        label: "Plancha",
        fromRungName: "straddle",
        toRungName: "half lay",
      },
    ]);

    const res = await postComboSubir(app, token, "plancha");

    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toMatchObject({
      combo: {
        comboKey: "plancha",
        rungId: halfLay,
        rungName: "half lay",
        subir: { ready: false, toRungName: null },
      },
    });
    expect(await readComboState(app, userId)).toEqual({
      plancha: { rungId: halfLay, since: hoy },
    });
    const despues = await fetchToday(app, token, "plancha");
    expect(despues.opening).toMatchObject({
      rungName: "half lay",
      subir: { ready: false },
    });
    expect((await fetchProgress(app, token)).comboSubir).toEqual([]);

    const otra = await postComboSubir(app, token, "plancha");
    expect(otra.statusCode).toBe(409);
    expect(otra.json<ConquerErrorBody>().code).toBe("CONQUER_NO_TOCA_SUBIR");
  });

  it("con conquer.combo_weeks_n = 3 no está listo con 2 semanas, y sí con 3", async () => {
    const { userId, token, hoy } = await createToro();
    await setComboWeeksN(3);
    await sembrarApertura(userId, hoy, [1, 2]);

    const conDos = await fetchToday(app, token, "plancha");
    expect(conDos.opening?.subir.ready).toBe(false);
    const rechazado = await postComboSubir(app, token, "plancha");
    expect(rechazado.statusCode).toBe(409);
    expect(rechazado.json<ConquerErrorBody>().code).toBe(
      "CONQUER_NO_TOCA_SUBIR",
    );

    await sembrarApertura(userId, hoy, [3]);
    const conTres = await fetchToday(app, token, "plancha");
    expect(conTres.opening?.subir.ready).toBe(true);
  });

  it.each([
    ["una semana con hueco", [1, 3]],
    ["la racha terminó hace 2 semanas", [2, 3]],
  ])("%s: no está listo", async (_titulo, semanas) => {
    const { userId, token, hoy } = await createToro();
    await sembrarApertura(userId, hoy, semanas);

    const vista = await fetchToday(app, token, "plancha");

    expect(vista.opening?.subir.ready).toBe(false);
  });

  it("una semana por debajo del objetivo corta la racha", async () => {
    const { userId, token, hoy } = await createToro();
    await sembrarApertura(userId, hoy, [1]);
    await sembrarApertura(userId, hoy, [2], { series: 2 });

    const vista = await fetchToday(app, token, "plancha");

    expect(vista.opening?.subir.ready).toBe(false);
  });

  it("la semana en curso sin cumplir todavía no corta una racha de las 2 anteriores", async () => {
    const { userId, token, hoy } = await createToro();
    await sembrarApertura(userId, hoy, [1, 2]);
    const straddle = await conquerRungId(app, "palanca", "straddle");
    await setComboState(app, userId, {
      plancha: { rungCode: "straddle", since: addDaysIso(hoy, -60) },
    });

    // Hoy: 1 serie de 3 (por debajo del objetivo). La semana pasada y la anterior siguen contando.
    const res = await putApertura(token, straddle, 1);
    expect(res.statusCode, res.body).toBe(200);

    const vista = await fetchToday(app, token, "plancha");
    expect(vista.opening?.subir.ready).toBe(true);
  });

  it("las sesiones con otro peldaño o anteriores a combo_state.since no cuentan", async () => {
    const { userId, token, hoy } = await createToro();
    await sembrarApertura(userId, hoy, [1, 2], { rungCode: "half_lay" });
    // El combo vigente es straddle (default): las semanas con half_lay no son suyas.
    const sinEstado = await fetchToday(app, token, "plancha");
    expect(sinEstado.opening?.subir.ready).toBe(false);

    // Combo en straddle desde la semana pasada: la de hace 2 semanas es anterior a since.
    await cleanSesiones(userId);
    await sembrarApertura(userId, hoy, [1, 2]);
    await setComboState(app, userId, {
      plancha: { rungCode: "straddle", since: weeksAgo(hoy, 1) },
    });
    const conSince = await fetchToday(app, token, "plancha");
    expect(conSince.opening?.subir.ready).toBe(false);
  });

  it("en el peldaño más difícil (full) es 409 CONQUER_TOPE_ESCALERA y avisa al coach una sola vez", async () => {
    const { userId, token, hoy } = await createToro();
    await setComboState(app, userId, {
      plancha: { rungCode: "full", since: addDaysIso(hoy, -60) },
    });
    await sembrarApertura(userId, hoy, [1, 2], { rungCode: "full" });
    const full = await conquerRungId(app, "palanca", "full");

    const vista = await fetchToday(app, token, "plancha");
    expect(vista.opening?.subir).toEqual({ ready: true, toRungName: null });

    const res = await postComboSubir(app, token, "plancha");
    const repetido = await postComboSubir(app, token, "plancha");

    expect(res.statusCode, res.body).toBe(409);
    expect(res.json<ConquerErrorBody>().code).toBe("CONQUER_TOPE_ESCALERA");
    expect(repetido.statusCode).toBe(409);
    const alertas = (await readConquerAlerts(app, userId)).filter(
      (a) => a.type === "tope_escalera",
    );
    expect(alertas).toHaveLength(1);
    expect(alertas[0]).toMatchObject({
      dedupeKey: `tope:combo:plancha:${full}`,
      status: "abierta",
    });
    expect(alertas[0].detail).toMatchObject({
      comboKey: "plancha",
      rungName: "full",
    });
    expect((await readComboState(app, userId))?.plancha.rungId).toBe(full);
  });

  it("push y pull se cuentan por separado de la apertura y entre sí", async () => {
    const { userId, token, hoy } = await createToro();
    for (const n of [1, 2]) {
      await insertConquerSession(app, {
        userId,
        date: weeksAgo(hoy, n),
        dayKey: "sabado",
        steps: [],
        push: { rungCode: "straddle", series: 13, target: 13 },
        pull: { rungCode: "straddle", series: 12, target: 13 },
      });
    }

    const sabado = await fetchToday(app, token, "sabado");
    const plancha = await fetchToday(app, token, "plancha");

    expect(sabado.saturday?.push.subir).toEqual({
      ready: true,
      toRungName: "half lay",
    });
    expect(sabado.saturday?.pull.subir.ready).toBe(false);
    expect(plancha.opening?.subir.ready).toBe(false);
    expect((await fetchProgress(app, token)).comboSubir).toEqual([
      expect.objectContaining({ comboKey: "push", label: "Push" }),
    ]);
    expect((await postComboSubir(app, token, "pull")).statusCode).toBe(409);
    expect((await postComboSubir(app, token, "push")).statusCode).toBe(200);
    expect((await readComboState(app, userId))?.push.since).toBe(hoy);
  });

  it.each(["plancha", "front", "vertical", "dominadas", "push", "pull"])(
    "sin historial POST /combos/%s/subir es 409 CONQUER_NO_TOCA_SUBIR",
    async (comboKey) => {
      const { token } = await createToro();

      const res = await postComboSubir(app, token, comboKey);

      expect(res.statusCode, res.body).toBe(409);
      expect(res.json<ConquerErrorBody>().code).toBe("CONQUER_NO_TOCA_SUBIR");
    },
  );

  it("un comboKey que no existe es 400", async () => {
    const { token } = await createToro();

    const res = await postComboSubir(app, token, "espalda");

    expect(res.statusCode).toBe(400);
  });
});

describe("cambio de la progresión de arranque (§4.5)", () => {
  it("guardar con otro peldaño reinicia combo_state.since a hoy", async () => {
    const { userId, token, hoy } = await createToro();
    const halfLay = await conquerRungId(app, "palanca", "half_lay");
    await setComboState(app, userId, {
      plancha: { rungCode: "straddle", since: addDaysIso(hoy, -20) },
    });

    const res = await putApertura(token, halfLay, 3);

    expect(res.statusCode, res.body).toBe(200);
    expect(await readComboState(app, userId)).toEqual({
      plancha: { rungId: halfLay, since: hoy },
    });
  });

  it("guardar con el mismo peldaño NO toca since", async () => {
    const { userId, token, hoy } = await createToro();
    const desde = addDaysIso(hoy, -20);
    await setComboState(app, userId, {
      plancha: { rungCode: "half_lay", since: desde },
    });
    const halfLay = await conquerRungId(app, "palanca", "half_lay");

    const res = await putApertura(token, halfLay, 3);

    expect(res.statusCode, res.body).toBe(200);
    expect(await readComboState(app, userId)).toEqual({
      plancha: { rungId: halfLay, since: desde },
    });
  });

  it("el estado de un combo no pisa el de otro", async () => {
    const { userId, token, hoy } = await createToro();
    const full = await conquerRungId(app, "palanca", "full");
    const lean = await conquerRungId(app, "palanca", "lean");
    await setComboState(app, userId, {
      front: { rungCode: "lean", since: addDaysIso(hoy, -5) },
    });

    const res = await putApertura(token, full, 3);

    expect(res.statusCode, res.body).toBe(200);
    expect(await readComboState(app, userId)).toEqual({
      front: { rungId: lean, since: addDaysIso(hoy, -5) },
      plancha: { rungId: full, since: hoy },
    });
  });
});

describe("sábado de combos (§3.2)", () => {
  it("guardar push 13 y pull 12 deja push_*/pull_* con objetivo 13, sin marcas ni combo_*", async () => {
    const { userId, token, hoy } = await createToro();
    const straddle = await conquerRungId(app, "palanca", "straddle");
    const halfLay = await conquerRungId(app, "palanca", "half_lay");

    const res = await putSessionRaw(
      app,
      token,
      saturdayBody({
        push: { rungId: straddle, series: 13 },
        pull: { rungId: halfLay, series: 12 },
        pain: 2,
      }),
    );

    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toMatchObject({
      dayKey: "sabado",
      date: hoy,
      lighting: { primary: [], secondary: [] },
      calibration: [],
    });
    const [fila] = await sesionesDe(userId);
    expect(fila).toMatchObject({
      dayKey: "sabado",
      pain: 2,
      pushRungId: straddle,
      pushSeries: 13,
      pushTarget: 13,
      pullRungId: halfLay,
      pullSeries: 12,
      pullTarget: 13,
      comboRungId: null,
      comboSeries: null,
      comboTarget: null,
    });
    const marcas = await app.db
      .select({ id: schema.conquerSessionSteps.id })
      .from(schema.conquerSessionSteps)
      .where(
        and(
          tenantWhere(schema.conquerSessionSteps, TEMPLO_CTX),
          eq(schema.conquerSessionSteps.sessionId, fila.id),
        ),
      );
    expect(marcas).toEqual([]);
    expect(await readComboState(app, userId)).toEqual({
      push: { rungId: straddle, since: hoy },
      pull: { rungId: halfLay, since: hoy },
    });

    const vista = await fetchToday(app, token, "sabado");
    expect(vista.alreadySaved).toBe(true);
    expect(vista.pain).toBe(2);
    expect(vista.saturday?.push.value).toBe(13);
    expect(vista.saturday?.pull.value).toBe(12);
    expect(vista.plan[4]).toMatchObject({ dayKey: "sabado", done: true });
  });

  it("guardar el sábado dos veces reemplaza la sesión (una sola fila)", async () => {
    const { userId, token } = await createToro();
    const straddle = await conquerRungId(app, "palanca", "straddle");

    for (const series of [13, 9]) {
      const res = await putSessionRaw(
        app,
        token,
        saturdayBody({
          push: { rungId: straddle, series },
          pull: { rungId: straddle, series },
        }),
      );
      expect(res.statusCode, res.body).toBe(200);
    }

    const filas = await sesionesDe(userId);
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ pushSeries: 9, pullSeries: 9 });
  });

  it("sin pull es 400 CONQUER_COMBO_INVALIDO", async () => {
    const { userId, token } = await createToro();
    const straddle = await conquerRungId(app, "palanca", "straddle");

    const res = await putSessionRaw(app, token, {
      dayKey: "sabado",
      pain: 0,
      push: { rungId: straddle, series: 13 },
    });

    expect(res.statusCode, res.body).toBe(400);
    expect(res.json<ConquerErrorBody>().code).toBe("CONQUER_COMBO_INVALIDO");
    expect(await sesionesDe(userId)).toEqual([]);
  });

  it("con exercises es 400 CONQUER_EJERCICIOS_INVALIDOS", async () => {
    const { userId, token } = await createToro();
    const straddle = await conquerRungId(app, "palanca", "straddle");
    const plancha = await fetchToday(app, token, "plancha");

    const res = await putSessionRaw(app, token, {
      ...saturdayBody({
        push: { rungId: straddle, series: 13 },
        pull: { rungId: straddle, series: 13 },
      }),
      exercises: sessionBodyFromToday(plancha).exercises,
    });

    expect(res.statusCode, res.body).toBe(400);
    expect(res.json<ConquerErrorBody>().code).toBe(
      "CONQUER_EJERCICIOS_INVALIDOS",
    );
    expect(await sesionesDe(userId)).toEqual([]);
  });

  it("con opening es 409 y con un peldaño de otra escalera es 400", async () => {
    const { token } = await createToro();
    const straddle = await conquerRungId(app, "palanca", "straddle");
    const ajeno = await conquerRungId(app, "p90", "full");

    const conOpening = await putSessionRaw(app, token, {
      ...saturdayBody({
        push: { rungId: straddle, series: 13 },
        pull: { rungId: straddle, series: 13 },
      }),
      opening: { rungId: straddle, series: 3 },
    });
    const ajena = await putSessionRaw(
      app,
      token,
      saturdayBody({
        push: { rungId: straddle, series: 13 },
        pull: { rungId: ajeno, series: 13 },
      }),
    );

    expect(conOpening.statusCode).toBe(409);
    expect(conOpening.json<ConquerErrorBody>().code).toBe("CONQUER_SIN_COMBOS");
    expect(ajena.statusCode).toBe(400);
    expect(ajena.json<ConquerErrorBody>().code).toBe(
      "CONQUER_PELDANO_INVALIDO",
    );
  });
});

describe("recortes aceptados (§5.1, A12)", () => {
  it.each([
    [1, 9, 3, 6],
    [2, 8, 2, 6],
  ])(
    "etapa %i: el sábado es de %i series (%i máximas + %i drops) y se guarda con ese objetivo",
    async (etapa, objetivo, maxSeries, drops) => {
      const { userId, token } = await createToro();
      await patchConquerMember(app, userId, { cutStage: etapa });
      const straddle = await conquerRungId(app, "palanca", "straddle");

      const vista = await fetchToday(app, token, "sabado");
      expect(vista.saturday?.push).toMatchObject({
        target: objetivo,
        value: objetivo,
        maxSeries,
        drops,
      });
      expect(vista.saturday?.pull).toMatchObject({ target: objetivo });

      const res = await putSessionRaw(
        app,
        token,
        saturdayBody({
          push: { rungId: straddle, series: objetivo },
          pull: { rungId: straddle, series: objetivo },
        }),
      );
      expect(res.statusCode, res.body).toBe(200);
      const [fila] = await sesionesDe(userId);
      expect(fila).toMatchObject({
        pushTarget: objetivo,
        pullTarget: objetivo,
      });
    },
  );

  it("etapa 3: el sábado sale del plan, de Hoy y del guardado", async () => {
    const { userId, token } = await createToro();
    await patchConquerMember(app, userId, { cutStage: 3 });
    const straddle = await conquerRungId(app, "palanca", "straddle");

    const plan = await fetchToday(app, token);
    const ver = await app.inject({
      method: "GET",
      url: "/api/members/conquer/today?day=sabado",
      headers: { authorization: `Bearer ${token}` },
    });
    const guardar = await putSessionRaw(
      app,
      token,
      saturdayBody({
        push: { rungId: straddle, series: 9 },
        pull: { rungId: straddle, series: 9 },
      }),
    );

    expect(plan.plan.map((d) => d.dayKey)).toEqual([
      "plancha",
      "front",
      "vertical",
      "dominadas",
    ]);
    expect(ver.statusCode).toBe(400);
    expect(ver.json<ConquerErrorBody>().code).toBe("CONQUER_DIA_INVALIDO");
    expect(guardar.statusCode).toBe(400);
    expect(guardar.json<ConquerErrorBody>().code).toBe("CONQUER_DIA_INVALIDO");
    expect((await postComboSubir(app, token, "push")).statusCode).toBe(409);
  });

  it("etapa 3: con los 4 días hechos la semana queda completa sin sábado", async () => {
    const { userId, token } = await createToro();
    await patchConquerMember(app, userId, { cutStage: 3 });

    for (const dayKey of ["plancha", "front", "vertical", "dominadas"]) {
      const res = await putSessionRaw(
        app,
        token,
        sessionBodyFromToday(await fetchToday(app, token, dayKey)),
      );
      expect(res.statusCode, res.body).toBe(200);
    }

    const vista = await fetchToday(app, token);
    expect(vista.weekComplete).toBe(true);
    expect(vista.nextDayKey).toBeNull();
  });

  it("etapa 4: la apertura baja a 3 aun en la semana 3 del bloque", async () => {
    const { userId, token } = await createToro({ activadoHaceDias: 15 });
    await patchConquerMember(app, userId, { cutStage: 4 });

    const vista = await fetchToday(app, token);

    expect(vista.opening).toMatchObject({ target: 3, value: 3 });
    expect(vista.saturday).toBeNull();
  });

  it("etapa 5: sin apertura, el guardado con opening es 409 y subir es 409 CONQUER_SIN_COMBOS", async () => {
    const { userId, token } = await createToro();
    await patchConquerMember(app, userId, { cutStage: 5 });
    const straddle = await conquerRungId(app, "palanca", "straddle");

    const vista = await fetchToday(app, token);
    const guardar = await putApertura(token, straddle, 3);
    const subir = await postComboSubir(app, token, "plancha");

    expect(vista.opening).toBeNull();
    expect(guardar.statusCode).toBe(409);
    expect(guardar.json<ConquerErrorBody>().code).toBe("CONQUER_SIN_COMBOS");
    expect(subir.statusCode).toBe(409);
    expect(subir.json<ConquerErrorBody>().code).toBe("CONQUER_SIN_COMBOS");
    expect(await sesionesDe(userId)).toEqual([]);
    // Sin apertura el alumno guarda su día igual (opening es opcional).
    const sin = await putSessionRaw(app, token, sessionBodyFromToday(vista));
    expect(sin.statusCode, sin.body).toBe(200);
  });
});

describe("aislamiento y permisos", () => {
  it("sin token: 401 en la ruta de Subir", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/members/conquer/combos/plancha/subir",
    });

    expect(res.statusCode).toBe(401);
  });

  it("gimnasio 2 sin el módulo: 404; con el módulo y sin Conquer: 409 CONQUER_NO_ACTIVO", async () => {
    const [socio2] = gym2.socios;

    const sinModulo = await postComboSubir(app, socio2.token, "plancha");
    expect(sinModulo.statusCode, sinModulo.body).toBe(404);

    await setModuleFlag(app, TENANT_DOS, "templo-training", true);
    const sinConquer = await postComboSubir(app, socio2.token, "plancha");
    expect(sinConquer.statusCode, sinConquer.body).toBe(409);
    expect(sinConquer.json<ConquerErrorBody>().code).toBe("CONQUER_NO_ACTIVO");
  });

  it("subir el combo de un alumno no toca el estado de otro Toro", async () => {
    const a = await createToro();
    const b = await createToro();
    await sembrarApertura(a.userId, a.hoy, [1, 2]);
    await sembrarApertura(b.userId, b.hoy, [1, 2]);

    const res = await postComboSubir(app, a.token, "plancha");

    expect(res.statusCode, res.body).toBe(200);
    expect(await readComboState(app, b.userId)).toBeNull();
    expect(
      (await fetchToday(app, b.token, "plancha")).opening?.subir.ready,
    ).toBe(true);
  });

  it("un alumno sin Conquer activo recibe 409 CONQUER_NO_ACTIVO", async () => {
    const socio = await createTestMember(app);

    const res = await postComboSubir(app, socio.token, "plancha");

    expect(res.statusCode, res.body).toBe(409);
    expect(res.json<ConquerErrorBody>().code).toBe("CONQUER_NO_ACTIVO");
  });
});

/** Borra las sesiones del alumno (para rearmar el historial dentro de un mismo test). */
async function cleanSesiones(userId: number): Promise<void> {
  await app.db
    .delete(schema.conquerSessions)
    .where(
      and(
        tenantWhere(schema.conquerSessions, TEMPLO_CTX),
        eq(schema.conquerSessions.userId, userId),
      ),
    );
}
