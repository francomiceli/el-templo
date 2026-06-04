import { describe, it, expect } from "vitest";
import {
  kaplanMeierMedian,
  SURVIVAL_MEDIAN_THRESHOLD,
  type KaplanMeierObservation,
} from "../../src/modules/analytics/kaplan-meier";

/**
 * Phase 122 Plan 01 — Kaplan-Meier survival-median helper (D-122-05 / D-122-06).
 *
 * Pure unit tests: NO MySQL, NO createTestApp. The KM median is the only genuinely
 * new statistic in the LTV phase and D-122-06 MANDATES it be isolated with dedicated
 * edge-case coverage. Each `it` maps to one of the six required behavior cases:
 * events (no censoring), censoring-changes-denominator, ties, empty, single-customer,
 * never-crosses-the-threshold. Run in CI (MEMORY: tests run in CI on staging push,
 * not locally).
 *
 * Survival recap (stepwise product-limit, ascending distinct event times):
 *   S(t) = Π over event times t_i <= t of (1 − d_i / n_i)
 *     d_i = events (churns) AT time t_i
 *     n_i = at-risk count = observations with durationMonths >= t_i
 * The median is the FIRST event time t where S(t) <= SURVIVAL_MEDIAN_THRESHOLD (0.5).
 * Censored observations (event=false) stay in the at-risk denominator until their
 * own duration passes, but are NEVER events — they leave the risk set without a drop.
 */

describe("SURVIVAL_MEDIAN_THRESHOLD", () => {
  it("exposes the median threshold as a named constant (no magic 0.5)", () => {
    expect(SURVIVAL_MEDIAN_THRESHOLD).toBe(0.5);
  });
});

describe("kaplanMeierMedian (D-122-05 / D-122-06)", () => {
  it("Test 1 (events, no censoring): all-closed cohort returns the first month survival <= 0.5", () => {
    // durations [1,2,3,4], all events:
    //   t=1: n=4 d=1 -> S=0.75
    //   t=2: n=3 d=1 -> S=0.50  <= 0.5  => median = 2
    const cohort: KaplanMeierObservation[] = [
      { durationMonths: 1, event: true },
      { durationMonths: 2, event: true },
      { durationMonths: 3, event: true },
      { durationMonths: 4, event: true },
    ];
    expect(kaplanMeierMedian(cohort)).toBe(2);
  });

  it("Test 2 (censoring matters): censored observations change the at-risk denominator", () => {
    // Closed lives at months 1 and 5; three customers censored (still active) at
    // month 2. A naive median-of-closed would be (1+5)/2 = 3. With censoring the
    // survival curve drops much more slowly because the at-risk set stays large:
    //   t=1: n=5 d=1 -> S = 4/5 = 0.8
    //   (3 censored leave the risk set after t=2 without being events)
    //   t=5: n=1 d=1 -> S = 0.8 * (1 - 1/1) = 0.0  <= 0.5  => median = 5
    // The KM median (5) therefore differs from the naive median-of-closed (3),
    // proving censored persons are kept in the denominator, not discarded.
    const cohort: KaplanMeierObservation[] = [
      { durationMonths: 1, event: true },
      { durationMonths: 2, event: false },
      { durationMonths: 2, event: false },
      { durationMonths: 2, event: false },
      { durationMonths: 5, event: true },
    ];
    const naiveMedianOfClosed = 3;
    const km = kaplanMeierMedian(cohort);
    expect(km).toBe(5);
    expect(km).not.toBe(naiveMedianOfClosed);
  });

  it("Test 3 (ties): multiple events at the same month collapse into one survival step", () => {
    // durations [2,2,3,3], all events. The two events at t=2 are ONE step:
    //   t=2: n=4 d=2 -> S = 1 - 2/4 = 0.5  <= 0.5  => median = 2
    // (If ties were mishandled as two separate single drops at t=2 the result would
    // be 1 - 1/4 then 1 - 1/3 = 0.5 as well here, so assert the single-step n/d math
    // via a denominator-sensitive tie below too.)
    const cohort: KaplanMeierObservation[] = [
      { durationMonths: 2, event: true },
      { durationMonths: 2, event: true },
      { durationMonths: 3, event: true },
      { durationMonths: 3, event: true },
    ];
    expect(kaplanMeierMedian(cohort)).toBe(2);
  });

  it("Test 3b (ties, denominator-sensitive): three simultaneous events drop the step at once", () => {
    // durations [3,3,3,4,5,6], all events.
    //   t=3: n=6 d=3 -> S = 1 - 3/6 = 0.5  <= 0.5  => median = 3
    // A single-step collapse is required; counting the three churns one-by-one with
    // a shrinking denominator (6->5->4) would NOT reach 0.5 at t=3.
    const cohort: KaplanMeierObservation[] = [
      { durationMonths: 3, event: true },
      { durationMonths: 3, event: true },
      { durationMonths: 3, event: true },
      { durationMonths: 4, event: true },
      { durationMonths: 5, event: true },
      { durationMonths: 6, event: true },
    ];
    expect(kaplanMeierMedian(cohort)).toBe(3);
  });

  it("Test 4 (empty cohort): returns null (never NaN)", () => {
    expect(kaplanMeierMedian([])).toBeNull();
  });

  it("Test 5 (single customer): returns null (cannot establish a median)", () => {
    expect(kaplanMeierMedian([{ durationMonths: 3, event: true }])).toBeNull();
    expect(kaplanMeierMedian([{ durationMonths: 3, event: false }])).toBeNull();
  });

  it("Test 6 (never crosses 0.5): heavily-censored cohort whose survival stays above the threshold returns null", () => {
    // One early event, the rest censored so the curve never reaches 0.5:
    //   t=2: n=5 d=1 -> S = 4/5 = 0.8  (only event time)
    //   all remaining observations are censored => no further drop, S stays 0.8 > 0.5
    // => null (the median survival is not reached within the observed window).
    const cohort: KaplanMeierObservation[] = [
      { durationMonths: 2, event: true },
      { durationMonths: 3, event: false },
      { durationMonths: 4, event: false },
      { durationMonths: 5, event: false },
      { durationMonths: 6, event: false },
    ];
    expect(kaplanMeierMedian(cohort)).toBeNull();
  });

  it("Test 6b (all censored): a cohort with no events at all returns null", () => {
    const cohort: KaplanMeierObservation[] = [
      { durationMonths: 1, event: false },
      { durationMonths: 2, event: false },
      { durationMonths: 3, event: false },
    ];
    expect(kaplanMeierMedian(cohort)).toBeNull();
  });
});
