/**
 * Fase 207 Plan 12 (DI-09, SC-5, T-207-33) — no-regresion con enteros y
 * recorrido de punta a punta con centavos.
 *
 * Parte 1 ("enteros: mismos totales que antes"): con un escenario de SOLO
 * enteros, cada lector del ledger devuelve exactamente el total esperado, y
 * ese total es un entero. No compara contra una corrida "antes" (no hay forma
 * de correr el codigo viejo en el mismo proceso): compara contra totales
 * calculados a mano para lo sembrado (cada literal lleva su cuenta al lado) y
 * exige `Number.isInteger` en cada uno. Si algun dia un lector vuelve a
 * truncar, redondear o devolver string, este archivo se pone rojo con enteros.
 *
 * Parte 2 ("punta a punta con centavos"): un alumno de la sede A paga por la
 * PoS 33,33 x 3 + 0,01 de una deuda de 100. La deuda queda en 0, la caja
 * efectivo de A sube 100,00, Reportes -> Cobros muestra los 4 cobros con la
 * sede del alumno A, y despues de mudar al alumno a la sede B el Tablero sigue
 * poniendo los 100 en A (snapshot de la sede del alumno, D-14).
 *
 * Armado calcado de member-branch-snapshot.test.ts (PoS, sedes),
 * centavos-cajas.test.ts (cobros y egreso en la caja),
 * centavos-reportes.test.ts (deudas) y weekly-board-routes.test.ts (Tablero).
 * Todas las fechas salen de `boardWeeks()` (lunes de la semana en curso): sin
 * helpers de fecha en UTC, sin fake timers y sin ids de `users` hardcodeados.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  createTestApp,
  cleanAllTestData,
  createStaffUser,
  getAuthToken,
  registerUser,
} from "../helpers";
import * as schema from "../../src/db/schema";
import { tenantValues, tenantWhere } from "../../src/modules/shared/tenant";
import {
  TransactionService,
  BalanceService,
  CashRegisterService,
} from "../../src/modules/finance";
import { sumMoney } from "../../src/modules/shared/money";
import type {
  BoardCell,
  BoardMetric,
  BoardMetricKey,
  WeeklyBoardResponse,
} from "../../src/modules/weekly-board/types";
import {
  TENANT_TEMPLO,
  TENANT_DOS,
  limpiarSegundoGimnasio,
} from "../fixtures/second-tenant";
import {
  boardWeeks,
  seedBoardBranches,
  cleanupBoardBranches,
  seedBoardMember,
  seedIncome,
  seedDebt,
  clearDebtManagement,
  type BoardBranches,
  type BoardWeeks,
} from "../fixtures/weekly-board";

const TEMPLO_CTX = { tenantId: TENANT_TEMPLO };
const FIN = "/api/admin/finance";
const COACH_LOAD_URL = `${FIN}/coach-load`;
const REPORTS_URL = "/api/admin/reports";
const BOARD_URL = "/api/admin/weekly-board";
const PLAN_PRICE = 30000;
const CUTOFF = "2020-01-01";

// ─── tipos de las respuestas ─────────────────────────────────────────────

interface SummaryBody {
  monthlyRevenue: number;
  revenueByMethod: Record<string, number>;
  revenueByBranch: Array<{ branchId: number; revenue: number }>;
}

interface BalanceRow {
  cashRegisterId: number;
  firmeBalance: number;
}

interface OutstandingBody {
  statusTotals: { cobrable: Record<string, number> };
}

interface ChargesBody {
  rows: Array<{
    memberId: number;
    amount: number;
    memberBranchName: string;
    chargeBranchName: string | null;
  }>;
}

// ─── armado ──────────────────────────────────────────────────────────────

let app: FastifyInstance;
let transactions: TransactionService;
let branches: BoardBranches;
let weeks: BoardWeeks;
/** Lunes de la semana en curso: dentro de la semana del Tablero y nunca futuro. */
let day: string;
let adminId: number;
let ownerToken: string;
let cajaA: number;

/** Un total de plata del escenario entero: es el numero esperado Y es entero. */
function expectInteger(what: string, value: number, expected: number): void {
  expect(value, what).toBe(expected);
  expect(Number.isInteger(value), `${what} debe ser entero`).toBe(true);
}

async function cleanAll(): Promise<void> {
  // `debt_management` no esta en `cleanAllTestData`: va antes que `balances`.
  await clearDebtManagement(app, [TENANT_TEMPLO, TENANT_DOS]);
  await cleanAllTestData(app);
}

async function getJson<T>(url: string, token = ownerToken): Promise<T> {
  const res = await app.inject({
    method: "GET",
    url,
    headers: { authorization: `Bearer ${token}` },
  });
  expect(res.statusCode, res.body).toBe(200);
  return res.json<T>();
}

function metric(res: WeeklyBoardResponse, key: BoardMetricKey): BoardMetric {
  const found = res.metrics.find((m) => m.key === key);
  if (!found) throw new Error(`Falta la metrica ${key} en el Tablero`);
  return found;
}

function branchCell(m: BoardMetric, branchId: number): BoardCell {
  const found = m.byBranch[String(branchId)];
  if (!found) throw new Error(`Falta la celda de la sede ${branchId}`);
  return found;
}

async function board(): Promise<WeeklyBoardResponse> {
  return getJson<WeeklyBoardResponse>(
    `${BOARD_URL}?weekStart=${weeks.current}`,
  );
}

async function cajaFirme(cashRegisterId: number): Promise<number> {
  const rows = await getJson<BalanceRow[]>(`${FIN}/cash-registers/balances`);
  const row = rows.find((r) => r.cashRegisterId === cashRegisterId);
  expect(
    row,
    `la caja ${cashRegisterId} no aparece en /balances`,
  ).toBeDefined();
  return (row as BalanceRow).firmeBalance;
}

async function summary(): Promise<SummaryBody> {
  return getJson<SummaryBody>(
    `${FIN}/transactions/summary?dateFrom=${day}&dateTo=${day}`,
  );
}

/** Cobro o egreso en EFECTIVO dentro de la caja de A (como `seedTx` de centavos-cajas). */
async function seedCashTx(opts: {
  memberId: number | null;
  amount: number;
  direction: "inflow" | "outflow";
}): Promise<void> {
  const inflow = opts.direction === "inflow";
  await app.db.insert(schema.financialTransactions).values(
    tenantValues(TEMPLO_CTX, {
      memberId: opts.memberId,
      memberBranchId: inflow ? branches.arA.id : null,
      kind: inflow ? ("plan_charge" as const) : ("expense" as const),
      direction: opts.direction,
      amount: opts.amount,
      currency: "ARS",
      paymentMethod: "cash" as const,
      transactionDate: day,
      effectiveDate: day,
      branchId: branches.arA.id,
      cashRegisterId: cajaA,
      recordedBy: adminId,
      validationStatus: "validado" as const,
    }),
  );
}

beforeAll(async () => {
  app = await createTestApp();
  transactions = new TransactionService(
    app.db,
    app.log,
    new BalanceService(app.db, app.log),
    new CashRegisterService(app.db, app.log),
  );
  weeks = boardWeeks();
  day = weeks.current;
  await cleanAll();
  branches = await seedBoardBranches(app);

  // Caja de efectivo propia de la sede A (las sedes del fixture no traen una).
  const [caja] = await app.db
    .insert(schema.cashRegisters)
    .values(
      tenantValues(TEMPLO_CTX, {
        name: `NRE-Efectivo ${Date.now()}`,
        type: "efectivo" as const,
        branchId: branches.arA.id,
        currency: "ARS",
        openingBalance: 0,
        cutoffDate: CUTOFF,
      }),
    )
    .$returningId();
  cajaA = caja.id;
});

afterAll(async () => {
  await cleanAll();
  await app.db
    .delete(schema.cashRegisters)
    .where(
      and(
        tenantWhere(schema.cashRegisters, TEMPLO_CTX),
        eq(schema.cashRegisters.id, cajaA),
      ),
    );
  await cleanupBoardBranches(
    app,
    Object.values(branches).map((b) => b.id),
  );
  await limpiarSegundoGimnasio(app);
  await app.close();
});

beforeEach(async () => {
  await cleanAll();
  // `cleanAllTestData` repone el owner admin@test.com.
  ownerToken = await getAuthToken(app, "admin@test.com", "adminpass123");
  const [admin] = await app.db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(
      and(
        tenantWhere(schema.users, TEMPLO_CTX),
        eq(schema.users.email, "admin@test.com"),
      ),
    )
    .limit(1);
  adminId = admin.id;
});

// ─── Parte 1: enteros ────────────────────────────────────────────────────

describe("enteros: mismos totales que antes (DI-09)", () => {
  /**
   * Escenario: sedes A y B con un socio cada una (mA y mA2 en A, mB en B).
   *   - mA paga 1500 y 2500 en EFECTIVO en la caja de A.
   *   - mA paga 3000 por TRANSFERENCIA, cobrado en la sede B.
   *   - Un egreso de 700 sale de la caja de A.
   *   - Deudas de membresia: 300 (mA) y 400 (mA2), ambas de la sede A.
   */
  async function seedEscenarioEntero(): Promise<void> {
    const { arA, arB } = branches;
    const mA = await seedBoardMember(app, { branchId: arA.id });
    const mA2 = await seedBoardMember(app, { branchId: arA.id });
    await seedBoardMember(app, { branchId: arB.id });

    await seedCashTx({ memberId: mA, amount: 1500, direction: "inflow" });
    await seedCashTx({ memberId: mA, amount: 2500, direction: "inflow" });
    await seedIncome(app, {
      memberId: mA,
      cobroBranchId: arB.id,
      amount: 3000,
      currency: "ARS",
      transactionDate: day,
      state: "firme",
    });
    await seedCashTx({ memberId: null, amount: 700, direction: "outflow" });

    await seedDebt(app, {
      memberId: mA,
      kind: "subscription",
      memberBranchId: arA.id,
      amount: 300,
      currency: "ARS",
      daysAgo: 0,
    });
    await seedDebt(app, {
      memberId: mA2,
      kind: "subscription",
      memberBranchId: arA.id,
      amount: 400,
      currency: "ARS",
      daysAgo: 0,
    });
  }

  it("Caja: el saldo firme de la caja efectivo de A es 3300", async () => {
    await seedEscenarioEntero();
    // 1500 + 2500 - 700 = 3300 (la transferencia de 3000 no entra al efectivo)
    expectInteger("saldo firme caja A", await cajaFirme(cajaA), 3300);
  });

  it("Resumen: monthlyRevenue 7000, efectivo 4000, transferencia 3000 y por sede del cobro", async () => {
    await seedEscenarioEntero();
    const body = await summary();
    // 1500 + 2500 + 3000 = 7000 (el egreso de 700 no es ingreso)
    expectInteger("monthlyRevenue", body.monthlyRevenue, 7000);
    // 1500 + 2500 = 4000
    expectInteger("cash", body.revenueByMethod.cash, 4000);
    expectInteger("transfer", body.revenueByMethod.transfer, 3000);

    const porSede = (id: number): number =>
      body.revenueByBranch.find((r) => r.branchId === id)?.revenue ?? 0;
    // Sede del cobro: A cobro 1500 + 2500 = 4000, B cobro 3000.
    expectInteger("Resumen sede A", porSede(branches.arA.id), 4000);
    expectInteger("Resumen sede B", porSede(branches.arB.id), 3000);
  });

  it("Ingresos por sede: del cobro (A 4000, B 3000) y del alumno (A 7000)", async () => {
    await seedEscenarioEntero();
    const range = { dateFrom: day, dateTo: day };

    const porCobro = await transactions.getIncomeByBranch(TEMPLO_CTX, range);
    const cobro = (id: number): number =>
      porCobro
        .filter((r) => r.branchId === id && r.currency === "ARS")
        .reduce((acc, r) => acc + r.total, 0);
    // 1500 + 2500 = 4000 cobrados en la sede A, 3000 en la B.
    expectInteger("ingresos del cobro A", cobro(branches.arA.id), 4000);
    expectInteger("ingresos del cobro B", cobro(branches.arB.id), 3000);

    const porAlumno = await transactions.getIncomeByMemberBranch(
      TEMPLO_CTX,
      range,
    );
    // Los tres cobros son de mA (sede A): 1500 + 2500 + 3000 = 7000.
    expectInteger(
      "ingresos del alumno A",
      porAlumno.get(branches.arA.id)?.get("ARS") ?? Number.NaN,
      7000,
    );
    expect(porAlumno.get(branches.arB.id)?.get("ARS")).toBeUndefined();
  });

  it("Deudas: statusTotals.cobrable.ARS = 700", async () => {
    await seedEscenarioEntero();
    const body = await getJson<OutstandingBody>(
      `${REPORTS_URL}/outstanding-balances`,
    );
    // 300 + 400 = 700
    expectInteger("Deudas cobrable", body.statusTotals.cobrable.ARS, 700);
  });

  it("Alumnos: totalDebtByCurrency ARS = 700", async () => {
    await seedEscenarioEntero();
    const body = await getJson<{
      totalDebtByCurrency: Array<{ currency: string; amount: number }>;
    }>("/api/admin/members");
    const ars = body.totalDebtByCurrency.find((d) => d.currency === "ARS");
    // 300 + 400 = 700
    expectInteger("Alumnos deuda ARS", ars?.amount ?? Number.NaN, 700);
  });

  it("Tablero: cobrado de A = 7000 (sede del alumno) y deuda cobrable de A = 700", async () => {
    await seedEscenarioEntero();
    const body = await board();
    // 1500 + 2500 + 3000 = 7000: la transferencia cobrada en B es del alumno de A.
    expectInteger(
      "Tablero cobrado A",
      branchCell(metric(body, "cobrado"), branches.arA.id).value ?? Number.NaN,
      7000,
    );
    expectInteger(
      "Tablero cobrado B",
      branchCell(metric(body, "cobrado"), branches.arB.id).value ?? 0,
      0,
    );
    // 300 + 400 = 700
    expectInteger(
      "Tablero deuda cobrable A",
      branchCell(metric(body, "deudaCobrable"), branches.arA.id).value ??
        Number.NaN,
      700,
    );
  });
});

// ─── Parte 2: punta a punta con centavos ─────────────────────────────────

describe("punta a punta con centavos (PoS -> caja -> Reportes -> Tablero)", () => {
  async function payPlan(memberId: number, amountReceived: number) {
    const res = await app.inject({
      method: "POST",
      url: `${COACH_LOAD_URL}/pay-plan`,
      // Con el owner el cobro nace `validado` (un coach lo deja `pendiente`
      // hasta la validacion de la bandeja): asi cuenta como plata firme.
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        userId: memberId,
        paymentMethod: "cash",
        amountReceived,
        idempotencyKey: `nre-pay-${Date.now()}-${Math.random()}`,
      },
    });
    expect(res.statusCode, res.body).toBe(201);
  }

  it("3 x 33,33 + 0,01 sobre una deuda de 100: deuda 0, caja +100,00, Reportes y Tablero en la sede A aunque el alumno se mude a B", async () => {
    const { arA, arB } = branches;
    const member = await registerUser(app, {
      email: `nre-member-${Date.now()}@test.local`,
      password: "TestPass123!",
      firstName: "Punta",
      lastName: "APunta",
      branchId: arA.id,
    });
    const memberId = (member.user as { id: number }).id;

    // `cleanAllTestData` borra los planes: se crea uno por corrida.
    const [plan] = await app.db
      .insert(schema.subscriptionPlans)
      .values({
        tenantId: TENANT_TEMPLO,
        name: "No-regresion Plan",
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
    const planId = plan.id;

    // Sub vigente de la sede A con una deuda de 100 (como centavos-cobros).
    const [sub] = await app.db
      .insert(schema.subscriptions)
      .values({
        tenantId: TENANT_TEMPLO,
        userId: memberId,
        planId,
        branchId: arA.id,
        status: "active",
        startDate: day,
        endDate: `${Number(day.slice(0, 4)) + 1}${day.slice(4)}`,
        pricePaid: PLAN_PRICE,
        currency: "ARS",
        priceTypeApplied: "regular",
      })
      .$returningId();
    await app.db.insert(schema.balances).values(
      tenantValues(TEMPLO_CTX, {
        memberId,
        targetKind: "subscription",
        targetId: sub.id,
        currency: "ARS",
        amount: 100,
      }),
    );

    // PoS: 33,33 + 33,33 + 33,33 + 0,01 = 100,00.
    for (const amountReceived of [33.33, 33.33, 33.33, 0.01]) {
      await payPlan(memberId, amountReceived);
    }

    // El PoS fecha el cobro con el dia UTC de hoy: se fija al lunes de la semana
    // en curso para que el Tablero no dependa de la hora en que corre CI.
    const cobros = await app.db
      .select({ id: schema.financialTransactions.id })
      .from(schema.financialTransactions)
      .where(
        and(
          tenantWhere(schema.financialTransactions, TEMPLO_CTX),
          eq(schema.financialTransactions.memberId, memberId),
        ),
      );
    expect(cobros).toHaveLength(4);
    await app.db
      .update(schema.financialTransactions)
      .set({ transactionDate: day, effectiveDate: day })
      .where(
        and(
          tenantWhere(schema.financialTransactions, TEMPLO_CTX),
          inArray(
            schema.financialTransactions.id,
            cobros.map((c) => c.id),
          ),
        ),
      );

    // 1) La deuda queda exactamente en 0.
    const [balance] = await app.db
      .select({ amount: schema.balances.amount })
      .from(schema.balances)
      .where(
        and(
          tenantWhere(schema.balances, TEMPLO_CTX),
          eq(schema.balances.targetKind, "subscription"),
          eq(schema.balances.targetId, sub.id),
        ),
      )
      .limit(1);
    expect(balance?.amount).toBe(0);

    // 2) La caja efectivo de A sube exactamente 100,00 y el Resumen coincide.
    expect(await cajaFirme(cajaA)).toBe(100);
    const resumen = await summary();
    expect(resumen.monthlyRevenue).toBe(100);
    expect(resumen.revenueByMethod.cash).toBe(100);

    // 3) Reportes -> Cobros: los 4 cobros, con la sede del alumno A.
    const charges = await getJson<ChargesBody>(
      `${REPORTS_URL}/charges?dateFrom=${day}&dateTo=${day}`,
    );
    const propios = charges.rows.filter((r) => r.memberId === memberId);
    expect(propios.map((r) => r.amount).sort((a, b) => a - b)).toEqual([
      0.01, 33.33, 33.33, 33.33,
    ]);
    expect(sumMoney(propios.map((r) => r.amount))).toBe(100);
    for (const r of propios) {
      expect(r.memberBranchName).toBe(arA.name);
      expect(r.chargeBranchName).toBe(arA.name);
    }

    // 4) El alumno se muda a la sede B: el snapshot de cada cobro sigue en A.
    await app.db
      .update(schema.users)
      .set({ branchId: arB.id })
      .where(
        and(
          tenantWhere(schema.users, TEMPLO_CTX),
          eq(schema.users.id, memberId),
        ),
      );

    const despues = await getJson<ChargesBody>(
      `${REPORTS_URL}/charges?dateFrom=${day}&dateTo=${day}`,
    );
    for (const r of despues.rows.filter((x) => x.memberId === memberId)) {
      expect(r.memberBranchName).toBe(arA.name);
    }

    const porAlumno = await transactions.getIncomeByMemberBranch(TEMPLO_CTX, {
      dateFrom: day,
      dateTo: day,
    });
    expect(porAlumno.get(arA.id)?.get("ARS")).toBe(100);
    expect(porAlumno.get(arB.id)?.get("ARS")).toBeUndefined();

    // 5) Tablero: los 100 siguen en A y B queda sin cobrado.
    const tablero = await board();
    const cobrado = metric(tablero, "cobrado");
    expect(branchCell(cobrado, arA.id).value).toBe(100);
    expect(branchCell(cobrado, arB.id).value ?? 0).toBe(0);
  });
});
