import { describe, it, expect } from "vitest";
import { expandDates } from "../../src/modules/subscriptions/booking-population";

describe("expandDates (booking-population helper)", () => {
  it("returns empty array when startDate is after endDate", () => {
    expect(expandDates("2026-05-10", "2026-05-01", 1, new Set())).toEqual([]);
  });

  it("emits the first matching weekday inside the window", () => {
    // 2026-04-27 is a Monday (ISO weekday 1)
    const out = expandDates("2026-04-27", "2026-04-27", 1, new Set());
    expect(out).toEqual(["2026-04-27"]);
  });

  it("advances to the target weekday when startDate doesn't match", () => {
    // Target Wednesday (3) starting from Mon 27-abr
    const out = expandDates("2026-04-27", "2026-04-30", 3, new Set());
    expect(out).toEqual(["2026-04-29"]);
  });

  it("walks weekly until endDate inclusive", () => {
    // Mondays from 27-abr to 18-may inclusive
    const out = expandDates("2026-04-27", "2026-05-18", 1, new Set());
    expect(out).toEqual([
      "2026-04-27",
      "2026-05-04",
      "2026-05-11",
      "2026-05-18",
    ]);
  });

  it("skips holiday dates", () => {
    // Fridays from 24-abr to 08-may. 01-may is Labor Day in AR.
    const out = expandDates(
      "2026-04-24",
      "2026-05-08",
      5, // Friday ISO
      new Set(["2026-05-01"]),
    );
    expect(out).toEqual(["2026-04-24", "2026-05-08"]);
  });

  it("handles Sunday (ISO 7) correctly", () => {
    // 2026-05-03 is a Sunday
    const out = expandDates("2026-05-01", "2026-05-10", 7, new Set());
    expect(out).toEqual(["2026-05-03", "2026-05-10"]);
  });

  it("never emits the same date twice", () => {
    const out = expandDates("2026-04-27", "2027-04-27", 1, new Set());
    expect(new Set(out).size).toBe(out.length);
  });
});
