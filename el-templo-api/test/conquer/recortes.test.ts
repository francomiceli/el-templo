/**
 * Fase 201 Plan 11 (S12-6, §5.1, A12, D-08, T-201-36..38): el coach acepta el
 * recorte que propone la app, de a un paso.
 *
 *   - POST /api/admin/conquer/members/:userId/recortes
 *
 * Integración contra el MySQL de tests. Usuarios SIEMPRE con fábricas; el
 * catálogo lo siembra la migración 0292 y estos tests no lo modifican (solo
 * los escalones del alumno).
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
  conquerExerciseIds,
  conquerRungId,
  createActiveConquerMember,
  createConquerStaff,
  fetchFicha,
  fetchToday,
  insertConquerAlert,
  insertConquerMember,
  memberToday,
  patchConquerMember,
  patchConquerStep,
  postCutRaw,
  readConquerAlerts,
  readConquerSteps,
  TEMPLO_CTX,
  type ConquerErrorBody,
  type FichaBody,
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

async function cutStageOf(userId: number): Promise<number> {
  const [row] = await app.db
    .select({ cutStage: schema.conquerMembers.cutStage })
    .from(schema.conquerMembers)
    .where(
      and(
        tenantWhere(schema.conquerMembers, TEMPLO_CTX),
        eq(schema.conquerMembers.userId, userId),
      ),
    );
  return row?.cutStage ?? -1;
}

/** Alumno `activo` + un admin propio para hacer las llamadas (≠ el que lo activó). */
async function escenario(
  level: "ternero" | "novillo" | "toro",
  daysCount: number,
) {
  const member = await createActiveConquerMember(app, { level, daysCount });
  const admin = await createConquerStaff(app, "admin");
  return { ...member, admin };
}

/** Activa o desactiva un peldaño del catálogo (el test lo restaura en `finally`). */
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

async function alertaMolestia(userId: number, clave = "a"): Promise<number> {
  return insertConquerAlert(app, {
    userId,
    type: "molestia",
    dedupeKey: `molestia:recortes:${clave}`,
    detail: { pain: 5 },
  });
}

describe("POST /api/admin/conquer/members/:userId/recortes — etapas de Toro (§5.1, A12)", () => {
  it("aplicar_etapa con alertId: cut_stage 1, la alerta queda resuelta por el admin y el sábado baja a 9", async () => {
    const m = await escenario("toro", 4);
    const alertId = await alertaMolestia(m.userId);
    const antes = await fetchToday(app, m.token, "sabado");
    expect(antes.saturday?.push.target).toBe(13);

    const res = await postCutRaw(app, m.admin.token, m.userId, {
      action: "aplicar_etapa",
      alertId,
    });

    expect(res.statusCode, res.body).toBe(200);
    const ficha = res.json<FichaBody>();
    expect(ficha.member.cutStage).toBe(1);
    expect(ficha.cutProposal).toMatchObject({ kind: "etapa", stage: 2 });
    expect(ficha.alerts.some((a) => a.id === alertId)).toBe(false);
    expect(await cutStageOf(m.userId)).toBe(1);
    const alerta = (await readConquerAlerts(app, m.userId)).find(
      (a) => a.id === alertId,
    );
    expect(alerta?.status).toBe("resuelta");
    expect(alerta?.resolvedBy).toBe(m.admin.id);
    const despues = await fetchToday(app, m.token, "sabado");
    expect(despues.saturday?.push.target).toBe(9);
  });

  it("aplicar_etapa sin alertId no toca las alertas abiertas", async () => {
    const m = await escenario("toro", 4);
    const alertId = await alertaMolestia(m.userId);

    const res = await postCutRaw(app, m.admin.token, m.userId, {
      action: "aplicar_etapa",
    });

    expect(res.statusCode, res.body).toBe(200);
    expect(await cutStageOf(m.userId)).toBe(1);
    const alerta = (await readConquerAlerts(app, m.userId)).find(
      (a) => a.id === alertId,
    );
    expect(alerta?.status).toBe("abierta");
  });

  it("de a un paso: 5 etapas y la sexta es 409 CONQUER_SIN_ETAPA; la propuesta pasa a bajar un escalón", async () => {
    const m = await escenario("toro", 4);

    for (let etapa = 1; etapa <= 5; etapa++) {
      const res = await postCutRaw(app, m.admin.token, m.userId, {
        action: "aplicar_etapa",
      });
      expect(res.statusCode, res.body).toBe(200);
      expect(res.json<FichaBody>().member.cutStage).toBe(etapa);
    }
    const ficha = await fetchFicha(app, m.admin.token, m.userId);
    expect(ficha.cutProposal.kind).toBe("bajar_escalon");

    const sexta = await postCutRaw(app, m.admin.token, m.userId, {
      action: "aplicar_etapa",
    });

    expect(sexta.statusCode).toBe(409);
    expect(sexta.json<ConquerErrorBody>().code).toBe("CONQUER_SIN_ETAPA");
    expect(await cutStageOf(m.userId)).toBe(5);
  });

  it("deshacer_etapa baja una etapa (A12: sin reversión automática)", async () => {
    const m = await escenario("toro", 4);
    await patchConquerMember(app, m.userId, { cutStage: 5 });

    const res = await postCutRaw(app, m.admin.token, m.userId, {
      action: "deshacer_etapa",
    });

    expect(res.statusCode, res.body).toBe(200);
    expect(res.json<FichaBody>().member.cutStage).toBe(4);
    expect(await cutStageOf(m.userId)).toBe(4);
  });

  it("deshacer_etapa en etapa 0: 409 CONQUER_SIN_ETAPA y no baja de cero", async () => {
    const m = await escenario("toro", 4);

    const res = await postCutRaw(app, m.admin.token, m.userId, {
      action: "deshacer_etapa",
    });

    expect(res.statusCode).toBe(409);
    expect(res.json<ConquerErrorBody>().code).toBe("CONQUER_SIN_ETAPA");
    expect(await cutStageOf(m.userId)).toBe(0);
  });

  it.each([
    ["ternero", 3],
    ["novillo", 3],
  ] as const)(
    "%s no tiene etapas: aplicar_etapa es 409 y la alerta sigue abierta (la acción es atómica)",
    async (level, dias) => {
      const m = await escenario(level, dias);
      const alertId = await alertaMolestia(m.userId);

      const res = await postCutRaw(app, m.admin.token, m.userId, {
        action: "aplicar_etapa",
        alertId,
      });

      expect(res.statusCode).toBe(409);
      expect(res.json<ConquerErrorBody>().code).toBe("CONQUER_SIN_ETAPA");
      expect(await cutStageOf(m.userId)).toBe(0);
      const alerta = (await readConquerAlerts(app, m.userId)).find(
        (a) => a.id === alertId,
      );
      expect(alerta?.status).toBe("abierta");
      expect(alerta?.resolvedBy).toBeNull();
    },
  );
});

describe("POST /api/admin/conquer/members/:userId/recortes — bajar un escalón (§5.1)", () => {
  it("Novillo: Planche press e1 baja al peldaño más fácil siguiente, since hoy y vuelve a calibrar", async () => {
    const m = await escenario("novillo", 3);
    const hoy = await memberToday(app, m.userId);
    const ids = await conquerExerciseIds(app);
    await patchConquerStep(app, m.userId, "planche_press", "e1", {
      rungCode: "tuck",
      calibration: "resuelta",
      sinceDate: null,
    });

    const res = await postCutRaw(app, m.admin.token, m.userId, {
      action: "bajar_escalon",
      exerciseId: ids.get("planche_press"),
      step: "e1",
    });

    expect(res.statusCode, res.body).toBe(200);
    const fila = (await readConquerSteps(app, m.userId)).get(
      "planche_press:e1",
    );
    // Posición mayor = más fácil: de tuck (5) a lean (6).
    expect(fila?.rungCode).toBe("lean");
    expect(fila?.sinceDate).toBe(hoy);
    expect(fila?.calibration).toBe("pendiente");
    const ficha = res.json<FichaBody>();
    const ejercicio = ficha.progress.days
      .flatMap((d) => d.exercises)
      .find((e) => e.name === "Planche press");
    expect(ejercicio?.steps.find((s) => s.step === "e1")?.rungName).toBe(
      "lean",
    );
  });

  it("salta los peldaños inactivos: baja al activo más fácil siguiente", async () => {
    const m = await escenario("novillo", 3);
    const ids = await conquerExerciseIds(app);
    await patchConquerStep(app, m.userId, "planche_press", "e1", {
      rungCode: "adv_tuck",
    });
    const tuckId = await conquerRungId(app, "planche_press", "tuck");
    await setRungActive(tuckId, false);
    try {
      const res = await postCutRaw(app, m.admin.token, m.userId, {
        action: "bajar_escalon",
        exerciseId: ids.get("planche_press"),
        step: "e1",
      });

      expect(res.statusCode, res.body).toBe(200);
      const fila = (await readConquerSteps(app, m.userId)).get(
        "planche_press:e1",
      );
      expect(fila?.rungCode).toBe("lean");
    } finally {
      await setRungActive(tuckId, true);
    }
  });

  it("también en Toro (cualquier nivel): el hold baja un peldaño y la alerta de la caída se resuelve", async () => {
    const m = await escenario("toro", 4);
    const ids = await conquerExerciseIds(app);
    const alertId = await insertConquerAlert(app, {
      userId: m.userId,
      type: "caida",
      dedupeKey: "caida:recortes:a",
      detail: { exerciseName: "Planche press" },
    });
    const antes = (await readConquerSteps(app, m.userId)).get(
      "planche_press:hold",
    );
    expect(antes?.rungCode).toBe("lean");
    await patchConquerStep(app, m.userId, "planche_press", "hold", {
      rungCode: "tuck",
      calibration: "resuelta",
    });

    const res = await postCutRaw(app, m.admin.token, m.userId, {
      action: "bajar_escalon",
      exerciseId: ids.get("planche_press"),
      step: "hold",
      alertId,
    });

    expect(res.statusCode, res.body).toBe(200);
    const fila = (await readConquerSteps(app, m.userId)).get(
      "planche_press:hold",
    );
    expect(fila?.rungCode).toBe("lean");
    // El hold no es el E1: su modo y su calibración no se tocan.
    expect(fila?.mode).toBe("hold");
    expect(fila?.calibration).toBe("resuelta");
    const alerta = (await readConquerAlerts(app, m.userId)).find(
      (a) => a.id === alertId,
    );
    expect(alerta?.status).toBe("resuelta");
    expect(alerta?.resolvedBy).toBe(m.admin.id);
  });

  // 201-25 DA-3: bajar un hold se resuelve en la escalera de hold del ejercicio.
  it("Toro: el hold de Fondo a pelícano baja dentro de fondo_pelicano_hold (anillas -> paralelas)", async () => {
    const m = await escenario("toro", 4);
    const ids = await conquerExerciseIds(app);

    const res = await postCutRaw(app, m.admin.token, m.userId, {
      action: "bajar_escalon",
      exerciseId: ids.get("fondo_pelicano"),
      step: "hold",
    });

    expect(res.statusCode, res.body).toBe(200);
    expect(
      (await readConquerSteps(app, m.userId)).get("fondo_pelicano:hold"),
    ).toMatchObject({
      rungCode: "paralelas",
      ladderCode: "fondo_pelicano_hold",
    });
  });

  it("Novillo: el hold de One arm / archer (dominada, el más fácil de su escalera de hold) da 409 de piso y no pasa a un peldaño de trac", async () => {
    const m = await escenario("novillo", 3);
    const ids = await conquerExerciseIds(app);
    const antes = (await readConquerSteps(app, m.userId)).get(
      "one_arm_archer:hold",
    );
    expect(antes).toMatchObject({
      rungCode: "dominada",
      ladderCode: "one_arm_archer_hold",
    });

    const res = await postCutRaw(app, m.admin.token, m.userId, {
      action: "bajar_escalon",
      exerciseId: ids.get("one_arm_archer"),
      step: "hold",
    });

    expect(res.statusCode, res.body).toBe(409);
    expect(res.json<ConquerErrorBody>().code).toBe("CONQUER_PISO_ESCALERA");
    expect(
      (await readConquerSteps(app, m.userId)).get("one_arm_archer:hold"),
    ).toEqual(antes);
  });

  it("en el peldaño más fácil: 409 CONQUER_PISO_ESCALERA, sin cambios y la alerta sigue abierta", async () => {
    const m = await escenario("novillo", 3);
    const ids = await conquerExerciseIds(app);
    const alertId = await alertaMolestia(m.userId);
    await patchConquerStep(app, m.userId, "planche_press", "e1", {
      rungCode: "lean",
      calibration: "resuelta",
    });

    const res = await postCutRaw(app, m.admin.token, m.userId, {
      action: "bajar_escalon",
      exerciseId: ids.get("planche_press"),
      step: "e1",
      alertId,
    });

    expect(res.statusCode).toBe(409);
    expect(res.json<ConquerErrorBody>().code).toBe("CONQUER_PISO_ESCALERA");
    const fila = (await readConquerSteps(app, m.userId)).get(
      "planche_press:e1",
    );
    expect(fila?.rungCode).toBe("lean");
    expect(fila?.calibration).toBe("resuelta");
    const alerta = (await readConquerAlerts(app, m.userId)).find(
      (a) => a.id === alertId,
    );
    expect(alerta?.status).toBe("abierta");
  });

  it("un escalón que no es del alumno (ejercicio fuera de su plan): 404", async () => {
    const m = await escenario("novillo", 3);
    const ids = await conquerExerciseIds(app);
    // Front lever hold solo está en la plantilla de 4 días.
    expect((await readConquerSteps(app, m.userId)).has("front_hold:e1")).toBe(
      false,
    );

    const res = await postCutRaw(app, m.admin.token, m.userId, {
      action: "bajar_escalon",
      exerciseId: ids.get("front_hold"),
      step: "e1",
    });

    expect(res.statusCode).toBe(404);
  });
});

describe("POST /api/admin/conquer/members/:userId/recortes — ids anidados, roles y validación", () => {
  it.each(["alerta de otro alumno", "alerta de tipo tope_escalera"])(
    "alertId inválido (%s): 404 y no se aplica nada (T-201-37)",
    async (caso) => {
      const m = await escenario("toro", 4);
      const otro = await createTestMember(app);
      await insertConquerMember(app, otro.id, {
        status: "activo",
        level: "toro",
        daysCount: 4,
      });
      const alertId =
        caso === "alerta de otro alumno"
          ? await alertaMolestia(otro.id, "ajena")
          : await insertConquerAlert(app, {
              userId: m.userId,
              type: "tope_escalera",
              dedupeKey: "tope:recortes:a",
            });

      const res = await postCutRaw(app, m.admin.token, m.userId, {
        action: "aplicar_etapa",
        alertId,
      });

      expect(res.statusCode).toBe(404);
      expect(res.json<ConquerErrorBody>().code).toBe(
        "CONQUER_ALERTA_NO_ENCONTRADA",
      );
      expect(await cutStageOf(m.userId)).toBe(0);
      const alertas = await readConquerAlerts(app, m.userId);
      const ajenas = await readConquerAlerts(app, otro.id);
      expect(alertas.every((a) => a.status === "abierta")).toBe(true);
      expect(ajenas.every((a) => a.status === "abierta")).toBe(true);
    },
  );

  it("un alertId inexistente: 404", async () => {
    const m = await escenario("toro", 4);
    const propia = await alertaMolestia(m.userId);

    const res = await postCutRaw(app, m.admin.token, m.userId, {
      action: "aplicar_etapa",
      alertId: propia + 100000,
    });

    expect(res.statusCode).toBe(404);
    expect(await cutStageOf(m.userId)).toBe(0);
  });

  it.each(["coach", "recepcion", "coach_actividad"])(
    "el rol %s no puede aceptar recortes: 403 aun con un body inválido (T-201-36)",
    async (rol) => {
      const m = await escenario("toro", 4);
      const staff = await createConquerStaff(app, rol);

      const valido = await postCutRaw(app, staff.token, m.userId, {
        action: "aplicar_etapa",
      });
      const invalido = await postCutRaw(app, staff.token, m.userId, {
        action: "no-existe",
      });

      expect(valido.statusCode).toBe(403);
      expect(invalido.statusCode).toBe(403);
      expect(await cutStageOf(m.userId)).toBe(0);
    },
  );

  it("un socio no puede aceptar su propio recorte: 403; sin token: 401", async () => {
    const m = await escenario("toro", 4);

    const socio = await postCutRaw(app, m.token, m.userId, {
      action: "aplicar_etapa",
    });
    const anonimo = await postCutRaw(app, undefined, m.userId, {
      action: "aplicar_etapa",
    });

    expect(socio.statusCode).toBe(403);
    expect(anonimo.statusCode).toBe(401);
    expect(await cutStageOf(m.userId)).toBe(0);
  });

  it("el admin del gimnasio 2 no puede tocar a un alumno del gimnasio 1: 404", async () => {
    await setModuleFlag(app, TENANT_DOS, "templo-training", true);
    const m = await escenario("toro", 4);

    const res = await postCutRaw(app, gym2.adminToken, m.userId, {
      action: "aplicar_etapa",
    });

    expect(res.statusCode).toBe(404);
    expect(await cutStageOf(m.userId)).toBe(0);
  });

  it("alumno con Conquer solo pedido: 409 CONQUER_NO_ACTIVO; socio sin fila: 404", async () => {
    const admin = await createConquerStaff(app, "admin");
    const pedido = await createTestMember(app);
    await insertConquerMember(app, pedido.id, { status: "pedido" });
    const sinFila = await createTestMember(app);

    const resPedido = await postCutRaw(app, admin.token, pedido.id, {
      action: "aplicar_etapa",
    });
    const resSinFila = await postCutRaw(app, admin.token, sinFila.id, {
      action: "aplicar_etapa",
    });

    expect(resPedido.statusCode).toBe(409);
    expect(resPedido.json<ConquerErrorBody>().code).toBe("CONQUER_NO_ACTIVO");
    expect(resSinFila.statusCode).toBe(404);
  });

  it.each([
    ["sin action", {}],
    ["action desconocida", { action: "borrar_todo" }],
    ["alertId cero", { action: "aplicar_etapa", alertId: 0 }],
    ["alertId no entero", { action: "aplicar_etapa", alertId: "uno" }],
    [
      "step desconocido",
      { action: "bajar_escalon", exerciseId: 1, step: "e9" },
    ],
  ])("body inválido (%s): 400", async (_caso, payload) => {
    const m = await escenario("toro", 4);

    const res = await postCutRaw(app, m.admin.token, m.userId, payload);

    expect(res.statusCode).toBe(400);
    expect(await cutStageOf(m.userId)).toBe(0);
  });

  it.each([
    ["sin exerciseId", { action: "bajar_escalon", step: "e1" }],
    ["sin step", { action: "bajar_escalon", exerciseId: 1 }],
  ])("bajar_escalon %s: 400 CONQUER_CORTE_INVALIDO", async (_caso, payload) => {
    const m = await escenario("novillo", 3);

    const res = await postCutRaw(app, m.admin.token, m.userId, payload);

    expect(res.statusCode).toBe(400);
    expect(res.json<ConquerErrorBody>().code).toBe("CONQUER_CORTE_INVALIDO");
  });
});
