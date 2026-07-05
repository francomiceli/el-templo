import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import {
  createTestApp,
  getAuthToken,
  registerUser,
  createStaffUser,
  cleanAllTestData,
} from "../helpers";
import {
  SUBSCRIPTIONS_URL,
  basePlan,
  createPlan,
  createMember,
  assignPlan,
} from "./_helpers";
import { programs } from "../../src/db/schema/micro-programs";
import * as schema from "../../src/db/schema";

/**
 * Insert an active, OTORGABLE program directly via DB. Returns its id.
 * WR-02 (156): assertProgramsExist ahora exige goalPlanType IS NOT NULL (el
 * mismo universo que otorga enrollFromPlan), así que la lista de un plan debe
 * usar programas grantables. Foundation (goalPlanType null) se cubre aparte.
 */
async function createProgram(
  app: FastifyInstance,
  name: string,
  goalPlanType: string | null = "tren_superior",
): Promise<number> {
  const inserted = await app.db.insert(programs).values({
    name,
    description: `Programa ${name}`,
    durationWeeks: 4,
    sessionsPerWeekToAdvance: 3,
    goalPlanType,
    isActive: true,
  });
  return Number(inserted[0].insertId);
}

describe("Subscriptions API — Plans CRUD", () => {
  let app: FastifyInstance;
  let adminToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
  });

  it("POST /plans creates and PUT updates a plan; defaults are applied", async () => {
    const res = await app.inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}/plans`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: basePlan,
    });
    expect(res.statusCode).toBe(201);
    const created = JSON.parse(res.body);
    expect(created).toHaveProperty("id");
    expect(created.name).toBe(basePlan.name);
    expect(created.priceRegular).toBe(basePlan.priceRegular);
    expect(created.isActive).toBe(true);
    expect(created.multiBranch).toBe(false);
    expect(created.isTrial).toBe(false);

    const updated = await app.inject({
      method: "PUT",
      url: `${SUBSCRIPTIONS_URL}/plans/${created.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: "Updated Plan", priceRegular: 20000 },
    });
    expect(updated.statusCode).toBe(200);
    const body = JSON.parse(updated.body);
    expect(body.name).toBe("Updated Plan");
    expect(body.priceRegular).toBe(20000);
    // Unchanged fields preserved
    expect(body.priceZero).toBe(basePlan.priceZero);
  });

  it("POST /plans persists country=ES with currency=EUR; defaults to AR/ARS", async () => {
    const esRes = await app.inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}/plans`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { ...basePlan, name: "ES Plan", country: "ES" },
    });
    expect(esRes.statusCode).toBe(201);
    const esPlan = JSON.parse(esRes.body);
    expect(esPlan.country).toBe("ES");
    expect(esPlan.currency).toBe("EUR");

    const arRes = await app.inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}/plans`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { ...basePlan, name: "AR Plan (default country)" },
    });
    expect(arRes.statusCode).toBe(201);
    const arPlan = JSON.parse(arRes.body);
    expect(arPlan.country).toBe("AR");
    expect(arPlan.currency).toBe("ARS");
  });

  it("POST /plans validates required fields", async () => {
    const res = await app.inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}/plans`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: "Missing fields" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("GET /plans?isActive=true filters out deactivated plans", async () => {
    const active = await createPlan(app, adminToken, { name: "Active Plan" });
    const toDeactivate = await createPlan(app, adminToken, {
      name: "Deactivated Plan",
    });

    const deactivateRes = await app.inject({
      method: "PATCH",
      url: `${SUBSCRIPTIONS_URL}/plans/${toDeactivate.id}/deactivate`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(deactivateRes.statusCode).toBe(200);
    expect(JSON.parse(deactivateRes.body).isActive).toBe(false);

    const filtered = await app.inject({
      method: "GET",
      url: `${SUBSCRIPTIONS_URL}/plans?isActive=true`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(filtered.statusCode).toBe(200);
    const plans = JSON.parse(filtered.body).plans;
    expect(plans).toHaveLength(1);
    expect(plans[0].id).toBe(active.id);
  });

  it("GET /plans/:planId returns 404 for non-existent plan", async () => {
    const res = await app.inject({
      method: "GET",
      url: `${SUBSCRIPTIONS_URL}/plans/99999`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(404);
  });

  describe("Plan invariant: online plans must link a program or grant all", () => {
    it("presencial plan without linkedProgramId is allowed", async () => {
      const res = await app.inject({
        method: "POST",
        url: `${SUBSCRIPTIONS_URL}/plans`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          ...basePlan,
          name: "Presencial OK",
          planCategory: "presencial",
        },
      });
      expect(res.statusCode).toBe(201);
    });

    it("online plan without linkedProgramId and without grantsAllPrograms is rejected with 400", async () => {
      const res = await app.inject({
        method: "POST",
        url: `${SUBSCRIPTIONS_URL}/plans`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          ...basePlan,
          name: "Online sin nada",
          planCategory: "online_regular",
        },
      });
      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.message).toMatch(
        /Planes online deben vincular un programa.*o dar acceso a todos los programas/,
      );
    });

    it("online plan with linkedProgramId is allowed", async () => {
      const inserted = await app.db.insert(programs).values({
        name: "Programa de prueba",
        description: "Programa creado por el test",
        durationWeeks: 4,
        sessionsPerWeekToAdvance: 3,
        goalPlanType: null,
        isActive: true,
      });
      const programId = Number(inserted[0].insertId);

      const res = await app.inject({
        method: "POST",
        url: `${SUBSCRIPTIONS_URL}/plans`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          ...basePlan,
          name: "Online con programa",
          planCategory: "online_regular",
          linkedProgramId: programId,
        },
      });
      expect(res.statusCode).toBe(201);
      expect(JSON.parse(res.body).linkedProgramId).toBe(programId);
    });

    it("online plan with grantsAllPrograms=true is allowed without linkedProgramId", async () => {
      const res = await app.inject({
        method: "POST",
        url: `${SUBSCRIPTIONS_URL}/plans`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          ...basePlan,
          name: "Bundle nuevo",
          planCategory: "online_regular",
          grantsAllPrograms: true,
        },
      });
      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.grantsAllPrograms).toBe(true);
      expect(body.linkedProgramId).toBeNull();
    });

    it("PUT cannot strip both linkedProgramId and grantsAllPrograms from an online plan", async () => {
      const created = await createPlan(app, adminToken, {
        name: "Bundle a quebrar",
        planCategory: "online_regular",
        grantsAllPrograms: true,
      });
      const res = await app.inject({
        method: "PUT",
        url: `${SUBSCRIPTIONS_URL}/plans/${created.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { grantsAllPrograms: false },
      });
      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.message).toMatch(
        /Planes online deben vincular un programa.*o dar acceso a todos los programas/,
      );
    });
  });

  it("non-admin user gets 403 on plan and subscription routes", async () => {
    const { token: memberToken } = await registerUser(app, {
      email: "regular-sub-auth@test.com",
      password: "pass123456",
      branchId: 1,
      firstName: "Regular",
      lastName: "Member",
    });

    const endpoints = [
      { method: "GET" as const, url: `${SUBSCRIPTIONS_URL}/plans` },
      {
        method: "POST" as const,
        url: `${SUBSCRIPTIONS_URL}/plans`,
        payload: basePlan,
      },
      {
        method: "GET" as const,
        url: `${SUBSCRIPTIONS_URL}/members/1/subscription`,
      },
    ];

    for (const ep of endpoints) {
      const res = await app.inject({
        method: ep.method,
        url: ep.url,
        headers: { authorization: `Bearer ${memberToken}` },
        payload: "payload" in ep ? ep.payload : undefined,
      });
      expect(
        res.statusCode,
        `Expected 403 for ${ep.method} ${ep.url}, got ${res.statusCode}`,
      ).toBe(403);
    }
  });

  // =========================================================================
  // D-11 — Per-handler Dueño-only guard on plan/promo writes.
  //
  // The subscriptions plugin gates the module with SUBSCRIPTION_ROLES (which
  // INCLUDES coach, needed for the PoS assign/renew/pause flows). Without a
  // per-handler guard a coach could create/edit/archive plans and promos by
  // API. These tests assert coach → 403 on the 7 writes and coach → 200 on the
  // read (GET /plans), while admin keeps writing normally.
  // =========================================================================
  describe("RBAC per-handler Dueño-only writes (D-11)", () => {
    let coachToken: string;

    beforeEach(async () => {
      await createStaffUser(app, {
        email: "coach-planes@test.com",
        password: "coachpass123",
        firstName: "Coach",
        lastName: "Planes",
        role: "coach",
        branchId: 1,
      });
      coachToken = await getAuthToken(
        app,
        "coach-planes@test.com",
        "coachpass123",
      );
    });

    it("coach gets 403 on the 7 plan/promo write endpoints (valid payloads)", async () => {
      const validPromo = {
        name: "Promo Coach",
        promoCode: `COACH-${Date.now()}`,
        planDurationDays: 30,
        startDate: "2026-01-01",
        expiryDate: "2026-12-31",
        promoType: "auto" as const,
        subscriptionPlanId: 1,
      };

      const writes = [
        {
          method: "POST" as const,
          url: `${SUBSCRIPTIONS_URL}/plans`,
          payload: basePlan,
        },
        {
          method: "PUT" as const,
          url: `${SUBSCRIPTIONS_URL}/plans/1`,
          payload: { name: "Hack", priceRegular: 20000 },
        },
        {
          method: "PATCH" as const,
          url: `${SUBSCRIPTIONS_URL}/plans/1/deactivate`,
        },
        {
          method: "POST" as const,
          url: `${SUBSCRIPTIONS_URL}/bulk-migrate`,
          payload: { userIds: [1], targetPlanId: 1, targetBranchId: 1 },
        },
        {
          method: "POST" as const,
          url: `${SUBSCRIPTIONS_URL}/promo-plans`,
          payload: validPromo,
        },
        {
          method: "PATCH" as const,
          url: `${SUBSCRIPTIONS_URL}/promo-plans/1`,
          payload: { name: "Hack Promo" },
        },
        {
          method: "PATCH" as const,
          url: `${SUBSCRIPTIONS_URL}/promo-plans/1/deactivate`,
        },
      ];

      for (const w of writes) {
        const res = await app.inject({
          method: w.method,
          url: w.url,
          headers: { authorization: `Bearer ${coachToken}` },
          payload: "payload" in w ? w.payload : undefined,
        });
        expect(
          res.statusCode,
          `Expected 403 for ${w.method} ${w.url}, got ${res.statusCode}`,
        ).toBe(403);
      }
    });

    it("coach keeps reading GET /plans (200 — Planes read-only for staff)", async () => {
      const res = await app.inject({
        method: "GET",
        url: `${SUBSCRIPTIONS_URL}/plans`,
        headers: { authorization: `Bearer ${coachToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toHaveProperty("plans");
    });

    it("admin still creates plans (no regression)", async () => {
      const res = await app.inject({
        method: "POST",
        url: `${SUBSCRIPTIONS_URL}/plans`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { ...basePlan, name: "Admin sigue creando" },
      });
      expect(res.statusCode).toBe(201);
    });
  });

  // =========================================================================
  // PLAN-03 (D-06/D-08) — multi-program access list embedded in the plan
  // payload. The list persists in plan_programs (delete+insert per plan) and
  // travels back in the response as programIds. Invalid program ids are
  // rejected server-side (T-156-04) and nothing is persisted.
  // =========================================================================
  describe("PLAN-03 — multi-program list (programIds)", () => {
    it("POST /plans persists programIds and returns them in the payload", async () => {
      const p1 = await createProgram(app, "Prog A");
      const p2 = await createProgram(app, "Prog B");

      const res = await app.inject({
        method: "POST",
        url: `${SUBSCRIPTIONS_URL}/plans`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          ...basePlan,
          name: "Plan con lista",
          planCategory: "online_regular",
          programIds: [p1, p2],
        },
      });
      expect(res.statusCode).toBe(201);
      const created = JSON.parse(res.body);
      expect(created.programIds).toBeDefined();
      expect([...created.programIds].sort()).toEqual([p1, p2].sort());

      // Persisted in plan_programs.
      const rows = await app.db
        .select()
        .from(schema.planPrograms)
        .where(eq(schema.planPrograms.subscriptionPlanId, created.id));
      expect(rows.map((r) => r.programId).sort()).toEqual([p1, p2].sort());
    });

    it("a non-empty programIds list satisfies the online-plan invariant (no linkedProgramId, no grantsAllPrograms)", async () => {
      const p1 = await createProgram(app, "Prog Bind");
      const res = await app.inject({
        method: "POST",
        url: `${SUBSCRIPTIONS_URL}/plans`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          ...basePlan,
          name: "Online solo lista",
          planCategory: "online_regular",
          programIds: [p1],
        },
      });
      expect(res.statusCode).toBe(201);
    });

    it("a list composed only of Foundation (goalPlanType NULL) is rejected with 400 (WR-02)", async () => {
      // enrollFromPlan filtra Foundation silenciosamente (104 R7); si el invariante
      // online se satisficiera con una lista no otorgable, el socio quedaría con
      // acceso a CERO programas. assertProgramsExist lo rechaza explícito.
      const foundation = await createProgram(app, "Foundation", null);
      const res = await app.inject({
        method: "POST",
        url: `${SUBSCRIPTIONS_URL}/plans`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          ...basePlan,
          name: "Online solo Foundation",
          planCategory: "online_regular",
          programIds: [foundation],
        },
      });
      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.message).toMatch(/no otorgable/);

      // Nada persistido: no existe el plan con ese nombre.
      const plans = await app.inject({
        method: "GET",
        url: `${SUBSCRIPTIONS_URL}/plans`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      const names = JSON.parse(plans.body).plans.map(
        (p: { name: string }) => p.name,
      );
      expect(names).not.toContain("Online solo Foundation");
    });

    it("PUT /plans replaces the programIds list (delete+insert)", async () => {
      const p1 = await createProgram(app, "Prog 1");
      const p2 = await createProgram(app, "Prog 2");
      const p3 = await createProgram(app, "Prog 3");

      const created = await createPlan(app, adminToken, {
        name: "Plan a re-listar",
        planCategory: "online_regular",
        programIds: [p1, p2],
      });

      const updated = await app.inject({
        method: "PUT",
        url: `${SUBSCRIPTIONS_URL}/plans/${created.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { programIds: [p3] },
      });
      expect(updated.statusCode).toBe(200);
      const body = JSON.parse(updated.body);
      expect(body.programIds).toEqual([p3]);

      const rows = await app.db
        .select()
        .from(schema.planPrograms)
        .where(eq(schema.planPrograms.subscriptionPlanId, created.id));
      expect(rows.map((r) => r.programId)).toEqual([p3]);
    });

    it("PUT /plans without programIds leaves the existing list untouched", async () => {
      const p1 = await createProgram(app, "Prog Keep");
      const created = await createPlan(app, adminToken, {
        name: "Plan que conserva lista",
        planCategory: "online_regular",
        programIds: [p1],
      });

      const updated = await app.inject({
        method: "PUT",
        url: `${SUBSCRIPTIONS_URL}/plans/${created.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { name: "Renombrado sin tocar lista" },
      });
      expect(updated.statusCode).toBe(200);
      expect(JSON.parse(updated.body).programIds).toEqual([p1]);
    });

    it("POST /plans with a non-existent programId → 400 and NOTHING persisted", async () => {
      const valid = await createProgram(app, "Prog Válido");
      const res = await app.inject({
        method: "POST",
        url: `${SUBSCRIPTIONS_URL}/plans`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          ...basePlan,
          name: "Plan con programa fantasma",
          planCategory: "online_regular",
          programIds: [valid, 999999],
        },
      });
      expect(res.statusCode).toBe(400);

      // The plan row was rolled back (no plan_programs rows anywhere for it),
      // and no plan named this way exists.
      const plans = await app.inject({
        method: "GET",
        url: `${SUBSCRIPTIONS_URL}/plans`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      const names = JSON.parse(plans.body).plans.map(
        (p: { name: string }) => p.name,
      );
      expect(names).not.toContain("Plan con programa fantasma");

      // No plan_programs row references the ghost id.
      const ghostRows = await app.db
        .select()
        .from(schema.planPrograms)
        .where(eq(schema.planPrograms.programId, 999999));
      expect(ghostRows).toHaveLength(0);
    });

    it("PUT /plans with a non-existent programId → 400 and the existing list is unchanged", async () => {
      const p1 = await createProgram(app, "Prog Original");
      const created = await createPlan(app, adminToken, {
        name: "Plan lista intacta",
        planCategory: "online_regular",
        programIds: [p1],
      });

      const res = await app.inject({
        method: "PUT",
        url: `${SUBSCRIPTIONS_URL}/plans/${created.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { programIds: [888888] },
      });
      expect(res.statusCode).toBe(400);

      // The rejected update never touched plan_programs: original list stands.
      const rows = await app.db
        .select()
        .from(schema.planPrograms)
        .where(eq(schema.planPrograms.subscriptionPlanId, created.id));
      expect(rows.map((r) => r.programId)).toEqual([p1]);
    });
  });

  // =========================================================================
  // PLAN-04 (D-09) — updating a plan's prices must NOT create a new plan nor
  // rewrite historical amounts. New assignments use the new price; renewals
  // inherit pricePaid BY DESIGN (Pomilio rule, ~service.ts:3517) — the test
  // documents that inheritance, it does NOT "fix" it.
  // =========================================================================
  describe("PLAN-04 — price update does not rewrite history", () => {
    it("update price: same plan id, historical pricePaid + transactions intact, new assign uses new price, renewal inherits", async () => {
      const plan = await createPlan(app, adminToken, {
        name: "Plan Inflación",
        priceRegular: 10000,
        priceZero: 8000,
      });
      const member1 = await createMember(app, {
        email: "plan04-m1@test.com",
      });

      // Assign at the OLD price → pricePaid=10000, one financial_transaction.
      const assignRes = await assignPlan(app, adminToken, member1.id, {
        planId: plan.id,
      });
      expect(assignRes.statusCode).toBe(201);
      const sub1Id = assignRes.body.id as number;

      const [sub1Before] = await app.db
        .select()
        .from(schema.subscriptions)
        .where(eq(schema.subscriptions.id, sub1Id));
      expect(sub1Before.pricePaid).toBe(10000);

      const [txBefore] = await app.db
        .select()
        .from(schema.financialTransactions)
        .where(eq(schema.financialTransactions.memberId, member1.id));
      expect(txBefore.amount).toBe(10000);

      // Bump the plan price (inflation).
      const updated = await app.inject({
        method: "PUT",
        url: `${SUBSCRIPTIONS_URL}/plans/${plan.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { priceRegular: 20000, priceZero: 16000 },
      });
      expect(updated.statusCode).toBe(200);
      const updatedBody = JSON.parse(updated.body);
      // (a) NO new plan — same id.
      expect(updatedBody.id).toBe(plan.id);
      expect(updatedBody.priceRegular).toBe(20000);

      // (b) Historical pricePaid + transaction amount UNCHANGED.
      const [sub1After] = await app.db
        .select()
        .from(schema.subscriptions)
        .where(eq(schema.subscriptions.id, sub1Id));
      expect(sub1After.pricePaid).toBe(10000);

      const [txAfter] = await app.db
        .select()
        .from(schema.financialTransactions)
        .where(eq(schema.financialTransactions.memberId, member1.id));
      expect(txAfter.amount).toBe(10000);

      // (c) A NEW assignment (different member) uses the NEW price.
      const member2 = await createMember(app, {
        email: "plan04-m2@test.com",
      });
      const assign2 = await assignPlan(app, adminToken, member2.id, {
        planId: plan.id,
      });
      expect(assign2.statusCode).toBe(201);
      const [sub2] = await app.db
        .select()
        .from(schema.subscriptions)
        .where(eq(schema.subscriptions.id, assign2.body.id as number));
      expect(sub2.pricePaid).toBe(20000);

      // (d) BY DESIGN: renewing member1 INHERITS the old pricePaid (10000),
      // NOT the new plan price (20000). This is the deliberate Pomilio rule —
      // documented here, never "corrected".
      const renew = await app.inject({
        method: "POST",
        url: `${SUBSCRIPTIONS_URL}/members/${member1.id}/subscription/renew`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { paymentMethod: "cash", amountReceived: 0 },
      });
      expect(renew.statusCode).toBe(201);
      const renewBody = JSON.parse(renew.body) as { pricePaid: number };
      expect(renewBody.pricePaid).toBe(10000);
    });
  });
});
