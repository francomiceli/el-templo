import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq, sql } from "drizzle-orm";
import {
  createTestApp,
  getAuthToken,
  createStaffUser,
  cleanAllTestData,
} from "../helpers";
import { ChurnService } from "../../src/modules/analytics/churn-service";
import { subscriptions } from "../../src/db/schema/subscriptions";
import { subscriptionPlans } from "../../src/db/schema/subscription-plans";
import { branches } from "../../src/db/schema/branches";
import { users } from "../../src/db/schema/users";

const ANALYTICS_URL = "/api/admin/analytics";

/**
 * Phase 121 Plan 02 — ChurnService (Block 1, CHURN-01..06).
 *
 * Real-MySQL integration. Person-based churn over the shared expiry cohort
 * (`expiry-cohort.ts`): DISTINCT persons whose LAST expiry in `[from, to)` did NOT
 * renew within the configured window, counted only once matured (D-08). Covers:
 *   - CHURN-01: a non-renewer appears in `window.churn.nominal`; DISTINCT persons
 *     (two in-range expiries for one person count once).
 *   - CHURN-02: `?window=10` changes the official window; `comparison` carries 5/10/15.
 *   - CHURN-03/D-08: an in-grace person is excluded from numerator AND denominator
 *     and counted in `enGracia`.
 *   - CHURN-04/D-05/D-06: a duration-change renewal and an early renewal both count
 *     as retained; a paused sub in range never enters the cohort.
 *   - CHURN-05: the series is monthly; the immature recent month is provisional,
 *     the older fully-matured month is not.
 *   - CHURN-06: breakdowns return branch/country/duration/plan with nominal+%+n.
 *   - Auth: a gestion token gets 403 from GET /churn (ADMIN_ROLES-only).
 *
 * TZ note (MEMORY analytics seed flake): every endDate/startDate is derived in SQL
 * from CURDATE() so maturity assertions stay aligned with `maturedExpr`'s CURDATE()
 * and do NOT drift after ~21:00 AR time (UTC-vs-local skew).
 *
 * Do NOT run this suite locally (tests hit real MySQL — CI runs it on staging push).
 */
describe("ChurnService (Phase 121 Plan 02)", () => {
  let app: FastifyInstance;
  let svc: ChurnService;
  let branchA: number; // 'TEST' (AR)
  let branchES: number; // 'TESTES' (ES)
  let monthlyArId: number; // AR, 30d
  let longTermArId: number; // AR, 120d
  let monthlyEsId: number; // ES, 30d

  beforeAll(async () => {
    app = await createTestApp();
    svc = new ChurnService(app.db, app.log);

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
    monthlyArId = await insertPlan("Churn AR Mensual", "AR", 30);
    longTermArId = await insertPlan("Churn AR Largo", "AR", 120);
    monthlyEsId = await insertPlan("Churn ES Mensual", "ES", 30);
  });

  async function insertPlan(
    name: string,
    country: "AR" | "ES",
    durationDays: number,
  ): Promise<number> {
    const [p] = await app.db.insert(subscriptionPlans).values({
      name,
      country,
      currency: country === "ES" ? "EUR" : "ARS",
      priceRegular: 15000,
      priceZero: 10000,
      durationDays,
      classesPerWeek: 3,
    });
    return (p as { insertId: number }).insertId;
  }

  let __memberSeq = 0;
  async function insertMember(branchId = branchA): Promise<number> {
    __memberSeq += 1;
    const [u] = await app.db.insert(users).values({
      email: `churn-m${__memberSeq}-${Date.now()}@test.com`,
      passwordHash: "x",
      firstName: "Chu",
      lastName: "Rn",
      branchId,
      role: "member",
    });
    return (u as { insertId: number }).insertId;
  }

  async function insertSub(opts: {
    userId: number;
    planId?: number;
    branchId?: number;
    status?:
      | "active"
      | "paused"
      | "cancelled"
      | "expired"
      | "completed"
      | "changed"
      | "scheduled";
    startDate: string;
    endDate: string;
  }): Promise<number> {
    const [s] = await app.db.insert(subscriptions).values({
      userId: opts.userId,
      planId: opts.planId ?? monthlyArId,
      branchId: opts.branchId ?? branchA,
      status: opts.status ?? "expired",
      startDate: opts.startDate,
      endDate: opts.endDate,
      pricePaid: 15000,
      currency: "ARS",
      priceTypeApplied: "regular",
    });
    return (s as { insertId: number }).insertId;
  }

  /** Resolve `DATE_ADD/SUB(CURDATE(), INTERVAL n DAY)` to a literal YYYY-MM-DD. */
  async function dateOffset(days: number): Promise<string> {
    const interval = sql.raw(String(Math.abs(days)));
    const dateExpr =
      days >= 0
        ? sql`DATE_ADD(CURDATE(), INTERVAL ${interval} DAY)`
        : sql`DATE_SUB(CURDATE(), INTERVAL ${interval} DAY)`;
    const result = await app.db.execute(
      sql`SELECT DATE_FORMAT(${dateExpr}, '%Y-%m-%d') AS d`,
    );
    const rows = (Array.isArray(result) ? result[0] : result) as Array<{
      d: string;
    }>;
    return String(rows[0].d);
  }

  /** A wide range that brackets every seeded expiry (60 days ago → tomorrow). */
  async function wideRange(): Promise<{ dateFrom: string; dateTo: string }> {
    return {
      dateFrom: await dateOffset(-90),
      dateTo: await dateOffset(1), // exclusive upper — tomorrow keeps today in range
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CHURN-01 — non-renewer counts; DISTINCT persons
  // ═══════════════════════════════════════════════════════════════════════

  it("counts a matured non-renewer in window.churn.nominal (CHURN-01)", async () => {
    const churner = await insertMember();
    // Expired 40 days ago, no later sub → matured (>=15d) AND not retained.
    await insertSub({
      userId: churner,
      startDate: await dateOffset(-70),
      endDate: await dateOffset(-40),
    });

    const res = await svc.getChurn(await wideRange());
    expect(res.window.windowDays).toBe(15);
    expect(res.window.churn.nominal).toBe(1);
    expect(res.window.churn.n).toBe(1);
    expect(res.window.churn.percentage).toBe(100);
  });

  it("counts a person with two in-range expiries ONCE in the denominator (D-04)", async () => {
    const person = await insertMember();
    // First expiry 50 days ago — was renewed (a later sub continues it).
    await insertSub({
      userId: person,
      startDate: await dateOffset(-80),
      endDate: await dateOffset(-50),
    });
    // Second (last) expiry 40 days ago, with NO further continuity → churned.
    await insertSub({
      userId: person,
      startDate: await dateOffset(-50),
      endDate: await dateOffset(-40),
    });

    const res = await svc.getChurn(await wideRange());
    // One distinct person; their LAST expiry has no later continuation → churned.
    expect(res.window.churn.n).toBe(1);
    expect(res.window.churn.nominal).toBe(1);
  });

  // ═══════════════════════════════════════════════════════════════════════
  // CHURN-02 — configurable window + multi-N comparison
  // ═══════════════════════════════════════════════════════════════════════

  it("?window changes the official window; comparison carries 5/10/15 (CHURN-02)", async () => {
    const churner = await insertMember();
    await insertSub({
      userId: churner,
      startDate: await dateOffset(-70),
      endDate: await dateOffset(-40),
    });

    const range = await wideRange();
    const res = await svc.getChurn({ ...range, window: 10 });
    expect(res.window.windowDays).toBe(10);
    expect(res.comparison.map((c) => c.windowDays)).toEqual([5, 10, 15]);
  });

  // ═══════════════════════════════════════════════════════════════════════
  // CHURN-03 / D-08 — in-grace person excluded, counted in enGracia
  // ═══════════════════════════════════════════════════════════════════════

  it("excludes an in-grace person from numerator AND denominator, counts enGracia (CHURN-03/D-08)", async () => {
    const matured = await insertMember();
    const inGrace = await insertMember();
    // Matured churner: expired 40 days ago.
    await insertSub({
      userId: matured,
      startDate: await dateOffset(-70),
      endDate: await dateOffset(-40),
    });
    // In-grace: expired only 5 days ago (< 15d window) → not matured.
    await insertSub({
      userId: inGrace,
      startDate: await dateOffset(-35),
      endDate: await dateOffset(-5),
    });

    const res = await svc.getChurn(await wideRange());
    // Denominator excludes the in-grace person.
    expect(res.window.churn.n).toBe(1);
    expect(res.window.churn.nominal).toBe(1);
    expect(res.enGracia).toBe(1);
  });

  // ═══════════════════════════════════════════════════════════════════════
  // CHURN-04 / D-05 / D-06 — retention edge cases + paused exclusion
  // ═══════════════════════════════════════════════════════════════════════

  it("counts a duration-change renewal as retained, not churned (CHURN-04/D-05)", async () => {
    const person = await insertMember();
    // Monthly sub expired 40 days ago.
    const end = await dateOffset(-40);
    await insertSub({
      userId: person,
      planId: monthlyArId,
      startDate: await dateOffset(-70),
      endDate: end,
    });
    // A LONG-TERM (different duration) sub starting within the window → renovó.
    await insertSub({
      userId: person,
      planId: longTermArId,
      startDate: await dateOffset(-38), // <= end + 15
      endDate: await dateOffset(82),
    });

    const res = await svc.getChurn(await wideRange());
    expect(res.window.churn.n).toBe(1); // matured cohort
    expect(res.window.churn.nominal).toBe(0); // retained → not churned
  });

  it("counts an early renewal as retained (CHURN-04/D-06)", async () => {
    const person = await insertMember();
    // Sub expires 40 days ago (the LAST in-range expiry). The continuation was paid
    // EARLY: it started 10 days BEFORE that expiry (-50, no lower bound on earliness)
    // and runs into the FUTURE (endDate beyond the range upper bound), so it is NOT
    // itself a past expiry in `[from, to)` — only the -40 sub is the cohort row.
    await insertSub({
      userId: person,
      startDate: await dateOffset(-70),
      endDate: await dateOffset(-40),
    });
    await insertSub({
      userId: person,
      status: "active",
      startDate: await dateOffset(-50), // before the -40 expiry → early renewal
      endDate: await dateOffset(40), // future end → not a past expiry in range
    });

    const res = await svc.getChurn(await wideRange());
    // The -40 expiry is the only matured cohort row; the early-renewal continuation
    // satisfies retainedExpr → the person is retained, NOT churned.
    expect(res.window.churn.n).toBe(1);
    expect(res.window.churn.nominal).toBe(0);
  });

  it("a paused sub whose endDate is in range never enters the cohort (CHURN-04/D-03)", async () => {
    const paused = await insertMember();
    await insertSub({
      userId: paused,
      status: "paused",
      startDate: await dateOffset(-70),
      endDate: await dateOffset(-40),
    });

    const res = await svc.getChurn(await wideRange());
    // The only sub is paused → cohort is empty → no churn, no denominator.
    expect(res.window.churn.n).toBe(0);
    expect(res.window.churn.nominal).toBe(0);
    expect(res.enGracia).toBe(0);
  });

  // ═══════════════════════════════════════════════════════════════════════
  // CHURN-05 — monthly series with provisional flag
  // ═══════════════════════════════════════════════════════════════════════

  it("series is monthly: recent immature month provisional, older matured month not (CHURN-05)", async () => {
    // Older cohort: expired 70 days ago → fully matured (provisional false).
    const older = await insertMember();
    await insertSub({
      userId: older,
      startDate: await dateOffset(-100),
      endDate: await dateOffset(-70),
    });
    // Recent cohort: expired 3 days ago → still in grace (provisional true).
    const recent = await insertMember();
    await insertSub({
      userId: recent,
      startDate: await dateOffset(-33),
      endDate: await dateOffset(-3),
    });

    const res = await svc.getChurn(await wideRange());
    const olderBucket = (await dateOffset(-70)).slice(0, 7); // YYYY-MM
    const recentBucket = (await dateOffset(-3)).slice(0, 7);

    const olderPoint = res.series.find((p) => p.bucket === olderBucket);
    const recentPoint = res.series.find((p) => p.bucket === recentBucket);
    expect(olderPoint).toBeDefined();
    expect(recentPoint).toBeDefined();
    expect(olderPoint?.provisional).toBe(false);
    expect(recentPoint?.provisional).toBe(true);
  });

  // ═══════════════════════════════════════════════════════════════════════
  // CHURN-06 — breakdowns by branch / country / duration / plan
  // ═══════════════════════════════════════════════════════════════════════

  it("breakdowns return branch/country/duration/plan with nominal+%+n (CHURN-06)", async () => {
    const churner = await insertMember();
    await insertSub({
      userId: churner,
      planId: monthlyArId,
      startDate: await dateOffset(-70),
      endDate: await dateOffset(-40),
    });

    const res = await svc.getChurn(await wideRange());
    const axes = new Set(res.breakdowns.map((b) => b.axis));
    expect(axes.has("branch")).toBe(true);
    expect(axes.has("country")).toBe(true);
    expect(axes.has("duration")).toBe(true);
    expect(axes.has("plan")).toBe(true);

    // Each segment carries the full metric shape.
    for (const row of res.breakdowns) {
      expect(row.churn).toHaveProperty("nominal");
      expect(row.churn).toHaveProperty("percentage");
      expect(row.churn).toHaveProperty("n");
    }

    // The plan-axis segment for the churner's plan reports the churn.
    const planRow = res.breakdowns.find(
      (b) => b.axis === "plan" && b.key.startsWith("Churn AR Mensual"),
    );
    expect(planRow?.churn.nominal).toBe(1);
    expect(planRow?.churn.n).toBe(1);
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Auth — ADMIN_ROLES-only (gestion 403)
  // ═══════════════════════════════════════════════════════════════════════

  describe("GET /churn auth", () => {
    it("returns 403 for gestion (ADMIN_ROLES-only)", async () => {
      await createStaffUser(app, {
        email: "gestion-churn@test.com",
        password: "gestionpass123",
        firstName: "Ges",
        lastName: "Tion",
        role: "gestion",
        branchId: branchA,
      });
      const token = await getAuthToken(
        app,
        "gestion-churn@test.com",
        "gestionpass123",
      );
      const res = await app.inject({
        method: "GET",
        url: `${ANALYTICS_URL}/churn`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it("returns 200 for admin and carries the churn wire shape", async () => {
      const ownerToken = await getAuthToken(
        app,
        "admin@test.com",
        "adminpass123",
      );
      const range = await wideRange();
      const res = await app.inject({
        method: "GET",
        url: `${ANALYTICS_URL}/churn?dateFrom=${range.dateFrom}&dateTo=${range.dateTo}`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body).toHaveProperty("window");
      expect(body).toHaveProperty("comparison");
      expect(body).toHaveProperty("enGracia");
      expect(body).toHaveProperty("series");
      expect(body).toHaveProperty("breakdowns");
    });
  });
});
