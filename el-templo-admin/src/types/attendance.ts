/**
 * Attendance types for admin UI.
 * Matches the AttendanceRecord shape from the attendance API.
 */

export type AttendanceStatus = 'confirmado';
export type AttendanceSource = 'qr' | 'manual';

export interface AttendanceRecord {
  id: number;
  memberId: number;
  memberName: string;
  branchId: number;
  branchName: string;
  checkedInAt: string;
  status: AttendanceStatus;
  source: AttendanceSource;
}

export const statusLabels: Record<AttendanceStatus, string> = {
  confirmado: 'Confirmado',
};

export const statusColors: Record<AttendanceStatus, string> = {
  confirmado: 'positive',
};

export const sourceLabels: Record<AttendanceSource, string> = {
  qr: 'QR',
  manual: 'Manual',
};

/**
 * Slot attendance item from GET /admin/attendance/slot/:scheduleId/:date
 */
export interface SlotAttendanceItem {
  memberId: number;
  memberName: string;
  bookingId: number | null;
  bookingStatus: string | null;
  attendanceId: number | null;
  checkedInAt: string | null;
  source: 'qr' | 'manual' | null;
  segment: string | null;
  // Phase 136 D-06/D-12: tenure label (Antigüedad) replaces the avatar chip
  // in Horarios. Computed on the fly from users.createdAt.
  seniority: 'nuevo' | '1-3m' | '3-6m' | '6m+' | null;
  // Active/paused subscription end date (YYYY-MM-DD) for the Vencimiento pill.
  endDate: string | null;
}
