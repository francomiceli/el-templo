---
phase: 91-pb1-objection-handling
plan: 01
subsystem: el-templo-bot/playbooks
tags:
  [
    playbook,
    pb1,
    objection-handling,
    discovery,
    soft-rejection,
    framing-rule,
    hybrid-mechanism,
    state-machine,
  ]
requires:
  - phase: 89-knowledge-fixes
    provides: "Defense-in-depth pattern (KFIX-01 + price-deferral): structural detection + behavioral prompt rule, conditionally active. Phase 91 mirrors this pattern for soft-rejection."
  - phase: 90-stage-heuristic-tightening
    provides: "STAGE-02 turn-count gate semantics + discoveryTurnCount optional-field rollout pattern + 18,291-byte snapshot baseline + KGATE-05 +625 char headroom that Phase 91 must preserve."
provides:
  - "softRejection signal in computeAdvanceSignals (single source of truth in detectSoftRejection helper)"
  - "AdvanceSignals.softRejection optional field + 5-stage allowlist guard in advanceStageIfComplete PB1 branch"
  - "PlaybookSessionState.whyAsked optional field (backward-compat, mirrors discoveryTurnCount)"
  - "SOFT_REJECTION_WHY_RULE + SOFT_REJECTION_BACKOFF_RULE Spanish constants in system-prompt.ts"
  - "SystemPromptOptions.softRejectionRule conditional injection (no baseline snapshot impact)"
  - "Hybrid mechanism: signal layer (computeAdvanceSignals) + behavioral layer (system-prompt.ts) wired in handler.ts pre-AI"
  - "Pino log.info 'soft_rejection_detected' telemetry with stage/phone/whyAsked/inboundExcerpt payload"
  - "Phase 90 STAGE-02 invariant preserved — softRejection turns do NOT increment discoveryTurnCount"
affects:
  - el-templo-bot/src/webhook/handler.ts
  - el-templo-bot/src/playbooks/advance.ts
  - el-templo-bot/src/playbooks/types.ts
  - el-templo-bot/src/memory/playbook-state.ts
  - el-templo-bot/src/ai/system-prompt.ts
  - el-templo-bot/test/playbook-advance.test.ts
  - el-templo-bot/test/playbook-flow-coverage.test.ts
  - el-templo-bot/test/system-prompt-playbook.test.ts
tech-stack:
  added: []
  patterns:
    - "Hybrid signal+framing mechanism (defense-in-depth) — structural gate in advance.ts + conditional prompt rule in system-prompt.ts, both active"
    - "Single-source-of-truth regex helper (detectSoftRejection) called from both pre-AI rule selector and post-AI signals layer"
    - "Stage allowlist (NOT negative listing) — explicit 5-stage membership check encoded twice (handler + advance.ts) to surface scope creep at review time"
    - "Conditional prompt injection at end of getSystemPrompt() — appended LAST so rejection arc takes priority over conflicting stage promptSection rules"
    - "Pre-AI state machine: rejectionHotPre + priorWhyAskedPre + softRejectionRule selector computed BEFORE the AI call so the framing rule reaches Mica's reply on the rejection turn"
    - "Optional-field schema evolution — whyAsked?: boolean mirrors discoveryTurnCount Phase 90 precedent (absent → false on read)"
    - "Pino log.info for expected behavior tracking (vs log.warn for anomalies — contrast with discovery_escape_fired)"
key-files:
  created:
    - .planning/phases/91-pb1-objection-handling/91-01-SUMMARY.md
  modified:
    - el-templo-bot/src/webhook/handler.ts
    - el-templo-bot/src/playbooks/advance.ts
    - el-templo-bot/src/playbooks/types.ts
    - el-templo-bot/src/memory/playbook-state.ts
    - el-templo-bot/src/ai/system-prompt.ts
    - el-templo-bot/test/playbook-advance.test.ts
    - el-templo-bot/test/playbook-flow-coverage.test.ts
    - el-templo-bot/test/system-prompt-playbook.test.ts
key-decisions:
  - "Hybrid mechanism (OBJN-02 SC#2): conditional branch on existing stage — signal in computeAdvanceSignals + conditional framing rule injected via system-prompt.ts only when softRejectionRule option is set. NOT a new stage, NOT a universal framing rule. Defense-in-depth mirroring Phase 89 KFIX-01 + price-deferral."
  - "Commit cadence: strategy (b) — Task 1 introduces softRejectionRule as an accepted-but-ignored option on getSystemPrompt() (no-op until Task 2 wires the actual injection). Gives clean per-task rollback points; transitional code is one interface field + JSDoc note (no ugly noise)."
  - "Composite-phrase positive test added (orchestrator deviation note 2): 'no, en serio no me interesa' MUST trigger softRejection via the substring \\bno me interesa\\b match. Cheap insurance — 1 extra positive case in the regex matrix."
  - "5-stage allowlist enforced in BOTH advance.ts (engine guard) AND handler.ts (pre-AI rule selector) — explicit allowlist (not negative-listing E4–E7) so adding a future stage is a deliberate inclusion, not an accidental one."
  - "softRejection turns do NOT increment discoveryTurnCount — gated on !rejectionHotPre. Preserves Phase 90 STAGE-02 semantics (worked example from CONTEXT.md: lead replies 'primera vez' (turn 1, count=1), then 'no me interesa' (turn 2, count STAYS 1), then 'no, en serio' (turn 3, count STAYS 1))."
  - "All 4 setPlaybookState writes carry whyAsked — lesson learned from Phase 90's discoveryTurnCount rollout (a single missing write site caused a regression in the field)."
  - "Pino log.info (NOT log.warn) for soft_rejection_detected — softRejection is expected behavior to track statistically, not an anomaly. Contrast: Phase 90's discovery_escape_fired uses log.warn because that hatch is an anomalous escape from a stuck stage."
  - "WHY rule + BACK-OFF rule wording constraints locked at the test level: 4 wording-constraint asserts on WHY (NO precios/planes, NO escales a humano, NO te despidas en este turno, 'no le interesa' rejection phrasings) + 3 on BACK-OFF (NO hagas más preguntas, NO descuentos/alternativas, NO escales a humano)."
patterns-established:
  - "Hybrid signal+framing mechanism (defense-in-depth) is now the established pattern for behavioral fixes that need both structural enforcement and prompt-level guidance — repeatable for future objection-shaped failure modes (PB2 retention, PB3 vencimiento objections, etc.)"
  - "Optional whyAsked?: boolean rollout — third instance of the optional-field schema-evolution pattern (after avatar in Phase 83-02 and discoveryTurnCount in Phase 90); the playbook-state JSDoc now documents three backward-compat fields with the same template"
  - "detectSoftRejection helper as the single regex source — handler computes softRejectionRule pre-AI from the same function that computeAdvanceSignals uses post-AI; future signals can follow the same extracted-helper pattern"
  - "Conditional injection at end of getSystemPrompt() (not in stage promptSection) — preserves snapshot byte-equality and lets the rule override stage rules on the rejection turn without polluting baseline render"
requirements-completed: [OBJN-01, OBJN-02]
duration: 20min
completed: "2026-04-16"
---

# Phase 91 Plan 01: PB1 Objection Handling (v5.3.2 OBJN-01/02) Summary

Hybrid signal+framing mechanism wires a `softRejection` regex (live-test variants `no me interesa` / `no creo` / `no voy a hacerlo` / `me parece que no`) into both `computeAdvanceSignals` (engine-level advance guard, 5-stage discovery allowlist) and `system-prompt.ts` (conditional WHY + BACK-OFF framing rules). Mica now asks an open WHY question on first rejection and backs off gracefully on reconfirm — without ever leaking precios/planes, escalating to human, or breaking REGLA FUERTE at PB1.E4. KGATE-05 +625 char headroom preserved (snapshot byte-delta = 0).

## Performance

- **Duration:** ~20 min (three atomic commits)
- **Started:** 2026-04-16T15:31:54Z
- **Completed:** 2026-04-16T15:51:44Z
- **Tasks:** 3 completed
- **Files modified:** 5 source + 3 test
- **Commits:** 3 (`4773ca48` Task 1, `8e333de9` Task 2, `959d0001` Task 3)

## Mechanism Choice (OBJN-02 SC#2)

**Hybrid mechanism — conditional branch on existing stage.** The implementation is a defense-in-depth pair, mirroring Phase 89's KFIX-01 + price-deferral pattern:

1. **Signal layer** (`webhook/handler.ts::computeAdvanceSignals` + `playbooks/advance.ts::advanceStageIfComplete`): a `softRejection` boolean derived from `detectSoftRejection(inboundText)` flows through `AdvanceSignals`. The PB1 branch of `advanceStageIfComplete` checks it FIRST against an explicit 5-stage allowlist (`PB1.E1A | E1B | E2A | E2B | E3`) and returns `null` (block advance) when both are true.
2. **Behavioral layer** (`ai/system-prompt.ts::getSystemPrompt`): a new optional `softRejectionRule?: "why" | "backoff"` option appends one of two Spanish framing rules at the END of the rendered prompt — only when set. The handler computes the selector pre-AI from `(rejectionHotPre, priorWhyAskedPre)` so the rule reaches Mica's reply on the SAME inbound turn, not the next one.

**Why hybrid, not signal-only:** pure signal blocks advance but lets the model improvise "tomá tu tiempo, saludos" because nothing told it to change reply shape. Live-test 2026-04-16 evidence (Problem 1) confirmed this exact failure mode.

**Why hybrid, not framing-rule-only:** Phase 90 live-test (Problem 3) confirmed the model can ignore prompt rules when other content competes semantically. Need the deterministic structural gate.

**Why conditional injection, not always-on:** the framing rule appears in the prompt only when the signal is hot. Keeps baseline prompt unchanged, avoids rule fatigue, **preserves snapshot delta = 0**.

This is **not** a new stage (would inflate the playbook beyond v5.3 scope) and **not** a universal framing rule (would burn KGATE-05 headroom on every rendered prompt and dilute baseline tone).

## Commit Cadence (Orchestrator Deviation Note 1)

**Strategy (b) chosen.** Task 1 introduces `softRejectionRule?: "why" | "backoff"` as an accepted-but-ignored option on `SystemPromptOptions` (with a transitional JSDoc note marking it a no-op until Task 2). Task 2 then wires the actual injection inside `getSystemPrompt` and removes the transitional note.

**Why (b) over (a):**

- Clean per-task rollback points — Task 1 commit is fully self-contained and revertable; Task 2 commit is a pure prompt-side wiring with no handler churn.
- Transitional code is exactly one interface field + a 3-line JSDoc paragraph (no ugly transitional code).
- Reviewers can read each commit in isolation: Task 1 = signal + state + telemetry; Task 2 = prompt rules + injection; Task 3 = tests.

Strategy (a) would have collapsed Task 1+2 into one larger commit but offered no rollback granularity.

## Composite-Phrase Positive Test (Orchestrator Deviation Note 2)

Added inside `playbook-advance.test.ts::computeAdvanceSignals — softRejection (OBJN-01)` describe block:

```ts
const REJECTIONS = [
  // ... 13 base rejections ...
  "no, en serio no me interesa", // composite per orchestrator note 2
];
```

Confirmed pass at 0ms — the substring `no me interesa` matches via the `(^|[^a-záéíóúñ])(no me interesa)([^a-záéíóúñ]|$)` non-word-boundary regex. Phase 92 (RLOK-01) will also exercise the multi-turn arc with this phrasing under mocked Redis.

## Final Implementation

### Task 1 — Signal layer + state field + handler state machine + telemetry (commit `4773ca48`)

Five source-file edits land together (Task 1 + the system-prompt.ts no-op interface field per Strategy b):

1. **`playbooks/types.ts`:** `PlaybookSessionState.whyAsked?: boolean` added with JSDoc documenting the OBJN-01 reset rule and backward-compat (absent → `false`).
2. **`playbooks/advance.ts`:** `AdvanceSignals.softRejection?: boolean` added with JSDoc; PB1 branch guard is the FIRST check (before `userInsistedDirect`/`directQuestionAsked`) — explicit 5-stage allowlist returns `null` when `softRejection === true && stageId ∈ allowlist`.
3. **`memory/playbook-state.ts`:** schema-evolution JSDoc paragraph appended documenting `whyAsked` backward-compat (mirrors Phase 90 `discoveryTurnCount` template).
4. **`webhook/handler.ts`:**
   - New `detectSoftRejection(inbound: string): boolean` exported helper near `hasMinimumContent` — single source of truth for the regex (called from both pre-AI rule selector and `computeAdvanceSignals`).
   - Pre-AI state machine block at line ~432 computes `inScopeForRejectionPre`, `rejectionHotPre`, `priorWhyAskedPre`, `softRejectionRule` (selector), and `newWhyAsked` (persist value). Logged via Pino `log.info "soft_rejection_detected"` BEFORE the pre-AI Redis write so the event survives Redis failures.
   - All 4 `setPlaybookState` writes carry `whyAsked: newWhyAsked` (pre-AI write at line ~480, avatar-detected write at line ~672, post-AI advance write at line ~770, post-AI turn-count-only write at line ~795).
   - `discoveryTurnCount` increment gated on `!rejectionHotPre` — Phase 90 STAGE-02 invariant preserved.
   - `softRejection` added to `computeAdvanceSignals` return object (line ~1100).
   - `softRejectionRule` passed into `getSystemPrompt({...})` at line ~459 (no-op at this commit; Task 2 wires it).
5. **`ai/system-prompt.ts`:** `SystemPromptOptions.softRejectionRule?: "why" | "backoff"` field added with transitional "no-op until Task 2" JSDoc note (Strategy b — keeps Task 1 typecheck-green).

**Verification:** tsc clean, 537/537 tests green, `wc -c snap.txt` = 18291.

### Task 2 — WHY + BACK-OFF framing rules + conditional injection (commit `8e333de9`)

One-file edit (`ai/system-prompt.ts`):

1. **Two Spanish constants** at module top (after AVATAR_TONE_GUIDES): `SOFT_REJECTION_WHY_RULE` and `SOFT_REJECTION_BACKOFF_RULE`. Style mirrors existing PB1 `*Regla de defer*` / `*REGLA — precios*` blocks — declarative rule + 3 paraphraseable example phrasings (Mica adapts wording per context, NOT a hardcoded reply).

2. **Wording-constraint locks (asserted by Task 3 tests):**
   - WHY rule: `"no le interesa, no cree, o no va a hacerlo"` (mirrors live-test variants), `"NO menciones precios ni planes"` (REGLA FUERTE non-regression), `"NO escales a humano"` (SC#3), `"NO te despidas en este turno"` (SC#1), 3 paraphraseable example WHYs (one per bullet).
   - BACK-OFF rule: `"NO hagas más preguntas"` (no second WHY), `"NO ofrezcas descuentos ni alternativas"` (no PB2 retention slip), `"NO escales a humano"` (SC#3), 3 paraphraseable back-off phrasings.

3. **Conditional injection branch** at end of `getSystemPrompt`, AFTER all other sections so the rejection arc overrides any conflicting stage promptSection rule:

```ts
if (options?.softRejectionRule === "why") {
  sections.push(`\n\n${SOFT_REJECTION_WHY_RULE}`);
} else if (options?.softRejectionRule === "backoff") {
  sections.push(`\n\n${SOFT_REJECTION_BACKOFF_RULE}`);
}
```

4. **Removed Task 1 transitional JSDoc note** from `softRejectionRule` field — now drives actual injection, no longer a no-op.

**Verification:** tsc clean, 537/537 tests green, `wc -c snap.txt` = 18291, baseline render contains zero hits for `REGLA — el lead expresó rechazo`.

### Task 3 — Phase 91 minimal tests (commit `959d0001`)

Three test files extended with 36 new test cases (target ~28 — slightly over due to composite-phrase addition):

1. **`playbook-advance.test.ts`** (+31 tests, new describe `computeAdvanceSignals — softRejection (OBJN-01)`):
   - 14 positive cases (the 13 PLAN required + composite `"no, en serio no me interesa"` per orchestrator note 2). Includes all 4 live-test variants and `paso` standalone.
   - 12 negative cases (no sé / tal vez / lo pienso / no creo que pueda hoy / no puedo el martes / paso por la sede mañana / paso a paso lo voy logrando / etc.).
   - 5 advance-guard tests: PB1.E1A/E2A/E3 return `null` when `softRejection: true`; PB1.E4 INERT (REGLA FUERTE non-regression — `userAccepted: true` still advances to PB1.E5 even when `softRejection: true`); PB2.E1A INERT (out of scope, `discoveryAnswered: true` still routes to PB2.E2).

2. **`playbook-flow-coverage.test.ts`** (+1 test inside `PB1 — discovery flow` describe): multi-turn arc — turn1 substantive (no rejection, STAGE-02 holds at E1A) → turn2 `"no me interesa"` (signal hot, advance blocked) → turn3 `"no, en serio"` (regex-level only, the handler-side rule selector flip to `"backoff"` is tested in Phase 92) → turn4 substantive re-engagement (resets arc).

3. **`system-prompt-playbook.test.ts`** (+4 tests, new describe `OBJN-02 / SC#3: soft-rejection rules respect REGLA FUERTE`):
   - WHY rule contains the 4 wording-constraint literals.
   - BACK-OFF rule contains the 3 wording-constraint literals.
   - Baseline render (no `softRejectionRule`) does NOT contain either rule literal.
   - Snapshot fixture (`pb1-e1a-lead-rendered.snap.txt`) does NOT contain either rule literal — observable proof of KGATE-05 headroom preservation.

**Verification:** tsc clean, 573/573 tests green (537 baseline + 36 new), `wc -c snap.txt` = 18291.

## Measurements

| Metric                                    | Value                          | Notes                                              |
| ----------------------------------------- | ------------------------------ | -------------------------------------------------- |
| Snapshot baseline (Phase 90)              | 18,291 bytes                   | KGATE-05 invariant baseline                        |
| Snapshot post-Phase-91                    | **18,291 bytes**               | **Delta = 0** (locked by Task 3 fixture test)      |
| KGATE-05 headroom                         | **+625 chars (unchanged)**     | Conditional injection — no baseline impact         |
| Test count baseline (Phase 90)            | 537                            | All green                                          |
| Test count post-Phase-91                  | **573** (+36)                  | All green; tsc clean                               |
| Bot test files                            | 25 (unchanged)                 | All 3 modified test files were already in suite    |
| Pino `log.info` "soft_rejection_detected" | `webhook/handler.ts:476` (msg) | Event field at line 470; `log.info` NOT `log.warn` |

## Pino Log Verification

Single greppable log site at `el-templo-bot/src/webhook/handler.ts:468-477`:

```ts
if (rejectionHotPre) {
  log.info(
    {
      event: "soft_rejection_detected",
      stageId: resolved.stageId,
      phone,
      whyAsked: priorWhyAskedPre, // pre-mutation value per CONTEXT.md
      inboundExcerpt: inboundText.slice(0, 120),
    },
    "soft_rejection_detected",
  );
}
```

Payload shape verified against CONTEXT.md spec: `{ stageId, phone, whyAsked (pre-mutation), inboundExcerpt }`. `log.info` chosen (NOT `log.warn`) because softRejection is **expected behavior we want to track statistically** (rejection rates per stage, WHY → re-engage conversion rates), not an anomaly. Contrast with Phase 90's `discovery escape fired` which uses `log.warn` because that hatch is an anomalous escape from a stuck stage.

## Decisions Made

All decisions logged in frontmatter `key-decisions`. Highlights:

- **Mechanism (OBJN-02 SC#2):** hybrid (signal + conditional framing rule) — defense-in-depth, mirrors Phase 89.
- **Commit cadence (orchestrator note 1):** strategy (b) — Task 1 introduces no-op `softRejectionRule` interface field; Task 2 wires actual injection.
- **Composite-phrase test (orchestrator note 2):** added — cheap insurance for the substring-match contract.
- **Allowlist over negative-listing:** explicit 5-stage check encoded in BOTH advance.ts and handler.ts (defense-in-depth at the membership level too).
- **Phase 90 invariant:** softRejection turns do NOT increment discoveryTurnCount (gated on `!rejectionHotPre`).
- **All 4 setPlaybookState writes carry whyAsked:** lesson from Phase 90's discoveryTurnCount rollout.
- **Pino log.info NOT log.warn:** expected behavior, not anomaly.

## Deviations from Plan

**None beyond the two orchestrator-pre-approved deviation notes.** Both were applied as specified:

1. **Commit cadence:** Strategy (b) chosen and applied (Task 1 added `softRejectionRule?` as no-op; Task 2 wired the injection).
2. **Composite-phrase test:** added `"no, en serio no me interesa"` to the positive REJECTIONS array in `playbook-advance.test.ts` — cheap insurance.

## Issues Encountered

None. Plan executed atomically:

- tsc clean after every task.
- All 537 baseline tests green after every task.
- snap.txt remained 18,291 bytes after every task (KGATE-05 invariant locked).
- Lint-staged Prettier formatting passed on every commit.

## Phase 92 (RLOK-01) Handoff Notes

Phase 92 owns the **authoritative regression locks** for OBJN-01. Phase 91 ships only minimal source-state tests (signal + state + wording-constraint locks); Phase 92 should author:

1. **Positive regex matrix** — the same 14 phrases tested at the signal level, but exercised through the full webhook handler with mocked Redis to verify the rule selector fires.
2. **Negative regex matrix** — same 12 hesitation/scheduling phrases but at the handler integration level (no rule injected into the prompt for those turns).
3. **Multi-turn arc with mocked Redis:**
   - Turn 1: substantive → no rule.
   - Turn 2: `"no me interesa"` → WHY rule injected, `whyAsked` persisted to `true`.
   - Turn 3: `"no, en serio"` → BACK-OFF rule injected (because `priorWhyAsked === true` from Redis), even though THIS turn's `softRejection` regex is false.
   - Turn 4: substantive re-engagement → `whyAsked` resets to `false` in Redis, no rule injected.
   - Turn 5 (alt): another rejection later → fresh WHY rule (arc re-opens because turn 4 reset).
4. **System-prompt rule presence/absence per signal state** (currently 4 tests in `system-prompt-playbook.test.ts`; Phase 92 may add the always-`undefined` baseline path for non-PB1 playbooks too).
5. **`request_human` absence:** assert NO `request_human` tool invocation across all turns of the rejection arc (currently locked at the wording level via "NO escales a humano"; Phase 92 should add a behavioral-level assertion if AI provider mocks expose tool calls).
6. **Plan/price absence in WHY-rule output:** assert no plan name (Foundation/Performance/Flex) or price token leaks in Mica's reply when WHY rule is active. Currently locked at the wording level via "NO menciones precios ni planes" in the rule body.
7. **PB1.E4 REGLA FUERTE non-regression at the rendered-prompt level:** if Phase 92 introduces a `pb1-e4-lead-rendered.snap.txt` fixture, assert no plan/price token leaks even when `softRejection: true` is also passed (proves the E4-allowlist guard holds at the prompt assembly level too).

## Next Phase Readiness

- **OBJN-01 + OBJN-02 complete** at the source-state level. Live-test failure mode (no me interesa / creo que no me interesa closing without a WHY) is now structurally impossible during PB1 discovery.
- **PB1.E4 REGLA FUERTE preserved** — `softRejection` inert at E4, locked by allowlist test.
- **Phase 90 STAGE-02 preserved** — `discoveryTurnCount` increment gated on `!rejectionHotPre`.
- **KGATE-05 headroom intact** — 18,291-byte snapshot unchanged, +625 chars of headroom available for Phase 92 RLOK-01 authoring.
- **Ready for `/gsd:plan-phase 92`** — Phase 92 (Regression Lock) authors the integration-level OBJN-01/02 lock matrix using the source-level primitives Phase 91 just shipped.

## Self-Check: PASSED

- [x] el-templo-bot/src/playbooks/types.ts — `whyAsked?: boolean` field present with JSDoc
- [x] el-templo-bot/src/playbooks/advance.ts — `softRejection?: boolean` on AdvanceSignals + 5-stage allowlist guard (3 grep hits)
- [x] el-templo-bot/src/memory/playbook-state.ts — JSDoc paragraph for `whyAsked` backward-compat
- [x] el-templo-bot/src/webhook/handler.ts — `detectSoftRejection` helper + pre-AI state machine + 4 setPlaybookState writes carry `whyAsked` (6 grep hits) + Pino `log.info "soft_rejection_detected"` (2 grep hits — event + msg)
- [x] el-templo-bot/src/ai/system-prompt.ts — `SOFT_REJECTION_WHY_RULE` (3 grep hits) + `SOFT_REJECTION_BACKOFF_RULE` (3 grep hits) + conditional injection branch (5 `softRejectionRule` hits)
- [x] el-templo-bot/test/playbook-advance.test.ts — OBJN-01 describe block with 31 tests
- [x] el-templo-bot/test/playbook-flow-coverage.test.ts — multi-turn arc test (1 test)
- [x] el-templo-bot/test/system-prompt-playbook.test.ts — SC#3 wording-constraint locks (4 tests)
- [x] Snapshot fixture: `wc -c pb1-e1a-lead-rendered.snap.txt` = **18291** (KGATE-05 invariant)
- [x] Baseline render: 0 hits for `REGLA — el lead expresó rechazo` in fixture
- [x] Baseline render: 0 hits for `REGLA — back-off después de la WHY` in fixture
- [x] Test suite: **573/573 passing** (537 baseline + 36 new)
- [x] tsc --noEmit: clean
- [x] Commits exist: `4773ca48` (Task 1), `8e333de9` (Task 2), `959d0001` (Task 3) — all visible in `git log --oneline`

---

_Phase: 91-pb1-objection-handling_
_Completed: 2026-04-16_
