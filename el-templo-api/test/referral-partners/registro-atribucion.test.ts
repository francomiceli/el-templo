/**
 * Fase 179 Plan 04 (D-02/D-03/D-07) — cuarto bloque best-effort de
 * `POST /api/auth/register`: atribución de partner en el alta.
 *
 * Lo que estos tests defienden, en orden de importancia:
 *  1. Un `code` de partner activo crea `partner_referrals` pending con
 *     snapshot del beneficio y vencimiento a 30 días (D-07) — y la
 *     respuesta expone `partnerBenefit` con esos mismos datos.
 *  2. Un `code` inválido/inexistente/inactivo NUNCA bloquea el alta: 201/200
 *     con 0 filas en `partner_referrals` y `partnerBenefit: null`
 *     (T-179-17, degradación graceful — el corazón de este plan).
 *  3. `code` normaliza igual que el CRUD de partners: minúsculas + guion
 *     matchean el código guardado en mayúsculas sin guion.
 *  4. Back-compat total: `ref`/`promoCode` del body siguen funcionando
 *     exactamente igual cuando NO viene `code` (Pitfall 9).
 *  5. `code` es el campo unificado: cuando resuelve a promo o a socio,
 *     dispara ESE bloque y ninguno crea `partner_referrals`.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { eq, and } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { createTestApp, cleanAllTestData } from "../helpers";
import { referrals } from "../../src/db/schema/referrals";
import { promoPlans } from "../../src/db/schema/promo-plans";
import { subscriptionPlans } from "../../src/db/schema/subscription-plans";
import { subscriptions } from "../../src/db/schema/subscriptions";
import { users } from "../../src/db/schema/users";
import { partnerReferrals } from "../../src/db/schema/partner-referrals";
import { tenantValues, tenantWhere } from "../../src/modules/shared/tenant";
import { TENANT_TEMPLO } from "../fixtures/second-tenant";
import { insertPartner, partnerLinkRow } from "./_helpers";

let app: FastifyInstance;
const AR_BRANCH_ID = 1; // sede seed de test/setup.ts, tenant 1, country AR.

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await cleanAllTestData(app);
});

/** Payload de registro con defaults únicos por llamada (evita colisión de email/phone/dni). */
function makeRegPayload(overrides: Record<string, unknown> = {}) {
  const unique =
    Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  return {
    email: `partner-signup-${unique}@test.com`,
    password: "password123",
    firstName: "Cliente",
    lastName: "Partner",
    branchId: AR_BRANCH_ID,
    dni: `PSIGN-${unique}`,
    phone: `+549${unique.replace(/\D/g, "").padEnd(10, "1").slice(0, 10)}`,
    gender: "male",
    ...overrides,
  };
}

async function seedPromo(
  app: FastifyInstance,
  overrides: {
    promoCode?: string;
    isActive?: boolean;
  } = {},
): Promise<{ promoCode: string }> {
  const [planResult] = await app.db
    .insert(subscriptionPlans)
    .values(
      tenantValues(
        { tenantId: TENANT_TEMPLO },
        {
          name: "Test Promo Plan (179-04)",
          planTier: "other",
          bookingMode: "flexible",
          priceRegular: 0,
          priceZero: 0,
          durationDays: 30,
          planCategory: "online_regular",
          isTrial: true,
        },
      ),
    )
    .$returningId();

  const now = new Date();
  const promoCode = overrides.promoCode ?? "REG04PROMO";
  await app.db.insert(promoPlans).values(
    tenantValues(
      { tenantId: TENANT_TEMPLO },
      {
        name: "Test Promo 179-04",
        promoCode,
        planDurationDays: 30,
        subscriptionPlanId: planResult.id,
        startDate: new Date(now.getTime() - 86400000),
        expiryDate: new Date(now.getTime() + 86400000),
        promoType: "auto" as const,
        isActive: overrides.isActive ?? true,
      },
    ),
  );
  return { promoCode };
}

describe("POST /api/auth/register — atribución de partner (code, 179-04)", () => {
  it("code de partner activo crea el vínculo pending con snapshot y vencimiento a 30 días", async () => {
    const partner = await insertPartner(app, {
      benefitType: "discount_percent",
      benefitValue: 30,
    });
    const before = Date.now();

    const res = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: makeRegPayload({ code: partner.code }),
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.partnerBenefit).toMatchObject({
      benefitType: "discount_percent",
      benefitValue: 30,
    });
    expect(typeof body.partnerBenefit.partnerName).toBe("string");
    expect(body.partnerBenefit.partnerName.length).toBeGreaterThan(0);

    const userId = body.user.id as number;
    const row = await partnerLinkRow(app, userId);
    expect(row).not.toBeNull();
    expect(row!.partner_id).toBe(partner.id);
    expect(row!.status).toBe("pending");
    expect(row!.benefit_status).toBe("pending");
    expect(row!.attribution_channel).toBe("self_service");
    expect(row!.tenant_id).toBe(1);
    expect(row!.benefit_type).toBe("discount_percent");
    expect(row!.benefit_value).toBe(30);
    expect(row!.qualified_at).toBeNull();

    // Vencimiento a 30 días desde el registro (D-07), tolerancia de minutos.
    // Leído vía SELECT tipado de Drizzle (no `partnerLinkRow`/SQL crudo): el
    // driver mysql2 parsea DATETIME con la timezone LOCAL del proceso (acá
    // America/Argentina, UTC-3) en el camino crudo, pero Drizzle normaliza
    // el valor en su capa de mapeo de columna — mismo criterio ya probado en
    // `test/auth/refresh-tokens.test.ts` (`newRow.expiresAt.getTime()`).
    const [typedRow] = await app.db
      .select({ benefitExpiresAt: partnerReferrals.benefitExpiresAt })
      .from(partnerReferrals)
      .where(eq(partnerReferrals.referredId, userId))
      .limit(1);
    const expiresAt = typedRow.benefitExpiresAt.getTime();
    const expected = before + 30 * 24 * 60 * 60 * 1000;
    expect(Math.abs(expiresAt - expected)).toBeLessThan(5 * 60 * 1000);
  });

  it("code inexistente: alta exitosa, 0 filas en partner_referrals, partnerBenefit null", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: makeRegPayload({ code: "NOEXISTE404" }),
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.partnerBenefit).toBeNull();

    const userId = body.user.id as number;
    const row = await partnerLinkRow(app, userId);
    expect(row).toBeNull();
  });

  it("code de partner INACTIVO: alta exitosa sin vínculo", async () => {
    const partner = await insertPartner(app, { isActive: false });

    const res = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: makeRegPayload({ code: partner.code }),
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.partnerBenefit).toBeNull();

    const row = await partnerLinkRow(app, body.user.id as number);
    expect(row).toBeNull();
  });

  it("code en minúsculas y con guion (cafe-x) resuelve al partner CAFEX y crea el vínculo", async () => {
    const partner = await insertPartner(app, { code: "CAFEX" });

    const res = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: makeRegPayload({ code: "cafe-x" }),
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.partnerBenefit).not.toBeNull();

    const row = await partnerLinkRow(app, body.user.id as number);
    expect(row).not.toBeNull();
    expect(row!.partner_id).toBe(partner.id);
  });

  it("back-compat: ref (código de socio) sin code sigue creando la fila en referrals", async () => {
    const [referrer] = await app.db
      .insert(users)
      .values(
        tenantValues(
          { tenantId: TENANT_TEMPLO },
          {
            email: `ref-backcompat-${Date.now()}@test.com`,
            passwordHash: "x",
            firstName: "Referrer",
            lastName: "Backcompat",
            branchId: AR_BRANCH_ID,
            role: "member",
            level: "alfa",
            status: "freemium" as const,
            referralCode: "BCK-A1B2",
          },
        ),
      )
      .$returningId();

    const res = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: makeRegPayload({ ref: "BCK-A1B2" }),
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.partnerBenefit).toBeNull();

    const links = await app.db
      .select()
      .from(referrals)
      .where(
        and(
          tenantWhere(referrals, { tenantId: TENANT_TEMPLO }),
          eq(referrals.referredId, body.user.id),
        ),
      );
    expect(links).toHaveLength(1);
    expect(links[0].referrerId).toBe(referrer.id);

    const partnerRow = await partnerLinkRow(app, body.user.id as number);
    expect(partnerRow).toBeNull();
  });

  it("back-compat: promoCode sin code sigue aplicando la promo", async () => {
    const { promoCode } = await seedPromo(app, { promoCode: "BCKPROMO" });

    const res = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: makeRegPayload({ promoCode }),
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.promoApplied).toBe(true);
    expect(body.partnerBenefit).toBeNull();

    const [sub] = await app.db
      .select()
      .from(subscriptions)
      .where(
        and(
          tenantWhere(subscriptions, { tenantId: TENANT_TEMPLO }),
          eq(subscriptions.userId, body.user.id),
        ),
      );
    expect(sub).toBeDefined();
  });

  it("code que resuelve a promo dispara el bloque promo y NO crea partner_referrals", async () => {
    const { promoCode } = await seedPromo(app, { promoCode: "UNIFIEDPROMO" });

    const res = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: makeRegPayload({ code: promoCode }),
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.promoApplied).toBe(true);
    expect(body.partnerBenefit).toBeNull();

    const row = await partnerLinkRow(app, body.user.id as number);
    expect(row).toBeNull();
  });

  it("code que resuelve a socio dispara el bloque ref y NO crea partner_referrals", async () => {
    const [referrer] = await app.db
      .insert(users)
      .values(
        tenantValues(
          { tenantId: TENANT_TEMPLO },
          {
            email: `unified-ref-${Date.now()}@test.com`,
            passwordHash: "x",
            firstName: "Unified",
            lastName: "Ref",
            branchId: AR_BRANCH_ID,
            role: "member",
            level: "alfa",
            status: "freemium" as const,
            referralCode: "UNI-F00D",
          },
        ),
      )
      .$returningId();

    const res = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: makeRegPayload({ code: "uni-f00d" }),
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.partnerBenefit).toBeNull();

    const links = await app.db
      .select()
      .from(referrals)
      .where(
        and(
          tenantWhere(referrals, { tenantId: TENANT_TEMPLO }),
          eq(referrals.referredId, body.user.id),
        ),
      );
    expect(links).toHaveLength(1);
    expect(links[0].referrerId).toBe(referrer.id);

    const row = await partnerLinkRow(app, body.user.id as number);
    expect(row).toBeNull();
  });
});
