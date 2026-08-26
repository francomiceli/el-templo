/**
 * Fase 179 Plan 10 (D-20, D-08 reescrita) — reportes de conversiones y de
 * beneficios de partner sin conversión.
 *
 * Lo que estos tests defienden, en orden de importancia:
 *  1. `GET /conversions` devuelve una fila por vínculo con nombre del socio,
 *     estado y datos de comisión (sin N+1), y filtra por `partnerId`/`status`.
 *  2. Aislamiento de tenant: nunca devuelve vínculos de otro gimnasio.
 *  3. `GET /benefits-without-conversion` cubre los DOS motivos
 *     (`semana_sin_conversion` / `beneficio_vencido_sin_uso`) por separado, y
 *     excluye a un socio que consumió la semana y DESPUÉS pagó (D-08
 *     reescrita: el reporte es sobre lo que NO convirtió).
 *  4. Ninguna de las dos rutas escribe `users.lead_status` — el reemplazo del
 *     funnel de leads (D-08) es un reporte propio, no un flip de estado.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { eq, and } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { createTestApp, getAuthToken, cleanAllTestData } from "../helpers";
import { createMember } from "../subscriptions/_helpers";
import * as schema from "../../src/db/schema";
import { insertPartner, insertPartnerLink } from "./_helpers";
import { tenantWhere } from "../../src/modules/shared/tenant";
import {
  seedSecondTenant,
  limpiarSegundoGimnasio,
  TENANT_DOS,
  TENANT_TEMPLO,
} from "../fixtures/second-tenant";

const AR_BRANCH_ID = 1; // sede seed de test/setup.ts, tenant 1, country='AR'.

let app: FastifyInstance;
let adminToken: string;
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
  return `rep-${prefix}-${seq}-${Date.now()}@test.com`;
}

interface ConversionRowBody {
  linkId: number;
  referredId: number;
  referredName: string;
  partnerId: number;
  status: string;
  commissionId: number | null;
  commissionStatus: string | null;
  commissionAmount: number | null;
}

interface BenefitWithoutConversionRowBody {
  linkId: number;
  referredId: number;
  referredName: string;
  referredPhone: string | null;
  partnerId: number;
  motivo: string;
}

async function getConversions(
  qs = "",
  token = adminToken,
): Promise<{ statusCode: number; body: ConversionRowBody[] }> {
  const res = await app.inject({
    method: "GET",
    url: `/api/admin/referral-partners/conversions${qs}`,
    headers: { authorization: `Bearer ${token}` },
  });
  return {
    statusCode: res.statusCode,
    body: JSON.parse(res.body) as ConversionRowBody[],
  };
}

async function getBenefitsWithoutConversion(
  qs = "",
  token = adminToken,
): Promise<{ statusCode: number; body: BenefitWithoutConversionRowBody[] }> {
  const res = await app.inject({
    method: "GET",
    url: `/api/admin/referral-partners/benefits-without-conversion${qs}`,
    headers: { authorization: `Bearer ${token}` },
  });
  return {
    statusCode: res.statusCode,
    body: JSON.parse(res.body) as BenefitWithoutConversionRowBody[],
  };
}

describe("GET /api/admin/referral-partners/conversions", () => {
  it("(1) una fila por vínculo con nombre del socio, estado y datos de comisión; filtra por partnerId y status", async () => {
    const partnerA = await insertPartner(app, {
      tenantId: TENANT_TEMPLO,
      commissionType: "fixed",
      commissionValue: 5000,
    });
    const partnerB = await insertPartner(app, {
      tenantId: TENANT_TEMPLO,
      commissionType: "fixed",
      commissionValue: 3000,
    });
    const memberA = await createMember(app, {
      email: email("conv-a"),
      branchId: AR_BRANCH_ID,
      firstName: "Ana",
      lastName: "Referida",
    });
    const memberB = await createMember(app, {
      email: email("conv-b"),
      branchId: AR_BRANCH_ID,
      firstName: "Bruno",
      lastName: "Pendiente",
    });
    await insertPartnerLink(app, {
      partnerId: partnerA.id,
      referredId: memberA.id,
      status: "qualified",
    });
    await insertPartnerLink(app, {
      partnerId: partnerB.id,
      referredId: memberB.id,
      status: "pending",
    });

    const all = await getConversions();
    expect(all.statusCode).toBe(200);
    expect(all.body.length).toBeGreaterThanOrEqual(2);
    const rowA = all.body.find((r) => r.referredId === memberA.id);
    expect(rowA).toBeDefined();
    expect(rowA?.referredName).toBe("Ana Referida");
    expect(rowA?.status).toBe("qualified");
    expect(rowA?.partnerId).toBe(partnerA.id);

    const byPartner = await getConversions(`?partnerId=${partnerA.id}`);
    expect(byPartner.statusCode).toBe(200);
    expect(byPartner.body.every((r) => r.partnerId === partnerA.id)).toBe(true);
    expect(byPartner.body.some((r) => r.referredId === memberB.id)).toBe(false);

    const byStatus = await getConversions("?status=pending");
    expect(byStatus.statusCode).toBe(200);
    expect(byStatus.body.every((r) => r.status === "pending")).toBe(true);
    expect(byStatus.body.some((r) => r.referredId === memberA.id)).toBe(false);
  });

  it("(2) no devuelve vínculos de otro tenant", async () => {
    await limpiarSegundoGimnasio(app);
    const gym2 = await seedSecondTenant(app);
    const partnerOtro = await insertPartner(app, {
      tenantId: TENANT_DOS,
      branchId: gym2.branchId,
    });
    await insertPartnerLink(app, {
      partnerId: partnerOtro.id,
      referredId: gym2.socios[0].id,
      tenantId: TENANT_DOS,
    });

    const res = await getConversions();
    expect(res.statusCode).toBe(200);
    expect(res.body.every((r) => r.partnerId !== partnerOtro.id)).toBe(true);

    // Orden obligatorio (docblock de second-tenant.ts): cleanAllTestData
    // PRIMERO (vacía referral_partners/partner_referrals sin filtro de
    // tenant), limpiarSegundoGimnasio DESPUÉS — si se invierte, el DELETE de
    // branches/users del gimnasio 2 choca con el FK del partner recién
    // creado.
    await cleanAllTestData(app);
    await limpiarSegundoGimnasio(app);
  });
});

describe("GET /api/admin/referral-partners/benefits-without-conversion (D-08 reescrita)", () => {
  it("(3) incluye semana_sin_conversion y beneficio_vencido_sin_uso, excluye a quien consumió y después pagó", async () => {
    const partner = await insertPartner(app, { tenantId: TENANT_TEMPLO });

    // Caso A: semana gratis consumida hace 10 días, vínculo nunca qualified.
    const memberSemana = await createMember(app, {
      email: email("semana"),
      branchId: AR_BRANCH_ID,
      firstName: "Semana",
      lastName: "SinConversion",
      phone: "5491100000001",
    });
    await insertPartnerLink(app, {
      partnerId: partner.id,
      referredId: memberSemana.id,
      status: "pending",
      benefitType: "free_pass",
      benefitValue: 0,
      benefitStatus: "consumed",
      qualifiedAt: null,
    });
    await app.db
      .update(schema.partnerReferrals)
      .set({
        benefitConsumedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      })
      .where(eq(schema.partnerReferrals.referredId, memberSemana.id));

    // Caso B: beneficio pending vencido (benefit_expires_at en el pasado).
    const memberVencido = await createMember(app, {
      email: email("vencido"),
      branchId: AR_BRANCH_ID,
      firstName: "Beneficio",
      lastName: "Vencido",
    });
    await insertPartnerLink(app, {
      partnerId: partner.id,
      referredId: memberVencido.id,
      status: "pending",
      benefitType: "discount_percent",
      benefitValue: 15,
      benefitStatus: "pending",
      benefitExpiresAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
    });

    // Caso C: consumió la semana y DESPUÉS pagó (qualified) — NO debe salir.
    const memberConvertido = await createMember(app, {
      email: email("convertido"),
      branchId: AR_BRANCH_ID,
      firstName: "Convertido",
      lastName: "SiPago",
    });
    await insertPartnerLink(app, {
      partnerId: partner.id,
      referredId: memberConvertido.id,
      status: "qualified",
      benefitType: "free_pass",
      benefitValue: 0,
      benefitStatus: "consumed",
      qualifiedAt: new Date(),
    });
    await app.db
      .update(schema.partnerReferrals)
      .set({
        benefitConsumedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      })
      .where(eq(schema.partnerReferrals.referredId, memberConvertido.id));

    const res = await getBenefitsWithoutConversion();
    expect(res.statusCode).toBe(200);

    const rowSemana = res.body.find((r) => r.referredId === memberSemana.id);
    expect(rowSemana).toBeDefined();
    expect(rowSemana?.motivo).toBe("semana_sin_conversion");
    expect(rowSemana?.referredPhone).toBe("5491100000001");

    const rowVencido = res.body.find((r) => r.referredId === memberVencido.id);
    expect(rowVencido).toBeDefined();
    expect(rowVencido?.motivo).toBe("beneficio_vencido_sin_uso");

    expect(res.body.some((r) => r.referredId === memberConvertido.id)).toBe(
      false,
    );
  });

  it("(4) ninguna de las dos rutas modifica users.lead_status", async () => {
    const partner = await insertPartner(app, { tenantId: TENANT_TEMPLO });
    const member = await createMember(app, {
      email: email("lead"),
      branchId: AR_BRANCH_ID,
    });
    await insertPartnerLink(app, {
      partnerId: partner.id,
      referredId: member.id,
      status: "pending",
      benefitType: "discount_percent",
      benefitValue: 15,
      benefitStatus: "pending",
      benefitExpiresAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
    });

    const [before] = await app.db
      .select({ leadStatus: schema.users.leadStatus })
      .from(schema.users)
      .where(
        and(
          tenantWhere(schema.users, { tenantId: TENANT_TEMPLO }),
          eq(schema.users.id, member.id),
        ),
      )
      .limit(1);

    await getConversions();
    await getBenefitsWithoutConversion();

    const [after] = await app.db
      .select({ leadStatus: schema.users.leadStatus })
      .from(schema.users)
      .where(
        and(
          tenantWhere(schema.users, { tenantId: TENANT_TEMPLO }),
          eq(schema.users.id, member.id),
        ),
      )
      .limit(1);

    expect(after?.leadStatus).toBe(before?.leadStatus);
  });
});
