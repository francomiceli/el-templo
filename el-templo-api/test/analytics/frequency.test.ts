import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import {
  createTestApp,
  getAuthToken,
  registerUser,
  createStaffUser,
  cleanAllTestData,
} from "../helpers";
import { FrequencyService } from "../../src/modules/analytics/frequency-service";
import { users } from "../../src/db/schema/users";
import { subscriptions } from "../../src/db/schema/subscriptions";
import { subscriptionPlans } from "../../src/db/schema/subscription-plans";
import { branches } from "../../src/db/schema/branches";
import { attendance } from "../../src/db/schema/attendance";
import { schedules } from "../../src/db/schema/schedules";
import { activities } from "../../src/db/schema/activities";
import {
  tenantWhere,
  type TenantContext,
} from "../../src/modules/shared/tenant";
import { TENANT_TEMPLO } from "../fixtures/second-tenant";

const ANALYTICS_URL = "/api/admin/analytics";

/**
 * Fase 173 (D-02): `getFrequency`/`coolingOrInactiveUserIds` reciben
 * `TenantContext` como PRIMER argumento (en producción sale de
 * `assertTenant(request.scope, …)`); acá se construye a mano porque el
 * service se invoca sin request. El Templo es el tenant 1.
 */
const CTX: TenantContext = { tenantId: TENANT_TEMPLO };

/**
 * Phase 123 Plan 01 — FrequencyService (FREQ-01..04, D-123-03..06 / D-123-14).
 *
 * Real-MySQL integration. Per-member visits/week over the rolling last 4 weeks
 * (normalized for <4-week members, D-123-03), band distribution incl.
 * active-with-0-visits → Inactivo (D-123-04), cooling-down list with %
 * variación (D-123-05), per-branch check-in adoption surfaced via REUSE
 * (D-123-06), breakdowns by branch/country (D-123-14), and authz (gestion 403 /
 * admin 200, D-123-14).
 *
 * All timestamps are derived from now() offsets so the rolling-window
 * assertions stay TZ-flake-safe (analytics tests fail after ~21:00 AR
 * otherwise). CI-only.
 */
describe("FrequencyService (Phase 123 Plan 01)", () => {
  let app: FastifyInstance;
  let adminToken: string;
  let svc: FrequencyService;
  let branchA: number; // 'Test Branch' (AR)
  let branchES: number; // an ES branch, for cross-country breakdown
  let planAR: number;
  let planES: number;

  const MS_PER_DAY = 86_400_000;

  /** A Date `daysAgo` days before now. */
  function daysAgo(days: number): Date {
    return new Date(Date.now() - days * MS_PER_DAY);
  }

  /** "YYYY-MM-DD" of a Date. */
  function ymd(d: Date): string {
    return d.toISOString().slice(0, 10);
  }

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
    svc = new FrequencyService(app.db, app.log);

    const [a] = await app.db
      .select({ id: branches.id })
      .from(branches)
      .where(eq(branches.code, "TEST"));
    branchA = a.id;

    await app.db
      .insert(branches)
      .values({ name: "Sede ES Test", code: "TESTES", country: "ES" })
      .onDuplicateKeyUpdate({ set: { name: "Sede ES Test" } });
    const [es] = await app.db
      .select({ id: branches.id })
      .from(branches)
      .where(eq(branches.code, "TESTES"));
    branchES = es.id;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    const [pAr] = await app.db.insert(subscriptionPlans).values({
      name: `FreqPlanAR-${Date.now()}`,
      country: "AR",
      priceRegular: 15000,
      priceZero: 10000,
      durationDays: 30,
      classesPerWeek: 3,
    });
    planAR = (pAr as { insertId: number }).insertId;
    const [pEs] = await app.db.insert(subscriptionPlans).values({
      name: `FreqPlanES-${Date.now()}`,
      country: "ES",
      priceRegular: 40,
      priceZero: 30,
      durationDays: 30,
      classesPerWeek: 3,
    });
    planES = (pEs as { insertId: number }).insertId;
  });

  /**
   * Create a member with a controlled `users.created_at` (membership age anchor
   * for the <4-week normalization). `registerUser` stamps NOW(), so overwrite.
   */
  async function createMember(
    email: string,
    createdAt: Date,
    branchId = branchA,
  ): Promise<number> {
    const result = await registerUser(app, {
      email,
      password: "pass123456",
      firstName: "Freq",
      lastName: "Tester",
      branchId,
    });
    const userId = (result.user as { id: number }).id;
    await app.db
      .update(users)
      .set({ createdAt })
      .where(and(tenantWhere(users, CTX), eq(users.id, userId)));
    return userId;
  }

  /** Give a member an active subscription (makes them part of the population). */
  async function addActiveSub(
    userId: number,
    branchId = branchA,
    planId = planAR,
  ): Promise<void> {
    await app.db.insert(subscriptions).values({
      userId,
      planId,
      branchId,
      status: "active",
      startDate: ymd(daysAgo(60)),
      endDate: null,
      pricePaid: 15000,
      priceTypeApplied: "regular",
    });
  }

  /** Insert one attendance check-in at a controlled timestamp. */
  async function addVisit(
    userId: number,
    checkedInAt: Date,
    branchId = branchA,
  ): Promise<void> {
    await app.db.insert(attendance).values({
      memberId: userId,
      branchId,
      scheduleId: null,
      sessionDate: ymd(checkedInAt),
      checkedInAt,
    });
  }

  /** Create a schedule with a given startTime (drives the turno filter). */
  async function createSchedule(
    startTime: string,
    branchId = branchA,
  ): Promise<number> {
    const [act] = await app.db.insert(activities).values({
      name: `Act-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    });
    const activityId = (act as { insertId: number }).insertId;
    const [sch] = await app.db.insert(schedules).values({
      branchId,
      activityId,
      dayOfWeek: 1,
      startTime,
      endTime: "23:00",
    });
    return (sch as { insertId: number }).insertId;
  }

  /** Insert one attendance check-in attached to a schedule (drives turno). */
  async function addVisitWithSchedule(
    userId: number,
    checkedInAt: Date,
    scheduleId: number,
    branchId = branchA,
  ): Promise<void> {
    await app.db.insert(attendance).values({
      memberId: userId,
      branchId,
      scheduleId,
      sessionDate: ymd(checkedInAt),
      checkedInAt,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Distribution — active member with 0 visits → Inactivo (D-123-04)
  // ═══════════════════════════════════════════════════════════════════════

  it("counts an active member with 0 visits as Inactivo (D-123-04)", async () => {
    // Member with >4 weeks tenure, no attendance at all.
    const u = await createMember("freq-inactivo@test.com", daysAgo(60));
    await addActiveSub(u);

    const result = await svc.getFrequency(CTX, {});

    const inactivo = result.distribution.find((d) => d.band === "inactivo");
    expect(inactivo).toBeDefined();
    expect(inactivo?.count.nominal).toBe(1);
    expect(inactivo?.count.n).toBe(1);
  });

  // ═══════════════════════════════════════════════════════════════════════
  // <4-week normalization — a new member is NOT falsely Bajo (D-123-03)
  // ═══════════════════════════════════════════════════════════════════════

  it("normalizes for <4-week members: 2 visits in 1 week is Medio, not Bajo (D-123-03)", async () => {
    // Registered 7 days ago → ~1 week tenure → divisor clamps to 1.
    const u = await createMember("freq-newmember@test.com", daysAgo(7));
    await addActiveSub(u);
    // 2 visits within the current 28-day window.
    await addVisit(u, daysAgo(2));
    await addVisit(u, daysAgo(4));

    const result = await svc.getFrequency(CTX, {});

    // 2 visits ÷ 1 week = 2/wk → Medio (>= 1.5, < 2.5), NOT Bajo.
    const medio = result.distribution.find((d) => d.band === "medio");
    const bajo = result.distribution.find((d) => d.band === "bajo");
    expect(medio?.count.nominal).toBe(1);
    expect(bajo?.count.nominal).toBe(0);
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Cooling-down — band drop between current and prior 4-week windows (D-123-05)
  // ═══════════════════════════════════════════════════════════════════════

  it("detects a cooling-down member (band drop) with pctVariacion (D-123-05)", async () => {
    // >4 weeks tenure so the divisor is the full 4 weeks in both windows.
    const u = await createMember("freq-cooling@test.com", daysAgo(90));
    await addActiveSub(u);
    // PRIOR window [now-56d, now-28d): 12 visits → 12/4 = 3/wk → Alto.
    for (let i = 0; i < 12; i++) {
      await addVisit(u, daysAgo(30 + i));
    }
    // CURRENT window [now-28d, now): 2 visits → 2/4 = 0.5/wk → Bajo.
    await addVisit(u, daysAgo(2));
    await addVisit(u, daysAgo(10));

    const result = await svc.getFrequency(CTX, {});

    const row = result.coolingDown.find((c) => c.userId === u);
    expect(row).toBeDefined();
    expect(row?.priorBand).toBe("alto");
    expect(row?.currentBand).toBe("bajo");
    // pctVariacion: (0.5 - 3) / 3 * 100 = -83 (rounded), null-safe (prior > 0).
    expect(row?.pctVariacion).not.toBeNull();
    expect(row?.pctVariacion).toBeLessThan(0);
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Check-in adoption surfaced alongside via REUSE (D-123-06)
  // ═══════════════════════════════════════════════════════════════════════

  it("surfaces the check-in adoption array (reused, not reimplemented — D-123-06)", async () => {
    const u = await createMember("freq-adoption@test.com", daysAgo(60));
    await addActiveSub(u);

    const result = await svc.getFrequency(CTX, {});

    // The array is always present (may be empty when no confirmed bookings in
    // scope); the reuse contract is that the field exists with the ratio shape.
    expect(Array.isArray(result.checkInAdoption)).toBe(true);
    for (const r of result.checkInAdoption) {
      expect(r).toHaveProperty("ratio");
      expect(typeof r.ratio).toBe("number");
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Breakdowns by branch / country (D-123-14)
  // ═══════════════════════════════════════════════════════════════════════

  it("opens band counts by branch and country (D-123-14)", async () => {
    const arMember = await createMember(
      "freq-ar@test.com",
      daysAgo(60),
      branchA,
    );
    await addActiveSub(arMember, branchA, planAR);
    const esMember = await createMember(
      "freq-es@test.com",
      daysAgo(60),
      branchES,
    );
    await addActiveSub(esMember, branchES, planES);

    const result = await svc.getFrequency(CTX, {});

    const branchAxis = result.breakdowns.filter((b) => b.axis === "branch");
    const countryAxis = result.breakdowns.filter((b) => b.axis === "country");
    expect(branchAxis.length).toBeGreaterThan(0);
    expect(countryAxis.length).toBeGreaterThan(0);
    // Both AR and ES countries should appear as segment keys.
    const countryKeys = new Set(countryAxis.map((b) => b.key));
    expect(countryKeys.has("AR")).toBe(true);
    expect(countryKeys.has("ES")).toBe(true);
  });

  // ═══════════════════════════════════════════════════════════════════════
  // golden-case helper — coolingOrInactiveUserIds (D-123-01)
  // ═══════════════════════════════════════════════════════════════════════

  it("coolingOrInactiveUserIds returns active members with 0 visits (D-123-01)", async () => {
    const inactive = await createMember("freq-golden@test.com", daysAgo(60));
    await addActiveSub(inactive);
    // An active member who DID visit recently should NOT be golden.
    const active = await createMember("freq-active@test.com", daysAgo(60));
    await addActiveSub(active);
    await addVisit(active, daysAgo(1));
    await addVisit(active, daysAgo(3));
    await addVisit(active, daysAgo(6));
    await addVisit(active, daysAgo(9));
    await addVisit(active, daysAgo(12));
    await addVisit(active, daysAgo(15));
    await addVisit(active, daysAgo(18));
    await addVisit(active, daysAgo(21));
    await addVisit(active, daysAgo(24));
    await addVisit(active, daysAgo(27));

    const golden = await svc.coolingOrInactiveUserIds(CTX, 28);

    expect(golden.has(inactive)).toBe(true);
    expect(golden.has(active)).toBe(false);
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Cooling-down PII enrichment — name + phone (Phase 132 D-12)
  // ═══════════════════════════════════════════════════════════════════════

  /** Make a member who drops a band (Alto → Bajo) so they land in coolingDown. */
  async function makeCoolingMember(email: string): Promise<number> {
    const u = await createMember(email, daysAgo(90));
    await addActiveSub(u);
    // PRIOR window [now-56d, now-28d): 12 visits → Alto.
    for (let i = 0; i < 12; i++) {
      await addVisit(u, daysAgo(30 + i));
    }
    // CURRENT window [now-28d, now): 2 visits → Bajo.
    await addVisit(u, daysAgo(2));
    await addVisit(u, daysAgo(10));
    return u;
  }

  it("enriches coolingDown[] with name (firstName+lastName) and phone (D-12)", async () => {
    const u = await makeCoolingMember("freq-d12-name@test.com");
    // Set a known name + phone for the assertion.
    await app.db
      .update(users)
      .set({ firstName: "Carla", lastName: "Gomez", phone: "+5491155551234" })
      .where(and(tenantWhere(users, CTX), eq(users.id, u)));

    const result = await svc.getFrequency(CTX, {});

    const row = result.coolingDown.find((c) => c.userId === u);
    expect(row).toBeDefined();
    expect(row?.name).toBe("Carla Gomez");
    expect(row?.phone).toBe("+5491155551234");
  });

  it("returns phone: null (not undefined, not '') for a member with NULL phone (D-12)", async () => {
    const u = await makeCoolingMember("freq-d12-nullphone@test.com");
    await app.db
      .update(users)
      .set({ phone: null })
      .where(and(tenantWhere(users, CTX), eq(users.id, u)));

    const result = await svc.getFrequency(CTX, {});

    const row = result.coolingDown.find((c) => c.userId === u);
    expect(row).toBeDefined();
    expect(row?.phone).toBeNull();
    // typeof null === "object"; the contract is strictly null, never undefined/"".
    expect(row?.phone).not.toBe("");
    expect(row?.phone).not.toBeUndefined();
  });

  it("does NOT return a cooling-down member outside the caller's branch scope (PII stays in scope, T-132-04)", async () => {
    // A cooling-down member in branchES.
    const esUser = await createMember(
      "freq-d12-scope@test.com",
      daysAgo(90),
      branchES,
    );
    await addActiveSub(esUser, branchES, planES);
    for (let i = 0; i < 12; i++) {
      await addVisit(esUser, daysAgo(30 + i), branchES);
    }
    await addVisit(esUser, daysAgo(2), branchES);
    await addVisit(esUser, daysAgo(10), branchES);

    // Caller scoped to branchA → the ES member's PII must NOT appear.
    const result = await svc.getFrequency(CTX, { branchId: branchA });

    const row = result.coolingDown.find((c) => c.userId === esUser);
    expect(row).toBeUndefined();
  });

  // ═══════════════════════════════════════════════════════════════════════
  // planId + turno INPUT filters (Phase 132 D-10)
  // ═══════════════════════════════════════════════════════════════════════

  it("planId restricts the active population to that plan's subscribers (D-10)", async () => {
    // Member on planAR (kept) vs member on planES (excluded by planId=planAR).
    const arUser = await createMember("freq-planA@test.com", daysAgo(60));
    await addActiveSub(arUser, branchA, planAR);
    const esUser = await createMember(
      "freq-planB@test.com",
      daysAgo(60),
      branchES,
    );
    await addActiveSub(esUser, branchES, planES);

    const result = await svc.getFrequency(CTX, { planId: planAR });

    // The active population (sum over the distribution `n`) is plan-A only (1).
    const inactivo = result.distribution.find((d) => d.band === "inactivo");
    expect(inactivo?.count.n).toBe(1);
  });

  it("turno=manana classifies frequency over mañana schedules only (D-10)", async () => {
    // >4 weeks tenure so the divisor is the full 4 weeks.
    const u = await createMember("freq-turno@test.com", daysAgo(90));
    await addActiveSub(u);
    const mananaSchedule = await createSchedule("08:00");
    const tardeSchedule = await createSchedule("18:00");
    // 2 mañana visits in the current window → 2/4 = 0.5/wk → Bajo.
    await addVisitWithSchedule(u, daysAgo(2), mananaSchedule);
    await addVisitWithSchedule(u, daysAgo(5), mananaSchedule);
    // 10 tarde visits the mañana filter must ignore → total 12/4 = 3/wk → Alto.
    for (let i = 0; i < 10; i++) {
      await addVisitWithSchedule(u, daysAgo(3 + i), tardeSchedule);
    }

    const all = await svc.getFrequency(CTX, {});
    const manana = await svc.getFrequency(CTX, { turno: "manana" });

    // Unfiltered: all 12 visits → Alto. Restricted to the 2 mañana visits the
    // member drops to Bajo — proving only mañana attendance was counted.
    const altoAll = all.distribution.find((d) => d.band === "alto");
    expect(altoAll?.count.nominal).toBe(1);
    const bajoManana = manana.distribution.find((d) => d.band === "bajo");
    expect(bajoManana?.count.nominal).toBe(1);
    const altoManana = manana.distribution.find((d) => d.band === "alto");
    expect(altoManana?.count.nominal).toBe(0);
    // The member is still in the population (active), just in a lower band.
    const total = manana.distribution.reduce((s, d) => s + d.count.nominal, 0);
    expect(total).toBe(1);
  });

  it("planId filter is AND-ed with branch scope — plan-A member in branch X excluded when scoped to branch Y (T-132-05)", async () => {
    // plan-AR member in branchES; caller scoped to branchA with planId=planAR.
    const esUser = await createMember(
      "freq-plan-scope@test.com",
      daysAgo(60),
      branchES,
    );
    await addActiveSub(esUser, branchES, planAR);

    const result = await svc.getFrequency(CTX, {
      branchId: branchA,
      planId: planAR,
    });

    // Scoped to branchA → the branchES member is not in the population.
    const total = result.distribution.reduce((s, d) => s + d.count.n, 0);
    // n is the population repeated per band; take any band's n.
    expect(result.distribution[0]?.count.n).toBe(0);
    expect(total).toBe(0);
  });

  it("rejects a non-integer planId and an invalid turno with 400 (T-132-06)", async () => {
    const badPlan = await app.inject({
      method: "GET",
      url: `${ANALYTICS_URL}/frequency?planId=notInteger`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(badPlan.statusCode).toBe(400);

    const badTurno = await app.inject({
      method: "GET",
      url: `${ANALYTICS_URL}/frequency?turno=invalid`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(badTurno.statusCode).toBe(400);
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Auth — ADMIN_ROLES-only (gestion 403, admin 200) (D-123-14)
  // ═══════════════════════════════════════════════════════════════════════

  describe("GET /frequency auth", () => {
    it("returns 403 for gestion (ADMIN_ROLES-only)", async () => {
      await createStaffUser(app, {
        email: "gestion-freq@test.com",
        password: "gestionpass123",
        firstName: "Ges",
        lastName: "Tion",
        role: "gestion",
        branchId: branchA,
      });
      const token = await getAuthToken(
        app,
        "gestion-freq@test.com",
        "gestionpass123",
      );
      const res = await app.inject({
        method: "GET",
        url: `${ANALYTICS_URL}/frequency`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it("returns 200 for admin and carries the frequency wire shape", async () => {
      const res = await app.inject({
        method: "GET",
        url: `${ANALYTICS_URL}/frequency`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body).toHaveProperty("distribution");
      expect(body).toHaveProperty("coolingDown");
      expect(body).toHaveProperty("checkInAdoption");
      expect(body).toHaveProperty("breakdowns");
    });
  });
});
