---
phase: 180-campa-as-etapa-2-magic-links-por-sede-selector-de-audiencias
plan: 03
subsystem: notifications
tags: [notifications, email, resend, trial, scheduling, vitest]
status: completed

# Dependency graph
requires:
  - phase: 180-01
    provides: "Worktree et-180 con node_modules + .env local operativos"
provides:
  - "Template trial_session_reminder (categoria anuncios, route /reservas) + QueueNotificationInput.allowWithoutDeviceToken"
  - "Recordatorio T-24h de la sesion de prueba: encolado en reserveTrialSelfService, limpiado/reencolado en cancelTrialSelfService y rescheduleTrial (admin)"
  - "EmailService.sendTrialReminderEmail + fallback por email en NotificationService.processQueue cuando el usuario no tiene device token (D-24)"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Enqueue/cleanup de notificaciones SIEMPRE fuera de la transaccion de negocio (mismo patron que promoteWaitlist en booking-service.ts) — un fallo del lado de notificaciones nunca revierte la mutacion principal"
    - "allowWithoutDeviceToken como bandera opt-in por-caller en QueueNotificationInput, no un cambio global del guard de queueNotification"
    - "EmailService inyectado como dependencia OPCIONAL de NotificationService, wireado SOLO en el unico call site que corre processQueue (notification-cron.ts) de los ~18 sitios de instanciacion"

key-files:
  created:
    - el-templo-api/test/scheduling-trial-reminder.test.ts
  modified:
    - el-templo-api/src/modules/notifications/types.ts
    - el-templo-api/src/modules/notifications/service.ts
    - el-templo-api/src/modules/email/service.ts
    - el-templo-api/src/modules/email/templates.ts
    - el-templo-api/src/modules/scheduling/trials-service.ts
    - el-templo-api/src/modules/scheduling/routes.ts
    - el-templo-api/src/jobs/notification-cron.ts

key-decisions:
  - "NO se creo migracion SQL: el template se siembra vía seedTemplates(ctx) (INSERT IGNORE idempotente por tenant), tal como especificaba el plan — la migracion 0210 sigue libre para el siguiente plan que la necesite"
  - "TrialService.constructor gana un 4to parametro opcional notificationService (mismo patron que bookingService?) — ambas instanciaciones en routes.ts (admin y member) lo reciben; si faltara, el enqueue/cleanup se skipea con un log.warn en vez de romper"
  - "rescheduleTrial es un flujo ADMIN (routes.ts:684, trialService sin bookingService), no self-service — el plan lo trata igual que reserveTrialSelfService/cancelTrialSelfService para el ciclo de vida del recordatorio, cubierto con su propia instanciación de NotificationService"
  - "El body del recordatorio se compone en queueTrialReminder (dia/hora/sede/direccion) via bodyOverride — el seed del template solo aporta el fallback generico para filas que no pasen override explicito"

patterns-established:
  - "trial_session_reminder es el primer y unico templateKey con allowWithoutDeviceToken=true y con fallback por email en processQueue — cualquier notificacion futura que necesite el mismo patron debe replicar exactamente ese guard doble (opt-in en queueNotification + branch dedicado en processQueue), nunca ampliar el guard general"

requirements-completed: [NOT-01]

# Metrics
duration: ~35min
completed: 2026-08-23
---

# Fase 180 Plan 03: Recordatorio de sesión de prueba (D-20) con fallback por email (D-24) Summary

**Toda sesión de prueba reservada encola un recordatorio ~24h antes de la clase (branch-timezone aware) que sale por push si hay device token o por email si no — el mecanismo anti no-show que sin el fallback por email hubiera sido no-op para el freemium que llega por campaña.**

## Performance

- **Duration:** ~35 min
- **Completed:** 2026-08-23T21:07:56-03:00
- **Tasks:** 3/3
- **Files modified:** 7 (1 nuevo, 6 modificados)

## Accomplishments

- `TEMPLATE_SEEDS` suma `trial_session_reminder` (categoría `anuncios`, default `true` en preferencias, así el freemium lo recibe sin haber tocado nada) y `QueueNotificationInput.allowWithoutDeviceToken` (opt-in, default `false`) — ningún llamador existente de `queueNotification` cambió de comportamiento.
- `reserveTrialSelfService` encola el recordatorio FUERA de la transacción (patrón `promoteWaitlist`) con `scheduledAt` calculado vía `buildClassDateTime` (DST-aware por timezone de sede) menos 24h; el `body` incluye día/hora/sede/dirección (si existe). No encola si la ventana ya pasó (reserva con <24h de anticipación) y un fallo del enqueue nunca revierte la reserva confirmada.
- `cancelTrialSelfService` (self-service) y `rescheduleTrial` (admin) limpian la fila `pending` vía el nuevo método privado `cancelTrialReminder`; `rescheduleTrial` además reencola con el horario nuevo — nunca quedan dos filas activas ni una huérfana.
- `EmailService.sendTrialReminderEmail` (patrón `sendPasswordSetEmail`, HTML escapado por `esc()` per T-180-11) + `NotificationService.processQueue`: cuando la fila sin device tokens es de `trial_session_reminder` y el usuario tiene email, se envía el fallback y se marca `sent` — cualquier otro `templateKey` conserva el `failed: "No device tokens registered"` de siempre (verificado con test de regresión explícito).
- `EmailService` se inyecta como dependencia opcional de `NotificationService`, wireada SOLO en `notification-cron.ts` (el único de los ~18 sitios de instanciación que corre `processQueue`).
- 11 tests de integración nuevos contra MySQL real cubriendo los 5 comportamientos del Task 2 + los 4 del Task 3, más 2 extra (cuerpo con/sin dirección) por la preferencia de testing exhaustivo de CLAUDE.md.

## Task Commits

Ejecutados dentro del worktree `/home/franco/projects/et-180` (rama `feat/180-campanas-etapa-2`):

1. **Task 1: Template `trial_session_reminder` + opción de enqueue sin device token** - `00ebb405` (feat)
2. **Task 2: Encolar el recordatorio al reservar y limpiarlo al cancelar/reprogramar** - `5832b81e` (feat)
3. **Task 3: Fallback por email en el procesador de la cola + tests de integración** - `271a40b4` (test)

**Plan metadata:** pendiente — este SUMMARY se escribe en el checkout principal y NO se commitea (lo commitea el orquestador junto con STATE.md/ROADMAP.md).

## Files Created/Modified

- `el-templo-api/src/modules/notifications/types.ts` - seed `trial_session_reminder` + `QueueNotificationInput.allowWithoutDeviceToken`
- `el-templo-api/src/modules/notifications/service.ts` - guard `allowWithoutDeviceToken` en `queueNotification`; `EmailService` opcional en el constructor; `sendTrialReminderEmailFallback` privado + rama de `processQueue` para el template de recordatorio
- `el-templo-api/src/modules/email/service.ts` - `sendTrialReminderEmail` (mismo guard sin `RESEND_API_KEY` que los hermanos)
- `el-templo-api/src/modules/email/templates.ts` - `trialReminderEmailHtml` + `esc()` local (T-180-11)
- `el-templo-api/src/modules/scheduling/trials-service.ts` - `queueTrialReminder`/`cancelTrialReminder` privados; wireados en `reserveTrialSelfService`, `cancelTrialSelfService` y `rescheduleTrial`; constructor gana `notificationService?`
- `el-templo-api/src/modules/scheduling/routes.ts` - ambas instanciaciones de `TrialService` (admin y member) pasan `notificationService`
- `el-templo-api/src/jobs/notification-cron.ts` - `runNotificationQueueTickForTenant` inyecta `EmailService` en `NotificationService`
- `el-templo-api/test/scheduling-trial-reminder.test.ts` (nuevo) - 11 tests de integración

## Decisions Made

- **Sin migración SQL:** el plan lo especificaba explícitamente — el template se siembra vía `seedTemplates(ctx)` (INSERT IGNORE idempotente), no hace falta DDL. La migración `0210` sigue libre.
- **`TrialService` recibe `notificationService` como 4to parámetro opcional** (mismo patrón defensivo que `bookingService`): ambas instanciaciones de `routes.ts` (admin línea ~107, member línea ~841) ya construían un `NotificationService` antes de `TrialService`, así que solo hubo que enhebrarlo. Si faltara, el enqueue/cleanup se skipea con `log.warn`, nunca rompe la mutación principal.
- **`rescheduleTrial` es un flujo ADMIN**, no self-service (se descubrió leyendo `routes.ts`: usa la instancia de `TrialService` sin `bookingService`, registrada en `schedulingAdminRoutes`). El plan lo trata igual que `reserveTrialSelfService`/`cancelTrialSelfService` para el ciclo de vida del recordatorio — el test de reprogramación usa el endpoint admin `POST /trials/:bookingId/reschedule`.
- **`EmailService` inyectado SOLO en `notification-cron.ts`:** de los ~18 sitios que instancian `NotificationService`, únicamente el tick de `processQueue` necesita el fallback — los demás (enqueue-only) quedan sin cambios.

## Deviations from Plan

**1. [Rule 3 — bug de test, no de producto] Dos schedules del mismo día/actividad se solapaban en el test de reprogramación**

- **Found during:** Task 3, al escribir el test de `rescheduleTrial`
- **Issue:** el test creaba dos horarios (19:00 y 20:00, ambos jueves, misma actividad) con `endTime: "23:59"` por defecto — la validación de solapamiento por-actividad de `scheduling/service.ts` (§155-01) rechazaba el segundo horario (400), dejando `scheduleId: undefined` en el payload del reschedule
- **Fix:** se agregó un parámetro `endTime` al helper `mkSchedule` del test y se acotaron ambos horarios (19:00-19:30 y 20:00-20:30) para que no se solapen
- **Files modified:** `el-templo-api/test/scheduling-trial-reminder.test.ts`
- **Verificación:** el test pasa; no afecta código de producto

**2. [Rule 1 — bug propio del test] Faltaba `tenantWhere` en 4 SELECTs directos sobre `pending_notifications`**

- **Found during:** Task 3, al correr por primera vez el archivo de tests
- **Issue:** las 4 verificaciones post-`processQueue` (Task 3) hacían `select(...).from(schema.pendingNotifications).where(eq(id, ...))` sin `tenantWhere` — el sentinel de tenancy (`TenantSentinelError`) las bloqueaba en runtime; el primer fallo además dejaba un `vi.spyOn` sin `mockRestore()` (por el `throw` intermedio), contaminando el historial de llamadas del mock para los 3 tests siguientes con falsos positivos ("`sendTrialReminderEmail` llamado" cuando no correspondía)
- **Fix:** se agregó `tenantWhere(schema.pendingNotifications, CTX)` a las 4 queries
- **Files modified:** `el-templo-api/test/scheduling-trial-reminder.test.ts`
- **Verificación:** los 11 tests pasan de forma independiente y en la corrida completa del archivo

---

**Total deviations:** 2, ambas de infraestructura de test (no tocan código de producto ni el alcance del plan).

## Issues Encountered

None sobre el código de producto — ambos hallazgos de deviation fueron exclusivamente del archivo de test nuevo.

## Verification

- `pnpm exec tsc --noEmit` → exit 0 (corrido después de cada task y al cierre del plan).
- `pnpm exec vitest run --no-file-parallelism test/scheduling-trial-reminder.test.ts` → **11/11 tests verdes** (~117s).
- `pnpm lint:tenant` → **DISCREPANCIAS: 0**.
- `git diff --name-only` (los 3 commits del plan, base `06443874`) no incluye `test/tenant-manifest.ts`, `iso-01-manifiesto.test.ts` ni `con-04-crons-per-tenant.test.ts` — no se agregó ninguna ruta ni job nuevo.
- No se creó ningún archivo `.sql` en ningún task (verificado con grep tras el Task 1).

## User Setup Required

None — no se instaló ningún paquete nuevo, no hay variables de entorno nuevas (Resend ya está configurado desde fases previas), no hay migración pendiente de aplicar.

## Next Phase Readiness

- El recordatorio de sesión de prueba está completo end-to-end (encolar/limpiar/reencolar + fallback por email) y listo para el siguiente plan de la fase que lo necesite.
- `allowWithoutDeviceToken` y el patrón de fallback por email en `processQueue` quedan documentados como el único precedente de ese tipo — cualquier notificación futura con canal alternativo debe replicar el mismo guard doble, no ampliar el guard general de `queueNotification`.
- Sin bloqueos. El worktree `et-180` sigue con `node_modules`/`.env` local operativos.

---

_Phase: 180-campa-as-etapa-2-magic-links-por-sede-selector-de-audiencias_
_Completed: 2026-08-23_

## Self-Check: PASSED

- FOUND: el-templo-api/src/modules/notifications/types.ts (worktree et-180)
- FOUND: el-templo-api/src/modules/notifications/service.ts (worktree et-180)
- FOUND: el-templo-api/src/modules/email/service.ts (worktree et-180)
- FOUND: el-templo-api/src/modules/email/templates.ts (worktree et-180)
- FOUND: el-templo-api/src/modules/scheduling/trials-service.ts (worktree et-180)
- FOUND: el-templo-api/src/modules/scheduling/routes.ts (worktree et-180)
- FOUND: el-templo-api/src/jobs/notification-cron.ts (worktree et-180)
- FOUND: el-templo-api/test/scheduling-trial-reminder.test.ts (worktree et-180)
- FOUND: commit 00ebb405 (feat, Task 1)
- FOUND: commit 5832b81e (feat, Task 2)
- FOUND: commit 271a40b4 (test, Task 3)
- FOUND: este SUMMARY.md en el checkout principal
