/**
 * Phase 137 — firm-money regression tests (VAL-05 / VAL-07 — PHASE GATE).
 *
 * Fills the Wave 0 scaffold (plan 01) with real integration cases against the
 * per-worker test MySQL DB (eltemplo_test_<POOL_ID>).
 *
 * Proves the canonical "firm money" predicate now counts ONLY validated rows,
 * while the DEFAULT 'validado' backfill leaves historical (validado) numbers
 * identical. A PENDIENTE settles the member's debt (balances) but does NOT
 * move firm cash. The 6 v5.0 management metrics keep identical numbers because
 * every site routes through the same firm-money helper (refactored in tasks 1+2)
 * — the real cross-suite invariant is enforced by the EXISTING test/analytics/*
 * and test/reports/* suites running UNCHANGED (verified via `git diff` in CI;
 * see plan verify). Here we exercise two representative metric paths directly:
 *   - finance firm-cash: TransactionService.getSummary (call site #1)
 *   - analytics caja:    AdvancedFinanceService.getAdvancedFinance cashTrend (#10)
 *
 *   R1: a PENDIENTE does NOT move summary monthlyRevenue / firm saldo.
 *   R2: validating that payment DOES add it to firm money.
 *   R3: validado fixtures give identical numbers across finance + analytics
 *       firm-money paths; a PENDIENTE never pollutes them (backfill identity).
 *   R4: a PENDIENTE DOES settle the member's balances (deuda → 0) even though
 *       it is not yet firm cash (D-09: activar ≠ validar).
 *
 * State is forced server-side via the role→status derivation: an admin-created
 * charge is born 'validado'; a coach-derived charge is born 'pendiente'. The
 * create REST endpoint is gated to FINANCE_WRITE_ROLES (coach excluded in 137),
 * so the coach→pendiente DERIVATION is exercised at the service level by passing
 * the server-derived validationStatus (exactly what routes.ts computes).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { sql, eq, and } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { createTestApp, createStaffUser, registerUser } from "../helpers";
import { TransactionService } from "../../src/modules/finance/transaction-service";
import { BalanceService } from "../../src/modules/finance/balance-service";
import { CashRegisterService } from "../../src/modules/finance/cash-register-service";
import { AdvancedFinanceService } from "../../src/modules/analytics/advanced-finance-service";
import type { TenantContext } from "../../src/modules/shared/tenant";
import * as schema from "../../src/db/schema";
import { TENANT_TEMPLO } from "../fixtures/second-tenant";
import { tenantValues, tenantWhere } from "../../src/modules/shared/tenant";

/**
 * Fase 172 (ADO-01 / T-172-08-04): gimnasio de los call sites DIRECTOS al
 * service. Sale del fixture, nunca de un `1` a mano. Una sola constante y no
 * el objeto literal repetido en cada llamada: el dia que un caso ejercite
 * dos gimnasios, el segundo se agrega al lado y se ve la diferencia.
 */
const TEMPLO_CTX = { tenantId: TENANT_TEMPLO };

const TODAY = "2026-04-28";
const MONTH_FROM = "2026-04-01";
const MONTH_TO = "2026-04-30";

/**
 * El gimnasio de los fixtures (El Templo = tenant 1). Fase 172: la caja de
 * analytics recibe el `TenantContext` como PRIMER argumento; en producción sale
 * de `assertTenant(request.scope, …)`, acá se construye a mano porque el
 * service se invoca sin request.
 */
const CTX: TenantContext = { tenantId: 1 };

let app: FastifyInstance;
let txService: TransactionService;
let balanceService: BalanceService;
let advFinance: AdvancedFinanceService;
let adminId: number;
let branchId: number;
let memberId: number;
let planId: number;
let subscriptionId: number;

async function seedSubscription(): Promise<number> {
  const [res] = await app.db
    .insert(schema.subscriptions)
    .values({
      userId: memberId,
      planId,
      branchId,
      status: "active",
      startDate: TODAY,
      pricePaid: 100000,
      currency: "ARS",
      priceTypeApplied: "regular",
    })
    .$returningId();
  return res.id;
}

/**
 * A validated (admin) inflow charge for `amount`. Role derivation: admin → no
 * validationStatus override → born 'validado'.
 */
function adminCharge(amount: number) {
  return {
    memberId,
    kind: "plan_charge" as const,
    direction: "inflow" as const,
    amount,
    currency: "ARS" as const,
    paymentMethod: "cash" as const,
    transactionDate: TODAY,
    effectiveDate: TODAY,
    branchId,
    notes: null,
    links: [
      {
        targetKind: "subscription" as const,
        targetId: subscriptionId,
        allocatedAmount: amount,
      },
    ],
  };
}

/**
 * A coach-derived (pendiente) inflow charge for `amount`. Mirrors what routes.ts
 * computes server-side for a coach recorder (`['coach'].includes(role)` → 'pendiente').
 */
function coachCharge(amount: number) {
  return { ...adminCharge(amount), validationStatus: "pendiente" as const };
}

async function firmSaldo(): Promise<number> {
  const summary = await txService.getSummary(TEMPLO_CTX, {
    branchId,
    dateFrom: MONTH_FROM,
    dateTo: MONTH_TO,
  });
  return summary.monthlyRevenue;
}

/** ARS firm cash for the seeded branch/month via the analytics caja path (#10). */
async function cashTrendArs(): Promise<number> {
  const adv = await advFinance.getAdvancedFinance(CTX, {
    branchId,
    dateFrom: MONTH_FROM,
    dateTo: MONTH_TO,
  });
  return adv.cashTrend.reduce((sum, m) => sum + m.ARS, 0);
}

async function readSubBalance(): Promise<number | null> {
  const [row] = await app.db
    .select({ amount: schema.balances.amount })
    .from(schema.balances)
    .where(
      and(
        eq(schema.balances.memberId, memberId),
        eq(schema.balances.targetKind, "subscription"),
        eq(schema.balances.targetId, subscriptionId),
        tenantWhere(schema.balances, TEMPLO_CTX),
      ),
    )
    .limit(1);
  return row ? row.amount : null;
}

beforeAll(async () => {
  app = await createTestApp();
  balanceService = new BalanceService(app.db, app.log);
  txService = new TransactionService(
    app.db,
    app.log,
    balanceService,
    new CashRegisterService(app.db, app.log),
  );
  advFinance = new AdvancedFinanceService(app.db, app.log);

  const [admin] = await app.db
    .select({ id: schema.users.id, branchId: schema.users.branchId })
    .from(schema.users)
    .where(eq(schema.users.email, "admin@test.com"))
    .limit(1);
  adminId = admin.id;
  branchId = admin.branchId ?? 1;

  // A coach user exists in the fixture set (parity with validation-state); the
  // derivation itself is asserted via coachCharge() at the service level.
  await createStaffUser(app, {
    email: "coach-reg@test.local",
    password: "pass123456",
    firstName: "Coach",
    lastName: "Reg",
    role: "coach",
    branchId,
  });

  const member = await registerUser(app, {
    email: `reg-member-${Date.now()}@test.local`,
    password: "TestPass123!",
    firstName: "Reg",
    lastName: "Member",
    branchId,
  });
  memberId = (member.user as { id: number }).id;

  const [planRes] = await app.db
    .insert(schema.subscriptionPlans)
    .values({
      name: "Regression Test Plan",
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
  planId = planRes.id;
});

afterAll(async () => {
  if (app) await app.close();
});

beforeEach(async () => {
  // 172-14: acotados al gimnasio (regla del 172-13: global a proposito ->
  // exencion; acotable -> filtro). Este archivo no siembra en otro gimnasio.
  await app.db.execute(
    sql`DELETE FROM transaction_links WHERE tenant_id = ${TENANT_TEMPLO}`,
  );
  await app.db.execute(
    sql`DELETE FROM financial_transactions WHERE tenant_id = ${TENANT_TEMPLO}`,
  );
  await app.db.execute(
    sql`DELETE FROM balances WHERE tenant_id = ${TENANT_TEMPLO}`,
  );
  await app.db.execute(sql`DELETE FROM audit_log`);
  subscriptionId = await seedSubscription();
});

describe("firm-money regression (VAL-05 / VAL-07)", () => {
  // ─── R1: a PENDIENTE must not move firm cash ──────────────────────────────
  it("R1: a PENDIENTE does NOT move summary monthlyRevenue / firm saldo", async () => {
    // Baseline: one validado charge of 1000 → firm cash = 1000.
    await txService.create(TEMPLO_CTX, adminCharge(1000), adminId);
    const baseline = await firmSaldo();
    expect(baseline).toBe(1000);

    // Add a PENDIENTE of 5000 → firm cash MUST stay at 1000.
    await txService.create(TEMPLO_CTX, coachCharge(5000), adminId);
    const afterPendiente = await firmSaldo();
    expect(afterPendiente).toBe(baseline);
    expect(afterPendiente).toBe(1000);
  });

  // ─── R2: validating the PENDIENTE makes it count ──────────────────────────
  it("R2: validating the PENDIENTE DOES add it to firm money", async () => {
    const pendiente = await txService.create(
      TEMPLO_CTX,
      coachCharge(5000),
      adminId,
    );
    expect(await firmSaldo()).toBe(0); // pendiente not yet firm

    const validated = await txService.validate(
      TEMPLO_CTX,
      pendiente.id,
      adminId,
    );
    expect(validated.validationStatus).toBe("validado");

    // Now the 5000 is firm cash (delta == amount).
    expect(await firmSaldo()).toBe(5000);
  });

  // ─── R3: validado fixtures identical across finance + analytics paths ─────
  it("R3: validado numbers identical; a PENDIENTE never pollutes the v5.0 caja/summary", async () => {
    // Fixture of three VALIDADO charges (backfill-equivalent: all validado).
    await txService.create(TEMPLO_CTX, adminCharge(1000), adminId);
    await txService.create(TEMPLO_CTX, adminCharge(2000), adminId);
    await txService.create(TEMPLO_CTX, adminCharge(3000), adminId);

    // Both the finance firm-cash (#1) and the analytics caja (#10) paths must
    // report the same validated total — the predicate is centralized, so the
    // numbers agree across subsystems (the cross-suite invariant of VAL-05).
    const summaryBaseline = await firmSaldo();
    const cajaBaseline = await cashTrendArs();
    expect(summaryBaseline).toBe(6000);
    expect(cajaBaseline).toBe(6000);

    // A PENDIENTE of 9999 must change NEITHER number (backfill identity: only
    // validado rows count; the new predicate excludes the pendiente everywhere).
    await txService.create(TEMPLO_CTX, coachCharge(9999), adminId);
    expect(await firmSaldo()).toBe(summaryBaseline);
    expect(await cashTrendArs()).toBe(cajaBaseline);
  });

  // ─── R4: a PENDIENTE still settles the member's balances (D-09) ───────────
  it("R4: a PENDIENTE settles balances (deuda → 0) but is NOT firm cash", async () => {
    // Seed the debt: full price owed.
    await app.db.insert(schema.balances).values(
      tenantValues(TEMPLO_CTX, {
        memberId,
        targetKind: "subscription" as const,
        targetId: subscriptionId,
        currency: "ARS",
        amount: 1000,
      }),
    );
    expect(await readSubBalance()).toBe(1000);

    // A PENDIENTE for the full amount settles the debt (applyDelta runs
    // unconditionally) — but does NOT add to firm cash.
    await txService.create(TEMPLO_CTX, coachCharge(1000), adminId);

    expect(await readSubBalance()).toBe(0); // deuda saldada
    expect(await firmSaldo()).toBe(0); // pero NO es caja firme
  });
});
