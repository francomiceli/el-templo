/**
 * Fase 215 (plan 10; SC-7, D-20, D-21) — lista de regalos y medición del staff:
 *   GET /api/admin/aura/gifts?branchId&days&includeVoided
 *
 * Los regalos se siembran por SQL (`seedGift`): este test mide la lectura, no la
 * regla de dar. Fechas relativas al día local de la sede (nada fijo) y personas
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
  GIFT_CTX,
  cleanupGiftClasses,
  seedAttendance,
  seedGift,
  seedGiftClass,
  seedMember,
  type GiftClass,
} from "./_gift-fixtures";

const STAFF_PASSWORD = "staff-pass-215";
const ADMIN_EMAIL = "admin@test.com";
const ADMIN_PASSWORD = "adminpass123";

interface GiftItem {
  id: number;
  sessionDate: string;
  startTime: string | null;
  giverName: string;
  giverKind: "alumno" | "profe";
  receiverName: string;
  reason: string;
  amount: number;
  status: "vigente" | "anulado";
  voidCause: string | null;
  voidedByName: string | null;
}

interface WeekUsage {
  weekStart: string;
  studentGifts: number;
  coachGifts: number;
  attendees: number;
  giversPct: number;
}

interface ListBody {
  items: GiftItem[];
  weeks: WeekUsage[];
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

describe("Fase 215-10: lista de regalos y medición para el staff", () => {
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
    const email = `staff-215-list-${role}-${staffSeq}-${Date.now().toString(36)}@test.com`;
    const lastName = `Lista${staffSeq}`;
    const id = await createStaffUser(app, {
      email,
      password: STAFF_PASSWORD,
      firstName: "Staff",
      lastName,
      role,
      branchId,
    });
    const token = await getAuthToken(app, email, STAFF_PASSWORD);
    return { id, token, fullName: `Staff ${lastName}` };
  }

  async function otraClase(
    opts: Parameters<typeof seedGiftClass>[1] = {},
  ): Promise<GiftClass> {
    const nueva = await seedGiftClass(app, opts);
    extraClasses.push(nueva);
    return nueva;
  }

  /** Alumno de la sede de la clase, con su nombre completo. */
  async function alumno(clase: GiftClass = cls) {
    const person = await seedMember(app, {
      branchId: clase.branchId,
      status: "activo",
    });
    return { ...person, fullName: `${person.firstName} ${person.lastName}` };
  }

  /** Alumno que fue a la clase (con asistencia por QR). */
  async function asistente(
    sessionDate: string,
    source: "qr" | "manual" | "wellhub" | "wellhub_manual" = "qr",
    status: "activo" | "wellhub" = "activo",
  ) {
    const person = await seedMember(app, { branchId: cls.branchId, status });
    const attendanceId = await seedAttendance(app, {
      memberId: person.id,
      branchId: cls.branchId,
      scheduleId: cls.scheduleId,
      sessionDate,
      source,
    });
    return { ...person, attendanceId };
  }

  async function nombreDe(userId: number): Promise<string> {
    const [row] = await app.db
      .select({
        firstName: schema.users.firstName,
        lastName: schema.users.lastName,
      })
      .from(schema.users)
      .where(
        and(tenantWhere(schema.users, GIFT_CTX), eq(schema.users.id, userId)),
      );
    return `${row.firstName} ${row.lastName}`.trim();
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

  /** Marca un regalo sembrado como anulado por el staff. */
  async function anularPorSql(
    giftId: number,
    voidedByUserId: number,
  ): Promise<void> {
    await app.db
      .update(schema.auraGifts)
      .set({
        status: "anulado",
        voidedByUserId,
        voidedAt: new Date(),
        voidCause: "staff",
      })
      .where(
        and(
          tenantWhere(schema.auraGifts, GIFT_CTX),
          eq(schema.auraGifts.id, giftId),
        ),
      );
  }

  // ── Pedidos ────────────────────────────────────────────────────────────────

  async function listar(
    token: string,
    query: Record<string, string | number | boolean> = {},
  ): Promise<{ statusCode: number; body: ListBody & ErrorBody }> {
    const qs = new URLSearchParams(
      Object.entries(query).map(([k, v]) => [k, String(v)]),
    ).toString();
    const res = await app.inject({
      method: "GET",
      url: `/api/admin/aura/gifts${qs ? `?${qs}` : ""}`,
      headers: { authorization: `Bearer ${token}` },
    });
    return {
      statusCode: res.statusCode,
      body: res.json() as ListBody & ErrorBody,
    };
  }

  // ── 1. la lista ───────────────────────────────────────────────────────────

  describe("lista (D-20)", () => {
    it("(1) trae los regalos del período en orden, con nombres completos, motivo, puntos y marca de profe", async () => {
      const coach = await staff("coach", cls.branchId);
      const g = await alumno();
      const a = await alumno();
      const b = await alumno();
      const delAlumno = await seedGift(app, {
        giverUserId: g.id,
        receiverUserId: a.id,
        branchId: cls.branchId,
        scheduleId: cls.scheduleId,
        sessionDate: addDays(cls.today, -2),
        reason: "tecnica",
      });
      const delProfe = await seedGift(app, {
        giverUserId: coach.id,
        receiverUserId: b.id,
        giverKind: "profe",
        branchId: cls.branchId,
        scheduleId: cls.scheduleId,
        sessionDate: cls.sessionDate,
        reason: "constancia",
        amount: 3,
      });

      const res = await listar(adminToken, { branchId: cls.branchId });

      expect(res.statusCode).toBe(200);
      expect(res.body.items.map((i) => i.id)).toEqual([delProfe, delAlumno]);
      const [profe, alumnoItem] = res.body.items;
      expect(profe).toMatchObject({
        giverName: coach.fullName,
        giverKind: "profe",
        receiverName: b.fullName,
        reason: "constancia",
        amount: 3,
        status: "vigente",
        sessionDate: cls.sessionDate,
        startTime: cls.startTime,
        voidCause: null,
        voidedByName: null,
      });
      expect(alumnoItem).toMatchObject({
        giverName: g.fullName,
        giverKind: "alumno",
        receiverName: a.fullName,
        reason: "tecnica",
        amount: 1,
        sessionDate: addDays(cls.today, -2),
      });
    });

    it("(2) los anulados se ocultan por defecto y con includeVoided salen con la causa y quién anuló", async () => {
      const g = await alumno();
      const a = await alumno();
      const vigente = await seedGift(app, {
        giverUserId: g.id,
        receiverUserId: a.id,
        branchId: cls.branchId,
        scheduleId: cls.scheduleId,
        sessionDate: cls.sessionDate,
      });
      const g2 = await alumno();
      const anulado = await seedGift(app, {
        giverUserId: g2.id,
        receiverUserId: a.id,
        branchId: cls.branchId,
        scheduleId: cls.scheduleId,
        sessionDate: cls.sessionDate,
      });
      const quien = await adminId();
      await anularPorSql(anulado, quien);

      const oculto = await listar(adminToken);
      const visible = await listar(adminToken, { includeVoided: true });

      expect(oculto.body.items.map((i) => i.id)).toEqual([vigente]);
      expect(visible.body.items.map((i) => i.id).sort()).toEqual(
        [vigente, anulado].sort(),
      );
      const fila = visible.body.items.find((i) => i.id === anulado);
      expect(fila).toMatchObject({
        status: "anulado",
        voidCause: "staff",
        voidedByName: await nombreDe(quien),
      });
    });

    it("(3) days=7 deja afuera un regalo de hace 10 días, days=30 lo incluye y days=90 suma el de hace 40", async () => {
      const g = await alumno();
      const a = await alumno();
      const g2 = await alumno();
      const hace10 = await seedGift(app, {
        giverUserId: g.id,
        receiverUserId: a.id,
        branchId: cls.branchId,
        scheduleId: cls.scheduleId,
        sessionDate: addDays(cls.today, -10),
      });
      const hace40 = await seedGift(app, {
        giverUserId: g2.id,
        receiverUserId: a.id,
        branchId: cls.branchId,
        scheduleId: cls.scheduleId,
        sessionDate: addDays(cls.today, -40),
      });

      const d7 = await listar(adminToken, { branchId: cls.branchId });
      const d30 = await listar(adminToken, {
        branchId: cls.branchId,
        days: 30,
      });
      const d90 = await listar(adminToken, {
        branchId: cls.branchId,
        days: 90,
      });

      expect(d7.body.items).toHaveLength(0);
      expect(d30.body.items.map((i) => i.id)).toEqual([hace10]);
      expect(d90.body.items.map((i) => i.id)).toEqual([hace10, hace40]);
    });

    it("(3b) un days fuera de 7, 30 o 90 da 400", async () => {
      const res = await listar(adminToken, { days: 15 });

      expect(res.statusCode).toBe(400);
    });
  });

  // ── 4 y 5. quién la ve y dónde ────────────────────────────────────────────

  describe("alcance y permisos", () => {
    it("(4) el admin_sede sin branchId ve solo sus sedes, y con un branchId ajeno recibe 403", async () => {
      const adminSede = await staff("admin_sede", cls.branchId);
      const g = await alumno();
      const a = await alumno();
      const propio = await seedGift(app, {
        giverUserId: g.id,
        receiverUserId: a.id,
        branchId: cls.branchId,
        scheduleId: cls.scheduleId,
        sessionDate: cls.sessionDate,
      });
      const otra = await otraClase({ tz: "Pacific/Auckland" });
      const g2 = await alumno(otra);
      const a2 = await alumno(otra);
      const ajeno = await seedGift(app, {
        giverUserId: g2.id,
        receiverUserId: a2.id,
        branchId: otra.branchId,
        scheduleId: otra.scheduleId,
        sessionDate: cls.sessionDate,
      });

      const sinSede = await listar(adminSede.token);
      const conSuSede = await listar(adminSede.token, {
        branchId: cls.branchId,
      });
      const conSedeAjena = await listar(adminSede.token, {
        branchId: otra.branchId,
      });
      const delAdmin = await listar(adminToken);

      expect(sinSede.statusCode).toBe(200);
      expect(sinSede.body.items.map((i) => i.id)).toEqual([propio]);
      expect(conSuSede.body.items.map((i) => i.id)).toEqual([propio]);
      expect(conSedeAjena.statusCode).toBe(403);
      expect(conSedeAjena.body.code).toBe("BRANCH_OUT_OF_SCOPE");
      // El admin del gimnasio sí ve las dos sedes.
      expect(delAdmin.body.items.map((i) => i.id).sort()).toEqual(
        [propio, ajeno].sort(),
      );
    });

    it("(5) un profe y la recepción reciben 403 y no ven la lista", async () => {
      const coach = await staff("coach", cls.branchId);
      const recepcion = await staff("recepcion", cls.branchId);
      const g = await alumno();
      const a = await alumno();
      await seedGift(app, {
        giverUserId: g.id,
        receiverUserId: a.id,
        branchId: cls.branchId,
        scheduleId: cls.scheduleId,
        sessionDate: cls.sessionDate,
      });

      const delProfe = await listar(coach.token);
      const deRecepcion = await listar(recepcion.token);

      expect(delProfe.statusCode).toBe(403);
      expect(delProfe.body.code).toBe("REGALO_SIN_PERMISO");
      expect(delProfe.body.items).toBeUndefined();
      expect(deRecepcion.statusCode).toBe(403);
      expect(deRecepcion.body.items).toBeUndefined();
    });

    it("(8) el admin del gimnasio 2 no ve regalos ni asistencias del gimnasio 1", async () => {
      await setModuleFlag(app, TENANT_DOS, "templo-gamification", true);
      const g = await asistente(cls.sessionDate);
      const a = await asistente(cls.sessionDate);
      await seedGift(app, {
        giverUserId: g.id,
        receiverUserId: a.id,
        branchId: cls.branchId,
        scheduleId: cls.scheduleId,
        sessionDate: cls.sessionDate,
      });

      const res = await listar(gym2.adminToken, { includeVoided: true });

      expect(res.statusCode).toBe(200);
      expect(res.body.items).toHaveLength(0);
      expect(res.body.weeks).toHaveLength(4);
      for (const week of res.body.weeks) {
        expect(week).toMatchObject({
          studentGifts: 0,
          coachGifts: 0,
          attendees: 0,
          giversPct: 0,
        });
      }
    });
  });

  // ── 6 y 7. la medición ────────────────────────────────────────────────────

  describe("medición de las últimas 4 semanas (D-21)", () => {
    it("(6) cuenta solo regalos vigentes y asistentes sin staff ni Wellhub: 2 de 3 es 67 %", async () => {
      const semana = giftWeekRange(cls.today).start;
      const coach = await staff("coach", cls.branchId);
      const a = await asistente(semana);
      const b = await asistente(semana, "manual");
      const c = await asistente(semana);
      // No cuentan: una visita Wellhub y un profe que fue a la clase.
      await asistente(semana, "wellhub", "wellhub");
      await seedAttendance(app, {
        memberId: coach.id,
        branchId: cls.branchId,
        scheduleId: cls.scheduleId,
        sessionDate: semana,
      });
      const comunes = {
        branchId: cls.branchId,
        scheduleId: cls.scheduleId,
        sessionDate: semana,
      };
      await seedGift(app, {
        giverUserId: a.id,
        receiverUserId: c.id,
        giverAttendanceId: a.attendanceId,
        receiverAttendanceId: c.attendanceId,
        ...comunes,
      });
      await seedGift(app, {
        giverUserId: b.id,
        receiverUserId: c.id,
        giverAttendanceId: b.attendanceId,
        receiverAttendanceId: c.attendanceId,
        ...comunes,
      });
      // Anulado: no cuenta como regalo ni hace que C sea quien regaló.
      const anulado = await seedGift(app, {
        giverUserId: c.id,
        receiverUserId: a.id,
        giverAttendanceId: c.attendanceId,
        receiverAttendanceId: a.attendanceId,
        ...comunes,
      });
      await anularPorSql(anulado, await adminId());
      // Del profe: cuenta como regalo de profe, no como alumno que regaló.
      await seedGift(app, {
        giverUserId: coach.id,
        receiverUserId: a.id,
        giverKind: "profe",
        receiverAttendanceId: a.attendanceId,
        ...comunes,
      });

      const res = await listar(adminToken, { branchId: cls.branchId });

      expect(res.statusCode).toBe(200);
      expect(res.body.weeks[0]).toEqual({
        weekStart: semana,
        studentGifts: 2,
        coachGifts: 1,
        attendees: 3,
        giversPct: 67,
      });
    });

    it("(7) trae 4 semanas con la actual primero y reparte los regalos por su semana", async () => {
      const semanaActual = giftWeekRange(cls.today).start;
      const g = await alumno();
      const a = await alumno();
      await seedGift(app, {
        giverUserId: g.id,
        receiverUserId: a.id,
        branchId: cls.branchId,
        scheduleId: cls.scheduleId,
        sessionDate: addDays(semanaActual, -3),
      });

      const res = await listar(adminToken, { branchId: cls.branchId });

      expect(res.body.weeks.map((w) => w.weekStart)).toEqual([
        semanaActual,
        addDays(semanaActual, -7),
        addDays(semanaActual, -14),
        addDays(semanaActual, -21),
      ]);
      expect(res.body.weeks.map((w) => w.studentGifts)).toEqual([0, 1, 0, 0]);
      expect(res.body.weeks[0]).toMatchObject({ attendees: 0, giversPct: 0 });
    });

    it("(7b) sin filtro de sede las semanas se miden con el día de Buenos Aires", async () => {
      const semana = giftWeekRange(todayInTz(DEFAULT_TENANT_TIMEZONE)).start;

      const res = await listar(adminToken);

      expect(res.statusCode).toBe(200);
      expect(res.body.weeks[0].weekStart).toBe(semana);
    });
  });
});
