/**
 * Fase 207 (plan 02) — centavos en el ledger.
 *
 * Cubre el corazón del circuito de cobros con importes de 2 decimales:
 *   - POST /transactions acepta 2 decimales y rechaza 3 (schema y servicio).
 *   - Σ links vs monto se compara en centavos (0.1 + 0.2 = 0.3).
 *   - La deuda (`balances`) y la gestión de deuda (`debt_management`) quedan
 *     exactas al centavo: 3 x 33,33 + 0,01 contra 100 => 0 y 'cobrada'.
 *   - Listado, resumen, historial financiero y conceptos pendientes devuelven
 *     los centavos (no truncados a entero por fast-json-stringify).
 *   - Con importes enteros todo da lo mismo que antes.
 *
 * Corre contra la base de test por worker (eltemplo_test_<POOL_ID>).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  createTestApp,
  cleanAllTestData,
  getAuthToken,
  registerUser,
  ensureEfectivoCaja,
} from "../helpers";
import * as schema from "../../src/db/schema";
import { TENANT_TEMPLO } from "../fixtures/second-tenant";
import { tenantValues, tenantWhere } from "../../src/modules/shared/tenant";
import { TransactionService } from "../../src/modules/finance/transaction-service";
import { BalanceService } from "../../src/modules/finance/balance-service";
import { CashRegisterService } from "../../src/modules/finance/cash-register-service";
import { BadRequestError } from "../../src/modules/shared/errors";

const TEMPLO_CTX = { tenantId: TENANT_TEMPLO };
const FINANCE_URL = "/api/admin/finance";
const TODAY = "2026-04-28";

// Las sedes sobreviven a cleanAllTestData: código único por corrida.
function nextSuffix(prefix: string): string {
  const t = Date.now().toString(36).slice(-5);
  const r = Math.floor(Math.random() * 1000)
    .toString(36)
    .padStart(2, "0");
  return `${prefix}${t}${r}`;
}

interface LinkInput {
  targetKind: "subscription";
  targetId: number;
  allocatedAmount: number;
}

describe("Fase 207 — centavos en el ledger", () => {
  let app: FastifyInstance;
  let branchId: number;
  let ownerToken: string;
  let ownerId: number;
  let memberId: number;
  let planId: number;
  let subId: number;

  beforeAll(async () => {
    app = await createTestApp();
    const [branch] = await app.db
      .insert(schema.branches)
      .values({
        name: "Centavos-Test",
        code: nextSuffix("CE"),
        country: "AR",
        isVirtual: false,
        isActive: true,
      })
      .$returningId();
    branchId = branch.id;
    await ensureEfectivoCaja(app, branchId, "ARS");
  });

  afterAll(async () => {
    await app.close();
  });

  /** Crea una suscripción de precio entero (DI-03: el catálogo sigue entero). */
  async function createSub(userId: number, price: number): Promise<number> {
    const [sub] = await app.db
      .insert(schema.subscriptions)
      .values({
        userId,
        planId,
        branchId,
        status: "active",
        startDate: TODAY,
        pricePaid: price,
        currency: "ARS",
        priceTypeApplied: "regular",
      })
      .$returningId();
    return sub.id;
  }

  beforeEach(async () => {
    await cleanAllTestData(app);
    // financial_transactions / transaction_links / balances / debt_management
    // no están en TABLES_TO_CLEAN: se vacían acotados al gimnasio para que los
    // totales del resumen partan de cero.
    const conn = await app.dbPool.getConnection();
    try {
      await conn.query("SET FOREIGN_KEY_CHECKS=0");
      for (const t of [
        "transaction_links",
        "financial_transactions",
        "debt_management",
        "balances",
      ]) {
        await conn.query(`DELETE FROM \`${t}\` WHERE tenant_id = ?`, [
          TENANT_TEMPLO,
        ]);
      }
      await conn.query("SET FOREIGN_KEY_CHECKS=1");
    } finally {
      conn.release();
    }

    ownerToken = await getAuthToken(app, "admin@test.com", "adminpass123");
    const [owner] = await app.db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(
        and(
          tenantWhere(schema.users, TEMPLO_CTX),
          eq(schema.users.email, "admin@test.com"),
        ),
      )
      .limit(1);
    ownerId = owner.id;

    const member = await registerUser(app, {
      email: `centavos-${Date.now()}@test.local`,
      password: "pass123456",
      firstName: "Centavos",
      lastName: "Socio",
      branchId,
    });
    memberId = (member.user as { id: number }).id;

    const [plan] = await app.db
      .insert(schema.subscriptionPlans)
      .values({
        name: "Centavos Test Plan",
        planTier: "flex",
        bookingMode: "flexible",
        planCategory: "presencial",
        priceRegular: 100,
        priceZero: 0,
        durationDays: 30,
        classesPerWeek: 3,
        currency: "ARS",
      })
      .$returningId();
    planId = plan.id;
    subId = await createSub(memberId, 100);
  });

  function payload(
    amount: number,
    links?: LinkInput[],
    overrides: Record<string, unknown> = {},
  ) {
    return {
      memberId,
      kind: "plan_charge",
      direction: "inflow",
      amount,
      currency: "ARS",
      paymentMethod: "cash",
      transactionDate: TODAY,
      effectiveDate: TODAY,
      branchId,
      notes: null,
      links: links ?? [
        {
          targetKind: "subscription",
          targetId: subId,
          allocatedAmount: amount,
        },
      ],
      ...overrides,
    };
  }

  async function post(body: Record<string, unknown>) {
    return app.inject({
      method: "POST",
      url: `${FINANCE_URL}/transactions`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: body,
    });
  }

  async function pay(amount: number): Promise<number> {
    const res = await post(payload(amount));
    if (res.statusCode !== 201) {
      throw new Error(`pay(${amount}) falló: ${res.statusCode} ${res.body}`);
    }
    return res.json().transaction.id as number;
  }

  async function readBalance(targetId: number): Promise<number | null> {
    const [row] = await app.db
      .select({ amount: schema.balances.amount })
      .from(schema.balances)
      .where(
        and(
          tenantWhere(schema.balances, TEMPLO_CTX),
          eq(schema.balances.targetKind, "subscription"),
          eq(schema.balances.targetId, targetId),
        ),
      )
      .limit(1);
    return row ? row.amount : null;
  }

  async function readDebtStatus(targetId: number): Promise<string | null> {
    const [row] = await app.db
      .select({ status: schema.debtManagement.status })
      .from(schema.debtManagement)
      .innerJoin(
        schema.balances,
        and(
          tenantWhere(schema.balances, TEMPLO_CTX),
          eq(schema.balances.id, schema.debtManagement.balanceId),
        ),
      )
      .where(
        and(
          tenantWhere(schema.debtManagement, TEMPLO_CTX),
          eq(schema.balances.targetId, targetId),
        ),
      )
      .limit(1);
    return row ? row.status : null;
  }

  /** Siembra la fila de balance + su gestión de deuda (como debt-management.test). */
  async function seedManagedDebt(targetId: number, amount: number) {
    const [bal] = await app.db
      .insert(schema.balances)
      .values(
        tenantValues(TEMPLO_CTX, {
          memberId,
          targetKind: "subscription" as const,
          targetId,
          currency: "ARS",
          amount,
        }),
      )
      .$returningId();
    await app.db.insert(schema.debtManagement).values(
      tenantValues(TEMPLO_CTX, {
        balanceId: bal.id,
        status: "activa" as const,
        updatedBy: ownerId,
      }),
    );
    return bal.id;
  }

  async function getSummary() {
    const res = await app.inject({
      method: "GET",
      url: `${FINANCE_URL}/transactions/summary`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
    return res.json() as {
      monthlyRevenue: number;
      revenueByMethod: Record<string, number>;
      revenueByBranch: Array<{ branchId: number; revenue: number }>;
      revenueByKind: Record<string, number>;
    };
  }

  // ─── Deuda al centavo ────────────────────────────────────────────────────

  describe("deuda exacta al centavo", () => {
    it("3 x 33,33 + 0,01 contra una suscripción de 100 deja la deuda en 0 y la gestión 'cobrada'", async () => {
      await seedManagedDebt(subId, 100);

      await pay(33.33);
      await pay(33.33);
      await pay(33.33);
      // Con floats crudos 100 - 33.33*3 = 0.010000000000005116, nunca 0.01.
      expect(await readBalance(subId)).toBe(0.01);
      expect(await readDebtStatus(subId)).toBe("activa");

      await pay(0.01);
      expect(await readBalance(subId)).toBe(0);
      expect(await readDebtStatus(subId)).toBe("cobrada");
    });

    it("anular el cobro de 0,01 devuelve el saldo a 0,01 y la gestión a 'activa'", async () => {
      await seedManagedDebt(subId, 100);
      await pay(33.33);
      await pay(33.33);
      await pay(33.33);
      const lastId = await pay(0.01);
      expect(await readDebtStatus(subId)).toBe("cobrada");

      const res = await app.inject({
        method: "POST",
        url: `${FINANCE_URL}/transactions/${lastId}/void`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { reason: "test de centavos" },
      });
      expect(res.statusCode).toBe(200);

      expect(await readBalance(subId)).toBe(0.01);
      expect(await readDebtStatus(subId)).toBe("activa");
    });

    it("corregir un cobro de 33,33 a 33,34 deja la fila nueva en 33,34 y el saldo exacto", async () => {
      const id = await pay(33.33);
      expect(await readBalance(subId)).toBe(66.67);

      const res = await app.inject({
        method: "POST",
        url: `${FINANCE_URL}/transactions/${id}/correct`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { correctedFields: { amount: 33.34 } },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().transaction.amount).toBe(33.34);

      expect(await readBalance(subId)).toBe(66.66);
    });
  });

  // ─── Validación de importes ──────────────────────────────────────────────

  describe("validación de 2 decimales", () => {
    it("acepta un cobro de 1,15 (2 decimales)", async () => {
      const res = await post(payload(1.15));
      expect(res.statusCode).toBe(201);
      expect(res.json().transaction.amount).toBe(1.15);
    });

    it("rechaza amount 33,333 con 400 y no escribe nada", async () => {
      const res = await post(
        payload(33.333, [
          {
            targetKind: "subscription",
            targetId: subId,
            allocatedAmount: 33.33,
          },
        ]),
      );
      expect(res.statusCode).toBe(400);
      expect(await readBalance(subId)).toBeNull();
    });

    it("rechaza allocatedAmount 1,155 con 400", async () => {
      const res = await post(
        payload(1.16, [
          {
            targetKind: "subscription",
            targetId: subId,
            allocatedAmount: 1.155,
          },
        ]),
      );
      expect(res.statusCode).toBe(400);
    });

    it("el servicio también corta un importe con basura de float (red de seguridad de create())", async () => {
      const balanceService = new BalanceService(app.db, app.log);
      const txService = new TransactionService(
        app.db,
        app.log,
        balanceService,
        new CashRegisterService(app.db, app.log),
      );
      const input = {
        memberId,
        kind: "plan_charge" as const,
        direction: "inflow" as const,
        amount: 33.329999,
        currency: "ARS",
        paymentMethod: "cash" as const,
        transactionDate: TODAY,
        effectiveDate: TODAY,
        branchId,
        notes: null,
        links: [
          {
            targetKind: "subscription" as const,
            targetId: subId,
            allocatedAmount: 33.329999,
          },
        ],
      };
      await expect(
        txService.create(TEMPLO_CTX, input, ownerId),
      ).rejects.toBeInstanceOf(BadRequestError);
    });
  });

  // ─── Suma de links en centavos ───────────────────────────────────────────

  describe("suma de asignaciones en centavos", () => {
    it("amount 0,3 con links 0,1 + 0,2 se acepta (0.1 + 0.2 !== 0.3 en float)", async () => {
      const subB = await createSub(memberId, 100);
      const res = await post(
        payload(0.3, [
          { targetKind: "subscription", targetId: subId, allocatedAmount: 0.1 },
          { targetKind: "subscription", targetId: subB, allocatedAmount: 0.2 },
        ]),
      );
      expect(res.statusCode).toBe(201);
      expect(await readBalance(subId)).toBe(99.9);
      expect(await readBalance(subB)).toBe(99.8);
    });

    it("amount 0,3 con links 0,1 + 0,21 sigue rechazándose (400)", async () => {
      const subB = await createSub(memberId, 100);
      const res = await post(
        payload(0.3, [
          { targetKind: "subscription", targetId: subId, allocatedAmount: 0.1 },
          { targetKind: "subscription", targetId: subB, allocatedAmount: 0.21 },
        ]),
      );
      expect(res.statusCode).toBe(400);
    });
  });

  // ─── Respuestas con centavos ─────────────────────────────────────────────

  describe("las respuestas devuelven los centavos", () => {
    it("GET /transactions devuelve amount 33,33 y linkSummary[0].allocatedAmount 33,33", async () => {
      await pay(33.33);
      const res = await app.inject({
        method: "GET",
        url: `${FINANCE_URL}/transactions`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as {
        rows: Array<{
          amount: number;
          linkSummary: Array<{ allocatedAmount: number }>;
        }>;
      };
      expect(body.rows).toHaveLength(1);
      expect(body.rows[0].amount).toBe(33.33);
      expect(body.rows[0].linkSummary[0].allocatedAmount).toBe(33.33);
    });

    it("GET /transactions/summary suma exactamente 100 de los 4 cobros (delta contra el valor previo)", async () => {
      const before = await getSummary();
      await pay(33.33);
      await pay(33.33);
      await pay(33.33);
      await pay(0.01);
      const after = await getSummary();

      expect(after.monthlyRevenue).toBe(before.monthlyRevenue + 100);
      expect(after.revenueByMethod.cash).toBe(
        before.revenueByMethod.cash + 100,
      );
      expect(after.revenueByKind.plan_charge).toBe(
        before.revenueByKind.plan_charge + 100,
      );
      const branchRow = after.revenueByBranch.find(
        (r) => r.branchId === branchId,
      );
      expect(branchRow?.revenue).toBe(100);
    });

    it("GET financial-history del socio devuelve allocatedAmount 33,33", async () => {
      await pay(33.33);
      const res = await app.inject({
        method: "GET",
        url: `/api/admin/members/${memberId}/financial-history`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as {
        rows: Array<{
          transaction: { amount: number };
          links: Array<{ allocatedAmount: number }>;
        }>;
      };
      expect(body.rows).toHaveLength(1);
      expect(body.rows[0].transaction.amount).toBe(33.33);
      expect(body.rows[0].links[0].allocatedAmount).toBe(33.33);
    });

    it("GET outstanding-concepts tras dos pagos de 33,33 devuelve balance 33,34", async () => {
      await pay(33.33);
      await pay(33.33);
      const res = await app.inject({
        method: "GET",
        url: `/api/admin/members/${memberId}/outstanding-concepts`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { concepts: Array<{ balance: number }> };
      expect(body.concepts).toHaveLength(1);
      expect(body.concepts[0].balance).toBe(33.34);
    });
  });

  // ─── No regresión con enteros ────────────────────────────────────────────

  describe("no regresión con importes enteros", () => {
    it("un cobro de 1500 sigue devolviendo 1500 en listado y resumen, y el saldo queda entero", async () => {
      const subBig = await createSub(memberId, 5000);
      const res = await post(
        payload(1500, [
          {
            targetKind: "subscription",
            targetId: subBig,
            allocatedAmount: 1500,
          },
        ]),
      );
      expect(res.statusCode).toBe(201);
      expect(res.json().transaction.amount).toBe(1500);

      const list = await app.inject({
        method: "GET",
        url: `${FINANCE_URL}/transactions`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      const rows = list.json().rows as Array<{
        amount: number;
        linkSummary: Array<{ allocatedAmount: number }>;
      }>;
      expect(rows[0].amount).toBe(1500);
      expect(Number.isInteger(rows[0].amount)).toBe(true);
      expect(rows[0].linkSummary[0].allocatedAmount).toBe(1500);

      const summary = await getSummary();
      expect(summary.monthlyRevenue).toBe(1500);
      expect(summary.revenueByMethod.cash).toBe(1500);
      expect(await readBalance(subBig)).toBe(3500);
    });
  });
});
