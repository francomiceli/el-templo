/**
 * Fase 194 Plan 12 (D-16, D-24, D-17, D-06, SC-2, T-194-39..43) — canal
 * ASISTIDO de invitaciones: recepción/gestión crean la invitación en nombre de
 * un socio desde el admin.
 *
 *   POST /api/admin/members/:userId/invitations
 *   POST /api/admin/members/:userId/invitations/:invitationId/void
 *   POST /api/admin/members/trial   (con `inviterId`: "Lo invita")
 *
 * HTTP contra MySQL real por worker, con el `InvitationService` real (reglas de
 * 194-08/09). Sin ids hardcodeados; fechas relativas a `todayInTz`.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  cleanAllTestData,
  createStaffUser,
  createTestApp,
  createTestMember,
  getAuthToken,
} from "../helpers";
import * as schema from "../../src/db/schema";
import { tenantWhere } from "../../src/modules/shared/tenant";
import {
  buildInvitationServices,
  createActiveSub,
  createInvitationRow,
  createInviterWithCode,
  createMemberInPhysicalBranch,
  createMemberInVirtualBranch,
  createMembershipPlan,
  createTrialPlan,
  ensurePhysicalBranch,
  ensureVirtualBranch,
  fixtureCtx,
  resetInvitationSettings,
  uniquePhone10,
  type InvitationsFixtureCtx,
} from "./_helpers";

const MEMBERS = "/api/admin/members";
const STAFF_PASSWORD = "staffpass123";

describe("Fase 194 D-16/D-24 — canal asistido de invitaciones (admin)", () => {
  let app: FastifyInstance;
  let ctx: InvitationsFixtureCtx;
  let arBranch: { id: number; timezone: string };
  let trialPlanId: number;
  let staffSeq = 0;

  beforeAll(async () => {
    app = await createTestApp();
    ctx = fixtureCtx(app);
  });

  afterAll(async () => {
    await cleanAllTestData(app);
    await resetInvitationSettings(ctx);
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    await resetInvitationSettings(ctx);
    arBranch = await ensurePhysicalBranch(ctx, "AR");
    await ensureVirtualBranch(ctx);
    // `subscription_plans` se vacía con cleanAllTestData: crear DESPUÉS.
    trialPlanId = (await createTrialPlan(ctx, { country: "AR" })).id;
  });

  // ─── helpers ───────────────────────────────────────────────────────────

  async function staff(
    role: "recepcion" | "gestion" | "coach",
    opts: { country?: "AR" | "ES"; branchId?: number } = {},
  ): Promise<{ id: number; token: string }> {
    staffSeq += 1;
    const email = `asist-${role}-${staffSeq}-${Date.now().toString(36)}@test.com`;
    const id = await createStaffUser(app, {
      email,
      password: STAFF_PASSWORD,
      firstName: "Staff",
      lastName: role,
      role,
      branchId: opts.branchId ?? arBranch.id,
      country: opts.country,
    });
    return { id, token: await getAuthToken(app, email, STAFF_PASSWORD) };
  }

  async function adminToken(): Promise<string> {
    return getAuthToken(app, "admin@test.com", "adminpass123");
  }

  function post(url: string, token: string | null, payload: unknown) {
    return app.inject({
      method: "POST",
      url,
      payload: payload as Record<string, unknown>,
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
  }

  function invitationsUrl(userId: number): string {
    return `${MEMBERS}/${userId}/invitations`;
  }

  async function invitationRows(invitedUserId: number) {
    return app.db
      .select()
      .from(schema.invitations)
      .where(
        and(
          tenantWhere(schema.invitations, ctx.tenant),
          eq(schema.invitations.invitedUserId, invitedUserId),
        ),
      );
  }

  async function userRow(id: number) {
    const [row] = await app.db
      .select({
        status: schema.users.status,
        email: schema.users.email,
        phone: schema.users.phone,
      })
      .from(schema.users)
      .where(
        and(tenantWhere(schema.users, ctx.tenant), eq(schema.users.id, id)),
      );
    return row;
  }

  async function countUsersByPhone(phone: string): Promise<number> {
    const rows = await app.db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(
        and(
          tenantWhere(schema.users, ctx.tenant),
          eq(schema.users.phone, phone),
        ),
      );
    return rows.length;
  }

  async function quotaRemaining(inviterId: number): Promise<number> {
    const { invitationService } = buildInvitationServices(app);
    return (await invitationService.getInviterQuota(ctx.tenant, inviterId))
      .remaining;
  }

  /** Alumno ya existente que todavía no es socio (candidato a invitado). */
  async function createPlainInvitee(
    opts: { phone?: string | null } = {},
  ): Promise<number> {
    const member = await createMemberInPhysicalBranch(ctx, {
      status: "prueba",
      phone: opts.phone === undefined ? null : opts.phone,
    });
    return member.id;
  }

  // ─── POST /:userId/invitations ─────────────────────────────────────────

  describe("POST /:userId/invitations", () => {
    it("recepcion invita para un lead sin email creado por /trial: 201, sin cuenta nueva, canal assisted y created_by = recepcion", async () => {
      const recepcion = await staff("recepcion");
      const inviter = await createInviterWithCode(ctx);
      const phone = uniquePhone10();

      // El lead lo carga recepción en la puerta (sin email ni contraseña).
      const lead = await post(`${MEMBERS}/trial`, recepcion.token, {
        firstName: "Lead",
        lastName: "Puerta",
        phone,
        branchId: arBranch.id,
      });
      expect(lead.statusCode, lead.body).toBe(201);
      const leadId = JSON.parse(lead.body).id as number;
      const usersBefore = await countUsersByPhone(phone);

      // Sin `phone` en el body: usa el guardado del lead.
      const res = await post(invitationsUrl(leadId), recepcion.token, {
        inviterId: inviter.id,
        branchId: arBranch.id,
      });

      expect(res.statusCode, res.body).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.classesBudget).toBe(3);
      expect(body.branchId).toBe(arBranch.id);
      expect(typeof body.accessExpiresOn).toBe("string");

      // D-06: ninguna cuenta duplicada.
      expect(await countUsersByPhone(phone)).toBe(usersBefore);
      const after = await userRow(leadId);
      expect(after.status).toBe("prueba");
      expect(after.email).toBeNull();

      const [row] = await invitationRows(leadId);
      expect(row.status).toBe("active");
      expect(row.channel).toBe("assisted");
      expect(row.inviterId).toBe(inviter.id);
      expect(row.createdBy).toBe(recepcion.id);
      expect(row.subscriptionId).toBe(body.subscriptionId);

      const [sub] = await app.db
        .select({
          planId: schema.subscriptions.planId,
          pricePaid: schema.subscriptions.pricePaid,
        })
        .from(schema.subscriptions)
        .where(
          and(
            tenantWhere(schema.subscriptions, ctx.tenant),
            eq(schema.subscriptions.id, body.subscriptionId),
          ),
        );
      expect(sub.planId).toBe(trialPlanId);
      expect(sub.pricePaid).toBe(0);
    });

    it("sin phone en el body y sin teléfono guardado: 400 phone_required y no queda ninguna invitación", async () => {
      const recepcion = await staff("recepcion");
      const inviter = await createInviterWithCode(ctx);
      const inviteeId = await createPlainInvitee({ phone: null });

      const res = await post(invitationsUrl(inviteeId), recepcion.token, {
        inviterId: inviter.id,
        branchId: arBranch.id,
      });

      expect(res.statusCode, res.body).toBe(400);
      expect(JSON.parse(res.body).reason).toBe("phone_required");
      expect(await invitationRows(inviteeId)).toHaveLength(0);
      expect(await quotaRemaining(inviter.id)).toBe(2);
    });

    it("con phone en el body se usa y queda guardado en el alumno", async () => {
      const recepcion = await staff("recepcion");
      const inviter = await createInviterWithCode(ctx);
      const inviteeId = await createPlainInvitee({ phone: null });
      const phone = uniquePhone10();

      const res = await post(invitationsUrl(inviteeId), recepcion.token, {
        inviterId: inviter.id,
        branchId: arBranch.id,
        phone,
      });

      expect(res.statusCode, res.body).toBe(201);
      expect((await userRow(inviteeId)).phone).toContain(phone.slice(-10));
    });

    it("las reglas son las de la app: cupo agotado => 409 inviter_quota_exhausted", async () => {
      const recepcion = await staff("recepcion");
      const inviter = await createInviterWithCode(ctx);
      for (let i = 0; i < 2; i++) {
        const otro = await createMemberInVirtualBranch(ctx);
        await createInvitationRow(ctx, {
          inviterId: inviter.id,
          invitedUserId: otro.id,
          branchId: arBranch.id,
        });
      }
      const inviteeId = await createPlainInvitee({ phone: uniquePhone10() });

      const res = await post(invitationsUrl(inviteeId), recepcion.token, {
        inviterId: inviter.id,
        branchId: arBranch.id,
      });

      expect(res.statusCode, res.body).toBe(409);
      expect(JSON.parse(res.body).reason).toBe("inviter_quota_exhausted");
      expect(await invitationRows(inviteeId)).toHaveLength(0);
    });

    it("las reglas son las de la app: un socio vigente no es elegible (409 invitee_is_member) y un invitador sin membresía tampoco", async () => {
      const recepcion = await staff("recepcion");
      const inviter = await createInviterWithCode(ctx);

      const socio = await createPlainInvitee({ phone: uniquePhone10() });
      const plan = await createMembershipPlan(ctx);
      await createActiveSub(ctx, { userId: socio, planId: plan.id });
      const esMember = await post(invitationsUrl(socio), recepcion.token, {
        inviterId: inviter.id,
        branchId: arBranch.id,
      });
      expect(esMember.statusCode, esMember.body).toBe(409);
      expect(JSON.parse(esMember.body).reason).toBe("invitee_is_member");

      const sinMembresia = await createMemberInPhysicalBranch(ctx, {
        status: "inactivo",
      });
      const inviteeId = await createPlainInvitee({ phone: uniquePhone10() });
      const res = await post(invitationsUrl(inviteeId), recepcion.token, {
        inviterId: sinMembresia.id,
        branchId: arBranch.id,
      });
      expect(res.statusCode, res.body).toBe(409);
      expect(JSON.parse(res.body).reason).toBe("inviter_not_member");
    });

    it("roles: recepcion, gestion y admin pueden; coach => 403, socio => 403, sin token => 401 (T-194-39)", async () => {
      const recepcion = await staff("recepcion");
      const gestion = await staff("gestion");
      const coach = await staff("coach");
      const socio = await createTestMember(app, { branchId: arBranch.id });
      const tokens = [recepcion.token, gestion.token, await adminToken()];

      for (const token of tokens) {
        const inviter = await createInviterWithCode(ctx);
        const inviteeId = await createPlainInvitee({ phone: uniquePhone10() });
        const res = await post(invitationsUrl(inviteeId), token, {
          inviterId: inviter.id,
          branchId: arBranch.id,
        });
        expect(res.statusCode, res.body).toBe(201);
      }

      const inviter = await createInviterWithCode(ctx);
      const inviteeId = await createPlainInvitee({ phone: uniquePhone10() });
      for (const token of [coach.token, socio.token]) {
        const res = await post(invitationsUrl(inviteeId), token, {
          inviterId: inviter.id,
          branchId: arBranch.id,
        });
        expect(res.statusCode, res.body).toBe(403);
      }
      expect(
        (
          await post(invitationsUrl(inviteeId), null, {
            inviterId: inviter.id,
            branchId: arBranch.id,
          })
        ).statusCode,
      ).toBe(401);
      expect(await invitationRows(inviteeId)).toHaveLength(0);
    });

    it("inviterId inexistente => 404 inviter_not_found sin escribir nada", async () => {
      const recepcion = await staff("recepcion");
      const inviteeId = await createPlainInvitee({ phone: uniquePhone10() });

      const res = await post(invitationsUrl(inviteeId), recepcion.token, {
        inviterId: 2147483000,
        branchId: arBranch.id,
      });

      expect(res.statusCode, res.body).toBe(404);
      expect(JSON.parse(res.body).reason).toBe("inviter_not_found");
      expect(await invitationRows(inviteeId)).toHaveLength(0);
    });

    it("alcance de país: un gestion de ES no ve alumnos ni invitadores de AR (404, T-194-41)", async () => {
      const esBranch = await ensurePhysicalBranch(ctx, "ES");
      const gestionEs = await staff("gestion", {
        country: "ES",
        branchId: esBranch.id,
      });
      const inviterAr = await createInviterWithCode(ctx, { country: "AR" });
      const inviterEs = await createInviterWithCode(ctx, { country: "ES" });
      const inviteeAr = await createPlainInvitee({ phone: uniquePhone10() });
      const inviteeEs = (
        await createMemberInPhysicalBranch(ctx, {
          country: "ES",
          status: "prueba",
          phone: uniquePhone10(),
        })
      ).id;

      // Alumno de otro país.
      const resInvitee = await post(
        invitationsUrl(inviteeAr),
        gestionEs.token,
        { inviterId: inviterEs.id, branchId: esBranch.id },
      );
      expect(resInvitee.statusCode, resInvitee.body).toBe(404);

      // Invitador de otro país sobre un alumno propio.
      const resInviter = await post(
        invitationsUrl(inviteeEs),
        gestionEs.token,
        { inviterId: inviterAr.id, branchId: esBranch.id },
      );
      expect(resInviter.statusCode, resInviter.body).toBe(404);
      expect(JSON.parse(resInviter.body).reason).toBe("inviter_not_found");

      expect(await invitationRows(inviteeAr)).toHaveLength(0);
      expect(await invitationRows(inviteeEs)).toHaveLength(0);
    });

    it("createdBy y otras claves del body se rechazan con 400 (T-194-43) y no se escribe nada", async () => {
      const recepcion = await staff("recepcion");
      const otroStaff = await staff("gestion");
      const inviter = await createInviterWithCode(ctx);
      const inviteeId = await createPlainInvitee({ phone: uniquePhone10() });

      const res = await post(invitationsUrl(inviteeId), recepcion.token, {
        inviterId: inviter.id,
        branchId: arBranch.id,
        createdBy: otroStaff.id,
        tenantId: 999,
      });

      expect(res.statusCode, res.body).toBe(400);
      expect(await invitationRows(inviteeId)).toHaveLength(0);

      // El 400 por schema también aplica a un body sin sede.
      const sinSede = await post(invitationsUrl(inviteeId), recepcion.token, {
        inviterId: inviter.id,
      });
      expect(sinSede.statusCode).toBe(400);
    });
  });

  // ─── POST /:userId/invitations/:invitationId/void ──────────────────────

  describe("POST /:userId/invitations/:invitationId/void", () => {
    async function activateAssisted(): Promise<{
      inviterId: number;
      inviteeId: number;
      invitationId: number;
      subscriptionId: number;
    }> {
      const recepcion = await staff("recepcion");
      const inviter = await createInviterWithCode(ctx);
      const inviteeId = await createPlainInvitee({ phone: uniquePhone10() });
      const res = await post(invitationsUrl(inviteeId), recepcion.token, {
        inviterId: inviter.id,
        branchId: arBranch.id,
      });
      expect(res.statusCode, res.body).toBe(201);
      const body = JSON.parse(res.body);
      return {
        inviterId: inviter.id,
        inviteeId,
        invitationId: body.invitationId,
        subscriptionId: body.subscriptionId,
      };
    }

    it("gestion anula con motivo: 200, queda voided con rastro, libera el cupo y cierra los accesos", async () => {
      const gestion = await staff("gestion");
      const act = await activateAssisted();
      expect(await quotaRemaining(act.inviterId)).toBe(1);

      const res = await post(
        `${invitationsUrl(act.inviteeId)}/${act.invitationId}/void`,
        gestion.token,
        { reason: "carga duplicada" },
      );

      expect(res.statusCode, res.body).toBe(200);
      const [row] = await invitationRows(act.inviteeId);
      expect(row.status).toBe("voided");
      expect(row.voidedBy).toBe(gestion.id);
      expect(row.voidReason).toBe("carga duplicada");
      expect(row.voidedAt).not.toBeNull();
      expect(await quotaRemaining(act.inviterId)).toBe(2);

      const [sub] = await app.db
        .select({ status: schema.subscriptions.status })
        .from(schema.subscriptions)
        .where(
          and(
            tenantWhere(schema.subscriptions, ctx.tenant),
            eq(schema.subscriptions.id, act.subscriptionId),
          ),
        );
      expect(sub.status).toBe("completed");
    });

    it("recepcion y coach NO anulan (403, T-194-40) y la invitación sigue activa", async () => {
      const recepcion = await staff("recepcion");
      const coach = await staff("coach");
      const act = await activateAssisted();

      for (const token of [recepcion.token, coach.token]) {
        const res = await post(
          `${invitationsUrl(act.inviteeId)}/${act.invitationId}/void`,
          token,
          { reason: "no corresponde" },
        );
        expect(res.statusCode, res.body).toBe(403);
      }
      expect((await invitationRows(act.inviteeId))[0].status).toBe("active");
    });

    it("una invitación de OTRO alumno en la URL es 404 y no se toca; anular dos veces es 409; motivo corto es 400", async () => {
      const gestion = await staff("gestion");
      const a = await activateAssisted();
      const b = await activateAssisted();

      // Alumno A con la invitación de B.
      const cruzada = await post(
        `${invitationsUrl(a.inviteeId)}/${b.invitationId}/void`,
        gestion.token,
        { reason: "cruzada" },
      );
      expect(cruzada.statusCode, cruzada.body).toBe(404);
      expect((await invitationRows(b.inviteeId))[0].status).toBe("active");

      const corto = await post(
        `${invitationsUrl(a.inviteeId)}/${a.invitationId}/void`,
        gestion.token,
        { reason: "ab" },
      );
      expect(corto.statusCode).toBe(400);

      const ok = await post(
        `${invitationsUrl(a.inviteeId)}/${a.invitationId}/void`,
        gestion.token,
        { reason: "ya no viene" },
      );
      expect(ok.statusCode, ok.body).toBe(200);
      const repetida = await post(
        `${invitationsUrl(a.inviteeId)}/${a.invitationId}/void`,
        gestion.token,
        { reason: "ya no viene" },
      );
      expect(repetida.statusCode, repetida.body).toBe(409);

      const sinExistir = await post(
        `${invitationsUrl(a.inviteeId)}/2147483000/void`,
        gestion.token,
        { reason: "no existe" },
      );
      expect(sinExistir.statusCode).toBe(404);
    });

    it("voidedBy no se acepta en el body (400): el rastro sale del JWT", async () => {
      const gestion = await staff("gestion");
      const otro = await staff("gestion");
      const act = await activateAssisted();

      const res = await post(
        `${invitationsUrl(act.inviteeId)}/${act.invitationId}/void`,
        gestion.token,
        { reason: "motivo valido", voidedBy: otro.id },
      );

      expect(res.statusCode, res.body).toBe(400);
      expect((await invitationRows(act.inviteeId))[0].status).toBe("active");
    });
  });

  // ─── POST /trial con "Lo invita" (D-24) ────────────────────────────────

  describe("POST /trial con inviterId (Lo invita)", () => {
    function trialBody(
      overrides: Record<string, unknown> = {},
    ): Record<string, unknown> {
      return {
        firstName: "Nuevo",
        lastName: "Prueba",
        phone: uniquePhone10(),
        branchId: arBranch.id,
        ...overrides,
      };
    }

    it("crea el lead y activa la invitación asistida: 201 con invitation, lead en prueba con accesos", async () => {
      const recepcion = await staff("recepcion");
      const inviter = await createInviterWithCode(ctx);
      const body = trialBody({ inviterId: inviter.id });

      const res = await post(`${MEMBERS}/trial`, recepcion.token, body);

      expect(res.statusCode, res.body).toBe(201);
      const out = JSON.parse(res.body);
      expect(out.invitationError).toBeNull();
      expect(out.invitation.classesBudget).toBe(3);
      expect(typeof out.invitation.invitationId).toBe("number");
      expect(typeof out.invitation.accessExpiresOn).toBe("string");

      expect((await userRow(out.id)).status).toBe("prueba");
      const [row] = await invitationRows(out.id);
      expect(row.channel).toBe("assisted");
      expect(row.createdBy).toBe(recepcion.id);
      expect(row.inviterId).toBe(inviter.id);
      expect(await quotaRemaining(inviter.id)).toBe(1);
    });

    it("sin inviterId el alta es la de siempre: 201 sin invitation ni invitationError", async () => {
      const recepcion = await staff("recepcion");

      const res = await post(`${MEMBERS}/trial`, recepcion.token, trialBody());

      expect(res.statusCode, res.body).toBe(201);
      const out = JSON.parse(res.body);
      expect(out.invitation).toBeUndefined();
      expect(out.invitationError).toBeUndefined();
      expect(await invitationRows(out.id)).toHaveLength(0);
    });

    it("invitador sin cupo => 409 inviter_quota_exhausted y NO se crea el lead", async () => {
      const recepcion = await staff("recepcion");
      const inviter = await createInviterWithCode(ctx);
      for (let i = 0; i < 2; i++) {
        const otro = await createMemberInVirtualBranch(ctx);
        await createInvitationRow(ctx, {
          inviterId: inviter.id,
          invitedUserId: otro.id,
          branchId: arBranch.id,
        });
      }
      const body = trialBody({ inviterId: inviter.id });

      const res = await post(`${MEMBERS}/trial`, recepcion.token, body);

      expect(res.statusCode, res.body).toBe(409);
      expect(JSON.parse(res.body).reason).toBe("inviter_quota_exhausted");
      expect(await countUsersByPhone(body.phone as string)).toBe(0);
    });

    it("invitador sin membresía vigente o inexistente: 409/404 y NO se crea el lead", async () => {
      const recepcion = await staff("recepcion");
      const sinMembresia = await createMemberInPhysicalBranch(ctx, {
        status: "inactivo",
      });

      const bodyA = trialBody({ inviterId: sinMembresia.id });
      const resA = await post(`${MEMBERS}/trial`, recepcion.token, bodyA);
      expect(resA.statusCode, resA.body).toBe(409);
      expect(JSON.parse(resA.body).reason).toBe("inviter_not_member");
      expect(await countUsersByPhone(bodyA.phone as string)).toBe(0);

      const bodyB = trialBody({ inviterId: 2147483000 });
      const resB = await post(`${MEMBERS}/trial`, recepcion.token, bodyB);
      expect(resB.statusCode, resB.body).toBe(404);
      expect(JSON.parse(resB.body).reason).toBe("inviter_not_found");
      expect(await countUsersByPhone(bodyB.phone as string)).toBe(0);
    });

    it("coach con inviterId => 403 y no se crea el lead", async () => {
      const coach = await staff("coach");
      const inviter = await createInviterWithCode(ctx);
      const body = trialBody({ inviterId: inviter.id });

      const res = await post(`${MEMBERS}/trial`, coach.token, body);

      expect(res.statusCode, res.body).toBe(403);
      expect(await countUsersByPhone(body.phone as string)).toBe(0);
    });

    it("teléfono ya registrado => 409 del dedupe del alta y el cupo del invitador no se consume", async () => {
      const recepcion = await staff("recepcion");
      const inviter = await createInviterWithCode(ctx);
      const phone = uniquePhone10();
      const primero = await post(
        `${MEMBERS}/trial`,
        recepcion.token,
        trialBody({ phone }),
      );
      expect(primero.statusCode, primero.body).toBe(201);

      const res = await post(
        `${MEMBERS}/trial`,
        recepcion.token,
        trialBody({ phone, inviterId: inviter.id }),
      );

      expect(res.statusCode, res.body).toBe(409);
      expect(await quotaRemaining(inviter.id)).toBe(2);
    });

    it("si la activación falla DESPUÉS de crear el lead (sin plan Invitación del país) => 201 con invitation null + invitationError y el cupo no se consume", async () => {
      const recepcion = await staff("recepcion");
      const inviter = await createInviterWithCode(ctx);
      await app.db
        .delete(schema.subscriptionPlans)
        .where(
          and(
            tenantWhere(schema.subscriptionPlans, ctx.tenant),
            eq(schema.subscriptionPlans.id, trialPlanId),
          ),
        );
      const body = trialBody({ inviterId: inviter.id });

      const res = await post(`${MEMBERS}/trial`, recepcion.token, body);

      expect(res.statusCode, res.body).toBe(201);
      const out = JSON.parse(res.body);
      expect(out.invitation).toBeNull();
      expect(typeof out.invitationError.reason).toBe("string");
      expect(out.invitationError.message.length).toBeGreaterThan(0);
      // El lead vale por sí mismo y sigue siendo un lead en prueba.
      expect(await countUsersByPhone(body.phone as string)).toBe(1);
      expect((await userRow(out.id)).status).toBe("prueba");
      // La fila de la activación rota quedó anulada: no consume cupo.
      expect(await quotaRemaining(inviter.id)).toBe(2);
    });
  });

  // ─── D-17: vínculos de descuento SIN accesos y SIN cupo ────────────────

  describe("D-17/D-24: 'Referido por' y '¿Quién lo trajo?' siguen siendo vínculo de descuento sin accesos", () => {
    it("POST /admin/members con referredBy crea el vínculo assisted, ninguna invitación y el cupo del referidor no cambia", async () => {
      const referrer = await createInviterWithCode(ctx);
      const token = await adminToken();
      const n = uniquePhone10();

      const res = await post(MEMBERS, token, {
        email: `alta-paga-${n}@test.com`,
        firstName: "Alta",
        lastName: "Paga",
        phone: n,
        dni: `9${n}`,
        branchId: arBranch.id,
        referredBy: referrer.id,
      });

      expect(res.statusCode, res.body).toBe(201);
      const memberId = JSON.parse(res.body).id as number;
      const [link] = await app.db
        .select()
        .from(schema.referrals)
        .where(
          sql`/* tenant-safe: lectura por referred_id, UNIQUE (D-14/REF-04) */ ${schema.referrals.referredId} = ${memberId}`,
        );
      expect(link.referrerId).toBe(referrer.id);
      expect(link.attributionChannel).toBe("assisted");
      expect(await invitationRows(memberId)).toHaveLength(0);
      expect(await quotaRemaining(referrer.id)).toBe(2);
    });

    it("POST /:userId/referrals retroactivo crea el vínculo sin accesos y no consume cupo (D-17)", async () => {
      const referrer = await createInviterWithCode(ctx);
      const gestion = await staff("gestion");
      const alumno = await createPlainInvitee({ phone: uniquePhone10() });

      const res = await post(`${MEMBERS}/${alumno}/referrals`, gestion.token, {
        referrerId: referrer.id,
      });

      expect(res.statusCode, res.body).toBe(201);
      expect(await invitationRows(alumno)).toHaveLength(0);
      expect(await quotaRemaining(referrer.id)).toBe(2);
      const subs = await app.db
        .select({ id: schema.subscriptions.id })
        .from(schema.subscriptions)
        .where(
          and(
            tenantWhere(schema.subscriptions, ctx.tenant),
            eq(schema.subscriptions.userId, alumno),
          ),
        );
      expect(subs).toHaveLength(0);
    });
  });
});
