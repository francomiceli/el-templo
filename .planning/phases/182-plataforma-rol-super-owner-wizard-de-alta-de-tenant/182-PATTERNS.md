# Fase 182: Plataforma — rol super-owner + wizard de alta de tenant - Mapa de patrones

**Mapeado:** 2026-08-28
**Archivos analizados:** 29 (nuevos + modificados, backend + frontend + infra)
**Analogs encontrados:** 26/29 (3 sin analog directo de código — marcados en "No Analog Found")

**Nota de alcance:** D-18 reinterpreta H-3: la resolución NO es por `Host` de la
API sino por `Origin`/`X-Tenant-Slug` del front. Donde el RESEARCH.md dice
`hostToSlug`/`resolveTenantByHost`, este documento lo traduce a
`originToSlug`/`resolveTenantByOrigin` — el patrón de código (regex anclada,
lookup exacto, bypass total, 404 genérico) es IDÉNTICO; solo cambia qué header
se lee.

---

## File Classification

| Archivo nuevo/modificado | Rol | Flujo de datos | Analog más cercano | Calidad |
|---|---|---|---|---|
| `el-templo-api/src/modules/platform/auth-routes.ts` | controller/route | request-response | `el-templo-api/src/modules/auth/routes.ts` (POST /login, 616-745) | role-match |
| `el-templo-api/src/modules/platform/auth-plugin.ts` | middleware | request-response | `el-templo-api/src/plugins/auth.ts` | exact |
| `el-templo-api/src/modules/platform/provisioning-service.ts` | service | CRUD transaccional | `el-templo-api/src/modules/tree-editor/service.ts` (707-739) + `el-templo-api/src/modules/shared/tenant.ts` (tenantValues) | role-match |
| `el-templo-api/src/modules/platform/host-tenant.ts` (`originToSlug`) | utility + hook | transform | RESEARCH.md §Code Examples (`hostToSlug`) + `app.ts` CORS función (129-152) | sin analog de código, patrón de research |
| `el-templo-api/src/modules/platform/slug.ts` | utility/validación | transform | `el-templo-api/src/db/schema/tenants.ts` `RESERVED_TENANT_SLUGS` (92-106) | partial |
| `el-templo-api/src/modules/platform/audit.ts` | service (write-only) | event-driven | `el-templo-api/src/modules/shared/audit-log.ts` | exact |
| `el-templo-api/src/db/schema/platform-users.ts` | model | CRUD | `el-templo-api/src/db/schema/tenants.ts` (tabla raíz + enum) | role-match |
| `el-templo-api/src/db/schema/platform-audit-log.ts` | model | event-driven | `el-templo-api/src/modules/shared/audit-log.ts` (tabla `audit_log`) | role-match |
| `el-templo-api/src/db/migrations/0216_platform_core.sql` | migration | batch/DDL | `el-templo-api/src/db/migrations/0215_referral_partners.sql` | exact |
| `el-templo-api/src/scripts/create-platform-user.ts` | CLI script | file-I/O (stdin) | `el-templo-api/src/db/scripts/require-tenant.ts` (argv+exit codes) + `run-migrations.ts` (dist compilado) | partial, sin precedente de stdin |
| `el-templo-api/test/fixtures/platform.ts` | test fixture | CRUD | `el-templo-api/test/fixtures/second-tenant.ts` | exact |
| `el-templo-api/test/tenancy/iso-04-platform.test.ts` | test | request-response | `el-templo-api/test/tenancy/iso-03-finance-coach-load.test.ts` | exact |
| `el-templo-api/test/platform/platform-auth.test.ts` | test | request-response | `el-templo-api/test/tenancy/iso-03-auth.test.ts` (estructura) + `test/helpers.ts` | role-match |
| `el-templo-api/test/platform/provision-tenant.test.ts` | test | integración transaccional | `el-templo-api/test/fixtures/second-tenant.ts` (verificación de siembra) | role-match |
| `el-templo-api/test/unit/host-to-slug.test.ts` (→ `origin-to-slug`) | test unitario | transform | sin analog directo (función pura nueva) | no analog |
| `el-templo-api/test/tenant-manifest.ts` (modif.) | config/registro | — | entrada `POST /api/auth/login` existente (233-253) | exact |
| `el-templo-api/src/db/tenant-tables.ts` (modif. `TENANT_EXEMPT_TABLES`) | config | — | bloque existente (163-188) | exact |
| `el-templo-api/src/app.ts` (modif. CORS + hook) | bootstrap/config | request-response | bloque CORS (129-152) + seam `onRoute` (100-104) | exact |
| `el-templo-api/src/modules/shared/modules.ts` (modif., `GIMNASIO_FLAG_KEY`) | config | — | `MODULE_FLAG_ON`/`MODULE_FLAG_OFF` (51-52) | exact |
| `el-templo-api/.env.example` (modif.) | config | — | bloque Wellhub existente | exact |
| `el-templo-admin/src/boot/platform-axios.ts` | provider (boot) | request-response | `el-templo-admin/src/boot/axios.ts` | exact |
| `el-templo-admin/src/stores/usePlatformAuthStore.ts` | store | CRUD | `el-templo-admin/src/stores/useAuthStore.ts` | exact |
| `el-templo-admin/src/router/index.ts` (modif., guard `/plataforma`) | route guard | request-response | `beforeEach` existente (25-76) | exact |
| `el-templo-admin/src/router/routes.ts` (modif., agrega rutas) | route config | — | bloque `/login` (34-38) | exact |
| `el-templo-admin/src/pages/plataforma/PlatformLoginPage.vue` | component (page) | request-response | `el-templo-admin/src/pages/LoginPage.vue` | exact |
| `el-templo-admin/src/pages/plataforma/TenantWizardPage.vue` | component (wizard) | CRUD multi-step | `el-templo-admin/src/components/ProgramWizardDialog.vue` (`q-stepper`) | exact |
| `el-templo-admin/src/pages/plataforma/PlatformHomePage.vue` | component (page) | request-response | `el-templo-admin/src/pages/LoginPage.vue` (layout `q-layout`/`q-page`) | role-match |
| `el-templo-admin/.env.example` (modif., `VITE_PLATFORM_DOMAIN`) | config | — | bloque `VITE_API_URL` existente | exact |
| `deploy/` runbook de infra (nginx wildcard + certbot DNS-01) | docs/infra | — | `deploy/RUNBOOK.md`, `deploy/nginx/*` | role-match |

---

## Pattern Assignments

### `el-templo-api/src/modules/platform/auth-plugin.ts` (middleware, request-response)

**Analog:** `el-templo-api/src/plugins/auth.ts` (registro completo, 70 líneas)

**Patrón a copiar — registro de `@fastify/jwt` + decorador `authenticate`:**
```ts
// el-templo-api/src/plugins/auth.ts:25-65 (analog completo)
const authPlugin: FastifyPluginAsync = async (fastify) => {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET environment variable is required");
  const expiresIn = process.env.JWT_EXPIRES_IN || "7d";
  await fastify.register(jwt, { secret, sign: { expiresIn } });
  fastify.decorate(
    "authenticate",
    async function (request: FastifyRequest, reply: FastifyReply) {
      try {
        await request.jwtVerify();
      } catch (err: unknown) {
        reply.code(401).send({ error: "No autorizado", message: "Token invalido o ausente" });
        throw err; // aborta el handler en vez de correr con request.user === null
      }
    },
  );
};
export default fp(authPlugin, { name: "auth" });
```

**Diferencias OBLIGATORIAS para el plugin de plataforma (RESEARCH §Patrón 1, Pitfall 1/2):**
- `secret: process.env.PLATFORM_JWT_SECRET` — **NUNCA** `JWT_SECRET`. Es el hallazgo de seguridad de la fase: un solo secreto deja que un token de plataforma pase `fastify.authenticate()` de una ruta de tenant.
- Segunda instancia namespaced de `@fastify/jwt`, NO un segundo `fp(authPlugin)` — usar `namespace: "platform"`, `decoratorName: "platformUser"` (nunca `request.user`, que lee `attachScope` y el hook de Sentry en `app.ts:369`), `sign: { aud: "platform", expiresIn: process.env.PLATFORM_JWT_EXPIRES_IN || "8h" }`, `verify: { allowedAud: "platform" }`. Ver RESEARCH.md líneas 282-300 para la forma exacta de la llamada a `fastify.register`.
- El payload usa `platformUserId`, nunca `userId` (colisión semántica con `users.id`).
- El decorador expuesto se llama `requirePlatformAuth`, no `authenticate` — mismo cuerpo (try/catch → 401), pero verificando `request.platformJwtVerify()`.

**Declaración de tipos (module augmentation), copiar la forma de `plugins/auth.ts:5-23`:**
```ts
declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { platformUserId: number; email: string };
    user: { platformUserId: number; email: string }; // vive en request.platformUser, no request.user
  }
}
declare module "fastify" {
  interface FastifyInstance {
    requirePlatformAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}
```

---

### `el-templo-api/src/modules/platform/auth-routes.ts` (controller, request-response)

**Analog:** `el-templo-api/src/modules/auth/routes.ts` — handler `POST /login` (líneas 616-745)

**Patrón a copiar — lookup por email + verificación argon2 + firma:**
```ts
// el-templo-api/src/modules/auth/routes.ts:617-686 (login de tenant, resumido)
fastify.post<{ Body: LoginBody }>("/login", { schema: loginSchema }, async (request, reply) => {
  const { email, password } = request.body;
  const userResults = await fastify.db
    .select({ id: users.id, email: users.email, passwordHash: users.passwordHash, /* ... */ })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (userResults.length === 0) {
    return reply.code(401).send({ error: "No autorizado", message: "Credenciales invalidas" });
  }
  const user = userResults[0];
  const validPassword = await argon2.verify(user.passwordHash, password);
  if (!validPassword) {
    return reply.code(401).send({ error: "No autorizado", message: "Credenciales invalidas" });
  }
  const payload = { userId: user.id, email: user.email, role: user.role };
  const token = fastify.jwt.sign(payload);
});
```

**Adaptación para `POST /api/platform/auth/login`:**
- `SELECT` sobre `platform_users` (tabla exenta, sin `tenantId`), payload `{ platformUserId, email }`, firma con la instancia namespaced (`fastify.platformJwtSign` o el nombre elegido en `jwtSign`).
- Mismo mensaje genérico "Credenciales invalidas" para email inexistente y contraseña mala (RESEARCH §Security, evita enumeración).
- Rate limit (D-08) envuelve esta ruta — ver §Shared Patterns más abajo.
- `GET /api/platform/auth/me` — mismo shape simple que `GET /api/auth/me`, pero leyendo `request.platformUser.platformUserId`.
- El JSON Schema de la ruta sigue el patrón `{ schema: loginSchema }` importado de un archivo `schemas.ts` local al módulo (mismo patrón que `auth/routes.ts:21` `import { registerSchema, loginSchema } from "./schemas"`).

---

### `el-templo-api/src/modules/platform/provisioning-service.ts` (service, CRUD transaccional)

**Analog 1 — forma de `db.transaction`:** `el-templo-api/src/modules/tree-editor/service.ts:707-739`
```ts
await this.db.transaction(async (tx) => {
  const existing = await tx.select({...}).from(schema.exerciseProgressions).where(...);
  // ... deletes/inserts encadenados dentro del MISMO tx
  await tx.insert(schema.exerciseProgressions).values({...});
});
```

**Analog 2 — estampar tenant después del spread:** `el-templo-api/src/modules/shared/tenant.ts:170-175` (`tenantValues`)
```ts
export function tenantValues<V extends Record<string, unknown>>(
  scope: { tenantId: TenantId },
  values: V,
): V & { tenantId: TenantId } {
  return { ...values, tenantId: scope.tenantId }; // tenantId SIEMPRE gana, mitiga mass-assignment (T-169-02)
}
```

**Analog 3 — helper de auditoría write-only dentro de la misma tx (para el paso 8 de `provisionTenant`):** `el-templo-api/src/modules/shared/audit-log.ts` (docblock líneas 1-30 + firma). El contrato a replicar para `platformAudit.write(tx, {...})`:
- `tx` es un parámetro **obligatorio**, no opcional — nunca abre su propia transacción (si el tx del caller hace rollback, la fila de auditoría desaparece con él).
- Es write-only por diseño (sin UPDATE/DELETE).
- El actor se pasa **explícito** desde el token ya verificado (`request.platformUser.platformUserId`), nunca inferido ni tomado del body.
- **Divergencia con el analog:** `audit_log` (el existente) es `tenant-scoped` (entra en `TENANT_STRICT_MODULES`); `platform_audit_log` es **exenta**, sin `tenantId` como filtro obligatorio — pero SÍ debe *registrar* `targetTenantId` como columna de negocio (no de aislamiento) para poder auditar "sobre qué tenant" (D-08).

**Orden de INSERTs — no arbitrario (Pitfall 5, FK compuesta `fk_users_tenant_branch`):**
```ts
export async function provisionTenant(db: Db, log: FastifyBaseLogger, input: ProvisionInput) {
  return db.transaction(async (tx) => {
    // 1. validar slug (reservado / formato / unicidad) — ANTES del primer INSERT
    // 2. INSERT tenants → tenantId
    const ctx: TenantContext = { tenantId };
    // 3. INSERT branches "Templo Online" is_virtual=true — vía tenantValues(ctx, {...})
    // 4. INSERT branches sede física opcional — idem
    // 5. INSERT users owner — DESPUÉS de la(s) sede(s), branchId = insertId de la sede recién creada
    // 6-7. INSERT tenant_settings (5 flags de módulo + brand.*/gimnasio.* solo si difieren)
    // 8. INSERT platform_audit_log — mismo tx
  });
}
```
Idempotencia (D-14): `SELECT` de unicidad de slug **antes** del INSERT — no dejar que el `ER_DUP_ENTRY` del driver suba como 500 (la unique de `tenants.slug` ya existe: `db/schema/tenants.ts:54`).

**Constante `VIRTUAL_BRANCH_NAME` (C-1 del research):** extraer a `src/modules/shared/branch-names.ts` (o dentro de `platform/provisioning-service.ts` si el planner decide no crear otro archivo) el literal `"Templo Online"` que hoy vive duplicado en `el-templo-api/src/modules/finance/coach-load-routes.ts:316` y `el-templo-api/src/modules/subscriptions/service.ts:5390` — los tres sitios importan la misma constante. **No renombrar el valor en esta fase.**

---

### `el-templo-api/src/modules/platform/host-tenant.ts` (`originToSlug`) (utility + hook, transform)

**Sin analog de código exacto** — es un concepto nuevo (D-18 lo reinterpreta). El RESEARCH.md ya deja la función pura completa como patrón a copiar tal cual, adaptando el header que lee (D-18: `Origin` con fallback `X-Tenant-Slug`, no `Host`):

```ts
// el-templo-api/src/modules/platform/host-tenant.ts (RESEARCH.md líneas 313-327, adaptado a Origin/D-18)
export function originToSlug(rawOrigin: string | undefined, platformDomain: string): string | null {
  if (!rawOrigin || !platformDomain) return null;
  let host: string;
  try {
    host = new URL(rawOrigin).hostname.toLowerCase();
  } catch {
    return null;
  }
  const dom = platformDomain.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^([a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?)\\.${dom}$`);
  const m = re.exec(host);
  return m ? m[1] : null;
}
```

**Analog de la regla "regex anclada, nunca `endsWith`":** `el-templo-api/src/app.ts:129-152` (bloque CORS actual, array estático) — el RESEARCH.md ya trae la función de reemplazo completa (líneas 622-642) que sirve de referencia directa para el `origin` dinámico:
```ts
const platformOrigin = PLATFORM_DOMAIN
  ? new RegExp(`^https://[a-z0-9-]+\\.${PLATFORM_DOMAIN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`)
  : null;
await app.register(cors, {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (ORIGENES_EL_TEMPLO.includes(origin)) return cb(null, true); // los 5 de hoy, intactos
    if (platformOrigin?.test(origin)) return cb(null, true);
    return cb(null, false);
  },
  methods: [...], maxAge: 86400, // NO tocar: la TV depende de este valor
});
```

**Cableado del hook (dónde y cuándo, no como wrapper de `attachScope`):**
```ts
// app.ts — DESPUÉS de databasePlugin, ANTES de cualquier register de rutas
await app.register(databasePlugin);
app.addHook("onRequest", resolveTenantByOrigin(app.db)); // NUEVO — decora request.hostTenant, nunca request.scope
```

**Reglas heredadas de D-04/D-05/H-3 (verbatim del RESEARCH, no negociables):** sin slug ⇒ el hook no hace nada (bypass total de El Templo); slug no resoluble ⇒ 404 `TENANT_NOT_FOUND` genérico; tenant no-`active` ⇒ 403 `TENANT_SUSPENDED` (reusar la constante de `country-scope.ts:21`); nunca `?? 1`, nunca `!`.

---

### `el-templo-api/src/modules/platform/slug.ts` (utility, transform)

**Analog:** `el-templo-api/src/db/schema/tenants.ts:92-106` (`RESERVED_TENANT_SLUGS`, primer consumidor de runtime según el comentario de la fase 166)
```ts
export const RESERVED_TENANT_SLUGS = [
  "admin", "api", "www", "app", "auth", "staging", "static",
  "assets", "cdn", "mail", "docs", "support", "dashboard",
] as const;
```
`validateSlug(slug)` compone: regex de formato (mismo patrón que usa `originToSlug` para el label: `^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$`), pertenencia a `RESERVED_TENANT_SLUGS`, y un `SELECT` de unicidad contra `tenants.slug` (columna `unique()` en el schema, línea 54) — el mismo criterio "verdad en servidor, UX en el front" que el resto del módulo. **`demo` NO entra a esta lista** (C-5 del research): la unicidad de `tenants.slug` ya alcanza para protegerlo una vez creado.

---

### `el-templo-api/src/db/schema/platform-users.ts` y `platform-audit-log.ts` (model, CRUD/event-driven)

**Analog de tabla raíz sin `tenant_id` + enum documentado:** `el-templo-api/src/db/schema/tenants.ts:27-69`
```ts
export const tenantStatusEnum = mysqlEnum("status", ["active", "suspended", "archived"]);
export const tenants = mysqlTable("tenants", {
  id: int("id").primaryKey().autoincrement(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 50 }).notNull().unique(),
  status: tenantStatusEnum.default("active").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});
```
Aplicar la misma forma a `platform_users` (columnas: `id`, `email` unique, `passwordHash`, `createdAt`/`updatedAt`; sin `role` — un solo rol de plataforma existe hoy, D-06/Opción B) y a `platform_audit_log` (columnas: `id`, `actorId` FK a `platform_users.id`, `action`, `targetTenantId` nullable — la acción de crear un tenant no tiene tenant al que apuntar antes del INSERT — `payload` JSON/text, `createdAt`).

**⚠️ Trampa documentada a repetir en el docblock:** `mysqlEnum` toma como **primer argumento el nombre de columna física**, no un nombre de tipo (`tenants.ts:37-44`, incidentes 0138/0139 del skill de migraciones) — si `platform_users` o `platform_audit_log` usan un enum, mismo cuidado.

**Ninguna de las dos tablas lleva `tenantId`.** Van a `TENANT_EXEMPT_TABLES` — ver §Shared Patterns.

---

### `el-templo-api/src/db/migrations/0216_platform_core.sql` (migration, batch/DDL)

**Analog:** `el-templo-api/src/db/migrations/0215_referral_partners.sql` — copiar la ESTRUCTURA del header (motivo de la fase, decisiones citadas por ID, verificación de numeración contra `origin/master` y `origin/staging`, advertencia sobre `;` en comentarios) y el estilo `CREATE TABLE IF NOT EXISTS` con `INSERT ... SELECT ... WHERE NOT EXISTS` para cualquier seed idempotente (patrón de `0209_seed_module_flags.sql`, citado en RESEARCH.md línea 539). El RESEARCH.md ya trae el esqueleto exacto:
```sql
-- 0216_platform_core.sql
-- Fase 182 (PLAT-01): tablas de la capa de plataforma. NINGUNA lleva tenant_id
-- a proposito -- el super-owner esta POR ENCIMA de los tenants (doc 08, Opcion B)
-- y el doc 05 seccion 3 las clasifica como club GLOBAL. Van a
-- TENANT_EXEMPT_TABLES en src/db/tenant-tables.ts, con motivo escrito.
-- NOTE: no semicolons inside these comment lines (the custom runner splits on
-- the semicolon BEFORE stripping the double-dash comments).
CREATE TABLE IF NOT EXISTS `platform_users` ( … );
```
**Re-verificar el número 0216 al escribir el SQL** (regla dura del ROADMAP + RESEARCH §Numeración): puede haber trenes que ya lo consumieron.

---

### `el-templo-api/src/scripts/create-platform-user.ts` (CLI, file-I/O/stdin)

**Sin precedente de prompt por stdin en el repo** (verificado: cero matches de `readline`/`createInterface`/`process.stdin` en `src/`). Los dos analogs parciales:

**1. Convención de exit codes y parseo de flags** — `el-templo-api/src/db/scripts/require-tenant.ts` (docblock líneas 1-50): `0` OK, `1` discrepancias/fallo de datos, `2` error de conexión o de USO (falta un flag, valor inválido). Copiar el criterio "error de uso → 2, nunca 1" para `--email` faltante/mal formado.

**2. Por qué tiene que vivir en `src/` y compilarse** — Pitfall 7 del RESEARCH (verificado: `deploy.yml:415` hace `pnpm install --prod --frozen-lockfile`, y `tsx` es devDependency, línea 57 de `package.json`). El script termina invocado como `node dist/scripts/create-platform-user.js` en el server; el `package.json` script con `tsx` (`pnpm platform:create-user`) es solo para local, mismo patrón que `db:migrate: "tsx src/db/run-migrations.ts"` (línea 13 de `package.json`) que en prod corre como `node dist/db/run-migrations.js`.

**Implementación sugerida (sin dependencia nueva):** `node:readline/promises` (stdlib, cero riesgo de instalación) para el prompt de contraseña; `argon2.hash()` — mismo algoritmo que `users` (D-07 lo exige literalmente, ya usado en `auth/routes.ts:265,681`). Idempotente por email: `SELECT` antes del `INSERT`, igual criterio que `provisionTenant()` para el slug.

---

### `el-templo-api/test/fixtures/platform.ts` (test fixture, CRUD)

**Analog:** `el-templo-api/test/fixtures/second-tenant.ts` (430 líneas) — estructura completa a espejar:
- Docblock que documenta QUÉ siembra y en qué orden (mismo estilo que las líneas 1-87 leídas).
- Constante de id fijo y alto (`TENANT_DOS = 90671` es el precedente; un `PLATFORM_USER_ID` fijo análogo para el fixture de plataforma).
- Todo INSERT gym-owned pasa por `tenantValues(ctx, {...})` — no aplica igual acá porque `platform_users` es exenta, pero el fixture de plataforma sí debe crear el tenant vía `provisionTenant()` real cuando lo pide `iso-04` (D-16: "no el fixture manual `seedSecondTenant`").
- `getAuthToken`-equivalente: `getPlatformAuthToken(app, email)` — mismo patrón que `test/helpers.ts` expone para tokens de tenant.
- **Registrar las tablas nuevas en `TABLES_TO_CLEAN`** (`cleanAllTestData` no las conoce todavía) o limpiarlas explícito en el `afterAll` del archivo — Wave 0 Gap del RESEARCH.

---

### `el-templo-api/test/tenancy/iso-04-platform.test.ts` (test, request-response)

**Analog:** `el-templo-api/test/tenancy/iso-03-finance-coach-load.test.ts` (1924 líneas) — el patrón estructural a copiar (docblock líneas 1-90 ya leídas):
- **Caso + control por cada aserción de aislamiento (D-16/D-08 del archivo analog):** cada `describe` lleva al menos un `it` de aislamiento (owner nuevo no ve tenant 1) Y un `it` de control positivo con la MISMA operación sobre el recurso PROPIO (para distinguir "aislamiento correcto" de "siembra rota").
- **Nunca un status que filtre existencia:** un recurso ajeno es indistinguible de uno inexistente — mismo criterio D-09 heredado (aplicado acá entre plataforma y tenant, no entre dos tenants).
- **La evidencia se lee de la base, no solo del status HTTP** cuando el test verifica que NO se escribió nada (rollback total, D-14 PLAT-03).
- Casos específicos de `iso-04` (D-16, ya enumerados en CONTEXT): token de plataforma → ruta de tenant ⇒ 401; token de tenant → `/api/platform/*` ⇒ 401; host del slug nuevo resuelve; host desconocido ⇒ 404 `TENANT_NOT_FOUND`; `iso-01..03` existentes siguen verdes (no se tocan, solo se corren).

---

### `el-templo-admin/src/boot/platform-axios.ts` (provider, request-response)

**Analog:** `el-templo-admin/src/boot/axios.ts` (181 líneas, leído completo) — estructura a copiar CASI entera, con las tres diferencias que impone D-09/Pitfall 3:

```ts
// el-templo-admin/src/boot/axios.ts:26-49 (patrón de instancia + storage keys)
const ACCESS_KEY = 'adminAccessToken';   // → 'platformAccessToken' (D-09: clave distinta)
const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
const api = axios.create({ baseURL, timeout: 10000, headers: { 'Content-Type': 'application/json' } });
```
```ts
// el-templo-admin/src/boot/axios.ts:163-169 (interceptor de request — copiar tal cual con la key nueva)
api.interceptors.request.use((config) => {
  const token = getAccess();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
```

**Lo que NO se copia (D-08: sin refresh largo para plataforma):** el mecanismo de `refreshClient` + `runRefresh()` + lock compartido (líneas 41-113 del analog) es exclusivo del token de tenant, que sí tiene refresh de 30 días. El 401 handler de `platformApi` es más simple: limpia `platformAccessToken` y redirige a `/plataforma/login`, sin intento de refresh — igual al `failAuth()` interno del analog pero sin las ramas (b)/(c)/(d) que dependen de refresh.

**Nunca importar ni tocar `boot/axios.ts`** — instancia nueva y archivo nuevo, tal como el Patrón 4 del RESEARCH lo exige (Pitfall 3: un `if` compartido en el interceptor único cruzaría sesiones).

---

### `el-templo-admin/src/stores/usePlatformAuthStore.ts` (store, CRUD)

**Analog:** `el-templo-admin/src/stores/useAuthStore.ts` (85 líneas, leído completo) — mismo `defineStore('...', () => {...})` composition API, mismos cuatro refs (`token`, `user`, `loading`, `error`), mismo `computed(isAuthenticated)`, y mismo patrón de `login()`/`logout()`/`checkAuth()`:
```ts
// el-templo-admin/src/stores/useAuthStore.ts:19-55 (patrón completo de login)
export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem(ACCESS_KEY));
  const user = ref<AdminUser | null>(null);
  const isAuthenticated = computed(() => !!token.value && !!user.value);
  async function login(email: string, password: string) {
    loading.value = true; error.value = null;
    try {
      const { data } = await api.post<LoginResponse>('/auth/login', { email, password });
      token.value = data.accessToken; user.value = data.user;
      localStorage.setItem(ACCESS_KEY, data.accessToken);
    } catch (err: unknown) {
      const axiosError = err as { message?: string; response?: { data?: { error?: string } } };
      error.value = axiosError.message || axiosError.response?.data?.error || 'Error de inicio de sesion';
      throw err;
    } finally { loading.value = false; }
  }
  return { token, user, loading, error, isAuthenticated, login, logout, checkAuth };
});
```
**Diferencias:** `nombre del store` = `'platformAuth'` (Pinia namespacea por id, evita colisión de devtools); `api` importado de `boot/platform-axios.ts`, no de `boot/axios.ts`; sin `ADMIN_ROLES` (no hay roles de plataforma, un solo actor); `checkAuth()` pega a `GET /api/platform/auth/me`.

---

### `el-templo-admin/src/router/index.ts` (modif., guard) y `routes.ts` (modif., rutas nuevas)

**Analog del guard `beforeEach`:** `el-templo-admin/src/router/index.ts:25-76` (leído completo) — el patrón es: `to.meta.public` bypass temprano → `authStore.checkAuth()` → redirect a login preservando `?redirect=` → landing por rol. El guard de `/plataforma/*` es un **guard aparte** (D-06/D-09), no una rama del mismo `beforeEach`: revisa `to.path.startsWith('/plataforma')` primero y, si matchea, usa `usePlatformAuthStore` en vez de `useAuthStore` — sin tocar el resto de la función existente (regla D-05: el guard de tenant no se modifica).

**Analog de declaración de ruta pública:** `el-templo-admin/src/router/routes.ts:34-38`
```ts
{
  path: '/login',
  component: () => import('pages/LoginPage.vue'),
  meta: { public: true },
},
```
Espejo para `/plataforma/login`, y rutas protegidas (`/plataforma`, `/plataforma/tenants/nuevo`) SIN `meta: { public: true }` pero tampoco con `meta.allowedRoles` (ese campo es del enum `AdminRole` de tenant — D-06 exige que el super-owner no sea "un rol más").

---

### `el-templo-admin/src/pages/plataforma/PlatformLoginPage.vue` (component, request-response)

**Analog:** `el-templo-admin/src/pages/LoginPage.vue` (leído completo) — layout `q-layout > q-page-container > q-page.flex.flex-center > q-card`, `q-form @submit`, dos `q-input` (email/password) con `:rules`, `q-banner` condicional para `authStore.error`, botón `type="submit"` con `:loading="authStore.loading"`. Copiar la estructura entera, cambiando `useAuthStore` por `usePlatformAuthStore` y el texto del header (`"El Templo — Plataforma"` en vez de `"El Templo Admin"`). El `safeRedirectTarget()` (líneas 66-77, allowlist de paths internos contra open-redirect) no aplica — el login de plataforma no necesita preservar destino cross-sección.

---

### `el-templo-admin/src/pages/plataforma/TenantWizardPage.vue` (component, CRUD multi-step)

**Analog:** `el-templo-admin/src/components/ProgramWizardDialog.vue` — precedente interno de `q-stepper` (grep confirma 4 `q-step` con `:done="step > N"`, `q-stepper-navigation` con botones Atrás/Siguiente, y `const step = ref(1)` como único estado de control del stepper). Estructura a copiar:
```html
<q-stepper v-model="step" ...>
  <q-step :name="1" title="Identidad" icon="badge" :done="step > 1"> ... </q-step>
  <q-step :name="2" title="Localizacion" icon="public" :done="step > 2"> ... </q-step>
  <q-step :name="3" title="Branding (opcional)" icon="palette" :done="step > 3"> ... </q-step>
  <q-step :name="4" title="Sede fisica (opcional)" icon="store" :done="step > 4"> ... </q-step>
  <q-step :name="5" title="Resumen y confirmar" icon="check_circle"> ... </q-step>
</q-stepper>
```
Mapea 1:1 con los 5 pasos de D-10. El paso final (D-13) recibe la respuesta del POST (contraseña temporal, checklist de aprovisionado) y la guarda en un `ref` **local del componente**, nunca en `localStorage` ni en el store — D-13/Pitfall del RESEARCH sobre la contraseña temporal.

---

### `el-templo-api/src/db/tenant-tables.ts` (modif., `TENANT_EXEMPT_TABLES`)

**Bloque a extender (líneas 163-188, leído completo):**
```ts
export const TENANT_EXEMPT_TABLES = [
  "tenants",
  "tenant_settings",
  "system_settings",
  "labs_inquiries",
] as const;
```
Agregar `"platform_users"` y `"platform_audit_log"` con el mismo estilo de comentario que las cuatro existentes (una viñeta por tabla, motivo en prosa, arriba del array — no al lado). Actualiza también `test/db/tenant-tables.test.ts:99,105` (91+4=95 → 91+6=97, `.toBe(4)` → `.toBe(6)`).

---

### `el-templo-api/test/tenant-manifest.ts` (modif., entradas nuevas)

**Analog exacto — entrada `global` con motivo obligatorio (líneas 233-253, patrón `POST /api/auth/login`):**
```ts
"POST /api/auth/login": {
  categoria: "global",
  motivo: "...", // oración completa, causa concreta — NO "es login"
},
```
Cada ruta nueva de `/api/platform/*` entra así, con `categoria: "global"` (son transversales a todos los tenants por diseño — el super-owner no tiene un tenant). Actualizar `ENTRADAS_BASELINE` en `test/tenancy/iso-01-manifiesto.test.ts:261` sumando N rutas nuevas, y el número declarado en el header de `tenant-manifest.ts` (líneas 191-199 documentan que el gate manda si el header queda stale).

---

## Shared Patterns

### Secreto JWT separado + decorador separado (aplica a TODO `/api/platform/*`)
**Fuente:** `el-templo-api/src/plugins/auth.ts` (analog) + RESEARCH.md §Patrón 1/Pitfall 1-2.
`PLATFORM_JWT_SECRET` propio, `decoratorName: "platformUser"`, claim `platformUserId`. Ningún handler de plataforma lee `request.user`.

### `tenantValues`/`assertTenant` para toda tabla gym-owned tocada por el provisioner
**Fuente:** `el-templo-api/src/modules/shared/tenant.ts:149-205`.
`provisionTenant()` escribe `branches`/`users`/`tenant_settings` (las tres gym-owned) SIEMPRE vía `tenantValues(ctx, {...})` — nunca un `.values({...})` desnudo, por el `DEFAULT 1` de `tenant_id` (T-168-15, Pitfall 4).

### Instancia axios separada + store separado en el admin
**Fuente:** `boot/axios.ts` + `stores/useAuthStore.ts` (analogs completos arriba). Aplica a `boot/platform-axios.ts` y `stores/usePlatformAuthStore.ts` — ninguno de los dos importa nada del par de tenant.

### Auditoría write-only dentro de la misma transacción
**Fuente:** `el-templo-api/src/modules/shared/audit-log.ts`. `platform/audit.ts` recibe `tx` obligatorio, actor explícito (nunca del body), sin update/delete.

### `q-stepper` para formularios multi-paso
**Fuente:** `el-templo-admin/src/components/ProgramWizardDialog.vue`, `AssignPlanDialog.vue`. Único patrón de wizard del repo — usarlo tal cual, sin reinventar estado de pasos con `v-if`.

### Migraciones hand-written, sin `;` en comentarios, verificadas contra las dos ramas
**Fuente:** `el-templo-api/src/db/migrations/0215_referral_partners.sql` (header completo). Aplica a `0216_platform_core.sql`.

### Regex anclada para reconocer un host/origen bajo un dominio — nunca `endsWith`
**Fuente:** RESEARCH.md §Anti-patrones + bloque CORS de `app.ts:129-152`. Aplica a `originToSlug` (platform/host-tenant.ts) y a la función `origin` de CORS.

---

## No Analog Found

| Archivo | Rol | Flujo | Razón |
|---|---|---|---|
| `el-templo-api/src/scripts/create-platform-user.ts` (prompt de stdin) | CLI | file-I/O | Cero precedente de `readline`/stdin en el repo (verificado por grep exhaustivo). Usar `node:readline/promises` (stdlib) — sin dependencia nueva. |
| `el-templo-api/test/unit/host-to-slug.test.ts` (→ `origin-to-slug`) | test unitario | transform | Función pura nueva sin equivalente previo; el propio RESEARCH.md trae el código de la función y el patrón de test (`app.inject({ headers: { host } })`, adaptar a `Origin`). |
| `el-templo-api/src/modules/platform/host-tenant.ts` (`originToSlug`, la función en sí) | utility | transform | Concepto nuevo (D-18 reinterpreta H-3); el RESEARCH.md es la fuente primaria, no un archivo existente del repo. |

**Nota sobre el runbook de infra:** `deploy/RUNBOOK.md` y `deploy/nginx/` son analogs de FORMATO (cómo se documenta un vhost/certbot existente), pero el contenido del vhost wildcard + certbot DNS-01 es infraestructura nueva sin precedente en el repo (Environment Availability del RESEARCH: proveedor DNS y plugin certbot son "desconocidos desde el repo", se resuelven en la sesión SSH de D-02).

---

## Metadata

**Alcance de búsqueda de analogs:** `el-templo-api/src/{plugins,modules/{auth,shared,tree-editor},db/{schema,migrations,scripts}}`, `el-templo-api/test/{fixtures,tenancy,tenant-manifest.ts}`, `el-templo-admin/src/{boot,stores,router,pages,components}`, `.env.example` de ambos paquetes.
**Archivos leídos completos:** `plugins/auth.ts` (70L), `modules/shared/tenant.ts` (277L), `db/schema/tenants.ts` (106L), `modules/shared/modules.ts` (86L), `boot/axios.ts` (181L), `router/index.ts` (79L), `stores/useAuthStore.ts` (85L), `pages/LoginPage.vue` (parcial, 80L de 120+).
**Archivos leídos parcial/targeted (grep + offset):** `modules/auth/routes.ts` (líneas 616-745 de 1222), `modules/shared/country-scope.ts` (líneas 127-196 de 317), `app.ts` (líneas 100-165 de 382), `test/tenant-manifest.ts` (líneas 150-220 de 1690), `db/tenant-tables.ts` (líneas 160-225 de 653), `test/fixtures/second-tenant.ts` (líneas 1-100 de 430), `test/tenancy/iso-03-finance-coach-load.test.ts` (líneas 1-90 de 1924), `modules/tree-editor/service.ts` (líneas 700-740), `modules/shared/audit-log.ts` (líneas 1-60), `db/scripts/require-tenant.ts` (líneas 1-50), `db/migrations/0215_referral_partners.sql` (líneas 1-50), `components/ProgramWizardDialog.vue` (grep de estructura de `q-stepper`).
**Fecha de extracción de patrones:** 2026-08-28
