/**
 * Tablero semanal (fase 206, plan 04) — coincidencia por sede de Cobrado,
 * Deuda y Alumnos activos contra sus pantallas de origen.
 *
 *   - Cobrado: `TransactionService.getIncomeByMemberBranch` (sede del ALUMNO,
 *     D-12/D-19) contra `getIncomeByBranch` (Caja, sede del COBRO). La suma
 *     entre sedes de una moneda coincide, la sede no (D-14).
 *   - Deuda: `ReportsService.getDebtTotalsByMemberBranch` (sede del ALUMNO,
 *     D-20) contra `getOutstandingBalances` (Deudas, sede de la MEMBRESIA) para
 *     las deudas de membresia. Las deudas sueltas (`debt_balance`) cuentan en
 *     la sede del alumno.
 *   - Activos: `AnalyticsService.countActivePayingMembersByBranch` contra el
 *     KPI "Alumnos activos" de `getKpis` (D-21).
 *
 * Todo se siembra relativo a "ahora": los cobros caen en la SEMANA PASADA
 * (`boardWeeks().last`), la antiguedad de la deuda se mueve con
 * `NOW() - INTERVAL n DAY` y las suscripciones vigentes empiezan 60 dias atras
 * sin fecha de fin. Sin fake timers, sin helpers de fecha en UTC, sin ids de
 * `users` hardcodeados. Los asserts van sobre las sedes del fixture, nunca sobre
 * "cuantas sedes hay" (la base de test ya trae sedes de las migraciones).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { createTestApp, cleanAllTestData } from "../helpers";
import { addDays } from "../../src/modules/shared/date-utils";
import type { TenantContext } from "../../src/modules/shared/tenant";
import {
  TransactionService,
  BalanceService,
  CashRegisterService,
} from "../../src/modules/finance";
import { ReportsService } from "../../src/modules/reports/service";
import type {
  BucketTotals,
  OutstandingBalancesResult,
} from "../../src/modules/reports/types";
import { AnalyticsService } from "../../src/modules/analytics/service";
import { weekRange } from "../../src/modules/weekly-board/week";
import {
  TENANT_TEMPLO,
  TENANT_DOS,
  seedSecondTenant,
  limpiarSegundoGimnasio,
} from "../fixtures/second-tenant";
import {
  boardWeeks,
  seedBoardBranches,
  cleanupBoardBranches,
  seedBoardMember,
  seedIncome,
  seedDebt,
  seedActiveMember,
  clearDebtManagement,
  type BoardBranches,
  type BoardWeeks,
} from "../fixtures/weekly-board";

const TEMPLO_CTX: TenantContext = { tenantId: TENANT_TEMPLO };
const DOS_CTX: TenantContext = { tenantId: TENANT_DOS };

/** Lee una clave de un mapa y falla con mensaje claro si no esta. */
function must<V>(map: Map<number, V>, id: number, what: string): V {
  const value = map.get(id);
  if (value === undefined) {
    throw new Error(`Falta ${what} para la sede ${id} en el mapa del Tablero`);
  }
  return value;
}

function mustCurrency<V>(map: Map<string, V>, currency: string): V {
  const value = map.get(currency);
  if (value === undefined) {
    throw new Error(`Falta la moneda ${currency} en el mapa del Tablero`);
  }
  return value;
}

/** Los `bucketTotals` de un owner vienen por moneda: devuelve los de `currency`. */
function bucketsFor(
  result: OutstandingBalancesResult,
  currency: string,
): BucketTotals {
  const totals = result.bucketTotals;
  if ("0-5" in totals) {
    throw new Error("bucketTotals plano: se esperaba el formato de owner");
  }
  const byCurrency = totals[currency];
  if (byCurrency === undefined) {
    throw new Error(`Sin bucketTotals en ${currency}`);
  }
  return byCurrency;
}

describe("Tablero semanal — Cobrado, Deuda y Alumnos activos por sede (206-04)", () => {
  let app: FastifyInstance;
  let transactions: TransactionService;
  let reports: ReportsService;
  let analytics: AnalyticsService;
  let branches: BoardBranches;
  let weeks: BoardWeeks;
  let lastRange: { dateFrom: string; dateTo: string };
  /** Martes de la semana pasada: dentro del rango. */
  let lastTuesday: string;

  async function cleanAll(): Promise<void> {
    // `debt_management` no esta en `cleanAllTestData`: va antes que `balances`.
    await clearDebtManagement(app, [TENANT_TEMPLO, TENANT_DOS]);
    await cleanAllTestData(app);
  }

  beforeAll(async () => {
    app = await createTestApp();
    transactions = new TransactionService(
      app.db,
      app.log,
      new BalanceService(app.db, app.log),
      new CashRegisterService(app.db, app.log),
    );
    reports = new ReportsService(app.db, app.log);
    analytics = new AnalyticsService(app.db, app.log);
    weeks = boardWeeks();
    lastRange = weekRange(weeks.last);
    lastTuesday = addDays(weeks.last, 1);
    await cleanAll();
    branches = await seedBoardBranches(app);
  });

  afterAll(async () => {
    await cleanAll();
    await cleanupBoardBranches(
      app,
      Object.values(branches).map((b) => b.id),
    );
    await limpiarSegundoGimnasio(app);
    await app.close();
  });

  beforeEach(async () => {
    await cleanAll();
  });

  // ─── Cobrado ──────────────────────────────────────────────────────────────

  describe("Cobrado por sede del alumno (vs Caja por sede del cobro)", () => {
    /**
     * Escenario comun. Alumno de arA paga 1000 en la caja de arB, alumno de arB
     * paga 500 en arB, ingreso sin alumno de 200 en arB, alumno de es paga 80
     * EUR en es. No cuentan: un anulado, un pendiente, un cash_transfer y un
     * cobro fuera del rango.
     */
    async function seedCobros(): Promise<void> {
      const { arA, arB, es } = branches;
      const mA = await seedBoardMember(app, { branchId: arA.id });
      const mB = await seedBoardMember(app, { branchId: arB.id });
      const mEs = await seedBoardMember(app, { branchId: es.id });

      await seedIncome(app, {
        memberId: mA,
        cobroBranchId: arB.id,
        amount: 1000,
        currency: "ARS",
        transactionDate: lastTuesday,
        state: "firme",
      });
      await seedIncome(app, {
        memberId: mB,
        cobroBranchId: arB.id,
        amount: 500,
        currency: "ARS",
        transactionDate: lastTuesday,
        state: "firme",
      });
      await seedIncome(app, {
        memberId: null,
        cobroBranchId: arB.id,
        amount: 200,
        currency: "ARS",
        transactionDate: lastTuesday,
        state: "firme",
      });
      await seedIncome(app, {
        memberId: mEs,
        cobroBranchId: es.id,
        amount: 80,
        currency: "EUR",
        transactionDate: lastTuesday,
        state: "firme",
      });
      // No cuentan en Caja ni en el Tablero.
      await seedIncome(app, {
        memberId: mA,
        cobroBranchId: arA.id,
        amount: 999,
        currency: "ARS",
        transactionDate: lastTuesday,
        state: "anulado",
      });
      await seedIncome(app, {
        memberId: mA,
        cobroBranchId: arA.id,
        amount: 888,
        currency: "ARS",
        transactionDate: lastTuesday,
        state: "pendiente",
      });
      await seedIncome(app, {
        memberId: null,
        cobroBranchId: arA.id,
        amount: 777,
        currency: "ARS",
        transactionDate: lastTuesday,
        state: "firme",
        kind: "cash_transfer",
      });
      await seedIncome(app, {
        memberId: mA,
        cobroBranchId: arA.id,
        amount: 5000,
        currency: "ARS",
        transactionDate: addDays(weeks.lastMinus1, 1),
        state: "firme",
      });
    }

    it("agrupa por la sede del alumno y por moneda; el ingreso sin alumno cae en la sede del cobro", async () => {
      await seedCobros();
      const { arA, arB, es } = branches;

      const byMember = await transactions.getIncomeByMemberBranch(
        TEMPLO_CTX,
        lastRange,
      );

      expect(mustCurrency(must(byMember, arA.id, "cobrado"), "ARS")).toBe(1000);
      // 500 del alumno de arB + 200 sin alumno cobrado en arB.
      expect(mustCurrency(must(byMember, arB.id, "cobrado"), "ARS")).toBe(700);
      expect(mustCurrency(must(byMember, es.id, "cobrado"), "EUR")).toBe(80);
      // Una sede no mezcla monedas.
      expect(must(byMember, arA.id, "cobrado").has("EUR")).toBe(false);
      expect(must(byMember, es.id, "cobrado").has("ARS")).toBe(false);
    });

    it("D-14: Caja por sede difiere (sede del cobro) pero la suma de las sedes coincide", async () => {
      await seedCobros();
      const { arA, arB, es } = branches;

      const byMember = await transactions.getIncomeByMemberBranch(
        TEMPLO_CTX,
        lastRange,
      );
      const caja = await transactions.getIncomeByBranch(TEMPLO_CTX, lastRange);
      const cajaTotal = (branchId: number, currency: string): number =>
        caja
          .filter((r) => r.branchId === branchId && r.currency === currency)
          .reduce((acc, r) => acc + r.total, 0);

      // La sede NO cierra: Caja pone todo en arB (donde se cobro), arA queda sin ingresos firmes.
      expect(cajaTotal(arA.id, "ARS")).toBe(0);
      expect(cajaTotal(arB.id, "ARS")).toBe(1700);
      expect(cajaTotal(es.id, "EUR")).toBe(80);

      // El total SI cierra: arA + arB es igual en los dos metodos.
      const tableroArs =
        (byMember.get(arA.id)?.get("ARS") ?? 0) +
        (byMember.get(arB.id)?.get("ARS") ?? 0);
      expect(tableroArs).toBe(
        cajaTotal(arA.id, "ARS") + cajaTotal(arB.id, "ARS"),
      );
      expect(tableroArs).toBe(1700);

      // Y mas fuerte: sobre TODAS las sedes y monedas el universo es identico.
      const sumMap = (currency: string): number =>
        Array.from(byMember.values()).reduce(
          (acc, byCurrency) => acc + (byCurrency.get(currency) ?? 0),
          0,
        );
      const sumCaja = (currency: string): number =>
        caja
          .filter((r) => r.currency === currency)
          .reduce((acc, r) => acc + r.total, 0);
      expect(sumMap("ARS")).toBe(sumCaja("ARS"));
      expect(sumMap("EUR")).toBe(sumCaja("EUR"));
    });

    it("el cobro de la semana anterior queda afuera del rango y las sedes sin cobros no aparecen", async () => {
      await seedCobros();
      const { virtualAr, inactiveAr } = branches;

      // Rango de la semana en curso: no hay cobros sembrados.
      const current = await transactions.getIncomeByMemberBranch(
        TEMPLO_CTX,
        weekRange(weeks.current),
      );
      expect(current.has(branches.arA.id)).toBe(false);
      expect(current.has(branches.arB.id)).toBe(false);

      const last = await transactions.getIncomeByMemberBranch(
        TEMPLO_CTX,
        lastRange,
      );
      expect(last.has(virtualAr.id)).toBe(false);
      expect(last.has(inactiveAr.id)).toBe(false);
    });

    it("FA-01: la consulta con LEFT JOIN a users corre sin ambiguedad de branch_id (con datos y sin datos)", async () => {
      await expect(
        transactions.getIncomeByMemberBranch(TEMPLO_CTX, lastRange),
      ).resolves.toBeInstanceOf(Map);
      await seedCobros();
      await expect(
        transactions.getIncomeByMemberBranch(TEMPLO_CTX, lastRange),
      ).resolves.toBeInstanceOf(Map);
    });
  });

  // ─── Deuda ────────────────────────────────────────────────────────────────

  describe("Deuda por sede del alumno (vs Deudas › Por deuda)", () => {
    /**
     * arA (alumno y membresia de arA): activa de hoy 300, activa de hace 12
     * dias 400, incobrable 500, cobrada con saldo 200 (no cuenta).
     * arB: alumno con una deuda suelta (debt_balance) de 50.
     * es: alumno con una deuda de membresia de 90 EUR.
     */
    async function seedDeudas(): Promise<void> {
      const { arA, arB, es } = branches;
      const mA = await seedBoardMember(app, { branchId: arA.id });
      const mB = await seedBoardMember(app, { branchId: arB.id });
      const mEs = await seedBoardMember(app, { branchId: es.id });
      const base = { memberId: mA, kind: "subscription" as const };

      await seedDebt(app, {
        ...base,
        memberBranchId: arA.id,
        amount: 300,
        currency: "ARS",
        daysAgo: 0,
      });
      await seedDebt(app, {
        ...base,
        memberBranchId: arA.id,
        amount: 400,
        currency: "ARS",
        daysAgo: 12,
      });
      await seedDebt(app, {
        ...base,
        memberBranchId: arA.id,
        amount: 500,
        currency: "ARS",
        daysAgo: 3,
        status: "incobrable",
      });
      await seedDebt(app, {
        ...base,
        memberBranchId: arA.id,
        amount: 200,
        currency: "ARS",
        daysAgo: 3,
        status: "cobrada",
      });
      await seedDebt(app, {
        memberId: mB,
        kind: "debt_balance",
        amount: 50,
        currency: "ARS",
        daysAgo: 0,
      });
      await seedDebt(app, {
        memberId: mEs,
        kind: "subscription",
        memberBranchId: es.id,
        amount: 90,
        currency: "EUR",
        daysAgo: 0,
      });
    }

    it("D-20: cobrable, mas de 10 dias e incobrable de una sede coinciden con Deudas filtrada por esa sede", async () => {
      await seedDeudas();
      const { arA } = branches;

      const byBranch = await reports.getDebtTotalsByMemberBranch(TEMPLO_CTX);
      const totals = mustCurrency(must(byBranch, arA.id, "deuda"), "ARS");
      expect(totals).toEqual({ cobrable: 700, mas10: 400, incobrable: 500 });

      // Deudas > Por deuda, filtrada por la sede (owner: por moneda).
      const deudas = await reports.getOutstandingBalances(
        TEMPLO_CTX,
        { branchId: arA.id, status: "activa" },
        { isOwner: true },
      );
      expect(deudas.statusTotals.cobrable.ARS).toBe(totals.cobrable);
      expect(deudas.statusTotals.incobrable.ARS).toBe(totals.incobrable);
      const buckets = bucketsFor(deudas, "ARS");
      expect(buckets["11-15"] + buckets["15+"]).toBe(totals.mas10);
      // La deuda de hoy y la de 12 dias caen en tramos distintos.
      expect(buckets["0-5"]).toBe(300);
      expect(buckets["11-15"]).toBe(400);
    });

    it("la deuda cobrada con saldo no cuenta en ningun total", async () => {
      await seedDeudas();
      const byBranch = await reports.getDebtTotalsByMemberBranch(TEMPLO_CTX);
      const totals = mustCurrency(
        must(byBranch, branches.arA.id, "deuda"),
        "ARS",
      );
      // 700 + 500 = 1200; los 200 de la cobrada no estan en ninguno.
      expect(totals.cobrable + totals.incobrable).toBe(1200);
    });

    it("la deuda suelta (debt_balance) cuenta en la sede del alumno aunque Deudas no la ubique en ninguna sede", async () => {
      await seedDeudas();
      const { arB } = branches;

      const byBranch = await reports.getDebtTotalsByMemberBranch(TEMPLO_CTX);
      const totals = mustCurrency(must(byBranch, arB.id, "deuda"), "ARS");
      expect(totals).toEqual({ cobrable: 50, mas10: 0, incobrable: 0 });

      // Deudas no tiene sede para las sueltas: filtrando por arB no aparece.
      // El Tablero la pone en la sede del alumno (punto 5 de Nacho).
      const deudasArB = await reports.getOutstandingBalances(
        TEMPLO_CTX,
        { branchId: arB.id },
        { isOwner: true },
      );
      expect(deudasArB.statusTotals.cobrable.ARS).toBeUndefined();
      expect(deudasArB.total).toBe(0);
    });

    it("D-12: la deuda va a la sede del alumno aunque la membresia sea de otra sede", async () => {
      const { arA, arB } = branches;
      const mA = await seedBoardMember(app, { branchId: arA.id });
      await seedDebt(app, {
        memberId: mA,
        kind: "subscription",
        subBranchId: arB.id,
        amount: 250,
        currency: "ARS",
        daysAgo: 0,
      });

      const byBranch = await reports.getDebtTotalsByMemberBranch(TEMPLO_CTX);
      expect(
        mustCurrency(must(byBranch, arA.id, "deuda"), "ARS").cobrable,
      ).toBe(250);
      expect(byBranch.has(arB.id)).toBe(false);

      // Deudas agrupa por la sede de la membresia: ahi esta en arB.
      const deudasArB = await reports.getOutstandingBalances(
        TEMPLO_CTX,
        { branchId: arB.id },
        { isOwner: true },
      );
      expect(deudasArB.statusTotals.cobrable.ARS).toBe(250);
    });

    it("D-23: sumando todas las sedes, la deuda cobrable e incobrable coincide con Deudas sin filtros, por moneda", async () => {
      await seedDeudas();

      const byBranch = await reports.getDebtTotalsByMemberBranch(TEMPLO_CTX);
      const sum = (
        currency: string,
        field: "cobrable" | "incobrable",
      ): number =>
        Array.from(byBranch.values()).reduce(
          (acc, byCurrency) => acc + (byCurrency.get(currency)?.[field] ?? 0),
          0,
        );

      const deudas = await reports.getOutstandingBalances(
        TEMPLO_CTX,
        {},
        { isOwner: true },
      );
      expect(sum("ARS", "cobrable")).toBe(deudas.statusTotals.cobrable.ARS);
      expect(sum("ARS", "incobrable")).toBe(deudas.statusTotals.incobrable.ARS);
      expect(sum("EUR", "cobrable")).toBe(deudas.statusTotals.cobrable.EUR);
      // Las monedas no se mezclan: la sede de EUR no tiene pesos.
      expect(must(byBranch, branches.es.id, "deuda").has("ARS")).toBe(false);
      expect(
        mustCurrency(must(byBranch, branches.es.id, "deuda"), "EUR").cobrable,
      ).toBe(90);
    });
  });

  // ─── Alumnos activos ──────────────────────────────────────────────────────

  describe("Alumnos activos por sede del alumno (vs Analiticas)", () => {
    it("D-21: cuenta solo el plan pago vigente y coincide con el KPI de Analiticas sede por sede", async () => {
      const { arA, arB } = branches;
      // arA: uno con plan pago (cuenta), uno con solo pase especial, uno bonificado.
      await seedActiveMember(app, { branchId: arA.id, kind: "pago" });
      await seedActiveMember(app, { branchId: arA.id, kind: "especial" });
      await seedActiveMember(app, { branchId: arA.id, kind: "bonificada" });
      // arB: dos con plan pago.
      await seedActiveMember(app, { branchId: arB.id, kind: "pago" });
      await seedActiveMember(app, { branchId: arB.id, kind: "pago" });

      const byBranch =
        await analytics.countActivePayingMembersByBranch(TEMPLO_CTX);
      expect(byBranch.get(arA.id)).toBe(1);
      expect(byBranch.get(arB.id)).toBe(2);

      for (const branch of [arA, arB]) {
        const kpis = await analytics.getKpis(TEMPLO_CTX, {
          branchId: branch.id,
        });
        expect(kpis.activeMembers.value).toBe(byBranch.get(branch.id));
      }
    });

    it("una sede sin activos no aparece en el mapa; los socios sin plan no cuentan", async () => {
      const { arA, es } = branches;
      await seedBoardMember(app, { branchId: arA.id });
      await seedActiveMember(app, { branchId: arA.id, kind: "pago" });

      const byBranch =
        await analytics.countActivePayingMembersByBranch(TEMPLO_CTX);
      expect(byBranch.get(arA.id)).toBe(1);
      expect(byBranch.has(es.id)).toBe(false);
    });
  });

  // ─── Aislamiento entre gimnasios ──────────────────────────────────────────

  describe("Aislamiento entre gimnasios", () => {
    it("ninguna sede del gimnasio 2 aparece en los mapas de El Templo (y al reves)", async () => {
      const { arA } = branches;

      // El Templo: un cobro, una deuda y un activo en arA.
      const mA = await seedBoardMember(app, { branchId: arA.id });
      await seedIncome(app, {
        memberId: mA,
        cobroBranchId: arA.id,
        amount: 100,
        currency: "ARS",
        transactionDate: lastTuesday,
        state: "firme",
      });
      await seedDebt(app, {
        memberId: mA,
        kind: "subscription",
        memberBranchId: arA.id,
        amount: 60,
        currency: "ARS",
        daysAgo: 0,
      });
      await seedActiveMember(app, { branchId: arA.id, kind: "pago" });

      // Gimnasio 2: lo mismo, en su propia sede.
      const gym2 = await seedSecondTenant(app);
      await seedIncome(app, {
        tenantId: TENANT_DOS,
        recordedBy: gym2.adminId,
        memberId: gym2.socios[0].id,
        cobroBranchId: gym2.branchId,
        amount: 300,
        currency: "ARS",
        transactionDate: lastTuesday,
        state: "firme",
      });
      await seedDebt(app, {
        tenantId: TENANT_DOS,
        memberId: gym2.socios[1].id,
        kind: "subscription",
        memberBranchId: gym2.branchId,
        amount: 70,
        currency: "ARS",
        daysAgo: 0,
      });
      await seedActiveMember(app, {
        tenantId: TENANT_DOS,
        branchId: gym2.branchId,
        kind: "pago",
      });

      // Mapas de El Templo: nada del gimnasio 2.
      const income = await transactions.getIncomeByMemberBranch(
        TEMPLO_CTX,
        lastRange,
      );
      const debt = await reports.getDebtTotalsByMemberBranch(TEMPLO_CTX);
      const active =
        await analytics.countActivePayingMembersByBranch(TEMPLO_CTX);
      expect(income.has(gym2.branchId)).toBe(false);
      expect(debt.has(gym2.branchId)).toBe(false);
      expect(active.has(gym2.branchId)).toBe(false);
      // Control positivo: lo propio sigue estando.
      expect(mustCurrency(must(income, arA.id, "cobrado"), "ARS")).toBe(100);
      expect(mustCurrency(must(debt, arA.id, "deuda"), "ARS").cobrable).toBe(
        60,
      );
      expect(active.get(arA.id)).toBe(1);

      // Mapas del gimnasio 2: ve lo suyo y nada de El Templo.
      const income2 = await transactions.getIncomeByMemberBranch(
        DOS_CTX,
        lastRange,
      );
      const debt2 = await reports.getDebtTotalsByMemberBranch(DOS_CTX);
      const active2 = await analytics.countActivePayingMembersByBranch(DOS_CTX);
      expect(mustCurrency(must(income2, gym2.branchId, "cobrado"), "ARS")).toBe(
        300,
      );
      expect(
        mustCurrency(must(debt2, gym2.branchId, "deuda"), "ARS").cobrable,
      ).toBe(70);
      expect(active2.get(gym2.branchId)).toBe(1);
      expect(income2.has(arA.id)).toBe(false);
      expect(debt2.has(arA.id)).toBe(false);
      expect(active2.has(arA.id)).toBe(false);
    });
  });
});
