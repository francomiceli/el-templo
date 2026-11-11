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

import { eq, and, isNull } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import { BadRequestError, NotFoundError } from "../shared/errors";
import { auditLog } from "../shared/audit-log";

import {
  tenantValues,
  tenantWhere,
  type TenantContext,
} from "../shared/tenant";
import type { CashRegisterService } from "./cash-register-service";
import type { TransactionService } from "./transaction-service";
import { RETIROS_COST_CENTER_NAME } from "./withdrawal-service";
import { assertEfectivoCoversOutflow } from "./efectivo-guard";
import { assertMethodAllowedForAccount } from "./payment-method-rules";
import { createCountAdjustment } from "./count-adjustment";
import { collectTransferGroupIds, createTransferPair } from "./transfer-pair";
import type {
  MovementDetail,
  OpeningCountInput,
  OpeningCountResult,
  RegisterExpenseInput,
  RegisterMovementInput,
} from "./types";

type DbInstance = MySql2Database<typeof schema>;

/** Minimal caja shape the service needs (currency + branchId) for both the
 *  same-currency guard and the per-leg branchId stamp. */
interface CajaRef {
  id: number;
  type: "efectivo" | "banco";
  name: string;
  currency: string;
  branchId: number | null;
  // Fase 208-04: los usa el arqueo de apertura (estado, fondo de cambio, corte).
  isActive: boolean;
  isTreasury: boolean;
  changeFund: number;
  cutoffDate: string;
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
  private async loadCaja(ctx: TenantContext, cajaId: number): Promise<CajaRef> {
    const [caja] = await this.db
      .select({
        id: schema.cashRegisters.id,
        type: schema.cashRegisters.type,
        name: schema.cashRegisters.name,
        currency: schema.cashRegisters.currency,
        branchId: schema.cashRegisters.branchId,
        isActive: schema.cashRegisters.isActive,
        isTreasury: schema.cashRegisters.isTreasury,
        changeFund: schema.cashRegisters.changeFund,
        cutoffDate: schema.cashRegisters.cutoffDate,
      })
      .from(schema.cashRegisters)
      .where(
        and(
          // Este SELECT ES la validacion de que la caja existe: `origenCajaId`,
          // `destinoCajaId` y `cajaId` llegan del BODY. Sin el filtro, un
          // movimiento puede mover plata a la caja de otro gimnasio y un egreso
          // puede restarle saldo (T-172-09-02). Con el, la caja ajena no matchea
          // y cae en el BadRequest de abajo, sin filtrar que existe (D-09).
          tenantWhere(schema.cashRegisters, ctx),
          eq(schema.cashRegisters.id, cajaId),
        ),
      )
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
    ctx: TenantContext,
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
    const origen = await this.loadCaja(ctx, origenCajaId);
    const destino = await this.loadCaja(ctx, destinoCajaId);
    if (origen.currency !== destino.currency) {
      throw new BadRequestError(
        `Moneda inconsistente: el origen es ${origen.currency}, el destino es ${destino.currency}`,
      );
    }
    // Las patas de un traslado son asientos internos (exentos de la regla): el
    // assert deja escrito dónde aplica la regla medio-cuenta (DI-04).
    assertMethodAllowedForAccount("internal", origen);
    assertMethodAllowedForAccount("internal", destino);

    // D-04: snapshot the expected origen saldo BEFORE opening the tx (the firm
    // balance as the ledger stands now). The reconciliation diff is measured
    // against this expected vs the physical countedAmount.
    const expectedAmount = (
      await this.cashRegisterService.getBalance(ctx, origenCajaId)
    ).firmeBalance;

    // 2026-09-18 — una caja de efectivo no puede quedar en negativo: el
    // cajon no tiene mas plata que la que cuenta el saldo (o la contada, si
    // el que mueve la declaro). Las cuentas banco no se tocan (pueden tener
    // fondos que el ledger no ve, ej. antes del corte).
    assertEfectivoCoversOutflow(
      origen,
      amount,
      countedAmount ?? expectedAmount,
      "El movimiento",
    );

    return await this.db.transaction(async (tx) => {
      // Par de traslado (salida en origen + entrada en destino + links ida y
      // vuelta): armado único en transfer-pair.ts, compartido con el retiro.
      const { outflowId, inflowId } = await createTransferPair(
        ctx,
        tx,
        this.txnService,
        {
          origen: {
            id: origenCajaId,
            currency: origen.currency,
            branchId: origen.branchId,
          },
          destino: {
            id: destinoCajaId,
            currency: destino.currency,
            branchId: destino.branchId,
          },
          amount,
          transactionDate: this.today(),
          notes: notes ?? null,
        },
        adminId,
      );

      // D-04 reconciliation. Only materialize an adjustment when the physical
      // count differs from expected. The adjustment row corrects origen's saldo
      // to reflect the counted (real) money — direction inflow when counted >
      // expected, outflow when counted < expected, amount = |diff|. Always
      // record expected (+counted if given) in the audit payload (cheap trail).
      let adjustmentTxId: number | null = null;
      if (countedAmount !== undefined && countedAmount !== expectedAmount) {
        const diff = countedAmount - expectedAmount;
        const adjustment = await this.txnService.create(
          ctx,
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
            notes: `Reconciliación movimiento #${outflowId}: esperado ${expectedAmount}, contado ${countedAmount}`,
            links: [],
          },
          adminId,
          tx,
        );
        adjustmentTxId = adjustment.id;

        // Link the adjustment to the origen movement row so voidMovement walks
        // it (and the trail shows the reconciliation belongs to this movement).
        await tx.insert(schema.transactionLinks).values(
          tenantValues(ctx, {
            transactionId: adjustment.id,
            targetKind: "transaction",
            targetId: outflowId,
            allocatedAmount: 0,
          }),
        );
      }

      // D-04 trail: always write the reconciliation audit (expected + counted +
      // diff). When counted is omitted, counted/diff are null — the rastro still
      // records the expected saldo at the moment of the movement.
      await auditLog.write(ctx, tx, {
        actorId: adminId,
        action: "reconciliation",
        targetKind: "transaction",
        targetId: outflowId,
        payload: {
          movementId: outflowId,
          inflowTxId: inflowId,
          adjustmentId: adjustmentTxId,
          expected: expectedAmount,
          counted: countedAmount ?? null,
          diff:
            countedAmount !== undefined ? countedAmount - expectedAmount : null,
        },
      });

      this.log.info(
        {
          outflowTxId: outflowId,
          inflowTxId: inflowId,
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
        outflowTxId: outflowId,
        inflowTxId: inflowId,
        adjustmentTxId,
        expectedAmount,
        countedAmount: countedAmount ?? null,
      };
    });
  }

  /**
   * Arqueo de apertura (fase 208, DI-06): el owner informa el efectivo real de
   * la Caja central o de un Tesoro y el saldo firme queda EXACTO en lo contado
   * (descontando fondo de cambio y pendientes, como todo arqueo de efectivo).
   * La diferencia se asienta como un `adjustment` interno trazable (notas con
   * esperado y contado, recorded_by, created_at) + un audit 'reconciliation'.
   *
   * NO escribe en `cash_counts`: no es una observacion de Oficina. Para una
   * cuenta nueva alcanza con el saldo de apertura del alta.
   *
   * @throws BadRequestError si la caja no existe, esta dada de baja, no es una
   *         caja de efectivo sin sede, o la fecha de hoy es anterior al corte.
   */
  async registerOpeningCount(
    ctx: TenantContext,
    cajaId: number,
    input: OpeningCountInput,
    adminId: number,
  ): Promise<OpeningCountResult> {
    const { countedAmount } = input;
    if (!Number.isInteger(countedAmount) || countedAmount < 0) {
      throw new BadRequestError(
        "El efectivo contado debe ser un número entero mayor o igual a 0",
      );
    }

    const caja = await this.loadCaja(ctx, cajaId);
    if (caja.type !== "efectivo" || caja.branchId !== null) {
      throw new BadRequestError(
        "El arqueo de apertura es solo para la Caja central o un Tesoro",
      );
    }
    if (!caja.isActive) {
      throw new BadRequestError("La caja está dada de baja");
    }
    const today = this.today();
    if (today < caja.cutoffDate) {
      throw new BadRequestError(
        `La fecha de hoy es anterior al corte de la caja ${caja.name} (${caja.cutoffDate})`,
      );
    }

    const result = await this.db.transaction(async (tx) => {
      // Candado sobre la caja: un traslado o retiro simultaneo se serializa
      // aca y el saldo que leemos ya lo incluye (getBalance lee lo commiteado
      // desde otra conexion, mismo criterio que el retiro).
      await tx
        .select({ id: schema.cashRegisters.id })
        .from(schema.cashRegisters)
        .where(
          and(
            tenantWhere(schema.cashRegisters, ctx),
            eq(schema.cashRegisters.id, caja.id),
          ),
        )
        .for("update");

      const balance = await this.cashRegisterService.getBalance(ctx, caja.id);
      // Mismo esperado que todo arqueo de efectivo: la plata sin validar esta
      // en el cajon aunque no este en el saldo firme.
      const expected =
        caja.changeFund + balance.firmeBalance + balance.pendienteAmount;
      const counted = countedAmount;
      const extra = input.notes?.trim();
      const notes = `Arqueo de apertura: esperado ${expected}, contado ${counted}${extra ? `. ${extra}` : ""}`;

      const { difference, adjustmentTxId } = await createCountAdjustment(
        ctx,
        tx,
        this.txnService,
        {
          caja,
          expected,
          counted,
          transactionDate: today,
          notes,
        },
        adminId,
      );

      // Rastro SIEMPRE, haya o no ajuste.
      await auditLog.write(ctx, tx, {
        actorId: adminId,
        action: "reconciliation",
        targetKind: "cash_register",
        targetId: caja.id,
        payload: {
          source: "opening_count",
          cashRegisterId: caja.id,
          expected,
          counted,
          difference,
          adjustmentId: adjustmentTxId,
        },
      });

      return {
        expectedAmount: expected,
        countedAmount: counted,
        difference,
        adjustmentTxId,
      };
    });

    const { firmeBalance } = await this.cashRegisterService.getBalance(
      ctx,
      caja.id,
    );
    this.log.info(
      { cashRegisterId: caja.id, ...result, firmeBalance, adminId },
      "Opening count registered",
    );
    return { cashRegisterId: caja.id, ...result, firmeBalance };
  }

  /**
   * Register an expense (MOV-03 / D-05). 1 fila kind='expense', outflow, que
   * resta del saldo de su caja. memberId null, nota libre. branchId = la
   * sucursal de la caja (null para central/banco).
   *
   * Phase 147 (EGR-02): el egreso EXIGE un centro de costo. Se valida exists+
   * active server-side antes de crear la fila (NO se valida match de país
   * centro↔caja — el selector del front ya filtra por país; el server solo
   * garantiza un centro real y activo).
   *
   * @throws BadRequestError on non-positive amount, unknown caja, or missing/
   *         inexistent/inactive cost center.
   */
  async registerExpense(
    ctx: TenantContext,
    input: RegisterExpenseInput,
    adminId: number,
  ): Promise<{ expenseTxId: number }> {
    const { cajaId, amount, costCenterId, notes } = input;
    // Nivel service: sin medio explícito el egreso es un asiento interno
    // (exento). La ruta POST /expenses no lo expone en la 208.
    const paymentMethod = input.paymentMethod ?? "internal";
    if (amount <= 0) {
      throw new BadRequestError("El monto del egreso debe ser mayor a 0");
    }
    if (!costCenterId) {
      throw new BadRequestError(
        "Debés elegir un centro de costo válido para el egreso",
      );
    }
    const caja = await this.loadCaja(ctx, cajaId);
    // Fase 208 (DI-04): regla única medio↔cuenta antes de escribir nada.
    assertMethodAllowedForAccount(paymentMethod, caja);

    // Phase 147 (EGR-02 / T-147-01): el centro de costo debe existir y estar
    // activo. Un solo SELECT — input no confiable (llega del body).
    const [costCenter] = await this.db
      .select({ id: schema.costCenters.id, name: schema.costCenters.name })
      .from(schema.costCenters)
      .where(
        and(
          // `costCenterId` llega del body: un centro de costo de otro gimnasio
          // no matchea y el egreso se rechaza (T-172-09-03).
          tenantWhere(schema.costCenters, ctx),
          eq(schema.costCenters.id, costCenterId),
          eq(schema.costCenters.isActive, true),
        ),
      )
      .limit(1);
    if (!costCenter) {
      throw new BadRequestError(
        "Debés elegir un centro de costo válido para el egreso",
      );
    }
    // Retiros (2026-09-07): un retiro siempre lleva responsable y, en efectivo,
    // los cobros que se llevó. Entra por POST /withdrawals, nunca como egreso
    // suelto — si no, el "quién se llevó la plata" queda en blanco.
    if (costCenter.name === RETIROS_COST_CENTER_NAME) {
      throw new BadRequestError(
        "Los retiros se registran desde Caja → Retiros (con responsable), no como egreso",
      );
    }

    // 2026-09-18 — mismo guard que en registerMovement: un egreso de efectivo
    // mayor al saldo firme dejaria la caja en negativo (en prod paso con los
    // retiros del 09/09, migracion 0234). Snapshot ANTES del insert, fuera de
    // tx, igual que el patron de expectedAmount en registerMovement.
    if (caja.type === "efectivo") {
      const { firmeBalance } = await this.cashRegisterService.getBalance(
        ctx,
        cajaId,
      );
      assertEfectivoCoversOutflow(caja, amount, firmeBalance, "El egreso");
    }

    const expense = await this.txnService.create(
      ctx,
      {
        memberId: null,
        kind: "expense",
        direction: "outflow",
        amount,
        currency: caja.currency,
        paymentMethod,
        transactionDate: this.today(),
        effectiveDate: this.today(),
        branchId: caja.branchId,
        cashRegisterId: cajaId,
        costCenterId,
        notes: notes ?? null,
        links: [],
      },
      adminId,
    );

    this.log.info(
      { expenseTxId: expense.id, cajaId, amount, costCenterId, adminId },
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
   * fila kind='adjustment' linkeada a alguna de las dos patas (`collectTransferGroupIds`).
   * Sirve también para un retiro nuevo (traslado con responsable): anula el
   * par y su ajuste, libera los cobros pero NO los anula.
   *
   * @throws BadRequestError on empty reason, unknown row, or already-voided row
   *         (voidPair/_void enforce los guards; validamos reason temprano).
   */
  async voidMovement(
    ctx: TenantContext,
    movementRowId: number,
    voidedBy: number,
    reason: string,
  ): Promise<void> {
    if (!reason || reason.trim().length === 0) {
      throw new BadRequestError("Razon de anulacion requerida");
    }

    // Grupo del traslado (patas + ajustes) descubierto desde CUALQUIERA de las
    // dos patas y filtrado por kind (ver transfer-pair.ts): en un retiro nuevo
    // la salida también está vinculada a sus cobros y NUNCA se anulan. El
    // ajuste de conciliación cae con el par aunque se pase la pata de entrada.
    const group = await collectTransferGroupIds(
      ctx,
      this.db,
      movementRowId,
      this.log,
    );
    const ids = [group.outflowId, group.inflowId, ...group.adjustmentIds];

    await this.txnService.voidPair(ctx, ids, voidedBy, { reason });

    this.log.info(
      { movementRowId, voidedIds: ids, voidedBy, reason },
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
    ctx: TenantContext,
    expenseRowId: number,
    voidedBy: number,
    reason: string,
  ): Promise<void> {
    if (!reason || reason.trim().length === 0) {
      throw new BadRequestError("Razon de anulacion requerida");
    }
    // Despacho por formato (fase 208): esta ruta sirve para egresos, retiros
    // viejos (expense) y retiros nuevos (traslado con responsable), así
    // RetirosTab anula los dos con el mismo botón. Cualquier otra fila no es
    // un egreso ni un retiro.
    const [row] = await this.db
      .select({
        id: schema.financialTransactions.id,
        kind: schema.financialTransactions.kind,
      })
      .from(schema.financialTransactions)
      .where(
        and(
          tenantWhere(schema.financialTransactions, ctx),
          eq(schema.financialTransactions.id, expenseRowId),
        ),
      )
      .limit(1);
    if (!row) {
      throw new NotFoundError("Transaccion no encontrada");
    }
    if (row.kind === "cash_transfer") {
      const group = await collectTransferGroupIds(
        ctx,
        this.db,
        expenseRowId,
        this.log,
      );
      if (!group.isWithdrawal) {
        throw new BadRequestError(
          "Es un traslado entre cajas: anulalo como traslado",
        );
      }
      const ids = [group.outflowId, group.inflowId, ...group.adjustmentIds];
      await this.txnService.voidPair(ctx, ids, voidedBy, { reason });
      this.log.info(
        { expenseRowId, voidedIds: ids, voidedBy, reason },
        "Withdrawal (transfer format) voided",
      );
      return;
    }
    if (row.kind !== "expense") {
      throw new BadRequestError("No es un egreso ni un retiro");
    }

    // 2026-09-23 — un retiro con conteo nace con un ajuste (faltante/sobrante)
    // linkeado a él (adjustment → retiro). Si se anula el retiro para cargarlo
    // de nuevo, el ajuste tiene que caer con él: si no, el recuento del
    // segundo retiro asienta la misma diferencia otra vez. Un egreso común no
    // tiene ajustes linkeados y esto no encuentra nada.
    const adjustments = await this.db
      .select({ id: schema.financialTransactions.id })
      .from(schema.transactionLinks)
      .innerJoin(
        schema.financialTransactions,
        and(
          tenantWhere(schema.financialTransactions, ctx),
          eq(
            schema.financialTransactions.id,
            schema.transactionLinks.transactionId,
          ),
        ),
      )
      .where(
        and(
          tenantWhere(schema.transactionLinks, ctx),
          eq(schema.transactionLinks.targetKind, "transaction"),
          eq(schema.transactionLinks.targetId, expenseRowId),
          eq(schema.financialTransactions.kind, "adjustment"),
          isNull(schema.financialTransactions.voidedAt),
        ),
      );
    const ids = [expenseRowId, ...adjustments.map((a) => a.id)];
    await this.txnService.voidPair(ctx, ids, voidedBy, { reason });
    this.log.info({ expenseRowId, voidedIds: ids, voidedBy, reason }, "Expense voided");
  }

  /** YYYY-MM-DD today (local). Movimientos/egresos nacen con fecha de hoy. */
  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }
}
