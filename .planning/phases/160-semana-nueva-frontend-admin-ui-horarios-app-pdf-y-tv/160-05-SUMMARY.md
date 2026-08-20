---
phase: 160-semana-nueva-frontend-admin-ui-horarios-app-pdf-y-tv
plan: 05
subsystem: ui
tags: [vue3, typescript, quasar, member-app, design-tokens, testing, vitest]

# Dependency graph
requires:
  - phase: 160-semana-nueva-frontend-admin-ui-horarios-app-pdf-y-tv
    provides: "constants/roleLabels.ts (ROLE_LABELS: Record<BlockRole,string>) creado en el plan 04, BlockRole/sessionMode ampliados a los 5 roles + 2 modos de combos/tecnica"
provides:
  - "Los 4 consumidores de label restantes del member app (DayPlayer, BlockProgressionView, useGoalPlanSession, GoalPlanSession) leen del dict centralizado — cero BLOCK_NAMES locales en todo el app"
  - "Excepcion 'Pyros' para INITIUM en BlockProgressionView.vue implementada como override local documentado (LABEL_OVERRIDES), sin tocar el dict canonico"
  - "Verificacion de punta a punta + test de red de seguridad (test/session-player-combos.test.ts) de D160-05: en dias sin bloques DEUTEROS (combos/tecnica) useSessionPlayer nunca dispara el prompt de eleccion de DEUTEROS"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Override local de label documentado con comentario explicito de 'excepcion confirmada con Franco' (LABEL_OVERRIDES en BlockProgressionView.vue) en vez de bifurcar el dict centralizado — el dict sigue siendo la unica fuente canonica, las excepciones de UI quedan visibles y acotadas al componente que las necesita."
    - "Test de composable Vue con Pinia + mocks de Capacitor/axios (setActivePinia + vi.mock('@capacitor/preferences')/vi.mock('boot/axios') + shim de localStorage) reusado del molde ya establecido en test/user-store-level-selection.test.ts — patron estandar para testear composables/stores que dependen de useAuthStore/useTokenStorage sin levantar el runtime completo del app."

key-files:
  created:
    - el-templo-app/test/session-player-combos.test.ts
  modified:
    - el-templo-app/src/modules/training/pages/DayPlayer.vue
    - el-templo-app/src/modules/training/components/BlockProgressionView.vue
    - el-templo-app/src/modules/goal-plan/composables/useGoalPlanSession.ts
    - el-templo-app/src/modules/goal-plan/pages/GoalPlanSession.vue

key-decisions:
  - "DayPlayer.vue y GoalPlanSession.vue tenian un patron `const completedRole = p.currentBlock.value?.role ?? ''` que amplia el tipo a `string` (por el fallback string vacio), incompatible con indexar el Record<BlockRole,string> tipado estrictamente. Se resolvio quitando el `?? ''` de la declaracion (dejando `completedRole: BlockRole | undefined`) y moviendo el fallback a la expresion de uso (`completedRole ? (ROLE_LABELS[completedRole] ?? '') : ''`), preservando EXACTAMENTE el mismo comportamiento en runtime (fallback a cadena vacia) sin debilitar el tipado ni necesitar `as`/`any`."
  - "La excepcion 'Pyros' se implemento con `LABEL_OVERRIDES[role] ?? ROLE_LABELS[role] ?? role` en los 3 sitios de BlockProgressionView.vue que leian el nombre de rol (chip de bloques anteriores, header del bloque activo, banner 'volver a'), exactamente como especifico el plan."

patterns-established:
  - "Ningun archivo del member app declara ya un BLOCK_NAMES/roleNames local — confirmado por grep global (`grep -rn \"BLOCK_NAMES\" el-templo-app/src` = 0 resultados). Cualquier consumidor nuevo de labels de rol debe importar ROLE_LABELS de src/constants/roleLabels.ts."

requirements-completed: [SEM-10]

# Metrics
duration: ~35min
completed: 2026-08-14
---

# Phase 160 Plan 05: Member app — refactor final de labels + red de seguridad D160-05 Summary

**Los 4 consumidores de label restantes del member app (DayPlayer, BlockProgressionView con excepcion Pyros, useGoalPlanSession, GoalPlanSession) migran al dict centralizado; se verifica y blinda con test que combos/tecnica nunca disparan el prompt de eleccion de DEUTEROS.**

## Performance

- **Duration:** ~35 min
- **Tasks:** 2/2 completadas
- **Files modified:** 4 modificados + 1 test creado

## Accomplishments
- `DayPlayer.vue`, `BlockProgressionView.vue`, `useGoalPlanSession.ts` y `GoalPlanSession.vue` eliminan sus `BLOCK_NAMES` locales (4 copias divergentes) y leen de `ROLE_LABELS` (`src/constants/roleLabels.ts`, dict creado en 160-04).
- `BlockProgressionView.vue` mantiene la excepcion `'Pyros'` para `INITIUM` (decision de Franco) via un override local `LABEL_OVERRIDES: Partial<Record<BlockRole,string>>` documentado inline como intencional, sin tocar el dict canonico (que sigue usando `'Initium'`).
- Verificado de punta a punta (lectura del codigo, ver seccion "Verificacion D160-05" abajo) que ningun camino del app muestra el selector de DEUTEROS en dias sin bloques DEUTEROS (combos, tecnica, ROM).
- Nuevo `el-templo-app/test/session-player-combos.test.ts` (5 tests) blinda D160-05 sobre `useSessionPlayer` real: combos (hasDeuterosBlocks=false, needsDeuterosChoice=false incluso avanzando el indice, playableBlocks con los 4 bloques en `sortOrder`), tecnica (mismo comportamiento) y un caso de regresion que confirma que una sesion regular con DEUTEROS SI dispara el choice al llegar a `currentBlockIndex>=2` y se limpia tras elegir.
- `vue-tsc --noEmit`: 0 errores nuevos en ambas tareas (20 baseline preexistentes identicos, ninguno en los archivos de este plan).
- `pnpm vitest run test/session-player-combos.test.ts`: 5/5 verde, foreground, sin unhandled rejections.

## Task Commits

Each task was committed atomically:

1. **Task 1: Refactor de los consumidores de label restantes al dict centralizado (SEM-11)** - `2e2fb251` (feat)
2. **Task 2: Verificar + testear que combos/tecnica no dispara el prompt de DEUTEROS (D160-05)** - `cc5884c2` (test)

_Sin `docs: complete plan` de metadata separado en el worktree compartido por instruccion explicita del orquestador (STATE.md/ROADMAP.md fuera de alcance) — este SUMMARY + `deferred-items.md` se commitean aparte por el orquestador/siguiente paso, no por este ejecutor._

## Verificacion D160-05 (punta a punta, por lectura)

- `useSessionPlayer.ts:65-67` — `hasDeuterosBlocks = blocks.some(role==='DEUTEROS_1'||'DEUTEROS_2')`. En sesiones combos/tecnica/ROM no existen esos roles → `false`.
- `useSessionPlayer.ts:79-84` — `playableBlocks`: si `!hasDeuterosBlocks` → `[...blocks].sort((a,b)=>a.sortOrder-b.sortOrder)` (los 4 bloques, sin choice). Confirmado con test (Test 3/4).
- `useSessionPlayer.ts:150-153` — `needsDeuterosChoice`: `if (!hasDeuterosBlocks.value) return false` — corte temprano, ni siquiera evalua `deuterosChoice`/`currentBlockIndex`. Confirmado con test (Test 2, avanzando `currentBlockIndex` a 2 y 3 sin que se active).
- `DayPlayer.vue:204-207` — `showDeuterosChoice = splashDismissed.value && player.value.needsDeuterosChoice.value` — UNICO gate del UNICO componente (`DeuterosSelector`, `DayPlayer.vue:58-63`) que renderiza el selector de DEUTEROS en todo el app.
- Grep global de `needsDeuterosChoice|deuterosChoice|selectDeuteros|DeuterosSelector|showDeuterosChoice` en `el-templo-app/src/**/*.{vue,ts}`: los unicos resultados fuera de `useSessionPlayer.ts` (el composable) estan en `DayPlayer.vue` (el gate ya descripto) y en `sessionPlayerStore.ts` (persistencia del estado, no UI). **No existe ningun otro camino** en el app que fuerce o muestre el prompt.
- `GoalPlanSession.vue`/`useGoalPlanSession.ts` **no usan `useSessionPlayer`** (usan `useGoalPlanSession`, que filtra `DEUTEROS_2` y trata `DEUTEROS_1` como bloque normal — sin concepto de "choice" en absoluto). El flujo de goal-plan no puede disparar el prompt aunque sus sesiones nunca incluyan combos/tecnica (contexto: "goal-plan nunca renderiza combos/tecnica/STRETCHING").
- **Conclusion:** el criterio de aceptacion D160-05 ya estaba satisfecho por el diseno existente de `useSessionPlayer`; este plan no encontro ningun camino roto y agrego la red de seguridad (test) que faltaba.

## Firma exacta de `useSessionPlayer` usada en el test

`useSessionPlayer(session: Session)` — factory de un solo argumento (el `Session` completo, ver `types/session.ts`), sin argumentos adicionales. Internamente instancia `useSessionPlayerStore()` (Pinia), que a su vez usa `useAuthStore()` → `useTokenStorage()` → `@capacitor/core`/`@capacitor/preferences`. El test mockea `@capacitor/core`, `@capacitor/preferences` (con `Preferences.get` resuelto a `{ value: null }` para evitar un unhandled rejection al destructurar), `src/boot/axios`/`boot/axios`, e instala un shim de `localStorage`, siguiendo exactamente el molde de `test/user-store-level-selection.test.ts`. `beforeEach` llama `setActivePinia(createPinia())`. Los `Session`/`Block`/`Prescription` mock se construyen con builders locales (`buildSession`/`buildBlock`/`buildExercise`) que respetan la forma real del tipo (`dayId`, `week`, `day`, `levelGroup`, `blockCount`, `blocks[]` con `blockId/role/route/pattern/intensity/repsBudget/format/formatParams/formatDescription/sortOrder/exercises/mobilityExercise`).

## Files Created/Modified
- `el-templo-app/src/modules/training/pages/DayPlayer.vue` — elimina `BLOCK_NAMES`, importa `ROLE_LABELS`; `completedRole` re-tipado sin el `?? ''` widening para preservar el indexado estricto.
- `el-templo-app/src/modules/training/components/BlockProgressionView.vue` — elimina `BLOCK_NAMES`, importa `ROLE_LABELS`; agrega `LABEL_OVERRIDES` local documentado (excepcion 'Pyros' para INITIUM) aplicado en los 3 sitios que rotulan bloques.
- `el-templo-app/src/modules/goal-plan/composables/useGoalPlanSession.ts` — elimina el `BLOCK_NAMES` inline del computed `blockLabels`, importa `ROLE_LABELS` al tope del archivo.
- `el-templo-app/src/modules/goal-plan/pages/GoalPlanSession.vue` — elimina `BLOCK_NAMES`, importa `ROLE_LABELS`; mismo ajuste de tipado que DayPlayer.vue en `completedRole`.
- `el-templo-app/test/session-player-combos.test.ts` (nuevo) — 5 tests de `useSessionPlayer` cubriendo D160-05.

## Decisions Made

Ver `key-decisions` en el frontmatter — resumen: (1) el ajuste de tipado de `completedRole` (quitar `?? ''` de la declaracion, moverlo al uso) para mantener el indexado estricto de `Record<BlockRole,string>` sin `any`/`as`, preservando el comportamiento exacto; (2) la excepcion 'Pyros' via override local explicito y documentado en el unico componente que la necesita.

## Deviations from Plan

None - plan executed exactly as written. El unico ajuste (el tipado de `completedRole`) es un detalle de implementacion necesario para que `mantener el fallback` (instruccion explicita del plan) fuera compatible con el tipado estricto de `ROLE_LABELS: Record<BlockRole,string>` — no cambia comportamiento, alcance ni archivos tocados respecto de lo especificado.

## Issues Encountered

- **Unhandled rejection en el primer intento del test:** el mock inicial de `Preferences.get: vi.fn()` (sin `mockResolvedValue`) resolvia `undefined`, y `sessionPlayerStore.loadProgress` hace `const { value } = await Preferences.get(...)`, lanzando `TypeError: Cannot destructure property 'value' of 'undefined'`. Se disparaba de forma fire-and-forget desde `selectDeuteros` (Test 5) via `store.saveDeuterosChoice` → `saveProgress` → `loadProgress`. Resuelto mockeando `Preferences.get` con `mockResolvedValue({ value: null })` y `set`/`remove` con `mockResolvedValue(undefined)`, y usando `await player.selectDeuteros(...)` en vez de fire-and-forget. Los 5 tests pasan limpio sin errores no manejados tras el fix.
- **`pnpm vitest run` (suite completa) falla en `test/level-display.test.ts`** (2 asserts esperan 5 entradas en `TRAINING_LEVELS`, hay 6 por el nivel `'kairos'` agregado en un commit no relacionado, `a669156e`) — pre-existente, confirmado por `git show HEAD~1:.../level-display.ts` (kairos ya estaba antes de este plan). Fuera de alcance (SCOPE BOUNDARY), documentado en `deferred-items.md`. El test nuevo de este plan (`session-player-combos.test.ts`) pasa limpio en aislamiento (`pnpm vitest run test/session-player-combos.test.ts`, gate mandado por el plan) y no interactua con `level-display.test.ts`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Fase 160 (v5.6 combos+tecnica) queda con sus 6 planes ejecutados (160-01 a 160-06, este ultimo el 05). No hay superficie de label divergente pendiente en el member app. Sin bloqueos para el cierre de fase; el orquestador debe correr la verificacion final de fase (STATE/ROADMAP, tren 159+160) fuera del alcance de este plan. Item deferido no bloqueante: `level-display.test.ts` desactualizado para el nivel `kairos` (candidato a fix chico en un plan futuro).

---
*Phase: 160-semana-nueva-frontend-admin-ui-horarios-app-pdf-y-tv*
*Completed: 2026-08-14*

## Self-Check: PASSED

All 5 created/modified files verified present on disk; both task commits (`2e2fb251`, `cc5884c2`) verified in `git log`.
