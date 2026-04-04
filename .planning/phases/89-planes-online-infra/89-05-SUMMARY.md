---
phase: 89-planes-online-infra
plan: 05
subsystem: member-app
tags: [rename, goal-plan, ui-text, whatsapp-cta]
dependency_graph:
  requires: [89-02]
  provides: [member-app-goal-plan-module, por-objetivos-branding]
  affects: [el-templo-app]
tech_stack:
  added: []
  patterns: [git-mv-rename, weekly-price-computation]
key_files:
  created: []
  modified:
    - el-templo-app/src/modules/goal-plan/types.ts
    - el-templo-app/src/modules/goal-plan/index.ts
    - el-templo-app/src/modules/goal-plan/routes.ts
    - el-templo-app/src/modules/goal-plan/stores/goalPlanStore.ts
    - el-templo-app/src/modules/goal-plan/composables/useGoalPlanApi.ts
    - el-templo-app/src/modules/goal-plan/composables/useGoalPlanSession.ts
    - el-templo-app/src/modules/goal-plan/components/GoalPlanProgressBar.vue
    - el-templo-app/src/modules/goal-plan/components/GoalPlanProgressIndicator.vue
    - el-templo-app/src/modules/goal-plan/pages/GoalPlanSession.vue
    - el-templo-app/src/modules/plan/pages/PlanesPage.vue
    - el-templo-app/src/modules/progression/components/GoalPlanSection.vue
    - el-templo-app/src/modules/progression/composables/useGoalPlanProgress.ts
    - el-templo-app/src/modules/progression/pages/MiTemplo.vue
    - el-templo-app/src/modules/progression/components/SessionCtaCard.vue
    - el-templo-app/src/modules/training/pages/WeeklyView.vue
    - el-templo-app/src/stores/useUserStore.ts
    - el-templo-app/src/boot/modules.ts
  deleted:
    - el-templo-app/src/modules/personalizada/pages/DurationPicker.vue
    - el-templo-app/src/modules/personalizada/ (entire directory)
decisions:
  - "Duration picker removed entirely per D-29 - goal plan sessions show all blocks"
  - "GoalPlanSession page navigates back to /training instead of duration picker"
  - "GoalPlanProgressIndicator no longer takes completedDuration prop since duration selection is removed"
  - "MemberPlan interface includes priceRegular field for weekly price CTA computation"
metrics:
  duration: 12min
  completed: "2026-04-04T19:24:00Z"
---

# Phase 89 Plan 05: Member App Goal Plan Rename Summary

Full member app module rename from personalizada to goal-plan using git mv for history preservation, with Por Objetivos branding and WhatsApp CTA weekly price.

## What Was Done

### Task 1: Rename personalizada/ module to goal-plan/

Used `git mv` to rename the entire `personalizada/` directory to `goal-plan/`, then renamed individual files within:
- `personalizadaStore.ts` -> `goalPlanStore.ts`
- `usePersonalizadaApi.ts` -> `useGoalPlanApi.ts`
- `usePersonalizadaSession.ts` -> `useGoalPlanSession.ts`
- `PersonalizadaProgressBar.vue` -> `GoalPlanProgressBar.vue`
- `PersonalizadaProgressIndicator.vue` -> `GoalPlanProgressIndicator.vue`
- `PersonalizadaSession.vue` -> `GoalPlanSession.vue`

Deleted `DurationPicker.vue` per D-29 (duration picker concept eliminated). The `useGoalPlanSession` composable now shows all blocks without duration filtering.

Renamed progression module files:
- `PersonalizadaSection.vue` -> `GoalPlanSection.vue`
- `usePersonalizadaProgress.ts` -> `useGoalPlanProgress.ts`

Updated all type names: `PersonalizadaType` -> `GoalPlanType`, `PersonalizadaProgress` -> `GoalPlanProgress`, `ArchivedPersonalizada` -> `ArchivedGoalPlan`, `PersonalizadaMetadata` -> `GoalPlanMetadata`, `PersonalizadaSessionResponse` -> `GoalPlanSessionResponse`. Removed `PersonalizadaDuration` type entirely.

All API paths updated from `/personalizadas/` to `/goal-plans/`.

Updated external consumers:
- `useUserStore.ts`: removed `isPersonalizada`/`personalizadaType` from `MemberSubscription`, added `planCategory`, renamed `hasActivePersonalizada` to `hasActiveGoalPlan`
- `boot/modules.ts`: imports from `goal-plan` module
- `MiTemplo.vue`: `isGoalPlan` computed instead of `isPersonalizada`
- `SessionCtaCard.vue`: `isGoalPlan` prop with "Por Objetivos" chip text
- `WeeklyView.vue`: routes to `goalPlan-session` instead of `personalizada-duration`

### Task 2: Update PlanesPage with Por Objetivos branding and WhatsApp CTA

- Section title: "Planes Personalizados" -> "Planes Por Objetivos"
- Badge: "PERSONALIZADO" -> "POR OBJETIVOS" (amber-8 color preserved)
- Section description: "Planes diseñados a tu medida para potenciar tu entrenamiento."
- MemberPlan interface: replaced `isPersonalizada`/`isOnline`/`personalizadaType`/`personalizadaZones` with `planCategory`/`linkedProgramId`/`priceRegular`
- Weekly price: `Math.round(priceRegular / 4.33)` for regular plans and `Math.round(price / 4.33)` for program catalog
- WhatsApp CTA: "Hola! Me interesa el plan {Name} (${weeklyPrice}/semana). Quiero mas info."
- Applied to both regular plan CTAs and Por Objetivos plan CTAs

## Deviations from Plan

None - plan executed exactly as written.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 641c6c39 | Rename personalizada module to goal-plan with git mv |
| 2 | 2ba8837f | Update PlanesPage with Por Objetivos branding and WhatsApp CTA |

## Verification

- Zero references to `personalizada`/`personalizadas`/`PersonalizadaType`/`isPersonalizada`/`DurationPicker` in `src/modules/`, `src/stores/`, `src/boot/`
- `goal-plan/` module exists with all expected files
- `personalizada/` directory completely removed
- PlanesPage contains "Por Objetivos" branding, weekly price computation, and WhatsApp CTA
- TypeScript check shows only pre-existing dependency errors (node_modules not installed in worktree)

## Self-Check: PASSED

All created/modified files verified to exist. Both commits (641c6c39, 2ba8837f) confirmed in git log. personalizada/ directory confirmed removed.
