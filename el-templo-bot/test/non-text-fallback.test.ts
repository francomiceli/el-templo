/**
 * Unit tests for non-text message fallback (quick-16 fix 3).
 *
 * Exercises `getNonTextFallback` in isolation. No full webhook integration
 * test — the helper is pure and the handler wire-up is trivial.
 */

import { describe, it, expect } from "vitest";
import { getNonTextFallback } from "../src/webhook/handler";

describe("getNonTextFallback (quick-16 fix 3)", () => {
  it("audio fallback mentions audio and asks to write", () => {
    const msg = getNonTextFallback("audio");
    expect(msg).toMatch(/audio/i);
    expect(msg).toMatch(/escrib/i);
  });

  it("image fallback mentions image and prompts for text", () => {
    const msg = getNonTextFallback("image");
    expect(msg.toLowerCase()).toContain("imagen");
  });

  it("video fallback is a non-empty string", () => {
    const msg = getNonTextFallback("video");
    expect(typeof msg).toBe("string");
    expect(msg.length).toBeGreaterThan(10);
  });

  it("document fallback is a non-empty string", () => {
    const msg = getNonTextFallback("document");
    expect(typeof msg).toBe("string");
    expect(msg.length).toBeGreaterThan(10);
  });

  it("location fallback mentions ubicación", () => {
    const msg = getNonTextFallback("location");
    expect(msg.toLowerCase()).toContain("ubicaci");
  });

  it("sticker (unknown type) returns the default fallback", () => {
    const msg = getNonTextFallback("sticker");
    expect(typeof msg).toBe("string");
    expect(msg.length).toBeGreaterThan(10);
    expect(msg).toMatch(/texto/i);
  });

  it("unknown type returns the default fallback", () => {
    const msg = getNonTextFallback("some-weird-type");
    expect(msg).toMatch(/texto/i);
  });
});
