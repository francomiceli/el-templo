/**
 * Fase 194-19 Task 2 — overview extendido de "Mis invitados" (cupo, link,
 * invitados con estado derivado, "invitado por" y descuento por lado).
 *
 * Servicio contra MySQL real por worker + 2 casos HTTP (ruta del socio y ficha
 * admin, que comparten `ReferralService.getReferralOverview`). Fechas siempre
 * relativas a `todayInTz(<tz de la sede>)`; ningún `users.id` hardcodeado.
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { createTestApp, cleanAllTestData, getAuthToken } from "../helpers";
import { createMember } from "../subscriptions/_helpers";
import * as schema from "../../src/db/schema";
import { addDays, todayInTz } from "../../src/modules/shared/date-utils";
import { tenantValues, tenantWhere } from "../../src/modules/shared/tenant";
import { ReferralService } from "../../src/modules/referrals/service";
import { loadTrainedBranches } from "../../src/modules/referrals/invitation-trained-branches";
import {
  buildInviteUrl,
  InvitationOverview,
} from "../../src/modules/referrals/invitation-overview";
import { invitationSettingKey } from "../../src/modules/referrals/invitation-settings";
import type {
  InviteeView,
  ReferralOverview,
} from "../../src/modules/referrals/types";
import {
  createActiveSub,
  createInvitationRow,
  createInviterWithCode,
  createMemberInPhysicalBranch,
  createMembershipPlan,
  createTrialPlan,
  ensurePhysicalBranch,
  fixtureCtx,
  resetInvitationSettings,
  type InvitationsFixtureCtx,
} from "./_helpers";

const DAY_MS = 24 * 60 * 60 * 1000;
const MEMBER_PASSWORD = "pass123456";

describe("Fase 194-19 — overview de invitaciones", () => {
  let app: FastifyInstance;
  let ctx: InvitationsFixtureCtx;
  let service: ReferralService;
  let adminToken: string;
  let branch: { id: number; timezone: string };
  let today: string;
  let trialPlanId: number;
  let membershipPlanId: number;

  beforeAll(async () => {
    app = await createTestApp();
    ctx = fixtureCtx(app);
    service = new ReferralService(app.db, app.log);
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
  });

  afterAll(async () => {
    await cleanAllTestData(app);
    await resetInvitationSettings(ctx);
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    await resetInvitationSettings(ctx);
    // Resembrar la calibración: `cleanAllTestData` vacía aura_config y system_settings.
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
    branch = await ensurePhysicalBranch(ctx, "AR");
    today = todayInTz(branch.timezone);
    trialPlanId = (await createTrialPlan(ctx)).id;
    membershipPlanId = (await createMembershipPlan(ctx)).id;
  });

  // ─── Fixtures ──────────────────────────────────────────────────────────

  /** Sub de accesos (plan is_trial) con el cupo N pedido. */
  async function accessSub(
    userId: number,
    opts: { budget: number; remaining: number; endOffsetDays?: number },
  ): Promise<number> {
    const sub = await createActiveSub(ctx, {
      userId,
      planId: trialPlanId,
      branchId: branch.id,
      startOffsetDays: -3,
      endOffsetDays: opts.endOffsetDays ?? 3,
    });
    await app.db
      .update(schema.subscriptions)
      .set({
        classesBudget: opts.budget,
        classesRemaining: opts.remaining,
      })
      .where(
        and(
          tenantWhere(schema.subscriptions, ctx.tenant),
          eq(schema.subscriptions.id, sub.id),
        ),
      );
    return sub.id;
  }

  interface InviteeSpec {
    /** Offset (días) del último día de accesos respecto de hoy. */
    expiresOffset?: number;
    budget?: number;
    remaining?: number;
    /** Compra paga posterior a la activación. */
    purchase?: "vigente" | "vencida";
    activatedDaysAgo?: number;
    channel?: "self_service" | "assisted";
    status?: "active" | "voided";
  }

  /** Invitado con invitación (+ sub de accesos y, si se pide, una compra). */
  async function inviteWith(
    inviterId: number,
    spec: InviteeSpec = {},
  ): Promise<{ userId: number; invitationId: number }> {
    const invitee = await createMemberInPhysicalBranch(ctx, {
      status: "prueba",
    });
    const subscriptionId = await accessSub(invitee.id, {
      budget: spec.budget ?? 4,
      remaining: spec.remaining ?? spec.budget ?? 4,
      endOffsetDays: spec.expiresOffset ?? 3,
    });
    const invitation = await createInvitationRow(ctx, {
      inviterId,
      invitedUserId: invitee.id,
      branchId: branch.id,
      subscriptionId,
      activatedAt: new Date(Date.now() - (spec.activatedDaysAgo ?? 5) * DAY_MS),
      accessStartsOn: addDays(today, -(spec.activatedDaysAgo ?? 5)),
      accessExpiresOn: addDays(today, spec.expiresOffset ?? 3),
      channel: spec.channel,
      status: spec.status,
    });
    if (spec.purchase === "vigente") {
      await createActiveSub(ctx, {
        userId: invitee.id,
        planId: membershipPlanId,
        branchId: branch.id,
        pricePaid: 10000,
        endOffsetDays: 20,
      });
    } else if (spec.purchase === "vencida") {
      await createActiveSub(ctx, {
        userId: invitee.id,
        planId: membershipPlanId,
        branchId: branch.id,
        pricePaid: 10000,
        startOffsetDays: -10,
        endOffsetDays: -3,
        status: "expired",
      });
    }
    return { userId: invitee.id, invitationId: invitation.id };
  }

  async function link(
    referrerId: number,
    referredId: number,
    status: "pending" | "qualified" | "revoked",
  ): Promise<void> {
    await app.db.execute(
      sql`INSERT INTO referrals (tenant_id, referrer_id, referred_id, status, attribution_channel, qualified_at)
          VALUES (${ctx.tenant.tenantId}, ${referrerId}, ${referredId}, ${status}, 'assisted', NOW())`,
    );
  }

  async function overviewOf(userId: number): Promise<ReferralOverview> {
    return service.getReferralOverview(ctx.tenant, userId);
  }

  function byUser(
    invitees: InviteeView[],
    userId: number,
  ): InviteeView | undefined {
    return invitees.find((invitee) => invitee.userId === userId);
  }

  // ─── Cupo y link ───────────────────────────────────────────────────────

  it("cupo del mes: con 2 invitaciones activas remaining=0; las anuladas no cuentan; el link sale server-side", async () => {
    const inviter = await createInviterWithCode(ctx);
    await inviteWith(inviter.id);
    await inviteWith(inviter.id);
    await inviteWith(inviter.id, { status: "voided" });

    const overview = await overviewOf(inviter.id);

    expect(overview.invitations.quota).toEqual({
      limit: 2,
      used: 2,
      remaining: 0,
      month: today.slice(0, 7),
    });
    expect(overview.invitations.inviteUrl).toBe(buildInviteUrl(inviter.code));
    expect(overview.invitations.inviteUrl).toMatch(
      new RegExp(`/invitacion/${inviter.code}$`),
    );
    // La anulada no se lista.
    expect(overview.invitations.invitees).toHaveLength(2);
  });

  it("sin invitaciones: cupo completo, lista vacía e invitedBy null", async () => {
    const member = await createMemberInPhysicalBranch(ctx, {
      status: "activo",
    });
    const overview = await overviewOf(member.id);

    expect(overview.invitations.quota.remaining).toBe(2);
    expect(overview.invitations.invitees).toEqual([]);
    expect(overview.invitations.discount).toEqual({
      percent: 0,
      activeInvitees: 0,
    });
    expect(overview.invitedBy).toBeNull();
    expect(overview.invitations.inviteUrl).toContain("/invitacion/");
  });

  it("buildInviteUrl: respeta FRONTEND_URL (sin barra final) y cae al default", () => {
    const original = process.env.FRONTEND_URL;
    try {
      process.env.FRONTEND_URL = "https://front.example.test/";
      expect(buildInviteUrl("ANA-1234")).toBe(
        "https://front.example.test/invitacion/ANA-1234",
      );
      delete process.env.FRONTEND_URL;
      expect(buildInviteUrl("ANA-1234")).toBe(
        "https://app.eltemplo.org/invitacion/ANA-1234",
      );
    } finally {
      if (original === undefined) delete process.env.FRONTEND_URL;
      else process.env.FRONTEND_URL = original;
    }
  });

  // ─── Estados derivados y x/N ───────────────────────────────────────────

  it("los 5 estados derivados con x/N leído de classes_budget (N=4, no 3)", async () => {
    const inviter = await createInviterWithCode(ctx);
    const socio = await inviteWith(inviter.id, {
      remaining: 1,
      purchase: "vigente",
    });
    const inactivo = await inviteWith(inviter.id, { purchase: "vencida" });
    const vencidoFecha = await inviteWith(inviter.id, {
      expiresOffset: -2,
      remaining: 3,
    });
    const vencidoAgotado = await inviteWith(inviter.id, { remaining: 0 });
    const entrenando = await inviteWith(inviter.id, { remaining: 2 });
    const invitado = await inviteWith(inviter.id, { remaining: 4 });

    const { invitees } = (await overviewOf(inviter.id)).invitations;

    expect(invitees).toHaveLength(6);
    expect(byUser(invitees, socio.userId)?.state).toBe("socio_activo");
    expect(byUser(invitees, inactivo.userId)?.state).toBe("inactivo");
    expect(byUser(invitees, vencidoFecha.userId)?.state).toBe("vencido");
    expect(byUser(invitees, vencidoAgotado.userId)?.state).toBe("vencido");
    expect(byUser(invitees, entrenando.userId)?.state).toBe("entrenando");
    expect(byUser(invitees, invitado.userId)?.state).toBe("invitado");

    // x/N: N sale de classes_budget (4), usados = budget - remaining.
    expect(byUser(invitees, entrenando.userId)).toMatchObject({
      accessesUsed: 2,
      accessesBudget: 4,
      source: "invitation",
    });
    expect(byUser(invitees, invitado.userId)).toMatchObject({
      accessesUsed: 0,
      accessesBudget: 4,
    });
    expect(byUser(invitees, vencidoAgotado.userId)).toMatchObject({
      accessesUsed: 4,
      accessesBudget: 4,
    });
  });

  it("'compró' exige sub PAGA, no-trial y creada desde la activación: una bonificada ($0) o una anterior no cuentan", async () => {
    const inviter = await createInviterWithCode(ctx);

    // Sub de membresía de $0 (bonificada de staff) creada después de activar.
    const bonificada = await inviteWith(inviter.id, { remaining: 4 });
    await createActiveSub(ctx, {
      userId: bonificada.userId,
      planId: membershipPlanId,
      branchId: branch.id,
      pricePaid: 0,
      endOffsetDays: 20,
    });

    // Sub paga ANTERIOR a la activación (ex socio): no es una compra de esta invitación.
    const anterior = await inviteWith(inviter.id, { remaining: 4 });
    await createActiveSub(ctx, {
      userId: anterior.userId,
      planId: membershipPlanId,
      branchId: branch.id,
      pricePaid: 10000,
      startOffsetDays: -90,
      endOffsetDays: -60,
      status: "expired",
      createdAt: new Date(Date.now() - 100 * DAY_MS),
    });

    const { invitees } = (await overviewOf(inviter.id)).invitations;

    expect(byUser(invitees, bonificada.userId)?.state).toBe("invitado");
    expect(byUser(invitees, anterior.userId)?.state).toBe("invitado");
  });

  it("la lista sale de la más reciente a la más vieja y trae vencimiento, invitationId y activación ISO", async () => {
    const inviter = await createInviterWithCode(ctx);
    const old = await inviteWith(inviter.id, { activatedDaysAgo: 8 });
    const recent = await inviteWith(inviter.id, { activatedDaysAgo: 1 });

    const { invitees } = (await overviewOf(inviter.id)).invitations;

    expect(invitees.map((invitee) => invitee.userId)).toEqual([
      recent.userId,
      old.userId,
    ]);
    expect(invitees[0].invitationId).toBe(recent.invitationId);
    expect(invitees[0].accessExpiresOn).toBe(addDays(today, 3));
    expect(invitees[0].activatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("privacidad: el invitado expone solo nombre de pila + inicial, sin teléfono/DNI/email (T-194-63)", async () => {
    const inviter = await createInviterWithCode(ctx);
    await inviteWith(inviter.id);

    const [invitee] = (await overviewOf(inviter.id)).invitations.invitees;

    expect(Object.keys(invitee).sort()).toEqual(
      [
        "accessExpiresOn",
        "accessesBudget",
        "accessesUsed",
        "activatedAt",
        "firstName",
        "invitationId",
        "lastInitial",
        "source",
        "state",
        "sumaDescuento",
        "userId",
      ].sort(),
    );
    expect(invitee.firstName).toBe("Fisico");
    expect(invitee.lastInitial).toBe("F");
  });

  // ─── Legado (SC-6) ─────────────────────────────────────────────────────

  it("vínculos heredados (sin invitación) siguen listados con source legacy_link", async () => {
    const inviter = await createInviterWithCode(ctx);
    const viaInvitation = await inviteWith(inviter.id, { remaining: 4 });

    const legacyActive = await createMemberInPhysicalBranch(ctx, {
      status: "activo",
    });
    await createActiveSub(ctx, {
      userId: legacyActive.id,
      planId: membershipPlanId,
      pricePaid: 10000,
    });
    await link(inviter.id, legacyActive.id, "qualified");

    const legacyInactive = await createMemberInPhysicalBranch(ctx, {
      status: "inactivo",
    });
    await link(inviter.id, legacyInactive.id, "qualified");

    const legacyPending = await createMemberInPhysicalBranch(ctx, {
      status: "freemium",
    });
    await link(inviter.id, legacyPending.id, "pending");

    const revoked = await createMemberInPhysicalBranch(ctx, {
      status: "freemium",
    });
    await link(inviter.id, revoked.id, "revoked");

    const { invitees, discount } = (await overviewOf(inviter.id)).invitations;

    // Primero las invitaciones, después el legado.
    expect(invitees[0].userId).toBe(viaInvitation.userId);
    expect(invitees).toHaveLength(4);
    expect(byUser(invitees, legacyActive.id)).toMatchObject({
      source: "legacy_link",
      invitationId: null,
      state: "socio_activo",
      sumaDescuento: true,
      accessesUsed: null,
      accessesBudget: null,
      activatedAt: null,
      accessExpiresOn: null,
    });
    expect(byUser(invitees, legacyInactive.id)).toMatchObject({
      source: "legacy_link",
      state: "inactivo",
      sumaDescuento: false,
    });
    expect(byUser(invitees, legacyPending.id)).toMatchObject({
      source: "legacy_link",
      state: "invitado",
    });
    expect(byUser(invitees, revoked.id)).toBeUndefined();
    expect(discount.activeInvitees).toBe(1);
  });

  it("un invitado con invitación Y vínculo aparece UNA sola vez (source invitation)", async () => {
    const inviter = await createInviterWithCode(ctx);
    const invitee = await inviteWith(inviter.id, { purchase: "vigente" });
    await link(inviter.id, invitee.userId, "qualified");

    const { invitees } = (await overviewOf(inviter.id)).invitations;

    expect(invitees).toHaveLength(1);
    expect(invitees[0]).toMatchObject({
      source: "invitation",
      state: "socio_activo",
      sumaDescuento: true,
    });
  });

  // ─── Descuento por lado ────────────────────────────────────────────────

  it("descuento: activeInvitees cuenta solo vínculos qualified con el invitado cubierto; % = el del cobro y desglose por lado", async () => {
    const inviter = await createInviterWithCode(ctx);
    const covered1 = await inviteWith(inviter.id, { purchase: "vigente" });
    await link(inviter.id, covered1.userId, "qualified");

    const covered2 = await createMemberInPhysicalBranch(ctx, {
      status: "activo",
    });
    await createActiveSub(ctx, {
      userId: covered2.id,
      planId: membershipPlanId,
      pricePaid: 10000,
    });
    await link(inviter.id, covered2.id, "qualified");

    const lapsed = await createMemberInPhysicalBranch(ctx, {
      status: "inactivo",
    });
    await createActiveSub(ctx, {
      userId: lapsed.id,
      planId: membershipPlanId,
      pricePaid: 10000,
      startOffsetDays: -40,
      endOffsetDays: -10,
      status: "expired",
    });
    await link(inviter.id, lapsed.id, "qualified");

    const overview = await overviewOf(inviter.id);
    const canonical = await service.computeReferralDiscountPercent(
      ctx.tenant,
      inviter.id,
    );

    expect(overview.invitations.discount.activeInvitees).toBe(2);
    expect(overview.invitations.discount.percent).toBe(canonical);
    expect(overview.invitations.discount.percent).toBe(20);
    expect(overview.discount.bySide).toEqual({
      inviter: { perLinkPercent: 10, activeCount: 2, percent: 20 },
      invitee: { perLinkPercent: 10, activeCount: 0, percent: 0 },
    });
    expect(
      overview.invitations.invitees.filter((invitee) => invitee.sumaDescuento),
    ).toHaveLength(2);
  });

  it("descuento por lado: el % del invitado sale de invitations.invitee_percent y no del del invitador", async () => {
    await app.db.insert(schema.tenantSettings).values(
      tenantValues(ctx.tenant, {
        settingKey: invitationSettingKey("inviteePercent"),
        settingValue: "15",
      }),
    );
    const inviter = await createInviterWithCode(ctx);
    const invitee = await inviteWith(inviter.id, { purchase: "vigente" });
    await link(inviter.id, invitee.userId, "qualified");

    const asInvitee = await overviewOf(invitee.userId);
    expect(asInvitee.discount.bySide.invitee).toEqual({
      perLinkPercent: 15,
      activeCount: 1,
      percent: 15,
    });
    expect(asInvitee.discount.bySide.inviter.activeCount).toBe(0);
    expect(asInvitee.discount.percent).toBe(15);

    const asInviter = await overviewOf(inviter.id);
    expect(asInviter.discount.bySide.inviter).toEqual({
      perLinkPercent: 10,
      activeCount: 1,
      percent: 10,
    });
    // El campo histórico sigue siendo el % del lado invitador.
    expect(asInviter.discount.perLinkPercent).toBe(10);
  });

  // ─── "Invitado por" ────────────────────────────────────────────────────

  it("invitedBy: invitador, x/N, vencimiento, etapa y sedes donde entrenó (solo dentro de la ventana y solo del invitado)", async () => {
    const inviter = await createInviterWithCode(ctx);
    const branchB = await ensurePhysicalBranch(ctx, "ES");
    const names = await branchNames([branch.id, branchB.id]);

    const first = await inviteWith(inviter.id, {
      remaining: 3,
      activatedDaysAgo: 3,
      channel: "assisted",
    });
    const second = await inviteWith(inviter.id, { activatedDaysAgo: 3 });

    // first: A dentro de la ventana; B fuera (después del vencimiento).
    await attend(first.userId, branch.id, addDays(today, -1));
    await attend(first.userId, branchB.id, addDays(today, 5));
    // second asiste a B dentro de la ventana de `first`: no debe contarse en `first`.
    await attend(second.userId, branchB.id, addDays(today, -1));

    const firstOverview = await overviewOf(first.userId);
    expect(firstOverview.invitedBy).toEqual({
      inviterId: inviter.id,
      inviterName: expect.stringContaining("Fixture"),
      activatedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      accessesUsed: 1,
      accessesBudget: 4,
      accessExpiresOn: addDays(today, 3),
      stage: "entrenando",
      branchesTrained: [names.get(branch.id)],
      channel: "assisted",
    });

    // Y el helper batch resuelve ambas invitaciones en UNA llamada.
    const batch = await loadTrainedBranches(app.db, ctx.tenant, [
      first.invitationId,
      second.invitationId,
    ]);
    expect(batch.get(first.invitationId)).toEqual([names.get(branch.id)]);
    expect(batch.get(second.invitationId)).toEqual([names.get(branchB.id)]);
  });

  it("invitedBy: varias sedes se devuelven sin repetir y ordenadas por nombre", async () => {
    const inviter = await createInviterWithCode(ctx);
    const branchB = await ensurePhysicalBranch(ctx, "ES");
    const names = await branchNames([branch.id, branchB.id]);
    const invitee = await inviteWith(inviter.id, { activatedDaysAgo: 4 });

    await attend(invitee.userId, branch.id, addDays(today, -2));
    await attend(invitee.userId, branch.id, addDays(today, -1));
    await attend(invitee.userId, branchB.id, addDays(today, -1));

    const overview = await overviewOf(invitee.userId);
    expect(overview.invitedBy?.branchesTrained).toEqual(
      [names.get(branch.id), names.get(branchB.id)].sort(),
    );
  });

  it("invitedBy: etapa vencido (por fecha), convertido (converted_at) y sin invitación activa -> null", async () => {
    const inviter = await createInviterWithCode(ctx);

    const expired = await inviteWith(inviter.id, { expiresOffset: -1 });
    expect((await overviewOf(expired.userId)).invitedBy?.stage).toBe("vencido");

    const converted = await inviteWith(inviter.id, { expiresOffset: -1 });
    await app.db
      .update(schema.invitations)
      .set({ convertedAt: new Date() })
      .where(
        and(
          tenantWhere(schema.invitations, ctx.tenant),
          eq(schema.invitations.id, converted.invitationId),
        ),
      );
    expect((await overviewOf(converted.userId)).invitedBy?.stage).toBe(
      "convertido",
    );

    const voided = await inviteWith(inviter.id, { status: "voided" });
    expect((await overviewOf(voided.userId)).invitedBy).toBeNull();
  });

  // ─── Sin N+1 ───────────────────────────────────────────────────────────

  it("la cantidad de queries del bloque no depende del número de invitados (batch)", async () => {
    const small = await createInviterWithCode(ctx);
    await inviteWith(small.id);
    const legacySmall = await createMemberInPhysicalBranch(ctx, {
      status: "activo",
    });
    await link(small.id, legacySmall.id, "pending");

    const big = await createInviterWithCode(ctx);
    for (let n = 0; n < 5; n++) {
      await inviteWith(big.id, { remaining: n % 4 });
    }
    for (let n = 0; n < 4; n++) {
      const legacy = await createMemberInPhysicalBranch(ctx, {
        status: "activo",
      });
      await link(big.id, legacy.id, "pending");
    }

    const countQueries = async (userId: number): Promise<number> => {
      const spy = vi.spyOn(app.dbPool, "query");
      try {
        await new InvitationOverview(app.db, app.log).build(
          ctx.tenant,
          userId,
          { referralCode: "X", links: [], percent: 0 },
        );
        return spy.mock.calls.length;
      } finally {
        spy.mockRestore();
      }
    };

    const smallCount = await countQueries(small.id);
    const bigCount = await countQueries(big.id);
    expect(smallCount).toBeGreaterThan(0);
    // `links: []` deja afuera el legado: se compara el camino de invitaciones
    // (1 vs 5 filas) con las mismas queries.
    expect(bigCount).toBe(smallCount);

    // Con legado: el costo extra es constante (una query de nombres + coberturas).
    const links = async (userId: number): Promise<number> => {
      const rows = await app.db
        .select({
          referrerId: schema.referrals.referrerId,
          referredId: schema.referrals.referredId,
          status: schema.referrals.status,
        })
        .from(schema.referrals)
        .where(
          and(
            tenantWhere(schema.referrals, ctx.tenant),
            eq(schema.referrals.referrerId, userId),
          ),
        );
      const spy = vi.spyOn(app.dbPool, "query");
      try {
        await new InvitationOverview(app.db, app.log).build(
          ctx.tenant,
          userId,
          { referralCode: "X", links: rows, percent: 0 },
        );
        return spy.mock.calls.length;
      } finally {
        spy.mockRestore();
      }
    };
    expect(await links(big.id)).toBe(await links(small.id));
  });

  // ─── HTTP: ruta del socio y ficha admin ────────────────────────────────

  it("GET /api/members/referrals y la ficha admin devuelven el mismo bloque `invitations`", async () => {
    const member = await createMember(app, {
      email: "ov-inviter@test.com",
      branchId: branch.id,
    });
    await createActiveSub(ctx, {
      userId: member.id,
      planId: membershipPlanId,
      branchId: branch.id,
      pricePaid: 10000,
    });
    const invited = await inviteWith(member.id, { remaining: 3 });

    const token = await getAuthToken(
      app,
      "ov-inviter@test.com",
      MEMBER_PASSWORD,
    );
    const res = await app.inject({
      method: "GET",
      url: "/api/members/referrals",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as ReferralOverview;

    expect(body.invitations.quota.remaining).toBe(1);
    expect(body.invitations.inviteUrl).toMatch(
      new RegExp(`/invitacion/${body.referralCode}$`),
    );
    expect(body.invitations.invitees).toHaveLength(1);
    expect(body.invitations.invitees[0]).toMatchObject({
      userId: invited.userId,
      state: "entrenando",
      accessesUsed: 1,
      accessesBudget: 4,
    });
    expect(body.invitedBy).toBeNull();
    expect(body.discount.bySide.inviter.perLinkPercent).toBe(10);

    const adminRes = await app.inject({
      method: "GET",
      url: `/api/admin/members/${member.id}/referrals`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(adminRes.statusCode).toBe(200);
    const adminBody = JSON.parse(adminRes.body) as ReferralOverview;
    expect(adminBody.invitations).toEqual(body.invitations);
    expect(adminBody.invitedBy).toBeNull();
  });

  it("GET /api/members/referrals: el invitado ve invitedBy con su invitador (userId del token, IDOR)", async () => {
    const inviter = await createInviterWithCode(ctx);
    const invitee = await createMember(app, {
      email: "ov-invitee@test.com",
      branchId: branch.id,
    });
    const subscriptionId = await accessSub(invitee.id, {
      budget: 4,
      remaining: 4,
    });
    await createInvitationRow(ctx, {
      inviterId: inviter.id,
      invitedUserId: invitee.id,
      branchId: branch.id,
      subscriptionId,
      accessStartsOn: addDays(today, -1),
      accessExpiresOn: addDays(today, 4),
    });

    const token = await getAuthToken(
      app,
      "ov-invitee@test.com",
      MEMBER_PASSWORD,
    );
    const res = await app.inject({
      method: "GET",
      url: "/api/members/referrals",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as ReferralOverview;

    expect(body.invitedBy).toMatchObject({
      inviterId: inviter.id,
      accessesUsed: 0,
      accessesBudget: 4,
      stage: "invitado",
      channel: "self_service",
      branchesTrained: [],
    });
    // Y el invitador (otro usuario) no se filtra al overview del invitado.
    expect(body.invitations.invitees).toEqual([]);
  });

  // ─── Helpers de DB del test ────────────────────────────────────────────

  async function attend(
    userId: number,
    branchId: number,
    sessionDate: string,
  ): Promise<void> {
    await app.db.insert(schema.attendance).values(
      tenantValues(ctx.tenant, {
        memberId: userId,
        branchId,
        sessionDate,
        source: "manual" as const,
      }),
    );
  }

  async function branchNames(ids: number[]): Promise<Map<number, string>> {
    const rows = await app.db
      .select({ id: schema.branches.id, name: schema.branches.name })
      .from(schema.branches)
      .where(
        and(
          tenantWhere(schema.branches, ctx.tenant),
          inArray(schema.branches.id, ids),
        ),
      );
    return new Map(rows.map((row) => [row.id, row.name]));
  }
});
