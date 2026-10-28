# Fase 199: Rediseño de Mi Templo + patrocinadores — Mapa de patrones

**Mapeado:** 2026-10-15
**Código analizado en:** worktree `/home/franco/projects/et-199-mi-templo` (rama `feat/199-mi-templo-rediseno`, base `feat/novedades-mi-templo`). Todas las rutas abajo son relativas a la raíz del repo y fueron verificadas ahí.
**Archivos analizados (nuevos/modificados):** ~58
**Analogías encontradas:** 54 / 58 (los 4 sin analogía exacta están en "Sin analogía")

> Hallazgos que cambian el plan (leer primero):
>
> 1. **No existe `super owner` ni `platform_users` en esta base** (fase 182 vive en `feat/v6.1-gimnasio`, no en la base de la 199). Las "tablas de plataforma" de hoy son `TENANT_EXEMPT_TABLES` (`tenants`, `tenant_settings`, `system_settings`, `labs_inquiries`). El guard "solo admins de El Templo" hoy se arma con `ADMIN_ROLES` + `tenantId === 1` (precedente: `TEMPLO_TENANT_ID` en `el-templo-api/src/modules/shared/app-branch-name.ts:26`). Al integrar con el tren habrá conflicto en `tenant-tables.ts` (la 182 agrega `platform_users`/`platform_audit_log` a `TENANT_EXEMPT_TABLES`) y en los conteos fijos.
> 2. **Conteos fijos de la base (post-0275):** 102 gym-owned, 4 exentas, 106 tablas del schema, manifiesto `ENTRADAS_BASELINE = 463`. La 199 suma `sponsor_brands` (exenta) + `sponsor_views` (gym-owned) → **103 / 5 / 108**.
> 3. **El límite de activas (D-24) conviene en `system_settings`, no en `tenant_settings`**: `system_settings` es exenta, tiene molde completo (`store-urls`) y `cleanAllTestData` ya la limpia (`el-templo-api/test/helpers.ts:315`). Evita la trampa del allowlist de namespaces de `0190-0191-tenants` Test 3.
> 4. **`GET /my-bookings` NO devuelve sede ni zona horaria** (`BookingRecord` sin `branchName`/`branchTimezone`; el schema de respuesta Fastify recorta lo no listado). D-03/D-04/D-06 las necesitan: hay que enriquecer `bookingRecordSchema` + `getMyBookings` (aditivo) o resolverlas aparte.
> 5. **El server solo acepta check-in sobre reservas con `status = 'reservado'`** (`attendance/service.ts:~125-156`). Para el FAB (D-06) "ya marcó" = ninguna reserva `reservado` hoy en ventana; la hora "Asistencia registrada HH:MM" no sale de `my-bookings` (hay que leerla de `attendance/history` o de `myAttendance` del grid semanal).
> 6. **`QUOTES` del app tiene 6 consumidores, no 4:** además de DailyQuote/DayPlayer/GoalPlanSession/SplashScreen, `TransitionScreen.vue` y `CelebrationScreen.vue` tipan `quote: { text; goldText; author }`. Cambiar al formato `segments[]` obliga a tocarlos o a mantener un adaptador.
> 7. **Unique de `sponsor_views`:** si el primer campo es `brand_id` (FK a una tabla EXENTA) NO vale la justificación "derivada de FK scopeada". Poner `user_id` primero (FK a `users`, gym-owned) y registrar en `TENANT_UNIQUE_ALLOWLIST`, o anteponer `tenant_id`.
> 8. **`.q-page` y `.q-card` pintan crema opaco** (`el-templo-app/src/css/app.scss:119-127`) y `body` crema `!important` (`:113-115`): mover `.app-bg` detrás (D-16) requiere además hacer transparente la página de Mi Templo, o el fondo no se ve.

---

## Clasificación de archivos

### API (`el-templo-api/`)

| Archivo nuevo/modificado                                                                                                                                              | Rol            | Flujo de datos       | Analogía más cercana                                                                                                   | Calidad |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------- |
| `src/db/migrations/0279_sponsors.sql`                                                                                                                                 | migration      | DDL                  | `src/db/migrations/0275_novedades.sql`                                                                                 | exacta  |
| `src/db/schema/sponsors.ts` (+ export en `schema/index.ts`)                                                                                                           | model          | CRUD                 | `src/db/schema/communications.ts:215-275` (novedades/novedad_views) + `schema/system-settings.ts` (tabla exenta)       | exacta  |
| `src/db/tenant-tables.ts` (mod)                                                                                                                                       | config         | registro             | commit `e987b707e` (alta de novedades)                                                                                 | exacta  |
| `test/db/tenant-tables.test.ts`, `test/migrations/0192-0195-tenant-columns.test.ts`, `test/migrations/0196-tenant-unique-contracts.test.ts` (mod)                     | test           | conteos fijos        | mismo commit `e987b707e`                                                                                               | exacta  |
| `test/helpers.ts` `TABLES_TO_CLEAN`, `test/fixtures/second-tenant.ts` (mod)                                                                                           | test-util      | limpieza             | mismo commit                                                                                                           | exacta  |
| `src/modules/sponsors/service.ts`                                                                                                                                     | service        | CRUD + métricas      | `src/modules/communications/novedades-service.ts`                                                                      | exacta  |
| `src/modules/sponsors/admin-routes.ts`                                                                                                                                | route          | request-response     | `src/modules/communications/novedades-routes.ts` (CRUD) + guard de plugin de `referral-partners/admin-routes.ts:35-58` | exacta  |
| `src/modules/sponsors/member-routes.ts`                                                                                                                               | route          | request-response     | `novedades-routes.ts` (`/me/novedades` + `/me/novedades/:id/event`)                                                    | exacta  |
| `src/modules/sponsors/schemas.ts`                                                                                                                                     | schema         | validación           | `communications/schemas.ts:595-660`                                                                                    | exacta  |
| `src/modules/sponsors/index.ts` + registro en `src/app.ts`                                                                                                            | config         | wiring               | `src/modules/referral-partners/index.ts` + `app.ts:~262-275`                                                           | exacta  |
| guard "solo El Templo" (en `sponsors/admin-routes.ts`)                                                                                                                | middleware     | request-response     | `referral-partners/admin-routes.ts:35-58` + `shared/app-branch-name.ts:26`                                             | parcial |
| Límite de activas: `settings/keys.ts`, `settings/service.ts`, `settings/routes.ts` o ruta propia                                                                      | config/service | CRUD KV              | `settings/routes.ts:202-275` + `settings/service.ts:186-215` (store-urls)                                              | exacta  |
| Subida de logo: `blog/image-service.ts` (mod: prefijo) + ruta en sponsors                                                                                             | service/route  | file-I/O (presigned) | `blog/image-service.ts` + `blog/routes.ts:418-440`                                                                     | exacta  |
| "Tuvo plan antes": ruta nueva o extensión bajo `subscriptions/member-routes.ts`                                                                                       | route          | request-response     | `subscriptions/member-routes.ts:66-158` (`/me/subscription`) + `service.ts:1589` (`getMemberSubscriptionHistory`)      | rol     |
| Novedades + pop-up (D-13): `communications/novedades-service.ts` (mod)                                                                                                | service        | request-response     | `communications/prompt-service.ts:189-235` (`resolveAvisoVigente`)                                                     | rol     |
| `scheduling/booking-service.ts` `getMyBookings` + `scheduling/schemas.ts` `bookingRecordSchema` (mod)                                                                 | service/schema | request-response     | mismos archivos (`:671-735`, `schemas.ts:102-150`)                                                                     | exacta  |
| `test/tenant-manifest.ts` + `test/tenancy/iso-01-manifiesto.test.ts` (mod)                                                                                            | test           | registro             | entradas Novedades `tenant-manifest.ts:955-970`                                                                        | exacta  |
| `test/tenancy/iso-03-subs-lecturas.test.ts` + `CASOS_BASELINE` en `iso-03-cobertura-subs-sched.test.ts` (mod, si la ruta nueva cuelga de `/api/members/subscription`) | test           | aislamiento          | `iso-03-subs-lecturas.test.ts:773-830`                                                                                 | exacta  |
| `test/sponsors/*.test.ts` (admin, member, métricas, límite, tenant 2)                                                                                                 | test           | integración          | `test/communications/novedades.test.ts` + `test/referral-partners/store-urls.test.ts`                                  | exacta  |
| `test/subscriptions/<had-plan>.test.ts`                                                                                                                               | test           | integración          | `test/subscriptions/member-subscription-paquete.test.ts`                                                               | exacta  |

### App (`el-templo-app/src/`)

| Archivo nuevo/modificado                                                                                    | Rol             | Flujo                                | Analogía más cercana                                                                         | Calidad                            |
| ----------------------------------------------------------------------------------------------------------- | --------------- | ------------------------------------ | -------------------------------------------------------------------------------------------- | ---------------------------------- |
| `modules/progression/pages/MiTemplo.vue` (mod: pila nueva)                                                  | page            | request-response                     | el propio archivo (hoy 646 líneas)                                                           | exacta                             |
| `layouts/MainLayout.vue` (mod: `.app-bg`, FAB extendido, saludo, tab bar)                                   | layout          | —                                    | el propio archivo                                                                            | exacta                             |
| `modules/progression/components/TodayCard.vue` (nuevo; fusiona SessionCta/BookingStatus/RestDay)            | component       | request-response                     | `SessionCtaCard.vue` + `BookingStatusCard.vue` + `RestDayCard.vue`                           | rol                                |
| `modules/progression/components/NoPlanCard.vue` (nuevo, slot de hoy sin plan)                               | component       | request-response                     | `UpsellBadge.vue` / `ProgramCtaCard.vue` (CTA cards)                                         | rol                                |
| `modules/progression/components/SponsorsCarousel.vue` (nuevo)                                               | component       | event-driven (timer, swipe)          | `NovedadesCard.vue:80-255`                                                                   | exacta (comportamiento)            |
| `modules/progression/components/SponsorSheet.vue` (nuevo)                                                   | component       | request-response                     | `components/ActivityInfoSheet.vue`                                                           | exacta (estructura; look es claro) |
| `modules/progression/components/MemberCard.vue` / carnet (nuevo, pantalla completa + hora en vivo)          | component       | event-driven (reloj)                 | `BookingStatusCard.vue:36-60` (intervalo + cleanup)                                          | parcial                            |
| `stores/useSponsorsStore.ts` (nuevo)                                                                        | store           | request-response + eventos fail-open | `stores/useNovedadesStore.ts`                                                                | exacta                             |
| `modules/progression/components/CheckInCard.vue` (mod) / `CheckInPanel.vue` (nuevo, "1 de 3")               | component       | request-response                     | `CheckInCard.vue` + `types.ts:132-166`                                                       | rol                                |
| `modules/progression/components/WeekStrip.vue` (nuevo, "Tu semana") / `WeeklySummaryCard.vue` (mod)         | component       | transform                            | `WeeklySummaryCard.vue` + `training/composables/useWeekData.ts`                              | rol                                |
| `modules/progression/components/GeneralContent.vue` (mod: sin RPE, gate evaluación)                         | component       | —                                    | el propio archivo + `EvaluationRequest.vue`                                                  | exacta                             |
| `modules/progression/components/AvisoCard.vue` / `ImprovementCtaCard.vue` etc. (mod: look claro "Para vos") | component       | —                                    | `AvisoCard.vue`                                                                              | exacta                             |
| `modules/progression/components/DailyQuote.vue` (mod)                                                       | component       | transform                            | el propio archivo                                                                            | exacta                             |
| `modules/training/data/quotes.ts` (mod: 10 frases TV) + 5 consumidores                                      | util/data       | transform                            | `el-templo-admin/src/utils/pdf/quotes.ts:21-64`                                              | exacta                             |
| `pages/ProfilePage.vue` (mod: "Proponer una mejora")                                                        | page            | —                                    | entrada "Mis invitados" `:84-95`                                                             | exacta                             |
| `composables/useSchedulingApi.ts` (mod: tipos) / `utils/tz.ts` (uso)                                        | composable/util | request-response                     | mismos archivos                                                                              | exacta                             |
| `utils/check-in-window.ts` (nuevo, ventana ±20)                                                             | util            | transform                            | `utils/relative-days.ts` (util puro con `now` inyectado) + `utils/tz.ts:zonedWallClockToUtc` | rol                                |
| `stores/useUserStore.ts` (mod: "tuvo plan")                                                                 | store           | request-response                     | `loadSubscription` `:384-408`                                                                | exacta                             |
| `css/app.scss` (mod: `@fontsource/nunito-sans`, Cinzel, fondo)                                              | config          | —                                    | imports `:9-17`                                                                              | exacta                             |
| tests: `stores/__tests__/sponsors-store.test.ts`, `utils/__tests__/check-in-window.test.ts`, etc.           | test            | unit                                 | `stores/__tests__/novedades-store.test.ts`, `utils/__tests__/relative-days.test.ts`          | exacta                             |

### Admin (`el-templo-admin/src/`)

| Archivo nuevo/modificado                                                           | Rol           | Flujo            | Analogía más cercana                                                                 | Calidad          |
| ---------------------------------------------------------------------------------- | ------------- | ---------------- | ------------------------------------------------------------------------------------ | ---------------- |
| `pages/PartnersPage.vue` (mod: tab "Patrocinadores" + atajo en fila)               | page          | request-response | el propio archivo `:43-56`                                                           | exacta           |
| `components/sponsors/SponsorsTab.vue` (nuevo: lista ordenable + métricas + límite) | component     | CRUD             | `components/comunicaciones/TarjetasTab.vue` (orden subir/bajar) + `NovedadesTab.vue` | exacta           |
| `components/sponsors/SponsorEditorDialog.vue` (nuevo)                              | component     | CRUD             | `components/comunicaciones/NovedadEditorDialog.vue`                                  | exacta           |
| `components/sponsors/SponsorCardPreview.vue` + `SponsorSheetPreview.vue` (nuevos)  | component     | transform        | `components/comunicaciones/NovedadPreview.vue`                                       | exacta           |
| `composables/useSponsorsApi.ts` (nuevo)                                            | composable    | request-response | `composables/usePartnersApi.ts:203-250`                                              | exacta           |
| logo uploader (en el editor)                                                       | composable/UI | file-I/O         | `composables/useBlogImageUpload.ts` + `pages/BlogEditorPage.vue:84,191`              | exacta           |
| `utils/contrast.ts` (nuevo, ratio WCAG ≥ 4.5)                                      | util          | transform        | —                                                                                    | **sin analogía** |
| `utils/sponsors.ts` (nuevo, helpers de form)                                       | util          | transform        | `utils/novedades.ts`                                                                 | rol              |

---

## Asignación de patrones

### `el-templo-api/src/db/migrations/0279_sponsors.sql` (migration, DDL)

**Analogía:** `el-templo-api/src/db/migrations/0275_novedades.sql` (66 líneas útiles).

**Formato del runner** (`src/db/run-migrations.ts:47-60`): si el archivo contiene `--> statement-breakpoint` se parte por ahí; si no, por `;` **antes** de quitar comentarios `--`. Por eso **ningún comentario puede llevar `;`**.

**Tabla gym-owned con tenant_id + FK nombrada** (0275, `novedad_views`):

```sql
CREATE TABLE `novedad_views` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL DEFAULT 1,
  `novedad_id` int NOT NULL,
  `user_id` int NOT NULL,
  `first_seen_at` datetime NOT NULL,
  `clicked_at` datetime NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_novedad_views_novedad_user` (`novedad_id`, `user_id`),
  KEY `idx_novedad_views_user` (`user_id`),
  CONSTRAINT `fk_novedad_views_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`),
  CONSTRAINT `novedad_views_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
);
--> statement-breakpoint
```

Convenciones a respetar: `tenant_id INT NOT NULL DEFAULT 1` + `CONSTRAINT fk_<tabla>_tenant`; separar sentencias con `--> statement-breakpoint`; enums como `enum(...)` MySQL; `datetime` UTC para marcas de tiempo; `timestamp ... ON UPDATE CURRENT_TIMESTAMP` para `updated_at`; cabecera de comentario con justificación de numeración (la 0275 salta a propósito: 196 usa 0263-0269 y 0276-0278, 195 usa 0270-0274 → la 199 arranca en 0279).

**Para `sponsor_brands` (plataforma): SIN `tenant_id`, SIN FK a `tenants`.** Columnas según D-19: `name`, `category`, `logo_url`, `bg_color`, `text_color`, `benefit`, `detail`, `conditions`, `redeem_type enum('code','carnet')`, `redeem_code`, `countries` (json o dos flags `ar`/`es`), `starts_on date NULL`, `ends_on date NULL`, `is_active`, `sort_order`, `partner_id int NULL` (FK a `referral_partners` `ON DELETE SET NULL`). Para `sponsor_views` (gym-owned, molde `novedad_views`): `tenant_id`, `brand_id`, `user_id`, `first_seen_at`, `tapped_at NULL`, `redeem_at NULL`, unique `(user_id, brand_id)` (ver hallazgo 7).

**Datos de prod por migración:** CERO datos de prueba (staging y prod comparten MySQL: 0275 lo declara en su cabecera).

---

### `el-templo-api/src/db/schema/sponsors.ts` (model)

**Analogía gym-owned:** `el-templo-api/src/db/schema/communications.ts:215-275`.

```typescript
export const novedades = mysqlTable(
  "novedades",
  {
    id: int("id").primaryKey().autoincrement(),
    // Valor server-side, nunca de payload. Ver src/db/schema/tenant-column.ts
    tenantId: tenantIdColumn(),
    ...
    publishAt: datetime("publish_at").notNull(),
    status: novedadStatusEnum.notNull().default("active"),
    createdBy: int("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [index("idx_novedades_tenant_status_publish").on(table.tenantId, table.status, table.publishAt)],
);
```

```typescript
export const novedadViews = mysqlTable(
  "novedad_views",
  {
    id: int("id").primaryKey().autoincrement(),
    tenantId: tenantIdColumn(),
    novedadId: int("novedad_id")
      .references(() => novedades.id, { onDelete: "cascade" })
      .notNull(),
    userId: int("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    firstSeenAt: datetime("first_seen_at").notNull(),
    clickedAt: datetime("clicked_at"),
  },
  (table) => [
    uniqueIndex("uq_novedad_views_novedad_user").on(
      table.novedadId,
      table.userId,
    ),
    index("idx_novedad_views_user").on(table.userId),
  ],
);
```

**Analogía tabla exenta (sin `tenantIdColumn()`):** `el-templo-api/src/db/schema/system-settings.ts` y `tenants.ts` (`tenantSettings`). **Trampa documentada (`tenants.ts`, header):** el primer argumento de `mysqlEnum("redeem_type", [...])` es el NOMBRE FÍSICO de la columna. Exportar desde `src/db/schema/index.ts` (líneas 56/63/84 muestran el idioma `export * from "./..."`).

---

### `el-templo-api/src/db/tenant-tables.ts` (config) — los gates de tabla

**Analogía:** diff de `e987b707e` sobre este mismo archivo.

1. **Tabla de plataforma = `TENANT_EXEMPT_TABLES`** (`:197-202`): agregar `"sponsor_brands"` con su motivo en el docblock `:~170-196` (cada exenta tiene su viñeta; la 182 en `feat/v6.1-gimnasio:tenant-tables.ts:196-226` muestra cómo se documenta una tabla "por encima de los tenants"):

```typescript
export const TENANT_EXEMPT_TABLES = [
  "tenants",
  "tenant_settings",
  "system_settings",
  "labs_inquiries",
] as const;
```

2. **Tabla gym-owned** (`GYM_OWNED_TABLES`, `:69`, orden alfabético; el bloque Novedades está en `:123-126`):

```typescript
  // Novedades en Mi Templo (2026-10-14, migración 0275): nacen con tenant_id y
  // strict (ver TENANT_STRICT_MODULES["communications"] más abajo).
  "novedad_views",
  "novedades",
```

3. **Unique no encabezada por `tenant_id`** → `TENANT_UNIQUE_ALLOWLIST` (`:313`, formato clave `"tabla.indice_fisico"` + motivo):

```typescript
  "novedad_views.uq_novedad_views_novedad_user":
    "Derivada de FK scopeada: primer campo `novedad_id` → `novedades`, tabla gym-owned. Una fila por novedad y socio (D-5).",
```

Para `sponsor_views` usar `uq_sponsor_views_user_brand (user_id, brand_id)` y motivo "primer campo `user_id` → `users`" (hallazgo 7). 4. **Strict** (`TENANT_STRICT_MODULES`, `:601`, entrada `communications` en `:636`): sumar `"sponsor_views"` (el módulo `sponsors` puede declararse como módulo propio nuevo; si se crea, también en `MODULOS_DECLARADOS` del test). 5. **Fixtures/limpieza**: `test/helpers.ts:~253-255` (`TABLES_TO_CLEAN`: vistas antes que padres; `sponsor_brands` sin `tenant_id` también va acá, antes de `referral_partners` si hay FK) y `test/fixtures/second-tenant.ts` `limpiarSegundoGimnasio` (`DELETE FROM sponsor_views WHERE tenant_id = ${TENANT_DOS}` antes del `DELETE FROM users`).

**Los 5 conteos fijos (hacerlos en el mismo commit; `tsc` y `lint:tenant` NO los detectan):**

| Archivo                                                             | Qué cambia                                                                                        |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `test/db/tenant-tables.test.ts:120-126`                             | `GYM_OWNED_TABLES.length` 102→103; `TENANT_EXEMPT_TABLES.length` 4→5; `schemaTables.size` 106→108 |
| `test/db/tenant-tables.test.ts` (`MODULOS_DECLARADOS`, ~`:436-460`) | mapa esperado byte a byte de `TENANT_STRICT_MODULES`                                              |
| `test/migrations/0192-0195-tenant-columns.test.ts:164`              | `report.gymOwnedChecked` 102→103 (+ comentario)                                                   |
| `test/migrations/0196-tenant-unique-contracts.test.ts:616-647`      | idem + texto del mensaje                                                                          |
| `test/tenant-manifest.ts` + `iso-01-manifiesto.test.ts:~333-347`    | ver sección de rutas (463 + N)                                                                    |

Verificación local permitida: `cd el-templo-api && npx tsc --noEmit` y `pnpm lint:tenant`. Los tests no se corren local (CI).

**Lint de tenancy** (`src/db/scripts/lint-tenant.ts`): solo juzga accesos a tablas gym-owned. Acceder a `sponsor_brands` (exenta) no se juzga; **sí** el join a `referral_partners` (para `partner_id`) y todo acceso a `sponsor_views`: usar `tenantWhere(tabla, ctx)` / `tenantValues(ctx, {...})`. La `tenant-lint-allowlist.json` NO se toca (D-13/D-14: solo se achica). El `ctx` sale de `assertTenant(request.scope, "<motivo>")`.

---

### `el-templo-api/src/modules/sponsors/service.ts` (service, CRUD + métricas)

**Analogía:** `el-templo-api/src/modules/communications/novedades-service.ts`.

**Imports + tipos** (`:27-62`):

```typescript
import {
  and,
  count,
  desc,
  eq,
  inArray,
  isNull,
  lte,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import {
  tenantWhere,
  tenantValues,
  type TenantContext,
} from "../shared/tenant";
import { BadRequestError, NotFoundError } from "../shared/errors";
type DbInstance = MySql2Database<typeof schema>;
```

**Constructor** (`:169-173`): `constructor(private readonly db: DbInstance, private readonly log: FastifyBaseLogger) {}`.

**Métricas admin sin N+1** (`:182-209`, `list`): una query de lista + una `groupBy` de conteos, mergeadas con un `Map`:

```typescript
const counts = await this.db
  .select({
    novedadId: novedadViews.novedadId,
    views: count(),
    clicks: count(novedadViews.clickedAt),
  })
  .from(novedadViews)
  .where(tenantWhere(novedadViews, ctx))
  .groupBy(novedadViews.novedadId);
```

Para la 199: "socios únicos" por marca = `count()` por fila `(user, brand)` (ya único por la unique) y `count(tapped_at)` / `count(redeem_at)`. **Nota:** los conteos admin de la plataforma agregan filas de TODOS los tenants (la tabla de marcas es global); como `sponsor_views` es gym-owned, decidir explícitamente si la métrica del admin de El Templo es "su tenant" (con `tenantWhere`, camino natural y lint-limpio) o global.

**Evento idempotente fail-open** (`:367-430`, `recordEvent`): resolver el socio y la visibilidad ANTES de insertar; 404 (nunca 403) si no la debería ver; insert con `onDuplicateKeyUpdate` no-op; segunda `UPDATE ... isNull(col)` que conserva el primer valor:

```typescript
await this.db
  .insert(novedadViews)
  .values(
    tenantValues(ctx, {
      novedadId,
      userId,
      firstSeenAt: now,
      clickedAt: type === "clicked" ? now : null,
    }),
  )
  .onDuplicateKeyUpdate({ set: { novedadId: sql`novedad_id` } });
if (type === "clicked") {
  await this.db
    .update(novedadViews)
    .set({ clickedAt: now })
    .where(
      and(
        tenantWhere(novedadViews, ctx),
        eq(novedadViews.novedadId, novedadId),
        eq(novedadViews.userId, userId),
        isNull(novedadViews.clickedAt),
      ),
    );
}
```

Extender a 3 eventos (`seen`/`tapped`/`redeem`), cada uno completa su columna una sola vez.

**Visibilidad en UN lugar** (`:157-167`, `visibleToBranch`): una función con la condición (activa + vigencia + país) usada por el feed y por el chequeo de eventos, para que "lo que se lista" y "lo que se puede reportar" no diverjan. **Atención a la fecha:** `prompt-service.ts:76` hardcodea `AR_TIMEZONE`; D-20 exige "fecha en zona de la sede" → resolver `branches.timezone` del socio con `todayInTz(tz)` de `src/modules/shared/date-utils.ts` (`DEFAULT_TENANT_TIMEZONE` como fallback). La vigencia se compara como string `YYYY-MM-DD` (mismo criterio que `withinVigencia`, `prompt-service.ts:440-447`).

**País del socio:** `getMemberBranch` (`novedades-service.ts:459-472`) o `getMemberScopeInfo` (`prompt-service.ts:450-476`, trae `country`):

```typescript
const [row] = await this.db
  .select({ branchId: users.branchId, branchName: branches.name })
  .from(users)
  .innerJoin(branches, eq(users.branchId, branches.id))
  .where(and(tenantWhere(users, ctx), eq(users.id, userId)))
  .limit(1);
```

**Límite de activas por país (D-24):** validar en el servicio al activar/crear/editar con `count()` de activas del país + `BadRequestError`. Leer el límite desde `system_settings` (ver abajo).

---

### `el-templo-api/src/modules/sponsors/admin-routes.ts` + `member-routes.ts` (route)

**Analogía:** `el-templo-api/src/modules/communications/novedades-routes.ts` (237 líneas) y, para el guard a nivel plugin, `el-templo-api/src/modules/referral-partners/admin-routes.ts:35-58`.

**Handler admin** (`novedades-routes.ts:47-70`):

```typescript
fastify.get<{ Querystring: Record<string, never> }>(
  "/admin/novedades",
  {
    onRequest: [fastify.authenticate],
    schema: { response: listNovedadesResponseSchema },
  },
  async (request, reply) => {
    if (!isAdmin(request.user.role)) {
      return reply.code(403).send({ error: "Acceso denegado" });
    }
    await attachCountryScope(request, fastify.db);
    const ctx = assertTenant(request.scope, "novedades.list");
    try {
      const novedades = await service.list(ctx);
      return { novedades };
    } catch (err: unknown) {
      handleServiceError(err, reply, fastify.log, "novedades.list");
    }
  },
);
```

**Guard a nivel plugin** (`referral-partners/admin-routes.ts:39-58`) — preferible para el plugin de sponsors admin porque todas las rutas comparten el mismo gate:

```typescript
fastify.addHook("onRequest", async (request, reply) => {
  await fastify.authenticate(request, reply);
  if (!(MEMBER_LIFECYCLE_ROLES as readonly string[]).includes(request.user.role)) {
    return reply.code(403).send({ error: "Acceso denegado", message: "No tenés permisos para gestionar partners" });
  }
  if (isBranchScopedRole(request.user.role)) { /* admin_sede denegado */ ... }
  await attachCountryScope(request, fastify.db);
});
```

**Guard "solo El Templo / super owner" (D-26), hoy:** `ADMIN_ROLES` (`shared/permissions.ts:31` = `["admin","owner"]`; `OWNER_ROLES` `:28`) **más** `assertTenant(request.scope, ...).tenantId === 1`, 403 si no. Constante: declarar `TEMPLO_TENANT_ID = 1` en un módulo compartido (el existente en `app-branch-name.ts:26` no está exportado; el test usa `TENANT_TEMPLO` de `test/fixtures/second-tenant.ts:119`). Cuando se integre con la 182 el guard pasa a `platform_users`: dejar el guard en UNA función (`assertTemploPlatformAdmin`) para que el cambio sea de un solo lugar. `admin_sede` ya queda fuera porque no está en `ADMIN_ROLES`.

**Handler member** (`novedades-routes.ts:185-205` y `:219-236`): `userId` SIEMPRE de `request.user.userId`, nunca de params/body; schema JSON con `additionalProperties: false`:

```typescript
fastify.post<{ Params: { id: number }; Body: NovedadEventBody }>(
  "/me/novedades/:id/event",
  {
    onRequest: [fastify.authenticate],
    schema: {
      ...novedadIdParamsSchema,
      ...novedadEventSchema,
      response: successResponseSchema,
    },
  },
  async (request, reply) => {
    await attachCountryScope(request, fastify.db);
    const ctx = assertTenant(request.scope, "novedades.recordEvent");
    try {
      await service.recordEvent(
        ctx,
        request.user.userId,
        request.params.id,
        request.body.type,
      );
      return { success: true };
    } catch (err: unknown) {
      handleServiceError(err, reply, fastify.log, "novedades.recordEvent");
    }
  },
);
```

**Registro** (`src/app.ts`, patrón `~:262-275`): `await app.register(xRoutes, { prefix: "/api/admin/sponsors" })` y `"/api/members/sponsors"`. **Prefijos nuevos:** NO caen en los 8 prefijos de ISO-03 (ver sección de tests), solo en ISO-01.

---

### `el-templo-api/src/modules/sponsors/schemas.ts` (validación)

**Analogía:** `el-templo-api/src/modules/communications/schemas.ts:595-660`: objetos `{ body: {...} }` / `{ params: {...} }` / `{ response: { 200: {...} } }`, `additionalProperties: false`, tipos TS espejados (`CreateNovedadBody`), el PUT reusa `createXSchema.body.properties` con todas las keys opcionales. Colores `bg_color`/`text_color`: `pattern: "^#[0-9a-fA-F]{6}$"`. **El contraste ≥ 4.5 se valida en el editor (D-19)**; recomendado revalidar también en el server (cálculo trivial, evita guardar combinaciones ilegibles por API).

---

### Límite de activas (D-24) — `system_settings`

**Analogía exacta:** store-urls. `el-templo-api/src/modules/settings/keys.ts:44-49`:

```typescript
export const APP_STORE_SETTINGS_KEYS = {
  android: "app.store_url.android",
  ios: "app.store_url.ios",
} as const;
```

`settings/service.ts:123-141` (privados `getStringValue`/`setStringValue` con `onDuplicateKeyUpdate`) y `:186-215` (`getStoreUrls`/`setStoreUrls` con `BadRequestError`). `settings/routes.ts:202-275`: GET para cualquier staff, PUT con `preHandler` owner-only:

```typescript
preHandler: async (request, reply) => {
  if (!(OWNER_ROLES as readonly string[]).includes(request.user.role)) {
    return reply.code(403).send({ error: "Acceso denegado", message: "Solo el propietario puede cambiar las URLs de tienda" });
  }
},
```

Clave sugerida: `sponsors.max_active_per_country`; fallback 6 cuando falta o no es entero positivo (patrón `getFollowupRetryHours`, `service.ts:~148`). **Manifiesto:** las rutas de store-urls están como `global` con `motivo` (`test/tenant-manifest.ts:~786-791`, "Lee `system_settings` (TENANT_EXEMPT_TABLES)…"): mismo criterio para el GET/PUT del límite si cuelgan de `/api/admin/settings`. Test: `test/referral-partners/store-urls.test.ts` (default-null, put-owner, invalid, 403 coach). Si en cambio el límite va en `tenant_settings` → trampa: agregar el namespace al `KNOWN_KEY_PATTERNS` de `test/migrations/0190-0191-tenants.test.ts:~280-290` y limpiar en cada test que lo siembre (`cleanAllTestData` NO limpia `tenant_settings`).

---

### Subida de logo (D-19)

**Analogía:** `el-templo-api/src/modules/blog/image-service.ts` (URL presignada de R2) y `blog/routes.ts:418-440`:

```typescript
fastify.post<{ Body: UploadImageBody }>(
  "/admin/upload-image",
  { preHandler: [fastify.authenticate], schema: uploadImageSchema },
  async (request, reply) => {
    if (!(OWNER_ROLES as readonly string[]).includes(request.user.role)) {
      return reply
        .status(403)
        .send({ error: "Acceso de administrador requerido" });
    }
    if (!fastify.r2) {
      return reply
        .status(503)
        .send({ error: "Almacenamiento de imagenes no configurado" });
    }
    const imageService = new BlogImageService(
      fastify.r2,
      fastify.r2Bucket,
      request.log,
    );
    return imageService.generateUploadUrl(request.body.filename);
  },
);
```

Limitación: la clave del objeto está **hardcodeada** `blog/images/${Date.now()}-${sanitized}` (`image-service.ts:~41`) y el log dice "Blog image". Cambio mínimo: parámetro opcional `prefix` (default `blog/images`) → `sponsors/logos`. Validar en el schema solo extensiones de imagen (`EXTENSION_MIME_MAP`). La ruta del test (`test/blog/blog.test.ts:347-365`) acepta 200 **o** 503 (R2 no configurado en CI): copiar ese criterio. Manifiesto: la ruta blog es `templo-module`/`templo-marketing`; la nueva de sponsors va con el resto de sponsors.

---

### "Tuvo plan antes" (D-05)

**Handler hoy:** `el-templo-api/src/modules/subscriptions/member-routes.ts:66-79`:

```typescript
fastify.get("/me/subscription", async (request, reply) => {
  const ctx = assertTenant(request.scope, "subscriptions.me");
  const sub = await subscriptionService.getMemberSubscription(ctx, request.user.userId);
  if (!sub) { return reply.code(204).send(); }
```

`getMemberSubscription` (`service.ts:1330-1427`) filtra `active|paused|scheduled`; por eso "venció" → 204 igual que "nunca tuvo". **Lo que falta:** la fila más reciente de `subscriptions` del socio con estado `expired|completed|cancelled|changed` (enum `schema/subscriptions.ts:19-27`): `planName` (join `subscriptionPlans`) + `endDate`. Existe `getMemberSubscriptionHistory(ctx, userId)` (`service.ts:1589`; ya hace `autoExpireSubscriptions` y exige `ctx`) que sirve de base, mapeado por `mapSubscriptionRow`.

**Decisión de diseño para el planner (no implementar sin elegir):** (A) ruta nueva `GET /me/plan-status` bajo `/api/members/subscription` → entra en ISO-01 **y** en ISO-03 subs-sched (`CASOS_BASELINE` 65→66 + describe con 2 `it`, ver Tests); (B) NO tocar `/me/subscription` (204 es contrato de la app vieja); (C) colgar el dato de otra respuesta ya existente. La opción A es la más limpia y la que tiene molde (`/me/especial-pass`, `member-routes.ts:189-258`, `schema: especialPassSchema`). La app consume en `useUserStore.loadSubscription` (`stores/useUserStore.ts:384-408`: `api.get('/members/subscription/me/subscription')`, 204 → `subscription = null`).

**Test:** `test/subscriptions/member-subscription-paquete.test.ts` (INSERT crudo de plan/sub + `GET /me/subscription` con `createTestMember`/`todayStr`); `ME_SUBSCRIPTION_URL = "/api/members/subscription/me/subscription"`. Casos mínimos: nunca tuvo → `hadPlan:false`; venció → `hadPlan:true` + último plan + fecha; plan activo no cambia; socio de otro tenant no ve el plan ajeno.

---

### Novedades + pop-up (D-13)

**Hoy:** `GET /communications/me/prompt` (`communications/routes.ts:~398-420`) → `PromptService.resolvePrompt` (`prompt-service.ts:136-155`): orden fijo plan_expiry → aviso vigente → rating → improvement, corta en el primero. El "aviso vigente" es `resolveAvisoVigente` (`:189-235`): `placement='popup'`, `status='active'`, excluye `ORCHESTRATED_POPUP_CODES`, filtra `withinVigencia` (`startsOn/endsOn`), `matchesScope(candidate, member)` (sede/país/segmento) y `frequencyAllows`. Las novedades (`novedades-service.listForMember`, `:320-358`) leen otra tabla (`novedades`) y su destino ya usa el MISMO shape que los avisos (`resolveDestinationRoute`, `destinations.ts`).

**Opción "una sola fuente" (preferida por D-13):** en `listForMember`, además de las filas de `novedades`, traer los avisos popup activos que matchean el socio (reusar `matchesScope`, `withinVigencia`, `getMemberScopeInfo` → hoy privados/no exportados salvo `matchesScope` en `prompt-service.ts:499`; exportarlos o extraer a un helper compartido), mapearlos a `NovedadMemberItem` (`novedades-service.ts:91-112`: `id`, `text`, `branchLabel`, `publishedAt`, `destination`, `seen`) como primeros del feed y dentro del tope `NOVEDADES_MEMBER_LIMIT = 3` (`:65`). **Cuidado de ids:** un aviso y una novedad pueden compartir `id` → el feed necesita un discriminador (`source: 'aviso'|'novedad'`) y `recordEvent` (`/me/novedades/:id/event`) debe saber a cuál se refiere; "cerrar el pop-up no borra la novedad" implica que las vistas del aviso van a `aviso_events` y las de la novedad a `novedad_views` (no mezclar). **Cuidado de timing:** `resolveAvisoVigente` mira frecuencia por socio (`getLastShownMap`) y la novedad no debería depender de ella.

---

### `getMyBookings` enriquecido (D-03/D-04/D-06)

**Analogía:** `el-templo-api/src/modules/scheduling/booking-service.ts:671-735` y `routes.ts:1520-1531`:

```typescript
fastify.get<{ Querystring: { weekStart: string } }>(
  "/my-bookings",
  { schema: myBookingsSchema },
  async (request) => {
    const ctx = assertTenant(request.scope, "scheduling.myBookings");
    const bookings = await bookingService.getMyBookings(
      ctx,
      request.user.userId,
      request.query.weekStart,
    );
    return { bookings };
  },
);
```

`getMyBookings` hace `select` de `bookings ⋈ users ⋈ schedules ⋈ activities` (sin `branches`); el schema de respuesta `bookingRecordSchema` (`schemas.ts:102-150`) recorta lo no listado. Agregar `branchId`, `branchName`, `branchTimezone` (join a `schema.branches` por `schedules.branchId`; `booking-service.ts:2656` ya lee `schema.branches.timezone`, y `ReservasPage.vue:1210` muestra el uso de `branchTimezone` en el cliente) como campos **aditivos** (la app vieja los ignora). Mantener `status IN ('reservado','qr_escaneado','confirmado','lista_espera','no_show')` (`:718`). El week range es `weekStart` + 5 (lunes-sábado, `:676`): para "fin de semana mirar la semana siguiente" hay que pedir dos semanas desde la app.

**Ventana ±20 min del server** (`attendance/service.ts:~123-156`):

```typescript
const windowMs = 20 * 60 * 1000;
...
          eq(schema.bookings.bookingDate, todayStr),
          eq(schema.bookings.status, "reservado"),
          eq(schema.schedules.branchId, branchId),
...
const matchingBooking = bookingsInRange.find((b) => {
  const classTime = buildClassDateTime(todayStr, b.startTime, tz);
  return Math.abs(now.getTime() - classTime.getTime()) <= windowMs;
});
```

Espejar en la app con un comentario que apunte a este archivo (D-06). Hoy no hay constante exportada: crear `CHECK_IN_WINDOW_MS` en la app y NO duplicar el número suelto.

---

### Manifiesto fail-closed (rutas nuevas)

**Analogía:** `el-templo-api/test/tenant-manifest.ts:955-970` (6 rutas Novedades) y `test/tenancy/iso-01-manifiesto.test.ts:333-347` (`ENTRADAS_BASELINE = 463`, con una línea de historial por cambio):

```typescript
  "GET /api/communications/admin/novedades": { categoria: "tenant-scoped" },
  "POST /api/communications/admin/novedades": { categoria: "tenant-scoped" },
  "GET /api/communications/me/novedades": { categoria: "tenant-scoped" },
  "POST /api/communications/me/novedades/:id/event": { categoria: "tenant-scoped" },
```

Reglas (`tenant-manifest.ts:228-275` y memoria `reference_gates_tenancy_ruta_job_nueva`): clave `"<MÉTODO> <url completa con prefijo>"`; categorías `tenant-scoped` (default), `templo-module` (+`modulo`), `global` (+`motivo` obligatorio, oración completa). **Clasificación sugerida para sponsors:**

- Rutas admin de marcas (leen/escriben `sponsor_brands`, exenta, y requieren tenant 1): `global` con `motivo` ("Lee/escribe `sponsor_brands` (TENANT_EXEMPT_TABLES): catálogo de plataforma sin tenant_id; gateada a admins de El Templo server-side"), mismo estilo que `store-urls` (`:~786-791`).
- Rutas member (escriben `sponsor_views` gym-owned): `tenant-scoped`.
- Rutas del límite en `/api/admin/settings`: `global` con motivo (idem store-urls).
- Bump `ENTRADAS_BASELINE` (+N), título del `it` y comentario de historial. Comunicaciones/sponsors NO son `templo-module` (no llevan `moduleScope`).

---

### Tests de integración API (`el-templo-api/test/sponsors/*.test.ts`)

**Analogía:** `el-templo-api/test/communications/novedades.test.ts` (1259 líneas) — estructura a copiar:

- cabecera con cobertura enumerada (1 CRUD+validaciones, 2 roles, 3 feed del socio, 4 eventos/idempotencia, 5 aislamiento cross-tenant);
- helpers (`:37-139`): `req(method, url, token, payload)` con `app.inject`, tipos de respuesta, `listAdmin`/`listMember`;
- bootstrap (`:204-253`): `createTestApp()`, `getAuthToken(app, "admin@test.com", "adminpass123")` (owner de `test/setup.ts`), sede `TEST`, sede B creada una vez; `beforeEach`: `cleanAllTestData` + `createStaffUser({ role: "coach", ... })`; `afterAll`: `limpiarSegundoGimnasio`;
- `insertNovedad(over, ctx)` (`:167-179`) que inserta directo con `tenantValues(ctx, {...})`; socio con `createTestMember(app, { branchId })` (devuelve `id` y `token`) — **nunca hardcodear ids de `users`**;
- consultas de verificación con `tenantWhere(tabla, CTX_TEMPLO)` (sentinel en tests de módulos strict: `const CTX_TEMPLO = { tenantId: TENANT_TEMPLO }` de `test/fixtures/second-tenant.ts`).

Casos obligatorios de la 199: admin de **tenant 2** (`createStaffUser({ tenantId: TENANT_DOS, role: "admin" })`, ver `second-tenant.ts:178` `seedSecondTenant`) → 403 en todo el CRUD de marcas; coach/socio 403, sin token 401; límite 6/país (activar la 7ª → 400; otro país no cuenta); vigencia desde/hasta con fecha en zona de sede; país AR vs ES; evento idempotente + 404 si la marca no es visible; métricas por marca; que el socio de tenant 2 no genere filas visibles en las métricas de El Templo; logo 200 **o** 503.

**ISO-03 (solo si la ruta "tuvo plan" cuelga de `/api/members/subscription`):** `test/tenancy/iso-03-subs-lecturas.test.ts:773-830` — un `describe` con la clave exacta `"GET /api/members/subscription/me/especial-pass"` y DOS `it` (aislamiento + control positivo del dueño); bump `CASOS_BASELINE` (65) y el título "cubre exactamente las N rutas" en `iso-03-cobertura-subs-sched.test.ts`.

---

### `el-templo-app/src/modules/progression/pages/MiTemplo.vue` (page)

**Analogía:** el propio archivo (646 líneas). Orden actual del template (`:12-143`): PermissionBanner → NovedadesCard → carrusel premium (dots) → ProgramProgressCard → "Registro del día" (fila con flechas) → bloque `cardOrder` (RestDay/SessionCta/`BookingStatusCard :has-booking="false"` en `:115`) → WeeklySummaryCard → Mi Árbol (flag) → GeneralContent (RPE + evaluación) → DailyQuote. **Reordenar a**: saludo (layout) → TodayCard → NovedadesCard → registro → patrocinadores → Tu semana → Para vos → frase (D-02).

**Datos que ya trae la página** (`:196-364`) y se reutilizan: `useWeekData()` (`sessions` por fecha; `completedDates` está en el composable pero MiTemplo no lo desestructura — agregarlo para Tu semana), `todayRouteName` con `getRouteName` (`:241-246`), `isRestDay`/`showRestDay` (`:248-262`), `checkInMessage` (`:317-343`, mensaje de D-03 ya calculado), `programProgress` (`:204`), `userStore.hasActiveSubscription`, `userStore.profile?.branchIsVirtual`.

**Trampa D-04:** `todayStr` (`:236-239`) y `currentWeekDates()` (`:355-368`) usan `new Date()` del teléfono, y `isRestDay` usa `d.getDay()` local. Reemplazar por `todayInTz(tz)`/`dowInTz(tz)` de `el-templo-app/src/utils/tz.ts:48-62`:

```typescript
export function todayInTz(tz: string, now: Date = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: tz });
}
export function dowInTz(tz: string, now: Date = new Date()): number {
  /* 1=Lun..7=Dom por aritmética UTC, sin strings de locale */
}
```

y `zonedWallClockToUtc(dateStr, timeStr, tz)` (`:15`) para el instante de la clase. La zona sale del booking enriquecido (hallazgo 4); hasta que cargue, mismo default que ReservasPage (`ReservasPage.vue:1084-1089`, AR). Test con fechas fijas: `now` inyectado como en `utils/relative-days.ts`.

**Estado de carga:** hoy todo depende de `progressionStore.loading` (`:4`). No empeorar: los datos nuevos (bookings, patrocinadores, novedades, plan-status) cargan fail-open sin bloquear (patrón `void novedadesStore.load()` en `onMounted`, `:376`). `onMounted` (`:368-396`) es el punto único de carga.

**Registro del día** (`orderedCheckIns` `:279-288`, `handleCheckInSubmit` `:345-351`): conservar el orden "soreness primero, resto rota por día". **Trampa para D-07:** `soreness` con `leve|moderada` abre un selector de zona del cuerpo (`needsBodyArea`, `BODY_AREA_OPTIONS`, `types.ts:153,168-174`); el "1 de 3" compacto debe contemplar ese paso, y `submitCheckIn(type, value, bodyArea?)` lo exige.

---

### `TodayCard.vue` (component) — card de hoy A'

**Analogías a fusionar:** `SessionCtaCard.vue` (props `todayCompleted`, `todaySession`, `routeName`, `checkInMessage`; `handleClick` → `router.push({ name: 'session-summary' })` si completó, `'/training'` si no, `:48-59`), `BookingStatusCard.vue:36-60` (reloj interno cada 60 s con limpieza) y `RestDayCard.vue`. Estructura SFC del repo: `<script setup lang="ts">` con `defineProps<{...}>()`, estilos `scoped lang="scss"` con `@import 'src/css/quasar.variables.scss'`. **Contraste (D-15):** estas cards hoy usan `rgba($primary, .2)` y texto con opacidad; A' usa colores sólidos de `199-UI-SPEC.md` (tokens `ink #2c2318`, `cream-ink #f0e6d6`, `kick-dark #e3c9a8`). Ningún `rgba(...)` en `color:` de texto.

**Reloj para "Tu clase empieza en N min":** reutilizar el patrón de `BookingStatusCard` (intervalo + `onUnmounted` que limpia, `:36-60`) — **pero** las reglas del repo piden composables con `cleanup()` y sin `onUnmounted` adentro: si se extrae a composable (`useNow`/`useCheckInWindow`), exponer `cleanup()` y llamarlo desde el `onUnmounted` del componente.

---

### `SponsorsCarousel.vue` (component, event-driven)

**Analogía:** `el-templo-app/src/modules/progression/components/NovedadesCard.vue:80-255` — mismo comportamiento (auto-avance, pausa, swipe, barra de progreso, visibilidad de página, `markSeen`). Excerpts clave:

Constantes y tipos (`:84-93`):

```typescript
const ROTATE_MS = 4500; // → SPONSOR_ADVANCE_MS = 2000, constante FÁCIL DE CAMBIAR (D-23, decidir 2 s/4 s en UAT)
const SWIPE_MIN_PX = 40;
const TAP_SLOP_PX = 8;
```

Timer reiniciado por cualquier cambio de estado (`:156-172`):

```typescript
const touching = ref(false);
const running = computed(
  () => items.value.length > 1 && pageVisible.value && !touching.value,
);
let timer: ReturnType<typeof setTimeout> | null = null;
watch(
  [running, current, () => items.value.length],
  () => {
    clearTimer();
    if (!running.value) return;
    timer = setTimeout(() => goTo(current.value + 1, "up"), ROTATE_MS);
  },
  { immediate: true },
);
```

Pausa con el dedo + swipe + tap-vs-swipe (`:174-217`); visibilidad (`:131-140`); "visto" una vez por sesión cuando el slide activo está en pantalla (`:142-149`). **Diferencias para la 199:** pausa de 3 s al tocar y _retoma_ (NovedadesCard retoma al soltar), `prefers-reduced-motion` ⇒ sin auto-avance (en NovedadesCard el media query solo apaga animaciones, `:500`; acá debe además parar el timer, p. ej. `window.matchMedia('(prefers-reduced-motion: reduce)')`), snap con `scroll-padding-inline: 16px` (scroll nativo por `scroll-snap` en vez de `Transition`), marca "vista" = `first_seen_at` cuando la card está activa. Sanitización: texto con `{{ }}`, **prohibido `v-html`** (comentario de `NovedadesCard.vue:1-10`).

**Limpieza:** NovedadesCard usa `onMounted/onUnmounted` en el componente (`:246-255`), permitido; los timers/listeners propios van en un composable solo si exponen `cleanup()`.

---

### `SponsorSheet.vue` (component) y carnet

**Analogía de estructura:** `el-templo-app/src/components/ActivityInfoSheet.vue`:

```vue
<q-dialog :model-value="modelValue" position="bottom" @update:model-value="onUpdateModelValue">
  <q-card class="activity-info-sheet">
    <div class="activity-info-sheet__handle" />
    <q-card-section class="activity-info-sheet__body">
      <h3 class="activity-info-sheet__title">{{ title }}</h3>
      <p v-if="description" class="activity-info-sheet__text">{{ description }}</p>
```

Props `modelValue: boolean` + `emit('update:modelValue', ...)`. Su estilo es **oscuro** (`$charcoal`, `rgba($cream, .85)` en el texto — justo lo que D-15 prohíbe), así que copiar la estructura y NO los tokens: hoja blanca, radio 20 arriba, texto `#2c2318`/`#6b6459` sólidos (UI-SPEC). El carnet (pantalla completa `ink`, hora en vivo con segundos) puede ser un `q-dialog maximized` con intervalo de 1 s; usar `Intl.DateTimeFormat` con `timeZone` de la sede, nunca `new Date().getHours()`. Copiar al portapapeles: buscar el precedente existente antes de inventar (no verificado acá).

---

### `stores/useSponsorsStore.ts` (store, Pinia setup)

**Analogía exacta:** `el-templo-app/src/stores/useNovedadesStore.ts` (Pinia `defineStore('x', () => {...})` con `ref`s, no options API):

```typescript
const log = createLogger('useNovedadesStore')
export const useNovedadesStore = defineStore('novedades', () => {
  const novedades = ref<Novedad[]>([])
  const loading = ref(false)
  const reportedSeen = new Set<number>()
  let generation = 0   // descarta respuestas viejas (logout a mitad de request)

  async function load(): Promise<void> {
    const mine = ++generation
    loading.value = true
    try {
      const { data } = await api.get<NovedadesResponse>('/communications/me/novedades')
      if (mine !== generation) return
      novedades.value = Array.isArray(data?.novedades) ? data.novedades : []
    } catch (err: unknown) {
      if (mine !== generation) return
      novedades.value = []
      log.warn('Failed to load novedades', { error: err instanceof Error ? err.message : String(err) })
    } finally { if (mine === generation) loading.value = false }
  }
  ...
  function reset(): void { generation++; novedades.value = []; loading.value = false; reportedSeen.clear() }
```

`markSeen` optimista con `Set` de dedupe por sesión y rollback si el POST falla (`:69-77`); `markClicked` (`:80-84`). **Para la 199:** eventos `seen`/`tapped`/`redeem`, fail-open (D-25). **Registrar el `reset()` en el logout** junto a `novedadesStore.reset()` y `avisosStore.reset()` en `layouts/MainLayout.vue:~249-259` (el `watch` de `authStore.isAuthenticated`). Test: `stores/__tests__/novedades-store.test.ts` (mock de `src/utils/logger` y `src/boot/axios` con `vi.hoisted`, `setActivePinia(createPinia())`, `mockReset` en `beforeEach`).

---

### `MainLayout.vue` — `.app-bg`, FAB, saludo, tab bar (mod)

- **`.app-bg`** (`layouts/MainLayout.vue:403-413`, template `:143`): `position: fixed; z-index: 0; opacity: 0.08;` y va **después** de `q-page-container` en el DOM, por eso se pinta encima. Pasarlo antes del `q-page-container`/`z-index` negativo, **y** quitar el fondo opaco: `.q-page { background-color: $brand-cream }` (`css/app.scss:119-121`), `.q-card { background-color: $brand-cream }` (`:124-127`) y `body { ...!important }` (`:113-115`). Verificar las 6 pantallas pedidas (Mi Templo, Entrenar, Reservas, Planes, Guía, Perfil) — el cambio es GLOBAL.
- **FAB** (`:110-120`, `showCheckInFab` `:312-318`): hoy

```typescript
const showCheckInFab = computed(() => {
  if (!authStore.isAuthenticated) return false;
  if (!userStore.profile) return false;
  if (userStore.profile.branchIsVirtual) return false;
  if (!userStore.hasActiveSubscription) return false;
  return route.path === "/mi-templo" || route.path === "/reservas";
});
```

Agregar la condición de ventana (reserva `reservado` hoy dentro de ±20 min en la zona de la sede) y pasar a botón extendido (`q-btn` con ícono QR + label "Marcar asistencia"; `fab` ya está; Quasar usa la prop `fab` + `label` para el extendido). Estilos del FAB `:767-776` (`bottom: calc(56px + env(safe-area-inset-bottom) + 16px)`). **Acople:** `watch(showCheckInFab, ...)` (`:~337-352`) dispara el globo de primer uso `qr-checkin` (`useTipsSeenStorage`): al hacer el FAB condicional, el tip aparecerá recién la primera vez que entre en ventana — revisar que sigue teniendo sentido. El estado de la ventana se necesita en el layout Y en Mi Templo → extraer a un store o composable compartido (`useCheckInWindow`, con `cleanup()`), no duplicar la consulta de `my-bookings`.

- **Saludo** (`.mobile-greeting` `:526-530`, `header-greeting__date` `:101`) y **tab bar** (`.mobile-tab { color: rgba(white, 0.6) }`, `:~727`; `:deep(.q-icon img) { opacity: 0.6 }` `:~752`): pasar a color sólido `#f2ede5` (UI-SPEC) también en los íconos `img:` (la opacidad de la imagen está pensada como "color con alpha", `:~748-756`); "ALFA" ≥ 10 px (D-15).
- **Marcador de staging** (`css/app.scss:209-221`, `body.staging-env`) pinta `#1565c0` en `.header-greeting`: no tocar, pero capturas "después" en staging mostrarán azul en el saludo.

---

### `CheckInCard.vue` / panel "1 de 3" (component)

**Analogía:** `CheckInCard.vue` (268 líneas) y `types.ts:132-166` (`CHECK_IN_QUESTIONS`: energy, soreness, sleep con `options[{label,value}]`, `needsBodyArea`). Estado completado re-editable (`:6-16`), selector de zona (`:42-62`), `submitting`. Botones hoy `dense rounded` con `q-btn outline` (`:25-38`) → pasar a ≥ 44 px de alto (D-07) y borde 1.5 `terra`. Colapsado ("✓ Registro del día · Energía normal · …") se deriva de `progressionStore.checkInState?.answers[type]` (mismo origen que `checkInMessage`, `MiTemplo.vue:317-343`).

---

### "Tu semana" (D-09)

**Analogía de datos:** `WeeklySummaryCard.vue:1-60` (props `loading`/`error`/`summary: WeeklySummary`/`totalSessions`; esqueleto de carga `q-skeleton`, estado de error "No pudimos cargar tus datos") y `useWeekData.ts` (`completedDates: Ref<string[]>` desde `GET /sessions/weekly`, `:97-108`). `WeeklySummary` (`types.ts:51-58`) trae `sessionsCompleted`, `weekStart`, `weekEnd`. Los 7 puntos L–D se derivan de `completedDates` + `weekStart` y "hoy" con `todayInTz` (no del teléfono). Sacar `RPE prom` y `RpeTrendChart` (`GeneralContent.vue:2-14`): mantener solo el bloque `EvaluationRequest` (`:16-23`) bajo gate `eligible`/`pendingRequest`.

---

### Frases del día (D-12)

**Fuente a copiar:** `el-templo-admin/src/utils/pdf/quotes.ts` — tipos `QuoteSegment {text; gold?}` / `SessionQuote {segments; author}` (`:21-29`), `QUOTES` vigente (`:64`, 10 frases; **no** `RETIRED_QUOTES` `:140`) y `rotationIndex(step, n)` (`:56-61`, permutación determinística por hash):

```typescript
function quoteHash(x: number): number {
  let h = Math.imul((x | 0) + 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}
export function rotationIndex(step: number, n: number): number {
  /* order = idxs ordenados por quoteHash; order[((floor(step) % n) + n) % n] */
}
```

Las comillas van como escapes `“`/`”`; el espaciado entre tramos viaja en el propio `text`. **Destino:** `el-templo-app/src/modules/training/data/quotes.ts` (hoy tipo `Quote {text; goldText; author}`, `getQuoteForBlock(blockIndex, dayOffset)` `:85-88`, comentario "same structure as the PDF builder's QUOTES").

**Consumidores (6):** `DailyQuote.vue:14-30` (rotación por día del año; une `text + goldText` y le quita comillas), `SplashScreen.vue:47,70-79` (hash del string del día), `training/pages/DayPlayer.vue:114-115,160,198,439` y `goal-plan/pages/GoalPlanSession.vue:113-114,138,188,303,313` (`getQuoteForBlock`, estado `ref<Quote>({ text: '', goldText: '', author: '' })`), y los componentes receptores `training/components/player/TransitionScreen.vue:22,51` y `CelebrationScreen.vue:17,42` (`quote: { text: string; goldText: string; author: string }`). **Decisión para el planner:** o se migra todo a `segments[]` (toca los 6) o se mantiene `Quote` + función adaptadora `segmentsToQuote()` para los reproductores y se usa `segments` solo en `DailyQuote`. La segunda es la que minimiza riesgo en el reproductor de sesión.

**Fuentes:** `css/app.scss:9-17` importa `@fontsource/*` (montserrat 300/600/700/800, geologica, cormorant). `@fontsource/cinzel` está en `el-templo-app/package.json` pero **no se importa en ningún lado** del app: `GuiaPage.vue:372-381` declara su propio `@font-face 'Cinzel'` con TTF locales (`assets/fonts/Cinzel-Regular.ttf`, `Cinzel-Bold.ttf`). Para la frase: `@import '@fontsource/cinzel/700.css'` (o reusar el `@font-face` local) y sumar `@fontsource/nunito-sans/700.css` (única dependencia nueva aprobada; instalar la lleva el humano/ejecutor autorizado, no el mapper).

**Animación palabra por palabra** (IntersectionObserver): no hay precedente de `IntersectionObserver` en el app (grep vacío) → ver "Sin analogía". El respeto a `prefers-reduced-motion` sí tiene molde: `@media (prefers-reduced-motion: reduce)` en `NovedadesCard.vue:500`, `ImprovementCtaCard.vue:307`, `ProgramCtaCard.vue:348`.

---

### "Para vos" (D-10) y destinos

**Analogías:** el carrusel actual de `MiTemplo.vue:20-60` (`.premium-carousel` con dots dinámicos `premiumSlideCount`, `:223-240`) y `AvisoCard.vue` (props `avisoId`, `title`, `body`, `buttonText`, `destination`; 322 líneas), `ImprovementCtaCard.vue`, `ReferralCtaCard.vue`, `UpsellBadge.vue`, `ProgramCtaCard.vue`. Slides nuevos: Invitaciones (`ReferralCtaCard`), Presencial (`UpsellBadge`, solo virtuales, `showUpsellBadge` `:253-255`), Planes Personalizados (`showProgramCta` `:228`), libres `avisosStore.tarjetasLibres`. **Sale** `ImprovementCtaCard` del carrusel (D-11). Destinos: `utils/aviso-navigation.ts` (`navigateToAvisoDestination(router, destination)`) y `config/destinations.ts:55` (`route: '/proponer-mejora'`). Sin dots: scroll con snap + `scroll-padding-inline: 16px`. Quitar CTA dorados `#c4956a/#a07850` (D-15).

### Perfil — "Proponer una mejora" (D-11)

**Analogía:** `pages/ProfilePage.vue:84-95` (entrada "Mis invitados"):

```vue
<div
  class="settings-card__item settings-card__item--clickable"
  @click="$router.push('/mis-invitados')"
>
  <q-icon name="card_giftcard" size="22px" color="primary" />
  <span class="settings-card__label">Mis invitados</span>
  <q-icon name="chevron_right" size="20px" color="grey-5" class="settings-card__chevron" />
</div>
<div class="settings-card__divider" />
```

Ruta existente: `router/routes.ts:114-118` (`path: 'proponer-mejora'`, `name: 'proponer-mejora'`, `pages/ProponerMejoraPage.vue`). El pop-up `improvement_prompt` ya existe (`MainLayout.vue:~178`, `ImprovementPromptDialog`).

---

### Estado de plan en la app ("nunca tuvo" / "venció")

**Analogía:** `stores/useUserStore.ts:384-408` (`loadSubscription`: `api.get<MemberSubscription>('/members/subscription/me/subscription')`, `204 → subscription = null`, `catch {}` → null) y `:225-227` (`hasActiveSubscription`: `active|paused`). El tipo `MemberSubscription` (`:58-70`) ya trae `planName`/`endDate`. Cargado al boot en `boot/auth.ts:153`. `UserProfile` (`:27-56`) trae `branchCountry`, `branchName`, `firstName/lastName` (para saludo, carnet y "Te extrañamos, {nombre}"). **Trampa:** `branchDisplayName` (`:~221`) transforma "El Templo X" → "Sede X"; el carnet y "Hoy en {sede}" deben elegir cuál usar.

---

### Admin — `PartnersPage.vue` + tab Patrocinadores (D-26)

**Analogía:** `el-templo-admin/src/pages/PartnersPage.vue` (524 líneas). Tabs (`:43-56`):

```vue
<q-tabs v-model="activeTab" dense align="left" class="q-mb-md" active-color="primary" indicator-color="primary">
  <q-tab name="partners" label="Partners" />
  <q-tab name="conversiones" label="Conversiones" />
  <q-tab name="liquidacion" label="Liquidación" />
</q-tabs>
<q-tab-panels v-model="activeTab" animated>
  <q-tab-panel name="partners"> ...
```

`activeTab = ref('partners')` (`:~311`). **Cuidado:** arriba de las pestañas hay filtros globales de País (solo owner) y Sucursal (`:9-40`) que afectan a Partners/Conversiones/Liquidación; el tab de Patrocinadores es de **plataforma** (ni sede ni país del filtro): ocultar o ignorar esos filtros en ese tab. Atajo "Crear card para Mi Templo": acción nueva en la columna `#body-cell-acciones` (`:119-140`, botones `edit` y `qr_code` con `q-tooltip`) que abre el editor de sponsors precargado con `partner.name`/`contactName`/`contactPhone` (campos de `PartnerListItem`, `usePartnersApi.ts:40-60`). Gating de visibilidad: `PARTNERS_ROLES` en `router/routes.ts:~175-178` (`meta: { allowedRoles }`) y `config/templo-config.ts:~393-399`; la regla es "el nav solo oculta, el gate real es la API" (comentario `routes.ts:172-174`) — el tab nuevo necesita su propio gate de rol en el template (owner/admin de El Templo) además del de la API.

### Admin — lista ordenable (D-26)

**Analogía:** `components/comunicaciones/TarjetasTab.vue:221-255` — orden por flechas subir/bajar que **intercambian `sortOrder`** entre vecinos, no drag & drop:

```typescript
async function move(row: AvisoRow, direction: 'up' | 'down'): Promise<void> {
  const idx = orderedTarjetas.value.findIndex((t) => t.id === row.id);
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
  ...
  reorderingId.value = current.id;
  try {
    await Promise.all([
      commsApi.updateAviso(current.id, { sortOrder: neighbor.sortOrder }),
      commsApi.updateAviso(neighbor.id, { sortOrder: current.sortOrder }),
    ]);
    emit('reload');
  } catch (err: unknown) { ... $q.notify({ type: 'negative', message }); } finally { reorderingId.value = null; }
}
```

(botones `arrow_upward`/`arrow_downward` con `:disable="!canMoveUp(row) || reorderingId !== null"`, `:82-93`). El orden de las marcas es por país → los swaps deben hacerse dentro del mismo grupo/país (como TarjetasTab agrupa).

### Admin — editor con vista previa en vivo (D-26)

**Analogía exacta:** `components/comunicaciones/NovedadEditorDialog.vue` (440 líneas) + `NovedadPreview.vue` (262 líneas).

- `q-dialog persistent` con `v-model="localOpen"` (computed get/set sobre `props.modelValue` + `emit('update:modelValue')`), `<q-card style="min-width: 480px; max-width: 640px">`, cuerpo scrollable `max-height: 70vh`, acciones `Cancelar`/`Guardar` con `:loading="saving"` y `:disable="!canSave"` (`:42-137`).
- Form `reactive({...})`, `resetForm()` en `watch(() => props.modelValue, open => open && resetForm())` (`:231-247`).
- **Semántica PUT parcial:** "al editar se manda solo lo que cambió" y no se hace request si no cambió nada (header `:14-21`).
- Vista previa viva como componente de solo lectura que recibe un item computado: `<NovedadPreview :items="[previewItem]" :show-new="true" />` (`:67`), con `previewItem = computed<NovedadPreviewItem>(...)` (`:300-318`). `NovedadPreview.vue` replica el CSS de la card de la app (réplica visual, sin auto-rotación) — mismo criterio para `SponsorCardPreview` (ancho de celular, colores de marca del form) y `SponsorSheetPreview`. Texto con `{{ }}`, **prohibido `v-html`** (comentario `:9-11`).
- Errores: `createLogger('NovedadEditorDialog')`, `extractError(err, 'fallback')` de `src/utils/extract-error`, `$q.notify({ type: 'negative', message })`, `catch (err: unknown)`.
- **Validación de contraste ≥ 4.5 (D-19):** sin precedente → ver "Sin analogía". Mostrar el ratio en vivo y bloquear `canSave` (patrón `canSave` computed, `:353-359`).

### Admin — API composable

**Analogía:** `composables/usePartnersApi.ts:203-250` (`useXApi()` con `loading`/`error` refs, `extractError`, `throw err`, `finally`) y `composables/useCommunicationsApi.ts:634-690` (CRUD de novedades: `api.get<{ novedades: AdminNovedad[] }>('/communications/admin/novedades')`, `api.post`, `api.put`, tipos `AdminNovedad`/`CreateNovedadInput`/`UpdateNovedadInput = Partial<...>` en `:250-289`). Los tipos espejan el schema del API (comentario "Espeja ... del API").

### Admin — uploader de logo

**Analogía:** `composables/useBlogImageUpload.ts` completo (3 pasos: `POST` pide URL presignada → `axios.put(uploadUrl, file, { headers: { 'Content-Type': file.type } })` → devuelve `publicUrl`; `uploading` ref; `createLogger`; `catch (err: unknown)`):

```typescript
const { data } = await api.post<UploadResponse>("/blog/admin/upload-image", {
  filename: file.name,
});
await axios.put(data.uploadUrl, file, {
  headers: { "Content-Type": file.type || "image/jpeg" },
});
return data.publicUrl;
```

UI de input de archivo: `pages/BlogEditorPage.vue:84,191` (`type="file"` oculto + botón) o `components/MemberPhotoUpload.vue:40` (`<input ref type="file" accept="image/*" style="display:none">`). Para sponsors: parametrizar la URL de la ruta (`/admin/sponsors/logo-upload-url` o similar) en una versión genérica del composable en vez de copiar el archivo.

**Tests admin:** el admin **no tiene vitest** (memoria `project_...` y `package.json` sin script `test`); `utils/__tests__/*.test.ts` existen pero no hay runner configurado. Los helpers puros del admin (contraste, form) se verifican por typecheck/eslint y recorrido manual en el UAT (`vue-tsc` ≤ 21, eslint 0 errores).

---

## Patrones compartidos

### Aislamiento por tenant (todos los services/routes de API)

**Fuente:** `el-templo-api/src/modules/shared/tenant.ts` (`assertTenant`, `tenantWhere`, `tenantValues`, `forEachActiveTenant`).
**Aplicar a:** todo acceso a tablas gym-owned (`sponsor_views`, `users`, `branches`, `subscriptions`, `referral_partners`).

```typescript
await attachCountryScope(request, fastify.db);
const ctx = assertTenant(request.scope, "sponsors.listForMember");   // 403 TENANT_UNRESOLVED si null
.where(and(tenantWhere(users, ctx), eq(users.id, userId)))            // PRIMER término del WHERE
.values(tenantValues(ctx, { ... }))                                   // todo INSERT gym-owned
```

Un id de otro tenant → `NotFoundError` (404), nunca 403 (T-175-03). Los lookups por PK también con `tenantWhere`. `userId` solo de `request.user.userId`.

### Manejo de errores API

**Fuente:** `el-templo-api/src/modules/shared/error-handler.ts` (`handleServiceError`) + `shared/errors.ts` (`BadRequestError`, `NotFoundError`).

```typescript
try { ... } catch (err: unknown) { handleServiceError(err, reply, fastify.log, "novedades.create"); }
```

Logging con `request.log`/`fastify.log` (Pino), nunca `console.*`.

### Logging y errores en el front

**Fuente:** `el-templo-app/src/utils/logger.ts` y `el-templo-admin/src/utils/logger.ts` (`createLogger('Contexto')`; `.error()` manda a Sentry).

```typescript
const log = createLogger('useNovedadesStore')
} catch (err: unknown) { log.warn('Failed to ...', { error: err instanceof Error ? err.message : String(err) }) }
```

Sin `any`; `unknown` + `instanceof Error`.

### Composables con `cleanup()` y sin `onUnmounted`

**Fuente:** `el-templo-app/src/composables/useSchedulingApi.ts:~211-214` (`cleanup()` aborta el `AbortController`) y `useAttendanceApi.ts` (`cleanup()` vacío explícito). Cualquier composable nuevo con timers/listeners (reloj del carnet, ventana de check-in) expone `cleanup()`; el `onUnmounted` vive en el componente que lo usa.

### Pinia setup stores

**Fuente:** `stores/useNovedadesStore.ts` / `stores/useAvisosStore.ts` (`defineStore('id', () => {...})`, `return {...}`; `generation` para descartar respuestas viejas; `reset()` en logout desde `MainLayout.vue`).

### Eventos de métricas fail-open

**Fuente:** `useNovedadesStore.reportEvent` (`:56-68`: captura el error, `log.warn`, devuelve `false`, nunca lanza) + `recordEvent` idempotente del servicio. Nunca bloquear la UI por una métrica.

### Texto del usuario/admin sin HTML

**Fuente:** `NovedadesCard.vue:1-10`, `NovedadPreview.vue:9-11`, `ActivityInfoSheet.vue:9-10`. Interpolación `{{ }}`; **prohibido `v-html`**.

### Zona horaria de sede (nunca la del teléfono ni UTC)

**API:** `todayInTz(tz)` y `DEFAULT_TENANT_TIMEZONE` de `src/modules/shared/date-utils.ts:~26`; la sede trae `branches.timezone`.
**App:** `src/utils/tz.ts:15-62` (`zonedWallClockToUtc`, `todayInTz`, `dowInTz`, `isWallClockPast`) con `now` inyectable para tests de fecha fija. Memoria `reference_test_shifts_utc_vs_tz_sede`: UTC vs `todayInTz(sede)` rompe de noche; `reference_fake_timers_salto_relativo`: saltos relativos a `Date.now()`.

### Contraste y color (UI)

**Fuente:** `199-UI-SPEC.md` (tokens) y `css/quasar.variables.scss` (`$primary #96593a`, `$secondary`, `$accent`, `$info #6b6459`, `$cream`, `$positive`). Cero `rgba(..., <1)` en `color:` de texto; sin dorado en CTA.

### Reglas duras de verificación (de CLAUDE.md + CONTEXT)

API `npx tsc --noEmit` = 0, `pnpm lint:tenant` limpio; app `npx vue-tsc --noEmit` ≤ 18; admin ≤ 21; eslint sin errores; tests solo en CI; `git add` explícito; sin bump de versión; cada ruta nueva con test de integración; `.env.example` si hay env var nueva.

---

## Sin analogía

| Archivo                                                                  | Rol        | Flujo            | Motivo                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------ | ---------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Animación palabra por palabra con `IntersectionObserver` (frase del día) | component  | event-driven     | No hay uso de `IntersectionObserver` en `el-templo-app/src` (grep vacío). Usar RESEARCH/sketch 005 (`.planning/sketches/005-mi-templo-jerarquia/index.html`) y el patrón `prefers-reduced-motion` de `NovedadesCard.vue:500`. Observer creado/desconectado en un composable con `cleanup()`.                                                                                                    |
| `el-templo-admin/src/utils/contrast.ts` (ratio WCAG ≥ 4.5 en el editor)  | util       | transform        | Ningún helper de contraste en admin/app (solo paletas fijas en `quasar.variables.scss`). Fórmula WCAG 2.x (luminancia relativa sRGB); la lógica de referencia vive fuera del repo en `.docs/mi-templo-rediseno/herramientas/contrast.py` (medición sobre capturas, no el mismo cálculo). Sin runner de tests en admin: cubrir con revisión manual. Replicar la validación en el schema del API. |
| Copiar código al portapapeles + hoja con candado "Activá tu plan"        | UI         | event-driven     | No verificado un precedente de `navigator.clipboard`/`copyToClipboard` de Quasar en el app; buscar antes de implementar. El destino "Activá tu plan" sí tiene molde en `config/destinations.ts` / `utils/aviso-navigation.ts`.                                                                                                                                                                  |
| Configuración de plataforma con rol "super owner"                        | middleware | request-response | No existe en la base (hallazgo 1). Usar `ADMIN_ROLES` + `tenantId === 1` concentrado en una función. Se rehace al integrar la 182.                                                                                                                                                                                                                                                              |

---

## Metadatos

**Alcance de búsqueda de analogías:** `el-templo-api/src/{db,modules/{communications,subscriptions,settings,scheduling,attendance,blog,referral-partners,shared}}`, `el-templo-api/test/{communications,subscriptions,referral-partners,tenancy,db,migrations,fixtures,blog}`, `el-templo-app/src/{layouts,pages,stores,composables,utils,css,router,modules/{progression,training,goal-plan}}`, `el-templo-admin/src/{pages,components/{comunicaciones,partners},composables,utils,router,config}`; contraste con `feat/v6.1-gimnasio` solo para ver cómo la 182 declara tablas de plataforma.
**Archivos escaneados/leídos:** ~70
**Fecha de extracción:** 2026-10-15
