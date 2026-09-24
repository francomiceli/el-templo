/**
 * Unit tests for shared phone helper module.
 *
 * Pure function — no DB, no server context needed.
 * Covers AR mobile convention (last 10 digits) and edge cases.
 */

import { describe, it, expect } from "vitest";
import { normalizePhone, normalizePhoneE164 } from "../../src/modules/shared/phone";

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

describe("normalizePhoneE164 (módulo de Renovaciones — botón WhatsApp)", () => {
  it("AR: 10 dígitos nacionales → +549 + número", () => {
    expect(normalizePhoneE164("1123456789", "AR")).toBe("+5491123456789");
  });

  it("AR: formato con espacios/guiones/paréntesis se normaliza igual", () => {
    expect(normalizePhoneE164("(011) 2345-6789", "AR")).toBe("+5491123456789");
  });

  it("ES: 9 dígitos nacionales → +34 + número", () => {
    expect(normalizePhoneE164("612345678", "ES")).toBe("+34612345678");
  });

  it("respeta un '+' explícito tal cual (solo limpia separadores)", () => {
    expect(normalizePhoneE164("+54 9 11 2345-6789", "AR")).toBe("+5491123456789");
    expect(normalizePhoneE164("+34 612 345 678", "ES")).toBe("+34612345678");
  });

  it("respeta un 549/54 ya presente sin '+' (no vuelve a anteponer 549)", () => {
    expect(normalizePhoneE164("5491123456789", "AR")).toBe("+5491123456789");
    expect(normalizePhoneE164("541123456789", "AR")).toBe("+541123456789");
  });

  it("largo inválido para el país de la sede → null", () => {
    expect(normalizePhoneE164("12345", "AR")).toBeNull();
    expect(normalizePhoneE164("123456789012", "ES")).toBeNull();
  });

  it("teléfono null o vacío → null", () => {
    expect(normalizePhoneE164(null, "AR")).toBeNull();
    expect(normalizePhoneE164("", "AR")).toBeNull();
    expect(normalizePhoneE164("   ", "AR")).toBeNull();
  });

  it("sin dígitos → null", () => {
    expect(normalizePhoneE164("abc", "AR")).toBeNull();
  });

  it("un número de 9 dígitos en sede AR (no matchea 10) → null", () => {
    expect(normalizePhoneE164("123456789", "AR")).toBeNull();
  });
});
