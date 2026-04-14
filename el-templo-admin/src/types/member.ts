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
  isActive: boolean;
  documentType: string | null;
  photoUrl: string | null;
  planName: string | null;
  segment: MemberSegment | null;
  avatarType: string | null;
  createdAt: string;
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
  planId: number;
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
}

export interface MemberListParams {
  search?: string;
  branchId?: number;
  multiBranch?: boolean;
  planId?: number;
  level?: string;
  isActive?: boolean;
  overdue?: boolean;
  segment?: MemberSegment;
  avatarType?: string;
  page?: number;
  limit?: number;
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
