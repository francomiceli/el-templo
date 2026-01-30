/**
 * Session Generation Domain Types
 *
 * All types use readonly modifiers to enforce immutability
 * throughout the deterministic pipeline.
 */

/** Level group - aggregation of individual levels for session generation */
export type LevelGroup = 'alfa_delta' | 'sigma' | 'omega';

/** Individual exercise level - member's actual training level */
export type ExerciseLevel = 'alfa' | 'delta' | 'sigma' | 'omega' | 'spartan';

/** Block roles in a training session (5 blocks total) */
export type BlockRole = 'INITIUM' | 'NUCLEUS' | 'DEUTEROS_1' | 'DEUTEROS_2' | 'ATHLOS' | 'EPIKOS';

/** Final block type - alternates by week */
export type FinalBlockRole = 'ATHLOS' | 'EPIKOS';

/**
 * Determine the final block type based on week parity
 * Odd weeks = ATHLOS, Even weeks = EPIKOS
 */
export function getFinalBlockRole(week: number): FinalBlockRole {
  return week % 2 === 1 ? 'ATHLOS' : 'EPIKOS';
}

/** Contraction types for exercise classification */
export type Contraction = 'CON' | 'EXC' | 'ISO';

/** Trace event severity levels */
export type TraceSeverity = 'INFO' | 'WARNING' | 'ERROR';

/** Location context for trace events */
export interface TraceWhere {
  readonly week: number;
  readonly day: string;
  readonly levelGroup: LevelGroup;
  readonly memberLevel?: ExerciseLevel;
  readonly blockId: string;
  readonly role: BlockRole;
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
}

/** Exercise prescription with dose, rest, and notes */
export interface ExercisePrescription {
  readonly exerciseId: number;
  readonly name: string;
  readonly contraction: Contraction;
  readonly reps: number;
  readonly seconds: number;
  readonly rest: number;
  readonly notes?: string;
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
  readonly exercises: readonly ExercisePrescription[];
  readonly trace: readonly TraceEvent[];
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
}
