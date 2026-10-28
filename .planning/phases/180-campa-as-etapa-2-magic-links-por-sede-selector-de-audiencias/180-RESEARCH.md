# Fase 180: Campañas etapa 2 (magic links, selector de audiencias, ReservasPage informativa) — Research

**Investigado:** 2026-08-22
**Dominio:** Autenticación passwordless (magic link) + segmentación de audiencias de email + UX informativa de reservas en la member app
**Confianza global:** ALTA (casi todo verificado leyendo el código base real del tren v6.0; lo único MEDIA es la mecánica de calendario y las mitigaciones de prefetch, citadas de fuentes web)

**⚠ Base de código investigada:** `/home/franco/projects/et-176` (rama `feat/176-modulos`, HEAD `d3acea88`) — el **tren v6.0**, que es la base real de esta fase (la 180 corre POST-tren en master). El checkout principal (`docs/planning-untracked-2026-08`) está DESACTUALIZADO respecto de esa base y **no debe usarse como referencia**: sus `campaigns/service.ts` y `ReservasPage.vue` difieren, y le faltan las migraciones 0197-0207.

---

<user_constraints>

## User Constraints (de 180-CONTEXT.md)

### Locked Decisions

#### Magic link — sesión y seguridad (revisa D-21 de la 119)

- **D-01:** El magic link validado emite un **login completo**: el mismo par access 30m + refresh 30d del login normal, reusando `RefreshTokenService` (rotación + reuse-detection existentes). Sin scopes acotados ni sesión "solo-reserva".
- **D-02:** El token de login es **multi-uso** y **expira a los 7 días** (decisión explícita del usuario; NO 30d). Multi-uso porque el prefetch de Gmail/Outlook quema los tokens one-use en GET. El token de tracking del click puede conservar el TTL de campaña (30d): pasada la semana, el link sigue trackeando y deep-linkeando pero ya no loguea.
- **D-03:** **Aterrizaje: ruta web nueva pública en el-templo-app** (extender `/r/trial` o ruta nueva `/r/...`) que valida el token contra la API, persiste la sesión emitida y redirige al destino. Hoy `/r/trial` NO existe como ruta web (cae en el catch-all 404, `routes.ts:77`) — hay que crearla. En nativo, el listener de deep links existente (`boot/deep-links.ts`) maneja el mismo path y debe también canjear el token por sesión.
- **D-04:** **Sesión previa en el device:** si la sesión activa es del mismo destinatario → solo navega (no re-loguea); si es de otro usuario o no hay sesión → loguea al destinatario del token (reemplazo explícito).
- **D-05:** **Token de login vencido degrada con gracia** (discreción técnica asentada): el click se trackea igual y el usuario aterriza en el login normal con redirect al destino — nunca en una pantalla de error.

#### CTA del email (cambio sobre el brief original de la etapa 2)

- **D-06:** **UN SOLO CTA magic link** en el email — se descarta el diseño "botón primario personalizado a la sede del freemium + tabla de sedes con links por fila". La tabla de sedes queda **informativa** (nombre + dirección + Maps, como hoy), sin links de reserva por fila.
- **D-07:** La **elección de sede se muda a un popup dentro de la app**: al entrar a Reservas en modo prueba, un popup presenta las sedes con dirección + "Cómo llegar" (Maps) y el freemium elige ahí.
- **D-08:** El popup lo ve **todo freemium elegible en modo prueba**, venga del mail o no (coherente con D-20 de la 119: la experiencia se activa por elegibilidad, no por token).
- **D-09:** El popup **setea el selector de sede existente**, que queda disponible para cambiar después (y pasa a mostrar dirección — ver D-17). No se duplica UI.
- **D-10:** El CTA de **WhatsApp se mantiene como secundario** (D-14 de la 119, sin cambios).

#### Audiencias — definición de segmentos y UX

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

#### ReservasPage informativa

- **D-16:** **Card "¿Primera vez? Qué esperar"** (duración 1h, ropa cómoda/agua, llegar 10' antes, preguntar por el profe — contenido estático) visible **solo en modo prueba** (freemium elegible + prueba reservada). Los socios regulares no la ven.
- **D-17:** El **selector de sede** y el popup muestran **dirección + "Cómo llegar"** — `branches.address` ya existe (mig 0132); falta exponerla en `GET /members/scheduling/branches` (hoy devuelve solo `{id, name}`) y consumirla en la app.
- **D-18:** **Descripciones por actividad: el contenido lo cargan los dueños vía admin** — el campo `activities.description` YA existe y YA es editable en `ActivitiesDialog.vue`. La fase construye solo la exhibición: bottom sheet al tappear el nombre de la actividad en el slot + mensaje global "todas las clases son aptas para todos los niveles" (SIN chips de nivel por actividad). Nada de seed/migración de copy.
- **D-19:** **Confirmación post-reserva: enriquecer el estado existente** "prueba reservada" de ReservasPage (dirección + Maps, checklist de primera vez, calendario) — persiste en cada apertura de la app (anti no-show). Sin pantalla de éxito dedicada.
- **D-20:** **Recordatorio push pre-sesión de prueba ENTRA a la fase** (promovido desde las ideas diferidas de la 119, a pedido del usuario): push ~24h antes de la sesión reusando `pending_notifications` + FCM + `notification-cron`. Complementado con **botón de calendario en versión mínima** (link Google Calendar pre-armado, sin ICS) para cubrir al freemium web sin push.

### Claude's Discretion

- Mecánica exacta del canje token→sesión (endpoint de exchange, dónde vive, shape de la respuesta) — dentro de D-01..D-05.
- Si el token de login es el mismo HMAC de campaña extendido o un token separado emparentado al `sendId` — mientras respete multi-uso 7d y el tracking 30d.
- Detalle del recordatorio push (template, timing exacto, texto) y del link de Google Calendar.
- Diseño visual del popup de sedes y del bottom sheet de actividad (paleta de marca cálida, sin azul; dorado reservado a Aura).
- Naming de los segmentos en la UI del admin.
- Esquema de datos para persistir el segmento elegido en `campaigns` y su reflejo en el funnel.

### Deferred Ideas (FUERA DE SCOPE)

- **Self-service de re-alta para bajas** (elegir plan y pagar desde el mail) — el CTA de bajas es WhatsApp; un flujo de re-suscripción self-service es fase propia.
- **Builder de filtros de audiencia combinables** — descartado por over-engineering; los segmentos predefinidos cubren el uso real.
- **Follow-up/re-envío automático a no-abiertos** — sigue diferido desde la 119 (D-11).
- **Magic link como "olvidé mi contraseña" general** — el primer passwordless del sistema abre la puerta a un forgot-password real (hoy solo existe reset admin-driven a password temporal); es fase propia de auth.
- **ICS multiplataforma para el calendario** — se hace solo el link de Google; ICS si algún día se justifica.
- **Gestión de sedes en el admin (editar `address`)** — sigue diferida desde la 119 (D-24).

También fuera de scope (Phase Boundary): flujo self-service de re-alta, builder de filtros, follow-up automático, forgot-password/passwordless general.

</user_constraints>

<phase_requirements>

## Phase Requirements

No hay IDs de requisito mapeados en `.planning/REQUIREMENTS.md` para esta fase (el brief del ROADMAP y las decisiones D-01..D-20 de CONTEXT.md son la especificación de facto). El planner debería derivar IDs locales por entregable, p. ej.:

| ID propuesto | Descripción                                                       | Soporte del research                 |
| ------------ | ----------------------------------------------------------------- | ------------------------------------ |
| ML-01        | Endpoint público de canje token→sesión (access 30m + refresh 30d) | §Patrón 1, §Código 1, §Pitfall 1/2/3 |
| ML-02        | Ruta web pública `/r/trial` + guard bypass + canje                | §Patrón 2, §Pitfall 4                |
| ML-03        | Canje en el listener nativo de deep links                         | §Patrón 2, §Pitfall 5                |
| ML-04        | Degradación con gracia de token vencido (D-05)                    | §Patrón 1                            |
| AUD-01       | Resolver de segmentos parametrizado (5 segmentos)                 | §Patrón 3, §Código 2                 |
| AUD-02       | Columna `campaigns.segment` + form del admin + preview de conteo  | §Patrón 3, §Pitfall 8                |
| AUD-03       | Destino del magic link fijo por segmento (D-13)                   | §Patrón 3                            |
| RES-01       | `GET /members/scheduling/branches` expone `address` (+ Maps)      | §Patrón 4                            |
| RES-02       | Popup de sedes en modo prueba                                     | §Patrón 4                            |
| RES-03       | Card "¿Primera vez?"                                              | §Patrón 4                            |
| RES-04       | Confirmación post-reserva enriquecida + botón calendario          | §Código 4                            |
| RES-05       | Bottom sheet de descripción de actividad                          | §Pitfall 9 (¡crítico!)               |
| NOT-01       | Recordatorio push pre-sesión de prueba                            | §Patrón 5, §Pitfall 10               |

</phase_requirements>

## Summary

La fase toca **tres subsistemas independientes** que comparten una sola cosa: la member app. Eso importa porque el costo de coordinación (bump minor + builds de tiendas, un solo pasaje) es lo que justifica agruparlos, no una dependencia técnica real. **Los tres se pueden planificar como olas paralelas** salvo por dos acoplamientos concretos: (a) el destino del magic link por segmento (D-13) une magic links con audiencias, y (b) el popup de sedes (D-07) depende de que `GET /branches` devuelva `address` (D-17).

**La base de esta fase es el tren v6.0**, y eso cambia materialmente el trabajo respecto de lo que sugiere el brief. En el tren, `campaigns` ya está adoptado a tenancy: `listEligible(ctx, country)` recibe `TenantContext` primero, las 4 tablas tienen `tenant_id`, la supresión de bajas es `UNIQUE (tenant_id, email)`, y hay una batería de aislamiento dedicada (`test/tenancy/iso-03-campaigns.test.ts`). **Toda ruta nueva de esta fase dispara los 3 gates de tenancy** (manifiesto ISO-01 con `ENTRADAS_BASELINE = 370`, lint CON-06, sentinel CON-05). El endpoint de canje del magic link es el caso difícil: es **público sin actor**, así que no tiene `request.scope` y debe resolver el tenant server-side desde la fila `campaign_sends` del `sendId` firmado — exactamente el idioma que ya usa `tracking-service.ts` (T-175-02), con la exención `/* tenant-safe: … */` **duplicada** (comentario TS para el lint + comentario EMBEBIDO en el SQL para el sentinel de runtime).

El hallazgo más caro del relevamiento no está en el magic link sino en **D-18**: el `activityName` que muestra la grilla **no es** `activities.name` — pasa por `deriveActivityLabel()` (fase 159-06), que reetiqueta la actividad genérica "General" como "Combos"/"Técnica" según el `sessionMode` del día. Un bottom sheet que muestre `activities.description` por `activityId` le mostraría al freemium la descripción de "General" bajo un título que dice "Combos". Hay que resolverlo explícitamente antes de escribir la tarea. El segundo hallazgo caro es **D-20**: `queueNotification()` **descarta el enqueue si el usuario no tiene device token**, y un freemium que llega por email casi nunca tiene la app instalada — el push pre-sesión va a ser no-op para el grueso del público objetivo, lo que convierte al link de calendario (que el CONTEXT trata como "barato y complementario") en el mecanismo anti-no-show **principal**, no el secundario.

**Recomendación primaria:** implementar el canje del magic link como **endpoint nuevo `POST /api/campaigns/exchange`** (POST, no GET — mata el prefetch de escáneres de correo de raíz) llamado desde una ruta web pública nueva `/r/trial` que reciba el token por query, más el mismo canje en el listener nativo; reusar el HMAC existente agregando un campo de propósito y un `exp` propio de 7d, sin tabla nueva; generalizar `listEligible` a un `resolveAudience(ctx, segment, country)` con 5 ramas y una columna `campaigns.segment`; y tratar las tres piezas de ReservasPage como trabajo de UI de riesgo bajo salvo el bottom sheet de actividad.

## Architectural Responsibility Map

| Capacidad                                        | Tier primario                                 | Tier secundario                  | Racional                                                                                                       |
| ------------------------------------------------ | --------------------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Emisión del token de magic link                  | API (campaigns)                               | —                                | El token se firma al enviar el email; el secreto (`JWT_SECRET`) es server-side                                 |
| Validación + canje token→sesión                  | API (nuevo endpoint público)                  | —                                | Emitir refresh tokens es responsabilidad exclusiva de `RefreshTokenService`; el cliente nunca decide identidad |
| Persistencia de la sesión canjeada               | Client (member app)                           | —                                | `useTokenStorage` (Preferences en nativo, localStorage en web) es la única fuente de tokens del cliente        |
| Aterrizaje web del link                          | Client (Vue router, ruta pública)             | Frontend estático (SPA fallback) | El SPA resuelve `/r/trial`; nginx solo tiene que servir `index.html`                                           |
| Aterrizaje nativo del link                       | Client (`boot/deep-links.ts` + `.well-known`) | —                                | App/Universal Links ya configurados en la 119                                                                  |
| Tracking del click                               | API (`/track/click`)                          | —                                | Ya existe; no cambia de tier                                                                                   |
| Resolución de la audiencia por segmento          | API (`CampaignService`)                       | —                                | Es SQL sobre 5 tablas con `tenantWhere`; jamás debe salir del server                                           |
| Elección de segmento + preview                   | Admin (Vue) → API                             | —                                | UI de composición; el conteo lo calcula el server                                                              |
| Popup de sedes / card primera vez / bottom sheet | Client (ReservasPage)                         | API (`/branches` con `address`)  | Presentación pura; el dato de dirección viene del server                                                       |
| Link "Cómo llegar" (Maps)                        | Client                                        | —                                | URL derivada de `address`; no requiere API key ni backend                                                      |
| Link "Agregar al calendario"                     | Client                                        | —                                | URL `calendar.google.com/render` armada en el cliente con datos que ya tiene                                   |
| Recordatorio push pre-sesión                     | API (job/cron + `NotificationService`)        | Client (FCM device token)        | El scheduling y el envío son server-side; el cliente solo recibe                                               |

## Project Constraints (de CLAUDE.md)

Directivas accionables que el plan DEBE respetar:

| Directiva                                                                                                                                                                   | Aplicación en esta fase                                                                                                                              |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Nunca `console.log`** — API usa `request.log`/`app.log` (Pino); frontends usan `createLogger()` de `src/utils/logger.ts`                                                  | El canje del magic link y el boot de deep links deben loguear con `createLogger`, no `console`                                                       |
| **Sin `any`** — usar `unknown` + narrowing o interfaces                                                                                                                     | Shape de la respuesta del canje, tipos de segmento, `BranchOption` extendido                                                                         |
| **`catch (err: unknown)` + `instanceof Error`**                                                                                                                             | Todos los catch nuevos                                                                                                                               |
| **Toda ruta API nueva lleva test de integración en `el-templo-api/test/`** contra MySQL real (`eltemplo_test`)                                                              | Endpoint de canje + `/branches` extendido + audiencias por segmento                                                                                  |
| **Cambios de schema por Drizzle + migración SQL a mano**; `_migrations` es la fuente de verdad; **nunca `drizzle-kit migrate`**; **nunca `;` dentro de un comentario `--`** | `campaigns.segment` (y cualquier índice que se agregue)                                                                                              |
| **`.env.example` se actualiza al agregar env var**                                                                                                                          | Ver §Environment Availability — `PUBLIC_API_BASE_URL` ya está en uso y **falta** en `.env.example` (deuda pre-existente, buen momento para saldarla) |
| **Facade pattern para servicios complejos**                                                                                                                                 | `CampaignService` ya es una facade; el resolver de segmentos vive adentro o en un `audience-service.ts` colgado de ella                              |
| **Stores Pinia composition API; composables exponen `cleanup()`, sin `onUnmounted` adentro**                                                                                | Cualquier composable nuevo del popup/bottom sheet                                                                                                    |
| **Sentry:** `createLogger().error()` en el front va a Sentry automáticamente                                                                                                | Cuidado con loguear fallos esperados del canje (token vencido = camino normal, D-05) como `error` → ruido en Sentry. Usar `warn`                     |
| **Pre-commit Husky + lint-staged; si falla, commit nuevo (no amend)**                                                                                                       | Higiene de ejecución                                                                                                                                 |

Y de la memoria de proyecto (gates personales del usuario, no negociables):

- **Nunca instalar/actualizar dependencias sin preguntar.** Esta fase **no necesita paquetes nuevos** (ver §Standard Stack) — si un plan propone uno, es una señal de alarma.
- **Nunca `git add -A` / `git add .`** — stagear por ruta.
- **No correr la suite completa local** (lo hace CI); typecheck sí. `vue-tsc` para app/admin porque **CI no typechequea los frontends**.
- **Staging-first estricto**; preguntar antes de push y antes de SSH.
- **Version bump:** feature ⇒ minor.

## Standard Stack

### Core — todo YA está instalado, cero dependencias nuevas

| Librería                                                                     | Versión      | Propósito en esta fase                        | Por qué es la estándar acá                                                                                              |
| ---------------------------------------------------------------------------- | ------------ | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `node:crypto` (`createHmac`, `timingSafeEqual`, `randomBytes`, `createHash`) | builtin      | Firmar/validar el token del magic link        | Es lo que ya usan `campaigns/token-service.ts`, `shared/qr-token.ts` y `RefreshTokenService`. `[VERIFIED: código base]` |
| `@fastify/jwt` (vía `fastify.jwt.sign`)                                      | ya instalado | Emitir el access token 30m en el canje        | Idéntico al login (`auth/routes.ts:612-617`). `[VERIFIED: código base]`                                                 |
| `RefreshTokenService` (interno, fase 116)                                    | —            | Emitir el refresh 30d opaco                   | D-01 lo manda explícitamente; ya trae rotación + reuse-detection + `tenant_id` estampado. `[VERIFIED: código base]`     |
| `drizzle-orm` (mysql2)                                                       | ya instalado | Queries de segmentos                          | `[VERIFIED: código base]`                                                                                               |
| `mjml` v5                                                                    | ya instalado | Template del email (CTA único)                | Dependencia aprobada en la 119 (D-23). `[VERIFIED: código base]`                                                        |
| Quasar (`QDialog`/`QBottomSheet`/`QSelect`/`QExpansionItem`)                 | ya instalado | Popup de sedes, bottom sheet, card colapsable | Framework de UI del proyecto. `[VERIFIED: código base]`                                                                 |
| `@capacitor/app` + `@capacitor/preferences`                                  | ya instalado | Deep link nativo + persistencia de tokens     | `boot/deep-links.ts` y `useTokenStorage.ts`. `[VERIFIED: código base]`                                                  |
| `firebase-admin` / FCM (vía `NotificationService`)                           | ya instalado | Push pre-sesión                               | `[VERIFIED: código base]`                                                                                               |
| `node-cron`                                                                  | ya instalado | Scheduling del recordatorio                   | `jobs/notification-cron.ts`. `[VERIFIED: código base]`                                                                  |

### Alternativas consideradas (y por qué NO)

| En vez de                                           | Se podría usar                                 | Tradeoff                                                                                                                                                                                                                                                                                |
| --------------------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HMAC stateless extendido                            | Tabla `magic_link_tokens` con hash + `used_at` | Permite revocación individual y auditoría, pero D-02 pide **multi-uso** (así que `used_at` no aporta) y agrega una migración + una tabla + estampado de `tenant_id`. **No vale el costo.** Excepción: si el planner quiere poder invalidar un link filtrado, la tabla es la única forma |
| Reusar el HMAC de campaña con un campo de propósito | Token JWT firmado con `fastify.jwt`            | El HMAC actual (`base64url(payload).sig`) ya está probado, testeado (`test/campaign-token.test.ts`) y no arrastra el `exp` del JWT de sesión. Un JWT como magic link se confundiría con un access token en logs. **Preferir el HMAC**                                                   |
| Endpoint POST de canje                              | GET que canjea directo                         | GET es lo que rompen los escáneres de correo y el prefetch. Ver §Pitfall 1                                                                                                                                                                                                              |
| Nuevo paquete `add-to-calendar`                     | URL armada a mano                              | El link de Google Calendar son 5 query params. Hand-roll acá es lo correcto                                                                                                                                                                                                             |

**Instalación:** ninguna. `npm install` / `pnpm add` **no debe aparecer en ningún plan de esta fase**.

## Package Legitimacy Audit

**No aplica: esta fase no instala paquetes externos.** Todo el stack necesario ya está en `package.json` de los tres apps (verificado leyendo imports reales en el tren v6.0). Si durante la planificación aparece la necesidad de un paquete nuevo, se debe:

1. Correr el gate de legitimidad (`slopcheck install <pkg> --json`, `npm view <pkg> version`, `npm view <pkg> scripts.postinstall`).
2. **Preguntarle al usuario antes de instalarlo** (regla dura del proyecto: nunca instalar deps sin preguntar).

| Paquete     | Registry | Disposición |
| ----------- | -------- | ----------- |
| — (ninguno) | —        | N/A         |

## Architecture Patterns

### Diagrama de flujo del magic link

```
[Email de campaña]
   │  CTA único (bulletproof button, texto vivo, images-off safe)
   │  href = https://api.eltemplo.org/api/campaigns/track/click?t=<HMAC>
   ▼
[GET /api/campaigns/track/click]  ── público, sin auth
   │  1. validateCampaignToken(t) → payload {userId, campaignId, sendId, exp} | null
   │  2. recordClick(sendId, destino)   ← degrada en silencio si falla
   │  3. destino DERIVADO de allowlist (host app.eltemplo.org) ← NUNCA echo del query
   ▼  302
[https://app.eltemplo.org/r/trial?t=<HMAC>]
   │
   ├─── NATIVO (app instalada, App/Universal Links)
   │      └─> boot/deep-links.ts  appUrlOpen
   │             ├─ parsea path + EXTRAE ?t=  (hoy lo IGNORA a propósito — D-21)
   │             └─> mismo canje que la rama web ──┐
   │                                                │
   └─── WEB (sin app o desktop)                     │
          └─> Vue router, ruta PÚBLICA nueva `/r/trial`
                 ├─ guard: bypass de auth (publicRoutes)
                 └─> canje ─────────────────────────┤
                                                    ▼
                          [POST /api/campaigns/exchange  {token}]  ── público
                             │ a. validateCampaignToken + chequeo de propósito + exp 7d
                             │ b. lookup campaign_sends por sendId → tenant_id  (tenant-safe)
                             │ c. lookup users por userId (scopeado a ese tenant)
                             │ d. gates: deletedAt, staffDisabled, coherencia userId↔send
                             │ e. fastify.jwt.sign(payload) → accessToken 30m
                             │ f. RefreshTokenService.issue(userId) → refresh 30d
                             ▼
                          { accessToken, refreshToken, user{...}, destino }
                                                    │
                    ┌───────────────────────────────┴──────────────────┐
             token OK                                          token vencido/inválido
                    │                                                   │
      D-04: ¿sesión activa?                                   D-05: degradar con gracia
        ├─ mismo userId → SOLO navegar                          → /login con pendingRoute
        └─ otro/ninguno → setTokens() + hydrate → navegar          (nunca pantalla de error)
                    ▼
      destino por segmento (D-13):
        freemium              → /reservas?trial=1  (+ popup de sedes)
        bajas / no-convertida → app logueada con CTA WhatsApp
        alerta / ausente      → /reservas (normal)
```

### Patrón 1 — Endpoint público que resuelve tenant desde un token firmado

**Qué:** Una ruta sin `fastify.authenticate` no tiene `request.scope`, así que **no puede** usar `assertTenant(request.scope, …)`. El tenant se deriva de la fila que el token identifica.

**Cuándo:** El endpoint de canje del magic link (y cualquier ruta pública futura de campañas).

**Precedente exacto en el código:** `campaigns/tracking-service.ts` (T-175-02) — el `sendId` del token firmado resuelve `campaign_sends.tenant_id`, y ese `tenantId` se estampa en todo lo que se escriba después vía `tenantValues({tenantId}, …)`.

**La exención va DUPLICADA:** un comentario de bloque TS pegado al acceso (lo lee el **lint** CON-06, ancla AST) **y** el mismo texto embebido dentro del `sql` (lo lee el **sentinel** de runtime CON-05, que solo ve el SQL final — Drizzle nunca emite comentarios TS al pool). Omitir cualquiera de los dos rompe CI.

```ts
// Source: el-templo-api/src/modules/campaigns/tracking-service.ts (tren v6.0)
/* tenant-safe: sendId del token firmado (D-21), resuelve el tenant antes de tener ctx — pre-scope, no hay actor en esta ruta publica (T-175-02) */
const [send] = await this.db
  .select({ tenantId: schema.campaignSends.tenantId /* … */ })
  .from(schema.campaignSends)
  .where(
    sql`/* tenant-safe: sendId del token firmado (D-21), resuelve el tenant antes de tener ctx — pre-scope, no hay actor en esta ruta publica (T-175-02) */ ${schema.campaignSends.id} = ${sendId}`,
  );
```

**Anti-patrón:** meter el `tenantId` en el payload del token. El token viaja por email y es manipulable en intención (aunque firmado); el idioma establecido del repo es **resolver el tenant desde la base, nunca del payload**, y la batería `iso-03-campaigns.test.ts` lo prueba explícitamente.

### Patrón 2 — Ruta web pública + canje idempotente en dos superficies

**Qué:** El mismo canje corre en dos lugares (ruta web y listener nativo). Extraer la lógica a **un composable único** (`useMagicLink()` con `exchange(token)`) y llamarlo desde ambos.

**Por qué:** El listener nativo hoy **ignora deliberadamente** el `?t=` (`deep-links.ts:22-24`, D-21). Si se agrega el canje solo en la ruta web, un usuario con la app instalada nunca se loguea (App Links intercepta la URL antes de que llegue al navegador) y la fase falla justo en el caso de más valor.

**Contrato de la ruta web:**

- La ruta debe estar en `publicRoutes` del guard (`router/index.ts:31`), hoy `['login','register']`. Sin eso, el guard redirige a `login` **antes** de que el componente monte y el token se pierde.
- Después del canje exitoso hay que respetar el **guard de onboarding** (`router/index.ts:45-52`): un `member` con `onboardingCompleted === false` es redirigido a `onboarding` pase lo que pase. Para un freemium recién logueado por magic link esto es probable. **Decidir explícitamente:** ¿el freemium hace onboarding antes de reservar (fricción que la fase quiere matar) o se lo saltea? Esto es una pregunta abierta real (ver §Open Questions).

### Patrón 3 — Resolver de audiencias parametrizado

**Qué:** `listEligible(ctx, country)` pasa a ser un caso de `resolveAudience(ctx, segment, country)`. Las 5 ramas comparten las **invariantes globales de D-15** (email no nulo, no unsubscribed en ESTE tenant, y la regla de 3 días donde aplique) y difieren en el predicado de negocio.

**Forma recomendada:** una función por segmento que devuelva `SQL[]` de condiciones, más un dispatcher. Las invariantes se componen una sola vez. Esto mantiene un solo `.from(users).innerJoin(branches)` y un solo lugar donde vive el `tenantWhere(u, ctx)`.

**Regla de tenancy no obvia (mina M3, ya resuelta en el tren — NO regresionarla):** el `NOT EXISTS` sobre `campaign_unsubscribes` correlaciona por **email**, y el email **no es único global** (la unique es `(tenant_id, email)` desde la mig 0196). Ese subquery lleva su **propio** `AND ${unsub.tenantId} = ${ctx.tenantId}`. Los subqueries que correlacionan por `users.id` (subscriptions, bookings) **no** lo necesitan, porque `users.id` sí es PK global y ya está acotado por el `tenantWhere(u, ctx)` externo. Toda rama nueva de segmento tiene que aplicar el mismo criterio: **¿este subquery correlaciona por una columna única global (id) o por una que no lo es (email, code, dni)?**

**Trampa de construcción (documentada en el código):** el `tenantWhere` va **inline en el `and(...)` final**, no en el array `conditions` — el lint juzga por STATEMENT, y el array se construye en statements separados del `.from(u)…where(…)`.

**Persistencia:** `campaigns` no tiene columna de segmento hoy. Agregar `segment varchar(32) NOT NULL DEFAULT 'freemium_elegibles'` (soft-enum, consistente con `status`/`type` del módulo — la convención documentada del schema es varchar, no enum de DB). El default preserva las campañas existentes sin backfill.

### Patrón 4 — Extensión aditiva del endpoint de sedes

`GET /api/members/scheduling/branches` devuelve hoy `{branches:[{id,name}]}`. Agregar `address` (nullable) es **aditivo y no rompe** el consumidor actual (`BranchOption` en `types/scheduling.ts`). El `mapsUrl` se puede derivar en el cliente (`https://www.google.com/maps/search/?api=1&query=` + `encodeURIComponent(address)`) o en el server — el template del email ya soporta `mapsUrl` opcional en `sedeRow()` pero `loadSedes()` no lo provee, así que **derivarlo server-side en un helper compartido** cierra las dos puntas de una.

**Ojo con el shim de nombres:** `ReservasPage.vue:882` hace `b.name.replace(/^El Templo\s+/i, 'Sede ')`. En paralelo, la fase de analytics agregó un shim **API-side** (`app-branch-name.ts`) para el mismo problema tras el rename de sedes (mig 0208). Al planificar hay que verificar cuál shim está vivo en la base real para no aplicar el reemplazo dos veces ("Sede Sede X").

### Patrón 5 — Notificación programada

Dos formas disponibles, con tradeoffs distintos:

| Forma                                   | Cómo                                                                                                 | Ventaja                                              | Desventaja                                                                                                                                                                                |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Enqueue en el momento de la reserva** | `queueNotification({userId, templateKey, scheduledAt: clase − 24h})` desde `reserveTrialSelfService` | Cero infra nueva, cero gates de cron                 | Se evalúa el device token **en el enqueue** → si el freemium instala la app después, no hay push. Cancelar/cambiar la prueba deja la notificación huérfana (hay que borrarla o filtrarla) |
| **Job de barrido diario**               | Nuevo job en `src/jobs/` que busca trials de mañana y encola                                         | Robusto ante instalación tardía y cambios de horario | Dispara el gate **CON-04** (`JOBS_ESPERADOS` + `forEachActiveTenant` obligatorio)                                                                                                         |

**Recomendación:** enqueue en la reserva **más** limpieza en la cancelación (`cancel-trial` y `reserveTrial` de cambio de horario ya existen y son los dos únicos caminos que invalidan el recordatorio). Es la opción con menos superficie de gates y el caso "instala la app después de reservar" es marginal frente al caso "no la instala nunca".

**Plantilla nueva sin migración:** los templates se siembran desde `TEMPLATE_SEEDS` en `modules/notifications/types.ts` vía `seedTemplates(ctx)`, que corre **idempotente por tenant** desde el cron. Agregar una entrada al array alcanza — **no hace falta migración SQL** para el template. (Verificado: no existe ningún `INSERT INTO notification_templates` en las migraciones.)

Categoría sugerida: `anuncios` (default `true` en `getUserPreferences`, así que el freemium lo recibe sin haber tocado preferencias).

### Anti-patrones a evitar

- **Canjear en un GET.** Ver §Pitfall 1.
- **Meter el `tenantId` (o el rol, o cualquier claim de autorización) en el payload del magic link.** El token IDENTIFICA; la base AUTORIZA.
- **Emitir la sesión sin pasar por `RefreshTokenService.issue()`.** Un refresh escrito a mano se saltea el estampado de `tenant_id` y la cadena de rotación.
- **Duplicar el selector de sede** en vez de que el popup setee el existente (D-09 lo prohíbe explícitamente).
- **Crear una pantalla de éxito post-reserva.** D-19 dice enriquecer el estado existente.
- **Loguear el token (ni truncado) en Pino/Sentry.** Un magic link en un log es una sesión regalada por 7 días.

## Don't Hand-Roll

| Problema                                                     | No construyas                    | Usá esto                                                  | Por qué                                                                                                                                               |
| ------------------------------------------------------------ | -------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Emitir el refresh token de la sesión canjeada                | Un `randomBytes` + insert propio | `RefreshTokenService.issue(userId)`                       | Ya hace hash sha256 (nunca guarda plaintext), expiry 30d, estampa `tenant_id` derivado del user, y participa de la cadena de rotación/reuse-detection |
| Comparar la firma HMAC                                       | `providedSig !== expectedSig`    | `timingSafeEqual` con chequeo previo de longitud          | Ya resuelto en `token-service.ts` (CR-03: oráculo de timing)                                                                                          |
| Persistir la sesión en el cliente                            | `localStorage.setItem` directo   | `useTokenStorage().setTokens()`                           | Abstrae nativo (Preferences) vs web (localStorage) y limpia el `authToken` legacy                                                                     |
| Refrescar el access token vencido                            | Reintentos ad-hoc                | El interceptor de `boot/axios.ts` con su lock compartido  | Un segundo camino de refresh dispara reuse-detection y desloguea al usuario                                                                           |
| Escapar el copy del admin en el email                        | Concatenación                    | `esc()` de `templates.ts`                                 | Ya cubre `& < > " '`                                                                                                                                  |
| Derivar el nombre de clase visible                           | Leer `activities.name`           | `deriveActivityLabel()`                                   | Es la fuente única (159-06); ignorarla produce el bug de §Pitfall 9                                                                                   |
| Chequear la ventana de cancelación/modificación de la prueba | Comparar fechas a mano           | `isOutsideCancelWindow()` de `trials-service.ts`          | Es DST-aware por timezone de sede                                                                                                                     |
| Resolver el país de la campaña                               | Lógica nueva                     | `attachScope` + `scopeCountry()` de `campaigns/routes.ts` | Ya maneja owner (global) vs admin (pinneado)                                                                                                          |

**Insight clave:** en este repo, casi todo lo que parece "hay que construirlo" ya existe con un nombre no obvio. El costo real de la fase no está en escribir código nuevo sino en **encontrar y respetar las fuentes únicas existentes** (`deriveActivityLabel`, `covered-until`, `RefreshTokenService`, `isOutsideCancelWindow`, `TEMPLATE_SEEDS`). Un plan que no las nombre explícitamente va a producir duplicación.

## Runtime State Inventory

No es una fase de rename/refactor, pero sí toca estado de runtime que no vive en git. Relevado explícitamente:

| Categoría                      | Encontrado                                                                                                                                                                                                | Acción requerida                                                                                                                                              |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Datos almacenados**          | `campaigns` en prod: la campaña de la fase 119 aún **no fue enviada** (DNS de Resend pendiente). No hay filas de `campaign_sends` que dependan del shape viejo del token                                  | Ninguna migración de datos. La columna `segment` con DEFAULT cubre lo existente                                                                               |
| **Config de servicio vivo**    | Resend: dominio de envío + `CAMPAIGN_EMAIL_FROM` (en `.env` de prod, no en git). FCM: credenciales de Firebase                                                                                            | Ninguna. La fase no cambia remitente ni proyecto FCM                                                                                                          |
| **Estado registrado en el SO** | Ninguno — no hay tasks ni servicios que embeban strings de esta fase                                                                                                                                      | Ninguna                                                                                                                                                       |
| **Secrets / env vars**         | `JWT_SECRET` (firma el HMAC de campaña **y** los JWT de sesión). `PUBLIC_API_BASE_URL` está **en uso en el código** (`service.ts:44`) pero **NO en `.env.example`**                                       | Saldar la deuda: agregarlo a `.env.example`. **No rotar `JWT_SECRET` durante la fase** — invalidaría todos los magic links en vuelo Y todos los access tokens |
| **Artefactos de build**        | Builds de tiendas (iOS/Android): la fase toca la member app ⇒ bump minor + build + submit. Los `.well-known` (assetlinks/AASA) ya están publicados y **no cambian** (el path `/r/trial` ya está cubierto) | Bump de versión + builds, un solo pasaje (restricción de gobernanza del CONTEXT)                                                                              |
| **Templates de notificación**  | Filas en `notification_templates` por tenant, sembradas por `seedTemplates` desde `TEMPLATE_SEEDS` en el boot del cron                                                                                    | El template nuevo se auto-siembra. **Verificar en prod** que corrió (el cron siembra al arrancar; un deploy sin restart del proceso no lo haría)              |

## Common Pitfalls

### Pitfall 1 — Los escáneres de correo queman los magic links de un solo uso

**Qué sale mal:** Microsoft Defender / Safe Links, Proofpoint, Mimecast y el prefetch de clientes de correo hacen GET a todos los links del email **antes** de que el humano los vea. Con un token one-use, el usuario clickea un link ya muerto.
**Por qué pasa:** el escaneo es transparente y no distingue "link informativo" de "link que consume estado".
**Cómo evitarlo:** D-02 ya elige la mitigación principal (**multi-uso** + expiración por tiempo). Refuerzos disponibles, en orden de valor:

1. **Canjear en POST, no en GET** — el escáner hace GET/HEAD; el POST solo lo dispara el JS de la landing tras el click humano. Esta es la razón técnica de recomendar `POST /api/campaigns/exchange` en vez de un GET que canjee y redirija.
2. Responder a `HEAD` sin efectos (Fastify sintetiza un HEAD por cada GET — el manifiesto ISO-01 ya lo excluye, pero el handler debe ser inerte).
3. `Referrer-Policy: no-referrer` en la landing, para que el token no viaje en el `Referer` a terceros.
   **Señales tempranas:** el funnel muestra clicks pero cero reservas; o `campaign_events` con clicks a los segundos del envío (patrón de escáner, no humano).
   `[CITED: github.com/better-auth/better-auth/discussions/6985, securityboulevard.com, github.com/orgs/supabase/discussions/41618]`

### Pitfall 2 — La ruta pública nueva rompe los 3 gates de tenancy

**Qué sale mal:** CI rojo en `iso-01-manifiesto`, `con-06-lint` y/o `con-05-sentinel`.
**Cómo evitarlo (checklist obligatorio por cada ruta nueva):**

1. Agregar la clave `"POST /api/campaigns/exchange"` (y toda ruta nueva) a `TENANT_MANIFEST` en `el-templo-api/test/tenant-manifest.ts`, categoría **`tenant-scoped`** (el precedente de las 3 rutas públicas de campañas, aprobado por Franco 2026-07-29, es explícito: son públicas y por token pero se clasifican `tenant-scoped`, NO `global`, para no contradecir la decisión Q5 de supresión por tenant).
2. Bumpear `ENTRADAS_BASELINE` en `test/tenancy/iso-01-manifiesto.test.ts` (**hoy vale 370**) y el número en el título del `it`.
3. **NO** agregar nada a `tenant-lint-allowlist.json` (D-13/D-14 lo prohíben — la lista solo se achica). Usar `tenantWhere`/`tenantValues`, o la exención `/* tenant-safe: motivo */` **duplicada** (TS + embebida en el SQL).
4. Verificar local: `pnpm --dir el-templo-api lint:tenant`.
5. Si se agrega un **job** nuevo: sumarlo a `JOBS_ESPERADOS` en `con-04-crons-per-tenant.test.ts` y envolverlo en `forEachActiveTenant`.
   **Además:** la batería `test/tenancy/iso-03-campaigns.test.ts` cubre hoy "las 10 rutas tenant-scoped de /api/campaigns" y lo dice en su docblock. Toda ruta nueva de campañas debería sumarse ahí (y actualizarse el conteo del comentario).

### Pitfall 3 — Confundir "el token identifica" con "el token autoriza" (D-21 → D-01)

**Qué sale mal:** esta fase **invierte** el invariante más documentado de la 119. Hay docblocks en `token-service.ts`, `campaigns/routes.ts`, `deep-links.ts` y el manifiesto que afirman "el token NUNCA autoriza".
**Cómo evitarlo:** separar **dos tokens conceptualmente distintos** aunque compartan mecanismo:

- **Token de tracking** — TTL 30d, sigue sin autorizar, lo consumen `/track/open`, `/track/click`, `/unsubscribe`. **Su docblock no cambia.**
- **Token de login** — TTL 7d, autoriza el canje, lo consume solo `/exchange`.
  Si se implementan como el mismo string HMAC con un campo `purpose`, **el validador de cada ruta debe verificar el `purpose`**: `/track/click` debe rechazar un token de login y viceversa. Sin eso, un token de tracking de 30d se convierte de facto en un login de 30d y se viola D-02.
  Y hay que **actualizar los docblocks** de los 4 archivos, o el próximo que lea el código va a creer lo que dicen.

### Pitfall 4 — El guard del router mata el canje antes de que empiece

**Qué sale mal:** `router/index.ts:31` define `publicRoutes = ['login','register']` **por nombre**. Cualquier otra ruta redirige a `login` si `!isAuthenticated`. La ruta `/r/trial` monta _después_ del guard, así que el `?t=` nunca llega al componente.
**Cómo evitarlo:** agregar el nombre de la ruta nueva a `publicRoutes`. Y verificar el segundo guard: `if (authenticated && isPublicRoute) return { name: 'home' }` — si la ruta de canje entra a `publicRoutes` y el usuario **ya** está logueado (caso D-04 "misma sesión"), el guard lo manda a home en vez de al destino. La ruta de canje necesita tratamiento propio en el guard, no simplemente sumarse a la lista.
**Bug vivo relacionado:** hoy `/r/trial` **no existe** como ruta web ⇒ cae en el catch-all y muestra `ErrorNotFound`. Como la campaña de la 119 todavía no se envió, no hay daño en prod — pero **si el envío 1 sale antes de esta fase, todo click desde desktop aterriza en un 404**. Vale la pena que el planner lo flaguee al usuario.

### Pitfall 5 — El listener nativo ignora el token a propósito

**Qué sale mal:** `deep-links.ts` documenta explícitamente "We deliberately ignore the token value entirely" y `resolveDeepLinkRoute()` solo mira el `pathname`. En un device con la app instalada, App Links intercepta la URL antes del navegador ⇒ la ruta web nueva **nunca corre** ⇒ el usuario sigue deslogueado ⇒ la fase no cumple su objetivo justo en el device donde más importa.
**Cómo evitarlo:** el canje va en **ambas** superficies, compartiendo un composable. Y el listener debe manejar el caso "app fría": `appUrlOpen` puede dispararse antes de que el router esté listo (el código ya tiene el fallback `pendingRoute`); el canje debe completar y persistir tokens **aunque** el `router.push` falle.

### Pitfall 6 — Reemplazar la sesión de otro usuario en un device compartido

**Qué sale mal:** D-04 manda loguear al destinatario si la sesión activa es de otro. En un teléfono familiar, abrir el mail de mamá desloguea a la hija.
**Cómo evitarlo:** es una decisión tomada (D-04), pero la implementación debe ser **explícita**: llamar a `logout()`/`clearTokens()` del usuario anterior **antes** de `setTokens()`, y limpiar el estado user-scoped (`userStore.clearSelection()`, `useNotificationStore`, cachés de nivel). Un `setTokens` sobre una sesión ajena sin limpiar deja refs de Pinia del usuario anterior vivas → datos cruzados en pantalla. El `logout()` existente ya documenta el orden correcto de limpieza; **reusarlo**.

### Pitfall 7 — `JWT_SECRET` firma el HMAC de campaña Y los JWT de sesión

**Qué sale mal:** `token-service.ts:getSecret()` devuelve `process.env.JWT_SECRET`. Rotarlo invalida simultáneamente todos los magic links en vuelo y todas las sesiones.
**Cómo evitarlo:** no rotar durante la fase. Si a alguien se le ocurre separar el secreto (`CAMPAIGN_TOKEN_SECRET`), es un cambio de configuración de prod que necesita entrada en `.env.example` + coordinación de deploy — y probablemente no vale la pena en esta fase.

### Pitfall 8 — El conteo del preview miente respecto del envío

**Qué sale mal:** `GET /admin/eligible-count` calcula `listEligible(...).length` **en el momento de mirar**; `send()` recalcula la audiencia **en el momento de enviar**. Entre los dos, la audiencia se movió. Ya pasa hoy, pero con 5 segmentos (algunos volátiles, como `alerta/ausente` que el cron de segmentación recalcula a las 03:00 AR) la brecha se vuelve visible.
**Cómo evitarlo:** el preview debe pasar el **mismo segmento** que la campaña tiene persistido (no el que está en el form sin guardar), y el resultado del envío (`SendResult.recipientCount`) es la verdad. Considerar mostrar en la UI "conteo estimado a las HH:MM".
**Además:** `eligible-count` hoy trae **todas las filas** para contarlas (`.length`). Con "bajas" (potencialmente miles de ex-socios) eso es un `SELECT` completo para devolver un número. Cambiarlo a `COUNT(*)` en SQL.

### Pitfall 9 — 🔴 El nombre de actividad que ve el socio NO es `activities.name`

**Qué sale mal:** `deriveActivityLabel(activityName, isSpecial, dayMode)` (fase 159-06, `scheduling/derived-label.ts`) reemplaza el nombre de la actividad genérica **"General"** (no-especial) por **"Combos"** o **"Técnica"** según el `sessionMode` aprobado de ese día. El `activityId` del slot sigue apuntando a la fila "General". Un bottom sheet que haga "traeme `activities.description` de `slot.activityId`" muestra la descripción de "General" bajo un título que dice "Combos".
Peor: la actividad genérica es la que cubre **la mayoría de los slots**, así que este NO es un caso borde — es el caso principal.
**Por qué pasa:** la derivación es de tiempo de LECTURA y deliberadamente no toca reservas/cupos/gating, "solo la etiqueta visible".
**Cómo evitarlo:** decidir el modelo **antes** de escribir la tarea. Opciones:

- **(a)** Devolver `activityDescription` en el payload del slot de la grilla, resuelta server-side **junto con** la derivación de etiqueta — así el server es dueño de la coherencia label↔descripción. Requiere decidir qué descripción va cuando la etiqueta es derivada (¿un copy por `sessionMode`? ¿la de "General"? ¿ninguna?).
- **(b)** Mostrar el bottom sheet **solo** cuando la etiqueta NO es derivada (actividades especiales, ROM, etc.) — el freemium en modo prueba vería el bottom sheet poco.
- **(c)** Descripciones por `sessionMode` (Combos/Técnica) como copy estático en el front, más `activities.description` para el resto.
  **Recomendación:** **(a)** con el server derivando ambas cosas en el mismo lugar, y un fallback a "sin descripción" (no mostrar el affordance de tap) cuando no hay copy — es la única opción que mantiene la fuente única y no le pide al dueño cargar copy que nunca se va a ver.
  **Señal temprana:** un test que reserve un día con `sessionMode='combos'` y afirme que la descripción mostrada corresponde a la etiqueta mostrada.

### Pitfall 10 — 🔴 El push pre-sesión es no-op para el público objetivo

**Qué sale mal:** `NotificationService.queueNotification()` tiene un guard explícito: _"Skip enqueueing for users without a device token"_ — devuelve `-1` y no encola. Un freemium que llegó por email desde una compu **no tiene device token**. El recordatorio anti-no-show, que es el mecanismo que D-20 promueve a la fase, **no se dispara** para el grueso de los destinatarios.
**Cómo evitarlo:**

- Aceptar que el **link de Google Calendar es el mecanismo principal**, no el complemento barato — y darle prominencia en la UI de confirmación acorde.
- Considerar un **email** de recordatorio 24h antes (la infra de Resend + `EmailService` ya está) como tercer canal, aunque D-20 no lo pide. **Preguntarle al usuario** antes de meterlo: agrega scope.
- El push sigue valiendo para quien sí instaló la app (y para el segmento alerta/ausente, que son socios activos con la app).
  **Señal temprana:** en el log, `"User has no device tokens — skipping"` por cada trial reservado.

### Pitfall 11 — La numeración de migraciones va a colisionar

**Qué sale mal:** hoy conviven tres numeraciones distintas:

- `origin/master`: hasta **0208** (`0207_paquete_clases_matrix`, `0208_rename_branches_short_names`)
- `origin/staging`: hasta 0208 pero **sin 0207**
- tren v6.0 (`et-176`): hasta **0207**, pero su 0207 es `0207_seed_module_flags` — **choca con el 0207 de master**
  El merge del tren a master ya requiere renumerar. Fijar hoy el número de la migración de esta fase es garantía de conflicto.
  **Cómo evitarlo:** el plan debe incluir un paso explícito de "resolver el número de migración contra la base real en el momento de ejecutar" (`ls el-templo-api/src/db/migrations/*.sql | sort | tail -3` en el checkout de trabajo, más chequeo contra `origin/master`). Probablemente 0210+.
  **Reglas duras que aplican:** nunca `;` dentro de un comentario `--`; el `.sql` va en el **mismo commit** que el cambio de schema; nunca `drizzle-kit migrate`.

### Pitfall 12 — Sentry se llena de ruido con el camino feliz de D-05

**Qué sale mal:** un token vencido es el **camino normal** después de 7 días (D-05: degradar con gracia). Si el front lo loguea con `createLogger().error()`, cada link viejo clickeado genera un issue de Sentry.
**Cómo evitarlo:** `warn` para token inválido/vencido; `error` solo para fallos inesperados del endpoint (500, red). Precedente exacto: `RefreshTokenService` documenta _"Failed-refresh paths log at `warn` (NOT `error`) to avoid Sentry spam"_.

### Pitfall 13 — El destino del click está fijado por una allowlist defensiva

**Qué sale mal:** `campaigns/routes.ts:114` verifica que `new URL(destination).host === 'app.eltemplo.org'` y devuelve 400 si no. Si D-13 introduce destinos distintos por segmento y alguien los construye con otro host (o con un path relativo), la ruta **falla cerrada** en producción.
**Cómo evitarlo:** los destinos por segmento se derivan del mismo `TRIAL_DEEP_LINK_BASE` (mismo host, distinto path/query). Extender `trialDeepLink(token)` a `deepLinkForSegment(segment, token)` manteniendo la constante de host. **No** relajar la allowlist.

### Pitfall 14 — `campaign_sends` es único por `(campaign_id, user_id)`, no por email

Los segmentos "bajas" y "prueba no convertida" pueden solaparse con "freemium elegibles" en la práctica (un ex-socio que volvió a estado freemium). D-14 dice **un segmento por campaña** y **sin dedupe cross-segmento** — así que un mismo usuario puede recibir dos campañas distintas el mismo día. Es una decisión tomada, pero conviene que el admin lo sepa: no hay throttle global de frecuencia. Si el usuario quiere uno, es scope nuevo.

## Code Examples

### Ejemplo 1 — Emisión de sesión (el patrón exacto a replicar en el canje)

```ts
// Source: el-templo-api/src/modules/auth/routes.ts:604-620 (tren v6.0)
// Sign JWT (legacy 7d token kept for backwards-compat — Req 7)
const payload = { userId: user.id, email: user.email, role: user.role };
const token = fastify.jwt.sign(payload);
// New short-lived access (30m) + opaque refresh (30d sliding)
const accessToken = fastify.jwt.sign(payload, {
  expiresIn: fastify.accessTokenExpiresIn,
});
const refreshTokenService = new RefreshTokenService(fastify.db, request.log);
const refreshToken = await refreshTokenService.issue(user.id);

return {
  token,
  accessToken,
  refreshToken,
  user: {
    id,
    email,
    firstName,
    lastName,
    role,
    level,
    branchId,
    branchName,
    branchIsVirtual,
    branchCountry,
    gender,
    dateOfBirth,
    onboardingCompleted,
  },
};
```

> **Corrección al CONTEXT.md:** el login **NO** está en `members/routes.ts §386-513` sino en **`el-templo-api/src/modules/auth/routes.ts` §490-635**. `members/routes.ts` en ese rango tiene el export SEPA. El canon a copiar es el de arriba.

El canje debe devolver **el mismo shape de `user`** para que `useAuthStore` pueda alimentar `userStore.setProfile(userData)` sin ramas nuevas.

### Ejemplo 2 — Composición de condiciones de audiencia con tenancy

```ts
// Source: el-templo-api/src/modules/campaigns/service.ts:96-129 (tren v6.0)
// Invariante global D-15 — OJO: el subquery de unsubscribes correlaciona por
// EMAIL (no único global desde la mig 0196) ⇒ lleva su PROPIO filtro de tenant.
sql`NOT EXISTS (
  SELECT 1 FROM ${unsub}
  WHERE ${unsub.email} = ${u.email} AND ${unsub.tenantId} = ${ctx.tenantId}
)`;

// El tenantWhere va INLINE en el and(...) final, NO en el array `conditions`
// (el lint juzga por STATEMENT).
const rows = await this.db
  .select({
    userId: u.id,
    email: u.email,
    branchId: u.branchId,
    country: br.country,
  })
  .from(u)
  .innerJoin(br, eq(br.id, u.branchId))
  .where(and(tenantWhere(u, ctx), ...conditions));
```

### Ejemplo 3 — Enums y columnas que los segmentos de D-12 necesitan

```ts
// users.status                   — el-templo-api/src/db/schema/users.ts:69
["freemium", "prueba", "activo", "inactivo", "wellhub"][
  // subscriptions.status           — schema/subscriptions.ts:19
  ("active",
  "paused",
  "cancelled",
  "expired",
  "completed",
  "changed",
  "scheduled")
][
  // bookings.status                — schema/bookings.ts:18
  ("reservado",
  "qr_escaneado",
  "confirmado",
  "cancelado",
  "lista_espera",
  "no_show")
][
  // + bookings.isTrial (boolean), bookings.source ('self_service' | …)

  // memberProfiles.segment         — schema/member-profiles.ts:41
  ("optima", "regular", "alerta", "ausente")
][ // NULL = <1 mes o sin plan activo
  // referrals.status               — schema/referrals.ts:21
  ("pending", "qualified", "revoked")
]; // referredId es UNIQUE
```

Traducción directa de D-12:

- **Bajas** = `users.status='inactivo'` AND `EXISTS (SELECT 1 FROM subscriptions WHERE user_id = u.id)` — nótese que "tuvo alguna suscripción" incluye `cancelled/expired/completed/changed`, no solo activas. Si el usuario quiso decir "pagó" habría que agregar `price_paid > 0`; **preguntar** (ver §Assumptions).
- **Prueba no convertida** = `EXISTS (booking is_trial AND status IN ('confirmado','qr_escaneado','no_show'))` AND `NOT EXISTS (subscriptions)`. CONTEXT dice "asistió o no_show, no cancelado"; `reservado` (aún futura) queda fuera por definición.
- **Alerta/Ausente** = join a `member_profiles` con `segment IN ('alerta','ausente')`.
- **Referidos** = join a `referrals` por `referredId = u.id` con `status='pending'`.

### Ejemplo 4 — Dato de sede ya disponible en la confirmación de prueba

```ts
// Source: el-templo-api/src/modules/scheduling/trials-service.ts:489-537
// getTrialEligibility() YA devuelve branchAddress en booking:
booking: {
  bookingId, date, startTime,
  branchId, branchName,
  branchAddress,              // ← ya viene (D-19 no necesita endpoint nuevo)
  canModify: this.isOutsideCancelWindow(date, startTime, branchTimezone),
}
```

```ts
// Y la app ya lo usa (ReservasPage.vue:905-913):
const sede = b.branchAddress
  ? `${b.branchName} (${b.branchAddress})`
  : b.branchName;
```

⇒ **D-19 (confirmación enriquecida) es puro trabajo de front**: el dato está. Lo que falta es el link de Maps, el checklist y el botón de calendario.

### Ejemplo 5 — Link "Agregar al Google Calendar" (versión mínima, D-20)

```ts
// dates en UTC: YYYYMMDDTHHmmssZ/YYYYMMDDTHHmmssZ. Todos los valores URL-encoded.
const url =
  "https://calendar.google.com/calendar/render?action=TEMPLATE" +
  `&text=${encodeURIComponent("Sesión de prueba — El Templo")}` +
  `&dates=${startUtc}/${endUtc}` +
  `&details=${encodeURIComponent("Llegá 10 minutos antes. Ropa cómoda y agua.")}` +
  `&location=${encodeURIComponent(branchAddress)}`;
```

`[CITED: interactiondesignfoundation.github.io/add-event-to-calendar-docs/services/google.html]` — MEDIA confianza (documentación comunitaria; Google no publica un contrato oficial de esta URL, pero es estable hace años).

**Trampa de timezone:** la clase tiene `date` + `startTime` **en la timezone de la sede** (`branches.timezone`, AR o Madrid). Convertir a UTC con los helpers existentes (`buildClassDateTime(date, startTime, tz)` de scheduling) — **no** con `new Date(date + 'T' + time)`, que interpreta en la zona del device.

### Ejemplo 6 — Exención de tenancy duplicada (lint + sentinel)

```ts
// Source: el-templo-api/src/modules/auth/refresh-token-service.ts:130-142
/* tenant-safe: lookup pre-scope por PK de users — esta ES la lectura que DERIVA el tenant_id de arriba, filtrarla por tenant seria circular */
const [row] = await this.db
  .select({ tenantId: schema.users.tenantId })
  .from(schema.users)
  .where(
    sql`/* tenant-safe: lookup pre-scope por PK de users — esta ES la lectura que DERIVA el tenant_id de arriba, filtrarla por tenant seria circular */ ${eq(schema.users.id, userId)}`,
  )
  .limit(1);
```

## State of the Art

| Enfoque viejo (fase 119)                         | Enfoque de esta fase                                 | Cuándo cambió        | Impacto                                                                                                                          |
| ------------------------------------------------ | ---------------------------------------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Token de campaña **solo identifica** (D-21)      | Token de login **autoriza** el canje a sesión (D-01) | Fase 180             | Hay que actualizar docblocks en `token-service.ts`, `campaigns/routes.ts`, `deep-links.ts` y el manifiesto, y separar propósitos |
| Click → `/r/trial` (que no existe como ruta web) | Ruta web pública real que canjea y redirige          | Fase 180             | Cierra un 404 latente                                                                                                            |
| Audiencia = una query fija de freemium           | 5 segmentos + columna persistida                     | Fase 180             | `listEligible` deja de ser la API pública del servicio                                                                           |
| `listEligible(country)`                          | `listEligible(ctx, country)`                         | Fase 173 (tren v6.0) | **Ya ocurrió** — planificar contra la firma nueva                                                                                |
| `activities.name` visible tal cual               | `deriveActivityLabel()` según `sessionMode`          | Fase 159-06          | **Ya ocurrió** — condiciona D-18 (§Pitfall 9)                                                                                    |
| Unsubscribe único por email                      | `UNIQUE (tenant_id, email)`                          | Fase 168 (mig 0196)  | **Ya ocurrió** — condiciona el SQL de todo segmento nuevo                                                                        |
| Rutas sin gates                                  | 3 gates de tenancy + flags de módulo                 | Fases 166-171 + 176  | **Ya ocurrió** — toda ruta nueva paga el peaje                                                                                   |

**Obsoleto / no usar:**

- El checkout principal como referencia de código (desactualizado respecto del tren).
- `drizzle-kit generate` / `drizzle-kit migrate` (drift pre-existente; migraciones a mano).
- La ruta `/api/campaigns/admin/eligible-count` tal como está (trae filas para contarlas).

## Assumptions Log

| #   | Suposición                                                                                                                                                                                                                                                                                                                           | Sección              | Riesgo si está mal                                                                                                             |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| A1  | "Tuvo alguna suscripción en el pasado" (segmento **bajas**) = existe cualquier fila en `subscriptions`, sin filtrar por `price_paid > 0`. CONTEXT dice "ex-socios **que pagaron**" pero también "los inactivos que nunca pagaron NO entran" — una suscripción con `price_type_applied='zero'` (bonificada/staff) existe pero no pagó | §Código 3            | La audiencia de "bajas" incluiría staff bonificado y membresías `zero` que nunca fueron clientes. **Confirmar con el usuario** |
| A2  | El token de login y el de tracking se implementan como **un solo HMAC** con campo de propósito, no como dos tokens separados en la URL                                                                                                                                                                                               | §Patrón 1, Pitfall 3 | Si el planner elige dos tokens, el email lleva dos parámetros y el `/track/click` tiene que reenviar ambos                     |
| A3  | El endpoint de canje vive en el módulo `campaigns` (no en `auth`)                                                                                                                                                                                                                                                                    | §Patrón 1            | Si va en `auth`, la resolución de tenant desde `campaign_sends` cruza módulos; el manifiesto lo clasificaría bajo `/api/auth`  |
| A4  | El freemium destinatario **no tiene `onboardingCompleted`** ⇒ el guard de onboarding lo intercepta post-canje                                                                                                                                                                                                                        | §Patrón 2, Pitfall 4 | Si en realidad los freemium sí completan onboarding al registrarse, el problema no existe. **Verificar en datos de prod**      |
| A5  | El link de calendario Google `render?action=TEMPLATE` sigue vigente (sin contrato oficial publicado por Google)                                                                                                                                                                                                                      | §Código 5            | Si Google lo cambia, el botón deja de funcionar silenciosamente. Riesgo bajo (estable hace años), impacto bajo                 |
| A6  | El bump de versión es **minor** y hay un solo pasaje de builds de tiendas para toda la fase                                                                                                                                                                                                                                          | §Constraints         | Si la fase se parte en dos releases, se duplica el ciclo de tiendas                                                            |
| A7  | La campaña de la fase 119 **no se envió todavía** en prod (DNS Resend pendiente) ⇒ no hay `campaign_sends` en producción con tokens en vuelo                                                                                                                                                                                         | §Runtime State       | Si ya se envió, hay tokens de 30d circulando y el cambio de semántica del token los afecta                                     |
| A8  | Categoría `anuncios` para el template del recordatorio de prueba                                                                                                                                                                                                                                                                     | §Patrón 5            | Solo afecta qué preferencia lo silencia; todas arrancan en `true`                                                              |

## Open Questions (RESOLVED)

_Las 6 quedaron cerradas al planificar (2026-08-22): 1-4 por decisiones del usuario en `180-CONTEXT.md` (D-21..D-24), 5 por decisión de diseño en 180-01/180-06, y 6 por verificación en runtime dentro de 180-05._

1. **¿El freemium logueado por magic link pasa por onboarding antes de poder reservar?**
   - Qué sabemos: el guard de `router/index.ts:45-52` redirige a `onboarding` a todo `member` con `onboardingCompleted === false`, sin excepciones.
   - Qué no está claro: si los freemium creados por autorregistro completan onboarding, y si el objetivo de la fase (matar la fricción) tolera un onboarding intermedio.
   - Recomendación: **decisión del usuario en plan-phase**. Opciones: (a) exceptuar la ruta de canje + `/reservas?trial=1` del guard mientras el usuario sea freemium; (b) dejar el onboarding (es info que el gimnasio quiere igual); (c) versión corta del onboarding para freemium. Recomiendo (a): la fase existe para eliminar pasos entre el click y la reserva.
   - **RESUELTA — D-21:** opción (a). El canje saltea el onboarding mientras el usuario sea freemium. Implementada en 180-11 (`authAgnosticRoutes` + excepción de onboarding en `router/guards.ts`, con tests que afirman que el bypass NO alcanza a un socio regular).

2. **Segmento "bajas": ¿cualquier suscripción previa o solo las que pagaron?** — Ver A1. Recomendación: filtrar `price_paid > 0` para que "ex-socio que pagó" sea literal, y confirmarlo.
   - **RESUELTA — D-22:** solo suscripciones con pago real; se excluyen las `price_type_applied='zero'` (staff/bonificadas). Implementada en 180-04 (`audience-service.ts` + batería de los 5 segmentos).

3. **Descripción de actividad cuando la etiqueta es derivada (Combos/Técnica).** — Ver §Pitfall 9. Recomendación: opción (a), server derivando etiqueta y descripción juntas; requiere decidir de dónde sale el copy de Combos/Técnica (¿filas `activities` propias? ¿copy estático?).
   - **RESUELTA — D-23:** opción (a); las etiquetas derivadas tienen descripción propia editable en el admin (mecánica de almacenamiento a discreción técnica). Implementada en 180-10 (KV por etiqueta + `activityDescription` coherente) y 180-15 (edición en el admin).

4. **¿Se agrega un email de recordatorio 24h antes, dado que el push será no-op para la mayoría?** — Ver §Pitfall 10. Es scope nuevo; **preguntar antes de planificarlo**.
   - **RESUELTA — D-24:** sí, entra al scope: push si hay device token, email de fallback si no. Implementada en 180-03 (`trial_session_reminder` + fallback por email en el procesador de la cola).

5. **¿Se necesita poder invalidar un magic link filtrado?** — Con HMAC stateless multi-uso, la única salida es esperar los 7 días o rotar `JWT_SECRET` (que rompe todo). Si la respuesta es sí, hace falta la tabla de tokens (y una migración). Recomendación: no, dado el perfil de riesgo (freemium sin datos sensibles, 7 días).
   - **RESUELTA — no:** se mantiene HMAC stateless sin tabla de tokens (decidido en 180-01; el riesgo residual está aceptado explícitamente en T-180-56 del plan 180-12, mitigado por el TTL de 7 días de D-02). El SPA fallback de nginx para `/r/trial` — la otra incógnita de infra de este ítem — queda como checkpoint humano bloqueante en 180-16 Task 2.

6. **Shim de nombres de sede: ¿app-side o API-side en la base real?** — Ver §Patrón 4. Verificar contra `origin/master` al planificar, no ahora.
   - **RESUELTA — se difiere a verificación en runtime:** el plan 180-05 Task 1 comprueba contra el código real del worktree de qué lado quedó el shim antes de tocar `BranchOption`, en vez de fijar una respuesta en el research. El plan 180-01 Task 1 (checkpoint bloqueante) confirma primero que la base del worktree es `origin/master` con el tren v6.0 adentro.

## Environment Availability

| Dependencia                                | Requerida por                          | Disponible                                                             | Versión | Fallback                                                                             |
| ------------------------------------------ | -------------------------------------- | ---------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------ |
| MySQL (`eltemplo_test`)                    | Tests de integración de rutas nuevas   | ✓                                                                      | —       | Ninguno (obligatorio por CLAUDE.md)                                                  |
| `JWT_SECRET`                               | Firma del magic link + sesiones        | ✓ (en `.env.example` y prod)                                           | —       | Ninguno; el firmado tira error si falta                                              |
| `RESEND_API_KEY` + `CAMPAIGN_EMAIL_FROM`   | Envío real del email                   | ✓ en `.env.example`; **DNS de Resend pendiente en prod**               | —       | `sendCampaignBatch` es no-op sin la key ⇒ el envío registra audiencia sin crashear   |
| `PUBLIC_API_BASE_URL`                      | Base de las URLs de tracking del email | ⚠ **en uso en código, ausente de `.env.example`**                      | —       | Default `https://api.eltemplo.org` (correcto en prod, **incorrecto en dev/staging**) |
| FCM / `firebase-admin`                     | Push pre-sesión                        | ✓                                                                      | —       | `queueNotification` skipea sin device token                                          |
| `.well-known` (assetlinks + AASA)          | Deep link nativo                       | ✓ publicados desde la 119                                              | —       | Sin ellos el link abre el navegador (degrada al camino web)                          |
| SPA history fallback en `app.eltemplo.org` | Servir `/r/trial` en web               | ⚠ **no verificable desde el repo** (config de nginx vive en el server) | —       | Si falta, `/r/trial` da 404 del server y **la ruta web nunca monta**                 |
| `vue-tsc`                                  | Typecheck de app/admin (CI no lo hace) | ✓                                                                      | —       | Ninguno                                                                              |
| `ctx7` / Context7 MCP                      | Docs de librerías                      | ✗ no disponible en esta sesión                                         | —       | No se necesitó: todas las librerías son internas o ya en uso                         |

**Dependencias faltantes que bloquean:**

- Ninguna que bloquee la implementación.

**Dependencias faltantes con fallback / a verificar antes de ejecutar:**

- **SPA fallback de nginx para `app.eltemplo.org`** — es el único desconocido con potencial de romper la fase entera en prod. El deep link nativo ya funciona (es el mismo `.well-known` de la 119), pero la rama WEB del magic link necesita que el server devuelva `index.html` para `/r/trial`. **El plan debe incluir un checkpoint de verificación** (curl a `https://app.eltemplo.org/r/trial` — si devuelve el HTML del SPA, está OK; si devuelve 404 de nginx, hay que tocar config del server, lo cual requiere SSH ⇒ **preguntar al usuario**).
- `PUBLIC_API_BASE_URL` en `.env.example` — saldar la deuda en esta fase (regla de CLAUDE.md).

## Validation Architecture

### Test Framework

| Propiedad            | Valor                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------- |
| Framework (API)      | Vitest 4, `pool: "forks"`, DB MySQL real por worker (`eltemplo_test_<POOL_ID>`)                   |
| Config (API)         | `el-templo-api/vitest.config.ts` (globalSetup `test/setup-global.ts`, setupFiles `test/setup.ts`) |
| Comando rápido (API) | `pnpm --dir el-templo-api exec vitest run --no-file-parallelism test/<archivo>.test.ts`           |
| Suite completa (API) | `pnpm --dir el-templo-api test` — **la corre CI, no local** (regla del usuario)                   |
| Framework (app)      | Vitest, tests unitarios de utils/stores en `el-templo-app/test/` (sin tests de componentes)       |
| Comando (app)        | `pnpm --dir el-templo-app test`                                                                   |
| Framework (admin)    | **Ninguno** — `el-templo-admin/package.json` no tiene script `test`                               |
| Typecheck frontends  | `vue-tsc` local — **CI NO typechequea app ni admin**                                              |

### Mapa Requisito → Test

| Req      | Comportamiento                                                                              | Tipo        | Comando automatizado                                                            | ¿Existe archivo?                                        |
| -------- | ------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------- | ------------------------------------------------------- |
| ML-01    | Canje válido emite access+refresh y el refresh funciona en `/auth/refresh`                  | integración | `vitest run test/campaigns-magic-link.test.ts`                                  | ❌ Ola 0                                                |
| ML-01    | Token vencido / firma inválida / `purpose` incorrecto ⇒ 401 sin emitir sesión               | integración | idem                                                                            | ❌ Ola 0                                                |
| ML-01    | Token **multi-uso**: dos canjes seguidos emiten dos sesiones válidas (D-02)                 | integración | idem                                                                            | ❌ Ola 0                                                |
| ML-01    | Usuario `deletedAt` / `staffDisabled` ⇒ canje rechazado                                     | integración | idem                                                                            | ❌ Ola 0                                                |
| ML-01    | Aislamiento: token del gimnasio 2 resuelve `tenant_id = TENANT_DOS` y nunca al socio del 1  | integración | `vitest run test/tenancy/iso-03-campaigns.test.ts`                              | ✓ existe (extender + actualizar el conteo del docblock) |
| ML-01    | Manifiesto: la ruta nueva está clasificada                                                  | contrato    | `vitest run test/tenancy/iso-01-manifiesto.test.ts`                             | ✓ existe (bumpear `ENTRADAS_BASELINE` 370→N)            |
| ML-01    | Lint de tenancy verde con la exención duplicada                                             | contrato    | `pnpm --dir el-templo-api lint:tenant`                                          | ✓ existe                                                |
| ML-02/03 | `resolveDeepLinkRoute` extrae el token del query                                            | unit (app)  | `pnpm --dir el-templo-app test`                                                 | ❌ Ola 0 (`test/deep-links.test.ts`)                    |
| ML-02    | La ruta de canje está en `publicRoutes` del guard                                           | unit (app)  | idem                                                                            | ❌ Ola 0                                                |
| AUD-01   | Cada uno de los 5 segmentos devuelve exactamente los usuarios esperados y excluye los demás | integración | `vitest run test/campaigns-audience.test.ts`                                    | ✓ existe (172 líneas, hoy solo freemium — extender)     |
| AUD-01   | Invariantes D-15 aplican a los 5 segmentos (unsubscribed excluido, email nulo excluido)     | integración | idem                                                                            | ✓ extender                                              |
| AUD-01   | Unsubscribe del gimnasio 2 NO suprime al mismo email en el gimnasio 1 (mina M3)             | integración | `iso-03-campaigns.test.ts`                                                      | ✓ existe                                                |
| AUD-02   | `send()` usa el segmento persistido de la campaña, no el default                            | integración | `vitest run test/campaigns-send.test.ts`                                        | ✓ existe (extender)                                     |
| AUD-03   | El deep link generado por segmento cae en el host allowlisted                               | unit        | `vitest run test/campaign-token.test.ts`                                        | ✓ existe (extender)                                     |
| RES-01   | `GET /branches` devuelve `address` y sigue scopeado por país + tenant                       | integración | `vitest run test/scheduling-*.test.ts` (ubicar el archivo de member scheduling) | ✓ probable (verificar)                                  |
| RES-04   | El link de calendario usa la timezone de la sede, no la del device                          | unit (app)  | `pnpm --dir el-templo-app test`                                                 | ❌ Ola 0 (`test/calendar-link.test.ts`)                 |
| RES-05   | La descripción mostrada corresponde a la **etiqueta derivada** del slot (Combos/Técnica)    | integración | archivo de grilla semanal                                                       | ❌ Ola 0 — **el test que previene §Pitfall 9**          |
| NOT-01   | Reservar prueba encola el recordatorio a clase−24h; cancelar lo elimina                     | integración | `vitest run test/scheduling-trials*.test.ts`                                    | ✓ probable (extender)                                   |
| NOT-01   | Usuario sin device token ⇒ no se encola (comportamiento esperado, documentado)              | integración | idem                                                                            | ❌ Ola 0                                                |

### Sampling Rate

- **Por commit de tarea:** el archivo de test tocado, en foreground con timeout amplio. **Prohibido `run_in_background`** y loops de espera con `pgrep` (se matchean a sí mismos y cuelgan — lección de la fase 173).
- **Por merge de ola:** los 3 gates de tenancy (`iso-01`, `con-04`, `con-06`) + los archivos de campañas + `vue-tsc` de app y admin.
- **Gate de fase:** suite completa verde **en CI** (no local) antes de `/gsd:verify-work`.

### Wave 0 Gaps

- [ ] `el-templo-api/test/campaigns-magic-link.test.ts` — cubre ML-01 completo (5 casos)
- [ ] `el-templo-app/test/deep-links.test.ts` — cubre ML-02/ML-03 (extracción de token, guard)
- [ ] `el-templo-app/test/calendar-link.test.ts` — cubre RES-04 (timezone)
- [ ] Test de coherencia etiqueta↔descripción de actividad — cubre RES-05 (§Pitfall 9)
- [ ] Extensión de `campaigns-audience.test.ts` a los 5 segmentos (hoy: solo freemium)
- [ ] Bump de `ENTRADAS_BASELINE` en `iso-01-manifiesto.test.ts` (370 → 370+N) y del conteo en el docblock de `iso-03-campaigns.test.ts`
- [ ] Ningún framework nuevo a instalar

## Security Domain

### Categorías ASVS aplicables

| Categoría ASVS                  | Aplica                        | Control estándar en esta fase                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **V2 Authentication**           | **sí — el núcleo de la fase** | El magic link es el **primer flujo passwordless del sistema**. Controles: token de 256 bits de entropía efectiva vía HMAC-SHA256 sobre payload con `exp`; TTL corto (7d, D-02); comparación en tiempo constante (`timingSafeEqual`, ya implementada); el token **nunca** se loguea; canje por POST (anti-prefetch); gates de `deletedAt`/`staffDisabled` replicados del login |
| **V3 Session Management**       | sí                            | Reuso de `RefreshTokenService`: refresh opaco 256 bits, solo se persiste el sha256, rotación con `replaced_by_id`, reuse-detection que revoca la cadena, ventana de gracia de 10s para reintentos de red. **No inventar un camino de sesión paralelo**                                                                                                                        |
| **V4 Access Control**           | sí                            | El token **identifica**, la base **autoriza**: la elegibilidad se revalida server-side (D-20 de la 119 se conserva). El tenant se resuelve desde `campaign_sends`, nunca del payload. Rutas admin de campañas siguen con `ADMIN_ROLES`/`OWNER_ROLES` + `attachScope`                                                                                                          |
| **V5 Input Validation**         | sí                            | JSON Schema de Fastify en toda ruta nueva (patrón `trackingQuerySchema`/`createCampaignSchema`); `esc()` para el copy del admin en el email; el `segment` del body validado contra la lista cerrada (no interpolar en SQL)                                                                                                                                                    |
| **V6 Cryptography**             | sí                            | `node:crypto` únicamente. **Nunca** hand-rollear comparación de firmas ni generación de tokens. `JWT_SECRET` como único secreto (no introducir uno nuevo sin actualizar `.env.example` + coordinar deploy)                                                                                                                                                                    |
| **V7 Error Handling & Logging** | sí                            | Token inválido/vencido ⇒ `warn`, no `error` (anti-spam de Sentry). Nunca loguear el token. La página de unsubscribe ya es genérica anti-enumeración (D-15) — mantener el criterio: el canje fallido no debe revelar si el userId existe                                                                                                                                       |
| **V12 Files**                   | no                            | La fase no maneja uploads (el `heroImageUrl` es una URL, nunca se fetchea)                                                                                                                                                                                                                                                                                                    |
| **V13 API**                     | sí                            | Anti open-redirect: el destino del 302 se **deriva** de una allowlist de host, nunca se echa del query (`CLICK_REDIRECT_ALLOWLIST_HOST`) — extenderlo, no relajarlo                                                                                                                                                                                                           |

### Patrones de amenaza conocidos para este stack

| Patrón                                                                   | STRIDE                                   | Mitigación estándar                                                                                                                                                                            |
| ------------------------------------------------------------------------ | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Magic link consumido por escáner de correo                               | Denial of Service (del usuario legítimo) | Multi-uso + TTL (D-02); canje por POST; HEAD inerte                                                                                                                                            |
| Magic link filtrado (email reenviado, historial de navegador, `Referer`) | Spoofing / Elevation                     | TTL 7d; `Referrer-Policy: no-referrer` en la landing; alcance limitado (freemium sin datos sensibles); **no hay revocación individual** con HMAC stateless — riesgo aceptado                   |
| Token de tracking (30d) reutilizado como token de login                  | Elevation of Privilege                   | Campo de `purpose` verificado por **cada** ruta consumidora (§Pitfall 3)                                                                                                                       |
| Fuga cross-tenant en la audiencia (email a un destinatario ajeno)        | Information Disclosure                   | `tenantWhere` en todo acceso + subquery de unsubscribes con su propio filtro de tenant + batería ISO-03. El docblock de `listEligible` lo llama "el peor caso práctico de una fuga de tenancy" |
| Open redirect en `/track/click`                                          | Spoofing / Phishing                      | Destino derivado de allowlist; verificación defensiva del host con fail-closed                                                                                                                 |
| Enumeración de usuarios vía el endpoint de canje                         | Information Disclosure                   | Respuesta genérica y tiempo similar para token inválido vs usuario inexistente                                                                                                                 |
| Oráculo de timing sobre la firma HMAC                                    | Information Disclosure                   | `timingSafeEqual` + chequeo previo de longitud (CR-03, ya implementado)                                                                                                                        |
| Secuestro de sesión en device compartido                                 | Spoofing                                 | D-04 lo hace explícito y controlado; limpiar estado del usuario anterior antes de setear tokens (§Pitfall 6)                                                                                   |
| Inyección SQL vía el nombre de segmento                                  | Tampering                                | El `segment` viene de una lista cerrada validada; el dispatcher mapea a SQL parametrizado, nunca concatena                                                                                     |

## Sources

### Primarias (confianza ALTA — código base real, tren v6.0 `et-176` @ `d3acea88`)

- `el-templo-api/src/modules/campaigns/{token-service,service,routes,templates,tracking-service}.ts`
- `el-templo-api/src/modules/auth/{routes.ts §490-660, refresh-token-service.ts}`
- `el-templo-api/src/modules/scheduling/{routes.ts §1005-1123, trials-service.ts §425-545, service.ts §190-400, derived-label.ts}`
- `el-templo-api/src/modules/notifications/{service.ts §177-470, types.ts (TEMPLATE_SEEDS)}`, `src/jobs/notification-cron.ts`
- `el-templo-api/src/modules/shared/{tenant.ts, country-scope.ts, modules.ts}`, `src/app.ts`
- `el-templo-api/src/db/schema/{campaigns,users,subscriptions,bookings,member-profiles,referrals,branches,activities,notifications}.ts`
- `el-templo-api/test/{tenant-manifest.ts, tenancy/iso-01-manifiesto.test.ts, tenancy/iso-03-campaigns.test.ts, campaigns-audience.test.ts}`
- `el-templo-app/src/{router/index.ts, router/routes.ts, boot/deep-links.ts, boot/axios.ts, composables/useTokenStorage.ts, composables/useSchedulingApi.ts, stores/useAuthStore.ts, pages/ReservasPage.vue}`
- `el-templo-admin/src/{pages/CampaniasPage.vue, composables/useCampaignsApi.ts, types/campaign.ts}`
- `.claude/skills/el-templo-db-migrations/SKILL.md`, `CLAUDE.md`
- Memoria: `reference_gates_tenancy_ruta_job_nueva.md`, `project_phase_119_freemium_trial_campaign.md`
- `.planning/phases/180-*/180-CONTEXT.md`

### Secundarias (confianza MEDIA — web, verificadas por convergencia de fuentes)

- [Magic link token consumed by email security scanners — better-auth discussion #6985](https://github.com/better-auth/better-auth/discussions/6985)
- [Magic links and password reset tokens consumed by email scanners — supabase discussion #41618](https://github.com/orgs/supabase/discussions/41618)
- [Are Magic Links Secure: A Technical Deep Dive — Security Boulevard](https://securityboulevard.com/2026/05/are-magic-links-secure-a-technical-deep-dive-into-email-based-authentication/)
- [Magic link email best practices — Fluxly](https://www.getfluxly.com/blog/magic-link-email-best-practices)
- [add-event-to-calendar-docs — Google](https://interactiondesignfoundation.github.io/add-event-to-calendar-docs/services/google.html)
- [Build a Google Calendar Link — Robert MacLean](https://www.sadev.co.za/build-google-calendar-link)

### Terciarias (confianza BAJA — no usadas para afirmaciones)

- Ninguna.

## Metadata

**Desglose de confianza:**

- Stack estándar: **ALTA** — cero dependencias nuevas, verificado leyendo imports reales.
- Arquitectura (magic link, audiencias, tenancy): **ALTA** — patrones leídos del código, con precedentes exactos citados por archivo y línea.
- Pitfalls: **ALTA** para los 14 (todos derivados de código leído, no de suposición). Los dos 🔴 (Pitfall 9 y 10) son bugs latentes verificados, no hipótesis.
- Mecánica de calendario y mitigaciones anti-prefetch: **MEDIA** — fuentes web convergentes, sin documentación oficial de vendor.
- Definiciones exactas de segmento: **MEDIA** — el SQL es claro, pero A1 (¿"pagó" = `price_paid > 0`?) necesita confirmación del usuario.

**Fecha de research:** 2026-08-22
**Válido hasta:** ~2026-09-21 (30 días). **Se invalida antes si:** el tren v6.0 baja a master (cambia la numeración de migraciones y posiblemente el shim de nombres de sede), o si se envía la campaña de la fase 119 (invalida A7).

---

_Fase: 180 — Campañas etapa 2 (magic links, audiencias, ReservasPage informativa)_
_Research: 2026-08-22_
