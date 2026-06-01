# Phase 119: Campaña de sesión de prueba freemium (reserva self-service + sistema de email reutilizable) - Context

**Gathered:** 2026-06-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Activar la conversión de usuarios **freemium** (`users.status='freemium'`, sin suscripción ni trial previo) mediante una **campaña de email** que ofrece una **sesión de prueba gratis presencial** en la sede que elijan. Una sola fase grande que cruza 4 capas:

1. **API** — endpoint para que un freemium reserve su propia sesión de prueba (self-service), bypaseando la validación de suscripción, reusando `trials-service.ts` y el guard de una-por-vida; la trial no consume capacidad. No cancelable ni re-reservable desde la app.
2. **App (el-templo-app)** — reutilizar la vista de Reservas existente para que el freemium elija UNA clase como sesión de prueba, eligiendo sede física primero; entrada por deep link desde el email.
3. **Email** — sistema de campañas **reutilizable** sobre Resend (sin deps nuevas): tabla de campaña/envíos, unsubscribe propio, token de reserva personalizado por usuario, template HTML responsive, tracking del funnel.
4. **Campaña** — query de freemium elegibles + disparo del envío único + visualización del funnel en una sección "Campañas" del admin.

**Fuera de scope (otras fases):** follow-up/re-envío automático con scheduler; conversión automática post-asistencia (recepción sigue asignando el plan); recordatorio pre-sesión; landing web de reserva.
</domain>

<decisions>
## Implementation Decisions

### Estado del usuario y modelo de la trial

- **D-01:** Cuando un freemium reserva su sesión de prueba desde la app, **pasa a `status='prueba'` en el momento de reservar** (no al asistir). Reusa el modelo existente: `trials-service.ts` ya opera sobre `status='prueba'`, la trial aparece en el reporte de leads/trials de recepción (fase 114) y avanza el funnel freemium→prueba en `user_status_history`.
- **D-02:** Distinguir la trial **auto-reservada (self-service)** de la creada por admin. El alta self-service NO tiene admin: `createdBy=null` (o un flag/`source` equivalente) para que reportes y analytics puedan separar ambos orígenes. El `leadStatus` arranca en `'en_seguimiento'` igual que el flujo tradicional.
- **D-03:** La sesión de prueba **no se puede cancelar ni re-reservar** desde la app (irreversible para el alumno), apalancando el guard de **una-por-vida** que ya existe en `trials-service.ts`.

### Mecánica de la oferta

- **D-04:** La oferta dura **30 días**: el freemium tiene 30 días desde que recibe el mail para **reservar Y asistir**. El token de reserva del email vence a los 30 días.
- **D-05:** El **horizonte de reserva para trials se amplía a 30 días** (hoy la ventana normal de booking es solo hoy..+2 días — `booking-service.ts:65-75`). El freemium debe poder elegir una clase dentro de los próximos 30 días.
- **D-06:** El freemium puede elegir **cualquier sede física activa de su país + cualquier horario disponible**. No hay subset de horarios "intro" ni sede única. Reusar el patrón del **selector de sucursal** que ya existe en Reservas para planes multisede (`ReservasPage.vue` líneas ~26-44). El freemium vive en "Templo Online" (virtual); debe elegir sede física primero, luego día/horario.
- **D-07:** La trial **no consume capacidad** del schedule (ya implementado: `countActiveBookings` filtra `is_trial=false`).

### Audiencia / elegibilidad

- **D-08:** Filtros **obligatorios** del público: `status='freemium'`, **sin suscripción** (activa/paused/scheduled), **sin trial previo** (sin booking `is_trial`), **con email válido**, **no dado de baja** (no unsubscribe).
- **D-09:** Alcance: **todos los elegibles, incluidos ghosts e inactivos** — es una campaña de reactivación y los dormidos son el target. NO excluir por actividad ni por antigüedad.
- **D-10:** Default extra que se aplica igual: **no enviar a registros de los últimos ~3 días** para no pisar el flujo de bienvenida/onboarding.
- **D-11:** **Un solo envío** en esta campaña. El sistema queda preparado para segmentar "no abrieron / no reservaron" y permitir un follow-up futuro, pero el scheduler de re-targeting NO se construye en esta fase.

### Email — sistema reutilizable sobre Resend

- **D-12:** Sistema de **campañas reutilizable** (no atado solo a esta campaña): tabla(s) de campaña + envíos, para servir a futuras campañas. Sobre **Resend** (ya integrado, **sin dependencias nuevas**).
- **D-13:** El email **lista la dirección de cada sede física** para que el freemium ya sepa dónde quedan antes de entrar a la app.
- **D-14:** **Doble CTA**: (a) botón "reservar en la app" vía **deep link** con token personalizado; (b) botón **WhatsApp** que cae al **flujo tradicional** de sesiones de prueba (recepción/admin agenda). WhatsApp es además el fallback natural para quien no tiene la app instalada.
- **D-15:** **Unsubscribe propio**, alcance **solo marketing/campañas** — NO afecta emails transaccionales ni push notifications.
- **D-16:** Template **HTML responsive** que se lea bien en todos los clientes de email (incl. dark mode / mobile / Gmail / Apple Mail / Outlook).
- **D-17:** Resend hoy **no tiene API key en prod** (degrada en silencio) — esta fase requiere setear la API key en prod y **verificar el dominio `eltemplo.org` en Resend** (hay acceso al DNS; SPF/DMARC ya configurados con Google Workspace).

### Tracking del funnel

- **D-18:** Tracking **completo**: `enviado → abierto (pixel) → click (redirect con token) → reservó → asistió → convirtió`. La apertura por pixel es aproximada (Apple Mail Privacy la infla) pero se incluye como contexto. Click vía redirect con token es la métrica confiable. `asistió/convirtió` se apoyan en `user_status_history` (fase 117).
- **D-19:** El funnel se ve en una **sección "Campañas" dedicada en el admin** (no dentro de analytics/Reportes): lista de campañas + funnel por campaña. Pensado como hogar del sistema reutilizable.

### Claude's Discretion

- Diseño del esquema de las tablas de campaña/envíos/eventos (campaign, sends, tracking events) y de la columna `source`/distinción self-service en bookings/trials.
- Mecanismo del token (firma, payload usuario+campaña, cómo pre-identifica/pre-autentica la pantalla de reserva al abrir el deep link).
- Implementación del pixel de apertura y del redirect de click (endpoints de tracking).
- Cómo se ofrece la opción de reserva-de-prueba en `ReservasPage.vue` para un freemium (empty state actual lo bloquea — `ReservasPage.vue:8-22`) y el endpoint nuevo (`reserve-trial`) vs extender `/reserve`.
- Estructura del deep link y fallback a store/web si la app no está instalada.
- El **copy/tono y el asunto** del email (contenido a aportar/iterar con el usuario; ver Specific Ideas).
- Número(s) de WhatsApp y mensaje pre-cargado del CTA de WhatsApp.
  </decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap / requisitos de la fase

- `.planning/ROADMAP.md` § "Phase 119" — goal y boundary de esta fase.
- `.planning/PROJECT.md` — contexto de la plataforma (8 sedes: 7 Mar del Plata + 1 Barcelona; multi-país).

### Reserva / trials / asistencia (API)

- `el-templo-api/src/modules/scheduling/trials-service.ts` — lógica de trial booking, guard una-por-vida (~líneas 111-222). Hoy exige `status='prueba'`.
- `el-templo-api/src/modules/scheduling/booking-service.ts` — flujo de reserva, validación de suscripción (línea 113-117), ventana de booking (65-75), capacidad/waitlist; `countActiveBookings` filtra `is_trial=false` (~1476).
- `el-templo-api/src/modules/scheduling/routes.ts` — endpoints de scheduling (reserve ~708-721; trials admin ~494-571).
- `el-templo-api/src/modules/attendance/service.ts` — check-in QR; valida suscripción (revisar interacción con trials de freemium).

### Estado de usuario / funnel / reportes

- `el-templo-api/src/db/schema/users.ts` — enum `status` (freemium/prueba/activo/inactivo), `leadStatus`, `createdBy`, `convertedAt`, `branchId`.
- `el-templo-api/src/db/schema/user-status-history.ts` — auditoría de transiciones (fundación del funnel, fase 117).
- `el-templo-api/src/db/schema/bookings.ts` — `is_trial`, estados de booking.
- `el-templo-api/src/db/schema/subscriptions.ts` — estados de suscripción (para el filtro "sin sub").
- `el-templo-api/src/db/schema/branches.ts` — sedes, `isVirtual` (Templo Online), `country` (para filtrar sedes por país + direcciones en el email).
- `el-templo-api/src/db/schema/member-profiles.ts`, `el-templo-api/src/db/schema/member-logins.ts` — actividad/segmento (para definir "ghost/inactivo" si se necesita en analytics).
- Fase 114 (reporte tabular de sesiones de prueba) — `.planning/phases/114-reporte-tabular-de-sesiones-de-prueba/` — el self-service debe aparecer ahí.
- Fase 118 (funnel de conversión) — `.planning/phases/118-analytics-estrat-gico-funnel-de-conversi-n-retenci-n-por-cic/` — definición del funnel freemium→prueba→activo a reutilizar/alinear.

### Email

- `el-templo-api/src/modules/email/service.ts` — `EmailService` (cliente Resend, from `El Templo <noreply@eltemplo.org>`, graceful degradation).
- `el-templo-api/src/modules/email/templates.ts` — patrón de templates HTML inline existente.
- `el-templo-api/.env.example` (líneas 34-39) — `RESEND_API_KEY` + NOTIFICATION_EMAILs (actualizar al agregar vars nuevas).

### App (member)

- `el-templo-app/src/pages/ReservasPage.vue` — vista de Reservas; empty state que bloquea freemium (~8-22); selector de sucursal multisede (~26-44).
- `el-templo-app/src/composables/useSchedulingApi.ts` — llamadas a la API de scheduling (~56-63).

### Mapas de codebase (patrones/convenciones)

- `.planning/codebase/CONVENTIONS.md`, `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/INTEGRATIONS.md`, `.planning/codebase/STACK.md` — patrones del proyecto (facade services, Pinia setup stores, logging, Sentry, tests de integración contra MySQL real).
  </canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- **`trials-service.ts`**: ya crea trials (`is_trial=true`), no consume capacidad y tiene guard una-por-vida. El endpoint self-service debe reusar esta lógica, no duplicarla. Hoy gatea por `status='prueba'`: como D-01 promueve a 'prueba' al reservar, el orden importa (promover → reservar) o adaptar el service para aceptar la promoción atómica.
- **Selector de sucursal de `ReservasPage.vue`** (planes multisede): reusar para que el freemium elija sede física.
- **Grid semanal de Reservas** (`getWeeklyGrid`): reusar para mostrar horarios elegibles de la sede elegida.
- **`user_status_history`** (117) + hooks de `recomputeUserStatus` / hooks de la 118: el cambio freemium→prueba ya tiene infraestructura de auditoría que alimenta el funnel.
- **`EmailService`/Resend**: cliente y from ya existen; extender con capacidad de campaña en vez de instanciar Resend suelto (hay duplicación de cliente Resend en franchise/gladius/academy/app-landing — NO replicar ese anti-patrón; centralizar).

### Established Patterns

- **Facade services** para dominios complejos (ver `edit-service.ts`); el sistema de campañas debería seguir esto.
- **Migraciones Drizzle** + runner propio (`_migrations` como fuente de verdad). Nunca `;` dentro de comentarios SQL. Siempre commitear el `.sql`.
- **Tests de integración** contra MySQL real para rutas nuevas (`test/helpers.ts`).
- **Logging** Pino en API, `createLogger()` en frontend; nunca `console.log`. Sin `any`.
- **Pinia composition stores** y composables con `cleanup()`.

### Integration Points

- Endpoint nuevo de reserva-trial self-service en `scheduling/routes.ts` + lógica en `trials-service.ts`/`booking-service.ts`.
- Promoción de status freemium→prueba (atómica con la reserva) → emite `user_status_history`.
- Módulo nuevo de **campañas de email** (schema + service + rutas admin + endpoints de tracking pixel/redirect + unsubscribe público).
- Sección admin nueva "Campañas" (frontend admin).
- Deep link en `el-templo-app` hacia la pantalla de reserva de prueba.
- Setup de infra: API key de Resend en prod + verificación de dominio (DNS).
  </code_context>

<specifics>
## Specific Ideas

- **Email debe listar la dirección de cada sede** (D-13) — el usuario quiere que el freemium sepa dónde queda cada sede antes de entrar a la app, y que al entrar explore las clases por sede ya sabiendo la ubicación.
- **Selector de sucursal reutilizado**: el usuario señaló explícitamente que los planes multisede ya tienen un select de sucursal en Reservas — reusar ese, no inventar UI nueva.
- **"Cortito pero bien hecho"**: el usuario quiere un proyecto acotado pero sólido; evitar over-engineering pero dejar el sistema de campañas **reutilizable** para el futuro.
- **Copy del email pendiente**: el contenido/tono/asunto del mail los aporta/itera el usuario (workflow de copy: el usuario da info cruda, Claude le da voz de marca). Estructura mínima requerida: asunto, oferta clara (sesión de prueba gratis), direcciones de sedes, 2 CTAs (app + WhatsApp), footer con unsubscribe.
  </specifics>

<deferred>
## Deferred Ideas

- **Follow-up / re-envío automático** a los que no abrieron o no reservaron (scheduler de re-targeting + tope de envíos por persona) — el sistema se deja preparado para segmentar, pero la automatización es fase futura (D-11).
- **Conversión automática post-asistencia** — por ahora recepción/admin sigue asignando el plan tras la prueba; no hay trigger automático freemium-asistió→activo.
- **Recordatorio pre-sesión** (push/email) para bajar el no-show — buena idea, fuera de scope de esta fase.
- **Landing web de reserva** (en `el-templo-web`) como alternativa a la app — descartada para esta fase (la app + WhatsApp cubren los dos canales).
- **Email Service Swap** (Resend → nodemailer + Workspace SMTP) — pendiente del backlog general; esta fase sigue sobre Resend.
- **Centralizar el cliente Resend duplicado** (franchise/gladius/academy/app-landing instancian Resend suelto) — oportunidad de limpieza; abordar solo si no expande el scope.

### Reviewed Todos (not folded)

None — no había todos pendientes que matchearan la fase.
</deferred>

---

_Phase: 119-Campaña de sesión de prueba freemium_
_Context gathered: 2026-06-01_
