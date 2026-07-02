---
phase: 149-nav-por-categor-as-rbac
plan: 02
subsystem: api
tags: [finance, caja, system-settings, rbac, cleanup]

# Dependency graph
requires:
  - phase: 142-config-transici-n-contabilium
    provides: FinanceConfigService + endpoints GET/PUT /config/overdue-threshold (la perilla que este plan elimina)
  - phase: 141-reportes-para-la-admin
    provides: constante OVERDUE_DAYS + listPendingTray (bandeja de pendientes)
provides:
  - Umbral de pendientes hardcodeado en OVERDUE_DAYS=3 (Opción A, D-13), sin lectura de system_settings
  - Eliminación completa de la superficie de "Configuración de Caja" en la API (endpoints, servicio, schemas, types, test)
affects:
  [149-nav-por-categor-as-rbac, ConfiguracionCajaPage frontend cleanup, caja]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Read-path a constante en vez de config-service cuando el default es fijo (Opción A)"

key-files:
  created: []
  modified:
    - el-templo-api/src/modules/finance/transaction-service.ts
    - el-templo-api/src/modules/finance/routes.ts
    - el-templo-api/src/modules/finance/index.ts
    - el-templo-api/src/modules/finance/schemas.ts
    - el-templo-api/src/modules/finance/types.ts
  deleted:
    - el-templo-api/src/modules/finance/config-service.ts
    - el-templo-api/test/finance-config.test.ts

key-decisions:
  - "Opción A (D-13): el umbral lee OVERDUE_DAYS directo — la fila finance.pending_overdue_days de prod queda irrelevante, sin migración"
  - "Task 1 corta la dependencia del read-path ANTES de borrar el servicio (Task 2) para que listPendingTray nunca quede roto en un commit intermedio"

patterns-established:
  - "Borrado de perilla de config: cortar el read-path a constante primero, luego eliminar endpoints+servicio+schemas+types+test en un segundo commit tsc-verde"

requirements-completed: [NAV-01]

# Metrics
duration: ~12min
completed: 2026-07-02
---

# Phase 149 Plan 02: Eliminar la perilla de Configuración de Caja Summary

**El umbral de pendientes de la bandeja queda hardcodeado en `OVERDUE_DAYS=3` (Opción A) y se elimina por completo la superficie de "Configuración de Caja" de la API: endpoints, `FinanceConfigService`, schemas, types y test — sin migración.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-07-02T19:33:00Z (aprox)
- **Completed:** 2026-07-02
- **Tasks:** 2
- **Files modified:** 5 modificados + 2 borrados

## Accomplishments

- `listPendingTray` lee `OVERDUE_DAYS` directo (import desde `./constants`), sin depender de `system_settings` — el umbral efectivo es siempre 3, independiente del estado de la DB en prod.
- `FinanceConfigService` desacoplado de `TransactionService`: se eliminaron el import, el campo `financeConfig` y el 5º parámetro opcional del constructor.
- Endpoints `GET`/`PUT /config/overdue-threshold` eliminados de `finance/routes.ts` (ahora responden 404).
- Archivo `config-service.ts` (con `FinanceConfigService` + `FINANCE_SETTINGS_KEYS`) y test `finance-config.test.ts` borrados; export de `index.ts`, schemas de `schemas.ts` y types de `types.ts` removidos.
- Cero referencias residuales a `FinanceConfigService` / `FINANCE_SETTINGS_KEYS` / `OverdueThreshold` / `config/overdue-threshold` en `src/` y `test/`; `tsc --noEmit` verde.

## Task Commits

Cada task se commiteó atómicamente:

1. **Task 1: Read-path del umbral a OVERDUE_DAYS (Opción A)** - `9193c0f1` (refactor)
2. **Task 2: Borrar endpoints + FinanceConfigService + schemas/types/test** - `6ea5c293` (feat)

_(hash de metadata del plan se agrega en el commit final de docs.)_

## Files Created/Modified

- `el-templo-api/src/modules/finance/transaction-service.ts` — read-path del umbral vía constante `OVERDUE_DAYS`; se quitó la dependencia de `FinanceConfigService` (import, campo, param de constructor).
- `el-templo-api/src/modules/finance/routes.ts` — eliminados los dos endpoints de config, la instanciación de `financeConfigService`, sus imports (servicio, schemas, type) y el import huérfano de `ADMIN_ROLES`.
- `el-templo-api/src/modules/finance/index.ts` — removido el re-export de `FinanceConfigService` + `FINANCE_SETTINGS_KEYS`.
- `el-templo-api/src/modules/finance/schemas.ts` — borrados `getOverdueThresholdSchema` y `putOverdueThresholdSchema`.
- `el-templo-api/src/modules/finance/types.ts` — borradas las interfaces `OverdueThresholdBody` y `OverdueThresholdResponse`.
- `el-templo-api/src/modules/finance/config-service.ts` — **borrado** (servicio completo, sin otros consumidores).
- `el-templo-api/test/finance-config.test.ts` — **borrado** (test de la perilla eliminada).

## Decisions Made

- **Opción A (D-13):** leer `OVERDUE_DAYS` directo en vez de reconstruir un default en el servicio. La fila `finance.pending_overdue_days` que pueda existir en `system_settings` de prod queda irrelevante — sin migración, sin código muerto.
- **Orden de borrado:** Task 1 corta la dependencia del read-path; Task 2 elimina la superficie. Así ningún commit intermedio deja `listPendingTray` roto.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Conservar la instanciación de `financeConfigService` en routes.ts durante Task 1**

- **Found during:** Task 1
- **Issue:** El plan indicaba eliminar la instanciación de `financeConfigService` (routes.ts) en Task 1, pero los endpoints `GET`/`PUT /config/overdue-threshold` (que Task 2 elimina) todavía referenciaban esa variable → `tsc` rompería en el commit intermedio de Task 1, contradiciendo el criterio "Task 1 tsc-verde".
- **Fix:** En Task 1 sólo se desacopló `financeConfigService` del constructor de `TransactionService`; la instancia se conservó (con comentario) para los endpoints. Task 2 la eliminó junto con los endpoints.
- **Files modified:** el-templo-api/src/modules/finance/routes.ts
- **Verification:** `tsc --noEmit` verde tras Task 1 y tras Task 2.
- **Committed in:** `9193c0f1` (Task 1) / `6ea5c293` (Task 2)

**2. [Rule 3 - Blocking] Remover import huérfano de `ADMIN_ROLES` y la interfaz `OverdueThresholdResponse`**

- **Found during:** Task 2
- **Issue:** Tras borrar los endpoints, `ADMIN_ROLES` quedó importado sin uso en routes.ts. Además, types.ts tenía `OverdueThresholdResponse` (no mencionada explícitamente en el plan, sólo `OverdueThresholdBody`), que también matchea el grep de residuos `OverdueThreshold`.
- **Fix:** Se removió `ADMIN_ROLES` del import de `../shared/permissions` y se borró también la interfaz `OverdueThresholdResponse`.
- **Files modified:** el-templo-api/src/modules/finance/routes.ts, el-templo-api/src/modules/finance/types.ts
- **Verification:** grep de residuos vacío; `tsc --noEmit` verde.
- **Committed in:** `6ea5c293` (Task 2)

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Ambos ajustes eran necesarios para dejar `tsc` verde y cumplir el criterio de aceptación "cero referencias residuales". Sin scope creep — mismo objetivo, mismos archivos.

## Issues Encountered

- **Suite de tests local con fallos de entorno (no de código):** `pnpm test finance` reporta 31 fallos, todos con `Login failed for admin@test.com: Credenciales invalidas` en el `beforeAll` de cada suite (la DB de test local no está sembrada con el usuario admin). No son fallos de aserción. Por convención del proyecto (memoria: "los tests corren en CI al pushear a staging, typecheck local sí"), el gate local efectivo es `tsc` (verde). Los casos de `pending-tray.test.ts` que ejercitan el umbral verifican `thresholdDays === OVERDUE_DAYS` — comportamiento que se conserva. Los tests que ejercitaban PUT/config vivían en `finance-config.test.ts`, borrado en Task 2.

## User Setup Required

None - no external service configuration required. Sin migración (Opción A).

## Next Phase Readiness

- API sin superficie de "Configuración de Caja"; la bandeja de pendientes sigue operativa con umbral fijo = 3.
- Pendiente (fuera de alcance de este plan API-only): limpieza del frontend admin si existe `ConfiguracionCajaPage` que consuma los endpoints eliminados — abordar en el plan de admin correspondiente de la fase 149.
- Suite completa se valida en CI al pushear a staging.

## Self-Check: PASSED

---

_Phase: 149-nav-por-categor-as-rbac_
_Completed: 2026-07-02_
