// Module: aura
import { eq, sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { Logger } from "pino";
import { auraTransactions, auraBalances, auraConfig } from "../../db/schema";
import type { AwardInput, SpendInput } from "./types";
import type * as schema from "../../db/schema";

/**
 * Error thrown when a spend operation exceeds the user's available AURA balance.
 */
export class InsufficientBalanceError extends Error {
  constructor(userId: number, requested: number, available: number) {
    super(
      `Insufficient AURA balance for user ${userId}: requested ${requested}, available ${available}`,
    );
    this.name = "InsufficientBalanceError";
  }
}

type DbInstance = MySql2Database<typeof schema>;

/**
 * AuraService manages the AURA economy: awarding, spending, and querying balances.
 *
 * All award/spend operations are atomic — ledger entry and balance update happen
 * in a single MySQL transaction.
 */
export class AuraService {
  constructor(
    private readonly db: DbInstance,
    private readonly log?: Logger,
  ) {}

  /**
   * Award AURA to a user. Creates a ledger entry and atomically updates the cached balance.
   *
   * @param input - Award details (userId, sourceType, referenceType, referenceId, optional amount/description)
   * @returns The user's new total balance
   * @throws On duplicate award (unique constraint violation)
   */
  async award(input: AwardInput): Promise<number> {
    const {
      userId,
      sourceType,
      referenceType,
      referenceId,
      amount: explicitAmount,
      description,
    } = input;

    return await this.db.transaction(async (tx) => {
      // Determine award amount: explicit override or config default
      let amount = explicitAmount;
      if (amount === undefined) {
        const configRows = await tx
          .select({ defaultAmount: auraConfig.defaultAmount })
          .from(auraConfig)
          .where(eq(auraConfig.sourceType, sourceType));

        if (configRows.length === 0) {
          throw new Error(
            `No AURA config found for source type: ${sourceType}`,
          );
        }
        amount = configRows[0].defaultAmount;
      }

      // Insert ledger entry (unique constraint prevents duplicates)
      await tx.insert(auraTransactions).values({
        userId,
        sourceType,
        amount,
        referenceType: referenceType ?? null,
        referenceId: referenceId ?? null,
        description: description ?? null,
      });

      // Upsert balance: INSERT ... ON DUPLICATE KEY UPDATE
      await tx.execute(
        sql`INSERT INTO aura_balances (user_id, balance)
            VALUES (${userId}, ${amount})
            ON DUPLICATE KEY UPDATE balance = balance + ${amount}`,
      );

      // Read and return the new balance
      const balanceRows = await tx
        .select({ balance: auraBalances.balance })
        .from(auraBalances)
        .where(eq(auraBalances.userId, userId));

      const newBalance = balanceRows[0]?.balance ?? 0;

      this.log?.info(
        { userId, sourceType, amount, newBalance },
        "AURA awarded",
      );

      return newBalance;
    });
  }

  /**
   * Spend AURA from a user's balance. Creates a negative ledger entry and decrements balance.
   *
   * @param input - Spend details (userId, amount, description)
   * @returns The user's new total balance
   * @throws InsufficientBalanceError if the user doesn't have enough AURA
   */
  async spend(input: SpendInput): Promise<number> {
    const { userId, amount, description, referenceType, referenceId } = input;

    return await this.db.transaction(async (tx) => {
      // Lock the balance row for update to prevent race conditions
      const balanceRows = await tx.execute(
        sql`SELECT balance FROM aura_balances WHERE user_id = ${userId} FOR UPDATE`,
      );

      const rows = balanceRows[0] as unknown as Array<{ balance: number }>;
      const currentBalance = rows[0]?.balance ?? 0;

      if (currentBalance < amount) {
        throw new InsufficientBalanceError(userId, amount, currentBalance);
      }

      // Insert negative ledger entry
      await tx.insert(auraTransactions).values({
        userId,
        sourceType: "manual_adjustment",
        amount: -amount,
        referenceType: referenceType ?? null,
        referenceId: referenceId ?? null,
        description,
      });

      // Decrement balance
      await tx.execute(
        sql`UPDATE aura_balances SET balance = balance - ${amount} WHERE user_id = ${userId}`,
      );

      const newBalance = currentBalance - amount;

      this.log?.info({ userId, amount, newBalance }, "AURA spent");

      return newBalance;
    });
  }

  /**
   * Get the current AURA balance for a user.
   *
   * @param userId - The user ID
   * @returns The user's balance (0 if no balance record exists)
   */
  async getBalance(userId: number): Promise<number> {
    const rows = await this.db
      .select({ balance: auraBalances.balance })
      .from(auraBalances)
      .where(eq(auraBalances.userId, userId));

    return rows[0]?.balance ?? 0;
  }
}
