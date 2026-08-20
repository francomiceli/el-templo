/**
 * Deterministic Hash Util
 *
 * Phase 159 (SEM-03/SEM-04/SEM-06, D-P6): shared source for the pure
 * deterministic-selection primitive used by `semana-nueva-pipeline.ts` (route
 * resolution) and `stretching-selection.ts` (mobility pool selection).
 *
 * Extracted so the new pipeline and the STRETCHING selector import ONE
 * implementation instead of duplicating it (CLAUDE.md DRY). The original
 * `goal-plan-pipeline.ts:44-50` keeps its own private copy untouched (out of
 * scope for this plan — see 159-02-PLAN.md Task 1) but the algorithm body is
 * byte-for-byte identical, so results are interchangeable.
 *
 * NEVER use Math.random here or in any caller — determinism is a correctness
 * requirement (Pitfall 1: the STRETCHING block is generated once per level
 * and must be identical across all 6 levels for the same (week, day)).
 */

/**
 * Simple deterministic hash of a string.
 * Sums character codes for reproducible routing.
 */
export function simpleHash(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash + input.charCodeAt(i) * (i + 1)) | 0;
  }
  return Math.abs(hash);
}
