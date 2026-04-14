/**
 * Unit tests for the pure stage advancement helper.
 *
 * `advanceStageIfComplete` is a side-effect-free function — no Redis,
 * no memory imports, no webhook imports. These tests cover every
 * transition wired in v5.3 plus the no-op cases that keep advancement
 * conservative until phases 83/84 expand the rules.
 */

import { describe, it, expect } from "vitest";
import {
  advanceStageIfComplete,
  type AdvanceSignals,
} from "../src/playbooks/advance";
import {
  computeAdvanceSignals,
  isQuestion,
  isMetaIdentityQuery,
  isBareGreeting,
  hasMinimumContent,
  hasStageSpecificContent,
} from "../src/webhook/handler";
import type { PlaybookId, StageId } from "../src/playbooks/types";

function at(playbookId: PlaybookId, stageId: StageId) {
  return { playbookId, stageId };
}

const NO_SIGNALS: AdvanceSignals = {};

describe("advanceStageIfComplete", () => {
  // ── PB1 ────────────────────────────────────────────────────────────────

  describe("PB1 (Lead Nuevo)", () => {
    it("PB1.E1A + discoveryAnswered → PB1.E2A", () => {
      expect(
        advanceStageIfComplete(at("PB1", "PB1.E1A"), {
          discoveryAnswered: true,
        }),
      ).toBe("PB1.E2A");
    });

    it("PB1.E1B + discoveryAnswered → PB1.E2A (TODO phase-83 branch)", () => {
      expect(
        advanceStageIfComplete(at("PB1", "PB1.E1B"), {
          discoveryAnswered: true,
        }),
      ).toBe("PB1.E2A");
    });

    it("PB1.E2A + discoveryAnswered → PB1.E3", () => {
      expect(
        advanceStageIfComplete(at("PB1", "PB1.E2A"), {
          discoveryAnswered: true,
        }),
      ).toBe("PB1.E3");
    });

    it("PB1.E2B + discoveryAnswered → PB1.E3", () => {
      expect(
        advanceStageIfComplete(at("PB1", "PB1.E2B"), {
          discoveryAnswered: true,
        }),
      ).toBe("PB1.E3");
    });

    it("PB1.E3 + discoveryAnswered → PB1.E4", () => {
      expect(
        advanceStageIfComplete(at("PB1", "PB1.E3"), {
          discoveryAnswered: true,
        }),
      ).toBe("PB1.E4");
    });

    it("PB1.E4 + userAccepted → PB1.E5", () => {
      expect(
        advanceStageIfComplete(at("PB1", "PB1.E4"), { userAccepted: true }),
      ).toBe("PB1.E5");
    });

    it("PB1.E4 + no signals → null (no advance)", () => {
      expect(
        advanceStageIfComplete(at("PB1", "PB1.E4"), NO_SIGNALS),
      ).toBeNull();
    });

    it("PB1.E4 + only discoveryAnswered → null (needs explicit accept)", () => {
      expect(
        advanceStageIfComplete(at("PB1", "PB1.E4"), {
          discoveryAnswered: true,
        }),
      ).toBeNull();
    });

    it("PB1.E5 + any signals → null (no further advancement in v5.3)", () => {
      expect(
        advanceStageIfComplete(at("PB1", "PB1.E5"), {
          discoveryAnswered: true,
          userAccepted: true,
          trialProposed: true,
        }),
      ).toBeNull();
    });

    it("PB1.E1A + no signals → null", () => {
      expect(
        advanceStageIfComplete(at("PB1", "PB1.E1A"), NO_SIGNALS),
      ).toBeNull();
    });
  });

  // ── PB2 ────────────────────────────────────────────────────────────────

  describe("PB2 (Trial No Convertido)", () => {
    it("PB2.E1A + discoveryAnswered → PB2.E2", () => {
      expect(
        advanceStageIfComplete(at("PB2", "PB2.E1A"), {
          discoveryAnswered: true,
        }),
      ).toBe("PB2.E2");
    });

    it("PB2.E1B + discoveryAnswered → PB2.E2", () => {
      expect(
        advanceStageIfComplete(at("PB2", "PB2.E1B"), {
          discoveryAnswered: true,
        }),
      ).toBe("PB2.E2");
    });

    it("PB2.E2 + discoveryAnswered → PB2.E3 (phase 84 broadened trigger)", () => {
      expect(
        advanceStageIfComplete(at("PB2", "PB2.E2"), {
          discoveryAnswered: true,
        }),
      ).toBe("PB2.E3");
    });

    it("PB2.E2 + priceObjection ALONE → null (regression: priceObjection no longer gates advance)", () => {
      // Plan 84-03: PB2.E2 was enriched with four objection branches, so
      // the old priceObjection-only trigger is dropped. The broadened
      // discoveryAnswered trigger is now the only path to PB2.E3.
      expect(
        advanceStageIfComplete(at("PB2", "PB2.E2"), { priceObjection: true }),
      ).toBeNull();
    });

    it("PB2.E2 + priceObjection AND discoveryAnswered → PB2.E3 (discoveryAnswered carries it)", () => {
      expect(
        advanceStageIfComplete(at("PB2", "PB2.E2"), {
          priceObjection: true,
          discoveryAnswered: true,
        }),
      ).toBe("PB2.E3");
    });

    it("PB2.E2 + no signals → null", () => {
      expect(
        advanceStageIfComplete(at("PB2", "PB2.E2"), NO_SIGNALS),
      ).toBeNull();
    });

    it("PB2.E3 + any signals → null (terminal stage in v5.3)", () => {
      expect(
        advanceStageIfComplete(at("PB2", "PB2.E3"), {
          priceObjection: true,
          userAccepted: true,
          discoveryAnswered: true,
        }),
      ).toBeNull();
    });
  });

  // ── PB3 transitions (phase 84) ─────────────────────────────────────────

  describe("PB3 transitions (phase 84)", () => {
    it("PB3.E1A + discoveryAnswered → PB3.E2", () => {
      expect(
        advanceStageIfComplete(at("PB3", "PB3.E1A"), {
          discoveryAnswered: true,
        }),
      ).toBe("PB3.E2");
    });

    it("PB3.E1B + discoveryAnswered → PB3.E2", () => {
      expect(
        advanceStageIfComplete(at("PB3", "PB3.E1B"), {
          discoveryAnswered: true,
        }),
      ).toBe("PB3.E2");
    });

    it("PB3.E2 + userAccepted → PB3.E3", () => {
      expect(
        advanceStageIfComplete(at("PB3", "PB3.E2"), { userAccepted: true }),
      ).toBe("PB3.E3");
    });

    it("PB3.E1A + no signals → null (holds)", () => {
      expect(
        advanceStageIfComplete(at("PB3", "PB3.E1A"), NO_SIGNALS),
      ).toBeNull();
    });

    it("PB3.E2 + only discoveryAnswered → null (needs explicit accept)", () => {
      expect(
        advanceStageIfComplete(at("PB3", "PB3.E2"), {
          discoveryAnswered: true,
        }),
      ).toBeNull();
    });

    it("PB3.E3 + any signals → null (terminal)", () => {
      expect(
        advanceStageIfComplete(at("PB3", "PB3.E3"), {
          discoveryAnswered: true,
          userAccepted: true,
        }),
      ).toBeNull();
    });

    it("purity: PB3 transitions do not mutate signals", () => {
      const signals: AdvanceSignals = { discoveryAnswered: true };
      const frozen = { ...signals };
      advanceStageIfComplete(at("PB3", "PB3.E1A"), signals);
      expect(signals).toEqual(frozen);
    });
  });

  // ── PB4 transitions (phase 84) ─────────────────────────────────────────

  describe("PB4 transitions (phase 84)", () => {
    it("PB4.E1A + discoveryAnswered → PB4.E2", () => {
      expect(
        advanceStageIfComplete(at("PB4", "PB4.E1A"), {
          discoveryAnswered: true,
        }),
      ).toBe("PB4.E2");
    });

    it("PB4.E1B + discoveryAnswered → PB4.E2", () => {
      expect(
        advanceStageIfComplete(at("PB4", "PB4.E1B"), {
          discoveryAnswered: true,
        }),
      ).toBe("PB4.E2");
    });

    it("PB4.E1A + no signals → null (holds)", () => {
      expect(
        advanceStageIfComplete(at("PB4", "PB4.E1A"), NO_SIGNALS),
      ).toBeNull();
    });

    it("PB4.E2 + any signals → null (terminal in v5.3; escalation owned by handler)", () => {
      expect(
        advanceStageIfComplete(at("PB4", "PB4.E2"), {
          discoveryAnswered: true,
          userAccepted: true,
          priceObjection: true,
        }),
      ).toBeNull();
    });
  });

  // ── PB5 transitions (phase 84) ─────────────────────────────────────────

  describe("PB5 transitions (phase 84)", () => {
    it("PB5.E1 + discoveryAnswered → PB5.E2 (user explained motivo)", () => {
      expect(
        advanceStageIfComplete(at("PB5", "PB5.E1"), {
          discoveryAnswered: true,
        }),
      ).toBe("PB5.E2");
    });

    it("PB5.E2 + userAccepted → PB5.E3 (user accepted alternative)", () => {
      expect(
        advanceStageIfComplete(at("PB5", "PB5.E2"), { userAccepted: true }),
      ).toBe("PB5.E3");
    });

    it("PB5.E2 + only discoveryAnswered → null (conservative: holds without accept)", () => {
      expect(
        advanceStageIfComplete(at("PB5", "PB5.E2"), {
          discoveryAnswered: true,
        }),
      ).toBeNull();
    });

    it("PB5.E1 + no signals → null (holds)", () => {
      expect(
        advanceStageIfComplete(at("PB5", "PB5.E1"), NO_SIGNALS),
      ).toBeNull();
    });

    it("PB5.E3 + any signals → null (terminal)", () => {
      expect(
        advanceStageIfComplete(at("PB5", "PB5.E3"), {
          discoveryAnswered: true,
          userAccepted: true,
        }),
      ).toBeNull();
    });

    it("purity: PB5 transitions do not mutate signals", () => {
      const signals: AdvanceSignals = { userAccepted: true };
      const frozen = { ...signals };
      advanceStageIfComplete(at("PB5", "PB5.E2"), signals);
      expect(signals).toEqual(frozen);
    });
  });

  // ── Purity / determinism ───────────────────────────────────────────────

  describe("purity", () => {
    it("does not mutate the input current object", () => {
      const current = at("PB1", "PB1.E1A");
      const frozen = { ...current };
      advanceStageIfComplete(current, { discoveryAnswered: true });
      expect(current).toEqual(frozen);
    });

    it("does not mutate the input signals object", () => {
      const signals: AdvanceSignals = { discoveryAnswered: true };
      const frozen = { ...signals };
      advanceStageIfComplete(at("PB1", "PB1.E1A"), signals);
      expect(signals).toEqual(frozen);
    });

    it("is deterministic across 100 calls with the same inputs", () => {
      const results = new Set<StageId | null>();
      for (let i = 0; i < 100; i++) {
        results.add(
          advanceStageIfComplete(at("PB1", "PB1.E3"), {
            discoveryAnswered: true,
          }),
        );
      }
      expect(results.size).toBe(1);
      expect(results.has("PB1.E4")).toBe(true);
    });
  });

  // ── PB1 phase-83 refinements ───────────────────────────────────────────

  describe("PB1 phase-83 refinements", () => {
    it("E1A + discoveryAnswered + detectedAvatar=intermedio → PB1.E2B", () => {
      expect(
        advanceStageIfComplete(at("PB1", "PB1.E1A"), {
          discoveryAnswered: true,
          detectedAvatar: "intermedio",
        }),
      ).toBe("PB1.E2B");
    });

    it("E1A + discoveryAnswered + detectedAvatar=retorna → PB1.E2B", () => {
      expect(
        advanceStageIfComplete(at("PB1", "PB1.E1A"), {
          discoveryAnswered: true,
          detectedAvatar: "retorna",
        }),
      ).toBe("PB1.E2B");
    });

    it("E1B + discoveryAnswered + detectedAvatar=intermedio → PB1.E2B", () => {
      expect(
        advanceStageIfComplete(at("PB1", "PB1.E1B"), {
          discoveryAnswered: true,
          detectedAvatar: "intermedio",
        }),
      ).toBe("PB1.E2B");
    });

    it("E1A + discoveryAnswered + detectedAvatar=cero_absoluto → PB1.E2A", () => {
      expect(
        advanceStageIfComplete(at("PB1", "PB1.E1A"), {
          discoveryAnswered: true,
          detectedAvatar: "cero_absoluto",
        }),
      ).toBe("PB1.E2A");
    });

    it("E1A + discoveryAnswered + detectedAvatar=gym_crossover → PB1.E2A", () => {
      expect(
        advanceStageIfComplete(at("PB1", "PB1.E1A"), {
          discoveryAnswered: true,
          detectedAvatar: "gym_crossover",
        }),
      ).toBe("PB1.E2A");
    });

    it("E1A + discoveryAnswered + detectedAvatar=null → PB1.E2A (backward-compat default)", () => {
      expect(
        advanceStageIfComplete(at("PB1", "PB1.E1A"), {
          discoveryAnswered: true,
          detectedAvatar: null,
        }),
      ).toBe("PB1.E2A");
    });

    it("E1A + discoveryAnswered + detectedAvatar omitted → PB1.E2A (backward-compat, signal absent)", () => {
      expect(
        advanceStageIfComplete(at("PB1", "PB1.E1A"), {
          discoveryAnswered: true,
        }),
      ).toBe("PB1.E2A");
    });

    it("E1A + discoveryAnswered + directQuestionAsked → null (defer holds stage)", () => {
      expect(
        advanceStageIfComplete(at("PB1", "PB1.E1A"), {
          discoveryAnswered: true,
          directQuestionAsked: true,
        }),
      ).toBeNull();
    });

    it("E2A + discoveryAnswered + directQuestionAsked → null (defer holds stage)", () => {
      expect(
        advanceStageIfComplete(at("PB1", "PB1.E2A"), {
          discoveryAnswered: true,
          directQuestionAsked: true,
        }),
      ).toBeNull();
    });

    it("E1A + discoveryAnswered + userInsistedDirect → null (insistence holds stage)", () => {
      expect(
        advanceStageIfComplete(at("PB1", "PB1.E1A"), {
          discoveryAnswered: true,
          userInsistedDirect: true,
        }),
      ).toBeNull();
    });

    it("E3 + discoveryAnswered + userInsistedDirect → null (insistence holds even at E3)", () => {
      expect(
        advanceStageIfComplete(at("PB1", "PB1.E3"), {
          discoveryAnswered: true,
          userInsistedDirect: true,
        }),
      ).toBeNull();
    });

    it("E3 + discoveryAnswered + no guards → PB1.E4 (normal path)", () => {
      expect(
        advanceStageIfComplete(at("PB1", "PB1.E3"), {
          discoveryAnswered: true,
          directQuestionAsked: false,
          userInsistedDirect: false,
        }),
      ).toBe("PB1.E4");
    });

    it("E2B + discoveryAnswered → PB1.E3 (E2B path works, not just E2A)", () => {
      expect(
        advanceStageIfComplete(at("PB1", "PB1.E2B"), {
          discoveryAnswered: true,
        }),
      ).toBe("PB1.E3");
    });

    it("purity guard: does not mutate signals object containing all new fields", () => {
      const signals: AdvanceSignals = {
        discoveryAnswered: true,
        trialProposed: false,
        userAccepted: false,
        priceObjection: false,
        detectedAvatar: "intermedio",
        directQuestionAsked: false,
        userInsistedDirect: false,
      };
      const frozen: AdvanceSignals = { ...signals };
      advanceStageIfComplete(at("PB1", "PB1.E1A"), signals);
      expect(signals).toEqual(frozen);
    });

    it("purity guard: deterministic across 100 calls with detectedAvatar=intermedio at E1A", () => {
      const results = new Set<StageId | null>();
      for (let i = 0; i < 100; i++) {
        results.add(
          advanceStageIfComplete(at("PB1", "PB1.E1A"), {
            discoveryAnswered: true,
            detectedAvatar: "intermedio",
          }),
        );
      }
      expect(results.size).toBe(1);
      expect(results.has("PB1.E2B")).toBe(true);
    });
  });
});

// ─── computeAdvanceSignals helpers (quick 14, P0-1) ─────────────────────────
//
// These tests cover the replacement for the broken
// `reply.includes("?") && inbound.trim().length > 0` heuristic that used
// to advance PB1 on any non-empty user reply — including the user's own
// questions ("Sos una IA?", "Quien sos?").

describe("computeAdvanceSignals — discoveryAnswered heuristic (P0-1)", () => {
  const REPLY_WITH_QUESTION = "algo con ?";

  function signals(inbound: string) {
    return computeAdvanceSignals(inbound, REPLY_WITH_QUESTION, null, null);
  }

  it("bare greeting 'Hola' is not a discovery answer", () => {
    expect(signals("Hola").discoveryAnswered).toBe(false);
  });

  it("meta-identity 'Quien sos?' is not a discovery answer", () => {
    expect(signals("Quien sos?").discoveryAnswered).toBe(false);
  });

  it("meta-identity 'Sos una IA?' is not a discovery answer", () => {
    expect(signals("Sos una IA?").discoveryAnswered).toBe(false);
  });

  it("substantive reply 'nunca entrené en mi vida' counts as discovery", () => {
    expect(signals("nunca entrené en mi vida").discoveryAnswered).toBe(true);
  });

  it("substantive reply 'quiero ponerme en forma' counts as discovery", () => {
    expect(signals("quiero ponerme en forma").discoveryAnswered).toBe(true);
  });

  it("monosyllable 'sí' does not count as discovery", () => {
    expect(signals("sí").discoveryAnswered).toBe(false);
  });

  it("short inbound that ends with '?' does not count as discovery", () => {
    expect(signals("dale, cuándo?").discoveryAnswered).toBe(false);
  });

  it("long inbound 'vengo de crossfit hace 2 años' counts as discovery", () => {
    expect(signals("vengo de crossfit hace 2 años").discoveryAnswered).toBe(
      true,
    );
  });

  it("meta-identity variant 'eres un bot?' is not a discovery answer", () => {
    expect(signals("eres un bot?").discoveryAnswered).toBe(false);
  });

  it("helper isQuestion recognises trailing '?'", () => {
    expect(isQuestion("hola?")).toBe(true);
  });

  it("helper isQuestion recognises 'qué' starter without '?'", () => {
    expect(isQuestion("qué tal")).toBe(true);
  });

  it("helper isMetaIdentityQuery catches 'inteligencia artificial'", () => {
    expect(isMetaIdentityQuery("sos una inteligencia artificial")).toBe(true);
  });

  it("helper isBareGreeting catches 'buenas tardes!'", () => {
    expect(isBareGreeting("buenas tardes!")).toBe(true);
  });

  it("helper hasMinimumContent true for 20-char borderline", () => {
    expect(hasMinimumContent("vengo de crossfit abc")).toBe(true);
  });

  it("helper hasMinimumContent false for 'ok'", () => {
    expect(hasMinimumContent("ok")).toBe(false);
  });
});

// ─── computeAdvanceSignals — userAccepted narrowing (P1-5) ──────────────────

describe("computeAdvanceSignals — userAccepted regex narrowing (P1-5)", () => {
  it("'genial, cuándo hay clases?' does NOT count as acceptance", () => {
    const s = computeAdvanceSignals(
      "genial, cuándo hay clases?",
      "ok",
      null,
      null,
    );
    expect(s.userAccepted).toBe(false);
  });

  it("'perfecto, qué precio tiene?' does NOT count as acceptance", () => {
    const s = computeAdvanceSignals(
      "perfecto, qué precio tiene?",
      "ok",
      null,
      null,
    );
    expect(s.userAccepted).toBe(false);
  });

  it("'dale' still counts as acceptance", () => {
    const s = computeAdvanceSignals("dale", "ok", null, null);
    expect(s.userAccepted).toBe(true);
  });

  it("'sí' standalone still counts as acceptance", () => {
    const s = computeAdvanceSignals("sí", "ok", null, null);
    expect(s.userAccepted).toBe(true);
  });

  it("'anotame' still counts as acceptance", () => {
    const s = computeAdvanceSignals("anotame por favor", "ok", null, null);
    expect(s.userAccepted).toBe(true);
  });
});

// ─── computeAdvanceSignals — userInsistedDirect broadening (P1-6) ───────────

describe("computeAdvanceSignals — userInsistedDirect broadening (P1-6)", () => {
  it("'precio?' triggers userInsistedDirect", () => {
    const s = computeAdvanceSignals("precio?", "ok", null, null);
    expect(s.userInsistedDirect).toBe(true);
  });

  it("'cuánto sale' triggers userInsistedDirect", () => {
    const s = computeAdvanceSignals("cuánto sale", "ok", null, null);
    expect(s.userInsistedDirect).toBe(true);
  });

  it("'mandame los precios' triggers userInsistedDirect", () => {
    const s = computeAdvanceSignals("mandame los precios", "ok", null, null);
    expect(s.userInsistedDirect).toBe(true);
  });

  it("'quiero saber el precio' triggers userInsistedDirect", () => {
    const s = computeAdvanceSignals("quiero saber el precio", "ok", null, null);
    expect(s.userInsistedDirect).toBe(true);
  });
});

// ─── computeAdvanceSignals — stage-specific content gate (P0-3 / quick 15) ──
//
// "Hola buenas, quería consultar por calistenia" used to slip past
// `discoveryAnswered` because it has 5+ words (passes hasMinimumContent).
// hasStageSpecificContent now requires the inbound to contain at least one
// keyword that plausibly answers the CURRENT stage's question.

describe("hasStageSpecificContent + discoveryAnswered — stage gate (P0-3)", () => {
  it("'Hola buenas, quería consultar por calistenia' at PB1.E1A → false", () => {
    expect(
      hasStageSpecificContent(
        "Hola buenas, quería consultar por calistenia",
        "PB1.E1A",
      ),
    ).toBe(false);
    const s = computeAdvanceSignals(
      "Hola buenas, quería consultar por calistenia",
      "algo con ?",
      null,
      "PB1.E1A",
    );
    expect(s.discoveryAnswered).toBe(false);
  });

  it("'nunca entrené en mi vida' at PB1.E1A → true", () => {
    expect(hasStageSpecificContent("nunca entrené en mi vida", "PB1.E1A")).toBe(
      true,
    );
    // [STAGE-02 alignment, v5.3.2 Phase 90]
    // Pre-90: `discoveryAnswered` was content_gate ∧ existing_gates.
    // Post-90: adds AND turn_count ≥ 2 for E1A/E1B. This assertion now
    // passes a turnCountIncludingThis=2 so it exercises the content-gate
    // branch as before. Authoritative behavioral lock lives in Phase 92
    // (RLOK-01).
    const s = computeAdvanceSignals(
      "nunca entrené en mi vida",
      "algo con ?",
      null,
      "PB1.E1A",
      2,
    );
    expect(s.discoveryAnswered).toBe(true);
  });

  it("'hace 2 años que hago crossfit' at PB1.E1A → true", () => {
    expect(
      hasStageSpecificContent("hace 2 años que hago crossfit", "PB1.E1A"),
    ).toBe(true);
    // [STAGE-02 alignment, v5.3.2 Phase 90] — see note above.
    const s = computeAdvanceSignals(
      "hace 2 años que hago crossfit",
      "algo con ?",
      null,
      "PB1.E1A",
      2,
    );
    expect(s.discoveryAnswered).toBe(true);
  });

  it("'vengo del gym hace años' at PB1.E1B → true", () => {
    expect(hasStageSpecificContent("vengo del gym hace años", "PB1.E1B")).toBe(
      true,
    );
    // [STAGE-02 alignment, v5.3.2 Phase 90] — see note above.
    const s = computeAdvanceSignals(
      "vengo del gym hace años",
      "algo con ?",
      null,
      "PB1.E1B",
      2,
    );
    expect(s.discoveryAnswered).toBe(true);
  });

  it("'quiero aprender skills' at PB1.E2A → true", () => {
    expect(hasStageSpecificContent("quiero aprender skills", "PB1.E2A")).toBe(
      true,
    );
    const s = computeAdvanceSignals(
      "quiero aprender skills",
      "algo con ?",
      null,
      "PB1.E2A",
    );
    expect(s.discoveryAnswered).toBe(true);
  });

  it("'busco ponerme en forma' at PB1.E2A → true", () => {
    expect(hasStageSpecificContent("busco ponerme en forma", "PB1.E2A")).toBe(
      true,
    );
    const s = computeAdvanceSignals(
      "busco ponerme en forma",
      "algo con ?",
      null,
      "PB1.E2A",
    );
    expect(s.discoveryAnswered).toBe(true);
  });

  it("'me queda cerca mogotes' at PB1.E3 → true", () => {
    expect(hasStageSpecificContent("me queda cerca mogotes", "PB1.E3")).toBe(
      true,
    );
    const s = computeAdvanceSignals(
      "me queda cerca mogotes",
      "algo con ?",
      null,
      "PB1.E3",
    );
    expect(s.discoveryAnswered).toBe(true);
  });

  it("'puedo los martes a la tarde' at PB1.E3 → true", () => {
    expect(
      hasStageSpecificContent("puedo los martes a la tarde", "PB1.E3"),
    ).toBe(true);
    const s = computeAdvanceSignals(
      "puedo los martes a la tarde",
      "algo con ?",
      null,
      "PB1.E3",
    );
    expect(s.discoveryAnswered).toBe(true);
  });

  it("'no sé, cualquier cosa me sirve' at PB1.E2A → false", () => {
    expect(
      hasStageSpecificContent("no sé, cualquier cosa me sirve", "PB1.E2A"),
    ).toBe(false);
    const s = computeAdvanceSignals(
      "no sé, cualquier cosa me sirve",
      "algo con ?",
      null,
      "PB1.E2A",
    );
    expect(s.discoveryAnswered).toBe(false);
  });

  it("'algo random sin keywords' at PB1.E3 → false", () => {
    expect(hasStageSpecificContent("algo random sin keywords", "PB1.E3")).toBe(
      false,
    );
    const s = computeAdvanceSignals(
      "algo random sin keywords",
      "algo con ?",
      null,
      "PB1.E3",
    );
    expect(s.discoveryAnswered).toBe(false);
  });

  it("stage=null → hasStageSpecificContent passes through (true)", () => {
    expect(
      hasStageSpecificContent(
        "Hola buenas, quería consultar por calistenia",
        null,
      ),
    ).toBe(true);
    // discoveryAnswered still subject to other gates; here it's not a
    // question, not meta, not bare greeting, has min content → true.
    const s = computeAdvanceSignals(
      "Hola buenas, quería consultar por calistenia",
      "algo con ?",
      null,
      null,
    );
    expect(s.discoveryAnswered).toBe(true);
  });

  it("stage=PB1.E4 → hasStageSpecificContent passes through (true)", () => {
    expect(
      hasStageSpecificContent("cualquier texto sin keywords", "PB1.E4"),
    ).toBe(true);
  });
});
