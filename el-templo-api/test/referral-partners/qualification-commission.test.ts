/**
 * Fase 179 Plan 05 (D-11/D-13/D-17) — "el hook de la plata": cualificación
 * del vínculo de partner + alta de la comisión, colgada de las 4
 * charge-paths de `subscriptions/service.ts` vía `qualifyPartnerOnCharge`.
 *
 * Lo que estos tests defienden, en orden de importancia:
 *  1. Un cargo real (`pricePaid>0`) flippea el vínculo `pending` del socio y
 *     crea 1 fila en `partner_commissions` con `amount = commission_value` y
 *     la moneda del partner (D-11/D-13).
 *  2. Un cargo de $0 (bonificada) NO flippea ni comisiona.
 *  3. Idempotencia por cargo: re-cobrar la MISMA suscripción nunca duplica
 *     la comisión (UNIQUE subscription_id + onDuplicateKeyUpdate).
 *  4. Un segundo cargo DISTINTO (renovación) de un socio ya `qualified` no
 *     genera una comisión nueva — solo el flip real comisiona.
 *  5. D-17: la comisión dispara con CUALQUIER categoría de plan, incluidos
 *     `paquete` y `especial` — a diferencia del descuento de referidos, que
 *     los excluye.
 *  6. Las 4 charge-paths (assignPlan, changePlanNow, changePlanAfterCurrent,
 *     renewSubscription) cualifican y comisionan por igual.
 *  7. Un vínculo `revoked` nunca flippea ni comisiona.
 *  8. `commissionType='none'` flippea el vínculo pero no arma comisión.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import {
  createTestApp,
  getAuthToken,
  cleanAllTestData,
  ensureEfectivoCaja,
} from "../helpers";
import {
  createPlan,
  createMember,
  assignPlan,
  todayStr,
  SUBSCRIPTIONS_URL,
} from "../subscriptions/_helpers";
import * as schema from "../../src/db/schema";
import { PartnerReferralService } from "../../src/modules/referral-partners/service";
import {
  insertBranch,
  insertPartner,
  insertPartnerLink,
  partnerLinkRow,
  partnerCommissionRows,
} from "./_helpers";

let app: FastifyInstance;
let adminToken: string;
let service: PartnerReferralService;
const AR_BRANCH_ID = 1; // sede seed de test/setup.ts, tenant 1, country='AR'.
let seq = 0;

beforeAll(async () => {
  app = await createTestApp();
  adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
  service = new PartnerReferralService(app.db, app.log);
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await cleanAllTestData(app);
  seq += 1;
});

/** Email único por test — evita colisiones del UNIQUE de users.email. */
function email(prefix: string): string {
  return `qc-${prefix}-${seq}-${Date.now()}@test.com`;
}

/** INSERT crudo de un plan con `planCategory` fuera del enum de createPlanSchema
 * (paquete/especial) — mismo patrón que `createEspecialPlan` de
 * `test/referrals/change-plan-charge.test.ts`. */
async function createPlanWithCategory(
  category: "paquete" | "especial",
  priceRegular: number,
): Promise<number> {
  const res = await app.db.insert(schema.subscriptionPlans).values({
    name: `Plan D-17 ${category} ${seq}`,
    planTier: "other",
    bookingMode: "flexible",
    planCategory: category,
    priceRegular,
    priceZero: priceRegular,
    durationDays: category === "paquete" ? 7 : 30,
    classesPerWeek: category === "paquete" ? 3 : null,
    monthlyClassBudget: category === "especial" ? 2 : null,
    requiresPresencial: false,
    country: "AR",
    currency: "ARS",
    isActive: true,
    isArchived: false,
  });
  return Number(res[0].insertId);
}

/** POST /change-plan con startMode configurable. */
function changePlan(
  userId: number,
  planId: number,
  startMode: "now" | "after_current",
  overrides: Record<string, unknown> = {},
): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  return app
    .inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}/members/${userId}/subscription/change-plan`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        planId,
        branchId: AR_BRANCH_ID,
        startDate: todayStr(),
        priceTypeApplied: "regular",
        paymentMethod: "cash",
        startMode,
        ...overrides,
      },
    })
    .then((res) => ({
      statusCode: res.statusCode,
      body: JSON.parse(res.body) as Record<string, unknown>,
    }));
}

/** POST /renew. */
function renew(
  userId: number,
): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  return app
    .inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}/members/${userId}/subscription/renew`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { paymentMethod: "cash" },
    })
    .then((res) => ({
      statusCode: res.statusCode,
      body: JSON.parse(res.body) as Record<string, unknown>,
    }));
}

describe("qualifyPartnerOnCharge — assignPlan (D-11/D-13)", () => {
  it("(1) 1er cargo real flippea el vínculo y crea 1 comisión con amount/currency/tenant correctos", async () => {
    const partner = await insertPartner(app, {
      commissionType: "fixed",
      commissionValue: 5000,
      currency: "ARS",
    });
    const member = await createMember(app, {
      email: email("assign-a"),
      branchId: AR_BRANCH_ID,
    });
    await insertPartnerLink(app, {
      partnerId: partner.id,
      referredId: member.id,
      status: "pending",
    });
    const plan = await createPlan(app, adminToken, { priceRegular: 15000 });

    const res = await assignPlan(app, adminToken, member.id, {
      planId: plan.id,
    });
    expect(res.statusCode).toBe(201);
    const subscriptionId = res.body.id as number;

    const link = await partnerLinkRow(app, member.id);
    expect(link?.status).toBe("qualified");
    expect(link?.qualified_at).not.toBeNull();

    const commissions = await partnerCommissionRows(app, subscriptionId);
    expect(commissions).toHaveLength(1);
    expect(commissions[0].amount).toBe(5000);
    expect(commissions[0].currency).toBe("ARS");
    expect(commissions[0].status).toBe("pending");
    expect(commissions[0].partner_id).toBe(partner.id);
    expect(commissions[0].user_id).toBe(member.id);
    expect(commissions[0].tenant_id).toBe(1);
  });

  it("(2) cargo bonificado (priceOverrideAmount=0) NO flippea ni comisiona", async () => {
    const partner = await insertPartner(app, { commissionValue: 5000 });
    const member = await createMember(app, {
      email: email("assign-b"),
      branchId: AR_BRANCH_ID,
    });
    await insertPartnerLink(app, {
      partnerId: partner.id,
      referredId: member.id,
      status: "pending",
    });
    const plan = await createPlan(app, adminToken, { priceRegular: 15000 });

    const res = await assignPlan(app, adminToken, member.id, {
      planId: plan.id,
      priceOverrideAmount: 0,
      priceOverrideReason: "beca 100%",
    });
    expect(res.statusCode).toBe(201);
    const subscriptionId = res.body.id as number;

    const link = await partnerLinkRow(app, member.id);
    expect(link?.status).toBe("pending");
    expect(link?.qualified_at).toBeNull();
    expect(await partnerCommissionRows(app, subscriptionId)).toHaveLength(0);
  });

  it("(3) idempotencia: re-cobro sobre la misma suscripción sigue dejando 1 sola comisión (D-11)", async () => {
    const partner = await insertPartner(app, { commissionValue: 5000 });
    const member = await createMember(app, {
      email: email("assign-c"),
      branchId: AR_BRANCH_ID,
    });
    await insertPartnerLink(app, {
      partnerId: partner.id,
      referredId: member.id,
      status: "pending",
    });
    const plan = await createPlan(app, adminToken, { priceRegular: 15000 });

    const res = await assignPlan(app, adminToken, member.id, {
      planId: plan.id,
    });
    const subscriptionId = res.body.id as number;
    expect(await partnerCommissionRows(app, subscriptionId)).toHaveLength(1);

    // Simula un re-cobro/reintento sobre el MISMO cargo: llamada directa al
    // service con idéntico subscriptionId. El vínculo ya está qualified (no
    // pending), así que la 2da llamada no encuentra flip que hacer y
    // devuelve null ANTES de intentar el INSERT — sigue habiendo 1 sola fila.
    const second = await service.qualifyAndCommission(
      { tenantId: 1 },
      member.id,
      subscriptionId,
    );
    expect(second).toBeNull();
    expect(await partnerCommissionRows(app, subscriptionId)).toHaveLength(1);
  });

  it("(4) un 2do cargo DISTINTO (renovación) de un socio ya qualified no genera comisión nueva", async () => {
    const partner = await insertPartner(app, { commissionValue: 5000 });
    const member = await createMember(app, {
      email: email("assign-d"),
      branchId: AR_BRANCH_ID,
    });
    await insertPartnerLink(app, {
      partnerId: partner.id,
      referredId: member.id,
      status: "pending",
    });
    const plan = await createPlan(app, adminToken, { priceRegular: 15000 });

    const assignRes = await assignPlan(app, adminToken, member.id, {
      planId: plan.id,
    });
    expect(
      await partnerCommissionRows(app, assignRes.body.id as number),
    ).toHaveLength(1);

    const renewRes = await renew(member.id);
    expect(renewRes.statusCode).toBe(201);
    const renewSubId = renewRes.body.id as number;
    // El vínculo ya estaba qualified antes de este cargo: el flip solo
    // ocurre una vez, así que este 2do cargo real no arma comisión nueva.
    expect(await partnerCommissionRows(app, renewSubId)).toHaveLength(0);
  });

  it("(5) revoked → cobro real no flippea ni comisiona", async () => {
    const partner = await insertPartner(app, { commissionValue: 5000 });
    const member = await createMember(app, {
      email: email("assign-e"),
      branchId: AR_BRANCH_ID,
    });
    await insertPartnerLink(app, {
      partnerId: partner.id,
      referredId: member.id,
      status: "revoked",
    });
    const plan = await createPlan(app, adminToken, { priceRegular: 15000 });

    const res = await assignPlan(app, adminToken, member.id, {
      planId: plan.id,
    });
    expect(res.statusCode).toBe(201);

    const link = await partnerLinkRow(app, member.id);
    expect(link?.status).toBe("revoked");
    expect(
      await partnerCommissionRows(app, res.body.id as number),
    ).toHaveLength(0);
  });

  it("(6) commissionType='none' → flip sí, comisión no", async () => {
    const partner = await insertPartner(app, {
      commissionType: "none",
      commissionValue: 0,
    });
    const member = await createMember(app, {
      email: email("assign-f"),
      branchId: AR_BRANCH_ID,
    });
    await insertPartnerLink(app, {
      partnerId: partner.id,
      referredId: member.id,
      status: "pending",
    });
    const plan = await createPlan(app, adminToken, { priceRegular: 15000 });

    const res = await assignPlan(app, adminToken, member.id, {
      planId: plan.id,
    });
    expect(res.statusCode).toBe(201);

    const link = await partnerLinkRow(app, member.id);
    expect(link?.status).toBe("qualified");
    expect(
      await partnerCommissionRows(app, res.body.id as number),
    ).toHaveLength(0);
  });
});

describe("D-17 — la comisión dispara con CUALQUIER categoría de plan", () => {
  it("(7) plan 'paquete' con cargo real SÍ genera comisión (contraste con el descuento de referidos, que lo excluye)", async () => {
    const partner = await insertPartner(app, { commissionValue: 4000 });
    const member = await createMember(app, {
      email: email("d17-paquete"),
      branchId: AR_BRANCH_ID,
    });
    await insertPartnerLink(app, {
      partnerId: partner.id,
      referredId: member.id,
      status: "pending",
    });
    const paqueteId = await createPlanWithCategory("paquete", 6000);

    const res = await assignPlan(app, adminToken, member.id, {
      planId: paqueteId,
    });
    expect(res.statusCode).toBe(201);

    expect((await partnerLinkRow(app, member.id))?.status).toBe("qualified");
    expect(
      await partnerCommissionRows(app, res.body.id as number),
    ).toHaveLength(1);
  });

  it("(8) plan 'especial' con cargo real SÍ genera comisión", async () => {
    const partner = await insertPartner(app, { commissionValue: 4500 });
    const member = await createMember(app, {
      email: email("d17-especial"),
      branchId: AR_BRANCH_ID,
    });
    await insertPartnerLink(app, {
      partnerId: partner.id,
      referredId: member.id,
      status: "pending",
    });
    const especialId = await createPlanWithCategory("especial", 20000);

    const res = await assignPlan(app, adminToken, member.id, {
      planId: especialId,
    });
    expect(res.statusCode).toBe(201);

    expect((await partnerLinkRow(app, member.id))?.status).toBe("qualified");
    expect(
      await partnerCommissionRows(app, res.body.id as number),
    ).toHaveLength(1);
  });
});

describe("D-13 — moneda de la comisión por país de sede del partner", () => {
  it("(9) partner de sede AR → currency='ARS'", async () => {
    const partner = await insertPartner(app, {
      currency: "ARS",
      commissionValue: 3000,
    });
    const member = await createMember(app, {
      email: email("d13-ar"),
      branchId: AR_BRANCH_ID,
    });
    await insertPartnerLink(app, {
      partnerId: partner.id,
      referredId: member.id,
      status: "pending",
    });
    const plan = await createPlan(app, adminToken, { priceRegular: 15000 });

    const res = await assignPlan(app, adminToken, member.id, {
      planId: plan.id,
    });
    const commissions = await partnerCommissionRows(app, res.body.id as number);
    expect(commissions[0].currency).toBe("ARS");
  });

  it("(10) partner de sede ES → currency='EUR'", async () => {
    const esBranch = await insertBranch(app, { country: "ES" });
    // Branches insertadas en runtime no traen caja efectivo (solo las
    // sembradas por test/setup.ts) — TransactionService.create() hard-throws
    // "No existe caja efectivo" en un cargo cash sin esto (Fase 138).
    await ensureEfectivoCaja(app, esBranch.id, "EUR");
    const partner = await insertPartner(app, {
      branchId: esBranch.id,
      currency: "EUR",
      commissionValue: 3000,
    });
    const member = await createMember(app, {
      email: email("d13-es"),
      branchId: esBranch.id,
    });
    await insertPartnerLink(app, {
      partnerId: partner.id,
      referredId: member.id,
      status: "pending",
    });
    const plan = await createPlan(app, adminToken, {
      priceRegular: 15000,
      country: "ES",
      currency: "EUR",
    });

    const res = await assignPlan(app, adminToken, member.id, {
      planId: plan.id,
      branchId: esBranch.id,
    });
    expect(res.statusCode).toBe(201);
    const commissions = await partnerCommissionRows(app, res.body.id as number);
    expect(commissions[0].currency).toBe("EUR");
  });
});

describe("Las 4 charge-paths cualifican y comisionan por igual", () => {
  it("(11) changePlanNow (cambio inmediato) genera comisión", async () => {
    const planA = await createPlan(app, adminToken, { priceRegular: 8000 });
    const planB = await createPlan(app, adminToken, {
      name: `Now B ${seq}`,
      priceRegular: 20000,
    });
    const member = await createMember(app, {
      email: email("path-now"),
      branchId: AR_BRANCH_ID,
    });
    // Baseline SIN vínculo — evita flippear en el assign de partida.
    await assignPlan(app, adminToken, member.id, {
      planId: planA.id,
      startDate: todayStr(),
    });
    const partner = await insertPartner(app, { commissionValue: 2500 });
    await insertPartnerLink(app, {
      partnerId: partner.id,
      referredId: member.id,
      status: "pending",
    });

    const res = await changePlan(member.id, planB.id, "now");
    expect(res.statusCode).toBe(201);

    expect((await partnerLinkRow(app, member.id))?.status).toBe("qualified");
    expect(
      await partnerCommissionRows(app, res.body.id as number),
    ).toHaveLength(1);
  });

  it("(12) changePlanAfterCurrent (cambio programado) genera comisión", async () => {
    const planA = await createPlan(app, adminToken, { priceRegular: 8000 });
    const planB = await createPlan(app, adminToken, {
      name: `Sched B ${seq}`,
      priceRegular: 12000,
    });
    const member = await createMember(app, {
      email: email("path-sched"),
      branchId: AR_BRANCH_ID,
    });
    await assignPlan(app, adminToken, member.id, {
      planId: planA.id,
      startDate: todayStr(),
    });
    const partner = await insertPartner(app, { commissionValue: 2600 });
    await insertPartnerLink(app, {
      partnerId: partner.id,
      referredId: member.id,
      status: "pending",
    });

    const res = await changePlan(member.id, planB.id, "after_current");
    expect(res.statusCode).toBe(201);
    expect(res.body.status).toBe("scheduled");

    expect((await partnerLinkRow(app, member.id))?.status).toBe("qualified");
    expect(
      await partnerCommissionRows(app, res.body.id as number),
    ).toHaveLength(1);
  });

  it("(13) renewSubscription (renovación) genera comisión", async () => {
    const plan = await createPlan(app, adminToken, {
      name: `Renew ${seq}`,
      priceRegular: 10000,
    });
    const member = await createMember(app, {
      email: email("path-renew"),
      branchId: AR_BRANCH_ID,
    });
    await assignPlan(app, adminToken, member.id, {
      planId: plan.id,
      startDate: todayStr(),
    });
    const partner = await insertPartner(app, { commissionValue: 2700 });
    await insertPartnerLink(app, {
      partnerId: partner.id,
      referredId: member.id,
      status: "pending",
    });

    const res = await renew(member.id);
    expect(res.statusCode).toBe(201);

    expect((await partnerLinkRow(app, member.id))?.status).toBe("qualified");
    expect(
      await partnerCommissionRows(app, res.body.id as number),
    ).toHaveLength(1);
  });
});
