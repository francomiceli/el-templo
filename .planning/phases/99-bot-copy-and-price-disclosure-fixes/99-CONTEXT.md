# Phase 99: Bot copy and price disclosure fixes — Context

**Gathered:** 2026-06-23
**Status:** Ready for planning
**Source:** Locked-scope user dictation (live-test findings, pre-located evidence — no discuss-phase ran by intent)

<domain>
## Phase Boundary

Three live-WhatsApp-testing findings against the bot. All scope is **el-templo-bot only** (the integration-ready scope owned by this developer per `project_bot_scope_boundary`) plus **integration tests in `el-templo-api/test/whatsapp/`**. **Local only** — no push to master, no deploy. The other developer owns subscription-plan price values in the `subscription_plans` DB table; this phase wires the bot-side disclosure _mechanism_, never hardcodes price _amounts_.

In scope:

- `el-templo-bot/src/ai/knowledge.ts`
- `el-templo-bot/src/ai/system-prompt.ts`
- `el-templo-bot/src/playbooks/definitions.ts`
- Playbook/session state (Redis `wa:playbook:*` / session) for the price-insistence counter
- Integration tests under `el-templo-api/test/whatsapp/`

Out of scope:

- Any change to `el-templo-api/src/**` runtime code (other dev owns the API)
- Any change to `subscription_plans` table values (other dev owns business prices)
- New playbooks, state-machine redesign, CRM integration
- Push to master or deploy (this PR is local-merge to `feature/whatsapp-bot-scaffold` only)

</domain>

<decisions>
## Implementation Decisions (Locked)

### Issue 1 — Bot self-introduces as "Micla" instead of "Mica" (COPY-01)

- **Root cause:** Model-generation typo. `grep -rniE "micla" el-templo-bot/src` returns **0 hits** — verified. Every source reference is correctly "Mica" (`playbooks/advance.ts`, `webhook/handler.ts`, `playbooks/definitions.ts:29/38`, `system-prompt.ts:259/334/335/337`).
- **Fix:** Add an explicit name-anchoring reinforcement rule to `system-prompt.ts`. Suggested wording: _"Tu nombre es Mica — escribilo siempre exactamente así, nunca lo deformes ni lo abrevies. Nunca te llames Micla, Mika, Mics ni ninguna otra variante."_
- **Verification:** Re-grep `el-templo-bot/src` to confirm no hardcoded variant slipped in during the edit.
- **Negative space:** Do not introduce a sanitization regex on outbound text — name fidelity is a prompt-anchoring concern, not a post-processing one. If a sanitizer is ever added, it belongs in a separate phase with its own justification.

### Issue 2 — Class name: "Sesión Grupal" → "clases de calistenia" (COPY-02)

- **Hardcoded occurrences (3 hits — verified via `grep -rniE "sesi[oó]n grupal" el-templo-bot/src`):**
  - `el-templo-bot/src/ai/knowledge.ts:548` (canonical class-name definition: _"Todas las clases se llaman Sesion Grupal. Alfa, Delta, Omega y Spartan son niveles de progresion… dentro de la Sesion Grupal"_)
  - `el-templo-bot/src/ai/system-prompt.ts:275` (example phrasing: _"Las clases se llaman Sesión Grupal y duran 60 minutos…"_)
  - `el-templo-bot/src/ai/system-prompt.ts:327` (level-vs-class rule: _"Todas las clases son Sesion Grupal y los niveles indican progresion"_)
- **Fix:** Replace the class-NAME _"Sesión Grupal"_ / _"Sesion Grupal"_ with **"clases de calistenia"** at all 3 sites. Rephrase the _"niveles… dentro de la Sesion Grupal"_ sentence so it reads naturally with the new noun (suggested: _"Alfa, Delta, Omega y Spartan son niveles de progresión dentro de las clases de calistenia"_).
- **PRESERVATION SITES (do NOT touch — verified in evidence dump):**
  - `el-templo-bot/src/ai/knowledge.ts:450` — _"movimiento grupal"_ (selling-point, communal/method language)
  - `el-templo-bot/src/ai/knowledge.ts:446` / `:448` — _"sin salirte del grupo"_ (method-positioning, used twice)
  - `el-templo-bot/src/playbooks/definitions.ts:138` / `:147` — _"framings de arranque grupal"_ / _"lenguaje de arranque grupal"_ (TEAM-CORR-06 deprecated-anti-pattern guards — intentionally negative references; leaving them documents what NOT to do)
- **Why these are off-limits:** "grupo / grupal" carries communal/method value (movement, community, sin-salirte) that is independent of the class NAME. Blanket replacement would gut copy that has nothing to do with the rename.
- **Verification:** Re-run the same global grep after the edit; expect 0 hits for _"sesi[oó]n grupal"_ and verify all 5 preservation strings still match byte-for-byte.

### Issue 3 — Disclose prices after sustained insistence (PRICE-01 + PRICE-02 + PRICE-03)

**Option B is decided** (no re-discussion): hold prices for the first 2 price-insistences within PB1 (continue nudging the free trial), then on the **3rd price request**, disclose real DB plan prices via the existing `check_membership` available-plans path while still re-anchoring the free trial.

**Context (verified evidence):**

- Today PB1.E4 has a hard rule at `el-templo-bot/src/playbooks/definitions.ts:74` (REGLA FUERTE inside the `PB1.E4` promptSection) that NEVER discloses prices in the lead stage and always re-anchors the free trial.
- Real prices live in the DB: `subscription_plans.price_regular`.
- They are surfaced today by `check_membership`'s **available-plans branch** at `el-templo-bot/src/ai/tools.ts:509-525` (the `if (subs.length === 0)` branch — runs for users with no active subscription, which includes leads with no users/subscription row).
- Price-objection regex already exists at `el-templo-bot/src/webhook/handler.ts:1440` (`priceObjection` const, matches: `caro|carisimo|car[ií]simo|precio|no me alcanza|no puedo pagar|muy caro|barato|descuento`).
- The live test stayed in PB1, so prices were withheld **by design**, not as a regression.

**Implementation (locked):**

1. **PRICE-01 — Price-insistence counter.**
   - Persist a counter in playbook/session state (Redis `wa:playbook:*` / session state, whichever layer is canonical for per-conversation playbook-scoped counters; pick to match existing patterns).
   - Reuse the existing `priceObjection` regex from `handler.ts:1440` — do NOT introduce a parallel regex. Increment the counter whenever `priceObjection` fires **while in PB1**.
   - Counter is scoped per-conversation per-PB1-session. It should reset cleanly when the conversation transitions to PB2 (post-trial) so the PB2 disclosure flow is not gated by PB1 state.

2. **PRICE-02 — Threshold-based disclosure unlock.**
   - Single tunable constant. Name it clearly (suggested: `PB1_PRICE_INSISTENCE_THRESHOLD`). Default = 2 → disclose on the 3rd request. Document next to the definition why the threshold exists and what it gates.
   - Place the constant where the price-detection / playbook glue logic lives so its impact is co-located with its usage (planner picks the exact file — likely `webhook/handler.ts` or a new tiny config module).
   - **Relax `definitions.ts:74` REGLA FUERTE conditionally:** once the counter ≥ threshold, the PB1.E4 prompt instruction must permit listing real plans + prices via `check_membership`. After disclosure the response must still close by re-anchoring the free trial (suggested closing: _"…pero lo mejor es que lo pruebes gratis primero"_). Two sub-options for the implementer:
     - **Sub-option A:** keep the current PB1.E4 prompt static and inject a conditional "disclosure-unlocked" addendum into the system prompt when the threshold is crossed. (Recommended — keeps `definitions.ts` static, makes the unlock observable in prompt assembly.)
     - **Sub-option B:** template the PB1.E4 promptSection with a `{{#if disclosureUnlocked}}…{{/if}}` shape. (Avoid if the codebase has no existing template syntax for playbook prompts — introducing one for this case is over-engineered.)
   - Planner picks the sub-option that matches existing patterns in the codebase. Document the choice in the plan.

3. **PRICE-03 — `check_membership` available-plans branch + placeholder-resolution verification.**
   - Verify the available-plans branch at `tools.ts:509-525` works for a lead (no `users` row, no `subscriptions` row). The branch already returns DB prices for users with `subs.length === 0`, but it's only been exercised on registered users without an active sub — confirm it also runs cleanly when there is no `users` row at all.
   - **Important open question — verify, don't assume:** the `[plan_básico]` / `[precio]` placeholders inside `definitions.ts:138` (PB2.E2 _Objeción precio_ script: `'tenemos el plan [plan_básico] a [precio]'`) appear to be **literal text** in the prompt, not runtime template substitutions. There is no string-interpolation step before the prompt reaches the LLM. The planner must verify whether the LLM fills these from `check_membership` tool output (acceptable) or fabricates them as literal `[plan_básico]` text (broken). If broken: either (a) wire a real substitution path, or (b) rewrite the script to instruct the LLM to call `check_membership` first and read values from the tool result. This is a verification-then-fix task, not a pre-decided fix.

4. **CONSTRAINT — Bot NEVER hardcodes price amounts.** Anywhere in copy, prompts, or tests. The other developer owns the actual plan/price values in the `subscription_plans` DB table (business pricing has changed since project start). The bot always reads them dynamically via `check_membership`. This task wires the disclosure mechanism, not the price values. Integration tests must seed `subscription_plans` rows with **clearly-marked test values** (e.g., `price_regular: 99999` with a comment) so a future grep for real prices in bot test fixtures will return 0 hits.

### Terminology (locked)

- **User-facing:** _"clase de prueba gratis"_ (or _"clases de prueba gratis"_).
- **Internal synonym:** _"SP"_ / _"sesión de prueba"_ (used in code, comments, tests, prompts to disambiguate from regular paid classes).
- Do not rename existing internal references to `sp` / `sesion_de_prueba` in code — only ensure user-facing copy uses _"clase de prueba gratis"_.

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Source files in scope (read current state before editing)

- `el-templo-bot/src/ai/knowledge.ts` — class-name definition at :548 + preservation sites at :446/:448/:450
- `el-templo-bot/src/ai/system-prompt.ts` — Mica name anchoring (:259/:334/:335/:337) + class-name examples (:275/:327)
- `el-templo-bot/src/playbooks/definitions.ts` — PB1.E4 REGLA FUERTE near `id: "PB1.E4"` (the line-74 reference is the `id:` line; the actual rule is in the `promptSection` string of that stage) + PB2.E2 placeholders at :138 + deprecated framing guards at :138/:147
- `el-templo-bot/src/ai/tools.ts` — `check_membership` available-plans branch at :509-525
- `el-templo-bot/src/webhook/handler.ts` — `priceObjection` regex at :1440 (reuse, do NOT duplicate)

### Existing patterns (study before designing)

- Redis session/playbook state — check `el-templo-bot/src/memory/session.ts` (existing patterns for per-conversation persisted state used by playbook engine)
- Playbook stage prompt assembly — wherever `PB1.E4.promptSection` is wired into the LLM call (planner: trace from `definitions.ts` consumer)
- Integration-test patterns — `el-templo-api/test/whatsapp/*` (existing tests use real MySQL `eltemplo_test` DB; see `test/helpers.ts` for auth/request utilities; see Phase 98 SUMMARY for `waitForHandler()` pattern)

### Cross-phase context

- Phase 98 SUMMARY (`.planning/phases/98-test-hygiene-98-a-b-c/98-01-SUMMARY.md`) — green baseline restored; integration-test patterns used in 98-C (vi.mock for `el-templo-bot/src/ai/provider`, `waitForHandler()`).
- `project_bot_scope_boundary` memory — el-templo-bot only; another dev owns real API + turnera + deploy. Reframes which v5.4.0 phases are in scope.
- `feedback_interface_rename_post_merge_mock_gate` memory — for any cross-file interface changes, run full `pnpm test` post-merge. Not directly applicable here (no interface renames) but flag-worthy if PRICE-02's sub-option introduces new types.

</canonical_refs>

<specifics>
## Specific Ideas

- **Single tunable constant for the threshold** — one place to change, default 2, documented inline. Do not scatter the number `2` across multiple files.
- **Reuse `priceObjection` regex from `handler.ts:1440`** — do not introduce a parallel regex. If the counter logic lives elsewhere, import the regex or refactor `priceObjection` into a shared helper. Single source of truth.
- **Counter scope:** per-conversation, per-PB1-session. Resets on transition to PB2. Decay/TTL: planner picks — if the counter lives in the Redis playbook hash, it inherits the playbook's TTL; if it's a separate key, give it the same TTL as the playbook state.
- **Free-trial re-anchor on disclosure:** even after the threshold is crossed and prices are listed, the response MUST close with a free-trial re-anchor. Suggested closing line: _"…pero lo mejor es que lo pruebes gratis primero"_. The implementer can phrase it naturally, but the closing intent is locked.
- **Integration tests (mandatory in `el-templo-api/test/whatsapp/`):**
  - Mica name fidelity: send a message that historically triggered "Micla" garbling; assert outbound never contains _Micla_, _Mika_, or any non-Mica variant of the name. Use a deterministic mock LLM response or a snapshot check that hits the real `system-prompt.ts`-rendered prompt and verifies the anchoring rule is present.
  - Class-name rename: assert outbound mentioning class info uses _"clases de calistenia"_ and does NOT contain _"Sesión Grupal"_ / _"Sesion Grupal"_ (case-insensitive).
  - Preservation: assert that the preserved strings (_"movimiento grupal"_, _"sin salirte del grupo"_) still ship in the prompt/knowledge content. (Source-text assertion, not outbound — the LLM may or may not use them in a given turn.)
  - Price-insistence counter — 1st insistence: counter increments to 1, response holds the line + nudges free trial; no prices in outbound.
  - Price-insistence counter — 2nd insistence: counter increments to 2, response holds the line + nudges free trial; no prices in outbound.
  - **Price-insistence counter — 3rd insistence (critical path):** counter increments to 3 (≥ threshold), response lists real DB plan prices via `check_membership` AND closes with free-trial re-anchor. Seed `subscription_plans` with clearly-marked test values; assert outbound contains those values verbatim AND the free-trial re-anchor phrase.
  - PB2 transition resets counter: simulate trial-booked transition; assert counter is cleared from session state so a post-trial price discussion is not gated by stale PB1 state.
  - Negative test (no hardcoded prices): grep the bot source bundle (`el-templo-bot/src/**/*.ts`) for any literal price-like pattern (e.g., `/\$\s*\d{4,}/`) and assert 0 hits in bot copy/prompts. Test fixture prices in `el-templo-api/test/**` are allowed but must be the clearly-marked test values.
- **Test isolation:** all new integration tests must respect the Phase 98 baseline (519 passed / 1 expected-RED for BUG-03 LIKE-search). Do not modify the expected-RED test. Use `waitForHandler()` from existing patterns. Mock `el-templo-bot/src/ai/provider` for deterministic LLM responses where appropriate; use real `check_membership` against `eltemplo_test` DB for the disclosure-branch test.

</specifics>

<deferred>
## Deferred Ideas

- **Outbound name-sanitization regex** — deferred. If the prompt-anchoring fix in Issue 1 proves insufficient (i.e., the model still emits "Micla" in production after the rule is added), a future phase can add a defensive post-processing layer. Not in this phase's scope.
- **Generalizing the price-insistence counter to other objections** (tiempo, identidad, difusa) — deferred. Out-of-scope until live data shows similar insistence patterns on those objections.
- **Replacing literal `[plan_básico]` / `[precio]` placeholders with a real template engine** (handlebars, etc.) — deferred. If PRICE-03 verification finds the placeholders are LLM-fabricated and a script rewrite suffices (Sub-option b under PRICE-02), no template engine is introduced. A template engine would be a separate cross-cutting refactor.
- **CRM / persistence-layer hooks for the price-insistence counter** — deferred to v5.4.0 / Kero phase 1 (out-of-scope per `project_bot_scope_boundary`).

</deferred>

<scope_fence>

## Scope Fence

**In scope (this phase touches these):**

- `el-templo-bot/src/ai/knowledge.ts`
- `el-templo-bot/src/ai/system-prompt.ts`
- `el-templo-bot/src/playbooks/definitions.ts`
- `el-templo-bot/src/webhook/handler.ts` (price-insistence counter wiring around the existing `priceObjection` regex at :1440)
- `el-templo-bot/src/memory/session.ts` or equivalent playbook-state file (counter persistence)
- New constant file or inline constant in the chosen counter location
- `el-templo-api/test/whatsapp/*` (new integration tests only)
- `el-templo-bot/.env.example` (only if a new env var is introduced — e.g., to make `PB1_PRICE_INSISTENCE_THRESHOLD` overridable)

**Out of scope (HARD GUARD — do NOT touch):**

- `el-templo-api/src/**` — runtime API code (other dev owns)
- `subscription_plans` table values / migrations (other dev owns business prices)
- Any change to the `check_membership` tool implementation beyond verifying its available-plans branch handles the lead-no-users-row case (and even there, fix in the bot if the tool returns gracefully; only touch `tools.ts` if the lead-case is genuinely broken at the tool layer)
- Existing playbook stages (PB1.E1, .E2, .E3, .E5; PB2.\*; PB3-PB5) — only PB1.E4 is in scope for the conditional unlock
- Outbound message sanitization layer (deferred — see Deferred Ideas)
- Push to master / deploy pipeline / production env vars

</scope_fence>

<requirement_labels>

## Internal Requirement Labels (for plan-internal tracing)

These labels are NOT registered in REQUIREMENTS.md (Phase 99's `Requirements: TBD` per ROADMAP) — they exist for in-plan traceability and must_haves cross-referencing.

- **COPY-01** — Mica name reinforcement rule in `system-prompt.ts` + verification grep
- **COPY-02** — Class name rename to _"clases de calistenia"_ at 3 sites + preservation of 5 _grupo/grupal_ selling-point strings
- **PRICE-01** — Price-insistence counter persisted in playbook/session state, scoped per-conversation per-PB1-session, reset on PB2 transition, increments via existing `priceObjection` regex at `handler.ts:1440`
- **PRICE-02** — Threshold-based disclosure unlock (single tunable constant, default 2, conditional PB1.E4 REGLA FUERTE relaxation, free-trial re-anchor on disclosure)
- **PRICE-03** — Verify `check_membership` available-plans branch handles the lead-no-users-row case + verify/fix `[plan_básico]` / `[precio]` placeholder resolution in PB2.E2 (`definitions.ts:138`)
- **PRICE-04** — Integration test coverage in `el-templo-api/test/whatsapp/` for the counter, 3rd-request disclosure path, PB2 transition reset, and no-hardcoded-prices grep guard

</requirement_labels>

---

_Phase: 99-bot-copy-and-price-disclosure-fixes_
_Context gathered: 2026-06-23 via locked-scope user dictation (no discuss-phase by design)_
