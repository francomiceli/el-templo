/**
 * v5.3.3 Phase 96 — CTXT-01 + CTXT-02 closure + (iii) Sunday=0 carry-forward
 * + Finding #4 markdown-fence extraction hardening.
 *
 * SIX test scenarios per 96-CONTEXT.md D-15 + D-16:
 *   T1: CTXT rule present in rendered prompt — closes CTXT-01.
 *   T2: CTXT rule does NOT collide with SOFT_REJECTION fixtures — D-05 SC#3 guardrail.
 *   T3: parseExtractionResponse handles bare + fenced + malformed — closes CTXT-02 / Finding #4.
 *   T4: parseExtractionResponse regression-protector for current skip semantics.
 *   T5: (iii) Sunday=0 directive locked in rendered prompt — full shape (regression-protector).
 *   T6: BUG-04 forensic-fixture replay — profileContext: 'Nombre: Mati' empirical anchor.
 *
 * TDD discipline (D-19): all 6 tests authored RED-against-master HEAD `6aee0286`
 * and observed FAIL before Plan 96-01 GREEN commit lands. Pre-existing (iii) RED
 * at `v5-3-3-booking-reliability.test.ts:55` STILL RED at the RED-commit point.
 *
 * Per `el-templo-bot/CLAUDE.md` Standards: no console logging, no `any` types,
 * `catch (err: unknown)` with `instanceof Error` narrowing.
 *
 * Note: T2 uses `softRejectionRule` (the actual SystemPromptOptions field name)
 * — the plan referenced `softRejectionState` but the live API is `softRejectionRule`
 * (Rule 3 blocking-issue auto-fix; without this T2 would not exercise SOFT_REJECTION).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// ────────────────────────────────────────────────────────────────────────────
// T1 — CTXT rule present in rendered prompt (D-16 #1 — closes CTXT-01)
// ────────────────────────────────────────────────────────────────────────────

describe("CTXT-01 — *Datos ya provistos:* rule present in rendered prompt", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("rendered PB1.E1A lead prompt contains the *Datos ya provistos:* CTXT rule", async () => {
    const mod = await import("../src/ai/system-prompt");
    const prompt = mod.getSystemPrompt({
      clientState: "lead",
      activePlaybook: "PB1",
      currentStage: "E1A",
    });
    expect(prompt).toMatch(/Datos ya provistos:\*?\s+nunca re-preguntes/i);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// T2 — CTXT rule co-exists with SOFT_REJECTION (D-05 SC#3 guardrail, D-16 #2)
// ────────────────────────────────────────────────────────────────────────────

describe("D-05 SC#3 guardrail — CTXT rule co-exists with SOFT_REJECTION fixtures", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it.each([["why" as const], ["backoff" as const]])(
    "rendered prompt with softRejectionRule=%s contains BOTH CTXT rule and SOFT_REJECTION rule, on separate lines",
    async (state) => {
      const mod = await import("../src/ai/system-prompt");
      const prompt = mod.getSystemPrompt({
        clientState: "lead",
        activePlaybook: "PB1",
        currentStage: "E1A",
        softRejectionRule: state,
      });

      // CTXT-rule marker (D-03 — closes CTXT-01).
      expect(prompt).toContain("*Datos ya provistos:*");

      // SOFT_REJECTION-rule marker (verified against system-prompt.ts:70 / :79).
      // Both WHY and BACKOFF rule constants start with `*REGLA — el lead`.
      expect(prompt).toMatch(/\*REGLA — el lead/);

      // Same-line collision guard — assert CTXT and SOFT_REJECTION rules
      // render on DISTINCT lines (D-05 SC#3 invariant; Phase 97 RGUARD-02
      // will extend this to milestone-suite level).
      const lines = prompt.split("\n");
      const ctxtIdx = lines.findIndex((l) =>
        l.includes("*Datos ya provistos:*"),
      );
      const softIdx = lines.findIndex((l) => /\*REGLA — el lead/.test(l));
      expect(ctxtIdx).toBeGreaterThanOrEqual(0);
      expect(softIdx).toBeGreaterThanOrEqual(0);
      expect(ctxtIdx).not.toBe(softIdx);
    },
  );
});

// ────────────────────────────────────────────────────────────────────────────
// T3 — parseExtractionResponse handles bare + fenced + malformed
// (D-12, D-13, D-16 #3 — closes CTXT-02 / Finding #4)
// ────────────────────────────────────────────────────────────────────────────

describe("CTXT-02 — parseExtractionResponse handles bare + fenced + malformed", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it.each([
    ["bare JSON", '{"name":"Mati"}', { name: "Mati" }],
    [
      "fenced with language tag",
      '```json\n{"name":"Mati"}\n```',
      { name: "Mati" },
    ],
    [
      "fenced without language tag",
      '```\n{"name":"Mati"}\n```',
      { name: "Mati" },
    ],
  ])("parses %s into expected object", async (_label, input, expected) => {
    const mod = await import("../src/webhook/handler");
    const result = mod.parseExtractionResponse(input);
    expect(result).toEqual(expected);
  });

  it('returns null on truly malformed content ("not json")', async () => {
    const mod = await import("../src/webhook/handler");
    expect(mod.parseExtractionResponse('"not json"')).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// T4 — parseExtractionResponse regression-protector for skip semantics
// (D-16 #4 — locks the conservative behavioral boundary)
// ────────────────────────────────────────────────────────────────────────────

describe("CTXT-02 — parseExtractionResponse regression-protector for skip semantics", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it.each([
    ["empty string", ""],
    ["single brace", "{"],
  ])("returns null for %s (NEVER throws)", async (_label, input) => {
    const mod = await import("../src/webhook/handler");
    expect(() => mod.parseExtractionResponse(input)).not.toThrow();
    expect(mod.parseExtractionResponse(input)).toBeNull();
  });

  it("does NOT throw on JSON array input (returns null OR the array, but NEVER throws)", async () => {
    const mod = await import("../src/webhook/handler");
    expect(() => mod.parseExtractionResponse("[1,2,3]")).not.toThrow();
    const result = mod.parseExtractionResponse("[1,2,3]");
    // Claude's Discretion (D-14): helper either narrows to object-shape (returns null)
    // OR returns the array. Test asserts WHICHEVER behavior is implemented; the
    // critical contract is "never throws". This test pins the conservative boundary.
    expect(result === null || Array.isArray(result)).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// T5 — Sunday=0 directive locked in rendered prompt (FULL shape regression-protector)
// (D-16 #5 — complements the alternation regex in v5-3-3-booking-reliability.test.ts:55)
// ────────────────────────────────────────────────────────────────────────────

describe("(iii) Sunday=0 directive locked in rendered prompt (FULL shape regression-protector)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("rendered prompt contains the full *Convención:* directive — 0=domingo, 1=lunes, 6=sábado", async () => {
    const mod = await import("../src/ai/system-prompt");
    const prompt = mod.getSystemPrompt();
    expect(prompt).toMatch(/\*Convención:\*.*0=domingo.*1=lunes.*6=sábado/);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// T6 — BUG-04 forensic-fixture replay (D-16 #6 — empirical anchor)
// NOTE: asserts prompt ASSEMBLY (rule presence + profileContext injection).
// Model behavior (does the rule actually shift re-ask frequency?) is Phase 97
// RGUARD-01's RLOK-03 territory — empirical live-test gate, NOT this plan's scope.
// ────────────────────────────────────────────────────────────────────────────

describe("BUG-04 forensic-fixture replay — profileContext='Nombre: Mati' empirical anchor", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("rendered prompt with profileContext='Nombre: Mati' contains BOTH the CTXT rule AND the profile-context line", async () => {
    const mod = await import("../src/ai/system-prompt");
    const prompt = mod.getSystemPrompt({
      clientState: "lead",
      activePlaybook: "PB1",
      currentStage: "E1A",
      profileContext: "Nombre: Mati",
    });
    expect(prompt).toContain("*Datos ya provistos:*");
    expect(prompt).toContain("Nombre: Mati");
  });
});
