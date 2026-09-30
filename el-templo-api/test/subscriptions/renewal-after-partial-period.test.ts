/**
 * Renovación después de un período PARCIAL (prorrateado hasta fin de mes)
 *
 * Integration tests contra la DB MySQL de test por worker. Caso real (BCN,
 * sept 2026): alta prorrateada del 25 al 30/9 por 12 € → la renovación heredaba
 * esos 12 € como precio del MES COMPLETO (renovar cobraba 12 € por 30 días y el
 * prorrateo quedaba topeado en 12). Cubre `resolveRenewalBase`:
 *   - período actual parcial y sin período completo anterior (el alta) →
 *     precio de lista del plan (`plan_price`), en la renovación normal y como
 *     base/tope de la renovación prorrateada.
 *   - período actual parcial con un período completo anterior del mismo plan →
 *     lo que pagaba ahí (`previous_period`): preserva el precio negociado.
 *   - período actual completo → lo heredado (`inherited`, caso Pomilio).
 *   - GET renewal-preview devuelve la misma base que cobra la renovación.
 *
 * Calendario-seguro: el período parcial arranca hoy (o ayer si hoy es día 1 —
 * un alta el 1° de un mes de 31 días dura 30 días, o sea el mes completo) y las
 * expectativas se derivan con aritmética independiente del runtime.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";

import {
  createTestApp,
  cleanAllTestData,
  getAuthToken,
  dateOffsetStr,
} from "../helpers";
import {
  SUBSCRIPTIONS_URL,
  createPlan,
  createMember,
  assignPlan,
  todayStr,
} from "./_helpers";

const PRICE_REGULAR = 6000;
const NEGOTIATED_PRICE = 4500;

/**
 * Inicio de un período prorrateado que SIEMPRE queda parcial (< 30 días):
 * hoy, salvo el día 1 (ahí el período iría del 1 al 28-31 y podría durar 30
 * días) → ayer, un período de 1 día.
 */
function partialStart(): string {
  const today = todayStr();
  return today.endsWith("-01") ? dateOffsetStr(-1) : today;
}

/** Proporcional hasta fin de mes, derivado independiente del service. */
function proratedFrom(base: number, startDate: string): number {
  const [y, m, d] = startDate.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Math.round((base * (daysInMonth - d + 1)) / daysInMonth);
}

describe("Subscriptions API — Renovación tras período prorrateado", () => {
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

  async function setupPlanAndMember(): Promise<{
    planId: number;
    memberId: number;
  }> {
    const plan = await createPlan(app, adminToken, {
      name: "Flex+ Prorrateo",
      durationDays: 30,
      priceRegular: PRICE_REGULAR,
      priceZero: PRICE_REGULAR / 2,
    });
    const member = await createMember(app);
    return { planId: plan.id, memberId: member.id };
  }

  /** Alta prorrateada hasta fin de mes (período parcial). */
  async function assignProrated(
    memberId: number,
    planId: number,
  ): Promise<{ id: number; pricePaid: number; endDate: string }> {
    const res = await assignPlan(app, adminToken, memberId, {
      planId,
      startDate: partialStart(),
      prorateToMonthEnd: true,
    });
    expect(res.statusCode).toBe(201);
    return {
      id: res.body.id as number,
      pricePaid: res.body.pricePaid as number,
      endDate: res.body.endDate as string,
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

  async function renewalPreview(
    memberId: number,
    subscriptionId: number,
  ): Promise<{ statusCode: number; body: Record<string, unknown> }> {
    const res = await app.inject({
      method: "GET",
      url: `${SUBSCRIPTIONS_URL}/members/${memberId}/subscription/renewal-preview?subscriptionId=${subscriptionId}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    return { statusCode: res.statusCode, body: JSON.parse(res.body) };
  }

  it("alta prorrateada → la renovación normal cobra el precio de lista del mes completo", async () => {
    const { planId, memberId } = await setupPlanAndMember();
    const alta = await assignProrated(memberId, planId);
    // Precondición del bug: el alta cobró un proporcional, no el mes completo.
    expect(alta.pricePaid).toBeLessThan(PRICE_REGULAR);

    const preview = await renewalPreview(memberId, alta.id);
    expect(preview.statusCode).toBe(200);
    expect(preview.body).toEqual({
      subscriptionId: alta.id,
      base: PRICE_REGULAR,
      source: "plan_price",
    });

    const res = await renew(memberId, {
      paymentMethod: "cash",
      subscriptionId: alta.id,
    });
    expect(res.statusCode).toBe(201);
    expect(res.body.pricePaid).toBe(PRICE_REGULAR);
    // Precio de lista, no un override: nada que arrastrar como negociado.
    expect(res.body.priceOverrideAmount ?? null).toBeNull();
  });

  it("alta prorrateada → la renovación prorrateada usa el precio de lista como base y tope", async () => {
    const { planId, memberId } = await setupPlanAndMember();
    const alta = await assignProrated(memberId, planId);
    // Inicio automático, espejo del service: el vencimiento del alta si sigue
    // vigente, si no hoy.
    const today = todayStr();
    const renewalStart = alta.endDate >= today ? alta.endDate : today;

    const suggested = await renew(memberId, {
      paymentMethod: "cash",
      subscriptionId: alta.id,
      prorateToMonthEnd: true,
    });
    expect(suggested.statusCode).toBe(201);
    expect(suggested.body.pricePaid).toBe(
      proratedFrom(PRICE_REGULAR, renewalStart),
    );
  });

  it("alta prorrateada → la renovación prorrateada acepta el mes completo como monto editado (antes: 400)", async () => {
    const { planId, memberId } = await setupPlanAndMember();
    const alta = await assignProrated(memberId, planId);

    const res = await renew(memberId, {
      paymentMethod: "cash",
      subscriptionId: alta.id,
      prorateToMonthEnd: true,
      priceOverrideAmount: PRICE_REGULAR,
    });
    expect(res.statusCode).toBe(201);
    expect(res.body.pricePaid).toBe(PRICE_REGULAR);
  });

  it("alta prorrateada → el tope del prorrateo sigue siendo el mes completo (400 por encima)", async () => {
    const { planId, memberId } = await setupPlanAndMember();
    const alta = await assignProrated(memberId, planId);

    const res = await renew(memberId, {
      paymentMethod: "cash",
      subscriptionId: alta.id,
      prorateToMonthEnd: true,
      priceOverrideAmount: PRICE_REGULAR + 1,
    });
    expect(res.statusCode).toBe(400);
  });

  it("período completo negociado → renovación prorrateada → la siguiente conserva el negociado", async () => {
    const { planId, memberId } = await setupPlanAndMember();
    // Período completo con precio negociado, ya vencido (arrancó hace 45 días).
    const full = await assignPlan(app, adminToken, memberId, {
      planId,
      startDate: dateOffsetStr(-45),
      priceOverrideAmount: NEGOTIATED_PRICE,
      priceOverrideReason: "precio negociado",
    });
    expect(full.statusCode).toBe(201);
    expect(full.body.pricePaid).toBe(NEGOTIATED_PRICE);

    // Renovación prorrateada hasta fin de mes (alinear a domiciliación).
    const partialStartDate = partialStart();
    const partial = await renew(memberId, {
      paymentMethod: "cash",
      subscriptionId: full.body.id,
      startDate: partialStartDate,
      prorateToMonthEnd: true,
    });
    expect(partial.statusCode).toBe(201);
    expect(partial.body.pricePaid).toBe(
      proratedFrom(NEGOTIATED_PRICE, partialStartDate),
    );

    const preview = await renewalPreview(memberId, partial.body.id as number);
    expect(preview.statusCode).toBe(200);
    expect(preview.body).toEqual({
      subscriptionId: partial.body.id,
      base: NEGOTIATED_PRICE,
      source: "previous_period",
    });

    const next = await renew(memberId, {
      paymentMethod: "cash",
      subscriptionId: partial.body.id,
    });
    expect(next.statusCode).toBe(201);
    expect(next.body.pricePaid).toBe(NEGOTIATED_PRICE);
  });

  it("período completo → hereda lo que venía pagando (caso Pomilio, sin regresión)", async () => {
    const { planId, memberId } = await setupPlanAndMember();
    const full = await assignPlan(app, adminToken, memberId, {
      planId,
      priceOverrideAmount: NEGOTIATED_PRICE,
      priceOverrideReason: "precio negociado",
    });
    expect(full.statusCode).toBe(201);

    const preview = await renewalPreview(memberId, full.body.id as number);
    expect(preview.statusCode).toBe(200);
    expect(preview.body).toEqual({
      subscriptionId: full.body.id,
      base: NEGOTIATED_PRICE,
      source: "inherited",
    });

    const res = await renew(memberId, {
      paymentMethod: "cash",
      subscriptionId: full.body.id,
    });
    expect(res.statusCode).toBe(201);
    expect(res.body.pricePaid).toBe(NEGOTIATED_PRICE);
  });

  it("preview: 404 para una suscripción que no es del socio", async () => {
    const { planId, memberId } = await setupPlanAndMember();
    const alta = await assignProrated(memberId, planId);
    const other = await createMember(app, {
      email: "otro-socio-renewal-preview@test.com",
    });

    const res = await renewalPreview(other.id, alta.id);
    expect(res.statusCode).toBe(404);
  });
});
