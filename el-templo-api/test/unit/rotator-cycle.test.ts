/**
 * Unit tests for wrapToRotatorCycle (rotator week wrap-around).
 *
 * The weekly_rotator table only covers a fixed cycle of planned weeks (1-26
 * in the source CSV), while dateToWeekNumber counts calendar weeks linearly
 * up to 52. Before this wrap existed, generating week 27 failed with
 * "No rotator entry found for week=27 ..." on every rotator-backed day
 * (lunes/martes/viernes), while combos/tecnica/ROM days — which bypass the
 * rotator — generated fine (the 14-generated/18-failed incident of
 * 2026-08-18). The wrap makes the route rotation repeat past the cycle end
 * while SPOM periodization (spom_rules, covering all 52 weeks) keeps using
 * the real calendar week.
 */

import { describe, it, expect } from "vitest";
import { wrapToRotatorCycle } from "../../src/modules/spom/service";

describe("wrapToRotatorCycle", () => {
  it("passes weeks within the cycle through unchanged", () => {
    expect(wrapToRotatorCycle(1, 26)).toBe(1);
    expect(wrapToRotatorCycle(13, 26)).toBe(13);
    expect(wrapToRotatorCycle(26, 26)).toBe(26);
  });

  it("wraps the first week past the cycle back to week 1 (the W27 incident)", () => {
    expect(wrapToRotatorCycle(27, 26)).toBe(1);
  });

  it("wraps every week of the second cycle onto the first", () => {
    expect(wrapToRotatorCycle(28, 26)).toBe(2);
    expect(wrapToRotatorCycle(39, 26)).toBe(13);
    expect(wrapToRotatorCycle(52, 26)).toBe(26);
  });

  it("keeps wrapping beyond two cycles", () => {
    // dateToWeekNumber clamps at 52, but the wrap itself has no such limit.
    expect(wrapToRotatorCycle(53, 26)).toBe(1);
    expect(wrapToRotatorCycle(79, 26)).toBe(1);
  });

  it("adapts to a different cycle length (e.g. CSV later extended to 52)", () => {
    expect(wrapToRotatorCycle(52, 52)).toBe(52);
    expect(wrapToRotatorCycle(53, 52)).toBe(1);
  });

  it("returns the week untouched when the table is empty (cycleWeeks <= 0)", () => {
    expect(wrapToRotatorCycle(27, 0)).toBe(27);
    expect(wrapToRotatorCycle(27, -1)).toBe(27);
  });
});
