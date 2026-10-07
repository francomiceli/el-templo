/**
 * Fase 194-14 — núcleo del árbitro de descuentos (COBROS).
 *
 * Secciones:
 *  1. Vínculo que nace al comprar (D-05/D-13/D-26c): `findLinkableInvitation` y
 *     `materializeInvitationLink` (integración, DB real).
 *  2. Funciones PURAS del árbitro (`pickCoreCompetitor`, `applyArbiterResult`,
 *     `capInvitationAmount`): tabla de casos, sin DB.
 *  3. `resolveInvitationDiscountCandidate` (D-08/D-09/D-10b/D-10c/D-20/D-26a).
 *
 * Fechas siempre relativas a `todayInTz(tz de la sede)`; nunca ids hardcodeados.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { createTestApp, cleanAllTestData } from "../helpers";
import { seedAuraBalance } from "../subscriptions/_helpers";
import * as schema from "../../src/db/schema";
import { pricingAdjustHandler } from "../../src/modules/aura/pricing-benefits";
import { setInvitationSettings } from "../../src/modules/referrals/invitation-settings";
import { ReferralService } from "../../src/modules/referrals/service";
import type { PricingAdjustCtx } from "../../src/modules/shared/hooks";
import { addDays, todayInTz } from "../../src/modules/shared/date-utils";
import { tenantValues, tenantWhere } from "../../src/modules/shared/tenant";
import {
  applyArbiterResult,
  capInvitationAmount,
  discountAmountOf,
  partnerCompetitor,
  pickCoreCompetitor,
  prepareChargeDiscounts,
  resolveChargeInvitation,
  resolveInvitationDiscountCandidate,
  settleChargeDiscounts,
  type ArbiterPlan,
  type DiscountArbiterDeps,
  type InvitationCandidateInput,
  type InvitationDiscountCandidate,
  type PreparedChargeDiscounts,
} from "../../src/modules/subscriptions/discount-arbiter";
import {
  findLinkableInvitation,
  materializeInvitationLink,
  notifyInviterLinkActivated,
} from "../../src/modules/referrals/invitation-link";
import {
  createActiveSub,
  createInvitationRow,
  createInviterWithCode,
  createMembershipPlan,
  createMemberInPhysicalBranch,
  fixtureCtx,
  resetInvitationSettings,
  type InvitationsFixtureCtx,
} from "./_helpers";

const TZ_AR = "America/Argentina/Buenos_Aires";

let app: FastifyInstance;
let ctx: InvitationsFixtureCtx;

beforeAll(async () => {
  app = await createTestApp();
  ctx = fixtureCtx(app);
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await cleanAllTestData(app);
  await resetInvitationSettings(ctx);
  // cleanAllTestData vacía aura_config y system_settings: se resiembra el 10% por
  // invitado activo y el tope 40 (D-09/D-10e) para que el lado invitador sea determinista.
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

/** Filas de `referrals` del invitado (UNIQUE: a lo sumo una). */
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

async function referredByOf(userId: number): Promise<number | null> {
  const [row] = await app.db
    .select({ referredBy: schema.users.referredBy })
    .from(schema.users)
    .where(
      and(tenantWhere(schema.users, ctx.tenant), eq(schema.users.id, userId)),
    );
  return row?.referredBy ?? null;
}

const LATE_WINDOW = 30;

describe("findLinkableInvitation (D-05 / D-13 / D-26c)", () => {
  it("invitación activa vigente -> candidato con invitador y canal", async () => {
    const inviter = await createInviterWithCode(ctx);
    const payer = await createMemberInPhysicalBranch(ctx, { status: "prueba" });
    const inv = await createInvitationRow(ctx, {
      inviterId: inviter.id,
      invitedUserId: payer.id,
      branchId: payer.branchId,
      channel: "assisted",
    });
    expect(
      await findLinkableInvitation(app.db, ctx.tenant, payer.id, LATE_WINDOW),
    ).toEqual({
      invitationId: inv.id,
      inviterId: inviter.id,
      channel: "assisted",
    });
  });

  it("vencida hace 20 días con ventana de 30 -> sigue dando vínculo; hace 40 -> no", async () => {
    const inviter = await createInviterWithCode(ctx);
    const today = todayInTz(TZ_AR);
    const recent = await createMemberInPhysicalBranch(ctx, {
      status: "inactivo",
    });
    await createInvitationRow(ctx, {
      inviterId: inviter.id,
      invitedUserId: recent.id,
      branchId: recent.branchId,
      accessStartsOn: addDays(today, -30),
      accessExpiresOn: addDays(today, -20),
    });
    const old = await createMemberInPhysicalBranch(ctx, { status: "inactivo" });
    await createInvitationRow(ctx, {
      inviterId: inviter.id,
      invitedUserId: old.id,
      branchId: old.branchId,
      accessStartsOn: addDays(today, -50),
      accessExpiresOn: addDays(today, -40),
    });
    expect(
      await findLinkableInvitation(app.db, ctx.tenant, recent.id, LATE_WINDOW),
    ).not.toBeNull();
    expect(
      await findLinkableInvitation(app.db, ctx.tenant, old.id, LATE_WINDOW),
    ).toBeNull();
  });

  it("el borde de la ventana: vence hace exactamente 30 días todavía vincula; hace 31 no", async () => {
    const inviter = await createInviterWithCode(ctx);
    const today = todayInTz(TZ_AR);
    const edge = await createMemberInPhysicalBranch(ctx, {
      status: "inactivo",
    });
    await createInvitationRow(ctx, {
      inviterId: inviter.id,
      invitedUserId: edge.id,
      branchId: edge.branchId,
      accessStartsOn: addDays(today, -40),
      accessExpiresOn: addDays(today, -LATE_WINDOW),
    });
    const past = await createMemberInPhysicalBranch(ctx, {
      status: "inactivo",
    });
    await createInvitationRow(ctx, {
      inviterId: inviter.id,
      invitedUserId: past.id,
      branchId: past.branchId,
      accessStartsOn: addDays(today, -41),
      accessExpiresOn: addDays(today, -(LATE_WINDOW + 1)),
    });
    expect(
      await findLinkableInvitation(app.db, ctx.tenant, edge.id, LATE_WINDOW),
    ).not.toBeNull();
    expect(
      await findLinkableInvitation(app.db, ctx.tenant, past.id, LATE_WINDOW),
    ).toBeNull();
  });

  it("una invitación anulada no da vínculo", async () => {
    const inviter = await createInviterWithCode(ctx);
    const payer = await createMemberInPhysicalBranch(ctx, {
      status: "inactivo",
    });
    await createInvitationRow(ctx, {
      inviterId: inviter.id,
      invitedUserId: payer.id,
      branchId: payer.branchId,
      status: "voided",
    });
    expect(
      await findLinkableInvitation(app.db, ctx.tenant, payer.id, LATE_WINDOW),
    ).toBeNull();
  });

  it("con dos invitaciones activas gana la más reciente (D-05)", async () => {
    const first = await createInviterWithCode(ctx);
    const second = await createInviterWithCode(ctx);
    const payer = await createMemberInPhysicalBranch(ctx, { status: "prueba" });
    await createInvitationRow(ctx, {
      inviterId: first.id,
      invitedUserId: payer.id,
      branchId: payer.branchId,
      activatedAt: new Date(Date.now() - 40 * 24 * 3600 * 1000),
    });
    const recent = await createInvitationRow(ctx, {
      inviterId: second.id,
      invitedUserId: payer.id,
      branchId: payer.branchId,
      activatedAt: new Date(Date.now() - 24 * 3600 * 1000),
    });
    const link = await findLinkableInvitation(
      app.db,
      ctx.tenant,
      payer.id,
      LATE_WINDOW,
    );
    expect(link?.invitationId).toBe(recent.id);
    expect(link?.inviterId).toBe(second.id);
  });

  it("D-26c: si el pagador ya tiene fila en referrals no se ofrece un segundo vínculo", async () => {
    const original = await createInviterWithCode(ctx);
    const newer = await createInviterWithCode(ctx);
    const payer = await createMemberInPhysicalBranch(ctx, { status: "prueba" });
    await createInvitationRow(ctx, {
      inviterId: newer.id,
      invitedUserId: payer.id,
      branchId: payer.branchId,
    });
    await materializeInvitationLink(
      app.db,
      ctx.tenant,
      app.log,
      { invitationId: 0, inviterId: original.id, channel: "assisted" },
      payer.id,
    );
    expect(
      await findLinkableInvitation(app.db, ctx.tenant, payer.id, LATE_WINDOW),
    ).toBeNull();
  });
});

describe("materializeInvitationLink (D-05 / D-26c)", () => {
  it("crea referrals qualified con canal, copy_variant del invitador, qualified_at y espeja users.referred_by", async () => {
    const inviter = await createInviterWithCode(ctx);
    const payer = await createMemberInPhysicalBranch(ctx, { status: "prueba" });
    const created = await materializeInvitationLink(
      app.db,
      ctx.tenant,
      app.log,
      { invitationId: 1, inviterId: inviter.id, channel: "assisted" },
      payer.id,
    );
    expect(created).toBe(true);

    const rows = await referralRowsOf(payer.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].referrerId).toBe(inviter.id);
    expect(rows[0].status).toBe("qualified");
    expect(rows[0].attributionChannel).toBe("assisted");
    expect(rows[0].copyVariant).toBe(inviter.id % 2 === 0 ? "A" : "B");
    expect(rows[0].qualifiedAt).not.toBeNull();
    expect(
      Math.abs(Date.now() - (rows[0].qualifiedAt as Date).getTime()),
    ).toBeLessThan(60_000);
    expect(await referredByOf(payer.id)).toBe(inviter.id);
  });

  it("canal self_service se conserva tal cual", async () => {
    const inviter = await createInviterWithCode(ctx);
    const payer = await createMemberInPhysicalBranch(ctx, { status: "prueba" });
    await materializeInvitationLink(
      app.db,
      ctx.tenant,
      app.log,
      { invitationId: 1, inviterId: inviter.id, channel: "self_service" },
      payer.id,
    );
    expect((await referralRowsOf(payer.id))[0].attributionChannel).toBe(
      "self_service",
    );
  });

  it("es idempotente: la segunda llamada no lanza, no duplica y conserva el vínculo original (carrera / D-26c)", async () => {
    const original = await createInviterWithCode(ctx);
    const other = await createInviterWithCode(ctx);
    const payer = await createMemberInPhysicalBranch(ctx, { status: "prueba" });
    expect(
      await materializeInvitationLink(
        app.db,
        ctx.tenant,
        app.log,
        { invitationId: 1, inviterId: original.id, channel: "self_service" },
        payer.id,
      ),
    ).toBe(true);
    await expect(
      materializeInvitationLink(
        app.db,
        ctx.tenant,
        app.log,
        { invitationId: 2, inviterId: other.id, channel: "assisted" },
        payer.id,
      ),
    ).resolves.toBe(false);

    const rows = await referralRowsOf(payer.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].referrerId).toBe(original.id);
    expect(await referredByOf(payer.id)).toBe(original.id);
  });

  it("notifyInviterLinkActivated es best-effort: un pagador inexistente no lanza", async () => {
    const inviter = await createInviterWithCode(ctx);
    await expect(
      notifyInviterLinkActivated(
        app.db,
        app.log,
        ctx.tenant,
        inviter.id,
        2_000_000_000,
      ),
    ).resolves.toBeUndefined();
  });
});

// ─── 2. Funciones puras del árbitro ─────────────────────────────────────────

/** Candidato mínimo para las tablas puras: solo importa `amount`. */
function invitationCandidate(amount: number): InvitationDiscountCandidate {
  return {
    percent: 10,
    nominalAmount: amount,
    amount,
    capApplied: false,
    linkToMaterialize: null,
  };
}

describe("pickCoreCompetitor (D-21: gana el mayor MONTO, empate -> invitación)", () => {
  it.each([
    ["sin partner ni invitación", null, null, null],
    [
      "partner 5000 vs invitación 9000 -> invitación",
      { percent: 5, amount: 5000 },
      invitationCandidate(9000),
      { kind: "invitation", amount: 9000 },
    ],
    [
      "partner 9000 vs invitación 9000 (empate) -> invitación",
      { percent: 9, amount: 9000 },
      invitationCandidate(9000),
      { kind: "invitation", amount: 9000 },
    ],
    [
      "partner 12000 vs invitación 9000 -> partner",
      { percent: 12, amount: 12000 },
      invitationCandidate(9000),
      { kind: "partner", amount: 12000 },
    ],
    [
      "solo invitación",
      null,
      invitationCandidate(7000),
      { kind: "invitation", amount: 7000 },
    ],
    [
      "solo partner",
      { percent: 20, amount: 20000 },
      null,
      { kind: "partner", amount: 20000 },
    ],
    [
      "invitación con monto 0 (solo vínculo por crear) no compite",
      null,
      invitationCandidate(0),
      null,
    ],
    [
      "invitación con monto 0 pierde contra cualquier partner",
      { percent: 1, amount: 100 },
      invitationCandidate(0),
      { kind: "partner", amount: 100 },
    ],
  ] as const)("%s", (_nombre, partner, invitation, esperado) => {
    expect(pickCoreCompetitor(partner, invitation)).toEqual(esperado);
  });
});

describe("applyArbiterResult", () => {
  it("AURA aplicó: ningún core descuenta y el precio es el que dejó el filter", () => {
    expect(
      applyArbiterResult({
        priceAfterFilter: 90000,
        auraApplied: true,
        core: { kind: "invitation", amount: 9000 },
      }),
    ).toEqual({ invitationAmount: 0, partnerAmount: 0, finalPrice: 90000 });
  });

  it("sin AURA gana la invitación: 100000 - 9000 = 91000", () => {
    expect(
      applyArbiterResult({
        priceAfterFilter: 100000,
        auraApplied: false,
        core: { kind: "invitation", amount: 9000 },
      }),
    ).toEqual({ invitationAmount: 9000, partnerAmount: 0, finalPrice: 91000 });
  });

  it("sin AURA gana el partner: el monto va a partnerAmount", () => {
    expect(
      applyArbiterResult({
        priceAfterFilter: 100000,
        auraApplied: false,
        core: { kind: "partner", amount: 20000 },
      }),
    ).toEqual({ invitationAmount: 0, partnerAmount: 20000, finalPrice: 80000 });
  });

  it("sin core el precio queda igual; nunca baja de 0", () => {
    expect(
      applyArbiterResult({
        priceAfterFilter: 50000,
        auraApplied: false,
        core: null,
      }),
    ).toEqual({ invitationAmount: 0, partnerAmount: 0, finalPrice: 50000 });
    expect(
      applyArbiterResult({
        priceAfterFilter: 500,
        auraApplied: false,
        core: { kind: "partner", amount: 9999 },
      }).finalPrice,
    ).toBe(0);
  });
});

describe("capInvitationAmount / discountAmountOf / partnerCompetitor", () => {
  it("el tope recorta solo cuando el nominal lo supera; sin tope no recorta", () => {
    expect(capInvitationAmount(36000, 20000)).toEqual({
      amount: 20000,
      capApplied: true,
    });
    expect(capInvitationAmount(15000, 20000)).toEqual({
      amount: 15000,
      capApplied: false,
    });
    expect(capInvitationAmount(20000, 20000)).toEqual({
      amount: 20000,
      capApplied: false,
    });
    expect(capInvitationAmount(36000, null)).toEqual({
      amount: 36000,
      capApplied: false,
    });
  });

  it("el monto es floor(base * pct / 100) (misma fórmula que el cobro)", () => {
    expect(discountAmountOf(100000, 10)).toBe(10000);
    expect(discountAmountOf(99999, 10)).toBe(9999);
    expect(partnerCompetitor(null, 100000)).toBeNull();
    expect(partnerCompetitor({ percent: 20 }, 100000)).toEqual({
      percent: 20,
      amount: 20000,
    });
  });
});

// ─── 3. Candidato de invitación (integración) ───────────────────────────────

const TZ_BY_COUNTRY = { AR: TZ_AR, ES: "Europe/Madrid" } as const;
const BASE_PRICE = 100000;

/** Plan que admite el descuento (D-10b), del país indicado. */
function discountPlan(overrides: Partial<ArbiterPlan> = {}): ArbiterPlan {
  return {
    planCategory: "presencial",
    isTrial: false,
    allowsInvitationDiscount: true,
    country: "AR",
    ...overrides,
  };
}

function candidateInput(
  userId: number,
  overrides: Partial<InvitationCandidateInput> = {},
): InvitationCandidateInput {
  return {
    userId,
    plan: discountPlan(),
    basePrice: BASE_PRICE,
    isPriceOverride: false,
    boardingPassApplied: false,
    prorateToMonthEnd: undefined,
    ...overrides,
  };
}

function arbiterDeps(): DiscountArbiterDeps {
  return {
    db: app.db,
    log: app.log,
    referralService: new ReferralService(app.db, app.log),
  };
}

/**
 * Pagador con invitación activa de un invitador con membresía vigente.
 * `expiresInDays`: días hasta que vencen los accesos (negativo = ya vencieron; default: vigente).
 */
async function payerWithInvitation(
  opts: { country?: "AR" | "ES"; expiresInDays?: number } = {},
): Promise<{ payerId: number; inviterId: number }> {
  const country = opts.country ?? "AR";
  const inviter = await createInviterWithCode(ctx, { country });
  const payer = await createMemberInPhysicalBranch(ctx, {
    country,
    status: "prueba",
  });
  const today = todayInTz(TZ_BY_COUNTRY[country]);
  const expiresInDays = opts.expiresInDays ?? 5;
  await createInvitationRow(ctx, {
    inviterId: inviter.id,
    invitedUserId: payer.id,
    branchId: payer.branchId,
    accessStartsOn: addDays(today, expiresInDays - 10),
    accessExpiresOn: addDays(today, expiresInDays),
  });
  return { payerId: payer.id, inviterId: inviter.id };
}

describe("resolveInvitationDiscountCandidate: gates (D-10b, prorrateo, D-20, D-26a, base > 0)", () => {
  it("sin gate cerrado: 10% de 100000 con el vínculo por crear", async () => {
    const { payerId, inviterId } = await payerWithInvitation();
    const candidate = await resolveInvitationDiscountCandidate(
      arbiterDeps(),
      ctx.tenant,
      candidateInput(payerId),
    );
    expect(candidate).toMatchObject({
      percent: 10,
      nominalAmount: 10000,
      amount: 10000,
      capApplied: false,
    });
    expect(candidate?.linkToMaterialize).toMatchObject({ inviterId });
  });

  it.each([
    [
      "plan sin el flag (D-10b)",
      { plan: discountPlan({ allowsInvitationDiscount: false }) },
    ],
    ["plan especial", { plan: discountPlan({ planCategory: "especial" }) }],
    ["plan paquete", { plan: discountPlan({ planCategory: "paquete" }) }],
    ["plan is_trial", { plan: discountPlan({ isTrial: true }) }],
    ["alta prorrateada a fin de mes", { prorateToMonthEnd: true }],
    ["precio personalizado con motivo (D-20)", { isPriceOverride: true }],
    ["boarding pass (D-26a)", { boardingPassApplied: true }],
    ["precio base 0", { basePrice: 0 }],
  ] as const)("%s -> null", async (_nombre, overrides) => {
    const { payerId } = await payerWithInvitation();
    const candidate = await resolveInvitationDiscountCandidate(
      arbiterDeps(),
      ctx.tenant,
      candidateInput(payerId, overrides),
    );
    expect(candidate).toBeNull();
  });

  it("un pagador sin invitación ni vínculos -> null", async () => {
    const payer = await createMemberInPhysicalBranch(ctx, {
      status: "inactivo",
    });
    expect(
      await resolveInvitationDiscountCandidate(
        arbiterDeps(),
        ctx.tenant,
        candidateInput(payer.id),
      ),
    ).toBeNull();
  });
});

describe("resolveInvitationDiscountCandidate: tope en dinero por país (D-10c)", () => {
  it("tope ES=20000 sobre lista 360000 al 10%: nominal 36000, amount 20000, capApplied", async () => {
    await setInvitationSettings(app.db, ctx.tenant, {
      discountCapAmount: { ES: 20000 },
    });
    const { payerId } = await payerWithInvitation({ country: "ES" });
    const candidate = await resolveInvitationDiscountCandidate(
      arbiterDeps(),
      ctx.tenant,
      candidateInput(payerId, {
        plan: discountPlan({ country: "ES" }),
        basePrice: 360000,
      }),
    );
    expect(candidate).toMatchObject({
      percent: 10,
      nominalAmount: 36000,
      amount: 20000,
      capApplied: true,
    });
  });

  it("sin fila de tope: amount = nominal", async () => {
    const { payerId } = await payerWithInvitation({ country: "ES" });
    const candidate = await resolveInvitationDiscountCandidate(
      arbiterDeps(),
      ctx.tenant,
      candidateInput(payerId, {
        plan: discountPlan({ country: "ES" }),
        basePrice: 360000,
      }),
    );
    expect(candidate).toMatchObject({
      nominalAmount: 36000,
      amount: 36000,
      capApplied: false,
    });
  });

  it("el tope de AR no recorta un plan de ES (es por país del plan)", async () => {
    await setInvitationSettings(app.db, ctx.tenant, {
      discountCapAmount: { AR: 1000 },
    });
    const { payerId } = await payerWithInvitation({ country: "ES" });
    const candidate = await resolveInvitationDiscountCandidate(
      arbiterDeps(),
      ctx.tenant,
      candidateInput(payerId, { plan: discountPlan({ country: "ES" }) }),
    );
    expect(candidate).toMatchObject({ amount: 10000, capApplied: false });
  });
});

describe("resolveInvitationDiscountCandidate: vínculo y ventana tardía (D-05, D-13, D-26c)", () => {
  it("invitación vencida hace 20 días (ventana 30) -> trae linkToMaterialize; hace 40 -> null", async () => {
    const recent = await payerWithInvitation({ expiresInDays: -20 });
    const stale = await payerWithInvitation({ expiresInDays: -40 });
    const withLink = await resolveInvitationDiscountCandidate(
      arbiterDeps(),
      ctx.tenant,
      candidateInput(recent.payerId),
    );
    expect(withLink?.linkToMaterialize?.inviterId).toBe(recent.inviterId);
    expect(withLink?.amount).toBe(10000);
    expect(
      await resolveInvitationDiscountCandidate(
        arbiterDeps(),
        ctx.tenant,
        candidateInput(stale.payerId),
      ),
    ).toBeNull();
  });

  it("D-26c: con un vínculo previo (otro invitador) se usa ese vínculo y no se crea otro", async () => {
    const { payerId } = await payerWithInvitation();
    const original = await createInviterWithCode(ctx);
    await materializeInvitationLink(
      app.db,
      ctx.tenant,
      app.log,
      { invitationId: 0, inviterId: original.id, channel: "assisted" },
      payerId,
    );
    const candidate = await resolveInvitationDiscountCandidate(
      arbiterDeps(),
      ctx.tenant,
      candidateInput(payerId),
    );
    expect(candidate).toMatchObject({ percent: 10, amount: 10000 });
    expect(candidate?.linkToMaterialize).toBeNull();
  });

  it("vínculo pending del pagador: el candidato simula su cualificación (paridad con el preview de hoy)", async () => {
    const inviter = await createInviterWithCode(ctx);
    const payer = await createMemberInPhysicalBranch(ctx, {
      status: "freemium",
    });
    await app.db.insert(schema.referrals).values(
      tenantValues(ctx.tenant, {
        referrerId: inviter.id,
        referredId: payer.id,
        status: "pending" as const,
        attributionChannel: "assisted" as const,
      }),
    );
    const candidate = await resolveInvitationDiscountCandidate(
      arbiterDeps(),
      ctx.tenant,
      candidateInput(payer.id),
    );
    expect(candidate).toMatchObject({ percent: 10, amount: 10000 });
    expect(candidate?.linkToMaterialize).toBeNull();
  });

  it("invitador sin membresía vigente: descuento 0 pero el vínculo igual se ofrece para crear", async () => {
    const inviter = await createMemberInPhysicalBranch(ctx, {
      status: "inactivo",
    });
    const payer = await createMemberInPhysicalBranch(ctx, { status: "prueba" });
    await createInvitationRow(ctx, {
      inviterId: inviter.id,
      invitedUserId: payer.id,
      branchId: payer.branchId,
    });
    const candidate = await resolveInvitationDiscountCandidate(
      arbiterDeps(),
      ctx.tenant,
      candidateInput(payer.id),
    );
    expect(candidate).toMatchObject({ percent: 0, amount: 0 });
    expect(candidate?.linkToMaterialize?.inviterId).toBe(inviter.id);
    // Con monto 0 no compite: el árbitro no le da el descuento a nadie.
    expect(pickCoreCompetitor(null, candidate)).toBeNull();
  });

  it("lado invitador: 2 invitados activos -> 20% sin vínculo por crear", async () => {
    const inviter = await createInviterWithCode(ctx);
    const plan = await createMembershipPlan(ctx);
    for (let i = 0; i < 2; i++) {
      const invited = await createMemberInPhysicalBranch(ctx, {
        status: "activo",
      });
      await createActiveSub(ctx, { userId: invited.id, planId: plan.id });
      await app.db.insert(schema.referrals).values(
        tenantValues(ctx.tenant, {
          referrerId: inviter.id,
          referredId: invited.id,
          status: "qualified" as const,
          attributionChannel: "assisted" as const,
          qualifiedAt: new Date(),
        }),
      );
    }
    const candidate = await resolveInvitationDiscountCandidate(
      arbiterDeps(),
      ctx.tenant,
      candidateInput(inviter.id),
    );
    expect(candidate).toMatchObject({ percent: 20, amount: 20000 });
    expect(candidate?.linkToMaterialize).toBeNull();
  });

  it("invitee_percent=15 configurado: el invitado con invitación vigente recibe 15%", async () => {
    await setInvitationSettings(app.db, ctx.tenant, { inviteePercent: 15 });
    const { payerId } = await payerWithInvitation();
    const candidate = await resolveInvitationDiscountCandidate(
      arbiterDeps(),
      ctx.tenant,
      candidateInput(payerId),
    );
    expect(candidate).toMatchObject({ percent: 15, amount: 15000 });
  });
});

// ─── 4. Hook AURA por monto (D-21) ──────────────────────────────────────────

describe("pricingAdjustHandler compara AURA contra el competidor core por MONTO", () => {
  const AURA_TIER = { spend: 1000, percent: 10 }; // 10% de 100000 = 10000

  function auraCtx(
    userId: number,
    overrides: Partial<PricingAdjustCtx>,
  ): PricingAdjustCtx {
    return {
      callSite: "assign",
      userId,
      planId: 1,
      planCategory: "presencial",
      priceType: "regular",
      basePrice: BASE_PRICE,
      price: BASE_PRICE,
      priceLocked: null,
      competingDiscountAmount: null,
      commit: true,
      supports: { exclusiveBenefits: true, discounts: true },
      moduleInput: { auraSpend: AURA_TIER.spend },
      moduleOutput: {},
      applied: [],
      exclusive: false,
      resolvePriceType: async (t) => t,
      basePriceFor: () => BASE_PRICE,
      ...overrides,
    };
  }

  async function runHandler(ctxArg: PricingAdjustCtx): Promise<void> {
    await pricingAdjustHandler(ctxArg, {
      tenantId: ctx.tenant.tenantId,
      db: app.db,
      log: app.log,
    });
  }

  async function auraBalanceOf(userId: number): Promise<number> {
    const rows = await app.db.execute(
      sql`SELECT balance FROM aura_balances WHERE user_id = ${userId}`,
    );
    return Number(
      (rows[0] as unknown as Array<{ balance: number }>)[0]?.balance,
    );
  }

  async function userWithPoints(): Promise<number> {
    const user = await createMemberInPhysicalBranch(ctx, { status: "activo" });
    await seedAuraBalance(app, user.id, AURA_TIER.spend);
    return user.id;
  }

  it("commit: competidor 9000 < AURA 10000 -> AURA gana y gasta los puntos", async () => {
    const userId = await userWithPoints();
    const c = auraCtx(userId, { competingDiscountAmount: 9000 });
    await runHandler(c);
    expect(c.price).toBe(90000);
    expect(c.moduleOutput.auraDiscountPercent).toBe(10);
    expect(await auraBalanceOf(userId)).toBe(0);
  });

  it("commit: competidor 10000 = AURA 10000 (empate) -> gana el core y NO se gastan puntos (T-194-51)", async () => {
    const userId = await userWithPoints();
    const c = auraCtx(userId, { competingDiscountAmount: 10000 });
    await runHandler(c);
    expect(c.price).toBe(BASE_PRICE);
    expect(c.moduleOutput.auraDiscountPercent).toBeUndefined();
    expect(await auraBalanceOf(userId)).toBe(AURA_TIER.spend);
  });

  it("commit: competidor 20000 > AURA -> gana el core, sin gastar", async () => {
    const userId = await userWithPoints();
    const c = auraCtx(userId, { competingDiscountAmount: 20000 });
    await runHandler(c);
    expect(c.price).toBe(BASE_PRICE);
    expect(await auraBalanceOf(userId)).toBe(AURA_TIER.spend);
  });

  it("commit: sin competidor (null) AURA aplica como siempre", async () => {
    const userId = await userWithPoints();
    const c = auraCtx(userId, { competingDiscountAmount: null });
    await runHandler(c);
    expect(c.price).toBe(90000);
    expect(await auraBalanceOf(userId)).toBe(0);
  });

  it("commit: competidor con monto 0 NO bloquea a AURA salvo que AURA también valga 0", async () => {
    const userId = await userWithPoints();
    const c = auraCtx(userId, { competingDiscountAmount: 0 });
    await runHandler(c);
    expect(c.price).toBe(90000);
  });

  it("commit: la validación del tier corre igual aunque gane el core (400 gane quien gane)", async () => {
    const userId = await userWithPoints();
    const c = auraCtx(userId, {
      competingDiscountAmount: 50000,
      moduleInput: { auraSpend: 777 },
    });
    await expect(runHandler(c)).rejects.toThrow(/AURA invalido/);
  });

  it.each([
    ["9000 -> AURA gana", 9000, "aura", 90000],
    ["10000 (empate) -> gana el core", 10000, "none", BASE_PRICE],
    ["20000 -> gana el core", 20000, "none", BASE_PRICE],
  ] as const)(
    "preview: competidor %s",
    async (_nombre, competing, esperadoTipo, esperadoPrecio) => {
      const userId = await userWithPoints();
      const c = auraCtx(userId, {
        callSite: "preview",
        commit: false,
        competingDiscountAmount: competing,
      });
      await runHandler(c);
      expect(c.price).toBe(esperadoPrecio);
      expect(c.moduleOutput.discountType ?? "none").toBe(esperadoTipo);
      // Un preview jamás gasta puntos.
      expect(await auraBalanceOf(userId)).toBe(AURA_TIER.spend);
    },
  );
});

// ─── 4. Tramo de cableado (194-15): resolveChargeInvitation / prepare / settle ──

/** Vínculo de mentira para las tablas puras de `settleChargeDiscounts`. */
const LINK = { invitationId: 1, inviterId: 2, channel: "assisted" as const };

function preparedWith(
  invitation: InvitationDiscountCandidate | null,
  core: { kind: "partner" | "invitation"; amount: number } | null,
): PreparedChargeDiscounts {
  return {
    invitation,
    core,
    competingDiscountAmount: core?.amount ?? null,
  };
}

describe("settleChargeDiscounts: ganador, % nominal, tope y vínculo (D-08/D-10c/D-21/D-26a)", () => {
  const invitation = (
    overrides: Partial<InvitationDiscountCandidate> = {},
  ): InvitationDiscountCandidate => ({
    ...invitationCandidate(10000),
    linkToMaterialize: LINK,
    ...overrides,
  });

  it("gana la invitación: monto aplicado, % nominal, vínculo y ganador 'invitation'", () => {
    expect(
      settleChargeDiscounts({
        priceAfterFilter: BASE_PRICE,
        auraApplied: false,
        exclusive: false,
        prepared: preparedWith(invitation(), {
          kind: "invitation",
          amount: 10000,
        }),
      }),
    ).toEqual({
      finalPrice: 90000,
      winningDiscount: "invitation",
      invitationAmount: 10000,
      invitationPercent: 10,
      invitationCapped: false,
      partnerWon: false,
      partnerAmount: 0,
      linkToMaterialize: LINK,
    });
  });

  it("tope aplicado: `invitationCapped` y % nominal se conservan; solo si la invitación ganó", () => {
    const inv = invitation({ capApplied: true, amount: 5000 });
    const won = settleChargeDiscounts({
      priceAfterFilter: BASE_PRICE,
      auraApplied: false,
      exclusive: false,
      prepared: preparedWith(inv, { kind: "invitation", amount: 5000 }),
    });
    expect(won.invitationCapped).toBe(true);
    expect(won.invitationAmount).toBe(5000);
    expect(won.invitationPercent).toBe(10);

    // La invitación topeada pierde contra el partner: no se informa como topeada.
    const lost = settleChargeDiscounts({
      priceAfterFilter: BASE_PRICE,
      auraApplied: false,
      exclusive: false,
      prepared: preparedWith(inv, { kind: "partner", amount: 9000 }),
    });
    expect(lost.invitationCapped).toBe(false);
    expect(lost.invitationPercent).toBe(0);
    expect(lost.winningDiscount).toBe("partner");
  });

  it("AURA aplicó: nadie más descuenta, ganador 'aura', PERO el vínculo se ofrece (D-05)", () => {
    const result = settleChargeDiscounts({
      priceAfterFilter: 70000,
      auraApplied: true,
      exclusive: false,
      prepared: preparedWith(invitation(), {
        kind: "invitation",
        amount: 10000,
      }),
    });
    expect(result).toMatchObject({
      finalPrice: 70000,
      winningDiscount: "aura",
      invitationAmount: 0,
      invitationPercent: 0,
      partnerWon: false,
      linkToMaterialize: LINK,
    });
  });

  it("boarding pass (exclusive): el core se anula (D-26a), ganador 'boarding_pass' y el vínculo se ofrece", () => {
    const result = settleChargeDiscounts({
      priceAfterFilter: 70000,
      auraApplied: false,
      exclusive: true,
      prepared: preparedWith(invitation(), {
        kind: "invitation",
        amount: 10000,
      }),
    });
    expect(result).toMatchObject({
      finalPrice: 70000,
      winningDiscount: "boarding_pass",
      invitationAmount: 0,
      linkToMaterialize: LINK,
    });
  });

  it("gana el partner: partnerWon y partnerAmount, sin descuento de invitación", () => {
    const result = settleChargeDiscounts({
      priceAfterFilter: BASE_PRICE,
      auraApplied: false,
      exclusive: false,
      prepared: preparedWith(invitation(), { kind: "partner", amount: 20000 }),
    });
    expect(result).toMatchObject({
      finalPrice: 80000,
      winningDiscount: "partner",
      partnerWon: true,
      partnerAmount: 20000,
      invitationAmount: 0,
    });
  });

  it("sin core: ganador 'none' y el precio queda como lo dejó el filter", () => {
    const result = settleChargeDiscounts({
      priceAfterFilter: 50000,
      auraApplied: false,
      exclusive: false,
      prepared: preparedWith(null, null),
    });
    expect(result).toMatchObject({
      finalPrice: 50000,
      winningDiscount: "none",
      linkToMaterialize: null,
    });
  });

  it("el vínculo NO se ofrece si el cobro no cobra (precio final 0, T-194-53)", () => {
    const result = settleChargeDiscounts({
      priceAfterFilter: 0,
      auraApplied: false,
      exclusive: false,
      prepared: preparedWith(invitation({ percent: 0, amount: 0 }), null),
    });
    expect(result.finalPrice).toBe(0);
    expect(result.linkToMaterialize).toBeNull();
  });

  it("candidato solo-vínculo (monto 0): no descuenta pero ofrece el vínculo", () => {
    const result = settleChargeDiscounts({
      priceAfterFilter: BASE_PRICE,
      auraApplied: false,
      exclusive: false,
      prepared: preparedWith(
        invitation({ percent: 0, nominalAmount: 0, amount: 0 }),
        null,
      ),
    });
    expect(result.finalPrice).toBe(BASE_PRICE);
    expect(result.winningDiscount).toBe("none");
    expect(result.linkToMaterialize).toEqual(LINK);
  });
});

describe("resolveChargeInvitation: candidato solo-vínculo con override (D-20)", () => {
  it("override: sin descuento (% 0, monto 0) pero con el vínculo por crear", async () => {
    const { payerId, inviterId } = await payerWithInvitation();
    const candidate = await resolveChargeInvitation(
      arbiterDeps(),
      ctx.tenant,
      candidateInput(payerId, { isPriceOverride: true }),
    );
    expect(candidate).toMatchObject({
      percent: 0,
      nominalAmount: 0,
      amount: 0,
      capApplied: false,
    });
    expect(candidate?.linkToMaterialize).toMatchObject({ inviterId });
  });

  it("override sin invitación vigente -> null", async () => {
    const payer = await createMemberInPhysicalBranch(ctx, {
      status: "inactivo",
    });
    expect(
      await resolveChargeInvitation(
        arbiterDeps(),
        ctx.tenant,
        candidateInput(payer.id, { isPriceOverride: true }),
      ),
    ).toBeNull();
  });

  it.each([
    [
      "plan sin el flag (D-10b)",
      { plan: discountPlan({ allowsInvitationDiscount: false }) },
    ],
    ["alta prorrateada a fin de mes", { prorateToMonthEnd: true }],
    ["precio base 0", { basePrice: 0 }],
  ] as const)("override + %s -> null (ni vínculo)", async (_nombre, extra) => {
    const { payerId } = await payerWithInvitation();
    expect(
      await resolveChargeInvitation(
        arbiterDeps(),
        ctx.tenant,
        candidateInput(payerId, { isPriceOverride: true, ...extra }),
      ),
    ).toBeNull();
  });

  it("sin override delega en el candidato normal (10% de 100000)", async () => {
    const { payerId } = await payerWithInvitation();
    const candidate = await resolveChargeInvitation(
      arbiterDeps(),
      ctx.tenant,
      candidateInput(payerId),
    );
    expect(candidate).toMatchObject({ percent: 10, amount: 10000 });
  });
});

describe("prepareChargeDiscounts: candidatos -> ganador core -> monto para el filter", () => {
  it("partner 15% (15000) vs invitación 10% (10000): gana el partner y viaja 15000 al filter", async () => {
    const { payerId } = await payerWithInvitation();
    const prepared = await prepareChargeDiscounts(
      arbiterDeps(),
      ctx.tenant,
      candidateInput(payerId),
      { percent: 15 },
    );
    expect(prepared.core).toEqual({ kind: "partner", amount: 15000 });
    expect(prepared.competingDiscountAmount).toBe(15000);
    // La invitación perdida conserva el vínculo para materializar.
    expect(prepared.invitation?.linkToMaterialize).not.toBeNull();
  });

  it("empate partner 10% / invitación 10%: gana la invitación", async () => {
    const { payerId } = await payerWithInvitation();
    const prepared = await prepareChargeDiscounts(
      arbiterDeps(),
      ctx.tenant,
      candidateInput(payerId),
      { percent: 10 },
    );
    expect(prepared.core).toEqual({ kind: "invitation", amount: 10000 });
  });

  it("sin partner ni invitación: sin core y `competingDiscountAmount` null (AURA compite sola)", async () => {
    const payer = await createMemberInPhysicalBranch(ctx, {
      status: "inactivo",
    });
    const prepared = await prepareChargeDiscounts(
      arbiterDeps(),
      ctx.tenant,
      candidateInput(payer.id),
      null,
    );
    expect(prepared).toEqual({
      invitation: null,
      core: null,
      competingDiscountAmount: null,
    });
  });

  it("solo-vínculo (override) no compite: sin core aunque haya vínculo", async () => {
    const { payerId } = await payerWithInvitation();
    const prepared = await prepareChargeDiscounts(
      arbiterDeps(),
      ctx.tenant,
      candidateInput(payerId, { isPriceOverride: true }),
      null,
    );
    expect(prepared.core).toBeNull();
    expect(prepared.competingDiscountAmount).toBeNull();
    expect(prepared.invitation?.linkToMaterialize).not.toBeNull();
  });
});
