/**
 * Phase 109 Plan 05 — cross-aggregation sanity invariants for the
 * /api/admin/finance/transactions/summary endpoint.
 *
 * This is the end-to-end sanity validation of phase 109 success
 * criterion #5:
 *
 *   "Sanity end-to-end: ingreso del mes en summary = suma manual de
 *   inflows no anulados del mes en `financial_transactions`."
 *
 * Three symmetric partition invariants must hold simultaneously over
 * the same data set:
 *
 *   I1. Σ revenueByMethod[*]            === monthlyRevenue
 *   I2. Σ revenueByKind[*]              === monthlyRevenue
 *       (refund excluded by design — refund is outflow-only per
 *       balance-service.ts:76-77; aggregation is inflow-only)
 *   I3. Σ revenueByBranch[*].revenue    === monthlyRevenue
 *       (W7 — symmetric branch invariant)
 *
 * Plus negative cases:
 *   N1. Voided transactions (voided_at IS NOT NULL) excluded from all
 *       four numeric outputs.
 *   N2. Out-of-range rows (transaction_date outside dateFrom..dateTo)
 *       excluded from all four outputs while invariants still hold on
 *       the filtered slice.
 *
 * Runs against the per-worker test MySQL database. Mirrors the seed
 * helpers from summary-by-kind.test.ts to keep fixture semantics
 * byte-identical (same branches, plan, members).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  createTestApp,
  cleanAllTestData,
  createStaffUser,
  getAuthToken,
  registerUser,
} from "../helpers";
import * as schema from "../../src/db/schema";

const FINANCE_URL = "/api/admin/finance";
const TODAY = "2026-04-28";
const YESTERDAY = "2026-04-27";
const LAST_WEEK = "2026-04-21";
const LAST_MONTH = "2026-03-15";

type Kind =
  | "plan_charge"
  | "debt_settlement"
  | "refund"
  | "adjustment"
  | "advance_payment";
type Method = "cash" | "transfer" | "card" | "aura_credit" | "internal";
type Direction = "inflow" | "outflow";

interface RevenueByMethod {
  cash: number;
  transfer: number;
  card: number;
  aura_credit: number;
  internal: number;
}

interface RevenueByKind {
  plan_charge: number;
  debt_settlement: number;
  refund: number;
  adjustment: number;
  advance_payment: number;
}

interface RevenueByBranchRow {
  branchId: number;
  branchName: string;
  revenue: number;
}

interface SummaryResponse {
  monthlyRevenue: number;
  revenueByMethod: RevenueByMethod;
  revenueByKind: RevenueByKind;
  revenueByBranch: RevenueByBranchRow[];
}

function nextSuffix(prefix: string): string {
  const t = Date.now().toString(36).slice(-5);
  const r = Math.floor(Math.random() * 1000)
    .toString(36)
    .padStart(2, "0");
  return `${prefix}${t}${r}`;
}

function sumValues(obj: Record<string, number>): number {
  return Object.values(obj).reduce((a, b) => a + b, 0);
}

function sumBranchRevenue(rows: RevenueByBranchRow[]): number {
  return rows.reduce((a, r) => a + r.revenue, 0);
}

interface SeededContext {
  arBranchAId: number;
  arBranchBId: number;
  esBranchId: number;
  ownerToken: string;
  ownerId: number;
  memberArId: number;
  memberEsId: number;
  planId: number;
}

async function seedFixtures(app: FastifyInstance): Promise<SeededContext> {
  const [arA] = await app.db
    .insert(schema.branches)
    .values({
      name: "AR-MDP-S1",
      code: nextSuffix("S"),
      country: "AR",
      isVirtual: false,
      isActive: true,
    })
    .$returningId();
  const [arB] = await app.db
    .insert(schema.branches)
    .values({
      name: "AR-CABA-S2",
      code: nextSuffix("S"),
      country: "AR",
      isVirtual: false,
      isActive: true,
    })
    .$returningId();
  const [es] = await app.db
    .insert(schema.branches)
    .values({
      name: "ES-BCN-S3",
      code: nextSuffix("S"),
      country: "ES",
      isVirtual: false,
      isActive: true,
    })
    .$returningId();

  return {
    arBranchAId: arA.id,
    arBranchBId: arB.id,
    esBranchId: es.id,
    ownerToken: "",
    ownerId: 0,
    memberArId: 0,
    memberEsId: 0,
    planId: 0,
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

  await createStaffUser(app, {
    email: "admin-sanity@test.local",
    password: "pass123456",
    firstName: "Admin",
    lastName: "Sanity",
    role: "admin",
    branchId: ctx.arBranchAId,
  });

  const memberAr = await registerUser(app, {
    email: `member-ar-sanity-${Date.now()}@test.local`,
    password: "pass123456",
    firstName: "Member",
    lastName: "AR",
    branchId: ctx.arBranchAId,
  });
  ctx.memberArId = (memberAr.user as { id: number }).id;

  const memberEs = await registerUser(app, {
    email: `member-es-sanity-${Date.now()}@test.local`,
    password: "pass123456",
    firstName: "Member",
    lastName: "ES",
    branchId: ctx.esBranchId,
  });
  ctx.memberEsId = (memberEs.user as { id: number }).id;

  const [plan] = await app.db
    .insert(schema.subscriptionPlans)
    .values({
      name: "Phase 109 Sanity Test Plan",
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
}

interface InsertTxnArgs {
  branchId: number;
  memberId: number;
  recordedBy: number;
  kind: Kind;
  direction: Direction;
  amount: number;
  paymentMethod?: Method;
  transactionDate?: string;
  voidedAt?: Date;
}

async function insertTxn(
  app: FastifyInstance,
  args: InsertTxnArgs,
): Promise<void> {
  await app.db.insert(schema.financialTransactions).values({
    memberId: args.memberId,
    kind: args.kind,
    direction: args.direction,
    amount: args.amount,
    currency: "ARS",
    paymentMethod: args.paymentMethod ?? "cash",
    transactionDate: args.transactionDate ?? TODAY,
    effectiveDate: args.transactionDate ?? TODAY,
    branchId: args.branchId,
    recordedBy: args.recordedBy,
    voidedAt: args.voidedAt ?? null,
  });
}

/**
 * Mixed-scenario seeder. Inserts ~12 rows across:
 *   - 4 inflow kinds (plan_charge, debt_settlement, advance_payment,
 *     adjustment-inflow). refund is outflow per the model so it is
 *     seeded as an outflow row only — it must NOT appear in any sum.
 *   - 4 payment methods (cash, transfer, card, internal). aura_credit
 *     omitted to keep the row count tractable and assert default 0.
 *   - 2 branches (arA, arB) — both AR so the ARS currency stays uniform.
 *   - 1 voided row (must be excluded from all sums).
 *   - 1 outflow refund row (must be excluded from all sums).
 *
 * Returns the expected monthlyRevenue (sum of all NON-voided NON-outflow
 * rows). Caller asserts all 3 partition sums equal this number.
 */
async function seedMixedScenario(
  app: FastifyInstance,
  ctx: SeededContext,
): Promise<{ expectedMonthlyRevenue: number }> {
  // Branch A — 4 inflow rows across 4 kinds + 4 methods. Sum = 60_000.
  await insertTxn(app, {
    branchId: ctx.arBranchAId,
    memberId: ctx.memberArId,
    recordedBy: ctx.ownerId,
    kind: "plan_charge",
    direction: "inflow",
    amount: 10000,
    paymentMethod: "cash",
  });
  await insertTxn(app, {
    branchId: ctx.arBranchAId,
    memberId: ctx.memberArId,
    recordedBy: ctx.ownerId,
    kind: "debt_settlement",
    direction: "inflow",
    amount: 15000,
    paymentMethod: "transfer",
  });
  await insertTxn(app, {
    branchId: ctx.arBranchAId,
    memberId: ctx.memberArId,
    recordedBy: ctx.ownerId,
    kind: "advance_payment",
    direction: "inflow",
    amount: 20000,
    paymentMethod: "card",
  });
  await insertTxn(app, {
    branchId: ctx.arBranchAId,
    memberId: ctx.memberArId,
    recordedBy: ctx.ownerId,
    kind: "adjustment",
    direction: "inflow",
    amount: 15000,
    paymentMethod: "internal",
  });

  // Branch B — 3 inflow rows. Sum = 28_000.
  await insertTxn(app, {
    branchId: ctx.arBranchBId,
    memberId: ctx.memberArId,
    recordedBy: ctx.ownerId,
    kind: "plan_charge",
    direction: "inflow",
    amount: 8000,
    paymentMethod: "cash",
  });
  await insertTxn(app, {
    branchId: ctx.arBranchBId,
    memberId: ctx.memberArId,
    recordedBy: ctx.ownerId,
    kind: "plan_charge",
    direction: "inflow",
    amount: 12000,
    paymentMethod: "transfer",
  });
  await insertTxn(app, {
    branchId: ctx.arBranchBId,
    memberId: ctx.memberArId,
    recordedBy: ctx.ownerId,
    kind: "debt_settlement",
    direction: "inflow",
    amount: 8000,
    paymentMethod: "card",
  });

  // Voided row — must be excluded.
  await insertTxn(app, {
    branchId: ctx.arBranchAId,
    memberId: ctx.memberArId,
    recordedBy: ctx.ownerId,
    kind: "plan_charge",
    direction: "inflow",
    amount: 999_999,
    paymentMethod: "cash",
    voidedAt: new Date(),
  });

  // Outflow refund — must be excluded (inflow-only aggregation).
  await insertTxn(app, {
    branchId: ctx.arBranchAId,
    memberId: ctx.memberArId,
    recordedBy: ctx.ownerId,
    kind: "refund",
    direction: "outflow",
    amount: 50000,
    paymentMethod: "cash",
  });

  // Outflow adjustment — also must be excluded.
  await insertTxn(app, {
    branchId: ctx.arBranchAId,
    memberId: ctx.memberArId,
    recordedBy: ctx.ownerId,
    kind: "adjustment",
    direction: "outflow",
    amount: 7000,
    paymentMethod: "internal",
  });

  // Expected: 10k + 15k + 20k + 15k + 8k + 12k + 8k = 88_000.
  return { expectedMonthlyRevenue: 88000 };
}

describe("Finance API — summary cross-aggregation sanity invariants (Phase 109 Plan 05)", () => {
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
    // TABLES_TO_CLEAN; clear them explicitly so prior test seed rows
    // don't leak into the partition aggregations under test.
    const conn = await app.dbPool.getConnection();
    try {
      await conn.query("SET FOREIGN_KEY_CHECKS=0");
      await conn.query("DELETE FROM `transaction_links`");
      await conn.query("DELETE FROM `financial_transactions`");
      await conn.query("DELETE FROM `balances`");
      await conn.query("SET FOREIGN_KEY_CHECKS=1");
    } finally {
      conn.release();
    }
    await seedUsersAndPlan(app, ctx);
  });

  // ─── I1: Σ revenueByMethod === monthlyRevenue ──────────────────────────

  it("SAN1 (I1): Σ revenueByMethod[*] === monthlyRevenue on mixed scenario", async () => {
    const { expectedMonthlyRevenue } = await seedMixedScenario(app, ctx);

    const res = await app.inject({
      method: "GET",
      url: `${FINANCE_URL}/transactions/summary?country=AR`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as SummaryResponse;

    expect(body.monthlyRevenue).toBe(expectedMonthlyRevenue);
    const sumByMethod = sumValues(body.revenueByMethod);
    expect(sumByMethod).toBe(body.monthlyRevenue);
    // Sanity on the actual breakdown: 18k cash, 27k transfer, 28k card,
    // 15k internal, 0 aura_credit.
    expect(body.revenueByMethod).toEqual({
      cash: 18000,
      transfer: 27000,
      card: 28000,
      aura_credit: 0,
      internal: 15000,
    });
  });

  // ─── I2: Σ revenueByKind === monthlyRevenue ────────────────────────────

  it("SAN2 (I2): Σ revenueByKind[*] === monthlyRevenue (refund=0 by design)", async () => {
    const { expectedMonthlyRevenue } = await seedMixedScenario(app, ctx);

    const res = await app.inject({
      method: "GET",
      url: `${FINANCE_URL}/transactions/summary?country=AR`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as SummaryResponse;

    expect(body.monthlyRevenue).toBe(expectedMonthlyRevenue);
    const sumByKind = sumValues(body.revenueByKind);
    expect(sumByKind).toBe(body.monthlyRevenue);
    // refund is outflow-only by model convention; aggregation is
    // inflow-only; therefore refund bucket = 0 even though a refund
    // row exists in the seed.
    expect(body.revenueByKind.refund).toBe(0);
    // Sanity on the actual breakdown: 30k plan_charge (10+8+12),
    // 23k debt_settlement (15+8), 20k advance_payment, 15k adjustment.
    expect(body.revenueByKind).toEqual({
      plan_charge: 30000,
      debt_settlement: 23000,
      refund: 0,
      adjustment: 15000,
      advance_payment: 20000,
    });
  });

  // ─── I3: Σ revenueByBranch.revenue === monthlyRevenue (W7) ─────────────

  it("SAN3 (I3 / W7): Σ revenueByBranch[*].revenue === monthlyRevenue (symmetric)", async () => {
    const { expectedMonthlyRevenue } = await seedMixedScenario(app, ctx);

    const res = await app.inject({
      method: "GET",
      url: `${FINANCE_URL}/transactions/summary?country=AR`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as SummaryResponse;

    expect(body.monthlyRevenue).toBe(expectedMonthlyRevenue);
    const sumByBranch = sumBranchRevenue(body.revenueByBranch);
    expect(sumByBranch).toBe(body.monthlyRevenue);
    // Sanity on the breakdown: branch A = 60k, branch B = 28k.
    const byId = new Map(
      body.revenueByBranch.map((r) => [r.branchId, r.revenue]),
    );
    expect(byId.get(ctx.arBranchAId)).toBe(60000);
    expect(byId.get(ctx.arBranchBId)).toBe(28000);
  });

  // ─── N1: Voided rows excluded across all 4 outputs ─────────────────────

  it("SAN4 (N1): voided rows are NOT counted in any aggregation", async () => {
    // Seed only voided rows (+ one valid row to make the response
    // non-trivially zero).
    await insertTxn(app, {
      branchId: ctx.arBranchAId,
      memberId: ctx.memberArId,
      recordedBy: ctx.ownerId,
      kind: "plan_charge",
      direction: "inflow",
      amount: 5000,
      paymentMethod: "cash",
    });
    await insertTxn(app, {
      branchId: ctx.arBranchAId,
      memberId: ctx.memberArId,
      recordedBy: ctx.ownerId,
      kind: "plan_charge",
      direction: "inflow",
      amount: 1_000_000,
      paymentMethod: "transfer",
      voidedAt: new Date(),
    });
    await insertTxn(app, {
      branchId: ctx.arBranchBId,
      memberId: ctx.memberArId,
      recordedBy: ctx.ownerId,
      kind: "debt_settlement",
      direction: "inflow",
      amount: 999_999,
      paymentMethod: "card",
      voidedAt: new Date(),
    });

    const res = await app.inject({
      method: "GET",
      url: `${FINANCE_URL}/transactions/summary?country=AR`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as SummaryResponse;

    expect(body.monthlyRevenue).toBe(5000);
    expect(sumValues(body.revenueByMethod)).toBe(5000);
    expect(sumValues(body.revenueByKind)).toBe(5000);
    expect(sumBranchRevenue(body.revenueByBranch)).toBe(5000);

    // Voided amounts must not leak into any specific bucket either.
    expect(body.revenueByMethod.transfer).toBe(0);
    expect(body.revenueByMethod.card).toBe(0);
    expect(body.revenueByKind.debt_settlement).toBe(0);
    const branchBRow = body.revenueByBranch.find(
      (r) => r.branchId === ctx.arBranchBId,
    );
    // Branch B had only voided rows, so it should not appear in the list
    // (or appear with revenue=0). Either is acceptable — just no leakage.
    if (branchBRow) {
      expect(branchBRow.revenue).toBe(0);
    }
  });

  // ─── N2: dateFrom/dateTo applies consistently; invariants still hold ───

  it("SAN5 (N2): dateFrom/dateTo filter applies symmetrically and invariants hold on the filtered slice", async () => {
    // In-range (TODAY): two rows summing 30_000.
    await insertTxn(app, {
      branchId: ctx.arBranchAId,
      memberId: ctx.memberArId,
      recordedBy: ctx.ownerId,
      kind: "plan_charge",
      direction: "inflow",
      amount: 10000,
      paymentMethod: "cash",
      transactionDate: TODAY,
    });
    await insertTxn(app, {
      branchId: ctx.arBranchBId,
      memberId: ctx.memberArId,
      recordedBy: ctx.ownerId,
      kind: "debt_settlement",
      direction: "inflow",
      amount: 20000,
      paymentMethod: "transfer",
      transactionDate: TODAY,
    });
    // Out-of-range (LAST_WEEK and LAST_MONTH): big amounts that must
    // be excluded.
    await insertTxn(app, {
      branchId: ctx.arBranchAId,
      memberId: ctx.memberArId,
      recordedBy: ctx.ownerId,
      kind: "plan_charge",
      direction: "inflow",
      amount: 500_000,
      paymentMethod: "card",
      transactionDate: LAST_WEEK,
    });
    await insertTxn(app, {
      branchId: ctx.arBranchAId,
      memberId: ctx.memberArId,
      recordedBy: ctx.ownerId,
      kind: "advance_payment",
      direction: "inflow",
      amount: 333_333,
      paymentMethod: "internal",
      transactionDate: LAST_MONTH,
    });

    const res = await app.inject({
      method: "GET",
      url: `${FINANCE_URL}/transactions/summary?country=AR&dateFrom=${YESTERDAY}&dateTo=${TODAY}`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as SummaryResponse;

    // Only the 2 TODAY rows fall inside [YESTERDAY..TODAY].
    expect(body.monthlyRevenue).toBe(30000);
    // All three partition sums still equal monthlyRevenue on the filtered slice.
    expect(sumValues(body.revenueByMethod)).toBe(30000);
    expect(sumValues(body.revenueByKind)).toBe(30000);
    expect(sumBranchRevenue(body.revenueByBranch)).toBe(30000);
    // Out-of-range methods must be 0.
    expect(body.revenueByMethod.card).toBe(0);
    expect(body.revenueByMethod.internal).toBe(0);
    // Out-of-range kinds must be 0.
    expect(body.revenueByKind.advance_payment).toBe(0);
  });
});
