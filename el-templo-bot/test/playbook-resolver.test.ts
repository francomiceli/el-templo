/**
 * Unit tests for the pure playbook resolver.
 *
 * The resolver must be:
 *   - deterministic (no Date.now, no Math.random)
 *   - pure (no IO, no Redis, no logging)
 *   - exhaustive over the 5 client states + cancellation + session reuse
 *   - a v5.3 scope guard (PB6 MUST NOT be in the registry)
 */

import { describe, it, expect } from "vitest";

import { PLAYBOOKS, resolvePlaybook } from "../src/playbooks/index.js";
import type {
  PlaybookSessionState,
  ResolveContact,
} from "../src/playbooks/types.js";
import type { ClientState } from "../src/state/machine.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

function contact(
  clientState: ClientState,
  cancellationIntent = false,
): ResolveContact {
  return { clientState, cancellationIntent };
}

function session(
  activePlaybook: PlaybookSessionState["activePlaybook"],
  currentStage: PlaybookSessionState["currentStage"],
): PlaybookSessionState {
  return {
    activePlaybook,
    currentStage,
    updatedAt: 1_700_000_000_000,
  };
}

// ─── Fresh state -> playbook mapping ────────────────────────────────────────

describe("resolvePlaybook — fresh state mapping", () => {
  it("lead -> PB1 entry stage (PB1.E1A)", () => {
    expect(resolvePlaybook(contact("lead"), null)).toEqual({
      playbookId: "PB1",
      stageId: "PB1.E1A",
    });
  });

  it("trial -> PB2 entry stage (PB2.E1A)", () => {
    expect(resolvePlaybook(contact("trial"), null)).toEqual({
      playbookId: "PB2",
      stageId: "PB2.E1A",
    });
  });

  it("expired_member -> PB3 entry stage (PB3.E1)", () => {
    expect(resolvePlaybook(contact("expired_member"), null)).toEqual({
      playbookId: "PB3",
      stageId: "PB3.E1",
    });
  });

  it("inactive_member -> PB4 entry stage (PB4.E1A)", () => {
    expect(resolvePlaybook(contact("inactive_member"), null)).toEqual({
      playbookId: "PB4",
      stageId: "PB4.E1A",
    });
  });

  it("active_member with no signals -> {null, null} (no active playbook)", () => {
    expect(resolvePlaybook(contact("active_member"), null)).toEqual({
      playbookId: null,
      stageId: null,
    });
  });
});

// ─── Cancellation intent override ───────────────────────────────────────────

describe("resolvePlaybook — cancellation intent override", () => {
  it("cancellationIntent on a lead still routes to PB5", () => {
    expect(resolvePlaybook(contact("lead", true), null)).toEqual({
      playbookId: "PB5",
      stageId: "PB5.E1",
    });
  });

  it("cancellationIntent on an active_member routes to PB5", () => {
    expect(resolvePlaybook(contact("active_member", true), null)).toEqual({
      playbookId: "PB5",
      stageId: "PB5.E1",
    });
  });

  it("cancellationIntent on an inactive_member routes to PB5 (overrides PB4)", () => {
    expect(resolvePlaybook(contact("inactive_member", true), null)).toEqual({
      playbookId: "PB5",
      stageId: "PB5.E1",
    });
  });

  it("cancellationIntent overrides any in-flight session", () => {
    const result = resolvePlaybook(
      contact("lead", true),
      session("PB1", "PB1.E3"),
    );
    expect(result).toEqual({ playbookId: "PB5", stageId: "PB5.E1" });
  });
});

// ─── Session reuse ──────────────────────────────────────────────────────────

describe("resolvePlaybook — session reuse", () => {
  it("honors a mid-flight PB1 stage when clientState is still lead", () => {
    const result = resolvePlaybook(contact("lead"), session("PB1", "PB1.E3"));
    expect(result).toEqual({ playbookId: "PB1", stageId: "PB1.E3" });
  });

  it("honors a mid-flight PB2 stage when clientState is still trial", () => {
    const result = resolvePlaybook(contact("trial"), session("PB2", "PB2.E2"));
    expect(result).toEqual({ playbookId: "PB2", stageId: "PB2.E2" });
  });

  it("discards a stale session whose playbook no longer matches clientState", () => {
    // Contact is now expired_member but session still points at PB1.
    // The stale session must be ignored and the fresh mapping used.
    const result = resolvePlaybook(
      contact("expired_member"),
      session("PB1", "PB1.E2A"),
    );
    expect(result).toEqual({ playbookId: "PB3", stageId: "PB3.E1" });
  });

  it("discards a session whose stageId does not exist in the registry", () => {
    const result = resolvePlaybook(
      contact("lead"),
      session("PB1", "PB1.E99_BOGUS"),
    );
    expect(result).toEqual({ playbookId: "PB1", stageId: "PB1.E1A" });
  });

  it("null session on a lead returns entry stage", () => {
    expect(resolvePlaybook(contact("lead"), null)).toEqual({
      playbookId: "PB1",
      stageId: "PB1.E1A",
    });
  });

  it("session with null fields is treated as no session", () => {
    const result = resolvePlaybook(contact("trial"), session(null, null));
    expect(result).toEqual({ playbookId: "PB2", stageId: "PB2.E1A" });
  });
});

// ─── PB6 scope guard ────────────────────────────────────────────────────────

describe("PLAYBOOKS registry — v5.3 scope guard", () => {
  it("PB6 is absent from the registry", () => {
    expect((PLAYBOOKS as Record<string, unknown>).PB6).toBeUndefined();
  });

  it("registry contains exactly PB1..PB5", () => {
    expect(Object.keys(PLAYBOOKS).sort()).toEqual([
      "PB1",
      "PB2",
      "PB3",
      "PB4",
      "PB5",
    ]);
  });

  it("every playbook has a non-empty Spanish entry-stage promptSection", () => {
    for (const pb of Object.values(PLAYBOOKS)) {
      const entry = pb.stages.find((s) => s.id === pb.entryStageId);
      expect(entry).toBeDefined();
      expect(entry?.promptSection.length).toBeGreaterThan(10);
    }
  });
});

// ─── Purity smoke test ──────────────────────────────────────────────────────

describe("resolvePlaybook — purity", () => {
  it("returns deeply equal results across 100 repeated calls (no hidden randomness)", () => {
    const input = contact("lead");
    const first = resolvePlaybook(input, null);
    for (let i = 0; i < 100; i++) {
      expect(resolvePlaybook(input, null)).toEqual(first);
    }
  });

  it("does not mutate the input contact", () => {
    const input: ResolveContact = {
      clientState: "lead",
      cancellationIntent: false,
    };
    const snapshot = { ...input };
    resolvePlaybook(input, null);
    expect(input).toEqual(snapshot);
  });

  it("does not mutate the input session", () => {
    const s = session("PB1", "PB1.E3");
    const snapshot = { ...s };
    resolvePlaybook(contact("lead"), s);
    expect(s).toEqual(snapshot);
  });
});
