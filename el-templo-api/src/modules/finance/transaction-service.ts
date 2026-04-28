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

import { eq, desc, and, sql, gte, lte, inArray, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/mysql-core";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import { BadRequestError, NotFoundError } from "../shared/errors";
import { buildMemberNameSearchCondition } from "../shared/member-search";
import type { PaginatedResult } from "../shared/types";
import { BalanceService } from "./balance-service";
import type {
  CreateTransactionInput,
  FinancialHistoryFilters,
  FinancialHistoryItem,
  TargetKind,
  TransactionDetail,
  TransactionListFilters,
  TransactionListItem,
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

  // ─── Phase 106: paginated list + financial history ───────────────────────

  /**
   * Paginated list of financial transactions for the admin caja / reports.
   * Filters per Phase 106 D-12. Country scope is injected by the route layer
   * via filters.country (always-present for non-owners, optional for owner).
   */
  async list(
    filters: TransactionListFilters,
  ): Promise<PaginatedResult<TransactionListItem>> {
    const page = Math.max(1, filters.page ?? 1);
    // D-12 / T-106-LISTSIZE: defense-in-depth max=200 even if route bypassed.
    const limit = Math.min(200, Math.max(1, filters.limit ?? 50));
    const offset = (page - 1) * limit;

    const recorder = alias(schema.users, "recorder");
    const conditions = this.buildListConditions(filters);

    // 1) COUNT — same join chain as the row query so country/search filters
    //    that reference users/branches/recorder resolve identically.
    const [countRow] = await this.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(schema.financialTransactions)
      .innerJoin(
        schema.users,
        eq(schema.users.id, schema.financialTransactions.memberId),
      )
      .innerJoin(
        schema.branches,
        eq(schema.branches.id, schema.financialTransactions.branchId),
      )
      .innerJoin(
        recorder,
        eq(recorder.id, schema.financialTransactions.recordedBy),
      )
      .where(conditions.length > 0 ? and(...conditions) : undefined);
    const total = Number(countRow?.count ?? 0);

    // 2) Page rows.
    const raw = await this.db
      .select({
        id: schema.financialTransactions.id,
        transactionDate: schema.financialTransactions.transactionDate,
        effectiveDate: schema.financialTransactions.effectiveDate,
        memberId: schema.financialTransactions.memberId,
        memberFirstName: schema.users.firstName,
        memberLastName: schema.users.lastName,
        kind: schema.financialTransactions.kind,
        direction: schema.financialTransactions.direction,
        amount: schema.financialTransactions.amount,
        currency: schema.financialTransactions.currency,
        paymentMethod: schema.financialTransactions.paymentMethod,
        branchId: schema.financialTransactions.branchId,
        branchName: schema.branches.name,
        recordedBy: schema.financialTransactions.recordedBy,
        recorderFirstName: recorder.firstName,
        recorderLastName: recorder.lastName,
        voidedAt: schema.financialTransactions.voidedAt,
        notes: schema.financialTransactions.notes,
        createdAt: schema.financialTransactions.createdAt,
      })
      .from(schema.financialTransactions)
      .innerJoin(
        schema.users,
        eq(schema.users.id, schema.financialTransactions.memberId),
      )
      .innerJoin(
        schema.branches,
        eq(schema.branches.id, schema.financialTransactions.branchId),
      )
      .innerJoin(
        recorder,
        eq(recorder.id, schema.financialTransactions.recordedBy),
      )
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(
        desc(schema.financialTransactions.transactionDate),
        desc(schema.financialTransactions.createdAt),
      )
      .limit(limit)
      .offset(offset);

    // 3) Single follow-up query for linkSummary (avoid N+1).
    const txIds = raw.map((r) => r.id);
    const links =
      txIds.length > 0
        ? await this.db
            .select({
              transactionId: schema.transactionLinks.transactionId,
              targetKind: schema.transactionLinks.targetKind,
              targetId: schema.transactionLinks.targetId,
              allocatedAmount: schema.transactionLinks.allocatedAmount,
            })
            .from(schema.transactionLinks)
            .where(inArray(schema.transactionLinks.transactionId, txIds))
        : [];

    const linksByTx = new Map<
      number,
      Array<{
        targetKind: TargetKind;
        targetId: number;
        allocatedAmount: number;
      }>
    >();
    for (const l of links) {
      const arr = linksByTx.get(l.transactionId) ?? [];
      arr.push({
        targetKind: l.targetKind,
        targetId: l.targetId,
        allocatedAmount: l.allocatedAmount,
      });
      linksByTx.set(l.transactionId, arr);
    }

    const rows: TransactionListItem[] = raw.map((r) => ({
      id: r.id,
      transactionDate: String(r.transactionDate),
      effectiveDate: String(r.effectiveDate),
      memberId: r.memberId,
      memberName: `${r.memberFirstName ?? ""} ${r.memberLastName ?? ""}`.trim(),
      kind: r.kind,
      direction: r.direction,
      amount: r.amount,
      currency: r.currency,
      paymentMethod: r.paymentMethod,
      branchId: r.branchId,
      branchName: r.branchName,
      recordedBy: r.recordedBy,
      recorderName:
        `${r.recorderFirstName ?? ""} ${r.recorderLastName ?? ""}`.trim(),
      voidedAt: r.voidedAt ? r.voidedAt.toISOString() : null,
      notes: r.notes,
      linkSummary: linksByTx.get(r.id) ?? [],
    }));

    return { rows, total, page, limit };
  }

  private buildListConditions(filters: TransactionListFilters): SQL[] {
    const conds: SQL[] = [];
    if (filters.branchId !== undefined) {
      conds.push(eq(schema.financialTransactions.branchId, filters.branchId));
    }
    if (filters.country !== undefined) {
      conds.push(eq(schema.branches.country, filters.country));
    }
    if (filters.kind !== undefined) {
      conds.push(eq(schema.financialTransactions.kind, filters.kind));
    }
    if (filters.memberId !== undefined) {
      conds.push(eq(schema.financialTransactions.memberId, filters.memberId));
    }
    if (filters.paymentMethod !== undefined) {
      conds.push(
        eq(schema.financialTransactions.paymentMethod, filters.paymentMethod),
      );
    }
    if (filters.dateFrom !== undefined) {
      conds.push(
        gte(schema.financialTransactions.transactionDate, filters.dateFrom),
      );
    }
    if (filters.dateTo !== undefined) {
      conds.push(
        lte(schema.financialTransactions.transactionDate, filters.dateTo),
      );
    }
    if (filters.search !== undefined && filters.search.trim().length > 0) {
      const cond = buildMemberNameSearchCondition(filters.search.trim());
      if (cond) conds.push(cond);
    }
    return conds;
  }

  /**
   * Member-scoped financial history ordered by transaction_date DESC.
   * Each item includes denormalized link rows with `conceptLabel` resolved
   * for target_kind='subscription' (D-13).
   */
  async getFinancialHistory(
    memberId: number,
    filters: FinancialHistoryFilters,
  ): Promise<PaginatedResult<FinancialHistoryItem>> {
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(200, Math.max(1, filters.limit ?? 50));
    const offset = (page - 1) * limit;

    const [countRow] = await this.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(schema.financialTransactions)
      .where(eq(schema.financialTransactions.memberId, memberId));
    const total = Number(countRow?.count ?? 0);

    const txRows = await this.db
      .select()
      .from(schema.financialTransactions)
      .where(eq(schema.financialTransactions.memberId, memberId))
      .orderBy(
        desc(schema.financialTransactions.transactionDate),
        desc(schema.financialTransactions.createdAt),
      )
      .limit(limit)
      .offset(offset);

    if (txRows.length === 0) return { rows: [], total, page, limit };

    const txIds = txRows.map((r) => r.id);

    // Links + concept labels — LEFT JOIN subscriptions + subscription_plans
    // for target_kind='subscription'. Other target_kinds yield no plan row;
    // conceptLabel stays undefined.
    const linkRows = await this.db
      .select({
        transactionId: schema.transactionLinks.transactionId,
        targetKind: schema.transactionLinks.targetKind,
        targetId: schema.transactionLinks.targetId,
        allocatedAmount: schema.transactionLinks.allocatedAmount,
        planName: schema.subscriptionPlans.name,
        subscriptionStartDate: schema.subscriptions.startDate,
      })
      .from(schema.transactionLinks)
      .leftJoin(
        schema.subscriptions,
        and(
          eq(schema.transactionLinks.targetKind, "subscription"),
          eq(schema.subscriptions.id, schema.transactionLinks.targetId),
        ),
      )
      .leftJoin(
        schema.subscriptionPlans,
        eq(schema.subscriptionPlans.id, schema.subscriptions.planId),
      )
      .where(inArray(schema.transactionLinks.transactionId, txIds));

    const linksByTx = new Map<number, FinancialHistoryItem["links"]>();
    for (const l of linkRows) {
      const arr = linksByTx.get(l.transactionId) ?? [];
      const conceptLabel =
        l.targetKind === "subscription" && l.planName
          ? `${l.planName}${
              l.subscriptionStartDate
                ? " — " + String(l.subscriptionStartDate)
                : ""
            }`
          : undefined;
      arr.push({
        targetKind: l.targetKind,
        targetId: l.targetId,
        allocatedAmount: l.allocatedAmount,
        ...(conceptLabel ? { conceptLabel } : {}),
      });
      linksByTx.set(l.transactionId, arr);
    }

    const rows: FinancialHistoryItem[] = txRows.map((r) => {
      const item: FinancialHistoryItem = {
        transaction: r,
        links: linksByTx.get(r.id) ?? [],
      };
      if (r.voidedAt) {
        item.voidInfo = {
          voidedAt: r.voidedAt.toISOString(),
          voidedBy: r.voidedBy ?? 0,
          voidReason: r.voidReason ?? "",
        };
      }
      return item;
    });

    return { rows, total, page, limit };
  }
}
