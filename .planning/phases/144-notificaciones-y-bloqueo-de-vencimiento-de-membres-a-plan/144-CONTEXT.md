# Phase 144: Notificaciones y bloqueo de vencimiento de membresía/plan - Context

**Gathered:** 2026-06-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Avisar al miembro que su membresía/plan está por vencer y empujarlo a renovar por WhatsApp, e impedir que reserve clases presenciales cuya fecha cae después del vencimiento.

Tres entregables:

1. **Push de vencimiento** — réplica del patrón existente "Program Renewal Warning", pero sobre `subscriptions.end_date`. Tres disparos: 7 días antes, 3 días antes, y el día del vencimiento.
2. **Pop-up in-app** — al abrir la app, si faltan ≤3 días para vencer, mostrar un cartel salteable con botón a WhatsApp para renovar.
3. **Bloqueo de reserva** — rechazar la reserva de una clase presencial cuya fecha es posterior a la cobertura de la suscripción, con pop-up + botón a WhatsApp en `ReservasPage.vue`.

**Fuera de alcance (capacidades nuevas, otras fases):** flujo de renovación in-app (pago dentro de la app), tracking/analítica de conversión a WhatsApp, deep-linking a un chat pre-poblado por sucursal más allá del helper existente, recordatorios por email/SMS.
</domain>

<decisions>
## Implementation Decisions

### Concepto transversal: "fecha cubierta" (covered-until)

- **D-00:** La validación NO mira solo la suscripción activa de hoy, sino la **cadena de suscripciones encadenadas** del miembro (`active` + `scheduled`). La "fecha cubierta" es el `end_date` más lejano de esa cadena. Tanto la supresión de avisos como el bloqueo de reserva usan esa fecha. El sistema ya permite tener una `scheduled` encadenada que se activa automáticamente al vencer la actual (ver `autoExpireSubscriptions`), así que un miembro que ya renovó tiene una `scheduled` que extiende la cobertura.

### Notificación push (entregable 1)

- **D-01:** **Categoría nueva `planes`** (display "Planes"). Se agrega al `notificationCategoryEnum` y al seed de `notification_preferences`. Toggle propio para que el miembro la silencie de forma independiente de `entrenamiento`/`programas`. NO reutilizar la categoría `programas` (es para micro-programas y confundiría).
- **D-02:** **Tres disparos de push**, todos bajo la categoría "Planes": (a) 7 días antes del vencimiento, (b) 3 días antes, (c) el día del vencimiento ("tu membresía venció, renová"). El miembro puede deshabilitarlos silenciando la categoría "Planes" (mecanismo existente `notification_preferences`).
- **D-03:** Nuevo bloque de cron en `notification-cron.ts` (réplica del de programas, líneas 346-398) que busca suscripciones cuya **fecha cubierta** cae en cada ventana (7d / 3d / hoy) y encola la notificación correspondiente. Necesita **idempotencia por umbral** para no remandar el mismo push cada día que cae dentro de la ventana.
- **D-04:** Nuevo template (ej. `plan_renewal_warning_7d` / `_3d` / `_expired`, o un solo template parametrizado por días) en `el-templo-api/src/modules/notifications/types.ts`. Copy del tipo "Tu membresía vence en X días. Escribinos por WhatsApp para renovarla."
- **D-05:** **Supresión por cobertura:** si la fecha cubierta (cadena active+scheduled) está fuera de la ventana — es decir, el miembro ya renovó — NO encolar ningún push.

### Pop-up in-app de vencimiento (entregable 2)

- **D-06:** **Dispara solo a ≤3 días** de la fecha cubierta (NO a 7 — los 7 días quedan cubiertos solo por el push). Corrección explícita del usuario sobre la redacción original del ROADMAP.
- **D-07:** **Salteable** — botón cerrar / "Ahora no" además del botón de WhatsApp. NO bloquea el uso de la app.
- **D-08:** **Reaparece 1 vez por día** mientras falten ≤3 días, hasta que el miembro renueve (la fecha cubierta se extiende). Persistir "última vez mostrado" (por día) para no mostrarlo más de una vez por día. Si renueva, deja de aparecer.
- **D-09:** Botón abre WhatsApp vía `el-templo-app/src/utils/whatsapp.ts` → `buildWhatsAppUrl(country, text)` con el país del miembro y un texto de renovación pre-cargado.
- **D-10:** **Supresión por cobertura:** si ya hay cobertura más allá de 3 días (renovación agendada), NO mostrar el pop-up.

### Bloqueo de reserva (entregable 3)

- **D-11:** **Solo planes presenciales.** Es el único flujo que reserva clases vía la grilla de `ReservasPage.vue`; los planes online no reservan así.
- **D-12:** Backend: validar en `el-templo-api/src/modules/scheduling/booking-service.ts` `reserve()` que `booking_date <= fecha cubierta`. Hoy ese check NO existe (bug latente: se puede reservar para después del vencimiento). Devolver un **error/código distinguible** para que el front lo diferencie de otros errores de reserva.
- **D-13:** La validación usa la **fecha cubierta de la cadena** (active + scheduled), no solo la activa. Si la clase cae después de la actual pero dentro de una `scheduled` encadenada → **se permite reservar**.
- **D-14:** `end_date` NULL = **nunca bloquear** (guarda defensiva). En la práctica no ocurre: `subscription_plans.duration_days` es `NOT NULL` y cada suscripción computa `end_date = startDate + durationDays`; un NULL solo aparecería en filas legacy/manuales.
- **D-15:** Frontend (`ReservasPage.vue`): capturar el error distinguible de D-12 y mostrar un pop-up "Necesitás renovar tu membresía para reservar esta clase" con botón a WhatsApp (mismo helper que D-09).

### Claude's Discretion

- Copy exacto de los mensajes (push y pop-ups) y texto pre-cargado del WhatsApp.
- Forma concreta de la idempotencia por umbral del cron (columna/tabla de tracking vs. derivar del estado) — el planner decide el mecanismo más limpio dado el patrón existente de programas.
- Si los 3 disparos de push son 3 templates separados o 1 template parametrizado.
- Mecanismo concreto de persistencia del "visto por día" del pop-up (local storage de la app vs. servidor).
  </decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Patrón a replicar (notificaciones de vencimiento)

- `el-templo-api/src/jobs/notification-cron.ts` §346-398 — bloque "Program Renewal Warning": cron diario 03:00 AR, busca enrollments venciendo en ventana 6-7d, encola vía `queueNotification`. ES EL MOLDE para el de planes.
- `el-templo-api/src/modules/notifications/types.ts` §3-18 (enum de categorías), §75-188 (TEMPLATE_SEEDS) — donde se agrega la categoría `planes` y los templates de renovación.
- `el-templo-api/src/modules/notifications/service.ts` — `NotificationService`, método `queueNotification`; envío FCM en `sendToDevice` §475-548.
- `el-templo-api/src/db/schema/notifications.ts` §16 (`notificationCategoryEnum`), §60-97 (`notification_templates`, `notification_preferences`), §111-148 (`pending_notifications`).

### Vencimiento y cadena de suscripciones

- `el-templo-api/src/db/schema/subscriptions.ts` §41-87 — `end_date` (nullable), `status` enum (active/paused/cancelled/expired/completed/changed/scheduled), índice `idx_subscriptions_status_end_date`.
- `el-templo-api/src/db/schema/subscription-plans.ts` §40 — `duration_days` NOT NULL; `planCategory` (presencial/online\_\*).
- `el-templo-api/src/modules/subscriptions/service.ts` §935-937 (cómputo de `end_date`), `autoExpireSubscriptions` §3580-3667 (expira vencidas y activa la `scheduled` sucesora), `getMemberSubscription` §543. Aquí vive la lógica para derivar la "fecha cubierta" de la cadena.

### Bloqueo de reserva

- `el-templo-api/src/modules/scheduling/booking-service.ts` §57-302 — `reserve()`. El check de membresía activa está en §82-87 y NO valida fecha vs. vencimiento (punto de inserción de D-12/D-13).
- `el-templo-app/src/pages/ReservasPage.vue` — UI de reserva; manejo de errores de `reserve()` (`extractError`) donde se engancha el pop-up de D-15.

### WhatsApp

- `el-templo-app/src/utils/whatsapp.ts` §19-32 — `WHATSAPP_NUMBERS` (AR `5492235820521`, ES `34680774331`) y `buildWhatsAppUrl(country, text)`. Helper único para los botones de D-09 y D-15.
- `el-templo-app/test/whatsapp.test.ts` — valida los números; no romper.

### Cliente push (recepción)

- `el-templo-app/src/boot/push-notifications.ts` — registro de token, `handleTapNavigation` (route + `/notifications/{id}/opened`).

### Diseño de la fase (ROADMAP)

- `.planning/ROADMAP.md` "Phase 144" — Goal y entregables (NOTA: la redacción del Goal dice pop-up "a 7 y 3 días"; **D-06 corrige a solo ≤3 días**).
  </canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- **Cron "Program Renewal Warning"** (`notification-cron.ts:346-398`): copiar la estructura (ventana de fechas + `queueNotification`) cambiando `programEnrollments`→cadena de `subscriptions` y la métrica de expiry a `end_date`.
- **`buildWhatsAppUrl(country, text)`** (`el-templo-app/src/utils/whatsapp.ts`): ya resuelve número por país y encodea el texto. Usar tal cual en ambos pop-ups.
- **`notification_preferences` + `notificationCategoryEnum`**: el toggle por categoría ya existe; agregar `planes` reutiliza el mecanismo de silenciado.
- **`autoExpireSubscriptions` / `getMemberSubscription`**: ya conocen el encadenamiento active↔scheduled; base para derivar la "fecha cubierta".
- **`pending_notifications` + Queue Processor (cada 15 min)**: no hay que tocar el envío; solo encolar bien.

### Established Patterns

- Notificaciones se **encolan** (no se envían directo): el cron escribe en `pending_notifications` con `status='pending'` y el processor las manda por FCM. El bloque nuevo solo encola.
- Categorías de notificación son un enum en schema + seed de preferencias; agregar un valor implica **migración SQL** del enum y backfill de preferencias.
- Errores de `reserve()` se propagan como `BadRequestError` con mensaje y la app los muestra con `extractError`/`$q.notify`; para D-12 conviene un **código/discriminador** además del mensaje para abrir el pop-up específico.

### Integration Points

- API: nuevo bloque en `notification-cron.ts`; nuevos templates + categoría en `notifications/types.ts` + schema; validación nueva en `booking-service.ts reserve()`.
- App: pop-up de vencimiento en el arranque/foreground (≤3d); pop-up de bloqueo en el flujo de reserva de `ReservasPage.vue`.
- DB: migración para el valor de enum `planes`, seed de templates y preferencias.
  </code_context>

<specifics>
## Specific Ideas

- "Como ya existe para programas" — el usuario quiere paridad con el aviso de renovación de programas, llevado a planes.
- Pop-up estilo cartel con un único CTA claro a WhatsApp (igual que el resto de la app, que ya empuja a WhatsApp para temas de plan en ReservasPage/PlanesPage).
- Corrección del usuario: el pop-up in-app es a **3 días**, no a 7; los 7 días los cubre el push.
  </specifics>

<deferred>
## Deferred Ideas

- **Renovación / pago dentro de la app** (sin salir a WhatsApp) — capacidad nueva, otra fase.
- **Tracking de conversión** (cuántos tocaron el botón de WhatsApp y renovaron) — analítica, otra fase.
- **Recordatorios por email/SMS** del vencimiento — canal nuevo, fuera de alcance.

### Reviewed Todos (not folded)

- `v51-milestone-data-rollout.md` ("Rollout de datos v5.1 — poblar milestone_exercise_id") — matcheó por keywords genéricos pero es de otra feature (árbol de progresiones v5.1); no pertenece a esta fase.
  </deferred>

---

_Phase: 144-notificaciones-y-bloqueo-de-vencimiento-de-membres-a-plan_
_Context gathered: 2026-06-24_
