---
phase: 91-pb1-objection-handling
verified: 2026-04-15T13:05:00Z
status: passed
score: 13/13 must-haves verified
re_verification: false
gaps: []
human_verification:
  - test: "Send 'no me interesa' to Mica on a live PB1.E1A conversation"
    expected: "Mica replies with a curious open WHY question, no farewell, no prices/plans mentioned"
    why_human: "End-to-end behavioral validation of LLM output cannot be asserted purely at the prompt/signal level; Phase 92 RLOK-03 is the formal live-test gate"
---

# Phase 91: PB1 Objection Handling Verification Report

**Phase Goal:** When a lead signals rejection during discovery, Mica asks WHY before closing the conversation instead of defaulting to "toma tu tiempo, saludos". PB1 carries an explicit instruction for this case.
**Verified:** 2026-04-15T13:05:00Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                                                                                                                        | Status                                | Evidence                                                                                                                                                                                                                                         |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| 1   | Soft-rejection phrases trigger `softRejection=true` and the rendered prompt carries a WHY-question framing rule for in-scope discovery stages                                                | VERIFIED                              | `detectSoftRejection` in handler.ts lines 1013-1071; 14 positive test cases in `playbook-advance.test.ts` (including 4 live-test variants); `softRejectionRule:"why"` path wired in `getSystemPrompt`; 573/573 tests green                       |
| 2   | Second consecutive rejection (whyAsked=true) renders BACK-OFF rule, not a second WHY                                                                                                         | VERIFIED                              | Pre-AI state machine in handler.ts lines 451-455: `priorWhyAskedPre ? "backoff" : "why"`; `SOFT_REJECTION_BACKOFF_RULE` constant + injection branch in system-prompt.ts; BACK-OFF test in `system-prompt-playbook.test.ts`                       |
| 3   | Hesitation/scheduling phrases do NOT trigger `softRejection`                                                                                                                                 | VERIFIED                              | 12 negative test cases in `playbook-advance.test.ts` covering "no se", "tal vez", "lo pienso", "dejame pensarlo", "no creo que pueda hoy", "no puedo el martes", "paso por la sede manana", "paso a paso" etc — all return `softRejection` falsy |
| 4   | `softRejection` blocks stage advancement for 5 discovery stages; E4 is inert                                                                                                                 | VERIFIED                              | 5-stage allowlist in advance.ts lines 115-123 (PB1.E1A/E1B/E2A/E2B/E3); E4 INERT test (`softRejection:true + userAccepted:true` → PB1.E5); PB2 INERT test                                                                                        |
| 5   | `SOFT_REJECTION_WHY_RULE` and `SOFT_REJECTION_BACKOFF_RULE` constants exist and are conditionally injected only when `softRejectionRule` option is set                                       | VERIFIED                              | Both constants in system-prompt.ts; conditional injection at end of `getSystemPrompt` (lines 352-356); baseline render test asserts neither rule appears without the option                                                                      |
| 6   | `getSystemPrompt` accepts new optional `softRejectionRule?: "why"                                                                                                                            | "backoff"` param; backward-compatible | VERIFIED                                                                                                                                                                                                                                         | `SystemPromptOptions.softRejectionRule?` field in system-prompt.ts lines 44-45; all existing tests remain green |
| 7   | SUMMARY.md documents the chosen mechanism per OBJN-02 SC#2                                                                                                                                   | VERIFIED                              | 91-01-SUMMARY.md Section "Mechanism Choice (OBJN-02 SC#2)" documents hybrid mechanism (signal layer + conditional framing rule); frontmatter `key-decisions[0]` records the same                                                                 |
| 8   | Snapshot byte count = 18,291 (KGATE-05 invariant, delta=0)                                                                                                                                   | VERIFIED                              | `wc -c pb1-e1a-lead-rendered.snap.txt` = 18291; fixture test in system-prompt-playbook.test.ts asserts neither rule literal appears in the snapshot                                                                                              |
| 9   | `whyAsked?: boolean` field present in `PlaybookSessionState` with JSDoc; `playbook-state.ts` JSDoc updated                                                                                   | VERIFIED                              | types.ts lines 97-108: optional `whyAsked?: boolean` with full OBJN-01 JSDoc; playbook-state.ts lines 32-35: backward-compat paragraph for whyAsked                                                                                              |
| 10  | All 4 `setPlaybookState` writes carry `whyAsked: newWhyAsked`                                                                                                                                | VERIFIED                              | Grep confirms 4 write sites in handler.ts: pre-AI write (line ~490), avatar-detected write (line ~690), post-AI advance write (line ~790), post-AI turn-count-only write (line ~816) — all pass `whyAsked: newWhyAsked`                          |
| 11  | `softRejection` turns do NOT increment `discoveryTurnCount`                                                                                                                                  | VERIFIED                              | handler.ts lines 728-730: `inDiscoveryE1 && isSubstantiveTurn && !rejectionHotPre`; multi-turn arc test in `playbook-flow-coverage.test.ts` confirms count stays at 1 across turns 2 and 3                                                       |
| 12  | Pino `log.info` (NOT `log.warn`) emits `"soft_rejection_detected"` with correct payload                                                                                                      | VERIFIED                              | handler.ts lines 467-477: `log.info({ event: "soft_rejection_detected", stageId, phone, whyAsked: priorWhyAskedPre, inboundExcerpt }, "soft_rejection_detected")`; single grep site                                                              |
| 13  | WHY rule wording-constraint locks: NO precios/planes, NO escales a humano, NO te despidas en este turno; BACK-OFF locks: NO hagas mas preguntas, NO ofrezcas descuentos, NO escales a humano | VERIFIED                              | 4 WHY assertions + 3 BACK-OFF assertions in `system-prompt-playbook.test.ts` lines 282-300; all 573 tests green                                                                                                                                  |

**Score:** 13/13 truths verified

---

## Required Artifacts

| Artifact                                                     | Status   | Details                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------ | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `el-templo-bot/src/webhook/handler.ts`                       | VERIFIED | `detectSoftRejection` helper at line 1013; pre-AI state machine computing `rejectionHotPre/priorWhyAskedPre/softRejectionRule/newWhyAsked`; 4 `setPlaybookState` writes with `whyAsked`; `discoveryTurnCount` gated on `!rejectionHotPre`; `softRejection` in `computeAdvanceSignals` return; Pino `log.info "soft_rejection_detected"` |
| `el-templo-bot/src/playbooks/advance.ts`                     | VERIFIED | `softRejection?: boolean` on `AdvanceSignals` (lines 92); 5-stage allowlist guard as FIRST check in PB1 branch (lines 109-123)                                                                                                                                                                                                          |
| `el-templo-bot/src/playbooks/types.ts`                       | VERIFIED | `whyAsked?: boolean` with JSDoc at lines 97-108                                                                                                                                                                                                                                                                                         |
| `el-templo-bot/src/memory/playbook-state.ts`                 | VERIFIED | JSDoc backward-compat paragraph for `whyAsked` at lines 32-35                                                                                                                                                                                                                                                                           |
| `el-templo-bot/src/ai/system-prompt.ts`                      | VERIFIED | `SOFT_REJECTION_WHY_RULE` constant (line 70); `SOFT_REJECTION_BACKOFF_RULE` constant (line 79); `softRejectionRule?` option (line 45); conditional injection branch (lines 352-356) appended LAST in `getSystemPrompt`                                                                                                                  |
| `el-templo-bot/test/playbook-advance.test.ts`                | VERIFIED | OBJN-01 describe block with 14 positive + 12 negative + 5 advance-guard tests (31 total)                                                                                                                                                                                                                                                |
| `el-templo-bot/test/playbook-flow-coverage.test.ts`          | VERIFIED | Multi-turn arc test (turn1 substantive → turn2 rejection → turn3 reconfirm → turn4 re-engage) at line 134                                                                                                                                                                                                                               |
| `el-templo-bot/test/system-prompt-playbook.test.ts`          | VERIFIED | 4 wording-constraint tests in OBJN-02/SC#3 describe block (lines 273-325)                                                                                                                                                                                                                                                               |
| `el-templo-bot/test/fixtures/pb1-e1a-lead-rendered.snap.txt` | VERIFIED | 18,291 bytes — delta=0 from Phase 90 baseline                                                                                                                                                                                                                                                                                           |

---

## Key Link Verification

| From                                       | To                                      | Via                                                                                                | Status    | Details                                                                                  |
| ------------------------------------------ | --------------------------------------- | -------------------------------------------------------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------- | ----- | --------------------------------------------------------------------------- |
| `handler.ts` (pre-AI state machine)        | `getSystemPrompt(...softRejectionRule)` | `softRejectionRule: "why"                                                                          | "backoff" | undefined`computed from`(rejectionHotPre, priorWhyAskedPre)` and passed at line ~512     | WIRED | Rule fires on the rejection turn — same AI call that generates Mica's reply |
| `handler.ts` (`computeAdvanceSignals`)     | `advance.ts` (`advanceStageIfComplete`) | `softRejection` field flows through `AdvanceSignals`; allowlist guard is FIRST check in PB1 branch | WIRED     | Structural gate confirmed in advance.ts lines 121-123                                    |
| `handler.ts` (4 `setPlaybookState` writes) | Redis key `wa:playbook:<phone>`         | All 4 write sites pass `whyAsked: newWhyAsked`; `playbook-state.ts` serializes transparently       | WIRED     | Confirmed by grep; `newWhyAsked = rejectionHotPre` (boolean reset on non-rejection turn) |

---

## Requirements Coverage

| Requirement | Source Plan   | Description                                                                                     | Status    | Evidence                                                                                                                                                                                    |
| ----------- | ------------- | ----------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OBJN-01     | 91-01-PLAN.md | Mica asks WHY before closing when lead rejects during PB1 discovery                             | SATISFIED | `detectSoftRejection` regex + WHY framing rule + stage-hold; 31 tests in `playbook-advance.test.ts`; REQUIREMENTS.md marked `[x]`                                                           |
| OBJN-02     | 91-01-PLAN.md | PB1 carries explicit instruction for "lead rejects during discovery" case; mechanism documented | SATISFIED | `SOFT_REJECTION_WHY_RULE` + `SOFT_REJECTION_BACKOFF_RULE` in `system-prompt.ts`; mechanism documented in SUMMARY.md Section "Mechanism Choice (OBJN-02 SC#2)"; REQUIREMENTS.md marked `[x]` |

No orphaned requirements — OBJN-01 and OBJN-02 are the only Phase 91 requirements in REQUIREMENTS.md, both claimed in 91-01-PLAN.md frontmatter and both verified.

---

## CONTEXT.md Locked Decision Verification

| Decision                                                                                                                                                                            | Status   | Evidence                                                                                                                                                                                                     |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Tight regex MUST include "no me interesa", "no es para mi/mi", "no gracias", "paso" (standalone), "mejor no", "no voy a", "no creo" (standalone), "creo que no", "me parece que no" | VERIFIED | All 9 patterns present in `detectSoftRejection` (handler.ts lines 1017-1069); all covered in the 14 positive test cases                                                                                      |
| Tight regex MUST NOT match "no se", "tal vez", "lo pienso", "dejame pensarlo", "no creo que pueda hoy", "no puedo el martes"                                                        | VERIFIED | 12 negative cases in `playbook-advance.test.ts` lines 846-858; all `softRejection` falsy                                                                                                                     |
| Active stages for advance guard: E1A, E1B, E2A, E2B, E3 ONLY — never E4-E7 (positive allowlist)                                                                                     | VERIFIED | advance.ts lines 115-123: explicit 5-stage OR chain; E4 INERT test + PB2 INERT test in test suite                                                                                                            |
| Snapshot delta = 0 (18,291 bytes)                                                                                                                                                   | VERIFIED | `wc -c` = 18291; snapshot fixture test asserts no rule literal in baseline                                                                                                                                   |
| softRejection turns do NOT increment `discoveryTurnCount`                                                                                                                           | VERIFIED | handler.ts line 729: `!rejectionHotPre` gate; multi-turn arc test confirms count stays at 1 on rejection turns                                                                                               |
| Pino is `log.info "soft_rejection_detected"` (NOT `log.warn`)                                                                                                                       | VERIFIED | handler.ts line 468: `log.info(...)` confirmed; single grep site                                                                                                                                             |
| SUMMARY.md documents the chosen mechanism per SC#2                                                                                                                                  | VERIFIED | 91-01-SUMMARY.md "Mechanism Choice (OBJN-02 SC#2)" section documents hybrid: signal layer (`computeAdvanceSignals` + `advanceStageIfComplete`) + behavioral layer (`system-prompt.ts` conditional injection) |

---

## Anti-Patterns Found

No anti-patterns detected. No TODOs, FIXMEs, placeholder returns, or stub handlers found in any of the 8 modified files. One transitional JSDoc note (from Task 1 Strategy b) was removed in Task 2 per SUMMARY confirmation.

---

## Human Verification Required

### 1. Live-test rejection arc behavioral validation

**Test:** Send "no me interesa" to Mica in an active PB1.E1A conversation on WhatsApp.
**Expected:** Mica replies with a curious, non-defensive open WHY question (e.g. "Te entiendo. Puedo preguntarte que te hace dudar?") — no farewell phrase, no price/plan mention, no escalation.
**Why human:** LLM behavioral output cannot be asserted purely at the prompt/signal level. Phase 92 RLOK-03 is the formal live-test gate for this.

### 2. Back-off arc second turn

**Test:** Reply to Mica's WHY question with "no, en serio" (or any reconfirmation of rejection).
**Expected:** Mica delivers a warm graceful close with a door-open phrase — no second WHY, no discount offer, no escalation.
**Why human:** The back-off selector (reading `priorWhyAsked` from Redis) requires a live Redis round-trip that Phase 91 tests exercise only at the pure-function level.

---

## Test Suite Result

**573/573 tests passing** (537 Phase 90 baseline + 36 new Phase 91 tests). 25 test files. tsc clean.

---

_Verified: 2026-04-15T13:05:00Z_
_Verifier: Claude (gsd-verifier)_
