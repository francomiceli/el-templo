/**
 * Fase 201 Plan 11 (S12-6, §2.2, A13, A14, D-08, T-201-36..38): el coach confirma
 * el paso de nivel con un toque.
 *
 *   - POST /api/admin/conquer/members/:userId/level-up
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
  createActiveConquerMember,
  createConquerStaff,
  insertConquerAlert,
  insertConquerMember,
  memberToday,
  patchConquerStep,
  postLevelUpRaw,
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

async function memberRow(userId: number) {
  const [row] = await app.db
    .select()
    .from(schema.conquerMembers)
    .where(
      and(
        tenantWhere(schema.conquerMembers, TEMPLO_CTX),
        eq(schema.conquerMembers.userId, userId),
      ),
    );
  return row;
}

async function escenario(
  level: "ternero" | "novillo" | "toro",
  daysCount: number,
) {
  const member = await createActiveConquerMember(app, { level, daysCount });
  const admin = await createConquerStaff(app, "admin");
  return { ...member, admin };
}

/** Alerta verde `paso_nivel` abierta, como la deja el guardado de la 4ª semana. */
async function alertaPasoNivel(userId: number, desde: string): Promise<number> {
  return insertConquerAlert(app, {
    userId,
    type: "paso_nivel",
    dedupeKey: `paso_nivel:novillo:${desde}`,
    detail: { from: "novillo", to: "toro", weeks: 4 },
  });
}

describe("POST /api/admin/conquer/members/:userId/level-up (§2.2, A13)", () => {
  it("Novillo 3 días -> Toro con 4: nivel, días y level_since nuevos, alerta resuelta por el admin y progresiones intactas", async () => {
    const m = await escenario("novillo", 3);
    const hoy = await memberToday(app, m.userId);
    const alertId = await alertaPasoNivel(m.userId, hoy);
    // Una progresión ya trabajada: el paso de nivel NO la puede reiniciar (A13).
    await patchConquerStep(app, m.userId, "planche_press", "e1", {
      rungCode: "adv_tuck",
      calibration: "resuelta",
      sinceDate: hoy,
    });
    const antes = await readConquerSteps(app, m.userId);
    // Front lever hold solo está en la plantilla de 4 días: nace con el paso de nivel.
    expect(antes.has("front_hold:e1")).toBe(false);

    const res = await postLevelUpRaw(app, m.admin.token, m.userId, {
      daysCount: 4,
    });

    expect(res.statusCode, res.body).toBe(200);
    const ficha = res.json<FichaBody>();
    expect(ficha.member).toMatchObject({
      level: "toro",
      daysCount: 4,
      levelSince: hoy,
    });
    expect(ficha.levelUp).toEqual({ to: null, validDays: [] });
    const fila = await memberRow(m.userId);
    expect(fila?.level).toBe("toro");
    expect(fila?.daysCount).toBe(4);
    expect(fila?.levelSince).toBe(hoy);

    const alerta = (await readConquerAlerts(app, m.userId)).find(
      (a) => a.id === alertId,
    );
    expect(alerta?.status).toBe("resuelta");
    expect(alerta?.resolvedBy).toBe(m.admin.id);
    expect(ficha.alerts.some((a) => a.id === alertId)).toBe(false);

    const despues = await readConquerSteps(app, m.userId);
    // Toro con 4 días: 12 ejercicios x 4 escalones.
    expect(despues.size).toBe(48);
    expect(antes.size).toBeLessThan(despues.size);
    for (const [clave, previo] of antes) {
      expect(despues.get(clave), clave).toEqual(previo);
    }
    expect(despues.get("planche_press:e1")?.rungCode).toBe("adv_tuck");
    expect(despues.get("planche_press:e1")?.calibration).toBe("resuelta");
    // Los escalones nuevos nacen con el arranque de Toro (offset 0, D-14).
    expect(despues.get("front_hold:e1")?.rungCode).toBe("full");
  });

  it.each([
    ["ternero", 2, "novillo", 3],
    ["ternero", 3, "novillo", 4],
  ] as const)(
    "%s con %i días pasa a %s con %i días válidos",
    async (level, dias, nivelNuevo, diasNuevos) => {
      const m = await escenario(level, dias);

      const res = await postLevelUpRaw(app, m.admin.token, m.userId, {
        daysCount: diasNuevos,
      });

      expect(res.statusCode, res.body).toBe(200);
      const ficha = res.json<FichaBody>();
      expect(ficha.member.level).toBe(nivelNuevo);
      expect(ficha.member.daysCount).toBe(diasNuevos);
      expect(ficha.levelUp).toEqual({ to: "toro", validDays: [4] });
    },
  );

  it.each([
    ["novillo", 3, 3],
    ["novillo", 3, 5],
    ["ternero", 2, 2],
    ["ternero", 2, 5],
  ] as const)(
    "%s con %i días no puede pasar con %i días (A14): 400 CONQUER_DIAS_INVALIDOS y no cambia nada",
    async (level, dias, pedidos) => {
      const m = await escenario(level, dias);
      const hoy = await memberToday(app, m.userId);
      const alertId = await alertaPasoNivel(m.userId, hoy);

      const res = await postLevelUpRaw(app, m.admin.token, m.userId, {
        daysCount: pedidos,
      });

      expect(res.statusCode).toBe(400);
      expect(res.json<ConquerErrorBody>().code).toBe("CONQUER_DIAS_INVALIDOS");
      const fila = await memberRow(m.userId);
      expect(fila?.level).toBe(level);
      expect(fila?.daysCount).toBe(dias);
      const alerta = (await readConquerAlerts(app, m.userId)).find(
        (a) => a.id === alertId,
      );
      expect(alerta?.status).toBe("abierta");
    },
  );

  it.each([3, 4])(
    "Toro (%i días) no tiene nivel siguiente: 409 CONQUER_NIVEL_MAXIMO",
    async (pedidos) => {
      const m = await escenario("toro", 4);

      const res = await postLevelUpRaw(app, m.admin.token, m.userId, {
        daysCount: pedidos,
      });

      expect(res.statusCode).toBe(409);
      expect(res.json<ConquerErrorBody>().code).toBe("CONQUER_NIVEL_MAXIMO");
      expect((await memberRow(m.userId))?.level).toBe("toro");
    },
  );

  it("solo se resuelven las alertas paso_nivel de ESE alumno: la molestia y las ajenas quedan abiertas", async () => {
    const m = await escenario("novillo", 3);
    const otro = await escenario("novillo", 3);
    const hoy = await memberToday(app, m.userId);
    const propiaPaso = await alertaPasoNivel(m.userId, hoy);
    const propiaMolestia = await insertConquerAlert(app, {
      userId: m.userId,
      type: "molestia",
      dedupeKey: "molestia:level-up:a",
    });
    const ajenaPaso = await alertaPasoNivel(otro.userId, hoy);

    const res = await postLevelUpRaw(app, m.admin.token, m.userId, {
      daysCount: 4,
    });

    expect(res.statusCode, res.body).toBe(200);
    const propias = await readConquerAlerts(app, m.userId);
    expect(propias.find((a) => a.id === propiaPaso)?.status).toBe("resuelta");
    expect(propias.find((a) => a.id === propiaMolestia)?.status).toBe(
      "abierta",
    );
    const ajenas = await readConquerAlerts(app, otro.userId);
    expect(ajenas.find((a) => a.id === ajenaPaso)?.status).toBe("abierta");
    expect((await memberRow(otro.userId))?.level).toBe("novillo");
  });

  it("la alerta resuelta por el coach lleva resolved_by (nunca NULL, que significa auto-resuelta)", async () => {
    const m = await escenario("novillo", 3);
    const hoy = await memberToday(app, m.userId);
    const alertId = await alertaPasoNivel(m.userId, hoy);

    await postLevelUpRaw(app, m.admin.token, m.userId, { daysCount: 4 });

    const alerta = (await readConquerAlerts(app, m.userId)).find(
      (a) => a.id === alertId,
    );
    expect(alerta?.resolvedBy).not.toBeNull();
    expect(alerta?.resolvedAt).not.toBeNull();
  });

  it.each([
    ["sin daysCount", {}],
    ["daysCount no entero", { daysCount: "cuatro" }],
  ])("body inválido (%s): 400", async (_caso, payload) => {
    const m = await escenario("novillo", 3);

    const res = await postLevelUpRaw(app, m.admin.token, m.userId, payload);

    expect(res.statusCode).toBe(400);
    expect((await memberRow(m.userId))?.level).toBe("novillo");
  });

  it.each(["coach", "recepcion", "coach_actividad"])(
    "el rol %s no puede confirmar el paso de nivel: 403 (T-201-36)",
    async (rol) => {
      const m = await escenario("novillo", 3);
      const staff = await createConquerStaff(app, rol);

      const res = await postLevelUpRaw(app, staff.token, m.userId, {
        daysCount: 4,
      });

      expect(res.statusCode).toBe(403);
      expect((await memberRow(m.userId))?.level).toBe("novillo");
    },
  );

  it("un socio no puede subirse de nivel: 403; sin token: 401", async () => {
    const m = await escenario("novillo", 3);

    const socio = await postLevelUpRaw(app, m.token, m.userId, {
      daysCount: 4,
    });
    const anonimo = await postLevelUpRaw(app, undefined, m.userId, {
      daysCount: 4,
    });

    expect(socio.statusCode).toBe(403);
    expect(anonimo.statusCode).toBe(401);
    expect((await memberRow(m.userId))?.level).toBe("novillo");
  });

  it("el admin del gimnasio 2 no puede mover de nivel a un alumno del gimnasio 1: 404", async () => {
    await setModuleFlag(app, TENANT_DOS, "templo-training", true);
    const m = await escenario("novillo", 3);

    const res = await postLevelUpRaw(app, gym2.adminToken, m.userId, {
      daysCount: 4,
    });

    expect(res.statusCode).toBe(404);
    expect((await memberRow(m.userId))?.level).toBe("novillo");
  });

  it("alumno con Conquer solo pedido: 409 CONQUER_NO_ACTIVO; socio sin fila: 404", async () => {
    const admin = await createConquerStaff(app, "admin");
    const pedido = await createTestMember(app);
    await insertConquerMember(app, pedido.id, { status: "pedido" });
    const sinFila = await createTestMember(app);

    const resPedido = await postLevelUpRaw(app, admin.token, pedido.id, {
      daysCount: 4,
    });
    const resSinFila = await postLevelUpRaw(app, admin.token, sinFila.id, {
      daysCount: 4,
    });

    expect(resPedido.statusCode).toBe(409);
    expect(resPedido.json<ConquerErrorBody>().code).toBe("CONQUER_NO_ACTIVO");
    expect(resSinFila.statusCode).toBe(404);
  });
});
