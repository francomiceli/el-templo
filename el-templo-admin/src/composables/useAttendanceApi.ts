/**
 * Attendance API composable.
 * Provides methods for QR generation, today's attendance,
 * batch confirmation, manual check-in, and member history.
 */

import { ref } from 'vue';
import { api } from 'src/boot/axios';
import { extractError } from 'src/utils/extract-error';
import type { AttendanceRecord, QrTokenResponse, AttendanceListParams } from 'src/types/attendance';

export function useAttendanceApi() {
  const loading = ref(false);
  const error = ref<string | null>(null);

  // -- QR Generation --------------------------------------------------------

  async function generateQr(branchId: number): Promise<QrTokenResponse> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<QrTokenResponse>(`/admin/attendance/qr/${branchId}`);
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error generando QR');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  // -- Today's Attendance ---------------------------------------------------

  async function getTodayAttendance(branchId: number): Promise<AttendanceRecord[]> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<{ data: AttendanceRecord[] }>('/admin/attendance/today', {
        params: { branchId },
      });
      return data.data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando asistencia de hoy');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  // -- Batch Confirm --------------------------------------------------------

  async function batchConfirm(attendanceIds: number[]): Promise<{ confirmed: number }> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.post<{ confirmed: number }>('/admin/attendance/confirm', {
        attendanceIds,
      });
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error confirmando asistencia');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  // -- Manual Check-in ------------------------------------------------------

  async function manualCheckIn(memberId: number, branchId: number): Promise<AttendanceRecord> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.post<AttendanceRecord>('/admin/attendance/manual', {
        memberId,
        branchId,
      });
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error registrando asistencia manual');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  // -- List Attendance (with filters) ---------------------------------------

  async function listAttendance(
    params: AttendanceListParams
  ): Promise<{ data: AttendanceRecord[]; total: number }> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<{
        data: AttendanceRecord[];
        total: number;
      }>('/admin/attendance', { params });
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando asistencia');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  // -- Member Attendance History ---------------------------------------------

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

  // -- Cleanup ---------------------------------------------------------------

  function cleanup() {
    loading.value = false;
    error.value = null;
  }

  return {
    loading,
    error,
    generateQr,
    getTodayAttendance,
    batchConfirm,
    manualCheckIn,
    listAttendance,
    getMemberAttendance,
    cleanup,
  };
}
