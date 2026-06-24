/**
 * Phase 137 — firm-money regression tests (SCAFFOLD).
 *
 * Wave 0 RED-ready skeleton. Plan 03 (refactor of the 14 canonical-filter
 * call sites + regression gate) replaces each `it.todo` with a real
 * integration case against the per-worker test MySQL DB
 * (eltemplo_test_<POOL_ID>) using the helpers below.
 *
 * This is the phase gate for VAL-05 / VAL-07 — it proves a PENDIENTE does
 * NOT move firm cash while a VALIDADO does, and that the DEFAULT 'validado'
 * backfill leaves the 6 v5.0 management metrics with identical numbers.
 *
 *   R1: a PENDIENTE does NOT move summary / firm-cash saldo.
 *   R2: validating that payment DOES add it to firm money.
 *   R3: the 6 v5.0 metrics give identical numbers after the backfill
 *       (all-validado fixture → assert == pre-137 baseline).
 *   R4: a PENDIENTE DOES settle the member's balances (deuda → 0) even
 *       though it is not yet firm cash (D-09: activar ≠ validar).
 *
 * `it.todo` does NOT fail — the suite stays green until plan 03 fills it in.
 */

import { describe, it, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import {
  createTestApp,
  cleanAllTestData,
  createStaffUser,
  createTestMember,
  assignTestPlan,
  getAuthToken,
} from "../helpers";

let app: FastifyInstance;

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  if (app) {
    await cleanAllTestData(app);
    await app.close();
  }
});

// Silence unused-import lint until plan 03 wires the helpers into real cases.
void createStaffUser;
void createTestMember;
void assignTestPlan;
void getAuthToken;

describe("firm-money regression", () => {
  // R1: a PENDIENTE must not move firm cash.
  it.todo("R1: a PENDIENTE does NOT move summary monthlyRevenue / firm saldo");

  // R2: validating it makes it count.
  it.todo("R2: validating the PENDIENTE DOES add it to firm money");

  // R3: 6 v5.0 metrics unchanged after the backfill.
  it.todo(
    "R3: the 6 v5.0 metrics (ticket/churn/renewal/LTV/frequency/funnel) give identical numbers after backfill",
  );

  // R4: a PENDIENTE still settles the member's balances (D-09).
  it.todo(
    "R4: a PENDIENTE settles the member's balances (deuda → 0) but is not firm cash",
  );
});
