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
import { TENANT_TEMPLO } from "../fixtures/second-tenant";
import { tenantValues, tenantWhere } from "../../src/modules/shared/tenant";

/**
 * Fase 172 (ADO-01 / T-172-08-04): gimnasio de los call sites DIRECTOS al
 * service. Sale del fixture, nunca de un `1` a mano. Una sola constante y no
 * el objeto literal repetido en cada llamada: el dia que un caso ejercite
 * dos gimnasios, el segundo se agrega al lado y se ve la diferencia.
 *
 * Fase 172 (172-13): el mismo ctx filtra y estampa las queries DIRECTAS. Ojo
 * con los tres `sql` crudos del `beforeEach`: en SQL a mano el gimnasio va
 * escrito en el predicado (`WHERE tenant_id = ${TENANT_TEMPLO}`), que es la
 * convencion de `shared/tenant.ts` y lo que el sentinel busca en el texto.
 */
const TEMPLO_CTX = { tenantId: TENANT_TEMPLO };

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
let adminName: string;

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
  validatedBy: number | null;
  validatedAt: Date | null;
}> {
  const [row] = await app.db
    .select({
      validationStatus: schema.financialTransactions.validationStatus,
      cashRegisterId: schema.financialTransactions.cashRegisterId,
      voidedAt: schema.financialTransactions.voidedAt,
      validatedBy: schema.financialTransactions.validatedBy,
      validatedAt: schema.financialTransactions.validatedAt,
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

/** Fetch a single row from GET /transactions by id (Historial de cobros). */
async function listRowById(id: number): Promise<{
  id: number;
  validationStatus: string;
  validatedAt: string | null;
  validatorName: string | null;
} | null> {
  const res = await app.inject({
    method: "GET",
    url: `${FINANCE_URL}/transactions?memberId=${memberId}&limit=200`,
    headers: { authorization: `Bearer ${adminToken}` },
  });
  const rows = res.json().rows as Array<{
    id: number;
    validationStatus: string;
    validatedAt: string | null;
    validatorName: string | null;
  }>;
  return rows.find((r) => r.id === id) ?? null;
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
    .select({
      id: schema.users.id,
      branchId: schema.users.branchId,
      firstName: schema.users.firstName,
      lastName: schema.users.lastName,
    })
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
  adminName = `${admin.firstName ?? ""} ${admin.lastName ?? ""}`.trim();
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
    .where(
      and(
        tenantWhere(schema.cashRegisters, TEMPLO_CTX),
        eq(schema.cashRegisters.name, "Galicia"),
      ),
    )
    .limit(1);
  galiciaCajaId = galicia.id;

  // Banco EUR (otra moneda) — para el guard de moneda inconsistente.
  const [bancoEur] = await app.db
    .select({ id: schema.cashRegisters.id })
    .from(schema.cashRegisters)
    .where(
      and(
        tenantWhere(schema.cashRegisters, TEMPLO_CTX),
        eq(schema.cashRegisters.type, "banco"),
        eq(schema.cashRegisters.currency, "EUR"),
      ),
    )
    .limit(1);
  bancoEurCajaId = bancoEur.id;

  // Una caja banco ARS INACTIVA — para el guard de caja inactiva.
  const [inactive] = await app.db
    .insert(schema.cashRegisters)
    .values(
      tenantValues(TEMPLO_CTX, {
        name: "Banco ARS Inactiva (test)",
        type: "banco",
        branchId: null,
        currency: "ARS",
        openingBalance: 0,
        cutoffDate: "2020-01-01",
        isActive: false,
      }),
    )
    .$returningId();
  inactiveCajaId = inactive.id;
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  // El gimnasio va ESCRITO en el predicado: es la convencion de `sql` crudo de
  // `shared/tenant.ts` y es lo que el sentinel busca en el texto del statement.
  // Acotar el borrado a El Templo ademas es mas seguro que el DELETE global que
  // habia antes: este archivo no siembra en otro gimnasio, y si algun dia un
  // fixture lo hiciera, este beforeEach ya no se lo llevaria puesto.
  await app.db.execute(
    sql`DELETE FROM transaction_links WHERE tenant_id = ${TENANT_TEMPLO}`,
  );
  await app.db.execute(
    sql`DELETE FROM financial_transactions WHERE tenant_id = ${TENANT_TEMPLO}`,
  );
  await app.db.execute(
    sql`DELETE FROM balances WHERE tenant_id = ${TENANT_TEMPLO}`,
  );
  await app.db.execute(
    sql`DELETE FROM audit_log WHERE tenant_id = ${TEMPLO_CTX.tenantId}`,
  );
  subscriptionId = await seedSubscription();
});

describe("validate() con caja + guards (CAJA-02/CAJA-03 + COBRO-05)", () => {
  it("imputa la caja banco elegida (Galicia) y pasa a validado", async () => {
    const tx = await txService.create(TEMPLO_CTX, transferInput(), adminId);
    const result = await txService.validate(
      TEMPLO_CTX,
      tx.id,
      adminId,
      galiciaCajaId,
    );
    expect(result.validationStatus).toBe("validado");
    expect(result.cashRegisterId).toBe(galiciaCajaId);
    const row = await readTx(tx.id);
    expect(row.validationStatus).toBe("validado");
    expect(row.cashRegisterId).toBe(galiciaCajaId);
  });

  it("sin cashRegisterId conserva la caja sugerida y pasa a validado", async () => {
    // create() resuelve la caja sugerida (banco ARS) server-side.
    const tx = await txService.create(TEMPLO_CTX, transferInput(), adminId);
    expect(tx.cashRegisterId).not.toBeNull();
    const suggested = tx.cashRegisterId;

    const result = await txService.validate(TEMPLO_CTX, tx.id, adminId);
    expect(result.validationStatus).toBe("validado");
    expect(result.cashRegisterId).toBe(suggested);
  });

  it("rechaza una caja inexistente (400)", async () => {
    const tx = await txService.create(TEMPLO_CTX, transferInput(), adminId);
    await expect(
      txService.validate(TEMPLO_CTX, tx.id, adminId, 999999),
    ).rejects.toThrow(BadRequestError);
    // La fila sigue pendiente (la tx hizo rollback).
    expect((await readTx(tx.id)).validationStatus).toBe("pendiente");
  });

  it("rechaza una caja inactiva (400)", async () => {
    const tx = await txService.create(TEMPLO_CTX, transferInput(), adminId);
    await expect(
      txService.validate(TEMPLO_CTX, tx.id, adminId, inactiveCajaId),
    ).rejects.toThrow(BadRequestError);
  });

  it("rechaza una caja de otra moneda (400)", async () => {
    const tx = await txService.create(TEMPLO_CTX, transferInput(), adminId);
    await expect(
      txService.validate(TEMPLO_CTX, tx.id, adminId, bancoEurCajaId),
    ).rejects.toThrow(BadRequestError);
  });

  it("COBRO-05: rechaza validar un cobro miscReason='sin_plan' (400)", async () => {
    const tx = await txService.create(
      TEMPLO_CTX,
      miscInput({ miscReason: "sin_plan" }),
      adminId,
    );
    await expect(
      txService.validate(TEMPLO_CTX, tx.id, adminId),
    ).rejects.toThrow(BadRequestError);
    expect((await readTx(tx.id)).validationStatus).toBe("pendiente");
  });

  it("permite validar un cobro misc con miscReason='otro'", async () => {
    const tx = await txService.create(
      TEMPLO_CTX,
      miscInput({ miscReason: "otro" }),
      adminId,
    );
    const result = await txService.validate(TEMPLO_CTX, tx.id, adminId);
    expect(result.validationStatus).toBe("validado");
  });

  it("admin valida con cashRegisterId sobre REST → 200 + validado + caja imputada", async () => {
    const tx = await txService.create(TEMPLO_CTX, transferInput(), adminId);
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

describe("validador denormalizado + filtro por estado (152-03: CAJA-02/D-05/D-06)", () => {
  it("validate() setea validated_by=admin y validated_at no-null (D-05)", async () => {
    const tx = await txService.create(TEMPLO_CTX, transferInput(), adminId);
    // Antes de validar: columnas del validador en NULL.
    const before = await readTx(tx.id);
    expect(before.validatedBy).toBeNull();
    expect(before.validatedAt).toBeNull();

    await txService.validate(TEMPLO_CTX, tx.id, adminId, galiciaCajaId);

    const after = await readTx(tx.id);
    expect(after.validationStatus).toBe("validado");
    expect(after.validatedBy).toBe(adminId);
    expect(after.validatedAt).not.toBeNull();
  });

  it("el listado expone validatorName con el nombre del validador tras validar", async () => {
    const tx = await txService.create(TEMPLO_CTX, transferInput(), adminId);
    await txService.validate(TEMPLO_CTX, tx.id, adminId, galiciaCajaId);

    const row = await listRowById(tx.id);
    expect(row).not.toBeNull();
    expect(row?.validationStatus).toBe("validado");
    expect(row?.validatedAt).not.toBeNull();
    expect(row?.validatorName).toBe(adminName);
  });

  it("D-06: un cobro nacido validado (admin-load) queda con validated_by/at NULL y sin validatorName", async () => {
    // Carga admin: nace validationStatus='validado' sin pasar por validate().
    const tx = await txService.create(
      TEMPLO_CTX,
      transferInput({ validationStatus: "validado" }),
      adminId,
    );
    const row = await readTx(tx.id);
    expect(row.validationStatus).toBe("validado");
    expect(row.validatedBy).toBeNull();
    expect(row.validatedAt).toBeNull();

    const listed = await listRowById(tx.id);
    expect(listed?.validationStatus).toBe("validado");
    expect(listed?.validatedAt).toBeNull();
    expect(listed?.validatorName).toBeNull();
  });

  it("D-06: un cobro corregido (anular+recrear) nace validado con columnas del validador NULL", async () => {
    // Original nacido validado; correct() lo anula (corregido) y recrea uno nuevo.
    const original = await txService.create(
      TEMPLO_CTX,
      transferInput({ validationStatus: "validado" }),
      adminId,
    );
    const corrected = await txService.correct(
      TEMPLO_CTX,
      original.id,
      { amount: 1500 },
      adminId,
    );

    // El original quedo 'corregido' + anulado, columnas del validador intactas (NULL).
    const originalRow = await readTx(original.id);
    expect(originalRow.validationStatus).toBe("corregido");
    expect(originalRow.voidedAt).not.toBeNull();
    expect(originalRow.validatedBy).toBeNull();

    // La fila NUEVA nace validada pero SIN validador (D-06).
    const newRow = await readTx(corrected.id);
    expect(newRow.validationStatus).toBe("validado");
    expect(newRow.validatedBy).toBeNull();
    expect(newRow.validatedAt).toBeNull();
  });

  it("GET /transactions?validationStatus=pendiente|validado filtra server-side por estado", async () => {
    // Un pendiente (transfer sin validar) + uno validado (admin-load).
    const pendiente = await txService.create(
      TEMPLO_CTX,
      transferInput(),
      adminId,
    );
    const validado = await txService.create(
      TEMPLO_CTX,
      transferInput({ validationStatus: "validado" }),
      adminId,
    );

    const pendRes = await app.inject({
      method: "GET",
      url: `${FINANCE_URL}/transactions?memberId=${memberId}&validationStatus=pendiente&limit=200`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(pendRes.statusCode).toBe(200);
    const pendRows = pendRes.json().rows as Array<{
      id: number;
      validationStatus: string;
    }>;
    expect(pendRows.every((r) => r.validationStatus === "pendiente")).toBe(
      true,
    );
    expect(pendRows.some((r) => r.id === pendiente.id)).toBe(true);
    expect(pendRows.some((r) => r.id === validado.id)).toBe(false);

    const valRes = await app.inject({
      method: "GET",
      url: `${FINANCE_URL}/transactions?memberId=${memberId}&validationStatus=validado&limit=200`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(valRes.statusCode).toBe(200);
    const valRows = valRes.json().rows as Array<{
      id: number;
      validationStatus: string;
    }>;
    expect(valRows.every((r) => r.validationStatus === "validado")).toBe(true);
    expect(valRows.some((r) => r.id === validado.id)).toBe(true);
    expect(valRows.some((r) => r.id === pendiente.id)).toBe(false);
  });

  it("un validationStatus fuera del enum → 400 (T-152-05)", async () => {
    const res = await app.inject({
      method: "GET",
      url: `${FINANCE_URL}/transactions?validationStatus=corregido`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("primitivos plan 03: voidInTx + listPendingMiscForMember", () => {
  it("listPendingMiscForMember devuelve solo advance_payment pendientes no anulados del socio", async () => {
    // 2 cobros sueltos pendientes del socio.
    const a = await txService.create(
      TEMPLO_CTX,
      miscInput({ amount: 300, miscReason: "sin_plan" }),
      adminId,
    );
    await txService.create(
      TEMPLO_CTX,
      miscInput({ amount: 700, miscReason: "otro" }),
      adminId,
    );
    // Un advance_payment YA validado (no debe aparecer).
    await txService.create(
      TEMPLO_CTX,
      miscInput({ amount: 900, validationStatus: "validado" }),
      adminId,
    );
    // Un plan_charge pendiente (no es advance_payment → no debe aparecer).
    await txService.create(TEMPLO_CTX, transferInput(), adminId);
    // Un advance_payment pendiente ANULADO (no debe aparecer).
    await txService.void(TEMPLO_CTX, a.id, adminId, { reason: "anular" });

    const items = await txService.listPendingMiscForMember(
      TEMPLO_CTX,
      memberId,
    );
    expect(items).toHaveLength(1);
    expect(items[0].amount).toBe(700);
    expect(items[0].miscReason).toBe("otro");
    expect(items[0].currency).toBe("ARS");
  });

  it("voidInTx anula la fila dentro de la tx del caller y revierte el balance", async () => {
    // Saldo del socio: debe 1000 por la subscripcion.
    await app.db.insert(schema.balances).values(
      tenantValues(TEMPLO_CTX, {
        memberId,
        targetKind: "subscription",
        targetId: subscriptionId,
        currency: "ARS",
        amount: 1000,
      }),
    );
    // Cobro que salda la deuda (balance → 0).
    const tx = await txService.create(
      TEMPLO_CTX,
      transferInput({ amount: 1000 }),
      adminId,
    );
    const [bAfterPay] = await app.db
      .select({ amount: schema.balances.amount })
      .from(schema.balances)
      .where(
        and(
          tenantWhere(schema.balances, TEMPLO_CTX),
          eq(schema.balances.targetKind, "subscription"),
          eq(schema.balances.targetId, subscriptionId),
        ),
      );
    expect(bAfterPay.amount).toBe(0);

    // voidInTx dentro de una db.transaction del caller (no abre tx propia).
    await app.db.transaction(async (trx) => {
      await txService.voidInTx(TEMPLO_CTX, trx, tx.id, adminId, {
        reason: "anular en tx",
      });
    });

    expect((await readTx(tx.id)).voidedAt).not.toBeNull();
    // El balance vuelve a 1000 (se revirtio el efecto del cobro).
    const [bAfterVoid] = await app.db
      .select({ amount: schema.balances.amount })
      .from(schema.balances)
      .where(
        and(
          tenantWhere(schema.balances, TEMPLO_CTX),
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
      TEMPLO_CTX,
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
