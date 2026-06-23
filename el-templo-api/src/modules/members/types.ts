/**
 * Members Module Types
 *
 * Interfaces for member CRUD operations, profile management,
 * and internal notes system.
 */

import type { MemberSegment } from "../segmentation/types";

export type DocumentType = "DNI" | "Pasaporte" | "NIE" | "NIF" | "Otro";

export type UserStatus = "freemium" | "prueba" | "activo" | "inactivo";

export interface MemberListParams {
  search?: string;
  branchId?: number;
  multiBranch?: boolean;
  level?: string;
  planId?: number;
  /**
   * Phase 136 (D-01): Attendance label filter. Validated against the 4-band
   * enum (optima/regular/alerta/ausente) by listMembersSchema before reaching
   * the service; typed as string here because the Fastify querystring is a
   * raw string narrowed at the schema boundary.
   */
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
   * Gate for the `totalDebtByCurrency` aggregate (financial data): only
   * owner/admin may see it. When false the service skips the debt query
   * entirely and returns an empty aggregate, so non-privileged roles
   * (gestion, coach, recepcion) never receive the figure — defense in depth
   * behind the AlumnosPage banner gate. Plumbed from request.user.role.
   */
  includeTotalDebt?: boolean;
  /**
   * Phase 103 (R8): first-class users.status filter (replaces the Phase
   * 102 derived "leads/alumnos" model). 'todos' is a no-op default.
   * Reads users.status directly — see Plan 02 for the recompute helper
   * that keeps the column in sync with sub create/cancel transitions.
   */
  status?: "todos" | UserStatus;
  page: number;
  limit: number;
}

/**
 * Lightweight typeahead search params. Unlike MemberListParams this carries no
 * filters, pagination, or status — it backs the member autocomplete in the
 * scheduling dialogs, which only need id/name/dni to render an option label.
 */
export interface MemberSearchParams {
  search: string;
  /** Country scope, plumbed from request.scope.country (mirrors listMembers). */
  country?: "AR" | "ES";
  limit: number;
}

/**
 * Single typeahead result row. Carries the two enrichment fields the
 * scheduling autocompletes actually render (plan name + effective status for
 * the "Activa/Inactiva/Sin plan" badge) — but NOT the full listMembers
 * payload (debt aggregate, segment, avatar, trial flag, COUNT).
 */
export interface MemberSearchItem {
  id: number;
  firstName: string | null;
  lastName: string | null;
  dni: string | null;
  planName: string | null;
  status: UserStatus | null;
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
  /**
   * Phase 103 (R10): first-class users.status (replaces the derived isActive
   * boolean). Nullable because staff rows have NULL — though staff don't
   * appear in member list endpoints, the column shape mirrors the DB.
   */
  status: UserStatus | null;
  planName: string | null;
  /**
   * Phase 136 (D-01): Attendance label (optima/regular/alerta/ausente) read
   * from member_profiles.member_segment. NULL for members <1 month old or
   * without an active plan (D-07/D-08) — the front degrades gracefully.
   */
  segment: MemberSegment | null;
  avatarType: string | null;
  /**
   * Active/paused subscription end date (YYYY-MM-DD) for the Vencimiento
   * countdown pill. Null when the member has no active/paused subscription.
   */
  endDate: string | null;
  createdAt: string;
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
  /** Phase 103 (R10): see MemberListItem.status. */
  status: UserStatus | null;
  createdAt: string;
  updatedAt: string;
  /**
   * Phase 102 (R7): true iff the user has at least one is_trial=TRUE booking
   * in their history. Drives the "Clases de prueba: N/1" counter on the
   * admin profile header.
   */
  hasUsedTrial: boolean;
  /**
   * Phase 114 (D-38): lead-lifecycle fields surfaced on the admin profile
   * endpoint so AlumnoDetailPage's "Datos de Lead" block renders without a
   * second round-trip. Only meaningful when `status === 'prueba'`; for
   * other statuses the fields may be populated from historic data but the
   * UI gate at the page level hides the block.
   *
   * `createdBy` is a denormalized JOIN against users (self-ref): the admin
   * who registered the trial via POST /api/admin/members/trial (Plan 02).
   * NULL for users created before Plan 01 / via legacy paths (D-39 — UI
   * renders "—").
   */
  leadStatus: "en_seguimiento" | "cerrado" | "perdido" | null;
  leadNotes: string | null;
  createdBy: { userId: number; name: string } | null;
  /**
   * Latest trial booking for the alumno, surfaced so AlumnoDetailPage's
   * "Sesión de Prueba" block can render fecha/hora/sucursal/asistencia
   * without a second round-trip. Cancelled trials are excluded. NULL when
   * the alumno never booked a trial (e.g. members enrolled via legacy
   * paths). Attended derivation mirrors the trial-sessions report:
   *   'si'  → attendance row exists for (memberId, scheduleId, bookingDate)
   *   'no'  → booking_date < today AND no attendance
   *   null  → future/today, pending
   */
  latestTrial: {
    bookingId: number;
    bookingDate: string;
    startTime: string;
    branchName: string;
    attended: "si" | "no" | null;
  } | null;
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

/**
 * Soft-register payload for "sesión de prueba" (SP) lead capture.
 * Receptionist creates the lead at the door with just these 4 fields;
 * email/DNI/etc. are filled in later when the lead converts to a paying
 * member via the standard MemberFormDialog edit flow.
 */
export interface CreateTrialMemberInput {
  firstName: string;
  lastName: string;
  phone: string;
  branchId: number;
}

/**
 * Phase 114 (D-31): service-layer payload for createTrialMember.
 * createdBy is derived server-side from request.user.userId in the route
 * handler — it MUST NOT be exposed on the public request schema
 * (createTrialMemberSchema has additionalProperties:false).
 */
export interface CreateTrialMemberServiceInput extends CreateTrialMemberInput {
  createdBy: number;
}

/**
 * POST /api/admin/members/:userId/convert-to-trial body.
 *
 * Converts a self-registered freemium member into a "sesión de prueba" lead
 * (status='prueba'). branchId MUST point to a physical (non-virtual) sede —
 * that's where the future trial session will be booked. createdBy is derived
 * server-side from the JWT, mirroring createTrialMember (D-31).
 */
export interface ConvertFreemiumToTrialInput {
  branchId: number;
}

export interface ConvertFreemiumToTrialServiceInput extends ConvertFreemiumToTrialInput {
  createdBy: number;
}

/**
 * Phase 114 (D-27): PATCH /api/admin/leads/:userId body.
 *
 * Both fields optional — caller may patch just status or just notes. The
 * empty-string-to-null normalization for leadNotes happens server-side in
 * MemberService.updateLead (D-28).
 */
export interface UpdateLeadInput {
  leadStatus?: "en_seguimiento" | "cerrado" | "perdido";
  leadNotes?: string | null;
}

/**
 * Phase 114 (D-27): response body of PATCH /api/admin/leads/:userId.
 * Mirrors the user row's lead-lifecycle fields plus a denormalized
 * `createdBy` JOIN so the admin UI can render "Gestiona: <name>" without a
 * second round-trip. `status` is included so the client can defensively
 * assert the row is still a lead (status='prueba') after the update.
 */
export interface LeadSnapshot {
  userId: number;
  leadStatus: "en_seguimiento" | "cerrado" | "perdido" | null;
  leadNotes: string | null;
  createdBy: { userId: number; name: string } | null;
  status: UserStatus | null;
}

export interface UpdateMemberInput {
  email?: string;
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

// ─── Phase 105: Outstanding-balance aggregates ────────────────────────

/**
 * Aggregated outstanding balance per currency, sourced from the
 * `balances` cache (Phase 105 D-10). Used by listMembers' banner under
 * the "Solo deudores" filter on AlumnosPage. Semantics: amount > 0 means
 * members owe; saldo-a-favor (amount < 0) and saldado (amount = 0) rows
 * are excluded from the aggregate.
 *
 * Shape preserved from the Phase 101 `debts`-backed version so the
 * AlumnosPage banner contract stays stable across the drop. The `debt`
 * per-row enrichment that used to live alongside this row is gone — the
 * aggregate is the only debt info on the listing endpoint now.
 */
export interface TotalDebtRow {
  currency: string;
  amount: number;
}
