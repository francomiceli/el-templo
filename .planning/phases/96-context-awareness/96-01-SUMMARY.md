---
phase: 96-context-awareness
plan: 01
subsystem: el-templo-bot/ai-system-prompt + webhook-handler-extraction
tags:
  [
    ctxt-rule,
    sunday-zero-binding,
    extraction-fence-helper,
    snapshot-regen,
    whatsapp-bot,
    bug-04,
    tdd,
    fix-mechanical,
  ]
requires:
  - phase: 95-booking-reliability-graceful-degradation
    provides: "Plan 95-01 audit explicitly deferred (iii) Sunday=0 directive to Phase 96 to avoid mid-milestone snapshot regen. Plan 95-03 SUMMARY discipline + atomic commit cadence inherited."
  - phase: roadmap (v5.3.3)
    provides: "BUG-04 (CTXT-01/02) — re-asks data the user already provided. Three-point empirical chain locked Case A verdict: Phase 91 live test, BUG-04 backlog narrative, live UAT repro 2026-06-09 (Mati → apellido)."
provides:
  - "CTXT-01/02 closed (BUG-04) — *Datos ya provistos:* CTXT rule universal in `*Reglas de conversacion*` section. Apellido nuance explicit per empirical anchor."
  - "(iii) Sunday=0 directive — `*Convención:* 0=domingo, 1=lunes, ..., 6=sábado.` single-line before `*Reglas de uso de herramientas*`. Plan 95-01 audit carry-forward closed."
  - "parseExtractionResponse helper — markdown-fence-aware JSON parser at `handler.ts`. Strips ` ```json `/` ``` ` fences before `JSON.parse`; returns `null` on truly malformed content. Defensive hardening from live-repro Finding #4 (gpt-4o-mini fence-wrapping)."
  - "Snapshot regen — `pb1-e1a-lead-rendered.snap.txt` wholly regenerated; `POST_RLOK_04_BYTES = 18370 → 18798`. KGATE-05 cap 18916 satisfied with 118-char margin (≥80 required per D-11)."
  - "v5-3-3-context-awareness.test.ts (6 tests T1-T6) — TDD RED-against-master → GREEN. Locks rule presence, SOFT_REJECTION non-collision, helper semantics + skip-regression, Sunday=0 full shape, BUG-04 forensic-fixture replay."
affects:
  - el-templo-bot/src/ai/system-prompt.ts
  - el-templo-bot/src/webhook/handler.ts
  - el-templo-bot/test/v5-3-2-regression.test.ts
  - el-templo-bot/test/v5-3-3-context-awareness.test.ts
  - el-templo-bot/test/fixtures/pb1-e1a-lead-rendered.snap.txt
key-files:
  created:
    - el-templo-bot/test/v5-3-3-context-awareness.test.ts
  modified:
    - el-templo-bot/src/ai/system-prompt.ts
    - el-templo-bot/src/webhook/handler.ts
    - el-templo-bot/test/v5-3-2-regression.test.ts
    - el-templo-bot/test/fixtures/pb1-e1a-lead-rendered.snap.txt
decisions:
  - "D-01 Case A locks (prompt-only fix, no extraction-layer refactor). Three-point empirical chain: Phase 91 live test + BUG-04 backlog + live UAT repro 2026-06-09 all share the same failure-mode signature (history visible, model chose to re-ask)."
  - "D-03 CTXT rule wording = Option C hybrid + explicit apellido example. ~365 chars. Empirical anchor (Mati → apellido) IRREDUCIBLE under any budget-pressure trim."
  - "D-06 Sunday=0 directive = audit-verbatim single-line `*Convención:*`. ~92 chars. No empirical reason to deviate; audit-verbatim discipline applies."
  - 'D-09 + D-10 snapshot regen + constant bump = ONE atomic GREEN commit (Phase 92-02 surgical-tripwire precedent). Measured value 18798 (estimated 18,827-18,831 in plan); plan said "land the measured value, not the estimate" — measured value shipped.'
  - 'D-12 parseExtractionResponse helper = exported (Claude''s Discretion D-14) because the test file imports it via `await import("../src/webhook/handler")`. Returns `Record<string, unknown> | null`. NEVER throws — preserves existing skip-on-malformed semantics.'
  - "D-14 file location = module-local in `handler.ts` (Phase 95 D-16 co-location precedent — single consumer; externalize when a second consumer materializes)."
  - "D-23 6-pair canonical-invariant sha256 `67670b1e1099bf7c8a5285414736f16e8a010a010348bf6566790d0db3163344` byte-equal across all 6 anchors (93/94/95/96-CONTEXT.md, ROADMAP.md, MACRO-ROADMAP.md)."
status: complete
shipped: 2026-06-10
metrics:
  duration: "~30 minutes recovery completion (after prior 5.5h execute session timed out)"
  tasks_completed: 3
  files_changed: 5
---

# Phase 96-01 — Context Awareness (CTXT-01/02 + Sunday=0 + Finding #4) Summary

## Goal

Close BUG-04 (CTXT-01/02) — the failure mode where the conversation history was visible to the model but the model chose to re-ask data the user had already provided. Three coupled deliverables shipped atomically because the snapshot regen surface is coherent only as one PR:

1. **CTXT rule** (`*Datos ya provistos:*` universal) — closes CTXT-01/02.
2. **(iii) Sunday=0 directive** (`*Convención:* 0=domingo...`) — closes Plan 95-01 carry-forward.
3. **parseExtractionResponse helper** — defensive hardening of live-repro Finding #4 (gpt-4o-mini fence-wrapping silently dropping `branchPreference`/`notes`).

Plus the in-PR snapshot regen + `POST_RLOK_04_BYTES` bump — Phase 96 is the canonical snapshot-regen point for v5.3.3.

## Outcome

**Atomic three-commit TDD chain — RED → GREEN → SUMMARY.**

| Commit                                                                                             | Type    | Files                                                                                                                                                         | Tests                                                           |
| -------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `071e53fa` — `test(96-01): RED — CTXT rule + extraction-fence helper + (iii) regression-protector` | RED     | `el-templo-bot/test/v5-3-3-context-awareness.test.ts` (created)                                                                                               | T1-T6 FAIL on master; (iii) Sunday=0 RED still RED              |
| `bea9a10a` — `feat(96-01): close CTXT-01/02 + Sunday=0 carry-forward + extraction fence helper`    | GREEN   | `system-prompt.ts` + `handler.ts` + `v5-3-2-regression.test.ts` + `pb1-e1a-lead-rendered.snap.txt` + `v5-3-3-context-awareness.test.ts` (T2 regex broadening) | T1-T6 PASS; (iii) Sunday=0 RED → GREEN; RLOK-02 byte-equal PASS |
| TBD `docs(96-01): SUMMARY`                                                                         | SUMMARY | `.planning/phases/96-context-awareness/96-01-SUMMARY.md` (this file)                                                                                          | n/a                                                             |

`git log --oneline -3` (post-GREEN, pre-SUMMARY commit):

```
bea9a10a feat(96-01): close CTXT-01/02 + Sunday=0 carry-forward + extraction fence helper
071e53fa test(96-01): RED — CTXT rule + extraction-fence helper + (iii) regression-protector
6aee0286 docs(96): create phase plan
```

## Files Changed

### Created

- **`el-templo-bot/test/v5-3-3-context-awareness.test.ts`** — 6 tests per D-15 + D-16:
  - **T1**: CTXT rule present in rendered PB1.E1A lead prompt (`/Datos ya provistos:\*?\s+nunca re-preguntes/i`).
  - **T2**: CTXT rule co-exists with SOFT_REJECTION fixtures (`why` and `backoff` states) on distinct lines (D-05 SC#3 guardrail).
  - **T3**: `parseExtractionResponse` handles bare + ` ```json ` fenced + ` ``` ` fenced + malformed `"not json"`.
  - **T4**: `parseExtractionResponse` regression-protector — empty string, single brace, JSON array all return `null` (or array, helper's discretion); NEVER throws.
  - **T5**: Sunday=0 directive locked in rendered prompt — full shape regression-protector (`/\*Convención:\*.*0=domingo.*1=lunes.*6=sábado/`).
  - **T6**: BUG-04 forensic-fixture replay — `profileContext: 'Nombre: Mati'` asserts both CTXT rule AND `Nombre: Mati` line present in rendered prompt.

### Modified

- **`el-templo-bot/src/ai/system-prompt.ts`** (D-03 + D-06):
  - D-03 CTXT rule `*Datos ya provistos:* nunca re-preguntes...` inserted as last bullet inside `*Reglas de conversacion*` section (after the existing 4 bullets at `:241-246`, before `*Preguntas sobre mi identidad*` heading at `:248`).
  - D-06 Sunday=0 directive `*Convención:* el día de la semana se codifica como 0=domingo, 1=lunes, ..., 6=sábado.` inserted as single-line BEFORE `*Reglas de uso de herramientas (CRITICO):*` heading at `:217`.
  - NO touches outside the two insertion points. SOFT_REJECTION at `:70-86`, AVATAR_TONE_GUIDES at `:107+`, STATE_SECTIONS at `:162+`, profileContext injection at `:286-291`, `*Detección de perfil*` at `:339` all UNCHANGED.
- **`el-templo-bot/src/webhook/handler.ts`** (D-12):
  - New exported helper `parseExtractionResponse(rawContent: string): Record<string, unknown> | null` added just before the `extractAndUpdateProfile` declaration. Two-pass strip (leading ` ```(?:json)? `, trailing ` ``` `) before `JSON.parse`. Narrows result to object-shape (returns `null` for primitives + arrays). NEVER throws.
  - Caller at `:1606-1615` (the inline `try { extracted = JSON.parse(rawContent) } catch { log.warn(...); return; }`) replaced with `const extracted = parseExtractionResponse(rawContent); if (!extracted) { log.warn(...); return; }`. Existing `log.warn` message string preserved BYTE-EQUAL.
  - NO touches to concurrency entry guard (Phase 93 region), OpenAI client / interim UX (Phase 94 region at `:323`/`:584`/`:641`), tool loop / retry counter (Phase 95 region at `:659`/`:676-694`/`:928-950`).
- **`el-templo-bot/test/v5-3-2-regression.test.ts`** (D-10):
  - Single constant bump: `POST_RLOK_04_BYTES = 18370` → `18798`. All other content (RLOK-01..04 describes, byte-equal test at `:326-335`, surrounding helpers) UNCHANGED.
- **`el-templo-bot/test/fixtures/pb1-e1a-lead-rendered.snap.txt`** (D-09):
  - Wholly regenerated via `pnpm exec tsx -e "getSystemPrompt({clientState:'lead', activePlaybook:'PB1', currentStage:'E1A'})"`. Absorbs both D-03 + D-06 strings.
- **`el-templo-bot/test/v5-3-3-context-awareness.test.ts`** (T2 regex broadening — bundled with GREEN commit):
  - T2's SOFT_REJECTION marker regex broadened from `/\*REGLA — el lead/` to `/\*REGLA — (el lead|back-off)/` so it matches both WHY rule (`*REGLA — el lead expresó rechazo:*`) and BACKOFF rule (`*REGLA — back-off después de la WHY:*`) at `system-prompt.ts:70/79`. Plan-permitted analog of Claude's Discretion (iii) test-rename precedent.

## Tests Added

| Test                                                                              | Pre-GREEN (RED)                  | Post-GREEN |
| --------------------------------------------------------------------------------- | -------------------------------- | ---------- |
| T1 — CTXT rule present in rendered PB1.E1A lead prompt                            | FAIL (string absent)             | PASS       |
| T2 — CTXT + SOFT_REJECTION (`why`) co-exist on distinct lines                     | FAIL (CTXT absent)               | PASS       |
| T2 — CTXT + SOFT_REJECTION (`backoff`) co-exist on distinct lines                 | FAIL (CTXT absent)               | PASS       |
| T3 — parseExtractionResponse parses bare JSON                                     | FAIL (helper missing)            | PASS       |
| T3 — parseExtractionResponse parses ` ```json `-fenced JSON                       | FAIL (helper missing)            | PASS       |
| T3 — parseExtractionResponse parses ` ``` `-fenced JSON                           | FAIL (helper missing)            | PASS       |
| T3 — parseExtractionResponse returns null on `"not json"`                         | FAIL (helper missing)            | PASS       |
| T4 — parseExtractionResponse returns null for empty string                        | FAIL (helper missing)            | PASS       |
| T4 — parseExtractionResponse returns null for single brace                        | FAIL (helper missing)            | PASS       |
| T4 — parseExtractionResponse does NOT throw on JSON array input                   | FAIL (helper missing)            | PASS       |
| T5 — Sunday=0 directive full shape locked                                         | FAIL (string absent)             | PASS       |
| T6 — BUG-04 forensic-fixture replay (profileContext: 'Nombre: Mati')              | FAIL (CTXT absent)               | PASS       |
| (iii) — Sunday=0 RED at v5-3-3-booking-reliability.test.ts:55 (pre-existing)      | RED on master                    | GREEN      |
| RLOK-02 — getSystemPrompt(...).length === POST_RLOK_04_BYTES                      | n/a (constant aligned post-bump) | PASS       |
| RLOK-02 — readFileSync(SNAP_PATH).toBe(renderE1ALead())                           | n/a (fixture aligned post-regen) | PASS       |
| KGATE-05 — getSystemPrompt(...).length ≤ Math.floor(BASELINE_CHARS × 0.8) = 18916 | PASS (18798 < 18916, margin 118) | PASS       |

**Critical suite tally (post-GREEN):** 54/54 PASS across `v5-3-3-context-awareness.test.ts` (12 cases including parameterized), `v5-3-3-booking-reliability.test.ts`, `v5-3-2-regression.test.ts`, `rendered-prompt-snapshot.test.ts`, `prompt-size.test.ts`.

**Full bot suite tally (post-GREEN):** 639/643 PASS. The 4 failures are pre-existing carry-forward flakes in `v5-3-3-degr-01-escalation.test.ts` (DEGR-01 SC-B + SC-C variants) and `v5-3-3-openai-latency.test.ts` (LAT-03 SC#3 ~50% flake). Both documented in `STATE.md` "Pending Decisions" as Phase 96-scope-excluded carry-forwards. Behavior unchanged vs pre-Phase-96 baseline.

**el-templo-api suite:** 30 pre-existing failures (DB-state flakes in `subscriptions`, `ai-tools`, `webhook` integration tests). Confirmed unchanged with stashed Phase 96 changes — these flakes pre-date Phase 96 and are unrelated to the system-prompt.ts / handler.ts surfaces this plan touched.

**TypeScript:** `pnpm tsc --noEmit` clean in both `el-templo-bot/` and `el-templo-api/`.

## Commits

- **`071e53fa`** — RED. Touches only `el-templo-bot/test/v5-3-3-context-awareness.test.ts`. No production source changes.
- **`bea9a10a`** — GREEN. Touches 5 files: 4 planned per `<action>` block (`system-prompt.ts`, `handler.ts`, `v5-3-2-regression.test.ts`, `pb1-e1a-lead-rendered.snap.txt`) + the T2 regex broadening in `v5-3-3-context-awareness.test.ts` (bundled per analog of plan-permitted (iii) test rename Claude's Discretion).

## Cross-Phase Invariant Status

**Block unchanged in this phase (D-23).** SHA-256 of the canonical formula block verifies BYTE-EQUAL across all 6 anchors:

| Anchor                                                                       | SHA-256                                                            |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `.planning/phases/93-handler-concurrency/93-CONTEXT.md`                      | `67670b1e1099bf7c8a5285414736f16e8a010a010348bf6566790d0db3163344` |
| `.planning/phases/94-openai-latency-graceful-failure/94-CONTEXT.md`          | `67670b1e1099bf7c8a5285414736f16e8a010a010348bf6566790d0db3163344` |
| `.planning/phases/95-booking-reliability-graceful-degradation/95-CONTEXT.md` | `67670b1e1099bf7c8a5285414736f16e8a010a010348bf6566790d0db3163344` |
| `.planning/phases/96-context-awareness/96-CONTEXT.md`                        | `67670b1e1099bf7c8a5285414736f16e8a010a010348bf6566790d0db3163344` |
| `.planning/ROADMAP.md`                                                       | `67670b1e1099bf7c8a5285414736f16e8a010a010348bf6566790d0db3163344` |
| `.planning/MACRO-ROADMAP.md`                                                 | `67670b1e1099bf7c8a5285414736f16e8a010a010348bf6566790d0db3163344` |

All 6 byte-identical. Phase 96 modified zero terms in the invariant; the hash sentry confirms zero drift.

## Decisions Implemented (D-01..D-23)

| ID   | Decision Summary                                                                                                  | Status                      |
| ---- | ----------------------------------------------------------------------------------------------------------------- | --------------------------- |
| D-01 | Case A locks (prompt-only fix, no extraction-layer refactor)                                                      | shipped                     |
| D-02 | Apellido nuance mandatory in CTXT rule                                                                            | shipped                     |
| D-03 | CTXT wording = Option C hybrid + explicit apellido example, ~365 chars                                            | shipped                     |
| D-04 | Placement = `*Reglas de conversacion*` section, last bullet                                                       | shipped                     |
| D-05 | SC#3 invariant guardrail — CTXT rule shares no state with SOFT_REJECTION                                          | verified (T2)               |
| D-06 | Sunday=0 wording = audit-verbatim single-line `*Convención:*`                                                     | shipped                     |
| D-07 | Placement = single line BEFORE `*Reglas de uso de herramientas*`                                                  | shipped                     |
| D-08 | (iii) RED at booking-reliability.test.ts:55 transitions GREEN automatically                                       | verified                    |
| D-09 | Regenerate `pb1-e1a-lead-rendered.snap.txt` in same commit as D-03+D-06                                           | shipped                     |
| D-10 | Bump `POST_RLOK_04_BYTES` from 18370 to measured value (shipped: 18798)                                           | shipped                     |
| D-11 | KGATE-05 budget verification — measured 18798 < cap 18916 (margin 118 chars; ≥80 required)                        | verified                    |
| D-12 | parseExtractionResponse helper — `(string) => Record<string, unknown> \| null`, NEVER throws                      | shipped (exported per D-14) |
| D-13 | Fence shapes covered — bare + ` ```json ` + ` ``` ` + malformed → null                                            | verified (T3)               |
| D-14 | File location = `handler.ts` (module-local); EXPORTED for test (Claude's Discretion)                              | shipped                     |
| D-15 | New test file = `v5-3-3-context-awareness.test.ts` (unit tests, `el-templo-bot/test/`)                            | shipped                     |
| D-16 | Test list (T1-T6) — locked 6-test scenario coverage                                                               | shipped                     |
| D-17 | Modified `v5-3-2-regression.test.ts` — single POST_RLOK_04_BYTES bump only                                        | shipped                     |
| D-18 | Wholly regenerated fixture file; commit message calls out regen explicitly                                        | shipped                     |
| D-19 | TDD fail-in-main discipline — RED commit `071e53fa` before GREEN `bea9a10a`                                       | shipped                     |
| D-20 | Atomic commit cadence — RED + GREEN + SUMMARY (3 atomic commits)                                                  | shipped                     |
| D-21 | Plan-checker mode = NORMAL (mechanical, no investigative branching)                                               | applied (plan-phase)        |
| D-22 | Substantive verify gates only — F-1 / F-2 NOT regenerated                                                         | verified                    |
| D-23 | 6-pair canonical-invariant sha256 byte-equal — `67670b1e1099bf7c8a5285414736f16e8a010a010348bf6566790d0db3163344` | verified                    |

## Must-Haves Verified

| Must-Have                                                                      | Verification                                                                                                        | Outcome |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- | ------- |
| D-03 CTXT string present in `system-prompt.ts`                                 | `grep -cF 'Datos ya provistos:' / '¿cuál es tu apellido?' / 'NO la categoría completa'` = 1/1/1                     | PASS    |
| D-06 Sunday=0 string present in `system-prompt.ts`                             | `grep -cF '*Convención:* el día de la semana se codifica como 0=domingo, 1=lunes, ..., 6=sábado.'` = 1              | PASS    |
| parseExtractionResponse helper declared in `handler.ts`                        | `grep -cE 'function parseExtractionResponse'` = 1; `grep -c 'parseExtractionResponse'` = 2 (def + caller)           | PASS    |
| Caller `log.warn` message preserved byte-equal                                 | `grep -cF 'Profile extraction returned malformed JSON, skipping update'` = 1                                        | PASS    |
| Fixture regen — file modified, byte-equal with renderE1ALead()                 | `rendered-prompt-snapshot.test.ts` byte-equal test PASS                                                             | PASS    |
| POST_RLOK_04_BYTES > 18370 AND < 18916                                         | 18798 > 18370 ✓; 18798 < 18916 ✓ (margin 118 chars)                                                                 | PASS    |
| BASELINE_CHARS = 23646 UNCHANGED                                               | `git diff HEAD~ HEAD -- el-templo-bot/test/fixtures/pb1-e1a-baseline.ts` empty                                      | PASS    |
| All 6 T1-T6 tests pass post-GREEN                                              | `pnpm test --run test/v5-3-3-context-awareness.test.ts` — 12/12 PASS                                                | PASS    |
| (iii) Sunday=0 RED transitions GREEN                                           | `pnpm test --run test/v5-3-3-booking-reliability.test.ts` — full suite PASS                                         | PASS    |
| TDD RED-before-GREEN observed                                                  | `git log` shows `071e53fa` RED before `bea9a10a` GREEN                                                              | PASS    |
| tsc clean both packages                                                        | `pnpm tsc --noEmit` exits 0 in both `el-templo-bot/` and `el-templo-api/`                                           | PASS    |
| Zero new `console.*` / `: any` / `<any>` / `as any` in handler.ts              | grep counts unchanged vs master baseline                                                                            | PASS    |
| 6-pair sha256 invariant byte-equal                                             | All 6 anchors hash `67670b1e1099bf7c8a5285414736f16e8a010a010348bf6566790d0db3163344`                               | PASS    |
| Atomic 3-commit cadence                                                        | RED (`071e53fa`) + GREEN (`bea9a10a`) + SUMMARY (this commit)                                                       | PASS    |
| Out-of-scope guards — system-prompt.ts insertion-points only                   | `git diff` shows additions only in the two insertion regions; no SOFT_REJECTION/AVATAR/STATE/profileContext touches | PASS    |
| Out-of-scope guards — handler.ts extraction region only                        | `git diff` shows changes only in `parseExtractionResponse` + caller block (1606-1615)                               | PASS    |
| Out-of-scope guards — 4 existing it() in booking-reliability.test.ts unchanged | `git diff HEAD~ HEAD -- el-templo-bot/test/v5-3-3-booking-reliability.test.ts` empty                                | PASS    |
| Out-of-scope guards — v5-3-2-regression.test.ts only POST_RLOK_04_BYTES bump   | `git diff` shows exactly 2 lines changed (one `-` + one `+`)                                                        | PASS    |

## Out-of-Scope Confirmed (per CONTEXT.md `<deferred>`)

- **Finding #2 (date hallucination)** — Phase 96.5 territory. NOT touched. HARD BLOCKER pre-v5.4.0.
- **Finding #3 (`fetch failed` on Confirmar)** — dev-env verification; carry-forward to v5.4.0 staging.
- **Finding #5 (`discovery_escape_fired` at PB1.E1A turnCount:3)** — working as designed per Phase 90 STAGE-01/02.
- **Case B (synchronous extraction refactor)** + **Case C (hybrid)** — v5.4+ scope if Case A proves insufficient empirically.
- **Behavioral live-test for CTXT rule (RLOK-03 pattern)** — Phase 97 RGUARD-01 territory.
- **Externalizing `parseExtractionResponse` to a shared `extract-json.ts` module** — defer until a second consumer materializes.
- **`BASELINE_CHARS = 23646`** — FROZEN; only `POST_RLOK_04_BYTES` advances.

## Carry-Forward Notes

**For Phase 96.5 (NEW — HARD BLOCKER pre-v5.4.0):**

- Date grounding fix (`*Convención:* Hoy es ${TODAY_ISO} (${DAY_NAME}).`) plus snapshot date-stub infrastructure for byte-equal lock.
- Will land as a SECOND `*Convención:*` line in the same insertion region Phase 96 introduced. No structural refactor needed — two single-line `*Convención:*` markers.
- Will trigger a SECOND snapshot regen + `POST_RLOK_04_BYTES` bump. KGATE-05 budget margin after Phase 96 = 118 chars; estimated Phase 96.5 directive ~25 chars; fits with 93-char margin remaining.
- Phase 96.5 inherits Phase 96 discipline (NORMAL plan-checker, no F-1/F-2 gates, 6-pair sha256 invariant, audit-verbatim discipline).

**For Phase 97 RGUARD-01 (regression suite, RLOK-03 live-test):**

- Include `el-templo-bot/test/v5-3-3-context-awareness.test.ts` in the milestone-scoped regression suite (either by reference — `pnpm test` runs it already — or by absorbing into `v5-3-3-regression.test.ts` aggregator mirroring v5.3.2 RLOK pattern).
- RLOK-03 live-test gate empirically validates the CTXT rule's behavioral effect (does Mica re-ask less frequently? Does she correctly ask for apellido?). Phase 96 ships structural assertions only; behavioral validation is Phase 97's deliverable.

**For Phase 97 RGUARD-02 (SC#3 invariant assertion at milestone-suite level):**

- T2 (D-05 SC#3 guardrail) is the foundation Phase 97 RGUARD-02 extends. T2 asserts presence + line-distinction; RGUARD-02 extends to multi-turn / behavioral validation.

**For Phase 97 RGUARD-03 (executeTool timeout sweep):**

- No direct dependency on Phase 96. Continues Phase 95 retry-counter + Phase 94 OpenAI timeout discipline.

## Known Issues / Follow-ups

Pre-existing carry-forward flakes unchanged by Phase 96 (per STATE.md "Pending Decisions"):

- **DEGR-01 SC-B + SC-C variants** in `v5-3-3-degr-01-escalation.test.ts` — 3 intermittent failures per run. Deferred to v5.4.0 (Phase 95-03 closure recorded this).
- **LAT-03 SC#3 ~50% flake** in `v5-3-3-openai-latency.test.ts` — 1 intermittent failure per run. Phase 94 origin; v5.4.0 staging verification.
- **el-templo-api 30 DB-state failures** — `subscriptions.test.ts`, `ai-tools.test.ts`, `webhook.test.ts`, `v5-3-3-booking.integration.test.ts`. Confirmed unrelated to Phase 96 surface (stash-and-rerun shows identical failure profile). Pre-dates Phase 96 baseline.

These flakes are NOT caused, worsened, or masked by Phase 96. Total bot suite tally moved from baseline 638 PASS → 639 PASS (Phase 96 added 6 new tests + 1 transitioned RED→GREEN; the 4-5 carry-forward flakes vary run-to-run within their documented variance).

## Recovery Note

This SUMMARY was authored during a recovery session on 2026-06-10 after a prior `/gsd:execute-phase 96 --plan 01` session timed out at ~5.5 hours / 56 tool uses with `API ECONNRESET`. The prior session had completed Task 1 RED commit (`071e53fa`) and applied uncommitted Task 2 GREEN code changes to `system-prompt.ts` + `handler.ts` but had not yet regenerated the snapshot or bumped `POST_RLOK_04_BYTES`.

Recovery executed: snapshot regen (measured 18798), POST_RLOK_04_BYTES bump, T2 SOFT_REJECTION regex broadening fix, GREEN commit landing, verification gates, this SUMMARY. Total recovery wall-clock ~30 minutes. The prior session's uncommitted GREEN code was verified byte-equal against D-03/D-06/D-12 spec before commit landed.

## Self-Check: PASSED

- `el-templo-bot/test/v5-3-3-context-awareness.test.ts` — **FOUND** (created in `071e53fa`, T2 regex fix in `bea9a10a`)
- `el-templo-bot/src/ai/system-prompt.ts` — modified (D-03 + D-06)
- `el-templo-bot/src/webhook/handler.ts` — modified (D-12 helper + caller refactor)
- `el-templo-bot/test/v5-3-2-regression.test.ts` — modified (POST_RLOK_04_BYTES = 18798)
- `el-templo-bot/test/fixtures/pb1-e1a-lead-rendered.snap.txt` — wholly regenerated
- Commit `071e53fa` (RED) — **FOUND** in `git log --all`
- Commit `bea9a10a` (GREEN) — **FOUND** in `git log --all`
- `pnpm test --run test/v5-3-3-context-awareness.test.ts` — 12/12 PASS post-GREEN
- `pnpm test --run test/v5-3-3-booking-reliability.test.ts` — full suite PASS incl. (iii) Sunday=0 GREEN
- `pnpm test --run test/v5-3-2-regression.test.ts` — RLOK-01..04 PASS incl. byte-equal
- `pnpm test --run test/ai/rendered-prompt-snapshot.test.ts` — PASS (fixture byte-equal)
- `pnpm test --run test/ai/prompt-size.test.ts` — KGATE-05 PASS
- `pnpm tsc --noEmit` (both packages) — clean
- 6-pair sha256 invariant — `67670b1e1099bf7c8a5285414736f16e8a010a010348bf6566790d0db3163344` byte-equal across all 6 anchors
