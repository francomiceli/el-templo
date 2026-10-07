/**
 * Fase 194 Plan 15 — COBRO DE ALTA (`assignPlan`) sobre el árbitro de descuentos y
 * vínculo de invitación que nace al comprar (D-05 / D-08 / D-10b / D-10c / D-13 /
 * D-17 / D-20 / D-21 / D-26a).
 *
 * Cobros reales por HTTP (`POST .../subscription/assign`). Números redondos:
 * plan de 100000 ARS, descuento por invitación 10% (aura_config.referral=10),
 * precio Zero 70000. Fechas siempre relativas a `todayInTz(tz de la sede)`; nunca
 * ids de `users` hardcodeados.
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
import { auditLog } from "../../src/modules/shared/audit-log";
import { tenantWhere } from "../../src/modules/shared/tenant";
import {
  createActiveSub,
  createInvitationRow,
  createInviterWithCode,
  createMemberInPhysicalBranch,
  createTrialPlan,
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
async function monthPlan(allowsInvitationDiscount = true): Promise<number> {
  const plan = await createPlan(app, adminToken, {
    name: `Conv ${seq}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    priceRegular: BASE,
    priceZero: PRICE_ZERO,
    classesPerWeek: undefined,
    durationDays: 30,
    allowsInvitationDiscount,
  });
  return plan.id;
}

interface Invitee {
  id: number;
  branchId: number;
  inviterId: number;
  invitationId: number;
  accessSubId: number | null;
}

/**
 * Invitado con una invitación `active` del invitador (con membresía vigente).
 * `accessExpiresOffsetDays` = vencimiento de los accesos respecto de hoy; con
 * `withAccessSub` además tiene la sub de invitación vigente (D-07).
 */
async function inviteeOf(
  inviter: { id: number },
  opts: {
    accessExpiresOffsetDays?: number;
    withAccessSub?: boolean;
    channel?: "self_service" | "assisted";
    activatedAt?: Date;
  } = {},
): Promise<Invitee> {
  const today = todayInTz(TZ_AR);
  const payer = await createMemberInPhysicalBranch(ctx, { status: "prueba" });
  let accessSubId: number | null = null;
  if (opts.withAccessSub) {
    const trialPlan = await createTrialPlan(ctx);
    const sub = await createActiveSub(ctx, {
      userId: payer.id,
      planId: trialPlan.id,
      startOffsetDays: -1,
      endOffsetDays: 5,
    });
    accessSubId = sub.id;
  }
  const inv = await createInvitationRow(ctx, {
    inviterId: inviter.id,
    invitedUserId: payer.id,
    branchId: payer.branchId,
    channel: opts.channel ?? "assisted",
    accessExpiresOn: addDays(today, opts.accessExpiresOffsetDays ?? 5),
    accessStartsOn: addDays(today, (opts.accessExpiresOffsetDays ?? 5) - 5),
    subscriptionId: accessSubId,
    ...(opts.activatedAt ? { activatedAt: opts.activatedAt } : {}),
  });
  return {
    id: payer.id,
    branchId: payer.branchId,
    inviterId: inviter.id,
    invitationId: inv.id,
    accessSubId,
  };
}

async function buy(
  payer: { id: number; branchId: number },
  planId: number,
  extra: Record<string, unknown> = {},
): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  return assignPlan(app, adminToken, payer.id, {
    planId,
    branchId: payer.branchId,
    startDate: todayInTz(TZ_AR),
    ...extra,
  });
}

interface SubRow {
  pricePaid: number;
  status: string;
  auraDiscount: number | null;
  auraDiscountPercent: number | null;
  referralDiscountPercent: number | null;
  referralDiscountAmount: number | null;
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

async function subStatusOf(subscriptionId: number): Promise<string> {
  return (await readSub(subscriptionId)).status;
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

async function giveDeviceToken(userId: number): Promise<void> {
  await app.db.execute(
    sql`INSERT INTO device_tokens (tenant_id, user_id, token, device_platform)
        VALUES (${ctx.tenant.tenantId}, ${userId}, ${`tok-${userId}-${Date.now()}`}, 'android')`,
  );
}

async function notificationsOf(
  userId: number,
): Promise<Array<{ body: string; template_key: string | null }>> {
  const rows = await app.db.execute(
    sql`SELECT pn.body AS body, t.template_key AS template_key
        FROM pending_notifications pn
        LEFT JOIN notification_templates t ON t.id = pn.template_id
        WHERE pn.user_id = ${userId} AND pn.tenant_id = ${ctx.tenant.tenantId}`,
  );
  return rows[0] as unknown as Array<{
    body: string;
    template_key: string | null;
  }>;
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

// ─── Conversión: el vínculo nace al comprar ─────────────────────────────────

describe("194-15: la compra del invitado crea el vínculo y descuenta (D-05 / D-08)", () => {
  it("accesos vigentes: 90000, vínculo qualified a nombre del invitador, accesos completed, crédito y aviso", async () => {
    const inviter = await createInviterWithCode(ctx);
    await giveDeviceToken(inviter.id);
    const payer = await inviteeOf(inviter, {
      withAccessSub: true,
      channel: "assisted",
    });
    const planId = await monthPlan();

    const res = await buy(payer, planId);
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
    expect(links[0].qualifiedAt).not.toBeNull();

    // D-07: los accesos de invitación se cierran en la misma compra.
    expect(await subStatusOf(payer.accessSubId as number)).toBe("completed");

    // D-10c: crédito con % nominal y monto aplicado.
    expect(await creditOf(payer.id)).toEqual({ percent: 10, amount: 10000 });

    // Aviso al invitador después del commit (best-effort).
    const notifs = await notificationsOf(inviter.id);
    expect(notifs).toHaveLength(1);
    expect(notifs[0].template_key).toBe("referral_link_activated");
    // Nada al invitado.
    expect(await notificationsOf(payer.id)).toHaveLength(0);
  });

  it("el canal del vínculo es el de la invitación (self_service)", async () => {
    const inviter = await createInviterWithCode(ctx);
    const payer = await inviteeOf(inviter, { channel: "self_service" });
    const res = await buy(payer, await monthPlan());
    expect(res.statusCode).toBe(201);
    const [link] = await referralRowsOf(payer.id);
    expect(link.attributionChannel).toBe("self_service");
  });

  it("invitaciones múltiples: el vínculo es del invitador de la invitación MÁS RECIENTE", async () => {
    const olderInviter = await createInviterWithCode(ctx);
    const newerInviter = await createInviterWithCode(ctx);
    const payer = await inviteeOf(olderInviter, {
      activatedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    });
    // Segunda invitación (de otro invitador) activada después.
    await createInvitationRow(ctx, {
      inviterId: newerInviter.id,
      invitedUserId: payer.id,
      branchId: payer.branchId,
    });

    const res = await buy(payer, await monthPlan());
    expect(res.statusCode).toBe(201);
    const [link] = await referralRowsOf(payer.id);
    expect(link.referrerId).toBe(newerInviter.id);
  });

  it("invitación anulada (voided): no da vínculo ni descuento", async () => {
    const inviter = await createInviterWithCode(ctx);
    const payer = await inviteeOf(inviter);
    await app.db
      .update(schema.invitations)
      .set({ status: "voided" })
      .where(
        and(
          tenantWhere(schema.invitations, ctx.tenant),
          eq(schema.invitations.id, payer.invitationId),
        ),
      );
    const res = await buy(payer, await monthPlan());
    expect(res.statusCode).toBe(201);
    expect((await readSub(res.body.id as number)).pricePaid).toBe(BASE);
    expect(await referralRowsOf(payer.id)).toHaveLength(0);
  });
});

// ─── D-13: ventana de compra tardía ──────────────────────────────────────────

describe("194-15: compra tardía (D-13)", () => {
  it("accesos vencidos hace 30 días (borde de la ventana de 30) → vínculo y descuento", async () => {
    const inviter = await createInviterWithCode(ctx);
    const payer = await inviteeOf(inviter, { accessExpiresOffsetDays: -30 });
    const res = await buy(payer, await monthPlan());
    expect(res.statusCode).toBe(201);
    expect((await readSub(res.body.id as number)).pricePaid).toBe(90000);
    expect(await referralRowsOf(payer.id)).toHaveLength(1);
  });

  it("accesos vencidos hace 31 días (más que la ventana) → sin vínculo y sin descuento", async () => {
    const inviter = await createInviterWithCode(ctx);
    const payer = await inviteeOf(inviter, { accessExpiresOffsetDays: -31 });
    const res = await buy(payer, await monthPlan());
    expect(res.statusCode).toBe(201);
    const row = await readSub(res.body.id as number);
    expect(row.pricePaid).toBe(BASE);
    expect(row.referralDiscountAmount).toBeNull();
    expect(await referralRowsOf(payer.id)).toHaveLength(0);
    expect(await creditOf(payer.id)).toBeUndefined();
  });

  it("la ventana es configurable: con 60 días, vencidos hace 45 → vínculo", async () => {
    await setInvitationSettings(app.db, ctx.tenant, {
      latePurchaseWindowDays: 60,
    });
    const inviter = await createInviterWithCode(ctx);
    const payer = await inviteeOf(inviter, { accessExpiresOffsetDays: -45 });
    const res = await buy(payer, await monthPlan());
    expect(res.statusCode).toBe(201);
    expect((await readSub(res.body.id as number)).pricePaid).toBe(90000);
    expect(await referralRowsOf(payer.id)).toHaveLength(1);
  });
});

// ─── D-10b: flag por plan ────────────────────────────────────────────────────

describe("194-15: flag del plan (D-10b)", () => {
  it("plan SIN flag: ni descuenta ni materializa el vínculo, y el accesos igual se cierran", async () => {
    const inviter = await createInviterWithCode(ctx);
    const payer = await inviteeOf(inviter, { withAccessSub: true });
    const res = await buy(payer, await monthPlan(false));
    expect(res.statusCode).toBe(201);
    const row = await readSub(res.body.id as number);
    expect(row.pricePaid).toBe(BASE);
    expect(row.referralDiscountAmount).toBeNull();
    expect(await referralRowsOf(payer.id)).toHaveLength(0);
    expect(await creditOf(payer.id)).toBeUndefined();
    expect(await subStatusOf(payer.accessSubId as number)).toBe("completed");
  });

  it("vínculo legacy `pending` + plan SIN flag: NO cualifica y no descuenta; con flag SÍ", async () => {
    const referrer = await createInviterWithCode(ctx);
    const payerA = await createMemberInPhysicalBranch(ctx, {
      status: "prueba",
    });
    const payerB = await createMemberInPhysicalBranch(ctx, {
      status: "prueba",
    });
    for (const payer of [payerA, payerB]) {
      await app.db.execute(
        sql`INSERT INTO referrals (tenant_id, referrer_id, referred_id, status, attribution_channel)
            VALUES (${ctx.tenant.tenantId}, ${referrer.id}, ${payer.id}, 'pending', 'assisted')`,
      );
    }

    const noFlag = await buy(payerA, await monthPlan(false));
    expect(noFlag.statusCode).toBe(201);
    expect((await readSub(noFlag.body.id as number)).pricePaid).toBe(BASE);
    expect((await referralRowsOf(payerA.id))[0].status).toBe("pending");

    const flagged = await buy(payerB, await monthPlan(true));
    expect(flagged.statusCode).toBe(201);
    expect((await readSub(flagged.body.id as number)).pricePaid).toBe(90000);
    expect((await referralRowsOf(payerB.id))[0].status).toBe("qualified");
  });
});

// ─── D-08 / D-21: gana el mayor ──────────────────────────────────────────────

describe("194-15: AURA, partner e invitación compiten (D-08 / D-21)", () => {
  it("AURA 10% = invitación 10% (empate): gana la invitación, los puntos NO se gastan", async () => {
    const inviter = await createInviterWithCode(ctx);
    const payer = await inviteeOf(inviter);
    await seedAuraBalance(app, payer.id, 1000);
    const res = await buy(payer, await monthPlan(), { auraSpend: 1000 });
    expect(res.statusCode).toBe(201);
    const row = await readSub(res.body.id as number);
    expect(row.pricePaid).toBe(90000);
    expect(row.auraDiscount).toBeNull();
    expect(row.referralDiscountAmount).toBe(10000);
    expect(await auraBalanceOf(payer.id)).toBe(1000);
  });

  it("AURA 30% (30000) gana a la invitación 10% (10000): precio 70000, sin descuento de invitación, PERO el vínculo se crea igual (D-05)", async () => {
    const inviter = await createInviterWithCode(ctx);
    const payer = await inviteeOf(inviter);
    await seedAuraBalance(app, payer.id, 5000);
    const res = await buy(payer, await monthPlan(), { auraSpend: 5000 });
    expect(res.statusCode).toBe(201);
    const row = await readSub(res.body.id as number);
    expect(row.pricePaid).toBe(70000);
    expect(row.auraDiscount).toBe(5000);
    expect(row.referralDiscountAmount).toBeNull();
    expect(row.referralDiscountPercent).toBeNull();
    expect(await creditOf(payer.id)).toBeUndefined();
    // El vínculo sirve para los cobros siguientes aunque hoy haya perdido.
    const links = await referralRowsOf(payer.id);
    expect(links).toHaveLength(1);
    expect(links[0].status).toBe("qualified");
    expect(await auraBalanceOf(payer.id)).toBe(0);
  });

  it("partner 15% gana a la invitación 10%: precio 85000 (antes componían) y el vínculo se crea igual", async () => {
    const inviter = await createInviterWithCode(ctx);
    const payer = await inviteeOf(inviter);
    const partner = await insertPartner(app, { benefitValue: 15 });
    await insertPartnerLink(app, {
      partnerId: partner.id,
      referredId: payer.id,
      benefitType: "discount_percent",
      benefitValue: 15,
      benefitStatus: "pending",
    });
    const res = await buy(payer, await monthPlan());
    expect(res.statusCode).toBe(201);
    const row = await readSub(res.body.id as number);
    expect(row.pricePaid).toBe(85000);
    expect(row.partnerDiscountAmount).toBe(15000);
    expect(row.referralDiscountAmount).toBeNull();
    expect(await referralRowsOf(payer.id)).toHaveLength(1);
  });

  it("partner 5% pierde contra la invitación 10%: precio 90000 sin descuento de partner", async () => {
    const inviter = await createInviterWithCode(ctx);
    const payer = await inviteeOf(inviter);
    const partner = await insertPartner(app, { benefitValue: 5 });
    await insertPartnerLink(app, {
      partnerId: partner.id,
      referredId: payer.id,
      benefitType: "discount_percent",
      benefitValue: 5,
      benefitStatus: "pending",
    });
    const res = await buy(payer, await monthPlan());
    expect(res.statusCode).toBe(201);
    const row = await readSub(res.body.id as number);
    expect(row.pricePaid).toBe(90000);
    expect(row.partnerDiscountAmount).toBeNull();
    expect(row.referralDiscountAmount).toBe(10000);
  });
});

// ─── D-10c: tope en dinero ───────────────────────────────────────────────────

describe("194-15: tope en dinero por país (D-10c)", () => {
  it("tope AR 5000: la invitación descuenta 5000 (95000) y el crédito guarda % nominal 10 y monto recortado 5000", async () => {
    await setInvitationSettings(app.db, ctx.tenant, {
      discountCapAmount: { AR: 5000 },
    });
    const inviter = await createInviterWithCode(ctx);
    const payer = await inviteeOf(inviter);
    const res = await buy(payer, await monthPlan());
    expect(res.statusCode).toBe(201);
    const row = await readSub(res.body.id as number);
    expect(row.pricePaid).toBe(95000);
    expect(row.referralDiscountPercent).toBe(10);
    expect(row.referralDiscountAmount).toBe(5000);
    expect(await creditOf(payer.id)).toEqual({ percent: 10, amount: 5000 });
  });

  it("tope AR 5000 + AURA 10% (10000): el monto recortado pierde, gana AURA", async () => {
    await setInvitationSettings(app.db, ctx.tenant, {
      discountCapAmount: { AR: 5000 },
    });
    const inviter = await createInviterWithCode(ctx);
    const payer = await inviteeOf(inviter);
    await seedAuraBalance(app, payer.id, 1000);
    const res = await buy(payer, await monthPlan(), { auraSpend: 1000 });
    expect(res.statusCode).toBe(201);
    const row = await readSub(res.body.id as number);
    expect(row.pricePaid).toBe(90000);
    expect(row.auraDiscount).toBe(1000);
    expect(row.referralDiscountAmount).toBeNull();
    expect(await auraBalanceOf(payer.id)).toBe(0);
  });

  it("D-17: el vínculo heredado (referrals qualified, sin invitación) también queda sujeto al tope", async () => {
    await setInvitationSettings(app.db, ctx.tenant, {
      discountCapAmount: { AR: 5000 },
    });
    const referrer = await createInviterWithCode(ctx);
    const payer = await createMemberInPhysicalBranch(ctx, { status: "activo" });
    await app.db.execute(
      sql`INSERT INTO referrals (tenant_id, referrer_id, referred_id, status, attribution_channel, qualified_at)
          VALUES (${ctx.tenant.tenantId}, ${referrer.id}, ${payer.id}, 'qualified', 'assisted', NOW())`,
    );
    const res = await buy(payer, await monthPlan());
    expect(res.statusCode).toBe(201);
    const row = await readSub(res.body.id as number);
    expect(row.pricePaid).toBe(95000);
    expect(row.referralDiscountAmount).toBe(5000);
    // Sin invitación no hay vínculo nuevo: se conserva el que había.
    expect(await referralRowsOf(payer.id)).toHaveLength(1);
  });
});

// ─── D-20 / D-26a: override y boarding pass ──────────────────────────────────

describe("194-15: exclusiones del descuento (D-20 / D-26a)", () => {
  it("override con motivo: el precio ES el override (50000), sin descuento de invitación; el vínculo sí nace", async () => {
    const inviter = await createInviterWithCode(ctx);
    const payer = await inviteeOf(inviter);
    const res = await buy(payer, await monthPlan(), {
      priceOverrideAmount: 50000,
      priceOverrideReason: "Convenio 194-15",
    });
    expect(res.statusCode).toBe(201);
    const row = await readSub(res.body.id as number);
    expect(row.pricePaid).toBe(50000);
    expect(row.priceOverrideAmount).toBe(50000);
    expect(row.referralDiscountAmount).toBeNull();
    expect(await creditOf(payer.id)).toBeUndefined();
    expect(await referralRowsOf(payer.id)).toHaveLength(1);
  });

  it("override con motivo + partner 20%: el partner tampoco compite (el override ES el precio final)", async () => {
    const inviter = await createInviterWithCode(ctx);
    const payer = await inviteeOf(inviter);
    const partner = await insertPartner(app, { benefitValue: 20 });
    await insertPartnerLink(app, {
      partnerId: partner.id,
      referredId: payer.id,
      benefitType: "discount_percent",
      benefitValue: 20,
      benefitStatus: "pending",
    });
    const res = await buy(payer, await monthPlan(), {
      priceOverrideAmount: 50000,
      priceOverrideReason: "Convenio 194-15",
    });
    expect(res.statusCode).toBe(201);
    const row = await readSub(res.body.id as number);
    expect(row.pricePaid).toBe(50000);
    expect(row.partnerDiscountAmount).toBeNull();
    expect(row.referralDiscountAmount).toBeNull();
  });

  it("boarding pass + partner 20%: el boarding pass es exclusivo, el partner no participa ni consume su beneficio", async () => {
    await setZeroPriceRule(true);
    try {
      const inviter = await createInviterWithCode(ctx);
      const payer = await inviteeOf(inviter);
      const partner = await insertPartner(app, { benefitValue: 20 });
      await insertPartnerLink(app, {
        partnerId: partner.id,
        referredId: payer.id,
        benefitType: "discount_percent",
        benefitValue: 20,
        benefitStatus: "pending",
      });
      const res = await buy(payer, await monthPlan(), { boardingPass: true });
      expect(res.statusCode).toBe(201);
      const row = await readSub(res.body.id as number);
      expect(row.pricePaid).toBe(PRICE_ZERO);
      expect(row.partnerDiscountAmount).toBeNull();
      const rows = await app.db.execute(
        sql`SELECT benefit_status FROM partner_referrals WHERE referred_id = ${payer.id}`,
      );
      expect(
        (rows[0] as unknown as Array<{ benefit_status: string }>)[0]
          .benefit_status,
      ).toBe("pending");
    } finally {
      await setZeroPriceRule(false);
    }
  });

  it("override en $0 (bonificada): no cobra, así que NO se crea el vínculo (T-194-53)", async () => {
    const inviter = await createInviterWithCode(ctx);
    const payer = await inviteeOf(inviter);
    const res = await buy(payer, await monthPlan(), {
      priceOverrideAmount: 0,
      priceOverrideReason: "Bonificación 194-15",
    });
    expect(res.statusCode).toBe(201);
    expect((await readSub(res.body.id as number)).pricePaid).toBe(0);
    expect(await referralRowsOf(payer.id)).toHaveLength(0);
  });

  it("boarding pass: precio Zero 70000 sin descuento de invitación; el vínculo sí nace", async () => {
    await setZeroPriceRule(true);
    try {
      const inviter = await createInviterWithCode(ctx);
      const payer = await inviteeOf(inviter);
      const res = await buy(payer, await monthPlan(), { boardingPass: true });
      expect(res.statusCode).toBe(201);
      const row = await readSub(res.body.id as number);
      expect(row.boardingPassUsed).toBe(true);
      expect(row.pricePaid).toBe(PRICE_ZERO);
      expect(row.referralDiscountAmount).toBeNull();
      expect(await referralRowsOf(payer.id)).toHaveLength(1);
    } finally {
      await setZeroPriceRule(false);
    }
  });
});

// ─── Atomicidad ──────────────────────────────────────────────────────────────

describe("194-15: el vínculo vive en la tx del cobro (T-194-53)", () => {
  it("si el cobro falla después de crear el vínculo, no queda vínculo ni sub ni accesos cerrados", async () => {
    const inviter = await createInviterWithCode(ctx);
    await giveDeviceToken(inviter.id);
    const payer = await inviteeOf(inviter, { withAccessSub: true });
    const planId = await monthPlan();

    // La auditoría es lo último de la tx: tirarla prueba que TODO lo anterior (sub,
    // cierre de accesos, vínculo) se revierte junto.
    vi.spyOn(auditLog, "write").mockRejectedValueOnce(new Error("boom"));
    const res = await buy(payer, planId);
    expect(res.statusCode).toBe(500);
    vi.restoreAllMocks();

    expect(await referralRowsOf(payer.id)).toHaveLength(0);
    expect(await subStatusOf(payer.accessSubId as number)).toBe("active");
    // Y tampoco se avisó al invitador: el aviso va DESPUÉS del commit.
    expect(await notificationsOf(inviter.id)).toHaveLength(0);

    // El reintento funciona y crea el vínculo una sola vez.
    const retry = await buy(payer, planId);
    expect(retry.statusCode).toBe(201);
    expect(await referralRowsOf(payer.id)).toHaveLength(1);
  });

  it("alta prorrateada a fin de mes: no hay descuento ni vínculo (el proporcional es el precio final)", async () => {
    const inviter = await createInviterWithCode(ctx);
    const payer = await inviteeOf(inviter);
    const res = await buy(payer, await monthPlan(), {
      prorateToMonthEnd: true,
    });
    expect(res.statusCode).toBe(201);
    const row = await readSub(res.body.id as number);
    expect(row.referralDiscountAmount).toBeNull();
    expect(await referralRowsOf(payer.id)).toHaveLength(0);
  });
});
