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

import { and, eq } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import { BadRequestError } from "../shared/errors";
import type { PaymentMethod } from "./types";

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
}
