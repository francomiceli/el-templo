---
phase: 160-semana-nueva-frontend-admin-ui-horarios-app-pdf-y-tv
plan: 04
subsystem: ui
tags: [vue3, typescript, quasar, member-app, design-tokens]

# Dependency graph
requires:
  - phase: 159-semana-nueva-backend-modos-de-d-a-generadores-roles-de-bloqu
    provides: "roles COMBOS_I/COMBOS_II/TECNICA_I/TECNICA_II/STRETCHING y sessionMode combos/tecnica persistidos por el generador"
provides:
  - "BlockRole del member app ampliado a 14 valores (los 9 existentes + 5 nuevos de combos/técnica)"
  - "Session.sessionMode del member app ampliado a 'regular'|'rom'|'combos'|'tecnica'"
  - "3 mapas de color exhaustivos de blockColors.ts (opacityMap/accentColorMap/cssColorMap) cubriendo los 5 roles nuevos con paleta de marca"
  - "constants/roleLabels.ts — diccionario ROLE_LABELS tipado Record<BlockRole,string>, fuente única de labels del member app (D160-03), consumido por BlockCard.vue y listo para 160-05"
affects: [160-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Diccionario rol->label tipado con el union type del dominio (Record<BlockRole,string>) en vez de Record<string,string> — el typecheck fuerza cobertura exhaustiva cuando el union crece (espejo del patrón ya usado en tv/roster.ts y el diccionario del admin, pero con el tipado más estricto disponible en TS)"

key-files:
  created:
    - el-templo-app/src/constants/roleLabels.ts
  modified:
    - el-templo-app/src/modules/training/types/session.ts
    - el-templo-app/src/modules/training/utils/blockColors.ts
    - el-templo-app/src/modules/training/components/BlockCard.vue

key-decisions:
  - "Colores de combos/técnica/stretching: COMBOS_I y TECNICA_I -> 'primary' (terracotta, como NUCLEUS), COMBOS_II y TECNICA_II -> 'secondary' (oro, como DEUTEROS_2), STRETCHING -> 'secondary' (oro, como ROM_*/cierre). Todos dentro de la paleta de marca, sin azul/púrpura."
  - "opacityMap (clases CSS block-bg--*) reusa clases EXISTENTES sin CSS nuevo: COMBOS_I->block-bg--nucleus, COMBOS_II->block-bg--deuteros-2, TECNICA_I->block-bg--deuteros-1, TECNICA_II->block-bg--athlos, STRETCHING->block-bg--default. Elegido para dar variedad visual entre combos/técnica pese a compartir accentColor, y porque el plan pide preferir reuso sobre CSS nuevo."
  - "roleLabels.ts usa 'Initium' (canónico, NO 'Pyros'). La excepción de 'Pyros' en BlockProgressionView.vue se implementa en el plan 160-05 como override LOCAL en ese componente, no acá."
  - "getRoleLabel() castea internamente a Record<string,string> para el fallback ?? role con inputs no confiables (string suelto), pero ROLE_LABELS en sí queda tipado Record<BlockRole,string> — el typecheck exhaustivo se preserva para el uso principal (BlockCard.formatRole(role: BlockRole))."

patterns-established:
  - "Diccionario rol->label del member app tipado con BlockRole (no string): cualquier ampliación futura de BlockRole rompe la compilación de roleLabels.ts hasta completar el label — red de seguridad en tiempo de compilación."

requirements-completed: [SEM-10, SEM-11]

duration: ~20min
completed: 2026-08-14
---

# Phase 160 Plan 04: Member app — tipos ampliados + colores + diccionario de labels Summary

**BlockRole/sessionMode del member app ampliados a los 5 roles y 2 modos de combos/técnica; blockColors.ts y BlockCard.formatRole quedan exhaustivos vía TypeScript; se crea `constants/roleLabels.ts` como fuente única de labels del app.**

## Performance

- **Duration:** ~20 min
- **Tasks:** 2/2 completadas
- **Files modified:** 3 modificados + 1 creado

## Accomplishments
- `BlockRole` (types/session.ts) ampliado con `COMBOS_I`, `COMBOS_II`, `TECNICA_I`, `TECNICA_II`, `STRETCHING`; `Session.sessionMode` ampliado con `'combos'` y `'tecnica'`.
- Los 3 `Record<BlockRole,string>` exhaustivos de `blockColors.ts` (`getBlockColorClass`, `getBlockAccentColor`, `getBlockCSSColor`) cubren los 5 roles nuevos, 100% paleta de marca (terracotta/oro), reusando clases `block-bg--*` ya existentes en `app.scss` (sin CSS nuevo).
- Nuevo `el-templo-app/src/constants/roleLabels.ts` con `ROLE_LABELS: Record<BlockRole, string>` (exhaustivo, tipado con `BlockRole`) + `getRoleLabel()` helper — fuente única de labels del app (D160-03), consumido por `BlockCard.vue` y disponible para el plan 160-05.
- `BlockCard.vue::formatRole` refactorizado para consumir `ROLE_LABELS` en vez de un `roleNames` local duplicado.
- `vue-tsc --noEmit` en 0 errores nuevos (20 errores baseline preexistentes, ninguno en los 4 archivos de este plan — ver `deferred-items.md`).

## Task Commits

Each task was committed atomically:

1. **Task 1: Ampliar BlockRole/sessionMode + completar los mapas de color exhaustivos (SEM-10)** - `b0cb3c7d` (feat)
2. **Task 2: Dict de labels del app + refactor de BlockCard.formatRole (SEM-11)** - `7f050944` (feat)

_Sin `docs: complete plan` de metadata separado — ese commit lo hace el paso final de STATE, que este plan NO toca por instrucción explícita del orquestador (worktree compartido, STATE.md/ROADMAP.md quedan fuera de alcance)._

## Files Created/Modified
- `el-templo-app/src/modules/training/types/session.ts` — `BlockRole` +5 literales, `Session.sessionMode` +2 valores
- `el-templo-app/src/modules/training/utils/blockColors.ts` — 3 `Record<BlockRole,string>` exhaustivos completados con los 5 roles nuevos
- `el-templo-app/src/constants/roleLabels.ts` (nuevo) — `ROLE_LABELS: Record<BlockRole,string>` + `getRoleLabel()`, fuente única de labels del app
- `el-templo-app/src/modules/training/components/BlockCard.vue` — `formatRole` consume `ROLE_LABELS`; se agregó `romZoneLabel()` (ver Deviations) para el chip corto de zona ROM

## Roles/colores elegidos (detalle)

| Rol | accentColor | cssColor (hex) | opacityMap (clase reusada) |
|---|---|---|---|
| COMBOS_I | primary | BRAND_TERRACOTTA | `block-bg--nucleus` |
| COMBOS_II | secondary | BRAND_AGED_GOLD | `block-bg--deuteros-2` |
| TECNICA_I | primary | BRAND_TERRACOTTA | `block-bg--deuteros-1` |
| TECNICA_II | secondary | BRAND_AGED_GOLD | `block-bg--athlos` |
| STRETCHING | secondary | BRAND_AGED_GOLD | `block-bg--default` |

Ningún color/clase fuera de la paleta de marca (`grep -ci "blue\|purple\|cyan"` en `blockColors.ts` = 1, idéntico a `origin/master` — el único match preexistente, no nuevo).

## Decisions Made

- Ver `key-decisions` en el frontmatter — resumen: colores espejando el patrón NUCLEUS(primary)/DEUTEROS_2(secondary)/ROM(secondary) ya establecido; clases CSS reusadas (cero CSS nuevo); `roleLabels.ts` usa 'Initium' canónico (la excepción 'Pyros' de `BlockProgressionView` se implementa en 160-05, no acá).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `BlockCard.vue` chip corto de zona ROM rompía el typecheck tras ampliar `BlockRole`**
- **Found during:** Task 2 (al correr `vue-tsc` después de Task 1, ver nota abajo)
- **Issue:** `BlockCard.vue:16-18` indexaba un objeto literal angosto `{ ROM_LOWER: 'Lower', ROM_CORE: 'Core', ROM_UPPER: 'Upper' }` con `block.role` (tipo `BlockRole`). Al ampliar `BlockRole` a 14 valores en la Task 1, TypeScript dejó de permitir indexar ese literal con la unión completa (`Property 'COMBOS_I' does not exist on type '{ ROM_LOWER: string; ROM_CORE: string; ROM_UPPER: string; }'`, y 8 errores más idénticos para los otros roles nuevos/existentes). El guard `v-if="block.role.startsWith('ROM_')"` en tiempo de ejecución es correcto, pero TS no lo infiere para el indexado del objeto literal.
- **Fix:** Extraído a una constante módulo-scope `ROM_ZONE_LABELS: Partial<Record<string, string>>` + función `romZoneLabel(role: BlockRole): string` que indexa de forma segura (misma semántica visual: 'Lower'/'Core'/'Upper', sin cambios de comportamiento).
- **Files modified:** `el-templo-app/src/modules/training/components/BlockCard.vue`
- **Verification:** `vue-tsc --noEmit` sin errores en `BlockCard.vue`.
- **Committed in:** `7f050944` (Task 2 commit — el archivo ya estaba en el scope de la Task 2 por `formatRole`, así que se corrigió en el mismo commit en vez de abrir uno adicional).

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug causado directamente por el widening de `BlockRole` de la Task 1, en un archivo ya dentro del alcance del plan)
**Impact on plan:** Necesario para que `vue-tsc` llegue a 0 errores nuevos (gate obligatorio del plan). Sin scope creep — mismo archivo, mismo comportamiento visual.

## Issues Encountered

- **`node_modules` vacío al empezar** (worktree fresco, nunca se corrió `pnpm install`). Resuelto con `pnpm install --frozen-lockfile --offline` (store local, sin red, cero cambios a `package.json`/`pnpm-lock.yaml` — confirmado con `git status --short`). Necesario para que `vue-tsc`/`eslint`/`prettier` resolvieran los imports de `vue`/`quasar`/etc.
- **`pnpm exec vue-tsc --noEmit` no resuelve** en `el-templo-app` (mismo gap de tooling que el admin, documentado en 160-02: `vue-tsc` no es `devDependency`). Se usó `pnpm --package=vue-tsc@3.2.5 --package=typescript@5.9.3 dlx vue-tsc --noEmit` (versión pinneada a `STACK.md`, `typescript` pinneado a la versión real del `package.json` del app). Ver `deferred-items.md` para el detalle y la propuesta de fix de infra a futuro (fuera de alcance de este plan).
- **20 errores baseline preexistentes de `vue-tsc`** en `el-templo-app`, ninguno en los 4 archivos de este plan (confirmado por diff de archivos con error entre el run pre-Task-2 y el run final — el único archivo que dejó de aparecer fue `BlockCard.vue`, y ningún archivo nuevo apareció). Mayormente gaps de tipado de `import.meta.env`, augmentación de `$router`/`$api` en algunas páginas Options-API, y un mock de axios en un test. Detalle completo en `deferred-items.md`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

El plan 160-05 (render del resto de las superficies del app: `DayPlayer.vue`, `BlockProgressionView.vue`, `useGoalPlanSession.ts`/`GoalPlanSession.vue`, y el criterio D160-05 de no-prompt DEUTEROS en días sin DEUTEROS) puede importar `el-templo-app/src/constants/roleLabels.ts` (`ROLE_LABELS`/`getRoleLabel`) y los 4 `Record<BlockRole,...>` de este plan quedan como red de seguridad exhaustiva para cualquier nuevo rol. Sin bloqueos. Recordatorio explícito para 160-05: `BlockProgressionView.vue` debe mantener 'Pyros' vía un override LOCAL en ese componente (no tocar el dict acá creado, que usa 'Initium').

---
*Phase: 160-semana-nueva-frontend-admin-ui-horarios-app-pdf-y-tv*
*Completed: 2026-08-14*

## Self-Check: PASSED

All 4 created/modified files verified present on disk; both task commits (`b0cb3c7d`, `7f050944`) verified in `git log`.
