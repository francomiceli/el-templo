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
import { AttendanceMetricsService } from "../../src/modules/analytics/attendance-metrics-service";
import { attendance } from "../../src/db/schema/attendance";
import { bookings } from "../../src/db/schema/bookings";
import { schedules } from "../../src/db/schema/schedules";
import { activities } from "../../src/db/schema/activities";
import { branches } from "../../src/db/schema/branches";

const ANALYTICS_URL = "/api/admin/analytics";

/**
 * Phase 117 Plan 03 — AttendanceMetricsService (D-09 / D-11 / D-13).
 *
 * Real-clock, real-MySQL integration tests (NO vi.useFakeTimers — it desyncs
 * from MySQL CURDATE()/NOW(), lesson from Plan 103-03). Seeds attendance /
 * bookings directly via Drizzle.
 */
describe("AttendanceMetricsService (Phase 117 Plan 03)", () => {
  let app: FastifyInstance;
  let adminToken: string;
  let svc: AttendanceMetricsService;
  let branchA: number; // 'Test Branch' (AR), the seeded one
  let branchB: number; // a second AR branch, created per-suite
  let branchES: number; // an ES branch, for cross-country scope tests

  // Helper: a timestamp N days ago as "YYYY-MM-DD HH:MM:SS".
  function daysAgo(n: number): Date {
    return new Date(Date.now() - n * 86_400_000);
  }
  function dateStr(d: Date): string {
    return d.toISOString().split("T")[0];
  }

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
    svc = new AttendanceMetricsService(app.db, app.log);

    const [a] = await app.db
      .select({ id: branches.id })
      .from(branches)
      .where(eq(branches.code, "TEST"));
    branchA = a.id;

    // Ensure a second AR branch exists (idempotent on code).
    await app.db
      .insert(branches)
      .values({ name: "Sede B Test", code: "TESTB", country: "AR" })
      .onDuplicateKeyUpdate({ set: { name: "Sede B Test" } });
    const [b] = await app.db
      .select({ id: branches.id })
      .from(branches)
      .where(eq(branches.code, "TESTB"));
    branchB = b.id;

    // An ES branch for cross-country scope tests (AR admin must be denied).
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
  });

  async function createMember(
    email: string,
    dni: string,
    branchId = branchA,
  ): Promise<number> {
    const result = await registerUser(app, {
      email,
      password: "pass123456",
      firstName: "AM",
      lastName: "Tester",
      branchId,
      dni,
    });
    return (result.user as { id: number }).id;
  }

  async function createSchedule(branchId: number): Promise<number> {
    const [act] = await app.db.insert(activities).values({
      name: `Act-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      branchId,
    });
    const activityId = (act as { insertId: number }).insertId;
    const [sch] = await app.db.insert(schedules).values({
      branchId,
      activityId,
      dayOfWeek: 1,
      startTime: "10:00",
      endTime: "11:00",
    });
    return (sch as { insertId: number }).insertId;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // uniqueMembers — COUNT DISTINCT member_id by 7/14/30 window (D-11)
  // ═══════════════════════════════════════════════════════════════════════

  describe("uniqueMembers", () => {
    it("counts distinct members per 7/14/30 window using check-in timestamps", async () => {
      const m1 = await createMember("u-1@test.com", "91000001");
      const m2 = await createMember("u-2@test.com", "91000002");
      const m3 = await createMember("u-3@test.com", "91000003");

      // m1 + m2 inside 7 days (m1 has 2 check-ins → still 1 distinct).
      await app.db.insert(attendance).values([
        {
          memberId: m1,
          branchId: branchA,
          sessionDate: dateStr(daysAgo(1)),
          checkedInAt: daysAgo(1),
        },
        {
          memberId: m1,
          branchId: branchA,
          sessionDate: dateStr(daysAgo(2)),
          checkedInAt: daysAgo(2),
        },
        {
          memberId: m2,
          branchId: branchA,
          sessionDate: dateStr(daysAgo(3)),
          checkedInAt: daysAgo(3),
        },
      ]);
      // m3 inside 30 but outside 14 (20 days ago).
      await app.db.insert(attendance).values({
        memberId: m3,
        branchId: branchA,
        sessionDate: dateStr(daysAgo(20)),
        checkedInAt: daysAgo(20),
      });
      // A check-in 40 days ago must fall outside even the 30-day window.
      await app.db.insert(attendance).values({
        memberId: m3,
        branchId: branchA,
        sessionDate: dateStr(daysAgo(40)),
        checkedInAt: daysAgo(40),
      });

      const result = await svc.uniqueMembers({});
      expect(result.last7).toBe(2); // m1, m2
      expect(result.last14).toBe(2); // m1, m2 (m3 is at 20d)
      expect(result.last30).toBe(3); // m1, m2, m3 (the 40d row excluded)
    });

    it("respects branchId scope: only counts the filtered sede", async () => {
      const mA = await createMember("u-a@test.com", "91000010", branchA);
      const mB = await createMember("u-b@test.com", "91000011", branchB);

      await app.db.insert(attendance).values([
        {
          memberId: mA,
          branchId: branchA,
          sessionDate: dateStr(daysAgo(1)),
          checkedInAt: daysAgo(1),
        },
        {
          memberId: mB,
          branchId: branchB,
          sessionDate: dateStr(daysAgo(1)),
          checkedInAt: daysAgo(1),
        },
      ]);

      const onlyA = await svc.uniqueMembers({ branchId: branchA });
      expect(onlyA.last7).toBe(1);
      expect(onlyA.last30).toBe(1);

      const both = await svc.uniqueMembers({});
      expect(both.last7).toBe(2);
    });

    it("returns zeros when there are no check-ins", async () => {
      const result = await svc.uniqueMembers({});
      expect(result).toEqual({ last7: 0, last14: 0, last30: 0 });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // checkInAdoptionByBranch — ratio per sede (D-13 Parte B)
  // ═══════════════════════════════════════════════════════════════════════

  describe("checkInAdoptionByBranch", () => {
    it("computes ratio = conCheckin / confirmados per branch", async () => {
      const today = dateStr(new Date());
      const schedA = await createSchedule(branchA);
      const schedB = await createSchedule(branchB);

      // Sede A: 4 confirmed bookings, only 1 has a check-in → ratio 0.25.
      const aMembers: number[] = [];
      for (let i = 0; i < 4; i++) {
        const id = await createMember(
          `a-${i}@test.com`,
          `9120000${i}`,
          branchA,
        );
        aMembers.push(id);
        await app.db.insert(bookings).values({
          memberId: id,
          scheduleId: schedA,
          bookingDate: today,
          status: "confirmado",
        });
      }
      // Only the first member checked in (matching member+schedule+date).
      await app.db.insert(attendance).values({
        memberId: aMembers[0],
        branchId: branchA,
        scheduleId: schedA,
        sessionDate: today,
        checkedInAt: new Date(),
      });

      // Sede B: 4 confirmed bookings, all 4 checked in → ratio 1.0.
      for (let i = 0; i < 4; i++) {
        const id = await createMember(
          `b-${i}@test.com`,
          `9121000${i}`,
          branchB,
        );
        await app.db.insert(bookings).values({
          memberId: id,
          scheduleId: schedB,
          bookingDate: today,
          status: "confirmado",
        });
        await app.db.insert(attendance).values({
          memberId: id,
          branchId: branchB,
          scheduleId: schedB,
          sessionDate: today,
          checkedInAt: new Date(),
        });
      }

      const rows = await svc.checkInAdoptionByBranch({});
      const rowA = rows.find((r) => r.branchId === branchA);
      const rowB = rows.find((r) => r.branchId === branchB);

      expect(rowA).toBeDefined();
      expect(rowA!.confirmados).toBe(4);
      expect(rowA!.conCheckin).toBe(1);
      expect(rowA!.ratio).toBeCloseTo(0.25, 5);

      expect(rowB).toBeDefined();
      expect(rowB!.confirmados).toBe(4);
      expect(rowB!.conCheckin).toBe(4);
      expect(rowB!.ratio).toBeCloseTo(1.0, 5);
    });

    it("returns ratio 0 (not NaN) when a sede has confirmados but 0 check-ins", async () => {
      const today = dateStr(new Date());
      const sched = await createSchedule(branchA);

      for (let i = 0; i < 3; i++) {
        const id = await createMember(
          `z-${i}@test.com`,
          `9122000${i}`,
          branchA,
        );
        await app.db.insert(bookings).values({
          memberId: id,
          scheduleId: sched,
          bookingDate: today,
          status: "confirmado",
        });
      }

      const rows = await svc.checkInAdoptionByBranch({});
      const row = rows.find((r) => r.branchId === branchA);
      expect(row).toBeDefined();
      expect(row!.confirmados).toBe(3);
      expect(row!.conCheckin).toBe(0);
      expect(row!.ratio).toBe(0);
      expect(Number.isNaN(row!.ratio)).toBe(false);
    });

    it("ignores non-confirmado bookings in the denominator", async () => {
      const today = dateStr(new Date());
      const sched = await createSchedule(branchA);

      const m1 = await createMember("c-1@test.com", "91230001", branchA);
      const m2 = await createMember("c-2@test.com", "91230002", branchA);
      // 1 confirmado (with check-in) + 1 reservado (ignored) + 1 no_show (ignored).
      await app.db.insert(bookings).values([
        {
          memberId: m1,
          scheduleId: sched,
          bookingDate: today,
          status: "confirmado",
        },
        {
          memberId: m2,
          scheduleId: sched,
          bookingDate: today,
          status: "reservado",
        },
      ]);
      await app.db.insert(attendance).values({
        memberId: m1,
        branchId: branchA,
        scheduleId: sched,
        sessionDate: today,
        checkedInAt: new Date(),
      });

      const rows = await svc.checkInAdoptionByBranch({});
      const row = rows.find((r) => r.branchId === branchA);
      expect(row!.confirmados).toBe(1);
      expect(row!.conCheckin).toBe(1);
      expect(row!.ratio).toBe(1);
    });

    it("respects branchId scope", async () => {
      const today = dateStr(new Date());
      const schedA = await createSchedule(branchA);
      const schedB = await createSchedule(branchB);
      const mA = await createMember("sa@test.com", "91240001", branchA);
      const mB = await createMember("sb@test.com", "91240002", branchB);
      await app.db.insert(bookings).values([
        {
          memberId: mA,
          scheduleId: schedA,
          bookingDate: today,
          status: "confirmado",
        },
        {
          memberId: mB,
          scheduleId: schedB,
          bookingDate: today,
          status: "confirmado",
        },
      ]);

      const rows = await svc.checkInAdoptionByBranch({ branchId: branchA });
      expect(rows.length).toBe(1);
      expect(rows[0].branchId).toBe(branchA);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Endpoints — guard + scope (Task 2, T-117-01)
  // ═══════════════════════════════════════════════════════════════════════

  describe("GET /api/admin/analytics/attendance/unique-members", () => {
    it("returns 401 unauthenticated", async () => {
      const res = await app.inject({
        method: "GET",
        url: `${ANALYTICS_URL}/attendance/unique-members`,
      });
      expect(res.statusCode).toBe(401);
    });

    it("returns 403 for a regular member", async () => {
      const { token } = await registerUser(app, {
        email: "member-um@test.com",
        password: "pass123456",
        firstName: "Reg",
        lastName: "Member",
        branchId: branchA,
      });
      const res = await app.inject({
        method: "GET",
        url: `${ANALYTICS_URL}/attendance/unique-members`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it("owner without branchId sees global unique members", async () => {
      const m = await createMember("um-owner@test.com", "91300001", branchA);
      await app.db.insert(attendance).values({
        memberId: m,
        branchId: branchA,
        sessionDate: dateStr(daysAgo(1)),
        checkedInAt: daysAgo(1),
      });

      const res = await app.inject({
        method: "GET",
        url: `${ANALYTICS_URL}/attendance/unique-members`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.last7).toBe(1);
      expect(body.last14).toBeDefined();
      expect(body.last30).toBeDefined();
    });

    it("AR admin is denied (403) querying an ES sede; allowed on an AR sede (T-117-01)", async () => {
      // Analytics is gated to ADMIN_ROLES (admin/owner) — coach/recepción cannot
      // reach it. The server-side scope guard for an admin is country-level:
      // requireBranchAccess → canAccessBranch Rule 3 denies a cross-country sede.
      // The AR admin's country resolves from their AR branch (createStaffUser).
      await createStaffUser(app, {
        email: "admin-ar@test.com",
        password: "adminarpass123",
        firstName: "Admin",
        lastName: "AR",
        role: "admin",
        branchId: branchA,
      });
      const arAdminToken = await getAuthToken(
        app,
        "admin-ar@test.com",
        "adminarpass123",
      );

      // Querying the ES sede → 403 (cross-country, no fuga de otra sede/país).
      const denied = await app.inject({
        method: "GET",
        url: `${ANALYTICS_URL}/attendance/unique-members?branchId=${branchES}`,
        headers: { authorization: `Bearer ${arAdminToken}` },
      });
      expect(denied.statusCode).toBe(403);

      // Querying an AR sede → 200 (same country).
      const ok = await app.inject({
        method: "GET",
        url: `${ANALYTICS_URL}/attendance/unique-members?branchId=${branchA}`,
        headers: { authorization: `Bearer ${arAdminToken}` },
      });
      expect(ok.statusCode).toBe(200);
    });
  });

  describe("GET /api/admin/analytics/attendance/checkin-adoption", () => {
    it("returns per-branch rows for owner", async () => {
      const today = dateStr(new Date());
      const sched = await createSchedule(branchA);
      const m = await createMember("ca-owner@test.com", "91310001", branchA);
      await app.db.insert(bookings).values({
        memberId: m,
        scheduleId: sched,
        bookingDate: today,
        status: "confirmado",
      });
      await app.db.insert(attendance).values({
        memberId: m,
        branchId: branchA,
        scheduleId: sched,
        sessionDate: today,
        checkedInAt: new Date(),
      });

      const res = await app.inject({
        method: "GET",
        url: `${ANALYTICS_URL}/attendance/checkin-adoption`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(Array.isArray(body)).toBe(true);
      const row = body.find(
        (r: { branchId: number }) => r.branchId === branchA,
      );
      expect(row).toBeDefined();
      expect(row.confirmados).toBe(1);
      expect(row.conCheckin).toBe(1);
      expect(row.ratio).toBe(1);
    });

    it("AR admin is denied (403) querying an ES sede (T-117-01)", async () => {
      await createStaffUser(app, {
        email: "admin-ca@test.com",
        password: "adminarpass123",
        firstName: "Admin",
        lastName: "CA",
        role: "admin",
        branchId: branchA,
      });
      const arAdminToken = await getAuthToken(
        app,
        "admin-ca@test.com",
        "adminarpass123",
      );

      const res = await app.inject({
        method: "GET",
        url: `${ANALYTICS_URL}/attendance/checkin-adoption?branchId=${branchES}`,
        headers: { authorization: `Bearer ${arAdminToken}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });
});
