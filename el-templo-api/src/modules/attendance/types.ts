/**
 * Attendance Module Types
 *
 * Interfaces for QR check-in and attendance queries.
 */

// ─── Enum Union Types ────────────────────────────────────────────────────────

export type AttendanceStatus = "confirmado";
// Fase 204: 'wellhub' (validada contra Wellhub) y 'wellhub_manual' (marcada a
// mano por el staff) se suman a las dos fuentes propias.
export type AttendanceSource = "qr" | "manual" | "wellhub" | "wellhub_manual";

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
