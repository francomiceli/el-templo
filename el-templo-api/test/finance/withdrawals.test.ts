/**
 * Retiros de caja (feedback caja/cobros 2026-09-07).
 *
 * Un retiro es un `expense` con centro de costo "Retiros" + `responsible_name`
 * obligatorio. En una caja EFECTIVO se vincula (transaction_links,
 * targetKind='transaction') a los cobros en efectivo que se llevó y el monto
 * es la suma de esos cobros. En una cuenta BANCO lleva monto explícito.
 *
 * Cubre:
 *   - GET /withdrawals/pending: solo cobros de socio en efectivo, firmes
 *     (validados, no anulados), de ESA caja, sin retiro activo; orden por fecha;
 *     total; concepto (nombre del plan por link, o notas); filtro dateTo;
 *     400 en cuenta banco.
 *   - POST /withdrawals (efectivo): 201, monto = Σ cobros, links, cost center
 *     "Retiros", responsable, fecha; los cobros desaparecen de pending; el
 *     Historial de cobros los marca con withdrawalId; el saldo firme baja.
 *   - Validaciones: cobro ya retirado, pendiente de validación, transferencia,
 *     de otra caja, anulado, ids vacíos, amount en efectivo, fecha futura,
 *     fecha del retiro anterior al cobro, responsable vacío (schema).
 *   - Guard de anulación: anular un cobro retirado → 409; anular el retiro
 *     (POST /expenses/:id/void) libera los cobros y entonces sí se anula.
 *   - Banco: amount obligatorio, transactionIds prohibidos, paymentCount 0.
 *   - POST /expenses con centro "Retiros" → 400 (los retiros van por acá).
 *   - GET /withdrawals (filtro por caja, incluye anulados), GET /withdrawals/:id
 *     (404 para un egreso que no es retiro), GET /withdrawals/responsibles.
 *   - RBAC: coach → 403 en POST.
 *
 * Runs against the per-worker test MySQL DB (eltemplo_test_<POOL_ID>).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { sql, eq, and, inArray } from "drizzle-orm";
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

const TEMPLO_CTX = { tenantId: TENANT_TEMPLO };
const BASE = "/api/admin/finance";

let app: FastifyInstance;
let adminId: number;
let branchId: number;
let memberId: number;
let planId: number;
let subscriptionId: number;
let cajaId: number;
let otherCajaId: number;
let bankCajaId: number;
let retirosCostCenterId: number;
let variosCostCenterId: number;

let adminToken: string;
let coachToken: string;

function daysAgo(n: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

interface PaymentRow {
  id: number;
  transactionDate: string;
  memberName: string;
  amount: number;
  concept: string | null;
}
interface PendingBody {
  cashRegisterId: number;
  cashRegisterName: string;
  currency: string;
  rows: PaymentRow[];
  total: number;
}
interface WithdrawalBody {
  id: number;
  amount: number;
  responsibleName: string;
  paymentCount: number;
  transactionDate: string;
  cashRegisterType: string;
  voidedAt: string | null;
  payments: PaymentRow[];
}

async function seedCobro(opts: {
  amount: number;
  transactionDate?: string;
  cashRegisterId?: number;
  paymentMethod?: "cash" | "transfer";
  validationStatus?: "pendiente" | "validado";
  kind?: "plan_charge" | "debt_settlement" | "advance_payment";
  notes?: string | null;
  linkSubscription?: boolean;
}): Promise<number> {
  const date = opts.transactionDate ?? daysAgo(1);
  const [res] = await app.db
    .insert(schema.financialTransactions)
    .values(
      tenantValues(TEMPLO_CTX, {
        memberId,
        kind: opts.kind ?? "plan_charge",
        direction: "inflow",
        amount: opts.amount,
        currency: "ARS",
        paymentMethod: opts.paymentMethod ?? "cash",
        transactionDate: date,
        effectiveDate: date,
        branchId,
        cashRegisterId: opts.cashRegisterId ?? cajaId,
        recordedBy: adminId,
        validationStatus: opts.validationStatus ?? "validado",
        notes: opts.notes ?? null,
      }),
    )
    .$returningId();
  if (opts.linkSubscription) {
    await app.db.insert(schema.transactionLinks).values(
      tenantValues(TEMPLO_CTX, {
        transactionId: res.id,
        targetKind: "subscription",
        targetId: subscriptionId,
        allocatedAmount: opts.amount,
      }),
    );
  }
  return res.id;
}

async function getPending(
  token: string,
  query: string,
): Promise<{ statusCode: number; body: PendingBody }> {
  const res = await app.inject({
    method: "GET",
    url: `${BASE}/withdrawals/pending${query}`,
    headers: { authorization: `Bearer ${token}` },
  });
  return { statusCode: res.statusCode, body: JSON.parse(res.body) };
}

async function postWithdrawal(
  token: string,
  payload: Record<string, unknown>,
): Promise<{
  statusCode: number;
  body: { withdrawal?: WithdrawalBody; message?: string };
}> {
  const res = await app.inject({
    method: "POST",
    url: `${BASE}/withdrawals`,
    headers: { authorization: `Bearer ${token}` },
    payload,
  });
  return { statusCode: res.statusCode, body: JSON.parse(res.body) };
}

async function voidTx(
  id: number,
  url: "transactions" | "expenses",
): Promise<{ statusCode: number; body: { message?: string } }> {
  const res = await app.inject({
    method: "POST",
    url: `${BASE}/${url}/${id}/void`,
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { reason: "test" },
  });
  return { statusCode: res.statusCode, body: JSON.parse(res.body) };
}

async function firmeBalance(id: number): Promise<number> {
  const res = await app.inject({
    method: "GET",
    url: `${BASE}/cash-registers/balances`,
    headers: { authorization: `Bearer ${adminToken}` },
  });
  const rows = JSON.parse(res.body) as Array<{
    cashRegisterId: number;
    firmeBalance: number;
  }>;
  return rows.find((r) => r.cashRegisterId === id)?.firmeBalance ?? NaN;
}

beforeAll(async () => {
  app = await createTestApp();

  const [admin] = await app.db
    .select({ id: schema.users.id, branchId: schema.users.branchId })
    .from(schema.users)
    .where(
      and(
        tenantWhere(schema.users, TEMPLO_CTX),
        eq(schema.users.email, "admin@test.com"),
      ),
    )
    .limit(1);
  adminId = admin.id;
  branchId = admin.branchId ?? 1;
  adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");

  await createStaffUser(app, {
    email: "coach-retiros@test.local",
    password: "pass123456",
    firstName: "Coach",
    lastName: "Retiros",
    role: "coach",
    branchId,
  });
  coachToken = await getAuthToken(app, "coach-retiros@test.local", "pass123456");

  const member = await registerUser(app, {
    email: `retiros-member-${Date.now()}@test.local`,
    password: "TestPass123!",
    firstName: "Suyai",
    lastName: "Torres",
    branchId,
  });
  memberId = (member.user as { id: number }).id;

  const [plan] = await app.db
    .insert(schema.subscriptionPlans)
    .values({
      tenantId: TENANT_TEMPLO,
      name: "FLEX ZERO Retiros",
      planTier: "flex",
      bookingMode: "flexible",
      planCategory: "presencial",
      priceRegular: 65000,
      priceZero: 65000,
      priceCreditCard: 65000,
      durationDays: 30,
      classesPerWeek: 3,
      currency: "ARS",
      isActive: true,
    })
    .$returningId();
  planId = plan.id;
  const [sub] = await app.db
    .insert(schema.subscriptions)
    .values({
      tenantId: TENANT_TEMPLO,
      userId: memberId,
      planId,
      branchId,
      status: "active",
      startDate: daysAgo(10),
      endDate: daysAgo(-20),
      pricePaid: 65000,
      currency: "ARS",
      priceTypeApplied: "regular",
    })
    .$returningId();
  subscriptionId = sub.id;

  await ensureEfectivoCaja(app, branchId);
  const [caja] = await app.db
    .select({ id: schema.cashRegisters.id })
    .from(schema.cashRegisters)
    .where(
      and(
        tenantWhere(schema.cashRegisters, TEMPLO_CTX),
        eq(schema.cashRegisters.type, "efectivo"),
        eq(schema.cashRegisters.branchId, branchId),
      ),
    )
    .limit(1);
  cajaId = caja.id;

  const [other] = await app.db
    .insert(schema.cashRegisters)
    .values(
      tenantValues(TEMPLO_CTX, {
        name: `Retiros-Other ${Date.now()}`,
        type: "efectivo" as const,
        branchId,
        currency: "ARS",
        openingBalance: 0,
        cutoffDate: "2020-01-01",
      }),
    )
    .$returningId();
  otherCajaId = other.id;

  const [bank] = await app.db
    .insert(schema.cashRegisters)
    .values(
      tenantValues(TEMPLO_CTX, {
        name: `Retiros-Bank ${Date.now()}`,
        type: "banco" as const,
        branchId: null,
        currency: "ARS",
        openingBalance: 0,
        cutoffDate: "2020-01-01",
      }),
    )
    .$returningId();
  bankCajaId = bank.id;

  // Centros de costo: "Retiros" (sembrado por la mig 0163 para AR; si el
  // orden de la suite lo borró, el service lo recrea) y "Varios" para el
  // egreso de control.
  for (const name of ["Retiros", "Varios"]) {
    const [existing] = await app.db
      .select({ id: schema.costCenters.id })
      .from(schema.costCenters)
      .where(
        and(
          tenantWhere(schema.costCenters, TEMPLO_CTX),
          eq(schema.costCenters.name, name),
          eq(schema.costCenters.country, "AR"),
        ),
      )
      .limit(1);
    let id = existing?.id;
    if (!id) {
      const [ins] = await app.db
        .insert(schema.costCenters)
        .values(tenantValues(TEMPLO_CTX, { name, country: "AR", isActive: true }))
        .$returningId();
      id = ins.id;
    }
    if (name === "Retiros") retirosCostCenterId = id;
    else variosCostCenterId = id;
  }
});

afterAll(async () => {
  await app.db.execute(
    sql`DELETE FROM transaction_links WHERE tenant_id = ${TENANT_TEMPLO}`,
  );
  await app.db.execute(
    sql`DELETE FROM financial_transactions WHERE tenant_id = ${TENANT_TEMPLO}`,
  );
  const extraCajas = [otherCajaId, bankCajaId].filter(
    (id): id is number => typeof id === "number",
  );
  if (extraCajas.length > 0) {
    await app.db
      .delete(schema.cashRegisters)
      .where(
        and(
          tenantWhere(schema.cashRegisters, TEMPLO_CTX),
          inArray(schema.cashRegisters.id, extraCajas),
        ),
      );
  }
  await app.close();
});

beforeEach(async () => {
  await app.db.execute(
    sql`DELETE FROM transaction_links WHERE tenant_id = ${TENANT_TEMPLO}`,
  );
  await app.db.execute(
    sql`DELETE FROM financial_transactions WHERE tenant_id = ${TENANT_TEMPLO}`,
  );
});

// ─────────────────────────────────────────────────────────────────────────

describe("GET /withdrawals/pending", () => {
  it("lista solo cobros de socio en efectivo, firmes, de la caja, sin retiro; en orden; con total y concepto", async () => {
    const a = await seedCobro({
      amount: 65000,
      transactionDate: daysAgo(13),
      linkSubscription: true,
    });
    const b = await seedCobro({ amount: 65000, transactionDate: daysAgo(11) });
    const c = await seedCobro({
      amount: 5000,
      transactionDate: daysAgo(7),
      kind: "advance_payment",
      notes: "Salda deuda",
    });
    // Ruido que NO debe aparecer:
    await seedCobro({ amount: 1, validationStatus: "pendiente" }); // sin validar
    await seedCobro({ amount: 2, paymentMethod: "transfer", cashRegisterId: bankCajaId }); // transferencia
    await seedCobro({ amount: 3, cashRegisterId: otherCajaId }); // otra caja
    const voided = await seedCobro({ amount: 4 });
    await app.db
      .update(schema.financialTransactions)
      .set({ voidedAt: new Date(), voidedBy: adminId, voidReason: "x" })
      .where(
        and(
          tenantWhere(schema.financialTransactions, TEMPLO_CTX),
          eq(schema.financialTransactions.id, voided),
        ),
      );

    const { statusCode, body } = await getPending(
      adminToken,
      `?cashRegisterId=${cajaId}`,
    );
    expect(statusCode).toBe(200);
    expect(body.cashRegisterId).toBe(cajaId);
    expect(body.currency).toBe("ARS");
    expect(body.rows.map((r) => r.id)).toEqual([a, b, c]);
    expect(body.total).toBe(135000);
    expect(body.rows[0].concept).toBe("FLEX ZERO Retiros");
    expect(body.rows[1].concept).toBeNull();
    expect(body.rows[2].concept).toBe("Salda deuda");
    expect(body.rows[0].memberName).toBe("Suyai Torres");
  });

  it("dateTo acota a lo cobrado hasta esa fecha (carga de retiros históricos)", async () => {
    const old = await seedCobro({ amount: 100, transactionDate: daysAgo(20) });
    await seedCobro({ amount: 200, transactionDate: daysAgo(2) });
    const { body } = await getPending(
      adminToken,
      `?cashRegisterId=${cajaId}&dateTo=${daysAgo(10)}`,
    );
    expect(body.rows.map((r) => r.id)).toEqual([old]);
    expect(body.total).toBe(100);
  });

  it("cuenta banco → 400", async () => {
    const { statusCode } = await getPending(
      adminToken,
      `?cashRegisterId=${bankCajaId}`,
    );
    expect(statusCode).toBe(400);
  });

  it("sin cashRegisterId → 400 (schema)", async () => {
    const { statusCode } = await getPending(adminToken, "");
    expect(statusCode).toBe(400);
  });
});

describe("POST /withdrawals — caja efectivo", () => {
  it("registra el retiro: monto = Σ cobros elegidos, links, centro Retiros, responsable; los cobros salen de pending y el saldo baja", async () => {
    const a = await seedCobro({ amount: 65000, transactionDate: daysAgo(13) });
    const b = await seedCobro({ amount: 65000, transactionDate: daysAgo(11) });
    const c = await seedCobro({ amount: 65000, transactionDate: daysAgo(7) });
    expect(await firmeBalance(cajaId)).toBe(195000);

    const { statusCode, body } = await postWithdrawal(adminToken, {
      cajaId,
      responsibleName: "  Matías Mamana ",
      transactionIds: [a, b, a], // duplicado: se ignora
      notes: "Retiro semanal",
    });
    expect(statusCode).toBe(201);
    const w = body.withdrawal!;
    expect(w.amount).toBe(130000);
    expect(w.paymentCount).toBe(2);
    expect(w.responsibleName).toBe("Matías Mamana");
    expect(w.cashRegisterType).toBe("efectivo");
    expect(w.transactionDate).toBe(daysAgo(0));
    expect(w.payments.map((p) => p.id).sort()).toEqual([a, b].sort());

    const [row] = await app.db
      .select({
        kind: schema.financialTransactions.kind,
        direction: schema.financialTransactions.direction,
        amount: schema.financialTransactions.amount,
        costCenterId: schema.financialTransactions.costCenterId,
        responsibleName: schema.financialTransactions.responsibleName,
        cashRegisterId: schema.financialTransactions.cashRegisterId,
        validationStatus: schema.financialTransactions.validationStatus,
        notes: schema.financialTransactions.notes,
      })
      .from(schema.financialTransactions)
      .where(
        and(
          tenantWhere(schema.financialTransactions, TEMPLO_CTX),
          eq(schema.financialTransactions.id, w.id),
        ),
      );
    expect(row.kind).toBe("expense");
    expect(row.direction).toBe("outflow");
    expect(row.amount).toBe(130000);
    expect(row.costCenterId).toBe(retirosCostCenterId);
    expect(row.responsibleName).toBe("Matías Mamana");
    expect(row.cashRegisterId).toBe(cajaId);
    expect(row.validationStatus).toBe("validado");
    expect(row.notes).toBe("Retiro semanal");

    const links = await app.db
      .select({
        targetKind: schema.transactionLinks.targetKind,
        targetId: schema.transactionLinks.targetId,
        allocatedAmount: schema.transactionLinks.allocatedAmount,
      })
      .from(schema.transactionLinks)
      .where(
        and(
          tenantWhere(schema.transactionLinks, TEMPLO_CTX),
          eq(schema.transactionLinks.transactionId, w.id),
        ),
      );
    expect(links).toHaveLength(2);
    expect(links.every((l) => l.targetKind === "transaction")).toBe(true);
    expect(links.reduce((s, l) => s + l.allocatedAmount, 0)).toBe(130000);

    // Solo queda c pendiente de retiro.
    const pending = await getPending(adminToken, `?cashRegisterId=${cajaId}`);
    expect(pending.body.rows.map((r) => r.id)).toEqual([c]);
    expect(pending.body.total).toBe(65000);

    // Saldo firme: 195000 - 130000.
    expect(await firmeBalance(cajaId)).toBe(65000);

    // Historial de cobros: a y b marcados, c no.
    const list = await app.inject({
      method: "GET",
      url: `${BASE}/transactions?paymentMethod=cash&dateFrom=${daysAgo(30)}&dateTo=${daysAgo(0)}&limit=200`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const rows = (
      JSON.parse(list.body) as {
        rows: Array<{
          id: number;
          withdrawalId: number | null;
          withdrawnAt: string | null;
        }>;
      }
    ).rows;
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get(a)?.withdrawalId).toBe(w.id);
    expect(byId.get(a)?.withdrawnAt).toBe(daysAgo(0));
    expect(byId.get(b)?.withdrawalId).toBe(w.id);
    expect(byId.get(c)?.withdrawalId).toBeNull();
    expect(byId.get(c)?.withdrawnAt).toBeNull();
  });

  it("acepta fecha pasada (retiro histórico) y rechaza fecha futura o anterior a un cobro", async () => {
    const a = await seedCobro({ amount: 100, transactionDate: daysAgo(10) });
    const past = await postWithdrawal(adminToken, {
      cajaId,
      responsibleName: "Martín Figueras",
      transactionIds: [a],
      transactionDate: daysAgo(5),
    });
    expect(past.statusCode).toBe(201);
    expect(past.body.withdrawal!.transactionDate).toBe(daysAgo(5));

    const b = await seedCobro({ amount: 100, transactionDate: daysAgo(3) });
    const future = await postWithdrawal(adminToken, {
      cajaId,
      responsibleName: "Martín Figueras",
      transactionIds: [b],
      transactionDate: daysAgo(-1),
    });
    expect(future.statusCode).toBe(400);
    expect(future.body.message).toContain("futura");

    const before = await postWithdrawal(adminToken, {
      cajaId,
      responsibleName: "Martín Figueras",
      transactionIds: [b],
      transactionDate: daysAgo(4),
    });
    expect(before.statusCode).toBe(400);
    expect(before.body.message).toContain("posterior a la fecha del retiro");
  });

  it("rechaza cobros no elegibles con un mensaje que nombra el cobro", async () => {
    const ok = await seedCobro({ amount: 100 });
    const pendiente = await seedCobro({ amount: 100, validationStatus: "pendiente" });
    const transfer = await seedCobro({
      amount: 100,
      paymentMethod: "transfer",
      cashRegisterId: bankCajaId,
    });
    const otra = await seedCobro({ amount: 100, cashRegisterId: otherCajaId });
    const voided = await seedCobro({ amount: 100 });
    await voidTx(voided, "transactions");

    const cases: Array<[number, string]> = [
      [pendiente, "no está validado"],
      [transfer, "no es un cobro de socio en efectivo"],
      [otra, "no está imputado a la caja"],
      [voided, "anulado"],
      [999999999, "no existe"],
    ];
    for (const [id, fragment] of cases) {
      const res = await postWithdrawal(adminToken, {
        cajaId,
        responsibleName: "X",
        transactionIds: [ok, id],
      });
      expect([400, 404]).toContain(res.statusCode);
      expect(res.body.message).toContain(fragment);
    }
    // Nada quedó registrado: el retiro es todo o nada.
    const pending = await getPending(adminToken, `?cashRegisterId=${cajaId}`);
    expect(pending.body.rows.map((r) => r.id)).toEqual([ok]);
  });

  it("un cobro ya retirado no se retira dos veces", async () => {
    const a = await seedCobro({ amount: 100 });
    const first = await postWithdrawal(adminToken, {
      cajaId,
      responsibleName: "A",
      transactionIds: [a],
    });
    expect(first.statusCode).toBe(201);
    const second = await postWithdrawal(adminToken, {
      cajaId,
      responsibleName: "B",
      transactionIds: [a],
    });
    expect(second.statusCode).toBe(400);
    expect(second.body.message).toContain(`ya fue retirado (retiro #${first.body.withdrawal!.id})`);
  });

  it("validaciones de forma: ids vacíos, amount en efectivo, responsable vacío", async () => {
    const a = await seedCobro({ amount: 100 });
    const empty = await postWithdrawal(adminToken, {
      cajaId,
      responsibleName: "A",
      transactionIds: [],
    });
    expect(empty.statusCode).toBe(400);
    expect(empty.body.message).toContain("al menos un cobro");

    const withAmount = await postWithdrawal(adminToken, {
      cajaId,
      responsibleName: "A",
      transactionIds: [a],
      amount: 100,
    });
    expect(withAmount.statusCode).toBe(400);
    expect(withAmount.body.message).toContain("suma de los cobros");

    const blank = await postWithdrawal(adminToken, {
      cajaId,
      responsibleName: "   ",
      transactionIds: [a],
    });
    expect(blank.statusCode).toBe(400);

    const missing = await postWithdrawal(adminToken, {
      cajaId,
      transactionIds: [a],
    });
    expect(missing.statusCode).toBe(400);
  });

  it("coach → 403", async () => {
    const a = await seedCobro({ amount: 100 });
    const res = await postWithdrawal(coachToken, {
      cajaId,
      responsibleName: "A",
      transactionIds: [a],
    });
    expect(res.statusCode).toBe(403);
  });
});

describe("anulación y retiros", () => {
  it("anular un cobro retirado → 409; anular el retiro libera el cobro y entonces se anula", async () => {
    const a = await seedCobro({ amount: 100 });
    const b = await seedCobro({ amount: 200 });
    const w = (
      await postWithdrawal(adminToken, {
        cajaId,
        responsibleName: "A",
        transactionIds: [a, b],
      })
    ).body.withdrawal!;

    const blocked = await voidTx(a, "transactions");
    expect(blocked.statusCode).toBe(409);
    expect(blocked.body.message).toContain(`retiro #${w.id}`);

    const voidW = await voidTx(w.id, "expenses");
    expect(voidW.statusCode).toBe(200);

    // El retiro anulado libera los cobros: vuelven a pending y el saldo vuelve.
    const pending = await getPending(adminToken, `?cashRegisterId=${cajaId}`);
    expect(pending.body.rows.map((r) => r.id).sort()).toEqual([a, b].sort());
    expect(await firmeBalance(cajaId)).toBe(300);

    const nowOk = await voidTx(a, "transactions");
    expect(nowOk.statusCode).toBe(200);

    // El retiro anulado sigue en el historial, marcado.
    const list = await app.inject({
      method: "GET",
      url: `${BASE}/withdrawals?cashRegisterId=${cajaId}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const rows = (JSON.parse(list.body) as { rows: WithdrawalBody[] }).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(w.id);
    expect(rows[0].voidedAt).not.toBeNull();
    expect(rows[0].paymentCount).toBe(2);
  });

  it("los cobros de un retiro anulado se pueden volver a retirar", async () => {
    const a = await seedCobro({ amount: 100 });
    const w1 = (
      await postWithdrawal(adminToken, { cajaId, responsibleName: "A", transactionIds: [a] })
    ).body.withdrawal!;
    await voidTx(w1.id, "expenses");
    const w2 = await postWithdrawal(adminToken, {
      cajaId,
      responsibleName: "B",
      transactionIds: [a],
    });
    expect(w2.statusCode).toBe(201);
  });
});

describe("POST /withdrawals — cuenta banco", () => {
  it("monto explícito, sin cobros; paymentCount 0; resta del saldo de la cuenta", async () => {
    await seedCobro({
      amount: 500,
      paymentMethod: "transfer",
      cashRegisterId: bankCajaId,
    });
    expect(await firmeBalance(bankCajaId)).toBe(500);
    const res = await postWithdrawal(adminToken, {
      cajaId: bankCajaId,
      responsibleName: "Martín Figueras",
      amount: 300,
    });
    expect(res.statusCode).toBe(201);
    expect(res.body.withdrawal!.amount).toBe(300);
    expect(res.body.withdrawal!.paymentCount).toBe(0);
    expect(res.body.withdrawal!.cashRegisterType).toBe("banco");
    expect(await firmeBalance(bankCajaId)).toBe(200);
  });

  it("sin amount → 400; con transactionIds → 400", async () => {
    const noAmount = await postWithdrawal(adminToken, {
      cajaId: bankCajaId,
      responsibleName: "A",
    });
    expect(noAmount.statusCode).toBe(400);
    expect(noAmount.body.message).toContain("monto");
    const withIds = await postWithdrawal(adminToken, {
      cajaId: bankCajaId,
      responsibleName: "A",
      amount: 100,
      transactionIds: [1],
    });
    expect(withIds.statusCode).toBe(400);
    expect(withIds.body.message).toContain("no se vincula a cobros");
  });
});

describe("egresos manuales con centro Retiros", () => {
  it("POST /expenses con el centro 'Retiros' → 400 (usar Registrar retiro)", async () => {
    const res = await app.inject({
      method: "POST",
      url: `${BASE}/expenses`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { cajaId, amount: 100, costCenterId: retirosCostCenterId },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toContain("Retiros");
  });

  it("un egreso con otro centro sigue funcionando y NO aparece como retiro", async () => {
    const res = await app.inject({
      method: "POST",
      url: `${BASE}/expenses`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { cajaId, amount: 100, costCenterId: variosCostCenterId },
    });
    expect(res.statusCode).toBe(201);
    const expenseId = (JSON.parse(res.body) as { expense: { expenseTxId: number } })
      .expense.expenseTxId;

    const list = await app.inject({
      method: "GET",
      url: `${BASE}/withdrawals`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect((JSON.parse(list.body) as { rows: unknown[] }).rows).toHaveLength(0);

    const detail = await app.inject({
      method: "GET",
      url: `${BASE}/withdrawals/${expenseId}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(detail.statusCode).toBe(404);
  });
});

describe("GET /withdrawals, /withdrawals/:id, /withdrawals/responsibles", () => {
  it("lista filtrada por caja, detalle con cobros, y responsables sugeridos", async () => {
    const a = await seedCobro({ amount: 100 });
    const w = (
      await postWithdrawal(adminToken, {
        cajaId,
        responsibleName: "Candela Daibes",
        transactionIds: [a],
      })
    ).body.withdrawal!;
    await postWithdrawal(adminToken, {
      cajaId: bankCajaId,
      responsibleName: "Martín Figueras",
      amount: 50,
    });

    const all = await app.inject({
      method: "GET",
      url: `${BASE}/withdrawals`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect((JSON.parse(all.body) as { total: number }).total).toBe(2);

    const onlyCaja = await app.inject({
      method: "GET",
      url: `${BASE}/withdrawals?cashRegisterId=${cajaId}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const rows = (JSON.parse(onlyCaja.body) as { rows: WithdrawalBody[] }).rows;
    expect(rows.map((r) => r.id)).toEqual([w.id]);
    expect(rows[0].responsibleName).toBe("Candela Daibes");

    const detail = await app.inject({
      method: "GET",
      url: `${BASE}/withdrawals/${w.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(detail.statusCode).toBe(200);
    const d = JSON.parse(detail.body) as WithdrawalBody;
    expect(d.payments.map((p) => p.id)).toEqual([a]);
    expect(d.payments[0].amount).toBe(100);

    const resp = await app.inject({
      method: "GET",
      url: `${BASE}/withdrawals/responsibles`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const names = JSON.parse(resp.body) as string[];
    expect(names).toContain("Candela Daibes");
    expect(names).toContain("Martín Figueras");
    expect(names).toContain("Coach Retiros"); // staff activo
    expect(new Set(names).size).toBe(names.length);
  });
});
