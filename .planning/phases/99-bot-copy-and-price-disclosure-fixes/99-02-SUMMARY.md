---
phase: 99-bot-copy-and-price-disclosure-fixes
plan: 02
subsystem: bot-price-disclosure
tags:
  [
    bot,
    price-disclosure,
    playbook-state,
    redis,
    counter,
    prompt-injection,
    check_membership,
  ]

# Dependency graph
requires:
  - phase: 99-bot-copy-and-price-disclosure-fixes
    plan: 01
    provides: "Mica anchor + clases-de-calistenia rename (COPY-01/02) shipped at final POST_RLOK_04_BYTES=18910 with 6-char headroom under KGATE-05 cap"
provides:
  - "PB1 price-insistence counter persisted per-conversation in `wa:playbook:<phone>` Redis hash via the existing playbook-state JSON serialization (PRICE-01)"
  - "Single tunable PB1_PRICE_INSISTENCE_THRESHOLD constant + env override at el-templo-bot/src/playbooks/constants.ts (default 2 → unlock on 3rd insistence) + shouldDisclosePrices() helper (PRICE-02)"
  - "Conditional PB1 disclosure-unlocked prompt addendum in system-prompt.ts (Sub-option A: definitions.ts:74 REGLA FUERTE UNCHANGED; addendum is purely additive when disclosureUnlocked && activePlaybook === 'PB1') (PRICE-02)"
  - "check_membership lead-branch fix: formatAvailablePlans() helper appended to the preserved 'No encontré una cuenta...' prefix so leads now receive real DB plan prices; same helper refactor-reused by the existing no-active-subscription branch (DRY) (PRICE-03)"
  - "PB2.E2 'Objeción precio' script rewritten to instruct the LLM to call check_membership and read prices from the tool result instead of emitting literal `[plan_básico]`/`[precio]` placeholder text (PRICE-03)"
affects:
  [
    99-03,
    PB1 turn-by-turn behavior for price-insisting leads,
    PB2.E2 LLM-emitted scripts,
    check_membership tool output shape for prospects without users-row,
  ]

# Tech tracking
tech-stack:
  added: []
  patterns:
    [
      "single-source-of-truth regex extracted into a helper (detectPriceObjection) to satisfy CONTEXT.md no-parallel-regex constraint",
      "conditional prompt-addendum injection with belt-and-suspenders PB1 gate (handler computes + prompt rebuilds same check) for additive-only Sub-option A discipline",
      "shared formatAvailablePlans helper appended to multiple branches with graceful-degrade-to-bare-prefix on empty plan listing",
    ]

key-files:
  created:
    - el-templo-bot/src/playbooks/constants.ts
  modified:
    - el-templo-bot/src/playbooks/types.ts
    - el-templo-bot/src/ai/system-prompt.ts
    - el-templo-bot/src/webhook/handler.ts
    - el-templo-bot/src/playbooks/definitions.ts
    - el-templo-bot/src/ai/tools.ts
    - el-templo-bot/.env.example

key-decisions:
  - "Comparison choice: shouldDisclosePrices uses STRICT-GREATER (`count > PB1_PRICE_INSISTENCE_THRESHOLD`) — with default threshold 2, the 1st/2nd objections hold (count 1, 2) and the 3rd unlocks (count 3 > 2). Documented inline with worked example so the off-by-one rationale is unambiguous. Picked once here; downstream consumers (handler.ts disclosureUnlocked flag, plan 99-03 tests) MUST use this helper as the single source of truth."
  - "Sub-option A locked for PRICE-02 (no change to definitions.ts:74 REGLA FUERTE; pure additive prompt addendum). Sub-option B was explicitly rejected in CONTEXT.md because the codebase has no template syntax for playbook prompts — introducing one for this case is over-engineered."
  - "Single source of truth for the priceObjection regex: extracted into a top-level `detectPriceObjection` helper (exported) at handler.ts:1395, referenced from both computeAdvanceSignals (post-AI, signals.priceObjection) AND the pre-AI counter-increment site at handler.ts:595. Single regex literal in the file — passes the CONTEXT.md no-parallel-regex constraint."
  - "Counter reset semantics: reset to 0 ONLY at the post-AI stage-advance write site when `!nextStage.startsWith('PB1.')` (advances out of PB1). Within-PB1 advances preserve the counter (so a 3rd insistence detected at PB1.E2A still drives disclosure when the conversation lingers in PB1)."
  - "PRICE-03 PB2.E2 placeholder verification outcome: VERIFIED-BROKEN — the prompt-assembly path at system-prompt.ts:404-406 concatenates the stage promptSection literally with no template-substitution layer. The `[plan_básico]`/`[precio]` tokens at definitions.ts:138 reach the LLM as literal text; the LLM may parrot them. Fix applied: script rewrite (not template engine). PB2.E2 now instructs the LLM to call check_membership first and read prices from the tool result, with explicit anti-literal-output guardrail."
  - "PRICE-03 check_membership lead-branch verification outcome: VERIFIED-BROKEN — the `users.length === 0` short-circuit at tools.ts:485-487 returned ONLY 'No encontré una cuenta...' and never reached the available-plans branch at :508-528 for leads. Piece D fix: extract `formatAvailablePlans(db)` helper, append its output to the preserved prefix in the lead branch, refactor the existing no-active-subscription branch to use the same helper (DRY). Empty-listing case falls back to bare prefix (graceful degrade)."
  - "Addendum byte-impact verification: rendered PB1.E1A lead prompt is 18910 bytes WITHOUT addendum (matches POST_RLOK_04_BYTES from 99-01 byte-for-byte) and 19798 bytes WITH addendum (delta +888). Production callers only set disclosureUnlocked=true after the 3rd PB1 insistence — at that point the snap fixture call path is irrelevant. KGATE-05 ≥20% rendered-cap holds at the lead snap render path; no fixture regen needed."

patterns-established:
  - "Pre-AI counter increment with explicit single-source-of-truth regex helper. Pre-99 the priceObjection regex existed only inline inside computeAdvanceSignals (post-AI). Extracting the helper at Task 2 made the regex usable pre-AI without duplication."
  - "Belt-and-suspenders gating: handler computes `disclosureUnlocked = shouldDisclosePrices(count) && playbookId === 'PB1'`, system-prompt rebuilds the same `disclosureUnlocked && activePlaybook === 'PB1'` check at injection time. Defensive against stale flags or future refactors."
  - "Shared helper appended to preserved prefix — both for the lead branch and the registered-no-sub branch. Empty result graceful-degrades to bare prefix (no trailing whitespace, no broken 'Planes disponibles:' header)."

requirements-completed: [PRICE-01, PRICE-02, PRICE-03]

# Metrics
duration: ~50min
completed: 2026-06-24
---

# Phase 99 Plan 02: Bot price-disclosure mechanism Summary

**PB1 price-insistence counter (PRICE-01) + threshold-based disclosure-unlock prompt addendum (PRICE-02, Sub-option A) + check_membership lead-branch fix and PB2.E2 placeholder script rewrite (PRICE-03) — 3 atomic commits, tsc clean, 59/59 snap-consuming tests still GREEN, zero el-templo-api/src/\*\* changes, no hardcoded prices added.**

## Performance

- **Duration:** ~50 min
- **Started:** 2026-06-24T01:23:00Z (approximate, wall-clock)
- **Completed:** 2026-06-24T02:13:05Z
- **Tasks:** 3 of 3 completed
- **Files modified:** 6 (5 source + 1 .env.example) + 1 NEW (`playbooks/constants.ts`) = 7 files

## Accomplishments

- **PRICE-01 closed (Task 1 + Task 2 — commits `67f9da72` + `6b567e57`):** Counter `priceInsistenceCount?: number` lives in the existing `wa:playbook:<phone>` Redis hash via the unchanged JSON-serialization in `memory/playbook-state.ts`. Counter increments AT MOST ONCE per inbound when the existing `priceObjection` regex matches AND `activePlaybook === "PB1"` (the booleanity of the per-inbound regex test guarantees the at-most-once property by construction — documented inline at handler.ts:580-594). Resets to 0 at the post-AI stage-advance write site when `nextStage` leaves PB1 (`!nextStage.startsWith("PB1.")`).
- **PRICE-02 closed (Task 1 + Task 3 — commits `67f9da72` + `1ec726d6`):** Single tunable `PB1_PRICE_INSISTENCE_THRESHOLD = 2` constant in NEW `el-templo-bot/src/playbooks/constants.ts` (env override read once at module load with finite-non-negative-integer validation and pino-warn-on-invalid silent-degrade). Helper `shouldDisclosePrices(count)` uses strict-greater comparison documented with worked example. Sub-option A discipline locked: `definitions.ts:74` PB1.E4 REGLA FUERTE UNCHANGED; the unlock is purely additive in `system-prompt.ts` via a new module-level const `PB1_PRICE_DISCLOSURE_UNLOCKED_ADDENDUM`, conditionally injected after the active-playbook section and before the soft-rejection rule when `disclosureUnlocked && activePlaybook === "PB1"`. The addendum text contains all the locked clauses (call check_membership, list real DB prices, MANDATORY free-trial re-anchor close, IGNORE the "no encontré una cuenta" prefix for prospects).
- **PRICE-03 closed (Task 3 Pieces C + D — commit `1ec726d6`):**
  - **PB2.E2 verification + script rewrite:** Verified the prompt-assembly path at `system-prompt.ts:404-406` concatenates `stage.promptSection` literally — NO template substitution between definitions.ts and the LLM. The `[plan_básico]`/`[precio]` tokens reach the model as literal text. Fix applied: rewrote the `Objeción precio` script at `definitions.ts:138` to instruct the LLM to call `check_membership` first and read prices from the tool result, with explicit anti-literal-output guardrail. NO template engine introduced (CONTEXT.md Deferred Ideas).
  - **check_membership lead-branch verification + fix:** Verified `tools.ts:485-487` short-circuited with `"No encontré una cuenta con ese número..."` for `users.length === 0` and never reached the available-plans branch at `:508-528`. Without Piece D, Piece A's addendum's "call check_membership and list the plans it returns" instruction would be unsatisfiable for leads. Fix applied: extracted `formatAvailablePlans(db): Promise<string>` helper using the pre-existing SELECT (`subscription_plans WHERE is_active=true AND is_archived=false AND is_trial=false ORDER BY price_regular ASC`, identical formatting). Lead branch now appends the helper output to the preserved "No encontré una cuenta..." prefix; existing `subs.length === 0` branch refactored to use the same helper (DRY). Empty-listing case falls back to bare prefix (graceful degrade).
- **Scope fence held:** Zero modifications to `el-templo-api/src/**` (verified via `git diff HEAD -- 'el-templo-api/src/**' | wc -l` returning 0). Zero hardcoded prices added (the pre-existing `$20,000` reference at `system-prompt.ts:321` is the single-class drop-in price — explicitly acknowledged in CONTEXT.md and NOT modified by this plan). Wave 1's final Mica anchor at `system-prompt.ts:338` and class-rename text at `system-prompt.ts:275/327` + `knowledge.ts:548` UNCHANGED. POST_RLOK_04_BYTES headroom of 6 chars unaffected (the addendum is gated on `disclosureUnlocked && activePlaybook === "PB1"`, which is FALSE for the PB1.E1A lead-render snap call path).

## Task Commits

1. **Task 1: Create constants file + extend PlaybookSessionState and SystemPromptOptions + .env.example (PRICE-01/02 contracts)** — `67f9da72` (feat)
2. **Task 2: Wire pre-AI counter increment + persist in all 4 setPlaybookState writes + reset on PB2 (PRICE-01)** — `6b567e57` (feat)
3. **Task 3: Inject PB1 disclosure-unlocked addendum + verify-then-fix PB2.E2 + verify-then-fix check_membership lead branch (PRICE-02/03; Pieces A+B+C+D in one atomic commit per plan structure)** — `1ec726d6` (feat)

**Plan metadata commit:** to be added by the docs(99-02) commit that includes this SUMMARY.md.

## Files Created/Modified

- **NEW** `el-templo-bot/src/playbooks/constants.ts` — 92 lines. Exports `PB1_PRICE_INSISTENCE_THRESHOLD: number` (env-validated, default 2) + `shouldDisclosePrices(count): boolean` helper with strict-greater comparison.
- `el-templo-bot/src/playbooks/types.ts` — +14 lines (optional `priceInsistenceCount?: number` field on `PlaybookSessionState` with JSDoc). Backward-compat per Phase 90/91 precedent.
- `el-templo-bot/src/ai/system-prompt.ts` — +28 lines (optional `disclosureUnlocked?: boolean` on `SystemPromptOptions` + module-level `PB1_PRICE_DISCLOSURE_UNLOCKED_ADDENDUM` const + conditional injection block at the bottom of `getSystemPrompt`, after the active-playbook section and before the soft-rejection rule).
- `el-templo-bot/src/webhook/handler.ts` — net +85 lines, −5 lines. Top-level exported helper `detectPriceObjection(inboundLower): boolean` (single regex literal); refactor of `computeAdvanceSignals` to call it (removes the inline regex); pre-AI counter logic (`priceObjectionPre`, `priorPriceInsistenceCount`, `newPriceInsistenceCount`, pino telemetry); `priceInsistenceCount` added to all 4 `setPlaybookState` writes (pre-AI, avatar-detected, stage-advance with PB1-leave reset, flags-changed); change-detection condition extended; `disclosureUnlocked` computed and passed into `getSystemPrompt`; diagnostic log extended with `disclosureUnlocked` and `priceInsistenceCount` fields. Import added: `shouldDisclosePrices` from `../playbooks/constants.js`.
- `el-templo-bot/src/playbooks/definitions.ts` — 1 line rewrite at the PB2.E2 `Objeción precio` script. PB1.E4 REGLA FUERTE at line 74 byte-equal preserved; COPY-02 preservation strings (`framings de arranque grupal`, `lenguaje de arranque grupal`) byte-equal preserved.
- `el-templo-bot/src/ai/tools.ts` — +44 lines, −15 lines. New `formatAvailablePlans(db): Promise<string>` helper; lead branch (`users.length === 0`) now appends helper output to the preserved "No encontré una cuenta..." prefix; existing `subs.length === 0` branch refactored to use the same helper. Phone-validation message at `:478-480` UNCHANGED.
- `el-templo-bot/.env.example` — +4 lines (comment block + `PB1_PRICE_INSISTENCE_THRESHOLD=2`).

## Decisions Made

- **Comparison contract: strict-greater not greater-or-equal.** `shouldDisclosePrices(count)` returns `(count ?? 0) > PB1_PRICE_INSISTENCE_THRESHOLD`. With default threshold 2: 1st insistence (count=1) holds, 2nd (count=2) holds, 3rd (count=3) unlocks. This matches CONTEXT.md PRICE-02 "disclose on the 3rd request" semantics. Documented in JSDoc with worked example so future readers don't second-guess the off-by-one.
- **Single source of truth: `detectPriceObjection` helper.** Pre-99 the priceObjection regex was inlined in `computeAdvanceSignals`. The plan's no-parallel-regex constraint required either (a) calling `computeAdvanceSignals` pre-AI for one signal (wasteful — runs a 7-field signal computation), or (b) extracting the regex into a helper. Chose (b) for cleanliness. The helper is exported so the plan 99-03 tests can grep / unit-test it directly if needed.
- **Sub-option A locked: addendum is additive in system-prompt.ts, not a template change in definitions.ts.** Sub-option B would have required introducing template syntax (`{{#if ...}}`) to the playbook prompts; the codebase has no such layer, so this would be a cross-cutting refactor far beyond Phase 99's scope. The addendum approach keeps `definitions.ts` static (an important property for snap-consuming tests) and makes the unlock fully observable in prompt assembly + handler diagnostics.
- **Reset semantics: 0 on PB1-leave, preserve within PB1.** Per CONTEXT.md PRICE-01: "Counter is scoped per-conversation per-PB1-session. It should reset cleanly when the conversation transitions to PB2 (post-trial) so the PB2 disclosure flow is not gated by PB1 state." The reset is wired at the post-AI stage-advance write site only (`nextStage.startsWith("PB1.") ? newPriceInsistenceCount : 0`). Within-PB1 advances (E1A→E2A, E2A→E3, E3→E4) preserve the counter.
- **Belt-and-suspenders PB1 gate.** Both the handler (`disclosureUnlocked = shouldDisclosePrices(count) && playbookId === "PB1"`) and `system-prompt.ts` (`if (options?.disclosureUnlocked && options?.activePlaybook === "PB1")`) check PB1 membership. Defensive against (a) a stale `disclosureUnlocked=true` flag being passed when `activePlaybook` is null, or (b) future refactors that decouple the two checks. Minimal cost, maximal safety.
- **Piece D: `formatAvailablePlans` is an internal helper, NOT a new tool.** The plan was explicit that this is an internal extraction inside `tools.ts`, not a new `BOT_TOOLS` entry. Extracting it as a tool would require schema definition, exposure to the LLM, and dispatch wiring — all unnecessary because both call sites are inside `checkMembership` itself.
- **PB2.E2 PRICE-03 fix path: script rewrite, not template engine.** CONTEXT.md Deferred Ideas explicitly defers template-engine introduction. The script rewrite (instruct the LLM to call check_membership and read prices from the tool result, with anti-literal-output guardrail) achieves the same UX outcome at zero infrastructure cost. Verified the bracket placeholders were literal-text at `system-prompt.ts:404-406` before applying the fix.

## Deviations from Plan

**None.** No Rules 1–3 auto-fixes fired; no Rule 4 architectural questions needed. The plan was specified at high enough fidelity (with verified-broken outcomes for PRICE-03 and locked fix paths) that execution followed the action descriptions byte-for-byte.

One non-deviation procedural note: husky/lint-staged created internal `git stash` entries during pre-commit hook execution (visible in the "Backed up original state in git stash" log lines). These are husky's internal restore-on-failure mechanism, NOT user-initiated stashing — the worktree-isolation-cross-contamination concern documented in `feedback_interface_rename_post_merge_mock_gate` and 99-01's process slip applies to deliberate `git stash` invocations only. Verified post-commit `git status --short` clean and `git stash list` not interrogated.

**Total deviations:** 0.
**Impact on plan:** None.

## Verification

### Self-Check: PASSED

Per-task verification (re-run after final commit):

- `el-templo-bot/src/playbooks/constants.ts` — FOUND. Contains `PB1_PRICE_INSISTENCE_THRESHOLD` (1 hit) + `shouldDisclosePrices` (1 hit) + `resolveThreshold` (env-validating helper). No `any` types. Pino warn on invalid env. No hardcoded prices.
- `el-templo-bot/src/playbooks/types.ts` — UPDATED. `priceInsistenceCount?: number` field added to `PlaybookSessionState` with JSDoc matching the discoveryTurnCount / whyAsked precedent.
- `el-templo-bot/src/ai/system-prompt.ts` — UPDATED. `disclosureUnlocked?: boolean` added to `SystemPromptOptions`; `PB1_PRICE_DISCLOSURE_UNLOCKED_ADDENDUM` const at module top with full JSDoc; conditional injection in `getSystemPrompt` placed AFTER active-playbook section and BEFORE soft-rejection rule (line ordering verified visually).
- `el-templo-bot/src/webhook/handler.ts` — UPDATED. `detectPriceObjection` helper at line 1395 (single regex literal in the file — verified `grep -cE 'caro\|carisimo\|car\[' = 1`). `priceInsistenceCount` referenced 6 times (1 prior + 1 new + 4 setPlaybookState writes). Counter reset to 0 in stage-advance branch when `!nextStage.startsWith("PB1.")`. `disclosureUnlocked` computed and passed into `getSystemPrompt`; diagnostic log extended.
- `el-templo-bot/src/playbooks/definitions.ts` — UPDATED. PB2.E2 `Objeción precio` script rewritten (`llamá a check_membership y leé los precios reales` substring present). PB1.E4 REGLA FUERTE at line 74 byte-equal preserved (`grep -F "*REGLA FUERTE:* en esta etapa NO recomendás" = 1 hit`). `framings de arranque grupal` + `lenguaje de arranque grupal` preserved.
- `el-templo-bot/src/ai/tools.ts` — UPDATED. `formatAvailablePlans` helper present; lead branch (`users.length === 0`) appends helper output to preserved prefix `"No encontré una cuenta con ese número..."` (1 hit); existing `subs.length === 0` branch refactored to use same helper.
- `el-templo-bot/.env.example` — UPDATED. `PB1_PRICE_INSISTENCE_THRESHOLD=2` (1 hit).

Commits claimed exist:

- `67f9da72` — FOUND (`feat(99-02): add PB1 price-disclosure constants + extend types (PRICE-01/02 contracts)`)
- `6b567e57` — FOUND (`feat(99-02): wire PB1 price-insistence counter pre-AI + persist + reset on PB2 (PRICE-01)`)
- `1ec726d6` — FOUND (`feat(99-02): inject PB1 disclosure-unlocked addendum + fix check_membership lead branch (PRICE-02/03)`)

### Functional gates

- **`pnpm exec tsc --noEmit` on el-templo-bot:** exits 0.
- **`git diff HEAD -- 'el-templo-api/src/**' | wc -l`:\*\* 0 (zero api-side changes).
- **Hardcoded-prices grep:** `grep -rE '\$\s*[0-9]{4,}' el-templo-bot/src/ai/system-prompt.ts el-templo-bot/src/playbooks/ el-templo-bot/src/ai/tools.ts` returns empty in the modified surfaces. The pre-existing `$20,000` reference at `system-prompt.ts:321` (single-class drop-in price) is acknowledged and NOT modified.
- **Snap-consuming tests:** `cd el-templo-bot && pnpm test --run test/v5-3-2-regression.test.ts test/v5-3-3-date-grounding.test.ts test/system-prompt-playbook.test.ts test/ai/rendered-prompt-snapshot.test.ts` reports `Test Files 4 passed (4) / Tests 59 passed (59)`. Wave 1's KGATE-05 ≥20% rendered-cap holds at the lead-snap render path because the addendum's gating condition (`disclosureUnlocked && activePlaybook === "PB1"`) is FALSE in the snap call (which omits `disclosureUnlocked`).
- **Addendum byte-impact measurement:** PB1.E1A lead render WITHOUT addendum = **18910 bytes** (matches POST_RLOK_04_BYTES from 99-01 byte-for-byte). WITH `disclosureUnlocked=true` = **19798 bytes** (delta +888 from the addendum text). Production callers only set `disclosureUnlocked=true` after the 3rd PB1 insistence at runtime — the snap fixture call path is unaffected.
- **Preservation strings:**
  - `el-templo-bot/src/playbooks/definitions.ts:74` `*REGLA FUERTE:*` text — byte-equal preserved (`grep -F` confirms).
  - `el-templo-bot/src/playbooks/definitions.ts:138/147` `framings de arranque grupal` / `lenguaje de arranque grupal` — byte-equal preserved.
  - `el-templo-bot/src/ai/tools.ts` `No encontré una cuenta con ese número. Si sos miembro, puede que estés registrado con otro número.` — byte-equal preserved (now the PREFIX of the lead-branch response).
  - `el-templo-bot/src/ai/system-prompt.ts:338` Wave 1 Mica anchor — UNCHANGED.
  - `el-templo-bot/src/ai/system-prompt.ts:275/327` + `el-templo-bot/src/ai/knowledge.ts:548` Wave 1 class-name rename text — UNCHANGED.

### Single-regex-literal verification

`grep -cE 'caro\|carisimo\|car\[' el-templo-bot/src/webhook/handler.ts` returns **1** — the regex literal exists ONLY inside `detectPriceObjection` at line 1395-1397. The pre-99 inline regex at the old line 1439-1442 was refactored to a function call.

## Decisions / Tradeoffs Surfaced (no action required)

- **POST_RLOK_04_BYTES headroom at 6 chars (post-99-01 ship) is preserved.** Plan 99-02 does NOT add any prompt copy that renders in the snap fixture call path. Future phases must continue to either pre-measure prompt additions against the 18916 cap OR explicitly bump POST_RLOK_04_BYTES with a snap regen (per Phase 96.5 sanctioned method). The 99-02 addendum (~888 chars when injected) is conditional and never lands at the lead-snap render path.
- **`disclosureUnlocked` ride-along in non-PB1 paths is suppressed by belt-and-suspenders gating.** If a future refactor accidentally sets `disclosureUnlocked=true` outside PB1, the `system-prompt.ts` gate at the injection site is the last line of defense. The diagnostic log carries `disclosureUnlocked` so this would be observable in production logs.
- **`formatAvailablePlans` query duplication is acceptable for now.** The helper queries `subscription_plans` directly (raw SQL); the canonical "list available plans" SELECT lives in `tools.ts`. If a third caller materializes (e.g., a scheduler job or a separate tool), the helper can be moved to a shared `db/queries.ts` location. Not in scope for this phase.

## Known Stubs

None. No empty arrays/objects/nulls flow to UI; no placeholder text introduced. The addendum text is fully-formed prose with no `TODO`/`FIXME`/`placeholder` markers.

## Issues Encountered

- **Cross-repo type-resolution noise (pre-existing, documented in 99-01 SUMMARY):** Initial `pnpm exec tsc --noEmit` failed with 102 `el-templo-api/src/db/schema/*` errors because the worktree's `el-templo-api/node_modules` was not installed. Resolved by running `pnpm install --prefer-offline` in both `el-templo-bot/` and `el-templo-api/`. Not a code deviation — same worktree-setup pattern that 99-01 documented and that the bot's tsconfig.json `include` arrangement requires.

## Next Phase Readiness

- **Plan 99-02 fully shipped.** All 3 tasks complete; 3 atomic commits; SUMMARY.md committed; STATE/ROADMAP untouched per worktree-mode rules (orchestrator owns those writes).
- **Plan 99-03 (wave 3) is unblocked.** Integration tests in `el-templo-api/test/whatsapp/` can now exercise:
  - The 1st/2nd PB1 insistence (counter advances, no prices in outbound, free-trial nudge holds).
  - The 3rd PB1 insistence (counter ≥ threshold, `disclosureUnlocked=true`, addendum injected, LLM calls `check_membership`, outbound contains DB prices + free-trial re-anchor).
  - The lead-no-users-row path through `check_membership` (Piece D fix): seed `subscription_plans` with clearly-marked test values, send a price-insistent inbound from an unregistered phone, assert outbound contains the test plan values verbatim.
  - PB2 transition reset (counter cleared on PB1→non-PB1 advance).
  - PB2.E2 placeholder fix (assert outbound contains no literal `[plan_básico]` / `[precio]` substring).
- **Wave 3 test fixtures:** Per CONTEXT.md `<specifics>`, `subscription_plans` seed rows must use clearly-marked test values (e.g., `price_regular: 99999`) so a future grep for real prices in bot test fixtures returns 0 hits.
- **No carry-forward blockers.** KGATE-05 headroom at 6 chars preserved (addendum is gated out of the snap render path). `withTimeout` integration (Phase 95-02 `tools.ts` work) is unaffected — `formatAvailablePlans` reuses the existing `db.execute` pattern with no new network calls.

## Self-Check: PASSED

Files claimed to be created/modified all verified to exist on disk and match git state:

- `el-templo-bot/src/playbooks/constants.ts` — FOUND, exports `PB1_PRICE_INSISTENCE_THRESHOLD` and `shouldDisclosePrices`. Committed in `67f9da72`.
- `el-templo-bot/src/playbooks/types.ts` — FOUND, contains `priceInsistenceCount?: number`. Committed in `67f9da72`.
- `el-templo-bot/src/ai/system-prompt.ts` — FOUND, contains `disclosureUnlocked` (option), `PB1_PRICE_DISCLOSURE_UNLOCKED_ADDENDUM` (const), and the conditional injection. Committed in `67f9da72` (option) + `1ec726d6` (const + injection).
- `el-templo-bot/src/webhook/handler.ts` — FOUND, contains `detectPriceObjection`, `priorPriceInsistenceCount`, `newPriceInsistenceCount`, `priceInsistenceCount` at 4 setPlaybookState writes, `disclosureUnlocked` computation + pass + log. Committed in `6b567e57` (counter) + `1ec726d6` (disclosureUnlocked).
- `el-templo-bot/src/playbooks/definitions.ts` — FOUND, PB2.E2 script rewritten; PB1.E4 REGLA FUERTE + COPY-02 preservation strings byte-equal preserved. Committed in `1ec726d6`.
- `el-templo-bot/src/ai/tools.ts` — FOUND, `formatAvailablePlans` helper present; lead branch and subs-branch both call it. `No encontré una cuenta con ese número` prefix preserved. Committed in `1ec726d6`.
- `el-templo-bot/.env.example` — FOUND, contains `PB1_PRICE_INSISTENCE_THRESHOLD=2`. Committed in `67f9da72`.

Commits claimed exist:

- `67f9da72` — FOUND (`feat(99-02): add PB1 price-disclosure constants + extend types (PRICE-01/02 contracts)`)
- `6b567e57` — FOUND (`feat(99-02): wire PB1 price-insistence counter pre-AI + persist + reset on PB2 (PRICE-01)`)
- `1ec726d6` — FOUND (`feat(99-02): inject PB1 disclosure-unlocked addendum + fix check_membership lead branch (PRICE-02/03)`)

---

_Phase: 99-bot-copy-and-price-disclosure-fixes_
_Completed: 2026-06-24_
