# Roadmap: El Templo

## Milestones

- **v2.0 Admin App** — Phases 13-28 (in progress, phases 13-19 + 26-27 complete)
- **v3.0 Landing Page** — Phases 29-36 (planned)
- **v4.0 Ecosystem Foundation** — Phases 45-52 (planned)
- **v4.1 Admin Consolidation & Data Migration** — Phases 58-66 (planned)
- ✅ **v5.0 WhatsApp AI Chatbot** — Phases 67-73 (shipped 2026-03-26)
- ✅ **v5.1 Production Readiness & Business Data** — Phases 74-78 (shipped 2026-03-27)
- ✅ **v5.2 Mica Persona & Bot Refinement** — Phases 79-81 (shipped 2026-04-06)
- ✅ **v5.3 Conversational Sales & Playbook Engine** — Phases 82-85 (shipped 2026-04-08)
- ✅ **v5.3.1 Prompt Architecture Refactor** — Phases 86-88 (shipped 2026-04-14)
- ✅ **v5.3.2 Post-v5.3.1 Live Test Fixes** — Phases 89-92 (shipped 2026-04-16)
- 🚧 **v5.3.3 Post-v5.3.2 Live Test Fixes** — Phases 93-97 + 96.5 (in progress)

> See `.planning/MACRO-ROADMAP.md` for the cross-milestone sequence (v5.3.3 → v5.4.0 Production Deployment → Kero CRM).

---

## 🚧 v5.3.3 Post-v5.3.2 Live Test Fixes (In Progress)

**Milestone Goal:** Close the 7 issues surfaced by the post-v5.3.2 live test (handler concurrency, OpenAI latency, booking inconsistency, context-awareness, graceful degradation, plus 2 low-priority backlog items) so the bot is stable and **production-deploy-ready** for v5.4.0. Targeted bug fixes only — no state-machine redesign, no new playbooks, no CRM integration. Mirrors v5.3.2's targeted-fixes shape.

**Environment:** dev-only (local + ngrok + Meta test number — same as v5.3.2). v5.4.0 owns the dev → prod migration.

**Closing constraint (per `MACRO-ROADMAP.md`):** Phase 97's final live test must validate the bot is **production-deploy-ready**, NOT CRM-integration-ready. Acceptance focuses on behavioral/handler correctness and stability — not persistence layer, not CRM hooks, not multi-tenancy. Those land in v5.4.0 or Kero phase 1.

**Target ship:** TBD (5-phase tactical scope; mirrors v5.3.2 cadence).

### Phases

- [x] **Phase 93: Handler Concurrency** — BUG-01 race condition; eliminate duplicate-response on rapid-fire user messages via debounce / Redis lock per phone at handler entry (CONC-01) ✅ shipped 2026-05-17
- [ ] **Phase 94: OpenAI Latency + Graceful Failure** — BUG-02 ~3min latency; explicit OpenAI client timeout + interim UX + graceful fallback at `provider.chat(...)` await sites (LAT-01..03)
- [ ] **Phase 95: Booking Reliability + Graceful Degradation** — BUG-03 + BUG-05 paired; class search consistency across venues + tool-failure retry-counter + escalate via `request_human` after 2 failed attempts; SC#3 invariant preserved (BOOK-01, DEGR-01..02)
- [ ] **Phase 96: Context Awareness** — BUG-04; bot does not re-ask data already provided in conversation; fix in `system-prompt.ts` or profile extraction layer (CTXT-01..02)
- [ ] **Phase 96.5: Date Grounding Fix** — Finding #2 from Phase 96 live UAT; bot grounds today's date instead of hallucinating "Lunes 2023-11-06"; second `*Convención:*` line in `system-prompt.ts` + snapshot date-stub infrastructure (DATE-01) **HARD BLOCKER pre-v5.4.0**
- [ ] **Phase 97: Backlog + Regression Lock** — BACKLOG-01 (third elevator hook) + BACKLOG-02 (voseo consistency, non-deterministic strategy) + v5.3.3 regression suite + extend timeout pattern to `executeTool` localhost calls (ELEV-01, VOSEO-01, RGUARD-01..03)

## Phase Details

### Phase 93: Handler Concurrency

**Goal**: Rapid-fire user messages produce exactly ONE bot response, not duplicates. The race condition observed in the post-v5.3.2 live test (BUG-01) is closed at the `processWithAi` entry in `el-templo-bot/src/webhook/handler.ts`. **Phase 93 also owns the `DEBOUNCE_TTL_SECONDS` adjustment required by the cross-phase invariant** (see Notes) — without it, Phase 94's `OPENAI_TIMEOUT_MS=45000` would cause the dead-man switch to fire mid-OpenAI-call.
**Depends on**: Nothing (first phase of v5.3.3; entry-side stabilization that does NOT share code surface with Phase 94's exit-side fix)
**Requirements**: CONC-01
**Success Criteria** (what must be TRUE):

1. When the user sends 2-3 messages in rapid succession (faster than the bot's response cycle, e.g., "Hola" → "Hola?" → "Holaaaaa"), the bot generates exactly ONE response — not two, not three.
2. The existing 3s debounce + Redis dead-man switch (`DEBOUNCE_DELAY_MS=3000`, `DEBOUNCE_TTL_SECONDS=10` in `handler.ts:95`+) outcome is one of: (a) confirmed correct and the bug is elsewhere, with observability shipped per the "don't fix nothing observable" anti-pattern guard (Branch 5); (b) fixed at the same layer (SETNX-race fix at `session.ts:125-155`, Branch 1 or 3); OR (c) the audit reveals an adjacent layer as the fix surface (Meta retry edge case at `handler.ts:291-306`, Branch 2; OR TTL/upstream coupling, Branch 4). See `93-CONTEXT.md` for the full 5-branch investigation order.
3. `DEBOUNCE_TTL_SECONDS` is adjusted to satisfy the cross-phase invariant (see Notes) — static value ≥600s, OR heartbeat-refresh, OR hybrid. Plan-time choice.
4. A regression test exists that simulates rapid-fire inbounds for the same phone number and asserts the handler produces exactly ONE call to `provider.chat(...)` (or one outbound message), not multiple.

**Plans:** 1 plan

- [x] 93-01-PLAN.md — Audit-first close of BUG-01: 5 candidate-defect checks (SETNX-race, Meta dedup ordering, compound, TTL/upstream coupling, observability) + post-hoc Check 1.5 (updateSession race) → multi-fire fix (Branch 1 atomic SETNX + Lua updateSession + Branch 4 TTL adjustment). See [93-01-SUMMARY.md](phases/93-handler-concurrency/93-01-SUMMARY.md).

**Notes:**

- **Cross-phase invariant (Phase 93 ↔ 94 ↔ 97) — Phase 93 owns the TTL fix.** Canonical block (must be textually identical to 93-CONTEXT.md, Phase 94 SC#1, and MACRO-ROADMAP.md constraint #6):

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

Plan-time choice of implementation: (a) static 600s TTL — simplest, offset by Phase 94's timeout bounding handler runtime; (b) heartbeat-refresh — periodic Redis `EXPIRE` while work is in-flight; (c) hybrid — moderate TTL + heartbeat. **Phase 93's TTL change MUST land before Phase 94's `OPENAI_TIMEOUT_MS=45000` ships** — see Phase 94 ship-after constraint. Full derivation in `93-CONTEXT.md` Cross-Phase Invariant section.

- **Investigation order (5 branches, not 3)** — Original 3-branch structure was invalidated by `.planning/v5.3.3-codebase-audit.md`. Per the audit: Meta `whatsapp_message_id` dedup IS wired correctly (`handler.ts:291-306` + UNIQUE constraint at `el-templo-api/src/db/schema/whatsapp.ts:84`), so "dedup missing" is NOT a candidate. Audit elevated two new candidates: SETNX-race at `memory/session.ts:125-155` and TTL/upstream coupling. Full 5-branch enumeration in `93-CONTEXT.md` Investigation Order section.

- **Disjoint from Phase 94**: BUG-01's fix is at handler entry (concurrency control + TTL adjustment), BUG-02's fix is around `provider.chat(...)` error path in a different file (`openai.ts:29`). Same `handler.ts` touched on different lines for different concerns — must NOT be conflated during plan execution.

- **Out of scope**: `BullMQ`/`RabbitMQ` external queues (over-engineered at ~100 convs/day per REQUIREMENTS.md).

### Phase 94: OpenAI Latency + Graceful Failure

**Goal**: A slow or hung OpenAI request can no longer silently stall the handler for minutes. The OpenAI SDK is bounded by an explicit timeout, the handler sends an interim UX message when the call exceeds the timeout boundary, and a graceful fallback is sent (and the bot returns cleanly) if a retry also fails. Closes BUG-02 from the post-v5.3.2 live test (~3min response latency window 22:23-22:26).
**Depends on (planning)**: Nothing (independently plannable in parallel with Phase 93; BUG-02 root cause confirmed in debug session 2026-05-05 — disjoint code surface from Phase 93 per audit verdict; file pointers in Notes are sufficient for the planner to act without Phase 93 being planned).
**Ship-after (execution dependency)**: Phase 93. The `OPENAI_TIMEOUT_MS=45000` value depends on `DEBOUNCE_TTL_SECONDS` being raised to satisfy the cross-phase invariant. Without that ordering, the dead-man switch fires mid-OpenAI-call and BUG-01 re-manifests as a side effect of fixing BUG-02. See **PHASE 94 SHIP CONSTRAINT** in Notes below.
**Requirements**: LAT-01, LAT-02, LAT-03
**Success Criteria** (what must be TRUE):

1. The OpenAI client in `el-templo-bot/src/ai/openai.ts:29` is constructed with an explicit `timeout` option — default `45_000` ms (45s), env-overridable via `OPENAI_TIMEOUT_MS`. `.env.example` updated. The SDK no longer falls back to its 600s (10 min) default. **Bound by the cross-phase invariant** (canonical block — must be textually identical to 93-CONTEXT.md, ROADMAP Phase 93 Notes, and MACRO-ROADMAP.md constraint #6):

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

The 45s `OPENAI_TIMEOUT_MS` is the LEFT-HAND VARIABLE that the right-hand TTL must accommodate. Phase 94 cannot choose this value independently of Phase 93's TTL choice. See PHASE 94 SHIP CONSTRAINT in Notes. 2. When a `provider.chat(...)` call exceeds the timeout (or throws `OpenAI.APIError` for any other reason), the handler sends an interim UX message to the user (e.g., "Dame un segundo 🙌") rather than hanging silently. Wraps `provider.chat(...)` await sites at `handler.ts:584` and `handler.ts:641`. 3. If the retry/fallback also fails (e.g., upstream is durably down), the handler sends a graceful-fallback message ("Tuve un problemita técnico, ¿me lo escribís de nuevo?" or similar) and returns cleanly — does not infinite-loop, does not silently hang, does not crash the bot process. 4. A regression test mocks a slow/hung OpenAI response and asserts (a) the handler bails within the timeout boundary, (b) an interim message is sent to the user, and (c) the graceful fallback fires when the retry also fails.

**Plans:** TBD

**Notes:**

- **PHASE 94 SHIP CONSTRAINT (execution dependency on Phase 93):** Phase 94's plan and implementation can proceed in parallel with Phase 93's plan and implementation, but Phase 94 **must not merge to main** until Phase 93's `DEBOUNCE_TTL_SECONDS` adjustment commit is on the same branch. Verify before opening Phase 94's PR:

  ```
  git log --oneline | grep -i 'debounce_ttl\|TTL\|93-' | head
  ```

  The verification should show a Phase 93 commit modifying `DEBOUNCE_TTL_SECONDS` (or installing heartbeat-refresh) ahead of the Phase 94 PR's HEAD. Reviewer of Phase 94's PR is responsible for confirming this. Without it, shipping Phase 94 alone causes the dead-man switch to fire mid-OpenAI-call and BUG-01 re-manifests as a side effect of fixing BUG-02. **This is an execution dependency, NOT a planning dependency** — the planner agent for Phase 94 can produce the plan regardless of Phase 93's planning state.

- **File-level pointers from debug session (`bot-3min-response-latency.md`):**
  - File 1: `/Users/bores/el-templo/el-templo-bot/src/ai/openai.ts:29` — `new OpenAI()` needs explicit `timeout: 45_000` + `OPENAI_TIMEOUT_MS` env override + `.env.example` update.
  - File 2: `/Users/bores/el-templo/el-templo-bot/src/webhook/handler.ts:584` and `:641` — wrap `provider.chat(...)` await sites with timeout/`OpenAI.APIError` handler that sends interim message + graceful fallback. The existing outer `try/catch` at `handler.ts:323` only logs today; surface to user is the new behavior.
- **Bonus finding (carried into Phase 97 RGUARD-03):** `executeTool` localhost API calls likely have the same unbounded-await problem. Phase 94 should NOT expand scope to fix this; `withTimeout` helper is introduced by Phase 95, RGUARD-03 extends usage.
- The exact distal trigger on 2026-04-16 22:23-22:26 (OpenAI slow that minute? ngrok jittery?) is unrecoverable because logs are stdout-only and the dev process has been restarted. The proximate structural cause (no timeout) is identifiable from code alone and matches the symptom shape unambiguously — verdict in `bot-3min-response-latency.md`. v5.4.0 fixes the logging-on-rotate gap; v5.3.3 fixes the structural defect.

### Phase 95: Booking Reliability + Graceful Degradation

**Goal**: Class search returns consistent results across all venues so users can complete bookings without the bot looping on "no encontré clases disponibles". When tool calls do fail repeatedly, the bot escalates via `request_human` instead of entering an apology loop. Closes BUG-03 (booking root cause) and BUG-05 (apology-loop safety net) **paired** because BUG-05 is the safety net for when BUG-03 still fails. **Investigative framing**: per `.planning/v5.3.3-codebase-audit.md`, BUG-03 has 5 plausible root-cause code paths that static analysis cannot distinguish; Phase 95 must start with a focused audit task (mirroring Phase 93's audit-first structure) before authoring the fix.
**Depends on**: Phase 94 (booking layer needs a stable handler — Phase 94's timeout/graceful-fallback rails are upstream of the tool-execution failure modes Phase 95 has to reason about). **NOT dependent on Phase 97** — Phase 95 introduces its own `withTimeout` helper for booking-tool localhost calls; Phase 97 RGUARD-03 then extends usage of the same helper.
**Requirements**: BOOK-01, DEGR-01, DEGR-02
**Success Criteria** (what must be TRUE):

1. Class search returns consistent results across all El Templo venues — the booking tool (`book_class` or similar in `el-templo-bot`'s tool registry) can locate available classes regardless of which branch the user mentions. A user can complete a booking without the bot looping on "no encontré clases disponibles" when classes do exist. **Root cause identified via audit task** (one of 5 plausible paths per `v5.3.3-codebase-audit.md`: LIKE-search ambiguity, cross-branch result mixing, Sunday=0/7 day-of-week confusion, LIMIT-6 truncation, `booking_count` today-filter on tomorrow-queries).
2. When tool calls fail repeatedly (transient errors, missing data, 5xx from localhost API), the bot does NOT enter an apology loop. Implementation: retry counter + escalate via `request_human` after 2 failed attempts. The escalation phrase reuses the v5.2-locked "Te paso con alguien del equipo, te escriben enseguida 🙌". **Note**: `request_human` only sets `conversation_status='human_takeover'` — it does NOT send the handoff phrase itself; phrase comes from the model's pre-tool text governed by `system-prompt.ts:223`. Plan-time choice: trust-model / handler-side synthetic / explicit new prompt rule.
3. **SC#3 invariant (RLOK-03 guardrail):** the no-escalation rule from v5.3.2 (Phase 91 OBJN-01/02) applies to **soft rejections ONLY**, NOT to tool failures. DEGR-01's `request_human` escalation triggers on **tool failures only**. Soft rejections continue to follow Phase 91's WHY/BACK-OFF Spanish framing in `system-prompt.ts`. Both rules wired without conflation. **Asserted in Phase 97 RGUARD-02.**
4. **`withTimeout` helper exists** at a shared location (e.g., `el-templo-bot/src/ai/with-timeout.ts` or similar) and is used by booking-tool localhost calls at `el-templo-bot/src/ai/tools.ts:636` and `:806`. Default 30s, env-overridable. Phase 97 RGUARD-03 extends this helper to other `executeTool` sites — Phase 95 ships the helper, NOT its consumption by other tools.
5. A regression test simulates (a) a successful cross-venue class search, (b) repeated tool-failure mode → assert escalation fires after 2 attempts, (c) a soft-rejection turn → assert NO `request_human` call, only WHY/BACK-OFF framing per Phase 91, (d) booking tool timeout → assert the booking call bails within the timeout boundary.

**Plans:** 3 plans (locked per `95-CONTEXT.md` D-04)

- [ ] 95-01-PLAN.md — Audit-first close of BUG-03: per-candidate verdicts (i LIKE-search, ii cross-branch mix, iii Sunday=0/7, iv LIMIT-6, v booking_count today-filter) → Final Branch Verdict (Branch 1/2/3) + RED tests committed atomically. Investigative; no production source modified.
- [ ] 95-02-PLAN.md — TBD (BUG-03 fix at audit-named site + `withTimeout` helper introduction + apply to `tools.ts:636`/`:806`). **Gated on 95-AUDIT.md branch verdict** — planning begins after user reviews and approves 95-01's audit output.
- [ ] 95-03-PLAN.md — TBD (BUG-05 retry counter + escalation via handler-side synthetic phrase + `request_human`). **Gated on 95-02 ship** — 95-02's `withTimeout` helper is the dependency.

**Notes:**

- **Investigative framing (audit-first, mirrors Phase 93):** BUG-03's 5 plausible code paths can only be picked via focused audit. Plan task structure: (1) Audit BUG-03 — read tool registry, class search query, branch-filtering logic, day-of-week conversion, LIMIT/pagination, today-filter logic; produce 95-AUDIT.md naming root cause; (2) Author failing tests against audit verdict; (3) Implement fix at root-cause site + introduce `withTimeout` helper + apply to booking calls; (4) Implement BUG-05 retry counter + escalation; (5) Verify full suite.
- **Pairing rationale:** BUG-03 + BUG-05 ship together. BUG-05 is the safety net for when BUG-03 still fails. Shipping BUG-05 without BUG-03 means the safety net never triggers in test (no real failure path to exercise it). Shipping BUG-03 without BUG-05 means users still see raw apology-loop failure modes when residual booking edge cases hit. Phase 95 is designed as ONE phase with multiple plans (audit + per-BUG), NOT split into separate phases.
- **`withTimeout` helper ownership:** Phase 95 introduces the helper FROM THE START — not as a per-call ad-hoc `Promise.race` that Phase 97 has to refactor later. Helper accepts `(promise, ms)` and returns the promise wrapped in a timeout; on timeout, throws a tagged error (e.g., `ToolTimeoutError`) that the handler distinguishes from generic tool errors. Phase 97 RGUARD-03 just imports and applies; no refactor.
- **SC#3 invariant is the single most important carry-forward from v5.3.2.** The plan executor MUST wire the retry-counter escalation as a tool-failure-only branch, not a generic escalation rule. Phase 91's soft-rejection framing must remain untouched. No shared state between Phase 91's `whyAsked` flag and Phase 95's retry counter — they're different semantic objects on different code surfaces.
- **Snapshot coordination with Phase 96:** Phase 96 is the canonical snapshot regeneration point (it touches `system-prompt.ts` materially per the CTXT-02 fix). If Phase 95's DEGR-01 implementation also touches `system-prompt.ts` (option iii: explicit new prompt rule for handoff phrasing), Phase 95 ONLY updates `POST_RLOK_04_BYTES` to the intermediate state — does NOT regenerate the snapshot fixture. Phase 96 regenerates the fixture once, capturing combined Phase 95 + Phase 96 prompt changes.
- **Out of scope:** Larger `executeTool` refactor (parallelization, retry semantics, structured error taxonomy) is NOT v5.3.3 scope per REQUIREMENTS.md. Phase 95 ships the `withTimeout` helper + booking-tool consumption + BUG-05 retry/escalation; deeper refactor is v5.4+ territory.

### Phase 96: Context Awareness

**Goal**: Bot does not re-ask for data the user has already provided earlier in the conversation. Closes BUG-04 from the post-v5.3.2 live test (specific failure: user said "Ignacio Bordon", bot re-asked for full name two turns later). Touches `system-prompt.ts` and/or the profile extraction layer — does NOT touch handler concurrency, OpenAI client, or booking layers. **Phase 96 is the canonical snapshot regeneration point** for the v5.3.3 milestone (see Notes).
**Depends on**: Phase 95 (sequencing rather than coupling — keeps the milestone linear; Phase 96 is independently plannable but lands after the booking + degradation work)
**Requirements**: CTXT-01, CTXT-02
**Success Criteria** (what must be TRUE):

1. When the user has provided structured profile data earlier in the conversation (full name, contact info, preferences, etc.), the bot does NOT re-ask for the same data. Specifically: a conversation where the user types "Ignacio Bordon" must result in NO subsequent `request for full name` from Mica.
2. Profile extraction layer (or `system-prompt.ts` rules) ensures persisted `<profile>` data is referenced by the model rather than rediscovered. **Case → option mapping is FIXED, not deferred** (per `.planning/v5.3.3-codebase-audit.md` — `extractAndUpdateProfile` at `handler.ts:822-837` is fire-and-forget AFTER reply):
   - **Cross-conversation case** (name persisted from prior session, model ignoring it in current turn) → **option (a) prompt-level rule alone is sufficient**. The data IS in the rendered prompt; the model just isn't reading it.
   - **Within-2-turns case** (user types name turn N, bot re-asks turn N+1 before fire-and-forget extraction completes) → **option (a) is INSUFFICIENT; requires option (b) extraction-layer fix OR option (c) hybrid (prompt rule + extraction-layer fix)**.

   The only plan-time question is **which case BUG-04 actually exhibited** — Phase 96's audit task answers this via reproduction. The implementation option is determined by the case, not chosen freely.

3. A regression test exists that simulates the relevant multi-turn conversation pattern (per audit verdict) and asserts the bot's reply does NOT re-ask for full name (assert by absence of "nombre completo" / "cómo te llamás" / "tu nombre" patterns when profile field is populated).
4. **PB1.E1A snapshot fixture regenerated** at the end of Phase 96. The regeneration captures combined Phase 95 + Phase 96 `system-prompt.ts` changes (if any). `POST_RLOK_04_BYTES` constant updated to match. Commit the regenerated fixture in the same PR per v5.3.1 update discipline.

**Plans:** 1 plan (single-plan structure locked per CONTEXT.md `<specifics>` — Case A locked empirically; no investigative branching; D-03 + D-06 + D-09 + D-10 + D-12 land atomically in one GREEN commit per CONTEXT.md D-19)

- [ ] 96-01-PLAN.md — Mechanical encoding of CONTEXT.md D-03..D-23: D-03 CTXT rule + D-06 Sunday=0 directive in `system-prompt.ts`, D-12 `parseExtractionResponse` helper + caller refactor in `handler.ts`, D-09 snapshot regen of `pb1-e1a-lead-rendered.snap.txt`, D-10 `POST_RLOK_04_BYTES` bump, D-15 + D-16 six tests in NEW `v5-3-3-context-awareness.test.ts`, transitions pre-existing (iii) RED at `v5-3-3-booking-reliability.test.ts:55` to GREEN automatically. Atomic RED → GREEN → SUMMARY commit cadence.

**Notes:**

- **Audit task before fix** — reproduce BUG-04 to determine whether the within-2-turns case or cross-conversation case applies. Read `handler.ts:822-837` (`extractAndUpdateProfile` fire-and-forget call site) and `handler.ts:1369-1466` (extraction implementation) before authoring the fix. The option-space narrowing in REQUIREMENTS.md CTXT-02 ties to which case actually triggered the live-test failure.
- **Snapshot regeneration ownership:** Phase 96 owns the regeneration. Phase 95 only updates `POST_RLOK_04_BYTES` to an intermediate state if it touches `system-prompt.ts` for the DEGR-01 handoff-phrase prompt rule (option iii). Phase 96 then regenerates the fixture once, capturing combined changes. KGATE-05 dual-threshold (≥20% rendered AND ≥35% knowledge block) must continue to pass — verify post-regen.
- **KGATE-05 budget coordination:** any new prompt rule consumes the rendered-prompt budget capped at `floor(BASELINE_CHARS * 0.8)`. Current post-RLOK-04 baseline is 18,370 chars (`v5-3-2-regression.test.ts:57`). Phase 96 plan must verify post-fix prompt length remains within budget.
- Discrete prompt / extraction work — does NOT modify handler concurrency, OpenAI client, booking tools, or anything Phase 93/94/95 touches at the concurrency/timeout layer. Touches `system-prompt.ts` and possibly the extraction code in `handler.ts:1369-1466`.

### Phase 96.5: Date Grounding Fix

**Goal**: Bot grounds the current date instead of hallucinating past dates. Closes Finding #2 from Phase 96 live UAT (2026-06-09) where the bot offered date `"2023-11-06"` to a `register_trial` call when actual date was 2026-06-09 (~2.5 years in past). In production: users receive past dates ("¿lunes de 2023?"), `register_trial` confirmation triggers `fetch failed` because the backend rejects schedule_id + invalid date combination, net result = zero successful trial bookings until fixed. Inserted between Phase 96 and Phase 97 as a fractional phase per the locked v5.4.0 production-ready path (STATE.md 2026-06-10).
**Depends on**: Phase 96 (shipped 2026-06-10, `bea9a10a` GREEN + `4598dcea` SUMMARY). Snapshot regen ownership inherited — the second `*Convención:*` line lands in the same insertion region as Phase 96's first `*Convención:*` (Sunday=0 directive). No section heading refactor needed.
**Requirements**: DATE-01 (NEW — bot must reference today's date verbatim in system prompt; date hallucination prevented at prompt-grounding layer).
**Success Criteria** (what must be TRUE):

1. **SC#1 — prompt anchor present:** `system-prompt.ts` contains `*Convención:* Hoy es ${TODAY_ISO} (${DAY_NAME_TODAY}).` (or equivalent audit-verbatim wording locked at discuss-phase time) as a second single-line `*Convención:*` marker before `*Reglas de uso de herramientas (CRITICO):*`.
2. **SC#2 — rendered prompt grounds the date:** Rendered PB1.E1A lead prompt includes today's date in ISO format (`YYYY-MM-DD`) AND the Spanish day name (`lunes`/`martes`/.../`domingo`).
3. **SC#3 — snapshot fixture byte-equal across day boundaries:** `pb1-e1a-lead-rendered.snap.txt` is byte-equal regardless of when `pnpm test` runs. Achieved via `Date.now()` stub at test boot (`vi.useFakeTimers` OR `globalThis.Date` override OR equivalent). Decided at plan time.
4. **SC#4 — KGATE-05 budget preserved:** `POST_RLOK_04_BYTES` bumped from 18798 to measured post-fix value. Measured value must be ≤ 18916 cap (`floor(BASELINE_CHARS * 0.8)`). Expected directive ~25 chars → expected post-fix value ~18823 → ~93 char margin remaining.
5. **SC#5 — 6-pair sha256 invariant unchanged:** Canonical `DEBOUNCE_TTL_SECONDS` block at all 6 anchors continues to hash `67670b1e1099bf7c8a5285414736f16e8a010a010348bf6566790d0db3163344`. Phase 96.5 modifies zero terms in the invariant.
6. **SC#6 — register_trial tool calls grounded:** A regression test simulates a multi-turn lead conversation reaching `register_trial`; asserts the `date` argument the model dispatches matches today's ISO date (no 2023 hallucinations). The test must use the date stub so behavior is deterministic regardless of run wall-clock.

**Plans:** 1 plan (single-plan structure mirrors Phase 96; mechanical encoding of discuss-phase decisions in one RED → GREEN → SUMMARY chain).

- [ ] 96.5-01-PLAN.md — TBD (gated on `/gsd-discuss-phase 96.5` output)

**Notes:**

- **Empirical grounding for the case verdict.** Finding #2's verdict was locked at "pure model hallucination" during Phase 96 discuss session (2026-06-09). Read trail: `el-templo-bot/src/ai/tools.ts:279-288` (ScheduleRow has NO date column, only `day_of_week`), `tools.ts:415` and `:426` (output formatters emit only `${dayName} ${start_time}-${end_time}`, never a date string), `tools.ts:691` (`book_class` accepts `date` from MODEL args verbatim) and `tools.ts:869` (`register_trial` ditto). System prompt `grep "date|fecha|Hoy|today"` returned empty. No tool/data/seed/API touches needed — pure-prompt fix at the grounding layer.

- **Insertion region ownership.** Phase 96 established the first `*Convención:*` line (Sunday=0 directive) immediately before `*Reglas de uso de herramientas (CRITICO):*` at `system-prompt.ts:217`. Phase 96.5 lands a SECOND `*Convención:*` line in the same region. No structural refactor. The two markers coexist as parallel single-line directives.

- **Snapshot regen + date stub coordination.** The snapshot fixture (`pb1-e1a-lead-rendered.snap.txt`) byte-equal lock is the structural anchor. Without a `Date.now()` stub, the fixture would diff every day at midnight. Plan-time choice: (a) `vi.useFakeTimers` at test boot, (b) `globalThis.Date` constructor override, (c) capture date string into a render-time constant injected by the test harness. Plan-phase decides; discuss-phase enumerates tradeoffs.

- **Execute-prompt guidance pre-flagged for plan and execute.** Snapshot regeneration was the likely hang point of Phase 96's 5.5h executor timeout. For Phase 96.5 (same surface — snapshot regen + Date.now() stub), the execute prompt MUST explicitly call out `pnpm exec tsx -e` inline with the `Date.now()` stub approach. Without that pre-flag, the executor agent risks rediscovering the regen approach mid-run and hanging. This guidance is locked in STATE.md's "v5.4.0 Production-Ready Path" path step 1.

- **KGATE-05 budget arithmetic.** Post-Phase-96 baseline: 18798 bytes (`POST_RLOK_04_BYTES`). Cap: 18916 (`floor(BASELINE_CHARS * 0.8) = floor(23646 * 0.8)`). Current margin: 118 chars. Expected directive (`*Convención:* Hoy es YYYY-MM-DD (dayname).`) is ~45 chars including trailing newline + escaping — well within margin even at the high end. If actual directive exceeds ~110 chars at discuss-phase, surface as KGATE-05 risk before plan-phase.

- **Out of scope** (each enumerated to prevent scope drift in plan-phase):
  - **Tool-layer date validation** (`tools.ts` rejecting past dates server-side) → defensive belt-and-suspenders; Phase 96.5 fixes the prompt-grounding root cause. Tool validation can be added as a v5.4.0 hardening item if Manual UAT Round 2 reveals residual hallucinations.
  - **Timezone handling** (Argentine BST/ART vs UTC) → `${TODAY_ISO}` uses the server's local date; production deploys to sa-east-1 (per `deploy/DEPLOYMENT-CHECKLIST.md`), aligning with Argentine business hours. Cross-timezone edge cases are v5.4+ territory.
  - **Phase 96 surfaces** (CTXT rule, parseExtractionResponse helper, SOFT_REJECTION region) → all UNCHANGED.
  - **Other handler regions** (concurrency guard, OpenAI client, tool loop, retry counter) → UNCHANGED. Phase 96.5 modifies exactly one surface: `system-prompt.ts` insertion region around `:217+`.

### Phase 97: Backlog + Regression Lock

**Goal**: Close the two low-priority backlog items (third elevator-pitch hook + voseo consistency), lock all v5.3.3 fixes against future regression, extend the timeout pattern from Phase 94 to `executeTool` localhost calls (debug-session bonus finding), and validate via guided live test that the bot is **production-deploy-ready** (NOT CRM-integration-ready). Mirrors v5.3.2 Phase 92 shape — milestone-scoped regression suite + live-test gate.
**Depends on**: Phases 93, 94, 95, 96 (regression lock validates combined output of all v5.3.3 fixes; live test requires the full milestone behavior in place)
**Requirements**: ELEV-01, VOSEO-01, RGUARD-01, RGUARD-02, RGUARD-03
**Success Criteria** (what must be TRUE):

1. The elevator pitch consistently includes all three team hooks ("método internacional", "cuatro niveles simultáneos", "sin salirte del grupo"). The third hook ("sin salirte del grupo") was occasionally missing in the post-v5.3.2 live test — Phase 97 closes that. Testing strategy is non-deterministic per ELEV-01 (model variance — same constraint as VOSEO-01).
2. Bot uses Argentine voseo consistently. Specific failure mode being closed: bot occasionally produced "tienes" (Castilian) instead of "tenés" (rioplatense voseo) in live test. **Snapshot tests will NOT catch model variance** — plan must choose between (a) multi-run sampling with statistical threshold (e.g., N=20 runs, voseo appears in ≥18 — costs N× model spend per CI run) or (b) accept-list of valid forms (both "tenés" and "tienes" PASS, only fail on neither — cheaper, weaker signal). **Decided at plan time based on CI budget.** Same decision applies to ELEV-01.
3. **RGUARD-01:** New behavioural-integration assertions exist for every v5.3.3 fix — CONC-01, LAT-01..03, BOOK-01, DEGR-01..02, CTXT-01..02 — added to a milestone-scoped suite (likely `el-templo-bot/test/v5-3-3-regression.test.ts` mirroring v5.3.2's pattern). All passing.
4. **RGUARD-02:** Full bot test suite passes with **zero regressions** in v5.3.2 RLOK-01..04 + v5.3.1 KGATE/BPASS/METHOD/QREG behavior. Specifically: SC#3 (no-escalation for soft rejections) still holds (Phase 95 wires retry-escalation as tool-failure branch, Phase 91 framing untouched); KGATE-05 dual-threshold (≥20% rendered AND ≥35% knowledge block) still passes; PB1.E1A snapshot tripwire still holds (or is intentionally regenerated with the regen committed in the same PR per v5.3.1 update discipline).
5. **RGUARD-03:** Timeout pattern from LAT-01 extended to localhost API calls inside `executeTool`. **`withTimeout` helper is introduced by Phase 95** (booking-tool consumption); RGUARD-03 extends usage to remaining `executeTool` localhost call sites (enumeration TBD per Phase 95 audit + scan of `el-templo-bot/src/ai/tools.ts`). No refactor of Phase 95's helper — RGUARD-03 just consumes it.
6. **Live-test validation:** A guided live-test conversation on WhatsApp (covering rapid-fire concurrency, normal latency path, cross-venue booking, repeated tool failure → escalation, name-already-given context, elevator pitch, voseo) confirms all v5.3.3 fixes hold in practice. Documented as inline transcript in the phase SUMMARY (per-path verdicts + ≤2 retries + 3rd-fail → Phase 97.1 gap-closure).

**Plans:** TBD (likely 2 plans mirroring v5.3.2 Phase 92 — one for source/test changes (RGUARD-01..03 + ELEV-01 + VOSEO-01 mechanism), one for guided live test)

**Notes:**

- **Closing constraint per `MACRO-ROADMAP.md`:** Phase 97's live test must validate the bot is **production-deploy-ready**, NOT CRM-integration-ready. Acceptance focuses on behavioral/handler correctness and stability — NOT persistence layer, NOT CRM hooks, NOT multi-tenancy. Those land in v5.4.0 or Kero phase 1.
- **Non-deterministic regression strategy is the headline plan-time decision.** Both ELEV-01 (third hook coverage) and VOSEO-01 are model-variance-bound. Multi-run sampling gives stronger signal but burns CI model spend; accept-list is cheap but weaker signal. Decide once for both at plan time so the test pattern is consistent.
- **RGUARD-03 and the `executeTool` timeout:** the bonus finding from `bot-3min-response-latency.md` is that localhost API calls inside `executeTool` likely share the same unbounded-await defect Phase 94 fixes for `provider.chat`. **`withTimeout(promise, ms)` helper is introduced by Phase 95** for booking-tool calls (`tools.ts:636` and `:806`). Phase 97 RGUARD-03 extends usage to remaining `executeTool` sites — does NOT refactor or replace Phase 95's helper.
- **SC#3 invariant assertion** is the single most important RGUARD-02 line: a regression test must explicitly assert that a soft-rejection turn does NOT trigger `request_human`, even after Phase 95's escalation logic landed. This is the explicit guardrail against RLOK-03 regression.
- This is the only test-heavy phase of v5.3.3 (parallel to Phase 92 in v5.3.2). The shape — milestone regression suite + guided live test + per-path inline transcript — is reused deliberately.

## Progress

| Phase                                          | Plans Complete | Status      | Completed  |
| ---------------------------------------------- | -------------- | ----------- | ---------- |
| 93. Handler Concurrency                        | 1/1            | ✅ Complete | 2026-05-17 |
| 94. OpenAI Latency + Graceful Failure          | 2/2            | Complete    | 2026-05-18 |
| 95. Booking Reliability + Graceful Degradation | 0/?            | Not started | -          |
| 96. Context Awareness                          | 0/?            | Not started | -          |
| 96.5. Date Grounding Fix                       | 0/1            | Not started | -          |
| 97. Backlog + Regression Lock                  | 0/?            | Not started | -          |

---

<details>
<summary>✅ v5.3.2 Post-v5.3.1 Live Test Fixes (Phases 89-92) — SHIPPED 2026-04-16</summary>

- [x] Phase 89: Knowledge Fixes (1/1 plan)
- [x] Phase 90: Stage Heuristic Tightening (1/1 plan)
- [x] Phase 91: PB1 Objection Handling (1/1 plan)
- [x] Phase 92: Regression Lock + Live Test Validation (2/2 plans)

See: `.planning/milestones/v5.3.2-ROADMAP.md`

</details>

<details>
<summary>✅ v5.3.1 Prompt Architecture Refactor (Phases 86-88) — SHIPPED 2026-04-14</summary>

- [x] Phase 86: Knowledge Gating (3/3 plans)
- [x] Phase 87: Boarding Pass + Method Description (3/3 plans)
- [x] Phase 88: Quality Regression Lock (2/2 plans)

See: `.planning/milestones/v5.3.1-ROADMAP.md`

</details>

<details>
<summary>✅ v5.3 Conversational Sales & Playbook Engine (Phases 82-85) — SHIPPED 2026-04-08</summary>

- [x] Phase 82: Playbook Engine (3/3 plans)
- [x] Phase 83: Discovery Mode for Leads — PB1 (4/4 plans)
- [x] Phase 84: State-Adaptive Playbook Prompts — PB2-PB5 (3/3 plans)
- [x] Phase 85: Avatar Adaptation & Quality (2/2 plans)

See: `.planning/milestones/v5.3-ROADMAP.md`

</details>

_v5.3 shipped 2026-04-08 — see `.planning/milestones/v5.3-ROADMAP.md` for full details._

<details>
<summary>v2.0 Admin App (Phases 13-28)</summary>

See `.planning/milestones/v2.0-ROADMAP.md` for archived details. Phases 20-25 deferred.

</details>

<details>
<summary>v4.1 Admin Consolidation (Phases 58-66)</summary>

See `.planning/milestones/v4.1-ROADMAP.md` for archived details. Phases 60-66 deferred to a future milestone.

</details>

<details>
<summary>✅ v5.0 WhatsApp AI Chatbot (Phases 67-73) — SHIPPED 2026-03-26</summary>

- [x] Phase 67: WhatsApp Cloud API Webhook + Echo Bot (2/2 plans)
- [x] Phase 68: AI Integration + Info Tools (3/3 plans)
- [x] Phase 69: Redis Memory Layer + Client State Machine (2/2 plans)
- [x] Phase 70: Action Tools (2/2 plans)
- [x] Phase 71: Proactive Schedulers (2/2 plans)
- [x] Phase 72: Admin Panel — Conversations UI (2/2 plans)
- [x] Phase 73: Admin Panel — Human Takeover (2/2 plans)

See: `.planning/milestones/v5.0-ROADMAP.md`

</details>

<details>
<summary>✅ v5.1 Production Readiness & Business Data (Phases 74-78) — SHIPPED 2026-03-27</summary>

- [x] Phase 74: Business Data Integration (2/2 plans)
- [x] Phase 75: Database Seeding (1/1 plans)
- [x] Phase 76: Known Issues Fix (1/1 plans)
- [x] Phase 77: GitHub Actions Deployment (2/2 plans)
- [x] Phase 78: WhatsApp Production Setup (1/1 plans)

See: `.planning/milestones/v5.1-ROADMAP.md`

</details>

<details>
<summary>✅ v5.2 Mica Persona & Bot Refinement (Phases 79-81) — SHIPPED 2026-04-06</summary>

- [x] Phase 79: Mica System Prompt & Knowledge Rewrite (2/2 plans)
- [x] Phase 80: Response Quality & Data Fixes (2/2 plans)
- [x] Phase 81: Conversation Flow Testing (1/1 plan)

See: `.planning/milestones/v5.2-ROADMAP.md`

</details>
