/**
 * Unit tests for shared date-utils module.
 *
 * All functions are pure -- no DB, no server context needed.
 * Tests cover timezone edge cases (month/year boundaries, Argentina UTC-3).
 */

import { describe, it, expect } from "vitest";
import {
  addDays,
  getWeekRange,
  buildClassDateTime,
  todayInTz,
  dowInTz,
  toDateString,
  resolveMonthRange,
  computePriorPeriod,
} from "../../src/modules/shared/date-utils";

const AR_TZ = "America/Argentina/Buenos_Aires";
const MADRID_TZ = "Europe/Madrid";

describe("date-utils", () => {
  // ─── addDays ──────────────────────────────────────────────────────────────

  describe("addDays", () => {
    it("adds 1 day to a regular date", () => {
      expect(addDays("2026-03-10", 1)).toBe("2026-03-11");
    });

    it("handles month boundary", () => {
      expect(addDays("2026-03-31", 1)).toBe("2026-04-01");
    });

    it("handles year boundary", () => {
      expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    });

    it("adds multiple days", () => {
      expect(addDays("2026-03-10", 5)).toBe("2026-03-15");
    });

    it("adds zero days", () => {
      expect(addDays("2026-03-10", 0)).toBe("2026-03-10");
    });

    it("handles negative days", () => {
      expect(addDays("2026-03-10", -1)).toBe("2026-03-09");
    });

    it("handles February leap year", () => {
      expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
      expect(addDays("2028-02-29", 1)).toBe("2028-03-01");
    });

    it("handles February non-leap year", () => {
      expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    });
  });

  // ─── getWeekRange ─────────────────────────────────────────────────────────

  describe("getWeekRange", () => {
    it("returns Monday-Saturday for a Wednesday", () => {
      // 2026-03-11 is a Wednesday
      const date = new Date("2026-03-11T12:00:00Z");
      const { monday, saturday } = getWeekRange(date);
      expect(monday).toBe("2026-03-09");
      expect(saturday).toBe("2026-03-14");
    });

    it("returns Monday-Saturday for a Monday", () => {
      // 2026-03-09 is a Monday
      const date = new Date("2026-03-09T12:00:00Z");
      const { monday, saturday } = getWeekRange(date);
      expect(monday).toBe("2026-03-09");
      expect(saturday).toBe("2026-03-14");
    });

    it("returns Monday-Saturday for a Saturday", () => {
      // 2026-03-14 is a Saturday
      const date = new Date("2026-03-14T12:00:00Z");
      const { monday, saturday } = getWeekRange(date);
      expect(monday).toBe("2026-03-09");
      expect(saturday).toBe("2026-03-14");
    });

    it("returns prior week Monday-Saturday for a Sunday (Sun belongs to prior week)", () => {
      // 2026-03-15 is a Sunday
      const date = new Date("2026-03-15T12:00:00Z");
      const { monday, saturday } = getWeekRange(date);
      expect(monday).toBe("2026-03-09");
      expect(saturday).toBe("2026-03-14");
    });

    it("handles month boundary in week range", () => {
      // 2026-04-01 is a Wednesday -- Monday is March 30
      const date = new Date("2026-04-01T12:00:00Z");
      const { monday, saturday } = getWeekRange(date);
      expect(monday).toBe("2026-03-30");
      expect(saturday).toBe("2026-04-04");
    });
  });

  // ─── buildClassDateTime ───────────────────────────────────────────────────

  describe("buildClassDateTime", () => {
    it("creates correct Date for morning class in Argentina (UTC-3)", () => {
      const result = buildClassDateTime("2026-03-10", "09:30", AR_TZ);
      // 09:30 Argentina = 12:30 UTC
      expect(result.toISOString()).toBe("2026-03-10T12:30:00.000Z");
    });

    it("creates correct Date for evening class in Argentina (UTC-3)", () => {
      const result = buildClassDateTime("2026-03-10", "18:00", AR_TZ);
      // 18:00 Argentina = 21:00 UTC
      expect(result.toISOString()).toBe("2026-03-10T21:00:00.000Z");
    });

    it("creates correct Date for early morning class", () => {
      const result = buildClassDateTime("2026-03-10", "07:00", AR_TZ);
      // 07:00 Argentina = 10:00 UTC
      expect(result.toISOString()).toBe("2026-03-10T10:00:00.000Z");
    });

    it("creates correct Date for late night class", () => {
      const result = buildClassDateTime("2026-03-10", "22:00", AR_TZ);
      // 22:00 Argentina = 01:00 UTC next day
      expect(result.toISOString()).toBe("2026-03-11T01:00:00.000Z");
    });

    it("creates correct Date for Madrid class in winter (UTC+1, no DST)", () => {
      // 2026-01-15 is standard time in Madrid (UTC+1)
      const result = buildClassDateTime("2026-01-15", "18:00", MADRID_TZ);
      // 18:00 Madrid = 17:00 UTC
      expect(result.toISOString()).toBe("2026-01-15T17:00:00.000Z");
    });

    it("creates correct Date for Madrid class in summer DST (UTC+2)", () => {
      // 2026-07-15 is DST in Madrid (UTC+2)
      const result = buildClassDateTime("2026-07-15", "18:00", MADRID_TZ);
      // 18:00 Madrid DST = 16:00 UTC
      expect(result.toISOString()).toBe("2026-07-15T16:00:00.000Z");
    });

    it("handles Madrid spring-forward day (last Sunday of March)", () => {
      // 2026-03-29 is the DST transition day in Madrid (01:00 UTC -> 03:00 local)
      // A class at 10:00 local on that day = 08:00 UTC (DST already in effect)
      const result = buildClassDateTime("2026-03-29", "10:00", MADRID_TZ);
      expect(result.toISOString()).toBe("2026-03-29T08:00:00.000Z");
    });

    it("handles Madrid fall-back day (last Sunday of October)", () => {
      // 2026-10-25 DST ends. Class at 10:00 local = 09:00 UTC (standard time)
      const result = buildClassDateTime("2026-10-25", "10:00", MADRID_TZ);
      expect(result.toISOString()).toBe("2026-10-25T09:00:00.000Z");
    });

    it("AR tz produces identical output before and after fix baseline", () => {
      // Regression lock: AR branches must not shift. UTC-3 year-round.
      expect(
        buildClassDateTime("2026-07-15", "18:00", AR_TZ).toISOString(),
      ).toBe("2026-07-15T21:00:00.000Z");
      expect(
        buildClassDateTime("2026-01-15", "18:00", AR_TZ).toISOString(),
      ).toBe("2026-01-15T21:00:00.000Z");
    });
  });

  // ─── todayInTz ────────────────────────────────────────────────────────────

  describe("todayInTz", () => {
    it("returns the date as seen in AR when server is UTC late night", () => {
      // 03:30 UTC on Mar 10 is still Mar 9 in Argentina (UTC-3 → 00:30 AR Mar 10)
      // Actually 03:30 UTC = 00:30 AR same date Mar 10
      const now = new Date("2026-03-10T03:30:00Z");
      expect(todayInTz(AR_TZ, now)).toBe("2026-03-10");
    });

    it("returns prior date in AR when UTC just past midnight", () => {
      // 02:30 UTC on Mar 10 = 23:30 AR on Mar 9
      const now = new Date("2026-03-10T02:30:00Z");
      expect(todayInTz(AR_TZ, now)).toBe("2026-03-09");
    });

    it("returns Madrid date ahead of UTC in winter", () => {
      // 23:30 UTC Mar 9 = 00:30 Madrid Mar 10 (UTC+1)
      const now = new Date("2026-03-09T23:30:00Z");
      expect(todayInTz(MADRID_TZ, now)).toBe("2026-03-10");
    });

    it("returns Madrid date ahead of UTC in DST", () => {
      // 22:30 UTC Jul 15 = 00:30 Madrid Jul 16 (UTC+2 DST)
      const now = new Date("2026-07-15T22:30:00Z");
      expect(todayInTz(MADRID_TZ, now)).toBe("2026-07-16");
    });
  });

  // ─── dowInTz ──────────────────────────────────────────────────────────────

  describe("dowInTz", () => {
    it("returns ISO day-of-week in AR", () => {
      // 2026-03-10 is a Tuesday
      const now = new Date("2026-03-10T12:00:00Z");
      expect(dowInTz(AR_TZ, now)).toBe(2);
    });

    it("returns ISO day-of-week in Madrid when crossing UTC midnight", () => {
      // 23:30 UTC Mon Mar 9 = 00:30 Madrid Tue Mar 10 (UTC+1)
      const now = new Date("2026-03-09T23:30:00Z");
      expect(dowInTz(MADRID_TZ, now)).toBe(2);
    });

    it("maps Sunday to ISO 7", () => {
      // 2026-03-15 is a Sunday
      const now = new Date("2026-03-15T12:00:00Z");
      expect(dowInTz(AR_TZ, now)).toBe(7);
    });
  });

  // ─── toDateString ─────────────────────────────────────────────────────────

  describe("toDateString", () => {
    it("formats a UTC noon date correctly", () => {
      const date = new Date("2026-03-10T12:00:00Z");
      expect(toDateString(date)).toBe("2026-03-10");
    });

    it("formats a UTC midnight date correctly (no timezone shift)", () => {
      const date = new Date("2026-03-10T00:00:00Z");
      expect(toDateString(date)).toBe("2026-03-10");
    });

    it("formats a late UTC time correctly", () => {
      const date = new Date("2026-03-10T23:59:59Z");
      expect(toDateString(date)).toBe("2026-03-10");
    });

    it("pads single-digit month and day", () => {
      const date = new Date("2026-01-05T12:00:00Z");
      expect(toDateString(date)).toBe("2026-01-05");
    });
  });

  // ─── resolveMonthRange ────────────────────────────────────────────────────

  describe("resolveMonthRange", () => {
    it("returns current month start and end with no args", () => {
      const now = new Date("2026-03-15T12:00:00Z");
      const { dateFrom, dateTo } = resolveMonthRange(now);
      expect(dateFrom).toBe("2026-03-01");
      expect(dateTo).toBe("2026-03-31");
    });

    it("handles February non-leap year", () => {
      const now = new Date("2026-02-10T12:00:00Z");
      const { dateFrom, dateTo } = resolveMonthRange(now);
      expect(dateFrom).toBe("2026-02-01");
      expect(dateTo).toBe("2026-02-28");
    });

    it("handles February leap year", () => {
      const now = new Date("2028-02-10T12:00:00Z");
      const { dateFrom, dateTo } = resolveMonthRange(now);
      expect(dateFrom).toBe("2028-02-01");
      expect(dateTo).toBe("2028-02-29");
    });

    it("handles December", () => {
      const now = new Date("2026-12-25T12:00:00Z");
      const { dateFrom, dateTo } = resolveMonthRange(now);
      expect(dateFrom).toBe("2026-12-01");
      expect(dateTo).toBe("2026-12-31");
    });

    it("handles January", () => {
      const now = new Date("2026-01-01T12:00:00Z");
      const { dateFrom, dateTo } = resolveMonthRange(now);
      expect(dateFrom).toBe("2026-01-01");
      expect(dateTo).toBe("2026-01-31");
    });
  });

  // ─── computePriorPeriod ───────────────────────────────────────────────────

  describe("computePriorPeriod", () => {
    it("computes prior period of same length ending day before", () => {
      const { priorFrom, priorTo } = computePriorPeriod(
        "2026-03-01",
        "2026-03-31",
      );
      // Duration = 30 days (Mar 31 - Mar 1). Prior ends Feb 28, starts Jan 29.
      expect(priorTo).toBe("2026-02-28");
      expect(priorFrom).toBe("2026-01-29");
    });

    it("computes prior period for a single week", () => {
      const { priorFrom, priorTo } = computePriorPeriod(
        "2026-03-09",
        "2026-03-15",
      );
      // 6-day range. Prior: Mar 2 - Mar 8
      expect(priorTo).toBe("2026-03-08");
      expect(priorFrom).toBe("2026-03-02");
    });

    it("handles year boundary", () => {
      const { priorFrom, priorTo } = computePriorPeriod(
        "2026-01-01",
        "2026-01-31",
      );
      // Duration = 30 days (Jan 31 - Jan 1). Prior ends Dec 31, starts Dec 1.
      expect(priorTo).toBe("2025-12-31");
      expect(priorFrom).toBe("2025-12-01");
    });
  });
});
