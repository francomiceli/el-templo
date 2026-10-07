/**
 * Fase 194 — el ÁRBITRO de descuentos en las charge-paths que NO son el alta
 * (194-16 changePlanAfterCurrent; 194-17 changePlanNow; 194-18 renewSubscription).
 *
 * Cobros reales por HTTP (`POST .../subscription/change-plan` con
 * `startMode: "after_current"` o `"now"`). Números redondos: plan destino de 100000 ARS
 * (200000 en el cambio inmediato, con crédito remanente de 50000), descuento por
 * invitación 10% (aura_config.referral=10), precio Zero 70000.
 * Fechas siempre relativas a `todayInTz(tz de la sede)`; nunca ids de `users`
 * hardcodeados.
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  vi,
} from "vitest";
import { and, eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { createTestApp, getAuthToken, cleanAllTestData } from "../helpers";
import {
  createPlan,
  assignPlan,
  seedAuraBalance,
  SUBSCRIPTIONS_URL,
} from "../subscriptions/_helpers";
import {
  insertPartner,
  insertPartnerLink,
} from "../referral-partners/_helpers";
import * as schema from "../../src/db/schema";
import { NotificationService } from "../../src/modules/notifications/service";
import { setInvitationSettings } from "../../src/modules/referrals/invitation-settings";
import { PRICING_SETTINGS_KEYS } from "../../src/modules/settings/keys";
import { addDays, todayInTz } from "../../src/modules/shared/date-utils";
import { tenantWhere } from "../../src/modules/shared/tenant";
import {
  settlementColumns,
  type ChargeSettlement,
} from "../../src/modules/subscriptions/discount-arbiter";
import { computeProratedPrice } from "../../src/modules/subscriptions/month-end";
import {
  createInvitationRow,
  createInviterWithCode,
  createMemberInPhysicalBranch,
  createMembershipPlan,
  fixtureCtx,
  resetInvitationSettings,
  type InvitationsFixtureCtx,
} from "./_helpers";

const TZ_AR = "America/Argentina/Buenos_Aires";
const BASE = 100000;
const PRICE_ZERO = 70000;

let app: FastifyInstance;
let ctx: InvitationsFixtureCtx;
let adminToken: string;
let seq = 0;

beforeAll(async () => {
  app = await createTestApp();
  ctx = fixtureCtx(app);
  adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await cleanAllTestData(app);
  await resetInvitationSettings(ctx);
  seq += 1;
  // cleanAllTestData vacía aura_config y system_settings: se resiembran.
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
  await new NotificationService(app.db, app.log).seedTemplates(ctx.tenant);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Fixtures ────────────────────────────────────────────────────────────────

/** Plan de 100000 (Zero 70000) con el flag D-10b configurable. */
async function monthPlan(
  allowsInvitationDiscount: boolean,
  priceRegular: number = BASE,
  priceZero: number = PRICE_ZERO,
): Promise<number> {
  const plan = await createPlan(app, adminToken, {
    name: `Paths ${seq}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    priceRegular,
    priceZero,
    classesPerWeek: undefined,
    durationDays: 30,
    allowsInvitationDiscount,
  });
  return plan.id;
}

interface Payer {
  id: number;
  branchId: number;
}

/**
 * Socio con una membresía paga ACTIVA (plan SIN flag, hoy): es el "actual" del
 * cambio diferido. Se asigna ANTES de crear vínculos/partner para que el alta no
 * lleve descuento ni vínculo.
 */
async function payerWithPaidSub(): Promise<Payer> {
  const member = await createMemberInPhysicalBranch(ctx, { status: "prueba" });
  const res = await assignPlan(app, adminToken, member.id, {
    planId: await monthPlan(false),
    branchId: member.branchId,
    startDate: todayInTz(TZ_AR),
  });
  expect(res.statusCode).toBe(201);
  return { id: member.id, branchId: member.branchId };
}

/** Vínculo heredado `qualified` con un invitador con membresía vigente (D-17). */
async function giveQualifiedLink(payerId: number): Promise<number> {
  const referrer = await createInviterWithCode(ctx);
  await app.db.execute(
    sql`INSERT INTO referrals (tenant_id, referrer_id, referred_id, status, attribution_channel, qualified_at)
        VALUES (${ctx.tenant.tenantId}, ${referrer.id}, ${payerId}, 'qualified', 'assisted', NOW())`,
  );
  return referrer.id;
}

async function givePartner(payerId: number, percent: number): Promise<void> {
  const partner = await insertPartner(app, { benefitValue: percent });
  await insertPartnerLink(app, {
    partnerId: partner.id,
    referredId: payerId,
    benefitType: "discount_percent",
    benefitValue: percent,
    benefitStatus: "pending",
  });
}

async function changeAfterCurrent(
  payer: Payer,
  planId: number,
  extra: Record<string, unknown> = {},
): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  const res = await app.inject({
    method: "POST",
    url: `${SUBSCRIPTIONS_URL}/members/${payer.id}/subscription/change-plan`,
    headers: { authorization: `Bearer ${adminToken}` },
    payload: {
      planId,
      branchId: payer.branchId,
      startDate: todayInTz(TZ_AR),
      startMode: "after_current",
      priceTypeApplied: "regular",
      paymentMethod: "cash",
      ...extra,
    },
  });
  return { statusCode: res.statusCode, body: JSON.parse(res.body) };
}

interface SubRow {
  pricePaid: number;
  status: string;
  auraDiscount: number | null;
  auraDiscountPercent: number | null;
  referralDiscountPercent: number | null;
  referralDiscountAmount: number | null;
  partnerDiscountPercent: number | null;
  partnerDiscountAmount: number | null;
  priceOverrideAmount: number | null;
  boardingPassUsed: boolean;
}

async function readSub(subscriptionId: number): Promise<SubRow> {
  const [row] = await app.db
    .select({
      pricePaid: schema.subscriptions.pricePaid,
      status: schema.subscriptions.status,
      auraDiscount: schema.subscriptions.auraDiscount,
      auraDiscountPercent: schema.subscriptions.auraDiscountPercent,
      referralDiscountPercent: schema.subscriptions.referralDiscountPercent,
      referralDiscountAmount: schema.subscriptions.referralDiscountAmount,
      partnerDiscountPercent: schema.subscriptions.partnerDiscountPercent,
      partnerDiscountAmount: schema.subscriptions.partnerDiscountAmount,
      priceOverrideAmount: schema.subscriptions.priceOverrideAmount,
      boardingPassUsed: schema.subscriptions.boardingPassUsed,
    })
    .from(schema.subscriptions)
    .where(
      and(
        tenantWhere(schema.subscriptions, ctx.tenant),
        eq(schema.subscriptions.id, subscriptionId),
      ),
    );
  if (!row) throw new Error(`sub ${subscriptionId} no existe`);
  return row;
}

async function referralRowsOf(userId: number) {
  return app.db
    .select()
    .from(schema.referrals)
    .where(
      and(
        tenantWhere(schema.referrals, ctx.tenant),
        eq(schema.referrals.referredId, userId),
      ),
    );
}

async function creditOf(
  userId: number,
): Promise<{ percent: number; amount: number } | undefined> {
  const rows = await app.db.execute(
    sql`SELECT percent, amount FROM referral_credits WHERE user_id = ${userId} AND tenant_id = ${ctx.tenant.tenantId} ORDER BY id DESC LIMIT 1`,
  );
  return (rows[0] as unknown as Array<{ percent: number; amount: number }>)[0];
}

async function auraBalanceOf(userId: number): Promise<number> {
  const rows = await app.db.execute(
    sql`SELECT balance FROM aura_balances WHERE user_id = ${userId}`,
  );
  return (rows[0] as unknown as Array<{ balance: number }>)[0]?.balance ?? 0;
}

async function partnerLinkOf(
  referredId: number,
): Promise<{ benefit_status: string; applied_reason: string | null }> {
  const rows = await app.db.execute(
    sql`SELECT benefit_status, applied_reason FROM partner_referrals WHERE referred_id = ${referredId} AND tenant_id = ${ctx.tenant.tenantId}`,
  );
  return (
    rows[0] as unknown as Array<{
      benefit_status: string;
      applied_reason: string | null;
    }>
  )[0];
}

async function notificationKeysOf(userId: number): Promise<string[]> {
  const rows = await app.db.execute(
    sql`SELECT t.template_key AS template_key
        FROM pending_notifications pn
        LEFT JOIN notification_templates t ON t.id = pn.template_id
        WHERE pn.user_id = ${userId} AND pn.tenant_id = ${ctx.tenant.tenantId}`,
  );
  return (rows[0] as unknown as Array<{ template_key: string }>).map(
    (r) => r.template_key,
  );
}

async function giveDeviceToken(userId: number): Promise<void> {
  await app.db.execute(
    sql`INSERT INTO device_tokens (tenant_id, user_id, token, device_platform)
        VALUES (${ctx.tenant.tenantId}, ${userId}, ${`tok-${userId}-${Date.now()}`}, 'android')`,
  );
}

async function setZeroPriceRule(enabled: boolean): Promise<void> {
  const value = enabled ? "on" : "off";
  await app.db
    .insert(schema.systemSettings)
    .values({
      settingKey: PRICING_SETTINGS_KEYS.zeroPrice,
      settingValue: value,
    })
    .onDuplicateKeyUpdate({ set: { settingValue: value } });
}

// ─── changePlanAfterCurrent ──────────────────────────────────────────────────

describe("changePlanAfterCurrent", () => {
  it("(1) vínculo heredado 10% + AURA 10% (empate): gana la invitación, un solo descuento (90000) y los puntos AURA NO se gastan", async () => {
    const payer = await payerWithPaidSub();
    await giveQualifiedLink(payer.id);
    await seedAuraBalance(app, payer.id, 1000);

    const res = await changeAfterCurrent(payer, await monthPlan(true), {
      auraSpend: 1000,
    });
    expect(res.statusCode).toBe(201);
    const row = await readSub(res.body.id as number);
    expect(row.status).toBe("scheduled");
    // Antes de 194-16 componían: 100000 - 10000 (AURA) - 9000 (referido) = 81000.
    expect(row.pricePaid).toBe(90000);
    expect(row.auraDiscount).toBeNull();
    expect(row.auraDiscountPercent).toBeNull();
    expect(row.referralDiscountPercent).toBe(10);
    expect(row.referralDiscountAmount).toBe(10000);
    expect(row.partnerDiscountAmount).toBeNull();
    expect(await auraBalanceOf(payer.id)).toBe(1000);
    expect(await creditOf(payer.id)).toEqual({ percent: 10, amount: 10000 });
  });

  it("(2) AURA 20% (20000) gana a la invitación 10% (10000): precio 80000, sin descuento de invitación, puntos gastados", async () => {
    const payer = await payerWithPaidSub();
    await giveQualifiedLink(payer.id);
    await seedAuraBalance(app, payer.id, 2000);

    const res = await changeAfterCurrent(payer, await monthPlan(true), {
      auraSpend: 2000,
    });
    expect(res.statusCode).toBe(201);
    const row = await readSub(res.body.id as number);
    expect(row.pricePaid).toBe(80000);
    expect(row.auraDiscount).toBe(2000);
    expect(row.auraDiscountPercent).toBe(20);
    expect(row.referralDiscountPercent).toBeNull();
    expect(row.referralDiscountAmount).toBeNull();
    expect(await auraBalanceOf(payer.id)).toBe(0);
    expect(await creditOf(payer.id)).toBeUndefined();
  });

  it("(3) plan destino SIN flag (D-10b): la invitación no descuenta ni cualifica; AURA sola sí", async () => {
    const payer = await payerWithPaidSub();
    await giveQualifiedLink(payer.id);

    const sinFlag = await changeAfterCurrent(payer, await monthPlan(false));
    expect(sinFlag.statusCode).toBe(201);
    const rowPlain = await readSub(sinFlag.body.id as number);
    expect(rowPlain.pricePaid).toBe(BASE);
    expect(rowPlain.referralDiscountAmount).toBeNull();
    expect(await creditOf(payer.id)).toBeUndefined();
  });

  it("(3b) plan destino SIN flag + AURA 10%: solo AURA (90000)", async () => {
    const payer = await payerWithPaidSub();
    await giveQualifiedLink(payer.id);
    await seedAuraBalance(app, payer.id, 1000);

    const res = await changeAfterCurrent(payer, await monthPlan(false), {
      auraSpend: 1000,
    });
    expect(res.statusCode).toBe(201);
    const row = await readSub(res.body.id as number);
    expect(row.pricePaid).toBe(90000);
    expect(row.auraDiscount).toBe(1000);
    expect(row.referralDiscountAmount).toBeNull();
    expect(await auraBalanceOf(payer.id)).toBe(0);
  });

  it("(4) tope en dinero AR 5000 (D-10c): 95000, crédito con % nominal 10 y monto recortado 5000", async () => {
    await setInvitationSettings(app.db, ctx.tenant, {
      discountCapAmount: { AR: 5000 },
    });
    const payer = await payerWithPaidSub();
    await giveQualifiedLink(payer.id);

    const res = await changeAfterCurrent(payer, await monthPlan(true));
    expect(res.statusCode).toBe(201);
    const row = await readSub(res.body.id as number);
    expect(row.pricePaid).toBe(95000);
    expect(row.referralDiscountPercent).toBe(10);
    expect(row.referralDiscountAmount).toBe(5000);
    expect(await creditOf(payer.id)).toEqual({ percent: 10, amount: 5000 });
  });

  it("(4b) tope AR 5000 + AURA 10% (10000): el monto recortado pierde, gana AURA y se gastan los puntos", async () => {
    await setInvitationSettings(app.db, ctx.tenant, {
      discountCapAmount: { AR: 5000 },
    });
    const payer = await payerWithPaidSub();
    await giveQualifiedLink(payer.id);
    await seedAuraBalance(app, payer.id, 1000);

    const res = await changeAfterCurrent(payer, await monthPlan(true), {
      auraSpend: 1000,
    });
    expect(res.statusCode).toBe(201);
    const row = await readSub(res.body.id as number);
    expect(row.pricePaid).toBe(90000);
    expect(row.auraDiscount).toBe(1000);
    expect(row.referralDiscountAmount).toBeNull();
    expect(await auraBalanceOf(payer.id)).toBe(0);
  });

  it.each(["especial", "paquete"] as const)(
    "(5) plan destino %s aunque tenga el flag: piso duro, sin invitación (precio de lista)",
    async (category) => {
      const payer = await payerWithPaidSub();
      await giveQualifiedLink(payer.id);
      const target = await createMembershipPlan(ctx, { category });
      await app.db
        .update(schema.subscriptionPlans)
        .set({ allowsInvitationDiscount: true })
        .where(
          and(
            tenantWhere(schema.subscriptionPlans, ctx.tenant),
            eq(schema.subscriptionPlans.id, target.id),
          ),
        );

      const res = await changeAfterCurrent(payer, target.id);
      expect(res.statusCode).toBe(201);
      const row = await readSub(res.body.id as number);
      expect(row.pricePaid).toBe(10000); // lista del plan fixture, sin 10%
      expect(row.referralDiscountAmount).toBeNull();
      expect(await creditOf(payer.id)).toBeUndefined();
    },
  );

  it("(6) partner 20% gana a la invitación 10%: 80000, un solo descuento y el beneficio del partner queda aplicado", async () => {
    const payer = await payerWithPaidSub();
    await giveQualifiedLink(payer.id);
    await givePartner(payer.id, 20);

    const res = await changeAfterCurrent(payer, await monthPlan(true));
    expect(res.statusCode).toBe(201);
    const row = await readSub(res.body.id as number);
    // Antes componían: 100000 - 20000 (partner) - 8000 (referido) = 72000.
    expect(row.pricePaid).toBe(80000);
    expect(row.partnerDiscountPercent).toBe(20);
    expect(row.partnerDiscountAmount).toBe(20000);
    expect(row.referralDiscountAmount).toBeNull();
    const link = await partnerLinkOf(payer.id);
    expect(link.benefit_status).toBe("consumed");
    expect(link.applied_reason).toBe("aplicado");
  });

  it("(6b) partner 5% pierde contra la invitación 10%: 90000 y el beneficio del partner se consume igual (perdio_vs_aura)", async () => {
    const payer = await payerWithPaidSub();
    await giveQualifiedLink(payer.id);
    await givePartner(payer.id, 5);

    const res = await changeAfterCurrent(payer, await monthPlan(true));
    expect(res.statusCode).toBe(201);
    const row = await readSub(res.body.id as number);
    expect(row.pricePaid).toBe(90000);
    expect(row.partnerDiscountAmount).toBeNull();
    expect(row.referralDiscountAmount).toBe(10000);
    const link = await partnerLinkOf(payer.id);
    expect(link.benefit_status).toBe("consumed");
    expect(link.applied_reason).toBe("perdio_vs_aura");
  });

  it("(7) override con motivo (D-20): el precio ES el override (50000), ni invitación ni partner", async () => {
    const payer = await payerWithPaidSub();
    await giveQualifiedLink(payer.id);
    await givePartner(payer.id, 20);

    const res = await changeAfterCurrent(payer, await monthPlan(true), {
      priceOverrideAmount: 50000,
      priceOverrideReason: "Convenio 194-16",
    });
    expect(res.statusCode).toBe(201);
    const row = await readSub(res.body.id as number);
    expect(row.pricePaid).toBe(50000);
    expect(row.priceOverrideAmount).toBe(50000);
    expect(row.referralDiscountAmount).toBeNull();
    expect(row.partnerDiscountAmount).toBeNull();
    expect(await creditOf(payer.id)).toBeUndefined();
  });

  it("(8) boarding pass (D-26a): precio Zero 70000 y la invitación no se acumula", async () => {
    await setZeroPriceRule(true);
    try {
      const payer = await payerWithPaidSub();
      await giveQualifiedLink(payer.id);

      const res = await changeAfterCurrent(payer, await monthPlan(true), {
        boardingPass: true,
      });
      expect(res.statusCode).toBe(201);
      const row = await readSub(res.body.id as number);
      expect(row.boardingPassUsed).toBe(true);
      expect(row.pricePaid).toBe(PRICE_ZERO);
      expect(row.referralDiscountAmount).toBeNull();
      expect(await creditOf(payer.id)).toBeUndefined();
    } finally {
      await setZeroPriceRule(false);
    }
  });

  it.each([
    ["sin saldo y que GANA la comparación (20%)", 2000, 0],
    ["con un monto que no es un tier", 999, 5000],
  ])(
    "(8b) auraSpend %s: error 4xx con invitación en juego y no queda sub programada ni crédito",
    async (_label, auraSpend, balance) => {
      const payer = await payerWithPaidSub();
      await giveQualifiedLink(payer.id);
      if (balance > 0) await seedAuraBalance(app, payer.id, balance);

      const res = await changeAfterCurrent(payer, await monthPlan(true), {
        auraSpend,
      });
      expect(res.statusCode).toBeGreaterThanOrEqual(400);
      expect(res.statusCode).toBeLessThan(500);
      const scheduled = await app.db
        .select({ id: schema.subscriptions.id })
        .from(schema.subscriptions)
        .where(
          and(
            tenantWhere(schema.subscriptions, ctx.tenant),
            eq(schema.subscriptions.userId, payer.id),
            eq(schema.subscriptions.status, "scheduled"),
          ),
        );
      expect(scheduled).toHaveLength(0);
      expect(await creditOf(payer.id)).toBeUndefined();
      expect(await auraBalanceOf(payer.id)).toBe(balance);
    },
  );

  it("(9) sin descuento alguno: precio de lista y sin crédito", async () => {
    const payer = await payerWithPaidSub();
    const res = await changeAfterCurrent(payer, await monthPlan(true));
    expect(res.statusCode).toBe(201);
    const row = await readSub(res.body.id as number);
    expect(row.pricePaid).toBe(BASE);
    expect(row.referralDiscountPercent).toBeNull();
    expect(row.partnerDiscountPercent).toBeNull();
    expect(row.auraDiscount).toBeNull();
    expect(await creditOf(payer.id)).toBeUndefined();
  });

  it("(10) un vínculo `pending` heredado cualifica en este cobro y ya descuenta en él (D-10b: plan con flag)", async () => {
    const payer = await payerWithPaidSub();
    const referrer = await createInviterWithCode(ctx);
    await app.db.execute(
      sql`INSERT INTO referrals (tenant_id, referrer_id, referred_id, status, attribution_channel)
          VALUES (${ctx.tenant.tenantId}, ${referrer.id}, ${payer.id}, 'pending', 'assisted')`,
    );

    const res = await changeAfterCurrent(payer, await monthPlan(true));
    expect(res.statusCode).toBe(201);
    const row = await readSub(res.body.id as number);
    expect(row.pricePaid).toBe(90000);
    expect(row.referralDiscountAmount).toBe(10000);
    expect((await referralRowsOf(payer.id))[0].status).toBe("qualified");
  });

  it("(10b) el mismo vínculo `pending` con plan SIN flag NO cualifica", async () => {
    const payer = await payerWithPaidSub();
    const referrer = await createInviterWithCode(ctx);
    await app.db.execute(
      sql`INSERT INTO referrals (tenant_id, referrer_id, referred_id, status, attribution_channel)
          VALUES (${ctx.tenant.tenantId}, ${referrer.id}, ${payer.id}, 'pending', 'assisted')`,
    );

    const res = await changeAfterCurrent(payer, await monthPlan(false));
    expect(res.statusCode).toBe(201);
    const row = await readSub(res.body.id as number);
    expect(row.pricePaid).toBe(BASE);
    expect((await referralRowsOf(payer.id))[0].status).toBe("pending");
  });

  describe("vínculo de invitación que nace con el cobro diferido (D-05 / D-13)", () => {
    /** Invitado con invitación `active` cuyos accesos vencen dentro de 5 días. */
    async function inviteeWithPaidSubOutsideFlag(inviter: {
      id: number;
    }): Promise<Payer> {
      const payer = await payerWithPaidSub();
      const accessExpiresOn = addDays(todayInTz(TZ_AR), 5);
      await createInvitationRow(ctx, {
        inviterId: inviter.id,
        invitedUserId: payer.id,
        branchId: payer.branchId,
        channel: "assisted",
        accessExpiresOn,
        accessStartsOn: addDays(accessExpiresOn, -5),
        subscriptionId: null,
      });
      return payer;
    }

    it("invitación en ventana: el diferido a un plan con flag descuenta 90000, crea el vínculo qualified y avisa al invitador", async () => {
      const inviter = await createInviterWithCode(ctx);
      await giveDeviceToken(inviter.id);
      const payer = await inviteeWithPaidSubOutsideFlag(inviter);

      const res = await changeAfterCurrent(payer, await monthPlan(true));
      expect(res.statusCode).toBe(201);
      const row = await readSub(res.body.id as number);
      expect(row.pricePaid).toBe(90000);
      expect(row.referralDiscountPercent).toBe(10);
      expect(row.referralDiscountAmount).toBe(10000);

      const links = await referralRowsOf(payer.id);
      expect(links).toHaveLength(1);
      expect(links[0]).toMatchObject({
        referrerId: inviter.id,
        referredId: payer.id,
        status: "qualified",
        attributionChannel: "assisted",
      });
      expect(await creditOf(payer.id)).toEqual({ percent: 10, amount: 10000 });
      expect(await notificationKeysOf(inviter.id)).toEqual([
        "referral_link_activated",
      ]);
      expect(await notificationKeysOf(payer.id)).toHaveLength(0);
    });

    it("AURA 30% gana en este cobro: sin descuento de invitación PERO el vínculo nace igual (alimenta los cobros siguientes)", async () => {
      const inviter = await createInviterWithCode(ctx);
      const payer = await inviteeWithPaidSubOutsideFlag(inviter);
      await seedAuraBalance(app, payer.id, 5000);

      const res = await changeAfterCurrent(payer, await monthPlan(true), {
        auraSpend: 5000,
      });
      expect(res.statusCode).toBe(201);
      const row = await readSub(res.body.id as number);
      expect(row.pricePaid).toBe(70000);
      expect(row.referralDiscountAmount).toBeNull();
      const links = await referralRowsOf(payer.id);
      expect(links).toHaveLength(1);
      expect(links[0].status).toBe("qualified");
    });

    it("plan destino SIN flag: ni descuento ni vínculo", async () => {
      const inviter = await createInviterWithCode(ctx);
      const payer = await inviteeWithPaidSubOutsideFlag(inviter);

      const res = await changeAfterCurrent(payer, await monthPlan(false));
      expect(res.statusCode).toBe(201);
      const row = await readSub(res.body.id as number);
      expect(row.pricePaid).toBe(BASE);
      expect(await referralRowsOf(payer.id)).toHaveLength(0);
    });

    it("override con motivo: el precio es el override pero el vínculo nace igual", async () => {
      const inviter = await createInviterWithCode(ctx);
      const payer = await inviteeWithPaidSubOutsideFlag(inviter);

      const res = await changeAfterCurrent(payer, await monthPlan(true), {
        priceOverrideAmount: 50000,
        priceOverrideReason: "Convenio 194-16",
      });
      expect(res.statusCode).toBe(201);
      const row = await readSub(res.body.id as number);
      expect(row.pricePaid).toBe(50000);
      expect(row.referralDiscountAmount).toBeNull();
      expect(await referralRowsOf(payer.id)).toHaveLength(1);
    });

    it("cobro en $0 (override 0): no hay vínculo (T-194-53: solo con cobro pago)", async () => {
      const inviter = await createInviterWithCode(ctx);
      const payer = await inviteeWithPaidSubOutsideFlag(inviter);

      const res = await changeAfterCurrent(payer, await monthPlan(true), {
        priceOverrideAmount: 0,
        priceOverrideReason: "Regalo 194-16",
      });
      expect(res.statusCode).toBe(201);
      expect((await readSub(res.body.id as number)).pricePaid).toBe(0);
      expect(await referralRowsOf(payer.id)).toHaveLength(0);
    });
  });
});

// ─── changePlanNow (194-17) ──────────────────────────────────────────────────

/** Plan destino del cambio inmediato: 200000 (Zero 140000) con flag. */
const NOW_TARGET = 200000;
const NOW_TARGET_ZERO = 140000;
/** Crédito remanente de la sub vigente (arrancó hace 15 días de 30): 50000. */
const NOW_CREDIT = 50000;
/** Neto post-prorrateo = BASE de los descuentos del cambio inmediato. */
const NOW_NET = NOW_TARGET - NOW_CREDIT;

/**
 * Socio con la sub de un plan de 100000 arrancada hace 15 días: el prorrateo del
 * cambio inmediato devuelve 50000. Se asigna ANTES de crear vínculos/partner para
 * que el alta no lleve descuento ni vínculo (plan sin flag).
 */
async function payerWithHalfUsedSub(): Promise<Payer> {
  const member = await createMemberInPhysicalBranch(ctx, { status: "prueba" });
  const res = await assignPlan(app, adminToken, member.id, {
    planId: await monthPlan(false),
    branchId: member.branchId,
    startDate: addDays(todayInTz(TZ_AR), -15),
  });
  expect(res.statusCode).toBe(201);
  return { id: member.id, branchId: member.branchId };
}

async function nowTargetPlan(allowsInvitationDiscount = true): Promise<number> {
  return monthPlan(allowsInvitationDiscount, NOW_TARGET, NOW_TARGET_ZERO);
}

async function changeNow(
  payer: Payer,
  planId: number,
  extra: Record<string, unknown> = {},
): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  const res = await app.inject({
    method: "POST",
    url: `${SUBSCRIPTIONS_URL}/members/${payer.id}/subscription/change-plan`,
    headers: { authorization: `Bearer ${adminToken}` },
    payload: {
      planId,
      branchId: payer.branchId,
      startDate: todayInTz(TZ_AR),
      startMode: "now",
      priceTypeApplied: "regular",
      paymentMethod: "cash",
      ...extra,
    },
  });
  return { statusCode: res.statusCode, body: JSON.parse(res.body) };
}

describe("changePlanNow", () => {
  it("(1) solo invitación 10%: se descuenta sobre el NETO post-prorrateo (150000 -> 135000), con crédito y columnas", async () => {
    const payer = await payerWithHalfUsedSub();
    await giveQualifiedLink(payer.id);

    const res = await changeNow(payer, await nowTargetPlan());
    expect(res.statusCode).toBe(201);
    const row = await readSub(res.body.id as number);
    expect(row.status).toBe("active");
    expect(row.pricePaid).toBe(NOW_NET - 15000);
    expect(row.referralDiscountPercent).toBe(10);
    expect(row.referralDiscountAmount).toBe(15000);
    expect(row.partnerDiscountAmount).toBeNull();
    // price_override_amount conserva el neto PRE-descuento (como antes de la 194).
    expect(row.priceOverrideAmount).toBe(NOW_NET);
    expect(await creditOf(payer.id)).toEqual({ percent: 10, amount: 15000 });
  });

  it("(2) partner 20% (30000) gana a la invitación 10% (15000): 120000, un solo descuento y el beneficio queda aplicado", async () => {
    const payer = await payerWithHalfUsedSub();
    await giveQualifiedLink(payer.id);
    await givePartner(payer.id, 20);

    const res = await changeNow(payer, await nowTargetPlan());
    expect(res.statusCode).toBe(201);
    const row = await readSub(res.body.id as number);
    // Antes de 194-17 componían: 150000 - 30000 - 12000 = 108000.
    expect(row.pricePaid).toBe(120000);
    expect(row.partnerDiscountPercent).toBe(20);
    expect(row.partnerDiscountAmount).toBe(30000);
    expect(row.referralDiscountPercent).toBeNull();
    expect(row.referralDiscountAmount).toBeNull();
    expect(await creditOf(payer.id)).toBeUndefined();
    const link = await partnerLinkOf(payer.id);
    expect(link.benefit_status).toBe("consumed");
    expect(link.applied_reason).toBe("aplicado");
  });

  it("(3) partner 5% (7500) pierde contra la invitación 10% (15000): 135000 y el beneficio del partner se consume igual (perdio_vs_aura)", async () => {
    const payer = await payerWithHalfUsedSub();
    await giveQualifiedLink(payer.id);
    await givePartner(payer.id, 5);

    const res = await changeNow(payer, await nowTargetPlan());
    expect(res.statusCode).toBe(201);
    const row = await readSub(res.body.id as number);
    expect(row.pricePaid).toBe(135000);
    expect(row.partnerDiscountPercent).toBeNull();
    expect(row.partnerDiscountAmount).toBeNull();
    expect(row.referralDiscountAmount).toBe(15000);
    const link = await partnerLinkOf(payer.id);
    expect(link.benefit_status).toBe("consumed");
    expect(link.applied_reason).toBe("perdio_vs_aura");
  });

  it("(4) tope en dinero AR 5000 (D-10c): 145000, crédito con % nominal 10 y monto recortado 5000", async () => {
    await setInvitationSettings(app.db, ctx.tenant, {
      discountCapAmount: { AR: 5000 },
    });
    const payer = await payerWithHalfUsedSub();
    await giveQualifiedLink(payer.id);

    const res = await changeNow(payer, await nowTargetPlan());
    expect(res.statusCode).toBe(201);
    const row = await readSub(res.body.id as number);
    expect(row.pricePaid).toBe(145000);
    expect(row.referralDiscountPercent).toBe(10);
    expect(row.referralDiscountAmount).toBe(5000);
    expect(await creditOf(payer.id)).toEqual({ percent: 10, amount: 5000 });
  });

  it("(4b) tope AR 5000 + partner 5% (7500): compiten por MONTO recortado, gana el partner (142500)", async () => {
    await setInvitationSettings(app.db, ctx.tenant, {
      discountCapAmount: { AR: 5000 },
    });
    const payer = await payerWithHalfUsedSub();
    await giveQualifiedLink(payer.id);
    await givePartner(payer.id, 5);

    const res = await changeNow(payer, await nowTargetPlan());
    expect(res.statusCode).toBe(201);
    const row = await readSub(res.body.id as number);
    expect(row.pricePaid).toBe(142500);
    expect(row.partnerDiscountAmount).toBe(7500);
    expect(row.referralDiscountAmount).toBeNull();
  });

  it("(5) plan destino SIN flag (D-10b): precio neto sin descuento, sin crédito", async () => {
    const payer = await payerWithHalfUsedSub();
    await giveQualifiedLink(payer.id);

    const res = await changeNow(payer, await nowTargetPlan(false));
    expect(res.statusCode).toBe(201);
    const row = await readSub(res.body.id as number);
    expect(row.pricePaid).toBe(NOW_NET);
    expect(row.referralDiscountAmount).toBeNull();
    expect(await creditOf(payer.id)).toBeUndefined();
  });

  it("(5b) plan destino SIN flag + partner 20%: el partner SÍ descuenta (el flag es solo de la invitación): 120000", async () => {
    const payer = await payerWithHalfUsedSub();
    await givePartner(payer.id, 20);

    const res = await changeNow(payer, await nowTargetPlan(false));
    expect(res.statusCode).toBe(201);
    const row = await readSub(res.body.id as number);
    expect(row.pricePaid).toBe(120000);
    expect(row.partnerDiscountAmount).toBe(30000);
  });

  it("(6) override con motivo (D-20, 'mantener vencimiento'): el precio ES el override (120000, sin netear el crédito), ni invitación ni partner", async () => {
    const payer = await payerWithHalfUsedSub();
    await giveQualifiedLink(payer.id);
    await givePartner(payer.id, 20);

    const res = await changeNow(payer, await nowTargetPlan(), {
      priceOverrideAmount: 120000,
      priceOverrideReason: "Diferencia mantener vencimiento 194-17",
    });
    expect(res.statusCode).toBe(201);
    const row = await readSub(res.body.id as number);
    expect(row.pricePaid).toBe(120000);
    expect(row.priceOverrideAmount).toBe(120000);
    expect(row.referralDiscountAmount).toBeNull();
    expect(row.partnerDiscountAmount).toBeNull();
    expect(await creditOf(payer.id)).toBeUndefined();
    // El partner ni siquiera compitió: su beneficio sigue pendiente.
    expect((await partnerLinkOf(payer.id)).benefit_status).toBe("pending");
  });

  it("(7) boarding pass (D-26a): precio Zero 140000 menos el crédito = 90000 y la invitación no se acumula", async () => {
    await setZeroPriceRule(true);
    try {
      const payer = await payerWithHalfUsedSub();
      await giveQualifiedLink(payer.id);

      const res = await changeNow(payer, await nowTargetPlan(), {
        boardingPass: true,
      });
      expect(res.statusCode).toBe(201);
      const row = await readSub(res.body.id as number);
      expect(row.boardingPassUsed).toBe(true);
      expect(row.pricePaid).toBe(NOW_TARGET_ZERO - NOW_CREDIT);
      expect(row.referralDiscountAmount).toBeNull();
      expect(await creditOf(payer.id)).toBeUndefined();
    } finally {
      await setZeroPriceRule(false);
    }
  });

  it("(8) AURA NO aplica en el cambio inmediato: con auraSpend e invitación gana la invitación (135000) y los puntos no se gastan", async () => {
    const payer = await payerWithHalfUsedSub();
    await giveQualifiedLink(payer.id);
    await seedAuraBalance(app, payer.id, 5000);

    const res = await changeNow(payer, await nowTargetPlan(), {
      auraSpend: 5000,
    });
    expect(res.statusCode).toBe(201);
    const row = await readSub(res.body.id as number);
    expect(row.pricePaid).toBe(135000);
    expect(row.auraDiscount).toBeNull();
    expect(row.auraDiscountPercent).toBeNull();
    expect(row.referralDiscountAmount).toBe(15000);
    expect(await auraBalanceOf(payer.id)).toBe(5000);
  });

  it("(9) sin descuento alguno: neto post-prorrateo y sin crédito", async () => {
    const payer = await payerWithHalfUsedSub();
    const res = await changeNow(payer, await nowTargetPlan());
    expect(res.statusCode).toBe(201);
    const row = await readSub(res.body.id as number);
    expect(row.pricePaid).toBe(NOW_NET);
    expect(row.referralDiscountPercent).toBeNull();
    expect(row.partnerDiscountPercent).toBeNull();
    expect(await creditOf(payer.id)).toBeUndefined();
  });

  it("(10) un vínculo `pending` heredado cualifica en este cobro y ya descuenta en él (D-10b: plan con flag)", async () => {
    const payer = await payerWithHalfUsedSub();
    const referrer = await createInviterWithCode(ctx);
    await app.db.execute(
      sql`INSERT INTO referrals (tenant_id, referrer_id, referred_id, status, attribution_channel)
          VALUES (${ctx.tenant.tenantId}, ${referrer.id}, ${payer.id}, 'pending', 'assisted')`,
    );

    const res = await changeNow(payer, await nowTargetPlan());
    expect(res.statusCode).toBe(201);
    const row = await readSub(res.body.id as number);
    expect(row.pricePaid).toBe(135000);
    expect(row.referralDiscountAmount).toBe(15000);
    expect((await referralRowsOf(payer.id))[0].status).toBe("qualified");
  });

  it("(10b) el mismo vínculo `pending` con plan SIN flag NO cualifica", async () => {
    const payer = await payerWithHalfUsedSub();
    const referrer = await createInviterWithCode(ctx);
    await app.db.execute(
      sql`INSERT INTO referrals (tenant_id, referrer_id, referred_id, status, attribution_channel)
          VALUES (${ctx.tenant.tenantId}, ${referrer.id}, ${payer.id}, 'pending', 'assisted')`,
    );

    const res = await changeNow(payer, await nowTargetPlan(false));
    expect(res.statusCode).toBe(201);
    expect((await readSub(res.body.id as number)).pricePaid).toBe(NOW_NET);
    expect((await referralRowsOf(payer.id))[0].status).toBe("pending");
  });

  it("(11) neto en 0 (el crédito cubre el plan destino): cobra 0, sin descuento, sin crédito y el vínculo `pending` no cualifica", async () => {
    // Mismo precio y sub recién arrancada: el remanente es todo el plan.
    const member = await createMemberInPhysicalBranch(ctx, {
      status: "prueba",
    });
    const payer = { id: member.id, branchId: member.branchId };
    const assigned = await assignPlan(app, adminToken, member.id, {
      planId: await monthPlan(false),
      branchId: member.branchId,
      startDate: todayInTz(TZ_AR),
    });
    expect(assigned.statusCode).toBe(201);
    const referrer = await createInviterWithCode(ctx);
    await app.db.execute(
      sql`INSERT INTO referrals (tenant_id, referrer_id, referred_id, status, attribution_channel)
          VALUES (${ctx.tenant.tenantId}, ${referrer.id}, ${payer.id}, 'pending', 'assisted')`,
    );

    const res = await changeNow(payer, await monthPlan(true));
    expect(res.statusCode).toBe(201);
    const row = await readSub(res.body.id as number);
    expect(row.pricePaid).toBe(0);
    expect(row.referralDiscountAmount).toBeNull();
    expect(await creditOf(payer.id)).toBeUndefined();
    expect((await referralRowsOf(payer.id))[0].status).toBe("pending");
  });

  it("(12) la sub vigente pasa a `changed` y el cambio inmediato deja UNA sub activa", async () => {
    const payer = await payerWithHalfUsedSub();
    await giveQualifiedLink(payer.id);
    const res = await changeNow(payer, await nowTargetPlan());
    expect(res.statusCode).toBe(201);
    const subs = await app.db
      .select({ status: schema.subscriptions.status })
      .from(schema.subscriptions)
      .where(
        and(
          tenantWhere(schema.subscriptions, ctx.tenant),
          eq(schema.subscriptions.userId, payer.id),
        ),
      );
    expect(subs.map((s) => s.status).sort()).toEqual(["active", "changed"]);
  });

  describe("vínculo de invitación que nace con el cambio inmediato (D-05 / D-13)", () => {
    /** Invitado con invitación `active` cuyos accesos vencen dentro de 5 días. */
    async function inviteeWithHalfUsedSub(inviter: {
      id: number;
    }): Promise<Payer> {
      const payer = await payerWithHalfUsedSub();
      const accessExpiresOn = addDays(todayInTz(TZ_AR), 5);
      await createInvitationRow(ctx, {
        inviterId: inviter.id,
        invitedUserId: payer.id,
        branchId: payer.branchId,
        channel: "assisted",
        accessExpiresOn,
        accessStartsOn: addDays(accessExpiresOn, -5),
        subscriptionId: null,
      });
      return payer;
    }

    it("invitación en ventana: descuenta 135000, crea el vínculo qualified y avisa al invitador", async () => {
      const inviter = await createInviterWithCode(ctx);
      await giveDeviceToken(inviter.id);
      const payer = await inviteeWithHalfUsedSub(inviter);

      const res = await changeNow(payer, await nowTargetPlan());
      expect(res.statusCode).toBe(201);
      const row = await readSub(res.body.id as number);
      expect(row.pricePaid).toBe(135000);
      expect(row.referralDiscountAmount).toBe(15000);
      const links = await referralRowsOf(payer.id);
      expect(links).toHaveLength(1);
      expect(links[0]).toMatchObject({
        referrerId: inviter.id,
        status: "qualified",
        attributionChannel: "assisted",
      });
      expect(await creditOf(payer.id)).toEqual({ percent: 10, amount: 15000 });
      expect(await notificationKeysOf(inviter.id)).toEqual([
        "referral_link_activated",
      ]);
    });

    it("override con motivo: el precio es el override pero el vínculo nace igual", async () => {
      const inviter = await createInviterWithCode(ctx);
      const payer = await inviteeWithHalfUsedSub(inviter);

      const res = await changeNow(payer, await nowTargetPlan(), {
        priceOverrideAmount: 120000,
        priceOverrideReason: "Convenio 194-17",
      });
      expect(res.statusCode).toBe(201);
      const row = await readSub(res.body.id as number);
      expect(row.pricePaid).toBe(120000);
      expect(row.referralDiscountAmount).toBeNull();
      expect(await referralRowsOf(payer.id)).toHaveLength(1);
    });

    it("plan destino SIN flag: ni descuento ni vínculo", async () => {
      const inviter = await createInviterWithCode(ctx);
      const payer = await inviteeWithHalfUsedSub(inviter);

      const res = await changeNow(payer, await nowTargetPlan(false));
      expect(res.statusCode).toBe(201);
      expect((await readSub(res.body.id as number)).pricePaid).toBe(NOW_NET);
      expect(await referralRowsOf(payer.id)).toHaveLength(0);
    });
  });
});

// ─── renewSubscription (194-18) ──────────────────────────────────────────────

interface RenewablePayer extends Payer {
  planId: number;
  subscriptionId: number;
}

/**
 * Socio con una membresía paga ACTIVA del plan de 100000 (con o sin flag D-10b): la
 * renovación hereda el plan. Se asigna ANTES de crear vínculos/partner para que el alta
 * no lleve descuento.
 */
async function payerWithRenewableSub(
  allowsInvitationDiscount = true,
): Promise<RenewablePayer> {
  const member = await createMemberInPhysicalBranch(ctx, { status: "prueba" });
  const planId = await monthPlan(allowsInvitationDiscount);
  const res = await assignPlan(app, adminToken, member.id, {
    planId,
    branchId: member.branchId,
    startDate: todayInTz(TZ_AR),
  });
  expect(res.statusCode).toBe(201);
  return {
    id: member.id,
    branchId: member.branchId,
    planId,
    subscriptionId: res.body.id as number,
  };
}

async function renew(
  payer: Payer,
  extra: Record<string, unknown> = {},
): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  const res = await app.inject({
    method: "POST",
    url: `${SUBSCRIPTIONS_URL}/members/${payer.id}/subscription/renew`,
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { paymentMethod: "cash", ...extra },
  });
  return { statusCode: res.statusCode, body: JSON.parse(res.body) };
}

/** Monto del cobro (`financial_transactions`) ligado a una sub: el que exporta SEPA. */
async function chargeAmountOf(subscriptionId: number): Promise<number> {
  const rows = await app.db
    .select({ amount: schema.financialTransactions.amount })
    .from(schema.financialTransactions)
    .innerJoin(
      schema.transactionLinks,
      and(
        tenantWhere(schema.transactionLinks, ctx.tenant),
        eq(
          schema.transactionLinks.transactionId,
          schema.financialTransactions.id,
        ),
      ),
    )
    .where(
      and(
        tenantWhere(schema.financialTransactions, ctx.tenant),
        eq(schema.transactionLinks.targetId, subscriptionId),
      ),
    );
  expect(rows).toHaveLength(1);
  return rows[0].amount;
}

describe("renewSubscription", () => {
  it("(1) solo invitación 10% (vínculo heredado): 100000 -> 90000 con columnas y crédito; el monto cobrado es el neto", async () => {
    const payer = await payerWithRenewableSub();
    await giveQualifiedLink(payer.id);

    const res = await renew(payer);
    expect(res.statusCode).toBe(201);
    const row = await readSub(res.body.id as number);
    expect(row.status).toBe("scheduled");
    expect(row.pricePaid).toBe(90000);
    expect(row.referralDiscountPercent).toBe(10);
    expect(row.referralDiscountAmount).toBe(10000);
    expect(row.partnerDiscountAmount).toBeNull();
    expect(row.auraDiscount).toBeNull();
    expect(await creditOf(payer.id)).toEqual({ percent: 10, amount: 10000 });
    // El monto que registra el cobro (y que exporta la domiciliación SEPA) es el neto.
    expect(await chargeAmountOf(res.body.id as number)).toBe(90000);
  });

  it("(2) partner 20% (20000) gana a la invitación 10% (10000): 80000, un solo descuento y el beneficio queda aplicado", async () => {
    const payer = await payerWithRenewableSub();
    await giveQualifiedLink(payer.id);
    await givePartner(payer.id, 20);

    const res = await renew(payer);
    expect(res.statusCode).toBe(201);
    const row = await readSub(res.body.id as number);
    // Antes de 194-18 componían: 100000 - 20000 - 8000 = 72000.
    expect(row.pricePaid).toBe(80000);
    expect(row.partnerDiscountPercent).toBe(20);
    expect(row.partnerDiscountAmount).toBe(20000);
    expect(row.referralDiscountPercent).toBeNull();
    expect(row.referralDiscountAmount).toBeNull();
    expect(await creditOf(payer.id)).toBeUndefined();
    const link = await partnerLinkOf(payer.id);
    expect(link.benefit_status).toBe("consumed");
    expect(link.applied_reason).toBe("aplicado");
  });

  it("(3) partner 5% (5000) pierde contra la invitación 10% (10000): 90000 y el beneficio se consume como perdio_vs_aura", async () => {
    const payer = await payerWithRenewableSub();
    await giveQualifiedLink(payer.id);
    await givePartner(payer.id, 5);

    const res = await renew(payer);
    expect(res.statusCode).toBe(201);
    const row = await readSub(res.body.id as number);
    expect(row.pricePaid).toBe(90000);
    expect(row.referralDiscountAmount).toBe(10000);
    expect(row.partnerDiscountAmount).toBeNull();
    expect(row.partnerDiscountPercent).toBeNull();
    const link = await partnerLinkOf(payer.id);
    expect(link.benefit_status).toBe("consumed");
    expect(link.applied_reason).toBe("perdio_vs_aura");
  });

  it("(4) tope en dinero AR 5000 (D-10c): 95000, crédito con % nominal 10 y monto recortado 5000", async () => {
    await setInvitationSettings(app.db, ctx.tenant, {
      discountCapAmount: { AR: 5000 },
    });
    const payer = await payerWithRenewableSub();
    await giveQualifiedLink(payer.id);

    const res = await renew(payer);
    expect(res.statusCode).toBe(201);
    const row = await readSub(res.body.id as number);
    expect(row.pricePaid).toBe(95000);
    expect(row.referralDiscountPercent).toBe(10);
    expect(row.referralDiscountAmount).toBe(5000);
    expect(await creditOf(payer.id)).toEqual({ percent: 10, amount: 5000 });
  });

  it("(4b) tope AR 5000 + partner 7% (7000): el monto recortado pierde, gana el partner (93000)", async () => {
    await setInvitationSettings(app.db, ctx.tenant, {
      discountCapAmount: { AR: 5000 },
    });
    const payer = await payerWithRenewableSub();
    await giveQualifiedLink(payer.id);
    await givePartner(payer.id, 7);

    const res = await renew(payer);
    expect(res.statusCode).toBe(201);
    const row = await readSub(res.body.id as number);
    expect(row.pricePaid).toBe(93000);
    expect(row.partnerDiscountAmount).toBe(7000);
    expect(row.referralDiscountAmount).toBeNull();
  });

  it("(5) plan SIN flag (D-10b): la invitación no descuenta ni cualifica; el partner SÍ descuenta (el flag es solo de la invitación)", async () => {
    const payer = await payerWithRenewableSub(false);
    await giveQualifiedLink(payer.id);
    const sinPartner = await renew(payer);
    expect(sinPartner.statusCode).toBe(201);
    const rowPlain = await readSub(sinPartner.body.id as number);
    expect(rowPlain.pricePaid).toBe(BASE);
    expect(rowPlain.referralDiscountAmount).toBeNull();
    expect(await creditOf(payer.id)).toBeUndefined();

    const other = await payerWithRenewableSub(false);
    await givePartner(other.id, 20);
    const conPartner = await renew(other);
    expect(conPartner.statusCode).toBe(201);
    const rowPartner = await readSub(conPartner.body.id as number);
    expect(rowPartner.pricePaid).toBe(80000);
    expect(rowPartner.partnerDiscountAmount).toBe(20000);
  });

  it("(5b) plan SIN flag + vínculo `pending` heredado: la renovación NO lo cualifica (antes cualificaba sin gate)", async () => {
    const payer = await payerWithRenewableSub(false);
    const referrer = await createInviterWithCode(ctx);
    await app.db.execute(
      sql`INSERT INTO referrals (tenant_id, referrer_id, referred_id, status, attribution_channel)
          VALUES (${ctx.tenant.tenantId}, ${referrer.id}, ${payer.id}, 'pending', 'assisted')`,
    );

    const res = await renew(payer);
    expect(res.statusCode).toBe(201);
    expect((await readSub(res.body.id as number)).pricePaid).toBe(BASE);
    const [link] = await referralRowsOf(payer.id);
    expect(link.status).toBe("pending");
  });

  it("(5c) plan CON flag + vínculo `pending` heredado: la renovación lo cualifica y descuenta 10% en el mismo cobro", async () => {
    const payer = await payerWithRenewableSub(true);
    const referrer = await createInviterWithCode(ctx);
    await app.db.execute(
      sql`INSERT INTO referrals (tenant_id, referrer_id, referred_id, status, attribution_channel)
          VALUES (${ctx.tenant.tenantId}, ${referrer.id}, ${payer.id}, 'pending', 'assisted')`,
    );

    const res = await renew(payer);
    expect(res.statusCode).toBe(201);
    expect((await readSub(res.body.id as number)).pricePaid).toBe(90000);
    const [link] = await referralRowsOf(payer.id);
    expect(link.status).toBe("qualified");
  });

  it("(6) override con motivo (D-20): el precio es el override, ni la invitación ni el partner descuentan encima y el beneficio de partner no se consume", async () => {
    const payer = await payerWithRenewableSub();
    await giveQualifiedLink(payer.id);
    await givePartner(payer.id, 20);

    const res = await renew(payer, {
      priceOverrideAmount: 60000,
      priceOverrideReason: "Convenio 194-18",
    });
    expect(res.statusCode).toBe(201);
    const row = await readSub(res.body.id as number);
    // Antes de 194-18 el partner y el referido descontaban ENCIMA del override.
    expect(row.pricePaid).toBe(60000);
    expect(row.priceOverrideAmount).toBe(60000);
    expect(row.referralDiscountAmount).toBeNull();
    expect(row.partnerDiscountAmount).toBeNull();
    expect(await creditOf(payer.id)).toBeUndefined();
    expect((await partnerLinkOf(payer.id)).benefit_status).toBe("pending");
  });

  it("(6b) override sin motivo sigue siendo 400 y no deja sub ni crédito", async () => {
    const payer = await payerWithRenewableSub();
    await giveQualifiedLink(payer.id);

    const res = await renew(payer, { priceOverrideAmount: 60000 });
    expect(res.statusCode).toBe(400);
    expect(await creditOf(payer.id)).toBeUndefined();
  });

  it("(7) prorrateo a fin de mes: el proporcional es el precio final, sin descuento; partner e invitación quedan intactos", async () => {
    const payer = await payerWithRenewableSub();
    await giveQualifiedLink(payer.id);
    await givePartner(payer.id, 20);

    const res = await renew(payer, { prorateToMonthEnd: true });
    expect(res.statusCode).toBe(201);
    const row = await readSub(res.body.id as number);
    expect(row.pricePaid).toBe(
      computeProratedPrice(BASE, res.body.startDate as string),
    );
    expect(row.referralDiscountAmount).toBeNull();
    expect(row.partnerDiscountAmount).toBeNull();
    expect((await partnerLinkOf(payer.id)).benefit_status).toBe("pending");
  });

  it("(8) D-08/D-22: una sub histórica compuesta (AURA 10% + referido, 81000) NO se toca; su renovación parte de 100000 y aplica UNA sola promo", async () => {
    const payer = await payerWithRenewableSub();
    // Sub histórica con la composición vieja: 100000 - 10% AURA (10000) - 9000 de referido.
    await app.db.execute(
      sql`UPDATE subscriptions
          SET price_paid = 81000, aura_discount_percent = 10, aura_discount = 1000,
              referral_discount_percent = 10, referral_discount_amount = 9000
          WHERE id = ${payer.subscriptionId} AND tenant_id = ${ctx.tenant.tenantId}`,
    );

    const sinVinculo = await renew(payer);
    expect(sinVinculo.statusCode).toBe(201);
    expect((await readSub(sinVinculo.body.id as number)).pricePaid).toBe(BASE);
    // La sub vieja queda exactamente como estaba (D-08: sin retroactividad).
    expect(await readSub(payer.subscriptionId)).toMatchObject({
      pricePaid: 81000,
      auraDiscountPercent: 10,
      auraDiscount: 1000,
      referralDiscountPercent: 10,
      referralDiscountAmount: 9000,
    });
  });

  it("(8b) esa misma sub histórica con vínculo vigente: la renovación lleva SOLO la invitación (90000), no AURA + referido", async () => {
    const payer = await payerWithRenewableSub();
    await app.db.execute(
      sql`UPDATE subscriptions
          SET price_paid = 81000, aura_discount_percent = 10, aura_discount = 1000,
              referral_discount_percent = 10, referral_discount_amount = 9000
          WHERE id = ${payer.subscriptionId} AND tenant_id = ${ctx.tenant.tenantId}`,
    );
    await giveQualifiedLink(payer.id);

    const res = await renew(payer);
    expect(res.statusCode).toBe(201);
    const row = await readSub(res.body.id as number);
    expect(row.pricePaid).toBe(90000);
    expect(row.referralDiscountAmount).toBe(10000);
    expect(row.auraDiscount).toBeNull();
    expect(row.auraDiscountPercent).toBeNull();
  });

  it("(8c) base negociada (caso Pomilio): la renovación hereda los 75000 (no la lista) y la invitación descuenta 10% sobre ESA base", async () => {
    const payer = await payerWithRenewableSub();
    await app.db.execute(
      sql`UPDATE subscriptions SET price_paid = 75000
          WHERE id = ${payer.subscriptionId} AND tenant_id = ${ctx.tenant.tenantId}`,
    );
    await giveQualifiedLink(payer.id);

    const res = await renew(payer);
    expect(res.statusCode).toBe(201);
    const row = await readSub(res.body.id as number);
    expect(row.pricePaid).toBe(67500);
    expect(row.referralDiscountPercent).toBe(10);
    expect(row.referralDiscountAmount).toBe(7500);
    expect(await creditOf(payer.id)).toEqual({ percent: 10, amount: 7500 });
  });

  it("(9) amountReceived = neto con descuento: cobro completo sin saldo; uno más es 400", async () => {
    const payer = await payerWithRenewableSub();
    await giveQualifiedLink(payer.id);

    const tooMuch = await renew(payer, { amountReceived: 90001 });
    expect(tooMuch.statusCode).toBe(400);

    const exact = await renew(payer, { amountReceived: 90000 });
    expect(exact.statusCode).toBe(201);
    expect(await chargeAmountOf(exact.body.id as number)).toBe(90000);
  });

  it("(10) si el cobro falla (amountReceived de más) no queda sub nueva ni crédito", async () => {
    const payer = await payerWithRenewableSub();
    await giveQualifiedLink(payer.id);

    const res = await renew(payer, { amountReceived: 999999 });
    expect(res.statusCode).toBe(400);
    const subs = await app.db
      .select({ id: schema.subscriptions.id })
      .from(schema.subscriptions)
      .where(
        and(
          tenantWhere(schema.subscriptions, ctx.tenant),
          eq(schema.subscriptions.userId, payer.id),
        ),
      );
    expect(subs).toHaveLength(1);
    expect(await creditOf(payer.id)).toBeUndefined();
  });

  it("(11) sin ningún descuento: renueva a la base heredada (100000), sin columnas ni crédito", async () => {
    const payer = await payerWithRenewableSub();
    const res = await renew(payer);
    expect(res.statusCode).toBe(201);
    const row = await readSub(res.body.id as number);
    expect(row.pricePaid).toBe(BASE);
    expect(row.referralDiscountAmount).toBeNull();
    expect(row.partnerDiscountAmount).toBeNull();
    expect(await creditOf(payer.id)).toBeUndefined();
  });

  describe("vínculo de invitación que nace con la renovación (D-05 / D-13)", () => {
    /** Invitado con una sub paga activa (plan con flag) e invitación `active` en ventana. */
    async function inviteeWithRenewableSub(inviter: {
      id: number;
    }): Promise<RenewablePayer> {
      const payer = await payerWithRenewableSub(true);
      const accessExpiresOn = addDays(todayInTz(TZ_AR), 5);
      await createInvitationRow(ctx, {
        inviterId: inviter.id,
        invitedUserId: payer.id,
        branchId: payer.branchId,
        channel: "assisted",
        accessExpiresOn,
        accessStartsOn: addDays(accessExpiresOn, -5),
        subscriptionId: null,
      });
      return payer;
    }

    it("invitación en ventana: descuenta 90000, crea el vínculo qualified y avisa al invitador", async () => {
      const inviter = await createInviterWithCode(ctx);
      await giveDeviceToken(inviter.id);
      const payer = await inviteeWithRenewableSub(inviter);

      const res = await renew(payer);
      expect(res.statusCode).toBe(201);
      const row = await readSub(res.body.id as number);
      expect(row.pricePaid).toBe(90000);
      expect(row.referralDiscountAmount).toBe(10000);
      const links = await referralRowsOf(payer.id);
      expect(links).toHaveLength(1);
      expect(links[0]).toMatchObject({
        referrerId: inviter.id,
        status: "qualified",
        attributionChannel: "assisted",
      });
      expect(await creditOf(payer.id)).toEqual({ percent: 10, amount: 10000 });
      expect(await notificationKeysOf(inviter.id)).toEqual([
        "referral_link_activated",
      ]);
    });

    it("override con motivo: el precio es el override pero el vínculo nace igual", async () => {
      const inviter = await createInviterWithCode(ctx);
      const payer = await inviteeWithRenewableSub(inviter);

      const res = await renew(payer, {
        priceOverrideAmount: 70000,
        priceOverrideReason: "Convenio 194-18",
      });
      expect(res.statusCode).toBe(201);
      const row = await readSub(res.body.id as number);
      expect(row.pricePaid).toBe(70000);
      expect(row.referralDiscountAmount).toBeNull();
      expect(await referralRowsOf(payer.id)).toHaveLength(1);
    });

    it("prorrateo a fin de mes: ni descuento ni vínculo (nace en la primera renovación de mes completo)", async () => {
      const inviter = await createInviterWithCode(ctx);
      const payer = await inviteeWithRenewableSub(inviter);

      const res = await renew(payer, { prorateToMonthEnd: true });
      expect(res.statusCode).toBe(201);
      expect(
        (await readSub(res.body.id as number)).referralDiscountAmount,
      ).toBeNull();
      expect(await referralRowsOf(payer.id)).toHaveLength(0);
    });
  });
});

// ─── settlementColumns (pura): lo que persisten las charge-paths ─────────────

describe("settlementColumns", () => {
  const none: ChargeSettlement = {
    finalPrice: 100000,
    winningDiscount: "none",
    invitationAmount: 0,
    invitationPercent: 0,
    invitationCapped: false,
    partnerWon: false,
    partnerAmount: 0,
    linkToMaterialize: null,
  };

  it("sin descuento: todo null", () => {
    expect(settlementColumns(none, 20)).toEqual({
      referralDiscountPercent: null,
      referralDiscountAmount: null,
      partnerDiscountPercent: null,
      partnerDiscountAmount: null,
    });
  });

  it("invitación ganadora (con tope): % NOMINAL y monto recortado; el partner queda null aunque haya candidato", () => {
    expect(
      settlementColumns(
        {
          ...none,
          finalPrice: 95000,
          winningDiscount: "invitation",
          invitationAmount: 5000,
          invitationPercent: 10,
          invitationCapped: true,
        },
        20,
      ),
    ).toEqual({
      referralDiscountPercent: 10,
      referralDiscountAmount: 5000,
      partnerDiscountPercent: null,
      partnerDiscountAmount: null,
    });
  });

  it("partner ganador: % del candidato y monto; la invitación queda null", () => {
    expect(
      settlementColumns(
        {
          ...none,
          finalPrice: 80000,
          winningDiscount: "partner",
          partnerWon: true,
          partnerAmount: 20000,
        },
        20,
      ),
    ).toEqual({
      referralDiscountPercent: null,
      referralDiscountAmount: null,
      partnerDiscountPercent: 20,
      partnerDiscountAmount: 20000,
    });
  });

  it("partner ganador sin % de candidato (caso imposible): null, no NaN", () => {
    expect(
      settlementColumns({ ...none, partnerWon: true, partnerAmount: 1 }, null)
        .partnerDiscountPercent,
    ).toBeNull();
  });
});
