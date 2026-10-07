/**
 * Fase 194 Plan 08 (D-10, D-10d, T-194-27) — cupo mensual del invitador y
 * condición de "socio con membresía vigente" para poder invitar.
 *
 * Servicio contra MySQL real por worker. Sin concurrencia: la carrera entre dos
 * activaciones simultáneas es del lock de 194-09.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { and, eq, like } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { createTestApp, cleanAllTestData } from "../helpers";
import * as schema from "../../src/db/schema";
import { todayInTz } from "../../src/modules/shared/date-utils";
import { tenantWhere } from "../../src/modules/shared/tenant";
import {
  InvitationService,
  subtractMonths,
} from "../../src/modules/referrals/invitation-service";
import {
  InvitationRuleError,
  type InvitationIneligibleReason,
} from "../../src/modules/referrals/invitation-types";
import {
  INVITATION_SETTINGS_PREFIX,
  setInvitationSettings,
} from "../../src/modules/referrals/invitation-settings";
import {
  buildInvitationServices,
  createActiveSub,
  createInvitationRow,
  createInviterWithCode,
  createMemberInPhysicalBranch,
  createMemberInVirtualBranch,
  createMembershipPlan,
  createTrialPlan,
  ensurePhysicalBranch,
  fixtureCtx,
  resetInvitationSettings as resetSettingsOf,
  uniquePhone10,
  type InvitationsFixtureCtx,
} from "./_helpers";

describe("Fase 194 D-10 / D-10d — cupo del invitador", () => {
  let app: FastifyInstance;
  let ctx: InvitationsFixtureCtx;
  let service: InvitationService;

  beforeAll(async () => {
    app = await createTestApp();
    ctx = fixtureCtx(app);
    service = new InvitationService(app.db, app.log);
  });

  afterAll(async () => {
    await cleanAllTestData(app);
    await resetInvitationSettings();
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    await resetInvitationSettings();
  });

  /** `tenant_settings` no está en TABLES_TO_CLEAN: se resetea solo el namespace. */
  async function resetInvitationSettings(): Promise<void> {
    await app.db
      .delete(schema.tenantSettings)
      .where(
        and(
          tenantWhere(schema.tenantSettings, ctx.tenant),
          like(
            schema.tenantSettings.settingKey,
            `${INVITATION_SETTINGS_PREFIX}%`,
          ),
        ),
      );
  }

  /** Socio con membresía presencial vigente (no is_trial). */
  async function createInviter(
    country: "AR" | "ES" = "AR",
  ): Promise<{ id: number; branchId: number }> {
    const inviter = await createMemberInPhysicalBranch(ctx, {
      country,
      status: "activo",
    });
    const plan = await createMembershipPlan(ctx, { country });
    await createActiveSub(ctx, { userId: inviter.id, planId: plan.id });
    return inviter;
  }

  async function addInvitations(
    inviter: { id: number; branchId: number },
    n: number,
    opts: { status?: "active" | "voided"; quotaMonth?: string } = {},
  ): Promise<void> {
    for (let i = 0; i < n; i += 1) {
      const invited = await createMemberInVirtualBranch(ctx);
      await createInvitationRow(ctx, {
        inviterId: inviter.id,
        invitedUserId: invited.id,
        branchId: inviter.branchId,
        status: opts.status,
        quotaMonth: opts.quotaMonth,
      });
    }
  }

  async function reasonOf(promise: Promise<unknown>): Promise<string> {
    try {
      await promise;
    } catch (err: unknown) {
      if (err instanceof InvitationRuleError) return err.reason;
      throw err;
    }
    return "no-error";
  }

  it("sin invitaciones: cupo 2 de 2 y mes en la tz de su sede", async () => {
    const inviter = await createInviter();
    const branch = await ensurePhysicalBranch(ctx, "AR");

    const quota = await service.rules.getInviterQuota(ctx.tenant, inviter.id);

    expect(quota).toEqual({
      limit: 2,
      used: 0,
      remaining: 2,
      month: todayInTz(branch.timezone).slice(0, 7),
    });
  });

  it("con 2 activas este mes: remaining 0 y assertInviterCanInvite da inviter_quota_exhausted", async () => {
    const inviter = await createInviter();
    await addInvitations(inviter, 2);

    const quota = await service.rules.getInviterQuota(ctx.tenant, inviter.id);
    expect(quota.used).toBe(2);
    expect(quota.remaining).toBe(0);

    const err = await service.rules
      .assertInviterCanInvite(ctx.tenant, inviter.id)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(InvitationRuleError);
    expect((err as InvitationRuleError).reason).toBe("inviter_quota_exhausted");
    // 409 + mensaje en español, sin la palabra "referido".
    expect((err as InvitationRuleError).statusCode).toBe(409);
    expect((err as InvitationRuleError).message).not.toMatch(/referid/i);
  });

  it("1 activa + 1 anulada: used 1 (las voided no cuentan) y todavía puede invitar", async () => {
    const inviter = await createInviter();
    await addInvitations(inviter, 1);
    await addInvitations(inviter, 1, { status: "voided" });

    const quota = await service.rules.assertInviterCanInvite(
      ctx.tenant,
      inviter.id,
    );

    expect(quota.used).toBe(1);
    expect(quota.remaining).toBe(1);
  });

  it("2 activas el mes pasado: este mes tiene el cupo completo (no acumula ni arrastra)", async () => {
    const inviter = await createInviter();
    const branch = await ensurePhysicalBranch(ctx, "AR");
    const lastMonth = subtractMonths(todayInTz(branch.timezone), 1).slice(0, 7);
    await addInvitations(inviter, 2, { quotaMonth: lastMonth });

    const quota = await service.rules.getInviterQuota(ctx.tenant, inviter.id);

    expect(quota.used).toBe(0);
    expect(quota.remaining).toBe(2);
    expect(quota.limit).toBe(2);
  });

  it("monthly_quota = 3 en settings: limit 3 y con 2 activas queda 1", async () => {
    const inviter = await createInviter();
    await setInvitationSettings(app.db, ctx.tenant, { monthlyQuota: 3 });
    await addInvitations(inviter, 2);

    const quota = await service.rules.assertInviterCanInvite(
      ctx.tenant,
      inviter.id,
    );

    expect(quota.limit).toBe(3);
    expect(quota.remaining).toBe(1);
  });

  it("invitador en sede de España: el mes de cupo sale de la tz de Madrid", async () => {
    const inviter = await createInviter("ES");

    const quota = await service.rules.getInviterQuota(ctx.tenant, inviter.id);

    expect(quota.month).toBe(todayInTz("Europe/Madrid").slice(0, 7));
  });

  it("solo accesos is_trial vigentes: inviter_not_member (un acceso no es membresía)", async () => {
    const inviter = await createMemberInPhysicalBranch(ctx, {
      status: "prueba",
    });
    const trialPlan = await createTrialPlan(ctx);
    await createActiveSub(ctx, { userId: inviter.id, planId: trialPlan.id });

    expect(
      await reasonOf(
        service.rules.assertInviterCanInvite(ctx.tenant, inviter.id),
      ),
    ).toBe<InvitationIneligibleReason>("inviter_not_member");
  });

  it("sin suscripciones: inviter_not_member", async () => {
    const inviter = await createMemberInPhysicalBranch(ctx, {
      status: "freemium",
    });

    expect(
      await reasonOf(
        service.rules.assertInviterCanInvite(ctx.tenant, inviter.id),
      ),
    ).toBe<InvitationIneligibleReason>("inviter_not_member");
  });

  it("membresía vencida ayer: inviter_not_member", async () => {
    const inviter = await createMemberInPhysicalBranch(ctx, {
      status: "inactivo",
    });
    const plan = await createMembershipPlan(ctx);
    await createActiveSub(ctx, {
      userId: inviter.id,
      planId: plan.id,
      startOffsetDays: -31,
      endOffsetDays: -1,
      status: "expired",
    });

    expect(
      await reasonOf(
        service.rules.assertInviterCanInvite(ctx.tenant, inviter.id),
      ),
    ).toBe<InvitationIneligibleReason>("inviter_not_member");
  });

  it("membresía real + acceso is_trial (caso Yoga): sigue siendo socio y puede invitar", async () => {
    const inviter = await createInviter();
    const trialPlan = await createTrialPlan(ctx, { category: "especial" });
    await createActiveSub(ctx, { userId: inviter.id, planId: trialPlan.id });

    const quota = await service.rules.assertInviterCanInvite(
      ctx.tenant,
      inviter.id,
    );

    expect(quota.remaining).toBe(2);
  });

  it("invitador inexistente o borrado: inviter_not_found", async () => {
    const inviter = await createInviter();
    await app.db
      .update(schema.users)
      .set({ deletedAt: new Date() })
      .where(
        and(
          tenantWhere(schema.users, ctx.tenant),
          eq(schema.users.id, inviter.id),
        ),
      );

    expect(
      await reasonOf(
        service.rules.assertInviterCanInvite(ctx.tenant, inviter.id),
      ),
    ).toBe<InvitationIneligibleReason>("inviter_not_found");
    expect(
      await reasonOf(service.rules.getInviterQuota(ctx.tenant, inviter.id)),
    ).toBe<InvitationIneligibleReason>("inviter_not_found");
  });

  it("corre dentro de una transacción (executor tx) con el mismo resultado", async () => {
    const inviter = await createInviter();
    await addInvitations(inviter, 1);

    const quota = await app.db.transaction((tx) =>
      service.rules.assertInviterCanInvite(ctx.tenant, inviter.id, tx),
    );

    expect(quota.used).toBe(1);
    expect(quota.remaining).toBe(1);
  });

  it("el cupo de una invitación de otro invitador no se mezcla", async () => {
    const a = await createInviter();
    const b = await createInviter();
    await addInvitations(a, 2);

    const quotaB = await service.rules.getInviterQuota(ctx.tenant, b.id);

    expect(quotaB.used).toBe(0);
    expect(quotaB.remaining).toBe(2);
  });
});

describe("Fase 194 D-10 / T-194-29 — cupo bajo concurrencia (activate)", () => {
  let app: FastifyInstance;
  let ctx: InvitationsFixtureCtx;
  let service: InvitationService;
  let branchId: number;

  beforeAll(async () => {
    app = await createTestApp();
    ctx = fixtureCtx(app);
    service = buildInvitationServices(app).invitationService;
  });

  afterAll(async () => {
    await cleanAllTestData(app);
    await resetSettingsOf(ctx);
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    await resetSettingsOf(ctx);
    branchId = (await ensurePhysicalBranch(ctx, "AR")).id;
    await createTrialPlan(ctx, { country: "AR" });
  });

  function activateFor(
    inviter: { code: string },
    invitee: { id: number },
  ): Promise<{ invitationId: number }> {
    return service.activate(ctx.tenant, {
      channel: "self_service",
      code: inviter.code,
      invitedUserId: invitee.id,
      branchId,
      phone: uniquePhone10(),
      createdBy: null,
    });
  }

  async function countActive(inviterId: number): Promise<number> {
    const rows = await app.db
      .select({ id: schema.invitations.id })
      .from(schema.invitations)
      .where(
        and(
          tenantWhere(schema.invitations, ctx.tenant),
          eq(schema.invitations.inviterId, inviterId),
          eq(schema.invitations.status, "active"),
        ),
      );
    return rows.length;
  }

  it("1 cupo restante y dos activaciones simultáneas de invitados distintos: pasa exactamente una", async () => {
    const inviter = await createInviterWithCode(ctx);
    // Cupo 2 con 1 ya consumido: queda 1.
    const previous = await createMemberInVirtualBranch(ctx);
    await createInvitationRow(ctx, {
      inviterId: inviter.id,
      invitedUserId: previous.id,
      branchId: inviter.branchId,
    });
    const a = await createMemberInVirtualBranch(ctx);
    const b = await createMemberInVirtualBranch(ctx);

    const results = await Promise.allSettled([
      activateFor(inviter, a),
      activateFor(inviter, b),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter(
      (r): r is PromiseRejectedResult => r.status === "rejected",
    );
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(InvitationRuleError);
    expect((rejected[0].reason as InvitationRuleError).reason).toBe(
      "inviter_quota_exhausted",
    );
    expect(await countActive(inviter.id)).toBe(2);
    const quota = await service.rules.getInviterQuota(ctx.tenant, inviter.id);
    expect(quota.remaining).toBe(0);
  });

  it("cupo 2 de 2 y cuatro activaciones simultáneas: pasan exactamente dos", async () => {
    const inviter = await createInviterWithCode(ctx);
    const invitees = await Promise.all(
      [0, 1, 2, 3].map(() => createMemberInVirtualBranch(ctx)),
    );

    const results = await Promise.allSettled(
      invitees.map((i) => activateFor(inviter, i)),
    );

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(2);
    for (const r of results) {
      if (r.status === "rejected") {
        expect((r.reason as InvitationRuleError).reason).toBe(
          "inviter_quota_exhausted",
        );
      }
    }
    expect(await countActive(inviter.id)).toBe(2);
  });

  it("el mismo invitado desde dos invitadores a la vez: una sola activa (ventana de 90 días por persona)", async () => {
    const one = await createInviterWithCode(ctx);
    const two = await createInviterWithCode(ctx);
    const invitee = await createMemberInVirtualBranch(ctx);

    const results = await Promise.allSettled([
      activateFor(one, invitee),
      activateFor(two, invitee),
    ]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find(
      (r): r is PromiseRejectedResult => r.status === "rejected",
    );
    expect((rejected?.reason as InvitationRuleError).reason).toBe(
      "invitee_recent_invitation",
    );
    const rows = await app.db
      .select({ id: schema.invitations.id })
      .from(schema.invitations)
      .where(
        and(
          tenantWhere(schema.invitations, ctx.tenant),
          eq(schema.invitations.invitedUserId, invitee.id),
          eq(schema.invitations.status, "active"),
        ),
      );
    expect(rows).toHaveLength(1);
  });
});

describe("subtractMonths (puro)", () => {
  it("resta meses cruzando años", () => {
    expect(subtractMonths("2026-03-15", 6)).toBe("2025-09-15");
    expect(subtractMonths("2026-01-31", 1)).toBe("2025-12-31");
    expect(subtractMonths("2026-03-15", 12)).toBe("2025-03-15");
  });

  it("recorta al último día del mes destino", () => {
    expect(subtractMonths("2026-08-31", 6)).toBe("2026-02-28");
    expect(subtractMonths("2024-08-31", 6)).toBe("2024-02-29");
    expect(subtractMonths("2026-03-31", 1)).toBe("2026-02-28");
  });

  it("0 meses devuelve la misma fecha", () => {
    expect(subtractMonths("2026-10-06", 0)).toBe("2026-10-06");
  });
});
