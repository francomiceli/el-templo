---
phase: 201-conquer
plan: 05
subsystem: api
tags: [conquer, permissions, settings, catalog, unlock-request, moduleScope]
requires: ["201-04"]
provides:
  - "permissions.ts: CONQUER_MANAGER_ROLES, canManageConquer, canViewConquerPhotos (helper unico, D-08)"
  - "settings.ts: parametros conquer.* en tenant_settings con default en codigo (D-14)"
  - "catalog-service.ts: loadCatalog (4 queries) y planDays"
  - "member-service.ts: getConquerState, requestUnlock, listUnlockRequests, countUnlockRequests, resolveMemberTimezone"
  - "plugins conquerMemberRoutes / conquerAdminRoutes registrados con moduleScope templo-training"
  - "test/conquer/_helpers.ts: TEMPLO_CTX, createConquerStaff, insertConquerMember, clearConquerSettings"
affects: [201-06, 201-07, 201-08, 201-14, 201-15, 201-21]
tech-stack:
  added: []
  patterns: ["guard de plugin en onRequest con helper unico", "INSERT IGNORE sobre UNIQUE para idempotencia"]
key-files:
  created:
    - el-templo-api/src/modules/conquer/permissions.ts
    - el-templo-api/src/modules/conquer/settings.ts
    - el-templo-api/src/modules/conquer/catalog-service.ts
    - el-templo-api/src/modules/conquer/member-service.ts
    - el-templo-api/src/modules/conquer/schemas.ts
    - el-templo-api/src/modules/conquer/member-routes.ts
    - el-templo-api/src/modules/conquer/admin-routes.ts
    - el-templo-api/src/modules/conquer/index.ts
    - el-templo-api/test/unit/conquer-permissions.test.ts
    - el-templo-api/test/conquer/_helpers.ts
    - el-templo-api/test/conquer/requests.test.ts
  modified:
    - el-templo-api/src/app.ts
    - el-templo-api/test/tenant-manifest.ts
    - el-templo-api/test/tenancy/iso-01-manifiesto.test.ts
    - el-templo-api/test/migrations/0190-0191-tenants.test.ts
decisions:
  - "Manifiesto y ENTRADAS_BASELINE: 478 -> 482 (+4, templo-module). Tambien se agrego el bloque de header fechado de tenant-manifest.ts."
  - "getConquerState de un alumno activo sin activation_date devuelve blockWeek 1."
  - "requestedAt y activationDate viajan como string (ISO / YYYY-MM-DD); decimales no aparecen en este plan."
metrics:
  tasks: 3
  commits: 3
---

# Phase 201 Plan 05: Permisos, settings, catalogo y pedido de desbloqueo Summary

Esqueleto del modulo API de Conquer: helper unico de permisos (owner/admin), parametros `conquer.*` con default en codigo, carga del catalogo en 4 queries y las 4 rutas del circuito de desbloqueo (D-12, D-17), todo bajo `moduleScope("templo-training")`.

## Commits

- `cb1aa000c` feat(201-05): permisos unicos, settings conquer.* y carga del catalogo
- `d2c61f76d` feat(201-05): estado de Conquer y pedidos de desbloqueo (D-12, D-17)
- `cefe9174d` test(201-05): pedidos de desbloqueo, roles y aislamiento de Conquer

## Contratos JSON exactos de las 4 rutas (los usan 201-15 y 201-21)

`GET /api/members/conquer/state` y `POST /api/members/conquer/unlock-request` (sin body; un body con claves extra se descarta, `userId` incluido) -> 200:

```json
{
  "status": "bloqueado | pedido | activo",
  "requestedAt": "ISO-8601 | null",
  "member": null
}
```

Con `status: "activo"`, `member` es:

```json
{
  "level": "ternero | novillo | toro | null",
  "daysCount": 2,
  "incReps": 1,
  "incS": 2,
  "activationDate": "YYYY-MM-DD | null",
  "blockWeek": 1,
  "cutStage": 0,
  "publishEnabled": false,
  "publishNoFace": false
}
```

- Bloqueado: `{ status: "bloqueado", requestedAt: null, member: null }`. Pedido: `member: null`, `requestedAt` con valor. 201-07 le suma `home`, 201-12 `bodyCheck` (cada uno necesita su entrada en `conquerStateResponseSchema`, `schemas.ts`, o el serializador la borra).
- `POST /unlock-request` repetido o concurrente devuelve el mismo estado/`requestedAt` (una sola fila). Sobre un alumno `activo` no cambia nada.

`GET /api/admin/conquer/requests` (owner/admin) -> 200:

```json
{ "requests": [ { "userId": 1, "firstName": "", "lastName": "", "email": "", "branchName": "string | null", "requestedAt": "ISO-8601" } ] }
```

Orden: pedido mas viejo primero (desempate por id de fila). `GET /api/admin/conquer/requests/count` -> `{ "count": 0 }`.

Errores: rol sin permiso -> 403 `{ "error": "No tenés permiso para Conquer" }` (el hook corre antes del guard de modulo, asi que un socio o rol sin permiso de un gimnasio sin modulo ve 403, no 404); sin token 401; gimnasio sin `templo-training` -> 404.

## Manifiesto

`ENTRADAS_BASELINE` pasó de **478 a 482** (+4 entradas `templo-module`/`templo-training`). Actualicé también el título del `it` ("exactamente las 482 entradas"), el comentario fechado en `iso-01-manifiesto.test.ts` y el bloque de header de `tenant-manifest.ts`.

## Gates corridos

- Pre-flight `node_modules`: OK.
- `npx tsc --noEmit` (API): OK tras cada tarea.
- `pnpm lint:tenant`: `DISCREPANCIAS: 0` tras cada tarea.
- `pnpm typecheck:tests | grep -E "test/(conquer|unit/conquer|migrations/0290)"`: vacio.
- Higiene (`console.*`, `any`, userId desde body/query/params): sin hallazgos. `prettier --write` con rutas explicitas.
- `pnpm lint` NO existe en el API (solo hay `lint:tenant`; `pnpm lint` cae a un binario del sistema). No aplica a este plan (solo toca API).
- Vitest NO se corrio (regla de la fase). Los tests de `requests.test.ts` y `conquer-permissions.test.ts` corren en CI.

## Mutantes razonados

Cada mutante aplicado en produccion, revertido con `git checkout -- <ruta>` y `git diff` limpio.

1. `CONQUER_MANAGER_ROLES = ["owner","admin","coach"]`. Corrido con `node` por type-stripping: `canManageConquer({role:"coach"})` devolvio `true`. En CI fallan `conquer-permissions.test.ts:28-31` (`it.each` del rol `coach`, `toBe(false)`) y `requests.test.ts:356-367` (`it.each` coach, `toBe(403)` en linea 366).
2. `requestUnlock` con `INSERT` plano en vez de `.ignore()`. El segundo POST choca con el UNIQUE (tenant, user) y el handler responde 500: falla `requests.test.ts:198-206` (segundo POST `toBe(200)`) y `209-219` (`Promise.all`, ambos `toBe(200)`).
3. `getConquerState` que exige plan activo (devuelve bloqueado/403 sin suscripcion). Falla `requests.test.ts:124-134` (`createTestMember` sin plan, `status: "bloqueado"` con `requestedAt` y `member` en `null`, y el POST de las lineas 138+ que espera `pedido`).
4. `listUnlockRequests` y `countUnlockRequests` sin `eq(status, "pedido")`. Falla `requests.test.ts:331-352` (alumno `activo` no debe aparecer: `{ requests: [] }` linea 351 y `{ count: 0 }` linea 352).
5. `parseConquerSettings` sin chequeo de rango (`value >= range.min && value <= range.max ? value : def` -> `value`). Falla `conquer-permissions.test.ts:90` (fila "offset ternero fuera de rango (9)" espera 2) y las filas de `combo_weeks_n` 0 y 9.
6. `listUnlockRequests` sin `tenantWhere` en `conquerMembers` Y en el join de `users`. Falla `requests.test.ts:413-457` (con modulo prendido en el gimnasio 2, `lista1` incluiria a `socio2`: `toEqual([socio1.id])` linea 453). Ojo: quitando SOLO el `tenantWhere` de `conquerMembers` el mutante sobrevive porque el `tenantWhere(users)` del `innerJoin` lo tapa (defensa en profundidad, no se considera hueco del test).

## Desvios del plan

Ninguno de fondo. Notas:

- `canManageConquer` recibe `member` pero no lo usa (`void member`): se conserva para la apertura a coach (D-08) sin cambiar call-sites.
- El caso (8) del plan se resolvio con el fixture real: el gimnasio 2 nace SIN flags, asi que las 4 rutas dan 404; ademas prendi `templo-training` en el gimnasio 2 (`setModuleFlag`, restaurado con `clearModuleFlags` en `afterEach`) y verifique que cada gimnasio solo ve sus propios pedidos y que el alumno del gimnasio 2 no hereda el estado del gimnasio 1.
- Agregue tests extra: tamper de `userId` en el body (T-201-14), alumno ya activo que vuelve a tocar el boton, alumno activo sin fecha de activacion (`blockWeek` 1), orden mas viejo primero, `403` para socio y `401` sin token.
- La validacion 400 (d) no aplica: las rutas nuevas no tienen body con campos; Fastify descarta claves extra en vez de rechazarlas, por eso se testea el descarte (T-201-14).

Ambiguedades nuevas (opcion mas simple):

- Alumno `activo` sin `activation_date`: `blockWeek = 1`.
- `requestedAt` se serializa como ISO-8601 a partir del `Date` de Drizzle (`datetime` en modo date).
- `listUnlockRequests` devuelve `firstName`/`lastName`/`email` como `""` si la columna es `NULL`.

## Trampas / notas para los planes siguientes

- Orden de hooks: el hook de plugin (`addHook onRequest` del admin) corre ANTES del guard de modulo que `moduleScope` agrega a cada ruta, por eso un rol sin permiso recibe 403 incluso en un gimnasio sin el modulo. Para probar el 404 hay que usar owner/admin.
- `attachCountryScope` se llama una vez en el hook del plugin admin; los handlers de admin solo hacen `assertTenant(request.scope, ...)`. Las rutas del alumno llaman `attachCountryScope` en cada handler.
- Para escribir con `tenantValues` desde un test de otro gimnasio: `tenantValues({ tenantId: TENANT_DOS }, {...})`. `cleanAllTestData` vacia `conquer_members` de TODOS los gimnasios antes de `seedSecondTenant`.
- `insert(...).ignore().values(...)` de Drizzle 0.45 emite `INSERT IGNORE`; el sentinel de tenancy lo acepta con `tenant_id` en los valores.
- `getConquerState` hace 1 query (+1 de zona horaria solo si el alumno esta `activo`); `resolveMemberTimezone` joinea `users` -> `branches` con `tenantWhere` en ambos.
- `loadCatalog` devuelve `Map`s y `rungs` ya ordenados por `position` asc; `planDays` filtra por `daysCount` y ordena por `sortOrder`. Las columnas JSON se normalizan con type guards (descartan elementos mal formados en silencio).
- `getConquerSettings` es de solo lectura; `saveConquerSettings` y su validacion los agrega 201-14 (reusar `CONQUER_SETTING_KEYS` y `CONQUER_SETTING_RANGES`).
- `test/migrations/0190-0191-tenants.test.ts`: el prefijo `conquer.%` ya esta en `KNOWN_KEY_PATTERNS`; no volver a tocarlo.
- El API no tiene script `lint`; los gates locales del API son `tsc`, `lint:tenant` y `typecheck:tests`.

## Known Stubs

Ninguno.

## Self-Check: PASSED

Los 11 archivos creados existen; los commits `cb1aa000c`, `d2c61f76d` y `cefe9174d` estan en `git log`.
