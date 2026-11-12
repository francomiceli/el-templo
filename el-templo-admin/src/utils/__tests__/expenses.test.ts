// El admin no declara vitest (los tests siguen la convención pero no los corre CI):
// el import no resuelve en vue-tsc. Se silencia para no sumar a la línea base.
// @ts-expect-error TS2307 vitest no está instalado en el admin
import { describe, it, expect } from 'vitest';
import {
  AMOUNT_STATUS_LABELS,
  EXPENSE_PAYMENT_METHOD_LABELS,
  EXPENSE_STATUS_META,
  allocationDifference,
  allocationsSum,
  expenseStatusOf,
  isHttpUrl,
  isValidMonth,
  isValidMoneyInteger,
  monthLabel,
  needsExpenseFx,
  paymentMethodsForAccount,
  paymentNeedsFx,
  previewPayment,
  shiftMonth,
  splitEvenly,
} from '../expenses';

// Los resultados esperados están escritos a mano, nunca recalculados con la
// función bajo prueba. splitEvenly, expenseStatusOf y previewPayment usan los
// mismos casos que el-templo-api/test/unit/expense-math.test.ts.

describe('splitEvenly (espejo de la API)', () => {
  const casos: Array<[number, number, number[]]> = [
    [100, 3, [33, 33, 34]],
    [150000, 6, [25000, 25000, 25000, 25000, 25000, 25000]],
    [7, 1, [7]],
    [2, 3, [0, 0, 2]],
    [10, 0, []],
    [5, 0, []],
  ];
  for (const [total, n, esperado] of casos) {
    it(`splitEvenly(${total}, ${n}) = ${JSON.stringify(esperado)}`, () => {
      expect(splitEvenly(total, n)).toEqual(esperado);
    });
  }

  it('la suma de las partes es exactamente el total', () => {
    const parts = splitEvenly(1_999_999_999, 7);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(1_999_999_999);
    expect(parts).toHaveLength(7);
  });
});

describe('allocationsSum y allocationDifference', () => {
  it('una parte vacía (null) cuenta como 0', () => {
    expect(allocationsSum([{ amount: 10 }, { amount: null }, { amount: 5 }])).toBe(15);
  });

  it('sin filas suma 0', () => {
    expect(allocationsSum([])).toBe(0);
  });

  it('falta repartir: 100 con partes 60 y 30 = 10', () => {
    expect(allocationDifference(100, [{ amount: 60 }, { amount: 30 }])).toBe(10);
  });

  it('se pasó del importe: 100 con partes 70 y 50 = -20', () => {
    expect(allocationDifference(100, [{ amount: 70 }, { amount: 50 }])).toBe(-20);
  });

  it('reparto exacto = 0', () => {
    expect(allocationDifference(100, [{ amount: 33 }, { amount: 33 }, { amount: 34 }])).toBe(0);
  });
});

describe('needsExpenseFx y paymentNeedsFx', () => {
  it('solo Argentina con USD necesita tipo de cambio en el gasto', () => {
    expect(needsExpenseFx('AR', 'USD')).toBe(true);
    expect(needsExpenseFx('AR', 'ARS')).toBe(false);
    expect(needsExpenseFx('ES', 'EUR')).toBe(false);
  });

  it('pago: monedas distintas o cuenta en USD en Argentina necesitan tipo de cambio', () => {
    expect(paymentNeedsFx({ country: 'AR', accountCurrency: 'ARS', expenseCurrency: 'ARS' })).toBe(
      false
    );
    expect(paymentNeedsFx({ country: 'AR', accountCurrency: 'ARS', expenseCurrency: 'USD' })).toBe(
      true
    );
    expect(paymentNeedsFx({ country: 'AR', accountCurrency: 'USD', expenseCurrency: 'USD' })).toBe(
      true
    );
    expect(paymentNeedsFx({ country: 'AR', accountCurrency: 'USD', expenseCurrency: 'ARS' })).toBe(
      true
    );
    expect(paymentNeedsFx({ country: 'ES', accountCurrency: 'EUR', expenseCurrency: 'EUR' })).toBe(
      false
    );
  });
});

describe('previewPayment (misma tabla que computePaymentAmounts de la API)', () => {
  it('AR: cuenta ARS / gasto ARS, 1000 = 1000 aplicado y 1000 en pesos', () => {
    expect(
      previewPayment({
        country: 'AR',
        accountCurrency: 'ARS',
        expenseCurrency: 'ARS',
        amount: 1000,
      })
    ).toEqual({ needsFx: false, appliedAmount: 1000, amountArs: 1000 });
  });

  it('AR: cuenta ARS / gasto USD, 156000 con tc 1560 = 100 USD', () => {
    expect(
      previewPayment({
        country: 'AR',
        accountCurrency: 'ARS',
        expenseCurrency: 'USD',
        amount: 156000,
        fxRate: 1560,
      })
    ).toEqual({ needsFx: true, appliedAmount: 100, amountArs: 156000 });
  });

  it('AR: cuenta USD / gasto USD, 100 con tc 1560', () => {
    expect(
      previewPayment({
        country: 'AR',
        accountCurrency: 'USD',
        expenseCurrency: 'USD',
        amount: 100,
        fxRate: 1560,
      })
    ).toEqual({ needsFx: true, appliedAmount: 100, amountArs: 156000 });
  });

  it('AR: cuenta USD / gasto ARS, 100 con tc 1560 = 156000', () => {
    expect(
      previewPayment({
        country: 'AR',
        accountCurrency: 'USD',
        expenseCurrency: 'ARS',
        amount: 100,
        fxRate: 1560,
      })
    ).toEqual({ needsFx: true, appliedAmount: 156000, amountArs: 156000 });
  });

  it('ES: EUR / EUR, 500 = 500 aplicado y sin pesos', () => {
    expect(
      previewPayment({
        country: 'ES',
        accountCurrency: 'EUR',
        expenseCurrency: 'EUR',
        amount: 500,
      })
    ).toEqual({ needsFx: false, appliedAmount: 500, amountArs: null });
  });

  it('falta el tipo de cambio cuando hace falta: needsFx true y sin importes', () => {
    expect(
      previewPayment({
        country: 'AR',
        accountCurrency: 'ARS',
        expenseCurrency: 'USD',
        amount: 156000,
      })
    ).toEqual({ needsFx: true, appliedAmount: null, amountArs: null });
    expect(
      previewPayment({
        country: 'AR',
        accountCurrency: 'USD',
        expenseCurrency: 'USD',
        amount: 100,
        fxRate: null,
      })
    ).toEqual({ needsFx: true, appliedAmount: null, amountArs: null });
  });

  it('tipo de cambio inválido (0, negativo, NaN) no calcula', () => {
    for (const fxRate of [0, -5, Number.NaN]) {
      expect(
        previewPayment({
          country: 'AR',
          accountCurrency: 'ARS',
          expenseCurrency: 'USD',
          amount: 156000,
          fxRate,
        }).appliedAmount
      ).toBeNull();
    }
  });

  it('importe vacío o inválido no calcula pero informa si necesita tipo de cambio', () => {
    expect(
      previewPayment({
        country: 'AR',
        accountCurrency: 'ARS',
        expenseCurrency: 'ARS',
        amount: null,
      })
    ).toEqual({ needsFx: false, appliedAmount: null, amountArs: null });
    expect(
      previewPayment({
        country: 'AR',
        accountCurrency: 'USD',
        expenseCurrency: 'USD',
        amount: 1.5,
        fxRate: 1560,
      })
    ).toEqual({ needsFx: true, appliedAmount: null, amountArs: null });
  });

  it('cuenta ARS / gasto USD redondea al entero: 1000 con tc 1560 = 1 USD (0,64 redondea a 1)', () => {
    expect(
      previewPayment({
        country: 'AR',
        accountCurrency: 'ARS',
        expenseCurrency: 'USD',
        amount: 1000,
        fxRate: 1560,
      })
    ).toEqual({ needsFx: true, appliedAmount: 1, amountArs: 1000 });
  });

  it('un pago tan chico que aplica menos de 1 al gasto no calcula (la API lo rechaza)', () => {
    expect(
      previewPayment({
        country: 'AR',
        accountCurrency: 'ARS',
        expenseCurrency: 'USD',
        amount: 100,
        fxRate: 1560,
      }).appliedAmount
    ).toBeNull();
  });
});

describe('expenseStatusOf (espejo de la API)', () => {
  const casos: Array<[number, number, 'pendiente' | 'parcial' | 'pagado', number, boolean]> = [
    [1000, 0, 'pendiente', 1000, false],
    [1000, 400, 'parcial', 600, false],
    [1000, 1000, 'pagado', 0, false],
    [1000, 1200, 'pagado', 0, true],
  ];
  for (const [amount, paid, status, pending, overpaid] of casos) {
    it(`amount ${amount} paid ${paid} = ${status}`, () => {
      expect(expenseStatusOf(amount, paid)).toEqual({ status, pending, overpaid });
    });
  }
});

describe('etiquetas', () => {
  it('estados del gasto con paleta cálida', () => {
    expect(EXPENSE_STATUS_META.pendiente).toEqual({ label: 'Pendiente', color: 'deep-orange' });
    expect(EXPENSE_STATUS_META.parcial).toEqual({ label: 'Parcial', color: 'amber-8' });
    expect(EXPENSE_STATUS_META.pagado).toEqual({ label: 'Pagado', color: 'positive' });
  });

  it('estado del importe', () => {
    expect(AMOUNT_STATUS_LABELS).toEqual({ estimado: 'Estimado', confirmado: 'Confirmado' });
  });

  it('medios de pago: el débito automático se lee "Débito automático"', () => {
    expect(EXPENSE_PAYMENT_METHOD_LABELS).toEqual({
      cash: 'Efectivo',
      transfer: 'Transferencia',
      card: 'Tarjeta',
      cheque: 'Cheque',
      direct_debit: 'Débito automático',
    });
  });
});

describe('isValidMoneyInteger', () => {
  it('acepta 1 y el máximo', () => {
    expect(isValidMoneyInteger(1)).toBe(true);
    expect(isValidMoneyInteger(2_000_000_000)).toBe(true);
  });

  it('rechaza 0, negativos, decimales, NaN, pasarse del máximo y no números', () => {
    expect(isValidMoneyInteger(0)).toBe(false);
    expect(isValidMoneyInteger(-1)).toBe(false);
    expect(isValidMoneyInteger(1.5)).toBe(false);
    expect(isValidMoneyInteger(Number.NaN)).toBe(false);
    expect(isValidMoneyInteger(2_000_000_001)).toBe(false);
    expect(isValidMoneyInteger('10')).toBe(false);
    expect(isValidMoneyInteger(null)).toBe(false);
  });
});

describe('meses', () => {
  it('monthLabel', () => {
    expect(monthLabel('2026-11')).toBe('Noviembre 2026');
    expect(monthLabel('2026-01')).toBe('Enero 2026');
    expect(monthLabel('2026-09')).toBe('Septiembre 2026');
  });

  it('monthLabel devuelve tal cual un mes inválido', () => {
    expect(monthLabel('2026-13')).toBe('2026-13');
  });

  it('shiftMonth cruza el cambio de año en los dos sentidos', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2025-12', 1)).toBe('2026-01');
    expect(shiftMonth('2026-11', 0)).toBe('2026-11');
    expect(shiftMonth('2026-03', 14)).toBe('2027-05');
    expect(shiftMonth('2026-03', -15)).toBe('2024-12');
  });

  it('isValidMonth', () => {
    expect(isValidMonth('2026-11')).toBe(true);
    expect(isValidMonth('2026-00')).toBe(false);
    expect(isValidMonth('2026-13')).toBe(false);
    expect(isValidMonth('1999-12')).toBe(false);
    expect(isValidMonth('2026-1')).toBe(false);
    expect(isValidMonth('')).toBe(false);
  });
});

describe('isHttpUrl', () => {
  it('acepta http y https', () => {
    expect(isHttpUrl('https://drive.google.com/x')).toBe(true);
    expect(isHttpUrl('http://example.com')).toBe(true);
  });

  it('rechaza lo que no es http(s)', () => {
    expect(isHttpUrl('drive.google.com/x')).toBe(false);
    expect(isHttpUrl('javascript:alert(1)')).toBe(false);
    expect(isHttpUrl('ftp://example.com')).toBe(false);
    expect(isHttpUrl('')).toBe(false);
  });
});

describe('paymentMethodsForAccount', () => {
  it('efectivo: solo cash', () => {
    expect(paymentMethodsForAccount('efectivo')).toEqual(['cash']);
  });

  it('banco: no incluye cash y trae los cuatro medios bancarios', () => {
    const metodos = paymentMethodsForAccount('banco');
    expect(metodos).not.toContain('cash');
    expect(metodos).toEqual(['transfer', 'card', 'cheque', 'direct_debit']);
  });
});
