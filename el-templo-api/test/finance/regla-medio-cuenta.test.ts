/**
 * Fase 208-03 — regla única medio↔cuenta (DI-04) aplicada en los puntos de alta
 * y de validación.
 *
 * Cubre:
 *   - Caracterización de los caminos de cobro actuales (PoS pay-plan / misc,
 *     POST /transactions): efectivo → caja efectivo de la sede, transferencia /
 *     tarjeta → banco. Cada fila cumple `isMethodAllowedForAccount`.
 *   - validate con caja elegida: tipo de cuenta incompatible con el medio → 400
 *     y el cobro sigue pendiente (T-208-08).
 *   - registerExpense con `paymentMethod` (nivel service): rechazos y cheque
 *     desde banco (T-208-09). La ruta POST /expenses sigue en `internal`.
 *   - POST /movements entre efectivo y banco sigue andando (patas internal).
 *   - resolveCashRegister("cheque") → banco; POST /transactions con cheque → 400.
 *
 * Los tests con DB corren en foreground y de a un archivo.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  createTestApp,
  getAuthToken,
  registerUser,
  ensureEfectivoCaja,
} from "../helpers";
import * as schema from "../../src/db/schema";
import { TENANT_TEMPLO } from "../fixtures/second-tenant";
import { tenantValues, tenantWhere } from "../../src/modules/shared/tenant";
import { BalanceService } from "../../src/modules/finance/balance-service";
import { CashRegisterService } from "../../src/modules/finance/cash-register-service";
import { MovementService } from "../../src/modules/finance/movement-service";
import { TransactionService } from "../../src/modules/finance/transaction-service";
import { BadRequestError } from "../../src/modules/shared/errors";
import { isMethodAllowedForAccount } from "../../src/modules/finance/payment-method-rules";

const TEMPLO_CTX = { tenantId: TENANT_TEMPLO };
const FIN = "/api/admin/finance";
const COACH_LOAD_URL = `${FIN}/coach-load`;
const CUTOFF = "2020-01-01";
const TODAY = new Date().toISOString().split("T")[0];

type CajaType = "efectivo" | "banco";

let app: FastifyInstance;
let adminToken: string;
let adminId: number;
let branchId: number;
let memberId: number;
let planId: number;
let costCenterId: number;
let txService: TransactionService;
let cashRegisterService: CashRegisterService;
let movementService: MovementService;

// Cajas propias del archivo (se borran en afterAll).
const seededCajaIds: number[] = [];
let efectivoSedeId: number; // efectivo de la sede (la que usa el resolver de cobros)
let bancoId: number; // banco ARS propio
let centralId: number; // efectivo sin sede (Central de prueba)

async function newCaja(
  type: CajaType,
  opts: { branchId?: number | null; opening?: number; currency?: string } = {},
): Promise<number> {
  const [row] = await app.db
    .insert(schema.cashRegisters)
    .values(
      tenantValues(TEMPLO_CTX, {
        name: `REGLA-208 ${type} ${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
        type,
        branchId: opts.branchId === undefined ? null : opts.branchId,
        currency: opts.currency ?? "ARS",
        openingBalance: opts.opening ?? 0,
        cutoffDate: CUTOFF,
      }),
    )
    .$returningId();
  seededCajaIds.push(row.id);
  return row.id;
}

async function cajaTypeOf(id: number): Promise<CajaType> {
  const [row] = await app.db
    .select({ type: schema.cashRegisters.type })
    .from(schema.cashRegisters)
    .where(
      and(
        tenantWhere(schema.cashRegisters, TEMPLO_CTX),
        eq(schema.cashRegisters.id, id),
      ),
    )
    .limit(1);
  return row.type;
}

async function readTx(id: number): Promise<{
  paymentMethod: string;
  cashRegisterId: number | null;
  validationStatus: string;
}> {
  const [row] = await app.db
    .select({
      paymentMethod: schema.financialTransactions.paymentMethod,
      cashRegisterId: schema.financialTransactions.cashRegisterId,
      validationStatus: schema.financialTransactions.validationStatus,
    })
    .from(schema.financialTransactions)
    .where(
      and(
        tenantWhere(schema.financialTransactions, TEMPLO_CTX),
        eq(schema.financialTransactions.id, id),
      ),
    )
    .limit(1);
  return row;
}

/** Cobro suelto pendiente creado por service (sin links), con el medio dado. */
async function pendingCobro(
  paymentMethod: "cash" | "transfer",
  cashRegisterId?: number,
): Promise<number> {
  const tx = await txService.create(
    TEMPLO_CTX,
    {
      memberId,
      kind: "advance_payment",
      direction: "inflow",
      amount: 500,
      currency: "ARS",
      paymentMethod,
      transactionDate: TODAY,
      effectiveDate: TODAY,
      branchId,
      notes: null,
      miscReason: "otro",
      validationStatus: "pendiente",
      ...(cashRegisterId !== undefined ? { cashRegisterId } : {}),
      links: [],
    },
    adminId,
  );
  return tx.id;
}

async function postValidate(id: number, cashRegisterId: number) {
  const res = await app.inject({
    method: "POST",
    url: `${FIN}/transactions/${id}/validate`,
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { cashRegisterId },
  });
  return { statusCode: res.statusCode, body: res.body };
}

async function firme(cajaId: number): Promise<number> {
  return Number(
    (await cashRegisterService.getBalance(TEMPLO_CTX, cajaId)).firmeBalance,
  );
}

beforeAll(async () => {
  app = await createTestApp();
  cashRegisterService = new CashRegisterService(app.db, app.log);
  txService = new TransactionService(
    app.db,
    app.log,
    new BalanceService(app.db, app.log),
    cashRegisterService,
  );
  movementService = new MovementService(
    app.db,
    app.log,
    txService,
    cashRegisterService,
  );

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

  await ensureEfectivoCaja(app, branchId, "ARS");
  const [efectivoSede] = await app.db
    .select({ id: schema.cashRegisters.id })
    .from(schema.cashRegisters)
    .where(
      and(
        tenantWhere(schema.cashRegisters, TEMPLO_CTX),
        eq(schema.cashRegisters.type, "efectivo"),
        eq(schema.cashRegisters.branchId, branchId),
        eq(schema.cashRegisters.currency, "ARS"),
        eq(schema.cashRegisters.isActive, true),
      ),
    )
    .orderBy(schema.cashRegisters.id)
    .limit(1);
  efectivoSedeId = efectivoSede.id;

  bancoId = await newCaja("banco");
  centralId = await newCaja("efectivo", { branchId: null });

  const member = await registerUser(app, {
    email: `regla-208-${Date.now()}@test.local`,
    password: "TestPass123!",
    firstName: "Regla",
    lastName: "Medio",
    branchId,
  });
  memberId = (member.user as { id: number }).id;

  const [plan] = await app.db
    .insert(schema.subscriptionPlans)
    .values({
      tenantId: TENANT_TEMPLO,
      name: "Regla 208 Plan",
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
  planId = plan.id;

  const [seededCenter] = await app.db
    .select({ id: schema.costCenters.id })
    .from(schema.costCenters)
    .where(
      and(
        eq(schema.costCenters.country, "AR"),
        eq(schema.costCenters.isActive, true),
        tenantWhere(schema.costCenters, TEMPLO_CTX),
      ),
    )
    .limit(1);
  if (seededCenter) {
    costCenterId = seededCenter.id;
  } else {
    const [created] = await app.db
      .insert(schema.costCenters)
      .values(tenantValues(TEMPLO_CTX, { name: "Varios", country: "AR" }));
    costCenterId = Number(created.insertId);
  }
});

afterAll(async () => {
  // Filas del ledger del socio de prueba y de las cajas propias, con sus links,
  // y después las cajas. Conexión cruda con FK checks apagados (como coach-load).
  const conn = await app.dbPool.getConnection();
  try {
    await conn.query("SET FOREIGN_KEY_CHECKS=0");
    const cajaList = seededCajaIds.length > 0 ? seededCajaIds : [0];
    await conn.query(
      "DELETE FROM `transaction_links` WHERE tenant_id = ? AND transaction_id IN (SELECT id FROM `financial_transactions` WHERE tenant_id = ? AND (member_id = ? OR cash_register_id IN (?)))",
      [TENANT_TEMPLO, TENANT_TEMPLO, memberId, cajaList],
    );
    await conn.query(
      "DELETE FROM `financial_transactions` WHERE tenant_id = ? AND (member_id = ? OR cash_register_id IN (?))",
      [TENANT_TEMPLO, memberId, cajaList],
    );
    await conn.query(
      "DELETE FROM `balances` WHERE tenant_id = ? AND member_id = ?",
      [TENANT_TEMPLO, memberId],
    );
    await conn.query(
      "DELETE FROM `subscriptions` WHERE tenant_id = ? AND user_id = ?",
      [TENANT_TEMPLO, memberId],
    );
    if (seededCajaIds.length > 0) {
      await app.db
        .delete(schema.cashRegisters)
        .where(
          and(
            inArray(schema.cashRegisters.id, seededCajaIds),
            tenantWhere(schema.cashRegisters, TEMPLO_CTX),
          ),
        );
    }
    await conn.query("SET FOREIGN_KEY_CHECKS=1");
  } finally {
    conn.release();
  }
  await app.close();
});

// ─── Cobros actuales: caracterización (DI-04, T-208-10) ───────────────────────
describe("cobros actuales cumplen la regla medio-cuenta", () => {
  it("PoS /misc en efectivo → caja efectivo de la sede", async () => {
    const res = await app.inject({
      method: "POST",
      url: `${COACH_LOAD_URL}/misc`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        memberId,
        amount: 1200,
        concepto: "Cobro efectivo regla",
        paymentMethod: "cash",
        currency: "ARS",
        idempotencyKey: `regla-misc-cash-${Date.now()}`,
        miscReason: "otro",
      },
    });
    expect(res.statusCode, res.body).toBe(201);
    const row = await readTx(JSON.parse(res.body).transaction.id);
    expect(row.paymentMethod).toBe("cash");
    expect(row.cashRegisterId).not.toBeNull();
    const type = await cajaTypeOf(row.cashRegisterId as number);
    expect(type).toBe("efectivo");
    expect(isMethodAllowedForAccount("cash", type)).toBe(true);
  });

  it("PoS /misc con transferencia + bankAccountId → caja banco", async () => {
    const res = await app.inject({
      method: "POST",
      url: `${COACH_LOAD_URL}/misc`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        memberId,
        amount: 1300,
        concepto: "Transferencia regla",
        paymentMethod: "transfer",
        currency: "ARS",
        bankAccountId: bancoId,
        idempotencyKey: `regla-misc-transfer-${Date.now()}`,
        miscReason: "otro",
      },
    });
    expect(res.statusCode, res.body).toBe(201);
    const row = await readTx(JSON.parse(res.body).transaction.id);
    expect(row.cashRegisterId).toBe(bancoId);
    const type = await cajaTypeOf(bancoId);
    expect(type).toBe("banco");
    expect(isMethodAllowedForAccount("transfer", type)).toBe(true);
  });

  it("PoS /pay-plan en efectivo (renovación) → caja efectivo de la sede", async () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];
    const start = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];
    await app.db.insert(schema.subscriptions).values({
      tenantId: TENANT_TEMPLO,
      userId: memberId,
      planId,
      branchId,
      status: "active",
      startDate: start,
      endDate: yesterday,
      pricePaid: 100000,
      currency: "ARS",
      priceTypeApplied: "regular",
    });

    const res = await app.inject({
      method: "POST",
      url: `${COACH_LOAD_URL}/pay-plan`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        userId: memberId,
        paymentMethod: "cash",
        idempotencyKey: `regla-payplan-cash-${Date.now()}`,
      },
    });
    expect(res.statusCode, res.body).toBe(201);
    const row = await readTx(JSON.parse(res.body).transaction.id);
    expect(row.paymentMethod).toBe("cash");
    expect(row.cashRegisterId).not.toBeNull();
    const type = await cajaTypeOf(row.cashRegisterId as number);
    expect(type).toBe("efectivo");
    expect(isMethodAllowedForAccount("cash", type)).toBe(true);
  });

  it("POST /transactions (owner): cash → efectivo, transfer y card → banco", async () => {
    const post = async (paymentMethod: string) => {
      const res = await app.inject({
        method: "POST",
        url: `${FIN}/transactions`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          memberId,
          kind: "advance_payment",
          direction: "inflow",
          amount: 700,
          currency: "ARS",
          paymentMethod,
          transactionDate: TODAY,
          effectiveDate: TODAY,
          branchId,
          notes: null,
          links: [],
        },
      });
      expect(res.statusCode, res.body).toBe(201);
      return readTx(JSON.parse(res.body).transaction.id);
    };

    for (const [method, expected] of [
      ["cash", "efectivo"],
      ["transfer", "banco"],
      ["card", "banco"],
    ] as const) {
      const row = await post(method);
      expect(row.paymentMethod).toBe(method);
      expect(row.cashRegisterId).not.toBeNull();
      const type = await cajaTypeOf(row.cashRegisterId as number);
      expect(type).toBe(expected);
      expect(isMethodAllowedForAccount(method, type)).toBe(true);
    }
  });

  it("POST /transactions con paymentMethod cheque → 400 (el schema de cobros no lo admite)", async () => {
    const res = await app.inject({
      method: "POST",
      url: `${FIN}/transactions`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        memberId,
        kind: "advance_payment",
        direction: "inflow",
        amount: 700,
        currency: "ARS",
        paymentMethod: "cheque",
        transactionDate: TODAY,
        effectiveDate: TODAY,
        branchId,
        notes: null,
        links: [],
      },
    });
    expect(res.statusCode).toBe(400);
  });
});

// ─── validate con caja elegida (T-208-08) ─────────────────────────────────────
describe("validate con caja elegida respeta la regla medio-cuenta", () => {
  it("cobro transfer pendiente: caja efectivo → 400 y sigue pendiente; banco → 200", async () => {
    const id = await pendingCobro("transfer");

    const bad = await postValidate(id, efectivoSedeId);
    expect(bad.statusCode, bad.body).toBe(400);
    expect((await readTx(id)).validationStatus).toBe("pendiente");

    const ok = await postValidate(id, bancoId);
    expect(ok.statusCode, ok.body).toBe(200);
    const row = await readTx(id);
    expect(row.validationStatus).toBe("validado");
    expect(row.cashRegisterId).toBe(bancoId);
  });

  it("cobro cash pendiente: caja banco → 400 y sigue pendiente; Central (efectivo sin sede) → 200", async () => {
    const id = await pendingCobro("cash");

    const bad = await postValidate(id, bancoId);
    expect(bad.statusCode, bad.body).toBe(400);
    expect((await readTx(id)).validationStatus).toBe("pendiente");

    const ok = await postValidate(id, centralId);
    expect(ok.statusCode, ok.body).toBe(200);
    const row = await readTx(id);
    expect(row.validationStatus).toBe("validado");
    expect(row.cashRegisterId).toBe(centralId);
  });

  it("sin cashRegisterId no se valida nada nuevo (conserva la caja sugerida)", async () => {
    const id = await pendingCobro("cash");
    const before = await readTx(id);
    const res = await app.inject({
      method: "POST",
      url: `${FIN}/transactions/${id}/validate`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {},
    });
    expect(res.statusCode, res.body).toBe(200);
    const after = await readTx(id);
    expect(after.validationStatus).toBe("validado");
    expect(after.cashRegisterId).toBe(before.cashRegisterId);
  });
});

// ─── registerExpense con medio (nivel service, T-208-09) ──────────────────────
describe("registerExpense aplica la regla medio-cuenta", () => {
  it("transfer desde una caja de efectivo → BadRequestError y no escribe nada", async () => {
    const caja = await newCaja("efectivo", { branchId, opening: 1000 });
    await expect(
      movementService.registerExpense(
        TEMPLO_CTX,
        { cajaId: caja, amount: 100, costCenterId, paymentMethod: "transfer" },
        adminId,
      ),
    ).rejects.toBeInstanceOf(BadRequestError);
    expect(await firme(caja)).toBe(1000);
  });

  it("cheque desde una caja de efectivo → BadRequestError", async () => {
    const caja = await newCaja("efectivo", { branchId, opening: 1000 });
    await expect(
      movementService.registerExpense(
        TEMPLO_CTX,
        { cajaId: caja, amount: 100, costCenterId, paymentMethod: "cheque" },
        adminId,
      ),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it("cash desde una cuenta banco → BadRequestError", async () => {
    const banco = await newCaja("banco", { opening: 1000 });
    await expect(
      movementService.registerExpense(
        TEMPLO_CTX,
        { cajaId: banco, amount: 100, costCenterId, paymentMethod: "cash" },
        adminId,
      ),
    ).rejects.toBeInstanceOf(BadRequestError);
    expect(await firme(banco)).toBe(1000);
  });

  it("cheque desde banco → ok, queda payment_method cheque y el saldo baja exacto", async () => {
    const banco = await newCaja("banco", { opening: 1000.5 });
    const { expenseTxId } = await movementService.registerExpense(
      TEMPLO_CTX,
      { cajaId: banco, amount: 250.25, costCenterId, paymentMethod: "cheque" },
      adminId,
    );
    const row = await readTx(expenseTxId);
    expect(row.paymentMethod).toBe("cheque");
    expect(row.cashRegisterId).toBe(banco);
    expect(await firme(banco)).toBe(750.25);
  });

  it("cash desde efectivo → ok, queda payment_method cash", async () => {
    const caja = await newCaja("efectivo", { branchId, opening: 1000 });
    const { expenseTxId } = await movementService.registerExpense(
      TEMPLO_CTX,
      { cajaId: caja, amount: 100, costCenterId, paymentMethod: "cash" },
      adminId,
    );
    expect((await readTx(expenseTxId)).paymentMethod).toBe("cash");
    expect(await firme(caja)).toBe(900);
  });

  it("POST /expenses (ruta) sigue guardando payment_method internal", async () => {
    const caja = await newCaja("efectivo", { branchId, opening: 1000 });
    const res = await app.inject({
      method: "POST",
      url: `${FIN}/expenses`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { cajaId: caja, amount: 100, costCenterId },
    });
    expect(res.statusCode, res.body).toBe(201);
    const body = JSON.parse(res.body) as {
      expense?: { expenseTxId: number };
      expenseTxId?: number;
    };
    const txId = body.expense?.expenseTxId ?? body.expenseTxId;
    expect(txId).toBeGreaterThan(0);
    expect((await readTx(txId as number)).paymentMethod).toBe("internal");
  });

  it("la ruta ignora un paymentMethod en el body (no lo expone en la 208)", async () => {
    const banco = await newCaja("banco", { opening: 1000 });
    const res = await app.inject({
      method: "POST",
      url: `${FIN}/expenses`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        cajaId: banco,
        amount: 100,
        costCenterId,
        paymentMethod: "cash",
      },
    });
    // Ajv recorta el campo extra: el egreso se graba como internal, no se rechaza.
    expect(res.statusCode, res.body).toBe(201);
    const body = JSON.parse(res.body) as {
      expense?: { expenseTxId: number };
      expenseTxId?: number;
    };
    const txId = (body.expense?.expenseTxId ?? body.expenseTxId) as number;
    expect((await readTx(txId)).paymentMethod).toBe("internal");
  });
});

// ─── traslados (patas internal) ──────────────────────────────────────────────
describe("traslados entre cuentas de distinto tipo", () => {
  it("POST /movements efectivo → banco sigue funcionando (patas internal)", async () => {
    const origen = await newCaja("efectivo", { branchId, opening: 1000 });
    const destino = await newCaja("banco", { opening: 0 });
    const res = await app.inject({
      method: "POST",
      url: `${FIN}/movements`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { origenCajaId: origen, destinoCajaId: destino, amount: 300.5 },
    });
    expect(res.statusCode, res.body).toBe(201);
    expect(await firme(origen)).toBe(699.5);
    expect(await firme(destino)).toBe(300.5);
  });
});

// ─── resolver ────────────────────────────────────────────────────────────────
describe("resolveCashRegister", () => {
  it("cheque se resuelve a una caja banco de la moneda (igual que transfer)", async () => {
    const cheque = await cashRegisterService.resolveCashRegister(
      TEMPLO_CTX,
      "cheque",
      null,
      "ARS",
    );
    expect(cheque).not.toBeNull();
    expect(await cajaTypeOf(cheque as number)).toBe("banco");
    const transfer = await cashRegisterService.resolveCashRegister(
      TEMPLO_CTX,
      "transfer",
      null,
      "ARS",
    );
    expect(cheque).toBe(transfer);
  });
});
