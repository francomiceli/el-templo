/**
 * Phase 83 — PB1 Discovery Flow Integration Tests (pure)
 *
 * Locks in all 7 DISC success criteria as pure unit tests so regressions to
 * PB1 prompt copy, profile detection, or stage branching are caught by CI
 * without requiring a live AI call.
 *
 * These tests compose the outputs of plans 83-01 (enriched PB1 promptSections),
 * 83-02 (profile-tag parser + system-prompt directive), and 83-03 (refined
 * advance logic with avatar branching + defer/insistence guards).
 *
 * Purity contract (verified by grep at plan level):
 *   - No AI provider calls
 *   - No Redis / ioredis / MySQL / Drizzle / webhook imports
 *   - No vi.mock, no async setup/teardown
 *   - Each describe block maps to a single DISC requirement (DISC-01..07)
 */

import { describe, it, expect } from "vitest";
import { getSystemPrompt } from "../src/ai/system-prompt.js";
import {
  advanceStageIfComplete,
  type AdvanceSignals,
} from "../src/playbooks/advance.js";
import {
  extractProfileTag,
  stripProfileTag,
} from "../src/playbooks/profile-tag.js";
import { PLAYBOOKS } from "../src/playbooks/definitions.js";
import type { StageId } from "../src/playbooks/types.js";

/**
 * Helper: return the raw promptSection string for a given PB1 stage.
 *
 * For content-scoped assertions (what a stage DOES or DOES NOT contain) we
 * must inspect the stage promptSection directly — rendering the full system
 * prompt via getSystemPrompt pulls in the base persona + business knowledge,
 * which legitimately contains "precio", "Foundation", "Performance", "Flex",
 * "$", "pagar", etc. at the Mica/knowledge layer and would poison negative
 * assertions at the stage layer.
 *
 * getSystemPrompt is still used for the tests that check which WRAPPER
 * directives (Detección de perfil, Perfil detectado, the playbook header)
 * get injected — those are rendered outside the stage promptSection and are
 * the contract we want to pin at the render layer.
 */
function stageContent(stageId: StageId): string {
  const stage = PLAYBOOKS.PB1.stages.find((s) => s.id === stageId);
  if (!stage) {
    throw new Error(`PB1 stage not found: ${stageId}`);
  }
  return stage.promptSection;
}

// ─── DISC-01 ───────────────────────────────────────────────────────────────

describe("DISC-01 — first message is warm intro + first qualifying question", () => {
  it("PB1.E1A promptSection contains warm intro and first discovery question", () => {
    // DISC-01: the opener must be a warm hello plus the first qualifying
    // question about calisthenics experience — never the generic
    // "¿en qué puedo ayudarte?" opener we explicitly banned in plan 83-01.
    const e1a = stageContent("PB1.E1A");
    expect(e1a).toContain("¡Hola");
    expect(e1a).toContain("¿ya entrenaste calistenia");
    expect(e1a).toContain("primera vez");
    // The phrase appears ONLY as the banned example ("NUNCA preguntes
    // '¿en qué puedo ayudarte?'"), never as the instructed opener.
    expect(e1a).toContain("NUNCA preguntes");
  });

  it("PB1.E1B promptSection contains alternative warm intro", () => {
    // DISC-01: the B-variant opener must also be warm and ask an
    // experience-qualifier question without defaulting to a generic opener.
    const e1b = stageContent("PB1.E1B");
    expect(e1b).toContain("arrancás de cero");
    expect(e1b).toContain("tenés experiencia en calistenia");
  });

  it("Neither E1A nor E1B instruct Mica to USE the generic opener", () => {
    // DISC-01: regression guard — if someone removes the NUNCA-preguntes
    // ban, the blacklisted phrase could start being used as an opener.
    // We assert both stages still carry the explicit NUNCA ban.
    expect(stageContent("PB1.E1A")).toContain("NUNCA preguntes");
    expect(stageContent("PB1.E1B")).toContain("NUNCA preguntes");
  });
});

// ─── DISC-02 ───────────────────────────────────────────────────────────────

describe("DISC-02 — max 3 qualifying questions, woven not quiz-style", () => {
  it("PB1 stages contain the 2-3 adaptive question rule", () => {
    // DISC-02: the literal "2-3 preguntas" cap from TEAM-CORR-01 must be
    // inlined in the stage promptSection Mica sees on every turn.
    expect(stageContent("PB1.E1A")).toContain("2-3 preguntas");
    expect(stageContent("PB1.E1B")).toContain("2-3 preguntas");
  });

  it("PB1.E3 is the LAST discovery question and advances to E4 regardless of signal richness", () => {
    // DISC-02: after E3, discovery always exits — the 2-3 cap is enforced
    // at the engine level, not just in the prompt copy.
    const signals: AdvanceSignals = { discoveryAnswered: true };
    const result = advanceStageIfComplete(
      { playbookId: "PB1", stageId: "PB1.E3" },
      signals,
    );
    expect(result).toBe("PB1.E4");
  });

  it("The full E1→E2→E3 sequence is at most 3 advancement calls", () => {
    // DISC-02: three successive discoveryAnswered=true calls walk E1A→E2A→E3→E4.
    // There is no fourth discovery stage — E4 is the targeted proposal, not
    // another question.
    const step1 = advanceStageIfComplete(
      { playbookId: "PB1", stageId: "PB1.E1A" },
      { discoveryAnswered: true },
    );
    expect(step1).toBe("PB1.E2A");

    const step2 = advanceStageIfComplete(
      { playbookId: "PB1", stageId: "PB1.E2A" },
      { discoveryAnswered: true },
    );
    expect(step2).toBe("PB1.E3");

    const step3 = advanceStageIfComplete(
      { playbookId: "PB1", stageId: "PB1.E3" },
      { discoveryAnswered: true },
    );
    expect(step3).toBe("PB1.E4");

    // Regression guard: there is no E4-derivative discovery stage.
    // After E4 we either stay (nothing accepted) or advance to E5 (scheduling).
    const e4Ids = PLAYBOOKS.PB1.stages.map((s) => s.id);
    expect(e4Ids).toContain("PB1.E4");
    expect(e4Ids).toContain("PB1.E5");
    expect(e4Ids).not.toContain("PB1.E4B");
  });
});

// ─── DISC-03 ───────────────────────────────────────────────────────────────

describe("DISC-03 — direct question interrupt is handled on same turn", () => {
  it("PB1.E1A promptSection documents the defer rule", () => {
    // DISC-03: when a lead asks for price/schedule/location before discovery
    // finishes, Mica must answer briefly and re-anchor a discovery question
    // in the same turn — that rule must be inlined in the stage promptSection.
    const e1a = stageContent("PB1.E1A");
    expect(e1a).toContain("pregunta directa");
    expect(e1a).toContain("si el lead te hace una pregunta directa");
    // The defer rule must also live in the other discovery stages so Mica
    // sees it regardless of where the lead enters the funnel.
    expect(stageContent("PB1.E1B")).toContain("pregunta directa");
    expect(stageContent("PB1.E2A")).toContain("pregunta directa");
    expect(stageContent("PB1.E2B")).toContain("pregunta directa");
    expect(stageContent("PB1.E3")).toContain("pregunta directa");
  });

  it("advance.ts holds the stage when directQuestionAsked is true", () => {
    // DISC-03: the engine-level guard reinforces the prompt rule — even if
    // Mica reports discoveryAnswered, a direct-question turn must NOT advance.
    const result = advanceStageIfComplete(
      { playbookId: "PB1", stageId: "PB1.E1A" },
      { discoveryAnswered: true, directQuestionAsked: true },
    );
    expect(result).toBeNull();
  });

  it("advance.ts normal path still works when directQuestionAsked is false", () => {
    // DISC-03: regression guard — a falsy directQuestionAsked must not
    // accidentally block the normal advancement path.
    const result = advanceStageIfComplete(
      { playbookId: "PB1", stageId: "PB1.E1A" },
      { discoveryAnswered: true, directQuestionAsked: false },
    );
    expect(result).toBe("PB1.E2A");
  });
});

// ─── DISC-04 ───────────────────────────────────────────────────────────────

describe("DISC-04 — one targeted recommendation, not a menu", () => {
  it("PB1.E4 promptSection forbids plan recommendations and prices", () => {
    // DISC-04: E4 is the targeted proposal stage. The REGLA FUERTE block
    // must explicitly ban plan recommendations + prices and anchor the
    // free trial class as the ONLY CTA (TEAM-CORR-02).
    const e4 = stageContent("PB1.E4");
    expect(e4).toContain("REGLA FUERTE");
    expect(e4).toContain("NO recomend");
    expect(e4).toContain("clase de prueba");
    expect(e4).toContain("gratis");
  });

  it("PB1.E4 promptSection does NOT list multiple plans as options", () => {
    // DISC-04: regression guard — no plan NAMES and no dollar signs may
    // leak into E4 copy. If someone re-adds "Foundation / Performance / Flex"
    // the test fails immediately. (We scope to the stage promptSection so
    // the business knowledge in the base prompt — which legitimately lists
    // those plans for Mica's check_membership tool — does not poison this
    // assertion.)
    const e4 = stageContent("PB1.E4");
    expect(e4).not.toContain("Foundation");
    expect(e4).not.toContain("Performance");
    expect(e4).not.toContain("Flex");
    expect(e4).not.toContain("$");
  });
});

// ─── DISC-05 ───────────────────────────────────────────────────────────────

describe("DISC-05 — profile detected and stored in Redis session", () => {
  it("Profile tag parser recognizes all 4 avatars", () => {
    // DISC-05: the parser is the contract between the LLM and Redis state.
    // All four v5.3 avatars must round-trip through the structured tag.
    expect(extractProfileTag("<profile>cero_absoluto</profile>")).toBe(
      "cero_absoluto",
    );
    expect(extractProfileTag("<profile>gym_crossover</profile>")).toBe(
      "gym_crossover",
    );
    expect(extractProfileTag("<profile>intermedio</profile>")).toBe(
      "intermedio",
    );
    expect(extractProfileTag("<profile>retorna</profile>")).toBe("retorna");

    // And stripProfileTag removes them cleanly, so the user never sees them.
    expect(stripProfileTag("Hola <profile>intermedio</profile>")).toBe("Hola");
  });

  it("System prompt instructs Mica to emit <profile> tag only during PB1 + no-prior-avatar", () => {
    // DISC-05: the "Detección de perfil" directive must be injected ONLY
    // when we are actively running PB1 AND no avatar has been detected yet.
    // Once an avatar is known, re-detection must be suppressed.
    const withoutAvatar = getSystemPrompt({
      clientState: "lead",
      activePlaybook: "PB1",
      currentStage: "PB1.E1A",
      currentAvatar: null,
    });
    expect(withoutAvatar).toContain("Detección de perfil");
    expect(withoutAvatar).toContain("<profile>");

    const withAvatar = getSystemPrompt({
      clientState: "lead",
      activePlaybook: "PB1",
      currentStage: "PB1.E1A",
      currentAvatar: "intermedio",
    });
    expect(withAvatar).not.toContain("Detección de perfil");
    expect(withAvatar).toContain("Perfil detectado");
  });

  it("Profile-aware branching: intermedio at E1A advances to E2B", () => {
    // DISC-05: the engine must route experienced avatars (intermedio, retorna)
    // to the E2B (experienced) variant instead of the default E2A (beginner).
    const result = advanceStageIfComplete(
      { playbookId: "PB1", stageId: "PB1.E1A" },
      { discoveryAnswered: true, detectedAvatar: "intermedio" },
    );
    expect(result).toBe("PB1.E2B");
  });
});

// ─── DISC-06 ───────────────────────────────────────────────────────────────

describe("DISC-06 — soft trial offer close", () => {
  it("PB1.E4 closes with free trial CTA, not hard sell", () => {
    // DISC-06: the close must be a free trial invitation — never a hard
    // sell, never a time-limited discount, never a plan recommendation.
    const e4 = stageContent("PB1.E4");
    expect(e4).toContain("clase de prueba");
    expect(e4).toContain("gratis");

    // Hard-sell / urgency markers are out of scope for E4.
    expect(e4).not.toContain("urgencia");
    expect(e4).not.toContain("promoción");

    // The word "precio" IS present in E4 (inside the REGLA FUERTE ban and
    // the defer clause), but it MUST be accompanied by the re-anchor phrase
    // "Te paso los detalles después de la clase" so Mica always redirects
    // back to the free trial instead of negotiating price.
    expect(e4).toContain("Te paso los detalles después de la clase");
  });

  it("PB1.E5 continues the agenda tone (no hard sell)", () => {
    // DISC-06: E5 is scheduling only — selling the plan is PB2's job, and
    // the stage promptSection explicitly tells Mica NOT to start selling
    // after scheduling. We assert the scheduling tone markers are present
    // and that no "pagar" / "precio" language leaks into the stage copy.
    // (Scoped to the stage promptSection: the base prompt + business
    // knowledge legitimately mentions both elsewhere.)
    const e5 = stageContent("PB1.E5");
    expect(e5).toContain("agendo");
    expect(e5).toContain("ropa cómoda");
    expect(e5).not.toContain("pagar");
    expect(e5).not.toContain("precio");

    // Note: the literal token "plan" does appear in E5 inside the negation
    // "NO empieces a vender el plan" — that negation IS the behavioral rule
    // this test exists to lock in, so we assert its presence directly.
    expect(e5).toContain("NO empieces a vender el plan");
  });
});

// ─── DISC-07 ───────────────────────────────────────────────────────────────

describe("DISC-07 — insistence on direct answers defers profiling gracefully", () => {
  it("PB1 stages document the insistence-defer rule", () => {
    // DISC-07: when a lead insists on direct answers and refuses to engage
    // with discovery, Mica must respect the refusal and NOT push another
    // discovery question that turn. The rule must be inlined in EVERY
    // discovery stage so Mica sees it on every turn regardless of where
    // the lead currently is in the funnel.
    for (const stageId of [
      "PB1.E1A",
      "PB1.E1B",
      "PB1.E2A",
      "PB1.E2B",
      "PB1.E3",
    ] as const) {
      const content = stageContent(stageId);
      expect(content).toContain("insiste");
      expect(content).toContain("NO empujes otra pregunta");
    }
  });

  it("advance.ts holds stage when userInsistedDirect is true", () => {
    // DISC-07: engine-level guard — even with discoveryAnswered=true, an
    // insistence turn must NOT advance. The stage holds so Mica can retry
    // discovery on the next inbound message.
    const result = advanceStageIfComplete(
      { playbookId: "PB1", stageId: "PB1.E1A" },
      { discoveryAnswered: true, userInsistedDirect: true },
    );
    expect(result).toBeNull();
  });

  it("advance.ts normal flow resumes when userInsistedDirect is false on a later turn", () => {
    // DISC-07: regression guard — the insistence guard must not be sticky.
    // Once the lead answers normally (userInsistedDirect=false), the usual
    // avatar-aware advancement path resumes without any state leak.
    const defaultAvatar = advanceStageIfComplete(
      { playbookId: "PB1", stageId: "PB1.E1A" },
      { discoveryAnswered: true, userInsistedDirect: false },
    );
    expect(defaultAvatar).toBe("PB1.E2A");

    const experiencedAvatar = advanceStageIfComplete(
      { playbookId: "PB1", stageId: "PB1.E1A" },
      {
        discoveryAnswered: true,
        userInsistedDirect: false,
        detectedAvatar: "retorna",
      },
    );
    expect(experiencedAvatar).toBe("PB1.E2B");
  });
});
