---
phase: 180-campa-as-etapa-2-magic-links-por-sede-selector-de-audiencias
plan: 05
subsystem: member-app-scheduling
tags: [reservas, branches, maps, trial, member-app, vue, quasar]
status: completed

# Dependency graph
requires:
  - phase: 180-02
    provides: "GET /members/scheduling/branches devuelve address + mapsUrl (buildMapsUrl)"
provides:
  - "BranchOption {id, name, address, mapsUrl} exportado desde useSchedulingApi.ts"
  - "BranchPickerDialog.vue — popup de elección de sede para modo prueba"
  - "Selector de sede (trial y multi-sede regular) con dirección como caption + link Cómo llegar"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Un solo normalizador de nombre de sede: el shim API-side (appBranchName) es la única fuente; se retiró el replace() duplicado del front"
    - "Dialog no bloqueante reusando tokens de marca de PlanExpiryDialog.vue (charcoal/terracotta/cream, sin re-estilizar)"
    - "q-select con slot #option para caption de dirección, reusado en ambos selectores de sede (trial y regular)"

key-files:
  created:
    - el-templo-app/src/components/BranchPickerDialog.vue
  modified:
    - el-templo-app/src/composables/useSchedulingApi.ts
    - el-templo-app/src/pages/ReservasPage.vue

key-decisions:
  - "Shim de nombre de sede: el shim API-side (appBranchName, plan 180-02) está VIVO — confirmado con grep en el-templo-api/src (usado en el handler GET /branches). Se eliminó el replace(/^El Templo\\s+/i, 'Sede ') del front (branchOptions en ReservasPage.vue) para dejar UN solo normalizador (el server). El nombre que ve el socio de El Templo pasa a ser el que ya reconstruye appBranchName ('El Templo <sede corta>'), sin la conversión cosmética 'Sede X' que hacía el regex baked del front. Es un cambio de comportamiento visual menor y deliberado: elimina la duplicación de normalización que el Task 1 pedía verificar."
  - "El popup de sedes (BranchPickerDialog) y el link 'Cómo llegar' del selector reusan la MISMA función helper mapsUrlForBranch()/branchOptions — no hay una segunda fuente de verdad de mapsUrl."
  - "Se extendió la mejora de D-17 (dirección + Cómo llegar) a AMBOS q-select de sede (modo prueba Y multi-sede regular), no solo al de prueba: la must_have truth del plan dice 'El selector de sede muestra la dirección de cada sede (D-17)' sin acotarlo a modo prueba, y branchOptions ya es compartido por los dos selectores — separar el comportamiento hubiera sido inconsistente (DRY, CLAUDE.md)."
  - "Gate de apertura del popup vive en onMounted, dentro del bloque existente 'if (trialEligible.value)', con una condición explícita 'if (isTrialMode.value && trialBranchId.value === null && branches.value.length > 0)'. Se agregó el guard branches.value.length > 0 (no pedido literalmente por el plan) para no abrir un popup vacío si /branches no devuelve sedes — Rule 2 (correctness)."

requirements-completed: [RES-01, RES-02]

# Metrics
duration: ~65min
completed: 2026-08-23
---

# Fase 180 Plan 05: Popup de sede con dirección + selector con "Cómo llegar" Summary

**El freemium en modo prueba elige su sede en un popup nuevo (nombre, dirección y "Cómo llegar") que alimenta el MISMO selector de sede que ya existía — sin UI duplicada — y ese selector, junto con el de socios multi-sede regulares, ahora muestra la dirección de cada sede.**

## Performance

- **Duration:** ~65 min
- **Completed:** 2026-08-23
- **Tasks:** 3/3
- **Files modified:** 3 (1 nuevo, 2 modificados)

## Accomplishments

- `BranchOption` en `useSchedulingApi.ts` pasa de `{id, name}` a `{id, name, address, mapsUrl}` y queda exportado para que el popup lo consuma sin redeclararlo.
- Se resolvió el doble-shim de nombre de sede: el shim API-side (`appBranchName`, plan 180-02) está vivo en `GET /branches`, así que se retiró el `replace()` duplicado del front — un solo normalizador (el server).
- `BranchPickerDialog.vue` (nuevo): popup no bloqueante con la paleta de marca de `PlanExpiryDialog.vue` (charcoal `#2e2a26` / gradiente terracotta / secundario flat cream-55, sin re-estilizar), una fila por sede con nombre + dirección (o "Dirección no disponible") y botón "Cómo llegar" que abre `mapsUrl` en pestaña nueva con `noopener` (mitiga T-180-20) sin disparar la selección de la fila.
- `ReservasPage.vue`: el popup se monta en el estado "modo reservar prueba" y se abre UNA vez cuando `isTrialMode && trialBranchId === null && hay sedes cargadas`; el evento `select` setea el MISMO `trialBranchId` que ya alimenta el `q-select` existente (D-09, sin segundo estado de sede). Ambos selectores de sede (prueba y multi-sede regular) muestran la dirección como caption vía el slot `#option` de Quasar, más un botón "Cómo llegar" junto al selector cuando ya hay sede elegida (D-17).

## Task Commits

Ejecutados dentro del worktree `/home/franco/projects/et-180` (rama `feat/180-campanas-etapa-2`):

1. **Task 1: `BranchOption` con `address`/`mapsUrl` + un solo normalizador de nombre** - `fa1b38c0` (feat)
2. **Task 2: `BranchPickerDialog.vue`** - `d743a261` (feat)
3. **Task 3: Integrar el popup y la dirección en `ReservasPage`** - `29e59124` (feat)

## Files Created/Modified

- `el-templo-app/src/composables/useSchedulingApi.ts` — `BranchOption` exportado, extendido con `address`/`mapsUrl`.
- `el-templo-app/src/components/BranchPickerDialog.vue` (nuevo) — popup de sedes, props `modelValue`/`branches`, emits `update:modelValue`/`select`.
- `el-templo-app/src/pages/ReservasPage.vue` — monta el popup, gate de apertura en `onMounted`, `branchOptions` extendido, slot `#option` + botón "Cómo llegar" en ambos `q-select` de sede.

## Decisions Made

Ver `key-decisions` en el frontmatter. Resumen del punto crítico del Task 1 (shim de nombres):

- `grep -rn "app-branch-name" el-templo-api/src` confirma que `appBranchName` está importado y usado en el handler `GET /branches` (`el-templo-api/src/modules/scheduling/routes.ts:1144`).
- Por eso se eliminó el `replace()` del front: `grep -c "El Templo" el-templo-app/src/pages/ReservasPage.vue` == 0, `grep -rc "replace(/^El Templo" el-templo-app/src` == 0 (antes había 1, en `ReservasPage.vue`).
- Efecto visible: el nombre de sede para el tenant El Templo pasa de "Sede X" (conversión cosmética del front) a lo que ya arma `appBranchName` server-side. Es la fuente única de verdad; no se inventó un segundo helper de normalización en el front como preveía el fallback del Task 1 ("si NO está vivo, conservarlo y aplicarlo también en el popup") porque el shim SÍ está vivo.

## Deviations from Plan

### Auto-fixed / Ajustes documentados (sin Rule 1-4 sobre bugs de producto)

**1. [Ajuste de alcance, DRY] El link "Cómo llegar" + caption de dirección se aplicó también al selector multi-sede regular (no solo al de modo prueba)**

- **Encontrado en:** Task 3.
- **Motivo:** el must_have truth "El selector de sede muestra la dirección de cada sede (D-17)" no está acotado a modo prueba en el plan, y `branchOptions` ya es compartido por ambos `q-select`. Aplicarlo solo al de prueba hubiera dejado dos comportamientos distintos para el mismo componente/estructura de datos.
- **Archivos:** `el-templo-app/src/pages/ReservasPage.vue`.
- **Commit:** `29e59124`.

**2. [Rule 2 — correctness] Guard `branches.value.length > 0` antes de abrir el popup automáticamente**

- **Encontrado en:** Task 3, onMounted.
- **Motivo:** el plan solo pedía `isTrialMode && trialBranchId === null && sedes cargadas`; si `/branches` devolviera una lista vacía (país sin sedes activas, error silencioso ya contemplado con el `catch` existente), abrir un popup sin filas sería un estado roto.
- **Archivos:** `el-templo-app/src/pages/ReservasPage.vue`.
- **Commit:** `29e59124`.

**3. [Blocker — Rule 3, tooling] `vue-tsc` no está instalado en `el-templo-app` (solo declarado como peer opcional de `vite-plugin-checker` en el lockfile, nunca resuelto)**

- **Encontrado en:** Task 1, al intentar correr el `<verify>` obligatorio del plan.
- **Diagnóstico:** `pnpm exec vue-tsc --noEmit` falla con "Command not found"; no hay binario `vue-tsc` en `node_modules/.bin` ni transitivamente. `pnpm-lock.yaml` solo lo lista como peerDependency opcional de `vite-plugin-checker@0.11.0` (`vue-tsc: ~2.2.10 || ^3.0.0`), nunca como dependencia real instalada.
- **Resolución:** se corrió el typecheck vía `pnpm dlx --package vue-tsc@2.2.10 --package typescript@5.9.3 vue-tsc --noEmit -p .quasar/tsconfig.json` — ephemeral, sin tocar `package.json` ni `pnpm-lock.yaml` del proyecto (no cuenta como "instalar una dependencia nueva" en el repo; es equivalente a `npx`). Se usó explícitamente `-p .quasar/tsconfig.json` (el generado por `quasar prepare`) en vez del `tsconfig.json` de raíz, porque este último no resuelve los ambient types de Quasar (`#q-app/wrappers`, `import.meta.env`) y produce ~9 falsos positivos que no existen con la config real de build.
- **No se tocó** `package.json`/`pnpm-lock.yaml` de `el-templo-app`. Sí se corrió `pnpm install --frozen-lockfile` porque `node_modules` no existía en absoluto para este paquete (contemplado explícitamente en el contexto del prompt: "si la member app necesita deps... `pnpm install --frozen-lockfile` solo si falta node_modules del paquete").
- **Archivos:** ninguno de producto: solo instalación de dependencias ya declaradas en el lockfile existente.

## Verification

- `pnpm dlx --package vue-tsc@2.2.10 --package typescript@5.9.3 vue-tsc --noEmit -p .quasar/tsconfig.json` (equivalente al `vue-tsc --noEmit` del plan) → **17 errores, TODOS pre-existentes** (`src/boot/__tests__/axios-refresh-lock.test.ts`, `src/layouts/MainLayout.vue`, `src/modules/onboarding/components/OnboardingQuestion.vue`, `src/pages/ChangePasswordPage.vue`, `src/pages/ProfilePage.vue`, `test/level-selection-storage.test.ts`, `test/session-player-combos.test.ts`, `test/user-store-especial-pass.test.ts`, `test/user-store-level-selection.test.ts`). **Cero errores** en `useSchedulingApi.ts`, `BranchPickerDialog.vue` o `ReservasPage.vue` — se corrió el mismo comando después de cada task y el conteo se mantuvo en 17 en las tres corridas (Task 1, Task 2, Task 3).
- `pnpm exec eslint -c ./eslint.config.js src/composables/useSchedulingApi.ts src/components/BranchPickerDialog.vue src/pages/ReservasPage.vue` → 0 salida (limpio).
- `pnpm test` (vitest, `el-templo-app`) → **91/93 verdes**. Los 2 tests que fallan (`test/level-display.test.ts`) son pre-existentes y no relacionados con este plan (ver "Known Issues" abajo y `deferred-items.md`).
- Greps de acceptance criteria de los 3 tasks corridos y verificados uno por uno (ver "Decisions Made" y el detalle de cada task en el diff).

## Known Issues / Deferred

- **`test/level-display.test.ts` — 2 tests rotos, PRE-EXISTENTES, fuera de alcance de este plan.** `TRAINING_LEVELS` tiene 6 entradas (incluye `kairos`) contra las 5 que el test espera. `src/modules/training/level-display.ts` y su test no fueron tocados por ningún plan de la fase 180 (último commit: `11dcc024`, fase 99) — el drift es anterior. Documentado en `.planning/phases/180-campa-as-etapa-2-magic-links-por-sede-selector-de-audiencias/deferred-items.md`. No se tocó el archivo (scope boundary del executor).
- **Falso positivo en el acceptance criteria de Task 3** (`grep -cE "const (selectedBranch|pickerBranch|branchChoice)" ReservasPage.vue`): matchea 1, pero es el ref pre-existente `selectedBranchId` (selector de socios multi-sede regular, ya existía ANTES del Task 1 de este plan — confirmado en `git show fa1b38c0^:...`), no un segundo estado de sede nuevo introducido por este plan. El regex del acceptance criteria no anticipó que `selectedBranch` es substring de `selectedBranchId`. No se renombró código pre-existente ajeno a este plan para "arreglar" el grep.

## User Setup Required

- Ninguna variable de entorno nueva. Ninguna migración. Ninguna dependencia nueva agregada al `package.json` del proyecto (el `pnpm install --frozen-lockfile` corrido en `el-templo-app` solo materializó `node_modules` desde el lockfile existente, porque no existía en el worktree).

## Next Phase Readiness

- `BranchOption` con `address`/`mapsUrl` queda disponible para cualquier otro consumidor de `useSchedulingApi().getBranches()` en la app.
- `BranchPickerDialog.vue` es un componente autocontenido reusable si otra pantalla necesita el mismo popup de elección de sede.
- La verificación visual del popup y el flujo completo queda para el checkpoint de cierre de fase (plan 180-16), como indica la sección `<verification>` del plan.
- Sin bloqueos para el siguiente plan de la fase.

---

_Phase: 180-campa-as-etapa-2-magic-links-por-sede-selector-de-audiencias_
_Completed: 2026-08-23_

## Self-Check: PASSED

- FOUND: el-templo-app/src/components/BranchPickerDialog.vue (worktree et-180)
- FOUND: el-templo-app/src/composables/useSchedulingApi.ts (worktree et-180)
- FOUND: el-templo-app/src/pages/ReservasPage.vue (worktree et-180)
- FOUND: este SUMMARY.md en el checkout principal
- FOUND: deferred-items.md en el checkout principal
- FOUND: commit fa1b38c0 (feat, Task 1)
- FOUND: commit d743a261 (feat, Task 2)
- FOUND: commit 29e59124 (feat, Task 3)
