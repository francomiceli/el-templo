---
phase: 94-openai-latency-graceful-failure
verified: 2026-05-17T23:05:37Z
status: human_needed
score: 4/4 must-haves verified
overrides_applied: 0
gaps: []
human_verification:
  - test: "Decide CR-02 disposition: SDK maxRetries default is 2 — the canonical invariant formula (45s × 5 + 30s × 5 + 20 = 395s) under-counts worst-case `provider.chat` wall-clock by ~3×. Real worst-case per-call is up to 3×45000 ms = 135s (SDK transparently retries on 5xx / APIConnectionError). The phase test SC#4 locks the wrong floor."
    expected: "User decides one of: (a) explicit `maxRetries: 0` on the OpenAI client + add SC#5 test + tighten formula (preferred — bot already has WhatsApp webhook redelivery semantics); (b) keep `maxRetries: 2`, update the invariant formula + .env.example comment block + 4 canonical-doc invariant blocks + check-debounce-invariant.sh to use TIMEOUT_S*(1+maxRetries)*MAX_TOOL_ITERATIONS = 675s and re-derive DEBOUNCE_TTL_SECONDS floor; (c) accept the gap with documented rationale (e.g., 5xx retries empirically rare in production) — record as Phase 94 deviation override."
    why_human: "Architectural decision with cross-phase invariant implications (touches 4 canonical docs + handler comments + .env.example + script). The phase as shipped still satisfies the goal text (no infinite stall — bounded at 135s worst-case per call) and BUG-02's specific failure (~3min) is now bounded under 3min, but the canonical invariant formula is mathematically incorrect. Cannot be programmatically resolved — requires user to choose between scope expansion now vs. defer-with-known-gap."
  - test: "Decide CR-01 disposition: LAT-02 interim UX path uses `err instanceof OpenAI.APIError` discriminator, which silently no-ops when `AI_PROVIDER=anthropic` (factory still supports it; Anthropic.APIError is a different constructor identity)."
    expected: "User decides: (a) accept — production is locked to AI_PROVIDER=openai per .env.example line 21, Anthropic path is dormant; document as known limitation; (b) add provider-agnostic isProviderApiError helper in provider.ts and rewire handler discriminator."
    why_human: "Provider-abstraction quality issue. Does not block BUG-02 closure for the current production path (OpenAI). Open question is whether to harden the dormant Anthropic path in v5.3.3 scope or defer."
  - test: "Decide WR-01 disposition: When provider.chat throws APIError, the user receives 'Dame un segundo 🙌' immediately followed by 'Tuve un problemita técnico, ¿me lo escribís de nuevo?' with no perceptible delay. The 'give me a second' promise is contradicted within the same WhatsApp delivery batch."
    expected: "User decides: (a) accept — the goal is graceful failure, not UX polish; (b) suppress the apology when interimSent === true by lifting the interimSent flag to handleInboundMessage scope. Tests SC#2 + SC#3 both assert this back-to-back sequence."
    why_human: "UX judgment call. Both messages firing is functionally correct (handler returned cleanly, user knows something failed). Whether the sequence is acceptable depends on user-facing tone preferences that grep cannot adjudicate."
  - test: "Live BUG-02 smoke test: deploy v5.3.3 to staging with OpenAI key, simulate a slow upstream (e.g., temporarily throttle to a known-slow model or use a network sleep proxy), send an inbound WhatsApp message, observe (1) handler bails within ~45s wall-clock per provider.chat call, (2) user receives 'Dame un segundo 🙌' once, (3) user receives 'Tuve un problemita técnico…' graceful fallback, (4) bot process does not crash and is ready to handle the next message."
    expected: "End-to-end: interim message arrives within ~45s of upstream stall; graceful fallback arrives once SDK throws; no process exit / no infinite loop / no double-handling of next inbound."
    why_human: "Unit tests prove the catch path wires; only a live WhatsApp send confirms (a) Meta delivery latency does not undermine UX, (b) the LAT-02 interim message is actually perceived by the user during a real stall, (c) the graceful fallback closes the conversation gracefully on a real device."
---

# Phase 94: OpenAI Latency + Graceful Failure — Verification Report

**Phase Goal:** A slow or hung OpenAI request can no longer silently stall the handler for minutes. The OpenAI SDK is bounded by an explicit timeout, the handler sends an interim UX message when the call exceeds the timeout boundary, and a graceful fallback is sent (and the bot returns cleanly) if a retry also fails. Closes BUG-02 from the post-v5.3.2 live test (~3min response latency window 22:23-22:26).
**Verified:** 2026-05-17T23:05:37Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                                                                                                                                    | Status   | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | When provider.chat hangs (SDK never returns), the handler bails within the timeout boundary instead of stalling for the SDK's 600s default                                                               | VERIFIED | `openai.ts:48-53` resolves `OPENAI_TIMEOUT_MS` (default 45000) and passes to `new OpenAI({ timeout })`. Behavioral spot-check: `new OpenAI({timeout:45000}).timeout === 45000` confirmed. Test SC#1 (3 sub-tests) asserts default + override + invalid-fallback all converge to expected timeout. **Caveat:** SDK `maxRetries=2` default means worst-case per-call is 3×45s=135s, not 45s — see human verification CR-02. |
| 2   | When provider.chat throws OpenAI.APIError (incl. APIConnectionTimeoutError), the user receives 'Dame un segundo 🙌' via sendTextMessage exactly once per inbound                                         | VERIFIED | `handler.ts:445-458` defines `sendInterimUx` closure with single-fire `interimSent` guard. `handler.ts:653-656` and `:721-724` wrap both `provider.chat` await sites with `if (err instanceof OpenAI.APIError) await sendInterimUx()`. Test SC#2 asserts exactly one interim send when APIError thrown. **Caveat:** discriminator is OpenAI-specific (CR-01) — silent no-op on Anthropic provider path.                   |
| 3   | When the OpenAI call ultimately fails, the user receives 'Tuve un problemita técnico, ¿me lo escribís de nuevo?' and processWithAi returns cleanly — no throw escapes, no infinite loop, no process exit | VERIFIED | `handler.ts:345-370` outer catch (post-mod) executes `log.error(...)` then inner-try sends graceful fallback; inner-try swallows + logs send failures. No `throw` in catch path. Test SC#3 asserts `expect(p).resolves.toBeUndefined()` AND both interim + graceful sends fired (1 each). **Caveat:** WR-01 — both messages fire back-to-back when APIError triggers LAT-02 then propagates to LAT-03; UX contradiction.  |
| 4   | The Cross-Phase Invariant holds with current defaults: `DEBOUNCE_TTL_SECONDS (600) ≥ (OPENAI_TIMEOUT_MS/1000)*5 + 30*5 + 20 = 395`                                                                       | VERIFIED | `bash el-templo-bot/scripts/check-debounce-invariant.sh` → `Cross-phase invariant OK: TTL=600 >= minimum 395` (exit 0). Spot-check `DEBOUNCE_TTL_SECONDS=100 bash …` → INVARIANT VIOLATION (exit 1) confirms guard works in both directions. **Caveat:** formula ignores SDK retries (CR-02) — see human verification.                                                                                                    |

**Score:** 4/4 truths verified (with three documented caveats requiring human disposition).

### Required Artifacts

| Artifact                                            | Expected                                               | Status   | Details                                                                                                                                                                                                                              |
| --------------------------------------------------- | ------------------------------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `el-templo-bot/src/ai/openai.ts`                    | OpenAI SDK client with explicit timeout option         | VERIFIED | `:48-53` — `new OpenAI({ timeout: timeout })` with `resolveOpenAiTimeoutMs()` helper at `:37-42`. Defensive parsing: undefined/empty/non-numeric falls back to 45000. Catch at `:109-124` re-throws raw `OpenAI.APIError`.           |
| `el-templo-bot/src/webhook/handler.ts`              | LAT-02 interim-message wrap + LAT-03 graceful fallback | VERIFIED | `:14` imports OpenAI default; `:445-458` `sendInterimUx` closure; `:650-657` LAT-02 site #1; `:718-725` LAT-02 site #2; `:345-370` LAT-03 outer catch with inner-try graceful send.                                                  |
| `el-templo-bot/.env.example`                        | OPENAI_TIMEOUT_MS declaration                          | VERIFIED | `:24-26` — 3 lines: comment line × 2 + `OPENAI_TIMEOUT_MS=45000`. Pre-existing Phase-93 invariant block at `:39-45` unchanged.                                                                                                       |
| `el-templo-bot/test/v5-3-3-openai-latency.test.ts`  | TDD fail-in-main unit suite covering SC#1..#4          | VERIFIED | 517 lines, 6 test cases. All 6 PASS at HEAD. RED commit `fa65e5b3` (file only) immediately precedes GREEN commit `d3de86b1`.                                                                                                         |
| `el-templo-bot/scripts/check-debounce-invariant.sh` | Cross-Phase Invariant guard script (manual / CI)       | VERIFIED | 35 lines, executable (`-rwxr-xr-x`), `set -euo pipefail`, formula matches canonical block, exit 0 on PASS / exit 1 on INVARIANT VIOLATION. Not wired into git hooks (intentional — Phase 94 owns creation; hook wiring is deferred). |

### Key Link Verification

| From                                            | To                                             | Via                                               | Status | Details                                                                                                                                                               |
| ----------------------------------------------- | ---------------------------------------------- | ------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `openai.ts:50`                                  | `process.env.OPENAI_TIMEOUT_MS`                | constructor option via `resolveOpenAiTimeoutMs()` | WIRED  | `:38` reads env, `:50` passes resolved value to constructor. Logger payload at `:52` includes resolved timeout for boot-time confirmation.                            |
| `handler.ts:345-370` (outer catch)              | `sendTextMessage(message.phone, ...)`          | catch block on processWithAi                      | WIRED  | `:358-361` `await sendTextMessage(phone, "Tuve un problemita técnico, ¿me lo escribís de nuevo?")` inside inner-try; `:362-369` swallows + logs send failures.        |
| `handler.ts:650-657` + `:718-725` (catch sites) | `sendTextMessage(phone, "Dame un segundo 🙌")` | OpenAI.APIError catch path → `sendInterimUx`      | WIRED  | Two `provider.chat` await sites both call `sendInterimUx()` on APIError; closure flips single-fire flag; `:449` calls `sendTextMessage(phone, "Dame un segundo 🙌")`. |

### Data-Flow Trace (Level 4)

| Artifact                          | Data Variable                                | Source                                                                           | Produces Real Data           | Status  |
| --------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------- | ------- |
| `openai.ts` (client construction) | `timeout` (constructor arg)                  | `resolveOpenAiTimeoutMs()` → `process.env.OPENAI_TIMEOUT_MS` with fallback 45000 | Yes (env-sourced + default)  | FLOWING |
| `handler.ts` `sendInterimUx`      | "Dame un segundo 🙌" string literal          | Inline literal in `:449`                                                         | Yes (literal copy)           | FLOWING |
| `handler.ts` outer catch (LAT-03) | "Tuve un problemita técnico…" string literal | Inline literal in `:360`                                                         | Yes (literal copy)           | FLOWING |
| `check-debounce-invariant.sh`     | TTL/TIMEOUT_S/etc.                           | Env with defaults (TTL=600, OPENAI_TIMEOUT_MS=45000, etc.)                       | Yes (env-sourced + defaults) | FLOWING |

### Behavioral Spot-Checks

| Behavior                                                         | Command                                                                                     | Result                                                                              | Status |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------ |
| Phase 94 unit suite passes                                       | `pnpm test v5-3-3-openai-latency`                                                           | `Tests 6 passed (6)`                                                                | PASS   |
| Phase 93 regression suite remains green                          | `pnpm test v5-3-3-handler-concurrency`                                                      | `Tests 3 passed (3)`                                                                | PASS   |
| Full bot test suite passes                                       | `pnpm test`                                                                                 | `Test Files 28 passed (28) / Tests 615 passed (615)`                                | PASS   |
| TypeScript clean                                                 | `pnpm tsc --noEmit`                                                                         | exit 0 (no errors)                                                                  | PASS   |
| Cross-Phase Invariant script exits 0 at default env              | `bash el-templo-bot/scripts/check-debounce-invariant.sh`                                    | `Cross-phase invariant OK: TTL=600 >= minimum 395` (exit 0)                         | PASS   |
| Invariant script catches violations                              | `DEBOUNCE_TTL_SECONDS=100 bash …/check-debounce-invariant.sh`                               | `INVARIANT VIOLATION: DEBOUNCE_TTL_SECONDS=100 < minimum 395` (exit 1)              | PASS   |
| OpenAI SDK honors `{ timeout }` option (runtime verification)    | `node -e "import('openai').then(m=>console.log(new m.default({timeout:45000}).timeout))"`   | `client.timeout = 45000`                                                            | PASS   |
| Cross-doc invariant block byte-identical across 4 canonical docs | `awk … shasum -a 256` on each of 93-CONTEXT.md, 94-CONTEXT.md, ROADMAP.md, MACRO-ROADMAP.md | All four hash to `7f324a5b642bd1253296b214d24de5d1fafdcd4710bdc78fb270f76adea687b5` | PASS   |

### Probe Execution

No `scripts/*/tests/probe-*.sh` probes declared in PLAN.md or by convention for this phase. SKIPPED.

### Requirements Coverage

| Requirement | Source Plan | Description                                                                                                                                                     | Status    | Evidence                                                                                                                                                                                  |
| ----------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LAT-01      | 94-01-PLAN  | OpenAI client constructed with explicit `timeout` option in `openai.ts:29` — default 45000 ms, env-overridable via `OPENAI_TIMEOUT_MS`. `.env.example` updated. | SATISFIED | `openai.ts:48-53` + `.env.example:24-26`. Defensive parsing for invalid env. SC#1 test (3 cases) PASS.                                                                                    |
| LAT-02      | 94-01-PLAN  | On timeout / `OpenAI.APIError`, handler sends interim UX ("Dame un segundo 🙌") rather than hanging silently. Wraps `provider.chat` at `:584` and `:641`.       | SATISFIED | `handler.ts:650-657` + `:718-725` + `sendInterimUx` closure at `:445-458`. SC#2 test PASS. **Quality caveat (CR-01):** OpenAI-specific discriminator — Anthropic path silently no-ops.    |
| LAT-03      | 94-01-PLAN  | If retry/fallback also fails, send "Tuve un problemita técnico, ¿me lo escribís de nuevo?" and return cleanly — no infinite loop, no crash.                     | SATISFIED | `handler.ts:345-370` outer catch + inner-try graceful send. SC#3 asserts `expect(p).resolves.toBeUndefined()` and both messages fired. **UX caveat (WR-01):** back-to-back send sequence. |

No orphaned requirements: REQUIREMENTS.md lists exactly LAT-01/02/03 for Phase 94 and all three are claimed by `94-01-PLAN.md` frontmatter.

### Anti-Patterns Found

| File                                                | Line | Pattern                                                                                                                           | Severity | Impact                                                                                                                                                                                                           |
| --------------------------------------------------- | ---- | --------------------------------------------------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `el-templo-bot/src/ai/openai.ts`                    | 50   | `{ timeout: timeout }` — verbose property syntax (could be `{ timeout }`).                                                        | INFO     | Style nit (REVIEW IN-01). No behavioral impact.                                                                                                                                                                  |
| `el-templo-bot/src/webhook/handler.ts`              | 14   | Direct `import OpenAI from "openai"` couples webhook handler to one provider; only used for `instanceof` discrimination.          | WARNING  | Provider abstraction breach (REVIEW WR-04 / CR-01). Anthropic provider path's `Anthropic.APIError` is not handled by LAT-02.                                                                                     |
| `el-templo-bot/src/webhook/handler.ts`              | 109  | `Number(process.env.DEBOUNCE_TTL_SECONDS ?? 600)` — pre-existing brittle parse; NaN on non-numeric env causes Redis `SET EX NaN`. | WARNING  | Pre-existing (Phase 93 territory, not Phase 94's surface). REVIEW CR-03. Out-of-scope but worth noting that Phase 94 established the safer pattern (`resolveOpenAiTimeoutMs`) that this site does not yet adopt. |
| `el-templo-bot/src/webhook/handler.ts`              | 444  | `interimSent` closure flag scoped only to `processWithAiInner` — outer catch can't read it.                                       | WARNING  | REVIEW WR-05. Forces back-to-back send sequence (WR-01).                                                                                                                                                         |
| `el-templo-bot/scripts/check-debounce-invariant.sh` | 20   | `TTL=${DEBOUNCE_TTL_SECONDS:-600}` then arithmetic compare — non-numeric env crashes ungracefully under `set -e`.                 | WARNING  | REVIEW WR-06. Operator-error UX; not a correctness bug.                                                                                                                                                          |

**No 🛑 BLOCKER anti-patterns.** No debt markers (`TBD`, `FIXME`, `XXX`, `TODO`, `HACK`) in any Phase-94-modified file. No `console.*` calls. No `: any` types.

### Human Verification Required

1. **CR-02 disposition — SDK retries break the canonical invariant formula** (BLOCKER candidate flipped to human-needed; see frontmatter `human_verification[0]`).
   - **Test:** Inspect `node_modules/openai/index.mjs:41` — SDK default `maxRetries: 2` not overridden by Phase 94. Real worst-case per-`provider.chat` is `3 × 45s = 135s`, not 45s. The Cross-Phase Invariant formula `(OPENAI_TIMEOUT_MS/1000) × MAX_TOOL_ITERATIONS + …` asserts a 395s floor but real worst-case is `135 × 5 + 30 × 5 + 20 = 845s > 600s TTL`.
   - **Expected:** User decides between (a) set `maxRetries: 0` on the OpenAI client (preferred — bot has WhatsApp redelivery), (b) update the formula and TTL across 4 canonical docs + .env.example + check-debounce-invariant.sh + add SC#5 test, or (c) accept the gap with documented rationale.
   - **Why human:** Cross-phase invariant decision with documentation ripple; cannot be resolved by grep.

2. **CR-01 disposition — Anthropic provider path** (frontmatter `human_verification[1]`).
   - **Test:** `grep "AI_PROVIDER" .env.example` shows `AI_PROVIDER=openai` is the locked default. The factory at `src/ai/provider.ts` still supports anthropic. If a future operator flips the env, LAT-02's `err instanceof OpenAI.APIError` discriminator becomes a no-op for Anthropic.APIError throws.
   - **Expected:** Accept (production is OpenAI-only) or harden via `provider.isProviderApiError(err)` helper.
   - **Why human:** Quality decision about hardening a dormant code path.

3. **WR-01 disposition — back-to-back UX contradiction** (frontmatter `human_verification[2]`).
   - **Test:** Run SC#3 manually — verify the two `sendCalls` entries fire back-to-back with no delay between them. User reads "Dame un segundo 🙌" immediately followed by "Tuve un problemita técnico…" — the promise is broken before they could read it.
   - **Expected:** Either accept (functional correctness over UX polish) or lift `interimSent` to `handleInboundMessage` scope and conditionally suppress the apology.
   - **Why human:** UX judgment; both behaviors are functionally correct.

4. **Live BUG-02 smoke test** (frontmatter `human_verification[3]`).
   - **Test:** Deploy to staging with a real WhatsApp number, simulate slow OpenAI upstream (network throttling or a sleep proxy), send an inbound message, observe end-to-end timing + WhatsApp delivery of both interim and graceful messages.
   - **Expected:** Per phase goal — handler bails within timeout boundary, user receives both messages, bot does not crash, next inbound is handled cleanly.
   - **Why human:** Unit tests prove wiring; only a live deploy confirms WhatsApp send latency does not undermine UX and that the multi-minute stall is no longer observable in production behavior.

### Out-of-Scope Verified

- `git diff fa65e5b3^..d3de86b1 -- el-templo-bot/src/tools.ts` → **empty** (Phase 95/97 territory).
- `git diff fa65e5b3^..d3de86b1 -- el-templo-bot/src/webhook/handler.ts | grep "DEBOUNCE_TTL_SECONDS\s*="` → **empty** (Phase 93 owns the definition).
- Cross-Phase Invariant block byte-identical (`7f324a5b…`) across 4 canonical docs.

### Gaps Summary

**Phase 94 mechanically achieves its goal: BUG-02's specific failure (~3 min silent stall observed 2026-04-16) is closed.** The OpenAI SDK is now bounded by an explicit 45000 ms timeout (env-overridable), the interim UX message fires on `OpenAI.APIError`, and the graceful fallback fires from the outer catch with clean return. All 4 must-have truths are verified by tests and by direct codebase inspection.

The phase status is `human_needed` rather than `passed` because:

1. **CR-02 (raised in 94-REVIEW.md):** The SDK's default `maxRetries=2` means worst-case per-call latency is 3× the configured timeout. The 395s invariant floor that Phase 94 locks in via SC#4 (and the canonical block across 4 docs) is mathematically incorrect — real worst-case is 845s, exceeding the 600s TTL Phase 93 chose. This needs an architectural decision: tighten the SDK config, or update the formula + TTL + 4 canonical docs + script. Either resolution touches significant surface area outside what a verifier should resolve unilaterally.
2. **CR-01 + WR-01 + live smoke test:** quality and UX dispositions that the verifier cannot adjudicate without user input.

If the user prefers, Item 1 (CR-02) can be classified as `gaps_found` with a planning loop via `/gsd:plan-phase --gaps`. The verifier surfaces it as a human-decision item because the original CONTEXT.md and PLAN.md explicitly accepted the current formula and added it to 4 canonical docs as a locked decision — escalating rather than blocking respects that planning intent.

---

_Verified: 2026-05-17T23:05:37Z_
_Verifier: Claude (gsd-verifier)_
