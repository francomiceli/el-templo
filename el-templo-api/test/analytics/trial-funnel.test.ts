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
import { TrialFunnelService } from "../../src/modules/analytics/trial-funnel-service";
import { users } from "../../src/db/schema/users";
import { subscriptions } from "../../src/db/schema/subscriptions";
import { subscriptionPlans } from "../../src/db/schema/subscription-plans";
import { branches } from "../../src/db/schema/branches";
import { activities } from "../../src/db/schema/activities";
import { schedules } from "../../src/db/schema/schedules";
import { bookings } from "../../src/db/schema/bookings";

const ANALYTICS_URL = "/api/admin/analytics";

/**
 * Phase 123 Plan 02 — TrialFunnelService (FUNNEL-01..05).
 *
 * Real-MySQL integration. The trial-session cascade reservó→asistió→compró over
 * the NEW-LEAD trial cohort anchored by the scheduled-session date
 * (bookings.bookingDate). Covers: reservó counts cancelado/no_show (D-123-08);
 * asistió = bookings.status IN ('qr_escaneado','confirmado') only, NOT the
 * attendance table — a trial WITHOUT an attendance row still counts (D-123-07);
 * compró = first paid sub within the ~21d window, one inside + one outside the
 * window (D-123-09/12); new-lead exclusion of previously-paid returners
 * (D-123-10); the three rates with correct denominators (tasa_cierre over
 * asistentes) + div-by-zero → 0 (D-123-11); provisional flag on an immature
 * cohort period (D-123-12); turno bucketing mañana/tarde/otro (D-123-13); plan
 * axis groups by the plan BOUGHT (D-123-09); gestion 403 / admin 200 (D-123-14).
 * Every date derived from CURDATE/now offsets (TZ-flake-safe). CI-only.
 */
describe("TrialFunnelService (Phase 123 Plan 02)", () => {
  let app: FastifyInstance;
  let adminToken: string;
  let svc: TrialFunnelService;
  let branchA: number; // 'Test Branch' (AR)
  let branchES: number; // an ES branch, for cross-country scope tests
  let planId: number;
  let dni = 92_000_000;

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
    svc = new TrialFunnelService(app.db, app.log);

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
      name: `TrialFunnelPlan-${Date.now()}`,
      country: "AR",
      priceRegular: 15000,
      priceZero: 10000,
      durationDays: 30,
      classesPerWeek: 3,
    });
    planId = (p as { insertId: number }).insertId;
  });

  // ── Date helpers — derived from "today" so rolling windows stay TZ-stable ──
  function dateStr(d: Date): string {
    return d.toISOString().slice(0, 10);
  }
  function daysAgo(n: number): string {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - n);
    return dateStr(d);
  }
  function daysFromNow(n: number): string {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + n);
    return dateStr(d);
  }

  // ── Seed helpers ───────────────────────────────────────────────────────
  async function createMember(branchId = branchA): Promise<number> {
    dni += 1;
    const email = `tf-${dni}@test.com`;
    const result = await registerUser(app, {
      email,
      password: "pass123456",
      firstName: "Trial",
      lastName: "Lead",
      branchId,
      dni: String(dni),
    });
    return (result.user as { id: number }).id;
  }

  /** Create a schedule with a given startTime (drives the turno axis). */
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

  /** Insert a trial booking with a controlled status + session date. */
  async function addTrialBooking(
    memberId: number,
    scheduleId: number,
    bookingDate: string,
    status:
      | "reservado"
      | "qr_escaneado"
      | "confirmado"
      | "cancelado"
      | "lista_espera"
      | "no_show",
  ): Promise<void> {
    await app.db.insert(bookings).values({
      memberId,
      scheduleId,
      bookingDate,
      status,
      isTrial: true,
    });
  }

  /** Insert a paid (or zero-price) subscription with a controlled start_date. */
  async function addSub(
    userId: number,
    startDate: string,
    opts: {
      pricePaid?: number;
      priceType?: "regular" | "zero";
      plan?: number;
    } = {},
  ): Promise<void> {
    await app.db.insert(subscriptions).values({
      userId,
      planId: opts.plan ?? planId,
      branchId: branchA,
      status: "active",
      startDate,
      endDate: null,
      pricePaid: opts.pricePaid ?? 15000,
      priceTypeApplied: opts.priceType ?? "regular",
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Cascade — reservó / asistió / compró
  // ═══════════════════════════════════════════════════════════════════════

  describe("cascade counts", () => {
    it("reservó counts cancelado / no_show trials of new leads (D-123-08)", async () => {
      const sched = await createSchedule("08:00");
      const sessionDate = daysAgo(40); // matured
      const m1 = await createMember();
      const m2 = await createMember();
      const m3 = await createMember();
      await addTrialBooking(m1, sched, sessionDate, "confirmado");
      await addTrialBooking(m2, sched, sessionDate, "cancelado");
      await addTrialBooking(m3, sched, sessionDate, "no_show");

      const result = await svc.getTrialFunnel({});
      // All three count as reservó regardless of final status (D-123-08).
      expect(result.counts.reservaron).toBe(3);
      // Only the confirmado counts as asistió.
      expect(result.counts.asistieron).toBe(1);
    });

    it("asistió = bookings.status IN (qr_escaneado, confirmado) — NOT attendance (D-123-07)", async () => {
      const sched = await createSchedule("08:00");
      const sessionDate = daysAgo(40);
      const mQr = await createMember();
      const mConf = await createMember();
      const mReserved = await createMember();
      const mNoShow = await createMember();
      // qr_escaneado + confirmado count as asistió even WITHOUT any attendance
      // row (trials never produce an attendance row — D-123-07).
      await addTrialBooking(mQr, sched, sessionDate, "qr_escaneado");
      await addTrialBooking(mConf, sched, sessionDate, "confirmado");
      // reservado + no_show do NOT count as asistió.
      await addTrialBooking(mReserved, sched, sessionDate, "reservado");
      await addTrialBooking(mNoShow, sched, sessionDate, "no_show");

      const result = await svc.getTrialFunnel({});
      expect(result.counts.reservaron).toBe(4);
      // No attendance rows were seeded; asistió still = 2 via bookings.status.
      expect(result.counts.asistieron).toBe(2);
    });

    it("compró = first paid sub within window; out-of-window does NOT count (D-123-09/12)", async () => {
      const sched = await createSchedule("08:00");
      const sessionDate = daysAgo(60); // long matured
      const mIn = await createMember();
      const mOut = await createMember();
      await addTrialBooking(mIn, sched, sessionDate, "confirmado");
      await addTrialBooking(mOut, sched, sessionDate, "confirmado");
      // mIn: paid sub 5 days after the session → inside the default 21d window.
      const inDate = dateStr(
        new Date(
          new Date(`${sessionDate}T00:00:00Z`).getTime() + 5 * 86_400_000,
        ),
      );
      await addSub(mIn, inDate);
      // mOut: paid sub 30 days after the session → outside the 21d window.
      const outDate = dateStr(
        new Date(
          new Date(`${sessionDate}T00:00:00Z`).getTime() + 30 * 86_400_000,
        ),
      );
      await addSub(mOut, outDate);

      const result = await svc.getTrialFunnel({});
      expect(result.counts.reservaron).toBe(2);
      expect(result.counts.asistieron).toBe(2);
      // Only mIn's in-window purchase counts as compró.
      expect(result.counts.compraron).toBe(1);
    });

    it("a zero-price grant is NOT a purchase (D-123-09)", async () => {
      const sched = await createSchedule("08:00");
      const sessionDate = daysAgo(60);
      const m = await createMember();
      await addTrialBooking(m, sched, sessionDate, "confirmado");
      const inDate = dateStr(
        new Date(
          new Date(`${sessionDate}T00:00:00Z`).getTime() + 3 * 86_400_000,
        ),
      );
      await addSub(m, inDate, { pricePaid: 0, priceType: "zero" });

      const result = await svc.getTrialFunnel({});
      expect(result.counts.compraron).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // New-lead exclusion (D-123-10)
  // ═══════════════════════════════════════════════════════════════════════

  describe("new-lead exclusion", () => {
    it("a member with a PRIOR paid subscription does NOT count (reactivation)", async () => {
      const sched = await createSchedule("08:00");
      const sessionDate = daysAgo(40);
      const newLead = await createMember();
      const returner = await createMember();
      await addTrialBooking(newLead, sched, sessionDate, "confirmado");
      await addTrialBooking(returner, sched, sessionDate, "confirmado");
      // returner already paid BEFORE the session → reactivation, excluded.
      const priorDate = dateStr(
        new Date(
          new Date(`${sessionDate}T00:00:00Z`).getTime() - 90 * 86_400_000,
        ),
      );
      await addSub(returner, priorDate);

      const result = await svc.getTrialFunnel({});
      // Only the genuinely-new lead is in the cohort.
      expect(result.counts.reservaron).toBe(1);
      expect(result.counts.asistieron).toBe(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Rates (D-123-11)
  // ═══════════════════════════════════════════════════════════════════════

  describe("rates", () => {
    it("tasa_cierre uses asistentes as the denominator, not reservas (D-123-11)", async () => {
      const sched = await createSchedule("08:00");
      const sessionDate = daysAgo(60);
      // 4 reservas, 2 asistieron, 1 compró.
      const reservers: number[] = [];
      for (let i = 0; i < 4; i++) reservers.push(await createMember());
      await addTrialBooking(reservers[0], sched, sessionDate, "confirmado");
      await addTrialBooking(reservers[1], sched, sessionDate, "qr_escaneado");
      await addTrialBooking(reservers[2], sched, sessionDate, "no_show");
      await addTrialBooking(reservers[3], sched, sessionDate, "cancelado");
      const buyDate = dateStr(
        new Date(
          new Date(`${sessionDate}T00:00:00Z`).getTime() + 4 * 86_400_000,
        ),
      );
      await addSub(reservers[0], buyDate);

      const result = await svc.getTrialFunnel({});
      expect(result.counts.reservaron).toBe(4);
      expect(result.counts.asistieron).toBe(2);
      expect(result.counts.compraron).toBe(1);
      // tasa_show = 2/4 = 50%.
      expect(result.rates.tasaShow.percentage).toBe(50);
      // tasa_cierre = 1/2 (over asistentes) = 50%, NOT 1/4 = 25%.
      expect(result.rates.tasaCierre.n).toBe(2);
      expect(result.rates.tasaCierre.percentage).toBe(50);
      // punta_a_punta = 1/4 = 25%.
      expect(result.rates.puntaAPunta.percentage).toBe(25);
    });

    it("div-by-zero → 0, never NaN (empty cohort)", async () => {
      const result = await svc.getTrialFunnel({});
      expect(result.counts.reservaron).toBe(0);
      expect(result.rates.tasaShow.percentage).toBe(0);
      expect(result.rates.tasaCierre.percentage).toBe(0);
      expect(result.rates.puntaAPunta.percentage).toBe(0);
      expect(Number.isNaN(result.rates.tasaCierre.percentage)).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Provisional / maturity (D-123-12)
  // ═══════════════════════════════════════════════════════════════════════

  describe("provisional series", () => {
    it("flags an immature cohort period as provisional (D-123-12)", async () => {
      const sched = await createSchedule("08:00");
      // Session 2 days ago → window (21d) has NOT elapsed → provisional.
      const recent = daysAgo(2);
      const m = await createMember();
      await addTrialBooking(m, sched, recent, "confirmado");

      const result = await svc.getTrialFunnel({});
      // At least one weekly/monthly bucket must be provisional.
      expect(result.series.some((s) => s.provisional)).toBe(true);
    });

    it("a fully-matured cohort period is NOT provisional", async () => {
      const sched = await createSchedule("08:00");
      const old = daysAgo(60); // window long elapsed
      const m = await createMember();
      await addTrialBooking(m, sched, old, "confirmado");

      const result = await svc.getTrialFunnel({});
      expect(result.series.every((s) => !s.provisional)).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Turno breakdown (D-123-13) + plan-bought axis (D-123-09)
  // ═══════════════════════════════════════════════════════════════════════

  describe("breakdowns", () => {
    it("buckets turno mañana / tarde / otro from schedules.startTime (D-123-13)", async () => {
      const sessionDate = daysAgo(40);
      const schedManana = await createSchedule("08:00"); // mañana
      const schedTarde = await createSchedule("18:00"); // tarde
      const schedOtro = await createSchedule("13:00"); // otro
      const m1 = await createMember();
      const m2 = await createMember();
      const m3 = await createMember();
      await addTrialBooking(m1, schedManana, sessionDate, "confirmado");
      await addTrialBooking(m2, schedTarde, sessionDate, "confirmado");
      await addTrialBooking(m3, schedOtro, sessionDate, "confirmado");

      const result = await svc.getTrialFunnel({});
      const turnoRows = result.breakdowns.filter((b) => b.axis === "turno");
      const keys = turnoRows.map((r) => r.key).sort();
      expect(keys).toEqual(["manana", "otro", "tarde"]);
    });

    it("plan axis groups by the plan BOUGHT (D-123-09)", async () => {
      const sched = await createSchedule("08:00");
      const sessionDate = daysAgo(60);
      // A distinct "bought" plan, different from the trial-era default plan.
      const [bp] = await app.db.insert(subscriptionPlans).values({
        name: `BoughtPlan-${Date.now()}`,
        country: "AR",
        priceRegular: 22000,
        priceZero: 12000,
        durationDays: 90,
        classesPerWeek: 4,
      });
      const boughtPlanId = (bp as { insertId: number }).insertId;
      const m = await createMember();
      await addTrialBooking(m, sched, sessionDate, "confirmado");
      const buyDate = dateStr(
        new Date(
          new Date(`${sessionDate}T00:00:00Z`).getTime() + 2 * 86_400_000,
        ),
      );
      await addSub(m, buyDate, { plan: boughtPlanId });

      const result = await svc.getTrialFunnel({});
      const planRows = result.breakdowns.filter((b) => b.axis === "plan");
      // Only buyers contribute a plan segment, keyed by the BOUGHT plan name.
      expect(planRows.length).toBe(1);
      expect(planRows[0].key).toContain("BoughtPlan-");
      expect(planRows[0].counts.compraron).toBe(1);
    });

    it("scopes by country (ES branch excluded from AR view)", async () => {
      const sessionDate = daysAgo(40);
      const schedAR = await createSchedule("08:00", branchA);
      const schedES = await createSchedule("08:00", branchES);
      const mAR = await createMember(branchA);
      const mES = await createMember(branchES);
      await addTrialBooking(mAR, schedAR, sessionDate, "confirmado");
      await addTrialBooking(mES, schedES, sessionDate, "confirmado");

      const onlyAr = await svc.getTrialFunnel({ country: "AR" });
      // The country filter triggers the conditional branches join (needsBranchJoin).
      expect(onlyAr.counts.reservaron).toBe(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Window param override
  // ═══════════════════════════════════════════════════════════════════════

  describe("window override", () => {
    it("a wider window captures a purchase that the default 21d misses", async () => {
      const sched = await createSchedule("08:00");
      const sessionDate = daysAgo(60);
      const m = await createMember();
      await addTrialBooking(m, sched, sessionDate, "confirmado");
      // Purchase 25 days after the session: outside 21d, inside 30d.
      const buyDate = dateStr(
        new Date(
          new Date(`${sessionDate}T00:00:00Z`).getTime() + 25 * 86_400_000,
        ),
      );
      await addSub(m, buyDate);

      const defaultWindow = await svc.getTrialFunnel({});
      expect(defaultWindow.counts.compraron).toBe(0);
      expect(defaultWindow.attributionWindowDays).toBe(21);

      const widerWindow = await svc.getTrialFunnel({ window: 30 });
      expect(widerWindow.counts.compraron).toBe(1);
      expect(widerWindow.attributionWindowDays).toBe(30);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // planId + turno INPUT filters (Phase 132 D-10)
  // ═══════════════════════════════════════════════════════════════════════

  describe("planId + turno input filters (Phase 132 D-10)", () => {
    it("turno=manana restricts the cohort to the morning schedule (D-10)", async () => {
      const sessionDate = daysAgo(40); // matured
      const schedManana = await createSchedule("08:00");
      const schedTarde = await createSchedule("18:00");
      const mManana = await createMember();
      const mTarde = await createMember();
      await addTrialBooking(mManana, schedManana, sessionDate, "confirmado");
      await addTrialBooking(mTarde, schedTarde, sessionDate, "confirmado");

      const result = await svc.getTrialFunnel({ turno: "manana" });
      // Only the 08:00 cohort row survives the turno filter.
      expect(result.counts.reservaron).toBe(1);
      expect(result.counts.asistieron).toBe(1);
      // The only turno breakdown segment is mañana.
      const turnoRows = result.breakdowns.filter((b) => b.axis === "turno");
      expect(turnoRows.map((r) => r.key)).toEqual(["manana"]);
    });

    it("planId restricts compró to buyers of that plan (plan BOUGHT axis, D-123-09)", async () => {
      const sched = await createSchedule("08:00");
      const sessionDate = daysAgo(60); // long matured
      // A distinct "target" plan we filter on, plus the default plan.
      const [tp] = await app.db.insert(subscriptionPlans).values({
        name: `TargetPlan-${Date.now()}`,
        country: "AR",
        priceRegular: 22000,
        priceZero: 12000,
        durationDays: 90,
        classesPerWeek: 4,
      });
      const targetPlanId = (tp as { insertId: number }).insertId;

      const mTarget = await createMember();
      const mOther = await createMember();
      await addTrialBooking(mTarget, sched, sessionDate, "confirmado");
      await addTrialBooking(mOther, sched, sessionDate, "confirmado");
      const buyDate = dateStr(
        new Date(
          new Date(`${sessionDate}T00:00:00Z`).getTime() + 3 * 86_400_000,
        ),
      );
      // mTarget buys the target plan (in window); mOther buys the default plan.
      await addSub(mTarget, buyDate, { plan: targetPlanId });
      await addSub(mOther, buyDate, { plan: planId });

      const result = await svc.getTrialFunnel({ planId: targetPlanId });
      // Both attended, but only the target-plan buyer counts as compró.
      expect(result.counts.reservaron).toBe(2);
      expect(result.counts.asistieron).toBe(2);
      expect(result.counts.compraron).toBe(1);
    });

    it("turno is AND-ed with country scope — no cross-branch leak (T-132-01)", async () => {
      const sessionDate = daysAgo(40);
      // A mañana AR booking and a mañana ES booking.
      const schedAR = await createSchedule("08:00", branchA);
      const schedES = await createSchedule("08:00", branchES);
      const mAR = await createMember(branchA);
      const mES = await createMember(branchES);
      await addTrialBooking(mAR, schedAR, sessionDate, "confirmado");
      await addTrialBooking(mES, schedES, sessionDate, "confirmado");

      // turno=manana scoped to AR: the ES mañana booking must NOT leak in.
      const result = await svc.getTrialFunnel({
        turno: "manana",
        country: "AR",
      });
      expect(result.counts.reservaron).toBe(1);
    });

    it("rejects a turno value outside the manana/tarde enum with 400 (T-132-03)", async () => {
      const res = await app.inject({
        method: "GET",
        url: `${ANALYTICS_URL}/trial-funnel?turno=invalid`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(400);
    });

    it("rejects turno=otro as an input value (T-132-03)", async () => {
      const res = await app.inject({
        method: "GET",
        url: `${ANALYTICS_URL}/trial-funnel?turno=otro`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Auth — ADMIN_ROLES-only (gestion 403, admin 200) (D-123-14)
  // ═══════════════════════════════════════════════════════════════════════

  describe("GET /trial-funnel auth", () => {
    it("returns 403 for gestion (ADMIN_ROLES-only)", async () => {
      await createStaffUser(app, {
        email: "gestion-tf@test.com",
        password: "gestionpass123",
        firstName: "Ges",
        lastName: "Tion",
        role: "gestion",
        branchId: branchA,
      });
      const token = await getAuthToken(
        app,
        "gestion-tf@test.com",
        "gestionpass123",
      );
      const res = await app.inject({
        method: "GET",
        url: `${ANALYTICS_URL}/trial-funnel`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it("returns 200 for admin and carries the funnel wire shape", async () => {
      const res = await app.inject({
        method: "GET",
        url: `${ANALYTICS_URL}/trial-funnel`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body).toHaveProperty("counts");
      expect(body).toHaveProperty("rates");
      expect(body).toHaveProperty("series");
      expect(body).toHaveProperty("breakdowns");
      expect(body).toHaveProperty("attributionWindowDays");
    });

    it("returns 200 for admin with a window query param", async () => {
      const res = await app.inject({
        method: "GET",
        url: `${ANALYTICS_URL}/trial-funnel?window=30`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.attributionWindowDays).toBe(30);
    });
  });
});
