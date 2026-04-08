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
