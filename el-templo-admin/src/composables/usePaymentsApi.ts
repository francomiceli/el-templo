/**
 * Payments API composable.
 * Provides methods for payment recording, voiding, member balance,
 * global payment list, financial summary, and morosos count.
 */

import { ref } from 'vue';
import axios from 'axios';
import { api } from 'src/boot/axios';
import type {
  PaymentListItem,
  RecordPaymentInput,
  MemberBalance,
  PaymentListParams,
  FinancialSummary,
} from 'src/types/payment';

function extractError(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const message = err.response?.data?.error ?? err.response?.data?.message;
    if (typeof message === 'string') return message;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}

export function usePaymentsApi() {
  const loading = ref(false);
  const error = ref<string | null>(null);

  // -- Member-scoped payment endpoints ----------------------------------------

  async function recordPayment(
    userId: number,
    input: RecordPaymentInput
  ): Promise<PaymentListItem> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.post<PaymentListItem>(
        `/admin/payments/members/${userId}/payments`,
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

  async function getMemberPayments(userId: number): Promise<PaymentListItem[]> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<{ payments: PaymentListItem[] }>(
        `/admin/payments/members/${userId}/payments`
      );
      return data.payments;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando pagos del miembro');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function getMemberBalance(userId: number): Promise<MemberBalance | null> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<MemberBalance>(`/admin/payments/members/${userId}/balance`);
      return data;
    } catch (err: unknown) {
      // 404 means no subscription — not an error
      if (axios.isAxiosError(err) && err.response?.status === 404) {
        return null;
      }
      error.value = extractError(err, 'Error cargando balance del miembro');
      throw err;
    } finally {
      loading.value = false;
    }
  }

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

  async function getMorososCount(branchId?: number): Promise<{ count: number }> {
    loading.value = true;
    error.value = null;
    try {
      const params: Record<string, unknown> = {};
      if (branchId !== undefined) params.branchId = branchId;
      const { data } = await api.get<{ count: number }>('/admin/payments/payments/morosos', {
        params,
      });
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando conteo de morosos');
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
    recordPayment,
    getMemberPayments,
    getMemberBalance,
    voidPayment,
    listPayments,
    getFinancialSummary,
    getMorososCount,
    cleanup,
  };
}
