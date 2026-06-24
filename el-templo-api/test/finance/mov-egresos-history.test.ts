/**
 * Phase 141 (REP-03) — Historial de movimientos inter-caja y egresos.
 *
 * GET /api/admin/finance/movements-history returns the kind IN
 * ('cash_transfer','expense','adjustment') trail filterable by caja/período.
 *
 * THE LOAD-BEARING ASSERTION (the 139 LEFT JOIN proof): a cash_transfer row
 * AND an expense row — both with member_id = NULL — MUST be RETURNED. The
 * shared list()/exportRowsForExcel() INNER JOIN users (and branches), which
 * silently DROPS these NULL-member rows. listMovEgresos() LEFT JOINs so they
 * survive; an INNER JOIN here would return zero rows and fail this test.
 *
 * Covers:
 *   - a NULL-member expense AND a NULL-member cash_transfer both appear (LEFT JOIN proof)
 *   - a returned NULL-member row still renders cashRegisterName + recorderName
 *   - filter by ?cashRegisterId returns only that caja's rows
 *   - filter by ?dateFrom/?dateTo (período) bounds the rows
 *   - an adjustment row appears; a member cobro (kind=plan_charge) does NOT
 *   - coach → 403 (FINANCE_READ_ROLES module guard)
 *
 * Runs against the per-worker test MySQL DB (eltemplo_test_<POOL_ID>).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { sql, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  createTestApp,
  createStaffUser,
  getAuthToken,
  registerUser,
  ensureEfectivoCaja,
} from "../helpers";
import * as schema from "../../src/db/schema";

const MOV_EGRESOS_URL = "/api/admin/finance/movements-history";

let app: FastifyInstance;
let adminId: number;
let branchId: number;
let memberId: number;
let cajaId: number;
let otherCajaId: number;

let adminToken: string;
let coachToken: string;

/** YYYY-MM-DD `n` days before today (local). */
function daysAgo(n: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

interface MovEgresoRow {
  id: number;
  kind: string;
  direction: string;
  amount: number;
  currency: string;
  cashRegisterId: number | null;
  cashRegisterName: string;
  branchId: number | null;
  branchName: string | null;
  recordedBy: number;
  recorderName: string;
  voidedAt: string | null;
  voidReason: string | null;
  notes: string | null;
  transactionDate: string;
  memberId: number | null;
}

/** Insert a NULL-member mov/egreso/adjustment row directly so we pin its kind/caja/date. */
async function seedMovEgreso(opts: {
  kind: "cash_transfer" | "expense" | "adjustment";
  direction: "inflow" | "outflow";
  transactionDate: string;
  cashRegisterId: number;
  branchId: number | null;
  notes?: string | null;
}): Promise<number> {
  const [res] = await app.db
    .insert(schema.financialTransactions)
    .values({
      memberId: null, // ← the whole point: NULL-member rows must survive the LEFT JOIN
      kind: opts.kind,
      direction: opts.direction,
      amount: 500,
      currency: "ARS",
      paymentMethod: "cash",
      transactionDate: opts.transactionDate,
      effectiveDate: opts.transactionDate,
      branchId: opts.branchId,
      cashRegisterId: opts.cashRegisterId,
      recordedBy: adminId,
      validationStatus: "validado",
      notes: opts.notes ?? null,
    })
    .$returningId();
  return res.id;
}

beforeAll(async () => {
  app = await createTestApp();

  const [admin] = await app.db
    .select({ id: schema.users.id, branchId: schema.users.branchId })
    .from(schema.users)
    .where(eq(schema.users.email, "admin@test.com"))
    .limit(1);
  adminId = admin.id;
  branchId = admin.branchId ?? 1;
  adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");

  await createStaffUser(app, {
    email: "coach-movegr@test.local",
    password: "pass123456",
    firstName: "Coach",
    lastName: "MovEgr",
    role: "coach",
    branchId,
  });
  coachToken = await getAuthToken(app, "coach-movegr@test.local", "pass123456");

  const member = await registerUser(app, {
    email: `movegr-member-${Date.now()}@test.local`,
    password: "TestPass123!",
    firstName: "MovEgr",
    lastName: "Member",
    branchId,
  });
  memberId = (member.user as { id: number }).id;

  await ensureEfectivoCaja(app, branchId);
  const [caja] = await app.db
    .select({ id: schema.cashRegisters.id })
    .from(schema.cashRegisters)
    .where(eq(schema.cashRegisters.branchId, branchId))
    .limit(1);
  cajaId = caja.id;

  // A second caja (same branch) for the ?cashRegisterId filter test.
  const [other] = await app.db
    .insert(schema.cashRegisters)
    .values({
      name: `MovEgr-Other ${Date.now()}`,
      type: "efectivo",
      branchId,
      currency: "ARS",
      openingBalance: 0,
      cutoffDate: "2020-01-01",
    })
    .$returningId();
  otherCajaId = other.id;
});

afterAll(async () => {
  await app.db
    .delete(schema.cashRegisters)
    .where(eq(schema.cashRegisters.id, otherCajaId));
  await app.close();
});

beforeEach(async () => {
  await app.db.execute(sql`DELETE FROM transaction_links`);
  await app.db.execute(sql`DELETE FROM financial_transactions`);
});

async function fetchHistory(
  token: string,
  query = "",
): Promise<{ statusCode: number; rows: MovEgresoRow[] }> {
  const res = await app.inject({
    method: "GET",
    url: `${MOV_EGRESOS_URL}${query}`,
    headers: { authorization: `Bearer ${token}` },
  });
  if (res.statusCode !== 200) {
    return { statusCode: res.statusCode, rows: [] };
  }
  const body = JSON.parse(res.body) as { rows: MovEgresoRow[] };
  return { statusCode: res.statusCode, rows: body.rows };
}

describe("REP-03: GET /movements-history (historial mov/egresos)", () => {
  // ─── THE 139 LEFT JOIN PROOF ──────────────────────────────────────────────
  it("returns NULL-member cash_transfer AND expense rows (the LEFT JOIN proof)", async () => {
    const transferId = await seedMovEgreso({
      kind: "cash_transfer",
      direction: "outflow",
      transactionDate: daysAgo(2),
      cashRegisterId: cajaId,
      branchId,
    });
    const expenseId = await seedMovEgreso({
      kind: "expense",
      direction: "outflow",
      transactionDate: daysAgo(1),
      cashRegisterId: cajaId,
      branchId,
      notes: "Compra de agua",
    });

    const { statusCode, rows } = await fetchHistory(adminToken);
    expect(statusCode).toBe(200);

    const transfer = rows.find((r) => r.id === transferId);
    const expense = rows.find((r) => r.id === expenseId);
    // An INNER JOIN on users would drop both of these (member_id NULL).
    expect(transfer).toBeDefined();
    expect(expense).toBeDefined();
    expect(transfer?.memberId).toBeNull();
    expect(expense?.memberId).toBeNull();

    // A NULL-member row still renders the caja name + the recorder name.
    expect(expense?.cashRegisterName.length).toBeGreaterThan(0);
    expect(expense?.recorderName.length).toBeGreaterThan(0);
  });

  it("filter by ?cashRegisterId returns only that caja's rows", async () => {
    await seedMovEgreso({
      kind: "expense",
      direction: "outflow",
      transactionDate: daysAgo(1),
      cashRegisterId: cajaId,
      branchId,
    });
    await seedMovEgreso({
      kind: "expense",
      direction: "outflow",
      transactionDate: daysAgo(1),
      cashRegisterId: otherCajaId,
      branchId,
    });

    const { rows } = await fetchHistory(
      adminToken,
      `?cashRegisterId=${cajaId}`,
    );
    expect(rows).toHaveLength(1);
    expect(rows.every((r) => r.cashRegisterId === cajaId)).toBe(true);
  });

  it("filter by ?dateFrom/?dateTo (período) bounds the rows", async () => {
    await seedMovEgreso({
      kind: "expense",
      direction: "outflow",
      transactionDate: daysAgo(10),
      cashRegisterId: cajaId,
      branchId,
    });
    const recentId = await seedMovEgreso({
      kind: "expense",
      direction: "outflow",
      transactionDate: daysAgo(2),
      cashRegisterId: cajaId,
      branchId,
    });

    const { rows } = await fetchHistory(
      adminToken,
      `?dateFrom=${daysAgo(4)}&dateTo=${daysAgo(1)}`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(recentId);
  });

  it("includes adjustment rows but NOT a member cobro (plan_charge)", async () => {
    const adjId = await seedMovEgreso({
      kind: "adjustment",
      direction: "outflow",
      transactionDate: daysAgo(1),
      cashRegisterId: cajaId,
      branchId,
    });
    // A member cobro (kind=plan_charge, member present) must NOT appear here.
    await app.db.insert(schema.financialTransactions).values({
      memberId,
      kind: "plan_charge",
      direction: "inflow",
      amount: 1000,
      currency: "ARS",
      paymentMethod: "cash",
      transactionDate: daysAgo(1),
      effectiveDate: daysAgo(1),
      branchId,
      cashRegisterId: cajaId,
      recordedBy: adminId,
      validationStatus: "validado",
    });

    const { rows } = await fetchHistory(adminToken);
    expect(rows.some((r) => r.id === adjId && r.kind === "adjustment")).toBe(
      true,
    );
    expect(rows.some((r) => r.kind === "plan_charge")).toBe(false);
  });

  it("coach → 403", async () => {
    const res = await app.inject({
      method: "GET",
      url: MOV_EGRESOS_URL,
      headers: { authorization: `Bearer ${coachToken}` },
    });
    expect(res.statusCode).toBe(403);
  });
});
