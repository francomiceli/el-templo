/**
 * Domiciliación bancaria (SEPA) — España.
 *
 * Cubre:
 *  - PUT /admin/members/:userId con sepaDetails → upsert + normalización de IBAN.
 *  - Validación de IBAN (mod-97) → 400.
 *  - GET /admin/members/:userId → sepaDetails + branchCountry en la respuesta
 *    (gotcha del serializer de Fastify: campos no declarados se stripean).
 *  - GET /admin/members/export-sepa → solo sedes ES, activos-en-vivo por
 *    default (EXISTS sobre subscriptions), status=todos incluye inactivos,
 *    403 para roles sin permiso y para scope de país ≠ ES.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { Workbook } from "exceljs";
import {
  createTestApp,
  getAuthToken,
  cleanAllTestData,
  createStaffUser,
  createTestMember,
  dateOffsetStr,
} from "../helpers";
import * as schema from "../../src/db/schema";

const VALID_IBAN_SPACED = "ES91 2100 0418 4502 0005 1332";
const VALID_IBAN = "ES9121000418450200051332";
const INVALID_IBAN = "ES0021000418450200051332";

describe("Domiciliación bancaria (SEPA)", () => {
  let app: FastifyInstance;
  let ownerToken: string;
  let esAdminToken: string;
  let arAdminToken: string;
  let coachToken: string;
  let esBranchId: number;
  let esPlanId: number;
  let esActiveMemberId: number;
  let esInactiveMemberId: number;
  let arMemberId: number;

  beforeAll(async () => {
    app = await createTestApp();
    await cleanAllTestData(app);

    // Branch 1 = AR (default); sede ES fresca.
    await app.db
      .update(schema.branches)
      .set({ country: "AR" })
      .where(eq(schema.branches.id, 1));
    const esBranchInsert = await app.db
      .insert(schema.branches)
      .values({ name: "Madrid Test", code: "MAD-T", country: "ES" })
      .$returningId();
    esBranchId = esBranchInsert[0].id;

    const esPlanInsert = await app.db
      .insert(schema.subscriptionPlans)
      .values({
        name: "Test ES Plan",
        planTier: "flex",
        bookingMode: "flexible",
        priceRegular: 70,
        priceZero: 50,
        durationDays: 30,
        classesPerWeek: 3,
        country: "ES",
        currency: "EUR",
      })
      .$returningId();
    esPlanId = esPlanInsert[0].id;

    ownerToken = await getAuthToken(app, "admin@test.com", "adminpass123");

    await createStaffUser(app, {
      email: "es-admin@test-sepa.com",
      password: "es-admin-pass",
      firstName: "ES",
      lastName: "Admin",
      role: "admin",
      branchId: esBranchId,
      country: "ES",
    });
    esAdminToken = await getAuthToken(
      app,
      "es-admin@test-sepa.com",
      "es-admin-pass",
    );

    await createStaffUser(app, {
      email: "ar-admin@test-sepa.com",
      password: "ar-admin-pass",
      firstName: "AR",
      lastName: "Admin",
      role: "admin",
      branchId: 1,
      country: "AR",
    });
    arAdminToken = await getAuthToken(
      app,
      "ar-admin@test-sepa.com",
      "ar-admin-pass",
    );

    await createStaffUser(app, {
      email: "coach@test-sepa.com",
      password: "coach-pass",
      firstName: "Coach",
      lastName: "Sepa",
      role: "coach",
      branchId: esBranchId,
    });
    coachToken = await getAuthToken(app, "coach@test-sepa.com", "coach-pass");

    // Socio ES con suscripción vigente (activo en vivo).
    const esActive = await createTestMember(app, {
      firstName: "Elena",
      lastName: "Domiciliada",
      branchId: esBranchId,
    });
    esActiveMemberId = esActive.id;
    await app.db.insert(schema.subscriptions).values({
      userId: esActiveMemberId,
      planId: esPlanId,
      branchId: esBranchId,
      status: "active",
      startDate: dateOffsetStr(-5),
      endDate: dateOffsetStr(25),
      pricePaid: 70,
      currency: "EUR",
      priceTypeApplied: "regular",
    });

    // Socio ES sin suscripción (inactivo).
    const esInactive = await createTestMember(app, {
      firstName: "Iker",
      lastName: "Inactivo",
      branchId: esBranchId,
    });
    esInactiveMemberId = esInactive.id;

    // Socio AR con suscripción vigente — nunca debe aparecer en el export SEPA.
    const arMember = await createTestMember(app, {
      firstName: "Ana",
      lastName: "Argentina",
      branchId: 1,
    });
    arMemberId = arMember.id;
    await app.db.insert(schema.subscriptions).values({
      userId: arMemberId,
      planId: esPlanId,
      branchId: 1,
      status: "active",
      startDate: dateOffsetStr(-5),
      endDate: dateOffsetStr(25),
      pricePaid: 15000,
      currency: "ARS",
      priceTypeApplied: "regular",
    });
  });

  afterAll(async () => {
    await cleanAllTestData(app);
    await app.close();
  });

  // ─── PUT sepaDetails ─────────────────────────────────────────────────

  it("PUT guarda sepaDetails y normaliza el IBAN (espacios fuera, mayúsculas)", async () => {
    const res = await app.inject({
      method: "PUT",
      url: `/api/admin/members/${esActiveMemberId}`,
      headers: { authorization: `Bearer ${esAdminToken}` },
      payload: {
        sepaDetails: {
          debtorName: "Elena Domiciliada Madre",
          nif: "12345678z",
          iban: VALID_IBAN_SPACED,
          address: "Calle Mayor 1",
          postalCode: "28001",
          city: "Madrid",
          country: "es",
        },
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.sepaDetails).toMatchObject({
      debtorName: "Elena Domiciliada Madre",
      nif: "12345678Z",
      iban: VALID_IBAN,
      address: "Calle Mayor 1",
      postalCode: "28001",
      city: "Madrid",
      country: "ES",
    });
    expect(body.branchCountry).toBe("ES");
  });

  it("PUT re-envía sepaDetails → actualiza la fila existente (upsert, no duplica)", async () => {
    const res = await app.inject({
      method: "PUT",
      url: `/api/admin/members/${esActiveMemberId}`,
      headers: { authorization: `Bearer ${esAdminToken}` },
      payload: {
        sepaDetails: {
          debtorName: "Elena Domiciliada",
          nif: "12345678Z",
          iban: VALID_IBAN,
          address: "Calle Mayor 2",
          postalCode: "28002",
          city: "Madrid",
          country: "ES",
        },
      },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).sepaDetails.address).toBe("Calle Mayor 2");

    const rows = await app.db
      .select({ id: schema.userSepaDetails.id })
      .from(schema.userSepaDetails)
      .where(eq(schema.userSepaDetails.userId, esActiveMemberId));
    expect(rows).toHaveLength(1);
  });

  it("PUT con IBAN inválido (checksum) → 400 y no persiste", async () => {
    const res = await app.inject({
      method: "PUT",
      url: `/api/admin/members/${esInactiveMemberId}`,
      headers: { authorization: `Bearer ${esAdminToken}` },
      payload: { sepaDetails: { iban: INVALID_IBAN } },
    });
    expect(res.statusCode).toBe(400);

    const rows = await app.db
      .select({ id: schema.userSepaDetails.id })
      .from(schema.userSepaDetails)
      .where(eq(schema.userSepaDetails.userId, esInactiveMemberId));
    expect(rows).toHaveLength(0);
  });

  it("PUT sin sepaDetails no toca los datos SEPA existentes", async () => {
    const res = await app.inject({
      method: "PUT",
      url: `/api/admin/members/${esActiveMemberId}`,
      headers: { authorization: `Bearer ${esAdminToken}` },
      payload: { phone: "+34600111222" },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).sepaDetails.iban).toBe(VALID_IBAN);
  });

  it("GET devuelve sepaDetails=null y branchCountry para socios sin datos", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/admin/members/${arMemberId}`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.sepaDetails).toBeNull();
    expect(body.branchCountry).toBe("AR");
  });

  // ─── Export ──────────────────────────────────────────────────────────

  async function exportSocios(
    token: string,
    query = "",
  ): Promise<{ statusCode: number; socios: string[]; ibans: string[] }> {
    const res = await app.inject({
      method: "GET",
      url: `/api/admin/members/export-sepa${query}`,
      headers: { authorization: `Bearer ${token}` },
    });
    if (res.statusCode !== 200) {
      return { statusCode: res.statusCode, socios: [], ibans: [] };
    }
    const wb = new Workbook();
    await wb.xlsx.load(res.rawPayload);
    const sheet = wb.worksheets[0];
    const socios: string[] = [];
    const ibans: string[] = [];
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // header
      socios.push(String(row.getCell(1).value ?? ""));
      ibans.push(String(row.getCell(7).value ?? ""));
    });
    return { statusCode: res.statusCode, socios, ibans };
  }

  it("export default: solo activos de sedes ES, con sus datos SEPA", async () => {
    const { statusCode, socios, ibans } = await exportSocios(esAdminToken);
    expect(statusCode).toBe(200);
    expect(socios).toContain("Elena Domiciliada");
    expect(socios).not.toContain("Iker Inactivo");
    expect(socios).not.toContain("Ana Argentina");
    expect(ibans).toContain(VALID_IBAN);
  });

  it("export status=todos incluye al socio ES inactivo (control de carga)", async () => {
    const { statusCode, socios } = await exportSocios(
      esAdminToken,
      "?status=todos",
    );
    expect(statusCode).toBe(200);
    expect(socios).toContain("Iker Inactivo");
    expect(socios).not.toContain("Ana Argentina");
  });

  it("export como owner (scope global) → 200", async () => {
    const { statusCode, socios } = await exportSocios(ownerToken);
    expect(statusCode).toBe(200);
    expect(socios).toContain("Elena Domiciliada");
  });

  it("export como coach → 403 (dato bancario sensible)", async () => {
    const { statusCode } = await exportSocios(coachToken);
    expect(statusCode).toBe(403);
  });

  it("export como admin AR → 403 (scope de país)", async () => {
    const { statusCode } = await exportSocios(arAdminToken);
    expect(statusCode).toBe(403);
  });
});
