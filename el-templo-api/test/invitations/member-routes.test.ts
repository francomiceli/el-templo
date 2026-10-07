/**
 * Fase 194 Plan 10 (D-06, SC-1, SC-2, T-194-34/35/36) — rutas de la app para
 * activar invitaciones:
 *   GET  /api/members/referrals/invitations/eligibility
 *   POST /api/members/referrals/invitations/activate
 *
 * HTTP contra MySQL real por worker (servicio real: reglas y plan Invitación
 * de 194-08/09). Los socios que loguean se crean con `createTestMember`
 * (registro real); el invitador sale de `createInviterWithCode`. Ningún id
 * hardcodeado, fechas siempre relativas a `todayInTz`.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  createTestApp,
  cleanAllTestData,
  createStaffUser,
  createTestMember,
  getAuthToken,
} from "../helpers";
import * as schema from "../../src/db/schema";
import { tenantWhere } from "../../src/modules/shared/tenant";
import { setInvitationSettings } from "../../src/modules/referrals/invitation-settings";
import {
  INELIGIBLE_MESSAGES,
  INVITEE_MESSAGES,
} from "../../src/modules/referrals/invitation-types";
import {
  createActiveSub,
  createInvitationRow,
  createInviterWithCode,
  createMembershipPlan,
  createTrialPlan,
  ensurePhysicalBranch,
  ensureVirtualBranch,
  fixtureCtx,
  resetInvitationSettings,
  uniquePhone10,
  type InvitationsFixtureCtx,
} from "./_helpers";

const ELIGIBILITY = "/api/members/referrals/invitations/eligibility";
const ACTIVATE = "/api/members/referrals/invitations/activate";

interface PreviewBody {
  inviterFirstName: string | null;
  eligible: boolean;
  reason: string | null;
  message: string | null;
  branches: Array<{ id: number; name: string; country: string }>;
  accessesBudget: number | null;
  accessBusinessDays: number;
}

describe("Fase 194 D-06 — rutas de invitaciones del socio (app)", () => {
  let app: FastifyInstance;
  let ctx: InvitationsFixtureCtx;
  let arBranch: { id: number; timezone: string };
  let virtualBranch: { id: number; timezone: string };

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
    virtualBranch = await ensureVirtualBranch(ctx);
    // `subscription_plans` se vacía con cleanAllTestData: crear DESPUÉS.
    await createTrialPlan(ctx, { country: "AR", classesPerWeek: 4 });
  });

  // ─── helpers ───────────────────────────────────────────────────────────

  /** Socio real (loguea) en la sede virtual, el "invitado" típico. */
  async function createInvitee(): Promise<{ id: number; token: string }> {
    const member = await createTestMember(app, { branchId: virtualBranch.id });
    return { id: member.id, token: member.token };
  }

  async function moveToBranch(userId: number, branchId: number): Promise<void> {
    await app.db
      .update(schema.users)
      .set({ branchId })
      .where(
        and(tenantWhere(schema.users, ctx.tenant), eq(schema.users.id, userId)),
      );
  }

  function get(url: string, token?: string) {
    return app.inject({
      method: "GET",
      url,
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
  }

  function post(url: string, payload: unknown, token?: string) {
    return app.inject({
      method: "POST",
      url,
      payload: payload as Record<string, unknown>,
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
  }

  function activateBody(
    code: string,
    extra: Record<string, unknown> = {},
  ): Record<string, unknown> {
    return {
      code,
      branchId: arBranch.id,
      phone: uniquePhone10(),
      ...extra,
    };
  }

  async function invitationRows() {
    return app.db
      .select()
      .from(schema.invitations)
      .where(tenantWhere(schema.invitations, ctx.tenant));
  }

  // ─── GET eligibility ───────────────────────────────────────────────────

  describe("GET /invitations/eligibility", () => {
    it("200 elegible: nombre de pila del invitador, sedes físicas y parámetros, sin datos de más", async () => {
      const inviter = await createInviterWithCode(ctx);
      const invitee = await createInvitee();

      const res = await get(
        `${ELIGIBILITY}?code=${inviter.code}`,
        invitee.token,
      );

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as PreviewBody;
      expect(body.inviterFirstName).toBe("Fisico");
      expect(body.eligible).toBe(true);
      expect(body.reason).toBeNull();
      expect(body.message).toBeNull();
      expect(body.accessBusinessDays).toBe(10);
      // T-194-35: ni apellido ni id del invitador en la respuesta.
      expect(Object.keys(body).sort()).toEqual([
        "accessBusinessDays",
        "accessesBudget",
        "branches",
        "eligible",
        "inviterFirstName",
        "message",
        "reason",
      ]);
      expect(res.body).not.toContain("Fixture");
      // Solo sedes físicas: la virtual del invitado no se ofrece.
      expect(body.branches.map((b) => b.id)).toContain(arBranch.id);
      expect(body.branches.map((b) => b.id)).not.toContain(virtualBranch.id);
      expect(body.branches.every((b) => typeof b.country === "string")).toBe(
        true,
      );
    });

    it("socio en sede virtual: accessesBudget solo con la sede destino elegida, y sale del plan del país de esa sede", async () => {
      const inviter = await createInviterWithCode(ctx);
      const invitee = await createInvitee();

      const sinSede = JSON.parse(
        (await get(`${ELIGIBILITY}?code=${inviter.code}`, invitee.token)).body,
      ) as PreviewBody;
      expect(sinSede.accessesBudget).toBeNull();

      const conSede = await get(
        `${ELIGIBILITY}?code=${inviter.code}&branchId=${arBranch.id}`,
        invitee.token,
      );
      expect(conSede.statusCode).toBe(200);
      // El plan Invitación de AR se sembró con 4 clases por semana.
      expect((JSON.parse(conSede.body) as PreviewBody).accessesBudget).toBe(4);
    });

    it("socio en sede física: usa el país de SU sede (plan y sedes), no hace falta branchId", async () => {
      const esBranch = await ensurePhysicalBranch(ctx, "ES");
      await createTrialPlan(ctx, {
        country: "ES",
        classesPerWeek: 2,
        name: "Invitación ES test",
      });
      const inviter = await createInviterWithCode(ctx);
      const invitee = await createInvitee();
      await moveToBranch(invitee.id, arBranch.id);

      const res = await get(
        `${ELIGIBILITY}?code=${inviter.code}`,
        invitee.token,
      );
      const body = JSON.parse(res.body) as PreviewBody;
      expect(body.accessesBudget).toBe(4);
      // `activate` rechaza otro país: el selector solo ofrece sedes del mismo.
      expect(body.branches.length).toBeGreaterThan(0);
      expect(body.branches.every((b) => b.country === "AR")).toBe(true);
      expect(body.branches.map((b) => b.id)).not.toContain(esBranch.id);
    });

    it("país sin plan Invitación configurado: 200 con accessesBudget null (copy genérico)", async () => {
      const esBranch = await ensurePhysicalBranch(ctx, "ES");
      const inviter = await createInviterWithCode(ctx);
      const invitee = await createInvitee();
      await moveToBranch(invitee.id, esBranch.id);

      const res = await get(
        `${ELIGIBILITY}?code=${inviter.code}`,
        invitee.token,
      );
      expect(res.statusCode).toBe(200);
      expect((JSON.parse(res.body) as PreviewBody).accessesBudget).toBeNull();
    });

    it("accessBusinessDays sigue el parámetro del gimnasio (la app nunca hardcodea 10)", async () => {
      await setInvitationSettings(app.db, ctx.tenant, {
        accessBusinessDays: 7,
      });
      const inviter = await createInviterWithCode(ctx);
      const invitee = await createInvitee();

      const res = await get(
        `${ELIGIBILITY}?code=${inviter.code}`,
        invitee.token,
      );
      expect((JSON.parse(res.body) as PreviewBody).accessBusinessDays).toBe(7);
    });

    it("código inexistente: 404 con reason estable", async () => {
      const invitee = await createInvitee();
      const res = await get(`${ELIGIBILITY}?code=NOEXISTE-0000`, invitee.token);
      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.body) as { reason: string; message: string };
      expect(body.reason).toBe("inviter_not_found");
      expect(body.message).toBe(INVITEE_MESSAGES.inviter_not_found);
    });

    it("sin token: 401", async () => {
      const inviter = await createInviterWithCode(ctx);
      const res = await get(`${ELIGIBILITY}?code=${inviter.code}`);
      expect(res.statusCode).toBe(401);
    });

    it("code ausente o con caracteres inválidos: 400", async () => {
      const invitee = await createInvitee();
      expect((await get(ELIGIBILITY, invitee.token)).statusCode).toBe(400);
      expect(
        (await get(`${ELIGIBILITY}?code=a%20b%27--`, invitee.token)).statusCode,
      ).toBe(400);
      expect(
        (await get(`${ELIGIBILITY}?code=${"A".repeat(25)}`, invitee.token))
          .statusCode,
      ).toBe(400);
    });

    it("socio con membresía vigente: 200 eligible=false invitee_is_member con mensaje", async () => {
      const inviter = await createInviterWithCode(ctx);
      const invitee = await createInvitee();
      const plan = await createMembershipPlan(ctx);
      await createActiveSub(ctx, { userId: invitee.id, planId: plan.id });

      const res = await get(
        `${ELIGIBILITY}?code=${inviter.code}`,
        invitee.token,
      );
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as PreviewBody;
      expect(body.eligible).toBe(false);
      expect(body.reason).toBe("invitee_is_member");
      expect(body.message).toBe(INVITEE_MESSAGES.invitee_is_member);
    });

    it("invitador sin cupo: eligible=false inviter_quota_exhausted", async () => {
      await setInvitationSettings(app.db, ctx.tenant, { monthlyQuota: 1 });
      const inviter = await createInviterWithCode(ctx);
      const otro = await createInvitee();
      await createInvitationRow(ctx, {
        inviterId: inviter.id,
        invitedUserId: otro.id,
        branchId: arBranch.id,
      });
      const invitee = await createInvitee();

      const res = await get(
        `${ELIGIBILITY}?code=${inviter.code}`,
        invitee.token,
      );
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as PreviewBody;
      expect(body.eligible).toBe(false);
      expect(body.reason).toBe("inviter_quota_exhausted");
    });

    it("invitador sin membresía vigente: eligible=false inviter_not_member", async () => {
      const inviter = await createInviterWithCode(ctx);
      await app.db
        .delete(schema.subscriptions)
        .where(
          and(
            tenantWhere(schema.subscriptions, ctx.tenant),
            eq(schema.subscriptions.userId, inviter.id),
          ),
        );
      const invitee = await createInvitee();

      const res = await get(
        `${ELIGIBILITY}?code=${inviter.code}`,
        invitee.token,
      );
      expect((JSON.parse(res.body) as PreviewBody).reason).toBe(
        "inviter_not_member",
      );
    });

    it("el código del propio socio: eligible=false self_invite", async () => {
      const invitee = await createInvitee();
      const code = `AUTO-${Date.now().toString(36)}`.toUpperCase().slice(0, 16);
      await app.db
        .update(schema.users)
        .set({ referralCode: code })
        .where(
          and(
            tenantWhere(schema.users, ctx.tenant),
            eq(schema.users.id, invitee.id),
          ),
        );

      const res = await get(`${ELIGIBILITY}?code=${code}`, invitee.token);
      expect(res.statusCode).toBe(200);
      expect((JSON.parse(res.body) as PreviewBody).reason).toBe("self_invite");
    });

    it("sede destino virtual o inexistente: 400 y 404; sede de otro país para quien ya entrena en una física: 400", async () => {
      const esBranch = await ensurePhysicalBranch(ctx, "ES");
      const inviter = await createInviterWithCode(ctx);
      const invitee = await createInvitee();

      expect(
        (
          await get(
            `${ELIGIBILITY}?code=${inviter.code}&branchId=${virtualBranch.id}`,
            invitee.token,
          )
        ).statusCode,
      ).toBe(400);
      expect(
        (
          await get(
            `${ELIGIBILITY}?code=${inviter.code}&branchId=2147483000`,
            invitee.token,
          )
        ).statusCode,
      ).toBe(404);

      await moveToBranch(invitee.id, arBranch.id);
      expect(
        (
          await get(
            `${ELIGIBILITY}?code=${inviter.code}&branchId=${esBranch.id}`,
            invitee.token,
          )
        ).statusCode,
      ).toBe(400);
    });

    it("usa las mismas reglas que activate: lo que dice el GET es lo que hace el POST", async () => {
      const inviter = await createInviterWithCode(ctx);
      const invitee = await createInvitee();
      const plan = await createMembershipPlan(ctx);
      await createActiveSub(ctx, { userId: invitee.id, planId: plan.id });

      const preview = JSON.parse(
        (await get(`${ELIGIBILITY}?code=${inviter.code}`, invitee.token)).body,
      ) as PreviewBody;
      const activate = await post(
        ACTIVATE,
        activateBody(inviter.code),
        invitee.token,
      );
      expect(activate.statusCode).toBe(409);
      expect((JSON.parse(activate.body) as { reason: string }).reason).toBe(
        preview.reason,
      );
    });
  });

  // ─── POST activate ─────────────────────────────────────────────────────

  describe("POST /invitations/activate", () => {
    it("201: activa para el usuario del TOKEN, con accesos y vencimiento", async () => {
      const inviter = await createInviterWithCode(ctx);
      const invitee = await createInvitee();
      const bystander = await createInvitee();
      const body = activateBody(inviter.code, { dni: "30111222" });

      const res = await post(ACTIVATE, body, invitee.token);

      expect(res.statusCode, res.body).toBe(201);
      const out = JSON.parse(res.body) as {
        invitationId: number;
        subscriptionId: number;
        accessExpiresOn: string;
        classesBudget: number | null;
        branchId: number;
      };
      expect(out.branchId).toBe(arBranch.id);
      expect(out.accessExpiresOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(out.classesBudget).toBe(4);
      expect(out.subscriptionId).toBeGreaterThan(0);

      const rows = await invitationRows();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        id: out.invitationId,
        invitedUserId: invitee.id,
        inviterId: inviter.id,
        channel: "self_service",
        status: "active",
        subscriptionId: out.subscriptionId,
      });
      // El otro socio no fue tocado.
      expect(rows.some((r) => r.invitedUserId === bystander.id)).toBe(false);

      const [user] = await app.db
        .select({
          branchId: schema.users.branchId,
          phone: schema.users.phone,
          status: schema.users.status,
        })
        .from(schema.users)
        .where(
          and(
            tenantWhere(schema.users, ctx.tenant),
            eq(schema.users.id, invitee.id),
          ),
        );
      expect(user?.branchId).toBe(arBranch.id);
      expect(user?.status).toBe("prueba");
      expect(user?.phone).toContain(String(body.phone).slice(-10));
    });

    it("T-194-34: invitedUserId / inviterId / userId en el body => 400 y nada se activa", async () => {
      const inviter = await createInviterWithCode(ctx);
      const invitee = await createInvitee();
      const victim = await createInvitee();

      for (const extra of [
        { invitedUserId: victim.id },
        { inviterId: inviter.id },
        { userId: victim.id },
      ]) {
        const res = await post(
          ACTIVATE,
          activateBody(inviter.code, extra),
          invitee.token,
        );
        expect(res.statusCode, JSON.stringify(extra)).toBe(400);
      }
      expect(await invitationRows()).toHaveLength(0);
    });

    it("validación del body: sin phone, phone corto, branchId no numérico, dni largo, code inválido => 400", async () => {
      const inviter = await createInviterWithCode(ctx);
      const invitee = await createInvitee();
      const valid = activateBody(inviter.code);
      const { phone: _omit, ...sinPhone } = valid;
      void _omit;

      const casos: Array<Record<string, unknown>> = [
        sinPhone,
        { ...valid, phone: "123" },
        { ...valid, branchId: "abc" },
        { ...valid, branchId: 0 },
        { ...valid, dni: "1".repeat(21) },
        { ...valid, code: "no valido!" },
      ];
      for (const caso of casos) {
        const res = await post(ACTIVATE, caso, invitee.token);
        expect(res.statusCode, JSON.stringify(caso)).toBe(400);
      }
      expect(await invitationRows()).toHaveLength(0);
    });

    it("teléfono sin dígitos: 400 phone_required (no un 409)", async () => {
      const inviter = await createInviterWithCode(ctx);
      const invitee = await createInvitee();

      const res = await post(
        ACTIVATE,
        activateBody(inviter.code, { phone: "--------" }),
        invitee.token,
      );
      expect(res.statusCode).toBe(400);
      expect((JSON.parse(res.body) as { reason: string }).reason).toBe(
        "phone_required",
      );
    });

    it("cupo agotado: 409 inviter_quota_exhausted con mensaje y sin fila nueva", async () => {
      await setInvitationSettings(app.db, ctx.tenant, { monthlyQuota: 1 });
      const inviter = await createInviterWithCode(ctx);
      const primero = await createInvitee();
      const segundo = await createInvitee();

      const ok = await post(
        ACTIVATE,
        activateBody(inviter.code),
        primero.token,
      );
      expect(ok.statusCode, ok.body).toBe(201);

      const res = await post(
        ACTIVATE,
        activateBody(inviter.code),
        segundo.token,
      );
      expect(res.statusCode).toBe(409);
      const body = JSON.parse(res.body) as {
        reason: string;
        message: string;
        error: string;
      };
      expect(body.reason).toBe("inviter_quota_exhausted");
      expect(body.message).toBe(INVITEE_MESSAGES.inviter_quota_exhausted);
      expect(body.error).toBe("Conflicto");
      expect(await invitationRows()).toHaveLength(1);
    });

    it("código inexistente: 404 inviter_not_found", async () => {
      const invitee = await createInvitee();
      const res = await post(
        ACTIVATE,
        activateBody("NOEXISTE-0000"),
        invitee.token,
      );
      expect(res.statusCode).toBe(404);
      expect((JSON.parse(res.body) as { reason: string }).reason).toBe(
        "inviter_not_found",
      );
    });

    it("sin token: 401", async () => {
      const inviter = await createInviterWithCode(ctx);
      const res = await post(ACTIVATE, activateBody(inviter.code));
      expect(res.statusCode).toBe(401);
      expect(await invitationRows()).toHaveLength(0);
    });

    it("segunda activación del mismo socio: 409 invitee_recent_invitation (no duplica)", async () => {
      const inviter = await createInviterWithCode(ctx);
      const invitee = await createInvitee();
      const phone = uniquePhone10();

      const first = await post(
        ACTIVATE,
        activateBody(inviter.code, { phone }),
        invitee.token,
      );
      expect(first.statusCode, first.body).toBe(201);
      const second = await post(
        ACTIVATE,
        activateBody(inviter.code, { phone }),
        invitee.token,
      );
      expect(second.statusCode).toBe(409);
      expect((JSON.parse(second.body) as { reason: string }).reason).toBe(
        "invitee_recent_invitation",
      );
      expect(await invitationRows()).toHaveLength(1);
    });

    it("teléfono de otra cuenta: 409 phone_taken sin revelar a quién pertenece", async () => {
      const inviter = await createInviterWithCode(ctx);
      const invitee = await createInvitee();
      const phone = uniquePhone10();
      const other = await createInvitee();
      await app.db
        .update(schema.users)
        .set({ phone })
        .where(
          and(
            tenantWhere(schema.users, ctx.tenant),
            eq(schema.users.id, other.id),
          ),
        );

      const res = await post(
        ACTIVATE,
        activateBody(inviter.code, { phone }),
        invitee.token,
      );
      expect(res.statusCode).toBe(409);
      const body = JSON.parse(res.body) as { reason: string; message: string };
      expect(body.reason).toBe("phone_taken");
      expect(body.message).toBe(INVITEE_MESSAGES.phone_taken);
      expect(await invitationRows()).toHaveLength(0);
    });

    it("socio con membresía vigente: 409 invitee_is_member", async () => {
      const inviter = await createInviterWithCode(ctx);
      const invitee = await createInvitee();
      const plan = await createMembershipPlan(ctx);
      await createActiveSub(ctx, { userId: invitee.id, planId: plan.id });

      const res = await post(
        ACTIVATE,
        activateBody(inviter.code),
        invitee.token,
      );
      expect(res.statusCode).toBe(409);
      expect((JSON.parse(res.body) as { reason: string }).reason).toBe(
        "invitee_is_member",
      );
    });

    it("sede virtual o inexistente como destino: 400 y 404", async () => {
      const inviter = await createInviterWithCode(ctx);
      const invitee = await createInvitee();

      const virtual = await post(
        ACTIVATE,
        activateBody(inviter.code, { branchId: virtualBranch.id }),
        invitee.token,
      );
      expect(virtual.statusCode).toBe(400);
      const missing = await post(
        ACTIVATE,
        activateBody(inviter.code, { branchId: 2147483000 }),
        invitee.token,
      );
      expect(missing.statusCode).toBe(404);
      expect(await invitationRows()).toHaveLength(0);
    });

    it("el propio código del socio: 409 self_invite", async () => {
      const invitee = await createInvitee();
      const code = `AUTO-${Date.now().toString(36)}`.toUpperCase().slice(0, 16);
      await app.db
        .update(schema.users)
        .set({ referralCode: code })
        .where(
          and(
            tenantWhere(schema.users, ctx.tenant),
            eq(schema.users.id, invitee.id),
          ),
        );

      const res = await post(ACTIVATE, activateBody(code), invitee.token);
      expect(res.statusCode).toBe(409);
      expect((JSON.parse(res.body) as { reason: string }).reason).toBe(
        "self_invite",
      );
    });
  });

  // ─── ME-04: solo el socio activa por el canal app ─────────────────────

  describe("ME-04: tokens de staff no usan el canal del socio", () => {
    async function staffToken(role: string): Promise<string> {
      const email = `${role}-me04-${Date.now().toString(36)}@test.local`;
      await createStaffUser(app, {
        email,
        password: "pass123456",
        firstName: role,
        lastName: "Me04",
        role,
        branchId: arBranch.id,
      });
      return getAuthToken(app, email, "pass123456");
    }

    it.each(["coach", "recepcion", "gestion"])(
      "%s recibe 403 en eligibility y activate y su ficha no cambia",
      async (role) => {
        const inviter = await createInviterWithCode(ctx);
        const token = await staffToken(role);
        const [before] = await app.db
          .select({
            status: schema.users.status,
            branchId: schema.users.branchId,
            phone: schema.users.phone,
          })
          .from(schema.users)
          .where(
            and(
              tenantWhere(schema.users, ctx.tenant),
              eq(schema.users.role, role as "coach"),
              eq(schema.users.lastName, "Me04"),
            ),
          );

        const preview = await get(`${ELIGIBILITY}?code=${inviter.code}`, token);
        const activate = await post(
          ACTIVATE,
          activateBody(inviter.code),
          token,
        );

        expect(preview.statusCode).toBe(403);
        expect(activate.statusCode).toBe(403);
        expect(await invitationRows()).toHaveLength(0);
        const [after] = await app.db
          .select({
            status: schema.users.status,
            branchId: schema.users.branchId,
            phone: schema.users.phone,
          })
          .from(schema.users)
          .where(
            and(
              tenantWhere(schema.users, ctx.tenant),
              eq(schema.users.role, role as "coach"),
              eq(schema.users.lastName, "Me04"),
            ),
          );
        expect(after).toEqual(before);
      },
    );

    it("un socio sigue pudiendo consultar y activar (control)", async () => {
      const inviter = await createInviterWithCode(ctx);
      const invitee = await createInvitee();
      expect(
        (await get(`${ELIGIBILITY}?code=${inviter.code}`, invitee.token))
          .statusCode,
      ).toBe(200);
      expect(
        (await post(ACTIVATE, activateBody(inviter.code), invitee.token))
          .statusCode,
      ).toBe(201);
    });
  });

  // ─── ME-03: el invitado no ve el estado del invitador ─────────────────

  describe("ME-03: copy para el invitado", () => {
    it("invitador sin cupo: el mensaje del invitado es genérico y no menciona cupo ni membresía", async () => {
      await setInvitationSettings(app.db, ctx.tenant, { monthlyQuota: 1 });
      const inviter = await createInviterWithCode(ctx);
      const otro = await createInvitee();
      await createInvitationRow(ctx, {
        inviterId: inviter.id,
        invitedUserId: otro.id,
        branchId: arBranch.id,
      });
      const invitee = await createInvitee();

      const preview = JSON.parse(
        (await get(`${ELIGIBILITY}?code=${inviter.code}`, invitee.token)).body,
      ) as PreviewBody;
      expect(preview.reason).toBe("inviter_quota_exhausted");
      expect(preview.message).toBe(INVITEE_MESSAGES.inviter_quota_exhausted);
      expect(preview.message).not.toMatch(
        /cupo|invitaciones de este mes|membres/i,
      );
      expect(preview.message).not.toBe(
        INELIGIBLE_MESSAGES.inviter_quota_exhausted,
      );

      const activate = await post(
        ACTIVATE,
        activateBody(inviter.code),
        invitee.token,
      );
      expect(activate.statusCode).toBe(409);
      expect((JSON.parse(activate.body) as { message: string }).message).toBe(
        INVITEE_MESSAGES.inviter_quota_exhausted,
      );
    });

    it("invitador sin membresía: mismo mensaje genérico, sin revelar que venció", async () => {
      const inviter = await createInviterWithCode(ctx);
      await app.db
        .delete(schema.subscriptions)
        .where(
          and(
            tenantWhere(schema.subscriptions, ctx.tenant),
            eq(schema.subscriptions.userId, inviter.id),
          ),
        );
      const invitee = await createInvitee();

      const preview = JSON.parse(
        (await get(`${ELIGIBILITY}?code=${inviter.code}`, invitee.token)).body,
      ) as PreviewBody;
      expect(preview.reason).toBe("inviter_not_member");
      expect(preview.message).toBe(INVITEE_MESSAGES.inviter_not_member);
      expect(preview.message).not.toMatch(/membres|renov/i);
      expect(INVITEE_MESSAGES.inviter_not_member).toBe(
        INVITEE_MESSAGES.inviter_quota_exhausted,
      );
    });

    it("los motivos del propio invitado van en segunda persona", () => {
      expect(INVITEE_MESSAGES.invitee_is_member).toMatch(/^Ya tenés/);
      expect(INVITEE_MESSAGES.invitee_recent_member).toMatch(/Tuviste/);
      expect(INVITEE_MESSAGES.invitee_recent_invitation).toMatch(
        /Ya recibiste/,
      );
      expect(INVITEE_MESSAGES.self_invite).toMatch(/tu propio/);
    });

    it("el copy del staff conserva el detalle (el canal asistido no cambia)", () => {
      expect(INELIGIBLE_MESSAGES.inviter_quota_exhausted).toMatch(
        /invitaciones de este mes/,
      );
      expect(INELIGIBLE_MESSAGES.inviter_not_member).toMatch(
        /membresía vigente/,
      );
    });
  });
});
