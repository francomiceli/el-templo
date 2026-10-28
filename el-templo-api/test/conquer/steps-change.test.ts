/**
 * Fase 201 Plan 07 (§4.3, §4.5, A1, T-201-22, T-201-24): cambio de progresión
 * de un escalón.
 *
 *   - PUT /api/members/conquer/steps/:exerciseId/:step
 *
 * Integración contra el MySQL de tests. El catálogo lo siembra la migración
 * 0292: cuando un test desactiva un peldaño lo restaura en `afterEach`.
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
import { addDaysIso, mondayOfIso } from "../../src/modules/conquer/calendar";
import { tenantValues, tenantWhere } from "../../src/modules/shared/tenant";
import { cleanAllTestData, createTestApp } from "../helpers";
import {
  limpiarSegundoGimnasio,
  seedSecondTenant,
  TENANT_DOS,
  type SegundoGimnasio,
} from "../fixtures/second-tenant";
import { clearModuleFlags, setModuleFlag } from "../fixtures/module-flags";
import {
  CONQUER_SESSIONS_URL,
  conquerExerciseIds,
  conquerRungId,
  conquerStepUrl,
  createActiveConquerMember,
  insertConquerSession,
  memberToday,
  patchConquerStep,
  readConquerSteps,
  readSessionSteps,
  sessionBodyFromToday,
  TEMPLO_CTX,
  CONQUER_TODAY_URL,
  type TodayBody,
  type TodayStepBody,
} from "./_helpers";

interface ErrorBody {
  error: string;
  code?: string;
}

let app: FastifyInstance;
let gym2: SegundoGimnasio;
/** Peldaños desactivados por el test en curso: se restauran en `afterEach`. */
const desactivados: number[] = [];

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

async function putStep(
  token: string,
  exerciseId: number,
  step: string,
  payload: Record<string, unknown>,
) {
  return app.inject({
    method: "PUT",
    url: conquerStepUrl(exerciseId, step),
    headers: auth(token),
    payload,
  });
}

async function today(token: string, day?: string): Promise<TodayBody> {
  const res = await app.inject({
    method: "GET",
    url:
      day === undefined ? CONQUER_TODAY_URL : `${CONQUER_TODAY_URL}?day=${day}`,
    headers: auth(token),
  });
  expect(res.statusCode, res.body).toBe(200);
  return res.json<TodayBody>();
}

async function deactivateRung(rungId: number): Promise<void> {
  await app.db
    .update(schema.conquerRungs)
    .set({ isActive: false })
    .where(
      and(
        tenantWhere(schema.conquerRungs, TEMPLO_CTX),
        eq(schema.conquerRungs.id, rungId),
      ),
    );
  desactivados.push(rungId);
}

/** Pone un campo de TODOS los escalones del alumno (fixtures de estado previo). */
async function patchSteps(
  userId: number,
  set: Partial<{
    calibration: "pendiente" | "resuelta";
    sinceDate: string | null;
  }>,
): Promise<void> {
  const [member] = await app.db
    .select({ id: schema.conquerMembers.id })
    .from(schema.conquerMembers)
    .where(
      and(
        tenantWhere(schema.conquerMembers, TEMPLO_CTX),
        eq(schema.conquerMembers.userId, userId),
      ),
    );
  await app.db
    .update(schema.conquerSteps)
    .set(set)
    .where(
      and(
        tenantWhere(schema.conquerSteps, TEMPLO_CTX),
        eq(schema.conquerSteps.memberId, member.id),
      ),
    );
}

beforeAll(async () => {
  app = await createTestApp();
});

beforeEach(async () => {
  await cleanAllTestData(app);
  gym2 = await seedSecondTenant(app);
});

afterEach(async () => {
  for (const rungId of desactivados.splice(0)) {
    await app.db
      .update(schema.conquerRungs)
      .set({ isActive: true })
      .where(
        and(
          tenantWhere(schema.conquerRungs, TEMPLO_CTX),
          eq(schema.conquerRungs.id, rungId),
        ),
      );
  }
  await clearModuleFlags(app, TENANT_DOS);
});

afterAll(async () => {
  await cleanAllTestData(app);
  await limpiarSegundoGimnasio(app);
  await app.close();
});

describe("PUT /api/members/conquer/steps/:exerciseId/:step", () => {
  it("cambiar el peldaño reinicia el escalón: since_date = hoy y objetivo en el piso (§4.5)", async () => {
    const { userId, token } = await createActiveConquerMember(app, {
      level: "toro",
      daysCount: 4,
    });
    const hoy = await memberToday(app, userId);
    for (const k of [2, 1]) {
      await insertConquerSession(app, {
        userId,
        date: addDaysIso(mondayOfIso(hoy), -7 * k),
        dayKey: "plancha",
        steps: [{ exerciseCode: "planche_press", step: "e1", value: 5 + k }],
      });
    }
    const antes = await today(token);
    expect(
      antes.exercises
        .find((e) => e.code === "planche_press")
        ?.steps.find((s) => s.step === "e1")?.target,
    ).toBe(7);
    const ids = await conquerExerciseIds(app);

    const res = await putStep(token, ids.get("planche_press") ?? 0, "e1", {
      rungId: await conquerRungId(app, "planche_press", "adv_tuck"),
      mode: "completa",
    });

    expect(res.statusCode, res.body).toBe(200);
    const step = res.json<TodayStepBody>();
    expect(step).toMatchObject({
      step: "e1",
      rungName: "adv tuck",
      mode: "completa",
      target: 3,
      value: 3,
      estado: "sin_datos",
      brazosRectos: true,
      unilateral: false,
    });
    const fila = (await readConquerSteps(app, userId)).get("planche_press:e1");
    expect(fila?.rungCode).toBe("adv_tuck");
    expect(fila?.sinceDate).toBe(hoy);
    // Hoy también refleja el reinicio.
    const despues = await today(token);
    expect(
      despues.exercises
        .find((e) => e.code === "planche_press")
        ?.steps.find((s) => s.step === "e1")?.target,
    ).toBe(3);
  });

  it("cambiar el peldaño del E1 vuelve a calibrar; el de E2 no toca la calibración (§4.3)", async () => {
    const { userId, token } = await createActiveConquerMember(app, {
      level: "toro",
      daysCount: 4,
    });
    await patchSteps(userId, { calibration: "resuelta" });
    const ids = await conquerExerciseIds(app);
    const exerciseId = ids.get("planche_press") ?? 0;
    const lean = await conquerRungId(app, "planche_press", "lean");

    const e2 = await putStep(token, exerciseId, "e2", {
      rungId: lean,
      mode: "negativa",
    });
    expect(e2.statusCode, e2.body).toBe(200);
    expect(
      (await readConquerSteps(app, userId)).get("planche_press:e2")
        ?.calibration,
    ).toBe("resuelta");

    const e1 = await putStep(token, exerciseId, "e1", {
      rungId: lean,
      mode: "completa",
    });
    expect(e1.statusCode, e1.body).toBe(200);
    expect(
      (await readConquerSteps(app, userId)).get("planche_press:e1")
        ?.calibration,
    ).toBe("pendiente");
  });

  it("cambiar solo el modo no reinicia since_date ni la calibración", async () => {
    const { userId, token } = await createActiveConquerMember(app, {
      level: "toro",
      daysCount: 4,
    });
    const hoy = await memberToday(app, userId);
    const vieja = addDaysIso(hoy, -10);
    await patchSteps(userId, { calibration: "resuelta", sinceDate: vieja });
    const ids = await conquerExerciseIds(app);
    const actual = (await readConquerSteps(app, userId)).get(
      "planche_press:e2",
    );

    const res = await putStep(token, ids.get("planche_press") ?? 0, "e2", {
      rungId: actual?.rungId ?? 0,
      mode: "completa",
    });

    expect(res.statusCode, res.body).toBe(200);
    expect(res.json<TodayStepBody>().mode).toBe("completa");
    const fila = (await readConquerSteps(app, userId)).get("planche_press:e2");
    expect(fila?.mode).toBe("completa");
    expect(fila?.sinceDate).toBe(vieja);
    expect(fila?.calibration).toBe("resuelta");
    expect(fila?.rungId).toBe(actual?.rungId);
  });

  it("un peldaño inactivo se rechaza, pero se tolera si es el que el escalón ya tiene (solo cambia el modo)", async () => {
    const { userId, token } = await createActiveConquerMember(app, {
      level: "toro",
      daysCount: 4,
    });
    const ids = await conquerExerciseIds(app);
    const exerciseId = ids.get("planche_press") ?? 0;
    // tuck es el peldaño actual de E1 y E2 de Planche press. straddle no es el
    // actual de ningún escalón.
    const straddle = await conquerRungId(app, "planche_press", "straddle");
    const tuck = await conquerRungId(app, "planche_press", "tuck");
    await deactivateRung(straddle);
    await deactivateRung(tuck);

    const aInactivo = await putStep(token, exerciseId, "e1", {
      rungId: straddle,
      mode: "completa",
    });
    const mismoInactivo = await putStep(token, exerciseId, "e1", {
      rungId: tuck,
      mode: "negativa",
    });

    expect(aInactivo.statusCode, aInactivo.body).toBe(400);
    expect(aInactivo.json<ErrorBody>().code).toBe("CONQUER_PELDANO_INVALIDO");
    expect(mismoInactivo.statusCode, mismoInactivo.body).toBe(200);
    const fila = (await readConquerSteps(app, userId)).get("planche_press:e1");
    expect(fila?.rungCode).toBe("tuck");
    expect(fila?.mode).toBe("negativa");
    // Hoy sigue mostrando el peldaño actual aunque esté inactivo.
    const vista = await today(token);
    const press = vista.exercises.find((e) => e.code === "planche_press");
    expect(press?.rungs.map((r) => r.code)).toContain("tuck");
    expect(press?.rungs.map((r) => r.code)).not.toContain("straddle");
  });

  it("un peldaño de otra escalera o inexistente: 400 CONQUER_PELDANO_INVALIDO", async () => {
    const { userId, token } = await createActiveConquerMember(app, {
      level: "toro",
      daysCount: 4,
    });
    const ids = await conquerExerciseIds(app);
    const exerciseId = ids.get("planche_press") ?? 0;
    const antes = (await readConquerSteps(app, userId)).get("planche_press:e1");
    const ajeno = await conquerRungId(app, "hspu", "pared");

    // Un id de otra escalera y un id que no existe (dentro del rango de int).
    for (const rungId of [ajeno, 2_000_000_000]) {
      const res = await putStep(token, exerciseId, "e1", {
        rungId,
        mode: "completa",
      });
      expect(res.statusCode, res.body).toBe(400);
      expect(res.json<ErrorBody>().code).toBe("CONQUER_PELDANO_INVALIDO");
    }
    const despues = (await readConquerSteps(app, userId)).get(
      "planche_press:e1",
    );
    expect(despues).toEqual(antes);
  });

  it("el hold final solo admite el modo hold", async () => {
    const { userId, token } = await createActiveConquerMember(app, {
      level: "toro",
      daysCount: 4,
    });
    const ids = await conquerExerciseIds(app);
    const exerciseId = ids.get("planche_press") ?? 0;
    const actual = (await readConquerSteps(app, userId)).get(
      "planche_press:hold",
    );

    const malModo = await putStep(token, exerciseId, "hold", {
      rungId: actual?.rungId ?? 0,
      mode: "completa",
    });
    const bien = await putStep(token, exerciseId, "hold", {
      rungId: await conquerRungId(app, "planche_press", "adv_tuck"),
      mode: "hold",
    });

    expect(malModo.statusCode, malModo.body).toBe(400);
    expect(malModo.json<ErrorBody>().code).toBe("CONQUER_MODO_INVALIDO");
    expect(bien.statusCode, bien.body).toBe(200);
    expect(bien.json<TodayStepBody>()).toMatchObject({
      step: "hold",
      mode: "hold",
      target: null,
      estado: null,
      value: 8,
    });
  });

  // 201-26 DA-10 / §1 del anexo: los isométricos solo hold, los dinámicos completa o negativa.
  it.each<[string, string, string]>([
    ["planche_hold", "e1", "completa"],
    ["planche_hold", "e2", "negativa"],
    ["front_hold", "e3", "completa"],
    ["hspu", "e1", "hold"],
    ["hspu", "e3", "hold"],
    ["planche_press", "hold", "negativa"],
  ])(
    "%s %s con modo %s no corresponde: 400 CONQUER_MODO_INVALIDO y el escalón no cambia",
    async (code, step, mode) => {
      const { userId, token } = await createActiveConquerMember(app, {
        level: "toro",
        daysCount: 4,
      });
      const ids = await conquerExerciseIds(app);
      const antes = (await readConquerSteps(app, userId)).get(
        `${code}:${step}`,
      );

      const res = await putStep(token, ids.get(code) ?? 0, step, {
        rungId: antes?.rungId ?? 0,
        mode,
      });

      expect(res.statusCode, res.body).toBe(400);
      expect(res.json<ErrorBody>().code).toBe("CONQUER_MODO_INVALIDO");
      const despues = (await readConquerSteps(app, userId)).get(
        `${code}:${step}`,
      );
      expect(despues).toEqual(antes);
    },
  );

  it("un dinámico admite completa y negativa: HSPU E1 pasa a negativa y vuelve a completa (200)", async () => {
    const { userId, token } = await createActiveConquerMember(app, {
      level: "toro",
      daysCount: 4,
    });
    const ids = await conquerExerciseIds(app);
    const actual = (await readConquerSteps(app, userId)).get("hspu:e1");

    const aNegativa = await putStep(token, ids.get("hspu") ?? 0, "e1", {
      rungId: actual?.rungId ?? 0,
      mode: "negativa",
    });
    const aCompleta = await putStep(token, ids.get("hspu") ?? 0, "e1", {
      rungId: actual?.rungId ?? 0,
      mode: "completa",
    });

    expect(aNegativa.statusCode, aNegativa.body).toBe(200);
    expect(aNegativa.json<TodayStepBody>().mode).toBe("negativa");
    expect(aCompleta.statusCode, aCompleta.body).toBe(200);
    expect((await readConquerSteps(app, userId)).get("hspu:e1")?.mode).toBe(
      "completa",
    );
  });

  // DA-10: un escalón con un modo viejo fuera de la regla (dato de la base local)
  // se tolera mientras el pedido no cambie el modo; Hoy lo muestra igual.
  it("un escalón con modo viejo inválido: cambiar solo el peldaño con el mismo modo es 200, y pedir otro modo fuera de la regla es 400", async () => {
    const { userId, token } = await createActiveConquerMember(app, {
      level: "toro",
      daysCount: 4,
    });
    const ids = await conquerExerciseIds(app);
    const exerciseId = ids.get("planche_hold") ?? 0;
    await patchConquerStep(app, userId, "planche_hold", "e1", {
      mode: "completa",
    });
    const vista = await today(token, "plancha");
    const hold = vista.exercises.find((e) => e.code === "planche_hold");
    expect(hold?.steps[0].modes).toEqual(["hold", "completa"]);
    const straddle = await conquerRungId(app, "planche_hold", "straddle");

    const mismoModo = await putStep(token, exerciseId, "e1", {
      rungId: straddle,
      mode: "completa",
    });
    const otroInvalido = await putStep(token, exerciseId, "e1", {
      rungId: straddle,
      mode: "negativa",
    });
    const alHold = await putStep(token, exerciseId, "e1", {
      rungId: straddle,
      mode: "hold",
    });

    expect(mismoModo.statusCode, mismoModo.body).toBe(200);
    expect(mismoModo.json<TodayStepBody>().mode).toBe("completa");
    expect(otroInvalido.statusCode, otroInvalido.body).toBe(400);
    expect(otroInvalido.json<ErrorBody>().code).toBe("CONQUER_MODO_INVALIDO");
    expect(alHold.statusCode, alHold.body).toBe(200);
    expect(
      (await readConquerSteps(app, userId)).get("planche_hold:e1")?.mode,
    ).toBe("hold");
  });

  // 201-25 DA-3 / T-201-93: el hold final elige en SU escalera, E1-E3 en la del ejercicio.
  it("el hold de HSPU se cambia a un peldaño de hspu_hold (§2 del anexo): 200 y queda en su escalera", async () => {
    const { userId, token } = await createActiveConquerMember(app, {
      level: "toro",
      daysCount: 4,
    });
    const ids = await conquerExerciseIds(app);

    const res = await putStep(token, ids.get("hspu") ?? 0, "hold", {
      rungId: await conquerRungId(app, "hspu_hold", "vertical_en_pared"),
      mode: "hold",
    });

    expect(res.statusCode, res.body).toBe(200);
    expect(res.json<TodayStepBody>()).toMatchObject({
      step: "hold",
      rungName: "vertical en pared",
      mode: "hold",
    });
    expect(
      (await readConquerSteps(app, userId)).get("hspu:hold"),
    ).toMatchObject({ rungCode: "vertical_en_pared", ladderCode: "hspu_hold" });
  });

  it("el hold de HSPU con un peldaño de la escalera de E1-E3 (pike_elevado): 400 CONQUER_PELDANO_INVALIDO", async () => {
    const { userId, token } = await createActiveConquerMember(app, {
      level: "toro",
      daysCount: 4,
    });
    const ids = await conquerExerciseIds(app);
    const antes = (await readConquerSteps(app, userId)).get("hspu:hold");

    const res = await putStep(token, ids.get("hspu") ?? 0, "hold", {
      rungId: await conquerRungId(app, "hspu", "pike_elevado"),
      mode: "hold",
    });

    expect(res.statusCode, res.body).toBe(400);
    expect(res.json<ErrorBody>().code).toBe("CONQUER_PELDANO_INVALIDO");
    expect((await readConquerSteps(app, userId)).get("hspu:hold")).toEqual(
      antes,
    );
  });

  it("el E1 de HSPU con un peldaño de hspu_hold (vertical_libre): 400 CONQUER_PELDANO_INVALIDO", async () => {
    const { token } = await createActiveConquerMember(app, {
      level: "toro",
      daysCount: 4,
    });
    const ids = await conquerExerciseIds(app);

    const res = await putStep(token, ids.get("hspu") ?? 0, "e1", {
      rungId: await conquerRungId(app, "hspu_hold", "vertical_libre"),
      mode: "completa",
    });

    expect(res.statusCode, res.body).toBe(400);
    expect(res.json<ErrorBody>().code).toBe("CONQUER_PELDANO_INVALIDO");
  });

  it("Planche press con un peldaño de palanca (la escalera de los combos): 400 CONQUER_PELDANO_INVALIDO", async () => {
    const { userId, token } = await createActiveConquerMember(app, {
      level: "toro",
      daysCount: 4,
    });
    const ids = await conquerExerciseIds(app);
    const antes = (await readConquerSteps(app, userId)).get("planche_press:e1");

    const res = await putStep(token, ids.get("planche_press") ?? 0, "e1", {
      rungId: await conquerRungId(app, "palanca", "adv_tuck"),
      mode: "completa",
    });

    expect(res.statusCode, res.body).toBe(400);
    expect(res.json<ErrorBody>().code).toBe("CONQUER_PELDANO_INVALIDO");
    expect(
      (await readConquerSteps(app, userId)).get("planche_press:e1"),
    ).toEqual(antes);
  });

  it("un ejercicio que el alumno no tiene en su plan: 404", async () => {
    const { token } = await createActiveConquerMember(app, {
      level: "novillo",
      daysCount: 3,
    });
    const ids = await conquerExerciseIds(app);
    // front_raises solo está en la plantilla de 4 días.
    const raises = ids.get("front_raises") ?? 0;

    const delPlan4 = await putStep(token, raises, "e1", {
      rungId: 1,
      mode: "completa",
    });
    const inexistente = await putStep(token, 2_000_000_000, "e1", {
      rungId: 1,
      mode: "completa",
    });

    expect(delPlan4.statusCode, delPlan4.body).toBe(404);
    expect(inexistente.statusCode, inexistente.body).toBe(404);
  });

  it.each<[string, string, Record<string, unknown>]>([
    ["escalón que no existe", "e4", { rungId: 1, mode: "completa" }],
    ["modo que no existe", "e1", { rungId: 1, mode: "explosiva" }],
    ["sin peldaño", "e1", { mode: "completa" }],
    ["sin modo", "e1", { rungId: 1 }],
    ["peldaño 0", "e1", { rungId: 0, mode: "completa" }],
  ])("validación (%s): 400", async (_caso, step, payload) => {
    const { token } = await createActiveConquerMember(app, {
      level: "toro",
      daysCount: 4,
    });
    const ids = await conquerExerciseIds(app);

    const res = await putStep(
      token,
      ids.get("planche_press") ?? 0,
      step,
      payload,
    );

    expect(res.statusCode, res.body).toBe(400);
  });

  it("gimnasio 2: un alumno activo de otro gimnasio no puede tocar el escalón de El Templo (404)", async () => {
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
    const ids = await conquerExerciseIds(app);

    const res = await putStep(
      socio2.token,
      ids.get("planche_press") ?? 0,
      "e1",
      {
        rungId: await conquerRungId(app, "planche_press", "lean"),
        mode: "completa",
      },
    );

    expect(res.statusCode, res.body).toBe(404);
  });

  it("A1: tras cambiar el peldaño hoy, la marca de hoy se guarda con el peldaño nuevo y prev_target del piso", async () => {
    const { userId, token } = await createActiveConquerMember(app, {
      level: "toro",
      daysCount: 4,
    });
    const hoy = await memberToday(app, userId);
    for (const [k, value] of [
      [2, 6],
      [1, 7],
    ] as const) {
      await insertConquerSession(app, {
        userId,
        date: addDaysIso(mondayOfIso(hoy), -7 * k),
        dayKey: "plancha",
        steps: [{ exerciseCode: "planche_press", step: "e1", value }],
      });
    }
    const ids = await conquerExerciseIds(app);
    const cambio = await putStep(token, ids.get("planche_press") ?? 0, "e1", {
      rungId: await conquerRungId(app, "planche_press", "adv_tuck"),
      mode: "completa",
    });
    expect(cambio.statusCode, cambio.body).toBe(200);
    const vista = await today(token);

    const res = await app.inject({
      method: "PUT",
      url: CONQUER_SESSIONS_URL,
      headers: auth(token),
      payload: sessionBodyFromToday(vista, { planche_press: { e1: 5 } }),
    });

    expect(res.statusCode, res.body).toBe(200);
    const saved = await readSessionSteps(
      app,
      res.json<{ sessionId: number }>().sessionId,
    );
    expect(saved.get("planche_press:e1")).toMatchObject({
      value: 5,
      prevTarget: 3,
      rungCode: "adv_tuck",
    });
    // Los demás escalones conservan su peldaño y su historial.
    expect(saved.get("planche_press:e3")?.rungCode).toBe("lean");
  });
});
