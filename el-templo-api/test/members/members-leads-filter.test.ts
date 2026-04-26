/**
 * Phase 102 (R7): integration tests for the `hasUsedTrial` projection on
 * GET /admin/members and GET /admin/members/:id.
 *
 * Originally this file also covered the Phase 102 derived `?status=leads|
 * alumnos` filter. Phase 103 Plan 04 replaced that contract with a
 * first-class users.status enum (freemium/prueba/activo/inactivo) — the new
 * filter is exercised by `test/members/members-status-filter.test.ts`. The
 * `hasUsedTrial` boolean is unrelated to the status migration and stays
 * here as the canonical test.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import argon2 from "argon2";
import { eq } from "drizzle-orm";
import {
  createTestApp,
  getAuthToken,
  cleanAllTestData,
  dateOffsetStr,
  todayStr,
} from "../helpers";
import { users } from "../../src/db/schema/users";
import { subscriptions } from "../../src/db/schema/subscriptions";
import { subscriptionPlans } from "../../src/db/schema/subscription-plans";
import { bookings } from "../../src/db/schema/bookings";
import { schedules } from "../../src/db/schema/schedules";
import { activities } from "../../src/db/schema/activities";

describe("GET /admin/members — hasUsedTrial projection (Phase 102 R7)", () => {
  let app: FastifyInstance;
  let adminToken: string;
  const branchId = 1; // seeded by test setup

  // Fixture ids, populated in beforeEach
  let planId: number;
  let activityId: number;
  let scheduleId: number;
  let userL1: number; // trial booking, no sub → hasUsedTrial=true
  let userL2: number; // trial booking + active sub → hasUsedTrial=true
  let userA1: number; // regular booking + active sub → hasUsedTrial=false
  let userA2: number; // no bookings, no sub → hasUsedTrial=false

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
  });

  afterAll(async () => {
    await app.close();
  });

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

    async function makeMember(data: {
      email: string | null;
      firstName: string;
      dni: string | null;
      // Phase 103 (R10): explicit status per fixture intent (no longer derived).
      status: "freemium" | "prueba" | "activo" | "inactivo";
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
          status: data.status,
        })
        .$returningId();
      return row.id;
    }

    userL1 = await makeMember({
      email: null,
      firstName: "LeadOne",
      dni: null,
      status: "prueba",
    });
    userL2 = await makeMember({
      email: "l2@test.com",
      firstName: "LeadTwoConverted",
      dni: "L200000002",
      status: "activo",
    });
    userA1 = await makeMember({
      email: "a1@test.com",
      firstName: "AlumnoOne",
      dni: "A100000001",
      status: "activo",
    });
    userA2 = await makeMember({
      email: "a2@test.com",
      firstName: "AlumnoTwoPlain",
      dni: "A200000002",
      status: "inactivo",
    });

    // L1: one trial booking.
    await app.db.insert(bookings).values({
      memberId: userL1,
      scheduleId,
      bookingDate: dateOffsetStr(-7),
      status: "confirmado",
      isTrial: true,
    });

    // L2: one trial booking + active subscription (converted lead).
    await app.db.insert(bookings).values({
      memberId: userL2,
      scheduleId,
      bookingDate: dateOffsetStr(-30),
      status: "confirmado",
      isTrial: true,
    });
    const futureEnd = dateOffsetStr(30);
    await app.db.insert(subscriptions).values({
      userId: userL2,
      planId,
      branchId,
      status: "active",
      startDate: todayStr(),
      endDate: futureEnd,
      pricePaid: 10000,
      priceTypeApplied: "regular",
    });

    // A1: one regular (non-trial) booking + active subscription.
    await app.db.insert(bookings).values({
      memberId: userA1,
      scheduleId,
      bookingDate: dateOffsetStr(-7),
      status: "confirmado",
      isTrial: false,
    });
    await app.db.insert(subscriptions).values({
      userId: userA1,
      planId,
      branchId,
      status: "active",
      startDate: todayStr(),
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

  it("cancelling L1's trial booking flips hasUsedTrial back to false", async () => {
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
  });
});
