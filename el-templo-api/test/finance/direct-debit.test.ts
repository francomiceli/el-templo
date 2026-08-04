/**
 * Domiciliación bancaria (SEPA) como método de pago — 'direct_debit'.
 *
 * Barcelona cobra por domiciliación desde el export SEPA (migración 0171), pero
 * hasta la 0197 el enum `payment_method` no tenía el valor y el staff los cargaba
 * como 'transfer', mezclándolos con las transferencias manuales en Caja, en
 * Analytics y en el reporte de cobros.
 *
 * Lo que se cubre acá:
 *   - el gate de país: 'direct_debit' SOLO en sedes country='ES' (400 en AR)
 *   - la caja destino: banco de la moneda, nunca la caja efectivo de la sede
 *   - el rechazo del banco: se resuelve anulando (voidedAt), sin estado propio
 *   - el breakdown por método: el domiciliado NO desaparece del summary (el
 *     `continue` de analytics/service.ts descartaba en silencio todo método
 *     fuera de cash/transfer/card)
 *
 * Corre contra el MySQL de test por worker (eltemplo_test_<POOL_ID>), mismo
 * andamiaje que cash-register-service.test.ts.
 */

import { describe, it, beforeAll, afterAll, expect } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq, inArray, and } from "drizzle-orm";
import { createTestApp, registerUser } from "../helpers";
import * as schema from "../../src/db/schema";
import { CashRegisterService } from "../../src/modules/finance/cash-register-service";
import { TransactionService } from "../../src/modules/finance/transaction-service";
import { BalanceService } from "../../src/modules/finance/balance-service";
import { TENANT_TEMPLO } from "../fixtures/second-tenant";
import { tenantValues, tenantWhere } from "../../src/modules/shared/tenant";

const TEMPLO_CTX = { tenantId: TENANT_TEMPLO };

let app: FastifyInstance;
let cashRegisterService: CashRegisterService;
let txService: TransactionService;
let adminId: number;
let esMemberId: number;
let arMemberId: number;

let esBranchId: number;
let arBranchId: number;
let bancoEurId: number;
const CUTOFF = "2026-01-01";
const seededCajaIds: number[] = [];

beforeAll(async () => {
  app = await createTestApp();
  cashRegisterService = new CashRegisterService(app.db, app.log);

  // El gate se decide por branches.country, así que las dos sedes tienen que
  // diferir EXACTAMENTE en eso — mismo tenant, misma forma, distinto país.
  const [esBranch] = await app.db.insert(schema.branches).values({
    name: "DD-Test Barcelona",
    code: `DDES${Date.now() % 100000}`,
    country: "ES",
  });
  esBranchId = Number(esBranch.insertId);

  const [arBranch] = await app.db.insert(schema.branches).values({
    name: "DD-Test Mar del Plata",
    code: `DDAR${Date.now() % 100000}`,
    country: "AR",
  });
  arBranchId = Number(arBranch.insertId);

  // Caja banco EUR (destino esperado de un domiciliado) + efectivo de la sede ES
  // (el destino que NO debe elegir) + banco ARS para el caso argentino.
  const bancoEur = await app.db.insert(schema.cashRegisters).values(
    tenantValues(TEMPLO_CTX, {
      name: "DD-Test banco EUR",
      type: "banco",
      branchId: null,
      currency: "EUR",
      cutoffDate: CUTOFF,
    }),
  );
  bancoEurId = Number(bancoEur[0].insertId);

  const efectivoEs = await app.db.insert(schema.cashRegisters).values(
    tenantValues(TEMPLO_CTX, {
      name: "DD-Test efectivo ES",
      type: "efectivo",
      branchId: esBranchId,
      currency: "EUR",
      cutoffDate: CUTOFF,
    }),
  );

  const bancoArs = await app.db.insert(schema.cashRegisters).values(
    tenantValues(TEMPLO_CTX, {
      name: "DD-Test banco ARS",
      type: "banco",
      branchId: null,
      currency: "ARS",
      cutoffDate: CUTOFF,
    }),
  );

  seededCajaIds.push(
    bancoEurId,
    Number(efectivoEs[0].insertId),
    Number(bancoArs[0].insertId),
  );

  const balanceService = new BalanceService(app.db, app.log);
  txService = new TransactionService(
    app.db,
    app.log,
    balanceService,
    cashRegisterService,
  );

  // El id del admin se resuelve por email: la base de CI no tiene el id 1.
  const [admin] = await app.db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, "admin@test.com"))
    .limit(1);
  if (!admin) {
    throw new Error(
      "Seeded admin@test.com user not found — check test/setup.ts",
    );
  }
  adminId = admin.id;

  const esMember = await registerUser(app, {
    email: `dd-es-${Date.now()}@test.local`,
    password: "TestPass123!",
    firstName: "Laura",
    lastName: "Barcelona",
    branchId: esBranchId,
  });
  esMemberId = (esMember.user as { id: number }).id;

  const arMember = await registerUser(app, {
    email: `dd-ar-${Date.now()}@test.local`,
    password: "TestPass123!",
    firstName: "Nacho",
    lastName: "Mogotes",
    branchId: arBranchId,
  });
  arMemberId = (arMember.user as { id: number }).id;
});

afterAll(async () => {
  for (const memberId of [esMemberId, arMemberId]) {
    if (!memberId) continue;
    await app.db
      .delete(schema.balances)
      .where(
        and(
          tenantWhere(schema.balances, TEMPLO_CTX),
          eq(schema.balances.memberId, memberId),
        ),
      );
    await app.db
      .delete(schema.financialTransactions)
      .where(
        and(
          tenantWhere(schema.financialTransactions, TEMPLO_CTX),
          eq(schema.financialTransactions.memberId, memberId),
        ),
      );
  }
  if (seededCajaIds.length > 0) {
    await app.db
      .delete(schema.financialTransactions)
      .where(
        and(
          tenantWhere(schema.financialTransactions, TEMPLO_CTX),
          inArray(schema.financialTransactions.cashRegisterId, seededCajaIds),
        ),
      );
    await app.db
      .delete(schema.cashRegisters)
      .where(
        and(
          tenantWhere(schema.cashRegisters, TEMPLO_CTX),
          inArray(schema.cashRegisters.id, seededCajaIds),
        ),
      );
  }
  await app.close();
});

/** Cobro domiciliado de referencia. `overrides` cambia lo que cada caso mide. */
function directDebitCharge(overrides: Record<string, unknown> = {}) {
  return {
    memberId: esMemberId,
    kind: "adjustment" as const,
    direction: "inflow" as const,
    amount: 5000,
    currency: "EUR",
    paymentMethod: "direct_debit" as const,
    transactionDate: "2026-02-01",
    effectiveDate: "2026-02-01",
    branchId: esBranchId,
    notes: null,
    links: [],
    ...overrides,
  };
}

describe("domiciliación (direct_debit) — gate por país", () => {
  it("acepta el cobro en una sede de España", async () => {
    const result = await txService.create(
      TEMPLO_CTX,
      directDebitCharge(),
      adminId,
    );
    expect(result.paymentMethod).toBe("direct_debit");
  });

  it("rechaza el cobro en una sede de Argentina", async () => {
    await expect(
      txService.create(
        TEMPLO_CTX,
        directDebitCharge({
          memberId: arMemberId,
          branchId: arBranchId,
          currency: "ARS",
        }),
        adminId,
      ),
    ).rejects.toThrow(/solo está disponible en sedes de España/);
  });

  it("rechaza el cobro sin sucursal (no hay país que validar)", async () => {
    await expect(
      txService.create(
        TEMPLO_CTX,
        directDebitCharge({ branchId: null }),
        adminId,
      ),
    ).rejects.toThrow(/requiere una sucursal/);
  });
});

/**
 * Devuelve type + currency de una caja. Las aserciones de destino miran ESO y
 * no un id: con varias cajas banco de la misma moneda el resolver elige la más
 * antigua por id (CAJA-03 / fase 146), que es la del seed de migraciones, no la
 * que crea este archivo. Atar el test a un id lo haría fallar por el orden de
 * creación en vez de por la regla que quiere proteger.
 */
async function cajaShape(
  id: number | null,
): Promise<{ type: string; currency: string } | undefined> {
  if (id === null) return undefined;
  const [caja] = await app.db
    .select({
      type: schema.cashRegisters.type,
      currency: schema.cashRegisters.currency,
    })
    .from(schema.cashRegisters)
    .where(
      and(
        tenantWhere(schema.cashRegisters, TEMPLO_CTX),
        eq(schema.cashRegisters.id, id),
      ),
    )
    .limit(1);
  return caja;
}

describe("domiciliación (direct_debit) — caja destino", () => {
  it("imputa a una caja banco de la moneda, no a la efectivo de la sede", async () => {
    const resolved = await cashRegisterService.resolveCashRegister(
      TEMPLO_CTX,
      "direct_debit",
      esBranchId,
      "EUR",
    );
    expect(await cajaShape(resolved)).toEqual({
      type: "banco",
      currency: "EUR",
    });
  });

  it("estampa esa caja en la fila del ledger al cobrar", async () => {
    const result = await txService.create(
      TEMPLO_CTX,
      directDebitCharge({ amount: 6100 }),
      adminId,
    );
    const [row] = await app.db
      .select({
        cashRegisterId: schema.financialTransactions.cashRegisterId,
      })
      .from(schema.financialTransactions)
      .where(
        and(
          tenantWhere(schema.financialTransactions, TEMPLO_CTX),
          eq(schema.financialTransactions.id, result.id),
        ),
      )
      .limit(1);
    expect(await cajaShape(row?.cashRegisterId ?? null)).toEqual({
      type: "banco",
      currency: "EUR",
    });
  });
});

describe("domiciliación (direct_debit) — rechazo del banco", () => {
  it("se resuelve anulando el cobro, sin estado intermedio propio", async () => {
    // El banco confirma dentro de las 48 h y el staff carga sabiendo el
    // resultado. Un rechazo posterior usa el mismo camino que cualquier cobro
    // mal cargado: anular. Por eso no hay 'pendiente de confirmación'.
    const created = await txService.create(
      TEMPLO_CTX,
      directDebitCharge({ amount: 7300 }),
      adminId,
    );

    await txService.void(TEMPLO_CTX, created.id, adminId, {
      reason: "Devolución SEPA — el banco rechazó el recibo",
    });

    const [row] = await app.db
      .select({
        voidedAt: schema.financialTransactions.voidedAt,
        voidReason: schema.financialTransactions.voidReason,
      })
      .from(schema.financialTransactions)
      .where(
        and(
          tenantWhere(schema.financialTransactions, TEMPLO_CTX),
          eq(schema.financialTransactions.id, created.id),
        ),
      )
      .limit(1);

    expect(row?.voidedAt).not.toBeNull();
    expect(row?.voidReason).toMatch(/Devolución SEPA/);
  });
});
