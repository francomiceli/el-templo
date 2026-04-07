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

    it("PB2.E2 + priceObjection → PB2.E3", () => {
      expect(
        advanceStageIfComplete(at("PB2", "PB2.E2"), { priceObjection: true }),
      ).toBe("PB2.E3");
    });

    it("PB2.E2 + only discoveryAnswered → null (needs price objection)", () => {
      expect(
        advanceStageIfComplete(at("PB2", "PB2.E2"), {
          discoveryAnswered: true,
        }),
      ).toBeNull();
    });

    it("PB2.E3 + any signals → null (terminal stage in v5.3)", () => {
      expect(
        advanceStageIfComplete(at("PB2", "PB2.E3"), {
          priceObjection: true,
          userAccepted: true,
        }),
      ).toBeNull();
    });
  });

  // ── PB3 / PB4 / PB5 ────────────────────────────────────────────────────

  describe("PB3 / PB4 / PB5 (no advancement rules in v5.3)", () => {
    it("PB3.E1 + any signals → null", () => {
      expect(
        advanceStageIfComplete(at("PB3", "PB3.E1"), {
          discoveryAnswered: true,
          userAccepted: true,
          priceObjection: true,
        }),
      ).toBeNull();
    });

    it("PB4.E1A + any signals → null", () => {
      expect(
        advanceStageIfComplete(at("PB4", "PB4.E1A"), {
          discoveryAnswered: true,
        }),
      ).toBeNull();
    });

    it("PB5.E1 + any signals → null", () => {
      expect(
        advanceStageIfComplete(at("PB5", "PB5.E1"), { userAccepted: true }),
      ).toBeNull();
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
});
