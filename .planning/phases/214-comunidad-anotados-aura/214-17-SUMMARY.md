---
phase: 214-comunidad-anotados-aura
plan: 17
subsystem: scheduling
tags: [community, attendees, privacy, aura, D-01, D-02, D-03, D-09, D-43, D-52, D-59, D-65, D-68]
requires: ["214-16"]
provides:
  - "GET /api/members/scheduling/slots/:scheduleId/:date/attendees (lista de anotados con privacidad en el servidor)"
  - "AttendeesService.getSlotAttendees (scheduling/attendees-service.ts)"
  - "countSlotBookings y vigentSlotBookingCondition (scheduling/service.ts), compartidos con la grilla semanal"
  - "RATE_LIMITS.attendees (120/min por IP) y RATE_LIMITS.attendeesPerUser (40/min por usuario)"
affects: ["214-18"]
key-files:
  created:
    - el-templo-api/src/modules/scheduling/attendees-service.ts
    - el-templo-api/test/scheduling/attendees.test.ts
  modified:
    - el-templo-api/src/modules/scheduling/service.ts
    - el-templo-api/src/modules/scheduling/schemas.ts
    - el-templo-api/src/modules/scheduling/routes.ts
    - el-templo-api/src/modules/shared/rate-limits.ts
    - el-templo-api/test/tenant-manifest.ts
    - el-templo-api/test/tenancy/iso-01-manifiesto.test.ts
    - el-templo-api/test/tenancy/iso-03-sched-lecturas.test.ts
    - el-templo-api/test/tenancy/iso-03-cobertura-subs-sched.test.ts
decisions:
  - "firstName nullable en el schema de users: la fila de salida lo normaliza a string vacio (el schema de respuesta lo declara string)"
  - "El pais del horario se compara contra el de la sede de quien mira tambien para el staff (404 indistinguible)"
  - "La inner join a users de la grilla afecta tambien a trialCount (las pruebas de cuentas borradas dejan de sumar)"
metrics:
  tasks: 3
  completed: 2026-11-18
---

# Phase 214 Plan 17: endpoint de anotados Summary

Endpoint `GET /api/members/scheduling/slots/:scheduleId/:date/attendees`: para un horario y una fecha devuelve el total de reservas vigentes no-trial y, si quien mira puede, la lista en orden de reserva (`bookedAt`, luego `bookings.id`) con `firstName`, `lastInitial` (`LEFT(last_name, 1)` en SQL), `photoUrl`/`photoId` firmadas, `aura` (Aura ganada si es mayor que 0, `null` si no) e `isMe`. Los ocultos no generan fila y solo cuentan en `total` y `hiddenCount`. Sin ningun campo de tipo de persona (D-52). Tres consultas por pedido (reservas, fotos, Aura), ninguna por fila.

## Commits

- `eaf1b0d01` feat(214-17): servicio de anotados con reglas de privacidad (D-01..D-09)
- `a7bad1c00` feat(214-17): ruta de anotados del horario
- `db6f3668e` test(214-17): privacidad de la lista de anotados e ISO-03 de lecturas

## Verificacion

- `npx tsc --noEmit` (API): 0. `pnpm lint:tenant`: DISCREPANCIAS 0.
- `pnpm typecheck:tests`: 18 discrepancias de base, las mismas del plan 16; 0 errores en los archivos tocados.
- `ENTRADAS_BASELINE` 587 -> 588 (conteo real de claves del manifiesto antes del cambio: 587). `CASOS_BASELINE` (subs+sched) 76 -> 77, incluido el titulo del `it` "las 77 rutas".
- Integracion: `attendees.test.ts` (26 `it`) y los 2 `it` nuevos de ISO-03 escritos, no corridos (quedan para CI: `test/setup.ts` se cuelga en local).

## Deviations from Plan

- **[Rule 3 - lint:tenant]** `vigentSlotBookingCondition()` nombra `schema.bookings.status` en un `sql` suelto y el lint lo contaba como acceso sin scope a `bookings` (1 violacion). Se agrego una exencion de bloque `/* tenant-safe: ... */`, mismo mecanismo que `earnedRowsFilter` (plan 11), sin tocar el allowlist.
- El helper compartido NO incluye `tenantWhere`: cada sitio de uso lo escribe literal en su `.where()` y en el join a `users` (la trampa del plan 15: una variable compartida no cuenta para el lint).
- Ninguno mas de fondo.

## Decisiones propias

- `aura: null` cuando la Aura ganada es 0 o el modulo `templo-gamification` esta apagado (confirmado por D-65). Avisar a Franco por si prefiere ver el 0.
- La grilla semanal ahora une `users` para excluir cuentas borradas (D-68): el numero de la card baja si hay reservas vigentes de cuentas borradas; `trialCount` tambien porque comparte la consulta.
- El alcance por pais (404) se aplica a todos, staff incluido: el staff ve la lista de horarios de su propio pais.
- Wellhub sin suscripcion (plan 16): quien mira sin plan ve solo el numero, como ya estaba decidido.

## Notas para los planes siguientes

- Plan 18: usar `earnedRowsFilter()` / `earnedAuraByUsers`; este plan no toca el detalle de movimientos.
- `countSlotBookings(db, ctx, scheduleId, date)` y `vigentSlotBookingCondition()` son la unica definicion de "reserva vigente" para los numeros de anotados: cualquier contador nuevo debe usarlos.
- Topes: el de IP va en `config.rateLimit`; el de usuario como `preHandler: fastify.rateLimit({... keyGenerator })` (la version instalada 11.2.0 expone `fastify.rateLimit(options)`). Verificar en CI que los dos topes no se pisan en los tests (el test de rate limit publico no los toca).
- Si CI falla `attendees.test.ts`: mirar primero la siembra del plan (se crea en `beforeEach` despues de `cleanAllTestData`), el horario de HOY con `dowInTz` de la sede de prueba, el `ALTER TABLE users AUTO_INCREMENT = 54321` del caso de ids y el espejo de ficha sembrado con `seedMemberPhoto`. El caso "ningun valor lleva el id" compara segmentos de ruta enteros, no subcadenas.

## Known Stubs

Ninguno.

## Threat Flags

Ninguno. La ruta esta en el manifiesto como `tenant-scoped` y cubierta por ISO-03 (aislamiento + control).

## Self-Check: PASSED

Los 3 commits y los 2 archivos nuevos existen.
