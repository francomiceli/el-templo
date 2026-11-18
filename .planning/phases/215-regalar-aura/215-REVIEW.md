---
phase: 215-regalar-aura
reviewed: 2026-11-18T00:00:00Z
depth: deep
files_reviewed: 65
files_reviewed_list:
  - el-templo-api/src/db/migrations/0349_aura_gifts.sql
  - el-templo-api/src/db/migrations/0350_member_notifications.sql
  - el-templo-api/src/db/migrations/0351_pending_notifications_inbox.sql
  - el-templo-api/src/db/schema/aura-gifts.ts
  - el-templo-api/src/db/schema/member-notifications.ts
  - el-templo-api/src/db/schema/notifications.ts
  - el-templo-api/src/db/tenant-tables.ts
  - el-templo-api/src/app.ts
  - el-templo-api/src/jobs/notification-cron.ts
  - el-templo-api/src/modules/attendance/routes.ts
  - el-templo-api/src/modules/attendance/schemas.ts
  - el-templo-api/src/modules/attendance/service.ts
  - el-templo-api/src/modules/aura/amounts.ts
  - el-templo-api/src/modules/aura/gift-admin-queries.ts
  - el-templo-api/src/modules/aura/gift-admin-routes.ts
  - el-templo-api/src/modules/aura/gift-eligibility.ts
  - el-templo-api/src/modules/aura/gift-errors.ts
  - el-templo-api/src/modules/aura/gift-member-routes.ts
  - el-templo-api/src/modules/aura/gift-push.ts
  - el-templo-api/src/modules/aura/gift-rules.ts
  - el-templo-api/src/modules/aura/gift-schemas.ts
  - el-templo-api/src/modules/aura/gift-service.ts
  - el-templo-api/src/modules/aura/gift-settings.ts
  - el-templo-api/src/modules/aura/gift-void.ts
  - el-templo-api/src/modules/aura/member-routes.ts
  - el-templo-api/src/modules/aura/module.ts
  - el-templo-api/src/modules/aura/movement-labels.ts
  - el-templo-api/src/modules/aura/service.ts
  - el-templo-api/src/modules/communications/novedades-push.ts
  - el-templo-api/src/modules/notifications/inbox-routes.ts
  - el-templo-api/src/modules/notifications/inbox-rules.ts
  - el-templo-api/src/modules/notifications/inbox-schemas.ts
  - el-templo-api/src/modules/notifications/inbox-service.ts
  - el-templo-api/src/modules/notifications/service.ts
  - el-templo-api/src/modules/notifications/types.ts
  - el-templo-api/src/modules/shared/rate-limits.ts
  - el-templo-app/src/boot/push-notifications.ts
  - el-templo-app/src/components/GiveAuraSheet.vue
  - el-templo-app/src/components/MiTemploHeader.vue
  - el-templo-app/src/components/NotificationBell.vue
  - el-templo-app/src/composables/useAuraGiftsApi.ts
  - el-templo-app/src/composables/useNotificationsInboxApi.ts
  - el-templo-app/src/layouts/MainLayout.vue
  - el-templo-app/src/modules/progression/components/TodayCard.vue
  - el-templo-app/src/modules/progression/pages/MiTemplo.vue
  - el-templo-app/src/pages/NotificationsPage.vue
  - el-templo-app/src/router/routes.ts
  - el-templo-app/src/stores/useAuraGiftsStore.ts
  - el-templo-app/src/stores/useNotificationsInboxStore.ts
  - el-templo-app/src/utils/gift-view.ts
  - el-templo-app/src/utils/notifications-view.ts
  - el-templo-admin/src/components/CoachGiftDialog.vue
  - el-templo-admin/src/components/SlotAttendancePanel.vue
  - el-templo-admin/src/composables/useAttendanceApi.ts
  - el-templo-admin/src/composables/useAuraGiftsApi.ts
  - el-templo-admin/src/pages/RegalosAuraPage.vue
  - el-templo-admin/src/router/routes.ts
  - el-templo-admin/src/config/templo-config.ts
  - el-templo-admin/src/types/attendance.ts
  - el-templo-api/src/modules/scheduling/community-visibility.ts
  - el-templo-api/src/modules/aura/earned.ts
  - el-templo-api/src/modules/aura/day-cap.ts
  - el-templo-api/src/modules/notifications/rules.ts
  - el-templo-api/src/jobs/tenure-milestones.ts
  - el-templo-api/src/modules/sessions/stretch-push.ts
findings:
  critical: 0
  high: 1
  medium: 6
  low: 5
  total: 12
status: issues_found
---

# Fase 215: Code Review Report

**Reviewed:** 2026-11-18
**Depth:** deep (rutas, servicios, migraciones y pantallas; tests y CSS no revisados línea a línea)
**Status:** issues_found

## Alcance de lectura

Leído completo: las 3 migraciones, los 2 schemas nuevos, todo `modules/aura/gift-*.ts`, `inbox-*.ts` de notificaciones, los diffs de `aura/service.ts`, `member-routes.ts`, `notifications/service.ts`, `attendance/{routes,service,schemas}.ts` y `notification-cron.ts`, las stores y composables de la app, `gift-view.ts`, `notifications-view.ts`, el script de `GiveAuraSheet.vue` y de `NotificationsPage.vue`, `CoachGiftDialog.vue`, el cliente admin y el script de `RegalosAuraPage.vue` (hasta el flujo de anular).

Muestreado: diff de `SlotAttendancePanel.vue`, `MainLayout.vue`, `TodayCard.vue`, `MiTemplo.vue`, `MiTemploHeader.vue`, `NotificationBell.vue` (solo lógica, no estilos), `rules.ts`, `tenure-milestones.ts`, `stretch-push.ts` (solo para confirmar quién deduplica).

No leído: los ~25 archivos de test (`test/**`), CSS/SCSS, `NotificationCountBadge.vue`, `MemberAvatar.vue`, plantillas HTML de las páginas. No se corrió ningún test (regla de la fase).

Verificado y sin hallazgos: las 3 migraciones no tienen `;` en comentarios, el DDL coincide con los schemas Drizzle (columna física `aura_gift_status`, UNIQUE con `tenant_id` primero, NULL en los UNIQUE del profe y del alumno); todas las consultas llevan `tenantWhere`; ninguna ruta acepta ids de usuario; el regalo y su fila del ledger nacen en la misma transacción; `amount` se guarda y la anulación descuenta exactamente ese valor; la anulación usa CAS; el tope semanal y "un regalo por asistencia" se serializan con `FOR UPDATE` sobre el dador más los UNIQUE; el profe depende del UNIQUE (clic doble devuelve 409, no 500); un admin_sede fuera de su sede recibe 404 al anular y no ve regalos ajenos en la lista; los ocultos, prueba y staff quedan fuera de las caras tanto en la hoja como al dar.

## High

### HI-01: Quien no tiene push recibe en la bandeja un aviso nuevo por día de cada regla con cooldown (se saltea `cooldownDays`)

**Archivo:** `el-templo-api/src/modules/notifications/service.ts:472-495` (y `:578-607`), `el-templo-api/src/modules/notifications/rules.ts:555-577`, `el-templo-api/src/modules/notifications/inbox-rules.ts` (`inboxDedupeKey`)
**Escenario:** una regla custom "Te extrañamos" con `cooldownDays = 30`. El job mide la cadencia mirando `pending_notifications` (`rules.ts:557-570`). Antes de la 215, quien no tenía dispositivo no generaba fila y simplemente no recibía nada. Ahora `queueNotification` devuelve -1 pero antes llama a `recordDirect`, que escribe en la bandeja con clave `t:<plantilla>:<día UTC>:<hash del texto>`. Como nunca hay fila en la cola, el cooldown nunca se activa: cada corrida del job vuelve a calificar a esa persona y la clave cambia con el día, así que entra una fila nueva por día mientras siga cumpliendo la condición, hasta 90 días. Resultado: contador de campana inflado y bandeja llena de repetidos para todos los alumnos sin push (web, sin permiso), que son justamente los que más dependen de la bandeja. Lo mismo pasa con cualquier job que dedupliquen contra la cola y no contra su propio ledger (el recordatorio de clase sí está cubierto porque usa `bookingId`; stretch y aniversarios prechequean token o ledger y no se ven afectados).
**Corrección:** que el cooldown de `rules.ts` también mire `member_notifications` (por `user_id`, `kind`/plantilla y `shown_at` dentro de la ventana), o que `recordDirect` de plantillas sin `bookingId` use una clave sin el día (`t:<plantilla>`) más una guarda de ventana de `cooldownDays`. Agregar un test del job con un usuario sin token ejecutado dos días seguidos.

## Medium

### ME-01: Los regalos anulados siguen mostrando a la persona oculta (privacidad D-07)

**Archivo:** `el-templo-api/src/modules/aura/member-routes.ts:40-76`, `el-templo-api/src/modules/notifications/inbox-routes.ts:70-114`, `el-templo-api/src/modules/aura/gift-service.ts:812-883`
**Escenario:** Ana regala a Beto. Beto se oculta de la lista de anotados esa misma noche. Ana, en la card de hoy, sigue viendo "Le diste Aura a Beto" con su foto (`listGivenToday` no revisa visibilidad). Al revés: si Ana se oculta después, Beto sigue viendo nombre, inicial y foto de Ana en su detalle de Aura y en la bandeja. El comentario de `inbox-routes.ts` lo asume ("el regalo ya se dio"), pero D-07 dice que quien se oculta no participa. Es una decisión no escrita en `215-DECISIONES-AUTONOMAS.md`.
**Corrección:** filtrar `listGivenToday` por `effectiveVisible` del receptor (o mostrar solo iniciales) y, para el lado receptor, mostrar "Alguien" sin foto cuando el dador está oculto ahora. Si se acepta el comportamiento, anotarlo como decisión explícita.

### ME-02: Anular un regalo devuelve el cupo semanal de quien lo dio

**Archivo:** `el-templo-api/src/modules/aura/gift-eligibility.ts:425`
**Escenario:** el staff anula un regalo por abuso (Ana le dio 2 a Beto en la semana, repetido cada semana entre amigos). `weeklyGiftCountsByReceiver` cuenta solo `status = 'vigente'`, así que el regalo anulado deja de contar y Ana puede volver a darle a Beto el mismo día sobre otra clase de la semana. La migración y el servicio afirman que "anular no devuelve el cupo", pero eso vale solo para el cupo por asistencia (UNIQUE); el semanal sí se devuelve, y la anulación del staff pierde su efecto disuasorio.
**Corrección:** contar vigentes y anulados con `void_cause = 'staff'` para el tope semanal (los anulados por asistencia sí pueden devolver el cupo). `status IN ('vigente') OR void_cause = 'staff'`.

### ME-03: Deshacer una asistencia anula los regalos en una transacción aparte y antes del borrado

**Archivo:** `el-templo-api/src/modules/attendance/service.ts:1268-1275` y `:1310-1317`, `el-templo-api/src/modules/aura/gift-void.ts:158-190`
**Escenario:** `voidGiftsForAttendance` hace un commit por regalo y recién después se borra la asistencia y se revierte el Aura y las clases. Si el borrado o cualquier paso posterior falla (error de base, timeout), los regalos quedan anulados (el receptor perdió el punto y el dador no lo puede volver a dar: su UNIQUE por asistencia sigue ocupado) pero la asistencia sigue existiendo. Un reintento del profe no los restaura. Además un deshacer sobre una asistencia duplicada (check-in forzado) anula los regalos aunque la persona conserve la otra asistencia del mismo horario.
**Corrección:** pasar la transacción del deshacer a `voidGift` (o hacer la anulación y el DELETE dentro de una misma `db.transaction`), y para duplicados anular solo si no queda otra asistencia del mismo `(schedule_id, session_date, member_id)`.

### ME-04: La lista de regalos del admin se corta en 500 filas sin avisar

**Archivo:** `el-templo-api/src/modules/aura/gift-admin-queries.ts:54` y `:184`
**Escenario:** el comentario supone que 90 días caben en 500 filas, pero hay un regalo posible por asistencia: un gimnasio con 100 asistencias por día supera 500 regalos en una semana. Con 30 o 90 días el `LIMIT` descarta en silencio los más viejos, y el staff no puede ver ni anular esos regalos desde la pantalla. La medición de 4 semanas no se afecta (es agregada).
**Corrección:** paginar (cursor por `session_date, id`) o devolver `truncated: true` y mostrar un aviso en `RegalosAuraPage.vue`; alternativamente acotar `days` en el servidor según la cantidad.

### ME-05: Anular un regalo ya gastado deja saldo negativo y el descuento ya aplicado

**Archivo:** `el-templo-api/src/modules/aura/gift-void.ts:120-127`
**Escenario:** Beto recibió +1 o +10 del profe y canjeó puntos por un descuento de suscripción. El staff anula el regalo: se inserta la fila `-amount` y `aura_balances.balance` baja por debajo de 0 sin ningún chequeo (no usa `spend`, a propósito). El descuento ya otorgado no se toca, el saldo negativo bloquea futuros canjes hasta recuperarse y el staff no recibe ninguna señal de que pasó. La reconciliación con el ledger sigue cerrando (ambos bajan), por lo que el desvío queda invisible.
**Corrección:** devolver en la respuesta de anulación si el saldo quedó negativo y mostrarlo en el admin ("El alumno ya había usado esos puntos"), o registrar un `warn` con `giftId` y `newBalance`; decidir y anotar si se permite negativo o se limita la anulación.

### ME-06: Cualquier profe con la sede asignada regala hasta 10 puntos por alumno y por día, sin tope ni rastro de alerta

**Archivo:** `el-templo-api/src/modules/aura/gift-service.ts:463-538`, `el-templo-api/src/modules/aura/gift-settings.ts`
**Escenario:** `giveCoachGift` solo exige rol profe y sede en `branchIds` (decisión autónoma documentada para cubrir suplencias), no que sea el profe de ese horario. Como el Aura se canjea por descuento de suscripción, un profe puede regalar el valor máximo cada día a cualquier asistente de cualquier clase de su sede, y otro profe repetirlo el mismo día; solo se limita una vez por (profe, persona, día). No hay conteo por profe ni alerta; el único control es que el admin revise la lista a mano (y la lista se trunca, ver ME-04).
**Corrección:** aceptar el riesgo con una métrica por profe en `RegalosAuraPage` (regalos por profe y por semana) o limitar a profes asignados al horario o a sus suplentes de la fecha; en cualquier caso anotarlo en las decisiones como riesgo conocido.

## Low

### LO-01: El panel del profe marca "dado" un regalo que fue anulado y no lo deja corregir

**Archivo:** `el-templo-api/src/modules/aura/gift-service.ts:623-639` (sin filtro de `status`) y `:494-507`
**Escenario:** el admin anula por error un regalo del profe (o el profe elimina y vuelve a cargar la asistencia). El panel sigue mostrando "✦ +2 / Ya le diste Aura hoy" y el servidor responde `REGALO_YA_DADO`, aunque el alumno ya perdió los puntos.
**Corrección:** devolver el estado `anulado` en el panel con un texto propio ("Anulado"), o permitir re-dar cuando el anterior fue anulado por staff.

### LO-02: Eliminar asistencia no avisa que también anula los regalos

**Archivo:** `el-templo-admin/src/components/SlotAttendancePanel.vue:625`
**Escenario:** el cuadro dice "Se revertirá el AURA y las clases" pero ahora también anula en silencio los regalos dados y recibidos por esa asistencia (D-08), y quien dio pierde el cupo de esa clase.
**Corrección:** agregar al mensaje "y los regalos de Aura de esa clase".

### LO-03: La hoja entrega ids de asistencia de otras personas

**Archivo:** `el-templo-api/src/modules/aura/gift-schemas.ts` (`candidates.receiverAttendanceId`), `gift-service.ts:320-329`
**Escenario:** el cliente necesita elegir a quién regalar y el contrato usa el id de asistencia ajena. Un alumno ve ids secuenciales de otras personas (vuelve enumerable el volumen de asistencias) y no hay vulnerabilidad de acceso porque el servidor revalida contra las caras. Es la única parte de la API que no cumple "no se exponen ids".
**Corrección:** devolver un identificador opaco por clase y persona (por ejemplo un HMAC de `attendanceId` + `userId` del dador) o un índice estable dentro de la lista firmada.

### LO-04: La purga de la bandeja corre en cada tick por cada gimnasio y sin límite de filas

**Archivo:** `el-templo-api/src/jobs/notification-cron.ts:695-705`, `el-templo-api/src/modules/notifications/inbox-service.ts:196-214`
**Escenario:** `purgeOld` es cross-tenant y se llama una vez por gimnasio activo en cada tick de 5 minutos (mismo defecto ya anotado para `processQueue`). Con varios gimnasios son N `DELETE` iguales por tick; el primero tras un backlog borra todo de una vez sin `LIMIT`. No hay tope por persona: sumado a HI-01, una persona acumula entradas durante 90 días.
**Corrección:** correr la purga una vez por tick (fuera de `forEachActiveTenant`) y con `LIMIT 1000` en bucle.

### LO-05: "Anulado por asistencia anulada" aparece también si quien anuló fue borrado

**Archivo:** `el-templo-admin/src/pages/RegalosAuraPage.vue` (`voidedByLabel`) y `el-templo-api/src/modules/aura/gift-admin-queries.ts:199-208`
**Escenario:** `voided_by_user_id` es `ON DELETE SET NULL`. Un regalo anulado por el staff `X` cuyo usuario se borró después muestra "por asistencia anulada" aunque `void_cause = 'staff'`. También el deshacer asistencia guarda al profe como `voidedBy` y muestra "por <profe>" aunque la causa sea `asistencia`.
**Corrección:** decidir el texto por `voidCause`, no por la presencia de `voidedByName`.

---

_Reviewed: 2026-11-18_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
