---
phase: 181-dise-o-del-m-dulo-gimnasio-bloqueante
plan: 02
subsystem: docs
tags:
  [tenancy, multi-tenant, design-doc, catalogo, taxonomias, saas-multitenancy]

# Dependency graph
requires:
  - "181-01: esqueleto del doc 08 + H-1..H-4 firmadas (H-1 en particular: Opción A, tenant_id NULLable)"
provides:
  - "Definición 1 CERRADA: Calistenia y Gimnasio no comparten modelo de datos (D-01), fundamento verificable en exercises.ts/GYM_OWNED_TABLES/guard 404; respuesta 'uno, siempre' al historial (D-02)"
  - "Definición 2 CERRADA: ciclo de vida completo del catálogo global/local (gym_exercises, tenant_id NULLable, tenantOrGlobalWhere), copia local (CAT-03), promoción (CAT-04), desactivación (CAT-05), taxonomías cerradas 14/25/9 + mapeo de categoría validado (CAT-06, D-10), aislamiento del buscador (CAT-07), caso borde de unique con NULL en MySQL, corrección de la contradicción heredada de 02-inventario-modulos.md"
affects:
  [
    184-catalogo-ejercicios-backend,
    185-catalogo-ejercicios-ciclo-vida,
    187-plantillas-rutina,
  ]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Unique compuesta con columna NULLable en MySQL: usar una columna generada/estable de scope (COALESCE(tenant_id, 0)) en la unique, nunca la columna NULLable cruda, porque MySQL no deduplica NULL=NULL"

key-files:
  created: []
  modified:
    - .docs/saas-multitenancy/08-diseno-modulo-gimnasio.md

key-decisions:
  - "Definición 1: no matriz comparativa (D-01 lo prohíbe); fundamento por evidencia de código (columnas de exercises vs ficha del §2.2, GYM_OWNED_TABLES, guard 404) + respuesta de una palabra al historial (uno, D-02)"
  - "Definición 2: gym_exercises con tenant_id NULLable, tenantOrGlobalWhere en lectura, tenantValues sin cambios en escritura; promoción = UPDATE SET tenant_id=NULL (no DELETE+INSERT); copia local vía copied_from_exercise_id informativo, no FK de lectura; status (borrador/publicado/desactivado) en vez de deleted_at; unique de nombre canónico con tenant_scope_key=COALESCE(tenant_id,0) por el caso borde de NULL en MySQL; mismo scope mixto aplica a plantillas de rutina (RUT-01)"

requirements-completed: []

# Metrics
duration: ~20min
completed: 2026-08-27
---

# Phase 181 Plan 02: Definición 1 (modelo de datos) y Definición 2 (catálogo global/local) Summary

**Reemplazados los stubs de Definición 1 y Definición 2 del doc 08 por contenido completo y trazado a REQ: Calistenia y Gimnasio no comparten modelo de datos (D-01/D-02, fundamento en `exercises.ts`/`GYM_OWNED_TABLES`/guard 404), y el ciclo de vida completo del catálogo global/local sobre `gym_exercises` con `tenant_id` NULLable (copia, promoción, desactivación, taxonomías cerradas 14/25/9, mapeo de categoría validado D-10, caso borde de unique con NULL en MySQL).**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-08-27
- **Tasks:** 2/2 completadas
- **Files modified:** 1 (doc 08, ya trackeado)

## Accomplishments

- **Definición 1** (49 líneas dentro de la sección): respuesta de una línea ("no comparten modelo de datos"), fundamento con evidencia de código (columnas de `exercises` — `pattern`, `route`, `progression_step`, `dificultad_lineal`, `habilidad`, `canonical_exercise_id`, `milestone_exercise_id`, `effort`, `level` — contra los 15 campos de la ficha del §2.2 del brief, ninguno presente en `exercises`), el hecho estructural de que `exercises` está en `GYM_OWNED_TABLES`, la diferencia de ciclo de vida (algoritmo vs plantilla→registro), el caso peso-corporal-con-lastre como vocabularios de `equipment` que nunca se cruzan, y la respuesta "uno, siempre" al historial fundada en la exclusión mutua de módulos (D-02) + el guard `requireModule` → 404 de la fase 176.
- **Definición 2** (111 líneas dentro de la sección): la forma elegida (tabla única `gym_exercises` con `tenant_id` NULLable, citando H-1 sin reabrirlo), copia local automática (CAT-03, `copied_from_exercise_id` informativo, no FK de lectura), promoción local→global (CAT-04, `UPDATE ... SET tenant_id = NULL`, id preservado), desactivación (CAT-05, `status` borrador/publicado/desactivado en vez de `deleted_at`, con semántica por valor estilo `tenants.ts`), el caso borde de unique con columna `NULL` en MySQL (mitigación `tenant_scope_key = COALESCE(tenant_id, 0)`), taxonomías cerradas del §2.3 (14 grupos musculares, 25 equipamientos, 9 patrones) validadas en la carga, tabla de mapeo de categoría (7 valores, con `antebrazo→Bíceps` y `cuello→Core`) validada por D-10 sin pendientes de confirmación, aislamiento del buscador (CAT-07), la corrección explícita de la contradicción heredada de `02-inventario-modulos.md` §2 (equipamiento por tenant, fuera de alcance por el brief §2.3), y la extensión de la misma decisión de scope mixto a las plantillas de rutina globales (RUT-01).
- Ambas secciones cierran con marcador `✅ CERRADA` y traza explícita de REQ IDs (Definición 1: CAT-01, CAT-02, REG-03, DIS-01; Definición 2: CAT-01 a CAT-08, RUT-01 — 9 REQ IDs únicos).
- Cero uso de la palabra `PENDIENTE` en las dos secciones; cero tabla comparativa "unificar vs separar" (prohibida por D-01); cero cadena "validar con Nacho" (D-10 cerró el pendiente de A4).

## Task Commits

Commit único en la rama `feat/181-diseno-modulo-gimnasio` del worktree `/home/franco/projects/et-181` (las dos tareas modifican el mismo bloque contiguo del mismo archivo, se commitearon juntas tras verificar ambas):

1. **Task 1 + Task 2: Definición 1 y Definición 2** - `e8ed4bdd` (docs)

## Files Created/Modified

- `.docs/saas-multitenancy/08-diseno-modulo-gimnasio.md` (+152/-2 líneas) - reemplazo de los stubs `_PENDIENTE — se completa en el plan 181-02._` de `## Definición 1` y `## Definición 2` por el contenido completo. El resto del doc (Precondiciones H-1..H-4, Definiciones 3-7, DIS-02, Seguridad, Frontera, Trazabilidad, Decisiones heredadas) queda intacto, con sus stubs `PENDIENTE` para los planes 181-03 a 181-06.

## Decisions Made

Ninguna decisión nueva — este plan **responde** las Definiciones 1 y 2 aplicando decisiones ya cerradas en el CONTEXT (D-01, D-02, D-10) y en H-1 del propio doc (181-01). No hay Rule 4 (arquitectural) ni desviaciones que requieran decisión del usuario.

## Deviations from Plan

None - plan ejecutado exactamente como estaba escrito. Los `read_first` de ambas tareas se verificaron contra el código real (`exercises.ts` líneas 1-95, `module-registry.ts` líneas 1-80, `tenants.ts` líneas 1-107) y coinciden con lo que el plan citaba textualmente (columnas de `exercises`, docblock del guard 404, enum de `status` de `tenants`). No se encontraron bugs ni funcionalidad faltante que auto-corregir.

## Verification Results

`bash .planning/phases/181-dise-o-del-m-dulo-gimnasio-bloqueante/verificar-doc-08.sh` (corrido después del commit `e8ed4bdd`), exit code 1:

```
OK: C1 - el archivo .docs/saas-multitenancy/08-diseno-modulo-gimnasio.md existe
OK: C2 - hay 7 secciones '## Definición N —' (7)
OK: C3 - hay 4 subsecciones '### H-N' (4)
FALLA: C4 - la sección 'Definición 3 — Comportamiento offline' no traza a ningún REQ ID
FALLA: C4 - la sección 'Definición 4 — Recálculo de récords personales' no traza a ningún REQ ID
FALLA: C4 - la sección 'Definición 5 — Superseries y circuitos' no traza a ningún REQ ID
FALLA: C4 - la sección 'Definición 6 — Volumen de datos, esquema e índices' no traza a ningún REQ ID
FALLA: C4 - la sección 'Definición 7 — Mapa de parámetros en tenant_settings' no traza a ningún REQ ID
OK: C5 - constancia de que el-templo-app no se transforma
OK: C6 - constancia del trigger de split de repos
OK: C8 - prettier --check pasa

Resumen: 5 falla(s).
```

Baja de **7 a 5 fallas de C4** respecto del estado post-181-01, tal como preveía el prompt: las 5 fallas restantes son las Definiciones 3-7, que siguen en stub `PENDIENTE` a propósito porque las completan los planes 181-03 y 181-04. No hay ninguna falla nueva ni regresión en C2/C3/C5/C6/C8.

`pnpm exec prettier --check .docs/saas-multitenancy/08-diseno-modulo-gimnasio.md` → exit 0 ("All matched files use Prettier code style!").

`git status --porcelain` (worktree, post-commit) → vacío, working tree limpio.

Checks específicos de las `<acceptance_criteria>` de ambas tareas, corridos manualmente contra el archivo commiteado — todos en verde: conteo de sección Definición 1 (1), REQ IDs en Definición 1 (≥1), 9 REQ IDs únicos en Definición 2 (≥8 requerido), presencia de las 9 cadenas literales exigidas en Definición 1 (`progression_step`, `canonical_exercise_id`, `GYM_OWNED_TABLES`, `equipment`, `404`, `✅ CERRADA`, `D-01`, `D-02`, `uno`) y de las 20 exigidas en Definición 2 (`tenantOrGlobalWhere`, `copied_from_exercise_id`, `SET tenant_id = NULL`, `borrador`, `publicado`, `desactivado`, `COALESCE(tenant_id, 0)`, `14`, `25`, `9`, las 7 categorías por nombre, `antebrazo`, `cuello`, `D-10`), ausencia de `PENDIENTE` en ambas secciones, ausencia de `validar con Nacho`, ausencia de fila de tabla con `unificar` en Definición 1.

## Issues Encountered

- `git add` sobre el doc 08 imprime el warning de `.gitignore` (`.docs` está ignorado a nivel de repo, desviación documentada y aceptada en 181-01 con `git add -f`) y sale con exit code 1, pero el archivo ya estaba trackeado desde 181-01 así que el `add` sin `-f` staged el diff igual (confirmado con `git diff --cached --stat` antes de commitear). No fue necesario `-f` en este plan porque el archivo ya es un archivo trackeado, no una adición nueva.
- El pre-commit hook (Husky + lint-staged) corrió `prettier --write` sobre el doc (sin cambios, ya estaba formateado) y falló al intentar re-stagear con el mismo warning de `.gitignore` de `.docs` — el commit se completó igual porque el índice ya tenía el contenido correcto antes de que lint-staged intentara re-agregar. Verificado post-commit: `git status --porcelain` vacío, `prettier --check` exit 0, contenido del commit coincide con lo esperado (152 inserciones, 2 eliminaciones de las líneas stub).

## User Setup Required

None.

## Next Phase Readiness

- El plan 181-03 puede completar las Definiciones 3 (offline) y 4-5 (récords, superseries) sobre este mismo doc, sin re-litigar Definición 1/2.
- La fase 184 (catálogo de ejercicios) tiene ahora, además de los artefactos de H-1, la mecánica exacta del ciclo de vida (copia, promoción, desactivación, unique con `COALESCE`) y las taxonomías cerradas completas para implementar sin decisiones pendientes.

## Self-Check

- `FOUND: .docs/saas-multitenancy/08-diseno-modulo-gimnasio.md`
- `FOUND: e8ed4bdd` (commit en `git log --oneline`)

## Self-Check: PASSED

---

_Phase: 181-dise-o-del-m-dulo-gimnasio-bloqueante_
_Completed: 2026-08-27_
