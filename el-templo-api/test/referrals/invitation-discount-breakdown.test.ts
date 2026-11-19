/**
 * Desglose del descuento por invitación (`computeInvitationDiscountBreakdown`).
 *
 * El desglose es la ÚNICA implementación del cálculo: `computeInvitationDiscountPercent`
 * es un envoltorio que devuelve su `percent`. Estos tests fijan:
 *  - paridad `computeInvitationDiscountPercent === breakdown.percent` en varios
 *    escenarios (con y sin las opciones de simulación del preview);
 *  - el detalle por vínculo (contraparte, lado, cobertura, activo);
 *  - `daysLeft` / `expiresSoon` en los bordes (vence hoy, 7 días, 8 días).
 *
 * Fechas relativas a hoy (UTC, igual que el cálculo); nunca ids hardcodeados.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  createTestApp,
  getAuthToken,
  cleanAllTestData,
  todayStr,
} from "../helpers";
import { createPlan, createMember } from "../subscriptions/_helpers";
import {
  INVITATION_EXPIRES_SOON_DAYS,
  ReferralService,
  type InvitationDiscountOptions,
} from "../../src/modules/referrals/service";
import { addDays } from "../../src/modules/shared/date-utils";
import type { TenantContext } from "../../src/modules/shared/tenant";
import { TENANT_TEMPLO } from "../fixtures/second-tenant";
import { fixtureCtx, resetInvitationSettings } from "../invitations/_helpers";

const CTX: TenantContext = { tenantId: TENANT_TEMPLO };

let app: FastifyInstance;
let adminToken: string;
let service: ReferralService;

beforeAll(async () => {
  app = await createTestApp();
  adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
  service = new ReferralService(app.db, app.log);
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await cleanAllTestData(app);
  await resetInvitationSettings(fixtureCtx(app));
  // 10% por invitado activo y tope 40 explícitos (la siembra local puede traer otro valor).
  await app.db.execute(
    sql`INSERT INTO aura_config (aura_config_source_type, default_amount)
        VALUES ('referral', 10)
        ON DUPLICATE KEY UPDATE default_amount = 10`,
  );
  await app.db.execute(
    sql`INSERT INTO system_settings (setting_key, setting_value)
        VALUES ('referral.max_percent_cap', '40')
        ON DUPLICATE KEY UPDATE setting_value = '40'`,
  );
});

async function link(
  referrerId: number,
  referredId: number,
  status: "qualified" | "pending" | "revoked" = "qualified",
): Promise<void> {
  await app.db.execute(
    sql`INSERT INTO referrals (tenant_id, referrer_id, referred_id, status, attribution_channel, qualified_at)
        VALUES (${TENANT_TEMPLO}, ${referrerId}, ${referredId}, ${status}, 'assisted', NOW())`,
  );
}

/** Cobertura de membresía hasta `endDate` (sub activa directa). */
async function giveCoverage(
  userId: number,
  planId: number,
  endDate: string,
): Promise<void> {
  await app.db.execute(
    sql`INSERT INTO subscriptions (tenant_id, user_id, plan_id, branch_id, subscription_status, start_date, end_date, price_paid, currency, price_type_applied)
        VALUES (${TENANT_TEMPLO}, ${userId}, ${planId}, 1, 'active', ${todayStr()}, ${endDate}, 10000, 'ARS', 'regular')`,
  );
}

/** Corre el envoltorio y el desglose con las mismas opciones y afirma la paridad. */
async function parity(
  userId: number,
  opts?: InvitationDiscountOptions,
): Promise<
  Awaited<ReturnType<ReferralService["computeInvitationDiscountBreakdown"]>>
> {
  const percent = await service.computeInvitationDiscountPercent(
    CTX,
    userId,
    opts,
  );
  const breakdown = await service.computeInvitationDiscountBreakdown(
    CTX,
    userId,
    opts,
  );
  expect(breakdown.percent).toBe(percent);
  return breakdown;
}

describe("computeInvitationDiscountBreakdown — paridad con computeInvitationDiscountPercent", () => {
  it("sin vínculos: 0 y sin links", async () => {
    const m = await createMember(app, { email: "bd-none@test.com" });
    const bd = await parity(m.id);
    expect(bd).toEqual({ percent: 0, links: [] });
  });

  it("contraparte cubierta: suma 10 y el vínculo figura activo", async () => {
    const plan = await createPlan(app, adminToken);
    const referrer = await createMember(app, { email: "bd-c-r@test.com" });
    const referred = await createMember(app, { email: "bd-c-d@test.com" });
    await link(referrer.id, referred.id);
    await giveCoverage(referred.id, plan.id, addDays(todayStr(), 30));

    const bd = await parity(referrer.id);
    expect(bd.percent).toBe(10);
    expect(bd.links).toHaveLength(1);
    expect(bd.links[0]).toMatchObject({
      userId: referred.id,
      side: "invitado",
      percent: 10,
      active: true,
      coveredUntil: addDays(todayStr(), 30),
    });
  });

  it("contraparte vencida: 0, vínculo inactivo con su fecha de vencimiento y sin daysLeft", async () => {
    const plan = await createPlan(app, adminToken);
    const referrer = await createMember(app, { email: "bd-v-r@test.com" });
    const referred = await createMember(app, { email: "bd-v-d@test.com" });
    await link(referrer.id, referred.id);
    await giveCoverage(referred.id, plan.id, addDays(todayStr(), -3));

    const bd = await parity(referrer.id);
    expect(bd.percent).toBe(0);
    expect(bd.links[0]).toMatchObject({
      active: false,
      percent: 0,
      coveredUntil: addDays(todayStr(), -3),
      daysLeft: null,
      expiresSoon: false,
    });
  });

  it("contraparte sin ninguna membresía: coveredUntil null", async () => {
    const referrer = await createMember(app, { email: "bd-n-r@test.com" });
    const referred = await createMember(app, { email: "bd-n-d@test.com" });
    await link(referrer.id, referred.id);

    const bd = await parity(referrer.id);
    expect(bd.percent).toBe(0);
    expect(bd.links[0]).toMatchObject({
      active: false,
      coveredUntil: null,
      daysLeft: null,
      expiresSoon: false,
    });
  });

  it("varios vínculos con tope: el % final es el topeado (parity) y los links muestran lo que aporta cada uno", async () => {
    const plan = await createPlan(app, adminToken);
    const referrer = await createMember(app, { email: "bd-t-r@test.com" });
    const covered: number[] = [];
    for (let i = 0; i < 5; i++) {
      const referred = await createMember(app, {
        email: `bd-t-d${i}@test.com`,
      });
      await link(referrer.id, referred.id);
      await giveCoverage(referred.id, plan.id, addDays(todayStr(), 20));
      covered.push(referred.id);
    }
    // Un sexto sin cobertura: figura inactivo y no suma.
    const lapsed = await createMember(app, { email: "bd-t-lapsed@test.com" });
    await link(referrer.id, lapsed.id);

    const bd = await parity(referrer.id);
    expect(bd.percent).toBe(40); // 5 x 10 = 50, tope 40
    expect(bd.links).toHaveLength(6);
    expect(bd.links.filter((l) => l.active)).toHaveLength(5);
    expect(bd.links.find((l) => l.userId === lapsed.id)?.active).toBe(false);
    expect(
      bd.links
        .filter((l) => covered.includes(l.userId))
        .every((l) => l.percent === 10),
    ).toBe(true);
  });

  it("los vínculos revocados no figuran", async () => {
    const plan = await createPlan(app, adminToken);
    const referrer = await createMember(app, { email: "bd-rv-r@test.com" });
    const referred = await createMember(app, { email: "bd-rv-d@test.com" });
    await link(referrer.id, referred.id, "revoked");
    await giveCoverage(referred.id, plan.id, addDays(todayStr(), 20));

    const bd = await parity(referrer.id);
    expect(bd).toEqual({ percent: 0, links: [] });
  });

  it("vínculo pending: sin la opción no cuenta; con simulatePendingQualification sí (y el lado es 'invitador')", async () => {
    const plan = await createPlan(app, adminToken);
    const referrer = await createMember(app, { email: "bd-p-r@test.com" });
    const referred = await createMember(app, { email: "bd-p-d@test.com" });
    await link(referrer.id, referred.id, "pending");
    await giveCoverage(referrer.id, plan.id, addDays(todayStr(), 15));

    const without = await parity(referred.id);
    expect(without).toEqual({ percent: 0, links: [] });

    const simulated = await parity(referred.id, {
      simulatePendingQualification: true,
    });
    expect(simulated.percent).toBe(10);
    expect(simulated.links).toHaveLength(1);
    expect(simulated.links[0]).toMatchObject({
      userId: referrer.id,
      side: "invitador",
      active: true,
      percent: 10,
    });
  });

  it("el pending AJENO (el pagador es el invitador) no se simula", async () => {
    const plan = await createPlan(app, adminToken);
    const referrer = await createMember(app, { email: "bd-pa-r@test.com" });
    const referred = await createMember(app, { email: "bd-pa-d@test.com" });
    await link(referrer.id, referred.id, "pending");
    await giveCoverage(referred.id, plan.id, addDays(todayStr(), 15));

    const bd = await parity(referrer.id, {
      simulatePendingQualification: true,
    });
    expect(bd).toEqual({ percent: 0, links: [] });
  });

  it("invitación vigente simulada: cuenta del lado invitado si el invitador tiene membresía hoy", async () => {
    const plan = await createPlan(app, adminToken);
    const inviter = await createMember(app, { email: "bd-s-i@test.com" });
    const payer = await createMember(app, { email: "bd-s-p@test.com" });
    await giveCoverage(inviter.id, plan.id, addDays(todayStr(), 12));

    const bd = await parity(payer.id, {
      simulateInvitationLink: { inviterId: inviter.id },
    });
    expect(bd.percent).toBe(10);
    expect(bd.links).toEqual([
      expect.objectContaining({
        userId: inviter.id,
        side: "invitador",
        active: true,
        percent: 10,
        daysLeft: 12,
      }),
    ]);
  });

  it("invitación simulada con el invitador vencido: figura inactivo y no suma", async () => {
    const plan = await createPlan(app, adminToken);
    const inviter = await createMember(app, { email: "bd-sv-i@test.com" });
    const payer = await createMember(app, { email: "bd-sv-p@test.com" });
    await giveCoverage(inviter.id, plan.id, addDays(todayStr(), -1));

    const bd = await parity(payer.id, {
      simulateInvitationLink: { inviterId: inviter.id },
    });
    expect(bd.percent).toBe(0);
    expect(bd.links).toHaveLength(1);
    expect(bd.links[0]).toMatchObject({ active: false, daysLeft: null });
  });

  it("si el pagador ya tiene vínculo como invitado, la invitación simulada se ignora (no se suma dos veces)", async () => {
    const plan = await createPlan(app, adminToken);
    const referrer = await createMember(app, { email: "bd-d-r@test.com" });
    const otherInviter = await createMember(app, { email: "bd-d-o@test.com" });
    const payer = await createMember(app, { email: "bd-d-p@test.com" });
    await link(referrer.id, payer.id);
    await giveCoverage(referrer.id, plan.id, addDays(todayStr(), 10));
    await giveCoverage(otherInviter.id, plan.id, addDays(todayStr(), 10));

    const bd = await parity(payer.id, {
      simulatePendingQualification: true,
      simulateInvitationLink: { inviterId: otherInviter.id },
    });
    expect(bd.percent).toBe(10);
    expect(bd.links.map((l) => l.userId)).toEqual([referrer.id]);
  });
});

describe("computeInvitationDiscountBreakdown — nombre y lado de la contraparte", () => {
  it("trae el nombre completo y el lado respecto de quien paga", async () => {
    const plan = await createPlan(app, adminToken);
    const referrer = await createMember(app, {
      email: "bd-nm-r@test.com",
      firstName: "Maria",
      lastName: "Invitadora",
    });
    const referred = await createMember(app, {
      email: "bd-nm-d@test.com",
      firstName: "Lucia",
      lastName: "Invitada",
    });
    await link(referrer.id, referred.id);
    await giveCoverage(referrer.id, plan.id, addDays(todayStr(), 9));
    await giveCoverage(referred.id, plan.id, addDays(todayStr(), 9));

    // Quien paga es la invitada: la contraparte es quien la invitó.
    const asReferred = await service.computeInvitationDiscountBreakdown(
      CTX,
      referred.id,
    );
    expect(asReferred.links).toHaveLength(1);
    expect(asReferred.links[0]).toMatchObject({
      userId: referrer.id,
      name: "Maria Invitadora",
      side: "invitador",
    });

    // Quien paga es la invitadora: la contraparte es la invitada.
    const asReferrer = await service.computeInvitationDiscountBreakdown(
      CTX,
      referrer.id,
    );
    expect(asReferrer.links[0]).toMatchObject({
      userId: referred.id,
      name: "Lucia Invitada",
      side: "invitado",
    });
  });
});

describe("computeInvitationDiscountBreakdown — daysLeft y expiresSoon en los bordes", () => {
  it("la constante del umbral es 7", () => {
    expect(INVITATION_EXPIRES_SOON_DAYS).toBe(7);
  });

  const cases: Array<{
    label: string;
    offset: number;
    daysLeft: number;
    expiresSoon: boolean;
  }> = [
    { label: "vence hoy", offset: 0, daysLeft: 0, expiresSoon: true },
    { label: "vence mañana", offset: 1, daysLeft: 1, expiresSoon: true },
    {
      label: "vence en 7 días (borde)",
      offset: 7,
      daysLeft: 7,
      expiresSoon: true,
    },
    {
      label: "vence en 8 días (no avisa)",
      offset: 8,
      daysLeft: 8,
      expiresSoon: false,
    },
    { label: "vence en 30 días", offset: 30, daysLeft: 30, expiresSoon: false },
  ];

  for (const c of cases) {
    it(`${c.label}: daysLeft ${c.daysLeft}, expiresSoon ${c.expiresSoon}`, async () => {
      const plan = await createPlan(app, adminToken);
      const referrer = await createMember(app, {
        email: `bd-dl-r${c.offset}@test.com`,
      });
      const referred = await createMember(app, {
        email: `bd-dl-d${c.offset}@test.com`,
      });
      await link(referrer.id, referred.id);
      await giveCoverage(referred.id, plan.id, addDays(todayStr(), c.offset));

      const bd = await parity(referrer.id);
      expect(bd.percent).toBe(10);
      expect(bd.links[0]).toMatchObject({
        active: true,
        daysLeft: c.daysLeft,
        expiresSoon: c.expiresSoon,
      });
    });
  }

  it("un vínculo inactivo nunca marca expiresSoon", async () => {
    const plan = await createPlan(app, adminToken);
    const referrer = await createMember(app, { email: "bd-ex-r@test.com" });
    const referred = await createMember(app, { email: "bd-ex-d@test.com" });
    await link(referrer.id, referred.id);
    await giveCoverage(referred.id, plan.id, addDays(todayStr(), -1));

    const bd = await parity(referrer.id);
    expect(bd.links[0]).toMatchObject({ expiresSoon: false, daysLeft: null });
  });
});
