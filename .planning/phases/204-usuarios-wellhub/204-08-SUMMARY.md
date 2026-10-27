---
phase: 204-usuarios-wellhub
plan: 08
subsystem: api
tags: [wellhub, conversion, subscriptions, funnel, analytics, tests]
requires: ["204-07"]
provides:
  - "recordWellhubConversion(tx, ctx, userId, statusBefore, statusAfter, log) en wellhub/conversion.ts"
  - "Hook en recomputeUserStatus (misma tx, solo con ctx) junto a attributeInvitationPurchase"
  - "Embudo con entryOrigin='wellhub' (Wellhub -> socio, 2 etapas)"
affects: [204-09, 204-11]
key-files:
  created:
    - el-templo-api/src/modules/wellhub/conversion.ts
    - el-templo-api/test/wellhub/conversion.test.ts
  modified:
    - el-templo-api/src/modules/subscriptions/service.ts
    - el-templo-api/src/modules/analytics/funnel-service.ts
    - el-templo-api/src/modules/analytics/types.ts
    - el-templo-api/src/modules/analytics/schemas.ts
metrics:
  tasks: 2
  files: 6
  completed: 2026-10-27
---

# Phase 204 Plan 08: Conversion Wellhub a socio Summary

La conversion se registra dentro de `recomputeUserStatus` cuando el estado pasa a `activo`, sin endpoint paralelo: toda via de cobro (alta, renovacion, activacion programada) converge ahi. Nada se corrio localmente (sin node_modules): verificacion por grep y lectura de codigo.

## Commits

- `809357815` feat(204-08): registrar conversion Wellhub a socio en recomputeUserStatus (D-04/D-17/D-23)
- `52e8491ce` feat(204-08): origen wellhub en el embudo de conversion (D-15/D-22)
- `16d19e898` test(204-08): conversion Wellhub a socio y embudo wellhub (D-04/D-23/D-15)

## Lo hecho

- `wellhub/conversion.ts`: `recordWellhubConversion`.
  1. Guarda de transicion `statusAfter === "activo" && statusBefore !== "activo"` como primera sentencia.
  2. Sin `users.gympass_id`, retorna.
  3. Actividad Wellhub desde la ultima salida de `activo` (`MAX(user_status_history.changed_at WHERE from_status='activo')`; sin salida, cualquier actividad cuenta): reserva (`isWellhubBookingRawSql`, `booked_at` o `booking_date`), visita (`isWellhubAttendanceRawSql`, cubre `wellhub` y `wellhub_manual`) o `wellhub_bookings` no rechazada. Una sola query con `tenant_id` inline en cada tabla. Si `statusBefore === "wellhub"` se saltea (califica de por si).
  4. Suscripcion: la vigente mas reciente (`membershipInEffectSql("s2")`) JOIN `subscription_plans` con `is_trial = 0` explicito.
  5. Existencia previa por (tenant, usuario, suscripcion) y recien ahi insert con `tenantValues`; sin INSERT IGNORE.
  6. `localDate = todayInTz(branches.timezone de la sede de la suscripcion)`, con `DEFAULT_TENANT_TIMEZONE` de fallback.
  7. `kind`: `wellhub` -> `nuevo`, `inactivo` -> `ex_alumno`, resto -> `otro`.
- `subscriptions/service.ts`: import y llamada dentro de `if (ctx)`, justo despues de `attributeInvitationPurchase`; comentario ampliado (ambos hooks se saltean con `ctx === null`). Sin email.
- Embudo: `FunnelEntryOrigin` + ambos enums de `analytics/schemas.ts` (+ comentario del querystring) aceptan `wellhub`. `getFunnel` delega temprano a `getWellhubFunnel` (privado) cuando `entryOrigin === "wellhub"`; el resto del metodo no cambia. `getWellhubFunnel`: cohorte = usuarios en alcance (`tenantWhere` + `applyScope`) con `gympass_id` y actividad Wellhub (reserva o visita), mes de la primera actividad; `toPruebaPct` 100, `toActivoPct` = % con fila en `wellhub_conversions`, `medianDaysFreemiumToPrueba` null, `medianDaysPruebaToActivo` = mediana de dias enteros primera actividad -> primera conversion. Todas las queries (users, bookings, attendance, wellhub_conversions) con `tenantWhere`.
- Tests (`test/wellhub/conversion.test.ts`, 7 `it`): los 6 pedidos + el de plan de prueba.

## Deviations from Plan

- **[Plan de prueba, leccion del orquestador]** Se agrego el test `una suscripcion de prueba (is_trial) nunca registra conversion` (7mo `it`). Ademas del `NOT IN (is_trial)` que ya trae `membershipInEffectSql`, la query lleva un JOIN explicito con `is_trial = 0` (defensa en profundidad). El test llama a `recordWellhubConversion` directo con una sub vigente de un plan `is_trial` porque el recompute nunca pasa a `activo` por una prueba.
- **[Verify del plan]** El grep `recordWellhubConversion(tx, ctx, userId, statusBefore, statusAfter, this.log)` en una sola linea no matchea: la llamada quedo en varias lineas (6 argumentos pasan los 80 caracteres y Prettier la parte igual). Funcionalmente es la misma llamada.
- `second-tenant.ts` NO se toco: ningun test inserta conversiones del tenant 2.
- `bookings` no tiene `created_at` sino `booked_at`: la actividad usa `booked_at` o `booking_date` (el plan decia "created_at").
- Co-Authored-By con `Claude Sonnet 5.5`.

## Bugs / observaciones no anticipadas

- `getWellhubFunnel` repite el bloque "users en alcance + join condicional a branches" de `getFunnel` en vez de extraerlo: extraer tocaba el camino existente (D-13 pedia que quedara identico) y el lint de tenancy exige el `tenantWhere` en el mismo statement que el `.from`.
- La cohorte del embudo Wellhub usa `DATE_FORMAT` de MySQL sobre el timestamp (tz de la sesion), no la tz de la sede. Para un agrupamiento mensual la diferencia solo afecta actividad en las primeras/ultimas horas del mes.
- Una persona que se asocia, vence y se vuelve a asociar genera una fila por suscripcion nueva (`ex_alumno` la segunda vez si tuvo actividad Wellhub entre medio). Es lo buscado (convert -> lapse -> reconvert).

## Known Stubs

Ninguno.

## Dudas para Franco

- Los tests nuevos no se corrieron ni tipearon. Puntos de riesgo en CI: (1) `assignTestPlan` sobre un visitante `wellhub` y sobre el ex-alumno de la fixture (asumo que el alta no rechaza esos estados); (2) el test de renovacion usa `{ paymentMethod: "cash", amountReceived: 0 }` como el de lifecycle; (3) el test de embudo asume una sola cohorte (ambos eventos ocurren hoy) y `medianDaysPruebaToActivo = 0`; (4) la query de actividad usa una tabla derivada `x` referenciada desde subqueries `EXISTS` del SELECT: valido en MySQL 8, pero no lo ejecute.
- `kind = "otro"` cubre `freemium`/`prueba` -> `activo` con gympass_id y actividad Wellhub. El plan lo pedia asi; revisar si en el reporte (plan 11) conviene agruparlo.
- `wellhub_bookings` con estado `canceled`/`late_canceled` cuentan como actividad (se excluye solo `rejected`). Conservador hacia registrar la conversion.
- Prettier no se pudo confirmar (el orquestador formatea al final).

## Self-Check: PASSED

- `809357815`, `52e8491ce`, `16d19e898`: FOUND
- conversion.ts, conversion.test.ts: FOUND; `"wellhub"` en ambos enums de analytics/schemas.ts; 7 `it(` en conversion.test.ts; sin `insert ignore` en conversion.ts
