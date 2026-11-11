/**
 * Fase 207-07 — lectores del ledger fuera de Caja con centavos exactos.
 *
 * Cubre, con deudas de 1000.50 y 2000.25 (y con enteros, DI-09):
 *   - Deudas (GET /api/admin/reports/outstanding-balances): filas sin truncar,
 *     bucketTotals (owner por moneda y no-owner plano) y statusTotals
 *     (cobrable / incobrable) suman exacto.
 *   - Alumnos (GET /api/admin/members): totalDebtByCurrency.
 *   - Tablero: getDebtTotalsByMemberBranch (cobrable / mas10 / incobrable).
 *
 * Antes de la fase los totales usaban CAST(SUM(...) AS SIGNED) y los schemas de
 * respuesta eran integer: 1000.50 + 2000.25 se mostraba como 3000 (o 3001).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import {
  createTestApp,
  cleanAllTestData,
  createStaffUser,
  getAuthToken,
} from "../helpers";
import { ReportsService } from "../../src/modules/reports/service";
import type { TenantContext } from "../../src/modules/shared/tenant";
import {
  TENANT_TEMPLO,
  TENANT_DOS,
  limpiarSegundoGimnasio,
} from "../fixtures/second-tenant";
import {
  seedBoardBranches,
  cleanupBoardBranches,
  seedBoardMember,
  seedDebt,
  clearDebtManagement,
  type BoardBranches,
} from "../fixtures/weekly-board";

const TEMPLO_CTX: TenantContext = { tenantId: TENANT_TEMPLO };

interface OutstandingBody {
  rows: Array<{ amount: number; currency: string; bucket: string }>;
  bucketTotals: Record<string, number | Record<string, number>>;
  statusTotals: {
    cobrable: Record<string, number>;
    incobrable: Record<string, number>;
  };
}

describe("Fase 207-07 — lectores del ledger con centavos (Deudas, Alumnos, Tablero)", () => {
  let app: FastifyInstance;
  let reports: ReportsService;
  let branches: BoardBranches;
  let ownerToken: string;
  let adminArToken: string;

  async function cleanAll(): Promise<void> {
    // `debt_management` no esta en `cleanAllTestData`: va antes que `balances`.
    await clearDebtManagement(app, [TENANT_TEMPLO, TENANT_DOS]);
    await cleanAllTestData(app);
  }

  async function getOutstanding(token: string): Promise<OutstandingBody> {
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/reports/outstanding-balances",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    return res.json<OutstandingBody>();
  }

  async function getMembersDebt(
    token: string,
  ): Promise<Array<{ currency: string; amount: number }>> {
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/members",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    return res.json<{
      totalDebtByCurrency: Array<{ currency: string; amount: number }>;
    }>().totalDebtByCurrency;
  }

  /** Dos deudas de membresia (hoy) de alumnos de arA, mas una incobrable opcional. */
  async function seedDosDeudas(
    first: number,
    second: number,
    incobrable?: number,
  ): Promise<void> {
    const { arA } = branches;
    const m1 = await seedBoardMember(app, { branchId: arA.id });
    const m2 = await seedBoardMember(app, { branchId: arA.id });
    await seedDebt(app, {
      memberId: m1,
      kind: "subscription",
      memberBranchId: arA.id,
      amount: first,
      currency: "ARS",
      daysAgo: 0,
    });
    await seedDebt(app, {
      memberId: m2,
      kind: "subscription",
      memberBranchId: arA.id,
      amount: second,
      currency: "ARS",
      daysAgo: 0,
    });
    if (incobrable !== undefined) {
      const m3 = await seedBoardMember(app, { branchId: arA.id });
      await seedDebt(app, {
        memberId: m3,
        kind: "subscription",
        memberBranchId: arA.id,
        amount: incobrable,
        currency: "ARS",
        daysAgo: 0,
        status: "incobrable",
      });
    }
  }

  beforeAll(async () => {
    app = await createTestApp();
    reports = new ReportsService(app.db, app.log);
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
    // `cleanAllTestData` repone el owner admin@test.com.
    ownerToken = await getAuthToken(app, "admin@test.com", "adminpass123");
    await createStaffUser(app, {
      email: "admin-centavos-207@test.local",
      password: "pass123456",
      firstName: "Admin",
      lastName: "Centavos",
      role: "admin",
      branchId: branches.arA.id,
    });
    adminArToken = await getAuthToken(
      app,
      "admin-centavos-207@test.local",
      "pass123456",
    );
  });

  // ─── Deudas ───────────────────────────────────────────────────────────────

  it("Deudas: las filas devuelven los centavos sin truncar", async () => {
    await seedDosDeudas(1000.5, 2000.25);
    const body = await getOutstanding(ownerToken);
    const amounts = body.rows.map((r) => r.amount).sort((a, b) => a - b);
    expect(amounts).toEqual([1000.5, 2000.25]);
  });

  it("Deudas owner: bucketTotals por moneda y statusTotals.cobrable suman 3000.75", async () => {
    await seedDosDeudas(1000.5, 2000.25);
    const body = await getOutstanding(ownerToken);
    const byCurrency = body.bucketTotals.ARS as Record<string, number>;
    expect(byCurrency["0-5"]).toBe(3000.75);
    expect(body.statusTotals.cobrable.ARS).toBe(3000.75);
    expect(body.statusTotals.incobrable.ARS).toBeUndefined();
  });

  it("Deudas no-owner: bucketTotals plano suma 3000.75", async () => {
    await seedDosDeudas(1000.5, 2000.25);
    const body = await getOutstanding(adminArToken);
    expect(body.bucketTotals["0-5"]).toBe(3000.75);
    expect(body.statusTotals.cobrable.ARS).toBe(3000.75);
  });

  it("Deudas: una deuda incobrable separa cobrable (1000.5) de incobrable (2000.25)", async () => {
    await seedDosDeudas(1000.5, 0.01, 2000.25);
    const body = await getOutstanding(ownerToken);
    expect(body.statusTotals.cobrable.ARS).toBe(1000.51);
    expect(body.statusTotals.incobrable.ARS).toBe(2000.25);
  });

  it("Deudas: sumar 0.1 + 0.2 da 0.3 exacto (sin error de coma flotante)", async () => {
    await seedDosDeudas(0.1, 0.2);
    const body = await getOutstanding(ownerToken);
    const byCurrency = body.bucketTotals.ARS as Record<string, number>;
    expect(byCurrency["0-5"]).toBe(0.3);
    expect(body.statusTotals.cobrable.ARS).toBe(0.3);
  });

  it("Deudas con enteros: 300 + 400 = 700 igual que antes (DI-09)", async () => {
    await seedDosDeudas(300, 400, 500);
    const body = await getOutstanding(ownerToken);
    const byCurrency = body.bucketTotals.ARS as Record<string, number>;
    expect(byCurrency["0-5"]).toBe(700);
    expect(body.statusTotals.cobrable.ARS).toBe(700);
    expect(body.statusTotals.incobrable.ARS).toBe(500);
    expect(body.rows.map((r) => r.amount).sort((a, b) => a - b)).toEqual([
      300, 400,
    ]);
  });

  // ─── Alumnos ──────────────────────────────────────────────────────────────

  it("Alumnos: totalDebtByCurrency ARS = 3000.75", async () => {
    await seedDosDeudas(1000.5, 2000.25);
    const debt = await getMembersDebt(ownerToken);
    expect(debt).toEqual([{ currency: "ARS", amount: 3000.75 }]);
  });

  it("Alumnos con enteros: totalDebtByCurrency ARS = 700", async () => {
    await seedDosDeudas(300, 400);
    const debt = await getMembersDebt(ownerToken);
    expect(debt).toEqual([{ currency: "ARS", amount: 700 }]);
  });

  // ─── Tablero ──────────────────────────────────────────────────────────────

  it("Tablero: la deuda cobrable de la sede del alumno suma 3000.75 exacto y coincide con Deudas", async () => {
    await seedDosDeudas(1000.5, 2000.25, 99.99);
    const byBranch = await reports.getDebtTotalsByMemberBranch(TEMPLO_CTX);
    const totals = byBranch.get(branches.arA.id)?.get("ARS");
    expect(totals).toEqual({ cobrable: 3000.75, mas10: 0, incobrable: 99.99 });

    const deudas = await getOutstanding(ownerToken);
    expect(deudas.statusTotals.cobrable.ARS).toBe(totals?.cobrable);
    expect(deudas.statusTotals.incobrable.ARS).toBe(totals?.incobrable);
  });

  it("Tablero: mas de 10 dias acumula centavos sin error (0.1 + 0.2 = 0.3)", async () => {
    const { arA } = branches;
    const m1 = await seedBoardMember(app, { branchId: arA.id });
    const m2 = await seedBoardMember(app, { branchId: arA.id });
    for (const [memberId, amount] of [
      [m1, 0.1],
      [m2, 0.2],
    ] as const) {
      await seedDebt(app, {
        memberId,
        kind: "subscription",
        memberBranchId: arA.id,
        amount,
        currency: "ARS",
        daysAgo: 12,
      });
    }
    const byBranch = await reports.getDebtTotalsByMemberBranch(TEMPLO_CTX);
    expect(byBranch.get(arA.id)?.get("ARS")).toEqual({
      cobrable: 0.3,
      mas10: 0.3,
      incobrable: 0,
    });
  });

  it("Tablero con enteros: 300 + 400 cobrable y 500 incobrable igual que antes (DI-09)", async () => {
    await seedDosDeudas(300, 400, 500);
    const byBranch = await reports.getDebtTotalsByMemberBranch(TEMPLO_CTX);
    expect(byBranch.get(branches.arA.id)?.get("ARS")).toEqual({
      cobrable: 700,
      mas10: 0,
      incobrable: 500,
    });
  });
});
