/**
 * Fase 201 Plan 06 (S12-1, D-02, D-08, D-14, D-17, T-201-17..20): alta y edición
 * del alumno de Conquer por owner/admin.
 *
 *   - POST /api/admin/conquer/members
 *   - PUT  /api/admin/conquer/members/:userId
 *
 * Integración contra el MySQL de tests. Usuarios SIEMPRE con fábricas.
 * El catálogo (escaleras, plantillas) lo siembra la migración 0292: acá solo se
 * lee. Los parámetros `conquer.*` de `tenant_settings` se limpian en cada test.
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
import { and, eq, sql } from "drizzle-orm";
import * as schema from "../../src/db/schema";
import type { ConquerStartStep } from "../../src/db/schema/conquer";
import { resolveMemberTimezone } from "../../src/modules/conquer/member-service";
import { addDays, todayInTz } from "../../src/modules/shared/date-utils";
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
  activateViaApi,
  clearConquerSettings,
  CONQUER_MEMBERS_URL,
  createActiveConquerMember,
  createConquerStaff,
  readConquerSteps,
  TEMPLO_CTX,
} from "./_helpers";

const REQUESTS_COUNT_URL = "/api/admin/conquer/requests/count";
const UNLOCK_URL = "/api/members/conquer/unlock-request";
const STATE_URL = "/api/members/conquer/state";

interface MemberViewBody {
  userId: number;
  status: "pedido" | "activo";
  level: string | null;
  daysCount: number | null;
  incReps: number;
  incS: number;
  coachUserId: number | null;
  activatedAt: string | null;
  activationDate: string | null;
  levelSince: string | null;
  cutStage: number;
}

interface ErrorBody {
  error: string;
  code?: string;
}

let app: FastifyInstance;
let gym2: SegundoGimnasio;

const auth = (token: string) => ({ authorization: `Bearer ${token}` });
const memberUrl = (userId: number) => `${CONQUER_MEMBERS_URL}/${userId}`;

async function putMember(
  token: string,
  userId: number,
  payload: Record<string, unknown>,
) {
  return app.inject({
    method: "PUT",
    url: memberUrl(userId),
    headers: auth(token),
    payload,
  });
}

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

async function countMemberRows(userId: number): Promise<number> {
  const rows = await app.db
    .select({ id: schema.conquerMembers.id })
    .from(schema.conquerMembers)
    .where(
      and(
        tenantWhere(schema.conquerMembers, TEMPLO_CTX),
        eq(schema.conquerMembers.userId, userId),
      ),
    );
  return rows.length;
}

/** Id de usuario que no existe en ningún gimnasio (máximo + 1000). */
async function nonexistentUserId(): Promise<number> {
  const maxFor = async (tenantId: number): Promise<number> => {
    const [row] = await app.db
      .select({ max: sql<number>`COALESCE(MAX(${schema.users.id}), 0)` })
      .from(schema.users)
      .where(tenantWhere(schema.users, { tenantId }));
    return Number(row?.max ?? 0);
  };
  return (
    Math.max(await maxFor(TEMPLO_CTX.tenantId), await maxFor(TENANT_DOS)) + 1000
  );
}

beforeAll(async () => {
  app = await createTestApp();
});

beforeEach(async () => {
  await cleanAllTestData(app);
  await clearConquerSettings(app);
  gym2 = await seedSecondTenant(app);
});

afterEach(async () => {
  await clearModuleFlags(app, TENANT_DOS);
  await clearConquerSettings(app);
});

afterAll(async () => {
  await cleanAllTestData(app);
  await limpiarSegundoGimnasio(app);
  await app.close();
});

describe("POST /api/admin/conquer/members — escalones iniciales por nivel (anexo §3, 201-25)", () => {
  it("Toro 4 días: 48 escalones con la tabla de Toro y el contrato JSON del alta", async () => {
    const admin = await createConquerStaff(app, "admin");
    const socio = await createTestMember(app);

    const res = await activateViaApi(app, admin.token, socio.id, "toro", 4);

    expect(res.statusCode).toBe(201);
    expect(res.json<MemberViewBody>()).toEqual({
      userId: socio.id,
      status: "activo",
      level: "toro",
      daysCount: 4,
      incReps: 1,
      incS: 2,
      coachUserId: admin.id,
      activatedAt: expect.any(String),
      activationDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      levelSince: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      cutStage: 0,
    });
    const steps = await readConquerSteps(app, socio.id);
    expect(steps.size).toBe(48);
    expect(steps.get("planche_hold:e1")).toMatchObject({
      rungCode: "full",
      mode: "hold",
    });
    expect(steps.get("one_arm_archer:e2")).toMatchObject({
      rungCode: "one_arm",
      mode: "negativa",
    });
    expect(steps.get("hspu:hold")).toMatchObject({
      rungCode: "pike",
      mode: "hold",
    });
    for (const step of steps.values()) {
      expect(step.sinceDate).toBeNull();
      expect(step.calibration).toBe("pendiente");
    }
  });

  it("Novillo 3 días: 36 escalones con la tabla explícita del anexo (§3)", async () => {
    const admin = await createConquerStaff(app, "admin");
    const socio = await createTestMember(app);

    const res = await activateViaApi(app, admin.token, socio.id, "novillo", 3);

    expect(res.statusCode).toBe(201);
    const steps = await readConquerSteps(app, socio.id);
    expect(steps.size).toBe(36);
    expect(steps.get("planche_hold:e1")?.rungCode).toBe("half_lay");
    expect(steps.get("hspu:e1")?.rungCode).toBe("pared");
    // El modo sale de la tabla del nivel.
    expect(steps.get("planche_press:e2")?.mode).toBe("negativa");
  });

  // Estos escalones difieren del "Toro corrido N peldaños" que se construyó
  // primero: manda la tabla explícita del anexo (§3).
  it.each([
    // [escalón, peldaño, escalera, modo]
    ["front_hold:hold", "tuck", "front_hold", "hold"],
    ["planche_pushup:hold", "pseudo", "planche_pushup_hold", "hold"],
    ["press_90:hold", "tuck", "press_90_hold", "hold"],
    ["one_arm_archer:hold", "dominada", "one_arm_archer_hold", "hold"],
    ["one_arm_archer:e2", "oap_asistida", "trac", "negativa"],
  ])(
    "Novillo 3 días §3 del anexo: %s = %s en la escalera %s (%s)",
    async (stepKey, rungCode, ladderCode, mode) => {
      const admin = await createConquerStaff(app, "admin");
      const socio = await createTestMember(app);

      const res = await activateViaApi(
        app,
        admin.token,
        socio.id,
        "novillo",
        3,
      );

      expect(res.statusCode).toBe(201);
      const steps = await readConquerSteps(app, socio.id);
      expect(steps.get(stepKey)).toMatchObject({ rungCode, ladderCode, mode });
    },
  );

  it("Ternero 2 días: 24 escalones con la tabla explícita del anexo (§3)", async () => {
    const admin = await createConquerStaff(app, "admin");
    const socio = await createTestMember(app);

    const res = await activateViaApi(app, admin.token, socio.id, "ternero", 2);

    expect(res.statusCode).toBe(201);
    const steps = await readConquerSteps(app, socio.id);
    expect(steps.size).toBe(24);
    expect(steps.get("planche_hold:e1")?.rungCode).toBe("straddle");
    expect(steps.get("muscle_up:e1")?.rungCode).toBe("al_pecho");
  });

  it.each([
    ["front_hold:e3", "tuck", "front_hold", "hold"],
    ["one_arm_archer:e2", "archer", "trac", "negativa"],
    ["muscle_up:hold", "dominada", "muscle_up_hold", "hold"],
    ["planche_pushup:hold", "pseudo", "planche_pushup_hold", "hold"],
  ])(
    "Ternero 2 días §3 del anexo: %s = %s en la escalera %s (%s)",
    async (stepKey, rungCode, ladderCode, mode) => {
      const admin = await createConquerStaff(app, "admin");
      const socio = await createTestMember(app);

      await activateViaApi(app, admin.token, socio.id, "ternero", 2);

      const steps = await readConquerSteps(app, socio.id);
      expect(steps.get(stepKey)).toMatchObject({ rungCode, ladderCode, mode });
    },
  );

  it("Ternero 3 días §3 del anexo: los 4 escalones de Pull-ups en front lever arrancan en tuck de su escalera", async () => {
    const admin = await createConquerStaff(app, "admin");
    const socio = await createTestMember(app);

    const res = await activateViaApi(app, admin.token, socio.id, "ternero", 3);

    expect(res.statusCode).toBe(201);
    const steps = await readConquerSteps(app, socio.id);
    for (const step of ["e1", "e2", "e3", "hold"]) {
      expect(steps.get(`front_pullups:${step}`), step).toMatchObject({
        rungCode: "tuck",
        ladderCode: "front_pullups",
      });
    }
  });

  it("Toro 4 días: el hold de HSPU arranca en pike de hspu_hold y el de Planche hold en la escalera del ejercicio", async () => {
    const admin = await createConquerStaff(app, "admin");
    const socio = await createTestMember(app);

    await activateViaApi(app, admin.token, socio.id, "toro", 4);

    const steps = await readConquerSteps(app, socio.id);
    expect(steps.get("hspu:hold")).toMatchObject({
      rungCode: "pike",
      ladderCode: "hspu_hold",
    });
    expect(steps.get("hspu:e1")?.ladderCode).toBe("hspu");
    expect(steps.get("planche_hold:hold")).toMatchObject({
      rungCode: "tuck",
      ladderCode: "planche_hold",
    });
  });

  describe("tabla de arranque editable por ejercicio (201-25 DA-5)", () => {
    let original: ConquerStartStep[] | null = null;

    async function setPlancheHoldNovillo(
      value: ConquerStartStep[] | null,
    ): Promise<void> {
      await app.db
        .update(schema.conquerExercises)
        .set({ startStepsNovillo: value })
        .where(
          and(
            tenantWhere(schema.conquerExercises, TEMPLO_CTX),
            eq(schema.conquerExercises.code, "planche_hold"),
          ),
        );
    }

    beforeAll(async () => {
      const [row] = await app.db
        .select({ value: schema.conquerExercises.startStepsNovillo })
        .from(schema.conquerExercises)
        .where(
          and(
            tenantWhere(schema.conquerExercises, TEMPLO_CTX),
            eq(schema.conquerExercises.code, "planche_hold"),
          ),
        );
      original = row.value;
    });

    // El catálogo no se limpia entre tests: se restaura la tabla original.
    afterEach(async () => {
      await setPlancheHoldNovillo(original);
    });

    it("activar un Novillo usa la tabla start_steps_novillo del ejercicio, aunque se la edite", async () => {
      await setPlancheHoldNovillo([
        { step: "e1", rung: "straddle", mode: "hold" },
        { step: "e2", rung: "straddle", mode: "hold" },
        { step: "e3", rung: "tuck", mode: "hold" },
        { step: "hold", rung: "lean", mode: "hold" },
      ]);
      const admin = await createConquerStaff(app, "admin");
      const socio = await createTestMember(app);

      const res = await activateViaApi(
        app,
        admin.token,
        socio.id,
        "novillo",
        3,
      );

      expect(res.statusCode).toBe(201);
      const steps = await readConquerSteps(app, socio.id);
      expect(steps.get("planche_hold:e1")?.rungCode).toBe("straddle");
      expect(steps.get("planche_hold:e3")?.rungCode).toBe("tuck");
    });

    it("con start_steps_novillo NULL el ejercicio arranca con la tabla de Toro", async () => {
      await setPlancheHoldNovillo(null);
      const admin = await createConquerStaff(app, "admin");
      const socio = await createTestMember(app);

      const res = await activateViaApi(
        app,
        admin.token,
        socio.id,
        "novillo",
        3,
      );

      expect(res.statusCode).toBe(201);
      const steps = await readConquerSteps(app, socio.id);
      // Toro: full, straddle, adv_tuck y tuck de hold.
      expect(steps.get("planche_hold:e1")?.rungCode).toBe("full");
      expect(steps.get("planche_hold:hold")?.rungCode).toBe("tuck");
      // Los otros ejercicios siguen con su tabla de Novillo.
      expect(steps.get("hspu:e1")?.rungCode).toBe("pared");
    });
  });

  it("un alumno sin plan del Templo se activa igual (D-17)", async () => {
    const admin = await createConquerStaff(app, "admin");
    const socio = await createTestMember(app);
    const suscripciones = await app.db
      .select({ id: schema.subscriptions.id })
      .from(schema.subscriptions)
      .where(
        and(
          tenantWhere(schema.subscriptions, TEMPLO_CTX),
          eq(schema.subscriptions.userId, socio.id),
        ),
      );
    expect(suscripciones).toEqual([]);

    const res = await activateViaApi(app, admin.token, socio.id, "toro", 4);

    expect(res.statusCode).toBe(201);
    expect(res.json<MemberViewBody>().status).toBe("activo");
  });
});

describe("POST /api/admin/conquer/members — pedidos, duplicados y coach", () => {
  it("activar a un socio con pedido lo saca de la lista de pedidos (D-12)", async () => {
    const admin = await createConquerStaff(app, "admin");
    const socio = await createTestMember(app);
    const pedido = await app.inject({
      method: "POST",
      url: UNLOCK_URL,
      headers: auth(socio.token),
    });
    expect(pedido.json<{ status: string }>().status).toBe("pedido");
    const antes = await app.inject({
      method: "GET",
      url: REQUESTS_COUNT_URL,
      headers: auth(admin.token),
    });
    expect(antes.json()).toEqual({ count: 1 });

    const res = await activateViaApi(app, admin.token, socio.id, "novillo", 4);

    expect(res.statusCode).toBe(201);
    expect(res.json<MemberViewBody>().status).toBe("activo");
    const despues = await app.inject({
      method: "GET",
      url: REQUESTS_COUNT_URL,
      headers: auth(admin.token),
    });
    expect(despues.json()).toEqual({ count: 0 });
    // Misma fila (el pedido se actualiza, no se duplica) y el alumno la ve activa.
    expect(await countMemberRows(socio.id)).toBe(1);
    const estado = await app.inject({
      method: "GET",
      url: STATE_URL,
      headers: auth(socio.token),
    });
    expect(estado.json<{ status: string }>().status).toBe("activo");
  });

  it("la segunda activación responde 409 CONQUER_YA_ACTIVO y no toca nada", async () => {
    const admin = await createConquerStaff(app, "admin");
    const socio = await createTestMember(app);
    const primera = await activateViaApi(app, admin.token, socio.id, "toro", 4);
    expect(primera.statusCode).toBe(201);

    const segunda = await activateViaApi(
      app,
      admin.token,
      socio.id,
      "ternero",
      2,
    );

    expect(segunda.statusCode).toBe(409);
    expect(segunda.json<ErrorBody>().code).toBe("CONQUER_YA_ACTIVO");
    const fila = await memberRow(socio.id);
    expect(fila.level).toBe("toro");
    expect(fila.daysCount).toBe(4);
    expect((await readConquerSteps(app, socio.id)).size).toBe(48);
  });

  it("dos altas simultáneas: una gana (201) y la otra recibe 409, nunca 500", async () => {
    const admin = await createConquerStaff(app, "admin");
    const socio = await createTestMember(app);

    const [a, b] = await Promise.all([
      activateViaApi(app, admin.token, socio.id, "toro", 4),
      activateViaApi(app, admin.token, socio.id, "toro", 4),
    ]);

    expect([a.statusCode, b.statusCode].sort()).toEqual([201, 409]);
    expect(await countMemberRows(socio.id)).toBe(1);
    expect((await readConquerSteps(app, socio.id)).size).toBe(48);
  });

  it.each([
    { level: "toro", daysCount: 3 },
    { level: "ternero", daysCount: 4 },
    { level: "novillo", daysCount: 2 },
    { level: "toro", daysCount: 5 },
  ])(
    "$level con $daysCount días es una combinación inválida: 400 y no crea nada",
    async ({ level, daysCount }) => {
      const admin = await createConquerStaff(app, "admin");
      const socio = await createTestMember(app);

      const res = await app.inject({
        method: "POST",
        url: CONQUER_MEMBERS_URL,
        headers: auth(admin.token),
        payload: { userId: socio.id, level, daysCount },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json<ErrorBody>().code).toBe("CONQUER_DIAS_INVALIDOS");
      expect(await countMemberRows(socio.id)).toBe(0);
    },
  );

  it.each([
    { nombre: "sin nivel", extra: { daysCount: 4 } },
    { nombre: "nivel desconocido", extra: { level: "dios", daysCount: 4 } },
    {
      nombre: "días como texto",
      extra: { level: "toro", daysCount: "cuatro" },
    },
    { nombre: "sin días", extra: { level: "toro" } },
  ])("validación del body ($nombre): 400", async ({ extra }) => {
    const admin = await createConquerStaff(app, "admin");
    const socio = await createTestMember(app);

    const res = await app.inject({
      method: "POST",
      url: CONQUER_MEMBERS_URL,
      headers: auth(admin.token),
      payload: { userId: socio.id, ...extra },
    });

    expect(res.statusCode).toBe(400);
    expect(await countMemberRows(socio.id)).toBe(0);
  });

  it("sin userId en el body: 400", async () => {
    const admin = await createConquerStaff(app, "admin");

    const res = await app.inject({
      method: "POST",
      url: CONQUER_MEMBERS_URL,
      headers: auth(admin.token),
      payload: { level: "toro", daysCount: 4 },
    });

    expect(res.statusCode).toBe(400);
  });

  it.each(["socio del gimnasio 2", "usuario staff", "id inexistente"])(
    "destino inválido (%s): 404 CONQUER_SOCIO_NO_ENCONTRADO",
    async (caso) => {
      const admin = await createConquerStaff(app, "admin");
      const staff = await createConquerStaff(app, "coach");
      const destino =
        caso === "socio del gimnasio 2"
          ? gym2.socios[0].id
          : caso === "usuario staff"
            ? staff.id
            : await nonexistentUserId();

      const res = await activateViaApi(app, admin.token, destino, "toro", 4);

      expect(res.statusCode).toBe(404);
      expect(res.json<ErrorBody>().code).toBe("CONQUER_SOCIO_NO_ENCONTRADO");
      expect(await countMemberRows(destino)).toBe(0);
    },
  );

  it("el admin del gimnasio 2 no puede activar a un socio del gimnasio 1: 404", async () => {
    await setModuleFlag(app, TENANT_DOS, "templo-training", true);
    const socio1 = await createTestMember(app);

    const res = await activateViaApi(
      app,
      gym2.adminToken,
      socio1.id,
      "toro",
      4,
    );

    expect(res.statusCode).toBe(404);
    expect(await countMemberRows(socio1.id)).toBe(0);
  });

  it("el coach por defecto es el admin que activa (D-08)", async () => {
    const admin = await createConquerStaff(app, "admin");
    const socio = await createTestMember(app);

    const res = await activateViaApi(app, admin.token, socio.id, "toro", 4);

    expect(res.json<MemberViewBody>().coachUserId).toBe(admin.id);
    expect((await memberRow(socio.id)).coachUserId).toBe(admin.id);
    expect((await memberRow(socio.id)).activatedBy).toBe(admin.id);
  });

  it("se puede elegir otro coach del gimnasio, o ninguno (null)", async () => {
    const admin = await createConquerStaff(app, "admin");
    const coach = await createConquerStaff(app, "coach");
    const socioA = await createTestMember(app);
    const socioB = await createTestMember(app);

    const conCoach = await activateViaApi(
      app,
      admin.token,
      socioA.id,
      "toro",
      4,
      { coachUserId: coach.id },
    );
    const sinCoach = await activateViaApi(
      app,
      admin.token,
      socioB.id,
      "toro",
      4,
      { coachUserId: null },
    );

    expect(conCoach.json<MemberViewBody>().coachUserId).toBe(coach.id);
    expect(sinCoach.json<MemberViewBody>().coachUserId).toBeNull();
  });

  it.each(["coach del gimnasio 2", "un socio como coach", "id inexistente"])(
    "coach inválido (%s): 400 CONQUER_COACH_INVALIDO y no crea nada",
    async (caso) => {
      const admin = await createConquerStaff(app, "admin");
      const socio = await createTestMember(app);
      const otroSocio = await createTestMember(app);
      const coachUserId =
        caso === "coach del gimnasio 2"
          ? gym2.coachId
          : caso === "un socio como coach"
            ? otroSocio.id
            : await nonexistentUserId();

      const res = await activateViaApi(app, admin.token, socio.id, "toro", 4, {
        coachUserId,
      });

      expect(res.statusCode).toBe(400);
      expect(res.json<ErrorBody>().code).toBe("CONQUER_COACH_INVALIDO");
      expect(await countMemberRows(socio.id)).toBe(0);
    },
  );

  it.each(["coach", "recepcion"])(
    "el rol %s no puede activar: 403 (T-201-17)",
    async (rol) => {
      const staff = await createConquerStaff(app, rol);
      const socio = await createTestMember(app);

      const res = await activateViaApi(app, staff.token, socio.id, "toro", 4);

      expect(res.statusCode).toBe(403);
      expect(await countMemberRows(socio.id)).toBe(0);
    },
  );

  it("un socio no puede activarse a sí mismo: 403", async () => {
    const socio = await createTestMember(app);

    const res = await activateViaApi(app, socio.token, socio.id, "toro", 4);

    expect(res.statusCode).toBe(403);
    expect(await countMemberRows(socio.id)).toBe(0);
  });

  it("sin token: 401", async () => {
    const socio = await createTestMember(app);
    const res = await app.inject({
      method: "POST",
      url: CONQUER_MEMBERS_URL,
      payload: { userId: socio.id, level: "toro", daysCount: 4 },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe("PUT /api/admin/conquer/members/:userId", () => {
  it("Novillo 3 a 4 días crea solo los escalones nuevos y no toca los compartidos", async () => {
    const m = await createActiveConquerMember(app, {
      level: "novillo",
      daysCount: 3,
    });
    const antes = await readConquerSteps(app, m.userId);
    expect(antes.size).toBe(36);
    // El alumno ya progresó: planche_hold e1 dejó de ser el escalón inicial.
    await tamperStep(m.userId, "planche_hold", "e1", "tuck");
    const tampered = await readConquerSteps(app, m.userId);
    expect(tampered.get("planche_hold:e1")?.rungCode).toBe("tuck");

    const res = await putMember(m.adminToken, m.userId, { daysCount: 4 });

    expect(res.statusCode).toBe(200);
    expect(res.json<MemberViewBody>().daysCount).toBe(4);
    const despues = await readConquerSteps(app, m.userId);
    expect(despues.size).toBe(48);
    // Compartidos: idénticos (rung_id incluido).
    for (const [key, step] of tampered) {
      expect(despues.get(key), key).toEqual(step);
    }
    // Nuevos: arrancan con el offset de Novillo (1 peldaño más fácil que Toro).
    expect(despues.get("front_raises:e1")?.rungCode).toBe("super_adv_tuck");
    expect(despues.get("lsit_plancha:e1")?.rungCode).toBe("a_lean");
    expect(despues.get("fondo_pelicano:e1")?.rungCode).toBe(
      "supinado_profundo",
    );
  });

  it("bajar los días no borra escalones (el progreso sobrevive)", async () => {
    const m = await createActiveConquerMember(app, {
      level: "novillo",
      daysCount: 4,
    });

    const res = await putMember(m.adminToken, m.userId, { daysCount: 3 });

    expect(res.statusCode).toBe(200);
    expect((await readConquerSteps(app, m.userId)).size).toBe(48);
  });

  it("incReps 2 e incS 4 se guardan y el alumno los ve en su estado (§4.2)", async () => {
    const m = await createActiveConquerMember(app, {
      level: "toro",
      daysCount: 4,
    });

    const res = await putMember(m.adminToken, m.userId, {
      incReps: 2,
      incS: 4,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json<MemberViewBody>()).toMatchObject({ incReps: 2, incS: 4 });
    const fila = await memberRow(m.userId);
    expect(fila.incReps).toBe(2);
    expect(fila.incS).toBe(4);
    const estado = await app.inject({
      method: "GET",
      url: STATE_URL,
      headers: auth(m.token),
    });
    expect(
      estado.json<{ member: { incReps: number; incS: number } }>().member,
    ).toMatchObject({ incReps: 2, incS: 4 });
  });

  it.each([
    { campo: "incReps", valor: 0 },
    { campo: "incReps", valor: 4 },
    { campo: "incS", valor: 0 },
    { campo: "incS", valor: 7 },
    { campo: "incS", valor: 9 },
  ])("$campo = $valor está fuera de rango: 400 (T-201-20)", async (caso) => {
    const m = await createActiveConquerMember(app, {
      level: "toro",
      daysCount: 4,
    });

    const res = await putMember(m.adminToken, m.userId, {
      [caso.campo]: caso.valor,
    });

    expect(res.statusCode).toBe(400);
    const fila = await memberRow(m.userId);
    expect(fila.incReps).toBe(1);
    expect(fila.incS).toBe(2);
  });

  it("el cuerpo vacío es 400 (minProperties)", async () => {
    const m = await createActiveConquerMember(app, {
      level: "toro",
      daysCount: 4,
    });

    const res = await putMember(m.adminToken, m.userId, {});

    expect(res.statusCode).toBe(400);
  });

  it("pasar a Toro con 3 días es una combinación inválida: 400 y nada cambia", async () => {
    const m = await createActiveConquerMember(app, {
      level: "novillo",
      daysCount: 3,
    });

    const res = await putMember(m.adminToken, m.userId, { level: "toro" });

    expect(res.statusCode).toBe(400);
    expect(res.json<ErrorBody>().code).toBe("CONQUER_DIAS_INVALIDOS");
    const fila = await memberRow(m.userId);
    expect(fila.level).toBe("novillo");
    expect(fila.daysCount).toBe(3);
  });

  it("cambiar el nivel reinicia level_since a hoy y NO toca los escalones", async () => {
    const m = await createActiveConquerMember(app, {
      level: "novillo",
      daysCount: 4,
    });
    const hoy = todayInTz(
      await resolveMemberTimezone(app.db, TEMPLO_CTX, m.userId),
    );
    const vieja = addDays(hoy, -20);
    await app.db
      .update(schema.conquerMembers)
      .set({ levelSince: vieja })
      .where(
        and(
          tenantWhere(schema.conquerMembers, TEMPLO_CTX),
          eq(schema.conquerMembers.userId, m.userId),
        ),
      );
    const antes = await readConquerSteps(app, m.userId);

    const soloIncremento = await putMember(m.adminToken, m.userId, {
      incReps: 3,
    });
    expect(soloIncremento.json<MemberViewBody>().levelSince).toBe(vieja);

    const res = await putMember(m.adminToken, m.userId, { level: "toro" });

    expect(res.statusCode).toBe(200);
    expect(res.json<MemberViewBody>()).toMatchObject({
      level: "toro",
      levelSince: hoy,
    });
    expect(await readConquerSteps(app, m.userId)).toEqual(antes);
  });

  it("se puede cambiar el coach, y sacarlo con null", async () => {
    const m = await createActiveConquerMember(app, {
      level: "toro",
      daysCount: 4,
    });
    const coach = await createConquerStaff(app, "coach");

    const cambia = await putMember(m.adminToken, m.userId, {
      coachUserId: coach.id,
    });
    const saca = await putMember(m.adminToken, m.userId, { coachUserId: null });

    expect(cambia.json<MemberViewBody>().coachUserId).toBe(coach.id);
    expect(saca.json<MemberViewBody>().coachUserId).toBeNull();
  });

  it("un coach del gimnasio 2 es 400 CONQUER_COACH_INVALIDO", async () => {
    const m = await createActiveConquerMember(app, {
      level: "toro",
      daysCount: 4,
    });

    const res = await putMember(m.adminToken, m.userId, {
      coachUserId: gym2.coachId,
    });

    expect(res.statusCode).toBe(400);
    expect(res.json<ErrorBody>().code).toBe("CONQUER_COACH_INVALIDO");
  });

  it("sobre un pedido: 409 CONQUER_NO_ACTIVO", async () => {
    const admin = await createConquerStaff(app, "admin");
    const socio = await createTestMember(app);
    await app.inject({
      method: "POST",
      url: UNLOCK_URL,
      headers: auth(socio.token),
    });

    const res = await putMember(admin.token, socio.id, { incReps: 2 });

    expect(res.statusCode).toBe(409);
    expect(res.json<ErrorBody>().code).toBe("CONQUER_NO_ACTIVO");
    expect((await memberRow(socio.id)).incReps).toBe(1);
  });

  it.each(["socio sin fila de Conquer", "usuario staff", "id inexistente"])(
    "destino sin Conquer (%s): 404",
    async (caso) => {
      const admin = await createConquerStaff(app, "admin");
      const socio = await createTestMember(app);
      const staff = await createConquerStaff(app, "coach");
      const destino =
        caso === "socio sin fila de Conquer"
          ? socio.id
          : caso === "usuario staff"
            ? staff.id
            : await nonexistentUserId();

      const res = await putMember(admin.token, destino, { incReps: 2 });

      expect(res.statusCode).toBe(404);
    },
  );

  it("el admin del gimnasio 2 no ve ni edita a un alumno del gimnasio 1: 404", async () => {
    await setModuleFlag(app, TENANT_DOS, "templo-training", true);
    const m = await createActiveConquerMember(app, {
      level: "toro",
      daysCount: 4,
    });

    const res = await putMember(gym2.adminToken, m.userId, { incReps: 3 });

    expect(res.statusCode).toBe(404);
    expect((await memberRow(m.userId)).incReps).toBe(1);
  });

  it("el rol coach no puede editar: 403 aun con un body inválido (onRequest, T-201-17)", async () => {
    const m = await createActiveConquerMember(app, {
      level: "toro",
      daysCount: 4,
    });
    const coach = await createConquerStaff(app, "coach");

    const valido = await putMember(coach.token, m.userId, { incReps: 2 });
    const invalido = await putMember(coach.token, m.userId, { incReps: 99 });

    expect(valido.statusCode).toBe(403);
    expect(invalido.statusCode).toBe(403);
    expect((await memberRow(m.userId)).incReps).toBe(1);
  });

  it("un socio no puede editarse: 403; sin token: 401", async () => {
    const m = await createActiveConquerMember(app, {
      level: "toro",
      daysCount: 4,
    });

    const socio = await putMember(m.token, m.userId, { incReps: 2 });
    const anonimo = await app.inject({
      method: "PUT",
      url: memberUrl(m.userId),
      payload: { incReps: 2 },
    });

    expect(socio.statusCode).toBe(403);
    expect(anonimo.statusCode).toBe(401);
  });
});

/**
 * Simula progreso: apunta el escalón `exerciseCode:step` del alumno al peldaño
 * `rungCode` de SU escalera (consulta directa con tenant).
 */
async function tamperStep(
  userId: number,
  exerciseCode: string,
  step: "e1" | "e2" | "e3" | "hold",
  rungCode: string,
): Promise<void> {
  const [exercise] = await app.db
    .select({
      id: schema.conquerExercises.id,
      ladderId: schema.conquerExercises.ladderId,
    })
    .from(schema.conquerExercises)
    .where(
      and(
        tenantWhere(schema.conquerExercises, TEMPLO_CTX),
        eq(schema.conquerExercises.code, exerciseCode),
      ),
    );
  const [rung] = await app.db
    .select({ id: schema.conquerRungs.id })
    .from(schema.conquerRungs)
    .where(
      and(
        tenantWhere(schema.conquerRungs, TEMPLO_CTX),
        eq(schema.conquerRungs.ladderId, exercise.ladderId),
        eq(schema.conquerRungs.code, rungCode),
      ),
    );
  const member = await memberRow(userId);
  await app.db
    .update(schema.conquerSteps)
    .set({ rungId: rung.id })
    .where(
      and(
        tenantWhere(schema.conquerSteps, TEMPLO_CTX),
        eq(schema.conquerSteps.memberId, member.id),
        eq(schema.conquerSteps.exerciseId, exercise.id),
        eq(schema.conquerSteps.step, step),
      ),
    );
}
