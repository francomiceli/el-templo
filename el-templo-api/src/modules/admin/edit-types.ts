/**
 * Types for Admin Session Editing
 *
 * Shared across AdminEditService, ExerciseSwapService, and SessionMutationService.
 */

export interface ExercisePoolParams {
  /** Block DB id to get context from */
  blockId: number;
  /** Optional contraction type filter (CON/EXC/ISO) */
  contraction?: string;
  /** Route to filter exercises by */
  route: string;
  /** Block's pattern field (primary pattern) */
  pattern: string;
  /** Block's secondary pattern for cross-route (if applicable) */
  pattern2?: string | null;
  /** Block role (INITIUM has no cross-route) */
  blockRole: string;
  /** Exercise IDs already in the block (to exclude) */
  excludeExerciseIds: number[];
  /** Target difficulty to sort by proximity */
  targetDifficulty?: number;
  /** Maximum linear difficulty to include (based on member level) */
  maxDifficulty?: number;
}

export interface ExercisePoolItem {
  id: number;
  exercise: string;
  effort: string;
  dificultadLineal: number;
  pattern: string;
  category: string;
  route: string;
  /** Indicates if exercise comes from primary or cross-route pattern */
  patternSource: "pattern_1" | "pattern_2";
  /** Video demonstration URL from exercises table */
  videoUrl?: string | null;
}

export interface SwapExerciseParams {
  sessionId: number;
  blockId: number;
  oldPrescriptionId: number;
  newExerciseId: number;
  userId: number;
}

export interface UpdatePrescriptionParams {
  sessionId: number;
  blockId: number;
  prescriptionId: number;
  userId: number;
  fields: {
    reps?: number;
    repsMax?: number | null;
    seconds?: number;
    secondsMax?: number | null;
    increment?: number | null;
    rest?: number;
    notes?: string | null;
    contraction?: "CON" | "EXC" | "ISO";
  };
}

export interface ChangeBlockFormatParams {
  sessionId: number;
  blockId: number;
  newFormatId: number;
  newFormatName: string;
  userId: number;
}

export interface AddExerciseParams {
  sessionId: number;
  blockId: number;
  exerciseId: number;
  userId: number;
}

export interface RemoveExerciseParams {
  sessionId: number;
  blockId: number;
  prescriptionId: number;
  userId: number;
}

export interface UpdateFormatParamsParams {
  sessionId: number;
  blockId: number;
  formatParams: Record<string, unknown>;
  userId: number;
}

export interface ResetToAlgorithmParams {
  sessionId: number;
  userId: number;
}

export interface CompatibleFormatsParams {
  blockRole: string;
  level: string;
  intensity: number;
}

export interface CompatibleFormat {
  formatId: number;
  formatName: string;
  compatibility: number;
}

export interface SaveBlockParams {
  blockId: number;
  name: string;
  userId: number;
}

export interface SavedBlockExercise {
  exerciseId: number;
  exerciseName: string;
  contraction: string;
  reps: number;
  seconds: number;
  rest: number;
  notes: string | null;
  effort: string;
  dificultadLineal: number | null;
  sortOrder: number;
}

export interface SavedBlockData {
  role: string;
  route: string;
  formatName: string;
  formatParams: unknown;
  intensity: number;
  repsBudget: number;
  exercises: SavedBlockExercise[];
}

export interface SavedBlockItem {
  id: number;
  name: string;
  blockRole: string;
  blockRoute: string;
  formatName: string;
  createdAt: Date;
  exerciseCount: number;
  blockData: unknown;
}

export interface DeleteSavedBlockParams {
  savedBlockId: number;
  userId: number;
}

export interface ReorderExerciseParams {
  sessionId: number;
  blockId: number;
  prescriptionId: number;
  direction: "up" | "down";
  userId: number;
}
