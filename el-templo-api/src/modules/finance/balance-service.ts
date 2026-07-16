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

import { and, eq, ne, sql } from "drizzle-orm";
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
 *
 * Exported so callers in `transaction-service.ts` (Phase 107 Plan 01) and
 * `subscriptions/service.ts` (Phase 107 Plan 02) can pass-through the same
 * tx handle for atomic nested operations (D-09 / CHARGE-03).
 */
export type TxHandle = Parameters<Parameters<DbInstance["transaction"]>[0]>[0];

export class BalanceService {
  constructor(
    private readonly db: DbInstance,
    private readonly log: FastifyBaseLogger,
  ) {}

  /**
   * Mantiene atómicamente la cache `balances` aplicando el delta de una transacción.
   *
   * INVARIANTE (no romper): todas las queries del body usan el `tx` recibido,
   * nunca `this.db`. Si un caller envuelve `applyDelta` en una `db.transaction`
   * externa (ej. `subscriptions/service.ts` en Phase 107), `tx` ES la conexión
   * externa y `this.db` rompería el rollback unificado. Ver SPEC §7-§8.
   *
   * Apply the cache effect of a freshly-inserted (sign=+1) or freshly-voided
   * (sign=-1) financial transaction onto the `balances` table.
   *
   * MUST be called inside the same `db.transaction` as the ledger
   * insert/update so the cache cannot drift from the ledger.
   *
   * Rules:
   * - target_kind='transaction' → no cache effect (transaction-to-transaction
   *   links don't move balances).
   * - target_kind='enrollment' → no cache effect (Phase 112 D-13: admin add-on
   *   charges are one-shot and do not represent a running obligation; the link
   *   exists only for trazability so analytics/financial-history can resolve
   *   the financial_transaction back to the program_enrollments row).
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
    // Phase 139 (D-07 / MUST-FIX B): no links = no balance effect (the documented
    // contract). cash_transfer/expense carry no subscription/debt links, so this
    // is their no-op path AND it narrows transaction.memberId (number | null) so
    // the eq(balances.memberId, ...) sites below stay tsc-safe under the now-
    // nullable member_id — a link-bearing row always has a real member.
    if (links.length === 0) return;
    for (const link of links) {
      // target_kind='transaction' has no balances cache effect
      if (link.targetKind === "transaction") continue;
      // Phase 112 D-13: target_kind='enrollment' is trazability-only; no
      // running obligation to maintain in the cache.
      if (link.targetKind === "enrollment") continue;

      // Phase 139: a subscription/debt_balance link implies a real member
      // (egresos/movimientos carry NO such links). Narrow the now-nullable
      // memberId explicitly so balances.memberId (NOT NULL) stays satisfied.
      if (transaction.memberId === null) {
        throw new BadRequestError(
          "Una transaccion con link de saldo debe tener socio",
        );
      }

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

        // Gestión de deudas (brief §2.4/§5.4): si la deuda tiene gestión
        // (fila en debt_management), sincronizar su estado con el saldo —
        // saldada (<= 0) pasa a 'cobrada' automáticamente cuando entra el
        // pago, y un void que la re-abre (> 0) la devuelve a 'activa'.
        // 'incobrable' con saldo > 0 no se toca. Same-tx: atómico con el
        // update del cache. Sin fila de gestión no hay nada que sincronizar.
        const newAmount = Number(row.amount) + delta;
        if (newAmount <= 0) {
          await tx
            .update(schema.debtManagement)
            .set({ status: "cobrada" })
            .where(
              and(
                eq(schema.debtManagement.balanceId, row.id),
                ne(schema.debtManagement.status, "cobrada"),
              ),
            );
        } else {
          await tx
            .update(schema.debtManagement)
            .set({ status: "activa" })
            .where(
              and(
                eq(schema.debtManagement.balanceId, row.id),
                eq(schema.debtManagement.status, "cobrada"),
              ),
            );
        }
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

  /**
   * Read the balance rows touched by a given transaction's links.
   * Used by POST /transactions handler for the affectedBalances field
   * (Phase 106 D-10) so the frontend doesn't re-fetch.
   *
   * Excludes target_kind='transaction' (no balance effect — see applyDelta).
   * Matches balances rows by (memberId, currency, targetKind, targetId)
   * which mirrors the composite key applyDelta writes against.
   */
  async getRowsForTransaction(transactionId: number): Promise<BalanceRow[]> {
    const rows = await this.db
      .select({
        id: schema.balances.id,
        memberId: schema.balances.memberId,
        targetKind: schema.balances.targetKind,
        targetId: schema.balances.targetId,
        currency: schema.balances.currency,
        amount: schema.balances.amount,
        lastRecomputedAt: schema.balances.lastRecomputedAt,
        createdAt: schema.balances.createdAt,
      })
      .from(schema.balances)
      .innerJoin(
        schema.transactionLinks,
        and(
          eq(schema.transactionLinks.targetKind, schema.balances.targetKind),
          eq(schema.transactionLinks.targetId, schema.balances.targetId),
        ),
      )
      .innerJoin(
        schema.financialTransactions,
        and(
          eq(
            schema.financialTransactions.id,
            schema.transactionLinks.transactionId,
          ),
          eq(schema.financialTransactions.memberId, schema.balances.memberId),
          eq(schema.financialTransactions.currency, schema.balances.currency),
        ),
      )
      .where(
        and(
          eq(schema.transactionLinks.transactionId, transactionId),
          ne(schema.transactionLinks.targetKind, "transaction"),
        ),
      );
    return rows;
  }
}
