---
phase: 215-regalar-aura
plan: 12
subsystem: api-notifications
tags: [bandeja, avisos, idempotencia, member_notifications]
requires: ["215-11"]
provides:
  - "Reglas puras de la bandeja: cursor, tipo de aviso y clave anti-duplicado"
  - "`InboxService` con escritura idempotente (`recordFromQueue`, `recordDirect`, `markReadByPending`, `purgeOld`)"
affects: [215-13, 215-14, 215-15]
tech-stack:
  added: []
  patterns:
    [
      onDuplicateKeyUpdate con id = id para insertar sin duplicar,
      errores de la bandeja atrapados y logueados,
    ]
key-files:
  created:
    - el-templo-api/src/modules/notifications/inbox-rules.ts
    - el-templo-api/src/modules/notifications/inbox-service.ts
    - el-templo-api/test/unit/notifications-inbox-rules.test.ts
  modified:
    - .planning/phases/215-regalar-aura/215-EJECUTORES.md
key-decisions:
  - "Idempotencia con `onDuplicateKeyUpdate({ set: { id: sql`id` } })` en vez de capturar el error de clave duplicada"
requirements-completed: [SC-6, D-17, D-18]
duration: 15 min
completed: 2026-11-18
---

# Fase 215 Plan 12: escritura de la bandeja, primera mitad Summary

Existe un único lugar puro que define el cursor `"<epochMs>.<id>"`, el tipo de aviso y la clave anti-duplicado, y un servicio que guarda avisos en `member_notifications` sin duplicarlos ni por reintento del barrido ni por reintento de un job.

## Tareas

| Tarea | Commit      | Asunto                                            |
| ----- | ----------- | ------------------------------------------------- |
| 1 RED | `4955fd21f` | test(215-12): reglas de la bandeja (rojo)         |
| 1     | `b06db1a44` | feat(215-12): reglas puras de la bandeja          |
| 2     | `6d9519e1c` | feat(215-12): servicio de escritura de la bandeja |

## Qué quedó

- `inbox-rules.ts`: constantes (90 días, página 30 y máximo 50, tipo `aura_gift`, clave de hasta 160), `formatInboxCursor`/`parseInboxCursor` (rechaza vacío, partes de más, negativos, id 0 y texto), `inboxKindFor` (explícito, categoría u `otro`, cortado a 32) e `inboxDedupeKey` (plantilla con reserva `t:<key>:b<id>`, plantilla y aviso suelto sin referencia con día UTC y huella sha1 de 16 hex del texto, aviso suelto con referencia `a:<tipo>:<id>`, y `h:` + sha1 completo si pasa de 160). No importa nada de `db/`.
- `inbox-service.ts`: `recordFromQueue` (copia el `tenant_id` de la fila de la cola), `recordDirect` (`dedupeKey: string` obligatorio, `tenantValues(ctx)`), `markReadByPending` (exige el `user_id` del token y solo toca filas sin leer) y `purgeOld` (90 días, todos los gimnasios, devuelve `affectedRows`). Todo error de escritura se atrapa y se loguea `warn` sin textos.
- Test unitario: 27 `it` en verde con la config unitaria; el commit rojo anterior falló por falta del módulo.

## Control posterior

- API `npx tsc --noEmit`: 0. `pnpm lint:tenant`: DISCREPANCIAS 0 (3 exenciones nuevas en `inbox-service.ts`, las de `recordFromQueue`, `markReadByPending` y `purgeOld`).
- App y admin no tocados. Sin migración, sin cambios en dependencias, sin bump, sin push. Worktree limpio salvo el `.tsv` ajeno.
- No hay test de integración de este plan (lo escribe el plan 13), así que nada queda pendiente para CI.

## Desvíos respecto del plan

Ninguno.

## Decisiones propias

- La idempotencia usa `onDuplicateKeyUpdate` con `id = id` (no cambia nada) en lugar de `INSERT IGNORE`: `IGNORE` también traga errores que no son de clave duplicada (truncado de datos, FK), y acá un error real tiene que verse en el log.
- `markReadByPending` solo actualiza filas con `read_at IS NULL`, para que reabrir la push no corra la hora de lectura.
- `recordDirect` pasa `category: null` a `inboxKindFor`: el `kind` es lo que decide quien llama.

## Lecciones para los planes siguientes

- El plan 13 debe armar la clave con `inboxDedupeKey` y pasarla a `recordDirect`; las filas de la cola dejan `dedupe_key` en NULL (los NULL no chocan en el UNIQUE).
- `InboxService` toma `(db, log)` con `log` de Fastify; `purgeOld` se engancha en el cron que ya llama a `purgeOldNotifications`.
- `inboxDedupeKey` usa el día en UTC: no sirve para mostrar fechas.
- Un `sql` suelto con `${schema.memberNotifications.col}` en un `.where` necesita la exención `/* tenant-safe */` también dentro del propio `sql`, igual que `recordOpened`.

## Self-Check: PASSED

Archivos y commits `4955fd21f`, `b06db1a44` y `6d9519e1c` verificados.
