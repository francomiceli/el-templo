/**
 * Attendance Module Types
 *
 * Interfaces for QR check-in and attendance queries.
 */

// ─── Enum Union Types ────────────────────────────────────────────────────────

export type AttendanceStatus = "confirmado";
export type AttendanceSource = "qr" | "manual";

// ─── Record Types ────────────────────────────────────────────────────────────

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

// ─── Force Check-in Types ──────────────────────────────────────────────────

export interface ForceCheckInInput {
  memberId: number;
  branchId: number;
  reason: string;
}
