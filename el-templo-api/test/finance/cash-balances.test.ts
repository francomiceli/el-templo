/**
 * Phase 141 (REP-02) — Saldos por caja integration tests.
 *
 * GET /api/admin/finance/cash-registers/balances iterates the ACTIVE cajas and
 * returns each with firmeBalance + pendienteAmount (straight from the 138
 * getBalance primitive) + type + currency.
 *
 * Covers:
 *   - one entry per active caja with firmeBalance, pendienteAmount, type, currency
 *   - firme excludes a pendiente row (pendiente reported SEPARATELY)
 *   - coach → 403
 *   - scope: a non-owner gestion (AR) does NOT see a branch-less central/banco
 *     caja (owner-only); an owner does.
 *
 * Runs against the per-worker test MySQL DB (eltemplo_test_<POOL_ID>).
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, sql, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  createTestApp,
  createStaffUser,
  getAuthToken,
  registerUser,
} from "../helpers";
import * as schema from "../../src/db/schema";

const BALANCES_URL = "/api/admin/finance/cash-registers/balances";
const CUTOFF = "2020-01-01";

let app: FastifyInstance;
let adminId: number;
let branchId: number;
let memberId: number;

let ownerToken: string;
let gestionToken: string;

let efectivoCajaId: number;
let bancoCajaId: number;

interface CajaSaldoRow {
  cashRegisterId: number;
  name: string;
  type: "efectivo" | "banco";
  branchId: number | null;
  currency: string;
  firmeBalance: number;
  pendienteAmount: number;
}

async function fetchBalances(
  token: string,
): Promise<{ statusCode: number; rows: CajaSaldoRow[] }> {
  const res = await app.inject({
    method: "GET",
    url: BALANCES_URL,
    headers: { authorization: `Bearer ${token}` },
  });
  if (res.statusCode !== 200) return { statusCode: res.statusCode, rows: [] };
  return {
    statusCode: res.statusCode,
    rows: JSON.parse(res.body) as CajaSaldoRow[],
  };
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
  // admin@test.com is seeded with role 'owner' (test/setup.ts).
  ownerToken = await getAuthToken(app, "admin@test.com", "adminpass123");

  await createStaffUser(app, {
    email: "coach-bal@test.local",
    password: "pass123456",
    firstName: "Coach",
    lastName: "Bal",
    role: "coach",
    branchId,
  });

  await createStaffUser(app, {
    email: "gestion-bal@test.local",
    password: "pass123456",
    firstName: "Gestion",
    lastName: "Bal",
    role: "gestion",
    branchId,
    country: "AR",
  });
  gestionToken = await getAuthToken(
    app,
    "gestion-bal@test.local",
    "pass123456",
  );

  const member = await registerUser(app, {
    email: `bal-member-${Date.now()}@test.local`,
    password: "TestPass123!",
    firstName: "Bal",
    lastName: "Member",
    branchId,
  });
  memberId = (member.user as { id: number }).id;

  // A sucursal efectivo ARS caja (branch-scoped) + a branch-less banco ARS caja
  // (owner-only). Unique names so this suite is self-contained.
  const suffix = Date.now() % 100000;
  const [ef] = await app.db
    .insert(schema.cashRegisters)
    .values({
      name: `Bal efectivo ${suffix}`,
      type: "efectivo",
      branchId,
      currency: "ARS",
      cutoffDate: CUTOFF,
    })
    .$returningId();
  efectivoCajaId = ef.id;

  const [banco] = await app.db
    .insert(schema.cashRegisters)
    .values({
      name: `Bal banco ${suffix}`,
      type: "banco",
      branchId: null,
      currency: "ARS",
      cutoffDate: CUTOFF,
    })
    .$returningId();
  bancoCajaId = banco.id;

  // Seed one validado inflow (firme) + one pendiente inflow into the efectivo
  // caja so firme excludes pendiente.
  await app.db.insert(schema.financialTransactions).values([
    {
      memberId,
      kind: "plan_charge",
      direction: "inflow",
      amount: 5000,
      currency: "ARS",
      paymentMethod: "cash",
      transactionDate: "2026-04-01",
      effectiveDate: "2026-04-01",
      branchId,
      cashRegisterId: efectivoCajaId,
      recordedBy: adminId,
      validationStatus: "validado",
    },
    {
      memberId,
      kind: "plan_charge",
      direction: "inflow",
      amount: 1500,
      currency: "ARS",
      paymentMethod: "cash",
      transactionDate: "2026-04-02",
      effectiveDate: "2026-04-02",
      branchId,
      cashRegisterId: efectivoCajaId,
      recordedBy: adminId,
      validationStatus: "pendiente",
    },
  ]);
});

afterAll(async () => {
  await app.db.execute(sql`DELETE FROM financial_transactions`);
  await app.db
    .delete(schema.cashRegisters)
    .where(inArray(schema.cashRegisters.id, [efectivoCajaId, bancoCajaId]));
  await app.close();
});

describe("REP-02: GET /cash-registers/balances (saldos por caja)", () => {
  it("returns firme + pendiente + type + currency per active caja (firme excludes pendiente)", async () => {
    const { statusCode, rows } = await fetchBalances(ownerToken);
    expect(statusCode).toBe(200);
    const ef = rows.find((r) => r.cashRegisterId === efectivoCajaId);
    expect(ef).toBeDefined();
    expect(ef?.type).toBe("efectivo");
    expect(ef?.currency).toBe("ARS");
    // firme = Σ validados only (5000); the 1500 pendiente is reported apart.
    expect(ef?.firmeBalance).toBe(5000);
    expect(ef?.pendienteAmount).toBe(1500);
  });

  it("coach → 403", async () => {
    const coachToken = await getAuthToken(
      app,
      "coach-bal@test.local",
      "pass123456",
    );
    const res = await app.inject({
      method: "GET",
      url: BALANCES_URL,
      headers: { authorization: `Bearer ${coachToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it("scope: non-owner gestion does NOT see the branch-less banco caja; owner does", async () => {
    const owner = await fetchBalances(ownerToken);
    expect(owner.rows.some((r) => r.cashRegisterId === bancoCajaId)).toBe(true);

    const gestion = await fetchBalances(gestionToken);
    expect(gestion.statusCode).toBe(200);
    // Branch-less central/banco caja is owner-only (Franco-confirmed).
    expect(gestion.rows.some((r) => r.cashRegisterId === bancoCajaId)).toBe(
      false,
    );
    // But the gestion's own-country sucursal efectivo caja IS visible.
    expect(gestion.rows.some((r) => r.cashRegisterId === efectivoCajaId)).toBe(
      true,
    );
  });
});
