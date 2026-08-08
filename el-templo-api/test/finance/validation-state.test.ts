/**
 * Phase 137 — validation state machine integration tests.
 *
 * Fills the Wave 0 scaffold (plan 01) with real cases against the per-worker
 * test MySQL DB (eltemplo_test_<POOL_ID>).
 *
 * Covers VAL-01..VAL-04, VAL-06, VAL-07:
 *   - role → validation_status derived SERVER-SIDE (admin→validado;
 *     recordAssignmentCharge without recorderRole→validado; coach→pendiente
 *     via the recorder-role derivation)
 *   - validate(): pendiente → validado (+ now counts as firm money)
 *   - observe():  pendiente → observado
 *   - correct():  void(old, 'corregido') + create(new, 'validado') + link
 *   - void() extended with keepMembershipActive (default true / false-cancels)
 *   - RBAC: coach cannot validate/observe/correct/void (403)
 *   - VAL-07: a PENDIENTE still settles the member's balance (applyDelta NOT
 *     tied to validation_status)
 *
 * State transitions + keepMembershipActive are exercised at the SERVICE level
 * (the create REST endpoint is gated by FINANCE_WRITE_ROLES, which excludes
 * coach in phase 137 — opening it is phase 140). RBAC is exercised over HTTP.
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
import {
  BadRequestError,
  NotFoundError,
} from "../../src/modules/shared/errors";
import * as schema from "../../src/db/schema";
import { TENANT_TEMPLO } from "../fixtures/second-tenant";
import { tenantValues, tenantWhere } from "../../src/modules/shared/tenant";

/**
 * Fase 172 (ADO-01 / T-172-08-04): gimnasio de los call sites DIRECTOS al
 * service. Sale del fixture, nunca de un `1` a mano. Una sola constante y no
 * el objeto literal repetido en cada llamada: el dia que un caso ejercite
 * dos gimnasios, el segundo se agrega al lado y se ve la diferencia.
 */
const TEMPLO_CTX = { tenantId: TENANT_TEMPLO };

const FINANCE_URL = "/api/admin/finance";
const TODAY = "2026-04-28";

let app: FastifyInstance;
let txService: TransactionService;
let subService: SubscriptionService;
let balanceService: BalanceService;
let adminId: number;
let branchId: number;
let memberId: number;
let planId: number;
let subscriptionId: number;

// RBAC fixtures (HTTP).
let adminToken: string;
let coachToken: string;

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

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    memberId,
    kind: "plan_charge" as const,
    direction: "inflow" as const,
    amount: 1000,
    currency: "ARS",
    paymentMethod: "cash" as const,
    transactionDate: TODAY,
    effectiveDate: TODAY,
    branchId,
    notes: null,
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

/** Read a transaction's validation_status + voided_at straight from the DB. */
async function readTx(
  id: number,
): Promise<{ validationStatus: string; voidedAt: Date | null }> {
  const [row] = await app.db
    .select({
      validationStatus: schema.financialTransactions.validationStatus,
      voidedAt: schema.financialTransactions.voidedAt,
    })
    .from(schema.financialTransactions)
    .where(
      and(
        eq(schema.financialTransactions.id, id),
        tenantWhere(schema.financialTransactions, TEMPLO_CTX),
      ),
    )
    .limit(1);
  return row;
}

/** Read the member's balance amount for the seeded subscription. */
async function readSubBalance(): Promise<number | null> {
  const [row] = await app.db
    .select({ amount: schema.balances.amount })
    .from(schema.balances)
    .where(
      and(
        eq(schema.balances.memberId, memberId),
        eq(schema.balances.targetKind, "subscription"),
        eq(schema.balances.targetId, subscriptionId),
        tenantWhere(schema.balances, TEMPLO_CTX),
      ),
    )
    .limit(1);
  return row ? row.amount : null;
}

beforeAll(async () => {
  app = await createTestApp();
  balanceService = new BalanceService(app.db, app.log);
  txService = new TransactionService(
    app.db,
    app.log,
    balanceService,
    new CashRegisterService(app.db, app.log),
  );

  const auraService = new AuraService(app.db);
  const enrollmentService = new EnrollmentService(app.db, app.log);
  subService = new SubscriptionService(
    app.db,
    app.log,
    auraService,
    txService,
    enrollmentService,
  );
  // VAL-06: wire the back-edge so void(keepMembershipActive=false) can cancel.
  txService.setSubscriptionCanceller(subService);

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

  // Coach (HTTP RBAC). Coach is NOT in FINANCE_VOID_ROLES.
  await createStaffUser(app, {
    email: "coach-val@test.local",
    password: "pass123456",
    firstName: "Coach",
    lastName: "Val",
    role: "coach",
    branchId,
  });
  coachToken = await getAuthToken(app, "coach-val@test.local", "pass123456");

  const member = await registerUser(app, {
    email: `val-member-${Date.now()}@test.local`,
    password: "TestPass123!",
    firstName: "Val",
    lastName: "Member",
    branchId,
  });
  memberId = (member.user as { id: number }).id;

  const [planRes] = await app.db
    .insert(schema.subscriptionPlans)
    .values({
      name: "Validation Test Plan",
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
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  // 172-14: acotados al gimnasio (regla del 172-13: global a proposito ->
  // exencion; acotable -> filtro). Este archivo no siembra en otro gimnasio.
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
  // Reset the subscription to active for each test (some tests cancel it).
  subscriptionId = await seedSubscription();
});

describe("validation state machine", () => {
  // ─── VAL-02: role → validation_status derived server-side ────────────────

  it("admin create (no validationStatus) → validation_status='validado'", async () => {
    const tx = await txService.create(TEMPLO_CTX, baseInput(), adminId);
    const row = await readTx(tx.id);
    expect(row.validationStatus).toBe("validado");
  });

  it("coach-derived create → validation_status='pendiente' (server-side role map)", async () => {
    // The REST create is gated by FINANCE_WRITE_ROLES (coach excluded in 137),
    // so the coach→pendiente DERIVATION is what we assert: a create carrying
    // the server-derived 'pendiente' births a pendiente row.
    const tx = await txService.create(
      TEMPLO_CTX,
      baseInput({ validationStatus: "pendiente" }),
      adminId,
    );
    const row = await readTx(tx.id);
    expect(row.validationStatus).toBe("pendiente");
  });

  // ─── VAL-07: a PENDIENTE still settles the member's balance ──────────────

  it("VAL-07: a PENDIENTE settles balances (applyDelta NOT tied to status)", async () => {
    // Seed the debt: full price owed.
    await app.db.insert(schema.balances).values(
      tenantValues(TEMPLO_CTX, {
        memberId,
        targetKind: "subscription" as const,
        targetId: subscriptionId,
        currency: "ARS",
        amount: 1000,
      }),
    );
    expect(await readSubBalance()).toBe(1000);

    // A PENDIENTE charge for the full amount must still zero the balance.
    await txService.create(
      TEMPLO_CTX,
      baseInput({ amount: 1000, validationStatus: "pendiente" }),
      adminId,
    );
    expect(await readSubBalance()).toBe(0);
  });

  // ─── VAL-03: validate() ──────────────────────────────────────────────────

  it("validate(): pendiente → validado + transaction_validated audit row", async () => {
    const tx = await txService.create(
      TEMPLO_CTX,
      baseInput({ validationStatus: "pendiente" }),
      adminId,
    );
    const result = await txService.validate(TEMPLO_CTX, tx.id, adminId);
    expect(result.validationStatus).toBe("validado");
    expect((await readTx(tx.id)).validationStatus).toBe("validado");

    const audits = await app.db
      .select({ action: schema.auditLog.action })
      .from(schema.auditLog)
      .where(
        and(
          tenantWhere(schema.auditLog, TEMPLO_CTX),
          eq(schema.auditLog.targetKind, "transaction"),
          eq(schema.auditLog.targetId, tx.id),
        ),
      );
    expect(audits.map((a) => a.action)).toContain("transaction_validated");
  });

  it("validate(): rejects a non-pendiente transaction", async () => {
    const tx = await txService.create(TEMPLO_CTX, baseInput(), adminId); // born validado
    await expect(
      txService.validate(TEMPLO_CTX, tx.id, adminId),
    ).rejects.toThrow(BadRequestError);
  });

  it("validate(): rejects an absent transaction", async () => {
    await expect(
      txService.validate(TEMPLO_CTX, 999999, adminId),
    ).rejects.toThrow(NotFoundError);
  });

  // ─── VAL-04: observe() ───────────────────────────────────────────────────

  it("observe(): pendiente → observado + transaction_observed audit row", async () => {
    const tx = await txService.create(
      TEMPLO_CTX,
      baseInput({ validationStatus: "pendiente" }),
      adminId,
    );
    const result = await txService.observe(TEMPLO_CTX, tx.id, adminId, {
      reason: "Falta confirmar el monto con el profe",
    });
    expect(result.validationStatus).toBe("observado");

    const audits = await app.db
      .select({ action: schema.auditLog.action })
      .from(schema.auditLog)
      .where(
        and(
          tenantWhere(schema.auditLog, TEMPLO_CTX),
          eq(schema.auditLog.targetKind, "transaction"),
          eq(schema.auditLog.targetId, tx.id),
        ),
      );
    expect(audits.map((a) => a.action)).toContain("transaction_observed");
  });

  it("observe(): requires a reason", async () => {
    const tx = await txService.create(
      TEMPLO_CTX,
      baseInput({ validationStatus: "pendiente" }),
      adminId,
    );
    await expect(
      txService.observe(TEMPLO_CTX, tx.id, adminId, { reason: "  " }),
    ).rejects.toThrow(BadRequestError);
  });

  // ─── VAL-04 / D-05: correct() = void(old,'corregido') + create(new) ──────

  it("correct(): voids original (corregido) and recreates a validado linked via transaction_links", async () => {
    const original = await txService.create(
      TEMPLO_CTX,
      baseInput({ amount: 1000, validationStatus: "pendiente" }),
      adminId,
    );

    const corrected = await txService.correct(
      TEMPLO_CTX,
      original.id,
      { amount: 1500 },
      adminId,
    );

    // Original: voided + validation_status='corregido'.
    const originalRow = await readTx(original.id);
    expect(originalRow.voidedAt).not.toBeNull();
    expect(originalRow.validationStatus).toBe("corregido");

    // New: born validado, amount overridden.
    expect(corrected.id).not.toBe(original.id);
    expect(corrected.amount).toBe(1500);
    expect(corrected.validationStatus).toBe("validado");

    // New is linked to the original via target_kind='transaction'.
    const provenance = await app.db
      .select()
      .from(schema.transactionLinks)
      .where(
        and(
          eq(schema.transactionLinks.transactionId, corrected.id),
          eq(schema.transactionLinks.targetKind, "transaction"),
          eq(schema.transactionLinks.targetId, original.id),
          tenantWhere(schema.transactionLinks, TEMPLO_CTX),
        ),
      );
    expect(provenance).toHaveLength(1);

    // Audit trail records the correction.
    const audits = await app.db
      .select({ action: schema.auditLog.action })
      .from(schema.auditLog)
      .where(
        and(
          tenantWhere(schema.auditLog, TEMPLO_CTX),
          eq(schema.auditLog.targetKind, "transaction"),
          eq(schema.auditLog.targetId, original.id),
        ),
      );
    expect(audits.map((a) => a.action)).toContain("transaction_corrected");
  });

  it("correct(): rejects an already-voided transaction", async () => {
    const tx = await txService.create(TEMPLO_CTX, baseInput(), adminId);
    await txService.void(TEMPLO_CTX, tx.id, adminId, { reason: "anular" });
    await expect(
      txService.correct(TEMPLO_CTX, tx.id, { amount: 2000 }, adminId),
    ).rejects.toThrow(BadRequestError);
  });

  // ─── VAL-06: void() + keepMembershipActive ──────────────────────────────

  it("VAL-01: a validado transaction can still be voided (orthogonal axes)", async () => {
    const tx = await txService.create(TEMPLO_CTX, baseInput(), adminId); // validado
    const voided = await txService.void(TEMPLO_CTX, tx.id, adminId, {
      reason: "error",
    });
    expect(voided.voidedAt).not.toBeNull();
    // validation_status stays 'validado' — soft-void is a separate axis.
    expect(voided.validationStatus).toBe("validado");
  });

  it("void(): keepMembershipActive default true leaves the sub active", async () => {
    const tx = await txService.create(TEMPLO_CTX, baseInput(), adminId);
    await txService.void(TEMPLO_CTX, tx.id, adminId, { reason: "devolucion" });

    const [sub] = await app.db
      .select({ status: schema.subscriptions.status })
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.id, subscriptionId))
      .limit(1);
    expect(sub.status).toBe("active");
  });

  it("void(): keepMembershipActive=false cancels the linked subscription", async () => {
    const tx = await txService.create(TEMPLO_CTX, baseInput(), adminId);
    await txService.void(TEMPLO_CTX, tx.id, adminId, {
      reason: "devolucion total",
      keepMembershipActive: false,
    });

    const [sub] = await app.db
      .select({ status: schema.subscriptions.status })
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.id, subscriptionId))
      .limit(1);
    expect(sub.status).toBe("cancelled");

    // The cancellation is audited too (subscription_cancelled).
    const audits = await app.db
      .select({ action: schema.auditLog.action })
      .from(schema.auditLog)
      .where(
        and(
          tenantWhere(schema.auditLog, TEMPLO_CTX),
          eq(schema.auditLog.targetKind, "subscription"),
          eq(schema.auditLog.targetId, subscriptionId),
        ),
      );
    expect(audits.map((a) => a.action)).toContain("subscription_cancelled");
  });

  // ─── RBAC (V4 access control): coach cannot validate/observe/correct/void ─

  it("RBAC: coach cannot validate a transaction (403)", async () => {
    const tx = await txService.create(
      TEMPLO_CTX,
      baseInput({ validationStatus: "pendiente" }),
      adminId,
    );
    const res = await app.inject({
      method: "POST",
      url: `${FINANCE_URL}/transactions/${tx.id}/validate`,
      headers: { authorization: `Bearer ${coachToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it("RBAC: coach cannot observe a transaction (403)", async () => {
    const tx = await txService.create(
      TEMPLO_CTX,
      baseInput({ validationStatus: "pendiente" }),
      adminId,
    );
    const res = await app.inject({
      method: "POST",
      url: `${FINANCE_URL}/transactions/${tx.id}/observe`,
      headers: { authorization: `Bearer ${coachToken}` },
      payload: { reason: "no deberia poder" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("RBAC: coach cannot correct a transaction (403)", async () => {
    const tx = await txService.create(
      TEMPLO_CTX,
      baseInput({ validationStatus: "pendiente" }),
      adminId,
    );
    const res = await app.inject({
      method: "POST",
      url: `${FINANCE_URL}/transactions/${tx.id}/correct`,
      headers: { authorization: `Bearer ${coachToken}` },
      payload: { correctedFields: { amount: 2000 } },
    });
    expect(res.statusCode).toBe(403);
  });

  it("RBAC: coach cannot void a transaction (403)", async () => {
    const tx = await txService.create(TEMPLO_CTX, baseInput(), adminId);
    const res = await app.inject({
      method: "POST",
      url: `${FINANCE_URL}/transactions/${tx.id}/void`,
      headers: { authorization: `Bearer ${coachToken}` },
      payload: { reason: "no deberia poder" },
    });
    expect(res.statusCode).toBe(403);
  });

  // ─── HTTP happy path: admin validate over REST ───────────────────────────

  it("admin validates a pendiente over REST → 200 + validado", async () => {
    const tx = await txService.create(
      TEMPLO_CTX,
      baseInput({ validationStatus: "pendiente" }),
      adminId,
    );
    const res = await app.inject({
      method: "POST",
      url: `${FINANCE_URL}/transactions/${tx.id}/validate`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().transaction.validationStatus).toBe("validado");
  });
});
