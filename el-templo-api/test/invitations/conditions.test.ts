/**
 * Bloque `invitations.conditions` del overview de "Mis invitados": los números
 * del programa salen de la configuración del servidor (la app no hardcodea
 * ninguno), por país de la sede del socio, y `canInvite` es la MISMA regla que la
 * activación (`assertInviterCanInvite`).
 *
 * Servicio contra MySQL real por worker + 1 caso HTTP. Fechas relativas a
 * `todayInTz(<tz de la sede>)`; ningún `users.id` hardcodeado.
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
import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { createTestApp, cleanAllTestData, getAuthToken } from "../helpers";
import { createMember } from "../subscriptions/_helpers";
import { shiftMonth, todayInTz } from "../../src/modules/shared/date-utils";
import { BOOKING_CANCEL_WINDOW_MINUTES } from "../../src/modules/scheduling/booking-constants";
import { ReferralService } from "../../src/modules/referrals/service";
import { InvitationRules } from "../../src/modules/referrals/invitation-rules";
import { InvitationRuleError } from "../../src/modules/referrals/invitation-types";
import { setInvitationSettings } from "../../src/modules/referrals/invitation-settings";
import type {
  InvitationConditionsView,
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

describe("Mis invitados — conditions", () => {
  let app: FastifyInstance;
  let ctx: InvitationsFixtureCtx;
  let service: ReferralService;
  let arBranch: { id: number; timezone: string };

  beforeAll(async () => {
    app = await createTestApp();
    ctx = fixtureCtx(app);
    service = new ReferralService(app.db, app.log);
  });

  afterAll(async () => {
    vi.useRealTimers();
    await cleanAllTestData(app);
    await resetInvitationSettings(ctx);
    await app.close();
  });

  beforeEach(async () => {
    vi.useRealTimers();
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
    arBranch = await ensurePhysicalBranch(ctx, "AR");
  });

  async function conditionsOf(
    userId: number,
  ): Promise<InvitationConditionsView> {
    const overview = await service.getReferralOverview(ctx.tenant, userId);
    return overview.invitations.conditions;
  }

  /** Invitaciones `active` de este mes (consumen cupo) hechas por `inviterId`. */
  async function consumeQuota(
    inviterId: number,
    branchId: number,
    times: number,
  ): Promise<void> {
    for (let n = 0; n < times; n++) {
      const invitee = await createMemberInPhysicalBranch(ctx, {
        status: "prueba",
      });
      await createInvitationRow(ctx, {
        inviterId,
        invitedUserId: invitee.id,
        branchId,
      });
    }
  }

  it("defaults del programa: valores exactos, sin tope en dinero y puede invitar", async () => {
    await createTrialPlan(ctx, { country: "AR", classesPerWeek: 3 });
    const inviter = await createInviterWithCode(ctx);

    const conditions = await conditionsOf(inviter.id);
    const month = todayInTz(arBranch.timezone).slice(0, 7);

    expect(conditions).toEqual({
      monthlyQuota: 2,
      quotaRenewsOn: `${shiftMonth(month, 1)}-01`,
      canInvite: true,
      cannotInviteReason: null,
      exMemberInactivityMonths: 6,
      reinviteWindowDays: 90,
      accessesPerInvitation: 3,
      accessBusinessDays: 10,
      latePurchaseWindowDays: 30,
      inviteePercent: 10,
      perInviteePercent: 10,
      maxPercentCap: 40,
      discountCapAmount: null,
      cancelWindowMinutes: 20,
    });
    expect(conditions.cancelWindowMinutes).toBe(BOOKING_CANCEL_WINDOW_MINUTES);
  });

  it("con settings propios y un tope en dinero AR: los números siguen a la configuración", async () => {
    await createTrialPlan(ctx, { country: "AR", classesPerWeek: 3 });
    await createTrialPlan(ctx, { country: "ES", classesPerWeek: 5 });
    await setInvitationSettings(app.db, ctx.tenant, {
      monthlyQuota: 4,
      accessBusinessDays: 7,
      reinviteWindowDays: 60,
      exMemberInactivityMonths: 12,
      latePurchaseWindowDays: 45,
      inviteePercent: 15,
      accessesPerInvitation: { AR: 6 },
      discountCapAmount: { AR: 50000, ES: 40 },
    });
    const inviter = await createInviterWithCode(ctx);

    const conditions = await conditionsOf(inviter.id);

    expect(conditions).toMatchObject({
      monthlyQuota: 4,
      canInvite: true,
      exMemberInactivityMonths: 12,
      reinviteWindowDays: 60,
      accessesPerInvitation: 6,
      accessBusinessDays: 7,
      latePurchaseWindowDays: 45,
      inviteePercent: 15,
      perInviteePercent: 10,
      maxPercentCap: 40,
      // El tope y la moneda son los del país del socio (AR), no los de ES.
      discountCapAmount: { amount: 50000, currency: "ARS" },
    });
  });

  it("un socio de una sede ES ve los accesos y el tope en EUR de España", async () => {
    await createTrialPlan(ctx, { country: "AR", classesPerWeek: 3 });
    await createTrialPlan(ctx, { country: "ES", classesPerWeek: 5 });
    await setInvitationSettings(app.db, ctx.tenant, {
      discountCapAmount: { AR: 50000, ES: 40 },
    });
    const esBranch = await ensurePhysicalBranch(ctx, "ES");
    const inviter = await createInviterWithCode(ctx, { country: "ES" });

    const conditions = await conditionsOf(inviter.id);
    const month = todayInTz(esBranch.timezone).slice(0, 7);

    expect(conditions.accessesPerInvitation).toBe(5);
    expect(conditions.discountCapAmount).toEqual({
      amount: 40,
      currency: "EUR",
    });
    expect(conditions.quotaRenewsOn).toBe(`${shiftMonth(month, 1)}-01`);
  });

  it("sin plan Invitación para el país del socio: accessesPerInvitation es null", async () => {
    await createTrialPlan(ctx, { country: "ES", classesPerWeek: 5 });
    const inviter = await createInviterWithCode(ctx);

    expect((await conditionsOf(inviter.id)).accessesPerInvitation).toBeNull();
  });

  it("sin membresía vigente: canInvite=false con inviter_not_member (aunque le sobre cupo)", async () => {
    const member = await createMemberInPhysicalBranch(ctx, {
      status: "freemium",
    });

    const conditions = await conditionsOf(member.id);

    expect(conditions.canInvite).toBe(false);
    expect(conditions.cannotInviteReason).toBe("inviter_not_member");
  });

  it("solo con accesos de invitación (plan is_trial) tampoco puede invitar", async () => {
    const member = await createMemberInPhysicalBranch(ctx, {
      status: "prueba",
    });
    const trial = await createTrialPlan(ctx, { country: "AR" });
    await createActiveSub(ctx, { userId: member.id, planId: trial.id });

    const conditions = await conditionsOf(member.id);

    expect(conditions.canInvite).toBe(false);
    expect(conditions.cannotInviteReason).toBe("inviter_not_member");
  });

  it("con membresía pero sin cupo: canInvite=false con inviter_quota_exhausted", async () => {
    const inviter = await createInviterWithCode(ctx);
    await consumeQuota(inviter.id, arBranch.id, 2);

    const conditions = await conditionsOf(inviter.id);

    expect(conditions.monthlyQuota).toBe(2);
    expect(conditions.canInvite).toBe(false);
    expect(conditions.cannotInviteReason).toBe("inviter_quota_exhausted");
  });

  it("con cupo parcial (1 de 2) sigue pudiendo invitar", async () => {
    const inviter = await createInviterWithCode(ctx);
    await consumeQuota(inviter.id, arBranch.id, 1);

    const conditions = await conditionsOf(inviter.id);

    expect(conditions.canInvite).toBe(true);
    expect(conditions.cannotInviteReason).toBeNull();
  });

  it("quotaRenewsOn cruza el año: en diciembre es el 1 de enero siguiente", async () => {
    const member = await createMemberInPhysicalBranch(ctx, {
      status: "freemium",
    });
    // Solo se fija `Date`: la DB y los timers de mysql2 siguen reales.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2027-12-15T15:00:00Z"));

    const conditions = await conditionsOf(member.id);

    expect(conditions.quotaRenewsOn).toBe("2028-01-01");
  });

  it("una misma regla: evaluateInviterCanInvite y assertInviterCanInvite coinciden", async () => {
    const rules = new InvitationRules(app.db, app.log);
    const sinMembresia = await createMemberInPhysicalBranch(ctx, {
      status: "freemium",
    });
    const agotado = await createInviterWithCode(ctx);
    await consumeQuota(agotado.id, arBranch.id, 2);
    const apto = await createInviterWithCode(ctx);

    expect(
      await rules.evaluateInviterCanInvite(ctx.tenant, sinMembresia.id),
    ).toEqual({ canInvite: false, reason: "inviter_not_member" });
    expect(
      await rules.evaluateInviterCanInvite(ctx.tenant, agotado.id),
    ).toEqual({
      canInvite: false,
      reason: "inviter_quota_exhausted",
    });
    expect(
      await rules.evaluateInviterCanInvite(ctx.tenant, 2_000_000_000),
    ).toEqual({ canInvite: false, reason: "inviter_not_found" });
    const ok = await rules.evaluateInviterCanInvite(ctx.tenant, apto.id);
    expect(ok.canInvite).toBe(true);

    await expect(
      rules.assertInviterCanInvite(ctx.tenant, sinMembresia.id),
    ).rejects.toMatchObject({ reason: "inviter_not_member" });
    await expect(
      rules.assertInviterCanInvite(ctx.tenant, agotado.id),
    ).rejects.toBeInstanceOf(InvitationRuleError);
    const quota = await rules.assertInviterCanInvite(ctx.tenant, apto.id);
    expect(quota).toMatchObject({ limit: 2, used: 0, remaining: 2 });
  });

  it("GET /api/members/referrals expone `conditions` con los valores del servidor", async () => {
    await createTrialPlan(ctx, { country: "AR", classesPerWeek: 3 });
    await setInvitationSettings(app.db, ctx.tenant, {
      monthlyQuota: 3,
      discountCapAmount: { AR: 25000 },
    });
    const member = await createMember(app, {
      email: "cond-inviter@test.com",
      branchId: arBranch.id,
    });
    const plan = await createMembershipPlan(ctx);
    await createActiveSub(ctx, {
      userId: member.id,
      planId: plan.id,
      branchId: arBranch.id,
      pricePaid: 10000,
    });
    const token = await getAuthToken(
      app,
      "cond-inviter@test.com",
      "pass123456",
    );

    const res = await app.inject({
      method: "GET",
      url: "/api/members/referrals",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as ReferralOverview;
    const month = todayInTz(arBranch.timezone).slice(0, 7);
    expect(body.invitations.conditions).toEqual({
      monthlyQuota: 3,
      quotaRenewsOn: `${shiftMonth(month, 1)}-01`,
      canInvite: true,
      cannotInviteReason: null,
      exMemberInactivityMonths: 6,
      reinviteWindowDays: 90,
      accessesPerInvitation: 3,
      accessBusinessDays: 10,
      latePurchaseWindowDays: 30,
      inviteePercent: 10,
      perInviteePercent: 10,
      maxPercentCap: 40,
      discountCapAmount: { amount: 25000, currency: "ARS" },
      cancelWindowMinutes: 20,
    });
    expect(body.invitations.quota.limit).toBe(
      body.invitations.conditions.monthlyQuota,
    );
  });
});
