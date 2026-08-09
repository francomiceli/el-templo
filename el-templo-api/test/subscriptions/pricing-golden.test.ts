/**
 * 174-02 (D-06) — Golden / characterization suite de la cadena de pricing.
 *
 * La cadena de pricing (assignPlan, changePlanNow, changePlanAfterCurrent,
 * renewSubscription, getChangePlanPreview, getPricingPreview) está REPLICADA
 * INLINE en service.ts — no hay una función central. La única red de
 * seguridad real de que la migración de tenancy (Pattern A/B) no mueve una
 * sola cifra es este archivo: se corre GREEN contra el código PRE-migración
 * (esta corrida) y se vuelve a correr, SIN TOCAR NINGÚN LITERAL, contra el
 * código migrado (174-02 Task 3). Criterio de aceptación: diff CERO.
 *
 * Todos los números `toBe(N)` son la cifra REAL que produce el código de HOY
 * — no una re-derivación de la fórmula. Combos cubiertos por método:
 *   - assignPlan: base, priceOverride, boardingPass, AURA (los 4 tiers),
 *     referral, combo boardingPass+auraSpend(ignorado)+referral.
 *   - changePlanNow: NO soporta auraSpend (confirmado leyendo el código —
 *     override > boardingPass > prorrateo plano, sin branch de AURA). Cubre
 *     base (prorrateo), boardingPass (prorrateo), referral (prorrateo).
 *   - changePlanAfterCurrent: base, boardingPass, AURA (1 tier
 *     representativo), referral, combo boardingPass+referral.
 *   - renewSubscription: base (precio heredado), AURA heredado (asignado con
 *     AURA, luego renovado), referral evaluado fresco en la renovación.
 *   - getChangePlanPreview: parity contra changePlanNow (base, referral).
 *   - getPricingPreview: parity contra assignPlan (base, AURA, referral).
 *
 * Referidos: helpers.ts NO expone un createReferral — se siembra
 * directamente con SQL crudo (mismo patrón que
 * test/subscriptions/member-plans.test.ts "Pricing preview — referral
 * discount parity"): aura_config (referral, 10%), system_settings
 * (referral.max_percent_cap=40), fila en `referrals` qualified, y una
 * subscription activa para la contraparte (computeReferralDiscountPercent
 * exige "activo" = deriveCoveredUntil >= hoy, D-09/D-24).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { sql } from "drizzle-orm";
import { createTestApp, getAuthToken, cleanAllTestData } from "../helpers";
import * as schema from "../../src/db/schema";
import { PRICING_SETTINGS_KEYS } from "../../src/modules/settings/keys";
import {
  SUBSCRIPTIONS_URL,
  createPlan,
  createMember,
  assignPlan,
  seedAuraBalance,
  todayStr,
  dateOffsetStr,
} from "./_helpers";

describe("Subscriptions — Pricing golden (174-02, D-06, diff cero)", () => {
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
    // seed que member-plans.test.ts "Pricing preview — referral discount
    // parity", para que los combos de referral sean deterministas.
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
    // Zero price rule: default OFF cuando `system_settings` está vacío
    // (cleanAllTestData la vacía, settings/service.ts:77-79) — el seed real de
    // El Templo (migración 0168) la deja ON. Los combos boardingPass de este
    // archivo asumen el comportamiento "El Templo" (precio Zero real, no el
    // normalizado a 'regular' del gate D-04/156).
    await app.db
      .insert(schema.systemSettings)
      .values({
        settingKey: PRICING_SETTINGS_KEYS.zeroPrice,
        settingValue: "on",
      })
      .onDuplicateKeyUpdate({ set: { settingValue: "on" } });
  });

  /** Siembra un vínculo `qualified` referrer→referred con la contraparte
   * (referred) activa hoy (subscription end_date en el futuro), condición
   * que exige computeReferralDiscountPercent (D-09/D-24). */
  async function seedQualifiedReferral(
    referrerId: number,
    referredId: number,
    referredPlanId: number,
  ): Promise<void> {
    await app.db.execute(
      sql`INSERT INTO referrals (referrer_id, referred_id, status, attribution_channel, qualified_at)
          VALUES (${referrerId}, ${referredId}, 'qualified', 'assisted', NOW())`,
    );
    await app.db.execute(
      sql`INSERT INTO subscriptions (user_id, plan_id, branch_id, subscription_status, start_date, end_date, price_paid, currency, price_type_applied)
          VALUES (${referredId}, ${referredPlanId}, 1, 'active', ${todayStr()}, ${dateOffsetStr(30)}, 10000, 'ARS', 'regular')`,
    );
  }

  // ── assignPlan ──────────────────────────────────────────────────────────
  describe("assignPlan", () => {
    it("base — priceType regular, sin descuentos", async () => {
      const plan = await createPlan(app, adminToken, { priceRegular: 10000 });
      const member = await createMember(app, { email: "gold-a-base@test.com" });

      const res = await assignPlan(app, adminToken, member.id, {
        planId: plan.id,
      });

      expect(res.statusCode).toBe(201);
      expect(res.body.pricePaid).toBe(10000);
      expect(res.body.priceTypeApplied).toBe("regular");
      expect(res.body.auraDiscountPercent).toBe(null);
      expect(res.body.referralDiscountPercent).toBe(null);
    });

    it("priceOverrideAmount con razón", async () => {
      const plan = await createPlan(app, adminToken, { priceRegular: 10000 });
      const member = await createMember(app, {
        email: "gold-a-override@test.com",
      });

      const res = await assignPlan(app, adminToken, member.id, {
        planId: plan.id,
        priceOverrideAmount: 4000,
        priceOverrideReason: "Descuento golden",
      });

      expect(res.statusCode).toBe(201);
      expect(res.body.pricePaid).toBe(4000);
      expect(res.body.priceOverrideAmount).toBe(4000);
    });

    it("boardingPass — precio Zero, marca el pase usado", async () => {
      const plan = await createPlan(app, adminToken, {
        priceRegular: 10000,
        priceZero: 5000,
      });
      const member = await createMember(app, {
        email: "gold-a-boarding@test.com",
      });

      const res = await assignPlan(app, adminToken, member.id, {
        planId: plan.id,
        boardingPass: true,
      });

      expect(res.statusCode).toBe(201);
      expect(res.body.pricePaid).toBe(5000);
      expect(res.body.priceTypeApplied).toBe("zero");
      expect(res.body.boardingPassUsed).toBe(true);
    });

    it.each([
      { spend: 500, percent: 5, expected: 9500 },
      { spend: 1000, percent: 10, expected: 9000 },
      { spend: 2000, percent: 20, expected: 8000 },
      { spend: 5000, percent: 30, expected: 7000 },
    ])(
      "AURA tier spend=$spend ($percent%) sobre base 10000",
      async ({ spend, percent, expected }) => {
        const plan = await createPlan(app, adminToken, {
          priceRegular: 10000,
        });
        const member = await createMember(app, {
          email: `gold-a-aura-${spend}@test.com`,
        });
        await seedAuraBalance(app, member.id, spend);

        const res = await assignPlan(app, adminToken, member.id, {
          planId: plan.id,
          auraSpend: spend,
        });

        expect(res.statusCode).toBe(201);
        expect(res.body.pricePaid).toBe(expected);
        expect(res.body.auraDiscount).toBe(spend);
        expect(res.body.auraDiscountPercent).toBe(percent);
      },
    );

    it("referral — descuento simétrico sobre precio de lista", async () => {
      const plan = await createPlan(app, adminToken, { priceRegular: 10000 });
      const referrer = await createMember(app, {
        email: "gold-a-ref-referrer@test.com",
      });
      const referred = await createMember(app, {
        email: "gold-a-ref-referred@test.com",
      });
      await seedQualifiedReferral(referrer.id, referred.id, plan.id as number);

      const res = await assignPlan(app, adminToken, referrer.id, {
        planId: plan.id,
      });

      expect(res.statusCode).toBe(201);
      expect(res.body.referralDiscountPercent).toBe(10);
      expect(res.body.referralDiscountAmount).toBe(1000);
      expect(res.body.pricePaid).toBe(9000);
    });

    it("combo triple — boardingPass + auraSpend(ignorado) + referral", async () => {
      // Characterization: boardingPass y auraSpend son mutuamente excluyentes
      // en el código (override > boardingPass > AURA/plain, else-if chain) —
      // auraSpend queda SILENCIOSAMENTE ignorado cuando boardingPass=true.
      // El referral SÍ compone porque corre fuera del else-if, sobre
      // cualquier pricePaid ya resuelto.
      const plan = await createPlan(app, adminToken, {
        priceRegular: 10000,
        priceZero: 5000,
      });
      const referrer = await createMember(app, {
        email: "gold-a-triple-referrer@test.com",
      });
      const referred = await createMember(app, {
        email: "gold-a-triple-referred@test.com",
      });
      await seedAuraBalance(app, referrer.id, 500);
      await seedQualifiedReferral(referrer.id, referred.id, plan.id as number);

      const res = await assignPlan(app, adminToken, referrer.id, {
        planId: plan.id,
        boardingPass: true,
        auraSpend: 500,
      });

      expect(res.statusCode).toBe(201);
      expect(res.body.priceTypeApplied).toBe("zero");
      expect(res.body.auraDiscountPercent).toBe(null);
      expect(res.body.referralDiscountPercent).toBe(10);
      expect(res.body.referralDiscountAmount).toBe(500);
      expect(res.body.pricePaid).toBe(4500);
    });
  });

  // ── changePlanNow (startMode "now", prorrateo) ──────────────────────────
  describe("changePlanNow", () => {
    async function changeNow(
      userId: number,
      overrides: Record<string, unknown>,
    ): Promise<{ statusCode: number; body: Record<string, unknown> }> {
      const res = await app.inject({
        method: "POST",
        url: `${SUBSCRIPTIONS_URL}/members/${userId}/subscription/change-plan`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          branchId: 1,
          startDate: todayStr(),
          priceTypeApplied: "regular",
          paymentMethod: "cash",
          ...overrides,
        },
      });
      return { statusCode: res.statusCode, body: JSON.parse(res.body) };
    }

    it("base — prorrateo sin descuentos", async () => {
      const planA = await createPlan(app, adminToken, {
        name: "Golden CN Plan A",
        classesPerWeek: undefined,
        durationDays: 30,
        priceRegular: 10000,
        priceZero: 5000,
      });
      const planB = await createPlan(app, adminToken, {
        name: "Golden CN Plan B",
        classesPerWeek: undefined,
        durationDays: 30,
        priceRegular: 15000,
        priceZero: 8000,
      });
      const member = await createMember(app, { email: "gold-cn-base@test.com" });
      await assignPlan(app, adminToken, member.id, {
        planId: planA.id,
        startDate: dateOffsetStr(-15),
      });

      const res = await changeNow(member.id as number, { planId: planB.id });

      expect(res.statusCode).toBe(201);
      expect(res.body.pricePaid).toBe(10000);
    });

    it("boardingPass — consume el pase, precio Zero neto de prorrateo", async () => {
      const planA = await createPlan(app, adminToken, {
        name: "Golden CN Boarding A",
        classesPerWeek: undefined,
        durationDays: 30,
        priceRegular: 10000,
        priceZero: 5000,
      });
      const planB = await createPlan(app, adminToken, {
        name: "Golden CN Boarding B",
        classesPerWeek: undefined,
        durationDays: 30,
        priceRegular: 15000,
        priceZero: 8000,
      });
      const member = await createMember(app, {
        email: "gold-cn-boarding@test.com",
      });
      await assignPlan(app, adminToken, member.id, {
        planId: planA.id,
        startDate: dateOffsetStr(-15),
      });

      const res = await changeNow(member.id as number, {
        planId: planB.id,
        boardingPass: true,
      });

      expect(res.statusCode).toBe(201);
      expect(res.body.boardingPassUsed).toBe(true);
      expect(res.body.pricePaid).toBe(3000);
    });

    it("referral — descuento simétrico sobre el neto post-prorrateo", async () => {
      const planA = await createPlan(app, adminToken, {
        name: "Golden CN Referral A",
        classesPerWeek: undefined,
        durationDays: 30,
        priceRegular: 10000,
        priceZero: 5000,
      });
      const planB = await createPlan(app, adminToken, {
        name: "Golden CN Referral B",
        classesPerWeek: undefined,
        durationDays: 30,
        priceRegular: 15000,
        priceZero: 8000,
      });
      const referrer = await createMember(app, {
        email: "gold-cn-ref-referrer@test.com",
      });
      const referred = await createMember(app, {
        email: "gold-cn-ref-referred@test.com",
      });
      await assignPlan(app, adminToken, referrer.id, {
        planId: planA.id,
        startDate: dateOffsetStr(-15),
      });
      await seedQualifiedReferral(
        referrer.id,
        referred.id,
        planA.id as number,
      );

      const res = await changeNow(referrer.id as number, {
        planId: planB.id,
      });

      expect(res.statusCode).toBe(201);
      expect(res.body.referralDiscountPercent).toBe(10);
      expect(res.body.pricePaid).toBe(9000);
    });
  });

  // ── changePlanAfterCurrent (startMode "after_current", full price) ─────
  describe("changePlanAfterCurrent", () => {
    async function changeAfterCurrent(
      userId: number,
      overrides: Record<string, unknown>,
    ): Promise<{ statusCode: number; body: Record<string, unknown> }> {
      const res = await app.inject({
        method: "POST",
        url: `${SUBSCRIPTIONS_URL}/members/${userId}/subscription/change-plan`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          branchId: 1,
          startDate: todayStr(),
          priceTypeApplied: "regular",
          paymentMethod: "cash",
          startMode: "after_current",
          ...overrides,
        },
      });
      return { statusCode: res.statusCode, body: JSON.parse(res.body) };
    }

    it("base — precio completo del plan destino", async () => {
      const planA = await createPlan(app, adminToken, {
        name: "Golden CAC Plan A",
        classesPerWeek: undefined,
        durationDays: 30,
        priceRegular: 8000,
        priceZero: 4000,
      });
      const planB = await createPlan(app, adminToken, {
        name: "Golden CAC Plan B",
        classesPerWeek: undefined,
        durationDays: 30,
        priceRegular: 12000,
        priceZero: 6000,
      });
      const member = await createMember(app, {
        email: "gold-cac-base@test.com",
      });
      await assignPlan(app, adminToken, member.id, {
        planId: planA.id,
        startDate: todayStr(),
      });

      const res = await changeAfterCurrent(member.id as number, {
        planId: planB.id,
      });

      expect(res.statusCode).toBe(201);
      expect(res.body.status).toBe("scheduled");
      expect(res.body.pricePaid).toBe(12000);
    });

    it("boardingPass — precio Zero, consume el pase", async () => {
      const planA = await createPlan(app, adminToken, {
        name: "Golden CAC Boarding A",
        classesPerWeek: undefined,
        durationDays: 30,
        priceRegular: 8000,
        priceZero: 4000,
      });
      const planB = await createPlan(app, adminToken, {
        name: "Golden CAC Boarding B",
        classesPerWeek: undefined,
        durationDays: 30,
        priceRegular: 12000,
        priceZero: 6000,
      });
      const member = await createMember(app, {
        email: "gold-cac-boarding@test.com",
      });
      await assignPlan(app, adminToken, member.id, {
        planId: planA.id,
        startDate: todayStr(),
      });

      const res = await changeAfterCurrent(member.id as number, {
        planId: planB.id,
        boardingPass: true,
      });

      expect(res.statusCode).toBe(201);
      expect(res.body.boardingPassUsed).toBe(true);
      expect(res.body.pricePaid).toBe(6000);
    });

    it("AURA tier spend=1000 (10%) sobre el plan destino", async () => {
      const planA = await createPlan(app, adminToken, {
        name: "Golden CAC AURA A",
        classesPerWeek: undefined,
        durationDays: 30,
        priceRegular: 8000,
        priceZero: 4000,
      });
      const planB = await createPlan(app, adminToken, {
        name: "Golden CAC AURA B",
        classesPerWeek: undefined,
        durationDays: 30,
        priceRegular: 12000,
        priceZero: 6000,
      });
      const member = await createMember(app, { email: "gold-cac-aura@test.com" });
      await assignPlan(app, adminToken, member.id, {
        planId: planA.id,
        startDate: todayStr(),
      });
      await seedAuraBalance(app, member.id, 1000);

      const res = await changeAfterCurrent(member.id as number, {
        planId: planB.id,
        auraSpend: 1000,
      });

      expect(res.statusCode).toBe(201);
      expect(res.body.auraDiscount).toBe(1000);
      expect(res.body.auraDiscountPercent).toBe(10);
      expect(res.body.pricePaid).toBe(10800);
    });

    it("referral — descuento simétrico sobre precio de lista destino", async () => {
      const planA = await createPlan(app, adminToken, {
        name: "Golden CAC Referral A",
        classesPerWeek: undefined,
        durationDays: 30,
        priceRegular: 8000,
        priceZero: 4000,
      });
      const planB = await createPlan(app, adminToken, {
        name: "Golden CAC Referral B",
        classesPerWeek: undefined,
        durationDays: 30,
        priceRegular: 12000,
        priceZero: 6000,
      });
      const referrer = await createMember(app, {
        email: "gold-cac-ref-referrer@test.com",
      });
      const referred = await createMember(app, {
        email: "gold-cac-ref-referred@test.com",
      });
      await assignPlan(app, adminToken, referrer.id, {
        planId: planA.id,
        startDate: todayStr(),
      });
      await seedQualifiedReferral(
        referrer.id,
        referred.id,
        planA.id as number,
      );

      const res = await changeAfterCurrent(referrer.id as number, {
        planId: planB.id,
      });

      expect(res.statusCode).toBe(201);
      expect(res.body.referralDiscountPercent).toBe(10);
      expect(res.body.pricePaid).toBe(10800);
    });

    it("combo — boardingPass + referral compuestos", async () => {
      const planA = await createPlan(app, adminToken, {
        name: "Golden CAC Combo A",
        classesPerWeek: undefined,
        durationDays: 30,
        priceRegular: 8000,
        priceZero: 4000,
      });
      const planB = await createPlan(app, adminToken, {
        name: "Golden CAC Combo B",
        classesPerWeek: undefined,
        durationDays: 30,
        priceRegular: 12000,
        priceZero: 6000,
      });
      const referrer = await createMember(app, {
        email: "gold-cac-combo-referrer@test.com",
      });
      const referred = await createMember(app, {
        email: "gold-cac-combo-referred@test.com",
      });
      await assignPlan(app, adminToken, referrer.id, {
        planId: planA.id,
        startDate: todayStr(),
      });
      await seedQualifiedReferral(
        referrer.id,
        referred.id,
        planA.id as number,
      );

      const res = await changeAfterCurrent(referrer.id as number, {
        planId: planB.id,
        boardingPass: true,
      });

      expect(res.statusCode).toBe(201);
      expect(res.body.boardingPassUsed).toBe(true);
      expect(res.body.referralDiscountPercent).toBe(10);
      expect(res.body.pricePaid).toBe(5400);
    });
  });

  // ── renewSubscription ───────────────────────────────────────────────────
  describe("renewSubscription", () => {
    it("base — hereda pricePaid de la sub actual", async () => {
      const plan = await createPlan(app, adminToken, {
        name: "Golden Renew Base",
        classesPerWeek: 3,
        durationDays: 30,
        priceRegular: 10000,
        priceZero: 5000,
      });
      const member = await createMember(app, {
        email: "gold-renew-base@test.com",
      });
      await assignPlan(app, adminToken, member.id, {
        planId: plan.id,
        startDate: todayStr(),
      });

      const res = await app.inject({
        method: "POST",
        url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription/renew`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { paymentMethod: "cash" },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.pricePaid).toBe(10000);
    });

    it("AURA heredado — pricePaid AURA-descontado se arrastra a la renovación", async () => {
      const plan = await createPlan(app, adminToken, {
        name: "Golden Renew AURA",
        classesPerWeek: 3,
        durationDays: 30,
        priceRegular: 10000,
        priceZero: 5000,
      });
      const member = await createMember(app, {
        email: "gold-renew-aura@test.com",
      });
      await seedAuraBalance(app, member.id, 1000);
      const assigned = await assignPlan(app, adminToken, member.id, {
        planId: plan.id,
        startDate: todayStr(),
        auraSpend: 1000,
      });
      expect(assigned.body.pricePaid).toBe(9000);

      const res = await app.inject({
        method: "POST",
        url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription/renew`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { paymentMethod: "cash" },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.pricePaid).toBe(9000);
    });

    it("referral evaluado fresco en la renovación (vínculo creado después del alta)", async () => {
      const plan = await createPlan(app, adminToken, {
        name: "Golden Renew Referral",
        classesPerWeek: 3,
        durationDays: 30,
        priceRegular: 10000,
        priceZero: 5000,
      });
      const referrer = await createMember(app, {
        email: "gold-renew-ref-referrer@test.com",
      });
      const referred = await createMember(app, {
        email: "gold-renew-ref-referred@test.com",
      });
      await assignPlan(app, adminToken, referrer.id, {
        planId: plan.id,
        startDate: todayStr(),
      });
      // El vínculo se crea DESPUÉS del alta original — la renovación debe
      // recomputar el % vigente, no arrastrar el 0% con el que se asignó.
      await seedQualifiedReferral(
        referrer.id,
        referred.id,
        plan.id as number,
      );

      const res = await app.inject({
        method: "POST",
        url: `${SUBSCRIPTIONS_URL}/members/${referrer.id}/subscription/renew`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { paymentMethod: "cash" },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.referralDiscountPercent).toBe(10);
      expect(body.pricePaid).toBe(9000);
    });

    it("combo — AURA heredado + referral fresco componen", async () => {
      const plan = await createPlan(app, adminToken, {
        name: "Golden Renew Combo",
        classesPerWeek: 3,
        durationDays: 30,
        priceRegular: 10000,
        priceZero: 5000,
      });
      const referrer = await createMember(app, {
        email: "gold-renew-combo-referrer@test.com",
      });
      const referred = await createMember(app, {
        email: "gold-renew-combo-referred@test.com",
      });
      await seedAuraBalance(app, referrer.id, 1000);
      const assigned = await assignPlan(app, adminToken, referrer.id, {
        planId: plan.id,
        startDate: todayStr(),
        auraSpend: 1000,
      });
      expect(assigned.body.pricePaid).toBe(9000);
      await seedQualifiedReferral(
        referrer.id,
        referred.id,
        plan.id as number,
      );

      const res = await app.inject({
        method: "POST",
        url: `${SUBSCRIPTIONS_URL}/members/${referrer.id}/subscription/renew`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { paymentMethod: "cash" },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.referralDiscountPercent).toBe(10);
      expect(body.pricePaid).toBe(8100);
    });
  });

  // ── getChangePlanPreview — parity con changePlanNow ─────────────────────
  describe("getChangePlanPreview parity", () => {
    async function preview(
      userId: number,
      targetPlanId: number,
    ): Promise<Record<string, unknown>> {
      const res = await app.inject({
        method: "GET",
        url: `${SUBSCRIPTIONS_URL}/members/${userId}/subscription/change-plan-preview?targetPlanId=${targetPlanId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      return JSON.parse(res.body);
    }

    it("base — netAmount del preview === pricePaid del cobro real", async () => {
      const planA = await createPlan(app, adminToken, {
        name: "Golden Preview CN A",
        classesPerWeek: undefined,
        durationDays: 30,
        priceRegular: 10000,
        priceZero: 5000,
      });
      const planB = await createPlan(app, adminToken, {
        name: "Golden Preview CN B",
        classesPerWeek: undefined,
        durationDays: 30,
        priceRegular: 15000,
        priceZero: 8000,
      });
      const member = await createMember(app, {
        email: "gold-preview-cn-base@test.com",
      });
      await assignPlan(app, adminToken, member.id, {
        planId: planA.id,
        startDate: dateOffsetStr(-15),
      });

      const pv = await preview(member.id as number, planB.id as number);
      expect(pv.netAmount).toBe(10000);

      const res = await app.inject({
        method: "POST",
        url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription/change-plan`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          planId: planB.id,
          branchId: 1,
          startDate: todayStr(),
          priceTypeApplied: "regular",
          paymentMethod: "cash",
        },
      });
      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.pricePaid).toBe(pv.netAmount);
    });

    it("referral — netAmount del preview (simulatePendingQualification) === cobro real", async () => {
      const planA = await createPlan(app, adminToken, {
        name: "Golden Preview CN Ref A",
        classesPerWeek: undefined,
        durationDays: 30,
        priceRegular: 10000,
        priceZero: 5000,
      });
      const planB = await createPlan(app, adminToken, {
        name: "Golden Preview CN Ref B",
        classesPerWeek: undefined,
        durationDays: 30,
        priceRegular: 15000,
        priceZero: 8000,
      });
      const referrer = await createMember(app, {
        email: "gold-preview-cn-ref-referrer@test.com",
      });
      const referred = await createMember(app, {
        email: "gold-preview-cn-ref-referred@test.com",
      });
      await assignPlan(app, adminToken, referrer.id, {
        planId: planA.id,
        startDate: dateOffsetStr(-15),
      });
      await seedQualifiedReferral(
        referrer.id,
        referred.id,
        planA.id as number,
      );

      const pv = await preview(referrer.id as number, planB.id as number);
      expect(pv.referralDiscountPercent).toBe(10);
      expect(pv.netAmount).toBe(9000);

      const res = await app.inject({
        method: "POST",
        url: `${SUBSCRIPTIONS_URL}/members/${referrer.id}/subscription/change-plan`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          planId: planB.id,
          branchId: 1,
          startDate: todayStr(),
          priceTypeApplied: "regular",
          paymentMethod: "cash",
        },
      });
      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.pricePaid).toBe(pv.netAmount);
    });
  });

  // ── getPricingPreview — parity con assignPlan ───────────────────────────
  describe("getPricingPreview parity", () => {
    async function preview(
      userId: number,
      planId: number,
      extra = "",
    ): Promise<Record<string, unknown>> {
      const res = await app.inject({
        method: "GET",
        url: `${SUBSCRIPTIONS_URL}/members/${userId}/subscription/pricing-preview?planId=${planId}&priceType=regular${extra}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      return JSON.parse(res.body);
    }

    it("base — finalPrice del preview === pricePaid del alta real", async () => {
      const plan = await createPlan(app, adminToken, { priceRegular: 10000 });
      const member = await createMember(app, {
        email: "gold-preview-pp-base@test.com",
      });

      const pv = await preview(member.id as number, plan.id as number);
      expect(pv.finalPrice).toBe(10000);

      const assigned = await assignPlan(app, adminToken, member.id, {
        planId: plan.id,
      });
      expect(assigned.body.pricePaid).toBe(pv.finalPrice);
    });

    it("AURA — finalPrice del preview === pricePaid del alta real", async () => {
      const plan = await createPlan(app, adminToken, { priceRegular: 10000 });
      const member = await createMember(app, {
        email: "gold-preview-pp-aura@test.com",
      });
      await seedAuraBalance(app, member.id, 2000);

      const pv = await preview(
        member.id as number,
        plan.id as number,
        "&auraSpend=2000",
      );
      expect(pv.discountType).toBe("aura");
      expect(pv.finalPrice).toBe(8000);

      const assigned = await assignPlan(app, adminToken, member.id, {
        planId: plan.id,
        auraSpend: 2000,
      });
      expect(assigned.body.pricePaid).toBe(pv.finalPrice);
    });

    it("referral — finalPrice del preview === pricePaid del alta real", async () => {
      const plan = await createPlan(app, adminToken, { priceRegular: 10000 });
      const referrer = await createMember(app, {
        email: "gold-preview-pp-ref-referrer@test.com",
      });
      const referred = await createMember(app, {
        email: "gold-preview-pp-ref-referred@test.com",
      });
      await seedQualifiedReferral(referrer.id, referred.id, plan.id as number);

      const pv = await preview(referrer.id as number, plan.id as number);
      expect(pv.referralDiscountPercent).toBe(10);
      expect(pv.finalPrice).toBe(9000);

      const assigned = await assignPlan(app, adminToken, referrer.id, {
        planId: plan.id,
      });
      expect(assigned.body.pricePaid).toBe(pv.finalPrice);
    });
  });
});
