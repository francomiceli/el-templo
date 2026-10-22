/**
 * Fase 201 Plan 08 (S12-4, §4.3, A5, T-201-27): calibración de la semana 1.
 *
 *   - PUT  /api/members/conquer/sessions        (devuelve `calibration`)
 *   - POST /api/members/conquer/calibration/:exerciseId
 *   - GET  /api/members/conquer/progress        (`calibrations` pendientes)
 *
 * Integración contra el MySQL de tests. "Hoy" solo por `PUT /sessions`; el
 * historial de días pasados con `insertConquerSession`.
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
  createActiveConquerMember,
  fetchProgress,
  insertConquerSession,
  memberToday,
  postCalibration,
  readConquerSteps,
  saveTodaySession,
  weeksAgo,
  type ConquerErrorBody,
  type ProgressBody,
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

const NOMBRES: Record<string, string> = {
  planche_press: "Planche press",
  planche_hold: "Planche hold",
};

describe("PUT /api/members/conquer/sessions — propuesta de calibración (S12-4)", () => {
  // reps: <3 bajar, 3-5 quedarse, >=6 subir. segundos: <4 bajar, 4-8 quedarse, >=9 subir.
  // Escalera palanca (position): full 0, half lay 1, straddle 2, super adv tuck 3, adv tuck 4, tuck 5, lean 6.
  it.each([
    {
      code: "planche_press",
      e1: 2,
      proposal: "bajar",
      from: "tuck",
      to: "lean",
    },
    {
      code: "planche_press",
      e1: 3,
      proposal: "quedarse",
      from: "tuck",
      to: "tuck",
    },
    {
      code: "planche_press",
      e1: 5,
      proposal: "quedarse",
      from: "tuck",
      to: "tuck",
    },
    {
      code: "planche_press",
      e1: 6,
      proposal: "subir",
      from: "tuck",
      to: "adv tuck",
    },
    {
      code: "planche_hold",
      e1: 3,
      proposal: "bajar",
      from: "full",
      to: "half lay",
    },
    {
      code: "planche_hold",
      e1: 4,
      proposal: "quedarse",
      from: "full",
      to: "full",
    },
    {
      code: "planche_hold",
      e1: 8,
      proposal: "quedarse",
      from: "full",
      to: "full",
    },
    { code: "planche_hold", e1: 9, proposal: "subir", from: "full", to: null },
  ])(
    "$code con E1 = $e1 propone $proposal ($from -> $to)",
    async ({ code, e1, proposal, from, to }) => {
      const { token } = await createActiveConquerMember(app, {
        level: "toro",
        daysCount: 4,
      });
      const ids = await conquerExerciseIds(app);

      const saved = await saveTodaySession(app, token, {
        edits: { [code]: { e1 } },
      });

      expect(
        saved.calibration.find((p) => p.exerciseId === ids.get(code)),
      ).toEqual({
        exerciseId: ids.get(code),
        exerciseName: NOMBRES[code],
        proposal,
        fromRungName: from,
        toRungName: to,
      });
    },
  );

  it("la respuesta trae solo los ejercicios del día; Progreso lista las calibraciones pendientes de todo el plan", async () => {
    const { userId, token } = await createActiveConquerMember(app, {
      level: "toro",
      daysCount: 4,
    });
    const ids = await conquerExerciseIds(app);
    const hoy = await memberToday(app, userId);
    // Front lever hold ya tiene su primera marca (3 s: bajar) en otro día.
    await insertConquerSession(app, {
      userId,
      date: weeksAgo(hoy, 1),
      dayKey: "front",
      steps: [{ exerciseCode: "front_hold", step: "e1", value: 3 }],
    });

    const saved = await saveTodaySession(app, token, { day: "plancha" });

    expect(saved.calibration.map((p) => p.exerciseId)).toEqual([
      ids.get("planche_hold"),
      ids.get("planche_press"),
      ids.get("lsit_plancha"),
    ]);
    // Los 3 del día son "quedarse" (precarga 4 s / 3 / 3): ya no quedan pendientes.
    const progreso = await fetchProgress(app, token);
    expect(progreso.calibrations).toEqual([
      {
        exerciseId: ids.get("front_hold"),
        exerciseName: "Front lever hold",
        proposal: "bajar",
        fromRungName: "full",
        toRungName: "half lay",
      },
    ]);
  });

  it("desde la 2ª sesión del E1 no hay propuesta y el E1 pasa a resuelta (corre §4.4)", async () => {
    const { userId, token } = await createActiveConquerMember(app, {
      level: "toro",
      daysCount: 4,
    });
    const ids = await conquerExerciseIds(app);
    const hoy = await memberToday(app, userId);
    await insertConquerSession(app, {
      userId,
      date: weeksAgo(hoy, 1),
      dayKey: "plancha",
      steps: [{ exerciseCode: "planche_press", step: "e1", value: 6 }],
    });
    // Con una sola marca (la de la semana pasada) Progreso ya propone subir.
    const antes = await fetchProgress(app, token);
    expect(
      antes.calibrations.find((p) => p.exerciseId === ids.get("planche_press")),
    ).toMatchObject({ proposal: "subir" });

    const saved = await saveTodaySession(app, token, { day: "plancha" });

    expect(
      saved.calibration.find((p) => p.exerciseId === ids.get("planche_press")),
    ).toBeUndefined();
    expect(
      (await readConquerSteps(app, userId)).get("planche_press:e1")
        ?.calibration,
    ).toBe("resuelta");
  });
});

describe("POST /api/members/conquer/calibration/:exerciseId", () => {
  it("aceptar subir mueve el ejercicio ENTERO un peldaño (A5): e1 y e2 a adv tuck, e3 y hold a tuck", async () => {
    const { userId, token } = await createActiveConquerMember(app, {
      level: "toro",
      daysCount: 4,
    });
    const ids = await conquerExerciseIds(app);
    const pressId = ids.get("planche_press") ?? 0;
    await saveTodaySession(app, token, { edits: { planche_press: { e1: 6 } } });

    const res = await postCalibration(app, token, pressId, { accept: true });

    expect(res.statusCode, res.body).toBe(200);
    const hoy = await memberToday(app, userId);
    const steps = await readConquerSteps(app, userId);
    for (const [key, rungCode] of [
      ["planche_press:e1", "adv_tuck"],
      ["planche_press:e2", "adv_tuck"],
      ["planche_press:e3", "tuck"],
      ["planche_press:hold", "tuck"],
    ] as const) {
      expect(steps.get(key), key).toMatchObject({ rungCode, sinceDate: hoy });
    }
    // El E1 vuelve a calibrar con el peldaño nuevo (§4.3).
    expect(steps.get("planche_press:e1")?.calibration).toBe("pendiente");
    // La respuesta es el Progreso nuevo: la marca vieja ya no cuenta para el peldaño nuevo.
    const body = res.json<ProgressBody>();
    expect(
      body.calibrations.find((p) => p.exerciseId === pressId),
    ).toBeUndefined();
    // Un segundo POST ya no tiene nada que resolver.
    const otra = await postCalibration(app, token, pressId, { accept: true });
    expect(otra.statusCode, otra.body).toBe(409);
    expect(otra.json<ConquerErrorBody>().code).toBe("CONQUER_SIN_CALIBRACION");
  });

  // 201-25 DA-3: el hold final se mueve dentro de SU escalera de hold.
  it("aceptar subir mueve el hold dentro de su escalera de hold (Toro HSPU: pike -> vertical en pared)", async () => {
    const { userId, token } = await createActiveConquerMember(app, {
      level: "toro",
      daysCount: 4,
    });
    const ids = await conquerExerciseIds(app);
    const hspuId = ids.get("hspu") ?? 0;
    await saveTodaySession(app, token, {
      day: "vertical",
      edits: { hspu: { e1: 6 } },
    });

    const res = await postCalibration(app, token, hspuId, { accept: true });

    expect(res.statusCode, res.body).toBe(200);
    const steps = await readConquerSteps(app, userId);
    expect(steps.get("hspu:hold")).toMatchObject({
      rungCode: "vertical_en_pared",
      ladderCode: "hspu_hold",
    });
    // E1-E3 siguen en la escalera de E: paralelas profundas -> libre.
    expect(steps.get("hspu:e1")).toMatchObject({
      rungCode: "libre",
      ladderCode: "hspu",
    });
    expect(steps.get("hspu:e3")).toMatchObject({
      rungCode: "pared",
      ladderCode: "hspu",
    });
  });

  // Los escalones que no se pueden mover (extremo de la escalera) quedan donde estaban.
  it.each([
    {
      caso: "Planche press (E1 = 2): e3 y hold ya están en lean",
      code: "planche_press",
      e1: 2,
      esperado: {
        "planche_press:e1": ["lean", true],
        "planche_press:e2": ["lean", true],
        "planche_press:e3": ["lean", false],
        "planche_press:hold": ["lean", false],
      },
    },
    {
      caso: "Planche hold (E1 = 3 s): cada escalón baja un peldaño",
      code: "planche_hold",
      e1: 3,
      esperado: {
        "planche_hold:e1": ["half_lay", true],
        "planche_hold:e2": ["super_adv_tuck", true],
        "planche_hold:e3": ["tuck", true],
        "planche_hold:hold": ["lean", true],
      },
    },
  ])("aceptar bajar: $caso", async ({ code, e1, esperado }) => {
    const { userId, token } = await createActiveConquerMember(app, {
      level: "toro",
      daysCount: 4,
    });
    const ids = await conquerExerciseIds(app);
    await saveTodaySession(app, token, { edits: { [code]: { e1 } } });

    const res = await postCalibration(app, token, ids.get(code) ?? 0, {
      accept: true,
    });

    expect(res.statusCode, res.body).toBe(200);
    const hoy = await memberToday(app, userId);
    const steps = await readConquerSteps(app, userId);
    for (const [key, [rungCode, moved]] of Object.entries(esperado)) {
      expect(steps.get(key), key).toMatchObject({
        rungCode,
        sinceDate: moved ? hoy : null,
      });
    }
  });

  it("rechazar deja la progresión como está y cierra la calibración; un segundo POST es 409", async () => {
    const { userId, token } = await createActiveConquerMember(app, {
      level: "toro",
      daysCount: 4,
    });
    const ids = await conquerExerciseIds(app);
    const pressId = ids.get("planche_press") ?? 0;
    await saveTodaySession(app, token, { edits: { planche_press: { e1: 6 } } });

    const res = await postCalibration(app, token, pressId, { accept: false });

    expect(res.statusCode, res.body).toBe(200);
    const steps = await readConquerSteps(app, userId);
    expect(steps.get("planche_press:e1")).toMatchObject({
      rungCode: "tuck",
      sinceDate: null,
      calibration: "resuelta",
    });
    expect(steps.get("planche_press:e3")?.rungCode).toBe("lean");
    for (const accept of [false, true]) {
      const otra = await postCalibration(app, token, pressId, { accept });
      expect(otra.statusCode, otra.body).toBe(409);
      expect(otra.json<ConquerErrorBody>().code).toBe(
        "CONQUER_SIN_CALIBRACION",
      );
    }
  });

  it("quedarse no deja nada pendiente: el E1 queda resuelta y aceptar es 409", async () => {
    const { userId, token } = await createActiveConquerMember(app, {
      level: "toro",
      daysCount: 4,
    });
    const ids = await conquerExerciseIds(app);
    await saveTodaySession(app, token, { edits: { planche_press: { e1: 4 } } });

    const res = await postCalibration(
      app,
      token,
      ids.get("planche_press") ?? 0,
      {
        accept: true,
      },
    );

    expect(res.statusCode, res.body).toBe(409);
    expect(res.json<ConquerErrorBody>().code).toBe("CONQUER_SIN_CALIBRACION");
    const steps = await readConquerSteps(app, userId);
    expect(steps.get("planche_press:e1")).toMatchObject({
      rungCode: "tuck",
      calibration: "resuelta",
    });
  });

  it("en el tope de la escalera no se puede aceptar: 409 CONQUER_TOPE_ESCALERA y no se mueve nada", async () => {
    const { userId, token } = await createActiveConquerMember(app, {
      level: "toro",
      daysCount: 4,
    });
    const ids = await conquerExerciseIds(app);
    const saved = await saveTodaySession(app, token, {
      edits: { planche_hold: { e1: 12 } },
    });
    expect(
      saved.calibration.find((p) => p.exerciseId === ids.get("planche_hold")),
    ).toMatchObject({ proposal: "subir", toRungName: null });

    const res = await postCalibration(
      app,
      token,
      ids.get("planche_hold") ?? 0,
      {
        accept: true,
      },
    );

    expect(res.statusCode, res.body).toBe(409);
    expect(res.json<ConquerErrorBody>().code).toBe("CONQUER_TOPE_ESCALERA");
    const steps = await readConquerSteps(app, userId);
    expect(steps.get("planche_hold:e1")).toMatchObject({
      rungCode: "full",
      sinceDate: null,
      calibration: "pendiente",
    });
    expect(steps.get("planche_hold:e2")?.rungCode).toBe("straddle");
  });

  it("T-201-27: la calibración de otro alumno no se puede resolver (el POST de otro no la toca)", async () => {
    const dueno = await createActiveConquerMember(app, {
      level: "toro",
      daysCount: 4,
    });
    const intruso = await createActiveConquerMember(app, {
      level: "toro",
      daysCount: 4,
    });
    const ids = await conquerExerciseIds(app);
    const pressId = ids.get("planche_press") ?? 0;
    await saveTodaySession(app, dueno.token, {
      edits: { planche_press: { e1: 6 } },
    });

    const res = await postCalibration(app, intruso.token, pressId, {
      accept: true,
    });

    expect(res.statusCode, res.body).toBe(409);
    expect(res.json<ConquerErrorBody>().code).toBe("CONQUER_SIN_CALIBRACION");
    const steps = await readConquerSteps(app, dueno.userId);
    expect(steps.get("planche_press:e1")).toMatchObject({
      rungCode: "tuck",
      calibration: "pendiente",
    });
    expect(
      (await readConquerSteps(app, intruso.userId)).get("planche_press:e1")
        ?.rungCode,
    ).toBe("tuck");
  });

  it("ejercicio inexistente, fuera del plan o de otro gimnasio: 404", async () => {
    const ternero = await createActiveConquerMember(app, {
      level: "ternero",
      daysCount: 2,
    });
    const ids = await conquerExerciseIds(app);
    // Ternero de 2 días no tiene Planche press.
    const fueraDelPlan = await postCalibration(
      app,
      ternero.token,
      ids.get("planche_press") ?? 0,
      { accept: true },
    );
    const inexistente = await postCalibration(
      app,
      ternero.token,
      2_000_000_000,
      { accept: true },
    );

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
    const otroGimnasio = await postCalibration(
      app,
      socio2.token,
      ids.get("planche_press") ?? 0,
      { accept: true },
    );

    expect(fueraDelPlan.statusCode, fueraDelPlan.body).toBe(404);
    expect(inexistente.statusCode, inexistente.body).toBe(404);
    expect(otroGimnasio.statusCode, otroGimnasio.body).toBe(404);
  });

  it.each([
    { caso: "sin body", payload: undefined },
    { caso: "body vacío", payload: {} },
    { caso: "accept no booleano", payload: { accept: "si" } },
  ])("validación: $caso -> 400", async ({ payload }) => {
    const { token } = await createActiveConquerMember(app, {
      level: "toro",
      daysCount: 4,
    });
    const ids = await conquerExerciseIds(app);

    const res = await postCalibration(
      app,
      token,
      ids.get("planche_press") ?? 0,
      payload,
    );

    expect(res.statusCode, res.body).toBe(400);
  });

  it("id inválido es 400, sin token es 401 y un alumno sin Conquer activo es 409 CONQUER_NO_ACTIVO", async () => {
    const activo = await createActiveConquerMember(app, {
      level: "toro",
      daysCount: 4,
    });
    const sinConquer = await createTestMember(app);
    const ids = await conquerExerciseIds(app);
    const pressId = ids.get("planche_press") ?? 0;

    const idCero = await postCalibration(app, activo.token, 0, {
      accept: true,
    });
    const sinToken = await app.inject({
      method: "POST",
      url: `/api/members/conquer/calibration/${pressId}`,
      payload: { accept: true },
    });
    const bloqueado = await postCalibration(app, sinConquer.token, pressId, {
      accept: true,
    });

    expect(idCero.statusCode, idCero.body).toBe(400);
    expect(sinToken.statusCode).toBe(401);
    expect(bloqueado.statusCode, bloqueado.body).toBe(409);
    expect(bloqueado.json<ConquerErrorBody>().code).toBe("CONQUER_NO_ACTIVO");
  });
});
