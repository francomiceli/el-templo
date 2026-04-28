// Module: finance — phase 105
//
// TransactionService is the orchestrator (D-04 facade): it accepts the
// public CreateTransactionInput / VoidTransactionInput shapes, validates
// the SPEC §7 invariants (TXN-05 immutability, TXN-06 sum, TXN-07
// referential integrity), inserts financial_transactions + transaction_links,
// and calls BalanceService.applyDelta inside the SAME db.transaction so
// the cache stays atomic with the ledger.
//
// SPEC §7 invariant 1 (immutability) is enforced by TypeScript surface:
// this class deliberately exposes NO `update` method. Only `void()` is
// allowed to mutate an existing row, and only on the soft-void triplet
// (voidedAt, voidedBy, voidReason).

import { eq, desc } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import { BadRequestError, NotFoundError } from "../shared/errors";
import { BalanceService } from "./balance-service";
import type {
  CreateTransactionInput,
  TransactionDetail,
  VoidTransactionInput,
} from "./types";

type DbInstance = MySql2Database<typeof schema>;

/** Kinds for which a transaction with empty `links` is acceptable (SPEC §9). */
const KINDS_ALLOWED_WITHOUT_LINKS: ReadonlyArray<string> = [
  "advance_payment",
  "adjustment",
];

export class TransactionService {
  constructor(
    private readonly db: DbInstance,
    private readonly log: FastifyBaseLogger,
    private readonly balanceService: BalanceService,
  ) {}

  /**
   * Create a financial transaction with its links and atomically maintain
   * the `balances` cache. Validates all SPEC §7 invariants before any write.
   */
  async create(
    input: CreateTransactionInput,
    recordedBy: number,
  ): Promise<TransactionDetail> {
    return await this.db.transaction(async (tx) => {
      // 1a. Σ allocated_amount === amount when links non-empty (TXN-06).
      if (input.links.length > 0) {
        const sum = input.links.reduce((acc, l) => acc + l.allocatedAmount, 0);
        if (sum !== input.amount) {
          throw new BadRequestError(
            "La suma de los montos asignados no coincide con el monto de la transaccion",
          );
        }
      } else if (!KINDS_ALLOWED_WITHOUT_LINKS.includes(input.kind)) {
        throw new BadRequestError(
          `La transaccion de tipo '${input.kind}' requiere al menos un link`,
        );
      }

      // 1b. Member exists.
      const memberExists = await tx
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.id, input.memberId))
        .limit(1);
      if (memberExists.length === 0) {
        throw new NotFoundError("Miembro no encontrado");
      }

      // 1c. Branch exists.
      const branchExists = await tx
        .select({ id: schema.branches.id })
        .from(schema.branches)
        .where(eq(schema.branches.id, input.branchId))
        .limit(1);
      if (branchExists.length === 0) {
        throw new NotFoundError("Sucursal no encontrada");
      }

      // 1d. For each link, probe target_id exists in the table matching
      // target_kind (TXN-07 referential integrity).
      for (const link of input.links) {
        let exists: { id: number }[];
        switch (link.targetKind) {
          case "subscription":
            exists = await tx
              .select({ id: schema.subscriptions.id })
              .from(schema.subscriptions)
              .where(eq(schema.subscriptions.id, link.targetId))
              .limit(1);
            break;
          case "debt_balance":
            exists = await tx
              .select({ id: schema.balances.id })
              .from(schema.balances)
              .where(eq(schema.balances.id, link.targetId))
              .limit(1);
            break;
          case "transaction":
            exists = await tx
              .select({ id: schema.financialTransactions.id })
              .from(schema.financialTransactions)
              .where(eq(schema.financialTransactions.id, link.targetId))
              .limit(1);
            break;
          default: {
            const unknownKind: string = String(link.targetKind);
            throw new BadRequestError(
              `target_kind desconocido: ${unknownKind}`,
            );
          }
        }
        if (exists.length === 0) {
          throw new NotFoundError(
            `Concepto enlazado no existe: ${link.targetKind} ${link.targetId}`,
          );
        }
      }

      // 2. INSERT financial_transactions.
      const inserted = await tx.insert(schema.financialTransactions).values({
        memberId: input.memberId,
        kind: input.kind,
        direction: input.direction,
        amount: input.amount,
        currency: input.currency ?? "ARS",
        paymentMethod: input.paymentMethod,
        transactionDate: input.transactionDate,
        effectiveDate: input.effectiveDate,
        branchId: input.branchId,
        recordedBy,
        notes: input.notes ?? null,
      });
      const transactionId = Number(inserted[0].insertId);

      // 3. INSERT transaction_links (UNIQUE constraint catches duplicate
      // (transaction_id, target_kind, target_id) tuples).
      if (input.links.length > 0) {
        await tx.insert(schema.transactionLinks).values(
          input.links.map((l) => ({
            transactionId,
            targetKind: l.targetKind,
            targetId: l.targetId,
            allocatedAmount: l.allocatedAmount,
          })),
        );
      }

      // 4. Re-read the ledger row + links so balanceService gets the
      // canonical row (with currency defaults applied) and the caller
      // gets a TransactionDetail.
      const [txRow] = await tx
        .select()
        .from(schema.financialTransactions)
        .where(eq(schema.financialTransactions.id, transactionId));
      const linkRows = await tx
        .select()
        .from(schema.transactionLinks)
        .where(eq(schema.transactionLinks.transactionId, transactionId));

      // 5. Apply cache delta in the SAME tx (atomicity per SPEC §8).
      await this.balanceService.applyDelta(tx, txRow, linkRows, +1);

      this.log.info(
        {
          transactionId,
          memberId: input.memberId,
          kind: input.kind,
          amount: input.amount,
          recordedBy,
          linkCount: linkRows.length,
        },
        "Financial transaction created",
      );

      return { ...txRow, links: linkRows };
    });
  }

  /**
   * Void a previously-created transaction. Sets the soft-void triplet
   * (voidedAt, voidedBy, voidReason) and reverses the cache delta inside
   * the same db.transaction. Throws if the transaction does not exist or
   * has already been voided.
   */
  async void(
    id: number,
    voidedBy: number,
    input: VoidTransactionInput,
  ): Promise<TransactionDetail> {
    return await this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(schema.financialTransactions)
        .where(eq(schema.financialTransactions.id, id));
      if (!existing) {
        throw new NotFoundError("Transaccion no encontrada");
      }
      if (existing.voidedAt !== null) {
        throw new BadRequestError("La transaccion ya fue anulada");
      }
      if (!input.reason || input.reason.trim().length === 0) {
        throw new BadRequestError("Razon de anulacion requerida");
      }

      await tx
        .update(schema.financialTransactions)
        .set({
          voidedAt: new Date(),
          voidedBy,
          voidReason: input.reason,
        })
        .where(eq(schema.financialTransactions.id, id));

      const linkRows = await tx
        .select()
        .from(schema.transactionLinks)
        .where(eq(schema.transactionLinks.transactionId, id));

      // Reverse the original effect: pass the original (pre-void) row +
      // sign=-1 so applyDelta computes `-1 * baseDelta` and undoes the
      // create-time effect on the cache exactly.
      await this.balanceService.applyDelta(tx, existing, linkRows, -1);

      const [updatedRow] = await tx
        .select()
        .from(schema.financialTransactions)
        .where(eq(schema.financialTransactions.id, id));

      this.log.info(
        { transactionId: id, voidedBy, reason: input.reason },
        "Financial transaction voided",
      );

      return { ...updatedRow, links: linkRows };
    });
  }

  // ─── Read methods ─────────────────────────────────────────────────────────

  /** Get a single transaction with its links. */
  async getById(id: number): Promise<TransactionDetail | null> {
    const [row] = await this.db
      .select()
      .from(schema.financialTransactions)
      .where(eq(schema.financialTransactions.id, id))
      .limit(1);
    if (!row) return null;
    const links = await this.db
      .select()
      .from(schema.transactionLinks)
      .where(eq(schema.transactionLinks.transactionId, id));
    return { ...row, links };
  }

  /** List a member's transactions ordered by transaction_date desc. */
  async listForMember(
    memberId: number,
    opts?: { limit?: number; offset?: number },
  ): Promise<TransactionDetail[]> {
    const limit = opts?.limit ?? 50;
    const offset = opts?.offset ?? 0;
    const rows = await this.db
      .select()
      .from(schema.financialTransactions)
      .where(eq(schema.financialTransactions.memberId, memberId))
      .orderBy(desc(schema.financialTransactions.transactionDate))
      .limit(limit)
      .offset(offset);
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    const allLinks = await this.db.select().from(schema.transactionLinks).where(
      // inArray would be cleaner; sticking to existing util usage to
      // keep the import surface minimal in this scaffolding plan.
      eq(schema.transactionLinks.transactionId, ids[0]),
    );
    // For lists with multiple ids, fetch links per-row. The N+1 here is
    // acceptable for now (Plan 06+ rewrites callers to use a richer list
    // endpoint). Keeping logic explicit so the scaffolding is testable.
    const byTx = new Map<number, typeof allLinks>();
    for (const r of rows) {
      const links =
        r.id === ids[0]
          ? allLinks
          : await this.db
              .select()
              .from(schema.transactionLinks)
              .where(eq(schema.transactionLinks.transactionId, r.id));
      byTx.set(r.id, links);
    }
    return rows.map((r) => ({ ...r, links: byTx.get(r.id) ?? [] }));
  }
}
