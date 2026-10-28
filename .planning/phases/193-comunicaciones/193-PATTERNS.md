# Fase 193: Comunicaciones - Mapa de Patrones

**Mapeado:** 2026-09-02
**Archivos analizados:** ~24 (nuevos + modificados, derivados de CONTEXT.md D-01..D-31 y `<code_context>`)
**Analogías encontradas:** 22 / 24

## Clasificación de archivos

| Archivo nuevo/modificado                                                                                                  | Rol               | Flujo de datos                 | Analogía más cercana                                                                                                                           | Calidad                                                       |
| ------------------------------------------------------------------------------------------------------------------------- | ----------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `el-templo-api/src/db/schema/communications.ts` (avisos, aviso_events, tv_avisos — nombres a discreción del planner)      | model             | CRUD                           | `el-templo-api/src/db/schema/notifications.ts`                                                                                                 | exacto (mismo dominio: templates+contadores+eventos)          |
| `el-templo-api/src/db/migrations/0216_*.sql` (+ seed de sistema por tenant, D-22)                                         | migration         | batch                          | `el-templo-api/src/db/migrations/0215_referral_partners.sql`                                                                                   | exacto (última migración, mismo estilo de header)             |
| `el-templo-api/src/modules/communications/routes.ts` (CRUD avisos, avisos de TV, "qué pop-up toca hoy", número de ventas) | route/controller  | request-response               | `el-templo-api/src/modules/notifications/routes.ts`                                                                                            | exacto (mismo shape: admin CRUD + segmento + member endpoint) |
| `el-templo-api/src/modules/communications/service.ts`                                                                     | service           | CRUD + orquestación            | `el-templo-api/src/modules/notifications/service.ts` (+ orquesta `ratings/service.ts`, `improvement-proposals/service.ts`)                     | role-match                                                    |
| Endpoint "qué pop-up toca hoy" (prioridad D-06)                                                                           | service           | request-response, orquestación | `el-templo-api/src/modules/ratings/service.ts:getPendingRating` + `el-templo-api/src/modules/improvement-proposals/service.ts:getPromptStatus` | role-match (mismo shape: `ctx, memberId → resultado o null`)  |
| Gating de `modules/communications` (avisos TV solo, D-23)                                                                 | middleware        | request-response               | `el-templo-api/src/modules/shared/module-registry.ts` (`moduleScope`)                                                                          | exacto                                                        |
| Manifiesto fail-closed (nuevas rutas)                                                                                     | config/test       | —                              | `el-templo-api/test/tenant-manifest.ts` (líneas 778-788, bloque `/api/notifications`)                                                          | exacto                                                        |
| Test de integración + aislamiento tenant                                                                                  | test              | request-response               | `el-templo-api/test/tenancy/iso-03-notifications.test.ts` + fixture `el-templo-api/test/fixtures/notifications-gimnasio-dos.ts`                | exacto                                                        |
| FCM payload (`destination` + fallback `route`, D-04)                                                                      | utility/transform | event-driven                   | `el-templo-api/src/modules/notifications/service.ts:sendToDevice` (líneas 650-682)                                                             | exacto                                                        |
| `el-templo-app/src/utils/whatsapp.ts` (preferir número de servidor, D-21)                                                 | utility           | transform                      | el mismo archivo (modificación in-place)                                                                                                       | exacto                                                        |
| `el-templo-app/src/boot/push-notifications.ts` (`handleTapNavigation`, D-03/D-04)                                         | provider/boot     | event-driven                   | el mismo archivo (modificación in-place)                                                                                                       | exacto                                                        |
| `el-templo-app/src/pages/ContactoVentasPage.vue` + ruta `/contacto-ventas`                                                | component/route   | request-response               | página simple existente + `el-templo-app/src/router/routes.ts` (ver `VolverPage.vue` como página mínima con salto a WhatsApp)                  | role-match                                                    |
| `MainLayout.vue` (reemplazo de 4 diálogos por 1 endpoint, D-07)                                                           | component         | request-response               | el mismo archivo, líneas 138-164 (modificación in-place)                                                                                       | exacto                                                        |
| Store/composable de cooldown server-side (D-11)                                                                           | store             | CRUD                           | patrón `Preferences` de `RatingPromptDialog.vue`/`ImprovementPromptDialog.vue` (a migrar a server)                                             | role-match                                                    |
| Tarjetas del carrusel con copy editable (D-15)                                                                            | component         | request-response               | `el-templo-app/src/modules/progression/pages/MiTemplo.vue:24-46` + `components/ReferralCtaCard.vue`, `ImprovementCtaCard.vue`                  | exacto                                                        |
| `el-templo-admin/src/pages/ComunicacionesPage.vue` (reemplaza NotificacionesPage, 4 tabs)                                 | page/component    | request-response               | `el-templo-admin/src/pages/NotificacionesPage.vue` (tab push) + `el-templo-admin/src/pages/CampaniasPage.vue` (tabs + dialog CRUD, avisos)     | exacto                                                        |
| `el-templo-admin/src/config/templo-config.ts` (entrada de menú)                                                           | config            | —                              | el mismo archivo, líneas 270-286 (modificación in-place)                                                                                       | exacto                                                        |
| `el-templo-admin/src/router/routes.ts` (`/comunicaciones` + redirect `/notificaciones`)                                   | route             | —                              | el mismo archivo, líneas 238-249 + patrón de redirect línea 258-259                                                                            | exacto                                                        |
| Util compartido `whatsappUrl` en admin (oportunidad DRY)                                                                  | utility           | transform                      | `el-templo-admin/src/components/reports/TrialSessionsReport.vue:733-775` (+ 6 copias más, ver abajo)                                           | exacto                                                        |
| Botón AVISO en `TvControlPage.vue` (D-25)                                                                                 | component         | event-driven                   | `el-templo-admin/src/pages/TvControlPage.vue:83-151` (tira de bloques) + `onFlexInicio`/`onFlexFinal` (885-901)                                | exacto                                                        |
| `tv_class_state.screen` nuevo valor "aviso" (D-24/D-28)                                                                   | model             | CRUD                           | `el-templo-api/src/db/schema/tv.ts:115-168` + `el-templo-api/src/modules/tv/schemas.ts:178` (enum `screen`)                                    | exacto                                                        |
| Escritura de estado (nuevo screen)                                                                                        | route/controller  | request-response               | `el-templo-api/src/modules/tv/control-routes.ts:112-127` (`POST /control/state`)                                                               | exacto                                                        |
| Render del aviso a pantalla completa (D-27)                                                                               | component         | streaming/polling              | `el-templo-admin/src/tv/render.ts:1028` (`paintCapsula`) + `:926` (`paintQuote`) + `el-templo-admin/src/tv/poll.ts:20,98` (`TvScreen`)         | exacto                                                        |
| Función seed reutilizable de avisos de sistema para tenant nuevo (D-22)                                                   | utility           | batch                          | `el-templo-api/src/db/migrations/0216_*.sql` (misma lógica exportada como función TS) — sin analog directo, ver "Sin analogía"                 | ver abajo                                                     |

## Asignación de patrones

### `el-templo-api/src/db/schema/communications.ts` (model, CRUD)

**Analogía:** `el-templo-api/src/db/schema/notifications.ts`

**Import pattern** (`notifications.ts:1-15`):

```typescript
import {
  mysqlTable,
  int,
  varchar,
  text,
  timestamp,
  mysqlEnum,
  boolean,
  index,
  unique,
  uniqueIndex,
} from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";
import { users } from "./users";
import { tenantIdColumn } from "./tenant-column";
```

**Patrón de contador en columna de lista** (precedente directo de D-17, `notifications.ts:80-83`):

```typescript
sentCount: int("sent_count").default(0).notNull(),
openedCount: int("opened_count").default(0).notNull(),
```

→ para avisos: `reachedCount`, `dismissedCount`, `clickedCount` (socios únicos, D-17) — pero como esos son "únicos" (no eventos), conviene una tabla de eventos aparte (`aviso_events` con unique `(avisoId, userId, eventType)`) y contar con `COUNT DISTINCT`/mantenimiento incremental, no una sola columna acumulativa como aquí.

**Patrón unicidad por tenant** (`notifications.ts:85-94`, `uniqueIndex("uq_notification_templates_tenant_key")`) — mismo criterio para cualquier "code" único de aviso de sistema por tenant.

**Patrón KV settings por tenant** (`el-templo-api/src/db/schema/tenants.ts:73-84`, número de ventas por país D-20):

```typescript
export const tenantSettings = mysqlTable(
  "tenant_settings",
  {
    id: int("id").primaryKey().autoincrement(),
    tenantId: int("tenant_id")
      .references(() => tenants.id)
      .notNull(),
    settingKey: varchar("setting_key", { length: 100 }).notNull(),
    settingValue: text("setting_value").notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [uniqueIndex("uq_tenant_setting").on(t.tenantId, t.settingKey)],
);
```

Reusar tal cual: `whatsapp.sales_number.<país>` como `settingKey` (mismo mecanismo que `module.*.enabled`, ver `modules/shared/modules.ts`).

**Patrón `tv_class_state`** (`el-templo-api/src/db/schema/tv.ts:115-165`) para el enum `screen` (nuevo valor "aviso"):

```typescript
// D-08: "class" | "closing". Se deja varchar y NO un enum de MySQL a proposito...
screen: varchar("screen", { length: 10 }).default("class").notNull(),
```

La entidad de avisos de TV (D-24) es tabla aparte (título+cuerpo, sedes, activo/inactivo, modo) — no vive en `tv_class_state`; esta tabla solo referencia el aviso activo cuando `screen = "aviso"` (ver Integration Points más abajo).

---

### `el-templo-api/src/db/migrations/0216_*.sql` (migration, batch)

**Analogía:** `el-templo-api/src/db/migrations/0215_referral_partners.sql`

**Convención de header** (`0215_referral_partners.sql:1-33`): nombre del archivo como primer comentario, referencia a decisiones del CONTEXT (`D-XX`), justificación de unicidades, aclaración `Hand-written: db:generate pega contra drift preexistente... NUNCA drizzle-kit push/migrate`, y verificación explícita del número libre contra `origin/master` y `origin/staging` con `git ls-tree`.

**Runner / tabla de control** (`el-templo-api/src/db/run-migrations.ts:79-90,144`):

```sql
CREATE TABLE IF NOT EXISTS _migrations (...)
SELECT name FROM _migrations ORDER BY name
INSERT INTO _migrations (name) VALUES (?)
```

`_migrations` es la única fuente de verdad (local y prod) — nunca `meta/_journal.json`.

**Numeración:** prod tope real `0215_referral_partners.sql` (confirmado por `ls`). CONTEXT dice "prod en 0215" → **0216 es el siguiente libre**, verificar de nuevo contra `origin/master`/`origin/staging` al momento de escribir la migración por si el tren v6.1 ya tomó ese número (nota explícita del propio CONTEXT.md: "v6.1 renumera sus 0216/0217 locales al pushear").

**Regla de comentarios SQL:** sin `;` dentro de comentarios (skill `el-templo-db-migrations`).

---

### `el-templo-api/src/modules/communications/routes.ts` (controller, request-response)

**Analogía:** `el-templo-api/src/modules/notifications/routes.ts`

**Imports y roles** (`notifications/routes.ts:1-20`):

```typescript
import { FastifyPluginAsync } from "fastify";
import { eq, and, sql, inArray } from "drizzle-orm";
import { NotificationService } from "./service";
import { NOTIFICATION_CATEGORIES, type NotificationCategory } from "./types";
import { ADMIN_ROLES, OWNER_ROLES } from "../shared/permissions";
import { attachCountryScope } from "../shared/country-scope";
import { assertTenant, tenantWhere } from "../shared/tenant";
import * as schema from "../../db/schema";
import type { MemberSegment } from "../segmentation/types";
```

D-30: usar `DUENO_ROLES = ['admin','owner']`, ya existe en `modules/shared/permissions.ts` (mismo criterio que `/notificaciones` hoy).

**Patrón CRUD admin scopeado por tenant** (`notifications/routes.ts:213-236`, `PUT /admin/templates/:id`) — comentario T-175-03 documenta el motivo exacto de `tenantWhere` en el lookup por PK: un `id` ajeno da 404, nunca "acceso denegado" (D-06 del milestone, coherente con "cero 403" de las rutas nuevas).

**Patrón "enviar a segmento" → aplicar a alcance de avisos** (`notifications/routes.ts:424-470`, `POST /admin/send-segment`):

```typescript
fastify.post<{
  Body: {
    title: string;
    body: string;
    segmentIds: MemberSegment[];
    route?: string;
  };
}>(
  "/admin/send-segment",
  { onRequest: [fastify.authenticate], schema: sendSegmentSchema },
  async (request, reply) => {
    const { role } = request.user;
    if (!(ADMIN_ROLES as readonly string[]).includes(role)) {
      return reply.code(403).send({ error: "Acceso denegado" });
    }
    await attachCountryScope(request, fastify.db);
    const ctx = assertTenant(request.scope, "notifications.sendSegment");
    // ... query de members en memberProfiles+users con tenantWhere en el join
  },
);
```

Esto es EXACTAMENTE el mecanismo de resolución de segmento (`optima/regular/alerta/ausente`) que D-13 pide reusar para el alcance de avisos (sede+país+segmento).

**Validación del destino curado (D-01/D-05):** este es el punto de entrada — reemplazar el input libre `route`/`titleFemale` por un `destination` validado server-side contra la lista curada (`SECCIONES_DISPONIBLES` o similar, definida una sola vez y exportada, ver "Shared Patterns"). El rechazo de rutas fuera de lista va en el JSON Schema de `routes.ts` o en el service, siguiendo el mismo patrón de `sendSegmentSchema`/`updateTemplateSchema` (arriba del plugin, constantes `xSchema`).

---

### Endpoint "qué pop-up toca hoy" (D-06/D-07)

**Analogías:** `el-templo-api/src/modules/ratings/service.ts:310-320` (`getPendingRating`) y `el-templo-api/src/modules/improvement-proposals/service.ts:64-85` (`getPromptStatus`)

```typescript
// ratings/service.ts:310
async getPendingRating(ctx: TenantContext, memberId: number): Promise<PendingRating | null> {
  const now = Date.now();
  const candidates = await this.db.select({...}).from(schema.attendance)
    .innerJoin(schema.schedules, and(tenantWhere(schema.schedules, ctx), eq(...)))
    ...
}
```

```typescript
// improvement-proposals/service.ts:64
async getPromptStatus(ctx: TenantContext, memberId: number): Promise<ProposalPromptStatus> {
  const quietStart = new Date(Date.now() - PROMPT_QUIET_AFTER_SUBMIT_MS);
  const [row] = await this.db.select({ id: schema.improvementProposals.id })
    .from(schema.improvementProposals)
    .where(and(tenantWhere(...), eq(...memberId), gte(...createdAt, quietStart)))
    .limit(1);
  return { shouldPrompt: !row, campaign: PROMPT_CAMPAIGN_VERSION };
}
```

Ambos comparten forma `(ctx, memberId) → resultado tipado o "no aplica"`. El endpoint único de D-07 debe llamar en cadena, con el orden fijo de D-06 (vencimiento de plan > aviso vigente > calificación > propuesta de mejora), cortando en el primer `resultado !== null` — mismo patrón de "cede el turno" ya usado client-side en `RatingPromptDialog.vue:109-115` (`if (await proposalPromptWillShow()) return false`), que D-07 mueve al servidor.

**Vencimiento de plan (D-10):** la regla de disparo (≤3 días, diario, supresión por cobertura) queda fija en código — buscar `coveredUntil`/`covered-until` en `el-templo-api/src/modules/subscriptions/service.ts` y `el-templo-app/src/components/PlanExpiryDialog.vue:54,87-94` (`GET /members/subscription/coverage`) como el contrato actual a preservar; solo el texto/botón se vuelven editables vía la entidad de avisos de sistema.

---

### Gating por módulo (D-23)

**Analogía:** `el-templo-api/src/modules/shared/module-registry.ts:269-284` (`moduleScope`)

```typescript
export async function moduleScope(
  app: FastifyInstance, name: ModuleName, plugin: FastifyPluginAsync,
  opts: { prefix?: string } = {},
): Promise<void> {
  await app.register(async (scoped) => {
    const guard = requireModule(name, scoped.db);
    scoped.addHook("onRoute", (route: RouteOptions) => { /* appendea guard a onRequest */ });
    ...
  });
}
```

Uso real (`el-templo-api/src/app.ts:173`): `await moduleScope(app, "templo-training", spomPlugin);`

**Hallazgo clave:** `tvControlRoutes` HOY NO está envuelta en `moduleScope` — se registra desnuda (`app.ts:322`: `await app.register(tvControlRoutes, { prefix: "/api/admin/tv" });`). `MODULE_NAMES` (`modules/shared/modules.ts:35-40`) = `templo-training | templo-gamification | templo-marketing | templo-onboarding`. Todo lo demás relacionado a TV/clase en vivo (`spomPlugin`, `sessionsPlugin`, `progressionPlugin`, `checkInRoutes`) está gateado con `templo-training`. **Recomendación para el planner: usar `templo-training`** como el módulo que cubre `modules/tv`, y envolver la pestaña "Avisos en TV" de `modules/communications` con el mismo `moduleScope(app, "templo-training", ...)` — el resto de Comunicaciones (push, avisos de app, tarjetas) queda sin `moduleScope` (core, D-23).

---

### Manifiesto fail-closed + test de aislamiento

**Analogía manifiesto:** `el-templo-api/test/tenant-manifest.ts:778-788`

```typescript
// ── /api/notifications ────────────────────────────────────────────────────
"GET /api/notifications/admin/templates": { categoria: "tenant-scoped" },
"POST /api/notifications/admin/send-segment": { categoria: "tenant-scoped" },
"PUT /api/notifications/admin/templates/:id": { categoria: "tenant-scoped" },
```

Cada ruta nueva de `/api/communications` (o el prefijo elegido) necesita su entrada acá o el gate `iso-01-manifiesto.test.ts` (`el-templo-api/src/app.ts:86` referencia el hook `onRoute`) deja CI en rojo.

**Analogía test de aislamiento:** `el-templo-api/test/tenancy/iso-03-notifications.test.ts` + fixture `el-templo-api/test/fixtures/notifications-gimnasio-dos.ts`. Patrón: sembrar la misma "key" en El Templo y en un segundo tenant con contenido distinto, afirmar que cada uno resuelve/edita la propia (nunca la ajena), y que ningún id cross-tenant da 403 (siempre 404, D-06 del milestone).

---

### FCM payload — `destination` + fallback `route` (D-04)

**Analogía:** `el-templo-api/src/modules/notifications/service.ts:650-682` (`sendToDevice`)

```typescript
const message = {
  token,
  notification: { title, body },
  data: { route, notificationId: String(notificationId) },
};
```

Punto exacto para agregar el campo nuevo sin romper compatibilidad:

```typescript
data: { route: fallbackRoute, destination, notificationId: String(notificationId) }
```

donde `fallbackRoute` sigue siendo `/mi-templo` (o la ruta resuelta hoy) y `destination` es el nuevo valor curado (D-01). La app vieja ignora `destination` (no lo lee) y usa `route` — nunca 404 (D-04).

**Lado app — lectura con fallback:** `el-templo-app/src/boot/push-notifications.ts:42-63` (`handleTapNavigation`) y sus dos call-sites (`:85`, `:125`):

```typescript
handleTapNavigation(data?.route || "/mi-templo", data?.notificationId);
```

La versión nueva de la app debe leer `data?.destination` primero, resolverlo a una ruta interna vía la lista curada compartida (D-01), y caer a `data?.route || '/mi-templo'` si `destination` no vino o no matchea nada conocido.

---

### `el-templo-app/src/utils/whatsapp.ts` (D-20/D-21)

Archivo completo (28 líneas) — reescribir `buildWhatsAppUrl`/`getWhatsAppNumber` para preferir un número que venga del servidor (D-20) y caer al hardcode actual si no viene:

```typescript
type Country = "AR" | "ES";
export const WHATSAPP_NUMBERS: Record<Country, string> = {
  AR: "5492235820521",
  ES: "34680774331",
};
export function getWhatsAppNumber(country: Country | null | undefined): string {
  return WHATSAPP_NUMBERS[country ?? "AR"];
}
export function buildWhatsAppUrl(
  country: Country | null | undefined,
  text?: string,
): string {
  const number = getWhatsAppNumber(country);
  const query = text ? `?text=${encodeURIComponent(text)}` : "";
  return `https://wa.me/${number}${query}`;
}
```

Consumidores existentes a migrar a la nueva fuente (D-21): `ReservasPage.vue`, `VolverPage.vue`, y el pop-up de vencimiento (`PlanExpiryDialog.vue`). Sugerencia: agregar un parámetro opcional `serverNumber?: string` que gane sobre el mapa hardcodeado, sin romper las firmas existentes.

---

### `MainLayout.vue` — de 4 diálogos locales a 1 endpoint (D-07)

**Analogía:** el propio archivo, líneas 138-165:

```vue
<PushPermissionDialog />
<ImprovementPromptDialog />
<RatingPromptDialog />
<PlanExpiryDialog />
```

```typescript
import PushPermissionDialog from "src/components/PushPermissionDialog.vue";
import ImprovementPromptDialog from "src/components/ImprovementPromptDialog.vue";
import RatingPromptDialog from "src/components/RatingPromptDialog.vue";
import PlanExpiryDialog from "src/components/PlanExpiryDialog.vue";
```

`PushPermissionDialog` queda FUERA de la lógica de prioridad (D-07, texto explícito del CONTEXT). Los otros 3 componentes pasan a ser "vistas tontas" que reciben el resultado del endpoint único en vez de decidir cada uno con su propio `shouldShow()` (patrón actual en `RatingPromptDialog.vue:87-101`, con `Preferences` de Capacitor para el one-shot local — D-11 mueve esa cadencia al servidor, manteniendo la key local como cache opcional).

---

### `MiTemplo.vue` — carrusel con copy editable (D-15)

**Analogía:** `el-templo-app/src/modules/progression/pages/MiTemplo.vue:24-46`

```vue
<div class="premium-carousel">
  <div class="premium-carousel__scroller" @scroll="onPremiumScroll">
    <div class="premium-carousel__slide"><ImprovementCtaCard /></div>
    <div class="premium-carousel__slide"><ReferralCtaCard /></div>
    <div v-if="showUpsellBadge" class="premium-carousel__slide"><UpsellBadge /></div>
    <div v-if="showProgramCta" class="premium-carousel__slide"><ProgramCtaCard :segment="userStore.segment" /></div>
  </div>
</div>
```

Las 4 tarjetas fijas hoy tienen copy hardcodeado dentro de cada componente (`ImprovementCtaCard.vue`, `ReferralCtaCard.vue`, etc.); D-15(a) las convierte en avisos de sistema con `placement: 'tarjeta'` — el componente pasa a recibir `title`/`body`/`buttonText`/`destination` por props en vez de tenerlos hardcodeados, mientras `showUpsellBadge`/`showProgramCta` (visibilidad) siguen en código. D-15(b) agrega un `v-for` sobre las tarjetas libres devueltas por el endpoint de avisos, después de las fijas visibles.

---

### `el-templo-admin/src/pages/ComunicacionesPage.vue` (page, request-response)

**Analogías:** `NotificacionesPage.vue` (tab push, base directa) + `CampaniasPage.vue` (tabs + `q-table` + `q-dialog` CRUD, mejor analog para el editor de avisos por su alcance con segmentos/países/sedes)

**Tab push — inputs a reemplazar** (`NotificacionesPage.vue:137-143` y `214-220`):

```vue
<q-input
  v-model="sendForm.route"
  label="Ruta de destino (opcional)"
  hint="Default: /mi-templo"
  outlined
  dense
/>
...
<q-input v-model="editForm.route" label="Ruta de destino" outlined dense />
```

→ reemplazar por un `q-select` con la lista curada de D-01 (ver Shared Patterns) + un input condicional de texto de WhatsApp cuando el destino es "WhatsApp de ventas" (D-02).

**Contadores como columnas** (`NotificacionesPage.vue:304-305`):

```typescript
{ name: 'sentCount', label: 'Enviados', field: 'sentCount', align: 'center', sortable: true },
{ name: 'openedCount', label: 'Abiertos', field: 'openedCount', align: 'center', sortable: true },
```

→ mismo patrón para avisos (D-17): columnas "Alcanzados", "Cerraron", "Tocaron el botón".

**Patrón tabs + tab-panels** (`NotificacionesPage.vue:13-17`):

```vue
<q-tab name="plantillas" label="Plantillas automaticas" />
<q-tab name="enviar" label="Enviar a segmento" />
<q-tab-panels v-model="tab" animated>
```

→ 4 tabs de Comunicaciones (push / avisos app / tarjetas / avisos TV).

**Patrón dialog create/edit con alcance** (`CampaniasPage.vue:158-180`, `500` `openCreateDialog`):

```vue
<q-dialog v-model="createDialog" persistent>
  <q-card style="min-width: 420px; max-width: 90vw">
    <q-card-section><div class="text-h6">Nueva campaña</div></q-card-section>
    <q-card-section class="q-gutter-md">
      <q-input v-model="form.name" label="Nombre" dense outlined :rules="[requiredRule]" />
      <q-select v-if="isOwner" v-model="form.country" :options="createCountryOptions" ... />
```

Base directa para el editor de avisos: título/mensaje/botón/destino (D-12), alcance sede+país+segmento (D-13), vigencia+estado (D-14), y la vista previa inline (D-16) va como sección adicional dentro de la misma `q-card-section`.

---

### Util compartido `whatsappUrl` (oportunidad DRY, D-18)

**Analogía:** `el-templo-admin/src/components/reports/TrialSessionsReport.vue:733-753`

```typescript
function whatsappUrl(phone: string): string {
  const digits = phone.replace(/[^0-9]/g, "");
  const intl = digits.length === 10 ? `549${digits}` : digits;
  return `https://wa.me/${intl}`;
}
function whatsappFollowupUrl(row: TrialSessionsRowClient): string {
  return `${whatsappUrl(row.phone ?? "")}?text=${encodeURIComponent(followupMessage(row))}`;
}
```

**Patrón "abrir antes del await"** (`:756-761`, evita bloqueo de pop-up):

```typescript
async function onStartFollowup(row: TrialSessionsRowClient): Promise<void> {
  if (row.phone) {
    window.open(whatsappFollowupUrl(row), '_blank', 'noopener');
  }
  try {
    row.followupStartedAt = await reportsApi.startTrialFollowup(row.userId);
    ...
```

**7 copias del mismo helper** encontradas en el admin (no 6 — el conteo actual):
`MiembrosTab.vue`, `TrialSessionsReport.vue`, `SesionesDePruebaDialog.vue`, `AlumnoDetailPage.vue`, `FranchiseDetailPage.vue`, `PartnersPage.vue`, `ReportesPage.vue`. Oportunidad clara de extraer `el-templo-admin/src/utils/whatsapp.ts` (mismo nombre que el equivalente en la app) y usarlo también para "ver socios" (D-18) — el planner debería considerar si esta extracción es parte del scope de la fase o deuda anotada.

---

### Menú y ruta (D-30/D-31)

**Analogía menú:** `el-templo-admin/src/config/templo-config.ts:270-286`

```typescript
{
  header: 'Configuración',
  items: [
    { path: '/usuarios', label: 'Usuarios', icon: 'manage_accounts', roles: ['owner'] },
    { path: '/configuracion/precios', label: 'Reglas de precio', icon: 'sell', roles: ['owner'] },
    { path: '/notificaciones', label: 'Notificaciones', icon: 'notifications', roles: DUENO_ROLES },
  ],
},
```

→ reemplazar la última entrada por `{ path: '/comunicaciones', label: 'Comunicaciones', icon: '<a elegir>', roles: DUENO_ROLES }`.

**Analogía ruta + redirect:** `el-templo-admin/src/router/routes.ts:244-248` (ruta actual) y patrón de redirect en `:258-259`:

```typescript
{ path: 'notificaciones', component: () => import('pages/NotificacionesPage.vue'), meta: { allowedRoles: ['admin', 'owner'] as AdminRole[] } },
...
{ path: 'puntuaciones', redirect: { path: '/feedback', query: { tab: 'profes' } } },
```

→ `{ path: 'comunicaciones', component: () => import('pages/ComunicacionesPage.vue'), meta: { allowedRoles: ['admin', 'owner'] as AdminRole[] } }` + `{ path: 'notificaciones', redirect: '/comunicaciones' }`.

---

### Botón AVISO en el control de TV (D-25)

**Analogía:** `el-templo-admin/src/pages/TvControlPage.vue:83-151` (tira de bloques) + handlers `onFlexInicio`/`onFlexFinal` (`:884-895`)

```vue
<div class="col-6">
  <q-btn class="tv-btn full-width" label="FLEXIBILIDAD - INICIO" color="secondary"
    :outline="hasState" :unelevated="!hasState" :disable="!canControl" @click="onFlexInicio" />
</div>
```

```typescript
function onFlexInicio(): void {
  if (!hasState.value) return; // ya está en la pantalla de inicio
  confirmEndOpen.value = true;
}
function onFlexFinal(): void {
  if (isClosingScreen.value) return;
  closingConfirmOpen.value = true;
}
```

El botón AVISO grande (D-25, solo si hay un aviso activo para la sede en modo manual) sigue el mismo patrón: un botón en la tira, un handler que dispara `send({ screen: 'aviso', ... })` a través del mismo `send()` que ya usa `confirmClosing()` (`:898-900`), sin timer ni confirmación (D-26: sale al avanzar a otro bloque, no necesita diálogo de confirmación como los flex).

---

### Escritura/lectura de `tv_class_state` — nuevo screen "aviso" (D-24/D-28)

**Escritura:** `el-templo-api/src/modules/tv/control-routes.ts:111-127` (`POST /control/state`)

```typescript
fastify.post<{ Body: TvStateWrite }>(
  "/control/state",
  {
    schema: tvControlStateSchema,
    preHandler: [requireBranchAccess({ from: "body.branchId" })],
  },
  async (request, reply) => {
    const service = new TvService(fastify.db, request.log);
    const context = await service.writeState(request.body, request.user.userId);
    return reply.send(context);
  },
);
```

**Enum a extender:** `el-templo-api/src/modules/tv/schemas.ts:178` (`screen: { type: "string", enum: ["idle", "class", "closing"] }`) y `:259` (`enum: ["class", "closing"]` en el body de escritura) — agregar `"aviso"` en ambos, más el tipo espejo en `el-templo-admin/src/tv/poll.ts:20` (`export type TvScreen = 'idle' | 'class' | 'closing';`).

**Lectura/render:** `el-templo-admin/src/tv/render.ts:1028-1053` (`paintCapsula`) y `:926-940` (`paintQuote`) — mismo mecanismo de rotación determinística por reloj (`rotationIndex`) y fade (`.apagada`/`quoteSaliendo`) aplica al texto del aviso cuando `screen === 'aviso'` en modo manual (D-25, pantalla completa) o cuando reemplaza la cápsula/frase en modo `reemplaza flexibilidad inicial/final` (D-28). El estilo Cinzel/oro/velo ya está en estas dos funciones — no hay que reinventar CSS, solo pintar el título+cuerpo del aviso en el nodo correspondiente.

---

## Patrones compartidos

### Lista curada de destinos (D-01)

**Fuente a crear:** un archivo nuevo compartido, ej. `el-templo-api/src/modules/communications/destinations.ts`, exportando un array `const` tipado (mismo criterio que `MemberSegment`/`SEGMENT_VALUES` en `el-templo-api/src/modules/segmentation/types.ts:17,63-67`):

```typescript
export type MemberSegment = "optima" | "regular" | "alerta" | "ausente";
export const SEGMENT_VALUES: MemberSegment[] = [
  "optima",
  "regular",
  "alerta",
  "ausente",
];
```

**Aplicar a:** validación server-side en `modules/communications/routes.ts` (schemas), consumo en `el-templo-admin` (selector) y `el-templo-app` (resolución de `destination` → ruta interna). Requiere un mecanismo de "compartir tipo API↔admin↔app" — verificar si el repo ya tiene un paquete/carpeta de tipos compartidos o si cada app copia manualmente (patrón actual con `MemberSegment`, importado directo desde `el-templo-api` en algunos tests, o redeclarado — el planner debe confirmar cuál).

### Tenancy — `tenantWhere` + `assertTenant`

**Fuente:** `el-templo-api/src/modules/shared/tenant.ts` (`assertTenant`, `tenantWhere`), usado en cada join/query de `notifications/routes.ts` y `ratings/service.ts`.
**Aplicar a:** todas las queries nuevas de `modules/communications`.

### Manifiesto fail-closed + 3 gates de tenancy

**Fuente:** `el-templo-api/test/tenant-manifest.ts` + memoria `reference_gates_tenancy_ruta_job_nueva`.
**Aplicar a:** cada ruta nueva bajo `/api/communications` (o el prefijo elegido) y `/api/admin/communications`.

### Error handling / respuesta 404 nunca 403 para ids cross-tenant

**Fuente:** comentario T-175-03 en `notifications/routes.ts:305-308` y `iso-03-notifications.test.ts` docblock (líneas 28-33).
**Aplicar a:** GET/PUT/DELETE por `:id` de avisos, avisos de TV, y "ver socios" (D-18).

### Abrir `window.open` antes del `await` (evitar bloqueo de pop-up)

**Fuente:** `TrialSessionsReport.vue:756-761`.
**Aplicar a:** "ver socios" (D-18) y cualquier acción admin que abra `wa.me`.

### Logger — nunca `console.log`

**Fuente:** `createLogger()` en frontends (`src/utils/logger.ts`), `request.log`/`app.log` en API (regla de `CLAUDE.md`, ya seguida en todos los archivos leídos: `push-notifications.ts` usa `log.info`/`log.error`).

## Sin analogía directa

| Archivo                                                                                         | Rol           | Flujo            | Motivo                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------------------------------------------------------------------------- | ------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Función seed reutilizable de avisos de sistema (D-22) para migración + wizard de alta de tenant | utility/batch | batch            | No existe hoy una función de seed compartida entre una migración SQL y un wizard TS — `notifications/routes.ts` tiene `POST /admin/seed-templates` (línea ~513) como precedente parcial (INSERT IGNORE con tenant_id), pero D-22 pide una función TS exportada invocable desde dos lugares (migración corrida como script + wizard fase 182, hoy en worktree `et-182` fuera de este checkout). El planner debe diseñarla desde cero, tomando como referencia de forma `notifications/service.ts` línea ~817 (`seed-templates`, INSERT IGNORE por tenant_id+key) pero exportada como función standalone, no solo ruta HTTP. |
| Vista previa inline del pop-up/tarjeta/placa de TV (D-16)                                       | component     | render           | No hay un componente de "preview" existente en el admin para este tipo de contenido (los templates de push no tienen preview visual, solo texto). Construir desde cero replicando el estilo real de `RatingPromptDialog.vue`/tarjetas de `MiTemplo.vue` (pop-up y tarjeta) y `paintCapsula`/`paintQuote` (placa TV) como referencia visual, no como código a copiar 1:1 (son Vue vs. DOM vanilla).                                                                                                                                                                                                                         |
| Ruta `/contacto-ventas` con salto directo a WhatsApp + botón de respaldo (D-03)                 | page          | request-response | Página nueva sin precedente exacto; usar `VolverPage.vue` como página mínima de referencia de estructura (layout simple, un botón, uso de `buildWhatsAppUrl`), pero el comportamiento de salto automático + fallback es nuevo.                                                                                                                                                                                                                                                                                                                                                                                             |

## Metadata

**Alcance de búsqueda de analogías:** `el-templo-api/src/{db/schema,db/migrations,modules/notifications,modules/ratings,modules/improvement-proposals,modules/tv,modules/shared,modules-boot.ts,app.ts}`, `el-templo-api/test/{tenant-manifest.ts,tenancy,notifications*,fixtures}`, `el-templo-app/src/{boot,utils,layouts,modules/progression,components}`, `el-templo-admin/src/{pages,config,router,tv,components/reports}`.
**Archivos leídos/grepeados:** ~35.
**Fecha de extracción:** 2026-09-02.

## PATTERN MAPPING COMPLETE
