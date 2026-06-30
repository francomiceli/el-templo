/**
 * Phase 112 Plan 04 — Admin add-on assignment endpoint integration tests.
 *
 * Covers ADDON-API-01..06 + D-22 RBAC + D-13 finance integration + D-14
 * gift path + D-15 currency inheritance + D-24 audit log + atomicity.
 *
 *   POST /api/admin/users/:userId/program-addons
 *   POST /api/admin/programs/enrollments/:enrollmentId/cancel  (audit branch)
 *
 * Real MySQL eltemplo_test, no mocks.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { and, eq, sql } from "drizzle-orm";
import {
  createTestApp,
  createStaffUser,
  getAuthToken,
  cleanAllTestData,
  registerUser,
  dateOffsetStr,
} from "../helpers";
import { programs } from "../../src/db/schema/micro-programs";
import { programEnrollments } from "../../src/db/schema/program-enrollments";
import { subscriptions } from "../../src/db/schema/subscriptions";
import { subscriptionPlans } from "../../src/db/schema/subscription-plans";
import { financialTransactions } from "../../src/db/schema/financial-transactions";
import { transactionLinks } from "../../src/db/schema/transaction-links";
import { auditLog } from "../../src/db/schema/audit-log";
import { createPlan, assignPlan } from "../subscriptions/_helpers";

describe("Admin add-on assignment endpoint (Phase 112 Plan 04)", () => {
  let app: FastifyInstance;
  let ownerToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    // Seeded admin@test.com user is role=owner per test/setup.ts:59 — sits
    // inside FINANCE_WRITE_ROLES so its token authorizes every happy-path
    // call below.
    ownerToken = await getAuthToken(app, "admin@test.com", "adminpass123");
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
  });

  // ─── Helpers ─────────────────────────────────────────────────────────────

  async function loginAs(
    role: "admin" | "coach" | "recepcion" | "gestion" | "owner",
  ): Promise<string> {
    if (role === "owner") return ownerToken;
    const email = `addon-${role}-${Date.now()}@test.local`;
    await createStaffUser(app, {
      email,
      password: "pass123456",
      firstName: role,
      lastName: "Tester",
      role,
      branchId: 1,
    });
    return getAuthToken(app, email, "pass123456");
  }

  /**
   * Seed a member with a presencial sub assigned through the admin API so
   * the active|paused gate succeeds and the financial currency inherits
   * from the plan. Returns userId.
   */
  async function seedMemberWithSub(): Promise<{
    userId: number;
    subId: number;
    planId: number;
  }> {
    const member = await registerUser(app, {
      email: `addon-member-${Date.now()}-${Math.random()}@test.local`,
      password: "pass123456",
      firstName: "Member",
      lastName: "Tester",
      branchId: 1,
    });
    const userId = (member.user as { id: number }).id;
    const plan = await createPlan(app, ownerToken, {
      name: `Plan addon test ${Date.now()}`,
      planTier: "flex",
      bookingMode: "flexible",
    });
    const assignRes = await assignPlan(app, ownerToken, userId, {
      planId: plan.id,
      startDate: dateOffsetStr(-1),
    });
    expect(assignRes.statusCode).toBe(201);
    const [subRow] = await app.db
      .select({ id: subscriptions.id })
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId))
      .limit(1);
    return { userId, subId: subRow.id, planId: plan.id };
  }

  /**
   * Insert a program directly via Drizzle. Returns programId.
   */
  async function seedProgram(
    overrides: Partial<typeof programs.$inferInsert> = {},
  ): Promise<number> {
    const result = await app.db.insert(programs).values({
      name: overrides.name ?? `Add-on Program ${Date.now()}`,
      description: overrides.description ?? "Test program",
      durationWeeks: overrides.durationWeeks ?? 4,
      sessionsPerWeekToAdvance: overrides.sessionsPerWeekToAdvance ?? 3,
      isActive: overrides.isActive ?? true,
      goalPlanType: overrides.goalPlanType ?? "tren_superior",
      ...overrides,
    });
    return Number(result[0].insertId);
  }

  async function postAddon(
    token: string,
    userId: number,
    body: Record<string, unknown>,
  ) {
    return app.inject({
      method: "POST",
      url: `/api/admin/users/${userId}/program-addons`,
      headers: { authorization: `Bearer ${token}` },
      payload: body,
    });
  }

  // ─── Test 1 (ADDON-API-01): happy path with pricePaid > 0 ────────────────

  it("ADDON-API-01: admin POST creates an active admin_addon enrollment row", async () => {
    const { userId, subId } = await seedMemberWithSub();
    const programId = await seedProgram({ name: "Espartana p1" });

    const res = await postAddon(ownerToken, userId, {
      programId,
      pricePaid: 5000,
      paymentMethod: "cash",
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { enrollmentId: number };
    expect(body.enrollmentId).toBeGreaterThan(0);

    const [row] = await app.db
      .select()
      .from(programEnrollments)
      .where(eq(programEnrollments.id, body.enrollmentId));
    expect(row.userId).toBe(userId);
    expect(row.programId).toBe(programId);
    expect(row.source).toBe("admin_addon");
    expect(row.subscriptionId).toBe(subId);
    expect(row.status).toBe("active");
    expect(row.pricePaid).toBe(5000);
  });

  // ─── Test 2 (ADDON-API-02): no active sub → 400 ASSIGN_PLAN_FIRST ────────

  it("ADDON-API-02: user with no active sub returns 400 ASSIGN_PLAN_FIRST", async () => {
    const member = await registerUser(app, {
      email: `addon-nosub-${Date.now()}@test.local`,
      password: "pass123456",
      firstName: "Nosub",
      lastName: "Tester",
      branchId: 1,
    });
    const userId = (member.user as { id: number }).id;
    const programId = await seedProgram({ name: "p2" });

    const res = await postAddon(ownerToken, userId, {
      programId,
      pricePaid: 0,
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body) as { code?: string };
    expect(body.code).toBe("ASSIGN_PLAN_FIRST");
  });

  // ─── Test 3 (ADDON-API-03): paid path emits financial_transaction + link

  it("ADDON-API-03: pricePaid>0 emits financial_transaction (plan_charge inflow) + transaction_links target_kind=enrollment", async () => {
    const { userId, planId } = await seedMemberWithSub();
    const programId = await seedProgram({ name: "Espartana p3" });

    const res = await postAddon(ownerToken, userId, {
      programId,
      pricePaid: 7500,
      paymentMethod: "transfer",
    });
    expect(res.statusCode).toBe(200);
    const { enrollmentId } = JSON.parse(res.body) as { enrollmentId: number };

    // Resolve plan currency for D-15 assertion.
    const [planRow] = await app.db
      .select({ currency: subscriptionPlans.currency })
      .from(subscriptionPlans)
      .where(eq(subscriptionPlans.id, planId));

    const txRows = await app.db
      .select()
      .from(financialTransactions)
      .where(
        and(
          eq(financialTransactions.memberId, userId),
          eq(financialTransactions.kind, "plan_charge"),
        ),
      );
    expect(txRows.length).toBeGreaterThanOrEqual(1);
    // The most recent plan_charge for this user is the add-on.
    const addonTx = txRows[txRows.length - 1];
    expect(addonTx.direction).toBe("inflow");
    expect(addonTx.amount).toBe(7500);
    expect(addonTx.currency).toBe(planRow.currency);
    expect(addonTx.paymentMethod).toBe("transfer");

    const links = await app.db
      .select()
      .from(transactionLinks)
      .where(eq(transactionLinks.transactionId, addonTx.id));
    expect(links).toHaveLength(1);
    expect(links[0].targetKind).toBe("enrollment");
    expect(links[0].targetId).toBe(enrollmentId);
    expect(links[0].allocatedAmount).toBe(7500);
  });

  // ─── Test 4 (ADDON-API-04): pricePaid=0 (regalo) skips finance ───────────

  it("ADDON-API-04: pricePaid=0 creates the enrollment but no financial_transaction (regalo path)", async () => {
    const { userId } = await seedMemberWithSub();
    const programId = await seedProgram({ name: "Regalo p4" });

    const ftBefore = await app.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(financialTransactions)
      .where(eq(financialTransactions.memberId, userId));

    const res = await postAddon(ownerToken, userId, {
      programId,
      pricePaid: 0,
    });
    expect(res.statusCode).toBe(200);

    const ftAfter = await app.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(financialTransactions)
      .where(eq(financialTransactions.memberId, userId));
    expect(Number(ftAfter[0].count)).toBe(Number(ftBefore[0].count));
  });

  // ─── Test 5 (ADDON-API-04 b): pricePaid omitted (null) — same as 0 ───────

  it("ADDON-API-04: pricePaid omitted (null) also skips financial_transaction", async () => {
    const { userId } = await seedMemberWithSub();
    const programId = await seedProgram({ name: "Regalo p5" });

    const ftBefore = await app.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(financialTransactions)
      .where(eq(financialTransactions.memberId, userId));

    const res = await postAddon(ownerToken, userId, { programId });
    expect(res.statusCode).toBe(200);

    const ftAfter = await app.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(financialTransactions)
      .where(eq(financialTransactions.memberId, userId));
    expect(Number(ftAfter[0].count)).toBe(Number(ftBefore[0].count));

    const { enrollmentId } = JSON.parse(res.body) as { enrollmentId: number };
    const [row] = await app.db
      .select()
      .from(programEnrollments)
      .where(eq(programEnrollments.id, enrollmentId));
    expect(row.pricePaid).toBeNull();
  });

  // ─── Test 6 (ADDON-API-05): duplicate program → 409 ──────────────────────

  it("ADDON-API-05: duplicate active enrollment for same program returns 409 PROGRAM_ALREADY_ACTIVE (admin_addon source)", async () => {
    const { userId } = await seedMemberWithSub();
    const programId = await seedProgram({ name: "Dup p6" });

    const first = await postAddon(ownerToken, userId, {
      programId,
      pricePaid: 0,
    });
    expect(first.statusCode).toBe(200);

    const second = await postAddon(ownerToken, userId, {
      programId,
      pricePaid: 0,
    });
    expect(second.statusCode).toBe(409);
    const body = JSON.parse(second.body) as { code?: string };
    expect(body.code).toBe("PROGRAM_ALREADY_ACTIVE");
  });

  it("ADDON-API-05: duplicate via plan_linked source also returns 409 PROGRAM_ALREADY_ACTIVE", async () => {
    const programId = await seedProgram({
      name: "Linked p6b",
      goalPlanType: "tren_superior",
    });
    const linkedPlan = await createPlan(app, ownerToken, {
      name: `Plan linked addon ${Date.now()}`,
      planCategory: "online_goal",
      goalPlanType: "tren_superior",
      linkedProgramId: programId,
    });
    const member = await registerUser(app, {
      email: `addon-linked-${Date.now()}@test.local`,
      password: "pass123456",
      firstName: "Linked",
      lastName: "Tester",
      branchId: 1,
    });
    const userId = (member.user as { id: number }).id;
    const assignRes = await assignPlan(app, ownerToken, userId, {
      planId: linkedPlan.id,
      startDate: dateOffsetStr(-1),
    });
    expect(assignRes.statusCode).toBe(201);

    // assignPlan auto-created an active plan_linked enrollment for programId.
    const dupAttempt = await postAddon(ownerToken, userId, {
      programId,
      pricePaid: 0,
    });
    expect(dupAttempt.statusCode).toBe(409);
    const body = JSON.parse(dupAttempt.body) as { code?: string };
    expect(body.code).toBe("PROGRAM_ALREADY_ACTIVE");
  });

  // ─── Test 7 (ADDON-API-06): cancel admin_addon writes audit_log row ──────

  it("ADDON-API-06: cancel of admin_addon enrollment writes audit_log entry with cancelledByAdmin=true", async () => {
    const { userId } = await seedMemberWithSub();
    const programId = await seedProgram({ name: "Cancel p7" });

    const assignRes = await postAddon(ownerToken, userId, {
      programId,
      pricePaid: 0,
    });
    expect(assignRes.statusCode).toBe(200);
    const { enrollmentId } = JSON.parse(assignRes.body) as {
      enrollmentId: number;
    };

    const cancelRes = await app.inject({
      method: "POST",
      url: `/api/admin/programs/enrollments/${enrollmentId}/cancel`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(cancelRes.statusCode).toBe(200);

    const [enrollAfter] = await app.db
      .select({ status: programEnrollments.status })
      .from(programEnrollments)
      .where(eq(programEnrollments.id, enrollmentId));
    expect(enrollAfter.status).toBe("cancelled");

    const auditRows = await app.db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.action, "plan_assigned"),
          eq(auditLog.targetKind, "member"),
          eq(auditLog.targetId, userId),
        ),
      );
    // We expect at LEAST 2: one for the assign, one for the cancel.
    expect(auditRows.length).toBeGreaterThanOrEqual(2);
    const cancelAudit = auditRows.find(
      (r) =>
        (r.payloadJson as { cancelledByAdmin?: boolean }).cancelledByAdmin ===
        true,
    );
    expect(cancelAudit).toBeDefined();
    expect(
      (cancelAudit?.payloadJson as { enrollmentId?: number }).enrollmentId,
    ).toBe(enrollmentId);
  });

  // ─── Test 8 (D-22 RBAC): coach 403, recepcion 200 ────────────────────────

  it("D-22: coach role gets 403 (FINANCE_WRITE_ROLES excludes coach)", async () => {
    const { userId } = await seedMemberWithSub();
    const programId = await seedProgram({ name: "RBAC coach p8" });
    const coachToken = await loginAs("coach");

    const res = await postAddon(coachToken, userId, {
      programId,
      pricePaid: 0,
    });
    expect(res.statusCode).toBe(403);
  });

  it("D-22: recepcion role gets 200 (FINANCE_WRITE_ROLES includes recepcion)", async () => {
    const { userId } = await seedMemberWithSub();
    const programId = await seedProgram({ name: "RBAC recep p8b" });
    const recepToken = await loginAs("recepcion");

    const res = await postAddon(recepToken, userId, {
      programId,
      pricePaid: 0,
    });
    expect(res.statusCode).toBe(200);
  });

  // ─── Test 9 (D-24 audit log on assign) ───────────────────────────────────

  it("D-24: assignment writes audit_log row with action=plan_assigned and full payload", async () => {
    const { userId, subId } = await seedMemberWithSub();
    const programId = await seedProgram({ name: "Audit p9" });

    const res = await postAddon(ownerToken, userId, {
      programId,
      pricePaid: 0,
    });
    expect(res.statusCode).toBe(200);
    const { enrollmentId } = JSON.parse(res.body) as { enrollmentId: number };

    const auditRows = await app.db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.action, "plan_assigned"),
          eq(auditLog.targetKind, "member"),
          eq(auditLog.targetId, userId),
        ),
      );
    expect(auditRows.length).toBeGreaterThanOrEqual(1);
    const assignAudit = auditRows.find(
      (r) =>
        (r.payloadJson as { enrollmentId?: number }).enrollmentId ===
          enrollmentId &&
        (r.payloadJson as { cancelledByAdmin?: boolean }).cancelledByAdmin !==
          true,
    );
    expect(assignAudit).toBeDefined();
    const payload = assignAudit?.payloadJson as Record<string, unknown>;
    expect(payload.programId).toBe(programId);
    expect(payload.subscriptionId).toBe(subId);
    expect(payload.source).toBe("admin_addon");
  });

  // ─── Test 10 (atomicity): bad input rolls back enrollment row ────────────

  it("Atomicity: program does not exist → no enrollment row inserted (full tx rollback)", async () => {
    const { userId } = await seedMemberWithSub();

    const enrollBefore = await app.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(programEnrollments)
      .where(eq(programEnrollments.userId, userId));

    // Use a guaranteed-nonexistent programId to trigger NotFoundError BEFORE
    // the insert. Verifies no orphan row leaks via the early-validation path
    // (the strongest guarantee at the contract level — the financial-write
    // failure path would also rollback because everything runs in the same tx,
    // but is harder to deterministically trigger without mocking).
    const res = await postAddon(ownerToken, userId, {
      programId: 999_999_999,
      pricePaid: 5000,
    });
    expect(res.statusCode).toBe(404);

    const enrollAfter = await app.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(programEnrollments)
      .where(eq(programEnrollments.userId, userId));
    expect(Number(enrollAfter[0].count)).toBe(Number(enrollBefore[0].count));
  });

  // ─── Test 11 (D-15 currency inheritance): EUR plan ──────────────────────

  it("D-15: currency inherits from active sub plan — EUR plan produces EUR financial_transaction", async () => {
    // Create the plan + sub directly via Drizzle so we can pin currency=EUR
    // without the createPlan API path's country/currency interaction.
    const member = await registerUser(app, {
      email: `addon-eur-${Date.now()}@test.local`,
      password: "pass123456",
      firstName: "Eur",
      lastName: "Tester",
      branchId: 1,
    });
    const userId = (member.user as { id: number }).id;

    const planResult = await app.db.insert(subscriptionPlans).values({
      name: `EUR Plan ${Date.now()}`,
      description: "EUR test plan",
      planTier: "flex",
      bookingMode: "flexible",
      planCategory: "presencial",
      priceRegular: 100,
      priceZero: 100,
      durationDays: 30,
      classesPerWeek: 3,
      country: "ES",
      currency: "EUR",
      isActive: true,
    });
    const planId = Number(planResult[0].insertId);

    const subResult = await app.db.insert(subscriptions).values({
      userId,
      planId,
      branchId: 1,
      status: "active",
      startDate: dateOffsetStr(-1),
      endDate: dateOffsetStr(29),
      pricePaid: 100,
      currency: "EUR",
      paymentMethod: "cash",
    });
    const subId = Number(subResult[0].insertId);
    expect(subId).toBeGreaterThan(0);

    const programId = await seedProgram({ name: "EUR Program p11" });
    // Phase 138: create() resolves a caja from paymentMethod and enforces the
    // currency guard. A cash charge would resolve to branch 1's EFECTIVO caja
    // (ARS in the AR-branch seed) and the EUR≠ARS guard would (correctly) 400 —
    // there is no EUR efectivo drawer at an AR branch. D-15 is about currency
    // INHERITANCE, not the cash drawer, so pay by transfer → resolves to the
    // branch-less Banco EUR caja (seeded), keeping the fixture coherent.
    const res = await postAddon(ownerToken, userId, {
      programId,
      pricePaid: 50,
      paymentMethod: "transfer",
    });
    expect(res.statusCode).toBe(200);

    const txRows = await app.db
      .select()
      .from(financialTransactions)
      .where(
        and(
          eq(financialTransactions.memberId, userId),
          eq(financialTransactions.kind, "plan_charge"),
        ),
      );
    expect(txRows.length).toBeGreaterThanOrEqual(1);
    const addonTx = txRows[txRows.length - 1];
    expect(addonTx.currency).toBe("EUR");
    expect(addonTx.amount).toBe(50);
  });
});
