/**
 * Fase 194 — el ÁRBITRO de descuentos en las charge-paths que NO son el alta
 * (194-16 changePlanAfterCurrent; 194-17 y 194-18 agregan sus describes acá).
 *
 * Cobros reales por HTTP (`POST .../subscription/change-plan` con
 * `startMode: "after_current"`). Números redondos: plan destino de 100000 ARS,
 * descuento por invitación 10% (aura_config.referral=10), precio Zero 70000.
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
async function monthPlan(allowsInvitationDiscount: boolean): Promise<number> {
  const plan = await createPlan(app, adminToken, {
    name: `Paths ${seq}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    priceRegular: BASE,
    priceZero: PRICE_ZERO,
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
