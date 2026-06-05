/**
 * Session Generation Domain Types
 *
 * All types use readonly modifiers to enforce immutability
 * throughout the deterministic pipeline.
 */

import type { FormatParams } from "../admin/format-params";

// Re-export FormatParams for convenience
export type { FormatParams };

/** Level group - aggregation of individual levels for session generation */
export type LevelGroup = "alfa_delta" | "sigma" | "omega";

/** Individual exercise level - member's actual training level */
// Phase 129 (KAIROS-01): kairos added first. No new LevelGroup — kairos reuses
// alfa_delta (D-02); its real constraint lives in the generation layer (Plan 02).
export type ExerciseLevel =
  | "kairos"
  | "alfa"
  | "delta"
  | "sigma"
  | "omega"
  | "spartan";

/**
 * Exercise *content* level — the values the exercises.exercise_level column
 * holds. Excludes "kairos" (Phase 129, D-03): kairos is a member level with no
 * own exercise content; its generation resolves to Alfa content upstream before
 * any exercises.level query. Use ContentLevel anywhere a value flows into an
 * exercises.level query or a map keyed by exercise content rather than member
 * level.
 */
export type ContentLevel = Exclude<ExerciseLevel, "kairos">;

/** Block roles in a training session (5 blocks for regular, 3 for ROM) */
export type BlockRole =
  | "INITIUM"
  | "NUCLEUS"
  | "DEUTEROS_1"
  | "DEUTEROS_2"
  | "ATHLOS"
  | "EPIKOS"
  | "ROM_LOWER"
  | "ROM_CORE"
  | "ROM_UPPER";

/** Final block type - alternates by week */
export type FinalBlockRole = "ATHLOS" | "EPIKOS";

/**
 * Determine the final block type based on week parity
 * Odd weeks = ATHLOS, Even weeks = EPIKOS
 */
export function getFinalBlockRole(week: number): FinalBlockRole {
  return week % 2 === 1 ? "ATHLOS" : "EPIKOS";
}

/** Contraction types for exercise classification */
export type Contraction = "CON" | "EXC" | "ISO";

/** Trace event severity levels */
export type TraceSeverity = "INFO" | "WARNING" | "ERROR";

/** Location context for trace events */
export interface TraceWhere {
  readonly week: number;
  readonly day: string;
  readonly levelGroup: LevelGroup;
  readonly memberLevel?: ExerciseLevel;
  readonly blockId: string;
  readonly role?: BlockRole;
}

/** Structured trace event for pipeline auditability */
export interface TraceEvent {
  readonly ts: string;
  readonly severity: TraceSeverity;
  readonly code: string;
  readonly where: TraceWhere;
  readonly decision?: Readonly<Record<string, unknown>>;
  readonly reason?: Readonly<{
    ruleId?: string;
    tieBreakers?: readonly string[];
  }>;
}

/** Contraction distribution for a block */
export interface ContractionMix {
  readonly CON: number;
  readonly EXC: number;
  readonly ISO: number;
}

/** Format instance selected for a block */
export interface FormatInstance {
  readonly formatId: number;
  readonly name: string;
}

/** Selected exercise before prescription */
export interface SelectedExercise {
  readonly exerciseId: number;
  readonly name: string;
  readonly contraction: Contraction;
  readonly difficulty: number;
  readonly crossRoute?: boolean;
  /** Whether this is a unilateral exercise (OA/OL) — reps should be even */
  readonly isUnilateral?: boolean;
}

/** Exercise prescription with dose, rest, and notes */
export interface ExercisePrescription {
  readonly exerciseId: number;
  readonly name: string;
  readonly contraction: Contraction;
  readonly reps: number;
  readonly repsMax?: number;
  readonly seconds: number;
  readonly secondsMax?: number;
  readonly increment?: number;
  readonly rest: number;
  readonly notes?: string;
  /** Linear difficulty scale (1-12) for validation */
  readonly dificultadLineal?: number;
  /** Discriminator: 'main' (default) or 'mobility' */
  readonly exerciseType?: "main" | "mobility";
  /** Video demonstration URL from exercises table (resolved at read time) */
  readonly videoUrl?: string;
}

/** Complete block plan output */
export interface BlockPlan {
  readonly blockId: string;
  readonly role: BlockRole;
  readonly route: string;
  readonly pattern: string;
  readonly intensity: number;
  readonly repsBudget: number;
  readonly format: FormatInstance;
  readonly formatParams: FormatParams;
  readonly exercises: readonly ExercisePrescription[];
  readonly trace: readonly TraceEvent[];
  /** Post-pipeline mobility exercise for non-INITIUM blocks */
  mobilityExercise?: ExercisePrescription;
}

/** Complete day session output */
export interface DaySession {
  readonly dayId: string;
  readonly week: number;
  readonly day: string;
  readonly levelGroup: LevelGroup;
  readonly memberLevel: ExerciseLevel;
  readonly blocks: readonly BlockPlan[];
  readonly trace: readonly TraceEvent[];
  /** Goal plan type for goal plan sessions. Null/undefined for general Entrenamiento. */
  readonly goalPlanType?: string | null;
  /** Session mode: 'regular' (default SPOM) or 'rom' (mobility-focused) */
  readonly sessionMode?: "regular" | "rom";
}
