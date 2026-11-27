/**
 * Fase 215 (plan 08; SC-3, SC-5, D-01, D-03, D-04, D-07, D-11, D-15, D-16) — el
 * regalo del profe y el panel de asistencia:
 *   POST /api/admin/aura/gifts
 *   GET  /api/admin/aura/gift-settings
 *   PUT  /api/admin/aura/gift-settings
 *   GET  /api/admin/attendance/slot/:scheduleId/:date  (campos `coachGiftAmount` y `gift`)
 *
 * Integración desde la ruta, con la clase de AYER salvo que el caso diga otra
 * cosa. Fechas relativas al día local de la sede (nada fijo) y personas por
 * fábrica (ningún id de `users` hardcodeado). Corre en CI.
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
  seedBooking,
  seedGiftClass,
  seedMember,
  setCommunityVisible,
  type GiftClass,
} from "./_gift-fixtures";

const COACH_PASSWORD = "coach-pass-215";
const ADMIN_EMAIL = "admin@test.com";
const ADMIN_PASSWORD = "adminpass123";

interface ErrorBody {
  error: string;
  message: string;
  code: string;
}

interface GiveBody extends ErrorBody {
  amount: number;
}

interface SettingsBody {
  coachGiftAmount: number;
}

interface PanelGift {
  state: "disponible" | "dado" | "anulado" | "no_participa";
  amount: number;
  reason: string | null;
}

interface PanelBody {
  coachGiftAmount: number | null;
  members: Array<{
    memberId: number;
    attendanceId: number | null;
    gift: PanelGift | null;
  }>;
}

interface Alumno {
  id: number;
  email: string;
  firstName: string;
  attendanceId: number;
}

let staffSeq = 0;

describe("Fase 215-08: regalo del profe y panel de asistencia", () => {
  let app: FastifyInstance;
  let gym2: SegundoGimnasio;
  let cls: GiftClass;
  const extraClasses: GiftClass[] = [];
  let coachToken: string;
  let adminToken: string;

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    gym2 = await seedSecondTenant(app);
    cls = await seedGiftClass(app);
    coachToken = await staffToken("coach", cls.branchId);
    adminToken = await getAuthToken(app, ADMIN_EMAIL, ADMIN_PASSWORD);
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

  /**
   * Empleado de la sede indicada, ya autenticado. `canGiveAura` prende el
   * permiso por persona (2026-11-27); `country` fuerza el país de un admin o
   * gestión (sin él, sale de la sede).
   */
  async function staffToken(
    role: string,
    branchId: number,
    opts: { canGiveAura?: boolean; country?: "AR" | "ES" } = {},
  ): Promise<string> {
    staffSeq += 1;
    const email = `staff-215-${role}-${staffSeq}-${Date.now().toString(36)}@test.com`;
    const userId = await createStaffUser(app, {
      email,
      password: COACH_PASSWORD,
      firstName: "Staff",
      lastName: `Regalo${staffSeq}`,
      role,
      branchId,
      ...(opts.country !== undefined ? { country: opts.country } : {}),
    });
    if (opts.canGiveAura) {
      await app.db
        .update(schema.users)
        .set({ canGiveAura: true })
        .where(
          and(
            tenantWhere(schema.users, GIFT_CTX),
            eq(schema.users.id, userId),
          ),
        );
    }
    return getAuthToken(app, email, COACH_PASSWORD);
  }

  async function getMe(token: string): Promise<{ canGiveCoachGift?: boolean }> {
    const res = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    return res.json() as { canGiveCoachGift?: boolean };
  }

  /** Alumno (sin plan) con asistencia a la clase `clase`. */
  async function alumno(clase: GiftClass = cls): Promise<Alumno> {
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

  async function hacerStaff(userId: number): Promise<void> {
    await app.db
      .update(schema.users)
      .set({ role: "coach" })
      .where(
        and(tenantWhere(schema.users, GIFT_CTX), eq(schema.users.id, userId)),
      );
  }

  // ── Pedidos ────────────────────────────────────────────────────────────────

  async function postGift(
    token: string,
    payload: Record<string, unknown>,
  ): Promise<{ statusCode: number; body: GiveBody }> {
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/aura/gifts",
      headers: { authorization: `Bearer ${token}` },
      payload,
    });
    return { statusCode: res.statusCode, body: res.json() as GiveBody };
  }

  async function darRegalo(
    token: string,
    a: Alumno,
    reason = "tecnica",
  ): Promise<{ statusCode: number; body: GiveBody }> {
    return postGift(token, { attendanceId: a.attendanceId, reason });
  }

  async function getSettings(
    token: string,
  ): Promise<{ statusCode: number; body: SettingsBody & ErrorBody }> {
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/aura/gift-settings",
      headers: { authorization: `Bearer ${token}` },
    });
    return {
      statusCode: res.statusCode,
      body: res.json() as SettingsBody & ErrorBody,
    };
  }

  async function putSettings(
    token: string,
    payload: Record<string, unknown>,
  ): Promise<{ statusCode: number; body: SettingsBody & ErrorBody }> {
    const res = await app.inject({
      method: "PUT",
      url: "/api/admin/aura/gift-settings",
      headers: { authorization: `Bearer ${token}` },
      payload,
    });
    return {
      statusCode: res.statusCode,
      body: res.json() as SettingsBody & ErrorBody,
    };
  }

  async function getPanel(
    token: string,
    clase: GiftClass = cls,
  ): Promise<{ statusCode: number; body: PanelBody }> {
    const res = await app.inject({
      method: "GET",
      url: `/api/admin/attendance/slot/${clase.scheduleId}/${clase.sessionDate}`,
      headers: { authorization: `Bearer ${token}` },
    });
    return { statusCode: res.statusCode, body: res.json() as PanelBody };
  }

  async function filasDelRegalo(receiverUserId: number) {
    return app.db
      .select({
        id: schema.auraGifts.id,
        giverKind: schema.auraGifts.giverKind,
        amount: schema.auraGifts.amount,
        status: schema.auraGifts.status,
        reason: schema.auraGifts.reason,
      })
      .from(schema.auraGifts)
      .where(
        and(
          tenantWhere(schema.auraGifts, GIFT_CTX),
          eq(schema.auraGifts.receiverUserId, receiverUserId),
        ),
      );
  }

  // ── 1 a 4. dar el regalo ───────────────────────────────────────────────────

  describe("POST /api/admin/aura/gifts", () => {
    it("(1) el profe con la sede asignada da Aura a un alumno de ayer: 201 { amount: 2 } y una fila social +2", async () => {
      const a = await alumno();

      const res = await darRegalo(coachToken, a, "constancia");

      expect(res.statusCode).toBe(201);
      expect(res.body).toEqual({ amount: 2 });
      const [gift] = await filasDelRegalo(a.id);
      expect(gift?.giverKind).toBe("profe");
      expect(gift?.status).toBe("vigente");
      expect(gift?.amount).toBe(2);
      expect(gift?.reason).toBe("constancia");

      const ledger = await app.db
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
            eq(schema.auraTransactions.userId, a.id),
          ),
        );
      expect(ledger).toEqual([
        {
          sourceType: "social",
          referenceType: "aura_gift",
          referenceId: gift?.id,
          amount: 2,
        },
      ]);
      expect(await earnedOf(app, a.id)).toBe(2);
    });

    it("(2) un segundo regalo al mismo alumno el mismo día da 409 REGALO_YA_DADO y no suma", async () => {
      const a = await alumno();
      expect((await darRegalo(coachToken, a)).statusCode).toBe(201);

      const res = await darRegalo(coachToken, a, "energia");

      expect(res.statusCode).toBe(409);
      expect(res.body.code).toBe("REGALO_YA_DADO");
      expect(await filasDelRegalo(a.id)).toHaveLength(1);
      expect(await ledgerSum(app, a.id)).toBe(2);
    });

    it("(3) a otro alumno de la misma clase se puede: no hay tope de cantidad por clase", async () => {
      const a = await alumno();
      const b = await alumno();
      const c = await alumno();

      const resA = await darRegalo(coachToken, a);
      const resB = await darRegalo(coachToken, b);
      const resC = await darRegalo(coachToken, c, "ayudo");

      expect([resA.statusCode, resB.statusCode, resC.statusCode]).toEqual([
        201, 201, 201,
      ]);
      expect(await ledgerSum(app, b.id)).toBe(2);
    });

    it("(4) con el valor en 4 el siguiente regalo acredita 4 y el anterior sigue en 2", async () => {
      const a = await alumno();
      const b = await alumno();
      expect((await darRegalo(coachToken, a)).body.amount).toBe(2);

      const cambio = await putSettings(adminToken, { coachGiftAmount: 4 });
      const res = await darRegalo(coachToken, b);

      expect(cambio.statusCode).toBe(200);
      expect(cambio.body).toEqual({ coachGiftAmount: 4 });
      expect(res.statusCode).toBe(201);
      expect(res.body).toEqual({ amount: 4 });
      expect((await filasDelRegalo(a.id))[0]?.amount).toBe(2);
      expect((await filasDelRegalo(b.id))[0]?.amount).toBe(4);
      expect(await ledgerSum(app, a.id)).toBe(2);
      expect(await ledgerSum(app, b.id)).toBe(4);
    });
  });

  // ── 5 y 6. quién puede dar el regalo ───────────────────────────────────────

  describe("permisos del POST", () => {
    it("(5) el profe sin la sede de la clase recibe 403 REGALO_SIN_PERMISO y no se acredita nada", async () => {
      const a = await alumno();
      const otraSede = await otraClase({
        tz: "America/Argentina/Buenos_Aires",
      });
      const profeDeOtraSede = await staffToken("coach", otraSede.branchId);

      const res = await darRegalo(profeDeOtraSede, a);

      expect(res.statusCode).toBe(403);
      expect(res.body.code).toBe("REGALO_SIN_PERMISO");
      expect(await filasDelRegalo(a.id)).toEqual([]);
      expect(await ledgerSum(app, a.id)).toBe(0);
    });

    it("(6) dueño, y recepción y gestión SIN el permiso reciben 403 al dar el regalo", async () => {
      const a = await alumno();
      const tokens = [
        adminToken, // la cuenta sembrada `admin@test.com` es dueño
        await staffToken("owner", cls.branchId),
        await staffToken("recepcion", cls.branchId),
        await staffToken("gestion", cls.branchId),
      ];

      for (const token of tokens) {
        const res = await darRegalo(token, a);
        expect(res.statusCode).toBe(403);
        expect(res.body.code).toBe("REGALO_SIN_PERMISO");
      }
      expect(await filasDelRegalo(a.id)).toEqual([]);
      expect(await ledgerSum(app, a.id)).toBe(0);
    });

    // 2026-11-27: en Barcelona dan clases un admin y un recepcionista.
    it("(6b) admin de sede, admin del país, profe de actividad, y recepción y gestión CON el permiso dan el regalo como profe", async () => {
      const givers: Array<[string, string]> = [
        ["admin_sede", await staffToken("admin_sede", cls.branchId)],
        ["admin", await staffToken("admin", cls.branchId)],
        ["coach_actividad", await staffToken("coach_actividad", cls.branchId)],
        [
          "recepcion",
          await staffToken("recepcion", cls.branchId, { canGiveAura: true }),
        ],
        [
          "gestion",
          await staffToken("gestion", cls.branchId, { canGiveAura: true }),
        ],
      ];

      for (const [role, token] of givers) {
        const a = await alumno();
        const res = await darRegalo(token, a);
        expect({ role, status: res.statusCode }).toEqual({ role, status: 201 });
        expect(res.body.amount).toBe(2);
        const filas = await filasDelRegalo(a.id);
        expect(filas).toHaveLength(1);
        expect(filas[0]).toMatchObject({ giverKind: "profe", amount: 2 });
        expect(await ledgerSum(app, a.id)).toBe(2);
      }
    });

    it("(6c) con el rol o el permiso pero fuera de su sede o país: 403 y no se acredita nada", async () => {
      const a = await alumno();
      const otraSede = await otraClase({
        tz: "America/Argentina/Buenos_Aires",
      });
      // Admin del OTRO país que el de la sede de la clase.
      const [sedeDeLaClase] = await app.db
        .select({ country: schema.branches.country })
        .from(schema.branches)
        .where(
          and(
            tenantWhere(schema.branches, GIFT_CTX),
            eq(schema.branches.id, cls.branchId),
          ),
        )
        .limit(1);
      const otroPais = sedeDeLaClase?.country === "ES" ? "AR" : "ES";
      const tokens = [
        await staffToken("admin_sede", otraSede.branchId),
        await staffToken("recepcion", otraSede.branchId, { canGiveAura: true }),
        await staffToken("admin", cls.branchId, { country: otroPais }),
      ];

      for (const token of tokens) {
        const res = await darRegalo(token, a);
        expect(res.statusCode).toBe(403);
        expect(res.body.code).toBe("REGALO_SIN_PERMISO");
      }
      expect(await filasDelRegalo(a.id)).toEqual([]);
      expect(await ledgerSum(app, a.id)).toBe(0);
    });

    it("(6d) el permiso no sirve para el dueño: con can_give_aura prendido sigue en 403", async () => {
      const a = await alumno();
      const dueno = await staffToken("owner", cls.branchId, {
        canGiveAura: true,
      });

      const res = await darRegalo(dueno, a);

      expect(res.statusCode).toBe(403);
      expect(res.body.code).toBe("REGALO_SIN_PERMISO");
    });

    it("(6e) /auth/me dice quién regala: profe, admin de sede, admin y recepción con permiso sí, dueño y recepción sin permiso no", async () => {
      const casos: Array<[string, string, boolean]> = [
        ["coach", coachToken, true],
        ["admin_sede", await staffToken("admin_sede", cls.branchId), true],
        ["admin", await staffToken("admin", cls.branchId), true],
        [
          "recepcion con permiso",
          await staffToken("recepcion", cls.branchId, { canGiveAura: true }),
          true,
        ],
        ["recepcion", await staffToken("recepcion", cls.branchId), false],
        ["dueño", adminToken, false],
        [
          "dueño con permiso",
          await staffToken("owner", cls.branchId, { canGiveAura: true }),
          false,
        ],
      ];

      for (const [caso, token, esperado] of casos) {
        const me = await getMe(token);
        expect({ caso, canGiveCoachGift: me.canGiveCoachGift }).toEqual({
          caso,
          canGiveCoachGift: esperado,
        });
      }
    });
  });

  // ── 7 y 8. receptor y plazo ────────────────────────────────────────────────

  describe("receptor y plazo", () => {
    it("(7) un alumno oculto, staff o de prueba da 409 REGALO_NO_DISPONIBLE", async () => {
      const oculto = await alumno();
      await setCommunityVisible(app, oculto.id, false);
      const staff = await alumno();
      await hacerStaff(staff.id);
      const deprueba = await alumno();
      await seedBooking(app, {
        memberId: deprueba.id,
        scheduleId: cls.scheduleId,
        bookingDate: cls.sessionDate,
        isTrial: true,
      });

      for (const objetivo of [oculto, staff, deprueba]) {
        const res = await darRegalo(coachToken, objetivo);
        expect(res.statusCode).toBe(409);
        expect(res.body.code).toBe("REGALO_NO_DISPONIBLE");
        expect(await filasDelRegalo(objetivo.id)).toEqual([]);
        expect(await ledgerSum(app, objetivo.id)).toBe(0);
      }
    });

    it("(8) una clase de anteayer da 409 REGALO_VENCIDO", async () => {
      const anteayer = await otraClase({ dateOffset: -2 });
      const a = await alumno(anteayer);

      const res = await darRegalo(coachToken, a);

      expect(res.statusCode).toBe(409);
      expect(res.body.code).toBe("REGALO_VENCIDO");
      expect(await filasDelRegalo(a.id)).toEqual([]);
      expect(await ledgerSum(app, a.id)).toBe(0);
    });
  });

  // ── 9 y 10. el panel de asistencia ─────────────────────────────────────────

  describe("GET /api/admin/attendance/slot/:scheduleId/:date", () => {
    it("(9) para el profe trae coachGiftAmount y el estado de cada fila: disponible, dado, no_participa y null", async () => {
      const disponible = await alumno();
      const regalado = await alumno();
      const oculto = await alumno();
      await setCommunityVisible(app, oculto.id, false);
      const soloReserva = await seedMember(app, {
        branchId: cls.branchId,
        status: "activo",
      });
      await seedBooking(app, {
        memberId: soloReserva.id,
        scheduleId: cls.scheduleId,
        bookingDate: cls.sessionDate,
      });
      expect(
        (await darRegalo(coachToken, regalado, "energia")).statusCode,
      ).toBe(201);

      const res = await getPanel(coachToken);

      expect(res.statusCode).toBe(200);
      expect(res.body.coachGiftAmount).toBe(2);
      const fila = (memberId: number) =>
        res.body.members.find((m) => m.memberId === memberId);
      expect(fila(disponible.id)?.gift).toEqual({
        state: "disponible",
        amount: 2,
        reason: null,
      });
      expect(fila(regalado.id)?.gift).toEqual({
        state: "dado",
        amount: 2,
        reason: "energia",
      });
      expect(fila(oculto.id)?.gift?.state).toBe("no_participa");
      expect(fila(soloReserva.id)).toBeDefined();
      expect(fila(soloReserva.id)?.gift).toBeNull();
    });

    it("(9b) un regalo anulado sale como anulado en el panel y no deja volver a darlo (LO-01)", async () => {
      const regalado = await alumno();
      expect((await darRegalo(coachToken, regalado)).statusCode).toBe(201);
      await app.db
        .update(schema.auraGifts)
        .set({ status: "anulado", voidCause: "staff" })
        .where(
          and(
            tenantWhere(schema.auraGifts, GIFT_CTX),
            eq(schema.auraGifts.receiverUserId, regalado.id),
          ),
        );

      const res = await getPanel(coachToken);

      expect(res.statusCode).toBe(200);
      const fila = res.body.members.find((m) => m.memberId === regalado.id);
      expect(fila?.gift?.state).toBe("anulado");
      const otra = await darRegalo(coachToken, regalado);
      expect(otra.statusCode).toBe(409);
    });

    it("(10) para un admin coachGiftAmount y gift van en null en todas las filas", async () => {
      await alumno();
      const regalado = await alumno();
      expect((await darRegalo(coachToken, regalado)).statusCode).toBe(201);

      const res = await getPanel(adminToken);

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty("coachGiftAmount", null);
      expect(res.body.members.length).toBeGreaterThanOrEqual(2);
      for (const member of res.body.members) {
        expect(member).toHaveProperty("gift", null);
      }
    });

    it("(10b) admin de sede, admin y recepción con permiso ven el regalo en el panel; recepción sin permiso y de otra sede no", async () => {
      await alumno();

      const conRegalo = [
        await staffToken("admin_sede", cls.branchId),
        await staffToken("admin", cls.branchId),
        await staffToken("recepcion", cls.branchId, { canGiveAura: true }),
      ];
      for (const token of conRegalo) {
        const res = await getPanel(token);
        expect(res.statusCode).toBe(200);
        expect(res.body.coachGiftAmount).toBe(2);
        const conAsistencia = res.body.members.filter(
          (m) => m.attendanceId !== null,
        );
        expect(conAsistencia.length).toBeGreaterThanOrEqual(1);
        for (const member of conAsistencia) {
          expect(member.gift?.state).toBe("disponible");
        }
      }

      const otraSede = await otraClase({
        tz: "America/Argentina/Buenos_Aires",
      });
      const sinRegalo = [
        await staffToken("recepcion", cls.branchId),
        await staffToken("recepcion", otraSede.branchId, { canGiveAura: true }),
      ];
      for (const token of sinRegalo) {
        const res = await getPanel(token);
        expect(res.statusCode).toBe(200);
        expect(res.body.coachGiftAmount).toBeNull();
        for (const member of res.body.members) {
          expect(member.gift).toBeNull();
        }
      }
    });
  });

  // ── 11. el valor del regalo ────────────────────────────────────────────────

  describe("GET y PUT /api/admin/aura/gift-settings", () => {
    it("(11) admin_sede lee el valor (200) pero no lo cambia (403); 0 y 11 dan 400 y el valor no se pisa", async () => {
      const adminSede = await staffToken("admin_sede", cls.branchId);

      const lectura = await getSettings(adminSede);
      const escritura = await putSettings(adminSede, { coachGiftAmount: 5 });

      expect(lectura.statusCode).toBe(200);
      expect(lectura.body).toEqual({ coachGiftAmount: 2 });
      expect(escritura.statusCode).toBe(403);
      expect(escritura.body.code).toBe("REGALO_SIN_PERMISO");

      expect(
        (await putSettings(adminToken, { coachGiftAmount: 0 })).statusCode,
      ).toBe(400);
      expect(
        (await putSettings(adminToken, { coachGiftAmount: 11 })).statusCode,
      ).toBe(400);
      expect((await getSettings(adminToken)).body.coachGiftAmount).toBe(2);

      const ok = await putSettings(adminToken, { coachGiftAmount: 7 });
      expect(ok.statusCode).toBe(200);
      expect((await getSettings(adminSede)).body.coachGiftAmount).toBe(7);
    });

    it("(11b) el profe y la recepción no pueden leer ni cambiar el valor", async () => {
      const recepcion = await staffToken("recepcion", cls.branchId);

      for (const token of [coachToken, recepcion]) {
        expect((await getSettings(token)).statusCode).toBe(403);
        expect(
          (await putSettings(token, { coachGiftAmount: 9 })).statusCode,
        ).toBe(403);
      }
      expect((await getSettings(adminToken)).body.coachGiftAmount).toBe(2);
    });
  });

  // ── 12 y 13. módulo y aislamiento entre gimnasios ──────────────────────────

  describe("módulo apagado y aislamiento", () => {
    it("(12) con templo-gamification apagado en el gimnasio 2 el POST da 404", async () => {
      await setModuleFlag(app, TENANT_DOS, "templo-gamification", false);

      const res = await postGift(gym2.coachToken, {
        attendanceId: 1,
        reason: "tecnica",
      });

      expect(res.statusCode).toBe(404);
    });

    it("(13) un profe del gimnasio 2 no puede regalar por una asistencia del gimnasio 1: 404", async () => {
      await setModuleFlag(app, TENANT_DOS, "templo-gamification", true);
      const a = await alumno();

      const res = await darRegalo(gym2.coachToken, a);

      expect(res.statusCode).toBe(404);
      expect(res.body.code).toBe("REGALO_NO_ENCONTRADO");
      expect(await filasDelRegalo(a.id)).toEqual([]);
      expect(await ledgerSum(app, a.id)).toBe(0);
    });
  });

  // ── 14. conciliación ───────────────────────────────────────────────────────

  describe("conciliación", () => {
    it("(14) la Aura ganada de cada alumno tocado es la suma de su ledger", async () => {
      const a = await alumno();
      const b = await alumno();
      const c = await alumno();
      expect((await darRegalo(coachToken, a)).statusCode).toBe(201);
      expect(
        (await putSettings(adminToken, { coachGiftAmount: 5 })).statusCode,
      ).toBe(200);
      expect((await darRegalo(coachToken, b)).statusCode).toBe(201);
      // Un rechazo no deja rastro en el ledger de c.
      await setCommunityVisible(app, c.id, false);
      expect((await darRegalo(coachToken, c)).statusCode).toBe(409);

      for (const persona of [a, b, c]) {
        expect(await earnedOf(app, persona.id)).toBe(
          await ledgerSum(app, persona.id),
        );
      }
      expect(await ledgerSum(app, a.id)).toBe(2);
      expect(await ledgerSum(app, b.id)).toBe(5);
      expect(await ledgerSum(app, c.id)).toBe(0);
    });
  });
});
