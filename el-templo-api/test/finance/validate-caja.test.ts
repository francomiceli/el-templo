/**
 * Phase 146-02 — validate(cashRegisterId) + sin_plan guard + primitivos plan 03.
 *
 * Cubre:
 *   CAJA-02/CAJA-03 — validate() acepta y persiste cashRegisterId con guards de
 *     coherencia (existe/activa/misma moneda); sin cashRegisterId conserva la caja
 *     sugerida (retrocompatible). Gestion puede imputar a una cuenta banco concreta
 *     (Galicia / Mercado Pago, seedeadas por la migracion 0160).
 *   COBRO-05 — validar un cobro miscReason='sin_plan' es rechazado server-side.
 *   Primitivos plan 03 — voidInTx(tx, ...) tx-aware + listPendingMiscForMember +
 *     endpoint GET /transactions/pending-misc/:memberId (RBAC FINANCE_VOID_ROLES).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { sql, eq, and } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  createTestApp,
  createStaffUser,
  getAuthToken,
  registerUser,
} from "../helpers";
import { TransactionService } from "../../src/modules/finance/transaction-service";
import { BalanceService } from "../../src/modules/finance/balance-service";
import { CashRegisterService } from "../../src/modules/finance/cash-register-service";
import { SubscriptionService } from "../../src/modules/subscriptions/service";
import { AuraService } from "../../src/modules/aura/service";
import { EnrollmentService } from "../../src/modules/programs/enrollment-service";
import { BadRequestError } from "../../src/modules/shared/errors";
import * as schema from "../../src/db/schema";

const FINANCE_URL = "/api/admin/finance";
const TODAY = "2026-04-28";

let app: FastifyInstance;
let txService: TransactionService;
let adminId: number;
let branchId: number;
let memberId: number;
let planId: number;
let subscriptionId: number;

let adminToken: string;
let recepcionToken: string;

// Caja ids resolved from the seed (migration 0160 + 0154 + test setup).
let galiciaCajaId: number;
let bancoEurCajaId: number;
let inactiveCajaId: number;

async function seedSubscription(): Promise<number> {
  const [res] = await app.db
    .insert(schema.subscriptions)
    .values({
      userId: memberId,
      planId,
      branchId,
      status: "active",
      startDate: TODAY,
      pricePaid: 100000,
      currency: "ARS",
      priceTypeApplied: "regular",
    })
    .$returningId();
  return res.id;
}

/** A pendiente transfer charge linked to the seeded subscription. */
function transferInput(overrides: Record<string, unknown> = {}) {
  return {
    memberId,
    kind: "plan_charge" as const,
    direction: "inflow" as const,
    amount: 1000,
    currency: "ARS",
    paymentMethod: "transfer" as const,
    transactionDate: TODAY,
    effectiveDate: TODAY,
    branchId,
    notes: null,
    validationStatus: "pendiente" as const,
    links: [
      {
        targetKind: "subscription" as const,
        targetId: subscriptionId,
        allocatedAmount: 1000,
      },
    ],
    ...overrides,
  };
}

/** A pendiente cobro suelto (advance_payment) with a configurable miscReason. */
function miscInput(overrides: Record<string, unknown> = {}) {
  return {
    memberId,
    kind: "advance_payment" as const,
    direction: "inflow" as const,
    amount: 500,
    currency: "ARS",
    paymentMethod: "cash" as const,
    transactionDate: TODAY,
    effectiveDate: TODAY,
    branchId,
    notes: null,
    validationStatus: "pendiente" as const,
    links: [],
    ...overrides,
  };
}

async function readTx(id: number): Promise<{
  validationStatus: string;
  cashRegisterId: number | null;
  voidedAt: Date | null;
}> {
  const [row] = await app.db
    .select({
      validationStatus: schema.financialTransactions.validationStatus,
      cashRegisterId: schema.financialTransactions.cashRegisterId,
      voidedAt: schema.financialTransactions.voidedAt,
    })
    .from(schema.financialTransactions)
    .where(eq(schema.financialTransactions.id, id))
    .limit(1);
  return row;
}

beforeAll(async () => {
  app = await createTestApp();
  const balanceService = new BalanceService(app.db, app.log);
  txService = new TransactionService(
    app.db,
    app.log,
    balanceService,
    new CashRegisterService(app.db, app.log),
  );
  const auraService = new AuraService(app.db);
  const enrollmentService = new EnrollmentService(app.db, app.log);
  const subService = new SubscriptionService(
    app.db,
    app.log,
    auraService,
    txService,
    enrollmentService,
  );
  txService.setSubscriptionCanceller(subService);

  const [admin] = await app.db
    .select({ id: schema.users.id, branchId: schema.users.branchId })
    .from(schema.users)
    .where(eq(schema.users.email, "admin@test.com"))
    .limit(1);
  adminId = admin.id;
  branchId = admin.branchId ?? 1;
  adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");

  // recepcion passes the module-level FINANCE_READ guard but must be 403'd by the
  // per-handler FINANCE_VOID gate on pending-misc (LOW 2 — datos financieros).
  await createStaffUser(app, {
    email: "recep-caja@test.local",
    password: "pass123456",
    firstName: "Recep",
    lastName: "Caja",
    role: "recepcion",
    branchId,
  });
  recepcionToken = await getAuthToken(
    app,
    "recep-caja@test.local",
    "pass123456",
  );

  const member = await registerUser(app, {
    email: `caja-member-${Date.now()}@test.local`,
    password: "TestPass123!",
    firstName: "Caja",
    lastName: "Member",
    branchId,
  });
  memberId = (member.user as { id: number }).id;

  const [planRes] = await app.db
    .insert(schema.subscriptionPlans)
    .values({
      name: "Caja Test Plan",
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
  planId = planRes.id;

  // Galicia (banco ARS, migration 0160) — gestion la elige para imputar.
  const [galicia] = await app.db
    .select({ id: schema.cashRegisters.id })
    .from(schema.cashRegisters)
    .where(eq(schema.cashRegisters.name, "Galicia"))
    .limit(1);
  galiciaCajaId = galicia.id;

  // Banco EUR (otra moneda) — para el guard de moneda inconsistente.
  const [bancoEur] = await app.db
    .select({ id: schema.cashRegisters.id })
    .from(schema.cashRegisters)
    .where(
      and(
        eq(schema.cashRegisters.type, "banco"),
        eq(schema.cashRegisters.currency, "EUR"),
      ),
    )
    .limit(1);
  bancoEurCajaId = bancoEur.id;

  // Una caja banco ARS INACTIVA — para el guard de caja inactiva.
  const [inactive] = await app.db
    .insert(schema.cashRegisters)
    .values({
      name: "Banco ARS Inactiva (test)",
      type: "banco",
      branchId: null,
      currency: "ARS",
      openingBalance: 0,
      cutoffDate: "2020-01-01",
      isActive: false,
    })
    .$returningId();
  inactiveCajaId = inactive.id;
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await app.db.execute(sql`DELETE FROM transaction_links`);
  await app.db.execute(sql`DELETE FROM financial_transactions`);
  await app.db.execute(sql`DELETE FROM balances`);
  await app.db.execute(sql`DELETE FROM audit_log`);
  subscriptionId = await seedSubscription();
});

describe("validate() con caja + guards (CAJA-02/CAJA-03 + COBRO-05)", () => {
  it("imputa la caja banco elegida (Galicia) y pasa a validado", async () => {
    const tx = await txService.create(transferInput(), adminId);
    const result = await txService.validate(tx.id, adminId, galiciaCajaId);
    expect(result.validationStatus).toBe("validado");
    expect(result.cashRegisterId).toBe(galiciaCajaId);
    const row = await readTx(tx.id);
    expect(row.validationStatus).toBe("validado");
    expect(row.cashRegisterId).toBe(galiciaCajaId);
  });

  it("sin cashRegisterId conserva la caja sugerida y pasa a validado", async () => {
    // create() resuelve la caja sugerida (banco ARS) server-side.
    const tx = await txService.create(transferInput(), adminId);
    expect(tx.cashRegisterId).not.toBeNull();
    const suggested = tx.cashRegisterId;

    const result = await txService.validate(tx.id, adminId);
    expect(result.validationStatus).toBe("validado");
    expect(result.cashRegisterId).toBe(suggested);
  });

  it("rechaza una caja inexistente (400)", async () => {
    const tx = await txService.create(transferInput(), adminId);
    await expect(txService.validate(tx.id, adminId, 999999)).rejects.toThrow(
      BadRequestError,
    );
    // La fila sigue pendiente (la tx hizo rollback).
    expect((await readTx(tx.id)).validationStatus).toBe("pendiente");
  });

  it("rechaza una caja inactiva (400)", async () => {
    const tx = await txService.create(transferInput(), adminId);
    await expect(
      txService.validate(tx.id, adminId, inactiveCajaId),
    ).rejects.toThrow(BadRequestError);
  });

  it("rechaza una caja de otra moneda (400)", async () => {
    const tx = await txService.create(transferInput(), adminId);
    await expect(
      txService.validate(tx.id, adminId, bancoEurCajaId),
    ).rejects.toThrow(BadRequestError);
  });

  it("COBRO-05: rechaza validar un cobro miscReason='sin_plan' (400)", async () => {
    const tx = await txService.create(
      miscInput({ miscReason: "sin_plan" }),
      adminId,
    );
    await expect(txService.validate(tx.id, adminId)).rejects.toThrow(
      BadRequestError,
    );
    expect((await readTx(tx.id)).validationStatus).toBe("pendiente");
  });

  it("permite validar un cobro misc con miscReason='otro'", async () => {
    const tx = await txService.create(
      miscInput({ miscReason: "otro" }),
      adminId,
    );
    const result = await txService.validate(tx.id, adminId);
    expect(result.validationStatus).toBe("validado");
  });

  it("admin valida con cashRegisterId sobre REST → 200 + validado + caja imputada", async () => {
    const tx = await txService.create(transferInput(), adminId);
    const res = await app.inject({
      method: "POST",
      url: `${FINANCE_URL}/transactions/${tx.id}/validate`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { cashRegisterId: galiciaCajaId },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().transaction.validationStatus).toBe("validado");
    expect(res.json().transaction.cashRegisterId).toBe(galiciaCajaId);
  });
});

describe("primitivos plan 03: voidInTx + listPendingMiscForMember", () => {
  it("listPendingMiscForMember devuelve solo advance_payment pendientes no anulados del socio", async () => {
    // 2 cobros sueltos pendientes del socio.
    const a = await txService.create(
      miscInput({ amount: 300, miscReason: "sin_plan" }),
      adminId,
    );
    await txService.create(
      miscInput({ amount: 700, miscReason: "otro" }),
      adminId,
    );
    // Un advance_payment YA validado (no debe aparecer).
    await txService.create(
      miscInput({ amount: 900, validationStatus: "validado" }),
      adminId,
    );
    // Un plan_charge pendiente (no es advance_payment → no debe aparecer).
    await txService.create(transferInput(), adminId);
    // Un advance_payment pendiente ANULADO (no debe aparecer).
    await txService.void(a.id, adminId, { reason: "anular" });

    const items = await txService.listPendingMiscForMember(memberId);
    expect(items).toHaveLength(1);
    expect(items[0].amount).toBe(700);
    expect(items[0].miscReason).toBe("otro");
    expect(items[0].currency).toBe("ARS");
  });

  it("voidInTx anula la fila dentro de la tx del caller y revierte el balance", async () => {
    // Saldo del socio: debe 1000 por la subscripcion.
    await app.db.insert(schema.balances).values({
      memberId,
      targetKind: "subscription",
      targetId: subscriptionId,
      currency: "ARS",
      amount: 1000,
    });
    // Cobro que salda la deuda (balance → 0).
    const tx = await txService.create(transferInput({ amount: 1000 }), adminId);
    const [bAfterPay] = await app.db
      .select({ amount: schema.balances.amount })
      .from(schema.balances)
      .where(
        and(
          eq(schema.balances.targetKind, "subscription"),
          eq(schema.balances.targetId, subscriptionId),
        ),
      );
    expect(bAfterPay.amount).toBe(0);

    // voidInTx dentro de una db.transaction del caller (no abre tx propia).
    await app.db.transaction(async (trx) => {
      await txService.voidInTx(trx, tx.id, adminId, { reason: "anular en tx" });
    });

    expect((await readTx(tx.id)).voidedAt).not.toBeNull();
    // El balance vuelve a 1000 (se revirtio el efecto del cobro).
    const [bAfterVoid] = await app.db
      .select({ amount: schema.balances.amount })
      .from(schema.balances)
      .where(
        and(
          eq(schema.balances.targetKind, "subscription"),
          eq(schema.balances.targetId, subscriptionId),
        ),
      );
    expect(bAfterVoid.amount).toBe(1000);
  });
});

describe("GET /transactions/pending-misc/:memberId", () => {
  it("admin → 200 con los cobros sueltos pendientes del socio", async () => {
    await txService.create(
      miscInput({ amount: 400, miscReason: "sin_plan" }),
      adminId,
    );
    const res = await app.inject({
      method: "GET",
      url: `${FINANCE_URL}/transactions/pending-misc/${memberId}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const items = res.json().items;
    expect(Array.isArray(items)).toBe(true);
    expect(items).toHaveLength(1);
    expect(items[0].amount).toBe(400);
    expect(items[0].miscReason).toBe("sin_plan");
  });

  it("recepcion (sin permiso de validacion/gestion) → 403", async () => {
    const res = await app.inject({
      method: "GET",
      url: `${FINANCE_URL}/transactions/pending-misc/${memberId}`,
      headers: { authorization: `Bearer ${recepcionToken}` },
    });
    expect(res.statusCode).toBe(403);
  });
});
