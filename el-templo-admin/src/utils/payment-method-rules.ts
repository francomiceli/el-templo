/**
 * Regla ÚNICA de coherencia medio de pago <-> tipo de cuenta — fase 208 (DI-04).
 *
 * Espejo literal de `el-templo-api/src/modules/finance/payment-method-rules.ts`.
 * El admin solo la usa para FILTRAR opciones; la autoridad es la API, que la
 * valida igual al dar de alta egresos, traslados, retiros y al validar cobros.
 *
 *   cash                                    -> solo cuentas de efectivo (sede, Caja central o Tesoro)
 *   transfer | card | cheque | direct_debit -> solo cuentas banco
 *   internal | aura_credit                  -> exentos
 */
import type { PaymentMethod } from '../types/transaction';

export type AccountType = 'efectivo' | 'banco';

/**
 * Tipo de cuenta que admite cada medio. `exento` = no se valida. Es un Record
 * sobre PaymentMethod: sumar un medio sin regla no compila.
 */
export const METHOD_ACCOUNT_RULE: Record<PaymentMethod, AccountType | 'exento'> = {
  cash: 'efectivo',
  transfer: 'banco',
  card: 'banco',
  cheque: 'banco',
  direct_debit: 'banco',
  internal: 'exento',
  aura_credit: 'exento',
};

export function isMethodAllowedForAccount(
  method: PaymentMethod,
  accountType: AccountType
): boolean {
  const rule = METHOD_ACCOUNT_RULE[method];
  return rule === 'exento' || rule === accountType;
}
