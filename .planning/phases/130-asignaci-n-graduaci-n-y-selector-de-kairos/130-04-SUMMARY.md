---
phase: 130-asignaci-n-graduaci-n-y-selector-de-kairos
plan: 04
subsystem: member-app
tags: [kairos, levels, selector, onboarding, quasar, vue]

# Dependency graph
requires:
  - phase: 130-01
    provides: "users.level DEFAULT kairos — new members are born kairos, so the member-app self-pick must surface kairos as the entry tier"
provides:
  - "Kairos as the FIRST box in the member-app onboarding level self-pick (LEVEL_SELECTOR_QUESTION.options[0].value === 'kairos')"
  - "Verification that HeaderLevelDropdown already iterates TRAINING_LEVELS (kairos first since Phase 129) — no change needed, no regression"
affects:
  - "Completes KAIROS-07 (app half); admin half landed in 130-03. The full level-selector surface now shows the Kairos tier across both apps."

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Kairos placed FIRST in the onboarding option array (kairos→alfa→delta→sigma→omega), matching D-04 and the canonical TRAINING_LEVELS order; spartan stays excluded from the self-pick (earned, not claimed)"
    - "Glyph/name reused from level-display.ts (kairos → 'α' / 'Kairos', Phase 129) — not redefined, keeping cross-app parity"
    - "OnboardingQuestion.vue scrollable variant (>5 options) untouched: the self-pick now has 5 boxes (spartan excluded), which renders without scroll or layout break; the scrollable safety net remains available if a 6th is ever added"

key-files:
  created: []
  modified:
    - el-templo-app/src/modules/onboarding/types.ts

key-decisions:
  - "Checkpoint (decision) pre-resolved by orchestrator as include-kairos: Kairos appears as the FIRST/entry-level box in the onboarding self-pick (kairos is now the auto-assigned default, so a beginner self-selecting should see it as the lowest/entry option)"
  - "Self-pick has 5 boxes (kairos+alfa+delta+sigma+omega), not 6: spartan remains intentionally excluded (earned/assigned, not self-claimed — see ONBOARDING_NARRATIVE_REDESIGN.md). 5 boxes is below the >5 scrollable threshold and fits without layout break, satisfying D-04's no-break requirement"
  - "HeaderLevelDropdown.vue required NO change: it already v-for's over TRAINING_LEVELS (kairos first) and renders LEVEL_GREEK_MAP/LEVEL_DISPLAY_MAP, with a 'Tu Nivel' marker on the member's own level — verified by inspection, no regression"
  - "Replaced the stale 'selector UI is phase 130 / not self-claimed' comment with a phase-130 D-04 comment documenting the kairos-first entry-tier decision"

requirements-completed: [KAIROS-07]

# Metrics
duration: ~10m
completed: 2026-06-05
---

# Phase 130 Plan 04: Member-App Kairos Level Selector Summary

**The member-app onboarding self-pick now surfaces Kairos as the FIRST/entry-tier box (`α Kairos`), ahead of alfa→delta→sigma→omega, completing the app half of KAIROS-07; the header level dropdown already listed all six levels (kairos first) since Phase 129 and was verified unchanged — both member-app level-selector surfaces now show the Kairos tier with the warm-palette glyph 'α' and name 'Kairos', byte-consistent with the admin app.**

## What Was Built

- **Onboarding self-pick (`LEVEL_SELECTOR_QUESTION`, types.ts):** Prepended `{ value: 'kairos', label: 'α Kairos' }` as the first option. The self-pick now offers kairos→alfa→delta→sigma→omega (spartan still excluded — earned, not self-claimed). The stale comment was replaced with a D-04 / phase-130 rationale.
- **Header dropdown (`HeaderLevelDropdown.vue`):** Verified by inspection — it already iterates `TRAINING_LEVELS` (kairos first) and renders glyph/name via the shipped maps, with the "Tu Nivel" marker. No change made, no regression.
- **Layout safety:** `OnboardingQuestion.vue`'s `scrollable` computed (`options.length > 5`) is the documented D-04 safety net. The self-pick has 5 boxes (spartan excluded), which fits without scroll; the scrollable variant remains available if a sixth box is ever introduced.

## Decision Recorded

The plan opened with a `checkpoint:decision` (include vs. exclude Kairos from the self-pick). It was **pre-resolved by the orchestrator as `include-kairos`** for this unattended overnight run, on the rationale that Kairos is the auto-assigned default starting level, so a self-selecting beginner should see it as the lowest/entry option, consistent with the kairos→alfa→…→spartan order. Implemented accordingly.

## Verification

- **Lint:** `pnpm run lint` — 0 errors (2 pre-existing warnings in unrelated files: `boot/axios.ts`, `useSessionPlayer.ts` — out of scope).
- **Build:** `pnpm run build` (quasar build, full type compilation) — **Build succeeded**, SPA emitted to `dist/spa`.
- Note: the plan's automated `pnpm vue-tsc --noEmit` is not a runnable script in this app (no standalone typecheck script); per project policy the gate is `pnpm run lint` and/or `pnpm run build`, both of which passed. The build performs the equivalent full TS compilation.

## Deviations from Plan

None affecting behavior. Two clarifications:

1. **Typecheck command substitution.** The plan's `pnpm vue-tsc --noEmit` is not an invokable script here. Used the project-policy gates (`pnpm run lint` + `pnpm run build`) instead — the build covers full type compilation. No code impact.
2. **"6th box" framing.** The plan/D-04 describe a "6th recuadrito." In the onboarding self-pick, spartan is (and remains) intentionally excluded, so adding kairos yields **5 boxes**, not 6. This is correct and layout-safe (below the scrollable threshold). The full 6-level set is present in the header dropdown, which already renders all six. No deviation from intent — documented for clarity.

## Known Stubs

None.

## Deferred

- **`checkpoint:human-verify` (visual UAT) — DEFERRED.** Per the unattended overnight run, the visual checkpoint was not executed. Pending manual verification:
  1. Header dropdown shows Kairos (α glyph) cleanly, "Tu Nivel" marks a kairos member's own level.
  2. Onboarding "¿En qué nivel entrenás?" step shows Kairos as the FIRST box; selecting it advances without visual breakage; the 5-box list renders without overflow.
  3. A freshly-registered member (Kairos) shows the Kairos badge correctly on training/header surfaces.

## Threat Surface

No new security-relevant surface. Per the plan's threat model: the onboarding/header level value drives VIEWED session content only; the persisted `users.level` is server-controlled (default kairos + graduation), so self-picking Kairos grants no privilege (T-130-09 mitigated, T-130-10 accepted). No new packages installed (T-130-SC).

## Self-Check: PASSED

- FOUND: `.planning/phases/130-asignaci-n-graduaci-n-y-selector-de-kairos/130-04-SUMMARY.md`
- FOUND: commit `808db571` (feat 130-04 onboarding kairos self-pick)
- FOUND: `value: 'kairos'` in `el-templo-app/src/modules/onboarding/types.ts:353`
