---
phase: 155-horarios
plan: 02
subsystem: api
tags: [scheduling, activities, capacity, fastify, vitest, integration]

# Dependency graph
requires:
  - phase: 155-01
    provides: "Columna activities.max_capacity + overlap re-scopeado por actividad + getEffectiveCapacity por slot"
provides:
  - "maxCapacity en el ABM de actividades (create 3er arg, update con null explicito, response schema declarado)"
  - "Validacion server-side del cupo (integer|null, 1-500) en createActivitySchema/updateActivitySchema"
  - "Suite de integracion 155-horarios.test.ts: simultaneidad (HOR-01) + cupo efectivo (HOR-03) + ABM del cupo (D-08)"
affects: [155-04, horarios, capacidad, reservas]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "maxCapacity opcional propagado POST/PUT /activities -> service -> insert/update parcial (patron !== undefined para null explicito)"
    - "Test de cupo efectivo: dos socios con plan activo reservan el mismo slot; el cupo de actividad manda sobre el de sucursal"

key-files:
  created:
    - el-templo-api/test/scheduling/155-horarios.test.ts
  modified:
    - el-templo-api/src/modules/scheduling/activity-service.ts
    - el-templo-api/src/modules/scheduling/schemas.ts
    - el-templo-api/src/modules/scheduling/types.ts
    - el-templo-api/src/modules/scheduling/routes.ts

key-decisions:
  - "maxCapacity con `null` explicito limpia el cupo via patron !== undefined; ausencia de la key deja el valor intacto (D-08)"
  - "Validacion en el body schema (integer|null, minimum 1, maximum 500) rechaza cupo negativo/cero/absurdo antes del service (T-155-04)"
  - "maxCapacity declarado en activityRecordSchema porque fast-json-stringify strippea propiedades no declaradas"

patterns-established:
  - "ABM de cupo por actividad: crear con cupo, actualizar con null para volver a heredar la sucursal"
  - "Suite de integracion cubre invariante 'no dos slots de la misma actividad solapados' + cupo efectivo por slot"

requirements-completed: [HOR-01, HOR-03]

# Metrics
duration: 4min
completed: 2026-07-04
---

# Phase 155 Plan 02: ABM de cupo por actividad + suite de integracion Summary

**`maxCapacity` expuesto en el CRUD de actividades (crear/limpiar/devolver) con validacion server-side, y suite de integracion que garantiza simultaneidad (HOR-01) y cupo efectivo (HOR-03) del backend de 155-01.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-07-04T20:59:45Z
- **Completed:** 2026-07-04T21:03:39Z
- **Tasks:** 2
- **Files modified:** 5 (1 creado, 4 modificados)

## Accomplishments

- `ActivityRecord` (types) + `mapActivityRow` (service) exponen `maxCapacity: number | null`; sin este ultimo el campo no llegaba al cliente aunque el schema lo declarara.
- `createActivity` acepta un 3er parametro `maxCapacity?` que va al insert (`maxCapacity ?? null`); `updateActivity` soporta `maxCapacity: null` explicito via el patron `!== undefined` (limpia el cupo y vuelve a heredar la sucursal).
- `activityRecordSchema`, `createActivitySchema` y `updateActivitySchema` declaran `maxCapacity`; los body con `{ type: ["integer","null"], minimum: 1, maximum: 500 }` (T-155-04, rechazo server-side de cupo invalido).
- `routes.ts` POST/PUT /activities propagan `maxCapacity`; guards de modulo intactos (Horarios categoria libre, 149 D-04).
- `155-horarios.test.ts`: 8 casos en 3 grupos — simultaneidad (misma-actividad 409, distinta-actividad 201, back-to-back 201, PATCH que provoca solape 409), cupo efectivo (actividad=1 → 2º socio a lista_espera, NULL hereda branch), ABM (POST persiste, PUT null limpia).

## Task Commits

1. **Task 1: maxCapacity en el ABM de actividades (service + schema + types + routes)** - `a4703dbb` (feat)
2. **Task 2: Suite de integracion 155 (overlap re-scopeado, cupo efectivo, ABM cupo)** - `16968a15` (test)

## Files Created/Modified

- `el-templo-api/src/modules/scheduling/types.ts` - `maxCapacity: number | null` en `ActivityRecord`.
- `el-templo-api/src/modules/scheduling/activity-service.ts` - `createActivity` 3er arg + insert; `updateActivity` data type + update parcial con null explicito; `mapActivityRow` mapea `maxCapacity`.
- `el-templo-api/src/modules/scheduling/schemas.ts` - `maxCapacity` en `activityRecordSchema` (integer|null) y en los body de create/update (integer|null, 1-500).
- `el-templo-api/src/modules/scheduling/routes.ts` - Body generic de POST/PUT /activities + POST pasa el 3er arg al service.
- `el-templo-api/test/scheduling/155-horarios.test.ts` - Suite de integracion (creada) con helpers propios (createActivity con cupo, postSchedule, patchSlotActivity, setupMember con plan+pago, reserve).

## Decisions Made

- **`null` explicito para limpiar el cupo:** el patron `if (data.maxCapacity !== undefined)` distingue "no enviado" (deja intacto) de "null" (limpia y hereda la sucursal). Igual que el resto del update parcial del service.
- **Validacion en el body schema:** `minimum: 1, maximum: 500` rechaza cupo negativo/cero/absurdo antes de tocar el service (T-155-04); `null` permitido para el caso "heredar sucursal".
- **`maxCapacity` en el response schema:** fast-json-stringify strippea lo no declarado, asi que sin la propiedad en `activityRecordSchema` el cliente lo recibia vacio aunque el service lo devolviera.
- **Test de cupo con dos socios reales:** para probar que el cupo de actividad (1) manda sobre el de sucursal (22), se dan de alta dos socios con plan activo + pago y reservan el mismo slot; el 2º cae a `lista_espera`.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - tsc verde en ambas tasks; el prettier de lint-staged reformateo el payload de `postSchedule` en el commit del test (cosmetico, sin cambio de logica).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 155-04 (grilla admin con N clases por celda + member app verify-only) tiene el backend completo: overlap por actividad, cupo efectivo por slot y ABM del cupo con validacion.
- La suite `155-horarios.test.ts` corre en CI al pushear (no localmente); garantiza los invariantes de simultaneidad y cupo efectivo.
- Migracion 0167 (155-01) viaja a prod con el merge staging->master del milestone v5.4.

## Self-Check: PASSED

- Archivos presentes en disco: `155-horarios.test.ts`, `activity-service.ts`, `schemas.ts`, `types.ts`, `routes.ts`, SUMMARY.
- Commits `a4703dbb` (feat) y `16968a15` (test) verificados en git log.
- `pnpm exec tsc --noEmit` verde con el test incluido.

---

_Phase: 155-horarios_
_Completed: 2026-07-04_
