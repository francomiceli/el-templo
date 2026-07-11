---
phase: 158-visibilidad-y-comunicaci-n
plan: 02
subsystem: referrals
tags: [referrals, notifications, enum-migration, best-effort, push, VIS-02]
requires:
  - qualifyFirstPayment (fase 157): flip pending→qualified del vínculo del referido
  - qualifyReferralOnCharge (subscriptions): punto único de flip en las 4 charge-paths
  - NotificationService.queueNotification (fase ~56/144): cola defensiva (-1 si skip)
  - seedTemplates() (notifications): itera TEMPLATE_SEEDS con INSERT IGNORE en startup
provides:
  - categoría 'referidos' en notificationCategoryEnum (ambas tablas) + preferencia opt-out backfilleada
  - template referral_link_activated (route /mis-referidos) seedeable
  - qualifyFirstPayment devuelve { referrerId, referredFirstName } | null (el flip real)
  - hook best-effort que notifica AL REFERIDOR en el flip a qualified (VIS-02)
affects:
  - 158-03 (app "Mis referidos") consume la ruta /mis-referidos de la notificación
  - cualquier fase futura que agregue templates de la categoría referidos
tech-stack:
  added: []
  patterns:
    - enum migration hand-written (append last, byte-for-byte) + backfill NOT EXISTS idempotente
    - notificación best-effort dentro del flujo transaccional (try/catch + log.warn, nunca relanza)
    - {Nombre} interpolado por bodyOverride (no hay template engine); título por género del referidor
key-files:
  created:
    - el-templo-api/src/db/migrations/0177_referidos_notification_category.sql
    - el-templo-api/test/referrals/activation-notification.test.ts
  modified:
    - el-templo-api/src/db/schema/notifications.ts
    - el-templo-api/src/modules/notifications/types.ts
    - el-templo-api/src/modules/notifications/service.ts
    - el-templo-api/src/modules/referrals/service.ts
    - el-templo-api/src/modules/subscriptions/service.ts
    - el-templo-api/test/referrals/discount-computation.test.ts
decisions:
  - "qualifyFirstPayment hace un SELECT previo del vínculo pending (con firstName del payer) ANTES del UPDATE guardado — la cláusula del UPDATE (mecánica de 157) NO cambia; solo se expone qué flippeó para notificar una sola vez"
  - "el hook vive DENTRO de qualifyReferralOnCharge (no en cada una de las 4 charge-paths); best-effort D-33 con try/catch + log.warn"
  - "el {Nombre} viaja por bodyOverride (no hay template engine); el título lo resuelve queueNotification por género del referidor (title/titleFemale)"
  - "re-cobro: el hook no re-notifica porque qualifyFirstPayment devuelve null cuando no hay pending que flippear (probado con un vínculo ya qualified)"
metrics:
  duration: ~9min
  completed: 2026-07-11
---

# Phase 158 Plan 02: Notificación de vínculo activado Summary

La categoría de notificación `referidos` (migración de enum 0177 + template seedeable + preferencia opt-out backfilleada) más el disparo best-effort al referidor en el momento exacto del flip a `qualified`: `qualifyFirstPayment` ahora devuelve el vínculo que efectivamente flippeó (referidor + nombre del referido) sin tocar la mecánica del UPDATE, y `qualifyReferralOnCharge` encola una única notificación al referidor envuelta en try/catch que jamás puede romper el cobro.

## What Was Built

- **Categoría `referidos`** apendada último byte-for-byte al `notificationCategoryEnum` (schema), a la union `NotificationCategory`, al array `NOTIFICATION_CATEGORIES` y al default exhaustivo `Record<NotificationCategory, boolean>` de `getUserPreferences` (sin este último tsc rompía — mismo ajuste que el precedente "planes" de 144-01).
- **Template `referral_link_activated`** en `TEMPLATE_SEEDS` (category `referidos`, route `/mis-referidos`, copy S4 masculino/femenino). `seedTemplates()` ya lo siembra con `INSERT IGNORE` en startup — sin cambios de código.
- **Migración 0177** (clon de 0158): `ALTER ... MODIFY COLUMN notification_category enum(...,'planes','referidos')` sobre `notification_templates` y `notification_preferences` + backfill `INSERT ... SELECT ... WHERE NOT EXISTS` de una preferencia enabled `referidos` por usuario (idempotente, T-158-06). Cero `;` en comentarios. Aplicada local con `pnpm db:migrate` (registrada en `_migrations`).
- **`qualifyFirstPayment(payerUserId)`** augmentada a `Promise<{ referrerId; referredFirstName } | null>`: un SELECT previo (join a `users` por el firstName del payer) del vínculo `WHERE referredId=? AND status='pending'` ANTES del UPDATE existente; si no hay pending → `null`; si hay → el UPDATE guardado (cláusula intacta) + retorno del flip. La mecánica de 157 queda congelada.
- **Hook best-effort** en `qualifyReferralOnCharge` (subscriptions): captura el retorno; si es no-null encola `referral_link_activated` AL REFERIDOR con `bodyOverride` interpolando el firstName del referido, todo en try/catch → `log.warn(... "best-effort")` que sigue sin relanzar (D-33). Vive en el punto único de flip, no en las 4 call-sites.
- **Tests:** `activation-notification.test.ts` (3 casos: encola una al referidor con el nombre / ninguna al referido, re-cobro sobre vínculo ya qualified no re-notifica, best-effort sin device token no rompe el cobro) + `discount-computation.test.ts` alineado a la firma nueva (`.resolves.toBeNull()`).

## Task Commits

| Task | Name                                        | Commit     | Files                                                                                   |
| ---- | ------------------------------------------- | ---------- | --------------------------------------------------------------------------------------- |
| 1    | Migración 0177 + enum + seed                | `0f5c850f` | schema/notifications.ts, notifications/types.ts, notifications/service.ts, 0177\_...sql |
| 2    | qualifyFirstPayment devuelve el flip + hook | `4ca520a7` | referrals/service.ts, subscriptions/service.ts, discount-computation.test.ts            |
| 3    | Test de integración de la notificación      | `fa0a6ddf` | test/referrals/activation-notification.test.ts (new)                                    |

## Verification

- `npx tsc --noEmit` limpio en `el-templo-api` tras cada tarea (incluye el default exhaustivo con `referidos: true`).
- `pnpm db:migrate` aplicó 0177 limpio (`Applied 1 migration(s)`); enum con `referidos` último en ambas tablas; cero `;` en comentarios.
- `pnpm test test/referrals/discount-computation.test.ts` → **8/8 verdes** (firma nueva).
- `pnpm test test/referrals/activation-notification.test.ts` → **3/3 verdes**.

## Deviations from Plan

**1. [Rule 1 - Bug] Columna física `device_platform` (no `platform`) al seedear el device token en el test**

- **Encontrado durante:** Task 3 (primera corrida roja: `Unknown column 'platform'`).
- **Motivo:** `device_tokens` usa `mysqlEnum("device_platform", ...)` — el nombre físico es `device_platform`, no la propiedad `platform`. Es exactamente la trampa que documenta el skill db-migrations (primer arg de mysqlEnum = nombre de columna). Se corrigió el INSERT del helper del test.
- **Archivos:** `el-templo-api/test/referrals/activation-notification.test.ts`.
- **Commit:** `fa0a6ddf`.

**2. [Rule 3 - Blocking] El "re-cobro" no se puede probar con un segundo `assignPlan` (409)**

- **Encontrado durante:** Task 3 (segundo `assignPlan` sobre el mismo socio → 409, ya tiene subscripción activa).
- **Motivo/Fix:** la semántica de "no duplicar en re-cobro" es que en cualquier cobro posterior el vínculo ya está `qualified`, así que `qualifyFirstPayment` devuelve `null` y el hook no encola. Se probó montando el vínculo **directamente en `qualified`** y asertando cero notificaciones tras el cobro (mismo enfoque que `qualification.test.ts` caso c). Cubre la propiedad sin necesitar el flujo de renovación.
- **Archivos:** `el-templo-api/test/referrals/activation-notification.test.ts`.
- **Commit:** `fa0a6ddf`.

Fuera de eso, el plan se ejecutó tal cual.

## TDD Gate Compliance

Task 3 es `tdd="true"` pero su implementación (el hook) ya había aterrizado en Task 2 por diseño del plan (Task 2 = implementación, Task 3 = test de integración). El test se escribió y quedó verde validando la conducta ya construida — no hubo fase RED separada porque el plan estructuró la implementación antes del test. Los commits `feat` (Task 1/2) preceden al commit `test` (Task 3), invirtiendo el orden RED/GREEN clásico de forma deliberada y consistente con el plan.

## Notes for Downstream Plans

- **VIS-02 backend cerrado:** la notificación de activación queda operativa end-to-end. La de "descuento por caerse" sigue diferida (D-31, necesita cron de vigilancia).
- **Ruta `/mis-referidos`** del template asume la pantalla que construye 158-03; hasta entonces el deep-link cae a la ruta por defecto de la app si no existe.
- **Género:** el cuerpo se overridea siempre (interpola `{Nombre}`), así que la variante femenina del body es efectivamente cosmética; el **título** sí varía por género del referidor vía template.

## Self-Check: PASSED

- Archivos creados verificados en disco: `0177_referidos_notification_category.sql`, `test/referrals/activation-notification.test.ts` — FOUND.
- Archivos modificados presentes: `schema/notifications.ts`, `notifications/types.ts`, `notifications/service.ts`, `referrals/service.ts`, `subscriptions/service.ts`, `discount-computation.test.ts` — FOUND.
- Commits verificados en git log: `0f5c850f`, `4ca520a7`, `fa0a6ddf` — FOUND.
