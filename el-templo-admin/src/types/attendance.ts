/**
 * Attendance types for admin UI.
 * Matches the AttendanceRecord shape from the attendance API.
 */

export type AttendanceStatus = 'registrado' | 'confirmado';
export type AttendanceSource = 'qr' | 'manual';

export interface AttendanceRecord {
  id: number;
  memberId: number;
  memberName: string;
  branchId: number;
  branchName: string;
  checkedInAt: string;
  confirmedAt: string | null;
  status: AttendanceStatus;
  source: AttendanceSource;
}

export const statusLabels: Record<AttendanceStatus, string> = {
  registrado: 'Registrado',
  confirmado: 'Confirmado',
};

export const statusColors: Record<AttendanceStatus, string> = {
  registrado: 'orange',
  confirmado: 'positive',
};

export const sourceLabels: Record<AttendanceSource, string> = {
  qr: 'QR',
  manual: 'Manual',
};
