/**
 * Phase 109 Plan 01 — integration tests for FinanceSummary.revenueByKind.
 *
 * Coverage:
 *   - 3 inflow kinds correctly bucketed (plan_charge / debt_settlement /
 *     advance_payment)
 *   - adjustment inflow vs outflow: only inflow rows count
 *   - W4 — Refund excluded (negative assertion): refund is outflow-only
 *     per balance-service.ts:76-77 convention; aggregation is inflow-only;
 *     therefore revenueByKind.refund === 0 by design even when refund
 *     rows exist in the DB.
 *   - Voided transactions excluded
 *   - Filter by branchId restricts buckets to that branch
 *   - Filter by dateFrom/dateTo restricts buckets to that range
 *   - Empty period returns all-zeros for the 5 keys
 *   - Backward compat: response retains monthlyRevenue, revenueByMethod,
 *     revenueByBranch with same shape as before
 *
 * Runs against the per-worker test MySQL database (eltemplo_test_<POOL_ID>).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  createTestApp,
  cleanAllTestData,
  createStaffUser,
  getAuthToken,
  registerUser,
} from "../helpers";
import * as schema from "../../src/db/schema";
import { TransactionService } from "../../src/modules/finance/transaction-service";
import { BalanceService } from "../../src/modules/finance/balance-service";
import { CashRegisterService } from "../../src/modules/finance/cash-register-service";
import { TENANT_TEMPLO } from "../fixtures/second-tenant";
import { tenantValues, tenantWhere } from "../../src/modules/shared/tenant";

/**
 * Fase 172 (ADO-01 / T-172-08-04): gimnasio de los call sites DIRECTOS al
 * service. Sale del fixture, nunca de un `1` a mano. Una sola constante y no
 * el objeto literal repetido en cada llamada: el dia que un caso ejercite
 * dos gimnasios, el segundo se agrega al lado y se ve la diferencia.
 *
 * 172-14: la MISMA constante scopea ahora las queries DIRECTAS. Importa doble
 * aca: `countBalances` es un COUNT(*) sin `where`, o sea el peor caso del
 * sentinel (scan completo) y ademas una asercion que una fila de otro gimnasio
 * podia satisfacer.
 */
const TEMPLO_CTX = { tenantId: TENANT_TEMPLO };

async function countBalances(app: FastifyInstance): Promise<number> {
  const [row] = await app.db
    .select({ c: sql<number>`COUNT(*)` })
    .from(schema.balances)
    .where(tenantWhere(schema.balances, TEMPLO_CTX));
  return Number(row?.c ?? 0);
}

const FINANCE_URL = "/api/admin/finance";
const TODAY = "2026-04-28";
const YESTERDAY = "2026-04-27";
const LAST_WEEK = "2026-04-21";
const NEXT_WEEK = "2026-05-05";

function nextSuffix(prefix: string): string {
  const t = Date.now().toString(36).slice(-5);
  const r = Math.floor(Math.random() * 1000)
    .toString(36)
    .padStart(2, "0");
  return `${prefix}${t}${r}`;
}

interface SeededContext {
  arBranchId: number;
  arBranchBId: number; // second AR branch for branchId filter test
  esBranchId: number;
  ownerToken: string;
  ownerId: number;
  adminArId: number;
  adminArToken: string;
  coachId: number;
  coachToken: string;
  memberArId: number;
  memberEsId: number;
  planId: number;
  subArId: number;
  subEsId: number;
}

async function seedFixtures(app: FastifyInstance): Promise<SeededContext> {
  const [ar] = await app.db
    .insert(schema.branches)
    .values({
      name: "AR-MDP-K1",
      code: nextSuffix("RK"),
      country: "AR",
      isVirtual: false,
      isActive: true,
    })
    .$returningId();

  const [arB] = await app.db
    .insert(schema.branches)
    .values({
      name: "AR-CABA-K2",
      code: nextSuffix("RK"),
      country: "AR",
      isVirtual: false,
      isActive: true,
    })
    .$returningId();

  const [es] = await app.db
    .insert(schema.branches)
    .values({
      name: "ES-BCN-K3",
      code: nextSuffix("RK"),
      country: "ES",
      isVirtual: false,
      isActive: true,
    })
    .$returningId();

  return {
    arBranchId: ar.id,
    arBranchBId: arB.id,
    esBranchId: es.id,
    ownerToken: "",
    ownerId: 0,
    adminArId: 0,
    adminArToken: "",
    coachId: 0,
    coachToken: "",
    memberArId: 0,
    memberEsId: 0,
    planId: 0,
    subArId: 0,
    subEsId: 0,
  };
}

async function seedUsersAndPlan(
  app: FastifyInstance,
  ctx: SeededContext,
): Promise<void> {
  ctx.ownerToken = await getAuthToken(app, "admin@test.com", "adminpass123");
  const [ownerRow] = await app.db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, "admin@test.com"))
    .limit(1);
  ctx.ownerId = ownerRow.id;

  ctx.adminArId = await createStaffUser(app, {
    email: "admin-ar-rbk@test.local",
    password: "pass123456",
    firstName: "Admin",
    lastName: "AR",
    role: "admin",
    branchId: ctx.arBranchId,
  });
  ctx.adminArToken = await getAuthToken(
    app,
    "admin-ar-rbk@test.local",
    "pass123456",
  );

  ctx.coachId = await createStaffUser(app, {
    email: "coach-ar-rbk@test.local",
    password: "pass123456",
    firstName: "Coach",
    lastName: "AR",
    role: "coach",
    branchId: ctx.arBranchId,
  });
  ctx.coachToken = await getAuthToken(
    app,
    "coach-ar-rbk@test.local",
    "pass123456",
  );

  const memberAr = await registerUser(app, {
    email: `member-ar-rbk-${Date.now()}@test.local`,
    password: "pass123456",
    firstName: "Member",
    lastName: "AR",
    branchId: ctx.arBranchId,
  });
  ctx.memberArId = (memberAr.user as { id: number }).id;

  const memberEs = await registerUser(app, {
    email: `member-es-rbk-${Date.now()}@test.local`,
    password: "pass123456",
    firstName: "Member",
    lastName: "ES",
    branchId: ctx.esBranchId,
  });
  ctx.memberEsId = (memberEs.user as { id: number }).id;

  const [plan] = await app.db
    .insert(schema.subscriptionPlans)
    .values({
      name: "Phase 109 RBK Test Plan",
      planTier: "flex",
      bookingMode: "flexible",
      planCategory: "presencial",
      priceRegular: 100000,
      priceZero: 0,
      durationDays: 30,
      classesPerWeek: 3,
      currency: "ARS",
    })
    .$returningId();
  ctx.planId = plan.id;

  const [subAr] = await app.db
    .insert(schema.subscriptions)
    .values({
      userId: ctx.memberArId,
      planId: ctx.planId,
      branchId: ctx.arBranchId,
      status: "active",
      startDate: TODAY,
      pricePaid: 100000,
      currency: "ARS",
      priceTypeApplied: "regular",
    })
    .$returningId();
  ctx.subArId = subAr.id;

  const [subEs] = await app.db
    .insert(schema.subscriptions)
    .values({
      userId: ctx.memberEsId,
      planId: ctx.planId,
      branchId: ctx.esBranchId,
      status: "active",
      startDate: TODAY,
      pricePaid: 100000,
      currency: "ARS",
      priceTypeApplied: "regular",
    })
    .$returningId();
  ctx.subEsId = subEs.id;
}

interface InsertTxnArgs {
  // Phase 139 (D-06): null for egresos/movimientos (sin sucursal/socio).
  branchId: number | null;
  memberId: number | null;
  recordedBy: number;
  kind:
    | "plan_charge"
    | "debt_settlement"
    | "refund"
    | "adjustment"
    | "advance_payment"
    | "cash_transfer"
    | "expense";
  direction: "inflow" | "outflow";
  amount: number;
  transactionDate?: string;
  effectiveDate?: string;
  paymentMethod?: "cash" | "transfer" | "card" | "aura_credit" | "internal";
  voidedAt?: Date;
}

async function insertTxn(
  app: FastifyInstance,
  args: InsertTxnArgs,
): Promise<number> {
  const [inserted] = await app.db.insert(schema.financialTransactions).values(
    tenantValues(TEMPLO_CTX, {
      memberId: args.memberId,
      kind: args.kind,
      direction: args.direction,
      amount: args.amount,
      currency: "ARS",
      paymentMethod: args.paymentMethod ?? ("cash" as const),
      transactionDate: args.transactionDate ?? TODAY,
      effectiveDate: args.effectiveDate ?? TODAY,
      branchId: args.branchId,
      recordedBy: args.recordedBy,
      voidedAt: args.voidedAt ?? null,
    }),
  );
  return (inserted as { insertId: number }).insertId;
}

describe("Finance API — GET /transactions/summary revenueByKind (Phase 109)", () => {
  let app: FastifyInstance;
  const ctx = {} as SeededContext;

  beforeAll(async () => {
    app = await createTestApp();
    const seeded = await seedFixtures(app);
    Object.assign(ctx, seeded);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    // financial_transactions / transaction_links / balances are not in
    // TABLES_TO_CLEAN; clear them explicitly so prior describe blocks
    // don't leak rows into the aggregations under test.
    const conn = await app.dbPool.getConnection();
    try {
      await conn.query("SET FOREIGN_KEY_CHECKS=0");
      // 172-14: los 3 DELETE sobre tablas strict se ACOTAN al gimnasio. Este
      // beforeEach corre sobre una conexion CRUDA del pool —que es una de las
      // tres puertas que el sentinel intercepta—, asi que sin filtro hace throw.
      await conn.query("DELETE FROM `transaction_links` WHERE tenant_id = ?", [
        TENANT_TEMPLO,
      ]);
      await conn.query(
        "DELETE FROM `financial_transactions` WHERE tenant_id = ?",
        [TENANT_TEMPLO],
      );
      await conn.query("DELETE FROM `balances` WHERE tenant_id = ?", [
        TENANT_TEMPLO,
      ]);
      await conn.query("SET FOREIGN_KEY_CHECKS=1");
    } finally {
      conn.release();
    }
    await seedUsersAndPlan(app, ctx);
  });

  // ─── Bucketing — 3 inflow kinds ──────────────────────────────────────────

  it("RBK1: 3 inflow kinds (plan_charge/debt_settlement/advance_payment) bucketed correctly", async () => {
    await insertTxn(app, {
      branchId: ctx.arBranchId,
      memberId: ctx.memberArId,
      recordedBy: ctx.ownerId,
      kind: "plan_charge",
      direction: "inflow",
      amount: 10000,
    });
    await insertTxn(app, {
      branchId: ctx.arBranchId,
      memberId: ctx.memberArId,
      recordedBy: ctx.ownerId,
      kind: "debt_settlement",
      direction: "inflow",
      amount: 20000,
    });
    await insertTxn(app, {
      branchId: ctx.arBranchId,
      memberId: ctx.memberArId,
      recordedBy: ctx.ownerId,
      kind: "advance_payment",
      direction: "inflow",
      amount: 50000,
    });

    const res = await app.inject({
      method: "GET",
      url: `${FINANCE_URL}/transactions/summary`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.revenueByKind).toEqual({
      plan_charge: 10000,
      debt_settlement: 20000,
      refund: 0,
      adjustment: 0,
      advance_payment: 50000,
      // Phase 139: present + always 0 (excluded by getSummary conds).
      cash_transfer: 0,
      expense: 0,
    });
    // monthlyRevenue equals the sum across all inflow kinds.
    expect(body.monthlyRevenue).toBe(80000);
  });

  // ─── adjustment: inflow counted, outflow ignored ────────────────────────

  it("RBK2: adjustment inflow counts, adjustment outflow does NOT", async () => {
    await insertTxn(app, {
      branchId: ctx.arBranchId,
      memberId: ctx.memberArId,
      recordedBy: ctx.ownerId,
      kind: "adjustment",
      direction: "inflow",
      amount: 15000,
    });
    await insertTxn(app, {
      branchId: ctx.arBranchId,
      memberId: ctx.memberArId,
      recordedBy: ctx.ownerId,
      kind: "adjustment",
      direction: "outflow",
      amount: 7000,
    });

    const res = await app.inject({
      method: "GET",
      url: `${FINANCE_URL}/transactions/summary`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().revenueByKind.adjustment).toBe(15000);
  });

  // ─── W4: refund excluded (negative assertion) ────────────────────────────

  it("RBK3 (W4): refund row exists in DB but revenueByKind.refund === 0 by design", async () => {
    // refund is outflow-only by convention (balance-service.ts:76-77 —
    // "outflow INCREASES it (refund/new charge)"). The model never emits
    // (kind='refund' + direction='inflow'). This aggregation is inflow-
    // only; therefore refund = 0 in the summary, by design.
    await insertTxn(app, {
      branchId: ctx.arBranchId,
      memberId: ctx.memberArId,
      recordedBy: ctx.ownerId,
      kind: "refund",
      direction: "outflow",
      amount: 30000,
    });
    // Add a positive plan_charge so the response isn't all-zero by accident.
    await insertTxn(app, {
      branchId: ctx.arBranchId,
      memberId: ctx.memberArId,
      recordedBy: ctx.ownerId,
      kind: "plan_charge",
      direction: "inflow",
      amount: 12000,
    });

    const res = await app.inject({
      method: "GET",
      url: `${FINANCE_URL}/transactions/summary`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    // Negative assertion: refund row exists but bucket is 0.
    expect(body.revenueByKind.refund).toBe(0);
    // Sanity: the inflow plan_charge did register.
    expect(body.revenueByKind.plan_charge).toBe(12000);
    // monthlyRevenue is also inflow-only and excludes the outflow refund.
    expect(body.monthlyRevenue).toBe(12000);
  });

  // ─── Voided rows excluded ────────────────────────────────────────────────

  it("RBK4: voided transactions are NOT included in revenueByKind", async () => {
    await insertTxn(app, {
      branchId: ctx.arBranchId,
      memberId: ctx.memberArId,
      recordedBy: ctx.ownerId,
      kind: "plan_charge",
      direction: "inflow",
      amount: 8000,
    });
    await insertTxn(app, {
      branchId: ctx.arBranchId,
      memberId: ctx.memberArId,
      recordedBy: ctx.ownerId,
      kind: "plan_charge",
      direction: "inflow",
      amount: 99999,
      voidedAt: new Date(),
    });

    const res = await app.inject({
      method: "GET",
      url: `${FINANCE_URL}/transactions/summary`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().revenueByKind.plan_charge).toBe(8000);
  });

  // ─── Filter by branchId ──────────────────────────────────────────────────

  it("RBK5: branchId filter restricts revenueByKind to that branch only", async () => {
    await insertTxn(app, {
      branchId: ctx.arBranchId,
      memberId: ctx.memberArId,
      recordedBy: ctx.ownerId,
      kind: "plan_charge",
      direction: "inflow",
      amount: 11000,
    });
    await insertTxn(app, {
      branchId: ctx.arBranchBId,
      memberId: ctx.memberArId,
      recordedBy: ctx.ownerId,
      kind: "plan_charge",
      direction: "inflow",
      amount: 77000,
    });

    const res = await app.inject({
      method: "GET",
      url: `${FINANCE_URL}/transactions/summary?branchId=${ctx.arBranchId}`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().revenueByKind.plan_charge).toBe(11000);
  });

  // ─── Filter by dateRange ────────────────────────────────────────────────

  it("RBK6: dateFrom/dateTo filter restricts revenueByKind to that range", async () => {
    await insertTxn(app, {
      branchId: ctx.arBranchId,
      memberId: ctx.memberArId,
      recordedBy: ctx.ownerId,
      kind: "plan_charge",
      direction: "inflow",
      amount: 5000,
      transactionDate: LAST_WEEK,
    });
    await insertTxn(app, {
      branchId: ctx.arBranchId,
      memberId: ctx.memberArId,
      recordedBy: ctx.ownerId,
      kind: "plan_charge",
      direction: "inflow",
      amount: 6000,
      transactionDate: TODAY,
    });

    const res = await app.inject({
      method: "GET",
      url: `${FINANCE_URL}/transactions/summary?dateFrom=${YESTERDAY}&dateTo=${TODAY}`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
    // Only TODAY's row falls inside [YESTERDAY, TODAY]; LAST_WEEK is excluded.
    expect(res.json().revenueByKind.plan_charge).toBe(6000);
  });

  // ─── Empty period — all 5 keys = 0 ──────────────────────────────────────

  it("RBK7: empty period returns all 5 keys = 0", async () => {
    await insertTxn(app, {
      branchId: ctx.arBranchId,
      memberId: ctx.memberArId,
      recordedBy: ctx.ownerId,
      kind: "plan_charge",
      direction: "inflow",
      amount: 9000,
      transactionDate: TODAY,
    });

    const res = await app.inject({
      method: "GET",
      url: `${FINANCE_URL}/transactions/summary?dateFrom=${NEXT_WEEK}&dateTo=${NEXT_WEEK}`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().revenueByKind).toEqual({
      plan_charge: 0,
      debt_settlement: 0,
      refund: 0,
      adjustment: 0,
      advance_payment: 0,
      // Phase 139: cash_transfer/expense always 0 (excluded by getSummary conds).
      cash_transfer: 0,
      expense: 0,
    });
  });

  // ─── Backward-compat ────────────────────────────────────────────────────

  it("RBK8: response retains monthlyRevenue + revenueByMethod + revenueByBranch shape (backward-compat)", async () => {
    await insertTxn(app, {
      branchId: ctx.arBranchId,
      memberId: ctx.memberArId,
      recordedBy: ctx.ownerId,
      kind: "plan_charge",
      direction: "inflow",
      amount: 4000,
      paymentMethod: "transfer",
    });

    const res = await app.inject({
      method: "GET",
      url: `${FINANCE_URL}/transactions/summary`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    // Legacy fields still present and well-shaped.
    expect(body).toHaveProperty("monthlyRevenue", 4000);
    expect(body.revenueByMethod).toEqual({
      cash: 0,
      transfer: 4000,
      card: 0,
      aura_credit: 0,
      internal: 0,
    });
    expect(Array.isArray(body.revenueByBranch)).toBe(true);
    expect(body.revenueByBranch.length).toBeGreaterThanOrEqual(1);
    // New field present alongside.
    expect(body).toHaveProperty("revenueByKind");
    expect(Object.keys(body.revenueByKind).sort()).toEqual(
      [
        "adjustment",
        "advance_payment",
        "debt_settlement",
        "plan_charge",
        "refund",
        // Phase 139: the 2 new kinds are present (always 0).
        "cash_transfer",
        "expense",
      ].sort(),
    );
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Phase 139 — MUST-FIX A (getSummary) + MUST-FIX B (applyDelta) regressions
// ───────────────────────────────────────────────────────────────────────────

describe("Finance — Phase 139 movement/expense regressions", () => {
  let app: FastifyInstance;
  const ctx = {} as SeededContext;
  let txService: TransactionService;

  beforeAll(async () => {
    app = await createTestApp();
    const seeded = await seedFixtures(app);
    Object.assign(ctx, seeded);
    const balanceService = new BalanceService(app.db, app.log);
    const cashRegisterService = new CashRegisterService(app.db, app.log);
    txService = new TransactionService(
      app.db,
      app.log,
      balanceService,
      cashRegisterService,
    );
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    const conn = await app.dbPool.getConnection();
    try {
      await conn.query("SET FOREIGN_KEY_CHECKS=0");
      // 172-14: los 3 DELETE sobre tablas strict se ACOTAN al gimnasio. Este
      // beforeEach corre sobre una conexion CRUDA del pool —que es una de las
      // tres puertas que el sentinel intercepta—, asi que sin filtro hace throw.
      await conn.query("DELETE FROM `transaction_links` WHERE tenant_id = ?", [
        TENANT_TEMPLO,
      ]);
      await conn.query(
        "DELETE FROM `financial_transactions` WHERE tenant_id = ?",
        [TENANT_TEMPLO],
      );
      await conn.query("DELETE FROM `balances` WHERE tenant_id = ?", [
        TENANT_TEMPLO,
      ]);
      await conn.query("SET FOREIGN_KEY_CHECKS=1");
    } finally {
      conn.release();
    }
    await seedUsersAndPlan(app, ctx);
  });

  // MUST-FIX A + branch_id blast-radius regression: a NULL-branch cash_transfer
  // INFLOW leg must NOT move monthlyRevenue, must NOT add a revenueByBranch entry,
  // and must NOT add a 'cash_transfer' key to revenueByKind.
  it("MOV-A: NULL-branch cash_transfer inflow leaves monthlyRevenue + revenueByBranch + revenueByKind untouched", async () => {
    // Snapshot baseline: one real plan_charge so the summary isn't all-zero.
    await insertTxn(app, {
      branchId: ctx.arBranchId,
      memberId: ctx.memberArId,
      recordedBy: ctx.ownerId,
      kind: "plan_charge",
      direction: "inflow",
      amount: 25000,
    });

    const before = (
      await app.inject({
        method: "GET",
        url: `${FINANCE_URL}/transactions/summary`,
        headers: { authorization: `Bearer ${ctx.ownerToken}` },
      })
    ).json();

    // Insert a cash_transfer INFLOW leg with NULL branch + NULL member (the
    // destino leg of a movimiento to a branch-less central/banco caja).
    await insertTxn(app, {
      branchId: null,
      memberId: null,
      recordedBy: ctx.ownerId,
      kind: "cash_transfer",
      direction: "inflow",
      amount: 999999,
      paymentMethod: "internal",
    });

    const after = (
      await app.inject({
        method: "GET",
        url: `${FINANCE_URL}/transactions/summary`,
        headers: { authorization: `Bearer ${ctx.ownerToken}` },
      })
    ).json();

    // monthlyRevenue is unchanged — the caja-to-caja move is NOT revenue.
    expect(after.monthlyRevenue).toBe(before.monthlyRevenue);
    expect(after.monthlyRevenue).toBe(25000);
    // revenueByKind gains NO cash_transfer money (key present but 0).
    expect(after.revenueByKind.cash_transfer).toBe(0);
    expect(after.revenueByKind.plan_charge).toBe(25000);
    // revenueByBranch is byte-identical (no NULL-branch entry leaked in).
    expect(after.revenueByBranch).toEqual(before.revenueByBranch);
  });

  // MUST-FIX B (D-07): creating a cash_transfer + an expense via create() must
  // leave the `balances` table untouched (applyDelta no-op for link-less rows).
  it("MOV-B: cash_transfer + expense via create() do NOT move the balances table", async () => {
    const balancesBefore = await countBalances(app);

    // cash_transfer outflow leg at a real branch (memberId null, links []).
    await txService.create(
      TEMPLO_CTX,
      {
        memberId: null,
        kind: "cash_transfer",
        direction: "outflow",
        amount: 5000,
        currency: "ARS",
        paymentMethod: "internal",
        transactionDate: TODAY,
        effectiveDate: TODAY,
        branchId: ctx.arBranchId,
        cashRegisterId: null,
        links: [],
      },
      ctx.ownerId,
    );

    // expense, branch-less caja (branchId null), links [].
    await txService.create(
      TEMPLO_CTX,
      {
        memberId: null,
        kind: "expense",
        direction: "outflow",
        amount: 3000,
        currency: "ARS",
        paymentMethod: "internal",
        transactionDate: TODAY,
        effectiveDate: TODAY,
        branchId: null,
        cashRegisterId: null,
        links: [],
      },
      ctx.ownerId,
    );

    const balancesAfter = await countBalances(app);
    // applyDelta is a no-op for link-less rows — row count unchanged.
    expect(balancesAfter).toBe(balancesBefore);
  });
});
