/**
 * Phase 119 — campaign audience query. D-08 / D-09 / D-10.
 *
 *   - D-08 audience = freemium + no active/paused/scheduled sub + no
 *     non-cancelled is_trial booking + email IS NOT NULL + not unsubscribed
 *   - D-09 ghosts/inactives are NOT filtered out (no activity predicate)
 *   - D-10 freshness guard: created_at < NOW() - INTERVAL 3 DAY
 *
 * Runs against the per-worker MySQL test database via createTestApp().
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import argon2 from "argon2";
import {
  createTestApp,
  cleanAllTestData,
  createEligibleFreemium,
  todayStr,
} from "./helpers";
import { CampaignService } from "../src/modules/campaigns/service";
import { EmailService } from "../src/modules/email/service";
import { AudienceService } from "../src/modules/campaigns/audience-service";
import {
  CAMPAIGN_SEGMENTS,
  type CampaignSegment,
} from "../src/modules/campaigns/types";
import {
  tenantValues,
  tenantWhere,
  type TenantContext,
} from "../src/modules/shared/tenant";
import * as schema from "../src/db/schema";

let app: FastifyInstance;
let service: CampaignService;
let audienceService: AudienceService;
let branchId: number;

// T-173-08: `users` es tabla strict — `listEligible` recibe `ctx` primero.
const CTX: TenantContext = { tenantId: 1 };

function makeService(a: FastifyInstance): CampaignService {
  return new CampaignService(a.db, a.log, new EmailService(a.log));
}

/**
 * Seed a plan and assign a subscription to `userId` (Task 4, D-12/D-22).
 * Defaults preservan el comportamiento previo (status='active',
 * priceTypeApplied='regular') para no romper los call sites existentes;
 * `overrides` habilita los casos de 'bajas' (D-22: price_type_applied<>'zero').
 */
async function seedActiveSubscription(
  userId: number,
  overrides: {
    status?:
      | "active"
      | "paused"
      | "cancelled"
      | "expired"
      | "completed"
      | "changed"
      | "scheduled";
    priceTypeApplied?: "regular" | "zero" | "credit_card";
  } = {},
): Promise<void> {
  const [plan] = await app.db
    .insert(schema.subscriptionPlans)
    .values({
      name: "Audience Test Plan",
      planTier: "foundation",
      bookingMode: "flexible",
      planCategory: "presencial",
      priceRegular: 10000,
      priceZero: 0,
      durationDays: 30,
    })
    .$returningId();

  await app.db.insert(schema.subscriptions).values({
    userId,
    planId: plan.id,
    branchId,
    status: overrides.status ?? "active",
    startDate: todayStr(),
    pricePaid: 10000,
    priceTypeApplied: overrides.priceTypeApplied ?? "regular",
  });
}

/**
 * Seed a schedule + a booking for `userId`. Returns void.
 * Task 4: status widened a los 3 estados no-cancelados que
 * 'prueba_no_convertida' considera (confirmado/qr_escaneado/no_show), además
 * de los dos originales (reservado/cancelado) — mismo helper, sin duplicar.
 */
async function seedTrialBooking(
  userId: number,
  status: "reservado" | "cancelado" | "confirmado" | "qr_escaneado" | "no_show",
): Promise<void> {
  const [activity] = await app.db
    .insert(schema.activities)
    .values({ name: "Audience Test Activity" })
    .$returningId();
  const [sched] = await app.db
    .insert(schema.schedules)
    .values({
      branchId,
      activityId: activity.id,
      dayOfWeek: 1,
      startTime: "10:00",
      endTime: "11:00",
    })
    .$returningId();
  await app.db.insert(schema.bookings).values({
    memberId: userId,
    scheduleId: sched.id,
    bookingDate: todayStr(),
    status,
    isTrial: true,
    source: "self_service",
  });
}

/**
 * Crea un usuario con el `status` que pida el segmento (Task 4, D-12).
 * `createEligibleFreemium` fija 'freemium' a propósito (D-08); este helper
 * generaliza el mismo insert directo para 'bajas' (inactivo),
 * 'prueba_no_convertida', 'alerta_ausente' y 'referidos_pendientes', que
 * necesitan otros status. `createdAt` default = 10 días atrás, cómodo por
 * encima del guard de frescura de D-10 (solo aplica a freemium_elegibles y
 * referidos_pendientes, pero no hace daño en los demás).
 */
async function createUserWithStatus(
  status: "freemium" | "prueba" | "activo" | "inactivo" | "wellhub",
  overrides: { email?: string; createdAt?: Date } = {},
): Promise<{ id: number; email: string }> {
  const uniqueSuffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const email = overrides.email ?? `seg-${status}-${uniqueSuffix}@test.com`;
  const createdAt =
    overrides.createdAt ?? new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
  const passwordHash = await argon2.hash("pass123456");

  const [result] = await app.db
    .insert(schema.users)
    .values(
      tenantValues(CTX, {
        email,
        passwordHash,
        firstName: "Seg",
        lastName: status,
        role: "member",
        branchId,
        status,
        createdAt,
      }),
    )
    .$returningId();

  return { id: result.id, email };
}

/** Seed una fila de `member_profiles` con el `segment` que pida el test (D-12). */
async function seedMemberProfile(
  userId: number,
  segment?: "optima" | "regular" | "alerta" | "ausente",
): Promise<void> {
  await app.db.insert(schema.memberProfiles).values({
    userId,
    ...(segment !== undefined ? { segment } : {}),
  });
}

/** Seed un vínculo de `referrals` (`referredId` = quien fue referido). */
async function seedReferral(
  referrerId: number,
  referredId: number,
  status: "pending" | "qualified" | "revoked",
): Promise<void> {
  await app.db.insert(schema.referrals).values({
    referrerId,
    referredId,
    status,
    attributionChannel: "self_service",
  });
}

beforeAll(async () => {
  app = await createTestApp();
  service = makeService(app);
  audienceService = new AudienceService(app.db, app.log);
  const [branch] = await app.db
    .select({ id: schema.branches.id })
    .from(schema.branches)
    .where(eq(schema.branches.code, "TEST"))
    .limit(1);
  branchId = branch.id;
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await cleanAllTestData(app);
});

describe("campaign audience query (Phase 119)", () => {
  it("D-08: includes an eligible freemium user with an email", async () => {
    const { id } = await createEligibleFreemium(app, { branchId });
    const eligible = await service.listEligible(CTX);
    expect(eligible.map((e) => e.userId)).toContain(id);
  });

  it("D-08: excludes users with an active subscription", async () => {
    const { id } = await createEligibleFreemium(app, { branchId });
    await seedActiveSubscription(id);
    const eligible = await service.listEligible(CTX);
    expect(eligible.map((e) => e.userId)).not.toContain(id);
  });

  it("D-08: excludes users with a non-cancelled is_trial booking", async () => {
    const { id } = await createEligibleFreemium(app, { branchId });
    await seedTrialBooking(id, "reservado");
    const eligible = await service.listEligible(CTX);
    expect(eligible.map((e) => e.userId)).not.toContain(id);
  });

  it("D-08: includes a user whose only is_trial booking is cancelled", async () => {
    const { id } = await createEligibleFreemium(app, { branchId });
    await seedTrialBooking(id, "cancelado");
    const eligible = await service.listEligible(CTX);
    expect(eligible.map((e) => e.userId)).toContain(id);
  });

  it("D-08: excludes users with a null email", async () => {
    const { id } = await createEligibleFreemium(app, { branchId });
    await app.db
      .update(schema.users)
      .set({ email: null })
      .where(and(tenantWhere(schema.users, CTX), eq(schema.users.id, id)));
    const eligible = await service.listEligible(CTX);
    expect(eligible.map((e) => e.userId)).not.toContain(id);
  });

  it("D-08: excludes unsubscribed emails (suppression list)", async () => {
    const { id, email } = await createEligibleFreemium(app, { branchId });
    await app.db.insert(schema.campaignUnsubscribes).values({ email });
    const eligible = await service.listEligible(CTX);
    expect(eligible.map((e) => e.userId)).not.toContain(id);
  });

  it("D-10: excludes users created within the last 3 days", async () => {
    const { id } = await createEligibleFreemium(app, {
      branchId,
      createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
    });
    const eligible = await service.listEligible(CTX);
    expect(eligible.map((e) => e.userId)).not.toContain(id);
  });

  it("D-09: includes ghosts/inactives (no activity filter)", async () => {
    const { id } = await createEligibleFreemium(app, {
      branchId,
      createdAt: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000),
    });
    const eligible = await service.listEligible(CTX);
    expect(eligible.map((e) => e.userId)).toContain(id);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Fase 180 (D-11/D-12) — los 4 segmentos nuevos de AudienceService, más
// countAudience y las invariantes D-15 replicadas contra cada uno.
// ─────────────────────────────────────────────────────────────────────────

describe("AudienceService — bajas (D-12/D-22)", () => {
  it("incluye al inactivo con una suscripción price_type_applied='regular'", async () => {
    const { id, email } = await createUserWithStatus("inactivo");
    await seedActiveSubscription(id, {
      status: "cancelled",
      priceTypeApplied: "regular",
    });
    const eligible = await audienceService.resolveAudience(CTX, "bajas", null);
    expect(eligible.map((e) => e.email)).toContain(email);
  });

  it("D-22: EXCLUYE al inactivo cuya única suscripción es price_type_applied='zero'", async () => {
    const { id, email } = await createUserWithStatus("inactivo");
    await seedActiveSubscription(id, {
      status: "cancelled",
      priceTypeApplied: "zero",
    });
    const eligible = await audienceService.resolveAudience(CTX, "bajas", null);
    expect(eligible.map((e) => e.email)).not.toContain(email);
  });

  it("excluye al inactivo sin ninguna suscripción", async () => {
    const { email } = await createUserWithStatus("inactivo");
    const eligible = await audienceService.resolveAudience(CTX, "bajas", null);
    expect(eligible.map((e) => e.email)).not.toContain(email);
  });
});

describe("AudienceService — prueba_no_convertida (D-12)", () => {
  it("incluye a quien tiene un booking is_trial en no_show y nunca compró", async () => {
    const { id, email } = await createUserWithStatus("freemium");
    await seedTrialBooking(id, "no_show");
    const eligible = await audienceService.resolveAudience(
      CTX,
      "prueba_no_convertida",
      null,
    );
    expect(eligible.map((e) => e.email)).toContain(email);
  });

  it("excluye a quien canceló la sesión de prueba", async () => {
    const { id, email } = await createUserWithStatus("freemium");
    await seedTrialBooking(id, "cancelado");
    const eligible = await audienceService.resolveAudience(
      CTX,
      "prueba_no_convertida",
      null,
    );
    expect(eligible.map((e) => e.email)).not.toContain(email);
  });

  it("excluye a quien hizo la prueba y después compró un plan", async () => {
    const { id, email } = await createUserWithStatus("activo");
    await seedTrialBooking(id, "no_show");
    await seedActiveSubscription(id);
    const eligible = await audienceService.resolveAudience(
      CTX,
      "prueba_no_convertida",
      null,
    );
    expect(eligible.map((e) => e.email)).not.toContain(email);
  });
});

describe("AudienceService — alerta_ausente (D-12)", () => {
  it("incluye member_profiles.segment='alerta'", async () => {
    const { id, email } = await createUserWithStatus("activo");
    await seedMemberProfile(id, "alerta");
    const eligible = await audienceService.resolveAudience(
      CTX,
      "alerta_ausente",
      null,
    );
    expect(eligible.map((e) => e.email)).toContain(email);
  });

  it("incluye member_profiles.segment='ausente'", async () => {
    const { id, email } = await createUserWithStatus("activo");
    await seedMemberProfile(id, "ausente");
    const eligible = await audienceService.resolveAudience(
      CTX,
      "alerta_ausente",
      null,
    );
    expect(eligible.map((e) => e.email)).toContain(email);
  });

  it("excluye member_profiles.segment='regular'", async () => {
    const { id, email } = await createUserWithStatus("activo");
    await seedMemberProfile(id, "regular");
    const eligible = await audienceService.resolveAudience(
      CTX,
      "alerta_ausente",
      null,
    );
    expect(eligible.map((e) => e.email)).not.toContain(email);
  });

  it("excluye segment=NULL (perfil sin computar aún)", async () => {
    const { id, email } = await createUserWithStatus("activo");
    await seedMemberProfile(id); // segment queda NULL a propósito
    const eligible = await audienceService.resolveAudience(
      CTX,
      "alerta_ausente",
      null,
    );
    expect(eligible.map((e) => e.email)).not.toContain(email);
  });
});

describe("AudienceService — referidos_pendientes (D-12)", () => {
  it("incluye referrals.status='pending'", async () => {
    const referrer = await createUserWithStatus("activo");
    const referido = await createUserWithStatus("activo");
    await seedReferral(referrer.id, referido.id, "pending");
    const eligible = await audienceService.resolveAudience(
      CTX,
      "referidos_pendientes",
      null,
    );
    expect(eligible.map((e) => e.email)).toContain(referido.email);
  });

  it("excluye referrals.status='qualified'", async () => {
    const referrer = await createUserWithStatus("activo");
    const referido = await createUserWithStatus("activo");
    await seedReferral(referrer.id, referido.id, "qualified");
    const eligible = await audienceService.resolveAudience(
      CTX,
      "referidos_pendientes",
      null,
    );
    expect(eligible.map((e) => e.email)).not.toContain(referido.email);
  });

  it("excluye referrals.status='revoked'", async () => {
    const referrer = await createUserWithStatus("activo");
    const referido = await createUserWithStatus("activo");
    await seedReferral(referrer.id, referido.id, "revoked");
    const eligible = await audienceService.resolveAudience(
      CTX,
      "referidos_pendientes",
      null,
    );
    expect(eligible.map((e) => e.email)).not.toContain(referido.email);
  });
});

describe("AudienceService — invariantes D-15 por segmento", () => {
  it("'bajas' excluye a un usuario con email NULL aunque cumpla el resto del criterio", async () => {
    const { id, email } = await createUserWithStatus("inactivo");
    await seedActiveSubscription(id, {
      status: "cancelled",
      priceTypeApplied: "regular",
    });
    await app.db
      .update(schema.users)
      .set({ email: null })
      .where(and(tenantWhere(schema.users, CTX), eq(schema.users.id, id)));
    const eligible = await audienceService.resolveAudience(CTX, "bajas", null);
    expect(eligible.map((e) => e.userId)).not.toContain(id);
    expect(eligible.map((e) => e.email)).not.toContain(email);
  });

  it("'bajas' excluye a un usuario suprimido (campaign_unsubscribes) DE ESTE TENANT", async () => {
    const { id, email } = await createUserWithStatus("inactivo");
    await seedActiveSubscription(id, {
      status: "cancelled",
      priceTypeApplied: "regular",
    });
    await app.db.insert(schema.campaignUnsubscribes).values({ email });
    const eligible = await audienceService.resolveAudience(CTX, "bajas", null);
    expect(eligible.map((e) => e.email)).not.toContain(email);
  });

  it("'referidos_pendientes' excluye a un usuario con email NULL", async () => {
    const referrer = await createUserWithStatus("activo");
    const referido = await createUserWithStatus("activo");
    await seedReferral(referrer.id, referido.id, "pending");
    await app.db
      .update(schema.users)
      .set({ email: null })
      .where(
        and(tenantWhere(schema.users, CTX), eq(schema.users.id, referido.id)),
      );
    const eligible = await audienceService.resolveAudience(
      CTX,
      "referidos_pendientes",
      null,
    );
    expect(eligible.map((e) => e.userId)).not.toContain(referido.id);
  });

  it("'referidos_pendientes' excluye a un usuario suprimido (campaign_unsubscribes) DE ESTE TENANT", async () => {
    const referrer = await createUserWithStatus("activo");
    const referido = await createUserWithStatus("activo");
    await seedReferral(referrer.id, referido.id, "pending");
    await app.db
      .insert(schema.campaignUnsubscribes)
      .values({ email: referido.email });
    const eligible = await audienceService.resolveAudience(
      CTX,
      "referidos_pendientes",
      null,
    );
    expect(eligible.map((e) => e.email)).not.toContain(referido.email);
  });
});

describe("AudienceService — countAudience", () => {
  it("countAudience devuelve el mismo número que resolveAudience(...).length para cada uno de los 5 segmentos", async () => {
    const freemium = await createEligibleFreemium(app, { branchId });
    const baja = await createUserWithStatus("inactivo");
    await seedActiveSubscription(baja.id, {
      status: "cancelled",
      priceTypeApplied: "regular",
    });
    const prueba = await createUserWithStatus("freemium");
    await seedTrialBooking(prueba.id, "no_show");
    const alerta = await createUserWithStatus("activo");
    await seedMemberProfile(alerta.id, "alerta");
    const referrer = await createUserWithStatus("activo");
    const referido = await createUserWithStatus("activo");
    await seedReferral(referrer.id, referido.id, "pending");
    void freemium;

    for (const segment of CAMPAIGN_SEGMENTS) {
      const count = await audienceService.countAudience(CTX, segment, null);
      const resolved = await audienceService.resolveAudience(
        CTX,
        segment,
        null,
      );
      expect(count).toBe(resolved.length);
    }
  });

  it("un segmento desconocido lanza BadRequestError (T-180-14) sin correr ninguna query", async () => {
    await expect(
      audienceService.resolveAudience(
        CTX,
        "no_existe" as CampaignSegment,
        null,
      ),
    ).rejects.toThrow(/Segmento de audiencia desconocido/);
  });
});
