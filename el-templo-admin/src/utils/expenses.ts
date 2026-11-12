/**
 * Egresos (fase 209): ayudas de cálculo y etiquetas del admin. Funciones puras.
 *
 * ESPEJO de `el-templo-api/src/modules/finance/expense-math.ts`
 * (`splitEvenly`, `computePaymentAmounts`, `expenseStatusOf`, `MAX_MONEY`,
 * `isHttpUrl`). Cualquier cambio de criterio se hace en los dos lados y en sus
 * tests (`el-templo-api/test/unit/expense-math.test.ts` y
 * `src/utils/__tests__/expenses.test.ts`). El admin solo sirve para mostrar y
 * guiar el formulario: la API vuelve a calcular y validar todo.
 *
 * Plata en ENTEROS (D-23). El único decimal es el tipo de cambio (`fxRate`,
 * pesos por unidad de moneda extranjera), que se usa una vez para calcular un
 * entero con `Math.round`.
 */
import type {
  ExpenseAmountStatus,
  ExpenseCountry,
  ExpenseCurrency,
  ExpensePaymentMethod,
  ExpensePaymentStatus,
} from '../types/expense';
import { isMethodAllowedForAccount, type AccountType } from './payment-method-rules';

/** Tope de un importe (`int` de MySQL con margen). Igual que la API. */
export const MAX_MONEY = 2_000_000_000;

/** Entero entre 1 y `MAX_MONEY`: lo que acepta la API como importe. */
export function isValidMoneyInteger(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= MAX_MONEY;
}

// ---------------------------------------------------------------------------
// Reparto (DI-08)
// ---------------------------------------------------------------------------

/**
 * Partes iguales: `floor(total / n)` para todas y el resto a la última (DI-08).
 * `n <= 0` devuelve `[]`. Mismo resultado que `splitEvenly` de la API.
 */
export function splitEvenly(total: number, n: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor(total / n);
  const parts = new Array<number>(n).fill(base);
  parts[n - 1] = total - base * (n - 1);
  return parts;
}

/** Suma de las partes del reparto; una parte vacía (`null`) cuenta como 0. */
export function allocationsSum(rows: ReadonlyArray<{ amount: number | null }>): number {
  return rows.reduce((acc, r) => acc + (r.amount ?? 0), 0);
}

/**
 * Lo que falta (positivo) o sobra (negativo) del reparto respecto del importe
 * del gasto. 0 = el reparto cierra.
 */
export function allocationDifference(
  amount: number,
  rows: ReadonlyArray<{ amount: number | null }>
): number {
  return amount - allocationsSum(rows);
}

// ---------------------------------------------------------------------------
// Moneda y tipo de cambio (DI-03)
// ---------------------------------------------------------------------------

/** El gasto necesita tipo de cambio para conocer su costo: solo Argentina con USD. */
export function needsExpenseFx(country: ExpenseCountry, currency: ExpenseCurrency): boolean {
  return country === 'AR' && currency === 'USD';
}

/**
 * El pago necesita tipo de cambio: la cuenta y el gasto están en monedas
 * distintas, o (Argentina) la cuenta no es en pesos y hay que expresar el pago
 * en pesos. Misma condición que `computePaymentAmounts`.
 */
export function paymentNeedsFx(params: {
  country: ExpenseCountry;
  accountCurrency: string;
  expenseCurrency: ExpenseCurrency;
}): boolean {
  const { country, accountCurrency, expenseCurrency } = params;
  return accountCurrency !== expenseCurrency || (country === 'AR' && accountCurrency !== 'ARS');
}

export interface PaymentPreview {
  /** el pago necesita tipo de cambio */
  needsFx: boolean;
  /** entero, en la moneda del gasto; null si todavía no se puede calcular */
  appliedAmount: number | null;
  /** entero, en pesos; null en España o si todavía no se puede calcular */
  amountArs: number | null;
}

/**
 * Vista previa de un pago (misma tabla que `computePaymentAmounts` de la API).
 * `fxRate` = pesos por unidad de la otra moneda. En vez de tirar, devuelve
 * `null` cuando falta un dato (importe inválido, tipo de cambio faltante o
 * inválido) para que el formulario muestre el cálculo a medida que se tipea.
 *
 * | país | cuenta | gasto | applied (moneda del gasto) | amountArs          |
 * |------|--------|-------|----------------------------|--------------------|
 * | AR   | ARS    | ARS   | amount                     | amount             |
 * | AR   | ARS    | USD   | round(amount / fx)         | amount             |
 * | AR   | USD    | USD   | amount                     | round(amount * fx) |
 * | AR   | USD    | ARS   | round(amount * fx)         | round(amount * fx) |
 * | ES   | EUR    | EUR   | amount                     | null               |
 */
export function previewPayment(params: {
  country: ExpenseCountry;
  accountCurrency: string;
  expenseCurrency: ExpenseCurrency;
  amount: number | null | undefined;
  fxRate?: number | null;
}): PaymentPreview {
  const { country, accountCurrency, expenseCurrency, amount } = params;
  const needsFx = paymentNeedsFx({ country, accountCurrency, expenseCurrency });
  const empty: PaymentPreview = { needsFx, appliedAmount: null, amountArs: null };

  if (!isValidMoneyInteger(amount)) return empty;

  if (!needsFx) {
    return { needsFx, appliedAmount: amount, amountArs: country === 'AR' ? amount : null };
  }

  const fx = params.fxRate ?? null;
  if (fx === null || typeof fx !== 'number' || !Number.isFinite(fx) || fx <= 0) return empty;

  let appliedAmount: number;
  let amountArs: number;
  if (accountCurrency === 'ARS') {
    // Cuenta en pesos, gasto en USD.
    appliedAmount = Math.round(amount / fx);
    amountArs = amount;
  } else if (expenseCurrency === 'USD') {
    // Cuenta en USD, gasto en USD.
    appliedAmount = amount;
    amountArs = Math.round(amount * fx);
  } else {
    // Cuenta en USD, gasto en ARS.
    amountArs = Math.round(amount * fx);
    appliedAmount = amountArs;
  }
  if (appliedAmount < 1 || appliedAmount > MAX_MONEY || amountArs > MAX_MONEY) return empty;
  return { needsFx, appliedAmount, amountArs };
}

// ---------------------------------------------------------------------------
// Estado del gasto (DI-11) y etiquetas
// ---------------------------------------------------------------------------

/**
 * Estado de pago del gasto (DI-11). `paid` es la suma de lo aplicado por los
 * pagos vigentes, en la moneda del gasto. Mismo criterio que la API.
 */
export function expenseStatusOf(
  amount: number,
  paid: number
): { status: ExpensePaymentStatus; pending: number; overpaid: boolean } {
  const status: ExpensePaymentStatus =
    paid <= 0 ? 'pendiente' : paid >= amount ? 'pagado' : 'parcial';
  return {
    status,
    pending: Math.max(amount - paid, 0),
    overpaid: paid > amount,
  };
}

export const EXPENSE_STATUS_META: Record<ExpensePaymentStatus, { label: string; color: string }> = {
  pendiente: { label: 'Pendiente', color: 'deep-orange' },
  parcial: { label: 'Parcial', color: 'amber-8' },
  pagado: { label: 'Pagado', color: 'positive' },
};

export const AMOUNT_STATUS_LABELS: Record<ExpenseAmountStatus, string> = {
  estimado: 'Estimado',
  confirmado: 'Confirmado',
};

/** Etiquetas de los medios de pago de un egreso ("Débito automático", no "Domiciliación"). */
export const EXPENSE_PAYMENT_METHOD_LABELS: Record<ExpensePaymentMethod, string> = {
  cash: 'Efectivo',
  transfer: 'Transferencia',
  card: 'Tarjeta',
  cheque: 'Cheque',
  direct_debit: 'Débito automático',
};

const ALL_EXPENSE_PAYMENT_METHODS: readonly ExpensePaymentMethod[] = [
  'cash',
  'transfer',
  'card',
  'cheque',
  'direct_debit',
];

/** Medios de pago que admite una cuenta (efectivo: solo `cash`; banco: el resto). */
export function paymentMethodsForAccount(type: AccountType): ExpensePaymentMethod[] {
  return ALL_EXPENSE_PAYMENT_METHODS.filter((m) => isMethodAllowedForAccount(m, type));
}

// ---------------------------------------------------------------------------
// Meses y links
// ---------------------------------------------------------------------------

const MONTH_NAMES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

/** `YYYY-MM` con mes 01-12 y año 2000-2099 (igual que la API). */
export function isValidMonth(month: string): boolean {
  if (typeof month !== 'string') return false;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return false;
  const year = Number(month.slice(0, 4));
  return year >= 2000 && year <= 2099;
}

/** `'2026-11'` -> `'Noviembre 2026'`. Un mes inválido se devuelve tal cual. */
export function monthLabel(month: string): string {
  if (!isValidMonth(month)) return month;
  return `${MONTH_NAMES[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;
}

/** Corre un mes `n` meses (negativo = hacia atrás): `shiftMonth('2026-01', -1)` = `'2025-12'`. */
export function shiftMonth(month: string, n: number): string {
  const year = Number(month.slice(0, 4));
  const idx = year * 12 + (Number(month.slice(5, 7)) - 1) + n;
  const y = Math.floor(idx / 12);
  const m = (idx % 12) + 1;
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}`;
}

/** `http://` o `https://` con una URL parseable (igual que la API). */
export function isHttpUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}
