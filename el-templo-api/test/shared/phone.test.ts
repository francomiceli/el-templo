/**
 * Unit tests for shared phone helper module.
 *
 * Pure function — no DB, no server context needed.
 * Covers AR mobile convention (last 10 digits) and edge cases.
 */

import { describe, it, expect } from "vitest";
import { normalizePhone } from "../../src/modules/shared/phone";

describe("normalizePhone", () => {
  it("strips spaces, plus sign, and country code from full E.164 AR mobile", () => {
    expect(normalizePhone("+54 223 661 4406")).toBe("2236614406");
  });

  it("strips parentheses, hyphens, and leading 0 from AR landline-style format", () => {
    expect(normalizePhone("(0223) 661-4406")).toBe("2236614406");
  });

  it("returns already-normalized 10-digit input unchanged", () => {
    expect(normalizePhone("2236614406")).toBe("2236614406");
  });

  it("returns empty string for empty input", () => {
    expect(normalizePhone("")).toBe("");
  });

  it("passes through fewer-than-10 digits without padding (slice(-10) is no-op)", () => {
    expect(normalizePhone("123")).toBe("123");
  });

  it("keeps only the last 10 digits when input has more than 10", () => {
    expect(normalizePhone("12345678901234567890")).toBe("1234567890");
  });

  it("returns empty string when input has no digits", () => {
    expect(normalizePhone("abc")).toBe("");
  });
});
