/**
 * Phase 141 (REP-03) → Phase 146 (ARQUEO-01/02/04) — Arqueo por caja.
 *
 * GET /api/admin/finance/movements-history es ahora el **arqueo por caja**:
 * dada una caja devuelve TODO lo imputado a ella (cobros de socio plan_charge/
 * debt_settlement/advance_payment/refund + egresos expense + traspasos
 * cash_transfer + ajustes adjustment), cada fila con su validationStatus.
 * Ya NO filtra `kind IN ('cash_transfer','expense','adjustment')`.
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
 *   - ARQUEO-01: un plan_charge + expense + cash_transfer en la misma caja → las 3 filas (antes el cobro se perdía)
 *   - ARQUEO-02: cada fila trae validationStatus; una pendiente y una validada aparecen ambas
 *   - ARQUEO-04: list() (pestaña Transacciones, GET /transactions) NO cambia: la NULL-member expense NO aparece allí
 *   - coach → 403 (FINANCE_READ_ROLES module guard)
 *
 * Runs against the per-worker test MySQL DB (eltemplo_test_<POOL_ID>).
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

/**
 * Fase 172 (172-14): gimnasio de las queries DIRECTAS de este archivo. Sale del
 * fixture, nunca de un `1` a mano. Con `finance` en `TENANT_STRICT_MODULES` el
 * sentinel hace throw sobre cualquier acceso a `financial_transactions` /
 * `transaction_links` / `cash_registers` sin gimnasio.
 */
const TEMPLO_CTX = { tenantId: TENANT_TEMPLO };

const MOV_EGRESOS_URL = "/api/admin/finance/movements-history";
const TRANSACTIONS_URL = "/api/admin/finance/transactions";

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
  validationStatus: string;
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
  validationStatus?: "pendiente" | "observado" | "corregido" | "validado";
  notes?: string | null;
}): Promise<number> {
  const [res] = await app.db
    .insert(schema.financialTransactions)
    .values(
      tenantValues(TEMPLO_CTX, {
        memberId: null, // ← the whole point: NULL-member rows must survive the LEFT JOIN
        kind: opts.kind,
        direction: opts.direction,
        amount: 500,
        currency: "ARS",
        paymentMethod: "cash" as const,
        transactionDate: opts.transactionDate,
        effectiveDate: opts.transactionDate,
        branchId: opts.branchId,
        cashRegisterId: opts.cashRegisterId,
        recordedBy: adminId,
        validationStatus: opts.validationStatus ?? ("validado" as const),
        notes: opts.notes ?? null,
      }),
    )
    .$returningId();
  return res.id;
}

/** Insert a member-keyed cobro (e.g. plan_charge) imputed to a caja. ARQUEO-01:
 *  these now belong to the arqueo por caja (before they were dropped). */
async function seedMemberCobro(opts: {
  kind: "plan_charge" | "debt_settlement" | "advance_payment" | "refund";
  direction: "inflow" | "outflow";
  transactionDate: string;
  cashRegisterId: number;
  branchId: number | null;
  validationStatus?: "pendiente" | "observado" | "corregido" | "validado";
}): Promise<number> {
  const [res] = await app.db
    .insert(schema.financialTransactions)
    .values(
      tenantValues(TEMPLO_CTX, {
        memberId,
        kind: opts.kind,
        direction: opts.direction,
        amount: 1000,
        currency: "ARS",
        paymentMethod: "cash" as const,
        transactionDate: opts.transactionDate,
        effectiveDate: opts.transactionDate,
        branchId: opts.branchId,
        cashRegisterId: opts.cashRegisterId,
        recordedBy: adminId,
        validationStatus: opts.validationStatus ?? ("validado" as const),
      }),
    )
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
    .where(
      and(
        eq(schema.cashRegisters.branchId, branchId),
        tenantWhere(schema.cashRegisters, TEMPLO_CTX),
      ),
    )
    .limit(1);
  cajaId = caja.id;

  // A second caja (same branch) for the ?cashRegisterId filter test.
  const [other] = await app.db
    .insert(schema.cashRegisters)
    .values(
      tenantValues(TEMPLO_CTX, {
        name: `MovEgr-Other ${Date.now()}`,
        type: "efectivo" as const,
        branchId,
        currency: "ARS",
        openingBalance: 0,
        cutoffDate: "2020-01-01",
      }),
    )
    .$returningId();
  otherCajaId = other.id;
});

afterAll(async () => {
  await app.db
    .delete(schema.cashRegisters)
    .where(
      and(
        eq(schema.cashRegisters.id, otherCajaId),
        tenantWhere(schema.cashRegisters, TEMPLO_CTX),
      ),
    );
  await app.close();
});

beforeEach(async () => {
  // 172-14: acotados al gimnasio (regla del 172-13: global a proposito ->
  // exencion; acotable -> filtro). Este archivo no siembra en otro gimnasio.
  await app.db.execute(
    sql`DELETE FROM transaction_links WHERE tenant_id = ${TENANT_TEMPLO}`,
  );
  await app.db.execute(
    sql`DELETE FROM financial_transactions WHERE tenant_id = ${TENANT_TEMPLO}`,
  );
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

  // ─── ARQUEO-01: arqueo por caja — TODOS los kinds imputados a la caja ──────
  it("ARQUEO-01: plan_charge + expense + cash_transfer en la misma caja → las 3 filas", async () => {
    // A member cobro (plan_charge) — antes se PERDÍA (kind IN no lo incluía).
    const cobroId = await seedMemberCobro({
      kind: "plan_charge",
      direction: "inflow",
      transactionDate: daysAgo(3),
      cashRegisterId: cajaId,
      branchId,
    });
    const expenseId = await seedMovEgreso({
      kind: "expense",
      direction: "outflow",
      transactionDate: daysAgo(2),
      cashRegisterId: cajaId,
      branchId,
    });
    const transferId = await seedMovEgreso({
      kind: "cash_transfer",
      direction: "outflow",
      transactionDate: daysAgo(1),
      cashRegisterId: cajaId,
      branchId,
    });

    const { rows } = await fetchHistory(
      adminToken,
      `?cashRegisterId=${cajaId}`,
    );
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(cobroId);
    expect(ids).toContain(expenseId);
    expect(ids).toContain(transferId);
    // El cobro de socio trae su memberId (no es NULL como egresos/traspasos).
    expect(rows.find((r) => r.id === cobroId)?.memberId).toBe(memberId);
    expect(rows.find((r) => r.id === cobroId)?.kind).toBe("plan_charge");
  });

  it("ARQUEO-01: también trae debt_settlement, advance_payment y refund imputados a la caja", async () => {
    const debtId = await seedMemberCobro({
      kind: "debt_settlement",
      direction: "inflow",
      transactionDate: daysAgo(3),
      cashRegisterId: cajaId,
      branchId,
    });
    const advanceId = await seedMemberCobro({
      kind: "advance_payment",
      direction: "inflow",
      transactionDate: daysAgo(2),
      cashRegisterId: cajaId,
      branchId,
    });
    const refundId = await seedMemberCobro({
      kind: "refund",
      direction: "outflow",
      transactionDate: daysAgo(1),
      cashRegisterId: cajaId,
      branchId,
    });

    const { rows } = await fetchHistory(
      adminToken,
      `?cashRegisterId=${cajaId}`,
    );
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(debtId);
    expect(ids).toContain(advanceId);
    expect(ids).toContain(refundId);
  });

  // ─── ARQUEO-02: cada fila trae su validationStatus; pendientes y validadas ─
  it("ARQUEO-02: cada fila trae validationStatus; una pendiente y una validada aparecen ambas", async () => {
    const pendingId = await seedMovEgreso({
      kind: "expense",
      direction: "outflow",
      transactionDate: daysAgo(2),
      cashRegisterId: cajaId,
      branchId,
      validationStatus: "pendiente",
    });
    const validatedId = await seedMemberCobro({
      kind: "plan_charge",
      direction: "inflow",
      transactionDate: daysAgo(1),
      cashRegisterId: cajaId,
      branchId,
      validationStatus: "validado",
    });

    const { rows } = await fetchHistory(
      adminToken,
      `?cashRegisterId=${cajaId}`,
    );
    const pending = rows.find((r) => r.id === pendingId);
    const validated = rows.find((r) => r.id === validatedId);
    // No se filtran por estado: ambas aparecen.
    expect(pending).toBeDefined();
    expect(validated).toBeDefined();
    expect(pending?.validationStatus).toBe("pendiente");
    expect(validated?.validationStatus).toBe("validado");
  });

  // ─── ARQUEO-04: list() (pestaña Transacciones) NO cambia de criterio ───────
  it("ARQUEO-04: la NULL-member expense NO aparece en GET /transactions (list intacto)", async () => {
    // Una expense sin socio imputada a la caja: aparece en el arqueo...
    const expenseId = await seedMovEgreso({
      kind: "expense",
      direction: "outflow",
      transactionDate: daysAgo(1),
      cashRegisterId: cajaId,
      branchId,
    });
    // ...y un cobro de socio que SÍ debe seguir en la vista comercial.
    const cobroId = await seedMemberCobro({
      kind: "plan_charge",
      direction: "inflow",
      transactionDate: daysAgo(1),
      cashRegisterId: cajaId,
      branchId,
    });

    // Arqueo: la expense aparece.
    const { rows: arqueoRows } = await fetchHistory(
      adminToken,
      `?cashRegisterId=${cajaId}`,
    );
    expect(arqueoRows.some((r) => r.id === expenseId)).toBe(true);

    // list() (Transacciones, INNER JOIN users): la NULL-member expense NO aparece;
    // el cobro de socio sí. Criterio inalterado por ARQUEO-04.
    const res = await app.inject({
      method: "GET",
      url: TRANSACTIONS_URL,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { rows: Array<{ id: number }> };
    const listIds = body.rows.map((r) => r.id);
    expect(listIds).not.toContain(expenseId);
    expect(listIds).toContain(cobroId);
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
