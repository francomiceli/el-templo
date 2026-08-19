---
phase: 160-semana-nueva-frontend-admin-ui-horarios-app-pdf-y-tv
plan: 02
subsystem: pdf
tags: [pdfmake, vue3, quasar, admin, session-generator]

# Dependency graph
requires:
  - phase: 159-semana-nueva-backend-modos-de-dia-generadores-roles-de-bloqu
    provides: sesiones combos/tecnica persistidas con roles COMBOS_I/II, TECNICA_I/II, STRETCHING
  - phase: 160-01
    provides: espejo ROLE_LABELS del API (el-templo-api/src/modules/shared/role-labels.ts) y convención de labels D160-02
provides:
  - "el-templo-admin/src/constants/roleLabels.ts — dict rol→label del admin (consumido por 160-03, editor de sesiones)"
  - "sessionsToPdfDay: tercera rama combos/tecnica (INITIUM + grids COMBOS/TECNICA I/II + STRETCHING lista simple)"
  - "buildDayContent: tercera rama de layout combos/tecnica + buildStretchingPage (STRETCHING sin el literal PYROS)"
affects: [160-03 (editor de sesiones, importa roleLabels.ts), 160 cierre (bump versión), any future PDF/label work]

tech-stack:
  added: []
  patterns:
    - "isStretching?: boolean flag estructural en PdfBlockPage (paralelo a isRom) — detección de rama en el builder sin acoplarse a strings de label"
    - "un dict ROLE_LABELS por app (D160-03): espejo a propósito, INITIUM difiere entre API (PYROS, título único) y admin (INITIUM, título+subtítulo separados)"

key-files:
  created:
    - el-templo-admin/src/constants/roleLabels.ts
  modified:
    - el-templo-admin/src/utils/pdf/pdf-types.ts
    - el-templo-admin/src/utils/pdf/session-data-transformer.ts
    - el-templo-admin/src/utils/pdf/session-pdf-builder.ts

key-decisions:
  - "vue-tsc no está instalado como devDependency del admin (gap de tooling preexistente, documentado en STATE.md desde fases anteriores) — se corrió via `pnpm --package=vue-tsc@3.2.5 --package=typescript@5.9.3 dlx vue-tsc --noEmit` (versión pinneada igual a STACK.md) para no modificar package.json/lockfile del proyecto."
  - "Detección de la rama combos/técnica en buildDayContent via `day.blocks.some(b => b.isStretching)` en vez de comparar contra los strings largos de ROLE_LABELS — inequívoco (solo la rama nueva del transformer setea isStretching) y no acopla el builder a los valores de display."
  - "roleLabels.ts admin INITIUM→'INITIUM' (no 'PYROS', a diferencia del espejo del API) porque el PDF ya separa role/blockName como campos distintos; documentado en el docblock del archivo para que 160-03 no lo copie mal."

patterns-established:
  - "buildStretchingPage: derivado mínimo de buildInitiumPage sin el título hardcodeado 'PYROS' — precedente para cualquier página futura que necesite el layout de lista simple con un título distinto."

requirements-completed: [SEM-09, SEM-11]

duration: ~35min
completed: 2026-08-14
---

# Phase 160 Plan 02: PDF combos/técnica + STRETCHING + diccionario de labels admin Summary

**El PDF de sesiones ahora imprime días combos/técnica (INITIUM + COMBOS/TECNICA I/II en grid + STRETCHING como lista simple compartida) en vez de "solo INITIUM + cierre"; el admin tiene un diccionario único rol→label (`constants/roleLabels.ts`) que 160-03 reutiliza.**

## Performance

- **Tasks:** 2/2 completadas
- **Files modified:** 3 modificados + 1 creado

## Accomplishments

- `sessionsToPdfDay` (transformer) detecta sesiones combos/técnica por rol (`COMBOS_`/`TECNICA_`) y arma INITIUM compartido + grids COMBOS I/II o TECNICA I/II (reusa `buildGridPage`, igual que NUCLEUS/DEUTEROS) + STRETCHING como bloque `isStretching: true` con `simpleExercises` (fuente determinista via `findCanonicalBlock`, mismo criterio que movilidad/formato del resto del transformer).
- `buildDayContent` (builder) agrega la tercera rama de layout: INITIUM (`buildInitiumPage`) + bloques combos/técnica (`buildFullBlockPage`, mismo layout full-page que NUCLEUS) + STRETCHING vía el nuevo `buildStretchingPage` (derivado mínimo de `buildInitiumPage` que imprime `block.role` como título en vez del literal `'PYROS'` hardcodeado).
- `el-templo-admin/src/constants/roleLabels.ts`: dict `ROLE_LABELS` único del admin (D160-03), consumido ya por el transformer (reemplaza el `ROM_ZONE_LABELS` local) y preparado para el editor de sesiones (160-03).
- `formatNameWithParams` (3 copias espejo) NO se tocó — verificado por `git diff` (ninguna línea de la definición de la función aparece en el diff, solo llamadas nuevas a ella).

## Task Commits

1. **Task 1: Dict de labels del admin + rama combos/técnica en el transformer (SEM-11, SEM-09 datos)** - `8ec80b46` (feat)
2. **Task 2: Rama combos/técnica en buildDayContent (SEM-09)** - `6b08eb1d` (feat)

_Sin commit de metadata separado — ver este SUMMARY + el commit de cierre del orquestador._

## Files Created/Modified

- `el-templo-admin/src/constants/roleLabels.ts` (creado) — `ROLE_LABELS: Record<string,string>` (INITIUM, NUCLEUS, DEUTEROS_1/2, EPIKOS, ATHLOS, ROM_LOWER/CORE/UPPER, COMBOS_I/II, TECNICA_I/II, STRETCHING) + helper `getRoleLabel()`. Exports consumidos por el PDF (este plan) y por 160-03 (editor).
- `el-templo-admin/src/utils/pdf/pdf-types.ts` — agrega `PdfBlockPage.isStretching?: boolean` (paralelo a `isRom`).
- `el-templo-admin/src/utils/pdf/session-data-transformer.ts` — importa `ROLE_LABELS`; migra `ROM_ZONE_LABELS` local al dict; agrega la detección `isCombosTecnica` y la rama combos/técnica completa en `sessionsToPdfDay` (INITIUM + `buildGridPage` COMBOS_I/II/TECNICA_I/II + bloque STRETCHING).
- `el-templo-admin/src/utils/pdf/session-pdf-builder.ts` — agrega `buildStretchingPage()` (nueva función) y la rama `isCombosTecnicaDay` en `buildDayContent` (entre `isRomDay` y la rama regular).

## Decisions Made

- **Detección de rama en el builder:** se usó el flag estructural `isStretching` en vez de comparar `role` contra los labels largos de `ROLE_LABELS` (la alternativa que ofrecía el plan). Es inequívoca porque solo la rama nueva del transformer setea `isStretching: true`; ni un día regular ni un día ROM lo setean nunca. Documentado en un comentario inline en `buildDayContent`.
- **`ROLE_LABELS.INITIUM` = `'INITIUM'`** (no `'PYROS'` como el espejo del API `tv/roster.ts`/`shared/role-labels.ts`) — el PDF ya separa `role`/`blockName` como campos distintos en `PdfBlockPage` (`buildInitiumPage` imprime `blockName` como título grande y `role` en el subtítulo `"INITIUM · {formatName}"`); mapear INITIUM→PYROS acá hubiera duplicado el literal. Documentado en el docblock de `roleLabels.ts` para que 160-03 no copie el valor del espejo del API sin revisar.
- **`buildStretchingPage` es un "mínimo derivado"** de `buildInitiumPage`: no reimplementa el soporte de `customTitle` (el transformer nunca lo setea para STRETCHING) ni el bloque de `formatParams` en la esquina (campo legacy que el transformer tampoco popula para ningún bloque tipo-lista, confirmado por grep — dead field ya en `buildInitiumPage`).
- **Gate de tipos sin `vue-tsc` instalado:** el admin no tiene `vue-tsc` en `devDependencies` (gap de tooling documentado en `STATE.md`/`RESUME-NEXT-SESSION.md` desde fases anteriores — 132, 143-05, etc.). Se corrió vía `pnpm --package=vue-tsc@3.2.5 --package=typescript@5.9.3 dlx vue-tsc --noEmit` (versión pinneada a la documentada en `STACK.md`, sin tocar `package.json`/lockfile del proyecto) en vez del `pnpm exec vue-tsc --noEmit` literal del plan, que hubiera fallado con "Command not found".

## Verificación estructural de SEM-09 (sin test runner — decisión de Franco)

El admin no tiene infraestructura de tests (sin vitest, sin script `test`); por decisión explícita de Franco (ver `execution_context` del plan) no se agregó en esta fase y **no se creó ningún archivo `.test.ts`**. Verificación por lectura + construcción:

- **Día combos** (6 niveles, roles INITIUM/COMBOS_I/COMBOS_II/STRETCHING por nivel): `sessionsToPdfDay` cae en `isCombosTecnica` (detecta `role.startsWith('COMBOS_')`), produce `blocks = [INITIUM, COMBOS I (levelBlocks, via buildGridPage), COMBOS II (levelBlocks), STRETCHING (isStretching:true, simpleExercises, sin levelBlocks)]`. `buildDayContent` detecta `isCombosTecnicaDay` (`some(b => b.isStretching)` → true por el bloque STRETCHING), renderiza `buildInitiumPage(INITIUM)` + `buildFullBlockPage(COMBOS I)` + `buildFullBlockPage(COMBOS II)` + `buildStretchingPage(STRETCHING)` + `buildClosingPage`. STRETCHING sale **una sola vez** (un solo bloque en el array, no por nivel) — cumple D160-04.
- **Día técnica:** análogo, `role.startsWith('TECNICA_')`, produce TECNICA I/II en vez de COMBOS I/II. Mismo flujo de builder.
- **Regresión día regular** (roles NUCLEUS/DEUTEROS_1/DEUTEROS_2/EPIKOS, sin COMBOS_/TECNICA_/STRETCHING): `isCombosTecnica` en el transformer es `false` (ningún rol empieza con esos prefijos) → sigue por la rama regular preexistente, sin tocar. En el builder, ningún bloque de un día regular tiene `isStretching` (el transformer regular nunca lo setea) → `isCombosTecnicaDay` es `false` → cae en la rama `else` regular preexistente. **Verificado por lectura del código, no ejecutado.**
- **Regresión día ROM** (roles ROM_LOWER/CORE/UPPER): `isRom` se evalúa primero en el transformer (`s.blocks.some(b => b.role.startsWith('ROM_'))`) y retorna antes de llegar al chequeo `isCombosTecnica` — un día ROM nunca puede tener roles ROM_ Y COMBOS_/TECNICA_ a la vez (el generador de 159 no los mezcla), así que esto es seguro incluso sin el `return` temprano. En el builder, `isRomDay` se chequea primero en el if/else; un bloque ROM nunca tiene `isStretching`, así que aunque el orden se invirtiera igual no colisionarían.
- **Núcleo `formatNameWithParams` ya cubierto** en `el-templo-api/test/unit/format-params.test.ts` (lado API, misma lógica espejada) — no se agregó test nuevo porque la función no se tocó.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `pnpm exec vue-tsc --noEmit` no existe en el admin — sustituido por `dlx` con versión pinneada**
- **Found during:** Verificación de Task 1 (primer intento de correr el gate)
- **Issue:** `vue-tsc` no está en `devDependencies` de `el-templo-admin/package.json` (gap de tooling preexistente, ya documentado en `.planning/STATE.md` y `.planning/RESUME-NEXT-SESSION.md` de fases anteriores — 132, 143-05, y confirmado que `pnpm dlx vue-tsc@latest` resuelve un `typescript` peer incompatible por default).
- **Fix:** Se corrió `pnpm --package=vue-tsc@3.2.5 --package=typescript@5.9.3 dlx vue-tsc --noEmit` (versión de `vue-tsc` documentada en `.planning/codebase/STACK.md`, con `typescript` pinneado a la versión real del proyecto). Cero cambios a `package.json`/`pnpm-lock.yaml` — no es una instalación de dependencia del proyecto, solo un binario ejecutado vía `dlx` (caché efímero de pnpm).
- **Verificación:** 20 errores reportados en todo el admin, TODOS pre-existentes fuera de alcance — confirmado con `grep` acotado a los 3 archivos tocados por este plan (`session-data-transformer.ts`, `roleLabels.ts`, `pdf-types.ts`): **0 errores**. Los 3 errores en `session-pdf-builder.ts` (líneas 213, 612, 807: `pdfMake.vfs` + 2× narrowing de tupla de `margin`) están en funciones que este plan NO tocó (`ensureFonts`, `buildLevelBox`, `buildDeuterosLevelCol`) y coinciden exactamente con el baseline documentado en fases pasadas (`POST-98-EXECUTION-CHAIN.md`, `100-04-SUMMARY.md`: "3 remaining session-pdf-builder.ts errors are pre-existing").
- **Committed in:** No aplica (no es cambio de código, es metodología de verificación).

---

**Total deviations:** 1 auto-fixed (1 blocking — tooling gap, sin cambios de código)
**Impact on plan:** Ninguno sobre el alcance del plan. `pnpm install --frozen-lockfile --offline` sí se corrió en `el-templo-admin/` para materializar `node_modules` (necesario para correr cualquier gate — no había `node_modules` en este worktree), usando el store local de pnpm (offline, sin descargar nada nuevo del registry, sin modificar el lockfile).

## Issues Encountered

Ninguno bloqueante más allá del gap de tooling documentado arriba.

## Deuda anotada (decisión de Franco)

**El layout del PDF combos/técnica queda sin test automatizado** hasta que `el-templo-admin` tenga un runner de tests (cero vitest hoy, decisión explícita de no agregarlo en esta fase). Cuando se agregue infraestructura de tests al admin, priorizar cobertura de:
- `sessionsToPdfDay` con fixtures combos/técnica (INITIUM + I/II + STRETCHING, orden y flags correctos).
- `buildDayContent` / `buildStretchingPage` (regresión de que STRETCHING nunca imprime "PYROS").
- Caso `simpleExercises: []` (STRETCHING sin ejercicios, T-160-05 del threat model — tolerado hoy porque `(block.simpleExercises || []).map(...)` no rompe con lista vacía, pero no hay test que lo pruebe).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `constants/roleLabels.ts` listo para que 160-03 (editor de sesiones) lo importe — exports: `ROLE_LABELS: Record<string,string>`, `getRoleLabel(role)`.
- El generador de PDF ya no produce "solo INITIUM + cierre" para días combos/técnica — SEM-09 resuelto del lado de datos y layout.
- Sin migraciones, sin cambios de dependencias, sin cambios a `formatNameWithParams`.
- Pendiente en 160 (otros planes): SEM-07/08 (admin UI generador+editor), SEM-10 (member app), SEM-15 (TV — ya cubierto en 160-01).

---
*Phase: 160-semana-nueva-frontend-admin-ui-horarios-app-pdf-y-tv*
*Completed: 2026-08-14*

## Self-Check: PASSED

- FOUND: el-templo-admin/src/constants/roleLabels.ts
- FOUND: el-templo-admin/src/utils/pdf/pdf-types.ts
- FOUND: el-templo-admin/src/utils/pdf/session-data-transformer.ts
- FOUND: el-templo-admin/src/utils/pdf/session-pdf-builder.ts
- FOUND commit 8ec80b46 (Task 1)
- FOUND commit 6b08eb1d (Task 2)
