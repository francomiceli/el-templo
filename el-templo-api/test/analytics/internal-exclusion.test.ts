/**
 * Membresías internas (2026-08-07): las subs `membership_kind` en
 * ('bonificada','staff') NO cuentan en las MÉTRICAS DE MEMBRESÍA. El staff
 * entrena con cuentas role='member', así que el filtro por rol no alcanza —
 * la etiqueta vive en la subscription.
 *
 * Integración contra MySQL real (misma convención que especial-exclusion.test.ts).
 * Cubre:
 *   (1) Miembros activos (GET /api/admin/analytics): bonificada-only y
 *       staff-only NO figuran; el socio pagante sí.
 *   (2) Altas (MemberFlowsService): el alta de una bonificada no es alta.
 *   (3) Churn (ChurnService): un staff vencido sin renovar no es churn.
 *   (4) Auto-etiqueta: alta vía API con priceOverrideAmount=0 queda
 *       'bonificada'; con override > 0 queda 'paga'.
 *   (5) Renovación: renew con override $0 de una sub 'staff' hereda 'staff'
 *       (la corrección manual sobrevive a la renovación).
 *
 * NO correr localmente (MySQL real — CI lo corre en el push a staging).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { and, eq, desc } from "drizzle-orm";
import { sql } from "drizzle-orm";
import {
  createTestApp,
  getAuthToken,
  cleanAllTestData,
  createTestMember,
  assignTestPlan,
  todayStr,
  dateOffsetStr,
} from "../helpers";
import { MemberFlowsService } from "../../src/modules/analytics/member-flows-service";
import { ChurnService } from "../../src/modules/analytics/churn-service";
import { subscriptions } from "../../src/db/schema/subscriptions";
import { subscriptionPlans } from "../../src/db/schema/subscription-plans";
import { branches } from "../../src/db/schema/branches";
import { users } from "../../src/db/schema/users";
import { type TenantContext } from "../../src/modules/shared/tenant";
import { TENANT_TEMPLO } from "../fixtures/second-tenant";

const ANALYTICS_URL = "/api/admin/analytics";

/**
 * Fase 173 (D-02): `getMonthlyFlows` recibe `TenantContext` como PRIMER
 * argumento (en producción sale de `assertTenant(request.scope, …)`); acá se
 * construye a mano porque el service se invoca sin request. El Templo es el
 * tenant 1.
 */
const CTX: TenantContext = { tenantId: TENANT_TEMPLO };

describe("membresías internas — exclusión de métricas de membresía", () => {
  let app: FastifyInstance;
  let adminToken: string;
  let branchA: number;
  let flowsSvc: MemberFlowsService;
  let churnSvc: ChurnService;

  let planId: number;

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
    flowsSvc = new MemberFlowsService(app.db, app.log);
    churnSvc = new ChurnService(app.db, app.log);

    const [a] = await app.db
      .select({ id: branches.id })
      .from(branches)
      .where(eq(branches.code, "TEST"));
    branchA = a.id;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);

    const [p] = await app.db.insert(subscriptionPlans).values({
      name: "Interno Presencial AR",
      planTier: "flex",
      bookingMode: "flexible",
      planCategory: "presencial",
      country: "AR",
      currency: "ARS",
      priceRegular: 15000,
      priceZero: 0,
      durationDays: 30,
      classesPerWeek: 3,
    });
    planId = (p as { insertId: number }).insertId;
  });

  let __seq = 0;
  async function insertMember(): Promise<number> {
    __seq += 1;
    const [u] = await app.db.insert(users).values({
      tenantId: TENANT_TEMPLO,
      email: `int-m${__seq}-${Date.now()}@test.com`,
      passwordHash: "x",
      firstName: "In",
      lastName: "Terno",
      branchId: branchA,
      role: "member",
    });
    return (u as { insertId: number }).insertId;
  }

  async function insertSub(opts: {
    userId: number;
    startDate: string;
    endDate: string;
    status?: "active" | "expired";
    membershipKind?: "paga" | "bonificada" | "staff";
    pricePaid?: number;
  }): Promise<number> {
    const [r] = await app.db.insert(subscriptions).values({
      tenantId: TENANT_TEMPLO,
      userId: opts.userId,
      planId,
      branchId: branchA,
      status: opts.status ?? "active",
      startDate: opts.startDate,
      endDate: opts.endDate,
      pricePaid: opts.pricePaid ?? 15000,
      currency: "ARS",
      priceTypeApplied: "regular",
      membershipKind: opts.membershipKind ?? "paga",
    });
    return (r as { insertId: number }).insertId;
  }

  async function lastSubOf(
    userId: number,
  ): Promise<{ id: number; membershipKind: string }> {
    const [row] = await app.db
      .select({
        id: subscriptions.id,
        membershipKind: subscriptions.membershipKind,
      })
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.tenantId, TENANT_TEMPLO),
          eq(subscriptions.userId, userId),
        ),
      )
      .orderBy(desc(subscriptions.id))
      .limit(1);
    return row;
  }

  /** Resolve a CURDATE()-relative offset to a literal YYYY-MM-DD (TZ-safe). */
  async function dateOffset(days: number): Promise<string> {
    const interval = sql.raw(String(Math.abs(days)));
    const dateExpr =
      days >= 0
        ? sql`DATE_ADD(CURDATE(), INTERVAL ${interval} DAY)`
        : sql`DATE_SUB(CURDATE(), INTERVAL ${interval} DAY)`;
    const result = (await app.db.execute(
      sql`SELECT DATE_FORMAT(${dateExpr}, '%Y-%m-%d') AS d`,
    )) as unknown as [Array<{ d: string }>];
    const rows = Array.isArray(result) ? result[0] : result;
    return String(rows[0].d);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // (1) Miembros activos — endpoint GET /api/admin/analytics
  // ═══════════════════════════════════════════════════════════════════════

  it("miembros activos: bonificada-only y staff-only NO cuentan; el pagante sí", async () => {
    const active = {
      startDate: dateOffsetStr(-10),
      endDate: dateOffsetStr(20),
    };

    const pagante = await insertMember();
    await insertSub({ userId: pagante, ...active });

    const bonificado = await insertMember();
    await insertSub({
      userId: bonificado,
      membershipKind: "bonificada",
      pricePaid: 0,
      ...active,
    });

    const staff = await insertMember();
    await insertSub({
      userId: staff,
      membershipKind: "staff",
      pricePaid: 0,
      ...active,
    });

    const res = await app.inject({
      method: "GET",
      url: `${ANALYTICS_URL}?branchId=${branchA}&dateFrom=${dateOffsetStr(
        -30,
      )}&dateTo=${todayStr()}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      activeMembers: { value: number };
    };

    expect(body.activeMembers.value).toBe(1);
  });

  it("miembros activos: el override manual 'staff' saca al socio aunque su sub sea 'paga'", async () => {
    const active = {
      startDate: dateOffsetStr(-10),
      endDate: dateOffsetStr(20),
    };

    // Paga real → cuenta.
    const pagante = await insertMember();
    await insertSub({ userId: pagante, ...active });

    // Sub 'paga' (precio real) pero marcado staff a mano en la ficha → el
    // override pisa y lo excluye de la métrica, sin tocar la suscripción.
    const staffManual = await insertMember();
    await insertSub({ userId: staffManual, ...active });
    await app.db
      .update(users)
      .set({ membershipKindOverride: "staff" })
      .where(and(eq(users.tenantId, TENANT_TEMPLO), eq(users.id, staffManual)));

    const res = await app.inject({
      method: "GET",
      url: `${ANALYTICS_URL}?branchId=${branchA}&dateFrom=${dateOffsetStr(
        -30,
      )}&dateTo=${todayStr()}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { activeMembers: { value: number } };
    expect(body.activeMembers.value).toBe(1);
  });

  // ═══════════════════════════════════════════════════════════════════════
  // (1b) Desglose clickeable del KPI de activos (breakdown)
  // ═══════════════════════════════════════════════════════════════════════

  it("desglose: paga + staff + bonificada + soloEspecial suman totalActive; paying = value", async () => {
    const active = {
      startDate: dateOffsetStr(-10),
      endDate: dateOffsetStr(20),
    };

    // Plan 'especial' (pase Aura): su comprador solo-pase queda fuera del KPI.
    const [ep] = await app.db.insert(subscriptionPlans).values({
      name: "Pase Aura AR",
      planTier: "flex",
      bookingMode: "flexible",
      planCategory: "especial",
      country: "AR",
      currency: "ARS",
      priceRegular: 8000,
      priceZero: 0,
      durationDays: 30,
      classesPerWeek: 2,
    });
    const especialPlanId = (ep as { insertId: number }).insertId;

    // 2 pagantes normales
    for (let i = 0; i < 2; i++) {
      await insertSub({ userId: await insertMember(), ...active });
    }
    // 1 staff, 1 bonificada
    await insertSub({
      userId: await insertMember(),
      membershipKind: "staff",
      pricePaid: 0,
      ...active,
    });
    await insertSub({
      userId: await insertMember(),
      membershipKind: "bonificada",
      pricePaid: 0,
      ...active,
    });
    // 1 solo-pase-especial (paga, pero plan_category='especial')
    const soloPase = await insertMember();
    await app.db.insert(subscriptions).values({
      tenantId: TENANT_TEMPLO,
      userId: soloPase,
      planId: especialPlanId,
      branchId: branchA,
      status: "active",
      startDate: active.startDate,
      endDate: active.endDate,
      pricePaid: 8000,
      currency: "ARS",
      priceTypeApplied: "regular",
      membershipKind: "paga",
    });

    const res = await app.inject({
      method: "GET",
      url: `${ANALYTICS_URL}?branchId=${branchA}&dateFrom=${dateOffsetStr(
        -30,
      )}&dateTo=${todayStr()}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      activeMembers: {
        value: number;
        breakdown: {
          paying: number;
          staff: number;
          bonificada: number;
          onlyEspecial: number;
          totalActive: number;
        };
      };
    };

    const b = body.activeMembers.breakdown;
    expect(b.paying).toBe(2);
    expect(b.staff).toBe(1);
    expect(b.bonificada).toBe(1);
    expect(b.onlyEspecial).toBe(1);
    expect(b.totalActive).toBe(5);
    // Invariante: el número grande del KPI == balde 'paying'.
    expect(body.activeMembers.value).toBe(b.paying);
    // Invariante: los 4 baldes suman el total plano.
    expect(b.paying + b.staff + b.bonificada + b.onlyEspecial).toBe(
      b.totalActive,
    );
  });

  // ═══════════════════════════════════════════════════════════════════════
  // (2) Altas — MemberFlowsService
  // ═══════════════════════════════════════════════════════════════════════

  it("altas: el alta de una bonificada no es alta de membresía", async () => {
    const start = todayStr();
    const end = dateOffsetStr(30);

    const nuevoSocio = await insertMember();
    await insertSub({ userId: nuevoSocio, startDate: start, endDate: end });

    const regalado = await insertMember();
    await insertSub({
      userId: regalado,
      membershipKind: "bonificada",
      pricePaid: 0,
      startDate: start,
      endDate: end,
    });

    const res = await flowsSvc.getMonthlyFlows(CTX, {
      dateFrom: dateOffsetStr(-40),
      dateTo: dateOffsetStr(1),
    });
    const totalAltas = res.series.reduce((sum, p) => sum + p.altas, 0);

    expect(totalAltas).toBe(1);
  });

  // ═══════════════════════════════════════════════════════════════════════
  // (3) Churn — ChurnService
  // ═══════════════════════════════════════════════════════════════════════

  it("churn: un staff vencido sin renovar no cuenta como churn", async () => {
    // Pagante vencido hace 40 días sin renovar → churn real.
    const churner = await insertMember();
    await insertSub({
      userId: churner,
      status: "expired",
      startDate: await dateOffset(-70),
      endDate: await dateOffset(-40),
    });

    // Staff vencido en la misma ventana → NO es churn.
    const staff = await insertMember();
    await insertSub({
      userId: staff,
      status: "expired",
      membershipKind: "staff",
      pricePaid: 0,
      startDate: await dateOffset(-70),
      endDate: await dateOffset(-40),
    });

    const res = await churnSvc.getChurn(CTX, {
      dateFrom: await dateOffset(-90),
      dateTo: await dateOffset(1),
    });

    expect(res.window.churn.nominal).toBe(1);
  });

  // ═══════════════════════════════════════════════════════════════════════
  // (4) Auto-etiqueta en el alta vía API
  // ═══════════════════════════════════════════════════════════════════════

  it("alta con override $0 queda 'bonificada'; con override > 0 queda 'paga'", async () => {
    const gratis = await createTestMember(app, { branchId: branchA });
    const alta1 = await assignTestPlan(app, adminToken, gratis.id, planId, {
      priceOverrideAmount: 0,
      priceOverrideReason: "bonificado test",
    });
    expect(alta1.statusCode).toBe(201);
    expect((await lastSubOf(gratis.id)).membershipKind).toBe("bonificada");

    const descuento = await createTestMember(app, { branchId: branchA });
    const alta2 = await assignTestPlan(app, adminToken, descuento.id, planId, {
      priceOverrideAmount: 5000,
      priceOverrideReason: "descuento test",
    });
    expect(alta2.statusCode).toBe(201);
    expect((await lastSubOf(descuento.id)).membershipKind).toBe("paga");

    const normal = await createTestMember(app, { branchId: branchA });
    const alta3 = await assignTestPlan(app, adminToken, normal.id, planId);
    expect(alta3.statusCode).toBe(201);
    expect((await lastSubOf(normal.id)).membershipKind).toBe("paga");
  });

  // ═══════════════════════════════════════════════════════════════════════
  // (5) Renovación hereda 'staff'
  // ═══════════════════════════════════════════════════════════════════════

  it("renovación con override $0 de una sub 'staff' hereda 'staff'", async () => {
    const staff = await createTestMember(app, { branchId: branchA });
    const alta = await assignTestPlan(app, adminToken, staff.id, planId, {
      priceOverrideAmount: 0,
      priceOverrideReason: "profe",
    });
    expect(alta.statusCode).toBe(201);

    // Corrección manual: la sub del profe se marca 'staff'.
    const sub = await lastSubOf(staff.id);
    await app.db
      .update(subscriptions)
      .set({ membershipKind: "staff" })
      .where(
        and(
          eq(subscriptions.tenantId, TENANT_TEMPLO),
          eq(subscriptions.id, sub.id),
        ),
      );

    const renew = await app.inject({
      method: "POST",
      url: `/api/admin/subscriptions/members/${staff.id}/subscription/renew`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        priceOverrideAmount: 0,
        priceOverrideReason: "profe renueva",
        paymentMethod: "cash",
      },
    });
    expect(renew.statusCode).toBe(201);

    const renewed = await lastSubOf(staff.id);
    expect(renewed.id).not.toBe(sub.id);
    expect(renewed.membershipKind).toBe("staff");
  });
});
