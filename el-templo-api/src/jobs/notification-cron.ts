/**
 * Notification Cron Jobs
 *
 * Schedules all notification-related cron jobs:
 * 1. Queue processor — every 15 min (per D-10)
 * 2. Batch segment recalculation with transition detection — daily at 03:00 (per D-09)
 * 3. Morning energy reminder — daily at 08:00 (per D-05)
 * 4. Weekly summary — Saturday at 15:00 (per D-07)
 * 5. Program renewal warning — daily at 03:00 (per D-08/D-16)
 *
 * All times use America/Argentina/Buenos_Aires timezone.
 */

import cron from "node-cron";
import pino from "pino";
import { eq, and, sql, isNotNull, gte, lte } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type * as schema from "../db/schema";
import * as s from "../db/schema";
import { NotificationService } from "../modules/notifications/service";
import { SegmentationService } from "../modules/segmentation/service";
// segment_transition template keys are defined in SEGMENT_TRANSITION_TEMPLATES
import { SEGMENT_TRANSITION_TEMPLATES } from "../modules/notifications/types";
import type { MemberSegment } from "../modules/segmentation/types";

const log = pino({ name: "notification-cron" });

/** Thirty days in milliseconds — ghost re-attempt interval */
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Determine the transition key for the SEGMENT_TRANSITION_TEMPLATES map.
 * Returns null if no notification should fire for this transition.
 */
function getTransitionTemplateKey(
  oldSegment: string | null,
  newSegment: string,
): string | null {
  // Any -> En Riesgo
  if (newSegment === "en_riesgo" && oldSegment !== "en_riesgo") {
    return SEGMENT_TRANSITION_TEMPLATES["any_to_en_riesgo"] ?? null;
  }

  // En Riesgo -> Ghost
  if (newSegment === "ghost" && oldSegment === "en_riesgo") {
    return SEGMENT_TRANSITION_TEMPLATES["en_riesgo_to_ghost"] ?? null;
  }

  // Recovery: (en_riesgo | ghost) -> (intermitente | espartano)
  if (
    (oldSegment === "en_riesgo" || oldSegment === "ghost") &&
    (newSegment === "intermitente" || newSegment === "espartano")
  ) {
    return SEGMENT_TRANSITION_TEMPLATES["recovery_to_active"] ?? null;
  }

  // Any -> Espartano (when wasn't already espartano)
  if (newSegment === "espartano" && oldSegment !== "espartano") {
    return SEGMENT_TRANSITION_TEMPLATES["any_to_espartano"] ?? null;
  }

  return null;
}

export function startNotificationJobs(db: MySql2Database<typeof schema>) {
  // ── 1. Queue Processor — every 15 minutes (per D-10) ─────────────────
  cron.schedule("*/15 * * * *", async () => {
    const notificationService = new NotificationService(db, log);
    try {
      await notificationService.initFirebase();
      const result = await notificationService.processQueue();
      if (result.sent > 0 || result.failed > 0) {
        log.info(result, "Notification queue processed");
      }

      // Purge old sent/failed notifications (per D-11)
      const purged = await notificationService.purgeOldNotifications();
      if (purged > 0) {
        log.info({ purged }, "Old notifications purged");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      log.error({ err: message }, "Queue processor cron failed");
    }
  });

  // ── 2. Batch Segment Recalculation — daily at 03:00 Argentina (per D-09) ──
  cron.schedule(
    "0 3 * * *",
    async () => {
      const notificationService = new NotificationService(db, log);
      const segmentationService = new SegmentationService(db, log);

      try {
        // Fetch ALL member profiles with their current segment
        const profiles = await db
          .select({
            userId: s.memberProfiles.userId,
            segment: s.memberProfiles.segment,
            ghostReattemptCount: s.memberProfiles.ghostReattemptCount,
            lastGhostReattemptAt: s.memberProfiles.lastGhostReattemptAt,
          })
          .from(s.memberProfiles)
          .where(isNotNull(s.memberProfiles.onboardingCompletedAt));

        let transitionsFound = 0;
        let notificationsQueued = 0;
        let ghostReattempts = 0;

        for (const profile of profiles) {
          try {
            const oldSegment = profile.segment as MemberSegment | null;

            // Calculate new segment (bypass cooldown by calling calculateSegment directly)
            const newSegment =
              await segmentationService.calculateSegment(profile.userId);

            // Persist the new segment
            await db
              .update(s.memberProfiles)
              .set({
                segment: newSegment,
                segmentUpdatedAt: new Date(),
              })
              .where(eq(s.memberProfiles.userId, profile.userId));

            // Check for transition
            if (oldSegment !== newSegment) {
              transitionsFound++;

              const templateKey = getTransitionTemplateKey(
                oldSegment,
                newSegment,
              );
              if (templateKey) {
                try {
                  await notificationService.queueNotification({
                    userId: profile.userId,
                    templateKey,
                  });
                  notificationsQueued++;
                } catch (queueErr: unknown) {
                  const qMsg =
                    queueErr instanceof Error
                      ? queueErr.message
                      : "Unknown error";
                  log.warn(
                    { err: qMsg, userId: profile.userId, templateKey },
                    "Failed to queue segment transition notification",
                  );
                }
              }
            }

            // Ghost monthly re-attempt (per D-04)
            if (
              newSegment === "ghost" &&
              oldSegment === "ghost" // No transition — member was already ghost
            ) {
              const reattemptCount = profile.ghostReattemptCount ?? 0;
              const lastReattempt = profile.lastGhostReattemptAt;

              const isEligible =
                reattemptCount < 3 &&
                (lastReattempt === null ||
                  Date.now() - lastReattempt.getTime() >= THIRTY_DAYS_MS);

              if (isEligible) {
                try {
                  await notificationService.queueNotification({
                    userId: profile.userId,
                    templateKey: "ghost_monthly_reattempt",
                  });

                  // Update ghost reattempt tracking
                  await db
                    .update(s.memberProfiles)
                    .set({
                      ghostReattemptCount: reattemptCount + 1,
                      lastGhostReattemptAt: new Date(),
                    })
                    .where(eq(s.memberProfiles.userId, profile.userId));

                  ghostReattempts++;
                } catch (ghostErr: unknown) {
                  const gMsg =
                    ghostErr instanceof Error
                      ? ghostErr.message
                      : "Unknown error";
                  log.warn(
                    { err: gMsg, userId: profile.userId },
                    "Failed to queue ghost re-attempt notification",
                  );
                }
              }
            }
          } catch (memberErr: unknown) {
            const mMsg =
              memberErr instanceof Error
                ? memberErr.message
                : "Unknown error";
            log.warn(
              { err: mMsg, userId: profile.userId },
              "Segment recalc failed for member",
            );
          }
        }

        log.info(
          {
            totalProcessed: profiles.length,
            transitionsFound,
            notificationsQueued,
            ghostReattempts,
          },
          "Batch segment recalculation complete",
        );

        // ── Program Renewal Warning (per D-08, D-16) ──
        // Check for active enrollments expiring in 7 days
        try {
          const sevenDaysFromNow = new Date(
            Date.now() + 7 * 24 * 60 * 60 * 1000,
          );
          const sixDaysFromNow = new Date(
            Date.now() + 6 * 24 * 60 * 60 * 1000,
          );

          // enrolledAt + (durationWeeks * 7 days) = expiryDate
          // We want expiryDate to be ~7 days from now (check within a 1-day window)
          const renewalEnrollments = await db
            .select({
              userId: s.programEnrollments.userId,
              enrollmentId: s.programEnrollments.id,
            })
            .from(s.programEnrollments)
            .innerJoin(
              s.microPrograms,
              eq(s.programEnrollments.programId, s.microPrograms.id),
            )
            .where(
              and(
                eq(s.programEnrollments.status, "active"),
                sql`DATE_ADD(${s.programEnrollments.enrolledAt}, INTERVAL ${s.microPrograms.durationWeeks} * 7 DAY) BETWEEN ${sixDaysFromNow} AND ${sevenDaysFromNow}`,
              ),
            );

          let renewalWarnings = 0;
          for (const enrollment of renewalEnrollments) {
            try {
              await notificationService.queueNotification({
                userId: enrollment.userId,
                templateKey: "program_renewal_warning",
              });
              renewalWarnings++;
            } catch (renewErr: unknown) {
              const rMsg =
                renewErr instanceof Error
                  ? renewErr.message
                  : "Unknown error";
              log.warn(
                { err: rMsg, userId: enrollment.userId },
                "Failed to queue renewal warning notification",
              );
            }
          }

          if (renewalWarnings > 0) {
            log.info({ renewalWarnings }, "Program renewal warnings queued");
          }
        } catch (renewalErr: unknown) {
          const rMsg =
            renewalErr instanceof Error
              ? renewalErr.message
              : "Unknown error";
          log.error(
            { err: rMsg },
            "Program renewal warning check failed",
          );
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        log.error({ err: message }, "Batch segment recalculation cron failed");
      }
    },
    { timezone: "America/Argentina/Buenos_Aires" },
  );

  // ── 3. Morning Energy Reminder — daily at 08:00 Argentina (per D-05) ──
  cron.schedule(
    "0 8 * * *",
    async () => {
      const notificationService = new NotificationService(db, log);

      try {
        // Get onboarded members who haven't answered today's energy check-in
        // Performance: single query with NOT IN subquery
        const eligibleMembers = await db
          .select({ userId: s.memberProfiles.userId })
          .from(s.memberProfiles)
          .where(
            and(
              isNotNull(s.memberProfiles.onboardingCompletedAt),
              sql`${s.memberProfiles.userId} NOT IN (
                SELECT ${s.checkInResponses.userId}
                FROM ${s.checkInResponses}
                WHERE ${s.checkInResponses.questionType} = 'energy'
                  AND ${s.checkInResponses.date} = DATE_FORMAT(NOW(), '%Y-%m-%d')
              )`,
            ),
          );

        let queued = 0;
        for (const member of eligibleMembers) {
          try {
            await notificationService.queueNotification({
              userId: member.userId,
              templateKey: "morning_energy",
            });
            queued++;
          } catch (queueErr: unknown) {
            const qMsg =
              queueErr instanceof Error
                ? queueErr.message
                : "Unknown error";
            log.warn(
              { err: qMsg, userId: member.userId },
              "Failed to queue morning energy reminder",
            );
          }
        }

        log.info(
          { eligible: eligibleMembers.length, queued },
          "Morning energy reminders processed",
        );
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        log.error({ err: message }, "Morning energy reminder cron failed");
      }
    },
    { timezone: "America/Argentina/Buenos_Aires" },
  );

  // ── 4. Weekly Summary — Saturday at 15:00 Argentina (per D-07) ────────
  cron.schedule(
    "0 15 * * 6",
    async () => {
      const notificationService = new NotificationService(db, log);

      try {
        // Get all onboarded members
        const members = await db
          .select({ userId: s.memberProfiles.userId })
          .from(s.memberProfiles)
          .where(isNotNull(s.memberProfiles.onboardingCompletedAt));

        let queued = 0;
        for (const member of members) {
          try {
            await notificationService.queueNotification({
              userId: member.userId,
              templateKey: "weekly_summary",
            });
            queued++;
          } catch (queueErr: unknown) {
            const qMsg =
              queueErr instanceof Error
                ? queueErr.message
                : "Unknown error";
            log.warn(
              { err: qMsg, userId: member.userId },
              "Failed to queue weekly summary notification",
            );
          }
        }

        log.info(
          { totalMembers: members.length, queued },
          "Weekly summary notifications processed",
        );
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        log.error({ err: message }, "Weekly summary cron failed");
      }
    },
    { timezone: "America/Argentina/Buenos_Aires" },
  );

  // ── 5. Auto-seed templates on startup ────────────────────────────────
  const seedService = new NotificationService(db, log);
  seedService
    .seedTemplates()
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : "Unknown error";
      log.error({ err: message }, "Template seed failed");
    });

  log.info("Notification cron jobs scheduled");
}
