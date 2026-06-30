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
import { CashRegisterService } from "../../src/modules/finance/cash-register-service";
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

/**
 * Phase 138: seed an efectivo caja for a branch so create()'s resolver can
 * stamp cash_register_id on cash payments against it. Branches created inside a
 * test (ES/AR secondaries) are inserted AFTER the global seedTestData, so they
 * have no caja until this runs. Idempotent: skips if one already exists.
 */
async function seedEfectivoCaja(
  branchIdToSeed: number,
  currency: string,
): Promise<void> {
  const existing = await app.db
    .select({ id: schema.cashRegisters.id })
    .from(schema.cashRegisters)
    .where(
      and(
        eq(schema.cashRegisters.type, "efectivo"),
        eq(schema.cashRegisters.branchId, branchIdToSeed),
      ),
    )
    .limit(1);
  if (existing.length > 0) return;
  await app.db.insert(schema.cashRegisters).values({
    name: `Efectivo branch ${branchIdToSeed}`,
    type: "efectivo",
    branchId: branchIdToSeed,
    currency,
    cutoffDate: "2020-01-01",
  });
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

// ===========================================================================
// Phase 106 — Plan 01: list() + getFinancialHistory() + getRowsForTransaction()
// ===========================================================================

describe("TransactionService.list()", () => {
  // L1: defaults
  it("L1: returns PaginatedResult shape with defaults page=1, limit=50", async () => {
    await txService.create(baseInput({ amount: 1000 }), adminId);
    const result = await txService.list({});
    expect(result).toHaveProperty("rows");
    expect(result).toHaveProperty("total");
    expect(result.page).toBe(1);
    expect(result.limit).toBe(50);
    expect(result.total).toBe(1);
    expect(result.rows).toHaveLength(1);
  });

  // L2: country filter
  it("L2: filters by country='AR' and excludes ES branch transactions", async () => {
    // Seed an ES branch + subscription on it.
    // Branch code column is small (likely VARCHAR(10)). Use a short code.
    const shortCode = `ES${Date.now().toString(36).slice(-4)}`;
    const [esBranchRes] = await app.db
      .insert(schema.branches)
      .values({
        name: "Madrid Test",
        code: shortCode,
        country: "ES",
      })
      .$returningId();
    const esBranchId = esBranchRes.id;
    await seedEfectivoCaja(esBranchId, "EUR");

    const esPlanId = (
      await app.db
        .insert(schema.subscriptionPlans)
        .values({
          name: "ES Plan",
          planTier: "flex",
          bookingMode: "flexible",
          planCategory: "presencial",
          priceRegular: 100000,
          priceZero: 0,
          durationDays: 30,
          classesPerWeek: 3,
          currency: "EUR",
        })
        .$returningId()
    )[0].id;

    const esSubRes = await app.db
      .insert(schema.subscriptions)
      .values({
        userId: memberId,
        planId: esPlanId,
        branchId: esBranchId,
        status: "active",
        startDate: TODAY,
        pricePaid: 100000,
        currency: "EUR",
        priceTypeApplied: "regular",
      })
      .$returningId();
    const esSubId = esSubRes[0].id;

    // 2 AR transactions
    await txService.create(baseInput({ amount: 1000 }), adminId);
    const sub2 = await seedSubscription({
      userId: memberId,
      planId,
      branchId,
      pricePaid: 50000,
      currency: "ARS",
    });
    await txService.create(
      baseInput({
        amount: 2000,
        links: [
          {
            targetKind: "subscription" as const,
            targetId: sub2,
            allocatedAmount: 2000,
          },
        ],
      }),
      adminId,
    );

    // 1 ES transaction
    await txService.create(
      baseInput({
        amount: 5000,
        currency: "EUR",
        branchId: esBranchId,
        links: [
          {
            targetKind: "subscription" as const,
            targetId: esSubId,
            allocatedAmount: 5000,
          },
        ],
      }),
      adminId,
    );

    const arResult = await txService.list({ country: "AR" });
    expect(arResult.total).toBe(2);
    for (const r of arResult.rows) {
      expect(r.currency).toBe("ARS");
    }

    const esResult = await txService.list({ country: "ES" });
    expect(esResult.total).toBe(1);
    expect(esResult.rows[0].currency).toBe("EUR");
  });

  // L3: kind filter
  it("L3: filters by kind", async () => {
    await txService.create(baseInput({ amount: 1000 }), adminId);
    await txService.create(
      baseInput({
        kind: "adjustment",
        direction: "inflow",
        amount: 500,
        links: [],
      }),
      adminId,
    );
    // advance_payment is the other kind allowed without links per
    // KINDS_ALLOWED_WITHOUT_LINKS in transaction-service.ts.
    await txService.create(
      baseInput({
        kind: "advance_payment",
        direction: "inflow",
        amount: 200,
        links: [],
      }),
      adminId,
    );

    const result = await txService.list({ kind: "plan_charge" });
    expect(result.total).toBe(1);
    expect(result.rows[0].kind).toBe("plan_charge");
  });

  // L4: date filters
  it("L4: filters by dateFrom + dateTo (inclusive)", async () => {
    await txService.create(
      baseInput({
        amount: 1000,
        transactionDate: "2026-01-01",
        effectiveDate: "2026-01-01",
      }),
      adminId,
    );
    await txService.create(
      baseInput({
        amount: 1000,
        transactionDate: "2026-02-15",
        effectiveDate: "2026-02-15",
      }),
      adminId,
    );
    await txService.create(
      baseInput({
        amount: 1000,
        transactionDate: "2026-03-31",
        effectiveDate: "2026-03-31",
      }),
      adminId,
    );

    const result = await txService.list({
      dateFrom: "2026-02-01",
      dateTo: "2026-02-28",
    });
    expect(result.total).toBe(1);
    expect(result.rows[0].transactionDate).toBe("2026-02-15");
  });

  // L5: memberId filter
  it("L5: filters by memberId", async () => {
    // Seed a second member.
    const otherMember = await registerUser(app, {
      email: `other-${Date.now()}@test.local`,
      password: "TestPass123!",
      firstName: "Other",
      lastName: "Member",
      branchId,
    });
    const otherId = (otherMember.user as { id: number }).id;
    const otherSub = await seedSubscription({
      userId: otherId,
      planId,
      branchId,
      pricePaid: 50000,
      currency: "ARS",
    });

    await txService.create(baseInput({ amount: 1000 }), adminId);
    await txService.create(
      baseInput({
        memberId: otherId,
        amount: 2000,
        links: [
          {
            targetKind: "subscription" as const,
            targetId: otherSub,
            allocatedAmount: 2000,
          },
        ],
      }),
      adminId,
    );

    const result = await txService.list({ memberId });
    expect(result.total).toBe(1);
    expect(result.rows[0].memberId).toBe(memberId);
  });

  // L6: paymentMethod filter (T-106-05 enum guard)
  it("L6: filters by paymentMethod='aura_credit'", async () => {
    await txService.create(
      baseInput({ amount: 1000, paymentMethod: "cash" }),
      adminId,
    );
    const sub2 = await seedSubscription({
      userId: memberId,
      planId,
      branchId,
      pricePaid: 50000,
      currency: "ARS",
    });
    await txService.create(
      baseInput({
        amount: 500,
        paymentMethod: "aura_credit",
        links: [
          {
            targetKind: "subscription" as const,
            targetId: sub2,
            allocatedAmount: 500,
          },
        ],
      }),
      adminId,
    );

    const result = await txService.list({ paymentMethod: "aura_credit" });
    expect(result.total).toBe(1);
    expect(result.rows[0].paymentMethod).toBe("aura_credit");
  });

  // L7: search by name
  it("L7: filters by search (member name partial match)", async () => {
    // Insert a second member with a distinctive name we can search on.
    const distinctEmail = `searchable-${Date.now()}@test.local`;
    const distinctMember = await registerUser(app, {
      email: distinctEmail,
      password: "TestPass123!",
      firstName: "Zorrillo",
      lastName: "Buscable",
      branchId,
    });
    const distinctId = (distinctMember.user as { id: number }).id;
    const distinctSub = await seedSubscription({
      userId: distinctId,
      planId,
      branchId,
      pricePaid: 50000,
      currency: "ARS",
    });

    await txService.create(baseInput({ amount: 1000 }), adminId);
    await txService.create(
      baseInput({
        memberId: distinctId,
        amount: 2000,
        links: [
          {
            targetKind: "subscription" as const,
            targetId: distinctSub,
            allocatedAmount: 2000,
          },
        ],
      }),
      adminId,
    );

    const result = await txService.list({ search: "Zorrillo" });
    expect(result.total).toBe(1);
    expect(result.rows[0].memberId).toBe(distinctId);
  });

  // L8: pagination
  it("L8: pagination (limit=2 over 5 rows; page=2 returns next 2)", async () => {
    // Seed 5 transactions across separate subscriptions so links don't collide.
    for (let i = 0; i < 5; i++) {
      const sub = await seedSubscription({
        userId: memberId,
        planId,
        branchId,
        pricePaid: 10000 + i,
        currency: "ARS",
      });
      // Stagger by created_at so ORDER BY transaction_date DESC, created_at DESC is deterministic.
      await txService.create(
        baseInput({
          amount: 100 + i,
          links: [
            {
              targetKind: "subscription" as const,
              targetId: sub,
              allocatedAmount: 100 + i,
            },
          ],
        }),
        adminId,
      );
    }

    const p1 = await txService.list({ page: 1, limit: 2 });
    expect(p1.total).toBe(5);
    expect(p1.rows).toHaveLength(2);
    expect(p1.page).toBe(1);
    expect(p1.limit).toBe(2);

    const p2 = await txService.list({ page: 2, limit: 2 });
    expect(p2.total).toBe(5);
    expect(p2.rows).toHaveLength(2);
    expect(p2.page).toBe(2);

    // The four IDs across the two pages should be distinct.
    const ids = new Set<number>([
      ...p1.rows.map((r) => r.id),
      ...p2.rows.map((r) => r.id),
    ]);
    expect(ids.size).toBe(4);
  });

  // L9: denormalized fields populated
  it("L9: denormalized memberName, branchName, recorderName populated", async () => {
    await txService.create(baseInput({ amount: 1000 }), adminId);
    const result = await txService.list({});
    expect(result.rows[0].memberName.length).toBeGreaterThan(0);
    expect(result.rows[0].branchName.length).toBeGreaterThan(0);
    expect(result.rows[0].recorderName.length).toBeGreaterThan(0);
  });

  // L10: linkSummary populated
  it("L10: linkSummary array populated for transactions with links", async () => {
    await txService.create(baseInput({ amount: 1000 }), adminId);
    const result = await txService.list({});
    expect(Array.isArray(result.rows[0].linkSummary)).toBe(true);
    expect(result.rows[0].linkSummary.length).toBeGreaterThanOrEqual(1);
    expect(result.rows[0].linkSummary[0]).toHaveProperty("targetKind");
    expect(result.rows[0].linkSummary[0]).toHaveProperty("allocatedAmount");
  });

  // L11: order by transaction_date DESC, created_at DESC
  it("L11: orders by transaction_date DESC, created_at DESC", async () => {
    await txService.create(
      baseInput({
        amount: 1000,
        transactionDate: "2026-01-01",
        effectiveDate: "2026-01-01",
      }),
      adminId,
    );
    const sub2 = await seedSubscription({
      userId: memberId,
      planId,
      branchId,
      pricePaid: 50000,
      currency: "ARS",
    });
    await txService.create(
      baseInput({
        amount: 2000,
        transactionDate: "2026-03-15",
        effectiveDate: "2026-03-15",
        links: [
          {
            targetKind: "subscription" as const,
            targetId: sub2,
            allocatedAmount: 2000,
          },
        ],
      }),
      adminId,
    );
    const sub3 = await seedSubscription({
      userId: memberId,
      planId,
      branchId,
      pricePaid: 30000,
      currency: "ARS",
    });
    await txService.create(
      baseInput({
        amount: 500,
        transactionDate: "2026-02-10",
        effectiveDate: "2026-02-10",
        links: [
          {
            targetKind: "subscription" as const,
            targetId: sub3,
            allocatedAmount: 500,
          },
        ],
      }),
      adminId,
    );

    const result = await txService.list({});
    expect(result.rows.map((r) => r.transactionDate)).toEqual([
      "2026-03-15",
      "2026-02-10",
      "2026-01-01",
    ]);
  });
});

describe("TransactionService.getFinancialHistory()", () => {
  // H1: ordered DESC
  it("H1: returns PaginatedResult ordered transaction_date DESC", async () => {
    await txService.create(
      baseInput({
        amount: 1000,
        transactionDate: "2026-01-01",
        effectiveDate: "2026-01-01",
      }),
      adminId,
    );
    const sub2 = await seedSubscription({
      userId: memberId,
      planId,
      branchId,
      pricePaid: 50000,
      currency: "ARS",
    });
    await txService.create(
      baseInput({
        amount: 2000,
        transactionDate: "2026-03-15",
        effectiveDate: "2026-03-15",
        links: [
          {
            targetKind: "subscription" as const,
            targetId: sub2,
            allocatedAmount: 2000,
          },
        ],
      }),
      adminId,
    );

    const result = await txService.getFinancialHistory(memberId, {});
    expect(result.total).toBe(2);
    expect(result.rows[0].transaction.transactionDate).toBe("2026-03-15");
    expect(result.rows[1].transaction.transactionDate).toBe("2026-01-01");
  });

  // H2: scope to memberId
  it("H2: only returns rows for the requested memberId", async () => {
    const otherMember = await registerUser(app, {
      email: `other-h2-${Date.now()}@test.local`,
      password: "TestPass123!",
      firstName: "Other",
      lastName: "H2",
      branchId,
    });
    const otherId = (otherMember.user as { id: number }).id;
    const otherSub = await seedSubscription({
      userId: otherId,
      planId,
      branchId,
      pricePaid: 50000,
      currency: "ARS",
    });

    await txService.create(baseInput({ amount: 1000 }), adminId);
    await txService.create(
      baseInput({
        memberId: otherId,
        amount: 2000,
        links: [
          {
            targetKind: "subscription" as const,
            targetId: otherSub,
            allocatedAmount: 2000,
          },
        ],
      }),
      adminId,
    );

    const result = await txService.getFinancialHistory(memberId, {});
    expect(result.total).toBe(1);
    expect(result.rows[0].transaction.memberId).toBe(memberId);
  });

  // H3: voidInfo populated when voidedAt present
  it("H3: each item has transaction + links; voidInfo populated when voided", async () => {
    const created = await txService.create(
      baseInput({ amount: 1000 }),
      adminId,
    );
    await txService.void(created.id, adminId, { reason: "fixed an error" });

    const result = await txService.getFinancialHistory(memberId, {});
    expect(result.rows).toHaveLength(1);
    const item = result.rows[0];
    expect(item.transaction).toBeDefined();
    expect(Array.isArray(item.links)).toBe(true);
    expect(item.links.length).toBeGreaterThanOrEqual(1);
    expect(item.links[0].allocatedAmount).toBeGreaterThan(0);
    expect(item.voidInfo).toBeDefined();
    expect(item.voidInfo?.voidReason).toBe("fixed an error");
    expect(item.voidInfo?.voidedBy).toBe(adminId);
  });

  // H4: conceptLabel for subscription targets
  it("H4: conceptLabel populated for target_kind='subscription' (plan name)", async () => {
    await txService.create(baseInput({ amount: 1000 }), adminId);
    const result = await txService.getFinancialHistory(memberId, {});
    const subLink = result.rows[0].links.find(
      (l) => l.targetKind === "subscription",
    );
    expect(subLink).toBeDefined();
    expect(typeof subLink?.conceptLabel).toBe("string");
    expect(subLink?.conceptLabel?.length ?? 0).toBeGreaterThan(0);
    expect(subLink?.conceptLabel).toContain("Finance Test Plan");
  });

  // H5: pagination defaults
  it("H5: pagination defaults to page=1, limit=50", async () => {
    await txService.create(baseInput({ amount: 1000 }), adminId);
    const result = await txService.getFinancialHistory(memberId, {});
    expect(result.page).toBe(1);
    expect(result.limit).toBe(50);
  });
});

describe("TransactionService.getSummary()", () => {
  /** Seed a fresh ES branch (branches survive between tests). Returns id. */
  async function seedEsBranch(): Promise<number> {
    const code = `ES${Date.now().toString(36).slice(-4)}${Math.floor(
      Math.random() * 100,
    )
      .toString(36)
      .padStart(2, "0")}`;
    const [res] = await app.db
      .insert(schema.branches)
      .values({
        name: "ES-SUM-Test",
        code,
        country: "ES",
      })
      .$returningId();
    await seedEfectivoCaja(res.id, "EUR");
    return res.id;
  }

  /** Seed a fresh secondary AR branch (distinct from the seeded TEST branch). */
  async function seedArBranch2(): Promise<number> {
    const code = `AR${Date.now().toString(36).slice(-4)}${Math.floor(
      Math.random() * 100,
    )
      .toString(36)
      .padStart(2, "0")}`;
    const [res] = await app.db
      .insert(schema.branches)
      .values({
        name: "AR-SUM-Second",
        code,
        country: "AR",
      })
      .$returningId();
    await seedEfectivoCaja(res.id, "ARS");
    return res.id;
  }

  it("SUM1: returns shape { monthlyRevenue, revenueByMethod (5 keys), revenueByBranch }", async () => {
    await txService.create(baseInput({ amount: 1000 }), adminId);
    const result = await txService.getSummary({});
    expect(result).toHaveProperty("monthlyRevenue");
    expect(result).toHaveProperty("revenueByMethod");
    expect(result).toHaveProperty("revenueByBranch");
    expect(result.revenueByMethod).toEqual({
      cash: 1000,
      transfer: 0,
      card: 0,
      aura_credit: 0,
      internal: 0,
    });
  });

  it("SUM2: monthlyRevenue equals SUM(amount) across inflow + non-voided rows", async () => {
    const sub2 = await seedSubscription({
      userId: memberId,
      planId,
      branchId,
      pricePaid: 50000,
      currency: "ARS",
    });
    await txService.create(baseInput({ amount: 1000 }), adminId);
    await txService.create(
      baseInput({
        amount: 2500,
        links: [
          {
            targetKind: "subscription" as const,
            targetId: sub2,
            allocatedAmount: 2500,
          },
        ],
      }),
      adminId,
    );

    const result = await txService.getSummary({});
    expect(result.monthlyRevenue).toBe(3500);
  });

  it("SUM3: voided transactions are excluded from totals", async () => {
    const sub2 = await seedSubscription({
      userId: memberId,
      planId,
      branchId,
      pricePaid: 50000,
      currency: "ARS",
    });
    const t1 = await txService.create(baseInput({ amount: 1000 }), adminId);
    await txService.create(
      baseInput({
        amount: 4000,
        links: [
          {
            targetKind: "subscription" as const,
            targetId: sub2,
            allocatedAmount: 4000,
          },
        ],
      }),
      adminId,
    );
    await txService.void(t1.id, adminId, { reason: "test void" });

    const result = await txService.getSummary({});
    expect(result.monthlyRevenue).toBe(4000);
  });

  it("SUM4: outflow transactions are excluded (revenue = inflow only)", async () => {
    // Inflow 1000.
    await txService.create(baseInput({ amount: 1000 }), adminId);
    // Outflow 500 (e.g., refund). Use kind='refund' with a transaction-link
    // so the service accepts it; allocate against the original transaction.
    // Simpler path: insert directly via Drizzle to bypass kind/link validation.
    await app.db.insert(schema.financialTransactions).values({
      memberId,
      kind: "refund",
      direction: "outflow",
      amount: 500,
      currency: "ARS",
      paymentMethod: "cash",
      transactionDate: TODAY,
      effectiveDate: TODAY,
      branchId,
      recordedBy: adminId,
    });

    const result = await txService.getSummary({});
    expect(result.monthlyRevenue).toBe(1000);
  });

  it("SUM5: country filter — AR-only sum excludes ES rows", async () => {
    const esBranchId = await seedEsBranch();
    const esPlanId = (
      await app.db
        .insert(schema.subscriptionPlans)
        .values({
          name: "ES SUM Plan",
          planTier: "flex",
          bookingMode: "flexible",
          planCategory: "presencial",
          priceRegular: 100000,
          priceZero: 0,
          durationDays: 30,
          classesPerWeek: 3,
          currency: "EUR",
        })
        .$returningId()
    )[0].id;
    const esSubId = (
      await app.db
        .insert(schema.subscriptions)
        .values({
          userId: memberId,
          planId: esPlanId,
          branchId: esBranchId,
          status: "active",
          startDate: TODAY,
          pricePaid: 100000,
          currency: "EUR",
          priceTypeApplied: "regular",
        })
        .$returningId()
    )[0].id;

    // 2 AR inflows totaling 10000.
    const sub2 = await seedSubscription({
      userId: memberId,
      planId,
      branchId,
      pricePaid: 50000,
      currency: "ARS",
    });
    await txService.create(
      baseInput({
        amount: 4000,
        links: [
          {
            targetKind: "subscription" as const,
            targetId: subscriptionId,
            allocatedAmount: 4000,
          },
        ],
      }),
      adminId,
    );
    await txService.create(
      baseInput({
        amount: 6000,
        links: [
          {
            targetKind: "subscription" as const,
            targetId: sub2,
            allocatedAmount: 6000,
          },
        ],
      }),
      adminId,
    );

    // 1 ES inflow of 5000.
    await txService.create(
      baseInput({
        amount: 5000,
        currency: "EUR",
        branchId: esBranchId,
        links: [
          {
            targetKind: "subscription" as const,
            targetId: esSubId,
            allocatedAmount: 5000,
          },
        ],
      }),
      adminId,
    );

    const arSummary = await txService.getSummary({ country: "AR" });
    expect(arSummary.monthlyRevenue).toBe(10000);
    for (const b of arSummary.revenueByBranch) {
      expect(b.branchId).not.toBe(esBranchId);
    }

    const esSummary = await txService.getSummary({ country: "ES" });
    expect(esSummary.monthlyRevenue).toBe(5000);
    expect(esSummary.revenueByBranch).toHaveLength(1);
    expect(esSummary.revenueByBranch[0].branchId).toBe(esBranchId);
  });

  it("SUM6: branchId filter — restricts to that branch only", async () => {
    const ar2Id = await seedArBranch2();
    const sub2 = await seedSubscription({
      userId: memberId,
      planId,
      branchId: ar2Id,
      pricePaid: 50000,
      currency: "ARS",
    });

    // Default branch (TEST) inflow 1000.
    await txService.create(baseInput({ amount: 1000 }), adminId);
    // ar2 branch inflow 7000.
    await txService.create(
      baseInput({
        amount: 7000,
        branchId: ar2Id,
        links: [
          {
            targetKind: "subscription" as const,
            targetId: sub2,
            allocatedAmount: 7000,
          },
        ],
      }),
      adminId,
    );

    const result = await txService.getSummary({ branchId: ar2Id });
    expect(result.monthlyRevenue).toBe(7000);
    expect(result.revenueByBranch).toHaveLength(1);
    expect(result.revenueByBranch[0].branchId).toBe(ar2Id);
  });

  it("SUM7: dateFrom/dateTo filter — only transactions in inclusive range", async () => {
    await txService.create(
      baseInput({
        amount: 1000,
        transactionDate: "2026-01-01",
        effectiveDate: "2026-01-01",
      }),
      adminId,
    );
    const sub2 = await seedSubscription({
      userId: memberId,
      planId,
      branchId,
      pricePaid: 50000,
      currency: "ARS",
    });
    await txService.create(
      baseInput({
        amount: 2000,
        transactionDate: "2026-02-15",
        effectiveDate: "2026-02-15",
        links: [
          {
            targetKind: "subscription" as const,
            targetId: sub2,
            allocatedAmount: 2000,
          },
        ],
      }),
      adminId,
    );
    const sub3 = await seedSubscription({
      userId: memberId,
      planId,
      branchId,
      pricePaid: 50000,
      currency: "ARS",
    });
    await txService.create(
      baseInput({
        amount: 3000,
        transactionDate: "2026-03-31",
        effectiveDate: "2026-03-31",
        links: [
          {
            targetKind: "subscription" as const,
            targetId: sub3,
            allocatedAmount: 3000,
          },
        ],
      }),
      adminId,
    );

    const result = await txService.getSummary({
      dateFrom: "2026-02-01",
      dateTo: "2026-02-28",
    });
    expect(result.monthlyRevenue).toBe(2000);
  });

  it("SUM8: revenueByMethod buckets correctly (cash + transfer + aura_credit; rest 0)", async () => {
    const sub2 = await seedSubscription({
      userId: memberId,
      planId,
      branchId,
      pricePaid: 50000,
      currency: "ARS",
    });
    const sub3 = await seedSubscription({
      userId: memberId,
      planId,
      branchId,
      pricePaid: 50000,
      currency: "ARS",
    });
    await txService.create(
      baseInput({ amount: 1000, paymentMethod: "cash" }),
      adminId,
    );
    await txService.create(
      baseInput({
        amount: 2000,
        paymentMethod: "transfer",
        links: [
          {
            targetKind: "subscription" as const,
            targetId: sub2,
            allocatedAmount: 2000,
          },
        ],
      }),
      adminId,
    );
    await txService.create(
      baseInput({
        amount: 3000,
        paymentMethod: "aura_credit",
        links: [
          {
            targetKind: "subscription" as const,
            targetId: sub3,
            allocatedAmount: 3000,
          },
        ],
      }),
      adminId,
    );

    const result = await txService.getSummary({});
    expect(result.revenueByMethod).toEqual({
      cash: 1000,
      transfer: 2000,
      card: 0,
      aura_credit: 3000,
      internal: 0,
    });
  });

  it("SUM9: revenueByBranch sorted DESC by revenue", async () => {
    const ar2Id = await seedArBranch2();
    const sub2 = await seedSubscription({
      userId: memberId,
      planId,
      branchId: ar2Id,
      pricePaid: 50000,
      currency: "ARS",
    });

    // Default branch (TEST): 1000.
    await txService.create(baseInput({ amount: 1000 }), adminId);
    // ar2: 5000 (should be first in DESC order).
    await txService.create(
      baseInput({
        amount: 5000,
        branchId: ar2Id,
        links: [
          {
            targetKind: "subscription" as const,
            targetId: sub2,
            allocatedAmount: 5000,
          },
        ],
      }),
      adminId,
    );

    const result = await txService.getSummary({});
    expect(result.revenueByBranch.length).toBeGreaterThanOrEqual(2);
    // First entry should have the highest revenue.
    expect(result.revenueByBranch[0].revenue).toBeGreaterThanOrEqual(
      result.revenueByBranch[1].revenue,
    );
    expect(result.revenueByBranch[0].branchId).toBe(ar2Id);
    expect(result.revenueByBranch[0].revenue).toBe(5000);
  });
});

describe("BalanceService.getRowsForTransaction()", () => {
  // B1: returns balance rows touched by the tx links (excluding 'transaction' kind)
  it("B1: returns BalanceRow[] for balances touched by the transaction", async () => {
    const created = await txService.create(
      baseInput({ amount: 1000 }),
      adminId,
    );
    const rows = await balanceService.getRowsForTransaction(created.id);
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0].memberId).toBe(memberId);
    expect(rows[0].targetKind).toBe("subscription");
    expect(rows[0].targetId).toBe(subscriptionId);
    expect(rows[0].currency).toBe("ARS");
  });

  // B2: empty array for unknown transactionId
  it("B2: returns empty array for non-existent transaction", async () => {
    const rows = await balanceService.getRowsForTransaction(999999);
    expect(rows).toEqual([]);
  });

  // B3: matches by composite key (memberId, currency, targetKind, targetId)
  it("B3: matches only the right balance rows by composite key", async () => {
    // Seed a second subscription for the same member.
    const sub2 = await seedSubscription({
      userId: memberId,
      planId,
      branchId,
      pricePaid: 50000,
      currency: "ARS",
    });

    // Two separate transactions, each touching one subscription.
    const tx1 = await txService.create(
      baseInput({
        amount: 1000,
        links: [
          {
            targetKind: "subscription" as const,
            targetId: subscriptionId,
            allocatedAmount: 1000,
          },
        ],
      }),
      adminId,
    );
    const tx2 = await txService.create(
      baseInput({
        amount: 500,
        links: [
          {
            targetKind: "subscription" as const,
            targetId: sub2,
            allocatedAmount: 500,
          },
        ],
      }),
      adminId,
    );

    const r1 = await balanceService.getRowsForTransaction(tx1.id);
    expect(r1).toHaveLength(1);
    expect(r1[0].targetId).toBe(subscriptionId);

    const r2 = await balanceService.getRowsForTransaction(tx2.id);
    expect(r2).toHaveLength(1);
    expect(r2[0].targetId).toBe(sub2);
  });
});

describe("TransactionService.void — Phase 111 REQ-7 audit_log", () => {
  beforeEach(async () => {
    await app.db.execute(sql`DELETE FROM audit_log`);
  });

  it("writes one transaction_voided audit row with the D-13 payload on successful void", async () => {
    // Create a charge tx with one link, then void it. links allocatedAmount
    // must equal amount (TXN-06 sum invariant).
    const created = await txService.create(
      baseInput({
        amount: 7500,
        kind: "plan_charge",
        links: [
          {
            targetKind: "subscription" as const,
            targetId: subscriptionId,
            allocatedAmount: 7500,
          },
        ],
      }),
      adminId,
    );

    await txService.void(created.id, adminId, { reason: "operator typo" });

    const rows = await app.db
      .select()
      .from(schema.auditLog)
      .where(
        and(
          eq(schema.auditLog.action, "transaction_voided"),
          eq(schema.auditLog.targetId, created.id),
        ),
      );

    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.actorId).toBe(adminId);
    expect(row.targetKind).toBe("transaction");
    expect(row.reason).toBe("operator typo");

    const payload = row.payloadJson as Record<string, unknown>;
    expect(payload.txId).toBe(created.id);
    expect(payload.amount).toBe(7500);
    expect(payload.currency).toBe("ARS");
    expect(payload.voidReason).toBe("operator typo");
    expect(typeof payload.voidedAt).toBe("string");

    // Links: array with at least one entry, each carrying targetKind +
    // targetId + allocatedAmount per D-13.
    const links = payload.links as Array<{
      targetKind: string;
      targetId: number;
      allocatedAmount: number;
    }>;
    expect(Array.isArray(links)).toBe(true);
    expect(links.length).toBeGreaterThanOrEqual(1);
    expect(links[0]).toMatchObject({
      targetKind: "subscription",
      targetId: subscriptionId,
      allocatedAmount: 7500,
    });
  });

  it("writes no audit row when void fails (e.g. tx already voided)", async () => {
    const created = await txService.create(
      baseInput({
        amount: 1234,
        kind: "plan_charge",
        links: [
          {
            targetKind: "subscription" as const,
            targetId: subscriptionId,
            allocatedAmount: 1234,
          },
        ],
      }),
      adminId,
    );

    await txService.void(created.id, adminId, { reason: "first void" });

    // Second void should throw "ya fue anulada" before reaching applyDelta /
    // audit write. This verifies the helper isn't called eagerly outside
    // the success path.
    await expect(
      txService.void(created.id, adminId, { reason: "second void" }),
    ).rejects.toThrow();

    const rows = await app.db
      .select()
      .from(schema.auditLog)
      .where(
        and(
          eq(schema.auditLog.action, "transaction_voided"),
          eq(schema.auditLog.targetId, created.id),
        ),
      );
    // Only the first (successful) void produced a row.
    expect(rows).toHaveLength(1);
    expect((rows[0].payloadJson as { voidReason: string }).voidReason).toBe(
      "first void",
    );
  });
});
