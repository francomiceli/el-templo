/**
 * Fase 179 (D-02/D-03/T-179-06) — `resolveSignupCode`: resolución unificada
 * del campo manual único de código del registro.
 *
 * Lo que estos tests defienden, en orden de importancia:
 *  1. Mapea CUALQUIER string a exactamente una de las 4 ramas (`partner`,
 *     `member`, `promo`, `unknown`) y NUNCA lanza — ni ante un código
 *     inexistente ni ante un error interno (T-157-11/T-179-06).
 *  2. Un partner INACTIVO resuelve `unknown` (no se cae a otra rama: los 3
 *     espacios son disjuntos por D-03).
 *  3. El código se normaliza antes de cualquier lookup: tres formas
 *     distintas del mismo código escrito a mano resuelven igual.
 *  4. `branchId` acota la rama partner al tenant de esa sede.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { eq, and } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { createTestApp, cleanAllTestData, getAuthToken } from "../helpers";
import { createPlan, createMember } from "../subscriptions/_helpers";
import { insertPartner, nextCode } from "./_helpers";
import {
  seedSecondTenant,
  limpiarSegundoGimnasio,
  TENANT_DOS,
  TENANT_TEMPLO,
} from "../fixtures/second-tenant";
import { resolveSignupCode } from "../../src/modules/referral-partners/code-resolver";
import { tenantValues, tenantWhere } from "../../src/modules/shared/tenant";
import * as schema from "../../src/db/schema";

let app: FastifyInstance;
const AR_BRANCH_ID = 1; // sede seed de test/setup.ts, tenant 1.

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await cleanAllTestData(app);
});

describe("resolveSignupCode — rama partner", () => {
  it("un código de partner activo resuelve kind='partner' con el beneficio server-side", async () => {
    const partner = await insertPartner(app, {
      benefitType: "discount_percent",
      benefitValue: 25,
    });

    const result = await resolveSignupCode(app.db, app.log, partner.code, {
      branchId: AR_BRANCH_ID,
    });

    expect(result.kind).toBe("partner");
    if (result.kind === "partner") {
      expect(result.partnerId).toBe(partner.id);
      expect(result.tenantId).toBe(TENANT_TEMPLO);
      expect(result.benefitType).toBe("discount_percent");
      expect(result.benefitValue).toBe(25);
    }
  });

  it("un código de partner INACTIVO resuelve 'unknown' (no cae a otra rama)", async () => {
    const partner = await insertPartner(app, { isActive: false });

    const result = await resolveSignupCode(app.db, app.log, partner.code, {
      branchId: AR_BRANCH_ID,
    });
    expect(result.kind).toBe("unknown");
  });

  it("normaliza el código: 3 formas del mismo código resuelven igual", async () => {
    const partner = await insertPartner(app);
    const variants = [
      partner.code.toLowerCase(),
      ` ${partner.code} `,
      partner.code
        .split("")
        .map((c, i) => (i % 2 === 0 ? `-${c}` : c))
        .join(""),
    ];

    for (const variant of variants) {
      const result = await resolveSignupCode(app.db, app.log, variant, {
        branchId: AR_BRANCH_ID,
      });
      expect(result.kind).toBe("partner");
      if (result.kind === "partner") {
        expect(result.partnerId).toBe(partner.id);
      }
    }
  });

  it("con branchId, acota la resolución al tenant de esa sede", async () => {
    const gym2 = await seedSecondTenant(app);
    try {
      const partnerGym2 = await insertPartner(app, {
        tenantId: TENANT_DOS,
        branchId: gym2.branchId,
      });

      // La sede de El Templo (tenant 1) no puede resolver un código que solo
      // existe en el partner del gimnasio 2.
      const result = await resolveSignupCode(
        app.db,
        app.log,
        partnerGym2.code,
        { branchId: AR_BRANCH_ID },
      );
      expect(result.kind).toBe("unknown");

      // Pero desde la sede del gimnasio 2 sí resuelve.
      const resultGym2 = await resolveSignupCode(
        app.db,
        app.log,
        partnerGym2.code,
        { branchId: gym2.branchId },
      );
      expect(resultGym2.kind).toBe("partner");
      if (resultGym2.kind === "partner") {
        expect(resultGym2.tenantId).toBe(TENANT_DOS);
      }
    } finally {
      await cleanAllTestData(app);
      await limpiarSegundoGimnasio(app);
    }
  });

  it("un código inexistente resuelve 'unknown' sin lanzar", async () => {
    const result = await resolveSignupCode(app.db, app.log, "NOEXISTE999", {
      branchId: AR_BRANCH_ID,
    });
    expect(result.kind).toBe("unknown");
  });
});

describe("resolveSignupCode — rama promo", () => {
  it("un promo_code activo resuelve kind='promo'", async () => {
    const adminToken = await getAuthToken(
      app,
      "admin@test.com",
      "adminpass123",
    );
    const plan = await createPlan(app, adminToken);
    const code = nextCode("PROMO");
    const [row] = await app.db
      .insert(schema.promoPlans)
      .values(
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
      )
      .$returningId();

    const result = await resolveSignupCode(app.db, app.log, code, {
      branchId: AR_BRANCH_ID,
    });
    expect(result.kind).toBe("promo");
    if (result.kind === "promo") {
      expect(result.promoId).toBe(row.id);
    }
  });

  it("una promo inactiva no resuelve como promo", async () => {
    const adminToken = await getAuthToken(
      app,
      "admin@test.com",
      "adminpass123",
    );
    const plan = await createPlan(app, adminToken);
    const code = nextCode("INACTPROMO");
    await app.db.insert(schema.promoPlans).values(
      tenantValues(
        { tenantId: TENANT_TEMPLO },
        {
          name: `Promo inactiva ${code}`,
          promoCode: code,
          subscriptionPlanId: plan.id as number,
          startDate: new Date(),
          expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          country: "AR",
          isActive: false,
        },
      ),
    );

    const result = await resolveSignupCode(app.db, app.log, code, {
      branchId: AR_BRANCH_ID,
    });
    expect(result.kind).toBe("unknown");
  });
});

describe("resolveSignupCode — rama socio", () => {
  it("un users.referral_code resuelve kind='member'", async () => {
    const member = await createMember(app, {
      email: `code-resolver-member-${nextCode("m").toLowerCase()}@test.com`,
    });
    const code = nextCode("SOC");
    await app.db
      .update(schema.users)
      .set({ referralCode: code })
      .where(
        and(
          tenantWhere(schema.users, { tenantId: TENANT_TEMPLO }),
          eq(schema.users.id, member.id),
        ),
      );

    const result = await resolveSignupCode(app.db, app.log, code, {
      branchId: AR_BRANCH_ID,
    });
    expect(result.kind).toBe("member");
    if (result.kind === "member") {
      expect(result.referrerId).toBe(member.id);
    }
  });
});

describe("resolveSignupCode — orden y robustez", () => {
  it("un código vacío o solo-símbolos (normaliza a '') resuelve 'unknown'", async () => {
    const result = await resolveSignupCode(app.db, app.log, "   ---   ", {
      branchId: AR_BRANCH_ID,
    });
    expect(result.kind).toBe("unknown");
  });

  it("sin branchId, un código de partner único resuelve igual (D-03 fallback sin scope)", async () => {
    const partner = await insertPartner(app);

    const result = await resolveSignupCode(app.db, app.log, partner.code, {});
    expect(result.kind).toBe("partner");
    if (result.kind === "partner") {
      expect(result.partnerId).toBe(partner.id);
    }
  });
});
