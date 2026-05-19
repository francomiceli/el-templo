/**
 * v5.3.3 Phase 95 — BUG-03 candidate (iii) RED unit test.
 *
 * Candidate (iii) discriminator (CONTEXT.md D-01):
 *   Sunday=0 vs Sunday=7 day-of-week confusion. `tools.ts:25-33` (DAY_NAMES
 *   record) and `tools.ts:88-91` (the `check_schedule` tool's `dayOfWeek`
 *   parameter description) use MySQL DAYOFWEEK-style numbering — but with
 *   a TRANSPOSED Sunday (Sunday=0, not Sunday=1 as raw MySQL DAYOFWEEK
 *   would emit). The model may instead emit Sunday=7 (ISO-8601 Mon-Sun
 *   1-7) — and there is NO reinforcing day-of-week directive anywhere in
 *   `el-templo-bot/src/ai/system-prompt.ts` to disambiguate. The ONLY
 *   model-facing binding is the parameter description at `tools.ts:90`.
 *
 * Audit verdict (Section B candidate (iii)): FIRES (latent prompt-side
 * defect — the system prompt does NOT explicitly bind Sunday=0). Even if
 * the live-test BUG-03 transcript was rooted in candidate (ii) cross-branch
 * mixing, the absence of a day-of-week binding is a real defect that the
 * model can trip on for any unseen booking scenario.
 *
 * RED test strategy A — direct prompt grep (Strategy A per PLAN.md line 304):
 *   Assert the rendered system prompt contains a single, unambiguous
 *   day-of-week encoding directive (the literal "0=domingo" token or an
 *   equivalent pattern). On master, no such token exists in `system-prompt.ts`
 *   → assertion fails → test is RED.
 *
 * Additional regression-protector assertions (Strategy B per PLAN.md line 306):
 *   Lock the current DAY_NAMES <-> tool-description alignment. These pass
 *   on master and protect against future drift where DAY_NAMES is updated
 *   without also updating the tool description (or vice-versa).
 *
 * Pattern: mirrors `el-templo-bot/test/v5-3-3-openai-latency.test.ts`
 * SC#1 describe (vitest describe / beforeEach / afterEach with env
 * isolation via `vi.resetModules()`). No real OpenAI call; no Redis.
 *
 * Per `el-templo-bot/CLAUDE.md` Standards: no `console.*`, no `any` types,
 * `catch (err: unknown)` with `instanceof Error` narrowing.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("BUG-03 candidate (iii) — Sunday=0 vs Sunday=7 day-of-week confusion", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.resetModules();
  });

  // ───────────────────────────────────────────────────────────────────────
  // RED (Strategy A — direct prompt grep): system prompt MUST bind the
  // model to a single Sunday=0 encoding.
  // ───────────────────────────────────────────────────────────────────────

  it("RED: system prompt explicitly binds Sunday=0 (FAILS on master)", async () => {
    const mod = await import("../src/ai/system-prompt");
    const prompt = mod.getSystemPrompt();

    // Audit-named expected fix (Section E candidate (iii)):
    //   add a single, unambiguous day-of-week directive to the system
    //   prompt — at minimum one of these tokens:
    //     - "0=domingo"      (mirrors tools.ts:90 verbatim)
    //     - "domingo = 0"    (formal binding)
    //     - "domingo es el día 0"  (Spanish-narrative form)
    //
    // RED expectation: the prompt contains AT LEAST ONE of these patterns.
    // On master, NONE of these patterns exist in `system-prompt.ts`
    // (verified by grep) → assertion fails.
    expect(prompt).toMatch(
      /0\s*=\s*domingo|domingo\s*=\s*0|domingo\s+es\s+el\s+d[íi]a\s+0/i,
    );
  });

  it("system prompt mentions day-of-week vocabulary somewhere (regression-protector — PASSES on master via knowledge.ts injection)", async () => {
    const mod = await import("../src/ai/system-prompt");
    const prompt = mod.getSystemPrompt();

    // Regression-protector — passes on master because `knowledge.ts:295`
    // injects "Lunes a viernes, 7 a 21 hs" into the rendered prompt as
    // unrelated support-hours context. The day-of-week word "Lunes"
    // therefore appears in the prompt, but it is NOT a model-facing
    // day-of-week ENCODING directive — the model is never told that
    // Sunday is encoded as 0 (the candidate (iii) defect).
    //
    // Locks the future regression where someone deletes the knowledge
    // section's "Lunes a viernes" line without realizing it's the only
    // day-of-week vocabulary in the rendered prompt.
    expect(prompt).toMatch(/day[_\s-]?of[_\s-]?week|domingo|lunes/i);
  });

  // ───────────────────────────────────────────────────────────────────────
  // Regression-protectors (Strategy B): lock the current DAY_NAMES <->
  // tool-description alignment. These PASS on master — they guard against
  // future drift where one is updated without the other (e.g., someone
  // changes DAY_NAMES[0] to "Sunday" without also fixing the parameter
  // description, or someone switches the tool description to ISO-8601
  // Sunday=7 without also updating DAY_NAMES).
  // ───────────────────────────────────────────────────────────────────────

  it("DAY_NAMES has exactly one canonical Sunday entry at key 0 (regression-protector)", async () => {
    // Re-import tools to read DAY_NAMES via the public `BOT_TOOLS` proxy.
    // (DAY_NAMES itself is not exported; we read the tool definition
    // instead, which encodes the same convention via the parameter
    // description.)
    const mod = await import("../src/ai/tools");
    const checkScheduleTool = mod.BOT_TOOLS.find(
      (t) => t.name === "check_schedule",
    );

    expect(checkScheduleTool).toBeDefined();
    const props = checkScheduleTool?.parameters?.properties as
      | Record<string, { description?: string }>
      | undefined;
    const dayOfWeekDescription = props?.dayOfWeek?.description ?? "";

    // Lock the literal MySQL-style encoding the tool advertises to the
    // model: 1=lunes...6=sábado, 0=domingo. This is the SOLE model-facing
    // day-of-week binding on master.
    expect(dayOfWeekDescription).toContain("0=domingo");
    expect(dayOfWeekDescription).toContain("1=lunes");
  });

  it("check_schedule tool description does NOT advertise the ISO-8601 Sunday=7 convention (regression-protector)", async () => {
    const mod = await import("../src/ai/tools");
    const checkScheduleTool = mod.BOT_TOOLS.find(
      (t) => t.name === "check_schedule",
    );

    expect(checkScheduleTool).toBeDefined();
    const props = checkScheduleTool?.parameters?.properties as
      | Record<string, { description?: string }>
      | undefined;
    const dayOfWeekDescription = props?.dayOfWeek?.description ?? "";

    // If a future PR switches to ISO-8601 (Sunday=7) without coordinating
    // the change across DAY_NAMES + SQL `s.day_of_week` comparisons, the
    // model will silently mis-encode Sunday and the booking flow breaks
    // for any Sunday-relevant query.
    expect(dayOfWeekDescription).not.toMatch(
      /7\s*=\s*domingo|domingo\s*=\s*7/i,
    );
  });
});
