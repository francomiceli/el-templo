# Fase 180: Campañas etapa 2 (magic links, audiencias, ReservasPage informativa) — Mapa de Patrones

**Mapeado:** 2026-08-22
**Archivos analizados:** 31 (nuevos o modificados)
**Analogías encontradas:** 28 / 31

---

## Bases de código de referencia (LEER ANTES DE PLANIFICAR)

| Base                              | Ruta                                                                       | Qué se saca de acá                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tren v6.0** (canónica para API) | `/home/franco/projects/et-176` — rama `feat/176-modulos`, HEAD `d3acea88`  | **TODO** `el-templo-api/**` + `el-templo-app/src/pages/ReservasPage.vue`. `campaigns` acá ya está adoptado a tenancy (`listEligible(ctx, country)`, `tenant_id` en las 4 tablas, `tracking-service.ts` con exención duplicada).                                                                                                                                                                                                                          |
| **Checkout principal**            | `/home/franco/projects/el-templo` — rama `docs/planning-untracked-2026-08` | `el-templo-app/**` (salvo ReservasPage.vue) y `el-templo-admin/**`. **Verificado byte-a-byte:** `boot/deep-links.ts`, `router/index.ts`, `router/routes.ts`, `useTokenStorage.ts`, `useAuthStore.ts`, `useSchedulingApi.ts`, `CampaniasPage.vue`, `useCampaignsApi.ts`, `types/campaign.ts` son **idénticos** en ambos checkouts (`git show HEAD:<path> \| md5sum`). El **único** archivo de front que difiere es `ReservasPage.vue` → usar el del tren. |

> Cada excerpt de abajo lleva la etiqueta `[TREN]` o `[MAIN]` indicando de dónde salió.
> **Regla:** si el excerpt es `[TREN]`, no copiarlo del checkout principal — la firma o el tenancy difieren.

---

## Clasificación de archivos

### API — `el-templo-api` (base: TREN)

| Archivo nuevo/modificado                                                 | Rol               | Data flow                       | Analogía más cercana                                                                                            | Calidad                                                                              |
| ------------------------------------------------------------------------ | ----------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `src/modules/campaigns/magic-link-service.ts` **(NUEVO)**                | service           | request-response (token→sesión) | `campaigns/tracking-service.ts` (resolución de tenant pre-scope) + `auth/routes.ts:490-660` (emisión de sesión) | exacta (composición de 2)                                                            |
| `src/modules/campaigns/token-service.ts` **(MOD)**                       | utility (crypto)  | transform                       | sí mismo — extender payload con `purpose` + `exp` propio                                                        | exacta                                                                               |
| `src/modules/campaigns/routes.ts` **(MOD: `POST /exchange`)**            | route             | request-response público        | `GET /track/click` en el MISMO archivo (líneas 105-132)                                                         | exacta                                                                               |
| `src/modules/campaigns/schemas.ts` **(MOD)**                             | config/validation | —                               | `testCampaignSchema` (líneas 70-88)                                                                             | exacta                                                                               |
| `src/modules/campaigns/audience-service.ts` **(NUEVO)**                  | service           | CRUD (read)                     | `CampaignService.listEligible()` (`service.ts:83-158`)                                                          | exacta                                                                               |
| `src/modules/campaigns/service.ts` **(MOD)**                             | service (facade)  | CRUD                            | sí mismo — `send()` (304-346), `trialDeepLink()` (807-809)                                                      | exacta                                                                               |
| `src/modules/campaigns/types.ts` **(MOD)**                               | types             | —                               | `CreateCampaignInput` / `EligibleUser`                                                                          | exacta                                                                               |
| `src/modules/campaigns/templates.ts` **(MOD: CTA único)**                | utility (render)  | transform                       | `bulletproofButton()` (98-…) + `sedeRow()` (68-…) en el mismo archivo                                           | exacta                                                                               |
| `src/db/schema/campaigns.ts` **(MOD: `segment`)**                        | model             | —                               | `campaigns.status` — soft-enum `varchar(16)` con default (línea 45)                                             | exacta                                                                               |
| `src/db/migrations/02XX_campaigns_segment.sql` **(NUEVO)**               | migration         | —                               | `0206_tv_show_alternative.sql` (ADD COLUMN con default, comentario sin `;`)                                     | exacta                                                                               |
| `src/modules/scheduling/routes.ts` **(MOD: `/branches` + `address`)**    | route             | request-response                | el propio handler `GET /branches` (1076-1123)                                                                   | exacta                                                                               |
| `src/modules/scheduling/trials-service.ts` **(MOD: enqueue + limpieza)** | service           | event-driven                    | `booking-service.ts:2138-2153` (`promoteWaitlist` → `queueNotification` fuera de la tx)                         | exacta                                                                               |
| `src/modules/notifications/types.ts` **(MOD: `TEMPLATE_SEEDS`)**         | config (seed)     | —                               | entradas existentes de `TEMPLATE_SEEDS` (79-230)                                                                | exacta                                                                               |
| `src/modules/scheduling/service.ts` **(MOD: descripción en el slot)**    | service           | read/transform                  | `deriveActivityLabel()` (`derived-label.ts`) — fuente única de la etiqueta                                      | **parcial** (no hay precedente de descripción derivada; ver §Pitfall 9 del research) |
| `.env.example` **(MOD: `PUBLIC_API_BASE_URL`)**                          | config            | —                               | entradas existentes                                                                                             | exacta                                                                               |

### API — tests (base: TREN)

| Archivo                                                                                                      | Rol                | Data flow        | Analogía                                                                          | Calidad |
| ------------------------------------------------------------------------------------------------------------ | ------------------ | ---------------- | --------------------------------------------------------------------------------- | ------- |
| `test/campaigns-magic-link.test.ts` **(NUEVO)**                                                              | test (integración) | request-response | `test/campaigns-tracking.test.ts` (app.inject sobre ruta pública + token firmado) | exacta  |
| `test/campaigns-audience.test.ts` **(EXTENDER a 5 segmentos)**                                               | test (integración) | CRUD             | sí mismo (172 líneas, hoy solo freemium)                                          | exacta  |
| `test/campaign-token.test.ts` **(EXTENDER: `purpose`, deep link por segmento)**                              | test (unit)        | transform        | sí mismo                                                                          | exacta  |
| `test/campaigns-send.test.ts` **(EXTENDER: segmento persistido)**                                            | test (integración) | CRUD             | sí mismo                                                                          | exacta  |
| `test/tenant-manifest.ts` **(MOD: `POST /api/campaigns/exchange`)**                                          | config (contrato)  | —                | bloque `/api/campaigns` (621-641)                                                 | exacta  |
| `test/tenancy/iso-01-manifiesto.test.ts` **(MOD: `ENTRADAS_BASELINE` 370→N)**                                | test (contrato)    | —                | sí mismo (línea 187 + títulos de `it`)                                            | exacta  |
| `test/tenancy/iso-03-campaigns.test.ts` **(EXTENDER + actualizar conteo del docblock)**                      | test (aislamiento) | —                | sí mismo (docblock "las 10 rutas tenant-scoped")                                  | exacta  |
| `test/scheduling-reserve-trial.test.ts` / `scheduling-cancel-trial.test.ts` **(EXTENDER: enqueue/limpieza)** | test (integración) | event-driven     | sí mismos                                                                         | exacta  |

### Member app — `el-templo-app`

| Archivo                                                                 | Rol                      | Data flow        | Analogía                                                                                                                            | Calidad                   |
| ----------------------------------------------------------------------- | ------------------------ | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `src/composables/useMagicLink.ts` **(NUEVO)**                           | composable               | request-response | `useSchedulingApi.ts` (shape + `cleanup()`) + `useAuthStore.login()` (persistencia de sesión)                                       | exacta (composición de 2) |
| `src/pages/MagicLinkPage.vue` **(NUEVO, ruta `/r/trial`)**              | page (pública)           | request-response | `LoginPage.vue:161-205` (`onSubmit`: login → decide destino → `router.push`)                                                        | rol-match                 |
| `src/router/routes.ts` **(MOD)**                                        | config (router)          | —                | bloque de rutas públicas (líneas 4-14)                                                                                              | exacta                    |
| `src/router/index.ts` **(MOD: guard)**                                  | middleware (guard)       | request-response | `publicRoutes` + guard de onboarding (25-51)                                                                                        | exacta                    |
| `src/boot/deep-links.ts` **(MOD: canje del token)**                     | boot / listener          | event-driven     | sí mismo (`resolveDeepLinkRoute` + `pendingRoute`)                                                                                  | exacta                    |
| `src/components/BranchPickerDialog.vue` **(NUEVO)**                     | component (dialog)       | —                | `components/PlanExpiryDialog.vue` (dialog gateado + Preferences + brand palette)                                                    | exacta                    |
| `src/components/ActivityInfoSheet.vue` **(NUEVO)**                      | component (bottom sheet) | —                | `PlanExpiryDialog.vue` (**no existe ningún bottom sheet en el repo** — usar `q-dialog position="bottom"` reestilando el mismo card) | rol-match                 |
| `src/pages/ReservasPage.vue` **(MOD)**                                  | page                     | request-response | sí mismo — estado "prueba reservada" (8-52), selector de sede (83-103), `branchOptions` (882-887)                                   | exacta                    |
| `src/composables/useSchedulingApi.ts` **(MOD: `BranchOption.address`)** | composable               | request-response | sí mismo (`BranchOption` 26-29, `getBranches` 75-80)                                                                                | exacta                    |
| `src/utils/calendar-link.ts` **(NUEVO)**                                | utility                  | transform        | `src/utils/whatsapp.ts` (constructor de URL puro + export nombrado)                                                                 | exacta                    |
| `test/calendar-link.test.ts` **(NUEVO)**                                | test (unit)              | transform        | `test/whatsapp.test.ts`                                                                                                             | exacta                    |
| `test/deep-links.test.ts` **(NUEVO)**                                   | test (unit)              | event-driven     | `test/whatsapp.test.ts` (mismo estilo: función pura, sin mount de componentes)                                                      | rol-match                 |

### Admin — `el-templo-admin` (base: MAIN, idéntico al tren)

| Archivo                                                              | Rol        | Data flow        | Analogía                                                  | Calidad |
| -------------------------------------------------------------------- | ---------- | ---------------- | --------------------------------------------------------- | ------- |
| `src/types/campaign.ts` **(MOD: `CampaignSegment`)**                 | types      | —                | `CampaignCountry` / `CampaignStatus` (union de strings)   | exacta  |
| `src/composables/useCampaignsApi.ts` **(MOD: preview por segmento)** | composable | request-response | `getEligibleCount()` en el mismo archivo                  | exacta  |
| `src/pages/CampaniasPage.vue` **(MOD: selector + preview)**          | page       | request-response | dialog de creación (151-214) + `openSendDialog` (519-533) | exacta  |

---

## Asignaciones de patrón

### `campaigns/magic-link-service.ts` (service, token→sesión) — NUEVO

**Analogía A (resolución de tenant en ruta pública):** `el-templo-api/src/modules/campaigns/tracking-service.ts:59-73` `[TREN]`

Este es el idioma exacto para el paso "el token identifica un `sendId` → la base dice de qué gimnasio es". **La exención va DUPLICADA** (comentario TS para el lint CON-06 + comentario embebido en el `sql` para el sentinel CON-05):

```ts
// Source: el-templo-api/src/modules/campaigns/tracking-service.ts:59-73 [TREN]
async getSendEmail(sendId: number): Promise<ResolvedSend | null> {
  const [row] = await this.db
    .select({
      tenantId: schema.campaignSends.tenantId,
      email: schema.campaignSends.email,
      userId: schema.campaignSends.userId,
      campaignId: schema.campaignSends.campaignId,
    })
    .from(schema.campaignSends)
    .where(
      sql`/* tenant-safe: sendId del token firmado (D-21), resuelve el tenant antes de tener ctx — pre-scope, no hay actor en esta ruta publica (T-175-02) */ ${schema.campaignSends.id} = ${sendId}`,
    )
    .limit(1);
  return row ?? null;
}
```

**Docblock a imitar** (`tracking-service.ts:15-27`) — explica POR QUÉ la exención es legítima. El servicio nuevo necesita el suyo, con la salvedad de que **acá el token SÍ autoriza** (D-01 revisa D-21) y eso hay que decirlo explícito.

**Analogía B (emisión de sesión):** `el-templo-api/src/modules/auth/routes.ts:606-640` `[TREN]`

```ts
// Source: el-templo-api/src/modules/auth/routes.ts:606-640 [TREN]
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

> ⚠ **Corrección al CONTEXT.md:** el login **NO** está en `members/routes.ts §386-513`. Está en `auth/routes.ts §490-660`.
> El shape de `user` de la respuesta del canje debe ser **idéntico** — `useAuthStore` lo pasa tal cual a `userStore.setProfile(userData)`.

**Gates a replicar del login** (`auth/routes.ts:545-570`): `deletedAt` → 401, y `role !== 'member' && staffDisabled === true` → 401.

**Derivación de `ctx` a partir de la fila** (`auth/routes.ts:540-543`):

```ts
// Source: el-templo-api/src/modules/auth/routes.ts:540-543 [TREN]
// ÚNICO `ctx` del handler, derivado de la FILA ya encontrada (D-06 — el mismo
// patrón que usa `attachScope` antes de que exista un `TenantContext`)
const ctx: TenantContext = { tenantId: user.tenantId };
```

**Nunca** escribir el refresh a mano: `RefreshTokenService.issue()` ya estampa `tenant_id` derivando el dueño con su propia exención duplicada (`refresh-token-service.ts:96-131`).

---

### `campaigns/routes.ts` — `POST /exchange` (route, público)

**Analogía:** `GET /track/click` en el **mismo archivo**, `routes.ts:105-132` `[TREN]`. Copiar tres cosas: la ausencia de `preHandler`, el `try/catch` que degrada en silencio el tracking, y la verificación fail-closed del host.

```ts
// Source: el-templo-api/src/modules/campaigns/routes.ts:105-132 [TREN]
fastify.get<{ Querystring: { t: string } }>(
  "/track/click",
  { schema: trackingQuerySchema },
  async (request, reply) => {
    const payload = validateCampaignToken(request.query.t);
    const destination = CampaignService.trialDeepLink(request.query.t);
    // Defense-in-depth: el destino derivado DEBE estar en el host allowlisted
    // (D-25). Solo puede fallar si trialDeepLink regresa — fail closed.
    if (new URL(destination).host !== CLICK_REDIRECT_ALLOWLIST_HOST) {
      request.log.error(
        { destination },
        "click redirect host not on allowlist — refusing",
      );
      return reply.status(400).send({ error: "Destino inválido" });
    }
    if (payload) {
      try {
        await tracking.recordClick(payload.sendId, destination);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        request.log.warn({ err: message }, "recordClick failed");
      }
    }
    return reply.redirect(destination, 302);
  },
);
```

**Anti open-redirect (D-25, Pitfall 13):** el destino se **deriva** de `TRIAL_DEEP_LINK_BASE`, nunca se ecoa del query.

```ts
// Source: el-templo-api/src/modules/campaigns/service.ts:39-40, 807-809 [TREN]
/** The web-app host the click redirect targets (D-25, anti open-redirect). */
const TRIAL_DEEP_LINK_BASE = "https://app.eltemplo.org/r/trial";

static trialDeepLink(token: string): string {
  return `${TRIAL_DEEP_LINK_BASE}?t=${encodeURIComponent(token)}`;
}
```

⇒ `deepLinkForSegment(segment, token)` debe seguir componiendo sobre esa constante (mismo host, distinto path/query). **No relajar la allowlist.**

**Guards de rol/scope de las rutas admin nuevas** (preview por segmento) — copiar tal cual de `routes.ts:268-283`:

```ts
// Source: el-templo-api/src/modules/campaigns/routes.ts:268-283 [TREN]
fastify.get<{ Querystring: { country?: "AR" | "ES" } }>(
  "/admin/eligible-count",
  { preHandler: [fastify.authenticate], schema: eligibleCountSchema },
  async (request, reply) => {
    if (!(ADMIN_ROLES as readonly string[]).includes(request.user.role)) {
      return reply.status(403).send({ error: "Acceso de admin requerido" });
    }
    await attachCountryScope(request, fastify.db);
    const ctx = assertTenant(request.scope, "campaigns.eligibleCount");
    const country = request.scope.isOwner
      ? (request.query.country ?? null)
      : scopeCountry(request);
    const eligible = await service.listEligible(ctx, country);
    return { count: eligible.length };
  },
);
```

> **Deuda a saldar acá** (Pitfall 8): `.length` trae TODAS las filas para devolver un número. Con el segmento "bajas" (miles de ex-socios) hay que cambiarlo a `COUNT(*)` en SQL.

**Validación del body** — `schemas.ts:70-88` `[TREN]`, con `additionalProperties: false` obligatorio en el trust boundary:

```ts
// Source: el-templo-api/src/modules/campaigns/schemas.ts:9-19, 76-87 [TREN]
export const trackingQuerySchema = {
  querystring: {
    type: "object",
    required: ["t"],
    properties: { t: { type: "string", minLength: 1, maxLength: 2048 } },
    additionalProperties: false,
  },
} as const;

// body con lista cerrada — el `segment` va validado por enum, NUNCA interpolado en SQL
body: {
  type: "object",
  required: ["email"],
  properties: { email: { type: "string", pattern: "^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", maxLength: 254 } },
  additionalProperties: false,
},
```

---

### `campaigns/token-service.ts` (utility, crypto) — MOD

**Analogía:** sí mismo. La firma y la comparación en tiempo constante ya están resueltas — el cambio es **aditivo** (campo `purpose` + `exp` propio de 7d) y el validador de **cada** ruta consumidora debe chequear el `purpose` (Pitfall 3).

```ts
// Source: el-templo-api/src/modules/campaigns/token-service.ts:94-125 [TREN]
const expectedSignature = createHmac("sha256", secret)
  .update(payloadB64)
  .digest("base64url");

// CR-03: constant-time compare para evitar un oráculo de timing sobre el HMAC.
// timingSafeEqual exige buffers de igual longitud → rechazar el mismatch primero.
const providedBuf = Buffer.from(providedSignature);
const expectedBuf = Buffer.from(expectedSignature);
if (
  providedBuf.length !== expectedBuf.length ||
  !timingSafeEqual(providedBuf, expectedBuf)
) {
  return null;
}

const parsed = JSON.parse(payloadStr) as Record<string, unknown>;
if (
  typeof parsed.userId !== "number" ||
  typeof parsed.campaignId !== "number" ||
  typeof parsed.sendId !== "number" ||
  typeof parsed.exp !== "number"
) {
  return null;
}
// D-04: rechazar tokens vencidos (exp es epoch SEGUNDOS).
if (parsed.exp <= Math.floor(Date.now() / 1000)) return null;
```

**Docblocks a actualizar** (todos afirman hoy "el token NUNCA autoriza"): `token-service.ts:8-13`, `campaigns/routes.ts:10`, `deep-links.ts:21-24`, `test/tenancy/iso-03-campaigns.test.ts` (docblock). Si no se actualizan, el próximo lector va a creerles.

---

### `campaigns/audience-service.ts` (service, CRUD) — NUEVO

**Analogía:** `CampaignService.listEligible()`, `service.ts:83-158` `[TREN]`. Es literalmente el segmento "freemium elegibles"; el resolver generaliza esta forma.

**Invariantes globales D-15 + la trampa de tenancy (mina M3):**

```ts
// Source: el-templo-api/src/modules/campaigns/service.ts:93-147 [TREN]
// Los `sql` de abajo referencian ${u.id} / ${u.email} como VALOR de una
// subconsulta correlacionada contra OTRA tabla — ninguno hace FROM users.
/* tenant-safe: sql correlacionado que solo referencia users.id/email como valor, no hace FROM users (D-02) */
const conditions = [
  eq(u.status, "freemium"),
  sql`${u.email} IS NOT NULL`,
  sql`${u.createdAt} < (NOW() - INTERVAL 3 DAY)`, // D-10 freshness
  sql`NOT EXISTS (
    SELECT 1 FROM ${s}
    WHERE ${s.userId} = ${u.id}
      AND ${s.status} IN ('active', 'paused', 'scheduled')
  )`,
  sql`NOT EXISTS (
    SELECT 1 FROM ${b}
    WHERE ${b.memberId} = ${u.id}
      AND ${b.isTrial} = TRUE
      AND ${b.status} <> 'cancelado'
  )`,
  // 🔴 mina M3: este correlaciona por EMAIL, que NO es único global desde la
  // mig 0196 (unique = (tenant_id, email)) ⇒ lleva su PROPIO filtro de tenant.
  sql`NOT EXISTS (
    SELECT 1 FROM ${unsub}
    WHERE ${unsub.email} = ${u.email} AND ${unsub.tenantId} = ${ctx.tenantId}
  )`,
];

if (country === "AR" || country === "ES")
  conditions.push(eq(br.country, country));

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

// email IS NOT NULL se fuerza en SQL; acá se narrowea la columna nullable.
return rows
  .filter((r): r is typeof r & { email: string } => r.email !== null)
  .map((r) => ({
    userId: r.userId,
    email: r.email,
    branchId: r.branchId,
    country: r.country,
  }));
```

**Regla derivada para toda rama nueva de segmento:** por cada subquery, preguntarse _¿correlaciona por una columna única GLOBAL (`users.id`) o por una que no lo es (`email`, `code`, `dni`)?_ Si no es única global → filtro de tenant propio.

**Docblock del método** (`service.ts:64-82`) — es el modelo del docblock del resolver: enumera las condiciones una por una y explica la posición del `tenantWhere`.

---

### `db/schema/campaigns.ts` + migración (model + migration) — MOD/NUEVO

**Convención soft-enum del módulo** (`schema/campaigns.ts:34-35, 44-50` `[TREN]`) — **varchar, no enum de DB**:

```ts
// Source: el-templo-api/src/db/schema/campaigns.ts:44-50 [TREN]
// 'draft' | 'sending' | 'sent'
status: varchar("status", { length: 16 }).notNull().default("draft"),
createdBy: int("created_by").references(() => users.id, { onDelete: "cascade" }).notNull(),
// Optional country scope ('AR' | 'ES'); NULL = global.
country: varchar("country", { length: 2 }),
```

⇒ `segment: varchar("segment", { length: 32 }).notNull().default("freemium_elegibles")` con comentario `// 'freemium_elegibles' | 'bajas' | 'prueba_no_convertida' | 'alerta_ausente' | 'referidos_pendientes'`. El DEFAULT evita backfill.

**Migración — analogía `0206_tv_show_alternative.sql`** `[TREN]`:

```sql
-- Source: el-templo-api/src/db/migrations/0206_tv_show_alternative.sql [TREN]
-- Fase 178 (bloque alternativo tecnica/combos) -- baja de la rotacion automatica
-- ...
--   show_alternative      BOOLEAN NOT NULL DEFAULT FALSE, una fila por sede,
ALTER TABLE tv_class_state
  DROP COLUMN deuteros_auto_rotate,
  DROP COLUMN deuteros_pinned_at,
  ADD COLUMN show_alternative BOOLEAN NOT NULL DEFAULT FALSE;
```

Reglas duras que el archivo respeta y hay que replicar: comentario de cabecera que explica el POR QUÉ; **nunca `;` dentro de un comentario `--`** (el runner parte statements antes de limpiar comentarios); `.sql` en el **mismo commit** que el cambio de schema; **nunca `drizzle-kit migrate`**.

🔴 **Numeración:** NO fijarla al planificar. Hoy conviven `origin/master` hasta 0208, staging hasta 0208 sin 0207, y el tren hasta 0207 (`0207_seed_module_flags`, que **choca** con el 0207 de master). El plan debe traer un paso explícito de "resolver el número contra la base real al ejecutar" (`ls el-templo-api/src/db/migrations/*.sql | sort | tail -3` en el checkout de trabajo + chequeo contra `origin/master`). Probablemente 0210+.

---

### `scheduling/routes.ts` — `GET /branches` (route) — MOD

**Analogía:** el propio handler, `routes.ts:1081-1123` `[TREN]`. El cambio es **aditivo** (una columna más en el `.select`) y no rompe `BranchOption`:

```ts
// Source: el-templo-api/src/modules/scheduling/routes.ts:1081-1122 [TREN]
fastify.get("/branches", async (request) => {
  const ctx = assertTenant(request.scope, "scheduling.memberBranches");
  const [memberRow] = await fastify.db
    .select({ branchCountry: schema.branches.country })
    .from(schema.users)
    .innerJoin(
      schema.branches,
      and(
        tenantWhere(schema.branches, ctx),
        eq(schema.branches.id, schema.users.branchId),
      ),
    )
    .where(
      and(
        tenantWhere(schema.users, ctx),
        eq(schema.users.id, request.user.userId),
      ),
    )
    .limit(1);

  const where = memberRow
    ? and(
        tenantWhere(schema.branches, ctx),
        eq(schema.branches.isActive, true),
        eq(schema.branches.isVirtual, false),
        eq(schema.branches.country, memberRow.branchCountry),
      )
    : and(
        tenantWhere(schema.branches, ctx),
        eq(schema.branches.isActive, true),
        eq(schema.branches.isVirtual, false),
      );

  const rows = await fastify.db
    .select({ id: schema.branches.id, name: schema.branches.name }) // ← + address
    .from(schema.branches)
    .where(where)
    .orderBy(schema.branches.name);
  return { branches: rows };
});
```

La columna ya existe: `db/schema/branches.ts:45-48` `[TREN]` — `address: varchar("address", { length: 255 })`, con el comentario "D-24: street address for the trial-campaign email (D-13) + general reuse". Y ya se consume en `trials-service.ts:495`.

---

### `scheduling/trials-service.ts` — recordatorio push (service, event-driven) — MOD

**Analogía:** `booking-service.ts:2138-2153` `[TREN]` — enqueue **fuera de la transacción**, envuelto en try/catch, para que un fallo de notificación jamás revierta la reserva:

```ts
// Source: el-templo-api/src/modules/scheduling/booking-service.ts:2138-2153 [TREN]
// Notify the promoted member outside the transaction so a notification
// failure never rolls back the promotion itself.
if (promoted) {
  try {
    await this.notificationService.queueNotification({
      userId: promoted.memberId,
      templateKey: "waitlist_promoted",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    this.log.error(
      { err: message, ...promoted, scheduleId, bookingDate },
      "Failed to queue waitlist promotion notification",
    );
  }
}
```

El punto de inserción es después del `this.db.transaction(...)` de `reserveTrialSelfService` (`trials-service.ts:346-430`), con `scheduledAt: clase − 24h`. La ventana horaria debe salir de `buildClassDateTime(date, startTime, tz)` — el mismo helper que usa `isOutsideCancelWindow` (`trials-service.ts:553-563`), DST-aware por sede. **No** `new Date(date + 'T' + time)`.

🔴 **`queueNotification` skipea sin device token** (`notifications/service.ts:368-377` `[TREN]`), y el freemium que llega por email casi nunca tiene la app:

```ts
// Source: el-templo-api/src/modules/notifications/service.ts:368-377 [TREN]
// Skip enqueueing for users without a device token. Without one, the queue
// processor would only mark the row 'failed' with "No device tokens registered"
// — pure noise that drowns real FCM errors.
if (!(await this.userHasDeviceToken(userId, ctx))) {
  this.log.info(
    { userId, templateKey },
    "User has no device tokens — skipping",
  );
  return -1;
}
```

⇒ El link de Google Calendar es el mecanismo anti-no-show **principal**, no el complemento.

**Template sin migración** — `notifications/types.ts:79-…` `[TREN]`. Los seeds se siembran idempotentes por tenant desde el cron; alcanza con sumar una entrada al array:

```ts
// Source: el-templo-api/src/modules/notifications/types.ts:172-181 [TREN]
{
  templateKey: "program_renewal_warning",
  category: "programas",
  title: "Tu programa está por vencer",
  body: "Te quedan 7 días de programa. Hablá con tu coach para renovar.",
  titleFemale: "Tu programa está por vencer",
  bodyFemale: "Te quedan 7 dias de programa. Habla con tu coach para renovar.",
  route: "/mi-camino",
}
```

Notar la convención: `titleFemale`/`bodyFemale` **sin tildes ni voseo** en las variantes femeninas heredadas. Categoría sugerida: `anuncios` (default `true`). `route: '/reservas'`.

---

### `scheduling/service.ts` — descripción de actividad (service, read) — MOD · ⚠ ANALOGÍA PARCIAL

**Fuente única de la etiqueta visible:** `scheduling/derived-label.ts` `[TREN]` — 40 líneas, leerlas enteras antes de tocar nada:

```ts
// Source: el-templo-api/src/modules/scheduling/derived-label.ts:22-40 [TREN]
export const DERIVED_CLASS_LABEL: Record<string, string> = {
  combos: "Combos",
  tecnica: "Técnica",
};

export function deriveActivityLabel(
  activityName: string,
  isSpecial: boolean,
  dayMode: string | undefined,
): string {
  const isGenericActivity = activityName === "General" && !isSpecial;
  if (!isGenericActivity) return activityName;
  return DERIVED_CLASS_LABEL[dayMode ?? ""] ?? activityName;
}
```

Consumidores declarados en su docblock: `service.ts::getWeeklyGrid`, `booking-service.ts::getMyBookings`, `booking-service.ts::getMyWeeklyAttendance`.

**Por qué no hay analogía exacta:** no existe hoy ningún caso de dato derivado _acompañando_ a la etiqueta derivada. `activities.description` (`schema/activities.ts:19`, `text("description")`) apunta a la fila "General" mientras la etiqueta dice "Combos". Un bottom sheet ingenuo muestra la descripción equivocada bajo el título correcto — **y ese es el caso mayoritario**, no un borde.

⇒ **El planner debe resolver el modelo antes de escribir la tarea** (opciones (a)/(b)/(c) en §Pitfall 9 del RESEARCH; recomendación: (a), el server deriva etiqueta y descripción en el mismo lugar, con fallback "sin descripción" que oculta el affordance de tap).

---

### `useMagicLink.ts` (composable, request-response) — NUEVO

**Analogía A (forma del composable + `cleanup()`):** `el-templo-app/src/composables/useSchedulingApi.ts:57-80` `[MAIN]`

```ts
// Source: el-templo-app/src/composables/useSchedulingApi.ts:57-80 [MAIN]
export function useSchedulingApi() {
  let abortController: AbortController | null = null;

  function getSignal(): AbortSignal {
    abortController = new AbortController();
    return abortController.signal;
  }

  async function getBranches(): Promise<BranchOption[]> {
    const response = await api.get<{ branches: BranchOption[] }>(
      "/members/scheduling/branches",
      {
        signal: getSignal(),
      },
    );
    return response.data.branches;
  }
  // ... y expone cleanup() al final (regla de CLAUDE.md: sin onUnmounted adentro)
}
```

**Analogía B (persistir la sesión canjeada):** `el-templo-app/src/stores/useAuthStore.ts:41-62` `[MAIN]` — el orden importa: `setTokens` → refs → `setProfile` → `hydrateSelection`.

```ts
// Source: el-templo-app/src/stores/useAuthStore.ts:41-62 [MAIN]
const response = await api.post("/auth/login", { email, password });
const { accessToken, refreshToken, user: userData } = response.data;

// Phase 116: persistir el par access+refresh (la limpieza del authToken legacy
// pasa adentro de setTokens). Sin esto el refreshToken nunca se guarda y el
// interceptor desloguea al primer 401.
await setTokens(accessToken, refreshToken);
token.value = accessToken;
user.value = { id: userData.id, email: userData.email, role: userData.role };

const userStore = useUserStore();
userStore.setProfile(userData);
// Phase 99: rehidratar la selección de nivel persistida ANTES de navegar.
await userStore.hydrateSelection();
```

**D-04 (reemplazo de sesión ajena) — reusar `logout()`, no improvisar:** `useAuthStore.ts:114-125` `[MAIN]` documenta el ORDEN correcto de limpieza (`clearTokens` → `clearSelection` → nulear refs → `clearProfile`). Un `setTokens` sobre una sesión ajena sin ese barrido deja refs de Pinia del usuario anterior vivas (Pitfall 6).

```ts
// Source: el-templo-app/src/stores/useAuthStore.ts:114-125 [MAIN]
async function logout() {
  await clearTokens();
  const userStore = useUserStore();
  // Phase 99: borrar el storage de selección de nivel ANTES de nulear los refs
  // — clearSelection resuelve userId defensivamente del ref que siga poblado,
  // pero remover la clave con el contexto intacto es el orden más seguro.
  await userStore.clearSelection();
  token.value = null;
  user.value = null;
  userStore.clearProfile();
}
```

**Persistencia nativo/web:** nunca tocar `localStorage` directo — `useTokenStorage().setTokens()` (`useTokenStorage.ts:55-59` `[MAIN]`) abstrae Preferences vs localStorage y limpia el `authToken` legacy.

**Nivel de log (Pitfall 12):** token vencido/inválido es el **camino normal** (D-05) ⇒ `log.warn`, nunca `log.error` (que en el front va a Sentry automáticamente). Precedente: `boot/axios.ts:83` usa `log.warn('Silent refresh failed', …)`. **Nunca loguear el token, ni truncado.**

---

### `MagicLinkPage.vue` (page pública, `/r/trial`) — NUEVO

**Analogía:** `el-templo-app/src/pages/LoginPage.vue:161-205` `[MAIN]` — el flujo "autenticar → decidir destino (onboarding vs destino real) → `router.push`":

```ts
// Source: el-templo-app/src/pages/LoginPage.vue:161-187 [MAIN]
async function onSubmit() {
  loading.value = true;
  try {
    await authStore.login(email.value, password.value);

    // Navegar directo a onboarding si no está completo (evita el flash blanco
    // de la cadena de redirects)
    const userStore = useUserStore();
    const needsOnboarding =
      userStore.profile?.role === "member" && !userStore.onboardingCompleted;

    if (needsOnboarding) {
      router.push({ name: "onboarding" });
    } else {
      router.push("/");
    }
  } catch (err: unknown) {
    $q.notify({
      type: "negative",
      message: extractError(err, "Error al iniciar sesión"),
    });
  }
}
```

> ⚠ Este mismo excerpt expone la **Open Question 1** del research: el freemium recién logueado por magic link con `onboardingCompleted === false` cae en onboarding — justo la fricción que la fase quiere matar. Es decisión del usuario en plan-phase.

**Loader mientras canjea:** `TemploLoader` (`ReservasPage.vue:4-6` `[TREN]`: `<div v-if="loading" class="reservas__loading"><TemploLoader size="lg" /></div>`).

---

### `router/routes.ts` + `router/index.ts` (config + guard) — MOD

**Rutas públicas — analogía `routes.ts:4-14`** `[MAIN]` (fuera del `MainLayout`, sin el layout protegido):

```ts
// Source: el-templo-app/src/router/routes.ts:4-14 [MAIN]
// Public routes (no layout)
{ path: '/login',    name: 'login',    component: () => import('pages/LoginPage.vue') },
{ path: '/register', name: 'register', component: () => import('pages/RegisterPage.vue') },
```

**Guard — `router/index.ts:25-51`** `[MAIN]`. 🔴 **La ruta de canje NO puede simplemente sumarse a `publicRoutes`**: el segundo `if` mandaría a `home` al usuario que ya está logueado (caso D-04 "misma sesión"), perdiendo el destino.

```ts
// Source: el-templo-app/src/router/index.ts:25-51 [MAIN]
Router.beforeEach((to, from) => {
  const authStore = useAuthStore();

  // Public routes that don't require authentication
  const publicRoutes = ["login", "register"];
  const isPublicRoute = publicRoutes.includes(to.name as string);

  if (!authStore.isAuthenticated && !isPublicRoute) return { name: "login" };

  // ⚠ ESTE es el que rompe el canje si la ruta entra crudo a publicRoutes:
  if (authStore.isAuthenticated && isPublicRoute) return { name: "home" };

  // Onboarding guard - mandatory for members who haven't completed it (D-15, D-17)
  const userStore = useUserStore();
  if (
    authStore.isAuthenticated &&
    to.name !== "onboarding" &&
    userStore.profile?.role === "member" &&
    !userStore.onboardingCompleted
  ) {
    return { name: "onboarding" };
  }
  return true;
});
```

⇒ La ruta de canje necesita **tratamiento propio** en el guard (una lista aparte tipo `authAgnosticRoutes` que se saltee ambos `if`), no un push a `publicRoutes`.

---

### `boot/deep-links.ts` (boot/listener, event-driven) — MOD

**Analogía:** sí mismo, `deep-links.ts:26-82` `[MAIN]`. Hoy **ignora el token a propósito** — ese es exactamente el comportamiento que la fase invierte:

```ts
// Source: el-templo-app/src/boot/deep-links.ts:26-44 [MAIN]
const TRIAL_DEEP_LINK_PATH = "/r/trial";
const TRIAL_TARGET_ROUTE = "/reservas?trial=1";

/**
 * Map an incoming deep-link URL to an in-app route, or null if it is not a
 * recognized deep link. Only the path is honored — the query token is ignored
 * for authorization (D-21).
 */
function resolveDeepLinkRoute(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.pathname.startsWith(TRIAL_DEEP_LINK_PATH)) {
      return TRIAL_TARGET_ROUTE;
    }
  } catch {
    // Not a parseable URL — ignore.
  }
  return null;
}
```

**Manejo de "app fría" a preservar** (`deep-links.ts:62-81`) — el canje debe completar y persistir tokens **aunque** el `router.push` falle:

```ts
// Source: el-templo-app/src/boot/deep-links.ts:62-81 [MAIN]
const authStore = useAuthStore();
if (!authStore.isAuthenticated) {
  // Logged out: stash the intended route and resume after login (el
  // pendingRoute se consume post-login, p.ej. en MiTemplo on mount).
  useNotificationStore().setPendingRoute(target);
  try {
    void router.push("/login");
  } catch {
    /* Router not ready yet */
  }
  return;
}
try {
  void router.push(target);
} catch {
  // Router not ready — fall back to the pendingRoute resume path.
  useNotificationStore().setPendingRoute(target);
}
```

El canje **va en ambas superficies** (ruta web + listener nativo) compartiendo `useMagicLink()`. En un device con la app instalada, App Links intercepta la URL antes del navegador ⇒ la ruta web nunca corre.

---

### `BranchPickerDialog.vue` (component, dialog) — NUEVO

**Analogía:** `el-templo-app/src/components/PlanExpiryDialog.vue` `[MAIN]` — es el precedente completo de "dialog que se autoevalúa, se muestra una vez por condición, y usa la paleta de marca".

```vue
<!-- Source: el-templo-app/src/components/PlanExpiryDialog.vue:2-31 [MAIN] -->
<!-- D-07: salteable → el q-dialog NO usa el modo bloqueante. -->
<q-dialog v-model="show">
  <q-card class="plan-expiry-dialog">
    <q-card-section class="plan-expiry-dialog__body">
      <q-icon name="event_busy" class="plan-expiry-dialog__icon" size="40px" />
      <h3 class="plan-expiry-dialog__title">{{ title }}</h3>
      <p class="plan-expiry-dialog__text">{{ body }}</p>
    </q-card-section>
    <q-card-actions class="plan-expiry-dialog__actions">
      <q-btn unelevated no-caps class="plan-expiry-dialog__primary full-width" label="…" @click="…" />
      <q-btn flat no-caps dense class="plan-expiry-dialog__secondary" label="Ahora no" @click="onSkip" />
    </q-card-actions>
  </q-card>
</q-dialog>
```

```ts
// Source: el-templo-app/src/components/PlanExpiryDialog.vue:47-51, 108-140 [MAIN]
// Once-per-DAY (D-08): guardamos la fecha local "YYYY-MM-DD" de la última vez.
const SHOWN_KEY = "plan_expiry_shown_v1";

async function evaluate(): Promise<void> {
  try {
    if (await shouldShow()) show.value = true;
  } catch (err: unknown) {
    log.error("Failed to evaluate plan expiry", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// Dispara al login / al volver a la app ya autenticado (igual que los hermanos).
watch(
  () => authStore.isAuthenticated,
  (isAuth) => {
    if (isAuth) void evaluate();
  },
  { immediate: true },
);
```

**Paleta de marca a copiar tal cual** (`PlanExpiryDialog.vue:143-216`) — el comentario del archivo es un mandato explícito: _"Estilos copiados de RatingPromptDialog.vue (mandato de reuse de UI-SPEC): card charcoal #2e2a26, gradiente terracotta, secundario flat cream-55, max-width 340px, border-radius 16px. **NO re-estilizar**."_ Cálida, sin azul; el dorado queda reservado a Aura.

**Hermanos disponibles como referencia adicional:** `RatingPromptDialog.vue` (once-ever), `ImprovementPromptDialog.vue`, `PushPermissionDialog.vue`.

---

### `ActivityInfoSheet.vue` (component, bottom sheet) — NUEVO · ⚠ SIN PRECEDENTE

**Búsqueda exhaustiva:** `grep -rn 'position="bottom"\|BottomSheet' src/pages src/components src/layouts` en `el-templo-app` → **cero resultados**. No existe ningún bottom sheet en la app.

⇒ Analogía de rol: `PlanExpiryDialog.vue` (mismo card, mismos tokens de marca) con `<q-dialog position="bottom">`. Alternativa: `$q.bottomSheet()` de Quasar, pero **no tiene precedente en el repo** y no permite el styling de marca — preferir el `q-dialog`.

---

### `ReservasPage.vue` (page) — MOD `[TREN]`

**Estado "prueba reservada" a enriquecer (D-19)** — `ReservasPage.vue:8-52` + `904-913` `[TREN]`. El dato de dirección **ya llega**:

```ts
// Source: el-templo-app/src/pages/ReservasPage.vue:904-913 [TREN]
const trialConfirmationBody = computed(() => {
  const b = trialBooking.value;
  if (!b) return "";
  const d = new Date(b.date + "T00:00:00");
  const dayLabel =
    DAY_LABELS_FULL[((d.getDay() === 0 ? 7 : d.getDay()) as DayOfWeek) ?? 1] ??
    "";
  const dateStr = `${d.getDate()} ${MONTH_ABBREV[d.getMonth()]}`;
  const timeStr = formatTime(b.startTime);
  const sede = b.branchAddress
    ? `${b.branchName} (${b.branchAddress})`
    : b.branchName;
  return `Te esperamos el ${dayLabel} ${dateStr} a las ${timeStr} en ${sede}. ¡Llegá unos minutos antes!`;
});
```

⇒ D-19 es **puro trabajo de front**: `getTrialEligibility()` ya devuelve `branchAddress` (`trials-service.ts:488-535` `[TREN]`; tipo en `useSchedulingApi.ts:45-55` `[MAIN]`). Falta el link de Maps, el checklist y el botón de calendario.

**Selector de sede que el popup debe SETEAR (D-09, no duplicar)** — `ReservasPage.vue:83-103` `[TREN]`:

```vue
<!-- Source: el-templo-app/src/pages/ReservasPage.vue:83-103 [TREN] -->
<!-- Branch selector — ALWAYS shown for trial mode (D-06): freemium must pick a physical sede -->
<div class="q-mb-md flex justify-center">
  <q-select
    v-model="trialBranchId"
    :options="branchOptions"
    dense rounded outlined emit-value map-options
    class="branch-select"
    :display-value="trialBranchId ? undefined : 'Elegí una sede para ver los horarios'"
  >
    <template #prepend><q-icon name="location_on" size="18px" color="primary" /></template>
    <template #append><q-icon name="unfold_more" size="16px" color="grey-6" /></template>
  </q-select>
</div>
```

**Gates de estado (D-08, D-16)** — `ReservasPage.vue:893-902` `[TREN]`. `trialEligible` / `trialBooking` son los flags que activan el popup y la card "¿Primera vez?":

```ts
// Source: el-templo-app/src/pages/ReservasPage.vue:889-902 [TREN]
// Eligibility comes from the backend ONLY (server-side state is the sole
// authorization — the campaign email token never authorizes, D-21).
const trialEligibility = ref<TrialEligibility | null>(null);
const trialBranchId = ref<number | null>(null);

const trialEligible = computed(
  () =>
    trialEligibility.value?.eligible === true &&
    !trialEligibility.value?.alreadyBooked,
);
const trialBooking = computed(() =>
  trialEligibility.value?.alreadyBooked
    ? (trialEligibility.value.booking ?? null)
    : null,
);
const isTrialMode = computed(() => trialEligible.value);
```

🔴 **Shim de nombres de sede — `ReservasPage.vue:882-887`** `[TREN]`:

```ts
// Source: el-templo-app/src/pages/ReservasPage.vue:882-887 [TREN]
const branchOptions = computed(() =>
  branches.value.map((b) => ({
    label: b.name.replace(/^El Templo\s+/i, "Sede "),
    value: b.id,
  })),
);
```

En paralelo, la fase de analytics agregó un shim **API-side** (`app-branch-name.ts`, mig 0208 de master). **Verificar cuál está vivo en la base real al ejecutar** o se produce "Sede Sede X".

---

### `utils/calendar-link.ts` + su test (utility) — NUEVO

**Analogía:** `el-templo-app/src/utils/whatsapp.ts` `[MAIN]` — util pura, constantes exportadas, sin dependencias de Vue:

```ts
// Source: el-templo-app/src/utils/whatsapp.ts:19-32 [MAIN]
export const WHATSAPP_NUMBERS: Record<Country, string> = {
  AR: "5492235820521",
  ES: "34680774331",
};

export function buildWhatsAppUrl(
  country: Country | null | undefined,
  text?: string,
): string {
  const number = getWhatsAppNumber(country);
  const query = text ? `?text=${encodeURIComponent(text)}` : "";
  return `https://wa.me/${number}${query}`;
}
```

**Test — `el-templo-app/test/whatsapp.test.ts:1-40`** `[MAIN]`: `describe` por función exportada, casos de defaults/null/undefined y de encoding. Copiar la estructura para `calendar-link.test.ts`, con el caso crítico del research: **la timezone es la de la SEDE, no la del device** (`buildClassDateTime(date, startTime, tz)`).

```ts
// Source: el-templo-app/test/whatsapp.test.ts:29-40 [MAIN]
describe("buildWhatsAppUrl", () => {
  it("builds a wa.me URL with no text when none is provided", () => {
    expect(buildWhatsAppUrl("ES")).toBe("https://wa.me/34680774331");
  });
  it("appends url-encoded text when provided", () => {
    const url = buildWhatsAppUrl("AR", "Hola! Quiero reservar");
    expect(url).toBe(
      "https://wa.me/5492235820521?text=Hola!%20Quiero%20reservar",
    );
  });
});
```

---

### Admin: `types/campaign.ts` + `useCampaignsApi.ts` + `CampaniasPage.vue` — MOD `[MAIN]`

**Tipos (union de strings, espejo de la API):** `types/campaign.ts:7-9` `[MAIN]`

```ts
// Source: el-templo-admin/src/types/campaign.ts:1-9 [MAIN]
/**
 * Campaign types (Phase 119 — reusable email-campaign system).
 * Mirror the API shapes from el-templo-api/src/modules/campaigns/types.ts
 */
export type CampaignCountry = "AR" | "ES" | null;
export type CampaignStatus = "draft" | "sending" | "sent";
```

⇒ `export type CampaignSegment = 'freemium_elegibles' | 'bajas' | 'prueba_no_convertida' | 'alerta_ausente' | 'referidos_pendientes';`

**Método del composable (loading/error/try-finally):** `useCampaignsApi.ts:128-142` `[MAIN]`

```ts
// Source: el-templo-admin/src/composables/useCampaignsApi.ts:128-142 [MAIN]
async function getEligibleCount(country?: CampaignCountry): Promise<number> {
  loading.value = true;
  error.value = null;
  try {
    const { data } = await api.get<EligibleCount>(
      "/campaigns/admin/eligible-count",
      {
        params: buildCountryParams(country),
      },
    );
    return data.count;
  } catch (err: unknown) {
    error.value = extractError(err, "Error cargando la audiencia elegible");
    throw err;
  } finally {
    loading.value = false;
  }
}
```

**Selector en el form de creación:** `CampaniasPage.vue:165-175` `[MAIN]` — el `q-select` de país es la plantilla exacta del `q-select` de segmento:

```vue
<!-- Source: el-templo-admin/src/pages/CampaniasPage.vue:165-175 [MAIN] -->
<q-select
  v-if="isOwner"
  v-model="form.country"
  :options="createCountryOptions"
  label="País (opcional)"
  dense
  outlined
  emit-value
  map-options
  clearable
/>
```

**Estado del form + payload:** `CampaniasPage.vue:434-488` `[MAIN]` — `CreateForm` interface, `emptyForm()`, `canCreate` computed, y el armado condicional del payload en `confirmCreate()`.

**Preview del conteo:** `CampaniasPage.vue:505-533` `[MAIN]` — el patrón "abrir dialog → fetch → mostrar `sendConfirmMessage`" ya existe:

```ts
// Source: el-templo-admin/src/pages/CampaniasPage.vue:513-533 [MAIN]
// Exact UI-SPEC Copywriting Contract send-confirmation body (D-11).
const sendConfirmMessage = computed(
  () =>
    `Vas a enviar este email a ${eligibleCount.value} personas. Esta acción no se puede deshacer. ¿Continuar?`,
);

async function openSendDialog(campaign: CampaignListItem) {
  campaignToSend.value = campaign;
  eligibleCount.value = 0;
  sendDialog.value = true;
  loadingEligible.value = true;
  try {
    eligibleCount.value = await campaignsApi.getEligibleCount(
      countryScope.value,
    );
  } catch (err: unknown) {
    log.error("Error fetching eligible count", {
      error: err instanceof Error ? err.message : "Error desconocido",
    });
    $q.notify({
      type: "negative",
      message: "No se pudo calcular la audiencia",
    });
  } finally {
    loadingEligible.value = false;
  }
}
```

> **Pitfall 8:** el preview debe pasar el **segmento persistido de la campaña**, no el del form sin guardar.

---

### Tests de integración de rutas públicas

**Analogía:** `el-templo-api/test/campaigns-tracking.test.ts` `[TREN]` — `app.inject()` sobre la ruta pública con un token real firmado, y evidencia releída de la base:

```ts
// Source: el-templo-api/test/campaigns-tracking.test.ts:53-66, 90-110 [TREN]
/** Create a campaign + send for a fresh eligible user, returning ids + token. */
async function seedSend(): Promise<{
  sendId: number;
  campaignId: number;
  userId: number;
  email: string;
  token: string;
}> {
  const { id: userId, email } = await createEligibleFreemium(app);
  const campaignId = await createTestCampaign(app, ownerId);
  const sendId = await createTestSend(app, campaignId, userId, email);
  const token = signCampaignToken({ userId, campaignId, sendId });
  return { sendId, campaignId, userId, email, token };
}

it("D-18: GET /track/click inserta un evento 'click' + 302 a app.eltemplo.org", async () => {
  const { sendId, token } = await seedSend();
  const res = await app.inject({
    method: "GET",
    url: `/api/campaigns/track/click?t=${encodeURIComponent(token)}`,
  });
  expect(res.statusCode).toBe(302);
  expect(res.headers["location"] as string).toContain("app.eltemplo.org");

  const events = await app.db
    .select()
    .from(schema.campaignEvents)
    .where(
      sql`/* tenant-safe: lectura por FK propia (sendId), send creado por este mismo test */ ${schema.campaignEvents.sendId} = ${sendId}`,
    );
  expect(events.some((e) => e.type === "click")).toBe(true);
});
```

**Resolución del owner sin hardcodear ids** (`campaigns-tracking.test.ts:38-51` `[TREN]`) — regla dura del proyecto:

```ts
// Source: el-templo-api/test/campaigns-tracking.test.ts:38-51 [TREN]
beforeEach(async () => {
  await cleanAllTestData(app);
  const [owner] = await app.db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(
      and(
        tenantWhere(schema.users, CTX),
        eq(schema.users.email, "admin@test.com"),
      ),
    )
    .limit(1);
  ownerId = owner.id;
});
```

**Tests de audiencia** — `test/campaigns-audience.test.ts` `[TREN]` (172 líneas, leerlas enteras): un `it` por invariante, con helpers de seed locales (`seedActiveSubscription`, `seedTrialBooking`) y aserciones del tipo `expect(eligible.map(e => e.userId)).toContain(id)` / `.not.toContain(id)`. Los 5 segmentos nuevos replican esa forma (incluido + excluido por cada predicado).

---

## Patrones compartidos (cross-cutting)

### 1. Exención de tenancy DUPLICADA (lint CON-06 + sentinel CON-05)

**Fuente:** `el-templo-api/src/modules/auth/refresh-token-service.ts:113-131` `[TREN]`
**Aplica a:** todo acceso pre-scope de esta fase (canje del magic link, `resolveUserTenant`)

```ts
// Source: el-templo-api/src/modules/auth/refresh-token-service.ts:113-126 [TREN]
private async resolveTenantId(userId: number): Promise<TenantId> {
  // T-175-06: `users` ya es tabla STRICT (sentinel de runtime activo) — el
  // comentario TS de arriba exime al LINT, no al SENTINEL (que solo lee el
  // SQL de runtime, Drizzle nunca emite comentarios TS en el texto que llega
  // al pool). Por eso la MISMA exención se repite EMBEBIDA en el SQL de abajo.
  /* tenant-safe: lookup pre-scope por PK de users — esta ES la lectura que DERIVA el tenant_id de arriba, filtrarla por tenant seria circular */
  const [row] = await this.db
    .select({ tenantId: schema.users.tenantId })
    .from(schema.users)
    .where(
      sql`/* tenant-safe: lookup pre-scope por PK de users — esta ES la lectura que DERIVA el tenant_id de arriba, filtrarla por tenant seria circular */ ${eq(schema.users.id, userId)}`,
    )
    .limit(1);
  return row?.tenantId ?? 1;
}
```

**Omitir cualquiera de los dos rompe CI.** El texto de la exención debe ser **idéntico** en ambos lugares.
**Anti-patrón prohibido:** meter el `tenantId` en el payload del token. El token IDENTIFICA; la base AUTORIZA. La batería `iso-03-campaigns.test.ts` lo prueba.
**Prohibido también:** agregar entradas a `tenant-lint-allowlist.json` (D-13/D-14 — la lista solo se achica).

### 2. Estampado de tenant en escrituras derivadas

**Fuente:** `el-templo-api/src/modules/campaigns/tracking-service.ts:76-84` `[TREN]`
**Aplica a:** cualquier INSERT que haga el canje del magic link

```ts
// Source: el-templo-api/src/modules/campaigns/tracking-service.ts:76-84 [TREN]
async recordOpen(sendId: number): Promise<void> {
  const send = await this.getSendEmail(sendId);
  if (!send) return;                      // token que no resuelve = no-op silencioso
  await this.db
    .insert(schema.campaignEvents)
    .values(tenantValues({ tenantId: send.tenantId }, { sendId, type: "open" }));
}
```

El `tenantId` estampado sale de la fila resuelta, **nunca de `ctx`** (no hay ctx en ruta pública).

### 3. Checklist de los 3 gates de tenancy por ruta nueva

**Aplica a:** `POST /api/campaigns/exchange` y a toda ruta nueva de la fase

1. Agregar la clave a `TENANT_MANIFEST` (`test/tenant-manifest.ts:621-641`), categoría **`tenant-scoped`** — precedente explícito de las 3 rutas públicas de campañas:
   ```ts
   // Source: el-templo-api/test/tenant-manifest.ts:639-641 [TREN]
   "GET /api/campaigns/track/click": { categoria: "tenant-scoped" },
   "GET /api/campaigns/track/open":  { categoria: "tenant-scoped" },
   "GET /api/campaigns/unsubscribe": { categoria: "tenant-scoped" },
   ```
2. Bumpear `ENTRADAS_BASELINE` (`test/tenancy/iso-01-manifiesto.test.ts:187`, hoy `370`) **y el número en el título del `it`** (líneas 335, 348, 359).
3. Sumar la ruta a `test/tenancy/iso-03-campaigns.test.ts` y actualizar "las 10 rutas tenant-scoped" del docblock.
4. Verificar local: `pnpm --dir el-templo-api lint:tenant`.
5. Si aparece un **job** nuevo: `JOBS_ESPERADOS` en `con-04-crons-per-tenant.test.ts` + `forEachActiveTenant`. (La recomendación del research es enqueue-en-la-reserva **sin** job nuevo, justamente para no pagar este gate.)

### 4. Manejo de errores

**Fuente:** `campaigns/routes.ts:87-93` `[TREN]` — degradar en silencio en rutas públicas:

```ts
// Source: el-templo-api/src/modules/campaigns/routes.ts:87-93 [TREN]
try {
  await tracking.recordOpen(payload.sendId);
} catch (err: unknown) {
  // Never let a tracking write break pixel delivery (degrade silently).
  const message = err instanceof Error ? err.message : String(err);
  request.log.warn({ err: message }, "recordOpen failed");
}
```

Front (`CampaniasPage.vue:493-499` `[MAIN]`): `catch (err: unknown)` + `instanceof Error` + `log.error(...)` + `$q.notify({ type: 'negative' })`.
API: `BadRequestError` de `shared/errors` para errores de negocio (`service.ts:313`: `throw new BadRequestError("Campaña no encontrada")`).
**Excepción de esta fase:** token vencido/inválido en el canje es camino normal ⇒ `warn`, no `error`.

### 5. Fuentes únicas que hay que NOMBRAR en los planes (o se duplican)

| Necesidad                          | Fuente única existente                                            | Archivo                                               |
| ---------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------- |
| Emitir refresh token               | `RefreshTokenService.issue(userId)`                               | `modules/auth/refresh-token-service.ts:96`            |
| Comparar firma HMAC                | `validateCampaignToken` (`timingSafeEqual` + chequeo de longitud) | `modules/campaigns/token-service.ts:81`               |
| Persistir sesión en el cliente     | `useTokenStorage().setTokens()`                                   | `el-templo-app/src/composables/useTokenStorage.ts:55` |
| Refrescar access vencido           | interceptor con lock de `boot/axios.ts`                           | `el-templo-app/src/boot/axios.ts:48-98`               |
| Escapar copy del admin en el email | `esc()`                                                           | `modules/campaigns/templates.ts:45`                   |
| Nombre de clase visible            | `deriveActivityLabel()`                                           | `modules/scheduling/derived-label.ts:32`              |
| Ventana de cancelación de prueba   | `isOutsideCancelWindow()` (DST-aware)                             | `modules/scheduling/trials-service.ts:553`            |
| Fecha/hora de clase en tz de sede  | `buildClassDateTime(date, startTime, tz)`                         | `modules/scheduling/*`                                |
| País de la campaña                 | `attachCountryScope` + `scopeCountry()`                           | `modules/campaigns/routes.ts:163-169`                 |
| Deep link (host allowlisted)       | `CampaignService.trialDeepLink()` / `TRIAL_DEEP_LINK_BASE`        | `modules/campaigns/service.ts:40, 807`                |
| Templates de push                  | `TEMPLATE_SEEDS` + `seedTemplates(ctx)`                           | `modules/notifications/types.ts:79`                   |
| WhatsApp por país (front)          | `buildWhatsAppUrl()`                                              | `el-templo-app/src/utils/whatsapp.ts:28`              |
| WhatsApp por país (email)          | `WHATSAPP_URLS`                                                   | `modules/campaigns/service.ts:52`                     |

---

## Sin analogía

| Archivo                                                                               | Rol                      | Data flow      | Motivo                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------- | ------------------------ | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `el-templo-app/src/components/ActivityInfoSheet.vue`                                  | component (bottom sheet) | —              | **No existe ningún bottom sheet en `el-templo-app`** (`grep 'position="bottom"\|BottomSheet'` → 0 hits). Usar `PlanExpiryDialog.vue` como base de estilo + `q-dialog position="bottom"`.                                                                     |
| `scheduling/service.ts` — descripción de actividad coherente con la etiqueta derivada | service                  | read/transform | No hay precedente de dato derivado que acompañe a `deriveActivityLabel()`. El modelo (a/b/c del §Pitfall 9) es **decisión de diseño abierta**, no copia de patrón.                                                                                           |
| `el-templo-app/test/deep-links.test.ts`                                               | test (unit)              | event-driven   | No hay tests de boot files ni de componentes en `el-templo-app/test/` (7 archivos, todos de utils/stores puros). Se puede testear `resolveDeepLinkRoute` **solo si se la exporta** — hoy es privada del módulo. Analogía de estilo: `test/whatsapp.test.ts`. |

**Nota adicional:** `el-templo-admin` **no tiene framework de tests** (`package.json` sin script `test`). Los cambios del admin se validan con `vue-tsc` local — **CI no typechequea los frontends**.

---

## Metadata

**Alcance de la búsqueda de analogías:**

- `/home/franco/projects/et-176/el-templo-api/src/modules/{campaigns,auth,scheduling,notifications}/`
- `/home/franco/projects/et-176/el-templo-api/src/db/{schema,migrations}/`
- `/home/franco/projects/et-176/el-templo-api/test/` (+ `test/tenancy/`)
- `/home/franco/projects/el-templo/el-templo-app/src/{boot,router,composables,stores,components,pages,utils}/` + `test/`
- `/home/franco/projects/el-templo/el-templo-admin/src/{pages,composables,types}/`

**Archivos escaneados:** 38 (26 leídos en detalle, 12 por grep dirigido)
**Fecha de extracción:** 2026-08-22

---

_Fase: 180 — Campañas etapa 2 (magic links, audiencias, ReservasPage informativa)_
_Patrones mapeados: 2026-08-22_
