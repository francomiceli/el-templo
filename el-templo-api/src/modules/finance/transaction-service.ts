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

import {
  eq,
  desc,
  and,
  sql,
  gt,
  gte,
  lte,
  inArray,
  isNull,
  type SQL,
} from "drizzle-orm";
import { alias } from "drizzle-orm/mysql-core";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import { BadRequestError, NotFoundError } from "../shared/errors";
import { buildMemberNameSearchCondition } from "../shared/member-search";
import type { PaginatedResult } from "../shared/types";
import { auditLog } from "../shared/audit-log";
import { BalanceService, type TxHandle } from "./balance-service";
import type {
  CreateTransactionInput,
  FinanceSummary,
  FinanceSummaryFilters,
  FinancialHistoryFilters,
  FinancialHistoryItem,
  OutstandingConcept,
  RevenueByKind,
  TargetKind,
  TransactionDetail,
  TransactionExportRow,
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
   *
   * Optional `tx` parameter (D-09 / CHARGE-03): when provided, all queries run
   * against the caller's transaction handle, allowing nested atomicity (ej.
   * `subscriptions/service.ts` envuelve la creación de subscription + cobro
   * en una sola db.transaction). When omitted, opens its own db.transaction
   * — backward-compat for the REST endpoint `POST /api/admin/transactions`.
   */
  async create(
    input: CreateTransactionInput,
    recordedBy: number,
    tx?: TxHandle,
  ): Promise<TransactionDetail> {
    const runner = tx
      ? <T>(cb: (h: TxHandle) => Promise<T>): Promise<T> => cb(tx)
      : <T>(cb: (h: TxHandle) => Promise<T>): Promise<T> =>
          this.db.transaction(cb);

    return await runner<TransactionDetail>(async (txHandle) => {
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
      const memberExists = await txHandle
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.id, input.memberId))
        .limit(1);
      if (memberExists.length === 0) {
        throw new NotFoundError("Miembro no encontrado");
      }

      // 1c. Branch exists.
      const branchExists = await txHandle
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
            exists = await txHandle
              .select({ id: schema.subscriptions.id })
              .from(schema.subscriptions)
              .where(eq(schema.subscriptions.id, link.targetId))
              .limit(1);
            break;
          case "debt_balance":
            exists = await txHandle
              .select({ id: schema.balances.id })
              .from(schema.balances)
              .where(eq(schema.balances.id, link.targetId))
              .limit(1);
            break;
          case "transaction":
            exists = await txHandle
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
      const inserted = await txHandle
        .insert(schema.financialTransactions)
        .values({
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
        await txHandle.insert(schema.transactionLinks).values(
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
      const [txRow] = await txHandle
        .select()
        .from(schema.financialTransactions)
        .where(eq(schema.financialTransactions.id, transactionId));
      const linkRows = await txHandle
        .select()
        .from(schema.transactionLinks)
        .where(eq(schema.transactionLinks.transactionId, transactionId));

      // 5. Apply cache delta in the SAME tx (atomicity per SPEC §8).
      await this.balanceService.applyDelta(txHandle, txRow, linkRows, +1);

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

      // REQ-7 (Phase 111 D-13 / D-15): forensic audit row for transaction
      // voids. Atomic with the soft-void update + balance rollback — if any
      // of the writes above throws after this point, the audit row vanishes
      // (helper requires tx handle; never opens its own transaction).
      await auditLog.write(tx, {
        actorId: voidedBy,
        action: "transaction_voided",
        targetKind: "transaction",
        targetId: id,
        payload: {
          txId: id,
          amount: existing.amount,
          currency: existing.currency,
          voidedAt: new Date().toISOString(),
          voidReason: input.reason,
          links: linkRows.map((l) => ({
            targetKind: l.targetKind,
            targetId: l.targetId,
            allocatedAmount: l.allocatedAmount,
          })),
        },
        reason: input.reason,
      });

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

  /**
   * Phase 108 (D-01..D-06): Lista saldos pendientes del miembro con
   * descripción humana y antigüedad. Source: balances cache (105-SPEC §8)
   * WHERE amount > 0. Ordenado por effectiveDate ASC (FIFO).
   *
   * Hidden invariants:
   * - LEFT JOIN obligatorio: target_kind='debt_balance' no tiene FK a
   *   subscriptions; INNER JOIN los borraría silenciosamente.
   * - effectiveDate para subscription = subscriptions.startDate (D-05).
   *   Para debt_balance fallback = balances.createdAt (date portion).
   * - ageInDays se computa en TS (no SQL date-diff) para clamp >=0 cuando
   *   effectiveDate es futuro (D-04) y para evitar drift de timezone.
   * - description: "Mensualidad <Mes> <Año> — <PlanName>" (subscription)
   *   o "Saldo libre #<id>" (debt_balance fallback) per D-06.
   */
  async getOutstandingConcepts(
    memberId: number,
  ): Promise<OutstandingConcept[]> {
    this.log.info({ memberId }, "Loading outstanding concepts");

    const rows = await this.db
      .select({
        targetKind: schema.balances.targetKind,
        targetId: schema.balances.targetId,
        currency: schema.balances.currency,
        amount: schema.balances.amount,
        planName: schema.subscriptionPlans.name,
        subscriptionStartDate: schema.subscriptions.startDate,
        balanceCreatedAt: schema.balances.createdAt,
      })
      .from(schema.balances)
      .leftJoin(
        schema.subscriptions,
        and(
          eq(schema.balances.targetKind, "subscription"),
          eq(schema.subscriptions.id, schema.balances.targetId),
        ),
      )
      .leftJoin(
        schema.subscriptionPlans,
        eq(schema.subscriptionPlans.id, schema.subscriptions.planId),
      )
      .where(
        and(
          eq(schema.balances.memberId, memberId),
          gt(schema.balances.amount, 0),
        ),
      );

    // D-06: meses en español derivados del effective_date.
    const MONTHS_ES = [
      "Enero",
      "Febrero",
      "Marzo",
      "Abril",
      "Mayo",
      "Junio",
      "Julio",
      "Agosto",
      "Septiembre",
      "Octubre",
      "Noviembre",
      "Diciembre",
    ];

    // Hoy a medianoche (local) para diferencia de días computada en TS.
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const MS_PER_DAY = 1000 * 60 * 60 * 24;

    const concepts: OutstandingConcept[] = rows.map((r) => {
      let effectiveDate: string;
      let description: string;

      if (r.targetKind === "subscription" && r.subscriptionStartDate) {
        // D-05: effectiveDate = subscriptions.startDate (YYYY-MM-DD).
        effectiveDate = r.subscriptionStartDate;
        const d = new Date(effectiveDate + "T00:00:00");
        const month = MONTHS_ES[d.getMonth()] ?? "";
        const year = d.getFullYear();
        const planName = r.planName ?? "Plan";
        // D-06: "Mensualidad <Mes> <Año> — <PlanName>".
        description = `Mensualidad ${month} ${year} — ${planName}`;
      } else {
        // D-05/D-06 fallback (debt_balance): effectiveDate = balances.createdAt
        // (date portion); description = "Saldo libre #<id>".
        const created =
          r.balanceCreatedAt instanceof Date
            ? r.balanceCreatedAt
            : new Date(r.balanceCreatedAt);
        effectiveDate = created.toISOString().slice(0, 10);
        description = `Saldo libre #${r.targetId}`;
      }

      // D-04: ageInDays = max(0, dayDiff(today, effectiveDate)).
      const effDate = new Date(effectiveDate + "T00:00:00");
      const diffMs = today.getTime() - effDate.getTime();
      const ageInDays = Math.max(0, Math.floor(diffMs / MS_PER_DAY));

      return {
        targetKind: r.targetKind,
        targetId: r.targetId,
        description,
        currency: r.currency,
        balance: r.amount,
        ageInDays,
        effectiveDate,
      };
    });

    // D-01: FIFO — sort por effectiveDate ASC. localeCompare es estable y
    // funciona bien con strings YYYY-MM-DD.
    concepts.sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));

    return concepts;
  }

  /**
   * Aggregate revenue summary for the CajaPage cards (D-16).
   * Revenue semantics: direction='inflow' AND voided_at IS NULL.
   * Filters: branchId, country (via branches.country JOIN), dateFrom/dateTo
   * on transactionDate (inclusive).
   *
   * Returns the legacy FinancialSummary shape with revenueByMethod widened
   * to 5 keys (cash/transfer/card/aura_credit/internal). revenueByBranch is
   * sorted DESC by revenue.
   */
  async getSummary(filters: FinanceSummaryFilters): Promise<FinanceSummary> {
    const conds: SQL[] = [
      eq(schema.financialTransactions.direction, "inflow"),
      isNull(schema.financialTransactions.voidedAt),
    ];
    if (filters.branchId !== undefined) {
      conds.push(eq(schema.financialTransactions.branchId, filters.branchId));
    }
    if (filters.country !== undefined) {
      conds.push(eq(schema.branches.country, filters.country));
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

    // 1) monthlyRevenue — single SUM across matching rows.
    const [totalRow] = await this.db
      .select({
        total: sql<number>`COALESCE(SUM(${schema.financialTransactions.amount}), 0)`,
      })
      .from(schema.financialTransactions)
      .innerJoin(
        schema.branches,
        eq(schema.branches.id, schema.financialTransactions.branchId),
      )
      .where(and(...conds));
    const monthlyRevenue = Number(totalRow?.total ?? 0);

    // 2) revenueByMethod — GROUP BY paymentMethod (5 fixed keys; defaults 0).
    const methodRows = await this.db
      .select({
        paymentMethod: schema.financialTransactions.paymentMethod,
        total: sql<number>`COALESCE(SUM(${schema.financialTransactions.amount}), 0)`,
      })
      .from(schema.financialTransactions)
      .innerJoin(
        schema.branches,
        eq(schema.branches.id, schema.financialTransactions.branchId),
      )
      .where(and(...conds))
      .groupBy(schema.financialTransactions.paymentMethod);
    const revenueByMethod: FinanceSummary["revenueByMethod"] = {
      cash: 0,
      transfer: 0,
      card: 0,
      aura_credit: 0,
      internal: 0,
    };
    for (const r of methodRows) {
      revenueByMethod[r.paymentMethod] = Number(r.total);
    }

    // 3) revenueByBranch — GROUP BY branchId, ORDER BY SUM(amount) DESC.
    const branchRows = await this.db
      .select({
        branchId: schema.financialTransactions.branchId,
        branchName: schema.branches.name,
        total: sql<number>`COALESCE(SUM(${schema.financialTransactions.amount}), 0)`,
      })
      .from(schema.financialTransactions)
      .innerJoin(
        schema.branches,
        eq(schema.branches.id, schema.financialTransactions.branchId),
      )
      .where(and(...conds))
      .groupBy(schema.financialTransactions.branchId, schema.branches.name)
      .orderBy(desc(sql`SUM(${schema.financialTransactions.amount})`));
    const revenueByBranch = branchRows.map((r) => ({
      branchId: r.branchId,
      branchName: r.branchName,
      revenue: Number(r.total),
    }));

    // 4) revenueByKind — GROUP BY kind (5 fixed keys; defaults 0). Same
    //    conds[] as the rest (direction='inflow' + voidedAt IS NULL +
    //    branchId/country/dateFrom/dateTo).
    //
    //    NOTE (Phase 109 W4): refund is always direction='outflow' per
    //    balance-service.ts:76-77 convention ("outflow INCREASES it
    //    (refund/new charge)"). There is no valid (kind='refund' +
    //    direction='inflow') combo in the model, so revenueByKind.refund
    //    will always = 0 here. This is correct: monthlyRevenue is
    //    inflow-only by design, and revenueByKind shares that semantics.
    const kindRows = await this.db
      .select({
        kind: schema.financialTransactions.kind,
        total: sql<number>`COALESCE(SUM(${schema.financialTransactions.amount}), 0)`,
      })
      .from(schema.financialTransactions)
      .innerJoin(
        schema.branches,
        eq(schema.branches.id, schema.financialTransactions.branchId),
      )
      .where(and(...conds))
      .groupBy(schema.financialTransactions.kind);
    const revenueByKind: RevenueByKind = {
      plan_charge: 0,
      debt_settlement: 0,
      refund: 0,
      adjustment: 0,
      advance_payment: 0,
    };
    for (const r of kindRows) {
      revenueByKind[r.kind] = Number(r.total);
    }

    return { monthlyRevenue, revenueByMethod, revenueByBranch, revenueByKind };
  }

  /**
   * Phase 109 D-15 — Excel export of the CajaPage transaction list.
   *
   * Mirrors the same filter semantics as `list()` (branchId, country,
   * kind, dateFrom/dateTo, paymentMethod, search, memberId) but ignores
   * pagination — returns ALL matching rows in one shot. Reuses
   * buildListConditions + the link follow-up query so the result set
   * stays byte-identical to what the listing endpoint would page through.
   *
   * Returns the raw row array; the route layer renders the workbook
   * (mirrors reports/service.ts → reports/routes.ts split).
   */
  async exportRowsForExcel(
    filters: TransactionListFilters,
  ): Promise<TransactionExportRow[]> {
    const recorder = alias(schema.users, "recorder");
    const conditions = this.buildListConditions(filters);

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
        voidReason: schema.financialTransactions.voidReason,
        notes: schema.financialTransactions.notes,
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
      );

    // Single follow-up query for linkSummary (mirrors list() N+1 avoidance).
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

    // Row shape mirrors TransactionListItem + voidReason (added for the
    // "Razón anulación" column per D-15).
    return raw.map((r) => ({
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
      voidReason: r.voidReason ?? null,
      notes: r.notes,
      linkSummary: linksByTx.get(r.id) ?? [],
    })) as TransactionExportRow[];
  }
}
