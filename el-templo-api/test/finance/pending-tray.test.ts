/**
 * Phase 141 (REP-01) — Bandeja de pendientes integration tests.
 *
 * GET /api/admin/finance/pending-tray returns the daily pending-validation
 * control list: validation_status IN ('pendiente','observado'), ordered
 * OLDEST-FIRST (the opposite of list()), with TS-computed aging + an isOverdue
 * flag derived from the shared OVERDUE_DAYS constant, plus recorder + caja name.
 *
 * Covers:
 *   - only pendiente+observado rows are returned, oldest-first
 *   - each row carries ageInDays (≥0), recorderName, cashRegisterName
 *   - isOverdue=true for a row older than OVERDUE_DAYS, false for a fresh one
 *   - thresholdDays === OVERDUE_DAYS in the payload
 *   - status filter: ?status=observados / pendientes / todos
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
import { OVERDUE_DAYS } from "../../src/modules/finance/constants";

const PENDING_TRAY_URL = "/api/admin/finance/pending-tray";

let app: FastifyInstance;
let adminId: number;
let branchId: number;
let memberId: number;
let cajaId: number;

let adminToken: string;
let coachToken: string;

/** YYYY-MM-DD `n` days before today (local). */
function daysAgo(n: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

interface PendingTrayRow {
  id: number;
  ageInDays: number;
  isOverdue: boolean;
  recorderName: string;
  cashRegisterName: string;
  validationStatus: string;
  transactionDate: string;
  miscReason: "sin_plan" | "otro" | null;
}

/** Insert a pendiente/observado row directly so the test pins its age + caja. */
async function seedTrayRow(opts: {
  transactionDate: string;
  validationStatus: "pendiente" | "observado";
  kind?: "plan_charge" | "advance_payment";
  miscReason?: "sin_plan" | "otro" | null;
}): Promise<number> {
  const [res] = await app.db
    .insert(schema.financialTransactions)
    .values({
      memberId,
      kind: opts.kind ?? "plan_charge",
      direction: "inflow",
      amount: 1000,
      currency: "ARS",
      paymentMethod: "cash",
      transactionDate: opts.transactionDate,
      effectiveDate: opts.transactionDate,
      branchId,
      cashRegisterId: cajaId,
      recordedBy: adminId,
      validationStatus: opts.validationStatus,
      miscReason: opts.miscReason ?? null,
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
    email: "coach-tray@test.local",
    password: "pass123456",
    firstName: "Coach",
    lastName: "Tray",
    role: "coach",
    branchId,
  });
  coachToken = await getAuthToken(app, "coach-tray@test.local", "pass123456");

  const member = await registerUser(app, {
    email: `tray-member-${Date.now()}@test.local`,
    password: "TestPass123!",
    firstName: "Tray",
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
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await app.db.execute(sql`DELETE FROM transaction_links`);
  await app.db.execute(sql`DELETE FROM financial_transactions`);
});

async function fetchTray(
  token: string,
  query = "",
): Promise<{
  statusCode: number;
  rows: PendingTrayRow[];
  thresholdDays: number;
}> {
  const res = await app.inject({
    method: "GET",
    url: `${PENDING_TRAY_URL}${query}`,
    headers: { authorization: `Bearer ${token}` },
  });
  if (res.statusCode !== 200) {
    return { statusCode: res.statusCode, rows: [], thresholdDays: 0 };
  }
  const body = JSON.parse(res.body) as {
    rows: PendingTrayRow[];
    thresholdDays: number;
  };
  return {
    statusCode: res.statusCode,
    rows: body.rows,
    thresholdDays: body.thresholdDays,
  };
}

describe("REP-01: GET /pending-tray (bandeja de pendientes)", () => {
  it("returns only pendiente+observado rows ordered oldest-first", async () => {
    await seedTrayRow({
      transactionDate: daysAgo(1),
      validationStatus: "pendiente",
    });
    await seedTrayRow({
      transactionDate: daysAgo(12),
      validationStatus: "pendiente",
    });
    // A validado row must NOT appear in the tray.
    await app.db.insert(schema.financialTransactions).values({
      memberId,
      kind: "plan_charge",
      direction: "inflow",
      amount: 1000,
      currency: "ARS",
      paymentMethod: "cash",
      transactionDate: daysAgo(2),
      effectiveDate: daysAgo(2),
      branchId,
      cashRegisterId: cajaId,
      recordedBy: adminId,
      validationStatus: "validado",
    });

    const { statusCode, rows } = await fetchTray(adminToken);
    expect(statusCode).toBe(200);
    expect(rows).toHaveLength(2);
    // Oldest (12 días) first.
    expect(rows[0].transactionDate).toBe(daysAgo(12));
    expect(rows[1].transactionDate).toBe(daysAgo(1));
    expect(
      rows.every((r) =>
        ["pendiente", "observado"].includes(r.validationStatus),
      ),
    ).toBe(true);
  });

  it("each row carries ageInDays (≥0), recorderName and cashRegisterName", async () => {
    await seedTrayRow({
      transactionDate: daysAgo(5),
      validationStatus: "pendiente",
    });
    const { rows } = await fetchTray(adminToken);
    expect(rows).toHaveLength(1);
    expect(rows[0].ageInDays).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(rows[0].ageInDays)).toBe(true);
    expect(rows[0].ageInDays).toBe(5);
    expect(rows[0].recorderName.length).toBeGreaterThan(0);
    expect(rows[0].cashRegisterName.length).toBeGreaterThan(0);
  });

  it("isOverdue=true past the OVERDUE_DAYS threshold, false within it", async () => {
    await seedTrayRow({
      transactionDate: daysAgo(5),
      validationStatus: "pendiente",
    });
    await seedTrayRow({
      transactionDate: daysAgo(1),
      validationStatus: "pendiente",
    });
    const { rows, thresholdDays } = await fetchTray(adminToken);
    expect(thresholdDays).toBe(OVERDUE_DAYS);
    const old = rows.find((r) => r.transactionDate === daysAgo(5));
    const fresh = rows.find((r) => r.transactionDate === daysAgo(1));
    expect(old?.isOverdue).toBe(true);
    expect(fresh?.isOverdue).toBe(false);
  });

  it("status filter: observados / pendientes / todos", async () => {
    await seedTrayRow({
      transactionDate: daysAgo(3),
      validationStatus: "pendiente",
    });
    await seedTrayRow({
      transactionDate: daysAgo(4),
      validationStatus: "observado",
    });

    const observados = await fetchTray(adminToken, "?status=observados");
    expect(observados.rows).toHaveLength(1);
    expect(observados.rows[0].validationStatus).toBe("observado");

    const pendientes = await fetchTray(adminToken, "?status=pendientes");
    expect(pendientes.rows).toHaveLength(1);
    expect(pendientes.rows[0].validationStatus).toBe("pendiente");

    const todos = await fetchTray(adminToken, "?status=todos");
    expect(todos.rows).toHaveLength(2);

    // default (no status) returns both.
    const def = await fetchTray(adminToken);
    expect(def.rows).toHaveLength(2);
  });

  it("COBRO-02: exposes miscReason — 'sin_plan' for a cobro suelto, null otherwise", async () => {
    // Cobro suelto (advance_payment) marcado 'sin_plan'.
    await seedTrayRow({
      transactionDate: daysAgo(2),
      validationStatus: "pendiente",
      kind: "advance_payment",
      miscReason: "sin_plan",
    });
    // Fila no-misc (plan_charge) → miscReason null.
    await seedTrayRow({
      transactionDate: daysAgo(1),
      validationStatus: "pendiente",
      kind: "plan_charge",
    });

    const { rows } = await fetchTray(adminToken);
    expect(rows).toHaveLength(2);
    const misc = rows.find((r) => r.transactionDate === daysAgo(2));
    const planCharge = rows.find((r) => r.transactionDate === daysAgo(1));
    expect(misc?.miscReason).toBe("sin_plan");
    expect(planCharge?.miscReason).toBeNull();
  });

  it("coach → 403", async () => {
    const res = await app.inject({
      method: "GET",
      url: PENDING_TRAY_URL,
      headers: { authorization: `Bearer ${coachToken}` },
    });
    expect(res.statusCode).toBe(403);
  });
});
