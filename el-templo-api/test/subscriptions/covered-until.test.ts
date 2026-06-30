import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { createTestApp, getAuthToken, cleanAllTestData } from "../helpers";
import * as schema from "../../src/db/schema";
import { deriveCoveredUntil } from "../../src/modules/subscriptions/service";
import { createPlan, createMember, dateOffsetStr } from "./_helpers";

/**
 * Phase 144-01 Task 2 — covered-until derivation (D-00, D-13, D-14).
 *
 * deriveCoveredUntil(db, userId) returns the furthest end_date across the
 * member's active+scheduled subscription chain, or null when there is no
 * covering subscription (none / only cancelled / all-NULL end_date).
 */
describe("Subscriptions — deriveCoveredUntil (covered-until chain)", () => {
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
      startDate: dateOffsetStr(-30),
      endDate,
      pricePaid: 15000,
      priceTypeApplied: "regular",
    });
  }

  it("returns the active sub end_date when there is no scheduled successor", async () => {
    const member = await createMember(app, { email: "covered-1@test.com" });
    await insertSub(member.id, "active", "2026-07-10");

    const result = await deriveCoveredUntil(app.db, member.id);
    expect(result).toBe("2026-07-10");
  });

  it("returns the furthest end_date across active + scheduled chain", async () => {
    const member = await createMember(app, { email: "covered-2@test.com" });
    await insertSub(member.id, "active", "2026-07-10");
    await insertSub(member.id, "scheduled", "2026-08-09");

    const result = await deriveCoveredUntil(app.db, member.id);
    expect(result).toBe("2026-08-09");
  });

  it("returns null when the member only has cancelled/expired subs", async () => {
    const member = await createMember(app, { email: "covered-3@test.com" });
    await insertSub(member.id, "cancelled", "2026-07-10");
    await insertSub(member.id, "expired", "2026-06-01");

    const result = await deriveCoveredUntil(app.db, member.id);
    expect(result).toBeNull();
  });

  it("returns null when the member has no subscriptions at all", async () => {
    const member = await createMember(app, { email: "covered-4@test.com" });

    const result = await deriveCoveredUntil(app.db, member.id);
    expect(result).toBeNull();
  });

  it("returns null when the only active sub has a NULL end_date (D-14 guard)", async () => {
    const member = await createMember(app, { email: "covered-5@test.com" });
    await insertSub(member.id, "active", null);

    const result = await deriveCoveredUntil(app.db, member.id);
    expect(result).toBeNull();
  });
});
