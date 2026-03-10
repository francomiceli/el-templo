/**
 * Scheduling API composable.
 * Provides methods for activities, schedules, bookings, and holiday management.
 */

import { ref } from 'vue';
import axios from 'axios';
import { api } from 'src/boot/axios';
import type {
  ActivityRecord,
  WeeklySlotView,
  SlotDetailView,
  BookingRecord,
  HolidayRecord,
  ScheduleSlot,
} from 'src/types/scheduling';

function extractError(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const message = err.response?.data?.error ?? err.response?.data?.message;
    if (typeof message === 'string') return message;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}

export function useSchedulingApi() {
  const loading = ref(false);
  const error = ref<string | null>(null);

  // ─── Activities ───────────────────────────────────────────────────────

  async function createActivity(data: {
    name: string;
    description?: string;
  }): Promise<ActivityRecord> {
    loading.value = true;
    error.value = null;
    try {
      const { data: result } = await api.post<ActivityRecord>('/admin/scheduling/activities', data);
      return result;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error creando actividad');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function listActivities(): Promise<ActivityRecord[]> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<{ activities: ActivityRecord[] }>(
        '/admin/scheduling/activities'
      );
      return data.activities;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando actividades');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function updateActivity(
    activityId: number,
    data: { name?: string; description?: string; isActive?: boolean }
  ): Promise<ActivityRecord> {
    loading.value = true;
    error.value = null;
    try {
      const { data: result } = await api.put<ActivityRecord>(
        `/admin/scheduling/activities/${activityId}`,
        data
      );
      return result;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error actualizando actividad');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  // ─── Schedules ────────────────────────────────────────────────────────

  async function createSchedule(data: {
    branchId: number;
    activityId: number;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
  }): Promise<ScheduleSlot> {
    loading.value = true;
    error.value = null;
    try {
      const { data: result } = await api.post<ScheduleSlot>('/admin/scheduling/schedules', data);
      return result;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error creando horario');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function getWeeklyGrid(
    branchId: number,
    weekStart: string
  ): Promise<{ slots: WeeklySlotView[]; holidays: HolidayRecord[] }> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<{ slots: WeeklySlotView[]; holidays: HolidayRecord[] }>(
        '/admin/scheduling/schedules/weekly',
        { params: { branchId, weekStart } }
      );
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando grilla semanal');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function getSlotDetail(scheduleId: number, date: string): Promise<SlotDetailView> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<SlotDetailView>(
        `/admin/scheduling/schedules/${scheduleId}/detail`,
        { params: { date } }
      );
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando detalle del horario');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function toggleSchedule(scheduleId: number, isActive: boolean): Promise<ScheduleSlot> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.put<ScheduleSlot>(
        `/admin/scheduling/schedules/${scheduleId}/toggle`,
        { isActive }
      );
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error actualizando horario');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function seedSchedules(branchId: number): Promise<{ created: number }> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.post<{ created: number }>('/admin/scheduling/schedules/seed', {
        branchId,
      });
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error creando horarios predeterminados');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  // ─── Bookings ─────────────────────────────────────────────────────────

  async function adminAddBooking(data: {
    scheduleId: number;
    memberId: number;
    date: string;
  }): Promise<BookingRecord> {
    loading.value = true;
    error.value = null;
    try {
      const { data: result } = await api.post<BookingRecord>('/admin/scheduling/bookings', data);
      return result;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error agregando reserva');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function adminRemoveBooking(bookingId: number): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      await api.delete(`/admin/scheduling/bookings/${bookingId}`);
    } catch (err: unknown) {
      error.value = extractError(err, 'Error eliminando reserva');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  // ─── Holidays ─────────────────────────────────────────────────────────

  async function addHoliday(data: {
    country: string;
    date: string;
    name: string;
  }): Promise<HolidayRecord> {
    loading.value = true;
    error.value = null;
    try {
      const { data: result } = await api.post<HolidayRecord>('/admin/scheduling/holidays', data);
      return result;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error agregando feriado');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function removeHoliday(holidayId: number): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      await api.delete(`/admin/scheduling/holidays/${holidayId}`);
    } catch (err: unknown) {
      error.value = extractError(err, 'Error eliminando feriado');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function listHolidays(params: {
    country?: string;
    year?: number;
  }): Promise<HolidayRecord[]> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<{ holidays: HolidayRecord[] }>('/admin/scheduling/holidays', {
        params,
      });
      return data.holidays;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando feriados');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  // ─── Cleanup ──────────────────────────────────────────────────────────

  function cleanup() {
    loading.value = false;
    error.value = null;
  }

  return {
    loading,
    error,
    createActivity,
    listActivities,
    updateActivity,
    createSchedule,
    getWeeklyGrid,
    getSlotDetail,
    toggleSchedule,
    seedSchedules,
    adminAddBooking,
    adminRemoveBooking,
    addHoliday,
    removeHoliday,
    listHolidays,
    cleanup,
  };
}
