/**
 * Integration tests for Phase 108 Plan 01 — GET /:userId/outstanding-concepts.
 *
 * Endpoint: GET /api/admin/members/:userId/outstanding-concepts
 *
 * Cobertura (must_haves Plan 02):
 *   - Happy path: empty array (D-03), subscription description (D-06),
 *     debt_balance fallback (D-06), FIFO order (D-01), ageInDays clamp futuro (D-04).
 *   - RBAC FINANCE_READ_ROLES: coach 403 (D-04 privacy override), admin/recepcion/owner 200, unauth 401.
 *   - Cross-country guard: non-owner cross-country 404 (info-leak), owner cross 200,
 *     virtual branch short-circuit 200.
 *   - Edge cases: member inexistente 404, member soft-deleted 404, amount<=0 filter.
 *
 * Patrón replicado de Phase 106 test/finance/financial-history-api.test.ts.
 *
 * Runs against the per-worker test MySQL DB (eltemplo_test_<POOL_ID>).
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

function ocUrl(userId: number): string {
  return `/api/admin/members/${userId}/outstanding-concepts`;
}

// Generate a unique branch-code suffix per call. Branches are NOT in
// TABLES_TO_CLEAN, so each test file's beforeAll must use distinct codes
// to avoid UNIQUE collisions across describe blocks within the same vitest
// worker. Mismo patrón que financial-history-api.test.ts.
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
  virtualBranchId: number;
  ownerToken: string;
  ownerId: number;
  adminArId: number;
  adminArToken: string;
  adminEsToken: string;
  recepcionToken: string;
  coachToken: string;
  memberArId: number;
  memberArToken: string;
  memberEsId: number;
  memberVirtualId: number;
  planId: number;
  subArId: number;
}

async function seedFixtures(app: FastifyInstance): Promise<SeededContext> {
  const [ar] = await app.db
    .insert(schema.branches)
    .values({
      name: "AR-OC-Test",
      code: nextSuffix("AROC"),
      country: "AR",
      isVirtual: false,
      isActive: true,
    })
    .$returningId();
  const [es] = await app.db
    .insert(schema.branches)
    .values({
      name: "ES-OC-Test",
      code: nextSuffix("ESOC"),
      country: "ES",
      isVirtual: false,
      isActive: true,
    })
    .$returningId();
  const [virt] = await app.db
    .insert(schema.branches)
    .values({
      name: "Virtual-OC-Test",
      code: nextSuffix("VOC"),
      country: "AR",
      isVirtual: true,
      isActive: true,
    })
    .$returningId();
  return {
    arBranchId: ar.id,
    esBranchId: es.id,
    virtualBranchId: virt.id,
    ownerToken: "",
    ownerId: 0,
    adminArId: 0,
    adminArToken: "",
    adminEsToken: "",
    recepcionToken: "",
    coachToken: "",
    memberArId: 0,
    memberArToken: "",
    memberEsId: 0,
    memberVirtualId: 0,
    planId: 0,
    subArId: 0,
  };
}

async function seedUsersAndPlan(
  app: FastifyInstance,
  ctx: SeededContext,
): Promise<void> {
  // Owner: pre-seeded admin@test.com.
  ctx.ownerToken = await getAuthToken(app, "admin@test.com", "adminpass123");
  const [ownerRow] = await app.db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, "admin@test.com"))
    .limit(1);
  ctx.ownerId = ownerRow.id;

  // Admin in AR (non-owner with AR scope).
  ctx.adminArId = await createStaffUser(app, {
    email: "oc-admin-ar@test.local",
    password: "pass123456",
    firstName: "Admin",
    lastName: "AR",
    role: "admin",
    branchId: ctx.arBranchId,
  });
  ctx.adminArToken = await getAuthToken(
    app,
    "oc-admin-ar@test.local",
    "pass123456",
  );

  // Admin in ES (non-owner with ES scope) — para cross-country tests.
  await createStaffUser(app, {
    email: "oc-admin-es@test.local",
    password: "pass123456",
    firstName: "Admin",
    lastName: "ES",
    role: "admin",
    branchId: ctx.esBranchId,
  });
  ctx.adminEsToken = await getAuthToken(
    app,
    "oc-admin-es@test.local",
    "pass123456",
  );

  // Recepcion in AR (FINANCE_READ_ROLES).
  await createStaffUser(app, {
    email: "oc-recep-ar@test.local",
    password: "pass123456",
    firstName: "Recep",
    lastName: "AR",
    role: "recepcion",
    branchId: ctx.arBranchId,
  });
  ctx.recepcionToken = await getAuthToken(
    app,
    "oc-recep-ar@test.local",
    "pass123456",
  );

  // Coach in AR — MEMBER_ROLES admits, FINANCE_READ_ROLES excludes (D-04).
  await createStaffUser(app, {
    email: "oc-coach-ar@test.local",
    password: "pass123456",
    firstName: "Coach",
    lastName: "AR",
    role: "coach",
    branchId: ctx.arBranchId,
  });
  ctx.coachToken = await getAuthToken(
    app,
    "oc-coach-ar@test.local",
    "pass123456",
  );

  // Member in AR.
  const memberAr = await registerUser(app, {
    email: `oc-member-ar-${Date.now()}@test.local`,
    password: "pass123456",
    firstName: "Member",
    lastName: "AR",
    branchId: ctx.arBranchId,
  });
  ctx.memberArId = (memberAr.user as { id: number }).id;
  ctx.memberArToken = memberAr.token as string;

  // Member in ES (cross-country fixture).
  const memberEs = await registerUser(app, {
    email: `oc-member-es-${Date.now()}@test.local`,
    password: "pass123456",
    firstName: "Member",
    lastName: "ES",
    branchId: ctx.esBranchId,
  });
  ctx.memberEsId = (memberEs.user as { id: number }).id;

  // Member en sucursal virtual (cross-country short-circuit fixture).
  const memberVirt = await registerUser(app, {
    email: `oc-member-virt-${Date.now()}@test.local`,
    password: "pass123456",
    firstName: "Member",
    lastName: "Virtual",
    branchId: ctx.virtualBranchId,
  });
  ctx.memberVirtualId = (memberVirt.user as { id: number }).id;

  // Subscription plan.
  const [plan] = await app.db
    .insert(schema.subscriptionPlans)
    .values({
      name: "Performance Mensual",
      planTier: "flex",
      bookingMode: "flexible",
      planCategory: "presencial",
      priceRegular: 50000,
      priceZero: 0,
      durationDays: 30,
      classesPerWeek: 3,
      currency: "ARS",
    })
    .$returningId();
  ctx.planId = plan.id;

  // Subscription canónica para member AR — startDate = "2026-03-01"
  // (D-06: "Mensualidad Marzo 2026 — Performance Mensual").
  const [subAr] = await app.db
    .insert(schema.subscriptions)
    .values({
      userId: ctx.memberArId,
      planId: ctx.planId,
      branchId: ctx.arBranchId,
      status: "active",
      startDate: "2026-03-01",
      pricePaid: 50000,
      currency: "ARS",
      priceTypeApplied: "regular",
    })
    .$returningId();
  ctx.subArId = subAr.id;
}

/**
 * Insert un balance directo en la tabla `balances`. Bypassa el flow de
 * TransactionService — válido para tests del read endpoint que solo
 * consulta la cache (D-01: source = balances WHERE amount > 0). Igual a
 * los inserts directos que hace transaction-service.test.ts en su setup.
 */
async function insertBalance(
  app: FastifyInstance,
  data: {
    memberId: number;
    targetKind: "subscription" | "debt_balance";
    targetId: number;
    currency: string;
    amount: number;
    // Offset en días para balances.createdAt (fecha de creación de la deuda,
    // base de la antigüedad). undefined → default de la DB (ahora).
    createdOffsetDays?: number;
  },
): Promise<void> {
  const createdAt =
    data.createdOffsetDays === undefined
      ? undefined
      : (() => {
          const d = new Date();
          d.setUTCHours(0, 0, 0, 0);
          d.setUTCDate(d.getUTCDate() + data.createdOffsetDays!);
          return d;
        })();
  await app.db.insert(schema.balances).values({
    memberId: data.memberId,
    targetKind: data.targetKind,
    targetId: data.targetId,
    currency: data.currency,
    amount: data.amount,
    ...(createdAt ? { createdAt } : {}),
  });
}

/**
 * Limpieza canónica: cleanAllTestData NO incluye balances /
 * financial_transactions / transaction_links. Los borramos a mano per
 * patrón establecido por transactions-api.test.ts:1317-1330.
 */
async function cleanFinanceTables(app: FastifyInstance): Promise<void> {
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
}

describe("GET /admin/members/:userId/outstanding-concepts (Phase 108)", () => {
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
    await cleanFinanceTables(app);
    await seedUsersAndPlan(app, ctx);
  });

  // ─── Happy paths ────────────────────────────────────────────────────────

  it("OC1: returns { concepts: [] } when member has no outstanding balances (D-03)", async () => {
    const res = await app.inject({
      method: "GET",
      url: ocUrl(ctx.memberArId),
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toEqual({ concepts: [] });
  });

  it("OC2: subscription concept → description 'Mensualidad Marzo 2026 — Performance Mensual' (D-06)", async () => {
    await insertBalance(app, {
      memberId: ctx.memberArId,
      targetKind: "subscription",
      targetId: ctx.subArId,
      currency: "ARS",
      amount: 20000,
    });

    const res = await app.inject({
      method: "GET",
      url: ocUrl(ctx.memberArId),
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.concepts).toHaveLength(1);

    const concept = body.concepts[0];
    expect(concept.targetKind).toBe("subscription");
    expect(concept.targetId).toBe(ctx.subArId);
    expect(concept.description).toBe(
      "Mensualidad Marzo 2026 — Performance Mensual",
    );
    expect(concept.currency).toBe("ARS");
    expect(concept.balance).toBe(20000);
    expect(concept.effectiveDate).toBe("2026-03-01");
    expect(concept.ageInDays).toBeGreaterThanOrEqual(0);
    expect(typeof concept.ageInDays).toBe("number");
  });

  it("OC3: debt_balance concept → fallback description 'Saldo libre #<id>' (D-06)", async () => {
    await insertBalance(app, {
      memberId: ctx.memberArId,
      targetKind: "debt_balance",
      targetId: 42,
      currency: "ARS",
      amount: 5000,
    });

    const res = await app.inject({
      method: "GET",
      url: ocUrl(ctx.memberArId),
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.concepts).toHaveLength(1);
    expect(body.concepts[0].targetKind).toBe("debt_balance");
    expect(body.concepts[0].targetId).toBe(42);
    expect(body.concepts[0].description).toBe("Saldo libre #42");
    expect(body.concepts[0].balance).toBe(5000);
    expect(body.concepts[0].currency).toBe("ARS");
  });

  it("OC4: orders concepts by effectiveDate ASC — FIFO mixed subscription + debt_balance (D-01)", async () => {
    // Subscription #1: startDate '2026-01-15' (más vieja).
    const [subOld] = await app.db
      .insert(schema.subscriptions)
      .values({
        userId: ctx.memberArId,
        planId: ctx.planId,
        branchId: ctx.arBranchId,
        status: "active",
        startDate: "2026-01-15",
        pricePaid: 50000,
        currency: "ARS",
        priceTypeApplied: "regular",
      })
      .$returningId();

    // Subscription #2: ya seeded en seedUsersAndPlan con startDate '2026-03-01'.

    await insertBalance(app, {
      memberId: ctx.memberArId,
      targetKind: "subscription",
      targetId: subOld.id,
      currency: "ARS",
      amount: 10000,
    });
    await insertBalance(app, {
      memberId: ctx.memberArId,
      targetKind: "debt_balance",
      targetId: 99,
      currency: "ARS",
      amount: 5000,
    });
    await insertBalance(app, {
      memberId: ctx.memberArId,
      targetKind: "subscription",
      targetId: ctx.subArId,
      currency: "ARS",
      amount: 20000,
    });

    const res = await app.inject({
      method: "GET",
      url: ocUrl(ctx.memberArId),
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.concepts).toHaveLength(3);

    // FIFO ASC: subOld (2026-01-15) → debt_balance (createdAt today, ~2026-04+)
    // → subAr (2026-03-01). El debt_balance se ordena por createdAt (NOW),
    // que es posterior a 2026-03-01. Asserción robusta: pairwise ASC.
    const dates = body.concepts.map(
      (c: { effectiveDate: string }) => c.effectiveDate,
    );
    for (let i = 0; i < dates.length - 1; i++) {
      expect(dates[i] <= dates[i + 1]).toBe(true);
    }
    // Primer concepto debe ser el subscription más viejo.
    expect(body.concepts[0].targetKind).toBe("subscription");
    expect(body.concepts[0].targetId).toBe(subOld.id);
    expect(body.concepts[0].effectiveDate).toBe("2026-01-15");
  });

  it("OC5: un plan programado a futuro SÍ es deuda hoy; ageInDays desde la creación", async () => {
    // Un plan scheduled a futuro se carga con la condición de pagar ahora → su
    // saldo es deuda cobrable hoy. La antigüedad se cuenta desde la creación de
    // la deuda; el devengo (start_date futuro) se conserva en effectiveDate.
    const future = new Date();
    future.setDate(future.getDate() + 30);
    const futureStr = future.toISOString().slice(0, 10);

    const [subFuture] = await app.db
      .insert(schema.subscriptions)
      .values({
        userId: ctx.memberArId,
        planId: ctx.planId,
        branchId: ctx.arBranchId,
        status: "scheduled",
        startDate: futureStr,
        pricePaid: 50000,
        currency: "ARS",
        priceTypeApplied: "regular",
      })
      .$returningId();

    await insertBalance(app, {
      memberId: ctx.memberArId,
      targetKind: "subscription",
      targetId: subFuture.id,
      currency: "ARS",
      amount: 10000,
      createdOffsetDays: -5, // deuda creada hace 5 días
    });

    const res = await app.inject({
      method: "GET",
      url: ocUrl(ctx.memberArId),
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    // El plan futuro SÍ es deuda cobrable hoy → aparece.
    expect(body.concepts).toHaveLength(1);
    expect(body.concepts[0].balance).toBe(10000);
    // Antigüedad desde la creación (5d), no clampeada por el devengo futuro.
    expect(body.concepts[0].ageInDays).toBe(5);
    // El devengo (start_date futuro) se conserva en effectiveDate.
    expect(body.concepts[0].effectiveDate).toBe(futureStr);
  });

  it("OC6: ageInDays se mide desde la creación de la deuda, no desde el devengo (Bug 2)", async () => {
    // subArId tiene startDate '2026-03-01' (devengo pasado). La deuda se crea
    // hace 4 días. Antigüedad debe ser 4 (creación), no ~129 (devengo); el
    // devengo se conserva en effectiveDate.
    await insertBalance(app, {
      memberId: ctx.memberArId,
      targetKind: "subscription",
      targetId: ctx.subArId,
      currency: "ARS",
      amount: 20000,
      createdOffsetDays: -4,
    });

    const res = await app.inject({
      method: "GET",
      url: ocUrl(ctx.memberArId),
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.concepts).toHaveLength(1);
    expect(body.concepts[0].ageInDays).toBe(4);
    expect(body.concepts[0].effectiveDate).toBe("2026-03-01");
  });

  // ─── RBAC (D-04 / FINANCE_READ_ROLES) ──────────────────────────────────

  it("OC-RBAC1: coach role → 403 (D-04 privacy override)", async () => {
    await insertBalance(app, {
      memberId: ctx.memberArId,
      targetKind: "subscription",
      targetId: ctx.subArId,
      currency: "ARS",
      amount: 20000,
    });
    const res = await app.inject({
      method: "GET",
      url: ocUrl(ctx.memberArId),
      headers: { authorization: `Bearer ${ctx.coachToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it("OC-RBAC2: recepcion role → 200 (FINANCE_READ_ROLES includes recepcion)", async () => {
    await insertBalance(app, {
      memberId: ctx.memberArId,
      targetKind: "subscription",
      targetId: ctx.subArId,
      currency: "ARS",
      amount: 20000,
    });
    const res = await app.inject({
      method: "GET",
      url: ocUrl(ctx.memberArId),
      headers: { authorization: `Bearer ${ctx.recepcionToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().concepts).toHaveLength(1);
  });

  it("OC-RBAC3: admin role (same country) → 200", async () => {
    await insertBalance(app, {
      memberId: ctx.memberArId,
      targetKind: "subscription",
      targetId: ctx.subArId,
      currency: "ARS",
      amount: 20000,
    });
    const res = await app.inject({
      method: "GET",
      url: ocUrl(ctx.memberArId),
      headers: { authorization: `Bearer ${ctx.adminArToken}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it("OC-RBAC4: unauthenticated → 401", async () => {
    const res = await app.inject({
      method: "GET",
      url: ocUrl(ctx.memberArId),
    });
    expect(res.statusCode).toBe(401);
  });

  it("OC-RBAC5: member token → 401 or 403 (members not allowed at module hook)", async () => {
    const res = await app.inject({
      method: "GET",
      url: ocUrl(ctx.memberArId),
      headers: { authorization: `Bearer ${ctx.memberArToken}` },
    });
    expect([401, 403]).toContain(res.statusCode);
  });

  // ─── Cross-country guard (info-leak prevention) ────────────────────────

  it("OC-CC1: non-owner admin (ES scope) reads AR member → 404 (NOT 403, info-leak avoid)", async () => {
    const res = await app.inject({
      method: "GET",
      url: ocUrl(ctx.memberArId),
      headers: { authorization: `Bearer ${ctx.adminEsToken}` },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe("No encontrado");
  });

  it("OC-CC2: owner reads cross-country (ES member) → 200", async () => {
    const res = await app.inject({
      method: "GET",
      url: ocUrl(ctx.memberEsId),
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ concepts: [] });
  });

  it("OC-CC3: virtual branch short-circuits country check (non-owner ES admin reads virtual member) → 200", async () => {
    const res = await app.inject({
      method: "GET",
      url: ocUrl(ctx.memberVirtualId),
      headers: { authorization: `Bearer ${ctx.adminEsToken}` },
    });
    expect(res.statusCode).toBe(200);
  });

  // ─── Edge cases ────────────────────────────────────────────────────────

  it("OC-EDGE1: member does not exist → 404", async () => {
    const res = await app.inject({
      method: "GET",
      url: ocUrl(99999999),
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it("OC-EDGE2: member is soft-deleted → 404", async () => {
    await app.db
      .update(schema.users)
      .set({ deletedAt: new Date() })
      .where(eq(schema.users.id, ctx.memberArId));

    const res = await app.inject({
      method: "GET",
      url: ocUrl(ctx.memberArId),
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it("OC-EDGE3: filters out balances with amount = 0 and amount < 0 (only amount > 0 returned)", async () => {
    // amount = 5000 → debe aparecer.
    await insertBalance(app, {
      memberId: ctx.memberArId,
      targetKind: "subscription",
      targetId: ctx.subArId,
      currency: "ARS",
      amount: 5000,
    });
    // amount = 0 → filtrado.
    await insertBalance(app, {
      memberId: ctx.memberArId,
      targetKind: "debt_balance",
      targetId: 100,
      currency: "ARS",
      amount: 0,
    });
    // amount = -1000 (saldo a favor, D-08) → filtrado por gt(amount, 0).
    await insertBalance(app, {
      memberId: ctx.memberArId,
      targetKind: "debt_balance",
      targetId: 101,
      currency: "ARS",
      amount: -1000,
    });

    const res = await app.inject({
      method: "GET",
      url: ocUrl(ctx.memberArId),
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.concepts).toHaveLength(1);
    expect(body.concepts[0].balance).toBe(5000);
  });

  it("OC-EDGE4: non-integer userId in path → 400", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/members/abc/outstanding-concepts",
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    expect(res.statusCode).toBe(400);
  });
});
