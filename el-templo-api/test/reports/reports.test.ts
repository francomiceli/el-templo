import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq, sql } from "drizzle-orm";
import {
  createTestApp,
  getAuthToken,
  registerUser,
  cleanAllTestData,
} from "../helpers";
import { attendance } from "../../src/db/schema/attendance";
import { financialTransactions } from "../../src/db/schema/financial-transactions";
import { transactionLinks } from "../../src/db/schema/transaction-links";
import { subscriptions } from "../../src/db/schema/subscriptions";
import { subscriptionPlans } from "../../src/db/schema/subscription-plans";
import { users } from "../../src/db/schema/users";
import { branches } from "../../src/db/schema/branches";

const REPORTS_URL = "/api/admin/reports";
const SUBSCRIPTIONS_URL = "/api/admin/subscriptions";

describe("Reports API", () => {
  let app: FastifyInstance;
  let adminToken: string;
  let adminUserId: number;
  let testBranchId: number;

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");

    // Get admin user ID for recordedBy
    const [adminUser] = await app.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, "admin@test.com"));
    adminUserId = adminUser.id;

    const [branch] = await app.db
      .select({ id: branches.id })
      .from(branches)
      .where(eq(branches.isVirtual, false));
    testBranchId = branch.id;
  });

  afterAll(async () => {
    await app.close();
  });

  // ─── Helpers ──────────────────────────────────────────────────────────────

  async function createPlan(
    overrides: Record<string, unknown> = {},
  ): Promise<{ id: number; [key: string]: unknown }> {
    const res = await app.inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}/plans`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        name: `Report Plan ${Date.now()}`,
        planTier: "flex",
        bookingMode: "flexible",
        priceRegular: 10000,
        priceZero: 8000,
        durationDays: 30,
        classesPerWeek: 3,
        multiBranch: false,
        ...overrides,
      },
    });
    expect(res.statusCode).toBe(201);
    return JSON.parse(res.body);
  }

  async function createMember(
    overrides: Record<string, unknown> = {},
  ): Promise<{ id: number; [key: string]: unknown }> {
    const data = {
      email: `report-${Date.now()}@test.com`,
      password: "pass123456",
      firstName: "Report",
      lastName: "Tester",
      branchId: testBranchId,
      ...overrides,
    };
    const result = await registerUser(app, data);
    return { id: (result.user as { id: number }).id, ...result.user };
  }

  async function assignSubscription(
    memberId: number,
    planId: number,
    overrides: Record<string, unknown> = {},
  ): Promise<Record<string, unknown>> {
    const today = new Date().toISOString().split("T")[0];
    const res = await app.inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}/members/${memberId}/subscription/assign`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        planId,
        branchId: testBranchId,
        startDate: today,
        priceTypeApplied: "regular",
        paymentMethod: "cash",
        ...overrides,
      },
    });
    expect(res.statusCode).toBe(201);
    return JSON.parse(res.body);
  }

  /**
   * Plan 105-06: insert a financial_transactions row + transaction_links pivot
   * to drive the reports/charges endpoint. Replaces direct inserts into the
   * dropped `payments` table.
   */
  async function insertChargeTxn(opts: {
    memberId: number;
    subId: number;
    amount: number;
    paymentMethod: "cash" | "transfer" | "card";
    date: string;
    voided?: boolean;
  }): Promise<void> {
    const [inserted] = await app.db.insert(financialTransactions).values({
      memberId: opts.memberId,
      kind: "plan_charge",
      direction: "inflow",
      amount: opts.amount,
      currency: "ARS",
      paymentMethod: opts.paymentMethod,
      transactionDate: opts.date,
      effectiveDate: opts.date,
      branchId: testBranchId,
      recordedBy: adminUserId,
      ...(opts.voided
        ? {
            voidedAt: new Date(),
            voidedBy: adminUserId,
            voidReason: "Error de carga",
          }
        : {}),
    });
    const txnId = (inserted as { insertId: number }).insertId;
    await app.db.insert(transactionLinks).values({
      transactionId: txnId,
      targetKind: "subscription",
      targetId: opts.subId,
      allocatedAmount: opts.amount,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Access Log
  // ═══════════════════════════════════════════════════════════════════════════

  describe("GET /access", () => {
    beforeEach(async () => {
      await cleanAllTestData(app);
    });

    it("should return paginated access log", async () => {
      const member = await createMember({
        email: "acc1@test.com",
        firstName: "Acceso",
        lastName: "Primero",
      });

      // Insert attendance records
      await app.db.insert(attendance).values([
        {
          memberId: member.id,
          branchId: testBranchId,
          status: "confirmado",
          source: "qr",
          sessionDate: new Date().toISOString().split("T")[0],
        },
        {
          memberId: member.id,
          branchId: testBranchId,
          status: "confirmado",
          source: "manual",
          sessionDate: new Date().toISOString().split("T")[0],
        },
      ]);

      const res = await app.inject({
        method: "GET",
        url: `${REPORTS_URL}/access`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.rows).toBeInstanceOf(Array);
      expect(body.total).toBeGreaterThanOrEqual(2);
      expect(body.page).toBe(1);
      expect(body.limit).toBe(20);

      const row = body.rows[0];
      expect(row.checkedInAt).toBeDefined();
      expect(row.memberName).toBeDefined();
      expect(row.branchName).toBeDefined();
      expect(row.source).toBeDefined();
    });

    it("should filter by source=qr", async () => {
      const member = await createMember({
        email: "acc-src@test.com",
        firstName: "SourceTest",
        lastName: "User",
      });

      await app.db.insert(attendance).values([
        {
          memberId: member.id,
          branchId: testBranchId,
          status: "confirmado",
          source: "qr",
          sessionDate: new Date().toISOString().split("T")[0],
        },
        {
          memberId: member.id,
          branchId: testBranchId,
          status: "confirmado",
          source: "manual",
          sessionDate: new Date().toISOString().split("T")[0],
        },
      ]);

      const res = await app.inject({
        method: "GET",
        url: `${REPORTS_URL}/access?source=qr`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.rows.length).toBeGreaterThanOrEqual(1);
      for (const row of body.rows) {
        expect(row.source).toBe("qr");
      }
    });

    it("should filter by member name search", async () => {
      const member1 = await createMember({
        email: "acc-search1@test.com",
        firstName: "Buscado",
        lastName: "Particular",
      });
      const member2 = await createMember({
        email: "acc-search2@test.com",
        firstName: "Otro",
        lastName: "Miembro",
      });

      await app.db.insert(attendance).values([
        {
          memberId: member1.id,
          branchId: testBranchId,
          status: "confirmado",
          source: "qr",
          sessionDate: new Date().toISOString().split("T")[0],
        },
        {
          memberId: member2.id,
          branchId: testBranchId,
          status: "confirmado",
          source: "qr",
          sessionDate: new Date().toISOString().split("T")[0],
        },
      ]);

      const res = await app.inject({
        method: "GET",
        url: `${REPORTS_URL}/access?search=Buscado`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.rows.length).toBe(1);
      expect(body.rows[0].memberName).toContain("Buscado");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Charges
  // ═══════════════════════════════════════════════════════════════════════════

  describe("GET /charges", () => {
    beforeEach(async () => {
      await cleanAllTestData(app);
    });

    it("should return paginated charge history with voided indicator", async () => {
      const plan = await createPlan({ name: "Plan Cobros Test" });
      const member = await createMember({
        email: "charge1@test.com",
        firstName: "Cobro",
        lastName: "Primero",
      });
      const sub = await assignSubscription(member.id, plan.id);
      const subId = sub.id as number;

      // Plan 105-06: payments dropped — insert into financial_transactions +
      // transaction_links (target_kind='subscription') to feed the reports query.
      const today = new Date().toISOString().split("T")[0];
      await insertChargeTxn({
        memberId: member.id,
        subId,
        amount: 10000,
        paymentMethod: "cash",
        date: today,
      });
      await insertChargeTxn({
        memberId: member.id,
        subId,
        amount: 5000,
        paymentMethod: "transfer",
        date: today,
      });
      await insertChargeTxn({
        memberId: member.id,
        subId,
        amount: 3000,
        paymentMethod: "cash",
        date: today,
        voided: true,
      });

      const res = await app.inject({
        method: "GET",
        url: `${REPORTS_URL}/charges`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.rows).toBeInstanceOf(Array);
      // 3 manual + 1 auto from assignSubscription = 4 total
      expect(body.total).toBeGreaterThanOrEqual(3);
      expect(body.page).toBe(1);

      const row = body.rows[0];
      expect(row.paymentDate).toBeDefined();
      expect(row.memberName).toBeDefined();
      expect(row.planName).toBeDefined();
      expect(row.amount).toBeDefined();
      expect(row.paymentMethod).toBeDefined();
      expect(row.recorderName).toBeDefined();

      // Plan 105-06 / 105-04 D-01: voided rows are now excluded by the
      // canonical revenue filter (`voided_at IS NULL`). The legacy test
      // expected voided rows to surface in the charge report; under the
      // new finance model they do not. Confirm exclusion instead.
      const voided = body.rows.find(
        (r: { voidedAt: string | null }) => r.voidedAt !== null,
      );
      expect(voided).toBeUndefined();
    });

    it("should filter by payment method", async () => {
      const plan = await createPlan({ name: "Plan Method Filter" });
      const member = await createMember({
        email: "charge-method@test.com",
        firstName: "Metodo",
        lastName: "Filtro",
      });
      const sub = await assignSubscription(member.id, plan.id);
      const subId = sub.id as number;

      // Plan 105-06: payments dropped — see helper.
      const today = new Date().toISOString().split("T")[0];
      await insertChargeTxn({
        memberId: member.id,
        subId,
        amount: 10000,
        paymentMethod: "cash",
        date: today,
      });
      await insertChargeTxn({
        memberId: member.id,
        subId,
        amount: 5000,
        paymentMethod: "transfer",
        date: today,
      });

      const res = await app.inject({
        method: "GET",
        url: `${REPORTS_URL}/charges?paymentMethod=transfer`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.rows.length).toBeGreaterThanOrEqual(1);
      for (const row of body.rows) {
        expect(row.paymentMethod).toBe("transfer");
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Expiring
  // ═══════════════════════════════════════════════════════════════════════════

  describe("GET /expiring", () => {
    beforeEach(async () => {
      await cleanAllTestData(app);
    });

    it("should return members with subscriptions expiring soon", async () => {
      const plan = await createPlan({
        name: "Plan Vencimiento",
        durationDays: 5,
      });
      const memberExpiring = await createMember({
        email: "expiring@test.com",
        firstName: "Pronto",
        lastName: "Vence",
      });
      const memberFar = await createMember({
        email: "notexpiring@test.com",
        firstName: "Lejos",
        lastName: "NoVence",
      });

      // Assign plan that expires in 3 days
      const startExpiring = new Date();
      startExpiring.setDate(startExpiring.getDate() - 2);
      await assignSubscription(memberExpiring.id, plan.id, {
        startDate: startExpiring.toISOString().split("T")[0],
      });

      // Assign plan with 30-day duration (expires far out)
      const planLong = await createPlan({
        name: "Plan Largo",
        durationDays: 30,
      });
      await assignSubscription(memberFar.id, planLong.id);

      const res = await app.inject({
        method: "GET",
        url: `${REPORTS_URL}/expiring?daysWindow=7`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body).toBeInstanceOf(Array);

      // memberExpiring should appear (expires in 3 days)
      const found = body.find(
        (r: { userId: number }) => r.userId === memberExpiring.id,
      );
      expect(found).toBeDefined();
      expect(found.memberName).toContain("Pronto");
      expect(found.daysRemaining).toBeGreaterThanOrEqual(0);
      expect(found.daysRemaining).toBeLessThanOrEqual(7);

      // memberFar should NOT appear (expires in 30 days)
      const notFound = body.find(
        (r: { userId: number }) => r.userId === memberFar.id,
      );
      expect(notFound).toBeUndefined();
    });

    it("should include expired subs when includeExpired=true", async () => {
      const plan = await createPlan({
        name: "Plan Expired Test",
        durationDays: 3,
      });
      const member = await createMember({
        email: "expired@test.com",
        firstName: "Ya",
        lastName: "Vencio",
      });

      // Assign plan starting 5 days ago (expired 2 days ago)
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 5);
      await assignSubscription(member.id, plan.id, {
        startDate: startDate.toISOString().split("T")[0],
      });

      // Force status to expired
      await app.db
        .update(subscriptions)
        .set({ status: "expired" })
        .where(eq(subscriptions.userId, member.id));

      const res = await app.inject({
        method: "GET",
        url: `${REPORTS_URL}/expiring?daysWindow=5&includeExpired=true`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      const found = body.find(
        (r: { userId: number }) => r.userId === member.id,
      );
      expect(found).toBeDefined();
      expect(found.daysRemaining).toBeLessThan(0); // negative = overdue
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Inactive
  // ═══════════════════════════════════════════════════════════════════════════

  describe("GET /inactive", () => {
    beforeEach(async () => {
      await cleanAllTestData(app);
    });

    it("should return members with no recent check-in", async () => {
      const plan = await createPlan({ name: "Plan Inactivo" });

      // Member with old check-in (20+ days ago)
      const memberInactive = await createMember({
        email: "inactive@test.com",
        firstName: "Inactivo",
        lastName: "MiembroX",
      });
      await assignSubscription(memberInactive.id, plan.id);

      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 20);
      await app.db.insert(attendance).values({
        memberId: memberInactive.id,
        branchId: testBranchId,
        status: "confirmado",
        source: "qr",
        checkedInAt: oldDate,
        sessionDate: oldDate.toISOString().split("T")[0],
      });

      // Member with recent check-in (today)
      const memberActive = await createMember({
        email: "active@test.com",
        firstName: "Activo",
        lastName: "MiembroY",
      });
      await assignSubscription(memberActive.id, plan.id);

      await app.db.insert(attendance).values({
        memberId: memberActive.id,
        branchId: testBranchId,
        status: "confirmado",
        source: "qr",
        checkedInAt: new Date(),
        sessionDate: new Date().toISOString().split("T")[0],
      });

      const res = await app.inject({
        method: "GET",
        url: `${REPORTS_URL}/inactive?daysThreshold=14`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body).toBeInstanceOf(Array);

      // Inactive member should appear
      const found = body.find(
        (r: { userId: number }) => r.userId === memberInactive.id,
      );
      expect(found).toBeDefined();
      expect(found.daysSinceCheckIn).toBeGreaterThanOrEqual(14);

      // Active member should NOT appear
      const notFound = body.find(
        (r: { userId: number }) => r.userId === memberActive.id,
      );
      expect(notFound).toBeUndefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Export
  // ═══════════════════════════════════════════════════════════════════════════

  describe("GET /access/export", () => {
    beforeEach(async () => {
      await cleanAllTestData(app);
    });

    it("should return Excel binary with correct headers", async () => {
      const member = await createMember({
        email: "export@test.com",
        firstName: "Export",
        lastName: "Test",
      });

      await app.db.insert(attendance).values({
        memberId: member.id,
        branchId: testBranchId,
        status: "confirmado",
        source: "qr",
        sessionDate: new Date().toISOString().split("T")[0],
      });

      const res = await app.inject({
        method: "GET",
        url: `${REPORTS_URL}/access/export`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toBe(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      const contentDisposition = res.headers["content-disposition"] as string;
      expect(contentDisposition).toContain("reportes-accesos-");
      expect(contentDisposition).toContain(".xlsx");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Authorization
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Authorization", () => {
    beforeEach(async () => {
      await cleanAllTestData(app);
    });

    it("should return 403 for member role", async () => {
      const { token: memberToken } = await registerUser(app, {
        email: "regular-report@test.com",
        password: "pass123456",
        firstName: "Regular",
        lastName: "Member",
        branchId: testBranchId,
      });

      const endpoints = [
        `${REPORTS_URL}/access`,
        `${REPORTS_URL}/charges`,
        `${REPORTS_URL}/expiring`,
        `${REPORTS_URL}/inactive`,
        `${REPORTS_URL}/trial-conversion`,
      ];

      for (const url of endpoints) {
        const res = await app.inject({
          method: "GET",
          url,
          headers: { authorization: `Bearer ${memberToken}` },
        });
        expect(res.statusCode).toBe(403);
      }
    });

    it("should return 401 for unauthenticated requests", async () => {
      const res = await app.inject({
        method: "GET",
        url: `${REPORTS_URL}/access`,
      });
      expect(res.statusCode).toBe(401);
    });
  });
});
