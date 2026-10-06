/**
 * Fase 194 Plan 09 (D-01, D-02, D-04, D-06, D-10, D-15, D-18, Pitfall 1,
 * T-194-30/31/33) — activación de invitaciones a nivel servicio, para los dos
 * canales (app `self_service` y recepción `assisted`).
 *
 * Servicio contra MySQL real por worker, con el `SubscriptionService` real
 * (assignInvitationPlan). Fechas siempre relativas a `todayInTz(sede)`; ningún
 * id hardcodeado.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { and, asc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { createTestApp, cleanAllTestData } from "../helpers";
import * as schema from "../../src/db/schema";
import { addBusinessDays } from "../../src/modules/shared/business-days";
import { todayInTz } from "../../src/modules/shared/date-utils";
import { tenantValues, tenantWhere } from "../../src/modules/shared/tenant";
import type { InvitationService } from "../../src/modules/referrals/invitation-service";
import { setInvitationSettings } from "../../src/modules/referrals/invitation-settings";
import {
  InvitationRuleError,
  type InvitationIneligibleReason,
} from "../../src/modules/referrals/invitation-types";
import {
  limpiarSegundoGimnasio,
  seedSecondTenant,
} from "../fixtures/second-tenant";
import {
  buildInvitationServices,
  createActiveSub,
  createInviterWithCode,
  createMemberInPhysicalBranch,
  createMemberInVirtualBranch,
  createMembershipPlan,
  createTrialPlan,
  ensurePhysicalBranch,
  fixtureCtx,
  getAdminUserId,
  resetInvitationSettings,
  uniquePhone10,
  type InvitationsFixtureCtx,
} from "./_helpers";

describe("Fase 194 D-06 — activación de invitaciones", () => {
  let app: FastifyInstance;
  let ctx: InvitationsFixtureCtx;
  let service: InvitationService;
  let adminId: number;
  let arBranch: { id: number; timezone: string };
  let arPlan: { id: number };

  beforeAll(async () => {
    app = await createTestApp();
    ctx = fixtureCtx(app);
    service = buildInvitationServices(app).invitationService;
    adminId = await getAdminUserId(ctx);
  });

  afterAll(async () => {
    await cleanAllTestData(app);
    await resetInvitationSettings(ctx);
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    await resetInvitationSettings(ctx);
    arBranch = await ensurePhysicalBranch(ctx, "AR");
    // `subscription_plans` se vacía con cleanAllTestData: crear DESPUÉS.
    arPlan = await createTrialPlan(ctx, { country: "AR" });
  });

  // ─── helpers de lectura ────────────────────────────────────────────────

  async function readUser(id: number) {
    const [row] = await app.db
      .select({
        status: schema.users.status,
        branchId: schema.users.branchId,
        phone: schema.users.phone,
        dni: schema.users.dni,
        leadStatus: schema.users.leadStatus,
        leadStatusSource: schema.users.leadStatusSource,
        purchasedPlanId: schema.users.purchasedPlanId,
      })
      .from(schema.users)
      .where(
        and(tenantWhere(schema.users, ctx.tenant), eq(schema.users.id, id)),
      );
    if (!row) throw new Error(`usuario ${id} no existe`);
    return row;
  }

  async function readInvitation(id: number) {
    const [row] = await app.db
      .select()
      .from(schema.invitations)
      .where(
        and(
          tenantWhere(schema.invitations, ctx.tenant),
          eq(schema.invitations.id, id),
        ),
      );
    if (!row) throw new Error(`invitación ${id} no existe`);
    return row;
  }

  async function invitationsOf(invitedUserId: number) {
    return app.db
      .select()
      .from(schema.invitations)
      .where(
        and(
          tenantWhere(schema.invitations, ctx.tenant),
          eq(schema.invitations.invitedUserId, invitedUserId),
        ),
      );
  }

  async function readSub(id: number) {
    const [row] = await app.db
      .select()
      .from(schema.subscriptions)
      .where(
        and(
          tenantWhere(schema.subscriptions, ctx.tenant),
          eq(schema.subscriptions.id, id),
        ),
      );
    if (!row) throw new Error(`sub ${id} no existe`);
    return row;
  }

  async function subsOf(userId: number) {
    return app.db
      .select({ id: schema.subscriptions.id })
      .from(schema.subscriptions)
      .where(
        and(
          tenantWhere(schema.subscriptions, ctx.tenant),
          eq(schema.subscriptions.userId, userId),
        ),
      );
  }

  async function historyOf(userId: number) {
    return app.db
      .select({
        fromStatus: schema.userStatusHistory.fromStatus,
        toStatus: schema.userStatusHistory.toStatus,
        source: schema.userStatusHistory.source,
      })
      .from(schema.userStatusHistory)
      .where(
        and(
          tenantWhere(schema.userStatusHistory, ctx.tenant),
          eq(schema.userStatusHistory.userId, userId),
        ),
      )
      .orderBy(asc(schema.userStatusHistory.id));
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

  async function activateSelfService(
    inviter: { code: string },
    invitee: { id: number },
    branchId: number,
    over: { phone?: string; dni?: string | null } = {},
  ) {
    return service.activate(ctx.tenant, {
      channel: "self_service",
      code: inviter.code,
      invitedUserId: invitee.id,
      branchId,
      phone: over.phone ?? uniquePhone10(),
      dni: over.dni,
      createdBy: null,
    });
  }

  // ─── camino feliz ──────────────────────────────────────────────────────

  it("freemium en sede virtual + código: fila active, sede física, teléfono, prueba con historial, lead y sub $0 de 3 accesos", async () => {
    const inviter = await createInviterWithCode(ctx);
    const invitee = await createMemberInVirtualBranch(ctx, { dni: null });

    const result = await activateSelfService(inviter, invitee, arBranch.id, {
      phone: "+54 9 11 5555-0001",
      dni: " 30111222 ",
    });

    const today = todayInTz(arBranch.timezone);
    const invitation = await readInvitation(result.invitationId);
    expect(invitation.status).toBe("active");
    expect(invitation.channel).toBe("self_service");
    expect(invitation.inviterId).toBe(inviter.id);
    expect(invitation.invitedUserId).toBe(invitee.id);
    expect(invitation.quotaMonth).toBe(today.slice(0, 7));
    expect(invitation.accessStartsOn).toBe(today);
    expect(invitation.accessExpiresOn).toBe(result.accessExpiresOn);
    expect(invitation.subscriptionId).toBe(result.subscriptionId);
    expect(invitation.branchId).toBe(arBranch.id);
    expect(invitation.invitedPhoneLast10).toBe("1155550001");
    expect(invitation.invitedDni).toBe("30111222");
    expect(invitation.createdBy).toBeNull();

    // D-15: 10 días hábiles lun-sáb. 10 > 6, así que cruza 1 o 2 domingos.
    expect(result.accessExpiresOn).toBe(addBusinessDays(today, 10, new Set()));
    const days =
      (Date.parse(`${result.accessExpiresOn}T12:00:00Z`) -
        Date.parse(`${today}T12:00:00Z`)) /
      86400000;
    expect(days).toBeGreaterThanOrEqual(11);
    expect(days).toBeLessThanOrEqual(12);
    expect(
      new Date(`${result.accessExpiresOn}T12:00:00Z`).getUTCDay(),
    ).not.toBe(0);

    // Pitfall 1 + D-01: sede física, teléfono guardado (con +), `prueba`.
    const user = await readUser(invitee.id);
    expect(user.branchId).toBe(arBranch.id);
    expect(user.phone).toBe("+5491155550001");
    expect(user.dni).toBe("30111222");
    // D-03 en vivo: tiene accesos vigentes y sigue siendo `prueba`, no `activo`.
    expect(user.status).toBe("prueba");
    const history = await historyOf(invitee.id);
    expect(history).toEqual([
      { fromStatus: "freemium", toStatus: "prueba", source: "invitation" },
    ]);

    // D-18: alta del lead.
    expect(user.leadStatus).toBe("en_seguimiento");
    expect(user.leadStatusSource).toBe("auto");
    expect(user.purchasedPlanId).toBeNull();

    // D-02: plan Invitación del país, $0, bonificada, 3 clases, vence el día hábil 10.
    const sub = await readSub(result.subscriptionId);
    expect(sub.planId).toBe(arPlan.id);
    expect(sub.status).toBe("active");
    expect(sub.pricePaid).toBe(0);
    expect(sub.membershipKind).toBe("bonificada");
    expect(sub.classesBudget).toBe(3);
    expect(sub.classesRemaining).toBe(3);
    expect(sub.startDate).toBe(today);
    expect(sub.endDate).toBe(result.accessExpiresOn);
    expect(sub.priceOverrideReason).toMatch(/^Invitación de Fisico Fixture/);
    expect(result.classesBudget).toBe(3);
    expect(result.branchId).toBe(arBranch.id);
  });

  it("ex socio inactivo elegible (membresía terminada hace > 6 meses): pasa a prueba, historial desde inactivo", async () => {
    const inviter = await createInviterWithCode(ctx);
    const exMember = await createMemberInPhysicalBranch(ctx, {
      status: "inactivo",
    });
    const plan = await createMembershipPlan(ctx);
    await createActiveSub(ctx, {
      userId: exMember.id,
      planId: plan.id,
      startOffsetDays: -245,
      endOffsetDays: -215,
      status: "expired",
    });

    const result = await activateSelfService(inviter, exMember, arBranch.id);

    const user = await readUser(exMember.id);
    expect(user.status).toBe("prueba");
    expect(await historyOf(exMember.id)).toEqual([
      { fromStatus: "inactivo", toStatus: "prueba", source: "invitation" },
    ]);
    const sub = await readSub(result.subscriptionId);
    expect(sub.status).toBe("active");
    expect(sub.membershipKind).toBe("bonificada");
  });

  it("invitado que ya estaba en prueba: no duplica el historial de status", async () => {
    const inviter = await createInviterWithCode(ctx);
    const invitee = await createMemberInVirtualBranch(ctx, {
      status: "prueba",
    });

    await activateSelfService(inviter, invitee, arBranch.id);

    expect((await readUser(invitee.id)).status).toBe("prueba");
    expect(await historyOf(invitee.id)).toEqual([]);
  });

  it("con un feriado AR dentro del rango el vencimiento se corre un día (D-15, feriados del país de la sede)", async () => {
    const inviter = await createInviterWithCode(ctx);
    const invitee = await createMemberInVirtualBranch(ctx);
    const today = todayInTz(arBranch.timezone);
    const holiday = addBusinessDays(today, 1, new Set());
    await app.db.insert(schema.holidays).values(
      tenantValues(ctx.tenant, {
        country: "AR",
        date: holiday,
        name: "Feriado de test 194-09",
      }),
    );
    // Un feriado de ES el mismo día NO corre nada (se usa el país de la sede).
    await app.db.insert(schema.holidays).values(
      tenantValues(ctx.tenant, {
        country: "ES",
        date: addBusinessDays(today, 2, new Set()),
        name: "Feriado ES de test 194-09",
      }),
    );

    const result = await activateSelfService(inviter, invitee, arBranch.id);

    const sinFeriado = addBusinessDays(today, 10, new Set());
    const conFeriado = addBusinessDays(today, 10, new Set([holiday]));
    expect(conFeriado).not.toBe(sinFeriado);
    expect(result.accessExpiresOn).toBe(conFeriado);
    expect((await readSub(result.subscriptionId)).endDate).toBe(conFeriado);
  });

  it("settings dinámicos: access_business_days = 5 acorta la vigencia", async () => {
    const inviter = await createInviterWithCode(ctx);
    const invitee = await createMemberInVirtualBranch(ctx);
    await setInvitationSettings(app.db, ctx.tenant, { accessBusinessDays: 5 });

    const result = await activateSelfService(inviter, invitee, arBranch.id);

    expect(result.accessExpiresOn).toBe(
      addBusinessDays(todayInTz(arBranch.timezone), 5, new Set()),
    );
  });

  it("lead: un lead 'ganado' previo vuelve a en_seguimiento sin plan comprado (D-18), salvo que sea manual", async () => {
    const inviter = await createInviterWithCode(ctx);
    const auto = await createMemberInVirtualBranch(ctx);
    const manual = await createMemberInVirtualBranch(ctx);
    const bought = await createMembershipPlan(ctx);
    await app.db
      .update(schema.users)
      .set({
        leadStatus: "ganado",
        leadStatusSource: "auto",
        purchasedPlanId: bought.id,
      })
      .where(
        and(
          tenantWhere(schema.users, ctx.tenant),
          eq(schema.users.id, auto.id),
        ),
      );
    await app.db
      .update(schema.users)
      .set({ leadStatus: "perdido", leadStatusSource: "manual" })
      .where(
        and(
          tenantWhere(schema.users, ctx.tenant),
          eq(schema.users.id, manual.id),
        ),
      );

    await activateSelfService(inviter, auto, arBranch.id);
    await activateSelfService(inviter, manual, arBranch.id);

    const a = await readUser(auto.id);
    expect(a.leadStatus).toBe("en_seguimiento");
    expect(a.leadStatusSource).toBe("auto");
    expect(a.purchasedPlanId).toBeNull();
    const m = await readUser(manual.id);
    expect(m.leadStatus).toBe("perdido");
    expect(m.leadStatusSource).toBe("manual");
  });

  it("el DNI propio del invitado se conserva; el del formulario solo se usa si no tenía", async () => {
    const inviter = await createInviterWithCode(ctx);
    const invitee = await createMemberInVirtualBranch(ctx, { dni: "OWN123" });

    const result = await activateSelfService(inviter, invitee, arBranch.id, {
      dni: "999888777",
    });

    expect((await readUser(invitee.id)).dni).toBe("OWN123");
    expect((await readInvitation(result.invitationId)).invitedDni).toBe(
      "OWN123",
    );
  });

  // ─── canal asistido ────────────────────────────────────────────────────

  it("canal asistido: misma lógica con inviterId y createdBy del staff", async () => {
    const inviter = await createInviterWithCode(ctx);
    const invitee = await createMemberInVirtualBranch(ctx);

    const result = await service.activate(ctx.tenant, {
      channel: "assisted",
      inviterId: inviter.id,
      invitedUserId: invitee.id,
      branchId: arBranch.id,
      phone: uniquePhone10(),
      createdBy: adminId,
    });

    const invitation = await readInvitation(result.invitationId);
    expect(invitation.channel).toBe("assisted");
    expect(invitation.createdBy).toBe(adminId);
    expect(invitation.inviterId).toBe(inviter.id);
    expect((await readUser(invitee.id)).status).toBe("prueba");
    expect((await readSub(result.subscriptionId)).membershipKind).toBe(
      "bonificada",
    );
  });

  it("canal asistido también acepta el código del invitador", async () => {
    const inviter = await createInviterWithCode(ctx);
    const invitee = await createMemberInVirtualBranch(ctx);

    const result = await service.activate(ctx.tenant, {
      channel: "assisted",
      code: inviter.code,
      invitedUserId: invitee.id,
      branchId: arBranch.id,
      phone: uniquePhone10(),
      createdBy: adminId,
    });

    expect((await readInvitation(result.invitationId)).inviterId).toBe(
      inviter.id,
    );
  });

  // ─── guards del canal (T-194-30) ───────────────────────────────────────

  it("T-194-30: el canal app rechaza un inviterId del cliente (400) y no crea fila", async () => {
    const inviter = await createInviterWithCode(ctx);
    const invitee = await createMemberInVirtualBranch(ctx);

    await expect(
      service.activate(ctx.tenant, {
        channel: "self_service",
        inviterId: inviter.id,
        code: inviter.code,
        invitedUserId: invitee.id,
        branchId: arBranch.id,
        phone: uniquePhone10(),
        createdBy: null,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(await invitationsOf(invitee.id)).toHaveLength(0);
  });

  it("el canal app sin código da 400; el asistido sin inviterId ni código también", async () => {
    const invitee = await createMemberInVirtualBranch(ctx);
    const base = {
      invitedUserId: invitee.id,
      branchId: arBranch.id,
      phone: uniquePhone10(),
      createdBy: null,
    };

    await expect(
      service.activate(ctx.tenant, { ...base, channel: "self_service" }),
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      service.activate(ctx.tenant, {
        ...base,
        channel: "assisted",
        createdBy: adminId,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("código desconocido: inviter_not_found; auto-invitación: self_invite (sin fila)", async () => {
    const inviter = await createInviterWithCode(ctx);

    expect(
      await reasonOf(
        service.activate(ctx.tenant, {
          channel: "self_service",
          code: "NO-EXISTE",
          invitedUserId: inviter.id,
          branchId: arBranch.id,
          phone: uniquePhone10(),
          createdBy: null,
        }),
      ),
    ).toBe<InvitationIneligibleReason>("inviter_not_found");
    expect(
      await reasonOf(
        service.activate(ctx.tenant, {
          channel: "self_service",
          code: inviter.code,
          invitedUserId: inviter.id,
          branchId: arBranch.id,
          phone: uniquePhone10(),
          createdBy: null,
        }),
      ),
    ).toBe<InvitationIneligibleReason>("self_invite");
    expect(await invitationsOf(inviter.id)).toHaveLength(0);
  });

  // ─── reglas bajo el lock: sin fila ─────────────────────────────────────

  it("cupo agotado: inviter_quota_exhausted, sin fila nueva y el invitado queda intacto", async () => {
    const inviter = await createInviterWithCode(ctx);
    await setInvitationSettings(app.db, ctx.tenant, { monthlyQuota: 1 });
    const first = await createMemberInVirtualBranch(ctx);
    const second = await createMemberInVirtualBranch(ctx);
    await activateSelfService(inviter, first, arBranch.id);

    expect(
      await reasonOf(activateSelfService(inviter, second, arBranch.id)),
    ).toBe<InvitationIneligibleReason>("inviter_quota_exhausted");

    expect(await invitationsOf(second.id)).toHaveLength(0);
    const user = await readUser(second.id);
    expect(user.status).toBe("freemium");
    expect(user.branchId).toBe(second.branchId);
    expect(await subsOf(second.id)).toHaveLength(0);
  });

  it("invitador sin membresía vigente: inviter_not_member", async () => {
    const notMember = await createMemberInPhysicalBranch(ctx, {
      status: "freemium",
    });
    await app.db
      .update(schema.users)
      .set({ referralCode: "SINMEMB-1" })
      .where(
        and(
          tenantWhere(schema.users, ctx.tenant),
          eq(schema.users.id, notMember.id),
        ),
      );
    const invitee = await createMemberInVirtualBranch(ctx);

    expect(
      await reasonOf(
        activateSelfService({ code: "SINMEMB-1" }, invitee, arBranch.id),
      ),
    ).toBe<InvitationIneligibleReason>("inviter_not_member");
    expect(await invitationsOf(invitee.id)).toHaveLength(0);
  });

  it("invitado socio vigente, con compra programada, con teléfono o DNI ajeno o sin teléfono: motivo y sin fila", async () => {
    const inviter = await createInviterWithCode(ctx);
    const realPlan = await createMembershipPlan(ctx);

    const member = await createMemberInPhysicalBranch(ctx, {
      status: "activo",
    });
    await createActiveSub(ctx, { userId: member.id, planId: realPlan.id });

    const scheduled = await createMemberInPhysicalBranch(ctx, {
      status: "freemium",
    });
    await createActiveSub(ctx, {
      userId: scheduled.id,
      planId: realPlan.id,
      status: "scheduled",
      startOffsetDays: 5,
      endOffsetDays: 35,
    });

    const takenPhone = uniquePhone10();
    await createMemberInPhysicalBranch(ctx, { phone: takenPhone });
    const phoneClash = await createMemberInVirtualBranch(ctx);

    const takenDni = "DNI-OCUPADO-1";
    await createMemberInPhysicalBranch(ctx, { dni: takenDni });
    const dniClash = await createMemberInVirtualBranch(ctx);

    const noPhone = await createMemberInVirtualBranch(ctx);

    expect(
      await reasonOf(activateSelfService(inviter, member, arBranch.id)),
    ).toBe<InvitationIneligibleReason>("invitee_is_member");
    expect(
      await reasonOf(activateSelfService(inviter, scheduled, arBranch.id)),
    ).toBe<InvitationIneligibleReason>("invitee_is_member");
    expect(
      await reasonOf(
        activateSelfService(inviter, phoneClash, arBranch.id, {
          phone: takenPhone,
        }),
      ),
    ).toBe<InvitationIneligibleReason>("phone_taken");
    expect(
      await reasonOf(
        activateSelfService(inviter, dniClash, arBranch.id, {
          dni: takenDni,
        }),
      ),
    ).toBe<InvitationIneligibleReason>("dni_taken");
    expect(
      await reasonOf(
        activateSelfService(inviter, noPhone, arBranch.id, { phone: "  " }),
      ),
    ).toBe<InvitationIneligibleReason>("phone_required");

    for (const u of [member, scheduled, phoneClash, dniClash, noPhone]) {
      expect(await invitationsOf(u.id)).toHaveLength(0);
    }
    // El socio con compra programada no fue mudado ni tocado.
    expect((await readUser(scheduled.id)).status).toBe("freemium");
  });

  it("invitado inexistente o borrado: 404 sin fila", async () => {
    const inviter = await createInviterWithCode(ctx);
    const gone = await createMemberInVirtualBranch(ctx);
    await app.db
      .update(schema.users)
      .set({ deletedAt: new Date() })
      .where(
        and(
          tenantWhere(schema.users, ctx.tenant),
          eq(schema.users.id, gone.id),
        ),
      );

    await expect(
      activateSelfService(inviter, gone, arBranch.id),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(await invitationsOf(gone.id)).toHaveLength(0);
  });

  // ─── sedes (Pitfall 1, T-194-31) ───────────────────────────────────────

  it("Pitfall 1: sede virtual como destino -> 400 y sin fila", async () => {
    const inviter = await createInviterWithCode(ctx);
    const invitee = await createMemberInVirtualBranch(ctx);

    await expect(
      activateSelfService(inviter, invitee, invitee.branchId),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(await invitationsOf(invitee.id)).toHaveLength(0);
    expect((await readUser(invitee.id)).status).toBe("freemium");
  });

  it("sede de otro gimnasio: 404 como una inexistente, sin fila", async () => {
    const inviter = await createInviterWithCode(ctx);
    const invitee = await createMemberInVirtualBranch(ctx);
    const gym2 = await seedSecondTenant(app);
    try {
      await expect(
        activateSelfService(inviter, invitee, gym2.branchId),
      ).rejects.toMatchObject({ statusCode: 404 });
      expect(await invitationsOf(invitee.id)).toHaveLength(0);
    } finally {
      await limpiarSegundoGimnasio(app);
    }
  });

  it("invitado de la sede virtual que elige una sede de España: se muda y recibe el plan Invitación de ES", async () => {
    const inviter = await createInviterWithCode(ctx);
    const invitee = await createMemberInVirtualBranch(ctx);
    const esBranch = await ensurePhysicalBranch(ctx, "ES");
    const esPlan = await createTrialPlan(ctx, { country: "ES" });

    const result = await activateSelfService(inviter, invitee, esBranch.id);

    const sub = await readSub(result.subscriptionId);
    expect(sub.planId).toBe(esPlan.id);
    expect(sub.currency).toBe("EUR");
    expect(sub.branchId).toBe(esBranch.id);
    expect((await readUser(invitee.id)).branchId).toBe(esBranch.id);
    const invitation = await readInvitation(result.invitationId);
    expect(invitation.accessStartsOn).toBe(todayInTz(esBranch.timezone));
  });

  it("invitado que ya entrena en una sede física de AR no se muda a una sede de ES (400, sin fila)", async () => {
    const inviter = await createInviterWithCode(ctx);
    const invitee = await createMemberInPhysicalBranch(ctx, {
      status: "freemium",
    });
    const esBranch = await ensurePhysicalBranch(ctx, "ES");
    await createTrialPlan(ctx, { country: "ES" });

    await expect(
      activateSelfService(inviter, invitee, esBranch.id),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(await invitationsOf(invitee.id)).toHaveLength(0);
    expect((await readUser(invitee.id)).branchId).toBe(invitee.branchId);
  });

  // ─── compensación (T-194-33) ───────────────────────────────────────────

  it("T-194-33: si assignInvitationPlan/findInvitationPlan fallan la fila queda voided (activation_failed), el error se propaga y el cupo vuelve", async () => {
    const inviter = await createInviterWithCode(ctx);
    const invitee = await createMemberInVirtualBranch(ctx);
    // Sin plan Invitación activo del país: problema de configuración.
    await app.db
      .update(schema.subscriptionPlans)
      .set({ isActive: false })
      .where(
        and(
          tenantWhere(schema.subscriptionPlans, ctx.tenant),
          eq(schema.subscriptionPlans.id, arPlan.id),
        ),
      );

    await expect(
      activateSelfService(inviter, invitee, arBranch.id),
    ).rejects.toMatchObject({ statusCode: 400 });

    const rows = await invitationsOf(invitee.id);
    expect(rows).toHaveLength(1); // nunca se borra
    expect(rows[0].status).toBe("voided");
    expect(rows[0].voidReason).toBe("activation_failed");
    expect(rows[0].voidedAt).not.toBeNull();
    expect(rows[0].subscriptionId).toBeNull();
    expect(await subsOf(invitee.id)).toHaveLength(0);

    // La invitación rota no consume cupo ni bloquea la ventana de 90 días.
    const quota = await service.getInviterQuota(ctx.tenant, inviter.id);
    expect(quota.used).toBe(0);
    expect(quota.remaining).toBe(2);
    const retry = await service.evaluateInviteeEligibility(ctx.tenant, {
      inviterId: inviter.id,
      invitedUserId: invitee.id,
      phone: uniquePhone10(),
      branchId: arBranch.id,
    });
    expect(retry.eligible).toBe(true);
  });

  it("tras corregir la configuración el mismo invitado se puede activar (la fila voided no estorba)", async () => {
    const inviter = await createInviterWithCode(ctx);
    const invitee = await createMemberInVirtualBranch(ctx);
    await app.db
      .update(schema.subscriptionPlans)
      .set({ isActive: false })
      .where(
        and(
          tenantWhere(schema.subscriptionPlans, ctx.tenant),
          eq(schema.subscriptionPlans.id, arPlan.id),
        ),
      );
    const phone = uniquePhone10();
    await expect(
      activateSelfService(inviter, invitee, arBranch.id, { phone }),
    ).rejects.toBeDefined();
    await app.db
      .update(schema.subscriptionPlans)
      .set({ isActive: true })
      .where(
        and(
          tenantWhere(schema.subscriptionPlans, ctx.tenant),
          eq(schema.subscriptionPlans.id, arPlan.id),
        ),
      );

    const result = await activateSelfService(inviter, invitee, arBranch.id, {
      phone,
    });

    const rows = await invitationsOf(invitee.id);
    expect(rows.map((r) => r.status).sort()).toEqual(["active", "voided"]);
    expect((await readSub(result.subscriptionId)).status).toBe("active");
  });
});
