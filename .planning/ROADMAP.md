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
- 🚧 **v5.3.2 Post-v5.3.1 Live Test Fixes** — Phases 89-92 (in progress)

---

## 🚧 v5.3.2 Post-v5.3.1 Live Test Fixes (In Progress)

**Milestone Goal:** Fix four behavioral problems surfaced by the first post-v5.3.1 live conversation — price leakage during discovery, overly permissive stage advancement, unused method elevator, and missing PB1 objection handling — with targeted low-risk changes (no state-machine redesign, no new playbooks, no model-driven detector).

**Target ship:** TBD (1-2 sessions, tactical scope)

### Phases

- [x] **Phase 89: Knowledge Fixes** — Remove prices from PB1 lead prompt, restore method elevator reach, expose Boarding Pass dual-benefit (completed 2026-04-14)
- [x] **Phase 90: Stage Heuristic Tightening** — `hasStageSpecificContent` and `completionCriteria` for PB1.E1A require multi-signal evidence, not single-keyword (completed 2026-04-14)
- [x] **Phase 91: PB1 Objection Handling** — Hybrid signal+framing mechanism: softRejection regex (4 live-test variants) + WHY/BACK-OFF conditional Spanish framing rules in system-prompt.ts; PB1.E4 REGLA FUERTE preserved (completed 2026-04-16)
- [x] **Phase 92: Regression Lock + Live Test Validation** — New assertions for every fix, full suite green, guided live conversation confirms behavior in practice (completed 2026-04-17)

## Phase Details

### Phase 89: Knowledge Fixes

**Goal**: PB1 lead prompt no longer leaks membership plan prices during discovery, the method elevator pitch is actually reachable when leads ask "qué es el templo/método?", and the canonical Boarding Pass surfaces both benefits clearly.
**Depends on**: Nothing (first phase of v5.3.2; layers on the v5.3.1 state-gated knowledge architecture)
**Requirements**: KFIX-01, KFIX-02, KFIX-03, KFIX-04
**Success Criteria** (what must be TRUE):

1. The rendered PB1.E1A lead prompt contains zero membership plan price numbers (Flex/Foundation/Foundation+/Performance monthly prices). Trial class nominal price ($20,000) remains as the Boarding Pass benefit anchor.
2. The "Planes y Precios" section is no longer present in the rendered PB1 lead prompt (its `discovery` tag has been removed, so it filters out for leads).
3. When a PB1 lead asks "¿qué es el templo?" or "¿qué método usan?", Mica's response uses at least two of the three team hooks ("método internacional", "cuatro niveles simultáneos", "no salirse del grupo").
4. When a PB1 lead asks about the Boarding Pass, Mica's reply names BOTH benefits — the free first trial class AND the discounted first membership (precios Zero) — not just one.

**Plans:** 1/1 plans complete

- [ ] 89-01-PLAN.md — Apply four knowledge fixes + price-deferral framing rule in a single atomic task-set (with user review gate for the three draft wordings), regenerate PB1.E1A snapshot

**Notes:**

- KGATE-05 budget: this phase is NET-FREES headroom by removing "Planes y Precios" from the lead-gated set. Subsequent phases (90, 91) should note any budget consumption.
- The PB1.E1A snapshot fixture (`el-templo-bot/test/fixtures/pb1-e1a-lead-rendered.snap.txt`) will intentionally regenerate after this phase per the v5.3.1 update discipline. This regeneration is expected behavior, not a regression — the regenerated fixture must be committed in the same PR.

### Phase 90: Stage Heuristic Tightening

**Goal**: PB1.E1A no longer advances to E2A on a single-keyword answer; the heuristic and `completionCriteria` align with the promptSection's "idealmente 2-3 preguntas" intent.
**Depends on**: Phase 89 (stage-completion changes layer on top of the prompt no longer carrying prices, so combined behavior is testable in the right order)
**Requirements**: STAGE-01, STAGE-02
**Success Criteria** (what must be TRUE):

1. When a PB1.E1A lead replies with a single-word/single-keyword answer (e.g., "primera vez"), `hasStageSpecificContent` returns `false` and the conversation stays in E1A — Mica continues asking discovery questions.
2. PB1.E1A advancement to E2A requires more than one signal (multi-keyword combination, or a minimum user-turn count, or a multi-signal gate — exact mechanism decided in plan).
3. The change is scoped to the existing heuristic — no model-driven detector, no playbook restructure, no new stages.

**Plans:** 1/1 plans complete

- [ ] 90-01-PLAN.md — Category-diversity content gate (STAGE-01) + AND turn-count composition (STAGE-02) + escape hatch + completionCriteria rewrite, single atomic commit

### Phase 91: PB1 Objection Handling

**Goal**: When a lead signals rejection during discovery, Mica asks WHY before closing the conversation instead of defaulting to "tomá tu tiempo, saludos". PB1 carries an explicit instruction for this case.
**Depends on**: Phase 90 (objection-handling design may interact with stage completion logic — e.g., a rejection signal could be an additional gate)
**Requirements**: OBJN-01, OBJN-02
**Success Criteria** (what must be TRUE):

1. When a PB1 lead says "no me interesa" / "no creo" / "no voy a hacerlo" during discovery, Mica's next reply asks an open WHY question (curious, non-defensive) before any closing phrase.
2. PB1 contains an explicit instruction for the "lead rejects during discovery" case — implemented as either a new stage (e.g., PB1.E_objection), a conditional branch on an existing stage, or a universal framing rule in `system-prompt.ts`. The chosen mechanism is documented in the plan SUMMARY.
3. Mica's WHY-question reply does NOT regress the PB1.E4 REGLA FUERTE (no specific plan or price mentioned) and does NOT escalate to `request_human` for a soft objection.

**Plans:** 1/1 plans complete

- [x] 91-01-PLAN.md — Hybrid signal+framing mechanism: softRejection regex (4 live-test variants + composite) + 5-stage allowlist guard in advance.ts + WHY/BACK-OFF conditional Spanish framing rules in system-prompt.ts + Pino telemetry; 3 atomic commits, KGATE-05 headroom +625 preserved

### Phase 92: Regression Lock + Live Test Validation

**Goal**: Every fix from phases 89-91 is locked with targeted assertions; the full bot test suite remains green with zero regressions to QT11-18 fixes and v5.3.1 state-gating/prompt-size behavior; a guided live-test conversation confirms the four success criteria in practice. RLOK-04 (added during discuss-phase) closes the empirical $80k SALES_TECHNIQUES leak surfaced by the post-Phase-91 live test.
**Depends on**: Phases 89, 90, 91 (regression lock validates combined output of all fixes)
**Requirements**: RLOK-01, RLOK-02, RLOK-03, RLOK-04
**Success Criteria** (what must be TRUE):

1. Targeted assertions exist (and pass) for each of KFIX-01, KFIX-02, KFIX-03, KFIX-04, STAGE-01, STAGE-02, OBJN-01 — added to the existing bot test suite (in the new `v5-3-2-regression.test.ts` file per CONTEXT.md).
2. Full bot test suite (`pnpm test` in `el-templo-bot/`) passes with zero regressions in QT11-18 fixes and v5.3.1 state-gating / prompt-size behavior. The PB1.E1A snapshot fixture is regenerated by Phase 92 (RLOK-04 changes one source line in SALES_TECHNIQUES, so snapshot will shift) and committed alongside the fix as a single atomic commit per Phase 89 precedent.
3. A guided live-test conversation (5-10 turns covering price-during-discovery, method question, discovery rejection, Boarding Pass explanation) confirms all four success criteria sets in practice — documented as inline transcript in the phase SUMMARY (per-path verdicts + ≤2 retries + 3rd-fail → Phase 92.1 gap-closure).
4. **RLOK-04**: SALES_TECHNIQUES rhetorical example no longer contains the literal `$80,000` (or any `$\d+` pattern that the model could parse as a plan price). Replacement uses non-numeric prose like "desde el plan más accesible".

**Plans:** 2/2 plans complete

- [x] 92-01-PLAN.md — Source change (RLOK-04 SALES_TECHNIQUES rewrite) + behavioural assertions in new v5-3-2-regression.test.ts (RLOK-01) + suite-green + snapshot regen (RLOK-02). Single atomic commit per Phase 89 precedent. ✅ Completed 2026-04-16 (commit 8be1114b; 602/602 bot tests passing + 4 RLOK-03 it.skip; snap 18,291 → 18,484 bytes; 3 auto-fix deviations documented in 92-01-SUMMARY.md)
- [x] 92-02-PLAN.md — Guided live-test execution (RLOK-03). 4-path script (price-during-discovery, method question, rejection arc, Boarding Pass) → user copy-pastes into WhatsApp → Claude annotates pass/fail → transcript folded inline into 92-02-SUMMARY.md. ≤2 retries per path; 3rd same-path failure → Phase 92.1 gap-closure. ✅ Completed 2026-04-16 (all 4 paths PASS; side commit 0a5b637e strengthened price-deferral rule mid-test; snap regen 18,275 → 18,370 JS-chars; 4 × it.skip → it() with verdict references; 606/606 passing + 0 skipped; v5.3.2 milestone live-confirmed)

**Notes:**

- This is the only test-only phase of v5.3.2 (parallel to Phase 88 in v5.3.1) — but with one source change (RLOK-04) added during discuss-phase to close the empirical $80k leak.
- KGATE-05 dual-threshold (≥20% rendered AND ≥35% knowledge block) MUST still pass after Phase 89's net-positive headroom shift.

## Progress

| Phase                                      | Milestone | Plans Complete | Status     | Completed |
| ------------------------------------------ | --------- | -------------- | ---------- | --------- |
| 89. Knowledge Fixes                        | 1/1       | Complete       | 2026-04-14 | -         |
| 90. Stage Heuristic Tightening             | 1/1       | Complete       | 2026-04-15 | -         |
| 91. PB1 Objection Handling                 | 1/1       | Complete       | 2026-04-16 | -         |
| 92. Regression Lock + Live Test Validation | 2/2       | Complete       | 2026-04-17 | -         |

---

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
