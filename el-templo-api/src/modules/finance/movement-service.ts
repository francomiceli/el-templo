// Module: finance — phase 139 (movimientos inter-caja + egresos)
//
// MovementService is the facade (precedent: edit-service.ts domain facades)
// that composes the 137/138 primitives into the two genuinely-new phase-139
// operations:
//
//   - registerMovement (MOV-01/MOV-02): a movimiento inter-caja = asiento de
//     doble entrada (DOS filas kind='cash_transfer' — outflow en origen +
//     inflow en destino), linkeadas vía transaction_links (target_kind=
//     'transaction'), en UNA db.transaction, neto sistema 0 (D-01). Solo entre
//     cajas de igual moneda (guard D-03). Captura esperado-vs-contado (D-04):
//     cuando counted != expected, materializa una fila kind='adjustment' en
//     origen que corrige su saldo a lo contado + un audit 'reconciliation'.
//
//   - registerExpense (MOV-03): un egreso = 1 fila kind='expense', outflow,
//     que resta del saldo de su caja. memberId null, sin categoría, nota libre.
//
//   - voidMovement / voidExpense (MOV-04 / D-08): anulan con el soft-void
//     ortogonal de 137 — un movimiento anula AMBAS patas (+ el ajuste si lo
//     hubo) atómicamente vía TransactionService.voidPair; un egreso es un void
//     simple. Admin-only (la route enforcea FINANCE_VOID_ROLES server-side).
//
// NO toca los `balances` del socio: cash_transfer/expense/adjustment van con
// links: [] y applyDelta los ignora (Plan 01 MUST-FIX B / D-07).

import { eq, and } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import { BadRequestError } from "../shared/errors";
import { auditLog } from "../shared/audit-log";
import type { CashRegisterService } from "./cash-register-service";
import type { TransactionService } from "./transaction-service";
import type {
  MovementDetail,
  RegisterExpenseInput,
  RegisterMovementInput,
} from "./types";

type DbInstance = MySql2Database<typeof schema>;

/** Minimal caja shape the service needs (currency + branchId) for both the
 *  same-currency guard and the per-leg branchId stamp. */
interface CajaRef {
  id: number;
  currency: string;
  branchId: number | null;
}

export class MovementService {
  constructor(
    private readonly db: DbInstance,
    private readonly log: FastifyBaseLogger,
    private readonly txnService: TransactionService,
    private readonly cashRegisterService: CashRegisterService,
  ) {}

  /**
   * Load a caja's currency + branchId for the guard / per-leg stamp. Throws
   * BadRequestError when the caja does not exist (a movement to a phantom caja
   * is a bad request, not a 404 — the route validates ids via schema first).
   */
  private async loadCaja(cajaId: number): Promise<CajaRef> {
    const [caja] = await this.db
      .select({
        id: schema.cashRegisters.id,
        currency: schema.cashRegisters.currency,
        branchId: schema.cashRegisters.branchId,
      })
      .from(schema.cashRegisters)
      .where(eq(schema.cashRegisters.id, cajaId))
      .limit(1);
    if (!caja) {
      throw new BadRequestError(`No existe la caja ${cajaId}`);
    }
    return caja;
  }

  /**
   * Register an inter-caja movement (MOV-01/MOV-02). Asiento de doble entrada:
   * 2 filas kind='cash_transfer' (outflow origen + inflow destino), linkeadas
   * both-ways, en UNA db.transaction, neto 0. Same-currency guard (D-03) BEFORE
   * any write. Reconciliación (D-04): si countedAmount != expected, inserta un
   * ajuste en origen + audit 'reconciliation'.
   *
   * @throws BadRequestError on cross-currency, equal-caja, or unknown caja.
   */
  async registerMovement(
    input: RegisterMovementInput,
    adminId: number,
  ): Promise<MovementDetail> {
    const { origenCajaId, destinoCajaId, amount, countedAmount, notes } = input;

    if (origenCajaId === destinoCajaId) {
      throw new BadRequestError(
        "El origen y el destino del movimiento no pueden ser la misma caja",
      );
    }
    if (amount <= 0) {
      throw new BadRequestError("El monto del movimiento debe ser mayor a 0");
    }

    // Load both cajas + apply the same-currency guard (D-03) BEFORE any write —
    // mirror of cash-register-service.ts:104-108 wording. No FX in v1.
    const origen = await this.loadCaja(origenCajaId);
    const destino = await this.loadCaja(destinoCajaId);
    if (origen.currency !== destino.currency) {
      throw new BadRequestError(
        `Moneda inconsistente: el origen es ${origen.currency}, el destino es ${destino.currency}`,
      );
    }

    // D-04: snapshot the expected origen saldo BEFORE opening the tx (the firm
    // balance as the ledger stands now). The reconciliation diff is measured
    // against this expected vs the physical countedAmount.
    const expectedAmount = (
      await this.cashRegisterService.getBalance(origenCajaId)
    ).firmeBalance;

    return await this.db.transaction(async (tx) => {
      // Pata A: outflow en origen. cashRegisterId explícito (override) — NO se
      // resuelve por paymentMethod (las cajas son explícitas en un movimiento).
      // branchId = la sucursal de la caja (null para central/banco — Plan 01
      // hizo branch_id NULLABLE para esto).
      const outflow = await this.txnService.create(
        {
          memberId: null,
          kind: "cash_transfer",
          direction: "outflow",
          amount,
          currency: origen.currency,
          paymentMethod: "internal",
          transactionDate: this.today(),
          effectiveDate: this.today(),
          branchId: origen.branchId,
          cashRegisterId: origenCajaId,
          notes: notes ?? null,
          links: [],
        },
        adminId,
        tx,
      );

      // Pata B: inflow en destino.
      const inflow = await this.txnService.create(
        {
          memberId: null,
          kind: "cash_transfer",
          direction: "inflow",
          amount,
          currency: destino.currency,
          paymentMethod: "internal",
          transactionDate: this.today(),
          effectiveDate: this.today(),
          branchId: destino.branchId,
          cashRegisterId: destinoCajaId,
          notes: notes ?? null,
          links: [],
        },
        adminId,
        tx,
      );

      // Link the 2 legs both-ways (target_kind='transaction', allocatedAmount 0
      // — provenance link, not a money allocation; applyDelta ignores tx-to-tx
      // links). voidMovement walks these to find the sibling leg.
      await tx.insert(schema.transactionLinks).values([
        {
          transactionId: outflow.id,
          targetKind: "transaction",
          targetId: inflow.id,
          allocatedAmount: 0,
        },
        {
          transactionId: inflow.id,
          targetKind: "transaction",
          targetId: outflow.id,
          allocatedAmount: 0,
        },
      ]);

      // D-04 reconciliation. Only materialize an adjustment when the physical
      // count differs from expected. The adjustment row corrects origen's saldo
      // to reflect the counted (real) money — direction inflow when counted >
      // expected, outflow when counted < expected, amount = |diff|. Always
      // record expected (+counted if given) in the audit payload (cheap trail).
      let adjustmentTxId: number | null = null;
      if (countedAmount !== undefined && countedAmount !== expectedAmount) {
        const diff = countedAmount - expectedAmount;
        const adjustment = await this.txnService.create(
          {
            memberId: null,
            kind: "adjustment",
            direction: diff > 0 ? "inflow" : "outflow",
            amount: Math.abs(diff),
            currency: origen.currency,
            paymentMethod: "internal",
            transactionDate: this.today(),
            effectiveDate: this.today(),
            branchId: origen.branchId,
            cashRegisterId: origenCajaId,
            notes: `Reconciliación movimiento #${outflow.id}: esperado ${expectedAmount}, contado ${countedAmount}`,
            links: [],
          },
          adminId,
          tx,
        );
        adjustmentTxId = adjustment.id;

        // Link the adjustment to the origen movement row so voidMovement walks
        // it (and the trail shows the reconciliation belongs to this movement).
        await tx.insert(schema.transactionLinks).values({
          transactionId: adjustment.id,
          targetKind: "transaction",
          targetId: outflow.id,
          allocatedAmount: 0,
        });
      }

      // D-04 trail: always write the reconciliation audit (expected + counted +
      // diff). When counted is omitted, counted/diff are null — the rastro still
      // records the expected saldo at the moment of the movement.
      await auditLog.write(tx, {
        actorId: adminId,
        action: "reconciliation",
        targetKind: "transaction",
        targetId: outflow.id,
        payload: {
          movementId: outflow.id,
          inflowTxId: inflow.id,
          adjustmentId: adjustmentTxId,
          expected: expectedAmount,
          counted: countedAmount ?? null,
          diff:
            countedAmount !== undefined ? countedAmount - expectedAmount : null,
        },
      });

      this.log.info(
        {
          outflowTxId: outflow.id,
          inflowTxId: inflow.id,
          adjustmentTxId,
          origenCajaId,
          destinoCajaId,
          amount,
          expectedAmount,
          countedAmount: countedAmount ?? null,
          adminId,
        },
        "Inter-caja movement registered",
      );

      return {
        outflowTxId: outflow.id,
        inflowTxId: inflow.id,
        adjustmentTxId,
        expectedAmount,
        countedAmount: countedAmount ?? null,
      };
    });
  }

  /**
   * Register an expense (MOV-03 / D-05). 1 fila kind='expense', outflow, que
   * resta del saldo de su caja. memberId null, sin categoría, nota libre.
   * branchId = la sucursal de la caja (null para central/banco).
   *
   * @throws BadRequestError on non-positive amount or unknown caja.
   */
  async registerExpense(
    input: RegisterExpenseInput,
    adminId: number,
  ): Promise<{ expenseTxId: number }> {
    const { cajaId, amount, notes } = input;
    if (amount <= 0) {
      throw new BadRequestError("El monto del egreso debe ser mayor a 0");
    }
    const caja = await this.loadCaja(cajaId);

    const expense = await this.txnService.create(
      {
        memberId: null,
        kind: "expense",
        direction: "outflow",
        amount,
        currency: caja.currency,
        paymentMethod: "internal",
        transactionDate: this.today(),
        effectiveDate: this.today(),
        branchId: caja.branchId,
        cashRegisterId: cajaId,
        notes: notes ?? null,
        links: [],
      },
      adminId,
    );

    this.log.info(
      { expenseTxId: expense.id, cajaId, amount, adminId },
      "Expense registered",
    );

    return { expenseTxId: expense.id };
  }

  /**
   * Void an inter-caja movement (MOV-04 / D-08): anula AMBAS patas (+ el ajuste
   * de reconciliación si lo hubo) ATÓMICAMENTE vía TransactionService.voidPair,
   * en una db.transaction. Tras el void: ambas patas con voided_at, y los saldos
   * de las cajas vuelven a sus valores pre-movimiento (Pitfall 3 — el net-0
   * nunca se rompe a medias).
   *
   * `movementRowId` es CUALQUIERA de las 2 patas (outflow u inflow): se descubre
   * la pata hermana vía transaction_links (target_kind='transaction') + cualquier
   * fila kind='adjustment' linkeada a la pata outflow. Se de-dupea el set de ids.
   *
   * @throws BadRequestError on empty reason, unknown row, or already-voided row
   *         (voidPair/_void enforce los guards; validamos reason temprano).
   */
  async voidMovement(
    movementRowId: number,
    voidedBy: number,
    reason: string,
  ): Promise<void> {
    if (!reason || reason.trim().length === 0) {
      throw new BadRequestError("Razon de anulacion requerida");
    }

    // Collect every related row id: the target (movementRowId), its sibling leg,
    // and any adjustment row linked to it — via transaction_links rows where this
    // row is EITHER the source (transaction_id) or the target (target_id), so we
    // catch both the both-ways leg link and the adjustment→outflow link
    // regardless of which leg the caller passed.
    const asSource = await this.db
      .select({ targetId: schema.transactionLinks.targetId })
      .from(schema.transactionLinks)
      .where(
        and(
          eq(schema.transactionLinks.transactionId, movementRowId),
          eq(schema.transactionLinks.targetKind, "transaction"),
        ),
      );
    const asTarget = await this.db
      .select({ transactionId: schema.transactionLinks.transactionId })
      .from(schema.transactionLinks)
      .where(
        and(
          eq(schema.transactionLinks.targetId, movementRowId),
          eq(schema.transactionLinks.targetKind, "transaction"),
        ),
      );

    const ids = new Set<number>([movementRowId]);
    for (const r of asSource) ids.add(r.targetId);
    for (const r of asTarget) ids.add(r.transactionId);

    await this.txnService.voidPair([...ids], voidedBy, { reason });

    this.log.info(
      { movementRowId, voidedIds: [...ids], voidedBy, reason },
      "Inter-caja movement voided (pair + adjustment)",
    );
  }

  /**
   * Void an expense (MOV-04 / D-08): un egreso es 1 sola fila, así que el void
   * es simple (no tiene pata hermana). Reusa voidPair([id]) para un único camino
   * de anulación. El void revierte su efecto en el saldo de la caja.
   *
   * @throws BadRequestError on empty reason / already-voided; NotFoundError if absent.
   */
  async voidExpense(
    expenseRowId: number,
    voidedBy: number,
    reason: string,
  ): Promise<void> {
    if (!reason || reason.trim().length === 0) {
      throw new BadRequestError("Razon de anulacion requerida");
    }
    await this.txnService.voidPair([expenseRowId], voidedBy, { reason });
    this.log.info({ expenseRowId, voidedBy, reason }, "Expense voided");
  }

  /** YYYY-MM-DD today (local). Movimientos/egresos nacen con fecha de hoy. */
  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }
}
