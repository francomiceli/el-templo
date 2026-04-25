/**
 * Member types for the admin app.
 * Matches the API response shapes from the members module (Plan 47-01).
 */

export type DocumentType = 'DNI' | 'Pasaporte' | 'NIE' | 'NIF' | 'Otro';

// ─── Behavioral Segmentation (Phase 79) ─────────────────────────────────────

export type MemberSegment =
  | 'nuevo'
  | 'espartano'
  | 'intermitente'
  | 'en_riesgo'
  | 'digital_warrior'
  | 'ghost';

export const SEGMENT_LABELS: Record<MemberSegment, string> = {
  nuevo: 'Nuevo',
  espartano: 'Espartano',
  intermitente: 'Intermitente',
  en_riesgo: 'En Riesgo',
  digital_warrior: 'Digital Warrior',
  ghost: 'Ghost',
};

export const SEGMENT_COLORS: Record<MemberSegment, string> = {
  nuevo: 'blue',
  espartano: 'green',
  intermitente: 'amber',
  en_riesgo: 'orange',
  digital_warrior: 'purple',
  ghost: 'grey',
};

export interface SegmentThresholds {
  espartanoPct: number;
  intermitentePct: number;
  enRiesgoWeeks: number;
  ghostWeeks: number;
  nuevoDays: number;
  windowDays: number;
}

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
  debt: ActiveDebt | null;
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

export interface UpdateMemberInput {
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
  debt?: DebtUpsertInput | null;
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

// ─── Debt Tracking (Phase 101) ──────────────────────────────────────────

export const DEBT_CURRENCIES = ['ARS', 'EUR', 'USD'] as const;
export type DebtCurrency = (typeof DEBT_CURRENCIES)[number];

export const DEBT_CURRENCY_OPTIONS: Array<{ label: string; value: DebtCurrency }> = [
  { label: 'ARS', value: 'ARS' },
  { label: 'USD', value: 'USD' },
  { label: 'EUR', value: 'EUR' },
];

export interface ActiveDebt {
  amount: number;
  currency: string;
  note: string | null;
}

export interface TotalDebtRow {
  currency: string;
  amount: number;
}

export interface DebtUpsertInput {
  amount: number;
  currency: DebtCurrency;
  note?: string | null;
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
}
