---
phase: 160-semana-nueva-frontend-admin-ui-horarios-app-pdf-y-tv
plan: 03
subsystem: ui
tags: [vue3, quasar, admin, session-generator, typescript]

# Dependency graph
requires:
  - phase: 159-semana-nueva-backend-modos-de-dia-generadores-roles-de-bloqu
    provides: enum dayModes en el body de POST /admin/generate, roles COMBOS_I/II, TECNICA_I/II, STRETCHING, restriccion de formatos por rol (block-validator)
  - phase: 160-02
    provides: "el-templo-admin/src/constants/roleLabels.ts (dict ROLE_LABELS del admin, D160-02/D160-03)"
provides:
  - "useGenerateApi.generateWeek acepta dayModes?: Record<string,string> en el body"
  - "GeneratePage: control de override 'modo por dia' en el area de generacion, default constante NO persistido (miercoles->tecnica, jueves->combos), separado de la tabla day_modes"
  - "SessionsPage: badge Combos/Tecnica en el listado (dayGroupModeBadge, reemplaza isDayGroupRom)"
  - "EditableBlockCard: labels via ROLE_LABELS (roleLabels.ts admin) + colores para combos/tecnica/stretching"
affects: [160 cierre, cualquier trabajo futuro sobre GeneratePage/SessionsPage/EditableBlockCard]

tech-stack:
  added: []
  patterns:
    - "Override de modo por dia como estado local del componente (ref, no persiste) — separado por diseño del control que escribe day_modes (D160-01), mismo patron que ya distinguia generationScope del scope persistido"
    - "dayGroupModeBadge() como funcion pura que deriva {label,color} desde sessionMode, en vez de 3 booleans (isDayGroupCombos/Tecnica/Rom) — un solo punto de verdad, mutuamente excluyente por diseno del generador de 159"

key-files:
  created: []
  modified:
    - el-templo-admin/src/composables/useGenerateApi.ts
    - el-templo-admin/src/pages/GeneratePage.vue
    - el-templo-admin/src/types/session.ts
    - el-templo-admin/src/pages/SessionsPage.vue
    - el-templo-admin/src/components/sessions/EditableBlockCard.vue

key-decisions:
  - "Colores del editor: combos=deep-orange-6, tecnica=purple-8, stretching=teal-7 — distintos de NUCLEUS (deep-orange-8) y ROM (blue-grey-7), y de la misma familia que los badges de SessionsPage (deep-orange/purple) para consistencia visual entre listado y editor."
  - "El aviso del checker sobre un badge ROM 'duplicado' en SessionsPage (~:204/:257) era inexacto — verificado por grep: solo hay UNA ocurrencia del badge ROM (vista General, :84); la vista goal-plan no tiene badge de modo. Se extendio solo esa ocurrencia real."
  - "SEM-08 (dropdown de formatos compatibles) no requirio cablear nada nuevo: loadCompatibleFormats() ya envia props.blockGroup.role crudo (p.ej. 'COMBOS_I', 'TECNICA_I', 'STRETCHING') a editApi.fetchCompatibleFormats, y block-validator.ts (159-01) ya tiene esas claves en FORMAT_COMPATIBILITY — verificado por lectura de codigo, documentado abajo."
  - "generateDayModes se inicializa con los 6 dias del sistema (no solo miercoles/jueves) en 'regular', para que el q-select por dia tenga siempre un valor definido; el default no-regular (D160-01) queda solo en miercoles/jueves."

patterns-established: []

requirements-completed: [SEM-07, SEM-08, SEM-11]

# Metrics
duration: ~30min
completed: 2026-08-14
---

# Phase 160 Plan 03: Admin UI — selector de modo por día, badges y editor Summary

**El generador de sesiones ahora ofrece un override de modo por día (default no persistido miércoles→Técnica/jueves→Combos) que viaja por `dayModes` en `POST /admin/generate`; el listado muestra badges Combos/Técnica junto al de ROM; el editor de bloques rotula y colorea COMBOS/TÉCNICA/STRETCHING desde el diccionario centralizado del admin.**

## Performance

- **Duration:** ~30 min
- **Tasks:** 2/2 completadas
- **Files modified:** 5

## Accomplishments

- `useGenerateApi.generateWeek` acepta `dayModes?: Record<string,string>` en `options` (el body ya se pasaba entero al API, que ya aceptaba el campo desde 159-01).
- `GeneratePage.vue`: nuevo bloque "Modo por día (solo para esta generación, no se guarda)" en el área de generación — un `q-select` por día en scope `week`, uno solo para scope `day`, oculto en scope `day_level`. Estado `generateDayModes` (default `miercoles: 'tecnica'`, `jueves: 'combos'`, resto `'regular'`) y `OVERRIDE_MODE_OPTIONS` (4 modos) totalmente separados de `MODE_OPTIONS`/`updateDayMode`/la columna "modo" del summary (que siguen escribiendo la tabla `day_modes` persistida, solo regular/rom — verificado sin diff en esa zona).
- `doGenerate()` arma `dayModes` filtrando por días en scope (`options.days` o los 6 días completos) y excluyendo `'regular'`, y solo lo agrega a `options` si no queda vacío.
- `types/session.ts`: `SessionSummary.sessionMode` ampliado a `'regular' | 'rom' | 'combos' | 'tecnica'`.
- `SessionsPage.vue`: `dayGroupModeBadge(dayGroup)` reemplaza `isDayGroupRom` — retorna `{label,color}` para Combos (deep-orange), Técnica (purple) o ROM (info), o `null`. El único `<q-badge>` de modo del archivo (vista General, no hay duplicado en goal-plan) ahora lo consume. `displayLevels`/`ROM_DISPLAY_LEVELS` sin tocar — combos/técnica siguen cayendo en los 6 `DISPLAY_LEVELS` normales.
- `EditableBlockCard.vue`: `ROLE_DISPLAY_NAMES` local (solo ROM) eliminado; `displayRoleName` ahora usa `ROLE_LABELS` de `constants/roleLabels.ts` (dict admin de 160-02, ya cubre los 14 roles incl. COMBOS_I/II, TECNICA_I/II, STRETCHING). `blockColor` suma 3 ramas nuevas: combos→`deep-orange-6`, tecnica→`purple-8`, stretching→`teal-7`.

## Task Commits

1. **Task 1: Control de modo por día en el generador + envío de dayModes (SEM-07, D160-01)** - `c5be4765` (feat)
2. **Task 2: Badges del listado + labels/colores del editor (SEM-07, SEM-08, SEM-11)** - `0e4c8e45` (feat)

_Sin commit de metadata separado — ver este SUMMARY + el commit de cierre del orquestador._

## Files Created/Modified

- `el-templo-admin/src/composables/useGenerateApi.ts` — `generateWeek(options)` acepta `dayModes?: Record<string,string>`.
- `el-templo-admin/src/pages/GeneratePage.vue` — `OVERRIDE_MODE_OPTIONS`, `generateDayModes`, bloque de UI del override, `doGenerate()` arma y envía `dayModes`.
- `el-templo-admin/src/types/session.ts` — `SessionSummary.sessionMode` ampliado.
- `el-templo-admin/src/pages/SessionsPage.vue` — `dayGroupModeBadge()` reemplaza `isDayGroupRom()`; badge del listado muestra Combos/Técnica/ROM.
- `el-templo-admin/src/components/sessions/EditableBlockCard.vue` — importa `ROLE_LABELS`; `displayRoleName` y `blockColor` cubren combos/tecnica/stretching.

## Decisions Made

Ver `key-decisions` en el frontmatter. Resumen: colores elegidos para no colisionar con familias de color existentes (NUCLEUS/ROM) y consistentes con los badges del listado; el aviso del checker sobre un badge ROM duplicado en SessionsPage era inexacto (verificado, solo una ocurrencia real); SEM-08 no requirió cablear el fetch de formatos de nuevo.

## Verificación SEM-08 (dropdown de formatos compatibles por rol)

`loadCompatibleFormats()` en `EditableBlockCard.vue` (~L621) llama `editApi.fetchCompatibleFormats({ blockRole: props.blockGroup.role, level: props.levelGroup, intensity: selectedBlock.value.intensity })` — envía el **rol crudo** del bloque (`COMBOS_I`, `COMBOS_II`, `TECNICA_I`, `TECNICA_II`, `STRETCHING`), sin pasar por ningún dict de labels. El endpoint de la API resuelve compatibilidad contra `FORMAT_COMPATIBILITY` en `block-validator.ts` (159-01), que ya tiene esas 5 claves definidas (`COMBOS_I/II: ["Combos"]`, `TECNICA_I/II`: formatos "For Quality" etc., `STRETCHING: ["Stretching"]`). Conclusión: **el dropdown ya funciona correctamente sin cambios** — verificado por lectura de código (`editApi.fetchCompatibleFormats` no se tocó, `FormatParamsEditor.vue` tampoco).

## Typecheck (gate — CI no typechequea el admin)

Comando (mismo pinneado que 160-02/160-04, `vue-tsc` no está en `devDependencies`):

```bash
cd el-templo-admin && pnpm --package=vue-tsc@3.2.5 --package=typescript@5.9.3 dlx vue-tsc --noEmit
```

Resultado: **20 errores totales, todos preexistentes** (mismo baseline documentado en `160-02-SUMMARY.md`). Verificado con `grep` acotado a los 5 archivos tocados por este plan:

```bash
pnpm --package=vue-tsc@3.2.5 --package=typescript@5.9.3 dlx vue-tsc --noEmit 2>&1 \
  | grep -E "SessionsPage|EditableBlockCard|types/session|GeneratePage|useGenerateApi"
```

→ 1 coincidencia: `EditableBlockCard.vue(729,8): error TS2769` — es el mismo error preexistente que 160-02 ya documentó en `L726` (el `emit('swap-exercise', ...)` con overload de `update-mobility-prescription`, fuera del alcance de este plan); se corrió antes y después de nuestros cambios y el conteo total de errores no varió (20→20), solo se desplazó de línea (726→729) por las 3 líneas agregadas antes en el archivo (import + comentario). `GeneratePage.vue` y `useGenerateApi.ts` no aparecen en ningún error.

## Confirmación: enum de day_modes persistido intacto

`MODE_OPTIONS` sigue siendo solo `[Regular, ROM]` (verificado por lectura tras el edit). `updateDayMode()` no fue tocado. El control nuevo (`OVERRIDE_MODE_OPTIONS`/`generateDayModes`) es un estado local separado que nunca llama a `api.put('/admin/sessions/day-modes', ...)` — el único canal para combos/técnica es `dayModes` en el body de `POST /admin/generate`.

## Deviations from Plan

None - plan ejecutado tal como estaba escrito.

## Issues Encountered

Ninguno. El único aviso del propio plan (badge ROM "duplicado" inexistente en SessionsPage) se verificó como falso positivo por `grep`, sin impacto en la ejecución.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- SEM-07/SEM-08/SEM-11 (admin UI: generador, listado, editor) resueltos. Junto con 160-01/02/04/06 ya ejecutados, quedan pendientes 160-03 ✅ (este plan), y verificar el estado de 160-05 (member app día player / DEUTEROS, D160-05) según el handoff de la fase.
- El `deferred-items.md` de la fase no recibió items nuevos de este plan — sin hallazgos fuera de alcance.
- Worktree sin cambios en `package.json`/lockfile; solo los 5 archivos del plan.

---
*Phase: 160-semana-nueva-frontend-admin-ui-horarios-app-pdf-y-tv*
*Completed: 2026-08-14*

## Self-Check: PASSED

- FOUND: el-templo-admin/src/composables/useGenerateApi.ts
- FOUND: el-templo-admin/src/pages/GeneratePage.vue
- FOUND: el-templo-admin/src/types/session.ts
- FOUND: el-templo-admin/src/pages/SessionsPage.vue
- FOUND: el-templo-admin/src/components/sessions/EditableBlockCard.vue
- FOUND commit c5be4765 (Task 1)
- FOUND commit 0e4c8e45 (Task 2)
