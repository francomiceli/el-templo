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
import { EngagementService } from "../../src/modules/analytics/engagement-service";
import { memberProfiles } from "../../src/db/schema/member-profiles";
import { subscriptions } from "../../src/db/schema/subscriptions";
import { subscriptionPlans } from "../../src/db/schema/subscription-plans";
import { branches } from "../../src/db/schema/branches";
import type { MemberSegment } from "../../src/modules/segmentation/types";

const ANALYTICS_URL = "/api/admin/analytics";

/**
 * Phase 117 Plan 04 — EngagementService (D-12 / D-09 / D-17 / D-18).
 *
 * Real-MySQL integration. Engagement REUSES the segmentation module: it reads
 * `member_profiles.segment` (never recalculates) and only aggregates active
 * members per segment + nominal lists of en_riesgo/ghost (with phone for the
 * WhatsApp action). "Active" is the canonical `activeMemberExists` predicate.
 */
describe("EngagementService (Phase 117 Plan 04)", () => {
  let app: FastifyInstance;
  let adminToken: string;
  let svc: EngagementService;
  let branchA: number; // 'Test Branch' (AR)
  let branchES: number; // an ES branch, for cross-country scope tests
  let planId: number;

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
    svc = new EngagementService(app.db, app.log);

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
    // A plan to reference from subscriptions (engagement nominal list reads planName).
    const [p] = await app.db.insert(subscriptionPlans).values({
      name: `EngPlan-${Date.now()}`,
      country: "AR",
      priceRegular: 15000,
      priceZero: 10000,
      durationDays: 30,
      classesPerWeek: 3,
    });
    planId = (p as { insertId: number }).insertId;
  });

  async function createMember(
    email: string,
    dni: string,
    branchId = branchA,
  ): Promise<number> {
    const result = await registerUser(app, {
      email,
      password: "pass123456",
      firstName: "Eng",
      lastName: "Tester",
      branchId,
      dni,
    });
    return (result.user as { id: number }).id;
  }

  /** Make a member "active" per the canonical predicate (in-effect subscription). */
  async function makeActive(userId: number, branchId = branchA): Promise<void> {
    const today = new Date().toISOString().split("T")[0];
    const future = new Date(Date.now() + 86400000 * 30)
      .toISOString()
      .split("T")[0];
    await app.db.insert(subscriptions).values({
      userId,
      planId,
      branchId,
      status: "active",
      startDate: today,
      endDate: future,
      pricePaid: 15000,
      priceTypeApplied: "regular",
    });
  }

  async function setSegment(
    userId: number,
    segment: MemberSegment | null,
  ): Promise<void> {
    await app.db
      .insert(memberProfiles)
      .values({ userId, segment })
      .onDuplicateKeyUpdate({ set: { segment } });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // countActiveBySegment — only active members, grouped by segment (D-12)
  // ═══════════════════════════════════════════════════════════════════════

  describe("countActiveBySegment", () => {
    it("counts ONLY active members grouped by segment; non-active excluded", async () => {
      const espartano = await createMember("c-esp@test.com", "92000001");
      const enRiesgo = await createMember("c-rie@test.com", "92000002");
      const ghostActive = await createMember("c-gha@test.com", "92000003");
      const ghostInactive = await createMember("c-ghi@test.com", "92000004");

      await makeActive(espartano);
      await makeActive(enRiesgo);
      await makeActive(ghostActive);
      // ghostInactive has NO subscription → not active.

      await setSegment(espartano, "espartano");
      await setSegment(enRiesgo, "en_riesgo");
      await setSegment(ghostActive, "ghost");
      await setSegment(ghostInactive, "ghost"); // must NOT be counted

      const counts = await svc.countActiveBySegment({});
      expect(counts.espartano).toBe(1);
      expect(counts.en_riesgo).toBe(1);
      expect(counts.ghost).toBe(1); // only the active ghost
      expect(counts.nuevo).toBe(0);
      expect(counts.intermitente).toBe(0);
      expect(counts.digital_warrior).toBe(0);
      expect(counts.sinSegmento).toBe(0);
    });

    it("active members with NULL segment fall into sinSegmento bucket", async () => {
      const withSeg = await createMember("c-ws@test.com", "92001001");
      const nullSeg = await createMember("c-ns@test.com", "92001002");
      const noProfile = await createMember("c-np@test.com", "92001003");

      await makeActive(withSeg);
      await makeActive(nullSeg);
      await makeActive(noProfile);

      await setSegment(withSeg, "espartano");
      await setSegment(nullSeg, null);
      // noProfile: no member_profiles row at all.

      const counts = await svc.countActiveBySegment({});
      expect(counts.espartano).toBe(1);
      expect(counts.sinSegmento).toBe(2); // nullSeg + noProfile
    });

    it("returns all-zero counts when there are no active members", async () => {
      const counts = await svc.countActiveBySegment({});
      expect(counts).toEqual({
        nuevo: 0,
        espartano: 0,
        intermitente: 0,
        en_riesgo: 0,
        digital_warrior: 0,
        ghost: 0,
        sinSegmento: 0,
      });
    });

    it("respects branchId scope", async () => {
      const mA = await createMember("c-sa@test.com", "92002001", branchA);
      const mES = await createMember("c-ses@test.com", "92002002", branchES);
      await makeActive(mA, branchA);
      await makeActive(mES, branchES);
      await setSegment(mA, "espartano");
      await setSegment(mES, "espartano");

      const onlyA = await svc.countActiveBySegment({ branchId: branchA });
      expect(onlyA.espartano).toBe(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // getEngagementNominalList — en_riesgo + ghost active, with phone (D-12/D-17)
  // ═══════════════════════════════════════════════════════════════════════

  describe("getEngagementNominalList", () => {
    it("returns ONLY active en_riesgo and ghost members with phone/planName", async () => {
      const enRiesgo = await createMember("n-rie@test.com", "92010001");
      const ghost = await createMember("n-gho@test.com", "92010002");
      const espartano = await createMember("n-esp@test.com", "92010003");
      const ghostInactive = await createMember("n-ghi@test.com", "92010004");

      await makeActive(enRiesgo);
      await makeActive(ghost);
      await makeActive(espartano);
      // ghostInactive: no subscription.

      await setSegment(enRiesgo, "en_riesgo");
      await setSegment(ghost, "ghost");
      await setSegment(espartano, "espartano");
      await setSegment(ghostInactive, "ghost");

      const list = await svc.getEngagementNominalList({});
      const ids = list.map((m) => m.userId).sort();
      expect(ids).toEqual([enRiesgo, ghost].sort());

      const riesgoRow = list.find((m) => m.userId === enRiesgo);
      expect(riesgoRow).toBeDefined();
      expect(riesgoRow!.segment).toBe("en_riesgo");
      expect(riesgoRow!.planName).toBeTruthy();
      // phone present in the shape (PII gated by guard/scope).
      expect("phone" in riesgoRow!).toBe(true);

      const ghostRow = list.find((m) => m.userId === ghost);
      expect(ghostRow!.segment).toBe("ghost");
    });

    it("respects branchId scope (no PII leak across sedes — T-117-01)", async () => {
      const mA = await createMember("n-sa@test.com", "92011001", branchA);
      const mES = await createMember("n-ses@test.com", "92011002", branchES);
      await makeActive(mA, branchA);
      await makeActive(mES, branchES);
      await setSegment(mA, "ghost");
      await setSegment(mES, "ghost");

      const onlyA = await svc.getEngagementNominalList({ branchId: branchA });
      expect(onlyA.map((m) => m.userId)).toEqual([mA]);
    });

    it("returns empty list when no en_riesgo/ghost active members", async () => {
      const list = await svc.getEngagementNominalList({});
      expect(list).toEqual([]);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Endpoint — guard + scope (Task 2, T-117-01 / T-117-06)
  // ═══════════════════════════════════════════════════════════════════════

  describe("GET /api/admin/analytics/engagement", () => {
    it("returns 401 unauthenticated", async () => {
      const res = await app.inject({
        method: "GET",
        url: `${ANALYTICS_URL}/engagement`,
      });
      expect(res.statusCode).toBe(401);
    });

    it("returns 403 for a regular member", async () => {
      const { token } = await registerUser(app, {
        email: "member-eng@test.com",
        password: "pass123456",
        firstName: "Reg",
        lastName: "Member",
        branchId: branchA,
      });
      const res = await app.inject({
        method: "GET",
        url: `${ANALYTICS_URL}/engagement`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it("owner without branchId sees global counts + nominal list", async () => {
      const enRiesgo = await createMember("e-rie@test.com", "92020001");
      await makeActive(enRiesgo);
      await setSegment(enRiesgo, "en_riesgo");

      const res = await app.inject({
        method: "GET",
        url: `${ANALYTICS_URL}/engagement`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.counts.en_riesgo).toBe(1);
      expect(Array.isArray(body.nominalList)).toBe(true);
      expect(
        body.nominalList.some((m: { userId: number }) => m.userId === enRiesgo),
      ).toBe(true);
    });

    it("AR admin is denied (403) querying an ES sede; allowed on AR (T-117-01/T-117-06 PII by scope)", async () => {
      await createStaffUser(app, {
        email: "admin-eng@test.com",
        password: "adminarpass123",
        firstName: "Admin",
        lastName: "Eng",
        role: "admin",
        branchId: branchA,
      });
      const arAdminToken = await getAuthToken(
        app,
        "admin-eng@test.com",
        "adminarpass123",
      );

      const denied = await app.inject({
        method: "GET",
        url: `${ANALYTICS_URL}/engagement?branchId=${branchES}`,
        headers: { authorization: `Bearer ${arAdminToken}` },
      });
      expect(denied.statusCode).toBe(403);

      const ok = await app.inject({
        method: "GET",
        url: `${ANALYTICS_URL}/engagement?branchId=${branchA}`,
        headers: { authorization: `Bearer ${arAdminToken}` },
      });
      expect(ok.statusCode).toBe(200);
    });
  });
});
