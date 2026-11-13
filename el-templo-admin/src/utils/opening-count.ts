// Espejo puro del esperado de `MovementService.registerOpeningCount` (fase 208 + 209.1).
// Cualquier cambio de criterio va en los dos lados (API y admin).
//  - efectivo (Central/Tesoro): fondo de cambio + firme + pendiente de validar.
//  - banco: firme + pendiente (un banco no tiene fondo de cambio).
import type { CajaSaldoRow } from '../types/transaction';

export type OpeningMode = 'efectivo' | 'banco';

export type OpeningDifference = { kind: 'ok' | 'sobrante' | 'faltante'; amount: number };

export function openingExpected(
  caja: Pick<CajaSaldoRow, 'changeFund' | 'firmeBalance' | 'pendienteAmount'>,
  mode: OpeningMode
): number {
  return (mode === 'banco' ? 0 : caja.changeFund) + caja.firmeBalance + caja.pendienteAmount;
}

export function openingDifference(
  counted: number | null,
  expected: number
): OpeningDifference | null {
  if (counted === null) return null;
  const diff = counted - expected;
  if (diff === 0) return { kind: 'ok', amount: 0 };
  return diff > 0
    ? { kind: 'sobrante', amount: diff }
    : { kind: 'faltante', amount: Math.abs(diff) };
}
