---
phase: 215-regalar-aura
plan: 13
subsystem: api-notifications
tags: [bandeja, avisos, cola, idempotencia, member_notifications]
requires: ["215-12"]
provides:
  - "Cada aviso de la cola se guarda en la bandeja antes del chequeo de dispositivo"
  - "Quien no tiene push guarda sus avisos personales desde la hora programada, sin duplicar"
  - "Tipo de aviso (`inboxKind`/`inboxRefId`) en la cola, en Novedades y en los avisos sueltos"
  - "Abrir la push marca leído su aviso y la purga a 90 días corre en el cron existente"
affects: [215-14, 215-15]
tech-stack:
  added: []
  patterns:
    [
      bandeja escrita antes del chequeo de tokens y sin frenar la push,
      clave anti-duplicado en la rama sin dispositivo,
    ]
key-files:
  created:
    - el-templo-api/test/notifications/inbox-queue.test.ts
  modified:
    - el-templo-api/src/modules/notifications/service.ts
    - el-templo-api/src/modules/notifications/types.ts
    - el-templo-api/src/modules/communications/novedades-push.ts
    - el-templo-api/src/jobs/notification-cron.ts
key-decisions:
  - "La purga de la bandeja se expone como `NotificationService.purgeOldInbox()` y el cron la llama del mismo objeto que `purgeOldNotifications`"
requirements-completed: [SC-6, D-17, D-18]
duration: 25 min
completed: 2026-11-18
---

# Fase 215 Plan 13: escritura de la bandeja, segunda mitad Summary

La bandeja guarda ahora todo lo que la app manda de ahora en más, una sola vez por aviso: lo que sale por la cola (el barrido lo copia antes de mirar si hay dispositivo) y lo que hoy se descarta por falta de push (se guarda directo, con clave anti-duplicado).

## Tareas

| Tarea | Commit      | Asunto                                                  |
| ----- | ----------- | ------------------------------------------------------- |
| 1     | `58db2e9ec` | feat(215-13): la cola guarda cada aviso en la bandeja   |
| 2     | `2de268cc0` | test(215-13): integración de la escritura de la bandeja |

## Qué quedó

- `service.ts`: el constructor crea `InboxService`. `processQueue` hace una consulta previa de categorías de plantilla (solo para filas sin `inboxKind`, con exención `tenant-safe`) y llama a `recordFromQueue` por cada fila vencida antes de buscar tokens. `queueNotification` resuelve género y textos antes del chequeo de dispositivo; sin dispositivo guarda con `recordDirect` y la clave `inboxDedupeKey({ source: "template", ... })` y sigue devolviendo -1. `queueAdHocNotification` hace lo mismo con `source: "adhoc"`. Los dos INSERT a la cola llevan `inboxKind` (categoría de la plantilla o `input.inboxKind ?? category`) e `inboxRefId`. `recordOpened` marca leído primero. `purgeOldInbox()` delega en `InboxService.purgeOld`.
- `types.ts`: `QueueAdHocInput` suma `inboxKind` e `inboxRefId`.
- `novedades-push.ts`: las filas de la cola llevan `inboxKind: "anuncios"` (las Novedades masivas no se guardan directo: pasan por la cola).
- `notification-cron.ts`: tras `purgeOldNotifications`, `purgeOldInbox()` en su propio `try` con log; sin job nuevo, CON-04 intacto.
- `sendTestNotification` sin cambios; `classReminderAlreadyQueued` sin cambios.
- Test de integración (13 `it`): barrido, reintento del barrido, sin token (hora programada), recordatorio en dos ticks, referencia y texto, silenciado, tipo de plantilla (y fila vieja sin tipo), `aura_gift` con y sin push, prueba del admin, abrir la push (propia y ajena), purga 91/89 días y gimnasio 2.

## Control posterior

- API `npx tsc --noEmit`: 0. `pnpm lint:tenant`: DISCREPANCIAS 0.
- Unitario `notifications-inbox-rules.test.ts`: 27 de 27 en verde.
- `pnpm typecheck:tests`: sin deuda nueva en `inbox-queue.test.ts` ni en los archivos tocados (las 18 discrepancias de base son ajenas).
- App y admin no tocados. Sin migración, sin cambios en dependencias, sin bump, sin push. Worktree limpio salvo el `.tsv` ajeno.
- `inbox-queue.test.ts` nunca corrió local (la suite de integración queda para CI).

## Desvíos respecto del plan

- Prettier, al formatear `notification-cron.ts`, juntó en una línea un `import { buildClassDateTime, todayInTz }` ajeno al cambio. Es el mismo formato que aplica lint-staged.
- Se agregó el caso (7b) (fila vieja de la cola sin tipo toma la categoría de la plantilla), no pedido por el plan: cubre la consulta previa de categorías de `processQueue`.

## Decisiones propias

- La purga se expone como método del servicio (`purgeOldInbox`) en vez de instanciar `InboxService` en el cron: la instancia ya vive en el servicio de notificaciones.
- Si la consulta de categorías de plantilla falla, el barrido sigue y esos avisos quedan con tipo `otro` (se loguea `warn`): la bandeja nunca frena la push.
- El `shown_at` de los avisos que salen de la cola es el momento del barrido (lo define `recordFromQueue` del plan 12); el de los avisos sin push es la hora programada.

## Lecciones para los planes siguientes

- Para enviar un aviso al regalar (plan 15): `queueAdHocNotification({ ..., inboxKind: "aura_gift", inboxRefId: giftId }, ctx)`. Con push pasa por la cola y el barrido lo copia; sin push se guarda directo con clave por referencia (`a:aura_gift:<id>`), así que un reintento del mismo regalo no duplica.
- Para el plan 14 (lecturas): los avisos directos tienen `pending_notification_id` NULL y `dedupe_key` no nulo; los de la cola, al revés. Ambos se filtran por `shown_at <= NOW()`.
- Trampa de test: `queueNotification` sin token ahora ejecuta una consulta de género más y un INSERT; los tests que cuentan consultas o filas de `member_notifications` deben contarlo.
- En tests del gimnasio 2 hay que borrar a mano `memberNotifications`, `pendingNotifications`, `deviceTokens` y `notificationTemplates` del tenant antes de `limpiarSegundoGimnasio`.

## Self-Check: PASSED

Commits `58db2e9ec` y `2de268cc0` y el test `inbox-queue.test.ts` verificados.
