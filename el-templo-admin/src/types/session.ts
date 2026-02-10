export type SessionStatus = 'pending_review' | 'approved';
export type LevelGroup = 'alfa_delta' | 'sigma' | 'omega';

export interface SessionSummary {
  id: number;
  dayId: string;
  week: number;
  day: string;
  levelGroup: LevelGroup;
  memberLevel: string;
  routesSummary: string;
  status: SessionStatus;
  blockCount: number;
  approvedAt: string | null;
  approvedBy: number | null;
  approvedByName: string | null;
  approvedBySystem: boolean;
  createdAt: string;
}

export interface SessionFilter {
  week?: number;
  day?: string;
  levelGroup?: LevelGroup;
  status?: SessionStatus;
  page?: number;
  limit?: number;
  sortBy?: string;
  descending?: boolean;
}

export interface SessionsResponse {
  sessions: SessionSummary[];
  total: number;
  page: number;
  limit: number;
}

export interface SessionBlock {
  id: number;
  blockId: string;
  role: string;
  route: string;
  pattern: string;
  formatId: number;
  formatName: string;
  intensity: number;
  repsBudget: number;
  sortOrder: number;
  exercises: SessionExercise[];
}

export interface SessionExercise {
  id: number;
  exerciseId: number;
  exerciseName: string;
  contraction: string;
  reps: number | null;
  seconds: number | null;
  rest: number | null;
  notes: string | null;
  dificultadLineal: number | null;
  sortOrder: number;
  route: string | null;
}

export interface SessionDetail extends SessionSummary {
  blocks: SessionBlock[];
}

export interface PoolBlockExercise {
  id: number;
  exerciseId: number;
  exerciseName: string;
  contraction: string;
  reps: number;
  seconds: number;
  rest: number;
  notes: string | null;
  dificultadLineal: number | null;
  sortOrder: number;
}

export interface PoolBlock {
  id: number;
  blockId: string;
  role: string;
  route: string;
  pattern: string;
  intensity: number;
  repsBudget: number;
  formatId: number;
  formatName: string;
  exerciseCount: number;
  sourceWeek: number;
  sourceDay: string;
  sourceRole: string;
  exercises: PoolBlockExercise[];
}

export interface PoolBlocksResponse {
  blocks: PoolBlock[];
}

// --- Editing types (Phase 15) ---

// Exercise pool for swap dialog
export interface PoolExercise {
  id: number;
  exercise: string; // exercise name
  effort: string; // CON, EXC, ISO
  dificultadLineal: number;
  pattern: string;
  category: string;
  route: string;
}

export interface ExercisePoolResponse {
  exercises: PoolExercise[];
}

// Compatible formats for format change dropdown
export interface CompatibleFormat {
  formatId: number;
  formatName: string;
  compatibility: number; // score: 1=best, 3=least preferred, 0=incompatible
}

export interface CompatibleFormatsResponse {
  formats: CompatibleFormat[];
}

// Prescription update payload
export interface PrescriptionUpdate {
  reps?: number;
  seconds?: number;
  rest?: number;
  notes?: string;
}

// Session preview for member preview modal
export interface SessionPreview {
  id: number;
  dayId: string;
  week: number;
  day: string;
  memberLevel: string;
  levelGroup: string;
  blocks: SessionBlock[];
}

// Saved block for reuse (Phase 16-07)
export interface SavedBlock {
  id: number;
  name: string;
  blockRole: string;
  blockRoute: string;
  formatName: string;
  createdAt: string;
  exerciseCount: number;
  blockData: {
    role: string;
    route: string;
    formatName: string;
    exercises: Array<{
      exerciseName: string;
      reps: number;
      seconds: number;
      rest: number;
      effort: string;
      dificultadLineal: number | null;
    }>;
  };
}
