/**
 * v5.3.3 Phase 100 TRIG-01 — widened `detectPriceObjection` unit fixture.
 *
 * Data-driven test that runs each fixture entry through the
 * `detectPriceObjection` helper exported from `el-templo-bot/src/webhook/handler.ts`.
 * The helper expects pre-lowercased input (matches the original inline
 * `inboundLower = inboundText.toLowerCase()` pattern in `computeAdvanceSignals`).
 *
 * RED-first (TDD) authoring discipline:
 *  - This file is authored BEFORE the Task 2 regex widening lands.
 *  - On master at plan-amendment time, ~10 of the ~20 positive cases below
 *    FAIL (the Phase 100 widening cases — plural `precios`, `cuánto cuesta`,
 *    `cuánto vale`, `valor`, `tarifa`, `cuota`, `mensualidad`, etc.).
 *  - After Task 2 ships the widened regex, ALL fixture cases PASS.
 *  - Expected RED count on master: ~10 of the ~20 positive cases. After Task 2:
 *    0 failures.
 *
 * Fixture shape: `Array<{ phrase: string; shouldMatch: boolean; rationale: string }>`.
 * Each test name embeds the phrase + rationale so failures point straight at the
 * gap. Negative cases lock down `\b` word-boundary discipline — adversarial
 * phrases like "preciosa idea", "valoro la propuesta", and "cuántos años tenés"
 * must NOT match.
 *
 * **Important note on `sin precio fijo de antemano`** — this IS a valid match.
 * `precio` is a whole word in that phrase; the lead is mentioning price as a
 * topic. Asserted shouldMatch=true with the rationale calling this out
 * explicitly. (Plan must_have truth #2.)
 *
 * **Important note on `valor` boundary:** the widened regex `\bvalor(es)?\b`
 * requires a word boundary AFTER `valor` or `valores`. In "valoro", `valor` is
 * followed by `o` (a word character), so `\b` after `valor` fails. The negative
 * test for "valoro la propuesta" locks this.
 */

import { describe, it, expect } from "vitest";
import { detectPriceObjection } from "../src/webhook/handler";

interface PriceTriggerFixture {
  phrase: string;
  shouldMatch: boolean;
  rationale: string;
}

const PRICE_TRIGGER_FIXTURES: PriceTriggerFixture[] = [
  // ── Positive — Pre-Phase-100 baseline (must still match after widening) ───
  {
    phrase: "es caro",
    shouldMatch: true,
    rationale: "Pre-Phase-100 baseline — `caro` whole word",
  },
  {
    phrase: "carisimo!",
    shouldMatch: true,
    rationale: "Pre-Phase-100 baseline — `carisimo` no accent",
  },
  {
    phrase: "carísimo",
    shouldMatch: true,
    rationale: "Pre-Phase-100 baseline — `carísimo` accented variant",
  },
  {
    phrase: "no me alcanza",
    shouldMatch: true,
    rationale: "Pre-Phase-100 baseline — affordability complaint",
  },
  {
    phrase: "no puedo pagar",
    shouldMatch: true,
    rationale: "Pre-Phase-100 baseline — affordability complaint",
  },
  {
    phrase: "muy caro",
    shouldMatch: true,
    rationale: "Pre-Phase-100 baseline — intensified objection",
  },
  {
    phrase: "es barato",
    shouldMatch: true,
    rationale: "Pre-Phase-100 baseline — opposite-pole price comment",
  },
  {
    phrase: "hay descuento?",
    shouldMatch: true,
    rationale: "Pre-Phase-100 baseline — discount question",
  },
  {
    phrase: "el precio",
    shouldMatch: true,
    rationale: "Pre-Phase-100 baseline — singular `precio`",
  },

  // ── Positive — Phase 100 widening (these FAIL on master before Task 2) ───
  {
    phrase: "los precios",
    shouldMatch: true,
    rationale: "Phase 100 widen — plural `precios`",
  },
  {
    phrase: "¿cuánto cuesta?",
    shouldMatch: true,
    rationale: "Phase 100 widen — PRIMARY live-test gap (question form)",
  },
  {
    phrase: "cuanto cuesta",
    shouldMatch: true,
    rationale: "Phase 100 widen — no accent + no question mark",
  },
  {
    phrase: "¿cuánto sale?",
    shouldMatch: true,
    rationale: "Phase 100 widen — `cuánto sale` question",
  },
  {
    phrase: "¿cuánto vale?",
    shouldMatch: true,
    rationale: "Phase 100 widen — `cuánto vale` question",
  },
  {
    phrase: "cuanto vale",
    shouldMatch: true,
    rationale: "Phase 100 widen — `cuanto vale` no accent",
  },
  {
    phrase: "el valor",
    shouldMatch: true,
    rationale: "Phase 100 widen — singular `valor`",
  },
  {
    phrase: "los valores",
    shouldMatch: true,
    rationale: "Phase 100 widen — plural `valores`",
  },
  {
    phrase: "qué tarifa tienen",
    shouldMatch: true,
    rationale: "Phase 100 widen — `tarifa` question",
  },
  {
    phrase: "la cuota mensual",
    shouldMatch: true,
    rationale: "Phase 100 widen — `cuota` price-shaped term",
  },
  {
    phrase: "cuánto sale la mensualidad",
    shouldMatch: true,
    rationale:
      "Phase 100 widen — compound: `cuánto sale` + `mensualidad` (both new)",
  },
  {
    phrase: "sin precio fijo de antemano",
    shouldMatch: true,
    rationale:
      "Valid match — `precio` is a whole word here; lead is mentioning price as a topic. (Plan truth #2.)",
  },

  // ── Negative — word-boundary adversarial cases ────────────────────────────
  {
    phrase: "preciosa idea",
    shouldMatch: false,
    rationale:
      "Word-boundary negative — `\\b` should exclude (`preciosa` is one word, not `precios` + boundary)",
  },
  {
    phrase: "preciosos paisajes",
    shouldMatch: false,
    rationale:
      "Word-boundary negative — `preciosos` is one word, not `precios` + boundary",
  },
  {
    phrase: "hola buenas",
    shouldMatch: false,
    rationale: "Negative — no price terms whatsoever",
  },
  {
    phrase: "tengo una lesión",
    shouldMatch: false,
    rationale: "Negative — unrelated topic (injury)",
  },
  {
    phrase: "cuántos años tenés",
    shouldMatch: false,
    rationale:
      "Negative — `cuántos` not followed by `sale|cuesta|vale`; regex requires the bigram",
  },
  {
    phrase: "valoro la propuesta",
    shouldMatch: false,
    rationale:
      "Word-boundary negative — `valoro` is one word; `\\bvalor(es)?\\b` requires boundary after `valor` (followed by `o` in `valoro` → boundary fails)",
  },
];

describe("v5.3.3 Phase 100 TRIG-01 — widened detectPriceObjection", () => {
  it("exports detectPriceObjection as a function (defensive import-shape check)", () => {
    expect(typeof detectPriceObjection).toBe("function");
  });

  describe("Positive cases (shouldMatch=true)", () => {
    const positives = PRICE_TRIGGER_FIXTURES.filter((f) => f.shouldMatch);
    it.each(positives)(
      'matches "$phrase" — $rationale',
      ({ phrase, shouldMatch }) => {
        expect(detectPriceObjection(phrase.toLowerCase())).toBe(shouldMatch);
      },
    );
  });

  describe("Negative cases (shouldMatch=false) — word-boundary discipline", () => {
    const negatives = PRICE_TRIGGER_FIXTURES.filter((f) => !f.shouldMatch);
    it.each(negatives)(
      'does NOT match "$phrase" — $rationale',
      ({ phrase, shouldMatch }) => {
        expect(detectPriceObjection(phrase.toLowerCase())).toBe(shouldMatch);
      },
    );
  });
});
