/**
 * Renewal with explicit schedule selection (staff request 2026-07-10).
 *
 * Before this feature, POST /subscription/renew always inherited the previous
 * period's subscription_schedules — same-plan renewals (Flex+ → Flex+) had no
 * way to load turnos during the renewal. Now the body accepts an optional
 * `scheduleIds`: omitted → inherit (legacy), provided → replaces inheritance.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq, and, gte, inArray } from "drizzle-orm";
import { createTestApp, getAuthToken, cleanAllTestData } from "../helpers";
import { schedules } from "../../src/db/schema/schedules";
import { activities } from "../../src/db/schema/activities";
import { bookings } from "../../src/db/schema/bookings";
import { subscriptionSchedules } from "../../src/db/schema/subscription-schedules";
import { subscriptions } from "../../src/db/schema/subscriptions";
import { TENANT_TEMPLO } from "../fixtures/second-tenant";
import {
  SUBSCRIPTIONS_URL,
  createPlan,
  createMember,
  assignPlan,
  todayStr,
  dateOffsetStr,
} from "./_helpers";

describe("Subscriptions API — Renewal with scheduleIds", () => {
  let app: FastifyInstance;
  let adminToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
  });

  /** Insert an activity + a schedule slot directly (branch 1). */
  async function createSlot(
    activityName: string,
    dayOfWeek: number,
    startTime = "08:00",
  ): Promise<number> {
    let [act] = await app.db
      .select({ id: activities.id })
      .from(activities)
      .where(eq(activities.name, activityName));
    if (!act) {
      const [inserted] = await app.db
        .insert(activities)
        .values({ name: activityName, description: "test" })
        .$returningId();
      act = { id: inserted.id };
    }
    const endHour = String(parseInt(startTime.slice(0, 2), 10) + 1).padStart(
      2,
      "0",
    );
    const [slotRow] = await app.db
      .insert(schedules)
      .values({
        tenantId: TENANT_TEMPLO,
        branchId: 1,
        activityId: act.id,
        dayOfWeek,
        startTime,
        endTime: `${endHour}:00`,
        isActive: true,
      })
      .$returningId();
    return slotRow.id;
  }

  async function renew(
    userId: number,
    payload: Record<string, unknown> = {},
  ): Promise<{ statusCode: number; body: Record<string, unknown> }> {
    const res = await app.inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}/members/${userId}/subscription/renew`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { paymentMethod: "cash", ...payload },
    });
    return { statusCode: res.statusCode, body: JSON.parse(res.body) };
  }

  async function anchorsOf(subscriptionId: number): Promise<number[]> {
    const rows = await app.db
      .select({ scheduleId: subscriptionSchedules.scheduleId })
      .from(subscriptionSchedules)
      .where(
        and(
          eq(subscriptionSchedules.tenantId, TENANT_TEMPLO),
          eq(subscriptionSchedules.subscriptionId, subscriptionId),
        ),
      );
    return rows.map((r) => r.scheduleId).sort((a, b) => a - b);
  }

  it("flexible sin anclas previas: renew con scheduleIds carga turnos y genera reservas del nuevo período", async () => {
    // El caso reportado: Flex+ (flexible) renovado con el mismo plan.
    const plan = await createPlan(app, adminToken, {
      name: "Flex+ Renewal Turnos",
      bookingMode: "flexible",
      classesPerWeek: 3,
    });
    const member = await createMember(app, {
      email: "renew-flex@test.com",
      dni: "72040001",
    });
    // Asignación SIN turnos (reserva ad-hoc durante el primer período).
    const assignResult = await assignPlan(app, adminToken, member.id, {
      planId: plan.id,
      startDate: todayStr(),
      priceOverrideAmount: 0,
      priceOverrideReason: "test no-charge",
    });
    expect(assignResult.statusCode).toBe(201);
    const oldSubId = assignResult.body.id as number;
    expect(await anchorsOf(oldSubId)).toEqual([]);

    const slotA = await createSlot("RenewFlexAct", 1);
    const slotB = await createSlot("RenewFlexAct", 3);

    const { statusCode, body } = await renew(member.id, {
      scheduleIds: [slotA, slotB],
    });
    expect(statusCode).toBe(201);
    const newSubId = body.id as number;

    // La sub nueva nace CON los turnos elegidos, sin tocar la anterior.
    expect(await anchorsOf(newSubId)).toEqual(
      [slotA, slotB].sort((a, b) => a - b),
    );
    expect(await anchorsOf(oldSubId)).toEqual([]);

    // Y con reservas materializadas dentro del nuevo período.
    const newStart = body.startDate as string;
    const generated = await app.db
      .select({ id: bookings.id })
      .from(bookings)
      .where(
        and(
          eq(bookings.tenantId, TENANT_TEMPLO),
          eq(bookings.memberId, member.id),
          inArray(bookings.scheduleId, [slotA, slotB]),
          gte(bookings.bookingDate, newStart),
        ),
      );
    expect(generated.length).toBeGreaterThan(0);
  });

  it("sin scheduleIds hereda los turnos del período anterior (no regresión)", async () => {
    const plan = await createPlan(app, adminToken, {
      name: "Fixed Renewal Herencia",
      bookingMode: "fixed",
      classesPerWeek: 1,
    });
    const member = await createMember(app, {
      email: "renew-inherit@test.com",
      dni: "72040002",
    });
    const slotA = await createSlot("RenewInheritAct", 2);
    const assignResult = await assignPlan(app, adminToken, member.id, {
      planId: plan.id,
      startDate: todayStr(),
      scheduleIds: [slotA],
      priceOverrideAmount: 0,
      priceOverrideReason: "test no-charge",
    });
    expect(assignResult.statusCode).toBe(201);

    const { statusCode, body } = await renew(member.id);
    expect(statusCode).toBe(201);
    expect(await anchorsOf(body.id as number)).toEqual([slotA]);
  });

  it("con scheduleIds reemplaza la herencia (cambio de turno al renovar)", async () => {
    const plan = await createPlan(app, adminToken, {
      name: "Fixed Renewal Swap",
      bookingMode: "fixed",
      classesPerWeek: 1,
    });
    const member = await createMember(app, {
      email: "renew-swap@test.com",
      dni: "72040003",
    });
    const slotA = await createSlot("RenewSwapAct", 2);
    const slotB = await createSlot("RenewSwapAct", 5);
    const assignResult = await assignPlan(app, adminToken, member.id, {
      planId: plan.id,
      startDate: todayStr(),
      scheduleIds: [slotA],
      priceOverrideAmount: 0,
      priceOverrideReason: "test no-charge",
    });
    expect(assignResult.statusCode).toBe(201);
    const oldSubId = assignResult.body.id as number;

    const { statusCode, body } = await renew(member.id, {
      scheduleIds: [slotB],
    });
    expect(statusCode).toBe(201);
    expect(await anchorsOf(body.id as number)).toEqual([slotB]);
    // La sub anterior conserva su ancla original (historial intacto).
    expect(await anchorsOf(oldSubId)).toEqual([slotA]);
  });

  it("flexible: scheduleIds [] limpia las anclas heredadas", async () => {
    const plan = await createPlan(app, adminToken, {
      name: "Flex Renewal Clear",
      bookingMode: "flexible",
      classesPerWeek: 2,
    });
    const member = await createMember(app, {
      email: "renew-clear@test.com",
      dni: "72040004",
    });
    const slotA = await createSlot("RenewClearAct", 4);
    const assignResult = await assignPlan(app, adminToken, member.id, {
      planId: plan.id,
      startDate: todayStr(),
      scheduleIds: [slotA],
      priceOverrideAmount: 0,
      priceOverrideReason: "test no-charge",
    });
    expect(assignResult.statusCode).toBe(201);

    const { statusCode, body } = await renew(member.id, { scheduleIds: [] });
    expect(statusCode).toBe(201);
    expect(await anchorsOf(body.id as number)).toEqual([]);
  });

  it("valida el set: fijo exige el count exacto, flexible respeta el tope, anclas inválidas rechazan", async () => {
    const fixedPlan = await createPlan(app, adminToken, {
      name: "Fixed Renewal Val",
      bookingMode: "fixed",
      classesPerWeek: 1,
    });
    const member = await createMember(app, {
      email: "renew-val@test.com",
      dni: "72040005",
    });
    const slotA = await createSlot("RenewValAct", 1);
    const slotB = await createSlot("RenewValAct", 3);
    const assignResult = await assignPlan(app, adminToken, member.id, {
      planId: fixedPlan.id,
      startDate: todayStr(),
      scheduleIds: [slotA],
      priceOverrideAmount: 0,
      priceOverrideReason: "test no-charge",
    });
    expect(assignResult.statusCode).toBe(201);

    // Fijo con [] → 400 (no se pueden limpiar anclas de un plan fijo).
    expect((await renew(member.id, { scheduleIds: [] })).statusCode).toBe(400);
    // Fijo con más turnos que classesPerWeek → 400.
    expect(
      (await renew(member.id, { scheduleIds: [slotA, slotB] })).statusCode,
    ).toBe(400);
    // Ancla inexistente → 400 (validateAnchorSet).
    expect((await renew(member.id, { scheduleIds: [999999] })).statusCode).toBe(
      400,
    );

    // Flexible por encima del tope → 400.
    const flexMember = await createMember(app, {
      email: "renew-val-flex@test.com",
      dni: "72040006",
    });
    const flexPlan = await createPlan(app, adminToken, {
      name: "Flex Renewal Val",
      bookingMode: "flexible",
      classesPerWeek: 1,
    });
    const flexAssign = await assignPlan(app, adminToken, flexMember.id, {
      planId: flexPlan.id,
      startDate: todayStr(),
      priceOverrideAmount: 0,
      priceOverrideReason: "test no-charge",
    });
    expect(flexAssign.statusCode).toBe(201);
    expect(
      (await renew(flexMember.id, { scheduleIds: [slotA, slotB] })).statusCode,
    ).toBe(400);
  });

  // -------------------------------------------------------------------------
  // Renovar una presencial YA VENCIDA (pedido de coaches 2026-10-08): el admin
  // ofrece "Renovar" sobre la última vencida; la renovación hereda sus turnos
  // (validados) para no tener que cargarlos de nuevo.
  // -------------------------------------------------------------------------
  describe("renovar una presencial vencida", () => {
    /** Alta fija de 1 turno y la deja vencida hace 10 días. */
    async function expiredFixedSub(
      email: string,
      dni: string,
      slotId: number,
    ): Promise<{ memberId: number; subId: number }> {
      const plan = await createPlan(app, adminToken, {
        name: `Fixed Expired ${dni}`,
        bookingMode: "fixed",
        classesPerWeek: 1,
      });
      const member = await createMember(app, { email, dni });
      const assignResult = await assignPlan(app, adminToken, member.id, {
        planId: plan.id,
        startDate: todayStr(),
        scheduleIds: [slotId],
        priceOverrideAmount: 0,
        priceOverrideReason: "test no-charge",
      });
      expect(assignResult.statusCode).toBe(201);
      const subId = assignResult.body.id as number;
      await app.db
        .update(subscriptions)
        .set({
          status: "expired",
          startDate: dateOffsetStr(-40),
          endDate: dateOffsetStr(-10),
        })
        .where(eq(subscriptions.id, subId));
      return { memberId: member.id, subId };
    }

    it("hereda los turnos de la vencida, arranca hoy y genera reservas", async () => {
      const slotA = await createSlot("RenewExpiredAct", 2);
      const { memberId, subId } = await expiredFixedSub(
        "renew-expired@test.com",
        "72040101",
        slotA,
      );

      const { statusCode, body } = await renew(memberId, {
        subscriptionId: subId,
      });
      expect(statusCode).toBe(201);
      expect(body.status).toBe("active");
      expect(body.startDate).toBe(todayStr());
      expect(await anchorsOf(body.id as number)).toEqual([slotA]);

      const generated = await app.db
        .select({ id: bookings.id })
        .from(bookings)
        .where(
          and(
            eq(bookings.tenantId, TENANT_TEMPLO),
            eq(bookings.memberId, memberId),
            eq(bookings.scheduleId, slotA),
            gte(bookings.bookingDate, todayStr()),
          ),
        );
      expect(generated.length).toBeGreaterThan(0);
    });

    it("turno heredado desactivado → 400 que pide elegir turnos; con scheduleIds renueva", async () => {
      const slotA = await createSlot("RenewExpiredInactiveAct", 3);
      const slotB = await createSlot("RenewExpiredInactiveAct", 4);
      const { memberId, subId } = await expiredFixedSub(
        "renew-expired-inactive@test.com",
        "72040102",
        slotA,
      );
      await app.db
        .update(schedules)
        .set({ isActive: false })
        .where(eq(schedules.id, slotA));

      const rejected = await renew(memberId, { subscriptionId: subId });
      expect(rejected.statusCode).toBe(400);
      expect(String(rejected.body.message)).toContain("Modificar turnos");

      const { statusCode, body } = await renew(memberId, {
        subscriptionId: subId,
        scheduleIds: [slotB],
      });
      expect(statusCode).toBe(201);
      expect(await anchorsOf(body.id as number)).toEqual([slotB]);
    });

    it("con otra presencial vigente → 409 (no deja dos activas)", async () => {
      const slotA = await createSlot("RenewExpiredLiveAct", 5);
      const { memberId, subId } = await expiredFixedSub(
        "renew-expired-live@test.com",
        "72040103",
        slotA,
      );
      const otherPlan = await createPlan(app, adminToken, {
        name: "Flex vigente",
        bookingMode: "flexible",
        classesPerWeek: 2,
      });
      const live = await assignPlan(app, adminToken, memberId, {
        planId: otherPlan.id,
        startDate: todayStr(),
        priceOverrideAmount: 0,
        priceOverrideReason: "test no-charge",
      });
      expect(live.statusCode).toBe(201);

      const { statusCode } = await renew(memberId, { subscriptionId: subId });
      expect(statusCode).toBe(409);
    });

    it("class-usage?subscriptionId= devuelve los turnos de la vencida y 404 si la sub es de otro alumno", async () => {
      const slotA = await createSlot("RenewExpiredUsageAct", 1);
      const { memberId, subId } = await expiredFixedSub(
        "renew-expired-usage@test.com",
        "72040104",
        slotA,
      );

      const res = await app.inject({
        method: "GET",
        url: `${SUBSCRIPTIONS_URL}/members/${memberId}/class-usage?subscriptionId=${subId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const usage = JSON.parse(res.body) as {
        scheduleIds: number[];
        bookingMode: string;
        weeklyLimit: number | null;
      };
      expect(usage.scheduleIds).toEqual([slotA]);
      expect(usage.bookingMode).toBe("fixed");
      expect(usage.weeklyLimit).toBe(1);

      const other = await createMember(app, {
        email: "renew-expired-usage-other@test.com",
        dni: "72040105",
      });
      const foreign = await app.inject({
        method: "GET",
        url: `${SUBSCRIPTIONS_URL}/members/${other.id}/class-usage?subscriptionId=${subId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(foreign.statusCode).toBe(404);
    });
  });
});
