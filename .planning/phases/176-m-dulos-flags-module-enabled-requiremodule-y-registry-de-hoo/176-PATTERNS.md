# Phase 176: Módulos — flags `module.*.enabled`, `requireModule` y registry de hooks - Pattern Map

**Mapped:** 2026-08-20
**Base de código:** worktree `/home/franco/projects/et-173`, rama `feat/173-adopcion-members`, HEAD `2a4f5c92`
**Files analyzed:** 18 (11 nuevos, 7 modificados)
**Analogs found:** 16 / 18

> **Todas las rutas de este documento son relativas a `/home/franco/projects/et-173/el-templo-api/`.** Los números de línea son de `2a4f5c92` y fueron leídos en esta sesión. El planner NO debe usar los números de línea del doc 04 (pre-tenancy, ~700 líneas de desfasaje en `subscriptions/service.ts`).

---

## File Classification

| Nuevo / Modificado                               | N/M | Role                 | Data Flow           | Closest Analog                                        | Match          |
| ------------------------------------------------ | --- | -------------------- | ------------------- | ----------------------------------------------------- | -------------- |
| `src/modules/shared/modules.ts`                  | N   | config / constants   | in-process (static) | `src/modules/settings/keys.ts` (23 líneas, completo)  | exact          |
| `src/modules/shared/module-flags.ts`             | N   | service (funcional)  | CRUD read + cache   | `src/modules/settings/service.ts:37-60` (`getFlag`)   | exact          |
| `src/modules/shared/module-registry.ts`          | N   | middleware / guard   | request-response    | `src/modules/shared/country-scope.ts:127-279`         | role-match     |
| `src/modules/shared/hooks.ts`                    | N   | utility (tipos)      | event-driven        | `src/modules/streaks/types.ts:1-39` (forma) + AuraSvc | partial        |
| `src/modules-boot.ts`                            | N   | config / bootstrap   | composition         | `src/app.ts:189-356` (registros directos)             | role-match     |
| `src/modules/subscriptions/pricing.ts`           | N   | service (extracción) | transform           | `src/modules/subscriptions/service.ts:1729-1861`      | exact (fuente) |
| `src/modules/aura/module.ts`                     | N   | provider / ModuleDef | event-driven        | **sin análogo** (ver §No Analog Found)                | —              |
| `src/db/migrations/0207_seed_module_flags.sql`   | N   | migration            | batch / seed        | `src/db/migrations/0168_seed_pricing_zero_price.sql`  | exact          |
| `test/tenancy/mod-01-guard.test.ts`              | N   | test (integración)   | request-response    | `test/tenancy/iso-03-referrals.test.ts:50-112`        | exact          |
| `test/tenancy/mod-02-hooks.test.ts`              | N   | test (integración)   | event-driven        | `test/tenancy/iso-03-referrals.test.ts:50-112`        | role-match     |
| `test/tenancy/mod-02-pricing-module-off.test.ts` | N   | test (integración)   | transform           | `test/subscriptions/pricing-golden.test.ts:51-70`     | exact          |
| `src/app.ts`                                     | M   | config / bootstrap   | composition         | sí mismo (`app.ts:168-187` fp, `189-356` directos)    | exact          |
| `src/modules/subscriptions/service.ts`           | M   | service (facade)     | CRUD + transform    | sí mismo (cadena `1729-1861`)                         | exact          |
| `src/modules/streaks/service.ts`                 | M   | service              | event-driven        | sí mismo (`273-303`)                                  | exact          |
| `src/modules/auth/routes.ts` (`GET /me`)         | M   | route handler        | request-response    | sí mismo (`759-799`)                                  | exact          |
| `test/tenancy/iso-01-manifiesto.test.ts`         | M   | test (gate estruct.) | batch / assertion   | sí mismo (`183-208` beforeAll, `322-367` forma)       | exact          |
| `test/tenant-manifest.ts`                        | M   | test fixture / data  | static              | sí mismo (`134-172`)                                  | exact          |
| `test/subscriptions/pricing-golden.test.ts`      | M   | test (golden)        | transform           | sí mismo (`113-127` un caso)                          | exact          |

---

## Pattern Assignments

### `src/modules/shared/modules.ts` (config / constants — NUEVO)

**Analog:** `src/modules/settings/keys.ts` (archivo completo, 23 líneas)

Fuente única de los 4 nombres de módulo. Hoy la lista existe duplicada como `const` NO exportada en `test/tenant-manifest.ts:149-156`; el plan debe invertir la dirección (el manifiesto **importa** de `src/`, precedente: `test/helpers.ts` importa `../src/modules/shared/tenant`).

**Patrón exacto a copiar** (`settings/keys.ts:1-14`) — comentario de cabecera que prohíbe la re-declaración + `as const`:

```ts
// Module: settings — canonical setting keys
//
// Single source of truth for the pricing-related system_settings keys. Phase 154
// (ALUM-03): the card-surcharge rule lives here so front ... and back ... all
// reference ONE literal. Do NOT re-declare this string anywhere else in the
// repo — import it from this module.

export const PRICING_SETTINGS_KEYS = {
  /** system_settings key gating the credit-card surcharge (`'on'` / `'off'`). */
  cardSurcharge: "pricing.card_surcharge_enabled",
  zeroPrice: "pricing.zero_price_enabled",
} as const;
```

**Forma de la lista + tipo derivado a copiar** (`test/tenant-manifest.ts:134-156`, que es lo que hay que mover a `src/`):

```ts
/** Módulos Templo del doc `.docs/saas-multitenancy/04-mecanismo-modulos.md`. */
const MODULOS_TEMPLO = [
  "templo-training",
  "templo-gamification",
  "templo-marketing",
  "templo-onboarding",
] as const;

export type ModuloTemplo = (typeof MODULOS_TEMPLO)[number];
```

Precedente idéntico dentro de `src/`: `src/modules/streaks/types.ts:19` (`export const STREAK_MILESTONES = [7, 14, 30, 60, 100] as const;`).

**Decisión que el plan debe fijar explícitamente (Assumption A2 del RESEARCH):** el valor serializado del flag. `settings/service.ts:23-24` usa `'on'`/`'off'`; el doc 04 §2 dice `"true"`/`"false"`. Elegir uno y escribirlo como constante acá, con comentario que nombre la divergencia.

---

### `src/modules/shared/module-flags.ts` (service funcional, CRUD read + cache TTL — NUEVO)

**Analog:** `src/modules/settings/service.ts:37-60`

**Imports pattern** (`settings/service.ts:13-20`) — convención exacta del repo para un lector de KV:

```ts
import { eq } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyBaseLogger } from "fastify";
import type * as schema from "../../db/schema";
import { systemSettings } from "../../db/schema";
import { PRICING_SETTINGS_KEYS, LEADS_SETTINGS_KEYS } from "./keys";

type DbInstance = MySql2Database<typeof schema>;
```

Para esta fase: cambiar `systemSettings` por `tenantSettings` (exportado en `src/db/schema/tenants.ts:73-85`, unique `uq_tenant_setting` sobre `(tenantId, settingKey)`).

**Core pattern — lectura fail-closed** (`settings/service.ts:32-45`). Nótese: default OFF por ausencia de fila, `.limit(1)`, comparación positiva contra la constante `ON`:

```ts
  /**
   * Read a boolean pricing flag from system_settings. Returns
   * `settingValue === 'on'`, falling back to `false` (default OFF) when the key
   * does not exist. Single reader used by all pricing rules.
   */
  private async getFlag(key: string): Promise<boolean> {
    const [row] = await this.db
      .select({ settingValue: systemSettings.settingValue })
      .from(systemSettings)
      .where(eq(systemSettings.settingKey, key))
      .limit(1);

    return row?.settingValue === ON;
  }
```

**Constantes serializadas** (`settings/service.ts:22-24`):

```ts
/** Serialized on/off values persisted in system_settings.setting_value. */
const ON = "on";
const OFF = "off";
```

**Upsert (si el plan agrega un setter)** — `settings/service.ts:52-60`, con `onDuplicateKeyUpdate` y log estructurado:

```ts
await this.db
  .insert(systemSettings)
  .values({ settingKey: key, settingValue: value })
  .onDuplicateKeyUpdate({ set: { settingValue: value } });

this.log.info({ settingKey: key, value }, "pricing rule updated");
```

**⚠️ Sin análogo para el cache TTL.** No existe un solo cache con TTL en `src/` (`grep -rn "new Map(" src/` → ninguno con expiración). El `Map<number, {flags, expiresAt}>` del RESEARCH §Code Examples es greenfield. Consecuencia obligatoria para el planner: exportar `invalidateModuleFlags(tenantId?)` desde este archivo y llamarla en `afterEach` de todo test que toque flags (Pitfall 4 — `vitest.config.ts` usa `isolate: false`, el cache se comparte entre archivos del mismo worker).

**Diferencia de firma respecto del análogo:** `SettingsService` es una **clase con `db` inyectada por constructor**. El resolver de flags lo llama el guard `onRequest` y el registry, que no tienen instancia de service — el RESEARCH propone **funciones libres con `db` por parámetro** (`enabledModules(tenantId, db)`). Es una divergencia deliberada del análogo; que el plan la escriba.

---

### `src/modules/shared/module-registry.ts` (middleware / guard, request-response — NUEVO)

**Analog:** `src/modules/shared/country-scope.ts:127-279` (`attachScope`) — es el único guard del repo que resuelve estado del request con un `SELECT` y corta fail-closed.

**Imports pattern** (`country-scope.ts:1-7`):

```ts
import type { FastifyRequest } from "fastify";
import { MySql2Database } from "drizzle-orm/mysql2";
import { and, eq } from "drizzle-orm";
import * as schema from "../../db/schema";
import { OWNER_ROLES } from "./permissions";
import { AppError } from "./errors";
import { tenantWhere, type TenantContext } from "./tenant";
```

**Firma del guard** (`country-scope.ts:127-130`) — `db` por parámetro, no por closure de instancia:

```ts
export async function attachScope(
  request: FastifyRequest,
  db: MySql2Database<typeof schema>,
): Promise<void> {
```

**Resolución de tenant desde `users` — el SELECT mínimo a copiar** (`country-scope.ts:151-162`). `resolveTenantForGuard` del RESEARCH es esta query recortada a una columna:

```ts
  if (typeof userId === "number") {
    const [row] = await db
      .select({
        country: schema.users.country,
        branchId: schema.users.branchId,
        tenantId: schema.users.tenantId,
        tenantStatus: schema.tenants.status,
      })
      .from(schema.users)
      .leftJoin(schema.tenants, eq(schema.users.tenantId, schema.tenants.id))
      .where(eq(schema.users.id, userId))
      .limit(1);
```

**⚠️ NO reusar `attachScope` entera dentro del guard:** las líneas `181-195` lanzan `AppError 403 TENANT_SUSPENDED`, lo que adelantaría un 403 en rutas que hoy responden otra cosa (cambio de comportamiento observable). El guard hace su propio `SELECT users.tenant_id`.

**Error handling / fail-closed pattern a copiar** (`country-scope.ts:170-195`) — comparación **positiva**, log estructurado con `request.log`, comentario que explica por qué:

```ts
if (row.tenantStatus == null) {
  request.log.error(
    { userId, role },
    "attachScope: user has no resolvable tenant (data corruption); scope.tenantId=null (default-deny)",
  );
  tenantId = null;
} else if (row.tenantStatus !== "active") {
  // 'suspended' ... y 'archived' ... cortan igual. La comparación es contra
  // 'active' y no contra la lista de estados malos para que un estado futuro
  // del enum deniegue por default en vez de colarse.
  request.log.warn(
    { userId, role, tenantId, tenantStatus: row.tenantStatus },
    TENANT_SUSPENDED,
  );
  throw new AppError(
    "Acceso suspendido para este gimnasio",
    403,
    TENANT_SUSPENDED,
  );
}
```

**Código de error como constante exportada** (`country-scope.ts:21`) — convención del repo para que un frontend matchee exacto en vez de parsear el mensaje. Si el 404 del guard lleva código, sigue esta forma:

```ts
export const TENANT_SUSPENDED = "TENANT_SUSPENDED";
```

Precedente hermano: `TENANT_UNRESOLVED` en `src/modules/shared/tenant.ts:94`, y su narrowing fail-closed `assertTenant` (`tenant.ts:192-205`).

**Barrel export** — el módulo `shared` tiene barrel (`src/modules/shared/index.ts:1-38`) pero **no todo se exporta ahí**: `country-scope.ts`, `tenant.ts` y `permissions.ts` se importan por ruta directa (ver `bar-challenge/routes.ts:14-15`). Seguir eso: importar `require-module`/`module-flags` por ruta directa, no agregarlos al barrel.

**Sin análogo — la técnica `onRoute`-append.** No hay un solo `addHook("onRoute", …)` en `src/` fuera del seam de `app.ts:108`. `moduleScope()` es greenfield: usar el pseudocódigo verificado del RESEARCH §Pattern 1, no un archivo del repo.

---

### `src/modules/shared/hooks.ts` (utility / tipos, event-driven — NUEVO)

**Analog parcial:** no existe registry ni event bus en el repo. Dos análogos de forma:

**1. Mapa de constantes + tipo derivado** (`src/modules/streaks/types.ts:3-39`) — la forma que deben tener `FilterMap`/`EventMap`:

```ts
export const STREAK_SETTINGS_KEYS = {
  MILESTONE_7_AURA: "streak.milestone_7_aura",
  // …
} as const;

export interface StreakMilestoneConfig {
  milestone7Aura: number;
  // …
}

/** Maps a milestone day count to its config key for AURA lookup */
export const MILESTONE_TO_CONFIG_KEY: Record<number, keyof StreakMilestoneConfig> = { … };
```

**2. Error tipado que PROPAGA a través del filter** (`src/modules/aura/service.ts:9-19`) — el filter `pricing.adjust` debe dejar pasar exactamente este error (hoy `subscriptions/service.ts:1825` lo deja salir sin `catch`, y el alta aborta):

```ts
/**
 * Error thrown when a spend operation exceeds the user's available AURA balance.
 */
export class InsufficientBalanceError extends Error {
  constructor(userId: number, requested: number, available: number) {
    super(
      `Insufficient AURA balance for user ${userId}: requested ${requested}, available ${available}`,
    );
    this.name = "InsufficientBalanceError";
  }
}
```

**3. Aislamiento del event (best-effort)** — copiar literal el `try/catch + log.warn` de `streaks/service.ts:296-302` **moviéndolo adentro de `emit()`** (ver excerpt en la sección de `streaks/service.ts` más abajo). Misma semántica, mismo mensaje.

---

### `src/modules-boot.ts` (composition root — NUEVO)

**Analog:** `src/app.ts:189-356` (los ~30 `await app.register(...)` con prefijo) + el docblock de `BuildAppOptions` (`app.ts:67-98`) como plantilla de documentación de un seam.

**Patrón de registro a mover** (`app.ts:199-211`, los 5 de marketing; `app.ts:336` onboarding; `app.ts:339` gamification) — comentario de una línea + `register` con prefijo:

```ts
// Franchise routes (public franchise application form)
await app.register(franchiseRoutes, { prefix: "/api/franchise" });

// Gladius routes (product catalog + inquiry form)
await app.register(gladiusRoutes, { prefix: "/api/gladius" });

// Blog routes (public blog + admin CRUD + image upload)
await app.register(blogRoutes, { prefix: "/api/blog" });

// Academy routes (enrollment inquiry form)
await app.register(academyRoutes, { prefix: "/api/academy" });

// App landing routes (waitlist + Labs inquiry forms)
await app.register(appLandingRoutes, { prefix: "/api/app" });
```

```ts
// Onboarding routes (member quiz completion + profile retrieval + analytics)
await app.register(onboardingRoutes, { prefix: "/api/onboarding" });

// Phase 115 bar challenge result endpoint (single-attempt, member-only).
await app.register(barChallengeRoutes, { prefix: "/api/bar-challenge" });
```

**Docblock pattern para un seam de arquitectura** (`app.ts:67-98`) — el repo documenta los seams con secciones en mayúsculas (`ES TEST-ONLY`, `POR QUÉ VIVE ACÁ Y NO EN…`, `QUIÉN LO CONSUME`). `modules-boot.ts` es exactamente ese tipo de archivo (el ÚNICO core→módulo) y debe llevar un docblock con esa forma. Extracto de la convención:

```ts
/**
 * Opciones de `buildApp`. Hoy tiene un solo campo y es a propósito: la
 * superficie mínima es parte de la decisión (fase 171, ISO-01).
 *
 * ES TEST-ONLY
 * ------------
 * …
 * POR QUÉ VIVE ACÁ Y NO EN `createTestApp()`
 * ------------------------------------------
 * …
 * QUIÉN LO CONSUME
 * ----------------
 * El gate fail-closed `test/tenancy/iso-01-manifiesto.test.ts` …
 */
```

**Punto de inserción en `app.ts`:** `registerModules(app, hooks)` va después de los registros core y **antes** del `/health` (`app.ts:358-361`) y del hook Sentry (`app.ts:364-371`).

---

### `src/modules/subscriptions/pricing.ts` (service extraído, transform — NUEVO)

**Analog / fuente:** `src/modules/subscriptions/service.ts:1729-1861` (cadena de `assignPlan`). Es el sitio más completo de los 6 y el que define el orden canónico.

**Estado a preservar byte-idéntico** (`service.ts:1729-1741`) — las 9 variables que salen de la cadena:

```ts
// Determine price
let pricePaid: number;
let priceTypeApplied = await this.resolvePriceType(input.priceTypeApplied);
let auraDiscount: number | null = null;
let auraDiscountPercent: number | null = null;
let referralDiscountPercent: number | null = null;
let referralDiscountAmount: number | null = null;
let boardingPassUsed = false;
let priceOverrideAmount: number | null = null;
let priceOverrideReason: string | null = null;
```

**Rama 1 — prorrateo, máxima prioridad + exclusiones (CORE, se queda)** (`service.ts:1750-1771`). ⚠️ Los dos `BadRequestError` son exclusión mutua explícita con boarding pass y AURA: la función core los evalúa **antes** de llamar al filter:

```ts
if (input.prorateToMonthEnd) {
  if (input.boardingPass) {
    throw new BadRequestError(
      "No se puede combinar el prorrateo hasta fin de mes con el boarding pass",
    );
  }
  if (input.auraSpend && input.auraSpend > 0) {
    throw new BadRequestError(
      "No se puede combinar el prorrateo hasta fin de mes con un descuento AURA",
    );
  }
  const basePrice = this.getBasePrice(plan, priceTypeApplied);
  pricePaid =
    input.priceOverrideAmount !== undefined
      ? input.priceOverrideAmount
      : computeProratedPrice(basePrice, input.startDate);
  if (pricePaid > basePrice) {
    throw new BadRequestError(
      "El precio prorrateado no puede superar el precio del mes completo",
    );
  }
}
```

**Rama 2 — override (CORE, se queda)** (`service.ts:1773-1785`):

```ts
    else if (
      input.priceOverrideAmount !== undefined &&
      input.priceOverrideAmount >= 0
    ) {
      if (!input.priceOverrideReason) {
        throw new BadRequestError("Se requiere una razon para el precio personalizado");
      }
      pricePaid = input.priceOverrideAmount;
      priceOverrideAmount = input.priceOverrideAmount;
      priceOverrideReason = input.priceOverrideReason;
    }
```

**Rama 3 — boarding pass (MÓDULO, cruza al filter)** (`service.ts:1792-1807`). Ojo: escribe en `users.boardingPassUsed` con `tenantWhere` y lanza `ConflictError`; el handler del módulo hereda las tres cosas:

```ts
    else if (input.boardingPass) {
      if (member.boardingPassUsed) {
        throw new ConflictError("El boarding pass ya fue utilizado");
      }
      priceTypeApplied = await this.resolvePriceType("zero");
      pricePaid = this.getBasePrice(plan, priceTypeApplied);
      boardingPassUsed = true;

      // Mark boarding pass as used on the user
      await this.db
        .update(schema.users)
        .set({ boardingPassUsed: true })
        .where(and(tenantWhere(schema.users, ctx), eq(schema.users.id, userId)));
    }
```

**Rama 4 — base + AURA (MÓDULO, cruza al filter)** (`service.ts:1809-1837`). El `Math.floor(basePrice * (tier.percent / 100))` es el punto de off-by-one del refactor:

```ts
    else {
      const basePrice = this.getBasePrice(plan, priceTypeApplied);
      pricePaid = basePrice;

      // Apply AURA discount if requested
      if (input.auraSpend && input.auraSpend > 0) {
        const tier = AURA_DISCOUNT_TIERS.find((t) => t.spend === input.auraSpend);
        if (!tier) {
          throw new BadRequestError(
            `Monto de AURA invalido. Opciones: ${AURA_DISCOUNT_TIERS.map((t) => t.spend).join(", ")}`,
          );
        }

        // Spend AURA (throws InsufficientBalanceError if not enough)
        await this.auraService.spend({
          userId,
          amount: tier.spend,
          description: `Descuento de suscripcion: ${tier.percent}% off`,
          referenceType: "subscription",
        });

        auraDiscount = tier.spend;
        auraDiscountPercent = tier.percent;
        const discountAmount = Math.floor(basePrice * (tier.percent / 100));
        pricePaid = basePrice - discountAmount;
      }
    }
```

**Post-cadena — referidos (CORE, FUERA del if/else)** (`service.ts:1839-1861`). El comentario documenta el orden canónico y debe viajar con el código:

```ts
// ── Referidos (fase 157, D-20/D-21) ──
// Orden canónico: (1) el precio ya está resuelto (incl. auraSpend); (2) si
// el cargo cobra, flippear el vínculo pending del payer a qualified ANTES
// del cómputo …
// D-09: los pases especiales quedan FUERA del sistema de referidos …
if (plan.planCategory !== "especial" && !input.prorateToMonthEnd) {
  await this.qualifyReferralOnCharge(ctx, userId, pricePaid);
  const referral = await this.computePriceWithReferralDiscount(
    ctx,
    userId,
    pricePaid,
  );
  pricePaid = referral.pricePaid;
  referralDiscountPercent = referral.percent > 0 ? referral.percent : null;
  referralDiscountAmount = referral.amount > 0 ? referral.amount : null;
}
```

**Preview — la variante solo-lectura** (`service.ts:5437-5490`): mismo `Math.floor` para AURA (`5456`), `getBalance` en vez de `spend` (`5439`), y referidos con `simulatePendingQualification: true` (`5479-5484`). El response (`5492-5500+`) expone `auraBalance`, `boardingPassEligible`, `availableTiers`, `auraToSpend` en el tipo **core** — Pitfall 5: el `moduleOutput` se mergea con las MISMAS keys y con valores neutros (`0`/`[]`/`false`) cuando el módulo está OFF.

---

### `src/modules/subscriptions/service.ts` (MODIFICADO — service facade, CRUD + transform)

**Analog:** sí mismo.

**Constructor actual** (`service.ts:315-324`) — 5 params, `auraService` posicional #3:

```ts
export class SubscriptionService {
  private bookingService?: BookingServiceType;

  constructor(
    private db: MySql2Database<typeof schema>,
    private log: FastifyBaseLogger,
    private auraService: AuraService,
    private transactionService?: TransactionService,
    private enrollmentService?: EnrollmentService,
  ) {}
```

**🔴 Dimensionamiento que el planner DEBE conocer (no está en RESEARCH ni en CONTEXT): `new SubscriptionService(` aparece en 17 sitios de `src/`** — `auth/routes.ts:328`, `finance/coach-load-routes.ts:248`, `finance/routes.ts:107`, `scheduling/routes.ts:91` y `:826`, `wellhub/occupancy-listener.ts:30`, `subscriptions/member-routes.ts:45`, `subscriptions/routes.ts:77`, `members/routes.ts:712`/`:1033`/`:1314`, `jobs/mark-no-shows.ts:52`, `wellhub/routes.ts:38`, `attendance/routes.ts:38`/`:193`, `jobs/auto-resume-pauses.ts:98`, `jobs/wellhub-sync.ts:92`. Cambiar la firma del constructor para inyectar el `HookRegistry` = **17 ediciones**. Alternativas para el plan: (a) registry como singleton de módulo importado por `pricing.ts` (0 call sites tocados); (b) 6º parámetro opcional al final, como ya se hizo con `transactionService`/`enrollmentService` (que tienen el precedente del guard `requireEnrollmentService`, `service.ts:333-340`). Que el plan elija y lo escriba.

**Forma canónica de un call site** (`subscriptions/routes.ts:77-91`) — si la firma cambia, los 17 se editan así:

```ts
const subscriptionService = new SubscriptionService(
  fastify.db,
  fastify.log,
  auraService,
  transactionService,
  enrollmentService,
);
const notificationService = new NotificationService(fastify.db, fastify.log);
const bookingService = new BookingService(
  fastify.db,
  fastify.log,
  subscriptionService,
  notificationService,
);
subscriptionService.setBookingService(bookingService);
```

**Precedente de DI opcional con guard ruidoso** (`service.ts:333-340`) — si el registry entra como param opcional, copiar este patrón para que una wiring faltante explote en vez de ser un no-op silencioso:

```ts
  /**
   * Phase 112-02: every program_enrollments mutation now flows through
   * EnrollmentService. The DI param stays optional during the rollout …,
   * but every call MUST go through this guard so a missing wiring surfaces
   * as a loud runtime error rather than a silent no-op (T-112-02-02).
   */
  private requireEnrollmentService(): EnrollmentService {
```

---

### `src/modules/streaks/service.ts` (MODIFICADO — service, event-driven)

**Analog:** sí mismo, `service.ts:273-303`.

**Código exacto a reemplazar por el `emit`:**

```ts
// Check for milestone AURA bonus
let milestoneReached: number | null = null;
if ((STREAK_MILESTONES as readonly number[]).includes(currentStreak)) {
  milestoneReached = currentStreak;
  try {
    const config = await this.getStreakMilestoneConfig();
    const configKey = MILESTONE_TO_CONFIG_KEY[currentStreak];
    const bonusAmount = configKey ? config[configKey] : 0;

    if (bonusAmount > 0) {
      await this.auraService.award({
        userId,
        sourceType: "streak_bonus",
        referenceType: "streak_milestone",
        referenceId: currentStreak,
        amount: bonusAmount,
        description: `Racha de ${currentStreak} dias`,
      });
      this.log.info(
        { userId, milestone: currentStreak, bonusAmount },
        "Streak milestone AURA bonus awarded",
      );
    }
  } catch (auraErr: unknown) {
    this.log.warn(
      { err: auraErr, userId, milestone: currentStreak },
      "Failed to award streak milestone AURA bonus",
    );
    // Graceful degradation: streak update succeeds even if AURA fails
  }
}
```

**El `try/catch (err: unknown) + log.warn + comentario de graceful degradation` (líneas 296-302) es LITERALMENTE lo que `HookRegistry.emit()` debe hacer adentro** — misma semántica, mismo `catch (err: unknown)` (regla de CLAUDE.md).

**Constructor a adelgazar** (`service.ts:39-44`) — `auraService` sale:

```ts
export class StreakService {
  constructor(
    private readonly db: DbInstance,
    private readonly auraService: AuraService,
    private readonly log: FastifyBaseLogger,
  ) {}
```

**Un único call site** (`src/modules/sessions/routes.ts:380`) — confirmado con grep:

```ts
const auraService = new AuraService(fastify.db);
const streakService = new StreakService(fastify.db, auraService, fastify.log);
```

`getStreakMilestoneConfig()` (`service.ts:312-320+`) viaja con el handler al módulo; sus constantes viven en `src/modules/streaks/types.ts:3-39` (`STREAK_SETTINGS_KEYS`, `STREAK_DEFAULTS`, `MILESTONE_TO_CONFIG_KEY`) y hay que decidir si se mueven o se importan desde el módulo.

---

### `src/modules/aura/module.ts` (ModuleDef de `templo-gamification` — NUEVO)

**Sin análogo directo.** No existe ningún `ModuleDef` ni provider en el repo. Análogos parciales:

**Barrel del módulo aura** (`src/modules/aura/index.ts`, completo) — la superficie pública desde la que el composition root importa:

```ts
// Module: aura
export { AuraService, InsufficientBalanceError } from "./service";
export type {
  AwardInput,
  SpendInput,
  AuraBalance,
  AuraSourceType,
} from "./types";
```

**Servicio que el handler va a usar** (`src/modules/aura/service.ts:29-33`) — `log` es opcional (`Logger` de pino, no `FastifyBaseLogger` — divergencia real del resto del repo):

```ts
export class AuraService {
  constructor(
    private readonly db: DbInstance,
    private readonly log?: Logger,
  ) {}
```

**Nota de alcance verificada:** `src/modules/aura/` contiene solo `index.ts`, `service.ts`, `types.ts` — **no hay `routes.ts`**. La única ruta de `templo-gamification` es `POST /api/bar-challenge/result`.

---

### `src/app.ts` (MODIFICADO — bootstrap)

**Analog:** sí mismo.

**Los 7 `fp` de training que quedan in-place (D-04)** — `app.ts:168-187`:

```ts
// SPOM plugin (SPOM data access endpoints)
await app.register(spomPlugin);
// Sessions plugin (session generation and retrieval)
await app.register(sessionsPlugin);
// Progression plugin (member stats and evaluation requests)
await app.register(progressionPlugin);
// Tree-progress plugin (member skill-tree % advancement — Phase 127)
await app.register(treeProgressPlugin);
// Tree-editor plugin (admin/coach skill-tree editor — Phase 128)
await app.register(treeEditorPlugin);
// Exercise-adjustments plugin (in-session difficulty adjustment — Phase 131)
await app.register(exerciseAdjustmentsPlugin);
// Exercise-adjustments coach plugin (…Phase 131 Plan 02)
await app.register(exerciseAdjustmentsCoachPlugin);
```

**Forma del `fp` (Pitfall 3 — NO tocar el cuerpo)** — `src/plugins/spom.ts`, archivo completo, los 7 son idénticos salvo nombre:

```ts
import fp from "fastify-plugin";
import { spomRoutes } from "../modules/spom";

export default fp(
  async (fastify) => {
    fastify.register(spomRoutes);
  },
  {
    name: "spom-plugin",
    dependencies: ["database", "auth"],
  },
);
```

`fp` **rompe la encapsulación a propósito**: el `addHook` NUNCA va acá adentro. `moduleScope()` envuelve el `await app.register(spomPlugin)` desde `app.ts`.

**Los 5 registros directos de training que D-04 no menciona (Hallazgo #3 del RESEARCH: son 12, no 7)** — `app.ts:193` `adminRoutes` (62 rutas), `:196` `goalPlanRoutes`, `:342` `checkInRoutes`, `:344` `checkInAdminRoutes`, `:349` `programRoutes`.

**⚠️ Trampa de prefijo compartido** (`app.ts:344-346`): `checkInAdminRoutes` (templo) y `checkInRosterRoutes` (tenant-scoped) comparten `/api/admin/check-ins`. Son **dos registros distintos** — envolver solo el primero. Si se envuelve el prefijo, el segundo test del gate (no-derrame) se pone rojo:

```ts
// Vista admin del Registro del día (tab de Feedback, ADMIN_ROLES).
await app.register(checkInAdminRoutes, { prefix: "/api/admin/check-ins" });
// Roster de registros del día para Horarios (coach + admin/dueño).
await app.register(checkInRosterRoutes, { prefix: "/api/admin/check-ins" });
```

**El seam `onRoute` NO se toca** (`app.ts:105-108`) — `BuildAppOptions.onRoute` ya recibe el `RouteOptions` completo, así que el gate lee `route.onRequest` sin cambiar `src/app.ts`:

```ts
// Seam del inventario de rutas (fase 171, ISO-01). Va PRIMERO: un hook
// `onRoute` solo ve lo que se registra después de colgarse. …
if (opts.onRoute) app.addHook("onRoute", opts.onRoute);
```

---

### `src/modules/auth/routes.ts` — `GET /me` (MODIFICADO — route handler, D-08)

**Analog:** sí mismo, `auth/routes.ts:759-799`, y su gemelo `bar-challenge/routes.ts:47-59`.

**Patrón de resolución de ctx in-handler** (`auth/routes.ts:759-774`) — la ruta ya tiene `ctx.tenantId` listo, agregar `enabledModules` es aditivo:

```ts
  // GET /me
  fastify.get(
    "/me",
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const { userId } = request.user;
      …
      // T-173-15: `users` es tabla strict (D-01). El ctx sale de la propia
      // fila del socio autenticado (attachCountryScope + assertTenant), mismo
      // patrón que `bar-challenge/routes.ts` (T-173-09-01) …
      await attachCountryScope(request, fastify.db);
      const ctx = assertTenant(request.scope, "auth.me");
```

**El mismo patrón en el módulo gamification** (`bar-challenge/routes.ts:14-15, 32-36, 58-59`) — imports por ruta directa y `addHook("onRequest")` de plugin para `authenticate`:

```ts
import { attachCountryScope } from "../shared/country-scope";
import { assertTenant } from "../shared/tenant";

export const barChallengeRoutes: FastifyPluginAsync = async (fastify) => {
  // All routes require an authenticated member token (T-115-11).
  fastify.addHook("onRequest", async (request, reply) => {
    await fastify.authenticate(request, reply);
  });
  …
      await attachCountryScope(request, fastify.db);
      const ctx = assertTenant(request.scope, "bar-challenge.submit");
```

`GET /api/auth/me` está clasificada `tenant-scoped` en el manifiesto — **no se auto-gatea**, correcto.

---

### `src/db/migrations/0207_seed_module_flags.sql` (NUEVO — migration, seed idempotente)

**Analog:** `src/db/migrations/0168_seed_pricing_zero_price.sql` — archivo completo, 13 líneas, copiarlo literal cambiando tabla y keys:

```sql
-- 0168_seed_pricing_zero_price.sql
-- Phase 156 (PLAN-02 / D-03): seed the "Zero" price rule ON for the El Templo
-- installation, so current prod behavior (el precio Zero se ofrece al cobrar)
-- is unchanged. Reuses system_settings (NO new table). Idempotent: skip if the
-- key already exists so a re-run (or a prior PUT-set value) is never clobbered.
-- A fresh white-label install without this seed defaults OFF (no Zero price).
-- NOTE: no semicolons inside these comment lines (the custom runner splits on the
-- semicolon BEFORE stripping the double-dash comments).
INSERT INTO `system_settings` (`setting_key`, `setting_value`)
SELECT 'pricing.zero_price_enabled', 'on'
WHERE NOT EXISTS (
  SELECT 1 FROM `system_settings` WHERE `setting_key` = 'pricing.zero_price_enabled'
);
```

Cuatro bloques, uno por módulo, contra `tenant_settings` con `tenant_id = 1` explícito.

**Esquema destino** (`src/db/schema/tenants.ts:71-85`) — la unique `uq_tenant_setting` es lo que hace seguro el `WHERE NOT EXISTS`:

```ts
// Config por-tenant: mismo KV que `system_settings`, scoped. Hogar natural
// también para feature-flags por tenant (mecanismo de módulos, doc 04).
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

**Numeración:** máximo real en `2a4f5c92` = `0206_tv_show_alternative.sql` (verificado). El plan debe re-verificar con `ls src/db/migrations/*.sql | sort | tail -3` **en el momento de escribir el archivo** — una colisión de prefijo NO falla ruidosamente (el runner ordena lexicográficamente por nombre completo).

---

### `test/tenancy/iso-01-manifiesto.test.ts` (MODIFICADO — gate estructural)

**Analog:** sí mismo.

**El `beforeAll` a extender** (`iso-01:183-208`) — hay que **guardar la referencia al `RouteOptions`** además de serializar, y leer `route.onRequest` después de `createTestApp()` (que hace `ready()`), porque el hook de la raíz corre antes que el del scope hijo:

```ts
beforeAll(async () => {
  const observadas: string[] = [];
  const getsSinHeadSintetico: string[] = [];
  app = await createTestApp({
    onRoute: (route) => {
      for (const clave of clavesDeEvento(route.method, route.url)) {
        observadas.push(clave);
      }
      // WR-03: un GET registrado con `exposeHeadRoute: false` NO genera HEAD
      // sintético …
      const metodos =
        typeof route.method === "string" ? [route.method] : route.method;
      if (
        route.exposeHeadRoute === false &&
        metodos.some((m) => m.trim().toUpperCase() === "GET")
      ) {
        getsSinHeadSintetico.push(route.url);
      }
    },
  });
  particion = particionarObservadas(observadas, getsSinHeadSintetico);
  discrepancias = compararManifiesto(particion.rutas);
});

afterAll(async () => {
  if (app) await app.close();
});
```

**Estilo obligatorio del mensaje de assertion** (`iso-01:322-353`) — la convención dura de esta familia: `QUÉ HACER:` + `POR QUÉ IMPORTA:`, todo en el segundo argumento de `expect`. Los dos tests nuevos (cobertura y no-derrame) deben seguirla:

```ts
expect(
  sinModulo,
  `Entradas "templo-module" del manifiesto REAL sin módulo válido (D-07): ` +
    `${sinModulo.join(", ")}. ` +
    `QUÉ HACER: declarale a cada una su \`modulo\` con uno de los cuatro ` +
    `valores de MODULOS_TEMPLO (un typo en el nombre del módulo también cae ` +
    `acá). ` +
    `POR QUÉ IMPORTA: la fase 176 va a LEER esa etiqueta para exigir ` +
    `requireModule en la ruta; una entrada sin módulo es una ruta que queda ` +
    `fuera del enforcement sin que nadie lo note.`,
).toEqual([]);
```

**El archivo ya anticipa esta fase por escrito** en `iso-01:234` y `iso-01:350-352` — el docblock de cabecera (`iso-01:1-99`) enumera "LO QUE SE AFIRMA" en 5 puntos; agregar el 6º y el 7º al docblock es parte del cambio, no opcional.

**Invariante:** `ENTRADAS_BASELINE = 370` (`iso-01:171`). La fase **no debe moverlo** (no agrega rutas). Los headers de `test/tenant-manifest.ts:178-180` dicen 374/225/8 y están STALE — el propio archivo avisa que manda el gate (`tenant-manifest.ts:182-186`).

---

### `test/tenant-manifest.ts` (MODIFICADO — fixture de datos)

**Analog:** sí mismo, `tenant-manifest.ts:134-172`.

Cambio mínimo: `MODULOS_TEMPLO` (línea 149) deja de ser una `const` local y pasa a importarse de `src/modules/shared/modules.ts`. ⚠️ Eso **rompe una propiedad declarada del archivo** (`tenant-manifest.ts:126-132`: _"es TypeScript puro sin un solo import, lo que permite typechequearlo suelto con `tsc`"_). El plan debe actualizar ese párrafo del docblock, no dejarlo mintiendo. Precedente de que `test/` sí importa de `src/`: `test/helpers.ts:59` importa `../src/modules/shared/tenant`.

```ts
export interface EntradaManifiesto {
  categoria: Categoria;
  motivo?: string;
  /**
   * D-07: OBLIGATORIO cuando `categoria === "templo-module"`. Es la etiqueta
   * que la fase 176 va a leer para exigir `requireModule` en la ruta.
   */
  modulo?: ModuloTemplo;
}
```

---

### `test/tenancy/mod-01-guard.test.ts` · `mod-02-hooks.test.ts` · `mod-02-pricing-module-off.test.ts` (NUEVOS — integración)

**Analog:** `test/tenancy/iso-03-referrals.test.ts` (298 líneas, el más chico y reciente de la familia).

**Ciclo de vida + fixture del segundo gimnasio** (`iso-03-referrals:50-94`) — copiar el orden exacto (`cleanAllTestData` **antes** de `seedSecondTenant`, `limpiarSegundoGimnasio` en `afterAll`):

```ts
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { createTestApp, cleanAllTestData, getAuthToken } from "../helpers";
import {
  seedSecondTenant,
  limpiarSegundoGimnasio,
  TENANT_DOS,
  TENANT_TEMPLO,
  type SegundoGimnasio,
} from "../fixtures/second-tenant";

let app: FastifyInstance;
let gym2: SegundoGimnasio;
let templeAdminToken: string;

beforeAll(async () => {
  app = await createTestApp();
  // admin@test.com es 'owner' (test/setup.ts) — cubre ANALYTICS_OPERATIONAL_ROLES.
  templeAdminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
});

beforeEach(async () => {
  await cleanAllTestData(app);
  gym2 = await seedSecondTenant(app);
});

afterAll(async () => {
  await cleanAllTestData(app);
  await limpiarSegundoGimnasio(app);
  await app.close();
});
```

**Helpers de request** (`iso-03-referrals:98-112`) — `app.inject` con bearer, no supertest:

```ts
function getComo(url: string, token: string) {
  return app.inject({
    method: "GET",
    url,
    headers: { authorization: `Bearer ${token}` },
  });
}

function postComo(url: string, token: string) {
  return app.inject({
    method: "POST",
    url,
    headers: { authorization: `Bearer ${token}` },
  });
}
```

**Superficie del fixture disponible** (`test/fixtures/second-tenant.ts:112-166`): `TENANT_DOS = 90671`, `TENANT_TEMPLO = 1`, e interface `SegundoGimnasio { tenantId, branchId, activityId, adminId, adminToken, coachId, coachToken, socios: [.., ..], planId, scheduleId }`. **Lo que NO siembra** (`:64-80`): `aura_config` (unique global, deuda del módulo Aura) ni `cash_registers`. Relevante para `mod-02-pricing-module-off.test.ts`: la siembra de AURA hay que hacerla a mano.

**Docblock obligatorio** — la familia `tenancy/` documenta cada archivo con secciones en mayúsculas y `COMO CORRERLO` (`iso-03-referrals:1-49`):

```
 * COMO CORRERLO
 * -------------
 *   pnpm exec vitest run --no-file-parallelism test/tenancy/iso-03-referrals.test.ts
```

**Para `mod-02-pricing-module-off.test.ts` específicamente**, el análogo de setup es `test/subscriptions/pricing-golden.test.ts:51-70` (seed de `aura_config` + `system_settings` con SQL crudo, helpers de `./_helpers`):

```ts
describe("Subscriptions — Pricing golden (174-02, D-06, diff cero)", () => {
  let app: FastifyInstance;
  let adminToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    // Habilita el descuento de referidos (10% por vínculo, cap 40%) …
    await app.db.execute(
      sql`INSERT INTO aura_config (aura_config_source_type, default_amount) …`,
    );
  });
```

---

### `test/subscriptions/pricing-golden.test.ts` (MODIFICADO — golden, huecos ES/EUR + 4 tiers)

**Analog:** sí mismo. Imports y helpers (`pricing-golden:34-49`):

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { sql } from "drizzle-orm";
import { createTestApp, getAuthToken, cleanAllTestData } from "../helpers";
import * as schema from "../../src/db/schema";
import { PRICING_SETTINGS_KEYS } from "../../src/modules/settings/keys";
import {
  SUBSCRIPTIONS_URL,
  createPlan,
  createMember,
  assignPlan,
  seedAuraBalance,
  todayStr,
  dateOffsetStr,
} from "./_helpers";
import { TENANT_TEMPLO } from "../fixtures/second-tenant";
```

**Contrato del archivo, que hay que respetar al agregar casos** (`pricing-golden:8-13`):

> _"se corre GREEN contra el código PRE-migración … y se vuelve a correr, SIN TOCAR NINGÚN LITERAL, contra el código migrado. Criterio de aceptación: diff CERO. Todos los números `toBe(N)` son la cifra REAL que produce el código de HOY — no una re-derivación de la fórmula."_

Los casos nuevos (ES/EUR, los 4 tiers en `changePlanAfterCurrent`) se agregan **antes** del refactor, con literales obtenidos corriendo el test contra el código actual. Nombres de `it()` en el estilo del archivo: `"base — priceType regular, sin descuentos"`, `"boardingPass — precio Zero, marca el pase usado"`, `"combo triple — boardingPass + auraSpend(ignorado) + referral"` (`:113`, `:145`, `:213`).

---

## Shared Patterns

### Logging (aplica a: guard, registry, flags, todos los handlers)

**Source:** `src/modules/shared/country-scope.ts:176-189` y `src/modules/streaks/service.ts:291-300`
**Regla CLAUDE.md:** nunca `console.log`; `request.log` en hooks/handlers, `this.log` en services.

```ts
request.log.error(
  { userId, role },
  "attachScope: user has no resolvable tenant (data corruption); scope.tenantId=null (default-deny)",
);
```

Objeto estructurado primero, mensaje después. Nunca interpolar el contexto en el string.

### Error handling (aplica a: guard, registry, pricing extraído)

**Source:** `src/modules/shared/errors.ts` vía barrel `src/modules/shared/index.ts:2-8`

```ts
export {
  AppError,
  NotFoundError,
  ValidationError,
  BadRequestError,
  ConflictError,
} from "./errors";
```

`catch (err: unknown)` obligatorio (regla CLAUDE.md), ejemplificado en `streaks/service.ts:296` (`catch (auraErr: unknown)`). Códigos de error como **constantes exportadas** (`country-scope.ts:21` `TENANT_SUSPENDED`, `tenant.ts:94` `TENANT_UNRESOLVED`).

### Tenancy (aplica a: flags, guard, pricing, todos los tests)

**Source:** `src/modules/shared/tenant.ts:104-205`

```ts
export interface TenantContext {
  tenantId: TenantId;
}

export function tenantWhere<T extends { tenantId: AnyMySqlColumn }>(
  table: T,
  scope: { tenantId: TenantId },
) {
  return eq(table.tenantId, scope.tenantId);
}

export function tenantValues<V extends Record<string, unknown>>(
  scope: { tenantId: TenantId },
  values: V,
): V & { tenantId: TenantId } {
  return { ...values, tenantId: scope.tenantId };
}

export function assertTenant(
  scope: { tenantId: number | null },
  where: string,
): TenantContext {
  const tenantId = scope.tenantId;
  if (typeof tenantId !== "number") {
    throw new AppError(
      `No se pudo resolver el gimnasio (${where})`,
      403,
      TENANT_UNRESOLVED,
    );
  }
  return { tenantId };
}
```

**Prohibido explícitamente** (`tenant.ts:180-184`): resolver un `tenantId` nulo con non-null assertion o con un default numérico. ⚠️ El `DEFAULT_PUBLIC_TENANT_ID = 1` del guard (D-06) es una **excepción consciente y acotada a la superficie pública de marketing** — el plan debe documentarla al lado de esta regla, no dejarla parecer un descuido.

### Imports en `shared/` (aplica a: los 4 archivos nuevos de `shared/`)

**Source:** `src/modules/shared/index.ts` (barrel) vs. `src/modules/bar-challenge/routes.ts:14-15` (ruta directa)

El barrel de `shared` NO exporta `country-scope`, `tenant` ni `permissions` — se importan por ruta directa. Los archivos nuevos siguen eso: `import { requireModule } from "../shared/module-registry";`, sin tocar `shared/index.ts`.

### Docblock de archivo (aplica a: TODOS los archivos nuevos)

**Source:** `src/app.ts:67-98`, `test/tenancy/iso-01-manifiesto.test.ts:1-99`, `test/fixtures/second-tenant.ts:1-80`

Convención dura de las fases 166-175: docblock largo con secciones en mayúsculas (`POR QUÉ EXISTE ESTE ARCHIVO`, `LO QUE SE AFIRMA`, `QUÉ NO ES ESTE ARCHIVO`, `QUÉ HACER CUANDO SE CAIGA`, `COMO CORRERLO`). Un archivo nuevo de esta fase sin ese docblock desentona con toda la infra que cosecha.

---

## No Analog Found

El planner debe usar los patrones del RESEARCH (§Pattern 1, §Pattern 3, §Code Examples) para estos, no buscar en el repo:

| File                                     | Role               | Data Flow          | Reason                                                                                                                                                |
| ---------------------------------------- | ------------------ | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/modules/aura/module.ts` (ModuleDef) | provider           | event-driven       | No existe un solo `ModuleDef`, provider ni registry en el repo. Greenfield puro (RESEARCH: _"cero `requireModule`/`HookRegistry`/`modules-boot`"_).   |
| Cache TTL dentro de `module-flags.ts`    | utility            | in-memory state    | **No hay un solo cache con TTL en `src/`** (verificado: `grep -rn "new Map(" src/` no muestra ninguno con expiración). Sería el primero.              |
| `moduleScope()` / hook `onRoute`-append  | middleware         | request-response   | El único `addHook("onRoute", …)` de `src/` es el seam test-only de `app.ts:108`. La técnica está verificada empíricamente en el RESEARCH, no copiada. |
| `HookRegistry.runFilter` / `.emit`       | service (registry) | pub-sub in-process | No hay bus, cola ni emitter en el repo. La semántica de `emit` sí tiene análogo exacto: `streaks/service.ts:296-302`.                                 |

---

## Metadata

**Analog search scope:** `/home/franco/projects/et-173/el-templo-api/src/{app.ts,plugins,modules/{shared,settings,streaks,aura,subscriptions,auth,bar-challenge,sessions},db/{schema,migrations}}` · `test/{helpers.ts,tenant-manifest.ts,tenancy,fixtures,subscriptions}`
**Files read (targeted):** 18 · **Greps de inventario:** 6 (`new SubscriptionService` → 17 sitios, `new AuraService` → 23, `new StreakService` → 1, migraciones → máx `0206`, `onRoute` en `src/` → solo `app.ts:108`)
**Pattern extraction date:** 2026-08-20
**Válido mientras el tren siga en `2a4f5c92`.** Si la 177 se mergea al tren, los números de línea de `subscriptions/service.ts` se mueven y hay que re-extraer la cadena de pricing.
