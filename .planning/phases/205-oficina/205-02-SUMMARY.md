---
phase: 205-oficina
plan: 02
subsystem: api
tags: [fastify, drizzle, tenancy, oficina, rutas, tests]
requires: [205-01]
provides:
  - módulo `office` de la API con las 8 rutas de /api/admin/office
  - OfficeService (listado, detalle, crear, comentar, patch, visto, badge, staff, temas del sistema, despertar dormidos)
  - OFFICE_ROLES en shared/permissions.ts
  - 8 entradas tenant-scoped en el manifiesto ISO-01 (baseline 542 -> 550)
  - test/office/office-routes.test.ts (20 casos de integración)
affects: [205-03, 205-04, 205-05]
tech-stack:
  added: []
  patterns: [FOR UPDATE por tema para serializar mutaciones, timestamps de negocio truncados a segundos, agregados por lote en vez de subqueries correlacionadas]
key-files:
  created:
    - el-templo-api/src/modules/office/index.ts
    - el-templo-api/src/modules/office/types.ts
    - el-templo-api/src/modules/office/schemas.ts
    - el-templo-api/src/modules/office/service.ts
    - el-templo-api/src/modules/office/routes.ts
    - el-templo-api/test/office/office-routes.test.ts
  modified:
    - el-templo-api/src/modules/shared/permissions.ts
    - el-templo-api/src/app.ts
    - el-templo-api/test/tenant-manifest.ts
    - el-templo-api/test/tenancy/iso-01-manifiesto.test.ts
    - el-templo-api/test/fixtures/second-tenant.ts
key-decisions:
  - "Los timestamps de eventos, actividad y lecturas se truncan a segundos (las columnas son timestamp(0) y MySQL redondea), para que D-07 sea exacto."
  - "patchTopic y addComment toman el tema con SELECT ... FOR UPDATE dentro de la transacción."
requirements-completed: [D-05, D-06, D-07, D-08, D-09, D-10, api_contract]
completed: 2026-11-03
---

# Phase 205 Plan 02: Servicio y rutas de Oficina Summary

Módulo `office` de la API completo: 8 rutas bajo `/api/admin/office` (owner/admin/gestion; 403 para el resto), servicio con D-05..D-10, registro en `app.ts`, manifiesto ISO-01 y 20 tests de integración (escritos, no corridos: no hay MySQL local).

## Commits

- `efc265fa7` feat(205-02): servicio, tipos y schemas del modulo office
- `665377527` feat(205-02): rutas de Oficina, registro en app y manifiesto ISO-01
- `ec32bc0d3` test(205-02): integracion de las rutas de Oficina y limpieza office_* del gimnasio 2

## Verificación

- `npx tsc --noEmit` en `el-templo-api`: verde.
- `pnpm lint:tenant`: DISCREPANCIAS 0 (el primer intento dio 3 violaciones en `users`, ver abajo).
- `tsc -p tsconfig.test-check.json`: sin errores en los archivos tocados (hay errores preexistentes ajenos, p. ej. `test/wellhub/members-wellhub.test.ts`).
- Tests de integración: NO corridos (regla del plan). Los valida el CI.

## Contrato: lo que se respetó y lo que se agregó

Nombres de campos, códigos HTTP y semántica de las 8 rutas siguen `<api_contract>` del CONTEXT. Respuestas: GET/PATCH 200, POST /topics y POST /comments 201 (`{ topic }`), POST /seen 204, errores `{ error, message }` vía `handleServiceError`. Todas las rutas declaran `response` completo.

**Agregados aditivos (no rompen al admin, pero conviene saberlos):**

- Payload del evento `asignado` / `tomado`: `{ assigneeId, assigneeName }`. `assigneeName` ("Nombre Apellido") no está en el contrato; sirve para pintar la línea del hilo sin depender de `/staff` (que oculta a los deshabilitados).
- Payload del evento `desasignado`: `{ previousAssigneeId }`.
- Payload del evento `editado`: `{ fields: ["title"|"body", ...] }` (como el contrato).
- Payload `dormido`: `{ until }`; `reabierto` automático: `{ auto: true }` y `actor: null`.
- `POST /topics` y `PATCH` aceptan `body: null` para vaciar el contexto; `PATCH` acepta `note: null`.
- Crear con `assigneeId` emite dos eventos en el mismo pedido: `creado` y después `asignado` (o `tomado` si es uno mismo).
- `lastEvent.body` en el listado va completo (hasta 4000), sin recortar.

**Precisiones de semántica donde el contrato no decía nada:**

- `PATCH` sin cambios reales (mismo título, mismo responsable, cerrar un tema ya cerrado) no emite evento ni toca `last_activity_at`.
- `PATCH` con `snoozedUntil` (string) y `status` en el mismo pedido da 400.
- `snoozedUntil: null` sobre un tema dormido lo pasa a abierto con evento `reabierto`; sobre cualquier otro estado no hace nada.
- `snoozedUntil` se valida como fecha real (`2099-13-45` da 400, no solo el patrón). Sobre tema cerrado: 409 (se chequea antes que la fecha).
- `targetKind='socio'` verifica SIEMPRE que el socio exista en el tenant (404), aunque el cliente mande `targetLabel`.
- `branchId` inexistente o de otro gimnasio: 400 "La sede elegida no existe". `assigneeId` que no es staff activo del gimnasio: 400.
- Cerrar un tema dormido limpia `snoozed_until`.
- Staff válido (asignable, mencionable, `/staff`): `role` no en `member`/`tv`, `staff_disabled = false` y `deleted_at IS NULL`.

## API del servicio para el plan 03

- `createSystemTopic(ctx, input) -> number | null` (id nuevo, `null` si ya existía ese `source_key` en cualquier estado o si perdió la carrera contra la unique).
- `closeSystemTopic(ctx, sourceKey, reason) -> boolean` (evento `sistema`, actor NULL, bumpea `last_activity_at`).
- `listOpenSystemTopics(ctx, prefix) -> { id, sourceKey }[]`.
- `wakeDueTopics(ctx) -> number` (idempotente: el UPDATE exige `status='dormido'`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `limpiarSegundoGimnasio` no borraba las tablas `office_*`**
- **Found during:** Task 3 (test de aislamiento).
- **Issue:** el plan 01 registró las tablas en `TABLES_TO_CLEAN` pero no en el borrado local del gimnasio 2; un tema insertado con `TENANT_DOS` hubiera hecho reventar el `DELETE FROM users`/`tenants` posterior con FK.
- **Fix:** cuatro `DELETE ... WHERE tenant_id = TENANT_DOS` (menciones, lecturas, eventos, temas) antes del bloque de patrocinadores.
- **Files modified:** `el-templo-api/test/fixtures/second-tenant.ts` (no estaba en `files_modified` del plan).
- **Commit:** `ec32bc0d3`.

**2. [Rule 1 - Bug] `lint:tenant` marcaba 3 accesos a `users` en el servicio**
- **Found during:** Task 2.
- **Issue:** el helper `staffConditions()` devolvía el `tenantWhere` adentro de un array y el lint (juzga por statement) no lo veía.
- **Fix:** el helper pasó a `staffFilters()` (sin tenant) y cada query suma `tenantWhere(schema.users, ctx)` explícito.
- **Commit:** `665377527`.

### Otros desvíos menores

- El baseline del manifiesto (542 -> 550) y la entrada de changelog van tal cual el plan; el encabezado de sección del manifiesto se escribió como "Oficina (fase 205, prefijo admin/office)" para que `grep -c '/api/admin/office'` dé exactamente 8, como pide la verificación del plan.
- `createSystemTopic` devuelve el id (o null), el plan decía "devuelve null si ya existe" sin precisar el valor en el caso feliz.

## Decisiones de diseño dignas de nota

- **D-07 exacto:** `nowSeconds()` trunca a segundos porque MySQL redondea los milisegundos en `timestamp(0)`; sin eso `last_activity_at` podía quedar un segundo adelante de la lectura del actor y el comentario propio aparecía como "nuevo". Contracara: una acción ajena en el MISMO segundo que una vista no hace saltar el badge (aceptado; los tests esperan 1,1 s donde importa).
- **FOR UPDATE** por tema en `patchTopic`/`addComment`/`closeSystemTopic`: dos personas cerrando a la vez no duplican el evento.
- Agregados del listado por lote (comentarios, último evento) con `inArray` y no con subqueries correlacionadas (evita la trampa de columnas sin calificar de la skill de migraciones).

## Issues Encountered

- Sin MySQL local: ningún test de integración corrió. Riesgos que solo el CI confirma: collation de `LIKE` (los tests usan el mismo casing a propósito), `FOR UPDATE` con `LIMIT`, y el login de los usuarios de prueba.
- Los tests que comparan badge/lecturas usan `setTimeout` de 1100 ms (no hay polling ni loops de espera).

## Known Stubs

Ninguno.

## Threat Flags

Ninguno: todas las rutas leen el tenant de `assertTenant(request.scope)`, el body nunca lleva `tenantId`, y un tema de otro gimnasio responde 404 igual que uno inexistente (cubierto en el test de aislamiento, en ambos sentidos).

## Dudas para Franco

1. ¿Una acción propia sobre un tema debería también marcar leídas las menciones del actor en ese tema? Tomé la opción literal de D-07 (solo se upsertea la lectura; las menciones se leen con `POST /seen`). En la práctica el admin llama a `/seen` al abrir el tema, así que no se nota.

## Self-Check: PASSED

- Archivos creados presentes (office/*.ts, office-routes.test.ts).
- Commits `efc265fa7`, `665377527`, `ec32bc0d3` presentes en `feat/oficina`.
