/**
 * KGATE-05 regression lock.
 *
 * Threshold revised 2026-04-14 (see .planning/phases/86-knowledge-gating/86-03-PLAN.md
 * and commit 46caba53): the original ≥35% target applied to the rendered prompt
 * was reduced to ≥20% once it became clear that the universal framing in
 * system-prompt.ts (meta-identity, off-topic, tuteo, tool usage) must NOT be
 * state-gated — gating it would regress the QT11-18 fixes. The structural goal
 * ("stage rules become louder than the knowledge blob") is preserved as a
 * secondary assertion on the knowledge block alone, where the 37% reduction
 * achieved in Phase 86-02 still locks in the intended ≥35% target.
 */

import { describe, it, expect } from "vitest";
import { getSystemPrompt } from "../../src/ai/system-prompt.js";
import { getBusinessKnowledge } from "../../src/ai/knowledge.js";
import { BASELINE_CHARS } from "../fixtures/pb1-e1a-baseline.js";

describe("Prompt size regression — PB1.E1A lead (KGATE-05)", () => {
  it("rendered PB1.E1A prompt is at least 20% smaller than pre-refactor baseline (revised threshold)", () => {
    const rendered = getSystemPrompt({
      clientState: "lead",
      activePlaybook: "PB1",
      currentStage: "E1A",
    });
    const maxAllowed = Math.floor(BASELINE_CHARS * 0.8);
    expect(rendered.length).toBeLessThanOrEqual(maxAllowed);
  });

  it("knowledge block alone is at least 35% smaller for leads (original structural goal)", () => {
    const full = getBusinessKnowledge();
    const lead = getBusinessKnowledge("lead");
    const maxAllowedKnowledge = Math.floor(full.length * 0.65);
    expect(lead.length).toBeLessThanOrEqual(maxAllowedKnowledge);
  });

  it("non-lead states do not shrink (zero regression on member-facing prompts)", () => {
    // We don't assert exact equality with the baseline because PB1 vs other
    // playbook stage content differs, but we DO assert the knowledge block
    // is un-gated for non-leads by verifying member-only sections are present.
    const trialRendered = getSystemPrompt({ clientState: "trial" });
    expect(trialRendered).toContain("Estrategias de Retencion");
    expect(trialRendered).toContain("Ayuda con la App");
  });
});
