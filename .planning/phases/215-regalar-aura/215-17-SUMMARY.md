---
phase: 215-regalar-aura
plan: 17
subsystem: app-notifications-inbox-data
tags: [app, bandeja, store, textos, fail-open]
requires: ["215-16"]
provides:
  - "Tipos, cliente HTTP, store del contador de sin leer y utilidades puras de la bandeja en la app"
affects: [215-18, 215-19]
tech-stack:
  added: []
  patterns:
    [
      textos y agrupado en funciones puras con test,
      store fail-open con contador generation,
    ]
key-files:
  created:
    - el-templo-app/src/types/notifications-inbox.ts
    - el-templo-app/src/composables/useNotificationsInboxApi.ts
    - el-templo-app/src/stores/useNotificationsInboxStore.ts
    - el-templo-app/src/utils/notifications-view.ts
    - el-templo-app/src/utils/__tests__/notifications-view.test.ts
  modified: []
key-decisions:
  - "El agrupado por día junta solo avisos seguidos y no reordena nada"
  - "Si 'marcar todo' falla, la pantalla vuelve a pedir el número (el store lo deja en 0 al instante)"
requirements-completed: [SC-6, D-17, D-18, D-19]
duration: 20 min
completed: 2026-11-18
---

# Fase 215 Plan 17: datos y textos de la bandeja en la app Summary

La app ya tiene la capa de datos de la bandeja: tipos espejo del contrato de la API (plan 14), cliente HTTP, store del contador que conserva el último número si la consulta falla y utilidades puras con test (31 `it` en verde). La campana y la pantalla son los planes 18 y 19.

## Tareas

| Tarea | Commit      | Asunto                                                |
| ----- | ----------- | ----------------------------------------------------- |
| 1 RED | `7b96ca13b` | test(215-17): vista de la bandeja (rojo)              |
| 1     | `a0a6e7296` | feat(215-17): vista de la bandeja                     |
| 2     | `2231a4c9f` | feat(215-17): cliente y store de la bandeja en la app |

## Qué quedó

- `notifications-view.ts`: `groupByDay(items, tz, now)` (secciones `{ key, label, items }`), `timeLabel(createdAt, tz)` ("18:42", 24 h con cero a la izquierda, zona inválida cae en Buenos Aires), `iconForKind(kind)` (`null` para `aura_gift`), `badgeText(count)` ("9+" desde 10), `bellAriaLabel(count)`, `giftPill(item)` (`amount` "+1" o `voided` "Anulado"), `rowAriaLabel(item, time)` y `tapData(item)` (mismo `Record` que una push para `resolveTapRoute`, sin campos nulos o vacíos). La etiqueta del día sale de `formatMovementDate` de la 214 y el monto de `formatAura`.
- `types/notifications-inbox.ts`: `InboxGift`, `InboxItem`, `InboxPage`, `InboxUnreadCount`. `destination` es `string` (la API nunca lo manda null).
- `useNotificationsInboxApi.ts`: `list(before?)` (limit 30, `INBOX_PAGE_SIZE`), `unreadCount()` (devuelve el número), `markRead(id)`, `markAllRead()`, `cleanup()`. Los errores se propagan.
- `useNotificationsInboxStore.ts`: solo guarda `unreadCount`. `refreshCount()` nunca lanza y ante una falla conserva el número (warn en el log); `markOneReadLocal()` resta 1 sin bajar de 0; `markAllReadLocal()` pone 0; `reset()` pone 0. Contador `generation` descarta respuestas viejas. No reemplaza a `useNotificationStore`.

## Control posterior

- `pnpm lint` (app): 0 errores (2 warnings previos, ninguno en archivos tocados).
- `vue-tsc`: 20 errores (base 20), ninguno en archivos del plan.
- Test `notifications-view.test.ts`: 31 de 31 en verde (corrido en rojo antes, falló por import). API, admin y dependencias no tocados. Sin migración, bump ni push.

## Desvíos respecto del plan

- `types/notifications-inbox.ts` se commiteó en la tarea 1 (lo importa la utilidad) y no en la 2, igual que en el plan 16.
- La interfaz del plan decía `markOneRead` en el frontmatter y `markOneReadLocal` en la acción de la tarea 2: se usó `markOneReadLocal` (el nombre de la acción, simétrico con `markAllReadLocal`).
- `rowAriaLabel` recibe la hora ya formateada como segundo parámetro (`rowAriaLabel(item, time)`), para que la fila llame una sola vez a `timeLabel`.

## Decisiones propias

- Anotadas en `215-DECISIONES-AUTONOMAS.md`: agrupado por día solo entre avisos seguidos (una fecha ilegible queda en una sección sin título) y el contador tras un "marcar todo" fallido.
- `badgeText` y `bellAriaLabel` tratan negativos y NaN como 0 (sin badge).

## Lecciones para los planes siguientes

- El plan 18 (campana) usa `badgeText(unreadCount)` y `bellAriaLabel(unreadCount)` y llama `refreshCount()` en cada momento de la UI-SPEC (login, primer plano, push abierta, tras tocar un aviso, tras "marcar todo"); el plan 19 llama `reset()` en el logout.
- El plan 19: tocar un aviso = `markRead(id)` optimista + `markOneReadLocal()` solo si estaba sin leer + `router.push(resolveTapRoute(tapData(item)))`; si "marcar todo" falla, volver atrás en pantalla y llamar `refreshCount()`. `groupByDay` y `timeLabel` van con `profile.branchTimezone ?? DEFAULT_BRANCH_TZ`.
- Un test que importe `resolveTapRoute` necesita los mismos mocks que `push-destination.test.ts` (Capacitor, plugins de push, logger y `useAuthStore`).
- `giftPill` devuelve el texto sin la chispa: la "✦" decorativa la pone el componente.

## Self-Check: PASSED

Commits `7b96ca13b`, `a0a6e7296` y `2231a4c9f` y los cinco archivos creados verificados.
