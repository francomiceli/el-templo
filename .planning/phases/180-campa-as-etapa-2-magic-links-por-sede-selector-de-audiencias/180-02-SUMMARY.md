---
phase: 180-campa-as-etapa-2-magic-links-por-sede-selector-de-audiencias
plan: 02
subsystem: scheduling
tags: [maps, branches, member-app, campaigns, vitest]
status: completed

# Dependency graph
requires:
  - phase: 180-01
    provides: "Base de fase 180 confirmada (tren v6.0, staging 8d0feea7); worktree et-180 con node_modules + .env local"
provides:
  - "buildMapsUrl(address) — fuente única del link 'Cómo llegar' (D-17) en toda la API"
  - "GET /api/members/scheduling/branches devuelve address + mapsUrl por sede, sin cambiar su scoping"
affects: [180-09]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Helper puro en shared/ (sin dependencias de DB/Fastify) reutilizable por scheduling y campaigns"
    - "Proyección aditiva sobre un endpoint existente sin tocar el where/tenantWhere (cambio de solo lectura)"

key-files:
  created:
    - el-templo-api/src/modules/shared/maps.ts
    - el-templo-api/test/scheduling-member-branches.test.ts
  modified:
    - el-templo-api/src/modules/scheduling/routes.ts

key-decisions:
  - "scheduling/types.ts existe pero no declara un tipo de respuesta para /branches; siguiendo la acción 3 del plan, NO se inventó un tipo nuevo (se dejó el endpoint con inferencia estructural, igual que antes del cambio)"
  - "El test nuevo NO repite los casos de aislamiento cross-tenant/cross-país de /branches (ya cubiertos en profundidad por test/tenancy/iso-03-sched-lecturas.test.ts) — se enfoca en el contrato nuevo (address/mapsUrl) más la exclusión de inactivas/virtuales que sí pide el plan"
  - "Se agregó un 4to test (address de solo espacios ⇒ mapsUrl null) más allá del mínimo de 3 que pide el plan, para cubrir literalmente el tercer caso del bloque <behavior> del Task 1 (CLAUDE.md: 'well-tested code non-negotiable')"

patterns-established:
  - "buildMapsUrl es ahora la única forma permitida de construir un link de Google Maps en la API — futuros consumidores (email de campaña 180-09, confirmación de prueba) deben importarlo en vez de reimplementar la URL"

requirements-completed: [RES-01]

# Metrics
duration: ~35min
completed: 2026-08-23
---

# Fase 180 Plan 02: Helper de Maps compartido + `/branches` con dirección Summary

**`GET /api/members/scheduling/branches` ahora devuelve `address` y un `mapsUrl` de "Cómo llegar" derivado server-side por un helper único (`buildMapsUrl`), sin tocar el scoping tenant/país existente del endpoint.**

## Performance

- **Duration:** ~35 min
- **Completed:** 2026-08-23
- **Tasks:** 2/2
- **Files modified:** 3 (2 nuevos, 1 modificado)

## Accomplishments

- `el-templo-api/src/modules/shared/maps.ts` — `buildMapsUrl(address)`: `trim()` + `encodeURIComponent`, `null` si la dirección está ausente o es solo espacios. Sin dependencias de DB ni de Fastify — reutilizable tal cual desde `campaigns/templates.ts` (`sedeRow`, plan 180-09) y desde `trials-service.ts` a futuro.
- `GET /api/members/scheduling/branches` proyecta `branches.address` y expone `mapsUrl` calculado, sin modificar el `where`/`tenantWhere` doble (branches + users) que ya scopea el endpoint por tenant y por país del socio.
- Test de integración nuevo contra MySQL real: 4 casos (dirección cargada con prefijo exacto de Google Maps, `address` NULL, `address` de solo espacios, exclusión de sedes inactivas/virtuales).

## Task Commits

Ejecutados dentro del worktree `/home/franco/projects/et-180` (rama `feat/180-campanas-etapa-2`):

1. **Task 1: Helper `buildMapsUrl` + `/branches` devuelve address y mapsUrl** - `c9f38791` (feat)
2. **Task 2: Test de integración de `/branches` (address, mapsUrl y scoping)** - `06443874` (test)

## Files Created/Modified

- `el-templo-api/src/modules/shared/maps.ts` (nuevo) - `buildMapsUrl(address: string | null | undefined): string | null`
- `el-templo-api/src/modules/scheduling/routes.ts` - handler `GET /branches`: suma `address` al `.select()` y `mapsUrl: buildMapsUrl(r.address)` a la respuesta mapeada; import de `buildMapsUrl`
- `el-templo-api/test/scheduling-member-branches.test.ts` (nuevo) - 4 tests de integración

## Decisions Made

- **`scheduling/types.ts` sin tocar:** existe en el módulo pero no declara ningún tipo para la respuesta de `/branches` (se confirmó con grep antes de tocarlo). El plan explícitamente prohibía inventar un tipo nuevo si no lo declaraba ya, así que el endpoint queda con inferencia estructural de TypeScript, igual que antes.
- **Test nuevo no duplica el aislamiento cross-tenant:** `test/tenancy/iso-03-sched-lecturas.test.ts` ya cubre en profundidad que `/branches` no filtra sedes de otro gimnasio/país; el archivo nuevo se enfoca exclusivamente en el contrato aditivo (`address`/`mapsUrl`) y en la exclusión de sedes inactivas/virtuales que el plan pide verificar explícitamente.
- **4to test agregado (no pedido explícitamente por el mínimo del plan):** el bloque `<behavior>` del Task 1 exige que una `address` de solo espacios se trate como sin dirección; se agregó un test dedicado para no dejar ese caso solo implícito en el código, en línea con la preferencia de testing exhaustivo de CLAUDE.md.

## Deviations from Plan

None — el plan se ejecutó tal como estaba escrito. Ambos tasks siguieron sus `<action>`/`<verify>`/`<acceptance_criteria>` sin necesidad de aplicar las reglas de desviación 1-4 sobre código de producto.

## Verification

- `pnpm exec tsc --noEmit` → exit 0 (corrido después de cada task y de nuevo al cierre del plan).
- `pnpm exec vitest run --no-file-parallelism test/scheduling-member-branches.test.ts` → **4/4 tests verdes** (109.48s).
- `git diff` de `routes.ts` NO muestra cambios en las llamadas a `tenantWhere` del handler `/branches` (verificado con grep antes de commitear el Task 1).
- `git status`/`git diff --name-only` en ningún momento del plan listó `test/tenant-manifest.ts` ni archivos de `ENTRADAS_BASELINE` — el endpoint no agregó ninguna ruta nueva, solo campos a una existente.
- Acceptance criteria de ambos tasks verificados con los greps exactos que pide el plan (ver comandos en la sección de ejecución de este agente).

## Issues Encountered

None.

## User Setup Required

None — no se instalaron dependencias nuevas, no hay variables de entorno nuevas, no hay migraciones (el endpoint solo proyecta una columna que ya existe desde la migración 0132).

## Next Phase Readiness

- `buildMapsUrl` queda disponible en `el-templo-api/src/modules/shared/maps.ts` para que el plan 180-09 (template del email de campaña, `sedeRow`) lo importe directamente en vez de construir la URL de Maps por su cuenta.
- El worktree `et-180` sigue con `node_modules`/`.env` local operativos; no requiere setup adicional para el próximo plan de la fase.
- Sin bloqueos.

---

_Phase: 180-campa-as-etapa-2-magic-links-por-sede-selector-de-audiencias_
_Completed: 2026-08-23_

## Self-Check: PASSED

- FOUND: el-templo-api/src/modules/shared/maps.ts (worktree et-180)
- FOUND: el-templo-api/test/scheduling-member-branches.test.ts (worktree et-180)
- FOUND: commit c9f38791 (feat, Task 1)
- FOUND: commit 06443874 (test, Task 2)
- FOUND: este SUMMARY.md en el checkout principal
