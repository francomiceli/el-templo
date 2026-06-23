/**
 * Scheduling types for the admin app.
 * Mirrors the API types from el-templo-api/src/modules/scheduling/types.ts.
 */

export type BookingStatus =
  | 'reservado'
  | 'qr_escaneado'
  | 'confirmado'
  | 'cancelado'
  | 'lista_espera'
  | 'no_show';
export type DayOfWeek = 1 | 2 | 3 | 4 | 5 | 6;

export interface ActivityRecord {
  id: number;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduleSlot {
  id: number;
  branchId: number;
  branchName: string;
  activityId: number;
  activityName: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isActive: boolean;
  /** Admin-provided reason shown to members when the slot is deactivated. */
  inactiveReason: string | null;
  /**
   * ISO timestamp of the last deactivation. Used by the SlotDetailDialog to
   * scope "bookings that will be restored" to the deactivation window.
   */
  deactivatedAt: string | null;
}

/**
 * Response from PUT /admin/scheduling/schedules/:id/toggle.
 *
 * - On deactivate: `cancelledBookings` reports how many future
 *   'reservado'/'lista_espera' bookings the API auto-cancelled.
 * - On reactivate: `restoredBookings` reports how many bookings cancelled
 *   during the deactivation window were restored to 'reservado'.
 */
export interface ToggleScheduleResponse extends ScheduleSlot {
  cancelledBookings: number;
  restoredBookings: number;
}

export interface WeeklySlotView extends ScheduleSlot {
  bookedCount: number;
  trialCount: number;
  maxCapacity: number;
  isFull: boolean;
  isHoliday: boolean;
}

/** Phase 102-06: coach-facing trial list response, grouped by branch. */
export interface TrialListItem {
  bookingId: number;
  userId: number;
  firstName: string;
  lastName: string;
  phone: string | null;
  scheduleId: number;
  startTime: string;
  endTime: string;
  activityName: string;
  status: string;
}

export interface TrialListBranchGroup {
  branchId: number;
  branchName: string;
  trials: TrialListItem[];
}

export interface TrialListResponse {
  date: string;
  shift: 'TM' | 'TT' | 'all';
  groups: TrialListBranchGroup[];
}

export interface BookingRecord {
  id: number;
  memberId: number;
  memberName: string;
  scheduleId: number;
  activityName: string;
  dayOfWeek: number;
  startTime: string;
  bookingDate: string;
  status: BookingStatus;
  waitlistPosition: number | null;
  bookedAt: string;
  cancelledAt: string | null;
  isTrial: boolean;
  segment: string | null;
  // Phase 136 D-06/D-12: tenure label (Antigüedad) replaces the avatar chip
  // in Horarios. Computed on the fly from users.createdAt.
  seniority: 'nuevo' | '1-3m' | '3-6m' | '6m+' | null;
}

export interface HolidayRecord {
  id: number;
  country: string;
  date: string;
  name: string;
}

/**
 * Phase 113: payload returned by the backend on a 409 cascade-block when the
 * admin tries to deactivate an activity that still has active schedules
 * referencing it. Each entry is enough for the admin UI to render an
 * actionable toast: "Lun 10:00-11:00 (Constitución)".
 */
export interface AffectedScheduleRef {
  id: number;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  branchName: string;
}

export interface SlotDetailView {
  schedule: ScheduleSlot;
  date: string;
  bookings: BookingRecord[];
  maxCapacity: number;
}

export const DAY_LABELS: Record<DayOfWeek, string> = {
  1: 'Lunes',
  2: 'Martes',
  3: 'Miércoles',
  4: 'Jueves',
  5: 'Viernes',
  6: 'Sábado',
};

export const DAY_SHORT_LABELS: Record<DayOfWeek, string> = {
  1: 'Lun',
  2: 'Mar',
  3: 'Mie',
  4: 'Jue',
  5: 'Vie',
  6: 'Sab',
};

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  reservado: 'Reservado',
  qr_escaneado: 'QR Escaneado',
  confirmado: 'Confirmado',
  lista_espera: 'En espera',
  cancelado: 'Cancelado',
  no_show: 'No asistio',
};

export const BOOKING_STATUS_COLORS: Record<BookingStatus, string> = {
  reservado: 'primary',
  qr_escaneado: 'info',
  confirmado: 'positive',
  lista_espera: 'warning',
  cancelado: 'grey',
  no_show: 'negative',
};
