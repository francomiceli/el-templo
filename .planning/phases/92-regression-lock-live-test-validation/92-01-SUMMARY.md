---
phase: 92-regression-lock-live-test-validation
plan: 01
subsystem: el-templo-bot/test (behavioural-integration) + el-templo-bot/ai (knowledge rewrite)
tags:
  [
    regression-lock,
    milestone-lock,
    behavioural-integration,
    v5-3-2,
    knowledge,
    rlok,
    rlok-04,
    snapshot,
    kgate-05,
  ]
requires:
  - phase: 89-knowledge-fixes
    provides: "KFIX-01..04 source fixes + snapshot regeneration precedent (KFIX-01 shipped as a single atomic commit including the snap regen — this plan mirrors that pattern)"
  - phase: 90-stage-heuristic-tightening
    provides: "STAGE-01 category-diversity gate + STAGE-02 AND turn-count gate + exported hasStageSpecificContent / computeAdvanceSignals — this plan asserts their behavioural contract at rendered-prompt / signal level"
  - phase: 91-pb1-objection-handling
    provides: "OBJN-01 softRejection regex + SOFT_REJECTION_WHY_RULE / SOFT_REJECTION_BACKOFF_RULE conditional injection + exported detectSoftRejection — this plan asserts the rendered-prompt injection contract and the regex matrix"
provides:
  - "v5-3-2-regression.test.ts — strictly-new behavioural integration layer; one describe per requirement ID (KFIX-01..04, STAGE-01..02, OBJN-01, RLOK-04) + KGATE-05 dual-threshold + post-RLOK-04 snapshot byte-equality + RLOK-03 it.skip placeholder"
  - "POST_RLOK_04_BYTES = 18,275 (JS-string length) / 18,484 (wc -c bytes) — locked baseline for the post-RLOK-04 PB1.E1A lead render; regeneration now requires an explicit code update alongside the fixture commit"
  - "RLOK-04 source change — both $80,000 hits rewritten to non-numeric prose (SALES_TECHNIQUES line 347 anclaje rule + OBJECTIONS_SALES item 7 line 392 per-class Q&A); wording anchor 'desde el plan más accesible' present in render"
  - "Discoverability contract met — `grep -l v5-3-2 el-templo-bot/test/` returns exactly test/v5-3-2-regression.test.ts"
affects:
  - el-templo-bot/src/ai/knowledge.ts
  - el-templo-bot/test/fixtures/pb1-e1a-lead-rendered.snap.txt
  - el-templo-bot/test/v5-3-2-regression.test.ts
tech-stack:
  added: []
  patterns:
    - "Behavioural integration layer per milestone — single file v5-{maj}-{min}-{patch}-regression.test.ts, one describe per requirement ID, alphabetical-by-ID for grep predictability"
    - "Observable-outcome assertions — regex matrices over the assembled prompt string, raw byte caps, multi-turn handler arcs; NOT source-state pointers (which stay in phase-local tests)"
    - "Hardcoded POST_{REQ}_BYTES literal (not readFileSync().length) — snapshot-tripwire discipline from Phase 88; regen requires explicit code update"
    - "Atomic commit for source change + snapshot regen + assertion lock (Phase 89 KFIX-01 precedent — no separate snapshot commit)"
    - "KGATE-05 dual-threshold asserted as raw byte caps (floor(BASELINE_CHARS * 0.8) AND floor(full knowledge * 0.65)), not float percentages — mirrors Phase 89/90 convention"
    - "RLOK-03 placeholder discipline — it.skip entries make the 4 live-test gates visible in `pnpm test` output as '4 skipped', filled in by plan 92-02 SUMMARY transcript"
key-files:
  created:
    - el-templo-bot/test/v5-3-2-regression.test.ts
    - .planning/phases/92-regression-lock-live-test-validation/92-01-SUMMARY.md
  modified:
    - el-templo-bot/src/ai/knowledge.ts
    - el-templo-bot/test/fixtures/pb1-e1a-lead-rendered.snap.txt
decisions:
  - "Retained `$10,000` per-class amortisation inside OBJECTIONS_SALES item 1 ('Es caro') — intentional anchor, not a plan price; out of scope for RLOK-04 regex matrix ($80k/$100k/$250k); documented in Task 1 note and the RLOK-04 observable-shape assertion"
  - "Hardcoded POST_RLOK_04_BYTES = 18,275 (JS length via readFileSync(..., 'utf8').length), NOT 18,484 (wc -c). The plan and the Task 1 handoff reported the wc -c byte-count; the test asserts against JS-string length — these differ because Spanish accents and em-dashes are multi-byte UTF-8. Clarified in the constant's JSDoc."
  - "Replaced planned E2A discovery-gate inbound `'Foundation me interesa para empezar'` with `'quiero aprender skills'` — the planned phrase matches zero E2A motivation-regex keywords; the substitute matches `quiero` + `skills` (existing lock from playbook-advance.test.ts:709)"
  - "Tightened the RLOK-04 observable-shape regex to `/\\$\\d+(?:[.,]\\d+)*/g` instead of `/\\$\\d[\\d.,]*/g` — the latter greedily consumes a trailing sentence period (`'Clase suelta: $20,000.'` would match `$20,000.`), breaking the allowlist check"
  - "All assertions go through public exports (getSystemPrompt, computeAdvanceSignals, hasStageSpecificContent, detectSoftRejection, getBusinessKnowledge). No helper needed a new export — SOFT_REJECTION_WHY_RULE / SOFT_REJECTION_BACKOFF_RULE stay unexported per CONTEXT.md; assertions grep for rendered sub-strings instead"
metrics:
  duration_minutes: 12
  completed: 2026-04-16
  tasks_completed: 3
  files_touched: 3
  commit_count: 1
  commit_hashes:
    - 8be1114b
---

# Phase 92 Plan 01: Regression Lock + RLOK-04 Source Rewrite Summary

**One-liner:** Close the empirical $80k SALES_TECHNIQUES price-leak (RLOK-04) with two non-numeric prose rewrites in `el-templo-bot/src/ai/knowledge.ts`, regenerate the PB1.E1A lead snapshot fixture, and ship a strictly-new behavioural integration test file (`el-templo-bot/test/v5-3-2-regression.test.ts`) that locks every Phase 89/90/91 fix on observable outcomes — all as a single atomic commit per Phase 89 precedent.

## Requirement-ID → Behavioural-Assertion Table

Every describe block in `v5-3-2-regression.test.ts` maps to one requirement ID. Assertions observe rendered prompts or handler outputs — never source-state pointers. Source-state contracts remain in the phase-local tests from 89/90/91.

| Requirement ID | Describe block                                                                 | Observable contract                                                                                                                                                            | Line(s) in test file |
| -------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------- |
| KFIX-01        | Planes y Precios section absent from PB1 lead render                           | `not.toMatch(/Planes y Precios/)` + `not.toMatch(/Planes Flex/i)` on `getSystemPrompt({clientState:'lead',activePlaybook:'PB1',currentStage:'E1A'})`                           | 57–72                |
| KFIX-02        | Zero membership plan price numbers in rendered PB1 lead prompt (post-RLOK-04)  | `$80k / $100k / $250k` regex matrix returns empty; `$20,000` still present (carve-out)                                                                                         | 74–85                |
| KFIX-03        | Metodo elevator reachable, three team hooks present                            | `indexOf('método internacional') < indexOf('Que es El Templo')`; all three hooks present (exact wording from `ELEVATOR_TEXT` at `knowledge.ts:446`)                            | 87–102               |
| KFIX-04        | Canonical Boarding Pass names BOTH benefits                                    | `'100% bonificada'` AND `precios Zero en la primera membres[ií]a` present; `'dos beneficios:'` exactly once                                                                    | 104–115              |
| STAGE-01       | Category-diversity content gate for PB1.E1A/E1B                                | `hasStageSpecificContent` returns false for single-category (`'primera vez'`), true for ≥2 categories; symmetric on E1B                                                        | 117–143              |
| STAGE-02       | AND turn-count gate for PB1.E1A/E1B (idealmente 2-3 preguntas)                 | `discoveryAnswered=false` at turn=1 even with rich content; `true` at turn=2; E1B mirrors E1A; non-E1A/E1B (E2A) ignores turn-count gate                                       | 145–180              |
| OBJN-01        | Soft-rejection regex + WHY/BACK-OFF rule injection                             | `detectSoftRejection` matches 4 live-test variants + composite; NOT hesitation/scheduling; `softRejectionRule:'why'` + `:'backoff'` inject literals; baseline contains NEITHER | 182–237              |
| RLOK-04        | $80,000 SALES_TECHNIQUES rhetorical example removed (non-numeric prose anchor) | Plan-price regex matrix empty; `'desde el plan más accesible'` present; only `$\d+` matches are retained per-class amounts                                                     | 239–275              |
| KGATE-05       | Dual-threshold raw byte caps (≥20% rendered AND ≥35% knowledge-block)          | `renderE1ALead().length ≤ floor(BASELINE_CHARS * 0.8)` AND `getBusinessKnowledge('lead').length ≤ floor(getBusinessKnowledge().length * 0.65)`                                 | 277–289              |
| RLOK-02        | Snapshot byte-equal lock (post-RLOK-04 baseline)                               | `renderE1ALead() === readFileSync(SNAP_PATH, 'utf8')`; `snapshot.length === POST_RLOK_04_BYTES` (hardcoded 18,275)                                                             | 291–301              |
| RLOK-03        | Live-test gates (referenced from SUMMARY transcript)                           | 4 × `it.skip` placeholders — plan 92-02 fills the inline transcript in 92-02-SUMMARY.md                                                                                        | 303–313              |

**Totals:** 11 describe blocks (9 requirement IDs + 1 snapshot equality + 1 RLOK-03 placeholder). 33 tests total — 29 passing + 4 `it.skip` placeholders for RLOK-03.

## Snapshot Byte-Count

- **Pre-RLOK-04 fixture (Phase 91 baseline, `wc -c`):** 18,291 bytes
- **Post-RLOK-04 fixture (`wc -c`):** 18,484 bytes
- **Delta:** +193 bytes on disk

The byte-count went UP even though RLOK-04 replaced two short numeric strings (`$80,000 -> $65,000`, `$80,000 por 8 clases = $10,000 cada una`) because the replacement non-numeric prose uses more Spanish accents (`á/í/ó/ú`) and the em-dash-free prose is longer. The relevant constant for the test is the JS-string length:

- **POST_RLOK_04_BYTES (readFileSync(..., 'utf8').length):** 18,275
- **Hardcoded in v5-3-2-regression.test.ts line 42** — regeneration now requires an explicit code update alongside the fixture commit (Phase 88 snapshot-tripwire discipline).

KGATE-05 dual-threshold raw byte caps both still hold after the +193-byte shift — the 80% rendered cap (`floor(23,646 * 0.8) = 18,916`) has `18,484` well under, and the 65% knowledge-block cap holds by a comfortable margin.

## Test-Count Delta

| Snapshot                          | Test files | Tests                                         |
| --------------------------------- | ---------- | --------------------------------------------- |
| Phase 91 post-ship baseline       | 25         | 573                                           |
| Phase 92 plan-01 post-ship (this) | 26         | 606 (602 passing + 4 skipped)                 |
| Delta                             | +1         | +33 (29 new passing + 4 RLOK-03 placeholders) |

`pnpm test` 100% green. `pnpm tsc --noEmit` exits 0. Zero regressions in QT11-18 fixes, v5.3.1 prompt-size behaviour (`test/ai/prompt-size.test.ts`, `test/ai/rendered-prompt-snapshot.test.ts`), Phase 89/90/91 phase-local suites, or Phase 88 snapshot tripwire.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking issue] Adjusted POST_RLOK_04_BYTES literal**

- **Found during:** Task 2, first test run.
- **Issue:** The plan and Task 1 handoff reported `POST_RLOK_04_BYTES = 18484` (the `wc -c` byte-count from the fixture on disk). The test reads the file as `"utf8"` and measures `.length`, which is the JS UTF-16 code-unit count — not bytes. The fixture contains 209 multi-byte UTF-8 sequences (Spanish accents, em-dashes), so byte-count ≠ character-count.
- **Fix:** Set `POST_RLOK_04_BYTES = 18275` to match `readFileSync(SNAP_PATH, 'utf8').length`. JSDoc now explicitly documents the bytes-vs-chars distinction so the next regeneration cycle doesn't repeat the confusion.
- **Files modified:** `el-templo-bot/test/v5-3-2-regression.test.ts` (inline during Task 2, before commit).
- **Commit:** 8be1114b

**2. [Rule 3 — Blocking issue] Substituted E2A-gate inbound in STAGE-02 assertion**

- **Found during:** Task 2, writing the "non-E1A/E1B stages ignore the turn-count gate" assertion.
- **Issue:** The plan's draft used `'Foundation me interesa para empezar'` as an E2A inbound that `computeAdvanceSignals` should mark `discoveryAnswered=true` at turn=1. The E2A motivation/goals regex matches `quiero|busco|me gustaría|necesito|objetivo|meta|bajar|tonificar|fuerza|salud|aprender|mejorar|cambiar|...|skills?|destrabar|superar` — none of which appear in the planned string. `empezar` is in the E1A/E1B `level` category, not E2A. The assertion would fail.
- **Fix:** Replaced with `'quiero aprender skills'` — this matches both `quiero` and `skills` from the E2A regex and is the exact established lock from `playbook-advance.test.ts:709`. Preserves the contract under test (AND-gate does not apply outside E1A/E1B).
- **Files modified:** `el-templo-bot/test/v5-3-2-regression.test.ts` (inline during Task 2, before commit).
- **Commit:** 8be1114b

**3. [Rule 3 — Blocking issue] Tightened the RLOK-04 observable-shape match regex**

- **Found during:** Task 2, first test run.
- **Issue:** The plan's draft used `/\$\d[\d.,]*/g` to extract all `$`-prefixed numerals from the rendered prompt, then asserted every match was allowlisted. The pattern's `[\d.,]*` is greedy and consumes a trailing sentence period — `'Clase suelta: $20,000.'` matches as `$20,000.` which doesn't hit the `^\$20[.,]?000$` allowlist, even though the underlying amount IS in the allowlist.
- **Fix:** Replaced with `/\$\d+(?:[.,]\d+)*/g` which anchors the trailing chunk to require digit(s) after any `.` or `,` — so `$20,000` matches cleanly but the trailing period is excluded. Allowlist regex also tightened: `^\$(?:20[.,]?000|10[.,]?000)$`.
- **Files modified:** `el-templo-bot/test/v5-3-2-regression.test.ts` (inline during Task 2, before commit).
- **Commit:** 8be1114b

**4. [Rule 3 — Scope boundary clarification] RLOK-04 observable-shape includes `$10,000` anchor**

- **Found during:** Task 2, designing the "only per-class amounts remain" assertion.
- **Issue:** The plan's draft RLOK-04 describe block asserted every `$\d+` match is exactly `$20,000`. In reality, the post-RLOK-04 rendered prompt has three `$`-prefixed matches: `$20,000` (KFIX-02 carve-out, trial class), `$20,000` again (trial-class mention in Boarding Pass context), and `$10,000` (OBJECTIONS_SALES item 1 "Es caro" — per-class amortisation anchor at `knowledge.ts:361`, documented in the plan Task 1 note as intentionally retained and out of scope for the RLOK-04 regex matrix).
- **Fix:** Allowlist the retained `$10,000` per-class amortisation alongside `$20,000`. The canonical RLOK-04 contract (no `$80k / $100k / $250k`) remains the primary assertion; the new observable-shape assertion provides a tighter "nothing else can slip in" lock without expanding the plan's success criteria.
- **Rationale:** Plan Task 1 note explicitly says line 361 `$10,000` does NOT need to change and that the regex matrix only asserts `$80k/$100k/$250k` absence. The allowlist extension is consistent with Task 1's stated scope; the tighter "nothing else" lock is a genuine extra catch-net for future drift.
- **Files modified:** `el-templo-bot/test/v5-3-2-regression.test.ts` (inline during Task 2, before commit).
- **Commit:** 8be1114b

### Test Alignments

None. Zero existing assertions needed string-anchor updates for RLOK-04. The only tests that reach into the snapshot fixture are:

- `test/ai/rendered-prompt-snapshot.test.ts` — the Phase 88 tripwire reads the fixture at runtime and compares to `getSystemPrompt(...)`. Both sides shifted together (fixture regenerated from the same render function that now returns post-RLOK-04 content), so it stays green with zero code change.
- `test/ai/prompt-size.test.ts` — checks `getSystemPrompt(...).length ≤ floor(BASELINE_CHARS * 0.8)`; post-RLOK-04 render is SHORTER (JS length 18,280 → 18,275, net −5 chars), so the cap still holds.

## Atomic Commit

**Hash:** 8be1114b
**Branch:** feature/whatsapp-bot-scaffold
**Subject:** `feat(bot): close $80k SALES_TECHNIQUES leak + lock v5.3.2 regressions (92-01)`

**Files (3):**

| File                                                       | Status   | Lines                   |
| ---------------------------------------------------------- | -------- | ----------------------- |
| el-templo-bot/src/ai/knowledge.ts                          | modified | 4 ± (2 lines rewritten) |
| el-templo-bot/test/fixtures/pb1-e1a-lead-rendered.snap.txt | modified | 4 ± (snap regenerated)  |
| el-templo-bot/test/v5-3-2-regression.test.ts               | created  | +344                    |

Husky lint-staged ran clean (Prettier formatted the new test file).

## Hand-off to Plan 92-02 (RLOK-03 live-test)

Source-level locks are complete:

- RLOK-01: ✅ every Phase 89/90/91 fix has ≥1 behavioural assertion in `v5-3-2-regression.test.ts`
- RLOK-02: ✅ full `pnpm test` 100% green, snapshot regenerated, tsc clean
- RLOK-04: ✅ `$80,000` removed from both hits; non-numeric prose anchor present in render

**What plan 92-02 owns:**

- `v5-3-2-regression.test.ts` has 4 `it.skip` placeholders under the `RLOK-03` describe block (lines 303–313). Plan 92-02 fills the inline live-test transcript in `92-02-SUMMARY.md` and annotates pass/fail per criterion there. The `it.skip` entries stay skipped — they're visible reminders, not automated gates. (CONTEXT.md decision: live-test is user-scripted, Claude-annotated, inline in SUMMARY.)
- Four-path script: price-during-discovery (KFIX-02 empirical), method question (KFIX-03 elevator reach), discovery rejection (OBJN-01 WHY → BACK-OFF arc), Boarding Pass explanation (KFIX-04 dual-benefit).
- Failure handling: ≤2 retries per path; 3rd same-path failure → Phase 92.1 gap-closure with specific RLOK-03 sub-failure as new requirement.

## Self-Check: PASSED

- `el-templo-bot/test/v5-3-2-regression.test.ts` FOUND (created in this plan, committed at 8be1114b)
- `el-templo-bot/src/ai/knowledge.ts` FOUND (modified — both `$80,000` hits rewritten)
- `el-templo-bot/test/fixtures/pb1-e1a-lead-rendered.snap.txt` FOUND (regenerated — 18,484 bytes / 18,275 chars)
- Commit 8be1114b FOUND: `git log --oneline -1 8be1114b` shows `feat(bot): close $80k SALES_TECHNIQUES leak + lock v5.3.2 regressions (92-01)`
- `grep -l v5-3-2 el-templo-bot/test/*.ts` returns exactly `test/v5-3-2-regression.test.ts` — discoverability contract met
- `cd el-templo-bot && pnpm test` returned 602 passing + 4 skipped (606 total) across 26 test files — 100% green, strictly > Phase 91 baseline of 573
- `cd el-templo-bot && pnpm tsc --noEmit` exited 0
