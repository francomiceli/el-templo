---
phase: 83-discovery-mode-for-leads
plan: 02
subsystem: ai
tags: [whatsapp-bot, playbook-engine, redis, system-prompt, profile-tag, vitest, pino]

# Dependency graph
requires:
  - phase: 82-playbook-engine
    provides: PlaybookSessionState shape, getPlaybookState/setPlaybookState Redis helpers, resolvePlaybook + advanceStageIfComplete, single-key playbook section injection in getSystemPrompt
provides:
  - AvatarProfile string-literal union (4 avatars) as the v5.3 source of truth
  - Optional avatar field on PlaybookSessionState (backward compatible with phase 82 entries)
  - Pure profile-tag parser module with extractProfileTag, stripProfileTag, PROFILE_TAG_REGEX
  - Webhook handler wiring that reads/persists/strips the <profile> tag across the AI loop
  - "Detección de perfil" directive injected into the system prompt only during PB1 + no-prior-avatar
  - "Perfil detectado" directive injected when an avatar is already known, suppressing re-detection
affects: [phase-83 (PB1 stage progression), phase-85 (per-avatar tone blocks), phase-84 (cancellation/state-section refactor)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Hybrid LLM + structured tag detection: model emits a parser-friendly tag, handler parses + persists + strips before send"
    - "Three-write-site avatar preservation: detectedAvatar ?? priorAvatar passed into every setPlaybookState call to prevent clobber"
    - "Conditional system-prompt directive injection (PB1 + !currentAvatar) avoids file-level conflicts with parallel plans editing definitions.ts"

key-files:
  created:
    - el-templo-bot/src/playbooks/profile-tag.ts
    - el-templo-bot/test/playbook-profile-tag.test.ts
  modified:
    - el-templo-bot/src/playbooks/types.ts
    - el-templo-bot/src/memory/playbook-state.ts
    - el-templo-bot/src/webhook/handler.ts
    - el-templo-bot/src/ai/system-prompt.ts

key-decisions:
  - "Strategy C (hybrid LLM + structured tag) chosen over rule-based (A) and tool-call (B): A cannot handle Spanish nuance like 'vengo de crossfit', B burns an extra model turn for one enum write"
  - "Profile-detection directive lives in system-prompt.ts (not definitions.ts) to avoid file-level conflict with parallel plan 83-01"
  - "Avatar field is optional + nullable on PlaybookSessionState to keep phase 82 Redis entries deserializable"
  - "Stripping runs BEFORE updateSession AND BEFORE sendTextMessage so neither session history nor users ever see the tag"
  - "Three potential setPlaybookState writes per turn (pre-AI, new-detection, stage-advance) all carry the avatar via detectedAvatar ?? priorAvatar to prevent clobber"

patterns-established:
  - "Pure-parser modules in src/playbooks/: no IO, no logger, no Date, exhaustive Vitest unit coverage"
  - "Conditional system-prompt sections gated on resolved playbook + Redis state (PB1 + no avatar → detection directive; any + has avatar → known-avatar section)"

requirements-completed: [DISC-05]

# Metrics
duration: 38min
completed: 2026-04-07
---

# Phase 83 Plan 02: Profile Tag Detection & Persistence Summary

**Hybrid LLM + structured `<profile>` tag detection wired through the PB1 discovery flow: pure parser, Redis persistence, conditional system-prompt directives, and 22 unit tests — with zero overlap with parallel plan 83-01.**

## Performance

- **Duration:** 38 min
- **Started:** 2026-04-07T19:41:48Z
- **Completed:** 2026-04-07T20:20:12Z
- **Tasks:** 3
- **Files modified:** 4 (+2 created)

## Accomplishments

- `AvatarProfile` 4-avatar union exported from `playbooks/types.ts`, aligned with the v5.3 simplification decision
- New pure module `playbooks/profile-tag.ts` with `extractProfileTag`, `stripProfileTag`, and `PROFILE_TAG_REGEX` — no IO, no mutation, idempotent
- Webhook handler now reads `priorAvatar` from Redis playbook state, passes it to `getSystemPrompt` as `currentAvatar`, parses any new `<profile>` tag from the AI reply, persists it via `setPlaybookState`, and strips it from the outbound text before `updateSession` + `sendTextMessage`
- All three `setPlaybookState` write sites in the handler (pre-AI, new-detection, stage-advance) preserve the avatar via the `detectedAvatar ?? priorAvatar` pattern, eliminating clobber
- `getSystemPrompt` injects a "Detección de perfil" directive only when `activePlaybook === "PB1"` AND no avatar is set; once an avatar is detected, that directive is replaced by a "Perfil detectado" section telling Mica not to re-run discovery
- 22 new Vitest unit tests covering valid detection (4 avatars), invalid value rejection, missing/empty input, malformed tags, case-insensitive tag names, whitespace tolerance, AvatarProfile parity, determinism, and stripping correctness incl. input immutability
- Full bot suite green: 14 files / 265 tests (was 243)

## Task Commits

Each task was committed atomically:

1. **Task 1: AvatarProfile type + currentAvatar prompt section** — `12951844` (feat)
2. **Task 2: profile-tag parser module + handler wiring** — `c8b28afc` (feat)
3. **Task 3: profile-tag unit tests** — `af85be6b` (test)

## Files Created/Modified

- `el-templo-bot/src/playbooks/profile-tag.ts` — New pure parser module with `extractProfileTag`, `stripProfileTag`, and `PROFILE_TAG_REGEX`
- `el-templo-bot/test/playbook-profile-tag.test.ts` — 22 Vitest unit tests covering the parser contract
- `el-templo-bot/src/playbooks/types.ts` — Added `AvatarProfile` union and optional `avatar?: AvatarProfile | null` field on `PlaybookSessionState`
- `el-templo-bot/src/memory/playbook-state.ts` — Doc-only update noting backward-compatible schema evolution
- `el-templo-bot/src/webhook/handler.ts` — Imports parser, reads `priorAvatar`, passes `currentAvatar` to `getSystemPrompt`, extracts/persists/strips `<profile>` tag post-AI, preserves avatar across all 3 `setPlaybookState` write sites
- `el-templo-bot/src/ai/system-prompt.ts` — Added `currentAvatar?` option, "Perfil detectado" section when avatar is known, and conditional "Detección de perfil" directive when `activePlaybook === "PB1"` AND `!currentAvatar`

## Decisions Made

- **Strategy C (hybrid LLM + structured tag)** — Pure rules can't handle Spanish nuance ("vengo de crossfit" → gym_crossover); a dedicated tool would burn an extra model turn for one enum write. The hybrid approach reuses the existing turn, keeps parsing pure-testable, and degrades silently (no false positives) when the model omits or malforms the tag.
- **Detection directive lives in system-prompt.ts**, not in `definitions.ts`. Plan 83-01 runs in the same wave and owns `definitions.ts` entirely, so co-locating the directive there would cause a merge conflict. The conditional injection in `getSystemPrompt` is functionally equivalent and ships with zero file overlap.
- **Avatar field is optional + nullable** on `PlaybookSessionState` so phase 82 entries already in Redis (without an `avatar` field) keep deserializing cleanly with `avatar === undefined`.
- **Strip runs twice up the call stack** — before `updateSession` (so the assistant message stored in session history is clean) and before `sendTextMessage` (so users never see the tag). Doing it once would leak into one of the two sinks.
- **Three-write-site avatar preservation pattern** — Every `setPlaybookState` call site (pre-AI, new-detection, stage-advance) explicitly carries `detectedAvatar ?? priorAvatar ?? undefined`. Forgetting any one of them would clobber a freshly-detected avatar to `undefined` mid-turn.

## Deviations from Plan

None — plan executed exactly as written. All three tasks landed in the order specified, with the targeted typecheck + test invocations passing on the first attempt and the full bot suite ending at the expected ≥259 tests (actual 265).

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required. Detection is fully model-driven and the parser is pure.

## Next Phase Readiness

- Phase 83-03 / 83-04 (PB1 stage progression + integration tests) can read the detected avatar from Redis via the existing `getPlaybookState` helper.
- Phase 85 (AVAT-01, AVAT-02) will replace the lightweight "Perfil detectado" line with full per-avatar tone blocks — the data flow is now in place.
- DISC-05 closed: detection + persistence + strip + re-injection are all live behind the `activePlaybook === "PB1"` gate.

## Self-Check: PASSED

Verified files exist:

- FOUND: el-templo-bot/src/playbooks/profile-tag.ts
- FOUND: el-templo-bot/test/playbook-profile-tag.test.ts
- FOUND: el-templo-bot/src/playbooks/types.ts (AvatarProfile + avatar field)
- FOUND: el-templo-bot/src/memory/playbook-state.ts (schema-evolution docblock)
- FOUND: el-templo-bot/src/webhook/handler.ts (imports + 3 write sites + extract/strip)
- FOUND: el-templo-bot/src/ai/system-prompt.ts (currentAvatar option + 2 conditional sections)

Verified commits exist on feature/whatsapp-bot-scaffold:

- FOUND: 12951844 (Task 1)
- FOUND: c8b28afc (Task 2)
- FOUND: af85be6b (Task 3)

Verified tests:

- 22 new tests in playbook-profile-tag suite (≥16 required)
- Full bot suite: 14 files / 265 tests, all green

---

_Phase: 83-discovery-mode-for-leads_
_Completed: 2026-04-07_
