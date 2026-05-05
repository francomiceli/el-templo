# Requirements: El Templo — v5.3.3 Post-v5.3.2 Live Test Fixes

**Defined:** 2026-05-05
**Core Value:** Prospective and current members get instant, accurate answers about El Templo via WhatsApp — and leads are profiled through natural discovery so Mica makes ONE targeted recommendation per conversation, with prices, method, and objections handled per the team's playbook (not improvised).

## Source Evidence

All requirements derived from the post-v5.3.2 live test backlog (`/Users/bores/el-templo/contexto/backlog-post-v532`) — 7 issues (5 BUGs + 2 BACKLOG items) surfaced after v5.3.2 shipped on 2026-04-16. BUG-02 root cause additionally confirmed via `/gsd:debug` session 2026-05-05 (`.planning/debug/bot-3min-response-latency.md`). Phase ordering and pairing decisions captured in `.planning/v5.3.3-prework-notes.md`.

## v1 Requirements (v5.3.3 scope)

### Handler Concurrency (Phase 93)

<!-- Phase 93 — eliminate duplicate-response race condition on rapid-fire user messages -->

- [ ] **CONC-01**: When the user sends multiple messages in rapid succession (faster than the bot's response cycle), the bot generates exactly ONE response, not duplicates. Implementation: debounce or Redis lock per phone number with short TTL in `el-templo-bot/src/webhook/handler.ts` at the `processWithAi` entry. Existing 3s debounce + Redis dead-man switch (DEBOUNCE_DELAY_MS=3000, DEBOUNCE_TTL_SECONDS=10) is the starting point — investigate whether mechanism is already correct and the bug is elsewhere, vs. mechanism failing under specific timing.

### OpenAI Latency + Graceful Failure (Phase 94)

<!-- Phase 94 — bound OpenAI calls, communicate progress to user, fail gracefully. Root cause confirmed in debug session: new OpenAI() with no timeout option (default 600s) + unbounded await provider.chat() in handler. -->

- [ ] **LAT-01**: OpenAI client constructed with explicit `timeout` option in `el-templo-bot/src/ai/openai.ts:29` — default `45_000` ms (45s), env-overridable via `OPENAI_TIMEOUT_MS`. `.env.example` updated. SDK no longer falls back to its 600s (10min) default.
- [ ] **LAT-02**: When the OpenAI call exceeds the timeout (or throws `OpenAI.APIError` for any other reason), the handler sends an interim UX message to the user (e.g., "Dame un segundo 🙌") rather than hanging silently. Wraps `provider.chat(...)` await sites at `handler.ts:584` and `handler.ts:641`.
- [ ] **LAT-03**: If the retry/fallback also fails (e.g., upstream is durably down), the handler sends a graceful-fallback message and returns cleanly — does not infinite-loop, does not silently hang, does not crash the bot process. The existing outer `try/catch` at `handler.ts:323` only logs today; surfacing to the user is the new requirement.

### Booking Reliability + Graceful Degradation (Phase 95, paired)

<!-- Phase 95 — fix BUG-03 (booking root cause) and BUG-05 (apology-loop safety net) together. BUG-05 is the safety net for when BUG-03 still fails. -->

- [ ] **BOOK-01**: Class search returns consistent results across all El Templo venues (the booking tool can locate available classes regardless of which branch the user mentions). User can complete a booking without the bot looping on "no encontré clases disponibles" when classes do exist.
- [ ] **DEGR-01**: When tool calls fail repeatedly (transient errors, missing data, 5xx from localhost API), the bot does NOT enter an apology loop. Implementation: retry counter + escalate via `request_human` after 2 failed attempts. Specifically targets tool-failure failure modes, not user-rejection patterns.
- [ ] **DEGR-02**: SC#3 invariant preserved — the no-escalation rule from v5.3.2 (Phase 91 OBJN-01/02) applies to **soft rejections ONLY**, NOT to tool failures. DEGR-01's escalation triggers on tool failures; soft rejections continue to follow the WHY/BACK-OFF Spanish framing locked in `system-prompt.ts`. Both rules wired without conflation. Guardrail against RLOK-03 regression.

### Context Awareness (Phase 96)

<!-- Phase 96 — bot must reference data the user has already provided in the conversation -->

- [ ] **CTXT-01**: When the user has provided structured profile data earlier in the conversation (full name, contact info, preferences, etc.), the bot does NOT re-ask for the same data. Specific live-test failure: user said "Ignacio Bordon" then bot re-asked for full name two turns later.
- [ ] **CTXT-02**: Profile extraction layer (or system-prompt rules) ensures persisted `<profile>` data is referenced by the model rather than rediscovered. Choice between (a) prompt-level rule reminding the model to consult known profile fields, (b) extraction-layer fix that surfaces profile data more prominently, or (c) hybrid — deferred to phase plan.

### Backlog + Regression Lock (Phase 97)

<!-- Phase 97 — close the two low-priority items, lock all v5.3.3 fixes against future regression, mirror Phase 92 shape -->

- [ ] **ELEV-01**: The elevator pitch consistently includes all three team hooks ("método internacional", "cuatro niveles simultáneos", "sin salirte del grupo"). The third hook ("sin salirte del grupo") was occasionally missing in post-v5.3.2 live test. Non-deterministic regression strategy required (see VOSEO-01 testing options).
- [ ] **VOSEO-01**: Bot uses Argentine voseo consistently. Specific failure: bot occasionally produced "tienes" (Castilian) instead of "tenés" (rioplatense voseo) in live test. **Testing strategy is non-deterministic** — snapshot tests will NOT catch model variance. Decide at phase plan time between: (a) multi-run sampling with statistical threshold (e.g., N=20 runs, voseo appears in ≥18), or (b) accept-list of valid forms (both "tenés" and "tienes" PASS, only fail on neither). Tradeoff: CI cost vs signal strength.
- [ ] **RGUARD-01**: New behavioural-integration assertions exist for every v5.3.3 fix — CONC-01, LAT-01..03, BOOK-01, DEGR-01..02, CTXT-01..02 — added to a milestone-scoped suite (likely `el-templo-bot/test/v5-3-3-regression.test.ts` mirroring v5.3.2's pattern). All passing.
- [ ] **RGUARD-02**: Full bot test suite passes with zero regressions in v5.3.2 RLOK-01..04 + v5.3.1 KGATE/BPASS/METHOD/QREG behavior. Specifically: SC#3 (no-escalation for soft rejections) still holds; KGATE-05 dual-threshold still passes; PB1.E1A snapshot tripwire still holds.
- [ ] **RGUARD-03**: Extend timeout pattern (LAT-01) to localhost API calls inside `executeTool` — bonus finding from BUG-02 debug session (same unbounded-await problem likely affects tool execution, not just `provider.chat`). Implementation may be a single shared timeout helper.

## Out of Scope

| Feature                                                                                                                 | Reason                                                                                                                                                                                                  |
| ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Production deployment (EC2 + permanent Meta tokens + production phone number + Meta Business verification + monitoring) | v5.4.0 territory — see `.planning/MACRO-ROADMAP.md`. v5.3.3 stays in dev with ngrok + Meta test number.                                                                                                 |
| Bot ↔ CRM durable conversation persistence (MySQL/Postgres transcripts)                                                 | Decision deferred — v5.4.0 owns it (default lean) OR Kero phase 1 owns it. NOT v5.3.3 scope regardless.                                                                                                 |
| State-machine redesign / model-driven stage detector                                                                    | Reserved for v5.4+ per v5.3.2 decision. v5.3.3 is targeted bug fixes, not architectural change.                                                                                                         |
| New playbooks (PB6 onboarding, others)                                                                                  | Carries forward v5.3.2 boundary — v5.3.3 only touches PB1 + handler/infrastructure layers.                                                                                                              |
| BullMQ / RabbitMQ / external message queue for handler concurrency                                                      | Over-engineered at ~100 convs/day. CONC-01 fixed at the debounce/Redis-lock layer, not by introducing a queue.                                                                                          |
| Replacing Pino with structured external sink in dev                                                                     | v5.4.0 concern. v5.3.3 lives with stdout-only logs (per BUG-02 "logs are gone" experience — can't repeat the latency forensic chase, but ALSO won't repeat in prod once v5.4.0 ships file/sink output). |
| Refactoring `executeTool` beyond timeout addition                                                                       | RGUARD-03 adds the timeout pattern. Larger executeTool refactor (parallelization, retry semantics, etc.) is out of scope.                                                                               |
| Additional WhatsApp Cloud API features (templates, status updates, ad-hoc media)                                        | Not relevant to the live-test failure modes being closed.                                                                                                                                               |

## Traceability

| Requirement | Phase | Status  |
| ----------- | ----- | ------- |
| CONC-01     | 93    | Pending |
| LAT-01      | 94    | Pending |
| LAT-02      | 94    | Pending |
| LAT-03      | 94    | Pending |
| BOOK-01     | 95    | Pending |
| DEGR-01     | 95    | Pending |
| DEGR-02     | 95    | Pending |
| CTXT-01     | 96    | Pending |
| CTXT-02     | 96    | Pending |
| ELEV-01     | 97    | Pending |
| VOSEO-01    | 97    | Pending |
| RGUARD-01   | 97    | Pending |
| RGUARD-02   | 97    | Pending |
| RGUARD-03   | 97    | Pending |

**Coverage:**

- v5.3.3 requirements: 14 total
- Mapped to phases: 14/14
- Unmapped: 0 ✓

---

_Requirements defined: 2026-05-05_
_Last updated: 2026-05-05 after v5.3.3 scoping_
