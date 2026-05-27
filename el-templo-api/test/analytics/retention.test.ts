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
import {
  RetentionService,
  CONSECUTIVE_CYCLE_GAP_DAYS,
} from "../../src/modules/analytics/retention-service";
import { subscriptions } from "../../src/db/schema/subscriptions";
import { subscriptionPlans } from "../../src/db/schema/subscription-plans";
import { branches } from "../../src/db/schema/branches";

const ANALYTICS_URL = "/api/admin/analytics";

/**
 * Phase 118 Plan 02 — RetentionService (D-04 / D-05 / D-06 / D-11 / D-12).
 *
 * Real-MySQL integration. Retention by cohorts of plan CYCLES (not calendar
 * months): cohort = month of the member's FIRST active subscription; cycle N+1
 * counts iff next.startDate − prev.endDate ≤ 30 days; a larger gap cuts the
 * streak and reactivation does NOT re-inflate the original cohort. The cycle
 * distribution counts only active members (canonical activeMemberExists, NEVER
 * users.status). Endpoint is ADMIN_ROLES-only (gestion 403).
 */
describe("RetentionService (Phase 118 Plan 02)", () => {
  let app: FastifyInstance;
  let adminToken: string;
  let svc: RetentionService;
  let branchA: number; // 'Test Branch' (AR)
  let branchES: number; // an ES branch, for cross-country scope tests
  let presencialPlan: number;
  let onlinePlan: number;

  // Helper: a YYYY-MM-DD string `n` days from today (n may be negative).
  function dayStr(offsetDays: number): string {
    return new Date(Date.now() + offsetDays * 86_400_000)
      .toISOString()
      .split("T")[0];
  }

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
    svc = new RetentionService(app.db, app.log);

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
    const [p] = await app.db.insert(subscriptionPlans).values({
      name: `RetPresencial-${Date.now()}`,
      country: "AR",
      planCategory: "presencial",
      priceRegular: 15000,
      priceZero: 10000,
      durationDays: 30,
      classesPerWeek: 3,
    });
    presencialPlan = (p as { insertId: number }).insertId;

    const [o] = await app.db.insert(subscriptionPlans).values({
      name: `RetOnline-${Date.now()}`,
      country: "AR",
      planCategory: "online_regular",
      priceRegular: 12000,
      priceZero: 9000,
      durationDays: 30,
      classesPerWeek: 3,
    });
    onlinePlan = (o as { insertId: number }).insertId;
  });

  async function createMember(
    email: string,
    dni: string,
    branchId = branchA,
  ): Promise<number> {
    const result = await registerUser(app, {
      email,
      password: "pass123456",
      firstName: "Ret",
      lastName: "Tester",
      branchId,
      dni,
    });
    return (result.user as { id: number }).id;
  }

  /** Insert a subscription with explicit start/end and an arbitrary status. */
  async function addSub(opts: {
    userId: number;
    startDate: string;
    endDate: string | null;
    branchId?: number;
    planId?: number;
    status?: "active" | "expired" | "cancelled" | "completed";
  }): Promise<void> {
    await app.db.insert(subscriptions).values({
      userId: opts.userId,
      planId: opts.planId ?? presencialPlan,
      branchId: opts.branchId ?? branchA,
      status: opts.status ?? "expired",
      startDate: opts.startDate,
      endDate: opts.endDate,
      pricePaid: 15000,
      priceTypeApplied: "regular",
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Cohorts + gap rule (D-04 / D-05 / D-06)
  // ═══════════════════════════════════════════════════════════════════════

  describe("getRetention cohorts + gap rule", () => {
    it("gap = 30d counts as consecutive cycles (member reaches cycle 2)", async () => {
      const m = await createMember("r-30@test.com", "93000001");
      // first sub: starts 2026-01-01, ends 2026-01-31
      await addSub({
        userId: m,
        startDate: "2026-01-01",
        endDate: "2026-01-31",
      });
      // second sub: starts exactly 30 days after first ends → consecutive
      await addSub({
        userId: m,
        startDate: "2026-03-02",
        endDate: "2026-04-01",
      });

      const res = await svc.getRetention({});
      const cohort = res.cohorts.find((c) => c.cohort === "2026-01");
      expect(cohort).toBeDefined();
      expect(cohort!.size).toBe(1);
      // cycle 1 = 100%, cycle 2 = 100% (the member reached cycle 2).
      expect(cohort!.cycleRetention[0]).toBe(100);
      expect(cohort!.cycleRetention[1]).toBe(100);
      expect(res.maxCycle).toBeGreaterThanOrEqual(2);
    });

    it("gap = 31d cuts the streak (member NOT in cycle 2 of original cohort)", async () => {
      const m = await createMember("r-31@test.com", "93000002");
      await addSub({
        userId: m,
        startDate: "2026-01-01",
        endDate: "2026-01-31",
      });
      // 31 days after 2026-01-31 is 2026-03-03 → gap of 31 → streak cut.
      await addSub({
        userId: m,
        startDate: "2026-03-03",
        endDate: "2026-04-02",
      });

      const res = await svc.getRetention({});
      const cohort = res.cohorts.find((c) => c.cohort === "2026-01");
      expect(cohort).toBeDefined();
      expect(cohort!.size).toBe(1);
      expect(cohort!.cycleRetention[0]).toBe(100); // cycle 1
      // cycle 2 must be 0 (the reactivation does not extend the streak).
      expect(cohort!.cycleRetention[1] ?? 0).toBe(0);
    });

    it("cohort = month of FIRST active sub; two members same month → same cohort", async () => {
      const m1 = await createMember("r-c1@test.com", "93001001");
      const m2 = await createMember("r-c2@test.com", "93001002");
      await addSub({
        userId: m1,
        startDate: "2026-02-05",
        endDate: "2026-03-07",
      });
      await addSub({
        userId: m2,
        startDate: "2026-02-20",
        endDate: "2026-03-22",
      });

      const res = await svc.getRetention({});
      const cohort = res.cohorts.find((c) => c.cohort === "2026-02");
      expect(cohort).toBeDefined();
      expect(cohort!.size).toBe(2);
    });

    it("reactivation after a >30d gap does NOT re-inflate the original cohort", async () => {
      const m = await createMember("r-react@test.com", "93002001");
      // Cohort 2026-01, single cycle, then a 90-day gap reactivation.
      await addSub({
        userId: m,
        startDate: "2026-01-01",
        endDate: "2026-01-31",
      });
      await addSub({
        userId: m,
        startDate: "2026-05-01",
        endDate: "2026-05-31",
      });

      const res = await svc.getRetention({});
      const jan = res.cohorts.find((c) => c.cohort === "2026-01");
      expect(jan).toBeDefined();
      expect(jan!.size).toBe(1);
      // Streak ended at cycle 1; cycle 2 stays 0 for this cohort.
      expect(jan!.cycleRetention[1] ?? 0).toBe(0);
      // The reactivation is NOT its own cohort (cohort = first sub's month).
      expect(res.cohorts.some((c) => c.cohort === "2026-05")).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Cycle distribution — only active members (D-06)
  // ═══════════════════════════════════════════════════════════════════════

  describe("cycleDistribution (active only)", () => {
    it("counts current consecutive cycles only for active members", async () => {
      // Active member with 3 consecutive cycles (in-effect sub right now).
      const active3 = await createMember("d-a3@test.com", "93010001");
      await addSub({
        userId: active3,
        startDate: dayStr(-90),
        endDate: dayStr(-60),
      });
      await addSub({
        userId: active3,
        startDate: dayStr(-45),
        endDate: dayStr(-15),
      });
      await addSub({
        userId: active3,
        startDate: dayStr(-5),
        endDate: dayStr(25),
        status: "active",
      });

      // Inactive member with 3 historical cycles (NO in-effect sub) → excluded.
      const inactive3 = await createMember("d-i3@test.com", "93010002");
      await addSub({
        userId: inactive3,
        startDate: "2025-01-01",
        endDate: "2025-01-31",
      });
      await addSub({
        userId: inactive3,
        startDate: "2025-02-10",
        endDate: "2025-03-12",
      });
      await addSub({
        userId: inactive3,
        startDate: "2025-03-20",
        endDate: "2025-04-19",
      });

      // Active member with a single cycle.
      const active1 = await createMember("d-a1@test.com", "93010003");
      await addSub({
        userId: active1,
        startDate: dayStr(-5),
        endDate: dayStr(25),
        status: "active",
      });

      const res = await svc.getRetention({});
      expect(res.cycleDistribution.ciclo3plus).toBe(1); // active3 only
      expect(res.cycleDistribution.ciclo1).toBe(1); // active1
      expect(res.cycleDistribution.ciclo2).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // plan_category filter (D-06)
  // ═══════════════════════════════════════════════════════════════════════

  describe("planCategory filter", () => {
    it("planCategory='presencial' excludes online subs", async () => {
      const presMember = await createMember("p-pre@test.com", "93020001");
      const onlMember = await createMember("p-onl@test.com", "93020002");
      await addSub({
        userId: presMember,
        startDate: "2026-01-01",
        endDate: "2026-01-31",
        planId: presencialPlan,
      });
      await addSub({
        userId: onlMember,
        startDate: "2026-01-01",
        endDate: "2026-01-31",
        planId: onlinePlan,
      });

      const all = await svc.getRetention({});
      const allJan = all.cohorts.find((c) => c.cohort === "2026-01");
      expect(allJan!.size).toBe(2);

      const presOnly = await svc.getRetention({ planCategory: "presencial" });
      const presJan = presOnly.cohorts.find((c) => c.cohort === "2026-01");
      expect(presJan!.size).toBe(1);

      const todas = await svc.getRetention({ planCategory: "todas" });
      expect(todas.cohorts.find((c) => c.cohort === "2026-01")!.size).toBe(2);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // durationDays filter + availableDurations (Phase 118 follow-up) — read the
  // curve per plan length (a "cycle 2" on a 30d plan ≠ on a 240d plan).
  // ═══════════════════════════════════════════════════════════════════════

  describe("durationDays filter + availableDurations", () => {
    // Both seed plans are 30 days; create a 240-day presencial plan.
    async function makeLongPlan(): Promise<number> {
      const [lp] = await app.db.insert(subscriptionPlans).values({
        name: `RetLong-${Date.now()}`,
        country: "AR",
        planCategory: "presencial",
        priceRegular: 60000,
        priceZero: 50000,
        durationDays: 240,
        classesPerWeek: 3,
      });
      return (lp as { insertId: number }).insertId;
    }

    it("durationDays restricts the cohort to subs of that plan length", async () => {
      const longPlan = await makeLongPlan();
      const short = await createMember("d-short@test.com", "93030001");
      const long = await createMember("d-long@test.com", "93030002");
      await addSub({
        userId: short,
        startDate: "2026-01-01",
        endDate: "2026-01-31",
        planId: presencialPlan, // 30d
      });
      await addSub({
        userId: long,
        startDate: "2026-01-01",
        endDate: "2026-08-28",
        planId: longPlan, // 240d
      });

      const all = await svc.getRetention({});
      expect(all.cohorts.find((c) => c.cohort === "2026-01")!.size).toBe(2);

      const d30 = await svc.getRetention({ durationDays: 30 });
      expect(d30.cohorts.find((c) => c.cohort === "2026-01")!.size).toBe(1);

      const d240 = await svc.getRetention({ durationDays: 240 });
      expect(d240.cohorts.find((c) => c.cohort === "2026-01")!.size).toBe(1);
    });

    it("availableDurations lists distinct plan durations in scope, sorted asc", async () => {
      const longPlan = await makeLongPlan();
      const a = await createMember("dd-a@test.com", "93031001");
      const b = await createMember("dd-b@test.com", "93031002");
      await addSub({
        userId: a,
        startDate: "2026-01-01",
        endDate: "2026-01-31",
        planId: presencialPlan, // 30
      });
      await addSub({
        userId: b,
        startDate: "2026-01-01",
        endDate: "2026-08-28",
        planId: longPlan, // 240
      });

      const res = await svc.getRetention({});
      expect(res.availableDurations).toEqual([30, 240]);
      // ignores the duration filter itself → full list even when filtered.
      const filtered = await svc.getRetention({ durationDays: 30 });
      expect(filtered.availableDurations).toEqual([30, 240]);
    });

    it("availableDurations honors planCategory", async () => {
      const longPlan = await makeLongPlan(); // presencial 240
      const presM = await createMember("dc-pre@test.com", "93032001");
      const onlM = await createMember("dc-onl@test.com", "93032002");
      await addSub({
        userId: presM,
        startDate: "2026-01-01",
        endDate: "2026-08-28",
        planId: longPlan, // presencial 240
      });
      await addSub({
        userId: onlM,
        startDate: "2026-01-01",
        endDate: "2026-01-31",
        planId: onlinePlan, // online 30
      });

      const pres = await svc.getRetention({ planCategory: "presencial" });
      expect(pres.availableDurations).toEqual([240]);

      const onl = await svc.getRetention({ planCategory: "online_regular" });
      expect(onl.availableDurations).toEqual([30]);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Scope (D-11 / T-118-04)
  // ═══════════════════════════════════════════════════════════════════════

  describe("scope", () => {
    it("branchId scope excludes subs of another sede", async () => {
      const mA = await createMember("s-a@test.com", "93030001", branchA);
      const mES = await createMember("s-es@test.com", "93030002", branchES);
      await addSub({
        userId: mA,
        startDate: "2026-01-01",
        endDate: "2026-01-31",
        branchId: branchA,
      });
      await addSub({
        userId: mES,
        startDate: "2026-01-01",
        endDate: "2026-01-31",
        branchId: branchES,
      });

      const onlyA = await svc.getRetention({ branchId: branchA });
      const jan = onlyA.cohorts.find((c) => c.cohort === "2026-01");
      expect(jan!.size).toBe(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Invalid windows (T-118-05)
  // ═══════════════════════════════════════════════════════════════════════

  describe("invalid windows", () => {
    it("counts and skips subs with null end or inverted window", async () => {
      const m = await createMember("inv@test.com", "93040001");
      // valid first sub (cohort 2026-01)
      await addSub({
        userId: m,
        startDate: "2026-01-01",
        endDate: "2026-01-31",
      });
      // null end → invalid, skipped
      await addSub({ userId: m, startDate: "2026-02-15", endDate: null });
      // inverted window → invalid, skipped
      await addSub({
        userId: m,
        startDate: "2026-03-10",
        endDate: "2026-03-01",
      });

      const res = await svc.getRetention({});
      expect(res.invalidWindowSubs).toBe(2);
      const jan = res.cohorts.find((c) => c.cohort === "2026-01");
      expect(jan!.size).toBe(1);
      // Only the valid sub counts → streak 1.
      expect(jan!.cycleRetention[1] ?? 0).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Endpoint — RBAC + scope (D-11)
  // ═══════════════════════════════════════════════════════════════════════

  describe("GET /api/admin/analytics/retention", () => {
    it("returns 401 unauthenticated", async () => {
      const res = await app.inject({
        method: "GET",
        url: `${ANALYTICS_URL}/retention`,
      });
      expect(res.statusCode).toBe(401);
    });

    it("returns 403 for a regular member", async () => {
      const { token } = await registerUser(app, {
        email: "member-ret@test.com",
        password: "pass123456",
        firstName: "Reg",
        lastName: "Member",
        branchId: branchA,
      });
      const res = await app.inject({
        method: "GET",
        url: `${ANALYTICS_URL}/retention`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it("returns 403 for gestion (admin-only endpoint, D-11)", async () => {
      await createStaffUser(app, {
        email: "gestion-ret@test.com",
        password: "gestionpass123",
        firstName: "Ges",
        lastName: "Tion",
        role: "gestion",
        branchId: branchA,
      });
      const gestionToken = await getAuthToken(
        app,
        "gestion-ret@test.com",
        "gestionpass123",
      );
      const res = await app.inject({
        method: "GET",
        url: `${ANALYTICS_URL}/retention`,
        headers: { authorization: `Bearer ${gestionToken}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it("admin gets 200 with cohorts + cycleDistribution", async () => {
      const m = await createMember("e-ok@test.com", "93050001");
      await addSub({
        userId: m,
        startDate: "2026-01-01",
        endDate: "2026-01-31",
      });

      const res = await app.inject({
        method: "GET",
        url: `${ANALYTICS_URL}/retention`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(Array.isArray(body.cohorts)).toBe(true);
      expect(body.cycleDistribution).toBeDefined();
      expect(typeof body.maxCycle).toBe("number");
    });

    it("AR admin is denied (403) querying an ES sede; allowed on AR (T-118-04)", async () => {
      await createStaffUser(app, {
        email: "admin-ret@test.com",
        password: "adminarpass123",
        firstName: "Admin",
        lastName: "Ret",
        role: "admin",
        branchId: branchA,
      });
      const arAdminToken = await getAuthToken(
        app,
        "admin-ret@test.com",
        "adminarpass123",
      );

      const denied = await app.inject({
        method: "GET",
        url: `${ANALYTICS_URL}/retention?branchId=${branchES}`,
        headers: { authorization: `Bearer ${arAdminToken}` },
      });
      expect(denied.statusCode).toBe(403);

      const ok = await app.inject({
        method: "GET",
        url: `${ANALYTICS_URL}/retention?branchId=${branchA}`,
        headers: { authorization: `Bearer ${arAdminToken}` },
      });
      expect(ok.statusCode).toBe(200);
    });
  });

  it("exports CONSECUTIVE_CYCLE_GAP_DAYS = 30 (D-04)", () => {
    expect(CONSECUTIVE_CYCLE_GAP_DAYS).toBe(30);
  });
});
