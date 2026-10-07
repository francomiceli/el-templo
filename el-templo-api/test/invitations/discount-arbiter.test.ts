/**
 * Fase 194-14 — núcleo del árbitro de descuentos (COBROS).
 *
 * Secciones:
 *  1. Vínculo que nace al comprar (D-05/D-13/D-26c): `findLinkableInvitation` y
 *     `materializeInvitationLink` (integración, DB real).
 *  2. Funciones PURAS del árbitro (`pickCoreCompetitor`, `applyArbiterResult`,
 *     `capInvitationAmount`): tabla de casos, sin DB.
 *  3. `resolveInvitationDiscountCandidate` (D-08/D-09/D-10b/D-10c/D-20/D-26a).
 *
 * Fechas siempre relativas a `todayInTz(tz de la sede)`; nunca ids hardcodeados.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { createTestApp, cleanAllTestData } from "../helpers";
import * as schema from "../../src/db/schema";
import { addDays, todayInTz } from "../../src/modules/shared/date-utils";
import { tenantWhere } from "../../src/modules/shared/tenant";
import {
  findLinkableInvitation,
  materializeInvitationLink,
  notifyInviterLinkActivated,
} from "../../src/modules/referrals/invitation-link";
import {
  createInvitationRow,
  createInviterWithCode,
  createMemberInPhysicalBranch,
  fixtureCtx,
  resetInvitationSettings,
  type InvitationsFixtureCtx,
} from "./_helpers";

const TZ_AR = "America/Argentina/Buenos_Aires";

let app: FastifyInstance;
let ctx: InvitationsFixtureCtx;

beforeAll(async () => {
  app = await createTestApp();
  ctx = fixtureCtx(app);
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await cleanAllTestData(app);
  await resetInvitationSettings(ctx);
});

/** Filas de `referrals` del invitado (UNIQUE: a lo sumo una). */
async function referralRowsOf(userId: number) {
  return app.db
    .select()
    .from(schema.referrals)
    .where(
      and(
        tenantWhere(schema.referrals, ctx.tenant),
        eq(schema.referrals.referredId, userId),
      ),
    );
}

async function referredByOf(userId: number): Promise<number | null> {
  const [row] = await app.db
    .select({ referredBy: schema.users.referredBy })
    .from(schema.users)
    .where(
      and(tenantWhere(schema.users, ctx.tenant), eq(schema.users.id, userId)),
    );
  return row?.referredBy ?? null;
}

const LATE_WINDOW = 30;

describe("findLinkableInvitation (D-05 / D-13 / D-26c)", () => {
  it("invitación activa vigente -> candidato con invitador y canal", async () => {
    const inviter = await createInviterWithCode(ctx);
    const payer = await createMemberInPhysicalBranch(ctx, { status: "prueba" });
    const inv = await createInvitationRow(ctx, {
      inviterId: inviter.id,
      invitedUserId: payer.id,
      branchId: payer.branchId,
      channel: "assisted",
    });
    expect(
      await findLinkableInvitation(app.db, ctx.tenant, payer.id, LATE_WINDOW),
    ).toEqual({
      invitationId: inv.id,
      inviterId: inviter.id,
      channel: "assisted",
    });
  });

  it("vencida hace 20 días con ventana de 30 -> sigue dando vínculo; hace 40 -> no", async () => {
    const inviter = await createInviterWithCode(ctx);
    const today = todayInTz(TZ_AR);
    const recent = await createMemberInPhysicalBranch(ctx, { status: "inactivo" });
    await createInvitationRow(ctx, {
      inviterId: inviter.id,
      invitedUserId: recent.id,
      branchId: recent.branchId,
      accessStartsOn: addDays(today, -30),
      accessExpiresOn: addDays(today, -20),
    });
    const old = await createMemberInPhysicalBranch(ctx, { status: "inactivo" });
    await createInvitationRow(ctx, {
      inviterId: inviter.id,
      invitedUserId: old.id,
      branchId: old.branchId,
      accessStartsOn: addDays(today, -50),
      accessExpiresOn: addDays(today, -40),
    });
    expect(
      await findLinkableInvitation(app.db, ctx.tenant, recent.id, LATE_WINDOW),
    ).not.toBeNull();
    expect(
      await findLinkableInvitation(app.db, ctx.tenant, old.id, LATE_WINDOW),
    ).toBeNull();
  });

  it("el borde de la ventana: vence hace exactamente 30 días todavía vincula; hace 31 no", async () => {
    const inviter = await createInviterWithCode(ctx);
    const today = todayInTz(TZ_AR);
    const edge = await createMemberInPhysicalBranch(ctx, { status: "inactivo" });
    await createInvitationRow(ctx, {
      inviterId: inviter.id,
      invitedUserId: edge.id,
      branchId: edge.branchId,
      accessStartsOn: addDays(today, -40),
      accessExpiresOn: addDays(today, -LATE_WINDOW),
    });
    const past = await createMemberInPhysicalBranch(ctx, { status: "inactivo" });
    await createInvitationRow(ctx, {
      inviterId: inviter.id,
      invitedUserId: past.id,
      branchId: past.branchId,
      accessStartsOn: addDays(today, -41),
      accessExpiresOn: addDays(today, -(LATE_WINDOW + 1)),
    });
    expect(
      await findLinkableInvitation(app.db, ctx.tenant, edge.id, LATE_WINDOW),
    ).not.toBeNull();
    expect(
      await findLinkableInvitation(app.db, ctx.tenant, past.id, LATE_WINDOW),
    ).toBeNull();
  });

  it("una invitación anulada no da vínculo", async () => {
    const inviter = await createInviterWithCode(ctx);
    const payer = await createMemberInPhysicalBranch(ctx, { status: "inactivo" });
    await createInvitationRow(ctx, {
      inviterId: inviter.id,
      invitedUserId: payer.id,
      branchId: payer.branchId,
      status: "voided",
    });
    expect(
      await findLinkableInvitation(app.db, ctx.tenant, payer.id, LATE_WINDOW),
    ).toBeNull();
  });

  it("con dos invitaciones activas gana la más reciente (D-05)", async () => {
    const first = await createInviterWithCode(ctx);
    const second = await createInviterWithCode(ctx);
    const payer = await createMemberInPhysicalBranch(ctx, { status: "prueba" });
    await createInvitationRow(ctx, {
      inviterId: first.id,
      invitedUserId: payer.id,
      branchId: payer.branchId,
      activatedAt: new Date(Date.now() - 40 * 24 * 3600 * 1000),
    });
    const recent = await createInvitationRow(ctx, {
      inviterId: second.id,
      invitedUserId: payer.id,
      branchId: payer.branchId,
      activatedAt: new Date(Date.now() - 24 * 3600 * 1000),
    });
    const link = await findLinkableInvitation(
      app.db,
      ctx.tenant,
      payer.id,
      LATE_WINDOW,
    );
    expect(link?.invitationId).toBe(recent.id);
    expect(link?.inviterId).toBe(second.id);
  });

  it("D-26c: si el pagador ya tiene fila en referrals no se ofrece un segundo vínculo", async () => {
    const original = await createInviterWithCode(ctx);
    const newer = await createInviterWithCode(ctx);
    const payer = await createMemberInPhysicalBranch(ctx, { status: "prueba" });
    await createInvitationRow(ctx, {
      inviterId: newer.id,
      invitedUserId: payer.id,
      branchId: payer.branchId,
    });
    await materializeInvitationLink(
      app.db,
      ctx.tenant,
      app.log,
      { invitationId: 0, inviterId: original.id, channel: "assisted" },
      payer.id,
    );
    expect(
      await findLinkableInvitation(app.db, ctx.tenant, payer.id, LATE_WINDOW),
    ).toBeNull();
  });
});

describe("materializeInvitationLink (D-05 / D-26c)", () => {
  it("crea referrals qualified con canal, copy_variant del invitador, qualified_at y espeja users.referred_by", async () => {
    const inviter = await createInviterWithCode(ctx);
    const payer = await createMemberInPhysicalBranch(ctx, { status: "prueba" });
    const created = await materializeInvitationLink(
      app.db,
      ctx.tenant,
      app.log,
      { invitationId: 1, inviterId: inviter.id, channel: "assisted" },
      payer.id,
    );
    expect(created).toBe(true);

    const rows = await referralRowsOf(payer.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].referrerId).toBe(inviter.id);
    expect(rows[0].status).toBe("qualified");
    expect(rows[0].attributionChannel).toBe("assisted");
    expect(rows[0].copyVariant).toBe(inviter.id % 2 === 0 ? "A" : "B");
    expect(rows[0].qualifiedAt).not.toBeNull();
    expect(Math.abs(Date.now() - (rows[0].qualifiedAt as Date).getTime())).toBeLessThan(
      60_000,
    );
    expect(await referredByOf(payer.id)).toBe(inviter.id);
  });

  it("canal self_service se conserva tal cual", async () => {
    const inviter = await createInviterWithCode(ctx);
    const payer = await createMemberInPhysicalBranch(ctx, { status: "prueba" });
    await materializeInvitationLink(
      app.db,
      ctx.tenant,
      app.log,
      { invitationId: 1, inviterId: inviter.id, channel: "self_service" },
      payer.id,
    );
    expect((await referralRowsOf(payer.id))[0].attributionChannel).toBe(
      "self_service",
    );
  });

  it("es idempotente: la segunda llamada no lanza, no duplica y conserva el vínculo original (carrera / D-26c)", async () => {
    const original = await createInviterWithCode(ctx);
    const other = await createInviterWithCode(ctx);
    const payer = await createMemberInPhysicalBranch(ctx, { status: "prueba" });
    expect(
      await materializeInvitationLink(
        app.db,
        ctx.tenant,
        app.log,
        { invitationId: 1, inviterId: original.id, channel: "self_service" },
        payer.id,
      ),
    ).toBe(true);
    await expect(
      materializeInvitationLink(
        app.db,
        ctx.tenant,
        app.log,
        { invitationId: 2, inviterId: other.id, channel: "assisted" },
        payer.id,
      ),
    ).resolves.toBe(false);

    const rows = await referralRowsOf(payer.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].referrerId).toBe(original.id);
    expect(await referredByOf(payer.id)).toBe(original.id);
  });

  it("notifyInviterLinkActivated es best-effort: un pagador inexistente no lanza", async () => {
    const inviter = await createInviterWithCode(ctx);
    await expect(
      notifyInviterLinkActivated(
        app.db,
        app.log,
        ctx.tenant,
        inviter.id,
        2_000_000_000,
      ),
    ).resolves.toBeUndefined();
  });
});
