// Module: finance — phase 138 (cash_registers entity)
//
// CashRegisterService is the finance-facade home for the caja resolver
// (D-01/D-02) and the per-caja balance (added in plan 03). It mirrors the
// BalanceService constructor shape (db, log).
//
// `resolveCashRegister` is the SINGLE reusable choke-point that derives the
// caja of a payment 100% from its `paymentMethod` (D-01). It is wired into the
// single TransactionService.create() insert site so every create path
// auto-stamps `cash_register_id`, and is REUSED verbatim by phase 140 (carga
// única del profe) — do NOT reinvent the resolver there.

import { and, eq, gte, isNull, sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import { BadRequestError, NotFoundError } from "../shared/errors";
import { firmMoneyConditions } from "./firm-money";
import type { CashRegisterBalance, PaymentMethod } from "./types";

type DbInstance = MySql2Database<typeof schema>;

export class CashRegisterService {
  constructor(
    private readonly db: DbInstance,
    private readonly log: FastifyBaseLogger,
  ) {}

  /**
   * Derive the caja a payment lands in, 100% from its `paymentMethod` (D-01).
   * This is the single reusable choke-point (D-02) reused by phase 140.
   *
   * Rule:
   *   - aura_credit / internal → NULL (not firm cash in any caja).
   *   - transfer / card        → banco caja of `currency` (resolved BY currency,
   *                              so a currency mismatch is structurally
   *                              impossible — no guard needed).
   *   - cash                   → efectivo caja of `branchId`. Here the caja's
   *                              currency could differ from the tx currency
   *                              (e.g. an EUR cash payment recorded at an ARS
   *                              branch), so the currency guard (D-09/CAJA-04)
   *                              fires — mirror of balance-service.ts:154-158.
   *
   * @returns the resolved cash_register id, or NULL for aura_credit/internal.
   * @throws BadRequestError when no matching active caja exists, or (cash) when
   *         the resolved efectivo caja's currency differs from `currency`.
   */
  async resolveCashRegister(
    paymentMethod: PaymentMethod,
    branchId: number,
    currency: string,
  ): Promise<number | null> {
    if (paymentMethod === "aura_credit" || paymentMethod === "internal") {
      return null;
    }

    if (paymentMethod === "transfer" || paymentMethod === "card") {
      const [banco] = await this.db
        .select({ id: schema.cashRegisters.id })
        .from(schema.cashRegisters)
        .where(
          and(
            eq(schema.cashRegisters.type, "banco"),
            eq(schema.cashRegisters.currency, currency),
            eq(schema.cashRegisters.isActive, true),
          ),
        )
        .limit(1);
      if (!banco) {
        throw new BadRequestError(`No existe caja banco para ${currency}`);
      }
      return banco.id;
    }

    // paymentMethod === "cash" → efectivo de la sucursal.
    const [efectivo] = await this.db
      .select({
        id: schema.cashRegisters.id,
        currency: schema.cashRegisters.currency,
      })
      .from(schema.cashRegisters)
      .where(
        and(
          eq(schema.cashRegisters.type, "efectivo"),
          eq(schema.cashRegisters.branchId, branchId),
          eq(schema.cashRegisters.isActive, true),
        ),
      )
      .limit(1);
    if (!efectivo) {
      throw new BadRequestError(
        `No existe caja efectivo para la sucursal ${branchId}`,
      );
    }
    // Currency guard (D-09/CAJA-04): a caja never mixes currencies.
    if (efectivo.currency !== currency) {
      throw new BadRequestError(
        `Moneda inconsistente: la caja es ${efectivo.currency}, el cobro es ${currency}`,
      );
    }
    return efectivo.id;
  }

  /**
   * Derived firm balance of a caja (D-06/D-08/CAJA-03). NOT materialized — the
   * saldo is always computed on read, and the derivation is hidden behind this
   * signature so phase 139 can extend the body (outflows) without changing the
   * contract for callers.
   *
   * firmeBalance = opening_balance + Σ(validados, no anulados) DESDE cutoff_date,
   *   reusing firmMoneyConditions() so it inherits the canonical phase-137 filter
   *   (never inline `validado` / `voided_at IS NULL` here — D-08/T-138-09).
   *
   * pendienteAmount = Σ(validation_status='pendiente', no anulados) DESDE cutoff,
   *   returned SEPARATELY and NEVER added to firmeBalance (CAJA-03/T-138-07).
   *
   * Pre-cutoff rows are labeled for history but excluded by the
   * gte(transactionDate, cutoffDate) gate on every SUM (T-138-08).
   *
   * INFLOW-ONLY in phase 138 — no cash_transfer/expense outflows exist yet.
   * // TODO 139: subtract outflows (cash_transfer/expense) from firmeBalance —
   * // phase 139 extends this body (signed movements) without changing the signature.
   *
   * @throws NotFoundError when no caja exists for `cashRegisterId`.
   */
  async getBalance(cashRegisterId: number): Promise<CashRegisterBalance> {
    const [caja] = await this.db
      .select({
        openingBalance: schema.cashRegisters.openingBalance,
        currency: schema.cashRegisters.currency,
        cutoffDate: schema.cashRegisters.cutoffDate,
      })
      .from(schema.cashRegisters)
      .where(eq(schema.cashRegisters.id, cashRegisterId))
      .limit(1);
    if (!caja) {
      throw new NotFoundError(`No existe la caja ${cashRegisterId}`);
    }

    // firmeBalance: clone of getSummary's firm SUM (transaction-service.ts),
    // scoped to THIS caja, inflow-only, gated by cutoff, reusing the canonical
    // firm-money filter.
    const [firmRow] = await this.db
      .select({
        total: sql<number>`COALESCE(SUM(${schema.financialTransactions.amount}), 0)`,
      })
      .from(schema.financialTransactions)
      .where(
        and(
          eq(schema.financialTransactions.cashRegisterId, cashRegisterId),
          eq(schema.financialTransactions.direction, "inflow"),
          ...firmMoneyConditions(),
          gte(schema.financialTransactions.transactionDate, caja.cutoffDate),
        ),
      );
    const firmeBalance = caja.openingBalance + Number(firmRow?.total ?? 0);

    // pendienteAmount: a SEPARATE SUM (validation_status='pendiente', not
    // voided, since cutoff). NEVER added to firmeBalance (CAJA-03).
    const [pendRow] = await this.db
      .select({
        total: sql<number>`COALESCE(SUM(${schema.financialTransactions.amount}), 0)`,
      })
      .from(schema.financialTransactions)
      .where(
        and(
          eq(schema.financialTransactions.cashRegisterId, cashRegisterId),
          eq(schema.financialTransactions.direction, "inflow"),
          eq(schema.financialTransactions.validationStatus, "pendiente"),
          isNull(schema.financialTransactions.voidedAt),
          gte(schema.financialTransactions.transactionDate, caja.cutoffDate),
        ),
      );
    const pendienteAmount = Number(pendRow?.total ?? 0);

    return {
      cashRegisterId,
      currency: caja.currency,
      firmeBalance,
      pendienteAmount,
    };
  }
}
