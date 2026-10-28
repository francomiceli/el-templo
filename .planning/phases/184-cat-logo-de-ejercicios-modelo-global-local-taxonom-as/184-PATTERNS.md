# Phase 184: Catálogo de ejercicios — modelo global/local + taxonomías - Pattern Map

**Mapped:** 2026-08-31
**Files analyzed:** 22 (16 nuevos, 6 a editar)
**Analogs found:** 22 / 22

**Codebase fuente:** worktree `/home/franco/projects/et-182` (rama `feat/183-panel-tenants`, HEAD `c05f9d17`). Todos los paths abajo son relativos a la raíz del repo (`el-templo-api/...`, `el-templo-admin/...`) tal como existen en ese worktree — la 184 se ramifica de ahí (D-10 del CONTEXT).

**⚠ Lectura obligatoria antes de planificar, NO reproducida acá completa** (son la fuente normativa, este documento solo mapea patrones de código):

- `.docs/saas-multitenancy/08-diseno-modulo-gimnasio.md` (vive en `origin/master`, `git show origin/master:.docs/saas-multitenancy/08-diseno-modulo-gimnasio.md`) — H-1, H-2, Definición 2, Definición 6 (spec completa de `gym_exercises` con columnas, índices, unique de `tenant_scope_key`).
- `.docs/saas-multitenancy/brief-fran-modulo-gimnasio.md` — §2.2 ficha (19 campos), §2.3 taxonomías cerradas.

---

## File Classification

| New/Modified File                                                                                                                          | Role                             | Data Flow                              | Closest Analog                                                                                                                                                                                               | Match Quality                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `el-templo-api/src/db/schema/gym-exercises.ts` (+ satélites: alias, secundarios, variantes/alternativas — modelado a criterio del planner) | model (schema Drizzle)           | CRUD, scope mixto                      | `el-templo-api/src/db/schema/exercises.ts` (forma de tabla/enum/docblock) + `el-templo-api/src/db/schema/tenants.ts` (enum con docblock, `tenant_id` nullable no aplica ahí pero el estilo de comentario sí) | role-match (exercises.ts es tenant-STRICT, no mixto — el mixto es nuevo, sin precedente exacto en el repo; H-1/Def.6 del doc 08 son la fuente normativa) |
| `el-templo-api/src/db/migrations/0217_*.sql` (uno o más, numerados desde 0217)                                                             | migration                        | DDL                                    | `el-templo-api/src/db/migrations/0215_referral_partners.sql`                                                                                                                                                 | exact (estilo de header hand-written)                                                                                                                    |
| `el-templo-api/src/db/tenant-tables.ts` (editar)                                                                                           | config/metadata                  | clasificación estática                 | el propio archivo (ya tiene 2 categorías: `GYM_OWNED_TABLES` / `TENANT_EXEMPT_TABLES` + 2 registros de uniques con motivo obligatorio)                                                                       | exact (agregar 3ª categoría `TENANT_MIXED_SCOPE_TABLES` siguiendo el molde de `TENANT_GLOBAL_UNIQUES`)                                                   |
| `el-templo-api/src/modules/shared/tenant.ts` (editar)                                                                                      | utility (helper de query)        | CRUD                                   | el propio archivo, función `tenantWhere` (línea 149-154)                                                                                                                                                     | exact (agregar función hermana `tenantOrGlobalWhere`)                                                                                                    |
| `el-templo-api/src/modules/shared/modules.ts` (editar)                                                                                     | config/metadata                  | —                                      | el propio archivo, `MODULE_NAMES` + `GIMNASIO_FLAG_KEY` (ya declarado, inerte hasta esta fase)                                                                                                               | exact                                                                                                                                                    |
| `el-templo-api/test/tenant-manifest.ts` (editar)                                                                                           | test-config                      | —                                      | el propio archivo (rename mecánico `templo-module`→`feature-module`, `ModuloTemplo`→`ModuloFeature`, más N entradas nuevas de rutas `/api/gym/*`)                                                            | exact                                                                                                                                                    |
| `el-templo-api/src/db/sentinel/install.ts` + `el-templo-api/src/db/scripts/lint-tenant.ts` (editar)                                        | middleware/guard (gates de CI)   | —                                      | uso existente de `isGymOwnedTable`/`strictTablesSet` (`lint-tenant.ts` líneas 178, 318, 897, 951, 978)                                                                                                       | role-match (necesitan exención nominal para las tablas mixtas, patrón igual al de `TENANT_GLOBAL_UNIQUES`)                                               |
| `el-templo-api/src/modules/gimnasio/schemas.ts` (nuevo)                                                                                    | validation (Fastify JSON Schema) | request-response                       | `el-templo-api/src/modules/referral-partners/schemas.ts`                                                                                                                                                     | exact                                                                                                                                                    |
| `el-templo-api/src/modules/gimnasio/types.ts` (nuevo)                                                                                      | model (tipos TS)                 | —                                      | `el-templo-api/src/modules/referral-partners/types.ts`                                                                                                                                                       | exact                                                                                                                                                    |
| `el-templo-api/src/modules/gimnasio/service.ts` (nuevo, catálogo)                                                                          | service                          | CRUD, scope mixto                      | `el-templo-api/src/modules/referral-partners/service.ts`                                                                                                                                                     | role-match (mismo shape de DI/errores; la lectura mixta usa `tenantOrGlobalWhere`, no `tenantWhere`)                                                     |
| `el-templo-api/src/modules/gimnasio/admin-routes.ts` (nuevo)                                                                               | route/controller                 | request-response                       | `el-templo-api/src/modules/referral-partners/admin-routes.ts`                                                                                                                                                | exact                                                                                                                                                    |
| `el-templo-api/src/modules/gimnasio/index.ts` (nuevo)                                                                                      | route (plugin registration)      | —                                      | `el-templo-api/src/modules/referral-partners/index.ts` + `moduleScope()` de `module-registry.ts`                                                                                                             | exact                                                                                                                                                    |
| `el-templo-api/src/modules/shared/permissions.ts` (editar — nuevo set de roles)                                                            | config/metadata                  | —                                      | `TRAINING_ROLES` / `COACH_ROLES` (líneas 26-35)                                                                                                                                                              | role-match (ninguno calza: hace falta `coach+admin+owner` sin `gestion`/`recepcion`)                                                                     |
| `el-templo-api/test/gimnasio/catalog-crud.test.ts` (nuevo)                                                                                 | test                             | integration/HTTP                       | `el-templo-api/test/referral-partners/partner-crud.test.ts`                                                                                                                                                  | exact                                                                                                                                                    |
| `el-templo-api/test/db/tenant-tables.test.ts` (afectado, no reescrito)                                                                     | test                             | —                                      | ya existe, fail-closed sobre `tenant-tables.ts`                                                                                                                                                              | exact                                                                                                                                                    |
| `el-templo-api/test/tenancy/iso-01-manifiesto.test.ts` (afectado, `ENTRADAS_BASELINE`)                                                     | test                             | —                                      | ya existe                                                                                                                                                                                                    | exact                                                                                                                                                    |
| `el-templo-admin/src/pages/gimnasio/CatalogoPage.vue` (nuevo)                                                                              | component (page)                 | request-response, paginado server-side | `el-templo-admin/src/pages/ExercisesPage.vue` + `el-templo-admin/src/pages/AlumnosPage.vue`                                                                                                                  | exact                                                                                                                                                    |
| `el-templo-admin/src/components/gimnasio/EjercicioFichaDialog.vue` (nuevo)                                                                 | component (dialog form)          | request-response                       | `el-templo-admin/src/components/PlanFormDialog.vue` + `el-templo-admin/src/pages/plataforma/TenantWizardPage.vue` (asterisco requerido)                                                                      | exact                                                                                                                                                    |
| `el-templo-admin/src/components/gimnasio/EjercicioScopeBadge.vue` (nuevo)                                                                  | component                        | —                                      | `el-templo-admin/src/composables/useStatusBadge.ts`                                                                                                                                                          | role-match (composable, no componente — pero es el patrón "mapeo valor→{color,label}" a portar a un `.vue`)                                              |
| `el-templo-admin/src/composables/useGymCatalogApi.ts` (nuevo)                                                                              | hook/composable                  | request-response                       | `el-templo-admin/src/composables/usePartnersApi.ts`                                                                                                                                                          | exact                                                                                                                                                    |
| `el-templo-admin/src/constants/gym-taxonomies.ts` (nuevo)                                                                                  | config/constants                 | —                                      | `el-templo-admin/src/tv/timer.ts` (docblock "port 1:1", obliga a cambiar los dos lados)                                                                                                                      | role-match (mismo contrato de espejo, distinto dominio)                                                                                                  |
| `el-templo-admin/src/config/templo-config.ts` (editar — `CATALOGO_ROLES` + categoría `Gimnasio`)                                           | config (nav declarativo)         | —                                      | el propio archivo, bloque `PARTNERS_ROLES`/`TV_CONTROL_ROLES` + entrada de `NAV_MODEL` de Planes/partners                                                                                                    | exact                                                                                                                                                    |
| `el-templo-admin/src/router/routes.ts` (editar — ruta `/catalogo`)                                                                         | route                            | —                                      | el propio archivo, entrada `partners` (línea 162-169)                                                                                                                                                        | exact                                                                                                                                                    |

---

## Pattern Assignments

### Backend — schema y migración

#### `el-templo-api/src/db/schema/gym-exercises.ts` (model, scope mixto)

**Analog de forma de tabla/enum:** `el-templo-api/src/db/schema/exercises.ts` (completo, 102 líneas — ya leído en full, no releer).

**Patrón de import + enum con docblock** (líneas 1-18 de `exercises.ts`):

```typescript
import {
  mysqlTable,
  int,
  varchar,
  boolean,
  mysqlEnum,
  index,
  type AnyMySqlColumn,
} from "drizzle-orm/mysql-core";
import { tenantIdColumn } from "./tenant-column";

export const exerciseLevelEnum = mysqlEnum("exercise_level", [
  "alfa",
  "delta",
  "sigma",
  "omega",
  "spartan",
]);
```

**⚠ NO usar `tenantIdColumn()` en `gym_exercises`.** Esa función produce `int NOT NULL DEFAULT 1` (la forma STRICT que usa `exercises`, `referral_partners`, etc.) — es exactamente lo que H-1 del doc 08 prohíbe para las tablas de scope mixto. `gym_exercises.tenant_id` es `int NULL` a mano, más una columna generada `tenant_scope_key int NOT NULL` (`COALESCE(tenant_id, 0)`, Definición 2 del doc 08) incluida en la unique compuesta — el caso borde de MySQL con NULL está escrito a propósito en el doc, no lo reinventar.

**Self-FK pattern (para `copied_from_exercise_id`, o para variantes/alternativas si el planner las modela como self-FK):** `exercises.ts` líneas 58-61 y 71-74 —

```typescript
canonicalExerciseId: int("canonical_exercise_id").references(
  (): AnyMySqlColumn => exercises.id,
  { onDelete: "set null" },
),
```

**Enum de estado con docblock explicativo (molde para `status`):** `tenants.ts` líneas 45-49 —

```typescript
export const tenantStatusEnum = mysqlEnum("status", [
  "active",
  "suspended",
  "archived",
]);
```

El brief pide `borrador`/`publicado`/`desactivado` — mismo estilo de declaración, con un comentario de una línea por valor (ver Definición 2 del doc 08 para la semántica exacta de cada uno).

**Regla de oro de `mysqlEnum`** (skill `el-templo-db-migrations`, Hard Rule 6): el primer argumento de `mysqlEnum` es el nombre FÍSICO de columna, debe matchear byte-a-byte la migración SQL. Verificar con `grep -n mysqlEnum <schema>.ts` vs `grep -in enum <migration>.sql` antes de commitear.

---

#### `el-templo-api/src/db/migrations/0217_*.sql` (migration)

**Analog:** `el-templo-api/src/db/migrations/0215_referral_partners.sql` (header completo leído, líneas 1-48).

**Header pattern a copiar** (adaptando la numeración y el motivo):

```sql
-- 0217_gym_exercises.sql
-- Fase 184 (CAT-01, CAT-02, CAT-06): catálogo de ejercicios del módulo
-- Gimnasio, scope mixto global/local (doc 08, H-1 Opción A / Definición 2).
--
-- tenant_id es NULLABLE a proposito -- NULL = fila global de la plataforma.
-- tenant_scope_key = COALESCE(tenant_id, 0) resuelve el caso borde de MySQL:
-- una unique compuesta con una columna NULL no impide duplicados (dos filas
-- globales con el mismo nombre pasarian sin error). tenant_scope_key SI va
-- en la unique compuesta.
--
-- Hand-written: db:generate pega contra el drift interactivo preexistente de
-- sessions.goal_plan_type.
--
-- Numeracion: verificado <fecha> contra origin/master Y origin/staging
-- (0216 la tomo la fase 182/183).
--
-- Cero datos de prueba en esta migracion (staging y prod comparten servidor
-- MySQL).
--
-- Un comentario SQL NUNCA debe contener el separador de statements.
```

**Reglas obligatorias del skill `el-templo-db-migrations`** (ya cargado en contexto de planificación, no repetir el SKILL.md completo acá — solo los puntos con costo de error alto en ESTA fase):

- Numerar **verificando ambas ramas** (`git ls-tree --name-only origin/master el-templo-api/src/db/migrations/` y lo mismo contra `origin/staging`) antes de fijar 0217 — precedente exacto en el header de 0215 (la 184 corre sobre `et-182`, que puede haber divergido de ambas).
- `.sql` en el MISMO commit que el `.ts` del schema.
- Ningún `;` dentro de un comentario `--`.
- Statements idempotentes donde aplique (`WHERE NOT EXISTS`).

---

### Backend — infraestructura de tenancy mixta (H-1)

#### `el-templo-api/src/db/tenant-tables.ts` (editar)

Ya leído completo (664 líneas). Molde exacto a replicar para la 3ª categoría — mismo patrón de `TENANT_GLOBAL_UNIQUES` (motivo obligatorio por entrada, `Record<string,string>`, nunca una allowlist muda):

```typescript
/**
 * Tablas de scope MIXTO (H-1, doc 08): `tenant_id` NULLable, NULL = fila
 * global de la plataforma. Ni gym-owned (no llevan `int NOT NULL DEFAULT 1`)
 * ni exentas (SÍ tienen datos de un gimnasio cuando no son NULL). El motivo
 * es obligatorio por entrada, mismo criterio que TENANT_GLOBAL_UNIQUES.
 */
export const TENANT_MIXED_SCOPE_TABLES: Record<string, string> = {
  gym_exercises:
    "Catálogo de ejercicios del módulo Gimnasio (CAT-01/CAT-02). tenant_id NULL = fila global de la plataforma (doc 08 H-1 Opción A). Lecturas: tenantOrGlobalWhere. Escrituras desde tenant: tenantValues sin cambios, nunca escriben NULL.",
  // ... resto de las tablas MIXTO de la Definición 6 si esta fase también las crea
};

export type MixedScopeTable = keyof typeof TENANT_MIXED_SCOPE_TABLES;

export function isMixedScopeTable(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(TENANT_MIXED_SCOPE_TABLES, name);
}
```

El test `test/db/tenant-tables.test.ts` (fail-closed, ya existe) cruza TODAS las tablas del schema Drizzle contra `GYM_OWNED_TABLES` ∪ `TENANT_EXEMPT_TABLES` ∪ `PLATFORM_PHYSICAL_TABLES` — agregar `gym_exercises` a una tabla nueva sin sumarla a la clasificación deja la suite roja. Verificar si ese test necesita una 4ª pertenencia (`TENANT_MIXED_SCOPE_TABLES`) en su unión, o si se resuelve dejándola fuera de `GYM_OWNED_TABLES`/`TENANT_EXEMPT_TABLES` a propósito — leer el test antes de tocarlo.

#### `el-templo-api/src/modules/shared/tenant.ts` (editar)

Ya leído completo (277 líneas). `tenantWhere` (líneas 149-154) es el molde exacto de firma para el helper hermano:

```typescript
export function tenantWhere<T extends { tenantId: AnyMySqlColumn }>(
  table: T,
  scope: { tenantId: TenantId },
) {
  return eq(table.tenantId, scope.tenantId);
}
```

`tenantOrGlobalWhere` nuevo (nombre fijado por el doc 08 H-1) debe producir `tenant_id IS NULL OR tenant_id = ?` — usar `or(isNull(table.tenantId), eq(table.tenantId, scope.tenantId))` de `drizzle-orm`. Documentar con el mismo nivel de docblock que el resto del archivo (motivo, quién lo llama, qué NO hace — nunca se usa para escritura, `tenantValues` sigue sin cambios).

#### `el-templo-api/src/modules/shared/modules.ts` (editar)

Ya leído completo. `GIMNASIO_FLAG_KEY` YA EXISTE (línea 101) marcado "INTENCIONALMENTE INERTE hasta la fase 184". Esta fase agrega `"gimnasio"` a `MODULE_NAMES` (línea 35-40):

```typescript
export const MODULE_NAMES = [
  "templo-training",
  "templo-gamification",
  "templo-marketing",
  "templo-onboarding",
  "gimnasio", // ← fase 184, doc 08 H-2
] as const;
```

El comentario que hoy prohíbe agregarlo (líneas 97-99) debe borrarse/actualizarse en el mismo commit.

#### `el-templo-api/test/tenant-manifest.ts` (editar)

Ya leído (primeras 200 líneas, patrón entendido). Rename mecánico H-2: `CATEGORIAS` línea 148 (`"templo-module"` → `"feature-module"`), `ModuloTemplo` línea 169 → `ModuloFeature`. Cada ruta nueva `/api/gym/*` (o el prefijo que use `admin-routes.ts`) necesita una entrada exacta en el `Record` (D-01: sin comodines por prefijo) con `categoria: "feature-module", modulo: "gimnasio"`. `ENTRADAS_BASELINE` de `test/tenancy/iso-01-manifiesto.test.ts` se mueve al número real post-rename (nunca copiado de un comentario viejo — regla explícita del propio archivo, líneas 71-75).

#### Sentinel + lint (`el-templo-api/src/db/sentinel/install.ts`, `el-templo-api/src/db/scripts/lint-tenant.ts`)

No releídos en profundidad (fuera del presupuesto de este mapeo — el planner/executor debe leerlos antes de tocarlos). Punto de entrada verificado por grep: ambos consumen `isGymOwnedTable` / `strictTablesSet` de `tenant-tables.ts` (`lint-tenant.ts` líneas 178, 318, 897, 951, 978). `gym_exercises` NO debe pasar por ninguno de los dos caminos STRICT/allowlist existentes — necesita una exención nominal nueva keyed por `isMixedScopeTable`, con motivo, igual que el resto de las exenciones del archivo. El checklist del doc 08 (sección "Checklist de precondiciones") lo exige explícitamente como entregable de esta fase.

---

### Backend — módulo `gimnasio` (CRUD del catálogo)

#### `el-templo-api/src/modules/gimnasio/schemas.ts`

**Analog:** `el-templo-api/src/modules/referral-partners/schemas.ts` (147 líneas, leído completo).

**Patrón de schema de creación con enums cerrados + `additionalProperties: false`** (líneas 13-47):

```typescript
export const createPartnerBodySchema = {
  body: {
    type: "object",
    required: ["name", "code", "branchId", "benefitType", ...],
    properties: {
      name: { type: "string", minLength: 1, maxLength: 120 },
      benefitType: { type: "string", enum: ["discount_percent", "free_pass"] },
      // ...
    },
    additionalProperties: false,
  },
};
```

Para el catálogo, `muscleGroupPrimary`/`movementPattern`/`loadType`/`difficultyLevel` son `enum: [...]` (los valores cerrados del §2.3); `equipment` es un array (`type: "array", items: { type: "string", enum: [...25 valores] }, minItems: 1`). **`additionalProperties: false` es la primera línea de defensa de CAT-06** (rechazar antes de tocar la DB) — el criterio de éxito 3 ("error entendible") se satisface con `enum` de ajv + un mensaje custom si Fastify/ajv no lo da legible de fábrica (revisar `ajvErrors`/plugin de mensajes ya instalado en el proyecto, si existe).

**Patrón de schema de edición sin campos inmutables** (líneas 49-73): `code`/`currency` no están en `updatePartnerBodySchema` porque no son editables. Análogo directo: el schema de edición de `gym_exercises` NO debe incluir `tenantId`/`scope`/`status` (D-04/D-05: sin transiciones de estado en la 184) ni permitir editar un ejercicio global (eso se bloquea en el service, D-06, pero el schema puede reforzarlo excluyendo cualquier control de alcance del payload).

#### `el-templo-api/src/modules/gimnasio/types.ts`

**Analog:** `el-templo-api/src/modules/referral-partners/types.ts` (203 líneas, no releído completo — mismo patrón de imports/exports que se ve reflejado en `admin-routes.ts`: interfaces `CreatePartnerInput`/`UpdatePartnerInput`/`TenantCtx` exportadas desde acá y consumidas por `service.ts` y `admin-routes.ts`).

#### `el-templo-api/src/modules/gimnasio/service.ts`

**Analog:** `el-templo-api/src/modules/referral-partners/service.ts` (1407 líneas — solo las primeras 90 leídas; el resto es material de referidos que no aplica al catálogo, no releer completo).

**Patrón de clase de servicio con DI + constantes nombradas** (líneas 18-77 ya leídas):

```typescript
export class PartnerReferralService {
  constructor(
    private readonly db: DbInstance,
    private readonly log: FastifyBaseLogger,
  ) {}

  async createPartner(...) { /* validación completa ANTES de tocar la DB,
    docblock enumerando el orden de validación paso a paso */ }
}
```

Para `GymCatalogService`: el orden de validación de `createExercise` debe ser (siguiendo el mismo estilo de docblock numerado que `createPartner`): (1) nombre canónico requerido + trim, (2) taxonomías contra las listas cerradas (aunque el schema de Fastify ya filtra, el service es la segunda capa — CAT-06 dice "nunca como validación posterior", pero repetir la validación en el service documenta la invariante y protege contra un futuro caller interno que salte el schema HTTP), (3) `tenantId` SIEMPRE de `assertTenant(request.scope, ...)`, nunca del body (mismo T-179-11 del análogo), (4) status forzado a `'publicado'` server-side (D-04 — el default de columna sigue siendo `'borrador'`, es el endpoint el que lo pisa), (5) unicidad `(tenant_scope_key, nombre_canonico)` → `ConflictError` en `ER_DUP_ENTRY` igual que el análogo maneja duplicados de `code`.

**Lecturas con scope mixto:** en vez de `tenantWhere(gymExercises, ctx)` (que el análogo usa vía `tenantWhere`/`tenantValues` importados de `../shared/tenant`, línea 32), usar `tenantOrGlobalWhere(gymExercises, ctx)` — el nuevo helper de H-1. Las escrituras (`INSERT`) siguen usando `tenantValues(ctx, {...})` sin cambios: nunca se escribe una fila global desde una ruta de tenant.

**Bloqueo D-06** (editar un global desde ruta de tenant): antes del `UPDATE`, el service debe leer la fila y comparar `row.tenantId !== ctx.tenantId` (incluyendo el caso `row.tenantId === null`) → lanzar el mismo tipo de error que usa el análogo para bloqueos de negocio (`ConflictError` o un 403 explícito — decisión del executor, pero la copy del UI-SPEC ya fija el mensaje: "Este ejercicio es del catálogo global y no se puede editar desde tu gimnasio").

**Errores tipados:** import de `el-templo-api/src/modules/shared/errors.ts` (leído completo, extracto):

```typescript
export class AppError extends Error {
  readonly statusCode: number;
  readonly code?: string;
  constructor(message: string, statusCode: number, code?: string) { ... }
}
export class NotFoundError extends AppError { constructor(message = "Recurso no encontrado") { super(message, 404); } }
export class BadRequestError extends AppError { constructor(message = "Solicitud invalida") { super(message, 400); } }
// + ConflictError (409), ValidationError (400) — mismo archivo
```

#### `el-templo-api/src/modules/gimnasio/admin-routes.ts`

**Analog:** `el-templo-api/src/modules/referral-partners/admin-routes.ts` (213 líneas, leído completo).

**Patrón de plugin con guard de rol + scope + try/catch estándar** (líneas 32-63 ya leídas):

```typescript
export const referralPartnersAdminRoutes: FastifyPluginAsync = async (fastify) => {
  const service = new PartnerReferralService(fastify.db, fastify.log);

  fastify.addHook("onRequest", async (request, reply) => {
    await fastify.authenticate(request, reply);
    if (!(MEMBER_LIFECYCLE_ROLES as readonly string[]).includes(request.user.role)) {
      return reply.code(403).send({ error: "Acceso denegado", message: "..." });
    }
    await attachCountryScope(request, fastify.db);
  });

  fastify.get<{ Querystring: {...} }>("/", { schema: listPartnersQuerySchema }, async (request, reply) => {
    try {
      const ctx = assertTenant(request.scope, "referralPartners.list");
      return await service.listPartners(ctx, request.query);
    } catch (err: unknown) {
      handleServiceError(err, reply, request.log, "list referral partners");
    }
  });
  // ... POST, PATCH con el mismo try/catch + assertTenant
};
```

**Diferencia obligatoria vs el análogo:** este plugin además necesita el guard de MÓDULO (`requireModule('gimnasio', db)`), que `referral-partners` no tiene porque no es un módulo opcional. Usar el envoltorio `moduleScope(app, "gimnasio", gimnasioAdminRoutes)` de `el-templo-api/src/modules/shared/module-registry.ts` (función completa leída, líneas 269+) EN VEZ de `app.register(gimnasioAdminRoutes)` directo — es el patrón de una línea que ya existe para no repetir el guard a mano en cada ruta. Ver también `requireModule` (líneas 164-181, ya leído) para el contrato 404-si-apagado.

**Rol nuevo, sin análogo exacto:** D-08 pide `coach + admin + owner` (sin `gestion`/`recepcion`). Ningún set de `el-templo-api/src/modules/shared/permissions.ts` (leído completo — `ALL_STAFF_ROLES`, `OWNER_ROLES`, `ADMIN_ROLES`, `COACH_ROLES`, `TRAINING_ROLES`) calza exacto: `TRAINING_ROLES = ["coach", "owner"]` (falta `admin`), `COACH_ROLES` incluye `gestion`/`recepcion` (de más). Hay que declarar un set nuevo, mismo estilo de comentario que los existentes:

```typescript
/** Roles that can manage the Gimnasio catalog (D-08, fase 184): coach creates/edits, admin/owner too. gestion/recepcion excluded. */
export const GIMNASIO_CATALOG_ROLES = ["coach", "admin", "owner"] as const;
```

#### `el-templo-api/src/modules/gimnasio/index.ts`

**Analog:** `el-templo-api/src/modules/referral-partners/index.ts` (2 líneas — barril simple, re-export del plugin).

---

### Backend — tests de integración

#### `el-templo-api/test/gimnasio/catalog-crud.test.ts`

**Analog:** `el-templo-api/test/referral-partners/partner-crud.test.ts` (primeras 100 líneas leídas completas, suficiente para el patrón).

**Estructura de imports y helpers** (líneas 31-49 ya leídas):

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { eq, sql, and } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  createTestApp,
  getAuthToken,
  cleanAllTestData,
  createStaffUser,
} from "../helpers";
import {
  seedSecondTenant,
  limpiarSegundoGimnasio,
  TENANT_DOS,
  TENANT_TEMPLO,
} from "../fixtures/second-tenant";
import { tenantValues, tenantWhere } from "../../src/modules/shared/tenant";
import * as schema from "../../src/db/schema";
```

**Login/auth vía `admin@test.com`, NUNCA ids hardcodeados** — patrón general del repo (`test/helpers.ts`, `getAuthToken(app, email, password)` líneas 112-127 ya leídas): resolver el usuario por email seedeado (`test/setup.ts`), nunca un id numérico fijo (memoria `feedback_test_user_id_nunca_hardcodeado`).

**Cobertura mínima que el docblock del análogo modela** (líneas 1-30, adaptar la lista a CAT-06/D-02/D-06):

1. Happy path: alta crea la fila con `tenant_id` del scope (nunca del body), `status = 'publicado'` forzado.
2. Taxonomía fuera de lista → 400 con mensaje entendible (criterio de éxito 3).
3. Cruce de scope inválido en variantes/alternativas (D-02: local→global sí, global→local no) → error explícito.
4. RBAC: `GIMNASIO_CATALOG_ROLES` (coach/admin/owner) entra; `gestion`/`recepcion` → 403; sin token → 401.
5. Edición de un global desde ruta de tenant → bloqueada (D-06).
6. Aislamiento de tenant: `GET /` nunca devuelve un ejercicio local de OTRO gimnasio, pero SÍ devuelve los globales — usar el fixture `seedSecondTenant`/`TENANT_DOS` del propio análogo para el segundo gimnasio.
7. Sentinel/lint gates: correr con la tabla `gym_exercises` NO en `TENANT_STRICT_MODULES` (así como está documentado en `tenant-tables.ts`) para no romper el throw fail-closed del sentinel.

**Prohibiciones de ejecución de tests** (de las lecciones de memoria del proyecto, no del código): correr SOLO en foreground con timeout amplio, nunca `run_in_background`.

---

### Frontend — listado y ficha

#### `el-templo-admin/src/pages/gimnasio/CatalogoPage.vue`

**Analogs:** `el-templo-admin/src/pages/ExercisesPage.vue` (header + CTA + tabla, líneas 1-20 y 139-147 leídas) y `el-templo-admin/src/pages/AlumnosPage.vue` (paginación server-side, líneas 780-897 leídas).

**Header + CTA** (`ExercisesPage.vue` líneas 1-20):

```vue
<q-page class="q-pa-md">
  <div class="row items-center q-mb-md">
    <div class="text-h5">Ejercicios</div>
    <q-space />
    <q-btn label="Crear Ejercicio" icon="add" color="primary" @click="showCreateDialog = true" />
  </div>
```

Adaptar título a "Catálogo de ejercicios" (UI-SPEC) y CTA a "Crear ejercicio".

**Tabla paginada server-side** (`ExercisesPage.vue` líneas 139-147):

```vue
<q-table
  :rows="exercises"
  :columns="columns"
  row-key="id"
  :loading="exercisesApi.loading.value"
  v-model:pagination="tablePagination"
  :rows-per-page-options="[25, 50, 100]"
  @request="onTableRequest"
>
```

**Handler y shape de paginación** (`AlumnosPage.vue` líneas 780-897, patrón completo):

```typescript
const tablePagination = ref({
  /* page, rowsPerPage, rowsNumber, sortBy, descending */
});

async function loadMembers() {
  loading.value = true;
  try {
    const result = await membersApi.getMembers({
      // ...filtros
      page: tablePagination.value.page,
      limit: tablePagination.value.rowsPerPage,
    });
    members.value = result.members;
    tablePagination.value.rowsNumber = result.total;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    log.error("Error loading members", { error: message });
    $q.notify({ type: "negative", message: "Error cargando alumnos" });
  } finally {
    loading.value = false;
  }
}

function onTableRequest(props: {
  pagination: { page: number; rowsPerPage: number };
}) {
  tablePagination.value.page = props.pagination.page;
  tablePagination.value.rowsPerPage = props.pagination.rowsPerPage;
  loadMembers();
}
```

`log` es `createLogger()` (CLAUDE.md, nunca `console.*`).

**Empty state / error banner:** ninguno de los dos análogos leídos tiene exactamente el empty-state ilustrado del UI-SPEC (ícono + heading + body + CTA) — es contenido nuevo, seguir el copy y spacing ya fijados en el UI-SPEC directamente (no hay mejor analog en el repo actual para ese bloque específico).

#### `el-templo-admin/src/components/gimnasio/EjercicioFichaDialog.vue`

**Analogs:** `el-templo-admin/src/components/PlanFormDialog.vue` (estructura de diálogo, líneas 2-11 y 249-265 leídas) + `el-templo-admin/src/pages/plataforma/TenantWizardPage.vue` (asterisco de requerido, líneas grep 19/26/126/133/169/176/179/184).

**Esqueleto de diálogo con secciones + separadores + acciones sticky** (`PlanFormDialog.vue`):

```vue
<q-dialog
  :model-value="modelValue"
  @update:model-value="$emit('update:modelValue', $event)"
>
  <q-card style="width: 600px; max-width: 95vw">
    <q-card-section>...título...</q-card-section>
    <q-separator />
    <q-card-section style="max-height: 70vh; overflow-y: auto">
      ...campos del form...
    </q-card-section>
    <q-separator />
    <q-card-actions align="right" class="q-pa-md">
      ...botones...
    </q-card-actions>
  </q-card>
</q-dialog>
```

El UI-SPEC pide `max-width: 720px`, `width: 90vw`, `max-height: 90vh` y `maximized` en `$q.screen.lt.md` — ajustar las dimensiones del análogo, mantener la estructura de 3 bloques (header/body-scrolleable/footer-sticky).

**Asterisco de campo requerido** (`TenantWizardPage.vue`, patrón repetido en 6+ campos):

```vue
<q-input v-model="ownerFirstName" label="Nombre *" dense outlined />
```

Aplicar a `Nombre canónico *`, `Grupo muscular principal *`, `Equipamiento requerido *`, `Patrón de movimiento *`, `Nivel de dificultad *`, `Tipo de carga *` (los 6 obligatorios duros de D-03).

**Sin analog directo en el repo para:** el patrón de 3 modos (`create`/`edit`/`view`) en un solo componente, el chip de categoría derivada con `q-tooltip` + recálculo en vivo, y el confirm de "Descartar cambios" al cerrar con form sucio. Son combinaciones nuevas de primitivas Quasar ya usadas en otros lugares del admin (`q-dialog persistent`, `Dialog.create` para confirms) pero no hay un componente existente que las combine igual — seguir el UI-SPEC como fuente primaria para esa parte.

#### `el-templo-admin/src/components/gimnasio/EjercicioScopeBadge.vue`

**Analog:** `el-templo-admin/src/composables/useStatusBadge.ts` (49 líneas, leído completo) — es un composable, no un componente, pero fija el patrón "mapeo cerrado valor→{color,label}" que el UI-SPEC pide portar a un componente visual (`.vue`) porque además necesita ícono + forma (outline vs sólido), no solo color:

```typescript
const STATUS_COLOR: Record<UserStatus, string> = {
  freemium: "info",
  prueba: "warning",
  activo: "positive",
  inactivo: "grey",
};
const STATUS_LABEL: Record<UserStatus, string> = {
  freemium: "Freemium",
  prueba: "En Prueba",
  activo: "Activo",
  inactivo: "Inactivo",
};
export function useStatusBadge() {
  const getColor = (status) => (status ? STATUS_COLOR[status] : "grey");
  const getLabel = (status, hasUsedTrial?) => {
    /* ... */
  };
  return { getColor, getLabel };
}
```

Adaptar a un `.vue` con `props: { scope: 'global' | 'propio' }` que renderiza `q-badge` con `outline color="info"` + ícono `public` (Global) o `color="secondary" text-color="white"` + ícono `storefront` (Propio) — el mapeo interno puede seguir viviendo en un objeto `Record` calcado del de arriba.

#### `el-templo-admin/src/composables/useGymCatalogApi.ts`

**Analog:** `el-templo-admin/src/composables/usePartnersApi.ts` (452 líneas, leído completo — el analog más reciente y más cercano cronológicamente).

**Patrón completo a replicar** (tipos espejo del API + `loading`/`error` refs + `extractError` + `throw err` + `finally`):

```typescript
import { ref } from 'vue';
import { api } from 'src/boot/axios';
import { extractError } from 'src/utils/extract-error';

export interface CreatePartnerInput { /* espejo del CreatePartnerInput del API, con comentario "Espeja X del API (D-xx)" */ }

export function usePartnersApi() {
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function listPartners(filters = {}): Promise<PartnerListItem[]> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<PartnerListItem[]>('/admin/referral-partners', { params: filters });
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando los partners');
      throw err;
    } finally {
      loading.value = false;
    }
  }
  // create/update/get siguen el mismo bloque try/catch/finally

  function cleanup() { /* no subscriptions/timers */ }

  return { loading, error, listPartners, /* ... */, cleanup };
}
```

`cleanup()` obligatorio por convención del proyecto (CLAUDE.md: "composables exponen `cleanup()`, sin `onUnmounted` interno").

**Tipos a espejar:** `PartnerBenefitType`, `PartnerCommissionType` del análogo (líneas 16-24) son el molde de cómo declarar los enums cerrados del catálogo (`GymMuscleGroup`, `GymEquipment`, `GymMovementPattern`, `GymLoadType`, `GymDifficultyLevel`) como _type_ TS, uno por taxonomía — consumidos por `gym-taxonomies.ts` (abajo) más que declarados acá directamente.

#### `el-templo-admin/src/constants/gym-taxonomies.ts`

**Analog:** `el-templo-admin/src/tv/timer.ts` (docblock leído, líneas 1-40) — el patrón de "constante espejo del API con contrato de mantenimiento escrito":

```typescript
/**
 * <Qué es> es un **port 1:1 de <ruta del API>**. Contrato de mantenimiento:
 * cualquier cambio va PRIMERO al API y después se copia acá. La divergencia
 * no se detecta leyendo: [mecanismo de detección, si existe].
 */
```

Para `gym-taxonomies.ts`: docblock que declare "espejo 1:1 de las 3 listas cerradas + el mapeo de categoría del §2.3 del brief / Definición 2 del doc 08, y de cualquier `mysqlEnum`/`type` que el API declare para las mismas taxonomías" — obligando a tocar los dos lados juntos (UI-SPEC ya lo pide explícitamente en la sección "Taxonomías en el frontend").

---

### Frontend — nav, roles y ruta

#### `el-templo-admin/src/config/templo-config.ts` (editar)

Ya leído completo (337 líneas). Patrón de set de roles nuevo con comentario "Mirrors X del API" (líneas 69-93, ya leídas):

```typescript
export const PARTNERS_ROLES: AdminRole[] = ["gestion", "admin", "owner"];
export const TV_CONTROL_ROLES: AdminRole[] = ["coach", "admin", "owner"];
```

Nuevo:

```typescript
/** Catálogo de ejercicios (D-08, fase 184): coach + admin + owner. Mirrors GIMNASIO_CATALOG_ROLES de la API. */
export const CATALOGO_ROLES: AdminRole[] = ["coach", "admin", "owner"];
```

**Patrón de `NavItem`/`NavCategory` y helpers de visibilidad** (líneas 137-337 ya leídas): `NavItem` tiene `roles?`, `templo?`, `trainingOnly?`, `routines?`, `badge?` — ninguno de esos flags es "gate de módulo por tenant" porque **no existe hoy** ningún módulo opcional con superficie en el nav del admin (`enabledModules`/`isModuleEnabled` no aparecen en absoluto en `el-templo-admin/src`, verificado por grep). El UI-SPEC ya anticipa esto con un fallback explícito: **si el planner no toca el payload de sesión**, gatear el ítem por una constante de config nueva (ej. `GIMNASIO_MODULE_ENABLED_STUB` o similar) y dejar que la página maneje el 404 de `requireModule` con el estado "módulo no disponible" ya definido en el UI-SPEC. Documentar la decisión igual que documenta `TEMPLO_ENABLED`/`TEMPLO_TRAINING_ROUTINES` (comentario extenso explicando el gate y su alcance).

Nueva categoría del `NAV_MODEL` (molde: bloque `Planes` con `partners`, líneas 235-249 ya leídas):

```typescript
{
  header: 'Gimnasio',
  items: [
    { path: '/catalogo', label: 'Catálogo', icon: 'menu_book', roles: CATALOGO_ROLES },
  ],
},
```

Sin `templo: true` (D-07/UI-SPEC decisión discrecional #1: Gimnasio es otro módulo, independiente de la capa Templo/SPOM).

#### `el-templo-admin/src/router/routes.ts` (editar)

Patrón de entrada de ruta con comentario de gate (líneas 162-169 ya leídas):

```typescript
{
  // Partners (fase 179, D-20): CRUD de comercios/marcas con código de
  // referido propio. El nav solo oculta — el gate real es la API
  // (MEMBER_LIFECYCLE_ROLES en referral-partners/admin-routes.ts).
  path: 'partners',
  component: () => import('pages/PartnersPage.vue'),
  meta: { allowedRoles: PARTNERS_ROLES },
},
```

Adaptar a `path: 'catalogo'`, `component: () => import('pages/gimnasio/CatalogoPage.vue')`, `meta: { allowedRoles: CATALOGO_ROLES }`, con el mismo comentario recordando "el nav solo oculta, el gate real es la API".

---

## Shared Patterns

### Autenticación + scope de tenant (backend)

**Fuente:** `el-templo-api/src/modules/referral-partners/admin-routes.ts` líneas 37-48 (`onRequest` hook: `fastify.authenticate` → chequeo de rol → `attachCountryScope`) + `el-templo-api/src/modules/shared/tenant.ts` función `assertTenant` (líneas 192-205, leída completa).
**Aplica a:** `admin-routes.ts` del módulo gimnasio — ES el molde completo, sin variación salvo el set de roles y el guard adicional de `requireModule`.

### Guard de módulo opcional

**Fuente:** `el-templo-api/src/modules/shared/module-registry.ts`, funciones `requireModule` (líneas 164-181) y `moduleScope` (líneas 269+, envoltorio de una línea).
**Aplica a:** el registro del plugin `gimnasio` en `app.ts` (o donde se registren los módulos hoy) — usar `moduleScope(app, "gimnasio", gimnasioAdminRoutes, { prefix: "/api/gym" })` en vez de `app.register` directo.

### Manejo de errores (backend)

**Fuente:** `el-templo-api/src/modules/shared/errors.ts` (jerarquía `AppError`/`NotFoundError`/`BadRequestError`/`ConflictError`, leída completa) + `el-templo-api/src/modules/shared/error-handler.ts` (`handleServiceError`, leído completo).
**Aplica a:** todo route handler del módulo gimnasio — `try { ... } catch (err: unknown) { handleServiceError(err, reply, request.log, "<contexto>"); }`.

### Composable API (frontend)

**Fuente:** `el-templo-admin/src/composables/usePartnersApi.ts` (452 líneas, leído completo).
**Aplica a:** `useGymCatalogApi.ts` — patrón completo de `loading`/`error` refs, `extractError`, `throw err` en catch, `finally`, `cleanup()` vacío.

### Badge de estado / alcance (frontend)

**Fuente:** `el-templo-admin/src/composables/useStatusBadge.ts` (49 líneas, leído completo).
**Aplica a:** `EjercicioScopeBadge.vue` — mapeo `Record<clave, {color,label}>` cerrado, con fallback grey/em-dash para valores nulos.

### Nav declarativo + RBAC (frontend)

**Fuente:** `el-templo-admin/src/config/templo-config.ts` (337 líneas, leído completo — `NavItem`/`NavCategory`, `isNavItemVisible`/`isNavCategoryVisible`, líneas 137-337).
**Aplica a:** la entrada nueva de `NAV_MODEL` + `CATALOGO_ROLES` + la ruta en `routes.ts`.

### Clasificación de tenancy (backend, el corazón de esta fase)

**Fuente:** `el-templo-api/src/db/tenant-tables.ts` (664 líneas, leído completo) + `el-templo-api/src/modules/shared/tenant.ts` (277 líneas, leído completo).
**Aplica a:** TODA tabla y TODA query nueva de `gym_exercises` — es el único patrón sin precedente idéntico en el repo (scope mixto es nuevo), por lo que el doc 08 (H-1, Definición 2, Definición 6) manda por encima de cualquier heurística de analogía.

---

## No Analog Found

| File                                                                                                                           | Role             | Data Flow        | Reason                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------ | ---------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tablas satélite de la ficha (alias/sinónimos, grupos musculares secundarios, variantes/alternativas) — self-FK vs tabla puente | model            | CRUD             | Modelado físico a discreción del planner (CONTEXT: "Claude's Discretion"). Ningún módulo del repo tiene una ficha con esta cantidad de relaciones hijas; el criterio de diseño (que la 185 indexe alias sin ALTER) está en el CONTEXT, no en código existente.               |
| `EjercicioFichaDialog.vue` en sus 3 modos (`create`/`edit`/`view`) combinados en un componente                                 | component        | request-response | Combinación nueva de primitivas Quasar ya usadas sueltas en el repo (dialogs, badges, chips de solo-lectura) pero ningún componente existente unifica los 3 modos sobre 19 campos — el UI-SPEC es la fuente primaria de esta pieza.                                          |
| Chip de categoría derivada con recálculo en vivo + `q-tooltip` explicativo                                                     | component        | transform        | No hay precedente de un campo "display derivado, nunca control" en ningún form del admin — es contenido nuevo, UI-SPEC es la fuente.                                                                                                                                         |
| Exención nominal de `gym_exercises` en `sentinel/install.ts` / `lint-tenant.ts`                                                | middleware/guard | —                | No releídos en profundidad por presupuesto del mapeo; el patrón de exención existe (`TENANT_GLOBAL_UNIQUES` en `tenant-tables.ts`) pero el punto de enganche exacto en esos dos archivos debe leerse por el executor antes de tocarlos — no está documentado en detalle acá. |

## Metadata

**Analog search scope:** `el-templo-api/src/db/schema/`, `el-templo-api/src/db/tenant-tables.ts`, `el-templo-api/src/modules/shared/`, `el-templo-api/src/modules/referral-partners/`, `el-templo-api/test/`, `el-templo-admin/src/pages/`, `el-templo-admin/src/components/`, `el-templo-admin/src/composables/`, `el-templo-admin/src/config/`, `el-templo-admin/src/router/`, `el-templo-admin/src/tv/` — todos dentro del worktree `/home/franco/projects/et-182`. Doc 08 leído vía `git show origin/master:.docs/saas-multitenancy/08-diseno-modulo-gimnasio.md` (no existe en el checkout local viejo).
**Files scanned/read in full or targeted ranges:** ~25 archivos de código + 2 documentos normativos.
**Pattern extraction date:** 2026-08-31
