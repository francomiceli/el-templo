/**
 * Fase 179 (D-03/D-13/D-20, plan 03) — CRUD admin HTTP de
 * `/api/admin/referral-partners`.
 *
 * Lo que estos tests defienden, en orden de importancia:
 *  1. El happy path crea la fila con el `tenant_id` del scope (nunca del
 *     body), código normalizado en mayúsculas, y `currency` derivada del país
 *     de la sede — probado en AR y ES (D-13).
 *  2. Los 3 espacios de nombres de código (D-03) son mutuamente excluyentes:
 *     colisionar con otro partner, con `users.referral_code` o con
 *     `promo_plans.promo_code` es siempre 409.
 *  3. El JSON Schema de Fastify rechaza antes de tocar el service:
 *     `benefitValue` fuera de 1..100 (discount_percent) es 400. Una propiedad
 *     extra del body (`additionalProperties: false`) NO produce un 400 —
 *     Fastify compila ajv con `removeAdditional: true` por default (mismo
 *     comportamiento documentado en `members/schemas.ts`), así que se
 *     strippea en silencio; lo que importa para T-179-11 es que un
 *     `tenantId` spoofeado en el body no tenga ningún efecto.
 *  4. RBAC: solo `MEMBER_LIFECYCLE_ROLES` (owner/admin/gestion) llega a las 4
 *     rutas — un rol fuera de ese set (`coach`) es 403, sin token es 401
 *     (T-179-10).
 *  5. El `code` de un partner es inmutable (T-179-13): un PATCH que solo
 *     trae `code` termina, después del strip silencioso del schema, sin
 *     ningún campo editable — el service lo rechaza con 400 explícito (fix
 *     de este plan: antes de esto, un `.update().set({})` sin columnas
 *     producía un error de sintaxis SQL, 500). `benefitValue`/`isActive` sí
 *     se actualizan.
 *  6. Aislamiento de tenant (D-20): `GET /` nunca devuelve un partner de otro
 *     gimnasio.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { eq, sql, and } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  createTestApp,
  getAuthToken,
  cleanAllTestData,
  createStaffUser,
} from "../helpers";
import { createPlan } from "../subscriptions/_helpers";
import { insertBranch, insertPartner, nextCode } from "./_helpers";
import {
  seedSecondTenant,
  limpiarSegundoGimnasio,
  TENANT_DOS,
  TENANT_TEMPLO,
} from "../fixtures/second-tenant";
import { tenantValues, tenantWhere } from "../../src/modules/shared/tenant";
import * as schema from "../../src/db/schema";

const BASE_URL = "/api/admin/referral-partners";
const AR_BRANCH_ID = 1; // sede seed de test/setup.ts, country = 'AR'.

interface PartnerCreateBody {
  name: string;
  code: string;
  branchId: number;
  benefitType: "discount_percent" | "free_pass";
  benefitValue: number;
  commissionType: "none" | "fixed";
  commissionValue: number;
  contactName?: string;
  contactPhone?: string;
  notes?: string;
}

interface RawPartnerRow {
  id: number;
  tenant_id: number;
  code: string;
  currency: string;
  benefit_value: number;
  is_active: number;
}

function basePayload(
  overrides: Partial<PartnerCreateBody> = {},
): PartnerCreateBody {
  return {
    name: "Café X",
    code: nextCode("CRUD"),
    branchId: AR_BRANCH_ID,
    benefitType: "discount_percent",
    benefitValue: 15,
    commissionType: "fixed",
    commissionValue: 3000,
    ...overrides,
  };
}

async function rawPartnerRow(id: number): Promise<RawPartnerRow> {
  const rows = await app.db.execute(
    sql`SELECT id, tenant_id, code, currency, benefit_value, is_active
        FROM referral_partners WHERE id = ${id}`,
  );
  const list = rows[0] as unknown as RawPartnerRow[];
  if (!list[0]) throw new Error(`referral_partners row ${id} not found`);
  return list[0];
}

let app: FastifyInstance;
let adminToken: string;
let adminId: number;
let coachToken: string;

beforeAll(async () => {
  app = await createTestApp();
  adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");

  const [admin] = await app.db
    .select({ id: schema.users.id, branchId: schema.users.branchId })
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
  const branchId = admin.branchId ?? AR_BRANCH_ID;

  await createStaffUser(app, {
    email: "coach-partners@test.local",
    password: "pass123456",
    firstName: "Coach",
    lastName: "Partners",
    role: "coach",
    branchId,
  });
  coachToken = await getAuthToken(
    app,
    "coach-partners@test.local",
    "pass123456",
  );
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await cleanAllTestData(app);
  // cleanAllTestData no toca el usuario admin ni recrea el coach: el coach
  // se pierde con el DELETE de `users` (WHERE NOT email <=> admin@test.com),
  // así que se re-siembra en cada test.
  const [admin] = await app.db
    .select({ id: schema.users.id, branchId: schema.users.branchId })
    .from(schema.users)
    .where(
      and(
        tenantWhere(schema.users, { tenantId: TENANT_TEMPLO }),
        eq(schema.users.email, "admin@test.com"),
      ),
    )
    .limit(1);
  const branchId = admin?.branchId ?? AR_BRANCH_ID;
  await createStaffUser(app, {
    email: "coach-partners@test.local",
    password: "pass123456",
    firstName: "Coach",
    lastName: "Partners",
    role: "coach",
    branchId,
  });
  coachToken = await getAuthToken(
    app,
    "coach-partners@test.local",
    "pass123456",
  );
});

describe("POST /api/admin/referral-partners — happy path y currency (D-13)", () => {
  it("201: crea el partner con tenant_id del scope, código normalizado en mayúsculas, currency ARS (sede AR)", async () => {
    const rawCode = ` cafe-${nextCode("hp").toLowerCase()} `;
    const res = await app.inject({
      method: "POST",
      url: BASE_URL,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: basePayload({ code: rawCode }),
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body) as { id: number };
    const row = await rawPartnerRow(body.id);
    expect(row.tenant_id).toBe(TENANT_TEMPLO);
    expect(row.code).toMatch(/^[A-Z0-9]+$/);
    expect(row.currency).toBe("ARS");
  });

  it("201: currency EUR cuando la sede es ES (D-13)", async () => {
    const esBranch = await insertBranch(app, { country: "ES" });
    const res = await app.inject({
      method: "POST",
      url: BASE_URL,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: basePayload({ branchId: esBranch.id, code: nextCode("ES") }),
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body) as { id: number };
    const row = await rawPartnerRow(body.id);
    expect(row.currency).toBe("EUR");
  });
});

describe("POST /api/admin/referral-partners — 409 por los 3 espacios de nombres (D-03)", () => {
  it("409 si el código ya lo usa OTRO partner del mismo tenant", async () => {
    const { code } = await insertPartner(app, { tenantId: TENANT_TEMPLO });

    const res = await app.inject({
      method: "POST",
      url: BASE_URL,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: basePayload({ code }),
    });
    expect(res.statusCode).toBe(409);
  });

  it("409 si el código ya lo usa un socio (users.referral_code)", async () => {
    const code = nextCode("SOC");
    await app.db
      .update(schema.users)
      .set({ referralCode: code })
      .where(
        and(
          tenantWhere(schema.users, { tenantId: TENANT_TEMPLO }),
          eq(schema.users.id, adminId),
        ),
      );

    const res = await app.inject({
      method: "POST",
      url: BASE_URL,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: basePayload({ code }),
    });
    expect(res.statusCode).toBe(409);
  });

  it("409 si el código ya lo usa una promo (promo_plans.promo_code)", async () => {
    const plan = await createPlan(app, adminToken);
    const code = nextCode("PROMO");
    await app.db.insert(schema.promoPlans).values(
      tenantValues(
        { tenantId: TENANT_TEMPLO },
        {
          name: `Promo ${code}`,
          promoCode: code,
          subscriptionPlanId: plan.id as number,
          startDate: new Date(),
          expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          country: "AR",
          isActive: true,
        },
      ),
    );

    const res = await app.inject({
      method: "POST",
      url: BASE_URL,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: basePayload({ code }),
    });
    expect(res.statusCode).toBe(409);
  });
});

describe("POST /api/admin/referral-partners — validación (Security V5)", () => {
  it("400 si benefitValue supera 100 con discount_percent", async () => {
    const res = await app.inject({
      method: "POST",
      url: BASE_URL,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: basePayload({ benefitValue: 150 }),
    });
    expect(res.statusCode).toBe(400);
  });

  it("additionalProperties: false strippea una propiedad extra en silencio (default removeAdditional de Fastify) — el tenantId spoofeado NUNCA llega al service", async () => {
    // Mismo comportamiento documentado en members/schemas.ts
    // (updateLeadSchema/createMemberSchema): Fastify compila ajv con
    // `removeAdditional: true` por default, así que `additionalProperties:
    // false` no produce un 400 — descarta la propiedad desconocida ANTES de
    // que el handler la vea. Lo que importa para T-179-11 es que un intento
    // de mass-assignment de `tenantId` no tenga ningún efecto: el partner se
    // crea igual, con el tenant real del scope (TENANT_TEMPLO), nunca con el
    // spoofeado.
    const payload = basePayload() as PartnerCreateBody & {
      tenantId: number;
      hackField: string;
    };
    payload.tenantId = 999;
    payload.hackField = "no debería pasar";

    const res = await app.inject({
      method: "POST",
      url: BASE_URL,
      headers: { authorization: `Bearer ${adminToken}` },
      payload,
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body) as { id: number };
    const row = await rawPartnerRow(body.id);
    expect(row.tenant_id).toBe(TENANT_TEMPLO);
  });
});

describe("RBAC — MEMBER_LIFECYCLE_ROLES (T-179-10)", () => {
  it("403: coach en POST /", async () => {
    const res = await app.inject({
      method: "POST",
      url: BASE_URL,
      headers: { authorization: `Bearer ${coachToken}` },
      payload: basePayload(),
    });
    expect(res.statusCode).toBe(403);
  });

  it("403: coach en GET /", async () => {
    const res = await app.inject({
      method: "GET",
      url: BASE_URL,
      headers: { authorization: `Bearer ${coachToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it("403: coach en PATCH /:id", async () => {
    const { id } = await insertPartner(app, { tenantId: TENANT_TEMPLO });
    const res = await app.inject({
      method: "PATCH",
      url: `${BASE_URL}/${id}`,
      headers: { authorization: `Bearer ${coachToken}` },
      payload: { isActive: false },
    });
    expect(res.statusCode).toBe(403);
  });

  it("401: sin token en GET /", async () => {
    const res = await app.inject({ method: "GET", url: BASE_URL });
    expect(res.statusCode).toBe(401);
  });

  it("401: sin token en POST /", async () => {
    const res = await app.inject({
      method: "POST",
      url: BASE_URL,
      payload: basePayload(),
    });
    expect(res.statusCode).toBe(401);
  });
});

describe("PATCH /api/admin/referral-partners/:id — código inmutable (T-179-13)", () => {
  it("400: cambiar code es rechazado por el schema", async () => {
    const { id, code } = await insertPartner(app, { tenantId: TENANT_TEMPLO });
    const res = await app.inject({
      method: "PATCH",
      url: `${BASE_URL}/${id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { code: `${code}X` },
    });
    expect(res.statusCode).toBe(400);
  });

  it("200: benefitValue e isActive se actualizan y persisten", async () => {
    const { id } = await insertPartner(app, {
      tenantId: TENANT_TEMPLO,
      benefitType: "discount_percent",
      benefitValue: 10,
      isActive: true,
    });

    const res = await app.inject({
      method: "PATCH",
      url: `${BASE_URL}/${id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { benefitValue: 30, isActive: false },
    });
    expect(res.statusCode).toBe(200);

    const row = await rawPartnerRow(id);
    expect(row.benefit_value).toBe(30);
    expect(row.is_active).toBe(0);
  });
});

describe("GET /api/admin/referral-partners — aislamiento de tenant (D-20)", () => {
  afterAll(async () => {
    await cleanAllTestData(app);
    await limpiarSegundoGimnasio(app);
  });

  it("un partner de otro gimnasio nunca aparece en el listado", async () => {
    const gym2 = await seedSecondTenant(app);
    await insertPartner(app, {
      tenantId: TENANT_TEMPLO,
      name: "Partner de El Templo",
    });
    await insertPartner(app, {
      tenantId: TENANT_DOS,
      branchId: gym2.branchId,
      name: "Partner del gimnasio 2",
    });

    const res = await app.inject({
      method: "GET",
      url: BASE_URL,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const list = JSON.parse(res.body) as Array<{ name: string }>;
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((p) => p.name !== "Partner del gimnasio 2")).toBe(true);
  });
});
