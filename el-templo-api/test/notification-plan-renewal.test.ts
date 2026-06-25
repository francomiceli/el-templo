import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq, sql } from "drizzle-orm";
import { createTestApp, getAuthToken, cleanAllTestData } from "./helpers";
import * as schema from "../src/db/schema";
import { NotificationService } from "../src/modules/notifications/service";
import { runPlanRenewalWarnings } from "../src/jobs/notification-cron";
import { createPlan, createMember } from "./subscriptions/_helpers";

/**
 * Phase 144-02 Task 2 — Plan Renewal Warning cron (D-02, D-03, D-05).
 *
 * runPlanRenewalWarnings enqueues a "Planes" push when the member's
 * covered-until lands exactly today+7 / today+3 / today, suppressing anyone who
 * already renewed (scheduled successor) and anyone who silenced the category.
 *
 * CRITICAL SETUP: queueNotification silently no-ops when the template row is
 * missing, and tests do NOT boot the cron (so the auto-seed in
 * startNotificationJobs never runs). We therefore call seedTemplates() in
 * beforeEach AFTER cleanAllTestData (which wipes notification_templates),
 * mirroring scheduling.test.ts — without it every enqueue case yields ZERO rows.
 */
describe("Notifications — runPlanRenewalWarnings (plan renewal windows)", () => {
  let app: FastifyInstance;
  let adminToken: string;
  let planId: number;
  let notificationService: NotificationService;

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
    // Seed the plan_renewal_warning_* templates BEFORE invoking the cron —
    // queueNotification no-ops without them and the asserts would see 0 rows.
    notificationService = new NotificationService(app.db, app.log);
    await notificationService.seedTemplates();
  });

  /**
   * Insert a subscription whose end_date is exactly CURDATE() + offsetDays.
   * Using SQL DATE arithmetic (not JS) keeps the fixture timezone-stable and
   * matches the cron's CURDATE()-based comparison exactly.
   */
  async function insertSub(
    userId: number,
    status: "active" | "scheduled",
    offsetDays: number,
  ): Promise<void> {
    await app.db.insert(schema.subscriptions).values({
      userId,
      planId,
      branchId: 1,
      status,
      startDate: sql`DATE_SUB(CURDATE(), INTERVAL 30 DAY)`,
      endDate: sql`DATE_ADD(CURDATE(), INTERVAL ${offsetDays} DAY)`,
      pricePaid: 15000,
      priceTypeApplied: "regular",
    });
  }

  /** Give the member a device token so queueNotification does not skip them. */
  async function giveDeviceToken(userId: number): Promise<void> {
    await app.db.insert(schema.deviceTokens).values({
      userId,
      token: `tok-${userId}-${Date.now()}`,
      platform: "android",
    });
  }

  /** Silence the `planes` category for the member (opt-out). */
  async function silencePlanes(userId: number): Promise<void> {
    await app.db.insert(schema.notificationPreferences).values({
      userId,
      category: "planes",
      enabled: false,
    });
  }

  /** Template keys of the pending_notifications rows queued for a member. */
  async function pendingKeysFor(userId: number): Promise<string[]> {
    const rows = await app.db
      .select({ key: schema.notificationTemplates.templateKey })
      .from(schema.pendingNotifications)
      .innerJoin(
        schema.notificationTemplates,
        eq(
          schema.pendingNotifications.templateId,
          schema.notificationTemplates.id,
        ),
      )
      .where(eq(schema.pendingNotifications.userId, userId));
    return rows.map((r) => r.key);
  }

  it("queues plan_renewal_warning_7d for a member covered until today+7", async () => {
    const member = await createMember(app, { email: "renew-7d@test.com" });
    await giveDeviceToken(member.id);
    await insertSub(member.id, "active", 7);

    await runPlanRenewalWarnings(app.db, notificationService);

    expect(await pendingKeysFor(member.id)).toEqual([
      "plan_renewal_warning_7d",
    ]);
  });

  it("queues plan_renewal_warning_3d for a member covered until today+3", async () => {
    const member = await createMember(app, { email: "renew-3d@test.com" });
    await giveDeviceToken(member.id);
    await insertSub(member.id, "active", 3);

    await runPlanRenewalWarnings(app.db, notificationService);

    expect(await pendingKeysFor(member.id)).toEqual([
      "plan_renewal_warning_3d",
    ]);
  });

  it("queues plan_renewal_warning_expired for a member covered until today", async () => {
    const member = await createMember(app, { email: "renew-exp@test.com" });
    await giveDeviceToken(member.id);
    await insertSub(member.id, "active", 0);

    await runPlanRenewalWarnings(app.db, notificationService);

    expect(await pendingKeysFor(member.id)).toEqual([
      "plan_renewal_warning_expired",
    ]);
  });

  it("suppresses the push when a scheduled successor extends coverage (D-05)", async () => {
    const member = await createMember(app, { email: "renew-sup@test.com" });
    await giveDeviceToken(member.id);
    // Active ends in 3 days, but a scheduled successor extends coverage to +33.
    await insertSub(member.id, "active", 3);
    await insertSub(member.id, "scheduled", 33);

    await runPlanRenewalWarnings(app.db, notificationService);

    // covered-until = today+33 ≠ today+3 → no push for the 3d window.
    expect(await pendingKeysFor(member.id)).toEqual([]);
  });

  it("suppresses the push when the member silenced the Planes category", async () => {
    const member = await createMember(app, { email: "renew-optout@test.com" });
    await giveDeviceToken(member.id);
    await insertSub(member.id, "active", 3);
    await silencePlanes(member.id);

    await runPlanRenewalWarnings(app.db, notificationService);

    expect(await pendingKeysFor(member.id)).toEqual([]);
  });

  it("does not queue anything for a member outside all bands (today+5)", async () => {
    const member = await createMember(app, { email: "renew-oob@test.com" });
    await giveDeviceToken(member.id);
    await insertSub(member.id, "active", 5);

    await runPlanRenewalWarnings(app.db, notificationService);

    expect(await pendingKeysFor(member.id)).toEqual([]);
  });
});
