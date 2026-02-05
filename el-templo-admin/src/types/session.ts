export type SessionStatus = 'pending_review' | 'approved' | 'discarded';
export type LevelGroup = 'alfa_delta' | 'sigma' | 'omega';

export interface SessionSummary {
  id: number;
  dayId: string;
  week: number;
  day: string;
  levelGroup: LevelGroup;
  memberLevel: string | null;
  status: SessionStatus;
  blockCount: number;
  approvedAt: string | null;
  approvedBy: number | null;
  approvedByName: string | null;
  approvedBySystem: boolean;
  discardedAt: string | null;
  discardedReason: string | null;
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
  format: string;
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
}

export interface SessionDetail extends SessionSummary {
  blocks: SessionBlock[];
}
