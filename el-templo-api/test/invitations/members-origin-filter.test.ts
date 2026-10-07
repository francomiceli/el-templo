/**
 * Fase 194-20 Task 2 (D-18) — filtro `origin=invitacion` del listado de alumnos
 * (`GET /api/admin/members`).
 *
 * Contra MySQL real por worker; fechas relativas a `todayInTz(<tz de la sede>)`.
 * Vive en su propio archivo (el plan lo pedía como `describe` de
 * `leads-list.test.ts`): así el commit de la Tarea 1 no queda con un test rojo
 * de código que se entrega en la Tarea 2.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { createTestApp, cleanAllTestData, getAuthToken } from "../helpers";
import { todayInTz } from "../../src/modules/shared/date-utils";
import {
  createInvitedUser,
  createInviterWithCode,
  createMemberInPhysicalBranch,
  createMembershipPlan,
  createTrialPlan,
  ensurePhysicalBranch,
  fixtureCtx,
  type InvitationsFixtureCtx,
  type InvitedUserEnv,
} from "./_helpers";

describe("Fase 194-20 D-18 — filtro origin=invitacion de GET /api/admin/members", () => {
  let app: FastifyInstance;
  let ctx: InvitationsFixtureCtx;
  let ownerToken: string;
  let env: InvitedUserEnv;

  beforeAll(async () => {
    app = await createTestApp();
    ctx = fixtureCtx(app);
    ownerToken = await getAuthToken(app, "admin@test.com", "adminpass123");
  });

  afterAll(async () => {
    await cleanAllTestData(app);
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    const branch = await ensurePhysicalBranch(ctx, "AR");
    env = {
      branchId: branch.id,
      today: todayInTz(branch.timezone),
      trialPlanId: (await createTrialPlan(ctx)).id,
      membershipPlanId: (await createMembershipPlan(ctx)).id,
    };
  });

  async function members(
    query: string,
  ): Promise<{ statusCode: number; ids: number[] }> {
    const res = await app.inject({
      method: "GET",
      url: `/api/admin/members${query}`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    const body = JSON.parse(res.body) as { members?: Array<{ id: number }> };
    return {
      statusCode: res.statusCode,
      ids: (body.members ?? []).map((member) => member.id),
    };
  }

  async function seed() {
    const inviter = await createInviterWithCode(ctx);
    const inPrueba = await createInvitedUser(ctx, env, inviter.id, {});
    const converted = await createInvitedUser(ctx, env, inviter.id, {
      purchase: "vigente",
      converted: true,
    });
    const voided = await createInvitedUser(ctx, env, inviter.id, {
      status: "voided",
    });
    const plain = await createMemberInPhysicalBranch(ctx, {
      status: "prueba",
    });
    return { inviter, inPrueba, converted, voided, plain };
  }

  it("status=prueba&origin=invitacion: solo leads en prueba con invitación activa", async () => {
    const { inPrueba } = await seed();

    const res = await members("?status=prueba&origin=invitacion&limit=100");

    expect(res.statusCode).toBe(200);
    expect(res.ids).toEqual([inPrueba.userId]);
  });

  it("origin=invitacion sin status: todos los que tienen invitación activa (incluye convertidos), sin las anuladas", async () => {
    const { inPrueba, converted, voided, plain } = await seed();

    const res = await members("?origin=invitacion&limit=100");

    expect(res.statusCode).toBe(200);
    expect(new Set(res.ids)).toEqual(
      new Set([inPrueba.userId, converted.userId]),
    );
    expect(res.ids).not.toContain(voided.userId);
    expect(res.ids).not.toContain(plain.id);
  });

  it("origen desconocido -> 400", async () => {
    expect((await members("?origin=otro")).statusCode).toBe(400);
  });

  it("sin origin el listado es el de siempre (trae a todos, con y sin invitación)", async () => {
    const { inviter, inPrueba, converted, voided, plain } = await seed();

    const res = await members("?limit=100");

    expect(res.statusCode).toBe(200);
    for (const id of [
      inviter.id,
      inPrueba.userId,
      converted.userId,
      voided.userId,
      plain.id,
    ]) {
      expect(res.ids).toContain(id);
    }
  });
});
