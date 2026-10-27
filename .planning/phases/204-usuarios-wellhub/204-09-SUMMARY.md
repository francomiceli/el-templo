---
phase: 204-usuarios-wellhub
plan: 09
subsystem: api
tags: [wellhub, members, card, app-access, tenancy, tests]
requires: ["204-08"]
provides:
  - "GET /api/admin/members/:userId/wellhub -> { wellhub: card | null }"
  - "POST /api/admin/members/:userId/app-access -> { ok, emailSent }"
  - "MemberWellhubService (getCard, sendAppAccess) e isPureWellhub(ctx, userId, executor) en wellhub/member-wellhub-service.ts"
affects: [204-10, 204-14, 204-15]
key-files:
  created:
    - el-templo-api/src/modules/wellhub/member-wellhub-service.ts
    - el-templo-api/test/wellhub/member-card-app-access.test.ts
  modified:
    - el-templo-api/src/modules/members/routes.ts
    - el-templo-api/src/modules/members/schemas.ts
    - el-templo-api/test/tenant-manifest.ts
    - el-templo-api/test/tenancy/iso-01-manifiesto.test.ts
    - el-templo-api/test/tenancy/iso-03-members-ficha.test.ts
    - el-templo-api/test/tenancy/iso-03-cobertura-members.test.ts
metrics:
  tasks: 2
  files: 8
  completed: 2026-10-27
---

# Phase 204 Plan 09: Card Wellhub y acceso a la app Summary

Dos rutas nuevas bajo `/api/admin/members` sirven los datos de la card "Wellhub" de la ficha (D-20/D-02) y la acción explícita "Enviar acceso a la app" (D-17/D-26), con sus gates de tenancy. Nada se corrió localmente (sin node_modules): verificación por grep y lectura de código.

## Commits

- `dbe971829` feat(204-09): card Wellhub de la ficha y acceso a la app (D-20/D-26)
- `bf7ea66e5` test(204-09): card Wellhub y acceso a la app, manifiesto y casos ISO-03
- `03df51b68` fix(204-09): el chequeo de alcance del alumno recibe el scope, no la request

## Lo hecho

- `MemberWellhubService.getCard(ctx, userId)`: `null` sin `gympass_id`. Agregados al vuelo, sin columnas cacheadas.
  - Visitas Wellhub (`isWellhubAttendanceSql`, cubre `wellhub` y `wellhub_manual`) en una sola query: total, a mano, del mes (mes en curso en la tz de la sede de la persona con `todayInTz`), última fecha (`DATE_FORMAT` en SQL porque mysql2 devuelve `Date`) y primera visita.
  - Sedes visitadas: `selectDistinct` de nombres de sede, ordenadas.
  - Próxima reserva: `isWellhubBookingSql`, `reservado`, desde hoy (tz de la sede), la más cercana. Historial: últimas 10 por fecha desc, cualquier estado. Ambas con join `schedules` / `activities` / `branches` (la sede de la clase), `tenantWhere` en cada tabla.
  - `linkedSince` = la menor entre `MIN(wellhub_bookings.created_at)` y la primera visita Wellhub, en ISO; `null` sin rastro.
  - `showLabel` = `wellhubLabelVisibleSql(ctx)` (plan 07), `canConvert` = `showLabel`, `canMerge` = `isPureWellhub`, `hasLoggedIn` = existe fila en `member_logins` (helper privado compartido con `sendAppAccess`).
- `isPureWellhub(ctx, userId, executor)`: estado `wellhub` y sin suscripciones, sin `financial_transactions.member_id`, sin `balances.member_id`. `executor` es el db o la tx del llamador (el plan 10 pasa `tx`).
- `sendAppAccess`: valida existencia, borrado, rol `member`, `gympass_id` y email ANTES de resetear; lee `hadLoggedIn`; delega en `MemberService.resetMemberPassword` (única fuente de `MEMBER_TEMP_PASSWORD`).
- Rutas en `members/routes.ts` (servicio instanciado una vez en el plugin):
  - `GET /:userId/wellhub`: `assertTenant("members.wellhubCard")`, 404 uniforme para ausente / borrado / otro país.
  - `POST /:userId/app-access`: `assertTenant("members.appAccess")`, 403 inline salvo `MEMBER_LIFECYCLE_ROLES`, mismo 404, mapeo de razones a 400/404 con los textos pedidos. Mail `sendPasswordSetEmail` en try/catch, `request.log.info` con `hadLoggedIn`, las dos frases ("ya tenía cuenta" / "primer acceso"). Respuesta `{ ok, emailSent }`.
  - El chequeo "existe y está en alcance" se extrajo a un helper local (`isMemberVisibleToActor`) usado por las dos rutas nuevas; la ruta `PUT /:userId/password` NO se tocó.
- `members/schemas.ts`: `memberWellhubCardSchema` y `memberAppAccessSchema`; todos los campos de la card declarados.
- Tests: `member-card-app-access.test.ts` con los 6 `it` pedidos más 3 (card con `hasLoggedIn`, alumno Wellhub sin email, alumno inexistente). Los casos de aislamiento + control de ambas rutas están en `iso-03-members-ficha.test.ts` (sin escribir el literal del status "prohibido": el conteo de `403` en el archivo no cambió).
- Tenancy: manifiesto +2 entradas, `ENTRADAS_BASELINE` **478 -> 480** (y el título del `it`), `CASOS_BASELINE` **35 -> 37**. Valores leídos del repo antes de editar.

## Deviations from Plan

- **[Firma]** `isPureWellhub(ctx, userId, executor)` recibe `executor` como parámetro **requerido** (el plan lo marcaba opcional): es una función suelta y no tiene un db por defecto. El plan 10 ya la llama con `tx`; la card la llama con `this.db`.
- **[Extra]** 3 `it` adicionales en el test de la card/acceso (ver arriba) y un helper `isMemberVisibleToActor` en las rutas para no duplicar el bloque de 404.
- Co-Authored-By con `Claude Sonnet 5.5`.

## Bugs / observaciones no anticipadas

- `emailSent` solo significa "no hubo excepción". `EmailService.sendPasswordSetEmail` traga el error de Resend y también retorna sin hacer nada cuando no hay `RESEND_API_KEY`, así que `emailSent: true` puede ocurrir sin que salga un mail. Mismo comportamiento que el alta de socio; no se cambió `EmailService`.
- El visitante Wellhub se crea con email real del webhook, pero si Wellhub no mandó email la ficha queda con `email` NULL: `no_email` (400) cubre ese caso.
- `sendAppAccess` resetea la contraseña aunque la persona ya tuviera cuenta propia (`hadLoggedIn`): pisa la clave que eligió. Es lo que pide el plan (la UI advierte, plan 14); solo queda logueado.

## Known Stubs

Ninguno. La card en el admin llega en el plan 14.

## Dudas para Franco

- Los tests nuevos no se corrieron ni tipearon. Riesgos en CI: (1) `getCard` usa `wellhubLabelVisibleSql(ctx)` dentro de un `select` con `innerJoin(branches)`: el fragmento usa el literal `users.gympass_id` / `users.id` y subqueries con `tenant_id` inline, debería ir, pero no lo ejecuté; (2) el test de "sedes visitadas" inserta una segunda sede en `beforeAll` y la borra en `afterAll` (las sedes no se limpian en `cleanAllTestData`); si el borrado falla por una FK residual, queda una sede huérfana; (3) los asserts de login usan `getAuthToken` y el mensaje `Login failed` que lanza el helper; (4) `res.json().wellhub?.gympassId` en el ISO-03 depende de que `res.json()` sea `any` del tipo de `inject`.
- Tipos: `isPureWellhub` y la conversión del plan 08 tipan el ejecutor como `MySql2Database<typeof schema>` (precedente `invitation-access.ts`); el plan 10 le pasa un `TxHandle`. Si `vue-tsc`/`tsc` se queja de la asignación, ajustar el tipo del parámetro en un solo lugar.
- `visitsThisMonth` se calcula con `session_date >= primer día del mes` en la tz de la sede de la persona, no la de cada visita (una visita en otra sede con otra tz es un borde de horas el día 1).
- Prettier no se pudo confirmar (el orquestador formatea al final): las llamadas a `isMemberVisibleToActor` quedaron ya partidas a mano.

## Self-Check: PASSED

- `dbe971829`, `bf7ea66e5`, `03df51b68`: FOUND
- member-wellhub-service.ts, member-card-app-access.test.ts: FOUND; 9 `it(` en el test; ambas entradas en `tenant-manifest.ts`; conteo de `403` en `iso-03-members-ficha.test.ts` igual a HEAD~
- Baselines: 478 -> 480 y 35 -> 37
