# Phase 213: Estiramiento post-clase - Pattern Map

**Mapeado:** 2026-11-11
**Worktree:** `/home/franco/projects/et-estiramiento` (HEAD `81e8199ad`, base origin/master `bc231c4de`)
**Archivos analizados:** 38 (nuevos y modificados)
**Análogos encontrados:** 34 / 38 (4 sin análogo directo, ver "Sin análogo")

Rutas relativas a `el-templo-api/` (API), `el-templo-app/src/` (APP) y `el-templo-admin/src/` (ADM) salvo que se indique otra cosa. Todos los `archivo:línea` están verificados en este worktree.

---

## 0. Hallazgos que cambian o precisan el plan (leer primero)

### H-1. D-12 (deep link por `route` de la plantilla) NO funciona tal como está escrito

Tres hechos verificados en el código:

1. `TEMPLATE_SEEDS` se siembra con `destination_type='app_section'` y `destination_section = appSectionForRoute(seed.route)` (`src/modules/notifications/service.ts:1026-1030`). `appSectionForRoute` solo conoce 5 rutas y todo lo demás cae a `mi_templo` (`src/modules/communications/destinations.ts:180-195`). Una plantilla con `route: "/training/estirar?from=push"` nace con `destination_section='mi_templo'`.
2. En la app, `resolveTapRoute` da prioridad al destino curado sobre `route` (`APP:boot/push-notifications.ts:21-40`): si `destination === 'app_section'` y la sección es conocida, devuelve la ruta de esa sección y **nunca mira `route`**. El push del estiramiento abriría Mi Templo.
3. El editor de Comunicaciones manda **siempre** `destination: form.destination` al guardar una plantilla de sistema (`ADM:components/comunicaciones/PushRuleEditorDialog.vue:688-693`), y el PUT sobrescribe `route` con `fallbackRouteFor(destination)` (`src/modules/notifications/routes.ts:709-722`). Aunque se arreglara el seed, el primer retoque de texto desde el admin (el caso de uso que pidió Franco) pisaría el deep link.

**Precedente para resolverlo (decisión de planificación, D-12 opción B):** sumar una sección curada, como se hizo con `conquer` en la fase 201 D-11. Archivos a tocar (todos con precedente `conquer`):
- `src/modules/communications/destinations.ts`: tipo `AppSectionKey` (`:45`), entrada en `APP_SECTIONS` (`:119-123`), `case` en `appSectionForRoute` (`:190-191`).
- Espejos: `APP:config/destinations.ts` (`:20`, `:85-88`) y `ADM:config/destinations.ts`.
- `test/communications/destinations-sync.test.ts:63-72`: los tres `toHaveLength(10)` pasan a 11 y el comentario `:43` suma la línea de la 213.
- `test/communications/destinations.test.ts:28-31,100`: casos del `conquer` como modelo.
- `APP:boot/__tests__/push-destination.test.ts`: un caso `resolveTapRoute({ destination:'app_section', destinationSection:'estirar' })`.

Si el planificador prefiere no sumar sección, la alternativa es sembrar `destination_section` en NULL, pero entonces `PushRuleEditorDialog` carga NULL y el guardado falla con 400 (bug ya corregido en 2026-09-24, ver comentario `destinations.ts:166-179`). No recomendada.

### H-2. `queueNotification` devuelve `-1` sin decir por qué

Plantilla inexistente, plantilla apagada, categoría apagada y sin token devuelven todos `-1` (`src/modules/notifications/service.ts:380-444`). D-11 exige guardar el motivo en `stretch_offers.push_decision`. El módulo de push tiene que **pre-chequear** cada condición antes de llamar a `queueNotification` y no deducirla del `-1`:
- plantilla: misma query que `service.ts:395-412` (`tenantWhere(notificationTemplates, ctx)` + `templateKey`).
- categoría: `NotificationService.getUserPreferences(userId)` es público (`service.ts:240`).
- token: `userHasDeviceToken` es `private` (`service.ts:1116`); o se consulta `schema.deviceTokens` directo con `tenantWhere` (patrón `novedades-push.ts:186-190`) o se lo hace público. Decisión del plan.

### H-3. No hay infraestructura para montar componentes `.vue` en la app

`el-templo-app/vitest.config.ts` es `environment: 'node'`, no hay `@vue/test-utils`, `jsdom` ni `happy-dom` en `package.json`, y ningún test de la app hace `mount(`. Los tests existentes son funciones puras, stores Pinia (`setActivePinia(createPinia())`) y composables con `vi.mock` de Capacitor/axios. Además el worktree no tiene `node_modules`.

Consecuencia para D-07 (tests de caracterización de `FreeBlockPlayer` antes de extraer): su orquestación vive dentro de `<script setup>` y no se puede probar en node. Opciones para el plan (instalar dependencias requiere OK de Franco, regla del repo):
- (A) sumar `@vue/test-utils` + `happy-dom` (devDeps) y escribir tests de montaje. Es la única forma de cubrir las etapas reales.
- (B) caracterizar lo que SÍ es testeable en node: `useSessionPlayer` con `{ freeBlock: true }` (modo bloque libre, reloj, `startAnotherRound`, `clearProgress`) y `useFreeBlockCompletion`, mockeando `@capacitor/preferences`. Después extraer `useSingleBlockPlayer` con tests propios en node.
- Recomendación para el plan: B como piso obligatorio, A solo si Franco lo aprueba.

### H-4. Deep link en frío: el destino se pierde por dos caminos

- `handleTapNavigation` hace `router.push(route)` dentro de un `try/catch` (`APP:boot/push-notifications.ts:73-98`), pero `router.push` devuelve una promesa y no lanza: el `catch` con `setPendingRoute` es código muerto.
- Sin sesión, el guard global responde `{ name: 'login' }` sin guardar el destino (`APP:router/guards.ts:84-87`).
- `pendingRoute` solo se consume en `MiTemplo.vue` al montar (`APP:modules/progression/pages/MiTemplo.vue:586-589`).
- El modelo que ya funciona es `boot/deep-links.ts:104-126`: sin sesión guarda `setPendingRoute(target)` y empuja a `/login`; con sesión empuja directo.

### H-5. La semilla de `stretch_catalog` no puede asumir que existen los ejercicios

La base de CI no tiene filas de `exercises`. Un `INSERT ... VALUES (…, 4180, …)` con FK a `exercises.id` rompe el provisioning de tests. Usar el patrón de `0292_conquer_catalog_seed.sql:132`: `INSERT IGNORE INTO … SELECT 1, e.id, … FROM exercises e WHERE e.tenant_id = 1 AND e.id = 4180 AND e.exercise = 'QUAD STANDING STRETCH'` (0 filas donde no existe). Un `INSERT` por fila separado con `--> statement-breakpoint`. Guardar también el nombre en la fila (la lista referencia una fila; el video se resuelve por nombre).

### H-6. El unique de `stretch_offers` tiene que empezar con `tenant_id`

No copiar el unique de `aviso_events` (`uq_aviso_events_aviso_user_type`, arranca con `aviso_id`): está en la **allowlist de deuda** (`src/db/tenant-tables.ts:371-372`). Copiar el de `weekly_board`: `UNIQUE KEY … (tenant_id, …)` (`0319_weekly_board.sql`, `uq_weekly_board_leads_tenant_branch_week`). Es lo que exige `pnpm db:verify-uniques`.

### H-7. `GET /members/scheduling/my-bookings` no está detrás de `templo-training`

Si `stretch` viajara en esa respuesta (`APP:composables/useSchedulingApi.ts:36-46`), no quedaría limitado al módulo. Más simple y alineado con D-13: ruta propia `GET /api/sessions/stretch/today` dentro del plugin de sesiones y un store/composable en la app que la consulta; ante falla la card queda como hoy (fase 203, regla 1).

### H-8. Los tests borran `notification_templates`

`notificationTemplates` está en `TABLES_TO_CLEAN` (`test/helpers.ts:220-224`). Todo test del push tiene que llamar `new NotificationService(app.db, app.log).seedTemplates(CTX)` en `beforeEach`, como `test/notification-class-reminder.test.ts:140`. Y `aura_config` tampoco se puede dar por sembrada: re-sembrar la fuente `stretch` en cada `beforeEach` (patrón `test/sessions/free-blocks-complete.test.ts:101-111`).

### H-9. `crc32` (D-16)

`node:zlib` expone `crc32` en Node >= 22.2 (verificado: `typeof require('zlib').crc32 === 'function'` en v22.22.0; EC2 usa Node 22 por nodesource). No hay `crc32` en `src/`. Usar `import { crc32 } from "node:zlib"`. No reutilizar `simpleHash` de `src/modules/sessions/pipeline/utils/deterministic-hash.ts`: la decisión fija crc32.

---

## 1. Conteos y gates que dispara la fase (valores actuales verificados)

| Gate / constante | Archivo:línea | Valor hoy | Tras la 213 |
|---|---|---|---|
| `GYM_OWNED_TABLES.length` | `test/db/tenant-tables.test.ts:146` | 129 | 131 |
| `TENANT_EXEMPT_TABLES.length` | `test/db/tenant-tables.test.ts:147` | 5 | 5 |
| `schemaTables.size` | `test/db/tenant-tables.test.ts:151` | 134 | 136 |
| Título del `it` y comentario histórico | `test/db/tenant-tables.test.ts:99,121-145` | "129 … 134" | "131 … 136" + línea nueva |
| `MODULOS_DECLARADOS` (mapa byte a byte) | `test/db/tenant-tables.test.ts:438-574` (ej. `"free-blocks"` en `:496`) | sin `stretch` | sumar `stretch: ["stretch_catalog", "stretch_offers"]` |
| `report.gymOwnedChecked` | `test/migrations/0192-0195-tenant-columns.test.ts:169,194` | 129 | 131 |
| Test 10 de la 0196 (conteo + mensaje) | `test/migrations/0196-tenant-unique-contracts.test.ts:616,652-658` | 129 | 131 |
| `ENTRADAS_BASELINE` y título del `it` | `test/tenancy/iso-01-manifiesto.test.ts:432,575` | 554 | 557 (3 rutas) |
| `TENANT_MANIFEST` | `test/tenant-manifest.ts:1300-1320` (bloque `templo-training · /api/sessions`) | sin stretch | 3 entradas `templo-module` / `templo-training` |
| `GYM_OWNED_TABLES` (alfabético) | `src/db/tenant-tables.ts:69` (ej. `extra_blocks_completed` en `:129`) | sin stretch | `stretch_catalog`, `stretch_offers` |
| `TENANT_STRICT_MODULES` | `src/db/tenant-tables.ts:655-768` (ej. `"free-blocks"` en `:714`) | sin `stretch` | `stretch: ["stretch_catalog","stretch_offers"]` |
| `JOBS_ESPERADOS` | `test/tenancy/con-04-crons-per-tenant.test.ts:294-308` | 13 archivos | **sin cambio** (D-14: dentro de `notification-cron.ts`) |
| `APP_SECTIONS` (si H-1) | `src/modules/communications/destinations.ts:62-124` + 2 espejos | 10 | 11 |
| `TABLES_TO_CLEAN` | `test/helpers.ts:197-359` | sin stretch | `schema.stretchOffers` junto a `schema.extraBlocksCompleted` (`:251`); `schema.stretchCatalog` antes de `schema.exercises` (`:359`) |
| Limpieza del 2.º gimnasio | `test/fixtures/second-tenant.ts:~463-466` | sin stretch | `DELETE FROM stretch_offers WHERE tenant_id = ${TENANT_DOS}` antes de `users` (mismo patrón que `extra_blocks_completed`) |
| Último número de migración | `src/db/migrations/0326_activity_booking_cutoffs.sql` | 0326 | numerar al ejecutar mirando master, staging, `feat/egresos-rendiciones` (0327-0329) y el tren v6.1 |

Más: `con-03-write-paths-tenant-id.test.ts` solo exige `additionalProperties: false` en los body de las rutas con body (lista cerrada de schemas, no hace falta sumar los nuevos, pero cada schema nuevo debe declararlo). `pnpm lint:tenant` exige `tenantWhere` / `tenantValues` en todas las queries nuevas; **no** tocar `tenant-lint-allowlist.json`.

Como los dos módulos nuevos nacen strict, el sentinel hace `throw` en test/dev si un test consulta `stretch_*` sin `tenantWhere(tabla, CTX)` (los INSERT sin `tenantValues` no fallan). Definir `const CTX = { tenantId: TENANT_TEMPLO }` con `TENANT_TEMPLO` de `test/fixtures/second-tenant.ts:119`.

---

## 2. Clasificación de archivos

### API

| Archivo nuevo/modificado | Rol | Flujo | Análogo más cercano | Calidad |
|---|---|---|---|---|
| `src/db/migrations/NNNN_stretch_tables.sql` | migración (2 tablas + semilla) | batch | `0286_extra_blocks_completed.sql` + `0319_weekly_board.sql` (unique tenant-first) + `0292_conquer_catalog_seed.sql` (semilla) | exacto |
| `src/db/migrations/NNNN+1_aura_source_stretch.sql` | migración (enum + seed) | batch | `0285_aura_source_extra_block.sql` | exacto |
| `src/db/schema/stretch.ts` (+ `export *` en `schema/index.ts:26`) | modelo | CRUD | `src/db/schema/extra-blocks-completed.ts` | exacto |
| `src/db/schema/aura-config.ts`, `aura-transactions.ts`, `src/modules/aura/types.ts` | modelo/tipo (enum) | CRUD | mismas líneas del `extra_block` (`aura-config.ts:27`, `aura-transactions.ts:29`, `aura/types.ts:18`) | exacto |
| `src/db/tenant-tables.ts` | config | n/a | entradas de `extra_blocks_completed` (`:129`, `:714`) | exacto |
| `src/modules/sessions/stretch-selection.ts` | utilidad pura | transform | `src/modules/sessions/free-blocks-ranking.ts` + referencia `consultas/regla_simulacion.py` | exacto (forma) |
| `src/modules/sessions/stretch-service.ts` | servicio | CRUD + request-response | `src/modules/sessions/free-blocks-service.ts` | exacto |
| `src/modules/sessions/stretch-routes.ts` + schemas en `schemas.ts` + registro en `routes.ts:67` | rutas | request-response | `src/modules/sessions/free-blocks-routes.ts` | exacto |
| `src/modules/sessions/stretch-push.ts` (o bajo `notifications/`) | servicio de job | event-driven (tick) | `src/modules/communications/novedades-push.ts` + `src/modules/notifications/anticipated-bookings.ts` | role-match fuerte |
| `src/jobs/notification-cron.ts` (modificado: paso en el tick) | job | event-driven | paso `queueDueNovedadPushes` en `:660-669` | exacto |
| `src/modules/notifications/types.ts` (`TEMPLATE_SEEDS`) | config | n/a | `class_reminder` (`:293-302`) | exacto |
| `test/sessions/stretch-selection.test.ts` | test unitario | transform | `test/sessions/free-blocks-ranking.test.ts` | exacto |
| `test/sessions/stretch-complete.test.ts` / `stretch-today.test.ts` | test integración | request-response | `test/sessions/free-blocks-complete.test.ts` | exacto |
| `test/notifications/stretch-push.test.ts` | test integración | event-driven | `test/notification-class-reminder.test.ts` | exacto |
| `test/tenancy/iso-03-stretch.test.ts` | test aislamiento | request-response | `test/tenancy/iso-03-free-blocks.test.ts` | exacto |
| `test/migrations/NNNN-stretch.test.ts` | test migración | n/a | `test/migrations/0319-weekly-board.test.ts` + `0285-0286-extra-blocks.test.ts` | exacto |
| Gates de conteo (sección 1) | test/config | n/a | ver tabla | exacto |

### APP

| Archivo | Rol | Flujo | Análogo | Calidad |
|---|---|---|---|---|
| `modules/training/composables/useSingleBlockPlayer.ts` (nuevo) | composable | event-driven | lógica de `pages/FreeBlockPlayer.vue:109-404` | exacto (se extrae de ahí) |
| `modules/training/pages/FreeBlockPlayer.vue` (refactor) | página | request-response | sí mismo | n/a |
| `modules/training/pages/StretchPlayer.vue` (nuevo) | página | request-response | `FreeBlockPlayer.vue` | exacto |
| `modules/training/composables/useStretchCompletion.ts` + tipos | composable | request-response | `composables/useFreeBlockCompletion.ts` | exacto |
| store/composable de `stretch/today` (nuevo) | store Pinia | request-response | `stores/useTodayBookingStore.ts` | role-match |
| `modules/training/routes.ts` (+ `training/estirar`) | ruta | n/a | `training/libre/:blockId` (`:17-30`) | exacto (sin flag) |
| `modules/progression/utils/today-card.ts` (+ `withStretch`) | utilidad pura | transform | `withLibreLink` / `withExtraPrograms` (`:488-541`) | exacto |
| `modules/progression/pages/MiTemplo.vue` (input de la card) | página | request-response | bloque `resolveTodayCard({...})` `:439-504` | exacto |
| `modules/progression/utils/__tests__/today-card.test.ts` | test unitario | transform | `describe` de Libre `:1457-1608` y `:1610-1828` | exacto |
| `boot/push-notifications.ts`, `router/guards.ts`, `boot/deep-links.ts` | boot/guard | event-driven | `boot/deep-links.ts:104-126` | role-match |
| tests de `useSessionPlayer` / `useSingleBlockPlayer` | test | event-driven | `composables/__tests__/useTokenStorage.test.ts`, `useWeekData.test.ts` | role-match |
| `config/destinations.ts` (si H-1) | config | n/a | entrada `conquer` `:83-88` | exacto |

### ADM

| Archivo | Rol | Análogo |
|---|---|---|
| `config/rule-triggers.ts` (`SYSTEM_TEMPLATE_TRIGGER_DESCRIPTIONS`) | config | entrada `class_reminder` (`:160-181`) |
| `config/destinations.ts` (si H-1) | config | espejo de `conquer` |

---

## 3. Asignaciones de patrón: API

### `src/db/migrations/NNNN_stretch_tables.sql` (migración, batch)

**Analogos:** `0286_extra_blocks_completed.sql` (forma de tabla gym-owned), `0319_weekly_board.sql` (unique con `tenant_id` primero), `0292_conquer_catalog_seed.sql` (semilla idempotente).

**Encabezado y reglas** (`0286_extra_blocks_completed.sql:1-33`): comentario de fase, "hand-written: nunca drizzle-kit push/migrate", cero datos de prueba, y la advertencia "Un comentario SQL NUNCA debe contener el separador de statements". Sin `;` dentro de comentarios (skill `el-templo-db-migrations`, regla 2).

**Tabla gym-owned** (`0286_extra_blocks_completed.sql:35-52`):
```sql
CREATE TABLE `extra_blocks_completed` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL DEFAULT 1,
  `user_id` int NOT NULL,
  ...
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_extra_blocks_tenant_user_date` (`tenant_id`, `user_id`, `local_date`),
  CONSTRAINT `fk_extra_blocks_completed_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`),
  CONSTRAINT `extra_blocks_completed_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
);
```
Para `stretch_offers`: `UNIQUE KEY uq_stretch_offers_tenant_user_date (tenant_id, user_id, local_date)` (patrón `0319`, ver H-6), FK `fk_stretch_offers_tenant`, FK a `users` (`ON DELETE CASCADE`), FK opcional a `attendance` (`ON DELETE SET NULL`, mismo criterio que `pending_notifications.booking_id`). Para `stretch_catalog`: unique `(tenant_id, exercise_id)` o `(tenant_id, family, sort_order)`; FK a `exercises` (ver H-5).

**Semilla idempotente** (`0292_conquer_catalog_seed.sql:15-16,26,132`): un `INSERT IGNORE ... SELECT 1, e.id, ... FROM exercises e WHERE ...` por fila, separados con `--> statement-breakpoint`. Solo tenant 1. Los ids van resueltos por `id` Y nombre (H-5).

**Test de la migración:** consultar `INFORMATION_SCHEMA` y no `_migrations` (`test/migrations/0319-weekly-board.test.ts:1-12,50-80`), con el chequeo estático del texto del SQL (`0285-0286-extra-blocks.test.ts:111-118`).

---

### `src/db/migrations/NNNN+1_aura_source_stretch.sql` (enum, batch)

**Analogo:** `0285_aura_source_extra_block.sql` (copiar tal cual, cambiando el valor).

**Núcleo** (`:31-48`, `:54-71`, `:78-79`): `ALTER TABLE ... MODIFY COLUMN ... ENUM(... 'extra_block' ...)` con el valor nuevo **al final** en las dos tablas, separados por `--> statement-breakpoint`, y el seed:
```sql
INSERT IGNORE INTO `aura_config` (`aura_config_source_type`, `default_amount`, `description`, `is_active`)
VALUES ('extra_block', 5, 'Bloque libre del día (primero que llega a 10 minutos)', 1);
```
Trampa: el nombre físico de la columna difiere por tabla (`source_type` en `aura_transactions`, `aura_config_source_type` en `aura_config`; `mysqlEnum` 1.er arg = nombre de columna). La lista del `ENUM` (`:31-46`) debe quedar idéntica a los `mysqlEnum` de `src/db/schema/aura-transactions.ts:12-30` y `aura-config.ts:11-28`, y a la unión `AuraSourceType` de `src/modules/aura/types.ts:1-18`. Los tres se editan en el mismo commit que el `.sql`.

---

### `src/db/schema/stretch.ts` (modelo, CRUD)

**Analogos:** `src/db/schema/extra-blocks-completed.ts` y `weekly-board.ts`.

**Imports y columna de tenancy** (`extra-blocks-completed.ts:1-14,36-43`):
```typescript
import { mysqlTable, int, varchar, datetime, json, boolean, timestamp, index } from "drizzle-orm/mysql-core";
import { users } from "./users";
import { tenantIdColumn } from "./tenant-column";
...
    // Valor server-side, nunca de payload. Ver src/db/schema/tenant-column.ts
    tenantId: tenantIdColumn(),
    userId: int("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
```
**Unique con `tenant_id` primero** (`weekly-board.ts`, `uniqueIndex(...).on(table.tenantId, ...)`). Tipos exportados: `typeof tabla.$inferSelect` / `$inferInsert` (`extra-blocks-completed.ts:60-61`). Exportar desde `schema/index.ts` (línea de `extra-blocks-completed` en `:26`). Marcas de embudo como `timestamp`/`datetime` nullable (`firstAt`-style de `aviso_events`, `communications.ts:145`). Cabecera `// Module: sessions (fase 213, estiramiento)`.

---

### `src/db/tenant-tables.ts` (config)

**Analogo:** las dos entradas de `extra_blocks_completed`.
```typescript
  // Bloque libre (fase 197, mig 0286): nace con tenant_id y strict, ver
  // TENANT_STRICT_MODULES["free-blocks"].
  "extra_blocks_completed",        // :127-129 en GYM_OWNED_TABLES
...
  "free-blocks": ["extra_blocks_completed"],   // :714 en TENANT_STRICT_MODULES
```
Sumar `"stretch_catalog"`, `"stretch_offers"` (orden alfabético, comentario con fase y migración) y `stretch: ["stretch_catalog", "stretch_offers"]` con comentario "Fase 213: el módulo nace strict". Replicar en `MODULOS_DECLARADOS` (`test/db/tenant-tables.test.ts`). Ver sección 1 para los demás conteos.

---

### `src/modules/sessions/stretch-selection.ts` (utilidad pura, transform)

**Analogo:** `src/modules/sessions/free-blocks-ranking.ts` (funciones puras exportadas, constantes `Readonly<Record<…>>`, sin `db` ni reloj, nombres en español) y su test `test/sessions/free-blocks-ranking.test.ts`. La referencia funcional exacta es `.planning/phases/213-estiramiento-post-clase/consultas/regla_simulacion.py:14-47` (`regla(week, day, prescritos, rutas)`), que reproduce la tabla de referencia.

**Forma** (`free-blocks-ranking.ts:17-43`): constantes arriba, `export function` pura por responsabilidad.
```typescript
export const RANGO_ROL: Readonly<Record<string, number>> = { ... };
export function esRolDeCanasta(role: string): boolean {
  if (role.endsWith("_ALT")) return false;
  ...
}
```
**Constantes a portar tal cual del script** (`regla_simulacion.py:2-17`): `N=5, SEG=45, TRANS=10, MIN=300, MAX=480`, `DBFAM` (`'LS ( LUNGES )'→LS`, `PL→FL`, `'TTB / HF'→TTB`), `TREN_SUP` (las 9 rutas, constante de una línea, D-03), `BASE` (lista de 5), `DIAS`.

**Algoritmo a portar** (`regla_simulacion.py:19-47`): familias por conteo con orden estable, `TS` al final si hay ruta de tren superior y TS no apareció, `__BASE__` si no hay familias, rotación `(semana + índice del día) % len(resto)`, ronda `take()`, recorte mientras `dur > MAX`, relleno mientras `dur < MIN`.

Reglas de pureza del plan: la función recibe `{ prescritos, rutas, catalogo, semana, dia }` y devuelve `{ estiramientos, duracionSegundos }`; nada de `Date.now()`, `Math.random()` ni lectura de base (SPEC §4.1). `índice del día` = `DIAS.indexOf(dia)`; reutilizar `DAY_NAME_TO_NUMBER` de `src/modules/shared/training-constants.ts` solo si da el mismo valor que el script (el script usa lunes=0).

**Datos de entrada que arma el servicio (no la función pura):**
- Movilidad prescrita: `session_prescriptions` con `exercise_type='mobility'` (`src/modules/sessions/service.ts:507-527`, `sortOrder: MOBILITY_SORT_ORDER`) **más** las del bloque con rol `STRETCHING`, que guarda `exercise_type='main'` a propósito (`src/modules/sessions/pipeline/utils/stretching-selection.ts:73-77`): para leer la movilidad de un día de técnica hay que mirar el rol del bloque, no el tipo.
- Familia de la base: `exercises.mobility_related` (`src/db/schema/exercises.ts:82`).
- Rutas: `session_blocks.route` (`src/db/schema/session-blocks.ts:17`) de los bloques que no son INITIUM.
- Tipo de día: `sessions.session_mode` (`src/db/schema/sessions.ts:31`, valores `regular|rom|combos|tecnica`, ver `SessionMode` en `test/sessions/_free-blocks-fixtures.ts:38`). ROM = no se ofrece (D-06).

**Test (tabla de referencia, SPEC §4.1):** unit puro sin base, como `test/sessions/free-blocks-ranking.test.ts:1-50` (`import … from "../../src/modules/sessions/…"`, helper `cand(over)` con valores neutros). Cada fila de la tabla = un caso; más los casos de SPEC §5.2 (sin familias, familia con un ejercicio, prescrito en la lista, > 8 min, < 5 min, determinismo).

---

### `src/modules/sessions/stretch-service.ts` (servicio, CRUD + request-response)

**Analogo:** `src/modules/sessions/free-blocks-service.ts`.

**Imports** (`:17-60`): `and, eq, ... from "drizzle-orm"`, `FastifyBaseLogger`, `MySql2Database`, `* as schema`, `todayInTz`, `awardOncePerLocalDay, resolveBranchTimezone` de `../aura/daily-award`, y `tenantValues, tenantWhere, type TenantContext` de `../shared/tenant`.

**Resolver socio/zona del día** (`free-blocks-service.ts:203-260`): `resolveMember(ctx, userId)` usa `resolveSessionView` como gate y resuelve `timezone = await resolveBranchTimezone(this.db, ctx, user.branchId)` y `today: todayInTz(timezone)`. "El día es el de la sede, nunca UTC".

**Duración en servidor, ventana de `startedAt`** (`:84-88`, `:402-424`):
```typescript
export const FREE_BLOCK_AURA_MIN_SECONDS = 600;
const STARTED_AT_MAX_FUTURE_MS = 60_000;
const STARTED_AT_MAX_PAST_MS = 4 * 60 * 60 * 1000;
...
      const startedMs = Date.parse(input.startedAt);
      const nowMs = now.getTime();
      if (Number.isNaN(startedMs) || startedMs - nowMs > STARTED_AT_MAX_FUTURE_MS ||
          nowMs - startedMs > STARTED_AT_MAX_PAST_MS) {
        return { kind: "error", status: 400, message: "startedAt invalido" };
      }
      const startedAt = new Date(Math.min(startedMs, nowMs));
      durationSeconds = Math.floor((nowMs - startedAt.getTime()) / 1000);
```
Para el estiramiento el umbral de AURA es 180 s (D-08). En vez de aceptar `startedAt` del cliente se puede usar el `started_at` que el servidor ya guardó en `POST /stretch/events` (la duración sale de dos marcas del servidor, más fuerte que `free-blocks`). Decisión del plan.

**AURA una vez por día** (`:537-575`): copiar `awardDailyAura` cambiando `sourceType: "stretch"`, `referenceType: "stretch_day"`, descripción. Devuelve `false` sin lanzar si ya estaba cobrada.
```typescript
    const acreditada = await awardOncePerLocalDay(this.auraService, this.log, {
      userId: member.userId,
      sourceType: "extra_block",
      referenceType: "extra_block_day",
      localDate: row.localDate,
      description: "Bloque libre del día",
    });
    if (!acreditada) return false;
```
**Inserción / actualización con tenant** (`:424-441`, `:480-489`): `db.insert(schema.X).values(tenantValues(ctx, {...})).$returningId()` y `update(...).where(and(tenantWhere(schema.X, ctx), eq(...)))`.

**Invariante del completar (SPEC §5.2, última fila):** no escribe `completed_sessions`, no toca racha, no encola `post_session_soreness`. El modelo es el comentario de `free-blocks-service.ts:370-379` y su test `test/sessions/free-blocks-invariants.test.ts`.

**Crear la oferta "el primero que llegue" (D-15):** `insert(...).values(tenantValues(ctx, {...})).onDuplicateKeyUpdate({ set: { ... no-op ... } })` sobre el unique tenant-first; modelo de idempotencia en `src/modules/communications/prompt-service.ts:288-318` (`recordEvent`: `insert(avisoEvents).values(tenantValues(...)).onDuplicateKeyUpdate({ set: {...} })`) y reclamo condicional con `affectedRows` en `novedades-push.ts:233-246`. Ojo con `mysql2` FOUND_ROWS: `affectedRows` cuenta filas encontradas, no cambiadas.

**Grupo A/B (D-16):** `import { crc32 } from "node:zlib"` (H-9); `crc32("stretch-v1:" + userId) % 100`, función pura exportada con su test.

---

### `src/modules/sessions/stretch-routes.ts` (rutas, request-response)

**Analogo:** `src/modules/sessions/free-blocks-routes.ts`. Se registra sin prefix dentro del plugin de sesiones (`src/modules/sessions/routes.ts:64-70`):
```typescript
  await fastify.register(freeBlocksRoutes, {
    sessionService,
    formatDescriptions,
  });
```
Con eso las rutas heredan `moduleScope("templo-training")` de `src/app.ts:210-211` y D-13 queda resuelto sin flag.

**Handler tipo** (`free-blocks-routes.ts:113-160`):
```typescript
  fastify.post<{ Body: CompleteFreeBlockBody }>(
    "/free-blocks/complete",
    {
      onRequest: [fastify.authenticate],
      schema: { ...completeFreeBlockSchema, response: completeFreeBlockResponse },
    },
    async (request, reply) => {
      const { userId } = request.user;
      await attachCountryScope(request, fastify.db);
      const ctx = assertTenant(request.scope, "sessions.free-blocks");
      const resolved = await service.resolveMember(ctx, userId, level);
      if (resolved.kind === "deny") {
        return reply.status(resolved.status).send({ error: resolved.message });
      }
      const result = await service.complete(ctx, resolved.member, { ... });
      if (result.kind === "error") {
        return reply.status(result.status).send({ error: result.message });
      }
      return { ... };
    },
  );
```
**Schemas** (`src/modules/sessions/schemas.ts:266-306`): `body: { type: "object", required: [...], additionalProperties: false, properties: {...} }` + interfaz de body + `response` por status. `additionalProperties: false` es obligatorio (gate `con-03`).

**Manifiesto (3 entradas, `test/tenant-manifest.ts:1308-1319` como modelo):**
```typescript
  "POST /api/sessions/free-blocks/complete": {
    categoria: "templo-module",
    modulo: "templo-training",
  },
```
→ `GET /api/sessions/stretch/today`, `POST /api/sessions/stretch/events`, `POST /api/sessions/stretch/complete`. Y `ENTRADAS_BASELINE` 554 → 557 con la línea de historia en `iso-01-manifiesto.test.ts:~415-431`. Errores con `{ error: "..." }` en español, 404 para recurso ajeno (nunca 403).

---

### `src/modules/sessions/stretch-push.ts` + paso en `notification-cron.ts` (job, event-driven)

**Analogo principal:** `src/modules/communications/novedades-push.ts` (módulo propio llamado desde el tick, función `(db, ctx, log, now = new Date())`, claim idempotente en transacción, logs estructurados con `tenantId`) y `src/modules/notifications/anticipated-bookings.ts` (barrido de ±1 día por sede con `buildClassDateTime` y zona POR FILA).

**Dónde engancharlo** (`src/jobs/notification-cron.ts:655-669`): el paso corre **antes** de `processQueue`, dentro de `runNotificationQueueTickForTenant` (que ya está en `forEachActiveTenant` `:696`, no suma job ni `cron.schedule`):
```typescript
  // Novedades con push (mig 0297): ANTES de despachar, así las filas que
  // encola este paso salen en este mismo tick. Un fallo acá no frena la cola.
  try {
    const novedadPushes = await queueDueNovedadPushes(db, ctx, log);
    if (novedadPushes.novedades > 0 || novedadPushes.failed > 0) {
      log.info({ tenantId, ...novedadPushes }, "Novedad pushes queued");
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ tenantId, err: message }, "Novedad push step failed");
  }
```
Copiar el bloque `try/catch` con `log.error({ tenantId, err }, "Stretch push step failed")`. Importar el módulo arriba junto a `queueDueNovedadPushes` (`:30`). Un fallo de estiramiento no puede frenar la cola.

**Saltear gimnasios sin `templo-training`** (D-13): el repo no tiene ningún job que lo haga. Usar `isModuleEnabled(ctx.tenantId, "templo-training", db)` (`src/modules/shared/module-flags.ts`, fail-closed, cache TTL 0 en test). El guard de rutas lo usa en `src/modules/shared/module-registry.ts:164-175`. Es la primera línea del paso.

**Ventana de elegibilidad y hora local por sede** (patrón `anticipated-bookings.ts:100-165`): rango `now ± 24 h` en `YYYY-MM-DD` para acotar el scan, join `attendance → schedules → branches`, y por fila `buildClassDateTime(sessionDate, endTime, branchTimezone)` (`src/modules/shared/date-utils.ts:144`, interpreta fecha + hora como pared de la sede). Disparo: `fin + offset ≤ now < fin + 120 min`. Hora local para el tope 21:30 / silencio 21:30-08:00: `buildClassDateTime(todayInTz(tz, now), "21:30", tz)` (patrón `batchPushDeliveryAt`, `notification-cron.ts:93-100`). Nunca asumir UTC−3: hay una sede en `Europe/Madrid` (test modelo `notification-class-reminder.test.ts:459-493`).

**Dedupe de `class_reminder` (para no copiarlo):** `classReminderAlreadyQueued` filtra por `booking_id` sin mirar plantilla (`notification-cron.ts:285-299`). El estiramiento usa la fila de `stretch_offers` como dedupe (D-15). Guardar `queueNotification()` → id en `stretch_offers` (p. ej. `pending_notification_id`) para reconciliar `push_sent_at` leyendo `pending_notifications.status/sent_at` **antes** de la purga de 24 h (`NotificationService.purgeOldNotifications`).

**Encolado sin overrides** (D-12, el texto se edita desde el admin): `queueNotification({ userId, templateKey: "stretch_followup", scheduledAt })` sin `titleOverride` ni `bodyOverride`. Contraste con `class_reminder`, que pasa `titleOverride` (`notification-cron.ts:408-413`). `scheduledAt` ya existe en `QueueNotificationInput` (`src/modules/notifications/types.ts:36-44`). La ruta sale de la plantilla (`service.ts:471-481`); ver H-1.

**Motivos de no envío (H-2):** pre-chequear plantilla / categoría (`getUserPreferences`) / token (consulta directa a `deviceTokens` con `tenantWhere`) antes de encolar y escribirlos en `push_decision`.

**Tope 3 en 7 días y pausa 14 días tras 4 sin abrir (D-11):** consultas sobre `stretch_offers` del propio alumno (`push_queued_at`, `push_opened_at`) con `tenantWhere`. No usar `pending_notifications` (se purga a 24 h).

**Resiliencia por candidato** (`notification-cron.ts:370-425`): `try/catch` por candidato con `log.warn({ err: message, userId, ... }, "Failed to queue ...")` y seguir. Sin `console.log` (usar `log` Pino del cron o `FastifyBaseLogger`).

---

### `src/modules/notifications/types.ts` — `TEMPLATE_SEEDS`

**Analogo:** entrada `class_reminder` (`:285-302`) y `post_session_soreness` (`:169-177`).
```typescript
  {
    templateKey: "post_session_soreness",
    category: "entrenamiento",
    title: "Tu cuerpo habla",
    body: "Registrá cómo te sentís después de la sesión.",
    titleFemale: "Tu cuerpo habla",
    bodyFemale: "Registra como te sentis despues de la sesion.",
    route: "/mi-templo",
  },
```
Nueva entrada: `templateKey: "stretch_followup"` (nombre a decidir), `category: "entrenamiento"`, `title: "¿Estiraste?"`, `body: "6 minutos para aflojar lo que trabajaste hoy. Tocá y arrancamos."`, `titleFemale`/`bodyFemale` (la variante femenina de otras plantillas es la misma sin tildes/voseo; copiar el criterio de `morning_energy`), `route: "/training/estirar?from=push"`. El seed corre al arrancar vía `seedTemplates` + `INSERT IGNORE` (`service.ts:1011-1051`) para cada tenant activo (`notification-cron.ts:1082-1088`), así que no hace falta migración de datos para la plantilla. Ver H-1 antes de decidir `route`. Textos prohibidos: "menos dolor", "evitá lesiones", "recuperate más rápido".

---

## 4. Asignaciones de patrón: tests API

### Test de integración con reloj (modelo principal)

**`test/sessions/free-blocks-complete.test.ts`** (reloj relativo a `Date.now()`, sin fechas fijas):
- Reloj: `targetWednesday()` calcula el último miércoles desde `Date.now()` (`:55-63`); `vi.useFakeTimers({ toFake: ["Date"] })` + `vi.setSystemTime(new Date(`${wednesday}T15:00:00Z`))` **antes de loguear**, y `vi.useRealTimers()` en `afterEach` (`:92-100`, `:149-151`).
- Re-sembrar `aura_config` en cada `beforeEach` (`:102-112`), forzar la zona de la sede 1 (`:114-124`), forzar `day_modes` (`:126-141`).
- Socio y sesión: `createPresencialMember`, `seedSession`, `seedExercise`, `dayIdFor`, `CTX_TEMPLO` de `test/sessions/_free-blocks-fixtures.ts:31-61,90,195`. `seedSession` acepta `sessionMode` (`regular|rom|combos|tecnica`, `:38`) y `mobilityExerciseId` por bloque; para estiramientos hay que sembrar la movilidad como `exercise_type: "mobility"` y, para técnica, bloque `STRETCHING`.
- Helpers `postComplete`, `filas`, `auraTx`, `balance`, `dayKey` (`:171-243`) son copiables casi 1:1. `minutesAgo(n)` da duraciones exactas con el reloj congelado (`:166-169`).
- NUNCA hardcodear ids de `users` (usar `member.id`).

**Variante "ticks" del job:** `test/notification-class-reminder.test.ts`. La función del job recibe `now` inyectable y el test la llama directo, sin HTTP: `runClassReminderForTenant(app.db, CTX, PINNED_NOW)` (`:262-270`). Para el push del estiramiento: `runStretchPushForTenant(db, ctx, now)` con `now` inyectado. Notar que ese archivo fija una fecha (`PINNED_NOW = new Date("2026-03-11T14:00:00Z")`, `:113`); las reglas de la fase 213 piden saltos relativos a `Date.now()`, así que construir `now` como `new Date(Date.now())` anclado y sumar minutos relativos.
- `process.env.DRY_RUN = "true"` ANTES de los imports (`:23`) para que FCM no intente enviar.
- `beforeEach`: `cleanAllTestData(app)` + `new NotificationService(app.db, app.log).seedTemplates(CTX)` (H-8) + token de dispositivo por socio: `app.db.insert(schema.deviceTokens).values({ tenantId, userId, token, platform: "android" })` (`:186-191`).
- Cada tz: sede de Madrid creada con `insert(schema.branches)` y `timezone: "Europe/Madrid"` (`:459-471`), y verificación de que el job usa la tz de la sede de la clase, no la del proceso.
- Segundo gimnasio: `seedSecondTenant`, `limpiarSegundoGimnasio`, `TENANT_DOS` (`:43-45,498-580`); limpiar manualmente en `finally` lo que el test crea fuera de `limpiarSegundoGimnasio` (cola, tokens, plantillas).

**Aislamiento y módulo apagado:** `test/tenancy/iso-03-free-blocks.test.ts`. Prende `templo-training` para el gimnasio 2 con `setModuleFlag` (`test/fixtures/module-flags.ts:41-55`), prueba con flag ON que la ruta anda y recién con OFF el 404 del guard (cabecera `:1-40`, caso (f)). Restaurar en `afterEach` con `restoreTemploFlags`. Caso del SPEC: "segundo gimnasio activo sin `templo-training` → sin ofertas, filas ni pushes aunque El Templo lo tenga andando" (ahí no hay HTTP: llamar a `runNotificationQueueTick` o al paso del job con `{ tenantId: TENANT_DOS }`).

**Test de migración:** `test/migrations/0319-weekly-board.test.ts` (INFORMATION_SCHEMA de columnas, índices con `SEQ_IN_INDEX`, FKs) y `0285-0286-extra-blocks.test.ts:90-118` (enum termina en el valor nuevo; seed estático `('stretch', 5,`).

---

## 5. Asignaciones de patrón: APP

### `modules/training/composables/useSingleBlockPlayer.ts` (extracción de `FreeBlockPlayer.vue`)

**Fuente:** `modules/training/pages/FreeBlockPlayer.vue` (439 líneas). Mapa de qué es de la abstracción y qué queda en cada página (SPEC §4.2 D-07), con las líneas:

| Va a `useSingleBlockPlayer` | Líneas | Queda en la página |
|---|---|---|
| Tipo `Stage` (`loading/missing/countdown/playing/saving/celebration/summary`) y `stage` | `:109-126` | pantallas de celebración/resumen y textos (`:29-49`, `:150-176`) |
| `session`, `player`, `exitConfirmed`, `disposed`, `autoStarted` | `:127-143` | `item`, `completionId`, `lastResult`, `savedExerciseIds`, `awardedInRun` (`:127-138`) |
| `buildSyntheticSession` (`dayId: 'XB-' + blockId`, `blockCount: 1`) | `:195-206` | el `dayId` propio del estiramiento (p. ej. `'ST-' + localDate`) |
| `createPlayer` con `useSessionPlayer(s, { freeBlock: true })` | `:208-211` | fuente del bloque (`freeBlocksStore.fetchBlock` / oferta del día) `:377-397` |
| Puente player→vista (`playableBlocks`, `activeBlockIndex`, `completedBlocks`, `elapsedSeconds`, `allCompletedExercises`) | `:178-185` | `completion.complete(...)` y su endpoint `:312-351` |
| `leaveWithoutSaving`, `needsExitConfirm`, `requestExit`, `onBeforeRouteLeave` con `confirmDialog` | `:187-263` | adónde vuelve (`goToLibre`, `:213-215`) |
| `beginBlock` (`startTimer` + `requestWakeLock` + `stage='countdown'`), `onCountdownDone` | `:265-275` | `onSummaryDone`, `onPickAnother` |
| `onToggleExerciseComplete`, `restartBlock` | `:277-306` | `onCelebrationViewSummary`, `onKeepTraining` (solo Libre) |
| Cierre: `completeBlock()` → `stage='saving'` → rollback si falla → `releaseWakeLock` → `stage='celebration'` (la llamada HTTP es un callback inyectado) | `:312-351` | |
| Montaje/desmontaje: `wakeLock.initialize()`, `clearProgress()`, `initialize()`, `cleanup()` | `:377-404` | |

**Reglas del repo:** el composable expone `cleanup()` y **no** usa `onUnmounted` adentro (CLAUDE.md); la página llama `cleanup()` desde su propio `onUnmounted` (`:399-404`). `onBeforeRouteLeave` y `useRoute/useRouter/useQuasar` son contexto de componente: o los recibe el composable como parámetros o se queda el guard en la página. Pinia `setup`-style y `createLogger('NombreDelModulo')` de `src/utils/logger`.

**Imports de la página (convención `src/...` y relativos de módulo)** (`:75-100`):
```typescript
import { ref, shallowRef, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router'
import { useQuasar } from 'quasar'
import TemploLoader from 'src/components/TemploLoader.vue'
import CountdownOverlay from '../components/player/CountdownOverlay.vue'
import BlockProgressionView from '../components/BlockProgressionView.vue'
import { useSessionPlayer } from '../composables/useSessionPlayer'
import { useWakeLock } from '../composables/useWakeLock'
import { createLogger } from 'src/utils/logger'
import { confirmDialog, type ConfirmDialogOptions } from 'src/utils/confirm-dialog'
import type { Session } from '../types/session'
```
**Sin tests hoy** (H-3). Lo testeable en node con el estilo del repo: `useSessionPlayer` (`composables/useSessionPlayer.ts:45-75,193-300`; `freeBlock: true` desactiva Deuteros `:62-66` y el salto del NUCLEUS `:249-255`) con `vi.mock('@capacitor/preferences', …)` y `vi.mock('src/utils/logger', …)` como en `composables/__tests__/useTokenStorage.test.ts:1-40`, `useWeekData.test.ts:1-30`, y `setActivePinia(createPinia())` como en `modules/progression/stores/__tests__/progression-store-loaded.test.ts:1-33`. Fake timers solo con `toFake` explícito.

### Reloj por ejercicio (punto de más incertidumbre, D-07)

Insumos verificados para el sketch:
- `TimerSpec` (`modules/training/utils/blockTimer.ts:12-21`): `{ kind:'work_rest', workMs, restMs, rounds }` modela exactamente 45 s de trabajo + 10 s de transición; `phaseAt(elapsedMs, spec)` (`:34-50`) devuelve `{ phase, displayMs, round, totalRounds }`. Con `rounds = total de lados` un solo `work_rest` mapea "ronda → ejercicio y lado" sin reloj nuevo, y `block.timerSpec?: TimerSpec | null` ya viaja en el `Block` (`types/session.ts:108-109`). Si un ejercicio de 2 lados necesita cambio de lado, es una ronda más del `work_rest`.
- `BlockProgressionView.vue` pinta `blockTimerView(block.timerSpec, (elapsedSeconds - start) * 1000)` (`:464-465`, `:91-96` el reloj) y tiene `mode?: 'session' | 'free'` (`:246`, `:268-270`). Un tercer modo o un prop sería el punto de contacto. `playerFormatParts(block, mode)` y `playerHeaderLines(block, mode)` (`:471`, `:530`) dependen del modo.
- El estiramiento ya tiene rol `STRETCHING` en la app (`utils/blockMeta.ts`, `roleLabels.ts`).

### `StretchPlayer.vue` (página, request-response)

**Analogo:** `FreeBlockPlayer.vue` (estructura de `v-if` por `stage`, `CountdownOverlay`, `BlockProgressionView`, overlay `saving`, estilos `.free-block-player__*` con `@import 'src/css/quasar.variables.scss'`). Pantalla final corta "Listo. X minutos de estiramiento" (D-07/Specifics) sin RPE ni notas: no copiar `FreeBlockSummary` (tiene "pick-another" / "keep-training"), usar un componente nuevo mínimo, o reutilizar `FreeBlockCelebration.vue` (prop `aura-awarded` + `quote`, `:29-35`). `getQuoteForBlock` de `../data/quotes` es de Libre; para estirar usar texto propio ("aflojar", "soltar", nunca "menos dolor"). Entrada: `GET /sessions/stretch/today`; sin oferta o vencida → aviso y volver a Mi Templo (D-12 "vigencia").

Estados a cubrir: `loading`, `missing`/vencida (copia de `:8-20`), `countdown`, `playing`, `saving`, `done`. Marca `from=push` leída de `route.query.from` (`useRoute`, `:118-148` es el patrón de leer `route.params`).

### `composables/useStretchCompletion.ts`

**Analogo:** `modules/training/composables/useFreeBlockCompletion.ts:1-71` completo (interfaz `Return` con `isSubmitting`, `error`, `complete`, `cleanup`; `api.post<…>`; `extractError`, `isExpectedClientError`; `log.warn` para 4xx esperados y `log.error` para el resto; `finally { isSubmitting.value = false }`). Cambiar endpoint a `/sessions/stretch/complete` y quitar `applyCompletion` del store de Libre. Para `POST /sessions/stretch/events` (`card_seen`, `started`, `push_opened`) usar `api.post` con `.catch` que loguea (patrón de `handleTapNavigation`, `boot/push-notifications.ts:77-90`: fire-and-forget con `log.error('...', err instanceof Error ? { message: err.message } : { message: String(err) })`).

### `modules/training/routes.ts` (ruta nueva)

**Analogo:** `:17-30` (ruta de Libre) y `:31-35`. La de estirar va **sin** flag de build (D-13):
```typescript
  {
    path: 'training/estirar',
    name: 'stretch-player',
    component: () => import('./pages/StretchPlayer.vue'),
    meta: { requiresAuth: true },
  },
```
`name: 'stretch-player'` lo fija el SPEC (§4.2). No choca con `training/session/:date` ni `training/libre/:blockId`.

---

### `modules/progression/utils/today-card.ts` (+ tests)

**Analogo:** `withLibreLink` y `withExtraPrograms` (`today-card.ts:488-541`) y la composición final:
```typescript
// El orden importa: Libre primero (reemplaza al secondary), "Tus programas" solo si quedó libre.
export function resolveTodayCard(input: TodayCardInput): TodayCardModel {
  return withExtraPrograms(withLibreLink(resolveBaseCard(input), input), input)
}
```
(`:538-541`). La nueva `withStretch(model, input)` va **último** (D-09: "Estirar" toma `primary`, el principal anterior baja a `secondary` y desplaza a Libre y "Tus programas"), es pura, y el `switch (model.kind)` de `withLibreLink` (`:508-526`) es el modelo para limitarla a `presencial-turno` con asistencia y a `completada` con asistencia del día. Nuevo campo de input, p. ej. `stretch: { status: 'none' | 'available' | 'done'; minutes: number | null }`, junto a `attendanceMarkedAt` / `presencialSummary` (`:162-167`), con su docblock. Primary de hoy en `presencial-turno`: `attended && input.presencialSummary ? { label:'Repetir sesión', to:{ name:'session-summary' } } : { label:'Ver la sesión', to:'/training' }` (`:429-443`).

**Reglas que `withStretch` no puede romper** (encabezado `:1-67`): alto fijo de 4 filas (kicker, título, estado, una fila de acciones), `pill` o `meta` nunca los dos, **un solo `secondary`**, y 8 campos del modelo. Fase 203 regla 1: una falla del dato `stretch` deja la card como hoy (`status: 'none'`), jamás ofrece ni oculta por "no sé". Estado "hecho": línea "Clase y estiramiento hechos" (`pill` o `meta` según el kind) y el `primary` vuelve al anterior.

**Input en la página:** agregar `stretch: ...` en el objeto de `resolveTodayCard({...})` (`MiTemplo.vue:439-504`, p. ej. después de `libreEnabled: FREE_BLOCKS_ENABLED` en `:490`), leído de un store nuevo (patrón `useTodayBookingStore`: `loaded`, `loadFailed`, `generation` anti-carrera, `load()`, `reset()`; refresco en `MainLayout.vue:295-348` por `visibilitychange` y cada 30 s, y que `todayBookingStore.load()` ya se dispara al volver de otras páginas). Para el criterio "vuelve a Mi Templo y la card muestra 'Clase y estiramiento hechos' sin recargar a mano" (SPEC §5.3.5), la página de estirar debe refrescar el store al completar.

**Tests** (`modules/progression/utils/__tests__/today-card.test.ts`, 1950 líneas, Vitest node):
- Helpers a reutilizar: `baseInput(over)` (`:28-69`, jueves 2026-10-15, todo resuelto), `BOOKING` (`:71-76`), `flat()`, `allCopy()` (`:97-110`), `ACTIVE_SUB`.
- Agregar `stretch: { status: 'none', minutes: null }` al `baseInput` para que todos los tests existentes sigan dando lo mismo.
- Un `describe('resolveTodayCard — estiramiento post-clase (fase 213 D-09)')` nuevo con la matriz estado (`presencial-turno` con/sin asistencia, `completada`, `presencial-proxima`, `online-*`, sin plan) × `stretch.status` (`none|available|done`), más "nunca antes ni durante la clase" (`windowState: 'before'|'open'`), "falla del dato", y los invariantes de alto fijo copiados de `:1610-1828` (`m.pill === null || m.meta === null`, un solo secondary). Modelo de matriz de combinatoria: `:1377-1455` (con `expect(evaluated).toBe(...)` al final para que nadie recorte la matriz).
- El `describe` de Libre apagado (`:1829-1902`) y el de "Repetir sesión" (`:1903-1950`) muestran cómo afirmar `primary`/`secondary` con `toEqual`.

---

### Deep link en frío (APP)

**Archivos:** `boot/push-notifications.ts`, `router/guards.ts` / `router/index.ts`, `stores/useNotificationStore.ts`, `modules/progression/pages/MiTemplo.vue:585-589`, `boot/deep-links.ts`.

**Modelo que funciona** (`boot/deep-links.ts:104-126`):
```typescript
    const authStore = useAuthStore()
    if (!authStore.isAuthenticated) {
      // Logged out: stash the intended route and resume after login ...
      useNotificationStore().setPendingRoute(target)
      try { void router.push('/login') } catch { ... }
      return
    }
    try { void router.push(target) } catch { useNotificationStore().setPendingRoute(target) }
```
`handleTapNavigation` (`push-notifications.ts:73-98`) debe replicar el primer tramo (si no hay sesión → `setPendingRoute(route)` y `/login`) y no confiar en el `catch`. Hoy el consumo del `pendingRoute` está solo en `MiTemplo.vue:586-589` (`if (pendingRoute && pendingRoute !== '/mi-templo') router.push(pendingRoute)`), que sirve porque tras el login se aterriza en Mi Templo. Verificar en teléfono si el plugin nativo retiene el toque hasta que se registra el listener (no verificable desde código, SPEC §4.4).

**Tests:** `boot/__tests__/push-destination.test.ts:1-60` es el molde (mock de `@capacitor/core`, `@capacitor/push-notifications`, `@capacitor-firebase/messaging` y `src/utils/logger`, import directo de la función pura). Para sumar un helper puro testeable (p. ej. `resolveColdStartTarget({ isAuthenticated, route })`) extraerlo y probarlo así. `router/guards.ts` es puro (`resolveGuardRedirect`); su test vive en `el-templo-app/test/router-guard.test.ts` (fuera de `src/`, carpeta `test/` de la app).

---

## 6. Asignaciones de patrón: ADM

### `config/rule-triggers.ts`

**Analogo:** entrada `class_reminder` en `SYSTEM_TEMPLATE_TRIGGER_DESCRIPTIONS` (`:160-181`):
```typescript
  class_reminder:
    'Automático: socios CON reserva anticipada (hecha antes del día de la clase) — turno mañana 30 min antes, turno tarde 1 h antes de su clase.',
};
```
Sumar `stretch_followup: 'Automático: después de la clase, a quienes registraron asistencia (fin de clase + 30 o 60 min según su grupo, tope 21:30 hora de la sede, máximo 3 en 7 días).'`. El comentario `:143-159` avisa que los offsets son **espejo manual** de constantes del API (el admin no importa código del API): si el texto menciona 30/60/21:30, indicar el nombre de las constantes del API en el comentario. No todas las plantillas están en este mapa (`plan_loaded` no está, cae al texto genérico de `systemTriggerDescription`, `:184-189`), pero D-12 pide agregarla. Opcional: `SYSTEM_TEMPLATE_ALTERNATES` (`:192-201`) es solo para pares excluyentes; no aplica.

---

## 7. Patrones compartidos

### Tenancy en toda consulta nueva
**Fuente:** `src/modules/shared/tenant.ts:149-175`.
**Aplica a:** `stretch-service`, `stretch-push`, rutas, tests.
```typescript
export function tenantWhere<T extends { tenantId: AnyMySqlColumn }>(table: T, scope: { tenantId: TenantId }) {
  return eq(table.tenantId, scope.tenantId);
}
export function tenantValues<V extends Record<string, unknown>>(scope: { tenantId: TenantId }, values: V): V & { tenantId: TenantId } {
  return { ...values, tenantId: scope.tenantId };
}
```
En rutas: `await attachCountryScope(request, fastify.db); const ctx = assertTenant(request.scope, "sessions.stretch");` (`free-blocks-routes.ts:127-128`). En jobs: el `ctx` sale de `forEachActiveTenant(db, log, "<jobName>", async (ctx) => {...})` (`src/modules/shared/tenant.ts:~248-277`); el error por tenant se aísla.

### Reloj y zona horaria
**Fuente:** `src/modules/shared/date-utils.ts` (`todayInTz(tz, now)`, `buildClassDateTime(date, "HH:MM", tz)` `:144`), `src/modules/aura/daily-award.ts:84-103` (`resolveBranchTimezone`, `localDateForBranch`). Nunca `toISOString().slice(0,10)` para "hoy" ni UTC−3 fijo. Semana/día: `dateToWeekNumber`, `dateToDayName` (`src/modules/shared/week-dates.ts:23-45`, ancla lunes 2026-02-23).

### Logging y TypeScript
API: `request.log` / `app.log` / el `log` Pino del cron; nunca `console.log`. `catch (err: unknown)` con `err instanceof Error ? err.message : "Unknown error"` (patrón en `notification-cron.ts:421-424`, `novedades-push.ts:328-337`). Sin `any`. App: `createLogger('Nombre')` de `src/utils/logger` y el mismo patrón de `catch`.

### AURA una vez por día
**Fuente:** `src/modules/aura/daily-award.ts:29-70` (`awardOncePerLocalDay`; candado = unique `unique_user_source_ref` de `aura_transactions` con `referenceId = YYYYMMDD` local; nunca lanza). Ver el excerpt en `stretch-service`.

### Encolado de push
**Fuente:** `src/modules/notifications/service.ts:369-482` (`queueNotification`; devuelve -1 sin explicar el motivo, ver H-2). Lo que queda en `pending_notifications` lo despacha `processQueue` en el mismo tick (cada 5 min, `notification-cron.ts:992-1008`).

---

## 8. Sin análogo directo (el planificador usa SPEC / CONTEXT)

| Archivo / pieza | Rol | Flujo | Motivo |
|---|---|---|---|
| Ventana horaria con silencio (21:30-08:00, adelantar a 21:30 si quedan 15 min, nunca al día siguiente) | utilidad pura | transform | No hay precedente de "horario de silencio" (SPEC §1: "ningún horario de silencio"). Lo más cercano: `batchPushDeliveryAt` (`notification-cron.ts:93-100`), pero es un destino fijo, no una ventana con tope. Escribir pura y con test de tabla por sede (AR y Madrid). |
| Tope de frecuencia 3 en 7 días + pausa de 14 días tras 4 sin abrir | servicio | CRUD | `trial_followups` / cadencia de reglas propias (`notification-rules.ts`) existen pero con otra lógica; el cálculo sale de `stretch_offers` propio. |
| Test de componente/página `.vue` en la app | test | n/a | No hay infraestructura (H-3). |
| Reloj por ejercicio dentro del player | UI | event-driven | Solo hay reloj de bloque (`TimerSpec` / `phaseAt`); resolver con el sketch previsto en D-07. |

---

## 9. Metadatos

**Alcance de búsqueda de análogos:** `el-templo-api/src/{db,modules/{sessions,aura,notifications,communications,shared,attendance,scheduling},jobs}`, `el-templo-api/test/{sessions,notifications*,tenancy,migrations,db,fixtures,communications,jobs}`, `el-templo-app/src/{modules/{training,progression},boot,router,stores,composables,config}`, `el-templo-admin/src/{config,components/comunicaciones}`, skills `.claude/skills/el-templo-db-migrations` y memoria de gates de tenancy.
**Archivos leídos/escaneados:** ~70.
**Fecha de extracción:** 2026-11-11.
