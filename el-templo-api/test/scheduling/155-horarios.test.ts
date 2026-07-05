/**
 * Phase 155 Plan 02: horarios — clases simultáneas (HOR-01) + cupo efectivo
 * por actividad (HOR-03) + ABM del cupo (D-08).
 *
 * Garantiza por integración el comportamiento del backend de 155-01
 * (overlap re-scopeado por actividad, cupo efectivo por slot) más el ABM del
 * cupo añadido en este plan. Corre en CI contra el MySQL de test; el gate
 * local es solo tsc (no se corre el suite localmente).
 *
 * Casos:
 * Simultaneidad (D-01 / HOR-01):
 * - Solape de la MISMA actividad → 409.
 * - Solape de actividades DISTINTAS a la misma hora → 201.
 * - Back-to-back de la misma actividad (10-11 + 11-12) → 201 ([start,end)).
 * - PATCH de la actividad de un slot que provoca solape misma-actividad → 409.
 * Cupo efectivo (D-05/D-06/D-07 / HOR-03):
 * - Actividad con maxCapacity=1: el 2º socio cae a lista_espera (el menor).
 * - Actividad con maxCapacity NULL: hereda branch.maxCapacity (reserva firme).
 * ABM (D-08):
 * - POST /activities con maxCapacity lo persiste y lo devuelve.
 * - PUT /activities/:id con maxCapacity=null limpia el cupo.
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
import { eq } from "drizzle-orm";
import {
  createTestApp,
  getAuthToken,
  registerUser,
  cleanAllTestData,
  dateOffsetStr,
} from "../helpers";
import { branches } from "../../src/db/schema/branches";
import { activities } from "../../src/db/schema/activities";
import { users } from "../../src/db/schema/users";
import { financialTransactions } from "../../src/db/schema/financial-transactions";
import { transactionLinks } from "../../src/db/schema/transaction-links";

const ADMIN_URL = "/api/admin/scheduling";
const MEMBER_URL = "/api/members/scheduling";
const SUBSCRIPTIONS_URL = "/api/admin/subscriptions";

interface ActivityResponse {
  id: number;
  name: string;
  description: string | null;
  isActive: boolean;
  maxCapacity: number | null;
  createdAt: string;
  updatedAt: string;
}

describe("Phase 155: horarios — simultaneidad + cupo efectivo + ABM cupo", () => {
  let app: FastifyInstance;
  let adminToken: string;
  let adminUserId: number;
  let testBranchId: number;

  const basePlan = {
    name: "Plan Horarios 155",
    planTier: "flex",
    bookingMode: "flexible",
    priceRegular: 15000,
    priceZero: 10000,
    durationDays: 30,
    classesPerWeek: 3,
    multiBranch: false,
  };

  beforeAll(async () => {
    // Miércoles 10:00 UTC — igual que scheduling.test.ts, para que los slots
    // futuros caigan siempre dentro de Lun-Sáb.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-03-11T10:00:00Z"));

    app = await createTestApp();
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");

    const [adminUser] = await app.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, "admin@test.com"));
    adminUserId = adminUser.id;

    const [branch] = await app.db
      .select({ id: branches.id })
      .from(branches)
      .where(eq(branches.isVirtual, false));
    testBranchId = branch.id;
  });

  afterAll(async () => {
    vi.useRealTimers();
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
  });

  // ─── Helpers ───────────────────────────────────────────────────────────────

  async function createActivity(
    name: string,
    maxCapacity?: number | null,
  ): Promise<ActivityResponse> {
    const payload: Record<string, unknown> = { name };
    if (maxCapacity !== undefined) payload.maxCapacity = maxCapacity;
    const res = await app.inject({
      method: "POST",
      url: `${ADMIN_URL}/activities`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload,
    });
    expect(res.statusCode).toBe(201);
    return JSON.parse(res.body) as ActivityResponse;
  }

  async function postSchedule(
    activityId: number,
    dayOfWeek: number,
    startTime: string,
    endTime: string,
  ): Promise<{ statusCode: number; body: unknown }> {
    const res = await app.inject({
      method: "POST",
      url: `${ADMIN_URL}/schedules`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        branchId: testBranchId,
        activityId,
        dayOfWeek,
        startTime,
        endTime,
      },
    });
    return { statusCode: res.statusCode, body: JSON.parse(res.body) };
  }

  async function patchSlotActivity(
    scheduleId: number,
    activityId: number,
  ): Promise<{ statusCode: number; body: unknown }> {
    const res = await app.inject({
      method: "PATCH",
      url: `${ADMIN_URL}/schedules/${scheduleId}/activity`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { activityId },
    });
    return { statusCode: res.statusCode, body: JSON.parse(res.body) };
  }

  async function toggleSchedule(
    scheduleId: number,
    isActive: boolean,
  ): Promise<{ statusCode: number; body: unknown }> {
    const res = await app.inject({
      method: "PUT",
      url: `${ADMIN_URL}/schedules/${scheduleId}/toggle`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { isActive },
    });
    return { statusCode: res.statusCode, body: JSON.parse(res.body) };
  }

  async function createPlan(): Promise<{ id: number }> {
    const res = await app.inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}/plans`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: basePlan,
    });
    expect(res.statusCode).toBe(201);
    return JSON.parse(res.body) as { id: number };
  }

  async function recordPayment(
    memberId: number,
    amount: number,
    subscriptionId: number,
  ): Promise<void> {
    const [inserted] = await app.db.insert(financialTransactions).values({
      memberId,
      kind: "plan_charge",
      direction: "inflow",
      amount,
      currency: "ARS",
      paymentMethod: "cash",
      transactionDate: "2026-03-10",
      effectiveDate: "2026-03-10",
      branchId: testBranchId,
      recordedBy: adminUserId,
    });
    const txnId = (inserted as { insertId: number }).insertId;
    await app.db.insert(transactionLinks).values({
      transactionId: txnId,
      targetKind: "subscription",
      targetId: subscriptionId,
      allocatedAmount: amount,
    });
  }

  /**
   * Da de alta un socio con plan activo y devuelve su token para reservar.
   * Emails distintos por socio para poder llenar un slot con varios.
   */
  async function setupMember(
    email: string,
    planId: number,
  ): Promise<{ memberId: number; token: string }> {
    const result = await registerUser(app, {
      email,
      password: "pass123456",
      firstName: "Socio",
      lastName: "155",
      branchId: testBranchId,
    });
    const memberId = (result.user as { id: number }).id;

    const assignRes = await app.inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}/members/${memberId}/subscription/assign`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        planId,
        branchId: testBranchId,
        startDate: dateOffsetStr(-25),
        priceTypeApplied: "regular",
        paymentMethod: "cash",
      },
    });
    expect(assignRes.statusCode).toBe(201);
    const subscription = JSON.parse(assignRes.body) as { id: number };
    await recordPayment(memberId, basePlan.priceRegular, subscription.id);

    const token = await getAuthToken(app, email, "pass123456");
    return { memberId, token };
  }

  async function reserve(
    token: string,
    scheduleId: number,
    date: string,
  ): Promise<{ statusCode: number; body: { id?: number; status?: string } }> {
    const res = await app.inject({
      method: "POST",
      url: `${MEMBER_URL}/reserve`,
      headers: { authorization: `Bearer ${token}` },
      payload: { scheduleId, date },
    });
    return {
      statusCode: res.statusCode,
      body: JSON.parse(res.body) as { id?: number; status?: string },
    };
  }

  function getDateForDayOfWeek(dayOfWeek: number): string {
    const now = new Date();
    const currentDay = now.getDay();
    const diffToMonday = currentDay === 0 ? -6 : 1 - currentDay;
    const monday = new Date(now);
    monday.setDate(now.getDate() + diffToMonday);
    const target = new Date(monday);
    target.setDate(monday.getDate() + (dayOfWeek - 1));
    return target.toISOString().split("T")[0];
  }

  /** Slot futuro dentro de la semana pinneada (miércoles 10:00). */
  function getFutureSlot(): {
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    date: string;
  } {
    // Jueves (4) 20:00 — siempre por delante del "ahora" pinneado.
    const dayOfWeek = 4;
    return {
      dayOfWeek,
      startTime: "20:00",
      endTime: "21:00",
      date: getDateForDayOfWeek(dayOfWeek),
    };
  }

  // ─── Simultaneidad (HOR-01) ─────────────────────────────────────────────────

  describe("Simultaneidad (HOR-01 / D-01)", () => {
    it("rechaza solape de la MISMA actividad (409)", async () => {
      const activity = await createActivity("Musculacion");
      const first = await postSchedule(activity.id, 1, "10:00", "11:00");
      expect(first.statusCode).toBe(201);

      const overlap = await postSchedule(activity.id, 1, "10:30", "11:30");
      expect(overlap.statusCode).toBe(409);
    });

    it("permite solape de actividades DISTINTAS a la misma hora (201)", async () => {
      const musculacion = await createActivity("Musculacion");
      const yoga = await createActivity("Yoga");

      const a = await postSchedule(musculacion.id, 1, "10:00", "11:00");
      expect(a.statusCode).toBe(201);

      // Misma sucursal/día/hora, actividad distinta → convive.
      const b = await postSchedule(yoga.id, 1, "10:00", "11:00");
      expect(b.statusCode).toBe(201);
    });

    it("permite back-to-back de la misma actividad (10-11 + 11-12)", async () => {
      const activity = await createActivity("Musculacion");
      const first = await postSchedule(activity.id, 1, "10:00", "11:00");
      expect(first.statusCode).toBe(201);
      const second = await postSchedule(activity.id, 1, "11:00", "12:00");
      expect(second.statusCode).toBe(201);
    });

    it("rechaza PATCH de actividad que provoca solape misma-actividad (409)", async () => {
      const musculacion = await createActivity("Musculacion");
      const yoga = await createActivity("Yoga");

      // Dos slots a la misma hora, actividades distintas (permitido).
      const slotYoga = await postSchedule(yoga.id, 1, "10:00", "11:00");
      expect(slotYoga.statusCode).toBe(201);
      const slotMusc = await postSchedule(musculacion.id, 1, "10:00", "11:00");
      expect(slotMusc.statusCode).toBe(201);
      const slotMuscId = (slotMusc.body as { id: number }).id;

      // Cambiar el slot de Musculación → Yoga colisiona con el slot de Yoga
      // a la misma hora (gap cerrado en 155-01).
      const patch = await patchSlotActivity(slotMuscId, yoga.id);
      expect(patch.statusCode).toBe(409);
    });

    it("rechaza reactivar un slot cuya ventana fue tomada por otro de la misma actividad (409)", async () => {
      const activity = await createActivity("Musculacion");

      // (1) Slot A activo. (2) Se desactiva → libera la ventana.
      const slotA = await postSchedule(activity.id, 1, "10:00", "11:00");
      expect(slotA.statusCode).toBe(201);
      const slotAId = (slotA.body as { id: number }).id;

      const off = await toggleSchedule(slotAId, false);
      expect(off.statusCode).toBe(200);

      // (3) Slot B misma actividad/hora — pasa porque A está inactivo.
      const slotB = await postSchedule(activity.id, 1, "10:00", "11:00");
      expect(slotB.statusCode).toBe(201);

      // (4) Reactivar A ahora colisionaría con B → 409 (gap WR-01).
      const on = await toggleSchedule(slotAId, true);
      expect(on.statusCode).toBe(409);
    });

    it("permite reactivar un slot cuando la ventana sigue libre (200)", async () => {
      const activity = await createActivity("Musculacion");
      const slotA = await postSchedule(activity.id, 1, "10:00", "11:00");
      expect(slotA.statusCode).toBe(201);
      const slotAId = (slotA.body as { id: number }).id;

      const off = await toggleSchedule(slotAId, false);
      expect(off.statusCode).toBe(200);
      // Sin slot que ocupe la ventana → la reactivación no colisiona.
      const on = await toggleSchedule(slotAId, true);
      expect(on.statusCode).toBe(200);
    });
  });

  // ─── Cupo efectivo (HOR-03) ─────────────────────────────────────────────────

  describe("Cupo efectivo (HOR-03 / D-05..D-07)", () => {
    it("cupo de actividad < sucursal: el 2º socio cae a lista_espera", async () => {
      const activity = await createActivity("Yoga", 1);
      const slotDef = getFutureSlot();
      const slot = await postSchedule(
        activity.id,
        slotDef.dayOfWeek,
        slotDef.startTime,
        slotDef.endTime,
      );
      expect(slot.statusCode).toBe(201);
      const scheduleId = (slot.body as { id: number }).id;

      const plan = await createPlan();
      const socioA = await setupMember("horarios-155-a@test.com", plan.id);
      const socioB = await setupMember("horarios-155-b@test.com", plan.id);

      const first = await reserve(socioA.token, scheduleId, slotDef.date);
      expect(first.statusCode).toBe(201);
      expect(first.body.status).toBe("reservado");

      // Cupo efectivo = min por actividad (1), aunque branch.maxCapacity=22.
      const second = await reserve(socioB.token, scheduleId, slotDef.date);
      expect(second.statusCode).toBe(201);
      expect(second.body.status).toBe("lista_espera");
    });

    it("cupo de actividad NULL hereda branch.maxCapacity (reserva firme)", async () => {
      const activity = await createActivity("Yoga", null);
      const slotDef = getFutureSlot();
      const slot = await postSchedule(
        activity.id,
        slotDef.dayOfWeek,
        slotDef.startTime,
        slotDef.endTime,
      );
      expect(slot.statusCode).toBe(201);
      const scheduleId = (slot.body as { id: number }).id;

      const plan = await createPlan();
      const socio = await setupMember("horarios-155-c@test.com", plan.id);

      // branch.maxCapacity default = 22 → la reserva es firme, no lista_espera.
      const res = await reserve(socio.token, scheduleId, slotDef.date);
      expect(res.statusCode).toBe(201);
      expect(res.body.status).toBe("reservado");
    });
  });

  // ─── ABM del cupo (D-08) ────────────────────────────────────────────────────

  describe("ABM del cupo (D-08)", () => {
    it("POST /activities persiste y devuelve maxCapacity", async () => {
      const activity = await createActivity("Yoga", 8);
      expect(activity.maxCapacity).toBe(8);

      const [row] = await app.db
        .select({ maxCapacity: activities.maxCapacity })
        .from(activities)
        .where(eq(activities.id, activity.id));
      expect(row.maxCapacity).toBe(8);
    });

    it("PUT /activities/:id con maxCapacity=null limpia el cupo", async () => {
      const activity = await createActivity("Yoga", 8);
      expect(activity.maxCapacity).toBe(8);

      const res = await app.inject({
        method: "PUT",
        url: `${ADMIN_URL}/activities/${activity.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { maxCapacity: null },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as ActivityResponse;
      expect(body.maxCapacity).toBeNull();

      const [row] = await app.db
        .select({ maxCapacity: activities.maxCapacity })
        .from(activities)
        .where(eq(activities.id, activity.id));
      expect(row.maxCapacity).toBeNull();
    });
  });
});
