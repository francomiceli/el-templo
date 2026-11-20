---
phase: 215-regalar-aura
plan: 02
subsystem: api-db
tags: [bandeja, notificaciones, migracion, tenancy, drizzle]
requires: ["215-01"]
provides:
  - tabla `member_notifications` (migración 0350), gym-owned strict en el módulo `notifications`
  - columnas `inbox_kind` e `inbox_ref_id` en `pending_notifications` (migración 0351)
  - schema `memberNotifications` y tipos MemberNotificationRow, NewMemberNotificationRow
affects: [215-12, 215-13, 215-14]
tech-stack:
  added: []
  patterns:
    [
      tabla strict nueva dentro de un módulo strict existente,
      UNIQUE con columna NULL como clave de idempotencia,
    ]
key-files:
  created:
    - el-templo-api/src/db/migrations/0350_member_notifications.sql
    - el-templo-api/src/db/migrations/0351_pending_notifications_inbox.sql
    - el-templo-api/src/db/schema/member-notifications.ts
    - el-templo-api/test/migrations/0350-0351-inbox.test.ts
  modified:
    - el-templo-api/src/db/schema/notifications.ts
    - el-templo-api/src/db/schema/index.ts
    - el-templo-api/src/db/tenant-tables.ts
    - el-templo-api/test/db/tenant-tables.test.ts
    - el-templo-api/test/migrations/0192-0195-tenant-columns.test.ts
    - el-templo-api/test/migrations/0196-tenant-unique-contracts.test.ts
    - el-templo-api/test/helpers.ts
    - el-templo-api/test/fixtures/second-tenant.ts
key-decisions:
  - "Numeración 0350 y 0351 verificada con git fetch: origin/master y origin/staging terminan en 0343, la rama en 0349"
  - "Sin FK a pending_notifications (se purga a las 24 h): la bandeja le sobrevive"
requirements-completed: [SC-6, D-17, D-18, D-19]
duration: 20 min
completed: 2026-11-18
---

# Fase 215 Plan 02: bandeja de avisos Summary

Tabla `member_notifications` (migración 0350) con la bandeja de cada persona y dos columnas nuevas en la cola de avisos (migración 0351), con dos candados anti-duplicado en la base y todos los gates de tenancy movidos en el mismo plan.

## Tareas

| Tarea | Commit                                                                                                                      | Contenido                                                                                            |
| ----- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 1     | `b8ad66766` feat(215-02): bandeja member_notifications (mig 0350) y columnas de bandeja en pending_notifications (mig 0351) | las dos migraciones, `member-notifications.ts`, columnas en `notifications.ts`, export en `index.ts` |
| 2     | `9638e4854` test(215-02): gates de tenancy de member_notifications y test de las migraciones                                | registro de tenancy, conteos, limpieza, test 0350-0351 (8 `it`)                                      |

## Qué quedó

- `member_notifications`: 16 columnas, 2 FKs nombradas (`fk_member_notifications_tenant|user`, la del usuario con CASCADE), 2 UNIQUE y 3 índices. Sin FK a la cola a propósito.
- UNIQUE `(tenant_id, pending_notification_id)`: un reintento del barrido no duplica el aviso. UNIQUE `(tenant_id, user_id, dedupe_key)`: un job que vuelve a pedir el aviso de quien no tiene push tampoco lo duplica. Los NULL no chocan (las filas que vienen de la cola dejan `dedupe_key` en NULL).
- Índices: `idx_member_notifications_tenant_user_shown`, `..._tenant_user_read` y `idx_member_notifications_shown` (sin `tenant_id` a propósito, es para la purga de 90 días entre gimnasios).
- `shown_at` es el momento desde el que se ve el aviso (el envío, o la hora programada para quien no tiene push): la lista y el contador filtrarán `shown_at <= NOW()` (planes 12 a 14).
- `destination_type` es `varchar(20)` y no enum, para no duplicar el enum de la cola.
- `pending_notifications` suma al final `inbox_kind` varchar(32) NULL e `inbox_ref_id` int NULL.
- Tenancy: `member_notifications` en `GYM_OWNED_TABLES` y en `TENANT_STRICT_MODULES.notifications` (y su espejo `MODULOS_DECLARADOS`); `schema.memberNotifications` en `TABLES_TO_CLEAN` (antes de `users`) y `DELETE FROM member_notifications` en `limpiarSegundoGimnasio`.
- Test `0350-0351-inbox.test.ts` con 8 `it`: columnas y defaults, FKs, UNIQUE e índices con su orden de columnas, choque por `pending_notification_id` (y los NULL no chocan), choque de `dedupe_key` (en un `it` propio), la misma clave en dos usuarios no choca, `dedupe_key` NULL no choca, columnas nuevas de la cola, guard de `;` en comentarios de los dos `.sql`. Nunca corrió local (queda para CI).

## Conteos movidos (viejo a nuevo, verificados antes de sumar)

| Dónde                                               | Viejo     | Nuevo     |
| --------------------------------------------------- | --------- | --------- |
| `GYM_OWNED_TABLES.length` (`tenant-tables.test.ts`) | 137       | 138       |
| `schemaTables.size` (`tenant-tables.test.ts`)       | 142       | 143       |
| `gymOwnedChecked` (0192-0195, Test 2)               | 137       | 138       |
| `gymOwnedChecked` (0196, Test 10, `toBe` y mensaje) | 137       | 138       |
| títulos de los `it` (tres archivos)                 | 137 / 142 | 138 / 143 |

`grep` de `toBe(137)`, `toBe(142)` en los tres archivos: vacío.

## Control posterior

- API `npx tsc --noEmit`: 0 (base 0).
- `pnpm lint:tenant`: DISCREPANCIAS 0.
- `pnpm typecheck:tests`: 18 discrepancias, las mismas de la línea de base heredada; ninguna en los archivos tocados (`grep` por `inbox`, `tenant-tables`, `0192-0195`, `0196-tenant`, `helpers`, `second-tenant`: 0 resultados).
- Comentarios SQL de la 0350 y la 0351 sin `;`. Migraciones NO aplicadas en la base local.
- App y admin: no se tocaron ni se corrieron. Sin cambios en dependencias, sin push, sin bump de versión.

## Desvíos respecto del plan

Ninguno de fondo. Al formatear `notifications.ts`, prettier también reacomodó tres bloques ajenos (`notificationTemplateKindEnum`, `createdBy` y `templateId`): solo cambio de formato, el mismo que habría hecho lint-staged al commitear.

## Decisiones propias

- Orden alfabético: `member_notifications` quedó entre `member_notes` y `member_photos` en `GYM_OWNED_TABLES`, y entre `device_tokens` y `notification_preferences` en el módulo `notifications`.
- En el test, los defaults NULL de `INFORMATION_SCHEMA` se aceptan como `null` o `"NULL"` y el tipo `int` como `/^int/`, para no depender de la versión del motor.

## Lecciones para los planes siguientes

- La bandeja se escribe con `tenantValues` y cada `.where(...)` lleva `tenantWhere` literal (strict). `dedupe_key` va NULL cuando el aviso sale de la cola y con la clave de `inboxDedupeKey` cuando no hay cola.
- `pending_notifications.inbox_kind` e `inbox_ref_id` son NULL en las filas viejas: el barrido los copia a `kind` y `ref_id`, y cae en `kind = 'otro'` si vienen NULL.
- La lista y el contador de la bandeja filtran `shown_at <= NOW()`; la purga de 90 días usa `idx_member_notifications_shown`.
- Cualquier tabla nueva vuelve a mover los 4 conteos (138 y 143 hoy) y los dos listados de limpieza.

## Self-Check: PASSED

Archivos creados y commits `b8ad66766` y `9638e4854` verificados.
