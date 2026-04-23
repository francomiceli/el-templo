/**
 * Debt Service (Phase 101).
 *
 * Enforces the "one active debt per user" invariant at the service layer
 * (D-03). Soft-cancels via is_cancelled + cancelled_at (D-04). Never
 * DELETEs. No integration with the payments table in v1 (D-05).
 *
 * RBAC is NOT enforced here — the service trusts its callers. Route
 * handlers are responsible for applying ADMIN_ROLES gates before invoking
 * any mutating method.
 */

import { MySql2Database } from "drizzle-orm/mysql2";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import type { ActiveDebt, DebtUpsertInput } from "./types";

export class DebtService {
  constructor(
    private db: MySql2Database<typeof schema>,
    private log: FastifyBaseLogger,
  ) {}

  /**
   * Upsert semantics (D-03):
   *   - If user has no active (is_cancelled=false) debt → INSERT new row.
   *   - If user has an active debt → UPDATE that row's amount/currency/note
   *     (row id unchanged, updatedAt auto-bumps).
   * Returns the resulting active debt row.
   */
  async upsertActiveDebt(
    userId: number,
    input: DebtUpsertInput,
  ): Promise<ActiveDebt> {
    const existing = await this.getActiveDebtRowId(userId);
    if (existing === null) {
      await this.db.insert(schema.debts).values({
        userId,
        amount: input.amount,
        currency: input.currency,
        note: input.note ?? null,
      });
    } else {
      await this.db
        .update(schema.debts)
        .set({
          amount: input.amount,
          currency: input.currency,
          note: input.note ?? null,
        })
        .where(eq(schema.debts.id, existing));
    }
    const row = await this.getActiveDebtForUser(userId);
    if (!row) {
      // Invariant violation — should not happen.
      this.log.error(
        { userId },
        "upsertActiveDebt: no active debt found after upsert",
      );
      throw new Error("Failed to upsert active debt");
    }
    return row;
  }

  /**
   * Soft-cancel the active debt (D-04). No-op if none exists.
   */
  async cancelActiveDebt(userId: number): Promise<void> {
    await this.db
      .update(schema.debts)
      .set({ isCancelled: true, cancelledAt: new Date() })
      .where(
        and(
          eq(schema.debts.userId, userId),
          eq(schema.debts.isCancelled, false),
        ),
      );
  }

  /** Returns the active debt for a user, or null. */
  async getActiveDebtForUser(userId: number): Promise<ActiveDebt | null> {
    const [row] = await this.db
      .select({
        amount: schema.debts.amount,
        currency: schema.debts.currency,
        note: schema.debts.note,
      })
      .from(schema.debts)
      .where(
        and(
          eq(schema.debts.userId, userId),
          eq(schema.debts.isCancelled, false),
        ),
      )
      .limit(1);
    return row
      ? { amount: row.amount, currency: row.currency, note: row.note }
      : null;
  }

  /**
   * Batch lookup for a list of user IDs (used by listMembers to populate
   * the `debt` field without N+1 queries). Returns a Map for O(1) lookup.
   */
  async getActiveDebtsForUsers(
    userIds: number[],
  ): Promise<Map<number, ActiveDebt>> {
    const result = new Map<number, ActiveDebt>();
    if (userIds.length === 0) return result;
    const rows = await this.db
      .select({
        userId: schema.debts.userId,
        amount: schema.debts.amount,
        currency: schema.debts.currency,
        note: schema.debts.note,
      })
      .from(schema.debts)
      .where(
        and(
          inArray(schema.debts.userId, userIds),
          eq(schema.debts.isCancelled, false),
        ),
      );
    for (const r of rows) {
      result.set(r.userId, {
        amount: r.amount,
        currency: r.currency,
        note: r.note,
      });
    }
    return result;
  }

  /** Internal: returns the active debt row id for a user, or null. */
  private async getActiveDebtRowId(userId: number): Promise<number | null> {
    const [row] = await this.db
      .select({ id: schema.debts.id })
      .from(schema.debts)
      .where(
        and(
          eq(schema.debts.userId, userId),
          eq(schema.debts.isCancelled, false),
        ),
      )
      .limit(1);
    return row?.id ?? null;
  }
}
