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
  registerUser,
  dateOffsetStr,
} from "../helpers";
import * as schema from "../../src/db/schema";
import { SubscriptionService } from "../../src/modules/subscriptions/service";
import { EnrollmentService } from "../../src/modules/programs/enrollment-service";
import { addDays, todayInTz } from "../../src/modules/shared/date-utils";
import { tenantValues, tenantWhere } from "../../src/modules/shared/tenant";
import { SUBSCRIPTIONS_URL, assignPlan } from "../subscriptions/_helpers";
import {
  createActiveSub,
  ensurePhysicalBranch,
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

    // startDate en la fecha de la sede: el default del helper es UTC y de
    // noche (21-24 ART) arrancaría "mañana" respecto de CURDATE().
    const res = await assignPlan(app, adminToken, member.id, {
      planId: real.id,
      branchId: member.branchId,
      startDate: todayInTz("America/Argentina/Buenos_Aires"),
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
          startDate: todayInTz("America/Argentina/Buenos_Aires"),
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
          startDate: todayInTz("America/Argentina/Buenos_Aires"),
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
        startDate: todayInTz("America/Argentina/Buenos_Aires"),
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
          startDate: todayInTz("America/Argentina/Buenos_Aires"),
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

describe("Fase 194 Pitfall 10 — reservas pendientes cuentan contra el saldo de accesos", () => {
  const RESERVE_URL = "/api/members/scheduling/reserve";
  let app: FastifyInstance;
  let ctx: InvitationsFixtureCtx;
  let branch: { id: number; timezone: string };
  // Un horario por día de la semana (1=lunes..7=domingo), de una actividad regular.
  let scheduleByDow: Map<number, number>;
  let today: string;

  beforeAll(async () => {
    app = await createTestApp();
    ctx = fixtureCtx(app);
  });

  afterAll(async () => {
    await cleanAllTestData(app);
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    branch = await ensurePhysicalBranch(ctx, "AR");
    today = todayInTz(branch.timezone);
    const [act] = await app.db
      .insert(schema.activities)
      .values(
        tenantValues(ctx.tenant, {
          name: "Pitfall 10",
          branchId: branch.id,
        }),
      )
      .$returningId();
    scheduleByDow = new Map();
    for (let dow = 1; dow <= 7; dow++) {
      const [sch] = await app.db
        .insert(schema.schedules)
        .values(
          tenantValues(ctx.tenant, {
            activityId: act.id,
            branchId: branch.id,
            dayOfWeek: dow,
            startTime: "10:00",
            endTime: "11:00",
            isActive: true,
          }),
        )
        .$returningId();
      scheduleByDow.set(dow, sch.id);
    }
  });

  function scheduleFor(date: string): number {
    const jsDay = new Date(`${date}T12:00:00Z`).getUTCDay();
    const id = scheduleByDow.get(jsDay === 0 ? 7 : jsDay);
    if (id === undefined) throw new Error(`sin horario para ${date}`);
    return id;
  }

  /** Socio logueable (registro real) con una sub directa y saldo fijado. */
  async function seedMember(opts: {
    plan: "invitacion" | "presencial";
    classesRemaining: number;
    pendingFar: number;
  }) {
    const email = `p10-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@test.com`;
    const reg = await registerUser(app, {
      email,
      password: "pass123456",
      branchId: branch.id,
    });
    const userId = (reg.user as { id: number }).id;
    const token = await getAuthToken(app, email, "pass123456");
    const plan =
      opts.plan === "invitacion"
        ? await createTrialPlan(ctx)
        : await createMembershipPlan(ctx);
    const sub = await createActiveSub(ctx, {
      userId,
      planId: plan.id,
      branchId: branch.id,
    });
    await app.db
      .update(schema.subscriptions)
      .set({ classesRemaining: opts.classesRemaining, classesBudget: 3 })
      .where(
        and(
          tenantWhere(schema.subscriptions, ctx.tenant),
          eq(schema.subscriptions.id, sub.id),
        ),
      );
    // Reservas pendientes lejos de la ventana de reserva (hoy+9...): comprometen
    // saldo sin interferir con la regla de un turno por día ni el tope semanal.
    for (let i = 0; i < opts.pendingFar; i++) {
      const date = addDays(today, 9 + i);
      await app.db.insert(schema.bookings).values(
        tenantValues(ctx.tenant, {
          memberId: userId,
          scheduleId: scheduleFor(date),
          bookingDate: date,
          status: "reservado" as const,
        }),
      );
    }
    return { userId, token };
  }

  async function reserve(token: string, date: string) {
    const res = await app.inject({
      method: "POST",
      url: RESERVE_URL,
      headers: { authorization: `Bearer ${token}` },
      payload: { scheduleId: scheduleFor(date), date },
    });
    return { statusCode: res.statusCode, body: JSON.parse(res.body) };
  }

  const MSG = "Ya tenés comprometidas todas las clases de tu pase";

  it("invitado con saldo 2 y 1 pendiente: reserva una más y la siguiente se rechaza", async () => {
    const { token } = await seedMember({
      plan: "invitacion",
      classesRemaining: 2,
      pendingFar: 1,
    });

    const first = await reserve(token, addDays(today, 1));
    expect(first.statusCode).toBe(201);

    const second = await reserve(token, addDays(today, 2));
    expect(second.statusCode).toBe(400);
    expect(second.body.message).toContain(MSG);
  });

  it("tras un check-in (saldo 2 de 3) con 2 pendientes no puede reservar otra", async () => {
    const { token } = await seedMember({
      plan: "invitacion",
      classesRemaining: 2,
      pendingFar: 2,
    });

    const res = await reserve(token, addDays(today, 1));
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toContain(MSG);
  });

  it("invitado sin pendientes reserva hasta agotar el saldo", async () => {
    const { token } = await seedMember({
      plan: "invitacion",
      classesRemaining: 2,
      pendingFar: 0,
    });
    expect((await reserve(token, addDays(today, 1))).statusCode).toBe(201);
    expect((await reserve(token, addDays(today, 2))).statusCode).toBe(201);
  });

  it("socio con presencial normal: sin conteo de pendientes (comportamiento sin cambios)", async () => {
    const { token } = await seedMember({
      plan: "presencial",
      classesRemaining: 1,
      pendingFar: 2,
    });

    const res = await reserve(token, addDays(today, 1));
    expect(res.statusCode).toBe(201);
  });
});
