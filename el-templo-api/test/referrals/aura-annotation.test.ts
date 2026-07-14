/**
 * Fase 157 Plan 02 — Task 2: registro auditable sin inflar saldo (AURA-01).
 *
 * recordReferralCredit escribe referral_credits + una anotación en
 * aura_transactions con amount=0 (sourceType='referral'), SIN tocar el saldo AURA
 * gastable (prohibido AuraService.award/spend). Idempotente por subscriptionId.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  createTestApp,
  getAuthToken,
  cleanAllTestData,
  todayStr,
  seedAuraBalance,
} from "../helpers";
import { createPlan, createMember } from "../subscriptions/_helpers";
import { ReferralService } from "../../src/modules/referrals/service";

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
});

async function createSubscription(
  userId: number,
  planId: number,
): Promise<number> {
  const [res] = await app.db.execute(
    sql`INSERT INTO subscriptions (user_id, plan_id, branch_id, subscription_status, start_date, price_paid, currency, price_type_applied)
        VALUES (${userId}, ${planId}, 1, 'active', ${todayStr()}, 10000, 'ARS', 'regular')`,
  );
  return (res as { insertId: number }).insertId;
}

async function readBalance(userId: number): Promise<number> {
  const [rows] = await app.db.execute(
    sql`SELECT balance FROM aura_balances WHERE user_id = ${userId}`,
  );
  const arr = rows as Array<{ balance: number }>;
  return arr[0]?.balance ?? 0;
}

async function readAuraTx(
  userId: number,
): Promise<Array<{ amount: number; source_type: string }>> {
  const [rows] = await app.db.execute(
    sql`SELECT amount, source_type FROM aura_transactions
        WHERE user_id = ${userId} AND source_type = 'referral'`,
  );
  return rows as Array<{ amount: number; source_type: string }>;
}

describe("ReferralService.recordReferralCredit", () => {
  it("escribe referral_credits + anotación amount=0 sin mover el saldo", async () => {
    const plan = await createPlan(app, adminToken);
    const member = await createMember(app, { email: "aura1@test.com" });
    await seedAuraBalance(app, member.id, 500);
    const subId = await createSubscription(member.id, plan.id);

    const balanceBefore = await readBalance(member.id);
    const service = new ReferralService(app.db, app.log);
    await service.recordReferralCredit(member.id, subId, 10, 1000);

    // referral_credits: una fila con los valores dados.
    const [credits] = await app.db.execute(
      sql`SELECT percent, amount FROM referral_credits WHERE subscription_id = ${subId}`,
    );
    expect(credits as unknown[]).toHaveLength(1);
    expect((credits as Array<{ percent: number; amount: number }>)[0]).toEqual({
      percent: 10,
      amount: 1000,
    });

    // aura_transactions: anotación amount=0 sourceType='referral'.
    const txs = await readAuraTx(member.id);
    expect(txs).toHaveLength(1);
    expect(txs[0].amount).toBe(0);
    expect(txs[0].source_type).toBe("referral");

    // El saldo gastable NO cambió.
    expect(await readBalance(member.id)).toBe(balanceBefore);
    expect(await readBalance(member.id)).toBe(500);
  });

  it("es idempotente: 2do llamado con el mismo subscriptionId no duplica", async () => {
    const plan = await createPlan(app, adminToken);
    const member = await createMember(app, { email: "aura2@test.com" });
    const subId = await createSubscription(member.id, plan.id);

    const service = new ReferralService(app.db, app.log);
    await service.recordReferralCredit(member.id, subId, 10, 1000);
    await service.recordReferralCredit(member.id, subId, 10, 1000);

    const [credits] = await app.db.execute(
      sql`SELECT id FROM referral_credits WHERE subscription_id = ${subId}`,
    );
    expect(credits as unknown[]).toHaveLength(1);

    const txs = await readAuraTx(member.id);
    expect(txs).toHaveLength(1);
  });
});
