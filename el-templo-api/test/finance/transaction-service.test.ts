/**
 * Integration tests for TransactionService + BalanceService
 *
 * Verifies SPEC §7 invariants (immutability, sum, referential integrity),
 * SPEC §8 LOCKED cache maintenance (with the literal pricePaid=100k +
 * plan_charge=90k → balance=10000 sequence), SPEC §9 adjustment-without-
 * links, the UNIQUE constraint on transaction_links, and D-08 saldo a
 * favor (negative amounts).
 *
 * Runs against the per-worker test MySQL DB (eltemplo_test_<POOL_ID>) per
 * test/setup.ts. Subscriptions are inserted directly via Drizzle to keep
 * the test independent of the broken (Phase 105 in-flight) /assign endpoint.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { sql, eq, and } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { createTestApp, registerUser } from "../helpers";
import { TransactionService } from "../../src/modules/finance/transaction-service";
import { BalanceService } from "../../src/modules/finance/balance-service";
import * as schema from "../../src/db/schema";
import {
  BadRequestError,
  NotFoundError,
} from "../../src/modules/shared/errors";

let app: FastifyInstance;
let txService: TransactionService;
let balanceService: BalanceService;
let memberId: number;
let adminId: number;
let branchId: number;
let planId: number;
let subscriptionId: number; // pricePaid=100000, currency='ARS' for SPEC §8

const TODAY = "2026-04-28";

/**
 * Insert a subscription directly via Drizzle (bypassing the /assign API,
 * which currently writes to the dropped `payments` table).
 */
async function seedSubscription(opts: {
  userId: number;
  planId: number;
  branchId: number;
  pricePaid: number;
  currency: string;
}): Promise<number> {
  const [res] = await app.db
    .insert(schema.subscriptions)
    .values({
      userId: opts.userId,
      planId: opts.planId,
      branchId: opts.branchId,
      status: "active",
      startDate: TODAY,
      pricePaid: opts.pricePaid,
      currency: opts.currency,
      priceTypeApplied: "regular",
    })
    .$returningId();
  return res.id;
}

beforeAll(async () => {
  app = await createTestApp();
  balanceService = new BalanceService(app.db, app.log);
  txService = new TransactionService(app.db, app.log, balanceService);

  // Use the seeded admin user as recordedBy so we don't have to register one.
  const [admin] = await app.db
    .select({ id: schema.users.id, branchId: schema.users.branchId })
    .from(schema.users)
    .where(eq(schema.users.email, "admin@test.com"))
    .limit(1);
  if (!admin) {
    throw new Error(
      "Seeded admin@test.com user not found — check test/setup.ts seed",
    );
  }
  adminId = admin.id;
  branchId = admin.branchId ?? 1;

  // Register a member.
  const member = await registerUser(app, {
    email: `finance-member-${Date.now()}@test.local`,
    password: "TestPass123!",
    firstName: "Finance",
    lastName: "Tester",
    branchId,
  });
  memberId = (member.user as { id: number }).id;

  // Create a subscription_plan with priceRegular=100000.
  const [planRes] = await app.db
    .insert(schema.subscriptionPlans)
    .values({
      name: "Finance Test Plan",
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

  // Seed the canonical "Test E" subscription used by SPEC §8 sequence.
  subscriptionId = await seedSubscription({
    userId: memberId,
    planId,
    branchId,
    pricePaid: 100000,
    currency: "ARS",
  });
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  // Children first to satisfy the FK from transaction_links → financial_transactions.
  await app.db.execute(sql`DELETE FROM transaction_links`);
  await app.db.execute(sql`DELETE FROM financial_transactions`);
  await app.db.execute(sql`DELETE FROM balances`);
});

// Common defaults to keep test bodies focused on the case at hand.
function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    memberId,
    kind: "plan_charge" as const,
    direction: "inflow" as const,
    amount: 1000,
    currency: "ARS",
    paymentMethod: "cash" as const,
    transactionDate: TODAY,
    effectiveDate: TODAY,
    branchId,
    notes: null,
    links: [
      {
        targetKind: "subscription" as const,
        targetId: subscriptionId,
        allocatedAmount: 1000,
      },
    ],
    ...overrides,
  };
}

describe("TransactionService — SPEC §7 invariants", () => {
  it("Test A: 1 link with allocated=amount succeeds", async () => {
    const result = await txService.create(baseInput({ amount: 1000 }), adminId);
    expect(result.id).toBeGreaterThan(0);
    expect(result.links).toHaveLength(1);
  });

  it("Test B: 0 links with kind='plan_charge' is rejected (sum invariant)", async () => {
    await expect(
      txService.create(
        baseInput({ kind: "plan_charge", links: [], amount: 1000 }),
        adminId,
      ),
    ).rejects.toThrow(BadRequestError);
  });

  it("Test C: 0 links with kind='adjustment' is accepted (SPEC §9)", async () => {
    const result = await txService.create(
      baseInput({
        kind: "adjustment",
        direction: "inflow",
        amount: 5000,
        links: [],
      }),
      adminId,
    );
    expect(result.id).toBeGreaterThan(0);
    expect(result.links).toHaveLength(0);

    // No balances row should be created for an adjustment-without-link.
    const rows = await app.db
      .select()
      .from(schema.balances)
      .where(eq(schema.balances.memberId, memberId));
    expect(rows).toHaveLength(0);
  });

  it("Test D: link to non-existent subscription throws NotFoundError (TXN-07)", async () => {
    await expect(
      txService.create(
        baseInput({
          links: [
            {
              targetKind: "subscription" as const,
              targetId: 999999,
              allocatedAmount: 1000,
            },
          ],
        }),
        adminId,
      ),
    ).rejects.toThrow(NotFoundError);
  });

  it("Test H: 2 links summing to amount is accepted; mismatched sum is rejected", async () => {
    // Need a second subscription so the two links don't violate the UNIQUE
    // constraint (transaction_id, target_kind, target_id).
    const sub2 = await seedSubscription({
      userId: memberId,
      planId,
      branchId,
      pricePaid: 50000,
      currency: "ARS",
    });

    // Happy: 600 + 400 = 1000.
    const ok = await txService.create(
      baseInput({
        amount: 1000,
        links: [
          {
            targetKind: "subscription" as const,
            targetId: subscriptionId,
            allocatedAmount: 600,
          },
          {
            targetKind: "subscription" as const,
            targetId: sub2,
            allocatedAmount: 400,
          },
        ],
      }),
      adminId,
    );
    expect(ok.links).toHaveLength(2);

    // Sad: 600 + 300 ≠ 1000.
    await expect(
      txService.create(
        baseInput({
          amount: 1000,
          links: [
            {
              targetKind: "subscription" as const,
              targetId: subscriptionId,
              allocatedAmount: 600,
            },
            {
              targetKind: "subscription" as const,
              targetId: sub2,
              allocatedAmount: 300,
            },
          ],
        }),
        adminId,
      ),
    ).rejects.toThrow(BadRequestError);
  });

  it("Test I: more sum-invariant edges — single link mismatch rejected", async () => {
    await expect(
      txService.create(
        baseInput({
          amount: 1000,
          links: [
            {
              targetKind: "subscription" as const,
              targetId: subscriptionId,
              allocatedAmount: 999,
            },
          ],
        }),
        adminId,
      ),
    ).rejects.toThrow(BadRequestError);
  });
});

describe("TransactionService — SPEC §8 LOCKED cache sequence", () => {
  it("Test E: pricePaid=100k + plan_charge 90k → 10000; + debt_settlement 5k → 5000; void → 10000", async () => {
    // Step 1: plan_charge inflow 90000 against the seeded 100k subscription.
    await txService.create(
      baseInput({
        amount: 90000,
        links: [
          {
            targetKind: "subscription" as const,
            targetId: subscriptionId,
            allocatedAmount: 90000,
          },
        ],
      }),
      adminId,
    );

    let row = await app.db
      .select()
      .from(schema.balances)
      .where(
        and(
          eq(schema.balances.memberId, memberId),
          eq(schema.balances.targetKind, "subscription"),
          eq(schema.balances.targetId, subscriptionId),
          eq(schema.balances.currency, "ARS"),
        ),
      )
      .limit(1);
    expect(row[0].amount).toBe(10000);

    // Step 2: debt_settlement inflow 5000 against the same subscription.
    const settlement = await txService.create(
      baseInput({
        kind: "debt_settlement",
        direction: "inflow",
        amount: 5000,
        links: [
          {
            targetKind: "subscription" as const,
            targetId: subscriptionId,
            allocatedAmount: 5000,
          },
        ],
      }),
      adminId,
    );

    row = await app.db
      .select()
      .from(schema.balances)
      .where(eq(schema.balances.id, row[0].id))
      .limit(1);
    expect(row[0].amount).toBe(5000);

    // Step 3: void the debt_settlement.
    await txService.void(settlement.id, adminId, { reason: "test rollback" });

    row = await app.db
      .select()
      .from(schema.balances)
      .where(eq(schema.balances.id, row[0].id))
      .limit(1);
    expect(row[0].amount).toBe(10000);
  });

  it("Test E2 (D-08): pricePaid=100k + plan_charge 120k → -20000 (saldo a favor)", async () => {
    // Use a fresh subscription so the test is isolated from Test E state.
    const overpaidSub = await seedSubscription({
      userId: memberId,
      planId,
      branchId,
      pricePaid: 100000,
      currency: "ARS",
    });

    await txService.create(
      baseInput({
        amount: 120000,
        links: [
          {
            targetKind: "subscription" as const,
            targetId: overpaidSub,
            allocatedAmount: 120000,
          },
        ],
      }),
      adminId,
    );

    const [row] = await app.db
      .select()
      .from(schema.balances)
      .where(
        and(
          eq(schema.balances.memberId, memberId),
          eq(schema.balances.targetKind, "subscription"),
          eq(schema.balances.targetId, overpaidSub),
          eq(schema.balances.currency, "ARS"),
        ),
      )
      .limit(1);
    expect(row.amount).toBe(-20000);
  });

  it("Test M: D-07 zero-balance row is preserved (not deleted)", async () => {
    // Use a fresh subscription — this scenario is "miembro pagó exacto".
    const exactSub = await seedSubscription({
      userId: memberId,
      planId,
      branchId,
      pricePaid: 100000,
      currency: "ARS",
    });

    await txService.create(
      baseInput({
        amount: 100000,
        links: [
          {
            targetKind: "subscription" as const,
            targetId: exactSub,
            allocatedAmount: 100000,
          },
        ],
      }),
      adminId,
    );

    const rows = await app.db
      .select()
      .from(schema.balances)
      .where(
        and(
          eq(schema.balances.memberId, memberId),
          eq(schema.balances.targetKind, "subscription"),
          eq(schema.balances.targetId, exactSub),
          eq(schema.balances.currency, "ARS"),
        ),
      );
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0].amount).toBe(0);
  });
});

describe("TransactionService — DB constraints + immutability", () => {
  it("Test J: UNIQUE(transaction_id, target_kind, target_id) on transaction_links rejects duplicates", async () => {
    // First create a real transaction to satisfy the FK on transaction_id.
    const created = await txService.create(
      baseInput({ amount: 1000 }),
      adminId,
    );

    let caught: unknown = null;
    try {
      await app.db.insert(schema.transactionLinks).values([
        {
          transactionId: created.id,
          targetKind: "subscription",
          targetId: subscriptionId,
          allocatedAmount: 500,
        },
        {
          transactionId: created.id,
          targetKind: "subscription",
          targetId: subscriptionId,
          allocatedAmount: 500,
        },
      ]);
    } catch (err) {
      caught = err;
    }

    expect(caught).not.toBeNull();
    const code =
      (caught as { cause?: { code?: string } } | null)?.cause?.code ??
      (caught as { code?: string } | null)?.code ??
      "";
    expect(code).toBe("ER_DUP_ENTRY");
  });

  it("Test K: TXN-05 immutability — TransactionService exposes no `update` method", () => {
    const probe = txService as unknown as Record<string, unknown>;
    expect(probe.update).toBeUndefined();
  });

  it("Test L: voiding twice throws BadRequestError ('ya fue anulada')", async () => {
    const created = await txService.create(
      baseInput({ amount: 1000 }),
      adminId,
    );
    await txService.void(created.id, adminId, { reason: "first void" });
    await expect(
      txService.void(created.id, adminId, { reason: "second void" }),
    ).rejects.toThrow(/ya fue anulada/);
  });

  it("Test N: currency mismatch (subscription ARS, transaction USD) is rejected", async () => {
    // The service-layer check that fires is BalanceService.applyDelta's
    // currency comparison during lazy-seed. The transaction insert itself
    // accepts USD (the schema does not constrain currency vs. subscription).
    await expect(
      txService.create(
        baseInput({
          currency: "USD",
          links: [
            {
              targetKind: "subscription" as const,
              targetId: subscriptionId,
              allocatedAmount: 1000,
            },
          ],
        }),
        adminId,
      ),
    ).rejects.toThrow(/Moneda inconsistente/);
  });
});
