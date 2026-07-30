/**
 * Transactions API composable (Phase 106). Replaces usePaymentsApi.
 * Drives CajaPage list/void/summary against /admin/finance/transactions.
 */

import { ref } from 'vue';
import { api } from 'src/boot/axios';
import { extractError } from 'src/utils/extract-error';
import type {
  TransactionListItem,
  TransactionListParams,
  FinanceSummary,
  FinanceSummaryParams,
  OutstandingConcept,
  FinancialHistoryItem,
  RegisterPaymentInput,
  CreateTransactionResponse,
  OutstandingBalancesFilters,
  OutstandingBalancesResult,
  ExpiredMembersFilters,
  ExpiredMembersResult,
  DebtManagementUpdateInput,
  DebtManagementView,
  PendingTrayResult,
  PendingTrayParams,
  CajaSaldoRow,
  CashBalancesParams,
  MovEgresoItem,
  MovEgresoParams,
  CorrectedFields,
  RegisterMovementInput,
  MovementDetail,
  RegisterExpenseInput,
  ExpenseDetail,
  PendingMiscItem,
  CostCenter,
  CostCenterItem,
  CostCenterParams,
  CreateCostCenterInput,
  RenameCostCenterInput,
  BankAccount,
  CreateBankAccountInput,
  UpdateBankAccountInput,
} from 'src/types/transaction';
import type { PaginatedResult } from 'src/types/report';

export function useTransactionsApi() {
  const loading = ref(false);
  const error = ref<string | null>(null);

  /**
   * Lista transacciones (Historial de cobros). Phase 152 (CAJA-03): `params`
   * acepta `validationStatus` ('validado' | 'pendiente') como filtro server-side
   * por estado — axios lo serializa al querystring; el backend (152-03) valida el
   * enum. `todas` === omitir la clave.
   */
  async function listTransactions(
    params: TransactionListParams
  ): Promise<PaginatedResult<TransactionListItem>> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<PaginatedResult<TransactionListItem>>(
        '/admin/finance/transactions',
        { params }
      );
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando transacciones');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Anular (void) — Phase 137 / 141 D-05. `keepMembershipActive` (137 D-10)
   * threads the 1-a-1 membership decision into the POST body when the void
   * touches an active membership link (default true, set by the Anular popup).
   * Omitted → backend defaults to keeping the membership active.
   */
  async function voidTransaction(
    transactionId: number,
    reason: string,
    keepMembershipActive?: boolean
  ): Promise<{ transaction: TransactionListItem }> {
    loading.value = true;
    error.value = null;
    try {
      const body: { reason: string; keepMembershipActive?: boolean } = { reason };
      if (keepMembershipActive !== undefined) {
        body.keepMembershipActive = keepMembershipActive;
      }
      const { data } = await api.post<{ transaction: TransactionListItem }>(
        `/admin/finance/transactions/${transactionId}/void`,
        body
      );
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error anulando transaccion');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  // =========================================================================
  // Phase 141 — Validación de pendientes (137 actions) — REP-01
  // =========================================================================

  /**
   * Validar (137 VAL-03): pendiente → validado.
   * Phase 146 (CAJA-02/CAJA-03): `cashRegisterId` opcional — gestión confirma o
   * cambia la caja imputada al validar (incl. elegir cuenta banco). Se omite la
   * clave del body cuando es undefined (retrocompat con el validar sin caja).
   * El backend valida coherencia (existe/activa/moneda) y bloquea sin_plan.
   */
  async function validateTransaction(
    transactionId: number,
    cashRegisterId?: number
  ): Promise<{ transaction: TransactionListItem }> {
    loading.value = true;
    error.value = null;
    try {
      const body: { cashRegisterId?: number } = {};
      if (cashRegisterId !== undefined) {
        body.cashRegisterId = cashRegisterId;
      }
      const { data } = await api.post<{ transaction: TransactionListItem }>(
        `/admin/finance/transactions/${transactionId}/validate`,
        body
      );
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error validando transaccion');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  /** Observar (137 VAL-04 / D-04): pendiente → observado. Motivo obligatorio. */
  async function observeTransaction(
    transactionId: number,
    reason: string
  ): Promise<{ transaction: TransactionListItem }> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.post<{ transaction: TransactionListItem }>(
        `/admin/finance/transactions/${transactionId}/observe`,
        { reason }
      );
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error observando transaccion');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Corregir (137 VAL-04 / D-05): void+recreate atómico. `correctedFields` es
   * un subset de amount/memberId/paymentMethod. Devuelve la NUEVA transacción.
   */
  async function correctTransaction(
    transactionId: number,
    correctedFields: CorrectedFields
  ): Promise<{ transaction: TransactionListItem }> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.post<{ transaction: TransactionListItem }>(
        `/admin/finance/transactions/${transactionId}/correct`,
        { correctedFields }
      );
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error corrigiendo transaccion');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  // =========================================================================
  // Phase 141 — Reportes para la admin (read endpoints) — REP-01/02/03
  // =========================================================================

  /**
   * Bandeja de pendientes (REP-01). Source: GET /admin/finance/pending-tray.
   * Paginada; ordenada oldest-first (server-enforced). Devuelve thresholdDays
   * (OVERDUE_DAYS) para la alerta de vencidos (D-08/D-09).
   */
  async function getPendingTray(params: PendingTrayParams = {}): Promise<PendingTrayResult> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<PendingTrayResult>('/admin/finance/pending-tray', {
        params,
      });
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando bandeja');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Saldos por caja (REP-02). Source: GET /admin/finance/cash-registers/balances.
   * Devuelve un row por caja activa (firme + pendiente). El front agrupa por
   * tipo y subtotaliza SOLO por moneda (nunca cross-currency).
   */
  async function getCashRegisterBalances(params: CashBalancesParams = {}): Promise<CajaSaldoRow[]> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<CajaSaldoRow[]>('/admin/finance/cash-registers/balances', {
        params,
      });
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando saldos');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Historial mov/egresos (REP-03). Source: GET /admin/finance/movements-history.
   * LEFT JOIN users en backend → las filas NULL-member (cash_transfer/expense/
   * adjustment) sobreviven (flag 139). Paginado.
   */
  async function getMovEgresosHistory(
    params: MovEgresoParams = {}
  ): Promise<PaginatedResult<MovEgresoItem>> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<PaginatedResult<MovEgresoItem>>(
        '/admin/finance/movements-history',
        { params }
      );
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando movimientos');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  // =========================================================================
  // Phase 139 — Registrar movimiento inter-caja / egreso (MOV-01..03)
  // =========================================================================

  /**
   * Registrar movimiento inter-caja (MOV-01/02). POST /admin/finance/movements.
   * Doble asiento atómico (outflow origen + inflow destino, IGUAL moneda —
   * D-02). Si `countedAmount` difiere del saldo esperado de origen, el backend
   * agrega un ajuste de reconciliación (D-03). Roles: FINANCE_VOID_ROLES.
   */
  async function registerMovement(
    input: RegisterMovementInput
  ): Promise<{ movement: MovementDetail }> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.post<{ movement: MovementDetail }>(
        '/admin/finance/movements',
        input
      );
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error registrando movimiento');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Registrar egreso (MOV-03). POST /admin/finance/expenses. Una sola fila
   * kind='expense' (outflow) en la caja indicada. Roles: FINANCE_VOID_ROLES.
   */
  async function registerExpense(input: RegisterExpenseInput): Promise<{ expense: ExpenseDetail }> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.post<{ expense: ExpenseDetail }>('/admin/finance/expenses', input);
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error registrando egreso');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Centros de costo activos por país (EGR-01/02). Source: GET
   * /admin/finance/cost-centers. Consumido por el selector obligatorio del
   * dialog de egreso. Owner pasa country = selectedCountry; non-owner lo omite
   * y el server usa su scope.
   */
  async function getCostCenters(params: CostCenterParams = {}): Promise<CostCenterItem[]> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<CostCenterItem[]>('/admin/finance/cost-centers', {
        params,
      });
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando centros de costo');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  // =========================================================================
  // Phase 152 — ABM de categorías de egreso / centros de costo (CAJA-05).
  // Endpoints admin/owner-only bajo /admin/finance/cost-centers (guard
  // ADMIN_ROLES en el backend, 152-04). País-scoped (D-08, nombre único por
  // país): las escrituras/listado pasan el país del selector de CajaPage.
  // Sin borrado físico — deactivate/reactivate = baja/alta lógica.
  // =========================================================================

  /**
   * Lista TODAS las categorías del país (activas Y dadas de baja — el ABM
   * muestra ambas, D-08). Source: GET /admin/finance/cost-centers/all → { centers }.
   */
  async function listAllCostCenters(country: 'AR' | 'ES'): Promise<CostCenter[]> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<{ centers: CostCenter[] }>('/admin/finance/cost-centers/all', {
        params: { country },
      });
      return data.centers;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando categorías de egreso');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Alta de categoría de egreso. Source: POST /admin/finance/cost-centers.
   * El backend rechaza con 409 si el nombre ya existe en el país (D-08).
   */
  async function createCostCenter(input: CreateCostCenterInput): Promise<{ center: CostCenter }> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.post<{ center: CostCenter }>('/admin/finance/cost-centers', input);
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error creando categoría de egreso');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Renombre de categoría. Source: PATCH /admin/finance/cost-centers/:id.
   * El backend rechaza con 409 si el nuevo nombre colisiona en el país (D-08).
   */
  async function renameCostCenter(
    id: number,
    input: RenameCostCenterInput
  ): Promise<{ center: CostCenter }> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.patch<{ center: CostCenter }>(
        `/admin/finance/cost-centers/${id}`,
        input
      );
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error renombrando categoría de egreso');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Baja lógica (is_active=false, sin DELETE — D-08). La categoría sale del
   * selector de egresos pero se conserva. Source: POST /cost-centers/:id/deactivate.
   */
  async function deactivateCostCenter(id: number): Promise<{ center: CostCenter }> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.post<{ center: CostCenter }>(
        `/admin/finance/cost-centers/${id}/deactivate`
      );
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error desactivando categoría de egreso');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Reactivación de una categoría dada de baja (is_active=true).
   * Source: POST /admin/finance/cost-centers/:id/reactivate.
   */
  async function reactivateCostCenter(id: number): Promise<{ center: CostCenter }> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.post<{ center: CostCenter }>(
        `/admin/finance/cost-centers/${id}/reactivate`
      );
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error reactivando categoría de egreso');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  // =========================================================================
  // Phase 141 — Exports Excel (REP-04) — sibling /export endpoints, blob
  // =========================================================================

  /** Export bandeja a .xlsx. Source: GET /admin/finance/pending-tray/export. */
  async function exportPendingTrayToExcel(
    params: Omit<PendingTrayParams, 'page' | 'limit'> = {}
  ): Promise<Blob> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get('/admin/finance/pending-tray/export', {
        params,
        responseType: 'blob',
      });
      return data as Blob;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error exportando bandeja');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  /** Export saldos a .xlsx. Source: GET /admin/finance/cash-registers/balances/export. */
  async function exportCashBalancesToExcel(params: CashBalancesParams = {}): Promise<Blob> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get('/admin/finance/cash-registers/balances/export', {
        params,
        responseType: 'blob',
      });
      return data as Blob;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error exportando saldos');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  /** Export historial mov/egresos a .xlsx. Source: GET /admin/finance/movements-history/export. */
  async function exportMovEgresosToExcel(
    params: Omit<MovEgresoParams, 'page' | 'limit'> = {}
  ): Promise<Blob> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get('/admin/finance/movements-history/export', {
        params,
        responseType: 'blob',
      });
      return data as Blob;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error exportando movimientos');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Phase 108 — Lista los conceptos pendientes (saldos abiertos) del miembro,
   * orden FIFO por effective_date ASC. Source: GET /admin/members/:id/outstanding-concepts.
   * Per CONTEXT D-01/D-02: NO paginado, retorna array completo (max ~20 conceptos por miembro).
   */
  async function getOutstandingConcepts(memberId: number): Promise<OutstandingConcept[]> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<{ concepts: OutstandingConcept[] }>(
        `/admin/members/${memberId}/outstanding-concepts`
      );
      return data.concepts;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando conceptos pendientes');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Phase 146 (COBRO-03) — cobros sueltos (advance_payment) pendientes no
   * anulados del socio, candidatos a imputar al alta de un plan.
   * Source: GET /admin/finance/transactions/pending-misc/:memberId.
   */
  async function getPendingMisc(memberId: number): Promise<PendingMiscItem[]> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<{ items: PendingMiscItem[] }>(
        `/admin/finance/transactions/pending-misc/${memberId}`
      );
      return data.items;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando cobros sueltos pendientes');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Phase 108 — Historial financiero paginado del miembro.
   * Source: GET /admin/members/:id/financial-history (Phase 106-04).
   * Reusa el shape canonical PaginatedResult<T> = { rows, total, page, limit }.
   */
  async function getFinancialHistory(
    memberId: number,
    page: number,
    limit: number
  ): Promise<PaginatedResult<FinancialHistoryItem>> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<PaginatedResult<FinancialHistoryItem>>(
        `/admin/members/${memberId}/financial-history`,
        { params: { page, limit } }
      );
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando historial financiero');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Phase 108 — Crea una transacción financiera (registrar pago de saldo, ajustes, etc.).
   * Source: POST /admin/finance/transactions (Phase 106).
   * Para "Registrar pago" se envía con kind='debt_settlement', direction='inflow' (D-22).
   */
  async function createTransaction(
    input: RegisterPaymentInput
  ): Promise<CreateTransactionResponse> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.post<CreateTransactionResponse>(
        '/admin/finance/transactions',
        input
      );
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error registrando pago');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Phase 109 D-15 — Excel export of CajaPage transactions.
   * Server-side rendering with exceljs (Phase 64 P03 pattern).
   * Returns a Blob the caller writes to disk via URL.createObjectURL.
   * Same filter shape as listTransactions (minus page/limit; server
   * returns all matching rows in one shot).
   */
  async function exportToExcel(
    params: Omit<TransactionListParams, 'page' | 'limit'>
  ): Promise<Blob> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get('/admin/finance/transactions/export', {
        params,
        responseType: 'blob',
      });
      return data as Blob;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error exportando caja');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Phase 109 CAJA-03 — List outstanding balances (Deudas report).
   * Source: GET /admin/reports/outstanding-balances (Plan 109-02).
   * Filters with undefined values are auto-omitted by axios `params:`.
   */
  async function getOutstandingBalances(
    filters: OutstandingBalancesFilters = {}
  ): Promise<OutstandingBalancesResult> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<OutstandingBalancesResult>(
        '/admin/reports/outstanding-balances',
        { params: filters }
      );
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando deudas');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Phase 109 CAJA-04 — Server-side Excel export of outstanding balances.
   * Source: GET /admin/reports/outstanding-balances/export (Plan 109-04).
   * Mirrors exportToExcel pattern (Plan 109-03) — server returns the full
   * filtered set in one .xlsx; admin never paginates client-side.
   */
  async function exportOutstandingBalancesToExcel(
    params: Omit<OutstandingBalancesFilters, 'page' | 'limit'> = {}
  ): Promise<Blob> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get('/admin/reports/outstanding-balances/export', {
        params,
        responseType: 'blob',
      });
      return data as Blob;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error exportando deudas');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Gestión de una deuda (brief §2/§3): PATCH parcial de estado, promesa de
   * pago y observaciones. Source: PATCH
   * /admin/reports/outstanding-balances/:balanceId/management. `null` en
   * promesa/observaciones las borra; campos omitidos quedan como están.
   */
  async function updateDebtManagement(
    balanceId: number,
    input: DebtManagementUpdateInput
  ): Promise<DebtManagementView> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.patch<DebtManagementView>(
        `/admin/reports/outstanding-balances/${balanceId}/management`,
        input
      );
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error actualizando la gestión de la deuda');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Phase 153 (DEUDA-04) — Vencidos: cohorte de socios con plan vencido sin
   * renovar en los últimos 60 días (leads de renovación, sin monto — D-06).
   * Source: GET /admin/reports/expired-members (Plan 153-02). Hereda el guard
   * plugin-level de reports (coach → 403). Filtros undefined los omite axios.
   */
  async function getExpiredMembers(
    filters: ExpiredMembersFilters = {}
  ): Promise<ExpiredMembersResult> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<ExpiredMembersResult>('/admin/reports/expired-members', {
        params: filters,
      });
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando vencidos');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function getSummary(params: FinanceSummaryParams = {}): Promise<FinanceSummary> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<FinanceSummary>('/admin/finance/transactions/summary', {
        params,
      });
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando resumen financiero');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  // =========================================================================
  // Phase 150 — ABM de cuentas bancarias (CTA-01). Endpoints admin/owner-only
  // bajo /admin/finance/cash-registers (guard stricter en el backend, plan 03).
  // Cuenta banco = cash_registers type='banco', branchId=null, moneda FIJA.
  // =========================================================================

  /**
   * Lista cuentas bancarias (activas Y cerradas — el ABM muestra ambas, D-07).
   * Source: GET /admin/finance/cash-registers → { accounts }.
   */
  async function listBankAccounts(): Promise<{ accounts: BankAccount[] }> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<{ accounts: BankAccount[] }>('/admin/finance/cash-registers');
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando cuentas bancarias');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Alta de cuenta bancaria. Source: POST /admin/finance/cash-registers.
   * `input` incluye currency (D-04 — fijada solo al crear). El backend deriva
   * `name` (D-03) y revalida la regla uno-de-dos (D-02).
   */
  async function createBankAccount(
    input: CreateBankAccountInput
  ): Promise<{ account: BankAccount }> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.post<{ account: BankAccount }>(
        '/admin/finance/cash-registers',
        input
      );
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error creando cuenta bancaria');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Abre la caja de efectivo de una sucursal. Source: POST
   * /admin/finance/cash-registers/efectivo. El backend rechaza con 409 si esa
   * sucursal ya tiene una caja activa en esa moneda (invariante que mantiene
   * determinista la resolución de caja en los cobros en efectivo).
   */
  async function createEfectivoCaja(input: {
    branchId: number;
    currency: string;
    openingBalance?: number;
  }): Promise<{ caja: CajaSaldoRow }> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.post<{ caja: CajaSaldoRow }>(
        '/admin/finance/cash-registers/efectivo',
        input
      );
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error abriendo la caja');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Edición de cuenta bancaria. Source: PATCH /admin/finance/cash-registers/:id.
   * `input` NO incluye currency (moneda fija post-creación, D-04).
   */
  async function updateBankAccount(
    id: number,
    input: UpdateBankAccountInput
  ): Promise<{ account: BankAccount }> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.patch<{ account: BankAccount }>(
        `/admin/finance/cash-registers/${id}`,
        input
      );
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error editando cuenta bancaria');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Baja lógica (is_active=false, sin DELETE — D-06). Devuelve el saldo firme
   * actual para que el front arme la advertencia si ≠ 0.
   * Source: POST /admin/finance/cash-registers/:id/close.
   */
  async function closeBankAccount(id: number): Promise<{ account: BankAccount; balance: number }> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.post<{ account: BankAccount; balance: number }>(
        `/admin/finance/cash-registers/${id}/close`
      );
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cerrando cuenta bancaria');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Reactivación de una cuenta cerrada (is_active=true, D-07).
   * Source: POST /admin/finance/cash-registers/:id/reactivate.
   */
  async function reactivateBankAccount(id: number): Promise<{ account: BankAccount }> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.post<{ account: BankAccount }>(
        `/admin/finance/cash-registers/${id}/reactivate`
      );
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error reactivando cuenta bancaria');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  function cleanup() {
    loading.value = false;
    error.value = null;
  }

  return {
    loading,
    error,
    listTransactions,
    voidTransaction,
    getSummary,
    // Phase 108 additions:
    getOutstandingConcepts,
    getFinancialHistory,
    // Phase 146 addition — cobros sueltos pendientes para imputar al alta:
    getPendingMisc,
    createTransaction,
    // Phase 109 additions:
    exportToExcel,
    getOutstandingBalances,
    exportOutstandingBalancesToExcel,
    // Phase 153 addition — Vencidos (DEUDA-04):
    getExpiredMembers,
    updateDebtManagement,
    // Phase 141 additions — 137 validation actions:
    validateTransaction,
    observeTransaction,
    correctTransaction,
    // Phase 141 additions — read endpoints (REP-01/02/03):
    getPendingTray,
    getCashRegisterBalances,
    getMovEgresosHistory,
    // Phase 147 addition — centros de costo de egresos (EGR-01/02):
    getCostCenters,
    // Phase 152 additions — ABM de categorías de egreso (CAJA-05):
    listAllCostCenters,
    createCostCenter,
    renameCostCenter,
    deactivateCostCenter,
    reactivateCostCenter,
    // Phase 139 additions — registrar movimiento / egreso (MOV-01..03):
    registerMovement,
    registerExpense,
    // Phase 141 additions — Excel exports (REP-04):
    exportPendingTrayToExcel,
    exportCashBalancesToExcel,
    exportMovEgresosToExcel,
    // Phase 150 additions — ABM de cuentas bancarias (CTA-01):
    listBankAccounts,
    createBankAccount,
    createEfectivoCaja,
    updateBankAccount,
    closeBankAccount,
    reactivateBankAccount,
    cleanup,
  };
}
