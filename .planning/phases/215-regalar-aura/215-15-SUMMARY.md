---
phase: 215-regalar-aura
plan: 15
subsystem: api-aura-notifications
tags: [push, bandeja, regalo, motivacion, aura_gift]
requires: ["215-14"]
provides:
  - "queueGiftNotification: push y entrada de bandeja del regalo, categoría motivacion"
  - "Los dos caminos de dar (alumno y profe) avisan al receptor después del commit"
affects: [215-17, 215-18, 215-19]
tech-stack:
  added: []
  patterns:
    [
      push después del commit y sin relanzar errores,
      nombre del dador leído dentro de la transacción,
    ]
key-files:
  created:
    - el-templo-api/src/modules/aura/gift-push.ts
    - el-templo-api/test/aura/gifts-push.test.ts
  modified:
    - el-templo-api/src/modules/aura/gift-service.ts
key-decisions:
  - "Si encolar la push falla, el regalo y su Aura quedan y solo se loguea un warn con el id del regalo"
requirements-completed: [SC-6, D-17, D-19, D-22]
duration: 25 min
completed: 2026-11-18
---

# Fase 215 Plan 15: push del regalo Summary

Quien recibe un regalo se entera: se encola una push "Sofía M. te dio Aura" (o "Tu profe Fran te dio Aura") con cuerpo "Motivo: Buena energía.", categoría `motivacion`, destino `/mi-templo?aura=detalle`, tipo `aura_gift` y el id del regalo. Con dispositivo sale por la cola y la bandeja la guarda al enviarla; sin dispositivo la bandeja la guarda directo, una sola vez.

## Tareas

| Tarea | Commit      | Asunto                                                   |
| ----- | ----------- | -------------------------------------------------------- |
| 1     | `fb096d85a` | feat(215-15): push al que recibe un regalo de Aura       |
| 2     | `fe79052ae` | test(215-15): push y bandeja del regalo de punta a punta |

## Qué quedó

- `gift-push.ts`: `queueGiftNotification(notifications, ctx, input, log)` arma el texto con `giftPushText` y llama a `queueAdHocNotification` con `GIFT_ROUTE`, `INBOX_GIFT_KIND` e `inboxRefId` del regalo. Atrapa cualquier error y lo loguea como `warn` con `giftId`.
- `gift-service.ts`: `AuraGiftService` crea un `NotificationService` en el constructor. En `giveMemberGift` y `giveCoachGift` la transacción devuelve también el nombre de pila y la inicial del dador (`readGiverName`, con `tenantWhere`), y la push se encola DESPUÉS del `await db.transaction(...)`. Los resultados públicos no cambian de forma (el dador se separa antes de devolver). Anular (`gift-void.ts`) no toca nada de esto: no manda push.
- `gifts-push.test.ts` (9 `it`, nunca corrió local): regalo de alumno con token y tras el barrido en la bandeja (`vigente`, monto 1); regalo del profe; receptor sin token (cero filas en la cola, una en la bandeja con `kind`, `ref_id` y `pending_notification_id` nulo, y el objeto `gift` completo por la ruta); categoría `motivacion` apagada (ni push ni bandeja, regalo y Aura intactos); anular no encola y la bandeja dice `anulado`; ningún texto con "privad"; dador sin aviso; reintento idempotente; falla de la cola sin lanzar.

## Control posterior

- API `npx tsc --noEmit`: 0. `pnpm lint:tenant`: DISCREPANCIAS 0.
- `pnpm typecheck:tests` (heap 4096): sin errores en `gifts-push.test.ts` ni `gift-service.ts` (las 18 discrepancias de base son ajenas).
- App y admin no tocados. Sin migración, sin cambios en dependencias, sin bump, sin push. Tests de integración sin correr: quedan para CI.

## Desvíos respecto del plan

Ninguno. El verify de la tarea 1 (grep de `queueGiftNotification` en el servicio) da 3 coincidencias: el import y las dos llamadas.

## Decisiones propias

- Falla al encolar: el regalo queda y solo se loguea (fila nueva en `215-DECISIONES-AUTONOMAS.md`). La decisión de categoría silenciada ya estaba anotada.

## Lecciones para los planes siguientes

- Con la categoría `motivacion` apagada `queueAdHocNotification` devuelve -1 y no escribe ni en la cola ni en la bandeja; hoy la app no ofrece ese interruptor.
- Trampa de test: `shown_at` es de segundos enteros y puede redondear hacia arriba, así que antes de leer `GET /api/members/notifications` recién creado el test espera 1,1 s.
- La push de un regalo del profe usa solo el nombre de pila del profe (sin inicial); la de un alumno, nombre e inicial del apellido.

## Self-Check: PASSED

Commits `fb096d85a` y `fe79052ae`, y los archivos `gift-push.ts` y `gifts-push.test.ts` verificados.
