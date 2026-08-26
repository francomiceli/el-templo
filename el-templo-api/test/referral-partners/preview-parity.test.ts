/**
 * Fase 179 Plan 07 (D-09/D-10/D-20) — paridad preview↔cobro del descuento de
 * partner. Existe `test/referrals/preview-parity.test.ts` justamente porque
 * una divergencia entre preview y cobro ya pasó en producción con el
 * descuento de referidos — este archivo defiende el mismo invariante para el
 * descuento de partner, que compite contra AURA con la misma regla "gana el
 * mayor" (D-10/D-20).
 *
 * Lo que estos tests defienden, en orden de importancia:
 *  1. Paridad EXACTA: el `pricePaid` del cobro real (`assignPlan`) coincide
 *     bit a bit con el `finalPrice` que el preview mostró, en los 3
 *     escenarios de "gana el mayor" (sólo partner, gana partner vs AURA,
 *     gana AURA vs partner).
 *  2. El preview es SOLO LECTURA (T-179-28): dos llamadas seguidas al
 *     preview nunca cambian `benefit_status` del vínculo ni crean una
 *     comisión — sólo el cobro real (`assignPlan`) los muta.
 *  3. Cuando gana AURA, el preview reporta `partnerDiscountPercent/Amount`
 *     en null, igual que el cobro (el beneficio de partner no se refleja en
 *     el precio, aunque SÍ se consumiría con `perdio_vs_aura` en el cobro
 *     real — el preview nunca llega a tocar esa fila).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  createTestApp,
  getAuthToken,
  cleanAllTestData,
} from "../helpers";
import {
  createPlan,
  createMember,
  assignPlan,
  seedAuraBalance,
  SUBSCRIPTIONS_URL,
} from "../subscriptions/_helpers";
import { insertPartner, insertPartnerLink, partnerCommissionRows } from "./_helpers";

let app: FastifyInstance;
let adminToken: string;
const AR_BRANCH_ID = 1; // sede seed de test/setup.ts, tenant 1, country='AR'.
let seq = 0;

beforeAll(async () => {
  app = await createTestApp();
  adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
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
  return `pp-${prefix}-${seq}-${Date.now()}@test.com`;
}

interface PreviewBody {
  basePrice: number;
  discountType: string;
  discountAmount: number;
  finalPrice: number;
  auraToSpend: number;
  partnerDiscountPercent: number | null;
  partnerDiscountAmount: number | null;
}

async function getPricingPreview(
  memberId: number,
  planId: number,
  auraSpend?: number,
): Promise<{ statusCode: number; body: PreviewBody }> {
  const qs = auraSpend
    ? `&auraSpend=${auraSpend}`
    : "";
  const res = await app.inject({
    method: "GET",
    url: `${SUBSCRIPTIONS_URL}/members/${memberId}/subscription/pricing-preview?planId=${planId}&priceType=regular${qs}`,
    headers: { authorization: `Bearer ${adminToken}` },
  });
  return { statusCode: res.statusCode, body: JSON.parse(res.body) };
}

async function readBenefitStatus(referredId: number): Promise<string | null> {
  const rows = await app.db.execute(
    sql`SELECT benefit_status FROM partner_referrals WHERE referred_id = ${referredId}`,
  );
  const list = rows[0] as unknown as Array<{ benefit_status: string }>;
  return list[0]?.benefit_status ?? null;
}

describe("Preview↔cobro: paridad exacta del descuento de partner (D-09/D-10/D-20)", () => {
  it("(1) sólo partner (sin AURA en juego): finalPrice del preview === pricePaid del cobro", async () => {
    const partner = await insertPartner(app, { benefitValue: 20 });
    const member = await createMember(app, {
      email: email("only-partner"),
      branchId: AR_BRANCH_ID,
    });
    await insertPartnerLink(app, {
      partnerId: partner.id,
      referredId: member.id,
      benefitType: "discount_percent",
      benefitValue: 20,
      benefitStatus: "pending",
    });
    const plan = await createPlan(app, adminToken, { priceRegular: 15000 });

    const preview = await getPricingPreview(member.id, plan.id);
    expect(preview.statusCode).toBe(200);
    expect(preview.body.partnerDiscountPercent).toBe(20);
    expect(preview.body.partnerDiscountAmount).toBe(3000);
    expect(preview.body.finalPrice).toBe(12000);
    // discountType/auraToSpend siguen en 'none'/0 — AURA nunca estuvo en juego.
    expect(preview.body.discountType).toBe("none");
    expect(preview.body.auraToSpend).toBe(0);

    const charge = await assignPlan(app, adminToken, member.id, {
      planId: plan.id,
    });
    expect(charge.statusCode).toBe(201);
    expect(charge.body.pricePaid).toBe(preview.body.finalPrice);
  });

  it("(2) gana el partner vs AURA (30% vs tier 10%): finalPrice del preview === pricePaid del cobro, sin gastar AURA", async () => {
    const partner = await insertPartner(app, { benefitValue: 30 });
    const member = await createMember(app, {
      email: email("wins-partner"),
      branchId: AR_BRANCH_ID,
    });
    await insertPartnerLink(app, {
      partnerId: partner.id,
      referredId: member.id,
      benefitType: "discount_percent",
      benefitValue: 30,
      benefitStatus: "pending",
    });
    await seedAuraBalance(app, member.id, 5000);
    const plan = await createPlan(app, adminToken, { priceRegular: 15000 });

    const preview = await getPricingPreview(member.id, plan.id, 1000); // tier 10%
    expect(preview.statusCode).toBe(200);
    expect(preview.body.partnerDiscountPercent).toBe(30);
    expect(preview.body.partnerDiscountAmount).toBe(4500);
    expect(preview.body.finalPrice).toBe(10500);
    // El preview NUNCA promete gastar AURA cuando el partner gana (T-179-28).
    expect(preview.body.discountType).toBe("none");
    expect(preview.body.auraToSpend).toBe(0);

    const charge = await assignPlan(app, adminToken, member.id, {
      planId: plan.id,
      auraSpend: 1000,
    });
    expect(charge.statusCode).toBe(201);
    expect(charge.body.pricePaid).toBe(preview.body.finalPrice);
    expect(charge.body.auraDiscount).toBeNull();
  });

  it("(3) gana AURA vs partner (tier 30% vs 10%): finalPrice del preview === pricePaid del cobro, sin descuento de partner", async () => {
    const partner = await insertPartner(app, { benefitValue: 10 });
    const member = await createMember(app, {
      email: email("wins-aura"),
      branchId: AR_BRANCH_ID,
    });
    await insertPartnerLink(app, {
      partnerId: partner.id,
      referredId: member.id,
      benefitType: "discount_percent",
      benefitValue: 10,
      benefitStatus: "pending",
    });
    await seedAuraBalance(app, member.id, 5000);
    const plan = await createPlan(app, adminToken, { priceRegular: 15000 });

    const preview = await getPricingPreview(member.id, plan.id, 5000); // tier 30%
    expect(preview.statusCode).toBe(200);
    // Gana AURA: el preview reporta el descuento de partner en null, igual
    // que el cobro real (que igual consumiría el vínculo con
    // 'perdio_vs_aura', pero eso el preview no lo hace — sólo lectura).
    expect(preview.body.partnerDiscountPercent).toBeNull();
    expect(preview.body.partnerDiscountAmount).toBeNull();
    expect(preview.body.discountType).toBe("aura");
    expect(preview.body.auraToSpend).toBe(5000);
    expect(preview.body.finalPrice).toBe(10500); // 15000 - 30%

    const charge = await assignPlan(app, adminToken, member.id, {
      planId: plan.id,
      auraSpend: 5000,
    });
    expect(charge.statusCode).toBe(201);
    expect(charge.body.pricePaid).toBe(preview.body.finalPrice);
    expect(charge.body.auraDiscount).toBe(5000);
  });

  it("(4) el preview es SOLO LECTURA: dos llamadas seguidas no cambian benefit_status ni crean comisiones", async () => {
    const partner = await insertPartner(app, { benefitValue: 20 });
    const member = await createMember(app, {
      email: email("readonly"),
      branchId: AR_BRANCH_ID,
    });
    await insertPartnerLink(app, {
      partnerId: partner.id,
      referredId: member.id,
      benefitType: "discount_percent",
      benefitValue: 20,
      benefitStatus: "pending",
    });
    const plan = await createPlan(app, adminToken, { priceRegular: 15000 });

    const first = await getPricingPreview(member.id, plan.id);
    expect(first.statusCode).toBe(200);
    expect(first.body.partnerDiscountPercent).toBe(20);
    expect(await readBenefitStatus(member.id)).toBe("pending");

    const second = await getPricingPreview(member.id, plan.id);
    expect(second.statusCode).toBe(200);
    expect(second.body.partnerDiscountPercent).toBe(20);
    expect(second.body.finalPrice).toBe(first.body.finalPrice);
    // Sigue pending tras la SEGUNDA llamada — nada se consumió.
    expect(await readBenefitStatus(member.id)).toBe("pending");

    // Tampoco nació ninguna comisión: qualifyAndCommission nunca corrió.
    // No hay subscriptionId todavía (no hubo cobro), así que se verifica
    // por partner_id — cero filas en total para este partner.
    const rows = await app.db.execute(
      sql`SELECT COUNT(*) as cnt FROM partner_commissions WHERE partner_id = ${partner.id}`,
    );
    const count = (rows[0] as unknown as Array<{ cnt: number }>)[0].cnt;
    expect(Number(count)).toBe(0);

    // Y el cobro real, recién ACÁ, sí consume el vínculo y sí materializa
    // el mismo finalPrice que el preview venía mostrando.
    const charge = await assignPlan(app, adminToken, member.id, {
      planId: plan.id,
    });
    expect(charge.statusCode).toBe(201);
    expect(charge.body.pricePaid).toBe(first.body.finalPrice);
    expect(await readBenefitStatus(member.id)).toBe("consumed");
    expect(await partnerCommissionRows(app, charge.body.id as number)).toHaveLength(1);
  });
});
