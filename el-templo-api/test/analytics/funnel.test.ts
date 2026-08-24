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
import { FunnelService } from "../../src/modules/analytics/funnel-service";
import { users } from "../../src/db/schema/users";
import { userStatusHistory } from "../../src/db/schema/user-status-history";
import { subscriptions } from "../../src/db/schema/subscriptions";
import { subscriptionPlans } from "../../src/db/schema/subscription-plans";
import { branches } from "../../src/db/schema/branches";
import {
  tenantWhere,
  type TenantContext,
} from "../../src/modules/shared/tenant";
import { TENANT_TEMPLO } from "../fixtures/second-tenant";

const ANALYTICS_URL = "/api/admin/analytics";

/**
 * Fase 173 (D-02): `getFunnel` recibe `TenantContext` como PRIMER argumento
 * (en producción sale de `assertTenant(request.scope, …)`); acá se construye
 * a mano porque el service se invoca sin request. El Templo es el tenant 1.
 */
const CTX: TenantContext = { tenantId: TENANT_TEMPLO };

/**
 * Phase 118 Plan 04 — FunnelService (D-01 / D-03 / D-09 / D-11 / D-12).
 *
 * Real-MySQL integration. Conversion funnel `freemium → prueba → activo` by
 * cohort (cohort = month of users.created_at). Per cohort: % a prueba, % a
 * activo, mediana de días freemium→prueba y prueba→activo. La etapa `activo`
 * histórica se aproxima con MIN(subscriptions.created_at); las transiciones
 * precisas vienen de user_status_history (forward-only). Endpoint
 * ADMIN_ROLES-only (gestion 403).
 */
describe("FunnelService (Phase 118 Plan 04)", () => {
  let app: FastifyInstance;
  let adminToken: string;
  let svc: FunnelService;
  let branchA: number; // 'Test Branch' (AR)
  let branchES: number; // an ES branch, for cross-country scope tests
  let planId: number;

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
    svc = new FunnelService(app.db, app.log);

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
      name: `FunnelPlan-${Date.now()}`,
      country: "AR",
      priceRegular: 15000,
      priceZero: 10000,
      durationDays: 30,
      classesPerWeek: 3,
    });
    planId = (p as { insertId: number }).insertId;
  });

  /**
   * Create a member, then force `users.created_at` to a controlled timestamp so
   * the cohort (month of created_at) is deterministic. `registerUser` stamps
   * NOW(), so we overwrite it.
   */
  async function createMember(
    email: string,
    dni: string,
    createdAt: string,
    branchId = branchA,
  ): Promise<number> {
    const result = await registerUser(app, {
      email,
      password: "pass123456",
      firstName: "Fun",
      lastName: "Tester",
      branchId,
      dni,
    });
    const userId = (result.user as { id: number }).id;
    await app.db
      .update(users)
      .set({ createdAt: new Date(createdAt) })
      .where(and(tenantWhere(users, CTX), eq(users.id, userId)));
    return userId;
  }

  /** Insert a user_status_history transition with a controlled changedAt. */
  async function addTransition(
    userId: number,
    fromStatus: "freemium" | "prueba" | "activo" | "inactivo" | null,
    toStatus: "freemium" | "prueba" | "activo" | "inactivo",
    changedAt: string,
  ): Promise<void> {
    await app.db.insert(userStatusHistory).values({
      userId,
      fromStatus,
      toStatus,
      source: "admin",
      changedAt: new Date(changedAt),
    });
  }

  /** Insert a subscription with a controlled created_at (the activo approximation). */
  async function addSub(userId: number, createdAt: string): Promise<void> {
    await app.db.insert(subscriptions).values({
      userId,
      planId,
      branchId: branchA,
      status: "active",
      startDate: createdAt.split("T")[0],
      endDate: null,
      pricePaid: 15000,
      priceTypeApplied: "regular",
      createdAt: new Date(createdAt),
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Cohorts (D-03)
  // ═══════════════════════════════════════════════════════════════════════

  describe("getFunnel cohorts", () => {
    it("groups users created the same month into the same cohort", async () => {
      await createMember("c-a@test.com", "94000001", "2026-01-05T10:00:00Z");
      await createMember("c-b@test.com", "94000002", "2026-01-20T10:00:00Z");
      await createMember("c-c@test.com", "94000003", "2026-02-10T10:00:00Z");

      const res = await svc.getFunnel(CTX, {});
      const jan = res.cohorts.find((c) => c.cohortMonth === "2026-01");
      const feb = res.cohorts.find((c) => c.cohortMonth === "2026-02");
      expect(jan!.size).toBe(2);
      expect(feb!.size).toBe(1);
    });

    it("returns cohorts sorted ascending by month", async () => {
      await createMember("s-a@test.com", "94001001", "2026-03-01T10:00:00Z");
      await createMember("s-b@test.com", "94001002", "2026-01-01T10:00:00Z");
      await createMember("s-c@test.com", "94001003", "2026-02-01T10:00:00Z");

      const res = await svc.getFunnel(CTX, {});
      const months = res.cohorts.map((c) => c.cohortMonth);
      expect(months).toEqual([...months].sort());
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // % conversión a prueba / activo (D-03)
  // ═══════════════════════════════════════════════════════════════════════

  describe("conversion percentages", () => {
    it("% a prueba = users with a 'prueba' transition ÷ cohort size", async () => {
      const u1 = await createMember(
        "p-1@test.com",
        "94010001",
        "2026-01-02T10:00:00Z",
      );
      const u2 = await createMember(
        "p-2@test.com",
        "94010002",
        "2026-01-03T10:00:00Z",
      );
      // u3, u4 never reach prueba
      await createMember("p-3@test.com", "94010003", "2026-01-04T10:00:00Z");
      await createMember("p-4@test.com", "94010004", "2026-01-05T10:00:00Z");

      await addTransition(u1, "freemium", "prueba", "2026-01-12T10:00:00Z");
      await addTransition(u2, "freemium", "prueba", "2026-01-13T10:00:00Z");

      const res = await svc.getFunnel(CTX, {});
      const jan = res.cohorts.find((c) => c.cohortMonth === "2026-01");
      expect(jan!.size).toBe(4);
      // 2 of 4 reached prueba → 50%
      expect(jan!.toPruebaPct).toBe(50);
    });

    it("% a activo counts history transitions AND the sub approximation", async () => {
      // u1: activo via history transition
      const u1 = await createMember(
        "a-1@test.com",
        "94020001",
        "2026-01-02T10:00:00Z",
      );
      // u2: activo via subscription approximation (no history transition)
      const u2 = await createMember(
        "a-2@test.com",
        "94020002",
        "2026-01-03T10:00:00Z",
      );
      // u3: never activo
      await createMember("a-3@test.com", "94020003", "2026-01-04T10:00:00Z");

      await addTransition(u1, "prueba", "activo", "2026-01-20T10:00:00Z");
      await addSub(u2, "2026-01-25T10:00:00Z");

      const res = await svc.getFunnel(CTX, {});
      const jan = res.cohorts.find((c) => c.cohortMonth === "2026-01");
      expect(jan!.size).toBe(3);
      // u1 + u2 reached activo (one via history, one via sub) → 2/3 ≈ 67%
      expect(jan!.toActivoPct).toBe(67);
    });

    it("cohort with no prueba transitions reports 0% prueba without NaN", async () => {
      await createMember("z-1@test.com", "94030001", "2026-01-02T10:00:00Z");
      await createMember("z-2@test.com", "94030002", "2026-01-03T10:00:00Z");

      const res = await svc.getFunnel(CTX, {});
      const jan = res.cohorts.find((c) => c.cohortMonth === "2026-01");
      expect(jan!.toPruebaPct).toBe(0);
      expect(jan!.toActivoPct).toBe(0);
      expect(Number.isNaN(jan!.toPruebaPct)).toBe(false);
      expect(jan!.medianDaysFreemiumToPrueba).toBeNull();
      expect(jan!.medianDaysPruebaToActivo).toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Medianas por etapa (D-03)
  // ═══════════════════════════════════════════════════════════════════════

  describe("stage medians", () => {
    it("mediana freemium→prueba sólo sobre los que pasaron a prueba", async () => {
      // created 2026-01-01; prueba at +10 days and +20 days → median 15
      const u1 = await createMember(
        "m-1@test.com",
        "94040001",
        "2026-01-01T00:00:00Z",
      );
      const u2 = await createMember(
        "m-2@test.com",
        "94040002",
        "2026-01-01T00:00:00Z",
      );
      // u3 never reaches prueba → must NOT dilute the median
      await createMember("m-3@test.com", "94040003", "2026-01-01T00:00:00Z");

      await addTransition(u1, "freemium", "prueba", "2026-01-11T00:00:00Z"); // 10d
      await addTransition(u2, "freemium", "prueba", "2026-01-21T00:00:00Z"); // 20d

      const res = await svc.getFunnel(CTX, {});
      const jan = res.cohorts.find((c) => c.cohortMonth === "2026-01");
      // median of [10, 20] = 15
      expect(jan!.medianDaysFreemiumToPrueba).toBe(15);
    });

    it("mediana prueba→activo sólo sobre los que pasaron por ambas etapas", async () => {
      // u1: prueba at day 10, activo at day 16 → 6 days
      const u1 = await createMember(
        "pa-1@test.com",
        "94050001",
        "2026-01-01T00:00:00Z",
      );
      // u2: activo via sub but NO prueba transition → excluded from prueba→activo
      const u2 = await createMember(
        "pa-2@test.com",
        "94050002",
        "2026-01-01T00:00:00Z",
      );

      await addTransition(u1, "freemium", "prueba", "2026-01-11T00:00:00Z");
      await addTransition(u1, "prueba", "activo", "2026-01-17T00:00:00Z"); // +6d
      await addSub(u2, "2026-01-25T00:00:00Z"); // activo, but no prueba

      const res = await svc.getFunnel(CTX, {});
      const jan = res.cohorts.find((c) => c.cohortMonth === "2026-01");
      // Only u1 passed through both stages → median of [6] = 6
      expect(jan!.medianDaysPruebaToActivo).toBe(6);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Activo approximation via MIN(subscriptions.created_at) (D-01)
  // ═══════════════════════════════════════════════════════════════════════

  describe("activo approximation", () => {
    it("a user with a sub but no activo transition counts as activo", async () => {
      const u = await createMember(
        "ap-1@test.com",
        "94060001",
        "2026-01-02T10:00:00Z",
      );
      await addSub(u, "2026-01-20T10:00:00Z");

      const res = await svc.getFunnel(CTX, {});
      const jan = res.cohorts.find((c) => c.cohortMonth === "2026-01");
      expect(jan!.toActivoPct).toBe(100);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Entry-origin segmentation (funnel follow-up) — attribute conversions by
  // the path the trial came from: directo (prueba creada directa, from=NULL,
  // canal Meta ads/WhatsApp) vs freemium (freemium → prueba). Each segment is
  // a 2-stage prueba → activo funnel.
  // ═══════════════════════════════════════════════════════════════════════

  describe("entry-origin segmentation", () => {
    /**
     * One cohort (2026-03) mixing every origin:
     *   d1: null → prueba → activo        [directo, converted]
     *   d2: null → prueba                 [directo, not converted]
     *   f1: freemium → prueba → activo    [freemium, converted]
     *   f2: freemium → prueba             [freemium, not converted]
     *   s1: only a sub, no prueba row     [unclassifiable → only in `all`]
     *   o1: inactivo → prueba (rebound)   ['otro' → only in `all`]
     */
    async function seedMixedCohort() {
      const d1 = await createMember(
        "eo-d1@test.com",
        "94090001",
        "2026-03-01T10:00:00Z",
      );
      await addTransition(d1, null, "prueba", "2026-03-01T10:00:00Z");
      await addTransition(d1, "prueba", "activo", "2026-03-08T10:00:00Z"); // +7d

      const d2 = await createMember(
        "eo-d2@test.com",
        "94090002",
        "2026-03-02T10:00:00Z",
      );
      await addTransition(d2, null, "prueba", "2026-03-02T10:00:00Z");

      const f1 = await createMember(
        "eo-f1@test.com",
        "94090003",
        "2026-03-03T10:00:00Z",
      );
      await addTransition(f1, "freemium", "prueba", "2026-03-13T10:00:00Z");
      await addTransition(f1, "prueba", "activo", "2026-03-16T10:00:00Z"); // +3d

      const f2 = await createMember(
        "eo-f2@test.com",
        "94090004",
        "2026-03-04T10:00:00Z",
      );
      await addTransition(f2, "freemium", "prueba", "2026-03-09T10:00:00Z");

      const s1 = await createMember(
        "eo-s1@test.com",
        "94090005",
        "2026-03-05T10:00:00Z",
      );
      await addSub(s1, "2026-03-20T10:00:00Z");

      const o1 = await createMember(
        "eo-o1@test.com",
        "94090006",
        "2026-03-06T10:00:00Z",
      );
      await addTransition(o1, "inactivo", "prueba", "2026-03-10T10:00:00Z");
    }

    it("all (default) includes every origin in the cohort", async () => {
      await seedMixedCohort();
      const res = await svc.getFunnel(CTX, {});
      expect(res.entryOrigin).toBe("all");
      const mar = res.cohorts.find((c) => c.cohortMonth === "2026-03");
      expect(mar!.size).toBe(6);
    });

    it("directo keeps only trials created directly as prueba (from=NULL)", async () => {
      await seedMixedCohort();
      const res = await svc.getFunnel(CTX, { entryOrigin: "directo" });
      expect(res.entryOrigin).toBe("directo");
      const mar = res.cohorts.find((c) => c.cohortMonth === "2026-03");
      expect(mar!.size).toBe(2); // d1, d2 only (s1/o1/freemium excluded)
      expect(mar!.toPruebaPct).toBe(100); // all are prueba by construction
      expect(mar!.toActivoPct).toBe(50); // only d1 converted
      expect(mar!.medianDaysPruebaToActivo).toBe(7); // d1: +7d
    });

    it("freemium keeps only trials converted from a freemium account", async () => {
      await seedMixedCohort();
      const res = await svc.getFunnel(CTX, { entryOrigin: "freemium" });
      expect(res.entryOrigin).toBe("freemium");
      const mar = res.cohorts.find((c) => c.cohortMonth === "2026-03");
      expect(mar!.size).toBe(2); // f1, f2 only
      expect(mar!.toActivoPct).toBe(50); // only f1 converted
      expect(mar!.medianDaysPruebaToActivo).toBe(3); // f1: +3d
    });

    it("segments never mix: directo + freemium sizes sum to less than `all`", async () => {
      await seedMixedCohort();
      const all = await svc.getFunnel(CTX, {});
      const directo = await svc.getFunnel(CTX, { entryOrigin: "directo" });
      const freemium = await svc.getFunnel(CTX, { entryOrigin: "freemium" });
      const sz = (r: { cohorts: { cohortMonth: string; size: number }[] }) =>
        r.cohorts.find((c) => c.cohortMonth === "2026-03")?.size ?? 0;
      // s1 (no prueba) + o1 (otro) live only in `all`.
      expect(sz(all)).toBe(6);
      expect(sz(directo) + sz(freemium)).toBe(4);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Scope (D-11 / T-118-11)
  // ═══════════════════════════════════════════════════════════════════════

  describe("scope", () => {
    it("branchId scope excludes users of another sede", async () => {
      await createMember(
        "sc-a@test.com",
        "94070001",
        "2026-01-02T10:00:00Z",
        branchA,
      );
      await createMember(
        "sc-es@test.com",
        "94070002",
        "2026-01-03T10:00:00Z",
        branchES,
      );

      const onlyA = await svc.getFunnel(CTX, { branchId: branchA });
      const jan = onlyA.cohorts.find((c) => c.cohortMonth === "2026-01");
      expect(jan!.size).toBe(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Endpoint — RBAC + scope (D-11)
  // ═══════════════════════════════════════════════════════════════════════

  describe("GET /api/admin/analytics/funnel", () => {
    it("returns 401 unauthenticated", async () => {
      const res = await app.inject({
        method: "GET",
        url: `${ANALYTICS_URL}/funnel`,
      });
      expect(res.statusCode).toBe(401);
    });

    it("returns 403 for a regular member", async () => {
      const { token } = await registerUser(app, {
        email: "member-fun@test.com",
        password: "pass123456",
        firstName: "Reg",
        lastName: "Member",
        branchId: branchA,
      });
      const res = await app.inject({
        method: "GET",
        url: `${ANALYTICS_URL}/funnel`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it("returns 403 for gestion (admin-only endpoint, D-11)", async () => {
      await createStaffUser(app, {
        email: "gestion-fun@test.com",
        password: "gestionpass123",
        firstName: "Ges",
        lastName: "Tion",
        role: "gestion",
        branchId: branchA,
      });
      const gestionToken = await getAuthToken(
        app,
        "gestion-fun@test.com",
        "gestionpass123",
      );
      const res = await app.inject({
        method: "GET",
        url: `${ANALYTICS_URL}/funnel`,
        headers: { authorization: `Bearer ${gestionToken}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it("admin gets 200 with cohorts", async () => {
      const u = await createMember(
        "e-ok@test.com",
        "94080001",
        "2026-01-02T10:00:00Z",
      );
      await addTransition(u, "freemium", "prueba", "2026-01-12T10:00:00Z");

      const res = await app.inject({
        method: "GET",
        url: `${ANALYTICS_URL}/funnel`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(Array.isArray(body.cohorts)).toBe(true);
      const jan = body.cohorts.find(
        (c: { cohortMonth: string }) => c.cohortMonth === "2026-01",
      );
      expect(jan).toBeDefined();
      expect(jan.toPruebaPct).toBe(100);
    });

    it("echoes the entryOrigin segment from the querystring", async () => {
      const u = await createMember(
        "e-seg@test.com",
        "94081001",
        "2026-01-02T10:00:00Z",
      );
      await addTransition(u, null, "prueba", "2026-01-02T10:00:00Z");

      const res = await app.inject({
        method: "GET",
        url: `${ANALYTICS_URL}/funnel?entryOrigin=directo`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.entryOrigin).toBe("directo");
      const jan = body.cohorts.find(
        (c: { cohortMonth: string }) => c.cohortMonth === "2026-01",
      );
      expect(jan.size).toBe(1);
    });

    it("AR admin is denied (403) querying an ES sede; allowed on AR (T-118-11)", async () => {
      await createStaffUser(app, {
        email: "admin-fun@test.com",
        password: "adminarpass123",
        firstName: "Admin",
        lastName: "Fun",
        role: "admin",
        branchId: branchA,
      });
      const arAdminToken = await getAuthToken(
        app,
        "admin-fun@test.com",
        "adminarpass123",
      );

      const denied = await app.inject({
        method: "GET",
        url: `${ANALYTICS_URL}/funnel?branchId=${branchES}`,
        headers: { authorization: `Bearer ${arAdminToken}` },
      });
      expect(denied.statusCode).toBe(403);

      const ok = await app.inject({
        method: "GET",
        url: `${ANALYTICS_URL}/funnel?branchId=${branchA}`,
        headers: { authorization: `Bearer ${arAdminToken}` },
      });
      expect(ok.statusCode).toBe(200);
    });
  });
});
