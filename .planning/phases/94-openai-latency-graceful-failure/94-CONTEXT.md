# Phase 94: OpenAI Latency + Graceful Failure — Context

**Gathered:** 2026-05-17
**Status:** Ready for planning
**Source:** Direct synthesis from `.planning/v5.3.3-codebase-audit.md` (Phase 94 surface) + `.planning/debug/bot-3min-response-latency.md` (BUG-02 root cause) + Phase 93 invariant block — **no new audit task required** (the v5.3.3 audit already covers this phase). Locked by orchestrator decision 2026-05-17.

<domain>
## Phase Boundary

Closes BUG-02 from the post-v5.3.2 live test (~3-minute response latency, 2026-04-16 22:23-22:26). Three deliverables:

1. **LAT-01** — Add explicit `timeout` option to the OpenAI SDK client at `el-templo-bot/src/ai/openai.ts:29` so a hung upstream surfaces as an error within a known bound instead of stalling for the SDK's 600s default.
2. **LAT-02** — Wrap the two `provider.chat(...)` await sites in `el-templo-bot/src/webhook/handler.ts` so a timeout (or `OpenAI.APIError`) triggers an interim UX message to the user instead of silent waiting.
3. **LAT-03** — If the retry/fallback ALSO fails, surface a graceful-fallback message to the user via the outer `try/catch` in `processWithAi` (currently log-only). The handler must return cleanly — no infinite loop, no silent hang, no crash.

**NOT in scope:**

- `executeTool` localhost API call timeouts → Phase 97 RGUARD-03 (uses the `withTimeout` helper introduced by Phase 95)
- The booking tool's `fetch` calls at `tools.ts:636` / `:806` → Phase 95 BOOK-01
- Refactoring `OpenAiProvider.chat` error wrapping at `openai.ts:88-97` beyond what LAT-02's structured-error need requires
- Modifying `DEBOUNCE_TTL_SECONDS` (owned by Phase 93, already shipped at 600s in commit `8c74c850`)
- Persistent log file destination / log rotation → v5.4.0

</domain>

<decisions>
## Implementation Decisions (LOCKED)

### Cross-Phase Invariant (Phase 93 ↔ 94 ↔ 97) — CANONICAL BLOCK

**This block MUST remain textually identical** to `93-CONTEXT.md` "Cross-Phase Invariant" section, `ROADMAP.md` Phase 93 Notes, `ROADMAP.md` Phase 94 SC#1, and `MACRO-ROADMAP.md` constraint #6:

```
DEBOUNCE_TTL_SECONDS >= (OPENAI_TIMEOUT_MS / 1000) × MAX_TOOL_ITERATIONS
                     + (executeTool_timeout_seconds × MAX_TOOL_ITERATIONS)
                     + safety_buffer

Concrete values (post-Phase-94+97 target):
  OPENAI_TIMEOUT_MS = 45000             (Phase 94 LAT-01)
  MAX_TOOL_ITERATIONS = 5               (existing handler config)
  executeTool_timeout_seconds = 30      (Phase 95 BOOK-01 + Phase 97 RGUARD-03)
  safety_buffer = 20
  Minimum TTL = 45 × 5 + 30 × 5 + 20 = 395s → round up to 600s (10 min)
```

**`OPENAI_TIMEOUT_MS=45000` is locked by this invariant.** Phase 93 raised `DEBOUNCE_TTL_SECONDS` to 600s explicitly to permit this value. The planner MUST NOT pick a different default (e.g., 30s, 60s) — that would either invalidate the invariant or waste Phase 93's safety margin. Env-overrideable, but the default is fixed.

### LAT-01 — OpenAI Client Timeout

- File: `el-templo-bot/src/ai/openai.ts:29`
- Current: `this.client = new OpenAI();` (no options → SDK default 600s)
- Target: `this.client = new OpenAI({ timeout: <ms> })` where `<ms>` defaults to `45_000` and is env-overridable via `OPENAI_TIMEOUT_MS`
- Env var name: `OPENAI_TIMEOUT_MS` (milliseconds, integer)
- Default: `45000` (literal `45_000` in code for readability)
- Update `el-templo-bot/.env.example` to declare `OPENAI_TIMEOUT_MS=45000` directly under the existing `OPENAI_API_KEY=` line (currently `.env.example:23`). The existing line 37 cross-phase-invariant comment block is preserved.

### LAT-02 — Interim UX on Timeout / APIError

- Await sites (post-Phase-93 line numbers — Phase 93 added ~16 lines of debounce code so the audit's `:584/:641` references have shifted):
  - **First `provider.chat`:** `el-templo-bot/src/webhook/handler.ts:600` (outside the tool loop)
  - **Tool-loop `provider.chat`:** `el-templo-bot/src/webhook/handler.ts:657` (inside `while (response.toolCalls.length > 0 && iterations < MAX_TOOL_ITERATIONS)`)
- Trigger: `OpenAI.APIError` (any subclass, including `OpenAI.APIConnectionTimeoutError` raised when the SDK's `timeout` is exceeded) thrown from `provider.chat(...)`.
- Behavior: Send a single interim message to the user via the existing WhatsApp send path — copy: **"Dame un segundo 🙌"** (Spanish, matches Mica's voice; per debug session + ROADMAP SC#2).
- The interim message is sent **once per inbound** (i.e., from the catch block of `processWithAi`'s outer try OR a wrapper around the two await sites — planner's choice between the two structural shapes; see Claude's Discretion).
- The handler then either retries once (single retry policy — NO exponential backoff cascade, the SDK already does 2 internal retries) OR falls through to LAT-03 graceful fallback. Planner picks the simpler shape that satisfies SC#2 + SC#3.

### LAT-03 — Graceful Fallback When Retry Fails

- Surface point: outer `try/catch` at `el-templo-bot/src/webhook/handler.ts:334-350` (currently `log.error(...)` only at `:346-349`, no user-visible message).
- Copy: **"Tuve un problemita técnico, ¿me lo escribís de nuevo?"** (Spanish; per debug session + ROADMAP SC#3).
- Send via the existing WhatsApp send path the bot already uses for outbound messages (do NOT introduce a new send layer).
- After sending the fallback, the catch block returns cleanly. **No re-throw, no process exit, no infinite loop.**
- The `humanTakeoverTriggered` branch must remain unaffected.

### Cross-Phase Invariant Pre-Commit Check

- Before final commit, the planner's PLAN.md MUST include a `<verification>` step asserting (paraphrased Bash-pseudocode):
  ```
  TTL=${DEBOUNCE_TTL_SECONDS:-600}
  TIMEOUT_S=$((${OPENAI_TIMEOUT_MS:-45000} / 1000))
  MAX_TOOL_ITERATIONS=5
  EXECUTE_TOOL_BUDGET=30
  BUFFER=20
  MINIMUM=$((TIMEOUT_S * MAX_TOOL_ITERATIONS + EXECUTE_TOOL_BUDGET * MAX_TOOL_ITERATIONS + BUFFER))
  test $TTL -ge $MINIMUM
  ```
  Returns 0 only if the invariant holds with current values (600 ≥ 395 → PASS). Place this either in `el-templo-bot/scripts/` as a discoverable script OR inline in a test (planner's choice — both are valid satisfactions of the requirement).

### Discipline: TDD Fail-in-Main (Same as Phase 93)

- Tests for LAT-01..03 MUST be authored against current main and confirmed to FAIL before the fix lands.
- Once the fix lands, tests must PASS without modification.
- Test file location: `el-templo-bot/test/v5-3-3-openai-latency.test.ts` (unit-level — mocks `OpenAI` SDK / `provider.chat`) is the primary surface. If an integration test is needed (e.g., to assert WhatsApp send actually fires from the catch path), use `el-templo-api/test/whatsapp/v5-3-3-openai-latency.integration.test.ts` mirroring the Phase 93 integration pattern.
- Coverage required (per ROADMAP SC#4):
  1. Mock a slow/hung `provider.chat` → assert handler bails within the timeout boundary (e.g., < 46s wall time using fake timers).
  2. Same scenario → assert the interim UX message ("Dame un segundo 🙌") is sent.
  3. Mock the retry also failing → assert the graceful fallback message ("Tuve un problemita técnico, …") is sent AND the handler returns cleanly (no throw escapes).

### Discipline: SHA-256 Hash Check for Multi-Doc Invariants

- The Cross-Phase Invariant block above appears in FOUR locations (`93-CONTEXT.md`, `94-CONTEXT.md`, `ROADMAP.md` Phase 93 Notes, `ROADMAP.md` Phase 94 SC#1, `MACRO-ROADMAP.md` constraint #6).
- **If the planner or executor modifies the invariant block in ANY file, they MUST extract the block from each location and compute `shasum -a 256` for byte-identical match before commit.** Paraphrased equivalent ≠ acceptable.
- Phase 94 is unlikely to mutate the canonical block (it's read-only context for this phase) — but if `OPENAI_TIMEOUT_MS` value or formula changes during planning, the hash-check discipline is the gate.

### Plan Checker Mode

- **Normal, NOT adversarial.** This phase is mechanical (insert a timeout, wrap two awaits, send two strings) — not investigative. The Phase 93 adversarial framing was justified by the SETNX-race vs TTL-coupling vs heartbeat-refresh decision space; no equivalent decision space exists for Phase 94. The plan checker should still include the **structural integrity check** (XML/markup tag balance) per the established feedback rule, but reasoning depth is "normal" not "adversarial".

### Claude's Discretion

- **Wrapper shape for LAT-02:** outer `try/catch` extension (single catch handles both await sites, single interim message per inbound) vs. inline `try/catch` around each `provider.chat` call (separate catch per site, finer-grained but more code). Planner picks the simpler shape that satisfies SC#2 + SC#3.
- **Retry policy:** the debug session / audit mention "retry once or surface graceful fallback." The SDK already does 2 internal retries under the same timeout. Plan-time decision: (a) no manual retry — let SDK retries + timeout do their job, send graceful fallback on the first thrown error after SDK retries; OR (b) one manual retry at the handler level after sending the interim message, then graceful fallback. Recommendation: (a) — simpler, less to test, matches the audit's verdict that retries are not the dominant latency driver.
- **`OpenAI.APIError` shape preservation** (audit Unknown #3): currently `openai.ts:94` re-throws as a generic `Error(message)`, losing `status`/`code`. LAT-02's catch needs to distinguish "timeout error" from other API errors (e.g., 429 rate-limit, 5xx upstream). Plan-time decision: (a) keep `Error(string)` shape and pattern-match on the message text (brittle but minimal-change); (b) re-throw the raw `OpenAI.APIError` and let the handler `instanceof OpenAI.APIError` check it (cleaner, requires modifying `openai.ts:88-97`). Recommendation: (b) if the same change costs ≤ 5 lines; (a) otherwise.
- **Whether to extract an interim-message helper** (e.g., `sendInterimMessage(phone, "Dame un segundo 🙌")`) vs. inline `sendTextMessage(...)` in the catch block. Defer to planner — both are acceptable; the bot already has a send path.
- **Test fake-timer strategy:** Vitest's `vi.useFakeTimers()` + `vi.advanceTimersByTimeAsync` is the established pattern in `el-templo-bot/test/`. Planner can decide between fake timers (deterministic, fast) and `AbortController.timeout` real timing (more realistic but slower CI).

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents (planner, plan-checker, executor) MUST read these before authoring or implementing.**

### Audit & Debug Source-of-Truth

- `.planning/v5.3.3-codebase-audit.md` (lines 130-181, "Phase 94 — OpenAI Latency + Graceful Failure" section) — full inventory of what exists, mechanisms, constants, hypotheses, cross-phase interactions, and unknowns. **Audit-equivalent material — no new audit task is needed for Phase 94.**
- `.planning/debug/bot-3min-response-latency.md` — full diagnostic report. Verdict at lines 72-90 (root cause: no explicit timeout). Recommended scope at lines 92-105.

### Cross-Phase Invariant Source-of-Truth

- `.planning/phases/93-handler-concurrency/93-CONTEXT.md` (lines 77-102) — original canonical invariant block + Phase 93 ownership rationale.
- `.planning/ROADMAP.md` (lines 82-106) — Phase 94 entry + SC#1 with invariant + PHASE 94 SHIP CONSTRAINT.
- `.planning/MACRO-ROADMAP.md` — milestone-wide constraint #6 referencing this invariant.
- `.planning/phases/93-handler-concurrency/93-01-SUMMARY.md` (line 88) — confirms `DEBOUNCE_TTL_SECONDS=600` shipped and the invariant is satisfied.

### Code Surface

- `el-templo-bot/src/ai/openai.ts:24-98` — `OpenAiProvider` class. Constructor at `:24-32` (line 29 = LAT-01 target). Error handling at `:88-97` (relevant to LAT-02 structured-error decision).
- `el-templo-bot/src/webhook/handler.ts:90` — `MAX_TOOL_ITERATIONS = 5`.
- `el-templo-bot/src/webhook/handler.ts:108` — `DEBOUNCE_TTL_SECONDS` post-Phase-93 (now env-overridable, default 600).
- `el-templo-bot/src/webhook/handler.ts:334-350` — outer `try/catch` around `processWithAi` (LAT-03 surface).
- `el-templo-bot/src/webhook/handler.ts:600` — first `provider.chat` await (LAT-02 surface, was `:584` pre-Phase-93).
- `el-templo-bot/src/webhook/handler.ts:657` — tool-loop `provider.chat` await (LAT-02 surface, was `:641` pre-Phase-93).
- `el-templo-bot/.env.example:23` — `OPENAI_API_KEY=` (LAT-01 inserts `OPENAI_TIMEOUT_MS=45000` after).

### Discipline Anchors (Phase 93 Patterns to Mirror)

- `el-templo-bot/test/v5-3-3-handler-concurrency.test.ts` — TDD fail-in-main unit pattern (mocks Redis/SDK, fake timers).
- `el-templo-api/test/whatsapp/v5-3-3-handler-concurrency.integration.test.ts` — integration regression-protector pattern (real DB, real webhook flow).
- `.planning/phases/93-handler-concurrency/93-01-PLAN.md` — task structure, atomic-commit cadence, verification block style.

</canonical_refs>

<specifics>
## Specific Ideas

- **Bundle LAT-01..03 into ONE plan with 1-2 tasks.** Per orchestrator decision 2026-05-17: this phase is mechanical, not investigative. The three deliverables are tightly coupled (LAT-01's timeout is what LAT-02 catches; LAT-02's catch path is what LAT-03 falls through). Splitting them across multiple plans introduces verification overhead without correctness benefit. The Phase 93 pattern was 1 plan / 4 tasks because Phase 93 had genuine branching (TTL + SETNX + dead-man-switch + atomic Lua). Phase 94 does not.
- **Task structure (suggested):**
  - Task 1 (TDD red): Author failing tests for SC#1..#4 in `v5-3-3-openai-latency.test.ts` against current main. Commit with `test(94-01): ...`.
  - Task 2 (green): Implement LAT-01 + LAT-02 + LAT-03 in a single atomic commit (one timeout option + two wrapped awaits + one fallback message). Commit with `feat(bot): ...`.
  - Optional Task 3: Update `.env.example` + add invariant pre-commit check script. Can be folded into Task 2 if commit stays focused.
- **No audit task.** The v5.3.3 audit at `.planning/v5.3.3-codebase-audit.md:130-181` is the audit for this phase. The planner should reference it directly in `<files_to_read>` and NOT spawn a `94-AUDIT.md` task.
- **Phase 93 invariant lives in 4 places.** If LAT-01 ever needs a value other than 45000 (e.g., production telemetry says p99 is 60s), the change must propagate to all 4 documents AND the `DEBOUNCE_TTL_SECONDS` floor must be re-derived. The sha256 hash-check discipline above is the safeguard.
- **Interim message ≠ retry.** The interim message is a UX signal (the bot is alive, working) — sending it does NOT obligate the handler to retry. The SDK's internal 2 retries already happen within the 45s timeout boundary; once the SDK throws, the upstream is durably slow/down within the bound. Manual retry on top adds another 45s of potential wait — usually NOT what the user wants. Recommendation: send interim → wait for the in-flight SDK call to error → send graceful fallback. No manual retry at the handler level.
- **Avoid scope creep into `executeTool`.** The audit at `.planning/v5.3.3-codebase-audit.md:113-117` confirms `executeTool` localhost calls are also unbounded but flags them as Phase 95 / Phase 97 scope. Phase 94 must NOT touch `tools.ts:636` / `:806`. If a test scenario tempts the planner toward that scope, the test is wrong — fix the test, not Phase 94's scope.

</specifics>

<deferred>
## Deferred Ideas

- **`OpenAiProvider` structured-error refactor** (preserve `OpenAI.APIError.status` / `code` through the catch at `openai.ts:88-97`) — in scope ONLY if LAT-02 requires it (see Claude's Discretion). Otherwise, defer to a future cleanup phase. Not a v5.3.3 blocker.
- **Manual retry-on-timeout policy** — the SDK already retries twice. Manual retry only makes sense if production telemetry says transient hangs ≤ 5s are common and worth a 2× attempt. No data exists; deferred until v5.4.0 observability work.
- **`executeTool` timeout extension** — explicitly Phase 97 RGUARD-03 territory. Uses the `withTimeout` helper that Phase 95 introduces. NOT Phase 94.
- **Interim message rate-limiting / dedup** — if the user sends rapid-fire messages and each triggers an interim "Dame un segundo 🙌", the user could see 3 of them. Phase 93's debounce already handles this at the handler-entry level (only one `processWithAi` runs per debounce window). No additional dedup needed in Phase 94.
- **`Fastify({ logger: true })` → file destination + rotation** (so future BUG-02-like incidents leave a recoverable trace) — v5.4.0 observability phase per debug session.
- **Empirical p99 measurement for `gpt-4o-mini`** to validate the 45s default — the debug session asserts "p99 well under 45s" without measurement (audit Unknown). v5.4.0 telemetry work; the 45s value is locked for v5.3.3 by the cross-phase invariant.

</deferred>

---

_Phase: 94-openai-latency-graceful-failure_
_Context gathered: 2026-05-17 — direct synthesis (no audit task spawned per orchestrator decision; audit-equivalent material in `.planning/v5.3.3-codebase-audit.md` lines 130-181)_
