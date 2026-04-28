// Module: finance — phase 105
//
// BalanceService is the cache writer for the `balances` table. It is the
// only mutator of `balances` in the codebase (D-04: facade pattern); reads
// are exposed through public read methods.
//
// SPEC §8 LOCKED sign convention:
//   amount > 0 = miembro debe (outstanding obligation)
//   amount = 0 = saldado
//   amount < 0 = saldo a favor (D-08)
//
// For target_kind='subscription', the row is lazily seeded from
// subscriptions.pricePaid the first time it is touched (D-06). The
// subscription's pricePaid IS the obligation; the running tally is
// `obligation - settlements`.
//
// All writes happen inside the caller's `db.transaction(tx => ...)` —
// the `applyDelta` method takes the `tx` handle so the cache update is
// atomic with the ledger insert (T-105-10 mitigation).

import { and, eq, sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import { BadRequestError } from "../shared/errors";
import type {
  BalanceRow,
  FinancialTransactionRow,
  TransactionLinkRow,
} from "./types";

type DbInstance = MySql2Database<typeof schema>;

/**
 * The Drizzle `tx` handle passed to the `db.transaction(async (tx) => ...)`
 * callback. Pragmatic typing: same shape as the parent `MySql2Database`,
 * scoped to the running transaction. (D-04 deferred TypeScript brand types
 * to a later phase.)
 */
type TxHandle = Parameters<Parameters<DbInstance["transaction"]>[0]>[0];

export class BalanceService {
  constructor(
    private readonly db: DbInstance,
    private readonly log: FastifyBaseLogger,
  ) {}

  /**
   * Apply the cache effect of a freshly-inserted (sign=+1) or freshly-voided
   * (sign=-1) financial transaction onto the `balances` table.
   *
   * MUST be called inside the same `db.transaction` as the ledger
   * insert/update so the cache cannot drift from the ledger.
   *
   * Rules:
   * - target_kind='transaction' → no cache effect (transaction-to-transaction
   *   links don't move balances).
   * - target_kind='subscription' → lazily seeded from subscriptions.pricePaid
   *   on first touch; currency must match.
   * - target_kind='debt_balance' → row must already exist (caller
   *   responsibility); seed=0 if not.
   *
   * Sign convention: inflow REDUCES outstanding (member paid), outflow
   * INCREASES it (refund/new charge). Multiplied by `sign` (+1 create, -1 void).
   */
  async applyDelta(
    tx: TxHandle,
    transaction: FinancialTransactionRow,
    links: TransactionLinkRow[],
    sign: 1 | -1,
  ): Promise<void> {
    for (const link of links) {
      // target_kind='transaction' has no balances cache effect
      if (link.targetKind === "transaction") continue;

      const baseDelta =
        transaction.direction === "inflow"
          ? -link.allocatedAmount
          : +link.allocatedAmount;
      const delta = sign * baseDelta;

      // Look up existing row by the UNIQUE composite key.
      const existing = await tx
        .select()
        .from(schema.balances)
        .where(
          and(
            eq(schema.balances.memberId, transaction.memberId),
            eq(schema.balances.targetKind, link.targetKind),
            eq(schema.balances.targetId, link.targetId),
            eq(schema.balances.currency, transaction.currency),
          ),
        )
        .limit(1);

      if (existing.length > 0) {
        // Apply delta only — no re-seeding. Zero-amount rows are
        // preserved (D-07).
        const row = existing[0];
        await tx
          .update(schema.balances)
          .set({
            amount: sql`${schema.balances.amount} + ${delta}`,
            lastRecomputedAt: sql`NOW()`,
          })
          .where(eq(schema.balances.id, row.id));
        this.log.info(
          {
            balanceId: row.id,
            memberId: transaction.memberId,
            targetKind: link.targetKind,
            targetId: link.targetId,
            delta,
          },
          "Balance delta applied (existing row)",
        );
        continue;
      }

      // Lazy seed — first time this target is touched.
      let seedAmount = 0;
      if (link.targetKind === "subscription") {
        const [sub] = await tx
          .select({
            pricePaid: schema.subscriptions.pricePaid,
            currency: schema.subscriptions.currency,
          })
          .from(schema.subscriptions)
          .where(eq(schema.subscriptions.id, link.targetId))
          .limit(1);
        if (!sub) {
          throw new BadRequestError(
            `Suscripcion ${link.targetId} no encontrada al sembrar balance`,
          );
        }
        if (sub.currency !== transaction.currency) {
          throw new BadRequestError(
            `Moneda inconsistente: la suscripcion es ${sub.currency}, la transaccion es ${transaction.currency}`,
          );
        }
        seedAmount = sub.pricePaid;
      }
      // For target_kind='debt_balance': seedAmount stays 0 — caller must
      // have seeded the row already if it represents a positive obligation.

      const finalAmount = seedAmount + delta;
      await tx.insert(schema.balances).values({
        memberId: transaction.memberId,
        targetKind: link.targetKind,
        targetId: link.targetId,
        currency: transaction.currency,
        amount: finalAmount,
        lastRecomputedAt: new Date(),
      });
      this.log.info(
        {
          memberId: transaction.memberId,
          targetKind: link.targetKind,
          targetId: link.targetId,
          seedAmount,
          delta,
          finalAmount,
        },
        "Balance row seeded (lazy)",
      );
    }
  }

  // ─── Read methods (used by Plan 05 members/service.ts rewrite) ───────────

  /**
   * Sum of outstanding balances (amount > 0) grouped by currency, optionally
   * scoped to a list of branches via JOIN with users.
   */
  async getOutstandingTotalsByCurrency(
    branchIds?: number[],
  ): Promise<Array<{ currency: string; amount: number }>> {
    const conditions = [sql`${schema.balances.amount} > 0`];
    if (branchIds !== undefined && branchIds.length > 0) {
      conditions.push(sql`${schema.users.branchId} IN ${branchIds}`);
    }

    const rows = await this.db
      .select({
        currency: schema.balances.currency,
        amount: sql<number>`CAST(SUM(${schema.balances.amount}) AS SIGNED)`,
      })
      .from(schema.balances)
      .innerJoin(schema.users, eq(schema.users.id, schema.balances.memberId))
      .where(and(...conditions))
      .groupBy(schema.balances.currency);

    return rows.map((r) => ({
      currency: r.currency,
      amount: Number(r.amount),
    }));
  }

  /**
   * Whether the given member has any row in `balances` with amount > 0.
   */
  async hasOutstandingForUser(memberId: number): Promise<boolean> {
    const rows = await this.db
      .select({ id: schema.balances.id })
      .from(schema.balances)
      .where(
        and(
          eq(schema.balances.memberId, memberId),
          sql`${schema.balances.amount} > 0`,
        ),
      )
      .limit(1);
    return rows.length > 0;
  }

  /**
   * Look up a single balance row by its unique tuple (member, target, currency).
   * Returns null if no row exists. Useful for tests and for callers that need
   * to inspect the cache without going through TransactionService.
   */
  async getRow(
    memberId: number,
    targetKind: BalanceRow["targetKind"],
    targetId: number,
    currency: string,
  ): Promise<BalanceRow | null> {
    const [row] = await this.db
      .select()
      .from(schema.balances)
      .where(
        and(
          eq(schema.balances.memberId, memberId),
          eq(schema.balances.targetKind, targetKind),
          eq(schema.balances.targetId, targetId),
          eq(schema.balances.currency, currency),
        ),
      )
      .limit(1);
    return row ?? null;
  }
}
