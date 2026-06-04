/**
 * Kaplan-Meier survival-median helper (Phase 122 — LTV-02, D-122-05 / D-122-06).
 *
 * Pure, stateless statistical primitive — the ONLY genuinely new algorithm in the
 * LTV phase. D-122-05 fixes the scope to the SURVIVAL MEDIAN ONLY (the month by which
 * half the cohort has churned); the full month-by-month survival curve is deferred.
 * D-122-06 mandates this statistic be isolated here with dedicated edge-case tests
 * (see test/analytics/kaplan-meier.test.ts) — mirroring the foundation-module style of
 * `metric-shape.ts` (null-on-empty median guard) and `expiry-cohort.ts` (decision-ID
 * doc header, named exported constants, no DB / no logging / no `any` footer).
 *
 * Input model (D-122-05): one observation per customer, `{ durationMonths, event }`.
 *   - `event = true`  -> the life CLOSED (the person churned per Phase 121's matured,
 *     not-retained churn event). This is a survival EVENT.
 *   - `event = false` -> the life is CENSORED: the customer is still active / in-grace,
 *     so we only know they survived AT LEAST `durationMonths`. Censored observations are
 *     NEVER discarded (the key difference from a naive "average of closed lives"); they
 *     remain in the at-risk denominator until their own duration elapses, then leave the
 *     risk set without producing a drop.
 *
 * Estimator (product-limit): over the DISTINCT event times t_i in ascending order,
 *
 *     S(t) = Π_{t_i <= t} (1 − d_i / n_i)
 *
 *   where d_i = number of events (churns) AT t_i and n_i = the at-risk count =
 *   observations (closed OR censored) whose `durationMonths >= t_i`. Ties (several
 *   churns in the same month) collapse into ONE step (d_i > 1), NOT a sequence of
 *   single drops with a shrinking denominator. The MEDIAN survival is the FIRST event
 *   time t where the running `S(t) <= SURVIVAL_MEDIAN_THRESHOLD`.
 *
 * Numeric safety (T-122-01): empty cohorts, single-observation cohorts, and cohorts
 * whose survival never crosses the threshold (e.g. all-censored, or too few events)
 * return `null` — NEVER NaN — mirroring `median` at metric-shape.ts:70-76.
 */

/**
 * The survival probability at or below which the median survival time is reached
 * (half the cohort has churned). Exported product rule — NOT a magic number, NOT an
 * env var. Per the Kaplan-Meier median definition this is exactly 0.5.
 */
export const SURVIVAL_MEDIAN_THRESHOLD = 0.5;

/**
 * Minimum cohort size to even attempt a survival median. A single observation cannot
 * establish a median (mirrors the empty/insufficient guard of `median`), so cohorts
 * smaller than this return `null`. Exported product rule.
 */
export const MIN_COHORT_SIZE_FOR_MEDIAN = 2;

/**
 * One survival observation per customer (D-122-05).
 */
export interface KaplanMeierObservation {
  /**
   * The observed lifetime in whole months. For a closed life this is the span from
   * first start to the churn event; for a censored life it is the elapsed time to
   * "today". The service materializes this from the Phase 121 cohort engine.
   */
  durationMonths: number;
  /**
   * `true` when the life CLOSED (churned) — a survival event. `false` when the
   * observation is CENSORED (still active / in-grace): survival is only known to be
   * AT LEAST `durationMonths`.
   */
  event: boolean;
}

/**
 * Compute the Kaplan-Meier median survival time (in months) for a survival cohort,
 * treating active customers as censored data (D-122-05 / D-122-06).
 *
 * @param observations one observation per customer (`{ durationMonths, event }`).
 * @returns the first event time `t` where the running survival `S(t)` drops to or
 *   below `SURVIVAL_MEDIAN_THRESHOLD`; `null` when the cohort is empty, has fewer than
 *   `MIN_COHORT_SIZE_FOR_MEDIAN` observations, or survival never reaches the threshold
 *   within the observed window (NEVER NaN).
 */
export function kaplanMeierMedian(
  observations: KaplanMeierObservation[],
): number | null {
  // Guard empty / single-element cohorts -> null (never NaN). A lone observation
  // cannot establish a median (mirrors metric-shape.ts median empty guard).
  if (observations.length < MIN_COHORT_SIZE_FOR_MEDIAN) return null;

  // Distinct EVENT times only (censored-only times never produce a survival step),
  // sorted ascending. Map each event time to its event count d_i (ties collapse here).
  const eventCounts = new Map<number, number>();
  for (const obs of observations) {
    if (obs.event) {
      eventCounts.set(
        obs.durationMonths,
        (eventCounts.get(obs.durationMonths) ?? 0) + 1,
      );
    }
  }

  // No events at all (e.g. an all-censored cohort) -> survival never drops -> null.
  if (eventCounts.size === 0) return null;

  const eventTimes = [...eventCounts.keys()].sort((a, b) => a - b);

  let survival = 1;
  for (const t of eventTimes) {
    // At-risk count n_i: every observation (closed OR censored) that survived at
    // least up to t. Censored observations stay in the denominator until their own
    // duration passes — this is what makes them count without being events.
    const atRisk = observations.reduce(
      (count, obs) => (obs.durationMonths >= t ? count + 1 : count),
      0,
    );
    // atRisk is >= 1 here because the event at t is itself at risk at t; the guard
    // keeps the math defensive against an empty risk set (never divide by zero).
    if (atRisk === 0) continue;

    const events = eventCounts.get(t) ?? 0;
    // One survival step for the whole tie group (d_i / n_i), NOT per-event drops.
    survival *= 1 - events / atRisk;

    if (survival <= SURVIVAL_MEDIAN_THRESHOLD) return t;
  }

  // Survival never reached the threshold within the observed window -> no median.
  return null;
}

// No DB access, no logging, no any.
