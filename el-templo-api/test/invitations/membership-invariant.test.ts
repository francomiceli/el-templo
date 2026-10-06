/**
 * Fase 194 (D-03) — invariante "un plan `is_trial` da ACCESO, nunca MEMBRESÍA".
 *
 * Una sola definición SQL de "membresía vigente" (`shared/membership.ts`)
 * gobierna `recomputeUserStatus` (status + gate de conversión de lead), los 5
 * helpers de `active-member.ts` (analytics/reports/SEPA) y el estado efectivo
 * de los listados de `members/service.ts`. Estos tests caracterizan la
 * invariante POR FAMILIA de consumidor:
 *
 *   - status:      `users.status` tras `recomputeUserStatus` (camino con ctx real
 *                  vía `activateDueScheduledSubs`, y camino `ctx = null` vía
 *                  `autoExpireDueSubscriptions`, el cron).
 *   - lead:        `purchased_plan_id` / `lead_status` nunca por un plan is_trial.
 *   - helpers:     `activeMemberExists` (con y sin ctx).
 *   - listados:    `GET /api/admin/members?status=` y `/members/search`.
 *   - controles:   presencial sola y presencial + Yoga (sub is_trial) siguen
 *                  `activo` — la forma real de prod que no puede cambiar.
 *
 * `deriveCoveredUntil` NO se testea acá: sigue siendo cobertura de ACCESO.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import {
  createTestApp,
  getAuthToken,
  cleanAllTestData,
  todayStr,
} from "../helpers";
import * as schema from "../../src/db/schema";
import { SubscriptionService } from "../../src/modules/subscriptions/service";
import { EnrollmentService } from "../../src/modules/programs/enrollment-service";
import { activeMemberExists } from "../../src/modules/shared/active-member";
import { tenantValues, tenantWhere } from "../../src/modules/shared/tenant";
import {
  createActiveSub,
  createMemberInPhysicalBranch,
  createMembershipPlan,
  createTrialPlan,
  fixtureCtx,
  type InvitationsFixtureCtx,
} from "./_helpers";

describe("Fase 194 D-03 — is_trial da acceso, nunca membresía", () => {
  let app: FastifyInstance;
  let ctx: InvitationsFixtureCtx;
  let adminToken: string;
  let svc: SubscriptionService;

  beforeAll(async () => {
    app = await createTestApp();
    ctx = fixtureCtx(app);
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
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

  // ─── Helpers ────────────────────────────────────────────────────────────

  async function readUser(userId: number) {
    const [row] = await app.db
      .select({
        status: schema.users.status,
        leadStatus: schema.users.leadStatus,
        purchasedPlanId: schema.users.purchasedPlanId,
        convertedAt: schema.users.convertedAt,
      })
      .from(schema.users)
      .where(
        and(tenantWhere(schema.users, ctx.tenant), eq(schema.users.id, userId)),
      );
    if (!row) throw new Error(`user ${userId} no existe`);
    return row;
  }

  /**
   * Dispara `recomputeUserStatus` con ctx REAL por un camino público: una sub
   * `scheduled` que arranca hoy y se activa vía `activateDueScheduledSubs`
   * (que recomputa el status de cada socio tocado). Casi siempre la sub
   * activada es de un plan is_trial: es justamente el caso bajo prueba.
   */
  async function recomputeViaScheduledSub(
    userId: number,
    scheduledPlanId: number,
  ): Promise<void> {
    await createActiveSub(ctx, {
      userId,
      planId: scheduledPlanId,
      status: "scheduled",
      startOffsetDays: -1,
      endOffsetDays: 5,
    });
    const activated = await svc.activateDueScheduledSubs(ctx.tenant);
    expect(activated).toBeGreaterThanOrEqual(1);
  }

  async function seedTrialBooking(userId: number): Promise<void> {
    const [act] = await app.db
      .insert(schema.activities)
      .values(
        tenantValues(ctx.tenant, { name: "Invariante D-03", branchId: 1 }),
      )
      .$returningId();
    const [sch] = await app.db
      .insert(schema.schedules)
      .values(
        tenantValues(ctx.tenant, {
          activityId: act.id,
          branchId: 1,
          dayOfWeek: 3,
          startTime: "10:00",
          endTime: "11:00",
          isActive: true,
        }),
      )
      .$returningId();
    await app.db.insert(schema.bookings).values(
      tenantValues(ctx.tenant, {
        memberId: userId,
        scheduleId: sch.id,
        bookingDate: todayStr(),
        status: "confirmado" as const,
        isTrial: true,
      }),
    );
  }

  async function countActiveMemberExists(
    userId: number,
    withCtx: boolean,
  ): Promise<number> {
    const rows = await app.db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(
        and(
          tenantWhere(schema.users, ctx.tenant),
          eq(schema.users.id, userId),
          withCtx
            ? activeMemberExists(schema.users.id, ctx.tenant)
            : activeMemberExists(schema.users.id),
        ),
      );
    return rows.length;
  }

  // ─── status ─────────────────────────────────────────────────────────────

  it("socio en prueba con SOLO una sub is_trial vigente NO pasa a activo (ctx real)", async () => {
    const trial = await createTrialPlan(ctx);
    const member = await createMemberInPhysicalBranch(ctx, {
      status: "prueba",
    });

    await recomputeViaScheduledSub(member.id, trial.id);

    expect((await readUser(member.id)).status).toBe("prueba");
  });

  it("camino ctx = null (cron autoExpireDueSubscriptions): al vencer su única membresía, una sub is_trial vigente no lo deja activo", async () => {
    const trial = await createTrialPlan(ctx);
    const membership = await createMembershipPlan(ctx);
    const member = await createMemberInPhysicalBranch(ctx, {
      status: "prueba",
    });
    // Membresía real YA vencida pero todavía 'active' (la que barre el cron)...
    await createActiveSub(ctx, {
      userId: member.id,
      planId: membership.id,
      startOffsetDays: -30,
      endOffsetDays: -2,
    });
    // ...y una sub is_trial vigente que antes lo mantenía "activo".
    await createActiveSub(ctx, { userId: member.id, planId: trial.id });

    const processed = await svc.autoExpireDueSubscriptions();
    expect(processed).toBeGreaterThanOrEqual(1);

    expect((await readUser(member.id)).status).toBe("prueba");
  });

  // ─── helpers de analytics / SEPA ────────────────────────────────────────

  it("activeMemberExists NO incluye al socio con solo una sub is_trial (con y sin ctx)", async () => {
    const trial = await createTrialPlan(ctx);
    const member = await createMemberInPhysicalBranch(ctx, {
      status: "prueba",
    });
    await createActiveSub(ctx, { userId: member.id, planId: trial.id });

    expect(await countActiveMemberExists(member.id, true)).toBe(0);
    expect(await countActiveMemberExists(member.id, false)).toBe(0);
  });

  // ─── listados ───────────────────────────────────────────────────────────

  it("el listado de alumnos y el typeahead NO muestran como activo al socio con solo una sub is_trial", async () => {
    const trial = await createTrialPlan(ctx);
    const member = await createMemberInPhysicalBranch(ctx, {
      status: "prueba",
    });
    await createActiveSub(ctx, { userId: member.id, planId: trial.id });

    const activos = await app.inject({
      method: "GET",
      url: "/api/admin/members?status=activo",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(activos.statusCode).toBe(200);
    const activosBody = JSON.parse(activos.body) as {
      members: Array<{ id: number }>;
    };
    expect(activosBody.members.map((m) => m.id)).not.toContain(member.id);

    const pruebas = await app.inject({
      method: "GET",
      url: "/api/admin/members?status=prueba",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const pruebasBody = JSON.parse(pruebas.body) as {
      members: Array<{ id: number; status: string }>;
    };
    const found = pruebasBody.members.find((m) => m.id === member.id);
    expect(found?.status).toBe("prueba");

    const [u] = await app.db
      .select({ lastName: schema.users.lastName })
      .from(schema.users)
      .where(
        and(
          tenantWhere(schema.users, ctx.tenant),
          eq(schema.users.id, member.id),
        ),
      );
    const search = await app.inject({
      method: "GET",
      url: `/api/admin/members/search?search=${encodeURIComponent(u.lastName ?? "")}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(search.statusCode).toBe(200);
    const searchBody = JSON.parse(search.body) as Array<{
      id: number;
      status: string;
    }>;
    const hit = searchBody.find((m) => m.id === member.id);
    expect(hit?.status).toBe("prueba");
  });

  // ─── gate de conversión de lead ─────────────────────────────────────────

  it("purchased_plan_id nunca es un plan is_trial aunque su sub sea la más reciente", async () => {
    const trial = await createTrialPlan(ctx, { category: "especial" });
    const membership = await createMembershipPlan(ctx);
    const member = await createMemberInPhysicalBranch(ctx, {
      status: "prueba",
    });
    await seedTrialBooking(member.id);
    await app.db
      .update(schema.users)
      .set({ leadStatus: "en_seguimiento" })
      .where(
        and(
          tenantWhere(schema.users, ctx.tenant),
          eq(schema.users.id, member.id),
        ),
      );
    // Presencial vigente, creada ANTES (hace 3 días)...
    await createActiveSub(ctx, {
      userId: member.id,
      planId: membership.id,
      createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    });
    // ...y la sub is_trial (forma Yoga) más reciente.
    await createActiveSub(ctx, { userId: member.id, planId: trial.id });

    await recomputeViaScheduledSub(member.id, trial.id);

    const after = await readUser(member.id);
    expect(after.status).toBe("activo");
    expect(after.leadStatus).toBe("ganado");
    expect(after.purchasedPlanId).toBe(membership.id);
    expect(after.purchasedPlanId).not.toBe(trial.id);
  });

  it("un lead con SP y solo una sub is_trial NO se convierte (ni ganado ni purchased_plan_id)", async () => {
    const trial = await createTrialPlan(ctx);
    const member = await createMemberInPhysicalBranch(ctx, {
      status: "prueba",
    });
    await seedTrialBooking(member.id);
    await app.db
      .update(schema.users)
      .set({ leadStatus: "en_seguimiento" })
      .where(
        and(
          tenantWhere(schema.users, ctx.tenant),
          eq(schema.users.id, member.id),
        ),
      );

    await recomputeViaScheduledSub(member.id, trial.id);

    const after = await readUser(member.id);
    expect(after.status).toBe("prueba");
    expect(after.leadStatus).toBe("en_seguimiento");
    expect(after.purchasedPlanId).toBeNull();
    expect(after.convertedAt).toBeNull();
  });

  // ─── controles (deben pasar antes Y después del cambio) ─────────────────

  it("control: presencial vigente sola → activo y cuenta en activeMemberExists", async () => {
    const membership = await createMembershipPlan(ctx);
    const member = await createMemberInPhysicalBranch(ctx, {
      status: "prueba",
    });
    await createActiveSub(ctx, { userId: member.id, planId: membership.id });
    // Recompute con una segunda membresía (no is_trial) que arranca hoy.
    await recomputeViaScheduledSub(member.id, membership.id);

    expect((await readUser(member.id)).status).toBe("activo");
    expect(await countActiveMemberExists(member.id, true)).toBe(1);
    expect(await countActiveMemberExists(member.id, false)).toBe(1);
  });

  it("control Yoga: presencial vigente + sub is_trial vigente → activo y cuenta en activeMemberExists", async () => {
    const yoga = await createTrialPlan(ctx, { category: "especial" });
    const membership = await createMembershipPlan(ctx);
    const member = await createMemberInPhysicalBranch(ctx, {
      status: "prueba",
    });
    await createActiveSub(ctx, { userId: member.id, planId: membership.id });
    await createActiveSub(ctx, { userId: member.id, planId: yoga.id });

    await recomputeViaScheduledSub(member.id, yoga.id);

    expect((await readUser(member.id)).status).toBe("activo");
    expect(await countActiveMemberExists(member.id, true)).toBe(1);
    expect(await countActiveMemberExists(member.id, false)).toBe(1);

    const activos = await app.inject({
      method: "GET",
      url: "/api/admin/members?status=activo",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const body = JSON.parse(activos.body) as {
      members: Array<{ id: number }>;
    };
    expect(body.members.map((m) => m.id)).toContain(member.id);
  });
});
