/**
 * Phase 141 (REP-02) — Saldos por caja integration tests.
 *
 * GET /api/admin/finance/cash-registers/balances iterates the ACTIVE cajas and
 * returns each with firmeBalance + pendienteAmount (straight from the 138
 * getBalance primitive) + type + currency.
 *
 * Covers:
 *   - one entry per active caja with firmeBalance, pendienteAmount, type, currency
 *   - firme excludes a pendiente row (pendiente reported SEPARATELY)
 *   - coach → 403
 *   - scope: a non-owner gestion (AR) does NOT see a branch-less central/banco
 *     caja (owner-only); an owner does.
 *
 * Runs against the per-worker test MySQL DB (eltemplo_test_<POOL_ID>).
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  createTestApp,
  createStaffUser,
  getAuthToken,
  registerUser,
} from "../helpers";
import * as schema from "../../src/db/schema";
import { TENANT_TEMPLO } from "../fixtures/second-tenant";
import { tenantValues, tenantWhere } from "../../src/modules/shared/tenant";

/**
 * Fase 172 (172-13): gimnasio de las queries DIRECTAS de este archivo. Sale del
 * fixture, nunca de un `1` a mano. El sentinel de tenancy ve las queries de los
 * tests igual que las de la app —comparten el pool—, asi que con `finance` en
 * `TENANT_STRICT_MODULES` una siembra de `cash_registers` /
 * `financial_transactions` sin estampa hace throw antes de llegar a MySQL.
 */
const TEMPLO_CTX = { tenantId: TENANT_TEMPLO };

const BALANCES_URL = "/api/admin/finance/cash-registers/balances";
const CUTOFF = "2020-01-01";

let app: FastifyInstance;
let adminId: number;
let branchId: number;
let memberId: number;

let ownerToken: string;
let gestionToken: string;

let efectivoCajaId: number;
let bancoCajaId: number;
/** Caja propia de los tests de período (aislada de los assertions de firme). */
let periodoCajaId: number;

interface CajaSaldoRow {
  cashRegisterId: number;
  name: string;
  type: "efectivo" | "banco";
  branchId: number | null;
  currency: string;
  firmeBalance: number;
  pendienteAmount: number;
  period: {
    dateFrom: string;
    dateTo: string;
    inflow: number;
    outflow: number;
    net: number;
  } | null;
}

async function fetchBalances(
  token: string,
): Promise<{ statusCode: number; rows: CajaSaldoRow[] }> {
  const res = await app.inject({
    method: "GET",
    url: BALANCES_URL,
    headers: { authorization: `Bearer ${token}` },
  });
  if (res.statusCode !== 200) return { statusCode: res.statusCode, rows: [] };
  return {
    statusCode: res.statusCode,
    rows: JSON.parse(res.body) as CajaSaldoRow[],
  };
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
  // admin@test.com is seeded with role 'owner' (test/setup.ts).
  ownerToken = await getAuthToken(app, "admin@test.com", "adminpass123");

  await createStaffUser(app, {
    email: "coach-bal@test.local",
    password: "pass123456",
    firstName: "Coach",
    lastName: "Bal",
    role: "coach",
    branchId,
  });

  await createStaffUser(app, {
    email: "gestion-bal@test.local",
    password: "pass123456",
    firstName: "Gestion",
    lastName: "Bal",
    role: "gestion",
    branchId,
    country: "AR",
  });
  gestionToken = await getAuthToken(
    app,
    "gestion-bal@test.local",
    "pass123456",
  );

  const member = await registerUser(app, {
    email: `bal-member-${Date.now()}@test.local`,
    password: "TestPass123!",
    firstName: "Bal",
    lastName: "Member",
    branchId,
  });
  memberId = (member.user as { id: number }).id;

  // A sucursal efectivo ARS caja (branch-scoped) + a branch-less banco ARS caja
  // (owner-only). Unique names so this suite is self-contained.
  const suffix = Date.now() % 100000;
  const [ef] = await app.db
    .insert(schema.cashRegisters)
    .values(
      tenantValues(TEMPLO_CTX, {
        name: `Bal efectivo ${suffix}`,
        type: "efectivo",
        branchId,
        currency: "ARS",
        cutoffDate: CUTOFF,
      }),
    )
    .$returningId();
  efectivoCajaId = ef.id;

  const [banco] = await app.db
    .insert(schema.cashRegisters)
    .values(
      tenantValues(TEMPLO_CTX, {
        name: `Bal banco ${suffix}`,
        type: "banco",
        branchId: null,
        currency: "ARS",
        cutoffDate: CUTOFF,
      }),
    )
    .$returningId();
  bancoCajaId = banco.id;

  // Seed one validado inflow (firme) + one pendiente inflow into the efectivo
  // caja so firme excludes pendiente.
  // Insert multi-fila: `tenantValues` envuelve CADA fila. Una sola llamada
  // afuera del array no compila y —peor— dejaria filas sin gimnasio explicito.
  await app.db.insert(schema.financialTransactions).values([
    tenantValues(TEMPLO_CTX, {
      memberId,
      kind: "plan_charge",
      direction: "inflow",
      amount: 5000,
      currency: "ARS",
      paymentMethod: "cash",
      transactionDate: "2026-04-01",
      effectiveDate: "2026-04-01",
      branchId,
      cashRegisterId: efectivoCajaId,
      recordedBy: adminId,
      validationStatus: "validado",
    }),
    tenantValues(TEMPLO_CTX, {
      memberId,
      kind: "plan_charge",
      direction: "inflow",
      amount: 1500,
      currency: "ARS",
      paymentMethod: "cash",
      transactionDate: "2026-04-02",
      effectiveDate: "2026-04-02",
      branchId,
      cashRegisterId: efectivoCajaId,
      recordedBy: adminId,
      validationStatus: "pendiente",
    }),
  ]);
});

afterAll(async () => {
  // Limpieza ACOTADA a las cajas de este suite. Antes era un
  // `DELETE FROM financial_transactions` global, que además de borrar filas de
  // otros suites que comparten la DB del worker fallaba con ER_ROW_IS_REFERENCED_2
  // en cuanto alguna de esas filas tenía transaction_links colgando (el FK
  // fk_tx_links_transaction no es ON DELETE CASCADE).
  const cajaIds = [efectivoCajaId, bancoCajaId, periodoCajaId].filter(
    (id): id is number => typeof id === "number",
  );
  if (cajaIds.length > 0) {
    const txIds = (
      await app.db
        .select({ id: schema.financialTransactions.id })
        .from(schema.financialTransactions)
        .where(
          and(
            tenantWhere(schema.financialTransactions, TEMPLO_CTX),
            inArray(schema.financialTransactions.cashRegisterId, cajaIds),
          ),
        )
    ).map((r) => r.id);
    // Los links primero: son los hijos del FK.
    if (txIds.length > 0) {
      await app.db
        .delete(schema.transactionLinks)
        .where(
          and(
            tenantWhere(schema.transactionLinks, TEMPLO_CTX),
            inArray(schema.transactionLinks.transactionId, txIds),
          ),
        );
      await app.db
        .delete(schema.financialTransactions)
        .where(
          and(
            tenantWhere(schema.financialTransactions, TEMPLO_CTX),
            inArray(schema.financialTransactions.id, txIds),
          ),
        );
    }
    await app.db
      .delete(schema.cashRegisters)
      .where(
        and(
          tenantWhere(schema.cashRegisters, TEMPLO_CTX),
          inArray(schema.cashRegisters.id, cajaIds),
        ),
      );
  }
  await app.close();
});

describe("REP-02: GET /cash-registers/balances (saldos por caja)", () => {
  it("returns firme + pendiente + type + currency per active caja (firme excludes pendiente)", async () => {
    const { statusCode, rows } = await fetchBalances(ownerToken);
    expect(statusCode).toBe(200);
    const ef = rows.find((r) => r.cashRegisterId === efectivoCajaId);
    expect(ef).toBeDefined();
    expect(ef?.type).toBe("efectivo");
    expect(ef?.currency).toBe("ARS");
    // firme = Σ validados only (5000); the 1500 pendiente is reported apart.
    expect(ef?.firmeBalance).toBe(5000);
    expect(ef?.pendienteAmount).toBe(1500);
  });

  it("coach → 403", async () => {
    const coachToken = await getAuthToken(
      app,
      "coach-bal@test.local",
      "pass123456",
    );
    const res = await app.inject({
      method: "GET",
      url: BALANCES_URL,
      headers: { authorization: `Bearer ${coachToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  // ── Movimiento del período (UAT caja/cobros 2026-07-21) ───────────────────
  // El saldo firme sigue siendo acumulado desde el cutoff; el rango SOLO agrega
  // entradas/salidas/neto del período, para poder conciliar una caja.
  describe("movimiento del período (dateFrom/dateTo)", () => {
    beforeAll(async () => {
      const [caja] = await app.db
        .insert(schema.cashRegisters)
        .values(
          tenantValues(TEMPLO_CTX, {
            name: `Bal periodo ${Date.now() % 100000}`,
            type: "efectivo",
            branchId,
            currency: "ARS",
            cutoffDate: CUTOFF,
          }),
        )
        .$returningId();
      periodoCajaId = caja.id;

      const base = {
        memberId,
        currency: "ARS",
        paymentMethod: "cash" as const,
        branchId,
        cashRegisterId: periodoCajaId,
        recordedBy: adminId,
        validationStatus: "validado" as const,
      };
      await app.db.insert(schema.financialTransactions).values([
        // Dentro del período (mayo): 3000 entra, 1000 sale → neto +2000.
        tenantValues(TEMPLO_CTX, {
          ...base,
          kind: "plan_charge",
          direction: "inflow",
          amount: 3000,
          transactionDate: "2026-05-10",
          effectiveDate: "2026-05-10",
        }),
        tenantValues(TEMPLO_CTX, {
          ...base,
          kind: "expense",
          direction: "outflow",
          amount: 1000,
          transactionDate: "2026-05-20",
          effectiveDate: "2026-05-20",
        }),
        // Fuera del período (junio): no debe contarse en el neto de mayo, pero
        // sí en el saldo firme acumulado.
        tenantValues(TEMPLO_CTX, {
          ...base,
          kind: "plan_charge",
          direction: "inflow",
          amount: 7000,
          transactionDate: "2026-06-05",
          effectiveDate: "2026-06-05",
        }),
        // Pendiente dentro del período: NUNCA entra al neto firme (CAJA-03).
        tenantValues(TEMPLO_CTX, {
          ...base,
          validationStatus: "pendiente" as const,
          kind: "plan_charge",
          direction: "inflow",
          amount: 900,
          transactionDate: "2026-05-15",
          effectiveDate: "2026-05-15",
        }),
      ]);
    });

    async function fetchWithRange(
      dateFrom: string,
      dateTo: string,
    ): Promise<{ statusCode: number; rows: CajaSaldoRow[] }> {
      const res = await app.inject({
        method: "GET",
        url: `${BALANCES_URL}?dateFrom=${dateFrom}&dateTo=${dateTo}`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      if (res.statusCode !== 200)
        return { statusCode: res.statusCode, rows: [] };
      return {
        statusCode: res.statusCode,
        rows: JSON.parse(res.body) as CajaSaldoRow[],
      };
    }

    it("con rango → entradas/salidas/neto sólo del período; el firme sigue acumulado", async () => {
      const { statusCode, rows } = await fetchWithRange(
        "2026-05-01",
        "2026-05-31",
      );
      expect(statusCode).toBe(200);
      const caja = rows.find((r) => r.cashRegisterId === periodoCajaId);
      expect(caja?.period).not.toBeNull();
      expect(caja?.period?.inflow).toBe(3000);
      expect(caja?.period?.outflow).toBe(1000);
      expect(caja?.period?.net).toBe(2000);
      // El firme incluye TODO lo validado desde el cutoff (mayo + junio),
      // no sólo el período: 3000 - 1000 + 7000.
      expect(caja?.firmeBalance).toBe(9000);
      // El pendiente de mayo se reporta aparte y no toca el neto.
      expect(caja?.pendienteAmount).toBe(900);
    });

    it("un período sin movimientos → ceros, no null", async () => {
      const { rows } = await fetchWithRange("2026-01-01", "2026-01-31");
      const caja = rows.find((r) => r.cashRegisterId === periodoCajaId);
      expect(caja?.period).toEqual({
        dateFrom: "2026-01-01",
        dateTo: "2026-01-31",
        inflow: 0,
        outflow: 0,
        net: 0,
      });
    });

    it("sin rango → period null (no cambia el contrato previo)", async () => {
      const { rows } = await fetchBalances(ownerToken);
      const caja = rows.find((r) => r.cashRegisterId === periodoCajaId);
      expect(caja?.period).toBeNull();
    });

    it("rango a medias → 400", async () => {
      const res = await app.inject({
        method: "GET",
        url: `${BALANCES_URL}?dateFrom=2026-05-01`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(res.statusCode).toBe(400);
    });

    it("dateFrom posterior a dateTo → 400", async () => {
      const res = await app.inject({
        method: "GET",
        url: `${BALANCES_URL}?dateFrom=2026-06-01&dateTo=2026-05-01`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  it("scope: non-owner gestion does NOT see the branch-less banco caja; owner does", async () => {
    const owner = await fetchBalances(ownerToken);
    expect(owner.rows.some((r) => r.cashRegisterId === bancoCajaId)).toBe(true);

    const gestion = await fetchBalances(gestionToken);
    expect(gestion.statusCode).toBe(200);
    // Branch-less central/banco caja is owner-only (Franco-confirmed).
    expect(gestion.rows.some((r) => r.cashRegisterId === bancoCajaId)).toBe(
      false,
    );
    // But the gestion's own-country sucursal efectivo caja IS visible.
    expect(gestion.rows.some((r) => r.cashRegisterId === efectivoCajaId)).toBe(
      true,
    );
  });
});
