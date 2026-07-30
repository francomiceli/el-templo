/**
 * Transaction types for the admin app (Phase 106).
 * Mirrors the API response shapes from el-templo-api/src/modules/finance/types.ts.
 * Replaces src/types/payment.ts (deleted in this phase).
 */

// -- Enum union types -------------------------------------------------------

export type TransactionKind =
  | 'plan_charge'
  | 'debt_settlement'
  | 'refund'
  | 'adjustment'
  | 'advance_payment';

export type TransactionDirection = 'inflow' | 'outflow';

/**
 * Estado de validación (Phase 152 — espejo del enum del schema y del
 * `ValidationStatus` del backend). El Historial de cobros solo filtra por
 * validado/pendiente, pero una fila puede venir en cualquiera de los 4 estados.
 */
export type ValidationStatus = 'pendiente' | 'observado' | 'corregido' | 'validado';

/**
 * Widened from legacy 3-key shape to match Phase 105 schema (5 keys).
 * UI dropdowns in Phase 106 still expose 3 options (cash/transfer/card)
 * per PATTERNS.md decision 4 — full UI widening is Phase 109.
 */
export type PaymentMethod = 'cash' | 'transfer' | 'card' | 'aura_credit' | 'internal';

/**
 * Legacy 3-key subset preserved for callsites that still bind to the
 * narrow contract (charges report `ChargeReportParams.paymentMethod`,
 * assign-plan + renewal selectors). When Phase 109 widens the reports
 * pipeline this can be removed and call-sites switched to PaymentMethod.
 */
export type LegacyPaymentMethod = 'cash' | 'transfer' | 'card';

export type TargetKind = 'subscription' | 'debt_balance' | 'transaction';

// -- Label / color / option maps -------------------------------------------

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Efectivo',
  transfer: 'Transferencia',
  card: 'Tarjeta',
  aura_credit: 'AURA',
  internal: 'Interno',
};

export const PAYMENT_METHOD_COLORS: Record<PaymentMethod, string> = {
  cash: 'green',
  transfer: 'blue',
  card: 'purple',
  aura_credit: 'amber',
  internal: 'grey',
};

/**
 * Filter / selector dropdown options (3-option subset for Phase 106).
 *
 * Phase 106 keeps the 3-option dropdown (cash/transfer/card) for
 * backward compatibility with CajaPage filter, AssignPlanDialog, and
 * MemberSubscriptionTab renewal — see PATTERNS.md decision 4.
 *
 * Phase 109 (CajaPage v2) will widen this to all 5 options.
 */
export const PAYMENT_METHOD_FILTER_OPTIONS: Array<{
  label: string;
  value: PaymentMethod;
}> = [
  { label: 'Efectivo', value: 'cash' },
  { label: 'Transferencia', value: 'transfer' },
  { label: 'Tarjeta', value: 'card' },
];

/**
 * Backward-compatible alias for callsites that previously imported
 * `PAYMENT_METHOD_OPTIONS` from `src/types/payment` (assign-plan dialog,
 * subscription renewal, charges report filter). Same 3-option subset as
 * PAYMENT_METHOD_FILTER_OPTIONS — kept under the legacy name to avoid
 * a Phase 106 rename churn across unrelated callsites.
 */
export const PAYMENT_METHOD_OPTIONS = PAYMENT_METHOD_FILTER_OPTIONS;

// -- Row + list shapes -----------------------------------------------------

export interface TransactionLinkSummary {
  targetKind: TargetKind;
  targetId: number;
  allocatedAmount: number;
}

export interface TransactionListItem {
  id: number;
  transactionDate: string; // YYYY-MM-DD
  effectiveDate: string;
  memberId: number;
  memberName: string;
  kind: TransactionKind;
  direction: TransactionDirection;
  amount: number;
  currency: string;
  paymentMethod: PaymentMethod;
  branchId: number;
  branchName: string;
  recordedBy: number;
  recorderName: string;
  voidedAt: string | null;
  notes: string | null;
  /** ISO timestamp del alta del movimiento (hora real de carga, no la fecha contable). */
  createdAt: string;
  // Phase 152 (CAJA-02/CAJA-04) — read path del validador (152-03). `validatedAt`
  // y `validatorName` son NULL en cobros nacidos validados (admin-load/corregido):
  // la UI muestra "Validado al registrar" en ese caso (D-06).
  validationStatus: ValidationStatus;
  validatedAt: string | null;
  validatorName: string | null;
  linkSummary: TransactionLinkSummary[];
}

export interface TransactionListParams {
  branchId?: number;
  country?: 'AR' | 'ES';
  kind?: TransactionKind;
  paymentMethod?: PaymentMethod;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  memberId?: number;
  // Phase 152 (CAJA-03 / D-04) — filtro server-side por estado del Historial de
  // cobros. El backend (152-03) valida el enum en el querystring; la UI solo
  // ofrece validado/pendiente (todas === omitir el param).
  validationStatus?: 'validado' | 'pendiente';
  page: number;
  limit: number;
}

// -- Summary (D-16 — preserves legacy CajaPage shape, widened to 5 keys) ---

export interface FinanceSummary {
  monthlyRevenue: number;
  revenueByMethod: {
    cash: number;
    transfer: number;
    card: number;
    aura_credit: number;
    internal: number;
  };
  revenueByBranch: Array<{
    branchId: number;
    branchName: string;
    revenue: number;
  }>;
  /**
   * Phase 109 D-11 — additive segmentation by transaction kind. Same
   * inflow + non-voided + filter semantics as monthlyRevenue. All 5
   * keys always present (defaults 0). `refund` always 0 by design
   * (refund is outflow-only per balance-service.ts:76-77).
   */
  revenueByKind: Record<TransactionKind, number>;
}

export interface FinanceSummaryParams {
  branchId?: number;
  country?: 'AR' | 'ES';
  dateFrom?: string;
  dateTo?: string;
}

// -- Void --------------------------------------------------------------

export interface VoidTransactionInput {
  reason: string;
}

// -- Phase 108: Outstanding concepts (D-01) --------------------------------

/**
 * Phase 108 — Concepto pendiente con saldo abierto.
 * Mirror del backend (`api/src/modules/finance/types.ts` OutstandingConcept,
 * to be added by Plan 01). Source: GET /admin/members/:memberId/outstanding-concepts.
 */
export interface OutstandingConcept {
  /** 'subscription' | 'debt_balance' — same union as BalanceTargetKind in backend. */
  targetKind: 'subscription' | 'debt_balance';
  targetId: number;
  /** Human label, e.g. "Mensualidad Marzo 2026 — Performance Mensual" or "Saldo libre #12". */
  description: string;
  currency: string;
  /** Saldo pendiente positivo (entero). */
  balance: number;
  /** Días desde effective_date (clamp >= 0). */
  ageInDays: number;
  /** YYYY-MM-DD — usado para orden FIFO. */
  effectiveDate: string;
}

/**
 * Phase 146 (COBRO-03): cobro suelto (advance_payment) pendiente no anulado de
 * un socio, candidato a imputar al alta de un plan. Source: GET
 * /admin/finance/transactions/pending-misc/:memberId → { items: PendingMiscItem[] }.
 */
export interface PendingMiscItem {
  id: number;
  amount: number;
  currency: string;
  paymentMethod: PaymentMethod;
  cashRegisterId: number | null;
  miscReason: 'sin_plan' | 'otro' | null;
  /** YYYY-MM-DD */
  transactionDate: string;
  notes: string | null;
}

// -- Phase 108: Financial history item (D-12 / D-14) -----------------------

/**
 * Phase 108 — Item del historial financiero del miembro.
 * Mirror del backend `FinancialHistoryItem` (api/src/modules/finance/types.ts:126-139).
 * Source: GET /admin/members/:memberId/financial-history (paginado).
 *
 * `transaction` shape = mirror inline del FinancialTransactionRow (Drizzle inferSelect),
 * para evitar exponer un type del backend en el admin.
 */
export interface FinancialHistoryItem {
  transaction: {
    id: number;
    memberId: number;
    kind: TransactionKind;
    direction: TransactionDirection;
    amount: number;
    currency: string;
    paymentMethod: PaymentMethod;
    transactionDate: string;
    effectiveDate: string;
    branchId: number;
    notes: string | null;
    voidedAt: string | null;
    voidedBy: number | null;
    voidReason: string | null;
    createdAt: string;
  };
  links: Array<{
    targetKind: TargetKind;
    targetId: number;
    allocatedAmount: number;
    conceptLabel?: string;
  }>;
  voidInfo?: {
    voidedAt: string;
    voidedBy: number;
    voidReason: string;
  };
}

// -- Phase 108: Register payment (D-22) ------------------------------------

/**
 * Phase 108 — Payload para POST /admin/finance/transactions cuando se registra
 * un pago de saldo (kind='debt_settlement'). Per CONTEXT D-22.
 *
 * Σ links[].allocatedAmount DEBE coincidir con `amount` (D-09/D-10);
 * frontend valida en vivo, backend rechaza 400 si no coincide.
 */
export interface RegisterPaymentInput {
  memberId: number;
  kind: 'debt_settlement';
  direction: 'inflow';
  amount: number;
  currency: string;
  paymentMethod: PaymentMethod;
  /** YYYY-MM-DD — fecha en la que entró a caja. */
  transactionDate: string;
  /** YYYY-MM-DD — período al que se imputa. */
  effectiveDate: string;
  branchId: number;
  notes?: string | null;
  links: Array<{
    targetKind: TargetKind;
    targetId: number;
    allocatedAmount: number;
  }>;
}

// -- Phase 109 CAJA-03 — Outstanding balances (Deudas report) -------------
// Internal naming: aging / outstanding-balances. UI label always "Deudas"
// (D-01 — never expose "aging" string to the user).
//
// Mirrors backend types from el-templo-api/src/modules/reports/types.ts
// (added by Plan 109-02). The bucketTotals shape is bivariant:
//   - non-owner: flat BucketTotals (single currency by country scope).
//   - owner: keyed by currency, e.g. { ARS: BucketTotals, EUR: BucketTotals }.
// We NEVER sum amounts across different currencies.

export type DebtBucket = '0-5' | '6-10' | '11-15' | '15+';

/**
 * Estado de gestión de una deuda (brief-fran-reporte-deudas §2.4). 'cobrada'
 * se auto-setea en el backend cuando el saldo llega a 0; 'incobrable' es la
 * baja manual (fantasmas) — el registro nunca se borra.
 */
export type DebtManagementStatus = 'activa' | 'cobrada' | 'incobrable';

/** Filtro de promesa de pago (brief §4.3). 'vencida' = fecha < hoy y estado ≠ cobrada. */
export type DebtPromiseFilter = 'con' | 'sin' | 'vencida';

/** Orden del listado (brief §4). Default backend: age DESC (más vieja primero). */
export type DebtSortBy = 'age' | 'amount' | 'lastAttendance';

export interface OutstandingBalanceRow {
  memberId: number;
  memberName: string;
  memberPhone: string | null;
  branchId: number | null;
  branchName: string | null;
  targetKind: 'subscription' | 'debt_balance';
  targetId: number;
  conceptLabel: string;
  /**
   * Phase 153 (DEUDA-02): short structured motivo derived from the debt origin
   * ("Cuota <plan>" / "Sin plan" / "Otro" / "Saldo a regularizar").
   */
  reasonLabel: string;
  /** Phase 153 (DEUDA-03): cycle period of the plan (YYYY-MM-DD); null for cobros sueltos. */
  periodStart: string | null;
  periodEnd: string | null;
  /** Phase 153 (DEUDA-01): date the debt was registered = balances.createdAt (YYYY-MM-DD). */
  registeredAt: string;
  /** Phase 153 (D-11): free-text note of the origin transaction, shown in a tooltip. */
  notes: string | null;
  amount: number;
  currency: string;
  effectiveDate: string; // YYYY-MM-DD
  ageInDays: number;
  bucket: DebtBucket;
  /** Gestión de deudas (brief §2): identidad de la deuda para el PATCH. */
  balanceId: number;
  status: DebtManagementStatus;
  promisedPaymentDate: string | null; // YYYY-MM-DD
  managementNotes: string | null;
  /** Última asistencia del miembro (YYYY-MM-DD); null = nunca asistió. */
  lastAttendanceAt: string | null;
}

export type BucketTotals = Record<DebtBucket, number>;

export interface OutstandingBalancesResult {
  rows: OutstandingBalanceRow[];
  total: number;
  page: number;
  limit: number;
  /** Owner: keyed by currency. Non-owner: flat. */
  bucketTotals: BucketTotals | Record<string, BucketTotals>;
  /**
   * Cobrable (activas) vs dada de baja (incobrables), por moneda (brief §2.4).
   * Respeta los filtros aplicados menos el de estado.
   */
  statusTotals: {
    cobrable: Record<string, number>;
    incobrable: Record<string, number>;
  };
}

export interface OutstandingBalancesFilters {
  branchId?: number;
  country?: 'AR' | 'ES';
  /** balances.currency — 'ARS' | 'EUR'. Owner-only filter. */
  currency?: string;
  search?: string;
  /** Estado de gestión (brief §4.5). Default backend: 'activa'. */
  status?: DebtManagementStatus;
  promise?: DebtPromiseFilter;
  registeredFrom?: string; // YYYY-MM-DD
  registeredTo?: string;
  accruedFrom?: string;
  accruedTo?: string;
  /** "Sin asistir hace más de X días" — incluye a quienes nunca asistieron. */
  minDaysSinceAttendance?: number;
  sortBy?: DebtSortBy;
  sortDir?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

/** Body del PATCH de gestión — parcial; null borra promesa/observaciones. */
export interface DebtManagementUpdateInput {
  status?: DebtManagementStatus;
  promisedPaymentDate?: string | null;
  notes?: string | null;
}

/** Respuesta del PATCH de gestión. */
export interface DebtManagementView {
  balanceId: number;
  status: DebtManagementStatus;
  promisedPaymentDate: string | null;
  notes: string | null;
}

// -- Phase 153 (DEUDA-04): Vencidos — expired-without-renewal leads ---------
// Mirrors el-templo-api/src/modules/reports/types.ts (Plan 153-02).
// Cohorte de socios cuyo plan venció en los últimos 60 días (D-05) sin renovar,
// como leads de renovación: NO llevan monto/moneda (D-06 — es un lead, no una
// deuda). Result paginado como OutstandingBalancesResult pero SIN bucketTotals.

export interface ExpiredMemberRow {
  userId: number;
  memberName: string;
  memberPhone: string | null;
  planName: string;
  /** Fecha de vencimiento del plan (subscriptions.end_date, YYYY-MM-DD). */
  expiryDate: string;
  /** Días transcurridos desde el vencimiento. */
  daysOverdue: number;
}

export interface ExpiredMembersFilters {
  branchId?: number;
  country?: 'AR' | 'ES';
  search?: string;
  page?: number;
  limit?: number;
}

export interface ExpiredMembersResult {
  rows: ExpiredMemberRow[];
  total: number;
  page: number;
  limit: number;
}

// -- Phase 141: Bandeja de pendientes (REP-01) -----------------------------
// Mirrors el-templo-api/src/modules/finance/types.ts PendingTrayItem.
// `ageInDays`/`isOverdue` are computed server-side; the bandeja response also
// carries `thresholdDays` (OVERDUE_DAYS — 142 swaps it for a finance_settings
// read) so the UI banner/row-tinting is data-driven, not a hardcoded literal.

export interface PendingTrayItem {
  id: number;
  transactionDate: string; // YYYY-MM-DD
  memberId: number | null;
  memberName: string;
  amount: number;
  currency: string;
  paymentMethod: PaymentMethod;
  cashRegisterId: number | null;
  cashRegisterName: string;
  recordedBy: number;
  recorderName: string;
  validationStatus: string; // 'pendiente' | 'observado'
  ageInDays: number; // días desde transactionDate (clamp ≥0)
  isOverdue: boolean; // ageInDays > thresholdDays
  // Phase 145 (COBRO-02): motivo del cobro suelto. 'sin_plan' → chip
  // "Sin plan — asignar" en la bandeja; null para filas no-misc.
  miscReason: 'sin_plan' | 'otro' | null;
  // Phase 148 (ALTA-06): si ESTA carga creó un alumno nuevo (PoS profe alta),
  // su id + nombre. Cuando createdMemberName no es null, el dialog de Anular
  // muestra la copy de advertencia del cascade (la membresía se desactiva y el
  // alumno queda inactivo). Ambos null para cargas de alumno preexistente.
  createdMemberId: number | null;
  createdMemberName: string | null;
}

/** PaginatedResult<PendingTrayItem> + the active overdue threshold (D-08). */
export interface PendingTrayResult {
  rows: PendingTrayItem[];
  total: number;
  page: number;
  limit: number;
  /** OVERDUE_DAYS (default 3); 142 makes this a finance_settings read. */
  thresholdDays: number;
}

export interface PendingTrayParams {
  /** D-04 filter. undefined === 'todos' (pendientes + observados). */
  status?: 'pendientes' | 'observados' | 'todos';
  country?: 'AR' | 'ES';
  branchId?: number;
  dateFrom?: string; // YYYY-MM-DD
  dateTo?: string; // YYYY-MM-DD
  page?: number;
  limit?: number;
}

// -- Phase 141: Saldos por caja (REP-02) -----------------------------------
// Mirrors el-templo-api/src/modules/finance/types.ts CajaSaldoRow.
// firme = Σ validados; pendiente reported SEPARATELY (never added to firme,
// 138 derived-balance rule). The enum is only efectivo/banco — the front
// derives the "Efectivo central" group from type=efectivo && branchId=null.

export interface CajaSaldoRow {
  cashRegisterId: number;
  name: string;
  type: 'efectivo' | 'banco';
  branchId: number | null;
  currency: string;
  firmeBalance: number;
  pendienteAmount: number;
  /** Movimiento firme del período pedido; null si la consulta no pidió rango. */
  period: CajaPeriodMovement | null;
}

/** Entradas/salidas firmes de una caja en un rango (inclusive). net puede ser negativo. */
export interface CajaPeriodMovement {
  dateFrom: string;
  dateTo: string;
  inflow: number;
  outflow: number;
  net: number;
}

export interface CashBalancesParams {
  country?: 'AR' | 'ES';
  /** Rango opcional: van juntos o ninguno (el server rechaza uno solo). */
  dateFrom?: string;
  dateTo?: string;
}

// -- Phase 141 → 146 (ARQUEO): Arqueo por caja (REP-03 / ARQUEO-01/02) -------
// Mirrors el-templo-api/src/modules/finance/types.ts MovEgresoItem. Phase 146
// (plan 05): listMovEgresos ya NO filtra por kind — dada una caja devuelve TODO
// lo imputado a ella (cobros de socio plan_charge/debt_settlement/advance_payment/
// refund + egresos + traspasos + ajustes). Las filas sin socio (egresos/traspasos)
// tienen member_id NULL; el backend LEFT JOIN-ea para que sobrevivan (flag 139).
// Cada fila trae `validationStatus` para que la UI marque el estado (ARQUEO-02).

export interface MovEgresoItem {
  id: number;
  transactionDate: string; // YYYY-MM-DD
  // Widened to string: el arqueo trae cualquier kind imputado a la caja (incl.
  // cash_transfer / expense que no están en el FE TransactionKind union). El
  // MovEgresosTab lo mapea a etiquetas ES.
  kind: string; // plan_charge | debt_settlement | advance_payment | refund | expense | cash_transfer | adjustment
  direction: TransactionDirection;
  amount: number;
  currency: string;
  memberId: number | null; // null para egresos/movimientos sin socio (LEFT JOIN)
  cashRegisterId: number | null;
  cashRegisterName: string;
  branchId: number | null;
  branchName: string | null; // null para cajas branch-less (central/banco)
  recordedBy: number;
  recorderName: string;
  // ARQUEO-02: pendiente | observado | corregido | validado (enum del schema).
  validationStatus: string;
  voidedAt: string | null;
  voidReason: string | null;
  notes: string | null;
  // Phase 147 (EGR-03): nombre del centro de costo imputado. Solo lo traen las
  // filas expense; las demás kinds quedan NULL (LEFT JOIN a cost_centers).
  costCenterName: string | null;
}

export interface MovEgresoParams {
  cashRegisterId?: number;
  country?: 'AR' | 'ES';
  dateFrom?: string; // YYYY-MM-DD
  dateTo?: string; // YYYY-MM-DD
  page?: number;
  limit?: number;
}

/** Corregir (D-05): subset of editable fields — void+recreate atomic. */
export interface CorrectedFields {
  amount?: number;
  memberId?: number;
  paymentMethod?: PaymentMethod;
}

// -- Phase 139 (UI): registrar movimiento inter-caja / egreso --------------
// Mirrors RegisterMovementInput / RegisterExpenseInput in the API. Movimiento
// = doble asiento atómico entre cajas de IGUAL moneda (D-02); `countedAmount`
// (opcional) dispara la reconciliación esperado-vs-contado (D-03). Egreso =
// una sola fila kind='expense' (D-04). Montos en unidades enteras (sin cents).

export interface RegisterMovementInput {
  origenCajaId: number;
  destinoCajaId: number;
  amount: number;
  countedAmount?: number;
  notes?: string | null;
}

export interface MovementDetail {
  outflowTxId: number;
  inflowTxId: number;
  adjustmentTxId: number | null; // solo si counted != expected (reconciliación)
  expectedAmount: number;
  countedAmount: number | null;
}

export interface RegisterExpenseInput {
  cajaId: number;
  amount: number;
  // Phase 147 (EGR-02): centro de costo obligatorio a nivel aplicación para
  // egresos. El backend (Plan 01) revalida exists+active server-side.
  costCenterId: number;
  notes?: string | null;
}

// -- Phase 147 (EGR-01/02): centros de costo de egresos --------------------
// Mirror del backend CostCenterItem (GET /admin/finance/cost-centers). Catálogo
// por país; el selector del dialog solo ofrece centros activos del país (sin
// `isActive` — todos vienen activos).

export interface CostCenterItem {
  id: number;
  name: string;
  country: string;
}

export interface CostCenterParams {
  country?: 'AR' | 'ES';
}

// -- Phase 152 (CAJA-05): ABM de centros de costo --------------------------
// Mirror del backend `CostCenter` (fila completa del catálogo, GET
// /admin/finance/cost-centers/all + escrituras POST/PATCH/deactivate/reactivate).
// Incluye `isActive` para exponer las categorías dadas de baja (D-08: baja
// lógica, sin borrado físico — las cerradas se muestran atenuadas, no se borran).

export interface CostCenter {
  id: number;
  name: string;
  country: string;
  isActive: boolean;
}

/** Alta de categoría de egreso (POST /cost-centers). Nombre único por país (D-08). */
export interface CreateCostCenterInput {
  name: string;
  country: 'AR' | 'ES';
}

/** Renombre de categoría de egreso (PATCH /cost-centers/:id). Solo `name`. */
export interface RenameCostCenterInput {
  name: string;
}

export interface ExpenseDetail {
  expenseTxId: number;
}

// -- Phase 150 (CTA-01): ABM de cuentas bancarias --------------------------
// Mirror del backend BankAccountRow/CreateBankAccountInput/UpdateBankAccountInput
// (el-templo-api/src/modules/finance/types.ts). Cuenta banco = cash_registers
// con type='banco', branchId=null, currency FIJA post-creación (D-04). `name`
// se DERIVA en el backend (D-03) — el form no pide "Nombre". `balance` = saldo
// firme únicamente (nunca suma pendiente, CAJA-03).

export interface BankAccount {
  id: number;
  name: string;
  currency: 'ARS' | 'EUR';
  isActive: boolean;
  bankName: string | null;
  accountHolder: string | null;
  taxId: string | null;
  cbuCvu: string | null;
  accountAlias: string | null;
  accountNumber: string | null;
  /** Saldo firme (Σ validados). Nunca sumado con pendiente (CAJA-03). */
  balance: number;
}

/**
 * Alta de cuenta bancaria. 3 obligatorios (bankName/accountHolder/currency) +
 * al menos uno de (cbuCvu | accountAlias) — regla uno-de-dos revalidada en el
 * backend (D-02). Sin campo `name` (derivado en el service, D-03).
 */
export interface CreateBankAccountInput {
  bankName: string;
  accountHolder: string;
  currency: 'ARS' | 'EUR';
  cbuCvu?: string | null;
  accountAlias?: string | null;
  taxId?: string | null;
  accountNumber?: string | null;
}

/**
 * Edición de cuenta bancaria. Mismos campos que Create pero todos opcionales y
 * SIN `currency` — la moneda es FIJA post-creación (D-04); el PATCH nunca la
 * envía y el backend la rechaza a nivel schema.
 */
export interface UpdateBankAccountInput {
  bankName?: string;
  accountHolder?: string;
  cbuCvu?: string | null;
  accountAlias?: string | null;
  taxId?: string | null;
  accountNumber?: string | null;
}

// -- Phase 108: POST /transactions response shape (D-22) -------------------

/**
 * Mirror del backend `CreateTransactionResponse` (api/src/modules/finance/types.ts:143-147).
 * Tipos minimal — solo lo que el dialog/tab necesita; los rich rows del backend
 * no se mirroran completos para no acoplarse al schema Drizzle.
 */
export interface CreateTransactionResponse {
  transaction: {
    id: number;
    memberId: number;
    kind: TransactionKind;
    direction: TransactionDirection;
    amount: number;
    currency: string;
    paymentMethod: PaymentMethod;
    transactionDate: string;
    effectiveDate: string;
    branchId: number;
    notes: string | null;
    voidedAt: string | null;
    voidedBy: number | null;
    voidReason: string | null;
    createdAt: string;
  };
  links: Array<{
    id: number;
    transactionId: number;
    targetKind: TargetKind;
    targetId: number;
    allocatedAmount: number;
  }>;
  affectedBalances: Array<{
    id: number;
    memberId: number;
    targetKind: 'subscription' | 'debt_balance';
    targetId: number;
    currency: string;
    amount: number;
    updatedAt: string;
  }>;
}
