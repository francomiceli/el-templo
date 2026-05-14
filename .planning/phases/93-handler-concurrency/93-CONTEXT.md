# Phase 93: Handler Concurrency - Context

**Gathered:** 2026-05-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Eliminate duplicate bot responses when a single user sends multiple messages in rapid succession (live-test BUG-01: "Hola" → "Hola?" → "Holaaaaa" produced multiple Mica replies). Investigative phase — the existing 3s debounce + 10s Redis dead-man switch (`el-templo-bot/src/webhook/handler.ts:95`+) may already be correct, in which case Phase 93's deliverable shifts to observability-so-the-bug-is-capturable-next-time rather than a fix. Scope is the duplicate-response failure mode regardless of which layer (handler entry debounce / Redis lock / Meta message-ID dedup) the root cause turns out to live in.

Explicit non-scope: introducing an external message queue (BullMQ, RabbitMQ) — over-engineered at ~100 convs/day per `.planning/REQUIREMENTS.md` Out of Scope.

</domain>

<decisions>
## Implementation Decisions

### Investigation order (audit-first, branching on outcome) — REVISED 2026-05-13 post-codebase-audit

**Audit-first discipline retained, but original 3-branch structure expanded to 5 branches.** The `.planning/v5.3.3-codebase-audit.md` invalidated the "Meta dedup likely missing" hypothesis (dedup is wired correctly at `handler.ts:291-306` with UNIQUE constraint at `el-templo-api/src/db/schema/whatsapp.ts:84`) and surfaced two new candidates (SETNX-race, TTL/upstream coupling). The investigation now enumerates 5 named branches, not 3.

Investigate before fixing. Order (cheapest first):

1. **Audit SETNX-race candidate** (`el-templo-bot/src/memory/session.ts:125-155`) — `isDebounceActive` (read) + `setDebounce` (write) are two separate Redis round-trips. Concurrent webhook invocations can both observe "inactive" before either writes. Static analysis can confirm the non-atomic shape; whether it FIRES depends on timing windows in production.
2. **Audit TTL/upstream coupling candidate** — compute worst-case post-Phase-94 handler runtime (`OPENAI_TIMEOUT_MS=45000` × tool-loop iterations + executeTool budgets). Compare to current `DEBOUNCE_TTL_SECONDS=10`. The audit already established this is a known mismatch — confirm via code reading whether the dead-man switch firing during in-flight work would cause parallel handlers to spawn.
3. **Audit Meta retry edge cases** — the dedup at `handler.ts:291-306` exists. Question is whether it fires BEFORE the duplicate-response race window in all retry scenarios. Read the routes/handler entry order; verify dedup short-circuits early enough.
4. **Audit existing debounce/lock mechanism for any other defects** beyond the SETNX-race — TTL semantics, error handling, lock release in throw path.
5. **If all 4 audits show mechanisms are correct** → ship observability (Pino structured logs) per the "don't fix nothing observable" anti-pattern guard.

The 5 branching outcomes — planned in advance, not discovered mid-phase:

- **Branch 1 — SETNX-race** (audit confirms non-atomic check-then-set fires under specific timing) → fix at `session.ts:125-155` with atomic Redis primitive (`SET phone token NX PX ms` returns OK/null in one round-trip). TDD-author the regression test.
- **Branch 2 — Meta retry edge case** (audit reveals dedup exists but doesn't fire before race window in some scenario) → fix the ordering / dedup call site placement. TDD-author the regression test simulating the specific retry pattern.
- **Branch 3 — SETNX-race + dedup-ordering compound** (both fire) → fix both. Single regression test exercising both surfaces.
- **Branch 4 — TTL/upstream coupling** (`DEBOUNCE_TTL_SECONDS=10` is too short for worst-case post-Phase-94 handler runtime) → raise TTL OR introduce heartbeat-refresh (see Cross-Phase Invariant section below). **Most likely root cause per audit** — debug session bot-3min-response-latency evidence + audit's TTL/runtime math both point here.
- **Branch 5 — None of the above** (all 4 audits confirm mechanisms are correct) → ship observability (Pino structured logs at debounce acquire/release, duplicate detected/dropped/coalesced, Redis lock acquire/release). Capturable next time bug manifests.

**Phase 93 ships meaningful artifacts in every branch.** No "investigated and found nothing" outcomes.

### Observability fallback (when no fix is needed)

If the audit finds the existing mechanism is correct, Phase 93 ships **Pino structured logs at decision points**:

- `log.info` on debounce-window acquire and release (per phone hash, with timing delta)
- `log.warn` on duplicate detected and dropped/coalesced (phone hash + Meta message_id + timing delta from prior message)
- `log.info` on Redis lock acquire and release

Grep-friendly in dev (stdout); sink-friendly when v5.4.0 wires Pino → file/external sink. Cheapest, most reusable across future bot phases. Adds zero runtime cost in the happy path.

Sentry breadcrumbs and Redis counter were considered and rejected — Sentry adds a dependency check before v5.4.0 wires bot-side Sentry, and Redis counter is stateful with no consumer until v5.4.0 dashboards exist.

### Duplicate UX behavior (two cases distinguished)

Duplicates are NOT all the same shape. The plan must handle both:

- **Same-message rapid-fire** (e.g., "Hola" + "Hola" + "Hola" or "Hola?" + "Hola?"): **Silent drop** of all but one. This matches existing semantic — the user just wants ONE response, not feedback about how the bot processed their typing.
- **Different-message rapid-fire** (e.g., "Hola" + "¿hay clases mañana?" arriving inside the same debounce window): **Coalesce** — both messages join into one AI context turn. The 3s debounce already buffers; the AI sees both as the user's combined turn and responds to the union. Matches how the user is mentally composing one thought across messages.

The handler must distinguish same-vs-different message bodies (or message_ids) before applying drop-vs-coalesce — exact distinguishing mechanism (message body equality? message_id equality? Both?) deferred to plan-time after audit reveals existing semantic.

### Test/repro shape — TDD with fail-in-main discipline

The regression test must **fail in main first**, then pass after the fix. This applies to both unit and integration tests. Specifically:

1. Author test against the current main branch and **observe FAILURE** — proves the test captures the actual bug, not just the implementation choice.
2. Implement the fix (or observability) per investigation outcome.
3. Re-run test, observe PASS.

This anti-pattern is what we're guarding against: implementing a fix first and then writing a test that passes trivially because it tests the code you just wrote, not the bug. Tests that don't capture the bug are no-ops.

Plan should include:

- One **unit test** simulating concurrent invocations of `processWithAi` (mocked Redis state, deterministic timing).
- One **integration test** through the webhook layer (Fastify `inject` or HTTP — plan decides).
- **Live-test scenario** deferred to Phase 97's regression suite per the v5.3.2 Phase 92 pattern.

### Cross-Phase Invariant (Phase 93 ↔ 94 ↔ 97) — ADDED 2026-05-13

**Phase 93 owns the TTL fix.** Per user decision 2026-05-13 (post-codebase-audit): the `DEBOUNCE_TTL_SECONDS` constant lives in `handler.ts:97`, physically inside Phase 93's scope. Phase 94's timeout fix lives in a different file (`openai.ts:29`) and addresses a different concern. Coupling them by having Phase 94 set Phase 93's config violates "one phase = one responsibility."

**Invariant that MUST hold post-Phase-94+97** (canonical block — must be textually identical in 93-CONTEXT.md, ROADMAP.md Phase 93 Notes, ROADMAP.md Phase 94 SC#1, and MACRO-ROADMAP.md constraint #6):

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

**Implementation choices (plan-time decision):**

- **(a) Static large TTL** (e.g., 600s) — simplest, no extra code. Increases the window during which a stuck handler holds the lock; offset by Phase 94's timeout bounding handler runtime.
- **(b) Heartbeat-refresh** — periodic Redis `EXPIRE` while work is in-flight. More complex but doesn't require a large static TTL. Failure mode: if heartbeat loop crashes, lock is stuck for the static TTL.
- **(c) Hybrid** — moderate TTL (e.g., 120s) + heartbeat-refresh from inside `processWithAi`.

The cross-phase invariant means Phase 93's TTL change MUST land before Phase 94's `OPENAI_TIMEOUT_MS=45000` ships — otherwise the dead-man switch will fire mid-OpenAI-call. Phase 94 SC#1 explicitly cross-references this.

### Meta message-ID dedup status (NOT a "fix surface" — audit confirmed)

The original CONTEXT.md framing — "Meta dedup is the leading suspect" — was invalidated by `.planning/v5.3.3-codebase-audit.md`. Dedup IS wired:

- `el-templo-bot/src/webhook/handler.ts:291-306` performs `INSERT INTO whatsapp_messages (... whatsapp_message_id, ...)` with `try { ... } catch (err) { if (isDuplicateEntryError(err)) { return; } throw err; }`
- Backed by MySQL UNIQUE constraint at `el-templo-api/src/db/schema/whatsapp.ts:84`
- Non-text messages have the same pattern at `handler.ts:274-289`

The remaining open question (Branch 2 in the revised investigation order) is whether dedup fires BEFORE the duplicate-response race window in all retry scenarios, NOT whether it exists. Phase 93's investigation focus is the SETNX-race window + TTL/upstream coupling, not dedup existence.

### Claude's Discretion

- Exact Pino log field shapes (which keys/values, structured tags, sampling rates)
- Specific time-box / pivot threshold for "stop investigating, ship observability" (plan can set this if useful)
- Exact repro recipe (Fastify `inject` vs running HTTP server; `Promise.all` vs `setTimeout`-spaced; mocked Redis vs real)
- Where exactly in the pipeline to add the Meta dedup audit (`routes.ts:54` post-ack vs `handler.ts:323` pre-process)
- Hash strategy for phone in logs (truncated SHA? last 4 digits? full?)

</decisions>

<specifics>
## Specific Ideas

- **Don't ship a fix that fixes nothing observable.** Anti-pattern explicitly named. If the audit confirms existing mechanism is correct, the phase pivots to observability, not "make a change for the sake of the milestone."
- **Two duplicate-case framing.** The "silent drop" recommendation only covers same-message duplicates. Different-message rapid-fire ("Hola" + "¿hay clases mañana?") loses the user's actual question if silently dropped — coalesce is the right shape for that case.
- **TDD fail-in-main rule.** Mirror discipline from v5.3.2 Phase 92's behavioural-integration suite where tests assertion-locked actual bug behaviors. Phase 93's test must be authored against current main with observed failure before fix.
- **Meta dedup is NOT the leading suspect** — original hypothesis invalidated by `.planning/v5.3.3-codebase-audit.md`. Dedup exists at `handler.ts:291-306` and is correctly wired with UNIQUE constraint at `el-templo-api/src/db/schema/whatsapp.ts:84`. The audit elevated two new candidates: SETNX-race at `session.ts:125-155` (non-atomic check-then-set) and TTL/upstream coupling (`DEBOUNCE_TTL_SECONDS=10` shorter than worst-case post-Phase-94 handler runtime). **TTL/upstream coupling is the most likely root cause** per debug session evidence + audit's runtime math.
- **Phase ships meaningful artifacts in every branch.** No "investigated and found nothing" outcomes — either a fix or observability ships, never empty.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within Phase 93 scope. The `executeTool` localhost timeout sweep flagged from the BUG-02 debug session is already captured in Phase 97 RGUARD-03 per ROADMAP.md.

</deferred>

---

_Phase: 93-handler-concurrency_
_Context gathered: 2026-05-13_
_Revised: 2026-05-13 post-codebase-audit — replaced 3-branch with 5-branch investigation order; added Phase 93 ↔ 94 ↔ 97 cross-phase invariant block; invalidated "Meta dedup leading suspect" hypothesis; marked TTL fix as in-scope for Phase 93._
