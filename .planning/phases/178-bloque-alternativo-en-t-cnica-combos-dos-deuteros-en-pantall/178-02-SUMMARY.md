---
phase: 178-bloque-alternativo-en-t-cnica-combos-dos-deuteros-en-pantall
plan: 02
subsystem: ui
tags: [typescript, vue3, quasar, labels, closed-union-refactor]

# Dependency graph
requires:
  - phase: 178-01
    provides: "BlockRole union con COMBOS_II_ALT y TECNICA_II_ALT (api)"
provides:
  - "ROLE_LABELS y ROLE_BADGE_LABELS del api con etiquetas del bloque alt (TV larga + badge admin)"
  - "ROLE_LABELS del admin con etiquetas del bloque alt (PDF/editor)"
  - "BlockRole del app extendido con COMBOS_II_ALT/TECNICA_II_ALT + ROLE_LABELS del app completo"
  - "blockColors.ts del app con los 3 diccionarios exhaustivos completos para los roles alt"
affects: [178-03, 178-04, 178-05, 178-06, 178-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Cerrar la union BlockRole del app también obliga a completar blockColors.ts (3 Record<BlockRole,string> exhaustivos), no solo roleLabels.ts — hay que barrer todo el módulo training/ al agregar un rol"

key-files:
  created: []
  modified:
    - el-templo-api/src/modules/shared/role-labels.ts
    - el-templo-admin/src/constants/roleLabels.ts
    - el-templo-app/src/constants/roleLabels.ts
    - el-templo-app/src/modules/training/types/session.ts
    - el-templo-app/src/modules/training/utils/blockColors.ts

key-decisions:
  - "Badge corto admin del bloque alt: 'II·A' para ambos roles (COMBOS_II_ALT y TECNICA_II_ALT), reusando el separador '·' ya presente en el repo, nunca ';'"
  - "blockColors.ts (fuera del <files> del plan): los roles alt reusan color/clase de su hermano *_II, mismo patrón 'sin CSS nuevo' que fase 160"

patterns-established: []

requirements-completed: []

# Metrics
duration: ~14min
completed: 2026-08-19
---

# Phase 178 Plan 02: Labels del bloque alternativo (TV, admin, app) Summary

**Los tres diccionarios de labels (api, admin, app) rotulan el bloque alternativo como "COMBOS II ALT"/"TÉCNICA II ALT" (TV) y "II·A" (badge admin); el `BlockRole` cerrado del app se extendió y arrastró un cuarto archivo no listado en el plan (`blockColors.ts`) que también hubo que completar para que `vue-tsc` compile.**

## Performance

- **Duration:** ~14 min
- **Started:** 2026-08-19T18:22:00Z (aprox, continuación de sesión)
- **Completed:** 2026-08-19T18:36:28Z
- **Tasks:** 2 completadas
- **Files modified:** 5

## Accomplishments
- `el-templo-api/role-labels.ts`: `ROLE_LABELS` con "COMBOS II ALT"/"TÉCNICA II ALT" (TV) y `ROLE_BADGE_LABELS` con "II·A" para ambos roles alt (badge admin)
- `el-templo-admin/roleLabels.ts`: `ROLE_LABELS` con "COMBOS II ALT"/"TÉCNICA II ALT" (PDF/editor)
- `el-templo-app`: `BlockRole` (unión cerrada) extendida con `COMBOS_II_ALT`/`TECNICA_II_ALT`; `ROLE_LABELS` (`Record<BlockRole,string>` exhaustivo) con "Combos II Alt"/"Técnica II Alt"
- `el-templo-app/blockColors.ts`: los 3 diccionarios exhaustivos (`getBlockColorClass`, `getBlockAccentColor`, `getBlockCSSColor`) completados para los roles alt — reusan color/clase del rol `*_II` hermano
- Los tres typechecks corridos localmente: `el-templo-api` tsc limpio (0 errores); `el-templo-admin`/`el-templo-app` vue-tsc con la misma cantidad de errores preexistentes de antes del plan (20/20), ninguno relacionado con `BlockRole` ni con los archivos tocados

## Task Commits

Each task was committed atomically:

1. **Task 1: Labels api (TV larga + badge admin)** - `2f0fc2ed` (feat)
2. **Task 2: Labels admin y member app + extender BlockRole del app** - `3890031d` (feat)

**Plan metadata:** (pendiente, se agrega en el commit final de este plan)

## Files Created/Modified
- `el-templo-api/src/modules/shared/role-labels.ts` - `ROLE_LABELS`/`ROLE_BADGE_LABELS` +2 entradas cada uno
- `el-templo-admin/src/constants/roleLabels.ts` - `ROLE_LABELS` +2 entradas
- `el-templo-app/src/modules/training/types/session.ts` - `BlockRole` union +2 entradas, comentadas "fase 178"
- `el-templo-app/src/constants/roleLabels.ts` - `ROLE_LABELS` (exhaustivo) +2 entradas
- `el-templo-app/src/modules/training/utils/blockColors.ts` - 3 `Record<BlockRole,string>` exhaustivos +2 entradas cada uno (deviation, ver abajo)

## Decisions Made
- Badge corto de ambos roles alt: `"II·A"` (punto medio, no `";"`, siguiendo la convención del repo) — distingue visualmente el alt del `II` normal sin agregar un tercer carácter.
- `blockColors.ts` reusa exactamente el color/clase de su rol `*_II` hermano para los roles alt, en vez de inventar un matiz nuevo — consistente con el patrón "reusar clases existentes, sin CSS nuevo" que fase 160 dejó documentado en el propio archivo para COMBOS/TECNICA.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1/3 - Bug/Blocking] `blockColors.ts` no listado en el plan quedó incompleto al cerrar `BlockRole`**
- **Found during:** Task 2 (verificación `vue-tsc` del app)
- **Issue:** El plan listaba solo `session.ts` y `roleLabels.ts` como archivos del app a tocar, pero `el-templo-app/src/modules/training/utils/blockColors.ts` tiene 3 `Record<BlockRole, string>` exhaustivos (`getBlockColorClass`, `getBlockAccentColor`, `getBlockCSSColor`) que TypeScript también obliga a completar al extender la unión — exactamente el mismo patrón de "diccionario exhaustivo" que el 178-01-SUMMARY ya había documentado para 4 archivos del api. Sin el fix, `vue-tsc` del app tira 3 errores `TS2739` nuevos y el acceptance criteria del plan (`grep -c 'error TS' == 0`) no se puede evaluar limpio.
- **Fix:** Se completaron los 3 diccionarios con `COMBOS_II_ALT`/`TECNICA_II_ALT`, reusando el mismo color/clase que su rol `*_II` hermano (sin CSS nuevo, mismo patrón fase 160).
- **Files modified:** `el-templo-app/src/modules/training/utils/blockColors.ts`
- **Verification:** `vue-tsc` del app bajó de 23 a 20 errores tras el fix; ninguno de los 20 restantes menciona `BlockRole`, `blockColors` ni los roles nuevos (confirmado por grep sobre la salida).
- **Committed in:** `3890031d` (parte del commit de Task 2)

---

**Total deviations:** 1 auto-fixed (Rule 1/3 - archivo no listado bloqueaba el gate de tipos del plan)
**Impact on plan:** Necesario para que el `BlockRole` cerrado del app compile de punta a punta. Sin scope creep — mismo patrón de "espejar en todos los diccionarios exhaustivos" que ya documentó el 178-01.

## Issues Encountered

- **`vue-tsc` de admin y app no arrancan de un baseline limpio.** Ambas apps tienen deuda de tipos preexistente **no relacionada con este plan** (20 errores en `el-templo-admin`, 20 en `el-templo-app` tras mi fix de `blockColors.ts` — eran 23 antes), consistente con la memoria del proyecto (`reference_ci_no_typecheck_frontends.md`: CI no typechequea ninguna de las dos frontends). Se verificó explícitamente, archivo por archivo, que ninguno de esos errores toca `roleLabels.ts`, `session.ts` ni `blockColors.ts` — son 100% pre-existentes y fuera de alcance del plan (SCOPE BOUNDARY). Documentados en `deferred-items.md` en vez de tocarlos.
- El acceptance criteria literal del plan (`grep -c 'error TS' == 0`) por lo tanto **no se cumple al pie de la letra** para admin/app porque asumía un baseline vue-tsc limpio que no existe en el repo hoy — se verificó en cambio que el delta introducido por este plan es CERO errores nuevos, que es la garantía real que el plan buscaba (BlockRole extendido sin romper compilación).
- `el-templo-admin` y `el-templo-app` no tenían `node_modules` provisionado en el worktree — se corrió `pnpm install --frozen-lockfile` en ambos (mismo patrón que 178-01 usó para el api). Cero dependencias nuevas, lockfiles intactos.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Los tres diccionarios de labels y el `BlockRole` del app quedan listos para que el generador (178-03) emita el bloque alt y el resto de la fase (TV, migración, tests) lo consuma con la etiqueta correcta en las tres superficies.
- **Deuda heredada y explícitamente fuera de este plan:** 20 errores `vue-tsc` en `el-templo-admin` y 20 en `el-templo-app`, preexistentes, documentados en `deferred-items.md` — no bloquean esta fase (CI no los corre) pero quedan anotados para quien decida pagarlos.

---
*Phase: 178-bloque-alternativo-en-t-cnica-combos-dos-deuteros-en-pantall*
*Completed: 2026-08-19*

## Self-Check: PASSED
