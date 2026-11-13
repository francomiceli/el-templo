// El admin no declara vitest (los tests siguen la convención pero no los corre CI):
// el import no resuelve en vue-tsc. Se silencia para no sumar a la línea base.
// @ts-expect-error TS2307 vitest no está instalado en el admin
import { describe, it, expect } from 'vitest';
import { isMethodAllowedForAccount, METHOD_ACCOUNT_RULE } from '../payment-method-rules';
import type { PaymentMethod } from '../../types/transaction';

// Misma matriz que el test de la API (finance/payment-method-rules).
describe('isMethodAllowedForAccount (espejo de la API)', () => {
  it('cash: solo con efectivo', () => {
    expect(isMethodAllowedForAccount('cash', 'efectivo')).toBe(true);
    expect(isMethodAllowedForAccount('cash', 'banco')).toBe(false);
  });

  const bancarios: PaymentMethod[] = ['transfer', 'card', 'cheque', 'direct_debit'];
  for (const method of bancarios) {
    it(`${method}: solo con banco`, () => {
      expect(isMethodAllowedForAccount(method, 'banco')).toBe(true);
      expect(isMethodAllowedForAccount(method, 'efectivo')).toBe(false);
    });
  }

  const exentos: PaymentMethod[] = ['internal', 'aura_credit'];
  for (const method of exentos) {
    it(`${method}: exento, vale con cualquier cuenta`, () => {
      expect(isMethodAllowedForAccount(method, 'efectivo')).toBe(true);
      expect(isMethodAllowedForAccount(method, 'banco')).toBe(true);
    });
  }

  it('cubre los 7 medios', () => {
    expect(Object.keys(METHOD_ACCOUNT_RULE).sort()).toEqual(
      ['aura_credit', 'card', 'cash', 'cheque', 'direct_debit', 'internal', 'transfer']
    );
  });
});
