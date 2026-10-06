/**
 * Fábricas Wave 0 de la fase 194 (Invitaciones) — reutilizadas por todos los
 * tests de `test/invitations/`.
 *
 * Son wrappers FINOS sobre el schema/`test/helpers.ts`: insertan por Drizzle
 * con `tenantValues` (nunca confiar en el DEFAULT 1 de `tenant_id`), con
 * fechas relativas a `todayInTz(tz de la sede)` y SIN ids hardcodeados
 * (EXECUTOR-RULES). `subscription_plans`, `subscriptions` y `users` están en
 * `TABLES_TO_CLEAN`: lo que se siembra acá se limpia con `cleanAllTestData`.
 *
 * `ctx` es `{ app, tenant }`: la app de test (para `app.db`) y el
 * `TenantContext` del gimnasio donde se siembra. `fixtureCtx(app)` arma el de
 * El Templo.
 */
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import * as schema from "../../src/db/schema";
import { addDays, todayInTz } from "../../src/modules/shared/date-utils";
import { tenantValues, tenantWhere } from "../../src/modules/shared/tenant";
import type { TenantContext } from "../../src/modules/shared/tenant";
import { ensureEfectivoCaja } from "../helpers";
import { TENANT_TEMPLO } from "../fixtures/second-tenant";

export interface InvitationsFixtureCtx {
  app: FastifyInstance;
  tenant: TenantContext;
}

/** Contexto de fixtures: la app de test + el gimnasio (default El Templo). */
export function fixtureCtx(
  app: FastifyInstance,
  tenantId: number = TENANT_TEMPLO,
): InvitationsFixtureCtx {
  return { app, tenant: { tenantId } };
}

type Country = "AR" | "ES";

const COUNTRY_DEFAULTS: Record<
  Country,
  { currency: string; timezone: string }
> = {
  AR: { currency: "ARS", timezone: "America/Argentina/Buenos_Aires" },
  ES: { currency: "EUR", timezone: "Europe/Madrid" },
};

let uniqueSeq = 0;
function uniqueSuffix(): string {
  uniqueSeq += 1;
  return `${Date.now().toString(36)}${uniqueSeq}${Math.random().toString(36).slice(2, 5)}`;
}

/**
 * Plan `is_trial=1` (el "plan Invitación" y la prueba de Yoga comparten la
 * forma): precio 0, `multi_branch=1`, 6 días, 3 clases por semana.
 */
export async function createTrialPlan(
  ctx: InvitationsFixtureCtx,
  opts: {
    country?: Country;
    category?: "paquete" | "especial";
    durationDays?: number;
    classesPerWeek?: number;
    name?: string;
  } = {},
): Promise<{ id: number; country: Country; currency: string }> {
  const country = opts.country ?? "AR";
  const currency = COUNTRY_DEFAULTS[country].currency;
  const [row] = await ctx.app.db
    .insert(schema.subscriptionPlans)
    .values(
      tenantValues(ctx.tenant, {
        name: opts.name ?? `Invitación ${uniqueSuffix()}`,
        planTier: "flex" as const,
        bookingMode: "flexible" as const,
        planCategory: opts.category ?? ("paquete" as const),
        priceRegular: 0,
        priceZero: 0,
        durationDays: opts.durationDays ?? 6,
        classesPerWeek: opts.classesPerWeek ?? 3,
        isTrial: true,
        multiBranch: true,
        country,
        currency,
      }),
    )
    .$returningId();
  return { id: row.id, country, currency };
}

/** Plan de membresía "de verdad" (NO is_trial). */
export async function createMembershipPlan(
  ctx: InvitationsFixtureCtx,
  opts: {
    country?: Country;
    category?: "presencial" | "paquete" | "online_regular" | "especial";
    durationDays?: number;
    name?: string;
  } = {},
): Promise<{ id: number; country: Country; currency: string }> {
  const country = opts.country ?? "AR";
  const currency = COUNTRY_DEFAULTS[country].currency;
  const category = opts.category ?? "presencial";
  const [row] = await ctx.app.db
    .insert(schema.subscriptionPlans)
    .values(
      tenantValues(ctx.tenant, {
        name: opts.name ?? `Membresía ${uniqueSuffix()}`,
        planTier: "flex" as const,
        bookingMode: "flexible" as const,
        planCategory: category,
        priceRegular: 10000,
        priceZero: 10000,
        durationDays: opts.durationDays ?? 30,
        classesPerWeek: 3,
        isTrial: false,
        country,
        currency,
      }),
    )
    .$returningId();
  return { id: row.id, country, currency };
}

/**
 * Sede FÍSICA activa del país en el gimnasio. Reusa una existente (las de las
 * migraciones y la `TEST`) y solo crea una si no hay ninguna del país.
 */
export async function ensurePhysicalBranch(
  ctx: InvitationsFixtureCtx,
  country: Country = "AR",
): Promise<{ id: number; timezone: string }> {
  const existing = await ctx.app.db
    .select({ id: schema.branches.id, timezone: schema.branches.timezone })
    .from(schema.branches)
    .where(
      and(
        tenantWhere(schema.branches, ctx.tenant),
        eq(schema.branches.country, country),
        eq(schema.branches.isVirtual, false),
        eq(schema.branches.isActive, true),
      ),
    )
    .orderBy(schema.branches.id)
    .limit(1);
  if (existing[0]) return existing[0];

  const [created] = await ctx.app.db
    .insert(schema.branches)
    .values(
      tenantValues(ctx.tenant, {
        name: `Sede ${country} ${uniqueSuffix()}`,
        code: `F${uniqueSuffix()}`.slice(0, 20),
        country,
        timezone: COUNTRY_DEFAULTS[country].timezone,
      }),
    )
    .$returningId();
  await ensureEfectivoCaja(
    ctx.app,
    created.id,
    COUNTRY_DEFAULTS[country].currency,
    ctx.tenant.tenantId,
  );
  return { id: created.id, timezone: COUNTRY_DEFAULTS[country].timezone };
}

/** Sede VIRTUAL (Templo Online) del gimnasio. */
export async function ensureVirtualBranch(
  ctx: InvitationsFixtureCtx,
): Promise<{ id: number; timezone: string }> {
  const existing = await ctx.app.db
    .select({ id: schema.branches.id, timezone: schema.branches.timezone })
    .from(schema.branches)
    .where(
      and(
        tenantWhere(schema.branches, ctx.tenant),
        eq(schema.branches.isVirtual, true),
      ),
    )
    .orderBy(schema.branches.id)
    .limit(1);
  if (!existing[0]) {
    throw new Error("No hay sede virtual sembrada en el gimnasio de test");
  }
  return existing[0];
}

type UserStatus = "freemium" | "prueba" | "activo" | "inactivo";

async function insertMember(
  ctx: InvitationsFixtureCtx,
  branchId: number,
  status: UserStatus,
  namePrefix: string,
): Promise<{ id: number; branchId: number }> {
  const suffix = uniqueSuffix();
  const [row] = await ctx.app.db
    .insert(schema.users)
    .values(
      tenantValues(ctx.tenant, {
        email: `${namePrefix}-${suffix}@test.com`,
        passwordHash: "x", // los tests de esta fase no hacen login con estos socios
        firstName: namePrefix,
        lastName: `Fixture${suffix}`,
        dni: `D${suffix}`.slice(0, 20),
        phone: null,
        role: "member" as const,
        level: "alfa" as const,
        status,
        branchId,
        branchUpdatedAt: new Date(),
        branchSource: "manual" as const,
      }),
    )
    .$returningId();
  return { id: row.id, branchId };
}

/** Socio en una sede FÍSICA del país (default AR) con el `status` pedido. */
export async function createMemberInPhysicalBranch(
  ctx: InvitationsFixtureCtx,
  opts: { country?: Country; status?: UserStatus } = {},
): Promise<{ id: number; branchId: number }> {
  const branch = await ensurePhysicalBranch(ctx, opts.country ?? "AR");
  return insertMember(
    ctx,
    branch.id,
    opts.status ?? "freemium",
    "Fisico",
  );
}

/** Socio freemium en la sede VIRTUAL (el "invitado" típico antes de activar). */
export async function createMemberInVirtualBranch(
  ctx: InvitationsFixtureCtx,
  opts: { status?: UserStatus } = {},
): Promise<{ id: number; branchId: number }> {
  const branch = await ensureVirtualBranch(ctx);
  return insertMember(ctx, branch.id, opts.status ?? "freemium", "Virtual");
}

/**
 * Sub 'active' directa (sin pasar por `assignPlan`, que correría
 * `recomputeUserStatus`). Fechas relativas a `todayInTz` de la sede: default
 * arrancó hace 2 días y vence en 20 (holgura contra el cambio de día entre
 * `CURDATE()` de MySQL y la zona de la sede).
 */
export async function createActiveSub(
  ctx: InvitationsFixtureCtx,
  opts: {
    userId: number;
    planId: number;
    branchId?: number;
    startOffsetDays?: number;
    endOffsetDays?: number | null;
    pricePaid?: number;
    status?: "active" | "paused" | "scheduled" | "expired" | "completed";
    createdAt?: Date;
  },
): Promise<{ id: number; startDate: string; endDate: string | null }> {
  const [plan] = await ctx.app.db
    .select({
      currency: schema.subscriptionPlans.currency,
      country: schema.subscriptionPlans.country,
    })
    .from(schema.subscriptionPlans)
    .where(
      and(
        tenantWhere(schema.subscriptionPlans, ctx.tenant),
        eq(schema.subscriptionPlans.id, opts.planId),
      ),
    );
  if (!plan) throw new Error(`createActiveSub: plan ${opts.planId} no existe`);

  let branchId = opts.branchId;
  if (branchId === undefined) {
    const [user] = await ctx.app.db
      .select({ branchId: schema.users.branchId })
      .from(schema.users)
      .where(
        and(
          tenantWhere(schema.users, ctx.tenant),
          eq(schema.users.id, opts.userId),
        ),
      );
    if (!user?.branchId) {
      throw new Error(`createActiveSub: socio ${opts.userId} sin sede`);
    }
    branchId = user.branchId;
  }
  const [branch] = await ctx.app.db
    .select({ timezone: schema.branches.timezone })
    .from(schema.branches)
    .where(
      and(
        tenantWhere(schema.branches, ctx.tenant),
        eq(schema.branches.id, branchId),
      ),
    );
  const today = todayInTz(
    branch?.timezone ?? COUNTRY_DEFAULTS.AR.timezone,
  );
  const startDate = addDays(today, opts.startOffsetDays ?? -2);
  const endDate =
    opts.endOffsetDays === null
      ? null
      : addDays(today, opts.endOffsetDays ?? 20);

  const [row] = await ctx.app.db
    .insert(schema.subscriptions)
    .values(
      tenantValues(ctx.tenant, {
        userId: opts.userId,
        planId: opts.planId,
        branchId,
        status: opts.status ?? ("active" as const),
        startDate,
        endDate,
        pricePaid: opts.pricePaid ?? 0,
        currency: plan.currency,
        priceTypeApplied: "regular" as const,
        ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
      }),
    )
    .$returningId();
  return { id: row.id, startDate, endDate };
}
