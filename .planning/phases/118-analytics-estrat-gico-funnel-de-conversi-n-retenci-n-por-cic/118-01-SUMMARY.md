---
phase: 118-analytics-estrat-gico-funnel-de-conversi-n-retenci-n-por-cic
plan: 01
subsystem: api
tags: [user-status-history, members, funnel, audit, drizzle, mysql]

requires:
  - phase: 117-analytics-correcciones-de-exactitud-m-trica-de-miembros-nico
    provides: "user_status_history table + recomputeUserStatus hook (source='recompute')"
provides:
  - "Hooks de user_status_history en los 3 sitios que setean status='prueba' (members/service.ts)"
  - "Hooks de user_status_history en los 2 sitios admin que setean status='inactivo' (members/routes.ts) con source='admin'"
  - "source='admin' cableado (antes reservado pero sin uso)"
  - "Test de integración real-MySQL que cubre prueba/inactivo/no-op/no-duplicación-recompute"
affects: [funnel-service, retention-service, advanced-finance-service, plan-04]

tech-stack:
  added: []
  patterns:
    - "Status-history write forward-only con dedupe from==to, dentro de la misma tx del UPDATE (read-before/write-after)"
    - "source='admin' para flips de status iniciados por staff; source='recompute' reservado a recomputeUserStatus"

key-files:
  created:
    - el-templo-api/test/members/user-status-history-hooks.test.ts
  modified:
    - el-templo-api/src/modules/members/service.ts
    - el-templo-api/src/modules/members/routes.ts

key-decisions:
  - "Los 3 inserts de 'prueba' (createMember/createTrialMember = alta nueva con from=null; convertFreemiumToTrial = read-before/write-after) usan source='admin' por ser staff-initiated"
  - "Las altas nuevas (createMember/createTrialMember) envuelven user-insert + history-insert en una sola tx para atomicidad; convertFreemiumToTrial idem para el UPDATE"
  - "Los 2 sitios admin de 'inactivo' (conversión online→presencial sin sub cancelable, y promoción SP→legajo) se envuelven en tx con source='admin'"
  - "Dedupe from==to: en convertFreemiumToTrial y en el SP→legajo el guard de TS ya prueba que el status cambia (literales sin overlap), así que el branch de dedupe se omite donde TS lo marca como always-true; el sitio de conversión online→presencial sí mantiene el dedupe en runtime"
  - "recomputeUserStatus NO modificado: los flips a 'activo'/'inactivo' que pasan por ahí siguen con source='recompute', sin duplicar"

patterns-established:
  - "Hook de transición de status: leer status antes, UPDATE, insert en userStatusHistory solo si cambió, log.info 'user status transition recorded', todo en una tx"

requirements-completed: [D-02]

duration: ~25min
completed: 2026-05-26
---

# Phase 118 Plan 01: Hooks de user_status_history (D-02) Summary

**Cableado forward-only de `user_status_history` en los 5 sitios ciegos (3× 'prueba' en members/service.ts, 2× 'inactivo' admin en members/routes.ts) con `source='admin'`, dedupe from==to y registro atómico en tx — habilita la medición de punta a punta del funnel freemium→prueba→activo.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-05-26T20:28:00Z (aprox)
- **Completed:** 2026-05-26T20:39:00Z
- **Tasks:** 2
- **Files modified:** 3 (2 modified, 1 created)

## Accomplishments

- `members/service.ts`: las 3 transiciones a `status='prueba'` (createMember, createTrialMember, convertFreemiumToTrial) escriben fila de historial con `source='admin'`, atómicas con el insert/update del user.
- `members/routes.ts`: las 2 transiciones admin a `status='inactivo'` (conversión online→presencial cuando no hay sub cancelable, y promoción SP→legajo) escriben fila con `source='admin'` en tx, con dedupe.
- `source='admin'` (antes reservado en el schema, sin uso) queda cableado por primera vez.
- Test de integración real-MySQL con 6 casos: alta `prueba` (create + trial), convert freemium→prueba, promoción SP→inactivo (1 fila exacta), no-op sin escritura, y no-duplicación del hook recompute.
- `recomputeUserStatus` queda intacto (sin cambios en subscriptions/service.ts).

## Task Commits

1. **Task 1: Registrar transición a 'prueba' en members/service.ts** - `bd15e58e` (feat)
2. **Task 2: Registrar transición admin a 'inactivo' en members/routes.ts + test** - `490556b8` (feat)

## Files Created/Modified

- `el-templo-api/src/modules/members/service.ts` - createMember/createTrialMember envueltos en tx con insert de history (from=null, to='prueba', source='admin'); convertFreemiumToTrial con read-before/write-after en tx.
- `el-templo-api/src/modules/members/routes.ts` - 2 sitios `.set({status:'inactivo'})` envueltos en tx con insert de history source='admin' (read-before/write-after, dedupe en el sitio de conversión).
- `el-templo-api/test/members/user-status-history-hooks.test.ts` - test de integración real-MySQL, 6 casos, 6/6 verdes.

## Decisions Made

- Las altas nuevas usan `fromStatus=null` (sin status previo). Conversión y promoción usan `fromStatus` leído antes del cambio.
- Donde TypeScript prueba que la transición siempre cambia (guards que narrowean `current.status`/`user.status` a un literal que no solapa con el destino), el branch de dedupe se omite para evitar el error TS2367 (comparación always-true). El sitio de conversión online→presencial conserva el dedupe en runtime porque su `statusBefore` no está narroweado a un literal.
- Test (d): en lugar de depender de la auto-suscripción best-effort del route de createMember (que puede fallar silenciosamente), se asigna el plan explícitamente vía la API de subscriptions con un plan `online_regular`/`bookingMode='flexible'` para disparar `recomputeUserStatus` de forma determinista.

## Deviations from Plan

None - plan executed exactly as written. Los hooks, los sitios, el source y el test corresponden uno a uno con el PLAN.

## Issues Encountered

- **TS2367 (comparación always-true):** los guards de status narrowean a literales sin overlap, lo que hacía que el `if (statusAfter !== statusBefore)` fuera siempre-true y tsc lo rechazara. Resuelto omitiendo el branch de dedupe en los sitios donde el cambio está garantizado por el guard, manteniendo el dedupe solo donde el tipo lo permite.
- **Test (d) assign 400 "Para planes fijos se requiere scheduleIds":** el plan de prueba por defecto cae en `bookingMode='fixed'`. Resuelto creando un plan `online_regular` con `bookingMode='flexible'` y `classesPerWeek=null` para que el assign no exija horarios.

## User Setup Required

None - sin configuración de servicios externos. Sin dependencias nuevas (T-118-SC respetado).

## Next Phase Readiness

- Las transiciones `prueba` e `inactivo` (admin) ya dejan rastro forward-only en `user_status_history`. El funnel del Plan 04 ya no queda ciego en la etapa intermedia desde este deploy.
- Caveat de cohortes (D-01): la data precisa de `prueba`/`inactivo` es forward-only desde el deploy de estos hooks; la histórica sigue siendo aproximada (backfill 0129).
- recomputeUserStatus intacto — sin riesgo de duplicación de filas para los flips que ya cubre.

---

_Phase: 118-analytics-estrat-gico-funnel-de-conversi-n-retenci-n-por-cic_
_Completed: 2026-05-26_

## Self-Check: PASSED

- FOUND: el-templo-api/src/modules/members/service.ts
- FOUND: el-templo-api/src/modules/members/routes.ts
- FOUND: el-templo-api/test/members/user-status-history-hooks.test.ts
- FOUND: 118-01-SUMMARY.md
- FOUND commit: bd15e58e (Task 1)
- FOUND commit: 490556b8 (Task 2)
