---
phase: 215-regalar-aura
plan: 14
subsystem: api-notifications
tags: [bandeja, rutas, paginacion, aislamiento, member_notifications]
requires: ["215-13"]
provides:
  - "GET /api/members/notifications paginada por (shown_at, id), con el regalo de quien regaló"
  - "GET /api/members/notifications/unread-count"
  - "POST /api/members/notifications/:id/read y POST /read-all"
  - "Aislamiento de usuario y de gimnasio probado (ISO-03 y test de rutas)"
affects: [215-15, 215-17, 215-18, 215-19]
tech-stack:
  added: []
  patterns:
    [
      userId siempre del token,
      404 sin revelar si el aviso existe,
      foto firmada solo de dadores alumno con degradación sin storage,
    ]
key-files:
  created:
    - el-templo-api/src/modules/notifications/inbox-schemas.ts
    - el-templo-api/src/modules/notifications/inbox-routes.ts
    - el-templo-api/test/notifications/inbox-routes.test.ts
  modified:
    - el-templo-api/src/modules/notifications/inbox-service.ts
    - el-templo-api/src/modules/notifications/index.ts
    - el-templo-api/src/app.ts
    - el-templo-api/test/tenant-manifest.ts
    - el-templo-api/test/tenancy/iso-01-manifiesto.test.ts
    - el-templo-api/test/tenancy/iso-03-notifications.test.ts
key-decisions:
  - "`giftInfoFor` recibe también el id del receptor y filtra por él: un aviso nunca muestra un regalo ajeno"
  - "Sin storage de fotos la bandeja se lee igual, con quien regaló sin foto"
requirements-completed: [SC-6, D-17, D-18, D-19]
duration: 30 min
completed: 2026-11-18
---

# Fase 215 Plan 14: rutas de la bandeja para la app Summary

La app ya puede leer su bandeja: lista paginada del más nuevo al más viejo, contador de sin leer, marcar uno y marcar todo. Todo sale del token, nada acepta el id de otra persona, y los regalos traen solo nombre de pila, inicial y foto firmada de quien regaló.

## Tareas

| Tarea | Commit      | Asunto                                                            |
| ----- | ----------- | ----------------------------------------------------------------- |
| 1     | `281883a85` | feat(215-14): lecturas de la bandeja                              |
| 2     | `7de4737c0` | feat(215-14): rutas de la bandeja de notificaciones               |
| 3     | `0368c6979` | test(215-14): manifiesto, aislamiento e integración de la bandeja |

## Qué quedó

- `inbox-service.ts`: `listForUser` (keyset `(shown_at, id)` descendente, `limit + 1`, `shown_at <= NOW()`, cursor inválido se ignora), `giftInfoFor` (una consulta a `aura_gifts` con `users`, inicial por `LEFT(last_name, 1)`, la del profe en null), `unreadCount`, `markRead` (SELECT previo, `COALESCE(read_at, NOW())`, false si no es propio) y `markAllRead`.
- `inbox-schemas.ts` y `inbox-routes.ts`: las cuatro rutas con todos los campos del contrato declarados (nada de `userId`, `tenantId` ni `refId`). `before` con `pattern ^\d+\.\d+$` y `limit` 1 a 50. Fotos con `resolveCommunityPhotos` solo para dadores alumno; si el storage falla se loguea un `warn` y el dador sale sin foto.
- `app.ts` registra `inboxMemberRoutes` en `/api/members/notifications`, junto a `notificationRoutes`, sin `moduleScope`.
- Manifiesto: 4 entradas `tenant-scoped`; `ENTRADAS_BASELINE` pasó de 597 a 601 (conteo real verificado por grep antes de sumar) y el título del `it` también.
- ISO-03 de notificaciones: 4 casos nuevos (lista y contador del gimnasio 2 sin avisos de El Templo, control, `:id/read` ajeno da 404 sin marcar, `read-all` del gimnasio 2 no toca El Templo). No mueve el conteo de 8 rutas de `/api/notifications`.
- `inbox-routes.test.ts`: 14 `it` (lista y contrato; futuro; paginación de 35 con empates partidos en el corte; `limit`; cursor inválido; regalo vigente, anulado y borrado; foto firmada y storage caído; regalo ajeno; profe; contador; leer, repetir y ajeno; read-all; 401 en las cuatro; sin fugas y `?userId=` ignorado).

## Control posterior

- API `npx tsc --noEmit`: 0. `pnpm lint:tenant`: DISCREPANCIAS 0.
- `pnpm typecheck:tests` (con heap 4096): sin errores en `inbox-routes.test.ts`, `iso-03-notifications.test.ts`, `tenant-manifest.ts` ni `iso-01-manifiesto.test.ts` (las 18 discrepancias de base son ajenas).
- App y admin no tocados. Sin migración, sin cambios en dependencias, sin bump, sin push. Worktree limpio salvo el `.tsv` ajeno.
- Los tests de integración (`inbox-routes.test.ts`, ISO-03, ISO-01) nunca corrieron en local: quedan para CI.

## Desvíos respecto del plan

- `giftInfoFor(ctx, receiverUserId, giftIds)` lleva un parámetro más que el plan (`giftInfoFor(ctx, giftIds)`): filtra por el receptor para que un aviso mal armado no muestre el regalo de otra persona (mismo criterio que `giftLabelInputs` del plan 11).
- Prettier reformateó casi todo `iso-03-notifications.test.ts` (no estaba formateado): es el mismo formato que aplica lint-staged, el cambio real son los 4 casos nuevos al final.
- `inboxMemberRoutes` también se exporta desde `notifications/index.ts` y `app.ts` lo importa de ahí, como `notificationRoutes`.

## Decisiones propias

- Un aviso `aura_gift` cuyo regalo no existe o es de otra persona sale con `gift: null`; no se oculta el aviso.
- `giverFirstName` sin nombre cargado sale "Alguien" (el esquema pide string).
- Sin storage de fotos la lista responde 200 y el dador sale sin foto.
- Las tres filas quedaron anotadas en `215-DECISIONES-AUTONOMAS.md`.

## Lecciones para los planes siguientes

- Contrato para la app (planes 17 a 19): `destination` es el tipo de destino (`app_section` o `whatsapp_sales`), `createdAt` es `shown_at`, `gift` solo viene con `kind === "aura_gift"` y puede ser null, `status: "anulado"` se muestra como "Anulado". El contador no cuenta avisos programados.
- Un `before` con forma inválida da 400; uno con forma válida pero sin sentido devuelve la primera página.
- Trampa de test: `shown_at` es de segundos enteros; armar los empates con segundos enteros y una base fija por test, porque el cursor desempata por `id`.

## Self-Check: PASSED

Commits `281883a85`, `7de4737c0` y `0368c6979` y los archivos `inbox-routes.ts`, `inbox-schemas.ts` e `inbox-routes.test.ts` verificados.
