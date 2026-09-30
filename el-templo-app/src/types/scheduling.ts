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
  // Cupos de Sesión de Prueba que quedan en el turno (tope propio de 3,
  // separado del cupo general). Se usa para la disponibilidad del modo prueba.
  trialSpotsRemaining: number
  // mirror de scheduling/types.ts (162 APP-01): clase especial "Actividades con Aura"
  isSpecial: boolean
  // Fase 180 Plan 10 (RES-05, D-23): descripción coherente con la etiqueta
  // MOSTRADA (activityName). null = sin copy cargado por el admin.
  activityDescription: string | null
  // App 1.7.9 (reservas: profe por turno): nombre de pila del profe
  // atribuido al slot para la semana pedida (roster effective-dated). null
  // sin change-point vigente.
  // 2026-09-29: ahora es el profe EFECTIVO — el propio del horario si lo
  // tiene (coachOverride=true, ej. la profe de yoga dentro de un turno de
  // otro profe), si no el del turno del roster.
  coachFirstName: string | null
  // Línea del pase especial (NULL = Aura / regular): la clase solo la habilita
  // un pase de la MISMA línea.
  specialLine: string | null
  // Profe propio del horario (schedules.coach_user_id). NULL = hereda el turno.
  coachUserId: number | null
  // true cuando coachFirstName sale del profe propio del horario y no del turno.
  coachOverride: boolean
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
  // Categoría de la actividad reservada (activities.is_special). La regla
  // diaria del cliente compara solo contra reservas del mismo tipo, igual
  // que la guarda 8b del server.
  isSpecial: boolean
  // Línea del pase especial de la actividad reservada (NULL = Aura/regular):
  // la regla diaria de especiales es por línea (yoga no choca con Aura).
  specialLine: string | null
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
  3: 'Miércoles',
  4: 'Jueves',
  5: 'Viernes',
  6: 'Sábado',
}

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  reservado: 'Reservada',
  qr_escaneado: 'QR Escaneado',
  confirmado: 'Confirmada',
  lista_espera: 'En espera',
  cancelado: 'Cancelada',
  no_show: 'No asistio',
}
