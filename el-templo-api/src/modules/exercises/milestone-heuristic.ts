/**
 * milestone-heuristic.ts — R1-HEUR (phase 133): deterministic milestone
 * proposal engine over the exercise catalog (movimiento × escalón).
 *
 * SKELETON (TDD RED) — implementation lands in the GREEN step.
 */

/** A catalog row the engine consumes (loaded by the bootstrap CLI, never here). */
export interface CatalogRow {
  id: number;
  name: string;
  route: string;
  effort: string;
  dificultadLineal: number;
  /**
   * `proposed_step` from `exercise_dimension_proposals` ONLY when the proposal
   * status is 'accepted' (profe-corrected step); otherwise null.
   */
  acceptedStep: number | null;
}

/** One milestone proposal emitted per catalog row. */
export interface MilestoneProposal {
  exerciseId: number;
  /** NULL = proposed as MILESTONE (backbone); NOT NULL = variant of that id. */
  proposedMilestoneExerciseId: number | null;
  movementToken: string | null;
  stepRank: number | null;
  confidence: number;
}

/** Declarative movement-family vocabulary per route, most-specific-first. */
export const MOVEMENT_VOCAB: Readonly<Record<string, readonly string[]>> = {};

/** Pure grouping engine — proposes one milestone per (movement × step) group. */
export function proposeMilestones(rows: CatalogRow[]): MilestoneProposal[] {
  void rows;
  return [];
}
