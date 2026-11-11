// Módulo: finance — fase 209 (Egresos)
//
// Contratos de Egresos: tipos de entrada y salida de gasto, reparto, pago,
// opciones del formulario y Resumen. Los usan los services y las rutas de la
// API; el admin los espeja en `src/types/expense.ts` (plan 209-11).
//
// Convenciones:
//   - Plata: SIEMPRE `number` entero, en la moneda indicada (D-23). El único
//     decimal es `fxRate` (pesos por unidad de moneda extranjera, hasta 4
//     decimales), informativo: nunca se suma ni se compara entre filas.
//   - Fechas: string `YYYY-MM-DD`; mes de imputación `YYYY-MM`.
//   - Timestamps: string ISO.
import type { ExpenseAmountStatus as SchemaExpenseAmountStatus } from "../../db/schema";
import type { PaymentMethod } from "./types";

/** País del gasto. Sale del scope del request, nunca del body. */
export type ExpenseCountry = "AR" | "ES";

/** Monedas en que se puede cargar un gasto (DI-03). */
export type ExpenseCurrency = "ARS" | "USD" | "EUR";

/** Estado del importe: estimado hasta que llega la factura real. */
export type ExpenseAmountStatus = SchemaExpenseAmountStatus;

/** Estado de pago derivado de los pagos vigentes (DI-11). */
export type ExpensePaymentStatus = "pendiente" | "parcial" | "pagado";

/** Medios de pago admitidos para un egreso. */
export type ExpensePaymentMethod = Extract<
  PaymentMethod,
  "cash" | "transfer" | "card" | "cheque" | "direct_debit"
>;

/** Lista para el enum Ajv de los schemas de ruta. */
export const EXPENSE_PAYMENT_METHODS = [
  "cash",
  "transfer",
  "card",
  "cheque",
  "direct_debit",
] as const satisfies readonly ExpensePaymentMethod[];

/** Link de comprobante (solo URL, sin archivos). */
export interface ReceiptLink {
  label: string;
  url: string;
}

/** Una parte del reparto. `branchId` null = Casa Matriz. */
export interface ExpenseAllocationInput {
  branchId: number | null;
  /** entero, en la moneda del gasto */
  amount: number;
}

export interface CreateExpenseRecordInput {
  concept: string;
  beneficiary?: string | null;
  costCenterId: number;
  /** `YYYY-MM` */
  imputationMonth: string;
  /** entero, en la moneda indicada */
  amount: number;
  currency: ExpenseCurrency;
  amountStatus: ExpenseAmountStatus;
  /** pesos por unidad de moneda extranjera, hasta 4 decimales */
  fxRate?: number | null;
  receiptLinks?: ReceiptLink[];
  notes?: string | null;
  allocations: ExpenseAllocationInput[];
  idempotencyKey?: string | null;
}

export interface UpdateExpenseRecordInput {
  concept?: string;
  beneficiary?: string | null;
  costCenterId?: number;
  imputationMonth?: string;
  /** entero, en la moneda del gasto */
  amount?: number;
  amountStatus?: ExpenseAmountStatus;
  fxRate?: number | null;
  receiptLinks?: ReceiptLink[];
  notes?: string | null;
  allocations?: ExpenseAllocationInput[];
  reason?: string | null;
}

export interface ExpenseAllocationItem {
  branchId: number | null;
  branchName: string;
  /** entero, en la moneda del gasto */
  amount: number;
  /** entero, en la moneda del país; null si falta el tipo de cambio */
  amountInCountryCurrency: number | null;
}

export interface ExpenseRecordListItem {
  id: number;
  country: ExpenseCountry;
  concept: string;
  beneficiary: string | null;
  costCenterId: number;
  costCenterName: string;
  imputationMonth: string;
  /** entero, en la moneda indicada */
  amount: number;
  currency: ExpenseCurrency;
  amountStatus: ExpenseAmountStatus;
  fxRate: number | null;
  /** entero, en la moneda del país; null si falta el tipo de cambio */
  costInCountryCurrency: number | null;
  /** entero, en la moneda del gasto: suma de lo aplicado por pagos vigentes */
  paid: number;
  /** entero, en la moneda del gasto */
  pending: number;
  status: ExpensePaymentStatus;
  overpaid: boolean;
  receiptLinksCount: number;
  /** faltan datos para considerarlo completo (tipo de cambio o comprobantes) */
  incomplete: boolean;
  allocations: ExpenseAllocationItem[];
  voidedAt: string | null;
  createdAt: string;
}

export interface ExpensePaymentItem {
  id: number;
  transactionId: number;
  paidOn: string;
  cashRegisterId: number;
  cashRegisterName: string;
  paymentMethod: ExpensePaymentMethod;
  /** entero, en la moneda de la cuenta */
  amount: number;
  /** moneda de la cuenta */
  currency: string;
  /** entero, en la moneda del gasto */
  appliedAmount: number;
  fxRate: number | null;
  /** entero, en pesos; null en España */
  amountArs: number | null;
  reference: string | null;
  notes: string | null;
  createdByName: string | null;
  createdAt: string;
  voidedAt: string | null;
  voidReason: string | null;
  voidedByName: string | null;
}

export interface ExpenseHistoryItem {
  id: number;
  at: string;
  actorName: string | null;
  action: string;
  reason: string | null;
  payload: Record<string, unknown>;
}

export interface ExpenseRecordDetail extends ExpenseRecordListItem {
  receiptLinks: ReceiptLink[];
  notes: string | null;
  createdByName: string | null;
  voidReason: string | null;
  voidedByName: string | null;
  payments: ExpensePaymentItem[];
  history: ExpenseHistoryItem[];
}

export interface ExpenseListFilters {
  country: ExpenseCountry;
  /** `YYYY-MM` */
  month?: string;
  /** id de sede o "casa_matriz" */
  destination?: number | "casa_matriz";
  costCenterId?: number;
  status?: ExpensePaymentStatus | "por_pagar";
  q?: string;
  includeVoided?: boolean;
  page?: number;
  limit?: number;
}

export interface RegisterExpensePaymentInput {
  paidOn: string;
  cashRegisterId: number;
  paymentMethod: ExpensePaymentMethod;
  /** entero, en la moneda de la cuenta */
  amount: number;
  fxRate?: number | null;
  reference?: string | null;
  notes?: string | null;
  idempotencyKey?: string | null;
}

/** Cuenta desde la que se puede pagar. SIN saldos (DI-07). */
export interface ExpensePaymentAccount {
  id: number;
  name: string;
  type: "efectivo" | "banco";
  currency: string;
  branchId: number | null;
  branchName: string | null;
  isTreasury: boolean;
  cutoffDate: string;
}

export interface ExpenseDestinationOption {
  /** null = Casa Matriz */
  branchId: number | null;
  name: string;
}

export interface ExpenseFormOptions {
  country: ExpenseCountry;
  countryCurrency: "ARS" | "EUR";
  expenseCurrencies: ExpenseCurrency[];
  today: string;
  accounts: ExpensePaymentAccount[];
  destinations: ExpenseDestinationOption[];
  costCenters: Array<{ id: number; name: string }>;
}

export interface ExpenseSummaryColumn {
  /** id de sede como string, "casa_matriz" o "total" */
  key: string;
  branchId: number | null;
  name: string;
  isActive: boolean;
  /** entero, en la moneda del país */
  paidInMonth: number;
  /** entero, en la moneda del país */
  cost: number;
  /** entero, en la moneda del país: parte del costo que viene de importes estimados */
  costEstimated: number;
  /** entero, en la moneda del país */
  costPaid: number;
  /** entero, en la moneda del país */
  pending: number;
}

export interface ExpenseSummary {
  month: string;
  country: ExpenseCountry;
  currency: "ARS" | "EUR";
  columns: ExpenseSummaryColumn[];
  incomplete: {
    total: number;
    estimated: number;
    missingFxRate: number;
    missingReceipts: number;
  };
}

export interface ExpenseSummaryConcept {
  expenseRecordId: number;
  concept: string;
  beneficiary: string | null;
  imputationMonth: string;
  estimated: boolean;
  /** entero, en la moneda del país */
  cost: number;
  /** entero, en la moneda del país */
  pending: number;
  /** entero, en la moneda del país */
  paidInMonth: number;
}

export interface ExpenseSummaryDetailGroup {
  costCenterId: number;
  costCenterName: string;
  /** entero, en la moneda del país */
  cost: number;
  /** entero, en la moneda del país */
  pending: number;
  /** entero, en la moneda del país */
  paidInMonth: number;
  concepts: ExpenseSummaryConcept[];
}

export interface ExpenseSummaryDetail {
  month: string;
  country: ExpenseCountry;
  currency: "ARS" | "EUR";
  /** clave de la columna: id de sede como string o "casa_matriz" */
  destination: string;
  destinationName: string;
  groups: ExpenseSummaryDetailGroup[];
}
