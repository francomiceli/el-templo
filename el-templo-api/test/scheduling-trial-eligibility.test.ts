/**
 * Phase 119 — trial eligibility endpoint (made GREEN by Wave 2).
 *
 * Requirements covered:
 *   - D-20 GET /api/members/scheduling/trial-eligibility exposes whether the
 *     caller can reserve a trial (because /me does NOT expose users.status).
 *
 * Returns { eligible, alreadyBooked, booking? }. Same predicate as the campaign
 * audience (D-08) minus the email/unsubscribe filters.
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import {
  createTestApp,
  getAuthToken,
  createEligibleFreemium,
  cleanAllTestData,
} from "./helpers";
import * as schema from "../src/db/schema";

const ADMIN_URL = "/api/admin/scheduling";
const ELIGIBILITY_URL = "/api/members/scheduling/trial-eligibility";
const RESERVE_TRIAL_URL = "/api/members/scheduling/reserve-trial";

describe("GET /api/members/scheduling/trial-eligibility (Phase 119)", () => {
  let app: FastifyInstance;
  let adminToken: string;
  let physicalBranchId: number;
  let scheduleId: number;

  beforeAll(async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-03-11T10:00:00Z")); // Wednesday

    app = await createTestApp();
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");

    const [physical] = await app.db
      .select({ id: schema.branches.id })
      .from(schema.branches)
      .where(eq(schema.branches.code, "TEST"))
      .limit(1);
    physicalBranchId = physical.id;
  });

  afterAll(async () => {
    vi.useRealTimers();
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    const activityRes = await app.inject({
      method: "POST",
      url: `${ADMIN_URL}/activities`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: "Calistenia", description: "Clase grupal" },
    });
    const activityId = JSON.parse(activityRes.body).id;
    const scheduleRes = await app.inject({
      method: "POST",
      url: `${ADMIN_URL}/schedules`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        branchId: physicalBranchId,
        activityId,
        dayOfWeek: 4, // Thursday
        startTime: "10:00",
        endTime: "11:00",
      },
    });
    scheduleId = JSON.parse(scheduleRes.body).id;
  });

  function thursdayOffset(weeks = 0): string {
    const base = new Date("2026-03-12T00:00:00Z");
    base.setUTCDate(base.getUTCDate() + weeks * 7);
    return base.toISOString().split("T")[0];
  }

  async function freemiumToken(): Promise<{ id: number; token: string }> {
    const { id, email } = await createEligibleFreemium(app);
    const token = await getAuthToken(app, email, "pass123456");
    return { id, token };
  }

  async function getEligibility(
    token: string,
  ): Promise<{ statusCode: number; body: Record<string, unknown> }> {
    const res = await app.inject({
      method: "GET",
      url: ELIGIBILITY_URL,
      headers: { authorization: `Bearer ${token}` },
    });
    return { statusCode: res.statusCode, body: JSON.parse(res.body) };
  }

  it("D-20: eligible=true for a freemium user with no sub and no trial", async () => {
    const { token } = await freemiumToken();
    const { statusCode, body } = await getEligibility(token);
    expect(statusCode).toBe(200);
    expect(body.eligible).toBe(true);
    expect(body.alreadyBooked).toBe(false);
    expect(body.booking).toBeUndefined();
  });

  it("D-20: eligible=false for a user with an active subscription", async () => {
    const { id, token } = await freemiumToken();
    // cleanAllTestData wipes subscription_plans, so create one for the sub.
    const [plan] = await app.db
      .insert(schema.subscriptionPlans)
      .values({
        name: "Eligibility Guard Plan",
        planTier: "foundation",
        bookingMode: "flexible",
        planCategory: "presencial",
        priceRegular: 10000,
        priceZero: 0,
        durationDays: 30,
      })
      .$returningId();
    await app.db.insert(schema.subscriptions).values({
      userId: id,
      planId: plan.id,
      branchId: physicalBranchId,
      status: "active",
      startDate: thursdayOffset(),
      pricePaid: 0,
      priceTypeApplied: "zero",
    });

    const { body } = await getEligibility(token);
    expect(body.eligible).toBe(false);
    expect(body.alreadyBooked).toBe(false);
  });

  it("D-20: alreadyBooked=true (+ booking payload) once a trial is booked", async () => {
    const { token } = await freemiumToken();
    const reserveRes = await app.inject({
      method: "POST",
      url: RESERVE_TRIAL_URL,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        scheduleId,
        date: thursdayOffset(),
        branchId: physicalBranchId,
      },
    });
    expect(reserveRes.statusCode).toBe(201);

    const { body } = await getEligibility(token);
    expect(body.eligible).toBe(false);
    expect(body.alreadyBooked).toBe(true);
    const booking = body.booking as Record<string, unknown> | undefined;
    expect(booking).toBeDefined();
    expect(booking?.date).toBe(thursdayOffset());
    expect(typeof booking?.branchName).toBe("string");
  });

  it("D-20: eligible=false for a non-freemium status", async () => {
    const { id, token } = await freemiumToken();
    await app.db
      .update(schema.users)
      .set({ status: "activo" })
      .where(eq(schema.users.id, id));

    const { body } = await getEligibility(token);
    expect(body.eligible).toBe(false);
    expect(body.alreadyBooked).toBe(false);
  });
});
