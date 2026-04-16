/**
 * Tests for the playbook injection contract in `getSystemPrompt`.
 *
 * The single most important invariant of phase 82 (PBENG-05): when a
 * playbook is active, the rendered system prompt contains EXACTLY ONE
 * playbook section header, and the OTHER FOUR playbooks are absent from
 * the output. These tests grep-assert that property across all five
 * playbooks and also cover the no-playbook fallback + degenerate inputs.
 *
 * Distinctive-phrase fixtures are read directly from `PLAYBOOKS` so the
 * tests stay in sync with `definitions.ts` — never hardcoded inline.
 */

import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

import { getSystemPrompt } from "../src/ai/system-prompt.js";
import { PLAYBOOKS } from "../src/playbooks/index.js";
import type { PlaybookId, StageId } from "../src/playbooks/types.js";

const ALL_PLAYBOOKS: PlaybookId[] = ["PB1", "PB2", "PB3", "PB4", "PB5"];

/**
 * For each playbook, derive a "distinctive phrase" from its entry stage's
 * promptSection: a 25-char substring that does NOT appear in any other
 * playbook's full text. This is what we grep for in the cross-checks.
 *
 * If a future definition edit accidentally introduces overlap, this helper
 * will throw at test load — that's intentional, it surfaces the regression
 * immediately rather than producing a flaky assertion.
 */
function buildDistinctivePhrases(): Record<PlaybookId, string> {
  const fullTexts: Record<PlaybookId, string> = {} as Record<
    PlaybookId,
    string
  >;
  for (const id of ALL_PLAYBOOKS) {
    fullTexts[id] = PLAYBOOKS[id].stages.map((s) => s.promptSection).join("\n");
  }

  const phrases: Record<PlaybookId, string> = {} as Record<PlaybookId, string>;
  for (const id of ALL_PLAYBOOKS) {
    const entry = PLAYBOOKS[id].stages.find(
      (s) => s.id === PLAYBOOKS[id].entryStageId,
    );
    if (!entry) {
      throw new Error(`No entry stage found for ${id}`);
    }
    const text = entry.promptSection;
    // Slide a 25-char window across the entry stage and pick the first
    // window that does not appear in any OTHER playbook's combined text.
    const WINDOW = 25;
    let found: string | null = null;
    for (let i = 0; i + WINDOW <= text.length; i++) {
      const candidate = text.slice(i, i + WINDOW);
      const otherIds = ALL_PLAYBOOKS.filter((other) => other !== id);
      const overlaps = otherIds.some((other) =>
        fullTexts[other].includes(candidate),
      );
      if (!overlaps) {
        found = candidate;
        break;
      }
    }
    if (found === null) {
      throw new Error(
        `No distinctive 25-char phrase found in ${id} entry stage`,
      );
    }
    phrases[id] = found;
  }
  return phrases;
}

const DISTINCTIVE = buildDistinctivePhrases();

describe("getSystemPrompt — playbook injection (PBENG-05)", () => {
  describe("single-section invariant", () => {
    it("PB1 lead renders exactly one playbook section header", () => {
      const out = getSystemPrompt({
        clientState: "lead",
        activePlaybook: "PB1",
        currentStage: "PB1.E2A",
      });
      const matches = out.match(/\*Playbook activo:/g) ?? [];
      expect(matches.length).toBe(1);
      expect(out).toContain("*Playbook activo: PB1 (PB1.E2A)*");
    });

    it("does not render any of the other four playbook headers", () => {
      const out = getSystemPrompt({
        clientState: "lead",
        activePlaybook: "PB1",
        currentStage: "PB1.E2A",
      });
      expect(out).not.toContain("Playbook activo: PB2");
      expect(out).not.toContain("Playbook activo: PB3");
      expect(out).not.toContain("Playbook activo: PB4");
      expect(out).not.toContain("Playbook activo: PB5");
    });

    it("renders exactly one header for each of the five playbooks", () => {
      for (const id of ALL_PLAYBOOKS) {
        const entryStage = PLAYBOOKS[id].entryStageId;
        const out = getSystemPrompt({
          clientState: "lead",
          activePlaybook: id,
          currentStage: entryStage,
        });
        const matches = out.match(/\*Playbook activo:/g) ?? [];
        expect(matches.length, `${id} should render exactly one section`).toBe(
          1,
        );
        expect(out).toContain(`*Playbook activo: ${id} (${entryStage})*`);
      }
    });
  });

  describe("other playbooks absent (content check)", () => {
    it("rotating across all 5 playbooks: only the active one's distinctive phrase appears", () => {
      for (const activeId of ALL_PLAYBOOKS) {
        const out = getSystemPrompt({
          clientState: "lead",
          activePlaybook: activeId,
          currentStage: PLAYBOOKS[activeId].entryStageId,
        });

        // Active playbook's distinctive phrase is present
        expect(
          out,
          `${activeId} active: own distinctive phrase should be present`,
        ).toContain(DISTINCTIVE[activeId]);

        // The other four distinctive phrases are absent
        for (const otherId of ALL_PLAYBOOKS) {
          if (otherId === activeId) continue;
          expect(
            out,
            `${activeId} active: ${otherId} distinctive phrase must be absent`,
          ).not.toContain(DISTINCTIVE[otherId]);
        }
      }
    });
  });

  describe("stage-specific content", () => {
    it("injects the active stage's promptSection text verbatim", () => {
      const stage = PLAYBOOKS.PB1.stages.find((s) => s.id === "PB1.E2A");
      expect(stage).toBeDefined();
      const promptSection = stage!.promptSection;
      const out = getSystemPrompt({
        clientState: "lead",
        activePlaybook: "PB1",
        currentStage: "PB1.E2A",
      });
      // Check at least the first 20 chars to be robust to the surrounding
      // header / directive while still asserting the verbatim text.
      expect(out).toContain(promptSection.slice(0, 20));
      expect(out).toContain(promptSection);
    });

    it("PB1.E3 contains E3 text and not E2A text (when they differ)", () => {
      const e2a = PLAYBOOKS.PB1.stages.find((s) => s.id === "PB1.E2A")!;
      const e3 = PLAYBOOKS.PB1.stages.find((s) => s.id === "PB1.E3")!;
      // Sanity: the two stages should have different prompt sections.
      expect(e2a.promptSection).not.toBe(e3.promptSection);

      const out = getSystemPrompt({
        clientState: "lead",
        activePlaybook: "PB1",
        currentStage: "PB1.E3",
      });
      expect(out).toContain(e3.promptSection);
      // Use a meaningful unique substring of E2A (its second sentence)
      // to avoid accidental overlap on connector words.
      const e2aUnique = "ponerte en forma";
      expect(e2a.promptSection).toContain(e2aUnique);
      expect(out).not.toContain(e2aUnique);
    });
  });

  describe("no-playbook fallback (backward compatibility)", () => {
    it("renders no playbook section when activePlaybook is omitted", () => {
      const out = getSystemPrompt({ clientState: "active_member" });
      expect(out.match(/\*Playbook activo:/g)).toBeNull();
    });

    it("preserves the existing STATE_SECTIONS line for active_member", () => {
      const out = getSystemPrompt({ clientState: "active_member" });
      // From STATE_SECTIONS in src/ai/system-prompt.ts
      expect(out).toContain("miembro activo");
      expect(out).toContain("Tratala con familiaridad");
    });

    it("output equals v5.2 output when activePlaybook is null", () => {
      const v52 = getSystemPrompt({ clientState: "lead" });
      const withNull = getSystemPrompt({
        clientState: "lead",
        activePlaybook: null,
        currentStage: null,
      });
      expect(withNull).toBe(v52);
    });
  });

  describe("meta-identity handling (quick 14, P0-2)", () => {
    it("base prompt contains meta-identity handling instructions", () => {
      const out = getSystemPrompt({});
      expect(out).toContain("Preguntas sobre mi identidad");
      expect(out).toContain("NUNCA confirmo ni niego ser IA");
    });
  });

  describe("graceful degradation on degenerate inputs", () => {
    it("unknown playbook id does not throw and renders no playbook section", () => {
      const out = getSystemPrompt({
        clientState: "lead",
        activePlaybook: "PB99" as PlaybookId,
        currentStage: "PB99.E1" as StageId,
      });
      expect(out.match(/\*Playbook activo:/g)).toBeNull();
    });

    it("unknown stage id falls back to the entry stage", () => {
      const entry = PLAYBOOKS.PB1.stages.find(
        (s) => s.id === PLAYBOOKS.PB1.entryStageId,
      )!;
      const out = getSystemPrompt({
        clientState: "lead",
        activePlaybook: "PB1",
        currentStage: "PB1.E999" as StageId,
      });
      // Header references the entry stage id, not the bogus one.
      expect(out).toContain(`*Playbook activo: PB1 (${entry.id})*`);
      expect(out).not.toContain("PB1.E999");
      expect(out).toContain(entry.promptSection);
    });

    it("activePlaybook set without currentStage renders no playbook section", () => {
      const out = getSystemPrompt({
        clientState: "lead",
        activePlaybook: "PB1",
      });
      expect(out.match(/\*Playbook activo:/g)).toBeNull();
    });
  });

  // ── quick-16 fix 4: response-length rule ────────────────────────────────
  describe("response-length rule (quick-16 fix 4)", () => {
    it("base prompt contains the Longitud de respuesta heading", () => {
      const out = getSystemPrompt({});
      expect(out).toContain("Longitud de respuesta");
    });

    it("base prompt mentions 2-3 oraciones as the target length", () => {
      const out = getSystemPrompt({});
      expect(out).toContain("2-3 oraciones");
    });

    it("base prompt forbids bullets in conversational answers", () => {
      const out = getSystemPrompt({});
      expect(out).toContain("NO uso bullets");
    });
  });
});

// ─── OBJN-02 / SC#3 (v5.3.2 Phase 91) — soft-rejection rule constraints ───
//
// Locks the WHY + BACK-OFF rule wording so any future drift surfaces
// immediately. Phase 92 (RLOK-01) will add the multi-turn integration
// regression net; Phase 91 ships only the single-render constraint locks.

describe("OBJN-02 / SC#3: soft-rejection rules respect REGLA FUERTE (v5.3.2 Phase 91)", () => {
  it("WHY rule explicitly forbids mentioning planes/precios", () => {
    const rendered = getSystemPrompt({
      clientState: "lead",
      activePlaybook: "PB1",
      currentStage: "PB1.E1A",
      softRejectionRule: "why",
    });
    expect(rendered).toContain("REGLA — el lead expresó rechazo");
    // Wording-constraint locks (PLAN.md Task 2 critical list):
    expect(rendered).toMatch(/NO menciones precios ni planes/);
    expect(rendered).toMatch(/NO escales a humano/);
    expect(rendered).toMatch(/NO te despidas en este turno/);
    // Live-test rejection phrasings mirrored in the rule body:
    expect(rendered).toContain("no le interesa, no cree, o no va a hacerlo");
  });

  it("BACK-OFF rule explicitly forbids escalation and follow-up questions", () => {
    const rendered = getSystemPrompt({
      clientState: "lead",
      activePlaybook: "PB1",
      currentStage: "PB1.E1A",
      softRejectionRule: "backoff",
    });
    expect(rendered).toContain("REGLA — back-off después de la WHY");
    expect(rendered).toMatch(/NO hagas más preguntas/);
    expect(rendered).toMatch(/NO escales a humano/);
    expect(rendered).toMatch(/NO ofrezcas descuentos ni alternativas/);
  });

  it("Baseline render (no softRejectionRule) does NOT contain the WHY rule literal", () => {
    const rendered = getSystemPrompt({
      clientState: "lead",
      activePlaybook: "PB1",
      currentStage: "PB1.E1A",
    });
    expect(rendered).not.toContain("REGLA — el lead expresó rechazo");
    expect(rendered).not.toContain("REGLA — back-off después de la WHY");
  });

  it("Snapshot fixture invariant: pb1-e1a-lead-rendered.snap.txt does NOT contain the rule (baseline render unchanged)", () => {
    // OBSERVABLE proof that KGATE-05 +625 char headroom is preserved —
    // if the conditional injection ever leaks into the baseline path, this
    // test fails immediately. Do NOT regenerate the fixture to make this
    // pass — investigate the prompt-assembly path instead.
    const fixture = readFileSync(
      new URL("./fixtures/pb1-e1a-lead-rendered.snap.txt", import.meta.url),
      "utf8",
    );
    expect(fixture).not.toContain("REGLA — el lead expresó rechazo");
    expect(fixture).not.toContain("REGLA — back-off después de la WHY");
  });
});
