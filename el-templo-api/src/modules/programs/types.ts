// Module: programs

// ---- Content block types ----
export type ContentBlockType = "video" | "text" | "pdf" | "exercise";

export interface ContentBlockInput {
  weekNumber: number;
  sortOrder: number;
  blockType: ContentBlockType;
  title: string;
  content: string | null; // markdown for text, URL for pdf
  videoUrl: string | null; // R2 URL for video
  exerciseId: number | null; // exercise table FK for exercise type
}

export interface ContentBlockDetail {
  id: number;
  weekNumber: number;
  sortOrder: number;
  blockType: ContentBlockType;
  title: string;
  content: string | null;
  videoUrl: string | null;
  exerciseId: number | null;
  exerciseName: string | null; // joined from exercises table
  exerciseVideoUrl: string | null; // R2 video from exercises table
}

// ---- Program types ----
export interface CreateProgramInput {
  name: string;
  description: string | null;
  durationWeeks: number | null;
  sessionsPerWeekToAdvance: number;
  goalPlanType?: string | null;
  auraWeeklyBonus: number;
  auraCompletionBonus: number;
  contentBlocks: ContentBlockInput[];
}

export interface UpdateProgramInput {
  name?: string;
  description?: string | null;
  goalPlanType?: string | null;
  // durationWeeks NOT editable when active enrollments exist (per D-41)
  auraWeeklyBonus?: number;
  auraCompletionBonus?: number;
}

export interface Program {
  id: number;
  name: string;
  description: string | null;
  durationWeeks: number | null;
  sessionsPerWeekToAdvance: number;
  auraWeeklyBonus: number;
  auraCompletionBonus: number;
  goalPlanType: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface ProgramDetail extends Program {
  contentBlocks: ContentBlockDetail[];
  activeEnrollmentCount: number;
}

// ---- Enrollment types ----
export type EnrollmentStatus = "active" | "completed" | "expired" | "cancelled";

export interface ProgramEnrollment {
  id: number;
  userId: number;
  programId: number;
  programName: string;
  status: EnrollmentStatus;
  currentWeek: number;
  sessionsCompletedThisWeek: number;
  durationWeeks: number | null; // from joined program
  sessionsPerWeekToAdvance: number; // from joined program
  enrolledAt: string;
  completedAt: string | null;
  expiredAt: string | null;
  cancelledAt: string | null;
}

// ---- Member-facing types ----
export interface MemberProgramCatalogItem {
  id: number;
  name: string;
  description: string | null;
  durationWeeks: number | null;
  hasContent: boolean; // false = show "Proximamente" per D-46
}

export interface MemberEnrollmentProgress {
  enrollmentId: number;
  programId: number; // needed by PlanesPage to check enrollment per D-47
  programName: string;
  goalPlanType: string | null; // null = regular sessions, non-null = goal plan sessions
  currentWeek: number;
  durationWeeks: number | null;
  sessionsCompletedThisWeek: number;
  sessionsPerWeekToAdvance: number;
  isWeekComplete: boolean; // derived: sessionsCompleted >= sessionsRequired
  daysUntilExpiry: number | null; // for renewal badge per D-16
  isLinkedToSubscription: boolean; // true = came free with presencial plan, false = separately acquired
  contentBlocks: ContentBlockDetail[]; // current week's blocks only
}

// ---- Analytics types ----
export interface ProgramAnalytics {
  totalEnrollments: number;
  activeEnrollments: number;
  completedCount: number;
}

// ---- Current Program (R6) ----
export interface CurrentProgramResponse {
  enrollmentId: number | null;
  program: {
    id: number;
    name: string;
    goalPlanType: string | null;
    durationWeeks: number | null;
    currentWeek: number;
  } | null;
}

export interface EnrollmentSummary {
  id: number;
  programId: number;
  programName: string;
  goalPlanType: string | null;
  currentWeek: number;
  durationWeeks: number | null;
}

export interface EnrollmentsListResponse {
  enrollments: EnrollmentSummary[];
}
