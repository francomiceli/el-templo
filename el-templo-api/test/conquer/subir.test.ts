/**
 * Fase 201 Plan 08 (S12-5, A2, A3, §4.5, T-201-26, T-201-28): botón Subir.
 *
 *   - GET  /api/members/conquer/progress            (lista "Hoy toca subir")
 *   - POST /api/members/conquer/steps/:exerciseId/:step/subir
 *   - PUT  /api/members/conquer/sessions            (alerta de tope)
 *
 * Integración contra el MySQL de tests. El historial va SIEMPRE en semanas
 * anteriores con `insertConquerSession`; "hoy" solo por `PUT /sessions`. El
 * catálogo lo siembra la migración 0292: lo que un test desactiva se restaura
 * en `afterEach`.
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
  conquerExerciseIds,
  conquerRungId,
  createActiveConquerMember,
  createConquerStaff,
  fetchProgress,
  fetchToday,
  insertConquerSession,
  memberToday,
  postSubir,
  readConquerAlerts,
  readConquerSteps,
  saveTodaySession,
  TEMPLO_CTX,
  weeksAgo,
  type ConquerErrorBody,
} from "./_helpers";

let app: FastifyInstance;
let gym2: SegundoGimnasio;
/** Peldaños desactivados por el test en curso: se restauran en `afterEach`. */
const desactivados: number[] = [];

beforeAll(async () => {
  app = await createTestApp();
});

beforeEach(async () => {
  await cleanAllTestData(app);
  gym2 = await seedSecondTenant(app);
});

afterEach(async () => {
  for (const id of desactivados.splice(0)) {
    await setRungActive(id, true);
  }
  await clearModuleFlags(app, TENANT_DOS);
});

afterAll(async () => {
  await cleanAllTestData(app);
  await limpiarSegundoGimnasio(app);
  await app.close();
});

async function setRungActive(rungId: number, isActive: boolean): Promise<void> {
  await app.db
    .update(schema.conquerRungs)
    .set({ isActive })
    .where(
      and(
        tenantWhere(schema.conquerRungs, TEMPLO_CTX),
        eq(schema.conquerRungs.id, rungId),
      ),
    );
}

/**
 * Historial de un escalón: un valor por semana anterior (el último valor es el
 * de la semana pasada), en `dayKey`. `extra` suma marcas de otros ejercicios
 * en las mismas sesiones.
 */
async function seedHistory(
  userId: number,
  dayKey: string,
  exerciseCode: string,
  step: "e1" | "e2" | "e3",
  values: number[],
  also: { exerciseCode: string; step: "e1" | "e2" | "e3" }[] = [],
): Promise<void> {
  const hoy = await memberToday(app, userId);
  for (const [i, value] of values.entries()) {
    await insertConquerSession(app, {
      userId,
      date: weeksAgo(hoy, values.length - i),
      dayKey,
      steps: [
        { exerciseCode, step, value },
        ...also.map((a) => ({ ...a, value })),
      ],
    });
  }
}

describe("POST /api/members/conquer/steps/:exerciseId/:step/subir", () => {
  it("S12-5: con 6, 7, 8, 8 aparece SUBIR; el botón pasa a adv tuck y la próxima sesión arranca en 3", async () => {
    const { userId, token } = await createActiveConquerMember(app, {
      level: "toro",
      daysCount: 4,
    });
    const ids = await conquerExerciseIds(app);
    const pressId = ids.get("planche_press") ?? 0;
    await seedHistory(userId, "plancha", "planche_press", "e1", [6, 7, 8, 8]);

    const antes = await fetchProgress(app, token);
    expect(antes.subir).toEqual([
      {
        exerciseId: pressId,
        exerciseName: "Planche press",
        step: "e1",
        fromRungName: "tuck",
        toRungName: "adv tuck",
      },
    ]);
    const pressAntes = antes.days
      .flatMap((d) => d.exercises)
      .find((e) => e.exerciseId === pressId);
    expect(pressAntes?.e1Curve).toEqual([6, 7, 8, 8]);
    expect(pressAntes?.steps[0]).toMatchObject({
      step: "e1",
      last: 8,
      target: 3,
      estado: "subir",
    });

    const res = await postSubir(app, token, pressId, "e1");

    expect(res.statusCode, res.body).toBe(200);
    // La respuesta ya es el Progreso nuevo: no queda nada para subir.
    expect(res.json<{ subir: unknown[] }>().subir).toEqual([]);
    const hoy = await memberToday(app, userId);
    const steps = await readConquerSteps(app, userId);
    expect(steps.get("planche_press:e1")).toMatchObject({
      rungCode: "adv_tuck",
      sinceDate: hoy,
      calibration: "pendiente",
    });
    // Solo sube el escalón pedido.
    expect(steps.get("planche_press:e2")?.rungCode).toBe("tuck");
    expect(steps.get("planche_press:e3")?.rungCode).toBe("lean");

    const vista = await fetchToday(app, token, "plancha");
    const e1 = vista.exercises
      .find((e) => e.code === "planche_press")
      ?.steps.find((s) => s.step === "e1");
    expect(e1).toMatchObject({
      rungName: "adv tuck",
      target: 3,
      value: 3,
      estado: "sin_datos",
    });
  });

  it("A3: con e1 y e2 en subir, Progreso trae solo e1; subir e2 es 409 y e2 aparece después de subir e1", async () => {
    const { userId, token } = await createActiveConquerMember(app, {
      level: "toro",
      daysCount: 4,
    });
    const ids = await conquerExerciseIds(app);
    const pressId = ids.get("planche_press") ?? 0;
    await seedHistory(
      userId,
      "plancha",
      "planche_press",
      "e1",
      [6, 7, 8, 8],
      [{ exerciseCode: "planche_press", step: "e2" }],
    );

    const antes = await fetchProgress(app, token);
    expect(antes.subir.map((s) => [s.exerciseId, s.step])).toEqual([
      [pressId, "e1"],
    ]);

    const e2 = await postSubir(app, token, pressId, "e2");
    expect(e2.statusCode, e2.body).toBe(409);
    expect(e2.json<ConquerErrorBody>().code).toBe("CONQUER_NO_TOCA_SUBIR");
    expect(
      (await readConquerSteps(app, userId)).get("planche_press:e2")?.rungCode,
    ).toBe("tuck");

    const e1 = await postSubir(app, token, pressId, "e1");
    expect(e1.statusCode, e1.body).toBe(200);
    // Con el e1 resuelto, el siguiente en orden (e2) pasa a ofrecerse.
    expect(e1.json<{ subir: { step: string }[] }>().subir).toMatchObject([
      { step: "e2", fromRungName: "tuck", toRungName: "adv tuck" },
    ]);
  });

  it.each([
    { caso: "sin historial", values: [] as number[] },
    { caso: "en rango (5, 6)", values: [5, 6] },
    { caso: "techo una sola vez (8)", values: [8] },
    { caso: "techo y baja (8, 7)", values: [8, 7] },
  ])(
    "T-201-26: escalón $caso -> 409 CONQUER_NO_TOCA_SUBIR y el peldaño no cambia",
    async ({ values }) => {
      const { userId, token } = await createActiveConquerMember(app, {
        level: "toro",
        daysCount: 4,
      });
      const ids = await conquerExerciseIds(app);
      await seedHistory(userId, "plancha", "planche_press", "e1", values);

      const res = await postSubir(
        app,
        token,
        ids.get("planche_press") ?? 0,
        "e1",
      );

      expect(res.statusCode, res.body).toBe(409);
      expect(res.json<ConquerErrorBody>().code).toBe("CONQUER_NO_TOCA_SUBIR");
      const fila = (await readConquerSteps(app, userId)).get(
        "planche_press:e1",
      );
      expect(fila?.rungCode).toBe("tuck");
      expect(fila?.sinceDate).toBeNull();
    },
  );

  it("sube al peldaño más difícil ACTIVO: salta el que el gimnasio desactivó", async () => {
    const { userId, token } = await createActiveConquerMember(app, {
      level: "toro",
      daysCount: 4,
    });
    const ids = await conquerExerciseIds(app);
    const advTuck = await conquerRungId(app, "planche_press", "adv_tuck");
    await setRungActive(advTuck, false);
    desactivados.push(advTuck);
    await seedHistory(userId, "plancha", "planche_press", "e1", [6, 7, 8, 8]);

    const progreso = await fetchProgress(app, token);
    const res = await postSubir(
      app,
      token,
      ids.get("planche_press") ?? 0,
      "e1",
    );

    expect(progreso.subir[0]?.toRungName).toBe("super adv tuck");
    expect(res.statusCode, res.body).toBe(200);
    expect(
      (await readConquerSteps(app, userId)).get("planche_press:e1")?.rungCode,
    ).toBe("super_adv_tuck");
  });

  it("A2 / T-201-28: en el tope no se sube, se responde 409 y queda UNA alerta aunque se repita", async () => {
    const { userId, token } = await createActiveConquerMember(app, {
      level: "toro",
      daysCount: 4,
    });
    const ids = await conquerExerciseIds(app);
    const frontId = ids.get("front_hold") ?? 0;
    const full = await conquerRungId(app, "front_hold", "full");
    await seedHistory(userId, "front", "front_hold", "e1", [12, 12]);

    const progreso = await fetchProgress(app, token);
    const res = await postSubir(app, token, frontId, "e1");

    expect(progreso.subir).toEqual([
      {
        exerciseId: frontId,
        exerciseName: "Front lever hold",
        step: "e1",
        fromRungName: "full",
        toRungName: null,
      },
    ]);
    expect(res.statusCode, res.body).toBe(409);
    expect(res.json<ConquerErrorBody>().code).toBe("CONQUER_TOPE_ESCALERA");
    expect(
      (await readConquerSteps(app, userId)).get("front_hold:e1"),
    ).toMatchObject({ rungCode: "full", sinceDate: null });
    const alertas = await readConquerAlerts(app, userId);
    expect(alertas).toHaveLength(1);
    expect(alertas[0]).toMatchObject({
      type: "tope_escalera",
      status: "abierta",
      dedupeKey: `tope:${frontId}:e1:${full}`,
      detail: {
        exerciseId: frontId,
        exerciseName: "Front lever hold",
        step: "e1",
        rungName: "full",
      },
    });

    // Repetir el pedido y guardar la sesión de hoy con 12 s no duplica la alerta.
    await postSubir(app, token, frontId, "e1");
    await saveTodaySession(app, token, {
      day: "front",
      edits: { front_hold: { e1: 12 } },
    });
    expect(await readConquerAlerts(app, userId)).toHaveLength(1);
  });

  it("A2: la alerta de tope se auto-resuelve si el escalón deja de estar en subir y se reabre si vuelve (el coach la cierra para siempre)", async () => {
    const { userId, token } = await createActiveConquerMember(app, {
      level: "toro",
      daysCount: 4,
    });
    await seedHistory(userId, "front", "front_hold", "e1", [12, 12]);
    const guardar = (e1: number) =>
      saveTodaySession(app, token, {
        day: "front",
        edits: { front_hold: { e1 } },
      });

    await guardar(12);
    const [abierta] = await readConquerAlerts(app, userId);
    expect(abierta).toMatchObject({ status: "abierta", resolvedBy: null });

    // Re-guardar el mismo día con 5: 12, 12, 5 ya no es subir.
    await guardar(5);
    const [resuelta] = await readConquerAlerts(app, userId);
    expect(resuelta).toMatchObject({ status: "resuelta", resolvedBy: null });
    expect(resuelta?.resolvedAt).not.toBeNull();

    // Vuelve a 12: la reabre el sistema (misma fila).
    await guardar(12);
    const reabierta = await readConquerAlerts(app, userId);
    expect(reabierta).toHaveLength(1);
    expect(reabierta[0]).toMatchObject({
      status: "abierta",
      resolvedBy: null,
      resolvedAt: null,
    });

    // El coach la resuelve: ya no se reabre.
    const admin = await createConquerStaff(app, "admin");
    await app.db
      .update(schema.conquerAlerts)
      .set({ status: "resuelta", resolvedBy: admin.id })
      .where(
        and(
          tenantWhere(schema.conquerAlerts, TEMPLO_CTX),
          eq(schema.conquerAlerts.userId, userId),
        ),
      );
    await guardar(5);
    await guardar(12);
    const final = await readConquerAlerts(app, userId);
    expect(final).toHaveLength(1);
    expect(final[0]).toMatchObject({
      status: "resuelta",
      resolvedBy: admin.id,
    });
  });

  it("ejercicio inexistente, fuera del plan del alumno o de otro gimnasio: 404", async () => {
    const toro = await createActiveConquerMember(app, {
      level: "toro",
      daysCount: 4,
    });
    const ternero = await createActiveConquerMember(app, {
      level: "ternero",
      daysCount: 2,
    });
    const ids = await conquerExerciseIds(app);
    // Ternero de 2 días no tiene Planche press (es del plan de 3 y 4 días).
    const delPlan4 = await postSubir(
      app,
      ternero.token,
      ids.get("planche_press") ?? 0,
      "e1",
    );
    const inexistente = await postSubir(app, toro.token, 2_000_000_000, "e1");

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
    const otroGimnasio = await postSubir(
      app,
      socio2.token,
      ids.get("planche_press") ?? 0,
      "e1",
    );

    expect(delPlan4.statusCode, delPlan4.body).toBe(404);
    expect(inexistente.statusCode, inexistente.body).toBe(404);
    expect(otroGimnasio.statusCode, otroGimnasio.body).toBe(404);
  });

  it("validación: el hold no sube (400), un id inválido es 400 y sin token es 401", async () => {
    const { token } = await createActiveConquerMember(app, {
      level: "toro",
      daysCount: 4,
    });
    const ids = await conquerExerciseIds(app);
    const pressId = ids.get("planche_press") ?? 0;

    const hold = await postSubir(app, token, pressId, "hold");
    const idCero = await postSubir(app, token, 0, "e1");
    const sinToken = await app.inject({
      method: "POST",
      url: `/api/members/conquer/steps/${pressId}/e1/subir`,
    });

    expect(hold.statusCode, hold.body).toBe(400);
    expect(idCero.statusCode, idCero.body).toBe(400);
    expect(sinToken.statusCode).toBe(401);
  });

  it("un alumno sin Conquer activo: 409 CONQUER_NO_ACTIVO", async () => {
    const socio = await createTestMember(app);
    const ids = await conquerExerciseIds(app);

    const res = await postSubir(
      app,
      socio.token,
      ids.get("planche_press") ?? 0,
      "e1",
    );

    expect(res.statusCode, res.body).toBe(409);
    expect(res.json<ConquerErrorBody>().code).toBe("CONQUER_NO_ACTIVO");
  });
});
