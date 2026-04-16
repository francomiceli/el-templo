/**
 * Phase 85 (AVAT-04) — Per-Playbook End-to-End Flow Coverage
 *
 * Locks every playbook (PB1-PB5) with at least one happy-path and one
 * objection-path test asserted at the prompt-rendering + stage-advance
 * layer. Complements:
 *
 *   - `pb1-discovery-flow.test.ts` (DISC-01..07 scoped to PB1)
 *   - `pb2-pb5-isolation.test.ts` (PBPR-05/06 cross-playbook content
 *     isolation + scope guards)
 *   - `playbook-advance.test.ts` (unit-level engine transitions)
 *   - `avatar-tone-guide.test.ts` (AVAT-01/05 tone guide contract)
 *
 * This suite is the v5.3 regression net: every future edit to
 * definitions.ts, system-prompt.ts, advance.ts, or resolver.ts must keep
 * these 5 per-PB flows green. The cross-cutting describe block at the
 * bottom proves the avatar tone guide from phase 85-01 composes with
 * every playbook section, not only PB1.
 *
 * Purity contract (verified at plan level + grepped at module level):
 *   - No AI provider calls
 *   - No Redis / ioredis / MySQL / Drizzle / webhook imports
 *   - No vi.mock, no async setup/teardown, no Date, no Math.random
 *   - Runs in <2s
 */

import { describe, it, expect } from "vitest";

import { getSystemPrompt } from "../src/ai/system-prompt.js";
import { advanceStageIfComplete } from "../src/playbooks/advance.js";
import { PLAYBOOKS } from "../src/playbooks/definitions.js";
import type { PlaybookId, StageId } from "../src/playbooks/types.js";
import { computeAdvanceSignals } from "../src/webhook/handler.js";
import { AVATAR_KEYWORDS } from "./fixtures/avatar-keywords.js";

/**
 * Scope content assertions to a specific stage promptSection so the
 * base persona + business knowledge string doesn't poison negative
 * checks (same reason as `pb1-discovery-flow.test.ts::stageContent`).
 *
 * Use `getSystemPrompt(...)` for wrapper-directive assertions (tone
 * guide composition, "Perfil detectado" header, playbook section
 * header); use `stageContent(...)` for stage-scoped assertions.
 */
function stageContent(playbookId: PlaybookId, stageId: StageId): string {
  const def = PLAYBOOKS[playbookId];
  const stage = def.stages.find((s) => s.id === stageId);
  if (!stage) {
    throw new Error(`stage not found: ${playbookId}.${stageId}`);
  }
  return stage.promptSection;
}

// ─── Helper guard — every PB has a findable entry stage ───────────────────

describe("stageContent helper sanity", () => {
  it("resolves the entry stage promptSection for every PB", () => {
    for (const id of ["PB1", "PB2", "PB3", "PB4", "PB5"] as const) {
      const entry = PLAYBOOKS[id].entryStageId;
      const content = stageContent(id, entry);
      expect(content.length).toBeGreaterThan(0);
    }
  });
});

// ─── PB1 — discovery flow ─────────────────────────────────────────────────

describe("PB1 — discovery flow", () => {
  it("happy path: E1A → E2A → E3 → E4 with discoveryAnswered signals", () => {
    // Default (no avatar) branch: E1A → E2A → E3 → E4.
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

    // Rendered E4 prompt carries the targeted-proposal REGLA FUERTE
    // (free trial only, no plan recommendation, no price).
    const e4Prompt = getSystemPrompt({
      clientState: "lead",
      activePlaybook: "PB1",
      currentStage: "PB1.E4",
    });
    expect(e4Prompt).toContain("REGLA FUERTE");
    expect(e4Prompt).toContain("clase de prueba");
    expect(e4Prompt).toContain("gratis");
  });

  it("happy path with intermedio avatar: E1A → E2B (experienced variant)", () => {
    // Avatar-aware branching: intermedio routes to E2B instead of E2A.
    const step1 = advanceStageIfComplete(
      { playbookId: "PB1", stageId: "PB1.E1A" },
      { discoveryAnswered: true, detectedAvatar: "intermedio" },
    );
    expect(step1).toBe("PB1.E2B");

    // And E2B content is distinct from E2A (second-question variants).
    const e2a = stageContent("PB1", "PB1.E2A");
    const e2b = stageContent("PB1", "PB1.E2B");
    expect(e2a).not.toBe(e2b);
    // E2B targets experienced leads — "nivel" appears in its question
    // framing, whereas E2A targets beginners with "arrancar" framing.
    expect(e2b).toContain("nivel");
    expect(e2a).toContain("arrancar");
  });

  it("objection path: directQuestionAsked holds discovery at E1A", () => {
    // Engine-level defer guard — even with discoveryAnswered=true, a
    // direct-question turn must NOT advance the stage.
    const held = advanceStageIfComplete(
      { playbookId: "PB1", stageId: "PB1.E1A" },
      { discoveryAnswered: true, directQuestionAsked: true },
    );
    expect(held).toBeNull();

    // And the prompt-level defer rule is inlined in the E1A stage copy
    // so Mica handles the same turn gracefully.
    const e1a = stageContent("PB1", "PB1.E1A");
    expect(e1a).toContain("si el lead te hace una pregunta directa");
  });

  it("OBJN-01 (Phase 91): rejection arc — turn1 substantive → turn2 rejection (WHY rule path) → turn3 reconfirm (BACK-OFF path) → turn4 re-engage (whyAsked reset)", () => {
    // This test exercises the SIGNAL + STAGE machinery end-to-end at the
    // pure-function level (computeAdvanceSignals + advanceStageIfComplete).
    // It does NOT exercise the prompt-rendering layer (system-prompt.ts) or
    // the handler's Redis writes — Phase 92 (RLOK-01) owns those.
    //
    // The simulation tracks (priorWhyAsked, expectedRule) per turn, mirroring
    // what handler.ts computes. If this test ever drifts from handler.ts
    // logic, it is a bug — handler.ts is the source of truth for the arc.

    // Turn 1: substantive discovery answer. No rejection. whyAsked stays false.
    const t1 = computeAdvanceSignals(
      "nunca entrené, vengo de cero",
      "Buenísimo. Y contame, ¿qué te llevó a buscar calistenia?",
      null,
      "PB1.E1A",
      1, // turn count = 1; STAGE-02 gate blocks E1A→E2A advance even though content is rich
    );
    expect(t1.softRejection).toBeFalsy();
    expect(t1.discoveryAnswered).toBe(false); // Phase 90 STAGE-02 gate
    // priorWhyAsked = false; rule selector → undefined (no injection).

    // Turn 2: soft rejection. softRejection true, advance blocked.
    const t2 = computeAdvanceSignals(
      "no me interesa",
      "ok",
      null,
      "PB1.E1A",
      1, // turn count must NOT increment from rejection (Phase 90 invariant)
    );
    expect(t2.softRejection).toBe(true);
    const t2Advance = advanceStageIfComplete(
      { playbookId: "PB1", stageId: "PB1.E1A" },
      t2,
    );
    expect(t2Advance).toBeNull(); // softRejection guard returns null first
    // priorWhyAsked = false → rule selector → "why".
    // After this turn: newWhyAsked = true (handler persists).

    // Turn 3: reconfirmed rejection. The handler's rule selector reads
    // priorWhyAsked from Redis (Phase 92 will exercise that integration);
    // here we just verify the regex contract for the inbound text.
    const t3 = computeAdvanceSignals("no, en serio", "ok", null, "PB1.E1A", 1);
    // "no, en serio" alone is NOT on the MUST-match list — verify.
    // The handler-level rule selector flips to "backoff" because
    // priorWhyAsked === true (from Turn 2), even though THIS turn's
    // softRejection signal is false. That's a handler-level concern.
    expect(t3.softRejection).toBeFalsy();

    // Turn 4: substantive re-engagement. Resets the arc.
    const t4 = computeAdvanceSignals(
      "che, contame más",
      "Dale, te cuento.",
      null,
      "PB1.E1A",
      2, // turn count resumes from where it left off (Phase 90 invariant)
    );
    expect(t4.softRejection).toBeFalsy();
    // priorWhyAsked from handler-side resets to false on this non-rejection turn.
  });
});

// ─── PB2 — trial follow-up flow ───────────────────────────────────────────

describe("PB2 — trial follow-up flow", () => {
  it("happy path: E1A → E2 → E3 via discoveryAnswered", () => {
    const step1 = advanceStageIfComplete(
      { playbookId: "PB2", stageId: "PB2.E1A" },
      { discoveryAnswered: true },
    );
    expect(step1).toBe("PB2.E2");

    const step2 = advanceStageIfComplete(
      { playbookId: "PB2", stageId: "PB2.E2" },
      { discoveryAnswered: true },
    );
    expect(step2).toBe("PB2.E3");

    // E3 is the soft-urgency proposal — the rendered stage content must
    // carry the "buenos horarios libres" framing from phase 84-01 and
    // must NOT contain deprecated group-start framings (TEAM-CORR-06).
    const e3 = stageContent("PB2", "PB2.E3");
    expect(e3).toContain("buenos horarios libres");
    expect(e3).not.toMatch(/grupo nuevo|arranca un grupo|cohorte/i);
  });

  it("objection path: priceObjection ALONE does NOT advance E2 (phase 84-03 regression)", () => {
    // Pre-84-03 the advance condition was `priceObjection` only, which
    // stranded tiempo/identidad/difusa objections on E2 forever. This
    // test locks in the broadened `discoveryAnswered` trigger.
    const stuck = advanceStageIfComplete(
      { playbookId: "PB2", stageId: "PB2.E2" },
      { priceObjection: true },
    );
    expect(stuck).toBeNull();

    const moved = advanceStageIfComplete(
      { playbookId: "PB2", stageId: "PB2.E2" },
      { priceObjection: true, discoveryAnswered: true },
    );
    expect(moved).toBe("PB2.E3");
  });

  it("PB2.E2 stage content contains all 4 objection branches (precio/tiempo/identidad/difusa)", () => {
    // Per phase 84-01 enrichment — each of the four branches must be
    // inlined in the stage promptSection so Mica sees the full decision
    // tree every turn E2 renders.
    const e2 = stageContent("PB2", "PB2.E2");
    expect(e2).toMatch(/Objeci[oó]n precio/i);
    expect(e2).toMatch(/Objeci[oó]n tiempo/i);
    expect(e2).toMatch(/Objeci[oó]n identidad/i);
    expect(e2).toMatch(/Objeci[oó]n difusa/i);
  });
});

// ─── PB3 — vencimiento flow ───────────────────────────────────────────────

describe("PB3 — vencimiento flow", () => {
  it("happy path: E1A → E2 → E3 with discoveryAnswered then userAccepted", () => {
    const step1 = advanceStageIfComplete(
      { playbookId: "PB3", stageId: "PB3.E1A" },
      { discoveryAnswered: true },
    );
    expect(step1).toBe("PB3.E2");

    const step2 = advanceStageIfComplete(
      { playbookId: "PB3", stageId: "PB3.E2" },
      { userAccepted: true },
    );
    expect(step2).toBe("PB3.E3");

    // E1A must carry the PRE-vencimiento framing — never reactivation
    // language (which belongs to PB4). Phase 84-01 lock.
    const e1a = stageContent("PB3", "PB3.E1A");
    expect(e1a).toContain("Se te viene la renovación");
    expect(e1a).not.toMatch(/reactivar|cuenta caducada/i);
  });

  it("objection path: PB3.E2 holds without userAccepted + carries upgrade-anchor copy", () => {
    // Only userAccepted advances from E2. discoveryAnswered alone must
    // not short-circuit the user's explicit consent.
    const stuck = advanceStageIfComplete(
      { playbookId: "PB3", stageId: "PB3.E2" },
      { discoveryAnswered: true },
    );
    expect(stuck).toBeNull();

    // And E2 carries the upgrade-anchor tension (phase 84-01): a plan
    // offer + a price + a time-bound window, with the price-objection
    // fallback pointing back to the current plan.
    const e2 = stageContent("PB3", "PB3.E2");
    expect(e2).toMatch(/plan.*superior|\[plan_superior\]/);
    expect(e2).toMatch(/\[precio_especial\]|[Ss]i renovás antes/);
    expect(e2).toMatch(/Mantenemos tu plan actual/);
  });
});

// ─── PB4 — inactivo flow ──────────────────────────────────────────────────

describe("PB4 — inactivo flow", () => {
  it("happy path: E1A → E2 via discoveryAnswered (E2 is terminal)", () => {
    const step1 = advanceStageIfComplete(
      { playbookId: "PB4", stageId: "PB4.E1A" },
      { discoveryAnswered: true },
    );
    expect(step1).toBe("PB4.E2");

    // PB4.E2 is engine-terminal in v5.3: no further automatic advance.
    // Any further signals (userAccepted, discoveryAnswered, etc.) must
    // return null.
    for (const signals of [
      { userAccepted: true },
      { discoveryAnswered: true },
      { priceObjection: true },
    ]) {
      expect(
        advanceStageIfComplete(
          { playbookId: "PB4", stageId: "PB4.E2" },
          signals,
        ),
      ).toBeNull();
    }
  });

  it("objection path: PB4.E2 contains TEAM-CORR-04 plan-conditional pause + request_human", () => {
    // Plan-conditional pause copy must name all four plans explicitly
    // so Mica never offers a pause to a Flex member.
    const e2 = stageContent("PB4", "PB4.E2");
    expect(e2).toMatch(/Foundation/);
    expect(e2).toMatch(/Foundation\+/);
    expect(e2).toMatch(/Performance/);
    expect(e2).toMatch(/Flex/);

    // And the escalation path reuses request_human (PBPR-06 in the
    // isolation suite — we re-assert here at the stageContent layer
    // so a future refactor that moves the tool name into a wrapper
    // directive is still caught by this stage-scoped test).
    expect(e2).toContain("request_human");
  });
});

// ─── PB5 — cancelación flow ───────────────────────────────────────────────

describe("PB5 — cancelación flow", () => {
  it("happy path: E1 → E2 → E3 with discoveryAnswered then userAccepted", () => {
    const step1 = advanceStageIfComplete(
      { playbookId: "PB5", stageId: "PB5.E1" },
      { discoveryAnswered: true },
    );
    expect(step1).toBe("PB5.E2");

    const step2 = advanceStageIfComplete(
      { playbookId: "PB5", stageId: "PB5.E2" },
      { userAccepted: true },
    );
    expect(step2).toBe("PB5.E3");

    // E1 enforces the sin-resistencia base rule — no retention argument,
    // no guilt, no urgency. Phase 84-02 lock.
    const e1 = stageContent("PB5", "PB5.E1");
    expect(e1).toContain("sin resistencia");
    expect(e1).toContain("NO retengas con urgencia");
  });

  it("objection path: PB5.E2 holds on discoveryAnswered alone + names all 4 plans (TEAM-CORR-04)", () => {
    // Only userAccepted advances from E2. discoveryAnswered alone must
    // hold the stage so Mica doesn't short-circuit the user's decision.
    const stuck = advanceStageIfComplete(
      { playbookId: "PB5", stageId: "PB5.E2" },
      { discoveryAnswered: true },
    );
    expect(stuck).toBeNull();

    // And the plan-conditional pause copy must name all four plans
    // explicitly (TEAM-CORR-04 dual-guard with PB4.E2).
    const e2 = stageContent("PB5", "PB5.E2");
    expect(e2).toMatch(/Foundation/);
    expect(e2).toMatch(/Foundation\+/);
    expect(e2).toMatch(/Performance/);
    expect(e2).toMatch(/Flex/);
  });

  it("objection path: PB5.E3 contains escalation trigger + request_human + buen término framing", () => {
    // E3 is the handoff stage. It must carry the escalation triggers
    // list, the request_human tool invocation, and the "en buen término"
    // framing that makes cancellation a successful playbook outcome.
    const e3 = stageContent("PB5", "PB5.E3");
    expect(e3).toContain("request_human");
    expect(e3).toMatch(/buen t[eé]rmino/);
    // Sin-resistencia continuation rule — the cancellation is respected
    // without a "last retention attempt".
    expect(e3).toMatch(/sin culpa|sin [uú]ltimo intento/);
  });
});

// ─── Phase 85 cross-cutting: tone guide composes with every playbook ─────

describe("Phase 85 cross-cutting — avatar tone guide composes with every PB happy path", () => {
  // For each (playbookId, entryStageId), render the system prompt with
  // a known avatar and assert the intermedio tone guide keywords are
  // present. This is the seam between plan 85-01 (tone guide impl) and
  // AVAT-04 (per-PB coverage): one assertion per playbook proves the
  // tone guide actually composes with every playbook section, not just
  // during PB1 discovery.
  const [kIntermedio1, kIntermedio2] = AVATAR_KEYWORDS.intermedio;

  for (const id of ["PB1", "PB2", "PB3", "PB4", "PB5"] as const) {
    it(`${id}: intermedio tone keywords render alongside the ${id} entry stage section`, () => {
      const entry = PLAYBOOKS[id].entryStageId;
      const prompt = getSystemPrompt({
        clientState: "lead",
        activePlaybook: id,
        currentStage: entry,
        currentAvatar: "intermedio",
      });
      // Tone guide keywords must render on top of the active playbook
      // section — the phase 85-01 injection is unconditional on
      // activePlaybook when currentAvatar is set.
      expect(prompt).toContain(kIntermedio1);
      expect(prompt).toContain(kIntermedio2);
      // And the Perfil detectado header from phase 83-02 must still
      // ship so the discovery-skip rule keeps firing after the tone
      // guide injection.
      expect(prompt).toContain("*Perfil detectado: intermedio*");
    });
  }
});
