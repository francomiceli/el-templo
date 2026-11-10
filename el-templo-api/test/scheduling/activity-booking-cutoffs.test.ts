/**
 * Cortes de reserva y cancelación por actividad (2026-11-10, migración 0326).
 *
 * `activities.booking_close_minutes` / `activities.cancel_close_minutes`:
 * minutos antes del inicio en que cierra la reserva / la cancelación desde la
 * app. NULL = default global (5 / 20, `booking-constants.ts`). Pedido original:
 * las clases de yoga cierran la reserva 30 min antes.
 *
 * Casos:
 *  (A) CRUD admin: crear con cortes, listarlos, `null` vuelve al default,
 *      ausencia de la key no los toca, validación de rango.
 *  (B) Reserva con corte propio (30): abierta a 40 min, cerrada a 25 min con
 *      mensaje explícito, "ya paso" una vez empezada la clase.
 *  (C) Reserva sin corte propio: se conserva el default de 5 min.
 *  (D) Cancelación con corte propio (60): cerrada a 45 min, con el número en
 *      el mensaje. Sin corte propio: se conserva el default de 20 min.
 *
 * RELOJ: `vi.setSystemTime` relativo al inicio REAL de la clase
 * (`buildClassDateTime` con la zona de la sede), así no depende de en qué
 * zona horaria está la sede de test. Se re-loguea después de cada salto de
 * reloj para que el access token no quede vencido o "del futuro".
 *
 * Molde: test/scheduling/especial-line-gating.test.ts (actividades/horarios
 * por la API admin, pase de Yoga por inserción directa).
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import {
  createTestApp,
  getAuthToken,
  registerUser,
  cleanAllTestData,
} from "../helpers";
import * as schema from "../../src/db/schema";
import { buildClassDateTime } from "../../src/modules/shared/date-utils";
import { tenantWhere } from "../../src/modules/shared/tenant";
import { TENANT_TEMPLO } from "../fixtures/second-tenant";

// `activities` es tabla strict del sentinel de tenancy: toda lectura directa
// de este archivo pasa por `tenantWhere`.
const TEMPLO_CTX = { tenantId: TENANT_TEMPLO };

const ADMIN_URL = "/api/admin/scheduling";
const RESERVE_URL = "/api/members/scheduling/reserve";
const MEMBER_BOOKINGS_URL = "/api/members/scheduling/bookings";

// Sábado. La sub del pase lo cubre (2026-02-14 .. 2026-04-15).
const CLASS_DATE = "2026-03-14";
const CLASS_START = "12:00";
const PASSWORD = "pass123456";

interface ActivityBody {
  id: number;
  bookingCloseMinutes: number | null;
  cancelCloseMinutes: number | null;
}

describe("Cortes de reserva/cancelación por actividad (0326)", () => {
  let app: FastifyInstance;
  let testBranchId: number;
  let classStartMs: number;
  let yogaPlanId: number;

  beforeAll(async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    app = await createTestApp();

    const [branch] = await app.db
      .select({ id: schema.branches.id, timezone: schema.branches.timezone })
      .from(schema.branches)
      .where(eq(schema.branches.isVirtual, false))
      .limit(1);
    testBranchId = branch.id;
    classStartMs = buildClassDateTime(
      CLASS_DATE,
      CLASS_START,
      branch.timezone,
    ).getTime();
  });

  afterAll(async () => {
    vi.useRealTimers();
    await app.close();
  });

  beforeEach(async () => {
    // Por defecto, el miércoles anterior: lejos de cualquier corte.
    setMinutesBeforeClass(3 * 24 * 60);
    await cleanAllTestData(app);
    const res = await app.db.insert(schema.subscriptionPlans).values({
      name: "Yoga — Pase cortes",
      planTier: "flex",
      bookingMode: "flexible",
      planCategory: "especial",
      priceRegular: 20000,
      priceZero: 20000,
      durationDays: 30,
      classesPerWeek: null,
      monthlyClassBudget: 8,
      specialLine: "Yoga",
    });
    yogaPlanId = Number(res[0].insertId);
  });

  // ─── fixtures ──────────────────────────────────────────────────────────

  /** Fija el reloj `minutes` minutos antes del inicio de la clase (negativo = después). */
  function setMinutesBeforeClass(minutes: number): void {
    vi.setSystemTime(new Date(classStartMs - minutes * 60_000));
  }

  async function adminToken(): Promise<string> {
    return getAuthToken(app, "admin@test.com", "adminpass123");
  }

  async function createActivity(
    name: string,
    cutoffs: {
      bookingCloseMinutes?: number | null;
      cancelCloseMinutes?: number | null;
    },
  ): Promise<ActivityBody> {
    const res = await app.inject({
      method: "POST",
      url: `${ADMIN_URL}/activities`,
      headers: { authorization: `Bearer ${await adminToken()}` },
      payload: { name, isSpecial: true, specialLine: "Yoga", ...cutoffs },
    });
    expect(res.statusCode).toBe(201);
    return JSON.parse(res.body) as ActivityBody;
  }

  async function createSaturdaySchedule(activityId: number): Promise<number> {
    const res = await app.inject({
      method: "POST",
      url: `${ADMIN_URL}/schedules`,
      headers: { authorization: `Bearer ${await adminToken()}` },
      payload: {
        branchId: testBranchId,
        activityId,
        dayOfWeek: 6,
        startTime: CLASS_START,
        endTime: "13:00",
      },
    });
    expect(res.statusCode).toBe(201);
    return JSON.parse(res.body).id as number;
  }

  /** Socio con pase de Yoga activo. Devuelve el email para re-loguear. */
  async function createMemberWithPass(email: string): Promise<string> {
    const result = await registerUser(app, {
      email,
      password: PASSWORD,
      branchId: testBranchId,
    });
    const userId = (result.user as { id: number }).id;
    await app.db.insert(schema.subscriptions).values({
      userId,
      planId: yogaPlanId,
      branchId: testBranchId,
      status: "active",
      startDate: "2026-02-14",
      endDate: "2026-04-15",
      pricePaid: 20000,
      priceTypeApplied: "regular",
      classesRemaining: 8,
    });
    return email;
  }

  async function reserve(
    email: string,
    scheduleId: number,
  ): Promise<{ statusCode: number; body: Record<string, unknown> }> {
    const token = await getAuthToken(app, email, PASSWORD);
    const res = await app.inject({
      method: "POST",
      url: RESERVE_URL,
      headers: { authorization: `Bearer ${token}` },
      payload: { scheduleId, date: CLASS_DATE },
    });
    return { statusCode: res.statusCode, body: JSON.parse(res.body) };
  }

  async function cancel(
    email: string,
    bookingId: number,
  ): Promise<{ statusCode: number; body: Record<string, unknown> }> {
    const token = await getAuthToken(app, email, PASSWORD);
    const res = await app.inject({
      method: "DELETE",
      url: `${MEMBER_BOOKINGS_URL}/${bookingId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    return { statusCode: res.statusCode, body: JSON.parse(res.body) };
  }

  // ─── (A) CRUD admin ────────────────────────────────────────────────────

  describe("(A) CRUD admin", () => {
    it("crear sin cortes → ambos null (default global)", async () => {
      const act = await createActivity("Yoga sin cortes", {});
      expect(act.bookingCloseMinutes).toBeNull();
      expect(act.cancelCloseMinutes).toBeNull();
    });

    it("crear con cortes → se devuelven y aparecen en el listado", async () => {
      const act = await createActivity("Yoga con cortes", {
        bookingCloseMinutes: 30,
        cancelCloseMinutes: 60,
      });
      expect(act.bookingCloseMinutes).toBe(30);
      expect(act.cancelCloseMinutes).toBe(60);

      const res = await app.inject({
        method: "GET",
        url: `${ADMIN_URL}/activities`,
        headers: { authorization: `Bearer ${await adminToken()}` },
      });
      expect(res.statusCode).toBe(200);
      const listed = (
        JSON.parse(res.body) as { activities: ActivityBody[] }
      ).activities.find((a) => a.id === act.id);
      expect(listed?.bookingCloseMinutes).toBe(30);
      expect(listed?.cancelCloseMinutes).toBe(60);
    });

    it("PUT sin las keys no toca los cortes; `null` explícito vuelve al default", async () => {
      const act = await createActivity("Yoga editable", {
        bookingCloseMinutes: 30,
        cancelCloseMinutes: 60,
      });
      const token = await adminToken();

      const rename = await app.inject({
        method: "PUT",
        url: `${ADMIN_URL}/activities/${act.id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { name: "Yoga editable 2" },
      });
      expect(rename.statusCode).toBe(200);
      const renamed = JSON.parse(rename.body) as ActivityBody;
      expect(renamed.bookingCloseMinutes).toBe(30);
      expect(renamed.cancelCloseMinutes).toBe(60);

      const reset = await app.inject({
        method: "PUT",
        url: `${ADMIN_URL}/activities/${act.id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { bookingCloseMinutes: null, cancelCloseMinutes: 15 },
      });
      expect(reset.statusCode).toBe(200);
      const after = JSON.parse(reset.body) as ActivityBody;
      expect(after.bookingCloseMinutes).toBeNull();
      expect(after.cancelCloseMinutes).toBe(15);

      const [row] = await app.db
        .select({
          booking: schema.activities.bookingCloseMinutes,
          cancel: schema.activities.cancelCloseMinutes,
        })
        .from(schema.activities)
        .where(
          and(
            tenantWhere(schema.activities, TEMPLO_CTX),
            eq(schema.activities.id, act.id),
          ),
        );
      expect(row).toEqual({ booking: null, cancel: 15 });
    });

    it.each([
      ["negativo", -1],
      ["más de un día", 1441],
      ["no entero", 2.5],
    ])("rechaza un corte %s → 400", async (_label, value) => {
      const token = await adminToken();
      const create = await app.inject({
        method: "POST",
        url: `${ADMIN_URL}/activities`,
        headers: { authorization: `Bearer ${token}` },
        payload: { name: `Yoga inválido ${value}`, bookingCloseMinutes: value },
      });
      expect(create.statusCode).toBe(400);

      const act = await createActivity(`Yoga válido ${value}`, {});
      const update = await app.inject({
        method: "PUT",
        url: `${ADMIN_URL}/activities/${act.id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { cancelCloseMinutes: value },
      });
      expect(update.statusCode).toBe(400);
    });

    it("acepta 0 (cierra justo al inicio)", async () => {
      const act = await createActivity("Yoga cero", {
        bookingCloseMinutes: 0,
        cancelCloseMinutes: 0,
      });
      expect(act.bookingCloseMinutes).toBe(0);
      expect(act.cancelCloseMinutes).toBe(0);
    });
  });

  // ─── (B) reserva con corte propio ──────────────────────────────────────

  describe("(B) reserva con corte de 30 min", () => {
    let scheduleId: number;

    beforeEach(async () => {
      const act = await createActivity("Yoga 30", { bookingCloseMinutes: 30 });
      scheduleId = await createSaturdaySchedule(act.id);
    });

    it("a 40 min del inicio → 201", async () => {
      const email = await createMemberWithPass("cut-b1@test.com");
      setMinutesBeforeClass(40);
      const { statusCode, body } = await reserve(email, scheduleId);
      expect(statusCode).toBe(201);
      expect(body.status).toBe("reservado");
    });

    it("a 25 min del inicio → 400 con el corte en el mensaje", async () => {
      const email = await createMemberWithPass("cut-b2@test.com");
      setMinutesBeforeClass(25);
      const { statusCode, body } = await reserve(email, scheduleId);
      expect(statusCode).toBe(400);
      expect(String(body.message)).toBe(
        "Las reservas de esta clase cierran 30 minutos antes del inicio",
      );
    });

    it("con la clase ya empezada → 400 'Este horario ya paso'", async () => {
      const email = await createMemberWithPass("cut-b3@test.com");
      setMinutesBeforeClass(-5);
      const { statusCode, body } = await reserve(email, scheduleId);
      expect(statusCode).toBe(400);
      expect(String(body.message)).toBe("Este horario ya paso");
    });
  });

  // ─── (C) reserva sin corte propio ──────────────────────────────────────

  describe("(C) reserva sin corte propio (default 5 min)", () => {
    let scheduleId: number;

    beforeEach(async () => {
      const act = await createActivity("Yoga default", {});
      scheduleId = await createSaturdaySchedule(act.id);
    });

    it("a 25 min del inicio → 201 (el corte de 30 no se filtra a otras actividades)", async () => {
      const email = await createMemberWithPass("cut-c1@test.com");
      setMinutesBeforeClass(25);
      const { statusCode } = await reserve(email, scheduleId);
      expect(statusCode).toBe(201);
    });

    it("a 3 min del inicio → 400 'Este horario ya paso' (mensaje de siempre)", async () => {
      const email = await createMemberWithPass("cut-c2@test.com");
      setMinutesBeforeClass(3);
      const { statusCode, body } = await reserve(email, scheduleId);
      expect(statusCode).toBe(400);
      expect(String(body.message)).toBe("Este horario ya paso");
    });
  });

  // ─── (D) cancelación ───────────────────────────────────────────────────

  describe("(D) cancelación", () => {
    it("corte propio de 60: a 45 min del inicio → 400 con el corte en el mensaje", async () => {
      const act = await createActivity("Yoga cancel 60", {
        cancelCloseMinutes: 60,
      });
      const scheduleId = await createSaturdaySchedule(act.id);
      const email = await createMemberWithPass("cut-d1@test.com");

      const booked = await reserve(email, scheduleId);
      expect(booked.statusCode).toBe(201);

      setMinutesBeforeClass(45);
      const { statusCode, body } = await cancel(email, booked.body.id as number);
      expect(statusCode).toBe(400);
      expect(String(body.message)).toBe(
        "No se puede cancelar menos de 60 minutos antes",
      );
    });

    it("corte propio de 60: a 90 min del inicio → se cancela", async () => {
      const act = await createActivity("Yoga cancel 60 ok", {
        cancelCloseMinutes: 60,
      });
      const scheduleId = await createSaturdaySchedule(act.id);
      const email = await createMemberWithPass("cut-d2@test.com");

      const booked = await reserve(email, scheduleId);
      expect(booked.statusCode).toBe(201);

      setMinutesBeforeClass(90);
      const { statusCode, body } = await cancel(email, booked.body.id as number);
      expect(statusCode).toBe(200);
      expect(body.status).toBe("cancelado");
    });

    it("sin corte propio: a 25 min se cancela y a 15 min no (default 20)", async () => {
      const act = await createActivity("Yoga cancel default", {});
      const scheduleId = await createSaturdaySchedule(act.id);
      const emailOk = await createMemberWithPass("cut-d3@test.com");
      const emailLate = await createMemberWithPass("cut-d4@test.com");

      const bookedOk = await reserve(emailOk, scheduleId);
      const bookedLate = await reserve(emailLate, scheduleId);
      expect(bookedOk.statusCode).toBe(201);
      expect(bookedLate.statusCode).toBe(201);

      setMinutesBeforeClass(25);
      const ok = await cancel(emailOk, bookedOk.body.id as number);
      expect(ok.statusCode).toBe(200);

      setMinutesBeforeClass(15);
      const late = await cancel(emailLate, bookedLate.body.id as number);
      expect(late.statusCode).toBe(400);
      expect(String(late.body.message)).toBe(
        "No se puede cancelar menos de 20 minutos antes",
      );
    });
  });
});
