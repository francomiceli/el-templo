# Phase 158: Visibilidad y comunicación - Pattern Map

**Mapped:** 2026-07-11
**Files analyzed:** 17 (7 API, 3 member-app, 3 admin, 2 tests, 2 shared/config)
**Analogs found:** 17 / 17 (todos con analog en el repo — esta fase es composición pura sobre infra existente)

> Fase de VISIBILIDAD del sistema de referidos (v5.5). Solo LEE/COMUNICA lo que la
> fase 157 produjo. NO toca atribución, cualificación ni la matemática del descuento.
> Todo reusa componentes Quasar, la cola de notificaciones y el `ReferralService` ya
> shippeados. Regla dura de migraciones (skill `el-templo-db-migrations`): migración
> hand-written, SQL commiteado junto al schema, sin `;` en comentarios `--`, primer arg
> de `mysqlEnum` = nombre físico de columna byte-for-byte, NUNCA `drizzle-kit migrate/push`.

---

## File Classification

| New/Modified File                                                                | Role           | Data Flow        | Closest Analog                                                                  | Match Quality |
| -------------------------------------------------------------------------------- | -------------- | ---------------- | ------------------------------------------------------------------------------- | ------------- |
| `el-templo-api/src/db/schema/notifications.ts` (MOD)                             | model/schema   | CRUD             | mismo archivo `:16-22` + `0158_planes_notification_category.sql`                | exact         |
| `el-templo-api/src/db/migrations/0177_referidos_notification_category.sql` (NEW) | migration      | batch/DDL        | `0158_planes_notification_category.sql`                                         | exact         |
| `el-templo-api/src/modules/notifications/types.ts` (MOD)                         | config/types   | transform        | mismo archivo `:3-20`, `:77-220`                                                | exact         |
| `el-templo-api/src/modules/referrals/routes.ts` (NEW)                            | route          | request-response | `subscriptions/member-routes.ts` + `notifications/routes.ts:158-248`            | exact         |
| `el-templo-api/src/app.ts` (MOD)                                                 | config         | wiring           | `app.ts:180-183` (`memberSubscriptionRoutes` @ `/api/members/subscription`)     | exact         |
| `el-templo-api/src/modules/subscriptions/service.ts` (MOD)                       | service        | event-driven     | `qualifyReferralOnCharge` `:404-412` + `NotificationService.queueNotification`  | role-match    |
| `el-templo-api/src/modules/referrals/service.ts` (MOD, opcional)                 | service        | CRUD             | `computeReferralDiscountPercent` `:157-188`                                     | exact         |
| `el-templo-api/src/modules/members/routes.ts` (MOD, admin ficha data)            | route          | request-response | `notifications/routes.ts` admin block + members routes existentes               | role-match    |
| `el-templo-app/src/pages/MisReferidosPage.vue` (NEW)                             | component/page | request-response | `ProfilePage.vue` (cards) + `bar-challenge/pages/Resultado.vue:207-242` (share) | role-match    |
| `el-templo-app/src/pages/ProfilePage.vue` (MOD)                                  | component      | —                | mismo archivo `:72-79` (item "Cambiar contraseña")                              | exact         |
| `el-templo-app/src/router/routes.ts` (MOD)                                       | route          | —                | mismo archivo `:42-46` (`/change-password`)                                     | exact         |
| `el-templo-admin/src/pages/AlumnoDetailPage.vue` (MOD)                           | component      | —                | mismo archivo `:340-386` (tab + panel `perfil`)                                 | exact         |
| `el-templo-admin/src/components/MemberReferralsTab.vue` (NEW)                    | component      | request-response | `MemberSubscriptionTab.vue:1-40`                                                | role-match    |
| `el-templo-admin/src/composables/useMembersApi.ts` (MOD)                         | service/api    | request-response | mismo archivo `:328-341` (`getNotes`)                                           | exact         |
| `el-templo-api/test/referrals/member-endpoint.test.ts` (NEW)                     | test           | request-response | `test/subscriptions/coverage-endpoint.test.ts`                                  | exact         |
| `el-templo-api/test/referrals/activation-notification.test.ts` (NEW)             | test           | event-driven     | `test/referrals/qualification.test.ts` + coverage test harness                  | role-match    |

---

## Pattern Assignments

### `el-templo-api/src/db/schema/notifications.ts` (MOD — enum de categoría)

**Analog:** mismo archivo + migración `0158`.

**Enum a extender** (`:16-22`). Apendar `"referidos"` AL FINAL para preservar el orden byte-for-byte (enum drift = "Unknown column" en CI que tsc no detecta — skill db-migrations regla #6):

```typescript
export const notificationCategoryEnum = mysqlEnum("notification_category", [
  "entrenamiento",
  "programas",
  "motivacion",
  "anuncios",
  "planes",
  "referidos", // ← NUEVO, apendado último
]);
```

La columna física se llama `notification_category` (1er arg), NO `category`. Aplica a `notification_templates` (`:64`) y `notification_preferences` (`:86`) — ambas usan el mismo enum.

---

### `el-templo-api/src/db/migrations/0177_referidos_notification_category.sql` (NEW)

**Analog EXACTO:** `el-templo-api/src/db/migrations/0158_planes_notification_category.sql` (copiar estructura completa, cambiar `planes`→`referidos`).

Número: verificar tope real al planificar — el último es `0176_referrals_core.sql`, así que `0177` es el próximo libre. El patrón del 0158 (leído íntegro):

```sql
-- Phase 158 — add 'referidos' notification category + backfill prefs
-- Hand-written (db:generate roto por drift sessions.goal_plan_type; _journal.json stale)
-- Enum column named `notification_category` on BOTH tables; new value APPENDED last
-- so existing values keep byte-for-byte order. Backfill via NOT EXISTS = idempotent.
-- NEVER drizzle-kit push/migrate -- _migrations table is the source of truth.

ALTER TABLE `notification_templates`
  MODIFY COLUMN `notification_category`
  enum('entrenamiento','programas','motivacion','anuncios','planes','referidos')
  NOT NULL;

ALTER TABLE `notification_preferences`
  MODIFY COLUMN `notification_category`
  enum('entrenamiento','programas','motivacion','anuncios','planes','referidos')
  NOT NULL;

INSERT INTO `notification_preferences` (`user_id`, `notification_category`, `enabled`)
SELECT u.`id`, 'referidos', true
FROM `users` u
WHERE NOT EXISTS (
  SELECT 1 FROM `notification_preferences` p
  WHERE p.`user_id` = u.`id` AND p.`notification_category` = 'referidos'
);
```

CRÍTICO: cero `;` dentro de comentarios `--` (el runner splitea por `;` antes de stripear comentarios — rompió CI en la 0119). Commitear el `.sql` en el MISMO commit que el cambio de schema.

---

### `el-templo-api/src/modules/notifications/types.ts` (MOD)

**Analog:** mismo archivo. Tres ediciones paralelas al enum:

1. `NotificationCategory` union type (`:3-8`) → agregar `| "referidos"`.
2. `NOTIFICATION_CATEGORIES` const array (`:14-20`) → agregar `"referidos"`.
3. `TEMPLATE_SEEDS` (`:77-220`) → agregar el seed del template de activación. Estructura de cada seed (`:78-86` como molde; copy exacto de UI-SPEC S4):

```typescript
{
  templateKey: "referral_link_activated",
  category: "referidos",
  title: "¡Tu referido pagó!",
  body: "{Nombre} pagó su primer plan. Ya tenés tu descuento activo.",
  titleFemale: "¡Tu referida pagó!",
  bodyFemale: "{Nombre} pagó su primer plan. Ya tenés tu descuento activo.",
  route: "/mis-referidos",
},
```

`seedTemplates()` (`service.ts:617-639`) itera `TEMPLATE_SEEDS` con `INSERT IGNORE` — no requiere cambios de código, solo el seed nuevo. NOTA: el `{Nombre}` no lo interpola el template engine (no hay uno) — se pasa vía `bodyOverride` en `queueNotification` (ver hook abajo).

---

### `el-templo-api/src/modules/referrals/routes.ts` (NEW — `GET /members/referrals`)

**Analog:** `notifications/routes.ts:158-248` (estructura member-facing con `fastify.authenticate`) + `subscriptions/member-routes.ts` (member self-scoped, id server-derived, IDOR-safe). El módulo `referrals` HOY no tiene `routes.ts` — se crea nuevo.

**Guard + service composition pattern** (de `notifications/routes.ts:158-206`):

```typescript
export const referralMemberRoutes: FastifyPluginAsync = async (fastify) => {
  const service = new ReferralService(fastify.db, fastify.log);

  fastify.get(
    "/", // montado en /api/members/referrals
    { onRequest: [fastify.authenticate] },
    async (request) => {
      const { userId } = request.user; // NUNCA aceptar userId del cliente (IDOR)
      // compone: generateReferralCode (lazy) + computeReferralDiscountPercent
      //          + getReferralConfig + lista de vínculos con estado derivado
      return { referralCode, discount, broughtByMe, broughtMeIn };
    },
  );
};
```

**Estado derivado por vínculo** (NO `users.status`, D-28): reusar EXACTAMENTE el criterio de `computeReferralDiscountPercent` (`referrals/service.ts:157-188`): `deriveCoveredUntil(db, counterpartyId)` de la contraparte vs `today`. Mapeo → `pending`=Pendiente, `qualified`+contraparte cubierta=Activo, `qualified`+contraparte vencida=Suspendido, `revoked`=NO se muestra.

**Config nunca hardcodeada** (D-27.2): el desglose (`perLinkPercent`, `capPercent`) sale de `service.getReferralConfig()` (`:127-148`), que ya devuelve `{ percentPerLink, maxPercentCap }` con fallback 10/40.

**Discreción del planner:** la lista de vínculos con nombre completo + estado puede vivir como método nuevo en `ReferralService` (p.ej. `getReferralOverview(userId)`) o componerse inline en la ruta. Preferible el método en el service para reusarlo en la ficha admin y testear puro.

---

### `el-templo-api/src/app.ts` (MOD — registrar la ruta)

**Analog EXACTO:** `app.ts:180-183` (member-facing subscription). Convención de prefijo member-facing: `/api/members/*`.

```typescript
await app.register(referralMemberRoutes, {
  prefix: "/api/members/referrals",
});
```

Colocar junto a los otros `/api/members/*` (`:175` attendance, `:180` subscription, `:190` scheduling, `:214` ratings).

---

### `el-templo-api/src/modules/subscriptions/service.ts` (MOD — hook D-33)

**Analog:** `qualifyReferralOnCharge` `:404-412` (el punto exacto donde flippea a `qualified`) + `NotificationService.queueNotification` (`notifications/service.ts:226-310`).

El hook actual (`:404-412`):

```typescript
private async qualifyReferralOnCharge(payerUserId: number, pricePaid: number): Promise<void> {
  if (pricePaid <= 0) return;
  await new ReferralService(this.db, this.log).qualifyFirstPayment(payerUserId);
}
```

`qualifyFirstPayment` (`referrals/service.ts:196-206`) hace un `UPDATE ... WHERE status='pending'` idempotente. Para no notificar en re-cobros, el hook debe detectar si realmente hubo un flip (p.ej. `qualifyFirstPayment` devuelve el/los `referrerId` afectados, o consultar el vínculo). Luego encolar AL REFERIDOR (no al referido, D-31):

**Best-effort obligatorio** (D-33 — un fallo de notificación NUNCA rompe el cobro; mismo criterio que el resto de la cola). Patrón try/catch envolvente:

```typescript
try {
  const svc = new NotificationService(this.db, this.log);
  await svc.queueNotification({
    userId: referrerId,
    templateKey: "referral_link_activated",
    bodyOverride: `${referredFirstName} pagó su primer plan. Ya tenés tu descuento activo.`,
  });
} catch (err: unknown) {
  this.log.warn(
    { err: err instanceof Error ? err.message : String(err), referrerId },
    "referral activation notification failed (best-effort)",
  );
}
```

`queueNotification` YA es defensivo (chequea template/enabled/preferencia/device-token y devuelve `-1` si skip, `:243-279`) — igualmente envolver en try/catch por si el INSERT falla. Este hook se invoca desde las 4 charge-paths (`:1354`, `:3105`, `:3603`, `:3943`); la notificación va DENTRO de `qualifyReferralOnCharge`, no en cada call-site.

---

### `el-templo-api/src/modules/members/routes.ts` (MOD — datos de la ficha admin, D-34)

**Analog:** bloque admin de `notifications/routes.ts:254-291` (guard `ADMIN_ROLES` + `reply.code(403)`) + rutas members existentes (`/admin/members/:id/notes` es el molde más cercano por shape).

**Discreción (D del CONTEXT):** endpoint nuevo `GET /admin/members/:id/referrals` vs extender `GET /admin/members/:id`. Recomendación: endpoint dedicado (paralelo a `getNotes`/`getPlans` del módulo, lazy-load por tab), devolviendo `{ broughtBy: {...} | null, broughtOthers: [...] }` con el MISMO estado derivado (`deriveCoveredUntil`) que la app — reusar el `getReferralOverview` del service si se creó. Guard admin:

```typescript
const { role } = request.user;
if (!(ADMIN_ROLES as readonly string[]).includes(role)) {
  return reply.code(403).send({ error: "Acceso denegado" });
}
```

---

### `el-templo-app/src/pages/MisReferidosPage.vue` (NEW)

**Analog visual:** `ProfilePage.vue` (familia de cards dark: `.info-card`, `.settings-card`, `.section-title` — UI-SPEC asume reuso 1:1). **Analog de share:** `bar-challenge/pages/Resultado.vue:207-242`.

**Fetch pattern** (de `ProfilePage.vue:200-214`): `api` desde `src/boot/axios`, `createLogger`, `extractError`, `TemploLoader`:

```typescript
import { api } from "src/boot/axios";
import { createLogger } from "src/utils/logger";
import { extractError } from "src/utils/extract-error";
import TemploLoader from "src/components/TemploLoader.vue";

const res = await api.get<ReferralsResponse>("/members/referrals");
```

**Share nativo** (dynamic import de `@capacitor/share` v8.0.1 — presente en package.json; molde `Resultado.vue:217-234`):

```typescript
try {
  const shareMod: typeof import('@capacitor/share') = await import('@capacitor/share')
  const { Share } = shareMod
  await Share.share({
    title: 'Sumate a El Templo',
    text: `Entrená conmigo en El Templo. Usá mi código y los dos empezamos a pagar menos: ${shareUrl}`,
    url: shareUrl, // registro público + ?ref={referralCode}
  })
} catch (shareErr: unknown) {
  logger.warn('share failed → fallback clipboard', { err: ... })
  // FALLBACK: NO existe @capacitor/clipboard ni download aplica aquí (es un link, no imagen).
  // Usar copyToClipboard de 'quasar' + $q.notify warning (copy exacto en UI-SPEC).
  await copyToClipboard(shareUrl)
  $q.notify({ message: 'No pudimos abrir el menú de compartir. Copiamos el link...', color: 'warning' })
}
```

NOTA para el planner: el fallback del analog (`Resultado.vue`) descarga un blob de imagen; acá el asset es un LINK → adaptar a `import { copyToClipboard } from 'quasar'`. Verificar que `copyToClipboard` está disponible (Quasar util, sí lo está). Todos los números (% por vínculo, tope) vienen del server, nunca hardcodeados. Chips derivados: Pendiente=`info`, Activo=`positive`, Suspendido=`warning` (UI-SPEC §Color).

---

### `el-templo-app/src/pages/ProfilePage.vue` (MOD — entry item S2)

**Analog EXACTO:** el item "Cambiar contraseña" del mismo archivo (`:72-79`). Clonar dentro del `settings-card` de "Ajustes":

```html
<div class="settings-card__divider" />
<div
  class="settings-card__item settings-card__item--clickable"
  @click="$router.push('/mis-referidos')"
>
  <q-icon name="card_giftcard" size="22px" color="primary" />
  <span class="settings-card__label">Mis referidos</span>
  <q-icon
    name="chevron_right"
    size="20px"
    color="grey-5"
    class="settings-card__chevron"
  />
</div>
```

Sin patrón visual nuevo — reusa divider + markup ya presentes.

---

### `el-templo-app/src/router/routes.ts` (MOD)

**Analog EXACTO:** `/change-password` (`:42-46`). Agregar como hijo de MainLayout (protegido):

```typescript
{
  path: 'mis-referidos',
  name: 'mis-referidos',
  component: () => import('pages/MisReferidosPage.vue'),
},
```

---

### `el-templo-admin/src/pages/AlumnoDetailPage.vue` (MOD — tab S3)

**Analog EXACTO:** el patrón `q-tab`/`q-tab-panel` del mismo archivo (`:340-386`). Agregar tab tras "Perfil" (`:340`):

```html
<q-tab name="referidos" label="Referidos" />
```

Y el panel (molde `:364-386`):

```html
<q-tab-panel name="referidos">
  <MemberReferralsTab :user-id="memberProfile.id" />
</q-tab-panel>
```

Import junto a los otros tabs (`:797-804`). **Alternativa que UI-SPEC permite:** foldear como card al fondo del tab "perfil" en vez de tab propio — el contrato visual aplica igual.

---

### `el-templo-admin/src/components/MemberReferralsTab.vue` (NEW)

**Analog:** `MemberSubscriptionTab.vue:1-40` (estructura de tab: loading `q-spinner-dots color="primary"` centrado, luego contenido). Superficie light (cream/white), chips con los MISMOS 3 colores semánticos que S1. Dos subsecciones: "Lo trajo" (referidor, nombre = link terracotta a su ficha vía `router.push`) y "Trajo a" (lista). Estado vacío: `text-caption` "Este alumno no tiene referidos." Error: toast negativo vía `extractError` (patrón del módulo).

---

### `el-templo-admin/src/composables/useMembersApi.ts` (MOD)

**Analog EXACTO:** `getNotes` (`:328-341`). Agregar:

```typescript
async function getReferrals(userId: number): Promise<MemberReferralsResponse> {
  const { data } = await api.get<MemberReferralsResponse>(
    `/admin/members/${userId}/referrals`,
  );
  return data;
}
```

Exponerlo en el `return {}` del composable junto a `getNotes`, `getPlans`, etc.

---

### `el-templo-api/test/referrals/member-endpoint.test.ts` (NEW)

**Analog EXACTO:** `test/subscriptions/coverage-endpoint.test.ts:1-75`. Reusa `createTestApp`, `getAuthToken`, `cleanAllTestData` de `test/helpers.ts` + `createMember`/`createPlan` (los tests de referrals ya existen bajo `test/referrals/` — usar sus helpers de setup de vínculos). Cubrir: código lazy-generado si falta, estado derivado Pendiente/Activo/Suspendido (montando cobertura de contraparte con subs directas como `insertSub` en `:54-70`), desglose de descuento leyendo config, IDOR (miembro solo ve lo suyo — id server-derived).

---

### `el-templo-api/test/referrals/activation-notification.test.ts` (NEW)

**Analog:** `test/referrals/qualification.test.ts` (flip a qualified) + assert sobre `pending_notifications`. Verificar: al flippear el vínculo (primer pago `pricePaid>0`) se encola UNA notificación `referral_link_activated` AL REFERIDOR; el referido NO recibe push; re-cobro no duplica; un fallo de push no rompe el cobro (best-effort). Necesita device-token seed para el referidor (o assert de skip `-1` si no lo tiene — `queueNotification:273-279`).

---

## Shared Patterns

### Autenticación (rutas member-facing)

**Source:** `notifications/routes.ts:174` + `subscriptions/member-routes.ts:51`
**Apply to:** `referrals/routes.ts`

```typescript
{
  onRequest: [fastify.authenticate];
}
// id SIEMPRE server-derived: const { userId } = request.user — nunca del body/params (IDOR)
```

### Autorización admin (ficha)

**Source:** `notifications/routes.ts:262-265`
**Apply to:** endpoint admin de referidos en `members/routes.ts`

```typescript
const { role } = request.user;
if (!(ADMIN_ROLES as readonly string[]).includes(role)) {
  return reply.code(403).send({ error: "Acceso denegado" });
}
```

### Estado derivado "activo" (único criterio)

**Source:** `referrals/service.ts:157-188` (`computeReferralDiscountPercent` → `deriveCoveredUntil`)
**Apply to:** endpoint member, endpoint admin, chips de ambas superficies
NUNCA `users.status`. El estado Suspendido de la UI = `qualified` + contraparte con `deriveCoveredUntil < today`.

### Best-effort en el flujo transaccional

**Source:** `notifications/service.ts:243-279` (queueNotification defensivo) + criterio D-33
**Apply to:** hook en `subscriptions/service.ts qualifyReferralOnCharge`
Un fallo de notificación NUNCA rompe el cobro. Try/catch + `log.warn`.

### Fetch + error en frontend

**Source (app):** `ProfilePage.vue:163-166,200-214` (`api` de boot/axios, `createLogger`, `extractError`, `TemploLoader`)
**Source (admin):** `useMembersApi.ts:328-341` (composable `api.get`, tipado, `extractError`)
**Apply to:** `MisReferidosPage.vue`, `MemberReferralsTab.vue`

### Config nunca hardcodeada

**Source:** `referrals/service.ts:127-148` (`getReferralConfig` → `{ percentPerLink, maxPercentCap }`, fallback 10/40)
**Apply to:** desglose pedagógico del descuento (S1) — todos los % del server.

---

## No Analog Found

Ninguno. Los 17 archivos tienen analog directo en el repo — la fase es composición sobre infra shippeada (cola de notificaciones fase ~56/144, `ReferralService` fase 157, cards de `ProfilePage`, tabs de `AlumnoDetailPage`, share de `bar-challenge`).

**Gaps menores a resolver en planning (no bloqueantes):**

- Fallback de share: NO existe `@capacitor/clipboard` en el app. Usar `copyToClipboard` de `quasar` (el analog `Resultado.vue` descarga imagen, no aplica a un link) — adaptar, no copiar 1:1.
- Interpolación de `{Nombre}` en el push: no hay template engine — pasar por `bodyOverride` en `queueNotification`.
- Detección de flip real en `qualifyFirstPayment` para no notificar en re-cobros: `qualifyFirstPayment` (`:196-206`) es un UPDATE guardado; el planner debe decidir si devuelve los `referrerId` afectados o si el hook consulta el vínculo antes/después.

## Metadata

**Analog search scope:** `el-templo-api/src/modules/{referrals,notifications,subscriptions,members}`, `el-templo-api/src/db/{schema,migrations}`, `el-templo-api/test/{referrals,subscriptions}`, `el-templo-app/src/{pages,router,modules/bar-challenge}`, `el-templo-admin/src/{pages,components,composables}`, `.claude/skills/el-templo-db-migrations`
**Files scanned:** ~22 (lecturas dirigidas, sin re-lecturas)
**Pattern extraction date:** 2026-07-11
</content>
</invoke>
