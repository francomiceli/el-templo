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
    sql`INSERT INTO referrals (referrer_id, referred_id, status, attribution_channel, qualified_at)
        VALUES (${referrerId}, ${referredId}, ${status}, 'assisted', NOW())`,
  );
}

/** Da cobertura vigente (o vencida) insertando una subscripción directa. */
async function giveCoverage(
  userId: number,
  planId: number,
  endDate: string,
): Promise<void> {
  await app.db.execute(
    sql`INSERT INTO subscriptions (user_id, plan_id, branch_id, subscription_status, start_date, end_date, price_paid, currency, price_type_applied)
        VALUES (${userId}, ${planId}, 1, 'active', ${todayStr()}, ${endDate}, 10000, 'ARS', 'regular')`,
  );
}

describe("ReferralService.computeReferralDiscountPercent", () => {
  it("sin vínculos devuelve 0", async () => {
    const m = await createMember(app, { email: "d0@test.com" });
    const service = new ReferralService(app.db, app.log);
    expect(await service.computeReferralDiscountPercent(m.id)).toBe(0);
  });

  it("un vínculo qualified con contraparte activa suma 10%", async () => {
    const plan = await createPlan(app, adminToken);
    const referrer = await createMember(app, { email: "d1r@test.com" });
    const referred = await createMember(app, { email: "d1d@test.com" });
    await linkQualified(referrer.id, referred.id);
    await giveCoverage(referred.id, plan.id, dateOffsetStr(30));

    const service = new ReferralService(app.db, app.log);
    // El referrer descuenta porque la contraparte (referred) está cubierta.
    expect(await service.computeReferralDiscountPercent(referrer.id)).toBe(10);
  });

  it("una contraparte vencida NO suma ese ciclo", async () => {
    const plan = await createPlan(app, adminToken);
    const referrer = await createMember(app, { email: "d2r@test.com" });
    const referred = await createMember(app, { email: "d2d@test.com" });
    await linkQualified(referrer.id, referred.id);
    await giveCoverage(referred.id, plan.id, dateOffsetStr(-5)); // vencido

    const service = new ReferralService(app.db, app.log);
    expect(await service.computeReferralDiscountPercent(referrer.id)).toBe(0);
  });

  it("un vínculo pending NO computa (solo qualified)", async () => {
    const plan = await createPlan(app, adminToken);
    const referrer = await createMember(app, { email: "d3r@test.com" });
    const referred = await createMember(app, { email: "d3d@test.com" });
    await linkQualified(referrer.id, referred.id, "pending");
    await giveCoverage(referred.id, plan.id, dateOffsetStr(30));

    const service = new ReferralService(app.db, app.log);
    expect(await service.computeReferralDiscountPercent(referrer.id)).toBe(0);
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
    expect(await service.computeReferralDiscountPercent(referrer.id)).toBe(40);
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
    expect(await service.computeReferralDiscountPercent(x.id)).toBe(20);
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
      sql`SELECT status FROM referrals WHERE referred_id = ${referred.id}`,
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
