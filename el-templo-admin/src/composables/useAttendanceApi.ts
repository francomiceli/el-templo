/**
 * Attendance API composable.
 * Provides member attendance history for the admin member detail page.
 */

import { ref } from 'vue';
import { api } from 'src/boot/axios';
import { extractError } from 'src/utils/extract-error';
import type { AttendanceRecord } from 'src/types/attendance';

export function useAttendanceApi() {
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function getMemberAttendance(
    userId: number,
    page?: number,
    limit?: number
  ): Promise<{ data: AttendanceRecord[]; total: number }> {
    loading.value = true;
    error.value = null;
    try {
      const params: Record<string, unknown> = {};
      if (page !== undefined) params.page = page;
      if (limit !== undefined) params.limit = limit;
      const { data } = await api.get<{
        data: AttendanceRecord[];
        total: number;
      }>(`/admin/attendance/member/${userId}`, { params });
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando historial de asistencia');
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
    getMemberAttendance,
    cleanup,
  };
}
