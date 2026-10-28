# Phase 179: Referidos de partners/marcas - Pattern Map

**Mapped:** 2026-08-22
**Files analyzed:** 38 (23 nuevos + 15 modificados)
**Analogs found:** 36 / 38

> **BASELINE — leer antes de usar cualquier número de línea.**
> Este checkout (`docs/planning-untracked-2026-08`) está **151 commits detrás de `origin/master`** (verificado: `git rev-list --count HEAD..origin/master` = 151). **Todos** los excerpts de este documento se leyeron con `git show origin/master:<archivo>` sobre el commit **`6ff65ae3`**, no del working tree. El planner y los ejecutores deben partir de `origin/master`.
> Los números de línea marcados con `~` son aproximados (±3); los demás son exactos al 2026-08-22.

---

## File Classification

### API — `el-templo-api`

| New/Modified File                                              | Role      | Data Flow        | Closest Analog                                                  | Match Quality |
| -------------------------------------------------------------- | --------- | ---------------- | --------------------------------------------------------------- | ------------- |
| `src/db/schema/referral-partners.ts` (NEW)                     | model     | CRUD             | `src/db/schema/promo-plans.ts`                                  | exact         |
| `src/db/schema/partner-referrals.ts` (NEW)                     | model     | event-driven     | `src/db/schema/referrals.ts`                                    | exact         |
| `src/db/schema/partner-commissions.ts` (NEW)                   | model     | append-only      | `src/db/schema/referral-credits.ts`                             | exact         |
| `src/db/schema/index.ts` (MOD)                                 | config    | barrel           | sí mismo (`export * from "./x"`)                                | exact         |
| `src/db/tenant-tables.ts` (MOD)                                | config    | gate             | entradas `referrals.*` / `referral_credits.*` del archivo       | exact         |
| `src/db/migrations/0209_referral_partners.sql` (NEW)           | migration | DDL              | `src/db/migrations/0202_session_week_regime.sql`                | exact         |
| `src/modules/referral-partners/service.ts` (NEW)               | service   | CRUD + evento    | `src/modules/referrals/service.ts`                              | exact         |
| `src/modules/referral-partners/code-resolver.ts` (NEW)         | utility   | transform (puro) | `referrals/service.ts:137-145` + bloque promo de auth           | role-match    |
| `src/modules/referral-partners/admin-routes.ts` (NEW)          | route     | request-response | `src/modules/improvement-proposals/routes.ts:32-107`            | exact         |
| `src/modules/referral-partners/schemas.ts` (NEW)               | config    | validación       | `src/modules/improvement-proposals/schemas.ts`                  | exact         |
| `src/modules/referral-partners/types.ts` (NEW)                 | types     | —                | `src/modules/referrals/types.ts`                                | exact         |
| `src/modules/referral-partners/index.ts` (NEW)                 | barrel    | —                | `src/modules/improvement-proposals/index.ts` (1 línea)          | exact         |
| `src/app.ts` (MOD)                                             | config    | registro         | `src/app.ts:253-260` (referrals) / `:296-303` (proposals)       | exact         |
| `src/modules/auth/routes.ts` (MOD)                             | route     | request-response | bloques 1/2/3 del propio `/register` (`:206`, `:296`, `:331`)   | exact         |
| `src/modules/subscriptions/service.ts` (MOD)                   | service   | transform+CRUD   | trío de referidos `:496` / `:535` / `:555` del mismo archivo    | exact         |
| `src/modules/finance/transaction-service.ts` (MOD)             | service   | event-driven     | back-edge de cancelación `_void` `:525-546`                     | exact         |
| `src/modules/scheduling/trials-service.ts` (MOD)               | service   | request-response | `getTrialEligibility:415` del mismo archivo                     | exact         |
| `src/modules/scheduling/routes.ts` (MOD)                       | route     | request-response | `POST /reserve-trial:892-921`                                   | exact         |
| `src/modules/members/routes.ts` (MOD)                          | route     | request-response | `POST /:userId/referrals:1731-1757`                             | exact         |
| `src/modules/settings/{keys,service,routes}.ts` (MOD)          | config    | key-value        | `SettingsService.getFlag/setFlag:36-59`                         | role-match    |
| `test/referral-partners/*.test.ts` (NEW ×~10)                  | test      | integración      | `test/referrals/admin-assign-referrer.test.ts`                  | exact         |
| `test/tenant-manifest.ts` (MOD)                                | test/gate | registro         | entradas `POST /api/admin/members/:userId/referrals:365-367`    | exact         |
| `test/tenancy/iso-01-manifiesto.test.ts` (MOD)                 | test/gate | conteo           | `ENTRADAS_BASELINE:171` + título del `it:278`                   | exact         |
| `test/db/tenant-tables.test.ts` (MOD)                          | test/gate | conteo           | `it("los conteos son 88...":97-106`                             | exact         |
| `test/helpers.ts` o `test/referral-partners/_helpers.ts` (NEW) | test      | fixtures         | `test/subscriptions/_helpers.ts` (`createPlan`, `createMember`) | role-match    |

### Admin — `el-templo-admin`

| New/Modified File                                       | Role       | Data Flow         | Closest Analog                                                    | Match Quality |
| ------------------------------------------------------- | ---------- | ----------------- | ----------------------------------------------------------------- | ------------- |
| `src/pages/PartnersPage.vue` (NEW)                      | page       | CRUD + reporte    | `src/pages/PlanesPage.vue` (tabs+tabla+diálogo)                   | exact         |
| `src/components/partners/PartnerFormDialog.vue` (NEW)   | component  | form/CRUD         | `src/components/PromoFormDialog.vue`                              | exact         |
| `src/components/partners/PartnerQrDialog.vue` (NEW)     | component  | file-I/O (blob)   | `tools/generate-branch-qrs.ts:123-128` + `PlanesPage.vue:734-746` | partial       |
| `src/components/partners/PartnerSettleDialog.vue` (NEW) | component  | confirm+mutación  | `PlanesPage.vue:748-770` (`$q.dialog` confirm)                    | role-match    |
| `src/composables/usePartnersApi.ts` (NEW)               | composable | request-response  | `src/composables/useImprovementProposalsApi.ts`                   | exact         |
| `src/components/MemberReferralsTab.vue` (MOD)           | component  | CRUD              | sí mismo (bloque retroactiva `:40-70` + `onAssign`)               | exact         |
| `src/router/routes.ts` (MOD)                            | config     | routing           | entradas `/planes` y `/programas` `:96-120`                       | exact         |
| `src/config/templo-config.ts` (MOD)                     | config     | RBAC + nav        | `REPORTES_ROLES:98` + `NavItem:128-140`                           | exact         |
| `src/components/AssignPlanDialog.vue` (MOD)             | component  | preview de precio | bloque `Descuento referido` `:452-458` + `:1521-1560`             | exact         |

### App — `el-templo-app`

| New/Modified File                           | Role       | Data Flow        | Closest Analog                                | Match Quality |
| ------------------------------------------- | ---------- | ---------------- | --------------------------------------------- | ------------- |
| `src/pages/RegisterPage.vue` (MOD)          | page       | form             | sí mismo (badges `:31-48`, inputs `:54-108`)  | exact         |
| `src/stores/useAuthStore.ts` (MOD)          | store      | request-response | `register():71-90` del mismo archivo          | exact         |
| `src/pages/ReservasPage.vue` (MOD)          | page       | estado derivado  | bloque trial `:57-108` + computeds `:893-902` | exact         |
| `src/composables/useSchedulingApi.ts` (MOD) | composable | request-response | `trial-eligibility:107` / `reserve-trial:120` | exact         |
| `package.json` + `version.txt` (MOD)        | config     | —                | convención del repo (feature = minor)         | n/a           |

---

## Pattern Assignments

### `src/db/schema/referral-partners.ts` (model, CRUD)

**Analog:** `el-templo-api/src/db/schema/promo-plans.ts` — es el ÚNICO precedente exacto de "código vanity dentro de una tabla gym-owned", ya resuelto por la fase 168 con unique compuesta `(tenant_id, code)`.

**Imports + columna de tenancy** (`promo-plans.ts:1-24`):

```ts
// Module: subscriptions (promo campaigns)
import {
  mysqlTable,
  int,
  varchar,
  boolean,
  timestamp,
  datetime,
  mysqlEnum,
  uniqueIndex,
} from "drizzle-orm/mysql-core";
import { tenantIdColumn } from "./tenant-column";

export const promoTypeEnum = mysqlEnum("promo_type", [
  "auto",
  "admin_assignable",
]);

export const promoPlans = mysqlTable(
  "promo_plans",
  {
    id: int("id").primaryKey().autoincrement(),
    // Fase 167 (COL-01): tenancy. Valor server-side, nunca de payload. Ver src/db/schema/tenant-column.ts
    tenantId: tenantIdColumn(),
```

**Unique compuesta tenant-primero** (`promo-plans.ts:~40-48`) — **copiar textual para `referral_partners.code`** (Pitfall 3 del RESEARCH):

```ts
  (table) => [
    // Fase 168 (CON-01): unicidad POR TENANT — dos gimnasios pueden tener el mismo
    // código promo sin pisarse. Sin índice secundario (D-06): promo_plans es un
    // catálogo chico. Índice byte-for-byte con la migración 0196.
    uniqueIndex("uq_promo_plans_tenant_promo_code").on(
      table.tenantId,
      table.promoCode,
    ),
  ],
);
```

⚠ **Regla de enums** (`referrals.ts:20-24`): el primer argumento de `mysqlEnum` es el **nombre físico de la columna**, no el nombre TS:

```ts
export const referralStatusEnum = mysqlEnum("status", [
  "pending",
  "qualified",
  "revoked",
]);
```

Aplicar a `benefit_type` (`discount_percent` | `free_pass`), `commission_type` y `status` de comisiones (`pending`|`settled`|`void`).

---

### `src/db/schema/partner-referrals.ts` (model, event-driven)

**Analog:** `el-templo-api/src/db/schema/referrals.ts` — espejo 1:1 del vínculo.

**Tabla completa a espejar** (`referrals.ts:39-69`):

```ts
export const referrals = mysqlTable("referrals", {
  id: int("id").primaryKey().autoincrement(),
  // Fase 167 (COL-01): tenancy. Valor server-side, nunca de payload. Ver src/db/schema/tenant-column.ts
  tenantId: tenantIdColumn(),
  // Quién refirió. Un referidor puede traer muchos referidos (sin UNIQUE).
  referrerId: int("referrer_id")
    .references(() => users.id)
    .notNull(),
  // Quién fue referido. UNIQUE (D-14/REF-04): cada miembro tiene a lo sumo un
  // referidor — el 2do reclamo falla en el constraint, no en app logic.
  referredId: int("referred_id")
    .references(() => users.id)
    .notNull()
    .unique(),
  // pending → qualified al primer pago (D-01/D-21). Default pending.
  status: referralStatusEnum.notNull().default("pending"),
  attributionChannel: referralAttributionChannelEnum.notNull(),
  // Timestamp del flip a qualified (D-20). NULL mientras pending.
  qualifiedAt: timestamp("qualified_at"),
  ...
  // Admin (users.id) que creó el vínculo asistido. NULL en self-service.
  // Self-ref conceptual a users → AnyMySqlColumn callback para evitar el error
  // de circular-init de TypeScript. ON DELETE SET NULL como createdBy en users.
  createdBy: int("created_by").references((): AnyMySqlColumn => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});
```

Mapeo para la fase: `referrerId` → `partnerId` (FK a `referral_partners`, **sin** unique), `referredId` → `referredId` **con `.unique()`** (D-12), + columnas propias `benefitStatus`, `benefitExpiresAt`, `appliedPercent`, `appliedAmount`, `appliedSubscriptionId`, `qualifiedAt`.

**Relations** (`referrals.ts:71-82`) — mismo bloque con `relationName` explícito cuando hay dos FKs a la misma tabla.

---

### `src/db/schema/partner-commissions.ts` (model, append-only)

**Analog:** `el-templo-api/src/db/schema/referral-credits.ts` — el patrón de idempotencia por cargo.

**Header + unique de idempotencia** (`referral-credits.ts:1-4` y `:16-42`):

```ts
// Module: referral_credits — registro auditable append-only del descuento por
// referido aplicado en un cobro (D-18). ... Una carga (subscriptionId) = a lo
// sumo una fila (idempotencia D-18).

export const referralCredits = mysqlTable(
  "referral_credits",
  {
    id: int("id").primaryKey().autoincrement(),
    // Fase 167 (COL-01): tenancy. Valor server-side, nunca de payload. Ver src/db/schema/tenant-column.ts
    tenantId: tenantIdColumn(),
    userId: int("user_id")
      .references(() => users.id)
      .notNull(),
    // El cargo concreto sobre el que se aplicó el descuento.
    subscriptionId: int("subscription_id")
      .references(() => subscriptions.id)
      .notNull(),
    percent: int("percent").notNull(),
    amount: int("amount").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    // Idempotencia POR CARGO (D-18): una carga = una fila. Evita duplicar la
    // anotación si el cobro se reintenta. Clave = subscriptionId (NO referralId,
    // que colisionaría mes a mes).
    uniqueIndex("unique_referral_credit_sub").on(table.subscriptionId),
  ],
);
```

Agregar sobre este esqueleto: `partnerId`, `partnerReferralId`, `currency` (`ARS`|`EUR`, D-13), `status` (`pending`|`settled`|`void`), `settledAt`, `settledBy`, `voidedAt`, `voidReason`.

**Vocabulario de soft-void a espejar** (`finance/transaction-service.ts`, `firm-money.ts`): `voided_at` + razón + `voidedBy`; **nada se borra** (D-14).

---

### `src/db/tenant-tables.ts` (config, gate)

**Analog:** las entradas gemelas ya presentes en el archivo.

**1) `GYM_OWNED_TABLES`** (`:69`, orden alfabético — el diff debe ser de una línea por tabla):

```ts
export const GYM_OWNED_TABLES = [
  "academy_inquiries",
  "activities",
  ...
```

Agregar `"partner_commissions"`, `"partner_referrals"`, `"referral_partners"` en su posición alfabética.

**2) `TENANT_UNIQUE_ALLOWLIST`** (`:293`) — las dos uniques **derivadas de FK scopeada** van acá con motivo escrito, calcado palabra por palabra de las gemelas (`:329-332`):

```ts
  "referral_credits.unique_referral_credit_sub":
    "Derivada de FK scopeada: primer campo `subscription_id` → `subscriptions`, que ancla en `users`. Un crédito de referido por suscripción.",
  "referrals.referrals_referred_id_unique":
    "Derivada de FK scopeada: `referred_id` → `users`. Un socio es referido una sola vez, y el socio pertenece a un solo tenant.",
```

⚠ `referral_partners.code` **NO** va al allowlist: es unique **compuesta** `(tenant_id, code)` (ver arriba).

---

### `src/db/migrations/0209_referral_partners.sql` (migration, DDL)

**Analog primario:** `src/db/migrations/0202_session_week_regime.sql` — **la primera tabla gym-owned que nace con `tenant_id` desde el arranque**, exactamente el caso de esta fase.

**Header a calcar** (`0202:1-27`) — incluye las 3 trampas del repo:

```sql
-- 0202_session_week_regime.sql
-- Fase 159 (SEM-05, D-18): ancla historica semana->regimen. Tabla nueva que ...
--
-- Es la PRIMERA tabla gym-owned que nace con tenant_id desde el arranque (no
-- un ALTER de la tanda C, fases 167/192-195): compone el contrato de columna
-- de tenant-column.ts (tenant_id int NOT NULL DEFAULT 1 + FK a tenants) con el
-- estilo de unique compuesta tenant_id-primero de la migracion 0196 (CON-01).
--
-- Hand-written: db:generate pega contra el drift interactivo preexistente de
-- sessions.goal_plan_type (mismo motivo que 0184/0188/0189). NUNCA drizzle-kit
-- push/migrate -- la tabla _migrations es la unica fuente de verdad, local y
-- prod.
--
-- Numeracion: ... verificado con `git ls-tree --name-only <ref>
-- el-templo-api/src/db/migrations/` contra master y staging antes de escribir
-- este archivo, asi que 0202 es el siguiente libre real en ambas.
--
-- Un comentario SQL NUNCA debe contener el separador de statements -- el
-- runner parte los statements crudos primero y recien despues borra los
-- comentarios de doble guion.
```

**CREATE TABLE con tenant_id + unique compuesta + FK a tenants** (`0202:29-41`):

```sql
CREATE TABLE `session_week_regime` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL DEFAULT 1,
  `week` int NOT NULL,
  `day` enum('lunes','martes','miercoles','jueves','viernes','sabado') NOT NULL,
  ...
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_session_week_regime_tenant_week_day` (`tenant_id`, `week`, `day`),
  CONSTRAINT `fk_session_week_regime_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`)
);
```

**FKs a `users`/`subscriptions`** — nombre de constraint estilo Drizzle (`0184:24-25`):

```sql
  CONSTRAINT `improvement_proposals_member_id_users_id_fk` FOREIGN KEY (`member_id`) REFERENCES `users` (`id`),
  CONSTRAINT `improvement_proposals_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`)
```

**Nota de numeración a re-verificar** (`0207:22-26` documenta el precedente de renumerar al portar): re-chequear `SELECT name FROM _migrations ORDER BY name DESC LIMIT 5` + `git ls-tree origin/master|origin/staging` en el momento de escribir. Estimación del research: **0209**.

---

### `src/modules/referral-partners/service.ts` (service, CRUD + event-driven)

**Analog:** `el-templo-api/src/modules/referrals/service.ts` (674 líneas). Es el analog exacto y el CONTEXT prohíbe modificarlo — se **calca**, no se importa (salvo lo indicado).

**Docblock de módulo + DI del constructor** (`:1-18` y `:75-83`):

```ts
// Module: referrals — service (fase 157, milestone v5.5).
//
// El corazón "de la plata" del sistema de referidos. Cinco piezas puras que los
// planes 03 (atribución) y 04 (cobro) consumen sin reimplementar nada:
//   ...
// Constructor DI (db, log) clonado de settings/service.ts:26-30.

export class ReferralService {
  constructor(
    private readonly db: DbInstance,
    private readonly log: FastifyBaseLogger,
  ) {}
```

**Imports** (`:20-59`) — nótese `tenantValues, tenantWhere` desde `../shared/tenant` y los errores de dominio:

```ts
import { and, eq, gt, inArray, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyBaseLogger } from "fastify";
import type * as schema from "../../db/schema";
import { users, referrals, referralCredits, subscriptions } from "../../db/schema";
import { BadRequestError, ConflictError, NotFoundError } from "../shared/errors";
import { tenantValues, tenantWhere } from "../shared/tenant";
import type { ReferralAssignmentResult, ... } from "./types";

type DbInstance = MySql2Database<typeof schema>;
```

**Patrón núcleo 1 — flip idempotente y race-safe** (`qualifyFirstPayment:367-404`). Copiar la **estructura** (SELECT previo para saber si hubo flip real + UPDATE guardado con cláusula idéntica), agregando `tenantWhere`:

```ts
  async qualifyFirstPayment(payerUserId: number) {
    // SELECT previo del vínculo pending ... ANTES del UPDATE: si no hay pending,
    // no hubo flip → no notificar.
    const [pending] = await this.db
      .select({ referrerId: referrals.referrerId, referredFirstName: users.firstName })
      .from(referrals)
      .innerJoin(users, eq(users.id, referrals.referredId))
      .where(and(eq(referrals.referredId, payerUserId), eq(referrals.status, "pending")))
      .limit(1);

    await this.db
      .update(referrals)
      .set({ status: "qualified", qualifiedAt: new Date() })
      .where(and(eq(referrals.referredId, payerUserId), eq(referrals.status, "pending")));

    if (!pending) return null;
    return { referrerId: pending.referrerId, referredFirstName: pending.referredFirstName ?? "" };
  }
```

**Patrón núcleo 2 — INSERT idempotente por cargo** (`recordReferralCredit:529-553`). Es el patrón de `partner_commissions`:

```ts
await this.db
  .insert(referralCredits)
  .values({ userId, subscriptionId, percent, amount })
  // Duplicado por re-cobro del mismo cargo → no-op (re-escribe el mismo id).
  .onDuplicateKeyUpdate({ set: { subscriptionId } });
```

**Patrón núcleo 3 — retroactiva con guardas + carrera del UNIQUE** (`assignReferrerToMember:434-519`). **Este método ya es tenancy-native en master** — es el único del archivo que lo es, y por eso es la plantilla exacta del servicio nuevo:

```ts
  async assignReferrerToMember(params: {
    referredId: number; referrerId: number; createdBy: number; tenantId: number;
  }): Promise<ReferralAssignmentResult> {
    const { referredId, referrerId, createdBy, tenantId } = params;

    if (referredId === referrerId) throw new BadRequestError("Un socio no puede figurar como su propio referidor");

    const [referrer] = await this.db.select({ id: users.id }).from(users)
      .where(and(eq(users.id, referrerId), isNull(users.deletedAt))).limit(1);
    if (!referrer) throw new NotFoundError("El socio que figura como referidor no existe");

    const [existing] = await this.db.select({ id: referrals.id }).from(referrals)
      .where(eq(referrals.referredId, referredId)).limit(1);
    if (existing) throw new ConflictError("Este socio ya tiene un referidor asignado");

    // D-20: ¿ya pagó algún plan? Mismo umbral que qualifyReferralOnCharge
    // (`pricePaid > 0`) — un mes 100% bonificado no cualifica. Acotado al
    // gimnasio del scope (`subscriptions` es gym-owned).
    const [paid] = await this.db.select({ id: subscriptions.id }).from(subscriptions)
      .where(and(
        tenantWhere(subscriptions, { tenantId }),
        eq(subscriptions.userId, referredId),
        gt(subscriptions.pricePaid, 0),
      )).limit(1);
    const status = paid ? "qualified" : "pending";

    try {
      await this.db.insert(referrals).values(
        tenantValues({ tenantId }, {
          referrerId, referredId, status, attributionChannel: "assisted" as const,
          createdBy, qualifiedAt: status === "qualified" ? new Date() : null,
        }),
      );
    } catch (err: unknown) {
      // Carrera contra el UNIQUE de referred_id (D-14): otro admin ganó.
      if (isDuplicateKeyError(err)) throw new ConflictError("Este socio ya tiene un referidor asignado");
      throw err;
    }
    ...
    this.log.info({ referredId, referrerId, status, createdBy }, "referral: atribución retroactiva creada desde la ficha");
    return { status, referrerId, referredId };
  }
```

**Helper obligatorio a COPIAR (no importar — regla dura "no tocar referrals")** (`:655-674`):

```ts
/**
 * Narrowing del error de clave duplicada de mysql2 (ER_DUP_ENTRY / errno 1062).
 * Drizzle envuelve el error de mysql2 en un DrizzleQueryError, así que el código
 * real puede vivir en `err.cause` — se recorre la cadena de causas.
 */
function isDuplicateKeyError(err: unknown): boolean {
  let current: unknown = err;
  for (let depth = 0; depth < 5 && current != null; depth++) {
    if (typeof current === "object") {
      const e = current as { code?: string; errno?: number; cause?: unknown };
      if (e.code === "ER_DUP_ENTRY" || e.errno === 1062) return true;
      current = e.cause;
    } else break;
  }
  return false;
}
```

**Normalización de código** (`derivePrefix:640-644`) — el precedente de upper+strip, aplicable a `normalizeCode(code)` (A1 del research):

```ts
function derivePrefix(firstName: string | null): string {
  const letters = (firstName ?? "").toUpperCase().replace(/[^A-Z]/g, "");
  return letters.slice(0, 4) || "REF";
}
```

---

### `src/modules/referral-partners/code-resolver.ts` (utility, transform puro)

**Analog parcial:** `referrals/service.ts:137-145` (resolución de un espacio) + el lookup de promo en `auth/routes.ts:~210-215`.

```ts
  /** Devuelve el userId dueño del code, o null si no existe. */
  async resolveReferralCode(code: string): Promise<number | null> {
    const [row] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.referralCode, code))
      .limit(1);
    return row?.id ?? null;
  }
```

```ts
          const [promo] = await fastify.db
            .select()
            .from(promoPlans)
            .where(eq(promoPlans.promoCode, promoCode))
            .limit(1);
          if (promo && promo.isActive) { ... }
```

**Anti-patrón explícito:** NO generalizar `resolveReferralCode` in-place. El resolver nuevo vive en el módulo nuevo y **llama** al de referidos como una de sus tres ramas. Devuelve **union discriminada** (prohibido `any`, CLAUDE.md §TypeScript).

---

### `src/modules/referral-partners/admin-routes.ts` (route, request-response)

**Analog:** `el-templo-api/src/modules/improvement-proposals/routes.ts:32-107` — plugin admin con guard de roles + country scope + `handleServiceError`.

**Guard de plugin** (`improvement-proposals/routes.ts:32-50`):

```ts
export const improvementProposalsAdminRoutes: FastifyPluginAsync = async (fastify) => {
  const service = new ImprovementProposalsService(fastify.db);

  fastify.addHook("onRequest", async (request, reply) => {
    await fastify.authenticate(request, reply);
    if (!(MEMBER_LIFECYCLE_ROLES as readonly string[]).includes(request.user.role)) {
      return reply.code(403).send({
        error: "Acceso denegado",
        message: "No tenés permisos para ver las propuestas de mejora",
      });
    }
    await attachCountryScope(request, fastify.db);
  });
```

**Handler con schema + try/catch canónico** (`:53-69`):

```ts
fastify.get<{ Querystring: AdminProposalsFilters }>(
  "/",
  { schema: adminProposalsQuerySchema },
  async (request, reply) => {
    try {
      return await service.getAdminProposals(
        { isOwner: request.scope.isOwner, country: request.scope.country },
        request.query,
      );
    } catch (err: unknown) {
      handleServiceError(err, reply, request.log, "get admin proposals");
    }
  },
);
```

**Sets de roles a usar** (de `src/modules/shared/permissions.ts`):

| Superficie                      | Set                                            | Línea  |
| ------------------------------- | ---------------------------------------------- | ------ |
| CRUD de partners + conversiones | `MEMBER_LIFECYCLE_ROLES` (owner/admin/gestion) | `:258` |
| **Liquidar comisiones** (plata) | `FINANCE_VOID_ROLES` (owner/admin/gestion)     | `:247` |
| Lectura agregada tipo analytics | `ANALYTICS_OPERATIONAL_ROLES`                  | `:100` |

**`ctx` de tenancy en la ruta** (`members/routes.ts:~1752-1755`):

```ts
          // El gimnasio SIEMPRE sale del scope del request, nunca del body
          // (mass-assignment, T-169-02). Un scope no resoluble es DENY.
          tenantId: assertTenant(request.scope, "referrals.assignReferrer").tenantId,
```

---

### `src/modules/referral-partners/schemas.ts` (config, validación)

**Analog:** `improvement-proposals/schemas.ts` (56 líneas, archivo completo es el patrón).

```ts
export const submitProposalBodySchema = {
  body: {
    type: "object",
    required: ["proposal"],
    properties: {
      proposal: { type: "string", minLength: 1, maxLength: 1000 },
    },
  },
};

export const adminProposalsQuerySchema = {
  querystring: {
    type: "object",
    properties: {
      dateFrom: { type: "string", format: "date" },
      branchId: { type: "integer", minimum: 1 },
      page: { type: "integer", minimum: 1 },
      limit: { type: "integer", minimum: 1, maximum: 200 },
    },
    additionalProperties: false,
  },
};
```

Aplicar (Security V5 del research): `code` con `pattern`/`maxLength`, `benefitValue` 1-100, `commissionValue` `minimum: 0`, `additionalProperties: false` en TODOS.

---

### `src/app.ts` (config, registro de plugins)

**Analog:** `:253-260` (referrals) y `:296-303` (improvement-proposals):

```ts
// Admin referrals route (v5.5 follow-up): resultados globales del A/B copy test
await app.register(referralAdminRoutes, {
  prefix: "/api/admin/referrals",
});

// Propuestas de mejora por sucursal: member prompt-status + submit, y
// listado/export admin (MEMBER_LIFECYCLE_ROLES).
await app.register(improvementProposalsAdminRoutes, {
  prefix: "/api/admin/improvement-proposals",
});
```

Prefijo sugerido: `/api/admin/referral-partners`. **Cada ruta registrada acá necesita su línea en `test/tenant-manifest.ts`** (ver Shared Patterns §Gates).

---

### `src/modules/auth/routes.ts` (route, request-response)

**Analog:** los tres bloques best-effort del propio `/register`.

**Body — back-compat obligatoria** (`:28-40`):

```ts
interface RegisterBody {
  email: string;
  password: string;
  branchId?: number;
  firstName: string;
  lastName: string;
  dni?: string;
  phone?: string;
  gender: "male" | "female" | "other" | "unspecified";
  promoCode?: string;
  // Phase 157-03 (REF-02, D-08): self-service referral code from ?ref=CODE.
  ref?: string;
}
```

El campo `code` nuevo se **suma**; el server resuelve `code ?? ref ?? promoCode` (las builds nativas viejas siguen mandando `ref`/`promoCode` por meses — Pitfall 9).

**Estado inicial del alta** (`:~195-200`):

```ts
        // Phase 103-03 (R7, D-12, D-13): online self-register starts as freemium.
        // If a valid promoCode follows, assignPlan → recomputeUserStatus flips
        // it to 'activo' inside the same transaction (Plan 02 wiring).
        status: "freemium" as const,
```

**Bloque best-effort a calcar** (`:296-324`, bloque de referidos) — el bloque partner es el **cuarto** de la misma cadena y **jamás** puede bloquear el alta:

```ts
      // (1) Self-service attribution (REF-02, D-08). The referrer is resolved
      // server-side from the code — never taken raw from the body (Security
      // V4/T-157-08). Auto-referral ... and a second claim on an already-referred
      // user (UNIQUE referred_id, D-14) are both silently skipped/swallowed:
      // the registration still succeeds.
      if (ref) {
        try {
          const referrerId = await referralService.resolveReferralCode(ref);
          if (referrerId !== null && referrerId !== userId) {
            await fastify.db.update(users).set({ referredBy: referrerId }).where(eq(users.id, userId));
            await fastify.db.insert(referrals).values({ ... });
          }
        } catch (err: unknown) {
          request.log.warn(
            { err: err instanceof Error ? err.message : String(err), ref, userId },
            "Referral attribution failed (graceful degradation)",
          );
        }
      }
```

**Precedente del promo con `assignPlan` de precio 0** (`:~240-262`) — es la base del "plan bonificado" y explica el `paymentMethod` neutro:

```ts
const today = new Date().toISOString().split("T")[0];
await subscriptionService.assignPlan(
  userId,
  {
    planId: promo.subscriptionPlanId,
    branchId,
    startDate: today,
    priceTypeApplied: "zero",
    paymentMethod: "cash", // neutral value; pricePaid=0 skips payment recording
  },
  userId, // self-assignment
);
```

⚠ **Tenancy en el registro:** ruta NO autenticada → no hay `request.scope`. El `tenant_id` del `partner_referrals` sale de `partner.tenantId` (fuente legítima documentada en `shared/tenant.ts`), nunca de un default.

---

### `src/modules/subscriptions/service.ts` (service, transform + CRUD)

**Analog:** el trío privado de referidos del MISMO archivo. Crear los **gemelos** (`qualifyPartnerOnCharge`, `computePriceWithPartnerDiscount`, `recordPartnerBenefitOnCharge`) — **no** reusar los de referidos.

**Docblock del bloque** (`:480-488`):

```ts
// ── Referidos (fase 157) ──────────────────────────────────────────────
// El "hook de la plata": las 4 charge-paths (assignPlan, changePlanNow,
// changePlanAfterCurrent, renewSubscription) + getPricingPreview comparten
// estos helpers para (1) cualificar el vínculo del referido en su 1er pago
// ANTES de computar el descuento (D-20/D-21) y (2) reducir pricePaid según
// los vínculos qualified con contraparte activa (DESC-02/03), materializando
// en las columnas NUEVAS referralDiscount* (D-23). Todo server-computed, sin
// input del cliente (DESC-05).
```

**Gate `pricePaid <= 0`** (`qualifyReferralOnCharge:496`):

```ts
  private async qualifyReferralOnCharge(payerUserId: number, pricePaid: number): Promise<void> {
    if (pricePaid <= 0) return;
    const flipped = await new ReferralService(this.db, this.log).qualifyFirstPayment(payerUserId);
    if (!flipped) return;
    try {
      await new NotificationService(this.db, this.log).queueNotification({ ... });
    } catch (err: unknown) {
      this.log.warn({ err: err instanceof Error ? err.message : String(err), ... },
        "referral activation notification failed (best-effort)");
    }
  }
```

**Price-math canónica** (`computePriceWithReferralDiscount:535`) — `Math.floor(base * pct/100)`:

```ts
  private async computePriceWithReferralDiscount(userId: number, basePrice: number) {
    const percent = await new ReferralService(this.db, this.log).computeReferralDiscountPercent(userId);
    if (percent <= 0) return { percent: 0, amount: 0, pricePaid: basePrice };
    const amount = Math.floor(basePrice * (percent / 100));
    return { percent, amount, pricePaid: basePrice - amount };
  }
```

**Bloque de llamada en `assignPlan`** (`:1652-1661`) — el guard por categoría y la exclusión del prorrateo:

```ts
// ── Referidos (fase 157, D-20/D-21) ──
// Orden canónico: (1) el precio ya está resuelto (incl. auraSpend); (2) si
// el cargo cobra, flippear el vínculo pending del payer a qualified ANTES
// del cómputo ...
// Alta prorrateada: el proporcional es el precio final, sin descuento de
// referido encima ...
if (!excludedFromReferrals(plan.planCategory) && !input.prorateToMonthEnd) {
  await this.qualifyReferralOnCharge(userId, pricePaid);
  const referral = await this.computePriceWithReferralDiscount(
    userId,
    pricePaid,
  );
  pricePaid = referral.pricePaid;
  referralDiscountPercent = referral.percent > 0 ? referral.percent : null;
  referralDiscountAmount = referral.amount > 0 ? referral.amount : null;
}
```

⚠ **D-17 divide este guard en dos:** la **comisión** dispara con cualquier categoría (`pricePaid > 0`); el **descuento de partner** conserva `!excludedFromReferrals(...) && !prorateToMonthEnd`.

⚠ **Pitfall 6 (D-10/D-20) — resolver el ganador ANTES del bloque AURA.** El `spend()` corre en `:1625`, mucho antes del bloque de referidos:

```ts
      if (input.auraSpend && input.auraSpend > 0) {
        if (excludedFromAura(plan.planCategory)) {
          throw new BadRequestError("Los paquetes de clases no aceptan descuento AURA");
        }
        const tier = AURA_DISCOUNT_TIERS.find((t) => t.spend === input.auraSpend);
        if (!tier) throw new BadRequestError(`Monto de AURA invalido. Opciones: ...`);
        // Spend AURA (throws InsufficientBalanceError if not enough)
        await this.auraService.spend({ userId, amount: tier.spend, ... });
        auraDiscount = tier.spend;
        auraDiscountPercent = tier.percent;
        const discountAmount = Math.floor(basePrice * (tier.percent / 100));
        pricePaid = basePrice - discountAmount;
      }
```

El `%` candidato del partner se computa **antes** (lectura pura, sin efectos); si gana el partner, **no se llama `spend()`**.

**Columnas espejo a agregar** (`db/schema/subscriptions.ts:74-85`):

```ts
    auraDiscount: int("aura_discount"),
    auraDiscountPercent: int("aura_discount_percent"),
    // separadas de auraDiscount* — el gasto AURA discrecional escribe aquellas y
    referralDiscountPercent: int("referral_discount_percent"),
    referralDiscountAmount: int("referral_discount_amount"),
    priceOverrideAmount: int("price_override_amount"),
    priceOverrideReason: text("price_override_reason"),
    membershipKind: membershipKindEnum.default("paga").notNull(),
```

→ `partnerDiscountPercent` / `partnerDiscountAmount` con el mismo shape (`int` nullable).

**Semana gratis — el único camino canónico a `bonificada`** (`:1729`, dentro del INSERT):

```ts
          // Override a $0 = membresía regalada: se auto-etiqueta para que
          // analytics de membresía la excluya (corregible a 'staff' luego).
          membershipKind: priceOverrideAmount === 0 ? "bonificada" : "paga",
```

**Budget derivado** (`:1678-1681`):

```ts
const classesRemaining =
  plan.classesPerWeek !== null
    ? Math.ceil(plan.durationDays / 7) * plan.classesPerWeek
    : (plan.monthlyClassBudget ?? null);
```

**Los 5 puntos de llamada a tocar** (números del research, verificados): `assignPlan:1307`, `changePlanNow:3326`, `changePlanAfterCurrent:3801`, `renewSubscription:4166`, `getPricingPreview:4852` (**solo lectura** — usa `simulatePendingQualification`, ver `computeReferralDiscountPercent:190-238`; sin el equivalente, el PoS muestra un precio distinto al cobrado → existe `test/referrals/preview-parity.test.ts` justamente por eso).

---

### `src/modules/finance/transaction-service.ts` (service, event-driven)

**Analog:** el back-edge de cancelación dentro del propio `_void`.

**Costura exacta** (`:453-461` público, `:525-546` la cascada):

```ts
  async voidInTx(tx: TxHandle, id: number, voidedBy: number, input: VoidTransactionInput): Promise<void> {
    await this._void(tx, id, voidedBy, input);
  }
```

```ts
    const linkRows = await tx
      .select()
      .from(schema.transactionLinks)
      .where(eq(schema.transactionLinks.transactionId, id));
    ...
    if (input.keepMembershipActive === false) {
      const subLink = linkRows.find((l) => l.targetKind === "subscription");
      if (subLink) {
        ...
        await this.subscriptionCanceller._cancelSubscription(
          tx, existing.memberId, voidedBy,
          `Cancelacion por anulacion de cobro #${id}`, subLink.targetId,
          { skipActiveChargesGuard: true },
        );
      }
    }
```

El void de comisiones va **en esa misma tx**, junto al `subLink`: `UPDATE partner_commissions SET status='void', voided_at=NOW(), void_reason=? WHERE subscription_id=? AND status='pending'` (las `settled` intactas — D-14).

---

### `src/modules/scheduling/trials-service.ts` + `routes.ts` (service + route)

**Analog:** el flujo de trial completo del mismo archivo.

**Precedencia de elegibilidad (D-18/Pitfall 5)** — el predicado a extender (`getTrialEligibility:415-455`):

```ts
  async getTrialEligibility(userId: number): Promise<TrialEligibility> {
    const [user] = await this.db.select({ status, deletedAt, phone }).from(users).where(eq(users.id, userId)).limit(1);
    if (!user || user.deletedAt) return { eligible: false, alreadyBooked: false, phoneRequired: false };
    const phoneRequired = !user.phone;

    // A member (or soon-to-be member: a scheduled/future sub) NEVER sees the
    // trial UI ... This gate runs BEFORE the booking-precedence lookup below.
    const [blockingSub] = await this.db.select({ id: subscriptions.id }).from(subscriptions)
      .where(and(eq(subscriptions.userId, userId), inArray(subscriptions.status, [...BLOCKING_SUBSCRIPTION_STATUSES])))
      .limit(1);
    if (blockingSub) return { eligible: false, alreadyBooked: false, phoneRequired };
```

El guard de partner es **una consulta más con la misma forma** (`partner_referrals` con `benefit_status='pending'|'consumed'` y `benefit_type='free_pass'` → `eligible: false`), colocada junto a `blockingSub`.

**Activar+reservar en UN request** (`reserveTrialSelfService:212-...`) — guards ANTES de la tx, mensajes en español, `ConflictError`/`NotFoundError`:

```ts
   * Guards (all run BEFORE the tx so we never leave dangling state):
   *   - 404 if the user or chosen branch doesn't exist.
   *   - 409 if user.status !== 'freemium' (never clobber an existing lifecycle).
   *   - 409 if the chosen branch is virtual (a trial must be presencial, D-06).
   *   - 409 if the user already has a non-cancelled is_trial booking ...
```

**Ruta** (`scheduling/routes.ts:892-921`) — plantilla de `POST /reserve-partner-week`, incluido el patrón de `code` extra en el body de error:

```ts
// POST /reserve-trial — freemium self-service trial reservation (D-01).
// Atomically promotes freemium→prueba and books the trial. Eligibility is
// revalidated server-side from user state; the email token never authorizes (D-21).
fastify.post<{
  Body: { scheduleId: number; date: string; branchId: number; phone?: string };
}>("/reserve-trial", { schema: reserveTrialSchema }, async (request, reply) => {
  try {
    const result = await trialService.reserveTrialSelfService(
      request.user.userId,
      request.body,
    );
    return reply.code(201).send(result);
  } catch (err: unknown) {
    if (err instanceof PhoneRequiredError) {
      return reply.code(400).send({
        error: "Solicitud invalida",
        message: err.message,
        code: "PHONE_REQUIRED",
      });
    }
    handleServiceError(err, reply, request.log, "member reserve trial");
  }
});
```

⚠ **Anti-patrón:** NO reusar `is_trial=true` para la semana gratis — los trials **bypassean la capacidad de la grilla** a propósito (`trials-service.ts:19-22`). La semana de partner es una suscripción real y debe contar en capacidad.

---

### `src/modules/members/routes.ts` (route, request-response) — retroactiva D-15

**Analog:** `POST /:userId/referrals:1731-1757` del mismo archivo. Copiar íntegro cambiando servicio y body:

```ts
// POST /admin/members/:userId/referrals — Atribución RETROACTIVA de referidor
// sobre un socio ya creado (fase 173).
// ...
// Mismo guard que el GET (incluido MEMBER_LIFECYCLE_ROLES ...). El `referrerId`
// se valida SIEMPRE server-side, y a diferencia del alta no degrada en
// silencio: acá la atribución es la operación, un referidor inválido tiene
// que fallar visible.
fastify.post<{ Params: { userId: number }; Body: { referrerId: number } }>(
  "/:userId/referrals",
  { schema: assignReferrerSchema },
  async (request, reply) => {
    try {
      const targetId = await assertReferralTargetInScope(request);
      const referralService = new ReferralService(fastify.db, fastify.log);
      const result = await referralService.assignReferrerToMember({
        referredId: targetId,
        referrerId: request.body.referrerId,
        createdBy: request.user.userId,
        tenantId: assertTenant(request.scope, "referrals.assignReferrer")
          .tenantId,
      });
      return reply.code(201).send(result);
    } catch (err: unknown) {
      handleServiceError(err, reply, request.log, "assign member referrer");
    }
  },
);
```

**Guard de scope reusable** (`assertReferralTargetInScope`, `:~1690-1713`) — devuelve 404 (no 403) cuando el socio es de otro país:

```ts
if (!target || target.deletedAt)
  throw new NotFoundError("Miembro no encontrado");
if (
  !request.scope.isOwner &&
  !target.branchIsVirtual &&
  target.branchCountry !== request.scope.country
) {
  throw new NotFoundError("Miembro no encontrado");
}
return targetId;
```

---

### `src/modules/settings/*` (config, key-value) — URLs de tienda (D-20)

**Analog:** `SettingsService` — patrón `getFlag/setFlag` sobre `system_settings` (`settings/service.ts:36-59`):

```ts
  private async getFlag(key: string): Promise<boolean> {
    const [row] = await this.db
      .select({ settingValue: systemSettings.settingValue })
      .from(systemSettings)
      .where(eq(systemSettings.settingKey, key))
      .limit(1);
    return row?.settingValue === ON;
  }

  private async setFlag(key: string, enabled: boolean): Promise<void> {
    const value = enabled ? ON : OFF;
    await this.db
      .insert(systemSettings)
      .values({ settingKey: key, settingValue: value })
      .onDuplicateKeyUpdate({ set: { settingValue: value } });
    this.log.info({ settingKey: key, value }, "pricing rule updated");
  }
```

Para strings (URLs) el par es idéntico sin la serialización `on/off`. Claves en `settings/keys.ts` junto a `PRICING_SETTINGS_KEYS` / `LEADS_SETTINGS_KEYS`: `app.store_url.android`, `app.store_url.ios`. Lectura con fallback (patrón `getReferralConfig:153-174` de referidos: fallback constante cuando la fila falta).

**Precedente de fallback con constante nombrada** (`referrals/service.ts:63-68`):

```ts
/** % por vínculo cuando la fila aura_config['referral'] falta (D-12). */
const DEFAULT_PERCENT_PER_LINK = 10;
/** Clave del tope en system_settings (precedente finance.pending_overdue_days). */
const MAX_PERCENT_CAP_KEY = "referral.max_percent_cap";
```

---

### `test/referral-partners/*.test.ts` (test, integración)

**Analog:** `el-templo-api/test/referrals/admin-assign-referrer.test.ts` — el archivo más reciente y el que mejor documenta el estilo.

**Docblock "qué defiende este archivo"** (`:1-18`):

```ts
/**
 * Fase 173 — endpoint admin POST /api/admin/members/:id/referrals.
 * ...
 * Lo que estos tests defienden, en orden de importancia:
 *  1. El vínculo creado acá es INDISTINGUIBLE del que crea el alta ...
 *  2. El estado inicial usa el criterio del cobro (D-20, `pricePaid > 0`) ...
 *  3. Las reglas heredadas siguen valiendo: D-13 (auto-referral), D-14 (un solo
 *     referidor, incluso bajo carrera), guard de rol y country-scope.
 */
```

**Imports + helpers** (`:19-33`):

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  createTestApp,
  getAuthToken,
  cleanAllTestData,
  createStaffUser,
  todayStr,
  dateOffsetStr,
} from "../helpers";
import { createPlan, createMember } from "../subscriptions/_helpers";
import * as schema from "../../src/db/schema";
```

**Aserción sobre la fila CRUDA, no sobre el DTO** (`:~70-80`) — incluye `tenant_id`:

```ts
/** La fila cruda del vínculo — se afirma sobre el SQL, no sobre el DTO. */
async function referralRow(referredId: number): Promise<ReferralRow | null> {
  const rows = await app.db.execute(
    sql`SELECT referrer_id, referred_id, status, attribution_channel,
               copy_variant, created_by, qualified_at, tenant_id
        FROM referrals WHERE referred_id = ${referredId}`,
  );
  const list = rows[0] as unknown as ReferralRow[];
  return list.length > 0 ? list[0] : null;
}
```

**Códigos únicos por corrida (branches NO se limpian)** (`:~62-69`):

```ts
// Branches NO están en TABLES_TO_CLEAN — código único por corrida para evitar
// colisiones UNIQUE entre archivos del mismo worker (patrón del endpoint GET).
function nextSuffix(prefix: string): string {
  const t = Date.now().toString(36).slice(-5);
  const r = Math.floor(Math.random() * 1000)
    .toString(36)
    .padStart(2, "0");
  return `${prefix}${t}${r}`;
}
```

**Regla dura de memoria:** nunca hardcodear ids de `users` — resolver por email (`admin@test.com`). Tests **siempre en foreground** con timeout amplio (prohibido `run_in_background` / loops con `pgrep`).

---

### `el-templo-admin/src/pages/PartnersPage.vue` (page, CRUD + reporte)

**Analog primario:** `src/pages/PlanesPage.vue` (tabs + tabla + diálogo de form + acciones con `$q.dialog`).
**Analog secundario:** `src/pages/ReportesPage.vue:1-55` (header + filtros globales país/sucursal para el tab de conversiones).

**Tabs** (`PlanesPage.vue:9-23`):

```vue
    <q-tabs
      v-model="activeTab"
      dense
      align="left"
      class="q-mb-md"
      active-color="primary"
      indicator-color="primary"
    >
      <q-tab name="planes" label="Planes" />
      <q-tab name="promos" label="Promos" />
    </q-tabs>

    <q-tab-panels v-model="activeTab" animated>
      <q-tab-panel name="planes">
```

**Filtro país owner-only + sucursal** (`ReportesPage.vue:18-44`):

```vue
    <div class="row items-center q-gutter-sm q-mb-md">
      <div v-if="isOwner" class="col-auto" style="min-width: 180px">
        <q-select v-model="selectedCountry" :options="countryOptions" label="Pais"
          dense outlined emit-value map-options @update:model-value="onCountryChange" />
      </div>
      <div class="col-12 col-sm-3">
        <q-select v-model="selectedBranchId" :options="branchOptions" ... />
      </div>
    </div>
```

**Tabla CRUD** (`PlanesPage.vue:~59-72`):

```vue
        <q-table
          :rows="presencialPlans"
          :columns="planColumns"
          row-key="id"
          :loading="loadingPlans"
          :pagination="{ rowsPerPage: 50 }"
          :rows-per-page-options="[20, 50, 100]"
          flat
          bordered
          class="q-mb-xl"
        >
```

**Acción destructiva con confirm** (`PlanesPage.vue:748-770`) — plantilla del botón "Liquidar" (D-16):

```ts
async function confirmDeactivatePromo(promo: PromoListItem) {
  $q.dialog({
    title: 'Desactivar Promo',
    message: `Desactivar "${promo.name}" (${promo.promoCode})?`,
    cancel: true,
  }).onOk(async () => {
    try {
      await subscriptionsApi.deactivatePromo(promo.id);
      $q.notify({ type: 'positive', message: 'Promo desactivada' });
      await loadPromos();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      log.error('Error deactivating promo', { error: message });
      $q.notify({ type: 'negative', message: 'Error al desactivar' });
```

---

### `el-templo-admin/src/components/partners/PartnerFormDialog.vue` (component, form)

**Analog:** `src/components/PromoFormDialog.vue` (218 líneas — el archivo entero es la plantilla; incluye el campo de código deshabilitado en modo edición, que es exactamente lo que necesita el código de partner).

**Shell del diálogo + campo de código** (`:1-30`):

```vue
  <q-dialog :model-value="modelValue" @update:model-value="$emit('update:modelValue', $event)" persistent>
    <q-card style="min-width: 450px">
      <q-card-section>
        <div class="text-h6">{{ isEdit ? 'Editar Promo' : 'Nueva Promo' }}</div>
      </q-card-section>
      <q-card-section>
        <q-form @submit="onSubmit" class="q-gutter-y-md">
          <q-input v-model="form.name" label="Nombre" outlined dense :rules="[required]" />
          <q-input
            v-model="form.promoCode"
            label="Codigo Promo"
            outlined dense
            :rules="[required]"
            :disable="isEdit"
            hint="Sin espacios, ej: TEMPLOPASSBCN"
          />
```

**Props/emits/estado + regla de required** (`:~91-125`):

```ts
const props = defineProps<{
  modelValue: boolean;
  promo: PromoListItem | null;
}>();
const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  saved: [];
}>();
const isEdit = computed(() => !!props.promo);
const saving = ref(false);
const required = (val: unknown) => !!val || val === 0 || "Campo requerido";
```

**Submit con create/update + notify + log** (`:~168-215`):

```ts
async function onSubmit() {
  saving.value = true;
  try {
    if (isEdit.value && props.promo) {
      await subscriptionsApi.updatePromo(props.promo.id, { ... });
      $q.notify({ type: 'positive', message: 'Promo actualizada' });
    } else {
      await subscriptionsApi.createPromo(input);
      $q.notify({ type: 'positive', message: 'Promo creada' });
    }
    emit('update:modelValue', false);
    emit('saved');
  } catch (err: unknown) {
    log.error('Failed to save promo', { err: err instanceof Error ? err.message : String(err) });
    $q.notify({ type: 'negative', message: 'Error al guardar promo' });
  } finally {
    saving.value = false;
  }
}
```

---

### `el-templo-admin/src/components/partners/PartnerQrDialog.vue` (component, file-I/O)

**Analog parcial (opciones de QR):** `tools/generate-branch-qrs.ts:113-128` — mismas opciones producen los PNG que la imprenta ya usa hoy (resultado físico validado):

```ts
  const QRCode = adminRequire("qrcode") as typeof import("qrcode");
  ...
    await QRCode.toFile(filepath, token, {
      width: 1024,
      margin: 2,
      errorCorrectionLevel: "H",
      color: { dark: "#000000", light: "#ffffff" },
    });
```

En el admin la variante es `QRCode.toDataURL(url, {...mismas opciones})` + `<a download>` (o `jszip` para los 2 PNG en un `.zip` — ambas deps ya están en `el-templo-admin/package.json`: `qrcode ^1.5.4`, `@types/qrcode ^1.5.6`, `jszip ^3.10.1`). **CERO instalaciones.**

**Analog parcial (diálogo "acá está tu link" + clipboard):** `PlanesPage.vue:734-746`:

```ts
function showPromoLink(promoCode: string) {
  const link = `https://app.eltemplo.org/register?promo=${promoCode}`;
  $q.dialog({
    title: "Link de Registro",
    message: link,
    ok: "Copiar",
    cancel: "Cerrar",
  }).onOk(() => {
    navigator.clipboard.writeText(link).then(() => {
      $q.notify({ type: "positive", message: "Link copiado" });
    });
  });
}
```

⚠ **Contraste deliberado:** el QR de check-in firma HMAC (`shared/qr-token.ts`, ver `generate-branch-qrs.ts:50-57`) porque **es una credencial**. El QR de esta fase apunta a una URL pública de tienda: **no lleva token ni firma**. No copiar el HMAC.

---

### `el-templo-admin/src/composables/usePartnersApi.ts` (composable, request-response)

**Analog:** `src/composables/useImprovementProposalsApi.ts` (84 líneas — archivo entero es la plantilla).

```ts
import { ref } from "vue";
import { api } from "src/boot/axios";
import { extractError } from "src/utils/extract-error";

export function useImprovementProposalsApi() {
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function getProposals(
    filters: AdminProposalsFilters = {},
  ): Promise<AdminProposalsResult> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<AdminProposalsResult>(
        "/admin/improvement-proposals",
        { params: filters },
      );
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, "Error cargando las propuestas");
      throw err; // ← re-throw SIEMPRE
    } finally {
      loading.value = false;
    }
  }

  function cleanup() {
    // No subscriptions or timers to clean up
  }

  return { loading, error, getProposals, exportProposals, cleanup };
}
```

⚠ `cleanup()` obligatorio (CLAUDE.md §Patterns: composables exponen `cleanup()`, sin `onUnmounted` adentro).

---

### `el-templo-admin/src/components/MemberReferralsTab.vue` (component, CRUD) — sección Partner

**Analog:** el propio componente. El bloque de asignación retroactiva (`:40-70` template + `onAssign` `:~175-215`) se duplica para el partner, cambiando `ReferrerSelect` por un select de partners.

```vue
        <!-- Fase 173: el alta pregunta "¿quién lo trajo?" antes de que se sepa,
             así que casi siempre queda vacío. Acá se carga cuando el dato
             aparece — sin esto hay que tocar la base a mano. -->
        <div v-else>
          <div class="text-caption text-grey-7 q-mb-sm">
            Sin referidor asignado. Si te enterás de quién lo trajo, cargalo acá.
          </div>
          <div class="row items-start q-col-gutter-sm">
            <div class="col">
              <ReferrerSelect ref="referrerSelect" v-model="newReferrerId" label="¿Quién lo trajo?" :disable="assigning" />
            </div>
            <div class="col-auto">
              <q-btn color="primary" label="Asignar" unelevated
                :disable="newReferrerId === null" :loading="assigning" @click="onAssign" />
            </div>
          </div>
        </div>
```

**Mensajería que distingue pending/qualified** (`onAssign`, `:~186-200`) — copy directamente aprovechable:

```ts
$q.notify({
  type: "positive",
  message:
    result.status === "qualified"
      ? "Referidor asignado. El descuento corre desde el próximo cobro de cada uno."
      : "Referidor asignado. Cuando pague su primer plan, ambos reciben el descuento.",
});
// Recarga en vez de mutar local: el estado de los chips lo deriva el server
// (deriveCoveredUntil), el cliente no lo puede inventar.
await load();
```

**`watch` sobre `props.userId`** (`:~225-243`) — los cross-links navegan sin remontar el tab; un partner a medio elegir NO puede sobrevivir al cambio de ficha (se asignaría al alumno equivocado). **Replicar sí o sí.**

---

### `el-templo-admin/src/router/routes.ts` + `src/config/templo-config.ts` (config)

**Entrada de ruta con `meta.allowedRoles` importado del config** (`routes.ts:~96-120`):

```ts
      {
        path: 'planes',
        component: () => import('pages/PlanesPage.vue'),
        meta: { allowedRoles: PLANES_READ_ROLES },
      },
      {
        path: 'programas',
        component: () => import('pages/ProgramasPage.vue'),
        // Dueño-only (D-15): angostado de gestion/admin/owner a admin/owner ...
        meta: { allowedRoles: DUENO_ROLES },
      },
```

**Set de roles nuevo con el docblock "espeja el set del API"** (`templo-config.ts:~95-99`):

```ts
/**
 * Reportes: Dueño + Templo override (gestion). Mirrors CAJA_ROLES of the API.
 */
export const REPORTES_ROLES: AdminRole[] = ["gestion", "admin", "owner"];
```

→ `PARTNERS_ROLES: AdminRole[] = ['gestion', 'admin', 'owner']` (espejo de `MEMBER_LIFECYCLE_ROLES`).

**Ítem de nav** (`templo-config.ts:128-140`):

```ts
export interface NavItem {
  path: string;
  label: string;
  icon: string;
  /** Roles that see this item. Omitted for `trainingOnly` items (gated by canAccessTraining). */
  roles?: AdminRole[];
  ...
}
```

⚠ Regla del archivo (`:12-13`): **el nav solo OCULTA — no es seguridad.** El gate real es la API.

---

### `el-templo-admin/src/components/AssignPlanDialog.vue` (component, preview de precio)

**Analog:** la línea de "Descuento referido" que ya existe en las 4 vistas de precio del diálogo.

**Fila del resumen** (`:452-458`):

```vue
                    <div v-if="pricingDisplay.referralAmount > 0">
                      <div class="text-caption text-grey-7">
                        Descuento referido ({{ pricingDisplay.referralPercent }}%)
                      </div>
                      <div class="text-positive">
                        -{{ formatPrice(pricingDisplay.referralAmount, displayCurrency) }}
                      </div>
                    </div>
```

**Computed que replica la price-math del backend** (`:1521-1560`):

```ts
const pricingDisplay = computed(() => {
  // % de referido server-computed (incluye la simulación del vínculo pendiente
  // que el primer cobro activa). El backend descuenta referidos también sobre
  // precios personalizados ...
  const referralPercent = pricingPreview.value?.referralDiscountPercent ?? 0;
  if (assignForm.value.prorateToMonthEnd) {
    ...
    return { basePrice: base, discountAmount: Math.max(0, base - final), referralPercent: 0, referralAmount: 0, finalPrice: final };
  }
  if (assignForm.value.useOverride && assignForm.value.priceOverrideAmount !== null) {
    // Misma price-math del backend: floor(base*pct/100).
    const referralAmount = Math.floor(override * (referralPercent / 100));
    ...
  }
```

⚠ Hay **4 bloques** con la fila de descuento referido (`:452`, `:636`, `:711/:777`, `:829`). Si el partner necesita fila propia, hay que tocar los 4 (o factorizar). Filtro del picker que excluye `paquete` (`:1440-1447`) — relevante para D-19: el plan de la semana gratis **no** debe aparecer en el picker manual.

---

### `el-templo-app/src/pages/RegisterPage.vue` + `src/stores/useAuthStore.ts` (page + store)

**Badge de código** (`:31-48`) — el badge del partner reusa `.promo-badge` igual que hizo referidos:

```vue
          <!-- Promo badge (per D-14) -->
          <div v-if="promoCode" class="promo-badge">
            <q-icon name="card_giftcard" size="20px" />
            <div class="promo-badge__text">
              <span class="promo-badge__code">{{ promoCode }}</span>
              <span class="promo-badge__offer">1 Mes Gratis</span>
            </div>
          </div>

          <!-- Referral badge (optimista — reusa .promo-badge, plan 157-05) -->
          <div v-if="refCode" class="promo-badge">
            <q-icon name="group_add" size="20px" />
            <div class="promo-badge__text">
              <span class="promo-badge__code">CÓDIGO DE REFERIDO</span>
              <span class="promo-badge__offer">{{ refCode }}</span>
              <span class="promo-badge__subtext">Te invitó un miembro del Templo</span>
            </div>
          </div>
```

**Input del form (dark theme del Templo)** (`:54-64`) — el campo manual "¿Tenés un código?" copia estas props exactas:

```vue
<q-input
  v-model="firstName"
  label="Nombre"
  :rules="[requiredRule]"
  lazy-rules
  dark
  outlined
  label-color="cream"
  color="primary"
  popup-content-class="bg-dark text-cream"
/>
```

**Query params existentes** (`:223-231`) — el campo manual **pre-llena desde estos**, no los reemplaza:

```ts
const promoCode = computed(() => {
  const code = route.query.promo;
  return typeof code === "string" ? code : null;
});

const refCode = computed(() => {
  const code = route.query.ref;
  return typeof code === "string" ? code : null;
});
```

**Submit** (`:258-290`):

```ts
    const result = await authStore.register({
      email: email.value,
      ...
      branchId: branchIdParam,
      promoCode: promoCode.value ?? undefined,
      ref: refCode.value ?? undefined,
    })
    $q.notify({
      type: 'positive',
      message: result?.promoApplied
        ? 'Cuenta creada. Tu mes gratis ya esta activo!'
        : 'Cuenta creada exitosamente',
    })
```

**Store** (`useAuthStore.ts:71-90`) — agregar `code?: string` al tipo del parámetro junto a `promoCode?` / `ref?`:

```ts
  async function register(data: {
    ...
    promoCode?: string
    ref?: string
  }) {
      const response = await api.post('/auth/register', data)
```

⚠ **Pitfall 9:** este cambio no llega al usuario hasta el **build de tiendas** (`com.eltemplo.app`). Version bump feature = minor (`1.7.1 → 1.8.0`). **Las tarjetas no se imprimen antes de que la build esté publicada.**

---

### `el-templo-app/src/pages/ReservasPage.vue` + `useSchedulingApi.ts`

**Analog:** los 3 estados de trial ya resueltos end-to-end.

**Estados de la grilla** (`ReservasPage.vue:54-108`):

```vue
    <!-- Blocked state — user has no presencial plan and is NOT a trial-eligible freemium. -->
    <div v-else-if="!canAccessGrid && !trialEligible" class="reservas__empty">
    ...
    <!-- State 2 — modo reservar prueba (freemium elegible, D-20/D-22) -->
    <template v-else-if="trialEligible">
      <div class="trial-banner q-mb-md">
        <q-icon name="card_giftcard" size="20px" class="trial-banner__icon" />
        <div class="trial-banner__text">
          <p class="trial-banner__heading">Tu sesión de prueba gratis</p>
          <p class="trial-banner__body">Elegí una sede y un horario. Es gratis y sin compromiso.</p>
```

**Computeds derivados del server** (`:893-902`):

```ts
const trialEligibility = ref<TrialEligibility | null>(null);
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

**Llamadas del composable** (`useSchedulingApi.ts:107` y `:120`):

```ts
    const response = await api.get<TrialEligibility>('/members/scheduling/trial-eligibility', { ... })
    ...
      '/members/scheduling/reserve-trial',
```

El estado "beneficio partner pendiente" es un **cuarto estado** en la misma cadena de `v-else-if`, alimentado por el mismo endpoint de elegibilidad extendido (o uno gemelo).

---

## Shared Patterns

### 1. Tenancy — obligatoria en TODO acceso a las 3 tablas nuevas

**Fuente:** `el-templo-api/src/modules/shared/tenant.ts` (`tenantWhere:149`, `tenantValues:170`, `assertTenant:192`)
**Aplica a:** service, admin-routes, code-resolver, los helpers nuevos de `subscriptions/service.ts`, el void de `transaction-service.ts`, el guard de `trials-service.ts`.

```ts
export function tenantWhere<T extends { tenantId: AnyMySqlColumn }>(
  table: T,
  scope: { tenantId: TenantId },
) {
  return eq(table.tenantId, scope.tenantId);
}

// El `tenantId` del scope va DESPUÉS del spread de `values` y por lo tanto PISA
// cualquier `tenantId` que viniera adentro: mitigación de mass-assignment (T-169-02).
export function tenantValues<V extends Record<string, unknown>>(
  scope: { tenantId: TenantId },
  values: V,
): V & { tenantId: TenantId } {
  return { ...values, tenantId: scope.tenantId };
}

// Único puente permitido entre CountryScope.tenantId (number|null) y la firma
// lockeada. Un gimnasio no resoluble es DENY, jamás "el tenant 1".
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

**Columna** (`src/db/schema/tenant-column.ts`, final del archivo):

```ts
export function tenantIdColumn() {
  return int("tenant_id")
    .notNull()
    .default(1)
    .references(() => tenants.id);
}
```

⚠ **Pitfall 1:** `referrals/service.ts` está en `tenant-lint-allowlist.json` (deuda tolerada pre-170) — **copiar su estilo sin `tenantWhere` deja CI en rojo**, y agregar una entrada nueva al allowlist también (el gate compara contra la rama base). Las dos únicas salidas válidas: (a) `tenantWhere`/`tenantValues`, (b) comentario `/* tenant-safe: <motivo> */` pegado al acceso.

---

### 2. Gates de CI que dispara una tabla/ruta nueva (4)

| Gate              | Archivo                                  | Excerpt / acción                                                                    |
| ----------------- | ---------------------------------------- | ----------------------------------------------------------------------------------- |
| ISO-01 manifiesto | `test/tenant-manifest.ts`                | una línea por ruta, **sin comodines** (ver excerpt abajo)                           |
| ISO-01 baseline   | `test/tenancy/iso-01-manifiesto.test.ts` | `const ENTRADAS_BASELINE = 370;` (`:171`) + el **370 del título** del `it` (`:278`) |
| COL-01 tablas     | `src/db/tenant-tables.ts:69`             | 3 nombres en `GYM_OWNED_TABLES`                                                     |
| COL-01 conteos    | `test/db/tenant-tables.test.ts:97-106`   | `88 → 91`, `92 → 95` (ver excerpt abajo)                                            |
| CON-01 uniques    | `src/db/tenant-tables.ts:293`            | 2 entradas con motivo escrito                                                       |

**Entrada de manifiesto con motivo** (`test/tenant-manifest.ts:364-367`):

```ts
  // Atribución retroactiva de referidor (fase 173). tenant-scoped: escribe en
  // `referrals`, que es gym-owned — el INSERT toma el gimnasio de
  // `assertTenant(request.scope)`, nunca del body.
  "POST /api/admin/members/:userId/referrals": { categoria: "tenant-scoped" },
```

**Conteos hardcodeados** (`test/db/tenant-tables.test.ts:97-106`):

```ts
  it("los conteos son 88 gym-owned + 4 exentas y cubren las 92 tablas del schema", () => {
    // Fase 159 (SEM-05) sumó `session_week_regime` a GYM_OWNED_TABLES (era 87 ...): 87 -> 88, 91 -> 92.
    expect(GYM_OWNED_TABLES.length).toBe(88);
    expect(TENANT_EXEMPT_TABLES.length).toBe(4);
    ...
    expect(schemaTables.size).toBe(92);
```

El comentario **explica el bump anterior** — replicar esa costumbre ("Fase 179 sumó `referral_partners`, `partner_referrals`, `partner_commissions`: 88 → 91, 92 → 95").

---

### 3. Errores de dominio + `handleServiceError`

**Fuente:** `src/modules/shared/errors.ts` (`AppError:8`, `NotFoundError:25`, `BadRequestError:37`, `ConflictError:93`, `ForbiddenError:99`)
**Aplica a:** todo el service y todas las rutas nuevas.

- 409 exclusividad de origen (D-12) → `ConflictError` + catch de `ER_DUP_ENTRY`
- 404 partner inexistente → `NotFoundError`
- 400 validación de negocio → `BadRequestError`
- Ruta: `handleServiceError(err, reply, request.log, "<acción>")` en el `catch (err: unknown)`
- Un `code` extra en el body de error solo cuando la app necesita ramificar (patrón `PHONE_REQUIRED` / `PASS_REQUIRED`, `scheduling/routes.ts:914-920`)

---

### 4. Degradación graceful en el alta

**Fuente:** `auth/routes.ts` — 3 bloques `try/catch` independientes, cada uno con `request.log.warn`/`error` y **cero** re-throw.
**Aplica a:** el bloque partner del registro.

```ts
        } catch (err: unknown) {
          request.log.warn(
            { err: err instanceof Error ? err.message : String(err), ref, userId },
            "Referral attribution failed (graceful degradation)",
          );
        }
```

Regla heredada (T-157-11 / UI-SPEC hard rule): **nada de esto puede bloquear el alta**.

---

### 5. Logging

**Fuente:** CLAUDE.md §Logging + los excerpts de arriba.

- API: `request.log.warn/error/info` o `this.log.info` (Pino). **Nunca `console.log`.**
- Frontend: `const log = createLogger('PartnersPage')` de `src/utils/logger.ts`.
- Formato del log del servicio (`referrals/service.ts:513-516`): objeto de contexto primero, mensaje después.

---

### 6. Idempotencia y carreras (Don't Hand-Roll)

| Problema                     | NO construir                        | Usar                                                                            | Fuente                                             |
| ---------------------------- | ----------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------- |
| Alta de comisión duplicada   | `SELECT` + `INSERT`                 | `subscription_id` UNIQUE + `.onDuplicateKeyUpdate({ set: { subscriptionId } })` | `referrals/service.ts:535-539`                     |
| Detectar clave duplicada     | `err.message.includes("Duplicate")` | copiar `isDuplicateKeyError()`                                                  | `referrals/service.ts:655-674`                     |
| Un socio = un origen         | validación solo en servicio         | UNIQUE + chequeo cruzado + catch de `ER_DUP_ENTRY`                              | `referrals/service.ts:457-504`                     |
| Doble consumo del beneficio  | flag leído y después escrito        | `UPDATE ... WHERE benefit_status='pending'` guardado (chequear `affectedRows`)  | `referrals/service.ts:387-395`                     |
| `membership_kind` bonificada | `UPDATE subscriptions SET ...`      | `priceOverrideAmount: 0` en `assignPlan`                                        | `subscriptions/service.ts:1729`                    |
| Auditoría del void           | borrar la fila                      | `status='void'` + `voided_at` + razón                                           | `finance/transaction-service.ts` / `firm-money.ts` |

---

## No Analog Found

| File                                                          | Role       | Data Flow  | Reason                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------- | ---------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `el-templo-admin/src/components/partners/PartnerQrDialog.vue` | component  | file-I/O   | **No existe generación de QR client-side en ninguna de las 3 apps.** El único precedente (`tools/generate-branch-qrs.ts`) es un script Node con `QRCode.toFile` + HMAC. Se porta la config de opciones; el `toDataURL` + `<a download>` (o `jszip`) es código nuevo.                                                                            |
| Reporte "beneficios de partner sin conversión" (D-08)         | service+UI | batch/read | No hay analog directo: el funnel de leads v5.8 (`expire-lost-leads.ts:56-70`) exige `status='prueba'` + booking `is_trial=1` y **no aplica** (Pitfall 4). Los analogs más cercanos para la **forma** del reporte son `components/reports/TrialSessionsReport.vue` y `RecategorizacionReport.vue` (tabla + filtros + export), no para la lógica. |

---

## Metadata

**Analog search scope:**
`el-templo-api/src/{modules,db}`, `el-templo-api/test/{referrals,tenancy,db}`, `el-templo-admin/src/{pages,components,composables,router,config}`, `el-templo-app/src/{pages,stores,composables}`, `tools/` — todo leído de `origin/master` (`6ff65ae3`).

**Módulos API inventariados:** 40. **Analogs leídos en profundidad:** 22 archivos.

**Analogs de máxima señal (leer completos antes de planificar):**

1. `el-templo-api/src/modules/referrals/service.ts` (674 líneas) — la fase entera es "calcar esto con disciplina". Sus docblocks explican POR QUÉ cada forma "peor" es la correcta (incidentes de producción de la 157/173).
2. `el-templo-api/src/modules/improvement-proposals/routes.ts` (149) — módulo admin+member chico y moderno: guard, schemas, `handleServiceError`.
3. `el-templo-api/src/db/migrations/0202_session_week_regime.sql` — primera tabla gym-owned nacida con `tenant_id`.
4. `el-templo-admin/src/components/PromoFormDialog.vue` (218) — CRUD de una entidad con código vanity.
5. `el-templo-api/test/referrals/admin-assign-referrer.test.ts` — estilo de test de integración vigente.

**Pattern extraction date:** 2026-08-22
**Se invalida si:** el tren v6.0 baja a `origin/master` (cambia el shape de `referrals/service.ts` — hoy solo `assignReferrerToMember` es tenancy-native, en staging el archivo entero lo es) o si se publica una build de app que toque `RegisterPage.vue`.
