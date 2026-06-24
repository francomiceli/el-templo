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
- 🚧 **v5.3.3 Post-v5.3.2 Live Test Fixes** — Phases 93-97 + 96.5 + 98 (in progress)

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
- [x] **Phase 96.5: Date Grounding Fix** — Finding #2 from Phase 96 live UAT; bot grounds today's date instead of hallucinating "Lunes 2023-11-06"; second `*Convención:*` line in `system-prompt.ts` + snapshot date-stub infrastructure (DATE-01) ✅ shipped 2026-06-16
- [x] **Phase 97.5: Raw-SQL Column-Drift Prod-Fix** ✅ shipped 2026-06-17 — raw-SQL ↔ Drizzle column-name drift fixed via Option B inline rename at 8 sites (`tools.ts:452,495,500,538` + `machine.ts:39,77,90,116`); RED integration test reproduces `Unknown column 'sub.status'` (errno 1054 / sqlState 42S22) on master HEAD; permanent sweep-lint guardrail at `el-templo-api/test/lint/raw-sql-column-drift.test.ts` (live Drizzle introspection + must-include SUBSET coverage on 10 high-risk plain-word→prefixed renames + bare-column detection + synthetic-drift positive-control). Same drift class as Phase 95 BUG-03 (vi); SYSTEMIC scope-out via the sweep-lint. Commit chain: `cfb13e2c` RED → `56deb8d2` GREEN → `6aee5f58` SUMMARY → `b19a7400` post-merge mock fix (state-machine.test.ts). Verified 6/6 SC + 5/5 D-decisions PASS; debug session `.planning/debug/bot-raw-sql-status-column-drift.md` closed. **Unblocks Phase 97 RGUARD-01 and Phase 98 reopen.** (DRIFT-01..02)
- [x] **Phase 98: Test Hygiene (98-A/B/C)** ✅ shipped 2026-06-17 (post-97.5 retry, local merge to `feature/whatsapp-bot-scaffold`) — green baseline restored on `el-templo-api`: 519 passed / 1 failed / 520 total, single failure is the intended Phase-95-deferred BUG-03 (i) LIKE-search RED at `tools.ts:455`. Recovery shape: Task 1 (98-A) cherry-pick `95d58f98` from `phase-98-preserve/task-1-green-baseline`; Task 2 (98-B) `git apply` `98-TASK-2-WIP.patch` + inline D-12 check_schedule next-occurrence date fix + Rule 1 `lleno`→`sin cupos` wording; Task 3 (98-C) fresh vi.mock for `el-templo-bot/src/ai/provider` + echo asserts + image-test rewrite using `waitForHandler()`; Task 4 human-verify PASS by operator. SC#5 HARD GUARD held — zero `el-templo-{api,bot}/src/**` modifications across the 3 task commits. Commit chain: `9b02c830` 98-A → `d70fb5b5` 98-B → `bfdcba1f` 98-C → `6bf63098` SUMMARY → `1206ced6` merge (no-ff). Cross-phase finding surfaced during human-verify: `ai-tools-membership-drift.test.ts` (97.5-owned) flake blocks Phase 97 RGUARD-01 baseline lock — see `.planning/phases/98-test-hygiene-98-a-b-c/98-FINDINGS-phase-97-bound.md`. (HYG-01)
- [ ] **Phase 97: Backlog + Regression Lock** — BACKLOG-01 (third elevator hook) + BACKLOG-02 (voseo consistency, non-deterministic strategy) + v5.3.3 regression suite + extend timeout pattern to `executeTool` localhost calls (ELEV-01, VOSEO-01, RGUARD-01..03). **BLOCKED on flake-fix in `ai-tools-membership-drift.test.ts` (Phase 98 finding 98-FINDING-01) before RGUARD-01 can lock a baseline.**
- [ ] **Phase 99: Bot copy and price disclosure fixes** — Mica name reinforcement (COPY-01) + "Sesión Grupal" → "clases de calistenia" rename + preservation (COPY-02) + Option-B price disclosure after 2 insistences via per-PB1 counter + threshold-based prompt addendum (PRICE-01..04). Depends on Phase 98. 3 plans, Wave 1→2→3. Local-only.

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

### Phase 97.5: Raw-SQL Column-Drift Prod-Fix

**Goal**: Eliminate the raw-SQL ↔ Drizzle-column-name drift class in `el-templo-bot` raw SQL templates. Three confirmed drift sites (`el-templo-bot/src/ai/tools.ts:495,500` and `el-templo-bot/src/state/machine.ts:77`) reference `sub.status` / `s.status` where the actual SQL column is `subscription_status` (migration 0032), causing `Unknown column 'sub.status' in 'field list'` (MySQL errno 1054, sqlState 42S22) on every `check_membership` tool call and on `determineClientState` for inbound WhatsApp messages from members with an active/paused subscription row. Same drift class as Phase 95 BUG-03 (vi) (`bk.status` → `bk.booking_status`, fixed at `tools.ts:330` and `:824`) — second instance, treated as SYSTEMIC. Inserted between Phase 96.5 and Phase 98 per the locked v5.4.0 production-ready path (STATE.md 2026-06-17), ahead of Phase 98 reopen and Phase 97 RGUARD-01.
**Depends on**: Phase 96.5 (shipped 2026-06-16, `4598dcea` SUMMARY). Reopens path to Phase 98 cherry-pick (`phase-98-preserve/task-1-green-baseline` + `98-TASK-2-WIP.patch`) and Phase 97 RGUARD-01 baseline lock. Inputs already captured at `.planning/debug/bot-raw-sql-status-column-drift.md` (status: diagnosed; full sweep complete 2026-06-17): 22 bot-side SQL sites surveyed (3 drift / 19 correct), 153 API-side SQL sites surveyed (0 drift — uniformly Drizzle-mediated), Drizzle column-rename map (high-risk subset documented), Option-B fix recommendation, sweep-lint test design outline. No re-discovery needed.
**Requirements**: DRIFT-01 (NEW — three confirmed drift sites must be GREEN against the real `eltemplo_test` MySQL with a seeded active-subscription row), DRIFT-02 (NEW — sweep-lint test prevents future regressions of the same drift class across `el-templo-bot/src/**` and `el-templo-api/src/**`).
**Success Criteria** (what must be TRUE):

1. **SC#1 — RED first:** A vitest integration test exists that reproduces `Unknown column 'sub.status' in 'field list'` (or `'s.status'`) against real MySQL (`eltemplo_test`) for the `check_membership` and `determineClientState` paths on a seeded active-subscription row. The test asserts the MySQL errno 1054 / sqlState 42S22 propagates. This RED must FAIL on `master` HEAD before the fix lands.
2. **SC#2 — GREEN at all 3 drift sites:** `tools.ts:495`, `tools.ts:500`, and `machine.ts:77` are fixed via Option B (rename `SubscriptionRow.status` → `SubscriptionRow.subscription_status`; SELECT `sub.subscription_status` / `s.subscription_status` directly without `AS status` aliasing; update all JS-side reads at `tools.ts:538`, `machine.ts:90`, `machine.ts:116`). The RED tests from SC#1 turn GREEN against real MySQL; no `Unknown column` errors propagate from any `check_membership` or `determineClientState` invocation.
3. **SC#3 — sweep-lint guardrail:** `el-templo-api/test/lint/raw-sql-column-drift.test.ts` exists, runs in `pnpm test` (per `CLAUDE.md` API-test convention), builds the JS-property → SQL-column rename map from live Drizzle schema introspection (not a hand-maintained constant), scans every `` sql`...` `` template literal across `el-templo-bot/src/**` and `el-templo-api/src/**`, and asserts zero drift findings. A negative unit test (synthetic drift fixture) confirms the scanner actually detects the pattern.
4. **SC#4 — no scope expansion:** Zero modifications outside the 3 drift sites + their JS-side reads + the `SubscriptionRow` interface decl + the sweep-lint test file. Specifically NOT touched: Phase 96.5 `system-prompt.ts` surface, Phase 95 booking-tool fixes (`tools.ts:330`, `:824`, `withTimeout`), Phase 94 OpenAI-client surface, Phase 93 concurrency guard, any other production region. Verified by diff inspection in SUMMARY.
5. **SC#5 — Phase 98 unblocked:** With Phase 97.5 landed on `master`, cherry-picking `phase-98-preserve/task-1-green-baseline` + applying `98-TASK-2-WIP.patch` no longer surfaces `Unknown column 'sub.status'` failures. The 3 `ai-tools.test.ts` failures previously masked as test-infra now resolve via the prod-fix.
6. **SC#6 — sweep-lint covers all known renames:** The rename map covers every high-risk rename documented in the debug-session sweep findings (e.g. `attendance.status` → `attendance_status`, `whatsapp_conversations.status` → `conversation_status`, `whatsapp_messages.direction` → `message_direction`, `subscription_plans.planTier` → `plan_tier`, etc. — see "Drizzle column-rename map (high-risk subset)" in the debug session). The map is rebuilt from live Drizzle introspection at test time so new renames are auto-covered without test-side maintenance.

**Plans:** 1 plan (single-plan TDD structure; mirrors Phase 96.5's mechanical encoding of discuss-phase decisions in one RED → GREEN → SUMMARY chain).

- [x] 97.5-01-PLAN.md — RED (drift integration test + sweep-lint) -> GREEN (Option B rename in tools.ts + machine.ts, 8 sites) -> SUMMARY

**Notes:**

- **Empirical grounding for the case.** Full sweep at `.planning/debug/bot-raw-sql-status-column-drift.md` enumerated every `` sql`...` `` template across `el-templo-bot/src/**` (22 sites in 5 files: `webhook/handler.ts`, `state/machine.ts`, `ai/tools.ts`, `schedulers/class-reminder.ts`, `schedulers/trial-followup.ts`) and `el-templo-api/src/**` (153 sites in 17 files). Bot side: 3 drift (the original 3 from the Phase 98 halt), 19 correct. API side: 0 drift, uniformly Drizzle-mediated (`${schema.table.column}` interpolation resolves at query build). The drift class has NOT spread beyond the 3 confirmed sites.

- **Fix shape Option B locked at discuss-phase.** Three shapes were considered in the debug session: (A) `SELECT ... AS status` aliasing — smallest diff, hides truth, encourages future drift; (B) rename `SubscriptionRow.status` → `subscription_status` field with all JS-side reads updated — explicit, aligns row type with actual SQL column, ~12-line diff, mirrors Phase 95 (vi) fix pattern — **RECOMMENDED** per CLAUDE.md "Explicit over clever"; (C) migrate the 3 sites to Drizzle's typed query builder — eliminates the drift class at the type-system level, but a v5.4.0 follow-up, out of scope here. Option B is the default locked recommendation; discuss-phase may lift to Option C only if scope expansion is explicitly authorized.

- **TDD ordering is non-negotiable.** RED test (SC#1) lands in commit N. GREEN fix at the 3 sites (SC#2) lands in commit N+1. Sweep-lint test (SC#3) lands in commit N+2. SUMMARY lands in commit N+3. Each commit is independently runnable; mid-sequence rollback returns to a defined state.

- **Sweep-lint scope and false-positive guard.** The scanner anchors on `<table_alias>.<col>` patterns (not bare `<col>`), skips Drizzle-interpolated column references (`${schema.bookings.status}` or `${bookings.status}` — those resolve at query build), and handles multi-line `` sql`...` `` template literals. Alias-parsing patterns to support: `FROM <table>`, `FROM <table> <alias>`, `JOIN <table> <alias> ON ...` — sufficient for the in-codebase patterns; no full SQL parser needed. Rename map built via Drizzle column-`.name` introspection at test time, not hardcoded.

- **Phase-97 absorption rejected.** Phase 97 plan-phase had an open "absorption option" clause permitting it to fold Phase 98 98-A/B/C into RGUARD-01 scope, but the systemic prod-bug class warrants its own phase: it blocks `master` baseline correctness for `check_membership` and the entire `determineClientState` path. Phase 97 RGUARD-01 needs a green-on-real-MySQL baseline to lock against — Phase 97.5 ships that baseline ahead of Phase 98 reopen.

- **Out of scope** (each enumerated to prevent scope drift in plan-phase):
  - **Option C migration to Drizzle typed query builder** — long-term elimination of the entire drift class; tracked as v5.4.0 follow-up. The 3 bot-side raw SQL sites stay raw SQL but use SQL column names directly post-fix.
  - **`formatBranchLocations` accent-insensitive matching** (`el-templo-bot/src/ai/tools.ts:599-623`) — real prod concern (NFD normalization on branch-name lookup) but unrelated to the column-drift class; captured for v5.4.0 staging-gate review.
  - **Test-side `check_schedule` date mismatch** (`el-templo-api/test/whatsapp/ai-tools.test.ts:153-175`, `:178-200`) — test-infra fix that lands in Phase 98 retry Task 2 expansion, NOT here.
  - **Phase 96.5 surfaces** (`system-prompt.ts` `*Convención:*` lines, KGATE-05 budget) → UNCHANGED.
  - **Phase 95 booking-tool surfaces** (`tools.ts:330`, `:824`, `withTimeout` helper) → UNCHANGED.
  - **Phase 98 test-infra surfaces** (D-05 cleanup cascade, bookings column-rename in tests, address fixes, `'TSTC'` varchar(10) overflow, `maps.app.goo.gl` short-link assertion) → land in Phase 98 reopen, NOT here.
  - **Other handler regions** (concurrency guard, OpenAI client, tool loop, retry counter, snapshot infra) → UNCHANGED. Phase 97.5 modifies exactly 4 surfaces: `el-templo-bot/src/ai/tools.ts` (drift sites + JS-side reads), `el-templo-bot/src/state/machine.ts` (drift site + JS-side reads), `SubscriptionRow` interface decl, and a new `el-templo-api/test/lint/raw-sql-column-drift.test.ts` file.

### Phase 98: Test Hygiene (98-A/B/C) — ✅ SHIPPED 2026-06-17

**⚠ HALT:** Phase 98 halted mid-Task-2 per the plan's STOP-and-reclassify guard. Closing the D-05 cleanup cascade in `ai-tools.test.ts` exposed a production bug in `el-templo-bot` raw SQL (`sub.status` / `s.status` at `tools.ts:495,500` + `machine.ts:77` but the SQL column is `subscription_status`). Same drift class as Phase 95 BUG-03 (vi) `bk.status` → `bk.booking_status` — treated as SYSTEMIC. SC#5 HARD GUARD (zero production source modifications) prevents the fix landing in Phase 98 by design. **A new prod-fix phase (97.5) is queued ahead of Phase 98 reopen.** See `.planning/phases/98-test-hygiene-98-a-b-c/98-HALT.md` for the halt narrative, preserved artifacts, and re-plan inputs. The original verdict-(a) classification in `.planning/debug/resolved/api-30-test-failures-triage.md` is amended to (b) — see verdict-amendment block in that file.

**Preserved at halt:**

- Task 1 (98-A): committed `95d58f98` on `phase-98-preserve/task-1-green-baseline` (durable) and `worktree-agent-a10bd401b163da68c` (worktree). Closes 6 of 30 reds. Cherry-pick on Phase 98 reopen.
- Task 2 (98-B) WIP: `.planning/phases/98-test-hygiene-98-a-b-c/98-TASK-2-WIP.patch` (104 lines). Includes plan-authorized D-05/D-06 + operator-authorized expansion (`booking_status` renames, `Alem 3958` / `Av. Constitucion 6745` address fixes, `'TSTC'` for varchar(10) overflow, `maps.app.goo.gl` for short-link assertion). Plus diagnosis (not yet fixed) of check_schedule date mismatch at `:153`/`:178`. Apply on Phase 98 reopen.
- Task 3 (98-C) + Task 4 (human-verify): not started.

**Goal (unchanged for reopen):** Restore green baseline on `el-templo-api` test suite by fixing the test-side issues originally classified in `/gsd-debug` session `api-30-test-failures-triage` (2026-06-16) as verdict (a) PURE TEST-INFRA — amended 2026-06-17 to verdict (b) test-infra + 1 systemic prod bug class (raw-SQL column-name drift). Phase 98 remains test-infra ONLY — zero production source modifications. The prod-bug class is owned by the new Phase 97.5. MUST still precede Phase 97 RGUARD-01.
**Depends on**: Phase 96.5 (shipped 2026-06-16, `d835c18a` SUMMARY) + `/gsd-debug` api-30 triage (resolved 2026-06-16, classification verdict (a)).
**Requirements**: HYG-01 (NEW — green baseline on `el-templo-api` test suite; 29 of 30 newly-green failures + 1 deferred BUG-03 (i) RED).
**Success Criteria** (what must be TRUE):

1. **SC#1 — green baseline restored:** `cd el-templo-api && pnpm test --run` exits with `511 passed / 1 failed / 512 total`. The single failure is BUG-03 candidate (i) LIKE-search at `el-templo-bot/src/ai/tools.ts:455`, intentionally deferred per "DEFERRED out of 95-02: (i) LIKE-search ambiguity — does NOT fire in current production data; only synthetic substring-overlap test seed triggers it". Phase 95 owns this RED.

2. **SC#2 — 98-A subscriptions.test.ts (6 failures → green):** replace hard-coded `startDate: "2026-03-01"` + 30-day duration with today-relative date helper. `autoExpireSubscriptions` at `el-templo-api/src/modules/subscriptions/service.ts:775-788` continues to operate correctly (auto-expire is working as designed; tests must give it a future `endDate`).

3. **SC#3 — 98-B ai-tools.test.ts (20 failures → green):** fix cleanup filter `branches WHERE code LIKE 'TST%'` to match actual seeded `code='alem'` (use seed-registry pattern OR explicit `WHERE code IN (...)` enumeration). Update stale assertion `"20 lugares"` → `"cupos disponibles"` matching intentional production wording at `el-templo-bot/src/ai/tools.ts:389`. **Note:** the origin of the wording change is NOT attributed (would be conjecture); treat as intentional prod state.

4. **SC#4 — 98-C webhook.test.ts (3 failures → green):** add OpenAI mock for inbound text path so placeholder `sk-xxxxxxxx` does not 401 on outbound LLM reply. Update image-message test assertion to match current production behavior at `el-templo-bot/src/webhook/handler.ts:323-354` (store + reply, NOT silent drop) — change is anchored to "quick-16 fix 3" per inline comments at `handler.ts:323` + `client.ts:358` (CONFIRMED via independent cross-verification 2026-06-16).

5. **SC#5 — zero production source modifications:** `git diff` shows ZERO changes to `el-templo-api/src/**` AND `el-templo-bot/src/**`. Hard verify-gate per plan-phase.

6. **SC#6 — `pnpm tsc --noEmit` clean** on both `el-templo-api/` and `el-templo-bot/` post-fix.

**Plans:** 1 plan (locked per CONTEXT.md D-11 — single-plan structure with 3 atomic sub-commit chains 98-A → 98-B → 98-C + SUMMARY; mirrors Phase 96.5 atomic cadence)

- [x] 98-01-PLAN.md — **Post-97.5 RETRY** test-hygiene: (Task 1 98-A) cherry-pick commit `95d58f98` from `phase-98-preserve/task-1-green-baseline` for futureDateISO helper + 6 stale subscriptions startDate rewrites; (Task 2 98-B) git-apply `98-TASK-2-WIP.patch` (10 sites: alem→TSTA seed + 3 wording + 3 bookings column renames + 1 subscriptions column rename + Alem/Constitucion address + maps-link short URL + constitucion→TSTC seed) PLUS D-12 check_schedule next-occurrence date fix; (Task 3 98-C) fresh vi.mock for AI provider + echo assertion rewrites + image-test rewrite for post-quick-16-fix-3 store+reply behavior; (Task 4) human-verify checkpoint. Three atomic GREEN commits + SUMMARY; zero production source touches (SC#5 HARD GUARD; 97.5 prod-fix lives in independent commit chain).

**Notes:**

- **Test-infra only.** HARD GUARD: zero production source touches across all plans. Both `el-templo-api/src/**` and `el-templo-bot/src/**` UNCHANGED.
- **BUG-03 (i) stays RED.** The single intentional Phase 95-deferred RED at `tools.ts:455` does NOT get closed in this phase. Phase 98 verifies the 29 OTHER failures green; (i) remains RED via existing deferred-scope marker.
- **Wording-change attribution NOT asserted.** The `"20 lugares"` → `"cupos disponibles"` change in production wording is intentional but the origin (which prior phase rewrote it) is NOT attributed — that would be conjecture. The test is updated to match current intentional production state, period.
- **Image-handler change IS anchored.** The current store + reply behavior in `el-templo-bot/src/webhook/handler.ts:323-354` is traceable to "quick-16 fix 3" per inline comments at `handler.ts:323` + `client.ts:358`. Test gets updated to match the post-quick-16-fix-3 production behavior. Cross-verified by owner 2026-06-16.
- **Phase 97 absorption option.** Phase 97 plan-phase MAY absorb 98-A/B/C into RGUARD-01 scope at discuss-time if coupling proves tight. Default execution path: ship Phase 98 first; Phase 97 builds on the green baseline. The Phase 97 discuss-phase reads the `/gsd-debug` resolved session at `.planning/debug/resolved/api-30-test-failures-triage.md` for evidence-ready ingestion.
- **Out of scope:**
  - Production source fixes — Phase 98 is HARD TEST-INFRA-ONLY. If any failure in 98-A/B/C unexpectedly reveals a production bug at fix time, STOP and re-classify per `/gsd-debug` (a/b/c) framework; do NOT silently absorb.
  - Modifying the wording in `el-templo-bot/src/ai/tools.ts:389` — that's intentional prod state.
  - Closing BUG-03 (i) at `tools.ts:455` — Phase 95 owns the deferred-scope marker.
  - `el-templo-bot/` test suite changes (Phase 96.5 just shipped clean; do not touch).
- **6-pair sha256 invariant UNCHANGED.** Phase 98 modifies zero terms in the canonical block.

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
- **RGUARD-01 prerequisite — flake in `el-templo-api/test/whatsapp/ai-tools-membership-drift.test.ts` (97.5-owned, added by commit `cfb13e2c`) MUST close before RGUARD-01 locks its baseline.** Surfaced during Phase 98 human-verify on 2026-06-17 — see `.planning/phases/98-test-hygiene-98-a-b-c/98-FINDINGS-phase-97-bound.md` for the full report. The file fails non-deterministically (run 1 = 3 failures in this file / 516 passed total; run 2 = clean 519 passed / 1 failed / 520 total; one earlier run saw 24 failures). Vitest is configured with `fileParallelism: false`, so this is NOT a parallelism race — most likely cross-file shared-state leakage on `branches` / `subscriptions` between this file and `ai-tools.test.ts` (incomplete FK-aware truncation in `beforeEach`/`afterEach`). Same family as the carry-forward DEGR-01/LAT-03 flake. **RGUARD-01's purpose is to lock a regression baseline; a non-deterministic test directly undermines that lock.** Suggested fix direction: audit `beforeEach`/`afterEach` cleanup in both files for shared-table reset completeness (FK-aware truncation order; each file's cleanup must delete all rows it could have seeded, not just its own prefixed ones); consider a shared cleanup helper if both files reset the same tables. Type: test-infra / tech-debt. Owner: Phase 97 plan-phase.

## Progress

| Phase                                           | Plans Complete | Status                 | Completed  |
| ----------------------------------------------- | -------------- | ---------------------- | ---------- |
| 93. Handler Concurrency                         | 1/1            | ✅ Complete            | 2026-05-17 |
| 94. OpenAI Latency + Graceful Failure           | 2/2            | Complete               | 2026-05-18 |
| 95. Booking Reliability + Graceful Degradation  | 0/?            | Not started            | -          |
| 96. Context Awareness                           | 0/?            | Not started            | -          |
| 96.5. Date Grounding Fix                        | 1/1            | ✅ Complete            | 2026-06-16 |
| 97.5. Prod-fix: raw-SQL column-name drift sweep | 1/1            | Complete               | 2026-06-17 |
| 98. Test Hygiene (98-A/B/C)                     | 1/1            | Complete               | 2026-06-17 |
| 97. Backlog + Regression Lock                   | 0/?            | ⏸ Blocked on 97.5 + 98 | -          |
| 99. Bot copy and price disclosure fixes         | 0/3            | Planned                | -          |

### Phase 99: Bot copy and price disclosure fixes

**Goal:** Close three live-WhatsApp-test findings against the bot (Mica self-introducing as "Micla"; class named "Sesión Grupal" instead of team-preferred "clases de calistenia"; bot withholds prices indefinitely in PB1 even after sustained insistence). All fixes are bot-side prompt + lightweight Redis-state work; price values stay owned by `subscription_plans.price_regular` (other dev's surface) and the bot reads them dynamically via the existing `check_membership` available-plans branch. Three labeled outcomes per `99-CONTEXT.md` `<requirement_labels>`: COPY-01 (Mica name reinforcement), COPY-02 (class-name rename + 5 preservation strings intact), PRICE-01/02/03/04 (per-PB1-session price-insistence counter + threshold-based disclosure addendum + PB2.E2 placeholder verification + integration tests). Local-merge only to `feature/whatsapp-bot-scaffold` — no push, no master, no deploy.
**Requirements**: COPY-01, COPY-02, PRICE-01, PRICE-02, PRICE-03, PRICE-04 (internal labels per `99-CONTEXT.md`; not registered in REQUIREMENTS.md by design — Phase 99 was dictated under locked-scope mode)
**Depends on:** Phase 98 (shipped — green API test baseline anchors the integration-test work)
**Plans:** 3 plans

Plans:

- [x] 99-01-PLAN.md — Copy fixes (COPY-01 Mica name reinforcement + COPY-02 class-name rename) — Wave 1 ✅ shipped 2026-06-23. KGATE-05 cap overage (rendered 19181 > 18916) caught by Task 3 HALT; resolved via user-authorized Option A 3-phase trim (Mica self-correction sentence + knowledge.ts:548 tail/rephrase + 4 micro-trims). Final rendered 18910 (6 under cap). `POST_RLOK_04_BYTES` bumped 18884 → 18910. 4 snap-consuming test files green (59/59). See [99-01-SUMMARY.md](phases/99-bot-copy-and-price-disclosure-fixes/99-01-SUMMARY.md) §HALT Resolution.
- [x] 99-02-PLAN.md — Price-insistence counter + threshold-based disclosure unlock + PB2.E2 placeholder verify-then-fix + check_membership lead-handling fix (PRICE-01 + PRICE-02 + PRICE-03) — Wave 2 ✅ shipped 2026-06-23. 4 commits (`67f9da72` constants/types + `6b567e57` counter wiring + `1ec726d6` addendum + handler flag + PB2.E2 rewrite + `tools.ts` Piece D / + `bbdfcd2c` SUMMARY). `PB1_PRICE_INSISTENCE_THRESHOLD = 2` (env-overridable) lives in `el-templo-bot/src/playbooks/constants.ts`. `priceInsistenceCount?: number` optional field on `PlaybookSessionState`. Single regex literal in `handler.ts` (`detectPriceObjection`) — no parallel regex. Counter increments AT MOST ONCE per inbound; resets on PB1→non-PB1 transition. Piece D: `formatAvailablePlans()` helper in `tools.ts` shared by both `users.length === 0` lead branch (appends to preserved "No encontré una cuenta" prefix) AND existing `subs.length === 0` registered-user-no-sub branch (DRY). Addendum gating verified empirically — PB1.E1A lead render still 18910 bytes WITHOUT addendum (matches `POST_RLOK_04_BYTES`); WITH `disclosureUnlocked=true` it grows to 19798 bytes which is correctly out of the snap path. PB1.E4 REGLA FUERTE byte-equal preserved (Sub-option A). 4 snap-consuming test files green (59/59). Zero `el-templo-api/**` changes. See [99-02-SUMMARY.md](phases/99-bot-copy-and-price-disclosure-fixes/99-02-SUMMARY.md).
- [ ] 99-03-PLAN.md — Integration test coverage in `el-templo-api/test/whatsapp/` (PRICE-04 + COPY-01/02 source-text regression locks + no-hardcoded-prices guard) — Wave 3, depends on 99-01 and 99-02

**Notes:**

- **Scope fence (HARD):** runtime code edits only in `el-templo-bot`; tests only in `el-templo-api/test/whatsapp/`. ZERO modifications to `el-templo-api/src/**` — that surface is owned by another developer per `project_bot_scope_boundary` memory.
- **No hardcoded prices anywhere in bot copy/prompts/playbooks.** PRICE-04 ships a negative-grep test (`\$\s*\d{4,}` pattern across `el-templo-bot/src/{ai,playbooks,webhook}/**`) with a single explicit allowlist entry for the pre-existing `$20,000` single-class drop-in reference at `system-prompt.ts:321` (single-class price, NOT a plan price; not modified by Phase 99).
- **Sub-option A locked for PRICE-02:** PB1.E4 `REGLA FUERTE` at `definitions.ts:74` stays byte-for-byte unchanged. The disclosure unlock is purely additive in `system-prompt.ts` — a new `PB1_PRICE_DISCLOSURE_UNLOCKED_ADDENDUM` module-level const + a conditional injection gated on `options.disclosureUnlocked && options.activePlaybook === "PB1"`. Sub-option B (template engine) explicitly rejected per CONTEXT.md (no template syntax exists in the playbook prompt assembly path; introducing one for this case would be over-engineering).
- **PRICE-03 is verify-first-then-fix.** The `[plan_básico]` / `[precio]` tokens in `definitions.ts:138` PB2.E2 are LITERAL TEXT in the string (no template-substitution layer between `definitions.ts` and the LLM call — confirmed by reading `system-prompt.ts:404-405`). Plan 99-02 Task 3 investigates whether the LLM substitutes from `check_membership` output (acceptable) or fabricates `[plan_básico]` literal text to the user (broken). The fix branch is **script rewrite** (instruct the LLM to call `check_membership` first and read values from the tool result) — NOT a template engine introduction (Deferred Idea per CONTEXT.md).
- **Counter scope discipline:** per-conversation per-PB1-session, persisted in the existing `wa:playbook:<phone>` Redis hash as a new optional `priceInsistenceCount?: number` field on `PlaybookSessionState` (backward-compat with pre-99 entries per Phase 90/91 precedent). Resets to 0 on transition out of PB1 (post-AI stage-advance write site at `handler.ts:989-1003`). 6h TTL inherited from the playbook-state key. Single tunable constant `PB1_PRICE_INSISTENCE_THRESHOLD = 2` lives in a NEW file `el-templo-bot/src/playbooks/constants.ts` with env override `PB1_PRICE_INSISTENCE_THRESHOLD` documented in `.env.example`.
- **Threat model:** prompt-injection counter-priming (mitigated — counter increments at most once per inbound because `priceObjection` is a per-message boolean), state persistence abuse (mitigated — counter resets on PB1 transition + 6h TTL bounds priming), race condition (mitigated — Phase 93 SETNX/dead-man-switch protects handler entry, counter inherits). See per-plan `<threat_model>` blocks.
- **No `el-templo-api/src/**`changes — HARD GUARD verified by`git diff` in plan 99-02's verify gates and re-verified in plan 99-03 (test-only).
- **The Phase 98 SC#5 invariant** ("ZERO production source modifications in test-only plans") is preserved by plan 99-03 (tests-only).

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
