import { describe, it, expect } from "vitest";
import {
  deriveDurationTier,
  ONE_OFF_MAX_DURATION_DAYS,
  MONTHLY_MAX_DURATION_DAYS,
} from "../../src/modules/analytics/duration-tier";
import { metricShape, median } from "../../src/modules/analytics/metric-shape";

/**
 * Phase 120 Plan 01 — foundation helpers (FUND-01 / FUND-02).
 *
 * Pure functions: NO MySQL, NO createTestApp. Covers the duration-tier boundary
 * table (asserting against the real validated plan durations 1/30/120/180/240),
 * the metric-shape div-by-zero guard (never NaN), and the median empty/odd/even
 * contract. Run in CI (MEMORY: tests run in CI on staging push, not locally).
 */

describe("deriveDurationTier (FUND-01 / D-01 / D-02)", () => {
  it("exposes the thresholds as named constants (no magic numbers)", () => {
    expect(ONE_OFF_MAX_DURATION_DAYS).toBe(1);
    expect(MONTHLY_MAX_DURATION_DAYS).toBe(31);
  });

  it("returns null for null durationDays (no plan / no duration)", () => {
    expect(deriveDurationTier(null)).toBeNull();
  });

  it("returns null for one-off plans (<= ONE_OFF_MAX_DURATION_DAYS)", () => {
    expect(deriveDurationTier(0)).toBeNull();
    expect(deriveDurationTier(1)).toBeNull(); // Clase única / Sesión de Prueba
  });

  it("returns 'monthly' for 2..31 days", () => {
    expect(deriveDurationTier(2)).toBe("monthly");
    expect(deriveDurationTier(30)).toBe("monthly"); // real plan: 30 days
    expect(deriveDurationTier(31)).toBe("monthly"); // upper boundary
  });

  it("returns 'long_term' for > 31 days", () => {
    expect(deriveDurationTier(32)).toBe("long_term"); // lower boundary
    expect(deriveDurationTier(120)).toBe("long_term"); // real plan
    expect(deriveDurationTier(180)).toBe("long_term"); // real plan
    expect(deriveDurationTier(240)).toBe("long_term"); // real plan
  });

  it("maps the real validated plan durations correctly", () => {
    // 1 / 30 / 120 / 180 / 240 → excluded / monthly / long_term x3
    expect([1, 30, 120, 180, 240].map((d) => deriveDurationTier(d))).toEqual([
      null,
      "monthly",
      "long_term",
      "long_term",
      "long_term",
    ]);
  });
});

describe("metricShape (FUND-02)", () => {
  it("computes nominal, rounded percentage, and n for a normal ratio", () => {
    expect(metricShape(50, 200)).toEqual({
      nominal: 50,
      percentage: 25,
      n: 200,
    });
  });

  it("rounds the percentage to an integer", () => {
    // 1/3 = 33.33% → 33
    expect(metricShape(1, 3).percentage).toBe(33);
    // 2/3 = 66.66% → 67
    expect(metricShape(2, 3).percentage).toBe(67);
  });

  it("guards div-by-zero: zero total → percentage 0, n 0, never NaN", () => {
    const shape = metricShape(3, 0);
    expect(shape).toEqual({ nominal: 3, percentage: 0, n: 0 });
    expect(Number.isNaN(shape.percentage)).toBe(false);
  });
});

describe("median (FUND-02)", () => {
  it("returns null for an empty array (never NaN)", () => {
    expect(median([])).toBeNull();
  });

  it("returns the single value for a one-element array", () => {
    expect(median([5])).toBe(5);
  });

  it("returns the middle element for odd-length arrays", () => {
    expect(median([1, 2, 3])).toBe(2);
  });

  it("returns the mean of the two central elements for even-length arrays", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it("sorts before taking the median (unordered input)", () => {
    expect(median([3, 1, 2])).toBe(2);
  });
});
