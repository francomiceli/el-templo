/**
 * Fase 179 Plan 09 (D-12/D-15) — endpoint admin
 * `POST /api/admin/members/:userId/partner-referral`.
 *
 * Asignación RETROACTIVA de partner sobre un socio ya creado, espejo
 * estructural de `POST /api/admin/members/:userId/referrals` (fase 173,
 * `test/referrals/admin-assign-referrer.test.ts`). Lo que estos tests
 * defienden, en orden de importancia:
 *  1. El vínculo creado acá usa el MISMO criterio que el cobro (D-15,
 *     `pricePaid > 0`), y si nace `qualified` la comisión se genera en el
 *     acto — con `qualifiedAt` estampado AHORA, nunca la fecha del pago
 *     viejo.
 *  2. A diferencia del alta (que degrada en silencio, D-12), acá un partner
 *     inválido o un doble origen fallan VISIBLE: 404/409, nunca un 201
 *     silencioso.
 *  3. Guard de rol y country-scope, calcados de la retroactiva de socios.
 *  4. La carrera de dos admins en dos pestañas deja una sola fila (409 para
 *     el perdedor), documentada como real desde la fase 173.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { sql, eq, and } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  createTestApp,
  getAuthToken,
  cleanAllTestData,
  createStaffUser,
  todayStr,
} from "../helpers";
import { createMember, createPlan } from "../subscriptions/_helpers";
import * as schema from "../../src/db/schema";
import { tenantValues, tenantWhere } from "../../src/modules/shared/tenant";
import { TENANT_TEMPLO } from "../fixtures/second-tenant";
import {
  insertBranch,
  insertPartner,
  insertPartnerLink,
  partnerLinkRow,
  partnerCommissionRows,
} from "./_helpers";

const MEMBER_PASSWORD = "pass123456";

interface AssignBody {
  status: "pending" | "qualified";
  partnerId: number;
  referredId: number;
  commissionId: number | null;
}

let app: FastifyInstance;
let adminToken: string;
let adminId: number;
let esBranchId: number;
let seq = 0;

function url(userId: number): string {
  return `/api/admin/members/${userId}/partner-referral`;
}

/** Email único por test — evita colisiones del UNIQUE de users.email. */
function email(prefix: string): string {
  return `aap-${prefix}-${seq}-${Date.now()}@test.com`;
}

async function assign(
  targetId: number,
  partnerId: number,
  token = adminToken,
): Promise<{ statusCode: number; body: string }> {
  const res = await app.inject({
    method: "POST",
    url: url(targetId),
    headers: { authorization: `Bearer ${token}` },
    payload: { partnerId },
  });
  return { statusCode: res.statusCode, body: res.body };
}

/** INSERT crudo de una suscripción pagada, con `createdAt` controlable — para
 * simular "el socio ya pagó hace tiempo" y verificar que `qualifiedAt` de la
 * retroactiva es AHORA, no la fecha vieja del pago (D-15). */
async function seedPaidSubscription(params: {
  userId: number;
  planId: number;
  branchId?: number;
  pricePaid: number;
  createdAt?: Date;
}): Promise<number> {
  const [res] = await app.db
    .insert(schema.subscriptions)
    .values(
      tenantValues(
        { tenantId: TENANT_TEMPLO },
        {
          userId: params.userId,
          planId: params.planId,
          branchId: params.branchId ?? 1,
          status: "active",
          startDate: todayStr(),
          pricePaid: params.pricePaid,
          currency: "ARS",
          priceTypeApplied: "regular",
          ...(params.createdAt ? { createdAt: params.createdAt } : {}),
        },
      ),
    )
    .$returningId();
  return res.id;
}

async function countPartnerLinks(referredId: number): Promise<number> {
  const rows = await app.db.execute(
    sql`SELECT COUNT(*) as cnt FROM partner_referrals WHERE referred_id = ${referredId}`,
  );
  const list = rows[0] as unknown as Array<{ cnt: number }>;
  return Number(list[0]?.cnt ?? 0);
}

beforeAll(async () => {
  app = await createTestApp();
  adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");

  const [admin] = await app.db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(
      and(
        tenantWhere(schema.users, { tenantId: TENANT_TEMPLO }),
        eq(schema.users.email, "admin@test.com"),
      ),
    )
    .limit(1);
  if (!admin) throw new Error("admin@test.com seed missing");
  adminId = admin.id;

  const es = await insertBranch(app, { country: "ES" });
  esBranchId = es.id;
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await cleanAllTestData(app);
  seq += 1;
});

describe("POST /api/admin/members/:userId/partner-referral — asignación retroactiva (D-15)", () => {
  it("(1) socio sin pagos: 201 pending, attribution_channel=assisted, created_by por email, tenant_id del scope", async () => {
    const partner = await insertPartner(app, {
      commissionType: "fixed",
      commissionValue: 5000,
    });
    const target = await createMember(app, { email: email("nopay") });

    const res = await assign(target.id, partner.id);
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body) as AssignBody;
    expect(body.status).toBe("pending");
    expect(body.partnerId).toBe(partner.id);
    expect(body.referredId).toBe(target.id);
    expect(body.commissionId).toBeNull();

    const link = await partnerLinkRow(app, target.id);
    expect(link?.status).toBe("pending");
    expect(link?.attribution_channel).toBe("assisted");
    expect(link?.tenant_id).toBe(1);

    const rows = await app.db.execute(
      sql`SELECT created_by FROM partner_referrals WHERE referred_id = ${target.id}`,
    );
    const createdBy = (
      rows[0] as unknown as Array<{ created_by: number | null }>
    )[0]?.created_by;
    expect(createdBy).toBe(adminId);
  });

  it("(2) socio con un pago previo: 201 qualified, qualified_at reciente (no la fecha del pago viejo) y comisión creada", async () => {
    const partner = await insertPartner(app, {
      commissionType: "fixed",
      commissionValue: 7500,
      currency: "ARS",
    });
    const target = await createMember(app, { email: email("paid") });
    const plan = await createPlan(app, adminToken, { priceRegular: 15000 });
    // Pago "viejo" — 10 días atrás — para probar que qualifiedAt es AHORA.
    const oldDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    const subscriptionId = await seedPaidSubscription({
      userId: target.id,
      planId: plan.id,
      pricePaid: 15000,
      createdAt: oldDate,
    });

    const res = await assign(target.id, partner.id);
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body) as AssignBody;
    expect(body.status).toBe("qualified");
    expect(body.commissionId).not.toBeNull();

    const link = await partnerLinkRow(app, target.id);
    expect(link?.status).toBe("qualified");
    expect(link?.qualified_at).not.toBeNull();
    const qualifiedAtMs = new Date(link!.qualified_at as Date).getTime();
    // No es la fecha del pago viejo (10 días atrás): la diferencia tiene que
    // ser cercana a 10 días, no ~0. Se evita comparar contra `Date.now()` acá
    // porque `partnerLinkRow` lee con SQL crudo (app.db.execute) y el
    // driver puede aplicar un offset de timezone distinto al de este
    // proceso — la comparación robusta es contra `oldDate`, que nunca pasó
    // por ese camino de lectura.
    expect(qualifiedAtMs - oldDate.getTime()).toBeGreaterThan(
      9 * 24 * 60 * 60 * 1000,
    );

    const commissions = await partnerCommissionRows(app, subscriptionId);
    expect(commissions).toHaveLength(1);
    expect(commissions[0].amount).toBe(7500);
    expect(commissions[0].status).toBe("pending");
  });

  it("(3) socio que ya tiene un referidor de socio: 409 (D-12)", async () => {
    const partner = await insertPartner(app);
    const target = await createMember(app, { email: email("hasref-t") });
    const referrer = await createMember(app, { email: email("hasref-r") });
    await app.db.insert(schema.referrals).values(
      tenantValues(
        { tenantId: TENANT_TEMPLO },
        {
          referrerId: referrer.id,
          referredId: target.id,
          status: "pending" as const,
          attributionChannel: "self_service" as const,
        },
      ),
    );

    const res = await assign(target.id, partner.id);
    expect(res.statusCode).toBe(409);
    expect(await countPartnerLinks(target.id)).toBe(0);
  });

  it("(4) socio que ya tiene un partner asignado: 409", async () => {
    const partnerA = await insertPartner(app);
    const partnerB = await insertPartner(app);
    const target = await createMember(app, { email: email("haspart") });

    expect((await assign(target.id, partnerA.id)).statusCode).toBe(201);
    const res = await assign(target.id, partnerB.id);
    expect(res.statusCode).toBe(409);

    // El primero sobrevive intacto.
    const link = await partnerLinkRow(app, target.id);
    expect(link?.partner_id).toBe(partnerA.id);
    expect(await countPartnerLinks(target.id)).toBe(1);
  });

  it("(5) partner inexistente: 404", async () => {
    const target = await createMember(app, { email: email("noPartner") });
    const res = await assign(target.id, 99999999);
    expect(res.statusCode).toBe(404);
    expect(await countPartnerLinks(target.id)).toBe(0);
  });

  it("(5b) partner inactivo: 404", async () => {
    const partner = await insertPartner(app, { isActive: false });
    const target = await createMember(app, { email: email("inactivePartner") });
    const res = await assign(target.id, partner.id);
    expect(res.statusCode).toBe(404);
  });

  it("(6) socio de otro país con admin no-owner: 404 (country scope, no 403)", async () => {
    const partner = await insertPartner(app);
    const target = await createMember(app, { email: email("xcountry") });
    await createStaffUser(app, {
      email: `aap-admin-es-${seq}@test.local`,
      password: MEMBER_PASSWORD,
      firstName: "Admin",
      lastName: "ES",
      role: "admin",
      branchId: esBranchId,
    });
    const esToken = await getAuthToken(
      app,
      `aap-admin-es-${seq}@test.local`,
      MEMBER_PASSWORD,
    );

    const res = await assign(target.id, partner.id, esToken);
    expect(res.statusCode).toBe(404);
    expect(await countPartnerLinks(target.id)).toBe(0);
  });

  it("(7) rol no autorizado (socio) recibe 403", async () => {
    const partner = await insertPartner(app);
    const target = await createMember(app, { email: email("forbidden-t") });
    const socio = await createMember(app, { email: email("forbidden-s") });
    const socioToken = await getAuthToken(
      app,
      socio.email as string,
      "pass123456",
    );

    const res = await assign(target.id, partner.id, socioToken);
    expect(res.statusCode).toBe(403);
    expect(await countPartnerLinks(target.id)).toBe(0);
  });

  it("(7b) sin token: 401", async () => {
    const target = await createMember(app, { email: email("notoken") });
    const res = await app.inject({
      method: "POST",
      url: url(target.id),
      payload: { partnerId: 1 },
    });
    expect(res.statusCode).toBe(401);
  });

  it("(8) carrera: dos requests simultáneos de asignación — uno 201 y el otro 409, una sola fila", async () => {
    const partnerA = await insertPartner(app);
    const partnerB = await insertPartner(app);
    const target = await createMember(app, { email: email("race") });

    const [resA, resB] = await Promise.all([
      assign(target.id, partnerA.id),
      assign(target.id, partnerB.id),
    ]);
    const codes = [resA.statusCode, resB.statusCode].sort();
    expect(codes).toEqual([201, 409]);
    expect(await countPartnerLinks(target.id)).toBe(1);
  });
});

/**
 * `GET /api/admin/members/:userId/partner-referral` (fase 179, plan 14,
 * D-15) — deviation (Rule 2) del plan 179-14: la sección "Con vínculo" de
 * `MemberReferralsTab.vue` necesita leer nombre/código/estado del partner
 * de un socio, y ninguna ruta existente lo devolvía. Mismo guard que el
 * POST/DELETE de arriba (assertReferralTargetInScope, MEMBER_LIFECYCLE_ROLES).
 */
describe("GET /api/admin/members/:userId/partner-referral — vínculo de la ficha (D-15)", () => {
  async function getLink(
    targetId: number,
    token = adminToken,
  ): Promise<{ statusCode: number; body: string }> {
    const res = await app.inject({
      method: "GET",
      url: url(targetId),
      headers: { authorization: `Bearer ${token}` },
    });
    return { statusCode: res.statusCode, body: res.body };
  }

  it("(1) socio sin vínculo: 200 con body null", async () => {
    const target = await createMember(app, { email: email("get-nolink") });
    const res = await getLink(target.id);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toBeNull();
  });

  it("(2) socio con vínculo qualified: 200 con nombre/código/estado del partner", async () => {
    const partner = await insertPartner(app, {
      name: "Cafe Central",
      benefitType: "discount_percent",
    });
    const target = await createMember(app, { email: email("get-haslink") });
    await insertPartnerLink(app, {
      partnerId: partner.id,
      referredId: target.id,
      status: "qualified",
      benefitStatus: "consumed",
      qualifiedAt: new Date(),
    });

    const res = await getLink(target.id);
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      partnerId: number;
      partnerName: string;
      partnerCode: string;
      status: string;
      benefitType: string;
      benefitStatus: string;
      createdAt: string;
    };
    expect(body.partnerId).toBe(partner.id);
    expect(body.partnerName).toBe("Cafe Central");
    expect(body.partnerCode).toBe(partner.code);
    expect(body.status).toBe("qualified");
    expect(body.benefitType).toBe("discount_percent");
    expect(body.benefitStatus).toBe("consumed");
    expect(body.createdAt).toBeTruthy();
  });

  it("(3) socio de otro país con admin no-owner: 404 (country scope)", async () => {
    const target = await createMember(app, { email: email("get-xcountry") });
    await createStaffUser(app, {
      email: `aap-get-admin-es-${seq}@test.local`,
      password: MEMBER_PASSWORD,
      firstName: "Admin",
      lastName: "ES",
      role: "admin",
      branchId: esBranchId,
    });
    const esToken = await getAuthToken(
      app,
      `aap-get-admin-es-${seq}@test.local`,
      MEMBER_PASSWORD,
    );

    const res = await getLink(target.id, esToken);
    expect(res.statusCode).toBe(404);
  });

  it("(4) sin token: 401", async () => {
    const target = await createMember(app, { email: email("get-notoken") });
    const res = await app.inject({ method: "GET", url: url(target.id) });
    expect(res.statusCode).toBe(401);
  });
});
