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
 * Plan 194-31: indicadores de MEMBRESÍA restantes (distribución de planes,
 * reporte de inactivos, badge `hasActivePlan` de la bandeja de caja, y las
 * métricas de bajas/churn/renovación de analytics). Las vistas que solo
 * MUESTRAN el plan que la persona tiene (listado de alumnos, panel de turno,
 * engagement) quedan sin cambios a propósito.
 *
 * Plan 194-03: cobertura de MEMBRESÍA vs de ACCESO (`deriveMembershipCoveredUntil*`
 * vs `deriveCoveredUntil*`), población activa de frecuencia y Renovaciones.
 * `deriveCoveredUntil` conserva su semántica de ACCESO (cuenta las is_trial);
 * `test/subscriptions/covered-until.test.ts` cubre su contrato original.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import {
  createTestApp,
  getAuthToken,
  cleanAllTestData,
  ensureEfectivoCaja,
  todayStr,
} from "../helpers";
import * as schema from "../../src/db/schema";
import {
  SubscriptionService,
  deriveCoveredUntil,
  deriveCoveredUntilBatch,
  deriveMembershipCoveredUntil,
  deriveMembershipCoveredUntilBatch,
} from "../../src/modules/subscriptions/service";
import { FrequencyService } from "../../src/modules/analytics/frequency-service";
import { RenewalsService } from "../../src/modules/renewals/service";
import { AnalyticsService } from "../../src/modules/analytics/service";
import { ChurnService } from "../../src/modules/analytics/churn-service";
import { RenewalService } from "../../src/modules/analytics/renewal-service";
import { ReportsService } from "../../src/modules/reports/service";
import { addDays, todayInTz } from "../../src/modules/shared/date-utils";
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
    const searchBody = JSON.parse(search.body) as {
      members: Array<{ id: number; status: string | null }>;
    };
    const hit = searchBody.members.find((m) => m.id === member.id);
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

  // ─── 194-03: coberturas con nombre + frecuencia + renovaciones ───────────

  it("cobertura de MEMBRESÍA ignora la sub is_trial; la de ACCESO la cuenta (solo is_trial)", async () => {
    const trial = await createTrialPlan(ctx);
    const member = await createMemberInPhysicalBranch(ctx, { status: "prueba" });
    const sub = await createActiveSub(ctx, {
      userId: member.id,
      planId: trial.id,
      endOffsetDays: 5,
    });

    const membershipOne = await deriveMembershipCoveredUntil(
      app.db,
      member.id,
      ctx.tenant,
    );
    const membershipBatch = await deriveMembershipCoveredUntilBatch(
      app.db,
      [member.id],
      ctx.tenant,
    );
    expect(membershipOne).toBeNull();
    expect(membershipBatch.get(member.id) ?? null).toBeNull();

    // ACCESO sin cambios: el invitado tiene que poder reservar dentro de su vigencia.
    const accessOne = await deriveCoveredUntil(app.db, member.id, ctx.tenant);
    const accessBatch = await deriveCoveredUntilBatch(
      app.db,
      [member.id],
      ctx.tenant,
    );
    expect(accessOne).toBe(sub.endDate);
    expect(accessBatch.get(member.id)).toBe(sub.endDate);
  });

  it("con presencial + is_trial que vence después: MEMBRESÍA = fin de la presencial, ACCESO = el máximo", async () => {
    const trial = await createTrialPlan(ctx);
    const membership = await createMembershipPlan(ctx);
    const member = await createMemberInPhysicalBranch(ctx, { status: "prueba" });
    const presencial = await createActiveSub(ctx, {
      userId: member.id,
      planId: membership.id,
      endOffsetDays: 10,
    });
    const invitacion = await createActiveSub(ctx, {
      userId: member.id,
      planId: trial.id,
      endOffsetDays: 25,
    });

    expect(
      await deriveMembershipCoveredUntil(app.db, member.id, ctx.tenant),
    ).toBe(presencial.endDate);
    expect(await deriveCoveredUntil(app.db, member.id, ctx.tenant)).toBe(
      invitacion.endDate,
    );
  });

  it("frecuencia: la población activa y los golden cases excluyen al socio con solo is_trial", async () => {
    const trial = await createTrialPlan(ctx);
    const membership = await createMembershipPlan(ctx);
    const soloTrial = await createMemberInPhysicalBranch(ctx, {
      status: "prueba",
    });
    const conMembresia = await createMemberInPhysicalBranch(ctx, {
      status: "activo",
    });
    await createActiveSub(ctx, { userId: soloTrial.id, planId: trial.id });
    await createActiveSub(ctx, {
      userId: conMembresia.id,
      planId: membership.id,
    });

    const freq = new FrequencyService(app.db, app.log);
    const result = await freq.getFrequency(ctx.tenant, {});
    const inactivo = result.distribution.find((d) => d.band === "inactivo");
    // Solo el socio con membresía (0 visitas → Inactivo) está en la población.
    expect(inactivo?.count.nominal).toBe(1);
    expect(inactivo?.count.n).toBe(1);

    const golden = await freq.coolingOrInactiveUserIds(ctx.tenant, 28);
    expect(golden.has(conMembresia.id)).toBe(true);
    expect(golden.has(soloTrial.id)).toBe(false);
  });

  it("renovaciones: una sub is_trial (cualquier categoría) que vence no aparece; la membresía sí", async () => {
    // Duración 10 días: supera el corte de duración mínima, así que SOLO la
    // exclusión is_trial (D-03) puede dejarla fuera de la lista.
    const trial = await createTrialPlan(ctx, { durationDays: 10 });
    const membership = await createMembershipPlan(ctx);
    const invitado = await createMemberInPhysicalBranch(ctx, {
      status: "prueba",
    });
    const socio = await createMemberInPhysicalBranch(ctx, { status: "activo" });
    const trialSub = await createActiveSub(ctx, {
      userId: invitado.id,
      planId: trial.id,
      startOffsetDays: -9,
      endOffsetDays: 0,
    });
    const membershipSub = await createActiveSub(ctx, {
      userId: socio.id,
      planId: membership.id,
      startOffsetDays: -29,
      endOffsetDays: 0,
    });

    const hoy = todayInTz("America/Argentina/Buenos_Aires");
    const result = await new RenewalsService(app.db, app.log).listRenewals(
      ctx.tenant,
      { dateFrom: addDays(hoy, -3), dateTo: addDays(hoy, 3) },
    );
    const ids = result.rows.map((r) => r.subscriptionId);
    expect(ids).toContain(membershipSub.id);
    expect(ids).not.toContain(trialSub.id);
  });

  // ─── Plan 194-31: indicadores de membresía restantes ───────────────────

  it("analytics: la distribución de planes no tiene fila del plan is_trial; el control con presencial sí", async () => {
    const trial = await createTrialPlan(ctx, { name: "Invitacion 194-31" });
    const membership = await createMembershipPlan(ctx, {
      name: "Presencial 194-31",
    });
    const invitado = await createMemberInPhysicalBranch(ctx, {
      status: "prueba",
    });
    const socio = await createMemberInPhysicalBranch(ctx, { status: "activo" });
    await createActiveSub(ctx, { userId: invitado.id, planId: trial.id });
    await createActiveSub(ctx, { userId: socio.id, planId: membership.id });

    const hoy = todayInTz("America/Argentina/Buenos_Aires");
    const result = await new AnalyticsService(
      app.db,
      app.log,
    ).getMemberAnalytics(ctx.tenant, {
      dateFrom: addDays(hoy, -30),
      dateTo: hoy,
    });
    const names = result.planDistribution.map((r) => r.planName);
    expect(names).toContain("Presencial 194-31");
    expect(names).not.toContain("Invitacion 194-31");
  });

  it("reporte de inactivos: el invitado con solo is_trial no aparece; el socio con presencial sin asistencia sí", async () => {
    const trial = await createTrialPlan(ctx);
    const membership = await createMembershipPlan(ctx);
    const invitado = await createMemberInPhysicalBranch(ctx, {
      status: "prueba",
    });
    const socio = await createMemberInPhysicalBranch(ctx, { status: "activo" });
    await createActiveSub(ctx, { userId: invitado.id, planId: trial.id });
    await createActiveSub(ctx, { userId: socio.id, planId: membership.id });

    const rows = await new ReportsService(app.db, app.log).getInactiveMembers(
      ctx.tenant,
      {},
    );
    const ids = rows.map((r) => r.userId);
    expect(ids).toContain(socio.id);
    expect(ids).not.toContain(invitado.id);
  });

  it("bandeja de caja: hasActivePlan es false para el invitado con solo is_trial y true con presencial", async () => {
    const trial = await createTrialPlan(ctx);
    const membership = await createMembershipPlan(ctx);
    const invitado = await createMemberInPhysicalBranch(ctx, {
      status: "prueba",
    });
    const socio = await createMemberInPhysicalBranch(ctx, { status: "activo" });
    await createActiveSub(ctx, { userId: invitado.id, planId: trial.id });
    await createActiveSub(ctx, { userId: socio.id, planId: membership.id });

    await ensureEfectivoCaja(app, socio.branchId);
    const [caja] = await app.db
      .select({ id: schema.cashRegisters.id })
      .from(schema.cashRegisters)
      .where(
        and(
          tenantWhere(schema.cashRegisters, ctx.tenant),
          eq(schema.cashRegisters.branchId, socio.branchId),
          eq(schema.cashRegisters.type, "efectivo"),
        ),
      )
      .limit(1);
    const [admin] = await app.db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(
        and(
          tenantWhere(schema.users, ctx.tenant),
          eq(schema.users.email, "admin@test.com"),
        ),
      );
    const fecha = addDays(todayInTz("America/Argentina/Buenos_Aires"), -1);
    const seedTx = async (memberId: number): Promise<number> => {
      const [row] = await app.db
        .insert(schema.financialTransactions)
        .values(
          tenantValues(ctx.tenant, {
            memberId,
            kind: "advance_payment" as const,
            direction: "inflow" as const,
            amount: 1000,
            currency: "ARS",
            paymentMethod: "cash" as const,
            transactionDate: fecha,
            effectiveDate: fecha,
            branchId: socio.branchId,
            cashRegisterId: caja.id,
            recordedBy: admin.id,
            validationStatus: "pendiente" as const,
            miscReason: "sin_plan" as const,
          }),
        )
        .$returningId();
      return row.id;
    };
    const txInvitado = await seedTx(invitado.id);
    const txSocio = await seedTx(socio.id);

    const res = await app.inject({
      method: "GET",
      url: "/api/admin/finance/pending-tray",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const { rows } = JSON.parse(res.body) as {
      rows: Array<{ id: number; hasActivePlan: boolean }>;
    };
    expect(rows.find((r) => r.id === txInvitado)?.hasActivePlan).toBe(false);
    expect(rows.find((r) => r.id === txSocio)?.hasActivePlan).toBe(true);
  });

  it("analytics: una sub is_trial (paga o bonificada) que vence o se cancela no cuenta como baja, churn ni renovación; la membresía sí", async () => {
    const trial = await createTrialPlan(ctx, { durationDays: 10 });
    const membership = await createMembershipPlan(ctx);
    const invitado = await createMemberInPhysicalBranch(ctx, {
      status: "prueba",
    });
    const bonificado = await createMemberInPhysicalBranch(ctx, {
      status: "prueba",
    });
    const socio = await createMemberInPhysicalBranch(ctx, { status: "activo" });
    // `createActiveSub` deja el membership_kind por defecto (`paga`): es
    // JUSTAMENTE el caso que la etiqueta NO cubre y que D-03 tiene que cubrir.
    await createActiveSub(ctx, {
      userId: invitado.id,
      planId: trial.id,
      status: "expired",
      startOffsetDays: -19,
      endOffsetDays: -10,
    });
    const subBonificada = await createActiveSub(ctx, {
      userId: bonificado.id,
      planId: trial.id,
      status: "expired",
      startOffsetDays: -19,
      endOffsetDays: -10,
    });
    await app.db
      .update(schema.subscriptions)
      .set({ membershipKind: "bonificada" })
      .where(
        and(
          tenantWhere(schema.subscriptions, ctx.tenant),
          eq(schema.subscriptions.id, subBonificada.id),
        ),
      );
    const cancelada = await createActiveSub(ctx, {
      userId: invitado.id,
      planId: trial.id,
      startOffsetDays: -3,
      endOffsetDays: 3,
    });
    await app.db
      .update(schema.subscriptions)
      .set({ status: "cancelled" })
      .where(
        and(
          tenantWhere(schema.subscriptions, ctx.tenant),
          eq(schema.subscriptions.id, cancelada.id),
        ),
      );

    const hoy = todayInTz("America/Argentina/Buenos_Aires");
    const filters = {
      dateFrom: addDays(hoy, -30),
      dateTo: hoy,
      window: 5,
    };
    const churnSinSocio = await new ChurnService(app.db, app.log).getChurn(
      ctx.tenant,
      filters,
    );
    expect(churnSinSocio.window.churn.n).toBe(0);
    expect(churnSinSocio.window.churn.nominal).toBe(0);
    expect(churnSinSocio.enGracia).toBe(0);
    const renovSinSocio = await new RenewalService(app.db, app.log).getRenewal(
      ctx.tenant,
      filters,
    );
    expect(renovSinSocio.renewal.n).toBe(0);
    const legacySinSocio = await new AnalyticsService(
      app.db,
      app.log,
    ).getMemberAnalytics(ctx.tenant, filters);
    expect(legacySinSocio.churnedMembers).toBe(0);

    // Control: la membresía real que vence sin renovar SÍ es baja y vencida.
    await createActiveSub(ctx, {
      userId: socio.id,
      planId: membership.id,
      status: "expired",
      startOffsetDays: -39,
      endOffsetDays: -10,
    });
    const churnConSocio = await new ChurnService(app.db, app.log).getChurn(
      ctx.tenant,
      filters,
    );
    expect(churnConSocio.window.churn.n).toBe(1);
    expect(churnConSocio.window.churn.nominal).toBe(1);
    const renovConSocio = await new RenewalService(app.db, app.log).getRenewal(
      ctx.tenant,
      filters,
    );
    expect(renovConSocio.renewal.n).toBe(1);
  });
});
