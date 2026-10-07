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
import { and, eq, like } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import * as schema from "../../src/db/schema";
import { NotificationService } from "../../src/modules/notifications/service";
import { EnrollmentService } from "../../src/modules/programs/enrollment-service";
import { BookingService } from "../../src/modules/scheduling/booking-service";
import { InvitationService } from "../../src/modules/referrals/invitation-service";
import { INVITATION_SETTINGS_PREFIX } from "../../src/modules/referrals/invitation-settings";
import { SubscriptionService } from "../../src/modules/subscriptions/service";
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
    category?: "paquete" | "especial" | "presencial";
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
        // Solo reusar una sede con la zona horaria del país: en CI hay sedes
        // ES sembradas por otros tests con el default de Argentina.
        eq(schema.branches.timezone, COUNTRY_DEFAULTS[country].timezone),
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

/**
 * Identidad opcional del socio fixture (plan 194-08): por defecto sin teléfono
 * y con un DNI único; los tests de identificación pasan `phone`/`dni` propios.
 */
export interface MemberIdentityOpts {
  phone?: string | null;
  dni?: string | null;
}

async function insertMember(
  ctx: InvitationsFixtureCtx,
  branchId: number,
  status: UserStatus,
  namePrefix: string,
  identity: MemberIdentityOpts = {},
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
        dni:
          identity.dni === undefined ? `D${suffix}`.slice(0, 20) : identity.dni,
        phone: identity.phone ?? null,
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
  opts: { country?: Country; status?: UserStatus } & MemberIdentityOpts = {},
): Promise<{ id: number; branchId: number }> {
  const branch = await ensurePhysicalBranch(ctx, opts.country ?? "AR");
  return insertMember(
    ctx,
    branch.id,
    opts.status ?? "freemium",
    "Fisico",
    opts,
  );
}

/** Socio freemium en la sede VIRTUAL (el "invitado" típico antes de activar). */
export async function createMemberInVirtualBranch(
  ctx: InvitationsFixtureCtx,
  opts: { status?: UserStatus } & MemberIdentityOpts = {},
): Promise<{ id: number; branchId: number }> {
  const branch = await ensureVirtualBranch(ctx);
  return insertMember(
    ctx,
    branch.id,
    opts.status ?? "freemium",
    "Virtual",
    opts,
  );
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
    status?:
      | "active"
      | "paused"
      | "scheduled"
      | "expired"
      | "completed"
      | "cancelled";
    createdAt?: Date;
    /** Para subs `cancelled`: cuándo se canceló (no toca `end_date`). */
    cancelledAt?: Date;
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
  const today = todayInTz(branch?.timezone ?? COUNTRY_DEFAULTS.AR.timezone);
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
        ...(opts.cancelledAt ? { cancelledAt: opts.cancelledAt } : {}),
      }),
    )
    .$returningId();
  return { id: row.id, startDate, endDate };
}

/**
 * Fila de `invitations` directa (para fixtures de LECTURA: cupo, ventana,
 * "Mis invitados"). La activación real es el servicio de 194-09, no esto.
 * Fechas relativas a `todayInTz` de la sede: default acceso hoy → hoy+5 y
 * `quotaMonth` el mes corriente en la tz de la sede.
 */
export async function createInvitationRow(
  ctx: InvitationsFixtureCtx,
  opts: {
    inviterId: number;
    invitedUserId: number;
    branchId: number;
    activatedAt?: Date;
    quotaMonth?: string;
    accessStartsOn?: string;
    accessExpiresOn?: string;
    status?: "active" | "voided";
    channel?: "self_service" | "assisted";
    phoneLast10?: string;
    dni?: string | null;
    subscriptionId?: number | null;
  },
): Promise<{ id: number }> {
  const [branch] = await ctx.app.db
    .select({ timezone: schema.branches.timezone })
    .from(schema.branches)
    .where(
      and(
        tenantWhere(schema.branches, ctx.tenant),
        eq(schema.branches.id, opts.branchId),
      ),
    );
  const today = todayInTz(branch?.timezone ?? COUNTRY_DEFAULTS.AR.timezone);
  // Teléfono único por fila: dígitos del sufijo rellenados a 10.
  const phone =
    opts.phoneLast10 ??
    uniqueSuffix().replace(/\D/g, "").padEnd(10, "1").slice(0, 10);
  const [row] = await ctx.app.db
    .insert(schema.invitations)
    .values(
      tenantValues(ctx.tenant, {
        inviterId: opts.inviterId,
        invitedUserId: opts.invitedUserId,
        branchId: opts.branchId,
        channel: opts.channel ?? ("self_service" as const),
        status: opts.status ?? ("active" as const),
        quotaMonth: opts.quotaMonth ?? today.slice(0, 7),
        accessStartsOn: opts.accessStartsOn ?? today,
        accessExpiresOn: opts.accessExpiresOn ?? addDays(today, 5),
        invitedPhoneLast10: phone,
        invitedDni: opts.dni ?? null,
        subscriptionId: opts.subscriptionId ?? null,
        ...(opts.activatedAt ? { activatedAt: opts.activatedAt } : {}),
      }),
    )
    .$returningId();
  return { id: row.id };
}

// ─── Activación (194-09) ─────────────────────────────────────────────────────

/**
 * `InvitationService` con su `SubscriptionService` real (+ `EnrollmentService`,
 * que necesita `assignPlan`). Con precio 0 no hace falta `TransactionService`.
 */
export function buildInvitationServices(app: FastifyInstance): {
  subscriptionService: SubscriptionService;
  bookingService: BookingService;
  invitationService: InvitationService;
} {
  const subscriptionService = new SubscriptionService(
    app.db,
    app.log,
    undefined,
    new EnrollmentService(app.db, app.log),
  );
  const bookingService = new BookingService(
    app.db,
    app.log,
    subscriptionService,
    new NotificationService(app.db, app.log),
  );
  subscriptionService.setBookingService(bookingService);
  return {
    subscriptionService,
    bookingService,
    invitationService: new InvitationService(
      app.db,
      app.log,
      subscriptionService,
      bookingService,
    ),
  };
}

/** `tenant_settings` no está en TABLES_TO_CLEAN: se resetea solo el namespace. */
export async function resetInvitationSettings(
  ctx: InvitationsFixtureCtx,
): Promise<void> {
  await ctx.app.db
    .delete(schema.tenantSettings)
    .where(
      and(
        tenantWhere(schema.tenantSettings, ctx.tenant),
        like(
          schema.tenantSettings.settingKey,
          `${INVITATION_SETTINGS_PREFIX}%`,
        ),
      ),
    );
}

/** `users.id` real de `admin@test.com` (FK de audit_log: nunca hardcodear). */
export async function getAdminUserId(
  ctx: InvitationsFixtureCtx,
): Promise<number> {
  const [admin] = await ctx.app.db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(
      and(
        tenantWhere(schema.users, ctx.tenant),
        eq(schema.users.email, "admin@test.com"),
      ),
    );
  if (!admin) throw new Error("admin@test.com no existe en la DB de test");
  return admin.id;
}

// Base aleatoria por proceso + contador: único dentro del worker y poco probable entre workers.
let phoneSeq = Math.floor(Math.random() * 8e7) + 1e7;
/** Teléfono nacional de 10 dígitos único por llamada (el chequeo de identidad es por últimos 10). */
export function uniquePhone10(): string {
  phoneSeq += 1;
  return `11${phoneSeq}`;
}

/**
 * Invitador listo: socio `activo` con membresía real vigente (no is_trial) y
 * código de invitación propio. `branchId` por defecto = primera sede física del país.
 */
export async function createInviterWithCode(
  ctx: InvitationsFixtureCtx,
  opts: { country?: Country } = {},
): Promise<{ id: number; branchId: number; code: string }> {
  const country = opts.country ?? "AR";
  const inviter = await createMemberInPhysicalBranch(ctx, {
    country,
    status: "activo",
  });
  const plan = await createMembershipPlan(ctx, { country });
  await createActiveSub(ctx, { userId: inviter.id, planId: plan.id });
  const code = `INV-${uniqueSuffix().toUpperCase()}`.slice(0, 16);
  await ctx.app.db
    .update(schema.users)
    .set({ referralCode: code })
    .where(
      and(
        tenantWhere(schema.users, ctx.tenant),
        eq(schema.users.id, inviter.id),
      ),
    );
  return { ...inviter, code };
}

// ─── Invitados armados (194-19/20: overview, reporte y bandeja de leads) ─────

const DAY_MS = 24 * 60 * 60 * 1000;

/** Entorno compartido por los invitados de un test (sede, hoy y planes). */
export interface InvitedUserEnv {
  /** Sede física donde se "activó" la invitación y donde vive el invitado. */
  branchId: number;
  /** `todayInTz(<tz de esa sede>)`. */
  today: string;
  trialPlanId: number;
  membershipPlanId: number;
}

export interface InvitedUserSpec {
  /** Offset (días) del último día de accesos respecto de hoy. Default +3. */
  expiresOffset?: number;
  /** `classes_budget` de los accesos (N). Default 4. */
  budget?: number;
  /** `classes_remaining`. Default = budget (sin usar). */
  remaining?: number;
  /** Compra paga posterior a la activación. */
  purchase?: "vigente" | "vencida";
  activatedDaysAgo?: number;
  channel?: "self_service" | "assisted";
  status?: "active" | "voided";
  /** Mes de cupo ('YYYY-MM'). Default: el de hoy en la sede. */
  quotaMonth?: string;
  /** Marca la invitación como convertida (`converted_at`). */
  converted?: boolean;
  phone?: string | null;
}

/** Sub de accesos (plan is_trial) con el cupo N pedido (`createActiveSub` no lo setea). */
export async function createAccessSub(
  ctx: InvitationsFixtureCtx,
  opts: {
    userId: number;
    planId: number;
    branchId: number;
    budget: number;
    remaining: number;
    endOffsetDays?: number;
  },
): Promise<number> {
  const sub = await createActiveSub(ctx, {
    userId: opts.userId,
    planId: opts.planId,
    branchId: opts.branchId,
    startOffsetDays: -3,
    endOffsetDays: opts.endOffsetDays ?? 3,
  });
  await ctx.app.db
    .update(schema.subscriptions)
    .set({ classesBudget: opts.budget, classesRemaining: opts.remaining })
    .where(
      and(
        tenantWhere(schema.subscriptions, ctx.tenant),
        eq(schema.subscriptions.id, sub.id),
      ),
    );
  return sub.id;
}

/**
 * Invitado con invitación (+ sub de accesos y, si se pide, una compra paga o una
 * vencida creada DESPUÉS de la activación). Devuelve los ids para armar vínculos
 * y asistencias.
 */
export async function createInvitedUser(
  ctx: InvitationsFixtureCtx,
  env: InvitedUserEnv,
  inviterId: number,
  spec: InvitedUserSpec = {},
): Promise<{ userId: number; invitationId: number; subscriptionId: number }> {
  const invitee = await createMemberInPhysicalBranch(ctx, {
    status: "prueba",
    ...(spec.phone !== undefined ? { phone: spec.phone } : {}),
  });
  const budget = spec.budget ?? 4;
  const expiresOffset = spec.expiresOffset ?? 3;
  const activatedDaysAgo = spec.activatedDaysAgo ?? 5;
  const subscriptionId = await createAccessSub(ctx, {
    userId: invitee.id,
    planId: env.trialPlanId,
    branchId: env.branchId,
    budget,
    remaining: spec.remaining ?? budget,
    endOffsetDays: expiresOffset,
  });
  const invitation = await createInvitationRow(ctx, {
    inviterId,
    invitedUserId: invitee.id,
    branchId: env.branchId,
    subscriptionId,
    activatedAt: new Date(Date.now() - activatedDaysAgo * DAY_MS),
    accessStartsOn: addDays(env.today, -activatedDaysAgo),
    accessExpiresOn: addDays(env.today, expiresOffset),
    channel: spec.channel,
    status: spec.status,
    quotaMonth: spec.quotaMonth,
  });
  if (spec.converted) {
    await ctx.app.db
      .update(schema.invitations)
      .set({ convertedAt: new Date() })
      .where(
        and(
          tenantWhere(schema.invitations, ctx.tenant),
          eq(schema.invitations.id, invitation.id),
        ),
      );
  }
  if (spec.purchase === "vigente") {
    await createActiveSub(ctx, {
      userId: invitee.id,
      planId: env.membershipPlanId,
      branchId: env.branchId,
      pricePaid: 10000,
      endOffsetDays: 20,
    });
  } else if (spec.purchase === "vencida") {
    await createActiveSub(ctx, {
      userId: invitee.id,
      planId: env.membershipPlanId,
      branchId: env.branchId,
      pricePaid: 10000,
      startOffsetDays: -10,
      endOffsetDays: -3,
      status: "expired",
    });
  }
  return {
    userId: invitee.id,
    invitationId: invitation.id,
    subscriptionId,
  };
}
