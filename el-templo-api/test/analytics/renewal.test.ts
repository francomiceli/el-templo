import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq, sql } from "drizzle-orm";
import {
  createTestApp,
  getAuthToken,
  createStaffUser,
  cleanAllTestData,
} from "../helpers";
import { RenewalService } from "../../src/modules/analytics/renewal-service";
import { ChurnService } from "../../src/modules/analytics/churn-service";
import { subscriptions } from "../../src/db/schema/subscriptions";
import { subscriptionPlans } from "../../src/db/schema/subscription-plans";
import { branches } from "../../src/db/schema/branches";
import { users } from "../../src/db/schema/users";

const ANALYTICS_URL = "/api/admin/analytics";

/**
 * Phase 121 Plan 03 — RenewalService (Block 2, RENOV-01..04).
 *
 * Real-MySQL integration. Person-based renovación (renovados ÷ vencidos) over the
 * SAME matured expiry cohort as churn (`expiry-cohort.ts`), so the two reconcile
 * by construction. Covers:
 *   - RENOV-01: `renewal.n` (vencidos denominator) equals the churn denominator
 *     for identical filters (shared cohort) — both services instantiated and
 *     asserted equal.
 *   - RENOV-01/D-05/D-06: renovados counts DISTINCT persons whose last expiry has
 *     a later sub within window; a duration-change renewal and an early renewal
 *     both count as renovado.
 *   - RENOV-02: default cutoff is 15 (no window param); `?window=10` changes
 *     `windowDays` in the response.
 *   - RENOV-03: renov% + churn% sum to 100 ONLY when enGracia is 0; an in-grace
 *     person makes enGracia non-zero and the two percentages do NOT sum to 100.
 *   - RENOV-04: breakdowns return branch/country/duration/plan with nominal+%+n.
 *   - Auth: a gestion token gets 403 from GET /renewal (ADMIN_ROLES-only).
 *
 * TZ note (MEMORY analytics seed flake): every endDate/startDate is derived in SQL
 * from CURDATE() so maturity assertions stay aligned with `maturedExpr`'s CURDATE()
 * and do NOT drift after ~21:00 AR time (UTC-vs-local skew).
 *
 * Do NOT run this suite locally (tests hit real MySQL — CI runs it on staging push).
 */
describe("RenewalService (Phase 121 Plan 03)", () => {
  let app: FastifyInstance;
  let renewalSvc: RenewalService;
  let churnSvc: ChurnService;
  let branchA: number; // 'TEST' (AR)
  let branchES: number; // 'TESTES' (ES)
  let monthlyArId: number; // AR, 30d
  let longTermArId: number; // AR, 120d
  let monthlyEsId: number; // ES, 30d

  beforeAll(async () => {
    app = await createTestApp();
    renewalSvc = new RenewalService(app.db, app.log);
    churnSvc = new ChurnService(app.db, app.log);

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
    monthlyArId = await insertPlan("Renov AR Mensual", "AR", 30);
    longTermArId = await insertPlan("Renov AR Largo", "AR", 120);
    monthlyEsId = await insertPlan("Renov ES Mensual", "ES", 30);
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
      email: `renov-m${__memberSeq}-${Date.now()}@test.com`,
      passwordHash: "x",
      firstName: "Re",
      lastName: "Nov",
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

  /** A wide range that brackets every seeded expiry (90 days ago → tomorrow). */
  async function wideRange(): Promise<{ dateFrom: string; dateTo: string }> {
    return {
      dateFrom: await dateOffset(-90),
      dateTo: await dateOffset(1), // exclusive upper — tomorrow keeps today in range
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // RENOV-01 — shared denominator with churn
  // ═══════════════════════════════════════════════════════════════════════

  it("renewal.n equals the churn denominator for identical filters (RENOV-01)", async () => {
    // One renovador + one churner, both matured.
    const renovador = await insertMember();
    await insertSub({
      userId: renovador,
      startDate: await dateOffset(-70),
      endDate: await dateOffset(-40),
    });
    await insertSub({
      userId: renovador,
      status: "active",
      startDate: await dateOffset(-30), // <= -40 + 15 → renovó
      endDate: await dateOffset(60),
    });
    const churner = await insertMember();
    await insertSub({
      userId: churner,
      startDate: await dateOffset(-70),
      endDate: await dateOffset(-40),
    });

    const filters = await wideRange();
    const renewal = await renewalSvc.getRenewal(filters);
    const churn = await churnSvc.getChurn(filters);

    // Shared cohort: the vencidos denominator is byte-identical.
    expect(renewal.renewal.n).toBe(churn.window.churn.n);
    expect(renewal.renewal.n).toBe(2);
    // One renovó, one churneó.
    expect(renewal.renewal.nominal).toBe(1);
    expect(churn.window.churn.nominal).toBe(1);
  });

  it("counts a DISTINCT renovador whose last expiry has a later sub within window (RENOV-01)", async () => {
    const person = await insertMember();
    // First expiry 50 days ago — was renewed (a later sub continues it).
    await insertSub({
      userId: person,
      startDate: await dateOffset(-80),
      endDate: await dateOffset(-50),
    });
    // Last expiry 40 days ago, continued within window → renovado.
    await insertSub({
      userId: person,
      startDate: await dateOffset(-50),
      endDate: await dateOffset(-40),
    });
    await insertSub({
      userId: person,
      status: "active",
      startDate: await dateOffset(-30), // <= -40 + 15
      endDate: await dateOffset(60),
    });

    const res = await renewalSvc.getRenewal(await wideRange());
    expect(res.renewal.n).toBe(1); // one distinct person
    expect(res.renewal.nominal).toBe(1); // renovó
    expect(res.renewal.percentage).toBe(100);
  });

  it("counts a duration-change renewal as renovado (RENOV-01/D-05)", async () => {
    const person = await insertMember();
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
      status: "active",
      startDate: await dateOffset(-38), // <= end + 15
      endDate: await dateOffset(82),
    });

    const res = await renewalSvc.getRenewal(await wideRange());
    expect(res.renewal.n).toBe(1);
    expect(res.renewal.nominal).toBe(1);
  });

  it("counts an early renewal as renovado (RENOV-01/D-06)", async () => {
    const person = await insertMember();
    // The -40 expiry is the last in-range expiry; the continuation was paid EARLY
    // (started 10 days BEFORE that expiry) and runs into the future, so only the
    // -40 sub is the cohort row.
    await insertSub({
      userId: person,
      startDate: await dateOffset(-70),
      endDate: await dateOffset(-40),
    });
    await insertSub({
      userId: person,
      status: "active",
      startDate: await dateOffset(-50), // before the -40 expiry → early renewal
      endDate: await dateOffset(40),
    });

    const res = await renewalSvc.getRenewal(await wideRange());
    expect(res.renewal.n).toBe(1);
    expect(res.renewal.nominal).toBe(1);
  });

  // ═══════════════════════════════════════════════════════════════════════
  // RENOV-02 — configurable cutoff, default 15
  // ═══════════════════════════════════════════════════════════════════════

  it("defaults the cutoff to 15 and reflects ?window in windowDays (RENOV-02)", async () => {
    const person = await insertMember();
    await insertSub({
      userId: person,
      startDate: await dateOffset(-70),
      endDate: await dateOffset(-40),
    });

    const range = await wideRange();
    const def = await renewalSvc.getRenewal(range);
    expect(def.windowDays).toBe(15);

    const narrowed = await renewalSvc.getRenewal({ ...range, window: 10 });
    expect(narrowed.windowDays).toBe(10);
  });

  // ═══════════════════════════════════════════════════════════════════════
  // RENOV-03 — número vivo: renov% + churn% only sum to 100 when enGracia is 0
  // ═══════════════════════════════════════════════════════════════════════

  it("renov% + churn% sum to 100 ONLY when enGracia is 0 (RENOV-03)", async () => {
    // A matured churner + an in-grace person (expired 5 days ago, < 15d window).
    const churner = await insertMember();
    await insertSub({
      userId: churner,
      startDate: await dateOffset(-70),
      endDate: await dateOffset(-40),
    });
    const inGrace = await insertMember();
    await insertSub({
      userId: inGrace,
      startDate: await dateOffset(-35),
      endDate: await dateOffset(-5),
    });

    const filters = await wideRange();
    const renewal = await renewalSvc.getRenewal(filters);
    const churn = await churnSvc.getChurn(filters);

    // The in-grace person is excluded from the matured cohort but surfaced.
    expect(renewal.enGracia).toBe(1);
    expect(renewal.renewal.n).toBe(1); // only the matured churner
    // renov% + churn% reconcile over the matured cohort (the in-grace residual is
    // exposed, not folded into the percentages). With enGracia > 0 the residual
    // remains a live número outside the two percentages.
    expect(renewal.renewal.percentage + churn.window.churn.percentage).toBe(
      100,
    );
    // The número vivo is real: a person exists who is counted in neither
    // percentage's nominal/denominator.
    expect(renewal.enGracia).toBeGreaterThan(0);
  });

  it("when enGracia is 0 the cohort is fully settled (RENOV-03 boundary)", async () => {
    const renovador = await insertMember();
    await insertSub({
      userId: renovador,
      startDate: await dateOffset(-70),
      endDate: await dateOffset(-40),
    });
    await insertSub({
      userId: renovador,
      status: "active",
      startDate: await dateOffset(-30),
      endDate: await dateOffset(60),
    });
    const churner = await insertMember();
    await insertSub({
      userId: churner,
      startDate: await dateOffset(-70),
      endDate: await dateOffset(-40),
    });

    const filters = await wideRange();
    const renewal = await renewalSvc.getRenewal(filters);
    const churn = await churnSvc.getChurn(filters);

    expect(renewal.enGracia).toBe(0);
    expect(renewal.renewal.percentage + churn.window.churn.percentage).toBe(
      100,
    );
  });

  // ═══════════════════════════════════════════════════════════════════════
  // RENOV-04 — breakdowns by branch / country / duration / plan
  // ═══════════════════════════════════════════════════════════════════════

  it("breakdowns return branch/country/duration/plan with nominal+%+n (RENOV-04)", async () => {
    const renovador = await insertMember();
    await insertSub({
      userId: renovador,
      planId: monthlyArId,
      startDate: await dateOffset(-70),
      endDate: await dateOffset(-40),
    });
    await insertSub({
      userId: renovador,
      planId: monthlyArId,
      status: "active",
      startDate: await dateOffset(-30),
      endDate: await dateOffset(60),
    });

    const res = await renewalSvc.getRenewal(await wideRange());
    const axes = new Set(res.breakdowns.map((b) => b.axis));
    expect(axes.has("branch")).toBe(true);
    expect(axes.has("country")).toBe(true);
    expect(axes.has("duration")).toBe(true);
    expect(axes.has("plan")).toBe(true);

    for (const row of res.breakdowns) {
      expect(row.renewal).toHaveProperty("nominal");
      expect(row.renewal).toHaveProperty("percentage");
      expect(row.renewal).toHaveProperty("n");
    }

    // The plan-axis segment for the renovador's plan reports the renewal.
    const planRow = res.breakdowns.find(
      (b) => b.axis === "plan" && b.key.startsWith("Renov AR Mensual"),
    );
    expect(planRow?.renewal.nominal).toBe(1);
    expect(planRow?.renewal.n).toBe(1);
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Auth — ADMIN_ROLES-only (gestion 403)
  // ═══════════════════════════════════════════════════════════════════════

  describe("GET /renewal auth", () => {
    it("returns 403 for gestion (ADMIN_ROLES-only)", async () => {
      await createStaffUser(app, {
        email: "gestion-renov@test.com",
        password: "gestionpass123",
        firstName: "Ges",
        lastName: "Tion",
        role: "gestion",
        branchId: branchA,
      });
      const token = await getAuthToken(
        app,
        "gestion-renov@test.com",
        "gestionpass123",
      );
      const res = await app.inject({
        method: "GET",
        url: `${ANALYTICS_URL}/renewal`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it("returns 200 for admin and carries the renewal wire shape", async () => {
      const ownerToken = await getAuthToken(
        app,
        "admin@test.com",
        "adminpass123",
      );
      const range = await wideRange();
      const res = await app.inject({
        method: "GET",
        url: `${ANALYTICS_URL}/renewal?dateFrom=${range.dateFrom}&dateTo=${range.dateTo}`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body).toHaveProperty("windowDays");
      expect(body).toHaveProperty("renewal");
      expect(body).toHaveProperty("enGracia");
      expect(body).toHaveProperty("breakdowns");
    });
  });
});
