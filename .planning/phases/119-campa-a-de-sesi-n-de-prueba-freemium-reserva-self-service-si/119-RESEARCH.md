# Phase 119: Campaña de sesión de prueba freemium (reserva self-service + sistema de email reutilizable) - Research

**Researched:** 2026-06-01
**Domain:** Email campaign infra over Resend + self-service trial booking + Capacitor deep linking + funnel tracking
**Confidence:** HIGH (codebase findings verified by reading source; external Resend/email findings CITED from official docs)

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Estado del usuario y modelo de la trial**

- **D-01:** Freemium reserva → pasa a `status='prueba'` AL RESERVAR (no al asistir). Reusa `trials-service.ts` (opera sobre `status='prueba'`), aparece en reporte de leads/trials (fase 114), avanza funnel freemium→prueba en `user_status_history`.
- **D-02:** Distinguir trial auto-reservada (self-service) de creada por admin: `createdBy=null` (o flag/`source`). `leadStatus` arranca en `'en_seguimiento'`.
- **D-03:** La sesión de prueba NO se puede cancelar ni re-reservar desde la app (irreversible para el alumno), apalancando el guard de una-por-vida ya existente.

**Mecánica de la oferta**

- **D-04:** Oferta dura 30 días (reservar Y asistir). Token de reserva del email vence a los 30 días.
- **D-05:** Horizonte de reserva para trials se amplía a 30 días (hoy es hoy..+2d, `booking-service.ts:65-75`).
- **D-06:** Freemium elige cualquier sede física activa de su país + cualquier horario disponible. Reusar selector de sucursal (`ReservasPage.vue` ~26-44). Vive en "Templo Online" (virtual); elige sede física primero, luego día/horario.
- **D-07:** Trial NO consume capacidad (ya implementado: `countActiveBookings` filtra `is_trial=false`).

**Audiencia / elegibilidad**

- **D-08:** Filtros obligatorios: `status='freemium'`, sin suscripción (activa/paused/scheduled), sin trial previo, con email válido, no dado de baja (no unsubscribe).
- **D-09:** Alcance: todos los elegibles, incluidos ghosts e inactivos (campaña de reactivación). NO excluir por actividad ni antigüedad.
- **D-10:** Default extra: no enviar a registros de los últimos ~3 días (no pisar onboarding).
- **D-11:** Un solo envío. Sistema preparado para segmentar "no abrieron/no reservaron" para follow-up futuro, pero scheduler NO se construye en esta fase.

**Email — sistema reutilizable sobre Resend**

- **D-12:** Sistema de campañas reutilizable (tabla[s] campaña + envíos). Sobre Resend (ya integrado, SIN deps nuevas).
- **D-13:** El email lista la dirección de cada sede física.
- **D-14:** Doble CTA: (a) "reservar en la app" vía deep link con token; (b) WhatsApp (cae al flujo tradicional / fallback sin app).
- **D-15:** Unsubscribe propio, alcance SOLO marketing/campañas — NO afecta transaccionales ni push.
- **D-16:** Template HTML responsive (dark mode/mobile/Gmail/Apple Mail/Outlook).
- **D-17:** Resend hoy SIN API key en prod (degrada en silencio). Esta fase requiere setear API key en prod + verificar dominio `eltemplo.org` en Resend (hay acceso DNS; SPF/DMARC ya en Google Workspace).

**Tracking del funnel**

- **D-18:** Tracking completo: enviado → abierto (pixel) → click (redirect con token) → reservó → asistió → convirtió. Apertura por pixel aproximada (Apple Mail la infla); click vía redirect con token es la métrica confiable. asistió/convirtió se apoyan en `user_status_history` (fase 117).
- **D-19:** Funnel en sección "Campañas" dedicada en admin (NO dentro de analytics/Reportes). Lista de campañas + funnel por campaña.

**Activación en la app (deep link / "modo reservar prueba")**

- **D-20:** "Modo reservar prueba" se activa por ELEGIBILIDAD del usuario, NO por el token. Cualquier freemium elegible ve el modo prueba al abrir Reservas, venga del mail o no.
- **D-21:** El token del email NO autoriza ni autentica la reserva. Su rol: (a) trackear click, (b) deep-linkear a la pantalla. La autorización real la valida el backend server-side (sesión autenticada + freemium elegible + guard una-por-vida).
- **D-22:** `ReservasPage.vue` pasa de 2 a 3 estados: (1) muro actual (`!hasPresencialPlan`); (2) modo reservar prueba (freemium elegible — sede física primero, banner, grid a 30d, reserva como trial, sin cancelar); (3) prueba ya reservada ("ya tenés tu sesión de prueba para [fecha] en [sede]", sin reservar otra ni cancelar).

### Claude's Discretion

- Diseño del esquema de tablas de campaña/envíos/eventos y de la columna `source`/distinción self-service en bookings/trials.
- Implementación del token de tracking/navegación (firma, payload, expiración 30d) — siempre dentro de D-21 (no autoriza).
- Implementación del pixel de apertura y redirect de click.
- Endpoint nuevo (`reserve-trial`) vs extender `/reserve`.
- Estructura del deep link y fallback a store/web.
- Copy/tono/asunto del email (lo aporta/itera el usuario).
- Número(s) de WhatsApp y mensaje del CTA.

### Deferred Ideas (OUT OF SCOPE)

- Follow-up/re-envío automático (scheduler de re-targeting + tope por persona).
- Conversión automática post-asistencia (recepción sigue asignando el plan).
- Recordatorio pre-sesión (push/email).
- Landing web de reserva en `el-templo-web`.
- Email Service Swap (Resend → nodemailer + Workspace SMTP).
- Centralizar el cliente Resend duplicado (solo si no expande scope).
  </user_constraints>

<phase_requirements>

## Phase Requirements

Cada decisión D-01..D-22 es un requisito. Mapa de soporte de investigación:

| ID   | Descripción                                              | Research Support                                                                                                                                                                         |
| ---- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| D-01 | freemium→prueba al reservar, emite `user_status_history` | Patrón exacto en `convertFreemiumToTrial` (members/service.ts:817-892): UPDATE status + insert userStatusHistory en una `db.transaction`. Reusar como blueprint.                         |
| D-02 | distinguir self-service (`createdBy=null`/`source`)      | `bookings` no tiene columna de origen hoy → agregar `source` enum a `bookings` (`'self_service'                                                                                          | 'admin'`) o nullable `createdBy`. `users.createdBy` ya existe pero es a nivel de lead, no de booking. |
| D-03 | no cancelable ni re-reservable desde app                 | Guard una-por-vida ya en `trials-service.ts:149-169`; bloquear cancel en `booking-service.cancel` para `isTrial=true` + ocultar botón en UI (D-22 estado 3).                             |
| D-04 | oferta 30d; token vence 30d                              | Token HMAC con `exp` (patrón `qr-token.ts`).                                                                                                                                             |
| D-05 | horizonte reserva trials = 30d                           | `booking-service.ts:65-75` hardcodea `maxDate=addDays(today,2)`. Necesita branch para trials (parámetro `isTrial`/`windowDays`).                                                         |
| D-06 | cualquier sede física activa del país + horario          | Reusar `GET /members/scheduling/branches` (routes.ts:766) ya filtra activas+no-virtuales+país; reusar `getWeeklyGrid`.                                                                   |
| D-07 | trial no consume capacidad                               | Ya implementado (`countActiveBookings` filtra `is_trial=false`).                                                                                                                         |
| D-08 | filtros de audiencia                                     | Query nueva en campaign-service: `status='freemium'` + NOT EXISTS sub activa/paused/scheduled + NOT EXISTS booking `is_trial` no-cancelada + email IS NOT NULL + NOT EXISTS unsubscribe. |
| D-09 | incluir ghosts/inactivos                                 | No filtrar por `member_logins`/actividad.                                                                                                                                                |
| D-10 | excluir registros últimos 3d                             | `users.created_at < NOW() - INTERVAL 3 DAY`.                                                                                                                                             |
| D-11 | un solo envío, preparado para segmentar                  | Schema con `campaign_sends` por usuario permite re-query "no abrió/no reservó" después.                                                                                                  |
| D-12 | sistema reutilizable sobre Resend, sin deps              | `resend@6.9.3` ya instalado; `EmailService` existe. Extender, no duplicar.                                                                                                               |
| D-13 | email lista direcciones de sedes                         | `branches` NO tiene columna `address` hoy (ver Runtime/Schema gap). Decisión pendiente: agregar `address` a `branches` o hardcodear en template.                                         |
| D-14 | doble CTA (app deep link + WhatsApp)                     | `buildWhatsAppUrl` ya existe (app util); WhatsApp es link directo en el HTML del email.                                                                                                  |
| D-15 | unsubscribe propio, solo marketing                       | Tabla `campaign_unsubscribes` (email o userId) + endpoint público `GET /campaigns/unsubscribe?token=`.                                                                                   |
| D-16 | HTML responsive cross-cliente                            | Reglas accionables en §Email HTML.                                                                                                                                                       |
| D-17 | API key prod + verificar dominio                         | Subdominio `send.eltemplo.org` recomendado (coexiste con Workspace SPF).                                                                                                                 |
| D-18 | tracking completo                                        | Pixel + redirect endpoints públicos + cruce con bookings/attendance/user_status_history.                                                                                                 |
| D-19 | sección Campañas en admin                                | Nueva página + ruta `/campanias`, patrón de tabs de `ReportesPage.vue`.                                                                                                                  |
| D-20 | modo prueba por elegibilidad, no token                   | `/me` NO expone `status` hoy → endpoint nuevo de elegibilidad.                                                                                                                           |
| D-21 | token no autoriza                                        | Backend valida estado en `reserve-trial`; token solo navega/trackea.                                                                                                                     |
| D-22 | ReservasPage 3 estados                                   | `hasPresencialPlan` (ReservasPage.vue:401) + nuevo `trialEligibility`.                                                                                                                   |

</phase_requirements>

## Summary

Esta fase cruza 4 capas pero, críticamente, **casi toda la mecánica del backend de reserva ya existe** — el trabajo principal es exponerla self-service de forma segura y construir desde cero un módulo de campañas de email reutilizable.

Los hallazgos clave del codebase:

1. **El patrón de promoción atómica freemium→prueba ya está escrito** en `members/service.ts:convertFreemiumToTrial` (UPDATE status + `userStatusHistory` insert dentro de `db.transaction`). El endpoint self-service debe replicar exactamente este patrón pero con `source='self_service'`/`createdBy=null` y combinándolo con el booking en la misma transacción.
2. **`trials-service.bookTrial` exige `status='prueba'` ANTES de bookear** y valida `branchId` del usuario == `branchId` del slot. Como D-01 promueve al reservar y D-06 permite cualquier sede física del país, el orden importa: hay que **promover + reasignar branch + bookear atómicamente**, o adaptar el service para aceptar la promoción.
3. **La ventana de booking es hoy..+2d hardcodeada** (`booking-service.ts:71`). Las trials necesitan 30 días → branch condicional por `isTrial`.
4. **El check-in QR hard-bloquea sin suscripción** (`attendance/service.ts:71`). Un freemium en 'prueba' NO puede hacer self check-in con QR. Hoy las trials se atienden vía `forceCheckIn`/`coachCheckIn` (coach manual) que bypasea la validación de sub. La atribución "asistió" del funnel se apoya en eso + `user_status_history`.
5. **Deep linking es greenfield**: NO hay intent filters (Android), NO hay associated domains (iOS solo tiene `aps-environment`), NO hay listener `appUrlOpen`. Requiere config nativa nueva.
6. **`/me` no expone `users.status`** → el gate de elegibilidad (D-20) necesita un endpoint dedicado.
7. **`resend@6.9.3` ya instalado** (no deps nuevas). Resend batch envía hasta 100 emails/request, soporta idempotency keys, pero NO trae open pixel / click redirect / unsubscribe propio — todo se construye nosotros (alineado con D-12/D-18).

**Primary recommendation:** Endpoint nuevo `POST /members/scheduling/reserve-trial` (NO extender `/reserve` — la lógica de elegibilidad/promoción/ventana-30d es divergente y mezclarla rompería el flujo de socios). Módulo `campaigns/` nuevo siguiendo el patrón facade. Tracking pixel + redirect en rutas públicas sin auth. Token HMAC mirror de `qr-token.ts`. Subdominio `send.eltemplo.org` para Resend. Email HTML a mano (table-based, inline CSS, bulletproof VML buttons) — sin MJML salvo aprobación explícita.

## Architectural Responsibility Map

| Capability                                            | Primary Tier                             | Secondary Tier                 | Rationale                                                                    |
| ----------------------------------------------------- | ---------------------------------------- | ------------------------------ | ---------------------------------------------------------------------------- |
| Validar elegibilidad freemium + promover a prueba     | API / Backend                            | —                              | Autorización server-side (D-21); estado de usuario es fuente de verdad en DB |
| Reserva self-service de trial (atómica con promoción) | API / Backend                            | —                              | Transacción DB; reusa trials-service/booking-service                         |
| Ventana de booking ampliada a 30d para trials         | API / Backend                            | —                              | Regla de negocio en booking-service                                          |
| Envío en lote de la campaña                           | API / Backend                            | Resend (externo)               | Resend es transporte; la orquestación/idempotencia/tracking es nuestra       |
| Generación del token HMAC personalizado               | API / Backend                            | —                              | Firma con JWT_SECRET; nunca en el cliente                                    |
| Pixel de apertura + redirect de click                 | API / Backend (rutas públicas)           | —                              | Endpoints sin auth, llamados por el cliente de email / navegador             |
| Unsubscribe                                           | API / Backend (ruta pública)             | —                              | Link en email → endpoint público                                             |
| Hosting de imágenes del email                         | API / Backend (static) o `el-templo-web` | —                              | NO CDN (regla proyecto): servir desde `eltemplo.org`                         |
| Render del email HTML                                 | API / Backend (templates.ts)             | —                              | Server-side template, igual que transaccionales actuales                     |
| Modo "reservar prueba" / 3 estados                    | App (member, Vue/Quasar)                 | API (eligibility)              | UI gate; estado autoritativo viene de API                                    |
| Deep link → pantalla de reserva                       | App (Capacitor nativo + router)          | OS (App Links/Universal Links) | Config nativa + listener en boot                                             |
| Fallback sin app instalada                            | OS / Store + WhatsApp                    | —                              | App Links degradan a web/store; WhatsApp CTA cubre caso sin app (D-14)       |
| Sección "Campañas" (lista + funnel)                   | Admin (Vue/Quasar)                       | API (campaign funnel)          | UI de reporte; datos del backend                                             |

## Standard Stack

### Core (todo ya instalado — SIN deps nuevas)

| Library                              | Version           | Purpose                               | Why Standard                                             |
| ------------------------------------ | ----------------- | ------------------------------------- | -------------------------------------------------------- |
| `resend`                             | 6.9.3 (instalada) | Envío de email (batch + single)       | Ya integrado en `EmailService`; D-12 prohíbe deps nuevas |
| `drizzle-orm`                        | 0.45.1            | Schema + migraciones de campañas      | Stack del proyecto                                       |
| `@fastify/jwt` / `crypto.createHmac` | builtin           | Token HMAC del tracking               | Patrón ya usado en `qr-token.ts`                         |
| `@capacitor/app`                     | 8.0.0 (instalada) | Listener `appUrlOpen` para deep links | Ya en deps; provee `App.addListener('appUrlOpen')`       |
| Quasar/Vue 3                         | 2.16 / 3.5        | UI 3er estado + página Campañas       | Stack del proyecto                                       |

### Supporting

| Library           | Version                  | Purpose                                | When to Use                                                            |
| ----------------- | ------------------------ | -------------------------------------- | ---------------------------------------------------------------------- |
| `@fastify/static` | (verificar si instalada) | Servir imágenes del email desde la API | Solo si se decide hostear imágenes en la API en vez de `el-templo-web` |

**Verificación de versión:** `resend` instalada `6.9.3`; última en npm `6.12.4` [VERIFIED: npm registry — `npm view resend version` → 6.12.4]. NO actualizar (regla del proyecto: no bumpear deps sin aprobación; 6.9.3 cubre batch + idempotency keys). `@capacitor/app@^8.0.0` ya en `package.json` del member app [VERIFIED: codebase grep].

**Decisión PENDIENTE de aprobación (NO asumir):** Si se quisiera un build-step de email (MJML) para el HTML responsive, eso es una **dep nueva** → requiere aprobación explícita del usuario (regla: no instalar deps sin aprobación). Recomendación por defecto: **HTML a mano** (table-based), sin MJML. [ASSUMED — recomendación; confirmar con usuario]

## Package Legitimacy Audit

> No se instalan paquetes nuevos en esta fase (D-12: "sin dependencias nuevas"). Todos los paquetes usados ya están en el lockfile committeado.

| Package        | Registry | Age    | Downloads | Source Repo                             | slopcheck          | Disposition               |
| -------------- | -------- | ------ | --------- | --------------------------------------- | ------------------ | ------------------------- |
| resend         | npm      | maduro | alto      | github.com/resend/resend-node           | N/A (ya instalada) | Approved — ya en lockfile |
| @capacitor/app | npm      | maduro | alto      | github.com/ionic-team/capacitor-plugins | N/A (ya instalada) | Approved — ya en lockfile |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

_Esta fase NO agrega dependencias. Si el planner identifica una librería de email (MJML, juice, etc.) la debe gatear con `checkpoint:human-verify` ya que viola D-12 y la regla de proyecto de no instalar deps sin aprobación._

## Architecture Patterns

### System Architecture Diagram

```
                          ┌─────────────────────────────────────────┐
   ADMIN dispara campaña  │  Admin "Campañas" (Vue)                  │
        ───────────────►  │  POST /api/admin/campaigns/:id/send      │
                          └───────────────┬─────────────────────────┘
                                          │
                          ┌───────────────▼─────────────────────────┐
                          │  CampaignService (facade)                │
                          │  1. query elegibles (D-08/09/10)         │
                          │  2. crea campaign_sends por usuario       │
                          │  3. genera token HMAC por send (D-04/21)  │
                          │  4. render HTML (template + merge vars)   │
                          │  5. Resend batch (≤100/req, idempotency)  │
                          └───────┬───────────────────┬──────────────┘
                                  │                   │
                       ┌──────────▼──────┐   ┌────────▼──────────┐
                       │ Resend API      │   │ campaign_sends    │
                       │ (transporte)    │   │ campaign_events   │
                       └──────────┬──────┘   └───────────────────┘
                                  │ entrega email al inbox
                                  ▼
        ┌──────────────────── EMAIL HTML ────────────────────┐
        │  [pixel 1x1] [CTA App: deep link+token] [WhatsApp]  │
        │  [direcciones de sedes] [unsubscribe]               │
        └──┬──────────────┬────────────────┬──────────────┬───┘
           │ open         │ click          │ click WA     │ unsub
           ▼              ▼                ▼              ▼
  GET /campaigns/    GET /campaigns/   wa.me/...   GET /campaigns/
  track/open?t=..    track/click?t=..  (flujo       unsubscribe?t=..
  (pixel→event)      (event→302 redir) tradicional)  (insert unsub)
                         │
                         │ 302 → deep link (App Link / Universal Link)
                         ▼
        ┌──────────────────── APP (member) ──────────────────┐
        │ appUrlOpen listener → router push /reservas?trial=1 │
        │ (si deslogueado: login → continúa al destino)       │
        │ ReservasPage: GET eligibility → 3 estados (D-22)    │
        │  estado 2: elige sede física → grid 30d → reservar  │
        └──────────────────────┬──────────────────────────────┘
                               │ POST /members/scheduling/reserve-trial
                               ▼
        ┌──────────────── reserve-trial (API) ────────────────┐
        │ tx: validar elegibilidad (freemium+sin sub+sin trial)│
        │     UPDATE status freemium→prueba + branchId         │
        │     INSERT userStatusHistory (source='self_service') │
        │     INSERT booking (is_trial=1, source='self_service')│
        │     (override ventana 30d; no consume capacidad)     │
        └──────────────────────────────────────────────────────┘
                               │
                          (días después)
                               ▼
        ┌──────────── asistencia (coach manual) ──────────────┐
        │ coachCheckIn/forceCheckIn (bypasea sub) → attendance │
        │ recepción asigna plan → recomputeUserStatus →        │
        │   userStatusHistory prueba→activo (= "convirtió")    │
        └──────────────────────────────────────────────────────┘

  Funnel admin lee: campaign_sends + campaign_events (enviado/abierto/click)
                  ⨯ bookings.is_trial (reservó)
                  ⨯ attendance (asistió)
                  ⨯ user_status_history toStatus='activo' (convirtió)
```

### Recommended Project Structure

```
el-templo-api/src/modules/campaigns/        # módulo NUEVO (facade pattern)
├── service.ts            # CampaignService (facade): create, listEligible, send, funnel
├── token-service.ts      # firmar/validar token HMAC (mirror de shared/qr-token.ts)
├── tracking-service.ts   # recordOpen, recordClick, recordUnsubscribe
├── templates.ts          # HTML del email de campaña (table-based, bulletproof)
├── routes.ts             # rutas admin (/api/admin/campaigns) + públicas (/api/campaigns/track|unsubscribe)
├── schemas.ts            # Fastify validation
└── types.ts

el-templo-api/src/db/schema/
├── campaigns.ts          # campaign, campaign_sends, campaign_events, campaign_unsubscribes
└── (extender) bookings.ts  # + source enum

el-templo-app/src/
├── pages/ReservasPage.vue          # 3er estado (D-22)
├── composables/useSchedulingApi.ts # + getTrialEligibility, reserveTrial
└── boot/deep-links.ts              # NUEVO: App.addListener('appUrlOpen')

el-templo-admin/src/
├── pages/CampaniasPage.vue         # NUEVO (D-19) — patrón tabs de ReportesPage
├── components/campaigns/           # NUEVO: lista + funnel chart
└── composables/useCampaignsApi.ts  # NUEVO
```

### Pattern 1: Promoción atómica freemium→prueba + booking (la base del reserve-trial)

**What:** Replicar el patrón exacto de `convertFreemiumToTrial` pero en una sola transacción que TAMBIÉN inserta el booking.
**When to use:** En `reserve-trial`.
**Example (patrón verificado en codebase):**

```typescript
// Source: el-templo-api/src/modules/members/service.ts:863-885 (convertFreemiumToTrial)
const statusBefore = user.status; // 'freemium'
await this.db.transaction(async (tx) => {
  await tx
    .update(schema.users)
    .set({
      status: "prueba" as const,
      leadStatus: "en_seguimiento" as const,
      // createdBy queda NULL (D-02: self-service, sin admin)
      branchId: chosenPhysicalBranchId, // D-06: sede física elegida
    })
    .where(eq(schema.users.id, userId));

  await tx.insert(schema.userStatusHistory).values({
    userId,
    fromStatus: statusBefore,
    toStatus: "prueba",
    source: "self_service", // D-02 (hoy el enum-string acepta 'recompute'|'backfill'|'admin')
  });

  await tx.insert(schema.bookings).values({
    memberId: userId,
    scheduleId,
    bookingDate,
    status: "reservado",
    isTrial: true,
    // source: "self_service"  // D-02 (columna nueva)
  });
});
```

**Nota crítica:** `trials-service.bookTrial` NO se puede reusar tal cual porque (a) exige `status='prueba'` ANTES (line 136), (b) exige `user.branchId === schedule.branchId` ANTES de la promoción (line 143), (c) no es transaccional con la promoción de status. El planner debe decidir: refactor de `bookTrial` para aceptar un modo "promote-and-book" atómico, **o** una nueva ruta en `reserve-trial` que reúse solo el guard una-por-vida (líneas 149-169) y la lógica de reactivar booking cancelado (líneas 176-209).

### Pattern 2: Token HMAC stateless (mirror de qr-token)

**What:** Token firmado con `JWT_SECRET` que identifica `{userId, campaignId, sendId, exp}` pero NO autoriza (D-21).
**Example:**

```typescript
// Source: el-templo-api/src/modules/shared/qr-token.ts (adaptado)
import { createHmac } from "crypto";
interface CampaignTokenPayload {
  userId: number;
  campaignId: number;
  sendId: number;
  exp: number;
}
function signCampaignToken(p: CampaignTokenPayload): string {
  const b64 = Buffer.from(JSON.stringify(p)).toString("base64url");
  const sig = createHmac("sha256", process.env.JWT_SECRET!)
    .update(b64)
    .digest("base64url");
  return `${b64}.${sig}`;
}
// validateCampaignToken devuelve el payload SOLO para trackear/navegar — el
// reserve-trial IGNORA el token y revalida estado server-side (D-21).
```

### Pattern 3: Rutas públicas (sin auth hook) para pixel/click/unsubscribe

**What:** Registrar un plugin de rutas SIN `fastify.addHook("onRequest", authenticate)`. Patrón ya usado por `franchiseRoutes`, `blogRoutes` (formularios públicos).
**When to use:** `GET /api/campaigns/track/open`, `track/click`, `unsubscribe`.
**Nota:** El pixel debe responder un GIF/PNG 1x1 con `Content-Type: image/gif` y headers `Cache-Control: no-store` (evita que el proxy de imágenes cachee y no registre re-aperturas). El click hace `reply.redirect(302, deepLinkUrl)`.

### Anti-Patterns to Avoid

- **Instanciar `new Resend()` suelto en el módulo de campañas:** ya hay duplicación en franchise/gladius/academy/app-landing. Centralizar en `EmailService` (extender) — el CONTEXT lo marca explícitamente como anti-patrón a no replicar.
- **Confiar en el token para autorizar la reserva (D-21):** el token solo navega/trackea. Toda autorización es server-side por estado del usuario autenticado.
- **Gatear el "modo prueba" por el token (D-20):** se gatea por elegibilidad. El usuario sin el mail debe poder reservar igual.
- **`;` dentro de comentarios SQL en migraciones:** el runner splittea por `;` antes de strippear `--` (regla del proyecto). Romperá la migración entera.
- **`drizzle-kit migrate`:** prohibido. Usar `pnpm db:generate` + commit del `.sql` + `pnpm db:migrate` (runner propio).

## Don't Hand-Roll

| Problem                       | Don't Build                                 | Use Instead                                                                                 | Why                                                          |
| ----------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Promoción status + history    | UPDATE manual suelto                        | Patrón `convertFreemiumToTrial` (members/service.ts)                                        | Ya maneja la atomicidad y el insert de history correctamente |
| Token firmado stateless       | JWT pesado/sesión nueva                     | Mirror de `shared/qr-token.ts` (HMAC-SHA256 con JWT_SECRET)                                 | Patrón probado, sin estado, ya en el codebase                |
| WhatsApp URL por país         | Hardcodear número                           | `buildWhatsAppUrl` (app util) en la app; en el email usar wa.me con número por país         | Ya resuelve AR/ES                                            |
| Selector de sucursal          | UI nueva                                    | Reusar `isMultiBranch`/branch selector de ReservasPage + `GET /members/scheduling/branches` | D-06 lo exige explícitamente                                 |
| Grid de horarios              | Query nueva                                 | `getWeeklyGrid` (SchedulingService)                                                         | Ya filtra capacidad e `is_trial`                             |
| Envío en lote                 | Loop de sends individuales con retry propio | `resend.batch.send()` (≤100/req) + idempotency keys                                         | Resend ya da idempotencia y batching                         |
| Funnel freemium→prueba→activo | Cálculo nuevo                               | Alinear con `funnel-service.ts` (fase 118) + `user_status_history`                          | La fuente de verdad del funnel ya existe                     |
| Tabs admin                    | Layout nuevo                                | Patrón `ReportesPage.vue` (q-tabs + q-tab-panels + filtros país/sede)                       | Consistencia D-19                                            |

**Key insight:** El 70% del backend de reserva ya existe. El riesgo real está en (1) cosido transaccional de promoción+booking, (2) la ventana de 30d, (3) que el check-in QR no sirve para freemium, y (4) el módulo de campañas que es genuinamente nuevo.

## Email System over Resend (D-12, D-17)

### Capacidades de la API cruda de Resend

- **Batch:** `resend.batch.send([...])` — hasta **100 emails por request**; máx **50 destinatarios por email** individual. [CITED: resend.com/docs/api-reference/emails/send-batch-emails]
- **Idempotency keys:** soportadas; únicas por request, expiran a las 24h, máx 256 chars. Usar `campaignId:sendId` o `sendId` como key para evitar duplicados ante reintentos. [CITED: resend.com/docs/api-reference/emails/send-batch-emails]
- **Merge/template variables:** soportadas vía objeto `template {id, variables}` (Resend-hosted templates). **Recomendación:** NO usar templates hosteados de Resend — renderizar el HTML server-side con interpolación propia (igual que `templates.ts` actual) para mantener el HTML versionado en git y bajo control. [CITED: resend.com docs]
- **NO soportado / lo construimos nosotros (alineado con D-12/D-18):** open pixel, click redirect, unsubscribe list, supresión por bounce. `attachments` y `scheduled_at` tampoco están soportados en batch. [CITED: resend.com docs]

### Verificación de dominio (D-17)

- Resend requiere **SPF + DKIM** (DMARC opcional pero recomendado). [CITED: resend.com/docs/dashboard/domains/introduction]
- **Coexistencia con Google Workspace:** Resend **recomienda usar un subdominio** (ej. `send.eltemplo.org` o `updates.eltemplo.org`) para aislar reputación de envío y evitar conflicto con el SPF de Workspace en el dominio raíz. Un dominio solo puede tener UN registro SPF; el subdominio tiene su propio SPF independiente. Resend pide además un TXT (Envelope From) y un MX en el subdominio para procesar bounces. Alineación DMARC: estricta en DKIM, relajada en SPF — coexiste correctamente con Workspace. [CITED: resend.com docs; support.google.com/a/answer/33786]
- **Implicación para `EMAIL_FROM`:** hoy es `El Templo <noreply@eltemplo.org>` (dominio raíz). Para campañas conviene un `from` en el subdominio verificado, ej. `El Templo <hola@send.eltemplo.org>`. **Decisión de infra pendiente del usuario** (acceso DNS): qué subdominio y qué `from`. [ASSUMED — recomendación de subdominio; el subdominio exacto lo decide el usuario]

### Reputación / deliverability (lista con ghosts/inactivos — D-09)

- Enviar de golpe a una lista grande con inactivos/ghosts (emails posiblemente muertos) eleva el riesgo de **bounces y spam complaints**, lo que daña la reputación de un dominio recién verificado (sin warm-up). [ASSUMED — práctica general de email marketing, no verificado contra docs de Resend]
- **Mitigaciones recomendadas (a decidir con el usuario):** (a) warm-up implícito enviando en tandas (el batching de 100 ya ayuda); (b) suprimir hard-bounces vía el estado de Resend antes de un futuro re-envío; (c) considerar verificación de sintaxis de email antes de enviar. Como es **un solo envío** (D-11) el riesgo es acotado, pero el sistema debe **registrar bounces** para no re-enviarles en la fase de follow-up futura. [ASSUMED]

## Email HTML Responsive — Reglas Accionables (D-16)

Reglas para que el email se vea bien en Gmail, Apple Mail, Outlook (Word engine), mobile y dark mode: [CITED: litmus.com bulletproof buttons; templyft.com advanced HTML CSS 2025]

1. **Layout 100% table-based.** Nada de flexbox/grid. `<table role="presentation" cellpadding="0" cellspacing="0" border="0">` anidadas. Ancho del contenedor ~**600px** (pixel-based más confiable que %).
2. **CSS inline** en cada elemento (`style="..."`). Los `<style>` en `<head>` con media queries funcionan en clientes que los soportan, pero el estilo base debe estar inline porque Gmail/Outlook ignoran o limitan el `<head>`.
3. **Botones "bulletproof":** híbrido VML (Outlook) + HTML/CSS (resto). Outlook for Windows usa Word: necesita `<!--[if mso]> <v:roundrect ...> <![endif]-->` para fondo y bordes redondeados. Texto en vivo (no imagen), contraste ≥ 4.5:1, label significativo (no "click aquí"). Generador de referencia: buttons.cm (Campaign Monitor).
4. **Media queries para mobile:** solo el HTML necesita ser responsive (VML no). Usar `@media screen and (max-width:600px)` para apilar columnas y ampliar tap targets. Outlook desktop no soporta media queries → diseñar el base layout para que funcione sin ellas.
5. **Dark mode:** Gmail/Outlook.com pueden invertir colores. Usar `@media (prefers-color-scheme: dark)` para forzar colores, pero **siempre con fallback sólido** porque algunos clientes ignoran `prefers-color-scheme`. Para la paleta Navy `#2c3e5c` / Bronze `#b8956c`: evitar texto navy oscuro sobre fondo que el cliente pueda invertir; preferir fondos con contraste robusto en ambos modos.
6. **Fallback de imágenes:** `alt` text en TODA imagen; nunca depender de que las imágenes carguen. El CTA principal debe ser texto/botón bulletproof, no una imagen. La estructura debe leerse completa con imágenes deshabilitadas (Outlook bloquea imágenes por defecto).
7. **Tipografía serif (marca):** usar web-safe serif con fallback (`font-family: Georgia, 'Times New Roman', serif`) — las fuentes custom NO cargan en la mayoría de clientes de email; no intentar cargar @fontsource ni Google Fonts (también viola NO CDN).

### Hosting de imágenes — REGLA NO CDN (crítico)

- El proyecto prohíbe CDN en producción (self-host de assets). Las imágenes del email **deben servirse desde un host propio bajo `eltemplo.org`**.
- **Opciones (decisión del planner/usuario):**
  - (A) Servir desde `el-templo-web` (Nuxt, ya en `eltemplo.org`): poner las imágenes en `public/email/` → URLs `https://eltemplo.org/email/...`. Es estático, sin CDN externo, ya desplegado. **Recomendado.**
  - (B) Servir desde la API con `@fastify/static` bajo un prefix público (ej. `/api/campaigns/assets/`). Verificar si `@fastify/static` está instalado antes de proponerlo (hoy NO se detectó registro de estático en `app.ts`).
  - (C) Cloudflare R2 con `R2_PUBLIC_URL` (ya integrado para blog/videos). R2 es object storage propio, no un CDN público de terceros — **probablemente aceptable** bajo la regla, pero confirmar con el usuario porque el público sirve vía dominio de R2/Cloudflare. [ASSUMED — interpretación de la regla NO CDN; confirmar]
- Las imágenes con `eltemplo.org` también evitan que algunos clientes marquen como sospechoso un dominio de imágenes distinto al del remitente.

## Tracking del Funnel (D-18)

### Endpoints (rutas públicas, sin auth)

- `GET /api/campaigns/track/open?t=<token>` → valida token (solo para identificar `sendId`), inserta `campaign_events(sendId, type='open', at=NOW)`, responde GIF 1x1 con `Cache-Control: no-store, no-cache`. Idempotencia suave: registrar todas las aperturas o solo la primera (decisión; recomendado registrar la primera + contar el resto para "abierto al menos una vez").
- `GET /api/campaigns/track/click?t=<token>&to=<destino>` → valida token, inserta `campaign_events type='click'`, responde `302` al deep link. **No** confiar en `to` del query crudo sin validar (allowlist de destinos para evitar open-redirect).
- `GET /api/campaigns/unsubscribe?t=<token>` → valida token, inserta `campaign_unsubscribes(email|userId)`, muestra página de confirmación (HTML simple).

### Caveat Apple Mail Privacy Protection (MPP)

- Apple Mail (iOS/macOS) pre-carga el pixel desde proxies de Apple **sin que el usuario abra el email**, inflando artificialmente las aperturas y ocultando la IP/timing real. [CITED: conocimiento general de email; D-18 ya lo reconoce]
- **Implicación:** "abierto" es métrica de contexto, NO confiable. El click (con token) es la métrica accionable y confiable. El admin debe ver ambas pero con el "abierto" etiquetado como aproximado.

### Atribución reservó/asistió/convirtió (cruce con fase 117/118)

- **reservó:** existe `bookings` con `is_trial=1` y `source='self_service'` para ese usuario, con `booked_at` posterior al envío de la campaña. (Distinguir de trials creadas por admin vía `source`.)
- **asistió:** existe `attendance` confirmada para ese booking trial. El check-in lo hace el coach (forceCheckIn/coachCheckIn) porque el QR self check-in bloquea sin sub (ver Pitfall 1).
- **convirtió:** `user_status_history` con `toStatus='activo'` para ese usuario tras la trial — alineado con `funnel-service.ts` (fase 118), que ya define "activo" como transición en history O primera subscription. Reusar esa definición; NO inventar una nueva.

## Deep Linking en Capacitor (greenfield)

### Estado actual (verificado)

- `src-capacitor/android/app/src/main/AndroidManifest.xml`: solo `MAIN`/`LAUNCHER` intent filter, `launchMode="singleTask"`, permisos INTERNET+CAMERA, FCM. **NO hay intent filter de deep link / App Links.**
- `src-capacitor/ios/App/App/App.entitlements`: solo `aps-environment`. **NO hay `com.apple.developer.associated-domains`.**
- **NO existe** listener `App.addListener('appUrlOpen', ...)` en el codebase (grep vacío). `@capacitor/app@^8.0.0` SÍ está instalado.
- App IDs: `com.eltemplo.app` (prod), `com.eltemplo.app.staging` (staging).

### Diseño recomendado

- **Universal Links (iOS) + App Links (Android)** con `https://eltemplo.org/...` (preferido sobre custom scheme porque degradan a web si la app no está instalada). Requiere:
  - **iOS:** agregar `applinks:eltemplo.org` a `App.entitlements` (associated-domains) + hostear `https://eltemplo.org/.well-known/apple-app-site-association` (JSON con el App ID `<TeamID>.com.eltemplo.app`). NO CDN-friendly: el archivo lo sirve `el-templo-web`.
  - **Android:** agregar un `<intent-filter android:autoVerify="true">` con `android.intent.action.VIEW`, categorías DEFAULT+BROWSABLE, `<data android:scheme="https" android:host="eltemplo.org" android:pathPrefix="/r/trial"/>` + hostear `https://eltemplo.org/.well-known/assetlinks.json` (con SHA-256 de la firma del APK — ojo: huella distinta para prod vs staging app IDs).
  - **Listener:** nuevo `boot/deep-links.ts` con `App.addListener('appUrlOpen', ({url}) => router.push(...))` que parsea el path → navega a `/reservas?trial=1` (o similar). Manejar caso deslogueado: si no hay sesión, guardar el destino y redirigir post-login (patrón de "intended route").
- **Estructura del link en el email:** el redirect de click (`/campaigns/track/click?t=...&to=...`) hace 302 a `https://eltemplo.org/r/trial?t=<token>` → App Link abre la app; si no instalada, abre web (que puede mostrar instrucciones / store / WhatsApp). El CTA de WhatsApp (D-14) es el fallback robusto.
- **Custom scheme alternativo** (`eltemplo://`): más simple pero NO degrada (muestra error si no hay app). Solo como complemento, no como primario.

**Riesgo de scope:** App Links/Universal Links requieren config nativa + archivos `.well-known` + rebuild de las apps de tienda (bump minor del member app). Es la parte más pesada de la fase fuera del módulo de campañas. El planner debe considerar si el deep link es App Link completo o un custom scheme más simple para v1 (con WhatsApp como fallback principal). [ASSUMED — recomendación App Links; confirmar nivel de esfuerzo aceptable con usuario]

## Schema de Campañas Reutilizable (Claude's Discretion)

Diseño propuesto (Drizzle, MySQL) — pensado para reutilizarse:

```
campaigns
  id, name, subject, status('draft'|'sending'|'sent'),
  created_by (users.id), created_at, sent_at, country (scope opcional)

campaign_sends                       -- un row por (campaña, usuario)
  id, campaign_id (FK), user_id (FK), email (snapshot),
  send_token (HMAC, opcional persistir o recomputar), resend_message_id,
  status('pending'|'sent'|'bounced'|'failed'), sent_at, created_at
  UNIQUE(campaign_id, user_id)        -- idempotencia de audiencia

campaign_events                       -- forward-only, reusable para cualquier tipo
  id, send_id (FK), type('open'|'click'|'bounce'), metadata(json/varchar),
  created_at
  INDEX(send_id, type)

campaign_unsubscribes                 -- alcance solo marketing (D-15)
  id, user_id (FK, nullable), email, campaign_id (FK, nullable, qué campaña lo originó),
  created_at
  UNIQUE(email)                       -- supresión por email
```

**Cómputo del funnel** (por campaña):

- enviado = COUNT(campaign_sends WHERE status='sent')
- abierto = COUNT(DISTINCT send_id en campaign_events type='open') — etiquetado aproximado
- click = COUNT(DISTINCT send_id en campaign_events type='click')
- reservó = COUNT(DISTINCT user_id) con booking is_trial=1, source='self_service', booked_at >= campaign.sent_at
- asistió = de esos, con attendance confirmada
- convirtió = de esos, con user_status_history toStatus='activo' posterior

**Distinción self-service (D-02):** agregar `source varchar/enum` a `bookings` (`'self_service'|'admin'|null`). Backfill: rows existentes quedan NULL (= histórico admin). Alternativa más liviana: no tocar `bookings` y derivar el origen del `createdBy` del lead — pero eso es a nivel usuario, no booking, y un usuario podría tener historia mixta. **Recomendado: columna `source` en `bookings`.**

## Tercer estado de ReservasPage + sección admin (D-19/D-22)

### App (ReservasPage.vue)

- Hoy: `v-if="!hasPresencialPlan"` (muro, líneas 9-22) vs `v-else` (reservas normales). `hasPresencialPlan` viene de `userStore.hasPresencialPlan` (ReservasPage.vue:401).
- **3 estados (D-22):** introducir un computed `trialMode` que dependa de un nuevo `trialEligibility` (de la API). Branch:
  1. `!hasPresencialPlan && !trialEligible && !trialBooked` → muro actual (no-elegibles).
  2. `trialEligible && !trialBooked` → modo reservar prueba (reusar branch selector `isMultiBranch`/`getBranches`, banner "Tu sesión de prueba gratis", grid a 30d, reserva como trial sin cancelar).
  3. `trialBooked` → "ya tenés tu sesión de prueba para [fecha] en [sede]" (sin reservar otra ni cancelar).
- **Endpoint de elegibilidad NUEVO** (porque `/me` no expone `status`): `GET /members/scheduling/trial-eligibility` → `{ eligible: bool, alreadyBooked: bool, booking?: {date, branchName, ...} }`. Server-side: freemium + sin sub + sin trial previo (mismo predicado que la audiencia de la campaña, D-08, sin el filtro de email/unsubscribe).
- `useSchedulingApi.ts`: agregar `getTrialEligibility()` y `reserveTrial(scheduleId, date, branchId)`.

### Admin (CampaniasPage.vue)

- Seguir el patrón de `ReportesPage.vue`: header + filtros país/sede (owner ve país) + `q-tabs`/`q-tab-panels`. Para "Campañas": tab "Lista" (campañas + estado) y vista de detalle con el funnel (reusar `chart.js`/`vue-chartjs` ya instalados, como `FunnelTab.vue` de fase 118).
- Ruta nueva en `el-templo-admin/src/router/routes.ts` (ej. `path: 'campanias'`), siguiendo el patrón de `reportes`/`analiticas`.

## Common Pitfalls

### Pitfall 1: El check-in QR self-service NO funciona para freemium en 'prueba'

**What goes wrong:** Un freemium reserva su trial, va a la sede, escanea el QR para hacer check-in y recibe "No tenés una suscripción activa".
**Why it happens:** `attendance/service.ts:71` hard-bloquea check-in si `getMemberSubscription` devuelve null (un 'prueba' no tiene sub).
**How to avoid:** Las trials se atienden con `forceCheckIn`/`coachCheckIn` (coach/recepción marca presente — bypasea la validación de sub, líneas 318-323 lo confirman: subscription es opcional ahí). Esto está alineado con el flujo tradicional. **No** intentar que el freemium haga self check-in QR en esta fase a menos que se decida explícitamente extender la validación de attendance. La atribución "asistió" del funnel depende de este check-in manual.
**Warning signs:** Si el plan incluye "freemium escanea QR" como tarea, es un agujero.

### Pitfall 2: La ventana de booking de 30d puede chocar con otras validaciones

**What goes wrong:** Ampliar a 30d solo el check de fecha (`booking-service.ts:71`) sin revisar que `getWeeklyGrid` y la generación de slots soporten mirar 30d hacia adelante.
**Why it happens:** El grid hoy se pide por semana (`weekStart`); el flujo de socios navega semana a semana. Un freemium debe poder ver hasta 4-5 semanas.
**How to avoid:** El grid ya es por semana y navegable — el freemium puede navegar semanas dentro de los 30d. Solo hay que (a) ampliar la ventana de validación en `reserve-trial`, (b) en la UI permitir navegar hasta +30d (limitar `changeWeek`). Verificar que feriados/`dayOfWeek`/slot-pasado se sigan validando.
**Warning signs:** Reserva de trial fallando con "Solo podés reservar desde hoy hasta 2 días".

### Pitfall 3: Duplicar el cliente Resend

**What goes wrong:** El módulo de campañas instancia `new Resend()` por su cuenta, replicando el anti-patrón de franchise/gladius/academy.
**How to avoid:** Extender `EmailService` con un método de campaña (o un `CampaignEmailService` que reciba la misma config). CONTEXT lo marca explícitamente.

### Pitfall 4: Open-redirect en el endpoint de click

**What goes wrong:** `GET /track/click?to=<cualquier-url>` redirige a un dominio arbitrario → phishing.
**How to avoid:** Allowlist de destinos (solo `eltemplo.org` y deep links conocidos) o derivar el destino del `campaignId` server-side en vez de aceptarlo del query.

### Pitfall 5: Migración rota por `;` en comentarios SQL

**What goes wrong:** El runner propio splittea por `;` antes de strippear `--` → un `;` dentro de un comentario rompe toda la migración.
**How to avoid:** Nunca usar `;` dentro de comentarios SQL. Commitear siempre el `.sql` generado.

### Pitfall 6: `source` en userStatusHistory es varchar(16) sin enum estricto

**What goes wrong:** Usar `source='self_service'` (12 chars) está OK, pero el comentario del schema solo documenta `'recompute'|'backfill'|'admin'`. No es un enum DB, así que técnicamente acepta cualquier string ≤16.
**How to avoid:** Usar un valor consistente (`'self_service'`) y documentarlo en el schema. Cabe en varchar(16).

## Code Examples

### Rutas públicas sin auth (patrón a seguir)

```typescript
// Source: patrón de franchiseRoutes/blogRoutes (registradas en app.ts sin onRequest auth hook)
export const campaignPublicRoutes: FastifyPluginAsync = async (fastify) => {
  // NO addHook authenticate — rutas públicas (pixel/click/unsubscribe)
  fastify.get<{ Querystring: { t: string } }>(
    "/track/open",
    async (req, reply) => {
      const payload = validateCampaignToken(req.query.t);
      if (payload) await trackingService.recordOpen(payload.sendId);
      const gif = Buffer.from(
        "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
        "base64",
      );
      return reply
        .header("Content-Type", "image/gif")
        .header("Cache-Control", "no-store")
        .send(gif);
    },
  );
};
// En app.ts: app.register(campaignPublicRoutes, { prefix: "/api/campaigns" });
```

### Batch send con idempotency

```typescript
// Source: resend.com/docs/api-reference/emails/send-batch-emails (≤100/req)
await resend.batch.send(
  chunk.map((s) => ({
    from: "El Templo <hola@send.eltemplo.org>", // subdominio verificado
    to: s.email,
    subject,
    html: renderCampaignHtml(s), // server-side, con token+pixel+unsubscribe inline
  })),
  { idempotencyKey: `campaign-${campaignId}-batch-${batchIndex}` },
);
```

## State of the Art

| Old Approach                                           | Current Approach                           | When Changed | Impact                              |
| ------------------------------------------------------ | ------------------------------------------ | ------------ | ----------------------------------- |
| Trial creada solo por admin (`status='prueba'` previo) | Self-service freemium→prueba al reservar   | Esta fase    | Nuevo endpoint + promoción atómica  |
| Booking window hoy..+2d para todos                     | +30d solo para trials                      | Esta fase    | Branch condicional por `isTrial`    |
| Email solo transaccional (1 destinatario)              | Email de campaña en lote + tracking propio | Esta fase    | Módulo `campaigns/` nuevo           |
| Sin deep links                                         | App Links/Universal Links                  | Esta fase    | Config nativa nueva + `.well-known` |

**Deprecated/outdated:**

- Resend-hosted templates: no usar (preferir HTML versionado en git).
- Custom scheme deep links: solo como complemento, no primario (no degradan sin app).

## Assumptions Log

| #   | Claim                                                       | Section            | Risk if Wrong                                                                                                           |
| --- | ----------------------------------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| A1  | HTML del email a mano (sin MJML)                            | Standard Stack     | Si el usuario quiere MJML, es dep nueva → requiere aprobación; replanificar build step                                  |
| A2  | Subdominio `send.eltemplo.org` para Resend                  | Email System       | El subdominio exacto y el `from` los decide el usuario (acceso DNS)                                                     |
| A3  | R2 podría servir imágenes bajo regla NO CDN                 | Email HTML hosting | Si NO se acepta R2, usar `el-templo-web/public/email/`                                                                  |
| A4  | App Links/Universal Links como deep link primario           | Deep Linking       | Esfuerzo nativo alto + rebuild tiendas; el usuario podría preferir custom scheme v1 con WhatsApp fallback               |
| A5  | Riesgo de deliverability con lista de ghosts/inactivos      | Email System       | Práctica general, no verificada contra docs de Resend; un solo envío acota el riesgo                                    |
| A6  | Atribución "convirtió" reusa def de funnel-service fase 118 | Tracking           | Si la def diverge, el funnel de campaña no cuadra con el funnel global                                                  |
| A7  | `branches` no tiene columna `address` (D-13)                | Phase Requirements | Verificado: schema solo tiene name/code/timezone/country/capacity. Decisión: agregar `address` o hardcodear en template |
| A8  | Trial se atiende solo vía coach check-in (no QR self)       | Pitfall 1          | Si se decide habilitar QR para 'prueba', cambia attendance/service                                                      |

## Open Questions (RESOLVED)

1. **¿`reserve-trial` nuevo endpoint o extender `/reserve`?** — **RESOLVED: D-26** → endpoint nuevo `POST /members/scheduling/reserve-trial` (no extender `/reserve`).
2. **¿Dónde se hostean las imágenes del email bajo la regla NO CDN?** — **RESOLVED: D-27** → `el-templo-web/public/email/` (estático en `eltemplo.org`).
3. **¿Deep link App Links completo o custom scheme v1?** — **RESOLVED: D-25** → App Links/Universal Links completo sobre `app.eltemplo.org`.
4. **¿`branches` necesita columna `address` (D-13)?** — **RESOLVED: D-24** → sí, columna `address` + backfill desde `el-templo-web/data/sedes.ts`; edición desde el admin DIFERIDA (no se construye UI de gestión de sedes en esta fase).

## Environment Availability

| Dependency                   | Required By                          | Available            | Version | Fallback                                                                       |
| ---------------------------- | ------------------------------------ | -------------------- | ------- | ------------------------------------------------------------------------------ |
| Resend (SDK)                 | Envío de email                       | ✓ (instalada)        | 6.9.3   | —                                                                              |
| Resend API key (prod)        | Envío real en prod                   | ✗ (D-17)             | —       | Degrada en silencio (no envía); setear en prod es parte de la fase             |
| Dominio verificado en Resend | Deliverability                       | ✗ (D-17)             | —       | Sin verificar, los envíos fallan/van a spam; verificar DNS es parte de la fase |
| `@capacitor/app`             | Deep link listener                   | ✓ (instalada)        | ^8.0.0  | —                                                                              |
| Acceso DNS de eltemplo.org   | Verificar dominio + .well-known      | ✓ (CONTEXT confirma) | —       | —                                                                              |
| `@fastify/static`            | (opción B) servir imágenes desde API | ? sin verificar      | —       | Usar `el-templo-web/public/` (opción A)                                        |
| MySQL (test `eltemplo_test`) | Tests de integración                 | ✓ (CI)               | 8+      | Tests corren en CI, no local (regla proyecto)                                  |

**Missing dependencies with no fallback:**

- Resend API key en prod + dominio verificado: bloquean el envío real. Son tareas explícitas de infra de la fase (D-17), no bloquean el desarrollo (degrada en silencio en dev/staging).

**Missing dependencies with fallback:**

- `@fastify/static`: si no está, hostear imágenes en `el-templo-web/public/email/`.

## Validation Architecture

> `workflow.nyquist_validation` ausente en config.json → tratado como habilitado.

### Test Framework

| Property           | Value                                                                                                                                                            |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework          | Vitest 4.0.18 (API)                                                                                                                                              |
| Config file        | `el-templo-api/vitest.config.ts` (sequential, 30s timeout)                                                                                                       |
| Quick run command  | `cd el-templo-api && pnpm test -- <archivo>` (correr en CI, no local — regla proyecto)                                                                           |
| Full suite command | `cd el-templo-api && pnpm test` (en CI tras push a staging)                                                                                                      |
| Helpers            | `el-templo-api/test/helpers.ts` (`createTestApp`, `getAuthToken`, `createTestMember`, `createTestPlan`, `assignTestPlan`, `createStaffUser`, `cleanAllTestData`) |

> **Regla del proyecto:** NO correr el suite local. Typecheck local sí (`pnpm typecheck`). Cuando los tests estén listos, avisar y pushear a staging para que corra CI.

### Phase Requirements → Test Map

| Req ID     | Behavior                                                                     | Test Type   | Automated Command                                        | File Exists?             |
| ---------- | ---------------------------------------------------------------------------- | ----------- | -------------------------------------------------------- | ------------------------ |
| D-01/D-21  | reserve-trial promueve freemium→prueba + history + booking atómico           | integration | `pnpm test -- test/scheduling-reserve-trial.test.ts`     | ❌ Wave 0                |
| D-21       | reserve-trial rechaza no-freemium / con sub / con trial previo (server-side) | integration | idem                                                     | ❌ Wave 0                |
| D-03       | trial no cancelable desde app (cancel rechaza is_trial)                      | integration | idem                                                     | ❌ Wave 0                |
| D-05       | ventana 30d para trial; +2d sigue para socios                                | integration | idem                                                     | ❌ Wave 0                |
| D-07       | trial no consume capacidad (existente — regresión)                           | integration | `pnpm test -- test/scheduling.test.ts`                   | ✅ (verificar cobertura) |
| D-08/09/10 | query de audiencia (freemium, sin sub, sin trial, email, no unsub, >3d)      | integration | `pnpm test -- test/campaigns-audience.test.ts`           | ❌ Wave 0                |
| D-04/D-21  | token HMAC firma/valida; expiración 30d; no autoriza                         | unit        | `pnpm test -- test/campaign-token.test.ts`               | ❌ Wave 0                |
| D-18       | pixel registra open; click registra+redirige; unsubscribe inserta            | integration | `pnpm test -- test/campaigns-tracking.test.ts`           | ❌ Wave 0                |
| D-15       | unsubscribe excluye de audiencia; no afecta transaccionales                  | integration | idem                                                     | ❌ Wave 0                |
| D-12       | batch send usa idempotency; degrada sin API key                              | integration | `pnpm test -- test/campaigns-send.test.ts` (mock Resend) | ❌ Wave 0                |
| D-20       | eligibility endpoint refleja 3 estados                                       | integration | `pnpm test -- test/scheduling-trial-eligibility.test.ts` | ❌ Wave 0                |
| D-19       | funnel por campaña cruza sends/events/bookings/attendance/history            | integration | `pnpm test -- test/campaigns-funnel.test.ts`             | ❌ Wave 0                |

### Sampling Rate

- **Per task commit:** typecheck local + el archivo de test relevante (en CI).
- **Per wave merge:** suite de scheduling + campaigns en CI.
- **Phase gate:** suite completa verde en CI antes de `/gsd:verify-work`.

### Wave 0 Gaps

- [ ] `test/scheduling-reserve-trial.test.ts` — D-01/D-03/D-05/D-21
- [ ] `test/scheduling-trial-eligibility.test.ts` — D-20
- [ ] `test/campaign-token.test.ts` (unit) — D-04/D-21
- [ ] `test/campaigns-audience.test.ts` — D-08/09/10
- [ ] `test/campaigns-tracking.test.ts` — D-15/D-18
- [ ] `test/campaigns-send.test.ts` (Resend mockeado) — D-12
- [ ] `test/campaigns-funnel.test.ts` — D-18/D-19
- [ ] Fixtures: helper para crear freemium elegible + campaña + send (extender `test/helpers.ts`)
- [ ] Frontend (member app): tests del 3er estado de ReservasPage si hay infra Vitest en el-templo-app (existe `@vitest/ui`); confirmar patrón de tests de componentes.

## Security Domain

> `security_enforcement` no presente en config → tratado como habilitado.

### Applicable ASVS Categories

| ASVS Category         | Applies | Standard Control                                                                                                                                                                         |
| --------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V2 Authentication     | yes     | `reserve-trial` y `trial-eligibility` exigen JWT (member). El token del email NO autentica (D-21).                                                                                       |
| V3 Session Management | no      | Reusa el JWT existente; sin sesión nueva.                                                                                                                                                |
| V4 Access Control     | yes     | Autorización server-side por estado del usuario (freemium elegible + guard una-por-vida). El token NO autoriza (D-21). Rutas admin de campañas gateadas por ADMIN_ROLES + country scope. |
| V5 Input Validation   | yes     | Fastify schemas (`schemas.ts`) en todos los endpoints; validar `to` del redirect (allowlist anti open-redirect); validar token HMAC.                                                     |
| V6 Cryptography       | yes     | Token HMAC-SHA256 con `JWT_SECRET` (patrón `qr-token.ts`) — nunca hand-rollear firma; usar `crypto.createHmac`.                                                                          |

### Known Threat Patterns for este stack

| Pattern                                      | STRIDE                 | Standard Mitigation                                                         |
| -------------------------------------------- | ---------------------- | --------------------------------------------------------------------------- |
| Reserva gratis con link robado/compartido    | Elevation of Privilege | D-21: token no autoriza; backend valida estado autenticado                  |
| Open-redirect en /track/click                | Tampering              | Allowlist de destinos o derivar destino server-side                         |
| Forjar token de tracking                     | Spoofing               | HMAC con `JWT_SECRET`; rechazar firma inválida                              |
| Reusar token tras 30d                        | Replay                 | `exp` en payload, rechazar expirados                                        |
| Inflar aperturas (MPP) / scraping del pixel  | Repudiation            | Aceptado como ruido (D-18); click es la métrica confiable                   |
| Enumerar usuarios por unsubscribe            | Information Disclosure | Token identifica al usuario; no exponer email en respuesta; página genérica |
| SQL injection en queries de audiencia/funnel | Tampering              | Drizzle parametrizado (sin string concat)                                   |
| Spam/abuso de envío                          | Denial of Service      | Solo admin dispara; idempotency keys evitan dobles envíos                   |

## Sources

### Primary (HIGH confidence)

- Codebase (lectura directa): `el-templo-api/src/modules/{email,scheduling,attendance,members,subscriptions,analytics}/`, `src/db/schema/{users,bookings,branches,user-status-history}.ts`, `src/modules/shared/qr-token.ts`, `src/app.ts`; `el-templo-app/src/pages/ReservasPage.vue`, `src/composables/useSchedulingApi.ts`, `src/utils/whatsapp.ts`, `src-capacitor/{capacitor.config.ts,android/.../AndroidManifest.xml,ios/.../App.entitlements}`; `el-templo-admin/src/pages/ReportesPage.vue`, `src/router/routes.ts`.
- `.planning/codebase/{STACK,INTEGRATIONS,CONVENTIONS}.md`
- npm registry: `resend@6.12.4` (latest), instalada `6.9.3` [VERIFIED]

### Secondary (MEDIUM-HIGH confidence)

- resend.com/docs/api-reference/emails/send-batch-emails (batch limits, idempotency, templates) [CITED]
- resend.com/docs/dashboard/domains/introduction (SPF/DKIM, subdominio) [CITED]
- support.google.com/a/answer/33786 (SPF Workspace) [CITED]
- litmus.com/blog/a-guide-to-bulletproof-buttons-in-email-design, templyft.com/bulletproof-email-coding-advanced-html-css (email HTML/VML/dark mode) [CITED]

### Tertiary (LOW confidence — flag for validation)

- Riesgo de deliverability con lista de inactivos (práctica general, no verificada contra Resend) [ASSUMED]
- Interpretación de la regla NO CDN respecto a R2 [ASSUMED]

## Metadata

**Confidence breakdown:**

- Backend de reserva/promoción/funnel: HIGH — leído directamente, patrones existentes verificados
- Schema de campañas: MEDIUM-HIGH — diseño propio basado en patrones del proyecto (Claude's Discretion)
- Email Resend (batch/dominio): HIGH — docs oficiales citadas
- Email HTML responsive: MEDIUM-HIGH — fuentes de la industria citadas
- Deep linking: HIGH (estado actual verificado) / MEDIUM (diseño recomendado — esfuerzo a confirmar)
- Deliverability con ghosts: LOW — práctica general

**Research date:** 2026-06-01
**Valid until:** 2026-07-01 (Resend API estable; revalidar si se actualiza el SDK)
