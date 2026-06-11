/**
 * Kairos generation gate (Phase 129, Plan 02)
 *
 * Kairos is a member level that inherits Alfa content but forces an
 * ultra-simple session shape:
 *   - D-03: Alfa exercises at the lowest linear rung (dificultadLineal = 1)
 *   - D-05: exactly 2 exercises per non-INITIUM block
 *
 * INITIUM is explicitly EXCLUDED from every kairos gate: it is the shared day
 * warmup, identical across all member levels (the printed sheet renders it
 * once for the whole day). The original D-04 (linear format on every block,
 * INITIUM included) was rolled back for INITIUM because it made the kairos
 * warmup diverge from the rest of the day.
 *
 * D-07 (load-bearing invariant): adding Kairos must NOT change existing
 * alfa/delta/sigma/omega/spartan generation. EVERY kairos behavior is gated
 * behind `isKairos(ctx.memberLevel)`, which is a pure additive branch — every
 * non-kairos code path is byte-for-byte unchanged. The gate value
 * (`memberLevel`) already flows on BlockContext through every stage, so no new
 * parameter threading is required.
 */

import type { ExerciseLevel, ContentLevel } from "../../types";

/**
 * Strict gate: true iff the member level is exactly 'kairos'.
 * Every other level (alfa/delta/sigma/omega/spartan) returns false.
 */
export function isKairos(memberLevel: ExerciseLevel): boolean {
  return memberLevel === "kairos";
}

/** D-05: exactly 2 exercises per kairos non-INITIUM block. */
export const KAIROS_BLOCK_SIZE = 2;

/**
 * D-03/D-06: kairos has no own exercise content yet, so it draws from Alfa
 * exercises at the lowest linear rung (dificultadLineal = 1 = "el escalon mas
 * facil"). dificultadLineal (not the 1-3 `difficulty` bucket column) is the
 * filter the candidate query applies — see exercise-fallback.ts queryExercises.
 */
export const KAIROS_INHERITED_LEVEL: ContentLevel = "alfa";
export const KAIROS_DIFICULTAD_LINEAL = 1;
