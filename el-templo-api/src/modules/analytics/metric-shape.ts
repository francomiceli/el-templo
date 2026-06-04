/**
 * Uniform metric shape + median helper (Phase 120 FUND-02).
 *
 * Pure, stateless utilities shared by ALL 6 metric blocks (phases 121-123). Two
 * concerns:
 *
 *   1. `metricShape` — the canonical `{ nominal, percentage, n }` envelope every
 *      block returns for a count-of-a-population metric. `nominal` is the raw count,
 *      `percentage` is `nominal / total` rounded to an integer, and `n` is the
 *      sample size (`total`). `n` is ALWAYS reported so the frontend can show the
 *      denominator and surface "small sample" caveats.
 *
 *   2. `median` — copied verbatim from funnel-service.ts:81-87, the nullable-on-empty
 *      median the ticket block needs alongside its weighted average.
 *
 * Both guard against division-by-zero / empty input and NEVER return NaN: a
 * zero-total `metricShape` reports `percentage: 0`, and an empty-array `median`
 * reports `null` (mirrors the div-by-zero discipline of
 * advanced-finance-service.ts:148-150 and retention-service.ts:189-192).
 *
 * Discipline note (schemas.ts:119-121): downstream responses go through
 * fast-json-stringify, which STRIPS any field not declared in the response schema.
 * Every field of `MetricShape` is therefore always declared and defaulted (0), never
 * left `undefined` — so the wire shape is stable regardless of input.
 *
 * No DB access, no logging, no `any`.
 */

/**
 * The uniform envelope for a count-of-a-population metric. Every field is always
 * present (defaulted to 0) so the JSON shape is stable on the wire.
 */
export interface MetricShape {
  /** The raw count being reported (e.g. members reaching cycle 2). */
  nominal: number;
  /** `nominal / n` as an integer percentage; `0` when `n === 0` (never NaN). */
  percentage: number;
  /** The sample size / denominator. Always reported. */
  n: number;
}

/**
 * Build the uniform `{ nominal, percentage, n }` shape for a count over a population.
 *
 * @param nominal the raw count being reported.
 * @param total the population size (becomes `n`).
 * @returns `{ nominal, percentage, n }` where `percentage` is
 *   `Math.round((nominal / total) * 100)` when `total > 0`, else `0`. The
 *   `total > 0` guard ensures the function NEVER returns NaN (mirrors
 *   advanced-finance-service.ts:148-150).
 */
export function metricShape(nominal: number, total: number): MetricShape {
  return {
    nominal,
    // Guard div-by-zero → 0 (documented), NEVER NaN.
    percentage: total > 0 ? Math.round((nominal / total) * 100) : 0,
    n: total,
  };
}

/**
 * Median of a numeric array. Returns `null` for an empty array (never NaN). Sorts a
 * copy ascending and takes the middle element (odd length) or the mean of the two
 * central elements (even length). Copied verbatim from funnel-service.ts:81-87 so
 * the ticket block and the funnel share one median contract.
 *
 * @param values the numbers to take the median of.
 * @returns the median, or `null` when `values` is empty.
 */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}
