/**
 * Fase 179 (D-03/D-13/D-20) — `PartnerReferralService`: CRUD tenancy-native
 * del comercio/marca partner.
 *
 * Lo que estos tests defienden, en orden de importancia:
 *  1. `normalizeCode` — upper + strip + trunca a 24: defensa contra la
 *     incertidumbre de colación de MySQL (A1 del RESEARCH), aplicada al
 *     guardar.
 *  2. La validación cruzada de los 3 espacios de nombres (D-03): un código no
 *     puede colisionar con OTRO partner, con un socio (`users.referral_code`)
 *     ni con una promo (`promo_plans.promo_code`) del mismo tenant — los tres
 *     casos lanzan `ConflictError` (409).
 *  3. `currency` se deriva SIEMPRE de `branches.country` (D-13), nunca del
 *     payload (T-179-07).
 *  4. Aislamiento de tenant (D-20): `listPartners` nunca devuelve un partner
 *     de otro gimnasio.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { eq, sql, and } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { createTestApp, cleanAllTestData, getAuthToken } from "../helpers";
import { createPlan } from "../subscriptions/_helpers";
import { insertBranch, insertPartner, nextCode } from "./_helpers";
import {
  seedSecondTenant,
  limpiarSegundoGimnasio,
  TENANT_DOS,
  TENANT_TEMPLO,
} from "../fixtures/second-tenant";
import {
  PartnerReferralService,
  normalizeCode,
} from "../../src/modules/referral-partners/service";
import {
  BadRequestError,
  ConflictError,
} from "../../src/modules/shared/errors";
import { tenantValues, tenantWhere } from "../../src/modules/shared/tenant";
import * as schema from "../../src/db/schema";

let app: FastifyInstance;
let adminId: number;
let service: PartnerReferralService;
const AR_BRANCH_ID = 1; // sede seed de test/setup.ts, country = 'AR'.

beforeAll(async () => {
  app = await createTestApp();
  await getAuthToken(app, "admin@test.com", "adminpass123"); // valida el seed

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

  service = new PartnerReferralService(app.db, app.log);
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await cleanAllTestData(app);
});

describe("normalizeCode", () => {
  it("mayúsculas, sin caracteres fuera de [A-Z0-9], recortado a 24", () => {
    expect(normalizeCode(" cafe-x ")).toBe("CAFEX");
    expect(normalizeCode("a".repeat(30))).toBe("A".repeat(24));
    expect(normalizeCode("a".repeat(30))).toHaveLength(24);
  });
});

describe("createPartner", () => {
  it("guarda el código normalizado en mayúsculas", async () => {
    const suffix = nextCode("x").toLowerCase();
    const raw = ` cafe-${suffix} `;

    const result = await service.createPartner(
      { tenantId: TENANT_TEMPLO },
      {
        name: "Café X",
        code: raw,
        branchId: AR_BRANCH_ID,
        benefitType: "discount_percent",
        benefitValue: 15,
        commissionType: "fixed",
        commissionValue: 3000,
      },
      adminId,
    );

    // Fila CRUDA por SQL (no el DTO del servicio) — misma disciplina que
    // `referralRow` en test/referrals/admin-assign-referrer.test.ts, incluido
    // `tenant_id` en la aserción (D-20: el insert nunca deja el gimnasio en NULL
    // ni en un valor inventado).
    const rawRows = await app.db.execute(
      sql`SELECT code, tenant_id FROM referral_partners WHERE id = ${result.id}`,
    );
    const [rawRow] = rawRows[0] as unknown as Array<{
      code: string;
      tenant_id: number;
    }>;
    expect(rawRow.code).toBe(normalizeCode(raw));
    expect(rawRow.code).toMatch(/^[A-Z0-9]+$/);
    expect(rawRow.tenant_id).toBe(TENANT_TEMPLO);
  });

  it("409 si el código ya lo usa OTRO partner del mismo tenant (D-03)", async () => {
    const { code } = await insertPartner(app, { tenantId: TENANT_TEMPLO });

    await expect(
      service.createPartner(
        { tenantId: TENANT_TEMPLO },
        {
          name: "Otro partner",
          code,
          branchId: AR_BRANCH_ID,
          benefitType: "discount_percent",
          benefitValue: 10,
          commissionType: "fixed",
          commissionValue: 1000,
        },
        adminId,
      ),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("409 si el código ya lo usa un socio (users.referral_code, D-03)", async () => {
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

    await expect(
      service.createPartner(
        { tenantId: TENANT_TEMPLO },
        {
          name: "Partner choca con socio",
          code,
          branchId: AR_BRANCH_ID,
          benefitType: "discount_percent",
          benefitValue: 10,
          commissionType: "fixed",
          commissionValue: 1000,
        },
        adminId,
      ),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("409 si el código ya lo usa una promo (promo_plans.promo_code, D-03)", async () => {
    const adminToken = await getAuthToken(
      app,
      "admin@test.com",
      "adminpass123",
    );
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

    await expect(
      service.createPartner(
        { tenantId: TENANT_TEMPLO },
        {
          name: "Partner choca con promo",
          code,
          branchId: AR_BRANCH_ID,
          benefitType: "discount_percent",
          benefitValue: 10,
          commissionType: "fixed",
          commissionValue: 1000,
        },
        adminId,
      ),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("400 si el descuento está fuera de 1..100", async () => {
    const base = {
      name: "Partner descuento inválido",
      branchId: AR_BRANCH_ID,
      benefitType: "discount_percent" as const,
      commissionType: "fixed" as const,
      commissionValue: 1000,
    };

    await expect(
      service.createPartner(
        { tenantId: TENANT_TEMPLO },
        { ...base, code: nextCode("BV0"), benefitValue: 0 },
        adminId,
      ),
    ).rejects.toBeInstanceOf(BadRequestError);

    await expect(
      service.createPartner(
        { tenantId: TENANT_TEMPLO },
        { ...base, code: nextCode("BV1"), benefitValue: 101 },
        adminId,
      ),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it("400 si free_pass trae un benefitValue distinto de 0", async () => {
    await expect(
      service.createPartner(
        { tenantId: TENANT_TEMPLO },
        {
          name: "Partner semana gratis mal",
          code: nextCode("FP"),
          branchId: AR_BRANCH_ID,
          benefitType: "free_pass",
          benefitValue: 5,
          commissionType: "fixed",
          commissionValue: 1000,
        },
        adminId,
      ),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it("400 si commissionValue es negativo", async () => {
    await expect(
      service.createPartner(
        { tenantId: TENANT_TEMPLO },
        {
          name: "Partner comisión negativa",
          code: nextCode("CV"),
          branchId: AR_BRANCH_ID,
          benefitType: "discount_percent",
          benefitValue: 10,
          commissionType: "fixed",
          commissionValue: -100,
        },
        adminId,
      ),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it("deriva currency='ARS' de una sede AR (D-13)", async () => {
    const result = await service.createPartner(
      { tenantId: TENANT_TEMPLO },
      {
        name: "Partner AR",
        code: nextCode("AR"),
        branchId: AR_BRANCH_ID,
        benefitType: "discount_percent",
        benefitValue: 10,
        commissionType: "fixed",
        commissionValue: 1000,
      },
      adminId,
    );
    const partner = await service.getPartner(
      { tenantId: TENANT_TEMPLO },
      result.id,
    );
    expect(partner.currency).toBe("ARS");
    expect(partner.country).toBe("AR");
  });

  it("deriva currency='EUR' de una sede ES (D-13)", async () => {
    const esBranch = await insertBranch(app, { country: "ES" });

    const result = await service.createPartner(
      { tenantId: TENANT_TEMPLO },
      {
        name: "Partner ES",
        code: nextCode("ES"),
        branchId: esBranch.id,
        benefitType: "discount_percent",
        benefitValue: 10,
        commissionType: "fixed",
        commissionValue: 1000,
      },
      adminId,
    );
    const partner = await service.getPartner(
      { tenantId: TENANT_TEMPLO },
      result.id,
    );
    expect(partner.currency).toBe("EUR");
    expect(partner.country).toBe("ES");
  });
});

describe("listPartners — aislamiento de tenant (D-20)", () => {
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

    const rows = await service.listPartners({ tenantId: TENANT_TEMPLO }, {});
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.name !== "Partner del gimnasio 2")).toBe(true);
  });
});
