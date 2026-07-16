/**
 * Scheduling API composable.
 * Provides methods for activities, schedules, bookings, and holiday management.
 */

import { ref } from 'vue';
import { api } from 'src/boot/axios';
import { extractError } from 'src/utils/extract-error';
import type {
  ActivityRecord,
  WeeklySlotView,
  SlotDetailView,
  BookingRecord,
  HolidayRecord,
  ScheduleSlot,
  ToggleScheduleResponse,
  TrialListResponse,
} from 'src/types/scheduling';

export function useSchedulingApi() {
  const loading = ref(false);
  const error = ref<string | null>(null);

  // ─── Activities ───────────────────────────────────────────────────────

  async function createActivity(data: {
    name: string;
    description?: string;
    maxCapacity?: number | null;
    isSpecial?: boolean;
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
    data: {
      name?: string;
      description?: string;
      isActive?: boolean;
      maxCapacity?: number | null;
      isSpecial?: boolean;
    }
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
  ): Promise<{
    slots: WeeklySlotView[];
    holidays: HolidayRecord[];
    branchTimezone: string;
  }> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<{
        slots: WeeklySlotView[];
        holidays: HolidayRecord[];
        branchTimezone: string;
      }>('/admin/scheduling/schedules/weekly', { params: { branchId, weekStart } });
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

  async function toggleSchedule(
    scheduleId: number,
    isActive: boolean,
    inactiveReason?: string | null
  ): Promise<ToggleScheduleResponse> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.put<ToggleScheduleResponse>(
        `/admin/scheduling/schedules/${scheduleId}/toggle`,
        { isActive, inactiveReason: inactiveReason ?? null }
      );
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error actualizando horario');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function previewScheduleDeletion(
    scheduleId: number,
    fromDate: string
  ): Promise<{
    cancelledBookings: number;
    affectedFixedMembers: number;
    affectedFlexibleMembers: number;
    creditsToGrant: number;
    sampleMembers: Array<{ memberName: string; planType: 'fixed' | 'flexible' }>;
  }> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<{
        cancelledBookings: number;
        affectedFixedMembers: number;
        affectedFlexibleMembers: number;
        creditsToGrant: number;
        sampleMembers: Array<{ memberName: string; planType: 'fixed' | 'flexible' }>;
      }>(`/admin/scheduling/schedules/${scheduleId}/deletion-preview`, {
        params: { fromDate },
      });
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error calculando impacto de eliminación');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function deleteScheduleFromDate(
    scheduleId: number,
    fromDate: string
  ): Promise<{
    cancelledBookings: number;
    affectedFixedMembers: number;
    creditsGranted: number;
  }> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.post<{
        cancelledBookings: number;
        affectedFixedMembers: number;
        creditsGranted: number;
      }>(`/admin/scheduling/schedules/${scheduleId}/delete-from-date`, { fromDate });
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error eliminando horario');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Cancel ONE occurrence (a single date) of a recurring slot. The template
   * and every other week stay active. Cancels that date's bookings and
   * grants replacement credits to affected fixed-plan members.
   */
  async function cancelScheduleDate(
    scheduleId: number,
    date: string,
    reason?: string | null
  ): Promise<{
    exceptionDate: string;
    cancelledBookings: number;
    affectedFixedMembers: number;
    creditsGranted: number;
  }> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.post<{
        exceptionDate: string;
        cancelledBookings: number;
        affectedFixedMembers: number;
        creditsGranted: number;
      }>(`/admin/scheduling/schedules/${scheduleId}/cancel-date`, {
        date,
        reason: reason ?? null,
      });
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cancelando la clase de esta fecha');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  /** Undo a per-date cancellation, restoring the bookings it auto-cancelled. */
  async function restoreScheduleDate(
    scheduleId: number,
    date: string
  ): Promise<{ restored: boolean; restoredBookings: number }> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.delete<{ restored: boolean; restoredBookings: number }>(
        `/admin/scheduling/schedules/${scheduleId}/cancel-date/${date}`
      );
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error restaurando la clase de esta fecha');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function updateScheduleActivity(
    scheduleId: number,
    activityId: number
  ): Promise<ScheduleSlot> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.patch<ScheduleSlot>(
        `/admin/scheduling/schedules/${scheduleId}/activity`,
        { activityId }
      );
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cambiando actividad del horario');
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

  /**
   * Find the next date a slot has open capacity. Used by the
   * FixedSchedulePicker to show "available from <date>" on full cells so
   * the admin can anchor a member to a slot that is full this week but
   * free in a later week.
   */
  async function getNextAvailableDate(
    scheduleId: number,
    fromDate?: string
  ): Promise<string | null> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<{ nextAvailableDate: string | null }>(
        `/admin/scheduling/schedules/${scheduleId}/next-available`,
        { params: fromDate ? { from: fromDate } : {} }
      );
      return data.nextAvailableDate;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error buscando próxima fecha disponible');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function adminAddBooking(data: {
    scheduleId: number;
    memberId: number;
    date: string;
  }): Promise<{ booking: BookingRecord; warnings: string[] }> {
    loading.value = true;
    error.value = null;
    try {
      const { data: result } = await api.post<{ booking: BookingRecord; warnings: string[] }>(
        '/admin/scheduling/bookings',
        data
      );
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

  async function bookTrial(data: {
    userId: number;
    scheduleId: number;
    bookingDate: string; // YYYY-MM-DD
  }): Promise<{ bookingId: number }> {
    loading.value = true;
    error.value = null;
    try {
      const { data: result } = await api.post<{ bookingId: number }>(
        '/admin/scheduling/trials',
        data
      );
      return result;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error reservando sesión de prueba');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Reprogramar una sesión de prueba en un solo paso (Plan 164-01): cancela
   * el turno viejo + crea el nuevo en UNA transacción del backend. El guard
   * ALL_STAFF_ROLES + country-scope lo aplica el endpoint — el cliente sólo
   * POSTea.
   */
  async function rescheduleTrial(
    bookingId: number,
    data: { scheduleId: number; date: string; branchId: number }
  ): Promise<{ bookingId: number }> {
    loading.value = true;
    error.value = null;
    try {
      const { data: result } = await api.post<{ bookingId: number }>(
        `/admin/scheduling/trials/${bookingId}/reschedule`,
        data
      );
      return result;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error reprogramando sesión de prueba');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function listEligibleTrials(branchId: number): Promise<{
    users: Array<{
      id: number;
      firstName: string;
      lastName: string;
      phone: string | null;
      dni: string | null;
    }>;
  }> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<{
        users: Array<{
          id: number;
          firstName: string;
          lastName: string;
          phone: string | null;
          dni: string | null;
        }>;
      }>('/admin/scheduling/trials/eligible', { params: { branchId } });
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando alumnos en prueba');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function listTrials(params: {
    date: string;
    shift?: 'TM' | 'TT' | 'all';
    branchId?: number;
  }): Promise<TrialListResponse> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<TrialListResponse>('/admin/scheduling/trials', {
        params,
      });
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando sesiones de prueba');
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
    cancelScheduleDate,
    restoreScheduleDate,
    previewScheduleDeletion,
    deleteScheduleFromDate,
    updateScheduleActivity,
    seedSchedules,
    getNextAvailableDate,
    adminAddBooking,
    adminRemoveBooking,
    bookTrial,
    rescheduleTrial,
    listEligibleTrials,
    listTrials,
    addHoliday,
    removeHoliday,
    listHolidays,
    cleanup,
  };
}
