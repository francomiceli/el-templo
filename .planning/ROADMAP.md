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
- 🚧 **v5.3.3 Post-v5.3.2 Live Test Fixes** — Phases 93-97 (in progress)

> See `.planning/MACRO-ROADMAP.md` for the cross-milestone sequence (v5.3.3 → v5.4.0 Production Deployment → Kero CRM).

---

## 🚧 v5.3.3 Post-v5.3.2 Live Test Fixes (In Progress)

**Milestone Goal:** Close the 7 issues surfaced by the post-v5.3.2 live test (handler concurrency, OpenAI latency, booking inconsistency, context-awareness, graceful degradation, plus 2 low-priority backlog items) so the bot is stable and **production-deploy-ready** for v5.4.0. Targeted bug fixes only — no state-machine redesign, no new playbooks, no CRM integration. Mirrors v5.3.2's targeted-fixes shape.

**Environment:** dev-only (local + ngrok + Meta test number — same as v5.3.2). v5.4.0 owns the dev → prod migration.

**Closing constraint (per `MACRO-ROADMAP.md`):** Phase 97's final live test must validate the bot is **production-deploy-ready**, NOT CRM-integration-ready. Acceptance focuses on behavioral/handler correctness and stability — not persistence layer, not CRM hooks, not multi-tenancy. Those land in v5.4.0 or Kero phase 1.

**Target ship:** TBD (5-phase tactical scope; mirrors v5.3.2 cadence).

### Phases

- [ ] **Phase 93: Handler Concurrency** — BUG-01 race condition; eliminate duplicate-response on rapid-fire user messages via debounce / Redis lock per phone at handler entry (CONC-01)
- [ ] **Phase 94: OpenAI Latency + Graceful Failure** — BUG-02 ~3min latency; explicit OpenAI client timeout + interim UX + graceful fallback at `provider.chat(...)` await sites (LAT-01..03)
- [ ] **Phase 95: Booking Reliability + Graceful Degradation** — BUG-03 + BUG-05 paired; class search consistency across venues + tool-failure retry-counter + escalate via `request_human` after 2 failed attempts; SC#3 invariant preserved (BOOK-01, DEGR-01..02)
- [ ] **Phase 96: Context Awareness** — BUG-04; bot does not re-ask data already provided in conversation; fix in `system-prompt.ts` or profile extraction layer (CTXT-01..02)
- [ ] **Phase 97: Backlog + Regression Lock** — BACKLOG-01 (third elevator hook) + BACKLOG-02 (voseo consistency, non-deterministic strategy) + v5.3.3 regression suite + extend timeout pattern to `executeTool` localhost calls (ELEV-01, VOSEO-01, RGUARD-01..03)

## Phase Details

### Phase 93: Handler Concurrency

**Goal**: Rapid-fire user messages produce exactly ONE bot response, not duplicates. The race condition observed in the post-v5.3.2 live test (BUG-01) is closed at the `processWithAi` entry in `el-templo-bot/src/webhook/handler.ts`.
**Depends on**: Nothing (first phase of v5.3.3; entry-side stabilization that does NOT share code surface with Phase 94's exit-side fix per `bot-3min-response-latency.md` debug verdict)
**Requirements**: CONC-01
**Success Criteria** (what must be TRUE):

1. When the user sends 2-3 messages in rapid succession (faster than the bot's response cycle, e.g., "Hola" → "Hola?" → "Holaaaaa"), the bot generates exactly ONE response — not two, not three.
2. The existing 3s debounce + Redis dead-man switch (`DEBOUNCE_DELAY_MS=3000`, `DEBOUNCE_TTL_SECONDS=10` in `handler.ts:95`+) either (a) is confirmed correct and the bug is elsewhere (e.g., Meta retry behaviour, ngrok jitter, Redis lock TTL interaction), or (b) is fixed at the same layer (debounce / Redis lock per phone with short TTL).
3. A regression test exists that simulates rapid-fire inbounds for the same phone number and asserts the handler produces exactly ONE call to `provider.chat(...)` (or one outbound message), not multiple.

**Plans:** TBD

**Notes:**

- Starting point per `REQUIREMENTS.md` CONC-01: investigate whether existing debounce mechanism is already correct and bug is elsewhere, vs. mechanism failing under specific timing. Do NOT default to "introduce a queue" — `BullMQ`/`RabbitMQ` are explicitly out of scope per REQUIREMENTS.md (over-engineered at ~100 convs/day).
- Disjoint from Phase 94: BUG-01's fix is at handler entry (concurrency control between concurrent invocations), BUG-02's fix is around `provider.chat(...)` error path (different code region, different concern). Per debug session 2026-05-05 (`bot-3min-response-latency.md`), they touch the same file but operate on disjoint surfaces — must NOT be conflated during plan execution.

### Phase 94: OpenAI Latency + Graceful Failure

**Goal**: A slow or hung OpenAI request can no longer silently stall the handler for minutes. The OpenAI SDK is bounded by an explicit timeout, the handler sends an interim UX message when the call exceeds the timeout boundary, and a graceful fallback is sent (and the bot returns cleanly) if a retry also fails. Closes BUG-02 from the post-v5.3.2 live test (~3min response latency window 22:23-22:26).
**Depends on**: Nothing (independently plannable; BUG-02 root cause confirmed in debug session 2026-05-05 — own phase, NOT paired with Phase 93 per disjoint-code-surface verdict)
**Requirements**: LAT-01, LAT-02, LAT-03
**Success Criteria** (what must be TRUE):

1. The OpenAI client in `el-templo-bot/src/ai/openai.ts:29` is constructed with an explicit `timeout` option — default `45_000` ms (45s), env-overridable via `OPENAI_TIMEOUT_MS`. `.env.example` updated. The SDK no longer falls back to its 600s (10 min) default.
2. When a `provider.chat(...)` call exceeds the timeout (or throws `OpenAI.APIError` for any other reason), the handler sends an interim UX message to the user (e.g., "Dame un segundo 🙌") rather than hanging silently. Wraps `provider.chat(...)` await sites at `handler.ts:584` and `handler.ts:641`.
3. If the retry/fallback also fails (e.g., upstream is durably down), the handler sends a graceful-fallback message ("Tuve un problemita técnico, ¿me lo escribís de nuevo?" or similar) and returns cleanly — does not infinite-loop, does not silently hang, does not crash the bot process.
4. A regression test mocks a slow/hung OpenAI response and asserts (a) the handler bails within the timeout boundary, (b) an interim message is sent to the user, and (c) the graceful fallback fires when the retry also fails.

**Plans:** TBD

**Notes:**

- **File-level pointers from debug session (`bot-3min-response-latency.md`):**
  - File 1: `/Users/bores/el-templo/el-templo-bot/src/ai/openai.ts:29` — `new OpenAI()` needs explicit `timeout: 45_000` + `OPENAI_TIMEOUT_MS` env override + `.env.example` update.
  - File 2: `/Users/bores/el-templo/el-templo-bot/src/webhook/handler.ts:584` and `:641` — wrap `provider.chat(...)` await sites with timeout/`OpenAI.APIError` handler that sends interim message + graceful fallback. The existing outer `try/catch` at `handler.ts:323` only logs today; surface to user is the new behavior.
- **Bonus finding (carried into Phase 97 RGUARD-03):** `executeTool` localhost API calls likely have the same unbounded-await problem. Phase 94 should NOT expand scope to fix this; flag it as a Phase 97 concern.
- The exact distal trigger on 2026-04-16 22:23-22:26 (OpenAI slow that minute? ngrok jittery?) is unrecoverable because logs are stdout-only and the dev process has been restarted. The proximate structural cause (no timeout) is identifiable from code alone and matches the symptom shape unambiguously — verdict in `bot-3min-response-latency.md`. v5.4.0 fixes the logging-on-rotate gap; v5.3.3 fixes the structural defect.

### Phase 95: Booking Reliability + Graceful Degradation

**Goal**: Class search returns consistent results across all venues so users can complete bookings without the bot looping on "no encontré clases disponibles". When tool calls do fail repeatedly, the bot escalates via `request_human` instead of entering an apology loop. Closes BUG-03 (booking root cause) and BUG-05 (apology-loop safety net) **paired** because BUG-05 is the safety net for when BUG-03 still fails — shipping one without the other leaves either users seeing raw failure modes (BUG-05 alone never triggers in test) or no safety net validation (BUG-03 alone leaves apology-loop unguarded).
**Depends on**: Phase 94 (booking layer needs a stable handler — Phase 94's timeout/graceful-fallback rails are upstream of the tool-execution failure modes Phase 95 has to reason about)
**Requirements**: BOOK-01, DEGR-01, DEGR-02
**Success Criteria** (what must be TRUE):

1. Class search returns consistent results across all El Templo venues — the booking tool (`book_class` or similar in `el-templo-bot`'s tool registry) can locate available classes regardless of which branch the user mentions. A user can complete a booking without the bot looping on "no encontré clases disponibles" when classes do exist.
2. When tool calls fail repeatedly (transient errors, missing data, 5xx from localhost API), the bot does NOT enter an apology loop. Implementation: retry counter + escalate via `request_human` after 2 failed attempts. The escalation phrase reuses the v5.2-locked "Te paso con alguien del equipo, te escriben enseguida 🙌".
3. **SC#3 invariant (RLOK-03 guardrail):** the no-escalation rule from v5.3.2 (Phase 91 OBJN-01/02) applies to **soft rejections ONLY**, NOT to tool failures. DEGR-01's `request_human` escalation triggers on **tool failures only**. Soft rejections continue to follow Phase 91's WHY/BACK-OFF Spanish framing in `system-prompt.ts`. Both rules wired without conflation. **Asserted in Phase 97 RGUARD-02 — explicit guardrail against RLOK-03 regression.**
4. A regression test simulates (a) a successful cross-venue class search, (b) repeated tool-failure mode → assert escalation fires after 2 attempts, (c) a soft-rejection turn → assert NO `request_human` call, only WHY/BACK-OFF framing per Phase 91.

**Plans:** TBD (likely 2 plans — one per BUG ID; ship together, reviewed together)

**Notes:**

- **Pairing rationale:** BUG-03 + BUG-05 ship together. BUG-05 is the safety net for when BUG-03 still fails. Shipping BUG-05 without BUG-03 means the safety net never triggers in test (no real failure path to exercise it). Shipping BUG-03 without BUG-05 means users still see raw apology-loop failure modes when residual booking edge cases hit. Phase 95 is designed as ONE phase with potentially 2 plans (one per BUG ID), NOT split into 2 phases.
- **SC#3 invariant is the single most important carry-forward from v5.3.2.** The plan executor MUST wire the retry-counter escalation as a tool-failure-only branch, not a generic escalation rule. Phase 91's soft-rejection framing must remain untouched. This is asserted explicitly in Phase 97 RGUARD-02.
- **Out of scope:** Larger `executeTool` refactor (parallelization, retry semantics, structured error taxonomy) is NOT v5.3.3 scope per REQUIREMENTS.md. Phase 95 only adds the retry counter + escalation branch; deeper refactor is v5.4+ territory.

### Phase 96: Context Awareness

**Goal**: Bot does not re-ask for data the user has already provided earlier in the conversation. Closes BUG-04 from the post-v5.3.2 live test (specific failure: user said "Ignacio Bordon", bot re-asked for full name two turns later). Discrete prompt / profile-extraction work — does not touch handler, OpenAI client, or booking layers.
**Depends on**: Phase 95 (sequencing rather than coupling — keeps the milestone linear; Phase 96 is independently plannable but lands after the booking + degradation work to keep regression-lock test budget linear)
**Requirements**: CTXT-01, CTXT-02
**Success Criteria** (what must be TRUE):

1. When the user has provided structured profile data earlier in the conversation (full name, contact info, preferences, etc.), the bot does NOT re-ask for the same data. Specifically: a conversation where the user types "Ignacio Bordon" must result in NO subsequent `request for full name` from Mica.
2. Profile extraction layer (or `system-prompt.ts` rules) ensures persisted `<profile>` data is referenced by the model rather than rediscovered. Choice between (a) prompt-level rule reminding the model to consult known profile fields, (b) extraction-layer fix that surfaces profile data more prominently, or (c) hybrid — decided at plan time.
3. A regression test exists that simulates a multi-turn conversation where the user provides their name in turn 1, asserts the bot's turn-3 reply does NOT re-ask for full name (assert by absence of "nombre completo" / "cómo te llamás" / "tu nombre" patterns when profile field is populated).

**Plans:** TBD

**Notes:**

- Implementation choice between prompt-level rule, extraction-layer fix, and hybrid is genuinely a plan-time decision — depends on whether the existing `<profile>` tag flow already persists this data and the model is just ignoring it (→ prompt-level fix), or whether extraction is dropping it (→ extraction-layer fix). Read `extractAndUpdateProfile` flow before deciding.
- Discrete prompt work — does NOT modify handler concurrency, OpenAI client, booking tools, or anything Phase 93/94/95 touches. Lowest-risk phase of the milestone after Phase 93 (which is investigative).

### Phase 97: Backlog + Regression Lock

**Goal**: Close the two low-priority backlog items (third elevator-pitch hook + voseo consistency), lock all v5.3.3 fixes against future regression, extend the timeout pattern from Phase 94 to `executeTool` localhost calls (debug-session bonus finding), and validate via guided live test that the bot is **production-deploy-ready** (NOT CRM-integration-ready). Mirrors v5.3.2 Phase 92 shape — milestone-scoped regression suite + live-test gate.
**Depends on**: Phases 93, 94, 95, 96 (regression lock validates combined output of all v5.3.3 fixes; live test requires the full milestone behavior in place)
**Requirements**: ELEV-01, VOSEO-01, RGUARD-01, RGUARD-02, RGUARD-03
**Success Criteria** (what must be TRUE):

1. The elevator pitch consistently includes all three team hooks ("método internacional", "cuatro niveles simultáneos", "sin salirte del grupo"). The third hook ("sin salirte del grupo") was occasionally missing in the post-v5.3.2 live test — Phase 97 closes that. Testing strategy is non-deterministic per ELEV-01 (model variance — same constraint as VOSEO-01).
2. Bot uses Argentine voseo consistently. Specific failure mode being closed: bot occasionally produced "tienes" (Castilian) instead of "tenés" (rioplatense voseo) in live test. **Snapshot tests will NOT catch model variance** — plan must choose between (a) multi-run sampling with statistical threshold (e.g., N=20 runs, voseo appears in ≥18 — costs N× model spend per CI run) or (b) accept-list of valid forms (both "tenés" and "tienes" PASS, only fail on neither — cheaper, weaker signal). **Decided at plan time based on CI budget.** Same decision applies to ELEV-01.
3. **RGUARD-01:** New behavioural-integration assertions exist for every v5.3.3 fix — CONC-01, LAT-01..03, BOOK-01, DEGR-01..02, CTXT-01..02 — added to a milestone-scoped suite (likely `el-templo-bot/test/v5-3-3-regression.test.ts` mirroring v5.3.2's pattern). All passing.
4. **RGUARD-02:** Full bot test suite passes with **zero regressions** in v5.3.2 RLOK-01..04 + v5.3.1 KGATE/BPASS/METHOD/QREG behavior. Specifically: SC#3 (no-escalation for soft rejections) still holds (Phase 95 wires retry-escalation as tool-failure branch, Phase 91 framing untouched); KGATE-05 dual-threshold (≥20% rendered AND ≥35% knowledge block) still passes; PB1.E1A snapshot tripwire still holds (or is intentionally regenerated with the regen committed in the same PR per v5.3.1 update discipline).
5. **RGUARD-03:** Timeout pattern from LAT-01 extended to localhost API calls inside `executeTool` (bonus finding from BUG-02 debug session — same unbounded-await problem likely affects tool execution, not just `provider.chat`). Implementation may be a single shared timeout helper.
6. **Live-test validation:** A guided live-test conversation on WhatsApp (covering rapid-fire concurrency, normal latency path, cross-venue booking, repeated tool failure → escalation, name-already-given context, elevator pitch, voseo) confirms all v5.3.3 fixes hold in practice. Documented as inline transcript in the phase SUMMARY (per-path verdicts + ≤2 retries + 3rd-fail → Phase 97.1 gap-closure).

**Plans:** TBD (likely 2 plans mirroring v5.3.2 Phase 92 — one for source/test changes (RGUARD-01..03 + ELEV-01 + VOSEO-01 mechanism), one for guided live test)

**Notes:**

- **Closing constraint per `MACRO-ROADMAP.md`:** Phase 97's live test must validate the bot is **production-deploy-ready**, NOT CRM-integration-ready. Acceptance focuses on behavioral/handler correctness and stability — NOT persistence layer, NOT CRM hooks, NOT multi-tenancy. Those land in v5.4.0 or Kero phase 1.
- **Non-deterministic regression strategy is the headline plan-time decision.** Both ELEV-01 (third hook coverage) and VOSEO-01 are model-variance-bound. Multi-run sampling gives stronger signal but burns CI model spend; accept-list is cheap but weaker signal. Decide once for both at plan time so the test pattern is consistent.
- **RGUARD-03 and the `executeTool` timeout:** the bonus finding from `bot-3min-response-latency.md` is that localhost API calls inside `executeTool` likely share the same unbounded-await defect Phase 94 fixes for `provider.chat`. Phase 97 closes this rather than spawning a separate phase. A single shared timeout helper (e.g., `withTimeout(promise, ms)`) is the obvious DRY shape — but plan may also choose direct config per call site if helper would obscure intent.
- **SC#3 invariant assertion** is the single most important RGUARD-02 line: a regression test must explicitly assert that a soft-rejection turn does NOT trigger `request_human`, even after Phase 95's escalation logic landed. This is the explicit guardrail against RLOK-03 regression.
- This is the only test-heavy phase of v5.3.3 (parallel to Phase 92 in v5.3.2). The shape — milestone regression suite + guided live test + per-path inline transcript — is reused deliberately.

## Progress

| Phase                                          | Plans Complete | Status      | Completed |
| ---------------------------------------------- | -------------- | ----------- | --------- |
| 93. Handler Concurrency                        | 0/?            | Not started | -         |
| 94. OpenAI Latency + Graceful Failure          | 0/?            | Not started | -         |
| 95. Booking Reliability + Graceful Degradation | 0/?            | Not started | -         |
| 96. Context Awareness                          | 0/?            | Not started | -         |
| 97. Backlog + Regression Lock                  | 0/?            | Not started | -         |

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
