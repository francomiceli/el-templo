# Phase 180: Campañas etapa 2 (magic links, selector de audiencias, ReservasPage informativa) - Context

**Gathered:** 2026-08-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Etapa 2 del sistema de campañas construido en la fase 119. Tres entregables:

1. **Magic links** — el link del email de campaña pasa de solo-tracking (D-21 de la 119) a **loguear al destinatario** y llevarlo directo a su destino, matando la fricción del login (con JWT/refresh vencidos, todos los freemium están deslogueados y el login mata el funnel click→reservó).
2. **Selector de audiencias** — el admin elige a qué segmento le habla cada campaña (hoy la audiencia es una query fija de freemium elegibles).
3. **ReservasPage más informativa para nuevos** — popup de elección de sede con direcciones, card "¿Primera vez?", confirmación post-reserva enriquecida + recordatorio push pre-sesión, descripciones por actividad.

**Restricción de gobernanza:** ejecutar POST-tren v6.0 en master — toca la member app (bump minor + builds de tiendas, un solo pasaje).

**Fuera de scope:** flujo self-service de re-alta para bajas (el CTA es WhatsApp); builder de filtros de audiencia; follow-up/re-envío automático (sigue diferido de la 119); forgot-password/passwordless general (el magic link es SOLO de campaña, no un login alternativo permanente en la UI).
</domain>

<decisions>
## Implementation Decisions

### Magic link — sesión y seguridad (revisa D-21 de la 119)

- **D-01:** El magic link validado emite un **login completo**: el mismo par access 30m + refresh 30d del login normal, reusando `RefreshTokenService` (rotación + reuse-detection existentes). Sin scopes acotados ni sesión "solo-reserva".
- **D-02:** El token de login es **multi-uso** y **expira a los 7 días** (decisión explícita del usuario; NO 30d). Multi-uso porque el prefetch de Gmail/Outlook quema los tokens one-use en GET. El token de tracking del click puede conservar el TTL de campaña (30d): pasada la semana, el link sigue trackeando y deep-linkeando pero ya no loguea.
- **D-03:** **Aterrizaje: ruta web nueva pública en el-templo-app** (extender `/r/trial` o ruta nueva `/r/...`) que valida el token contra la API, persiste la sesión emitida y redirige al destino. Hoy `/r/trial` NO existe como ruta web (cae en el catch-all 404, `routes.ts:77`) — hay que crearla. En nativo, el listener de deep links existente (`boot/deep-links.ts`) maneja el mismo path y debe también canjear el token por sesión.
- **D-04:** **Sesión previa en el device:** si la sesión activa es del mismo destinatario → solo navega (no re-loguea); si es de otro usuario o no hay sesión → loguea al destinatario del token (reemplazo explícito).
- **D-05:** **Token de login vencido degrada con gracia** (discreción técnica asentada): el click se trackea igual y el usuario aterriza en el login normal con redirect al destino — nunca en una pantalla de error.

### CTA del email (cambio sobre el brief original de la etapa 2)

- **D-06:** **UN SOLO CTA magic link** en el email — se descarta el diseño "botón primario personalizado a la sede del freemium + tabla de sedes con links por fila". La tabla de sedes queda **informativa** (nombre + dirección + Maps, como hoy), sin links de reserva por fila.
- **D-07:** La **elección de sede se muda a un popup dentro de la app**: al entrar a Reservas en modo prueba, un popup presenta las sedes con dirección + "Cómo llegar" (Maps) y el freemium elige ahí.
- **D-08:** El popup lo ve **todo freemium elegible en modo prueba**, venga del mail o no (coherente con D-20 de la 119: la experiencia se activa por elegibilidad, no por token).
- **D-09:** El popup **setea el selector de sede existente**, que queda disponible para cambiar después (y pasa a mostrar dirección — ver D-17). No se duplica UI.
- **D-10:** El CTA de **WhatsApp se mantiene como secundario** (D-14 de la 119, sin cambios).

### Audiencias — definición de segmentos y UX

- **D-11:** **Segmentos predefinidos** en el form de campaña (dropdown/radio) + el scope de país existente + **preview del conteo** antes de enviar. Sin builder de filtros combinables.
- **D-12:** Definiciones de segmento:
  - **Freemium elegibles** — la query actual de `listEligible()` (sin cambios de criterio).
  - **Bajas** — `status='inactivo'` Y tuvo alguna suscripción en el pasado (ex-socios que pagaron). Los inactivos que nunca pagaron NO entran (los cubre freemium).
  - **Prueba no convertida** — tuvo booking `is_trial` (asistió o `no_show`, no cancelado) y no compró plan (sin suscripción). Un solo segmento; no se usa `leadStatus='perdido'` como criterio.
  - **Alerta/Ausente** — `memberProfiles.segment IN ('alerta','ausente')` (fase 136). Ojo: segment NULL (<1 mes o sin plan) queda fuera.
  - **Referidos** — `referrals.referredId` con `status='pending'` (se registraron referidos pero nunca calificaron).
- **D-13:** **Destino del magic link fijo por segmento** (no configurable por campaña): freemium → Reservas modo prueba (con popup de sedes); bajas y prueba-no-convertida → app logueada con CTA WhatsApp prominente para coordinar la vuelta (no hay self-service de re-alta; además el guard una-por-vida impide re-reservar prueba); alerta/ausente → Reservas normal (ya tienen plan). Headline/copy sigue editable por campaña como hoy.
- **D-14:** **Un segmento por campaña.** Para llegar a dos segmentos se crean dos campañas (el funnel se lee por separado). Sin multi-select ni dedupe cross-segmento.
- **D-15:** Exclusiones globales se mantienen como invariantes para TODO segmento: email válido, no unsubscribed (`campaign_unsubscribes`), regla de <3 días de registro donde aplique.

### ReservasPage informativa

- **D-16:** **Card "¿Primera vez? Qué esperar"** (duración 1h, ropa cómoda/agua, llegar 10' antes, preguntar por el profe — contenido estático) visible **solo en modo prueba** (freemium elegible + prueba reservada). Los socios regulares no la ven.
- **D-17:** El **selector de sede** y el popup muestran **dirección + "Cómo llegar"** — `branches.address` ya existe (mig 0132); falta exponerla en `GET /members/scheduling/branches` (hoy devuelve solo `{id, name}`) y consumirla en la app.
- **D-18:** **Descripciones por actividad: el contenido lo cargan los dueños vía admin** — el campo `activities.description` YA existe y YA es editable en `ActivitiesDialog.vue`. La fase construye solo la exhibición: bottom sheet al tappear el nombre de la actividad en el slot + mensaje global "todas las clases son aptas para todos los niveles" (SIN chips de nivel por actividad). Nada de seed/migración de copy.
- **D-19:** **Confirmación post-reserva: enriquecer el estado existente** "prueba reservada" de ReservasPage (dirección + Maps, checklist de primera vez, calendario) — persiste en cada apertura de la app (anti no-show). Sin pantalla de éxito dedicada.
- **D-20:** **Recordatorio push pre-sesión de prueba ENTRA a la fase** (promovido desde las ideas diferidas de la 119, a pedido del usuario): push ~24h antes de la sesión reusando `pending_notifications` + FCM + `notification-cron`. Complementado con **botón de calendario en versión mínima** (link Google Calendar pre-armado, sin ICS) para cubrir al freemium web sin push.

### Resolución de preguntas abiertas del research (2026-08-22, confirmadas por el usuario)

- **D-21:** **El canje del magic link saltea el onboarding**: la ruta de aterrizaje queda exceptuada del guard de onboarding de la member app (`router/index.ts` ~45-52) mientras el usuario sea freemium — aterriza directo en su destino según D-13. La fase existe para matar fricción; no se agrega un paso nuevo.
- **D-22:** Refina D-12 (bajas): "tuvo alguna suscripción" significa **suscripción con pago real** — se excluyen las `price_type_applied='zero'` (staff/bonificadas), que nunca fueron clientes pagos.
- **D-23:** Revisa D-18: las descripciones de actividad siguen la **etiqueta mostrada al socio**. Como `deriveActivityLabel()` (fase 159-06) reetiqueta "General" como "Combos"/"Técnica" según el día, esas etiquetas derivadas tienen su **propia descripción editable en el admin**, además de la de cada actividad real. El bottom sheet muestra siempre la descripción que corresponde a la etiqueta que el socio ve — nunca el texto de "General" bajo un título "Combos". Mecánica de almacenamiento (tabla chica por etiqueta vs. otro esquema) a discreción técnica.
- **D-24:** Amplía D-20: el recordatorio ~24h pre-sesión tiene **fallback por email** — push si el usuario tiene device token; si no (el caso típico del freemium que llegó por mail y no instaló la app, donde `queueNotification()` descarta el enqueue), email de recordatorio reusando la infra de mail de la 119. El link de Google Calendar se mantiene como complemento.

### Claude's Discretion

- Mecánica exacta del canje token→sesión (endpoint de exchange, dónde vive, shape de la respuesta) — dentro de D-01..D-05.
- Si el token de login es el mismo HMAC de campaña extendido o un token separado emparentado al `sendId` — mientras respete multi-uso 7d y el tracking 30d.
- Detalle del recordatorio push (template, timing exacto, texto) y del link de Google Calendar.
- Diseño visual del popup de sedes y del bottom sheet de actividad (paleta de marca cálida, sin azul; dorado reservado a Aura).
- Naming de los segmentos en la UI del admin.
- Esquema de datos para persistir el segmento elegido en `campaigns` y su reflejo en el funnel.
  </decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Fase 119 (fundación del sistema de campañas)

- `.planning/phases/119-campa-a-de-sesi-n-de-prueba-freemium-reserva-self-service-si/119-CONTEXT.md` — D-01..D-27 de la 119; esta fase REVISA D-21 (token ahora sí autentica) y conserva D-20 (elegibilidad server-side), D-25 (deep link `app.eltemplo.org` + allowlist anti open-redirect), D-14 (WhatsApp), D-15 (unsubscribe solo marketing).
- `.planning/phases/119-campa-a-de-sesi-n-de-prueba-freemium-reserva-self-service-si/119-RESEARCH.md` — research de Resend/MJML/deep linking.

### Campañas (API)

- `el-templo-api/src/modules/campaigns/token-service.ts` — token HMAC actual (`signCampaignToken`, payload `{userId, campaignId, sendId, exp}`, `timingSafeEqual`); docblock D-21 a actualizar.
- `el-templo-api/src/modules/campaigns/service.ts` — `listEligible()` (líneas ~64-100, la query fija a generalizar en segmentos), `trialDeepLink()` (~695), `TRIAL_DEEP_LINK_BASE` (~39).
- `el-templo-api/src/modules/campaigns/routes.ts` — tracking `GET /track/open|/track/click|/unsubscribe` (públicos, allowlist de redirect).
- `el-templo-api/src/modules/campaigns/templates.ts` — template MJML (CTAs actuales, `sedeRow()`, `TrialCampaignVars`).
- `el-templo-api/src/db/schema/campaigns.ts` — `campaigns` / `campaign_sends` / `campaign_events` / `campaign_unsubscribes`.

### Auth (emisión de sesión)

- `el-templo-api/src/modules/auth/refresh-token-service.ts` — `issue()` / `rotate()` (rotación + reuse-detection que revoca familia), `REFRESH_TTL_MS`.
- `el-templo-api/src/modules/auth/routes.ts` §490-635 — login canónico (emite JWT legacy 7d + access 30m + refresh 30d): el patrón a reusar en el exchange del magic link. (Corrección del research: la referencia previa a `members/routes.ts` §386-513 apuntaba al export SEPA.) NO existe hoy ningún flujo passwordless — este es el primero.
- `el-templo-app/src/boot/axios.ts` — interceptor con lock de refresh; `el-templo-app/src/composables/useTokenStorage.ts` + `el-templo-app/src/stores/useAuthStore.ts` — persistencia de sesión que el canje debe alimentar.

### Deep links / rutas

- `el-templo-app/src/boot/deep-links.ts` — listener nativo `appUrlOpen`, `resolveDeepLinkRoute()` (`/r/trial` → `/reservas?trial=1`), manejo de `pendingRoute` sin auth.
- `el-templo-app/src/router/routes.ts` — **GAP: no existe ruta web `/r/trial`** (catch-all 404 en línea ~77); la ruta de aterrizaje del magic link es nueva.
- `el-templo-app/public/.well-known/` — assetlinks.json + apple-app-site-association (App/Universal Links ya configurados).

### ReservasPage / sedes / actividades

- `el-templo-app/src/pages/ReservasPage.vue` — estados (prueba reservada ~8-53, bloqueado ~57-71, modo prueba ~73+, regular), selectores de sede (~85-102 y ~255-271), `branchOptions` (~876-881, solo nombre), diálogos de confirmación (~613-714).
- `el-templo-app/src/composables/useSchedulingApi.ts` — `getBranches()` (~75-80), tipo `BranchOption {id, name}` sin address.
- `el-templo-api/src/modules/scheduling/routes.ts` §~994+ — `GET /members/scheduling/branches` (a extender con `address`/`mapsUrl`).
- `el-templo-api/src/db/schema/branches.ts` — `address` YA existe (línea ~48, mig 0132); ya se usa en `trials-service.ts:465` para el email.
- `el-templo-api/src/db/schema/activities.ts` — `description` YA existe (línea ~19); editable en `el-templo-admin/src/components/scheduling/ActivitiesDialog.vue` (~84-90).

### Audiencias (fuentes de segmentos)

- `el-templo-api/src/db/schema/users.ts` — `USER_STATUS_VALUES` (68-73), `leadStatusEnum` (84-88).
- `el-templo-api/src/db/schema/bookings.ts` — `isTrial`, `no_show`.
- `el-templo-api/src/db/schema/member-profiles.ts` — `memberSegmentEnum` (`optima|regular|alerta|ausente`, 41-45) + `segment` (68); motor en `segmentation/service.ts`; reglas NULL en `.planning/phases/136-*/136-CONTEXT.md`.
- `el-templo-api/src/db/schema/referrals.ts` — `referralStatusEnum` (`pending|qualified|revoked`), `referredId`.

### Notificaciones (recordatorio pre-sesión)

- `pending_notifications` + FCM + `notification-cron` (infra fase de notificaciones; patrón "Program Renewal Warning") — base del push pre-sesión de prueba.

### Gobernanza

- Memoria de proyecto `project_phase_119_freemium_trial_campaign.md` — estado del envío 1 (DNS Resend, copy, UAT pendientes) y contexto de la reactivación 2026-08-20 con Nacho.
  </canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- **Infra de campañas completa** (119): tablas, HMAC con `timingSafeEqual`, tracking pixel/click/unsubscribe, template MJML con vars editables por admin, "Enviar email de prueba". Esta fase extiende, no reconstruye.
- **`RefreshTokenService`** (116): emisión/rotación/reuse-detection listas — el exchange del magic link las reusa tal cual.
- **Listener de deep links + `.well-known`** (119): el path nativo ya funciona; falta solo el canje de token y la ruta web.
- **`branches.address`** y **`activities.description`**: columnas y (en actividades) edición admin YA existen — el trabajo es wiring de API + exhibición en la app.
- **Infra de push** (`pending_notifications` + FCM + cron): base del recordatorio pre-sesión.

### Established Patterns

- Facade services para dominios complejos; tests de integración contra MySQL real para toda ruta nueva (y las rutas nuevas disparan los 3 gates de tenancy — ver `reference_gates_tenancy_ruta_job_nueva`); migraciones a mano con numeración next-after-master y verificación de colisión (0208 ya tomado por analytics); sin `console.log`; sin `any`.
- Paleta de marca cálida sin azul; dorado reservado a Aura.

### Integration Points

- Endpoint de exchange token→sesión (módulo campaigns o auth) + ruta web de aterrizaje en el-templo-app + canje en el listener nativo.
- `listEligible()` se generaliza a un resolver de segmentos parametrizado; `campaigns` persiste el segmento; el form de campaña del admin suma selector + preview de conteo.
- `GET /members/scheduling/branches` suma `address`/link Maps; ReservasPage suma popup de sedes, card primera vez, bottom sheet de actividad, confirmación enriquecida.
- Cron de notificaciones suma el template/job del recordatorio de prueba.
  </code_context>

<specifics>
## Specific Ideas

- **Insight motor de la fase (Nacho):** con las sesiones vencidas, el login mata el funnel click→reservó; el tracking existente ya mide ese salto — la mejora tiene que verse ahí.
- **"Un solo CTA, la sede se elige adentro":** el usuario simplificó explícitamente el diseño original (botón por sede) a un único magic link + popup in-app informativo de sedes.
- **7 días de vida del login**, no 30 — decisión explícita del usuario, distinta del TTL de tracking.
- **Push propio > calendario** como anti no-show — el usuario prefirió notificaciones propias; el calendario quedó en versión mínima solo porque es barato.
  </specifics>

<deferred>
## Deferred Ideas

- **Self-service de re-alta para bajas** (elegir plan y pagar desde el mail) — el CTA de bajas es WhatsApp; un flujo de re-suscripción self-service es fase propia.
- **Builder de filtros de audiencia combinables** — descartado por over-engineering; los segmentos predefinidos cubren el uso real.
- **Follow-up/re-envío automático a no-abiertos** — sigue diferido desde la 119 (D-11).
- **Magic link como "olvidé mi contraseña" general** — el primer passwordless del sistema abre la puerta a un forgot-password real (hoy solo existe reset admin-driven a password temporal); es fase propia de auth.
- **ICS multiplataforma para el calendario** — se hace solo el link de Google; ICS si algún día se justifica.
- **Gestión de sedes en el admin (editar `address`)** — sigue diferida desde la 119 (D-24).

### Reviewed Todos (not folded)

- `v51-milestone-data-rollout.md` (rollout de `milestone_exercise_id`) — matcheó por keywords pero pertenece al árbol de entrenamiento v5.1; sin relación con campañas.
  </deferred>

---

_Phase: 180-Campañas etapa 2 (magic links, audiencias, ReservasPage informativa)_
_Context gathered: 2026-08-22_
