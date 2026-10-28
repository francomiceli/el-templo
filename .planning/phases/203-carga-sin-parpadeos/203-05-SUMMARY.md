---
phase: 203-carga-sin-parpadeos
plan: 05
subsystem: api+app-store
status: complete
completed: 2026-10-28
requirements: [SC-4, D-15, D-07, D-08, D-17]
commits: [ee6d12367, c20ae964b]
key-files:
  created:
    - el-templo-api/test/scheduling/my-bookings-weeks.test.ts
  modified:
    - el-templo-api/src/modules/scheduling/schemas.ts
    - el-templo-api/src/modules/scheduling/routes.ts
    - el-templo-api/src/modules/scheduling/booking-service.ts
    - el-templo-app/src/composables/useSchedulingApi.ts
    - el-templo-app/src/stores/useTodayBookingStore.ts
    - el-templo-app/src/stores/__tests__/today-booking-store.test.ts
---

# Phase 203 Plan 05: my-bookings en un solo pedido (SUMMARY)

`GET /members/scheduling/my-bookings` acepta `weeks` (entero 1..2, opcional, default 1) y `useTodayBookingStore.load()` hace UN pedido con `weeks: 2` en lugar de dos. El store además expone `loadedTz` y `loadFailed`.

## Qué quedó

- API:
  - `schemas.ts`: `weeks: { type: "integer", minimum: 1, maximum: 2 }` (no requerido; `required` sigue siendo solo `weekStart`). Fuera de rango o no numérico: 400 por el schema.
  - `routes.ts`: `Querystring: { weekStart: string; weeks?: number }` y `request.query.weeks ?? 1` al servicio. El otro llamador de `getMyBookings` (`/weekly`, routes.ts:1274) no pasa `weeks` y queda idéntico.
  - `booking-service.ts`: `getMyBookings(ctx, memberId, weekStartDate, weeks = 1)`, `weekEnd = addDays(weekStartDate, 7 * (weeks - 1) + 5)`. Con `weeks=1` el resultado es el mismo de antes.
  - Test de integración `my-bookings-weeks.test.ts` (11 casos): sin `weeks`, `weeks=1` igual a sin `weeks`, `weeks=2` (orden por fecha, deja afuera el domingo de la semana 2 y la 3.ª semana), superset del domingo de la semana 1 documentado, otro socio no se mezcla, etiqueta Combos/Técnica por semana, 400 para `weeks=3`/`0`/`abc`, 400 sin `weekStart`, 401 sin token.
- App:
  - `fetchMyBookings(weekStart, signal?, opts: { weeks?: 1 | 2 } = {})`: con `weeks` manda `{ weekStart, weeks }`, sin él `{ weekStart }` (igual que antes). `getMyBookings` de Reservas no cambió.
  - `useTodayBookingStore.load()`: un solo `fetchMyBookings(thisMonday, undefined, { weeks: 2 })`, guard de generación, `loadFailed` (éxito lo baja; falla lo sube), primera carga fallida deja `bookings = []`, un refresco fallido conserva los turnos previos (`bookings.value = []` solo bajo `!loaded.value`), `loadedTz = tz usada` al terminar. `reset()` pone `loadedTz` en null y `loadFailed` en false. Ambos se devuelven en el `return`.
  - Test del store reescrito: `mockWeeks` entiende `weeks: 2` (concatena la semana siguiente con `addDaysStr`); caso "UNA vez, params exactos `{ weekStart: '2026-10-12', weeks: 2 }`"; reservas de las dos semanas en `bookings` y `nextBooking`; falla en primera carga / refresco / éxito posterior / `reset()` con `loadFailed`; bloque `loadedTz` (null antes de cargar, perfil Madrid, sin perfil = `DEFAULT_BRANCH_TZ`, recarga con el perfil real, `reset()`); el caso de `reset()` en vuelo ahora espera 1 resolver. Se eliminaron los dos casos de "una semana sí / otra no", que ya no existen.

## Tests escritos, pendientes de correr (D-17)

- API: `el-templo-api/test/scheduling/my-bookings-weeks.test.ts` corre en CI contra MySQL. No se corrió local.
- App: `today-booking-store.test.ts` escrito sin correr (sin vitest). Sí se corrió prettier (formateó el test) y eslint (`-c ./eslint.config.js`, sin hallazgos) sobre los 3 archivos de la app. Nada de formato sobre la API (no hay `node_modules`).
- Verificadas contra el `return` real del store las propiedades que lee el test (`loadFailed`, `loadedTz`, `bookings`, `nextBooking`, `loaded`, `todayStr`, `fabVisible`, etc.).

## Deviations from Plan

1. **[Rule 1 - Bug] La etiqueta Combos/Técnica usaba la plani de la primera semana para todas las filas.** `getMyBookings` cargaba `loadModeByDay(weekStartDate)` una sola vez y la aplicaba a todas las reservas. Con `weeks=2`, una clase "General" de la semana siguiente habría salido con el modo (Combos/Técnica) de la semana 1: error visible en la card de hoy y en Reservas. Ahora se cargan las plani de cada semana pedida (`Promise.all` sobre `loadModeByDay(addDays(weekStart, 7 * i))`) y cada fila usa la de su semana (índice = semanas completas desde `weekStart`). Con `weeks=1` el índice siempre es 0 y el comportamiento es idéntico. Esto rompe el criterio de aceptación "el diff de `booking-service.ts` cambia solo la firma, `weekEnd` y su comentario"; es necesario para que el recorte no cambie lo que ve el socio. Test dedicado (se saltea con `it.skipIf` si las dos semanas caen en la misma semana SPOM por el clamp 1-52, para no romperse cuando se agote el calendario de la plani).
2. Domingo de la semana 1: tal como pide el plan, `weeks=2` es un rango continuo e incluye ese domingo (superset inocuo); el test lo fija.
3. `fetchMyBookings` se documentó con `opts.weeks` en el docblock; no se tocó nada más del composable.

## Riesgos a mirar antes del plan 06

- **Este plan baja los pedidos por carga (2 → 1), no las cargas repetidas.** La línea base dice que my-bookings sale ~4,4 veces por apertura de socio: `load()` se llama desde el layout, Mi Templo/Reservas y al volver de segundo plano, y este plan NO deduplica `load()` (sin `shareInFlight` ni frescura). Esperable ~2,2 pedidos tras este plan; para bajar más hay que migrar los llamadores (planes de pantalla) o dar al store un `ensure` con frescura.
- **`loadFailed` y `loadedTz` todavía no los lee nadie.** La card de hoy (planes 10/11) debe tratar `loadFailed` como "no sé", y quien conozca el perfil real debe recargar si `loadedTz !== tz`. Una carga fallida también fija `loadedTz`, así que una recarga por cambio de tz sigue funcionando (la tz cambia), pero un reintento tras falla con la misma tz hay que pedirlo explícitamente.
- **Despliegue:** la API debe estar desplegada antes de que salga la app con `weeks: 2`. Una app nueva contra API vieja ignoraría `weeks` (Fastify no rechaza el parámetro desconocido por defecto, a menos que ajv tenga `additionalProperties: false`, no es el caso de este schema) y mostraría solo la semana actual, perdiendo el "turno del lunes siguiente" en fines de semana. Orden de deploy: API primero (el deploy pipeline ya construye todo junto, pero las tiendas llegan después).
- El pre-commit hook no tiene `node_modules` en este worktree; revisar que prettier no pida cambios en `booking-service.ts` / el test de la API cuando corra en CI (líneas de `dayId` en el test con plantilla larga).

## Known Stubs

Ninguno.

## Threat Flags

Ninguno. T-203-14 (rango de `weeks` validado por schema, 400 testeado), T-203-15 (mismo filtro por `memberId` + `tenantWhere`, test con otro socio), T-203-16 (aceptado, máx. 2 semanas).

## Self-Check: PASSED

- Archivos creados/modificados existen; commits `ee6d12367` y `c20ae964b` en `git log`.
- Sin `any` ni `console.*` en los archivos tocados; `Promise.allSettled` fuera del store; `fetchMyBookings(` aparece una vez en el store.
