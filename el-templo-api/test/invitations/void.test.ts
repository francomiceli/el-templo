/**
 * Fase 194 Plan 09 (D-04, T-194-32) — anulación de una invitación por staff.
 *
 * `voidInvitation`: `status='voided'` + voided_by/at/reason, sin DELETE; libera
 * el cupo del invitador y la ventana de 90 días del invitado; si la sub de
 * accesos sigue vigente la cierra `completed` (mismo helper que la compra, D-07)
 * y si el invitado ya compró no toca ninguna sub.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { createTestApp, cleanAllTestData, todayStr } from "../helpers";
import * as schema from "../../src/db/schema";
import { tenantWhere } from "../../src/modules/shared/tenant";
import type { InvitationService } from "../../src/modules/referrals/invitation-service";
import type { SubscriptionService } from "../../src/modules/subscriptions/service";
import {
  limpiarSegundoGimnasio,
  seedSecondTenant,
  TENANT_DOS,
} from "../fixtures/second-tenant";
import {
  buildInvitationServices,
  createInvitationRow,
  createInviterWithCode,
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

describe("Fase 194 D-04 — anular una invitación (staff)", () => {
  let app: FastifyInstance;
  let ctx: InvitationsFixtureCtx;
  let service: InvitationService;
  let subscriptionService: SubscriptionService;
  let adminId: number;
  let branchId: number;

  beforeAll(async () => {
    app = await createTestApp();
    ctx = fixtureCtx(app);
    ({ invitationService: service, subscriptionService } =
      buildInvitationServices(app));
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
    branchId = (await ensurePhysicalBranch(ctx, "AR")).id;
    await createTrialPlan(ctx, { country: "AR" });
  });

  async function activate(
    inviter: { code: string },
    invitee: { id: number },
  ): Promise<{ invitationId: number; subscriptionId: number }> {
    return service.activate(ctx.tenant, {
      channel: "self_service",
      code: inviter.code,
      invitedUserId: invitee.id,
      branchId,
      phone: uniquePhone10(),
      createdBy: null,
    });
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

  async function readSubStatus(id: number): Promise<string> {
    const [row] = await app.db
      .select({ status: schema.subscriptions.status })
      .from(schema.subscriptions)
      .where(
        and(
          tenantWhere(schema.subscriptions, ctx.tenant),
          eq(schema.subscriptions.id, id),
        ),
      );
    if (!row) throw new Error(`sub ${id} no existe`);
    return row.status;
  }

  async function readUserStatus(id: number) {
    const [row] = await app.db
      .select({ status: schema.users.status })
      .from(schema.users)
      .where(
        and(tenantWhere(schema.users, ctx.tenant), eq(schema.users.id, id)),
      );
    return row?.status;
  }

  it("anula una activa con accesos vigentes: voided + rastro, sub de accesos completed y status sin membresía queda en prueba", async () => {
    const inviter = await createInviterWithCode(ctx);
    const invitee = await createMemberInVirtualBranch(ctx);
    const { invitationId, subscriptionId } = await activate(inviter, invitee);
    expect(await readSubStatus(subscriptionId)).toBe("active");

    await service.voidInvitation(ctx.tenant, invitationId, {
      voidedBy: adminId,
      reason: "Cargada por error",
    });

    const row = await readInvitation(invitationId);
    expect(row.status).toBe("voided");
    expect(row.voidedBy).toBe(adminId);
    expect(row.voidedAt).not.toBeNull();
    expect(row.voidReason).toBe("Cargada por error");
    // La fila y el vínculo con su sub se conservan: sin DELETE.
    expect(row.subscriptionId).toBe(subscriptionId);
    expect(await readSubStatus(subscriptionId)).toBe("completed");
    // Sin membresía real el status no baja a inactivo: queda `prueba` (D-01).
    expect(await readUserStatus(invitee.id)).toBe("prueba");
  });

  it("libera el cupo del invitador (+1) y la ventana de 90 días del invitado", async () => {
    const inviter = await createInviterWithCode(ctx);
    const invitee = await createMemberInVirtualBranch(ctx);
    const phone = uniquePhone10();
    const { invitationId } = await service.activate(ctx.tenant, {
      channel: "self_service",
      code: inviter.code,
      invitedUserId: invitee.id,
      branchId,
      phone,
      createdBy: null,
    });
    const before = await service.getInviterQuota(ctx.tenant, inviter.id);
    expect(before.remaining).toBe(1);
    const blocked = await service.evaluateInviteeEligibility(ctx.tenant, {
      inviterId: inviter.id,
      invitedUserId: invitee.id,
      phone,
      branchId,
    });
    expect(blocked.reason).toBe("invitee_recent_invitation");

    await service.voidInvitation(ctx.tenant, invitationId, {
      voidedBy: adminId,
      reason: "Duplicada",
    });

    const after = await service.getInviterQuota(ctx.tenant, inviter.id);
    expect(after.remaining).toBe(2);
    expect(after.used).toBe(0);
    const free = await service.evaluateInviteeEligibility(ctx.tenant, {
      inviterId: inviter.id,
      invitedUserId: invitee.id,
      phone,
      branchId,
    });
    expect(free.eligible).toBe(true);
  });

  it("tras anular, el mismo invitado se puede volver a activar (otro invitador) y la fila vieja se conserva", async () => {
    const one = await createInviterWithCode(ctx);
    const two = await createInviterWithCode(ctx);
    const invitee = await createMemberInVirtualBranch(ctx);
    const first = await activate(one, invitee);
    await service.voidInvitation(ctx.tenant, first.invitationId, {
      voidedBy: adminId,
      reason: "Invitador equivocado",
    });

    const second = await activate(two, invitee);

    expect(second.invitationId).not.toBe(first.invitationId);
    expect((await readInvitation(first.invitationId)).status).toBe("voided");
    expect((await readInvitation(second.invitationId)).status).toBe("active");
    expect(await readSubStatus(first.subscriptionId)).toBe("completed");
    expect(await readSubStatus(second.subscriptionId)).toBe("active");
  });

  it("anular una invitación ya anulada: 409 y no pisa el rastro original", async () => {
    const inviter = await createInviterWithCode(ctx);
    const invitee = await createMemberInVirtualBranch(ctx);
    const { invitationId } = await activate(inviter, invitee);
    await service.voidInvitation(ctx.tenant, invitationId, {
      voidedBy: adminId,
      reason: "Primera",
    });

    await expect(
      service.voidInvitation(ctx.tenant, invitationId, {
        voidedBy: adminId,
        reason: "Segunda",
      }),
    ).rejects.toMatchObject({ statusCode: 409 });

    expect((await readInvitation(invitationId)).voidReason).toBe("Primera");
  });

  it("dos anulaciones simultáneas: una pasa y la otra da 409", async () => {
    const inviter = await createInviterWithCode(ctx);
    const invitee = await createMemberInVirtualBranch(ctx);
    const { invitationId } = await activate(inviter, invitee);

    const results = await Promise.allSettled([
      service.voidInvitation(ctx.tenant, invitationId, {
        voidedBy: adminId,
        reason: "A",
      }),
      service.voidInvitation(ctx.tenant, invitationId, {
        voidedBy: adminId,
        reason: "B",
      }),
    ]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find(
      (r): r is PromiseRejectedResult => r.status === "rejected",
    );
    expect(rejected?.reason).toMatchObject({ statusCode: 409 });
  });

  it("id inexistente o de otro gimnasio: 404 y la fila ajena no se toca", async () => {
    const gym2 = await seedSecondTenant(app);
    try {
      const ctx2 = fixtureCtx(app, TENANT_DOS);
      const foreign = await createInvitationRow(ctx2, {
        inviterId: gym2.socios[0].id,
        invitedUserId: gym2.socios[1].id,
        branchId: gym2.branchId,
      });

      await expect(
        service.voidInvitation(ctx.tenant, foreign.id, {
          voidedBy: adminId,
          reason: "Intento cruzado",
        }),
      ).rejects.toMatchObject({ statusCode: 404 });
      await expect(
        service.voidInvitation(ctx.tenant, 2147483000, {
          voidedBy: adminId,
          reason: "No existe",
        }),
      ).rejects.toMatchObject({ statusCode: 404 });

      const [row] = await app.db
        .select({ status: schema.invitations.status })
        .from(schema.invitations)
        .where(
          and(
            tenantWhere(schema.invitations, ctx2.tenant),
            eq(schema.invitations.id, foreign.id),
          ),
        );
      expect(row.status).toBe("active");
    } finally {
      await limpiarSegundoGimnasio(app);
    }
  });

  it("el invitado ya compró (accesos completed): solo marca voided, no toca subs ni el status activo", async () => {
    const inviter = await createInviterWithCode(ctx);
    const invitee = await createMemberInVirtualBranch(ctx);
    const { invitationId, subscriptionId } = await activate(inviter, invitee);
    // Compra real: D-07 cierra los accesos y el invitado pasa a `activo`.
    const real = await createMembershipPlan(ctx);
    const bought = await subscriptionService.assignPlan(
      ctx.tenant,
      invitee.id,
      {
        planId: real.id,
        branchId,
        startDate: todayStr(),
        priceTypeApplied: "regular",
        paymentMethod: "cash",
        priceOverrideAmount: 0,
        priceOverrideReason: "Compra de test",
      },
      adminId,
    );
    expect(await readSubStatus(subscriptionId)).toBe("completed");
    expect(await readUserStatus(invitee.id)).toBe("activo");

    await service.voidInvitation(ctx.tenant, invitationId, {
      voidedBy: adminId,
      reason: "Auditoría",
    });

    expect((await readInvitation(invitationId)).status).toBe("voided");
    expect(await readSubStatus(subscriptionId)).toBe("completed");
    expect(await readSubStatus(bought.id)).toBe("active");
    expect(await readUserStatus(invitee.id)).toBe("activo");
  });

  it("invitación sin sub asociada (fixture): se anula sin tocar suscripciones", async () => {
    const inviter = await createInviterWithCode(ctx);
    const invitee = await createMemberInVirtualBranch(ctx);
    const row = await createInvitationRow(ctx, {
      inviterId: inviter.id,
      invitedUserId: invitee.id,
      branchId,
    });

    await service.voidInvitation(ctx.tenant, row.id, {
      voidedBy: adminId,
      reason: "Sin sub",
    });

    expect((await readInvitation(row.id)).status).toBe("voided");
  });

  it("motivo obligatorio y de hasta 64 caracteres: 400 y la invitación sigue activa", async () => {
    const inviter = await createInviterWithCode(ctx);
    const invitee = await createMemberInVirtualBranch(ctx);
    const { invitationId, subscriptionId } = await activate(inviter, invitee);

    await expect(
      service.voidInvitation(ctx.tenant, invitationId, {
        voidedBy: adminId,
        reason: "   ",
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      service.voidInvitation(ctx.tenant, invitationId, {
        voidedBy: adminId,
        reason: "x".repeat(65),
      }),
    ).rejects.toMatchObject({ statusCode: 400 });

    expect((await readInvitation(invitationId)).status).toBe("active");
    expect(await readSubStatus(subscriptionId)).toBe("active");

    // El borde: 64 caracteres exactos entra.
    await service.voidInvitation(ctx.tenant, invitationId, {
      voidedBy: adminId,
      reason: "x".repeat(64),
    });
    expect((await readInvitation(invitationId)).voidReason).toHaveLength(64);
  });

  it("nunca se borra: tras anular la tabla conserva la fila (conteo igual)", async () => {
    const inviter = await createInviterWithCode(ctx);
    const invitee = await createMemberInVirtualBranch(ctx);
    const { invitationId } = await activate(inviter, invitee);
    const count = async () =>
      (
        await app.db
          .select({ id: schema.invitations.id })
          .from(schema.invitations)
          .where(tenantWhere(schema.invitations, ctx.tenant))
      ).length;
    const before = await count();

    await service.voidInvitation(ctx.tenant, invitationId, {
      voidedBy: adminId,
      reason: "Rastro",
    });

    expect(await count()).toBe(before);
  });
});
