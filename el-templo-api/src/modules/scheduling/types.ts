/**
 * Scheduling module types.
 */

export type BookingStatus = "confirmed" | "cancelled" | "waitlist" | "no_show";
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
