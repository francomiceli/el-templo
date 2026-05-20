/**
 * Coach API composable.
 *
 * Powers the coach-facing "Deudas" tab — a simplified projection of member
 * outstanding balances so professors know how much to collect at the door
 * without exposing the full financial detail surface (reserved for gestion).
 */

import { ref } from 'vue';
import { api } from 'src/boot/axios';
import { extractError } from 'src/utils/extract-error';

export interface CoachOutstandingBalanceRow {
  memberId: number;
  memberName: string;
  memberPhone: string | null;
  totalAmount: number;
  currency: string;
}

export interface CoachOutstandingBalancesResult {
  rows: CoachOutstandingBalanceRow[];
}

export interface CoachOutstandingBalancesParams {
  search?: string;
}

export function useCoachApi() {
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function getOutstandingBalances(
    params: CoachOutstandingBalancesParams = {}
  ): Promise<CoachOutstandingBalancesResult> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<CoachOutstandingBalancesResult>(
        '/admin/coach/outstanding-balances',
        { params }
      );
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando deudas');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  return {
    loading,
    error,
    getOutstandingBalances,
  };
}
