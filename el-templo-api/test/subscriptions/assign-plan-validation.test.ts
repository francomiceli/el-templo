/**
 * Phase 111-03 (REQ-1 + REQ-7 plan_assigned audit) — assignPlan validation:
 *
 * - Rejects plan_category='presencial' on a virtual branch (HTTP 400 with
 *   exact message "Plan presencial requiere sede física. Convertí al alumno
 *   primero.").
 * - Allows plan_category='online' regardless of branch.
 * - Allows presencial plan on a non-virtual branch (regression preserved).
 * - On successful assign, writes one audit_log row with action='plan_assigned'
 *   and the D-13 payload shape (subId, planId, branchId, pricePaid,
 *   paymentMethod, hasChargeTx, startDate, endDate).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { sql, eq, and, desc } from "drizzle-orm";
import {
  createTestApp,
  getAuthToken,
  cleanAllTestData,
  todayStr,
  dateOffsetStr,
} from "../helpers";
import * as schema from "../../src/db/schema";
import { TENANT_TEMPLO } from "../fixtures/second-tenant";
import { tenantWhere } from "../../src/modules/shared/tenant";
import {
  SUBSCRIPTIONS_URL,
  basePlan,
  createPlan,
  createMember,
  assignPlan,
} from "./_helpers";

/**
 * Fase 173 (ADO-02): gimnasio de las queries DIRECTAS de este archivo. Con
 * `members` en TENANT_STRICT_MODULES una lectura de `users` o `audit_log` sin
 * estampa hace throw antes de llegar a MySQL.
 */
const TEMPLO_CTX = { tenantId: TENANT_TEMPLO };

describe("Subscriptions API — assignPlan REQ-1 validation + REQ-7 audit", () => {
  let app: FastifyInstance;
  let adminToken: string;
  let adminId: number;
  let virtualBranchId: number;
  let physicalBranchId: number;

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");

    const [admin] = await app.db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(
        and(
          tenantWhere(schema.users, TEMPLO_CTX),
          eq(schema.users.email, "admin@test.com"),
        ),
      )
      .limit(1);
    if (!admin) throw new Error("admin@test.com seed missing");
    adminId = admin.id;

    // Resolve the seeded virtual branch ('Templo Online', is_virtual=true)
    const [vBranch] = await app.db
      .select({ id: schema.branches.id })
      .from(schema.branches)
      .where(eq(schema.branches.isVirtual, true))
      .limit(1);
    if (!vBranch) throw new Error("Virtual branch seed missing");
    virtualBranchId = vBranch.id;

    // Pick the canonical physical branch id=1 (seeded by setup.ts)
    physicalBranchId = 1;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    // audit_log is not in TABLES_TO_CLEAN — clean explicitly to avoid
    // stale rows from previous test files in the same worker. Fase 173:
    // acotado al gimnasio (categoria 2, conveniencia): este archivo nunca
    // siembra en el gimnasio 2.
    await app.db.execute(
      sql`DELETE FROM audit_log WHERE tenant_id = ${TEMPLO_CTX.tenantId}`,
    );
  });

  it("REQ-1: rejects presencial plan on virtual branch with the exact Spanish message", async () => {
    const plan = await createPlan(app, adminToken, {
      planCategory: "presencial",
    });
    const member = await createMember(app, {
      email: `req1-virtual-${Date.now()}@test.com`,
      branchId: virtualBranchId,
    });

    const { statusCode, body } = await assignPlan(app, adminToken, member.id, {
      planId: plan.id,
      branchId: virtualBranchId,
      startDate: todayStr(),
      priceTypeApplied: "regular",
    });

    expect(statusCode).toBe(400);
    expect(body.message).toBe(
      "Plan presencial requiere sede física. Convertí al alumno primero.",
    );
  });

  it("REQ-1 inverse: online plan on virtual branch is accepted", async () => {
    // basePlan from _helpers includes classesPerWeek=3; for online_regular
    // we must omit it (online plans don't use schedules) and provide
    // grantsAllPrograms to satisfy assertPlanInvariants. Build payload
    // explicitly to avoid carrying classesPerWeek through.
    const planRes = await app.inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}/plans`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        name: "Plan Online Mensual",
        planTier: "flex",
        bookingMode: "flexible",
        priceRegular: 12000,
        priceZero: 8000,
        durationDays: 30,
        planCategory: "online_regular",
        grantsAllPrograms: true,
      },
    });
    expect(planRes.statusCode).toBe(201);
    const plan = JSON.parse(planRes.body) as { id: number };
    const member = await createMember(app, {
      email: `req1-online-${Date.now()}@test.com`,
      branchId: virtualBranchId,
    });

    const { statusCode } = await assignPlan(app, adminToken, member.id, {
      planId: plan.id,
      branchId: virtualBranchId,
      startDate: todayStr(),
      priceTypeApplied: "regular",
    });

    expect(statusCode).toBe(201);
  });

  it("REQ-1 normal: presencial plan on physical branch is accepted (regression preserved)", async () => {
    const plan = await createPlan(app, adminToken, {
      planCategory: "presencial",
    });
    const member = await createMember(app, {
      email: `req1-physical-${Date.now()}@test.com`,
      branchId: physicalBranchId,
    });

    const { statusCode } = await assignPlan(app, adminToken, member.id, {
      planId: plan.id,
      branchId: physicalBranchId,
      startDate: todayStr(),
      priceTypeApplied: "regular",
    });

    expect(statusCode).toBe(201);
  });

  it("REQ-7: successful assignPlan writes one audit_log row with the D-13 plan_assigned payload", async () => {
    const plan = await createPlan(app, adminToken, {
      planCategory: "presencial",
    });
    const member = await createMember(app, {
      email: `req7-audit-${Date.now()}@test.com`,
      branchId: physicalBranchId,
    });

    const startDate = todayStr();
    const { statusCode, body } = await assignPlan(app, adminToken, member.id, {
      planId: plan.id,
      branchId: physicalBranchId,
      startDate,
      priceTypeApplied: "regular",
      paymentMethod: "transfer",
    });
    expect(statusCode).toBe(201);
    const subId = body.id as number;
    expect(subId).toBeGreaterThan(0);

    const auditRows = await app.db
      .select()
      .from(schema.auditLog)
      .where(
        and(
          tenantWhere(schema.auditLog, TEMPLO_CTX),
          eq(schema.auditLog.action, "plan_assigned"),
          eq(schema.auditLog.targetId, subId),
        ),
      )
      .orderBy(desc(schema.auditLog.id));

    expect(auditRows).toHaveLength(1);
    const row = auditRows[0];
    expect(row.actorId).toBe(adminId);
    expect(row.targetKind).toBe("subscription");

    const payload = row.payloadJson as Record<string, unknown>;
    expect(payload).toMatchObject({
      subId,
      planId: plan.id,
      branchId: physicalBranchId,
      paymentMethod: "transfer",
      startDate,
      endDate: dateOffsetStr(basePlan.durationDays),
    });
    // pricePaid should equal the plan's regular price for a normal assign
    expect(payload.pricePaid).toBe(basePlan.priceRegular);
    // hasChargeTx is derived from chargeBase>0 — regular price assign does charge
    expect(payload.hasChargeTx).toBe(true);
    // All 8 required keys present (D-13)
    const expectedKeys = [
      "subId",
      "planId",
      "branchId",
      "pricePaid",
      "paymentMethod",
      "hasChargeTx",
      "startDate",
      "endDate",
    ];
    for (const k of expectedKeys) {
      expect(payload).toHaveProperty(k);
    }
  });
});
