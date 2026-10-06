/**
 * Fase 194 plan 06 — los accesos de invitación conviven con el ciclo de vida
 * de suscripciones.
 *
 *   - D-07: comprar un plan real (assignPlan) con accesos vigentes NO da 409 y
 *     cierra el remanente como `completed` en la MISMA tx (jamás `cancelled`).
 *   - T-194-17: los accesos no se renuevan (renewSubscription) ni se
 *     "cambian de plan" (changePlan, ramas now y after_current).
 *   - T-194-18: el plan Invitación solo se asigna por `assignInvitationPlan`
 *     (interno); `assignPlan` lo rechaza siempre.
 *   - Pitfall 10 (Task 2): las reservas pendientes cuentan contra el saldo.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import {
  createTestApp,
  getAuthToken,
  cleanAllTestData,
  todayStr,
  dateOffsetStr,
} from "../helpers";
import * as schema from "../../src/db/schema";
import { SubscriptionService } from "../../src/modules/subscriptions/service";
import { EnrollmentService } from "../../src/modules/programs/enrollment-service";
import { tenantWhere } from "../../src/modules/shared/tenant";
import { SUBSCRIPTIONS_URL, assignPlan } from "../subscriptions/_helpers";
import {
  createActiveSub,
  createMemberInPhysicalBranch,
  createMembershipPlan,
  createTrialPlan,
  fixtureCtx,
  type InvitationsFixtureCtx,
} from "./_helpers";

describe("Fase 194 D-07 — comprar con accesos de invitación vigentes", () => {
  let app: FastifyInstance;
  let ctx: InvitationsFixtureCtx;
  let adminToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    ctx = fixtureCtx(app);
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
  });

  afterAll(async () => {
    await cleanAllTestData(app);
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
  });

  async function readSub(id: number) {
    const [row] = await app.db
      .select({
        status: schema.subscriptions.status,
        endDate: schema.subscriptions.endDate,
        classesRemaining: schema.subscriptions.classesRemaining,
        membershipKind: schema.subscriptions.membershipKind,
      })
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

  async function setClassesRemaining(id: number, n: number) {
    await app.db
      .update(schema.subscriptions)
      .set({ classesRemaining: n, classesBudget: 3 })
      .where(
        and(
          tenantWhere(schema.subscriptions, ctx.tenant),
          eq(schema.subscriptions.id, id),
        ),
      );
  }

  async function readUserStatus(userId: number) {
    const [row] = await app.db
      .select({ status: schema.users.status })
      .from(schema.users)
      .where(
        and(tenantWhere(schema.users, ctx.tenant), eq(schema.users.id, userId)),
      );
    return row?.status;
  }

  /** Invitado con 2 accesos restantes y un plan presencial real para comprar. */
  async function seedInvitado(
    status: "active" | "paused" | "scheduled" = "active",
  ) {
    const member = await createMemberInPhysicalBranch(ctx, {
      status: "prueba",
    });
    const trial = await createTrialPlan(ctx);
    const real = await createMembershipPlan(ctx);
    const access = await createActiveSub(ctx, {
      userId: member.id,
      planId: trial.id,
      status,
      startOffsetDays: status === "scheduled" ? 1 : -1,
      endOffsetDays: 5,
    });
    await setClassesRemaining(access.id, 2);
    return { member, trial, real, access };
  }

  it("comprar un plan real: 201, accesos `completed` sin tocar fecha ni saldo, sub nueva activa", async () => {
    const { member, real, access } = await seedInvitado();

    const res = await assignPlan(app, adminToken, member.id, {
      planId: real.id,
      branchId: member.branchId,
    });
    expect(res.statusCode).toBe(201);

    const closed = await readSub(access.id);
    // D-07: cierre no-baja. Jamás `cancelled`.
    expect(closed.status).toBe("completed");
    expect(closed.endDate).toBe(access.endDate);
    expect(closed.classesRemaining).toBe(2);

    const bought = await readSub(res.body.id as number);
    expect(bought.status).toBe("active");
    expect(bought.membershipKind).toBe("paga");
    expect(await readUserStatus(member.id)).toBe("activo");
  });

  it("accesos pausados también se cierran al comprar", async () => {
    const { member, real, access } = await seedInvitado("paused");

    const res = await assignPlan(app, adminToken, member.id, {
      planId: real.id,
      branchId: member.branchId,
    });
    expect(res.statusCode).toBe(201);
    expect((await readSub(access.id)).status).toBe("completed");
  });

  it("rollback: si la tx falla tras el cierre, los accesos siguen activos", async () => {
    const { member, real, access } = await seedInvitado();

    // amountReceived > precio: recordAssignmentCharge tira DESPUÉS del UPDATE
    // de D-07 y de la inserción de la sub, dentro de la misma tx.
    const res = await assignPlan(app, adminToken, member.id, {
      planId: real.id,
      branchId: member.branchId,
      amountReceived: 99999999,
    });
    expect(res.statusCode).toBe(400);

    expect((await readSub(access.id)).status).toBe("active");
    const subs = await app.db
      .select({ id: schema.subscriptions.id })
      .from(schema.subscriptions)
      .where(
        and(
          tenantWhere(schema.subscriptions, ctx.tenant),
          eq(schema.subscriptions.userId, member.id),
        ),
      );
    expect(subs.map((s) => s.id)).toEqual([access.id]);
  });

  it("accesos `scheduled` (aún no vigentes) siguen contando como conflicto 409", async () => {
    const { member, real } = await seedInvitado("scheduled");
    const res = await assignPlan(app, adminToken, member.id, {
      planId: real.id,
      branchId: member.branchId,
    });
    expect(res.statusCode).toBe(409);
  });

  it("el conflicto de grupo existente no se debilita: presencial + presencial sigue 409", async () => {
    const member = await createMemberInPhysicalBranch(ctx, {
      status: "activo",
    });
    const planA = await createMembershipPlan(ctx);
    const planB = await createMembershipPlan(ctx);
    await createActiveSub(ctx, { userId: member.id, planId: planA.id });

    const res = await assignPlan(app, adminToken, member.id, {
      planId: planB.id,
      branchId: member.branchId,
    });
    expect(res.statusCode).toBe(409);
    expect(res.body.message as string).toContain("presencial activa");
  });

  it("socio con presencial real + accesos: otro presencial sigue 409 y los accesos NO se cierran", async () => {
    const { member, real, access } = await seedInvitado();
    const other = await createMembershipPlan(ctx);
    await createActiveSub(ctx, { userId: member.id, planId: other.id });

    const res = await assignPlan(app, adminToken, member.id, {
      planId: real.id,
      branchId: member.branchId,
    });
    expect(res.statusCode).toBe(409);
    expect((await readSub(access.id)).status).toBe("active");
  });
});

describe("Fase 194 T-194-17/18 — guards del plan Invitación", () => {
  let app: FastifyInstance;
  let ctx: InvitationsFixtureCtx;
  let adminToken: string;
  let svc: SubscriptionService;
  // Actor real: `audit_log.actor_id` tiene FK a users (assignPlan audita).
  let adminId: number;

  beforeAll(async () => {
    app = await createTestApp();
    ctx = fixtureCtx(app);
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
    const [admin] = await app.db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(
        and(
          tenantWhere(schema.users, ctx.tenant),
          eq(schema.users.email, "admin@test.com"),
        ),
      );
    adminId = admin.id;
    svc = new SubscriptionService(
      app.db,
      app.log,
      undefined,
      new EnrollmentService(app.db, app.log),
    );
  });

  afterAll(async () => {
    await cleanAllTestData(app);
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
  });

  it("renewSubscription de una sub Invitación -> 400", async () => {
    const member = await createMemberInPhysicalBranch(ctx, {
      status: "prueba",
    });
    const trial = await createTrialPlan(ctx);
    const access = await createActiveSub(ctx, {
      userId: member.id,
      planId: trial.id,
    });

    const res = await app.inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription/renew`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { paymentMethod: "cash", subscriptionId: access.id },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toContain(
      "Los accesos de invitación no se renuevan",
    );
  });

  for (const startMode of ["now", "after_current"] as const) {
    it(`changePlan (${startMode}) sobre una sub Invitación -> 400`, async () => {
      const member = await createMemberInPhysicalBranch(ctx, {
        status: "prueba",
      });
      const trial = await createTrialPlan(ctx);
      const real = await createMembershipPlan(ctx);
      await createActiveSub(ctx, { userId: member.id, planId: trial.id });

      const res = await app.inject({
        method: "POST",
        url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription/change-plan`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          planId: real.id,
          branchId: member.branchId,
          startDate: todayStr(),
          priceTypeApplied: "regular",
          paymentMethod: "cash",
          startMode,
        },
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).message).toContain(
        "asigná el plan nuevo (los accesos se cierran solos)",
      );
    });
  }

  it("assignPlan (servicio) con el plan Invitación -> 400", async () => {
    const member = await createMemberInPhysicalBranch(ctx);
    const trial = await createTrialPlan(ctx);

    await expect(
      svc.assignPlan(
        ctx.tenant,
        member.id,
        {
          planId: trial.id,
          branchId: member.branchId,
          startDate: todayStr(),
          priceTypeApplied: "regular",
          paymentMethod: "cash",
          priceOverrideAmount: 0,
          priceOverrideReason: "Invitación",
        },
        adminId,
      ),
    ).rejects.toThrow(
      "El plan Invitación se asigna solo activando una invitación",
    );
  });

  it("assignInvitationPlan con el plan Invitación crea la sub bonificada", async () => {
    const member = await createMemberInPhysicalBranch(ctx);
    const trial = await createTrialPlan(ctx);

    const sub = await svc.assignInvitationPlan(
      ctx.tenant,
      member.id,
      {
        planId: trial.id,
        branchId: member.branchId,
        startDate: todayStr(),
        priceTypeApplied: "regular",
        paymentMethod: "cash",
        priceOverrideAmount: 0,
        priceOverrideReason: "Invitación",
        endDateOverride: dateOffsetStr(10),
      },
      adminId,
    );
    expect(sub.status).toBe("active");
    expect(sub.endDate).toBe(dateOffsetStr(10));
    expect(sub.classesRemaining).toBe(3);

    const [row] = await app.db
      .select({ membershipKind: schema.subscriptions.membershipKind })
      .from(schema.subscriptions)
      .where(
        and(
          tenantWhere(schema.subscriptions, ctx.tenant),
          eq(schema.subscriptions.id, sub.id),
        ),
      );
    expect(row.membershipKind).toBe("bonificada");
  });

  it("assignInvitationPlan con un plan que NO es Invitación -> 400", async () => {
    const member = await createMemberInPhysicalBranch(ctx);
    const real = await createMembershipPlan(ctx);

    await expect(
      svc.assignInvitationPlan(
        ctx.tenant,
        member.id,
        {
          planId: real.id,
          branchId: member.branchId,
          startDate: todayStr(),
          priceTypeApplied: "regular",
          paymentMethod: "cash",
          priceOverrideAmount: 0,
          priceOverrideReason: "Invitación",
        },
        adminId,
      ),
    ).rejects.toThrow("solo asigna el plan Invitación");
  });
});
