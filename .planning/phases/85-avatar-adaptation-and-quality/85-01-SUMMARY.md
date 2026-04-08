---
phase: 85-avatar-adaptation-and-quality
plan: 01
subsystem: ai-prompt
tags: [system-prompt, playbook-resolver, avatar-profiles, mica, spanish, vitest]

requires:
  - phase: 83-discovery-mode-for-leads
    provides: "Avatar detection + Redis 6h TTL persistence feeding currentAvatar into getSystemPrompt"
  - phase: 82-playbook-engine
    provides: "Pure resolver + PLAYBOOKS registry + session reuse contract this plan extends with Rule 2.5"
provides:
  - "AVATAR_TONE_GUIDES const: 4 distinct Spanish tone blocks (cero_absoluto, gym_crossover, intermedio, retorna)"
  - "Tone guide injection for ALL playbooks (PB1-PB5), not just discovery"
  - "Resolver Rule 2.5: lead + known avatar + no in-flight stage -> PB1.E4 (skip discovery)"
  - "avatar-tone-guide.test.ts: 29-case Vitest suite locking AVAT-01 + AVAT-05 contracts"
affects: [phase-85-02, v5.3-regression, future avatar additions]

tech-stack:
  added: []
  patterns:
    - "Exhaustive Record<AvatarProfile, T> forces compile-time coverage of all avatars"
    - "Resolver rule insertion between session-reuse and fresh-mapping preserves prior contract"
    - "Source-of-truth keyword map in test file (not in prod code) keeps AVAT-05 contract explicit"

key-files:
  created:
    - "el-templo-bot/test/avatar-tone-guide.test.ts"
  modified:
    - "el-templo-bot/src/ai/system-prompt.ts"
    - "el-templo-bot/src/playbooks/resolver.ts"
    - "el-templo-bot/test/playbook-resolver.test.ts"

key-decisions:
  - "Tone guide injection is unconditional on activePlaybook so returning leads keep adapted tone in PB2-PB5, not only PB1"
  - "Rule 2.5 uses a PLAYBOOKS.PB1 lookup (not a bare 'PB1.E4' literal) so a future stage rename surfaces at test time"
  - "Rule 2.5 placed AFTER Rule 2 so in-flight discovery stages still win — no regression vs phase 82 session-reuse contract"
  - "AVATAR_KEYWORDS source-of-truth lives in the test file, not in prod code — AVAT-05 contract is the test, not an exported const"
  - "Guide blocks use lowercase keywords so WhatsApp bold asterisks don't fragment the substring search"

patterns-established:
  - "Per-avatar prompt content: one const map, exhaustive Record, render via dictionary lookup"
  - "Resolver extension: insert new rules by number between existing ones, update docblock, add describe block"

requirements-completed: [AVAT-01, AVAT-02, AVAT-05]

duration: 18min
completed: 2026-04-08
---

# Phase 85 Plan 01: Avatar-adapted tone + skip-discovery-for-returning-leads Summary

**Per-avatar Tone Guides (4 Spanish blocks) injected into the system prompt for ALL playbooks plus a resolver Rule 2.5 that routes returning leads with a known avatar straight to PB1.E4 instead of re-asking discovery questions.**

## Performance

- **Duration:** ~18 min
- **Started:** 2026-04-08T02:00Z
- **Completed:** 2026-04-08T02:18Z
- **Tasks:** 3
- **Files modified:** 4 (3 existing + 1 new)

## Accomplishments

- Replaced the phase 83-02 1-line "Perfil detectado" stub with a full `AVATAR_TONE_GUIDES: Record<AvatarProfile, string>` const carrying 4 distinct Spanish tone blocks (framing + 3-4 tone rules + propuesta anchor + 2 unique keywords each)
- Tone guide injects for EVERY active playbook when an avatar is known — a returning `gym_crossover` lead who later enters PB2 still hears adapted tone (AVAT-01)
- Added resolver Rule 2.5: `(clientState=lead && session.avatar set && no in-flight stage) → PB1.E4`, skipping E1A/E1B/E2A/E2B/E3 discovery questions the avatar has already answered (AVAT-02)
- Resolver purity invariant preserved: zero new imports, zero IO, zero Date, zero console — verified by grep
- New `avatar-tone-guide.test.ts`: 29 cases across 6 describe blocks covering per-avatar keyword presence, cross-avatar uniqueness (12 pairs), PB1-PB5 applicability, absent-when-no-avatar, Perfil detectado header compat, and determinism
- Extended `playbook-resolver.test.ts` with 11 new cases (4 avatars + 6 negative/edge + 1 cancellation-still-wins regression)
- Full bot suite: **393/393 green** (was 353 baseline; +40 tests)
- `handler.ts`, `definitions.ts`, `advance.ts` empty diff vs pre-plan baseline — scope held

## Task Commits

1. **Task 1: AVATAR_TONE_GUIDES const + injection in system-prompt.ts** — `b5f16a72` (feat)
2. **Task 2: Resolver Rule 2.5 skip-to-recommendation** — `09930ad6` (feat)
3. **Task 3: avatar-tone-guide.test.ts (AVAT-01 + AVAT-05 contract)** — `293b7f31` (test)

## Files Created/Modified

- `el-templo-bot/src/ai/system-prompt.ts` — Added `AVATAR_TONE_GUIDES` const (4 blocks, ~70 lines), replaced stub injection, kept phase 83-02 PB1 detection directive untouched
- `el-templo-bot/src/playbooks/resolver.ts` — Added Rule 2.5 block after session-reuse, updated rules docblock, no new imports
- `el-templo-bot/test/playbook-resolver.test.ts` — Added `sessionWithAvatar` helper + `Rule 2.5 phase 85 skip-to-recommendation` describe block (11 cases)
- `el-templo-bot/test/avatar-tone-guide.test.ts` — NEW, 29 cases across 6 describe blocks

## Decisions Made

- **Tone guide applies to PB1-PB5, not just PB1:** AVAT-01 success criterion is "Mica adapts tone for each avatar" without scoping to discovery. A `gym_crossover` lead converting to `trial` should keep the same voice.
- **Rule 2.5 routes to PB1.E4 (not PB1.E5):** E4 is the targeted recommendation stage. Skipping to E5 would skip the personalization itself; the advance.ts E4→E5 transition already exists from phase 83-03 and fires on the next reply.
- **Rule 2.5 is lead-only:** AVAT-02 is scoped to discovery. PB2-PB5 have their own state-driven entry stages; the tone guide still adapts their voice without needing a skip rule.
- **Registry lookup over bare literal for PB1.E4:** `PLAYBOOKS.PB1.stages.find(s => s.id === "PB1.E4")?.id ?? PLAYBOOKS.PB1.entryStageId` degrades safely if the stage is ever renamed.
- **Source-of-truth keyword map lives in the test file:** AVATAR_TONE_GUIDES is Spanish prose; AVATAR_KEYWORDS in the test file is the explicit contract the prose must honor. If the prose is reworded, the test fails — exactly the forcing function we want.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Capitalization mismatch for gym_crossover keyword "ya tenés base"**

- **Found during:** Task 3 (first test run)
- **Issue:** The first draft of `AVATAR_TONE_GUIDES.gym_crossover` wrote `*Ya tenés base*` at sentence start (capital Y, wrapped in WhatsApp bold). The AVAT-05 contract keyword is lowercase `"ya tenés base"`, so `toContain` failed.
- **Fix:** Rephrased the intro sentence so `ya tenés base` appears mid-sentence, lowercase, without bold-asterisk fragmentation.
- **Files modified:** `el-templo-bot/src/ai/system-prompt.ts`
- **Verification:** Full avatar-tone-guide test suite 29/29 green after fix.
- **Committed in:** `293b7f31` (bundled with Task 3)

---

**Total deviations:** 1 auto-fixed (1 Rule 1 bug)
**Impact on plan:** Trivial — source wording adjusted to honor the test-locked contract. No scope creep.

## Issues Encountered

- None beyond the deviation above.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- AVAT-01, AVAT-02, AVAT-05 closed. Phase 85's remaining plan(s) can focus on full v5.3 regression and any end-to-end avatar-driven flow tests.
- Contract is enforced at three levels: compile-time (exhaustive Record), unit-test (keyword contract), and full-suite regression (393/393).
- No blockers.

---

_Phase: 85-avatar-adaptation-and-quality_
_Completed: 2026-04-08_

## Self-Check: PASSED

Verified:

- FOUND: el-templo-bot/src/ai/system-prompt.ts (AVATAR_TONE_GUIDES const, 2 matches)
- FOUND: el-templo-bot/src/playbooks/resolver.ts (Rule 2.5, PB1.E4 reference)
- FOUND: el-templo-bot/test/avatar-tone-guide.test.ts (new file, 29 tests)
- FOUND: el-templo-bot/test/playbook-resolver.test.ts (Rule 2.5 describe block)
- FOUND commit b5f16a72 (Task 1)
- FOUND commit 09930ad6 (Task 2)
- FOUND commit 293b7f31 (Task 3)
- Full bot suite: 393/393 green
- Resolver purity grep: 0 matches for console/Date/redis/logger
- definitions.ts, handler.ts, advance.ts empty diff vs pre-plan baseline
