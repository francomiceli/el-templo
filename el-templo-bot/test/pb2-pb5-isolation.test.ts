/**
 * Phase 84-03 — Cross-State Playbook Isolation Regression Suite (PBPR-05)
 *
 * Proves that each playbook's distinctive content only appears in the
 * rendered system prompt when THAT playbook is the active one. Complements
 * the phase-82 structural invariant test (`system-prompt-playbook.test.ts`)
 * with a semantic check over the enriched content from plans 84-01 and
 * 84-02.
 *
 * Three groups of assertions:
 *
 *   1. Pre-flight: every signature phrase appears verbatim in its own
 *      playbook's entry-stage rendered prompt.
 *   2. Cross-state matrix (5×5): signature phrases for any OTHER playbook
 *      are absent when a given playbook is active.
 *   3. Escalation + scope guards: request_human reuse for PB4.E2/PB5.E3,
 *      base-prompt escalation phrase, no SQL/migration mentions, no
 *      banned skill names, no "grupo nuevo" framing, plan-conditional
 *      pause names all four plans in BOTH PB4.E2 AND PB5.E2
 *      (TEAM-CORR-04 dual-guard).
 */

import { describe, it, expect } from "vitest";
import { getSystemPrompt } from "../src/ai/system-prompt.js";
import { PLAYBOOKS } from "../src/playbooks/definitions.js";
import type { PlaybookId, StageId } from "../src/playbooks/types.js";

// Distinctive phrases per playbook. Each phrase MUST be:
//   (a) verbatim present in the playbook's ENTRY stage promptSection
//       (the cross-state matrix renders entry stages — see pre-flight),
//   (b) unique to that playbook (no substring match in any other PB),
//   (c) not a substring of the base prompt or business knowledge block.
//
// The pre-flight describe block below validates (a) at runtime so that
// any future edit that moves a phrase to a non-entry stage trips the
// test at authoring time instead of masking isolation bugs.
const SIGNATURE_PHRASES: Record<PlaybookId, string[]> = {
  PB1: ["Idealmente 2-3 preguntas"],
  PB2: ["check-in post-prueba", "¿Cómo te sentís después de la clase"],
  PB3: ["Se te viene la renovación"],
  PB4: ["No es reclamo eh"],
  PB5: ["sin resistencia", "NO retengas con urgencia"],
};

const ENTRY_STAGES: Record<PlaybookId, StageId> = {
  PB1: PLAYBOOKS.PB1.entryStageId,
  PB2: PLAYBOOKS.PB2.entryStageId,
  PB3: PLAYBOOKS.PB3.entryStageId,
  PB4: PLAYBOOKS.PB4.entryStageId,
  PB5: PLAYBOOKS.PB5.entryStageId,
};

const ALL_IDS: PlaybookId[] = ["PB1", "PB2", "PB3", "PB4", "PB5"];

describe("signature phrase pre-flight (entry stage rendering)", () => {
  // Catch the "signature points to a non-entry stage" bug at authoring time.
  for (const id of ALL_IDS) {
    it(`every ${id} signature phrase appears in its entry-stage rendered prompt`, () => {
      const prompt = getSystemPrompt({
        activePlaybook: id,
        currentStage: ENTRY_STAGES[id],
      });
      for (const phrase of SIGNATURE_PHRASES[id]) {
        expect(prompt).toContain(phrase);
      }
    });
  }
});

describe("PBPR-05: cross-playbook content isolation", () => {
  for (const activeId of ALL_IDS) {
    describe(`when ${activeId} is active`, () => {
      const prompt = getSystemPrompt({
        activePlaybook: activeId,
        currentStage: ENTRY_STAGES[activeId],
      });

      it(`contains its own signature phrases`, () => {
        for (const phrase of SIGNATURE_PHRASES[activeId]) {
          expect(prompt).toContain(phrase);
        }
      });

      for (const otherId of ALL_IDS.filter((id) => id !== activeId)) {
        it(`does NOT contain ${otherId} signature phrases`, () => {
          for (const phrase of SIGNATURE_PHRASES[otherId]) {
            expect(prompt).not.toContain(phrase);
          }
        });
      }
    });
  }
});

describe("PBPR-06: escalation reuses v5.2 request_human tool", () => {
  it("PB4.E2 instructs Mica to call request_human on serious triggers", () => {
    const prompt = getSystemPrompt({
      activePlaybook: "PB4",
      currentStage: "PB4.E2",
    });
    expect(prompt).toContain("request_human");
  });

  it("PB5.E3 instructs Mica to call request_human on serious complaints", () => {
    const prompt = getSystemPrompt({
      activePlaybook: "PB5",
      currentStage: "PB5.E3",
    });
    expect(prompt).toContain("request_human");
  });

  // Verified 2026-04-07 in system-prompt.ts line 94: the canonical
  // escalation phrase is hard-coded in the request_human rule of the
  // base prompt. Asserting against the no-playbook render proves it
  // ships on every turn regardless of state.
  it("base prompt (no playbook) contains the canonical escalation phrase", () => {
    const prompt = getSystemPrompt({});
    expect(prompt).toContain(
      "Te paso con alguien del equipo, te escriben enseguida",
    );
  });
});

describe("v5.3 scope guards (negative grep)", () => {
  it("no playbook prompt mentions a new MySQL table", () => {
    for (const id of ALL_IDS) {
      const prompt = getSystemPrompt({
        activePlaybook: id,
        currentStage: PLAYBOOKS[id].entryStageId,
      });
      expect(prompt).not.toMatch(/CREATE TABLE|ALTER TABLE|drizzle|migration/i);
    }
  });

  it("PB2 contains zero 'grupo nuevo' references (TEAM-CORR-06)", () => {
    for (const stage of PLAYBOOKS.PB2.stages) {
      expect(stage.promptSection).not.toMatch(
        /grupo nuevo|arranca un grupo|cohorte/i,
      );
    }
  });

  // TEAM-CORR-04 dual guard: plan-conditional pause copy must name all
  // four plans explicitly in BOTH PB4.E2 (inactive empathy) AND PB5.E2
  // (cancellation alternative). Plan 84-02 wrote the same caveat into
  // both stages — if a future edit drops it from one, these tests catch
  // it before Flex members get offered a pause they can't take.
  it("PB4.E2 names Foundation/Foundation+/Performance/Flex (TEAM-CORR-04)", () => {
    const e2 = PLAYBOOKS.PB4.stages.find((s) => s.id === "PB4.E2");
    expect(e2).toBeDefined();
    expect(e2?.promptSection).toMatch(/Foundation/);
    expect(e2?.promptSection).toMatch(/Foundation\+/);
    expect(e2?.promptSection).toMatch(/Performance/);
    expect(e2?.promptSection).toMatch(/Flex/);
  });

  it("PB5.E2 names Foundation/Foundation+/Performance/Flex (TEAM-CORR-04)", () => {
    const e2 = PLAYBOOKS.PB5.stages.find((s) => s.id === "PB5.E2");
    expect(e2).toBeDefined();
    expect(e2?.promptSection).toMatch(/Foundation/);
    expect(e2?.promptSection).toMatch(/Foundation\+/);
    expect(e2?.promptSection).toMatch(/Performance/);
    expect(e2?.promptSection).toMatch(/Flex/);
  });

  it("no banned skill names in any PB stage", () => {
    const banned = /muscle up|front lever|planche|handstand|pistol squat/i;
    for (const id of ALL_IDS) {
      for (const stage of PLAYBOOKS[id].stages) {
        expect(stage.promptSection).not.toMatch(banned);
      }
    }
  });
});
