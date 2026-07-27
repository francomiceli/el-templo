# Phase 168: Contratos SQL — uniques compuestas e índices por `tenant_id` - Pattern Map

**Mapped:** 2026-07-27
**Files analyzed:** 17 (2 nuevos, 15 modificados)
**Analogs found:** 17 / 17 (todos con analog exacto o role-match)

> **AVISO DE CHECKOUT — leer antes de planificar.**
> El checkout principal (`/home/franco/projects/el-templo`) está en
> `fix/referral-preview-y-refresh-ficha`, con migraciones hasta **0181** y SIN nada de
> tenancy. Todos los analogs de esta fase viven en el worktree de la 167:
> **`/home/franco/projects/et-167-columnas`** (commit `68c447cf`, ya mergeado a master).
> Las rutas de este documento se escriben relativas a `el-templo-api/` y son válidas en
> una rama nueva creada desde `origin/master` (D-09). Cuando cito líneas, son del
> worktree `et-167-columnas`.

---

## Hallazgo que cambia el alcance (leer primero)

**`src/db/tenant-tables.ts` YA EXISTE.** Lo creó la fase 167 (COL-01), con las 87
gym-owned + 4 exentas (`tenants`, `tenant_settings`, `system_settings`,
`labs_inquiries`) y su test fail-closed `test/db/tenant-tables.test.ts`. El D-10 del
CONTEXT dice "nace" — en realidad **se EXTIENDE**: la 168 le agrega la lista M8 con
motivo por unique (D-13) y, si el planner lo decide, la allowlist de uniques en deuda
consciente. La clasificación de tablas y sus 5 tests ya están hechos y no hay que
reescribirlos.

**El comentario de la 167 ya anticipa esta fase** (`src/db/tenant-column.ts:35-38` y
`src/db/migrations/0192_tenant_id_core_ops.sql:46-48`):

```
-- SIN índice explícito sobre tenant_id: InnoDB crea automáticamente el índice de la FK con el
-- nombre del constraint (fk_<tabla>_tenant). La normalización de índices y de las uniques
-- compuestas es trabajo de la fase 168 (CON-02).
```

Eso es la evidencia documental de D-07: los índices ya existen, la 0196 no crea ninguno
`INDEX(tenant_id)`.

**La allowlist de D-14 es MUCHO más grande que 11.** Un conteo sobre los archivos de
schema (excluyendo tablas exentas) da **~62 declaraciones de unique en tablas
gym-owned**. De esas, 11 se convierten (D-01) y 11 quedan globales por M8 (D-02): quedan
**~40 uniques** que hoy NO arrancan con `tenant_id` y que el test fail-closed de D-14 va
a marcar en rojo salvo que entren en la allowlist con motivo. La gran mayoría son
uniques compuestas cuyo primer campo es una FK a una tabla ya scopeada
(`uq_check_in_daily`, `user_branch_unique`, `idx_bookings_member_schedule_date`,
`uniq_tx_target`, `plan_program_unique`, …), o sea seguras por transitividad — pero
seguras ≠ clasificadas. **El planner tiene que presupuestar esa enumeración como trabajo
real** (categoría "derivada de FK scopeada" vs "M8" vs "deuda Templo-module").
Además el test debe excluir `PRIMARY` (INFORMATION_SCHEMA.STATISTICS lo devuelve con
`NON_UNIQUE=0`).

---

## File Classification

| New/Modified File                                       | Rol                       | Data Flow        | Analog más cercano                                  | Match  |
| ------------------------------------------------------- | ------------------------- | ---------------- | --------------------------------------------------- | ------ |
| `src/db/migrations/0196_*.sql`                          | migration (DDL)           | batch            | `src/db/migrations/0192_tenant_id_core_ops.sql`     | exacto |
| `src/db/tenant-tables.ts` (MOD)                         | config / metadata runtime | transform        | él mismo (extender)                                 | exacto |
| `src/db/schema/users.ts` (MOD)                          | model                     | CRUD             | `src/db/schema/tenants.ts:84` (`uq_tenant_setting`) | exacto |
| `src/db/schema/branches.ts` (MOD)                       | model                     | CRUD             | ídem                                                | exacto |
| `src/db/schema/cost-centers.ts` (MOD)                   | model                     | CRUD             | ídem                                                | exacto |
| `src/db/schema/holidays.ts` (MOD)                       | model                     | CRUD             | ídem                                                | exacto |
| `src/db/schema/formats.ts` (MOD)                        | model                     | CRUD             | ídem                                                | exacto |
| `src/db/schema/day-modes.ts` (MOD)                      | model                     | CRUD             | ídem                                                | exacto |
| `src/db/schema/promo-plans.ts` (MOD)                    | model                     | CRUD             | ídem                                                | exacto |
| `src/db/schema/campaigns.ts` (MOD)                      | model                     | CRUD             | ídem                                                | exacto |
| `src/db/schema/notifications.ts` (MOD)                  | model                     | CRUD             | ídem                                                | exacto |
| `src/db/schema/wellhub.ts` (MOD, solo comentario M8)    | model                     | CRUD             | `src/db/schema/tv.ts:79` (comentario de mina)       | exacto |
| `src/db/schema/refresh-tokens.ts` (MOD, comentario)     | model                     | CRUD             | ídem                                                | exacto |
| `src/db/schema/tv.ts` (MOD, comentario)                 | model                     | CRUD             | ídem (ya tiene uno)                                 | exacto |
| `test/migrations/0196-*.test.ts` (NUEVO)                | test (introspección)      | request-response | `test/migrations/0190-0191-tenants.test.ts`         | exacto |
| `test/db/tenant-tables.test.ts` (MOD)                   | test (unit, fail-closed)  | transform        | él mismo                                            | exacto |
| `src/db/scripts/verify-tenant-uniques.ts` (NUEVO, D-12) | script CLI                | batch            | `src/db/scripts/verify-tenant-backfill.ts`          | exacto |

---

## Pattern Assignments

### 1. `src/db/migrations/0196_*.sql` (migration, batch DDL)

**Analog:** `src/db/migrations/0192_tenant_id_core_ops.sql` (223 líneas) — el estilo de
"comentario-narrativa" que pide D-08. Analog secundario para el DDL de índices:
`0191_tenant_anchors.sql:50-54`.

**Cabecera-narrativa a imitar** (`0192_…sql:1-61`, extracto de las partes que se
re-escriben con el contenido de la 168):

```sql
-- Fase 167 (COL-01) -- tanda C1 del doc 06 §1: tenant_id en las 27 tablas del CORE OPERATIVO.
--
-- Grupo: socios/staff/acceso (...), scheduling (...), suscripciones (...) y finanzas (...).
--
-- Ciclo por tabla (4 statements): ADD COLUMN nullable CON DEFAULT -> backfill -> MODIFY
-- NOT NULL -> FK nombrada. Nunca se pasa por un estado en que un binario viejo (que no manda
-- tenant_id) no pueda insertar.
--
-- SIN índice explícito sobre tenant_id: InnoDB crea automáticamente el índice de la FK con el
-- nombre del constraint (fk_<tabla>_tenant). La normalización de índices y de las uniques
-- compuestas es trabajo de la fase 168 (CON-02).
--
-- Hand-written: db:generate está roto por el drift de sessions.goal_plan_type y su journal
-- desincronizado mis-numeraría el archivo (precedente 0176, 0181, 0190, 0191).
--
-- Idempotencia: la fila de _migrations previene el replay por el runner, los UPDATE están
-- guardados por el estado PREVIO (tenant_id IS NULL) y los ADD COLUMN duplicados caen en la
-- heurística de "Duplicate column name" del runner. CUIDADO igual: en un archivo de 108
-- statements esa heurística silencia TODOS los errores posteriores al primer duplicado, así
-- que un re-run tras una falla parcial se debe verificar contra information_schema, no contra
-- _migrations.
--
-- run-migrations.ts splitea por punto y coma ANTES de stripear comentarios, así que ninguna
-- línea de comentario de este archivo puede contener ese caracter.
```

**Patrón de cuerpo — un bloque por tabla, con comentario de una línea de encabezado**
(`0192_…sql:63-73`):

```sql
-- activities
ALTER TABLE activities ADD COLUMN tenant_id INT NULL DEFAULT 1;
UPDATE activities SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE activities MODIFY COLUMN tenant_id INT NOT NULL DEFAULT 1;
ALTER TABLE activities ADD CONSTRAINT fk_activities_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);
```

Para la 168 cada bloque es el `ALTER TABLE ... DROP INDEX ..., ADD UNIQUE ...` atómico de
D-08. **Sintaxis de índices ya usada en el repo** (`0191_tenant_anchors.sql:50-51`, y
`0165_validated_by_and_cost_center_abm.sql:64`):

```sql
-- Paso 4 — branches: índice (toda query gym-owned filtra por tenant_id).
ALTER TABLE branches ADD INDEX idx_branches_tenant_id (tenant_id);
```

```sql
ALTER TABLE cost_centers
  ADD UNIQUE INDEX `uq_cost_centers_name_country` (`name`, `country`);
```

**Nombres EXACTOS de los índices a dropear** (verificados por grep sobre las migraciones
históricas — no inventar, el `DROP INDEX` falla si no coinciden byte a byte):

| Tabla                    | Índice actual                                | Origen                               | Columnas          |
| ------------------------ | -------------------------------------------- | ------------------------------------ | ----------------- |
| `users`                  | `users_email_unique`                         | `0000_fancy_golden_guardian.sql:24`  | `(email)`         |
| `users`                  | `users_dni_unique`                           | `0031_members_management.sql:15`     | `(dni)`           |
| `users`                  | `users_referral_code_unique`                 | `0176_referrals_core.sql:38`         | `(referral_code)` |
| `branches`               | `branches_code_unique`                       | `0000_…sql:9`                        | `(code)`          |
| `cost_centers`           | `uq_cost_centers_name_country`               | `0165_…sql:64`                       | `(name, country)` |
| `promo_plans`            | `promo_plans_promo_code_unique`              | `0063_promo_plans.sql:15`            | `(promo_code)`    |
| `campaign_unsubscribes`  | `uniq_campaign_unsubscribe_email`            | `0134_create_campaign_tables.sql:78` | `(email)`         |
| `notification_templates` | `notification_templates_template_key_unique` | `0062_push_notifications.sql:32`     | `(template_key)`  |
| `day_modes`              | `day_modes_day_of_week_unique`               | `0080_rom_mode_day_modes.sql:12`     | `(day_of_week)`   |
| `holidays`               | `idx_holidays_country_date`                  | `0035_scheduling.sql:60`             | `(country, date)` |
| `formats`                | `formats_name_unique`                        | `0001_petite_triathlon.sql:45`       | `(name)`          |

(Los 11 de D-01. Confirmados con
`grep -rn "<nombre>" el-templo-api/src/db/migrations/*.sql`.)

**Trampas obligatorias de esta migración** (skill `el-templo-db-migrations`, Hard Rules
2/3/6 + runner `src/db/run-migrations.ts:120-132`):

- Ni un solo `;` dentro de una línea `--`. El runner splitea por `;` ANTES de stripear
  comentarios. Alternativa si hacen falta puntos y coma en la prosa: usar
  `--> statement-breakpoint` entre statements (el runner detecta el delimitador y saltea
  el split por `;` entero).
- La heurística `alreadyApplied` del runner: en cuanto un statement tira
  "Duplicate key name" / "Can't DROP", **todos los errores posteriores del archivo se
  saltean** y el archivo se registra igual en `_migrations`. Por eso la verificación es
  contra `INFORMATION_SCHEMA`, nunca contra `_migrations`.
- Numeración a mano: `ls el-templo-api/src/db/migrations/*.sql | sort | tail -3` **en la
  rama nueva desde `origin/master`** (el checkout principal miente: dice 0181). Tope real
  aplicado en prod al 2026-07-27: **0195** → el archivo es `0196_*.sql` (D-03).
- El `.sql` va en el MISMO commit que el schema (Hard Rule 3), con `git add` por ruta.

---

### 2. `src/db/schema/*.ts` — uniques que se vuelven compuestas (model, CRUD)

**Analog canónico de unique compuesta con `tenant_id` primero:** `src/db/schema/tenants.ts:84`.

```typescript
  (t) => [uniqueIndex("uq_tenant_setting").on(t.tenantId, t.settingKey)],
```

**Analog de bloque de índices en el callback de tabla, con comentario que ata el índice a
su migración** (`src/db/schema/cost-centers.ts:34-39`):

```typescript
  (table) => [
    index("idx_cost_centers_country_active").on(table.country, table.isActive),
    // Phase 152 (D-08): unicidad del ABM — un nombre de centro de costo no se
    // repite dentro del mismo país. Índice byte-for-byte con la migración 0165.
    uniqueIndex("uq_cost_centers_name_country").on(table.name, table.country),
  ],
```

**Punto de fricción que el planner debe planificar explícitamente:** 6 de las 11 uniques
NO están en el callback de tabla — son `.unique()` inline sobre la columna, que Drizzle
no sabe componer. Hay que **sacar el `.unique()` de la columna y crear un
`uniqueIndex(...)` en el callback**. En 3 de esas tablas el callback **no existe todavía**
(`promo_plans` y `notification_templates` son `mysqlTable(name, {…})` de 2 argumentos):
hay que agregarlo.

Estado actual, archivo por archivo:

```typescript
// users.ts:123, :161, :218 — inline, hay que moverlas al callback
email: varchar("email", { length: 255 }).unique(),
dni: varchar("dni", { length: 20 }).unique(),
referralCode: varchar("referral_code", { length: 16 }).unique(),
```

```typescript
// users.ts:247-262 — el callback SÍ existe; acá entran las 3 uniques nuevas
// y los 3 índices secundarios de D-05
  (table) => [
    // Fase 166 (FUND-02): toda query gym-owned filtra por tenant_id.
    index("idx_users_tenant_id").on(table.tenantId),
    index("idx_users_branch_id").on(table.branchId),
    ...
  ],
```

```typescript
// branches.ts:37 (inline) + :58-61 (callback existente)
code: varchar("code", { length: 20 }).notNull().unique(),
...
  (table) => [
    // Fase 166 (FUND-02): toda query gym-owned filtra por tenant_id.
    index("idx_branches_tenant_id").on(table.tenantId),
  ],
```

```typescript
// formats.ts:10-14 — inline + callback existente
    name: varchar("name", { length: 100 }).notNull().unique(),
    ...
  (table) => [index("formats_name_idx").on(table.name)],
```

```typescript
// promo-plans.ts:23 — inline y SIN callback (mysqlTable de 2 args): hay que crearlo
  promoCode: varchar("promo_code", { length: 50 }).notNull().unique(),
```

```typescript
// notifications.ts:69 — inline y SIN callback: hay que crearlo
  templateKey: varchar("template_key", { length: 100 }).notNull().unique(),
```

```typescript
// day-modes.ts:15 / holidays.ts:23-25 / campaigns.ts:128-131 — ya en callback,
// solo se antepone table.tenantId
  (table) => [uniqueIndex("day_modes_day_of_week_unique").on(table.dayOfWeek)],
  (table) => [uniqueIndex("idx_holidays_country_date").on(table.country, table.date)],
  (table) => [
    // Suppression idempotency (D-15): one unsubscribe row per email.
    uniqueIndex("uniq_campaign_unsubscribe_email").on(table.email),
  ],
```

**`campaign_unsubscribes` ya tiene escrita la deuda de la mina M3** — el comentario de la
167 (`campaigns.ts:117-120`) anuncia literalmente esta fase, y hay que actualizarlo a
pasado cuando se convierta:

```typescript
// Mina M3 (doc 06 §8-Q5): la unique global sobre `email` pasa a ser compuesta
// (tenant_id, email) en la fase 168 — hoy una baja en un gimnasio suprimiría los
// envíos de todos. Ojo: `user_id` puede ser NULL (baja solo-email), así que el
// backfill de esta tabla es DIRECTO a 1 y no derivado del socio.
```

---

### 3. Comentarios M8 de una línea (D-13) — `wellhub.ts`, `refresh-tokens.ts`, `tv.ts`, `users.ts`, `branches.ts`

**Analog exacto ya en el repo:** `src/db/schema/tv.ts:79` — comentario de una línea que
declara la mina, el motivo y qué fase lo toca. Es el molde del texto pedido por D-13.

```typescript
// Mina M7: esta tabla es PRE-TENANT por diseno — la fila nace antes de que se sepa de quien es el televisor (branch_id nulo hasta el claim), asi que sus dos codigos quedan GLOBALES a proposito y para siempre (lista M8 aprobada), porque el claim tiene que resolverlos sin scope. La columna de abajo entra igual con DEFAULT 1, el claim la va a estampar con el scope del staff (CON-04) y la exencion `/* tenant-safe: pairing pre-claim */` del sentinel la agregan las fases 169/170.
```

Sitios exactos donde va el comentario M8 (una línea encima de cada unique):

| Archivo:línea          | Unique                                        | Categoría del motivo                         |
| ---------------------- | --------------------------------------------- | -------------------------------------------- |
| `users.ts:231`         | `gympassId ... .unique()`                     | id de plataforma externa                     |
| `branches.ts:51`       | `wellhubGymId ... .unique()`                  | id de plataforma externa                     |
| `wellhub.ts:58`        | `uniqueIndex("idx_wellhub_classes_class_id")` | id externo                                   |
| `wellhub.ts:87`        | `uniqueIndex("idx_wellhub_slots_slot_id")`    | id externo                                   |
| `wellhub.ts:116`       | `uniqueIndex("idx_wellhub_bookings_number")`  | id externo                                   |
| `wellhub.ts:142`       | `uniqueIndex("idx_wellhub_events_event_id")`  | id externo (idempotencia de webhook)         |
| `refresh-tokens.ts:42` | `tokenHash ... .unique()`                     | secreto random, lookup pre-scope             |
| `notifications.ts:48`  | `token ... .unique()` (device_tokens)         | token de push, lookup pre-scope              |
| `tv.ts:52`             | `tokenHash ... .unique()` (tv_devices)        | secreto random, lookup pre-scope             |
| `tv.ts:83`             | `userCode ... .unique()` (tv_pairings)        | pre-claim (ya tiene el comentario M7 arriba) |
| `tv.ts:85-87`          | `deviceCodeHash ... .unique()`                | ídem                                         |

Nota: `wellhub.ts:54` (`idx_wellhub_classes_branch_activity`) y `wellhub.ts:83`
(`idx_wellhub_slots_schedule_date`) **no** son M8 — son compuestas sobre FKs ya
scopeadas y caen en la allowlist "derivada de FK" del test de D-14.

---

### 4. `src/db/tenant-tables.ts` (config runtime, transform) — EXTENDER, no crear

**Analog:** el propio archivo. Estilo a replicar: bloque de cabecera con "DE DÓNDE SALE
LA LISTA" / "POR QUÉ IMPORTA MANTENERLA", arrays `as const`, JSDoc con el motivo por
entrada, `Set` privado + helper que acepta `string`.

**Cabecera** (`tenant-tables.ts:1-28`, extracto):

```typescript
// Módulo: tenant-tables — clasificación canónica "¿esta tabla lleva tenant_id?" (v6.0, COL-01)
//
// Esta es la fuente de verdad de qué tablas son gym-owned (llevan la columna
// `tenant_id` que declara `schema/tenant-column.ts`) y cuáles están exentas.
// Vive fuera de `schema/` a propósito: no es una tabla, es metadata del modelo.
//
// POR QUÉ IMPORTA MANTENERLA
// --------------------------
// Esta lista es el insumo directo de las fases siguientes del milestone:
//   - Fase 168 (CON-02): índices y uniques compuestas `(tenant_id, ...)`.
//   - Fase 169 (helpers de escritura): `tenantWhere` / `tenantValues`.
//   - Fase 170 (ISO): sentinel de pool mysql2 y lint en CI.
// Agregar una tabla nueva al schema OBLIGA a clasificarla acá. El test
// `test/db/tenant-tables.test.ts` es fail-closed: una tabla sin clasificar deja
// la suite en rojo, no pasa en silencio.
//
// Los nombres son los FÍSICOS de MySQL (los de `getTableName()`), no los de las
// constantes TypeScript.
```

**Patrón de array con motivo** (`tenant-tables.ts:126-148`) — el JSDoc lleva el motivo
POR ENTRADA, exactamente lo que pide D-13 para las M8:

```typescript
/**
 * Tablas EXENTAS de `tenant_id`, con el motivo de cada una. Son cuatro y no hay
 * una quinta por descuido: cualquier tabla que no esté acá ni en
 * `GYM_OWNED_TABLES` deja el test en rojo.
 *
 * - `tenants` — la raíz del modelo. No puede pertenecer a un tenant: ES el
 *   tenant.
 * - `system_settings` — la mina M2 del diseño (doc 05 §1.7): config global
 *   heredada que se deprecia GRADUALMENTE hacia `tenant_settings`, módulo a
 *   módulo. No recibe `tenant_id` en todo v6.0 — agregárselo crearía dos
 *   fuentes de verdad para la misma clave durante la transición.
 */
export const TENANT_EXEMPT_TABLES = [
  "tenants",
  "tenant_settings",
  "system_settings",
  "labs_inquiries",
] as const;
```

**Patrón de tipos + helper** (`tenant-tables.ts:150-165`) — replicar para
`isTenantGlobalUnique(table, indexName)`:

```typescript
export type GymOwnedTable = (typeof GYM_OWNED_TABLES)[number];
export type TenantExemptTable = (typeof TENANT_EXEMPT_TABLES)[number];

const GYM_OWNED_SET: ReadonlySet<string> = new Set(GYM_OWNED_TABLES);

/**
 * `true` si la tabla física `name` lleva la columna `tenant_id`.
 *
 * Acepta `string` (no `GymOwnedTable`) a propósito: los consumidores de las
 * fases 168-170 clasifican nombres que salen de INFORMATION_SCHEMA, de
 * `getTableName()` o del AST del linter — todos `string` en tiempo de
 * compilación.
 */
export function isGymOwnedTable(name: string): boolean {
  return GYM_OWNED_SET.has(name);
}
```

**Nota de diseño para el planner (discreción de D-10):** las M8 y la deuda Templo son
pares `(tabla, índice)` con motivo, no nombres sueltos. Un `Record<string, string>` con
clave `"tabla.indice"` → motivo encaja mejor que un array plano y sigue permitiendo el
mismo helper `Set`-based; el array `as const` del analog se queda corto acá porque el
motivo es obligatorio (D-13).

---

### 5. `test/migrations/0196-*.test.ts` (test de introspección) — NUEVO

**Analog primario:** `test/migrations/0190-0191-tenants.test.ts` (435 líneas) — es el
único test del repo que ya interroga `INFORMATION_SCHEMA.STATISTICS` para verificar una
unique COMPUESTA y el orden de sus columnas. Analog secundario para el estilo
fail-closed con mensaje accionable: `test/migrations/0192-0195-tenant-columns.test.ts`.

**Por qué existe (justificación a copiar textual, `0190-0191…test.ts:5-19`):**

```typescript
/**
 * POR QUÉ EXISTE ESTE ARCHIVO
 * ---------------------------
 * El provisioning de la DB de tests (`test/setup.ts`, líneas ~165-230) aplica
 * las migraciones con `SET FOREIGN_KEY_CHECKS=0` y **tolera** una lista larga
 * de errores ("Duplicate", "already exists", "Unknown column", "Table",
 * "doesn't exist"…), y después inserta la fila de `_migrations` igual. Es
 * deliberado (hay migraciones de datos que referencian filas que una DB de
 * test fresca no tiene), pero tiene una consecuencia dura: **una migración de
 * DDL rota puede pasar en silencio y la suite entera seguir en verde**.
 */
```

Vale doble para la 0196: `test/setup.ts:207` tolera literalmente `"Can't DROP"`, así que
un `DROP INDEX` con nombre equivocado pasa en verde sin el assert.

**Helpers de introspección — copiarlos tal cual** (`0190-0191…test.ts:59-126`):

```typescript
interface IndexRow {
  INDEX_NAME: string;
  COLUMN_NAME: string;
  SEQ_IN_INDEX: number;
  NON_UNIQUE: number;
}

/**
 * mysql2 devuelve `[rows, fields]`; drizzle `execute` lo pasa tal cual para
 * SQL crudo. Se normaliza acá una sola vez para no repetir el cast en cada
 * test (mismo patrón que test/migrations/0121-users-lead-fields.test.ts).
 */
async function queryRows<T>(
  app: FastifyInstance,
  statement: SQL,
): Promise<T[]> {
  const result = (await app.db.execute(statement)) as unknown as [T[]];
  const rows = Array.isArray(result) ? result[0] : (result as unknown as T[]);
  return Array.isArray(rows) ? rows : [];
}

async function getIndexRows(
  app: FastifyInstance,
  tableName: string,
  indexName: string,
): Promise<IndexRow[]> {
  return queryRows<IndexRow>(
    app,
    sql`SELECT INDEX_NAME, COLUMN_NAME, SEQ_IN_INDEX, NON_UNIQUE
        FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = ${tableName}
          AND INDEX_NAME = ${indexName}
        ORDER BY SEQ_IN_INDEX`,
  );
}
```

**Assert de unique compuesta — el patrón exacto de CON-01 estructural**
(`0190-0191…test.ts:234-245`):

```typescript
// Unique COMPUESTA: dos filas en STATISTICS, en este orden.
const kvIdx = await getIndexRows(app, "tenant_settings", "uq_tenant_setting");
expect(kvIdx).toHaveLength(2);
expect(Number(kvIdx[0].SEQ_IN_INDEX)).toBe(1);
expect(kvIdx[0].COLUMN_NAME).toBe("tenant_id");
expect(Number(kvIdx[1].SEQ_IN_INDEX)).toBe(2);
expect(kvIdx[1].COLUMN_NAME).toBe("setting_key");
expect(Number(kvIdx[0].NON_UNIQUE)).toBe(0);
```

**Fail-closed con mensaje accionable — estilo obligatorio** (`0192-0195…test.ts:101-111`):

```typescript
it("Test 1: las 87 tablas gym-owned tienen tenant_id INT NOT NULL DEFAULT 1 con FK a tenants", () => {
  // El mensaje imprime QUÉ tabla falla y por qué: un fallo que solo dice
  // "esperaba 0" manda a bisecar 108 statements a mano.
  const detail = report.ddlMissing
    .map((issue) => `${issue.table}: ${issue.reason}`)
    .join("\n");
  expect(
    report.ddlMissing,
    `Tanda C parcialmente aplicada en ${report.database}:\n${detail}`,
  ).toEqual([]);
});
```

**Assert de idempotencia en `_migrations`** (`0192-0195…test.ts:161-179`, con la trampa
documentada de `LIKE`):

```typescript
// MySQL LIKE no soporta clases de caracteres ('019[2-5]%' matchea los
// caracteres literales y devuelve 0 siempre): lista explícita.
const rows = await queryRows<{ name: string; n: number }>(
  app,
  sql`SELECT name, COUNT(*) AS n
            FROM _migrations
           WHERE name IN (${sql.join(
             TANDA_C_MIGRATIONS.map((name) => sql`${name}`),
             sql`, `,
           )})
           GROUP BY name
           ORDER BY name`,
);
```

**Ciclo de vida del test** (`0190-0191…test.ts:152-176`) — `createTestApp` +
`cleanAllTestData` en `beforeEach`/`afterAll`:

```typescript
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();
    ...
  });

  afterAll(async () => {
    await cleanAllTestData(app);
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
  });
```

**Limpieza de filas fuera de `TABLES_TO_CLEAN`** (`0190-0191…test.ts:343-371`) — esto es
directamente el molde de los tests CON-01 (insertar duplicado cross-tenant en `branches`
/ `users` y limpiar):

```typescript
    const [inserted] = await app.db
      .insert(schema.branches)
      .values({ name: "Tenancy probe branch", code })
      .$returningId();

    try {
      ...
    } finally {
      // branches NO está en TABLES_TO_CLEAN: la fila se borra acá o queda
      // colgada para las suites vecinas del mismo worker.
      await app.db.delete(schema.branches).where(eq(schema.branches.id, inserted.id));
    }
```

**Seeding del tenant 2 (CON-01, discreción del CONTEXT):** `cleanAllTestData`
(`test/helpers.ts:244-267`) NO borra `tenants` (no está en `TABLES_TO_CLEAN`), así que un
`INSERT INTO tenants` en `beforeAll` + `DELETE` en `afterAll` es suficiente y no
contamina otros archivos. El helper limpia `users` con la comparación NULL-safe
`NOT (email <=> 'admin@test.com')` — un usuario del tenant 2 con email duplicado SÍ se
borra ahí.

---

### 6. `test/db/tenant-tables.test.ts` (test unit fail-closed) — MODIFICAR

**Analog:** él mismo. Los 5 tests existentes (`toEqual([])` sobre "sin clasificar",
"en las dos listas", "ghosts", conteos exactos 87/4/91, y el smoke de `isGymOwnedTable`)
son el molde exacto para la versión de uniques de D-14.

**Mensaje de error fail-closed a replicar** (`tenant-tables.test.ts:52-65`):

```typescript
it("toda tabla del schema está clasificada como gym-owned o exenta", () => {
  const unclassified = [...schemaTables]
    .filter((name) => !gymOwned.has(name) && !exempt.has(name))
    .sort();

  expect(
    unclassified,
    `Tablas del schema Drizzle SIN clasificar en src/db/tenant-tables.ts: ` +
      `${unclassified.join(", ")}. Toda tabla nueva tiene que entrar en ` +
      `GYM_OWNED_TABLES (lleva tenant_id) o en TENANT_EXEMPT_TABLES (con el ` +
      `motivo escrito). No hay tercera opción — el aislamiento multi-tenant ` +
      `de las fases 168/169/170 se construye sobre esta lista.`,
  ).toEqual([]);
});
```

**Introspección del schema Drizzle sin tocar la DB** (`tenant-tables.test.ts:22-45`) —
útil si el planner quiere un segundo gate que compare schema vs allowlist:

```typescript
import { is, getTableName } from "drizzle-orm";
import { MySqlTable } from "drizzle-orm/mysql-core";
import * as schema from "../../src/db/schema";

function collectSchemaTableNames(): Set<string> {
  const names = new Set<string>();
  for (const value of Object.values(schema as Record<string, unknown>)) {
    if (is(value, MySqlTable)) {
      names.add(getTableName(value));
    }
  }
  return names;
}
```

**Ojo con los conteos duros** (`tenant-tables.test.ts:88-96`): el test afirma
`GYM_OWNED_TABLES.length === 87` y `schemaTables.size === 91`. La 168 no agrega tablas,
así que esos números NO cambian — si el planner ve ese test en rojo, es señal de que algo
más se rompió.

---

### 7. `src/db/scripts/verify-tenant-uniques.ts` (script CLI, batch) — NUEVO, para D-12

**Analog:** `src/db/scripts/verify-tenant-backfill.ts` (1326 líneas). Es literalmente el
"molde de la verificación contra staging/prod" que menciona el CONTEXT. El planner debe
decidir si extiende ese archivo o crea uno hermano; el patrón clave es el mismo.

**Cabecera con "cómo se corre" y códigos de salida** (`verify-tenant-backfill.ts:30-55`):

```typescript
 * SOLO LECTURA
 * ------------
 * Este script no ejecuta más que `SELECT` (mitigación T-167-30). Es seguro
 * correrlo contra producción.
 *
 * CÓMO SE CORRE
 * -------------
 *   local / desarrollo:  cd el-templo-api && pnpm db:verify-tenant
 *   base de test:        lo invoca test/migrations/0192-0195-tenant-columns.test.ts
 *   staging / prod:      en el servidor, sobre la build compilada
 *                        NODE_ENV=production node dist/db/scripts/verify-tenant-backfill.js
 *
 * Códigos de salida del CLI: 0 sin discrepancias, 1 con discrepancias, 2 ante
 * error de conexión o de uso.
 *
 * PRIMER STATEMENT: `SELECT DATABASE()`
 * -------------------------------------
 * Staging y producción comparten el mismo host MySQL (`eltemplo_staging` y
 * `eltemplo` son dos bases del mismo server). El nombre de la base va primero
 * en el reporte para que nadie lea el resultado equivocado (T-167-28).
 *
 * La lista canónica de tablas sale de `src/db/tenant-tables.ts` — este archivo
 * no duplica ningún nombre.
```

**La abstracción que permite compartir el código entre CLI y suite**
(`verify-tenant-backfill.ts:63-70`) — es LA razón de que el mismo verificador corra en CI
y contra prod:

```typescript
/**
 * Abstracción de acceso a datos: recibe SQL crudo y devuelve las filas.
 *
 * Existe para que la MISMA verificación corra desde el CLI (conexión `mysql2`
 * propia) y desde la suite (`app.db.execute` con `sql.raw`). Sin ella habría dos
 * implementaciones que divergirían al primer cambio.
 */
export type QueryFn = (statement: string) => Promise<Record<string, unknown>[]>;
```

**Adaptador desde la suite** (`test/migrations/0192-0195-tenant-columns.test.ts:64-74`):

```typescript
function makeQueryFn(app: FastifyInstance): QueryFn {
  return async (statement: string) => {
    const result = (await app.db.execute(sql.raw(statement))) as unknown as [
      Record<string, unknown>[],
    ];
    const rows = Array.isArray(result)
      ? result[0]
      : (result as unknown as Record<string, unknown>[]);
    return Array.isArray(rows) ? rows : [];
  };
}
```

**Main del CLI + carga de env + exit codes** (`verify-tenant-backfill.ts:1286-1325`):

```typescript
async function main(): Promise<number> {
  // Misma carga de env que src/db/run-migrations.ts.
  const envFile =
    process.env.NODE_ENV === "production"
      ? ".env.production"
      : ".env.development";
  dotenv.config({ path: path.resolve(process.cwd(), envFile) });
  dotenv.config({ path: path.resolve(process.cwd(), ".env") });

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "eltemplo",
  });

  try {
    const query: QueryFn = async (statement) => {
      const [rows] = await connection.query(statement);
      return Array.isArray(rows) ? (rows as Record<string, unknown>[]) : [];
    };
    const report = await verifyTenantBackfill(query);
    console.log(formatReport(report));
    return report.discrepancies === 0 ? 0 : 1;
  } finally {
    await connection.end();
  }
}

if (require.main === module) {
  main()
    .then((code) => process.exit(code))
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`verify-tenant-backfill fallo: ${message}`);
      process.exit(2);
    });
}
```

**Forma del reporte** (`verify-tenant-backfill.ts:104-130` y `1189-1200`): interface con
un campo por categoría de hallazgo + `discrepancies: number` agregado, y un `formatReport`
que arranca imprimiendo `Base de datos: ${report.database}`. Replicar para
`uniquesMissingTenantPrefix` / `unclassifiedGlobalUniques` / `tablesWithoutTenantIndex`.

**Registro del script en `package.json`** (línea 14 del `package.json` del api):

```json
    "db:verify-tenant": "tsx src/db/scripts/verify-tenant-backfill.ts",
```

---

## Shared Patterns

### Consulta de índices por `INFORMATION_SCHEMA` (CON-02 + D-14)

**Fuente:** `test/migrations/0190-0191-tenants.test.ts:112-126`
**Aplicar a:** el test nuevo de la 0196 y el script verificador.

La forma canónica ya usada en el repo (y el único lugar donde se leen índices):

```sql
SELECT INDEX_NAME, COLUMN_NAME, SEQ_IN_INDEX, NON_UNIQUE
FROM INFORMATION_SCHEMA.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = ?
ORDER BY SEQ_IN_INDEX
```

Para CON-02 fail-closed (D-11) el filtro es `SEQ_IN_INDEX = 1 AND COLUMN_NAME =
'tenant_id'` agrupado por tabla; para D-14, `NON_UNIQUE = 0` y `INDEX_NAME <> 'PRIMARY'`.
El campo `NON_UNIQUE` viene como `0`/`1` numérico — el repo lo castea siempre con
`Number(...)` antes de comparar (`0190-0191…test.ts:232`).

### Filtro por base actual, nunca hardcodeado

**Fuente:** todos los queries de introspección del repo usan `TABLE_SCHEMA = DATABASE()`.
**Aplicar a:** todo query nuevo. Es lo que hace que el mismo SQL corra contra
`eltemplo_test_<POOL_ID>`, `eltemplo_staging` y `eltemplo` sin ramas.

### Mensajes de assert accionables

**Fuente:** `0192-0195-tenant-columns.test.ts:104-110`, `tenant-tables.test.ts:57-64`
**Aplicar a:** todos los tests de la fase. La convención del repo es
`expect(valor, "mensaje que dice QUÉ falla y qué hacer").toEqual([])` — nunca un
`toBe(0)` pelado.

### Comentario de schema que ata el índice a su migración

**Fuente:** `src/db/schema/cost-centers.ts:36-38`
**Aplicar a:** cada unique convertida.

```typescript
// Phase 152 (D-08): unicidad del ABM — un nombre de centro de costo no se
// repite dentro del mismo país. Índice byte-for-byte con la migración 0165.
```

Para la 168: `// Fase 168 (CON-01): unicidad POR TENANT. Índice byte-for-byte con la migración 0196.`

### Regla del `;` en comentarios SQL (bloqueante)

**Fuente:** `.claude/skills/el-templo-db-migrations/SKILL.md` Hard Rule 2 +
`src/db/migrations/0192_…sql:60-61` (el propio archivo se auto-documenta).
**Aplicar a:** la 0196 entera. Precedente que rompió todo CI: migración 0119. Precedente
reciente en tenancy: la 0188 lo volvió a pisar (memoria del proyecto).

---

## Lookups que motivan los índices secundarios (D-05)

Sitios reales confirmados en el worktree — el planner puede citarlos en el comentario de
la migración para justificar cada `INDEX`:

| Índice nuevo                   | Sitio                                                               | Código                                                      |
| ------------------------------ | ------------------------------------------------------------------- | ----------------------------------------------------------- |
| `users(email)`                 | `src/modules/auth/routes.ts:~66-70`                                 | `.from(users).where(eq(users.email, email)).limit(1)`       |
| `users(dni)`                   | `src/modules/auth/routes.ts:~82-86`                                 | `.from(users).where(eq(users.dni, dni)).limit(1)`           |
| `users(referral_code)`         | `src/modules/referrals/service.ts:~120-126` (`resolveReferralCode`) | `.from(users).where(eq(users.referralCode, code)).limit(1)` |
| `campaign_unsubscribes(email)` | filtro `NOT EXISTS` de envíos                                       | —                                                           |

`src/modules/shared/member-search.ts:36` (búsqueda de DNI con `LIKE`) NO se beneficia y
no motiva ningún índice — el CONTEXT ya lo aclara.

---

## No Analog Found

Ninguno. Los 17 archivos tienen analog directo. Dos matices que el planner debe resolver
sin copiar de un archivo existente:

| Ítem                                                                     | Rol       | Por qué no hay analog exacto                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------ | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ALTER TABLE ... DROP INDEX x, ADD UNIQUE y` en un solo statement (D-08) | migration | Ninguna migración del repo combina DROP+ADD de índice en un statement atómico. La mecánica fina (orden, `ALGORITHM=INPLACE`, si MySQL exige pasos separados porque el índice está siendo usado por una FK) es discreción explícita del CONTEXT y se resuelve reproduciendo local. **Riesgo concreto conocido:** en `users`, `branches` y `cost_centers` el índice de la FK a `tenants` y los uniques conviven; MySQL puede rechazar el `DROP INDEX` de un índice necesario para una FK con `errno 150`. |
| Allowlist de ~40 uniques "derivadas de FK scopeada"                      | config    | El repo no tiene precedente de una allowlist de índices con motivo. El molde de estilo es `TENANT_EXEMPT_TABLES` (motivo por entrada en el JSDoc), pero el contenido hay que enumerarlo desde cero.                                                                                                                                                                                                                                                                                                     |

---

## Metadata

**Analog search scope:**
`/home/franco/projects/et-167-columnas/el-templo-api/src/db/{schema,migrations,scripts}`,
`.../test/{migrations,db,helpers.ts,setup.ts}`, `.../src/modules/{auth,referrals}`,
`/home/franco/projects/el-templo/.claude/skills/el-templo-db-migrations/SKILL.md`.
**Files scanned:** ~35 leídos, ~200 grepeados.
**Pattern extraction date:** 2026-07-27

_Phase: 168-contratos-sql-uniques-compuestas-e-ndices-por-tenant-id_
