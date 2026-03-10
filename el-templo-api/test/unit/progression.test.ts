/**
 * Unit tests for progression service pure functions.
 *
 * No DB, no server context — pure function tests for:
 * - calculateStreak
 * - checkEligibility
 * - formatDateLabel
 * - getLevelDisplayName
 * - getGreekLetter
 */

import { describe, it, expect } from "vitest";
import {
  calculateStreak,
  checkEligibility,
  formatDateLabel,
  getLevelDisplayName,
  getGreekLetter,
  GREEK_LETTER_MAP,
} from "../../src/modules/progression/service";

/** Helper: returns YYYY-MM-DD for today */
const today = () => new Date().toISOString().split("T")[0];

/** Helper: returns YYYY-MM-DD for N days ago */
const daysAgo = (n: number): string => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0];
};

// ─── calculateStreak ────────────────────────────────────────────────────────

describe("calculateStreak", () => {
  it("returns 0 for empty array", () => {
    expect(calculateStreak([])).toBe(0);
  });

  it("returns 1 for a single session today", () => {
    expect(calculateStreak([{ date: today() }])).toBe(1);
  });

  it("returns 1 for a single session yesterday", () => {
    expect(calculateStreak([{ date: daysAgo(1) }])).toBe(1);
  });

  it("returns 0 for a single session 2+ days ago (streak broken)", () => {
    expect(calculateStreak([{ date: daysAgo(2) }])).toBe(0);
  });

  it("returns 3 for 3 consecutive days ending today", () => {
    const sessions = [
      { date: today() },
      { date: daysAgo(1) },
      { date: daysAgo(2) },
    ];
    expect(calculateStreak(sessions)).toBe(3);
  });

  it("returns 3 for 3 consecutive days ending yesterday", () => {
    const sessions = [
      { date: daysAgo(1) },
      { date: daysAgo(2) },
      { date: daysAgo(3) },
    ];
    expect(calculateStreak(sessions)).toBe(3);
  });

  it("counts only from most recent consecutive run (gap in middle)", () => {
    // today, yesterday, 3-days-ago (gap at 2-days-ago)
    const sessions = [
      { date: today() },
      { date: daysAgo(1) },
      { date: daysAgo(3) },
    ];
    expect(calculateStreak(sessions)).toBe(2);
  });

  it("deduplicates same-day sessions", () => {
    const sessions = [
      { date: today() },
      { date: today() },
      { date: daysAgo(1) },
    ];
    expect(calculateStreak(sessions)).toBe(2);
  });

  it("sorts unsorted sessions correctly", () => {
    const sessions = [
      { date: daysAgo(2) },
      { date: today() },
      { date: daysAgo(1) },
    ];
    expect(calculateStreak(sessions)).toBe(3);
  });

  it("returns 0 for sessions only in the distant past", () => {
    const sessions = [
      { date: daysAgo(10) },
      { date: daysAgo(11) },
      { date: daysAgo(12) },
    ];
    expect(calculateStreak(sessions)).toBe(0);
  });
});

// ─── checkEligibility ───────────────────────────────────────────────────────

describe("checkEligibility", () => {
  it("returns false for null (no RPE data)", () => {
    expect(checkEligibility(null)).toBe(false);
  });

  it("returns true for 5.0 (under threshold)", () => {
    expect(checkEligibility(5.0)).toBe(true);
  });

  it("returns true for 6.0 (at threshold)", () => {
    expect(checkEligibility(6.0)).toBe(true);
  });

  it("returns false for 6.1 (over threshold)", () => {
    expect(checkEligibility(6.1)).toBe(false);
  });

  it("returns true for 0", () => {
    expect(checkEligibility(0)).toBe(true);
  });
});

// ─── formatDateLabel ────────────────────────────────────────────────────────

describe("formatDateLabel", () => {
  it("returns a non-empty string containing the day number", () => {
    const result = formatDateLabel("2026-03-10");
    expect(result.length).toBeGreaterThan(0);
    expect(result).toContain("10");
  });

  it("does not throw on edge date (Jan 1)", () => {
    const result = formatDateLabel("2026-01-01");
    expect(result.length).toBeGreaterThan(0);
    expect(result).toContain("1");
  });

  it("does not throw on edge date (Dec 31)", () => {
    const result = formatDateLabel("2026-12-31");
    expect(result.length).toBeGreaterThan(0);
    expect(result).toContain("31");
  });
});

// ─── getLevelDisplayName ────────────────────────────────────────────────────

describe("getLevelDisplayName", () => {
  it('returns "Alfa" for "alfa"', () => {
    expect(getLevelDisplayName("alfa")).toBe("Alfa");
  });

  it('returns "Spartan" for "spartan"', () => {
    expect(getLevelDisplayName("spartan")).toBe("Spartan");
  });

  it('returns "Delta" for "delta"', () => {
    expect(getLevelDisplayName("delta")).toBe("Delta");
  });

  it('returns "Sigma" for "sigma"', () => {
    expect(getLevelDisplayName("sigma")).toBe("Sigma");
  });

  it('returns "Omega" for "omega"', () => {
    expect(getLevelDisplayName("omega")).toBe("Omega");
  });
});

// ─── getGreekLetter ─────────────────────────────────────────────────────────

describe("getGreekLetter", () => {
  it('returns "\u03B1" for "alfa"', () => {
    expect(getGreekLetter("alfa")).toBe("\u03B1");
  });

  it('returns "\u0394" for "delta"', () => {
    expect(getGreekLetter("delta")).toBe("\u0394");
  });

  it('returns "\u03A3" for "sigma"', () => {
    expect(getGreekLetter("sigma")).toBe("\u03A3");
  });

  it('returns "\u03A9" for "omega"', () => {
    expect(getGreekLetter("omega")).toBe("\u03A9");
  });

  it('returns "\u03A9" for "spartan" (same as omega)', () => {
    expect(getGreekLetter("spartan")).toBe("\u03A9");
  });

  it("returns the level string itself for unknown levels (fallback)", () => {
    expect(getGreekLetter("unknown")).toBe("unknown");
  });

  it("covers all entries in GREEK_LETTER_MAP", () => {
    for (const [level, letter] of Object.entries(GREEK_LETTER_MAP)) {
      expect(getGreekLetter(level)).toBe(letter);
    }
  });
});
