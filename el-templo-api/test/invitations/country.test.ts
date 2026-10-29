/**
 * F1 — los países nunca se cruzan (decisión del dueño del producto): el invitado
 * solo puede activar en sedes del país del INVITADOR, en todos los canales.
 *
 *   GET  /api/members/referrals/invitations/eligibility   (sedes y motivo)
 *   POST /api/members/referrals/invitations/activate      (app)
 *   POST /api/admin/members/:userId/invitations           (recepción, canal asistido)
 *   POST /api/admin/members/trial con `inviterId`         ("Nuevo en Prueba" + "Lo invita")
 *
 * HTTP contra MySQL real por worker. Sin ids hardcodeados.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  cleanAllTestData,
  createTestApp,
  createTestMember,
  getAuthToken,
} from "../helpers";
import * as schema from "../../src/db/schema";
import { tenantWhere } from "../../src/modules/shared/tenant";
import {
  BRANCH_OTHER_COUNTRY_MESSAGE,
  INELIGIBLE_MESSAGES,
  INVITEE_MESSAGES,
} from "../../src/modules/referrals/invitation-types";
import {
  buildInvitationServices,
  createInviterWithCode,
  createMemberInPhysicalBranch,
  createMemberInVirtualBranch,
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
const MEMBERS = "/api/admin/members";

interface PreviewBody {
  eligible: boolean;
  reason: string | null;
  message: string | null;
  branches: Array<{ id: number; name: string; country: string }>;
  accessesBudget: number | null;
}

describe("F1 — los países nunca se cruzan en las invitaciones", () => {
  let app: FastifyInstance;
  let ctx: InvitationsFixtureCtx;
  let arBranch: { id: number; timezone: string };
  let esBranch: { id: number; timezone: string };
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
    esBranch = await ensurePhysicalBranch(ctx, "ES");
    virtualBranch = await ensureVirtualBranch(ctx);
    // `subscription_plans` se vacía con cleanAllTestData: crear DESPUÉS.
    await createTrialPlan(ctx, { country: "AR", classesPerWeek: 4 });
    await createTrialPlan(ctx, { country: "ES", classesPerWeek: 2 });
  });

  // ─── helpers ───────────────────────────────────────────────────────────

  async function createInvitee(
    branchId: number,
  ): Promise<{ id: number; token: string }> {
    const member = await createTestMember(app, { branchId });
    return { id: member.id, token: member.token };
  }

  function get(url: string, token: string) {
    return app.inject({
      method: "GET",
      url,
      headers: { authorization: `Bearer ${token}` },
    });
  }

  function post(url: string, token: string, payload: Record<string, unknown>) {
    return app.inject({
      method: "POST",
      url,
      payload,
      headers: { authorization: `Bearer ${token}` },
    });
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

  async function usersByPhone(phone: string): Promise<number> {
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

  async function ownerToken(): Promise<string> {
    return getAuthToken(app, "admin@test.com", "adminpass123");
  }

  // ─── GET eligibility ───────────────────────────────────────────────────

  describe("GET /invitations/eligibility", () => {
    it("invitador de AR: solo se ofrecen sedes físicas activas de AR, y el plan es el de AR", async () => {
      const inviter = await createInviterWithCode(ctx, { country: "AR" });
      const invitee = await createInvitee(virtualBranch.id);

      const res = await get(
        `${ELIGIBILITY}?code=${inviter.code}`,
        invitee.token,
      );

      expect(res.statusCode, res.body).toBe(200);
      const body = JSON.parse(res.body) as PreviewBody;
      expect(body.eligible).toBe(true);
      expect(body.branches.length).toBeGreaterThan(0);
      expect(body.branches.every((b) => b.country === "AR")).toBe(true);
      expect(body.branches.map((b) => b.id)).toContain(arBranch.id);
      expect(body.branches.map((b) => b.id)).not.toContain(esBranch.id);
      expect(body.branches.map((b) => b.id)).not.toContain(virtualBranch.id);
      expect(body.accessesBudget).toBe(4);
    });

    it("invitador de ES: solo sedes de ES (aunque el invitado esté en la sede virtual) y el plan de ES", async () => {
      const inviter = await createInviterWithCode(ctx, { country: "ES" });
      const invitee = await createInvitee(virtualBranch.id);

      const res = await get(
        `${ELIGIBILITY}?code=${inviter.code}`,
        invitee.token,
      );

      expect(res.statusCode, res.body).toBe(200);
      const body = JSON.parse(res.body) as PreviewBody;
      expect(body.eligible).toBe(true);
      expect(body.branches.length).toBeGreaterThan(0);
      expect(body.branches.every((b) => b.country === "ES")).toBe(true);
      expect(body.branches.map((b) => b.id)).toContain(esBranch.id);
      expect(body.branches.map((b) => b.id)).not.toContain(arBranch.id);
      expect(body.accessesBudget).toBe(2);
    });

    it("invitado que ya entrena en una sede física de OTRO país: invitee_other_country con el copy del invitado", async () => {
      const inviter = await createInviterWithCode(ctx, { country: "AR" });
      const invitee = await createInvitee(esBranch.id);

      const res = await get(
        `${ELIGIBILITY}?code=${inviter.code}`,
        invitee.token,
      );

      expect(res.statusCode, res.body).toBe(200);
      const body = JSON.parse(res.body) as PreviewBody;
      expect(body.eligible).toBe(false);
      expect(body.reason).toBe("invitee_other_country");
      expect(body.message).toBe(INVITEE_MESSAGES.invitee_other_country);
      expect(body.message).toMatch(/^Ya entrenás en una sede de otro país/);
      // Las sedes que se ofrecen siguen siendo las del país del invitador.
      expect(body.branches.every((b) => b.country === "AR")).toBe(true);
    });

    it("invitado en una sede física del MISMO país del invitador: elegible", async () => {
      const inviter = await createInviterWithCode(ctx, { country: "ES" });
      const invitee = await createInvitee(esBranch.id);

      const res = await get(
        `${ELIGIBILITY}?code=${inviter.code}`,
        invitee.token,
      );

      const body = JSON.parse(res.body) as PreviewBody;
      expect(body.reason).toBeNull();
      expect(body.eligible).toBe(true);
    });

    it("branchId de otro país que el del invitador: 400 con el mensaje de la regla (también si el invitado está en la virtual)", async () => {
      const inviter = await createInviterWithCode(ctx, { country: "AR" });
      const invitee = await createInvitee(virtualBranch.id);

      const res = await get(
        `${ELIGIBILITY}?code=${inviter.code}&branchId=${esBranch.id}`,
        invitee.token,
      );

      expect(res.statusCode, res.body).toBe(400);
      expect(JSON.parse(res.body).message).toBe(BRANCH_OTHER_COUNTRY_MESSAGE);
    });

    it("branchId del país del invitador: 200", async () => {
      const inviter = await createInviterWithCode(ctx, { country: "ES" });
      const invitee = await createInvitee(virtualBranch.id);

      const res = await get(
        `${ELIGIBILITY}?code=${inviter.code}&branchId=${esBranch.id}`,
        invitee.token,
      );

      expect(res.statusCode, res.body).toBe(200);
    });
  });

  // ─── POST activate (app) ───────────────────────────────────────────────

  describe("POST /invitations/activate", () => {
    it("sede de otro país que el invitador: 400, ninguna invitación y el invitado no se muda", async () => {
      const inviter = await createInviterWithCode(ctx, { country: "AR" });
      const invitee = await createInvitee(virtualBranch.id);

      const res = await post(ACTIVATE, invitee.token, {
        code: inviter.code,
        branchId: esBranch.id,
        phone: uniquePhone10(),
      });

      expect(res.statusCode, res.body).toBe(400);
      expect(JSON.parse(res.body).message).toBe(BRANCH_OTHER_COUNTRY_MESSAGE);
      expect(await invitationRows(invitee.id)).toHaveLength(0);
    });

    it("invitado de la sede virtual con invitador de ES: activa en una sede de ES y recibe el plan de ES", async () => {
      const inviter = await createInviterWithCode(ctx, { country: "ES" });
      const invitee = await createInvitee(virtualBranch.id);

      const res = await post(ACTIVATE, invitee.token, {
        code: inviter.code,
        branchId: esBranch.id,
        phone: uniquePhone10(),
      });

      expect(res.statusCode, res.body).toBe(201);
      const body = JSON.parse(res.body) as {
        branchId: number;
        classesBudget: number;
      };
      expect(body.branchId).toBe(esBranch.id);
      expect(body.classesBudget).toBe(2);
    });

    it("invitado que ya entrena en una sede física de otro país: 409 invitee_other_country aunque elija una sede del país del invitador", async () => {
      const inviter = await createInviterWithCode(ctx, { country: "AR" });
      const invitee = await createInvitee(esBranch.id);

      const res = await post(ACTIVATE, invitee.token, {
        code: inviter.code,
        branchId: arBranch.id,
        phone: uniquePhone10(),
      });

      expect(res.statusCode, res.body).toBe(409);
      const body = JSON.parse(res.body) as { reason: string; message: string };
      expect(body.reason).toBe("invitee_other_country");
      expect(body.message).toBe(INVITEE_MESSAGES.invitee_other_country);
      expect(await invitationRows(invitee.id)).toHaveLength(0);
    });
  });

  // ─── Canal asistido (recepción) ────────────────────────────────────────

  describe("canal asistido", () => {
    it("POST /:userId/invitations con sede de otro país que el invitador: 400 y sin fila", async () => {
      const token = await ownerToken();
      const inviter = await createInviterWithCode(ctx, { country: "AR" });
      const lead = await createMemberInVirtualBranch(ctx, {
        status: "prueba",
        phone: uniquePhone10(),
      });

      const res = await post(`${MEMBERS}/${lead.id}/invitations`, token, {
        inviterId: inviter.id,
        branchId: esBranch.id,
      });

      expect(res.statusCode, res.body).toBe(400);
      expect(JSON.parse(res.body).message).toBe(BRANCH_OTHER_COUNTRY_MESSAGE);
      expect(await invitationRows(lead.id)).toHaveLength(0);
    });

    it("POST /:userId/invitations con un alumno en una sede física de otro país: 409 invitee_other_country con el copy de staff", async () => {
      const token = await ownerToken();
      const inviter = await createInviterWithCode(ctx, { country: "AR" });
      const lead = await createMemberInPhysicalBranch(ctx, {
        country: "ES",
        status: "prueba",
        phone: uniquePhone10(),
      });

      const res = await post(`${MEMBERS}/${lead.id}/invitations`, token, {
        inviterId: inviter.id,
        branchId: arBranch.id,
      });

      expect(res.statusCode, res.body).toBe(409);
      const body = JSON.parse(res.body) as { reason: string; message: string };
      expect(body.reason).toBe("invitee_other_country");
      expect(body.message).toBe(INELIGIBLE_MESSAGES.invitee_other_country);
      expect(await invitationRows(lead.id)).toHaveLength(0);
    });

    it("POST /:userId/invitations en el mismo país: 201", async () => {
      const token = await ownerToken();
      const inviter = await createInviterWithCode(ctx, { country: "ES" });
      const lead = await createMemberInVirtualBranch(ctx, {
        status: "prueba",
        phone: uniquePhone10(),
      });

      const res = await post(`${MEMBERS}/${lead.id}/invitations`, token, {
        inviterId: inviter.id,
        branchId: esBranch.id,
      });

      expect(res.statusCode, res.body).toBe(201);
      expect((await invitationRows(lead.id))[0].branchId).toBe(esBranch.id);
    });

    it("POST /trial con inviterId y sede de otro país: 400 y NO se crea el lead", async () => {
      const token = await ownerToken();
      const inviter = await createInviterWithCode(ctx, { country: "AR" });
      const phone = uniquePhone10();

      const res = await post(`${MEMBERS}/trial`, token, {
        firstName: "Nuevo",
        lastName: "Prueba",
        phone,
        branchId: esBranch.id,
        inviterId: inviter.id,
      });

      expect(res.statusCode, res.body).toBe(400);
      expect(JSON.parse(res.body).message).toBe(BRANCH_OTHER_COUNTRY_MESSAGE);
      expect(await usersByPhone(phone)).toBe(0);
    });

    it("POST /trial con inviterId y sede del país del invitador: 201 con la invitación", async () => {
      const token = await ownerToken();
      const inviter = await createInviterWithCode(ctx, { country: "ES" });

      const res = await post(`${MEMBERS}/trial`, token, {
        firstName: "Nuevo",
        lastName: "Prueba",
        phone: uniquePhone10(),
        branchId: esBranch.id,
        inviterId: inviter.id,
      });

      expect(res.statusCode, res.body).toBe(201);
      const out = JSON.parse(res.body) as {
        invitationError: unknown;
        invitation: { branchId: number; classesBudget: number };
      };
      expect(out.invitationError).toBeNull();
      expect(out.invitation.branchId).toBe(esBranch.id);
      expect(out.invitation.classesBudget).toBe(2);
    });
  });

  // ─── Regla compartida ──────────────────────────────────────────────────

  it("assertBranchInInviterCountry: misma regla que usa activate (400 con el mismo mensaje, 404 si no hay invitador)", async () => {
    const { invitationService } = buildInvitationServices(app);
    const inviter = await createInviterWithCode(ctx, { country: "AR" });

    await expect(
      invitationService.assertBranchInInviterCountry(
        ctx.tenant,
        inviter.id,
        arBranch.id,
      ),
    ).resolves.toBeUndefined();
    await expect(
      invitationService.assertBranchInInviterCountry(
        ctx.tenant,
        inviter.id,
        esBranch.id,
      ),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: BRANCH_OTHER_COUNTRY_MESSAGE,
    });
    await expect(
      invitationService.assertBranchInInviterCountry(
        ctx.tenant,
        2_000_000_000,
        arBranch.id,
      ),
    ).rejects.toMatchObject({ reason: "inviter_not_found" });
  });
});
