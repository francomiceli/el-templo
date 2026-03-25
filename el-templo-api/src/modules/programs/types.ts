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
  price: number;
  durationWeeks: number;
  sessionsPerWeekToAdvance: number;
  auraWeeklyBonus: number;
  auraCompletionBonus: number;
  contentBlocks: ContentBlockInput[];
}

export interface UpdateProgramInput {
  name?: string;
  description?: string | null;
  price?: number;
  // durationWeeks NOT editable when active enrollments exist (per D-41)
  auraWeeklyBonus?: number;
  auraCompletionBonus?: number;
}

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

// ---- Enrollment types ----
export type EnrollmentStatus = "active" | "completed" | "expired" | "cancelled";

export interface EnrollMemberInput {
  userId: number;
  programId: number;
  paymentAmount: number | null;
  paymentMethod: string | null;
  notes: string | null;
}

export interface ProgramEnrollment {
  id: number;
  userId: number;
  programId: number;
  programName: string;
  status: EnrollmentStatus;
  currentWeek: number;
  sessionsCompletedThisWeek: number;
  durationWeeks: number; // from joined program
  sessionsPerWeekToAdvance: number; // from joined program
  enrolledAt: string;
  completedAt: string | null;
  expiredAt: string | null;
  cancelledAt: string | null;
  paymentAmount: number | null;
  paymentMethod: string | null;
}

// ---- Member-facing types ----
export interface MemberProgramCatalogItem {
  id: number;
  name: string;
  description: string | null;
  price: number;
  durationWeeks: number;
  hasContent: boolean; // false = show "Proximamente" per D-46
}

export interface MemberEnrollmentProgress {
  enrollmentId: number;
  programId: number; // needed by PlanesPage to check enrollment per D-47
  programName: string;
  currentWeek: number;
  durationWeeks: number;
  sessionsCompletedThisWeek: number;
  sessionsPerWeekToAdvance: number;
  isWeekComplete: boolean; // derived: sessionsCompleted >= sessionsRequired
  daysUntilExpiry: number | null; // for renewal badge per D-16
  contentBlocks: ContentBlockDetail[]; // current week's blocks only
}

// ---- Analytics types ----
export interface ProgramAnalytics {
  totalEnrollments: number;
  activeEnrollments: number;
  completedCount: number;
}
