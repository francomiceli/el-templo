/**
 * Scheduling module types.
 */

import type { MemberSeniority } from "../shared/date-utils";

// Re-exported so consumers of the slot endpoints can reference the tenure
// union from the scheduling contract (Phase 136 D-06).
export type { MemberSeniority };

export type BookingStatus =
  | "reservado"
  | "qr_escaneado"
  | "confirmado"
  | "cancelado"
  | "lista_espera"
  | "no_show";
export type DayOfWeek = 1 | 2 | 3 | 4 | 5 | 6; // Mon-Sat (ISO)

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
  /** Admin-provided reason shown to members when reservation is rejected. */
  inactiveReason: string | null;
  /**
   * Timestamp of the last deactivation. Set when toggling off, cleared on
   * toggle on. Null on schedules that were never deactivated. Surfaced
   * (ISO string) so the admin UI can scope "bookings that will be
   * restored" to the deactivation window.
   */
  deactivatedAt: string | null;
}

export interface WeeklySlotView extends ScheduleSlot {
  bookedCount: number;
  trialCount: number;
  maxCapacity: number;
  isFull: boolean;
  isHoliday: boolean;
  unconfirmedAttendance: number;
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
  // Phase 102: trial bookings don't consume capacity; admin UI splits
  // "Reservados" from "Sesiones de Prueba" using this flag.
  isTrial: boolean;
  // Attendance label (segment) of the member, surfaced so the admin slot
  // roster can tag each alumno without a second fetch. Null when the member
  // has no profile row / no value yet (<1 mes, sin plan).
  segment: string | null;
  // Phase 136 D-05/D-06/D-12: tenure label computed on the fly from
  // users.createdAt — shown only in Horarios, replacing the avatar chip.
  seniority: MemberSeniority | null;
}

export interface HolidayRecord {
  id: number;
  country: string;
  date: string;
  name: string;
}

export interface AttendanceWeekRecord {
  id: number;
  scheduleId: number;
  activityName: string;
  dayOfWeek: number;
  startTime: string;
  checkedInAt: string;
  status: "confirmado";
}

export interface SlotDetailView {
  schedule: ScheduleSlot;
  date: string;
  bookings: BookingRecord[];
  members: SlotMemberView[];
  maxCapacity: number;
}

export type SlotMemberStatus = "reservado" | "qr_escaneado" | "confirmado";

export interface SlotMemberView {
  memberId: number;
  memberName: string;
  bookingId: number | null;
  attendanceId: number | null;
  status: SlotMemberStatus;
  bookingStatus: BookingStatus | null;
}

/**
 * Phase 113 (D-13): when an admin tries to deactivate an activity that has
 * active schedules pointing to it, the API returns a 409 with this list so
 * the UI can show "cambiá la activity de los siguientes horarios antes de
 * desactivarla".
 */
export interface AffectedScheduleRef {
  id: number;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  branchName: string;
}
