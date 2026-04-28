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
    cleanup,
  };
}
