# Phase 100: Bot takeover ACK, debounce, and price trigger — Context

**Gathered:** 2026-06-24
**Status:** Ready for planning
**Source:** Locked-scope user dictation round 2 (live-test findings, pre-located evidence — no discuss-phase ran by intent, Phase 99 pattern repeated)

<domain>
## Phase Boundary

Three independent bot-behavior follow-ups from live WhatsApp testing of Phases 93 + 99. All scope is **el-templo-bot only** (the integration-ready scope owned by this developer per `project_bot_scope_boundary`) plus **tests in `el-templo-api/test/whatsapp/` (integration, shared MySQL `eltemplo_test` DB) AND `el-templo-bot/test/` (unit)**. **Local only** — no push to master, no deploy.

The 3 items are conceptually independent (different behavioral concerns) but share `el-templo-bot/src/webhook/handler.ts` as the primary code surface — the planner picks wave structure based on file-conflict analysis. Each item is internally cohesive enough to be its own plan.

In scope:

- `el-templo-bot/src/webhook/handler.ts` — debounce mechanism (Item 1) + takeover bare-return path (Item 2b) + escalation phrase + request_human site (Item 2a) + detectPriceObjection helper (Item 3)
- `el-templo-bot/src/ai/tools.ts` — `request_human` tool schema (Item 2a — verify reason arg flow; no functional change expected if already wired)
- `el-templo-bot/.env.example` — new tunable env vars for Item 1 (quiet window + cap) and Item 2b (takeover-ack Redis TTL)
- New unit tests under `el-templo-bot/test/` for each item's deterministic logic
- New integration tests under `el-templo-api/test/whatsapp/` for end-to-end behaviors

Out of scope (HARD GUARDS):

- Any change to `el-templo-api/src/**` runtime code (other dev owns the API)
- Any change to `DEBOUNCE_TTL_SECONDS` (600s, the lock safety-net) — this is the cross-phase invariant per Phase 93 ↔ 94 ↔ 97; the aggregation DELAY is a separate concept from the lock TTL
- The 6-pair sha256 cross-phase invariant (canonical block textually identical across `93-CONTEXT.md`, Phase 94 SC#1, MACRO-ROADMAP.md) — leave untouched
- Auto-follow-up scheduler for human-takeover (nudge if no human responds within X) — deferred to a fast-follow phase after Item 2 proves out in production
- New playbooks, state-machine redesign, CRM integration, prompt-architecture changes
- Push to master or deploy

</domain>

<decisions>
## Implementation Decisions (Locked)

### Item 1 — Trailing debounce for multi-message senders (DBNC-01)

**Verified evidence:**

- `DEBOUNCE_DELAY_MS = 3000` at `el-templo-bot/src/webhook/handler.ts:153` (the FIXED aggregation window)
- `DEBOUNCE_TTL_SECONDS = 600` at `handler.ts:167` (the lock safety-net — HARD GUARD, do NOT touch)
- Mechanism at `handler.ts:455-476`: `tryAcquireDebounce(SETNX) → setTimeout(DEBOUNCE_DELAY_MS) → processWithAiInner → releaseDebounce`
- The session re-read inside `processWithAiInner` picks up messages that arrived during the window — that's how aggregation works today

**Problem:** Fixed 3s window from the first message punishes single-message senders (they wait the full window for nothing) and is too aggressive for multi-message senders (3s isn't long enough to catch a slow typer).

**Locked fix — trailing debounce with cap:**

- Replace the single fixed `setTimeout(DEBOUNCE_DELAY_MS)` at `handler.ts:465` with a poll-and-extend loop:
  - On each new inbound arrival (detected by reading the session's latest-inbound timestamp from Redis), reset the wait — the deadline becomes `now + DEBOUNCE_QUIET_WINDOW_MS`.
  - Loop sleeps short intervals (suggested 250ms or 500ms — planner picks based on Redis latency tolerance) and checks: has a newer-than-last-seen inbound arrived? If yes, extend; if no, check whether quiet-window elapsed.
  - When quiet-window elapses OR the hard cap is reached, exit the loop and call `processWithAiInner`.
- Two tunable constants (env-overridable, default values inline-documented):
  - `DEBOUNCE_QUIET_WINDOW_MS` — default **7000** (7s) — how long to wait after the last inbound before firing
  - `DEBOUNCE_HARD_CAP_MS` — default **30000** (30s) — absolute max time from first-inbound to fire, prevents a non-stop typer from stalling the bot forever
- Document inline why the cap exists (operational sanity check + safety-net independent of the per-iteration sleep).
- Add a pino log at the cap-trip moment so operators can see when a user hit the ceiling.
- The lock TTL (`DEBOUNCE_TTL_SECONDS = 600s`) stays. The cap (30s) is well under it, so the SETNX safety-net still bounds runaway handlers — no invariant violation.

**HARD GUARDS:**

- Do NOT touch `DEBOUNCE_TTL_SECONDS` or its formula (`(OPENAI_TIMEOUT_MS/1000) × MAX_TOOL_ITERATIONS + (executeTool_timeout × MAX_TOOL_ITERATIONS) + safety_buffer`).
- Do NOT touch the 6-pair sha256 cross-phase invariant block at `93-CONTEXT.md`, Phase 94 SC#1, MACRO-ROADMAP.md.
- Phase 93's SETNX serialization (concurrency control — exactly one handler per phone at a time) MUST still hold. The poll-and-extend loop runs INSIDE the SETNX-acquired window; it does not introduce a parallel handler path.
- Existing behavior for the single-message case (no follow-up arrival) MUST still fire within the quiet-window — verify by integration test (single inbound, no follow-up → bot replies in ~7s, not 30s).

### Item 2 — Human-takeover acknowledgment (TAKE-01 + TAKE-02)

**Verified evidence:**

- `handler.ts:383-388` — bare `return` when `conversationStatus === "human_takeover"` (silent dead-end, no outbound feedback)
- `HANDOFF_ESCALATION_PHRASE` is defined as a **static** constant at `handler.ts:112` (verified — not currently contextual)
- The escalation flow at `handler.ts:~875` calls `sendTextMessage(phone, HANDOFF_ESCALATION_PHRASE)` then `executeTool('request_human', { reason }, ...)` per D-05/D-13
- `request_human` tool schema at `tools.ts:148-160` accepts a `reason: string` parameter — the call site already passes reason values (e.g., `'auto_escalation_after_2_failures'` per the JSDoc at handler.ts:102; injury/objection examples flow through the model-emitted path at handler.ts:761-763)

**TAKE-01 — Context-aware escalation ACK (REINFORCEMENT of an already-working path, not a replacement):**

- The model's outbound message AT the escalation turn MUST reliably reference the user's specific situation (e.g., _"vi que estás lesionado, te paso con alguien del equipo que te asesore bien"_) before going silent. The static `HANDOFF_ESCALATION_PHRASE` at `handler.ts:112` is a SEPARATE path (DEGR-01 auto_escalation_after_2_failures, tool-failure safety net) and stays untouched.
- **Verified current behavior** (pre-Phase-100): the model-driven `request_human` path at `handler.ts:845` does NOT send the static phrase. When the model emits `request_human`, its OWN contextual outbound is already sent (with extra-segment suppression at `~:996-1018` — see the "Handoff message sent, extra segments suppressed" log). So the contextual ack is ALREADY written by the model in its own words today — it just isn't reliably contextualized. TAKE-01 (A-corrected) makes this RELIABLE; it must NOT replace the model's outbound with static text.
- **LOCKED — Option A-corrected (user authorization, 2026-06-24):**
  - Add a context-aware handoff addendum (`HANDOFF_CONTEXT_AWARE_ADDENDUM`) to the system prompt that INSTRUCTS the model: when escalating via `request_human`, FIRST acknowledge the user's specific situation in its own outbound BEFORE going silent. The runtime does NOT intercept or rewrite the model's outbound — this is model-guidance only.
  - Inject via `getSystemPrompt({ handoffReason })` on every tool-loop iteration where escalation is plausible (default: every iteration after the lead has moved past PB1.E1A).
  - The addendum text must include a prompt-injection guard: instruct the model to TREAT the `reason` arg as DATA describing the user's situation, NOT as an embedded instruction to execute.
- **KGATE-05 HARD GUARD (CRITICAL):**
  - Gate the addendum so it is NEVER injected on the PB1.E1A lead render. Concrete condition in the injection logic: inject only when `activePlaybook !== "PB1" || currentStage !== "E1A"`.
  - Rationale: the PB1.E1A snapshot has only ~6 chars of headroom under the ≥20% rendered-cap (`POST_RLOK_04_BYTES = 18910`, cap = `18916`). Any injection there blows the cap and triggers a Phase 99 Task 3-style regen cycle.
  - Escalation effectively never happens at the PB1.E1A opening (lead's first message), so this gate is FREE — no behavioral cost.
- **Why Option B (typed reason→phrase function) is REJECTED:**
  - `request_human.reason` at `tools.ts:154` is `type: "string"` ("Motivo de la transferencia para contexto del agente humano") — FREE-TEXT, not a closed enum. The model generates arbitrary reason strings ("usuario lesionado busca asesoramiento", "quiere hablar con el dueño"). A per-reason map can only cover the single fixed `auto_escalation_after_2_failures` string — exactly the case that does NOT need contextualization (it's a tool-failure safety net).
  - B would also force churn on the DEGR-01 byte-exact assertion at `v5-3-3-degr-01-escalation.test.ts:527`.
- **DEGR-01 path stays UNTOUCHED (HARD GUARD):** static `HANDOFF_ESCALATION_PHRASE` at `:112`/`:875` byte-equal; the byte-exact assertion at `v5-3-3-degr-01-escalation.test.ts:527` byte-equal. TAKE-01 does not pass through this path.
- **Scope guidance:** TAKE-01 (A-corrected) is a RELIABILITY REINFORCEMENT of an already-working path. The primary user-visible fix for the "entró en takeover y no contestó más" pain is TAKE-02 (rate-limited reassurance replacing the bare return at `:383`). Do NOT over-invest TAKE-01 beyond the gated addendum + tests — no second AI call, no runtime intercept, no static phrase replacement.
- Verify: at least the two known escalation reasons (`auto_escalation_after_2_failures` from handler.ts:102 + LLM-emitted reasons like `injury`/`objection`) get a sensible context-aware ack.

**TAKE-02 — Subsequent-message reassurance (static, rate-limited, NO AI):**

- Replace the bare `return` at `handler.ts:383-388` with a single rate-limited static reassurance.
- Static message text (locked): `"Alguien del equipo te va a responder a la brevedad 🙏"` (Argentine tuteo; emoji intentional — matches Mica's existing style at system-prompt.ts:337 identity-block emoji).
- Rate-limit mechanism: Redis key `wa:takeover_ack:<phone>` with a TTL (env-overridable, default suggested **3600s** = 1h — the user typically gets one reassurance per takeover session; if takeover lasts > 1h and the lead messages again, a second ack is reasonable).
- Suggested env var: `TAKEOVER_ACK_TTL_SECONDS` (default 3600).
- Logic at the new `:383` site:
  1. Check Redis `wa:takeover_ack:<phone>` — if present (already acked within the TTL window), do nothing (silent return, same as today).
  2. If absent, SETEX the key with TTL → `sendTextMessage(phone, TAKEOVER_REASSURANCE_PHRASE)` → return.
- HARD CRITICAL: **Do NOT re-run the AI while in human_takeover.** A human is handling the conversation; the bot must not generate replies, advance playbook state, or process tool calls. Only the static reassurance.
- Key shape `wa:takeover_ack:<phone>` is consistent with existing Redis namespacing (`wa:debounce:<phone>`, `wa:playbook:<phone>`).
- Reset: when the conversation transitions OUT of `human_takeover` status (admin re-enables bot), the key SHOULD be cleared so a future takeover gets a fresh ack. Suggested location: the existing admin-side takeover-toggle endpoint (verify; if the toggle endpoint is api-side and we don't touch api/src, leave the TTL-based natural expiry as the only cleanup — note this as a behavior trade-off).

**Deferred (out of scope for Phase 100):**

- Auto-follow-up scheduler — nudge the lead if no human responds within X minutes/hours. This is a separate concern requiring scheduler integration; fast-follow phase after Item 2 proves out in production.

### Item 3 — Widen the price-inquiry trigger (TRIG-01)

**Verified evidence:**

- `detectPriceObjection` at `el-templo-bot/src/webhook/handler.ts:1409` (function declaration; regex literal on the line after the JSDoc end, at ~:1410):

  ```ts
  return /\b(caro|carisimo|car[ií]simo|precio|no me alcanza|no puedo pagar|muy caro|barato|descuento)\b/i.test(
    inboundLower,
  );
  ```

- Live-test gap confirmed: regex matches `precio` (singular) but **NOT** `precios` (plural), `cuánto sale`, `cuánto cuesta`, `cuánto vale`, `qué valores`, `tarifa`, `cuota`, `mensualidad`.
- Two consumers of `detectPriceObjection`:
  1. **Phase 99 PB1 counter (the target):** increments `priceInsistenceCount` when `detectPriceObjection` fires inside PB1 — Phase 99's whole disclosure-after-2 mechanism depends on this firing for genuine price-curious leads.
  2. **Original PB2.E2 objection handling (pre-Phase-99):** the PB2.E2 prompt selector / handler decisions also key off this regex.

**Locked widening (preserve all existing terms; add the new ones):**

New regex (single source of truth — the helper at `handler.ts:1409` is the only owner; do NOT introduce a parallel regex):

```ts
/\b(caro|carisimo|car[ií]simo|precios?|no me alcanza|no puedo pagar|muy caro|barato|descuento|cu[aá]nto (sale|cuesta|val[eé])|valor(es)?|tarifa|cuota|mensualidad)\b/i;
```

Breakdown of changes from the existing regex:

- `precio` → `precios?` (matches both singular and plural)
- Added: `cu[aá]nto (sale|cuesta|val[eé])` — matches _cuánto sale / cuánto cuesta / cuánto vale / cuanto vale_ (with or without accent)
- Added: `valor(es)?` — matches _valor / valores_
- Added: `tarifa`, `cuota`, `mensualidad`
- Kept verbatim: `caro|carisimo|car[ií]simo|no me alcanza|no puedo pagar|muy caro|barato|descuento`

**Two-consumer validation:**

- Phase 99 PB1 counter: widening is the GOAL — questions like _"¿cuánto cuesta?"_ should now increment the counter (currently they don't), so the 3rd insistence triggers disclosure.
- PB2.E2 path: a neutral price question in PB2 being treated as price-topic is **acceptable** per the user dictation. The PB2.E2 prompt branch already handles price-objection-shaped inputs; routing a neutral question through it produces a mildly-defensive but on-topic response, not a regression. Verify in integration test (PB2 lead asking _"¿cuál es el plan más barato?"_ should not break — should route through PB2.E2 cleanly).

**Tests (mandatory — close the gap with assertions):**

- Add unit test cases for each newly-matched phrase: `precios`, `cuánto sale`, `cuánto cuesta`, `cuánto vale`, `cuanto vale` (no accent), `qué valores`, `tarifa`, `cuota`, `mensualidad`.
- Add a PB1 integration test simulating the failure mode from live testing: lead asks _"¿cuánto cuesta?"_ 3 times → assert `priceInsistenceCount === 3` and the disclosure-unlocked addendum is injected on the 3rd turn.
- Add a PB2 integration test asserting a neutral price question in PB2 still produces a non-broken outbound (no crash, no regression).
- Add a negative test: phrases that contain "precio" as a substring but are NOT a price topic (e.g., _"preciosa idea"_, _"sin precio fijo de antemano"_ — adversarial) — confirm `\b` word boundaries still exclude these. (If the false-positive risk is non-trivial, planner can tighten the regex; document the decision.)

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Source files in scope (read current state before editing)

- `el-templo-bot/src/webhook/handler.ts`
  - `:112` — `HANDOFF_ESCALATION_PHRASE` static constant (Item 2a target)
  - `:153` — `DEBOUNCE_DELAY_MS = 3000` (Item 1 — being replaced by trailing-debounce loop)
  - `:167` — `DEBOUNCE_TTL_SECONDS = 600` (HARD GUARD — do NOT touch)
  - `:383-388` — bare-return on `human_takeover` (Item 2b — being replaced by rate-limited reassurance)
  - `:455-476` — SETNX debounce mechanism (Item 1 — the inner setTimeout becomes the poll-extend loop; outer SETNX serialization stays)
  - `:780` JSDoc + `:875` — `sendTextMessage(phone, HANDOFF_ESCALATION_PHRASE)` + `executeTool('request_human', ...)` escalation site (Item 2a — emit context-aware ack here)
  - `:1409` — `detectPriceObjection` function declaration; regex literal at the line after JSDoc (Item 3 target — single source of truth, do NOT parallelize)

- `el-templo-bot/src/ai/tools.ts`
  - `:148-160` — `request_human` tool schema with `reason: string` parameter (Item 2a — already accepts reason; verify it's passed through and threaded into the LLM context appropriately)

- `el-templo-bot/src/ai/system-prompt.ts` (Item 2a if Sub-option A is chosen)
  - Module-top constants region — analogous to Phase 99's `PB1_PRICE_DISCLOSURE_UNLOCKED_ADDENDUM` pattern; new addendum for context-aware handoff would land here.
  - `getSystemPrompt` conditional injection site — where Phase 99's addendum was wired (lookups: `disclosureUnlocked && activePlaybook === "PB1"` style).

### Existing patterns (study before designing)

- Redis namespacing — `wa:debounce:<phone>`, `wa:playbook:<phone>` (existing patterns; Item 2b's new key `wa:takeover_ack:<phone>` follows the same shape).
- `tryAcquireDebounce` / `releaseDebounce` SETNX helpers in `el-templo-bot/src/memory/session.ts` (Item 1 — the trailing-debounce loop runs inside the same SETNX-acquired token; do NOT duplicate the lock).
- Phase 99's `PB1_PRICE_DISCLOSURE_UNLOCKED_ADDENDUM` (system-prompt.ts) + `getSystemPrompt` conditional injection — the pattern Item 2a Sub-option A reuses.
- Existing env-overridable constants pattern: `const X = Number(process.env.X ?? DEFAULT)` (handler.ts:167 is the reference shape).

### Cross-phase context

- Phase 99 SUMMARY (`.planning/phases/99-bot-copy-and-price-disclosure-fixes/99-VERIFICATION.md` + 3 plan SUMMARIES) — Phase 100 Item 3 is a direct Phase 99 follow-up (the regex's PB1-counter consumer was Phase 99 PRICE-01).
- Phase 93 SUMMARY (`.planning/phases/93-handler-concurrency/93-01-SUMMARY.md`) — Item 1's trailing-debounce work runs INSIDE Phase 93's SETNX/atomic concurrency layer; the invariants from Phase 93 (one handler per phone, dead-man-switch TTL) MUST still hold.
- `feedback_full_bot_suite_post_wave` memory — Phase 99 learning: run `cd el-templo-bot && pnpm test` (all ~32 files) at the end of every wave that modifies bot src, not just snap-consuming subsets. This phase MUST follow that discipline.
- `feedback_multi_doc_invariant_hash_check` memory — the 6-pair sha256 cross-phase invariant block is intentionally byte-identical across multiple docs; Phase 100 must leave it untouched (DBNC-01 changes the DELAY, not the TTL formula — the invariant is about TTL).

</canonical_refs>

<specifics>
## Specific Ideas

### Process guards (lifted from Phase 99 lessons)

- **Dual-grep discipline:** for EVERY copy/behavior change, grep BOTH `el-templo-bot/src/**` AND `el-templo-bot/test/**` for affected strings, regex patterns, and source-line assertions. Phase 99 lost a round-trip when `knowledge.test.ts:438`'s stale `/Sesion Grupal/` regex was missed by a src-only grep. Specifically for Phase 100:
  - Item 3 regex widening: grep BOTH for the literal `/\\b\\(caro|carisimo` pattern (or its uniquely-named consumers) in tests too. If any test mocks or asserts against the OLD regex source-text, it must be updated.
  - Item 2: grep BOTH for `HANDOFF_ESCALATION_PHRASE`, `human_takeover`, the bare-return-on-takeover behavior, and the new reassurance phrase token.
  - Item 1: grep BOTH for `DEBOUNCE_DELAY_MS`, `tryAcquireDebounce`, `setTimeout(DEBOUNCE` patterns.

- **Full bot suite gate:** EVERY wave MUST run `cd el-templo-bot && pnpm test` (all ~32 files; ~4s wall-clock) inside its verify gate before declaring done. NOT just snap-consuming files. NOT just changed-file tests. The 4 pre-existing Phase 94 LAT (1) + Phase 95 DEGR-01 (3) deferred RED tests are the ONLY allowed failures, matching the Phase 98 baseline carry-forward discipline.

### Item 1 — Trailing debounce specifics

- Poll interval (sleep granularity inside the loop): suggested 250-500ms. Too small wastes Redis round-trips; too large degrades responsiveness near the quiet-window edge. Planner picks; default in implementation.
- The "newer inbound" detection: the session already tracks a `lastInboundAt` timestamp (verify in `el-templo-bot/src/memory/session.ts`); the loop reads this each tick and compares to the value seen at loop entry. If newer, extend deadline.
- Edge case: what if a new inbound arrives EXACTLY at the cap moment? Acceptable to fire with the cap; the next handler turn picks up any subsequent messages via the existing session re-read.
- Logging: emit one `debug`-level log per loop tick (or only on extend), one `info`-level log when firing (with `reason: "quiet-window" | "cap"`). Operators want to know which path fired for tuning.

### Item 2 — Takeover ACK specifics

- TAKEOVER_REASSURANCE_PHRASE constant lives at module-top alongside `HANDOFF_ESCALATION_PHRASE` (handler.ts:112). Single source of truth; not duplicated.
- Reset on takeover-end question (the "if the toggle endpoint is api-side and we don't touch api/src" trade-off in the locked decision): if the natural TTL-based expiry is the only cleanup, the lead may see one reassurance per takeover-cycle (good) and no orphan-key issues (TTL handles it). Production-acceptable; revisit only if observed friction.
- Sub-option A (LLM-driven context-aware handoff) considerations:
  - The addendum should constrain the LLM to ONE handoff message (not multi-turn).
  - The addendum must NOT promise specific human-response timing (avoid "te respondemos en 5 minutos" → operator may not).
  - Locked re-anchor pattern: the bot's last message before going silent should always end with the static-reassurance-style closing ("alguien del equipo te va a responder a la brevedad"-shape phrasing) so the contextual ack ties back to the deterministic post-takeover behavior.
- The "do NOT re-run AI in takeover" critical guard: verify the new logic at `:383` returns BEFORE any AI call path. Add a test that mocks the AI provider to throw, then sends a message during human_takeover — the mocked AI should never be invoked (test fails if it is).

### Item 3 — Regex widening specifics

- Anchor the regex test cases in a small data-driven table so future widening doesn't require shotgun unit tests. Suggested shape:

  ```ts
  const PRICE_TRIGGER_FIXTURES: Array<{
    phrase: string;
    shouldMatch: boolean;
    rationale: string;
  }> = [
    {
      phrase: "es caro",
      shouldMatch: true,
      rationale: "Pre-Phase-100 baseline",
    },
    {
      phrase: "¿cuánto cuesta?",
      shouldMatch: true,
      rationale: "Phase 100 widen — primary live-test gap",
    },
    {
      phrase: "precios?",
      shouldMatch: true,
      rationale: "Phase 100 widen — plural",
    },
    { phrase: "tarifa", shouldMatch: true, rationale: "Phase 100 widen" },
    {
      phrase: "preciosa idea",
      shouldMatch: false,
      rationale: "Word-boundary negative — \\b should exclude",
    },
    // ...
  ];
  ```

- Integration test (PB1 3rd-insistence) MUST use a question-shaped trigger (e.g., _"¿cuánto cuesta?"_ × 3) to prove the Phase 99 disclosure fires for question-shaped insistence — that's the bug-fix verification.
- PB2 integration test should use a neutral-question shape to confirm no regression in the objection-handling path.

### Test placement

- Unit tests for deterministic logic (regex, rate-limit-key shape, trailing-debounce loop control): `el-templo-bot/test/v5-3-3-phase-100-*.test.ts`
- Integration tests for end-to-end behavior (the user-observable changes — multi-message debounce timing, takeover ACK delivery, 3rd-insistence disclosure with question-shaped triggers): `el-templo-api/test/whatsapp/v5-3-3-phase-100-*.integration.test.ts`
- Follow Phase 98-C / Phase 99 patterns: `vi.mock` `el-templo-bot/src/ai/provider` + `vi.mock` `el-templo-bot/src/whatsapp/client` + local `waitForHandler()` per file + per-test unique synthetic phone numbers.

</specifics>

<deferred>
## Deferred Ideas

- **Auto-follow-up scheduler for human-takeover** — nudge the lead if no human responds within X minutes/hours (e.g., "¿Seguís ahí? El equipo está mirando tu consulta"). Requires scheduler integration + a separate "no human response yet" state. Fast-follow phase once Item 2's ack proves out in live use.
- **Context-aware reassurance phrasing (TAKE-02 progression)** — instead of the single static phrase, the post-takeover messages could vary (calmer on first, more reassuring on second within the TTL window). Defer until live data shows the static phrase is insufficient.
- **Per-reason ack templates (Sub-option B for TAKE-01)** — if Sub-option A (LLM-driven) is chosen and live use shows the LLM occasionally drifts from the contextual-ack instruction, fall back to a typed reason→phrase map in a future phase.
- **Regex maintenance discipline** — if Item 3 widening reveals more frequent false-positives in production than expected (e.g., neutral words like _"barato"_ in unrelated contexts), tighten the regex in a follow-up. Out of scope to pre-optimize before live data.
- **Debounce instrumentation / metrics** — emit cap-trip counters to Sentry/Pino aggregation so we can tune the defaults based on real-world distribution. Useful but not blocking; Phase 100 ships with logs, future phase adds metrics.
- **Centralized constants file for handler timings** — Item 1 introduces 2 new env-overridable constants; combined with existing `DEBOUNCE_DELAY_MS` and `DEBOUNCE_TTL_SECONDS`, the handler now has 4. A future refactor could move all of them into `el-templo-bot/src/playbooks/constants.ts` (where Phase 99 put `PB1_PRICE_INSISTENCE_THRESHOLD`) or a new `handler-config.ts`. Deferred — current inline-with-JSDoc shape is fine for 4 constants.

</deferred>

<scope_fence>

## Scope Fence

**In scope (this phase touches these):**

- `el-templo-bot/src/webhook/handler.ts`:
  - Item 1: replace `setTimeout(DEBOUNCE_DELAY_MS)` at :465 with the poll-and-extend loop; add 2 new env-overridable constants near :153
  - Item 2a: replace `HANDOFF_ESCALATION_PHRASE` static usage with context-aware mechanism (Sub-option A: new addendum in system-prompt.ts + handler.ts wiring; Sub-option B: handler-local function)
  - Item 2b: replace bare return at :383-388 with rate-limited reassurance using new `wa:takeover_ack:<phone>` Redis key
  - Item 3: widen the regex inside `detectPriceObjection` at :~1410 (single source of truth)
- `el-templo-bot/src/ai/system-prompt.ts` (only if Sub-option A is chosen for Item 2a): new `HANDOFF_CONTEXT_AWARE_ADDENDUM` const + conditional injection
- `el-templo-bot/src/ai/tools.ts` (read-only verification for Item 2a; modify ONLY if the reason arg flow needs threading through)
- `el-templo-bot/src/memory/session.ts` (read-only verification for Item 1's lastInboundAt timestamp; modify ONLY if a new helper is needed)
- `el-templo-bot/.env.example`: document new env vars (`DEBOUNCE_QUIET_WINDOW_MS`, `DEBOUNCE_HARD_CAP_MS`, `TAKEOVER_ACK_TTL_SECONDS`)
- New unit tests under `el-templo-bot/test/` for each item
- New integration tests under `el-templo-api/test/whatsapp/` for each item

**Out of scope (HARD GUARD — do NOT touch):**

- `el-templo-api/src/**` runtime code (other dev owns)
- `DEBOUNCE_TTL_SECONDS` constant value or its formula (Phase 93 ↔ 94 ↔ 97 cross-phase invariant)
- The 6-pair sha256 cross-phase invariant block in `93-CONTEXT.md`, Phase 94 SC#1, and MACRO-ROADMAP.md
- Auto-follow-up scheduler for human-takeover (deferred — see Deferred Ideas)
- Phase 99's `PB1_PRICE_DISCLOSURE_UNLOCKED_ADDENDUM` text or `PB1_PRICE_INSISTENCE_THRESHOLD` value (no changes — Item 3 widens the upstream regex; the disclosure mechanism is unchanged)
- Phase 99's `formatAvailablePlans()` helper or the `check_membership` lead-handling fix (no changes — Item 3 affects only what TRIGGERS the counter, not what happens AFTER the threshold)
- All preservation strings carried forward from Phase 99 (`movimiento grupal`, `sin salirte del grupo`, `sin salirse del grupo`, `framings de arranque grupal`, `lenguaje de arranque grupal`) — byte-equal across this phase
- PB1.E4 REGLA FUERTE at definitions.ts:74 — byte-equal (Sub-option A discipline carried from Phase 99)
- Push to master / deploy pipeline / production env vars

</scope_fence>

<requirement_labels>

## Internal Requirement Labels (for plan-internal tracing)

These labels are NOT registered in REQUIREMENTS.md (Phase 100's `Requirements: TBD` per ROADMAP) — they exist for in-plan traceability and must_haves cross-referencing.

- **DBNC-01** — Trailing debounce with quiet-window + hard cap (replaces fixed 3s setTimeout); env-overridable `DEBOUNCE_QUIET_WINDOW_MS` (default 7000) + `DEBOUNCE_HARD_CAP_MS` (default 30000); preserves Phase 93 SETNX serialization; leaves `DEBOUNCE_TTL_SECONDS` and the cross-phase invariant byte-equal
- **TAKE-01** — Context-aware escalation ACK as a REINFORCEMENT of the existing model-driven `request_human` path. **LOCKED: Option A-corrected** (user authorization 2026-06-24) — system-prompt addendum `HANDOFF_CONTEXT_AWARE_ADDENDUM` injected via `getSystemPrompt({ handoffReason })` on every tool-loop iteration where escalation is plausible. KGATE-05 HARD GUARD: gated OFF for PB1.E1A lead render (`activePlaybook !== "PB1" || currentStage !== "E1A"`). DEGR-01 auto_escalation_after_2_failures path (handler.ts:112/:875 + v5-3-3-degr-01-escalation.test.ts:527 byte-exact) stays UNTOUCHED. Option B rejected — request_human.reason is free-text (tools.ts:154), not an enum.
- **TAKE-02** — Rate-limited static reassurance for subsequent inbounds during human-takeover; `wa:takeover_ack:<phone>` Redis key + `TAKEOVER_ACK_TTL_SECONDS` (default 3600); replaces bare return at handler.ts:383; CRITICAL: do NOT re-run AI in takeover
- **TRIG-01** — Widen `detectPriceObjection` regex to match price QUESTIONS (precios?, cuánto sale|cuesta|val[eé], valor(es)?, tarifa, cuota, mensualidad); preserve all existing terms; single source of truth at handler.ts:~1410; verify both consumers (Phase 99 PB1 counter + PB2.E2 objection handling)
- **TEST-01** — Test coverage for all 3 items: unit tests under el-templo-bot/test/ (deterministic logic) + integration tests under el-templo-api/test/whatsapp/ (end-to-end behaviors); full bot suite green at the end of every wave (4 deferred RED tests from Phases 94/95 remain the only allowed failures)

</requirement_labels>

---

_Phase: 100-bot-takeover-ack-debounce-and-price-trigger_
_Context gathered: 2026-06-24 via locked-scope user dictation round 2 (no discuss-phase by design)_
