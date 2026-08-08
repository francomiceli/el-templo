import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq, and, gt, sql } from "drizzle-orm";
import { createTestApp, getAuthToken, cleanAllTestData } from "../helpers";
import * as schema from "../../src/db/schema";
import { activities } from "../../src/db/schema/activities";
import { schedules } from "../../src/db/schema/schedules";
import { bookings } from "../../src/db/schema/bookings";
import {
  SUBSCRIPTIONS_URL,
  createPlan,
  createMember,
  assignPlan,
  dateOffsetStr,
} from "./_helpers";
import { TENANT_TEMPLO } from "../fixtures/second-tenant";
import { tenantWhere } from "../../src/modules/shared/tenant";

/**
 * Fase 173 (ADO-02): gimnasio de la lectura de evidencia de `audit_log` en
 * este archivo. Con `members` en TENANT_STRICT_MODULES una lectura sin
 * estampa hace throw antes de llegar a MySQL.
 */
const TEMPLO_CTX = { tenantId: TENANT_TEMPLO };

describe("Subscriptions API — POST /:id/compensate-days (pausa retroactiva)", () => {
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

  /**
   * Active sub that started in the past so a fully-past range fits inside
   * its period: startDate = today-20, durationDays = 30 → endDate = today+10.
   */
  async function setupActiveSub(
    planOverrides: Record<string, unknown> = {},
    assignOverrides: Record<string, unknown> = {},
  ): Promise<{ subId: number; memberId: number; endDate: string }> {
    const plan = await createPlan(app, adminToken, {
      name: `Compensate Plan ${JSON.stringify(planOverrides).length}`,
      durationDays: 30,
      ...planOverrides,
    });
    const member = await createMember(app);
    const { statusCode, body } = await assignPlan(app, adminToken, member.id, {
      planId: plan.id,
      startDate: dateOffsetStr(-20),
      ...assignOverrides,
    });
    expect(statusCode).toBe(201);
    return {
      subId: body.id as number,
      memberId: member.id,
      endDate: body.endDate as string,
    };
  }

  async function compensate(
    subId: number,
    payload: Record<string, unknown>,
  ): Promise<{ statusCode: number; body: Record<string, unknown> }> {
    const res = await app.inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}/subscriptions/${subId}/compensate-days`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload,
    });
    return { statusCode: res.statusCode, body: JSON.parse(res.body) };
  }

  it("caso feliz: extiende endDate por los días del rango y escribe audit row", async () => {
    const { subId, endDate } = await setupActiveSub();
    expect(endDate).toBe(dateOffsetStr(10));

    // 5 días inclusivos: today-10 .. today-6
    const { statusCode, body } = await compensate(subId, {
      fromDate: dateOffsetStr(-10),
      toDate: dateOffsetStr(-6),
      reason: "Viaje familiar, avisó tarde",
    });

    expect(statusCode).toBe(200);
    expect(body.endDate).toBe(dateOffsetStr(15));
    expect(body.status).toBe("active");
    // pausedAt/resumedAt describen pausas en vivo — intactos.
    expect(body.pausedAt).toBeNull();
    expect(body.resumedAt).toBeNull();

    const auditRows = await app.db
      .select()
      .from(schema.auditLog)
      .where(
        and(
          tenantWhere(schema.auditLog, TEMPLO_CTX),
          eq(schema.auditLog.action, "days_compensated"),
          eq(schema.auditLog.targetKind, "subscription"),
          eq(schema.auditLog.targetId, subId),
        ),
      );
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0].reason).toBe("Viaje familiar, avisó tarde");
    const payload = auditRows[0].payloadJson as Record<string, unknown>;
    expect(payload.daysCredited).toBe(5);
    expect(payload.fromDate).toBe(dateOffsetStr(-10));
    expect(payload.toDate).toBe(dateOffsetStr(-6));
    expect(payload.prevEndDate).toBe(dateOffsetStr(10));
    expect(payload.newEndDate).toBe(dateOffsetStr(15));
  });

  it("400 cuando hay asistencias dentro del rango", async () => {
    const { subId, memberId, endDate } = await setupActiveSub();

    await app.db.insert(schema.attendance).values({
      memberId,
      branchId: 1,
      sessionDate: dateOffsetStr(-8),
    });

    const { statusCode, body } = await compensate(subId, {
      fromDate: dateOffsetStr(-10),
      toDate: dateOffsetStr(-6),
      reason: "Lesión",
    });

    expect(statusCode).toBe(400);
    expect(body.message).toContain("asistencias");

    // endDate no se tocó
    const [sub] = await app.db
      .select({ endDate: schema.subscriptions.endDate })
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.id, subId));
    expect(sub.endDate).toBe(endDate);
  });

  it("400 cuando existe una renovación programada", async () => {
    const { subId, memberId } = await setupActiveSub();

    const renewRes = await app.inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}/members/${memberId}/subscription/renew`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { paymentMethod: "cash" },
    });
    expect(renewRes.statusCode).toBe(201);
    expect(JSON.parse(renewRes.body).status).toBe("scheduled");

    const { statusCode, body } = await compensate(subId, {
      fromDate: dateOffsetStr(-10),
      toDate: dateOffsetStr(-6),
      reason: "Vacaciones",
    });

    expect(statusCode).toBe(400);
    expect(body.message).toContain("renovación programada");
  });

  it("400 cuando el rango cae fuera del período de la sub", async () => {
    const { subId } = await setupActiveSub();

    // startDate es today-20 → fromDate today-25 queda antes del inicio.
    const { statusCode, body } = await compensate(subId, {
      fromDate: dateOffsetStr(-25),
      toDate: dateOffsetStr(-18),
      reason: "Viaje",
    });

    expect(statusCode).toBe(400);
    expect(body.message).toContain("período");
  });

  it("acepta rango mixto pasado+futuro y extiende el vencimiento", async () => {
    const { subId } = await setupActiveSub();

    // 6 días inclusivos: today-3 .. today+2 (cruza hoy)
    const { statusCode, body } = await compensate(subId, {
      fromDate: dateOffsetStr(-3),
      toDate: dateOffsetStr(2),
      reason: "Lesión, vuelve en unos días",
    });

    expect(statusCode).toBe(200);
    expect(body.endDate).toBe(dateOffsetStr(16));
    expect(body.status).toBe("active");
  });

  it("400 cuando falta el motivo (schema) o viene vacío (service)", async () => {
    const { subId } = await setupActiveSub();

    const noReason = await compensate(subId, {
      fromDate: dateOffsetStr(-10),
      toDate: dateOffsetStr(-6),
    });
    expect(noReason.statusCode).toBe(400);

    const blankReason = await compensate(subId, {
      fromDate: dateOffsetStr(-10),
      toDate: dateOffsetStr(-6),
      reason: "   ",
    });
    expect(blankReason.statusCode).toBe(400);
  });

  it("regenera reservas del tramo extendido para subs con turnos fijos", async () => {
    // Slot semanal fijo: lunes 08:00 en la sede seed (id 1).
    await app.db.insert(activities).values({
      name: "Calistenia CompensateDays",
      isActive: true,
    });
    const actRows = await app.db.select({ id: activities.id }).from(activities);
    const activityId = actRows[actRows.length - 1].id;
    const slotResult = await app.db.insert(schedules).values({
      branchId: 1,
      activityId,
      dayOfWeek: 1,
      startTime: "08:00",
      endTime: "09:00",
      isActive: true,
    });
    const scheduleId = Number(slotResult[0].insertId);

    const { subId, memberId, endDate } = await setupActiveSub(
      { name: "Fixed Compensate 1x", bookingMode: "fixed", classesPerWeek: 1 },
      { scheduleIds: [scheduleId] },
    );

    const countBeyond = async (date: string): Promise<number> => {
      const rows = await app.db
        .select({ c: sql<number>`COUNT(*)` })
        .from(bookings)
        .where(
          and(eq(bookings.memberId, memberId), gt(bookings.bookingDate, date)),
        );
      return Number(rows[0].c);
    };

    expect(await countBeyond(endDate)).toBe(0);

    // 7 días compensados → la cola extendida cubre exactamente una semana,
    // así el slot semanal gana exactamente una reserva nueva.
    const { statusCode, body } = await compensate(subId, {
      fromDate: dateOffsetStr(-14),
      toDate: dateOffsetStr(-8),
      reason: "Lesión de hombro",
    });

    expect(statusCode).toBe(200);
    expect(body.endDate).toBe(dateOffsetStr(17));
    expect(await countBeyond(endDate)).toBe(1);
    expect(await countBeyond(body.endDate as string)).toBe(0);
  });

  it("rango futuro: extiende vencimiento y cancela las reservas fijas del rango", async () => {
    await app.db.insert(activities).values({
      name: "Calistenia CompensateFuture",
      isActive: true,
    });
    const actRows = await app.db.select({ id: activities.id }).from(activities);
    const activityId = actRows[actRows.length - 1].id;
    const slotResult = await app.db.insert(schedules).values({
      branchId: 1,
      activityId,
      dayOfWeek: 1,
      startTime: "08:00",
      endTime: "09:00",
      isActive: true,
    });
    const scheduleId = Number(slotResult[0].insertId);

    const { subId, memberId } = await setupActiveSub(
      {
        name: "Fixed Compensate Future 1x",
        bookingMode: "fixed",
        classesPerWeek: 1,
      },
      { scheduleIds: [scheduleId] },
    );

    // Congelar today+1 .. today+7 (7 días): una ventana de 7 días consecutivos
    // contiene exactamente un lunes → exactamente una reserva fija a cancelar.
    const fromDate = dateOffsetStr(1);
    const toDate = dateOffsetStr(7);

    const countInRange = async (status: string): Promise<number> => {
      const rows = await app.db
        .select({ c: sql<number>`COUNT(*)` })
        .from(bookings)
        .where(
          and(
            eq(bookings.memberId, memberId),
            sql`${bookings.bookingDate} >= ${fromDate}`,
            sql`${bookings.bookingDate} <= ${toDate}`,
            sql`${bookings.status} = ${status}`,
          ),
        );
      return Number(rows[0].c);
    };

    expect(await countInRange("reservado")).toBe(1);

    const { statusCode, body } = await compensate(subId, {
      fromDate,
      toDate,
      reason: "Viaje avisado con anticipación",
    });

    expect(statusCode).toBe(200);
    // 7 días acreditados sobre endDate = today+10
    expect(body.endDate).toBe(dateOffsetStr(17));
    // La reserva dentro del rango congelado quedó cancelada (libera cupo)
    expect(await countInRange("reservado")).toBe(0);
    expect(await countInRange("cancelado")).toBe(1);

    // Las reservas fuera del rango congelado siguen activas: la cola va
    // hasta el nuevo vencimiento (today+17), así que después del rango
    // quedan los lunes de (today+7, today+17] — al menos uno.
    const beyondRange = await app.db
      .select({ c: sql<number>`COUNT(*)` })
      .from(bookings)
      .where(
        and(
          eq(bookings.memberId, memberId),
          gt(bookings.bookingDate, toDate),
          sql`${bookings.status} = 'reservado'`,
        ),
      );
    expect(Number(beyondRange[0].c)).toBeGreaterThanOrEqual(1);
  });
});
