/**
 * Phase 150 Plan 03 — ABM de cuentas bancarias (CTA-01 / CTA-02).
 *
 * Cubre los endpoints HTTP montados bajo /api/admin/finance sobre el
 * CashRegisterService (plan 02) y los schemas del plan 02:
 *   1. CTA-01 crear: 3 obligatorios (bankName/accountHolder/currency) + alias →
 *      201 con name derivado "Banco · alias" (D-03); regla uno-de-dos (D-02) →
 *      crear sin CBU/CVU ni Alias = 400; fallback de name con últimos 4 dígitos.
 *   2. CTA-01 editar: PATCH que completa campos → 200 y name recalculado.
 *   3. CTA-02 ciclo de vida: close (is_active=false, presente en el ABM pero
 *      ausente de las cajas operativas) y reactivate (is_active=true).
 *   4. D-12 autorización: gestion/coach en POST create → 403; owner → 201.
 *   5. Seed 'Retiros' (AR) presente tras la migración 0163.
 *   6. D-04 moneda fija: un PATCH con `currency` distinta NO cambia la moneda
 *      almacenada (schema additionalProperties:false la rechaza; el assert duro
 *      es que la moneda persistida sigue siendo la de creación).
 *
 * Reusa el harness createTestApp + createStaffUser + getAuthToken de
 * cost-centers.test.ts. Corre contra la MySQL de test del worker (migración 0163
 * agrega las 6 columnas bancarias y siembra 'Retiros').
 */

import { describe, it, beforeAll, afterAll, expect } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq, inArray, and } from "drizzle-orm";
import { createTestApp, getAuthToken, createStaffUser } from "../helpers";
import * as schema from "../../src/db/schema";

let app: FastifyInstance;
let ownerToken: string;
let gestionToken: string;
let coachToken: string;

const createdAccountIds: number[] = [];

interface BankAccountBody {
  account: {
    id: number;
    name: string;
    currency: string;
    isActive: boolean;
    bankName: string | null;
    accountHolder: string | null;
    taxId: string | null;
    cbuCvu: string | null;
    accountAlias: string | null;
    accountNumber: string | null;
    balance: number;
  };
}

async function createAccount(
  token: string,
  payload: Record<string, unknown>,
): Promise<{ statusCode: number; body: string }> {
  const res = await app.inject({
    method: "POST",
    url: "/api/admin/finance/cash-registers",
    headers: { authorization: `Bearer ${token}` },
    payload,
  });
  if (res.statusCode === 201) {
    const parsed = JSON.parse(res.body) as BankAccountBody;
    createdAccountIds.push(parsed.account.id);
  }
  return { statusCode: res.statusCode, body: res.body };
}

beforeAll(async () => {
  app = await createTestApp();

  const branchCode = `BA${Date.now() % 100000}`;
  const [branch] = await app.db
    .insert(schema.branches)
    .values({ name: "BA-Test AR", code: branchCode });
  const branchId = Number(branch.insertId);

  const ownerEmail = `ba-owner-${Date.now()}@test.com`;
  await createStaffUser(app, {
    email: ownerEmail,
    password: "TestPass123!",
    firstName: "Owner",
    lastName: "BA",
    role: "owner",
    branchId,
    country: "AR",
  });
  ownerToken = await getAuthToken(app, ownerEmail, "TestPass123!");

  const gestionEmail = `ba-gestion-${Date.now()}@test.com`;
  await createStaffUser(app, {
    email: gestionEmail,
    password: "TestPass123!",
    firstName: "Gestion",
    lastName: "BA",
    role: "gestion",
    branchId,
    country: "AR",
  });
  gestionToken = await getAuthToken(app, gestionEmail, "TestPass123!");

  const coachEmail = `ba-coach-${Date.now()}@test.com`;
  await createStaffUser(app, {
    email: coachEmail,
    password: "TestPass123!",
    firstName: "Coach",
    lastName: "BA",
    role: "coach",
    branchId,
  });
  coachToken = await getAuthToken(app, coachEmail, "TestPass123!");
});

afterAll(async () => {
  if (createdAccountIds.length > 0) {
    await app.db
      .delete(schema.cashRegisters)
      .where(inArray(schema.cashRegisters.id, createdAccountIds));
  }
  await app.close();
});

describe("Phase 150: ABM de cuentas bancarias", () => {
  // ─── CTA-01: crear ───────────────────────────────────────────────────────
  describe("CTA-01: POST /cash-registers (crear)", () => {
    it("crea con los 3 obligatorios + alias → 201 y name 'Banco · alias' (D-03)", async () => {
      const res = await createAccount(ownerToken, {
        bankName: "Banco Galicia",
        accountHolder: "El Templo SA",
        currency: "ARS",
        accountAlias: "templo.caja.ars",
      });
      expect(res.statusCode).toBe(201);
      const { account } = JSON.parse(res.body) as BankAccountBody;
      expect(account.name).toBe("Banco Galicia · templo.caja.ars");
      expect(account.currency).toBe("ARS");
      expect(account.isActive).toBe(true);
      expect(account.accountHolder).toBe("El Templo SA");
      expect(account.balance).toBe(0);
    });

    it("rechaza crear sin cbuCvu NI accountAlias → 400 (regla uno-de-dos, D-02)", async () => {
      const res = await createAccount(ownerToken, {
        bankName: "Banco Nación",
        accountHolder: "El Templo SA",
        currency: "ARS",
      });
      expect(res.statusCode).toBe(400);
    });

    it("crea solo con cbuCvu (sin alias) → 201 y name con fallback últimos 4", async () => {
      const res = await createAccount(ownerToken, {
        bankName: "Banco Provincia",
        accountHolder: "El Templo SA",
        currency: "ARS",
        cbuCvu: "0110599520000012345678",
      });
      expect(res.statusCode).toBe(201);
      const { account } = JSON.parse(res.body) as BankAccountBody;
      expect(account.name).toBe("Banco Provincia ····5678");
      expect(account.accountAlias).toBeNull();
    });
  });

  // ─── CTA-01: editar ──────────────────────────────────────────────────────
  describe("CTA-01: PATCH /cash-registers/:id (editar)", () => {
    it("un PATCH que completa campos recalcula el name → 200", async () => {
      const created = await createAccount(ownerToken, {
        bankName: "Banco Macro",
        accountHolder: "El Templo SA",
        currency: "ARS",
        accountAlias: "macro.alias",
      });
      expect(created.statusCode).toBe(201);
      const id = (JSON.parse(created.body) as BankAccountBody).account.id;

      const res = await app.inject({
        method: "PATCH",
        url: `/api/admin/finance/cash-registers/${id}`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { taxId: "30-12345678-9", cbuCvu: "2850590940090418135201" },
      });
      expect(res.statusCode).toBe(200);
      const { account } = JSON.parse(res.body) as BankAccountBody;
      // Sigue con alias → el name se deriva del alias (prioridad D-03).
      expect(account.name).toBe("Banco Macro · macro.alias");
      expect(account.taxId).toBe("30-12345678-9");
      expect(account.cbuCvu).toBe("2850590940090418135201");
    });
  });

  // ─── CTA-02: ciclo de vida ───────────────────────────────────────────────
  describe("CTA-02: close / reactivate", () => {
    it("close → 200 y la cuenta queda en el ABM (isActive=false) pero fuera de las cajas operativas", async () => {
      const created = await createAccount(ownerToken, {
        bankName: "Banco Ciudad",
        accountHolder: "El Templo SA",
        currency: "ARS",
        accountAlias: "ciudad.alias",
      });
      const id = (JSON.parse(created.body) as BankAccountBody).account.id;

      const close = await app.inject({
        method: "POST",
        url: `/api/admin/finance/cash-registers/${id}/close`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(close.statusCode).toBe(200);

      // Presente en el listado del ABM con isActive=false (D-07: incluye cerradas).
      const abm = await app.inject({
        method: "GET",
        url: "/api/admin/finance/cash-registers",
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(abm.statusCode).toBe(200);
      const accounts = (
        JSON.parse(abm.body) as { accounts: BankAccountBody["account"][] }
      ).accounts;
      const closed = accounts.find((a) => a.id === id);
      expect(closed).toBeDefined();
      expect(closed?.isActive).toBe(false);

      // Ausente de las cajas activas operativas (balances filtra isActive=true).
      const balances = await app.inject({
        method: "GET",
        url: "/api/admin/finance/cash-registers/balances",
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(balances.statusCode).toBe(200);
      const rows = JSON.parse(balances.body) as Array<{
        cashRegisterId: number;
      }>;
      expect(rows.some((r) => r.cashRegisterId === id)).toBe(false);
    });

    it("reactivate → 200 y isActive=true", async () => {
      const created = await createAccount(ownerToken, {
        bankName: "Banco Santander",
        accountHolder: "El Templo SA",
        currency: "ARS",
        accountAlias: "santander.alias",
      });
      const id = (JSON.parse(created.body) as BankAccountBody).account.id;

      await app.inject({
        method: "POST",
        url: `/api/admin/finance/cash-registers/${id}/close`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });

      const res = await app.inject({
        method: "POST",
        url: `/api/admin/finance/cash-registers/${id}/reactivate`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(res.statusCode).toBe(200);
      const { account } = JSON.parse(res.body) as BankAccountBody;
      expect(account.isActive).toBe(true);
    });
  });

  // ─── D-12: autorización admin/owner-only ─────────────────────────────────
  describe("D-12: guard admin/owner en escritura", () => {
    it("gestion en POST create → 403", async () => {
      const res = await createAccount(gestionToken, {
        bankName: "Banco Comafi",
        accountHolder: "El Templo SA",
        currency: "ARS",
        accountAlias: "comafi.alias",
      });
      expect(res.statusCode).toBe(403);
    });

    it("coach en POST create → 403", async () => {
      // coach ni siquiera pasa el hook FINANCE_READ_ROLES del módulo → 403.
      const res = await createAccount(coachToken, {
        bankName: "Banco BBVA",
        accountHolder: "El Templo SA",
        currency: "ARS",
        accountAlias: "bbva.alias",
      });
      expect(res.statusCode).toBe(403);
    });

    it("owner en POST create → 201", async () => {
      const res = await createAccount(ownerToken, {
        bankName: "Banco Patagonia",
        accountHolder: "El Templo SA",
        currency: "ARS",
        accountAlias: "patagonia.alias",
      });
      expect(res.statusCode).toBe(201);
    });
  });

  // ─── Seed 'Retiros' (migración 0163) ─────────────────────────────────────
  describe("Seed 'Retiros'", () => {
    it("el centro de costo 'Retiros' (AR) existe tras la migración 0163", async () => {
      const rows = await app.db
        .select({ id: schema.costCenters.id })
        .from(schema.costCenters)
        .where(
          and(
            eq(schema.costCenters.name, "Retiros"),
            eq(schema.costCenters.country, "AR"),
          ),
        );
      expect(rows.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ─── D-04: moneda fija post-creación ─────────────────────────────────────
  describe("D-04: moneda inmutable en PATCH", () => {
    it("un PATCH con currency distinta NO cambia la moneda almacenada", async () => {
      const created = await createAccount(ownerToken, {
        bankName: "Banco Hipotecario",
        accountHolder: "El Templo SA",
        currency: "ARS",
        accountAlias: "hipo.alias",
      });
      const id = (JSON.parse(created.body) as BankAccountBody).account.id;

      // Body con `currency` extra (rechazado por additionalProperties:false) +
      // un campo válido para que el intento no quede vacío.
      await app.inject({
        method: "PATCH",
        url: `/api/admin/finance/cash-registers/${id}`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { currency: "EUR", taxId: "30-99999999-9" },
      });

      // El assert duro: la moneda ALMACENADA sigue siendo 'ARS'.
      const abm = await app.inject({
        method: "GET",
        url: "/api/admin/finance/cash-registers",
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      const accounts = (
        JSON.parse(abm.body) as { accounts: BankAccountBody["account"][] }
      ).accounts;
      const row = accounts.find((a) => a.id === id);
      expect(row?.currency).toBe("ARS");
    });
  });
});
