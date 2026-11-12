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
  ExpenseAllocationInput,
  ExpenseAmountStatus,
  ExpenseCountry,
  ExpenseCurrency,
  ExpenseHistoryItem,
  ExpensePaymentMethod,
  ExpensePaymentStatus,
  ExpenseRecordDetail,
  ReceiptLink,
  UpdateExpenseRecordInput,
} from '../types/expense';
import { formatPrice } from './format-price';
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

/**
 * Valor de un `q-input type="number"` como número: `v-model.number` deja un
 * string vacío cuando se borra el campo. Cualquier cosa que no sea un número
 * finito (o un string numérico) da `null`.
 */
export function toNumberOrNull(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Regla de `q-input` para un importe entero positivo (devuelve `true` o el mensaje). */
export function moneyIntegerRule(v: unknown): true | string {
  return isValidMoneyInteger(toNumberOrNull(v)) || 'Ingresá un importe entero mayor a 0';
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

/**
 * Resto de la división en partes iguales: lo que `splitEvenly` suma de más a
 * la última parte (`total` menos `floor(total / n)` por `n`). `n <= 0` da 0.
 */
export function splitEvenlyRemainder(total: number, n: number): number {
  if (n <= 0) return 0;
  const parts = splitEvenly(total, n);
  return parts[n - 1] - parts[0];
}

/**
 * Dos repartos son iguales si tienen los mismos destinos con los mismos
 * importes, sin importar el orden (mismo criterio que la API al decidir si el
 * reparto cambió).
 */
export function sameAllocations(
  a: ReadonlyArray<ExpenseAllocationInput>,
  b: ReadonlyArray<ExpenseAllocationInput>
): boolean {
  if (a.length !== b.length) return false;
  const key = (list: ReadonlyArray<ExpenseAllocationInput>): string =>
    JSON.stringify(
      [...list]
        .sort((x, y) => (x.branchId ?? -1) - (y.branchId ?? -1))
        .map((r) => [r.branchId, r.amount])
    );
  return key(a) === key(b);
}

// ---------------------------------------------------------------------------
// Moneda y tipo de cambio (DI-03)
// ---------------------------------------------------------------------------

/** El gasto necesita tipo de cambio para conocer su costo: solo Argentina con USD. */
export function needsExpenseFx(country: ExpenseCountry, currency: ExpenseCurrency): boolean {
  return country === 'AR' && currency === 'USD';
}

/**
 * Tipo de cambio válido: mayor a 0, hasta 4 decimales y dentro del rango de
 * DECIMAL(12,4). Misma condición que `assertValidFxRate` de la API.
 */
export function isValidFxRate(v: unknown): v is number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0 || v > 99_999_999.9999) return false;
  const scaled = v * 10_000;
  return Math.abs(scaled - Math.round(scaled)) < 1e-6;
}

/** Equivalente de un importe a un tipo de cambio: `Math.round(importe × tc)` (como la API). */
export function amountAtRate(amount: number, fxRate: number): number {
  return Math.round(amount * fxRate);
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
// Pago de un gasto (DI-05): guardas que la pantalla anticipa (la API decide)
// ---------------------------------------------------------------------------

/** `YYYY-MM-DD` que existe en el calendario. */
function isValidIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/**
 * Errores de la fecha de un pago, o `null` si está bien: obligatoria, no
 * futura (`today` es la fecha de hoy del gimnasio) y no anterior al corte de
 * la cuenta (`cutoffDate`, null si todavía no se eligió cuenta). Las fechas
 * son strings `YYYY-MM-DD`, que se comparan bien como texto.
 */
export function paymentDateError(
  paidOn: string,
  today: string,
  cutoffDate: string | null
): { kind: 'required' | 'future' | 'beforeCutoff'; cutoffDate?: string } | null {
  if (!isValidIsoDate(paidOn)) return { kind: 'required' };
  if (paidOn > today) return { kind: 'future' };
  if (cutoffDate !== null && paidOn < cutoffDate) return { kind: 'beforeCutoff', cutoffDate };
  return null;
}

/**
 * Qué pasa si el pago cancela más de lo que falta: gasto confirmado = no se
 * deja (`blocked`), gasto estimado = se deja pero se avisa (`warning`).
 * `applied` es lo que cancela del gasto (moneda del gasto), null si todavía no
 * se puede calcular.
 */
export function paymentOverpayState(
  applied: number | null,
  pending: number,
  amountStatus: ExpenseAmountStatus
): 'ok' | 'warning' | 'blocked' {
  if (applied === null || applied <= pending) return 'ok';
  return amountStatus === 'estimado' ? 'warning' : 'blocked';
}

/** Suma lo pendiente por moneda (los gastos pueden estar en ARS, USD o EUR; nunca se mezclan). */
export function sumPendingByCurrency(
  rows: ReadonlyArray<{ currency: string; pending: number }>
): Array<{ currency: string; total: number }> {
  const totals = new Map<string, number>();
  for (const r of rows) totals.set(r.currency, (totals.get(r.currency) ?? 0) + r.pending);
  return [...totals.entries()]
    .map(([currency, total]) => ({ currency, total }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
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

// ---------------------------------------------------------------------------
// Edición del gasto (DI-09)
// ---------------------------------------------------------------------------

/** Quita espacios y descarta las filas de comprobante totalmente vacías. */
export function cleanReceiptLinks(links: ReadonlyArray<ReceiptLink>): ReceiptLink[] {
  return links
    .map((l) => ({ label: l.label.trim(), url: l.url.trim() }))
    .filter((l) => l.label !== '' || l.url !== '');
}

/** Lo que el formulario de gasto tiene cargado, ya con los tipos de la API. */
export interface ExpenseFormValues {
  concept: string;
  beneficiary: string;
  costCenterId: number;
  imputationMonth: string;
  amount: number;
  amountStatus: ExpenseAmountStatus;
  fxRate: number | null;
  receiptLinks: ReadonlyArray<ReceiptLink>;
  notes: string;
  allocations: ReadonlyArray<ExpenseAllocationInput>;
}

/**
 * Qué cambió respecto del gasto guardado: el PATCH lleva SOLO los campos que
 * cambiaron. El reparto va completo si cambió el reparto o el importe (la API
 * lo exige con el importe). `needsReason`: cambiar importe, estado del importe
 * o tipo de cambio exige motivo (la API da 400 sin él). El país y la moneda no
 * se editan, y el tipo de cambio solo cuenta en gastos en dólares de Argentina.
 */
export function diffExpenseUpdate(
  original: ExpenseRecordDetail,
  values: ExpenseFormValues
): { changes: UpdateExpenseRecordInput; needsReason: boolean; hasChanges: boolean } {
  const changes: UpdateExpenseRecordInput = {};

  const concept = values.concept.trim();
  if (concept !== original.concept) changes.concept = concept;

  const beneficiary = values.beneficiary.trim() === '' ? null : values.beneficiary.trim();
  const originalBeneficiary = (original.beneficiary ?? '').trim() || null;
  if (beneficiary !== originalBeneficiary) changes.beneficiary = beneficiary;

  if (values.costCenterId !== original.costCenterId) changes.costCenterId = values.costCenterId;
  if (values.imputationMonth !== original.imputationMonth) {
    changes.imputationMonth = values.imputationMonth;
  }

  const amountChanged = values.amount !== original.amount;
  if (amountChanged) changes.amount = values.amount;
  const statusChanged = values.amountStatus !== original.amountStatus;
  if (statusChanged) changes.amountStatus = values.amountStatus;
  const fxChanged =
    needsExpenseFx(original.country, original.currency) && values.fxRate !== original.fxRate;
  if (fxChanged) changes.fxRate = values.fxRate;

  const links = cleanReceiptLinks(values.receiptLinks);
  const linkKey = (list: ReadonlyArray<ReceiptLink>): string =>
    JSON.stringify(list.map((l) => [l.label.trim(), l.url.trim()]));
  if (linkKey(links) !== linkKey(original.receiptLinks)) changes.receiptLinks = links;

  const notes = values.notes.trim() === '' ? null : values.notes.trim();
  const originalNotes = (original.notes ?? '').trim() || null;
  if (notes !== originalNotes) changes.notes = notes;

  const originalAllocations = original.allocations.map((a) => ({
    branchId: a.branchId,
    amount: a.amount,
  }));
  if (amountChanged || !sameAllocations(originalAllocations, values.allocations)) {
    changes.allocations = values.allocations.map((a) => ({
      branchId: a.branchId,
      amount: a.amount,
    }));
  }

  return {
    changes,
    needsReason: amountChanged || statusChanged || fxChanged,
    hasChanges: Object.keys(changes).length > 0,
  };
}

// ---------------------------------------------------------------------------
// Historial del gasto (DI-09): texto legible de cada entrada del audit_log
// ---------------------------------------------------------------------------

/** Contexto para redactar el historial: moneda del gasto y nombres de rubros (si se tienen). */
export interface HistoryContext {
  /** moneda del gasto (los importes del historial se muestran en ella) */
  currency: string;
  /** id de rubro -> nombre; sin el id se muestra "rubro #id" */
  costCenterNames?: Record<number, string>;
}

type UnknownRecord = Record<string, unknown>;

function isRecord(v: unknown): v is UnknownRecord {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Número finito, venga como número o como string numérico (un DECIMAL puede llegar así). */
function asNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function asText(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null;
}

const FX_FORMAT = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 4, useGrouping: true });

/** Tipo de cambio para mostrar: `1560` -> `1.560`, `1560.5` -> `1.560,5`. */
export function formatFxRate(fxRate: number): string {
  return FX_FORMAT.format(fxRate);
}

/** Tipo de cambio del historial: lo que no es número se ve como "—". */
function fxText(v: unknown): string {
  const n = asNumber(v);
  return n === null ? '—' : formatFxRate(n);
}

function moneyText(v: unknown, currency: string): string {
  const n = asNumber(v);
  return n === null ? '—' : formatPrice(n, currency);
}

/** `2026-11-05` -> `05/11/2026`; cualquier otra cosa se devuelve tal cual (o "—"). */
function dateText(v: unknown): string {
  const s = asText(v);
  if (s === null) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
}

function amountStatusText(v: unknown): string {
  if (v === 'estimado' || v === 'confirmado') return AMOUNT_STATUS_LABELS[v];
  return '—';
}

function textOrDash(v: unknown, empty = '—'): string {
  return asText(v) ?? empty;
}

function linksCount(v: unknown): number {
  return Array.isArray(v) ? v.length : 0;
}

/** Texto de `before → after` de un campo editado (`{ before, after }` del payload). */
function changeLine(field: string, change: UnknownRecord, ctx: HistoryContext): string | null {
  const { before, after } = change;
  switch (field) {
    case 'concept':
      return `Concepto: ${textOrDash(before)} → ${textOrDash(after)}`;
    case 'beneficiary':
      return `Beneficiario: ${textOrDash(before, 'sin beneficiario')} → ${textOrDash(after, 'sin beneficiario')}`;
    case 'amount':
      return `Importe: ${moneyText(before, ctx.currency)} → ${moneyText(after, ctx.currency)}`;
    case 'amountStatus':
      return `Estado del importe: ${amountStatusText(before)} → ${amountStatusText(after)}`;
    case 'fxRate':
      return `Tipo de cambio: ${fxText(before)} → ${fxText(after)}`;
    case 'imputationMonth': {
      const b = asText(before);
      const a = asText(after);
      return `Mes de imputación: ${b === null ? '—' : monthLabel(b)} → ${a === null ? '—' : monthLabel(a)}`;
    }
    case 'costCenterId': {
      const name = (id: unknown): string => {
        const n = asNumber(id);
        if (n === null) return '—';
        return ctx.costCenterNames?.[n] ?? `rubro #${n}`;
      };
      return `Rubro: ${name(before)} → ${name(after)}`;
    }
    case 'receiptLinks':
      return `Comprobantes: ${linksCount(before)} → ${linksCount(after)}`;
    case 'notes':
      return 'Observaciones modificadas';
    default:
      // Un campo que esta pantalla no conoce no rompe: se avisa que cambió.
      return `${field}: modificado`;
  }
}

/** Orden en que se muestran los campos corregidos (los desconocidos van al final). */
const CHANGE_FIELD_ORDER = [
  'concept',
  'beneficiary',
  'costCenterId',
  'imputationMonth',
  'amount',
  'amountStatus',
  'fxRate',
  'receiptLinks',
  'notes',
];

/**
 * Arma el título y las líneas de una entrada del historial del gasto a partir
 * de su `action` y `payload` (los que escribe la API en `audit_log`). Pura y
 * tolerante: una acción desconocida o un payload con otra forma dan un título
 * genérico y nunca tiran. El motivo (`item.reason`) y quién/cuándo los muestra
 * la pantalla.
 */
export function historyEntryLines(
  item: ExpenseHistoryItem,
  ctx: HistoryContext
): { title: string; lines: string[] } {
  const payload: UnknownRecord = isRecord(item.payload) ? item.payload : {};

  switch (item.action) {
    case 'expense_record_created': {
      const currency = asText(payload.currency) ?? ctx.currency;
      const status = amountStatusText(payload.amountStatus);
      return {
        title: 'Alta del gasto',
        lines: [`Importe: ${moneyText(payload.amount, currency)} · ${status}`],
      };
    }

    case 'expense_record_update': {
      const lines: string[] = [];
      const changes = isRecord(payload.changes) ? payload.changes : {};
      const fields = Object.keys(changes).sort((a, b) => {
        const ia = CHANGE_FIELD_ORDER.indexOf(a);
        const ib = CHANGE_FIELD_ORDER.indexOf(b);
        return (
          (ia === -1 ? CHANGE_FIELD_ORDER.length : ia) -
          (ib === -1 ? CHANGE_FIELD_ORDER.length : ib)
        );
      });
      for (const field of fields) {
        const change = changes[field];
        if (!isRecord(change)) continue;
        const line = changeLine(field, change, ctx);
        if (line !== null) lines.push(line);
      }
      if (isRecord(payload.allocations)) lines.push('Reparto corregido');
      return { title: 'Corrección', lines };
    }

    case 'expense_payment_registered': {
      const accountCurrency = asText(payload.currency) ?? ctx.currency;
      const lines = [
        `Importe: ${moneyText(payload.amount, accountCurrency)} · Fecha de pago: ${dateText(payload.paidOn)}`,
      ];
      const method = asText(payload.paymentMethod);
      if (method !== null && method in EXPENSE_PAYMENT_METHOD_LABELS) {
        lines.push(`Medio: ${EXPENSE_PAYMENT_METHOD_LABELS[method as ExpensePaymentMethod]}`);
      }
      if (asNumber(payload.fxRate) !== null)
        lines.push(`Tipo de cambio: ${fxText(payload.fxRate)}`);
      if (accountCurrency !== ctx.currency && asNumber(payload.appliedAmount) !== null) {
        lines.push(`Cancela ${moneyText(payload.appliedAmount, ctx.currency)} del gasto`);
      }
      return { title: 'Pago registrado', lines };
    }

    case 'expense_payment_voided': {
      const accountCurrency = asText(payload.currency) ?? ctx.currency;
      return {
        title: 'Pago anulado',
        lines: [`Importe: ${moneyText(payload.amount, accountCurrency)}`],
      };
    }

    case 'expense_record_voided':
      return { title: 'Gasto anulado', lines: [] };

    default:
      return { title: textOrDash(item.action, 'Movimiento del gasto'), lines: [] };
  }
}
