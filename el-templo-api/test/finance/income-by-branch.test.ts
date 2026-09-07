/**
 * GET /api/admin/finance/transactions/income-by-branch (feedback caja/cobros
 * 2026-09-07, pestaña Saldos): ingresos firmes de socio por (sede, moneda),
 * abiertos por medio de pago.
 *
 * Invariantes:
 *   - Misma condición que /transactions/summary (plata firme: validado + no
 *     anulado, inflow, sin cash_transfer/expense): el total de una sede acá ==
 *     revenueByBranch de esa sede allá para el mismo rango.
 *   - Un cobro pendiente NO cuenta. Un cobro anulado NO cuenta. La pata inflow
 *     de un movimiento entre cajas NO cuenta (no es ingreso de socio).
 *   - dateFrom/dateTo acotan por transaction_date.
 *   - Sedes sin ingresos en el período no aparecen.
 *   - coach → 403 (guard FINANCE_READ_ROLES del módulo).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { sql, eq, and } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  createTestApp,
  createStaffUser,
  getAuthToken,
  registerUser,
  ensureEfectivoCaja,
} from "../helpers";
import * as schema from "../../src/db/schema";
import { TENANT_TEMPLO } from "../fixtures/second-tenant";
import { tenantValues, tenantWhere } from "../../src/modules/shared/tenant";

const TEMPLO_CTX = { tenantId: TENANT_TEMPLO };
const URL = "/api/admin/finance/transactions/income-by-branch";

let app: FastifyInstance;
let adminId: number;
let branchId: number;
let otherBranchId: number;
let memberId: number;
let cajaId: number;
let adminToken: string;
let coachToken: string;

interface Row {
  branchId: number;
  branchName: string;
  currency: string;
  byMethod: Record<string, number>;
  total: number;
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

async function seedInflow(opts: {
  amount: number;
  branchId: number;
  paymentMethod: "cash" | "transfer" | "card" | "direct_debit";
  kind?: "plan_charge" | "debt_settlement" | "advance_payment" | "cash_transfer";
  validationStatus?: "pendiente" | "validado";
  transactionDate?: string;
  voided?: boolean;
}): Promise<number> {
  const date = opts.transactionDate ?? daysAgo(1);
  const [res] = await app.db
    .insert(schema.financialTransactions)
    .values(
      tenantValues(TEMPLO_CTX, {
        memberId: opts.kind === "cash_transfer" ? null : memberId,
        kind: opts.kind ?? "plan_charge",
        direction: "inflow",
        amount: opts.amount,
        currency: "ARS",
        paymentMethod: opts.paymentMethod,
        transactionDate: date,
        effectiveDate: date,
        branchId: opts.branchId,
        cashRegisterId: opts.paymentMethod === "cash" ? cajaId : null,
        recordedBy: adminId,
        validationStatus: opts.validationStatus ?? "validado",
        voidedAt: opts.voided ? new Date() : null,
        voidedBy: opts.voided ? adminId : null,
      }),
    )
    .$returningId();
  return res.id;
}

async function fetchRows(
  token: string,
  query = "",
): Promise<{ statusCode: number; rows: Row[] }> {
  const res = await app.inject({
    method: "GET",
    url: `${URL}${query}`,
    headers: { authorization: `Bearer ${token}` },
  });
  return {
    statusCode: res.statusCode,
    rows: res.statusCode === 200 ? (JSON.parse(res.body) as Row[]) : [],
  };
}

beforeAll(async () => {
  app = await createTestApp();
  const [admin] = await app.db
    .select({ id: schema.users.id, branchId: schema.users.branchId })
    .from(schema.users)
    .where(
      and(
        tenantWhere(schema.users, TEMPLO_CTX),
        eq(schema.users.email, "admin@test.com"),
      ),
    )
    .limit(1);
  adminId = admin.id;
  branchId = admin.branchId ?? 1;
  adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");

  await createStaffUser(app, {
    email: "coach-income@test.local",
    password: "pass123456",
    firstName: "Coach",
    lastName: "Income",
    role: "coach",
    branchId,
  });
  coachToken = await getAuthToken(app, "coach-income@test.local", "pass123456");

  const member = await registerUser(app, {
    email: `income-member-${Date.now()}@test.local`,
    password: "TestPass123!",
    firstName: "Income",
    lastName: "Member",
    branchId,
  });
  memberId = (member.user as { id: number }).id;

  await ensureEfectivoCaja(app, branchId);
  const [caja] = await app.db
    .select({ id: schema.cashRegisters.id })
    .from(schema.cashRegisters)
    .where(
      and(
        tenantWhere(schema.cashRegisters, TEMPLO_CTX),
        eq(schema.cashRegisters.type, "efectivo"),
        eq(schema.cashRegisters.branchId, branchId),
      ),
    )
    .limit(1);
  cajaId = caja.id;

  const [b] = await app.db.insert(schema.branches).values({
    tenantId: TENANT_TEMPLO,
    name: `Income-Sede-${Date.now() % 100000}`,
    code: `INC${Date.now() % 1000000}`,
    country: "AR",
  });
  otherBranchId = Number(b.insertId);
});

afterAll(async () => {
  await app.db.execute(
    sql`DELETE FROM financial_transactions WHERE tenant_id = ${TENANT_TEMPLO}`,
  );
  await app.db
    .delete(schema.branches)
    .where(eq(schema.branches.id, otherBranchId));
  await app.close();
});

beforeEach(async () => {
  await app.db.execute(
    sql`DELETE FROM transaction_links WHERE tenant_id = ${TENANT_TEMPLO}`,
  );
  await app.db.execute(
    sql`DELETE FROM financial_transactions WHERE tenant_id = ${TENANT_TEMPLO}`,
  );
});

describe("GET /transactions/income-by-branch", () => {
  it("agrupa por sede y abre por medio de pago; excluye pendientes, anulados y movimientos", async () => {
    await seedInflow({ amount: 65000, branchId, paymentMethod: "cash" });
    await seedInflow({ amount: 80000, branchId, paymentMethod: "cash", kind: "debt_settlement" });
    await seedInflow({ amount: 30000, branchId, paymentMethod: "transfer" });
    await seedInflow({ amount: 10000, branchId, paymentMethod: "card" });
    await seedInflow({ amount: 5000, branchId: otherBranchId, paymentMethod: "transfer" });
    // Ruido:
    await seedInflow({ amount: 1, branchId, paymentMethod: "cash", validationStatus: "pendiente" });
    await seedInflow({ amount: 2, branchId, paymentMethod: "cash", voided: true });
    await seedInflow({ amount: 3, branchId, paymentMethod: "cash", kind: "cash_transfer" });

    const { statusCode, rows } = await fetchRows(adminToken);
    expect(statusCode).toBe(200);
    expect(rows).toHaveLength(2);
    // Orden: mayor total primero.
    expect(rows[0].branchId).toBe(branchId);
    expect(rows[0].currency).toBe("ARS");
    expect(rows[0].byMethod.cash).toBe(145000);
    expect(rows[0].byMethod.transfer).toBe(30000);
    expect(rows[0].byMethod.card).toBe(10000);
    expect(rows[0].byMethod.direct_debit).toBe(0);
    expect(rows[0].total).toBe(185000);
    expect(rows[1].branchId).toBe(otherBranchId);
    expect(rows[1].total).toBe(5000);
    expect(rows[1].byMethod.cash).toBe(0);
  });

  it("cierra contra revenueByBranch del summary para el mismo rango", async () => {
    await seedInflow({ amount: 100, branchId, paymentMethod: "cash", transactionDate: daysAgo(3) });
    await seedInflow({ amount: 200, branchId, paymentMethod: "transfer", transactionDate: daysAgo(2) });
    await seedInflow({ amount: 999, branchId, paymentMethod: "cash", transactionDate: daysAgo(30) });

    const range = `?dateFrom=${daysAgo(5)}&dateTo=${daysAgo(0)}`;
    const { rows } = await fetchRows(adminToken, range);
    expect(rows).toHaveLength(1);
    expect(rows[0].total).toBe(300);

    const summary = await app.inject({
      method: "GET",
      url: `/api/admin/finance/transactions/summary${range}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const byBranch = (
      JSON.parse(summary.body) as {
        revenueByBranch: Array<{ branchId: number; revenue: number }>;
      }
    ).revenueByBranch;
    expect(byBranch.find((b) => b.branchId === branchId)?.revenue).toBe(
      rows[0].total,
    );
  });

  it("sin ingresos en el rango → lista vacía", async () => {
    await seedInflow({ amount: 100, branchId, paymentMethod: "cash", transactionDate: daysAgo(30) });
    const { rows } = await fetchRows(
      adminToken,
      `?dateFrom=${daysAgo(5)}&dateTo=${daysAgo(0)}`,
    );
    expect(rows).toEqual([]);
  });

  it("coach → 403", async () => {
    const { statusCode } = await fetchRows(coachToken);
    expect(statusCode).toBe(403);
  });
});
