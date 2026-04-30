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

  it("S4: non-owner POST with non-existent branchId → 403 (Phase 110: scope gate runs before handler)", async () => {
    // Phase 110 semantics: requireBranchAccess preHandler runs before the
    // handler's existence check. canAccessBranch returns false for any branch
    // not in the actor's scope (including non-existent branches), so the
    // request short-circuits with 403 BRANCH_OUT_OF_SCOPE — security-correct
    // because non-owner callers cannot enumerate branch IDs by status code.
    const res = await app.inject({
      method: "POST",
      url: `${FINANCE_URL}/transactions`,
      headers: { authorization: `Bearer ${ctx.adminArToken}` },
      payload: basePayload(ctx, { branchId: 99999999 }),
    });
    expect(res.statusCode).toBe(403);
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

describe("Finance API — GET /transactions", () => {
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

  /** Helper: seed N AR transactions via the API (owner).
   *  Each txn uses its own fresh subscription so transaction_links UNIQUE
   *  (transaction_id, target_kind, target_id) is irrelevant — and the
   *  allocatedAmount === amount per TXN-06. The first txn reuses ctx.subArId
   *  (already seeded); subsequent txns get fresh subs.
   */
  async function seedNArTxns(n: number): Promise<void> {
    for (let i = 0; i < n; i++) {
      let subId = ctx.subArId;
      if (i > 0) {
        const [sub] = await app.db
          .insert(schema.subscriptions)
          .values({
            userId: ctx.memberArId,
            planId: ctx.planId,
            branchId: ctx.arBranchId,
            status: "active",
            startDate: TODAY,
            pricePaid: 50000,
            currency: "ARS",
            priceTypeApplied: "regular",
          })
          .$returningId();
        subId = sub.id;
      }
      const amount = 1000 + i;
      const res = await app.inject({
        method: "POST",
        url: `${FINANCE_URL}/transactions`,
        headers: { authorization: `Bearer ${ctx.ownerToken}` },
        payload: basePayload(ctx, {
          amount,
          links: [
            {
              targetKind: "subscription",
              targetId: subId,
              allocatedAmount: amount,
            },
          ],
        }),
      });
      if (res.statusCode !== 201) {
        throw new Error(`seedNArTxns failed: ${res.statusCode} ${res.body}`);
      }
    }
  }

  /** Helper: seed an ES transaction directly via Drizzle. */
  async function insertEsTxn(amount = 5000): Promise<number> {
    const [inserted] = await app.db
      .insert(schema.financialTransactions)
      .values({
        memberId: ctx.memberEsId,
        kind: "plan_charge",
        direction: "inflow",
        amount,
        currency: "EUR",
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
      allocatedAmount: amount,
    });
    return txnId;
  }

  // ─── Happy path + filters ─────────────────────────────────────────────────

  it("L1: owner GET (no filters) → 200 with { rows, total, page=1, limit=50 }", async () => {
    await seedNArTxns(1);
    const res = await app.inject({
      method: "GET",
      url: `${FINANCE_URL}/transactions`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty("rows");
    expect(body).toHaveProperty("total");
    expect(body.page).toBe(1);
    expect(body.limit).toBe(50);
    expect(body.total).toBeGreaterThanOrEqual(1);
  });

  it("L2: filter by kind=plan_charge → returns only plan_charge rows", async () => {
    // 1 plan_charge.
    await seedNArTxns(1);
    // 1 adjustment (no links).
    await app.inject({
      method: "POST",
      url: `${FINANCE_URL}/transactions`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
      payload: basePayload(ctx, {
        kind: "adjustment",
        amount: 500,
        links: [],
      }),
    });

    const res = await app.inject({
      method: "GET",
      url: `${FINANCE_URL}/transactions?kind=plan_charge`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    for (const r of body.rows) {
      expect(r.kind).toBe("plan_charge");
    }
  });

  it("L3: filter by dateFrom + dateTo (inclusive)", async () => {
    // Seed a 2nd subscription for the second txn (UNIQUE link per sub).
    const [sub2] = await app.db
      .insert(schema.subscriptions)
      .values({
        userId: ctx.memberArId,
        planId: ctx.planId,
        branchId: ctx.arBranchId,
        status: "active",
        startDate: TODAY,
        pricePaid: 50000,
        currency: "ARS",
        priceTypeApplied: "regular",
      })
      .$returningId();
    await app.inject({
      method: "POST",
      url: `${FINANCE_URL}/transactions`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
      payload: basePayload(ctx, {
        amount: 1000,
        transactionDate: "2026-01-01",
        effectiveDate: "2026-01-01",
        links: [
          {
            targetKind: "subscription",
            targetId: ctx.subArId,
            allocatedAmount: 1000,
          },
        ],
      }),
    });
    await app.inject({
      method: "POST",
      url: `${FINANCE_URL}/transactions`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
      payload: basePayload(ctx, {
        amount: 2000,
        transactionDate: "2026-02-15",
        effectiveDate: "2026-02-15",
        links: [
          {
            targetKind: "subscription",
            targetId: sub2.id,
            allocatedAmount: 2000,
          },
        ],
      }),
    });

    const res = await app.inject({
      method: "GET",
      url: `${FINANCE_URL}/transactions?dateFrom=2026-02-01&dateTo=2026-02-28`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.total).toBe(1);
    expect(body.rows[0].transactionDate).toBe("2026-02-15");
  });

  it("L4: filter by paymentMethod=transfer", async () => {
    const [sub2] = await app.db
      .insert(schema.subscriptions)
      .values({
        userId: ctx.memberArId,
        planId: ctx.planId,
        branchId: ctx.arBranchId,
        status: "active",
        startDate: TODAY,
        pricePaid: 50000,
        currency: "ARS",
        priceTypeApplied: "regular",
      })
      .$returningId();
    await app.inject({
      method: "POST",
      url: `${FINANCE_URL}/transactions`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
      payload: basePayload(ctx, {
        amount: 1000,
        paymentMethod: "cash",
        links: [
          {
            targetKind: "subscription",
            targetId: ctx.subArId,
            allocatedAmount: 1000,
          },
        ],
      }),
    });
    await app.inject({
      method: "POST",
      url: `${FINANCE_URL}/transactions`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
      payload: basePayload(ctx, {
        amount: 2000,
        paymentMethod: "transfer",
        links: [
          {
            targetKind: "subscription",
            targetId: sub2.id,
            allocatedAmount: 2000,
          },
        ],
      }),
    });

    const res = await app.inject({
      method: "GET",
      url: `${FINANCE_URL}/transactions?paymentMethod=transfer`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.total).toBe(1);
    expect(body.rows[0].paymentMethod).toBe("transfer");
  });

  it("L5: filter by memberId returns only that member's rows", async () => {
    // First, seed one for the AR member.
    await seedNArTxns(1);
    // Insert a tx for ES member (different branch + member).
    await insertEsTxn(3000);

    const res = await app.inject({
      method: "GET",
      url: `${FINANCE_URL}/transactions?memberId=${ctx.memberArId}`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    for (const r of body.rows) {
      expect(r.memberId).toBe(ctx.memberArId);
    }
  });

  it("L6: filter by search returns rows whose member name matches", async () => {
    await seedNArTxns(1);
    const res = await app.inject({
      method: "GET",
      url: `${FINANCE_URL}/transactions?search=Member`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.total).toBeGreaterThanOrEqual(1);
    for (const r of body.rows) {
      expect(r.memberName.toLowerCase()).toContain("member");
    }
  });

  it("L7: pagination — limit=2 page=2 returns rows 3-4", async () => {
    await seedNArTxns(5);
    const p1 = await app.inject({
      method: "GET",
      url: `${FINANCE_URL}/transactions?limit=2&page=1`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    expect(p1.statusCode).toBe(200);
    const p1Body = p1.json();
    expect(p1Body.rows).toHaveLength(2);
    expect(p1Body.total).toBe(5);
    expect(p1Body.page).toBe(1);
    expect(p1Body.limit).toBe(2);

    const p2 = await app.inject({
      method: "GET",
      url: `${FINANCE_URL}/transactions?limit=2&page=2`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    expect(p2.statusCode).toBe(200);
    const p2Body = p2.json();
    expect(p2Body.rows).toHaveLength(2);
    expect(p2Body.total).toBe(5);
    expect(p2Body.page).toBe(2);

    const ids = new Set([
      ...p1Body.rows.map((r: { id: number }) => r.id),
      ...p2Body.rows.map((r: { id: number }) => r.id),
    ]);
    expect(ids.size).toBe(4);
  });

  // ─── Owner-only country override ─────────────────────────────────────────

  it("L8: owner GET ?country=AR returns only AR rows", async () => {
    await seedNArTxns(2);
    await insertEsTxn(5000);

    const res = await app.inject({
      method: "GET",
      url: `${FINANCE_URL}/transactions?country=AR`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    for (const r of body.rows) {
      expect(r.branchId).toBe(ctx.arBranchId);
    }
  });

  it("L9: owner GET ?country=ES returns only ES rows (override works for any 2-letter code)", async () => {
    await seedNArTxns(2);
    await insertEsTxn(5000);

    const res = await app.inject({
      method: "GET",
      url: `${FINANCE_URL}/transactions?country=ES`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.total).toBe(1);
    expect(body.rows[0].branchId).toBe(ctx.esBranchId);
  });

  it("L10: non-owner-AR GET ?country=ES → query is IGNORED (Blocker #1 — non-owner override)", async () => {
    await seedNArTxns(2);
    await insertEsTxn(5000);

    const res = await app.inject({
      method: "GET",
      url: `${FINANCE_URL}/transactions?country=ES`,
      headers: { authorization: `Bearer ${ctx.adminArToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    // Must contain ONLY AR rows — non-owner cannot override.
    expect(body.total).toBeGreaterThanOrEqual(1);
    for (const r of body.rows) {
      expect(r.branchId).toBe(ctx.arBranchId);
    }
  });

  // ─── RBAC denial (T-106-01) ──────────────────────────────────────────────

  it("LD1: coach GET → 403 at module hook (D-04)", async () => {
    const res = await app.inject({
      method: "GET",
      url: `${FINANCE_URL}/transactions`,
      headers: { authorization: `Bearer ${ctx.coachToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it("LD2: unauthenticated GET → 401", async () => {
    const res = await app.inject({
      method: "GET",
      url: `${FINANCE_URL}/transactions`,
    });
    expect(res.statusCode).toBe(401);
  });

  // ─── Country scope baseline (T-106-02) ───────────────────────────────────

  it("LS1: non-owner admin (AR) GET → list excludes ES branch transactions", async () => {
    await seedNArTxns(1);
    await insertEsTxn(5000);

    const res = await app.inject({
      method: "GET",
      url: `${FINANCE_URL}/transactions`,
      headers: { authorization: `Bearer ${ctx.adminArToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    for (const r of body.rows) {
      expect(r.branchId).toBe(ctx.arBranchId);
    }
  });

  it("LS2: owner GET (no country query) → list contains rows from both countries", async () => {
    await seedNArTxns(1);
    await insertEsTxn(5000);

    const res = await app.inject({
      method: "GET",
      url: `${FINANCE_URL}/transactions`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const branchIds = new Set(
      body.rows.map((r: { branchId: number }) => r.branchId),
    );
    expect(branchIds.has(ctx.arBranchId)).toBe(true);
    expect(branchIds.has(ctx.esBranchId)).toBe(true);
  });

  // ─── Validation / DoS (T-106-05, T-106-07) ───────────────────────────────

  it("LV1: limit=300 → 400 (> max 200)", async () => {
    const res = await app.inject({
      method: "GET",
      url: `${FINANCE_URL}/transactions?limit=300`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    expect(res.statusCode).toBe(400);
  });

  it("LV2: limit=0 → 400 (minimum 1)", async () => {
    const res = await app.inject({
      method: "GET",
      url: `${FINANCE_URL}/transactions?limit=0`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    expect(res.statusCode).toBe(400);
  });

  it("LV3: page=0 → 400 (minimum 1)", async () => {
    const res = await app.inject({
      method: "GET",
      url: `${FINANCE_URL}/transactions?page=0`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    expect(res.statusCode).toBe(400);
  });

  it("LV4: kind=foo → 400 (enum violation)", async () => {
    const res = await app.inject({
      method: "GET",
      url: `${FINANCE_URL}/transactions?kind=foo`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    expect(res.statusCode).toBe(400);
  });

  // Note: Fastify default AJV STRIPS unknown query params silently rather
  // than rejecting (project-wide convention; see Plan 02 V3b note). Schema
  // still enforces typed params via wrong-type rejection (LV1..LV4 above).
  // We assert the documented strip behavior here so a future AJV-config
  // change (which would flip the response to 400) breaks loudly.
  it("LV5: extra unknown query param ?evil=1 is silently stripped (Fastify AJV default)", async () => {
    const res = await app.inject({
      method: "GET",
      url: `${FINANCE_URL}/transactions?evil=1`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
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

describe("Finance API — GET /transactions/summary", () => {
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
    // Summary aggregates ALL financial_transactions (no INNER JOIN to users),
    // so prior describe blocks' rows would otherwise leak into our totals.
    // financial_transactions / transaction_links / balances aren't in
    // TABLES_TO_CLEAN; clear them explicitly here.
    const conn = await app.dbPool.getConnection();
    try {
      await conn.query("SET FOREIGN_KEY_CHECKS=0");
      await conn.query("DELETE FROM `transaction_links`");
      await conn.query("DELETE FROM `financial_transactions`");
      await conn.query("DELETE FROM `balances`");
      await conn.query("SET FOREIGN_KEY_CHECKS=1");
    } finally {
      conn.release();
    }
    await seedUsersAndPlan(app, ctx);
  });

  /** Helper: create an AR txn via owner POST. Returns the created txn id. */
  async function createArTxn(amount = 1000): Promise<number> {
    const [sub] = await app.db
      .insert(schema.subscriptions)
      .values({
        userId: ctx.memberArId,
        planId: ctx.planId,
        branchId: ctx.arBranchId,
        status: "active",
        startDate: TODAY,
        pricePaid: 50000,
        currency: "ARS",
        priceTypeApplied: "regular",
      })
      .$returningId();
    const res = await app.inject({
      method: "POST",
      url: `${FINANCE_URL}/transactions`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
      payload: basePayload(ctx, {
        amount,
        links: [
          {
            targetKind: "subscription",
            targetId: sub.id,
            allocatedAmount: amount,
          },
        ],
      }),
    });
    if (res.statusCode !== 201) {
      throw new Error(`createArTxn failed: ${res.statusCode} ${res.body}`);
    }
    return res.json().transaction.id as number;
  }

  /** Helper: insert an ES inflow txn directly via Drizzle. */
  async function insertEsTxn(amount = 5000): Promise<number> {
    const [inserted] = await app.db
      .insert(schema.financialTransactions)
      .values({
        memberId: ctx.memberEsId,
        kind: "plan_charge",
        direction: "inflow",
        amount,
        currency: "EUR",
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
      allocatedAmount: amount,
    });
    return txnId;
  }

  // ─── Happy path ──────────────────────────────────────────────────────────

  it("SU1: owner GET → 200 with { monthlyRevenue, revenueByMethod (5 keys), revenueByBranch }", async () => {
    await createArTxn(1000);
    const res = await app.inject({
      method: "GET",
      url: `${FINANCE_URL}/transactions/summary`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty("monthlyRevenue");
    expect(body).toHaveProperty("revenueByMethod");
    expect(body).toHaveProperty("revenueByBranch");
    expect(body.revenueByMethod).toEqual({
      cash: 1000,
      transfer: 0,
      card: 0,
      aura_credit: 0,
      internal: 0,
    });
  });

  it("SU2: dateFrom/dateTo + branchId filters narrow the response", async () => {
    // 1 txn at default AR branch.
    await createArTxn(1000);
    // 1 txn at ES branch (filtered OUT by branchId param).
    await insertEsTxn(5000);

    const res = await app.inject({
      method: "GET",
      url: `${FINANCE_URL}/transactions/summary?branchId=${ctx.arBranchId}&dateFrom=${TODAY}&dateTo=${TODAY}`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.monthlyRevenue).toBe(1000);
    expect(body.revenueByBranch).toHaveLength(1);
    expect(body.revenueByBranch[0].branchId).toBe(ctx.arBranchId);
  });

  it("SU3: voided transactions are excluded (regression guard for Plan 09 swap)", async () => {
    const t1 = await createArTxn(1000);
    await createArTxn(2000);
    const voidRes = await app.inject({
      method: "POST",
      url: `${FINANCE_URL}/transactions/${t1}/void`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
      payload: { reason: "test void" },
    });
    expect(voidRes.statusCode).toBe(200);

    const res = await app.inject({
      method: "GET",
      url: `${FINANCE_URL}/transactions/summary`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().monthlyRevenue).toBe(2000);
  });

  // ─── Owner-only country override (Blocker #1 reconciliation) ─────────────

  it("SU4: owner GET ?country=AR → revenueByBranch contains only AR branches", async () => {
    await createArTxn(1000);
    await insertEsTxn(5000);

    const res = await app.inject({
      method: "GET",
      url: `${FINANCE_URL}/transactions/summary?country=AR`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.monthlyRevenue).toBe(1000);
    for (const b of body.revenueByBranch) {
      expect(b.branchId).toBe(ctx.arBranchId);
    }
  });

  it("SU5: owner GET ?country=ES → revenueByBranch contains only ES branches", async () => {
    await createArTxn(1000);
    await insertEsTxn(5000);

    const res = await app.inject({
      method: "GET",
      url: `${FINANCE_URL}/transactions/summary?country=ES`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.monthlyRevenue).toBe(5000);
    expect(body.revenueByBranch).toHaveLength(1);
    expect(body.revenueByBranch[0].branchId).toBe(ctx.esBranchId);
  });

  it("SU6: non-owner-AR GET ?country=ES → query is IGNORED, response scoped to AR", async () => {
    await createArTxn(1000);
    await insertEsTxn(5000);

    const res = await app.inject({
      method: "GET",
      url: `${FINANCE_URL}/transactions/summary?country=ES`,
      headers: { authorization: `Bearer ${ctx.adminArToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    // Non-owner override silently ignored; revenue equals AR-only sum.
    expect(body.monthlyRevenue).toBe(1000);
    for (const b of body.revenueByBranch) {
      expect(b.branchId).toBe(ctx.arBranchId);
    }
  });

  // ─── RBAC + scope baseline ──────────────────────────────────────────────

  it("SUD1: coach GET → 403", async () => {
    const res = await app.inject({
      method: "GET",
      url: `${FINANCE_URL}/transactions/summary`,
      headers: { authorization: `Bearer ${ctx.coachToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it("SUS1: non-owner-AR GET (no ?country) → revenueByBranch contains only AR branches", async () => {
    await createArTxn(1000);
    await insertEsTxn(5000);

    const res = await app.inject({
      method: "GET",
      url: `${FINANCE_URL}/transactions/summary`,
      headers: { authorization: `Bearer ${ctx.adminArToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    for (const b of body.revenueByBranch) {
      expect(b.branchId).toBe(ctx.arBranchId);
    }
  });

  // ─── Validation ──────────────────────────────────────────────────────────

  // Note: Fastify default AJV STRIPS unknown query params silently (project-
  // wide convention; see Plan 02 V3b note + GET /transactions LV5). Wrong-
  // type query params are still rejected — branchId="abc" returns 400.
  it("SUV1: branchId=abc → 400 (wrong-type query param)", async () => {
    const res = await app.inject({
      method: "GET",
      url: `${FINANCE_URL}/transactions/summary?branchId=abc`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    expect(res.statusCode).toBe(400);
  });
});
