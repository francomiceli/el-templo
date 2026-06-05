/**
 * Kairos generation gate (Phase 129, Plan 02)
 *
 * Kairos is a member level that inherits Alfa content but forces an
 * ultra-simple session shape:
 *   - D-03: Alfa exercises at the lowest linear rung (dificultadLineal = 1)
 *   - D-04: linear sets-by-reps format only (no EMOM/AMRAP/circuit/complex)
 *   - D-05: exactly 2 exercises per block, INITIUM included
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

/** D-05: exactly 2 exercises per kairos block (INITIUM included). */
export const KAIROS_BLOCK_SIZE = 2;

/**
 * D-04: the canonical linear (sets-by-reps) format forced on every kairos block.
 *
 * "Singlet" and "For Quality" are BOTH seeded sets-by-reps formats (they render
 * via getDefaultFormatParams handlers `singlet` / `for_quality`). "Singlet" is
 * the purest sets-by-reps with no time domain, so it is the primary choice.
 * NOTE: "Straight Sets" is referenced in fallback DEFAULT_FORMATS but is NOT in
 * the seed CSV ("[Planificaciones] - Base de Datos - Formatos.csv") — do NOT use
 * it here. Fall back to "For Quality" only if "Singlet" is absent from the
 * `formats` table.
 */
export const KAIROS_LINEAR_FORMAT_NAME = "Singlet";
export const KAIROS_LINEAR_FORMAT_FALLBACK = "For Quality";

/**
 * D-03/D-06: kairos has no own exercise content yet, so it draws from Alfa
 * exercises at the lowest linear rung (dificultadLineal = 1 = "el escalon mas
 * facil"). dificultadLineal (not the 1-3 `difficulty` bucket column) is the
 * filter the candidate query applies — see exercise-fallback.ts queryExercises.
 */
export const KAIROS_INHERITED_LEVEL: ContentLevel = "alfa";
export const KAIROS_DIFICULTAD_LINEAL = 1;
