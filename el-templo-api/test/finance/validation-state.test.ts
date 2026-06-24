/**
 * Phase 137 — validation state machine integration tests (SCAFFOLD).
 *
 * Wave 0 RED-ready skeleton. Plan 02 (validate/observe/correct/void +
 * server-side role→status + RBAC) replaces each `it.todo` with a real
 * integration case against the per-worker test MySQL DB
 * (eltemplo_test_<POOL_ID>) using the helpers below.
 *
 * Covers VAL-01..VAL-04, VAL-06:
 *   - validate(): pendiente → validado (+ firm money now counts it)
 *   - observe():  pendiente → observado
 *   - correct():  void(old, status='corregido') + create(new, validado) + link
 *   - void() extended with keepMembershipActive (default true)
 *   - RBAC: coach derives 'pendiente'; coach cannot validate/void
 *
 * `it.todo` does NOT fail — the suite stays green until plan 02 fills it in.
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

// Silence unused-import lint until plan 02 wires the helpers into real cases.
void createStaffUser;
void createTestMember;
void assignTestPlan;
void getAuthToken;

describe("validation state machine", () => {
  // VAL-02: role → validation_status derived server-side (never from body).
  it.todo("coach load → validation_status='pendiente'");
  it.todo("admin load → validation_status='validado'");

  // VAL-03: validate() transition.
  it.todo("validate(): pendiente → validado and starts counting as firm money");

  // VAL-04: observe() transition.
  it.todo("observe(): pendiente → observado");

  // VAL-04 / D-05: correct() = void(old, 'corregido') + create(new, 'validado').
  it.todo(
    "correct(): voids the original (status='corregido') and recreates a validado linked via transaction_links",
  );
  it.todo("correct(): is atomic — a failing recreate rolls back the void");

  // VAL-06: void() extended with keepMembershipActive.
  it.todo(
    "void(): admin voids a validado (motivo+autor+fecha) on the orthogonal soft-void axis",
  );
  it.todo("void(): keepMembershipActive=false cancels the linked subscription");

  // RBAC (V4 access control): coach cannot validate/void.
  it.todo("RBAC: coach cannot validate a transaction");
  it.todo("RBAC: coach cannot void a transaction");

  // VAL-01: enum coexists with soft-void — a validado can later be voided.
  it.todo(
    "VAL-01: a validado transaction can still be voided (orthogonal axes)",
  );
});
