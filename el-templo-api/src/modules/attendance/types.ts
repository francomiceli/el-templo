/**
 * Attendance Module Types
 *
 * Interfaces for QR check-in, coach batch confirmation,
 * manual check-in, and attendance queries.
 */

// ─── Enum Union Types ────────────────────────────────────────────────────────

export type AttendanceStatus = "registrado" | "confirmado";
export type AttendanceSource = "qr" | "manual";

// ─── Record Types ────────────────────────────────────────────────────────────

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

export interface CheckInInput {
  memberId: number;
  branchId: number;
  source: AttendanceSource;
}

export interface QrPayload {
  branchId: number;
  type: "checkin";
}

export interface AttendanceListParams {
  memberId?: number;
  branchId?: number;
  date?: string; // YYYY-MM-DD
  dateFrom?: string;
  dateTo?: string;
  status?: AttendanceStatus;
  page: number;
  limit: number;
}
