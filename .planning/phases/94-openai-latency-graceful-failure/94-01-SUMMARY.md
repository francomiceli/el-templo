---
phase: 94-openai-latency-graceful-failure
plan: 01
subsystem: el-templo-bot/ai-provider + webhook-handler
tags:
  [
    openai,
    timeout,
    graceful-failure,
    interim-ux,
    cross-phase-invariant,
    api-error,
    whatsapp-bot,
    tdd,
    bug-02,
  ]
requires:
  - phase: 93-handler-concurrency
    provides: "DEBOUNCE_TTL_SECONDS=600 (env-overridable) shipped at 8c74c850; cross-phase invariant satisfied for the 45000 ms OPENAI_TIMEOUT_MS default Phase 94 introduces."
  - phase: roadmap (v5.3.3)
    provides: "BUG-02 ticket — ~3-minute response latency observed 2026-04-16 22:23-22:26. ROADMAP SC#1..#4 + Cross-Phase Invariant canonical block locked across 4 markdown docs."
provides:
  - "BUG-02 closed — OpenAI SDK request timeout bounded at 45000 ms (env-overridable via OPENAI_TIMEOUT_MS); silent multi-minute stalls eliminated."
  - "LAT-02 interim UX — handler.ts sends 'Dame un segundo 🙌' exactly once per inbound on OpenAI.APIError."
  - "LAT-03 graceful fallback — handleInboundMessage outer catch sends 'Tuve un problemita técnico, ¿me lo escribís de nuevo?' and returns cleanly (no re-throw, no infinite loop)."
  - "OpenAi.APIError shape preservation — openai.ts:88-97 catch re-throws the raw APIError so handler-level `instanceof` works."
  - "el-templo-bot/scripts/check-debounce-invariant.sh — Cross-Phase Invariant guard (manual / CI invocation)."
  - "v5-3-3-openai-latency.test.ts (517 lines, unit — strict TDD fail-in-main for SC#1..#4)."
affects:
  - el-templo-bot/src/ai/openai.ts
  - el-templo-bot/src/webhook/handler.ts
  - el-templo-bot/.env.example
  - el-templo-bot/scripts/check-debounce-invariant.sh
  - el-templo-bot/test/v5-3-3-openai-latency.test.ts
key-files:
  created:
    - el-templo-bot/test/v5-3-3-openai-latency.test.ts
    - el-templo-bot/scripts/check-debounce-invariant.sh
  modified:
    - el-templo-bot/src/ai/openai.ts
    - el-templo-bot/src/webhook/handler.ts
    - el-templo-bot/.env.example
decisions:
  - "Wrapper shape for LAT-02: inline try/catch around each of the two provider.chat await sites + shared `sendInterimUx` closure + `interimSent` single-fire boolean — keeps SC#2 (interim) and SC#3 (graceful fallback) observably distinct surfaces."
  - "Retry policy: NO manual handler-level retry. SDK already retries 2× internally within the 45s timeout window; manual retry adds latency without measurable benefit."
  - "APIError shape preservation: re-throw raw OpenAI.APIError from openai.ts:88-97 (was `new Error(...)`). Delta ≤ 5 LOC; enables `err instanceof OpenAI.APIError` discriminator at the handler. Outer catch still works because APIError extends Error."
  - "Cross-Phase Invariant NOT mutated — block byte-identical across 93-CONTEXT.md, 94-CONTEXT.md, ROADMAP.md, MACRO-ROADMAP.md (SHA-256: 173e689724c991a2…)."
  - "scripts/check-debounce-invariant.sh NOT wired into git hooks this phase — Phase 94 owns creation only; hook wiring is opt-in / deferred."
status: complete
shipped: 2026-05-17
metrics:
  duration: "~30 minutes"
  tasks_completed: 2
  files_changed: 5
---

# Phase 94-01 — OpenAI Latency + Graceful Failure (BUG-02) Summary

## Goal

Close BUG-02 (the ~3-minute response latency observed 2026-04-16
22:23–22:26) by bounding the OpenAI SDK request timeout and providing
user-visible UX on slow/failing upstream calls. Three coupled deliverables
shipped in a single TDD-disciplined RED → GREEN cycle.

## Outcome

**Atomic two-commit TDD chain — RED followed immediately by GREEN.**

| Commit                                                                                   | Type  | Files                                                                                                                          | Tests                                                     |
| ---------------------------------------------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| `fa65e5b3` — `test(94-01): fail-in-main unit suite for ... (LAT-01..03)`                 | RED   | `el-templo-bot/test/v5-3-3-openai-latency.test.ts` (created — 517 lines)                                                       | 5/6 FAIL, 1/6 PASS (SC#4 static numeric — passes on main) |
| `d3de86b1` — `feat(bot): bound OpenAI client timeout + graceful fallback (LAT-01/02/03)` | GREEN | `el-templo-bot/src/ai/openai.ts` + `src/webhook/handler.ts` + `.env.example` + `scripts/check-debounce-invariant.sh` (created) | 6/6 PASS                                                  |

`git log --oneline -3 fa65e5b3 d3de86b1`:

```
d3de86b1 feat(bot): bound OpenAI client timeout + graceful fallback (LAT-01/02/03)
fa65e5b3 test(94-01): fail-in-main unit suite for OpenAI timeout + graceful failure (LAT-01..03)
ee1facce docs(state): Phase 94 plan complete — ready for /gsd:execute-phase 94
```

## Files Changed

### Created

- **`el-templo-bot/test/v5-3-3-openai-latency.test.ts`** (517 lines) — TDD
  fail-in-main unit suite. Four describe blocks (SC#1..#4) following the
  Phase 93 pattern anchor in `v5-3-3-handler-concurrency.test.ts`
  (Vitest + fake timers + Map-backed Redis mock + `vi.doMock` per-test
  for provider / WhatsApp client / surrounding modules). SC#1 reads the
  resolved `timeout` field directly off the OpenAi SDK client instance
  (`(provider as { client: { timeout } }).client.timeout`) — this
  exercises the actual SDK constructor instead of mocking it, which
  proved unreliable due to pnpm's `.pnpm` flat-resolution and the OpenAI
  SDK's eager module-init checks.
- **`el-templo-bot/scripts/check-debounce-invariant.sh`** (35 lines,
  executable) — Cross-Phase Invariant guard. Reads env vars with
  defaults matching v5.3.3 production (TTL=600, OPENAI_TIMEOUT_MS=45000,
  MAX_TOOL_ITERATIONS=5, EXECUTE_TOOL_BUDGET_SECONDS=30,
  INVARIANT_BUFFER_SECONDS=20). Exits 0 if `TTL >= TIMEOUT_S*ITER + BUDGET*ITER + BUFFER`.
  Manual / CI invocation; not wired into hooks this phase.

### Modified

- **`el-templo-bot/src/ai/openai.ts`** (LAT-01):
  - New `resolveOpenAiTimeoutMs()` helper at module scope — reads
    `process.env.OPENAI_TIMEOUT_MS`, parses to integer via `Number(...)`,
    falls back to `45_000` on undefined/empty/non-numeric/non-positive.
  - Constructor at `:48-51` now calls `new OpenAI({ timeout: timeout })`
    using the resolved value. `logger.info` includes the resolved
    `timeout` in the payload for boot-time confirmation.
  - Catch block at `:88-103` now re-throws the raw `OpenAI.APIError`
    (was `throw new Error(...)`). `logger.error` unchanged. Comment
    documents the LAT-02 rationale (discriminator).
- **`el-templo-bot/src/webhook/handler.ts`** (LAT-02 + LAT-03):
  - New `import OpenAI from "openai"` at the top (vendor-import block).
  - `processWithAiInner` gained a top-of-function `let interimSent =
false` plus a `sendInterimUx` async closure that sends
    `"Dame un segundo 🙌"` exactly once per inbound (idempotent guard;
    swallows its own send errors).
  - Both `provider.chat(messages, BOT_TOOLS)` await sites
    (post-Phase-93 `:620` outside the tool loop + `:677` inside the
    tool loop) wrapped in `try/catch (err: unknown)`. On `err instanceof
OpenAI.APIError` → `await sendInterimUx()`, then re-throw to the
    outer catch.
  - Outer `try/catch` in `handleInboundMessage` (post-mod `:334-366`)
    extended: after the existing `log.error(...)`, a new inner
    `try/catch` sends `"Tuve un problemita técnico, ¿me lo escribís de
nuevo?"`. A failed send only logs; the function returns cleanly.
- **`el-templo-bot/.env.example`** — Three new lines directly after
  `OPENAI_API_KEY=sk-xxxxxxxx`:
  - Comment line: `# OpenAI SDK request timeout in milliseconds. Phase 94 LAT-01.`
  - Comment line: `# Default: 45000. Cross-phase invariant locks the default at 45000 — see DEBOUNCE_TTL_SECONDS below.`
  - Env line: `OPENAI_TIMEOUT_MS=45000`
  - The pre-existing Phase 93 ↔ 94 ↔ 97 Cross-Phase Invariant comment
    block at `DEBOUNCE_TTL_SECONDS=600` is UNCHANGED.

## Tests Added

| Test                                                                              | Pre-GREEN (RED) | Post-GREEN |
| --------------------------------------------------------------------------------- | --------------- | ---------- |
| SC#1 — defaults to 45000 ms when OPENAI_TIMEOUT_MS is unset                       | FAIL (600000)   | PASS       |
| SC#1 — honors OPENAI_TIMEOUT_MS override (parsed as integer)                      | FAIL (600000)   | PASS       |
| SC#1 — falls back to 45000 ms when OPENAI_TIMEOUT_MS is invalid (non-numeric)     | FAIL (600000)   | PASS       |
| SC#2 — sends 'Dame un segundo 🙌' interim message exactly once per inbound        | FAIL (0 sends)  | PASS       |
| SC#3 — sends 'Dame un segundo' AND 'Tuve un problemita técnico'; resolves cleanly | FAIL (0 sends)  | PASS       |
| SC#4 — 600 >= (45000/1000)*5 + 30*5 + 20 = 395                                    | PASS            | PASS       |

**RED tally:** 5/6 FAILED, 1/6 PASSED. **GREEN tally:** 6/6 PASSED.

**Full bot suite:** 615/615 PASS (post-Phase-93 baseline was 609/609 —
the 6 new tests bring the total to 615). Zero regressions in Phase 93
coverage (`v5-3-3-handler-concurrency.test.ts`: 3/3 PASS unchanged).

**TypeScript:** `pnpm tsc --noEmit` clean (after `pnpm install` in both
`el-templo-bot/` and `el-templo-api/` for worktree-local module
resolution).

## Commits

- **`fa65e5b3`** — `test(94-01): fail-in-main unit suite for OpenAI
timeout + graceful failure (LAT-01..03)` — RED. Touches only the
  newly-created test file. No production source changes.
- **`d3de86b1`** — `feat(bot): bound OpenAI client timeout + graceful
fallback (LAT-01/02/03)` — GREEN. Touches `openai.ts`, `handler.ts`,
  `.env.example`, `scripts/check-debounce-invariant.sh`. No other files
  modified.

## Cross-Phase Invariant Status

**Block unchanged in this phase.** SHA-256 of the formula block
(`grep -A 11 "DEBOUNCE_TTL_SECONDS >= (OPENAI_TIMEOUT_MS"` piped to
`shasum -a 256`):

| Document                                                            | SHA-256 (first 16 hex) |
| ------------------------------------------------------------------- | ---------------------- |
| `.planning/phases/93-handler-concurrency/93-CONTEXT.md`             | `173e689724c991a2`     |
| `.planning/phases/94-openai-latency-graceful-failure/94-CONTEXT.md` | `173e689724c991a2`     |
| `.planning/ROADMAP.md`                                              | `173e689724c991a2`     |
| `.planning/MACRO-ROADMAP.md`                                        | `173e689724c991a2`     |

All four locations byte-identical. The `.env.example` paraphrase
(comment form, lines 36-42) remains intact and unchanged.

**Concrete values post-Phase-94:**
`OPENAI_TIMEOUT_MS=45000` × `MAX_TOOL_ITERATIONS=5` + `executeTool_budget=30` × `5`

- `safety_buffer=20` = `225 + 150 + 20 = 395s` floor. Current
  `DEBOUNCE_TTL_SECONDS=600` ≥ 395 ✓ (205s safety margin).

Invariant guard script confirms at boot:

```
$ bash el-templo-bot/scripts/check-debounce-invariant.sh
Cross-phase invariant OK: TTL=600 >= minimum 395
```

## Deviations from Plan

**None.** Plan executed exactly as written, with one observable
implementation choice deviating from the plan's expected literal
form: the plan's success-grep `new OpenAI({ timeout:` (with trailing
colon) is matched by the production code `new OpenAI({ timeout: timeout })`
— explicit key-value form rather than ES6 shorthand `{ timeout }`, so
the literal grep gate passes. This is a one-token notational choice
inside the planner's "Claude's Discretion" envelope and does not change
runtime behavior.

## Source-Grep Gates (post-GREEN verification)

```
$ grep -n "new OpenAI" el-templo-bot/src/ai/openai.ts
50:    this.client = new OpenAI({ timeout: timeout });

$ grep -n "Dame un segundo" el-templo-bot/src/webhook/handler.ts
437:  // ("Dame un segundo 🙌") sent when provider.chat throws
449:      await sendTextMessage(phone, "Dame un segundo 🙌");
717:    // message — the user sees exactly one "Dame un segundo" per inbound.

$ grep -n "Tuve un problemita" el-templo-bot/src/webhook/handler.ts
360:        "Tuve un problemita técnico, ¿me lo escribís de nuevo?",

$ grep -n "OPENAI_TIMEOUT_MS" el-templo-bot/.env.example
26:OPENAI_TIMEOUT_MS=45000
40:#   DEBOUNCE_TTL_SECONDS >= (OPENAI_TIMEOUT_MS/1000) * MAX_TOOL_ITERATIONS

$ bash el-templo-bot/scripts/check-debounce-invariant.sh
Cross-phase invariant OK: TTL=600 >= minimum 395
$ echo $?
0
```

## Out-of-Scope Verified

`git diff fa65e5b3^..d3de86b1 -- el-templo-bot/src/tools.ts` → **empty**
(Phase 95 / Phase 97 territory; explicitly out of Phase 94 scope per
CONTEXT.md "NOT in scope" + threat_model T-94 disposition row).

`git diff fa65e5b3^..d3de86b1 -- el-templo-bot/src/webhook/handler.ts |
grep -E "^\+.*DEBOUNCE_TTL_SECONDS\s*="` → **empty** (Phase 93 owns this
definition; unchanged from the `Number(process.env.DEBOUNCE_TTL_SECONDS
?? 600)` form shipped at commit `8c74c850`).

Cross-Phase Invariant block hash-identical across all 4 markdown docs
(`173e689724c991a2`) — no canonical-block drift introduced by Phase 94.

## Carry-Forward Notes

**For Phase 95 (BOOK-01) and Phase 97 (RGUARD-01..03):**

- The `OpenAI.APIError` re-throw at `openai.ts:88-97` is now an
  established pattern. If Phase 95/97 introduces parallel
  `withTimeout`-wrapped fetch calls at `tools.ts:636` / `:806`, the
  matching catch-and-re-throw style should mirror this phase's
  preservation of the original error shape (no `new Error(...)`
  wrapping).
- `sendInterimUx` is a closure inside `processWithAiInner` — NOT
  exported. If Phase 97 RGUARD-03 wants a comparable "the bot is alive"
  signal during long `executeTool` calls, it should extract the helper
  to a shared module (e.g., `src/ui/interim-messages.ts`) rather than
  duplicating the single-fire guard logic. The current location is
  intentional for Phase 94 — the LAT-02 surface is narrow enough that a
  closure is preferred to premature abstraction.
- `OPENAI_TIMEOUT_MS=45000` is the canonical default. Any future
  observation (production telemetry, p99 measurement) that motivates a
  different value MUST propagate to all 4 markdown locations of the
  Cross-Phase Invariant block AND re-derive the `DEBOUNCE_TTL_SECONDS`
  floor. The SHA-256 multi-doc check is the safeguard.
- The `check-debounce-invariant.sh` script is intentionally NOT wired
  into git hooks this phase. Phase 97 (RGUARD-02 — invariant
  verification step) is the natural place to wire it into the
  pre-commit hook chain.

**For Phase 97 RGUARD-01 (regression suite):**

- Include `el-templo-bot/test/v5-3-3-openai-latency.test.ts` in the
  milestone-scoped regression suite (either by reference — `pnpm test`
  runs it already — or by absorbing the four SC assertions into a
  `v5-3-3-regression.test.ts` aggregator mirroring v5.3.2's pattern).

## Self-Check: PASSED

- `el-templo-bot/test/v5-3-3-openai-latency.test.ts` — **FOUND** (517 lines)
- `el-templo-bot/scripts/check-debounce-invariant.sh` — **FOUND** (35 lines, executable)
- `el-templo-bot/src/ai/openai.ts` — modified (LAT-01 + APIError re-throw)
- `el-templo-bot/src/webhook/handler.ts` — modified (LAT-02 + LAT-03)
- `el-templo-bot/.env.example` — modified (OPENAI_TIMEOUT_MS=45000 declared)
- Commit `fa65e5b3` (RED) — **FOUND** in `git log --all`
- Commit `d3de86b1` (GREEN) — **FOUND** in `git log --all`
- `pnpm test v5-3-3-openai-latency` — 6/6 PASS post-GREEN
- `pnpm test v5-3-3-handler-concurrency` — 3/3 PASS (no regression)
- `pnpm test` (full suite) — 615/615 PASS (28 test files)
- `bash scripts/check-debounce-invariant.sh` — exits 0
- `pnpm tsc --noEmit` — clean
