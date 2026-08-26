/**
 * Fase 179 Plan 09 (D-14) — void en cascada de comisiones de partner.
 *
 * Cierra el ciclo de vida que abre `qualifyAndCommission` (plan 05): una
 * comisión `pending` no puede sobrevivir a la anulación del cobro que la
 * generó, ni al corte del vínculo con el partner. Lo que estos tests
 * defienden, en orden de importancia:
 *  1. Anular el cobro real (`POST /transactions/:id/void`) que generó una
 *     comisión la deja `void` con `voided_at`/`void_reason` — dentro de la
 *     MISMA transacción del void del cobro (T-179-36).
 *  2. Una comisión `settled` (ya liquidada, D-16) NUNCA se toca por una
 *     anulación posterior — es histórico (D-14).
 *  3. Revocar el vínculo (`DELETE /members/:id/partner-referral`) voidea
 *     TODAS sus comisiones `pending`, deja las `settled` intactas, y
 *     devuelve el conteo correcto.
 *  4. Anular un cobro sin comisión asociada no rompe nada (0 filas
 *     afectadas, sin excepción).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { createTestApp, getAuthToken, cleanAllTestData } from "../helpers";
import {
  createPlan,
  createMember,
  assignPlan,
  todayStr,
} from "../subscriptions/_helpers";
import * as schema from "../../src/db/schema";
import { tenantValues } from "../../src/modules/shared/tenant";
import { insertPartner, insertPartnerLink, partnerLinkRow } from "./_helpers";

let app: FastifyInstance;
let adminToken: string;
const AR_BRANCH_ID = 1; // sede seed de test/setup.ts, tenant 1, country='AR'.
let seq = 0;

beforeAll(async () => {
  app = await createTestApp();
  adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await cleanAllTestData(app);
  seq += 1;
});

/** Email único por test — evita colisiones del UNIQUE de users.email. */
function email(prefix: string): string {
  return `vc-${prefix}-${seq}-${Date.now()}@test.com`;
}

interface CommissionRow {
  id: number;
  status: string;
  voided_at: Date | null;
  void_reason: string | null;
  subscription_id: number;
  partner_referral_id: number;
}

/** La fila cruda de la comisión de un cargo — se afirma sobre el SQL. */
async function commissionRow(
  subscriptionId: number,
): Promise<CommissionRow | null> {
  const rows = await app.db.execute(
    sql`SELECT id, status, voided_at, void_reason, subscription_id, partner_referral_id
        FROM partner_commissions WHERE subscription_id = ${subscriptionId}`,
  );
  const list = rows[0] as unknown as CommissionRow[];
  return list[0] ?? null;
}

/** El `transaction_id` del cobro que generó (o hubiera generado) el link de
 * subscription — mismo camino que sigue `_void` para encontrar el subLink. */
async function transactionIdForSubscription(
  subscriptionId: number,
): Promise<number> {
  const rows = await app.db.execute(
    sql`SELECT transaction_id FROM transaction_links
        WHERE target_kind = 'subscription' AND target_id = ${subscriptionId}
        LIMIT 1`,
  );
  const list = rows[0] as unknown as Array<{ transaction_id: number }>;
  if (list.length === 0) {
    throw new Error(
      `No hay transaction_link de subscription para ${subscriptionId}`,
    );
  }
  return list[0].transaction_id;
}

async function voidTransaction(
  transactionId: number,
  overrides: Record<string, unknown> = {},
): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  const res = await app.inject({
    method: "POST",
    url: `/api/admin/finance/transactions/${transactionId}/void`,
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { reason: "Prueba de anulación (fase 179)", ...overrides },
  });
  return {
    statusCode: res.statusCode,
    body: JSON.parse(res.body) as Record<string, unknown>,
  };
}

async function revokeLink(
  userId: number,
  token = adminToken,
): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  const res = await app.inject({
    method: "DELETE",
    url: `/api/admin/members/${userId}/partner-referral`,
    headers: { authorization: `Bearer ${token}` },
  });
  return {
    statusCode: res.statusCode,
    body: JSON.parse(res.body) as Record<string, unknown>,
  };
}

/** INSERT crudo de una suscripción (bypasea las reglas de negocio) — mismo
 * patrón que `seedSubscription` de `test/finance/transaction-service.test.ts`.
 * Sirve para armar comisiones adicionales sin pasar por `assignPlan` (que
 * rechazaría un segundo plan activo sobre el mismo socio). */
async function seedRawSubscription(
  userId: number,
  planId: number,
  pricePaid: number,
): Promise<number> {
  const [res] = await app.db
    .insert(schema.subscriptions)
    .values({
      userId,
      planId,
      branchId: AR_BRANCH_ID,
      status: "active",
      startDate: todayStr(),
      pricePaid,
      currency: "ARS",
      priceTypeApplied: "regular",
    })
    .$returningId();
  return res.id;
}

/** INSERT crudo en `partner_commissions` (bypasea `qualifyAndCommission`) —
 * para armar el estado de partida de los tests de revocación (varias
 * comisiones tras UN vínculo, cosa que el flujo real de cobro nunca produce
 * porque el flip solo ocurre una vez). */
async function insertRawCommission(params: {
  partnerId: number;
  partnerReferralId: number;
  userId: number;
  subscriptionId: number;
  status?: "pending" | "settled" | "void";
}): Promise<{ id: number }> {
  const [row] = await app.db
    .insert(schema.partnerCommissions)
    .values(
      tenantValues(
        { tenantId: 1 },
        {
          partnerId: params.partnerId,
          partnerReferralId: params.partnerReferralId,
          userId: params.userId,
          subscriptionId: params.subscriptionId,
          amount: 5000,
          currency: "ARS" as const,
          status: params.status ?? "pending",
        },
      ),
    )
    .$returningId();
  return { id: row.id };
}

describe("void en cascada de comisiones de partner (D-14)", () => {
  it("(1) anular el cobro real que generó la comisión la deja void con voided_at y void_reason", async () => {
    const partner = await insertPartner(app, {
      commissionType: "fixed",
      commissionValue: 5000,
      currency: "ARS",
    });
    const member = await createMember(app, {
      email: email("void-a"),
      branchId: AR_BRANCH_ID,
    });
    await insertPartnerLink(app, {
      partnerId: partner.id,
      referredId: member.id,
      status: "pending",
    });
    const plan = await createPlan(app, adminToken, { priceRegular: 15000 });

    const assignRes = await assignPlan(app, adminToken, member.id, {
      planId: plan.id,
    });
    expect(assignRes.statusCode).toBe(201);
    const subscriptionId = assignRes.body.id as number;

    const beforeCommission = await commissionRow(subscriptionId);
    expect(beforeCommission?.status).toBe("pending");

    const transactionId = await transactionIdForSubscription(subscriptionId);
    const voidRes = await voidTransaction(transactionId);
    expect(voidRes.statusCode).toBe(200);

    const commission = await commissionRow(subscriptionId);
    expect(commission?.status).toBe("void");
    expect(commission?.voided_at).not.toBeNull();
    expect(commission?.void_reason).toContain(`#${transactionId}`);
  });

  it("(2) una comisión settled sobrevive intacta a la anulación del cobro (D-14)", async () => {
    const partner = await insertPartner(app, {
      commissionType: "fixed",
      commissionValue: 5000,
      currency: "ARS",
    });
    const member = await createMember(app, {
      email: email("void-b"),
      branchId: AR_BRANCH_ID,
    });
    await insertPartnerLink(app, {
      partnerId: partner.id,
      referredId: member.id,
      status: "pending",
    });
    const plan = await createPlan(app, adminToken, { priceRegular: 15000 });

    const assignRes = await assignPlan(app, adminToken, member.id, {
      planId: plan.id,
    });
    const subscriptionId = assignRes.body.id as number;

    // Liquidación manual simulada (D-16 es batch, acá se marca crudo — lo
    // único que importa es el estado de partida 'settled').
    await app.db.execute(
      sql`UPDATE partner_commissions SET status = 'settled', settled_at = NOW()
          WHERE subscription_id = ${subscriptionId}`,
    );

    const transactionId = await transactionIdForSubscription(subscriptionId);
    const voidRes = await voidTransaction(transactionId);
    expect(voidRes.statusCode).toBe(200);

    const commission = await commissionRow(subscriptionId);
    expect(commission?.status).toBe("settled");
    expect(commission?.voided_at).toBeNull();
  });

  it("(3) revocar el vínculo voidea las comisiones pending, deja las settled intactas y devuelve el conteo", async () => {
    const partner = await insertPartner(app, {
      commissionType: "fixed",
      commissionValue: 5000,
      currency: "ARS",
    });
    const member = await createMember(app, {
      email: email("void-c"),
      branchId: AR_BRANCH_ID,
    });
    const link = await insertPartnerLink(app, {
      partnerId: partner.id,
      referredId: member.id,
      status: "qualified",
    });
    const plan = await createPlan(app, adminToken, { priceRegular: 15000 });

    const sub1 = await seedRawSubscription(member.id, plan.id as number, 15000);
    const sub2 = await seedRawSubscription(member.id, plan.id as number, 15000);
    const sub3 = await seedRawSubscription(member.id, plan.id as number, 15000);
    await insertRawCommission({
      partnerId: partner.id,
      partnerReferralId: link.id,
      userId: member.id,
      subscriptionId: sub1,
      status: "pending",
    });
    await insertRawCommission({
      partnerId: partner.id,
      partnerReferralId: link.id,
      userId: member.id,
      subscriptionId: sub2,
      status: "pending",
    });
    await insertRawCommission({
      partnerId: partner.id,
      partnerReferralId: link.id,
      userId: member.id,
      subscriptionId: sub3,
      status: "settled",
    });

    const res = await revokeLink(member.id);
    expect(res.statusCode).toBe(200);
    expect(res.body.voidedCommissions).toBe(2);

    const linkRow = await partnerLinkRow(app, member.id);
    expect(linkRow?.status).toBe("revoked");

    const c1 = await commissionRow(sub1);
    expect(c1?.status).toBe("void");
    expect(c1?.voided_at).not.toBeNull();
    expect(c1?.void_reason).toBe("Vínculo con el partner revocado");

    const c2 = await commissionRow(sub2);
    expect(c2?.status).toBe("void");

    const c3 = await commissionRow(sub3);
    expect(c3?.status).toBe("settled");
    expect(c3?.voided_at).toBeNull();
  });

  it("(4) anular un cobro sin comisiones asociadas no rompe nada (0 filas afectadas)", async () => {
    const member = await createMember(app, {
      email: email("void-d"),
      branchId: AR_BRANCH_ID,
    });
    const plan = await createPlan(app, adminToken, { priceRegular: 15000 });

    const assignRes = await assignPlan(app, adminToken, member.id, {
      planId: plan.id,
    });
    expect(assignRes.statusCode).toBe(201);
    const subscriptionId = assignRes.body.id as number;

    // Sin partner link -> sin comisión. El void del cobro debe seguir
    // funcionando sin excepción.
    expect(await commissionRow(subscriptionId)).toBeNull();

    const transactionId = await transactionIdForSubscription(subscriptionId);
    const voidRes = await voidTransaction(transactionId);
    expect(voidRes.statusCode).toBe(200);
  });
});
