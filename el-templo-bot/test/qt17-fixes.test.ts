/**
 * QT17 targeted content-layer fix tests.
 *
 * Covers: accent normalization, Golden Rule 12 amendment, CTA rule removal,
 * returning-conversation guard, off-topic block, and zone mapping.
 */

import { describe, it, expect } from "vitest";
import { getBusinessKnowledge } from "../src/ai/knowledge.js";
import { getSystemPrompt } from "../src/ai/system-prompt.js";
import { PLAYBOOKS } from "../src/playbooks/definitions.js";
import { shouldInjectReturningNote } from "../src/webhook/handler.js";

// ─── Fix 1: Accent normalization ─────────────────────────────────────────────

describe("QT17 Fix 1: Accent normalization in knowledge", () => {
  const knowledge = getBusinessKnowledge();

  it("contains no unaccented rioplatense verb forms in string content", () => {
    // These forms must always be accented in rioplatense Spanish
    const unaccented =
      /\b(queres|podes|tenes|estes|sentis|vivis|venis|salis)\b/;
    expect(unaccented.test(knowledge)).toBe(false);
  });

  it("contains accented forms instead", () => {
    expect(knowledge).toContain("querés");
    expect(knowledge).toContain("podés");
  });
});

// ─── Fix 2A: Golden Rule 12 amendment ────────────────────────────────────────

describe("QT17 Fix 2A: Golden Rule 12 updated", () => {
  const knowledge = getBusinessKnowledge();

  it("contains the new conditional CTA phrasing", () => {
    expect(knowledge).toContain("CTA va una sola vez por tema");
  });

  it("no longer contains the old unconditional rule", () => {
    expect(knowledge).not.toContain(
      "Siempre cerrar con una pregunta o call to action suave",
    );
  });
});

// ─── Fix 2B: CTA rule removal from definitions ──────────────────────────────

describe("QT17 Fix 2B: CTA repetition rule removed from PB1 stages", () => {
  it("PB1.E2A promptSection does not contain 'no pushear el CTA'", () => {
    const e2a = PLAYBOOKS.PB1.stages.find((s) => s.id === "PB1.E2A");
    expect(e2a).toBeDefined();
    expect(e2a!.promptSection).not.toContain("no pushear el CTA");
  });

  it("PB1.E2B promptSection does not contain 'no pushear el CTA'", () => {
    const e2b = PLAYBOOKS.PB1.stages.find((s) => s.id === "PB1.E2B");
    expect(e2b).toBeDefined();
    expect(e2b!.promptSection).not.toContain("no pushear el CTA");
  });
});

// ─── Fix 3: Returning-conversation guard ─────────────────────────────────────

describe("QT17 Fix 3: shouldInjectReturningNote", () => {
  it("returns false for empty history", () => {
    expect(shouldInjectReturningNote([])).toBe(false);
  });

  it("returns false for inbound-only history", () => {
    expect(shouldInjectReturningNote([{ message_direction: "inbound" }])).toBe(
      false,
    );
  });

  it("returns true when history contains outbound_bot", () => {
    expect(
      shouldInjectReturningNote([
        { message_direction: "inbound" },
        { message_direction: "outbound_bot" },
      ]),
    ).toBe(true);
  });

  it("returns true when history contains outbound_human", () => {
    expect(
      shouldInjectReturningNote([
        { message_direction: "inbound" },
        { message_direction: "outbound_human" },
      ]),
    ).toBe(true);
  });

  it("returns true with mixed directions including outbound_bot", () => {
    expect(
      shouldInjectReturningNote([
        { message_direction: "inbound" },
        { message_direction: "outbound_bot" },
        { message_direction: "inbound" },
      ]),
    ).toBe(true);
  });
});

// ─── Fix 4: Off-topic block ──────────────────────────────────────────────────

describe("QT17 Fix 4: Off-topic catch-all in system prompt", () => {
  const prompt = getSystemPrompt();

  it("contains the off-topic section header", () => {
    expect(prompt).toContain("Mensajes fuera de tema");
  });

  it("contains the humor example", () => {
    expect(prompt).toContain("no cocino pero entreno");
  });

  it("contains the flirteo redirect", () => {
    expect(prompt).toContain("mejor recomendando clases");
  });

  it("contains the aggression escalation", () => {
    expect(prompt).toContain("escalo con request_human");
  });

  it("contains the emergency number", () => {
    expect(prompt).toContain("107");
  });
});

// ─── Fix 5: Zone mapping ────────────────────────────────────────────────────

describe("QT17 Fix 5: Zone-to-branch mapping", () => {
  const knowledge = getBusinessKnowledge();

  it("contains the zone reference section header", () => {
    expect(knowledge).toContain("Referencia de zonas");
  });

  it("maps Mogotes to Mario Bravo", () => {
    expect(knowledge).toContain("Mogotes");
    expect(knowledge).toMatch(/Mogotes[\s\S]*?Mario Bravo 618/);
  });

  it("maps Puerto / La Perla to Constitución", () => {
    expect(knowledge).toContain("Puerto / La Perla");
    expect(knowledge).toContain("Constitución 6745");
  });

  it("maps Centro to Jujuy and Moreno", () => {
    expect(knowledge).toMatch(/Centro[\s\S]*?Jujuy 3761/);
    expect(knowledge).toMatch(/Centro[\s\S]*?Moreno 3751/);
  });

  it("includes fallback instruction for unknown zones", () => {
    expect(knowledge).toContain(
      "preguntale por una referencia cercana antes de sugerir una sede",
    );
  });
});
