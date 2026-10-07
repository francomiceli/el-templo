/**
 * Fase 157 Plan 02 — Task 2: cómputo del descuento simétrico condicional topeado.
 *
 * "Activo" se determina SOLO con deriveCoveredUntil de la contraparte (D-09/D-24),
 * nunca con users.status. Acumula percentPerLink por vínculo qualified activo,
 * topeado a maxPercentCap. Bidireccional (cuenta como referrer y como referred).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  createTestApp,
  getAuthToken,
  cleanAllTestData,
  todayStr,
  dateOffsetStr,
} from "../helpers";
import { createPlan, createMember } from "../subscriptions/_helpers";
import { ReferralService } from "../../src/modules/referrals/service";
import type { TenantContext } from "../../src/modules/shared/tenant";
import { TENANT_TEMPLO } from "../fixtures/second-tenant";
import {
  createTrialPlan,
  fixtureCtx,
  resetInvitationSettings,
} from "../invitations/_helpers";
import { setInvitationSettings } from "../../src/modules/referrals/invitation-settings";

// T-173-08: `qualifyFirstPayment` recibe `ctx` primero.
const CTX: TenantContext = { tenantId: 1 };

let app: FastifyInstance;
let adminToken: string;

beforeAll(async () => {
  app = await createTestApp();
  adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await cleanAllTestData(app);
  // Fase 194-14: los settings de invitaciones viven en tenant_settings (no se limpia solo).
  await resetInvitationSettings(fixtureCtx(app));
  // Local siembra default_amount=50 (stale): fijamos 10/40 explícito.
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

async function linkQualified(
  referrerId: number,
  referredId: number,
  status: "qualified" | "pending" = "qualified",
): Promise<void> {
  await app.db.execute(
    sql`INSERT INTO referrals (tenant_id, referrer_id, referred_id, status, attribution_channel, qualified_at)
        VALUES (1, ${referrerId}, ${referredId}, ${status}, 'assisted', NOW())`,
  );
}

/** Da cobertura vigente (o vencida) insertando una subscripción directa. */
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

describe("ReferralService.computeReferralDiscountPercent", () => {
  it("sin vínculos devuelve 0", async () => {
    const m = await createMember(app, { email: "d0@test.com" });
    const service = new ReferralService(app.db, app.log);
    expect(await service.computeInvitationDiscountPercent(CTX, m.id)).toBe(0);
  });

  it("un vínculo qualified con contraparte activa suma 10%", async () => {
    const plan = await createPlan(app, adminToken);
    const referrer = await createMember(app, { email: "d1r@test.com" });
    const referred = await createMember(app, { email: "d1d@test.com" });
    await linkQualified(referrer.id, referred.id);
    await giveCoverage(referred.id, plan.id, dateOffsetStr(30));

    const service = new ReferralService(app.db, app.log);
    // El referrer descuenta porque la contraparte (referred) está cubierta.
    expect(
      await service.computeInvitationDiscountPercent(CTX, referrer.id),
    ).toBe(10);
  });

  // Fase 194 D-10d: la contraparte cuenta como "activa" solo con cobertura de
  // MEMBRESÍA; un acceso de invitación (plan is_trial) no genera descuento.
  it("una contraparte con SOLO una sub is_trial vigente NO suma; con presencial vigente sí (D-10d)", async () => {
    const plan = await createPlan(app, adminToken);
    const trial = await createTrialPlan(fixtureCtx(app));
    const referrer = await createMember(app, { email: "d2tr@test.com" });
    const soloInvitado = await createMember(app, { email: "d2ti@test.com" });
    const conMembresia = await createMember(app, { email: "d2tm@test.com" });
    await linkQualified(referrer.id, soloInvitado.id);
    await giveCoverage(soloInvitado.id, trial.id, dateOffsetStr(30));

    const service = new ReferralService(app.db, app.log);
    expect(
      await service.computeInvitationDiscountPercent(CTX, referrer.id),
    ).toBe(0);

    // Mismo vínculo + una segunda contraparte con presencial vigente → 10.
    await linkQualified(referrer.id, conMembresia.id);
    await giveCoverage(conMembresia.id, plan.id, dateOffsetStr(30));
    expect(
      await service.computeInvitationDiscountPercent(CTX, referrer.id),
    ).toBe(10);
  });

  it("una contraparte vencida NO suma ese ciclo", async () => {
    const plan = await createPlan(app, adminToken);
    const referrer = await createMember(app, { email: "d2r@test.com" });
    const referred = await createMember(app, { email: "d2d@test.com" });
    await linkQualified(referrer.id, referred.id);
    await giveCoverage(referred.id, plan.id, dateOffsetStr(-5)); // vencido

    const service = new ReferralService(app.db, app.log);
    expect(
      await service.computeInvitationDiscountPercent(CTX, referrer.id),
    ).toBe(0);
  });

  it("un vínculo pending NO computa (solo qualified)", async () => {
    const plan = await createPlan(app, adminToken);
    const referrer = await createMember(app, { email: "d3r@test.com" });
    const referred = await createMember(app, { email: "d3d@test.com" });
    await linkQualified(referrer.id, referred.id, "pending");
    await giveCoverage(referred.id, plan.id, dateOffsetStr(30));

    const service = new ReferralService(app.db, app.log);
    expect(
      await service.computeInvitationDiscountPercent(CTX, referrer.id),
    ).toBe(0);
  });

  it("5 vínculos activos topean a 40 (no 50)", async () => {
    const plan = await createPlan(app, adminToken);
    const referrer = await createMember(app, { email: "d4r@test.com" });
    const service = new ReferralService(app.db, app.log);
    for (let i = 0; i < 5; i++) {
      const referred = await createMember(app, { email: `d4d${i}@test.com` });
      await linkQualified(referrer.id, referred.id);
      await giveCoverage(referred.id, plan.id, dateOffsetStr(30));
    }
    expect(
      await service.computeInvitationDiscountPercent(CTX, referrer.id),
    ).toBe(40);
  });

  it("es bidireccional: cuenta vínculos como referrer Y como referred", async () => {
    const plan = await createPlan(app, adminToken);
    const x = await createMember(app, { email: "d5x@test.com" });
    const asReferred = await createMember(app, { email: "d5a@test.com" });
    const asReferrer = await createMember(app, { email: "d5b@test.com" });

    // X es referido por asReferred, y X refirió a asReferrer.
    await linkQualified(asReferred.id, x.id);
    await linkQualified(x.id, asReferrer.id);
    await giveCoverage(asReferred.id, plan.id, dateOffsetStr(30));
    await giveCoverage(asReferrer.id, plan.id, dateOffsetStr(30));

    const service = new ReferralService(app.db, app.log);
    expect(await service.computeInvitationDiscountPercent(CTX, x.id)).toBe(20);
  });
});

describe("ReferralService.qualifyFirstPayment", () => {
  it("marca qualified el vínculo pending del payer (idempotente)", async () => {
    const referrer = await createMember(app, { email: "q1r@test.com" });
    const referred = await createMember(app, { email: "q1d@test.com" });
    await linkQualified(referrer.id, referred.id, "pending");

    const service = new ReferralService(app.db, app.log);
    await service.qualifyFirstPayment(CTX, referred.id);
    await service.qualifyFirstPayment(CTX, referred.id); // 2da vez = no-op

    const rows = await app.db.execute(
      sql`/* tenant-safe: lectura por referred_id, UNIQUE (D-14/REF-04) */ SELECT status FROM referrals WHERE referred_id = ${referred.id}`,
    );
    const statuses = (rows[0] as Array<{ status: string }>).map(
      (r) => r.status,
    );
    expect(statuses).toEqual(["qualified"]);
  });

  it("no-op si el payer no tiene vínculo pending", async () => {
    const other = await createMember(app, { email: "q2@test.com" });
    const service = new ReferralService(app.db, app.log);
    await expect(
      service.qualifyFirstPayment(CTX, other.id),
    ).resolves.toBeNull();
  });
});

// Fase 194-14 (D-10e): el % se separa por LADO del vínculo. Como invitado se suma
// `invitee_percent`, como invitador `percentPerLink` por cada invitado activo.
describe("ReferralService.computeInvitationDiscountPercent (por lado, 194-14 D-10e)", () => {
  /** Vínculos `qualified` invitador->invitado, con cada invitado cubierto por membresía real. */
  async function covered(
    planId: number,
    referrerId: number,
    n: number,
    prefix: string,
  ): Promise<number[]> {
    const ids: number[] = [];
    for (let i = 0; i < n; i++) {
      const referred = await createMember(app, {
        email: `${prefix}${i}@test.com`,
      });
      await linkQualified(referrerId, referred.id);
      await giveCoverage(referred.id, planId, dateOffsetStr(30));
      ids.push(referred.id);
    }
    return ids;
  }

  it("10/10 (default): el invitado 10, el invitador con 3 invitados 30 y con 5 invitados 40 (tope) — idéntico a hoy", async () => {
    const plan = await createPlan(app, adminToken);
    const service = new ReferralService(app.db, app.log);

    const inviter3 = await createMember(app, { email: "s1i3@test.com" });
    await covered(plan.id, inviter3.id, 3, "s1a");
    expect(
      await service.computeInvitationDiscountPercent(CTX, inviter3.id),
    ).toBe(30);

    const inviter5 = await createMember(app, { email: "s1i5@test.com" });
    const five = await covered(plan.id, inviter5.id, 5, "s1b");
    expect(
      await service.computeInvitationDiscountPercent(CTX, inviter5.id),
    ).toBe(40);

    // El invitado (con su invitador cubierto) recibe el 10 del lado invitado.
    await giveCoverage(inviter5.id, plan.id, dateOffsetStr(30));
    expect(await service.computeInvitationDiscountPercent(CTX, five[0])).toBe(
      10,
    );
    // Misma firma pública que las charge-paths: mismo número.
    expect(await service.computeInvitationDiscountPercent(CTX, five[0])).toBe(
      10,
    );
    expect(
      await service.computeInvitationDiscountPercent(CTX, inviter3.id),
    ).toBe(30);
  });

  it("15/10: el invitado 15, el invitador con 2 invitados 20 y quien es invitado (15) e invitador de 1 (10) 25", async () => {
    await setInvitationSettings(app.db, CTX, { inviteePercent: 15 });
    const plan = await createPlan(app, adminToken);
    const service = new ReferralService(app.db, app.log);

    const inviter = await createMember(app, { email: "s2i@test.com" });
    const [first] = await covered(plan.id, inviter.id, 2, "s2a");
    await giveCoverage(inviter.id, plan.id, dateOffsetStr(30));
    expect(await service.computeInvitationDiscountPercent(CTX, first)).toBe(15);
    expect(
      await service.computeInvitationDiscountPercent(CTX, inviter.id),
    ).toBe(20);

    // `first` además invitó a otra persona cubierta: 15 (como invitado) + 10 (como invitador).
    await covered(plan.id, first, 1, "s2b");
    expect(await service.computeInvitationDiscountPercent(CTX, first)).toBe(25);
  });

  it("el tope % se respeta también con el lado invitado (40 máximo)", async () => {
    await setInvitationSettings(app.db, CTX, { inviteePercent: 50 });
    const plan = await createPlan(app, adminToken);
    const service = new ReferralService(app.db, app.log);
    const inviter = await createMember(app, { email: "s3i@test.com" });
    const [first] = await covered(plan.id, inviter.id, 1, "s3a");
    await giveCoverage(inviter.id, plan.id, dateOffsetStr(30));
    expect(await service.computeInvitationDiscountPercent(CTX, first)).toBe(40);
  });

  it("simulateInvitationLink cuenta el vínculo del lado invitado solo si el invitador tiene membresía vigente", async () => {
    const plan = await createPlan(app, adminToken);
    const trial = await createTrialPlan(fixtureCtx(app));
    const service = new ReferralService(app.db, app.log);
    const payer = await createMember(app, { email: "s4p@test.com" });
    const inviterOk = await createMember(app, { email: "s4ok@test.com" });
    const inviterTrial = await createMember(app, { email: "s4tr@test.com" });
    await giveCoverage(inviterOk.id, plan.id, dateOffsetStr(30));
    await giveCoverage(inviterTrial.id, trial.id, dateOffsetStr(30));

    // Sin simular: 0 (todavía no hay fila en referrals).
    expect(await service.computeInvitationDiscountPercent(CTX, payer.id)).toBe(
      0,
    );
    expect(
      await service.computeInvitationDiscountPercent(CTX, payer.id, {
        simulateInvitationLink: { inviterId: inviterOk.id },
      }),
    ).toBe(10);
    // Invitador con SOLO accesos is_trial: no es membresía (D-10d) -> no descuenta.
    expect(
      await service.computeInvitationDiscountPercent(CTX, payer.id, {
        simulateInvitationLink: { inviterId: inviterTrial.id },
      }),
    ).toBe(0);
  });

  it("simulateInvitationLink se ignora si el usuario ya tiene un vínculo como invitado (no suma dos veces)", async () => {
    const plan = await createPlan(app, adminToken);
    const service = new ReferralService(app.db, app.log);
    const payer = await createMember(app, { email: "s5p@test.com" });
    const realInviter = await createMember(app, { email: "s5r@test.com" });
    const otherInviter = await createMember(app, { email: "s5o@test.com" });
    await linkQualified(realInviter.id, payer.id);
    await giveCoverage(realInviter.id, plan.id, dateOffsetStr(30));
    await giveCoverage(otherInviter.id, plan.id, dateOffsetStr(30));

    expect(
      await service.computeInvitationDiscountPercent(CTX, payer.id, {
        simulateInvitationLink: { inviterId: otherInviter.id },
      }),
    ).toBe(10);
  });
});
