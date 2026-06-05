/**
 * tree-progress / category-map — Phase 127 Plan 01 (TREE-06).
 *
 * Deterministic, total mapping from the coarse `exercises.pattern` column
 * (~9 distinct values in the catalog) onto the 5 visible thematic categories
 * of the skill tree (D-01): Tracción / Empuje / Piernas / Core / Movilidad.
 *
 * Per D-01 the visible grouping is derived from `pattern` (the coarse axis),
 * NOT from `category` (the fine ~22-value axis) and NOT from a new DB column.
 * Per D-02 the static/dynamic axis is NOT a grouping dimension here — it stays
 * an attribute/filter, so it never appears in this map.
 *
 * The distinct `exercises.pattern` values observed in the production catalog
 * (verified via `SELECT DISTINCT pattern FROM exercises`) are:
 *   '', CARDIO, CORE, FLOW, KL, LOWER, MOVILIDAD, PLYO, PULL, PUSH
 *
 * Mapping rationale for the non-obvious buckets (the obvious 1:1 ones are
 * PULL→Tracción, PUSH→Empuje, LOWER→Piernas, CORE→Core, MOVILIDAD→Movilidad):
 *   - FLOW   → Movilidad: animal-flow / locomotion / ground mobility work.
 *   - KL     → Piernas:   kettlebell swings/snatches are hip-hinge, posterior
 *                         chain / leg-dominant explosive movements.
 *   - CARDIO → Piernas:   burpees, jumping jacks, skaters, squat-jacks — jump/
 *                         conditioning work, leg-dominant full body.
 *   - PLYO   → Piernas:   reactive jumps / box jumps — leg-dominant plyometrics.
 *
 * FALLBACK (D-01 explicit, never silent): an unmapped/unexpected pattern value
 * (e.g. the empty-string `''` placeholder, or any future pattern) resolves to
 * the single explicit fallback category `Movilidad`. This is deliberate — an
 * uncategorized movement is least misleading parked under the "general/mobility"
 * section than forced into a strength bucket it may not belong to. The SERVICE
 * (not this library module) emits a `log.warn` for each distinct unmapped value
 * so the drift surfaces operationally; this module exposes `isMappedPattern` so
 * the caller can detect the fallback branch deterministically.
 */

export type Category = "Tracción" | "Empuje" | "Piernas" | "Core" | "Movilidad";

/**
 * Deterministic section ordering for the response. Every category renders even
 * when it owns zero nodes, so the member always sees all 5 sections in this
 * fixed order.
 */
export const CATEGORY_ORDER: readonly Category[] = [
  "Tracción",
  "Empuje",
  "Piernas",
  "Core",
  "Movilidad",
] as const;

/**
 * The single explicit fallback category for unmapped/unexpected pattern values.
 * Documented in the module header; exported so the service can reference it.
 */
export const FALLBACK_CATEGORY: Category = "Movilidad";

/**
 * Literal map keyed by the real distinct `exercises.pattern` values. Total over
 * the observed catalog vocabulary. The empty-string placeholder is intentionally
 * NOT given an entry here — it routes through the fallback so it is logged.
 */
const PATTERN_TO_CATEGORY: Record<string, Category> = {
  PULL: "Tracción",
  PUSH: "Empuje",
  LOWER: "Piernas",
  CORE: "Core",
  MOVILIDAD: "Movilidad",
  FLOW: "Movilidad",
  KL: "Piernas",
  CARDIO: "Piernas",
  PLYO: "Piernas",
};

/**
 * True iff the given pattern has an explicit entry in the map (i.e. it does NOT
 * resolve via the fallback). Lets the service warn exactly once per distinct
 * unmapped value without re-deriving the lookup.
 */
export function isMappedPattern(pattern: string): boolean {
  return Object.prototype.hasOwnProperty.call(
    PATTERN_TO_CATEGORY,
    pattern.trim().toUpperCase(),
  );
}

/**
 * Map a raw `exercises.pattern` value to exactly one of the 5 categories.
 * Total: any input resolves — known values via the literal map, everything else
 * (empty, whitespace, unexpected) via `FALLBACK_CATEGORY`. Normalizes case and
 * surrounding whitespace so trivial catalog noise does not leak a node into the
 * fallback bucket.
 */
export function patternToCategory(pattern: string): Category {
  const key = pattern.trim().toUpperCase();
  return PATTERN_TO_CATEGORY[key] ?? FALLBACK_CATEGORY;
}
