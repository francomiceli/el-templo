/**
 * Check-in roster API composable — registros del día de los asistentes de una
 * sede (card de Horarios, coach + admin/dueño).
 */
import { ref } from 'vue';
import { api } from 'src/boot/axios';
import { extractError } from 'src/utils/extract-error';
import type { CheckInRosterResponse } from 'src/types/checkin-roster';

export function useCheckInRosterApi() {
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function getDayRoster(
    branchId: number,
    opts: { date?: string } = {}
  ): Promise<CheckInRosterResponse> {
    loading.value = true;
    error.value = null;
    try {
      const params: Record<string, unknown> = { branchId };
      if (opts.date) params.date = opts.date;
      const { data } = await api.get<CheckInRosterResponse>(
        '/admin/check-ins/roster',
        { params }
      );
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando registros del día');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  function cleanup() {
    loading.value = false;
    error.value = null;
  }

  return { loading, error, getDayRoster, cleanup };
}
