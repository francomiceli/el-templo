---
phase: 99-bot-copy-and-price-disclosure-fixes
plan: 01
subsystem: bot-copy
tags: [bot, copy, prompt-anchoring, mica, calistenia, kgate-05, halt]

# Dependency graph
requires:
  - phase: 96.5-date-grounding-fix
    provides: "Frozen date kwargs regen discipline (D-03) used as the regen method for any future POST_RLOK_04_BYTES bump"
provides:
  - "Mica name-anchoring rule inside system-prompt.ts identity block (COPY-01) with explicit negative anchors (Micla, Mika, Mics)"
  - "Class-name rename to 'clases de calistenia' at all 3 verified hardcoded sites in knowledge.ts and system-prompt.ts (COPY-02)"
  - "5 communal/method preservation strings ('movimiento grupal', 'sin salirte del grupo', 'sin salirse del grupo', 'framings de arranque grupal', 'lenguaje de arranque grupal') confirmed byte-for-byte intact"
  - "Empirical KGATE-05 budget measurement: post-Tasks-1+2 rendered length = 19181 JS-chars, exceeds floor(BASELINE_CHARS*0.8)=18916 cap by 265 chars → HALT surfaced for human decision"
affects:
  [
    99-02,
    99-03,
    future Mica-anchor wording trims,
    future BASELINE_CHARS revision,
  ]

# Tech tracking
tech-stack:
  added: []
  patterns:
    [
      "prompt-anchoring with explicit negative examples (Mica anti-misspell), team-canonical-terminology rename without gutting communal/method language",
    ]

key-files:
  created: []
  modified:
    - el-templo-bot/src/ai/system-prompt.ts
    - el-templo-bot/src/ai/knowledge.ts

key-decisions:
  - "HALT on Task 3 per plan-sanctioned hard guard: NEW_BYTES (19181) > floor(BASELINE_CHARS*0.8) cap (18916); the snap regen was rolled back, POST_RLOK_04_BYTES NOT bumped, no third commit."
  - "Mica anchor bullet placed inside the existing 'Preguntas sobre mi identidad' block (after the 'Soy Mica…' self-intro bullet) so identity directives stay co-located."
  - "knowledge.ts:548 rewritten so the rename reads naturally — added 'dentro de las clases de calistenia' twice to absorb what 'dentro de la Sesion Grupal' carried, rather than mechanically swapping nouns."

patterns-established:
  - "Prompt-anchoring-only fix for name fidelity — outbound sanitization regex intentionally deferred per CONTEXT.md Negative space until prompt-anchoring proves insufficient in live use."
  - "Atomic 3-site class-name rename — single Task 2 commit covers knowledge.ts:548 + system-prompt.ts:275 + system-prompt.ts:327; preservation-string grep gates the diff."

requirements-completed: [COPY-01, COPY-02]

# Metrics
duration: ~13min
completed: 2026-06-23
---

# Phase 99 Plan 01: Bot copy and price disclosure fixes Summary

**Mica name-anchoring rule added to system-prompt identity block and 'Sesión Grupal' renamed to 'clases de calistenia' at 3 verified sites; Task 3 snapshot regen HALTED because the combined edits push the rendered prompt 265 chars above the locked ≥20% rendered-cap.**

## Performance

- **Duration:** ~13 min
- **Started:** 2026-06-23T21:13:00Z (approximate, wall-clock)
- **Completed:** 2026-06-23T21:25:50Z
- **Tasks:** 2 of 3 completed + 1 HALTED per plan-sanctioned hard guard
- **Files modified:** 2 (`el-templo-bot/src/ai/system-prompt.ts`, `el-templo-bot/src/ai/knowledge.ts`)

## Accomplishments

- **COPY-01 closed (Task 1 — commit `2d9f97a5`):** A new bullet inside the "Preguntas sobre mi identidad" block in `system-prompt.ts` explicitly names the wrong variants ("Nunca te llames Micla, Mika, Mics ni ninguna otra variante") so the LLM has a negative-example anchor against the live-test "Micla" garbling. Tuteo argentino preserved (escribilo, deformes, abrevies, corregilo). No outbound sanitization layer was introduced (per CONTEXT.md Negative space).
- **COPY-02 closed (Task 2 — commit `7e0ba612`):** The class-NAME _"Sesión Grupal"_ / _"Sesion Grupal"_ renamed to **"clases de calistenia"** at the 3 verified hardcoded sites:
  - `el-templo-bot/src/ai/knowledge.ts:548` — canonical class-name definition rephrased so the "niveles… dentro de las clases de calistenia" sentence reads naturally with the new noun.
  - `el-templo-bot/src/ai/system-prompt.ts:275` — "Longitud de respuesta" example.
  - `el-templo-bot/src/ai/system-prompt.ts:327` — level-vs-class rule in "Reglas de conversacion".
- **Preservation byte-check passed:** All 5 communal/method strings still match byte-for-byte (3 in `knowledge.ts` at :446/:448/:450, 2 in `definitions.ts` at :138/:147 — the latter file is UNCHANGED by this plan as required).
- **Scope fence held:** `el-templo-bot/src/playbooks/definitions.ts`, `webhook/handler.ts`, and `ai/tools.ts` UNCHANGED by this plan. No `el-templo-api/**` modifications. No price amounts hardcoded.

## Task Commits

1. **Task 1: Add Mica name-anchoring rule to system-prompt.ts identity section (COPY-01)** — `2d9f97a5` (feat)
2. **Task 2: Rename "Sesión Grupal" → "clases de calistenia" at 3 verified sites + preservation byte-check (COPY-02)** — `7e0ba612` (feat)
3. **Task 3: Regenerate post-RLOK-04 snapshot + bump POST_RLOK_04_BYTES if KGATE-05 fires (atomic regen)** — **HALTED** (no commit). See HALT section below.

**Plan metadata commit:** to be added by the docs(99-01) commit that includes this SUMMARY.md.

## Files Created/Modified

- `el-templo-bot/src/ai/system-prompt.ts` — 1 new identity bullet (Task 1) + 2 class-NAME renames (Task 2, at :275 and :327). Net 5 lines changed.
- `el-templo-bot/src/ai/knowledge.ts` — 1 rewritten sentence at :548 (Task 2).

## Decisions Made

- **Mica anchor placement:** Placed the new bullet AFTER the existing `"Soy Mica, del equipo de administración de El Templo 🙋‍♀️ ¿En qué te ayudo?"` bullet so it caps the identity block — the LLM reads the canonical self-intro first, then the anti-misspell guardrail. Co-locates with existing identity rules per Task 1 constraint.
- **knowledge.ts:548 rephrase:** Inserted "dentro de las clases de calistenia" twice (in the "niveles de progresion" middle clause and at the "nivel Alfa dentro de…" tail) rather than mechanically swapping nouns. This produces a sentence that reads naturally in Spanish and preserves the "clase ≠ nivel" pedagogical disambiguation that the original "dentro de la Sesion Grupal" phrasing carried.
- **HALT at Task 3 Step 4:** Per the plan's HARD GUARD wording in Task 3 ("If NEW_BYTES > that cap, STOP — … Roll back the snap regen and surface as a HALT in the SUMMARY — the wording in the new bullet needs trimming before this phase can ship"), the snap regen was rolled back via `git checkout -- el-templo-bot/test/fixtures/pb1-e1a-lead-rendered.snap.txt`. `POST_RLOK_04_BYTES` was NOT bumped. No third commit was created.

## Deviations from Plan

None of the auto-fix Rules 1–3 fired. The Task 3 HALT is a plan-sanctioned outcome, not a deviation.

### Process slip (documented for honesty, not a code deviation)

**1. [Process - git stash misuse] Used `git stash` once to compare pre-edit vs post-edit tsc baseline**

- **Found during:** Task 1 verification (when tsc reported 102 cross-repo errors and I wanted to confirm they predated my edit before installing api deps).
- **Issue:** The execute-plan workflow explicitly prohibits `git stash` inside a worktree (the stash list is shared across the main checkout and every linked worktree, which can cross-contaminate WIP). I read the prohibition AFTER the stash round-trip.
- **Outcome:** No contamination occurred (stash list happened to be empty at the time, no sibling worktrees pushed concurrent WIP, the popped stash matched the pushed stash). Edit survived (`grep -c "Tu nombre es Mica" = 1` post-pop). Verified via `git status --short` afterwards.
- **Mitigation:** Will not use `git stash` again for the rest of this execution. The sanctioned alternative for future verification (commit to a throwaway branch and `git checkout` back) is now front-of-mind.
- **Files affected:** None (process-only).
- **Committed in:** N/A (no code state changed from the stash round-trip).

---

**Total deviations:** 0 code/scope deviations. 1 process slip (git stash misuse, no contamination).
**Impact on plan:** None on shipped code. The HALT in Task 3 is a plan-sanctioned outcome, not a deviation.

## HALT — Task 3 surfaced for human decision

### Empirical measurement (Task 3 Step 1 + Step 2)

After Tasks 1+2 committed, `cd el-templo-bot && pnpm test --run test/v5-3-2-regression.test.ts` reported KGATE-05 firing on both:

- `RLOK-02: snapshot byte-equal lock` (rendered prompt diverged from on-disk snapshot — expected, snapshot pre-dates the edits)
- `snapshot byte-count equals POST_RLOK_04_BYTES` (JS-string length no longer 18,884)

Per Task 3 Step 2, the fixture was regenerated via the Phase 96.5 sanctioned method:

```bash
cd el-templo-bot && pnpm exec tsx -e \
  "import { getSystemPrompt } from './src/ai/system-prompt.ts'; \
   const out = getSystemPrompt({ clientState: 'lead', activePlaybook: 'PB1', \
     currentStage: 'E1A', todayISO: '2026-06-10', todayDayName: 'miércoles' }); \
   process.stdout.write(out);" \
  > test/fixtures/pb1-e1a-lead-rendered.snap.txt
```

Result:

- **NEW_BYTES (JS-string length):** `19181`
- **`wc -c` (UTF-8 byte-count on disk):** `19406`
- **`floor(BASELINE_CHARS * 0.8)` cap (BASELINE_CHARS = 23646):** `18916`
- **Overage:** `19181 - 18916 = 265 chars over the ≥20% rendered-cap`

Breakdown of the +297 char growth from baseline 18884 → 19181:

- Mica anchor bullet (Task 1, COPY-01): ~285 JS-chars (single-line bullet + leading newline; literal text from plan Task 1 `<action>`).
- Class-name rename (Task 2, COPY-02): ~+12 JS-chars net across the 3 sites — primarily from the longer noun phrase ("clases de calistenia" = 20 chars vs "Sesion Grupal" = 13) and the two "dentro de las clases de calistenia" insertions in knowledge.ts:548.

### Hard guard tripped

Per Task 3 `<action>` Step 4:

> If NEW_BYTES > that cap, STOP — this is a CONTEXT.md scope violation (the Mica anchor + rename collectively blow past the ≥20% rendered-cap guarantee). Roll back the snap regen and surface as a HALT in the SUMMARY — the wording in the new bullet needs trimming before this phase can ship.

Action taken:

1. `git checkout -- el-templo-bot/test/fixtures/pb1-e1a-lead-rendered.snap.txt` — fixture restored to the on-disk POST_RLOK_04_BYTES=18884 version.
2. `POST_RLOK_04_BYTES` in `el-templo-bot/test/v5-3-2-regression.test.ts:57` is **unchanged** (still 18884).
3. No third commit. `git status --short` is clean post-rollback.

### Current test state (informational — known RED until decision)

`cd el-templo-bot && pnpm test --run test/v5-3-2-regression.test.ts test/v5-3-3-date-grounding.test.ts test/system-prompt-playbook.test.ts test/ai/rendered-prompt-snapshot.test.ts` reports:

- **Test Files:** 3 failed | 1 passed (4)
- **Tests:** 5 failed | 54 passed (59)

Failing tests (all expected per the HALT condition — fixture predates the Task 1+2 edits and POST_RLOK_04_BYTES not bumped):

1. `v5-3-2-regression.test.ts` — `RLOK-02: snapshot byte-equal lock` (rendered diverged from on-disk snapshot)
2. `v5-3-2-regression.test.ts` — `snapshot byte-count equals POST_RLOK_04_BYTES` (rendered length 19181 ≠ 18884 constant)
3. `v5-3-2-regression.test.ts` — `rendered PB1.E1A lead prompt length ≤ floor(BASELINE_CHARS * 0.8)` (19181 > 18916 — this is the hard-guard trip)
4. `system-prompt-playbook.test.ts` — snap consumer (#313-319 region) diverged
5. `ai/rendered-prompt-snapshot.test.ts:48` — byte-equal consumer diverged

The 1 passing file is `v5-3-3-date-grounding.test.ts` (decoupled from the byte-equal snap).

### Resume options (human decision required before this phase can ship)

| Option                                            | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Effort | Pros                                                                                                                       | Cons                                                                                                                                                                                                                                                        |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Trim Mica anchor wording (recommended)**     | Shorten the new bullet to ≤~20 chars (the headroom under the cap after the rename's ~+12 chars). E.g.: `"*Tu nombre es Mica* — siempre exacto. Nunca Micla, Mika, ni Mics."` (~70 chars vs current ~285 chars). Keeps both `"Tu nombre es Mica"` and `"Nunca te llames Micla"` substrings? Need to verify — the example above breaks the literal `"Nunca te llames Micla"` substring required by Task 1 done-criterion. A safer trim: `"*Tu nombre es Mica* — exacto siempre. Nunca te llames Micla, Mika ni Mics."` (~85 chars). Still over budget by ~50 chars but within reach of a second trim pass. | Low    | Stays within the locked rendered-cap; no test percentage changes; preserves both required substrings if phrased carefully. | Loses the "si por error te referís a vos misma, corregilo en el siguiente turno" self-correction directive — that piece of the negative anchor is weakened.                                                                                                 |
| **B. Revise BASELINE_CHARS / rendered-cap %**     | Bump `BASELINE_CHARS` upward or relax the `0.8` multiplier in `v5-3-2-regression.test.ts:321` and the bot's KGATE-05 contract.                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Medium | Preserves the Mica anchor verbatim.                                                                                        | Plan Task 3 explicitly forbids this: _"The ≥20% rendered-cap (`rendered length ≤ floor(BASELINE_CHARS _ 0.8)`) and the ≥35% knowledge-block cap are intentionally immutable across Phase 99"\* (Task 3 Constraints). Requires a CONTEXT.md decision update. |
| **C. Revert COPY-02 only and ship COPY-01 alone** | Revert commit `7e0ba612` (Task 2). Reclaims ~12 JS-chars. NEW_BYTES becomes ~19169, still 253 over cap — does NOT solve the problem.                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Low    | —                                                                                                                          | Does not unlock shipping. Discarded.                                                                                                                                                                                                                        |
| **D. Defer the entire plan and re-plan**          | Roll back commits `2d9f97a5` and `7e0ba612`, replan with the cap as a binding constraint.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | High   | Clean slate.                                                                                                               | Loses the work done; would re-design Mica anchor with the budget as a first-class input.                                                                                                                                                                    |

**Recommended:** Option A (trim the Mica anchor). The two literal substrings the verify gate requires (`"Tu nombre es Mica"` and `"Nunca te llames Micla"`) can both survive a trim that drops the self-correction sentence. The self-correction directive is the most dispensable piece — naming the variants is the load-bearing part of the anchor (per CONTEXT.md Issue 1 "explicit negative-example anchor"). A tightened phrasing like:

> `*Tu nombre es Mica* — escribilo siempre así. Nunca te llames Micla, Mika ni Mics.`

is ~95 JS-chars vs the current ~285. Net savings ≈ 190 chars, which moves NEW_BYTES from 19181 → ~18991, still ~75 chars over the 18916 cap. A second trim of the rename phrasing in knowledge.ts:548 ("dentro de las clases de calistenia" → "dentro de las clases de calistenia" can stay; alternatively rephrase the "Si alguien busca 'calistenia alfa', explicar que empieza en nivel Alfa dentro de las clases de calistenia." tail to drop "dentro de las clases de calistenia" since the preceding clause already establishes the noun) can recover the remaining ~75 chars.

### What is committed and stable

- Tasks 1 + 2 are committed (`2d9f97a5`, `7e0ba612`).
- Working tree is clean (no uncommitted changes after rollback).
- All preservation strings byte-for-byte intact.
- `definitions.ts` UNCHANGED by this plan.
- `tsc --noEmit` exits 0 on `el-templo-bot/`.
- Bot tests are RED on the snap-coupled paths (5 of 59) until the cap question is resolved.

## HALT Resolution — Option A applied with extension

**Decision:** User selected Option A (trim Mica anchor wording, no policy change). Executed inline by orchestrator after the worktree agent returned, since the SendMessage tool wasn't available to resume the same agent. Commits landed directly on `feature/whatsapp-bot-scaffold` after cherry-picking the worktree-agent commits onto the main branch.

**Two-phase trim** (Option A's two listed trims weren't sufficient on their own — saved 212/265 needed):

Phase A.1 — Mica anchor primary trim (commit `ef2d066a`, jointly with A.2 + extras):

- Dropped: `"Si por error te referís a vos misma con otro nombre, corregilo en el siguiente turno."` → −86 chars rendered. (Estimate was ~190; reality 86.)

Phase A.2 — knowledge.ts:548 tail trim (same commit `ef2d066a`):

- Dropped: `Si alguien busca "calistenia alfa", explicar que empieza en nivel Alfa dentro de las clases de calistenia.` tail sentence (search-keyword hint, redundant with the level-vs-class definition above).
- Replaced: `dentro de las clases de calistenia` → `dentro de ellas` (mid-sentence antecedent is clear).
- Net for A.2: −126 chars rendered.

**Cumulative after A.1 + A.2:** 19181 → 18969 (212 saved, 53 still over cap).

Phase A.3 — Authorised micro-trims (user-approved in a second AskUserQuestion after A.1/A.2 measurement revealed the original estimates were off; same commit `ef2d066a`):

- Mica anchor: `"escribilo siempre exactamente así, nunca lo deformes ni lo abrevies"` → `"escribilo siempre así, nunca lo deformes"` (~26 chars saved).
- Mica anchor: dropped `Mics` from variant list (~6 chars).
- knowledge.ts:548: dropped `, no actividades separadas` (level-vs-class distinction already carried by "son niveles de progresion dentro de ellas") (~25 chars).
- Net for A.3: −59 chars rendered.

**Final rendered length:** **18910 JS-chars (6 chars under the 18916 cap).**

### Final state of the Mica anchor (system-prompt.ts:338, post-trim)

```
- *Tu nombre es Mica* — escribilo siempre así, nunca lo deformes. Nunca te llames Micla, Mika ni ninguna otra variante.
```

Verify-gate substrings both present and grep-passing:

- `"Tu nombre es Mica"` ✓
- `"Nunca te llames Micla"` ✓

### Final state of knowledge.ts:548 (post-trim)

```
*Importante:* Todas las clases son *clases de calistenia*. Alfa, Delta, Omega y Spartan son *niveles de progresion* dentro de ellas. En cada clase conviven alumnos de distintos niveles y los profesores adaptan los ejercicios.
```

(Lost: the trailing `"Si alguien busca 'calistenia alfa'..."` search-keyword hint. If keyword-routing degrades in live use, a future phase can re-add a compact form within the new byte budget.)

### Resolution commits

- `ef2d066a` — `fix(99-01): trim copy to fit KGATE-05 cap (≥20% rendered ≤ 18916)` — applies all of A.1 + A.2 + A.3.
- `1ba7e49e` — `test(99-01): regen pb1-e1a-lead-rendered snap + bump POST_RLOK_04_BYTES (Task 3)` — atomic regen of the fixture + bump 18884 → 18910 + JSDoc history paragraph documenting the Phase 99 regen and date-kwarg discipline.

### Post-resolution test state

`cd el-templo-bot && pnpm test --run test/v5-3-2-regression.test.ts test/v5-3-3-date-grounding.test.ts test/system-prompt-playbook.test.ts test/ai/rendered-prompt-snapshot.test.ts` reports:

- **Test Files:** 4 passed (4)
- **Tests:** 59 passed (59)

All snap-consuming tests green. ≥20% rendered-cap holds at 18910 ≤ 18916. ≥35% knowledge-block cap unchanged.

### Orchestrator process notes (audit trail)

- The worktree agent (`agent-a6a4d58520e5670d2`) correctly halted on the cap overage and surfaced 4 options (A/B/C/D) without self-overriding the cap. Per memory `feedback_verifier_unauthorized_overrides`, this was the right behavior.
- SendMessage tool unavailable → orchestrator cherry-picked the worktree-agent's 3 commits (`2d9f97a5`, `7e0ba612`, `c54284ef`/SUMMARY) onto `feature/whatsapp-bot-scaffold` and completed the resolution inline.
- Original commits on the worktree branch (`worktree-agent-a6a4d58520e5670d2`) preserved as `2d9f97a5`/`7e0ba612`/`3a3e4f9e`. Cherry-pick replays on main: `53c43e85`/`4d219fb9`/`c54284ef`.
- Two AskUserQuestion turns were used (A vs B/C/D, then "4 micro-trims" vs escalate) — both explicitly authorised by the user. No silent policy changes.

## Issues Encountered

- **tsc cross-repo type-resolution noise (pre-existing):** Initial `pnpm exec tsc --noEmit` reported 102 errors, all from `../el-templo-api/src/db/schema/*` (the bot's `tsconfig.json` `include` array references api schema files for shared drizzle types, but api `node_modules` was not installed in this worktree). Resolved by running `pnpm install --prefer-offline` in `el-templo-api/`. Confirmed pre-existing by checking pre-edit baseline (102 errors before, 102 errors after the Task 1 edit). Not a code deviation, just worktree setup.
- **KGATE-05 cap overage (HALT condition, plan-sanctioned):** Documented in the HALT section above.

## Self-Check: PASSED

Files claimed to be created/modified all verified to exist on disk and match git state:

- `el-templo-bot/src/ai/system-prompt.ts` — FOUND, contains `"Tu nombre es Mica"` (1 hit), `"Nunca te llames Micla"` (1 hit), `"clases de calistenia"` (2 hits), and ZERO `sesi[oó]n grupal` matches in non-comment lines. Committed in `2d9f97a5` (Mica anchor) + `7e0ba612` (rename).
- `el-templo-bot/src/ai/knowledge.ts` — FOUND, contains `"clases de calistenia"` (1 hit), `"movimiento grupal"` (1 hit), `"sin salirte del grupo"` (1 hit), `"sin salirse del grupo"` (1 hit). Committed in `7e0ba612`.
- `el-templo-bot/src/playbooks/definitions.ts` — UNCHANGED by this plan. Still contains `"framings de arranque grupal"` (1 hit) and `"lenguaje de arranque grupal"` (1 hit).
- `el-templo-bot/test/fixtures/pb1-e1a-lead-rendered.snap.txt` — UNCHANGED (rollback applied; on-disk byte-count matches pre-edit POST_RLOK_04_BYTES=18884).
- `el-templo-bot/test/v5-3-2-regression.test.ts` — UNCHANGED (POST_RLOK_04_BYTES still 18884).

Commits claimed exist:

- `2d9f97a5` — FOUND (`feat(99-01): add Mica name-anchoring rule to identity block (COPY-01)`)
- `7e0ba612` — FOUND (`feat(99-01): rename class-name to 'clases de calistenia' at 3 sites (COPY-02)`)

## Next Phase Readiness

- **HALT RESOLVED — plan 99-01 fully shipped.** All 3 tasks complete + cap-trim resolution. 4 commits on `feature/whatsapp-bot-scaffold` (`53c43e85` Task 1 / `4d219fb9` Task 2 / `c54284ef` initial HALT SUMMARY / `ef2d066a` cap-trim resolution / `1ba7e49e` Task 3 regen + bump). One more commit (this SUMMARY amendment) closes the loop.
- **Plan 99-02 (wave 2)** is unblocked. PRICE work touches `definitions.ts` / `handler.ts` / `tools.ts` / `playbook-state.ts` / `system-prompt.ts` (addendum const, no cap impact at PB1.E1A render) and does not consume the snap fixture byte budget materially. Per CONTEXT.md `<scope_fence>`, 99-02 stays bot-side only; HARD GUARD verifies zero `el-templo-api/src/**` changes.
- **Plan 99-03 (wave 3)** writes integration tests in `el-templo-api/test/whatsapp/`. The Mica name verify-gate test should grep for `"Tu nombre es Mica"` and `"Nunca te llames Micla"` (both present in the final trimmed anchor — already specified in 99-03 Task 1). The 99-03 source-text test for `"clases de calistenia"` must account for the trimmed knowledge.ts:548 (no `"Si alguien busca"` tail). 99-03 Task 1's count assertion (`>= 1` in knowledge.ts) is unchanged; no test edits needed pre-execution.
- **KGATE-05 byte budget for future phases:** `POST_RLOK_04_BYTES` now 18910 (was 18884). Remaining headroom under the ≥20% rendered-cap = 18916 − 18910 = **6 chars**. The next phase that adds prompt copy MUST either trim or carry a budget-bumping task — Phase 100/follow-ups should not casually add prompt prose at the lead render.

---

_Phase: 99-bot-copy-and-price-disclosure-fixes_
_Completed: 2026-06-23_
