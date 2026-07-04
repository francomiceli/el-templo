// Module: finance — phase 105
//
// D-05: enums declared inline in the Drizzle schema. TS literals are
// inferred here via $inferSelect so the schema is the single source of
// truth.

import type {
  financialTransactions,
  transactionLinks,
  balances,
} from "../../db/schema";
import type { CountryCode } from "../shared/country-scope";

// -- Row shapes inferred from the Drizzle tables -----------------------------

export type FinancialTransactionRow = typeof financialTransactions.$inferSelect;
export type FinancialTransactionInsert =
  typeof financialTransactions.$inferInsert;
export type TransactionKind = FinancialTransactionRow["kind"];
export type TransactionDirection = FinancialTransactionRow["direction"];
export type PaymentMethod = FinancialTransactionRow["paymentMethod"];

/**
 * Phase 109 D-11 — `revenueByKind` field of FinanceSummary.
 * Sum of inflow non-voided rows grouped by kind. 5 fixed keys,
 * defaults 0. `refund` is always 0 by design (refund is outflow-only
 * per balance-service.ts:76-77 convention; this aggregation is
 * inflow-only, identical filter semantics to monthlyRevenue).
 */
export type RevenueByKind = Record<TransactionKind, number>;

export type TransactionLinkRow = typeof transactionLinks.$inferSelect;
export type TargetKind = TransactionLinkRow["targetKind"];

export type BalanceRow = typeof balances.$inferSelect;
export type BalanceTargetKind = BalanceRow["targetKind"];

// -- Service input shapes ----------------------------------------------------

export interface CreateTransactionLinkInput {
  targetKind: TargetKind;
  targetId: number;
  allocatedAmount: number;
}

/**
 * Phase 137 (VAL-02): the validation_status a freshly-created transaction is
 * born with. Derived SERVER-SIDE from the authenticated user's role
 * (coach→'pendiente', everyone else→'validado') — NEVER read from the raw
 * client body. Optional: when omitted the DB column DEFAULT 'validado' applies,
 * so all 4 internal recordAssignmentCharge callers (admin path) stay correct
 * without edits. Only 'pendiente'/'validado' are valid at birth; 'observado'
 * and 'corregido' are reachable only via observe()/correct() transitions.
 */
export type InitialValidationStatus = "pendiente" | "validado";

/**
 * Phase 152 (D-05): the full validation state machine (VAL / fase 137). Mirrors
 * the mysqlEnum in db/schema/financial-transactions.ts byte-for-byte. Used by
 * the read surface (TransactionListItem.validationStatus) — distinct from
 * InitialValidationStatus (only the two birth states).
 */
export type ValidationStatus =
  | "pendiente"
  | "observado"
  | "corregido"
  | "validado";

export interface CreateTransactionInput {
  /**
   * Phase 139 (D-06): `null` for egresos/movimientos (no socio). create() skips
   * the member-exists probe when null and inserts NULL member_id.
   */
  memberId: number | null;
  kind: TransactionKind;
  direction: TransactionDirection;
  amount: number;
  /** Defaults to 'ARS' when omitted. */
  currency?: string;
  paymentMethod: PaymentMethod;
  /** YYYY-MM-DD: when the transaction entered caja. */
  transactionDate: string;
  /** YYYY-MM-DD: which month/period the transaction accrues to. */
  effectiveDate: string;
  /**
   * Phase 139 (extends D-06 to branch_id): `null` for movimientos/egresos to
   * branch-less cajas (central efectivo, banco ARS/EUR). create() skips the
   * branch-exists probe when null and inserts NULL branch_id.
   */
  branchId: number | null;
  notes?: string | null;
  /**
   * Phase 145 (COBRO-01): structured reason for a cobro suelto. Set ONLY by the
   * POST /coach-load/misc endpoint (the PoS dropdown Motivo); the other 9 create
   * paths leave it undefined → NULL, exactly as today. NOT folded into `notes`
   * (which stays the free-text concepto). Optional/nullable like the other
   * server-derived slots.
   */
  miscReason?: "sin_plan" | "otro" | null;
  /**
   * Phase 137 (VAL-02): birth validation status. Defaults to 'validado' when
   * undefined (matches the DB column DEFAULT). Set to 'pendiente' ONLY by the
   * server-side role→status derivation (coach loads). NEVER sourced from the
   * raw request body.
   */
  validationStatus?: InitialValidationStatus;
  /**
   * Phase 138 (CAJA-02 / D-01..D-03): the caja the payment lands in. SERVER-
   * DERIVED — NEVER read from the raw request body (like validationStatus).
   * When undefined (the normal case), create() runs
   * CashRegisterService.resolveCashRegister(paymentMethod, branchId, currency)
   * itself, so all 9 create paths auto-stamp without per-caller edits. The
   * optional slot exists ONLY for internal pre-resolution (e.g. a future
   * phase 139 movimiento that already knows its caja); `null` is a valid value
   * meaning "no caja" (aura_credit/internal). D-03: no manual override is
   * exposed through the REST body — the route schema must NOT accept it.
   */
  cashRegisterId?: number | null;
  /**
   * Phase 147 (EGR-02): centro de costo del egreso. SERVER-DERIVED — NUNCA del
   * body crudo de /transactions. Optional/nullable como `miscReason`: las 10
   * rutas de create existentes lo dejan undefined → NULL; SOLO registerExpense
   * lo setea (tras validar exists+active). `null` es válido (no-egreso).
   */
  costCenterId?: number | null;
  /**
   * Phase 140 (CARGA-02 / D-09): client-generated opaque ticket key for
   * idempotent coach loads — a UUID minted on each "Confirmar" tap, NOT a
   * secret. When set, create() persists it on the row; the nullable UNIQUE
   * index (uq_financial_tx_idempotency_key) rejects a duplicate non-null key
   * at the DB layer so a double-tap/retry cannot create two charges. The
   * ER_DUP_ENTRY → return-existing handling lands endpoint-side in Wave 2
   * (Pitfall 3: the renewal tx must roll back before re-reading). Omitted/NULL
   * for every admin/historical path (multiple NULLs are allowed).
   */
  idempotencyKey?: string | null;
  /**
   * Phase 148 (ALTA-06 / W-1): id del alumno que ESTA carga creó vía
   * createMinimalMember (PoS profe), o null/undefined si el alumno ya existía o
   * la carga no proviene del alta. SERVER-DERIVED — el orquestador 148-02 lo
   * pasa tras crear el alumno; NUNCA del body crudo. create() lo persiste en el
   * MISMO insert del charge (dentro de la tx del caller cuando se pasa `tx`), de
   * modo que el cascade de void (148-03) sepa qué alumno desactivar sin ventana
   * de crash. NULL para todo path admin/histórico (FK nullable a users.id).
   */
  createdMemberId?: number | null;
  links: CreateTransactionLinkInput[];
}

/**
 * Phase 137 (VAL-04 / D-04): input for observe() — flag a pendiente charge as
 * 'observado' (a problem spotted, not yet corrected). Reason is mandatory so
 * the audit trail records WHY it was observed (D-07).
 */
export interface ObserveTransactionInput {
  reason: string;
}

export interface VoidTransactionInput {
  reason: string;
  /**
   * Phase 137 (D-10 / VAL-06): when voiding a charge that activated a
   * membership, decide whether the linked subscription stays active. Default
   * true (current behaviour — the sub is untouched). When false, void()
   * cancels the linked subscription inside the SAME db.transaction via
   * SubscriptionService._cancelSubscription (skipping the active-charges
   * guard, since this very charge is soft-voided in that same tx).
   */
  keepMembershipActive?: boolean;
}

// -- Service output shapes ---------------------------------------------------

export interface TransactionDetail extends FinancialTransactionRow {
  links: TransactionLinkRow[];
  /**
   * Phase 148 (ALTA-06): nombre (firstName + lastName) del alumno que ESTA carga
   * creó vía el alta del PoS profe — resuelto por join a users sobre
   * `createdMemberId`. `null` cuando la carga no creó alumno (preexistente /
   * path admin). La bandeja (148-06) lo usa para la copy de advertencia al
   * anular ("Esta carga creó al alumno {nombre}. Al anular, también se
   * desactivará su membresía…"). Campo aditivo/opcional — no altera el filtro de
   * dinero firme ni las métricas.
   */
  createdMemberName?: string | null;
}

// -- Phase 106: list/history shapes ----------------------------------------

// -- Filter shapes (analog: reports/types.ts:21-30 ChargeReportFilters) ----

/** Filters for GET /api/admin/finance/transactions (D-12). */
export interface TransactionListFilters {
  branchId?: number;
  /** Injected by route handler from request.scope.country (Phase 98 pattern). */
  country?: CountryCode;
  kind?: TransactionKind;
  dateFrom?: string; // YYYY-MM-DD
  dateTo?: string; // YYYY-MM-DD
  memberId?: number;
  paymentMethod?: PaymentMethod;
  /**
   * Phase 140 (D-07 / CARGA-04): scope the list to the rows a specific staff
   * member recorded. The coach "mis-cargas" endpoint FORCES this to the
   * authenticated coach's id server-side (never from the query) so a coach only
   * ever sees their own loads — never other coaches' loads or the full ledger.
   */
  recordedBy?: number;
  /** Member name search; uses buildMemberNameSearchCondition. */
  search?: string;
  /**
   * Phase 152 (D-04): server-side filter por estado de validacion para el
   * Historial de cobros. Solo validado/pendiente se exponen en la UI (el chip
   * es validada/pendiente); observado/corregido no son filtrables desde aca.
   */
  validationStatus?: "validado" | "pendiente";
  page?: number;
  limit?: number;
}

/** Filters for GET /api/admin/members/:id/financial-history (D-13). */
export interface FinancialHistoryFilters {
  page?: number;
  limit?: number;
}

// -- Response row shapes ----------------------------------------------------

/**
 * Flat row for the GET /transactions table (D-12). Includes denormalized
 * member name + branch name + recorder name + a lightweight summary of
 * links (full link rows omitted for the list view).
 */
export interface TransactionListItem {
  id: number;
  transactionDate: string; // YYYY-MM-DD
  effectiveDate: string; // YYYY-MM-DD
  /** Phase 139 (D-06): null for egresos/movimientos (sin socio). */
  memberId: number | null;
  memberName: string; // CONCAT(first_name, ' ', last_name)
  kind: TransactionKind;
  direction: TransactionDirection;
  amount: number;
  currency: string;
  paymentMethod: PaymentMethod;
  /** Phase 139: null for movimientos/egresos a cajas branch-less. */
  branchId: number | null;
  branchName: string;
  recordedBy: number;
  recorderName: string;
  voidedAt: string | null;
  notes: string | null;
  /** ISO timestamp del alta del movimiento (hora real de carga, no la fecha contable). */
  createdAt: string;
  /** Phase 152 (D-04): estado de validacion para el chip validada/pendiente. */
  validationStatus: ValidationStatus;
  /**
   * Phase 152 (D-05): ISO timestamp de la validacion. NULL cuando la fila nacio
   * validada (correct/admin-load) o es un historico sin backfillear (D-06).
   */
  validatedAt: string | null;
  /** Phase 152 (D-05): nombre del validador. NULL en filas nacidas validadas. */
  validatorName: string | null;
  linkSummary: Array<{
    targetKind: TargetKind;
    targetId: number;
    allocatedAmount: number;
  }>;
}

/**
 * Phase 109 D-15 — Row shape for the CajaPage Excel export.
 *
 * Extends TransactionListItem with `voidReason` (rendered in the
 * "Razón anulación" column). Same query/filter semantics as the list
 * endpoint; consumed only by GET /transactions/export which serializes
 * to .xlsx via exceljs in the route layer.
 */
export interface TransactionExportRow extends TransactionListItem {
  voidReason: string | null;
}

/**
 * Item for GET /api/admin/members/:id/financial-history (D-13).
 * `conceptLabel` is populated for target_kind='subscription' via JOIN
 * to subscriptions + subscription_plans (e.g. "Plan Pro — 2026-03-01").
 */
export interface FinancialHistoryItem {
  transaction: FinancialTransactionRow;
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

// -- POST /transactions response shape (D-10) ------------------------------

export interface CreateTransactionResponse {
  transaction: FinancialTransactionRow;
  links: TransactionLinkRow[];
  affectedBalances: BalanceRow[];
}

// -- Phase 106 Plan 03: GET /transactions/summary (D-16) -------------------

/**
 * CajaPage legacy summary shape (D-16). Drives the financial summary cards.
 * revenueByMethod widened to 5 keys (Phase 105 schema includes aura_credit
 * + internal). Frontend widens to match in Plan 05.
 */
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
  revenueByKind: RevenueByKind;
}

/** Filters for getSummary — subset of TransactionListFilters. */
export interface FinanceSummaryFilters {
  branchId?: number;
  country?: CountryCode;
  dateFrom?: string;
  dateTo?: string;
}

// -- Phase 108: Outstanding concepts (D-01..D-06) ---------------------------

/**
 * Concepto pendiente con saldo abierto. Resultado de
 * GET /api/admin/members/:userId/outstanding-concepts (Phase 108).
 *
 * Source: balances WHERE amount > 0, ordenado por effectiveDate ASC (FIFO).
 * - D-01: shape autoritativa que consume el dialog "Registrar pago".
 * - D-04: ageInDays = max(0, DATEDIFF(today, effectiveDate)).
 * - D-05: para targetKind='subscription', effectiveDate = subscriptions.startDate.
 *         Para targetKind='debt_balance', fallback = balances.createdAt (date portion).
 * - D-06: description = "Mensualidad <Mes> <Año> — <PlanName>" o "Saldo libre #<id>".
 */
export interface OutstandingConcept {
  targetKind: BalanceTargetKind; // 'subscription' | 'debt_balance'
  targetId: number;
  description: string; // ej: "Mensualidad Marzo 2026 — Performance Mensual"
  currency: string; // ARS / EUR
  balance: number; // saldo pendiente positivo (entero)
  ageInDays: number; // días desde effectiveDate (clamp 0 si futuro)
  effectiveDate: string; // YYYY-MM-DD para auditoría / orden FIFO
}

// -- Phase 139: MovementService (movimientos inter-caja + egresos) ----------

/**
 * Phase 139 (MOV-01/MOV-02): input para registrar un movimiento inter-caja —
 * el asiento de doble entrada (2 filas linkeadas, neto 0). La reconciliación
 * esperado-vs-contado (D-04) es opcional: cuando `countedAmount` se omite, no
 * se materializa un ajuste (solo se deja el rastro del esperado en el audit).
 *
 * `adminId` es el actor server-side (request.user.userId) — NUNCA del body.
 * `notes` es texto libre opcional. Las monedas se derivan de las cajas (guard
 * same-currency en el servicio); el body no las trae.
 */
export interface RegisterMovementInput {
  origenCajaId: number;
  destinoCajaId: number;
  amount: number;
  /**
   * Conteo físico de la caja origen al momento (D-04). Cuando difiere del
   * esperado, el servicio inserta una fila kind='adjustment' que corrige el
   * saldo de origen a lo contado + un audit 'reconciliation'. Omitido = sin
   * ajuste (solo rastro del esperado).
   */
  countedAmount?: number;
  notes?: string | null;
}

/**
 * Phase 139 (MOV-03): input para registrar un egreso — 1 fila outflow que resta
 * del saldo de su caja. Phase 147 (EGR-02): `costCenterId` es OBLIGATORIO — el
 * egreso se clasifica en un centro de costo (validado exists+active en el
 * servicio antes de crear la fila).
 */
export interface RegisterExpenseInput {
  cajaId: number;
  amount: number;
  costCenterId: number;
  notes?: string | null;
}

/**
 * Phase 147 (EGR-01): una fila del catálogo de centros de costo, para el selector
 * del dialog de egreso. Solo los activos del país consultado.
 */
export interface CostCenterItem {
  id: number;
  name: string;
  country: string;
}

/**
 * Phase 152 (CAJA-05): una fila completa del catálogo de centros de costo para el
 * ABM (crear/renombrar/desactivar/reactivar/listAll). A diferencia de
 * CostCenterItem (solo activos del selector), incluye `isActive` para exponer las
 * categorías dadas de baja (D-08: baja lógica, sin borrado físico).
 */
export interface CostCenter {
  id: number;
  name: string;
  country: string;
  isActive: boolean;
}

/**
 * Phase 139 (MOV-01): resultado de registrar un movimiento. Devuelve los ids de
 * ambas patas + el id del ajuste de reconciliación (null cuando no hubo
 * diferencia) + el esperado/contado para que el caller (route) los exponga.
 */
export interface MovementDetail {
  outflowTxId: number; // pata origen (kind='cash_transfer', outflow)
  inflowTxId: number; // pata destino (kind='cash_transfer', inflow)
  adjustmentTxId: number | null; // ajuste de reconciliación (solo si counted != expected)
  expectedAmount: number; // saldo firme de origen al momento (D-04)
  countedAmount: number | null; // conteo físico, si se proveyó
}

// -- Phase 141: reportes para la admin (REP-01 / REP-02) --------------------

/**
 * Phase 141 (REP-01): una fila de la bandeja de pendientes. Es pendiente o
 * observado, con antigüedad computada server-side (TS, clamp ≥0) y el flag
 * `isOverdue` derivado de OVERDUE_DAYS (constants.ts). `recorderName` es "cargado
 * por" (alias users.recordedBy); `cashRegisterName` es el nombre de la caja.
 */
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
  isOverdue: boolean; // ageInDays > OVERDUE_DAYS
  // Phase 145 (COBRO-02): motivo del cobro suelto. 'sin_plan' → la fila muestra
  // un chip "Sin plan — asignar" en la bandeja; null para filas no-misc.
  miscReason: "sin_plan" | "otro" | null;
  // Phase 148 (ALTA-06): si ESTA carga creó un alumno nuevo (PoS profe alta),
  // su id + nombre para que la bandeja muestre la copy de advertencia al anular
  // ("Esta carga creó al alumno {nombre}. Al anular, también se desactivará su
  // membresía…"). Ambos null para cargas de alumno preexistente / path admin.
  createdMemberId: number | null;
  createdMemberName: string | null;
}

/** Filtros para listPendingTray (REP-01). */
export interface PendingTrayFilters {
  /** Pendientes/Observados/Todos (D-04). undefined === 'todos' (ambos). */
  status?: "pendientes" | "observados" | "todos";
  country?: CountryCode;
  branchId?: number;
  dateFrom?: string; // YYYY-MM-DD
  dateTo?: string; // YYYY-MM-DD
  page?: number;
  limit?: number;
}

/**
 * Phase 141 (REP-02): saldo firme + pendiente de una caja activa, junto a su
 * tipo/moneda/sucursal para que el front agrupe (efectivo sucursal / central /
 * banco) y subtotalice SOLO por moneda. firme/pendiente vienen de getBalance.
 */
export interface CajaSaldoRow {
  cashRegisterId: number;
  name: string;
  type: "efectivo" | "banco";
  branchId: number | null;
  currency: string;
  firmeBalance: number;
  pendienteAmount: number;
}

// -- Phase 141: historial de movimientos inter-caja y egresos (REP-03) -------

/**
 * Phase 141 (REP-03) → Phase 146 (ARQUEO-01/02): una fila del **arqueo por
 * caja**. listMovEgresos ya NO filtra por kind: dada una caja devuelve TODO lo
 * imputado a ella — cobros de socio (plan_charge, debt_settlement,
 * advance_payment, refund) + egresos (expense) + traspasos (cash_transfer) +
 * ajustes (adjustment). Las filas sin socio (egresos/traspasos) tienen member_id
 * NULL (y a menudo branch_id NULL para cajas central/banco), así que
 * listMovEgresos LEFT JOIN-ea users/branches/cash_registers para que SOBREVIVAN
 * (el list()/export compartido hace INNER JOIN y las dropea — el flag de 139).
 * Cada fila trae `validationStatus` (pendiente/observado/corregido/validado) para
 * que la UI marque el estado (ARQUEO-02). `recorderName` es "cargado por",
 * `cashRegisterName` la caja.
 */
export interface MovEgresoItem {
  id: number;
  transactionDate: string; // YYYY-MM-DD
  kind: TransactionKind; // cualquier kind imputado a la caja (arqueo por caja)
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
  validationStatus: FinancialTransactionRow["validationStatus"]; // ARQUEO-02
  voidedAt: string | null;
  voidReason: string | null;
  notes: string | null;
  // Phase 147 (EGR-03): nombre del centro de costo (LEFT JOIN cost_centers).
  // Solo las filas expense lo tienen; el resto de kinds queda null.
  costCenterName: string | null;
}

/**
 * Filtros para listMovEgresos (REP-03). `country` se resuelve owner-aware en la
 * route; para non-owner el scope va por la moneda/país de la CAJA (no por
 * eq(branches.country) — eso excluiría las filas branch-less central/banco bajo
 * el LEFT JOIN: la trampa del país de la Pitfall 2). Branch-less central/banco
 * son owner-only (mirror enforceCajaScope).
 */
export interface MovEgresoFilters {
  cashRegisterId?: number;
  country?: CountryCode;
  /** true cuando el caller es owner (ve todo; ?country acota por país de caja). */
  isOwner?: boolean;
  dateFrom?: string; // YYYY-MM-DD
  dateTo?: string; // YYYY-MM-DD
  page?: number;
  limit?: number;
}

// Phase 146 (plan 03 primitive) — un cobro suelto (advance_payment) pendiente,
// no anulado, de un socio. Lo consume el AssignPlanDialog (plan 03) para imputar
// el anticipo al asignar un plan, y el endpoint GET /transactions/pending-misc/:id.
export interface PendingMiscItem {
  id: number;
  amount: number;
  currency: string;
  paymentMethod: PaymentMethod;
  cashRegisterId: number | null;
  miscReason: "sin_plan" | "otro" | null;
  transactionDate: string; // YYYY-MM-DD
  notes: string | null;
}

// -- Phase 150: ABM de cuentas bancarias (CTA-01 / CTA-03) ------------------

/**
 * Phase 150 (CTA-01 / D-01): input para crear una cuenta banco desde el ABM.
 * `bankName` + `accountHolder` + `currency` son los 3 campos obligatorios
 * (D-03: `name` se autogenera en el service a partir del banco); el resto de
 * los datos bancarios son opcionales/nullable. La moneda se fija en la
 * creación y NO se puede cambiar después (D-04, invariante existente de
 * `cash_registers.currency`).
 */
export interface CreateBankAccountInput {
  bankName: string;
  accountHolder: string;
  currency: string;
  cbuCvu?: string | null;
  accountAlias?: string | null;
  taxId?: string | null;
  accountNumber?: string | null;
}

/**
 * Phase 150 (CTA-01 / D-04): input para editar una cuenta banco existente.
 * Mismos campos que Create pero todos opcionales, EXCEPTO `currency`, que se
 * OMITE por completo: la moneda de una caja es FIJA post-creación (invariante
 * existente de `cash_registers.currency`, guard espejo de applyDelta). El ABM
 * NO expone edición de moneda.
 */
export interface UpdateBankAccountInput {
  bankName?: string;
  accountHolder?: string;
  cbuCvu?: string | null;
  accountAlias?: string | null;
  taxId?: string | null;
  accountNumber?: string | null;
}

/**
 * Phase 150 (CTA-01): forma de lectura de una cuenta banco para el ABM.
 * `balance` = saldo FIRME (`firmeBalance` de getBalance / CashRegisterBalance),
 * NUNCA la suma con `pendienteAmount` (invariante CAJA-03: el pendiente se
 * reporta SEPARADO y jamás se suma al firme).
 */
export interface BankAccountRow {
  id: number;
  name: string;
  currency: string;
  isActive: boolean;
  bankName: string | null;
  accountHolder: string | null;
  taxId: string | null;
  cbuCvu: string | null;
  accountAlias: string | null;
  accountNumber: string | null;
  /** Saldo FIRME (firmeBalance), NUNCA sumado con pendienteAmount — CAJA-03. */
  balance: number;
}

// Phase 138 (D-06/D-08/CAJA-03) — saldo DERIVADO de una caja. firmeBalance es
// opening_balance + Σ validados de la caja desde cutoff_date (reusa
// firmMoneyConditions). pendienteAmount (validation_status='pendiente') se
// reporta SEPARADO y NUNCA se suma al firme. La derivación queda detrás de la
// firma del método (D-08): los callers no saben si es calculado o cacheado.
export interface CashRegisterBalance {
  cashRegisterId: number;
  currency: string;
  firmeBalance: number; // opening_balance + Σ validados desde cutoff (CAJA-03)
  pendienteAmount: number; // Σ pendientes desde cutoff, SEPARADO (CAJA-03)
}
