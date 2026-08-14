---
phase: 160-semana-nueva-frontend-admin-ui-horarios-app-pdf-y-tv
plan: 01
subsystem: api
tags: [tv-kiosco, roster, labels, drizzle, vitest, sem-11, sem-15]

# Dependency graph
requires:
  - phase: 159-semana-nueva-backend-modos-de-d-a-generadores-roles-de-bloqu
    provides: "Roles COMBOS_I/II, TECNICA_I/II, STRETCHING y sessionMode combos/tecnica persistidos en session_blocks/sessions"
provides:
  - "el-templo-api/src/modules/shared/role-labels.ts: unica fuente rol->label del API (ROLE_LABELS + ROLE_BADGE_LABELS)"
  - "tv/roster.ts: COMBOS_ROLES/TECNICA_ROLES + buildRoster ramificado por modo (rolesForMode)"
  - "tv/types.ts: TvClassMode ampliado a regular|rom|combos|tecnica"
  - "tv/class-day.ts: resolveClassDay deriva combos/tecnica de sessionMode real (cero queries nuevas)"
  - "admin/service.ts: badge routesSummary usa ROLE_BADGE_LABELS (I/II/Stretch) en vez de charAt(0)"
affects: [160-02, 160-03, 160-04, 160-05, 160-06, "PDF de combos/tecnica (SEM-09, espejo de esta convencion D160-02)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Un diccionario rol->label POR APP (D160-03): shared/role-labels.ts es la fuente unica dentro del API; el-templo-admin y el-templo-app tendran sus propias copias espejo, NO un paquete cross-app"

key-files:
  created:
    - el-templo-api/src/modules/shared/role-labels.ts
  modified:
    - el-templo-api/src/modules/tv/roster.ts
    - el-templo-api/src/modules/tv/types.ts
    - el-templo-api/src/modules/tv/class-day.ts
    - el-templo-api/src/modules/admin/service.ts
    - el-templo-api/test/tv/tv-roster.test.ts

key-decisions:
  - "role-labels.ts vive en el API porque es donde tsc+vitest lo pueden verificar; el-templo-admin/el-templo-app tendran sus propias copias (D160-03), no un paquete compartido"
  - "STRETCHING no se marca shared:true en el roster (solo INITIUM lo es) aunque el generador la produzca identica en los 6 niveles -- el roster no asume eso por diseno"
  - "El order de niveles usa REGULAR_LEVEL_ORDER para combos/tecnica (6 tiers); solo rom usa ROM_LEVEL_ORDER (2 tiers) -- ya era el comportamiento del ternario existente, solo se documento explicitamente"

patterns-established:
  - "rolesForMode(mode): switch explicito por TvClassMode en vez de encadenar ternarios -- mas facil de extender a un quinto modo futuro sin anidar condicionales"

requirements-completed: [SEM-11, SEM-15]

# Metrics
duration: ~35min
completed: 2026-08-14
---

# Phase 160 Plan 01: API TV roster combos/técnica + diccionario de labels Summary

**La TV de sucursal arma el roster de 4 bloques (INITIUM/PYROS → I → II → STRETCHING) para días combos/técnica derivando el modo de `sessions.sessionMode` real, y el API centraliza sus etiquetas rol→label en un único módulo consumido por el roster y el badge admin.**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-08-14T15:1x (aprox, no capturado con timestamp exacto)
- **Completed:** 2026-08-14T15:51:28-03:00
- **Tasks:** 2/2
- **Files modified:** 6 (1 creado, 5 modificados)

## Accomplishments
- Módulo `shared/role-labels.ts` creado como única fuente de labels del API: `ROLE_LABELS` (TV, etiqueta larga) + `ROLE_BADGE_LABELS` (badge admin, etiqueta corta), con COMBOS_I/II, TECNICA_I/II y STRETCHING agregados con la convención D160-02.
- `tv/roster.ts` ya no define `ROLE_LABELS` local — lo importa del módulo compartido; agrega `COMBOS_ROLES`/`TECNICA_ROLES` y una función `rolesForMode` que ramifica `buildRoster` por los 4 valores de `TvClassMode`.
- `tv/types.ts`: `TvClassMode` ampliado de `"regular" | "rom"` a `"regular" | "rom" | "combos" | "tecnica"`.
- `tv/class-day.ts`: `resolveClassDay` deriva el modo real (`rom` > `combos` > `tecnica` > `regular`) de `sessionMode` de las sesiones aprobadas, sin agregar queries — el select ya traía la columna. El orden de niveles sigue usando `REGULAR_LEVEL_ORDER` para combos/técnica (solo `rom` usa el orden de 2 tiers).
- `admin/service.ts`: el badge `routesSummary` reemplaza el `charAt(0)` + if/else de DEUTEROS por `ROLE_BADGE_LABELS[b.role] ?? b.role.charAt(0)`, agregando I/II/Stretch para los roles nuevos sin cambiar el comportamiento observable de ROM/INITIUM/DEUTEROS.
- `render.ts` (kiosco) **intacto** — `git diff --stat` vacío, verificado explícitamente.

## Task Commits

Each task was committed atomically:

1. **Task 1: Módulo compartido de labels del API + badge D160-02 (SEM-11 api)** - `bbf2355c` (feat)
2. **Task 2: Roster combos/técnica en la TV + TvClassMode ampliado (SEM-15)** - `eb0ca2cf` (feat)

_Nota: los edits a `roster.ts` de ambas tasks se hicieron en la misma sesión de edición porque están acopladas en el mismo archivo; se dividieron en los 2 commits vía `git add -p` (hunk por hunk) para mantener la atomicidad task→commit del plan._

**Plan metadata:** (pendiente — se agrega en el commit de cierre de la fase junto con STATE.md/ROADMAP.md, según instrucción explícita de NO tocarlos en este plan)

## Files Created/Modified
- `el-templo-api/src/modules/shared/role-labels.ts` - `ROLE_LABELS`/`ROLE_BADGE_LABELS`, única fuente rol→label del API
- `el-templo-api/src/modules/tv/roster.ts` - `COMBOS_ROLES`/`TECNICA_ROLES`, `rolesForMode`, import de `ROLE_LABELS` compartido
- `el-templo-api/src/modules/tv/types.ts` - `TvClassMode` ampliado
- `el-templo-api/src/modules/tv/class-day.ts` - derivación de modo combos/tecnica desde `sessionMode`
- `el-templo-api/src/modules/admin/service.ts` - badge `routesSummary` usa `ROLE_BADGE_LABELS`
- `el-templo-api/test/tv/tv-roster.test.ts` - 5 tests nuevos (roster combos/tecnica, labels D160-02, no-colapso visualGroupOf, regresión regular/rom)

## Decisions Made
None — el plan se ejecutó tal como estaba escrito; las decisiones de producto (D160-01 a D160-05) ya estaban cerradas en `160-CONTEXT.md` antes de empezar.

## Deviations from Plan

None - plan ejecutado exactamente como estaba escrito. Único ajuste operativo (no de código): los edits de `roster.ts` de Task 1 y Task 2 se hicieron en el mismo pase de edición por estar acoplados en el mismo archivo, y se separaron en 2 commits atómicos vía `git add -p` para respetar el protocolo de commit por task. No es una desviación de comportamiento ni de alcance.

## Issues Encountered
- El test unitario `tv-roster.test.ts` dispara el `beforeAll` global de `test/setup.ts` (provisión del MySQL de test por-worker), que corrió ~120-165s en foreground pese a que el archivo en sí no toca la DB — comportamiento ya anticipado y documentado en el plan ("el gate REAL de los tests de DB es CI"). Se corrió con `--hookTimeout=480000` para darle margen y terminó verde (14/14 tests, 162s). Ningún proceso vitest quedó colgado (`pgrep -af vitest` limpio para et-159; un proceso vitest de otro worktree — et-173 — se ve en la lista global y no se tocó, por no ser de esta sesión).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- El roster combos/técnica y el diccionario `shared/role-labels.ts` quedan disponibles como precedente del patrón "un diccionario por app" (D160-03) para los planes siguientes de la fase 160 (PDF, admin UI, member app), que deberán crear sus propias copias espejo en `el-templo-admin`/`el-templo-app` con la misma convención D160-02.
- SEM-15 (TV) queda resuelto a nivel API; falta verificar en el TV real que el kiosco (ya genérico por `context.blocks`) renderiza los 4 bloques sin cambios adicionales — fuera de alcance de este plan (solo datos).
- Sin bloqueos para 160-02+.

## Known Stubs
None.

## Threat Flags
None - sin rutas HTTP nuevas, sin migraciones, sin cambios al shape del payload TV (solo se amplía la unión `TvClassMode` y el roster de roles, ya cubiertos por el threat register del plan).

---
*Phase: 160-semana-nueva-frontend-admin-ui-horarios-app-pdf-y-tv*
*Completed: 2026-08-14*

## Self-Check: PASSED

All 6 created/modified files verified present on disk; both task commits (`bbf2355c`, `eb0ca2cf`) verified present in git log.
