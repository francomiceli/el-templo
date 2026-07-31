/**
 * Phase 147 Plan 01 — cost centers integration tests (EGR-01/02/03).
 *
 * Covers the three backend guarantees:
 *   1. EGR-01: GET /api/admin/finance/cost-centers lists the active centers of
 *      the caller's country (gestion scoped to AR; owner can narrow with
 *      ?country=ES → none of the AR rows). Coach (sin FINANCE_VOID_ROLES) → 403.
 *   2. EGR-02: POST /api/admin/finance/expenses rejects an expense without a
 *      costCenterId (400, schema) and with an inexistent/inactive one (400,
 *      service); a valid AR center → 201 and the row persists cost_center_id.
 *   3. EGR-03: listMovEgresos returns costCenterName on the expense row.
 *
 * Reuses the createTestApp + branch/caja bootstrap pattern from
 * movement-service.test.ts so the harness wiring is identical. Runs against the
 * per-worker test MySQL DB (migration 0161 seeds the 4 AR centers).
 */

import { describe, it, beforeAll, afterAll, expect } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq, inArray, and } from "drizzle-orm";
import { createTestApp, getAuthToken, createStaffUser } from "../helpers";
import * as schema from "../../src/db/schema";
import { CashRegisterService } from "../../src/modules/finance/cash-register-service";
import { TransactionService } from "../../src/modules/finance/transaction-service";
import { BalanceService } from "../../src/modules/finance/balance-service";
import { TENANT_TEMPLO } from "../fixtures/second-tenant";
import { tenantValues, tenantWhere } from "../../src/modules/shared/tenant";

/**
 * Fase 172 (ADO-01 / T-172-08-04): gimnasio de los call sites DIRECTOS al
 * service. Sale del fixture, nunca de un `1` a mano. Una sola constante y no
 * el objeto literal repetido en cada llamada: el dia que un caso ejercite
 * dos gimnasios, el segundo se agrega al lado y se ve la diferencia.
 *
 * Fase 172 (172-13): el mismo ctx filtra y estampa las queries DIRECTAS de este
 * archivo sobre `cost_centers`, `cash_registers`, `financial_transactions` y
 * `transaction_links` — cuatro de las seis tablas strict.
 */
const TEMPLO_CTX = { tenantId: TENANT_TEMPLO };

let app: FastifyInstance;
let txService: TransactionService;
let arsBranchId: number;
let cajaId: number;
let arCostCenterId: number;
let gestionToken: string;
let ownerToken: string;
let coachToken: string;

const CUTOFF = "2020-01-01"; // well before "today" so the expense counts
const seededCajaIds: number[] = [];

async function newCaja(opening = 0): Promise<number> {
  const [caja] = await app.db.insert(schema.cashRegisters).values(
    tenantValues(TEMPLO_CTX, {
      name: `CC-Test ${Date.now()}-${Math.random()}`,
      type: "efectivo",
      branchId: arsBranchId,
      currency: "ARS",
      openingBalance: opening,
      cutoffDate: CUTOFF,
    }),
  );
  const id = Number(caja.insertId);
  seededCajaIds.push(id);
  return id;
}

beforeAll(async () => {
  app = await createTestApp();
  const balanceService = new BalanceService(app.db, app.log);
  const cashRegisterService = new CashRegisterService(app.db, app.log);
  txService = new TransactionService(
    app.db,
    app.log,
    balanceService,
    cashRegisterService,
  );

  // An AR branch + its efectivo caja.
  const [arsBranch] = await app.db
    .insert(schema.branches)
    .values({ name: "CC-Test AR", code: `CCAR${Date.now() % 100000}` });
  arsBranchId = Number(arsBranch.insertId);
  cajaId = await newCaja(1000);

  // A valid AR cost center (seeded by migration 0161). Fallback-insert keeps the
  // harness robust if the seed drifts.
  const [center] = await app.db
    .select({ id: schema.costCenters.id })
    .from(schema.costCenters)
    .where(
      and(
        tenantWhere(schema.costCenters, TEMPLO_CTX),
        eq(schema.costCenters.country, "AR"),
        eq(schema.costCenters.isActive, true),
      ),
    )
    .limit(1);
  if (center) {
    arCostCenterId = center.id;
  } else {
    const [created] = await app.db
      .insert(schema.costCenters)
      .values(tenantValues(TEMPLO_CTX, { name: "Varios", country: "AR" }));
    arCostCenterId = Number(created.insertId);
  }

  // gestion (FINANCE_VOID_ROLES, AR) — registra egresos y ve centros.
  const gestionEmail = `cc-gestion-${Date.now()}@test.com`;
  await createStaffUser(app, {
    email: gestionEmail,
    password: "TestPass123!",
    firstName: "Gestion",
    lastName: "CC",
    role: "gestion",
    branchId: arsBranchId,
    country: "AR",
  });
  gestionToken = await getAuthToken(app, gestionEmail, "TestPass123!");

  // owner — puede acotar con ?country.
  const ownerEmail = `cc-owner-${Date.now()}@test.com`;
  await createStaffUser(app, {
    email: ownerEmail,
    password: "TestPass123!",
    firstName: "Owner",
    lastName: "CC",
    role: "owner",
    branchId: arsBranchId,
    country: "AR",
  });
  ownerToken = await getAuthToken(app, ownerEmail, "TestPass123!");

  // coach — sin FINANCE_VOID_ROLES.
  const coachEmail = `cc-coach-${Date.now()}@test.com`;
  await createStaffUser(app, {
    email: coachEmail,
    password: "TestPass123!",
    firstName: "Coach",
    lastName: "CC",
    role: "coach",
    branchId: arsBranchId,
  });
  coachToken = await getAuthToken(app, coachEmail, "TestPass123!");
});

afterAll(async () => {
  // Drop ledger rows referencing the seeded cajas + their links, then the cajas.
  if (seededCajaIds.length > 0) {
    const txRows = await app.db
      .select({ id: schema.financialTransactions.id })
      .from(schema.financialTransactions)
      .where(
        and(
          tenantWhere(schema.financialTransactions, TEMPLO_CTX),
          inArray(schema.financialTransactions.cashRegisterId, seededCajaIds),
        ),
      );
    const txIds = txRows.map((r) => r.id);
    if (txIds.length > 0) {
      await app.db
        .delete(schema.transactionLinks)
        .where(
          and(
            tenantWhere(schema.transactionLinks, TEMPLO_CTX),
            inArray(schema.transactionLinks.transactionId, txIds),
          ),
        );
      await app.db
        .delete(schema.financialTransactions)
        .where(
          and(
            tenantWhere(schema.financialTransactions, TEMPLO_CTX),
            inArray(schema.financialTransactions.id, txIds),
          ),
        );
    }
    await app.db
      .delete(schema.cashRegisters)
      .where(
        and(
          tenantWhere(schema.cashRegisters, TEMPLO_CTX),
          inArray(schema.cashRegisters.id, seededCajaIds),
        ),
      );
  }
  await app.close();
});

describe("Phase 147: cost centers", () => {
  // ─── EGR-01: GET /cost-centers (list by country + RBAC) ──────────────────
  describe("EGR-01: GET /cost-centers", () => {
    it("gestion (AR) gets the 4 seeded AR centers, all active", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/admin/finance/cost-centers",
        headers: { authorization: `Bearer ${gestionToken}` },
      });
      expect(res.statusCode).toBe(200);
      const rows = JSON.parse(res.body) as Array<{
        id: number;
        name: string;
        country: string;
      }>;
      expect(rows.length).toBeGreaterThanOrEqual(4);
      expect(rows.every((r) => r.country === "AR")).toBe(true);
      const names = rows.map((r) => r.name);
      expect(names).toContain("Alquiler");
      expect(names).toContain("Librería");
      expect(names).toContain("Viáticos");
      expect(names).toContain("Varios");
    });

    it("owner narrowing with ?country=ES returns none of the AR centers", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/admin/finance/cost-centers?country=ES",
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(res.statusCode).toBe(200);
      const rows = JSON.parse(res.body) as Array<{
        name: string;
        country: string;
      }>;
      expect(rows.every((r) => r.country === "ES")).toBe(true);
      expect(rows.map((r) => r.name)).not.toContain("Varios");
    });

    it("a coach (no FINANCE_VOID_ROLES) gets 403", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/admin/finance/cost-centers",
        headers: { authorization: `Bearer ${coachToken}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  // ─── EGR-02: POST /expenses requires a valid cost center ─────────────────
  describe("EGR-02: POST /expenses requires costCenterId", () => {
    it("rejects an expense WITHOUT costCenterId (400, schema)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/admin/finance/expenses",
        headers: { authorization: `Bearer ${gestionToken}` },
        payload: { cajaId, amount: 100 },
      });
      expect(res.statusCode).toBe(400);
    });

    it("rejects an expense with an inexistent costCenterId (400, service)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/admin/finance/expenses",
        headers: { authorization: `Bearer ${gestionToken}` },
        payload: { cajaId, amount: 100, costCenterId: 999999 },
      });
      expect(res.statusCode).toBe(400);
    });

    it("rejects an expense with an INACTIVE costCenterId (400, service)", async () => {
      const [inactive] = await app.db.insert(schema.costCenters).values(
        tenantValues(TEMPLO_CTX, {
          name: `CC-Inactive ${Date.now()}`,
          country: "AR",
        }),
      );
      const inactiveId = Number(inactive.insertId);
      await app.db
        .update(schema.costCenters)
        .set({ isActive: false })
        .where(
          and(
            tenantWhere(schema.costCenters, TEMPLO_CTX),
            eq(schema.costCenters.id, inactiveId),
          ),
        );

      const res = await app.inject({
        method: "POST",
        url: "/api/admin/finance/expenses",
        headers: { authorization: `Bearer ${gestionToken}` },
        payload: { cajaId, amount: 100, costCenterId: inactiveId },
      });
      expect(res.statusCode).toBe(400);

      await app.db
        .delete(schema.costCenters)
        .where(
          and(
            tenantWhere(schema.costCenters, TEMPLO_CTX),
            eq(schema.costCenters.id, inactiveId),
          ),
        );
    });

    it("accepts a valid AR cost center (201) and persists cost_center_id", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/admin/finance/expenses",
        headers: { authorization: `Bearer ${gestionToken}` },
        payload: {
          cajaId,
          amount: 250,
          costCenterId: arCostCenterId,
          notes: "Compra de insumos",
        },
      });
      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body) as {
        expense: { expenseTxId: number };
      };
      const expenseTxId = body.expense.expenseTxId;

      const [row] = await app.db
        .select({
          kind: schema.financialTransactions.kind,
          costCenterId: schema.financialTransactions.costCenterId,
        })
        .from(schema.financialTransactions)
        .where(
          and(
            tenantWhere(schema.financialTransactions, TEMPLO_CTX),
            eq(schema.financialTransactions.id, expenseTxId),
          ),
        );
      expect(row.kind).toBe("expense");
      expect(row.costCenterId).toBe(arCostCenterId);
    });
  });

  // ─── EGR-03: listMovEgresos returns costCenterName on the expense row ────
  describe("EGR-03: costCenterName in the arqueo", () => {
    it("the arqueo row for an expense carries the cost center name", async () => {
      const localCaja = await newCaja(1000);
      const expense = await app.inject({
        method: "POST",
        url: "/api/admin/finance/expenses",
        headers: { authorization: `Bearer ${gestionToken}` },
        payload: {
          cajaId: localCaja,
          amount: 90,
          costCenterId: arCostCenterId,
        },
      });
      expect(expense.statusCode).toBe(201);
      const expenseTxId = (
        JSON.parse(expense.body) as { expense: { expenseTxId: number } }
      ).expense.expenseTxId;

      // Owner sees all rows (no country scope), so the arqueo includes this caja.
      const result = await txService.listMovEgresos(TEMPLO_CTX, {
        cashRegisterId: localCaja,
        isOwner: true,
      });
      const expenseRow = result.rows.find((r) => r.id === expenseTxId);
      expect(expenseRow).toBeDefined();
      expect(expenseRow?.kind).toBe("expense");

      const [center] = await app.db
        .select({ name: schema.costCenters.name })
        .from(schema.costCenters)
        .where(
          and(
            tenantWhere(schema.costCenters, TEMPLO_CTX),
            eq(schema.costCenters.id, arCostCenterId),
          ),
        );
      expect(expenseRow?.costCenterName).toBe(center.name);
    });
  });
});
