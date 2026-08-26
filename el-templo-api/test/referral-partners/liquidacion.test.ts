/**
 * Fase 179 Plan 10 (D-16, D-13) — liquidación batch de comisiones de partner.
 *
 * Lo que estos tests defienden, en orden de importancia:
 *  1. `POST /:id/settle` marca TODAS las comisiones `pending` de UN partner
 *     como `settled`, en un acto, con `settled_at`+`settled_by`, y devuelve
 *     el total correcto — sin tocar `void` ni `settled` previas (D-16).
 *  2. Idempotencia: una segunda llamada no cambia una sola fila (`count: 0`,
 *     `settled_at` idéntico antes/después).
 *  3. Aislamiento: nunca toca comisiones de otro partner del mismo tenant, ni
 *     de otro tenant (404).
 *  4. RBAC: el guard `onRequest` del plugin (MEMBER_LIFECYCLE_ROLES) es el que
 *     efectivamente decide el acceso a las 3 rutas de este plan, `/settle`
 *     incluida — un rol fuera de ese set es 403 en las 3, sin token es 401.
 *  5. D-13: la moneda devuelta por la liquidación es la del partner (AR/ES).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  createTestApp,
  getAuthToken,
  cleanAllTestData,
  createStaffUser,
} from "../helpers";
import {
  createPlan,
  createMember,
  assignPlan,
  todayStr,
} from "../subscriptions/_helpers";
import * as schema from "../../src/db/schema";
import { tenantValues } from "../../src/modules/shared/tenant";
import { insertBranch, insertPartner, insertPartnerLink } from "./_helpers";
import {
  seedSecondTenant,
  limpiarSegundoGimnasio,
  TENANT_DOS,
  TENANT_TEMPLO,
} from "../fixtures/second-tenant";

const AR_BRANCH_ID = 1; // sede seed de test/setup.ts, tenant 1, country='AR'.

let app: FastifyInstance;
let adminToken: string;
let adminId: number;
let seq = 0;

beforeAll(async () => {
  app = await createTestApp();
  adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
  const [admin] = await app.db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, "admin@test.com"))
    .limit(1);
  if (!admin) throw new Error("admin@test.com seed missing");
  adminId = admin.id;
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
  return `liq-${prefix}-${seq}-${Date.now()}@test.com`;
}

interface CommissionRow {
  id: number;
  partner_id: number;
  status: string;
  amount: number;
  currency: string;
  settled_at: Date | null;
  settled_by: number | null;
}

/** Filas crudas de comisión de un partner — se afirma sobre el SQL. */
async function commissionRowsForPartner(
  partnerId: number,
): Promise<CommissionRow[]> {
  const rows = await app.db.execute(
    sql`SELECT id, partner_id, status, amount, currency, settled_at, settled_by
        FROM partner_commissions WHERE partner_id = ${partnerId} ORDER BY id`,
  );
  return rows[0] as unknown as CommissionRow[];
}

/** INSERT crudo en `partner_commissions` (bypasea `qualifyAndCommission`) —
 * para armar el estado de partida de la liquidación con varias comisiones en
 * distintos estados sobre un mismo partner. */
async function insertRawCommission(params: {
  partnerId: number;
  partnerReferralId: number;
  userId: number;
  subscriptionId: number;
  status?: "pending" | "settled" | "void";
  amount?: number;
  currency?: "ARS" | "EUR";
  tenantId?: number;
}): Promise<{ id: number }> {
  const [row] = await app.db
    .insert(schema.partnerCommissions)
    .values(
      tenantValues(
        { tenantId: params.tenantId ?? 1 },
        {
          partnerId: params.partnerId,
          partnerReferralId: params.partnerReferralId,
          userId: params.userId,
          subscriptionId: params.subscriptionId,
          amount: params.amount ?? 5000,
          currency: params.currency ?? ("ARS" as const),
          status: params.status ?? "pending",
        },
      ),
    )
    .$returningId();
  return { id: row.id };
}

/** INSERT crudo de una suscripción (bypasea las reglas de negocio) — mismo
 * patrón que `test/referral-partners/void-comisiones.test.ts`. Sirve para
 * armar varias comisiones sin pasar por `assignPlan` (que rechaza un segundo
 * plan activo sobre el mismo socio). */
async function seedRawSubscription(
  userId: number,
  planId: number,
  pricePaid: number,
  branchId = AR_BRANCH_ID,
): Promise<number> {
  const [res] = await app.db
    .insert(schema.subscriptions)
    .values({
      userId,
      planId,
      branchId,
      status: "active",
      startDate: todayStr(),
      pricePaid,
      currency: "ARS",
      priceTypeApplied: "regular",
    })
    .$returningId();
  return res.id;
}

async function settle(
  partnerId: number,
  token = adminToken,
): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  const res = await app.inject({
    method: "POST",
    url: `/api/admin/referral-partners/${partnerId}/settle`,
    headers: { authorization: `Bearer ${token}` },
  });
  return {
    statusCode: res.statusCode,
    body: JSON.parse(res.body) as Record<string, unknown>,
  };
}

describe("POST /api/admin/referral-partners/:id/settle — liquidación batch (D-16)", () => {
  it("(1) liquida las pending (3), respeta settled y void previas, devuelve el total correcto", async () => {
    const partner = await insertPartner(app, {
      commissionType: "fixed",
      commissionValue: 5000,
      currency: "ARS",
    });
    const member = await createMember(app, {
      email: email("a"),
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
    const sub4 = await seedRawSubscription(member.id, plan.id as number, 15000);
    const sub5 = await seedRawSubscription(member.id, plan.id as number, 15000);

    await insertRawCommission({
      partnerId: partner.id,
      partnerReferralId: link.id,
      userId: member.id,
      subscriptionId: sub1,
      status: "pending",
      amount: 5000,
    });
    await insertRawCommission({
      partnerId: partner.id,
      partnerReferralId: link.id,
      userId: member.id,
      subscriptionId: sub2,
      status: "pending",
      amount: 5000,
    });
    await insertRawCommission({
      partnerId: partner.id,
      partnerReferralId: link.id,
      userId: member.id,
      subscriptionId: sub3,
      status: "pending",
      amount: 5000,
    });
    const settledPrev = await insertRawCommission({
      partnerId: partner.id,
      partnerReferralId: link.id,
      userId: member.id,
      subscriptionId: sub4,
      status: "settled",
      amount: 9999,
    });
    await insertRawCommission({
      partnerId: partner.id,
      partnerReferralId: link.id,
      userId: member.id,
      subscriptionId: sub5,
      status: "void",
      amount: 8888,
    });

    const res = await settle(partner.id);
    expect(res.statusCode).toBe(200);
    expect(res.body.count).toBe(3);
    expect(res.body.totalAmount).toBe(15000);
    expect(res.body.currency).toBe("ARS");

    const rows = await commissionRowsForPartner(partner.id);
    expect(rows).toHaveLength(5);
    let recienLiquidadas = 0;
    for (const row of rows) {
      if (row.id === settledPrev.id) {
        expect(row.status).toBe("settled");
        expect(row.amount).toBe(9999); // la settled previa no se toca
        continue;
      }
      if (row.amount === 8888) {
        expect(row.status).toBe("void"); // la void no se toca
        continue;
      }
      // las 3 recién liquidadas (sub1/sub2/sub3, amount=5000 cada una)
      expect(row.status).toBe("settled");
      expect(row.settled_at).not.toBeNull();
      expect(row.settled_by).toBe(adminId);
      recienLiquidadas += 1;
    }
    expect(recienLiquidadas).toBe(3);
  });

  it("(2) segunda llamada: count 0, ninguna fila cambia (settled_at idéntico)", async () => {
    const partner = await insertPartner(app, {
      commissionType: "fixed",
      commissionValue: 5000,
    });
    const member = await createMember(app, {
      email: email("b"),
      branchId: AR_BRANCH_ID,
    });
    const link = await insertPartnerLink(app, {
      partnerId: partner.id,
      referredId: member.id,
    });
    const plan = await createPlan(app, adminToken, { priceRegular: 15000 });
    const sub = await seedRawSubscription(member.id, plan.id as number, 15000);
    await insertRawCommission({
      partnerId: partner.id,
      partnerReferralId: link.id,
      userId: member.id,
      subscriptionId: sub,
      status: "pending",
    });

    const first = await settle(partner.id);
    expect(first.statusCode).toBe(200);
    expect(first.body.count).toBe(1);

    const afterFirst = await commissionRowsForPartner(partner.id);
    const settledAtFirst = afterFirst[0]?.settled_at;
    expect(settledAtFirst).not.toBeNull();

    const second = await settle(partner.id);
    expect(second.statusCode).toBe(200);
    expect(second.body.count).toBe(0);
    expect(second.body.totalAmount).toBe(0);

    const afterSecond = await commissionRowsForPartner(partner.id);
    expect(afterSecond[0]?.settled_at).toEqual(settledAtFirst);
  });

  it("(3) no toca comisiones pending de OTRO partner del mismo tenant", async () => {
    const partnerA = await insertPartner(app, {
      commissionType: "fixed",
      commissionValue: 5000,
    });
    const partnerB = await insertPartner(app, {
      commissionType: "fixed",
      commissionValue: 5000,
    });
    const memberA = await createMember(app, {
      email: email("c1"),
      branchId: AR_BRANCH_ID,
    });
    const memberB = await createMember(app, {
      email: email("c2"),
      branchId: AR_BRANCH_ID,
    });
    const linkA = await insertPartnerLink(app, {
      partnerId: partnerA.id,
      referredId: memberA.id,
    });
    const linkB = await insertPartnerLink(app, {
      partnerId: partnerB.id,
      referredId: memberB.id,
    });
    const plan = await createPlan(app, adminToken, { priceRegular: 15000 });
    const subA = await seedRawSubscription(
      memberA.id,
      plan.id as number,
      15000,
    );
    const subB = await seedRawSubscription(
      memberB.id,
      plan.id as number,
      15000,
    );
    await insertRawCommission({
      partnerId: partnerA.id,
      partnerReferralId: linkA.id,
      userId: memberA.id,
      subscriptionId: subA,
      status: "pending",
    });
    await insertRawCommission({
      partnerId: partnerB.id,
      partnerReferralId: linkB.id,
      userId: memberB.id,
      subscriptionId: subB,
      status: "pending",
    });

    const res = await settle(partnerA.id);
    expect(res.statusCode).toBe(200);
    expect(res.body.count).toBe(1);

    const rowsB = await commissionRowsForPartner(partnerB.id);
    expect(rowsB[0]?.status).toBe("pending");
    expect(rowsB[0]?.settled_at).toBeNull();
  });

  it("(4) partner de otro tenant: 404", async () => {
    await limpiarSegundoGimnasio(app);
    const gym2 = await seedSecondTenant(app);
    const partnerOtroTenant = await insertPartner(app, {
      tenantId: TENANT_DOS,
      branchId: gym2.branchId,
    });

    const res = await settle(partnerOtroTenant.id);
    expect(res.statusCode).toBe(404);

    // Orden obligatorio (docblock de second-tenant.ts): cleanAllTestData
    // PRIMERO (vacía referral_partners/partner_referrals sin filtro de
    // tenant), limpiarSegundoGimnasio DESPUÉS — si se invierte, el DELETE de
    // branches/users del gimnasio 2 choca con el FK del partner recién
    // creado.
    await cleanAllTestData(app);
    await limpiarSegundoGimnasio(app);
  });

  it("(5) rol fuera de MEMBER_LIFECYCLE_ROLES recibe 403 en las 3 rutas del plan, incluida /settle; sin token 401", async () => {
    const partner = await insertPartner(app, { tenantId: TENANT_TEMPLO });
    await createStaffUser(app, {
      email: `liq-coach-${seq}@test.local`,
      password: "pass123456",
      firstName: "Coach",
      lastName: "Liquidacion",
      role: "coach",
      branchId: AR_BRANCH_ID,
    });
    const coachToken = await getAuthToken(
      app,
      `liq-coach-${seq}@test.local`,
      "pass123456",
    );

    // No existe hoy un rol que pase MEMBER_LIFECYCLE_ROLES (guard exterior)
    // y falle contra FINANCE_VOID_ROLES (chequeo interior de /settle): en
    // origin/master ambos sets son arrays byte-idénticos
    // (["owner","admin","gestion"]), así que ese caso "diferencial" es
    // inescribible. Si algún día los sets divergieran, este comentario deja
    // de ser cierto y habría que agregar ese caso — ver 179-10-PLAN.md.
    const settleRes = await settle(partner.id, coachToken);
    expect(settleRes.statusCode).toBe(403);

    const convRes = await app.inject({
      method: "GET",
      url: "/api/admin/referral-partners/conversions",
      headers: { authorization: `Bearer ${coachToken}` },
    });
    expect(convRes.statusCode).toBe(403);

    const benRes = await app.inject({
      method: "GET",
      url: "/api/admin/referral-partners/benefits-without-conversion",
      headers: { authorization: `Bearer ${coachToken}` },
    });
    expect(benRes.statusCode).toBe(403);

    const noTokenRes = await app.inject({
      method: "POST",
      url: `/api/admin/referral-partners/${partner.id}/settle`,
    });
    expect(noTokenRes.statusCode).toBe(401);
  });

  it("(6) D-13: liquidación de un partner ES devuelve currency EUR", async () => {
    const esBranch = await insertBranch(app, { country: "ES" });
    const partner = await insertPartner(app, {
      branchId: esBranch.id,
      currency: "EUR",
      commissionType: "fixed",
      commissionValue: 4000,
    });
    const member = await createMember(app, {
      email: email("es"),
      branchId: esBranch.id,
    });
    const link = await insertPartnerLink(app, {
      partnerId: partner.id,
      referredId: member.id,
    });
    const plan = await createPlan(app, adminToken, { priceRegular: 15000 });
    const sub = await seedRawSubscription(
      member.id,
      plan.id as number,
      15000,
      esBranch.id,
    );
    await insertRawCommission({
      partnerId: partner.id,
      partnerReferralId: link.id,
      userId: member.id,
      subscriptionId: sub,
      status: "pending",
      amount: 4000,
      currency: "EUR",
    });

    const res = await settle(partner.id);
    expect(res.statusCode).toBe(200);
    expect(res.body.currency).toBe("EUR");
    expect(res.body.totalAmount).toBe(4000);
  });
});
