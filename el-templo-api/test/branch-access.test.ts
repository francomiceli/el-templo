/**
 * Phase 110 — Branch access control integration tests.
 *
 * Covers REQ-5 (canAccessBranch unit), REQ-6 (preHandler 403),
 * REQ-7 (cross-country 403 + coach user_branches gating),
 * REQ-8 (staff multibranch bypass — service-level minimal coverage;
 *        HTTP-level deferred to UAT in Plan 09 §6),
 * REQ-9 (staff cardinality validation, all 5 cases incl. Blocker 1
 *        4th rule: member-with-branchIds),
 * REQ-10 (virtual sede bypass), and REQ-12 (GET /admin/members/branches
 * scope filter).
 *
 * Test seed bypasses cardinality validation by inserting users directly via
 * Drizzle, since the cardinality rules are tested separately.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import argon2 from "argon2";
import {
  createTestApp,
  getAuthToken,
  cleanAllTestData,
  todayStr,
} from "./helpers";
import * as schema from "../src/db/schema";
import {
  canAccessBranch,
  BRANCH_OUT_OF_SCOPE,
} from "../src/modules/shared/branch-access";
import { BookingService } from "../src/modules/scheduling/booking-service";
import { SubscriptionService } from "../src/modules/subscriptions/service";
import { AuraService } from "../src/modules/aura";
import {
  TransactionService,
  BalanceService,
  CashRegisterService,
} from "../src/modules/finance";
import { NotificationService } from "../src/modules/notifications/service";
import { dowInTz, addDays } from "../src/modules/shared/date-utils";
import { tenantWhere, type TenantContext } from "../src/modules/shared/tenant";

/**
 * El gimnasio de los fixtures (El Templo = tenant 1). Fase 173 (plan 173-07):
 * `BookingService.reserve` recibe `ctx: TenantContext` como PRIMER argumento;
 * en producción sale de `assertTenant(request.scope, …)`, acá se construye a
 * mano porque el service se invoca directo (sin request).
 */
const CTX: TenantContext = { tenantId: 1 };

describe("Branch access — canAccessBranch + requireBranchAccess (Phase 110)", () => {
  let app: FastifyInstance;

  // Branches
  let arBranchId: number;
  let arBranchSecondId: number; // a second AR branch — coach NOT authorized here
  let esBranchId: number;
  let virtualBranchId: number;

  // Users + tokens
  let ownerToken: string;
  let arAdminToken: string;
  let esAdminToken: string;
  let arGestionToken: string;
  let coachToken: string;
  let coachId: number;
  let memberToken: string;
  let memberId: number;

  // Unique suffix for emails/codes/dnis to avoid collisions across parallel
  // workers (per-worker DB; cleanAllTestData clears between runs but inserts
  // in this file should still be safe to repeat).
  const u = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

  beforeAll(async () => {
    app = await createTestApp();
    await cleanAllTestData(app);

    // 1) Seed 4 branches (real AR x2, real ES, virtual)
    const [ar] = await app.db
      .insert(schema.branches)
      .values({
        name: "AR Test Branch",
        code: `BAA-${u}`.slice(0, 20),
        country: "AR",
        isActive: true,
        timezone: "America/Argentina/Buenos_Aires",
        isVirtual: false,
      })
      .$returningId();
    arBranchId = ar.id;

    const [arSecond] = await app.db
      .insert(schema.branches)
      .values({
        name: "AR Test Branch 2",
        code: `BAB-${u}`.slice(0, 20),
        country: "AR",
        isActive: true,
        timezone: "America/Argentina/Buenos_Aires",
        isVirtual: false,
      })
      .$returningId();
    arBranchSecondId = arSecond.id;

    const [es] = await app.db
      .insert(schema.branches)
      .values({
        name: "ES Test Branch",
        code: `BES-${u}`.slice(0, 20),
        country: "ES",
        isActive: true,
        timezone: "Europe/Madrid",
        isVirtual: false,
      })
      .$returningId();
    esBranchId = es.id;

    const [virtual] = await app.db
      .insert(schema.branches)
      .values({
        name: "Templo Online Test",
        code: `BVI-${u}`.slice(0, 20),
        // Virtual sedes carry a country in the schema, but canAccessBranch's
        // Rule 1 (isVirtual) wins regardless.
        country: "AR",
        isActive: true,
        timezone: "America/Argentina/Buenos_Aires",
        isVirtual: true,
      })
      .$returningId();
    virtualBranchId = virtual.id;

    // 2) Seed staff users + 1 member. Insert directly via Drizzle to bypass
    //    the cardinality validation (we test that separately). Use argon2 for
    //    password hashes (matches users/service.ts).
    const passwordHash = await argon2.hash("test1234");

    await app.db.insert(schema.users).values({
      email: `owner-${u}@test.local`,
      passwordHash,
      role: "owner",
      branchId: arBranchId,
      country: null,
    });

    await app.db.insert(schema.users).values({
      email: `ar-admin-${u}@test.local`,
      passwordHash,
      role: "admin",
      branchId: arBranchId,
      country: "AR",
    });

    await app.db.insert(schema.users).values({
      email: `es-admin-${u}@test.local`,
      passwordHash,
      role: "admin",
      branchId: esBranchId,
      country: "ES",
    });

    await app.db.insert(schema.users).values({
      email: `ar-gestion-${u}@test.local`,
      passwordHash,
      role: "gestion",
      branchId: arBranchId,
      country: "AR",
    });

    const [coach] = await app.db
      .insert(schema.users)
      .values({
        email: `coach-${u}@test.local`,
        passwordHash,
        role: "coach",
        branchId: arBranchId,
        country: null,
      })
      .$returningId();
    coachId = coach.id;

    // Coach operational branches: arBranchId + virtualBranchId.
    // (NOT arBranchSecondId — coach should be 403 there.)
    await app.db.insert(schema.userBranches).values([
      { userId: coachId, branchId: arBranchId },
      { userId: coachId, branchId: virtualBranchId },
    ]);

    const [member] = await app.db
      .insert(schema.users)
      .values({
        email: `member-${u}@test.local`,
        passwordHash,
        role: "member",
        branchId: arBranchId,
        country: null,
        status: "freemium",
      })
      .$returningId();
    memberId = member.id;

    // 3) Issue tokens
    ownerToken = await getAuthToken(app, `owner-${u}@test.local`, "test1234");
    arAdminToken = await getAuthToken(
      app,
      `ar-admin-${u}@test.local`,
      "test1234",
    );
    esAdminToken = await getAuthToken(
      app,
      `es-admin-${u}@test.local`,
      "test1234",
    );
    arGestionToken = await getAuthToken(
      app,
      `ar-gestion-${u}@test.local`,
      "test1234",
    );
    coachToken = await getAuthToken(app, `coach-${u}@test.local`, "test1234");
    memberToken = await getAuthToken(app, `member-${u}@test.local`, "test1234");

    // Silence "declared but never used" warnings — these tokens are reserved
    // for follow-up cardinality / member-perspective tests and exist for
    // parity with the integration matrix described in 110-PLAN.
    void arGestionToken;
    void memberToken;
  });

  afterAll(async () => {
    await cleanAllTestData(app);
    await app.close();
  });

  // ============================================================
  // canAccessBranch — pure unit tests (REQ-5, REQ-6, REQ-10)
  // ============================================================
  // Fase 173 (D-14, deferred-items.md hallazgo 173-20): `canAccessBranch`
  // llama `assertTenant(scope, …)` internamente desde el plan 173-11 — un
  // `CountryScope` sin `tenantId` hace que `assertTenant` lance, el `catch`
  // interno lo convierte en `false`, y los 10 casos de este describe pasaban
  // (o fallaban) por ESE motivo, no por la regla que dicen estar probando.
  // `tenantId: 1` (El Templo, el gimnasio de los fixtures de este archivo)
  // restaura la cobertura real del motor de reglas.
  describe("canAccessBranch — unit", () => {
    it("returns true for virtual branch (any role)", async () => {
      const ok = await canAccessBranch(
        {
          tenantId: 1,
          country: "AR",
          branchIds: [],
          isOwner: false,
          role: "admin",
          userBranchId: null,
        },
        virtualBranchId,
        app.db,
      );
      expect(ok).toBe(true);
    });

    it("returns true for owner regardless of country", async () => {
      const ok = await canAccessBranch(
        {
          tenantId: 1,
          country: "AR",
          branchIds: [],
          isOwner: true,
          role: "owner",
          userBranchId: null,
        },
        esBranchId,
        app.db,
      );
      expect(ok).toBe(true);
    });

    it("admin/gestion: same country → true", async () => {
      const ok = await canAccessBranch(
        {
          tenantId: 1,
          country: "AR",
          branchIds: [],
          isOwner: false,
          role: "admin",
          userBranchId: null,
        },
        arBranchId,
        app.db,
      );
      expect(ok).toBe(true);
    });

    it("admin/gestion: cross country → false", async () => {
      const ok = await canAccessBranch(
        {
          tenantId: 1,
          country: "AR",
          branchIds: [],
          isOwner: false,
          role: "admin",
          userBranchId: null,
        },
        esBranchId,
        app.db,
      );
      expect(ok).toBe(false);
    });

    it("admin: scope.country=null (data-corruption fail-closed) → false (default-deny lateral)", async () => {
      const ok = await canAccessBranch(
        {
          tenantId: 1,
          country: null,
          branchIds: [],
          isOwner: false,
          role: "admin",
          userBranchId: null,
        },
        arBranchId,
        app.db,
      );
      expect(ok).toBe(false);
    });

    it("coach: branchId in scope.branchIds → true", async () => {
      const ok = await canAccessBranch(
        {
          tenantId: 1,
          country: "AR",
          branchIds: [arBranchId],
          isOwner: false,
          role: "coach",
          userBranchId: arBranchId,
        },
        arBranchId,
        app.db,
      );
      expect(ok).toBe(true);
    });

    it("coach: branchId NOT in scope.branchIds → false", async () => {
      const ok = await canAccessBranch(
        {
          tenantId: 1,
          country: "AR",
          branchIds: [arBranchId],
          isOwner: false,
          role: "coach",
          userBranchId: arBranchId,
        },
        arBranchSecondId,
        app.db,
      );
      expect(ok).toBe(false);
    });

    it("member: branchId === scope.userBranchId → true", async () => {
      const ok = await canAccessBranch(
        {
          tenantId: 1,
          country: "AR",
          branchIds: [],
          isOwner: false,
          role: "member",
          userBranchId: arBranchId,
        },
        arBranchId,
        app.db,
      );
      expect(ok).toBe(true);
    });

    it("member: branchId !== scope.userBranchId → false", async () => {
      const ok = await canAccessBranch(
        {
          tenantId: 1,
          country: "AR",
          branchIds: [],
          isOwner: false,
          role: "member",
          userBranchId: arBranchId,
        },
        arBranchSecondId,
        app.db,
      );
      expect(ok).toBe(false);
    });

    it("branch not found → false", async () => {
      const ok = await canAccessBranch(
        {
          tenantId: 1,
          country: "AR",
          branchIds: [],
          isOwner: true,
          role: "owner",
          userBranchId: null,
        },
        9999999,
        app.db,
      );
      expect(ok).toBe(false);
    });
  });

  // ============================================================
  // GET /admin/members/branches — scope filter (REQ-12, D-07/08/09)
  // ============================================================
  describe("GET /admin/members/branches — scope filter", () => {
    it("owner without ?country= → sees all (real + virtual)", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/admin/members/branches",
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as { branches: { id: number }[] };
      const ids = body.branches.map((b) => b.id);
      expect(ids).toContain(arBranchId);
      expect(ids).toContain(esBranchId);
      expect(ids).toContain(virtualBranchId);
    });

    it("exposes each sede's timezone (backs the per-row Vencimiento pill)", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/admin/members/branches",
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as {
        branches: { id: number; timezone: string | null }[];
      };
      // The admin resolves "today" per row from this field; an ES sede falling
      // back to the AR default skews the day count and shifts the pill a band.
      const es = body.branches.find((b) => b.id === esBranchId);
      expect(es?.timezone).toBe("Europe/Madrid");
      const ar = body.branches.find((b) => b.id === arBranchId);
      expect(ar?.timezone).toBe("America/Argentina/Buenos_Aires");
    });

    it("owner with ?country=AR → AR + virtual only", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/admin/members/branches?country=AR",
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as { branches: { id: number }[] };
      const ids = body.branches.map((b) => b.id);
      expect(ids).toContain(arBranchId);
      expect(ids).toContain(virtualBranchId);
      expect(ids).not.toContain(esBranchId);
    });

    it("admin AR → AR + virtual only", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/admin/members/branches",
        headers: { authorization: `Bearer ${arAdminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as { branches: { id: number }[] };
      const ids = body.branches.map((b) => b.id);
      expect(ids).toContain(arBranchId);
      expect(ids).toContain(virtualBranchId);
      expect(ids).not.toContain(esBranchId);
    });

    it("admin ES → ES + virtual only", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/admin/members/branches",
        headers: { authorization: `Bearer ${esAdminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as { branches: { id: number }[] };
      const ids = body.branches.map((b) => b.id);
      expect(ids).toContain(esBranchId);
      expect(ids).toContain(virtualBranchId);
      expect(ids).not.toContain(arBranchId);
    });

    it("coach with user_branches=[arBranch, virtual] → those + virtual only", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/admin/members/branches",
        headers: { authorization: `Bearer ${coachToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as { branches: { id: number }[] };
      const ids = body.branches.map((b) => b.id);
      expect(ids).toContain(arBranchId);
      expect(ids).toContain(virtualBranchId);
      expect(ids).not.toContain(arBranchSecondId);
      expect(ids).not.toContain(esBranchId);
    });
  });

  // ============================================================
  // 403 cross-country (REQ-7) + virtual bypass (REQ-10)
  // ============================================================
  describe("Cross-country 403 + virtual bypass", () => {
    it("AR admin GET /api/admin/members?branchId=<ES> → 403 BRANCH_OUT_OF_SCOPE", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/admin/members?branchId=${esBranchId}`,
        headers: { authorization: `Bearer ${arAdminToken}` },
      });
      expect(res.statusCode).toBe(403);
      const body = JSON.parse(res.body) as { code?: string };
      expect(body.code).toBe(BRANCH_OUT_OF_SCOPE);
    });

    it("ES admin GET /api/admin/members?branchId=<AR> → 403 BRANCH_OUT_OF_SCOPE", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/admin/members?branchId=${arBranchId}`,
        headers: { authorization: `Bearer ${esAdminToken}` },
      });
      expect(res.statusCode).toBe(403);
      const body = JSON.parse(res.body) as { code?: string };
      expect(body.code).toBe(BRANCH_OUT_OF_SCOPE);
    });

    it("ES admin GET /api/admin/members?branchId=<virtual> → 200 (virtual bypass)", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/admin/members?branchId=${virtualBranchId}`,
        headers: { authorization: `Bearer ${esAdminToken}` },
      });
      expect(res.statusCode).toBe(200);
    });

    it("AR admin GET /api/admin/members?branchId=<own AR> → 200", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/admin/members?branchId=${arBranchId}`,
        headers: { authorization: `Bearer ${arAdminToken}` },
      });
      expect(res.statusCode).toBe(200);
    });

    it("Owner GET /api/admin/members?branchId=<any> → 200", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/admin/members?branchId=${esBranchId}`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(res.statusCode).toBe(200);
    });
  });

  // ============================================================
  // Coach multi-branch operational scope (REQ-7)
  // ============================================================
  describe("Coach user_branches gating", () => {
    it("coach with branchId in user_branches → 200", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/admin/members?branchId=${arBranchId}`,
        headers: { authorization: `Bearer ${coachToken}` },
      });
      expect(res.statusCode).toBe(200);
    });

    it("coach with branchId NOT in user_branches (other AR sede) → 403", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/admin/members?branchId=${arBranchSecondId}`,
        headers: { authorization: `Bearer ${coachToken}` },
      });
      expect(res.statusCode).toBe(403);
      const body = JSON.parse(res.body) as { code?: string };
      expect(body.code).toBe(BRANCH_OUT_OF_SCOPE);
    });

    it("coach on virtual branch → 200 (virtual always accessible)", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/admin/members?branchId=${virtualBranchId}`,
        headers: { authorization: `Bearer ${coachToken}` },
      });
      expect(res.statusCode).toBe(200);
    });
  });

  // ============================================================
  // Booking — staff multibranch bypass (REQ-8) — service-level minimal coverage
  // (Warning 3): direct BookingService.reserve() call against an in-test seed.
  // The heavyweight HTTP-level scenario (full booking flow with capacity, holds,
  // attendance windows, schedule rules) stays as it.todo and is verified
  // manually in Plan 09 §6 UAT.
  // ============================================================
  describe("Booking multibranch staff bypass — service-level (REQ-8)", () => {
    let svcBranchPrimaryId: number;
    let svcBranchOtherId: number;
    let svcActivityId: number;
    let svcPlanId: number;
    let svcScheduleOtherId: number;
    let svcMemberId: number;
    let svcCoachId: number;
    let bookings: BookingService;

    beforeAll(async () => {
      // Build a self-contained booking fixture so the seeding here doesn't
      // collide with the top-level branch fixtures that are gated/tested by
      // the other describe blocks.

      // Seed 2 fresh branches (primary + other) with timezones we control.
      // Use America/Argentina/Buenos_Aires so today's day-of-week is stable.
      const [primary] = await app.db
        .insert(schema.branches)
        .values({
          name: "REQ-8 Primary",
          code: `R8P-${u}`.slice(0, 20),
          country: "AR",
          isActive: true,
          timezone: "America/Argentina/Buenos_Aires",
          isVirtual: false,
        })
        .$returningId();
      svcBranchPrimaryId = primary.id;

      const [other] = await app.db
        .insert(schema.branches)
        .values({
          name: "REQ-8 Other",
          code: `R8O-${u}`.slice(0, 20),
          country: "AR",
          isActive: true,
          timezone: "America/Argentina/Buenos_Aires",
          isVirtual: false,
        })
        .$returningId();
      svcBranchOtherId = other.id;

      // Activity (required FK on schedules)
      const [activity] = await app.db
        .insert(schema.activities)
        .values({
          name: `REQ-8 Activity ${u}`,
          isActive: true,
        })
        .$returningId();
      svcActivityId = activity.id;

      // Plan: fixed booking mode (so the bonus check runs), multiBranch=false
      // (so the cross-branch guard fires), durationDays large enough that
      // today's date stays within startDate..endDate.
      const [plan] = await app.db
        .insert(schema.subscriptionPlans)
        .values({
          name: `REQ-8 Plan ${u}`,
          planTier: "flex",
          bookingMode: "fixed",
          planCategory: "presencial",
          priceRegular: 15000,
          priceZero: 10000,
          durationDays: 30,
          classesPerWeek: 3,
          multiBranch: false,
          country: "AR",
          currency: "ARS",
        })
        .$returningId();
      svcPlanId = plan.id;

      // Tomorrow's date in the branch timezone — lets us pick a schedule
      // dayOfWeek = tomorrow's DOW with safe time values, avoiding the
      // 5-min-before-class booking-window check.
      const tz = "America/Argentina/Buenos_Aires";
      const tomorrow = addDays(
        new Date().toLocaleDateString("en-CA", { timeZone: tz }),
        1,
      );
      const tomorrowDow = dowInTz(tz, new Date(tomorrow + "T12:00:00Z"));

      // Schedule on the OTHER branch — this is what triggers the multi-branch
      // guard at booking-service.ts:161-168.
      const [scheduleOther] = await app.db
        .insert(schema.schedules)
        .values({
          branchId: svcBranchOtherId,
          activityId: svcActivityId,
          dayOfWeek: tomorrowDow,
          startTime: "10:00",
          endTime: "11:00",
          isActive: true,
        })
        .$returningId();
      svcScheduleOtherId = scheduleOther.id;

      // Member + coach users
      const passwordHash = await argon2.hash("test1234");
      const [m] = await app.db
        .insert(schema.users)
        .values({
          email: `req8-member-${u}@test.local`,
          passwordHash,
          role: "member",
          branchId: svcBranchPrimaryId,
          country: null,
          status: "activo",
        })
        .$returningId();
      svcMemberId = m.id;

      const [c] = await app.db
        .insert(schema.users)
        .values({
          email: `req8-coach-${u}@test.local`,
          passwordHash,
          role: "coach",
          branchId: svcBranchPrimaryId,
          country: null,
        })
        .$returningId();
      svcCoachId = c.id;

      // Active subscription for the member on the PRIMARY branch.
      // No subscription_schedules rows → every reservation is a "bonus"
      // (isBonus=true) so the multi-branch check fires.
      const today = todayStr();
      const endDate = addDays(today, 30);
      await app.db.insert(schema.subscriptions).values({
        userId: svcMemberId,
        planId: svcPlanId,
        branchId: svcBranchPrimaryId,
        status: "active",
        startDate: today,
        endDate,
        pricePaid: 15000,
        currency: "ARS",
        priceTypeApplied: "regular",
      });

      // Active subscription for the coach as well — staff who train need an
      // active subscription too (the bonus check requires subscription).
      // The coach's active sub is on the PRIMARY branch; the test verifies
      // they can still reserve on the OTHER branch without plan.multiBranch.
      await app.db.insert(schema.subscriptions).values({
        userId: svcCoachId,
        planId: svcPlanId,
        branchId: svcBranchPrimaryId,
        status: "active",
        startDate: today,
        endDate,
        pricePaid: 15000,
        currency: "ARS",
        priceTypeApplied: "regular",
      });

      // Build BookingService directly — same idiom as
      // test/users/user-status-transitions.test.ts.
      const aura = new AuraService(app.db);
      const balances = new BalanceService(app.db, app.log);
      const cashRegisters = new CashRegisterService(app.db, app.log);
      const txns = new TransactionService(
        app.db,
        app.log,
        balances,
        cashRegisters,
      );
      const subs = new SubscriptionService(app.db, app.log, aura, txns);
      const notifs = new NotificationService(app.db, app.log);
      bookings = new BookingService(app.db, app.log, subs, notifs);
      subs.setBookingService(bookings);
    });

    it("member calling reserve() on a different branch without plan.multiBranch → throws BadRequestError", async () => {
      const tz = "America/Argentina/Buenos_Aires";
      const tomorrow = addDays(
        new Date().toLocaleDateString("en-CA", { timeZone: tz }),
        1,
      );
      await expect(
        bookings.reserve(CTX, svcMemberId, svcScheduleOtherId, tomorrow),
      ).rejects.toThrow(
        /No podes reservar clases bonus en otra sucursal con tu plan actual/i,
      );
    });

    it("coach calling reserve() on a different branch without plan.multiBranch → succeeds (REQ-8 bypass)", async () => {
      const tz = "America/Argentina/Buenos_Aires";
      const tomorrow = addDays(
        new Date().toLocaleDateString("en-CA", { timeZone: tz }),
        1,
      );
      const booking = await bookings.reserve(
        CTX,
        svcCoachId,
        svcScheduleOtherId,
        tomorrow,
      );
      expect(booking).toBeDefined();
      // Verify the booking row exists in DB (defense — the bypass actually
      // produced a booking, didn't silently no-op).
      const rows = await app.db
        .select({ id: schema.bookings.id, status: schema.bookings.status })
        .from(schema.bookings)
        .where(eq(schema.bookings.memberId, svcCoachId));
      expect(rows.length).toBeGreaterThan(0);
    });

    // Heavyweight HTTP-level scenarios (full booking endpoint with all the seed
    // prerequisites — captured-by-trial, attendance windows, hold-then-book
    // sequences, etc.) deferred to UAT (Plan 09 §6).
    it.todo(
      "HTTP-level: staff (coach/admin/owner/gestion/recepcion) reserves bonus on different branch without plan.multiBranch via POST /api/scheduling/bookings → 200 (UAT — Plan 09 §3 S-1)",
    );
    it.todo(
      "HTTP-level: member reserves bonus on different branch without plan.multiBranch via POST /api/scheduling/bookings → 400 (UAT — regression)",
    );
  });

  // ============================================================
  // Cardinality validation (REQ-9 — all 5 cases incl. Blocker 1 4th rule)
  // ============================================================
  describe("Staff cardinality validation", () => {
    it("POST /api/admin/users with role=admin, country missing → 400", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/admin/users",
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          firstName: "X",
          lastName: "Y",
          email: `card-admin-no-country-${u}@test.local`,
          password: "test1234",
          role: "admin",
          branchId: arBranchId,
          // country intentionally omitted — service-layer cardinality should 400
          branchIds: [],
        },
      });
      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body) as { error?: string; message?: string };
      const text = (body.error ?? "") + (body.message ?? "");
      expect(text).toMatch(/admin y gesti(ó|o)n requieren un país/i);
    });

    it("POST /api/admin/users with role=gestion, country missing → 400", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/admin/users",
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          firstName: "X",
          lastName: "Y",
          email: `card-gestion-no-country-${u}@test.local`,
          password: "test1234",
          role: "gestion",
          branchId: arBranchId,
          // country intentionally omitted — service-layer cardinality should 400
          branchIds: [],
        },
      });
      expect(res.statusCode).toBe(400);
    });

    it("POST /api/admin/users with role=coach, branchIds=[] → 400", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/admin/users",
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          firstName: "X",
          lastName: "Y",
          email: `card-coach-empty-${u}@test.local`,
          password: "test1234",
          role: "coach",
          branchId: arBranchId,
          branchIds: [],
        },
      });
      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body) as { error?: string; message?: string };
      const text = (body.error ?? "") + (body.message ?? "");
      expect(text).toMatch(
        /Coach y recepci(ó|o)n requieren al menos una sede operativa/i,
      );
    });

    it("POST /api/admin/users with role=owner, country='AR' → 400", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/admin/users",
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          firstName: "X",
          lastName: "Y",
          email: `card-owner-with-country-${u}@test.local`,
          password: "test1234",
          role: "owner",
          branchId: arBranchId,
          country: "AR",
          branchIds: [],
        },
      });
      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body) as { error?: string; message?: string };
      const text = (body.error ?? "") + (body.message ?? "");
      expect(text).toMatch(/Owner no puede tener país asignado/i);
    });

    // Blocker 1 — REQ-9 4th rule: member with non-empty branchIds.
    // We accept rejection from EITHER AJV (maxItems: 0 in if/then) OR the
    // service layer (validateStaffCardinality); the invariant is statusCode 400.
    it("POST /api/admin/users with role=member, branchIds=[X] → 400 (Blocker 1 / REQ-9 4th rule)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/admin/users",
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          firstName: "X",
          lastName: "Y",
          email: `card-member-with-branchids-${u}@test.local`,
          password: "test1234",
          role: "member",
          branchId: arBranchId,
          country: null,
          branchIds: [arBranchId],
        },
      });
      expect(res.statusCode).toBe(400);
    });

    it("POST /api/admin/users with role=admin, country='AR', branchIds=[] → 201 (valid)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/admin/users",
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          firstName: "X",
          lastName: "Y",
          email: `card-admin-valid-${u}@test.local`,
          password: "test1234",
          role: "admin",
          branchId: arBranchId,
          country: "AR",
          branchIds: [],
        },
      });
      expect(res.statusCode).toBe(201);
    });

    it("POST /api/admin/users with role=coach, branchIds=[arBranchId] → 201 + user_branches row created", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/admin/users",
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          firstName: "X",
          lastName: "Y",
          email: `card-coach-valid-${u}@test.local`,
          password: "test1234",
          role: "coach",
          branchId: arBranchId,
          // country omitted (coach must NOT carry country per cardinality)
          branchIds: [arBranchId],
        },
      });
      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body) as { id: number };
      const ub = await app.db
        .select({ branchId: schema.userBranches.branchId })
        .from(schema.userBranches)
        .where(
          and(
            tenantWhere(schema.userBranches, CTX),
            eq(schema.userBranches.userId, body.id),
          ),
        );
      expect(ub.map((r) => r.branchId)).toContain(arBranchId);
    });
  });
});
