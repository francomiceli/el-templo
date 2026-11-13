// El admin no declara vitest (los tests siguen la convención pero no los corre CI):
// el import no resuelve en vue-tsc. Se silencia para no sumar a la línea base.
// @ts-expect-error TS2307 vitest no está instalado en el admin
import { describe, it, expect } from 'vitest';
import {
  AMOUNT_STATUS_LABELS,
  EXPENSE_PAYMENT_METHOD_LABELS,
  EXPENSE_STATUS_META,
  RESULT_CONSOLIDATED_KEY,
  RESULT_FOOTNOTE,
  expenseCurrencyNote,
  foreignIncomeNotice,
  formatMarginPct,
  incompleteExpensesText,
  resultColumnLabel,
  resultDetailDestination,
  resultMarginLabel,
  allocationDifference,
  allocationsSum,
  amountAtRate,
  cleanReceiptLinks,
  diffExpenseUpdate,
  expenseStatusOf,
  formatFxRate,
  historyEntryLines,
  type ExpenseFormValues,
  isHttpUrl,
  isValidFxRate,
  isValidMonth,
  isValidMoneyInteger,
  moneyIntegerRule,
  monthLabel,
  needsExpenseFx,
  paymentDateError,
  paymentMethodsForAccount,
  paymentNeedsFx,
  paymentOverpayState,
  previewPayment,
  sameAllocations,
  shiftMonth,
  splitEvenly,
  splitEvenlyRemainder,
  sumPendingByCurrency,
  toNumberOrNull,
} from '../expenses';
import type { ExpenseHistoryItem, ExpenseRecordDetail } from '../../types/expense';
import { formatPrice } from '../format-price';

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

describe('toNumberOrNull y moneyIntegerRule', () => {
  it('toNumberOrNull: números, strings numéricos y vacíos', () => {
    expect(toNumberOrNull(150)).toBe(150);
    expect(toNumberOrNull(0)).toBe(0);
    expect(toNumberOrNull('42')).toBe(42);
    expect(toNumberOrNull('1560.5')).toBe(1560.5);
    expect(toNumberOrNull('')).toBeNull();
    expect(toNumberOrNull('  ')).toBeNull();
    expect(toNumberOrNull('abc')).toBeNull();
    expect(toNumberOrNull(NaN)).toBeNull();
    expect(toNumberOrNull(null)).toBeNull();
    expect(toNumberOrNull(undefined)).toBeNull();
  });

  it('moneyIntegerRule: true solo con un entero entre 1 y el tope', () => {
    expect(moneyIntegerRule(1)).toBe(true);
    expect(moneyIntegerRule('2500')).toBe(true);
    expect(moneyIntegerRule(2_000_000_000)).toBe(true);
    expect(moneyIntegerRule(0)).toBe('Ingresá un importe entero mayor a 0');
    expect(moneyIntegerRule(10.5)).toBe('Ingresá un importe entero mayor a 0');
    expect(moneyIntegerRule('')).toBe('Ingresá un importe entero mayor a 0');
    expect(moneyIntegerRule(2_000_000_001)).toBe('Ingresá un importe entero mayor a 0');
  });
});

describe('splitEvenlyRemainder', () => {
  const casos: Array<[number, number, number]> = [
    [100, 3, 1],
    [150000, 6, 0],
    [7, 1, 0],
    [2, 3, 2],
    [10, 4, 2],
    [10, 0, 0],
  ];
  for (const [total, n, esperado] of casos) {
    it(`splitEvenlyRemainder(${total}, ${n}) = ${esperado}`, () => {
      expect(splitEvenlyRemainder(total, n)).toBe(esperado);
    });
  }
});

describe('sameAllocations', () => {
  it('mismos destinos e importes en otro orden son iguales', () => {
    expect(
      sameAllocations(
        [
          { branchId: 1, amount: 60 },
          { branchId: null, amount: 40 },
        ],
        [
          { branchId: null, amount: 40 },
          { branchId: 1, amount: 60 },
        ]
      )
    ).toBe(true);
  });

  it('distinto importe, distinto destino o distinta cantidad son distintos', () => {
    const base = [{ branchId: 1, amount: 100 }];
    expect(sameAllocations(base, [{ branchId: 1, amount: 99 }])).toBe(false);
    expect(sameAllocations(base, [{ branchId: 2, amount: 100 }])).toBe(false);
    expect(sameAllocations(base, [{ branchId: null, amount: 100 }])).toBe(false);
    expect(
      sameAllocations(base, [
        { branchId: 1, amount: 50 },
        { branchId: 2, amount: 50 },
      ])
    ).toBe(false);
    expect(sameAllocations([], [])).toBe(true);
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

describe('isValidFxRate y amountAtRate', () => {
  it('isValidFxRate: positivo, hasta 4 decimales y dentro del rango', () => {
    expect(isValidFxRate(1560)).toBe(true);
    expect(isValidFxRate(1234.5678)).toBe(true);
    expect(isValidFxRate(0.0001)).toBe(true);
    expect(isValidFxRate(99_999_999.9999)).toBe(true);
    expect(isValidFxRate(0)).toBe(false);
    expect(isValidFxRate(-5)).toBe(false);
    expect(isValidFxRate(1.23456)).toBe(false);
    expect(isValidFxRate(100_000_000)).toBe(false);
    expect(isValidFxRate(NaN)).toBe(false);
    expect(isValidFxRate('1560')).toBe(false);
    expect(isValidFxRate(null)).toBe(false);
  });

  it('amountAtRate: caso del brief, USD 600 a 1560 = 936000', () => {
    expect(amountAtRate(600, 1560)).toBe(936000);
    expect(amountAtRate(100, 1560)).toBe(156000);
  });

  it('amountAtRate redondea al entero más cercano', () => {
    expect(amountAtRate(3, 1234.5678)).toBe(3704);
    expect(amountAtRate(1, 1560.4999)).toBe(1560);
    expect(amountAtRate(1, 1560.5)).toBe(1561);
  });
});

describe('cleanReceiptLinks', () => {
  it('recorta espacios y descarta las filas vacías', () => {
    expect(
      cleanReceiptLinks([
        { label: '  Factura ', url: ' https://x.com/a ' },
        { label: '', url: '  ' },
        { label: '', url: 'https://x.com/b' },
      ])
    ).toEqual([
      { label: 'Factura', url: 'https://x.com/a' },
      { label: '', url: 'https://x.com/b' },
    ]);
  });
});

describe('diffExpenseUpdate (DI-09)', () => {
  const original = {
    id: 7,
    country: 'AR',
    concept: 'Alquiler',
    beneficiary: 'Inmobiliaria',
    costCenterId: 3,
    costCenterName: 'Alquileres',
    imputationMonth: '2026-11',
    amount: 100,
    currency: 'ARS',
    amountStatus: 'confirmado',
    fxRate: null,
    allocations: [
      { branchId: 1, branchName: 'Sede 1', amount: 60, amountInCountryCurrency: 60 },
      { branchId: null, branchName: 'Casa Matriz', amount: 40, amountInCountryCurrency: 40 },
    ],
    receiptLinks: [{ label: 'Factura', url: 'https://x.com/a' }],
    notes: 'Nota',
  } as unknown as ExpenseRecordDetail;

  const same: ExpenseFormValues = {
    concept: 'Alquiler',
    beneficiary: 'Inmobiliaria',
    costCenterId: 3,
    imputationMonth: '2026-11',
    amount: 100,
    amountStatus: 'confirmado',
    fxRate: null,
    receiptLinks: [{ label: 'Factura', url: 'https://x.com/a' }],
    notes: 'Nota',
    allocations: [
      { branchId: null, amount: 40 },
      { branchId: 1, amount: 60 },
    ],
  };

  it('sin cambios: PATCH vacío y sin motivo', () => {
    expect(diffExpenseUpdate(original, same)).toEqual({
      changes: {},
      needsReason: false,
      hasChanges: false,
    });
  });

  it('cambiar el concepto, el rubro o los links manda solo eso y no pide motivo', () => {
    const r = diffExpenseUpdate(original, {
      ...same,
      concept: ' Alquiler noviembre ',
      costCenterId: 4,
      receiptLinks: [],
    });
    expect(r.changes).toEqual({
      concept: 'Alquiler noviembre',
      costCenterId: 4,
      receiptLinks: [],
    });
    expect(r.needsReason).toBe(false);
    expect(r.hasChanges).toBe(true);
  });

  it('cambiar el importe pide motivo y manda el reparto completo', () => {
    const allocations = [
      { branchId: 1, amount: 90 },
      { branchId: null, amount: 60 },
    ];
    const r = diffExpenseUpdate(original, { ...same, amount: 150, allocations });
    expect(r.changes).toEqual({ amount: 150, allocations });
    expect(r.needsReason).toBe(true);
  });

  it('cambiar solo el estado del importe pide motivo y no toca el reparto', () => {
    const r = diffExpenseUpdate(original, { ...same, amountStatus: 'estimado' });
    expect(r.changes).toEqual({ amountStatus: 'estimado' });
    expect(r.needsReason).toBe(true);
  });

  it('cambiar solo el reparto no pide motivo', () => {
    const allocations = [
      { branchId: 1, amount: 50 },
      { branchId: null, amount: 50 },
    ];
    const r = diffExpenseUpdate(original, { ...same, allocations });
    expect(r.changes).toEqual({ allocations });
    expect(r.needsReason).toBe(false);
  });

  it('el tipo de cambio solo cuenta en gastos en dólares de Argentina', () => {
    const ars = diffExpenseUpdate(original, { ...same, fxRate: 1560 });
    expect(ars.hasChanges).toBe(false);
    const usd = {
      ...original,
      currency: 'USD',
      fxRate: 1500,
    } as unknown as ExpenseRecordDetail;
    const r = diffExpenseUpdate(usd, { ...same, fxRate: 1560 });
    expect(r.changes).toEqual({ fxRate: 1560 });
    expect(r.needsReason).toBe(true);
    expect(diffExpenseUpdate(usd, { ...same, fxRate: 1500 }).hasChanges).toBe(false);
  });

  it('vaciar beneficiario y observaciones manda null', () => {
    const r = diffExpenseUpdate(original, { ...same, beneficiary: '  ', notes: '' });
    expect(r.changes).toEqual({ beneficiary: null, notes: null });
    expect(r.needsReason).toBe(false);
  });

  it('un beneficiario y observaciones nulos en el original no cuentan como cambio si siguen vacíos', () => {
    const sinDatos = {
      ...original,
      beneficiary: null,
      notes: null,
    } as unknown as ExpenseRecordDetail;
    expect(diffExpenseUpdate(sinDatos, { ...same, beneficiary: '', notes: '' }).hasChanges).toBe(
      false
    );
  });
});

describe('paymentDateError (DI-05)', () => {
  const hoy = '2026-11-12';

  it('hoy y una fecha pasada sin corte están bien', () => {
    expect(paymentDateError('2026-11-12', hoy, null)).toBeNull();
    expect(paymentDateError('2026-10-01', hoy, null)).toBeNull();
  });

  it('una fecha futura se rechaza', () => {
    expect(paymentDateError('2026-11-13', hoy, null)).toEqual({ kind: 'future' });
  });

  it('vacía o mal escrita es obligatoria', () => {
    expect(paymentDateError('', hoy, null)).toEqual({ kind: 'required' });
    expect(paymentDateError('2026-13-01', hoy, null)).toEqual({ kind: 'required' });
    expect(paymentDateError('2026-02-30', hoy, null)).toEqual({ kind: 'required' });
    expect(paymentDateError('12/11/2026', hoy, null)).toEqual({ kind: 'required' });
  });

  it('anterior al corte de la cuenta se rechaza y trae la fecha del corte', () => {
    expect(paymentDateError('2026-09-30', hoy, '2026-10-01')).toEqual({
      kind: 'beforeCutoff',
      cutoffDate: '2026-10-01',
    });
  });

  it('el mismo día del corte está bien', () => {
    expect(paymentDateError('2026-10-01', hoy, '2026-10-01')).toBeNull();
  });
});

describe('paymentOverpayState (DI-05)', () => {
  it('lo que cancela hasta lo pendiente está bien, sea cual sea el estado del importe', () => {
    expect(paymentOverpayState(100, 100, 'confirmado')).toBe('ok');
    expect(paymentOverpayState(40, 100, 'confirmado')).toBe('ok');
    expect(paymentOverpayState(100, 100, 'estimado')).toBe('ok');
  });

  it('pasarse en un gasto confirmado se bloquea', () => {
    expect(paymentOverpayState(101, 100, 'confirmado')).toBe('blocked');
  });

  it('pasarse en un gasto estimado se avisa pero se deja', () => {
    expect(paymentOverpayState(101, 100, 'estimado')).toBe('warning');
  });

  it('sin importe calculable no se evalúa', () => {
    expect(paymentOverpayState(null, 100, 'confirmado')).toBe('ok');
  });

  it('un gasto sin saldo pendiente no admite más pagos si está confirmado', () => {
    expect(paymentOverpayState(1, 0, 'confirmado')).toBe('blocked');
  });
});

describe('sumPendingByCurrency', () => {
  it('suma por moneda sin mezclarlas, ordenadas por código', () => {
    const rows = [
      { currency: 'USD', pending: 500 },
      { currency: 'ARS', pending: 120000 },
      { currency: 'ARS', pending: 30000 },
      { currency: 'USD', pending: 250 },
    ];
    expect(sumPendingByCurrency(rows)).toEqual([
      { currency: 'ARS', total: 150000 },
      { currency: 'USD', total: 750 },
    ]);
  });

  it('sin filas no hay totales', () => {
    expect(sumPendingByCurrency([])).toEqual([]);
  });
});

describe('historyEntryLines (DI-09)', () => {
  // Intl pone un espacio duro entre el símbolo y el número: se normaliza lo que
  // sale de la función; los textos esperados están escritos a mano.
  const norm = (r: { title: string; lines: string[] }) => ({
    title: r.title,
    lines: r.lines.map((l) => l.replace(/\u00a0/g, ' ')),
  });
  const entry = (action: string, payload: Record<string, unknown>): ExpenseHistoryItem => ({
    id: 1,
    at: '2026-11-05T12:00:00.000Z',
    actorName: 'Ana',
    action,
    reason: null,
    payload,
  });
  const ars = { currency: 'ARS' };

  it('alta: título e importe con su estado', () => {
    const r = historyEntryLines(
      entry('expense_record_created', {
        concept: 'Alquiler',
        amount: 150000,
        currency: 'ARS',
        amountStatus: 'estimado',
      }),
      ars
    );
    expect(norm(r)).toEqual({
      title: 'Alta del gasto',
      lines: ['Importe: $ 150.000 · Estimado'],
    });
  });

  it('alta en USD usa la moneda del payload y "Confirmado"', () => {
    const r = historyEntryLines(
      entry('expense_record_created', { amount: 600, currency: 'USD', amountStatus: 'confirmado' }),
      ars
    );
    expect(norm(r).lines).toEqual(['Importe: US$ 600 · Confirmado']);
  });

  it('corrección de importe: anterior → nuevo', () => {
    const r = historyEntryLines(
      entry('expense_record_update', { changes: { amount: { before: 100000, after: 120000 } } }),
      ars
    );
    expect(norm(r)).toEqual({
      title: 'Corrección',
      lines: ['Importe: $ 100.000 → $ 120.000'],
    });
  });

  it('corrección de estado del importe y de tipo de cambio', () => {
    const r = historyEntryLines(
      entry('expense_record_update', {
        changes: {
          fxRate: { before: 1560, after: 1580 },
          amountStatus: { before: 'estimado', after: 'confirmado' },
        },
      }),
      { currency: 'USD' }
    );
    // Orden fijo: estado del importe antes que tipo de cambio.
    expect(r.lines).toEqual([
      'Estado del importe: Estimado → Confirmado',
      'Tipo de cambio: 1.560 → 1.580',
    ]);
  });

  it('tipo de cambio que llega como string de DECIMAL y valor nulo', () => {
    const r = historyEntryLines(
      entry('expense_record_update', { changes: { fxRate: { before: '1560.0000', after: null } } }),
      { currency: 'USD' }
    );
    expect(r.lines).toEqual(['Tipo de cambio: 1.560 → —']);
  });

  it('rubro: usa el nombre si se pasa y "rubro #id" si no', () => {
    const e = entry('expense_record_update', {
      changes: { costCenterId: { before: 3, after: 7 } },
    });
    expect(
      historyEntryLines(e, { currency: 'ARS', costCenterNames: { 3: 'Alquileres', 7: 'Limpieza' } })
        .lines
    ).toEqual(['Rubro: Alquileres → Limpieza']);
    expect(historyEntryLines(e, ars).lines).toEqual(['Rubro: rubro #3 → rubro #7']);
    expect(
      historyEntryLines(e, { currency: 'ARS', costCenterNames: { 3: 'Alquileres' } }).lines
    ).toEqual(['Rubro: Alquileres → rubro #7']);
  });

  it('otros campos: concepto, beneficiario, mes, comprobantes y observaciones', () => {
    const r = historyEntryLines(
      entry('expense_record_update', {
        changes: {
          notes: { before: null, after: 'Texto largo' },
          receiptLinks: { before: [], after: [{ label: '', url: 'https://a.com' }] },
          imputationMonth: { before: '2026-10', after: '2026-11' },
          beneficiary: { before: null, after: 'Proveedor SA' },
          concept: { before: 'Luz', after: 'Luz octubre' },
        },
      }),
      ars
    );
    expect(r.lines).toEqual([
      'Concepto: Luz → Luz octubre',
      'Beneficiario: sin beneficiario → Proveedor SA',
      'Mes de imputación: Octubre 2026 → Noviembre 2026',
      'Comprobantes: 0 → 1',
      'Observaciones modificadas',
    ]);
  });

  it('reparto corregido se agrega al final', () => {
    const r = historyEntryLines(
      entry('expense_record_update', {
        changes: { amount: { before: 10, after: 20 } },
        allocations: {
          before: [{ branchId: 1, amount: 10 }],
          after: [{ branchId: 1, amount: 20 }],
        },
      }),
      ars
    );
    expect(norm(r).lines).toEqual(['Importe: $ 10 → $ 20', 'Reparto corregido']);
  });

  it('solo reparto (sin changes): "Reparto corregido"', () => {
    const r = historyEntryLines(
      entry('expense_record_update', { allocations: { before: [], after: [] } }),
      ars
    );
    expect(r).toEqual({ title: 'Corrección', lines: ['Reparto corregido'] });
  });

  it('un campo desconocido en changes no rompe', () => {
    const r = historyEntryLines(
      entry('expense_record_update', { changes: { campoNuevo: { before: 1, after: 2 } } }),
      ars
    );
    expect(r.lines).toEqual(['campoNuevo: modificado']);
  });

  it('pago registrado: importe en la moneda de la cuenta y fecha', () => {
    const r = historyEntryLines(
      entry('expense_payment_registered', {
        paymentId: 5,
        paidOn: '2026-11-05',
        paymentMethod: 'transfer',
        amount: 90000,
        currency: 'ARS',
        appliedAmount: 90000,
        fxRate: null,
      }),
      ars
    );
    expect(norm(r)).toEqual({
      title: 'Pago registrado',
      lines: ['Importe: $ 90.000 · Fecha de pago: 05/11/2026', 'Medio: Transferencia'],
    });
  });

  it('pago en otra moneda: muestra el tipo de cambio y cuánto canceló del gasto', () => {
    const r = historyEntryLines(
      entry('expense_payment_registered', {
        paidOn: '2026-11-05',
        paymentMethod: 'cash',
        amount: 156000,
        currency: 'ARS',
        appliedAmount: 100,
        fxRate: 1560,
      }),
      { currency: 'USD' }
    );
    expect(norm(r).lines).toEqual([
      'Importe: $ 156.000 · Fecha de pago: 05/11/2026',
      'Medio: Efectivo',
      'Tipo de cambio: 1.560',
      'Cancela US$ 100 del gasto',
    ]);
  });

  it('pago anulado y gasto anulado', () => {
    expect(
      norm(
        historyEntryLines(
          entry('expense_payment_voided', { paymentId: 5, amount: 90000, currency: 'ARS' }),
          ars
        )
      )
    ).toEqual({ title: 'Pago anulado', lines: ['Importe: $ 90.000'] });
    expect(
      historyEntryLines(entry('expense_record_voided', { concept: 'X', amount: 1 }), ars)
    ).toEqual({
      title: 'Gasto anulado',
      lines: [],
    });
  });

  it('acción desconocida: título con el texto de la acción, sin romper', () => {
    expect(historyEntryLines(entry('expense_algo_nuevo', { x: 1 }), ars)).toEqual({
      title: 'expense_algo_nuevo',
      lines: [],
    });
    expect(historyEntryLines(entry('', {}), ars).title).toBe('Movimiento del gasto');
  });

  it('payload con otra forma (null, array, changes no objeto) no rompe', () => {
    const bad = (payload: unknown): ExpenseHistoryItem =>
      ({ ...entry('expense_record_update', {}), payload }) as unknown as ExpenseHistoryItem;
    expect(historyEntryLines(bad(null), ars)).toEqual({ title: 'Corrección', lines: [] });
    expect(historyEntryLines(bad([1, 2]), ars)).toEqual({ title: 'Corrección', lines: [] });
    expect(historyEntryLines(bad({ changes: 'x' }), ars)).toEqual({
      title: 'Corrección',
      lines: [],
    });
    expect(norm(historyEntryLines(bad({ changes: { amount: 5 } }), ars)).lines).toEqual([]);
  });
});

describe('formatFxRate', () => {
  it('separador de miles y coma decimal, hasta 4 decimales', () => {
    expect(formatFxRate(1560)).toBe('1.560');
    expect(formatFxRate(1560.5)).toBe('1.560,5');
    expect(formatFxRate(0.8765)).toBe('0,8765');
  });
});

describe('resultado por sede', () => {
  it('formatMarginPct: 1 decimal con coma, sin miles', () => {
    expect(formatMarginPct(12.3)).toBe('12,3 %');
    expect(formatMarginPct(-50)).toBe('-50,0 %');
    expect(formatMarginPct(0)).toBe('0,0 %');
    expect(formatMarginPct(100)).toBe('100,0 %');
    expect(formatMarginPct(1234.5)).toBe('1234,5 %');
  });

  it('formatMarginPct: un negativo que redondea a cero no lleva signo', () => {
    expect(formatMarginPct(-0.04)).toBe('0,0 %');
  });

  it('resultMarginLabel: Casa Matriz, sin base de cálculo y porcentaje', () => {
    expect(resultMarginLabel({ kind: 'casa_matriz', marginPct: null })).toBe('—');
    expect(resultMarginLabel({ kind: 'branch', marginPct: null })).toBe('sin base de cálculo');
    expect(resultMarginLabel({ kind: 'consolidado', marginPct: 22.2 })).toBe('22,2 %');
    expect(resultMarginLabel({ kind: 'branch', marginPct: -6.5 })).toBe('-6,5 %');
  });

  it('resultColumnLabel: marca de inactiva y de virtual', () => {
    expect(resultColumnLabel({ name: 'Sede A', isActive: true, isVirtual: false })).toBe('Sede A');
    expect(resultColumnLabel({ name: 'Online', isActive: true, isVirtual: true })).toBe(
      'Online (virtual)'
    );
    expect(resultColumnLabel({ name: 'Cerrada', isActive: false, isVirtual: false })).toBe(
      'Cerrada (inactiva)'
    );
    expect(resultColumnLabel({ name: 'Vieja online', isActive: false, isVirtual: true })).toBe(
      'Vieja online (inactiva, virtual)'
    );
  });

  it("resultDetailDestination: el Consolidado pide 'total'", () => {
    expect(resultDetailDestination({ kind: 'consolidado', key: 'consolidado' })).toBe('total');
    expect(resultDetailDestination({ kind: 'casa_matriz', key: 'casa_matriz' })).toBe(
      'casa_matriz'
    );
    expect(resultDetailDestination({ kind: 'branch', key: '12' })).toBe('12');
  });

  it('foreignIncomeNotice: vacío, un cobro y varios cobros', () => {
    expect(foreignIncomeNotice([])).toBe('');
    expect(
      foreignIncomeNotice([{ branchName: 'Sede A', currency: 'EUR', count: 1, amount: 100 }])
    ).toBe(`1 cobro en otra moneda no incluido: Sede A ${formatPrice(100, 'EUR')}.`);
    expect(
      foreignIncomeNotice([
        { branchName: 'Sede A', currency: 'USD', count: 2, amount: 300 },
        { branchName: 'Sede B', currency: 'EUR', count: 1, amount: 40 },
      ])
    ).toBe(
      `3 cobros en otra moneda no incluidos: Sede A ${formatPrice(300, 'USD')} (2 cobros), Sede B ${formatPrice(40, 'EUR')}.`
    );
  });

  it('incompleteExpensesText: los textos que ya mostraba el Resumen', () => {
    expect(
      incompleteExpensesText({ total: 0, estimated: 0, missingReceipts: 0, missingFxRate: 0 })
    ).toBe('');
    expect(
      incompleteExpensesText({ total: 1, estimated: 1, missingReceipts: 0, missingFxRate: 0 })
    ).toBe('1 gasto de este mes tiene datos incompletos: 1 estimado.');
    expect(
      incompleteExpensesText({ total: 3, estimated: 2, missingReceipts: 1, missingFxRate: 1 })
    ).toBe(
      '3 gastos de este mes tienen datos incompletos: 2 estimados, 1 sin comprobante, 1 sin tipo de cambio.'
    );
    expect(
      incompleteExpensesText({ total: 2, estimated: 0, missingReceipts: 0, missingFxRate: 0 })
    ).toBe('2 gastos de este mes tienen datos incompletos.');
  });

  it('expenseCurrencyNote: pesos con dólares convertidos o euros', () => {
    expect(expenseCurrencyNote('AR')).toBe(
      'Importes en pesos. Los gastos en dólares se convierten con su tipo de cambio de referencia.'
    );
    expect(expenseCurrencyNote('ES')).toBe('Importes en euros.');
  });

  it('constantes: clave del Consolidado y nota al pie de DI-12', () => {
    expect(RESULT_CONSOLIDATED_KEY).toBe('consolidado');
    expect(RESULT_FOOTNOTE).toBe(
      'Cobros: pagos de alumnos por fecha de pago, según la sede del alumno. Costos: gastos imputados al mes, incluidos los estimados. Las devoluciones no se restan.'
    );
  });
});
