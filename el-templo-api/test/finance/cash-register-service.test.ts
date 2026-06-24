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
import { eq, inArray } from "drizzle-orm";
import { createTestApp } from "../helpers";
import * as schema from "../../src/db/schema";
import { CashRegisterService } from "../../src/modules/finance/cash-register-service";

let app: FastifyInstance;
let service: CashRegisterService;

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
});

afterAll(async () => {
  if (seededCajaIds.length > 0) {
    await app.db
      .delete(schema.cashRegisters)
      .where(inArray(schema.cashRegisters.id, seededCajaIds));
  }
  for (const bId of [arsBranchId, eurBranchId]) {
    if (bId) {
      await app.db.delete(schema.branches).where(eq(schema.branches.id, bId));
    }
  }
  await app.close();
});

describe("CashRegisterService", () => {
  describe("seed produces 8 cajas", () => {
    // CAJA-01: 5 efectivo per physical AR branch + 1 efectivo central
    // (branch_id NULL) + banco ARS + banco EUR; each caja currency fixed.
    it.todo("seeds 8 cajas with correct type/currency/branch_id");
    it.todo(
      "seeds all cajas with opening_balance 0 and the global cutoff_date",
    );
    it.todo("does not seed an efectivo caja for the virtual/online branch");
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
    // CAJA-02: a cash charge via recordAssignmentCharge (not REST) still
    // stamps a non-null cash_register_id (single insert-site wiring).
    it.todo(
      "create() populates cash_register_id via the resolver on every path",
    );
    it.todo("an aura_credit charge persists cash_register_id NULL");
  });

  describe("getBalance firme = opening + Σ validados since cutoff", () => {
    // CAJA-03: firme = opening_balance + Σ validados of the caja since cutoff;
    // pendientes reported separately and NOT summed into firme.
    it.todo("firmeBalance = opening_balance + Σ validados since cutoff");
    it.todo("pendienteAmount is reported separately and not added to firme");
  });

  describe("cutoff excludes history", () => {
    // CAJA-03: a pre-cutoff validado tx is labeled with cash_register_id but
    // NOT included in firmeBalance (D-05/D-06).
    it.todo(
      "a pre-cutoff validado tx is labeled but excluded from firmeBalance",
    );
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
