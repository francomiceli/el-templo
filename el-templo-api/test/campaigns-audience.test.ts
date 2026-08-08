/**
 * Phase 119 — campaign audience query. D-08 / D-09 / D-10.
 *
 *   - D-08 audience = freemium + no active/paused/scheduled sub + no
 *     non-cancelled is_trial booking + email IS NOT NULL + not unsubscribed
 *   - D-09 ghosts/inactives are NOT filtered out (no activity predicate)
 *   - D-10 freshness guard: created_at < NOW() - INTERVAL 3 DAY
 *
 * Runs against the per-worker MySQL test database via createTestApp().
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import {
  createTestApp,
  cleanAllTestData,
  createEligibleFreemium,
  todayStr,
} from "./helpers";
import { CampaignService } from "../src/modules/campaigns/service";
import { EmailService } from "../src/modules/email/service";
import type { TenantContext } from "../src/modules/shared/tenant";
import * as schema from "../src/db/schema";

let app: FastifyInstance;
let service: CampaignService;
let branchId: number;

// T-173-08: `users` es tabla strict — `listEligible` recibe `ctx` primero.
const CTX: TenantContext = { tenantId: 1 };

function makeService(a: FastifyInstance): CampaignService {
  return new CampaignService(a.db, a.log, new EmailService(a.log));
}

/** Seed a plan and assign an ACTIVE subscription to `userId`. */
async function seedActiveSubscription(userId: number): Promise<void> {
  const [plan] = await app.db
    .insert(schema.subscriptionPlans)
    .values({
      name: "Audience Test Plan",
      planTier: "foundation",
      bookingMode: "flexible",
      planCategory: "presencial",
      priceRegular: 10000,
      priceZero: 0,
      durationDays: 30,
    })
    .$returningId();

  await app.db.insert(schema.subscriptions).values({
    userId,
    planId: plan.id,
    branchId,
    status: "active",
    startDate: todayStr(),
    pricePaid: 10000,
    priceTypeApplied: "regular",
  });
}

/** Seed a schedule + a booking for `userId`. Returns the booking id. */
async function seedTrialBooking(
  userId: number,
  status: "reservado" | "cancelado",
): Promise<void> {
  const [activity] = await app.db
    .insert(schema.activities)
    .values({ name: "Audience Test Activity" })
    .$returningId();
  const [sched] = await app.db
    .insert(schema.schedules)
    .values({
      branchId,
      activityId: activity.id,
      dayOfWeek: 1,
      startTime: "10:00",
      endTime: "11:00",
    })
    .$returningId();
  await app.db.insert(schema.bookings).values({
    memberId: userId,
    scheduleId: sched.id,
    bookingDate: todayStr(),
    status,
    isTrial: true,
    source: "self_service",
  });
}

beforeAll(async () => {
  app = await createTestApp();
  service = makeService(app);
  const [branch] = await app.db
    .select({ id: schema.branches.id })
    .from(schema.branches)
    .where(eq(schema.branches.code, "TEST"))
    .limit(1);
  branchId = branch.id;
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await cleanAllTestData(app);
});

describe("campaign audience query (Phase 119)", () => {
  it("D-08: includes an eligible freemium user with an email", async () => {
    const { id } = await createEligibleFreemium(app, { branchId });
    const eligible = await service.listEligible(CTX);
    expect(eligible.map((e) => e.userId)).toContain(id);
  });

  it("D-08: excludes users with an active subscription", async () => {
    const { id } = await createEligibleFreemium(app, { branchId });
    await seedActiveSubscription(id);
    const eligible = await service.listEligible(CTX);
    expect(eligible.map((e) => e.userId)).not.toContain(id);
  });

  it("D-08: excludes users with a non-cancelled is_trial booking", async () => {
    const { id } = await createEligibleFreemium(app, { branchId });
    await seedTrialBooking(id, "reservado");
    const eligible = await service.listEligible(CTX);
    expect(eligible.map((e) => e.userId)).not.toContain(id);
  });

  it("D-08: includes a user whose only is_trial booking is cancelled", async () => {
    const { id } = await createEligibleFreemium(app, { branchId });
    await seedTrialBooking(id, "cancelado");
    const eligible = await service.listEligible(CTX);
    expect(eligible.map((e) => e.userId)).toContain(id);
  });

  it("D-08: excludes users with a null email", async () => {
    const { id } = await createEligibleFreemium(app, { branchId });
    await app.db
      .update(schema.users)
      .set({ email: null })
      .where(eq(schema.users.id, id));
    const eligible = await service.listEligible(CTX);
    expect(eligible.map((e) => e.userId)).not.toContain(id);
  });

  it("D-08: excludes unsubscribed emails (suppression list)", async () => {
    const { id, email } = await createEligibleFreemium(app, { branchId });
    await app.db.insert(schema.campaignUnsubscribes).values({ email });
    const eligible = await service.listEligible(CTX);
    expect(eligible.map((e) => e.userId)).not.toContain(id);
  });

  it("D-10: excludes users created within the last 3 days", async () => {
    const { id } = await createEligibleFreemium(app, {
      branchId,
      createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
    });
    const eligible = await service.listEligible(CTX);
    expect(eligible.map((e) => e.userId)).not.toContain(id);
  });

  it("D-09: includes ghosts/inactives (no activity filter)", async () => {
    const { id } = await createEligibleFreemium(app, {
      branchId,
      createdAt: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000),
    });
    const eligible = await service.listEligible(CTX);
    expect(eligible.map((e) => e.userId)).toContain(id);
  });
});
