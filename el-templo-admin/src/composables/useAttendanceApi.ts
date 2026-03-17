/**
 * Attendance API composable.
 * Provides member attendance history and slot-based attendance management.
 */

import { ref } from 'vue';
import { api } from 'src/boot/axios';
import { extractError } from 'src/utils/extract-error';
import type { AttendanceRecord, SlotAttendanceItem } from 'src/types/attendance';

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
        records: AttendanceRecord[];
        total: number;
      }>(`/admin/attendance/member/${userId}`, { params });
      return { data: data.records, total: data.total };
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando historial de asistencia');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  // ─── Slot Attendance ────────────────────────────────────────────────

  async function getSlotAttendance(
    scheduleId: number,
    date: string
  ): Promise<{ members: SlotAttendanceItem[] }> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<{ members: SlotAttendanceItem[] }>(
        `/admin/attendance/slot/${scheduleId}/${date}`
      );
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando asistencia del horario');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function coachCheckIn(
    scheduleId: number,
    date: string,
    memberId: number,
    reason?: string
  ): Promise<{ attendance: AttendanceRecord; warnings: string[] }> {
    loading.value = true;
    error.value = null;
    try {
      const body: Record<string, unknown> = { memberId };
      if (reason) body.reason = reason;
      const { data } = await api.post<{ attendance: AttendanceRecord; warnings: string[] }>(
        `/admin/attendance/slot/${scheduleId}/${date}/check-in`,
        body
      );
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error registrando asistencia');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function removeCheckIn(attendanceId: number): Promise<{ removed: boolean }> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.delete<{ removed: boolean }>(`/admin/attendance/${attendanceId}`);
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error eliminando asistencia');
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
    getSlotAttendance,
    coachCheckIn,
    removeCheckIn,
    cleanup,
  };
}
