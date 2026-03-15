/**
 * Frontend types for the scheduling module.
 * Mirrors API types from el-templo-api/src/modules/scheduling/types.ts
 */

export type BookingStatus =
  | 'reservado'
  | 'qr_escaneado'
  | 'confirmado'
  | 'cancelado'
  | 'lista_espera'
  | 'no_show'
export type DayOfWeek = 1 | 2 | 3 | 4 | 5 | 6

export interface WeeklySlotView {
  id: number
  branchId: number
  branchName: string
  activityId: number
  activityName: string
  dayOfWeek: DayOfWeek
  startTime: string
  endTime: string
  isActive: boolean
  bookedCount: number
  maxCapacity: number
  isFull: boolean
  isHoliday: boolean
}

export interface BookingRecord {
  id: number
  memberId: number
  memberName: string
  scheduleId: number
  activityName: string
  dayOfWeek: DayOfWeek
  startTime: string
  bookingDate: string
  status: BookingStatus
  waitlistPosition: number | null
  bookedAt: string
  cancelledAt: string | null
}

export interface AttendanceWeekRecord {
  id: number
  scheduleId: number
  activityName: string
  dayOfWeek: DayOfWeek
  startTime: string
  checkedInAt: string
  status: 'registrado' | 'confirmado'
}

export interface HolidayRecord {
  id: number
  country: string
  date: string
  name: string
}

export const DAY_LABELS: Record<DayOfWeek, string> = {
  1: 'Lun',
  2: 'Mar',
  3: 'Mie',
  4: 'Jue',
  5: 'Vie',
  6: 'Sab',
}

export const DAY_LABELS_FULL: Record<DayOfWeek, string> = {
  1: 'Lunes',
  2: 'Martes',
  3: 'Miercoles',
  4: 'Jueves',
  5: 'Viernes',
  6: 'Sabado',
}

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  reservado: 'Reservada',
  qr_escaneado: 'QR Escaneado',
  confirmado: 'Confirmada',
  lista_espera: 'En espera',
  cancelado: 'Cancelada',
  no_show: 'No asistio',
}
