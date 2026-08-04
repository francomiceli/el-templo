/**
 * Program types for the admin app.
 * Matches the API response shapes from the programs module (Plan 83-02).
 */

import type { PaymentMethod } from './transaction';

// ─── Enum Union Types ────────────────────────────────────────────────────────

export type ContentBlockType = 'video' | 'text' | 'pdf' | 'exercise';
// Phase 112 D-02: 'paused' added so admin UI can render paused enrollments.
export type EnrollmentStatus = 'active' | 'paused' | 'completed' | 'expired' | 'cancelled';

// Phase 112 D-01: provenance classification surfaced in the admin Programas tab.
export type EnrollmentSource = 'plan_linked' | 'plan_bundle' | 'admin_addon';

// ─── Label & Color Maps ─────────────────────────────────────────────────────

export const ENROLLMENT_STATUS_LABELS: Record<EnrollmentStatus, string> = {
  active: 'Activo',
  paused: 'Pausado',
  completed: 'Completado',
  expired: 'Expirado',
  cancelled: 'Cancelado',
};

export const ENROLLMENT_STATUS_COLORS: Record<EnrollmentStatus, string> = {
  active: 'positive',
  paused: 'warning',
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

export interface Program {
  id: number;
  name: string;
  description: string | null;
  durationWeeks: number | null;
  sessionsPerWeekToAdvance: number;
  auraWeeklyBonus: number;
  auraCompletionBonus: number;
  isActive: boolean;
  createdAt: string;
}

export interface ProgramDetail extends Program {
  contentBlocks: ContentBlockDetail[];
  activeEnrollmentCount: number;
}

export interface CreateProgramPayload {
  name: string;
  description: string | null;
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
  // Phase 112 D-24: provenance fields surfaced in the admin Programas tab.
  source: EnrollmentSource;
  pricePaid: number | null;
  assignedByName: string | null;
  enrolledAt: string;
  completedAt: string | null;
  expiredAt: string | null;
  cancelledAt: string | null;
}

// Phase 112 D-22: program option for the AssignProgramAddonDialog dropdown.
export interface ProgramOption {
  id: number;
  name: string;
  durationWeeks: number | null;
}

// Phase 112 D-22: payload accepted by POST /api/admin/users/:userId/program-addons.
export interface AssignAddonPayload {
  programId: number;
  pricePaid?: number | null;
  paymentMethod?: PaymentMethod;
  notes?: string | null;
}

// ─── Analytics Types ─────────────────────────────────────────────────────────

export interface ProgramAnalytics {
  totalEnrollments: number;
  activeEnrollments: number;
  completedCount: number;
}
