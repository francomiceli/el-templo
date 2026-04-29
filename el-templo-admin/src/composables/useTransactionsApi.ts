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
} from 'src/types/transaction';
import type { PaginatedResult } from 'src/types/report';

export function useTransactionsApi() {
  const loading = ref(false);
  const error = ref<string | null>(null);

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

  async function voidTransaction(
    transactionId: number,
    reason: string
  ): Promise<{ transaction: TransactionListItem }> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.post<{ transaction: TransactionListItem }>(
        `/admin/finance/transactions/${transactionId}/void`,
        { reason }
      );
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error anulando transaccion');
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
    createTransaction,
    cleanup,
  };
}
