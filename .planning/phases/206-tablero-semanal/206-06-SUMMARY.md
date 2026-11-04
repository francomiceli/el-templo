---
phase: 206-tablero-semanal
plan: 06
subsystem: api
tags: [weekly-board, routes, tenancy, integration-tests]
requires: [206-05]
provides:
  - "GET /api/admin/weekly-board (matriz por semana, alcance por rol/pais/sede)"
  - "PUT /api/admin/weekly-board/leads (alta, cambio y baja de leads por sede)"
  - "weeklyBoardRoutes registrado en app.ts, manifiesto ISO-01 542 -> 544"
affects: [206-07, 206-08, 206-09]
key-files:
  created:
    - el-templo-api/src/modules/weekly-board/schemas.ts
    - el-templo-api/src/modules/weekly-board/routes.ts
    - el-templo-api/src/modules/weekly-board/index.ts
    - el-templo-api/test/weekly-board/weekly-board-routes.test.ts
    - el-templo-api/test/weekly-board/weekly-board-access.test.ts
  modified:
    - el-templo-api/src/app.ts
    - el-templo-api/test/tenant-manifest.ts
    - el-templo-api/test/tenancy/iso-01-manifiesto.test.ts
key-decisions:
  - "El GET no usa enforceBranchScope: el alcance sale de la lista de sedes del servicio"
  - "WEEKLY_BOARD_ROLES = CAJA_ROLES definido en routes.ts, no en permissions.ts (evita choque con feat/oficina)"
requirements-completed: [SC-1, SC-3, SC-4, SC-5, SC-6, SC-7, SC-8, D-02, D-04, D-05, D-08, D-11, D-15, D-16, D-22, D-24, D-25, D-27]
completed: 2026-11-03
---

# Phase 206 Plan 06: Rutas HTTP del Tablero Summary

El Tablero se expone por HTTP con guard `CAJA_ROLES`, alcance por pais y sede resuelto en el servicio, validacion AJV tipada (FA-07), manifiesto de tenancy actualizado y dos archivos de integracion.

## Commits

| Commit | Subject |
| --- | --- |
| 707c467fd | feat(206-06): rutas del tablero semanal y manifiesto de tenancy |
| fa4780ab6 | test(206-06): armado, online, fotos y leads del tablero |
| 6cf79c9d6 | test(206-06): roles, alcance y aislamiento del tablero |

## Que se hizo

- `schemas.ts`: `weeklyBoardGetSchema` (query `weekStart` con pattern, `additionalProperties: false`) y `weeklyBoardLeadsPutSchema` (`branchId` integer >= 1, `weekStart` pattern, `leads` integer 0..100000 o null; los tres requeridos). Tipos `WeeklyBoardQuery` y `WeeklyBoardLeadsBody`. Sin schema de respuesta a proposito: el contrato tiene claves dinamicas (id de sede, pais) y fast-json-stringify solo serializa las propiedades declaradas.
- `routes.ts`: hook `onRequest` (authenticate, 403 fuera de `CAJA_ROLES`, `attachCountryScope`); `GET /` con WR-05 (no-owner y no admin_sede con `country === null` -> 403 "Scope de pais no resuelto"), tenant por `assertTenant(request.scope, "weekly-board.get")`; `PUT /leads` con `requireBranchAccess({ from: "body.branchId" })` y `assertTenant(..., "weekly-board.leads")`. Errores por `handleServiceError`.
- `app.ts`: registro con prefix `/api/admin/weekly-board`, junto a renewals.
- Manifiesto: 2 entradas `tenant-scoped`; `ENTRADAS_BASELINE` 542 -> 544 (se verifico que el valor vigente en esta rama era 542) y titulo del `it` actualizado.

## Tests (todos "pendiente de CI": regla del repo, no se corrio vitest local)

- `el-templo-api/test/weekly-board/weekly-board-routes.test.ts` (12 `it(`): default y 400 (martes, futura, `2026-13-01`, basura), columnas exactas contra `branches`, Total AR sin Online ni ES (Online 300 aparte, ES 80 EUR), porcentajes desde conteos (1 de 4 = 25, no 50), ciclo de leads (null -> 10 -> 12 con una sola fila -> null, `updated_by`), % Reserva con leads en la semana anterior, validacion del PUT (ventana D-24, lunes, virtual, inactiva, -1, 1.5, "abc", 100001, faltante), `leadsEditable`, foto gana sobre el dato vivo (12345 vs 777), provisorio/congelado en `previous`, variacion de activos (vivos - 7, null sin foto), semana vieja sin foto (deuda y activos null, cobrado en vivo).
- `el-templo-api/test/weekly-board/weekly-board-access.test.ts` (8 `it(`): 401 sin token; coach y recepcion 403 en GET y PUT; admin_sede una columna sin Total ni Online, PUT propio 200 y a otra sede o a la virtual 403; admin y gestion AR sin ES, PUT a ES 403; admin ES sin AR; owner con AR y ES sin `?country`; aislamiento de GET en ambos sentidos; PUT cruzado entre gimnasios 403 sin filas en ninguno + control positivo del gimnasio 2.
- `test/tenancy/iso-01-manifiesto.test.ts`: pendiente de CI (cuenta 544).
- Ninguno de los dos tests de integracion usa fake timers, `todayStr()` ni ids de `users` literales. Los estados se derivan de la presencia de la foto y de offsets de semana.

## Gates

| Gate | Resultado |
| --- | --- |
| `pnpm exec tsc --noEmit` | exit 0 |
| `pnpm lint:tenant` | exit 0 (DISCREPANCIAS: 0) |
| `pnpm typecheck:tests` | exit 1 (17 discrepancias preexistentes); ninguna linea menciona archivos de esta fase |
| Prettier sobre archivos tocados | OK |

## Decisiones del ejecutor

- `request.user.userId` (no `request.user.id` como decia el plan): es el campo real del JWT en este repo.
- Porcentaje de asistencia con 4 pruebas: se asserta `reservas` Total = 4 y `pctAsistencia` Total ~ 25 de forma incondicional, apoyado en que `cleanAllTestData` vacia las reservas del resto de las sedes. Si CI mostrara pruebas ajenas, ajustar a la suma del grupo.
- El % Reserva con leads se prueba sobre la semana anterior (donde se siembran las pruebas) y el ciclo de alta/cambio/baja sobre la semana en curso, para que ambos asserts no dependan del dia de la semana.
- El owner de los tests de rutas es `admin@test.com` (sobrevive a `cleanAllTestData`); en los de acceso los actores se crean una vez en `beforeAll` con `createStaffUser`.
- Sin schema de respuesta (ver arriba) y sin guard de modulo: el plan no los pide.

## Deviations from Plan

None - plan ejecutado tal como estaba escrito (las decisiones de arriba son elecciones dentro de lo que el plan dejaba abierto).

## Notas para el merge con feat/oficina

- `src/app.ts`: ambas ramas agregan un `import` y un `app.register(...)` cerca de renewals. Conflicto textual probable pero trivial: conservar los dos imports y los dos `register`.
- ISO-01 (`ENTRADAS_BASELINE` y titulo del `it`): esta rama lo mueve 542 -> 544. `feat/oficina` tambien lo mueve desde 542. Al mergear hay que SUMAR deltas, no elegir uno: 542 + 2 (tablero) + N (oficina). Ajustar tambien el titulo del `it` y el comentario de historial. El manifiesto `test/tenant-manifest.ts` agrega un bloque propio (`/api/admin/weekly-board`) sin tocar otros.
- `permissions.ts` no se toco a proposito (`WEEKLY_BOARD_ROLES` vive en `routes.ts`).

## Notas para los planes siguientes

- 206-07 (job): el CON-04 (gate del job) va alli, no en este plan. Las rutas no dependen del job: la foto se lee por presencia.
- 206-08 (admin): el cliente debe mandar `branchId` e `leads` como numeros (el schema AJV con coercion acepta strings numericos, pero un `leads` decimal o fuera de 0..100000 da 400). `leads: null` borra. Errores: 400 (ventana, lunes, sede virtual/inactiva), 403 (rol, sede fuera de alcance, sede de otro gimnasio), 404 no aplica al PUT porque `requireBranchAccess` corta antes con 403.
- `GET` rechaza cualquier query distinta de `weekStart` (incluido `?country`) con 400: el alcance por pais es solo por rol.

## Known Stubs

Ninguno.

## Threat Flags

Ninguno. T-206-17..22 mitigados en codigo y cubiertos por los tests de acceso (autenticacion, roles, columnas por rol, WR-05, validacion AJV + `requireBranchAccess`, aislamiento por gimnasio, `updated_by`).

## Self-Check: PASSED

Archivos verificados en disco (schemas, routes, index, ambos tests) y commits 707c467fd, fa4780ab6, 6cf79c9d6 presentes en `git log`.
