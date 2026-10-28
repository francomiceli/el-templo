/**
 * Fase 201 Plan 10 (S12-3, §3.2, D-16): niveles con y sin combos.
 *
 *   - Ternero y Novillo no ven combos ni sábado, no los pueden guardar ni subir.
 *   - Toro abre el día con el combo de apertura (objetivo 3) y tiene el sábado
 *     de combos al final del plan: push y pull con objetivo 13 (3 máx + 10 drops).
 *   - "Semana completa" de Toro llega recién con el sábado hecho (D-16).
 *
 * Integración contra el MySQL de tests. Usuarios SIEMPRE con fábricas.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import path from "node:path";
import { SATURDAY_WARMUP } from "../../src/modules/conquer/combos";
import { cleanAllTestData, createTestApp } from "../helpers";
import { loadAnnex } from "./annex";
import {
  conquerRungId,
  createActiveConquerMember,
  fetchProgress,
  fetchToday,
  postComboSubir,
  putSessionRaw,
  readConquerSessions,
  saturdayBody,
  saveTodaySession,
  sessionBodyFromToday,
  type ConquerErrorBody,
} from "./_helpers";

let app: FastifyInstance;

const NIVELES_SIN_COMBOS = [
  { level: "ternero", daysCount: 2 },
  { level: "novillo", daysCount: 3 },
  { level: "novillo", daysCount: 4 },
] as const;

beforeAll(async () => {
  app = await createTestApp();
});

beforeEach(async () => {
  await cleanAllTestData(app);
});

afterAll(async () => {
  await cleanAllTestData(app);
  await app.close();
});

describe("S12-3 — Ternero y Novillo no ven combos ni sábado", () => {
  it.each(NIVELES_SIN_COMBOS)(
    "$level de $daysCount días: Hoy sin apertura, plan sin sábado y Progreso sin combos",
    async ({ level, daysCount }) => {
      const { token } = await createActiveConquerMember(app, {
        level,
        daysCount,
      });

      const hoy = await fetchToday(app, token);
      const progreso = await fetchProgress(app, token);

      expect(hoy.opening).toBeNull();
      expect(hoy.saturday).toBeNull();
      expect(hoy.plan.map((d) => d.dayKey)).not.toContain("sabado");
      expect(hoy.plan).toHaveLength(daysCount);
      expect(progreso.comboSubir).toEqual([]);
    },
  );

  it.each(NIVELES_SIN_COMBOS)(
    "$level de $daysCount días: GET /today?day=sabado es 400 y el sábado no se guarda",
    async ({ level, daysCount }) => {
      const { userId, token } = await createActiveConquerMember(app, {
        level,
        daysCount,
      });
      const rungId = await conquerRungId(app, "palanca", "straddle");

      const verSabado = await app.inject({
        method: "GET",
        url: "/api/members/conquer/today?day=sabado",
        headers: { authorization: `Bearer ${token}` },
      });
      const guardarSabado = await putSessionRaw(
        app,
        token,
        saturdayBody({
          push: { rungId, series: 13 },
          pull: { rungId, series: 13 },
        }),
      );

      expect(verSabado.statusCode).toBe(400);
      expect(verSabado.json<ConquerErrorBody>().code).toBe(
        "CONQUER_DIA_INVALIDO",
      );
      expect(guardarSabado.statusCode).toBe(400);
      expect(guardarSabado.json<ConquerErrorBody>().code).toBe(
        "CONQUER_DIA_INVALIDO",
      );
      expect(await readConquerSessions(app, userId)).toEqual([]);
    },
  );

  it.each(NIVELES_SIN_COMBOS)(
    "$level de $daysCount días: PUT /sessions con opening es 409 CONQUER_SIN_COMBOS y no guarda nada",
    async ({ level, daysCount }) => {
      const { userId, token } = await createActiveConquerMember(app, {
        level,
        daysCount,
      });
      const rungId = await conquerRungId(app, "palanca", "straddle");
      const hoy = await fetchToday(app, token);

      const res = await putSessionRaw(app, token, {
        ...sessionBodyFromToday(hoy),
        opening: { rungId, series: 3 },
      });

      expect(res.statusCode, res.body).toBe(409);
      expect(res.json<ConquerErrorBody>().code).toBe("CONQUER_SIN_COMBOS");
      expect(await readConquerSessions(app, userId)).toEqual([]);
    },
  );

  it.each(NIVELES_SIN_COMBOS)(
    "$level de $daysCount días: POST /combos/plancha/subir es 409 CONQUER_SIN_COMBOS",
    async ({ level, daysCount }) => {
      const { token } = await createActiveConquerMember(app, {
        level,
        daysCount,
      });

      const res = await postComboSubir(app, token, "plancha");

      expect(res.statusCode, res.body).toBe(409);
      expect(res.json<ConquerErrorBody>().code).toBe("CONQUER_SIN_COMBOS");
    },
  );
});

describe("S12-3 — Toro abre cada día con el combo y tiene sábado", () => {
  it("Hoy trae el combo de apertura de Plancha con objetivo 3, el contador precargado y Palanca como escalera", async () => {
    const { token } = await createActiveConquerMember(app, {
      level: "toro",
      daysCount: 4,
    });

    const hoy = await fetchToday(app, token);

    expect(hoy.dayKey).toBe("plancha");
    expect(hoy.saturday).toBeNull();
    expect(hoy.opening).toMatchObject({
      comboKey: "plancha",
      label: "Plancha",
      press: "Press de plancha",
      push: "Push-up en plancha",
      hold: "Hold de plancha",
      rungName: "straddle",
      target: 3,
      value: 3,
      maxSeries: null,
      drops: null,
      subir: { ready: false, toRungName: null },
    });
    expect(hoy.opening?.rungs.map((r) => r.code)).toEqual([
      "full",
      "half_lay",
      "straddle",
      "super_adv_tuck",
      "adv_tuck",
      "tuck",
      "lean",
    ]);
    expect(hoy.opening?.rungId).toBe(
      hoy.opening?.rungs.find((r) => r.code === "straddle")?.id,
    );
  });

  it.each([
    [
      "front",
      "Press a front lever",
      "Pull-up en front lever",
      "Hold de front lever",
    ],
    ["vertical", "90° press", "HSPU", "Hold de plancha"],
    ["dominadas", "Press a front lever", "Muscle-up", "Hold de front lever"],
  ] as const)(
    "el día %s trae su combo fijo de §3.4",
    async (dayKey, press, push, hold) => {
      const { token } = await createActiveConquerMember(app, {
        level: "toro",
        daysCount: 4,
      });

      const hoy = await fetchToday(app, token, dayKey);

      expect(hoy.opening).toMatchObject({
        comboKey: dayKey,
        press,
        push,
        hold,
      });
    },
  );

  it("el plan trae el sábado al final y GET ?day=sabado trae la entrada en calor y los combos push y pull con objetivo 13", async () => {
    const { token } = await createActiveConquerMember(app, {
      level: "toro",
      daysCount: 4,
    });

    const plan = await fetchToday(app, token);
    const sabado = await fetchToday(app, token, "sabado");

    expect(plan.plan.map((d) => d.dayKey)).toEqual([
      "plancha",
      "front",
      "vertical",
      "dominadas",
      "sabado",
    ]);
    expect(plan.plan[4]).toEqual({
      dayKey: "sabado",
      label: "Sábado",
      done: false,
    });
    expect(sabado.dayKey).toBe("sabado");
    expect(sabado.label).toBe("Sábado");
    expect(sabado.exercises).toEqual([]);
    expect(sabado.finisher).toBe("");
    expect(sabado.opening).toBeNull();
    expect(sabado.saturday?.warmup).toBe(SATURDAY_WARMUP);
    // 201-26 DA-14: la entrada en calor es `sabado_calor` del anexo §9, byte a byte.
    expect(sabado.saturday?.warmup).toBe(
      loadAnnex(path.resolve(__dirname, "fixtures/conquer-catalogo.md")).texts
        .sabado_calor,
    );
    expect(sabado.saturday?.push).toMatchObject({
      comboKey: "push",
      press: "Press de plancha",
      push: "HSPU",
      hold: "Hold de plancha",
      target: 13,
      value: 13,
      maxSeries: 3,
      drops: 10,
    });
    expect(sabado.saturday?.pull).toMatchObject({
      comboKey: "pull",
      press: "Press a front lever",
      push: "Muscle-up",
      hold: "Hold de front lever",
      target: 13,
      value: 13,
      maxSeries: 3,
      drops: 10,
    });
  });

  it("con los 4 días hechos le toca el sábado y la semana NO está completa hasta guardarlo (D-16)", async () => {
    const { token } = await createActiveConquerMember(app, {
      level: "toro",
      daysCount: 4,
    });

    for (const dayKey of ["plancha", "front", "vertical", "dominadas"]) {
      await saveTodaySession(app, token, { day: dayKey });
    }
    const conLosCuatro = await fetchToday(app, token);

    expect(conLosCuatro.nextDayKey).toBe("sabado");
    expect(conLosCuatro.dayKey).toBe("sabado");
    expect(conLosCuatro.weekComplete).toBe(false);
    expect(conLosCuatro.plan.map((d) => d.done)).toEqual([
      true,
      true,
      true,
      true,
      false,
    ]);

    const rungId = await conquerRungId(app, "palanca", "straddle");
    const res = await putSessionRaw(
      app,
      token,
      saturdayBody({
        push: { rungId, series: 13 },
        pull: { rungId, series: 13 },
      }),
    );
    expect(res.statusCode, res.body).toBe(200);

    const completa = await fetchToday(app, token);
    expect(completa.weekComplete).toBe(true);
    expect(completa.nextDayKey).toBeNull();
    expect(completa.plan.every((d) => d.done)).toBe(true);
  });
});
