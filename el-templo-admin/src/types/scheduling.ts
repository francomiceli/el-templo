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
}

export interface WeeklySlotView extends ScheduleSlot {
  bookedCount: number;
  maxCapacity: number;
  isFull: boolean;
  isHoliday: boolean;
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
}

export interface HolidayRecord {
  id: number;
  country: string;
  date: string;
  name: string;
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
  3: 'Miercoles',
  4: 'Jueves',
  5: 'Viernes',
  6: 'Sabado',
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
