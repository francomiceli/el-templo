/**
 * NotificationService — Push notification queue, FCM delivery, and preference management.
 *
 * Requires: pnpm add firebase-admin
 * Until firebase-admin is installed, the service operates in DRY_RUN mode (logs only).
 *
 * Uses constructor DI pattern (Phase 56 convention).
 */

import { eq, and, lte, sql, inArray } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import type {
  NotificationCategory,
  QueueNotificationInput,
  QueueAdHocInput,
} from "./types";
import { NOTIFICATION_CATEGORIES, TEMPLATE_SEEDS } from "./types";

type DbInstance = MySql2Database<typeof schema>;

/** Batch size for queue processing (per D-10) */
const QUEUE_BATCH_SIZE = 100;

/** Purge sent/failed notifications older than this (ms) — 24 hours per D-11 */
const PURGE_AGE_MS = 24 * 60 * 60 * 1000;

/** Retry delay on FCM failure (ms) — per D-38 */
const RETRY_DELAY_MS = 1000;

/**
 * Minimal interface for FCM messaging so the service compiles without firebase-admin installed.
 * When firebase-admin is available, this is satisfied by admin.messaging().
 */
interface FcmMessaging {
  send(message: {
    token: string;
    notification: { title: string; body: string };
    data: Record<string, string>;
  }): Promise<string>;
}

export class NotificationService {
  private messaging: FcmMessaging | null = null;
  private readonly dryRun: boolean;

  constructor(
    private readonly db: DbInstance,
    private readonly log: FastifyBaseLogger,
    dryRun?: boolean,
  ) {
    this.dryRun = dryRun ?? process.env.DRY_RUN === "true";
  }

  // ── Firebase Initialization ─────────────────────────────────────────────

  /**
   * Initialize Firebase Admin SDK for FCM messaging.
   * Reads FIREBASE_SERVICE_ACCOUNT_BASE64 env var, decodes, and initializes.
   * If DRY_RUN or env var missing, skips initialization (log-only mode).
   */
  async initFirebase(): Promise<void> {
    if (this.dryRun) {
      this.log.info("NotificationService: DRY_RUN mode — FCM sends disabled");
      return;
    }

    const base64Key = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
    if (!base64Key) {
      this.log.warn(
        "NotificationService: FIREBASE_SERVICE_ACCOUNT_BASE64 not set — FCM sends disabled",
      );
      return;
    }

    try {
      // Dynamic import so the module compiles even without firebase-admin installed
      const admin = await import("firebase-admin");
      const serviceAccount = JSON.parse(
        Buffer.from(base64Key, "base64").toString("utf-8"),
      ) as Record<string, unknown>;

      // Only initialize if no app exists yet (avoid duplicate app error)
      const app =
        admin.apps.length > 0
          ? admin.apps[0]
          : admin.initializeApp({
              credential: admin.credential.cert(
                serviceAccount as Parameters<
                  typeof admin.credential.cert
                >[0],
              ),
            });

      if (app) {
        this.messaging = admin.messaging(app) as unknown as FcmMessaging;
        this.log.info("NotificationService: Firebase initialized successfully");
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Unknown initialization error";
      this.log.error(
        { err: message },
        "NotificationService: Failed to initialize Firebase — FCM sends disabled",
      );
    }
  }

  // ── Token Management ────────────────────────────────────────────────────

  /**
   * Register or update an FCM device token for a user.
   * Handles the D-26 on-every-launch token registration pattern.
   * If token already exists (unique constraint), updates userId and updatedAt.
   */
  async registerToken(
    userId: number,
    token: string,
    platform: "android" | "ios",
  ): Promise<void> {
    await this.db.execute(
      sql`INSERT INTO device_tokens (user_id, token, device_platform)
          VALUES (${userId}, ${token}, ${platform})
          ON DUPLICATE KEY UPDATE user_id = ${userId}, updated_at = NOW()`,
    );

    this.log.info({ userId, platform }, "Device token registered");
  }

  /**
   * Remove a device token (called when FCM reports token invalid).
   */
  async removeToken(token: string): Promise<void> {
    await this.db
      .delete(schema.deviceTokens)
      .where(eq(schema.deviceTokens.token, token));

    this.log.info({ token: token.slice(0, 20) + "..." }, "Device token removed");
  }

  // ── Notification Preferences ────────────────────────────────────────────

  /**
   * Get notification preferences for a user.
   * Returns all categories with defaults (true) for any missing rows (per D-19).
   */
  async getUserPreferences(
    userId: number,
  ): Promise<Record<NotificationCategory, boolean>> {
    const rows = await this.db
      .select({
        category: schema.notificationPreferences.category,
        enabled: schema.notificationPreferences.enabled,
      })
      .from(schema.notificationPreferences)
      .where(eq(schema.notificationPreferences.userId, userId));

    // Default all categories to true
    const prefs: Record<NotificationCategory, boolean> = {
      entrenamiento: true,
      programas: true,
      motivacion: true,
      anuncios: true,
    };

    for (const row of rows) {
      const cat = row.category as NotificationCategory;
      if (NOTIFICATION_CATEGORIES.includes(cat)) {
        prefs[cat] = row.enabled;
      }
    }

    return prefs;
  }

  /**
   * Update a single notification preference for a user.
   * Upserts — creates row if not exists, updates if exists.
   */
  async updatePreference(
    userId: number,
    category: NotificationCategory,
    enabled: boolean,
  ): Promise<void> {
    await this.db.execute(
      sql`INSERT INTO notification_preferences (user_id, notification_category, enabled)
          VALUES (${userId}, ${category}, ${enabled})
          ON DUPLICATE KEY UPDATE enabled = ${enabled}, updated_at = NOW()`,
    );

    this.log.info(
      { userId, category, enabled },
      "Notification preference updated",
    );
  }

  // ── Queue Operations ────────────────────────────────────────────────────

  /**
   * Queue a notification using a predefined template.
   * Checks template existence, enabled status, and user preference before queueing.
   *
   * @returns The pending notification ID, or -1 if skipped
   */
  async queueNotification(input: QueueNotificationInput): Promise<number> {
    const { userId, templateKey, scheduledAt, titleOverride, bodyOverride, routeOverride } =
      input;

    // Look up template
    const [template] = await this.db
      .select()
      .from(schema.notificationTemplates)
      .where(eq(schema.notificationTemplates.templateKey, templateKey))
      .limit(1);

    if (!template) {
      this.log.warn({ templateKey }, "Notification template not found — skipping");
      return -1;
    }

    if (!template.isEnabled) {
      this.log.info(
        { templateKey },
        "Notification template disabled — skipping",
      );
      return -1;
    }

    // Check user preference for this template's category
    const prefs = await this.getUserPreferences(userId);
    const category = template.category as NotificationCategory;
    if (!prefs[category]) {
      this.log.info(
        { userId, category, templateKey },
        "User preference disabled for category — skipping",
      );
      return -1;
    }

    // Insert into pending_notifications
    const result = await this.db.insert(schema.pendingNotifications).values({
      userId,
      templateId: template.id,
      title: titleOverride ?? template.title,
      body: bodyOverride ?? template.body,
      route: routeOverride ?? template.route ?? "/mi-templo",
      status: "pending",
      scheduledAt: scheduledAt ?? new Date(),
    });

    const insertId = Number(result[0].insertId);
    this.log.info(
      { userId, templateKey, notificationId: insertId },
      "Notification queued",
    );

    return insertId;
  }

  /**
   * Queue an ad-hoc notification (for admin segment sends).
   * Checks user preference for 'anuncios' category (per D-22).
   *
   * @returns The pending notification ID, or -1 if skipped
   */
  async queueAdHocNotification(input: QueueAdHocInput): Promise<number> {
    const { userId, title, body, category, route, scheduledAt } = input;

    // Check user preference for the notification category
    const prefs = await this.getUserPreferences(userId);
    if (!prefs[category]) {
      this.log.info(
        { userId, category },
        "User preference disabled for ad-hoc category — skipping",
      );
      return -1;
    }

    const result = await this.db.insert(schema.pendingNotifications).values({
      userId,
      templateId: null,
      title,
      body,
      route: route ?? "/mi-templo",
      status: "pending",
      scheduledAt: scheduledAt ?? new Date(),
    });

    const insertId = Number(result[0].insertId);
    this.log.info(
      { userId, category, notificationId: insertId },
      "Ad-hoc notification queued",
    );

    return insertId;
  }

  // ── Queue Processing ────────────────────────────────────────────────────

  /**
   * Process the notification queue — called by cron every 15 min (per D-10).
   * Selects pending notifications where scheduledAt <= now, sends via FCM.
   */
  async processQueue(): Promise<{ sent: number; failed: number }> {
    const now = new Date();
    let sent = 0;
    let failed = 0;

    // Select due notifications
    const notifications = await this.db
      .select()
      .from(schema.pendingNotifications)
      .where(
        and(
          eq(schema.pendingNotifications.status, "pending"),
          lte(schema.pendingNotifications.scheduledAt, now),
        ),
      )
      .orderBy(schema.pendingNotifications.scheduledAt)
      .limit(QUEUE_BATCH_SIZE);

    if (notifications.length === 0) {
      return { sent: 0, failed: 0 };
    }

    this.log.info(
      { count: notifications.length },
      "Processing notification queue",
    );

    for (const notification of notifications) {
      // Get all device tokens for this user
      const tokens = await this.db
        .select({ token: schema.deviceTokens.token })
        .from(schema.deviceTokens)
        .where(eq(schema.deviceTokens.userId, notification.userId));

      if (tokens.length === 0) {
        // No tokens registered — mark as failed
        await this.db
          .update(schema.pendingNotifications)
          .set({
            status: "failed",
            errorMessage: "No device tokens registered",
          })
          .where(eq(schema.pendingNotifications.id, notification.id));

        failed++;
        continue;
      }

      let anySent = false;

      for (const { token } of tokens) {
        const success = await this.sendToDevice(
          token,
          notification.title,
          notification.body,
          notification.route ?? "/mi-templo",
          notification.id,
        );

        if (success) {
          anySent = true;
        }
      }

      if (anySent) {
        // Mark as sent, update sentAt
        await this.db
          .update(schema.pendingNotifications)
          .set({
            status: "sent",
            sentAt: new Date(),
          })
          .where(eq(schema.pendingNotifications.id, notification.id));

        // Increment sentCount on template if applicable (per D-31)
        if (notification.templateId) {
          await this.db.execute(
            sql`UPDATE notification_templates
                SET sent_count = sent_count + 1
                WHERE id = ${notification.templateId}`,
          );
        }

        sent++;
      } else {
        // All tokens failed
        await this.db
          .update(schema.pendingNotifications)
          .set({
            status: "failed",
            errorMessage: "All device tokens failed",
          })
          .where(eq(schema.pendingNotifications.id, notification.id));

        failed++;
      }
    }

    this.log.info({ sent, failed }, "Notification queue processed");
    return { sent, failed };
  }

  // ── FCM Delivery ────────────────────────────────────────────────────────

  /**
   * Send a notification to a single device token via FCM.
   * In DRY_RUN mode, logs the notification and returns true.
   * On invalid token errors, auto-deletes the token (per D-27).
   * Single retry on failure (per D-38).
   */
  async sendToDevice(
    token: string,
    title: string,
    body: string,
    route: string,
    notificationId: number,
  ): Promise<boolean> {
    if (this.dryRun || !this.messaging) {
      this.log.info(
        {
          token: token.slice(0, 20) + "...",
          title,
          route,
          notificationId,
          dryRun: true,
        },
        "DRY_RUN: Would send notification",
      );
      return true;
    }

    const message = {
      token,
      notification: { title, body },
      data: { route, notificationId: String(notificationId) },
    };

    // First attempt
    try {
      await this.messaging.send(message);
      return true;
    } catch (err: unknown) {
      if (this.isInvalidTokenError(err)) {
        await this.removeToken(token);
        return false;
      }

      // Single retry (per D-38)
      this.log.warn(
        { token: token.slice(0, 20) + "...", err: err instanceof Error ? err.message : "Unknown" },
        "FCM send failed — retrying",
      );

      await this.delay(RETRY_DELAY_MS);

      try {
        await this.messaging.send(message);
        return true;
      } catch (retryErr: unknown) {
        if (this.isInvalidTokenError(retryErr)) {
          await this.removeToken(token);
        }

        this.log.error(
          {
            token: token.slice(0, 20) + "...",
            err: retryErr instanceof Error ? retryErr.message : "Unknown",
          },
          "FCM send failed after retry",
        );
        return false;
      }
    }
  }

  // ── Tracking ────────────────────────────────────────────────────────────

  /**
   * Record that a notification was opened by the user (per D-31, D-32).
   * Increments openedCount on the associated template.
   */
  async recordOpened(notificationId: number): Promise<void> {
    // Look up the pending notification to get templateId
    const [notification] = await this.db
      .select({ templateId: schema.pendingNotifications.templateId })
      .from(schema.pendingNotifications)
      .where(eq(schema.pendingNotifications.id, notificationId))
      .limit(1);

    if (!notification?.templateId) {
      this.log.info(
        { notificationId },
        "No template associated with notification — skip open tracking",
      );
      return;
    }

    await this.db.execute(
      sql`UPDATE notification_templates
          SET opened_count = opened_count + 1
          WHERE id = ${notification.templateId}`,
    );

    this.log.info(
      { notificationId, templateId: notification.templateId },
      "Notification opened recorded",
    );
  }

  // ── Maintenance ─────────────────────────────────────────────────────────

  /**
   * Purge sent/failed notifications older than 24 hours (per D-11).
   * Keeps the pending_notifications table small.
   */
  async purgeOldNotifications(): Promise<number> {
    const cutoff = new Date(Date.now() - PURGE_AGE_MS);

    const result = await this.db
      .delete(schema.pendingNotifications)
      .where(
        and(
          inArray(schema.pendingNotifications.status, ["sent", "failed"]),
          lte(schema.pendingNotifications.createdAt, cutoff),
        ),
      );

    const deletedCount = result[0].affectedRows ?? 0;

    if (deletedCount > 0) {
      this.log.info(
        { deletedCount },
        "Purged old notifications from queue",
      );
    }

    return deletedCount;
  }

  /**
   * Seed notification templates from TEMPLATE_SEEDS.
   * Uses INSERT IGNORE to skip already-existing template keys.
   * Called during migration/startup.
   */
  async seedTemplates(): Promise<void> {
    for (const seed of TEMPLATE_SEEDS) {
      await this.db.execute(
        sql`INSERT IGNORE INTO notification_templates
            (template_key, notification_category, title, body, route)
            VALUES (${seed.templateKey}, ${seed.category}, ${seed.title}, ${seed.body}, ${seed.route})`,
      );
    }

    this.log.info(
      { count: TEMPLATE_SEEDS.length },
      "Notification templates seeded",
    );
  }

  // ── Private Helpers ─────────────────────────────────────────────────────

  /**
   * Check if an FCM error indicates an invalid/expired token.
   */
  private isInvalidTokenError(err: unknown): boolean {
    if (!(err instanceof Error)) return false;
    const message = err.message.toLowerCase();
    return (
      message.includes("registration-token-not-valid") ||
      message.includes("invalid-registration-token") ||
      message.includes("not-registered")
    );
  }

  /**
   * Simple delay utility for retry backoff.
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
