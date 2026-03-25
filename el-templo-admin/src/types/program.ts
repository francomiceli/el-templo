/**
 * Program types for the admin app.
 * Matches the API response shapes from the programs module (Plan 83-02).
 */

// ─── Enum Union Types ────────────────────────────────────────────────────────

export type ContentBlockType = 'video' | 'text' | 'pdf' | 'exercise';
export type EnrollmentStatus = 'active' | 'completed' | 'expired' | 'cancelled';

// ─── Label & Color Maps ─────────────────────────────────────────────────────

export const ENROLLMENT_STATUS_LABELS: Record<EnrollmentStatus, string> = {
  active: 'Activo',
  completed: 'Completado',
  expired: 'Expirado',
  cancelled: 'Cancelado',
};

export const ENROLLMENT_STATUS_COLORS: Record<EnrollmentStatus, string> = {
  active: 'positive',
  completed: 'info',
  expired: 'grey',
  cancelled: 'negative',
};

export const BLOCK_TYPE_LABELS: Record<ContentBlockType, string> = {
  video: 'Video',
  text: 'Texto',
  pdf: 'PDF',
  exercise: 'Ejercicio',
};

export const BLOCK_TYPE_COLORS: Record<ContentBlockType, string> = {
  video: 'deep-purple',
  text: 'blue',
  pdf: 'orange',
  exercise: 'teal',
};

// ─── Content Block Types ─────────────────────────────────────────────────────

export interface ContentBlockInput {
  weekNumber: number;
  sortOrder: number;
  blockType: ContentBlockType;
  title: string;
  content: string | null;
  videoUrl: string | null;
  exerciseId: number | null;
}

export interface ContentBlockDetail extends ContentBlockInput {
  id: number;
  exerciseName: string | null;
  exerciseVideoUrl: string | null;
}

// ─── Program Types ───────────────────────────────────────────────────────────

export interface MicroProgram {
  id: number;
  name: string;
  description: string | null;
  price: number;
  durationWeeks: number;
  sessionsPerWeekToAdvance: number;
  auraWeeklyBonus: number;
  auraCompletionBonus: number;
  isActive: boolean;
  createdAt: string;
}

export interface MicroProgramDetail extends MicroProgram {
  contentBlocks: ContentBlockDetail[];
  activeEnrollmentCount: number;
}

export interface CreateProgramPayload {
  name: string;
  description: string | null;
  price: number;
  durationWeeks: number;
  sessionsPerWeekToAdvance: number;
  auraWeeklyBonus: number;
  auraCompletionBonus: number;
  contentBlocks: ContentBlockInput[];
}

// ─── Enrollment Types ────────────────────────────────────────────────────────

export interface ProgramEnrollment {
  id: number;
  userId: number;
  programId: number;
  programName: string;
  status: EnrollmentStatus;
  currentWeek: number;
  sessionsCompletedThisWeek: number;
  durationWeeks: number;
  sessionsPerWeekToAdvance: number;
  enrolledAt: string;
  completedAt: string | null;
  expiredAt: string | null;
  cancelledAt: string | null;
  paymentAmount: number | null;
  paymentMethod: string | null;
}

// ─── Analytics Types ─────────────────────────────────────────────────────────

export interface ProgramAnalytics {
  totalEnrollments: number;
  activeEnrollments: number;
  completedCount: number;
}
