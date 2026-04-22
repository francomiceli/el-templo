---
phase: 100
plan: 4
subsystem: admin / session-editor + exercises
tags: [admin, session-editor, games-format, custom-title, route-labels, tooltip]
requires:
  - 100-01 (session_blocks.custom_title column + games format row)
  - 100-03 (PATCH /admin/sessions/:sid/blocks/:bid/custom-title endpoint)
provides:
  - admin-app-route-label-dictionary
  - admin-app-getRouteLabel-helper
  - games-format-editor-UI
  - games-exercise-route-option
  - INITIUM-custom-title-input
  - route-display-tooltips-in-session-editor
  - useEditApi.updateCustomTitle composable method
affects:
  - el-templo-admin/src/pages/ExercisesPage.vue (via createRouteOptions)
  - el-templo-admin/src/components/sessions (via session editor UI)
  - el-templo-admin/src/types/session.ts (via SessionBlock.customTitle extension)
tech-stack:
  added: []
  patterns:
    - display-label-dictionary
    - hover-tooltip-via-q-tooltip
    - always-visible-optional-input-with-blur-persistence
    - composable-api-method-mirroring-existing-pattern
key-files:
  created:
    - el-templo-admin/src/constants/route-labels.ts
  modified:
    - el-templo-admin/src/pages/ExercisesPage.vue
    - el-templo-admin/src/components/sessions/FormatParamsEditor.vue
    - el-templo-admin/src/types/session.ts
    - el-templo-admin/src/composables/useEditApi.ts
    - el-templo-admin/src/components/sessions/EditableBlockCard.vue
    - el-templo-admin/src/components/sessions/EditableExerciseRow.vue
decisions:
  - Dictionary duplicated byte-for-byte from member-app copy (keys + values identical; only docstring differs); SPEC D-02 compliance verified via diff
  - Games format defaults use `{ type: 'games', reps: null, time: null, rounds: null }` to match FormatParamsLocal discriminated-union pattern (e.g. `{ type: 'amrap', minutes: 10 }`)
  - Games render branch uses Quasar `clearable` prop on all three `q-input` fields so coaches can empty any field back to null
  - Custom-title input is gated on `isInitium` (v-if) and placed between the colored header and the level tabs, always visible (zero clicks to discover) — matches D-04
  - Custom-title persistence: blur + Enter both trigger PATCH; empty-string trimmed to null; no-op skip when value unchanged to avoid needless API hits and needless revert-to-pending on approved sessions
  - Error handling uses `$q.notify({ type: 'negative' })` with `instanceof Error` narrowing (CLAUDE.md: no `any`, no `console.*`)
  - Admin exercises list and admin sessions list intentionally left unchanged — SPEC D-01 (short codes only)
metrics:
  duration_minutes: ~12
  tasks_completed: 2
  files_created: 1
  files_modified: 6
  completed: 2026-04-21
---

# Phase 100 Plan 04: Admin Session Editor — Games Format, Custom Title, Route Tooltips — Summary

## One-liner

Wired the admin session-authoring experience for Phase 100: games format defaults, games exercise route, INITIUM custom-title input with PATCH persistence, Spanish route-label dictionary (admin copy), and hover tooltips on route displays in the session editor — all while leaving admin exercises list and sessions list unchanged per D-01.

## Outcome

- `el-templo-admin/src/constants/route-labels.ts` created: 31-entry Spanish dictionary + `getRouteLabel()` helper. Byte-identical keys and values to `el-templo-app/src/constants/route-labels.ts` (SPEC D-02).
- `ExercisesPage.vue` `createRouteOptions` now has 31 entries (30 canonical + `games`). The derived `routeOptions` (filter dropdown) picks `games` up automatically.
- `FormatParamsEditor.vue` `defaultsMap` gained `games: { type: 'games', reps: null, time: null, rounds: null }`, with a new template render branch for three clearable nullable numeric inputs labelled Reps / Tiempo (seg) / Rondas.
- `SessionBlock` TS type gained `customTitle: string | null` so the field flows through session API responses.
- `useEditApi` composable gained `updateCustomTitle(sessionId, blockId, customTitle)` — mirrors `updateFormatParams` structure (axios PATCH, `apiCall` wrapper for loading/error tracking, typed response).
- `EditableBlockCard.vue` INITIUM blocks now render an always-visible "Título del juego (opcional)" input; blur/Enter calls the PATCH endpoint (Plan 03) and emits `refresh` on success. Empty string normalized to null. No-op skip when unchanged.
- `EditableBlockCard.vue` and `EditableExerciseRow.vue` route displays gained `q-tooltip` showing the Spanish label via `getRouteLabel()`.
- Admin `ExercisesPage.vue` and `SessionsPage.vue` are intentionally untouched — no `getRouteLabel` import anywhere in those files (D-01).

## Tasks Executed

| Task | Description                                                                                                                   | Commit     | Files                                                                                                                                                                                                    |
| ---- | ----------------------------------------------------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Admin route-labels dictionary, `'games'` route option, `games` format defaults + render branch, `customTitle` on SessionBlock | `f5f08d0d` | `el-templo-admin/src/constants/route-labels.ts`, `el-templo-admin/src/pages/ExercisesPage.vue`, `el-templo-admin/src/components/sessions/FormatParamsEditor.vue`, `el-templo-admin/src/types/session.ts` |
| 2    | `updateCustomTitle` composable method, INITIUM custom-title input + PATCH wiring, route tooltips in editor                    | `0fc03ab8` | `el-templo-admin/src/composables/useEditApi.ts`, `el-templo-admin/src/components/sessions/EditableBlockCard.vue`, `el-templo-admin/src/components/sessions/EditableExerciseRow.vue`                      |

## Acceptance Criteria — Verification

**Task 1:**

- [x] `el-templo-admin/src/constants/route-labels.ts` exists (67 lines after prettier; ≥45)
- [x] 31 dictionary entries (30 canonical + `games`)
- [x] Diff against `el-templo-app/src/constants/route-labels.ts` (comments + semicolons stripped) → zero lines. Keys and Spanish labels byte-identical.
- [x] `grep -A35 "const createRouteOptions" src/pages/ExercisesPage.vue | grep -c "'games'"` → 1
- [x] `grep -c "games:\s*{\s*type:\s*'games'" src/components/sessions/FormatParamsEditor.vue` → 1 (defaultsMap entry)
- [x] `grep -c "'games'" src/components/sessions/FormatParamsEditor.vue` → 2 (defaultsMap + render `v-else-if`)
- [x] `grep -cE "customTitle:\s*string\s*\|\s*null" src/types/session.ts` → 1
- [x] No new `any` types in modified type/constant files; baseline (`FormatParamsEditor.vue`) `any` count unchanged (0 → 0).
- [x] `npx vue-tsc --noEmit` — no new errors introduced by plan changes (confirmed via grep; pre-existing errors in `HorariosPage.vue`, `SessionEditPage.vue`, `session-pdf-builder.ts`, `ProgramWizardDialog.vue`, and the baseline `swap-exercise` emit in `EditableBlockCard.vue` are out of scope).
- [x] `pnpm lint` — 0 errors, 6 pre-existing warnings unchanged.

**Task 2:**

- [x] `grep -c "updateCustomTitle" src/composables/useEditApi.ts` → 3 (definition + return object + URL path log/comment)
- [x] `grep -c "custom-title" src/composables/useEditApi.ts` → 1 (URL segment)
- [x] `grep -c "blockGroup.levelBlocks\[0\]" src/components/sessions/EditableBlockCard.vue` → ≥ 1 (canonical access path confirmed via `block-group.ts` — `LevelBlock.block: SessionBlock`)
- [x] `grep -c "onCustomTitleBlur" src/components/sessions/EditableBlockCard.vue` → 3 (script definition + template @blur + template @keyup.enter)
- [x] `grep -c 'v-model="customTitle"' src/components/sessions/EditableBlockCard.vue` → 1
- [x] `grep -c 'maxlength="100"' src/components/sessions/EditableBlockCard.vue` → 1
- [x] `grep -c 'v-if="isInitium"' src/components/sessions/EditableBlockCard.vue` → 1 (on the custom-title `q-card-section`)
- [x] `grep -c "getRouteLabel" src/components/sessions/EditableBlockCard.vue` → 2 (import + tooltip usage)
- [x] `grep -c "getRouteLabel" src/components/sessions/EditableExerciseRow.vue` → 2 (import + tooltip usage)
- [x] `grep -c "q-tooltip" src/components/sessions/EditableBlockCard.vue` → ≥ 1 (new route tooltip + pre-existing warning/weighted tooltips)
- [x] `grep -c "q-tooltip" src/components/sessions/EditableExerciseRow.vue` → ≥ 1 (new route tooltip + pre-existing weighted-button tooltip)
- [x] No `console.*` introduced (CLAUDE.md)
- [x] `grep -c "getRouteLabel" src/pages/ExercisesPage.vue` → 0 (D-01 preserved)
- [x] `grep -c "getRouteLabel" src/pages/SessionsPage.vue` → 0 (D-01 preserved)
- [x] No new `any` annotations in modified files.
- [x] `pnpm build` — builds successfully (SPA dist).
- [x] `pnpm lint` — 0 errors.
- [x] `npx vue-tsc --noEmit` — no new errors introduced by plan changes.

## Final Spanish Labels (admin copy — same as member-app)

Plan 02 authoritative labels copied verbatim. The table below is informational; the source of truth lives in `el-templo-admin/src/constants/route-labels.ts`.

### Pull

| Short code | Spanish label             |
| ---------- | ------------------------- |
| FL         | Front Lever               |
| FLR        | Front Lever Row           |
| BL         | Back Lever                |
| MU         | Dominadas a pecho         |
| OAP        | Dominada a un brazo       |
| OAR        | Remo a un brazo           |
| TTB        | Punta a la barra          |
| MN/RP      | Manna / Planche invertida |

### Push

| Short code | Spanish label             |
| ---------- | ------------------------- |
| PL         | Plancha                   |
| PLPU       | Flexión en plancha        |
| HSPU       | Flexión invertida         |
| HS         | Parada de manos           |
| PHS        | Press a parada de manos   |
| OAPU       | Flexión a un brazo        |
| HD/ID      | Hefesto / Fondo imposible |

### Legs

| Short code    | Spanish label          |
| ------------- | ---------------------- |
| PS            | Sentadilla pistol      |
| DS            | Sentadilla dragón      |
| NC            | Curl nórdico           |
| SS            | Sentadilla sissy       |
| QC            | Curl de cuádriceps     |
| HR            | Ham raise              |
| HT            | Empuje de cadera       |
| L             | Zancada                |
| SU            | Subida al cajón        |
| REVERSE HYPER | Hiperextensión inversa |

### Other

| Short code | Spanish label       |
| ---------- | ------------------- |
| AF         | Flexibilidad activa |
| BRIDGE     | Puente              |
| PIKE       | Pica                |
| SPAGAT     | Spagat              |
| SIDE PCK   | Patada lateral      |

### Phase 100 addition

| Short code | Spanish label |
| ---------- | ------------- |
| games      | Juegos        |

**Total: 31 entries.**

## Plan 05 Dependencies (provided by this plan)

- `el-templo-admin/src/constants/route-labels.ts` is now importable anywhere in the admin app. If Plan 05 needs Spanish labels on additional admin surfaces (e.g. PDF builder), it can import `getRouteLabel` directly.
- `SessionBlock.customTitle` is now populated in the admin TypeScript model. PDF builder / preview pipeline can consume it.
- `useEditApi().updateCustomTitle(...)` is available for any component that wants to persist an INITIUM custom title via the admin API.

## Deviations from Plan

### 1. [Style — benign] Prettier normalized route-labels.ts to admin-style (semicolons, single-quote prop keys)

**Found during:** Task 1 commit (lint-staged auto-formatted).

**Issue:** The admin project's Prettier config emits trailing semicolons on statements. The source file was written semicolon-terminated to match; the app project's file has no trailing semis because its Prettier config emits no-semis. Net effect: the two files are not byte-identical, but their keys and Spanish values are (stripping comments and `;` yields zero diff).

**Fix:** None needed — SPEC Requirement 4 specifies "identical keys and values," not byte-identical files. Each app's formatting is normalized to its own project style, which is the correct outcome. Verified via `diff <(grep -vE "^\s*(//|\*|/\*)" app/... | tr -d ';') <(grep -vE "^\s*(//|\*|/\*)" admin/... | tr -d ';')` → zero diff.

**Impact:** None on behavior or semantics.

### 2. [Rule 2 — Correctness] Added no-op skip in `onCustomTitleBlur` to avoid redundant API calls

**Found during:** Task 2 authoring.

**Issue:** The plan's template includes a `newValue === currentValue` guard to avoid a PATCH when the field is unchanged. Without this, every blur (including a blur caused by tabbing out without typing) would trigger a PATCH, which in turn reverts approved sessions to `pending_review` (an unwanted side effect on approved sessions). The plan already called this out as a no-op skip — this summary documents it as a correctness-critical guard, not a style preference.

**Fix:** Implemented exactly as spec'd in the plan's `action` step.

**Impact:** Prevents spurious `custom_title_update` edit-log entries and unnecessary revert-to-pending transitions on approved sessions.

## Known Stubs

None. Every piece is wired end-to-end:

- Route-labels dictionary imported in both editor components.
- `getRouteLabel()` used in both tooltips.
- `updateCustomTitle` composable method exposed in return object and wired from the INITIUM input.
- `customTitle` TS type field flows through `SessionBlock` and is reactively watched for parent-refresh scenarios.

## Threat Flags

None. This plan is additive UI wiring with no new network surface beyond the Plan 03 endpoint (already specified and tested in `session-custom-title.test.ts`).

## Self-Check: PASSED

Files verified to exist:

- FOUND: `el-templo-admin/src/constants/route-labels.ts` (created)
- FOUND: `el-templo-admin/src/pages/ExercisesPage.vue` (modified)
- FOUND: `el-templo-admin/src/components/sessions/FormatParamsEditor.vue` (modified)
- FOUND: `el-templo-admin/src/types/session.ts` (modified)
- FOUND: `el-templo-admin/src/composables/useEditApi.ts` (modified)
- FOUND: `el-templo-admin/src/components/sessions/EditableBlockCard.vue` (modified)
- FOUND: `el-templo-admin/src/components/sessions/EditableExerciseRow.vue` (modified)

Commits verified via `git log --oneline`:

- FOUND: `f5f08d0d` feat(100-04): admin games format defaults + games route + customTitle type + route-labels dictionary
- FOUND: `0fc03ab8` feat(100-04): INITIUM custom_title input + route tooltips + useEditApi.updateCustomTitle
