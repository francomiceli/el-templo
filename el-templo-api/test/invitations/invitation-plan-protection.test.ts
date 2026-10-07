/**
 * Fase 194 plan 33 (HI-02, LO-03) — protección del plan Invitación y accesos
 * editables por settings.
 *
 * Por HTTP real (planes y `PUT /api/admin/settings/invitations`) y por servicio
 * donde la API no llega (`paquete` no entra por el enum de entrada). Un plan
 * Invitación es `is_trial` + `paquete`: ninguna edición del admin puede cambiar
 * su identidad, y la cantidad de accesos tiene su puerta propia.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import {
  createStaffUser,
  createTestApp,
  getAuthToken,
  cleanAllTestData,
} from "../helpers";
import { SUBSCRIPTIONS_URL } from "../subscriptions/_helpers";
import * as schema from "../../src/db/schema";
import { tenantWhere } from "../../src/modules/shared/tenant";
import {
  BadRequestError,
  ConflictError,
} from "../../src/modules/shared/errors";
import type { SubscriptionService } from "../../src/modules/subscriptions/service";
import type { InvitationService } from "../../src/modules/referrals/invitation-service";
import {
  ACCESSES_PER_INVITATION_RANGE,
  getInvitationSettingLimits,
} from "../../src/modules/referrals/invitation-settings";
import {
  buildInvitationServices,
  createInviterWithCode,
  createMemberInVirtualBranch,
  createTrialPlan,
  ensurePhysicalBranch,
  fixtureCtx,
  resetInvitationSettings,
  uniquePhone10,
  type InvitationsFixtureCtx,
} from "./_helpers";

const SETTINGS_URL = "/api/admin/settings/invitations";

describe("Fase 194-33 HI-02 — plan Invitación protegido + accesos por settings", () => {
  let app: FastifyInstance;
  let ctx: InvitationsFixtureCtx;
  let subscriptionService: SubscriptionService;
  let invitationService: InvitationService;
  let adminToken: string;
  let gestionToken: string;
  let recepcionToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    ctx = fixtureCtx(app);
    ({ subscriptionService, invitationService } = buildInvitationServices(app));
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
  });

  afterAll(async () => {
    await cleanAllTestData(app);
    await resetInvitationSettings(ctx);
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    await resetInvitationSettings(ctx);
    // cleanAllTestData borra los usuarios no-admin: el staff se crea por test.
    const [admin] = await app.db
      .select({ branchId: schema.users.branchId })
      .from(schema.users)
      .where(
        and(
          tenantWhere(schema.users, ctx.tenant),
          eq(schema.users.email, "admin@test.com"),
        ),
      );
    const suf = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    for (const role of ["gestion", "recepcion"] as const) {
      await createStaffUser(app, {
        email: `${role}-inv-plan-${suf}@test.local`,
        password: "pass123456",
        firstName: role,
        lastName: "InvPlan",
        role,
        branchId: admin.branchId ?? 1,
      });
    }
    gestionToken = await getAuthToken(
      app,
      `gestion-inv-plan-${suf}@test.local`,
      "pass123456",
    );
    recepcionToken = await getAuthToken(
      app,
      `recepcion-inv-plan-${suf}@test.local`,
      "pass123456",
    );
  });

  // ─── helpers ─────────────────────────────────────────────────────────

  function auth(token: string): { authorization: string } {
    return { authorization: `Bearer ${token}` };
  }

  async function readPlan(id: number) {
    const [row] = await app.db
      .select()
      .from(schema.subscriptionPlans)
      .where(
        and(
          tenantWhere(schema.subscriptionPlans, ctx.tenant),
          eq(schema.subscriptionPlans.id, id),
        ),
      );
    if (!row) throw new Error(`plan ${id} no existe`);
    return row;
  }

  function putPlan(id: number, payload: Record<string, unknown>) {
    return app.inject({
      method: "PUT",
      url: `${SUBSCRIPTIONS_URL}/plans/${id}`,
      headers: auth(adminToken),
      payload,
    });
  }

  function deactivate(id: number) {
    return app.inject({
      method: "PATCH",
      url: `${SUBSCRIPTIONS_URL}/plans/${id}/deactivate`,
      headers: auth(adminToken),
    });
  }

  async function settings(
    method: "GET" | "PUT",
    token: string,
    payload?: Record<string, unknown>,
  ) {
    const res = await app.inject({
      method,
      url: SETTINGS_URL,
      headers: auth(token),
      payload,
    });
    return { statusCode: res.statusCode, body: JSON.parse(res.body) };
  }

  // ─── updatePlan: identidad inmutable ────────────────────────────────

  describe("PUT /plans/:id sobre el plan Invitación", () => {
    it.each([
      ["isTrial:false", { isTrial: false }],
      ["planCategory presencial", { planCategory: "presencial" }],
      ["multiBranch:false", { multiBranch: false }],
      ["priceRegular > 0", { priceRegular: 5000 }],
      ["priceZero > 0", { priceZero: 5000 }],
      ["priceCreditCard", { priceCreditCard: 100 }],
    ])("%s -> 400 y el plan no cambia", async (_name, payload) => {
      const plan = await createTrialPlan(ctx, { name: "Invitación" });
      const before = await readPlan(plan.id);

      const res = await putPlan(plan.id, payload);

      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).message).toMatch(/Invitación/);
      const after = await readPlan(plan.id);
      expect(after.isTrial).toBe(true);
      expect(after.planCategory).toBe("paquete");
      expect(after.multiBranch).toBe(before.multiBranch);
      expect(after.priceRegular).toBe(before.priceRegular);
      expect(after.priceZero).toBe(before.priceZero);
      expect(after.priceCreditCard).toBe(before.priceCreditCard);
    });

    it("cambiar classesPerWeek -> 400 que apunta a Configuración > Invitaciones", async () => {
      const plan = await createTrialPlan(ctx, { classesPerWeek: 3 });
      const res = await putPlan(plan.id, { classesPerWeek: 5 });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).message).toMatch(/Configuración/);
      expect((await readPlan(plan.id)).classesPerWeek).toBe(3);
    });

    it("reenviar los MISMOS valores (el formulario manda el plan completo) y renombrar -> 200", async () => {
      const plan = await createTrialPlan(ctx, { classesPerWeek: 3 });
      const res = await putPlan(plan.id, {
        name: `Invitación renombrada ${plan.id}`,
        isTrial: true,
        multiBranch: true,
        priceRegular: 0,
        priceZero: 0,
        classesPerWeek: 3,
      });
      expect(res.statusCode).toBe(200);
      expect((await readPlan(plan.id)).name).toBe(
        `Invitación renombrada ${plan.id}`,
      );
    });

    it("control: la prueba de Yoga (especial is_trial) y un plan común siguen editables", async () => {
      const yoga = await createTrialPlan(ctx, { category: "especial" });
      const res = await putPlan(yoga.id, { multiBranch: false });
      expect(res.statusCode).toBe(200);
      expect((await readPlan(yoga.id)).multiBranch).toBe(false);
    });
  });

  describe("PATCH /plans/:id/deactivate", () => {
    it("el plan Invitación no se desactiva (400) y sigue activo", async () => {
      const plan = await createTrialPlan(ctx);
      const res = await deactivate(plan.id);
      expect(res.statusCode).toBe(400);
      expect((await readPlan(plan.id)).isActive).toBe(true);
    });

    it("control: la prueba de Yoga sí se desactiva", async () => {
      const yoga = await createTrialPlan(ctx, { category: "especial" });
      const res = await deactivate(yoga.id);
      expect(res.statusCode).toBe(200);
      expect((await readPlan(yoga.id)).isActive).toBe(false);
    });
  });

  // ─── un solo plan Invitación por país ───────────────────────────────

  describe("un segundo plan Invitación en el mismo país", () => {
    const base = {
      planTier: "flex" as const,
      bookingMode: "flexible" as const,
      priceRegular: 0,
      priceZero: 0,
      durationDays: 6,
      classesPerWeek: 3,
      isTrial: true,
      planCategory: "paquete" as const,
    };

    it("createPlan en el país que ya tiene uno -> ConflictError (409) y no inserta", async () => {
      await createTrialPlan(ctx, { country: "AR", name: "Invitación" });
      await expect(
        subscriptionService.createPlan(ctx.tenant, {
          ...base,
          name: "Invitación bis",
          country: "AR",
        }),
      ).rejects.toBeInstanceOf(ConflictError);
      const rows = await app.db
        .select({ id: schema.subscriptionPlans.id })
        .from(schema.subscriptionPlans)
        .where(
          and(
            tenantWhere(schema.subscriptionPlans, ctx.tenant),
            eq(schema.subscriptionPlans.name, "Invitación bis"),
          ),
        );
      expect(rows).toHaveLength(0);
    });

    it("en OTRO país sí se puede (uno por país)", async () => {
      await createTrialPlan(ctx, { country: "AR", name: "Invitación" });
      const created = await subscriptionService.createPlan(ctx.tenant, {
        ...base,
        name: "Invitación ES",
        country: "ES",
      });
      expect(created.country).toBe("ES");
    });

    it("updatePlan que convertiría un plan común en Invitación del país -> ConflictError", async () => {
      await createTrialPlan(ctx, { country: "AR", name: "Invitación" });
      const common = await subscriptionService.createPlan(ctx.tenant, {
        ...base,
        name: "Común",
        isTrial: false,
        planCategory: "presencial",
        priceRegular: 1000,
        priceZero: 1000,
        country: "AR",
      });
      await expect(
        subscriptionService.updatePlan(ctx.tenant, common.id, {
          isTrial: true,
          planCategory: "paquete",
        }),
      ).rejects.toBeInstanceOf(ConflictError);
      expect((await readPlan(common.id)).isTrial).toBe(false);
    });

    it("el servicio también rechaza (BadRequestError) cambiar la identidad y desactivar", async () => {
      const plan = await createTrialPlan(ctx);
      await expect(
        subscriptionService.updatePlan(ctx.tenant, plan.id, {
          isTrial: false,
        }),
      ).rejects.toBeInstanceOf(BadRequestError);
      await expect(
        subscriptionService.deactivatePlan(ctx.tenant, plan.id),
      ).rejects.toBeInstanceOf(BadRequestError);
    });
  });

  // ─── accesos por invitación en settings ─────────────────────────────

  describe("accessesPerInvitation en /api/admin/settings/invitations", () => {
    it("GET devuelve los accesos por país (null donde no hay plan) y los límites", async () => {
      await createTrialPlan(ctx, { country: "AR", classesPerWeek: 4 });
      const r = await settings("GET", recepcionToken);
      expect(r.statusCode).toBe(200);
      expect(r.body.accessesPerInvitation).toEqual({ AR: 4, ES: null });
      expect(r.body.limits).toEqual(getInvitationSettingLimits());
      expect(r.body.limits.accessesPerInvitation).toEqual(
        ACCESSES_PER_INVITATION_RANGE,
      );
      expect(r.body.limits.monthlyQuota).toEqual({ min: 1, max: 10 });
    });

    it("PUT cambia classes_per_week del plan; los países sin patch no se tocan", async () => {
      const ar = await createTrialPlan(ctx, {
        country: "AR",
        classesPerWeek: 3,
      });
      const es = await createTrialPlan(ctx, {
        country: "ES",
        classesPerWeek: 3,
      });

      const put = await settings("PUT", gestionToken, {
        accessesPerInvitation: { AR: 5 },
      });

      expect(put.statusCode).toBe(200);
      expect(put.body.accessesPerInvitation).toEqual({ AR: 5, ES: 3 });
      expect((await readPlan(ar.id)).classesPerWeek).toBe(5);
      expect((await readPlan(es.id)).classesPerWeek).toBe(3);
    });

    it.each([
      ["0", { AR: 0 }],
      ["11", { AR: 11 }],
      ["decimal", { AR: 2.5 }],
    ])(
      "valor fuera de rango (%s) -> 400 y el plan no cambia",
      async (_n, bad) => {
        const plan = await createTrialPlan(ctx, { classesPerWeek: 3 });
        const r = await settings("PUT", adminToken, {
          accessesPerInvitation: bad,
        });
        expect(r.statusCode).toBe(400);
        expect((await readPlan(plan.id)).classesPerWeek).toBe(3);
      },
    );

    it("un país inventado se descarta en silencio (additionalProperties) y no toca nada", async () => {
      const plan = await createTrialPlan(ctx, { classesPerWeek: 3 });
      const r = await settings("PUT", adminToken, {
        accessesPerInvitation: { XX: 9 },
      });
      expect(r.statusCode).toBe(200);
      expect((await readPlan(plan.id)).classesPerWeek).toBe(3);
    });

    it("país sin plan Invitación -> 400 y NO se escribe nada del patch (atómico)", async () => {
      const ar = await createTrialPlan(ctx, {
        country: "AR",
        classesPerWeek: 3,
      });
      const r = await settings("PUT", adminToken, {
        accessesPerInvitation: { AR: 6, ES: 6 },
        monthlyQuota: 7,
      });
      expect(r.statusCode).toBe(400);
      expect((await readPlan(ar.id)).classesPerWeek).toBe(3);
      const after = await settings("GET", adminToken);
      expect(after.body.monthlyQuota).toBe(2);
    });

    it("roles: recepcion 403 al escribir accesos", async () => {
      const plan = await createTrialPlan(ctx, { classesPerWeek: 3 });
      const r = await settings("PUT", recepcionToken, {
        accessesPerInvitation: { AR: 6 },
      });
      expect(r.statusCode).toBe(403);
      expect((await readPlan(plan.id)).classesPerWeek).toBe(3);
    });

    it("una activación POSTERIOR al PUT recibe el cupo nuevo; la ya activada no cambia", async () => {
      const branch = await ensurePhysicalBranch(ctx, "AR");
      await createTrialPlan(ctx, { country: "AR", classesPerWeek: 3 });
      const inviter = await createInviterWithCode(ctx);

      const first = await createMemberInVirtualBranch(ctx, { dni: null });
      const a = await invitationService.activate(ctx.tenant, {
        channel: "self_service",
        code: inviter.code,
        invitedUserId: first.id,
        branchId: branch.id,
        phone: uniquePhone10(),
        createdBy: null,
      });
      expect(a.classesBudget).toBe(3);

      const put = await settings("PUT", adminToken, {
        accessesPerInvitation: { AR: 5 },
      });
      expect(put.statusCode).toBe(200);

      const second = await createMemberInVirtualBranch(ctx, { dni: null });
      const b = await invitationService.activate(ctx.tenant, {
        channel: "self_service",
        code: inviter.code,
        invitedUserId: second.id,
        branchId: branch.id,
        phone: uniquePhone10(),
        createdBy: null,
      });
      expect(b.classesBudget).toBe(5);

      const [subA] = await app.db
        .select({
          budget: schema.subscriptions.classesBudget,
          remaining: schema.subscriptions.classesRemaining,
        })
        .from(schema.subscriptions)
        .where(
          and(
            tenantWhere(schema.subscriptions, ctx.tenant),
            eq(schema.subscriptions.id, a.subscriptionId),
          ),
        );
      expect(subA).toEqual({ budget: 3, remaining: 3 });
    });
  });
});
