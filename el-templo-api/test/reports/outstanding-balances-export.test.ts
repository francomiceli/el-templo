/**
 * Phase 109-04 — integration tests for
 * GET /api/admin/reports/outstanding-balances/export.
 *
 * Coverage:
 *   - X1: returns .xlsx with correct Content-Type + Content-Disposition
 *         (filename `deudas-YYYY-MM-DD.xlsx`), 9 column headers per D-16,
 *         one row per concepto pendiente.
 *   - X2: RBAC — coach is rejected at module guard (CAJA_ROLES excludes coach).
 *   - X3: Filters honored — branchId narrows the row set (and excludes
 *         debt_balance rows because they have no branch).
 *   - X4: Country scope — non-owner cannot export rows from another country.
 *
 * Mirrors the test idiom of test/finance/export-transactions.test.ts and
 * test/reports/outstanding-balances.test.ts (Plan 109-02). Runs against
 * the per-worker test MySQL database (eltemplo_test_<POOL_ID>).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { Workbook } from "exceljs";
import type { FastifyInstance } from "fastify";
import {
  createTestApp,
  cleanAllTestData,
  createStaffUser,
  getAuthToken,
  registerUser,
} from "../helpers";
import * as schema from "../../src/db/schema";

const REPORTS_URL = "/api/admin/reports";

interface SeededContext {
  arBranchId: number;
  arBranchBId: number;
  esBranchId: number;
  ownerToken: string;
  adminArId: number;
  adminArToken: string;
  coachToken: string;
  planArId: number;
  planEsId: number;
}

function nextSuffix(prefix: string): string {
  const t = Date.now().toString(36).slice(-5);
  const r = Math.floor(Math.random() * 1000)
    .toString(36)
    .padStart(2, "0");
  return `${prefix}${t}${r}`;
}

function dateOffset(days: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

async function seedFixtures(app: FastifyInstance): Promise<SeededContext> {
  const [ar] = await app.db
    .insert(schema.branches)
    .values({
      name: "AR-DEX-MDP",
      code: nextSuffix("DX"),
      country: "AR",
      isVirtual: false,
      isActive: true,
    })
    .$returningId();
  const [arB] = await app.db
    .insert(schema.branches)
    .values({
      name: "AR-DEX-CABA",
      code: nextSuffix("DX"),
      country: "AR",
      isVirtual: false,
      isActive: true,
    })
    .$returningId();
  const [es] = await app.db
    .insert(schema.branches)
    .values({
      name: "ES-DEX-BCN",
      code: nextSuffix("DX"),
      country: "ES",
      isVirtual: false,
      isActive: true,
    })
    .$returningId();

  return {
    arBranchId: ar.id,
    arBranchBId: arB.id,
    esBranchId: es.id,
    ownerToken: "",
    adminArId: 0,
    adminArToken: "",
    coachToken: "",
    planArId: 0,
    planEsId: 0,
  };
}

async function seedRolesAndPlans(
  app: FastifyInstance,
  ctx: SeededContext,
): Promise<void> {
  ctx.ownerToken = await getAuthToken(app, "admin@test.com", "adminpass123");
  // Owner row exists by seed.
  await app.db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, "admin@test.com"))
    .limit(1);

  ctx.adminArId = await createStaffUser(app, {
    email: "admin-dex@test.local",
    password: "pass123456",
    firstName: "Admin",
    lastName: "DEX",
    role: "admin",
    branchId: ctx.arBranchId,
  });
  ctx.adminArToken = await getAuthToken(
    app,
    "admin-dex@test.local",
    "pass123456",
  );

  await createStaffUser(app, {
    email: "coach-dex@test.local",
    password: "pass123456",
    firstName: "Coach",
    lastName: "DEX",
    role: "coach",
    branchId: ctx.arBranchId,
  });
  ctx.coachToken = await getAuthToken(
    app,
    "coach-dex@test.local",
    "pass123456",
  );

  const [planAr] = await app.db
    .insert(schema.subscriptionPlans)
    .values({
      name: "Plan AR Mensual DEX",
      planTier: "flex",
      bookingMode: "flexible",
      planCategory: "presencial",
      priceRegular: 50000,
      priceZero: 0,
      durationDays: 30,
      classesPerWeek: 3,
      currency: "ARS",
    })
    .$returningId();
  ctx.planArId = planAr.id;

  const [planEs] = await app.db
    .insert(schema.subscriptionPlans)
    .values({
      name: "Plan ES Mensual DEX",
      planTier: "flex",
      bookingMode: "flexible",
      planCategory: "presencial",
      priceRegular: 30000,
      priceZero: 0,
      durationDays: 30,
      classesPerWeek: 3,
      currency: "EUR",
    })
    .$returningId();
  ctx.planEsId = planEs.id;
}

interface SeedSubscriptionWithBalanceOpts {
  app: FastifyInstance;
  branchId: number;
  planId: number;
  planCurrency: "ARS" | "EUR";
  startDateOffsetDays: number;
  amount: number;
  memberFirstName?: string;
  memberLastName?: string;
}

async function seedSubscriptionWithBalance(
  opts: SeedSubscriptionWithBalanceOpts,
): Promise<{ memberId: number; subscriptionId: number }> {
  const memberRes = await registerUser(opts.app, {
    email: `member-dex-${nextSuffix("M")}@test.local`,
    password: "pass123456",
    firstName: opts.memberFirstName ?? "Test",
    lastName: opts.memberLastName ?? "Member",
    branchId: opts.branchId,
  });
  const memberId = (memberRes.user as { id: number }).id;

  const startDate = dateOffset(opts.startDateOffsetDays);
  const [sub] = await opts.app.db
    .insert(schema.subscriptions)
    .values({
      userId: memberId,
      planId: opts.planId,
      branchId: opts.branchId,
      status: "active",
      startDate,
      pricePaid: opts.amount,
      currency: opts.planCurrency,
      priceTypeApplied: "regular",
    })
    .$returningId();
  const subscriptionId = sub.id;

  await opts.app.db.insert(schema.balances).values({
    memberId,
    targetKind: "subscription",
    targetId: subscriptionId,
    currency: opts.planCurrency,
    amount: opts.amount,
  });

  return { memberId, subscriptionId };
}

async function clearLedger(app: FastifyInstance): Promise<void> {
  const conn = await app.dbPool.getConnection();
  try {
    await conn.query("SET FOREIGN_KEY_CHECKS=0");
    await conn.query("DELETE FROM `transaction_links`");
    await conn.query("DELETE FROM `financial_transactions`");
    await conn.query("DELETE FROM `balances`");
    await conn.query("SET FOREIGN_KEY_CHECKS=1");
  } finally {
    conn.release();
  }
}

describe("Reports API — GET /outstanding-balances/export (Phase 109-04)", () => {
  let app: FastifyInstance;
  const ctx = {} as SeededContext;

  beforeAll(async () => {
    app = await createTestApp();
    const seeded = await seedFixtures(app);
    Object.assign(ctx, seeded);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    await clearLedger(app);
    const seeded = await seedFixtures(app);
    Object.assign(ctx, seeded);
    await seedRolesAndPlans(app, ctx);
  });

  it("X1: returns .xlsx with 9 column headers (D-16) and one row per concepto", async () => {
    // Seed 2 outstanding balances on AR.
    await seedSubscriptionWithBalance({
      app,
      branchId: ctx.arBranchId,
      planId: ctx.planArId,
      planCurrency: "ARS",
      startDateOffsetDays: -45,
      amount: 12000,
      memberFirstName: "Juan",
      memberLastName: "Pérez",
    });
    await seedSubscriptionWithBalance({
      app,
      branchId: ctx.arBranchId,
      planId: ctx.planArId,
      planCurrency: "ARS",
      startDateOffsetDays: -10,
      amount: 8000,
      memberFirstName: "María",
      memberLastName: "García",
    });

    const res = await app.inject({
      method: "GET",
      url: `${REPORTS_URL}/outstanding-balances/export`,
      headers: { authorization: `Bearer ${ctx.adminArToken}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(res.headers["content-disposition"]).toMatch(
      /attachment; filename="deudas-\d{4}-\d{2}-\d{2}\.xlsx"/,
    );

    const wb = new Workbook();
    await wb.xlsx.load(res.rawPayload);
    const sheet = wb.getWorksheet("Deudas");
    expect(sheet).toBeDefined();
    if (!sheet) return;

    // Header row + 2 data rows = 3.
    expect(sheet.rowCount).toBe(3);

    // 10 columns — order is load-bearing.
    const header = sheet.getRow(1);
    expect(header.getCell(1).value).toBe("Miembro");
    expect(header.getCell(2).value).toBe("Teléfono");
    expect(header.getCell(3).value).toBe("Plan/Concepto");
    expect(header.getCell(4).value).toBe("Sucursal");
    expect(header.getCell(5).value).toBe("Monto");
    expect(header.getCell(6).value).toBe("Moneda");
    expect(header.getCell(7).value).toBe("Antigüedad (días)");
    expect(header.getCell(8).value).toBe("Bucket");
    expect(header.getCell(9).value).toBe("Fecha devengo");
    expect(header.getCell(10).value).toBe("Tipo");

    // Sort: ageInDays DESC. Oldest balance (45d, Juan) is first data row.
    const firstRow = sheet.getRow(2);
    expect(firstRow.getCell(1).value).toBe("Juan Pérez");
    expect(firstRow.getCell(6).value).toBe("ARS");
    expect(firstRow.getCell(7).value).toBe(45);
    // 45d → bucket "15+ días"
    expect(firstRow.getCell(8).value).toBe("15+ días");
    expect(firstRow.getCell(10).value).toBe("Plan");
  });

  it("X2: coach gets 403 (CAJA_ROLES excludes coach)", async () => {
    const res = await app.inject({
      method: "GET",
      url: `${REPORTS_URL}/outstanding-balances/export`,
      headers: { authorization: `Bearer ${ctx.coachToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it("X3: branchId filter narrows the row set", async () => {
    await seedSubscriptionWithBalance({
      app,
      branchId: ctx.arBranchId,
      planId: ctx.planArId,
      planCurrency: "ARS",
      startDateOffsetDays: -20,
      amount: 5000,
    });
    await seedSubscriptionWithBalance({
      app,
      branchId: ctx.arBranchBId,
      planId: ctx.planArId,
      planCurrency: "ARS",
      startDateOffsetDays: -20,
      amount: 7000,
    });

    const res = await app.inject({
      method: "GET",
      url: `${REPORTS_URL}/outstanding-balances/export?branchId=${ctx.arBranchId}`,
      headers: { authorization: `Bearer ${ctx.adminArToken}` },
    });
    expect(res.statusCode).toBe(200);

    const wb = new Workbook();
    await wb.xlsx.load(res.rawPayload);
    const sheet = wb.getWorksheet("Deudas");
    expect(sheet?.rowCount).toBe(2); // 1 header + 1 row from arBranchId only.
  });

  it("X4: non-owner admin (AR) cannot export rows from another country (ES)", async () => {
    // Seed an ES outstanding balance — owner can see it, non-owner AR cannot.
    await seedSubscriptionWithBalance({
      app,
      branchId: ctx.esBranchId,
      planId: ctx.planEsId,
      planCurrency: "EUR",
      startDateOffsetDays: -30,
      amount: 5000,
    });

    const res = await app.inject({
      method: "GET",
      url: `${REPORTS_URL}/outstanding-balances/export`,
      headers: { authorization: `Bearer ${ctx.adminArToken}` },
    });
    expect(res.statusCode).toBe(200);

    const wb = new Workbook();
    await wb.xlsx.load(res.rawPayload);
    const sheet = wb.getWorksheet("Deudas");
    // Only header row — country scope locks AR admin out of ES rows.
    expect(sheet?.rowCount).toBe(1);

    // Sanity: owner (no country filter) sees the row.
    const ownerRes = await app.inject({
      method: "GET",
      url: `${REPORTS_URL}/outstanding-balances/export`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    expect(ownerRes.statusCode).toBe(200);
    const wb2 = new Workbook();
    await wb2.xlsx.load(ownerRes.rawPayload);
    const sheet2 = wb2.getWorksheet("Deudas");
    expect(sheet2?.rowCount).toBe(2); // header + 1 ES row
  });
});
