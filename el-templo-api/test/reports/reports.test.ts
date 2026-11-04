import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { Workbook } from "exceljs";
import { and, eq, sql } from "drizzle-orm";
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
import { tenantValues, tenantWhere } from "../../src/modules/shared/tenant";
import { TENANT_TEMPLO } from "../fixtures/second-tenant";

/**
 * 172-15: `TEMPLO_CTX` es el gimnasio de este archivo. Las queries directas de
 * los tests pasan por `app.dbPool` igual que las de la app, asi que con
 * `finance` en `TENANT_STRICT_MODULES` una lectura o una siembra sobre las
 * tablas strict sin gimnasio hace throw antes de llegar a MySQL.
 */
const TEMPLO_CTX = { tenantId: TENANT_TEMPLO };

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
      .where(
        and(tenantWhere(users, TEMPLO_CTX), eq(users.email, "admin@test.com")),
      );
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
    /** Sede donde se registró el cobro. Default: testBranchId. null = cobro sin sede. */
    chargeBranchId?: number | null;
    /** Default: plan_charge. */
    kind?: "plan_charge" | "debt_settlement";
    /**
     * Links a suscripción. Default: uno solo a `subId` por el monto completo.
     * Un pago de deuda que cancela deudas de varias suscripciones lleva uno
     * por cada una, con su parte en `allocatedAmount`.
     */
    links?: Array<{ subId: number; allocatedAmount: number }>;
  }): Promise<number> {
    const [inserted] = await app.db.insert(financialTransactions).values(
      tenantValues(TEMPLO_CTX, {
        memberId: opts.memberId,
        kind: opts.kind ?? "plan_charge",
        direction: "inflow",
        amount: opts.amount,
        currency: "ARS",
        paymentMethod: opts.paymentMethod,
        transactionDate: opts.date,
        effectiveDate: opts.date,
        branchId:
          opts.chargeBranchId === undefined
            ? testBranchId
            : opts.chargeBranchId,
        recordedBy: adminUserId,
        ...(opts.voided
          ? {
              voidedAt: new Date(),
              voidedBy: adminUserId,
              voidReason: "Error de carga",
            }
          : {}),
      }),
    );
    const txnId = (inserted as { insertId: number }).insertId;
    const links = opts.links ?? [
      { subId: opts.subId, allocatedAmount: opts.amount },
    ];
    for (const link of links) {
      await app.db.insert(transactionLinks).values(
        tenantValues(TEMPLO_CTX, {
          transactionId: txnId,
          targetKind: "subscription",
          targetId: link.subId,
          allocatedAmount: link.allocatedAmount,
        }),
      );
    }
    return txnId;
  }

  /**
   * Segunda suscripción del mismo alumno, insertada directo (la API no deja
   * tener dos presenciales vivas a la vez). Copia la fila de `subId` con otro
   * plan: el reporte de cobros solo mira el link y el nombre del plan.
   */
  async function cloneSubscriptionWithPlan(
    subId: number,
    planId: number,
  ): Promise<number> {
    const [source] = await app.db
      .select()
      .from(subscriptions)
      .where(
        and(
          tenantWhere(subscriptions, TEMPLO_CTX),
          eq(subscriptions.id, subId),
        ),
      );
    expect(source).toBeDefined();
    const { id: _sourceId, ...rest } = source;
    const [inserted] = await app.db
      .insert(subscriptions)
      .values({ ...rest, planId });
    return (inserted as { insertId: number }).insertId;
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

  describe("GET /charges — un pago que cubre varias suscripciones", () => {
    beforeEach(async () => {
      await cleanAllTestData(app);
    });

    /**
     * Hotfix 2026-11-03: un pago de deuda que cancela deudas de DOS
     * suscripciones tiene dos transaction_links. El reporte lo repetía en dos
     * filas con el monto completo en cada una y sumaba de más contra
     * Analítica (Alberti oct-2026: 9.014.000 vs 8.885.500).
     */
    async function seedPagoConDosSuscripciones(email: string) {
      const planA = await createPlan({ name: "Plan Deuda A" });
      const planB = await createPlan({ name: "Plan Deuda B" });
      const member = await createMember({
        email,
        firstName: "Doble",
        lastName: "Vinculo",
      });
      const sub = await assignSubscription(member.id, planA.id);
      const subA = sub.id as number;
      const subB = await cloneSubscriptionWithPlan(subA, planB.id);

      const today = new Date().toISOString().split("T")[0];
      const txnId = await insertChargeTxn({
        memberId: member.id,
        subId: subA,
        kind: "debt_settlement",
        amount: 12345,
        paymentMethod: "cash",
        date: today,
        links: [
          { subId: subA, allocatedAmount: 6000 },
          { subId: subB, allocatedAmount: 6345 },
        ],
      });
      return { member, txnId };
    }

    it("lo muestra en UNA fila, con los dos planes y el monto una sola vez", async () => {
      const { member, txnId } = await seedPagoConDosSuscripciones(
        "charge-doble-link@test.com",
      );

      const res = await app.inject({
        method: "GET",
        url: `${REPORTS_URL}/charges?search=Vinculo&limit=100`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as {
        total: number;
        rows: Array<{ id: number; amount: number; planName: string }>;
      };

      const filasDelPago = body.rows.filter((r) => r.id === txnId);
      expect(filasDelPago).toHaveLength(1);
      expect(filasDelPago[0].amount).toBe(12345);
      expect(filasDelPago[0].planName).toBe("Plan Deuda A + Plan Deuda B");

      // Sin filas repetidas, y el total del paginado cuenta cobros, no links.
      const ids = body.rows.map((r) => r.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(body.total).toBe(body.rows.length);

      // La suma del reporte = la plata cobrada de verdad (cada cobro una vez),
      // que es lo que suma Analítica.
      const [real] = await app.db
        .select({
          total: sql<number>`CAST(COALESCE(SUM(${financialTransactions.amount}), 0) AS SIGNED)`,
        })
        .from(financialTransactions)
        .where(
          and(
            tenantWhere(financialTransactions, TEMPLO_CTX),
            eq(financialTransactions.memberId, member.id),
            sql`${financialTransactions.kind} IN ('plan_charge', 'debt_settlement')`,
            eq(financialTransactions.direction, "inflow"),
            sql`${financialTransactions.voidedAt} IS NULL`,
            eq(financialTransactions.validationStatus, "validado"),
          ),
        );
      const sumaReporte = body.rows.reduce((acc, r) => acc + r.amount, 0);
      expect(sumaReporte).toBe(Number(real.total));
    });

    it("el Excel tampoco lo repite", async () => {
      await seedPagoConDosSuscripciones("charge-doble-link-xls@test.com");

      const res = await app.inject({
        method: "GET",
        url: `${REPORTS_URL}/charges/export?search=Vinculo`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);

      const wb = new Workbook();
      await wb.xlsx.load(res.rawPayload);
      const sheet = wb.getWorksheet("Cobros");
      expect(sheet).toBeDefined();
      if (!sheet) return;

      const headers: string[] = [];
      sheet.getRow(1).eachCell((cell) => headers.push(cell.text));
      const colMonto = headers.indexOf("Monto") + 1;
      const colPlan = headers.indexOf("Plan") + 1;

      const filas: Array<{ plan: string }> = [];
      for (let i = 2; i <= sheet.rowCount; i++) {
        const row = sheet.getRow(i);
        if (Number(row.getCell(colMonto).value) === 12345) {
          filas.push({ plan: row.getCell(colPlan).text });
        }
      }
      expect(filas).toEqual([{ plan: "Plan Deuda A + Plan Deuda B" }]);
    });

    it("un cobro sin link a suscripción sigue sin aparecer", async () => {
      const member = await createMember({
        email: "charge-sin-link@test.com",
        firstName: "Sin",
        lastName: "Vinculo",
      });
      const today = new Date().toISOString().split("T")[0];
      const txnId = await insertChargeTxn({
        memberId: member.id,
        subId: 0,
        amount: 4321,
        paymentMethod: "cash",
        date: today,
        links: [],
      });

      const res = await app.inject({
        method: "GET",
        url: `${REPORTS_URL}/charges?search=Vinculo&limit=100`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as {
        total: number;
        rows: Array<{ id: number }>;
      };
      expect(body.rows.find((r) => r.id === txnId)).toBeUndefined();
      expect(body.total).toBe(body.rows.length);
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
        .where(
          and(
            tenantWhere(subscriptions, TEMPLO_CTX),
            eq(subscriptions.userId, member.id),
          ),
        );

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

    // ─── Future coverage (already-renewed) ────────────────────────────────
    //
    // A member who already loaded a future subscription of the SAME category
    // is no longer a renewal target. By default those rows are hidden; the
    // includeRenewed flag surfaces them with hasFutureCoverage = true.

    function isoFromNow(days: number): string {
      const d = new Date();
      d.setDate(d.getDate() + days);
      return d.toISOString().split("T")[0];
    }

    /** Insert a subscription row directly (bypasses business rules so we can
     * stage future/cancelled coverage that the assign endpoint would reject). */
    async function insertSubscription(opts: {
      userId: number;
      planId: number;
      status: "active" | "paused" | "scheduled" | "cancelled";
      startDate: string;
      endDate: string;
    }): Promise<void> {
      await app.db.insert(subscriptions).values(
        tenantValues(TEMPLO_CTX, {
          userId: opts.userId,
          planId: opts.planId,
          branchId: testBranchId,
          status: opts.status,
          startDate: opts.startDate,
          endDate: opts.endDate,
          pricePaid: 10000,
          priceTypeApplied: "regular",
        }),
      );
    }

    it("hides members who already renewed (future same-category coverage) by default", async () => {
      const plan = await createPlan({
        name: "Plan Presencial Reno",
        durationDays: 5,
        planCategory: "presencial",
      });
      const member = await createMember({
        email: "renewed@test.com",
        firstName: "Ya",
        lastName: "Renovo",
      });

      // Active sub expiring in 3 days.
      const startActive = new Date();
      startActive.setDate(startActive.getDate() - 2);
      await assignSubscription(member.id, plan.id, {
        startDate: startActive.toISOString().split("T")[0],
      });

      // Future presencial coverage starting when the active one ends.
      await insertSubscription({
        userId: member.id,
        planId: plan.id,
        status: "scheduled",
        startDate: isoFromNow(3),
        endDate: isoFromNow(33),
      });

      const res = await app.inject({
        method: "GET",
        url: `${REPORTS_URL}/expiring?daysWindow=7`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      const found = body.find(
        (r: { userId: number }) => r.userId === member.id,
      );
      expect(found).toBeUndefined();
    });

    it("includes already-renewed members flagged when includeRenewed=true", async () => {
      const plan = await createPlan({
        name: "Plan Presencial Reno2",
        durationDays: 5,
        planCategory: "presencial",
      });
      const startActive = new Date();
      startActive.setDate(startActive.getDate() - 2);

      const renewedMember = await createMember({
        email: "renewed2@test.com",
        firstName: "Reno",
        lastName: "Vado",
      });
      await assignSubscription(renewedMember.id, plan.id, {
        startDate: startActive.toISOString().split("T")[0],
      });
      await insertSubscription({
        userId: renewedMember.id,
        planId: plan.id,
        status: "scheduled",
        startDate: isoFromNow(3),
        endDate: isoFromNow(33),
      });

      // A member expiring without any future coverage.
      const plainMember = await createMember({
        email: "plain@test.com",
        firstName: "Sin",
        lastName: "Cobertura",
      });
      await assignSubscription(plainMember.id, plan.id, {
        startDate: startActive.toISOString().split("T")[0],
      });

      const res = await app.inject({
        method: "GET",
        url: `${REPORTS_URL}/expiring?daysWindow=7&includeRenewed=true`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);

      const renewed = body.find(
        (r: { userId: number }) => r.userId === renewedMember.id,
      );
      expect(renewed).toBeDefined();
      expect(renewed.hasFutureCoverage).toBe(true);

      const plain = body.find(
        (r: { userId: number }) => r.userId === plainMember.id,
      );
      expect(plain).toBeDefined();
      expect(plain.hasFutureCoverage).toBe(false);
    });

    it("does NOT hide a member whose future coverage is a different category", async () => {
      const presencialPlan = await createPlan({
        name: "Plan Presencial XCat",
        durationDays: 5,
        planCategory: "presencial",
      });
      // Insert the online plan directly — the create-plan endpoint applies
      // extra validation to online categories that the presencial defaults
      // don't satisfy; we only need a plan of a different category here.
      const [insertedOnline] = await app.db.insert(subscriptionPlans).values({
        tenantId: TENANT_TEMPLO,
        name: "Plan Online XCat",
        planTier: "other",
        bookingMode: "flexible",
        planCategory: "online_regular",
        priceRegular: 10000,
        priceZero: 8000,
        durationDays: 30,
      });
      const onlinePlan = {
        id: (insertedOnline as { insertId: number }).insertId,
      };
      const member = await createMember({
        email: "xcat@test.com",
        firstName: "Otra",
        lastName: "Categoria",
      });

      const startActive = new Date();
      startActive.setDate(startActive.getDate() - 2);
      await assignSubscription(member.id, presencialPlan.id, {
        startDate: startActive.toISOString().split("T")[0],
      });
      // Future coverage is ONLINE — must not tap the expiring presencial sub.
      await insertSubscription({
        userId: member.id,
        planId: onlinePlan.id,
        status: "scheduled",
        startDate: isoFromNow(3),
        endDate: isoFromNow(33),
      });

      const res = await app.inject({
        method: "GET",
        url: `${REPORTS_URL}/expiring?daysWindow=7`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      const found = body.find(
        (r: { userId: number }) => r.userId === member.id,
      );
      expect(found).toBeDefined();
      expect(found.hasFutureCoverage).toBe(false);
    });

    it("counts a future sub as coverage even with a start gap (only end_date matters)", async () => {
      const plan = await createPlan({
        name: "Plan Gap",
        durationDays: 5,
        planCategory: "presencial",
      });
      const member = await createMember({
        email: "gap@test.com",
        firstName: "Con",
        lastName: "Hueco",
      });

      const startActive = new Date();
      startActive.setDate(startActive.getDate() - 2);
      await assignSubscription(member.id, plan.id, {
        startDate: startActive.toISOString().split("T")[0],
      });
      // Starts 3 days AFTER the active one ends (gap), but ends later → covers.
      await insertSubscription({
        userId: member.id,
        planId: plan.id,
        status: "scheduled",
        startDate: isoFromNow(6),
        endDate: isoFromNow(36),
      });

      const res = await app.inject({
        method: "GET",
        url: `${REPORTS_URL}/expiring?daysWindow=7`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      const found = body.find(
        (r: { userId: number }) => r.userId === member.id,
      );
      expect(found).toBeUndefined();
    });

    it("does NOT count a cancelled future subscription as coverage", async () => {
      const plan = await createPlan({
        name: "Plan Cancelled Coverage",
        durationDays: 5,
        planCategory: "presencial",
      });
      const member = await createMember({
        email: "cancelledcov@test.com",
        firstName: "Cancelo",
        lastName: "LaReno",
      });

      const startActive = new Date();
      startActive.setDate(startActive.getDate() - 2);
      await assignSubscription(member.id, plan.id, {
        startDate: startActive.toISOString().split("T")[0],
      });
      // Future sub exists but is cancelled → not real coverage.
      await insertSubscription({
        userId: member.id,
        planId: plan.id,
        status: "cancelled",
        startDate: isoFromNow(3),
        endDate: isoFromNow(33),
      });

      const res = await app.inject({
        method: "GET",
        url: `${REPORTS_URL}/expiring?daysWindow=7`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      const found = body.find(
        (r: { userId: number }) => r.userId === member.id,
      );
      expect(found).toBeDefined();
      expect(found.hasFutureCoverage).toBe(false);
    });

    // ─── Date range mode ───────────────────────────────────────────────────
    //
    // When dateFrom & dateTo are provided, the report lists subscriptions whose
    // end_date falls within [dateFrom, dateTo] — regardless of how far that is
    // from today, and without a separate "include expired" switch.

    it("filters expiring memberships by an explicit date range", async () => {
      const plan = await createPlan({
        name: "Plan Range",
        durationDays: 30,
        planCategory: "presencial",
      });

      const inRange = await createMember({
        email: "inrange@test.com",
        firstName: "Dentro",
        lastName: "Rango",
      });
      const tooFar = await createMember({
        email: "toofar@test.com",
        firstName: "Muy",
        lastName: "Lejos",
      });
      const tooSoon = await createMember({
        email: "toosoon@test.com",
        firstName: "Muy",
        lastName: "Pronto",
      });

      await insertSubscription({
        userId: inRange.id,
        planId: plan.id,
        status: "active",
        startDate: isoFromNow(-20),
        endDate: isoFromNow(10),
      });
      await insertSubscription({
        userId: tooFar.id,
        planId: plan.id,
        status: "active",
        startDate: isoFromNow(0),
        endDate: isoFromNow(40),
      });
      await insertSubscription({
        userId: tooSoon.id,
        planId: plan.id,
        status: "active",
        startDate: isoFromNow(-40),
        endDate: isoFromNow(2),
      });

      const res = await app.inject({
        method: "GET",
        url: `${REPORTS_URL}/expiring?dateFrom=${isoFromNow(5)}&dateTo=${isoFromNow(20)}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      const ids = body.map((r: { userId: number }) => r.userId);
      expect(ids).toContain(inRange.id);
      expect(ids).not.toContain(tooFar.id);
      expect(ids).not.toContain(tooSoon.id);
    });

    it("range mode surfaces already-expired subscriptions within the range", async () => {
      const plan = await createPlan({
        name: "Plan Range Past",
        durationDays: 30,
        planCategory: "presencial",
      });
      const member = await createMember({
        email: "pastrange@test.com",
        firstName: "Vencio",
        lastName: "EnRango",
      });

      // Expired 5 days ago.
      await insertSubscription({
        userId: member.id,
        planId: plan.id,
        status: "active",
        startDate: isoFromNow(-35),
        endDate: isoFromNow(-5),
      });

      const res = await app.inject({
        method: "GET",
        url: `${REPORTS_URL}/expiring?dateFrom=${isoFromNow(-30)}&dateTo=${isoFromNow(0)}`,
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

  describe("GET /charges/export", () => {
    beforeEach(async () => {
      await cleanAllTestData(app);
    });

    it("incluye la sede del cobro y la sede del alumno como columnas separadas", async () => {
      // Dos sedes físicas distintas: el alumno es de una y paga en la otra.
      const physicalBranches = await app.db
        .select({ id: branches.id, name: branches.name })
        .from(branches)
        .where(
          and(
            tenantWhere(branches, TEMPLO_CTX),
            eq(branches.isVirtual, false),
            eq(branches.isActive, true),
          ),
        );
      expect(physicalBranches.length).toBeGreaterThanOrEqual(2);
      const memberBranch = physicalBranches[0];
      const otherBranch = physicalBranches[1];

      const plan = await createPlan({ name: "Plan Export Sede" });
      const member = await createMember({
        email: "charge-export-sede@test.com",
        firstName: "Sede",
        lastName: "Export",
        branchId: memberBranch.id,
      });
      const sub = await assignSubscription(member.id, plan.id);
      const subId = sub.id as number;

      const today = new Date().toISOString().split("T")[0];
      await insertChargeTxn({
        memberId: member.id,
        subId,
        amount: 7777,
        paymentMethod: "cash",
        date: today,
        chargeBranchId: otherBranch.id,
      });
      await insertChargeTxn({
        memberId: member.id,
        subId,
        amount: 8888,
        paymentMethod: "transfer",
        date: today,
        chargeBranchId: null,
      });

      const res = await app.inject({
        method: "GET",
        url: `${REPORTS_URL}/charges/export`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const contentDisposition = res.headers["content-disposition"] as string;
      expect(contentDisposition).toContain("reportes-cobros-");

      const wb = new Workbook();
      await wb.xlsx.load(res.rawPayload);
      const sheet = wb.getWorksheet("Cobros");
      expect(sheet).toBeDefined();
      if (!sheet) return;

      const header = sheet.getRow(1);
      const headers: string[] = [];
      header.eachCell((cell) => headers.push(cell.text));
      expect(headers).toEqual([
        "Fecha",
        "Miembro",
        "Sede del cobro",
        "Sede del alumno",
        "Plan",
        "Monto",
        "Moneda",
        "Metodo",
        "Registro",
        "Estado",
      ]);
      const colSedeCobro = headers.indexOf("Sede del cobro") + 1;
      const colSedeAlumno = headers.indexOf("Sede del alumno") + 1;
      const colMonto = headers.indexOf("Monto") + 1;

      const rowByAmount = (amount: number) => {
        for (let i = 2; i <= sheet.rowCount; i++) {
          const row = sheet.getRow(i);
          if (Number(row.getCell(colMonto).value) === amount) return row;
        }
        return undefined;
      };

      // Cobró en otra sede: cada columna muestra la suya.
      const enOtraSede = rowByAmount(7777);
      expect(enOtraSede).toBeDefined();
      expect(enOtraSede?.getCell(colSedeCobro).text).toBe(otherBranch.name);
      expect(enOtraSede?.getCell(colSedeAlumno).text).toBe(memberBranch.name);

      // Cobro sin sede registrada: la columna queda vacía, sin inventar una.
      const sinSede = rowByAmount(8888);
      expect(sinSede).toBeDefined();
      expect(sinSede?.getCell(colSedeCobro).text).toBe("");
      expect(sinSede?.getCell(colSedeAlumno).text).toBe(memberBranch.name);
    });

    it("el JSON de /charges trae las dos sedes", async () => {
      const plan = await createPlan({ name: "Plan JSON Sede" });
      const member = await createMember({
        email: "charge-json-sede@test.com",
        firstName: "Sede",
        lastName: "Json",
      });
      const sub = await assignSubscription(member.id, plan.id);
      const today = new Date().toISOString().split("T")[0];
      await insertChargeTxn({
        memberId: member.id,
        subId: sub.id as number,
        amount: 6666,
        paymentMethod: "cash",
        date: today,
      });

      const res = await app.inject({
        method: "GET",
        url: `${REPORTS_URL}/charges`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      const row = body.rows.find((r: { amount: number }) => r.amount === 6666);
      expect(row).toBeDefined();
      const [branch] = await app.db
        .select({ name: branches.name })
        .from(branches)
        .where(eq(branches.id, testBranchId));
      expect(row.chargeBranchName).toBe(branch.name);
      expect(row.memberBranchName).toBe(branch.name);
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
