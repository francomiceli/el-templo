/**
 * Payments API composable.
 * Provides methods for payment listing, voiding, and financial summary.
 */

import { ref } from 'vue';
import { api } from 'src/boot/axios';
import { extractError } from 'src/utils/extract-error';
import type { PaymentListItem, PaymentListParams, FinancialSummary } from 'src/types/payment';

export function usePaymentsApi() {
  const loading = ref(false);
  const error = ref<string | null>(null);

  // -- Payment-scoped endpoints -----------------------------------------------

  async function voidPayment(paymentId: number, reason: string): Promise<PaymentListItem> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.post<PaymentListItem>(
        `/admin/payments/payments/${paymentId}/void`,
        { reason }
      );
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error anulando pago');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  // -- Global payment endpoints -----------------------------------------------

  async function listPayments(
    params: PaymentListParams
  ): Promise<{ payments: PaymentListItem[]; total: number }> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<{ payments: PaymentListItem[]; total: number }>(
        '/admin/payments/payments',
        { params }
      );
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando pagos');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function getFinancialSummary(
    branchId?: number,
    dateFrom?: string,
    dateTo?: string
  ): Promise<FinancialSummary> {
    loading.value = true;
    error.value = null;
    try {
      const params: Record<string, unknown> = {};
      if (branchId !== undefined) params.branchId = branchId;
      if (dateFrom !== undefined) params.dateFrom = dateFrom;
      if (dateTo !== undefined) params.dateTo = dateTo;
      const { data } = await api.get<FinancialSummary>('/admin/payments/payments/summary', {
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

  // -- Cleanup ----------------------------------------------------------------

  function cleanup() {
    loading.value = false;
    error.value = null;
  }

  return {
    loading,
    error,
    voidPayment,
    listPayments,
    getFinancialSummary,
    cleanup,
  };
}
