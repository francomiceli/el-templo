/**
 * Phase 109 Plan 03 — integration tests for GET /transactions/export.
 *
 * Coverage:
 *   - E1: returns Excel binary with correct Content-Type + Content-Disposition.
 *   - E2: RBAC — coach is rejected at module guard (T-106-01).
 *   - E3: kind filter narrows the row set (one row per transaction, not per link).
 *   - E4: country scope — non-owner cannot export rows from another country.
 *   - E5: Conceptos column populated from linkSummary stub
 *         (`<TARGET_KIND_LABEL_ES> #<targetId>`, comma-separated).
 *
 * The .xlsx parsing in tests is deliberately minimal — we re-load the
 * buffer with exceljs.Workbook to assert column headers and row contents
 * survive the round-trip. This is the same idiom the reports module uses
 * for its export tests (test/reports/reports.test.ts).
 *
 * Runs against the per-worker test MySQL database (eltemplo_test_<POOL_ID>).
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

const FINANCE_URL = "/api/admin/finance";
const TODAY = "2026-04-28";

function nextSuffix(prefix: string): string {
  const t = Date.now().toString(36).slice(-5);
  const r = Math.floor(Math.random() * 1000)
    .toString(36)
    .padStart(2, "0");
  return `${prefix}${t}${r}`;
}

interface SeededContext {
  arBranchId: number;
  esBranchId: number;
  ownerToken: string;
  ownerId: number;
  adminArId: number;
  adminArToken: string;
  coachToken: string;
  memberArId: number;
  memberEsId: number;
  planId: number;
  subArId: number;
  subEsId: number;
}

async function seedFixtures(app: FastifyInstance): Promise<SeededContext> {
  const [ar] = await app.db
    .insert(schema.branches)
    .values({
      name: "AR-Export-Test",
      code: nextSuffix("AX"),
      country: "AR",
      isVirtual: false,
      isActive: true,
    })
    .$returningId();

  const [es] = await app.db
    .insert(schema.branches)
    .values({
      name: "ES-Export-Test",
      code: nextSuffix("EX"),
      country: "ES",
      isVirtual: false,
      isActive: true,
    })
    .$returningId();

  return {
    arBranchId: ar.id,
    esBranchId: es.id,
    ownerToken: "",
    ownerId: 0,
    adminArId: 0,
    adminArToken: "",
    coachToken: "",
    memberArId: 0,
    memberEsId: 0,
    planId: 0,
    subArId: 0,
    subEsId: 0,
  };
}

async function seedUsersAndPlan(
  app: FastifyInstance,
  ctx: SeededContext,
): Promise<void> {
  ctx.ownerToken = await getAuthToken(app, "admin@test.com", "adminpass123");
  const [ownerRow] = await app.db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, "admin@test.com"))
    .limit(1);
  ctx.ownerId = ownerRow.id;

  ctx.adminArId = await createStaffUser(app, {
    email: "admin-ar-exp@test.local",
    password: "pass123456",
    firstName: "Admin",
    lastName: "AR",
    role: "admin",
    branchId: ctx.arBranchId,
  });
  ctx.adminArToken = await getAuthToken(
    app,
    "admin-ar-exp@test.local",
    "pass123456",
  );

  await createStaffUser(app, {
    email: "coach-ar-exp@test.local",
    password: "pass123456",
    firstName: "Coach",
    lastName: "AR",
    role: "coach",
    branchId: ctx.arBranchId,
  });
  ctx.coachToken = await getAuthToken(
    app,
    "coach-ar-exp@test.local",
    "pass123456",
  );

  const memberAr = await registerUser(app, {
    email: `member-ar-exp-${Date.now()}@test.local`,
    password: "pass123456",
    firstName: "Juan",
    lastName: "Pérez",
    branchId: ctx.arBranchId,
  });
  ctx.memberArId = (memberAr.user as { id: number }).id;

  const memberEs = await registerUser(app, {
    email: `member-es-exp-${Date.now()}@test.local`,
    password: "pass123456",
    firstName: "María",
    lastName: "García",
    branchId: ctx.esBranchId,
  });
  ctx.memberEsId = (memberEs.user as { id: number }).id;

  const [plan] = await app.db
    .insert(schema.subscriptionPlans)
    .values({
      name: "Export Test Plan",
      planTier: "flex",
      bookingMode: "flexible",
      planCategory: "presencial",
      priceRegular: 100000,
      priceZero: 0,
      durationDays: 30,
      classesPerWeek: 3,
      currency: "ARS",
    })
    .$returningId();
  ctx.planId = plan.id;

  const [subAr] = await app.db
    .insert(schema.subscriptions)
    .values({
      userId: ctx.memberArId,
      planId: ctx.planId,
      branchId: ctx.arBranchId,
      status: "active",
      startDate: TODAY,
      pricePaid: 100000,
      currency: "ARS",
      priceTypeApplied: "regular",
    })
    .$returningId();
  ctx.subArId = subAr.id;

  const [subEs] = await app.db
    .insert(schema.subscriptions)
    .values({
      userId: ctx.memberEsId,
      planId: ctx.planId,
      branchId: ctx.esBranchId,
      status: "active",
      startDate: TODAY,
      pricePaid: 100000,
      currency: "ARS",
      priceTypeApplied: "regular",
    })
    .$returningId();
  ctx.subEsId = subEs.id;
}

async function postTransaction(
  app: FastifyInstance,
  token: string,
  payload: Record<string, unknown>,
): Promise<{ id: number }> {
  const res = await app.inject({
    method: "POST",
    url: `${FINANCE_URL}/transactions`,
    headers: { authorization: `Bearer ${token}` },
    payload,
  });
  if (res.statusCode !== 201) {
    throw new Error(
      `seed transaction failed: ${res.statusCode} ${res.payload}`,
    );
  }
  return res.json().transaction as { id: number };
}

describe("Finance API — GET /transactions/export (Phase 109 D-15)", () => {
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
    await seedUsersAndPlan(app, ctx);
  });

  it("E1: returns .xlsx with correct headers and a single header row + one row per transaction", async () => {
    // Seed two plan_charge transactions for AR member.
    await postTransaction(app, ctx.adminArToken, {
      memberId: ctx.memberArId,
      kind: "plan_charge",
      direction: "inflow",
      amount: 10000,
      currency: "ARS",
      paymentMethod: "cash",
      transactionDate: TODAY,
      effectiveDate: TODAY,
      branchId: ctx.arBranchId,
      notes: "Pago Marzo",
      links: [
        {
          targetKind: "subscription",
          targetId: ctx.subArId,
          allocatedAmount: 10000,
        },
      ],
    });
    await postTransaction(app, ctx.adminArToken, {
      memberId: ctx.memberArId,
      kind: "plan_charge",
      direction: "inflow",
      amount: 5000,
      currency: "ARS",
      paymentMethod: "transfer",
      transactionDate: TODAY,
      effectiveDate: TODAY,
      branchId: ctx.arBranchId,
      notes: null,
      links: [
        {
          targetKind: "subscription",
          targetId: ctx.subArId,
          allocatedAmount: 5000,
        },
      ],
    });

    const res = await app.inject({
      method: "GET",
      url: `${FINANCE_URL}/transactions/export`,
      headers: { authorization: `Bearer ${ctx.adminArToken}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(res.headers["content-disposition"]).toMatch(
      /attachment; filename="caja-\d{4}-\d{2}-\d{2}\.xlsx"/,
    );

    const wb = new Workbook();
    await wb.xlsx.load(res.rawPayload);
    const sheet = wb.getWorksheet("Caja");
    expect(sheet).toBeDefined();
    if (!sheet) return;

    // Header row + 2 data rows = 3 (exceljs row count).
    expect(sheet.rowCount).toBe(3);

    // 11 columns per D-15.
    const header = sheet.getRow(1);
    expect(header.getCell(1).value).toBe("Fecha");
    expect(header.getCell(2).value).toBe("Tipo");
    expect(header.getCell(3).value).toBe("Monto total");
    expect(header.getCell(4).value).toBe("Moneda");
    expect(header.getCell(5).value).toBe("Método de pago");
    expect(header.getCell(6).value).toBe("Sucursal");
    expect(header.getCell(7).value).toBe("Miembro");
    expect(header.getCell(8).value).toBe("Conceptos");
    expect(header.getCell(9).value).toBe("Notas");
    expect(header.getCell(10).value).toBe("Anulado");
    expect(header.getCell(11).value).toBe("Razón anulación");
  });

  it("E2: coach gets 403 (FINANCE_READ_ROLES excludes coach)", async () => {
    const res = await app.inject({
      method: "GET",
      url: `${FINANCE_URL}/transactions/export`,
      headers: { authorization: `Bearer ${ctx.coachToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it("E3: kind filter narrows the row set; one row per transaction (not per link)", async () => {
    // plan_charge
    await postTransaction(app, ctx.adminArToken, {
      memberId: ctx.memberArId,
      kind: "plan_charge",
      direction: "inflow",
      amount: 10000,
      currency: "ARS",
      paymentMethod: "cash",
      transactionDate: TODAY,
      effectiveDate: TODAY,
      branchId: ctx.arBranchId,
      notes: null,
      links: [
        {
          targetKind: "subscription",
          targetId: ctx.subArId,
          allocatedAmount: 10000,
        },
      ],
    });
    // adjustment (different kind, no links — allowed by SPEC §9).
    await postTransaction(app, ctx.adminArToken, {
      memberId: ctx.memberArId,
      kind: "adjustment",
      direction: "inflow",
      amount: 1000,
      currency: "ARS",
      paymentMethod: "internal",
      transactionDate: TODAY,
      effectiveDate: TODAY,
      branchId: ctx.arBranchId,
      notes: null,
      links: [],
    });

    const res = await app.inject({
      method: "GET",
      url: `${FINANCE_URL}/transactions/export?kind=plan_charge`,
      headers: { authorization: `Bearer ${ctx.adminArToken}` },
    });
    expect(res.statusCode).toBe(200);

    const wb = new Workbook();
    await wb.xlsx.load(res.rawPayload);
    const sheet = wb.getWorksheet("Caja");
    expect(sheet?.rowCount).toBe(2); // 1 header + 1 plan_charge row only.

    // Verify Tipo cell on the data row is the Spanish label.
    const dataRow = sheet?.getRow(2);
    expect(dataRow?.getCell(2).value).toBe("Cobro de plan");
  });

  it("E4: non-owner admin (AR) cannot see ES rows in the export", async () => {
    // Owner creates one ES transaction.
    await postTransaction(app, ctx.ownerToken, {
      memberId: ctx.memberEsId,
      kind: "plan_charge",
      direction: "inflow",
      amount: 7000,
      currency: "ARS",
      paymentMethod: "cash",
      transactionDate: TODAY,
      effectiveDate: TODAY,
      branchId: ctx.esBranchId,
      notes: null,
      links: [
        {
          targetKind: "subscription",
          targetId: ctx.subEsId,
          allocatedAmount: 7000,
        },
      ],
    });

    const res = await app.inject({
      method: "GET",
      url: `${FINANCE_URL}/transactions/export`,
      headers: { authorization: `Bearer ${ctx.adminArToken}` },
    });
    expect(res.statusCode).toBe(200);

    const wb = new Workbook();
    await wb.xlsx.load(res.rawPayload);
    const sheet = wb.getWorksheet("Caja");
    // Only header row; the ES row is filtered out by attachCountryScope.
    expect(sheet?.rowCount).toBe(1);
  });

  it("E5: Conceptos column populated as '<label> #<id>' from linkSummary", async () => {
    await postTransaction(app, ctx.adminArToken, {
      memberId: ctx.memberArId,
      kind: "plan_charge",
      direction: "inflow",
      amount: 10000,
      currency: "ARS",
      paymentMethod: "cash",
      transactionDate: TODAY,
      effectiveDate: TODAY,
      branchId: ctx.arBranchId,
      notes: null,
      links: [
        {
          targetKind: "subscription",
          targetId: ctx.subArId,
          allocatedAmount: 10000,
        },
      ],
    });

    const res = await app.inject({
      method: "GET",
      url: `${FINANCE_URL}/transactions/export`,
      headers: { authorization: `Bearer ${ctx.adminArToken}` },
    });
    expect(res.statusCode).toBe(200);

    const wb = new Workbook();
    await wb.xlsx.load(res.rawPayload);
    const sheet = wb.getWorksheet("Caja");
    const dataRow = sheet?.getRow(2);
    // Conceptos is column 8 per D-15.
    expect(dataRow?.getCell(8).value).toBe(`Plan #${ctx.subArId}`);
    // Anulado is column 10 — should be "No" for a fresh row.
    expect(dataRow?.getCell(10).value).toBe("No");
  });
});
