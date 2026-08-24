/**
 * Fase 176 Plan 10 (MOD-02) — un tenant sin `templo-gamification` cobra el
 * precio base, sin errores, y el core (override/prorrateo/referidos) sigue
 * funcionando.
 *
 * POR QUÉ EXISTE ESTE ARCHIVO
 * ----------------------------
 * `getPricingPreview`/`assignPlan` ya no conocen `auraSpend`/`boardingPass` —
 * viajan opacos en `moduleInput` y los interpreta el handler de
 * `templo-gamification` (`aura/pricing-benefits.ts`) SOLO si el módulo está
 * habilitado (`HookRegistry.runFilter`, `shared/hooks.ts`). Este archivo es
 * la prueba de que, con el módulo apagado, esos dos campos son INERTES (se
 * ignoran, nunca explotan) y que el resto de la cadena de pricing —core,
 * `subscriptions/pricing.ts`— sigue cobrando exactamente igual.
 *
 * ESTRATEGIA: TENANT 1, FLAG APAGADO EXPLÍCITO
 * -----------------------------------------------
 * En vez de sembrar un segundo gimnasio (que no trae `aura_config` ni cajas,
 * `test/fixtures/second-tenant.ts:64-80`), este archivo trabaja sobre
 * `TENANT_TEMPLO` apagando `templo-gamification` con `setModuleFlag` —
 * reusa toda la siembra de plan/socio/AURA que ya resuelven los helpers de
 * `test/subscriptions/_helpers.ts`. Cada test que apaga el flag es
 * responsable de restaurarlo: `afterEach` llama `restoreTemploFlags` (mismo
 * patrón que `test/tenancy/mod-02-hooks.test.ts`) para no filtrar un módulo
 * apagado al siguiente archivo del mismo worker (`vitest.config.ts`,
 * `isolate: false`, Pitfall 4 de `module-flags.ts`).
 *
 * QUÉ CUBRE CADA CASO
 * -----------------------
 *   1. `auraSpend` en el body: ignorado, 201, precio BASE, saldo AURA intacto.
 *   2. `boardingPass` en el body: ignorado, 201, precio BASE (no Zero), el
 *      pase NO se consume (ni en la sub ni en `users.boarding_pass_used`).
 *   3. El core (override + referidos) sigue funcionando con el módulo OFF —
 *      ninguno de los dos depende del filter `pricing.adjust`.
 *   4. El preview conserva TODOS los campos con valores neutros (Pitfall 5
 *      del plan: el PoS del admin lee esos campos y CI no typechequea el
 *      admin — un `undefined` rompe distinto a un `0`/`[]`/`false`).
 *   5. Contraste: el mismo assign del caso 1, con el módulo PRENDIDO, sí
 *      aplica el descuento AURA — para que los casos 1-4 no puedan pasar
 *      por la razón equivocada (p.ej. un bug que ignora `auraSpend` SIEMPRE).
 *
 * COMO CORRERLO
 * -------------
 *   pnpm exec vitest run --no-file-parallelism test/tenancy/mod-02-pricing-module-off.test.ts --hookTimeout=250000
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { createTestApp, getAuthToken, cleanAllTestData } from "../helpers";
import * as schema from "../../src/db/schema";
import { tenantWhere } from "../../src/modules/shared/tenant";
import {
  SUBSCRIPTIONS_URL,
  createPlan,
  createMember,
  assignPlan,
  seedAuraBalance,
  todayStr,
  dateOffsetStr,
} from "../subscriptions/_helpers";
import { TENANT_TEMPLO } from "../fixtures/second-tenant";
import { setModuleFlag, restoreTemploFlags } from "../fixtures/module-flags";

const TEMPLO_CTX = { tenantId: TENANT_TEMPLO };

describe("MOD-02 — pricing con templo-gamification apagado", () => {
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
    // Habilita el descuento de referidos (10% por vínculo, cap 40%) — mismo
    // seed que pricing-golden.test.ts, para que el caso 3 (core sigue
    // funcionando) sea determinista.
    await app.db.execute(
      sql`INSERT INTO aura_config (aura_config_source_type, default_amount)
          VALUES ('referral', 10)
          ON DUPLICATE KEY UPDATE default_amount = 10`,
    );
    await app.db.execute(
      sql`INSERT INTO system_settings (setting_key, setting_value)
          VALUES ('referral.max_percent_cap', '40')
          ON DUPLICATE KEY UPDATE setting_value = '40'`,
    );
  });

  // Cada test que apaga/prende el flag es responsable de restaurarlo — deja
  // los 4 módulos de El Templo en ON (estado de la mig 0209) para no
  // filtrar al siguiente archivo del mismo worker (isolate: false).
  afterEach(async () => {
    await restoreTemploFlags(app);
  });

  /** Siembra un vínculo `qualified` referrer→referred con la contraparte
   * activa hoy — mismo patrón que pricing-golden.test.ts. */
  async function seedQualifiedReferral(
    referrerId: number,
    referredId: number,
    referredPlanId: number,
  ): Promise<void> {
    await app.db.execute(
      sql`INSERT INTO referrals (tenant_id, referrer_id, referred_id, status, attribution_channel, qualified_at)
          VALUES (${TENANT_TEMPLO}, ${referrerId}, ${referredId}, 'qualified', 'assisted', NOW())`,
    );
    await app.db.execute(
      sql`INSERT INTO subscriptions (tenant_id, user_id, plan_id, branch_id, subscription_status, start_date, end_date, price_paid, currency, price_type_applied)
          VALUES (${TENANT_TEMPLO}, ${referredId}, ${referredPlanId}, 1, 'active', ${todayStr()}, ${dateOffsetStr(30)}, 10000, 'ARS', 'regular')`,
    );
  }

  it("auraSpend ignorado, no error: precio base y el saldo AURA no se mueve", async () => {
    await setModuleFlag(app, TENANT_TEMPLO, "templo-gamification", false);

    const plan = await createPlan(app, adminToken, { priceRegular: 10000 });
    const member = await createMember(app, {
      email: "mod02-off-aura@test.com",
    });
    await seedAuraBalance(app, member.id as number, 2000);

    const res = await assignPlan(app, adminToken, member.id, {
      planId: plan.id,
      auraSpend: 2000,
    });

    expect(res.statusCode).toBe(201);
    expect(res.body.pricePaid).toBe(10000);
    expect(res.body.auraDiscount).toBe(null);
    expect(res.body.auraDiscountPercent).toBe(null);

    const [balanceRow] = await app.db
      .select({ balance: schema.auraBalances.balance })
      .from(schema.auraBalances)
      .where(eq(schema.auraBalances.userId, member.id as number));
    expect(
      balanceRow?.balance,
      "el módulo apagado no debe descontar saldo AURA — el filter no corrió",
    ).toBe(2000);
  });

  it("boardingPass ignorado, no error: cobra el precio base y no consume el pase", async () => {
    await setModuleFlag(app, TENANT_TEMPLO, "templo-gamification", false);

    const plan = await createPlan(app, adminToken, {
      priceRegular: 10000,
      priceZero: 5000,
    });
    const member = await createMember(app, {
      email: "mod02-off-boarding@test.com",
    });

    const res = await assignPlan(app, adminToken, member.id, {
      planId: plan.id,
      boardingPass: true,
    });

    expect(res.statusCode).toBe(201);
    expect(res.body.pricePaid).toBe(10000);
    expect(res.body.priceTypeApplied).toBe("regular");
    expect(res.body.boardingPassUsed).toBe(false);

    const [userRow] = await app.db
      .select({ boardingPassUsed: schema.users.boardingPassUsed })
      .from(schema.users)
      .where(
        and(
          tenantWhere(schema.users, TEMPLO_CTX),
          eq(schema.users.id, member.id as number),
        ),
      );
    expect(
      userRow?.boardingPassUsed,
      "el pase NO se consume con el módulo apagado",
    ).toBe(false);
  });

  it("el core sigue funcionando con el módulo apagado: override y referido", async () => {
    await setModuleFlag(app, TENANT_TEMPLO, "templo-gamification", false);

    // Override — CORE, no depende del filter.
    const overridePlan = await createPlan(app, adminToken, {
      name: "Plan MOD-02 Override",
      priceRegular: 10000,
    });
    const overrideMember = await createMember(app, {
      email: "mod02-off-override@test.com",
    });
    const overrideRes = await assignPlan(app, adminToken, overrideMember.id, {
      planId: overridePlan.id,
      priceOverrideAmount: 4000,
      priceOverrideReason: "Override con el módulo apagado",
    });
    expect(overrideRes.statusCode).toBe(201);
    expect(overrideRes.body.pricePaid).toBe(4000);
    expect(overrideRes.body.priceOverrideAmount).toBe(4000);

    // Referido — CORE (`tenant-scoped` en el manifiesto), corre en el
    // caller DESPUÉS de resolvePlanPrice, no depende del filter.
    const referralPlan = await createPlan(app, adminToken, {
      name: "Plan MOD-02 Referral",
      priceRegular: 10000,
    });
    const referrer = await createMember(app, {
      email: "mod02-off-ref-referrer@test.com",
    });
    const referred = await createMember(app, {
      email: "mod02-off-ref-referred@test.com",
    });
    await seedQualifiedReferral(
      referrer.id as number,
      referred.id as number,
      referralPlan.id as number,
    );

    const referralRes = await assignPlan(app, adminToken, referrer.id, {
      planId: referralPlan.id,
    });
    expect(referralRes.statusCode).toBe(201);
    expect(referralRes.body.referralDiscountPercent).toBe(10);
    expect(referralRes.body.referralDiscountAmount).toBe(1000);
    expect(referralRes.body.pricePaid).toBe(9000);
  });

  it("preview con el módulo apagado: campos neutros, finalPrice === basePrice", async () => {
    await setModuleFlag(app, TENANT_TEMPLO, "templo-gamification", false);

    const plan = await createPlan(app, adminToken, { priceRegular: 10000 });
    const member = await createMember(app, {
      email: "mod02-off-preview@test.com",
    });

    const res = await app.inject({
      method: "GET",
      url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription/pricing-preview?planId=${plan.id}&priceType=regular`,
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);

    // Pitfall 5: campos NEUTROS, nunca `undefined` — afirmados uno por uno,
    // sin snapshot, para que un futuro cambio de forma falle acá y no en el
    // PoS del admin (CI no lo typechequea).
    expect(body.auraBalance).toBe(0);
    expect(body.availableTiers).toEqual([]);
    expect(body.boardingPassEligible).toBe(false);
    expect(body.discountType).toBe("none");
    expect(body.discountAmount).toBe(0);
    expect(body.auraToSpend).toBe(0);
    expect(body.finalPrice).toBe(body.basePrice);
    expect(body.finalPrice).toBe(10000);
  });

  it("contraste: el mismo assign con el módulo PRENDIDO sí aplica el descuento AURA", async () => {
    await setModuleFlag(app, TENANT_TEMPLO, "templo-gamification", true);

    const plan = await createPlan(app, adminToken, { priceRegular: 10000 });
    const member = await createMember(app, {
      email: "mod02-on-aura-contraste@test.com",
    });
    await seedAuraBalance(app, member.id as number, 2000);

    const res = await assignPlan(app, adminToken, member.id, {
      planId: plan.id,
      auraSpend: 2000,
    });

    expect(res.statusCode).toBe(201);
    expect(res.body.pricePaid).toBe(8000);
    expect(res.body.auraDiscount).toBe(2000);
    expect(res.body.auraDiscountPercent).toBe(20);
  });
});
