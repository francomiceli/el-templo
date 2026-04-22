---
phase: 100
plan: 2
subsystem: member-app-display
tags: [route-labels, i18n-spanish, constants, games-route]
requires: []
provides:
  - member-app-route-label-dictionary
  - member-app-getRouteLabel-helper
affects:
  - el-templo-app/src/modules/training (via unchanged call sites)
  - el-templo-app/src/modules/progression (via unchanged call sites)
tech-stack:
  added: []
  patterns: [display-label-dictionary, thin-reexport-backward-compat]
key-files:
  created:
    - el-templo-app/src/constants/route-labels.ts
  modified:
    - el-templo-app/src/modules/training/utils/routeNames.ts
decisions:
  - Plan 04 MUST copy the Spanish values in this file verbatim (SPEC D-02)
  - routeNames.ts kept as thin re-export (zero call-site edits; backward compat for getRouteName)
  - Null/undefined-safe fallback in getRouteLabel() (returns '' for nullish, raw code for unmapped)
metrics:
  duration: ~7m
  tasks: 2
  completed: 2026-04-21
---

# Phase 100 Plan 02: Member app route-label dictionary — Summary

Spanish route-label dictionary for the member app: 31-entry `ROUTE_LABELS` map and `getRouteLabel()` helper at the SPEC-mandated path, with `routeNames.ts` rewired as a thin re-export so all existing call sites render Spanish without any edits.

## What Shipped

- `el-templo-app/src/constants/route-labels.ts` (new) — `ROUTE_LABELS: Record<string,string>` with 30 canonical codes + `games`, plus `getRouteLabel(code)` helper.
- `el-templo-app/src/modules/training/utils/routeNames.ts` (rewired) — now imports from `src/constants/route-labels` and re-exports `ROUTE_NAMES` (= `ROUTE_LABELS`) and `getRouteName()` (delegates to `getRouteLabel()`). File reduced from 54 to 21 lines. English labels (`'Planche'`, `'Front Lever'`, etc.) fully removed.

## Final Spanish Labels (for Plan 04 verbatim copy)

Plan 04 (admin-side `el-templo-admin/src/constants/route-labels.ts`) MUST use these exact values. Keys and Spanish labels must be byte-identical across both files per SPEC Acceptance criteria.

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

## Call Sites (unchanged, now render Spanish)

Verified via `grep -rl "getRouteName" el-templo-app/src`:

- `src/modules/progression/pages/MiTemplo.vue`
- `src/modules/training/components/BlockChoiceCard.vue`
- `src/modules/training/components/BlockProgressionView.vue`
- `src/modules/training/components/BlockCard.vue`
- `src/modules/training/components/DayCard.vue`
- `src/modules/training/components/player/BlockChoice.vue`
- (plus `src/modules/training/utils/routeNames.ts` itself)

## Commits

| Task | Commit     | Description                                                          |
| ---- | ---------- | -------------------------------------------------------------------- |
| 1    | `45559f6d` | feat(100-02): add Spanish route-labels dictionary in member app      |
| 2    | `7a45e346` | feat(100-02): rewire routeNames.ts to re-export Spanish route-labels |

## Verification

- `grep -c` shows 31 keys in `route-labels.ts` (all 30 canonical + `games`)
- `PL: 'Plancha'` and `games: 'Juegos'` both present exactly once
- All 4 multi-char keys present as quoted strings: `'MN/RP'`, `'HD/ID'`, `'REVERSE HYPER'`, `'SIDE PCK'`
- Zero `any` types across both files
- `routeNames.ts` is 21 lines (≤ 25), zero English labels left, zero inline `'PL':` keys
- `tsc --noEmit` produces no errors for `route-labels.ts` or `routeNames.ts` (pre-existing errors in unrelated Quasar boot/routing files were not introduced by this plan and are out of scope per the executor scope-boundary rule)
- `eslint -c el-templo-app/eslint.config.js` clean on both files
- lint-staged hooks ran on both commits (prettier normalized to no-semis / no-trailing-comma per existing project style)

## Deviations from Plan

None. Plan executed exactly as written.

Notes:

- The pre-existing `routeNames.ts` also had an `INITIUM: 'Initium'` entry — that short code is a block **role**, not a route, and is NOT in the canonical 30-code list at `ExercisesPage.vue:648-679`. It is intentionally omitted from the new dictionary per the plan's explicit 31-entry (30 canonical + games) definition. Any callers that were relying on `ROUTE_NAMES['INITIUM']` returning `'Initium'` will now get the raw code `'INITIUM'` back from the fallback path in `getRouteLabel()`. Grep across the codebase (`getRouteName('INITIUM')`, `ROUTE_NAMES.INITIUM`, `ROUTE_NAMES\[.INITIUM.\]`) returned zero call sites, so no behavior regression is expected.
- Prettier (via lint-staged) re-formatted the committed files to strip trailing semicolons on statements and trailing commas — matches existing project style.

## Known Stubs

None. The dictionary is fully wired; no placeholder returns or TODO markers.

## Self-Check: PASSED

Files verified to exist:

- FOUND: `el-templo-app/src/constants/route-labels.ts`
- FOUND: `el-templo-app/src/modules/training/utils/routeNames.ts` (modified)

Commits verified via `git log --oneline -5`:

- FOUND: `45559f6d` feat(100-02): add Spanish route-labels dictionary in member app
- FOUND: `7a45e346` feat(100-02): rewire routeNames.ts to re-export Spanish route-labels
