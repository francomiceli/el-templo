/**
 * Scheduling module types.
 */

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
