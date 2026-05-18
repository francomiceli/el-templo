# Phase 95: Booking Reliability + Graceful Degradation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-18
**Phase:** 95-booking-reliability-graceful-degradation
**Areas discussed:** BUG-03 investigation strategy, DEGR-01 escalation phrasing surface, Retry counter scope + failure trigger, `withTimeout` helper shape

---

## BUG-03 Investigation Strategy

### Q1: How should Phase 95 pick the BUG-03 root cause before authoring the fix?

| Option                                             | Description                                                                                                                                                                       | Selected |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Spawn 95-AUDIT plan with discriminating SQL tests  | First plan reads code paths + writes targeted SELECT queries against eltemplo_test that DISTINGUISH the 5 candidates. Names ONE root cause in 95-AUDIT.md before fix plan starts. | ✓        |
| Skip 95-AUDIT — reference milestone audit directly | Phase 94 pattern. Risks fixing the wrong thing per audit's own warning.                                                                                                           |          |
| Audit + live WhatsApp reproduction                 | Blocked by dev environment limits (ngrok + Meta test tokens).                                                                                                                     |          |

**User's choice:** Spawn 95-AUDIT plan with discriminating SQL tests.
**Notes:** Recommended option. Phase 93 audit-first precedent; Phase 94 mechanical surface didn't apply here.

### Q2: Audit deliverable shape?

| Option                                                             | Description                                                  | Selected |
| ------------------------------------------------------------------ | ------------------------------------------------------------ | -------- |
| 95-AUDIT.md + failing tests bound to TDD discipline                | Audit commits RED tests; fix plan turns GREEN.               |          |
| 95-AUDIT.md report only                                            | Cleaner separation; risks fix plan re-litigating decisions.  |          |
| Audit report + compound-failure handling (Phase 93 Branch 3 shape) | Enumerate Branch 1/2/3, define fix scope per branch upfront. | ✓        |

**User's choice:** Audit report + compound-failure handling.
**Notes:** Mirrors Phase 93 audit's 5-branch enumeration. Compound failures (2+ candidates) are explicitly handled.

### Q3: Which test surface should the audit's discriminating tests target?

| Option                                                                | Description                                                         | Selected |
| --------------------------------------------------------------------- | ------------------------------------------------------------------- | -------- |
| Integration tests in `el-templo-api/test/whatsapp/`                   | Real eltemplo_test MySQL. Per CLAUDE.md convention.                 |          |
| Unit tests in `el-templo-bot/test/v5-3-3-booking-reliability.test.ts` | Mirrors Phase 93/94 surface; mocking DB defeats SQL discrimination. |          |
| Split: integration for SQL-level, unit for model/prompt-level         | Each candidate lives where it can actually be discriminated.        | ✓        |

**User's choice:** Split.
**Notes:** Sunday=0/7 candidate is model-side (unit); other 4 are DB/code (integration).

### Q4: Plan task count?

| Option                                                                 | Description                                                                | Selected |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------- | -------- |
| 3 plans — audit, fix+helper, escalation (Recommended, matches ROADMAP) | 95-01 audit, 95-02 BUG-03 fix + helper, 95-03 BUG-05 escalation.           | ✓        |
| 2 plans — audit+fix bundled, escalation separate                       | Saves one verification cycle; large BUG-03 plan if audit reveals Branch 3. |          |
| 4 plans — audit / helper / BUG-03 fix / BUG-05 fix                     | Cleaner Phase 97 cross-reference; heavier than Phase 93.                   |          |

**User's choice:** 3 plans (Recommended).

---

## DEGR-01 Escalation Phrasing Surface

### Q1: Where should the handoff phrase get emitted?

| Option                                                                 | Description                                                  | Selected |
| ---------------------------------------------------------------------- | ------------------------------------------------------------ | -------- |
| Handler-side synthetic message after counter trips                     | Deterministic; doesn't rely on model behavior under failure. | ✓        |
| Trust the model + existing system-prompt.ts:223 rule                   | Cleanest SC#3 invariant; brittle under model misbehavior.    |          |
| Explicit new system-prompt rule binding handoff phrasing on escalation | Triggers POST_RLOK_04_BYTES coordination with Phase 96.      |          |

**User's choice:** Handler-side synthetic.
**Notes:** Deliberately keeps Phase 95 OFF system-prompt.ts so Phase 96 owns snapshot regen.

### Q2: Loop exit semantics?

| Option                                                                                  | Description                                                            | Selected |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | -------- |
| Send phrase → invoke request_human via executeTool → humanTakeoverTriggered=true → exit | Reuses existing exit path at handler.ts:692-694.                       | ✓        |
| Send phrase → directly UPDATE conversation_status → return cleanly                      | Bypasses executeTool layer; second code path for status mutation.      |          |
| Send phrase → inject TOOL_FAILED tool result → let model do another iteration           | Risks SC#3-invariant conflation; model may emit extra apologetic line. |          |

**User's choice:** Reuse existing exit path.

### Q3: Phrase location + observability?

| Option                                       | Description                                                                   | Selected |
| -------------------------------------------- | ----------------------------------------------------------------------------- | -------- |
| Constant in handler.ts + Pino structured log | Handler-facing constant; structured log per Phase 93 observability pattern.   | ✓        |
| Constant in shared phrases module + log      | Mixes handler-facing with model-facing constants (Phase 91 in system-prompt). |          |
| Inline string + log                          | Smallest diff; multi-doc invariant risk.                                      |          |

**User's choice:** Constant in handler.ts + Pino structured log.

---

## Retry Counter Scope + Failure Trigger

### Q1: Counter scope and reset behavior?

| Option                                                      | Description                                                                       | Selected |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------- | -------- |
| Per-handler-invocation (in-process Map, resets per inbound) | Simplest; matches humanTakeoverTriggered local-boolean pattern at handler.ts:586. | ✓        |
| Per-conversation, Redis-backed (durable across inbounds)    | Catches cross-inbound retry pattern; adds Redis schema + reset logic.             |          |
| Per-tool-name (resets when different tool succeeds)         | Audit Unknown #3; semantically rich but state lifecycle unclear.                  |          |

**User's choice:** Per-handler-invocation.

### Q2: What counts as a failure?

| Option                                                 | Description                                                                      | Selected |
| ------------------------------------------------------ | -------------------------------------------------------------------------------- | -------- |
| Hard errors + explicit fail-string allowlist           | Catches BUG-05 transcript (tools.ts:688 string) AND ToolTimeoutError; SC#3-safe. | ✓        |
| Hard errors only (throw / ToolTimeoutError)            | Misses the documented BUG-05 case (fetch succeeds, returns unhelpful string).    |          |
| Refactor executeTool to {ok, message, reason} envelope | Out of v5.3.3 scope per REQUIREMENTS.md.                                         |          |

**User's choice:** Hard errors + explicit fail-string allowlist.
**Notes:** Allowlist locked in CONTEXT.md D-11 with verbatim strings.

### Q3: Increment granularity?

| Option                                                 | Description                                                                                        | Selected |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------- | -------- |
| Per-tool-call, no reset within inbound                 | Every failing tool call increments; success doesn't reset.                                         | ✓        |
| Per-tool-call, reset on success within inbound         | Lenient; oscillation between succeeded info-tools and failed action-tools may suppress escalation. |          |
| Per-iteration (any failure in iteration = 1 increment) | Smooths spiky failures; mismatches "after 2 failed attempts" REQUIREMENTS language.                |          |

**User's choice:** Per-tool-call, no reset within inbound.

### Q4: Model text on counter trip?

| Option                                                                | Description                                        | Selected |
| --------------------------------------------------------------------- | -------------------------------------------------- | -------- |
| Drop model's response.content — synthetic phrase is the only outbound | Cleanest UX; user sees one message.                | ✓        |
| Send model's response.content first, then synthetic phrase            | Duplicate-failure UX risk.                         |          |
| Send synthetic phrase first, then model's response.content            | Reverses natural flow; confusing if contradictory. |          |

**User's choice:** Drop model's response.content.

---

## `withTimeout` Helper Shape

### Q1: Cancellation semantics?

| Option                                                        | Description                                       | Selected |
| ------------------------------------------------------------- | ------------------------------------------------- | -------- |
| AbortController + ToolTimeoutError                            | Real cancellation; fetch socket actually closes.  | ✓        |
| Promise.race + custom Error                                   | Simpler; in-flight fetch keeps running uselessly. |          |
| Hybrid: AbortController for fetch, Promise.race for non-fetch | More API surface; Phase 97 may motivate later.    |          |

**User's choice:** AbortController + ToolTimeoutError.

### Q2: File location?

| Option                                            | Description                                      | Selected |
| ------------------------------------------------- | ------------------------------------------------ | -------- |
| `el-templo-bot/src/ai/with-timeout.ts` standalone | Co-located with AI/tools layer; clean ownership. | ✓        |
| Co-located in `el-templo-bot/src/ai/tools.ts`     | tools.ts already 850+ lines; accelerates bloat.  |          |
| `el-templo-bot/src/utils/with-timeout.ts`         | Empty new module category.                       |          |

**User's choice:** Standalone `el-templo-bot/src/ai/with-timeout.ts`.

### Q3: Env var naming?

| Option                          | Description                                                 | Selected |
| ------------------------------- | ----------------------------------------------------------- | -------- |
| `EXECUTE_TOOL_TIMEOUT_MS=30000` | Matches canonical invariant block; Phase 97 reuses.         | ✓        |
| `BOT_TOOL_TIMEOUT_MS=30000`     | Generic; disconnects from invariant variable name.          |          |
| `WITH_TIMEOUT_DEFAULT_MS=30000` | Names helper, not use case; worst for grep-discoverability. |          |

**User's choice:** `EXECUTE_TOOL_TIMEOUT_MS=30000`.

### Q4: ToolTimeoutError catch site?

| Option                                                      | Description                                             | Selected |
| ----------------------------------------------------------- | ------------------------------------------------------- | -------- |
| Inside executeTool dispatch (tools.ts:220-243)              | Returns tagged fail-string; unifies error pathway.      | ✓        |
| Inside the tool loop in handler.ts (per-toolCall try/catch) | Closer to counter; adds handler.ts:682-688 catch logic. |          |
| Inside each tool function (bookClass, registerTrial)        | Most localized; duplicates catch across N functions.    |          |

**User's choice:** Inside executeTool dispatch.

---

## Claude's Discretion

- `withTimeout` API ergonomics (factory shape vs overloads)
- `ToolTimeoutError` message text and fields (instanceof is sufficient)
- Audit task SQL test fixture seed shape for `eltemplo_test`
- `request_human` `reason` argument format (stable enum vs free-form)
- Whether Branch 3 (compound) fix is a SINGLE PR or splits

## Deferred Ideas

- Per-conversation Redis-backed retry counter (v5.4+)
- Per-tool-name counter granularity (v5.4+)
- Structured `{ok, message, reason}` envelope refactor (v5.4+)
- `pendingActions` Map → Redis migration (v5.4+)
- General-purpose `getLocation` LIKE-search refactor (deferred if not the BUG-03 root cause)
- System-prompt rule for "must emit handoff phrase before request_human" (reconsidered if handler-side synthetic regresses)
- Multi-run sampling for BUG-03 Sunday=0/7 candidate (Phase 97 ELEV-01/VOSEO-01 strategy applies if multi-run is chosen)
- `withTimeout` overload for non-fetch consumers (Phase 97 RGUARD-03 may motivate)
- Branch 5 observability fallback for 95-AUDIT (deliberately omitted — SQL discriminators are deterministic)
- `humanTakeoverTriggered` flag + segments-branch unification refactor (v5.4 if duplication becomes visible)
