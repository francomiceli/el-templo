/**
 * Fase 215 (ajustes, plan C; ME-06) — regalos de cada profe por semana:
 *   GET /api/admin/aura/gifts/by-coach?branchId&weeksBack
 *
 * Los regalos se siembran por SQL (`seedGift`): este test mide la lectura. Fechas
 * relativas al día local de la sede (nada fijo) y personas por fábrica (ningún id
 * de `users` hardcodeado). Corre en CI.
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterAll,
  afterEach,
} from "vitest";
import type { FastifyInstance } from "fastify";
import {
  createTestApp,
  cleanAllTestData,
  createStaffUser,
  getAuthToken,
} from "../helpers";
import {
  addDays,
  DEFAULT_TENANT_TIMEZONE,
  todayInTz,
} from "../../src/modules/shared/date-utils";
import { giftWeekRange } from "../../src/modules/aura/gift-rules";
import {
  TENANT_DOS,
  limpiarSegundoGimnasio,
  seedSecondTenant,
  type SegundoGimnasio,
} from "../fixtures/second-tenant";
import {
  clearModuleFlags,
  restoreTemploFlags,
  setModuleFlag,
} from "../fixtures/module-flags";
import {
  cleanupGiftClasses,
  seedGift,
  seedGiftClass,
  seedMember,
  type GiftClass,
} from "./_gift-fixtures";

const STAFF_PASSWORD = "staff-pass-215";
const ADMIN_EMAIL = "admin@test.com";
const ADMIN_PASSWORD = "adminpass123";

interface CoachRow {
  userId: number;
  name: string;
  gifts: number;
}

interface ByCoachBody {
  weekStart: string;
  weekEnd: string;
  total: number;
  coaches: CoachRow[];
}

interface ErrorBody {
  error: string;
  message: string;
  code?: string;
}

interface StaffUser {
  id: number;
  token: string;
  fullName: string;
}

let staffSeq = 0;

describe("Fase 215 ajustes (plan C): regalos por profe y por semana", () => {
  let app: FastifyInstance;
  let gym2: SegundoGimnasio;
  let cls: GiftClass;
  const extraClasses: GiftClass[] = [];
  let adminToken: string;

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    gym2 = await seedSecondTenant(app);
    cls = await seedGiftClass(app);
    adminToken = await getAuthToken(app, ADMIN_EMAIL, ADMIN_PASSWORD);
  });

  afterEach(async () => {
    await clearModuleFlags(app, TENANT_DOS);
  });

  afterAll(async () => {
    await restoreTemploFlags(app);
    await cleanAllTestData(app);
    await limpiarSegundoGimnasio(app);
    await cleanupGiftClasses(app, extraClasses);
    await app.close();
  });

  // ── Siembra ────────────────────────────────────────────────────────────────

  /** Empleado de la sede indicada, ya autenticado. */
  async function staff(role: string, branchId: number): Promise<StaffUser> {
    staffSeq += 1;
    const email = `staff-215-bycoach-${role}-${staffSeq}-${Date.now().toString(36)}@test.com`;
    const lastName = `Porprofe${staffSeq}`;
    const id = await createStaffUser(app, {
      email,
      password: STAFF_PASSWORD,
      firstName: "Prof",
      lastName,
      role,
      branchId,
    });
    const token = await getAuthToken(app, email, STAFF_PASSWORD);
    return { id, token, fullName: `Prof ${lastName}` };
  }

  async function otraClase(
    opts: Parameters<typeof seedGiftClass>[1] = {},
  ): Promise<GiftClass> {
    const nueva = await seedGiftClass(app, opts);
    extraClasses.push(nueva);
    return nueva;
  }

  async function alumno(clase: GiftClass = cls) {
    return seedMember(app, { branchId: clase.branchId, status: "activo" });
  }

  /** Regalo de un profe a un alumno nuevo en la fecha indicada. */
  async function regaloDeProfe(
    coach: StaffUser,
    sessionDate: string,
    clase: GiftClass = cls,
    status: "vigente" | "anulado" = "vigente",
  ): Promise<number> {
    const receptor = await alumno(clase);
    return seedGift(app, {
      giverUserId: coach.id,
      receiverUserId: receptor.id,
      giverKind: "profe",
      branchId: clase.branchId,
      scheduleId: clase.scheduleId,
      sessionDate,
      status,
      voidCause: status === "anulado" ? "staff" : undefined,
    });
  }

  // ── Pedido ─────────────────────────────────────────────────────────────────

  async function porProfe(
    token: string,
    query: Record<string, string | number> = {},
  ): Promise<{ statusCode: number; body: ByCoachBody & ErrorBody }> {
    const qs = new URLSearchParams(
      Object.entries(query).map(([k, v]) => [k, String(v)]),
    ).toString();
    const res = await app.inject({
      method: "GET",
      url: `/api/admin/aura/gifts/by-coach${qs ? `?${qs}` : ""}`,
      headers: { authorization: `Bearer ${token}` },
    });
    return {
      statusCode: res.statusCode,
      body: res.json() as ByCoachBody & ErrorBody,
    };
  }

  // ── 1. el conteo ──────────────────────────────────────────────────────────

  describe("conteo (ME-06)", () => {
    it("(1) cuenta por profe los regalos vigentes de la semana, del que más dio al que menos, con el total", async () => {
      const semana = giftWeekRange(cls.today).start;
      const ana = await staff("coach", cls.branchId);
      const beto = await staff("coach", cls.branchId);
      await regaloDeProfe(ana, semana);
      await regaloDeProfe(beto, semana);
      await regaloDeProfe(beto, addDays(semana, 1));
      await regaloDeProfe(beto, addDays(semana, 2));

      const res = await porProfe(adminToken, { branchId: cls.branchId });

      expect(res.statusCode).toBe(200);
      expect(res.body.weekStart).toBe(semana);
      expect(res.body.weekEnd).toBe(addDays(semana, 6));
      expect(res.body.total).toBe(4);
      expect(res.body.coaches).toEqual([
        { userId: beto.id, name: beto.fullName, gifts: 3 },
        { userId: ana.id, name: ana.fullName, gifts: 1 },
      ]);
    });

    it("(2) no cuenta los regalos de alumnos, los anulados ni los de otras semanas", async () => {
      const semana = giftWeekRange(cls.today).start;
      const coach = await staff("coach", cls.branchId);
      const g = await alumno();
      const a = await alumno();
      await regaloDeProfe(coach, semana);
      // Anulado: no cuenta.
      await regaloDeProfe(coach, addDays(semana, 1), cls, "anulado");
      // Semana anterior y siguiente: no cuentan en la actual.
      await regaloDeProfe(coach, addDays(semana, -1));
      await regaloDeProfe(coach, addDays(semana, 7));
      // De un alumno: no es de un profe.
      await seedGift(app, {
        giverUserId: g.id,
        receiverUserId: a.id,
        branchId: cls.branchId,
        scheduleId: cls.scheduleId,
        sessionDate: semana,
      });

      const res = await porProfe(adminToken, { branchId: cls.branchId });

      expect(res.body.total).toBe(1);
      expect(res.body.coaches).toEqual([
        { userId: coach.id, name: coach.fullName, gifts: 1 },
      ]);
    });

    it("(3) sin regalos en la semana responde 200 con la lista vacía y total 0", async () => {
      const res = await porProfe(adminToken);

      expect(res.statusCode).toBe(200);
      expect(res.body.coaches).toEqual([]);
      expect(res.body.total).toBe(0);
      expect(res.body.weekStart).toBe(
        giftWeekRange(todayInTz(DEFAULT_TENANT_TIMEZONE)).start,
      );
    });

    it("(4) weeksBack navega a las semanas anteriores: lunes y domingo de esa semana", async () => {
      const actual = giftWeekRange(cls.today).start;
      const coach = await staff("coach", cls.branchId);
      await regaloDeProfe(coach, addDays(actual, -7));
      await regaloDeProfe(coach, addDays(actual, -3));
      await regaloDeProfe(coach, addDays(actual, -14));

      const anterior = await porProfe(adminToken, {
        branchId: cls.branchId,
        weeksBack: 1,
      });
      const haceDos = await porProfe(adminToken, {
        branchId: cls.branchId,
        weeksBack: 2,
      });
      const hoy = await porProfe(adminToken, { branchId: cls.branchId });

      expect(anterior.body.weekStart).toBe(addDays(actual, -7));
      expect(anterior.body.weekEnd).toBe(addDays(actual, -1));
      expect(anterior.body.total).toBe(2);
      expect(haceDos.body.weekStart).toBe(addDays(actual, -14));
      expect(haceDos.body.total).toBe(1);
      expect(hoy.body.total).toBe(0);
    });

    it("(5) un weeksBack negativo, mayor a 52 o no entero da 400", async () => {
      const negativo = await porProfe(adminToken, { weeksBack: -1 });
      const enorme = await porProfe(adminToken, { weeksBack: 53 });
      const decimal = await porProfe(adminToken, { weeksBack: "1.5" });

      expect(negativo.statusCode).toBe(400);
      expect(enorme.statusCode).toBe(400);
      expect(decimal.statusCode).toBe(400);
    });

    it("(6) la semana se mide con el día de la sede filtrada (Auckland)", async () => {
      const otra = await otraClase({ tz: "Pacific/Auckland" });

      const res = await porProfe(adminToken, { branchId: otra.branchId });

      expect(res.statusCode).toBe(200);
      expect(res.body.weekStart).toBe(
        giftWeekRange(todayInTz("Pacific/Auckland")).start,
      );
    });
  });

  // ── Alcance y permisos ────────────────────────────────────────────────────

  describe("alcance y permisos", () => {
    it("(7) el admin_sede sin branchId ve solo sus sedes, y con una sede ajena recibe 403", async () => {
      const semana = giftWeekRange(cls.today).start;
      const adminSede = await staff("admin_sede", cls.branchId);
      const propio = await staff("coach", cls.branchId);
      await regaloDeProfe(propio, semana);
      const otra = await otraClase({ tz: "Pacific/Auckland" });
      const ajeno = await staff("coach", otra.branchId);
      await regaloDeProfe(ajeno, semana, otra);

      const sinSede = await porProfe(adminSede.token);
      const conSuSede = await porProfe(adminSede.token, {
        branchId: cls.branchId,
      });
      const conSedeAjena = await porProfe(adminSede.token, {
        branchId: otra.branchId,
      });
      const delAdmin = await porProfe(adminToken);

      expect(sinSede.statusCode).toBe(200);
      expect(sinSede.body.coaches.map((c) => c.userId)).toEqual([propio.id]);
      expect(sinSede.body.total).toBe(1);
      expect(conSuSede.body.coaches.map((c) => c.userId)).toEqual([propio.id]);
      expect(conSedeAjena.statusCode).toBe(403);
      expect(conSedeAjena.body.code).toBe("BRANCH_OUT_OF_SCOPE");
      expect(conSedeAjena.body.coaches).toBeUndefined();
      // El admin del gimnasio ve las dos sedes (la semana de Buenos Aires puede
      // no coincidir con la de Auckland: se acota por sede para comparar).
      const sedeAjena = await porProfe(adminToken, { branchId: otra.branchId });
      expect(delAdmin.statusCode).toBe(200);
      expect(sedeAjena.body.coaches.map((c) => c.userId)).toEqual([ajeno.id]);
    });

    it("(8) un profe y la recepción reciben 403 y no ven el conteo", async () => {
      const coach = await staff("coach", cls.branchId);
      const recepcion = await staff("recepcion", cls.branchId);
      await regaloDeProfe(coach, giftWeekRange(cls.today).start);

      const delProfe = await porProfe(coach.token);
      const deRecepcion = await porProfe(recepcion.token);

      expect(delProfe.statusCode).toBe(403);
      expect(delProfe.body.code).toBe("REGALO_SIN_PERMISO");
      expect(delProfe.body.coaches).toBeUndefined();
      expect(deRecepcion.statusCode).toBe(403);
      expect(deRecepcion.body.coaches).toBeUndefined();
    });

    it("(9) el admin del gimnasio 2 no ve los regalos de los profes del gimnasio 1", async () => {
      await setModuleFlag(app, TENANT_DOS, "templo-gamification", true);
      const coach = await staff("coach", cls.branchId);
      await regaloDeProfe(coach, giftWeekRange(cls.today).start);

      const res = await porProfe(gym2.adminToken);

      expect(res.statusCode).toBe(200);
      expect(res.body.coaches).toEqual([]);
      expect(res.body.total).toBe(0);
    });

    it("(10) con el módulo de gamificación apagado en el gimnasio 2 responde 404", async () => {
      await setModuleFlag(app, TENANT_DOS, "templo-gamification", false);

      const res = await porProfe(gym2.adminToken);

      expect(res.statusCode).toBe(404);
    });

    it("(11) sin sesión responde 401", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/admin/aura/gifts/by-coach",
      });

      expect(res.statusCode).toBe(401);
    });
  });
});
