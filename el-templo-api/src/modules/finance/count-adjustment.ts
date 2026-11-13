// Module: finance — fase 208 (DI-06)
//
// "Ajuste por conteo": cuando el efectivo contado de una caja no coincide con
// lo esperado, se asienta UNA fila kind='adjustment' interna que deja el saldo
// firme exactamente en lo contado. Es el mecanismo unico para esa diferencia:
// hoy lo usa el arqueo de apertura (MovementService.registerOpeningCount) y en
// 208-06 lo usa el retiro con destino. `registerMovement` hace lo mismo inline
// (la rama de idempotencia de traslados reescribe ese metodo): se unifica al
// integrarla.
//
// NO escribe en `cash_counts`: un arqueo de ahi es una observacion que no toca
// el ledger y, con diferencia, abre un tema automatico en Oficina.
//
// El texto de `notes` lo arma el caller y se guarda TAL CUAL, asi cada flujo
// conserva su redaccion.

import type { TenantContext } from "../shared/tenant";
import type { TxHandle } from "./balance-service";
import type { TransactionService } from "./transaction-service";

export interface CountAdjustmentInput {
  caja: { id: number; currency: string; branchId: number | null };
  /** Saldo esperado en el cajon (fondo de cambio + firme + pendiente). */
  expected: number;
  /** Efectivo realmente contado. */
  counted: number;
  /** YYYY-MM-DD de la transaccion y de la fecha efectiva. */
  transactionDate: string;
  notes: string;
}

export interface CountAdjustmentResult {
  /** counted - expected, en unidades enteras (0 si coinciden). */
  difference: number;
  /** Id del ajuste creado, o null cuando no hay diferencia. */
  adjustmentTxId: number | null;
}

/**
 * Crea (si hace falta) el ajuste que lleva el saldo de la caja a lo contado.
 * Corre dentro de la transaccion del caller (`tx`). Sin diferencia no escribe.
 */
export async function createCountAdjustment(
  ctx: TenantContext,
  tx: TxHandle,
  txnService: TransactionService,
  input: CountAdjustmentInput,
  adminId: number,
): Promise<CountAdjustmentResult> {
  const difference = input.counted - input.expected;
  if (difference === 0) {
    return { difference: 0, adjustmentTxId: null };
  }
  const adjustment = await txnService.create(
    ctx,
    {
      memberId: null,
      kind: "adjustment",
      direction: difference > 0 ? "inflow" : "outflow",
      amount: Math.abs(difference),
      currency: input.caja.currency,
      paymentMethod: "internal",
      transactionDate: input.transactionDate,
      effectiveDate: input.transactionDate,
      branchId: input.caja.branchId,
      cashRegisterId: input.caja.id,
      notes: input.notes,
      links: [],
    },
    adminId,
    tx,
  );
  return { difference, adjustmentTxId: adjustment.id };
}
