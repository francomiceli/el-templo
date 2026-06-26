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
  asc,
  desc,
  and,
  sql,
  gt,
  gte,
  lte,
  inArray,
  notInArray,
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
import { CashRegisterService } from "./cash-register-service";
import { FinanceConfigService } from "./config-service";
// OVERDUE_DAYS (the canonical default) is no longer referenced directly here —
// the threshold now flows through FinanceConfigService.getOverdueThreshold(),
// which owns the fallback. Phase 142 (D-05).
import { firmMoneyConditions } from "./firm-money";
import type {
  CreateTransactionInput,
  ObserveTransactionInput,
  FinanceSummary,
  FinanceSummaryFilters,
  FinancialHistoryFilters,
  FinancialHistoryItem,
  MovEgresoFilters,
  MovEgresoItem,
  OutstandingConcept,
  PaymentMethod,
  PendingMiscItem,
  PendingTrayFilters,
  PendingTrayItem,
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
  // Phase 139 (D-07): movimientos inter-caja (cash_transfer) y egresos (expense)
  // no son deuda de socio — no llevan links de subscription/debt_balance, así que
  // applyDelta los ignora (no-op) y create() los acepta con links: [].
  "cash_transfer",
  "expense",
];

/**
 * Phase 137 (VAL-06 / T-137-13): the minimal slice of SubscriptionService that
 * void() needs to cancel a linked subscription inside its OWN tx. Declared as a
 * narrow interface (not the concrete class) to avoid a circular import —
 * SubscriptionService already depends on TransactionService, so the back-edge
 * is wired at runtime via setSubscriptionCanceller() (mirror of
 * SubscriptionService.setBookingService).
 *
 * `_cancelSubscription` runs against the caller's tx handle and, with
 * skipActiveChargesGuard=true, bypasses the SUB_HAS_ACTIVE_TRANSACTIONS guard
 * because the charge being voided is already soft-voided in that same tx.
 */
export interface SubscriptionCanceller {
  _cancelSubscription(
    tx: TxHandle,
    userId: number,
    actorId: number,
    notes: string | null | undefined,
    subscriptionId: number | undefined,
    opts: { skipActiveChargesGuard?: boolean },
  ): Promise<void>;
}

export class TransactionService {
  /**
   * Phase 137 (VAL-06): back-edge to SubscriptionService for the
   * void(keepMembershipActive=false) branch. Injected post-construction to
   * break the circular dependency (SubscriptionService → TransactionService).
   * When unset, void(keepMembershipActive=false) throws rather than silently
   * leaving the sub active (loud failure over silent data drift).
   */
  private subscriptionCanceller?: SubscriptionCanceller;

  /**
   * Phase 142 (D-05): the finance config house. Reads the pending-overdue
   * threshold from system_settings (fallback OVERDUE_DAYS) so listPendingTray's
   * isOverdue/thresholdDays are admin-configurable instead of a hard-coded
   * literal. Optional 5th DI param: when omitted, a default instance is built
   * from this.db/this.log — so the many existing TransactionService call sites
   * (auth/members/subscriptions/programs/jobs + tests) keep compiling and still
   * get a working config read. The finance plugin passes the shared instance
   * (the same one backing the GET/PUT config endpoints).
   */
  private readonly financeConfig: FinanceConfigService;

  constructor(
    private readonly db: DbInstance,
    private readonly log: FastifyBaseLogger,
    private readonly balanceService: BalanceService,
    private readonly cashRegisterService: CashRegisterService,
    financeConfig?: FinanceConfigService,
  ) {
    this.financeConfig = financeConfig ?? new FinanceConfigService(db, log);
  }

  /**
   * Wire the SubscriptionService back-edge used by
   * void(keepMembershipActive=false). Mirror of
   * SubscriptionService.setBookingService — avoids a circular constructor.
   */
  setSubscriptionCanceller(canceller: SubscriptionCanceller): void {
    this.subscriptionCanceller = canceller;
  }

  /**
   * Phase 146 (CAJA-01): expose the caja resolver (delegates verbatim to
   * cashRegisterService.resolveCashRegister) so a caller that already holds a
   * TransactionService — e.g. SubscriptionService.renewSubscription — can
   * pre-resolver la caja SUGERIDA desde la sede del profe sin DI extra. Same
   * choke-point used internally by create(); never sourced from a request body.
   */
  resolveCashRegister(
    paymentMethod: PaymentMethod,
    branchId: number | null,
    currency: string,
  ): Promise<number | null> {
    return this.cashRegisterService.resolveCashRegister(
      paymentMethod,
      branchId,
      currency,
    );
  }

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

      // 1b. Member exists. Phase 139 (D-06): a null memberId is valid for
      // cash_transfer/expense/movement rows (egreso/movimiento no tienen socio)
      // — skip the lookup entirely. Only null short-circuits; other kinds still
      // require a real member.
      if (input.memberId !== null) {
        const memberExists = await txHandle
          .select({ id: schema.users.id })
          .from(schema.users)
          .where(eq(schema.users.id, input.memberId))
          .limit(1);
        if (memberExists.length === 0) {
          throw new NotFoundError("Miembro no encontrado");
        }
      }

      // 1c. Branch exists. Phase 139 (extends D-06 to branch_id): a movimiento/
      // egreso to a branch-less central/banco caja has no sucursal — skip the
      // lookup when branchId is null. Only null short-circuits.
      if (input.branchId !== null) {
        const branchExists = await txHandle
          .select({ id: schema.branches.id })
          .from(schema.branches)
          .where(eq(schema.branches.id, input.branchId))
          .limit(1);
        if (branchExists.length === 0) {
          throw new NotFoundError("Sucursal no encontrada");
        }
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
          case "enrollment":
            // Phase 112 D-13: target_kind='enrollment' for admin add-on
            // financial transactions. target_id refers to program_enrollments.id.
            exists = await txHandle
              .select({ id: schema.programEnrollments.id })
              .from(schema.programEnrollments)
              .where(eq(schema.programEnrollments.id, link.targetId))
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

      // 1e. Phase 138 (CAJA-02 / D-01): resolve the caja SERVER-SIDE from the
      // paymentMethod. This is the single choke-point — running it here covers
      // ALL 9 create paths (REST, recordAssignmentCharge ×4, enrollment add-on,
      // correct() re-create) without editing any caller. The optional
      // input.cashRegisterId override is honored only for internal
      // pre-resolution (never sourced from the request body, D-03); `null` is a
      // valid override meaning "no caja". The resolver also enforces the
      // currency guard (D-09/CAJA-04) for the cash→efectivo branch.
      const cashRegisterId =
        input.cashRegisterId !== undefined
          ? input.cashRegisterId
          : await this.cashRegisterService.resolveCashRegister(
              input.paymentMethod,
              input.branchId,
              input.currency ?? "ARS",
            );

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
          cashRegisterId,
          // Phase 147 (EGR-02): centro de costo. NULL para los 10 create paths;
          // SOLO registerExpense lo setea (tras validar exists+active).
          costCenterId: input.costCenterId ?? null,
          recordedBy,
          notes: input.notes ?? null,
          // Phase 145 (COBRO-01): structured cobro-suelto reason. NULL for every
          // path except POST /coach-load/misc (the PoS dropdown Motivo). Stored
          // as its own column — NEVER folded into `notes`.
          miscReason: input.miscReason ?? null,
          // Phase 137 (VAL-02): birth validation status. Defaults to 'validado'
          // (matches the column DEFAULT) when undefined — so the 4 internal
          // recordAssignmentCharge callers (admin path) keep producing validado
          // without edits. 'pendiente' arrives ONLY from the server-side
          // role→status derivation (coach loads). NOTE: applyDelta below runs
          // REGARDLESS of this value — a PENDIENTE still settles the member's
          // balance (D-09); only the read-side firm-money filter excludes it.
          validationStatus: input.validationStatus ?? "validado",
          // Phase 140 (CARGA-02 / D-09): persist the client-generated idempotency
          // ticket key. NULL for every admin/historical path (multiple NULLs are
          // allowed under the UNIQUE index); a duplicate non-null key raises
          // ER_DUP_ENTRY at the DB, caught endpoint-side in Wave 2 (Pitfall 3).
          idempotencyKey: input.idempotencyKey ?? null,
          // Phase 148 (ALTA-06 / W-1): persist the new-student id IN THE SAME
          // insert as the charge (within the caller's tx when `tx` is passed),
          // so void's cascade (148-03) can find the member to inactivate without
          // a crash window. NULL for every admin/historical path.
          createdMemberId: input.createdMemberId ?? null,
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
   * Void a previously-created transaction. Public entry point: opens its own
   * db.transaction and delegates to _void(tx, ...) so the soft-void + balance
   * rollback + audit row + (optional) subscription cancellation are atomic.
   * Throws if the transaction does not exist or has already been voided.
   *
   * Phase 137 (VAL-06 / D-10): `input.keepMembershipActive` (default true).
   * When false, the linked subscription is cancelled inside the same tx.
   */
  async void(
    id: number,
    voidedBy: number,
    input: VoidTransactionInput,
  ): Promise<TransactionDetail> {
    return await this.db.transaction(async (tx) => {
      await this._void(tx, id, voidedBy, input);

      const linkRows = await tx
        .select()
        .from(schema.transactionLinks)
        .where(eq(schema.transactionLinks.transactionId, id));
      const [updatedRow] = await tx
        .select()
        .from(schema.financialTransactions)
        .where(eq(schema.financialTransactions.id, id));

      return { ...updatedRow, links: linkRows };
    });
  }

  /**
   * Phase 139 (D-08 / MOV-04): void N transactions ATOMICALLY in one
   * db.transaction. A movimiento inter-caja is a 2-row asiento (+ an optional
   * reconciliation adjustment row); voiding it must anular ALL its rows together
   * so the net-0 invariant never half-breaks (Pitfall 3). MovementService (Plan
   * 03) passes both leg ids here; an egreso uses the single-row void() instead.
   *
   * Wraps the private _void(tx, ...) per id in order — keeps _void private
   * (research Access note option a). Rejects an empty ids[] with BadRequestError.
   * Each _void enforces the not-already-voided + reason-required guards, so a
   * second void of the same id (or an empty reason) rolls the whole pair back.
   */
  async voidPair(
    ids: number[],
    voidedBy: number,
    input: VoidTransactionInput,
  ): Promise<void> {
    if (ids.length === 0) {
      throw new BadRequestError(
        "voidPair requiere al menos un id de transaccion",
      );
    }
    await this.db.transaction(async (tx) => {
      for (const id of ids) {
        await this._void(tx, id, voidedBy, input);
      }
    });
  }

  /**
   * Phase 146 (plan 03 primitive): anular una fila DENTRO de la transaccion del
   * caller (no abre db.transaction propia). Espejo de como correct() usa _void,
   * pero expuesto para un caller externo — subscriptions.assignPlan (plan 03)
   * anula el anticipo y crea el cobro del plan en una sola db.transaction, asi
   * que el void debe correr en ESE mismo tx para que todo commitee/rollee junto.
   *
   * Delega en el primitivo privado _void (que mantiene los guards de
   * not-already-voided + reason-required + el rollback de balance + audit row).
   */
  async voidInTx(
    tx: TxHandle,
    id: number,
    voidedBy: number,
    input: VoidTransactionInput,
  ): Promise<void> {
    await this._void(tx, id, voidedBy, input);
  }

  /**
   * Phase 137 (Pitfall 3): atomic soft-void primitive that operates against
   * the CALLER's tx handle (mirror of create(tx?)). The public void() wraps it
   * in this.db.transaction; correct() calls it inside its own tx so the
   * void+recreate pair commits/rolls back together.
   *
   * `statusOverride='corregido'` ALSO sets validation_status='corregido' on the
   * voided row — distinguishing a void-for-correction from a void-for-refund
   * (D-05). When omitted, validation_status is left untouched (a plain anular).
   *
   * `input.keepMembershipActive=false` (VAL-06 / T-137-13): after the charge is
   * soft-voided, cancel the linked subscription via SubscriptionCanceller in
   * THIS same tx, skipping the active-charges guard (the charge is already
   * soft-voided here). Default true leaves the sub untouched.
   */
  private async _void(
    tx: TxHandle,
    id: number,
    voidedBy: number,
    input: VoidTransactionInput,
    statusOverride?: "corregido",
  ): Promise<void> {
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
        // D-05: mark void-for-correction distinctly. A plain anular leaves
        // validation_status as-is (orthogonal axis untouched).
        ...(statusOverride ? { validationStatus: statusOverride } : {}),
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

    // VAL-06 / D-10: optionally cancel the linked subscription. Only the
    // explicit keepMembershipActive=false triggers this — default true (and
    // undefined) leaves the sub active. Runs in THIS tx so the cancel rolls
    // back together with the soft-void if anything later throws.
    if (input.keepMembershipActive === false) {
      const subLink = linkRows.find((l) => l.targetKind === "subscription");
      if (subLink) {
        if (!this.subscriptionCanceller) {
          throw new Error(
            "SubscriptionCanceller no inyectado — setSubscriptionCanceller() falta (phase 137)",
          );
        }
        // Phase 139: a row linked to a subscription always has a real member
        // (cash_transfer/expense carry no subscription link), so memberId is
        // non-null here. Narrow explicitly to satisfy tsc under number | null.
        if (existing.memberId === null) {
          throw new BadRequestError(
            "No se puede cancelar la suscripcion de una transaccion sin socio",
          );
        }
        await this.subscriptionCanceller._cancelSubscription(
          tx,
          existing.memberId,
          voidedBy,
          `Cancelacion por anulacion de cobro #${id}`,
          subLink.targetId,
          { skipActiveChargesGuard: true },
        );
      }
    }

    // ALTA-06 (Phase 148 / T-148-11..14): cascade for a charge that CREATED a
    // new member. When this charge was the one that brought the alumno into
    // existence (createdMemberId set — only the PoS profe alta flow sets it, W-1
    // in 148-01), voiding it must ALSO deactivate that alumno: flip
    // status → 'inactivo' and record the transition in userStatusHistory. The
    // membership itself was already cancelled by the SubscriptionCanceller branch
    // above (the alta is voided with keepMembershipActive=false). The alumno is
    // NEVER deleted (FK safety — CONTEXT L48-50); it stays as an inactivo/lead.
    // For PREEXISTING members (createdMemberId null) this is a no-op — the void
    // behaves exactly as before. Runs in THIS tx so the flip rolls back together
    // with the soft-void + sub cancel if anything later throws (T-148-14).
    if (existing.createdMemberId !== null) {
      // Read the alumno's status BEFORE the flip so the history row records the
      // real fromStatus (mirror of members/routes.ts L847-869 read-before /
      // write-after pattern).
      const [createdMember] = await tx
        .select({ status: schema.users.status })
        .from(schema.users)
        .where(eq(schema.users.id, existing.createdMemberId));
      if (createdMember) {
        await tx
          .update(schema.users)
          .set({ status: "inactivo" })
          .where(eq(schema.users.id, existing.createdMemberId));
        // Dedupe on from==to (mirror L854): only write history when the status
        // actually changed, so a re-void / already-inactivo alumno does not
        // accumulate duplicate transition rows (T-148-12 — traza sin ruido).
        if (createdMember.status !== "inactivo") {
          await tx.insert(schema.userStatusHistory).values({
            userId: existing.createdMemberId,
            fromStatus: createdMember.status,
            toStatus: "inactivo",
            source: "admin",
          });
          this.log.info(
            {
              userId: existing.createdMemberId,
              fromStatus: createdMember.status,
              toStatus: "inactivo",
              voidedTransactionId: id,
            },
            "alta-created member deactivated on charge void (ALTA-06 cascade)",
          );
        }
      }
    }

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
        statusOverride: statusOverride ?? null,
        keepMembershipActive: input.keepMembershipActive ?? true,
        links: linkRows.map((l) => ({
          targetKind: l.targetKind,
          targetId: l.targetId,
          allocatedAmount: l.allocatedAmount,
        })),
      },
      reason: input.reason,
    });

    this.log.info(
      {
        transactionId: id,
        voidedBy,
        reason: input.reason,
        statusOverride: statusOverride ?? null,
        keepMembershipActive: input.keepMembershipActive ?? true,
      },
      "Financial transaction voided",
    );
  }

  /**
   * Phase 137 (VAL-03): transition a pendiente charge → validado. The money
   * becomes firm (the canonical firm-money read filter now counts it). Writes a
   * forensic audit row (transaction_validated) atomic with the status update.
   *
   * Phase 146 (CAJA-02/CAJA-03 + COBRO-05): gestion confirma o CAMBIA la caja
   * imputada al validar. Cuando `cashRegisterId` llega en el body de la route,
   * la caja debe existir, estar activa y compartir moneda con la transaccion
   * (espejo del guard del resolver, D-09); luego se persiste en la fila. Sin
   * `cashRegisterId` la columna NO se toca (retrocompatible: conserva la caja
   * sugerida). Ademas, un cobro suelto miscReason='sin_plan' NO se valida a mano
   * (COBRO-05): se imputa al asignar un plan — guard de integridad server-side.
   *
   * Throws NotFoundError if absent, BadRequestError if already voided, not in
   * 'pendiente', miscReason='sin_plan', or the caja elegida es invalida.
   */
  async validate(
    id: number,
    adminId: number,
    cashRegisterId?: number,
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
        throw new BadRequestError("La transaccion fue anulada");
      }
      if (existing.validationStatus !== "pendiente") {
        throw new BadRequestError(
          "Solo se puede validar una transaccion pendiente",
        );
      }

      // COBRO-05 (T-146-06): un cobro suelto "sin plan" no se valida a mano —
      // se imputa al asignar un plan al socio (plan 03). Guard server-side, no
      // solo de UI.
      if (existing.miscReason === "sin_plan") {
        throw new BadRequestError(
          "Los cobros sin plan se imputan al asignar un plan, no se validan a mano",
        );
      }

      // CAJA-02/CAJA-03 (T-146-05): si gestion eligio una caja, validar
      // coherencia (existe + activa + misma moneda que la tx) — espejo del guard
      // del resolver (D-09). Si no llega cashRegisterId, conservar la sugerida.
      if (cashRegisterId !== undefined) {
        const [caja] = await tx
          .select({
            id: schema.cashRegisters.id,
            currency: schema.cashRegisters.currency,
            isActive: schema.cashRegisters.isActive,
          })
          .from(schema.cashRegisters)
          .where(eq(schema.cashRegisters.id, cashRegisterId))
          .limit(1);
        if (!caja || !caja.isActive) {
          throw new BadRequestError(
            "La caja elegida no existe o esta inactiva",
          );
        }
        if (caja.currency !== existing.currency) {
          throw new BadRequestError(
            `Moneda inconsistente: la caja es ${caja.currency}, la transaccion es ${existing.currency}`,
          );
        }
      }

      await tx
        .update(schema.financialTransactions)
        .set({
          validationStatus: "validado",
          // Solo tocar la columna cuando gestion confirma/cambia la caja; sin
          // cashRegisterId la fila conserva su caja sugerida actual.
          ...(cashRegisterId !== undefined ? { cashRegisterId } : {}),
        })
        .where(eq(schema.financialTransactions.id, id));

      // Caja final imputada: la elegida por gestion, o la conservada (sugerida).
      const finalCashRegisterId =
        cashRegisterId !== undefined ? cashRegisterId : existing.cashRegisterId;

      await auditLog.write(tx, {
        actorId: adminId,
        action: "transaction_validated",
        targetKind: "transaction",
        targetId: id,
        payload: {
          txId: id,
          amount: existing.amount,
          currency: existing.currency,
          from: "pendiente",
          to: "validado",
          cashRegisterId: finalCashRegisterId,
        },
      });

      this.log.info(
        { transactionId: id, adminId, cashRegisterId: finalCashRegisterId },
        "Financial transaction validated",
      );

      const [updatedRow] = await tx
        .select()
        .from(schema.financialTransactions)
        .where(eq(schema.financialTransactions.id, id));
      const linkRows = await tx
        .select()
        .from(schema.transactionLinks)
        .where(eq(schema.transactionLinks.transactionId, id));
      return { ...updatedRow, links: linkRows };
    });
  }

  /**
   * Phase 137 (VAL-04 / D-04): transition a pendiente charge → observado (a
   * problem flagged, not yet corrected — e.g. the admin needs to ask the coach
   * for the right datum). Requires a reason. Writes transaction_observed audit.
   *
   * Throws if absent, voided, or not in 'pendiente'.
   */
  async observe(
    id: number,
    adminId: number,
    input: ObserveTransactionInput,
  ): Promise<TransactionDetail> {
    return await this.db.transaction(async (tx) => {
      if (!input.reason || input.reason.trim().length === 0) {
        throw new BadRequestError("Razon de observacion requerida");
      }
      const [existing] = await tx
        .select()
        .from(schema.financialTransactions)
        .where(eq(schema.financialTransactions.id, id));
      if (!existing) {
        throw new NotFoundError("Transaccion no encontrada");
      }
      if (existing.voidedAt !== null) {
        throw new BadRequestError("La transaccion fue anulada");
      }
      if (existing.validationStatus !== "pendiente") {
        throw new BadRequestError(
          "Solo se puede observar una transaccion pendiente",
        );
      }

      await tx
        .update(schema.financialTransactions)
        .set({ validationStatus: "observado" })
        .where(eq(schema.financialTransactions.id, id));

      await auditLog.write(tx, {
        actorId: adminId,
        action: "transaction_observed",
        targetKind: "transaction",
        targetId: id,
        payload: {
          txId: id,
          amount: existing.amount,
          currency: existing.currency,
          from: "pendiente",
          to: "observado",
        },
        reason: input.reason,
      });

      this.log.info(
        { transactionId: id, adminId, reason: input.reason },
        "Financial transaction observed",
      );

      const [updatedRow] = await tx
        .select()
        .from(schema.financialTransactions)
        .where(eq(schema.financialTransactions.id, id));
      const linkRows = await tx
        .select()
        .from(schema.transactionLinks)
        .where(eq(schema.transactionLinks.transactionId, id));
      return { ...updatedRow, links: linkRows };
    });
  }

  /**
   * Phase 137 (VAL-04 / D-05): correct a mis-loaded charge by ANULAR + RECREAR
   * (never UPDATE — ledger immutability). In ONE db.transaction:
   *   1. _void the original (validation_status='corregido' + voided_at set).
   *   2. create() a NEW row born 'validado' (admin author), copying every field
   *      from the original except the `correctedFields` overrides + carrying
   *      over the original's links.
   *   3. INSERT a transaction_links row linking new → original
   *      (target_kind='transaction') so the trail shows the replacement.
   *   4. auditLog.write transaction_corrected.
   *
   * Atomic: if the create fails, the void never commits (no orphan voided row).
   * `correctedFields` may change ONLY amount / memberId / paymentMethod.
   */
  async correct(
    originalId: number,
    correctedFields: Partial<
      Pick<CreateTransactionInput, "amount" | "memberId" | "paymentMethod">
    >,
    adminId: number,
  ): Promise<TransactionDetail> {
    return await this.db.transaction(async (tx) => {
      const [original] = await tx
        .select()
        .from(schema.financialTransactions)
        .where(eq(schema.financialTransactions.id, originalId));
      if (!original) {
        throw new NotFoundError("Transaccion no encontrada");
      }
      if (original.voidedAt !== null) {
        throw new BadRequestError(
          "No se puede corregir una transaccion ya anulada",
        );
      }

      // Carry over the original's links so the recreated charge keeps the same
      // allocations (e.g. its subscription link). Amount overrides re-balance
      // the single-link case; multi-link corrections are out of scope (the
      // typical correctable error is amount/member/method, not allocations).
      const originalLinks = await tx
        .select()
        .from(schema.transactionLinks)
        .where(eq(schema.transactionLinks.transactionId, originalId));

      // 1. Void the original, marking it 'corregido' (void-for-correction).
      await this._void(
        tx,
        originalId,
        adminId,
        { reason: "Correccion de transaccion" },
        "corregido",
      );

      // 2. Build the new input: copy from the original, apply overrides. When
      // amount changes and there is exactly ONE link, re-point its
      // allocatedAmount to the new amount so TXN-06 (Σalloc === amount) holds.
      const newAmount = correctedFields.amount ?? original.amount;
      const newLinks =
        originalLinks.length === 1
          ? [
              {
                targetKind: originalLinks[0].targetKind,
                targetId: originalLinks[0].targetId,
                allocatedAmount:
                  correctedFields.amount !== undefined
                    ? newAmount
                    : originalLinks[0].allocatedAmount,
              },
            ]
          : originalLinks.map((l) => ({
              targetKind: l.targetKind,
              targetId: l.targetId,
              allocatedAmount: l.allocatedAmount,
            }));

      const newInput: CreateTransactionInput = {
        memberId: correctedFields.memberId ?? original.memberId,
        kind: original.kind,
        direction: original.direction,
        amount: newAmount,
        currency: original.currency,
        paymentMethod: correctedFields.paymentMethod ?? original.paymentMethod,
        transactionDate: original.transactionDate,
        effectiveDate: original.effectiveDate,
        branchId: original.branchId,
        notes: original.notes,
        validationStatus: "validado",
        links: newLinks,
      };

      // 3. Create the replacement in the SAME tx (born 'validado').
      const created = await this.create(newInput, adminId, tx);

      // 4. Link the new tx → original (target_kind='transaction') for the
      // trail. allocatedAmount 0: this is a provenance link, not a money
      // allocation (applyDelta ignores target_kind='transaction' links).
      await tx.insert(schema.transactionLinks).values({
        transactionId: created.id,
        targetKind: "transaction",
        targetId: originalId,
        allocatedAmount: 0,
      });

      // 5. Forensic audit row for the correction.
      await auditLog.write(tx, {
        actorId: adminId,
        action: "transaction_corrected",
        targetKind: "transaction",
        targetId: originalId,
        payload: {
          originalTxId: originalId,
          newTxId: created.id,
          correctedFields,
          originalAmount: original.amount,
          newAmount,
        },
        reason: "Correccion de transaccion",
      });

      this.log.info(
        { originalTxId: originalId, newTxId: created.id, adminId },
        "Financial transaction corrected (void + recreate)",
      );

      // Re-read the new row with its full link set (including the provenance
      // link inserted above) for the returned detail.
      const finalLinks = await tx
        .select()
        .from(schema.transactionLinks)
        .where(eq(schema.transactionLinks.transactionId, created.id));
      return { ...created, links: finalLinks };
    });
  }

  // ─── Read methods ─────────────────────────────────────────────────────────

  /**
   * Phase 140 (CARGA-02 / D-09 / Pitfall 3): re-read an existing transaction by
   * its idempotency key on a FRESH connection (this.db, never an aborted tx).
   * The coach load endpoints call this AFTER catching an ER_DUP_ENTRY so a
   * double-tap/retry returns the original charge instead of a duplicate or a
   * 500. Returns null when no row carries the key (the caller then rethrows).
   */
  async findByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<TransactionDetail | null> {
    const [row] = await this.db
      .select()
      .from(schema.financialTransactions)
      .where(eq(schema.financialTransactions.idempotencyKey, idempotencyKey))
      .limit(1);
    if (!row) return null;
    const links = await this.db
      .select()
      .from(schema.transactionLinks)
      .where(eq(schema.transactionLinks.transactionId, row.id));
    return { ...row, links };
  }

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

  /**
   * Phase 146 (plan 03 primitive): cobros sueltos (advance_payment) PENDIENTES,
   * no anulados, de un socio — ordenados por fecha asc. Los consume el
   * AssignPlanDialog (plan 03) para ofrecer imputar un anticipo al asignar un
   * plan, y el endpoint GET /transactions/pending-misc/:memberId. NO incluye
   * validados/anulados ni otros kinds.
   */
  async listPendingMiscForMember(memberId: number): Promise<PendingMiscItem[]> {
    const rows = await this.db
      .select({
        id: schema.financialTransactions.id,
        amount: schema.financialTransactions.amount,
        currency: schema.financialTransactions.currency,
        paymentMethod: schema.financialTransactions.paymentMethod,
        cashRegisterId: schema.financialTransactions.cashRegisterId,
        miscReason: schema.financialTransactions.miscReason,
        transactionDate: schema.financialTransactions.transactionDate,
        notes: schema.financialTransactions.notes,
      })
      .from(schema.financialTransactions)
      .where(
        and(
          eq(schema.financialTransactions.memberId, memberId),
          eq(schema.financialTransactions.kind, "advance_payment"),
          eq(schema.financialTransactions.validationStatus, "pendiente"),
          isNull(schema.financialTransactions.voidedAt),
        ),
      )
      .orderBy(asc(schema.financialTransactions.transactionDate));

    return rows.map((r) => ({
      id: r.id,
      amount: r.amount,
      currency: r.currency,
      paymentMethod: r.paymentMethod,
      cashRegisterId: r.cashRegisterId,
      miscReason: r.miscReason,
      transactionDate: String(r.transactionDate),
      notes: r.notes,
    }));
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

  /**
   * Phase 141 (REP-01): bandeja de pendientes. Its OWN query — does NOT call or
   * mutate list()/exportRowsForExcel() (those are the member-keyed INNER-JOIN
   * paths). Returns pendiente+observado rows OLDEST-FIRST (the opposite of
   * list()'s desc), each with TS-computed ageInDays (clamp ≥0, mirror of
   * getOutstandingConcepts) + isOverdue (ageInDays > OVERDUE_DAYS) + the
   * recorder ("cargado por") and caja name. thresholdDays is echoed back so 142
   * can swap OVERDUE_DAYS for a finance_settings read without touching the UI.
   *
   * LEFT JOINs users/branches/cash_registers + the recorder self-join
   * (defensive/consistency — a pendiente cobro always has a member today, but
   * LEFT keeps the row even if a future kind drops member_id). Voided rows are
   * excluded (isNull(voidedAt)).
   */
  async listPendingTray(
    filters: PendingTrayFilters,
  ): Promise<PaginatedResult<PendingTrayItem> & { thresholdDays: number }> {
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(200, Math.max(1, filters.limit ?? 50));
    const offset = (page - 1) * limit;

    const recorder = alias(schema.users, "recorder");

    // status → validation_status condition. 'todos'/undefined → IN(both).
    let statusCond: SQL;
    if (filters.status === "pendientes") {
      statusCond = eq(
        schema.financialTransactions.validationStatus,
        "pendiente",
      );
    } else if (filters.status === "observados") {
      statusCond = eq(
        schema.financialTransactions.validationStatus,
        "observado",
      );
    } else {
      statusCond = inArray(schema.financialTransactions.validationStatus, [
        "pendiente",
        "observado",
      ]);
    }

    const conditions: SQL[] = [
      statusCond,
      isNull(schema.financialTransactions.voidedAt),
    ];
    if (filters.branchId !== undefined) {
      conditions.push(
        eq(schema.financialTransactions.branchId, filters.branchId),
      );
    }
    if (filters.country !== undefined) {
      conditions.push(eq(schema.branches.country, filters.country));
    }
    if (filters.dateFrom !== undefined) {
      conditions.push(
        gte(schema.financialTransactions.transactionDate, filters.dateFrom),
      );
    }
    if (filters.dateTo !== undefined) {
      conditions.push(
        lte(schema.financialTransactions.transactionDate, filters.dateTo),
      );
    }

    const [countRow] = await this.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(schema.financialTransactions)
      .leftJoin(
        schema.users,
        eq(schema.users.id, schema.financialTransactions.memberId),
      )
      .leftJoin(
        schema.branches,
        eq(schema.branches.id, schema.financialTransactions.branchId),
      )
      .leftJoin(
        schema.cashRegisters,
        eq(
          schema.cashRegisters.id,
          schema.financialTransactions.cashRegisterId,
        ),
      )
      .leftJoin(
        recorder,
        eq(recorder.id, schema.financialTransactions.recordedBy),
      )
      .where(and(...conditions));
    const total = Number(countRow?.count ?? 0);

    const raw = await this.db
      .select({
        id: schema.financialTransactions.id,
        transactionDate: schema.financialTransactions.transactionDate,
        memberId: schema.financialTransactions.memberId,
        memberFirstName: schema.users.firstName,
        memberLastName: schema.users.lastName,
        amount: schema.financialTransactions.amount,
        currency: schema.financialTransactions.currency,
        paymentMethod: schema.financialTransactions.paymentMethod,
        cashRegisterId: schema.financialTransactions.cashRegisterId,
        cashRegisterName: schema.cashRegisters.name,
        recordedBy: schema.financialTransactions.recordedBy,
        recorderFirstName: recorder.firstName,
        recorderLastName: recorder.lastName,
        validationStatus: schema.financialTransactions.validationStatus,
        miscReason: schema.financialTransactions.miscReason,
      })
      .from(schema.financialTransactions)
      .leftJoin(
        schema.users,
        eq(schema.users.id, schema.financialTransactions.memberId),
      )
      .leftJoin(
        schema.branches,
        eq(schema.branches.id, schema.financialTransactions.branchId),
      )
      .leftJoin(
        schema.cashRegisters,
        eq(
          schema.cashRegisters.id,
          schema.financialTransactions.cashRegisterId,
        ),
      )
      .leftJoin(
        recorder,
        eq(recorder.id, schema.financialTransactions.recordedBy),
      )
      .where(and(...conditions))
      // REP-01 / D-02: OLDEST-FIRST (opposite of list()'s desc).
      .orderBy(
        asc(schema.financialTransactions.transactionDate),
        asc(schema.financialTransactions.createdAt),
      )
      .limit(limit)
      .offset(offset);

    // ageInDays in TS — clamp ≥0, mirror of getOutstandingConcepts (avoid TZ/SQL
    // drift). isOverdue = ageInDays > threshold. Phase 142 (D-05): the threshold
    // is read ONCE here from system_settings (fallback OVERDUE_DAYS) and used in
    // BOTH seam sites below (isOverdue + the echoed thresholdDays) so the counter
    // and badge agree.
    const threshold = await this.financeConfig.getOverdueThreshold();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const MS_PER_DAY = 1000 * 60 * 60 * 24;

    const rows: PendingTrayItem[] = raw.map((r) => {
      const txDate = new Date(String(r.transactionDate) + "T00:00:00");
      const ageInDays = Math.max(
        0,
        Math.floor((today.getTime() - txDate.getTime()) / MS_PER_DAY),
      );
      return {
        id: r.id,
        transactionDate: String(r.transactionDate),
        memberId: r.memberId,
        memberName:
          `${r.memberFirstName ?? ""} ${r.memberLastName ?? ""}`.trim(),
        amount: r.amount,
        currency: r.currency,
        paymentMethod: r.paymentMethod,
        cashRegisterId: r.cashRegisterId,
        cashRegisterName: r.cashRegisterName ?? "",
        recordedBy: r.recordedBy,
        recorderName:
          `${r.recorderFirstName ?? ""} ${r.recorderLastName ?? ""}`.trim(),
        validationStatus: r.validationStatus,
        ageInDays,
        isOverdue: ageInDays > threshold,
        miscReason: r.miscReason,
      };
    });

    return { rows, total, page, limit, thresholdDays: threshold };
  }

  /**
   * Phase 141 (REP-03) → Phase 146 (ARQUEO-01/02): **arqueo por caja**. Its OWN
   * query — does NOT call or mutate list()/exportRowsForExcel() (those INNER JOIN
   * users+branches, the member-keyed "Transacciones" view — ARQUEO-04 keeps that
   * criterion untouched). ARQUEO-01: ya NO filtra por kind; dada una caja
   * devuelve TODO lo imputado a ella (cobros de socio plan_charge/debt_settlement/
   * advance_payment/refund + egresos expense + traspasos cash_transfer + ajustes
   * adjustment). Las filas sin socio (egresos/traspasos) tienen member_id NULL — y
   * a menudo branch_id NULL para central/banco — así que listMovEgresos LEFT JOINs
   * users/branches/cash_registers + the recorder self-join so those rows SURVIVE
   * (the 139 flag). ARQUEO-02: cada fila trae validationStatus (pendientes y
   * validadas, sin filtrar por estado). Returns the trail ordered
   * desc(transactionDate), filterable by caja/período.
   *
   * Country-scope trap (Pitfall 2): under the LEFT JOIN a branch-less row has
   * branches.country = NULL, so eq(branches.country, country) would WRONGLY
   * exclude central/banco rows. Instead we scope NON-OWNERS to the set of cajas
   * whose branch.country === scope.country (a sub-select) — which inherently
   * excludes branch-less central/banco cajas (owner-only, mirror enforceCajaScope).
   * Owner sees all rows; an optional ?country narrows to that country's cajas.
   */
  async listMovEgresos(
    filters: MovEgresoFilters,
  ): Promise<PaginatedResult<MovEgresoItem>> {
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(200, Math.max(1, filters.limit ?? 50));
    const offset = (page - 1) * limit;

    const recorder = alias(schema.users, "recorder");

    // Phase 146 (ARQUEO-01): el arqueo es POR CAJA, no por kind. Ya NO se filtra
    // kind IN ('cash_transfer','expense','adjustment') — eso dropeaba los cobros
    // de socio (plan_charge/debt_settlement/advance_payment/refund) imputados a
    // la caja. El filtro primario es cash_register_id (filters.cashRegisterId).
    const conditions: SQL[] = [];

    if (filters.cashRegisterId !== undefined) {
      conditions.push(
        eq(schema.financialTransactions.cashRegisterId, filters.cashRegisterId),
      );
    }
    if (filters.dateFrom !== undefined) {
      conditions.push(
        gte(schema.financialTransactions.transactionDate, filters.dateFrom),
      );
    }
    if (filters.dateTo !== undefined) {
      conditions.push(
        lte(schema.financialTransactions.transactionDate, filters.dateTo),
      );
    }

    // Country scope WITHOUT the eq(branches.country) NULL-branch trap. Restrict
    // to the cajas whose branch.country matches, via a sub-select on cajas.
    // - non-owner: ALWAYS scoped to their country's BRANCH-SCOPED cajas; this
    //   sub-select never matches branch-less cajas (their branch.country is NULL
    //   under the LEFT JOIN), so central/banco rows are owner-only.
    // - owner + ?country: optional narrowing to that country's branch cajas.
    // - owner + no country: no scope condition (sees all rows, incl. branch-less).
    if (filters.country !== undefined) {
      const scopedCajas = this.db
        .select({ id: schema.cashRegisters.id })
        .from(schema.cashRegisters)
        .innerJoin(
          schema.branches,
          eq(schema.branches.id, schema.cashRegisters.branchId),
        )
        .where(eq(schema.branches.country, filters.country));
      conditions.push(
        inArray(schema.financialTransactions.cashRegisterId, scopedCajas),
      );
    } else if (!filters.isOwner) {
      // Defense-in-depth: a non-owner MUST be country-scoped. If their country
      // is somehow unresolved, return zero rows rather than the full ledger.
      conditions.push(sql`1 = 0`);
    }

    const [countRow] = await this.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(schema.financialTransactions)
      .leftJoin(
        schema.users,
        eq(schema.users.id, schema.financialTransactions.memberId),
      )
      .leftJoin(
        schema.branches,
        eq(schema.branches.id, schema.financialTransactions.branchId),
      )
      .leftJoin(
        schema.cashRegisters,
        eq(
          schema.cashRegisters.id,
          schema.financialTransactions.cashRegisterId,
        ),
      )
      .leftJoin(
        recorder,
        eq(recorder.id, schema.financialTransactions.recordedBy),
      )
      .where(and(...conditions));
    const total = Number(countRow?.count ?? 0);

    const raw = await this.db
      .select({
        id: schema.financialTransactions.id,
        transactionDate: schema.financialTransactions.transactionDate,
        kind: schema.financialTransactions.kind,
        direction: schema.financialTransactions.direction,
        amount: schema.financialTransactions.amount,
        currency: schema.financialTransactions.currency,
        memberId: schema.financialTransactions.memberId,
        cashRegisterId: schema.financialTransactions.cashRegisterId,
        cashRegisterName: schema.cashRegisters.name,
        branchId: schema.financialTransactions.branchId,
        branchName: schema.branches.name,
        recordedBy: schema.financialTransactions.recordedBy,
        recorderFirstName: recorder.firstName,
        recorderLastName: recorder.lastName,
        validationStatus: schema.financialTransactions.validationStatus,
        voidedAt: schema.financialTransactions.voidedAt,
        voidReason: schema.financialTransactions.voidReason,
        notes: schema.financialTransactions.notes,
        // Phase 147 (EGR-03): nombre del centro de costo (solo filas expense).
        costCenterName: schema.costCenters.name,
      })
      .from(schema.financialTransactions)
      .leftJoin(
        schema.users,
        eq(schema.users.id, schema.financialTransactions.memberId),
      )
      .leftJoin(
        schema.branches,
        eq(schema.branches.id, schema.financialTransactions.branchId),
      )
      .leftJoin(
        schema.cashRegisters,
        eq(
          schema.cashRegisters.id,
          schema.financialTransactions.cashRegisterId,
        ),
      )
      .leftJoin(
        schema.costCenters,
        eq(schema.costCenters.id, schema.financialTransactions.costCenterId),
      )
      .leftJoin(
        recorder,
        eq(recorder.id, schema.financialTransactions.recordedBy),
      )
      .where(and(...conditions))
      .orderBy(
        desc(schema.financialTransactions.transactionDate),
        desc(schema.financialTransactions.createdAt),
      )
      .limit(limit)
      .offset(offset);

    const rows: MovEgresoItem[] = raw.map((r) => ({
      id: r.id,
      transactionDate: String(r.transactionDate),
      kind: r.kind,
      direction: r.direction,
      amount: r.amount,
      currency: r.currency,
      memberId: r.memberId ?? null,
      cashRegisterId: r.cashRegisterId,
      cashRegisterName: r.cashRegisterName ?? "",
      branchId: r.branchId,
      branchName: r.branchName ?? null,
      recordedBy: r.recordedBy,
      recorderName:
        `${r.recorderFirstName ?? ""} ${r.recorderLastName ?? ""}`.trim(),
      validationStatus: r.validationStatus,
      voidedAt: r.voidedAt ? r.voidedAt.toISOString() : null,
      voidReason: r.voidReason,
      notes: r.notes,
      costCenterName: r.costCenterName ?? null,
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
    // Phase 140 (D-07): own-loads scope for the coach mis-cargas read. The
    // route forces this to the authenticated coach id (never from the query).
    if (filters.recordedBy !== undefined) {
      conds.push(
        eq(schema.financialTransactions.recordedBy, filters.recordedBy),
      );
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
      // Firm-money axis (not voided AND validated). Phase 137 (VAL-05): a
      // PENDIENTE must NOT count as firm cash. Sourced from the canonical helper.
      ...firmMoneyConditions(),
      // Phase 139 (MUST-FIX A / T-139-01): a cash_transfer INFLOW leg (destino of
      // a movimiento) is direction='inflow' + validado + has a branchId, so it
      // would MATCH and inflate monthlyRevenue + add a 'cash_transfer' key to the
      // fixed revenueByKind record. Exclude both non-revenue kinds here so all 4
      // summaries (monthlyRevenue/byMethod/byBranch/byKind) stay member-revenue-
      // only. (expense is outflow → already excluded by direction; listed for intent.)
      notInArray(schema.financialTransactions.kind, [
        "cash_transfer",
        "expense",
      ]),
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
    // Phase 139: financial_transactions.branchId is nullable now, but the INNER
    // JOIN branches above drops NULL-branch rows (a movimiento/egreso branch-less
    // row never reaches here — also excluded by the kind filter in conds[]).
    // flatMap-filter the null to keep branchId: number for the response shape.
    const revenueByBranch = branchRows.flatMap((r) =>
      r.branchId === null
        ? []
        : [
            {
              branchId: r.branchId,
              branchName: r.branchName,
              revenue: Number(r.total),
            },
          ],
    );

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
    // Phase 139: cash_transfer + expense are now in TransactionKind, so the
    // fixed record needs all 7 keys. Both stay 0 by design — the conds[]
    // exclusion (MUST-FIX A) guarantees no cash_transfer/expense row ever
    // reaches this aggregation, mirroring how refund is always 0 here.
    const revenueByKind: RevenueByKind = {
      plan_charge: 0,
      debt_settlement: 0,
      refund: 0,
      adjustment: 0,
      advance_payment: 0,
      cash_transfer: 0,
      expense: 0,
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
