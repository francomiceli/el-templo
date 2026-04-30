/**
 * Phase 98 — Multi-currency & country-scope integration tests.
 *
 * Covers REQ-98-05 (country-scoped reads), REQ-98-06 (cross-country/currency
 * write guards), and REQ-98-11 (member-app forward-compat supersets).
 *
 * Exercises the real Fastify app against the eltemplo_test MySQL DB via
 * fastify.inject(). The cross-currency test invokes PaymentService directly
 * because the route layer does not yet plumb `request.body.currency` into
 * the service (deferred per Plan 04/05 summaries).
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import {
  createTestApp,
  getAuthToken,
  registerUser,
  createStaffUser,
  cleanAllTestData,
} from "./helpers";
import * as schema from "../src/db/schema";

const ADMIN_SUBS_URL = "/api/admin/subscriptions";
const ADMIN_MEMBERS_URL = "/api/admin/members";
const MEMBER_PLANS_URL = "/api/members/subscription/plans";
const MEMBER_SUB_URL = "/api/members/subscription/me/subscription";

describe("Country scope — RBAC matrix, cross-country guards, forward-compat (Phase 98)", () => {
  let app: FastifyInstance;

  // Tokens
  let ownerToken: string;
  let arAdminToken: string;
  let esAdminToken: string;
  let arMemberToken: string;

  // Fixtures
  let arBranchId: number;
  let esBranchId: number;
  let arPlanId: number;
  let esPlanId: number;
  let arMemberId: number;
  let esMemberId: number;
  let arSubscriptionId: number;

  beforeAll(async () => {
    app = await createTestApp();

    // Start clean. admin@test.com (role=owner, branchId=1) is preserved.
    await cleanAllTestData(app);

    // Ensure branch 1 is AR (default). Seed a fresh ES branch.
    await app.db
      .update(schema.branches)
      .set({ country: "AR" })
      .where(eq(schema.branches.id, 1));

    const esBranchInsert = await app.db
      .insert(schema.branches)
      .values({
        name: "BCN Test",
        code: "BCN-T",
        country: "ES",
      })
      .$returningId();
    esBranchId = esBranchInsert[0].id;
    arBranchId = 1;

    // Seed plans directly via DB — the POST /plans endpoint does not accept
    // country in its body (Phase 98 intentionally keeps plan creation scoped
    // by server-derived country elsewhere).
    const arPlanInsert = await app.db
      .insert(schema.subscriptionPlans)
      .values({
        name: "Test AR Plan (Flex)",
        planTier: "flex",
        bookingMode: "flexible",
        priceRegular: 15000,
        priceZero: 10000,
        durationDays: 30,
        classesPerWeek: 3,
        country: "AR",
        currency: "ARS",
      })
      .$returningId();
    arPlanId = arPlanInsert[0].id;

    const esPlanInsert = await app.db
      .insert(schema.subscriptionPlans)
      .values({
        name: "Test ES Plan (Flex)",
        planTier: "flex",
        bookingMode: "flexible",
        priceRegular: 70,
        priceZero: 50,
        durationDays: 30,
        classesPerWeek: 3,
        country: "ES",
        currency: "EUR",
      })
      .$returningId();
    esPlanId = esPlanInsert[0].id;

    // Owner token (seeded admin@test.com is role=owner, branchId=1=AR).
    ownerToken = await getAuthToken(app, "admin@test.com", "adminpass123");

    // AR admin (staff). Phase 110: admin requires `country` set on users
    // (the country-scope hook reads users.country directly for admin/gestion).
    await createStaffUser(app, {
      email: "ar-admin@test.com",
      password: "ar-admin-pass",
      firstName: "AR",
      lastName: "Admin",
      role: "admin",
      branchId: arBranchId,
      country: "AR",
    });
    arAdminToken = await getAuthToken(
      app,
      "ar-admin@test.com",
      "ar-admin-pass",
    );

    // ES admin (staff). Phase 110: country='ES' so the hook resolves
    // scope.country = 'ES'.
    await createStaffUser(app, {
      email: "es-admin@test.com",
      password: "es-admin-pass",
      firstName: "ES",
      lastName: "Admin",
      role: "admin",
      branchId: esBranchId,
      country: "ES",
    });
    esAdminToken = await getAuthToken(
      app,
      "es-admin@test.com",
      "es-admin-pass",
    );

    // AR member (via auth registration).
    const arMemberReg = await registerUser(app, {
      email: "ar-member@test.com",
      password: "ar-member-pass",
      firstName: "AR",
      lastName: "Member",
      branchId: arBranchId,
    });
    arMemberId = (arMemberReg.user as { id: number }).id;
    arMemberToken = arMemberReg.token;

    // ES member (via auth registration).
    const esMemberReg = await registerUser(app, {
      email: "es-member@test.com",
      password: "es-member-pass",
      firstName: "ES",
      lastName: "Member",
      branchId: esBranchId,
    });
    esMemberId = (esMemberReg.user as { id: number }).id;

    // Seed an active AR subscription for the AR member via the real API
    // (owner token, explicit country=AR to avoid default surprises).
    const todayStr = new Date().toISOString().split("T")[0];
    const assignRes = await app.inject({
      method: "POST",
      url: `${ADMIN_SUBS_URL}/members/${arMemberId}/subscription/assign?country=AR`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        planId: arPlanId,
        branchId: arBranchId,
        startDate: todayStr,
        priceTypeApplied: "regular",
        paymentMethod: "cash",
      },
    });
    if (assignRes.statusCode !== 201) {
      throw new Error(
        `Failed to seed AR subscription: ${assignRes.statusCode} ${assignRes.body}`,
      );
    }
    const assignBody = JSON.parse(assignRes.body) as { id: number };
    arSubscriptionId = assignBody.id;
  });

  afterAll(async () => {
    await cleanAllTestData(app);
    await app.close();
  });

  // =========================================================================
  // REQ-98-05: country-scoped reads (admin plans list)
  // =========================================================================

  describe("REQ-98-05 — admin plans list is country-scoped", () => {
    it("AR admin GET /admin/subscriptions/plans returns only AR plans", async () => {
      const res = await app.inject({
        method: "GET",
        url: `${ADMIN_SUBS_URL}/plans`,
        headers: { authorization: `Bearer ${arAdminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as {
        plans: Array<{ id: number; name: string }>;
      };
      // AR plan must be in results, ES plan must not.
      const ids = body.plans.map((p) => p.id);
      expect(ids).toContain(arPlanId);
      expect(ids).not.toContain(esPlanId);
    });

    it("ES admin GET /admin/subscriptions/plans returns only ES plans", async () => {
      const res = await app.inject({
        method: "GET",
        url: `${ADMIN_SUBS_URL}/plans`,
        headers: { authorization: `Bearer ${esAdminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as {
        plans: Array<{ id: number; name: string }>;
      };
      const ids = body.plans.map((p) => p.id);
      expect(ids).toContain(esPlanId);
      expect(ids).not.toContain(arPlanId);
    });

    it("Owner GET /admin/subscriptions/plans?country=ES returns only ES plans", async () => {
      const res = await app.inject({
        method: "GET",
        url: `${ADMIN_SUBS_URL}/plans?country=ES`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as {
        plans: Array<{ id: number; name: string }>;
      };
      const ids = body.plans.map((p) => p.id);
      expect(ids).toContain(esPlanId);
      expect(ids).not.toContain(arPlanId);
    });

    it("Owner GET /admin/subscriptions/plans?country=AR returns only AR plans", async () => {
      const res = await app.inject({
        method: "GET",
        url: `${ADMIN_SUBS_URL}/plans?country=AR`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as {
        plans: Array<{ id: number; name: string }>;
      };
      const ids = body.plans.map((p) => p.id);
      expect(ids).toContain(arPlanId);
      expect(ids).not.toContain(esPlanId);
    });

    it("Non-owner cannot override country via ?country= query (AR admin sending ?country=ES still sees only AR plans)", async () => {
      const res = await app.inject({
        method: "GET",
        url: `${ADMIN_SUBS_URL}/plans?country=ES`,
        headers: { authorization: `Bearer ${arAdminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as {
        plans: Array<{ id: number; name: string }>;
      };
      const ids = body.plans.map((p) => p.id);
      expect(ids).toContain(arPlanId);
      expect(ids).not.toContain(esPlanId);
    });
  });

  // =========================================================================
  // REQ-98-05: country-scoped reads (admin members list)
  // =========================================================================

  describe("REQ-98-05 — admin members list is country-scoped", () => {
    it("AR admin GET /admin/members sees only AR members", async () => {
      const res = await app.inject({
        method: "GET",
        url: `${ADMIN_MEMBERS_URL}/`,
        headers: { authorization: `Bearer ${arAdminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as {
        members: Array<{ id: number; email: string }>;
      };
      const emails = body.members.map((m) => m.email);
      expect(emails).toContain("ar-member@test.com");
      expect(emails).not.toContain("es-member@test.com");
    });

    it("ES admin GET /admin/members sees only ES members", async () => {
      const res = await app.inject({
        method: "GET",
        url: `${ADMIN_MEMBERS_URL}/`,
        headers: { authorization: `Bearer ${esAdminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as {
        members: Array<{ id: number; email: string }>;
      };
      const emails = body.members.map((m) => m.email);
      expect(emails).toContain("es-member@test.com");
      expect(emails).not.toContain("ar-member@test.com");
    });
  });

  // =========================================================================
  // SPEC Acceptance Criterion 7 — AR admin cannot read an ES member
  // =========================================================================

  describe("SPEC AC-7 — cross-country member read forbidden", () => {
    it("AR admin cannot read an ES member (403/404 + no ES identifiers leaked)", async () => {
      const res = await app.inject({
        method: "GET",
        url: `${ADMIN_MEMBERS_URL}/${esMemberId}`,
        headers: { authorization: `Bearer ${arAdminToken}` },
      });
      // Either 403 (forbidden, explicit) or 404 (hidden) is acceptable.
      expect([403, 404]).toContain(res.statusCode);
      // Defense-in-depth: even if status is unexpected, the response body
      // must NOT contain ES member identifiers.
      expect(res.body).not.toContain("es-member@test.com");
    });
  });

  // =========================================================================
  // Virtual branches bypass country scope
  //
  // Self-registered members default to the ONLINE virtual branch (country=AR
  // by historic default). Without this exemption, any ES coach (e.g. BCN)
  // would lose visibility of students who signed up from the app before a
  // coach could reassign them to their physical branch.
  // =========================================================================

  describe("Virtual branches are cross-country for staff reads", () => {
    let virtualBranchId: number;
    let virtualMemberId: number;

    beforeAll(async () => {
      const insert = await app.db
        .insert(schema.branches)
        .values({
          name: "Online Test",
          // code is varchar(20) — keep short to avoid ER_DATA_TOO_LONG.
          code: `ONL-${Date.now() % 1000000}`,
          country: "AR",
          isVirtual: true,
        })
        .$returningId();
      virtualBranchId = insert[0].id;

      const reg = await registerUser(app, {
        email: `virtual-member-${Date.now()}@test.com`,
        password: "virtualpass123",
        firstName: "Virtual",
        lastName: "Member",
        branchId: virtualBranchId,
      });
      virtualMemberId = (reg.user as { id: number }).id;
    });

    it("ES admin GET /admin/members includes members of AR virtual branches", async () => {
      const res = await app.inject({
        method: "GET",
        url: `${ADMIN_MEMBERS_URL}/`,
        headers: { authorization: `Bearer ${esAdminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as {
        members: Array<{ id: number }>;
      };
      const ids = body.members.map((m) => m.id);
      expect(ids).toContain(virtualMemberId);
    });

    it("AR admin GET /admin/members includes members of AR virtual branches", async () => {
      const res = await app.inject({
        method: "GET",
        url: `${ADMIN_MEMBERS_URL}/`,
        headers: { authorization: `Bearer ${arAdminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as {
        members: Array<{ id: number }>;
      };
      const ids = body.members.map((m) => m.id);
      expect(ids).toContain(virtualMemberId);
    });

    it("ES admin GET /admin/members/:id succeeds for virtual-branch member (no 404)", async () => {
      const res = await app.inject({
        method: "GET",
        url: `${ADMIN_MEMBERS_URL}/${virtualMemberId}`,
        headers: { authorization: `Bearer ${esAdminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as { id: number };
      expect(body.id).toBe(virtualMemberId);
    });
  });

  // =========================================================================
  // REQ-98-06 — cross-country plan assignment guard (400 with Spanish error)
  // =========================================================================

  describe("REQ-98-06 — cross-country write guards", () => {
    it("assignPlan with AR plan to ES-branch member returns 400 — 'El plan no corresponde'", async () => {
      const todayStr = new Date().toISOString().split("T")[0];
      const res = await app.inject({
        method: "POST",
        url: `${ADMIN_SUBS_URL}/members/${esMemberId}/subscription/assign?country=ES`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          planId: arPlanId,
          branchId: esBranchId,
          startDate: todayStr,
          priceTypeApplied: "regular",
          paymentMethod: "cash",
        },
      });
      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body) as { message: string };
      expect(body.message).toContain("El plan no corresponde");
    });

    // Plan 105-06: Test removed — old PaymentService deleted. The cross-currency
    // guard now lives in TransactionService (Phase 106 will reinstate the
    // equivalent integration test against the new finance module).
    it.skip("recordPayment with EUR on ARS subscription returns 400 — 'moneda distinta' (TODO: rewrite against TransactionService in Phase 106)", () => {});
  });

  // =========================================================================
  // AR regression — existing AR flow still works
  // =========================================================================

  describe("AR regression — pre-phase-98 flow unchanged", () => {
    it("assignPlan with AR plan to AR member still succeeds and subscription inherits ARS currency", async () => {
      // Fresh AR member to avoid colliding with the beforeAll-seeded subscription.
      const reg = await registerUser(app, {
        email: `ar-regression-${Date.now()}@test.com`,
        password: "regpass123",
        firstName: "AR",
        lastName: "Regression",
        branchId: arBranchId,
      });
      const freshMemberId = (reg.user as { id: number }).id;
      const todayStr = new Date().toISOString().split("T")[0];

      const res = await app.inject({
        method: "POST",
        url: `${ADMIN_SUBS_URL}/members/${freshMemberId}/subscription/assign?country=AR`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          planId: arPlanId,
          branchId: arBranchId,
          startDate: todayStr,
          priceTypeApplied: "regular",
          paymentMethod: "cash",
        },
      });
      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body) as { id: number };

      // Verify the row the service created has currency='ARS' (defense-in-depth
      // check directly on the DB since the response schema may strip currency).
      const [row] = await app.db
        .select({
          currency: schema.subscriptions.currency,
        })
        .from(schema.subscriptions)
        .where(eq(schema.subscriptions.id, body.id));
      expect(row.currency).toBe("ARS");
    });
  });

  // =========================================================================
  // REQ-98-11 — member-app forward-compat (superset assertions)
  //
  // Deployed iOS/Android apps read these two endpoints. Phase 98 must return
  // a SUPERSET of the pre-phase-98 response shape: all old keys present (no
  // renames/removals) plus the new currency/country keys additively.
  //
  // The preExistingKeys lists below were derived by reading the CURRENT
  // handlers in src/modules/subscriptions/member-routes.ts (on the phase-98
  // master branch). Any future PR that renames or removes one of these keys
  // will break the deployed app and MUST fail this test.
  // =========================================================================

  describe("REQ-98-11 — member-app forward-compat supersets", () => {
    it("GET /api/members/subscription/plans returns a superset of pre-phase-98 keys (new currency field expected additively)", async () => {
      const res = await app.inject({
        method: "GET",
        url: MEMBER_PLANS_URL,
        headers: { authorization: `Bearer ${arMemberToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as {
        plans: Array<Record<string, unknown>>;
      };
      expect(Array.isArray(body.plans)).toBe(true);
      expect(body.plans.length).toBeGreaterThan(0);

      // Pre-phase-98 keys the deployed member app reads from the plans catalog.
      // Derived from member-routes.ts `mapped` return shape (lines 129-140).
      const preExistingKeys = [
        "id",
        "name",
        "description",
        "planTier",
        "durationDays",
        "classesPerWeek",
        "planCategory",
        "linkedProgramId",
        "goalPlanType",
        "goalPlanZones",
      ];

      for (const plan of body.plans) {
        for (const key of preExistingKeys) {
          expect(plan).toHaveProperty(key);
        }
        // New additive keys from Phase 98 (REQ-98-11). If missing, the
        // member-app forward-compat assertion fails — Phase 98 did not
        // actually expose currency/country to the member catalog.
        expect(plan).toHaveProperty("currency");
        expect(plan).toHaveProperty("country");
      }
    });

    it("GET /api/members/subscription/me/subscription returns a superset of pre-phase-98 keys (new currency field expected additively)", async () => {
      const res = await app.inject({
        method: "GET",
        url: MEMBER_SUB_URL,
        headers: { authorization: `Bearer ${arMemberToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as Record<string, unknown>;

      // Pre-phase-98 keys the deployed member app reads from /me/subscription.
      // Derived from member-routes.ts GET /me/subscription return shape (lines 76-88).
      const preExistingKeys = [
        "id",
        "planName",
        "planTier",
        "status",
        "startDate",
        "endDate",
        "daysRemaining",
        "pricePaid",
        "planCategory",
        "goalPlanType",
        "multiBranch",
      ];

      for (const key of preExistingKeys) {
        expect(body).toHaveProperty(key);
      }
      // New additive key from Phase 98 (REQ-98-11). If missing, Phase 98 did
      // not expose currency to the /me/subscription endpoint.
      expect(body).toHaveProperty("currency");
    });
  });
});
