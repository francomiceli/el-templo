/**
 * Integration tests for Phase 106 Plan 04 — GET /:userId/financial-history.
 *
 * Endpoint: GET /api/admin/members/:userId/financial-history
 *
 * Coverage:
 *   - FH1..FH6 happy path (owner read, member-scoping, ordering, conceptLabel,
 *     voidInfo, pagination)
 *   - FHD1 D-04 privacy override: coach is in MEMBER_ROLES (module hook) but
 *     excluded from FINANCE_READ_ROLES (T-106-01)
 *   - FHD2 unauthenticated → 401
 *   - FHS1..FHS4 country scope + 404 cases (T-106-02 — info-leak avoidance)
 *   - FHV1..FHV4 JSON Schema validation (T-106-05, T-106-07)
 *
 * Runs against the per-worker test MySQL database (eltemplo_test_<POOL_ID>).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  createTestApp,
  cleanAllTestData,
  createStaffUser,
  getAuthToken,
  registerUser,
  ensureEfectivoCaja,
} from "../helpers";
import * as schema from "../../src/db/schema";
import { TENANT_TEMPLO } from "../fixtures/second-tenant";
import { tenantWhere } from "../../src/modules/shared/tenant";

/**
 * Fase 173 (ADO-02): gimnasio de las queries DIRECTAS de este archivo. Con
 * `members` en TENANT_STRICT_MODULES una lectura/escritura de `users` sin
 * estampa hace throw antes de llegar a MySQL.
 */
const TEMPLO_CTX = { tenantId: TENANT_TEMPLO };

const TODAY = "2026-04-28";

function fhUrl(userId: number): string {
  return `/api/admin/members/${userId}/financial-history`;
}

// Generate a unique branch-code suffix per call. Branches are NOT in
// TABLES_TO_CLEAN, so each describe block's beforeAll must use distinct codes
// to avoid UNIQUE collisions across test files within the same vitest worker.
function nextSuffix(prefix: string): string {
  const t = Date.now().toString(36).slice(-5);
  const r = Math.floor(Math.random() * 1000)
    .toString(36)
    .padStart(2, "0");
  return `${prefix}${t}${r}`;
}

interface SeededContext {
  arBranchId: number;
  esBranchId: number;
  ownerToken: string;
  ownerId: number;
  adminArId: number;
  adminArToken: string;
  gestionToken: string;
  recepcionToken: string;
  coachToken: string;
  memberArId: number;
  memberArToken: string;
  memberEsId: number;
  otherMemberArId: number;
  planId: number;
  subArId: number;
  subEsId: number;
}

async function seedFixtures(app: FastifyInstance): Promise<SeededContext> {
  const [ar] = await app.db
    .insert(schema.branches)
    .values({
      name: "AR-MDP-FH",
      code: nextSuffix("AR"),
      country: "AR",
      isVirtual: false,
      isActive: true,
    })
    .$returningId();
  const [es] = await app.db
    .insert(schema.branches)
    .values({
      name: "ES-BCN-FH",
      code: nextSuffix("ES"),
      country: "ES",
      isVirtual: false,
      isActive: true,
    })
    .$returningId();
  await ensureEfectivoCaja(app, ar.id, "ARS");
  // ES branch is a country-scope vehicle; its cash payloads use 'ARS'. Seed the
  // efectivo caja as ARS so they resolve without tripping the currency guard.
  await ensureEfectivoCaja(app, es.id, "ARS");
  return {
    arBranchId: ar.id,
    esBranchId: es.id,
    ownerToken: "",
    ownerId: 0,
    adminArId: 0,
    adminArToken: "",
    gestionToken: "",
    recepcionToken: "",
    coachToken: "",
    memberArId: 0,
    memberArToken: "",
    memberEsId: 0,
    otherMemberArId: 0,
    planId: 0,
    subArId: 0,
    subEsId: 0,
  };
}

async function seedUsersAndPlan(
  app: FastifyInstance,
  ctx: SeededContext,
): Promise<void> {
  // Owner: pre-seeded admin@test.com
  ctx.ownerToken = await getAuthToken(app, "admin@test.com", "adminpass123");
  const [ownerRow] = await app.db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(
      and(
        tenantWhere(schema.users, TEMPLO_CTX),
        eq(schema.users.email, "admin@test.com"),
      ),
    )
    .limit(1);
  ctx.ownerId = ownerRow.id;

  // Admin in AR (non-owner with AR scope).
  ctx.adminArId = await createStaffUser(app, {
    email: "fh-admin-ar@test.local",
    password: "pass123456",
    firstName: "Admin",
    lastName: "AR",
    role: "admin",
    branchId: ctx.arBranchId,
  });
  ctx.adminArToken = await getAuthToken(
    app,
    "fh-admin-ar@test.local",
    "pass123456",
  );

  // Gestion in AR (FINANCE_READ_ROLES).
  await createStaffUser(app, {
    email: "fh-gestion-ar@test.local",
    password: "pass123456",
    firstName: "Gest",
    lastName: "AR",
    role: "gestion",
    branchId: ctx.arBranchId,
  });
  ctx.gestionToken = await getAuthToken(
    app,
    "fh-gestion-ar@test.local",
    "pass123456",
  );

  // Recepcion in AR (FINANCE_READ_ROLES).
  await createStaffUser(app, {
    email: "fh-recep-ar@test.local",
    password: "pass123456",
    firstName: "Recep",
    lastName: "AR",
    role: "recepcion",
    branchId: ctx.arBranchId,
  });
  ctx.recepcionToken = await getAuthToken(
    app,
    "fh-recep-ar@test.local",
    "pass123456",
  );

  // Coach in AR — MEMBER_ROLES admits, FINANCE_READ_ROLES excludes (D-04).
  await createStaffUser(app, {
    email: "fh-coach-ar@test.local",
    password: "pass123456",
    firstName: "Coach",
    lastName: "AR",
    role: "coach",
    branchId: ctx.arBranchId,
  });
  ctx.coachToken = await getAuthToken(
    app,
    "fh-coach-ar@test.local",
    "pass123456",
  );

  // Member in AR.
  const memberAr = await registerUser(app, {
    email: `fh-member-ar-${Date.now()}@test.local`,
    password: "pass123456",
    firstName: "Member",
    lastName: "AR",
    branchId: ctx.arBranchId,
  });
  ctx.memberArId = (memberAr.user as { id: number }).id;
  ctx.memberArToken = memberAr.token as string;

  // Other member in AR (FH2 isolation).
  const otherAr = await registerUser(app, {
    email: `fh-other-ar-${Date.now()}@test.local`,
    password: "pass123456",
    firstName: "Other",
    lastName: "AR",
    branchId: ctx.arBranchId,
  });
  ctx.otherMemberArId = (otherAr.user as { id: number }).id;

  // Member in ES.
  const memberEs = await registerUser(app, {
    email: `fh-member-es-${Date.now()}@test.local`,
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
      name: "FH Test Plan",
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

interface CreatePayloadOverrides {
  memberId?: number;
  branchId?: number;
  amount?: number;
  transactionDate?: string;
  effectiveDate?: string;
  links?: Array<{
    targetKind: string;
    targetId: number;
    allocatedAmount: number;
  }>;
  kind?: string;
}

function createTxPayload(
  ctx: SeededContext,
  overrides: CreatePayloadOverrides = {},
): Record<string, unknown> {
  const memberId = overrides.memberId ?? ctx.memberArId;
  const branchId = overrides.branchId ?? ctx.arBranchId;
  const amount = overrides.amount ?? 10000;
  const links = overrides.links ?? [
    {
      targetKind: "subscription",
      targetId: ctx.subArId,
      allocatedAmount: amount,
    },
  ];
  return {
    memberId,
    kind: overrides.kind ?? "plan_charge",
    direction: "inflow",
    amount,
    currency: "ARS",
    paymentMethod: "cash",
    transactionDate: overrides.transactionDate ?? TODAY,
    effectiveDate: overrides.effectiveDate ?? TODAY,
    branchId,
    notes: null,
    links,
  };
}

async function postTransaction(
  app: FastifyInstance,
  token: string,
  payload: Record<string, unknown>,
): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  const res = await app.inject({
    method: "POST",
    url: "/api/admin/finance/transactions",
    headers: { authorization: `Bearer ${token}` },
    payload,
  });
  return { statusCode: res.statusCode, body: res.json() };
}

describe("GET /admin/members/:userId/financial-history", () => {
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

  // ─── Happy path ───────────────────────────────────────────────────────────

  it("FH1: owner reads any member's history → 200 paginated { rows, total, page, limit }", async () => {
    // Seed one transaction so the response body has a row to assert on.
    const created = await postTransaction(
      app,
      ctx.ownerToken,
      createTxPayload(ctx),
    );
    expect(created.statusCode).toBe(201);

    const res = await app.inject({
      method: "GET",
      url: fhUrl(ctx.memberArId),
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.rows)).toBe(true);
    expect(typeof body.total).toBe("number");
    expect(body.page).toBe(1);
    expect(body.limit).toBe(50);
    expect(body.total).toBe(1);
    expect(body.rows).toHaveLength(1);
  });

  it("FH2: only the requested member's transactions appear (member-scoping)", async () => {
    // 2 for memberAr, 1 for otherMemberAr.
    await postTransaction(app, ctx.ownerToken, createTxPayload(ctx));
    await postTransaction(
      app,
      ctx.ownerToken,
      createTxPayload(ctx, {
        amount: 20000,
        kind: "advance_payment",
        links: [],
      }),
    );
    await postTransaction(
      app,
      ctx.ownerToken,
      createTxPayload(ctx, {
        memberId: ctx.otherMemberArId,
        amount: 5000,
        kind: "advance_payment",
        links: [],
      }),
    );

    const res = await app.inject({
      method: "GET",
      url: fhUrl(ctx.memberArId),
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.total).toBe(2);
    expect(body.rows).toHaveLength(2);
    for (const row of body.rows) {
      expect(row.transaction.memberId).toBe(ctx.memberArId);
    }
  });

  it("FH3: rows ordered by transactionDate DESC", async () => {
    await postTransaction(
      app,
      ctx.ownerToken,
      createTxPayload(ctx, {
        amount: 1000,
        transactionDate: "2026-04-20",
        effectiveDate: "2026-04-20",
        kind: "advance_payment",
        links: [],
      }),
    );
    await postTransaction(
      app,
      ctx.ownerToken,
      createTxPayload(ctx, {
        amount: 2000,
        transactionDate: "2026-04-26",
        effectiveDate: "2026-04-26",
        kind: "advance_payment",
        links: [],
      }),
    );
    await postTransaction(
      app,
      ctx.ownerToken,
      createTxPayload(ctx, {
        amount: 3000,
        transactionDate: "2026-04-22",
        effectiveDate: "2026-04-22",
        kind: "advance_payment",
        links: [],
      }),
    );

    const res = await app.inject({
      method: "GET",
      url: fhUrl(ctx.memberArId),
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
    const dates = res
      .json()
      .rows.map((r: { transaction: { transactionDate: string } }) =>
        String(r.transaction.transactionDate),
      );
    expect(dates).toEqual(["2026-04-26", "2026-04-22", "2026-04-20"]);
    // Defense-in-depth: explicitly assert pairwise descending.
    for (let i = 0; i < dates.length - 1; i++) {
      expect(dates[i] >= dates[i + 1]).toBe(true);
    }
  });

  it("FH4: target_kind='subscription' link includes a non-empty conceptLabel (D-13)", async () => {
    const created = await postTransaction(
      app,
      ctx.ownerToken,
      createTxPayload(ctx),
    );
    expect(created.statusCode).toBe(201);

    const res = await app.inject({
      method: "GET",
      url: fhUrl(ctx.memberArId),
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
    const row = res.json().rows[0];
    expect(row.links).toHaveLength(1);
    expect(row.links[0].targetKind).toBe("subscription");
    expect(row.links[0].targetId).toBe(ctx.subArId);
    expect(typeof row.links[0].conceptLabel).toBe("string");
    expect((row.links[0].conceptLabel as string).length).toBeGreaterThan(0);
  });

  it("FH5: voidInfo populated for voided transactions", async () => {
    const created = await postTransaction(
      app,
      ctx.ownerToken,
      createTxPayload(ctx),
    );
    expect(created.statusCode).toBe(201);
    const txId = (created.body.transaction as { id: number }).id;

    const voidRes = await app.inject({
      method: "POST",
      url: `/api/admin/finance/transactions/${txId}/void`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
      payload: { reason: "test void for FH5" },
    });
    expect(voidRes.statusCode).toBe(200);

    const res = await app.inject({
      method: "GET",
      url: fhUrl(ctx.memberArId),
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
    const row = res.json().rows[0];
    expect(row.voidInfo).toBeDefined();
    expect(typeof row.voidInfo.voidedAt).toBe("string");
    expect(row.voidInfo.voidReason).toBe("test void for FH5");
  });

  it("FH6: pagination — ?limit=2&page=2 returns rows 3-4 of a 5-row dataset", async () => {
    for (let i = 0; i < 5; i++) {
      const dayNum = 20 + i; // 2026-04-20..24
      const day = `2026-04-${String(dayNum).padStart(2, "0")}`;
      const created = await postTransaction(
        app,
        ctx.ownerToken,
        createTxPayload(ctx, {
          amount: 1000 + i,
          transactionDate: day,
          effectiveDate: day,
          kind: "advance_payment",
          links: [],
        }),
      );
      expect(created.statusCode).toBe(201);
    }

    const res = await app.inject({
      method: "GET",
      url: `${fhUrl(ctx.memberArId)}?limit=2&page=2`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.total).toBe(5);
    expect(body.page).toBe(2);
    expect(body.limit).toBe(2);
    expect(body.rows).toHaveLength(2);
  });

  // ─── Happy path: alternative reader roles (FINANCE_READ_ROLES) ────────────

  it("FH-ADMIN: admin in same country reads → 200", async () => {
    await postTransaction(app, ctx.ownerToken, createTxPayload(ctx));
    const res = await app.inject({
      method: "GET",
      url: fhUrl(ctx.memberArId),
      headers: { authorization: `Bearer ${ctx.adminArToken}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it("FH-GESTION: gestion reads → 200 (FINANCE_READ_ROLES)", async () => {
    await postTransaction(app, ctx.ownerToken, createTxPayload(ctx));
    const res = await app.inject({
      method: "GET",
      url: fhUrl(ctx.memberArId),
      headers: { authorization: `Bearer ${ctx.gestionToken}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it("FH-RECEP: recepcion reads → 200 (FINANCE_READ_ROLES)", async () => {
    await postTransaction(app, ctx.ownerToken, createTxPayload(ctx));
    const res = await app.inject({
      method: "GET",
      url: fhUrl(ctx.memberArId),
      headers: { authorization: `Bearer ${ctx.recepcionToken}` },
    });
    expect(res.statusCode).toBe(200);
  });

  // ─── RBAC denial (T-106-01, D-04 privacy override) ───────────────────────

  it("FHD1: coach → 403 (D-04 privacy override — MEMBER_ROLES admits but FINANCE_READ_ROLES excludes)", async () => {
    const res = await app.inject({
      method: "GET",
      url: fhUrl(ctx.memberArId),
      headers: { authorization: `Bearer ${ctx.coachToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it("FHD2: unauthenticated → 401", async () => {
    const res = await app.inject({
      method: "GET",
      url: fhUrl(ctx.memberArId),
    });
    // Module-level hook calls fastify.authenticate first; member token is also
    // rejected at the module hook (MEMBER_ROLES excludes 'member' role).
    expect(res.statusCode).toBe(401);
  });

  it("FHD2-MEMBER: member token → 401 or 403 (members not allowed at module hook)", async () => {
    const res = await app.inject({
      method: "GET",
      url: fhUrl(ctx.memberArId),
      headers: { authorization: `Bearer ${ctx.memberArToken}` },
    });
    expect([401, 403]).toContain(res.statusCode);
  });

  // ─── Country scope (T-106-02) ────────────────────────────────────────────

  it("FHS1: non-owner admin (AR) reads ES-branch member → 404 (info-leak avoidance)", async () => {
    const res = await app.inject({
      method: "GET",
      url: fhUrl(ctx.memberEsId),
      headers: { authorization: `Bearer ${ctx.adminArToken}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it("FHS2: owner reads cross-country (ES) → 200", async () => {
    const res = await app.inject({
      method: "GET",
      url: fhUrl(ctx.memberEsId),
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it("FHS3: GET on non-existent userId → 404", async () => {
    const res = await app.inject({
      method: "GET",
      url: fhUrl(99999999),
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it("FHS4: GET on soft-deleted member → 404", async () => {
    // Soft-delete the AR member directly.
    await app.db
      .update(schema.users)
      .set({ deletedAt: new Date() })
      .where(
        and(
          tenantWhere(schema.users, TEMPLO_CTX),
          eq(schema.users.id, ctx.memberArId),
        ),
      );

    const res = await app.inject({
      method: "GET",
      url: fhUrl(ctx.memberArId),
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    expect(res.statusCode).toBe(404);
  });

  // ─── Validation (T-106-05, T-106-07) ─────────────────────────────────────

  it("FHV1: ?limit=300 → 400 (max 200)", async () => {
    const res = await app.inject({
      method: "GET",
      url: `${fhUrl(ctx.memberArId)}?limit=300`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    expect(res.statusCode).toBe(400);
  });

  it("FHV2: ?page=0 → 400 (minimum 1)", async () => {
    const res = await app.inject({
      method: "GET",
      url: `${fhUrl(ctx.memberArId)}?page=0`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    expect(res.statusCode).toBe(400);
  });

  // Project-wide AJV convention (see test/programs/current-program.test.ts:340
  // and test/scheduling/trials.test.ts:1116): Fastify's default AJV STRIPS
  // unknown querystring fields rather than rejecting them, even when
  // additionalProperties:false is set. Plan 02 V3b and Plan 03 LV5 document
  // the same behavior. Schema enforcement is still proven via wrong-type
  // rejection — FHV1/FHV2 already cover that. FHV3 pins the strip behavior
  // so a future AJV-config change fails this test loudly.
  it("FHV3: ?limit=abc (wrong-type) → 400 (querystring schema enforced via wrong-type rejection)", async () => {
    const res = await app.inject({
      method: "GET",
      url: `${fhUrl(ctx.memberArId)}?limit=abc`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    expect(res.statusCode).toBe(400);
  });

  it("FHV3b: extra unknown query param ?evil=1 is silently stripped (Fastify+AJV default — pinned)", async () => {
    const res = await app.inject({
      method: "GET",
      url: `${fhUrl(ctx.memberArId)}?evil=1`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    // Pin the documented project-wide behavior. Flip to 400 if AJV ever
    // changes to reject; flipping breaks this test loudly.
    expect(res.statusCode).toBe(200);
  });

  // INFO #8 (plan-checker): expected 400 reflects current Fastify+ajv default
  // path coercion behavior — non-integer userId is rejected before reaching
  // the handler (the userId param schema requires { type: "integer", minimum: 1 }).
  // If Fastify changes behavior and returns 500, file an issue and adjust the
  // expected status. The contract here is "non-integer userId is rejected
  // before reaching the handler".
  it("FHV4: userId=abc (non-integer in URL path) → 400", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/members/abc/financial-history",
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    expect(res.statusCode).toBe(400);
  });
});
