/**
 * Renovación prorrateada hasta fin de mes (prorateToMonthEnd)
 *
 * Integration tests contra la DB MySQL de test por worker. Cubre el opt-in de
 * alineación a la domiciliación: una renovación puede vencer el último día del
 * mes del inicio (en vez de start + durationDays) y cobrar el proporcional.
 *   - renewSubscription con prorateToMonthEnd: endDate = último día del mes,
 *     pricePaid = proporcional del precio de mes completo heredado.
 *   - Precio editado por el staff (priceOverrideAmount) respetado sin razón.
 *   - Guard: precio prorrateado > mes completo → 400.
 *
 * Calendario-seguro: la renovación arranca en el vencimiento de la sub recién
 * asignada (relativo a hoy) y la expectativa se deriva con aritmética
 * independiente del runtime — sin fechas fijas que rompan CI por el almanaque.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";

import { createTestApp, cleanAllTestData, getAuthToken } from "../helpers";
import {
  SUBSCRIPTIONS_URL,
  createPlan,
  createMember,
  assignPlan,
  todayStr,
} from "./_helpers";

/**
 * Deriva, independiente del service, el último día del mes de una fecha
 * "YYYY-MM-DD", los días del mes y los días cobrados (día del inicio incluido).
 */
function monthEndParts(dateStr: string): {
  endDate: string;
  daysCharged: number;
  daysInMonth: number;
} {
  const [y, m, d] = dateStr.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const daysCharged = daysInMonth - d + 1;
  const endDate = `${y}-${String(m).padStart(2, "0")}-${String(
    daysInMonth,
  ).padStart(2, "0")}`;
  return { endDate, daysCharged, daysInMonth };
}

describe("Subscriptions API — Renewal proration (month-end)", () => {
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

  async function setupActiveSub(priceRegular = 10000): Promise<{
    memberId: number;
    subId: number;
    endDate: string;
  }> {
    const plan = await createPlan(app, adminToken, {
      name: "Prorate Renew Plan",
      classesPerWeek: 3,
      durationDays: 30,
      priceRegular,
      priceZero: Math.floor(priceRegular / 2),
    });
    const member = await createMember(app);
    const assignRes = await assignPlan(app, adminToken, member.id, {
      planId: plan.id,
      startDate: todayStr(),
    });
    expect(assignRes.statusCode).toBe(201);
    return {
      memberId: member.id,
      subId: assignRes.body.id as number,
      endDate: assignRes.body.endDate as string,
    };
  }

  async function renew(
    memberId: number,
    payload: Record<string, unknown>,
  ): Promise<{ statusCode: number; body: Record<string, unknown> }> {
    const res = await app.inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}/members/${memberId}/subscription/renew`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload,
    });
    return { statusCode: res.statusCode, body: JSON.parse(res.body) };
  }

  it("vence el último día del mes y cobra el proporcional del precio heredado", async () => {
    const priceRegular = 10000;
    const { memberId, subId, endDate } = await setupActiveSub(priceRegular);
    // La renovación arranca en el vencimiento actual (continuidad, sub vigente).
    const { endDate: monthEnd, daysCharged, daysInMonth } =
      monthEndParts(endDate);

    const res = await renew(memberId, {
      paymentMethod: "cash",
      subscriptionId: subId,
      startDate: endDate,
      prorateToMonthEnd: true,
    });

    expect(res.statusCode).toBe(201);
    expect(res.body.endDate).toBe(monthEnd);
    expect(res.body.pricePaid).toBe(
      Math.round((priceRegular * daysCharged) / daysInMonth),
    );
    // Sub vigente → la renovación prorrateada queda encolada (scheduled).
    expect(res.body.status).toBe("scheduled");
    // El proporcional NO se persiste como override (el endDate + pricePaid ya
    // cuentan la historia).
    expect(res.body.priceOverrideAmount ?? null).toBeNull();
  });

  it("respeta el monto editado por el staff sin exigir razón", async () => {
    const { memberId, subId, endDate } = await setupActiveSub(10000);
    const { endDate: monthEnd } = monthEndParts(endDate);
    const edited = 4200;

    const res = await renew(memberId, {
      paymentMethod: "cash",
      subscriptionId: subId,
      startDate: endDate,
      prorateToMonthEnd: true,
      priceOverrideAmount: edited,
      // sin priceOverrideReason — el prorrateo no la exige
    });

    expect(res.statusCode).toBe(201);
    expect(res.body.endDate).toBe(monthEnd);
    expect(res.body.pricePaid).toBe(edited);
    expect(res.body.priceOverrideAmount ?? null).toBeNull();
  });

  it("rechaza un precio prorrateado mayor al mes completo (400)", async () => {
    const priceRegular = 10000;
    const { memberId, subId, endDate } = await setupActiveSub(priceRegular);

    const res = await renew(memberId, {
      paymentMethod: "cash",
      subscriptionId: subId,
      startDate: endDate,
      prorateToMonthEnd: true,
      priceOverrideAmount: priceRegular * 2,
    });

    expect(res.statusCode).toBe(400);
  });
});
