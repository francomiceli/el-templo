/**
 * Fase 194 Plan 08 (D-11, D-12, identificación, T-194-25/26/28) — elegibilidad
 * del invitado: historial de membresía (>= 6 meses sin membresía), ventana de 90
 * días por PERSONA e identificación por teléfono/DNI.
 *
 * Servicio contra MySQL real por worker. Las fechas son siempre relativas a hoy;
 * los márgenes (215 días ~ 7 meses, 150 ~ 5 meses) cubren el desfase de huso.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { and, eq, like } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { createTestApp, cleanAllTestData, dateOffsetStr } from "../helpers";
import * as schema from "../../src/db/schema";
import { tenantValues, tenantWhere } from "../../src/modules/shared/tenant";
import { InvitationService } from "../../src/modules/referrals/invitation-service";
import {
  InvitationRuleError,
  INELIGIBLE_MESSAGES,
  type InvitationIneligibleReason,
  type InviteeEligibilityInput,
} from "../../src/modules/referrals/invitation-types";
import {
  INVITATION_SETTINGS_PREFIX,
  setInvitationSettings,
} from "../../src/modules/referrals/invitation-settings";
import {
  TENANT_DOS,
  limpiarSegundoGimnasio,
  seedSecondTenant,
} from "../fixtures/second-tenant";
import {
  createActiveSub,
  createInvitationRow,
  createMemberInPhysicalBranch,
  createMembershipPlan,
  createTrialPlan,
  ensurePhysicalBranch,
  fixtureCtx,
  type InvitationsFixtureCtx,
} from "./_helpers";

const DAY_MS = 24 * 60 * 60 * 1000;
const INVITEE_PHONE = "1155550000";

describe("Fase 194 D-11 / D-12 — elegibilidad del invitado", () => {
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

  interface Actors {
    inviter: { id: number; branchId: number };
    invitee: { id: number; branchId: number };
  }

  async function actors(): Promise<Actors> {
    const inviter = await createMemberInPhysicalBranch(ctx, {
      status: "activo",
    });
    const invitee = await createMemberInPhysicalBranch(ctx, {
      status: "freemium",
    });
    return { inviter, invitee };
  }

  function input(
    a: Actors,
    over: Partial<InviteeEligibilityInput> = {},
  ): InviteeEligibilityInput {
    return {
      inviterId: a.inviter.id,
      invitedUserId: a.invitee.id,
      phone: INVITEE_PHONE,
      ...over,
    };
  }

  async function reasonOf(
    a: Actors,
    over: Partial<InviteeEligibilityInput> = {},
  ): Promise<InvitationIneligibleReason | null> {
    const result = await service.evaluateInviteeEligibility(
      ctx.tenant,
      input(a, over),
    );
    return result.reason;
  }

  /** Sub de membresía real que terminó hace `endedDaysAgo` días (dura 30). */
  async function endedMembership(
    userId: number,
    endedDaysAgo: number,
  ): Promise<number> {
    const plan = await createMembershipPlan(ctx);
    const sub = await createActiveSub(ctx, {
      userId,
      planId: plan.id,
      startOffsetDays: -(endedDaysAgo + 30),
      endOffsetDays: -endedDaysAgo,
      status: "expired",
    });
    return sub.id;
  }

  async function recentInvitation(
    a: Actors,
    opts: {
      invitedUserId: number;
      daysAgo: number;
      phone?: string;
      dni?: string | null;
      status?: "active" | "voided";
    },
  ): Promise<void> {
    await createInvitationRow(ctx, {
      inviterId: a.inviter.id,
      invitedUserId: opts.invitedUserId,
      branchId: a.inviter.branchId,
      activatedAt: new Date(Date.now() - opts.daysAgo * DAY_MS),
      phoneLast10: opts.phone,
      dni: opts.dni,
      status: opts.status,
    });
  }

  // ─── D-11: historial de membresía ───────────────────────────────────────

  it("usuario sin suscripciones: elegible, sin motivo ni mensaje", async () => {
    const a = await actors();

    const result = await service.evaluateInviteeEligibility(
      ctx.tenant,
      input(a),
    );

    expect(result).toEqual({ eligible: true, reason: null, message: null });
  });

  it("ex socio cuya membresía terminó hace ~7 meses: elegible", async () => {
    const a = await actors();
    await endedMembership(a.invitee.id, 215);

    expect(await reasonOf(a)).toBeNull();
  });

  it("ex socio cuya membresía terminó hace ~5 meses: invitee_recent_member", async () => {
    const a = await actors();
    await endedMembership(a.invitee.id, 150);

    expect(await reasonOf(a)).toBe("invitee_recent_member");
  });

  it("socio con membresía vigente: invitee_is_member", async () => {
    const a = await actors();
    const plan = await createMembershipPlan(ctx);
    await createActiveSub(ctx, { userId: a.invitee.id, planId: plan.id });

    expect(await reasonOf(a)).toBe("invitee_is_member");
  });

  it("sub cancelada hace ~7 meses con end_date original futuro: usa cancelled_at y es elegible", async () => {
    const a = await actors();
    const plan = await createMembershipPlan(ctx);
    await createActiveSub(ctx, {
      userId: a.invitee.id,
      planId: plan.id,
      startOffsetDays: -240,
      endOffsetDays: 100,
      status: "cancelled",
      cancelledAt: new Date(Date.now() - 215 * DAY_MS),
    });

    expect(await reasonOf(a)).toBeNull();
  });

  it("sub cancelada hace 30 días con end_date futuro: invitee_recent_member", async () => {
    const a = await actors();
    const plan = await createMembershipPlan(ctx);
    await createActiveSub(ctx, {
      userId: a.invitee.id,
      planId: plan.id,
      startOffsetDays: -60,
      endOffsetDays: 100,
      status: "cancelled",
      cancelledAt: new Date(Date.now() - 30 * DAY_MS),
    });

    expect(await reasonOf(a)).toBe("invitee_recent_member");
  });

  it("sub cancelada ANTES de arrancar: no cuenta como membresía", async () => {
    const a = await actors();
    const plan = await createMembershipPlan(ctx);
    await createActiveSub(ctx, {
      userId: a.invitee.id,
      planId: plan.id,
      startOffsetDays: 10,
      endOffsetDays: 40,
      status: "cancelled",
      cancelledAt: new Date(),
    });

    expect(await reasonOf(a)).toBeNull();
  });

  it("sub programada (scheduled) sin arrancar no cuenta como historial", async () => {
    const a = await actors();
    const plan = await createMembershipPlan(ctx);
    await createActiveSub(ctx, {
      userId: a.invitee.id,
      planId: plan.id,
      startOffsetDays: 5,
      endOffsetDays: 35,
      status: "scheduled",
    });

    expect(await reasonOf(a)).toBeNull();
  });

  it("solo subs de 'Sesión de Prueba' (presencial is_trial) recientes: elegible (no cuentan)", async () => {
    const a = await actors();
    const sp = await createTrialPlan(ctx, {
      category: "presencial",
      name: "Sesión de Prueba fixture",
    });
    await createActiveSub(ctx, {
      userId: a.invitee.id,
      planId: sp.id,
      startOffsetDays: -8,
      endOffsetDays: -3,
      status: "expired",
    });
    await createActiveSub(ctx, {
      userId: a.invitee.id,
      planId: sp.id,
      startOffsetDays: -20,
      endOffsetDays: -14,
      status: "cancelled",
      cancelledAt: new Date(Date.now() - 15 * DAY_MS),
    });

    expect(await reasonOf(a)).toBeNull();
  });

  it("sub bonificada/staff no is_trial terminada hace 2 meses: invitee_recent_member (D-11 las cuenta)", async () => {
    const a = await actors();
    const subId = await endedMembership(a.invitee.id, 60);
    await app.db
      .update(schema.subscriptions)
      .set({ membershipKind: "bonificada" })
      .where(
        and(
          tenantWhere(schema.subscriptions, ctx.tenant),
          eq(schema.subscriptions.id, subId),
        ),
      );

    expect(await reasonOf(a)).toBe("invitee_recent_member");
  });

  it("membresía real + acceso is_trial vigente: la membresía manda (invitee_is_member)", async () => {
    const a = await actors();
    const plan = await createMembershipPlan(ctx);
    await createActiveSub(ctx, { userId: a.invitee.id, planId: plan.id });
    const trial = await createTrialPlan(ctx, { category: "especial" });
    await createActiveSub(ctx, { userId: a.invitee.id, planId: trial.id });

    expect(await reasonOf(a)).toBe("invitee_is_member");
  });

  it("exMemberInactivityMonths = 2 en settings: terminó hace ~3 meses y ya es elegible", async () => {
    const a = await actors();
    await endedMembership(a.invitee.id, 95);
    expect(await reasonOf(a)).toBe("invitee_recent_member");

    await setInvitationSettings(app.db, ctx.tenant, {
      exMemberInactivityMonths: 2,
    });

    expect(await reasonOf(a)).toBeNull();
  });

  // ─── D-12: ventana por persona ──────────────────────────────────────────

  it("invitación activa del mismo usuario hace 30 días (de otro invitador): invitee_recent_invitation", async () => {
    const a = await actors();
    const otro = await createMemberInPhysicalBranch(ctx, { status: "activo" });
    await createInvitationRow(ctx, {
      inviterId: otro.id,
      invitedUserId: a.invitee.id,
      branchId: otro.branchId,
      activatedAt: new Date(Date.now() - 30 * DAY_MS),
    });

    expect(await reasonOf(a)).toBe("invitee_recent_invitation");
  });

  it("invitación activa del mismo usuario hace 91 días: elegible", async () => {
    const a = await actors();
    await recentInvitation(a, { invitedUserId: a.invitee.id, daysAgo: 91 });

    expect(await reasonOf(a)).toBeNull();
  });

  it("reinviteWindowDays = 120 en settings: la de hace 91 días vuelve a bloquear", async () => {
    const a = await actors();
    await recentInvitation(a, { invitedUserId: a.invitee.id, daysAgo: 91 });
    await setInvitationSettings(app.db, ctx.tenant, {
      reinviteWindowDays: 120,
    });

    expect(await reasonOf(a)).toBe("invitee_recent_invitation");
  });

  it("OTRA cuenta con el mismo teléfono (formatos distintos) hace 30 días: invitee_recent_invitation", async () => {
    const a = await actors();
    const otraCuenta = await createMemberInPhysicalBranch(ctx);
    // Snapshot guardado como últimos 10; el invitado de ahora lo escribe con +54 9.
    await recentInvitation(a, {
      invitedUserId: otraCuenta.id,
      daysAgo: 30,
      phone: "1122334455",
    });

    expect(await reasonOf(a, { phone: "+54 9 11 2233-4455" })).toBe(
      "invitee_recent_invitation",
    );
    expect(await reasonOf(a, { phone: "(11) 2233 4455" })).toBe(
      "invitee_recent_invitation",
    );
  });

  it("OTRA cuenta con el mismo DNI hace 30 días: invitee_recent_invitation", async () => {
    const a = await actors();
    const otraCuenta = await createMemberInPhysicalBranch(ctx);
    await recentInvitation(a, {
      invitedUserId: otraCuenta.id,
      daysAgo: 30,
      dni: "X30111222",
    });

    expect(await reasonOf(a, { dni: "X30111222" })).toBe(
      "invitee_recent_invitation",
    );
    // Sin DNI en la entrada, ese snapshot no coincide con nadie.
    expect(await reasonOf(a)).toBeNull();
  });

  it("invitación anulada (voided) hace 10 días: no bloquea", async () => {
    const a = await actors();
    await recentInvitation(a, {
      invitedUserId: a.invitee.id,
      daysAgo: 10,
      status: "voided",
    });

    expect(await reasonOf(a)).toBeNull();
  });

  it("booking de Sesión de Prueba (is_trial) hace 10 días: no bloquea (D-12)", async () => {
    const a = await actors();
    const branch = await ensurePhysicalBranch(ctx, "AR");
    const [act] = await app.db
      .insert(schema.activities)
      .values(
        tenantValues(ctx.tenant, {
          name: "Elegibilidad D-12",
          branchId: branch.id,
        }),
      )
      .$returningId();
    const [sch] = await app.db
      .insert(schema.schedules)
      .values(
        tenantValues(ctx.tenant, {
          activityId: act.id,
          branchId: branch.id,
          dayOfWeek: 3,
          startTime: "10:00",
          endTime: "11:00",
          isActive: true,
        }),
      )
      .$returningId();
    await app.db.insert(schema.bookings).values(
      tenantValues(ctx.tenant, {
        memberId: a.invitee.id,
        scheduleId: sch.id,
        bookingDate: dateOffsetStr(-10),
        status: "confirmado" as const,
        isTrial: true,
      }),
    );

    expect(await reasonOf(a)).toBeNull();
  });

  it("la ventana respeta el aislamiento por gimnasio: una invitación del gimnasio 2 con el mismo teléfono no bloquea", async () => {
    const a = await actors();
    const gym2 = await seedSecondTenant(app);
    try {
      const ctx2 = fixtureCtx(app, TENANT_DOS);
      await createInvitationRow(ctx2, {
        inviterId: gym2.socios[0].id,
        invitedUserId: gym2.socios[1].id,
        branchId: gym2.branchId,
        activatedAt: new Date(Date.now() - 10 * DAY_MS),
        phoneLast10: INVITEE_PHONE,
      });
      await app.db
        .update(schema.users)
        .set({ phone: INVITEE_PHONE })
        .where(
          and(
            tenantWhere(schema.users, ctx2.tenant),
            eq(schema.users.id, gym2.socios[0].id),
          ),
        );

      // Ni la ventana (invitations) ni la identidad (users) cruzan de gimnasio.
      expect(await reasonOf(a)).toBeNull();
    } finally {
      await limpiarSegundoGimnasio(app);
    }
  });

  // ─── Identificación ─────────────────────────────────────────────────────

  it("teléfono vacío, en blanco o sin dígitos: phone_required", async () => {
    const a = await actors();

    expect(await reasonOf(a, { phone: "" })).toBe("phone_required");
    expect(await reasonOf(a, { phone: "   " })).toBe("phone_required");
    expect(await reasonOf(a, { phone: "n/a" })).toBe("phone_required");
  });

  it("teléfono de OTRO usuario del tenant (formato distinto al guardado): phone_taken", async () => {
    const a = await actors();
    await createMemberInPhysicalBranch(ctx, { phone: "+54 9 11 5555-0000" });

    expect(await reasonOf(a)).toBe("phone_taken");
  });

  it("DNI de OTRO usuario del tenant: dni_taken", async () => {
    const a = await actors();
    await createMemberInPhysicalBranch(ctx, { dni: "30999888" });

    expect(await reasonOf(a, { dni: " 30999888 " })).toBe("dni_taken");
  });

  it("el propio teléfono y DNI del invitado no son choque", async () => {
    const inviter = await createMemberInPhysicalBranch(ctx, {
      status: "activo",
    });
    const invitee = await createMemberInPhysicalBranch(ctx, {
      phone: "+54 9 11 5555-0000",
      dni: "30777666",
    });
    const a: Actors = { inviter, invitee };

    expect(await reasonOf(a, { dni: "30777666" })).toBeNull();
  });

  it("el teléfono de un usuario borrado no cuenta", async () => {
    const a = await actors();
    const borrado = await createMemberInPhysicalBranch(ctx, {
      phone: "11 5555 0000",
    });
    await app.db
      .update(schema.users)
      .set({ deletedAt: new Date() })
      .where(
        and(
          tenantWhere(schema.users, ctx.tenant),
          eq(schema.users.id, borrado.id),
        ),
      );

    expect(await reasonOf(a)).toBeNull();
  });

  // ─── Orden, mensajes y aserción ─────────────────────────────────────────

  it("invitarse a uno mismo: self_invite (gana a phone_required)", async () => {
    const a = await actors();

    expect(
      await reasonOf(a, { inviterId: a.invitee.id, phone: "" }),
    ).toBe("self_invite");
  });

  it("corta en la primera falla: identidad antes que historial", async () => {
    const a = await actors();
    await endedMembership(a.invitee.id, 30);
    await createMemberInPhysicalBranch(ctx, { phone: INVITEE_PHONE });

    expect(await reasonOf(a)).toBe("phone_taken");
  });

  it("el mensaje es el del motivo, en español y sin 'referido' ni datos de la otra cuenta", async () => {
    const a = await actors();
    await createMemberInPhysicalBranch(ctx, { phone: INVITEE_PHONE });

    const result = await service.evaluateInviteeEligibility(
      ctx.tenant,
      input(a),
    );

    expect(result.eligible).toBe(false);
    expect(result.message).toBe(INELIGIBLE_MESSAGES.phone_taken);
    for (const msg of Object.values(INELIGIBLE_MESSAGES)) {
      expect(msg).not.toMatch(/referid/i);
    }
  });

  it("assertInviteeEligible y assertIdentityNotTaken lanzan InvitationRuleError con el reason", async () => {
    const a = await actors();
    await endedMembership(a.invitee.id, 30);

    const err = await service
      .assertInviteeEligible(ctx.tenant, input(a))
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(InvitationRuleError);
    expect((err as InvitationRuleError).reason).toBe("invitee_recent_member");
    expect((err as InvitationRuleError).statusCode).toBe(409);

    const idErr = await service
      .assertIdentityNotTaken(ctx.tenant, {
        invitedUserId: a.invitee.id,
        phone: "",
      })
      .catch((e: unknown) => e);
    expect((idErr as InvitationRuleError).reason).toBe("phone_required");

    await expect(
      service.assertIdentityNotTaken(ctx.tenant, {
        invitedUserId: a.invitee.id,
        phone: INVITEE_PHONE,
      }),
    ).resolves.toBeUndefined();
  });

  it("corre dentro de una transacción (executor tx) con el mismo resultado", async () => {
    const a = await actors();
    await endedMembership(a.invitee.id, 30);

    const result = await app.db.transaction((tx) =>
      service.evaluateInviteeEligibility(ctx.tenant, input(a), tx),
    );

    expect(result.reason).toBe("invitee_recent_member");
  });

  it("sede elegida inexistente: 404 en vez de adivinar la zona horaria", async () => {
    const a = await actors();

    await expect(
      service.evaluateInviteeEligibility(
        ctx.tenant,
        input(a, { branchId: 2_000_000_000 }),
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
