// Fase 193 Plan 01 (COM-01, D-20/D-21, T-193-01/T-193-03) — integración
// contra MySQL real. Casos (a)-(e) del plan:
//   (a) round-trip AR/ES
//   (b) formato inválido lanza y no escribe fila
//   (c) valor corrupto en base -> lectura fail-closed (null)
//   (d) aislamiento entre gimnasios
//   (e) resolveSalesNumberForUser resuelve por la sede del socio
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { like } from "drizzle-orm";
import { createTestApp, cleanAllTestData, createTestMember } from "../helpers";
import { tenantSettings } from "../../src/db/schema";
import {
  getSalesNumber,
  setSalesNumber,
  resolveSalesNumberForUser,
  salesNumberKey,
} from "../../src/modules/communications/sales-number";
import { tenantValues, type TenantContext } from "../../src/modules/shared/tenant";
import {
  TENANT_TEMPLO,
  seedSecondTenant,
  limpiarSegundoGimnasio,
} from "../fixtures/second-tenant";

describe("communications/sales-number (D-20/D-21)", () => {
  let app: FastifyInstance;
  const CTX_TEMPLO: TenantContext = { tenantId: TENANT_TEMPLO };

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    // Higiene entre archivos del mismo worker (isolate:false), mismo criterio
    // que scheduling-label-descriptions.test.ts: cleanAllTestData NO limpia
    // tenant_settings (KV compartido con module-flags), así que esta suite
    // limpia su propio namespace de settingKey.
    await app.db
      .delete(tenantSettings)
      .where(like(tenantSettings.settingKey, "whatsapp.sales_number.%"));
    await cleanAllTestData(app);
    await limpiarSegundoGimnasio(app);
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    await app.db
      .delete(tenantSettings)
      .where(like(tenantSettings.settingKey, "whatsapp.sales_number.%"));
  });

  it("(a) round-trip para AR y ES", async () => {
    expect(await getSalesNumber(app.db, CTX_TEMPLO, "AR")).toBeNull();
    expect(await getSalesNumber(app.db, CTX_TEMPLO, "ES")).toBeNull();

    await setSalesNumber(app.db, CTX_TEMPLO, "AR", "5492235820521");
    await setSalesNumber(app.db, CTX_TEMPLO, "ES", "34680774331");

    expect(await getSalesNumber(app.db, CTX_TEMPLO, "AR")).toBe(
      "5492235820521",
    );
    expect(await getSalesNumber(app.db, CTX_TEMPLO, "ES")).toBe(
      "34680774331",
    );

    // Re-escritura (upsert): no crea una segunda fila, pisa la existente.
    await setSalesNumber(app.db, CTX_TEMPLO, "AR", "5492235555555");
    expect(await getSalesNumber(app.db, CTX_TEMPLO, "AR")).toBe(
      "5492235555555",
    );
  });

  it("(b) setSalesNumber con formato inválido lanza y no escribe fila", async () => {
    await expect(
      setSalesNumber(app.db, CTX_TEMPLO, "AR", "+54 9 223 582-0521"),
    ).rejects.toThrow();

    expect(await getSalesNumber(app.db, CTX_TEMPLO, "AR")).toBeNull();
  });

  it("(c) un valor corrupto insertado a mano hace que getSalesNumber devuelva null (fail-closed)", async () => {
    // INSERT directo, sin pasar por setSalesNumber: la columna es texto libre
    // en DB, así que un valor corrupto es un escenario real (dato viejo,
    // migración incompleta, escritura fuera de este módulo).
    await app.db.insert(tenantSettings).values(
      tenantValues(CTX_TEMPLO, {
        settingKey: salesNumberKey("AR"),
        settingValue: "+54 9 223 582-0521",
      }),
    );

    expect(await getSalesNumber(app.db, CTX_TEMPLO, "AR")).toBeNull();
  });

  it("(d) aislamiento: el número de un gimnasio no es visible con el ctx del otro", async () => {
    const gym2 = await seedSecondTenant(app);
    const ctxDos: TenantContext = { tenantId: gym2.tenantId };

    await setSalesNumber(app.db, CTX_TEMPLO, "AR", "5492235820521");
    await setSalesNumber(app.db, ctxDos, "AR", "5493511234567");

    // Evidencia leída de la base con el ctx de CADA tenant — no cruzan.
    expect(await getSalesNumber(app.db, CTX_TEMPLO, "AR")).toBe(
      "5492235820521",
    );
    expect(await getSalesNumber(app.db, ctxDos, "AR")).toBe("5493511234567");
    expect(await getSalesNumber(app.db, ctxDos, "AR")).not.toBe(
      "5492235820521",
    );

    // El Templo solo sembró AR: ES sigue null para los dos.
    expect(await getSalesNumber(app.db, CTX_TEMPLO, "ES")).toBeNull();
    expect(await getSalesNumber(app.db, ctxDos, "ES")).toBeNull();
  });

  it("(e) resolveSalesNumberForUser devuelve el número del país de la sede del socio", async () => {
    const member = await createTestMember(app); // branchId default = 1 (country AR)
    await setSalesNumber(app.db, CTX_TEMPLO, "AR", "5492235820521");

    const result = await resolveSalesNumberForUser(
      app.db,
      CTX_TEMPLO,
      member.id,
    );

    expect(result.country).toBe("AR");
    expect(result.number).toBe("5492235820521");
  });

  it("(e-bis) resolveSalesNumberForUser sin número cargado devuelve number: null", async () => {
    const member = await createTestMember(app);

    const result = await resolveSalesNumberForUser(
      app.db,
      CTX_TEMPLO,
      member.id,
    );

    expect(result.country).toBe("AR");
    expect(result.number).toBeNull();
  });
});
