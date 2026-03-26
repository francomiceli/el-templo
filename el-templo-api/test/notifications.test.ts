/**
 * Notification Module Integration Tests
 *
 * Covers: token registration, notification preferences CRUD,
 * opened tracking, admin template management, segment send,
 * and queue processing (service-level).
 *
 * Uses DRY_RUN=true to prevent actual FCM sends (per D-39).
 */

process.env.DRY_RUN = "true";

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from "vitest";
import type { FastifyInstance } from "fastify";
import {
  createTestApp,
  registerUser,
  createStaffUser,
  getAuthToken,
  cleanAllTestData,
} from "./helpers";
import { NotificationService } from "../src/modules/notifications/service";
import * as schema from "../src/db/schema";
import { eq, sql } from "drizzle-orm";

describe("Notification Module", () => {
  let app: FastifyInstance;
  let ownerToken: string;
  let adminToken: string;
  let memberToken: string;
  let memberId: number;

  const timestamp = Date.now();
  const ownerEmail = `notif-owner-${timestamp}@test.com`;
  const ownerPassword = "owner-pass-123";
  const adminEmail = `notif-admin-${timestamp}@test.com`;
  const adminPassword = "admin-pass-123";
  const memberEmail = `notif-member-${timestamp}@test.com`;
  const memberPassword = "member-pass-123";

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await cleanAllTestData(app);
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);

    // Create owner user (can seed templates)
    await createStaffUser(app, {
      email: ownerEmail,
      password: ownerPassword,
      firstName: "Owner",
      lastName: "Test",
      role: "owner",
      branchId: 1,
    });
    ownerToken = await getAuthToken(app, ownerEmail, ownerPassword);

    // Create admin user
    await createStaffUser(app, {
      email: adminEmail,
      password: adminPassword,
      firstName: "Admin",
      lastName: "Test",
      role: "admin",
      branchId: 1,
    });
    adminToken = await getAuthToken(app, adminEmail, adminPassword);

    // Create member user
    const memberResult = await registerUser(app, {
      email: memberEmail,
      password: memberPassword,
      branchId: 1,
    });
    memberToken = memberResult.token;
    memberId = (memberResult.user as { id: number }).id;

    // Seed notification templates for tests that need them
    const seedRes = await app.inject({
      method: "POST",
      url: "/api/notifications/admin/seed-templates",
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(seedRes.statusCode).toBe(200);
  });

  // =========================================================================
  // 1. Token Registration
  // =========================================================================
  describe("Token Registration", () => {
    it("POST /api/notifications/token with valid token returns 200", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/notifications/token",
        headers: { authorization: `Bearer ${memberToken}` },
        payload: {
          token: "fcm-test-token-abcdef123456789012345678901234567890",
          platform: "android",
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
    });

    it("POST /api/notifications/token with same token again returns 200 (upsert)", async () => {
      const tokenValue =
        "fcm-upsert-token-abcdef123456789012345678901234567890";

      // First registration
      await app.inject({
        method: "POST",
        url: "/api/notifications/token",
        headers: { authorization: `Bearer ${memberToken}` },
        payload: { token: tokenValue, platform: "android" },
      });

      // Second registration (same token) — should upsert
      const res = await app.inject({
        method: "POST",
        url: "/api/notifications/token",
        headers: { authorization: `Bearer ${memberToken}` },
        payload: { token: tokenValue, platform: "android" },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);

      // Verify only one row exists for this token
      const rows = await app.db
        .select()
        .from(schema.deviceTokens)
        .where(eq(schema.deviceTokens.token, tokenValue));
      expect(rows).toHaveLength(1);
    });

    it("POST /api/notifications/token without auth returns 401", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/notifications/token",
        payload: {
          token: "fcm-no-auth-token-abcdef123456789012345678901234567890",
          platform: "android",
        },
      });

      expect(res.statusCode).toBe(401);
    });

    it("POST /api/notifications/token with missing token field returns 400", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/notifications/token",
        headers: { authorization: `Bearer ${memberToken}` },
        payload: { platform: "android" },
      });

      expect(res.statusCode).toBe(400);
    });

    it("POST /api/notifications/token with invalid platform returns 400", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/notifications/token",
        headers: { authorization: `Bearer ${memberToken}` },
        payload: {
          token: "fcm-invalid-platform-abcdef123456789012345678901234567890",
          platform: "windows",
        },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  // =========================================================================
  // 2. Notification Preferences
  // =========================================================================
  describe("Notification Preferences", () => {
    it("GET /api/notifications/preferences returns 200 with all 4 categories true by default", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/notifications/preferences",
        headers: { authorization: `Bearer ${memberToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.preferences).toEqual({
        entrenamiento: true,
        programas: true,
        motivacion: true,
        anuncios: true,
      });
    });

    it("PUT /api/notifications/preferences with valid category returns 200", async () => {
      const res = await app.inject({
        method: "PUT",
        url: "/api/notifications/preferences",
        headers: { authorization: `Bearer ${memberToken}` },
        payload: { category: "entrenamiento", enabled: false },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
    });

    it("GET /api/notifications/preferences after update shows entrenamiento: false", async () => {
      // Update preference
      await app.inject({
        method: "PUT",
        url: "/api/notifications/preferences",
        headers: { authorization: `Bearer ${memberToken}` },
        payload: { category: "entrenamiento", enabled: false },
      });

      // Read back
      const res = await app.inject({
        method: "GET",
        url: "/api/notifications/preferences",
        headers: { authorization: `Bearer ${memberToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.preferences.entrenamiento).toBe(false);
      expect(body.preferences.programas).toBe(true);
      expect(body.preferences.motivacion).toBe(true);
      expect(body.preferences.anuncios).toBe(true);
    });

    it("PUT /api/notifications/preferences with invalid category returns 400", async () => {
      const res = await app.inject({
        method: "PUT",
        url: "/api/notifications/preferences",
        headers: { authorization: `Bearer ${memberToken}` },
        payload: { category: "invalid_category", enabled: false },
      });

      expect(res.statusCode).toBe(400);
    });

    it("PUT /api/notifications/preferences without auth returns 401", async () => {
      const res = await app.inject({
        method: "PUT",
        url: "/api/notifications/preferences",
        payload: { category: "entrenamiento", enabled: false },
      });

      expect(res.statusCode).toBe(401);
    });
  });

  // =========================================================================
  // 3. Opened Tracking
  // =========================================================================
  describe("Opened Tracking", () => {
    it("POST /api/notifications/:id/opened with valid ID returns 200", async () => {
      // First, queue a notification via service to get a valid notification ID
      const service = new NotificationService(app.db, app.log, true);
      const notificationId = await service.queueNotification({
        userId: memberId,
        templateKey: "morning_energy",
      });
      expect(notificationId).toBeGreaterThan(0);

      const res = await app.inject({
        method: "POST",
        url: `/api/notifications/${notificationId}/opened`,
        headers: { authorization: `Bearer ${memberToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
    });

    it("POST /api/notifications/999999/opened with non-existent ID returns 200 (graceful)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/notifications/999999/opened",
        headers: { authorization: `Bearer ${memberToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
    });

    it("POST /api/notifications/:id/opened without auth returns 401", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/notifications/1/opened",
      });

      expect(res.statusCode).toBe(401);
    });
  });

  // =========================================================================
  // 4. Admin Template Management
  // =========================================================================
  describe("Admin Template Management", () => {
    it("GET /api/notifications/admin/templates with admin token returns 200 with template array", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/notifications/admin/templates",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(Array.isArray(body.templates)).toBe(true);
      expect(body.templates.length).toBeGreaterThan(0);
    });

    it("Templates include seeded entries with sentCount=0, openedCount=0, openRate=0", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/notifications/admin/templates",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      const body = JSON.parse(res.body);
      const template = body.templates[0];
      expect(template).toHaveProperty("id");
      expect(template).toHaveProperty("templateKey");
      expect(template).toHaveProperty("category");
      expect(template).toHaveProperty("title");
      expect(template).toHaveProperty("body");
      expect(template).toHaveProperty("isEnabled");
      expect(template.sentCount).toBe(0);
      expect(template.openedCount).toBe(0);
      expect(template.openRate).toBe(0);
    });

    it("PUT /api/notifications/admin/templates/:id with { title: 'Updated' } updates title", async () => {
      // Get a template ID
      const listRes = await app.inject({
        method: "GET",
        url: "/api/notifications/admin/templates",
        headers: { authorization: `Bearer ${adminToken}` },
      });
      const templates = JSON.parse(listRes.body).templates;
      const templateId = templates[0].id;

      const res = await app.inject({
        method: "PUT",
        url: `/api/notifications/admin/templates/${templateId}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { title: "Updated Title" },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.title).toBe("Updated Title");
    });

    it("PUT /api/notifications/admin/templates/:id with { isEnabled: false } disables template", async () => {
      const listRes = await app.inject({
        method: "GET",
        url: "/api/notifications/admin/templates",
        headers: { authorization: `Bearer ${adminToken}` },
      });
      const templates = JSON.parse(listRes.body).templates;
      const templateId = templates[0].id;

      const res = await app.inject({
        method: "PUT",
        url: `/api/notifications/admin/templates/${templateId}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { isEnabled: false },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.isEnabled).toBe(false);
    });

    it("GET /api/notifications/admin/templates with member token returns 403", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/notifications/admin/templates",
        headers: { authorization: `Bearer ${memberToken}` },
      });

      expect(res.statusCode).toBe(403);
    });

    it("POST /api/notifications/admin/seed-templates with owner token returns 200", async () => {
      // Already seeded in beforeEach, but verify it's idempotent
      const res = await app.inject({
        method: "POST",
        url: "/api/notifications/admin/seed-templates",
        headers: { authorization: `Bearer ${ownerToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
    });
  });

  // =========================================================================
  // 5. Send to Segment
  // =========================================================================
  describe("Send to Segment", () => {
    it("POST /api/notifications/admin/send-segment with valid segment returns 200", async () => {
      // Create a member_profile with a known segment for the test member
      await app.db.insert(schema.memberProfiles).values({
        userId: memberId,
        segment: "espartano",
        segmentUpdatedAt: new Date(),
      });

      const res = await app.inject({
        method: "POST",
        url: "/api/notifications/admin/send-segment",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          title: "Test Segment Send",
          body: "Test body for segment notification",
          segmentIds: ["espartano"],
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.queued).toBeGreaterThanOrEqual(1);
    });

    it("POST /api/notifications/admin/send-segment with member token returns 403", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/notifications/admin/send-segment",
        headers: { authorization: `Bearer ${memberToken}` },
        payload: {
          title: "Unauthorized",
          body: "Should not work",
          segmentIds: ["espartano"],
        },
      });

      expect(res.statusCode).toBe(403);
    });

    it("POST /api/notifications/admin/send-segment with segment that has no members returns queued: 0", async () => {
      // No member_profiles with 'ghost' segment in test data
      const res = await app.inject({
        method: "POST",
        url: "/api/notifications/admin/send-segment",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          title: "Empty Segment",
          body: "No members in ghost segment",
          segmentIds: ["ghost"],
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.queued).toBe(0);
    });
  });

  // =========================================================================
  // 6. Queue Processing (service-level)
  // =========================================================================
  describe("Queue Processing", () => {
    it("queueNotification creates a pending notification", async () => {
      const service = new NotificationService(app.db, app.log, true);

      const notificationId = await service.queueNotification({
        userId: memberId,
        templateKey: "morning_energy",
      });

      expect(notificationId).toBeGreaterThan(0);

      // Verify it's in the DB with status 'pending'
      const [row] = await app.db
        .select()
        .from(schema.pendingNotifications)
        .where(eq(schema.pendingNotifications.id, notificationId));
      expect(row).toBeDefined();
      expect(row.status).toBe("pending");
      expect(row.userId).toBe(memberId);
    });

    it("processQueue sends pending notifications and marks as sent (DRY_RUN)", async () => {
      const service = new NotificationService(app.db, app.log, true);

      // Register a device token for the member
      await service.registerToken(
        memberId,
        "fcm-queue-test-token-abcdef123456789012345678901234567890",
        "android",
      );

      // Queue a notification
      const notificationId = await service.queueNotification({
        userId: memberId,
        templateKey: "morning_energy",
      });
      expect(notificationId).toBeGreaterThan(0);

      // Process the queue
      const result = await service.processQueue();
      expect(result.sent).toBeGreaterThanOrEqual(1);

      // Verify the notification is now 'sent'
      const [row] = await app.db
        .select()
        .from(schema.pendingNotifications)
        .where(eq(schema.pendingNotifications.id, notificationId));
      expect(row.status).toBe("sent");
      expect(row.sentAt).not.toBeNull();

      // Verify sentCount on the template was incremented
      const [template] = await app.db
        .select()
        .from(schema.notificationTemplates)
        .where(
          eq(schema.notificationTemplates.templateKey, "morning_energy"),
        );
      expect(template.sentCount).toBeGreaterThanOrEqual(1);
    });

    it("purgeOldNotifications removes sent notifications older than 24h", async () => {
      const service = new NotificationService(app.db, app.log, true);

      // Register a token and queue + process a notification
      await service.registerToken(
        memberId,
        "fcm-purge-test-token-abcdef123456789012345678901234567890",
        "android",
      );
      const notificationId = await service.queueNotification({
        userId: memberId,
        templateKey: "weekly_summary",
      });
      expect(notificationId).toBeGreaterThan(0);

      await service.processQueue();

      // Backdate the notification's createdAt to 25 hours ago
      const pastDate = new Date(Date.now() - 25 * 60 * 60 * 1000);
      await app.db
        .update(schema.pendingNotifications)
        .set({ createdAt: pastDate })
        .where(eq(schema.pendingNotifications.id, notificationId));

      // Purge old notifications
      const deletedCount = await service.purgeOldNotifications();
      expect(deletedCount).toBeGreaterThanOrEqual(1);

      // Verify the notification is gone
      const rows = await app.db
        .select()
        .from(schema.pendingNotifications)
        .where(eq(schema.pendingNotifications.id, notificationId));
      expect(rows).toHaveLength(0);
    });

    it("queueNotification returns -1 when template is disabled", async () => {
      const service = new NotificationService(app.db, app.log, true);

      // Disable the morning_energy template
      await app.db
        .update(schema.notificationTemplates)
        .set({ isEnabled: false })
        .where(
          eq(
            schema.notificationTemplates.templateKey,
            "morning_energy",
          ),
        );

      const notificationId = await service.queueNotification({
        userId: memberId,
        templateKey: "morning_energy",
      });

      expect(notificationId).toBe(-1);
    });

    it("queueNotification returns -1 when user preference disabled for category", async () => {
      const service = new NotificationService(app.db, app.log, true);

      // Disable entrenamiento category for this member
      await service.updatePreference(memberId, "entrenamiento", false);

      // morning_energy is in 'entrenamiento' category
      const notificationId = await service.queueNotification({
        userId: memberId,
        templateKey: "morning_energy",
      });

      expect(notificationId).toBe(-1);
    });

    it("processQueue marks as failed when no device tokens registered", async () => {
      const service = new NotificationService(app.db, app.log, true);

      // Queue a notification (member has no device tokens)
      const notificationId = await service.queueNotification({
        userId: memberId,
        templateKey: "morning_energy",
      });
      expect(notificationId).toBeGreaterThan(0);

      // Process queue — should fail due to no tokens
      const result = await service.processQueue();
      expect(result.failed).toBeGreaterThanOrEqual(1);

      // Verify the notification is marked as 'failed'
      const [row] = await app.db
        .select()
        .from(schema.pendingNotifications)
        .where(eq(schema.pendingNotifications.id, notificationId));
      expect(row.status).toBe("failed");
      expect(row.errorMessage).toContain("No device tokens");
    });
  });
});
