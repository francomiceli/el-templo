# Phase 95: Booking Reliability + Graceful Degradation - Context

**Gathered:** 2026-05-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Closes BUG-03 (booking root cause) and BUG-05 (apology-loop safety net) from the post-v5.3.2 live test backlog. The two are **paired** because BUG-05 is the safety net for when BUG-03 still fails.

**Three deliverables:**

1. **BOOK-01 (BUG-03 fix)** — Class search returns consistent results across all El Templo venues so a user can complete a booking without the bot looping on "no encontré clases disponibles" when classes exist. Root cause picked via the 95-AUDIT plan from 5 plausible candidates in `.planning/v5.3.3-codebase-audit.md:185-260`: (i) LIKE-search ambiguity at `tools.ts:455`, (ii) cross-branch result mixing at `tools.ts:285-302`, (iii) Sunday=0 vs Sunday=7 day-of-week confusion (model-side), (iv) LIMIT-6 truncation at `tools.ts:301`, (v) `booking_count` correlated subquery with today-filter at `tools.ts:267, 281` returning wrong counts when the user asks about "mañana".
2. **DEGR-01 (BUG-05 safety net)** — When tool calls fail repeatedly, the bot escalates via `request_human` after 2 failed attempts in the same inbound. Counter is **per-handler-invocation, in-process**; trips at count ≥ 2; sends a synthetic Spanish handoff phrase via `sendTextMessage()` BEFORE invoking `request_human` (the audit confirms `requestHuman` at `tools.ts:512-531` only mutates `conversation_status` — sends NO message itself). Exit path reuses the existing `humanTakeoverTriggered=true` branch at `handler.ts:692-694`.
3. **DEGR-02 (SC#3 invariant guardrail)** — The no-escalation rule from v5.3.2 Phase 91 OBJN-01/02 applies to **soft rejections ONLY**, NOT to tool failures. Retry counter and Phase 91 `whyAsked` flag share NO state. Asserted by Phase 97 RGUARD-02.
4. **`withTimeout` helper** — Phase 95 introduces `el-templo-bot/src/ai/with-timeout.ts` and applies it to the booking-tool localhost calls at `tools.ts:636` and `:806`. Default 30s, env-overridable via `EXECUTE_TOOL_TIMEOUT_MS`. Phase 97 RGUARD-03 will EXTEND this helper to other `executeTool` sites — Phase 95 ships the helper FROM THE START, not as an ad-hoc Promise.race that Phase 97 has to refactor later.

**NOT in scope:**

- Other `executeTool` localhost timeouts beyond `tools.ts:636` and `:806` → Phase 97 RGUARD-03 (extends the helper to additional sites).
- Refactoring `executeTool` beyond timeout addition (parallelization, retry semantics, structured `{ok, message, reason}` envelope, etc.) → v5.4+ per REQUIREMENTS.md Out of Scope.
- Migrating `pendingActions` Map (`tools.ts:199-202`) to Redis → noted by audit but no v5.3.3 requirement covers it.
- Changing the Phase 91 SOFT_REJECTION_WHY_RULE / SOFT_REJECTION_BACKOFF_RULE framing in `system-prompt.ts:70-86` → owned by Phase 91 / RGUARD-02 guardrail.
- Modifying `OPENAI_TIMEOUT_MS` or `DEBOUNCE_TTL_SECONDS` → Phase 94 / Phase 93 ownership respectively.
- Regenerating the `pb1-e1a-lead-rendered.snap.txt` fixture and bumping `POST_RLOK_04_BYTES` — Phase 95 does NOT touch `system-prompt.ts` (handler-side synthetic phrasing was chosen over a new system-prompt rule precisely so Phase 96 owns the snapshot regen).

</domain>

<decisions>
## Implementation Decisions

### Cross-Phase Invariant (Phase 93 ↔ 94 ↔ 95 ↔ 97) — CANONICAL BLOCK

**This block MUST remain textually identical** to `93-CONTEXT.md` "Cross-Phase Invariant" section, `94-CONTEXT.md` "Cross-Phase Invariant" section, `ROADMAP.md` Phase 93 Notes, `ROADMAP.md` Phase 94 SC#1, and `MACRO-ROADMAP.md` constraint #6:

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

**`EXECUTE_TOOL_TIMEOUT_MS=30000` is locked by this invariant.** The `withTimeout` helper default is 30000ms; env override allowed but the invariant must continue to hold. Phase 97 RGUARD-03 reuses the SAME env var, NOT a separate one.

### BUG-03 Investigation Strategy (Plan 95-01)

- **D-01: Audit-first via dedicated 95-01 plan task with discriminating SQL tests.** The five candidates have deterministic SQL behaviors that can be discriminated by targeted queries against `eltemplo_test`. Static analysis can name the candidates but cannot pick one — Phase 94's "trust the audit" pattern is insufficient here because the audit explicitly says "Reproduction would resolve which of these is firing. Without it, BOOK-01 risks fixing the wrong thing." (`v5.3.3-codebase-audit.md:257`).
- **D-02: Audit deliverable shape = report + compound-failure handling (Phase 93 Branch 3 shape).** 95-AUDIT.md enumerates explicit branches: Branch 1 (single candidate fires), Branch 2 (different single candidate fires), Branch 3 (2+ candidates compound). Fix scope is defined per branch UPFRONT in the audit doc so plan 95-02 doesn't re-litigate scope. The audit task also COMMITS RED tests that the fix plan turns GREEN (TDD fail-in-main binding, Phase 93/94 discipline).
- **D-03: Split test surface.** Integration tests for SQL candidates live in `el-templo-api/test/whatsapp/v5-3-3-booking.integration.test.ts` (real `eltemplo_test` MySQL with seeded branches/schedules/bookings per `el-templo-bot/CLAUDE.md:37` convention). Unit test for the Sunday=0/7 model/prompt candidate lives in `el-templo-bot/test/v5-3-3-booking-reliability.test.ts` (mocked OpenAI + prompt-level assertion). Each candidate lives where it can actually be discriminated.
- **D-04: 3 plans for Phase 95.** Plan 95-01 = audit (writes 95-AUDIT.md naming Branch 1/2/3 + RED integration tests + RED unit test for Sunday=0/7). Plan 95-02 = BUG-03 fix at audit-named site + `withTimeout` helper introduction + apply to `tools.ts:636/:806`. Plan 95-03 = BUG-05 retry counter + escalation. Each plan is independently verifiable; SUMMARY.md cadence stays clean.

### DEGR-01 Escalation Phrasing Surface (Plan 95-03)

- **D-05: Handler-side synthetic message** sent via `sendTextMessage()` BEFORE invoking `request_human` via `executeTool`. The audit confirmed `requestHuman` at `tools.ts:512-531` only mutates `conversation_status='human_takeover'` and returns a debug string — it sends NO user-facing WhatsApp message. Trusting the model to emit the handoff phrase via the `system-prompt.ts:223` SILENCIO rule fails the determinism bar: the model is most likely to misbehave under repeated tool failures (exactly when this safety net needs to fire). Synthetic handler-side emission is deterministic.
- **D-06: Locked phrase** — `'Te paso con alguien del equipo, te escriben enseguida 🙌'`. Reuses the v5.2-locked Spanish copy. Defined as `const HANDOFF_ESCALATION_PHRASE` in `handler.ts` near the retry-counter logic (NOT in `system-prompt.ts` — this is handler-facing, not model-facing). NOT moved to a shared phrases module yet because the only consumer is this single trigger; future reuse will motivate extraction.
- **D-07: Loop exit reuses existing `humanTakeoverTriggered` path.** When counter trips at iteration N: (1) handler calls `sendTextMessage(phone, HANDOFF_ESCALATION_PHRASE)`, (2) handler invokes `executeTool("request_human", { reason: "auto_escalation_after_2_failures" }, db, conversationId, context)` synthetically (no model emission required), (3) `humanTakeoverTriggered = true` is set (handler.ts:692-694 path), (4) tool loop exits.
- **D-08: Drop model's `response.content` on counter trip.** If `response.content` from the same `provider.chat()` return contains text (e.g., another apology), that text is DISCARDED. The user receives exactly ONE outbound message for that turn: `HANDOFF_ESCALATION_PHRASE`. The existing `segments[0]`-only branch at `handler.ts:844-866` is replaced for this code path — even segments[0] from the model is suppressed when the handler-side synthetic phrase fires.
- **D-09: Observability** — On trigger, emit `log.warn({ phone, conversationId, failureCount, lastToolName, lastToolError }, 'DEGR-01 escalation triggered')` via Pino. Routes to stdout under Phase 93 baseline; v5.4.0 file-sink work captures it durably.

### Retry Counter Scope + Failure Trigger (Plan 95-03)

- **D-10: Scope = per-handler-invocation.** Counter is a local `let failedToolCalls = 0` inside `processWithAiInner`. Lives only for the duration of one inbound; resets to 0 on every new `processWithAi` entry. No Redis state, no cross-inbound persistence. The tool loop's existing `MAX_TOOL_ITERATIONS = 5` (`handler.ts:91`) already bounds how many failures can stack in a single inbound. Matches the audit's `humanTakeoverTriggered` local-boolean pattern at `handler.ts:586`.
- **D-11: Failure trigger = hard errors + explicit fail-string allowlist.** Counter increments when EITHER:
  - (a) `executeTool` throws (e.g., `ToolTimeoutError` from `withTimeout` boundary, uncaught fetch error)
  - (b) `executeTool` returns a string in the **locked allowlist** (textually identical match):
    - `'No pude completar la reserva. Intenta de nuevo en un momento.'` (`tools.ts:688`)
    - `'No pude completar el registro. Intenta de nuevo en un momento.'` (`tools.ts:845`)
    - `'Herramienta "{name}" no disponible.'` (`tools.ts:241` — default-case in dispatch)
    - `'Herramienta agotada por tiempo de espera.'` (NEW — emitted by `executeTool` on `ToolTimeoutError` catch, see D-15)

  **Explicitly NOT on the allowlist** (these are degraded but not failures — SC#3 guardrail):
  - `'Esa clase esta llena y no hay alternativas disponibles esta semana.'` (`tools.ts:685` — class full with no alts)
  - `'Ya tenes una reserva para esa clase. Te esperamos!'` (`tools.ts:667` — already booked)
  - `'Ya tuviste una clase de prueba con nosotros...'` (`tools.ts:842` — trial already used)
  - Soft-rejection-shaped strings (Phase 91 OBJN-01 WHY/BACK-OFF framing) — these are MODEL output, not tool output, but the audit warns against pattern-matching that could conflate them.

- **D-12: Increment granularity = per-tool-call, no reset within inbound.** Counter increments for EVERY failing tool call across the tool loop's iterations. Successful tool calls do NOT reset. Example: iteration 1 has `book_class` fail (count=1) + `check_schedule` succeed (count=1), iteration 2 has `book_class` fail (count=2) → ESCALATE. Matches the BUG-05 transcript pattern where the bot kept apologizing across iterations without recovery.
- **D-13: Threshold = `failedToolCalls >= 2`** triggers the synthetic phrase + escalation. Per ROADMAP SC#2 "after 2 failed attempts". No fuzzy thresholds, no hysteresis.
- **D-14: SC#3 guardrail wiring.** The retry counter and Phase 91 `whyAsked` flag are different semantic objects on different code surfaces. Counter is tool-loop-level (`handler.ts:589-642` region); `whyAsked` is pre-AI rejection-arc state (`handler.ts:451-455` region). They share NO state. Phase 97 RGUARD-02 will assert: a soft-rejection inbound (user says "lo pienso" / "no estoy seguro") produces NO synthetic phrase and NO `request_human` invocation, even if the model's reply doesn't invoke any tool.

### `withTimeout` Helper Shape (Plan 95-02)

- **D-15: Cancellation = AbortController + ToolTimeoutError.** Helper signature: `withTimeout<T>(operation: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T>`. Caller passes the signal into `fetch(url, { signal, ... })` so the in-flight HTTP request actually closes on timeout (not Promise.race + orphan socket). On timeout, helper throws `ToolTimeoutError` (named class extending `Error`). `tools.ts:636` and `:806` fetch calls modified to accept the signal.
- **D-16: File location** — new file `el-templo-bot/src/ai/with-timeout.ts`. Exports `withTimeout` function + `ToolTimeoutError` class. Co-located with the AI/tools layer that consumes it. Phase 97 RGUARD-03 imports from this path.
- **D-17: Env var** — `EXECUTE_TOOL_TIMEOUT_MS=30000` (default 30s). Matches the canonical invariant block's `executeTool_timeout_seconds = 30`. Added to `el-templo-bot/.env.example` directly under the Phase 94 `OPENAI_TIMEOUT_MS=45000` line. Phase 97 RGUARD-03 reuses the SAME env var when extending the helper to additional sites — NOT a separate variable.
- **D-18: Catch site = inside `executeTool` dispatch (`tools.ts:220-243`).** The `executeTool` function wraps each tool-handler call in a try/catch for `ToolTimeoutError`. On catch, returns the string `'Herramienta agotada por tiempo de espera.'` (added to the D-11 allowlist). This unifies the timeout error pathway with existing tool-result handling — the handler tool loop sees a normal string return like any other tool result and the retry counter picks it up via the allowlist. Phase 94's LAT-02 interim UX is orthogonal (only fires on `OpenAI.APIError`, not on `ToolTimeoutError`).
- **D-19: Helper covers booking calls ONLY for Phase 95.** `tools.ts:636` (`book_class` POST) and `tools.ts:806` (`register_trial` POST) are wrapped. Other `executeTool` sites (`checkSchedule`'s db.execute, `getLocation`'s db.execute, etc.) are NOT touched by Phase 95 — Phase 97 RGUARD-03 extends the helper to those.

### Plan Task Discipline (carry-forward from Phase 93/94)

- **D-20: TDD fail-in-main discipline.** Every test in `v5-3-3-booking.integration.test.ts` and `v5-3-3-booking-reliability.test.ts` MUST be authored against current main and observed to FAIL before the fix lands. Plan 95-01 (audit) commits RED tests; plans 95-02 and 95-03 turn them GREEN without modification.
- **D-21: Atomic commit cadence per plan.** Mirror Phase 93/94 pattern: one RED commit per task, one GREEN commit per task, one SUMMARY.md commit per plan. No multi-task atomic commits.
- **D-22: Plan checker mode — adversarial for 95-01, normal for 95-02/95-03.** 95-01 has genuine investigative branching (Branch 1/2/3 outcome space) — adversarial framing justified, mirroring Phase 93. 95-02 and 95-03 are mechanical (apply helper at known sites, wire counter+threshold) — normal framing, per Phase 94 plan-checker precedent. Structural integrity check (XML/markup tag balance) MUST be in framing for all three per the locked feedback rule.
- **D-23: SHA-256 hash-check discipline.** The Cross-Phase Invariant block above appears in FIVE locations now (`93-CONTEXT.md`, `94-CONTEXT.md`, `95-CONTEXT.md`, `ROADMAP.md`, `MACRO-ROADMAP.md`). Phase 95 inherits the byte-verify discipline. If Phase 95 mutates the invariant block (unlikely — read-only context), planner/executor MUST `shasum -a 256` against all five locations before commit. Paraphrased equivalent is unacceptable.

### Claude's Discretion

- **`withTimeout` API ergonomics** — whether the signature is `withTimeout(opFactory, ms)` (factory-style for AbortSignal) or includes overloads for non-fetch Promise<T> consumers. Planner picks based on the simplest call sites in `tools.ts:636`/`:806`. Phase 97 RGUARD-03 may motivate an overload later.
- **`ToolTimeoutError` message text and fields** — whether the error message includes the tool name, the timeout value, or just `'Tool timed out after ${ms}ms'`. Phase 95 only needs the discriminator (instanceof check); the user-facing string comes from the `executeTool` catch (D-18).
- **Audit task SQL test fixtures** — exact seed shape for `eltemplo_test` branches/schedules/bookings rows in the integration test. Plan 95-01 owns this; the test must be deterministic and reset between runs (BeforeEach truncate per `el-templo-api/test/whatsapp/` convention).
- **Whether `request_human`'s `reason` argument should be a stable enum string** (`'auto_escalation_after_2_failures'` vs free-form) — Plan 95-03 owns this; existing usage at `tools.ts:518` defaults to `'Sin motivo especificado'` so any non-empty value is a strict improvement.
- **Whether the audit's Branch 3 (compound) fix can be a SINGLE PR** or splits into 95-02a / 95-02b — depends on whether the 2 candidates share a code surface. Plan 95-01 verdict informs.

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents (planner, plan-checker, executor) MUST read these before authoring or implementing.**

### Audit & Investigation Source-of-Truth

- `.planning/v5.3.3-codebase-audit.md` (lines 185-260, "Phase 95 — Booking Reliability + Graceful Degradation" section) — full inventory of 5 plausible BUG-03 root-cause paths, DEGR-01 implementation surface analysis, cross-phase interactions with Phase 91/94/97, and Unknowns. **Used as the starting point for Plan 95-01's audit; 95-AUDIT.md picks ONE branch (or names a Branch 3 compound).**
- `.planning/v5.3.3-prework-notes.md` — phase ordering / pairing decisions (BUG-03 + BUG-05 paired rationale).
- `/Users/bores/el-templo/contexto/backlog-post-v532` — original BUG-03 and BUG-05 transcripts from the post-v5.3.2 live test (referenced in the audit; planner reads if more transcript context needed).

### Cross-Phase Invariant Source-of-Truth

- `.planning/phases/93-handler-concurrency/93-CONTEXT.md` (lines 77-102) — original canonical invariant block + Phase 93 ownership rationale.
- `.planning/phases/94-openai-latency-graceful-failure/94-CONTEXT.md` (lines 29-46) — Phase 94 invariant block (textually identical to Phase 93's).
- `.planning/ROADMAP.md` (lines 82-106, Phase 94 SC#1 invariant; lines 158+, Phase 95 entry).
- `.planning/MACRO-ROADMAP.md` — milestone-wide constraint #6 referencing this invariant.

### Code Surface

- `el-templo-bot/src/ai/tools.ts:39-56` — `BRANCH_ADDRESSES` and `BRANCH_MAPS_LINKS` lookup tables (5 venues).
- `el-templo-bot/src/ai/tools.ts:62-70` — `normalizeBranchCode` alias mapping.
- `el-templo-bot/src/ai/tools.ts:199-202` — `pendingActions` Map (in-process; NOT Redis-backed).
- `el-templo-bot/src/ai/tools.ts:220-243` — `executeTool` dispatch (BUG-05 catch site for ToolTimeoutError per D-18).
- `el-templo-bot/src/ai/tools.ts:258-331` — `checkSchedule` (BUG-03 candidates: cross-branch mix at `:285-302`, LIMIT-6 at `:301`, booking_count today-filter at `:267, :281`).
- `el-templo-bot/src/ai/tools.ts:446-484` — `getLocation` (BUG-03 candidate: LIKE-search ambiguity at `:455`).
- `el-templo-bot/src/ai/tools.ts:512-531` — `requestHuman` (only mutates conversation_status; sends NO message).
- `el-templo-bot/src/ai/tools.ts:555-689` — `bookClass` (BUG-05 fail-string at `:688`; fetch site for `withTimeout` at `:636`).
- `el-templo-bot/src/ai/tools.ts:691-725` — `queryAlternativeSchedules` (referenced by `bookClass` on 400/full).
- `el-templo-bot/src/ai/tools.ts:727-846` — `registerTrial` (BUG-05 fail-string at `:845`; fetch site for `withTimeout` at `:806`).
- `el-templo-bot/src/ai/system-prompt.ts:70-86` — Phase 91 SOFT_REJECTION_WHY_RULE / SOFT_REJECTION_BACKOFF_RULE (UNCHANGED by Phase 95; SC#3 guardrail).
- `el-templo-bot/src/ai/system-prompt.ts:223` — `request_human` SILENCIO rule (UNCHANGED by Phase 95).
- `el-templo-bot/src/webhook/handler.ts:91` — `MAX_TOOL_ITERATIONS = 5` (caps how many failures can stack in one inbound).
- `el-templo-bot/src/webhook/handler.ts:451-455` — Phase 91 soft-rejection rule injection (DEGR-02 guardrail surface).
- `el-templo-bot/src/webhook/handler.ts:586` — `humanTakeoverTriggered` local boolean declaration (D-10 pattern reference).
- `el-templo-bot/src/webhook/handler.ts:589-642` — tool-loop region (counter increment site).
- `el-templo-bot/src/webhook/handler.ts:682-694` — `executeTool` call + `humanTakeoverTriggered` set point (D-07 exit path).
- `el-templo-bot/src/webhook/handler.ts:844-866` — post-tool-loop `segments[0]`-only branch (D-08 suppresses this for synthetic-phrase path).
- `el-templo-bot/.env.example` — destination for `EXECUTE_TOOL_TIMEOUT_MS=30000` per D-17.

### Discipline Anchors (Phase 93/94 Patterns to Mirror)

- `el-templo-bot/test/v5-3-3-handler-concurrency.test.ts` — Phase 93 TDD fail-in-main unit pattern (mocked Redis/SDK, fake timers).
- `el-templo-bot/test/v5-3-3-openai-latency.test.ts` — Phase 94 TDD pattern (mocked OpenAI APIError, fake timers).
- `el-templo-api/test/whatsapp/v5-3-3-handler-concurrency.integration.test.ts` — Phase 93 integration regression-protector pattern (real DB, real webhook flow).
- `el-templo-api/test/helpers.ts` — `createTestApp()` factory + auth helpers for `eltemplo_test` integration tests.
- `el-templo-bot/CLAUDE.md` (lines 36-39) — test convention: integration tests in `el-templo-api/test/whatsapp/`, unit tests in `el-templo-bot/test/`.
- `.planning/phases/93-handler-concurrency/93-01-PLAN.md` — atomic-commit cadence, verification block style, adversarial plan-checker framing.
- `.planning/phases/94-openai-latency-graceful-failure/94-01-PLAN.md` — single-plan mechanical task structure (alternative reference for plans 95-02 and 95-03).

### Phase 91 / Phase 97 Coupling

- `.planning/phases/91-pb1-objection-handling/91-CONTEXT.md` — original SOFT_REJECTION_WHY_RULE / SOFT_REJECTION_BACKOFF_RULE rationale (DEGR-02 guardrail context).
- `el-templo-bot/test/v5-3-2-regression.test.ts` — RLOK pattern + snapshot byte-equality tripwire shape Phase 97 RGUARD-01 will mirror as `v5-3-3-regression.test.ts`.
- `el-templo-bot/test/v5-3-2-regression.test.ts:57` — `POST_RLOK_04_BYTES = 18370` (Phase 95 does NOT modify this — handler-side synthetic phrasing chosen precisely to avoid touching `system-prompt.ts`).

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- **`sendTextMessage` and `sendInteractiveMessage`** in `el-templo-bot/src/whatsapp/client.ts` — used for ALL outbound WhatsApp messages. Synthetic-phrase emission (D-05) uses `sendTextMessage` directly, not `sendInteractiveMessage` (no buttons).
- **`humanTakeoverTriggered` flag pattern** at `handler.ts:586, :692-694` — local boolean inside `processWithAiInner`. Plan 95-03's `failedToolCalls` counter (D-10) mirrors this exact pattern: local scalar in the same function, no Redis, no cross-invocation state.
- **`OpenAI.APIError` instanceof discriminator** wiring at `handler.ts:649-657, :718-725` (Phase 94 LAT-02) — template for Plan 95-02's `ToolTimeoutError instanceof` discriminator inside `executeTool` catch.
- **Phase 93's `setDebounce` / `isDebounceActive` atomic Lua refactor** at `el-templo-bot/src/memory/session.ts:125-155` — reference for "what NOT to do" — Plan 95-03's counter is in-process and does NOT need atomic Redis primitives (per-handler-invocation scope avoids the SETNX race surface entirely).
- **`OPENAI_TIMEOUT_MS` env var pattern** (Phase 94) added to `el-templo-bot/.env.example` directly under `OPENAI_API_KEY=` — Plan 95-02's `EXECUTE_TOOL_TIMEOUT_MS=30000` follows the same convention (one line, default value, no extra comment until Phase 97 RGUARD-03 extends).

### Established Patterns

- **All tool results are strings.** `executeTool` returns `Promise<string>`; the handler pushes the string into `messages` as `role: "tool"`. The model treats the string as opaque. Plan 95-03's allowlist (D-11) leverages this — string equality match, no structured envelopes.
- **All DB queries use raw `sql\`...\`` template literals** (`handler.ts:6-9` notes the drizzle cross-package type incompatibility). Plan 95-01's discriminating SQL tests follow this convention.
- **Test pattern: `beforeEach` truncates tables + seeds inline** in `el-templo-api/test/whatsapp/*.integration.test.ts`. Plan 95-01's BUG-03 integration test follows this — no shared fixture state.
- **`processWithAi` → `processWithAiInner` indirection** at `handler.ts:323-350` — outer try/catch is the LAT-03 graceful-fallback surface (Phase 94). Plan 95-03's counter+escalation operates INSIDE `processWithAiInner` (`handler.ts:589-642` tool-loop region) so the outer Phase 94 fallback still wraps any uncaught throw.
- **Pino structured logging** — `request.log` / `app.log` shape with object first, message string second (e.g., `log.warn({ phone, conversationId }, 'message')`). Plan 95-03's escalation log (D-09) follows.

### Integration Points

- **Plan 95-02 ↔ Plan 95-01:** Plan 95-01 (audit) commits RED tests. Plan 95-02 (BUG-03 fix + helper) MUST make them GREEN without modifying the test files themselves. The fix is at the SQL or code-path level identified by 95-AUDIT.md; if the audit names Branch 3 (compound), 95-02 implements both fix surfaces in a single plan.
- **Plan 95-02 ↔ Plan 95-03:** Plan 95-02 introduces `withTimeout` and `ToolTimeoutError`. Plan 95-03's retry-counter allowlist (D-11) references `ToolTimeoutError` as a throw-trigger. Plans 95-02 and 95-03 MUST land in order — 95-02's helper must exist before 95-03's counter can catch its error type.
- **Plan 95-03 ↔ Phase 97 RGUARD-02:** Plan 95-03 wires the retry counter at `handler.ts:589-642`. Phase 97 RGUARD-02 will assert SC#3 invariant (soft-rejection turn → NO synthetic phrase). Plan 95-03's tests should pre-empt RGUARD-02's assertions with at least one negative case (e.g., user types "lo pienso", retry counter does NOT increment) so RGUARD-02 has a known-PASS to extend.
- **Phase 95 ↔ Phase 97 RGUARD-03:** Plan 95-02 ships `el-templo-bot/src/ai/with-timeout.ts`. Phase 97 RGUARD-03 imports from the SAME path and extends usage to other `executeTool` sites. NO refactor of the helper API is permitted in Phase 97 — Phase 95 ships the stable shape.

</code_context>

<specifics>
## Specific Ideas

- **Audit task COMMITS the RED tests.** Plan 95-01's deliverables: 95-AUDIT.md naming Branch 1/2/3 + the RED integration tests in `el-templo-api/test/whatsapp/v5-3-3-booking.integration.test.ts` + the RED unit test for Sunday=0/7 in `el-templo-bot/test/v5-3-3-booking-reliability.test.ts`. The fix plan does NOT author new tests — it makes the existing RED tests GREEN. Binds audit output to TDD discipline.
- **The exact handoff phrase is locked verbatim.** `'Te paso con alguien del equipo, te escriben enseguida 🙌'` — including the 🙌 emoji and the lowercase pronoun. Any deviation (e.g., dropping the emoji, capitalizing "Equipo") triggers a regression because Phase 97 RGUARD-01 will assert byte-equal match in the v5.3.3 regression suite.
- **Allowlist strings are matched textually, not regex.** D-11's allowlist is a `Set<string>` lookup. If `tools.ts:688` later mutates to add a period or emoji, the counter stops firing — sha256-hash discipline applies to the allowlist constants. Plan 95-03's tests must include a fixture asserting the allowlist strings match the actual tool-return strings byte-for-byte.
- **`executeTool` dispatch catch-block is Plan 95-02's responsibility, NOT 95-03.** D-18 places the `ToolTimeoutError` catch in `executeTool`. This belongs in Plan 95-02 (helper introduction) — it ships with the helper, not with the counter. Plan 95-03 then consumes the returned `'Herramienta agotada por tiempo de espera.'` string via the allowlist. Cleaner plan boundaries.
- **`registerTrial` and `bookClass` BOTH get `withTimeout` in Plan 95-02.** The audit listed `tools.ts:636` (book_class POST) AND `tools.ts:806` (register_trial POST) as fetch sites with unbounded await. Plan 95-02 wraps BOTH — no per-tool gating. Phase 97 RGUARD-03 then extends to other sites.
- **No system-prompt.ts touch.** D-05/D-06 deliberately keep all escalation logic on the handler side so Phase 95 does NOT mutate `system-prompt.ts`. This means Phase 96 owns the snapshot fixture regeneration (`pb1-e1a-lead-rendered.snap.txt`) and `POST_RLOK_04_BYTES` constant bump. Plan 95-03's PR description MUST note: "system-prompt.ts unchanged — snapshot regen deferred to Phase 96."
- **Failure observability is mandatory.** The Phase 94 retrospective showed that BUG-02 was hard to diagnose because stdout logs were "gone" — for BUG-05's safety net, structured logs (D-09) make the trigger observable even before v5.4.0 wires durable log sinks.
- **Plan checker mode varies by plan within Phase 95.** Plan 95-01 (audit) = adversarial framing (mirrors Phase 93 audit discipline). Plans 95-02 and 95-03 = normal framing (mechanical). All three include the structural integrity check per the locked feedback rule.

</specifics>

<deferred>
## Deferred Ideas

- **Per-conversation Redis-backed retry counter** — captures the "user retries with different phrasing across multiple inbounds" UX pattern. Deferred from D-10 because v5.3.3 scope is the single-inbound apology-loop fix; cross-inbound retry persistence is v5.4+ when richer state graph emerges.
- **Per-tool-name counter granularity** — tracks failures per (phone, toolName). Audit Unknown #3 explicitly flagged this as plan-time; deferred from D-10 in favor of simpler per-invocation counter.
- **Structured `{ok, message, reason}` envelope refactor for `executeTool`** — cleanest semantics for failure trigger detection but explicitly out of v5.3.3 scope per REQUIREMENTS.md ("Refactoring `executeTool` beyond timeout addition" is out of scope). Audit confirms v5.4+ territory.
- **`pendingActions` Map → Redis migration** — addresses the bot-restart-mid-confirmation dead-button case (audit Unknowns at line 235). Not blocking for v5.3.3 (no requirement covers it). v5.4+ scope.
- **`getLocation` LIKE-search ambiguity fix beyond what the audit names** — if 95-AUDIT.md picks Branch 1 (LIKE-search single root cause), Plan 95-02 fixes JUST the booking-search path, not a broader `getLocation` refactor. A general-purpose branch-resolution refactor is deferred.
- **System-prompt rule for "must emit handoff phrase before request_human"** — D-05 chose handler-side synthetic over a new prompt rule. The rule option (alternative iii from CONTEXT discussion) is deferred — would be reconsidered if handler-side synthetic causes UX regressions empirically.
- **Multi-run sampling test for BUG-03 model-side candidate (Sunday=0/7)** — Plan 95-01 ships a single-run unit test for the Sunday=0/7 candidate. Phase 97 ELEV-01 / VOSEO-01 discussion will land the milestone-wide non-deterministic regression strategy; if multi-run sampling is chosen there, the Sunday=0/7 test could be migrated to that strategy as a refinement.
- **`withTimeout` overload for non-fetch consumers** — D-15 commits to `(signal) => Promise<T>` factory shape. Phase 97 RGUARD-03 may discover non-fetch consumers (DB queries, in-process operations) where AbortSignal doesn't natively apply. Adding an overload then is fine; Phase 95 ships the stable AbortController-first shape.
- **Audit Branch 5 "observability fallback"** — Phase 93 had a Branch 5 (none-of-the-above → ship Pino observability). Plan 95-01's branch enumeration deliberately omits this because the 5 BUG-03 candidates have DETERMINISTIC SQL signatures — at least one will discriminate. If 95-01 audit unexpectedly finds none of them fire, the planner adds a Branch 4 (observability) as an out-of-band decision and surfaces it for user review.
- **Reviewing the `humanTakeoverTriggered` flag's interaction with the existing `request_human` handler.ts:844-866 segments-branch** when D-08 drops the model's response.content — there may be a cleaner refactor that unifies the two paths. Deferred to v5.4 if the duplication becomes visible.

</deferred>

---

_Phase: 95-booking-reliability-graceful-degradation_
_Context gathered: 2026-05-18 — discussion with 4 areas (BUG-03 investigation strategy, DEGR-01 escalation phrasing surface, retry counter scope + failure trigger, `withTimeout` helper shape)_
