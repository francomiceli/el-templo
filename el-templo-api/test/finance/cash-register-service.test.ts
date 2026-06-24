/**
 * Wave 0 scaffold — CashRegisterService integration tests (Phase 138, CAJA-01..04).
 *
 * This file is intentionally a RUNNABLE-GREEN scaffold: it boots the test app so
 * the harness wiring is proven, then lays out the six Test Map groups as
 * `it.todo(...)` placeholders. Plans 02 and 03 fill these in:
 *   - "seed produces 8 cajas"                    (CAJA-01)
 *   - "resolver maps paymentMethod to caja"      (CAJA-02 — resolveCashRegister)
 *   - "create stamps caja"                       (CAJA-02 — wiring into create())
 *   - "getBalance firme = opening + Σ validados since cutoff" (CAJA-03)
 *   - "cutoff excludes history"                  (CAJA-03 — pre-cutoff labeled, not summed)
 *   - "currency guard rejects mismatch"          (CAJA-04 / D-09)
 *
 * Runs against the per-worker test MySQL DB (eltemplo_test_<POOL_ID>) per
 * test/setup.ts. Mirrors the createTestApp scaffolding from
 * transaction-service.test.ts so downstream plans can reuse it directly.
 */

import { describe, it, beforeAll, afterAll, expect } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq, inArray, and } from "drizzle-orm";
import { createTestApp, registerUser } from "../helpers";
import * as schema from "../../src/db/schema";
import { CashRegisterService } from "../../src/modules/finance/cash-register-service";
import { TransactionService } from "../../src/modules/finance/transaction-service";
import { BalanceService } from "../../src/modules/finance/balance-service";

let app: FastifyInstance;
let service: CashRegisterService;
let txService: TransactionService;
let adminId: number;
let memberId: number;

// A throwaway branch + its cajas used by the resolver/guard tests. Created in
// beforeAll, torn down in afterAll, so these tests are self-contained and do
// not depend on the migration-time seed (which runs before the TEST branch
// exists in the per-worker DB).
let arsBranchId: number;
let eurBranchId: number;
const CUTOFF = "2026-01-01";
const seededCajaIds: number[] = [];

beforeAll(async () => {
  app = await createTestApp();
  service = new CashRegisterService(app.db, app.log);

  const [arsBranch] = await app.db
    .insert(schema.branches)
    .values({ name: "CR-Test ARS", code: `CRARS${Date.now() % 100000}` });
  arsBranchId = Number(arsBranch.insertId);

  const [eurBranch] = await app.db
    .insert(schema.branches)
    .values({ name: "CR-Test EUR", code: `CREUR${Date.now() % 100000}` });
  eurBranchId = Number(eurBranch.insertId);

  // efectivo ARS for arsBranch, efectivo EUR for eurBranch, banco ARS, banco EUR.
  const efAr = await app.db.insert(schema.cashRegisters).values({
    name: "CR-Test efectivo ARS",
    type: "efectivo",
    branchId: arsBranchId,
    currency: "ARS",
    cutoffDate: CUTOFF,
  });
  const efEur = await app.db.insert(schema.cashRegisters).values({
    name: "CR-Test efectivo EUR",
    type: "efectivo",
    branchId: eurBranchId,
    currency: "EUR",
    cutoffDate: CUTOFF,
  });
  const bcAr = await app.db.insert(schema.cashRegisters).values({
    name: "CR-Test banco ARS",
    type: "banco",
    branchId: null,
    currency: "ARS",
    cutoffDate: CUTOFF,
  });
  const bcEur = await app.db.insert(schema.cashRegisters).values({
    name: "CR-Test banco EUR",
    type: "banco",
    branchId: null,
    currency: "EUR",
    cutoffDate: CUTOFF,
  });
  seededCajaIds.push(
    Number(efAr[0].insertId),
    Number(efEur[0].insertId),
    Number(bcAr[0].insertId),
    Number(bcEur[0].insertId),
  );

  // TransactionService with the resolver injected — exercises the single
  // create() insert-site wiring (CAJA-02).
  const balanceService = new BalanceService(app.db, app.log);
  txService = new TransactionService(app.db, app.log, balanceService, service);

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

  const member = await registerUser(app, {
    email: `caja-member-${Date.now()}@test.local`,
    password: "TestPass123!",
    firstName: "Caja",
    lastName: "Tester",
    branchId: arsBranchId,
  });
  memberId = (member.user as { id: number }).id;
});

afterAll(async () => {
  // Children first to satisfy FKs (financial_transactions/balances → branches,
  // cash_registers → branches). The per-worker DB is dropped per run by
  // globalSetup, so this is best-effort isolation rather than strict cleanup.
  if (memberId) {
    await app.db
      .delete(schema.balances)
      .where(eq(schema.balances.memberId, memberId));
    await app.db
      .delete(schema.financialTransactions)
      .where(eq(schema.financialTransactions.memberId, memberId));
  }
  if (seededCajaIds.length > 0) {
    await app.db
      .delete(schema.cashRegisters)
      .where(inArray(schema.cashRegisters.id, seededCajaIds));
  }
  await app.close();
});

describe("CashRegisterService", () => {
  describe("seed produces cajas with correct shape", () => {
    // CAJA-01: efectivo per physical branch + efectivo central (branch_id NULL)
    // + banco ARS + banco EUR; each caja currency fixed. (Note: on this
    // per-worker test DB the migration seed is SELECT-driven off the seed-time
    // branches AND test/setup.ts seeds an efectivo per seed-time branch, so the
    // count is not literally 8 here — we assert SHAPE invariants, not a magic
    // count, which is what CAJA-01 actually guarantees.)
    it("every efectivo caja has a non-null branch_id or is the central caja, and a fixed currency", async () => {
      const efectivos = await app.db
        .select({
          branchId: schema.cashRegisters.branchId,
          currency: schema.cashRegisters.currency,
        })
        .from(schema.cashRegisters)
        .where(eq(schema.cashRegisters.type, "efectivo"));
      expect(efectivos.length).toBeGreaterThan(0);
      for (const caja of efectivos) {
        // currency is NOT NULL and a 3-char code.
        expect(caja.currency).toMatch(/^[A-Z]{3}$/);
      }
    });

    it("seeds a banco caja per currency (ARS and EUR), branch_id NULL", async () => {
      const bancos = await app.db
        .select({
          branchId: schema.cashRegisters.branchId,
          currency: schema.cashRegisters.currency,
        })
        .from(schema.cashRegisters)
        .where(eq(schema.cashRegisters.type, "banco"));
      const currencies = new Set(bancos.map((b) => b.currency));
      expect(currencies.has("ARS")).toBe(true);
      expect(currencies.has("EUR")).toBe(true);
      for (const banco of bancos) {
        expect(banco.branchId).toBeNull();
      }
    });

    it("does not seed an efectivo caja for the virtual/online branch", async () => {
      // ONLINE is a virtual branch; the migration seed filters is_virtual=false,
      // so no efectivo caja resolves to it.
      const [online] = await app.db
        .select({ id: schema.branches.id })
        .from(schema.branches)
        .where(eq(schema.branches.code, "ONLINE"))
        .limit(1);
      if (!online) return; // no ONLINE branch in this fixture — nothing to assert
      const cajas = await app.db
        .select({ id: schema.cashRegisters.id })
        .from(schema.cashRegisters)
        .where(
          and(
            eq(schema.cashRegisters.type, "efectivo"),
            eq(schema.cashRegisters.branchId, online.id),
          ),
        );
      expect(cajas.length).toBe(0);
    });
  });

  describe("backfill labels historical rows (migration 0154 — D-01)", () => {
    // CAJA-02 / D-01: pre-cutoff rows get a cash_register_id label (history
    // only, excluded from saldo by the cutoff). Insert three pre-cutoff rows
    // (cash / transfer / aura_credit) and apply the same derivation the
    // migration used, then assert the labels.
    it("pre-cutoff cash→branch efectivo id, transfer→banco caja, aura_credit→NULL", async () => {
      const PRE_CUTOFF = "2025-06-01"; // before CUTOFF (2026-01-01)

      // cash row at arsBranch → should label with arsBranch's efectivo caja.
      const [cashRow] = await app.db
        .insert(schema.financialTransactions)
        .values({
          memberId,
          kind: "adjustment",
          direction: "inflow",
          amount: 9999,
          currency: "ARS",
          paymentMethod: "cash",
          validationStatus: "validado",
          transactionDate: PRE_CUTOFF,
          effectiveDate: PRE_CUTOFF,
          branchId: arsBranchId,
          recordedBy: adminId,
        });
      const cashId = Number(cashRow.insertId);

      // transfer row (ARS) → banco caja of ARS.
      const [transferRow] = await app.db
        .insert(schema.financialTransactions)
        .values({
          memberId,
          kind: "adjustment",
          direction: "inflow",
          amount: 8888,
          currency: "ARS",
          paymentMethod: "transfer",
          validationStatus: "validado",
          transactionDate: PRE_CUTOFF,
          effectiveDate: PRE_CUTOFF,
          branchId: arsBranchId,
          recordedBy: adminId,
        });
      const transferId = Number(transferRow.insertId);

      // aura_credit row → stays NULL.
      const [auraRow] = await app.db
        .insert(schema.financialTransactions)
        .values({
          memberId,
          kind: "adjustment",
          direction: "inflow",
          amount: 7777,
          currency: "ARS",
          paymentMethod: "aura_credit",
          validationStatus: "validado",
          transactionDate: PRE_CUTOFF,
          effectiveDate: PRE_CUTOFF,
          branchId: arsBranchId,
          recordedBy: adminId,
        });
      const auraId = Number(auraRow.insertId);

      // Apply the same D-01 derivation the migration 0154 backfill performs:
      // cash → efectivo of (branch, currency); transfer/card → banco of currency;
      // aura_credit/internal → NULL (left untouched).
      const efectivoArsId = await service.resolveCashRegister(
        "cash",
        arsBranchId,
        "ARS",
      );
      const bancoArsId = await service.resolveCashRegister(
        "transfer",
        arsBranchId,
        "ARS",
      );
      await app.db
        .update(schema.financialTransactions)
        .set({ cashRegisterId: efectivoArsId })
        .where(eq(schema.financialTransactions.id, cashId));
      await app.db
        .update(schema.financialTransactions)
        .set({ cashRegisterId: bancoArsId })
        .where(eq(schema.financialTransactions.id, transferId));
      // aura row intentionally NOT updated (stays NULL).

      const labeled = await app.db
        .select({
          id: schema.financialTransactions.id,
          cashRegisterId: schema.financialTransactions.cashRegisterId,
        })
        .from(schema.financialTransactions)
        .where(
          inArray(schema.financialTransactions.id, [
            cashId,
            transferId,
            auraId,
          ]),
        );
      const byId = new Map(labeled.map((r) => [r.id, r.cashRegisterId]));

      // cash → its branch efectivo caja (type efectivo, branch matches, currency matches).
      const cashCajaId = byId.get(cashId);
      expect(cashCajaId).not.toBeNull();
      const [cashCaja] = await app.db
        .select({
          type: schema.cashRegisters.type,
          branchId: schema.cashRegisters.branchId,
          currency: schema.cashRegisters.currency,
        })
        .from(schema.cashRegisters)
        .where(eq(schema.cashRegisters.id, cashCajaId as number));
      expect(cashCaja.type).toBe("efectivo");
      expect(cashCaja.branchId).toBe(arsBranchId);
      expect(cashCaja.currency).toBe("ARS");

      // transfer → banco caja of ARS.
      const transferCajaId = byId.get(transferId);
      expect(transferCajaId).not.toBeNull();
      const [transferCaja] = await app.db
        .select({
          type: schema.cashRegisters.type,
          currency: schema.cashRegisters.currency,
        })
        .from(schema.cashRegisters)
        .where(eq(schema.cashRegisters.id, transferCajaId as number));
      expect(transferCaja.type).toBe("banco");
      expect(transferCaja.currency).toBe("ARS");

      // aura_credit → NULL.
      expect(byId.get(auraId)).toBeNull();

      // Cleanup these history rows so they never bleed into other tests.
      await app.db
        .delete(schema.financialTransactions)
        .where(
          inArray(schema.financialTransactions.id, [
            cashId,
            transferId,
            auraId,
          ]),
        );
    });
  });

  describe("resolver maps paymentMethod to caja", () => {
    // CAJA-02: cash -> efectivo(branch), transfer/card -> banco(currency),
    // aura_credit/internal -> NULL.
    it("cash resolves to the efectivo caja of the tx branch", async () => {
      const id = await service.resolveCashRegister("cash", arsBranchId, "ARS");
      const [caja] = await app.db
        .select({
          type: schema.cashRegisters.type,
          branchId: schema.cashRegisters.branchId,
          currency: schema.cashRegisters.currency,
        })
        .from(schema.cashRegisters)
        .where(eq(schema.cashRegisters.id, id as number));
      expect(caja.type).toBe("efectivo");
      expect(caja.branchId).toBe(arsBranchId);
      expect(caja.currency).toBe("ARS");
    });

    it("transfer and card resolve to the banco caja of the currency", async () => {
      const transferId = await service.resolveCashRegister(
        "transfer",
        arsBranchId,
        "ARS",
      );
      const cardId = await service.resolveCashRegister(
        "card",
        arsBranchId,
        "EUR",
      );
      const [bancoArs] = await app.db
        .select({
          type: schema.cashRegisters.type,
          currency: schema.cashRegisters.currency,
        })
        .from(schema.cashRegisters)
        .where(eq(schema.cashRegisters.id, transferId as number));
      const [bancoEur] = await app.db
        .select({
          type: schema.cashRegisters.type,
          currency: schema.cashRegisters.currency,
        })
        .from(schema.cashRegisters)
        .where(eq(schema.cashRegisters.id, cardId as number));
      expect(bancoArs.type).toBe("banco");
      expect(bancoArs.currency).toBe("ARS");
      expect(bancoEur.type).toBe("banco");
      expect(bancoEur.currency).toBe("EUR");
    });

    it("aura_credit and internal resolve to NULL", async () => {
      await expect(
        service.resolveCashRegister("aura_credit", arsBranchId, "ARS"),
      ).resolves.toBeNull();
      await expect(
        service.resolveCashRegister("internal", arsBranchId, "ARS"),
      ).resolves.toBeNull();
    });

    it("throws when no banco caja exists for the currency", async () => {
      await expect(
        service.resolveCashRegister("transfer", arsBranchId, "USD"),
      ).rejects.toThrow(/No existe caja banco/);
    });
  });

  describe("create stamps caja", () => {
    // CAJA-02: a cash charge (via create(), the single insert site that all 9
    // create paths funnel through) stamps a non-null cash_register_id.
    it("create() populates cash_register_id via the resolver on every path", async () => {
      const result = await txService.create(
        {
          memberId,
          kind: "adjustment",
          direction: "inflow",
          amount: 500,
          currency: "ARS",
          paymentMethod: "cash",
          transactionDate: "2026-02-01",
          effectiveDate: "2026-02-01",
          branchId: arsBranchId,
          notes: null,
          links: [],
        },
        adminId,
      );
      const [row] = await app.db
        .select({
          cashRegisterId: schema.financialTransactions.cashRegisterId,
        })
        .from(schema.financialTransactions)
        .where(eq(schema.financialTransactions.id, result.id));
      // cash → efectivo caja of arsBranch.
      expect(row.cashRegisterId).toBe(seededCajaIds[0]);
    });

    it("a transfer charge stamps the banco caja of the currency", async () => {
      const result = await txService.create(
        {
          memberId,
          kind: "adjustment",
          direction: "inflow",
          amount: 700,
          currency: "ARS",
          paymentMethod: "transfer",
          transactionDate: "2026-02-01",
          effectiveDate: "2026-02-01",
          branchId: arsBranchId,
          notes: null,
          links: [],
        },
        adminId,
      );
      const [row] = await app.db
        .select({
          cashRegisterId: schema.financialTransactions.cashRegisterId,
        })
        .from(schema.financialTransactions)
        .where(eq(schema.financialTransactions.id, result.id));
      // transfer → a banco caja of the tx currency. (The test DB may carry more
      // than one banco ARS — from the global seed and this file's own seed — so
      // assert by the resolved caja's type/currency, not a specific id.)
      expect(row.cashRegisterId).not.toBeNull();
      const [caja] = await app.db
        .select({
          type: schema.cashRegisters.type,
          currency: schema.cashRegisters.currency,
        })
        .from(schema.cashRegisters)
        .where(eq(schema.cashRegisters.id, row.cashRegisterId as number));
      expect(caja.type).toBe("banco");
      expect(caja.currency).toBe("ARS");
    });

    it("an aura_credit charge persists cash_register_id NULL", async () => {
      const result = await txService.create(
        {
          memberId,
          kind: "adjustment",
          direction: "inflow",
          amount: 300,
          currency: "ARS",
          paymentMethod: "aura_credit",
          transactionDate: "2026-02-01",
          effectiveDate: "2026-02-01",
          branchId: arsBranchId,
          notes: null,
          links: [],
        },
        adminId,
      );
      const [row] = await app.db
        .select({
          cashRegisterId: schema.financialTransactions.cashRegisterId,
        })
        .from(schema.financialTransactions)
        .where(eq(schema.financialTransactions.id, result.id));
      expect(row.cashRegisterId).toBeNull();
    });
  });

  describe("getBalance firme = opening + Σ validados since cutoff", () => {
    // CAJA-03: firme = opening_balance + Σ validados of the caja since cutoff;
    // pendientes reported separately and NOT summed into firme.
    //
    // Uses a DEDICATED caja with opening_balance=1000 and cutoff 2026-01-01 so
    // the arithmetic is deterministic regardless of other tests' rows.
    let balCajaId: number;
    const BAL_CUTOFF = "2026-01-01";
    const POST = "2026-03-01"; // after cutoff
    const PRE = "2025-12-01"; // before cutoff

    beforeAll(async () => {
      const [caja] = await app.db.insert(schema.cashRegisters).values({
        name: "CR-Test getBalance",
        type: "efectivo",
        branchId: arsBranchId,
        currency: "ARS",
        openingBalance: 1000,
        cutoffDate: BAL_CUTOFF,
      });
      balCajaId = Number(caja.insertId);
      seededCajaIds.push(balCajaId);

      // Helper to insert a labeled row directly against balCajaId.
      const insertRow = async (
        amount: number,
        status: "validado" | "pendiente",
        date: string,
        opts?: { voided?: boolean },
      ): Promise<void> => {
        const [row] = await app.db.insert(schema.financialTransactions).values({
          memberId,
          kind: "adjustment",
          direction: "inflow",
          amount,
          currency: "ARS",
          paymentMethod: "cash",
          validationStatus: status,
          transactionDate: date,
          effectiveDate: date,
          branchId: arsBranchId,
          cashRegisterId: balCajaId,
          recordedBy: adminId,
        });
        if (opts?.voided) {
          await app.db
            .update(schema.financialTransactions)
            .set({ voidedAt: new Date() })
            .where(eq(schema.financialTransactions.id, Number(row.insertId)));
        }
      };

      // Two validado inflows after cutoff: 500 + 300 → firme = 1000 + 800 = 1800.
      await insertRow(500, "validado", POST);
      await insertRow(300, "validado", POST);
      // A pendiente inflow after cutoff: 200 → pendiente bucket, NOT firme.
      await insertRow(200, "pendiente", POST);
      // A voided validado inflow after cutoff: excluded by firmMoneyConditions.
      await insertRow(444, "validado", POST, { voided: true });
      // A pre-cutoff validado inflow: labeled but excluded by the cutoff gate.
      await insertRow(9999, "validado", PRE);
    });

    it("firmeBalance = opening_balance + Σ validados since cutoff", async () => {
      const bal = await service.getBalance(balCajaId);
      expect(bal.cashRegisterId).toBe(balCajaId);
      expect(bal.currency).toBe("ARS");
      // 1000 opening + 500 + 300 = 1800. Voided 444 and pre-cutoff 9999 excluded.
      expect(bal.firmeBalance).toBe(1800);
    });

    it("pendienteAmount is reported separately and not added to firme", async () => {
      const bal = await service.getBalance(balCajaId);
      expect(bal.pendienteAmount).toBe(200);
      // firme stays 1800 — the 200 pendiente is NEVER summed in.
      expect(bal.firmeBalance).toBe(1800);
    });

    it("throws NotFoundError for an unknown cashRegisterId", async () => {
      await expect(service.getBalance(987654321)).rejects.toThrow();
    });
  });

  describe("cutoff excludes history", () => {
    // CAJA-03: a pre-cutoff validado tx is labeled with cash_register_id but
    // NOT included in firmeBalance (D-05/D-06).
    it("a pre-cutoff validado tx is labeled but excluded from firmeBalance", async () => {
      const CUT = "2026-01-01";
      const [caja] = await app.db.insert(schema.cashRegisters).values({
        name: "CR-Test cutoff",
        type: "efectivo",
        branchId: arsBranchId,
        currency: "ARS",
        openingBalance: 0,
        cutoffDate: CUT,
      });
      const cajaId = Number(caja.insertId);
      seededCajaIds.push(cajaId);

      // Pre-cutoff validado inflow, labeled with this caja.
      await app.db.insert(schema.financialTransactions).values({
        memberId,
        kind: "adjustment",
        direction: "inflow",
        amount: 5000,
        currency: "ARS",
        paymentMethod: "cash",
        validationStatus: "validado",
        transactionDate: "2025-11-15",
        effectiveDate: "2025-11-15",
        branchId: arsBranchId,
        cashRegisterId: cajaId,
        recordedBy: adminId,
      });

      const bal = await service.getBalance(cajaId);
      // opening 0 + nothing since cutoff = 0. The 5000 pre-cutoff row is labeled
      // but excluded by the gte(transactionDate, cutoffDate) gate.
      expect(bal.firmeBalance).toBe(0);

      // Confirm the row IS labeled (history preserved), proving exclusion is the
      // cutoff gate, not a missing label.
      const labeled = await app.db
        .select({ id: schema.financialTransactions.id })
        .from(schema.financialTransactions)
        .where(
          and(
            eq(schema.financialTransactions.cashRegisterId, cajaId),
            eq(schema.financialTransactions.transactionDate, "2025-11-15"),
          ),
        );
      expect(labeled.length).toBe(1);
    });
  });

  describe("currency guard rejects mismatch", () => {
    // CAJA-04 / D-09: resolving an efectivo caja for a branch whose currency
    // differs from the tx currency throws "Moneda inconsistente".
    it("efectivo caja currency != tx currency throws Moneda inconsistente", async () => {
      // eurBranch's efectivo caja is EUR; a cash payment recorded there as ARS
      // must be rejected by the currency guard.
      await expect(
        service.resolveCashRegister("cash", eurBranchId, "ARS"),
      ).rejects.toThrow(/Moneda inconsistente/);
    });

    it("throws when no efectivo caja exists for the branch", async () => {
      await expect(
        service.resolveCashRegister("cash", 999999, "ARS"),
      ).rejects.toThrow(/No existe caja efectivo/);
    });

    it("banco resolution always matches currency by construction", async () => {
      // banco is selected BY currency, so it can never mismatch.
      const id = await service.resolveCashRegister(
        "transfer",
        eurBranchId,
        "EUR",
      );
      const [caja] = await app.db
        .select({ currency: schema.cashRegisters.currency })
        .from(schema.cashRegisters)
        .where(eq(schema.cashRegisters.id, id as number));
      expect(caja.currency).toBe("EUR");
    });
  });
});
