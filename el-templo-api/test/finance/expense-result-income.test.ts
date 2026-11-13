/**
 * Fase 211 Plan 01: `TransactionService.getMemberIncomeByBranch`, los cobros
 * firmes A ALUMNOS por sede del alumno (snapshot → sede actual → sede del cobro)
 * y moneda, con monto y cantidad. Servicio directo, sin HTTP.
 *
 * Mes del escenario: 2023-05 (rango 2023-05-01..2023-05-31). Los esperados son
 * literales con su cuenta en un comentario.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { createTestApp } from "../helpers";
import * as schema from "../../src/db/schema";
import { TENANT_TEMPLO } from "../fixtures/second-tenant";
import {
  cleanupBoardBranches,
  seedBoardBranches,
  seedBoardMember,
  seedIncome,
  type BoardBranches,
} from "../fixtures/weekly-board";
import { tenantValues, tenantWhere } from "../../src/modules/shared/tenant";
import {
  TransactionService,
  BalanceService,
  CashRegisterService,
} from "../../src/modules/finance";

const CTX = { tenantId: TENANT_TEMPLO };
const RANGE = { dateFrom: "2023-05-01", dateTo: "2023-05-31" };

let app: FastifyInstance;
let transactions: TransactionService;
let branches: BoardBranches;
const memberIds: number[] = [];
const txIds: number[] = [];

async function income(range = RANGE) {
  return transactions.getMemberIncomeByBranch(CTX, range);
}

beforeAll(async () => {
  app = await createTestApp();
  transactions = new TransactionService(
    app.db,
    app.log,
    new BalanceService(app.db, app.log),
    new CashRegisterService(app.db, app.log),
  );
  branches = await seedBoardBranches(app);
  const { arA, arB, es, virtualAr, inactiveAr } = branches;

  const member = async (branchId: number) => {
    const id = await seedBoardMember(app, { branchId });
    memberIds.push(id);
    return id;
  };
  const mA = await member(arA.id);
  const mB = await member(arB.id);
  const mMudado = await member(arB.id); // hoy en arB, pagó cuando estaba en arA
  const mSinSnapshot = await member(arA.id);
  const mV = await member(virtualAr.id);
  const mI = await member(inactiveAr.id);
  const mE = await member(es.id);

  const inc = async (opts: Parameters<typeof seedIncome>[1]) => {
    txIds.push(await seedIncome(app, opts));
  };

  // Entran
  await inc({
    memberId: mA,
    cobroBranchId: arA.id,
    amount: 50000,
    currency: "ARS",
    transactionDate: "2023-05-01",
    state: "firme",
  });
  await inc({
    memberId: mB,
    cobroBranchId: arB.id,
    amount: 30000,
    currency: "ARS",
    transactionDate: "2023-05-31",
    state: "firme",
    kind: "debt_settlement",
  });
  await inc({
    memberId: mMudado,
    cobroBranchId: arB.id,
    amount: 20000,
    currency: "ARS",
    transactionDate: "2023-05-10",
    state: "firme",
    memberBranchId: arA.id,
  });
  await inc({
    memberId: mSinSnapshot,
    cobroBranchId: arB.id,
    amount: 5000,
    currency: "ARS",
    transactionDate: "2023-05-12",
    state: "firme",
    memberBranchId: null,
  });
  await inc({
    memberId: mA,
    cobroBranchId: arA.id,
    amount: 100,
    currency: "EUR",
    transactionDate: "2023-05-15",
    state: "firme",
  });
  await inc({
    memberId: mV,
    cobroBranchId: virtualAr.id,
    amount: 3000,
    currency: "ARS",
    transactionDate: "2023-05-20",
    state: "firme",
  });
  await inc({
    memberId: mI,
    cobroBranchId: inactiveAr.id,
    amount: 1000,
    currency: "ARS",
    transactionDate: "2023-05-20",
    state: "firme",
  });
  await inc({
    memberId: mE,
    cobroBranchId: es.id,
    amount: 400,
    currency: "EUR",
    transactionDate: "2023-05-20",
    state: "firme",
  });

  // No entran
  await inc({
    memberId: mA,
    cobroBranchId: arA.id,
    amount: 7000,
    currency: "ARS",
    transactionDate: "2023-05-05",
    state: "pendiente",
  });
  await inc({
    memberId: mB,
    cobroBranchId: arB.id,
    amount: 9000,
    currency: "ARS",
    transactionDate: "2023-05-05",
    state: "anulado",
  });
  await inc({
    memberId: mA,
    cobroBranchId: arA.id,
    amount: 11111,
    currency: "ARS",
    transactionDate: "2023-06-01",
    state: "firme",
  });
  await inc({
    memberId: mA,
    cobroBranchId: arA.id,
    amount: 22222,
    currency: "ARS",
    transactionDate: "2023-04-30",
    state: "firme",
  });
  await inc({
    memberId: mA,
    cobroBranchId: arA.id,
    amount: 6000,
    currency: "ARS",
    transactionDate: "2023-05-06",
    state: "firme",
    kind: "cash_transfer",
  });

  // Ajuste de arqueo (sin alumno) y devolución (outflow): insertados directo.
  const [admin] = await app.db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(
      and(
        tenantWhere(schema.users, CTX),
        eq(schema.users.email, "admin@test.com"),
      ),
    )
    .limit(1);
  if (!admin) throw new Error("Falta admin@test.com en la base de test");
  const base = {
    paymentMethod: "cash" as const,
    transactionDate: "2023-05-07",
    effectiveDate: "2023-05-07",
    branchId: arA.id,
    currency: "ARS",
    recordedBy: admin.id,
  };
  const [adj] = await app.db
    .insert(schema.financialTransactions)
    .values(
      tenantValues(CTX, {
        ...base,
        memberId: null,
        kind: "adjustment" as const,
        direction: "inflow" as const,
        amount: 4000,
      }),
    )
    .$returningId();
  const [ref] = await app.db
    .insert(schema.financialTransactions)
    .values(
      tenantValues(CTX, {
        ...base,
        memberId: mA,
        kind: "refund" as const,
        direction: "outflow" as const,
        amount: 2500,
      }),
    )
    .$returningId();
  txIds.push(adj.id, ref.id);
});

afterAll(async () => {
  if (txIds.length > 0) {
    await app.db
      .delete(schema.financialTransactions)
      .where(
        and(
          tenantWhere(schema.financialTransactions, CTX),
          inArray(schema.financialTransactions.id, txIds),
        ),
      );
  }
  if (memberIds.length > 0) {
    await app.db
      .delete(schema.users)
      .where(
        and(
          tenantWhere(schema.users, CTX),
          inArray(schema.users.id, memberIds),
        ),
      );
  }
  await cleanupBoardBranches(
    app,
    Object.values(branches).map((b) => b.id),
  );
  await app.close();
});

describe("getMemberIncomeByBranch", () => {
  it("suma por la sede del alumno: snapshot, mudado y sin snapshot", async () => {
    const map = await income();
    // arA: 50000 + 20000 (mudado, snapshot arA) + 5000 (sin snapshot → sede actual arA)
    expect(map.get(branches.arA.id)?.get("ARS")).toEqual({
      amount: 75000,
      count: 3,
    });
    // arB: 30000 (debt_settlement del último día del mes)
    expect(map.get(branches.arB.id)?.get("ARS")).toEqual({
      amount: 30000,
      count: 1,
    });
  });

  it("no cuenta pendientes, anulados, fuera de rango, cash_transfer, ajustes de arqueo ni devoluciones", async () => {
    const map = await income();
    // Si alguno entrara, arA no sería 75000 (7000, 11111, 22222, 6000, 4000 o -2500 de más)
    expect(map.get(branches.arA.id)?.get("ARS")?.amount).toBe(75000);
    expect(map.get(branches.arB.id)?.get("ARS")?.amount).toBe(30000);
  });

  it("no filtra moneda: otra moneda de la misma sede viene aparte", async () => {
    const map = await income();
    expect(map.get(branches.arA.id)?.get("EUR")).toEqual({
      amount: 100,
      count: 1,
    });
  });

  it("no filtra estado ni virtualidad de la sede, ni país", async () => {
    const map = await income();
    expect(map.get(branches.virtualAr.id)?.get("ARS")).toEqual({
      amount: 3000,
      count: 1,
    });
    expect(map.get(branches.inactiveAr.id)?.get("ARS")).toEqual({
      amount: 1000,
      count: 1,
    });
    expect(map.get(branches.es.id)?.get("EUR")).toEqual({
      amount: 400,
      count: 1,
    });
  });

  it("difiere del Tablero solo en lo que no tiene alumno (ajuste de arqueo)", async () => {
    const tablero = await transactions.getIncomeByMemberBranch(CTX, RANGE);
    // Tablero arA: 75000 + 4000 (ajuste sin alumno cae en la sede del cobro)
    expect(tablero.get(branches.arA.id)?.get("ARS")).toBe(79000);
    const nuevo = await income();
    expect(nuevo.get(branches.arA.id)?.get("ARS")?.amount).toBe(75000);
    // arB igual en los dos
    expect(tablero.get(branches.arB.id)?.get("ARS")).toBe(30000);
    expect(nuevo.get(branches.arB.id)?.get("ARS")?.amount).toBe(30000);
  });

  it("un rango sin cobros no trae ninguna de las sedes propias", async () => {
    const map = await income({ dateFrom: "2019-01-01", dateTo: "2019-01-31" });
    for (const b of Object.values(branches)) expect(map.has(b.id)).toBe(false);
  });
});
