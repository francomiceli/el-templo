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
import { users as usersTable } from "../../src/db/schema/users";
import { subscriptions } from "../../src/db/schema/subscriptions";
import { subscriptionPlans } from "../../src/db/schema/subscription-plans";
import { branches } from "../../src/db/schema/branches";
import type { MemberSegment } from "../../src/modules/segmentation/types";
import { type TenantContext } from "../../src/modules/shared/tenant";
import { TENANT_TEMPLO } from "../fixtures/second-tenant";

const ANALYTICS_URL = "/api/admin/analytics";

/**
 * Fase 173 (D-02): `countActiveBySegment`/`getEngagementNominalList` reciben
 * `TenantContext` como PRIMER argumento (en producción sale de
 * `assertTenant(request.scope, …)`); acá se construye a mano porque el
 * service se invoca sin request. El Templo es el tenant 1.
 */
const CTX: TenantContext = { tenantId: TENANT_TEMPLO };

/**
 * Phase 117 Plan 04 — EngagementService (D-12 / D-09 / D-17 / D-18).
 * Phase 136 Plan 03 — propagated to the 4 Attendance bands (D-01).
 *
 * Real-MySQL integration. Engagement REUSES the segmentation module: it reads
 * `member_profiles.segment` (never recalculates) and only aggregates active
 * members per band + nominal lists of alerta/ausente (with phone for the
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
    it("counts ONLY active members grouped by band; non-active excluded", async () => {
      const optima = await createMember("c-opt@test.com", "92000001");
      const alerta = await createMember("c-ale@test.com", "92000002");
      const ausenteActive = await createMember("c-aua@test.com", "92000003");
      const ausenteInactive = await createMember("c-aui@test.com", "92000004");

      await makeActive(optima);
      await makeActive(alerta);
      await makeActive(ausenteActive);
      // ausenteInactive has NO subscription → not active.

      await setSegment(optima, "optima");
      await setSegment(alerta, "alerta");
      await setSegment(ausenteActive, "ausente");
      await setSegment(ausenteInactive, "ausente"); // must NOT be counted

      const counts = await svc.countActiveBySegment(CTX, {});
      expect(counts.optima).toBe(1);
      expect(counts.alerta).toBe(1);
      expect(counts.ausente).toBe(1); // only the active ausente
      expect(counts.regular).toBe(0);
      expect(counts.sinSegmento).toBe(0);
    });

    it("active members with NULL segment fall into sinSegmento bucket", async () => {
      const withSeg = await createMember("c-ws@test.com", "92001001");
      const nullSeg = await createMember("c-ns@test.com", "92001002");
      const noProfile = await createMember("c-np@test.com", "92001003");

      await makeActive(withSeg);
      await makeActive(nullSeg);
      await makeActive(noProfile);

      await setSegment(withSeg, "optima");
      await setSegment(nullSeg, null);
      // noProfile: no member_profiles row at all.

      const counts = await svc.countActiveBySegment(CTX, {});
      expect(counts.optima).toBe(1);
      expect(counts.sinSegmento).toBe(2); // nullSeg + noProfile
    });

    it("returns all-zero counts when there are no active members", async () => {
      const counts = await svc.countActiveBySegment(CTX, {});
      expect(counts).toEqual({
        optima: 0,
        regular: 0,
        alerta: 0,
        ausente: 0,
        sinSegmento: 0,
      });
    });

    it("respects branchId scope", async () => {
      const mA = await createMember("c-sa@test.com", "92002001", branchA);
      const mES = await createMember("c-ses@test.com", "92002002", branchES);
      await makeActive(mA, branchA);
      await makeActive(mES, branchES);
      await setSegment(mA, "optima");
      await setSegment(mES, "optima");

      const onlyA = await svc.countActiveBySegment(CTX, { branchId: branchA });
      expect(onlyA.optima).toBe(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // getEngagementNominalList — alerta + ausente active, with phone (D-12/D-17)
  // ═══════════════════════════════════════════════════════════════════════

  describe("getEngagementNominalList", () => {
    it("returns ONLY active alerta and ausente members with phone/planName", async () => {
      const alerta = await createMember("n-ale@test.com", "92010001");
      const ausente = await createMember("n-aus@test.com", "92010002");
      const optima = await createMember("n-opt@test.com", "92010003");
      const ausenteInactive = await createMember("n-aui@test.com", "92010004");

      await makeActive(alerta);
      await makeActive(ausente);
      await makeActive(optima);
      // ausenteInactive: no subscription.

      await setSegment(alerta, "alerta");
      await setSegment(ausente, "ausente");
      await setSegment(optima, "optima");
      await setSegment(ausenteInactive, "ausente");

      const list = await svc.getEngagementNominalList(CTX, {});
      const ids = list.map((m) => m.userId).sort();
      expect(ids).toEqual([alerta, ausente].sort());

      const alertaRow = list.find((m) => m.userId === alerta);
      expect(alertaRow).toBeDefined();
      expect(alertaRow!.segment).toBe("alerta");
      expect(alertaRow!.planName).toBeTruthy();
      // phone present in the shape (PII gated by guard/scope).
      expect("phone" in alertaRow!).toBe(true);

      const ausenteRow = list.find((m) => m.userId === ausente);
      expect(ausenteRow!.segment).toBe("ausente");
    });

    it("orders ausente before alerta (ausente = higher urgency, 0% usage)", async () => {
      // "Bbb" sorts after "Aaa" so name-tiebreak would put alerta first if
      // urgency were ignored — proving the band-urgency precedence.
      const alerta = await createMember("n-ord-a@test.com", "92012001");
      const ausente = await createMember("n-ord-b@test.com", "92012002");

      await makeActive(alerta);
      await makeActive(ausente);

      // alerta has the name that sorts FIRST alphabetically; ausente sorts last.
      await app.db
        .update(usersTable)
        .set({ lastName: "Aaa" })
        .where(eq(usersTable.id, alerta));
      await app.db
        .update(usersTable)
        .set({ lastName: "Bbb" })
        .where(eq(usersTable.id, ausente));

      await setSegment(alerta, "alerta");
      await setSegment(ausente, "ausente");

      const list = await svc.getEngagementNominalList(CTX, {});
      const ordered = list.filter(
        (m) => m.userId === alerta || m.userId === ausente,
      );
      // ausente (Bbb) must come BEFORE alerta (Aaa) despite the name tiebreak.
      expect(ordered.map((m) => m.userId)).toEqual([ausente, alerta]);
    });

    it("respects branchId scope (no PII leak across sedes — T-117-01)", async () => {
      const mA = await createMember("n-sa@test.com", "92011001", branchA);
      const mES = await createMember("n-ses@test.com", "92011002", branchES);
      await makeActive(mA, branchA);
      await makeActive(mES, branchES);
      await setSegment(mA, "ausente");
      await setSegment(mES, "ausente");

      const onlyA = await svc.getEngagementNominalList(CTX, { branchId: branchA });
      expect(onlyA.map((m) => m.userId)).toEqual([mA]);
    });

    it("returns empty list when no alerta/ausente active members", async () => {
      const list = await svc.getEngagementNominalList(CTX, {});
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
      const alerta = await createMember("e-ale@test.com", "92020001");
      await makeActive(alerta);
      await setSegment(alerta, "alerta");

      const res = await app.inject({
        method: "GET",
        url: `${ANALYTICS_URL}/engagement`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.counts.alerta).toBe(1);
      expect(Array.isArray(body.nominalList)).toBe(true);
      expect(
        body.nominalList.some((m: { userId: number }) => m.userId === alerta),
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
