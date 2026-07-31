/**
 * Phase 153-02 (DEUDA-04) — integration tests for
 * GET /api/admin/reports/expired-members ("Vencidos" cohort).
 *
 * Coverage matrix:
 *   - Window (D-05): member expired 59 days ago appears; 61 days ago excluded.
 *   - Renewal: member with an expired sub in-window BUT an active sub today is
 *     excluded (negation of activeMemberExists).
 *   - Dirty data: sub with end_date < start_date (cancelled, in-window) excluded
 *     by the end_date >= start_date guard.
 *   - Dedup: member with two expired subs in-window appears once, with the most
 *     recent expiry (smallest daysOverdue).
 *   - No amount (D-06): the row exposes planName/expiryDate/daysOverdue and NOT
 *     amount/currency.
 *   - RBAC (D-12): coach 403, recepcion 403 (guard inherited from the reports
 *     plugin-level onRequest hook — no per-route guard).
 *   - Cross-country / scope: gestion AR does not see the ES expired member;
 *     owner sees both.
 *   - Coexistence (D-07): a member with a debt (balance amount>0) AND an expired
 *     plan appears in /expired-members and still in /outstanding-balances.
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
import { tenantValues } from "../../src/modules/shared/tenant";
import { TENANT_TEMPLO } from "../fixtures/second-tenant";

/**
 * 172-15: `TEMPLO_CTX` es el gimnasio de este archivo. Las queries directas de
 * los tests pasan por `app.dbPool` igual que las de la app, asi que con
 * `finance` en `TENANT_STRICT_MODULES` una lectura o una siembra sobre las
 * tablas strict sin gimnasio hace throw antes de llegar a MySQL.
 */
const TEMPLO_CTX = { tenantId: TENANT_TEMPLO };

const REPORTS_URL = "/api/admin/reports";

interface SeededContext {
  arBranchId: number;
  esBranchId: number;
  ownerToken: string;
  ownerId: number;
  adminArToken: string;
  gestionArId: number;
  gestionArToken: string;
  coachId: number;
  coachToken: string;
  recepcionArToken: string;
  planArId: number;
  planEsId: number;
}

function nextSuffix(prefix: string): string {
  const t = Date.now().toString(36).slice(-5);
  const r = Math.floor(Math.random() * 1000)
    .toString(36)
    .padStart(2, "0");
  return `${prefix}${t}${r}`;
}

function dateOffset(days: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

async function seedFixtures(app: FastifyInstance): Promise<SeededContext> {
  const [ar] = await app.db
    .insert(schema.branches)
    .values({
      name: "AR-MDP-EM1",
      code: nextSuffix("EM"),
      country: "AR",
      isVirtual: false,
      isActive: true,
    })
    .$returningId();
  const [es] = await app.db
    .insert(schema.branches)
    .values({
      name: "ES-BCN-EM2",
      code: nextSuffix("EM"),
      country: "ES",
      isVirtual: false,
      isActive: true,
    })
    .$returningId();

  return {
    arBranchId: ar.id,
    esBranchId: es.id,
    ownerToken: "",
    ownerId: 0,
    adminArToken: "",
    gestionArId: 0,
    gestionArToken: "",
    coachId: 0,
    coachToken: "",
    recepcionArToken: "",
    planArId: 0,
    planEsId: 0,
  };
}

async function seedRolesAndPlans(
  app: FastifyInstance,
  ctx: SeededContext,
): Promise<void> {
  // admin@test.com is seeded as role='owner'.
  ctx.ownerToken = await getAuthToken(app, "admin@test.com", "adminpass123");
  const [ownerRow] = await app.db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, "admin@test.com"))
    .limit(1);
  ctx.ownerId = ownerRow.id;

  await createStaffUser(app, {
    email: "admin-em@test.local",
    password: "pass123456",
    firstName: "Admin",
    lastName: "AR",
    role: "admin",
    branchId: ctx.arBranchId,
  });
  ctx.adminArToken = await getAuthToken(
    app,
    "admin-em@test.local",
    "pass123456",
  );

  ctx.gestionArId = await createStaffUser(app, {
    email: "gestion-em@test.local",
    password: "pass123456",
    firstName: "Gestion",
    lastName: "AR",
    role: "gestion",
    branchId: ctx.arBranchId,
  });
  ctx.gestionArToken = await getAuthToken(
    app,
    "gestion-em@test.local",
    "pass123456",
  );

  ctx.coachId = await createStaffUser(app, {
    email: "coach-em@test.local",
    password: "pass123456",
    firstName: "Coach",
    lastName: "AR",
    role: "coach",
    branchId: ctx.arBranchId,
  });
  ctx.coachToken = await getAuthToken(app, "coach-em@test.local", "pass123456");

  await createStaffUser(app, {
    email: "recepcion-em@test.local",
    password: "pass123456",
    firstName: "Recepcion",
    lastName: "AR",
    role: "recepcion",
    branchId: ctx.arBranchId,
  });
  ctx.recepcionArToken = await getAuthToken(
    app,
    "recepcion-em@test.local",
    "pass123456",
  );

  const [planAr] = await app.db
    .insert(schema.subscriptionPlans)
    .values({
      name: "Plan AR Mensual",
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
  ctx.planArId = planAr.id;

  const [planEs] = await app.db
    .insert(schema.subscriptionPlans)
    .values({
      name: "Plan ES Mensual",
      planTier: "flex",
      bookingMode: "flexible",
      planCategory: "presencial",
      priceRegular: 30000,
      priceZero: 0,
      durationDays: 30,
      classesPerWeek: 3,
      currency: "EUR",
    })
    .$returningId();
  ctx.planEsId = planEs.id;
}

type SubStatus = "active" | "expired" | "cancelled" | "paused" | "scheduled";

/**
 * Register a fresh member and insert one subscription with explicit
 * start/end offsets and status. No balance — the "Vencidos" cohort is derived
 * purely from subscriptions/users/branches/plans.
 */
async function seedMemberWithSubscription(opts: {
  app: FastifyInstance;
  branchId: number;
  planId: number;
  planCurrency: "ARS" | "EUR";
  startDateOffsetDays: number;
  endDateOffsetDays: number;
  status: SubStatus;
  firstName?: string;
  lastName?: string;
}): Promise<{ memberId: number; subscriptionId: number }> {
  const memberRes = await registerUser(opts.app, {
    email: `member-em-${nextSuffix("M")}@test.local`,
    password: "pass123456",
    firstName: opts.firstName ?? "Vencido",
    lastName: opts.lastName ?? "Member",
    branchId: opts.branchId,
  });
  const memberId = (memberRes.user as { id: number }).id;

  const subscriptionId = await addSubscriptionForMember({
    app: opts.app,
    memberId,
    branchId: opts.branchId,
    planId: opts.planId,
    planCurrency: opts.planCurrency,
    startDateOffsetDays: opts.startDateOffsetDays,
    endDateOffsetDays: opts.endDateOffsetDays,
    status: opts.status,
  });

  return { memberId, subscriptionId };
}

/** Insert an additional subscription for an already-registered member. */
async function addSubscriptionForMember(opts: {
  app: FastifyInstance;
  memberId: number;
  branchId: number;
  planId: number;
  planCurrency: "ARS" | "EUR";
  startDateOffsetDays: number;
  endDateOffsetDays: number;
  status: SubStatus;
}): Promise<number> {
  const [sub] = await opts.app.db
    .insert(schema.subscriptions)
    .values({
      userId: opts.memberId,
      planId: opts.planId,
      branchId: opts.branchId,
      status: opts.status,
      startDate: dateOffset(opts.startDateOffsetDays),
      endDate: dateOffset(opts.endDateOffsetDays),
      pricePaid: 1000,
      currency: opts.planCurrency,
      priceTypeApplied: "regular",
    })
    .$returningId();
  return sub.id;
}

/**
 * Seed a member with an expired subscription AND a positive balance on that
 * subscription (a real debt). Used for the D-07 coexistence case: appears in
 * both /expired-members and /outstanding-balances.
 */
async function seedExpiredMemberWithDebt(opts: {
  app: FastifyInstance;
  branchId: number;
  planId: number;
  planCurrency: "ARS" | "EUR";
  amount: number;
  firstName: string;
  lastName: string;
}): Promise<{ memberId: number }> {
  const { memberId, subscriptionId } = await seedMemberWithSubscription({
    app: opts.app,
    branchId: opts.branchId,
    planId: opts.planId,
    planCurrency: opts.planCurrency,
    startDateOffsetDays: -50,
    endDateOffsetDays: -20,
    status: "active", // in-effect flag is derived from dates, not status
    firstName: opts.firstName,
    lastName: opts.lastName,
  });

  await opts.app.db.insert(schema.balances).values(
    tenantValues(TEMPLO_CTX, {
      memberId,
      targetKind: "subscription",
      targetId: subscriptionId,
      currency: opts.planCurrency,
      amount: opts.amount,
    }),
  );

  return { memberId };
}

async function clearLedger(app: FastifyInstance): Promise<void> {
  const conn = await app.dbPool.getConnection();
  try {
    await conn.query("SET FOREIGN_KEY_CHECKS=0");
    // 172-15: los DELETE crudos se ACOTAN al gimnasio. Corren sobre una conexion
    // cruda de `app.dbPool` —una de las tres puertas que el sentinel intercepta—,
    // asi que sin `tenant_id` hacen throw con `finance` en TENANT_STRICT_MODULES.
    await conn.query("DELETE FROM `transaction_links` WHERE tenant_id = ?", [
      TENANT_TEMPLO,
    ]);
    await conn.query(
      "DELETE FROM `financial_transactions` WHERE tenant_id = ?",
      [TENANT_TEMPLO],
    );
    await conn.query("DELETE FROM `balances` WHERE tenant_id = ?", [
      TENANT_TEMPLO,
    ]);
    await conn.query("SET FOREIGN_KEY_CHECKS=1");
  } finally {
    conn.release();
  }
}

describe("Reports API — GET /expired-members (Phase 153-02, DEUDA-04)", () => {
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
    await clearLedger(app);
    // re-seed branches (cleanAllTestData wipes them per layer-3 ordering)
    const seeded = await seedFixtures(app);
    Object.assign(ctx, seeded);
    await seedRolesAndPlans(app, ctx);
  });

  // ─── RBAC matrix (D-12) ────────────────────────────────────────────────

  it("RBAC1: coach receives 403", async () => {
    const res = await app.inject({
      method: "GET",
      url: `${REPORTS_URL}/expired-members`,
      headers: { authorization: `Bearer ${ctx.coachToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it("RBAC2: recepcion receives 403 (CAJA_ROLES excludes recepcion)", async () => {
    const res = await app.inject({
      method: "GET",
      url: `${REPORTS_URL}/expired-members`,
      headers: { authorization: `Bearer ${ctx.recepcionArToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it("RBAC3: gestion receives 200", async () => {
    const res = await app.inject({
      method: "GET",
      url: `${REPORTS_URL}/expired-members`,
      headers: { authorization: `Bearer ${ctx.gestionArToken}` },
    });
    expect(res.statusCode).toBe(200);
  });

  // ─── Window (D-05) ─────────────────────────────────────────────────────

  it("WINDOW: expired 59 days ago appears (daysOverdue=59); 61 days ago excluded", async () => {
    // In-window: expired 59 days ago.
    await seedMemberWithSubscription({
      app,
      branchId: ctx.arBranchId,
      planId: ctx.planArId,
      planCurrency: "ARS",
      startDateOffsetDays: -70,
      endDateOffsetDays: -59,
      status: "expired",
      firstName: "Reciente",
      lastName: "Vencido",
    });
    // Out-of-window: expired 61 days ago.
    await seedMemberWithSubscription({
      app,
      branchId: ctx.arBranchId,
      planId: ctx.planArId,
      planCurrency: "ARS",
      startDateOffsetDays: -80,
      endDateOffsetDays: -61,
      status: "expired",
      firstName: "Viejo",
      lastName: "Vencido",
    });

    const res = await app.inject({
      method: "GET",
      url: `${REPORTS_URL}/expired-members`,
      headers: { authorization: `Bearer ${ctx.gestionArToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.total).toBe(1);
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].memberName).toBe("Reciente Vencido");
    expect(body.rows[0].daysOverdue).toBe(59);
    expect(body.rows[0].expiryDate).toBe(dateOffset(-59));
    expect(body.rows[0].planName).toBe("Plan AR Mensual");
  });

  // ─── Renewal (negation of activeMemberExists) ──────────────────────────

  it("RENEWED: member with an expired sub in-window but an active sub today is excluded", async () => {
    const { memberId } = await seedMemberWithSubscription({
      app,
      branchId: ctx.arBranchId,
      planId: ctx.planArId,
      planCurrency: "ARS",
      startDateOffsetDays: -60,
      endDateOffsetDays: -30,
      status: "expired",
      firstName: "Renovo",
      lastName: "Member",
    });
    // Active, in-effect subscription today → activeMemberExists true → excluded.
    await addSubscriptionForMember({
      app,
      memberId,
      branchId: ctx.arBranchId,
      planId: ctx.planArId,
      planCurrency: "ARS",
      startDateOffsetDays: -5,
      endDateOffsetDays: 25,
      status: "active",
    });

    const res = await app.inject({
      method: "GET",
      url: `${REPORTS_URL}/expired-members`,
      headers: { authorization: `Bearer ${ctx.gestionArToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.total).toBe(0);
    expect(body.rows).toEqual([]);
  });

  // ─── Dirty data (inverted window) ──────────────────────────────────────

  it("DIRTY-DATA: sub with end_date < start_date (cancelled, in-window) is excluded", async () => {
    await seedMemberWithSubscription({
      app,
      branchId: ctx.arBranchId,
      planId: ctx.planArId,
      planCurrency: "ARS",
      // end (-40) is inside the 60d window but BEFORE start (-10): inverted.
      startDateOffsetDays: -10,
      endDateOffsetDays: -40,
      status: "cancelled",
      firstName: "Sucio",
      lastName: "Invertido",
    });

    const res = await app.inject({
      method: "GET",
      url: `${REPORTS_URL}/expired-members`,
      headers: { authorization: `Bearer ${ctx.gestionArToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.total).toBe(0);
    expect(body.rows).toEqual([]);
  });

  // ─── Dedup ─────────────────────────────────────────────────────────────

  it("DEDUP: member with two expired subs in-window appears once, most recent expiry", async () => {
    const { memberId } = await seedMemberWithSubscription({
      app,
      branchId: ctx.arBranchId,
      planId: ctx.planArId,
      planCurrency: "ARS",
      startDateOffsetDays: -70,
      endDateOffsetDays: -50,
      status: "expired",
      firstName: "Dedup",
      lastName: "Member",
    });
    // Second, more recent expiry for the same member.
    await addSubscriptionForMember({
      app,
      memberId,
      branchId: ctx.arBranchId,
      planId: ctx.planArId,
      planCurrency: "ARS",
      startDateOffsetDays: -40,
      endDateOffsetDays: -20,
      status: "expired",
    });

    const res = await app.inject({
      method: "GET",
      url: `${REPORTS_URL}/expired-members`,
      headers: { authorization: `Bearer ${ctx.gestionArToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.total).toBe(1);
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].userId).toBe(memberId);
    // Most recent expiry = smallest daysOverdue (20, not 50).
    expect(body.rows[0].daysOverdue).toBe(20);
    expect(body.rows[0].expiryDate).toBe(dateOffset(-20));
  });

  // ─── No amount (D-06) ──────────────────────────────────────────────────

  it("NO-AMOUNT: the row exposes planName/expiryDate/daysOverdue and NOT amount/currency", async () => {
    await seedMemberWithSubscription({
      app,
      branchId: ctx.arBranchId,
      planId: ctx.planArId,
      planCurrency: "ARS",
      startDateOffsetDays: -40,
      endDateOffsetDays: -15,
      status: "expired",
      firstName: "Sin",
      lastName: "Monto",
    });

    const res = await app.inject({
      method: "GET",
      url: `${REPORTS_URL}/expired-members`,
      headers: { authorization: `Bearer ${ctx.gestionArToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.rows).toHaveLength(1);
    const row = body.rows[0];
    expect(row).toHaveProperty("planName", "Plan AR Mensual");
    expect(row).toHaveProperty("expiryDate", dateOffset(-15));
    expect(row).toHaveProperty("daysOverdue", 15);
    expect(row).not.toHaveProperty("amount");
    expect(row).not.toHaveProperty("currency");
  });

  // ─── Cross-country / scope ─────────────────────────────────────────────

  it("CROSS-COUNTRY: gestion AR sees only AR expired; owner sees both AR + ES", async () => {
    await seedMemberWithSubscription({
      app,
      branchId: ctx.arBranchId,
      planId: ctx.planArId,
      planCurrency: "ARS",
      startDateOffsetDays: -40,
      endDateOffsetDays: -15,
      status: "expired",
      firstName: "AR",
      lastName: "Vencido",
    });
    await seedMemberWithSubscription({
      app,
      branchId: ctx.esBranchId,
      planId: ctx.planEsId,
      planCurrency: "EUR",
      startDateOffsetDays: -40,
      endDateOffsetDays: -10,
      status: "expired",
      firstName: "ES",
      lastName: "Vencido",
    });

    const gestionRes = await app.inject({
      method: "GET",
      url: `${REPORTS_URL}/expired-members`,
      headers: { authorization: `Bearer ${ctx.gestionArToken}` },
    });
    expect(gestionRes.statusCode).toBe(200);
    const gestionBody = gestionRes.json();
    expect(gestionBody.total).toBe(1);
    expect(gestionBody.rows[0].memberName).toBe("AR Vencido");

    const ownerRes = await app.inject({
      method: "GET",
      url: `${REPORTS_URL}/expired-members`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    expect(ownerRes.statusCode).toBe(200);
    const ownerBody = ownerRes.json();
    expect(ownerBody.total).toBe(2);
    const names = ownerBody.rows.map(
      (r: { memberName: string }) => r.memberName,
    );
    expect(names).toContain("AR Vencido");
    expect(names).toContain("ES Vencido");
  });

  it("SEARCH: search by member name filters the cohort", async () => {
    await seedMemberWithSubscription({
      app,
      branchId: ctx.arBranchId,
      planId: ctx.planArId,
      planCurrency: "ARS",
      startDateOffsetDays: -40,
      endDateOffsetDays: -15,
      status: "expired",
      firstName: "Juan",
      lastName: "Perez",
    });
    await seedMemberWithSubscription({
      app,
      branchId: ctx.arBranchId,
      planId: ctx.planArId,
      planCurrency: "ARS",
      startDateOffsetDays: -40,
      endDateOffsetDays: -12,
      status: "expired",
      firstName: "Maria",
      lastName: "Garcia",
    });

    const res = await app.inject({
      method: "GET",
      url: `${REPORTS_URL}/expired-members?search=Juan`,
      headers: { authorization: `Bearer ${ctx.gestionArToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].memberName).toContain("Juan");
  });

  // ─── Coexistence (D-07) ────────────────────────────────────────────────

  it("COEXISTENCE: member with a debt AND an expired plan appears in BOTH endpoints", async () => {
    const { memberId } = await seedExpiredMemberWithDebt({
      app,
      branchId: ctx.arBranchId,
      planId: ctx.planArId,
      planCurrency: "ARS",
      amount: 5000,
      firstName: "Deudor",
      lastName: "Vencido",
    });

    const expiredRes = await app.inject({
      method: "GET",
      url: `${REPORTS_URL}/expired-members`,
      headers: { authorization: `Bearer ${ctx.gestionArToken}` },
    });
    expect(expiredRes.statusCode).toBe(200);
    const expiredBody = expiredRes.json();
    expect(
      expiredBody.rows.some((r: { userId: number }) => r.userId === memberId),
    ).toBe(true);

    const debtRes = await app.inject({
      method: "GET",
      url: `${REPORTS_URL}/outstanding-balances`,
      headers: { authorization: `Bearer ${ctx.gestionArToken}` },
    });
    expect(debtRes.statusCode).toBe(200);
    const debtBody = debtRes.json();
    expect(
      debtBody.rows.some((r: { memberId: number }) => r.memberId === memberId),
    ).toBe(true);
  });

  // ─── WR-01: future coverage via a scheduled subscription ───────────────

  it("RENEWED-SCHEDULED: expired in-window BUT a future scheduled sub excludes the member (WR-01)", async () => {
    const { memberId } = await seedMemberWithSubscription({
      app,
      branchId: ctx.arBranchId,
      planId: ctx.planArId,
      planCurrency: "ARS",
      startDateOffsetDays: -60,
      endDateOffsetDays: -20,
      status: "expired",
      firstName: "Renovo",
      lastName: "Scheduled",
    });
    // Already renewed with a FUTURE-dated subscription (starts tomorrow):
    // activeMemberExists is false (start > today) but coverage exists ahead,
    // so the member must NOT surface as a renewal lead.
    await addSubscriptionForMember({
      app,
      memberId,
      branchId: ctx.arBranchId,
      planId: ctx.planArId,
      planCurrency: "ARS",
      startDateOffsetDays: 1,
      endDateOffsetDays: 31,
      status: "scheduled",
    });

    const res = await app.inject({
      method: "GET",
      url: `${REPORTS_URL}/expired-members`,
      headers: { authorization: `Bearer ${ctx.gestionArToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.total).toBe(0);
    expect(body.rows).toEqual([]);
  });

  // ─── WR-02: soft-deleted members must not leak PII ─────────────────────

  it("SOFT-DELETED: a soft-deleted member with an in-window expiry is excluded (WR-02)", async () => {
    const { memberId } = await seedMemberWithSubscription({
      app,
      branchId: ctx.arBranchId,
      planId: ctx.planArId,
      planCurrency: "ARS",
      startDateOffsetDays: -40,
      endDateOffsetDays: -15,
      status: "expired",
      firstName: "Baja",
      lastName: "Logica",
    });
    // Soft-delete the member (users.deleted_at set).
    await app.db
      .update(schema.users)
      .set({ deletedAt: new Date() })
      .where(eq(schema.users.id, memberId));

    const res = await app.inject({
      method: "GET",
      url: `${REPORTS_URL}/expired-members`,
      headers: { authorization: `Bearer ${ctx.gestionArToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.total).toBe(0);
    expect(body.rows).toEqual([]);
  });

  // ─── Window boundary: 60 days is inclusive ─────────────────────────────

  it("BOUNDARY-60: expired exactly 60 days ago is included (daysOverdue=60)", async () => {
    await seedMemberWithSubscription({
      app,
      branchId: ctx.arBranchId,
      planId: ctx.planArId,
      planCurrency: "ARS",
      startDateOffsetDays: -90,
      endDateOffsetDays: -60,
      status: "expired",
      firstName: "Borde",
      lastName: "Sesenta",
    });

    const res = await app.inject({
      method: "GET",
      url: `${REPORTS_URL}/expired-members`,
      headers: { authorization: `Bearer ${ctx.gestionArToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.total).toBe(1);
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].memberName).toBe("Borde Sesenta");
    expect(body.rows[0].daysOverdue).toBe(60);
  });

  // ─── branchId filter ───────────────────────────────────────────────────

  it("BRANCH-FILTER: owner with ?branchId= sees only that branch's expired members", async () => {
    const [arBranch2] = await app.db
      .insert(schema.branches)
      .values({
        name: "AR-MDP-EM3",
        code: nextSuffix("EM"),
        country: "AR",
        isVirtual: false,
        isActive: true,
      })
      .$returningId();

    await seedMemberWithSubscription({
      app,
      branchId: ctx.arBranchId,
      planId: ctx.planArId,
      planCurrency: "ARS",
      startDateOffsetDays: -40,
      endDateOffsetDays: -15,
      status: "expired",
      firstName: "Branch1",
      lastName: "Vencido",
    });
    await seedMemberWithSubscription({
      app,
      branchId: arBranch2.id,
      planId: ctx.planArId,
      planCurrency: "ARS",
      startDateOffsetDays: -40,
      endDateOffsetDays: -12,
      status: "expired",
      firstName: "Branch2",
      lastName: "Vencido",
    });

    const res = await app.inject({
      method: "GET",
      url: `${REPORTS_URL}/expired-members?branchId=${arBranch2.id}`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.total).toBe(1);
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].memberName).toBe("Branch2 Vencido");
  });

  // ─── owner explicit ?country= ──────────────────────────────────────────

  it("OWNER-COUNTRY: owner with ?country=ES sees only the ES expired member", async () => {
    await seedMemberWithSubscription({
      app,
      branchId: ctx.arBranchId,
      planId: ctx.planArId,
      planCurrency: "ARS",
      startDateOffsetDays: -40,
      endDateOffsetDays: -15,
      status: "expired",
      firstName: "AR",
      lastName: "Vencido",
    });
    await seedMemberWithSubscription({
      app,
      branchId: ctx.esBranchId,
      planId: ctx.planEsId,
      planCurrency: "EUR",
      startDateOffsetDays: -40,
      endDateOffsetDays: -10,
      status: "expired",
      firstName: "ES",
      lastName: "Vencido",
    });

    const res = await app.inject({
      method: "GET",
      url: `${REPORTS_URL}/expired-members?country=ES`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.total).toBe(1);
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].memberName).toBe("ES Vencido");
  });

  // ─── Pagination (JS slice + tiebreaker, WR-03) ─────────────────────────

  it("PAGINATION: limit/offset returns disjoint pages with no overlap (WR-03)", async () => {
    // Three members expiring on distinct days → deterministic daysOverdue order.
    for (const [i, endOffset] of [-15, -16, -17].entries()) {
      await seedMemberWithSubscription({
        app,
        branchId: ctx.arBranchId,
        planId: ctx.planArId,
        planCurrency: "ARS",
        startDateOffsetDays: -45,
        endDateOffsetDays: endOffset,
        status: "expired",
        firstName: `Pag${i}`,
        lastName: "Vencido",
      });
    }

    const page1 = await app.inject({
      method: "GET",
      url: `${REPORTS_URL}/expired-members?page=1&limit=2`,
      headers: { authorization: `Bearer ${ctx.gestionArToken}` },
    });
    expect(page1.statusCode).toBe(200);
    const b1 = page1.json();
    expect(b1.total).toBe(3);
    expect(b1.rows).toHaveLength(2);

    const page2 = await app.inject({
      method: "GET",
      url: `${REPORTS_URL}/expired-members?page=2&limit=2`,
      headers: { authorization: `Bearer ${ctx.gestionArToken}` },
    });
    expect(page2.statusCode).toBe(200);
    const b2 = page2.json();
    expect(b2.total).toBe(3);
    expect(b2.rows).toHaveLength(1);

    const ids1 = b1.rows.map((r: { userId: number }) => r.userId);
    const ids2 = b2.rows.map((r: { userId: number }) => r.userId);
    // No overlap between pages, and the union covers all 3 members exactly once.
    expect(ids1.filter((id: number) => ids2.includes(id))).toEqual([]);
    expect(new Set([...ids1, ...ids2]).size).toBe(3);
  });
});
