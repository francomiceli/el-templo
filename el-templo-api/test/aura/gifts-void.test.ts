/**
 * Fase 215 (plan 09; SC-7, SC-8, D-08, D-09, D-20) — anular un regalo:
 *   POST   /api/admin/aura/gifts/:id/void
 *   DELETE /api/admin/attendance/:attendanceId  (deshacer una asistencia anula
 *                                                antes los regalos que dio o recibió)
 *
 * Los regalos se crean desde las rutas reales (el del alumno y el del profe),
 * así la reversa se prueba contra el ledger tal como queda en producción.
 * Clase de AYER, fechas relativas al día local de la sede (nada fijo) y personas
 * por fábrica (ningún id de `users` hardcodeado). Corre en CI.
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
import { and, eq } from "drizzle-orm";
import {
  createTestApp,
  cleanAllTestData,
  createStaffUser,
  getAuthToken,
} from "../helpers";
import * as schema from "../../src/db/schema";
import { tenantWhere } from "../../src/modules/shared/tenant";
import { COACH_GIFT_SETTING_KEY } from "../../src/modules/aura/gift-settings";
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
  GIFT_CTX,
  cleanupGiftClasses,
  earnedOf,
  ledgerSum,
  seedAttendance,
  seedGiftClass,
  seedGiftPlan,
  seedMember,
  seedMemberWithPlan,
  type GiftClass,
} from "./_gift-fixtures";

const PASSWORD = "pass123456";
const STAFF_PASSWORD = "staff-pass-215";
const ADMIN_EMAIL = "admin@test.com";
const ADMIN_PASSWORD = "adminpass123";

interface ErrorBody {
  error: string;
  message: string;
  code: string;
}

interface Participante {
  id: number;
  email: string;
  firstName: string;
  attendanceId: number;
}

let staffSeq = 0;

describe("Fase 215-09: anulación de regalos", () => {
  let app: FastifyInstance;
  let gym2: SegundoGimnasio;
  let planId: number;
  let cls: GiftClass;
  const extraClasses: GiftClass[] = [];
  let adminToken: string;
  let coachToken: string;

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    gym2 = await seedSecondTenant(app);
    planId = await seedGiftPlan(app);
    cls = await seedGiftClass(app);
    adminToken = await getAuthToken(app, ADMIN_EMAIL, ADMIN_PASSWORD);
    coachToken = await staffToken("coach", cls.branchId);
  });

  afterEach(async () => {
    await clearModuleFlags(app, TENANT_DOS);
    await borrarValorDelProfe();
  });

  afterAll(async () => {
    await borrarValorDelProfe();
    await restoreTemploFlags(app);
    await cleanAllTestData(app);
    await limpiarSegundoGimnasio(app);
    await cleanupGiftClasses(app, extraClasses);
    await app.close();
  });

  // ── Siembra ────────────────────────────────────────────────────────────────

  /** `tenant_settings` no está en `cleanAllTestData`: se borra solo esta clave. */
  async function borrarValorDelProfe(): Promise<void> {
    await app.db
      .delete(schema.tenantSettings)
      .where(eq(schema.tenantSettings.settingKey, COACH_GIFT_SETTING_KEY));
  }

  /** Empleado de la sede indicada, ya autenticado. */
  async function staffToken(role: string, branchId: number): Promise<string> {
    staffSeq += 1;
    const email = `staff-215-void-${role}-${staffSeq}-${Date.now().toString(36)}@test.com`;
    await createStaffUser(app, {
      email,
      password: STAFF_PASSWORD,
      firstName: "Staff",
      lastName: `Anula${staffSeq}`,
      role,
      branchId,
    });
    return getAuthToken(app, email, STAFF_PASSWORD);
  }

  async function adminId(): Promise<number> {
    const [row] = await app.db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(
        and(
          tenantWhere(schema.users, GIFT_CTX),
          eq(schema.users.email, ADMIN_EMAIL),
        ),
      );
    return row.id;
  }

  /** Alumno con plan en vigor que fue a la clase `clase` (quien da el regalo). */
  async function dador(clase: GiftClass = cls): Promise<Participante> {
    const person = await seedMemberWithPlan(app, {
      branchId: clase.branchId,
      planId,
      today: clase.today,
    });
    const attendanceId = await seedAttendance(app, {
      memberId: person.id,
      branchId: clase.branchId,
      scheduleId: clase.scheduleId,
      sessionDate: clase.sessionDate,
    });
    return { ...person, attendanceId };
  }

  /** Compañero (sin plan) con asistencia en la clase `clase`. */
  async function companiero(clase: GiftClass = cls): Promise<Participante> {
    const person = await seedMember(app, {
      branchId: clase.branchId,
      status: "activo",
    });
    const attendanceId = await seedAttendance(app, {
      memberId: person.id,
      branchId: clase.branchId,
      scheduleId: clase.scheduleId,
      sessionDate: clase.sessionDate,
    });
    return { ...person, attendanceId };
  }

  async function otraClase(
    opts: Parameters<typeof seedGiftClass>[1] = {},
  ): Promise<GiftClass> {
    const nueva = await seedGiftClass(app, opts);
    extraClasses.push(nueva);
    return nueva;
  }

  // ── Pedidos ────────────────────────────────────────────────────────────────

  /** Regalo de alumno por la ruta real. Devuelve el id de la fila de `aura_gifts`. */
  async function regaloDeAlumno(
    g: Participante,
    a: Participante,
  ): Promise<number> {
    const res = await app.inject({
      method: "POST",
      url: "/api/members/aura/gifts",
      headers: {
        authorization: `Bearer ${await getAuthToken(app, g.email, PASSWORD)}`,
      },
      payload: {
        attendanceId: g.attendanceId,
        receiverAttendanceId: a.attendanceId,
        reason: "tecnica",
      },
    });
    expect(res.statusCode).toBe(201);
    const [row] = await app.db
      .select({ id: schema.auraGifts.id })
      .from(schema.auraGifts)
      .where(
        and(
          tenantWhere(schema.auraGifts, GIFT_CTX),
          eq(schema.auraGifts.giverAttendanceId, g.attendanceId),
        ),
      );
    return row.id;
  }

  /** Regalo del profe por la ruta real. Devuelve el id de la fila de `aura_gifts`. */
  async function regaloDelProfe(
    token: string,
    a: Participante,
  ): Promise<number> {
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/aura/gifts",
      headers: { authorization: `Bearer ${token}` },
      payload: { attendanceId: a.attendanceId, reason: "constancia" },
    });
    expect(res.statusCode).toBe(201);
    const [row] = await app.db
      .select({ id: schema.auraGifts.id })
      .from(schema.auraGifts)
      .where(
        and(
          tenantWhere(schema.auraGifts, GIFT_CTX),
          eq(schema.auraGifts.receiverAttendanceId, a.attendanceId),
          eq(schema.auraGifts.giverKind, "profe"),
        ),
      );
    return row.id;
  }

  async function anular(
    token: string,
    giftId: number,
  ): Promise<{ statusCode: number; body: ErrorBody | null }> {
    const res = await app.inject({
      method: "POST",
      url: `/api/admin/aura/gifts/${giftId}/void`,
      headers: { authorization: `Bearer ${token}` },
    });
    return {
      statusCode: res.statusCode,
      body: res.body ? (res.json() as ErrorBody) : null,
    };
  }

  async function deshacerAsistencia(
    token: string,
    attendanceId: number,
  ): Promise<{ statusCode: number }> {
    const res = await app.inject({
      method: "DELETE",
      url: `/api/admin/attendance/${attendanceId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    return { statusCode: res.statusCode };
  }

  async function putValorDelProfe(
    token: string,
    coachGiftAmount: number,
  ): Promise<void> {
    const res = await app.inject({
      method: "PUT",
      url: "/api/admin/aura/gift-settings",
      headers: { authorization: `Bearer ${token}` },
      payload: { coachGiftAmount },
    });
    expect(res.statusCode).toBe(200);
  }

  async function regalo(giftId: number) {
    const [row] = await app.db
      .select({
        status: schema.auraGifts.status,
        amount: schema.auraGifts.amount,
        voidCause: schema.auraGifts.voidCause,
        voidedByUserId: schema.auraGifts.voidedByUserId,
        voidedAt: schema.auraGifts.voidedAt,
      })
      .from(schema.auraGifts)
      .where(
        and(
          tenantWhere(schema.auraGifts, GIFT_CTX),
          eq(schema.auraGifts.id, giftId),
        ),
      );
    return row;
  }

  /** Filas `aura_gift_void` del ledger de un usuario. */
  async function filasDeReversa(userId: number) {
    return app.db
      .select({
        sourceType: schema.auraTransactions.sourceType,
        referenceType: schema.auraTransactions.referenceType,
        referenceId: schema.auraTransactions.referenceId,
        amount: schema.auraTransactions.amount,
      })
      .from(schema.auraTransactions)
      .where(
        and(
          tenantWhere(schema.auraTransactions, GIFT_CTX),
          eq(schema.auraTransactions.userId, userId),
          eq(schema.auraTransactions.referenceType, "aura_gift_void"),
        ),
      );
  }

  async function saldo(userId: number): Promise<number> {
    const [row] = await app.db
      .select({ balance: schema.auraBalances.balance })
      .from(schema.auraBalances)
      .where(
        and(
          tenantWhere(schema.auraBalances, GIFT_CTX),
          eq(schema.auraBalances.userId, userId),
        ),
      );
    return row?.balance ?? 0;
  }

  async function auraEarnedFromMe(p: {
    email: string;
  }): Promise<number | null> {
    const res = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: {
        authorization: `Bearer ${await getAuthToken(app, p.email, PASSWORD)}`,
      },
    });
    return (res.json() as { auraEarned: number | null }).auraEarned;
  }

  /** Suma del ledger con la condición de Aura ganada escrita a mano (SQL crudo). */
  async function ledgerGanadoCrudo(userId: number): Promise<number> {
    const [rows] = await app.dbPool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total
         FROM aura_transactions
        WHERE tenant_id = ? AND user_id = ?
          AND NOT (source_type = 'subscription_discount'
                   OR (source_type = 'manual_adjustment' AND reference_type <=> 'subscription'))`,
      [GIFT_CTX.tenantId, userId],
    );
    return Number((rows as Array<{ total: string | number }>)[0]?.total ?? 0);
  }

  // ── 1 a 3. la anulación y su reversa exacta ───────────────────────────────

  describe("POST /gifts/:id/void", () => {
    it("(1) el admin anula un regalo de alumno: 204, queda anulado por el staff y el receptor pierde 1 con una fila aura_gift_void", async () => {
      const g = await dador();
      const a = await companiero();
      const giftId = await regaloDeAlumno(g, a);
      expect(await earnedOf(app, a.id)).toBe(1);

      const res = await anular(adminToken, giftId);

      expect(res.statusCode).toBe(204);
      const fila = await regalo(giftId);
      expect(fila.status).toBe("anulado");
      expect(fila.voidCause).toBe("staff");
      expect(fila.voidedByUserId).toBe(await adminId());
      expect(fila.voidedAt).not.toBeNull();
      expect(await filasDeReversa(a.id)).toEqual([
        {
          sourceType: "social",
          referenceType: "aura_gift_void",
          referenceId: giftId,
          amount: -1,
        },
      ]);
      expect(await ledgerSum(app, a.id)).toBe(0);
      expect(await saldo(a.id)).toBe(0);
      expect(await earnedOf(app, a.id)).toBe(0);
    });

    it("(2) anular dos veces da 409 REGALO_YA_ANULADO y no hay una segunda fila negativa", async () => {
      const g = await dador();
      const a = await companiero();
      const giftId = await regaloDeAlumno(g, a);
      expect((await anular(adminToken, giftId)).statusCode).toBe(204);

      const segunda = await anular(adminToken, giftId);

      expect(segunda.statusCode).toBe(409);
      expect(segunda.body?.code).toBe("REGALO_YA_ANULADO");
      expect(await filasDeReversa(a.id)).toHaveLength(1);
      expect(await ledgerSum(app, a.id)).toBe(0);
      expect(await saldo(a.id)).toBe(0);
    });

    it("(3) un regalo del profe de 2 se anula por -2 aunque el valor del profe haya pasado a 4 después", async () => {
      const a = await companiero();
      const giftId = await regaloDelProfe(coachToken, a);
      expect(await earnedOf(app, a.id)).toBe(2);
      await putValorDelProfe(adminToken, 4);

      const res = await anular(adminToken, giftId);

      expect(res.statusCode).toBe(204);
      const fila = await regalo(giftId);
      expect(fila.amount).toBe(2);
      expect(await filasDeReversa(a.id)).toEqual([
        {
          sourceType: "social",
          referenceType: "aura_gift_void",
          referenceId: giftId,
          amount: -2,
        },
      ]);
      expect(await ledgerSum(app, a.id)).toBe(0);
      expect(await earnedOf(app, a.id)).toBe(0);
    });
  });

  // ── 4 a 7. quién puede anular y dónde ─────────────────────────────────────

  describe("alcance y permisos", () => {
    it("(4) el admin_sede anula un regalo de su sede (204) y uno de otra sede da 404 sin tocar nada", async () => {
      const adminSede = await staffToken("admin_sede", cls.branchId);
      const propia = await companiero();
      const regaloPropio = await regaloDelProfe(coachToken, propia);

      const otra = await otraClase({ tz: "Pacific/Auckland" });
      const coachAjeno = await staffToken("coach", otra.branchId);
      const ajena = await companiero(otra);
      const regaloAjeno = await regaloDelProfe(coachAjeno, ajena);

      const fuera = await anular(adminSede, regaloAjeno);
      const dentro = await anular(adminSede, regaloPropio);

      expect(fuera.statusCode).toBe(404);
      expect(fuera.body?.code).toBe("REGALO_NO_ENCONTRADO");
      expect((await regalo(regaloAjeno)).status).toBe("vigente");
      expect(await ledgerSum(app, ajena.id)).toBe(2);
      expect(dentro.statusCode).toBe(204);
      expect((await regalo(regaloPropio)).status).toBe("anulado");
      expect(await ledgerSum(app, propia.id)).toBe(0);
    });

    it("(5) un profe o la recepción reciben 403 REGALO_SIN_PERMISO y el regalo sigue vigente", async () => {
      const a = await companiero();
      const giftId = await regaloDelProfe(coachToken, a);
      const recepcionToken = await staffToken("recepcion", cls.branchId);

      const delProfe = await anular(coachToken, giftId);
      const deRecepcion = await anular(recepcionToken, giftId);

      expect(delProfe.statusCode).toBe(403);
      expect(delProfe.body?.code).toBe("REGALO_SIN_PERMISO");
      expect(deRecepcion.statusCode).toBe(403);
      expect(deRecepcion.body?.code).toBe("REGALO_SIN_PERMISO");
      expect((await regalo(giftId)).status).toBe("vigente");
      expect(await ledgerSum(app, a.id)).toBe(2);
    });

    it("(6) un id inexistente da 404 REGALO_NO_ENCONTRADO", async () => {
      const res = await anular(adminToken, 2_000_000_000);

      expect(res.statusCode).toBe(404);
      expect(res.body?.code).toBe("REGALO_NO_ENCONTRADO");
    });

    it("(7) el admin del gimnasio 2 no puede anular un regalo del gimnasio 1: 404 y nada cambia", async () => {
      await setModuleFlag(app, TENANT_DOS, "templo-gamification", true);
      const g = await dador();
      const a = await companiero();
      const giftId = await regaloDeAlumno(g, a);

      const res = await anular(gym2.adminToken, giftId);

      expect(res.statusCode).toBe(404);
      expect(res.body?.code).toBe("REGALO_NO_ENCONTRADO");
      expect((await regalo(giftId)).status).toBe("vigente");
      expect(await ledgerSum(app, a.id)).toBe(1);
      expect(await filasDeReversa(a.id)).toHaveLength(0);
    });
  });

  // ── 8. el dador no recupera el regalo ─────────────────────────────────────

  describe("cupo del dador (D-09)", () => {
    it("(8) tras anular, la clase no vuelve a la lista de pendientes y un nuevo regalo da REGALO_YA_DADO", async () => {
      const g = await dador();
      const a = await companiero();
      const b = await companiero();
      const giftId = await regaloDeAlumno(g, a);
      expect((await anular(adminToken, giftId)).statusCode).toBe(204);
      const token = await getAuthToken(app, g.email, PASSWORD);

      const pendientes = await app.inject({
        method: "GET",
        url: "/api/members/aura/gifts/pending",
        headers: { authorization: `Bearer ${token}` },
      });
      const otroIntento = await app.inject({
        method: "POST",
        url: "/api/members/aura/gifts",
        headers: { authorization: `Bearer ${token}` },
        payload: {
          attendanceId: g.attendanceId,
          receiverAttendanceId: b.attendanceId,
          reason: "ayudo",
        },
      });

      expect(pendientes.statusCode).toBe(200);
      const ids = (
        pendientes.json() as { pending: Array<{ attendanceId: number }> }
      ).pending.map((p) => p.attendanceId);
      expect(ids).not.toContain(g.attendanceId);
      expect(otroIntento.statusCode).toBe(409);
      expect((otroIntento.json() as ErrorBody).code).toBe("REGALO_YA_DADO");
      expect(await ledgerSum(app, b.id)).toBe(0);
    });
  });

  // ── 9 a 11. deshacer una asistencia (D-08) ────────────────────────────────

  describe("deshacer una asistencia", () => {
    it("(9) deshacer la asistencia del RECEPTOR anula el regalo (causa asistencia) y le descuenta lo recibido", async () => {
      const g = await dador();
      const a = await companiero();
      const giftId = await regaloDeAlumno(g, a);

      const res = await deshacerAsistencia(adminToken, a.attendanceId);

      expect(res.statusCode).toBe(200);
      const fila = await regalo(giftId);
      expect(fila.status).toBe("anulado");
      expect(fila.voidCause).toBe("asistencia");
      expect(fila.voidedByUserId).toBe(await adminId());
      expect(await filasDeReversa(a.id)).toEqual([
        {
          sourceType: "social",
          referenceType: "aura_gift_void",
          referenceId: giftId,
          amount: -1,
        },
      ]);
      expect(await ledgerSum(app, a.id)).toBe(0);
      expect(await earnedOf(app, a.id)).toBe(0);
    });

    it("(10) deshacer la asistencia del DADOR anula el regalo que dio y el receptor pierde lo recibido", async () => {
      const g = await dador();
      const a = await companiero();
      const giftId = await regaloDeAlumno(g, a);

      const res = await deshacerAsistencia(adminToken, g.attendanceId);

      expect(res.statusCode).toBe(200);
      const fila = await regalo(giftId);
      expect(fila.status).toBe("anulado");
      expect(fila.voidCause).toBe("asistencia");
      expect(await ledgerSum(app, a.id)).toBe(0);
      expect(await saldo(a.id)).toBe(0);
      // Quien dio no tenía ni gana ni pierde nada por esto (D-09).
      expect(await ledgerSum(app, g.id)).toBe(0);
    });

    it("(11) deshacer una asistencia sin regalos no cambia nada, ni los regalos de otras asistencias", async () => {
      const g = await dador();
      const a = await companiero();
      const giftId = await regaloDeAlumno(g, a);
      const sinRegalos = await companiero();

      const res = await deshacerAsistencia(adminToken, sinRegalos.attendanceId);

      expect(res.statusCode).toBe(200);
      expect((await regalo(giftId)).status).toBe("vigente");
      expect(await ledgerSum(app, a.id)).toBe(1);
      expect(await ledgerSum(app, sinRegalos.id)).toBe(0);
      expect(await filasDeReversa(a.id)).toHaveLength(0);
    });
  });

  // ── 12. conciliación (SC-8) ───────────────────────────────────────────────

  describe("conciliación", () => {
    it("(12) tras dar 3 regalos y anular 1, la Aura ganada de /auth/me, el ledger y el saldo de cada persona coinciden con lo esperado", async () => {
      const g = await dador();
      const a = await companiero();
      const b = await companiero();
      const c = await companiero();
      const regaloA = await regaloDelProfe(coachToken, a);
      await regaloDelProfe(coachToken, b);
      await regaloDeAlumno(g, c);

      expect((await anular(adminToken, regaloA)).statusCode).toBe(204);

      const esperado: Array<[Participante, number]> = [
        [a, 0],
        [b, 2],
        [c, 1],
        [g, 0],
      ];
      for (const [persona, valor] of esperado) {
        expect(await auraEarnedFromMe(persona)).toBe(valor);
        expect(await ledgerGanadoCrudo(persona.id)).toBe(valor);
        expect(await ledgerSum(app, persona.id)).toBe(valor);
        expect(await saldo(persona.id)).toBe(valor);
      }
    });
  });
});
