/**
 * Fase 207 (plan 06) — snapshot de la sede del alumno en cada cobro (D-14).
 *
 * `financial_transactions.member_branch_id` guarda la sede del socio AL MOMENTO
 * del cobro. Cubre:
 *   - Un cobro por cada camino de alta con socio: POST /transactions (ficha),
 *     PoS pay-plan (renovación y deuda saldada), PoS misc, ficha assign y PoS
 *     alta de alumno NUEVO (usuario creado en la misma tx).
 *   - Egresos y traslados (sin socio) → NULL.
 *   - Alumno mudado: los cobros previos conservan la sede; el nuevo toma la
 *     actual. Lo leen el Tablero (`getIncomeByMemberBranch`, con centavos y con
 *     fallback a la sede actual para filas sin snapshot) y Reportes → Cobros
 *     (columna y filtro de sede).
 *   - correct(): mismo socio conserva el snapshot, otro socio toma su sede.
 *
 * Armado calcado de centavos-cobros.test.ts, centavos-traslados-retiros.test.ts
 * y weekly-board/by-branch-caja-alumnos.test.ts.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { eq, and, inArray, sql } from "drizzle-orm";
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
import { seedBoardMember, seedIncome } from "../fixtures/weekly-board";
import { tenantValues, tenantWhere } from "../../src/modules/shared/tenant";
import {
  TransactionService,
  BalanceService,
  CashRegisterService,
} from "../../src/modules/finance";

const TEMPLO_CTX = { tenantId: TENANT_TEMPLO };

const FIN = "/api/admin/finance";
const COACH_LOAD_URL = `${FIN}/coach-load`;
const SUBSCRIPTIONS_URL = "/api/admin/subscriptions";
const REPORTS_URL = "/api/admin/reports";
const PLAN_PRICE = 30000;
const CUTOFF = "2020-01-01";

let app: FastifyInstance;
let transactions: TransactionService;
let adminToken: string;
let coachAToken: string;
let coachBToken: string;
let costCenterId: number;
/** Sedes del escenario: A (origen del socio), B (alta PoS), C (mudanza), D (otro socio). */
let branchA: number;
let branchB: number;
let branchC: number;
let branchD: number;
let branchAName: string;
let memberId: number;
let memberDId: number;
let planId: number;
let dniSeq = 0;
const cajaIds: number[] = [];

const today = new Date().toISOString().split("T")[0];

function uniqueDni(): string {
  dniSeq = (dniSeq + 1) % 100000;
  return `M${Date.now().toString(36)}${String(dniSeq).padStart(5, "0")}`;
}

async function createBranch(label: string): Promise<number> {
  const [branch] = await app.db
    .insert(schema.branches)
    .values({
      name: `MBS-${label}-${Date.now() % 1000000}`,
      code: `MB${label}${Date.now() % 100000}`,
      country: "AR",
    })
    .$returningId();
  return branch.id;
}

/** Sede del alumno guardada en el cobro (null si la columna es NULL). */
async function snapshotOf(txId: number): Promise<number | null> {
  const [row] = await app.db
    .select({ memberBranchId: schema.financialTransactions.memberBranchId })
    .from(schema.financialTransactions)
    .where(
      and(
        tenantWhere(schema.financialTransactions, TEMPLO_CTX),
        eq(schema.financialTransactions.id, txId),
      ),
    )
    .limit(1);
  expect(row).toBeDefined();
  return row.memberBranchId;
}

/** Ids de los cobros no anulados de un socio, filtrados por kind. */
async function txIdsOf(
  forMemberId: number,
  kind: "plan_charge" | "debt_settlement" | "advance_payment",
): Promise<number[]> {
  const rows = await app.db
    .select({ id: schema.financialTransactions.id })
    .from(schema.financialTransactions)
    .where(
      and(
        tenantWhere(schema.financialTransactions, TEMPLO_CTX),
        eq(schema.financialTransactions.memberId, forMemberId),
        eq(schema.financialTransactions.kind, kind),
      ),
    );
  return rows.map((r) => r.id);
}

async function moveMember(forMemberId: number, toBranch: number) {
  await app.db
    .update(schema.users)
    .set({ branchId: toBranch })
    .where(
      and(
        tenantWhere(schema.users, TEMPLO_CTX),
        eq(schema.users.id, forMemberId),
      ),
    );
}

/** Cobro suelto de la ficha (POST /transactions): advance_payment sin links. */
async function postAdvance(
  forMemberId: number,
  amount: number,
  cobroBranch: number = branchA,
): Promise<number> {
  const res = await app.inject({
    method: "POST",
    url: `${FIN}/transactions`,
    headers: { authorization: `Bearer ${adminToken}` },
    payload: {
      memberId: forMemberId,
      kind: "advance_payment",
      direction: "inflow",
      amount,
      currency: "ARS",
      paymentMethod: "cash",
      transactionDate: today,
      effectiveDate: today,
      branchId: cobroBranch,
      notes: null,
      links: [],
    },
  });
  expect(res.statusCode, res.body).toBe(201);
  const body = JSON.parse(res.body) as { transaction: { id: number } };
  return body.transaction.id;
}

async function seedRenewableSubscription(): Promise<number> {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];
  const start = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];
  const [res] = await app.db
    .insert(schema.subscriptions)
    .values({
      tenantId: TENANT_TEMPLO,
      userId: memberId,
      planId,
      branchId: branchA,
      status: "active",
      startDate: start,
      endDate: yesterday,
      pricePaid: PLAN_PRICE,
      currency: "ARS",
      priceTypeApplied: "regular",
    })
    .$returningId();
  return res.id;
}

async function seedCurrentSubscriptionWithDebt(debt: number): Promise<number> {
  const start = new Date().toISOString().split("T")[0];
  const future = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];
  const [res] = await app.db
    .insert(schema.subscriptions)
    .values({
      tenantId: TENANT_TEMPLO,
      userId: memberId,
      planId,
      branchId: branchA,
      status: "active",
      startDate: start,
      endDate: future,
      pricePaid: PLAN_PRICE,
      currency: "ARS",
      priceTypeApplied: "regular",
    })
    .$returningId();
  await app.db.insert(schema.balances).values(
    tenantValues(TEMPLO_CTX, {
      memberId,
      targetKind: "subscription",
      targetId: res.id,
      currency: "ARS",
      amount: debt,
    }),
  );
  return res.id;
}

async function payPlan(payload: Record<string, unknown>) {
  const res = await app.inject({
    method: "POST",
    url: `${COACH_LOAD_URL}/pay-plan`,
    headers: { authorization: `Bearer ${coachAToken}` },
    payload: {
      userId: memberId,
      paymentMethod: "cash",
      idempotencyKey: `mbs-pay-${Date.now()}-${Math.random()}`,
      ...payload,
    },
  });
  return { statusCode: res.statusCode, body: JSON.parse(res.body) };
}

async function assign(payload: Record<string, unknown>) {
  const res = await app.inject({
    method: "POST",
    url: `${SUBSCRIPTIONS_URL}/members/${memberId}/subscription/assign`,
    headers: { authorization: `Bearer ${adminToken}` },
    payload: {
      planId,
      branchId: branchA,
      startDate: today,
      priceTypeApplied: "regular",
      paymentMethod: "cash",
      ...payload,
    },
  });
  return { statusCode: res.statusCode, body: JSON.parse(res.body) };
}

async function newBancoCaja(opening: number): Promise<number> {
  const [caja] = await app.db
    .insert(schema.cashRegisters)
    .values(
      tenantValues(TEMPLO_CTX, {
        name: `MBS-Test ${Date.now()}-${Math.random()}`,
        type: "banco" as const,
        branchId: null,
        currency: "ARS",
        openingBalance: opening,
        cutoffDate: CUTOFF,
      }),
    )
    .$returningId();
  cajaIds.push(caja.id);
  return caja.id;
}

async function incomeByMemberBranch() {
  return transactions.getIncomeByMemberBranch(TEMPLO_CTX, {
    dateFrom: today,
    dateTo: today,
  });
}

beforeAll(async () => {
  app = await createTestApp();
  transactions = new TransactionService(
    app.db,
    app.log,
    new BalanceService(app.db, app.log),
    new CashRegisterService(app.db, app.log),
  );
  adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");

  branchA = await createBranch("A");
  branchB = await createBranch("B");
  branchC = await createBranch("C");
  branchD = await createBranch("D");
  const [aRow] = await app.db
    .select({ name: schema.branches.name })
    .from(schema.branches)
    .where(eq(schema.branches.id, branchA))
    .limit(1);
  branchAName = aRow.name;

  // Cobros en efectivo: solo se cobra en las cajas de A y B.
  await ensureEfectivoCaja(app, branchA, "ARS");
  await ensureEfectivoCaja(app, branchB, "ARS");

  await createStaffUser(app, {
    email: "coach-mbs-a@test.local",
    password: "pass123456",
    firstName: "Coach",
    lastName: "SnapA",
    role: "coach",
    branchId: branchA,
  });
  await createStaffUser(app, {
    email: "coach-mbs-b@test.local",
    password: "pass123456",
    firstName: "Coach",
    lastName: "SnapB",
    role: "coach",
    branchId: branchB,
  });
  coachAToken = await getAuthToken(app, "coach-mbs-a@test.local", "pass123456");
  coachBToken = await getAuthToken(app, "coach-mbs-b@test.local", "pass123456");

  const [planRes] = await app.db
    .insert(schema.subscriptionPlans)
    .values({
      tenantId: TENANT_TEMPLO,
      name: "Snapshot Plan",
      planTier: "flex",
      bookingMode: "flexible",
      planCategory: "presencial",
      priceRegular: PLAN_PRICE,
      priceZero: 0,
      durationDays: 30,
      classesPerWeek: 3,
      currency: "ARS",
    })
    .$returningId();
  planId = planRes.id;

  const [existing] = await app.db
    .select({ id: schema.costCenters.id })
    .from(schema.costCenters)
    .where(
      and(
        tenantWhere(schema.costCenters, TEMPLO_CTX),
        eq(schema.costCenters.name, "Varios"),
        eq(schema.costCenters.country, "AR"),
        eq(schema.costCenters.isActive, true),
      ),
    )
    .limit(1);
  if (existing) {
    costCenterId = existing.id;
  } else {
    const [ins] = await app.db
      .insert(schema.costCenters)
      .values(
        tenantValues(TEMPLO_CTX, {
          name: "Varios",
          country: "AR",
          isActive: true,
        }),
      )
      .$returningId();
    costCenterId = ins.id;
  }
});

afterAll(async () => {
  if (cajaIds.length > 0) {
    const ids = cajaIds.join(",");
    await app.db.execute(
      sql.raw(
        `DELETE FROM transaction_links WHERE tenant_id = ${TENANT_TEMPLO} AND transaction_id IN (SELECT id FROM financial_transactions WHERE tenant_id = ${TENANT_TEMPLO} AND cash_register_id IN (${ids}))`,
      ),
    );
    await app.db.execute(
      sql.raw(
        `DELETE FROM financial_transactions WHERE tenant_id = ${TENANT_TEMPLO} AND cash_register_id IN (${ids})`,
      ),
    );
    await app.db
      .delete(schema.cashRegisters)
      .where(
        and(
          tenantWhere(schema.cashRegisters, TEMPLO_CTX),
          inArray(schema.cashRegisters.id, cajaIds),
        ),
      );
  }
  await app.close();
});

beforeEach(async () => {
  // Misma limpieza que centavos-cobros.test.ts: una sola conexión con FK checks
  // off y DELETE acotados al gimnasio.
  const conn = await app.dbPool.getConnection();
  try {
    await conn.query("SET FOREIGN_KEY_CHECKS=0");
    await conn.query("DELETE FROM `transaction_links` WHERE tenant_id = ?", [
      TENANT_TEMPLO,
    ]);
    await conn.query(
      "DELETE FROM `financial_transactions` WHERE tenant_id = ?",
      [TENANT_TEMPLO],
    );
    await conn.query("DELETE FROM `balances` WHERE tenant_id = ?", [
      TENANT_TEMPLO,
    ]);
    await conn.query("DELETE FROM `audit_log` WHERE tenant_id = ?", [
      TENANT_TEMPLO,
    ]);
    await conn.query("DELETE FROM `bookings` WHERE tenant_id = ?", [
      TENANT_TEMPLO,
    ]);
    await conn.query("DELETE FROM `program_enrollments`");
    await conn.query("DELETE FROM `subscriptions` WHERE tenant_id = ?", [
      TENANT_TEMPLO,
    ]);
    await conn.query("SET FOREIGN_KEY_CHECKS=1");
  } finally {
    conn.release();
  }

  const member = await registerUser(app, {
    email: `mbs-member-${Date.now()}@test.local`,
    password: "TestPass123!",
    firstName: "Snapshot",
    lastName: "Member",
    branchId: branchA,
  });
  memberId = (member.user as { id: number }).id;
  memberDId = await seedBoardMember(app, { branchId: branchD });
});

describe("snapshot de sede: un cobro por cada camino de alta", () => {
  it("POST /transactions (ficha, cobro suelto) → sede del socio", async () => {
    const txId = await postAdvance(memberId, 1000);
    expect(await snapshotOf(txId)).toBe(branchA);
  });

  it("PoS pay-plan renovación → sede del socio", async () => {
    await seedRenewableSubscription();
    const { statusCode, body } = await payPlan({ amountReceived: PLAN_PRICE });
    expect(statusCode, JSON.stringify(body)).toBe(201);
    const ids = await txIdsOf(memberId, "plan_charge");
    expect(ids).toHaveLength(1);
    expect(await snapshotOf(ids[0])).toBe(branchA);
  });

  it("PoS pay-plan saldando una deuda → sede del socio", async () => {
    await seedCurrentSubscriptionWithDebt(5000);
    const { statusCode, body } = await payPlan({ amountReceived: 5000 });
    expect(statusCode, JSON.stringify(body)).toBe(201);
    const ids = await txIdsOf(memberId, "debt_settlement");
    expect(ids).toHaveLength(1);
    expect(await snapshotOf(ids[0])).toBe(branchA);
  });

  it("PoS misc (cobro suelto) → sede del socio", async () => {
    const res = await app.inject({
      method: "POST",
      url: `${COACH_LOAD_URL}/misc`,
      headers: { authorization: `Bearer ${coachAToken}` },
      payload: {
        memberId,
        amount: 1500,
        concepto: "Suplemento",
        paymentMethod: "cash",
        currency: "ARS",
        idempotencyKey: `mbs-misc-${Date.now()}-${Math.random()}`,
        miscReason: "otro",
      },
    });
    expect(res.statusCode, res.body).toBe(201);
    const ids = await txIdsOf(memberId, "advance_payment");
    expect(ids).toHaveLength(1);
    expect(await snapshotOf(ids[0])).toBe(branchA);
  });

  it("ficha assign con amountReceived → sede del socio", async () => {
    const res = await assign({ amountReceived: 20000 });
    expect(res.statusCode, JSON.stringify(res.body)).toBe(201);
    const ids = await txIdsOf(memberId, "plan_charge");
    expect(ids).toHaveLength(1);
    expect(await snapshotOf(ids[0])).toBe(branchA);
  });

  it("PoS alta de alumno NUEVO en la sede B → el cobro queda en B (alumno creado en la misma tx)", async () => {
    const key = `mbs-alta-${Date.now()}`;
    const res = await app.inject({
      method: "POST",
      url: `${COACH_LOAD_URL}/alta`,
      headers: { authorization: `Bearer ${coachBToken}` },
      payload: {
        firstName: "Alta",
        lastName: "Snapshot",
        dni: uniqueDni(),
        branchId: branchB,
        planId,
        paymentMethod: "cash",
        amountReceived: 10000,
        idempotencyKey: key,
      },
    });
    expect(res.statusCode, res.body).toBe(201);
    const [charge] = await app.db
      .select({
        id: schema.financialTransactions.id,
        memberBranchId: schema.financialTransactions.memberBranchId,
      })
      .from(schema.financialTransactions)
      .where(
        and(
          tenantWhere(schema.financialTransactions, TEMPLO_CTX),
          eq(schema.financialTransactions.idempotencyKey, key),
        ),
      )
      .limit(1);
    expect(charge).toBeDefined();
    expect(charge.memberBranchId).toBe(branchB);
  });
});

describe("snapshot de sede: sin socio queda NULL", () => {
  it("POST /expenses y POST /movements → member_branch_id NULL", async () => {
    const origen = await newBancoCaja(5000);
    const destino = await newBancoCaja(0);

    const expense = await app.inject({
      method: "POST",
      url: `${FIN}/expenses`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { cajaId: origen, amount: 100.5, costCenterId },
    });
    expect(expense.statusCode, expense.body).toBe(201);

    const movement = await app.inject({
      method: "POST",
      url: `${FIN}/movements`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { origenCajaId: origen, destinoCajaId: destino, amount: 200 },
    });
    expect(movement.statusCode, movement.body).toBe(201);

    const rows = await app.db
      .select({
        kind: schema.financialTransactions.kind,
        memberId: schema.financialTransactions.memberId,
        memberBranchId: schema.financialTransactions.memberBranchId,
      })
      .from(schema.financialTransactions)
      .where(
        and(
          tenantWhere(schema.financialTransactions, TEMPLO_CTX),
          inArray(schema.financialTransactions.cashRegisterId, [
            origen,
            destino,
          ]),
        ),
      );
    // 1 egreso + 2 patas del traslado.
    expect(rows.length).toBeGreaterThanOrEqual(3);
    for (const r of rows) {
      expect(r.memberId).toBeNull();
      expect(r.memberBranchId).toBeNull();
    }
  });
});

describe("snapshot de sede: alumno mudado", () => {
  it("los cobros previos siguen en A y el nuevo queda en la sede C", async () => {
    const previo = await postAdvance(memberId, 1000);
    await moveMember(memberId, branchC);
    const nuevo = await postAdvance(memberId, 2000);

    expect(await snapshotOf(previo)).toBe(branchA);
    expect(await snapshotOf(nuevo)).toBe(branchC);
  });

  it("Tablero: el cobro previo cuenta en A (no en C), el nuevo en C, con centavos exactos", async () => {
    await postAdvance(memberId, 100.1);
    await postAdvance(memberId, 200.2);
    await moveMember(memberId, branchC);
    await postAdvance(memberId, 50.05);

    const byBranch = await incomeByMemberBranch();
    // 100.10 + 200.20 con floats da 300.29999999999995.
    expect(byBranch.get(branchA)?.get("ARS")).toBe(300.3);
    expect(byBranch.get(branchC)?.get("ARS")).toBe(50.05);
  });

  it("Tablero: una fila sin snapshot cobrada en B cae en la sede ACTUAL del socio (A)", async () => {
    await seedIncome(app, {
      memberId,
      cobroBranchId: branchB,
      amount: 700.7,
      currency: "ARS",
      transactionDate: today,
      state: "firme",
      memberBranchId: null,
    });

    const byBranch = await incomeByMemberBranch();
    expect(byBranch.get(branchA)?.get("ARS")).toBe(700.7);
    expect(byBranch.get(branchB)?.get("ARS")).toBeUndefined();
  });

  it("Reportes → Cobros: columna y filtro de sede siguen el snapshot tras mudar al alumno", async () => {
    const res = await assign({ amountReceived: 12345 });
    expect(res.statusCode, JSON.stringify(res.body)).toBe(201);
    await moveMember(memberId, branchC);

    const [branchCRow] = await app.db
      .select({ name: schema.branches.name })
      .from(schema.branches)
      .where(eq(schema.branches.id, branchC))
      .limit(1);

    const all = await app.inject({
      method: "GET",
      url: `${REPORTS_URL}/charges?branchId=${branchA}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(all.statusCode, all.body).toBe(200);
    const bodyA = JSON.parse(all.body) as {
      rows: Array<{ amount: number; memberBranchName: string }>;
    };
    const rowA = bodyA.rows.find((r) => r.amount === 12345);
    expect(rowA).toBeDefined();
    expect(rowA?.memberBranchName).toBe(branchAName);

    const inC = await app.inject({
      method: "GET",
      url: `${REPORTS_URL}/charges?branchId=${branchC}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(inC.statusCode, inC.body).toBe(200);
    const bodyC = JSON.parse(inC.body) as {
      rows: Array<{ amount: number; memberBranchName: string }>;
    };
    expect(bodyC.rows.find((r) => r.amount === 12345)).toBeUndefined();
    expect(branchCRow.name).not.toBe(branchAName);
  });
});

describe("snapshot de sede: correct()", () => {
  async function correct(
    txId: number,
    correctedFields: Record<string, unknown>,
  ): Promise<number> {
    const res = await app.inject({
      method: "POST",
      url: `${FIN}/transactions/${txId}/correct`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { correctedFields },
    });
    expect(res.statusCode, res.body).toBe(201);
    return (JSON.parse(res.body) as { transaction: { id: number } }).transaction
      .id;
  }

  it("mismo socio (ya mudado a C) → el cobro corregido conserva la sede A", async () => {
    const original = await postAdvance(memberId, 1000);
    await moveMember(memberId, branchC);

    const corregido = await correct(original, { amount: 1000.5 });
    expect(corregido).not.toBe(original);
    expect(await snapshotOf(corregido)).toBe(branchA);
  });

  it("memberId explícito igual al original también conserva la sede", async () => {
    const original = await postAdvance(memberId, 1000);
    await moveMember(memberId, branchC);

    const corregido = await correct(original, { memberId, amount: 900 });
    expect(await snapshotOf(corregido)).toBe(branchA);
  });

  it("cambiando a un socio de la sede D → el cobro nuevo queda en D", async () => {
    const original = await postAdvance(memberId, 1000);

    const corregido = await correct(original, { memberId: memberDId });
    expect(await snapshotOf(corregido)).toBe(branchD);
    // El original (anulado por corrección) no se toca.
    expect(await snapshotOf(original)).toBe(branchA);
  });
});
