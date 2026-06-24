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

import { describe, it, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { createTestApp } from "../helpers";

let app: FastifyInstance;

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
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
    it.todo("cash resolves to the efectivo caja of the tx branch");
    it.todo("transfer and card resolve to the banco caja of the currency");
    it.todo("aura_credit and internal resolve to NULL");
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
    it.todo(
      "efectivo caja currency != tx currency throws Moneda inconsistente",
    );
    it.todo("banco resolution always matches currency by construction");
  });
});
