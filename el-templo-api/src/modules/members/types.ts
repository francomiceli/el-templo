/**
 * Members Module Types
 *
 * Interfaces for member CRUD operations, profile management,
 * and internal notes system.
 */

export type DocumentType = "DNI" | "Pasaporte" | "NIE" | "NIF" | "Otro";

export interface MemberListParams {
  search?: string;
  branchId?: number;
  multiBranch?: boolean;
  level?: string;
  isActive?: boolean;
  planId?: number;
  segment?: string;
  avatarType?: string;
  /**
   * Country scope. Plumbed from request.scope.country in route handlers.
   * When present, filters results to members whose branch has this country.
   */
  country?: "AR" | "ES";
  /**
   * Phase 101: when true, restricts the list to users with at least one
   * active (non-cancelled) debt row. Also scopes `totalDebtByCurrency` to
   * the resulting filter set.
   */
  debtorOnly?: boolean;
  /**
   * Phase 102 (R8): server-side leads filter.
   *   "todos"   (default) — no additional filter applied
   *   "leads"             — has is_trial=TRUE booking AND no active/paused sub
   *   "alumnos"           — inverse of leads (everyone not matching the leads definition)
   */
  status?: "todos" | "alumnos" | "leads";
  page: number;
  limit: number;
}

export interface MemberListItem {
  id: number;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  dni: string | null;
  documentType: string | null;
  photoUrl: string | null;
  level: string;
  branchId: number;
  branchName: string;
  isActive: boolean;
  planName: string | null;
  segment: string | null;
  avatarType: string | null;
  createdAt: string;
  /** Phase 101: populated when the user has an active (non-cancelled) debt. */
  debt: ActiveDebt | null;
  /**
   * Phase 102 (R7): true iff the user has at least one is_trial=TRUE booking
   * in their history. Derived via EXISTS subquery — no per-row N+1.
   */
  hasUsedTrial: boolean;
}

export interface MemberProfile {
  id: number;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  dni: string | null;
  documentType: string | null;
  photoUrl: string | null;
  address: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  emergencyContactRelationship: string | null;
  role: string;
  level: string;
  branchId: number;
  branchName: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  /**
   * Phase 102 (R7): true iff the user has at least one is_trial=TRUE booking
   * in their history. Drives the "Clases de prueba: N/1" counter on the
   * admin profile header.
   */
  hasUsedTrial: boolean;
}

export interface CreateMemberInput {
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  dni: string;
  branchId: number;
  planId?: number;
  level?: string;
  documentType?: string;
  address?: string;
  dateOfBirth?: string;
  gender?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactRelationship?: string;
}

export interface UpdateMemberInput {
  firstName?: string;
  lastName?: string;
  phone?: string;
  dni?: string;
  documentType?: string | null;
  photoUrl?: string | null;
  address?: string | null;
  dateOfBirth?: string | null;
  gender?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  emergencyContactRelationship?: string | null;
  branchId?: number;
  level?: string;
}

export interface MemberNote {
  id: number;
  userId: number;
  authorId: number;
  authorName: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateNoteInput {
  userId: number;
  content: string;
}

export interface UpdateNoteInput {
  content: string;
}

export interface DniCheckResult {
  available: boolean;
  existingMemberName?: string;
}

export interface MemberExportRow {
  nombre: string;
  email: string | null;
  dni: string;
  telefono: string;
  sucursal: string;
  nivel: string;
  plan: string;
  estado: string;
  vencimientoSuscripcion: string;
  fechaNacimiento: string;
  direccion: string;
}

// ─── Phase 101: Debt Tracking ──────────────────────────────────────────

/** Currencies supported for debts in v1 (D-13). */
export const DEBT_CURRENCIES = ["ARS", "EUR", "USD"] as const;
export type DebtCurrency = (typeof DEBT_CURRENCIES)[number];

/** Shape of an active debt row as exposed to API consumers. */
export interface ActiveDebt {
  amount: number;
  currency: string;
  note: string | null;
}

/** Input accepted by DebtService.upsertActiveDebt. */
export interface DebtUpsertInput {
  amount: number;
  currency: DebtCurrency;
  note?: string | null;
}

/** Row returned by DebtService.getTotalDebtByCurrency. */
export interface TotalDebtRow {
  currency: string;
  amount: number;
}
