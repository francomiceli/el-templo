/**
 * v5.5 follow-up — A/B copy test de la card de referidos.
 *
 * Cubre las tres piezas nuevas:
 *   1. POST /api/members/referrals/cta-click — registra el tap del CTA con la
 *      variante RECOMPUTADA server-side desde el token (nunca del cliente).
 *   2. Estampado de copy_variant al crear el vínculo por la ruta real
 *      (self-service ?ref=CODE) = referralCopyVariant(referrerId).
 *   3. GET /api/admin/referrals/ab-results — agregados por variante (expuestos por
 *      paridad de id, clickers únicos vs clics totales, referidos creados vs
 *      cualificados) + guard staff (403 al socio).
 *
 * cleanAllTestData borra todos los users salvo admin@test.com, así que los
 * "expuestos" (socios activos) arrancan en 0 y los conteos son determinísticos.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { createTestApp, getAuthToken, cleanAllTestData } from "../helpers";
import { createMember } from "../subscriptions/_helpers";
import { ReferralService } from "../../src/modules/referrals/service";
import { referralCopyVariant } from "../../src/modules/referrals/ab-variant";
import * as schema from "../../src/db/schema";
import { TENANT_TEMPLO } from "../fixtures/second-tenant";

/**
 * Fase 173 (ADO-02): gimnasio de la escritura DIRECTA de `users` en este
 * archivo. Con `members` en TENANT_STRICT_MODULES un UPDATE crudo sin
 * `tenant_id` en el predicado hace throw antes de llegar a MySQL.
 */
const TEMPLO_CTX = { tenantId: TENANT_TEMPLO };

const CTA_URL = "/api/members/referrals/cta-click";
const AB_URL = "/api/admin/referrals/ab-results";
const MEMBER_PASSWORD = "pass123456";

interface AbVariant {
  variant: "A" | "B";
  exposedMembers: number;
  uniqueClickers: number;
  totalClicks: number;
  referralsCreated: number;
  referralsQualified: number;
  ctr: number;
  qualifiedRate: number;
}
interface AbBody {
  variants: AbVariant[];
}

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

async function setActivo(userId: number): Promise<void> {
  await app.db.execute(
    sql`UPDATE users SET status='activo' WHERE id=${userId} AND tenant_id = ${TEMPLO_CTX.tenantId}`,
  );
}

async function insertClick(userId: number, variant: "A" | "B"): Promise<void> {
  await app.db.execute(
    sql`INSERT INTO referral_cta_clicks (user_id, variant) VALUES (${userId}, ${variant})`,
  );
}

async function linkWithVariant(
  referrerId: number,
  referredId: number,
  status: "pending" | "qualified" | "revoked",
  variant: "A" | "B",
): Promise<void> {
  await app.db.execute(
    sql`INSERT INTO referrals (referrer_id, referred_id, status, attribution_channel, qualified_at, copy_variant)
        VALUES (${referrerId}, ${referredId}, ${status}, 'assisted', NOW(), ${variant})`,
  );
}

describe("POST /api/members/referrals/cta-click", () => {
  it("requiere autenticación (401 sin token)", async () => {
    const res = await app.inject({ method: "POST", url: CTA_URL });
    expect(res.statusCode).toBe(401);
  });

  it("registra el clic con la variante derivada del user id y responde 204", async () => {
    const m = await createMember(app, { email: "cta-1@test.com" });
    const token = await getAuthToken(app, "cta-1@test.com", MEMBER_PASSWORD);

    const res = await app.inject({
      method: "POST",
      url: CTA_URL,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(204);

    const clicks = await app.db
      .select()
      .from(schema.referralCtaClicks)
      .where(eq(schema.referralCtaClicks.userId, m.id));
    expect(clicks).toHaveLength(1);
    // Server-derived: la variante NO viene del cliente, se calcula del id.
    expect(clicks[0].variant).toBe(referralCopyVariant(m.id));
  });

  it("dos taps del mismo socio crean dos filas (la dedup vive en el reporte)", async () => {
    const m = await createMember(app, { email: "cta-2@test.com" });
    const token = await getAuthToken(app, "cta-2@test.com", MEMBER_PASSWORD);
    const headers = { authorization: `Bearer ${token}` };

    await app.inject({ method: "POST", url: CTA_URL, headers });
    await app.inject({ method: "POST", url: CTA_URL, headers });

    const clicks = await app.db
      .select()
      .from(schema.referralCtaClicks)
      .where(eq(schema.referralCtaClicks.userId, m.id));
    expect(clicks).toHaveLength(2);
  });
});

describe("copy_variant se estampa al crear el vínculo (self-service ?ref)", () => {
  it("estampa referralCopyVariant(referrerId) en el vínculo del referido", async () => {
    const referrer = await createMember(app, { email: "ss-referrer@test.com" });
    const service = new ReferralService(app.db, app.log);
    const code = await service.generateReferralCode(referrer.id);

    // Alta self-service del referido con ?ref=CODE (payload directo: registerUser
    // no expone `ref`). Datos únicos para no chocar con constraints.
    const uniq = Date.now().toString(36);
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        firstName: "Ref",
        lastName: "Erido",
        email: `ss-referred-${uniq}@test.com`,
        password: MEMBER_PASSWORD,
        branchId: 1,
        dni: `SS${uniq}`,
        phone: `+549${(Date.now() % 10000000000).toString().padStart(10, "0")}`,
        gender: "male",
        ref: code,
      },
    });
    expect([200, 201]).toContain(res.statusCode);
    const referredId = (JSON.parse(res.body).user as { id: number }).id;

    const rows = await app.db
      .select()
      .from(schema.referrals)
      .where(eq(schema.referrals.referredId, referredId));
    expect(rows).toHaveLength(1);
    expect(rows[0].copyVariant).toBe(referralCopyVariant(referrer.id));
  });
});

describe("GET /api/admin/referrals/ab-results", () => {
  it("rechaza al socio no-staff (403)", async () => {
    await createMember(app, { email: "ab-member@test.com" });
    const token = await getAuthToken(
      app,
      "ab-member@test.com",
      MEMBER_PASSWORD,
    );
    const res = await app.inject({
      method: "GET",
      url: AB_URL,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it("agrega expuestos/clics/conversiones por variante", async () => {
    // Socios activos (cuentan en 'expuestos' por paridad de su id).
    const m1 = await createMember(app, { email: "ab-a1@test.com" });
    const m2 = await createMember(app, { email: "ab-a2@test.com" });
    const m3 = await createMember(app, { email: "ab-a3@test.com" });
    await setActivo(m1.id);
    await setActivo(m2.id);
    await setActivo(m3.id);

    // Referidos (freemium, NO cuentan como expuestos).
    const r1 = await createMember(app, { email: "ab-r1@test.com" });
    const r2 = await createMember(app, { email: "ab-r2@test.com" });
    const r3 = await createMember(app, { email: "ab-r3@test.com" });

    const expectedExposed = { A: 0, B: 0 };
    for (const id of [m1.id, m2.id, m3.id])
      expectedExposed[referralCopyVariant(id)]++;

    // Clics: m1 tapea 2 veces con variante A (1 clicker único, 2 totales),
    // m2 tapea 1 vez con variante B.
    await insertClick(m1.id, "A");
    await insertClick(m1.id, "A");
    await insertClick(m2.id, "B");

    // Referidos: A → 1 qualified + 1 pending (2 creados, 1 convertido);
    //            B → 1 qualified (1 creado, 1 convertido).
    await linkWithVariant(m1.id, r1.id, "qualified", "A");
    await linkWithVariant(m2.id, r2.id, "pending", "A");
    await linkWithVariant(m3.id, r3.id, "qualified", "B");

    const res = await app.inject({
      method: "GET",
      url: AB_URL,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as AbBody;
    const A = body.variants.find((v) => v.variant === "A")!;
    const B = body.variants.find((v) => v.variant === "B")!;

    expect(A.exposedMembers).toBe(expectedExposed.A);
    expect(B.exposedMembers).toBe(expectedExposed.B);

    expect(A.uniqueClickers).toBe(1);
    expect(A.totalClicks).toBe(2);
    expect(B.uniqueClickers).toBe(1);
    expect(B.totalClicks).toBe(1);

    expect(A.referralsCreated).toBe(2);
    expect(A.referralsQualified).toBe(1);
    expect(B.referralsCreated).toBe(1);
    expect(B.referralsQualified).toBe(1);

    // Tasas sobre expuestos (0 si no hay denominador).
    if (expectedExposed.A > 0) {
      expect(A.ctr).toBeCloseTo(1 / expectedExposed.A, 5);
      expect(A.qualifiedRate).toBeCloseTo(1 / expectedExposed.A, 5);
    }
  });

  it("con cero datos devuelve ambas variantes en cero", async () => {
    const res = await app.inject({
      method: "GET",
      url: AB_URL,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as AbBody;
    expect(body.variants).toHaveLength(2);
    for (const v of body.variants) {
      expect(v.exposedMembers).toBe(0);
      expect(v.uniqueClickers).toBe(0);
      expect(v.referralsCreated).toBe(0);
      expect(v.ctr).toBe(0);
    }
  });
});
