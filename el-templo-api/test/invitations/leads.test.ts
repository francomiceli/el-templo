/**
 * Fase 194 Plan 13 (D-18, D-03, D-13, SC-5, T-194-44..47) — el invitado en el
 * pipeline de leads.
 *
 *   - Gate de conversión de `recomputeUserStatus`: "tiene SP O compró una
 *     membresía paga después de activar una invitación" (sin marcar las
 *     reservas como `is_trial`).
 *   - Paso explícito de conversión (`referrals/invitation-conversion.ts`): ex
 *     socio con `converted_at` histórico y atribución de la compra a la
 *     invitación (`converted_at` / `converted_subscription_id`, ventana D-13).
 *
 * Las invitaciones se activan con el `InvitationService` real y las compras
 * van por HTTP (`assignPlan`), así que el camino es el de producción. Sin ids
 * hardcodeados; fechas relativas a `todayInTz`.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { cleanAllTestData, createTestApp, getAuthToken } from "../helpers";
import * as schema from "../../src/db/schema";
import { addDays, todayInTz } from "../../src/modules/shared/date-utils";
import { tenantValues, tenantWhere } from "../../src/modules/shared/tenant";
import { setInvitationSettings } from "../../src/modules/referrals/invitation-settings";
import { assignPlan } from "../subscriptions/_helpers";
import {
  buildInvitationServices,
  createActiveSub,
  createInviterWithCode,
  createMemberInPhysicalBranch,
  createMemberInVirtualBranch,
  createMembershipPlan,
  createTrialPlan,
  ensurePhysicalBranch,
  ensureVirtualBranch,
  fixtureCtx,
  getAdminUserId,
  resetInvitationSettings,
  uniquePhone10,
  type InvitationsFixtureCtx,
} from "./_helpers";

describe("Fase 194 D-18 — invitados en el pipeline de leads", () => {
  let app: FastifyInstance;
  let ctx: InvitationsFixtureCtx;
  let adminToken: string;
  let adminId: number;
  let arBranch: { id: number; timezone: string };
  let trialPlanId: number;
  let membershipPlanId: number;

  beforeAll(async () => {
    app = await createTestApp();
    ctx = fixtureCtx(app);
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
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
    await ensureVirtualBranch(ctx);
    // `subscription_plans` se vacía con cleanAllTestData: crear DESPUÉS.
    trialPlanId = (await createTrialPlan(ctx, { country: "AR" })).id;
    membershipPlanId = (await createMembershipPlan(ctx, { country: "AR" })).id;
  });

  // ─── helpers ───────────────────────────────────────────────────────────

  async function readUser(id: number) {
    const [row] = await app.db
      .select({
        status: schema.users.status,
        leadStatus: schema.users.leadStatus,
        leadStatusSource: schema.users.leadStatusSource,
        purchasedPlanId: schema.users.purchasedPlanId,
        convertedAt: schema.users.convertedAt,
      })
      .from(schema.users)
      .where(
        and(tenantWhere(schema.users, ctx.tenant), eq(schema.users.id, id)),
      );
    return row;
  }

  async function readInvitation(id: number) {
    const [row] = await app.db
      .select({
        convertedAt: schema.invitations.convertedAt,
        convertedSubscriptionId: schema.invitations.convertedSubscriptionId,
      })
      .from(schema.invitations)
      .where(
        and(
          tenantWhere(schema.invitations, ctx.tenant),
          eq(schema.invitations.id, id),
        ),
      );
    return row;
  }

  /** Activa una invitación real (canal asistido) para `inviteeId`. */
  async function activateFor(
    inviteeId: number,
  ): Promise<{ invitationId: number; subscriptionId: number }> {
    const inviter = await createInviterWithCode(ctx);
    const { invitationService } = buildInvitationServices(app);
    const result = await invitationService.activate(ctx.tenant, {
      inviterId: inviter.id,
      invitedUserId: inviteeId,
      branchId: arBranch.id,
      phone: uniquePhone10(),
      channel: "assisted",
      createdBy: adminId,
    });
    return {
      invitationId: result.invitationId,
      subscriptionId: result.subscriptionId,
    };
  }

  /** Invitado nuevo (freemium en la sede virtual) con su invitación activada. */
  async function seedActivatedInvitee(): Promise<{
    inviteeId: number;
    invitationId: number;
    subscriptionId: number;
  }> {
    const member = await createMemberInVirtualBranch(ctx);
    const activated = await activateFor(member.id);
    return { inviteeId: member.id, ...activated };
  }

  /** Compra una membresía paga por HTTP (la charge-path real). */
  async function buy(
    userId: number,
    overrides: Record<string, unknown> = {},
  ): Promise<number> {
    // `startDate` en la tz de la sede: el helper por defecto usa la fecha UTC y
    // de noche (UTC ya es "mañana") la sub nace sin arrancar (trampa UTC vs
    // `todayInTz(sede)` de la memoria del proyecto).
    const res = await assignPlan(app, adminToken, userId, {
      planId: membershipPlanId,
      branchId: arBranch.id,
      startDate: todayInTz(arBranch.timezone),
      ...overrides,
    });
    expect(res.statusCode, JSON.stringify(res.body)).toBe(201);
    return res.body.id as number;
  }

  /** Corre la fecha de vencimiento de los accesos `days` días atrás. */
  async function expireAccessesDaysAgo(
    invitationId: number,
    days: number,
  ): Promise<void> {
    const today = todayInTz(arBranch.timezone);
    await app.db
      .update(schema.invitations)
      .set({
        accessStartsOn: addDays(today, -days - 10),
        accessExpiresOn: addDays(today, -days),
      })
      .where(
        and(
          tenantWhere(schema.invitations, ctx.tenant),
          eq(schema.invitations.id, invitationId),
        ),
      );
  }

  // ─── conversión ────────────────────────────────────────────────────────

  it("invitado activado (sin SP) que compra presencial pago: activo, lead ganado/auto con el plan comprado (nunca el Invitación) y la invitación atribuida", async () => {
    const { inviteeId, invitationId } = await seedActivatedInvitee();

    // Antes de comprar: sigue siendo lead en seguimiento y alumno en prueba (D-03).
    const antes = await readUser(inviteeId);
    expect(antes.status).toBe("prueba");
    expect(antes.leadStatus).toBe("en_seguimiento");
    expect(antes.convertedAt).toBeNull();

    const subId = await buy(inviteeId);

    const despues = await readUser(inviteeId);
    expect(despues.status).toBe("activo");
    expect(despues.leadStatus).toBe("ganado");
    expect(despues.leadStatusSource).toBe("auto");
    expect(despues.purchasedPlanId).toBe(membershipPlanId);
    expect(despues.purchasedPlanId).not.toBe(trialPlanId);
    expect(despues.convertedAt).not.toBeNull();

    const inv = await readInvitation(invitationId);
    expect(inv.convertedAt).not.toBeNull();
    expect(inv.convertedSubscriptionId).toBe(subId);
  });

  it("D-13: compra a +20 días del vencimiento de los accesos (ventana 30) se atribuye a la invitación", async () => {
    const { inviteeId, invitationId } = await seedActivatedInvitee();
    await expireAccessesDaysAgo(invitationId, 20);

    const subId = await buy(inviteeId);

    const inv = await readInvitation(invitationId);
    expect(inv.convertedAt).not.toBeNull();
    expect(inv.convertedSubscriptionId).toBe(subId);
    expect((await readUser(inviteeId)).leadStatus).toBe("ganado");
  });

  it("D-13: compra a +40 días del vencimiento: el lead queda ganado pero la invitación NO se atribuye", async () => {
    const { inviteeId, invitationId } = await seedActivatedInvitee();
    await expireAccessesDaysAgo(invitationId, 40);

    await buy(inviteeId);

    const user = await readUser(inviteeId);
    expect(user.leadStatus).toBe("ganado");
    expect(user.purchasedPlanId).toBe(membershipPlanId);
    const inv = await readInvitation(invitationId);
    expect(inv.convertedAt).toBeNull();
    expect(inv.convertedSubscriptionId).toBeNull();
  });

  it("la ventana de compra tardía es un parámetro del gimnasio: con 5 días, +10 ya no se atribuye", async () => {
    await setInvitationSettings(app.db, ctx.tenant, {
      latePurchaseWindowDays: 5,
    });
    const { inviteeId, invitationId } = await seedActivatedInvitee();
    await expireAccessesDaysAgo(invitationId, 10);

    await buy(inviteeId);

    expect((await readInvitation(invitationId)).convertedAt).toBeNull();
    expect((await readUser(inviteeId)).leadStatus).toBe("ganado");
  });

  it("ex socio con converted_at histórico, invitado, que vuelve a comprar: ganado vía el paso explícito y la invitación atribuida", async () => {
    // Ex socio: su última membresía venció hace ~8 meses (elegible, D-11) y ya
    // tuvo una conversión de lead: el gate del UPDATE (`converted_at IS NULL`)
    // NO lo cubre.
    const exSocio = await createMemberInPhysicalBranch(ctx, {
      status: "inactivo",
      phone: uniquePhone10(),
    });
    await createActiveSub(ctx, {
      userId: exSocio.id,
      planId: membershipPlanId,
      status: "expired",
      startOffsetDays: -300,
      endOffsetDays: -240,
    });
    const historico = new Date(Date.now() - 300 * 24 * 60 * 60 * 1000);
    await app.db
      .update(schema.users)
      .set({
        convertedAt: historico,
        leadStatus: "ganado",
        leadStatusSource: "auto",
        purchasedPlanId: membershipPlanId,
      })
      .where(
        and(
          tenantWhere(schema.users, ctx.tenant),
          eq(schema.users.id, exSocio.id),
        ),
      );
    const { invitationId } = await activateFor(exSocio.id);
    // Activar lo devuelve a "en seguimiento" (D-18).
    expect((await readUser(exSocio.id)).leadStatus).toBe("en_seguimiento");

    const subId = await buy(exSocio.id);

    const user = await readUser(exSocio.id);
    expect(user.status).toBe("activo");
    expect(user.leadStatus).toBe("ganado");
    expect(user.purchasedPlanId).toBe(membershipPlanId);
    // El `converted_at` histórico no se pisa (el gate no volvió a correr).
    // (MySQL redondea el TIMESTAMP al segundo: tolerancia de 1 s.)
    expect(
      Math.abs((user.convertedAt?.getTime() ?? 0) - historico.getTime()),
    ).toBeLessThanOrEqual(1000);
    const inv = await readInvitation(invitationId);
    expect(inv.convertedAt).not.toBeNull();
    expect(inv.convertedSubscriptionId).toBe(subId);
  });

  it("T-194-44: un lead marcado a mano (perdido/manual) NO se pisa al comprar, pero la compra igual se atribuye a la invitación", async () => {
    const { inviteeId, invitationId } = await seedActivatedInvitee();
    await app.db
      .update(schema.users)
      .set({ leadStatus: "perdido", leadStatusSource: "manual" })
      .where(
        and(
          tenantWhere(schema.users, ctx.tenant),
          eq(schema.users.id, inviteeId),
        ),
      );

    const subId = await buy(inviteeId);

    const user = await readUser(inviteeId);
    expect(user.status).toBe("activo");
    expect(user.leadStatus).toBe("perdido");
    expect(user.leadStatusSource).toBe("manual");
    expect(user.purchasedPlanId).toBeNull();
    const inv = await readInvitation(invitationId);
    expect(inv.convertedSubscriptionId).toBe(subId);
  });

  it("D-03: invitado con accesos vigentes y sin compra sigue en prueba, lead en seguimiento y sin atribuir", async () => {
    const { inviteeId, invitationId } = await seedActivatedInvitee();

    const user = await readUser(inviteeId);
    expect(user.status).toBe("prueba");
    expect(user.leadStatus).toBe("en_seguimiento");
    expect(user.purchasedPlanId).toBeNull();
    expect(user.convertedAt).toBeNull();
    expect((await readInvitation(invitationId)).convertedAt).toBeNull();
  });

  it("una compra de $0 (bonificada) no convierte la invitación ni el lead", async () => {
    const { inviteeId, invitationId } = await seedActivatedInvitee();

    await buy(inviteeId, {
      priceOverrideAmount: 0,
      priceOverrideReason: "cortesía de prueba",
    });

    const user = await readUser(inviteeId);
    expect(user.leadStatus).toBe("en_seguimiento");
    expect(user.purchasedPlanId).toBeNull();
    expect(user.convertedAt).toBeNull();
    expect((await readInvitation(invitationId)).convertedAt).toBeNull();
  });

  it("lead de SP clásico (sin invitación): el comportamiento de hoy sigue intacto (ganado, converted_at, plan comprado)", async () => {
    const member = await createMemberInPhysicalBranch(ctx, {
      status: "prueba",
    });
    await app.db
      .update(schema.users)
      .set({ leadStatus: "en_seguimiento", leadStatusSource: "auto" })
      .where(
        and(
          tenantWhere(schema.users, ctx.tenant),
          eq(schema.users.id, member.id),
        ),
      );
    const [activity] = await app.db
      .insert(schema.activities)
      .values(
        tenantValues(ctx.tenant, {
          name: `act-sp-${Date.now().toString(36)}`,
          description: "sp clásica",
        }),
      )
      .$returningId();
    const [schedule] = await app.db
      .insert(schema.schedules)
      .values(
        tenantValues(ctx.tenant, {
          branchId: arBranch.id,
          activityId: activity.id,
          dayOfWeek: 1,
          startTime: "08:00",
          endTime: "09:00",
        }),
      )
      .$returningId();
    await app.db.insert(schema.bookings).values(
      tenantValues(ctx.tenant, {
        memberId: member.id,
        scheduleId: schedule.id,
        bookingDate: addDays(todayInTz(arBranch.timezone), -3),
        status: "confirmado" as const,
        isTrial: true,
      }),
    );

    await buy(member.id);

    const user = await readUser(member.id);
    expect(user.status).toBe("activo");
    expect(user.leadStatus).toBe("ganado");
    expect(user.leadStatusSource).toBe("auto");
    expect(user.purchasedPlanId).toBe(membershipPlanId);
    expect(user.convertedAt).not.toBeNull();
  });

  it("T-194-46: la activación y la compra no marcan ninguna reserva como is_trial", async () => {
    const { inviteeId } = await seedActivatedInvitee();
    await buy(inviteeId);

    const trialBookings = await app.db
      .select({ id: schema.bookings.id })
      .from(schema.bookings)
      .where(
        and(
          tenantWhere(schema.bookings, ctx.tenant),
          eq(schema.bookings.memberId, inviteeId),
          eq(schema.bookings.isTrial, true),
        ),
      );
    expect(trialBookings).toHaveLength(0);
  });

  it("camino ctx = null (cron de vencimiento) sobre un invitado: no lanza, no convierte y no cambia el lead", async () => {
    const { inviteeId, invitationId, subscriptionId } =
      await seedActivatedInvitee();
    // Los accesos vencieron ayer pero la sub sigue `active`: la barre el cron.
    await app.db
      .update(schema.subscriptions)
      .set({ endDate: addDays(todayInTz(arBranch.timezone), -2) })
      .where(
        and(
          tenantWhere(schema.subscriptions, ctx.tenant),
          eq(schema.subscriptions.id, subscriptionId),
        ),
      );

    const { subscriptionService } = buildInvitationServices(app);
    const processed = await subscriptionService.autoExpireDueSubscriptions();
    expect(processed).toBeGreaterThanOrEqual(1);

    const user = await readUser(inviteeId);
    expect(user.status).toBe("prueba");
    expect(user.leadStatus).toBe("en_seguimiento");
    expect(user.purchasedPlanId).toBeNull();
    expect((await readInvitation(invitationId)).convertedAt).toBeNull();
  });
});
