/**
 * Integration tests for Phase 106 Plan 02 — finance HTTP write endpoints.
 *
 * Coverage:
 *   - POST /api/admin/finance/transactions (create)
 *   - POST /api/admin/finance/transactions/:id/void (void)
 *
 * Verifies:
 *   - Happy paths per role (C1..C6)
 *   - RBAC denial: coach (T-106-01), recepcion on adjustment (T-106-06),
 *     unauthenticated, recepcion on void (D-03)
 *   - Country scope on branchId (T-106-03) and on void target (T-106-04)
 *   - JSON Schema validation: required, enums, additionalProperties:false
 *   - C6 pins the BalanceRow shape so Phase 107/108 frontends can rely on it
 *     (Warning #5 from plan-checker)
 *
 * Runs against the per-worker test MySQL database (eltemplo_test_<POOL_ID>).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  createTestApp,
  cleanAllTestData,
  createStaffUser,
  getAuthToken,
  registerUser,
} from "../helpers";
import * as schema from "../../src/db/schema";

const FINANCE_URL = "/api/admin/finance";
const TODAY = "2026-04-28";

// Generate a unique branch-code suffix per call. Branches aren't cleaned by
// cleanAllTestData (not in TABLES_TO_CLEAN), so each describe block's beforeAll
// must use distinct codes to avoid UNIQUE constraint violations across blocks.
function nextSuffix(prefix: string): string {
  const t = Date.now().toString(36).slice(-5);
  const r = Math.floor(Math.random() * 1000)
    .toString(36)
    .padStart(2, "0");
  // Total length: prefix (2) + t (5) + r (2) = up to 9 chars (well under 20).
  return `${prefix}${t}${r}`;
}

interface SeededContext {
  arBranchId: number;
  esBranchId: number;
  ownerToken: string;
  ownerId: number;
  adminArId: number;
  adminArToken: string;
  adminEsId: number;
  adminEsToken: string;
  gestionId: number;
  gestionToken: string;
  recepcionId: number;
  recepcionToken: string;
  coachId: number;
  coachToken: string;
  memberArId: number;
  memberEsId: number;
  planId: number;
  subArId: number;
  subEsId: number;
}

async function seedFixtures(app: FastifyInstance): Promise<SeededContext> {
  // Country='AR' branch — unique code per call to avoid UNIQUE collisions
  // across describe blocks (branches survive cleanAllTestData).
  const [ar] = await app.db
    .insert(schema.branches)
    .values({
      name: "AR-MDP-Test",
      code: nextSuffix("AR"),
      country: "AR",
      isVirtual: false,
      isActive: true,
    })
    .$returningId();

  // Country='ES' branch.
  const [es] = await app.db
    .insert(schema.branches)
    .values({
      name: "ES-BCN-Test",
      code: nextSuffix("ES"),
      country: "ES",
      isVirtual: false,
      isActive: true,
    })
    .$returningId();

  return {
    arBranchId: ar.id,
    esBranchId: es.id,
    // Filled in below per beforeEach (users get cleaned).
    ownerToken: "",
    ownerId: 0,
    adminArId: 0,
    adminArToken: "",
    adminEsId: 0,
    adminEsToken: "",
    gestionId: 0,
    gestionToken: "",
    recepcionId: 0,
    recepcionToken: "",
    coachId: 0,
    coachToken: "",
    memberArId: 0,
    memberEsId: 0,
    planId: 0,
    subArId: 0,
    subEsId: 0,
  };
}

async function seedUsersAndPlan(
  app: FastifyInstance,
  ctx: SeededContext,
): Promise<void> {
  // Owner: use the pre-seeded admin@test.com (role='owner', branch='Test Branch').
  ctx.ownerToken = await getAuthToken(app, "admin@test.com", "adminpass123");
  const [ownerRow] = await app.db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, "admin@test.com"))
    .limit(1);
  ctx.ownerId = ownerRow.id;

  // Admin in AR.
  ctx.adminArId = await createStaffUser(app, {
    email: "admin-ar@test.local",
    password: "pass123456",
    firstName: "Admin",
    lastName: "AR",
    role: "admin",
    branchId: ctx.arBranchId,
  });
  ctx.adminArToken = await getAuthToken(
    app,
    "admin-ar@test.local",
    "pass123456",
  );

  // Admin in ES.
  ctx.adminEsId = await createStaffUser(app, {
    email: "admin-es@test.local",
    password: "pass123456",
    firstName: "Admin",
    lastName: "ES",
    role: "admin",
    branchId: ctx.esBranchId,
  });
  ctx.adminEsToken = await getAuthToken(
    app,
    "admin-es@test.local",
    "pass123456",
  );

  // Gestion in AR.
  ctx.gestionId = await createStaffUser(app, {
    email: "gestion-ar@test.local",
    password: "pass123456",
    firstName: "Gest",
    lastName: "AR",
    role: "gestion",
    branchId: ctx.arBranchId,
  });
  ctx.gestionToken = await getAuthToken(
    app,
    "gestion-ar@test.local",
    "pass123456",
  );

  // Recepcion in AR.
  ctx.recepcionId = await createStaffUser(app, {
    email: "recep-ar@test.local",
    password: "pass123456",
    firstName: "Recep",
    lastName: "AR",
    role: "recepcion",
    branchId: ctx.arBranchId,
  });
  ctx.recepcionToken = await getAuthToken(
    app,
    "recep-ar@test.local",
    "pass123456",
  );

  // Coach in AR.
  ctx.coachId = await createStaffUser(app, {
    email: "coach-ar@test.local",
    password: "pass123456",
    firstName: "Coach",
    lastName: "AR",
    role: "coach",
    branchId: ctx.arBranchId,
  });
  ctx.coachToken = await getAuthToken(app, "coach-ar@test.local", "pass123456");

  // Member in AR.
  const memberAr = await registerUser(app, {
    email: `member-ar-${Date.now()}@test.local`,
    password: "pass123456",
    firstName: "Member",
    lastName: "AR",
    branchId: ctx.arBranchId,
  });
  ctx.memberArId = (memberAr.user as { id: number }).id;

  // Member in ES.
  const memberEs = await registerUser(app, {
    email: `member-es-${Date.now()}@test.local`,
    password: "pass123456",
    firstName: "Member",
    lastName: "ES",
    branchId: ctx.esBranchId,
  });
  ctx.memberEsId = (memberEs.user as { id: number }).id;

  // Subscription plan.
  const [plan] = await app.db
    .insert(schema.subscriptionPlans)
    .values({
      name: "Finance API Test Plan",
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
  ctx.planId = plan.id;

  // Subscription for AR member at AR branch.
  const [subAr] = await app.db
    .insert(schema.subscriptions)
    .values({
      userId: ctx.memberArId,
      planId: ctx.planId,
      branchId: ctx.arBranchId,
      status: "active",
      startDate: TODAY,
      pricePaid: 100000,
      currency: "ARS",
      priceTypeApplied: "regular",
    })
    .$returningId();
  ctx.subArId = subAr.id;

  // Subscription for ES member at ES branch.
  const [subEs] = await app.db
    .insert(schema.subscriptions)
    .values({
      userId: ctx.memberEsId,
      planId: ctx.planId,
      branchId: ctx.esBranchId,
      status: "active",
      startDate: TODAY,
      pricePaid: 100000,
      currency: "ARS",
      priceTypeApplied: "regular",
    })
    .$returningId();
  ctx.subEsId = subEs.id;
}

function basePayload(
  ctx: SeededContext,
  overrides: Record<string, unknown> = {},
) {
  return {
    memberId: ctx.memberArId,
    kind: "plan_charge",
    direction: "inflow",
    amount: 10000,
    currency: "ARS",
    paymentMethod: "cash",
    transactionDate: TODAY,
    effectiveDate: TODAY,
    branchId: ctx.arBranchId,
    notes: null,
    links: [
      {
        targetKind: "subscription",
        targetId: ctx.subArId,
        allocatedAmount: 10000,
      },
    ],
    ...overrides,
  };
}

describe("Finance API — POST /transactions", () => {
  let app: FastifyInstance;
  const ctx = {} as SeededContext;

  beforeAll(async () => {
    app = await createTestApp();
    const seeded = await seedFixtures(app);
    Object.assign(ctx, seeded);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    // Re-seed users (cleanAllTestData wipes users != admin@test.com),
    // member, plan, subscriptions. Branches survive (not in TABLES_TO_CLEAN).
    await seedUsersAndPlan(app, ctx);
  });

  // ─── Happy path ───────────────────────────────────────────────────────────

  it("C1: owner creates kind=plan_charge → 201 with { transaction, links, affectedBalances }", async () => {
    const res = await app.inject({
      method: "POST",
      url: `${FINANCE_URL}/transactions`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
      payload: basePayload(ctx),
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.transaction).toMatchObject({
      kind: "plan_charge",
      direction: "inflow",
      amount: 10000,
      voidedAt: null,
    });
    expect(body.transaction.id).toBeGreaterThan(0);
    expect(body.links).toHaveLength(1);
    expect(Array.isArray(body.affectedBalances)).toBe(true);
  });

  it("C2: gestion creates kind=plan_charge → 201 (D-02 includes gestion)", async () => {
    const res = await app.inject({
      method: "POST",
      url: `${FINANCE_URL}/transactions`,
      headers: { authorization: `Bearer ${ctx.gestionToken}` },
      payload: basePayload(ctx),
    });
    expect(res.statusCode).toBe(201);
  });

  it("C3: recepcion creates kind=plan_charge → 201 (D-02 includes recepcion)", async () => {
    const res = await app.inject({
      method: "POST",
      url: `${FINANCE_URL}/transactions`,
      headers: { authorization: `Bearer ${ctx.recepcionToken}` },
      payload: basePayload(ctx),
    });
    expect(res.statusCode).toBe(201);
  });

  it("C4: owner creates kind=adjustment → 201 (D-01)", async () => {
    const res = await app.inject({
      method: "POST",
      url: `${FINANCE_URL}/transactions`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
      payload: basePayload(ctx, {
        kind: "adjustment",
        amount: 5000,
        links: [],
      }),
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().transaction.kind).toBe("adjustment");
  });

  it("C5: gestion creates kind=adjustment → 201 (D-01 includes gestion)", async () => {
    const res = await app.inject({
      method: "POST",
      url: `${FINANCE_URL}/transactions`,
      headers: { authorization: `Bearer ${ctx.gestionToken}` },
      payload: basePayload(ctx, {
        kind: "adjustment",
        amount: 5000,
        links: [],
      }),
    });
    expect(res.statusCode).toBe(201);
  });

  it("C6: response.affectedBalances entries have the pinned BalanceRow shape (D-10 contract)", async () => {
    const res = await app.inject({
      method: "POST",
      url: `${FINANCE_URL}/transactions`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
      payload: basePayload(ctx),
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(Array.isArray(body.affectedBalances)).toBe(true);
    expect(body.affectedBalances.length).toBeGreaterThan(0);
    // Pin BalanceRow shape per D-10 — Phase 107/108 frontends rely on this contract.
    expect(body.affectedBalances[0]).toMatchObject({
      id: expect.any(Number),
      memberId: ctx.memberArId,
      targetKind: expect.any(String),
      targetId: expect.any(Number),
      currency: expect.any(String),
      amount: expect.any(Number),
    });
  });

  // ─── RBAC denial (T-106-01, T-106-06) ────────────────────────────────────

  it("D1: coach POST → 403 at module hook (T-106-01)", async () => {
    const res = await app.inject({
      method: "POST",
      url: `${FINANCE_URL}/transactions`,
      headers: { authorization: `Bearer ${ctx.coachToken}` },
      payload: basePayload(ctx),
    });
    expect(res.statusCode).toBe(403);
  });

  it("D2: recepcion POST kind=adjustment → 403 (T-106-06: FINANCE_ADJUSTMENT_ROLES excludes recepcion)", async () => {
    const res = await app.inject({
      method: "POST",
      url: `${FINANCE_URL}/transactions`,
      headers: { authorization: `Bearer ${ctx.recepcionToken}` },
      payload: basePayload(ctx, {
        kind: "adjustment",
        amount: 5000,
        links: [],
      }),
    });
    expect(res.statusCode).toBe(403);
  });

  it("D3: unauthenticated POST → 401", async () => {
    const res = await app.inject({
      method: "POST",
      url: `${FINANCE_URL}/transactions`,
      payload: basePayload(ctx),
    });
    expect(res.statusCode).toBe(401);
  });

  // ─── Country scope (T-106-03) ────────────────────────────────────────────

  it("S1: non-owner admin (AR) POST against ES branch → 403 (T-106-03)", async () => {
    const res = await app.inject({
      method: "POST",
      url: `${FINANCE_URL}/transactions`,
      headers: { authorization: `Bearer ${ctx.adminArToken}` },
      payload: basePayload(ctx, {
        branchId: ctx.esBranchId,
        memberId: ctx.memberEsId,
        links: [
          {
            targetKind: "subscription",
            targetId: ctx.subEsId,
            allocatedAmount: 10000,
          },
        ],
      }),
    });
    expect(res.statusCode).toBe(403);
  });

  it("S2: non-owner admin (AR) POST against AR branch → 201 (control)", async () => {
    const res = await app.inject({
      method: "POST",
      url: `${FINANCE_URL}/transactions`,
      headers: { authorization: `Bearer ${ctx.adminArToken}` },
      payload: basePayload(ctx),
    });
    expect(res.statusCode).toBe(201);
  });

  it("S3: owner POST against any branch regardless of country → 201 (owner bypass)", async () => {
    const res = await app.inject({
      method: "POST",
      url: `${FINANCE_URL}/transactions`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
      payload: basePayload(ctx, {
        branchId: ctx.esBranchId,
        memberId: ctx.memberEsId,
        links: [
          {
            targetKind: "subscription",
            targetId: ctx.subEsId,
            allocatedAmount: 10000,
          },
        ],
      }),
    });
    expect(res.statusCode).toBe(201);
  });

  it("S4: non-owner POST with non-existent branchId → 404 from handler", async () => {
    const res = await app.inject({
      method: "POST",
      url: `${FINANCE_URL}/transactions`,
      headers: { authorization: `Bearer ${ctx.adminArToken}` },
      payload: basePayload(ctx, { branchId: 99999999 }),
    });
    expect(res.statusCode).toBe(404);
  });

  // ─── Validation (T-106-05, T-106-07) ─────────────────────────────────────

  it("V1: POST without `links` → 400 (required)", async () => {
    const payload = basePayload(ctx) as Record<string, unknown>;
    delete payload.links;
    const res = await app.inject({
      method: "POST",
      url: `${FINANCE_URL}/transactions`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
      payload,
    });
    expect(res.statusCode).toBe(400);
  });

  it("V2: POST with kind='invalid' → 400 (enum violation)", async () => {
    const res = await app.inject({
      method: "POST",
      url: `${FINANCE_URL}/transactions`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
      payload: basePayload(ctx, { kind: "invalid" }),
    });
    expect(res.statusCode).toBe(400);
  });

  // Note: Fastify's default AJV STRIPS extra properties silently for
  // additionalProperties:false rather than rejecting (project-wide convention,
  // see test/programs/current-program.test.ts:340 and test/scheduling/trials.test.ts:1116).
  // Schema is still in force — we verify the body schema is enforced via
  // wrong-type rejection (V3) and the link-item schema via wrong link-type (V4).
  it("V3: POST with wrong-typed amount → 400 (body schema enforced)", async () => {
    const res = await app.inject({
      method: "POST",
      url: `${FINANCE_URL}/transactions`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
      payload: basePayload(ctx, { amount: "not-a-number" }),
    });
    expect(res.statusCode).toBe(400);
  });

  it("V4: POST with wrong-typed link.allocatedAmount → 400 (link schema enforced)", async () => {
    const res = await app.inject({
      method: "POST",
      url: `${FINANCE_URL}/transactions`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
      payload: basePayload(ctx, {
        links: [
          {
            targetKind: "subscription",
            targetId: ctx.subArId,
            allocatedAmount: "not-a-number",
          },
        ],
      }),
    });
    expect(res.statusCode).toBe(400);
  });

  // Documented project behavior: extra fields are silently STRIPPED, not
  // rejected. We assert the contract (transaction succeeds, no 500) so any
  // future AJV-config change that flips the behavior to 400 will fail this
  // test loudly and the team can decide whether to update the convention.
  it("V3b: POST with extra unknown body field is silently stripped (Fastify AJV default behavior)", async () => {
    const res = await app.inject({
      method: "POST",
      url: `${FINANCE_URL}/transactions`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
      payload: basePayload(ctx, { extraField: 1 }),
    });
    // Project convention: 201 (extra field stripped), not 400.
    expect(res.statusCode).toBe(201);
  });

  it("V5: POST with paymentMethod='bitcoin' → 400 (enum violation)", async () => {
    const res = await app.inject({
      method: "POST",
      url: `${FINANCE_URL}/transactions`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
      payload: basePayload(ctx, { paymentMethod: "bitcoin" }),
    });
    expect(res.statusCode).toBe(400);
  });

  it("V6: POST where Σ allocatedAmount !== amount → 400 (BadRequestError mapped by handleServiceError)", async () => {
    const res = await app.inject({
      method: "POST",
      url: `${FINANCE_URL}/transactions`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
      payload: basePayload(ctx, {
        amount: 10000,
        links: [
          {
            targetKind: "subscription",
            targetId: ctx.subArId,
            allocatedAmount: 9999,
          },
        ],
      }),
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("Finance API — POST /transactions/:id/void", () => {
  let app: FastifyInstance;
  const ctx = {} as SeededContext;

  beforeAll(async () => {
    app = await createTestApp();
    const seeded = await seedFixtures(app);
    Object.assign(ctx, seeded);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    await seedUsersAndPlan(app, ctx);
  });

  /** Create a transaction via the API, return its id. Owner posts it so we
   *  bypass country-scope concerns at create time; the void handler is the
   *  thing under test. */
  async function createArTxn(): Promise<number> {
    const res = await app.inject({
      method: "POST",
      url: `${FINANCE_URL}/transactions`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
      payload: basePayload(ctx),
    });
    if (res.statusCode !== 201) {
      throw new Error(
        `createArTxn setup failed: ${res.statusCode} ${res.body}`,
      );
    }
    return res.json().transaction.id as number;
  }

  /** Insert an ES-country transaction directly via Drizzle (no API path so
   *  we don't need cross-country owner gymnastics for VS1). */
  async function insertEsTxn(): Promise<number> {
    const [inserted] = await app.db
      .insert(schema.financialTransactions)
      .values({
        memberId: ctx.memberEsId,
        kind: "plan_charge",
        direction: "inflow",
        amount: 10000,
        currency: "ARS",
        paymentMethod: "cash",
        transactionDate: TODAY,
        effectiveDate: TODAY,
        branchId: ctx.esBranchId,
        recordedBy: ctx.ownerId,
      });
    const txnId = (inserted as { insertId: number }).insertId;
    await app.db.insert(schema.transactionLinks).values({
      transactionId: txnId,
      targetKind: "subscription",
      targetId: ctx.subEsId,
      allocatedAmount: 10000,
    });
    return txnId;
  }

  // ─── Happy path ───────────────────────────────────────────────────────────

  it("VC1: owner voids own-country transaction → 200 with { transaction: { voidedAt, voidedBy, voidReason } }", async () => {
    const txnId = await createArTxn();
    const res = await app.inject({
      method: "POST",
      url: `${FINANCE_URL}/transactions/${txnId}/void`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
      payload: { reason: "Cancelacion solicitada por el alumno" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.transaction.id).toBe(txnId);
    expect(body.transaction.voidedAt).not.toBeNull();
    expect(body.transaction.voidedBy).toBe(ctx.ownerId);
    expect(body.transaction.voidReason).toBe(
      "Cancelacion solicitada por el alumno",
    );
  });

  it("VC2: admin voids → 200", async () => {
    const txnId = await createArTxn();
    const res = await app.inject({
      method: "POST",
      url: `${FINANCE_URL}/transactions/${txnId}/void`,
      headers: { authorization: `Bearer ${ctx.adminArToken}` },
      payload: { reason: "Error de carga" },
    });
    expect(res.statusCode).toBe(200);
  });

  it("VC3: gestion voids → 200", async () => {
    const txnId = await createArTxn();
    const res = await app.inject({
      method: "POST",
      url: `${FINANCE_URL}/transactions/${txnId}/void`,
      headers: { authorization: `Bearer ${ctx.gestionToken}` },
      payload: { reason: "Ajuste contable" },
    });
    expect(res.statusCode).toBe(200);
  });

  // ─── RBAC denial ──────────────────────────────────────────────────────────

  it("VD1: recepcion void → 403 (D-03 excludes recepcion)", async () => {
    const txnId = await createArTxn();
    const res = await app.inject({
      method: "POST",
      url: `${FINANCE_URL}/transactions/${txnId}/void`,
      headers: { authorization: `Bearer ${ctx.recepcionToken}` },
      payload: { reason: "Devolucion" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("VD2: coach void → 403 at module hook (T-106-01)", async () => {
    const txnId = await createArTxn();
    const res = await app.inject({
      method: "POST",
      url: `${FINANCE_URL}/transactions/${txnId}/void`,
      headers: { authorization: `Bearer ${ctx.coachToken}` },
      payload: { reason: "Test" },
    });
    expect(res.statusCode).toBe(403);
  });

  // ─── Country scope (T-106-04) ─────────────────────────────────────────────

  it("VS1: non-owner admin (AR) voids ES-branch transaction → 404 (info-leak avoidance)", async () => {
    const esTxnId = await insertEsTxn();
    const res = await app.inject({
      method: "POST",
      url: `${FINANCE_URL}/transactions/${esTxnId}/void`,
      headers: { authorization: `Bearer ${ctx.adminArToken}` },
      payload: { reason: "Test" },
    });
    expect(res.statusCode).toBe(404);
  });

  it("VS2: owner voids cross-country → 200 (owner bypass)", async () => {
    const esTxnId = await insertEsTxn();
    const res = await app.inject({
      method: "POST",
      url: `${FINANCE_URL}/transactions/${esTxnId}/void`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
      payload: { reason: "Owner cross-country void" },
    });
    expect(res.statusCode).toBe(200);
  });

  // ─── Validation ───────────────────────────────────────────────────────────

  it("VV1: POST /void without `reason` → 400", async () => {
    const txnId = await createArTxn();
    const res = await app.inject({
      method: "POST",
      url: `${FINANCE_URL}/transactions/${txnId}/void`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it("VV2: POST /void with reason='' → 400 (minLength:1)", async () => {
    const txnId = await createArTxn();
    const res = await app.inject({
      method: "POST",
      url: `${FINANCE_URL}/transactions/${txnId}/void`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
      payload: { reason: "" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("VV3: POST /void for non-existent id → 404", async () => {
    const res = await app.inject({
      method: "POST",
      url: `${FINANCE_URL}/transactions/99999999/void`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
      payload: { reason: "Test" },
    });
    expect(res.statusCode).toBe(404);
  });

  it("VV4: POST /void for already-voided transaction → 400", async () => {
    const txnId = await createArTxn();
    const first = await app.inject({
      method: "POST",
      url: `${FINANCE_URL}/transactions/${txnId}/void`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
      payload: { reason: "First void" },
    });
    expect(first.statusCode).toBe(200);
    const second = await app.inject({
      method: "POST",
      url: `${FINANCE_URL}/transactions/${txnId}/void`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
      payload: { reason: "Second void attempt" },
    });
    expect(second.statusCode).toBe(400);
  });
});
