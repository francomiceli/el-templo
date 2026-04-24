/**
 * Phase 102 (R7 + R8): integration tests for the members API additions.
 *
 * R7 — `hasUsedTrial: boolean` on MemberListItem and MemberProfile, derived
 *      server-side via an EXISTS subquery on bookings.is_trial.
 * R8 — `?status=todos|alumnos|leads` filter on GET /admin/members.
 *        - "leads"   = users with ≥1 is_trial=TRUE booking AND no currently
 *                      active/paused subscription.
 *        - "alumnos" = inverse of leads (everyone else).
 *        - "todos"   = no-op, identical to omitting the param.
 *
 * Fixtures are inserted directly via drizzle so these tests remain
 * independent of the trial-creation endpoint (Plan 02 territory).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import argon2 from "argon2";
import { eq } from "drizzle-orm";
import {
  createTestApp,
  getAuthToken,
  registerUser,
  cleanAllTestData,
} from "../helpers";
import { users } from "../../src/db/schema/users";
import { subscriptions } from "../../src/db/schema/subscriptions";
import { subscriptionPlans } from "../../src/db/schema/subscription-plans";
import { bookings } from "../../src/db/schema/bookings";
import { schedules } from "../../src/db/schema/schedules";
import { activities } from "../../src/db/schema/activities";

describe("GET /admin/members — status filter + hasUsedTrial (Phase 102 R7, R8)", () => {
  let app: FastifyInstance;
  let adminToken: string;
  const branchId = 1; // seeded by test setup

  // Fixture ids, populated in beforeEach
  let planId: number;
  let activityId: number;
  let scheduleId: number;
  let userL1: number; // trial booking, no sub → lead
  let userL2: number; // trial booking + active sub → alumno
  let userA1: number; // regular booking + active sub → alumno
  let userA2: number; // no bookings, no sub → alumno

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
  });

  afterAll(async () => {
    await app.close();
  });

  /**
   * Seed a minimal fixture: one subscription plan, one activity/schedule,
   * four users matching the four scenarios from R7/R8.
   */
  beforeEach(async () => {
    await cleanAllTestData(app);

    // Plan (needed for L2 and A1's subscriptions)
    const [planRow] = await app.db
      .insert(subscriptionPlans)
      .values({
        name: "Leads Test Plan",
        planTier: "foundation",
        bookingMode: "flexible",
        planCategory: "presencial",
        priceRegular: 10000,
        priceZero: 0,
        durationDays: 30,
      })
      .$returningId();
    planId = planRow.id;

    // Activity + schedule (both bookings reference the same one)
    const [actRow] = await app.db
      .insert(activities)
      .values({ name: "Calistenia Test", branchId })
      .$returningId();
    activityId = actRow.id;

    const [schRow] = await app.db
      .insert(schedules)
      .values({
        activityId,
        branchId,
        dayOfWeek: 3,
        startTime: "10:00",
        endTime: "11:00",
        isActive: true,
      })
      .$returningId();
    scheduleId = schRow.id;

    const passwordHash = await argon2.hash("ignored");

    // Helper: insert a member user and return the id.
    async function makeMember(data: {
      email: string | null;
      firstName: string;
      dni: string | null;
    }): Promise<number> {
      const [row] = await app.db
        .insert(users)
        .values({
          email: data.email,
          passwordHash,
          firstName: data.firstName,
          lastName: "Test",
          phone: null,
          dni: data.dni,
          branchId,
          role: "member",
          level: "alfa",
        })
        .$returningId();
      return row.id;
    }

    userL1 = await makeMember({
      email: null,
      firstName: "LeadOne",
      dni: null,
    });
    userL2 = await makeMember({
      email: "l2@test.com",
      firstName: "LeadTwoConverted",
      dni: "L200000002",
    });
    userA1 = await makeMember({
      email: "a1@test.com",
      firstName: "AlumnoOne",
      dni: "A100000001",
    });
    userA2 = await makeMember({
      email: "a2@test.com",
      firstName: "AlumnoTwoPlain",
      dni: "A200000002",
    });

    // L1: one trial booking.
    await app.db.insert(bookings).values({
      memberId: userL1,
      scheduleId,
      bookingDate: "2026-04-10",
      status: "confirmado",
      isTrial: true,
    });

    // L2: one trial booking + active subscription (converted lead).
    await app.db.insert(bookings).values({
      memberId: userL2,
      scheduleId,
      bookingDate: "2026-03-20",
      status: "confirmado",
      isTrial: true,
    });
    const todayStr = new Date().toISOString().slice(0, 10);
    const futureEnd = new Date(Date.now() + 30 * 86400000)
      .toISOString()
      .slice(0, 10);
    await app.db.insert(subscriptions).values({
      userId: userL2,
      planId,
      branchId,
      status: "active",
      startDate: todayStr,
      endDate: futureEnd,
      pricePaid: 10000,
      priceTypeApplied: "regular",
    });

    // A1: one regular (non-trial) booking + active subscription.
    await app.db.insert(bookings).values({
      memberId: userA1,
      scheduleId,
      bookingDate: "2026-04-10",
      status: "confirmado",
      isTrial: false,
    });
    await app.db.insert(subscriptions).values({
      userId: userA1,
      planId,
      branchId,
      status: "active",
      startDate: todayStr,
      endDate: futureEnd,
      pricePaid: 10000,
      priceTypeApplied: "regular",
    });

    // A2: brand-new user, no bookings, no subscription.
  });

  // ─── Helpers ──────────────────────────────────────────────────────────

  interface ListResponse {
    members: Array<{
      id: number;
      firstName: string | null;
      hasUsedTrial: boolean;
      branchId: number;
    }>;
    total: number;
  }

  async function listMembers(query: string): Promise<ListResponse> {
    const res = await app.inject({
      method: "GET",
      url: `/api/admin/members${query ? `?${query}` : ""}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    return JSON.parse(res.body) as ListResponse;
  }

  // ─── R8: status filter ────────────────────────────────────────────────

  it("status=leads returns only user L1 (trial booking + no active sub)", async () => {
    const body = await listMembers("status=leads");
    const ids = body.members.map((m) => m.id).sort();
    expect(ids).toEqual([userL1].sort());
    expect(body.total).toBe(1);
  });

  it("status=alumnos excludes L1 and includes L2, A1, A2", async () => {
    const body = await listMembers("status=alumnos");
    const ids = body.members.map((m) => m.id).sort();
    expect(ids).toEqual([userL2, userA1, userA2].sort());
    expect(body.total).toBe(3);
  });

  it("status=todos and omitted status both return all four users", async () => {
    const expected = [userL1, userL2, userA1, userA2].sort();

    const bodyTodos = await listMembers("status=todos");
    expect(bodyTodos.members.map((m) => m.id).sort()).toEqual(expected);
    expect(bodyTodos.total).toBe(4);

    const bodyDefault = await listMembers("");
    expect(bodyDefault.members.map((m) => m.id).sort()).toEqual(expected);
    expect(bodyDefault.total).toBe(4);
  });

  // ─── R7: hasUsedTrial on list items ───────────────────────────────────

  it("each MemberListItem carries the correct hasUsedTrial boolean", async () => {
    const body = await listMembers("status=todos");
    const byId = new Map(body.members.map((m) => [m.id, m]));

    expect(byId.get(userL1)?.hasUsedTrial).toBe(true);
    expect(byId.get(userL2)?.hasUsedTrial).toBe(true);
    expect(byId.get(userA1)?.hasUsedTrial).toBe(false);
    expect(byId.get(userA2)?.hasUsedTrial).toBe(false);
  });

  // ─── R7: hasUsedTrial on profile endpoint ─────────────────────────────

  it("GET /admin/members/{L1.id} returns hasUsedTrial=true", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/admin/members/${userL1}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { hasUsedTrial: boolean };
    expect(body.hasUsedTrial).toBe(true);
  });

  it("GET /admin/members/{A2.id} returns hasUsedTrial=false", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/admin/members/${userA2}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { hasUsedTrial: boolean };
    expect(body.hasUsedTrial).toBe(false);
  });

  // ─── 102-06: cancelled trials don't count as "used" ──────────────────

  it("cancelling L1's trial booking flips hasUsedTrial back to false and moves them out of leads", async () => {
    // Cancel L1's single trial booking.
    await app.db
      .update(bookings)
      .set({ status: "cancelado", cancelledAt: new Date() })
      .where(eq(bookings.memberId, userL1));

    // Profile: hasUsedTrial resets to false.
    const profileRes = await app.inject({
      method: "GET",
      url: `/api/admin/members/${userL1}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(profileRes.statusCode).toBe(200);
    expect(
      (JSON.parse(profileRes.body) as { hasUsedTrial: boolean }).hasUsedTrial,
    ).toBe(false);

    // Leads filter: L1 no longer appears (no active trial + no sub = alumno-without-plan).
    const leadsBody = await listMembers("status=leads");
    expect(leadsBody.members.map((m) => m.id)).not.toContain(userL1);
    expect(leadsBody.total).toBe(0);

    // Alumnos filter: L1 now appears (everyone-except-leads).
    const alumnosBody = await listMembers("status=alumnos");
    expect(alumnosBody.members.map((m) => m.id)).toContain(userL1);
  });

  // ─── Composition: status + branchId ───────────────────────────────────

  it("status=leads composes with branchId filter (returns leads in that branch only)", async () => {
    const body = await listMembers(`status=leads&branchId=${branchId}`);
    const ids = body.members.map((m) => m.id).sort();
    expect(ids).toEqual([userL1].sort());
    // And every returned row is in the requested branch.
    for (const m of body.members) {
      expect(m.branchId).toBe(branchId);
    }
  });

  // ─── Guard: non-staff JWT gets 403 ────────────────────────────────────

  it("non-staff JWT gets 403 on /admin/members?status=leads", async () => {
    const { token: memberToken } = await registerUser(app, {
      email: "plainmember@test.com",
      password: "password123",
      branchId,
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/admin/members?status=leads",
      headers: { authorization: `Bearer ${memberToken}` },
    });
    expect(res.statusCode).toBe(403);
  });
});
