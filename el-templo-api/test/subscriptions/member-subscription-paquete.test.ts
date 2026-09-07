/**
 * Fase 177 / fix 2026-09-07 — GET /api/members/subscription/me/subscription
 * expone la categoría por GRUPO al app de socios.
 *
 * El app solo gatea "presencial / online / especial" (`hasPresencialPlan` y
 * `hasPresencialReservationAccess` comparan `planCategory === 'presencial'`).
 * Un paquete de clases (`planCategory='paquete'`, presencial-flexible) salía
 * con la categoría cruda y el app lo trataba como "sin plan" → "Activá tu
 * plan" y grilla de reservas bloqueada (caso Gonzalo Guzmán, Barcelona).
 *
 * Coverage:
 *  - paquete activo → `planCategory: 'presencial'` (contrato de grupo).
 *  - presencial y online_regular → sin cambios (categoría tal cual).
 *  - `memberFacingCategory` (unit) cubre todas las categorías.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import * as schema from "../../src/db/schema";
import {
  createTestApp,
  cleanAllTestData,
  createTestMember,
  todayStr,
} from "../helpers";
import {
  memberFacingCategory,
  PRESENCIAL_GROUP_CATEGORIES,
  categoryGroup,
  type PlanCategory,
} from "../../src/modules/subscriptions/types";

const ME_SUBSCRIPTION_URL = "/api/members/subscription/me/subscription";

interface MeSubscriptionBody {
  id: number;
  planName: string;
  status: string;
  planCategory: string;
}

describe("memberFacingCategory (unit)", () => {
  it("mapea paquete → presencial y deja el resto tal cual", () => {
    const all: PlanCategory[] = [
      "presencial",
      "paquete",
      "especial",
      "online_regular",
      "online_goal",
      "online_coach",
    ];
    for (const c of all) {
      const expected = c === "paquete" ? "presencial" : c;
      expect(memberFacingCategory(c)).toBe(expected);
    }
  });

  it("PRESENCIAL_GROUP_CATEGORIES coincide con categoryGroup() === 'presencial'", () => {
    const all: PlanCategory[] = [
      "presencial",
      "paquete",
      "especial",
      "online_regular",
      "online_goal",
      "online_coach",
    ];
    const fromGroup = all.filter((c) => categoryGroup(c) === "presencial");
    expect([...PRESENCIAL_GROUP_CATEGORIES].sort()).toEqual(fromGroup.sort());
  });
});

describe("GET /me/subscription — categoría por grupo para el app (paquete → presencial)", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await cleanAllTestData(app);
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
  });

  /**
   * INSERT crudo: `createPlanSchema` (ruta admin) no admite paquete/especial —
   * mismo patrón que test/referral-partners/discount-charge.test.ts.
   */
  async function insertPlan(
    name: string,
    planCategory: PlanCategory,
  ): Promise<number> {
    const isPaquete = planCategory === "paquete";
    const res = await app.db.insert(schema.subscriptionPlans).values({
      name,
      planTier: isPaquete ? "other" : "flex",
      bookingMode: "flexible",
      planCategory,
      priceRegular: 5600,
      priceZero: 5600,
      durationDays: isPaquete ? 14 : 30,
      classesPerWeek: 3,
      country: "AR",
      currency: "ARS",
      isActive: true,
      isArchived: false,
    });
    return Number(res[0].insertId);
  }

  async function insertActiveSub(
    userId: number,
    planId: number,
  ): Promise<void> {
    await app.db.insert(schema.subscriptions).values({
      userId,
      planId,
      branchId: 1,
      status: "active",
      startDate: todayStr(),
      endDate: todayStr(),
      pricePaid: 5600,
      priceTypeApplied: "regular",
    });
  }

  async function fetchMeSubscription(token: string): Promise<{
    statusCode: number;
    body: MeSubscriptionBody;
  }> {
    const res = await app.inject({
      method: "GET",
      url: ME_SUBSCRIPTION_URL,
      headers: { authorization: `Bearer ${token}` },
    });
    return {
      statusCode: res.statusCode,
      body:
        res.statusCode === 200
          ? JSON.parse(res.body)
          : ({} as MeSubscriptionBody),
    };
  }

  it("paquete activo → 200 con planCategory 'presencial' (el app lo gatea como presencial)", async () => {
    const member = await createTestMember(app);
    const paquete = await insertPlan("Paquete · 2 sem · 3/sem", "paquete");
    await insertActiveSub(member.id, paquete);

    const { statusCode, body } = await fetchMeSubscription(member.token);

    expect(statusCode).toBe(200);
    expect(body.status).toBe("active");
    expect(body.planName).toBe("Paquete · 2 sem · 3/sem");
    expect(body.planCategory).toBe("presencial");
  });

  it("presencial activo → planCategory 'presencial' (sin cambios)", async () => {
    const member = await createTestMember(app);
    const plan = await insertPlan("Flex Test", "presencial");
    await insertActiveSub(member.id, plan);

    const { statusCode, body } = await fetchMeSubscription(member.token);

    expect(statusCode).toBe(200);
    expect(body.planCategory).toBe("presencial");
  });

  it("online_regular activo → planCategory 'online_regular' (el mapeo NO toca online)", async () => {
    const member = await createTestMember(app);
    const plan = await insertPlan("Online Test", "online_regular");
    await insertActiveSub(member.id, plan);

    const { statusCode, body } = await fetchMeSubscription(member.token);

    expect(statusCode).toBe(200);
    expect(body.planCategory).toBe("online_regular");
  });

  it("sin suscripción → 204 (sin cambios)", async () => {
    const member = await createTestMember(app);
    const { statusCode } = await fetchMeSubscription(member.token);
    expect(statusCode).toBe(204);
  });
});
