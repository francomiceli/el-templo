---
phase: 193-comunicaciones
plan: 06
subsystem: api
tags: [communications, push, fcm, destination, drizzle, vitest, tenancy]

# Dependency graph
requires:
  - phase: 193-01
    provides: "destinations.ts (APP_SECTIONS, validateDestination, fallbackRouteFor, DEFAULT_WHATSAPP_TEXT, validateWhatsAppText)"
provides:
  - "Columnas destination_type/destination_section/whatsapp_text en notification_templates y pending_notifications (migración 0218), route intacto como fallback (D-04)"
  - "buildPushData (service.ts): payload FCM puro, route SIEMPRE presente + destination/destinationSection/whatsappText solo cuando corresponde, testeado end-to-end"
  - "PUT /admin/templates/:id y POST /admin/send-segment validan destination contra la lista curada (validateDestination), 400 en destino/texto inválido o body viejo con route"
affects: [193-08, 193-09]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Espejo de enum sin paquete compartido: destinationTypeEnum (notifications.ts) duplica el vocabulario de DestinationType (destinations.ts) — mismo criterio ya usado por los espejos admin/app del plan 01"
    - "route como fallback derivado (nunca aceptado directo del body): las rutas admin computan route = fallbackRouteFor(destination) server-side, D-04"
    - "sendToDevice recibe la fila entera de pending_notifications (no un route suelto) para poder armar el payload completo con buildPushData"

key-files:
  created:
    - el-templo-api/src/db/migrations/0218_notifications_destination.sql
    - el-templo-api/test/notifications-destination.test.ts
  modified:
    - el-templo-api/src/db/schema/notifications.ts
    - el-templo-api/src/modules/notifications/routes.ts
    - el-templo-api/src/modules/notifications/service.ts
    - el-templo-api/src/modules/notifications/types.ts

key-decisions:
  - "`destination` es OPCIONAL en el schema de POST /admin/send-segment (no required) — hacerlo required rompía notifications.test.ts (existente, sin tocar): Fastify valida el body ANTES de que el handler llegue al chequeo de rol, así que 4 tests que no mandan `destination` (incluido el de member->403) hubieran recibido 400 de schema en vez de su código esperado. Sin `destination`, el handler usa el mismo default de siempre (`app_section`/`mi_templo` == '/mi-templo')."
  - "En PUT /admin/templates/:id, `destination` es opcional (partial update, mismo patrón que title/body/isEnabled) — un PUT que solo cambia el título no toca el destino."
  - "queueNotification (basado en template) propaga destinationType/destinationSection/whatsappText del template a la fila encolada — sin esto, editar el destino de un template vía PUT no tendría ningún efecto en la push real (Rule 2, ver Deviations)."
  - "Un whatsappText vacío/solo-espacios en el body se normaliza a null ANTES de validateDestination (normalizeDestinationInput) — un string vacío significa 'usá el default global' (D-02), no un error de validación."

patterns-established:
  - "buildPushData: función pura sin `db`/`this`, testeada con inputs en memoria — mismo criterio de 'módulo puro compartido' que destinations.ts del plan 01."

requirements-completed: [COM-01]

# Metrics
duration: ~70min
completed: 2026-09-02
---

# Phase 193 Plan 06: Destino común en la notificación push Summary

**Migración 0218 agrega destino curado a `notification_templates`/`pending_notifications` (route intacto como fallback D-04); las dos rutas admin de push validan `destination` server-side contra la lista curada y `buildPushData` arma el payload FCM compatible hacia atrás, con 14 tests nuevos y cero regresión en los 43 tests existentes de notifications.**

## Performance

- **Duration:** ~70 min
- **Tasks:** 3/3
- **Files modified:** 6 (2 nuevos + 4 modificados)

## Accomplishments

- Migración `0218_notifications_destination.sql`: `destination_type` (enum `app_section`|`whatsapp_sales`, default `app_section`), `destination_section` (varchar 40, nullable), `whatsapp_text` (varchar 300, nullable) en las dos tablas de push; `route` se conserva byte-for-byte como columna de fallback (D-04). Sin backfill (el default + `route` existente ya describen las filas viejas). Idempotente (`pnpm db:migrate` re-corrido: "No new migrations to apply").
- `PUT /api/notifications/admin/templates/:id` y `POST /api/notifications/admin/send-segment`: el body ya no acepta `route` de texto libre (`additionalProperties: false` en el JSON Schema — un body viejo con `route` da 400 del propio schema, nunca se ignora en silencio, T-193-21); en su lugar `destination: { type, section, whatsappText }` validado con `validateDestination` (400 con el motivo si es inválido).
- `buildPushData` (service.ts, exportada, pura): arma el `data` de FCM con `route`/`notificationId` SIEMPRE presentes, más `destination`/`destinationSection`/`whatsappText` cuando corresponde y no son null — nunca agrega una clave con valor `undefined` (requisito FCM). `sendToDevice` la usa, recibiendo la fila entera de `pending_notifications` en vez de un `route` suelto.
- `queueNotification` y `queueAdHocNotification` propagan el destino (del template o del caller) a la fila encolada, calculando `route` con `fallbackRouteFor` cuando hay un `destination` — sin esto, el destino validado en las rutas admin nunca llegaría al payload real de la push.
- 14 tests nuevos en `notifications-destination.test.ts`: 4 unitarios de `buildPushData` (fallback de app vieja → `/mi-templo`, default global de WhatsApp, ninguna clave con valor no-string) + 10 de integración (400 en sección inválida / texto con link / body viejo con `route`, 200 con `route` = fallback correcto para `app_section` y `whatsapp_sales`, `send-segment` encola `destination_type`+`route` correctos, compat sin `destination`, coach/member → 403). Todos verdes.
- Verificación de no-regresión: `notifications.test.ts` (existente, **sin modificar**) 37/37 verde; `notification-plan-renewal.test.ts` 6/6 verde. `tsc --noEmit` 0, `pnpm lint:tenant` DISCREPANCIAS: 0 (3 corridas).

## Task Commits

Each task was committed atomically on `feat/193-comunicaciones` en el worktree `~/projects/et-193`:

1. **Task 1: Columnas de destino + migración 0218 + aplicar** - `ce14cfb9` (feat)
2. **Task 2: Validación del destino en rutas admin + payload FCM compatible** - `fbb215e8` (feat)
3. **Task 3: Tests de destino y de compatibilidad hacia atrás** - `e4d251f9` (test, incluye el fix de Rule 1 sobre `send-segment`)

**Plan metadata:** Este SUMMARY se escribe en el checkout principal sin commitear (lo commitea el orquestador). Worktree `et-193` limpio (`git status --short` vacío) al terminar.

## Files Created/Modified

- `el-templo-api/src/db/migrations/0218_notifications_destination.sql` - 2 `ALTER TABLE` (una por tabla de push), header con D-01/D-02/D-04/D-05, verificación de numeración
- `el-templo-api/src/db/schema/notifications.ts` - `destinationTypeEnum` + 3 columnas nuevas en `notificationTemplates` y `pendingNotifications`
- `el-templo-api/src/modules/notifications/routes.ts` - `destination` reemplaza `route` en los 2 JSON Schemas admin; `validateDestination`/`fallbackRouteFor`/`normalizeDestinationInput` en los 2 handlers
- `el-templo-api/src/modules/notifications/service.ts` - `buildPushData` (exportada, pura); `sendToDevice` recibe la fila completa; `queueNotification`/`queueAdHocNotification` propagan destino
- `el-templo-api/src/modules/notifications/types.ts` - `QueueAdHocInput.destination?: Destination`
- `el-templo-api/test/notifications-destination.test.ts` - 14 tests nuevos (4 unit + 10 integración)

## Decisions Made

Ver `key-decisions` en el frontmatter. Resumen: `destination` opcional en `send-segment` (required rompía tests existentes por el orden schema-antes-que-rol de Fastify), opcional también en el PUT de template (partial update), propagación del destino del template a `queueNotification` (Rule 2), normalización de `whatsappText` vacío a `null` antes de validar (D-02).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `destination` NO puede ser `required` en `sendSegmentSchema`**

- **Found during:** Task 3, al correr `notifications.test.ts` (no-regresión) tras implementar la Task 2 con `destination` required.
- **Issue:** Fastify valida el `body` contra el JSON Schema ANTES de que el handler llegue al chequeo de rol (`onRequest: [authenticate]` corre, pero la validación de schema es anterior al código del handler). 4 tests existentes de `notifications.test.ts` mandan `POST /admin/send-segment` sin `destination` (incluido el que espera 403 con token de member) — con `destination` required, esos requests fallaban con 400 de schema antes de que el handler pudiera devolver 403/200 según el caso, rompiendo la no-regresión exigida por el plan.
- **Fix:** `destination` pasa a opcional en el schema; el handler usa un default (`{ type: "app_section", section: "mi_templo", whatsappText: null }`) cuando no viene, equivalente al `route ?? "/mi-templo"` que reemplazó. El `additionalProperties: false` se mantiene — un body viejo con `route` sigue dando 400 (T-193-21 no se debilitó).
- **Files modified:** `el-templo-api/src/modules/notifications/routes.ts`
- **Verification:** `notifications.test.ts` 37/37 verde (incluidos los 4 casos afectados); `notifications-destination.test.ts` agrega un test explícito para el caso sin `destination` (compat).
- **Committed in:** `e4d251f9` (Task 3 commit)

**2. [Rule 2 - Missing functionality] `queueNotification` no propagaba el destino del template a la fila encolada**

- **Found during:** Task 2, al diseñar `buildPushData` — noté que el plan solo pedía explícitamente propagar destino en `queueAdHocNotification`, pero `queueNotification` (el camino de las plantillas, el mismo que expone `PUT /admin/templates/:id`) seguía insertando `pending_notifications` sin `destinationType`/`destinationSection`/`whatsappText`.
- **Issue:** Sin este cambio, editar el destino de una plantilla vía la ruta recién validada (Task 2) no tendría NINGÚN efecto en la push real — el propósito completo del plan (D-05: "el destino se valida... y viaja en la push") quedaría roto silenciosamente para el camino más común (plantillas automáticas), aunque sí funcionara para el envío a segmento.
- **Fix:** El insert de `queueNotification` copia `destinationType`/`destinationSection`/`whatsappText` del template (o `app_section`/`null`/`null` cuando hay `routeOverride`, mismo criterio que ya regía para `route` en ese caso).
- **Files modified:** `el-templo-api/src/modules/notifications/service.ts`
- **Verification:** `tsc --noEmit` 0; `notifications.test.ts` (que ejercita `queueNotification` extensivamente) 37/37 verde sin cambios de comportamiento observable (los campos nuevos no rompen ninguna aserción existente).
- **Committed in:** `fbb215e8` (Task 2 commit)

---

**Total deviations:** 2 auto-fijadas (1 Rule 1 bloqueante para no-regresión, 1 Rule 2 de funcionalidad faltante crítica para el objetivo del plan)
**Impact on plan:** Sin impacto negativo — ambas correcciones son necesarias para que el plan cumpla su propio objetivo (D-05 end-to-end) y su propia restricción (no tocar `notifications.test.ts`).

## Issues Encountered

Ninguno bloqueante. Los 3 comandos de vitest corrieron en foreground con `timeout: 580000` en la herramienta Bash — dos de ellos (`notifications.test.ts`, `notification-plan-renewal.test.ts`) superaron los 120s por defecto del harness de Bash pese al parámetro pasado (backgroundeo automático); se recuperó el resultado leyendo el archivo de output persistido tras la notificación del harness, sin pérdida ni reintento — mismo patrón ya documentado en los SUMMARYs 01 y 05 de esta fase.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **Para el plan 08 (admin, tab Push):** las columnas nuevas son `destination_type` (enum `app_section`|`whatsapp_sales`), `destination_section` (varchar 40, la `AppSectionKey` curada) y `whatsapp_text` (varchar 300) en `notification_templates` y `pending_notifications` — camelCase Drizzle: `destinationType`, `destinationSection`, `whatsappText`. El body de `PUT /admin/templates/:id` y `POST /admin/send-segment` acepta `destination: { type, section, whatsappText }` (mismo shape que `Destination` de `modules/communications/destinations.ts`) — el UI debe mandar ese objeto completo, no `route`. `POST /admin/send-segment` acepta `destination` opcional (default `mi_templo`) por compat, pero el editor nuevo debería mandarlo siempre.
- **Para el plan 09 (app, `/contacto-ventas` y tap de push):** las keys del payload `data` de FCM son `route` (fallback, SIEMPRE presente — app vieja lo usa tal cual), `notificationId` (SIEMPRE presente, string), `destination` (SIEMPRE presente si la app es nueva y sabe leerlo: `'app_section'` o `'whatsapp_sales'`), `destinationSection` (SOLO presente cuando `destination === 'app_section'` Y hay una sección curada asociada — puede faltar), `whatsappText` (SOLO presente cuando `destination === 'whatsapp_sales'`, ya resuelto al default global si el admin no puso uno propio). La app nueva debe leer `data.destination` primero y resolverlo con su propio espejo de `destinations.ts` (`el-templo-app/src/config/destinations.ts`, del plan 01), cayendo a `data.route || '/mi-templo'` si `destination` no vino o no matchea nada conocido — igual que ya especifica el `193-PATTERNS.md`.
- Nada bloquea el siguiente plan de la fase: worktree limpio, `feat/193-comunicaciones` con 21 commits nuevos sobre `origin/master` `7c273a15` (3+3+3+4+8 de los planes 01-05 + 3 de este).

---

## Self-Check: PASSED

- `el-templo-api/src/db/migrations/0218_notifications_destination.sql` — FOUND
- `el-templo-api/test/notifications-destination.test.ts` — FOUND
- Commit `ce14cfb9` — FOUND
- Commit `fbb215e8` — FOUND
- Commit `e4d251f9` — FOUND
- `.planning/phases/193-comunicaciones/193-06-SUMMARY.md` — FOUND

_Phase: 193-comunicaciones_
_Completed: 2026-09-02_
