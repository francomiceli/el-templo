---
phase: 115-evento-desafio-de-la-barra
plan: 02
subsystem: el-templo-app (member app, frontend)
tags: [frontend, scaffolding, module, router, pinia, composable]
requires: []
provides:
  - el-templo-app/src/modules/bar-challenge/ (module skeleton, D-01/D-02)
  - useBarChallengeWindow composable (D-04 + D-06)
  - useBarChallengeStore Pinia setup store (skeleton — actions stub)
  - 3 lazy-loaded routes children of MainLayout (D-03)
  - UserProfile extended with 3 bar-challenge fields
affects:
  - el-templo-app/src/stores/useUserStore.ts (UserProfile interface)
  - el-templo-app/src/router/routes.ts (children of `/`)
tech_stack_added: []
patterns_used:
  - Pinia setup store (defineStore with setup fn)
  - createLogger() (not console.*)
  - Composable without onUnmounted (caller owns lifecycle)
  - Lazy-loaded route components (`() => import(...)`)
key_files:
  created:
    - el-templo-app/src/modules/bar-challenge/composables/useBarChallengeWindow.ts
    - el-templo-app/src/modules/bar-challenge/stores/useBarChallengeStore.ts
    - el-templo-app/src/modules/bar-challenge/pages/Explicacion.vue
    - el-templo-app/src/modules/bar-challenge/pages/Timer.vue
    - el-templo-app/src/modules/bar-challenge/pages/Resultado.vue
  modified:
    - el-templo-app/src/stores/useUserStore.ts
    - el-templo-app/src/router/routes.ts
decisions:
  - "Window constant hardcoded in composable (T-115-05 disposition: accept)"
  - "?bar-challenge-force=1 query param overrides isActive (D-06)"
  - "Pages use defineOptions({ name: ... }) to satisfy vue/multi-word-component-names while keeping file names locked by the plan"
metrics:
  duration_minutes: ~10
  tasks_completed: 2
  files_created: 5
  files_modified: 2
  completed_date: 2026-05-21
---

# Phase 115 Plan 02: Frontend Module Scaffolding — Summary

Scaffolding completo del módulo `bar-challenge` en `el-templo-app`: composable de ventana con force-flag, store Pinia esqueleto, 3 pages stub navegables, 3 rutas children de `MainLayout`, y extensión del `UserProfile` con los 3 fields que va a poblar el endpoint de Plan 04. Cero código de comportamiento real — sólo el shape que los Planes 04/05/06 consumen.

## What was built

### Task 1 — Composable + Store + UserProfile extension (commit `11ee14e3`)

- **`useBarChallengeWindow.ts`** — exporta `BAR_CHALLENGE_WINDOW = { start: '2026-05-23T15:00:00Z', end: '2026-05-25T15:00:00Z' }` (D-04) y una factory `useBarChallengeWindow()` que devuelve `{ start, end, isActive, isBeforeWindow, isAfterWindow }`. `isActive` es `true` cuando `Date.now()` cae en `[start, end)` o cuando el query param `?bar-challenge-force=1` está presente (D-06). Tipo de retorno explícito (`BarChallengeWindowApi`), cero `any`.

- **`useBarChallengeStore.ts`** — Pinia setup store `defineStore('barChallenge', () => ...)` con state reactivo declarado:
  - `startTimestamp: Ref<number | null>` (init `null`)
  - `secondsHeld: Ref<number>` (init `0`)
  - `isRunning: Ref<boolean>` (init `false`)
  - `photoBase64: Ref<string | null>` (init `null`)
  - `attemptResult: Ref<{ completed: boolean; seconds: number } | null>` (init `null`)
  - Acciones (stubs que sólo loggean, implementación real en Plan 05): `start()`, `tick()`, `setPhoto(base64)`, `finalize()`, `submit()` (async), `reset()`.
  - Logger via `createLogger('bar-challenge-store')`.

- **`useUserStore.ts`** — `UserProfile` extendido con 3 fields nuevos, todos `| null` para tolerar el caso "todavía no intentó":
  ```ts
  barChallengeCompleted: boolean | null;
  barChallengeSeconds: number | null;
  barChallengeAttemptedAt: string | null;
  ```
  Sin tocar el resto del store. Change quirúrgico a la interface.

### Task 2 — Stub pages + router (commit `d1f6822f`)

- 3 archivos `.vue` con un `<q-page>` mínimo y `defineOptions({ name: '...' })` para satisfacer el lint rule `vue/multi-word-component-names` sin renombrar archivos (los nombres están lockeados por D-02).
- 3 entries nuevas en `routes.ts`, **dentro** del `children: [...]` de `path: '/'` (MainLayout), después de `change-password`:
  - `path: 'desafio-barra'` → `desafio-barra-explicacion` → `pages/Explicacion.vue`
  - `path: 'desafio-barra/timer'` → `desafio-barra-timer` → `pages/Timer.vue`
  - `path: 'desafio-barra/resultado'` → `desafio-barra-resultado` → `pages/Resultado.vue`
- Sin meta `requireAuth` extra — `MainLayout` ya enforce auth para todos sus children (mismo patrón que `/reservas`).

## Final UserProfile shape (post-plan)

```ts
export interface UserProfile {
  id: number;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: "member" | "coach" | "admin" | "superadmin";
  level: Level;
  branchId: number;
  branchName: string;
  branchIsVirtual: boolean;
  branchCountry: "AR" | "ES";
  segment: MemberSegment | null;
  onboardingCompleted: boolean;
  gender: "male" | "female" | "other" | "unspecified" | null;
  dateOfBirth: string | null;
  // Phase 115 (this plan)
  barChallengeCompleted: boolean | null;
  barChallengeSeconds: number | null;
  barChallengeAttemptedAt: string | null;
}
```

## Composable return contract

```ts
export interface BarChallengeWindowApi {
  start: string; // '2026-05-23T15:00:00Z'
  end: string; // '2026-05-25T15:00:00Z'
  isActive: ComputedRef<boolean>; // window open OR ?bar-challenge-force=1
  isBeforeWindow: ComputedRef<boolean>; // Date.now() < start
  isAfterWindow: ComputedRef<boolean>; // Date.now() >= end
}
```

## What stays as stub (explicit non-scope)

| Item                                                                     | Resolved in |
| ------------------------------------------------------------------------ | ----------- |
| Store actions (start/tick/setPhoto/finalize/submit/reset) — sólo loggean | Plan 05     |
| Page content (Explicacion / Timer / Resultado) — sólo render vacío       | Plan 06     |
| GET /me poblando los 3 fields nuevos del UserProfile                     | Plan 04     |
| Card de entrada al desafío en home + integración con `isActive`          | Plan 05     |
| Submit endpoint backend (POST attempt + foto upload)                     | Plan 04     |

Las refs del store ya existen y son consumibles; los componentes pueden tipar `useBarChallengeStore()` sin que TS se queje. La UI no rompe si se navega a las 3 rutas hoy mismo — sólo se ven los stubs.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] ESLint `vue/multi-word-component-names` falla en pages stub**

- **Found during:** Task 2 (pre-commit hook).
- **Issue:** Los nombres de archivo `Explicacion.vue`, `Timer.vue`, `Resultado.vue` están lockeados por D-02 / acceptance criteria del plan, pero el lint rule `vue/multi-word-component-names` los rechazaba como single-word.
- **Fix:** Agregar `defineOptions({ name: 'BarChallenge<X>' })` dentro del `<script setup>` de cada page. Esto satisface el lint sin renombrar archivos y deja el nombre interno alineado con la convención del módulo.
- **Files modified:** `el-templo-app/src/modules/bar-challenge/pages/{Explicacion,Timer,Resultado}.vue`
- **Commit:** `d1f6822f` (incluido en el commit de Task 2 — fix aplicado antes del segundo intento del hook).

**2. [Rule 3 — Blocking] Worktree sin `node_modules` impide que pre-commit hooks corran**

- **Found during:** Task 1 (primer intento de commit).
- **Issue:** El worktree fresco no tiene `node_modules` ni en root ni en `el-templo-app/`, así que `lint-staged` no encontraba `eslint`. Memory rule: "Never install OR update dependencies without asking" — `pnpm install` está fuera de scope.
- **Fix:** Symlink de los `node_modules` ya instalados en el main repo a las paths esperadas por el hook (`./node_modules` y `./el-templo-app/node_modules`). No instala nada nuevo — sólo reutiliza el árbol existente.
- **Files modified:** Ninguno (symlinks fuera de git, ignorados por `.gitignore`).
- **Commit:** N/A.

## Verification status

- **Type-check (`pnpm exec vue-tsc --noEmit`)** — el script `type-check` no existe en `package.json` y `vue-tsc` no está en el árbol de dependencias del proyecto (no aparece en `node_modules/.bin/`). Verificación TS quedó deferida; el código fue escrito siguiendo los tipos explícitos del proyecto (sin `any`, narrowing correcto). El siguiente plan que toque estos archivos validará type-check via build pipeline.
- **ESLint** — corrió OK en el commit final (lint-staged hook verde).
- **Prettier** — corrió OK.
- **Manual route render** — no ejecutado (requeriría `pnpm dev`). Los stubs son `<q-page>` con un `<p>` adentro — render trivial, sin posibilidad de runtime error.

## Acceptance criteria — check

- `grep -c "BAR_CHALLENGE_WINDOW" useBarChallengeWindow.ts` → 3 (export + 2 referencias a `.start` / `.end`). ✓ (>= 1)
- `grep -c "bar-challenge-force" useBarChallengeWindow.ts` → 1. ✓
- `grep -c "defineStore('barChallenge'" useBarChallengeStore.ts` → 1. ✓
- `grep -c "barChallengeAttemptedAt: string | null" useUserStore.ts` → 1. ✓
- `ls modules/bar-challenge/pages/` → exactamente `Explicacion.vue`, `Resultado.vue`, `Timer.vue`. ✓
- `grep -c "desafio-barra-{explicacion,timer,resultado}" routes.ts` → 1 cada uno. ✓
- `awk '/children: \[/,/^    \],$/' routes.ts | grep -c "desafio-barra"` → 6 (3 paths + 3 names, todos dentro del bloque). ✓

## Commits

- `11ee14e3` — feat(115-02): add bar-challenge module composable + store skeleton
- `d1f6822f` — feat(115-02): add bar-challenge stub pages + register routes

## Self-Check: PASSED

- Files created (worktree):
  - `el-templo-app/src/modules/bar-challenge/composables/useBarChallengeWindow.ts` — FOUND
  - `el-templo-app/src/modules/bar-challenge/stores/useBarChallengeStore.ts` — FOUND
  - `el-templo-app/src/modules/bar-challenge/pages/Explicacion.vue` — FOUND
  - `el-templo-app/src/modules/bar-challenge/pages/Timer.vue` — FOUND
  - `el-templo-app/src/modules/bar-challenge/pages/Resultado.vue` — FOUND
- Files modified: `el-templo-app/src/stores/useUserStore.ts`, `el-templo-app/src/router/routes.ts` — both contain the expected additions.
- Commits exist in branch `worktree-agent-aaeaca315c1b8e1c1`: `11ee14e3`, `d1f6822f` — both FOUND in `git log`.
