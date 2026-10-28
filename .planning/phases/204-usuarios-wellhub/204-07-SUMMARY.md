---
phase: 204-usuarios-wellhub
plan: 07
subsystem: api
tags: [wellhub, members, filters, export, campaigns, tests]
requires: ["204-06"]
provides:
  - "GET /api/admin/members?status=wellhub responde 200 (antes 400)"
  - "wellhubLabelVisibleSql / recentWellhubActivitySql / wellhubOnlySql exportados de members/service.ts: un solo fragmento filtra y marca"
  - "isWellhub y showWellhubLabel en listado, buscador (showWellhubLabel siempre, isWellhub salvo proyeccion minima de otra sede) y ficha"
  - "Filtro wellhubOnly en listado y export, sin finance gate"
  - "Export xlsx: Estado 'Wellhub' / 'Inactivo · Wellhub'"
  - "Campaña bajas excluye ex-alumnos con gympass_id"
affects: [204-11, 204-12, 204-13, 204-14]
key-files:
  modified:
    - el-templo-api/src/modules/members/service.ts
    - el-templo-api/src/modules/members/types.ts
    - el-templo-api/src/modules/members/schemas.ts
    - el-templo-api/src/modules/members/routes.ts
    - el-templo-api/src/modules/campaigns/audience-service.ts
  created:
    - el-templo-api/test/wellhub/members-wellhub.test.ts
metrics:
  tasks: 2
  files: 6
  completed: 2026-10-27
---

# Phase 204 Plan 07: Etiqueta Wellhub en alumnos Summary

La etiqueta Wellhub es un hecho del servidor: sale de `gympass_id` y se ve siempre que el estado efectivo no sea `activo` (D-03). Nada se corrio localmente (sin node_modules): verificacion por grep y lectura de codigo.

## Commits

- `15d58bd33` feat(204-07): etiqueta Wellhub server-side en alumnos, Solo Wellhub, export y bajas (Task 1)
- `542b2606f` test(204-07): etiqueta Wellhub en listado, Solo Wellhub, buscador, ficha, export y bajas (Task 2)

## Lo hecho

- `members/service.ts`: tres funciones exportadas junto a `effectiveMemberStatusSql`.
  - `wellhubLabelVisibleSql(ctx)` = `users.gympass_id IS NOT NULL AND <estado efectivo> <> 'activo'`.
  - `recentWellhubActivitySql(ctx)` = reserva (`isWellhubBookingRawSql("b")`) o visita (`isWellhubAttendanceRawSql("a")`) de los ultimos 30 dias; `tenant_id` inline en ambas subqueries y `users.id` literal.
  - `wellhubOnlySql(ctx)` = `gympass_id` y (etiqueta visible o (activo y actividad Wellhub reciente)).
  - `listMembers`: `status === "wellhub"` en el `if` del filtro, `wellhubOnly` en `conditions`, proyeccion `isWellhub` / `showWellhubLabel` mapeada a boolean.
  - `searchMembers`: ambas proyecciones en la rama propia y en la de la misma sede; la proyeccion minima de otra sede lleva SOLO `showWellhubLabel`.
  - `getMemberById`: `isWellhub` / `showWellhubLabel` con los mismos fragmentos (la query ya es sobre `users`).
  - `exportMembers`: acepta `status=wellhub` y `wellhubOnly` (mismo fragmento), `STATUS_LABELS.wellhub = "Wellhub"` y sufijo ` · Wellhub` cuando la marca esta visible y el estado no es ya `wellhub`.
- `members/types.ts`: `MemberListParams.wellhubOnly`, `isWellhub` + `showWellhubLabel` en `MemberListItem` y `MemberProfile`, `showWellhubLabel` (+ `isWellhub?`) en `MemberSearchItem`. `UserStatus` sin tocar.
- `members/schemas.ts`: `"wellhub"` en todos los enums de estado (querystring de listado y export, items de respuesta, `updateLead`, `check-duplicates`), `wellhubOnly` boolean en listado y export, campos nuevos declarados en item de listado, ficha y buscador.
- `members/routes.ts`: `wellhubOnly` pasa del query al listado y al export, sin chequeo de rol; el tipo del query usa `UserStatus`.
- `campaigns/audience-service.ts` `bajasConditions()`: `isNull(u.gympassId)` (D-12).

## Deviations from Plan

- **[Decision] El Estado del export rotula el estado EFECTIVO cuando la marca esta visible.** El export lee `users.status` (columna cacheada), no el efectivo. Para que `Inactivo · Wellhub` no salga como `Activo · Wellhub` con la columna desactualizada, se proyecta tambien `effectiveStatus` y se usa solo cuando `showWellhubLabel` es true. Sin marca visible el comportamiento es el de siempre.
- **[Decision] `MemberSearchItem.isWellhub` es opcional** (la proyeccion minima de otra sede no lo trae, como pedia el plan); `showWellhubLabel` es requerido.
- **[Rule 2] Enums extra con `"wellhub"`:** `updateLeadSchema` (status de respuesta) y `check-duplicates` tambien aceptaban solo 4 valores; se agrego `wellhub` para que la serializacion no quede desalineada con el status real.
- Co-Authored-By con `Claude Sonnet 5.5`.

## Bugs / observaciones no anticipadas

- El export filtra `status` contra `users.status` (columna) mientras el listado filtra contra el estado efectivo. Con `status=wellhub` coinciden (el CASE deja pasar `wellhub`), pero `status=activo|inactivo` en el export puede diferir del listado si la columna esta vieja. Pre-existente, no se unifico.
- La ficha (`getMemberById`) devuelve `status` de la columna, pero `showWellhubLabel` usa el estado efectivo: pueden discrepar solo cuando la columna esta desactualizada.
- `recentWellhubActivitySql` usa `CURDATE()` del servidor MySQL, no la tz de la sede. La ventana de 30 dias tolera la diferencia de horas.

## Known Stubs

Ninguno. El render en el admin llega en los planes 12-14 (sin opcion "Wellhub" nueva en el select Estado, D-07).

## Dudas para Franco

- Los tests nuevos no se corrieron ni tipearon. Puntos de riesgo para CI: (1) el export parsea el xlsx buscando las columnas `Email` y `Estado` por encabezado y el socio activo espera `Activo` desde `users.status` (asume que `assignTestPlan` deja la columna en `activo`); (2) el buscador del socio comun usa `search=Member` ("Test Member" de `createTestMember`); (3) las fechas -5/-45/-3 usan `dateOffsetStr` (UTC) contra `CURDATE()` del servidor, con margen amplio sobre los 30 dias; (4) el test de bajas usa `AudienceService` directo, como `campaigns-audience.test.ts`, y quita el `gympass_id` a un segundo ex-alumno.
- Prettier no se pudo confirmar (el orquestador formatea al final).

## Self-Check: PASSED

- `15d58bd33`, `542b2606f`: FOUND
- `wellhubLabelVisibleSql(` en 6 sitios de service.ts (definicion, `wellhubOnlySql`, listado, buscador, ficha, export); `isNull(u.gympassId)` en audience-service.ts
- 8 `it(` en members-wellhub.test.ts con `app.inject`; sin ids de usuario hardcodeados
