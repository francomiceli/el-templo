# Phase 166: Fundación — `tenants`, anclas y scope server-side - Pattern Map

**Mapped:** 2026-07-26
**Files analyzed:** 11 (4 nuevos, 7 modificados)
**Analogs found:** 11 / 11 (todos con análogo real en el repo)

Todos los excerpts de abajo son **texto real del repo** (path + líneas verificadas al
2026-07-26 en el checkout `/home/franco/projects/el-templo`, rama
`fix/referral-preview-y-refresh-ficha`). No hay código inventado.

---

## 0. Hechos operativos que el planner necesita ANTES de escribir planes

### 0.1 Numeración de migraciones — el máximo real es **0189**, y este checkout está atrasado

```
# working tree actual (rama fix/referral-preview-y-refresh-ficha):
ls src/db/migrations | sort | tail -2   →  0181_debt_management.sql, meta

# origin/master, origin/staging y feat/164-tv-sucursal (los 3 idénticos):
0187_deactivate_chapadmalal_branch.sql
0188_bookings_trial_date_index.sql
0189_tv_screen.sql
```

Consecuencias duras:

- **Números libres: `0190` (tanda A) y `0191` (tanda B).** No 0182.
- El checkout principal está **detrás de master** en la carpeta de migraciones. El primer
  plan tiene que arrancar de una rama basada en `origin/master` (o `origin/staging`)
  actualizada, no de este working tree. Ver D-06 del CONTEXT: reservar el bloque
  verificando el máximo real en ese momento (0189 puede haberse movido si el worktree
  `et-164-tv` mergea antes).
- `feature/wellhub-integration` tiene 0186 propio (`0186_wellhub_integration.sql`) que
  **no está en master** — si esa rama aterriza, el número 0186 ya está tomado pero no
  compite con 0190/0191.

### 0.2 El runner y el provisioning de tests comparten parser

`test/setup.ts:179-223` aplica **todos** los `.sql` de `src/db/migrations` con el mismo
split que el runner (`--> statement-breakpoint` o `;`-first-then-strip-comments). Por eso:
un `;` dentro de un comentario `--` rompe la suite entera, y **la migración ES el schema
de test** (no hay `db:push` en tests).

`test/setup.ts:170` corre `SET FOREIGN_KEY_CHECKS=0` durante la aplicación y tolera errores
(`Duplicate`, `already exists`, `foreign key constraint fails`, `Unknown column`, …,
líneas 202-213) — o sea que **una migración rota puede pasar silenciosamente en tests**.
Los tests de migración (`test/migrations/*.test.ts`) existen justamente para cerrar ese
agujero: son la única red que verifica que la columna/FK/índice realmente quedó creada.

### 0.3 ⚠️ Hallazgo bloqueante: el seed de tests inserta `branches`/`users` SIN `tenant_id`

`el-templo-api/test/setup.ts:38-61` (corre DESPUÉS de las migraciones, con
`FOREIGN_KEY_CHECKS=1`):

```ts
await conn.query(
  "INSERT IGNORE INTO branches (name, code) VALUES ('Test Branch', 'TEST')",
);
await conn.query(
  "INSERT IGNORE INTO branches (name, code, is_virtual) VALUES ('Templo Online', 'ONLINE', true)",
);
...
await conn.query(
  "INSERT IGNORE INTO users (email, password_hash, first_name, last_name, role, branch_id, level) VALUES ('admin@test.com', ?, 'Test', 'Admin', 'owner', ?, 'spartan')",
  [hash, testBranchId],
);
```

Y `test/helpers.ts:455-466` (`createStaffUser`) inserta users por Drizzle sin `tenantId`.
Y `test/country-scope.test.ts:60-68` inserta branches sin `tenantId`.

Si `tenant_id` queda `NOT NULL` **sin DEFAULT**, estos inserts fallan (o peor: con
`INSERT IGNORE` se convierten en warning y la fila NO se inserta → cascada de fallos
crípticos en toda la suite). El mismo razonamiento aplica al **código viejo en el rolling
deploy** (D-04 pide compatibilidad con código que todavía no manda `tenant_id`).

Dos caminos, ambos ya usados en el repo — el planner decide y lo deja explícito:

- **A (recomendado):** `tenant_id INT NOT NULL DEFAULT 1` en las anclas durante v6.0.
  Cero cambios en `test/setup.ts`/`helpers.ts`, cero riesgo en rolling deploy. El default
  se saca (o no) cuando exista tenant 2. Precedente de columna NOT NULL con DEFAULT en
  anclas: `branches.country` (`src/db/schema/branches.ts:19`) y
  `users.levelOverride` (`src/db/schema/users.ts:113`).
- **B:** `NOT NULL` sin default + tocar `test/setup.ts` (3 inserts), `test/helpers.ts`
  (`createStaffUser`) y cada test que inserta branches/users a mano. Rompe el criterio de
  éxito 4 de la fase ("la suite pasa sin ajustar expectativas") y deja el deploy sin red.

---

## 1. File Classification

| New/Modified File                                               | Role                   | Data Flow                      | Closest Analog                                                                                         | Match Quality |
| --------------------------------------------------------------- | ---------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------ | ------------- |
| `el-templo-api/src/db/schema/tenants.ts` (NEW)                  | model (Drizzle schema) | CRUD / reference-data          | `src/db/schema/debt-management.ts` (enum + uniqueIndex) + `src/db/schema/system-settings.ts` (KV)      | exact         |
| `el-templo-api/src/db/schema/users.ts` (MOD)                    | model                  | CRUD                           | sí mismo — bloque `referralCode`/`referredBy` (Fase 157) + lista de `index(...)`                       | exact (self)  |
| `el-templo-api/src/db/schema/branches.ts` (MOD)                 | model                  | CRUD                           | `src/db/schema/users.ts:95-97` (`branchId` FK notNull)                                                 | exact         |
| `el-templo-api/src/db/schema/index.ts` (MOD)                    | config (barrel)        | n/a                            | sí mismo (1 línea por tabla)                                                                           | exact         |
| `el-templo-api/src/db/migrations/0190_tenants_core.sql` (NEW)   | migration              | batch DDL + seed               | `0181_debt_management.sql` (CREATE TABLE) + `0176_referrals_core.sql:43-55` (seed idempotente)         | exact         |
| `el-templo-api/src/db/migrations/0191_tenant_anchors.sql` (NEW) | migration              | batch DDL + backfill           | `0111_program_enrollments_addon_columns.sql` (ADD NULL → backfill → MODIFY NOT NULL)                   | exact         |
| `el-templo-api/src/modules/shared/country-scope.ts` (MOD)       | middleware (hook)      | request-response               | sí mismo + `src/modules/shared/branch-access.ts` (403 + code) + `src/plugins/auth.ts` (send + rethrow) | exact         |
| `el-templo-api/test/migrations/0190-tenants.test.ts` (NEW)      | test                   | assertion / INFORMATION_SCHEMA | `test/migrations/0121-users-lead-fields.test.ts`                                                       | exact         |
| `el-templo-api/test/shared/tenant-scope.test.ts` (NEW)          | test                   | integration request-response   | `test/country-scope.test.ts`                                                                           | exact         |
| `el-templo-api/test/setup.ts` (MOD, si va camino B)             | test config            | provisioning                   | sí mismo (`seedTestData`, líneas 38-113)                                                               | exact (self)  |
| `el-templo-api/test/helpers.ts` (MOD, si va camino B)           | test utility           | fixture                        | `createStaffUser` (426-479)                                                                            | exact (self)  |

---

## 2. Pattern Assignments

### `src/db/schema/tenants.ts` (NEW — model, reference-data)

**Analog primario:** `src/db/schema/debt-management.ts` (el schema más reciente con
`mysqlEnum` + `uniqueIndex` + FK + relations).
**Analog secundario:** `src/db/schema/system-settings.ts` (la tabla KV que `tenant_settings`
espeja) y `src/db/schema/branches.ts` (defaults de país/timezone).

**Imports + enum + tabla con uniqueIndex** (`debt-management.ts:21-55`):

```ts
import {
  mysqlTable,
  int,
  date,
  text,
  timestamp,
  mysqlEnum,
  uniqueIndex,
} from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";
import { balances } from "./balances";
import { users } from "./users";

export const debtManagementStatusEnum = mysqlEnum("status", [
  "activa",
  "cobrada",
  "incobrable",
]);

export const debtManagement = mysqlTable(
  "debt_management",
  {
    id: int("id").primaryKey().autoincrement(),
    balanceId: int("balance_id")
      .references(() => balances.id)
      .notNull(),
    status: debtManagementStatusEnum.default("activa").notNull(),
    promisedPaymentDate: date("promised_payment_date", { mode: "string" }),
    notes: text("notes"),
    updatedBy: int("updated_by").references(() => users.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [uniqueIndex("uniq_debt_management_balance").on(table.balanceId)],
);
```

Notas de copia (todas verificadas contra el repo):

- **`mysqlEnum("...")` 1er arg = NOMBRE DE COLUMNA FÍSICA.** Acá es `"status"` porque la
  columna se llama `status`. El diseño (README §5) escribe
  `mysqlEnum("tenant_status", [...])` → **eso crea la columna `tenant_status`, no
  `status`**. El planner debe elegir uno y que el SQL de 0190 lo espeje byte a byte
  (Hard Rule 6 del skill; incidentes 0138/0139 y `aura_config_source_type` en
  `0176_referrals_core.sql:44-48`).
- **Defaults escalares**: `branches.ts:16-19` es el modelo exacto para
  `defaultCountry`/`defaultTimezone`:
  ```ts
  timezone: varchar("timezone", { length: 50 })
    .default("America/Argentina/Buenos_Aires")
    .notNull(),
  country: varchar("country", { length: 2 }).default("AR").notNull(),
  ```
- **KV de settings**: `system-settings.ts:14-19` es el espejo de `tenant_settings`
  (`settingKey varchar(100)`, `settingValue text notNull`, `updatedAt` con `onUpdateNow`).
  La única diferencia es que el unique pasa de columna simple a `uniqueIndex` compuesto,
  que es exactamente el patrón de `debt-management.ts:54`.
- **Comentario de cabecera**: todos los schemas abren con `// Module: <x>` o un bloque
  `//` explicando invariantes (`branches.ts:1`, `debt-management.ts:1-20`).
- `relations(...)` solo si hace falta para queries relacionales; `branches.ts:32-34` y
  `users.ts:208-213` muestran el estilo. Para `tenants` alcanza con
  `tenantsRelations({ many })` si se quiere, pero **no es obligatorio** (varias tablas no
  declaran relations).

---

### `src/db/schema/users.ts` + `src/db/schema/branches.ts` (MOD — model, CRUD)

**Analog:** el propio `users.ts`, bloque de la Fase 157 (columna FK nueva + índice), que es
el "agregar columna FK a tabla existente" más reciente del repo.

**Columna FK notNull existente (el shape que `tenantId` debe imitar)** (`users.ts:95-97`):

```ts
    branchId: int("branch_id")
      .references(() => branches.id)
      .notNull(),
```

**Comentario + columna + índice agregados en la última fase que tocó `users`**
(`users.ts:166-176` y `users.ts:203-204`):

```ts
    // Phase 157 (REF-01): código de referido compartible tipo FRAN-A3B2 (D-16),
    // único por socio. Nullable: se genera eager para socios nuevos (D-25) y por
    // backfill idempotente para los ~2000 existentes (no en la migración).
    referralCode: varchar("referral_code", { length: 16 }).unique(),
    // Phase 157 (REF-01/D-08): quién lo refirió (self-FK a users). ...
    referredBy: int("referred_by").references((): AnyMySqlColumn => users.id, {
      onDelete: "set null",
    }),
```

```ts
    // Phase 157 (REF-01): lookup de referidos por referidor.
    index("idx_users_referred_by").on(table.referredBy),
```

Reglas de copia:

- El array de índices vive en el 3er argumento de `mysqlTable` (`users.ts:192-205`), estilo
  `(table) => [ index("idx_users_x").on(table.x), ... ]`. **`branches.ts` HOY NO tiene 3er
  argumento** (`branches.ts:12-30`) — agregar `tenant_id` con índice implica introducir el
  callback de índices por primera vez en ese archivo; copiar la forma de `users.ts:192`.
- Convención de nombre de índice: `idx_<tabla>_<columna>` → `idx_users_tenant_id`,
  `idx_branches_tenant_id`.
- **Import circular**: `branches.ts` ya importa `users` y `users.ts` importa `branches`
  (funciona porque las referencias son callbacks). Importar `tenants` desde ambos es
  seguro; `tenants.ts` NO debe importar `users`/`branches` (evita el triángulo).
- Cada columna nueva lleva comentario `// Fase 166 (FUND-0x): ...` explicando por qué —
  es la convención universal en `users.ts`.

---

### `src/db/schema/index.ts` (MOD — config, barrel)

**Analog:** sí mismo. Una línea por archivo, sin orden alfabético (orden histórico de
incorporación); las tablas fundacionales viven arriba:

```ts
export * from "./branches";
export * from "./cash-registers";
export * from "./cost-centers";
export * from "./users";
export * from "./user-branches";
```

`tenants` es fundacional → poner `export * from "./tenants";` **como primera línea**
(antes de `./branches`) o al final del archivo. Riesgo conocido (CONTEXT, Integration
Points): el worktree `et-164-tv` agrega su propio export en la misma zona → conflicto de
merge trivial pero real. Preferir **la primera línea** justamente para no chocar con los
appends de otras ramas.

---

### `src/db/migrations/0190_tenants_core.sql` (NEW — migration, tanda A)

**Analog primario:** `0181_debt_management.sql` (CREATE TABLE hand-written completa).
**Analog secundario:** `0176_referrals_core.sql:43-55` (seed idempotente).

**Header + CREATE TABLE** (`0181_debt_management.sql:1-21`, archivo completo):

```sql
-- Gestión de deudas (brief-fran-reporte-deudas) -- capa de gestión sobre el
-- reporte "Por deuda": promesa de pago, observaciones y estado operativo
-- (activa / cobrada / incobrable). Hand-written (db:generate roto por drift de
-- goal_plan_type -- ver skill el-templo-db-migrations).
-- 1:1 con balances vía balance_id UNIQUE. La fila se crea recién cuando una
-- administrativa gestiona la deuda -- una deuda sin gestión no tiene fila.
-- 'cobrada' se auto-setea cuando el balance llega a <= 0 (BalanceService).

CREATE TABLE IF NOT EXISTS debt_management (
  id INT AUTO_INCREMENT PRIMARY KEY,
  balance_id INT NOT NULL,
  status ENUM('activa', 'cobrada', 'incobrable') NOT NULL DEFAULT 'activa',
  promised_payment_date DATE NULL,
  notes TEXT NULL,
  updated_by INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_debt_management_balance (balance_id),
  CONSTRAINT fk_debt_management_balance FOREIGN KEY (balance_id) REFERENCES balances(id),
  CONSTRAINT fk_debt_management_updated_by FOREIGN KEY (updated_by) REFERENCES users(id)
);
```

Observar: guiones dobles usados como separador de prosa **en vez de `;`** (los `--` internos
son intencionales — Hard Rule 2). `CREATE TABLE IF NOT EXISTS`, `UNIQUE KEY` inline,
`CONSTRAINT fk_<tabla>_<col>` con nombre explícito, timestamps con `ON UPDATE
CURRENT_TIMESTAMP`.

**Seed idempotente (el patrón exacto para la fila `id=1` de El Templo)**
(`0176_referrals_core.sql:50-55`):

```sql
-- Seed idempotente del tope de acumulación (D-12/D-22/DESC-04): 40 por ciento.
INSERT INTO `system_settings` (`setting_key`, `setting_value`)
SELECT 'referral.max_percent_cap', '40'
WHERE NOT EXISTS (
  SELECT 1 FROM `system_settings` WHERE `setting_key` = 'referral.max_percent_cap'
);
```

Para tenants, la variante con `id` explícito (necesaria: el backfill de la tanda B
escribe literalmente `= 1`):

```sql
INSERT INTO tenants (id, name, slug, status, ...)
SELECT 1, 'El Templo', 'el-templo', 'active', ...
WHERE NOT EXISTS (SELECT 1 FROM tenants WHERE id = 1);
```

Otros detalles a copiar de las migraciones recientes:

- Estilo de nombre de archivo: `NNNN_snake_case_corto.sql`.
- Comentario explicando **por qué está escrita a mano** (`db:generate` roto por el drift de
  `sessions.goal_plan_type`) — está en 0176, 0181, 0162.
- El repo mezcla dos estilos de quoting (backticks en 0176/0162, sin backticks en 0181).
  Cualquiera vale; ser consistente dentro del archivo.

---

### `src/db/migrations/0191_tenant_anchors.sql` (NEW — migration, tanda B)

**Analog exacto:** `0111_program_enrollments_addon_columns.sql` — es la ÚNICA migración del
repo que hace el ciclo completo `ADD COLUMN NULL → backfill guarded → MODIFY NOT NULL`,
que es literalmente el D-04 de esta fase.

**Header con la advertencia del `;` y de la idempotencia** (`0111...sql:1-19`):

```sql
-- Phase 112: program_enrollments add-on columns + paused status + backfill
--
-- Adds 4 columns required by the EnrollmentService refactor and admin add-on feature
--   source ENUM NOT NULL (plan_linked plan_bundle admin_addon) - D-01
--   ...
-- Idempotency D-04 - tracked by _migrations row 0111 prevents replay - all
-- intra-file UPDATE statements are guarded by WHERE-on-BEFORE-state so a
-- manual replay outside the runner is a 0-row no-op
--
-- Hand-written SQL (the kit-generator path is unsafe here - meta journal is
-- desynced - see phase 86, 90, 103-01, 111 precedent)
--
-- run-migrations.ts splits on semicolons BEFORE stripping comments so this
-- file MUST NOT contain inline semicolons inside comment lines
```

**Paso 2 — ADD COLUMN nullable + FK + índice en UN solo ALTER** (`0111...sql:26-35`):

```sql
-- Step 2 — Add the 4 new columns. source is added as NULL-tolerant first so
-- the backfill (Step 3) can populate every row before Step 5 tightens it to
-- NOT NULL.
ALTER TABLE program_enrollments
  ADD COLUMN source ENUM('plan_linked','plan_bundle','admin_addon') NULL AFTER notes,
  ADD COLUMN price_paid INT NULL AFTER source,
  ...
  ADD CONSTRAINT fk_enrollments_assigned_by FOREIGN KEY (assigned_by) REFERENCES users(id),
  ADD INDEX idx_enrollments_subscription_id (subscription_id),
  ADD INDEX idx_enrollments_source (source);
```

**Backfill guardado por el estado previo (replay = 0 filas)** (`0111...sql:63-66`):

```sql
UPDATE program_enrollments pe
SET pe.source = 'admin_addon'
WHERE pe.source IS NULL;
```

**Cierre — MODIFY a NOT NULL** (`0111...sql:104-106`):

```sql
-- Step 5 — Tighten source to NOT NULL now that every row has a value.
ALTER TABLE program_enrollments
  MODIFY COLUMN source ENUM('plan_linked','plan_bundle','admin_addon') NOT NULL;
```

Variante compacta del mismo ciclo (3 statements, útil como plantilla mínima):
`0090_completed_sessions_level.sql` — `ADD COLUMN ... NULL AFTER day_id` → `UPDATE ...
WHERE ... IS NULL` → `MODIFY ... NOT NULL`.

**FK agregada en ALTER separado con nombre explícito** (`0162_created_member_id.sql:20-25`):

```sql
ALTER TABLE `financial_transactions`
  ADD COLUMN `created_member_id` int NULL AFTER `idempotency_key`;

ALTER TABLE `financial_transactions`
  ADD CONSTRAINT `fk_financial_tx_created_member`
  FOREIGN KEY (`created_member_id`) REFERENCES `users`(`id`);
```

Y el estilo alternativo de FK+índice sobre `users` en un one-liner
(`0176_referrals_core.sql:39-40`):

```sql
ALTER TABLE `users` ADD INDEX `idx_users_referred_by` (`referred_by`);
ALTER TABLE `users` ADD CONSTRAINT `users_referred_by_users_id_fk` FOREIGN KEY (`referred_by`) REFERENCES `users`(`id`) ON DELETE SET NULL;
```

⚠️ Si se adopta el camino A de §0.3, el `MODIFY` final es
`MODIFY COLUMN tenant_id INT NOT NULL DEFAULT 1` (el DEFAULT hay que repetirlo en el
MODIFY: MySQL lo pierde si no se declara).

---

### `src/modules/shared/country-scope.ts` (MOD — middleware/hook, request-response)

**Analog primario:** sí mismo (el archivo ES la fase).
**Analogs de apoyo:** `src/modules/shared/branch-access.ts` (403 con código estable + log
estructurado), `src/plugins/auth.ts` (cómo un hook manda la respuesta y aborta).

**El select que hay que extender** (`country-scope.ts:86-100`) — este es el punto exacto
donde entra `tenant_id` + el JOIN a `tenants`:

```ts
  // Single SELECT covers users.country + users.branch_id for every role
  // (eliminates the JOIN-to-branches for admin/gestion per D-12, while still
  // populating userBranchId for canAccessBranch Rule 5).
  if (typeof userId === "number") {
    const [row] = await db
      .select({
        country: schema.users.country,
        branchId: schema.users.branchId,
      })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);
    if (row) {
      userBranchId = row.branchId ?? null;
```

**Cómo se hace un JOIN en este mismo archivo** (`country-scope.ts:164-168`, helper
`resolveBranchCountry`) — el patrón `innerJoin` a copiar para `tenants`:

```ts
const [row] = await db
  .select({ country: schema.branches.country })
  .from(schema.users)
  .innerJoin(schema.branches, eq(schema.users.branchId, schema.branches.id))
  .where(eq(schema.users.id, userId));
```

**Contrato del tipo + declaration merging de Fastify** (`country-scope.ts:9-50`): el campo
`tenantId` se agrega a `interface CountryScope` con **comentario doc explicando el
fail-closed**, mismo estilo que el bloque de `country` (líneas 10-18). El
`declare module "fastify" { interface FastifyRequest { scope: CountryScope } }`
(líneas 46-50) no cambia si se mantiene el nombre del tipo; para CD-03 (alias gradual) el
patrón de alias exportado es `export type Scope = CountryScope;` +
`export const attachScope = attachCountryScope;` — o bien renombrar la función y dejar
`export const attachCountryScope = attachScope;` (idéntico costo, elegir uno).

**Asignación final del scope** (`country-scope.ts:157`) — un único punto de escritura:

```ts
request.scope = { country, branchIds, isOwner, role, userBranchId };
```

**Fail-closed + log estructurado a Sentry** (`country-scope.ts:120-128`) — la plantilla para
"tenant no resoluble":

```ts
// Backfill bug / data corruption: ESCALATE to error so Sentry catches
// (admin/gestion MUST have a country; this is not a 4xx-class event).
request.log.error(
  { userId, role },
  "attachCountryScope: admin/gestion has no users.country (data corruption); scope.country=null (default-deny)",
);
country = null;
```

#### Los 19 call sites reales (no 55) — todos con `reply` en scope

`grep -rn "await attachCountryScope(" src/` da **19 invocaciones** en 15 archivos
(analytics, subscriptions×2, campaigns×3, members×2, finance×2, coach, attendance,
gladius×4, scheduling, reports, ratings). Las 56 ocurrencias del CONTEXT incluyen imports y
comentarios. Todas tienen exactamente esta forma:

`src/modules/subscriptions/routes.ts:93-104`:

```ts
fastify.addHook("onRequest", async (request, reply) => {
  await fastify.authenticate(request, reply);
  if (!(SUBSCRIPTION_ROLES as readonly string[]).includes(request.user.role)) {
    return reply.code(403).send({
      error: "Acceso denegado",
      message: "Acceso de administrador requerido",
    });
  }
  await attachCountryScope(request, fastify.db);
});
```

`src/modules/subscriptions/member-routes.ts:56-59` (superficie member app — relevante para
CD-01):

```ts
fastify.addHook("onRequest", async (request, reply) => {
  await fastify.authenticate(request, reply);
  await attachCountryScope(request, fastify.db);
});
```

→ **`reply` ya está disponible en los 19 sitios**, así que agregar un 3er parámetro
opcional (`attachScope(request, db, reply)`) es mecánicamente barato. Alternativa sin tocar
call sites: lanzar desde adentro (ver abajo).

#### Contrato del 403 (CD-02) — los 3 shapes que existen HOY

1. **Con código estable para match exacto del frontend** — `branch-access.ts:53` y
   `:194-198`. **Este es el análogo más cercano** (403 de capa de scope):

```ts
export const BRANCH_OUT_OF_SCOPE = "BRANCH_OUT_OF_SCOPE";
```

```ts
return reply.code(403).send({
  error: "Forbidden",
  message: "No tenés acceso a esta sede",
  code: BRANCH_OUT_OF_SCOPE,
});
```

2. **Shape mayoritario sin código** — `analytics/routes.ts:74-77`, `subscriptions/routes.ts:99`,
   `campaigns/routes.ts:179`, etc.:

```ts
return reply.code(403).send({
  error: "Acceso denegado",
  message: "Acceso de administrador requerido",
});
```

3. **Throw de `AppError`** — `src/modules/shared/errors.ts:8-23` y `:82-86`:

```ts
export class AppError extends Error {
  readonly statusCode: number;
  /**
   * Optional machine-readable discriminator ... The default route error handler
   * does NOT serialize this — a route must surface it explicitly.
   */
  readonly code?: string;
  constructor(message: string, statusCode: number, code?: string) { ... }
}

export class ForbiddenError extends AppError {
  constructor(message = "Acceso denegado") {
    super(message, 403);
  }
}
```

**Dato duro para el planner:** `grep -rn "setErrorHandler" src/` → **0 hits**. No hay error
handler de app. `handleServiceError` (`src/modules/shared/error-handler.ts:36-40`) sí es el
mapper de los catch de rutas, y **descarta `code`**:

```ts
if (err instanceof AppError) {
  const label = STATUS_LABELS[err.statusCode] ?? "Error desconocido";
  reply.code(err.statusCode).send({ error: label, message: err.message });
  return;
}
```

→ Si `attachScope` **lanza** un `ForbiddenError`, el body sale con el serializador default
de Fastify (`{statusCode, error: "Forbidden", message}`) y **el `code` se pierde**. Para
cumplir CD-02 (`"TENANT_SUSPENDED"` visible en el body) hay que **enviar el reply
explícitamente** desde el hook, con `reply` recibido por parámetro — patrón 1 arriba, con
una constante exportada `export const TENANT_SUSPENDED = "TENANT_SUSPENDED";` al lado de
`BRANCH_OUT_OF_SCOPE`.

**Cómo aborta un hook que ya respondió** (`src/plugins/auth.ts:54-63`) — copiar esta
semántica (send + throw) si `attachScope` corta el request desde adentro:

```ts
      } catch (err: unknown) {
        reply.code(401).send({
          error: "No autorizado",
          message: "Token invalido o ausente",
        });
        // Re-throw so handlers that call this inline (instead of via
        // onRequest hook) abort instead of running with request.user === null.
        throw err;
      }
```

Y el guard de "ya se respondió" que usa el repo (`error-handler.ts:35`):
`if (reply.sent) return;`.

---

### `test/migrations/0190-tenants.test.ts` (NEW — test, DDL introspection)

**Analog exacto:** `test/migrations/0121-users-lead-fields.test.ts` (272 líneas, 5 bloques
de test que cubren exactamente lo que esta fase necesita: shape de columna, FK + DELETE_RULE,
índices, round-trip Drizzle, idempotencia de `_migrations`).

**Helper de introspección + tipos de fila** (`0121-...test.ts:24-68`):

```ts
interface ColumnRow {
  COLUMN_NAME: string;
  DATA_TYPE: string;
  COLUMN_TYPE: string;
  IS_NULLABLE: string;
  COLUMN_DEFAULT: string | null;
}

async function getColumn(
  app: FastifyInstance,
  tableName: string,
  columnName: string,
): Promise<ColumnRow | undefined> {
  const result = (await app.db.execute(
    sql`SELECT COLUMN_NAME, DATA_TYPE, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = ${tableName}
          AND COLUMN_NAME = ${columnName}`,
  )) as unknown as [ColumnRow[]];
  const rows = Array.isArray(result) ? result[0] : (result as ColumnRow[]);
  return Array.isArray(rows) ? rows[0] : undefined;
}
```

**Assert de FK + DELETE_RULE** (`0121-...test.ts:127-155`):

```ts
    const fkResult = (await app.db.execute(
      sql`SELECT CONSTRAINT_NAME, TABLE_NAME, COLUMN_NAME,
                 REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
          FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
          WHERE TABLE_SCHEMA = DATABASE()
            AND CONSTRAINT_NAME = 'users_created_by_users_id_fk'
            AND REFERENCED_TABLE_NAME IS NOT NULL`,
    )) as unknown as [FKRow[]];
    ...
    expect(fk?.REFERENCED_TABLE_NAME).toBe("users");
```

**Assert de índices** (`0121-...test.ts:160-172`): `INFORMATION_SCHEMA.STATISTICS` filtrando
`INDEX_NAME IN (...)`.

**Assert de idempotencia** (`0121-...test.ts:264-271`):

```ts
    const result = (await app.db.execute(
      sql`SELECT COUNT(*) AS n FROM _migrations WHERE name = '0121_users_lead_fields.sql'`,
    )) as unknown as [CountRow[]];
    ...
    expect(Number(row?.n)).toBe(1);
```

**Ciclo de vida del test** (`0121-...test.ts:74-94`): `createTestApp()` en `beforeAll`,
`cleanAllTestData(app)` en `beforeEach` y `afterAll` + `app.close()`.

Para esta fase agregar además: **la fila `tenants` id=1 existe con `slug='el-templo'` y
`status='active'`** (misma forma que el assert de `_migrations`), y que `users.tenant_id`
/ `branches.tenant_id` quedaron `IS_NULLABLE='NO'` con el DEFAULT esperado.

---

### `test/shared/tenant-scope.test.ts` (NEW — test, integration request-response)

**Analog exacto:** `test/country-scope.test.ts` (567 líneas). Es el test hermano: mismo hook,
misma mecánica de fixtures y tokens.

**Imports + fixtures + tokens** (`country-scope.test.ts:13-28` y `48-68`):

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import {
  createTestApp,
  getAuthToken,
  registerUser,
  createStaffUser,
  cleanAllTestData,
} from "./helpers";
import * as schema from "../src/db/schema";
```

```ts
  beforeAll(async () => {
    app = await createTestApp();

    // Start clean. admin@test.com (role=owner, branchId=1) is preserved.
    await cleanAllTestData(app);

    // Ensure branch 1 is AR (default). Seed a fresh ES branch.
    await app.db
      .update(schema.branches)
      .set({ country: "AR" })
      .where(eq(schema.branches.id, 1));

    const esBranchInsert = await app.db
      .insert(schema.branches)
      .values({ name: "BCN Test", code: "BCN-T", country: "ES" })
      .$returningId();
```

**Staff + token** (`country-scope.test.ts:111-124`):

```ts
await createStaffUser(app, {
  email: "ar-admin@test.com",
  password: "ar-admin-pass",
  firstName: "AR",
  lastName: "Admin",
  role: "admin",
  branchId: arBranchId,
  country: "AR",
});
arAdminToken = await getAuthToken(app, "ar-admin@test.com", "ar-admin-pass");
```

**Assert de status code** (`country-scope.test.ts:316-323`):

```ts
    it("AR admin cannot read an ES member (403/404 + no ES identifiers leaked)", async () => {
      ...
      // Either 403 (forbidden, explicit) or 404 (hidden) is acceptable.
      expect([403, 404]).toContain(res.statusCode);
```

Para el test de suspensión de esta fase, el assert debe ser **estricto** (no un `toContain`
de dos códigos): `expect(res.statusCode).toBe(403)` +
`expect(JSON.parse(res.body).code).toBe("TENANT_SUSPENDED")` (o `.error`, según el shape que
elija el planner en §2 del contrato de error). El flujo del test: `UPDATE tenants SET
status='suspended' WHERE id=1` → request autenticado → 403 → restaurar `active` en el
`afterEach`/`afterAll` **sí o sí** (la DB es per-worker y compartida entre archivos del
mismo fork; dejar el tenant suspendido rompe todos los tests siguientes).

**Fixtures de staff** (`test/helpers.ts:426-479`, `createStaffUser`): inserta por Drizzle con
`$returningId()` y auto-inserta `user_branches` para coach/recepción. Es el punto donde
habría que sumar `tenantId` si se va por el camino B de §0.3.

---

### `test/setup.ts` (MOD condicional — test config, provisioning)

Ver §0.3. Si el planner elige el camino B, los 3 inserts a tocar están en
`seedTestData` (`test/setup.ts:42-61`), y el estilo del archivo es `INSERT IGNORE` /
`INSERT ... SELECT ... WHERE NOT EXISTS` (líneas 78-112) para idempotencia. El seed del
tenant **no va acá**: entra por la migración 0190 (`test/setup.ts:179-223` aplica todas las
migraciones antes de `seedTestData`, así que `tenants` id=1 ya existe cuando el seed corre).

---

## 3. Shared Patterns

### 3.1 Migración hand-written (aplica a 0190 y 0191)

**Fuente:** `.claude/skills/el-templo-db-migrations/SKILL.md` + `0111`/`0176`/`0181`.

- Header `--` con fase/requisito, por qué está hand-written, e invariantes.
- **Nunca `;` dentro de un comentario `--`** (el runner splitea por `;` ANTES de stripear
  comentarios; `test/setup.ts:188-197` hace lo mismo → rompe toda la suite).
- Statements idempotentes (`CREATE TABLE IF NOT EXISTS`, `INSERT ... WHERE NOT EXISTS`,
  `UPDATE ... WHERE col IS NULL`).
- `.sql` commiteado en el MISMO commit que el `.ts` del schema (Hard Rule 3), stageando por
  ruta explícita.
- `mysqlEnum` 1er arg == nombre de columna en el SQL, byte a byte, valores en el mismo orden.

### 3.2 Hook de scope: orden de registro

**Fuente:** `src/modules/shared/branch-access.ts:28-34` (doc del contrato) —
aplica a cualquier cosa que lea `request.scope`:

```
 *   - The preHandler reads request.user (post-authenticate) and request.scope
 *     (post-attachCountryScope), so route registration order matters:
 *       onRequest: [authenticate]
 *       preHandler: [attachCountryScope, requireBranchAccess({ from })]
```

En la práctica los módulos lo hacen todo en un `addHook("onRequest")`:
`authenticate` → guard de rol → `attachCountryScope`. El enforcement de tenant va **dentro**
de `attachScope` (D-03), o sea después del guard de rol de cada módulo — coherente con CD-01
(login pre-scope responde, todo lo scoped da 403).

### 3.3 Error 403 con código estable

**Fuente:** `src/modules/shared/branch-access.ts:53, 186-198`. Constante exportada +
`reply.code(403).send({ error, message, code })` + `request.log.warn` estructurado con el
scope adjunto antes de responder:

```ts
request.log.warn(
  {
    userId: request.user?.userId,
    role: request.user?.role,
    branchId,
    scope: request.scope,
  },
  BRANCH_OUT_OF_SCOPE,
);
```

### 3.4 Logging

`request.log.error` para corrupción de datos que debe llegar a Sentry (`country-scope.ts:123`),
`request.log.warn` para denegaciones esperables (`branch-access.ts:186`). Nunca `console.*`
(CLAUDE.md).

### 3.5 TypeScript

`catch (err: unknown)` + narrowing (`test/setup.ts:202-203`, `helpers` y servicios). Sin
`any`. Casts de `app.db.execute` a `[Row[]]` con `as unknown as` (patrón universal en los
tests de migración).

---

## 4. No Analog Found

| File | Role | Data Flow | Reason                                                                 |
| ---- | ---- | --------- | ---------------------------------------------------------------------- |
| —    | —    | —         | Ninguno. Los 11 archivos de la fase tienen análogo directo en el repo. |

Dos matices (no son "sin análogo", pero sí sin precedente exacto):

- **`branches.ts` no tiene todavía callback de índices** — el 3er argumento de `mysqlTable`
  hay que introducirlo copiando la forma de `users.ts:192-205`.
- **No existe precedente de "hook de scope que corta el request con 403"**: hoy
  `attachCountryScope` siempre resuelve (fail-closed vía `country=null`) y el 403 lo emite
  otro actor (`requireBranchAccess`, guards de rol). El enforcement in-query de D-03 es
  nuevo; el patrón a combinar es `branch-access.ts` (body del 403) + `plugins/auth.ts`
  (send + rethrow dentro de un hook).

---

## Metadata

**Analog search scope:** `el-templo-api/src/db/schema/`, `el-templo-api/src/db/migrations/`
(182 archivos), `el-templo-api/src/modules/shared/`, `el-templo-api/src/plugins/`,
`el-templo-api/test/` (incl. `test/migrations/`, `test/setup.ts`, `test/helpers.ts`),
`.docs/saas-multitenancy/` (README §5, doc 03 §3, doc 06 §0-1),
`.claude/skills/el-templo-db-migrations/SKILL.md`.
**Files scanned:** ~30 leídos, ~200 grepeados.
**Pattern extraction date:** 2026-07-26
