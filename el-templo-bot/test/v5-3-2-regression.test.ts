/**
 * v5.3.2 milestone regression-lock layer. ONE describe per requirement ID.
 *
 * Per Phase 92 CONTEXT.md, this is the strictly-new behavioural integration
 * layer on top of Phase 89/90/91 source-state tests. Those phase-local
 * tests cover source-state contracts (regex matrices, signal correctness,
 * state-field rollout) and stay untouched; THIS file covers observable
 * outcomes — rendered-prompt regex matrices, raw byte caps, multi-turn
 * handler arcs, and the post-RLOK-04 snapshot byte-equality lock.
 *
 * DO NOT consolidate or migrate prior phase tests here — regression
 * isolation depends on keeping the phase-local files as-is.
 *
 * Discoverability contract: `grep -l v5-3-2 el-templo-bot/test/` answers
 * "is the v5.3.2 milestone locked?" in one command. Future v5.4 milestone
 * follows the same naming convention (`v5-4-regression.test.ts`).
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { getSystemPrompt } from "../src/ai/system-prompt.js";
import { getBusinessKnowledge } from "../src/ai/knowledge.js";
import {
  computeAdvanceSignals,
  hasStageSpecificContent,
  detectSoftRejection,
} from "../src/webhook/handler.js";
import { BASELINE_CHARS } from "./fixtures/pb1-e1a-baseline.js";

const here = dirname(fileURLToPath(import.meta.url));
const SNAP_PATH = resolve(here, "fixtures/pb1-e1a-lead-rendered.snap.txt");

/**
 * Post-RLOK-04 length of the PB1.E1A lead rendered system prompt, measured
 * as `readFileSync(..., 'utf8').length` — i.e. JS-string length (UTF-16
 * code units), NOT raw UTF-8 bytes. The `wc -c` byte-count of the fixture
 * on disk is 18,484 (the file has 209 multi-byte UTF-8 sequences from
 * Spanish accents + em-dashes), but what this test asserts against is the
 * JS string length that `getSystemPrompt(...)` returns.
 *
 * HARDCODED — not read at runtime — so the test fails LOUDLY if the
 * snapshot is regenerated again without an explicit code update alongside
 * the fixture commit. Mirrors the Phase 88 snapshot-tripwire discipline.
 *
 * Fixture on-disk byte-count (wc -c) went 18,291 (Phase 91 baseline) →
 * 18,484 (post-RLOK-04) because the non-numeric prose uses more accented
 * Spanish than the `$80,000 -> $65,000` / `$80,000 por 8 clases` strings
 * it replaced. JS-string length went 18,270 → 18,275 over the same edit.
 *
 * Strengthened to 18,370 during 92-02 live-test (P1 side commit): the
 * "Limites" price-deferral bullet in system-prompt.ts was extended to
 * explicitly forbid mis-using the $20,000 trial as a plan reference and
 * to forbid deducing/estimating plan prices. +95 JS-chars.
 */
const POST_RLOK_04_BYTES = 18370;

const renderE1ALead = (): string =>
  getSystemPrompt({
    clientState: "lead",
    activePlaybook: "PB1",
    currentStage: "E1A",
  });

// ───────────────────────────────────────────────────────────────────────────
// RLOK-01 behavioural integration layer — one describe per requirement ID
// (alphabetical-by-requirement-ID for grep predictability per CONTEXT.md).
// ───────────────────────────────────────────────────────────────────────────

describe("RLOK-01: KFIX-01 behavioural lock — Planes y Precios section absent from PB1 lead render", () => {
  it("rendered PB1.E1A lead prompt does NOT contain 'Planes y Precios' section heading", () => {
    expect(renderE1ALead()).not.toMatch(/Planes y Precios/);
  });

  it("rendered PB1.E1A lead prompt does NOT contain plan-listing heading (KFIX-01 structural contract)", () => {
    // Names like "Flex" appear inside SALES_TECHNIQUES upselling context and
    // inside Boarding Pass renewal copy. The KFIX-01 contract is structural:
    // the plan-listing section heading itself must be absent from the lead
    // render. "Planes Flex" is the fabricated plural a plan-listing heading
    // would use.
    expect(renderE1ALead()).not.toMatch(/Planes Flex/i);
  });
});

describe("RLOK-01: KFIX-02 behavioural lock — zero membership plan price numbers in rendered PB1 lead prompt (post-RLOK-04)", () => {
  it("rendered PB1.E1A lead prompt contains zero matches for $80,000 / $100,000 / $250,000", () => {
    const r = renderE1ALead();
    expect(r.match(/\$80[.,]?000/g) ?? []).toHaveLength(0);
    expect(r.match(/\$100[.,]?000/g) ?? []).toHaveLength(0);
    expect(r.match(/\$250[.,]?000/g) ?? []).toHaveLength(0);
  });

  it("rendered PB1.E1A lead prompt still contains $20,000 (trial-class anchor — KFIX-02 carve-out preserved)", () => {
    const r = renderE1ALead();
    expect((r.match(/\$20[.,]?000/g) ?? []).length).toBeGreaterThanOrEqual(1);
  });
});

describe("RLOK-01: KFIX-03 behavioural lock — Metodo elevator reachable, three team hooks present", () => {
  it("ELEVATOR_TEXT renders BEFORE 'Que es El Templo' section in PB1 lead prompt", () => {
    const r = renderE1ALead();
    const elevatorIdx = r.indexOf("método internacional");
    const queEsIdx = r.indexOf("Que es El Templo");
    expect(elevatorIdx).toBeGreaterThan(-1);
    expect(queEsIdx).toBeGreaterThan(-1);
    expect(elevatorIdx).toBeLessThan(queEsIdx);
  });

  it("ELEVATOR_TEXT contains all three team hooks (exact source wording per knowledge.ts:446)", () => {
    const r = renderE1ALead();
    expect(r).toContain("método internacional");
    expect(r).toMatch(/cuatro niveles simultáneos/);
    expect(r).toMatch(/sin salirte del grupo/);
  });
});

describe("RLOK-01: KFIX-04 behavioural lock — canonical Boarding Pass names BOTH benefits", () => {
  it("rendered PB1.E1A lead prompt contains both BP benefits (clase de prueba 100% bonificada AND precios Zero en primera membresia)", () => {
    const r = renderE1ALead();
    expect(r).toContain("100% bonificada");
    expect(r).toMatch(/precios Zero en la primera membres[ií]a/);
  });

  it("rendered prompt 'dos beneficios:' phrasing appears exactly once (single canonical paragraph)", () => {
    const r = renderE1ALead();
    expect((r.match(/dos beneficios:/g) ?? []).length).toBe(1);
  });
});

describe("RLOK-01: STAGE-01 behavioural lock — category-diversity content gate for PB1.E1A/E1B", () => {
  it("'primera vez' (single category — level) returns false for PB1.E1A", () => {
    expect(hasStageSpecificContent("primera vez", "PB1.E1A")).toBe(false);
  });

  it("'Hola mica soy mati, sería la primera vez' (live-test regression — single category) returns false for PB1.E1A", () => {
    expect(
      hasStageSpecificContent(
        "Hola mica soy mati, sería la primera vez",
        "PB1.E1A",
      ),
    ).toBe(false);
  });

  it("'nunca entrené, quiero arrancar' (level + experience → 2 categories) returns true for PB1.E1A", () => {
    expect(
      hasStageSpecificContent("nunca entrené, quiero arrancar", "PB1.E1A"),
    ).toBe(true);
  });

  it("'hice crossfit hace 2 años' (experience + context + duration → 3 categories) returns true for PB1.E1A", () => {
    expect(
      hasStageSpecificContent("hice crossfit hace 2 años", "PB1.E1A"),
    ).toBe(true);
  });

  it("PB1.E1B uses the same content gate (symmetric to E1A)", () => {
    expect(hasStageSpecificContent("primera vez", "PB1.E1B")).toBe(false);
    expect(hasStageSpecificContent("vengo del gym hace años", "PB1.E1B")).toBe(
      true,
    );
  });
});

describe("RLOK-01: STAGE-02 behavioural lock — AND turn-count gate for PB1.E1A/E1B (idealmente 2-3 preguntas)", () => {
  it("PB1.E1A with rich content but turnCountIncludingThis=1 → discoveryAnswered false (turn-count gate blocks)", () => {
    const sig = computeAdvanceSignals(
      "hice crossfit hace 2 años",
      "ok",
      null,
      "PB1.E1A",
      1,
    );
    expect(sig.discoveryAnswered).toBe(false);
  });

  it("PB1.E1A with rich content + turnCountIncludingThis=2 → discoveryAnswered true", () => {
    const sig = computeAdvanceSignals(
      "hice crossfit hace 2 años",
      "ok",
      null,
      "PB1.E1A",
      2,
    );
    expect(sig.discoveryAnswered).toBe(true);
  });

  it("PB1.E1B mirrors E1A (rich content + turn=1 → false)", () => {
    const sig = computeAdvanceSignals(
      "vengo del gym hace años",
      "ok",
      null,
      "PB1.E1B",
      1,
    );
    expect(sig.discoveryAnswered).toBe(false);
  });

  it("non-E1A/E1B stages ignore the turn-count gate (E2A advances on single content match at turn=1)", () => {
    // E2A gate matches motivation/goals keywords; 'quiero aprender skills'
    // hits both 'quiero' and 'skills' (existing lock from playbook-advance.test.ts:709).
    // Turn-count gate does NOT apply outside E1A/E1B per STAGE-02 scope.
    const sig = computeAdvanceSignals(
      "quiero aprender skills",
      "ok",
      null,
      "PB1.E2A",
      1,
    );
    expect(sig.discoveryAnswered).toBe(true);
  });
});

describe("RLOK-01: OBJN-01 behavioural lock — soft-rejection regex + WHY/BACK-OFF rule injection", () => {
  it("detectSoftRejection matches all 4 live-test variants + composite phrasing", () => {
    expect(detectSoftRejection("no me interesa")).toBe(true);
    expect(detectSoftRejection("no es para mí")).toBe(true);
    expect(detectSoftRejection("no, gracias")).toBe(true);
    expect(detectSoftRejection("me parece que no")).toBe(true);
    // Composite: the composite phrase contains 'no me interesa' as
    // substring → caught by the first branch. Cheap insurance.
    expect(detectSoftRejection("no, en serio no me interesa")).toBe(true);
  });

  it("detectSoftRejection does NOT match hesitation / scheduling phrases", () => {
    expect(detectSoftRejection("no sé")).toBe(false);
    expect(detectSoftRejection("tal vez")).toBe(false);
    expect(detectSoftRejection("dejame pensarlo")).toBe(false);
    // logistics variants — anchored "no creo" STANDALONE-only regex does
    // NOT trip on "no creo que pueda hoy".
    expect(detectSoftRejection("no creo que pueda hoy")).toBe(false);
    expect(detectSoftRejection("no puedo el martes")).toBe(false);
    // "paso" standalone-only → "paso por la sede" does NOT trip.
    expect(detectSoftRejection("paso por la sede mañana")).toBe(false);
  });

  it("getSystemPrompt with softRejectionRule:'why' injects the WHY rule literal", () => {
    const r = getSystemPrompt({
      clientState: "lead",
      activePlaybook: "PB1",
      currentStage: "E1A",
      softRejectionRule: "why",
    });
    expect(r).toContain("REGLA — el lead expresó rechazo");
    // REGLA FUERTE non-regression — PB1.E4 price-defer must not be
    // contradicted by the WHY rule.
    expect(r).toMatch(/NO menciones precios ni planes/);
    // SC#3 — handler must not escape rejection arc to PB5 retention.
    expect(r).toMatch(/NO escales a humano/);
    // SC#1 — goodbye suppression on the WHY turn.
    expect(r).toMatch(/NO te despidas en este turno/);
  });

  it("getSystemPrompt with softRejectionRule:'backoff' injects the BACK-OFF rule literal", () => {
    const r = getSystemPrompt({
      clientState: "lead",
      activePlaybook: "PB1",
      currentStage: "E1A",
      softRejectionRule: "backoff",
    });
    expect(r).toContain("REGLA — back-off después de la WHY");
    // No second WHY on re-confirmed rejection.
    expect(r).toMatch(/NO hagas más preguntas/);
    // No PB2-retention slip into discovery-stage rejection.
    expect(r).toMatch(/NO ofrezcas descuentos/);
  });

  it("baseline render (no softRejectionRule) contains NEITHER rule literal — KGATE-05 invariant", () => {
    const r = renderE1ALead();
    expect(r).not.toContain("REGLA — el lead expresó rechazo");
    expect(r).not.toContain("REGLA — back-off después de la WHY");
  });
});

describe("RLOK-04: $80,000 SALES_TECHNIQUES rhetorical example removed (non-numeric prose anchor in place)", () => {
  it("rendered PB1.E1A lead prompt contains zero matches for the three plan-price numerals ($80k/$100k/$250k)", () => {
    // Per the truth-block regex matrix in 92-01-PLAN.md, RLOK-04 asserts
    // absence of the three plan-price numerals the model historically leaked
    // as factual prices. The pre-existing anchor in OBJECTIONS_SALES item 1
    // ("Es caro" → `~$10,000 por clase guiada`) is a per-class amortisation,
    // NOT a plan price, and is intentionally retained per Phase 91 SUMMARY
    // + CONTEXT.md Task 1 note. The trial-class $20,000 stays as the KFIX-02
    // carve-out.
    const r = renderE1ALead();
    expect(r.match(/\$80[.,]?000/g) ?? []).toHaveLength(0);
    expect(r.match(/\$100[.,]?000/g) ?? []).toHaveLength(0);
    expect(r.match(/\$250[.,]?000/g) ?? []).toHaveLength(0);
  });

  it("rendered prompt contains the non-numeric anclaje wording 'desde el plan más accesible'", () => {
    expect(renderE1ALead()).toContain("desde el plan más accesible");
  });

  it("rendered prompt's only $\\d+ matches are the two retained per-class amounts ($20,000 trial + $10,000 per-class amortisation)", () => {
    // Observable shape: EVERY $\d+ match in the rendered lead prompt is one
    // of the two retained non-plan-price numerals. If anything else slips in
    // (e.g. a new $80k/$65k anclaje example, a $100k Foundation leak), this
    // fails loudly. The $10,000 match is line 361 of knowledge.ts inside
    // OBJECTIONS_SALES item 1 "Es caro" — per-class amortisation, documented
    // as intentionally retained. Narrower than the regex-matrix above.
    //
    // Match pattern: `\$\d+(?:[.,]\d+)*` captures numeric amounts like
    // `$20,000` without greedily consuming a trailing sentence period
    // (`"Clase suelta: $20,000."` would otherwise match as `$20,000.`).
    const r = renderE1ALead();
    const dollarMatches = r.match(/\$\d+(?:[.,]\d+)*/g) ?? [];
    const allowed = /^\$(?:20[.,]?000|10[.,]?000)$/;
    expect(dollarMatches.every((m) => allowed.test(m))).toBe(true);
  });
});

describe("RLOK-01: KGATE-05 dual-threshold raw byte caps (per Phase 89/90 precedent — assert bytes, not floats)", () => {
  it("rendered PB1.E1A lead prompt length ≤ floor(BASELINE_CHARS * 0.8) — ≥20% rendered cap preserved post-RLOK-04", () => {
    const maxAllowed = Math.floor(BASELINE_CHARS * 0.8);
    expect(renderE1ALead().length).toBeLessThanOrEqual(maxAllowed);
  });

  it("lead knowledge block length ≤ floor(full knowledge length * 0.65) — ≥35% knowledge-block cap preserved post-RLOK-04", () => {
    const full = getBusinessKnowledge();
    const lead = getBusinessKnowledge("lead");
    const maxAllowedKnowledge = Math.floor(full.length * 0.65);
    expect(lead.length).toBeLessThanOrEqual(maxAllowedKnowledge);
  });
});

describe("RLOK-02: snapshot byte-equal lock (post-RLOK-04 baseline)", () => {
  it("rendered PB1.E1A lead prompt is byte-equal to the regenerated post-RLOK-04 fixture", () => {
    const expected = readFileSync(SNAP_PATH, "utf8");
    expect(renderE1ALead()).toEqual(expected);
  });

  it("snapshot byte-count equals POST_RLOK_04_BYTES (locked baseline — regen requires explicit code update)", () => {
    const expected = readFileSync(SNAP_PATH, "utf8");
    expect(expected.length).toBe(POST_RLOK_04_BYTES);
  });
});

describe("RLOK-03: live-test gates (referenced from SUMMARY.md transcript — see plan 92-02)", () => {
  // These are intentionally `it.skip` so `pnpm test` reports "4 skipped" — a
  // visible reminder that the four live-test criteria are owned by plan
  // 92-02 and verified inline in the phase SUMMARY. Source-level locks
  // above cover the rendered prompt / handler contracts; the live test
  // confirms the model ACTUALLY honours them in practice per CONTEXT.md
  // RLOK-03 methodology.
  it.skip("price-during-discovery: no plan prices emitted on 'cuánto sale?' at PB1.E1A (see SUMMARY transcript)", () => {});
  it.skip("method question: elevator hooks present on '¿qué es el método?' (see SUMMARY transcript)", () => {});
  it.skip("discovery rejection: WHY turn then BACK-OFF turn on double rejection (see SUMMARY transcript)", () => {});
  it.skip("Boarding Pass dual-benefit: both benefits named when asked 'qué es el Boarding Pass?' (see SUMMARY transcript)", () => {});
});
