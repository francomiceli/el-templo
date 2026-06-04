import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
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

const ANALYTICS_URL = "/api/admin/analytics";

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
    await app.db.update(users).set({ createdAt }).where(eq(users.id, userId));
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

  // ═══════════════════════════════════════════════════════════════════════
  // Distribution — active member with 0 visits → Inactivo (D-123-04)
  // ═══════════════════════════════════════════════════════════════════════

  it("counts an active member with 0 visits as Inactivo (D-123-04)", async () => {
    // Member with >4 weeks tenure, no attendance at all.
    const u = await createMember("freq-inactivo@test.com", daysAgo(60));
    await addActiveSub(u);

    const result = await svc.getFrequency({});

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

    const result = await svc.getFrequency({});

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

    const result = await svc.getFrequency({});

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

    const result = await svc.getFrequency({});

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

    const result = await svc.getFrequency({});

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

    const golden = await svc.coolingOrInactiveUserIds(28);

    expect(golden.has(inactive)).toBe(true);
    expect(golden.has(active)).toBe(false);
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
