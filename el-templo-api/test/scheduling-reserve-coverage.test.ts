/**
 * Phase 144-04 (BOOK-BLOCK, D-11..D-15) — reserve() coverage block.
 *
 * A member must not reserve a presencial class dated AFTER their plan's
 * covered-until (the furthest end_date across the active+scheduled chain).
 * The rejection carries a distinguishable HTTP body `code: "COVERAGE_EXPIRED"`
 * so the app can show the renewal dialog instead of the generic error.
 *
 * Behaviors covered (D-12/D-13/D-14):
 *   - class date AFTER covered-until → 400 with body.code === "COVERAGE_EXPIRED"
 *   - class date WITHIN covered-until → 201 (allowed)
 *   - class covered only by a SCHEDULED successor → 201 (D-13 chain)
 *   - covered-until NULL (no end_date) → 201, never blocks (D-14 guard)
 *   - generic failure (no active subscription) → 400 WITHOUT the code (regression)
 *
 * NOTE: the member booking window is +2 days, so coverage only ever blocks
 * when the plan expires within that window. The fixture pins "now" to a
 * Wednesday and books the next-day Thursday slot, with covered-until tuned
 * per case so the +1d class lands before/after the chained covered date.
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
  registerUser,
  cleanAllTestData,
} from "./helpers";
import * as schema from "../src/db/schema";

const ADMIN_URL = "/api/admin/scheduling";
const SUBSCRIPTIONS_URL = "/api/admin/subscriptions";
const RESERVE_URL = "/api/members/scheduling/reserve";

// Thursday relative to the pinned Wednesday (a valid +1d future slot).
const CLASS_DATE = "2026-03-12";

describe("POST /api/members/scheduling/reserve — coverage block (Phase 144-04)", () => {
  let app: FastifyInstance;
  let adminToken: string;
  let testBranchId: number;
  let planId: number;
  let scheduleId: number;

  beforeAll(async () => {
    // Pin to Wednesday 10:00 UTC so the +2d window + dayOfWeek checks land on a
    // valid future Thursday slot, and autoExpireSubscriptions (which uses the
    // JS clock) compares against 2026-03-11.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-03-11T10:00:00Z")); // Wednesday

    app = await createTestApp();
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");

    const [branch] = await app.db
      .select({ id: schema.branches.id })
      .from(schema.branches)
      .where(eq(schema.branches.isVirtual, false))
      .limit(1);
    testBranchId = branch.id;
  });

  afterAll(async () => {
    vi.useRealTimers();
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);

    // Plan + presencial Thursday 10:00 schedule (recreated each test —
    // cleanAllTestData wipes plans/activities/schedules).
    const planRes = await app.inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}/plans`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        name: "Plan Flex Mensual",
        planTier: "flex",
        bookingMode: "flexible",
        priceRegular: 15000,
        priceZero: 10000,
        durationDays: 30,
        classesPerWeek: 3,
      },
    });
    planId = JSON.parse(planRes.body).id;

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
        branchId: testBranchId,
        activityId,
        dayOfWeek: 4, // Thursday (ISO)
        startTime: "10:00",
        endTime: "11:00",
      },
    });
    scheduleId = JSON.parse(scheduleRes.body).id;
  });

  /** Register a member and return {id, token}. */
  async function createMemberToken(
    email: string,
  ): Promise<{ id: number; token: string }> {
    const result = await registerUser(app, {
      email,
      password: "pass123456",
      branchId: testBranchId,
    });
    const id = (result.user as { id: number }).id;
    const token = await getAuthToken(app, email, "pass123456");
    return { id, token };
  }

  /** Insert a subscription row directly so end_date can be tuned per case. */
  async function insertSub(
    userId: number,
    status: "active" | "scheduled",
    startDate: string,
    endDate: string | null,
  ): Promise<void> {
    await app.db.insert(schema.subscriptions).values({
      userId,
      planId,
      branchId: testBranchId,
      status,
      startDate,
      endDate,
      pricePaid: 15000,
      priceTypeApplied: "regular",
    });
  }

  async function reserve(
    token: string,
  ): Promise<{ statusCode: number; body: Record<string, unknown> }> {
    const res = await app.inject({
      method: "POST",
      url: RESERVE_URL,
      headers: { authorization: `Bearer ${token}` },
      payload: { scheduleId, date: CLASS_DATE },
    });
    return { statusCode: res.statusCode, body: JSON.parse(res.body) };
  }

  it("D-12: blocks a class dated after covered-until with code COVERAGE_EXPIRED", async () => {
    const { id, token } = await createMemberToken("cov-block@test.com");
    // Active sub covers only through today (2026-03-11); the class is 2026-03-12.
    await insertSub(id, "active", "2026-02-14", "2026-03-11");

    const { statusCode, body } = await reserve(token);
    expect(statusCode).toBe(400);
    expect(body.code).toBe("COVERAGE_EXPIRED");
  });

  it("D-12: allows a class within covered-until (201)", async () => {
    const { id, token } = await createMemberToken("cov-within@test.com");
    // Active sub covers well past the class date.
    await insertSub(id, "active", "2026-02-14", "2026-03-31");

    const { statusCode, body } = await reserve(token);
    expect(statusCode).toBe(201);
    expect(body.code).toBeUndefined();
    expect(body.status).toBe("reservado");
  });

  it("D-13: allows a class covered by a scheduled successor (chain)", async () => {
    const { id, token } = await createMemberToken("cov-chain@test.com");
    // Active ends today; a scheduled successor extends coverage to 2026-04-09.
    await insertSub(id, "active", "2026-02-14", "2026-03-11");
    await insertSub(id, "scheduled", "2026-03-12", "2026-04-09");

    const { statusCode, body } = await reserve(token);
    expect(statusCode).toBe(201);
    expect(body.code).toBeUndefined();
  });

  it("D-14: never blocks when covered-until is null (no end_date)", async () => {
    const { id, token } = await createMemberToken("cov-null@test.com");
    await insertSub(id, "active", "2026-02-14", null);

    const { statusCode, body } = await reserve(token);
    expect(statusCode).toBe(201);
    expect(body.code).toBeUndefined();
  });

  it("regression: a generic reserve failure (no subscription) has NO coverage code", async () => {
    const { token } = await createMemberToken("cov-nosub@test.com");
    // No subscription inserted → membership gate fails first.
    const { statusCode, body } = await reserve(token);
    expect(statusCode).toBe(400);
    expect(body.code).not.toBe("COVERAGE_EXPIRED");
  });
});
