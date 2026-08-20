---
phase: 178-bloque-alternativo-en-t-cnica-combos-dos-deuteros-en-pantall
plan: 04
subsystem: db
tags: [drizzle, mysql, migration, tv]

# Dependency graph
requires: []
provides:
  - "Migración 0206: DROP de deuteros_auto_rotate/deuteros_pinned_at + ADD show_alternative sobre tv_class_state"
  - "Schema Drizzle (tv.ts) espejado: showAlternative boolean, sin las dos columnas de rotación"
affects: [178-05, 178-06, 178-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Numeración de migración hand-written verificada contra worktree + origin/master + origin/staging + checkout principal antes de fijar el número (skill el-templo-db-migrations)"

key-files:
  created:
    - el-templo-api/src/db/migrations/0206_tv_show_alternative.sql
  modified:
    - el-templo-api/src/db/schema/tv.ts

key-decisions:
  - "0206 confirmado libre: única colisión detectada es un 0205_paquete_clases_matrix.sql sin commitear de la fase 177 en el checkout principal, que ya choca con el 0205 de esta rama (fase 164) y va a necesitar renumerarse cuando esa fase se integre — no afecta a este plan"

patterns-established: []

requirements-completed: []

# Metrics
duration: ~15min
completed: 2026-08-19
---

# Phase 178 Plan 04: Migración tv_class_state (baja rotación + show_alternative) Summary

**Migración `0206_tv_show_alternative.sql` en un solo `ALTER TABLE` sobre `tv_class_state`: DROP de las dos columnas de la rotación automática de deuteros (fase 164) + ADD de `show_alternative` (boolean, default false) para el toggle "Ver alternativo" del bloque alt; schema Drizzle espejado 1:1.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-08-19T18:30:00Z (aprox.)
- **Completed:** 2026-08-19T18:44:43Z
- **Tasks:** 2 completadas
- **Files modified:** 2

## Accomplishments
- `el-templo-api/src/db/migrations/0206_tv_show_alternative.sql`: `ALTER TABLE tv_class_state DROP COLUMN deuteros_auto_rotate, DROP COLUMN deuteros_pinned_at, ADD COLUMN show_alternative BOOLEAN NOT NULL DEFAULT FALSE`, con encabezado explicando ambos cambios. Cero `;` dentro de comentarios, cero mención de `session_blocks`.
- `el-templo-api/src/db/schema/tv.ts`: `tvClassState` sin `deuterosAutoRotate`/`deuterosPinnedAt`, con `showAlternative: boolean("show_alternative").default(false).notNull()`.
- Número de migración verificado libre contra CUATRO fuentes antes de escribir el archivo: worktree local (highest = 0205), `origin/master` (highest = 0205), `origin/staging` (highest = 0200, distinto contenido — confirma que el gap 0200 en master es porque staging lo usó para otra migración), y el checkout principal (`/home/franco/projects/el-templo`, donde vive sin commitear el `0205_paquete_clases_matrix.sql` de la fase 177).
- `tsc --noEmit` corrido en `el-templo-api`: únicos 2 errores son las referencias esperadas a `deuterosAutoRotate`/`deuterosPinnedAt` en `tv/service.ts` (documentadas de antemano en el plan como fuera de alcance de este plan, se resuelven en el 178-06). Cero errores de ningún otro tipo.

## Task Commits

Each task was committed atomically:

1. **Task 1: Verificar numeración y escribir la migración** - `6cf13c4b` (feat)
2. **Task 2: Reflejar el cambio en el schema Drizzle** - `4c3452a2` (feat)

**Plan metadata:** (este commit)

## Files Created/Modified
- `el-templo-api/src/db/migrations/0206_tv_show_alternative.sql` - nuevo, DROP+ADD sobre `tv_class_state`
- `el-templo-api/src/db/schema/tv.ts` - `tvClassState`: -2 columnas de rotación, +1 `showAlternative`

## Decisions Made
- **Comentario del schema sin repetir los literales viejos:** el acceptance criteria del plan exige `grep -c 'deuteros_auto_rotate\|deuterosAutoRotate\|deuteros_pinned_at\|deuterosPinnedAt'` == 0 sobre `tv.ts`. El primer borrador del comentario nuevo citaba esos nombres para explicar el reemplazo y el grep dio 1 — se reformuló el comentario sin los literales (queda igual de explicativo, referencia "las dos columnas de rotación de la fase 164" en vez de nombrarlas). No es una decisión de diseño, es ajuste al gate literal del plan.
- **No se tocó `tv/service.ts`/`tv/types.ts`:** el plan es explícito en que esos archivos quedan para el 178-06; los 2 errores `tsc` residuales son la señal esperada de ese scope boundary, no un bug de este plan.

## Deviations from Plan

None - plan ejecutado exactamente como estaba escrito. La única fricción (el grep del comentario del schema) se resolvió dentro del propio Task 2 sin salirse del archivo/alcance listado.

## Issues Encountered

- Ninguno bloqueante. La verificación de colisión de numeración (Task 1) tomó más pasos que un simple `ls` porque el repo tiene ~15 worktrees activos y varias fases con migraciones sin commitear en el checkout principal (177, y potencialmente otras) — se verificaron las 4 fuentes relevantes (worktree, master, staging, checkout principal) en vez de confiar solo en `ls` local, siguiendo la instrucción explícita del prompt de no confiar ciegamente en 0206.

## User Setup Required

None - no external service configuration required. **No se aplicó la migración contra ninguna base** (ni local ni `eltemplo_test`): este plan solo escribe SQL + schema, tal como especifica el `<verification>` del plan y el skill de migraciones (host compartido staging/prod).

## Next Phase Readiness

- La tabla `tv_class_state` (SQL + schema) queda en su estado final para que el plan 178-06 (TV backend) construya sobre `showAlternative` y borre las referencias muertas a `deuterosAutoRotate`/`deuterosPinnedAt` en `tv/service.ts` — son exactamente los 2 errores `tsc` que este plan deja documentados como esperados.
- El plan 178-07 (TV frontend) puede asumir que el estado persistido `show_alternative` existe en el contrato de datos.
- Pendiente heredado (no de este plan, de la fase 177): `0205_paquete_clases_matrix.sql` sin commitear en el checkout principal va a necesitar renumerarse — colisiona con el `0205_tv_deuteros_auto_rotate.sql` ya en master desde la fase 164.

---
*Phase: 178-bloque-alternativo-en-t-cnica-combos-dos-deuteros-en-pantall*
*Completed: 2026-08-19*

## Self-Check: PASSED
