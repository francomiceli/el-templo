import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { createTestApp, getAuthToken, cleanAllTestData } from "../helpers";
import * as schema from "../../src/db/schema";
import { todayInTz } from "../../src/modules/shared/date-utils";
import { createPlan, createMember } from "./_helpers";

/**
 * Phase 144-03 Task 1 — member-facing GET /api/members/subscription/coverage.
 *
 * Returns { coveredUntil, daysRemaining } for the AUTHENTICATED member only.
 * The member id is server-derived from request.user (T-144-08 IDOR): the route
 * never accepts a userId, so a member can only read their own covered-until.
 *
 * daysRemaining = whole calendar days between today (AR date) and coveredUntil,
 * or null when coveredUntil is null.
 */
const COVERAGE_URL = "/api/members/subscription/coverage";
const AR_TZ = "America/Argentina/Buenos_Aires";
const MEMBER_PASSWORD = "pass123456";

/**
 * Build a "YYYY-MM-DD" string offset by `days` from AR today, using the SAME
 * AR-date basis the route uses so the expected daysRemaining is exact
 * regardless of the CI host timezone.
 */
function arDateOffset(days: number): string {
  const today = todayInTz(AR_TZ);
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0];
}

describe("Subscriptions — GET /coverage (member covered-until endpoint)", () => {
  let app: FastifyInstance;
  let adminToken: string;
  let planId: number;

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    const plan = await createPlan(app, adminToken);
    planId = plan.id;
  });

  /** Insert a subscription row directly, bypassing service business rules. */
  async function insertSub(
    userId: number,
    status: "active" | "scheduled" | "cancelled" | "expired",
    endDate: string | null,
  ): Promise<void> {
    await app.db.insert(schema.subscriptions).values({
      userId,
      planId,
      branchId: 1,
      status,
      startDate: arDateOffset(-30),
      endDate,
      pricePaid: 15000,
      priceTypeApplied: "regular",
    });
  }

  it("returns coveredUntil + daysRemaining for an active sub ending in 2 days", async () => {
    const member = await createMember(app, { email: "cov-active@test.com" });
    const endDate = arDateOffset(2);
    await insertSub(member.id, "active", endDate);
    const token = await getAuthToken(
      app,
      "cov-active@test.com",
      MEMBER_PASSWORD,
    );

    const res = await app.inject({
      method: "GET",
      url: COVERAGE_URL,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      coveredUntil: string | null;
      daysRemaining: number | null;
    };
    expect(body.coveredUntil).toBe(endDate);
    expect(body.daysRemaining).toBe(2);
  });

  it("uses the furthest end_date across the active + scheduled chain (33 days)", async () => {
    const member = await createMember(app, { email: "cov-chain@test.com" });
    await insertSub(member.id, "active", arDateOffset(3));
    const furthest = arDateOffset(33);
    await insertSub(member.id, "scheduled", furthest);
    const token = await getAuthToken(
      app,
      "cov-chain@test.com",
      MEMBER_PASSWORD,
    );

    const res = await app.inject({
      method: "GET",
      url: COVERAGE_URL,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      coveredUntil: string | null;
      daysRemaining: number | null;
    };
    expect(body.coveredUntil).toBe(furthest);
    expect(body.daysRemaining).toBe(33);
  });

  it("returns both null when the member has no covering subscription", async () => {
    await createMember(app, { email: "cov-none@test.com" });
    const token = await getAuthToken(app, "cov-none@test.com", MEMBER_PASSWORD);

    const res = await app.inject({
      method: "GET",
      url: COVERAGE_URL,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      coveredUntil: string | null;
      daysRemaining: number | null;
    };
    expect(body.coveredUntil).toBeNull();
    expect(body.daysRemaining).toBeNull();
  });

  it("requires authentication (401 without a token)", async () => {
    const res = await app.inject({ method: "GET", url: COVERAGE_URL });
    expect(res.statusCode).toBe(401);
  });

  it("is server-derived: a member only ever reads their OWN coverage", async () => {
    // Member B has coverage; member A has none. A's token must return A's
    // (null) coverage — there is no way to query B's id through this route.
    const memberB = await createMember(app, { email: "cov-b@test.com" });
    await insertSub(memberB.id, "active", arDateOffset(10));
    await createMember(app, { email: "cov-a@test.com" });

    const tokenA = await getAuthToken(app, "cov-a@test.com", MEMBER_PASSWORD);
    const res = await app.inject({
      method: "GET",
      url: COVERAGE_URL,
      headers: { authorization: `Bearer ${tokenA}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      coveredUntil: string | null;
      daysRemaining: number | null;
    };
    // A's own coverage is null — NOT B's today+10.
    expect(body.coveredUntil).toBeNull();
    expect(body.daysRemaining).toBeNull();
  });
});
