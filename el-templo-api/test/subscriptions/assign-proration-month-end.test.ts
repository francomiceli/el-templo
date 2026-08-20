/**
 * Alta prorrateada hasta fin de mes (prorateToMonthEnd)
 *
 * Integration tests against the per-worker test MySQL DB. Cubre:
 *   - assignPlan con prorateToMonthEnd: endDate = último día del mes, pricePaid =
 *     proporcional sugerido (día del alta incluido).
 *   - Precio editado por el staff (priceOverrideAmount) respetado tal cual.
 *   - Guards: precio > mes completo (400), combinación con boardingPass (400),
 *     combinación con AURA (400).
 *   - Endpoint de preview: coincide con el alta real; 404 para plan inexistente.
 *
 * Calendario-seguro: la fecha de alta es `todayStr()` (relativa, siempre dentro
 * de la ventana de startDate) y la expectativa se deriva con aritmética
 * independiente de la fecha en runtime — sin fechas fijas que rompan CI por el
 * almanaque.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";

import { createTestApp, cleanAllTestData, getAuthToken } from "../helpers";
import {
  SUBSCRIPTIONS_URL,
  assignPlan,
  createMember,
  createPlan,
  seedAuraBalance,
  todayStr,
} from "./_helpers";

/**
 * Deriva, de forma independiente al service, el último día del mes de una
 * fecha "YYYY-MM-DD", los días del mes y el día del alta.
 */
function monthEndParts(dateStr: string): {
  endDate: string;
  daysInMonth: number;
  day: number;
} {
  const [y, m, d] = dateStr.split("-").map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const endDate = `${y}-${String(m).padStart(2, "0")}-${String(
    daysInMonth,
  ).padStart(2, "0")}`;
  return { endDate, daysInMonth, day: d };
}

describe("Alta prorrateada hasta fin de mes", () => {
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

  it("endDate = fin de mes y pricePaid = proporcional (día del alta incluido)", async () => {
    const basePrice = 30000;
    const plan = await createPlan(app, adminToken, {
      name: "Flex Prorrateo 1",
      priceRegular: basePrice,
    });
    const member = await createMember(app);

    const start = todayStr();
    const { endDate, daysInMonth, day } = monthEndParts(start);
    const daysCharged = daysInMonth - day + 1;
    const expectedPrice = Math.round((basePrice * daysCharged) / daysInMonth);

    const res = await assignPlan(app, adminToken, member.id, {
      planId: plan.id,
      startDate: start,
      prorateToMonthEnd: true,
    });

    expect(res.statusCode).toBe(201);
    expect(res.body.endDate).toBe(endDate);
    expect(res.body.pricePaid).toBe(expectedPrice);
  });

  it("respeta el precio editado por el staff (priceOverrideAmount)", async () => {
    const plan = await createPlan(app, adminToken, {
      name: "Flex Prorrateo Editado",
      priceRegular: 30000,
    });
    const member = await createMember(app);

    const start = todayStr();
    const { endDate } = monthEndParts(start);
    const editedPrice = 7777;

    const res = await assignPlan(app, adminToken, member.id, {
      planId: plan.id,
      startDate: start,
      prorateToMonthEnd: true,
      priceOverrideAmount: editedPrice,
    });

    expect(res.statusCode).toBe(201);
    expect(res.body.endDate).toBe(endDate);
    expect(res.body.pricePaid).toBe(editedPrice);
    // No se persiste como override: el prorrateo no es un "precio personalizado".
    expect(res.body.priceOverrideAmount ?? null).toBeNull();
  });

  it("rechaza (400) un precio editado mayor al mes completo", async () => {
    const basePrice = 30000;
    const plan = await createPlan(app, adminToken, {
      name: "Flex Prorrateo Cap",
      priceRegular: basePrice,
    });
    const member = await createMember(app);

    const res = await assignPlan(app, adminToken, member.id, {
      planId: plan.id,
      startDate: todayStr(),
      prorateToMonthEnd: true,
      priceOverrideAmount: basePrice + 1,
    });

    expect(res.statusCode).toBe(400);
  });

  it("rechaza (400) combinar prorrateo con boarding pass", async () => {
    const plan = await createPlan(app, adminToken, {
      name: "Flex Prorrateo BP",
      priceRegular: 30000,
    });
    const member = await createMember(app);

    const res = await assignPlan(app, adminToken, member.id, {
      planId: plan.id,
      startDate: todayStr(),
      prorateToMonthEnd: true,
      boardingPass: true,
    });

    expect(res.statusCode).toBe(400);
  });

  it("rechaza (400) combinar prorrateo con descuento AURA", async () => {
    const plan = await createPlan(app, adminToken, {
      name: "Flex Prorrateo AURA",
      priceRegular: 30000,
    });
    const member = await createMember(app);
    await seedAuraBalance(app, member.id, 100000);

    const res = await assignPlan(app, adminToken, member.id, {
      planId: plan.id,
      startDate: todayStr(),
      prorateToMonthEnd: true,
      auraSpend: 5000,
    });

    expect(res.statusCode).toBe(400);
  });

  it("preview: coincide con el alta real (suggestedPrice + endDate)", async () => {
    const basePrice = 24000;
    const plan = await createPlan(app, adminToken, {
      name: "Flex Prorrateo Preview",
      priceRegular: basePrice,
    });
    const member = await createMember(app);
    const start = todayStr();

    const previewRes = await app.inject({
      method: "GET",
      url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription/assign-proration-preview?planId=${plan.id}&startDate=${start}&priceType=regular`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(previewRes.statusCode).toBe(200);
    const preview = JSON.parse(previewRes.body) as {
      basePrice: number;
      suggestedPrice: number;
      endDate: string;
      daysCharged: number;
      daysInMonth: number;
    };

    const { endDate, daysInMonth, day } = monthEndParts(start);
    expect(preview.basePrice).toBe(basePrice);
    expect(preview.endDate).toBe(endDate);
    expect(preview.daysInMonth).toBe(daysInMonth);
    expect(preview.daysCharged).toBe(daysInMonth - day + 1);

    // El alta sin precio editado usa exactamente el sugerido del preview.
    const assignRes = await assignPlan(app, adminToken, member.id, {
      planId: plan.id,
      startDate: start,
      prorateToMonthEnd: true,
    });
    expect(assignRes.statusCode).toBe(201);
    expect(assignRes.body.pricePaid).toBe(preview.suggestedPrice);
    expect(assignRes.body.endDate).toBe(preview.endDate);
  });

  it("preview: 404 para un plan inexistente", async () => {
    const member = await createMember(app);
    const res = await app.inject({
      method: "GET",
      url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription/assign-proration-preview?planId=999999&startDate=${todayStr()}&priceType=regular`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(404);
  });
});
