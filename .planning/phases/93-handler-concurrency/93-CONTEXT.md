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

### Investigation order (audit-first, branching on outcome)

Investigate before fixing. Order:

1. **Audit existing debounce + Redis lock semantics** (`handler.ts:95`+, `DEBOUNCE_DELAY_MS=3000`, `DEBOUNCE_TTL_SECONDS=10`) — cheapest to inspect. Confirm or rule out as the bug surface.
2. **Audit Meta message-ID dedup** — check whether `whatsapp_messages.message_id`-level dedup exists, and whether it triggers **before** the debounce/Redis lock. User's leading hypothesis is that this layer is likely the real fix surface: Meta retry behavior on 5xx (or transient delivery oddities) would explain duplicate responses more directly than concurrency races inside the bot.
3. **If both audits show mechanisms are correct** → add diagnostic Pino logs (see Observability fallback below) and conclude phase. Do NOT "implement a fix that fixes nothing observable" — that's the explicit anti-pattern to avoid.

The branching outcome is planned in advance, not discovered mid-phase:

- **Audit finds debounce/lock broken** → fix at that layer, TDD-author the regression test.
- **Audit finds Meta dedup missing/broken** → expand Phase 93 scope to fix it (see Meta dedup boundary below). CONC-01 still owns the user-visible failure mode regardless of layer.
- **Audit confirms mechanisms are correct** → ship observability (Pino structured logs) so the bug is capturable next time it manifests. Phase ships meaningful artifacts either way.

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

### Meta message-ID dedup boundary

If the audit reveals that `whatsapp_messages.message_id`-level dedup is missing or broken (and that's the real fix surface): **fix it in Phase 93**, expand scope as needed. Don't split into a decimal phase or defer to v5.4.0.

Reason: CONC-01 owns the user-visible failure mode (duplicate responses), not a specific layer's mechanism. Splitting hairs about which layer would just delay the user-visible fix. v5.4.0 is for prod-deploy infrastructure, not for bot-logic bug fixes that were known before the deploy.

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
- **Meta dedup is the leading suspect.** Per user's hypothesis: Meta webhook retries on 5xx (or transient delivery oddities) would explain duplicate responses more cleanly than internal concurrency races, since the bot's existing 3s debounce + 10s dead-man switch are already engineered for this. Audit should weight this hypothesis appropriately.
- **Phase ships meaningful artifacts in every branch.** No "investigated and found nothing" outcomes — either a fix or observability ships, never empty.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within Phase 93 scope. The `executeTool` localhost timeout sweep flagged from the BUG-02 debug session is already captured in Phase 97 RGUARD-03 per ROADMAP.md.

</deferred>

---

_Phase: 93-handler-concurrency_
_Context gathered: 2026-05-13_
