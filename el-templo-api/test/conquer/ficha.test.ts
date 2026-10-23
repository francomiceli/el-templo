/**
 * Fase 201 Plan 11 (S12-6, §7.2, D-08, T-201-36, T-201-37): ficha del alumno para
 * owner/admin y corrección de progresiones del coach.
 *
 *   - GET /api/admin/conquer/members/:userId
 *   - PUT /api/admin/conquer/members/:userId/steps/:exerciseId/:step
 *
 * Integración contra el MySQL de tests. Usuarios SIEMPRE con fábricas.
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
  boardMember,
  conquerExerciseIds,
  conquerRungId,
  createActiveConquerMember,
  createConquerStaff,
  fetchBoard,
  fetchFicha,
  fetchProgress,
  fetchToday,
  getFichaRaw,
  insertConquerAlert,
  insertConquerMember,
  memberToday,
  patchConquerMember,
  putFichaStepRaw,
  readConquerSteps,
  shortDateText,
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

async function escenario(
  level: "ternero" | "novillo" | "toro",
  daysCount: number,
) {
  const member = await createActiveConquerMember(app, { level, daysCount });
  const admin = await createConquerStaff(app, "admin");
  return { ...member, admin };
}

async function emailOf(userId: number): Promise<string | null> {
  const [row] = await app.db
    .select({ email: schema.users.email })
    .from(schema.users)
    .where(
      and(tenantWhere(schema.users, TEMPLO_CTX), eq(schema.users.id, userId)),
    );
  return row?.email ?? null;
}

describe("GET /api/admin/conquer/members/:userId (§7.2)", () => {
  it("trae el Progreso, las alertas, la propuesta de recorte y si puede pasar de nivel", async () => {
    // Otro alumno con sus propias alertas: la ficha no las mezcla.
    const otro = await escenario("toro", 4);
    await insertConquerAlert(app, {
      userId: otro.userId,
      type: "tope_escalera",
      dedupeKey: "tope:ficha:ajena",
    });
    const m = await escenario("novillo", 3);
    const hoy = await memberToday(app, m.userId);
    const molestiaId = await insertConquerAlert(app, {
      userId: m.userId,
      type: "molestia",
      dedupeKey: "molestia:ficha:a",
      detail: { pain: 5 },
    });
    const pasoId = await insertConquerAlert(app, {
      userId: m.userId,
      type: "paso_nivel",
      dedupeKey: `paso_nivel:novillo:${hoy}`,
      detail: { from: "novillo", to: "toro", weeks: 4 },
    });

    const ficha = await fetchFicha(app, m.admin.token, m.userId);

    expect(ficha.member).toMatchObject({
      userId: m.userId,
      status: "activo",
      level: "novillo",
      daysCount: 3,
      incReps: 1,
      incS: 2,
      cutStage: 0,
      firstName: "Test",
      lastName: "Member",
      email: await emailOf(m.userId),
    });
    expect(ficha.alerts.map((a) => a.id).sort()).toEqual(
      [molestiaId, pasoId].sort(),
    );
    const molestia = ficha.alerts.find((a) => a.id === molestiaId);
    expect(molestia?.kind).toBe("molestia");
    expect(molestia?.proposal?.kind).toBe("bajar_escalon");
    expect(ficha.cutProposal?.kind).toBe("bajar_escalon");
    // 201-26 DA-13 / anexo §8: cada alerta trae su frase con los datos.
    expect(molestia?.text).toBe("Molestia 5/10");
    expect(ficha.alerts.find((a) => a.id === pasoId)?.text).toBe(
      "Test completó 4 semanas de su plan sin molestias",
    );
    expect(ficha.levelUp).toEqual({ to: "toro", validDays: [4] });
    // Cada ficha trae SOLO las alertas de su alumno.
    const fichaOtro = await fetchFicha(app, otro.admin.token, otro.userId);
    expect(fichaOtro.member.userId).toBe(otro.userId);
    expect(fichaOtro.alerts.map((a) => a.kind)).toEqual(["tope_escalera"]);
    // El Progreso es EL del alumno (mismo builder, sin duplicar).
    expect(ficha.progress).toEqual(await fetchProgress(app, m.token));
  });

  it("trae las banderas de publicación del alumno (autorizó y sin cara)", async () => {
    const m = await escenario("toro", 4);
    const antes = await fetchFicha(app, m.admin.token, m.userId);
    expect(antes.member.publishEnabled).toBe(false);
    expect(antes.member.publishNoFace).toBe(false);

    const put = await app.inject({
      method: "PUT",
      url: "/api/members/conquer/publish-permission",
      headers: { authorization: `Bearer ${m.token}` },
      payload: { enabled: true, noFace: true },
    });
    expect(put.statusCode).toBe(200);

    const despues = await fetchFicha(app, m.admin.token, m.userId);
    expect(despues.member.publishEnabled).toBe(true);
    expect(despues.member.publishNoFace).toBe(true);
  });

  it("las alertas son las del tablero (mismas guardadas y derivadas)", async () => {
    const m = await escenario("toro", 4);
    const hoy = await memberToday(app, m.userId);
    // Diez días activado sin entrenar: alerta derivada "inactivo".
    await patchConquerMember(app, m.userId, {
      activationDate: addDaysIso(hoy, -10),
    });
    await insertConquerAlert(app, {
      userId: m.userId,
      type: "caida",
      dedupeKey: "caida:ficha:a",
    });

    const ficha = await fetchFicha(app, m.admin.token, m.userId);
    const tablero = boardMember(await fetchBoard(app, m.admin.token), m.userId);

    expect(ficha.alerts.map((a) => a.kind).sort()).toEqual(
      ["caida", "inactivo"].sort(),
    );
    expect(ficha.alerts).toEqual(tablero.alerts);
    expect(ficha.alerts.find((a) => a.kind === "inactivo")?.id).toBeNull();
  });

  it("Toro con recorte 2: propone la etapa 3 y no tiene nivel siguiente", async () => {
    const m = await escenario("toro", 4);
    await patchConquerMember(app, m.userId, { cutStage: 2 });

    const ficha = await fetchFicha(app, m.admin.token, m.userId);

    expect(ficha.cutProposal).toMatchObject({ kind: "etapa", stage: 3 });
    expect(ficha.levelUp).toEqual({ to: null, validDays: [] });
  });

  it("Ternero: puede pasar a Novillo con 3 o 4 días", async () => {
    const m = await escenario("ternero", 2);

    const ficha = await fetchFicha(app, m.admin.token, m.userId);

    expect(ficha.levelUp).toEqual({ to: "novillo", validDays: [3, 4] });
    expect(ficha.cutProposal?.kind).toBe("bajar_escalon");
  });

  // 201-26 DA-12 / anexo §8: Toro después de la etapa 5 no tiene propuesta.
  it("Toro con recorte 5: cutProposal es null y la alerta de molestia no trae propuesta", async () => {
    const m = await escenario("toro", 4);
    const hace2 = addDaysIso(await memberToday(app, m.userId), -2);
    await patchConquerMember(app, m.userId, { cutStage: 5 });
    await insertConquerAlert(app, {
      userId: m.userId,
      type: "molestia",
      dedupeKey: "molestia:ficha:etapa5",
      detail: { pain: 6, date: hace2, dayKey: "plancha" },
    });

    const ficha = await fetchFicha(app, m.admin.token, m.userId);

    expect(ficha.cutProposal).toBeNull();
    const molestia = ficha.alerts.find((a) => a.kind === "molestia");
    expect(molestia?.proposal).toBeNull();
    // Alerta vieja sin dayLabel: cae al dayKey con mayúscula inicial.
    expect(molestia?.text).toBe(
      `Molestia 6/10 en Plancha el ${shortDateText(hace2)}`,
    );
  });

  it("alumno con Conquer solo pedido: 409 CONQUER_NO_ACTIVO; socio sin fila: 404", async () => {
    const admin = await createConquerStaff(app, "admin");
    const pedido = await createTestMember(app);
    await insertConquerMember(app, pedido.id, { status: "pedido" });
    const sinFila = await createTestMember(app);

    const resPedido = await getFichaRaw(app, admin.token, pedido.id);
    const resSinFila = await getFichaRaw(app, admin.token, sinFila.id);

    expect(resPedido.statusCode).toBe(409);
    expect(resPedido.json<ConquerErrorBody>().code).toBe("CONQUER_NO_ACTIVO");
    expect(resSinFila.statusCode).toBe(404);
  });

  it("el admin del gimnasio 2 no ve la ficha de un alumno del gimnasio 1: 404", async () => {
    await setModuleFlag(app, TENANT_DOS, "templo-training", true);
    const m = await escenario("toro", 4);

    const res = await getFichaRaw(app, gym2.adminToken, m.userId);

    expect(res.statusCode).toBe(404);
  });

  it.each(["coach", "recepcion", "coach_actividad"])(
    "el rol %s no ve la ficha (dato de salud): 403 (T-201-36)",
    async (rol) => {
      const m = await escenario("toro", 4);
      const staff = await createConquerStaff(app, rol);

      const res = await getFichaRaw(app, staff.token, m.userId);

      expect(res.statusCode).toBe(403);
    },
  );

  it("un socio no ve ni su propia ficha: 403; sin token: 401", async () => {
    const m = await escenario("toro", 4);

    const socio = await getFichaRaw(app, m.token, m.userId);
    const anonimo = await getFichaRaw(app, undefined, m.userId);

    expect(socio.statusCode).toBe(403);
    expect(anonimo.statusCode).toBe(401);
  });

  it("el userId del path tiene que ser un entero positivo: 400", async () => {
    const admin = await createConquerStaff(app, "admin");

    const res = await getFichaRaw(app, admin.token, "abc");

    expect(res.statusCode).toBe(400);
  });
});

describe("PUT /api/admin/conquer/members/:userId/steps/:exerciseId/:step (§7.2)", () => {
  it("el coach corrige un peldaño: la ficha y el Hoy del alumno lo reflejan con el objetivo en el piso", async () => {
    const m = await escenario("novillo", 3);
    const hoy = await memberToday(app, m.userId);
    const ids = await conquerExerciseIds(app);

    const res = await putFichaStepRaw(
      app,
      m.admin.token,
      m.userId,
      ids.get("planche_press") ?? 0,
      "e1",
      {
        rungId: await conquerRungId(app, "planche_press", "adv_tuck"),
        mode: "completa",
      },
    );

    expect(res.statusCode, res.body).toBe(200);
    const ficha = res.json<FichaBody>();
    const ejercicio = ficha.progress.days
      .flatMap((d) => d.exercises)
      .find((e) => e.name === "Planche press");
    expect(ejercicio?.steps.find((s) => s.step === "e1")?.rungName).toBe(
      "adv tuck",
    );
    const fila = (await readConquerSteps(app, m.userId)).get(
      "planche_press:e1",
    );
    expect(fila?.rungCode).toBe("adv_tuck");
    expect(fila?.sinceDate).toBe(hoy);
    expect(fila?.calibration).toBe("pendiente");
    const vista = await fetchToday(app, m.token, "mixto");
    const paso = vista.exercises
      .find((e) => e.code === "planche_press")
      ?.steps.find((s) => s.step === "e1");
    expect(paso?.rungName).toBe("adv tuck");
    expect(paso?.target).toBe(3);
  });

  it("el incremento se edita con el PUT del alumno (201-06) y la ficha lo muestra", async () => {
    const m = await escenario("novillo", 3);

    const edit = await app.inject({
      method: "PUT",
      url: `/api/admin/conquer/members/${m.userId}`,
      headers: { authorization: `Bearer ${m.admin.token}` },
      payload: { incReps: 3, incS: 5 },
    });

    expect(edit.statusCode, edit.body).toBe(200);
    const ficha = await fetchFicha(app, m.admin.token, m.userId);
    expect(ficha.member).toMatchObject({ incReps: 3, incS: 5 });
  });

  it("el escalón tiene que ser del alumno: un ejercicio fuera de su plan es 404 (T-201-37)", async () => {
    const m = await escenario("novillo", 3);
    const ids = await conquerExerciseIds(app);
    // Front raises solo está en la plantilla de 4 días (Front lever hold también está en Tracción de 3).
    expect((await readConquerSteps(app, m.userId)).has("front_raises:e1")).toBe(
      false,
    );

    const res = await putFichaStepRaw(
      app,
      m.admin.token,
      m.userId,
      ids.get("front_raises") ?? 0,
      "e1",
      {
        rungId: await conquerRungId(app, "front_raises", "tuck"),
        mode: "completa",
      },
    );

    expect(res.statusCode).toBe(404);
  });

  it("un peldaño de otra escalera: 400 CONQUER_PELDANO_INVALIDO y no cambia nada", async () => {
    const m = await escenario("novillo", 3);
    const ids = await conquerExerciseIds(app);
    const antes = (await readConquerSteps(app, m.userId)).get(
      "planche_press:e1",
    );

    const res = await putFichaStepRaw(
      app,
      m.admin.token,
      m.userId,
      ids.get("planche_press") ?? 0,
      "e1",
      { rungId: await conquerRungId(app, "hspu", "libre"), mode: "completa" },
    );

    expect(res.statusCode).toBe(400);
    expect(res.json<ConquerErrorBody>().code).toBe("CONQUER_PELDANO_INVALIDO");
    expect(
      (await readConquerSteps(app, m.userId)).get("planche_press:e1"),
    ).toEqual(antes);
  });

  it("el hold final siempre en modo hold: 400 CONQUER_MODO_INVALIDO", async () => {
    const m = await escenario("novillo", 3);
    const ids = await conquerExerciseIds(app);

    const res = await putFichaStepRaw(
      app,
      m.admin.token,
      m.userId,
      ids.get("planche_press") ?? 0,
      "hold",
      {
        rungId: await conquerRungId(app, "planche_press", "lean"),
        mode: "completa",
      },
    );

    expect(res.statusCode).toBe(400);
    expect(res.json<ConquerErrorBody>().code).toBe("CONQUER_MODO_INVALIDO");
  });

  it("el recurso del gimnasio 2: el admin del 2 no corrige a un alumno del 1 (404)", async () => {
    await setModuleFlag(app, TENANT_DOS, "templo-training", true);
    const m = await escenario("novillo", 3);
    const ids = await conquerExerciseIds(app);
    const antes = (await readConquerSteps(app, m.userId)).get(
      "planche_press:e1",
    );

    const res = await putFichaStepRaw(
      app,
      gym2.adminToken,
      m.userId,
      ids.get("planche_press") ?? 0,
      "e1",
      {
        rungId: await conquerRungId(app, "planche_press", "adv_tuck"),
        mode: "completa",
      },
    );

    expect(res.statusCode).toBe(404);
    expect(
      (await readConquerSteps(app, m.userId)).get("planche_press:e1"),
    ).toEqual(antes);
  });

  it("alumno con Conquer solo pedido: 409 CONQUER_NO_ACTIVO; socio sin fila: 404", async () => {
    const admin = await createConquerStaff(app, "admin");
    const pedido = await createTestMember(app);
    await insertConquerMember(app, pedido.id, { status: "pedido" });
    const sinFila = await createTestMember(app);
    const ids = await conquerExerciseIds(app);
    const payload = {
      rungId: await conquerRungId(app, "planche_press", "tuck"),
      mode: "completa",
    };

    const resPedido = await putFichaStepRaw(
      app,
      admin.token,
      pedido.id,
      ids.get("planche_press") ?? 0,
      "e1",
      payload,
    );
    const resSinFila = await putFichaStepRaw(
      app,
      admin.token,
      sinFila.id,
      ids.get("planche_press") ?? 0,
      "e1",
      payload,
    );

    expect(resPedido.statusCode).toBe(409);
    expect(resPedido.json<ConquerErrorBody>().code).toBe("CONQUER_NO_ACTIVO");
    expect(resSinFila.statusCode).toBe(404);
  });

  it.each(["coach", "recepcion"])(
    "el rol %s no puede corregir progresiones: 403 aun con un body inválido (T-201-36)",
    async (rol) => {
      const m = await escenario("novillo", 3);
      const ids = await conquerExerciseIds(app);
      const staff = await createConquerStaff(app, rol);
      const antes = (await readConquerSteps(app, m.userId)).get(
        "planche_press:e1",
      );

      const valido = await putFichaStepRaw(
        app,
        staff.token,
        m.userId,
        ids.get("planche_press") ?? 0,
        "e1",
        {
          rungId: await conquerRungId(app, "planche_press", "adv_tuck"),
          mode: "completa",
        },
      );
      const invalido = await putFichaStepRaw(
        app,
        staff.token,
        m.userId,
        ids.get("planche_press") ?? 0,
        "e1",
        {},
      );

      expect(valido.statusCode).toBe(403);
      expect(invalido.statusCode).toBe(403);
      expect(
        (await readConquerSteps(app, m.userId)).get("planche_press:e1"),
      ).toEqual(antes);
    },
  );

  it.each([
    ["sin rungId", { mode: "completa" }],
    ["modo desconocido", { rungId: 1, mode: "rapida" }],
  ])("body inválido (%s): 400", async (_caso, payload) => {
    const m = await escenario("novillo", 3);
    const ids = await conquerExerciseIds(app);

    const res = await putFichaStepRaw(
      app,
      m.admin.token,
      m.userId,
      ids.get("planche_press") ?? 0,
      "e1",
      payload,
    );

    expect(res.statusCode).toBe(400);
  });

  it("un step fuera de e1/e2/e3/hold: 400", async () => {
    const m = await escenario("novillo", 3);
    const ids = await conquerExerciseIds(app);

    const res = await putFichaStepRaw(
      app,
      m.admin.token,
      m.userId,
      ids.get("planche_press") ?? 0,
      "e9",
      {
        rungId: await conquerRungId(app, "planche_press", "tuck"),
        mode: "completa",
      },
    );

    expect(res.statusCode).toBe(400);
  });
});
