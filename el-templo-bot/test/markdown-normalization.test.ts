/**
 * Unit tests for WhatsApp markdown normalization (quick-16 fix 1).
 *
 * Covers both `stripMarkdownHeaders` (existing behavior, preserved) and
 * `normalizeWhatsAppFormatting` (new: `**bold**` → `*bold*`).
 */

import { describe, it, expect } from "vitest";
import {
  stripMarkdownHeaders,
  normalizeWhatsAppFormatting,
} from "../src/webhook/handler";

describe("normalizeWhatsAppFormatting (quick-16 fix 1)", () => {
  it("converts simple **bold** to *bold*", () => {
    expect(normalizeWhatsAppFormatting("**Fuerza y Técnica**")).toBe(
      "*Fuerza y Técnica*",
    );
  });

  it("converts **label** followed by colon", () => {
    expect(normalizeWhatsAppFormatting("**Duración**: 60 minutos")).toBe(
      "*Duración*: 60 minutos",
    );
  });

  it("converts **label** inside a bullet line", () => {
    expect(
      normalizeWhatsAppFormatting("- **Multinivel**: apto para todos"),
    ).toBe("- *Multinivel*: apto para todos");
  });

  it("converts adjacent **bold** **bold** pairs", () => {
    expect(normalizeWhatsAppFormatting("**word** **word**")).toBe(
      "*word* *word*",
    );
  });

  it("converts **bold** nested inside a sentence", () => {
    expect(normalizeWhatsAppFormatting("algo **importante** acá")).toBe(
      "algo *importante* acá",
    );
  });

  it("does not touch legitimate single-asterisk WhatsApp bold", () => {
    expect(normalizeWhatsAppFormatting("*already bold*")).toBe(
      "*already bold*",
    );
  });

  it("leaves text without any asterisks unchanged", () => {
    expect(normalizeWhatsAppFormatting("Plain text here.")).toBe(
      "Plain text here.",
    );
  });

  it("handles multi-line text with multiple conversions", () => {
    const input = "**Título**\nline one\n- **Clave**: valor";
    const expected = "*Título*\nline one\n- *Clave*: valor";
    expect(normalizeWhatsAppFormatting(input)).toBe(expected);
  });
});

describe("stripMarkdownHeaders (preserved behavior)", () => {
  it("converts ### Header to *Header*", () => {
    expect(stripMarkdownHeaders("### Header")).toBe("*Header*");
  });

  it("converts ## and ### headers", () => {
    expect(stripMarkdownHeaders("## Precios\n### Flex")).toBe(
      "*Precios*\n*Flex*",
    );
  });

  it("leaves plain text unchanged", () => {
    expect(stripMarkdownHeaders("Normal text")).toBe("Normal text");
  });
});
