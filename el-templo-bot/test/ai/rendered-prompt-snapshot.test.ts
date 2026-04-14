/**
 * Surgical snapshot tripwire (Phase 88 — QREG-02 supplement).
 *
 * This is a SINGLE snapshot for the PB1.E1A lead rendered system prompt. It is
 * NOT a correctness gate — the behavioral locks live in knowledge-gating.test.ts
 * and prompt-size.test.ts. This test exists so that any unintentional drift in
 * the rendered prompt surfaces loudly in PR review.
 *
 * UPDATE DISCIPLINE: regenerating pb1-e1a-lead-rendered.snap.txt requires an
 * explicit commit with justification in the message (e.g., "snapshot: update
 * PB1.E1A lead render after <reason>"). Do NOT auto-update from a failing
 * test run without human sign-off.
 *
 * Deliberately scoped to the lead path only — per-state snapshots were
 * evaluated and deferred (see
 * .planning/phases/88-quality-regression-lock/88-CONTEXT.md — "Deferred Ideas").
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { getSystemPrompt } from "../../src/ai/system-prompt.js";

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = resolve(
  here,
  "../fixtures/pb1-e1a-lead-rendered.snap.txt",
);

describe("Rendered prompt snapshot tripwire (PB1.E1A lead)", () => {
  it("renders byte-equal to the committed fixture", () => {
    const expected = readFileSync(FIXTURE_PATH, "utf8");
    const actual = getSystemPrompt({
      clientState: "lead",
      activePlaybook: "PB1",
      currentStage: "E1A",
    });
    expect(actual).toEqual(expected);
  });
});
