/**
 * Member types for the admin app.
 * Matches the API response shapes from the members module (Plan 47-01).
 */

export type DocumentType = 'DNI' | 'Pasaporte' | 'NIE' | 'NIF' | 'Otro';

// ─── Etiqueta de Asistencia (Phase 136, D-01) ───────────────────────────────
// Reemplaza al segmento conductual de Phase 79 por 4 bandas basadas 100% en el
// % de uso de la membresía sobre una ventana móvil de 28 días (≥75 / 50-74 /
// 1-49 / 0). Los cortes son fijos en código (D-03); no hay thresholds
// configurables. Un miembro con < 1 mes de antigüedad o sin plan activo queda
// con segment NULL (sin etiqueta).

export type MemberSegment = 'optima' | 'regular' | 'alerta' | 'ausente';

export const SEGMENT_LABELS: Record<MemberSegment, string> = {
  optima: 'Óptima',
  regular: 'Regular',
  alerta: 'Alerta',
  ausente: 'Ausente',
};

export const SEGMENT_COLORS: Record<MemberSegment, string> = {
  optima: 'green',
  regular: 'amber',
  alerta: 'orange',
  ausente: 'red',
};

// Short, plain-language meaning of each attendance band, mirroring the % cutoffs
// in the API segmentation service. Shown as a legend so reception/gestion know
// what each chip means.
export const SEGMENT_DESCRIPTIONS: Record<MemberSegment, string> = {
  optima: 'Usa ≥75% de su cupo de clases.',
  regular: 'Usa 50-74% de su cupo.',
  alerta: 'Usa menos de la mitad de su cupo — requiere observación.',
  ausente: 'Sin asistencia en la ventana — detona seguimiento.',
};

// Phase 103 (R10): user lifecycle status. NULL only for staff rows
// (members always have a value). UI labels mirror the enum 1:1
// (Freemium, En Prueba, Activo, Inactivo) per CONTEXT D-09.
export type UserStatus = 'freemium' | 'prueba' | 'activo' | 'inactivo';

export interface MemberListItem {
  id: number;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  dni: string | null;
  level: string;
  branchId: number;
  branchName: string;
  // Phase 103 (R10): first-class status (replaces the derived isActive
  // boolean). Plan 02's recomputeUserStatus keeps this in sync with
  // subscription create/cancel transitions.
  status: UserStatus | null;
  documentType: string | null;
  photoUrl: string | null;
  planName: string | null;
  segment: MemberSegment | null;
  avatarType: string | null;
  createdAt: string;
  hasUsedTrial: boolean;
}

export const AVATAR_LABELS: Record<string, string> = {
  A: 'A - Nunca entreno',
  B: 'B - Solo gym',
  C: 'C - Dejo el gym',
  D: 'D - Yogui/pilatera',
  E: 'E - Cardio',
  F: 'F - Pesas veterano',
  G: 'G - Busca comunidad',
  H: 'H - Longevidad',
  I: 'I - Cuerpo-mente',
  J: 'J - Cuerpo firme',
  K: 'K - Mujer joven',
};

export interface OnboardingProfileSummary {
  goalType: string;
  goalLabel: string;
  experienceLevel: string;
  experienceLabel: string;
  trainingFocus: string;
  focusLabel: string;
  motivationStyle: string;
  motivationLabel: string;
  completedAt: string | null;
}

export interface MemberProfile extends MemberListItem {
  address: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  emergencyContactRelationship: string | null;
  role: string;
  segmentUpdatedAt: string | null;
  updatedAt: string;
  onboardingProfile: OnboardingProfileSummary | null;
  // Phase 114 (D-38, D-39): lead-lifecycle fields. Only meaningful when
  // `status === 'prueba'`; AlumnoDetailPage's "Datos de Lead" block gates
  // on that. `createdBy` is denormalized via a self-JOIN server-side so
  // the UI can render "Gestiona: <name>" without a second round-trip; NULL
  // for users created before Plan 01 / via legacy paths (renders "—").
  leadStatus: 'en_seguimiento' | 'cerrado' | 'perdido' | null;
  leadNotes: string | null;
  createdBy: { userId: number; name: string } | null;
  /**
   * Latest non-cancelled trial booking for this alumno. Surfaced on the
   * profile so the "Sesión de Prueba" card can render fecha/hora/sucursal/
   * asistencia without a second round-trip. NULL when the alumno has no
   * trial bookings on record. Mirrors the attended derivation used by the
   * trial-sessions report:
   *   'si'  → attendance row exists for the booking
   *   'no'  → booking_date in the past, no attendance row
   *   null  → booking_date is today/future, pending
   */
  latestTrial: {
    bookingId: number;
    bookingDate: string;
    startTime: string;
    branchName: string;
    attended: 'si' | 'no' | null;
  } | null;
}

export interface CreateMemberInput {
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  dni: string;
  branchId: number;
  level?: string;
  documentType?: string | null;
  address?: string | null;
  dateOfBirth?: string | null;
  gender?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  emergencyContactRelationship?: string | null;
}

/**
 * Soft-register payload for "sesión de prueba" (SP) lead capture.
 * Only the 4 fields the receptionist captures at the door.
 */
export interface CreateTrialMemberInput {
  firstName: string;
  lastName: string;
  phone: string;
  branchId: number;
}

export interface UpdateMemberInput {
  email?: string;
  firstName?: string;
  lastName?: string;
  phone?: string | null;
  dni?: string | null;
  branchId?: number;
  level?: string;
  documentType?: string | null;
  address?: string | null;
  dateOfBirth?: string | null;
  gender?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  emergencyContactRelationship?: string | null;
}

export interface MemberListParams {
  search?: string;
  branchId?: number;
  multiBranch?: boolean;
  planId?: number;
  level?: string;
  overdue?: boolean;
  segment?: MemberSegment;
  avatarType?: string;
  debtorOnly?: boolean;
  country?: 'AR' | 'ES';
  // Phase 103 (R8): first-class users.status filter (replaces Phase 102's
  // 'leads'/'alumnos' derived values). 'todos' is a no-op default.
  status?: 'todos' | UserStatus;
  page?: number;
  limit?: number;
}

// ─── Outstanding Balances (Phase 105 Plan 05) ───────────────────────────
// Per-row debt detail and Phase 101 Debt* types were dropped when the
// finance model migrated to financial_transactions + balances. The list
// banner still shows aggregate outstanding balance grouped by currency,
// sourced server-side from balances.amount > 0.

export interface TotalDebtRow {
  currency: string;
  amount: number;
}

export interface MembersListResponse {
  members: MemberListItem[];
  total: number;
  totalDebtByCurrency: TotalDebtRow[];
}

export interface DniCheckResult {
  available: boolean;
  existingMemberName?: string;
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
  content: string;
}

export interface UpdateNoteInput {
  content: string;
}

export interface BranchOption {
  id: number;
  name: string;
  isVirtual?: boolean;
}
