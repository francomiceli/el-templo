---
phase: 173-adopci-n-2-members-guarda-de-consistencia-de-anclas
plan: 24
subsystem: testing
tags:
  [
    tenancy,
    members,
    users,
    analytics,
    scheduling,
    campaigns,
    sentinel,
    sonda-revertida,
    tenant-safe,
    ratchet,
    tz-flake,
  ]

# Dependency graph
requires:
  - phase: 173-22
    provides: "sonda de members utilizable (auth/routes.ts sobrevive al throw), typecheck:tests baseline en 175"
  - phase: 173-23
    provides: "subscriptions/reports/coach/programs/referrals endurecidos, deudas de recomputeUserStatus/activateScheduledSub y reports/service.ts cerradas"
provides:
  - "test/analytics (20 archivos, 245 tests) sobrevive al throw sobre las 8 tablas del módulo"
  - "test/scheduling, test/attendance, test/check-ins, test/segmentation, test/onboarding, test/ratings, test/improvement-proposals, campañas, notificaciones y los 6 archivos sueltos de trial (28/29 archivos, 399+4 tests) sobreviven al throw"
  - "getTrialConversionReport (reports/service.ts) filtra users por tenant en sus 5 JOIN — deuda residual de 173-05/173-23 cerrada"
  - "hallazgo: test/tenancy/ (fixtures 2-tenant) nunca verificado con la sonda por ningún plan de la fase — deferred a 173-30"
  - "hallazgo: la regresión acumulada 173-22+173-23+173-24 después de las 21:00 AR se contamina con el flake horario documentado en el proyecto — cero relación con el sentinel"
affects: ["173-25", "173-30 (el switch)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "El mismo criterio de categoría 2 (filtro tenantWhere agregado al and() del where) cubrió el 100% de los sitios nuevos de este plan — cero exenciones nuevas en test/analytics ni en el grupo de Task 2"
    - "UPDATE crudo vía sql`` (el gender='unspecified' de notifications.test.ts) se filtra agregando `AND tenant_id = ${CTX.tenantId}` directamente al fragmento sql, mismo canal que 173-22 estableció para las exenciones tenant-safe embebidas"
    - "El join users u ON u.id = ft.user_id de reports/service.ts::getTrialConversionReport se filtra en el ON con `AND u.tenant_id = ${ctx.tenantId}` — mismo patrón que su método hermano getTrialSessionsReport (línea 746) que 173-23 ya había cerrado"
    - "Criterio de diagnóstico aplicado en vivo: cualquier rojo sin TenantSentinelError en la cadena de cause se investiga como calendario/pollution antes de tocar código — confirmado con grep -c TenantSentinelError == 0 sobre 46 fallos de una corrida after-hours"

key-files:
  created: []
  modified:
    - el-templo-api/test/analytics/advanced-finance.test.ts
    - el-templo-api/test/analytics/analytics.test.ts
    - el-templo-api/test/analytics/breakdowns-cohorts.test.ts
    - el-templo-api/test/analytics/engagement.test.ts
    - el-templo-api/test/analytics/especial-exclusion.test.ts
    - el-templo-api/test/analytics/frequency.test.ts
    - el-templo-api/test/analytics/funnel.test.ts
    - el-templo-api/test/analytics/ltv.test.ts
    - el-templo-api/test/analytics/member-flows.test.ts
    - el-templo-api/test/analytics/ticket.test.ts
    - el-templo-api/src/modules/reports/service.ts
    - el-templo-api/test/attendance/attendance.test.ts
    - el-templo-api/test/campaigns-audience.test.ts
    - el-templo-api/test/campaigns-funnel.test.ts
    - el-templo-api/test/campaigns-send.test.ts
    - el-templo-api/test/campaigns-tracking.test.ts
    - el-templo-api/test/notifications.test.ts
    - el-templo-api/test/scheduling-cancel-trial.test.ts
    - el-templo-api/test/scheduling-reserve-trial.test.ts
    - el-templo-api/test/scheduling-trial-eligibility.test.ts
    - el-templo-api/test/scheduling/155-horarios.test.ts
    - el-templo-api/test/scheduling/reschedule-trial.test.ts
    - el-templo-api/test/scheduling/schedule-exceptions.test.ts
    - el-templo-api/test/scheduling/scheduling.test.ts
    - el-templo-api/test/scheduling/trials.test.ts
    - el-templo-api/test/segmentation/segmentation.test.ts
    - el-templo-api/test/self-service-trial-e2e.test.ts

key-decisions:
  - "Categoría única (filtro tenantWhere) para los 63+ sitios de conveniencia encontrados — ningún fixture de este grupo siembra a propósito en el gimnasio 2, así que un filtro global era comodidad, no diseño, mismo criterio que 172-14/173-22/173-23"
  - "test/check-ins, test/onboarding, test/ratings, test/improvement-proposals, test/campaign-token.test.ts, test/campaigns-template.test.ts, test/scheduling-reserve-coverage.test.ts y test/reports-trial-sessions.test.ts ya sobrevivían al throw sin ningún cambio — verificado explícitamente, cero sitios encontrados en esos 8 destinos"
  - "getTrialConversionReport (deuda de 173-05, incorrectamente marcada 'cerrada' por 173-23 porque ya tenía ctx) necesitó el filtro real en sus 5 JOIN — cirugía mínima sobre el mismo archivo, Rule 3 (bloqueaba la verificación de Task 2 de este plan)"
  - "Ningún rojo de calendario ni de sentinel se ajustó modificando un número esperado: los rojos de la regresión ampliada after-hours se documentan en deferred-items.md, no se tocan"
  - "El intento de correr regresión sobre test/tenancy/ se descartó del criterio de aceptación de este plan al confirmar (grep en los 3 files_modified) que ningún plan de la fase incluye esa carpeta en su alcance — se documenta como hallazgo para 173-30, no como bloqueo de este plan"

patterns-established:
  - "grep -c TenantSentinelError sobre el log completo de una corrida es el criterio de diagnóstico operativo real (no solo la regla escrita): 0 ocurrencias en 46 fallos confirmó de forma mecánica que ningún rojo era del sentinel"

requirements-completed: [ADO-02]

# Metrics
duration: ~2h40m
completed: 2026-08-08
---

# Phase 173 Plan 24: Adopción 2 — members, guarda de anclas — tableros, grilla y comunicación Summary

**Los 20 archivos de analytics (245 tests) y los ~29 destinos de grilla/asistencia/campañas/trials (399+4 tests) sobreviven al throw del sentinel sobre las 8 tablas de `members`, con un fix residual en `getTrialConversionReport` (5 JOIN sin filtrar pese a ya tener `ctx`) y dos hallazgos documentados para 173-30: `test/tenancy/` (fixtures del gimnasio 2) nunca fue verificado con la sonda por ningún plan de la fase, y la regresión acumulada después de las 21:00 hora AR se contamina con el flake horario ya documentado en el proyecto — confirmado mecánicamente con `grep -c TenantSentinelError == 0` sobre 46 fallos.**

## Performance

- **Duration:** ~2h40m
- **Tasks:** 2/2
- **Files modified:** 27 (26 de test + 1 de producción, `reports/service.ts`)

## Task Commits

| Tarea                 | Nombre                                                     | Commit     | Archivos |
| --------------------- | ---------------------------------------------------------- | ---------- | -------- |
| Task 1                | test/analytics (20 archivos)                               | `fb91f4ba` | 10       |
| Fix residual (Rule 3) | getTrialConversionReport filtra users por tenant en 5 JOIN | `3bb627f1` | 1        |
| Task 2                | grilla, asistencia, check-ins, campañas y trials           | `f29450fb` | 16       |

**Plan metadata:** este SUMMARY (el orquestador hace el commit final).

## Accomplishments

- **20 archivos de `test/analytics` (245 tests)** sobreviven al throw sobre las 8 tablas del módulo. 10 archivos necesitaron filtro (`advanced-finance`, `analytics`, `breakdowns-cohorts`, `especial-exclusion`, `ltv`, `ticket` — todos con el mismo patrón `SELECT id FROM users WHERE email='admin@test.com'` en el `beforeAll`; `frequency`, `funnel`, `member-flows` — `UPDATE users SET created_at` para anclar antigüedad; `engagement` — 2 `UPDATE lastName` para el desempate alfabético del ranking). Los otros 10 ya sobrevivían sin cambios.
- **Cero exenciones nuevas y cero rojos de calendario en la verificación oficial**: los 20 archivos ya usaban offsets relativos a `NOW()`/`CURDATE()`; corridos ANTES de las 21:00 hora AR (ventana documentada de flake), 245/245 verdes.
- **28/29 destinos del grupo de Task 2** (test/scheduling, test/attendance, test/check-ins, test/segmentation, test/onboarding, test/ratings, test/improvement-proposals, 6 archivos de campañas/notificaciones/trial) sobreviven al throw: 399 tests pasan + 4 `todo` preexistentes = coincide exacto con el baseline sin sonda (403 tests, 1 skip esperado).
- **63+ sitios de conveniencia** acotados con `tenantWhere` — todos categoría 2, incluido el único `UPDATE` crudo vía `sql\`\``(gender='unspecified' en`notifications.test.ts`, filtrado con `AND tenant_id = ${CTX.tenantId}` embebido en el propio template).
- **8 de los 20 destinos del grupo Task 2 no necesitaron ningún cambio** (`test/check-ins/`, `test/onboarding/`, `test/ratings/`, `test/improvement-proposals/`, `test/campaign-token.test.ts`, `test/campaigns-template.test.ts`, `test/scheduling-reserve-coverage.test.ts`, `test/reports-trial-sessions.test.ts`) — verificado explícitamente, cero sitios sin filtrar.
- **Fix residual (Rule 3, no scope creep):** `reports/service.ts::getTrialConversionReport` ya recibía `ctx: TenantContext` (173-05/173-23 lo daban por cerrado porque "ya tenía ctx"), pero sus 5 `JOIN users u ON u.id = ft.user_id` (métrica principal + breakdowns por sede/hora/turno/detalle) no llevaban filtro real — bloqueaba `test/scheduling/trials.test.ts > GET /api/admin/reports/trial-conversion` con la sonda encendida (500 silencioso). Se agregó `AND u.tenant_id = ${ctx.tenantId}` en el `ON` de los 5 JOIN, mismo patrón que el método hermano `getTrialSessionsReport` (línea 746) que 173-23 ya había establecido.
- **Hallazgo para 173-30 (documentado en `deferred-items.md`, no corregido):** `test/tenancy/iso-02-fixtures.test.ts` (6/13 rojo), `test/tenancy/ancla-autorregistro.test.ts` (5/6 rojo) y `test/tenancy/iso-03-finance-coach-load.test.ts` (31/31 rojo) fallan con la sonda de `members` encendida. Confirmado por grep en `files_modified` de 173-21/22/23 que **ninguno de los 3 planes incluye `test/tenancy/`** en su alcance — es terreno nunca hardeneado contra el throw. Ningún `TenantSentinelError` en la cadena de `cause` de estos fallos (son `AssertionError` de conteos/aislamiento), consistente con un bug de siembra del gimnasio 2 (probable: algún camino de `createStaffUser`/`registerUser` sin `tenantId` explícito cayendo al `DEFAULT 1`) — investigación completa queda para 173-30.
- **Hallazgo para 173-30: la regresión acumulada 173-22+173-23+173-24 después de las 21:00 hora AR se contamina con el flake horario ya documentado en el proyecto.** Se corrió una regresión de 153 archivos/1862 tests combinando el `files_modified` textual de los 3 planes (excluyendo `test/tenancy`, fuera de alcance) — 46 tests rojos en 15 archivos, pero `grep -c TenantSentinelError` sobre el log completo da **0**. Se inspeccionaron varios a mano: todos son comparaciones de fecha relativas a `NOW()`/`CURDATE()` (`activeMemberExists`, `autoExpireDueSubscriptions`, filtros "by date range"). 3 de los 15 archivos son míos y habían corrido 100% verdes en la verificación oficial (antes de las 20:06 AR); 2 más están en mi `files_modified` sin que yo los tocara y también habían pasado limpio antes. Ninguno se corrigió — el flake es del reloj del runner, no del código. Detalle completo en `deferred-items.md`.

## Files Created/Modified

- `el-templo-api/test/analytics/*.test.ts` (10 archivos) — Task 1, filtro `tenantWhere` en sitios de conveniencia.
- `el-templo-api/src/modules/reports/service.ts` — fix residual, 5 JOIN filtrados por tenant en `getTrialConversionReport`.
- `el-templo-api/test/attendance/attendance.test.ts`, `test/segmentation/segmentation.test.ts`, `test/self-service-trial-e2e.test.ts`, `test/scheduling-*.test.ts` (3 archivos sueltos), `test/scheduling/*.test.ts` (5 archivos), `test/campaigns-*.test.ts` (4 archivos), `test/notifications.test.ts` — Task 2, filtro `tenantWhere` en sitios de conveniencia.

## Decisions Made

### 1. Categoría única: filtro, cero exenciones

Todos los sitios encontrados (SELECT/UPDATE por email o id en `beforeAll`/`beforeEach`/`it`) se acotaron con `tenantWhere(tabla, CTX)` agregado al `and(...)` del `where`. Ningún fixture de este grupo siembra a propósito en el gimnasio 2, así que el filtro no cambia lo que el test mide — mismo criterio que 172-14/173-22/173-23.

### 2. getTrialConversionReport necesitaba el filtro real, no solo `ctx`

173-05-SUMMARY y 173-23-SUMMARY documentaron esa deuda como "cerrada" porque el método ya recibía `ctx: TenantContext` — pero **tener `ctx` ≠ estar migrado** (trampa (a) del doc 07): los 5 `JOIN users` seguían sin `u.tenant_id = ?`. Se corrigió con cirugía mínima (mismo archivo, un solo call site en `routes.ts` ya con `assertTenant`).

### 3. test/tenancy queda fuera del alcance de este plan, documentado para 173-30

El intento inicial de regresión incluía `test/tenancy/` por estar citado en `canonical_refs` como "idioma de la batería" — al confirmar con grep que ningún `files_modified` de 173-21/22/23/24 lo incluye, se descartó del criterio de aceptación y se documentó como hallazgo aparte.

### 4. Los rojos after-hours se diagnostican, no se tocan

Ante 46 fallos en la regresión ampliada, el criterio de diagnóstico del plan (`TenantSentinelError` en la cadena de `cause`) se aplicó mecánicamente con `grep -c` sobre el log completo: 0 coincidencias. Ningún número esperado se ajustó.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `getTrialConversionReport` no sobrevivía al throw pese a tener `ctx`**

- **Found during:** Task 2, verificación de `test/scheduling/trials.test.ts`.
- **Issue:** 5 `JOIN users u ON u.id = ft.user_id` sin `u.tenant_id = ?` en `reports/service.ts`.
- **Fix:** `AND u.tenant_id = ${ctx.tenantId}` en el `ON` de los 5 JOIN.
- **Files modified:** `src/modules/reports/service.ts`.
- **Committed in:** `3bb627f1`.

**2. [Rule 1 - Bug, deferred] `test/tenancy/` no sobrevive al throw**

- **Found during:** intento de regresión acumulada ampliada (fuera del `<verify>` literal del plan).
- **Issue:** ver Accomplishments. Fuera de `files_modified` de este plan y de 173-21/22/23.
- **Fix:** ninguno — documentado en `deferred-items.md` para 173-30.

**3. [No es una desviación — hallazgo de infraestructura] Flake horario after-hours**

- **Found during:** la misma regresión ampliada.
- **Fix:** ninguno — es una propiedad del reloj del runner, no del código. Documentado en `deferred-items.md`.

---

**Total deviations:** 1 auto-fix (Rule 3) + 2 hallazgos documentados sin corregir (fuera de alcance). Ninguna desviación afecta el `<acceptance_criteria>` de este plan: ambos `<verify>` literales (Task 1 y Task 2) se corrieron y pasaron ANTES de las 21:00 hora AR, con la sonda encendida y revertida sin commitear en cada corrida.

## Issues Encountered

**La corrida de regresión acumulada ampliada (153 archivos) tardó ~22 minutos** y quedó parcialmente contaminada por el flake horario del proyecto (ventana >21:00 AR, ya documentada en `reference_test_arpu_dependiente_del_calendario.md`). No es un issue de este plan — los `<verify>` oficiales de ambas tasks se corrieron temprano y limpio; el intento posterior era trabajo extra para dar mejor señal a 173-30 y quedó documentado en `deferred-items.md` en vez de perseguirse hasta el final de la noche.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- La sonda de `members` sigue siendo completamente utilizable para 173-25: los 49 destinos de este plan (analytics + grilla + comunicación) sobreviven al throw.
- `deferred-items.md` actualizado con 2 hallazgos nuevos para 173-30 (test/tenancy sin hardenear, flake horario en la regresión ampliada) — ninguno bloquea el cierre de 173-24.
- El baseline de `typecheck:tests` se mantiene en 175 (0 nuevos, 0 empeorados).
- `tenant-lint-allowlist.json` intacto — este plan no tocó `src/modules/members|users`, la cuenta sigue para 173-30.
- `src/db/tenant-tables.ts` quedó sin commitear tras cada corrida (verificado `git status --porcelain` vacío en cada punto de control).

---

_Phase: 173-adopci-n-2-members-guarda-de-consistencia-de-anclas_
_Completed: 2026-08-08_

## Self-Check: PASSED

- `el-templo-api/test/analytics/advanced-finance.test.ts` (y los otros 9 de Task 1) — FOUND, commit `fb91f4ba`
- `el-templo-api/src/modules/reports/service.ts` — FOUND, commit `3bb627f1`
- `el-templo-api/test/attendance/attendance.test.ts` (y los otros 15 de Task 2) — FOUND, commit `f29450fb`
- Commits `fb91f4ba`, `3bb627f1`, `f29450fb` en `feat/173-adopcion-members` — FOUND (`git log --oneline`)
- `git status --porcelain el-templo-api/src/db/tenant-tables.ts` vacío tras cada corrida con sonda — VERIFICADO
- `pnpm run typecheck:tests`: 175/175 baseline, 0 nuevos — VERIFICADO (última corrida tras revertir la sonda)
- `vitest run --no-file-parallelism test/analytics`: 20/20 archivos, 245/245 tests — VERIFICADO (exit 0)
- `vitest run --no-file-parallelism` de los 20 destinos de Task 2: 28/29 archivos (1 skip esperado), 399 tests + 4 todo = 403 — VERIFICADO (exit 0)
- `.planning/phases/173-.../deferred-items.md` actualizado con los 2 hallazgos nuevos — FOUND
