/**
 * Notification Cron Jobs
 *
 * Schedules all notification-related cron jobs:
 * 1. Queue processor — every 15 min (per D-10) [tz-agnostic]
 * 2. Batch segment recalculation with transition detection — daily at 03:00 AR (per D-09)
 * 3. Morning energy reminder — daily at 08:00 in each branch's timezone (per D-05)
 * 4. Weekly summary — Saturday at 15:00 in each branch's timezone (per D-07)
 * 5. Program renewal warning — daily at 03:00 AR (per D-08/D-16)
 *
 * Jobs 3 and 4 are user-facing: they fire at the member's branch local time,
 * so a BCN member gets their morning ping at 08:00 Madrid, not 08:00 AR.
 * Internal batch jobs (1, 2, 5) stay anchored to AR to avoid redundant runs
 * — they don't surface a time-of-day to users.
 */

import cron from "node-cron";
import pino from "pino";
import { eq, and, sql, isNotNull, gte, lte, inArray } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type * as schema from "../db/schema";
import * as s from "../db/schema";
import { NotificationService } from "../modules/notifications/service";
import { deriveCoveredUntil } from "../modules/subscriptions/service";
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
 *
 * Phase 136 (D-10): rewired to the 4 Attendance bands. `newSegment` can be
 * null (calculateSegment returns null for <1 month tenure or no active plan),
 * in which case no transition notification fires.
 */
function getTransitionTemplateKey(
  oldSegment: MemberSegment | null,
  newSegment: MemberSegment | null,
): string | null {
  // No label calculated (<1 month / no plan) → never notify.
  if (newSegment === null) {
    return null;
  }

  // Any -> Alerta (low attendance) — preserves "Tu práctica te espera".
  if (newSegment === "alerta" && oldSegment !== "alerta") {
    return SEGMENT_TRANSITION_TEMPLATES["any_to_alerta"] ?? null;
  }

  // Alerta -> Ausente (0% attendance) — preserves "El Templo no cierra".
  if (newSegment === "ausente" && oldSegment === "alerta") {
    return SEGMENT_TRANSITION_TEMPLATES["alerta_to_ausente"] ?? null;
  }

  // Recovery: (alerta | ausente) -> (optima | regular) — "¡Bienvenido de vuelta!".
  if (
    (oldSegment === "alerta" || oldSegment === "ausente") &&
    (newSegment === "optima" || newSegment === "regular")
  ) {
    return SEGMENT_TRANSITION_TEMPLATES["recovery_to_active"] ?? null;
  }

  // Any -> Óptima (when wasn't already óptima) — "¡Semana increíble!".
  if (newSegment === "optima" && oldSegment !== "optima") {
    return SEGMENT_TRANSITION_TEMPLATES["any_to_optima"] ?? null;
  }

  return null;
}

/**
 * Return distinct timezones across active, non-virtual branches.
 * Used to schedule one user-facing cron per local clock.
 */
async function getDistinctBranchTimezones(
  db: MySql2Database<typeof schema>,
): Promise<string[]> {
  const rows = await db
    .selectDistinct({ tz: s.branches.timezone })
    .from(s.branches)
    .where(and(eq(s.branches.isActive, true), eq(s.branches.isVirtual, false)));
  const tzs = rows.map((r) => r.tz);
  return tzs.length > 0 ? tzs : ["America/Argentina/Buenos_Aires"];
}

/**
 * Queue the morning energy reminder for onboarded members in the given
 * branch timezone who haven't answered today's check-in. "Today" is the
 * date in `tz` so BCN and AR each evaluate their own day boundary.
 */
async function runMorningEnergyForTz(
  db: MySql2Database<typeof schema>,
  tz: string,
): Promise<{ eligible: number; queued: number }> {
  const notificationService = new NotificationService(db, log);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: tz });

  const eligibleMembers = await db
    .select({ userId: s.memberProfiles.userId })
    .from(s.memberProfiles)
    .innerJoin(s.users, eq(s.users.id, s.memberProfiles.userId))
    .innerJoin(s.branches, eq(s.branches.id, s.users.branchId))
    .where(
      and(
        isNotNull(s.memberProfiles.onboardingCompletedAt),
        eq(s.branches.timezone, tz),
        sql`${s.memberProfiles.userId} NOT IN (
          SELECT ${s.checkInResponses.userId}
          FROM ${s.checkInResponses}
          WHERE ${s.checkInResponses.questionType} = 'energy'
            AND ${s.checkInResponses.date} = ${today}
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
        queueErr instanceof Error ? queueErr.message : "Unknown error";
      log.warn(
        { err: qMsg, userId: member.userId, tz },
        "Failed to queue morning energy reminder",
      );
    }
  }

  return { eligible: eligibleMembers.length, queued };
}

/**
 * Queue weekly summary notifications for onboarded members in the given
 * branch timezone.
 */
async function runWeeklySummaryForTz(
  db: MySql2Database<typeof schema>,
  tz: string,
): Promise<{ total: number; queued: number }> {
  const notificationService = new NotificationService(db, log);

  const members = await db
    .select({ userId: s.memberProfiles.userId })
    .from(s.memberProfiles)
    .innerJoin(s.users, eq(s.users.id, s.memberProfiles.userId))
    .innerJoin(s.branches, eq(s.branches.id, s.users.branchId))
    .where(
      and(
        isNotNull(s.memberProfiles.onboardingCompletedAt),
        eq(s.branches.timezone, tz),
      ),
    );

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
        queueErr instanceof Error ? queueErr.message : "Unknown error";
      log.warn(
        { err: qMsg, userId: member.userId, tz },
        "Failed to queue weekly summary notification",
      );
    }
  }

  return { total: members.length, queued };
}

/**
 * Plan Renewal Warning thresholds (per D-02). Each threshold maps to a
 * dedicated template under the `planes` category. The exact-date band
 * (end_date = today + days) is the per-threshold idempotency mechanism: a daily
 * 03:00 AR cron fires each threshold exactly once per renewal cycle without any
 * tracking column.
 */
const PLAN_RENEWAL_THRESHOLDS = [
  { days: 7, key: "plan_renewal_warning_7d" },
  { days: 3, key: "plan_renewal_warning_3d" },
  { days: 0, key: "plan_renewal_warning_expired" },
] as const;

/**
 * Enqueue a "Planes" renewal push for members whose covered-until lands exactly
 * 7 days, 3 days, or 0 days (expiry day) from today (per D-02, D-03, D-05).
 *
 * Suppression (D-05): a member who already renewed has a `scheduled` successor
 * extending coverage beyond the threshold date, so `deriveCoveredUntil` returns
 * the further date (not the threshold) and the member is skipped. The
 * per-category preference gate inside `queueNotification` honors the member's
 * "Planes" opt-out (D-02), so the cron never writes `pending_notifications`
 * directly. Never throws: a bad candidate logs and continues.
 *
 * @returns the number of notifications actually enqueued (skips not counted).
 */
export async function runPlanRenewalWarnings(
  db: MySql2Database<typeof schema>,
  notificationService: NotificationService,
): Promise<number> {
  let totalQueued = 0;

  for (const { days, key } of PLAN_RENEWAL_THRESHOLDS) {
    // Candidate subscriptions whose end_date is exactly CURDATE() + days. Use a
    // SQL DATE comparison (never JS Date math) so we stay in the AR-local DATE
    // domain that matches `subscriptions.end_date`.
    const candidates = await db
      .selectDistinct({
        userId: s.subscriptions.userId,
        target: sql<string>`DATE_FORMAT(DATE_ADD(CURDATE(), INTERVAL ${days} DAY), '%Y-%m-%d')`,
      })
      .from(s.subscriptions)
      .where(
        and(
          inArray(s.subscriptions.status, ["active", "scheduled"]),
          sql`${s.subscriptions.endDate} = DATE_ADD(CURDATE(), INTERVAL ${days} DAY)`,
        ),
      );

    for (const candidate of candidates) {
      try {
        // D-05 suppression: enqueue ONLY when the chain's covered-until equals
        // the threshold date. A scheduled successor pushes covered-until past
        // the threshold → !== target → skip (the member already renewed).
        const coveredUntil = await deriveCoveredUntil(db, candidate.userId);
        if (coveredUntil !== candidate.target) {
          continue;
        }

        // queueNotification returns -1 when it skips (template disabled, member
        // silenced the `planes` category, or no device token); only count real
        // enqueues.
        const queued = await notificationService.queueNotification({
          userId: candidate.userId,
          templateKey: key,
        });
        if (queued >= 0) {
          totalQueued++;
        }
      } catch (itemErr: unknown) {
        const iMsg =
          itemErr instanceof Error ? itemErr.message : "Unknown error";
        log.warn(
          { err: iMsg, userId: candidate.userId, templateKey: key },
          "Failed to queue plan renewal warning",
        );
      }
    }
  }

  if (totalQueued > 0) {
    log.info({ totalQueued }, "Plan renewal warnings queued");
  }

  return totalQueued;
}

export async function startNotificationJobs(
  db: MySql2Database<typeof schema>,
): Promise<void> {
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

            // Calculate new Attendance label (bypass cooldown by calling
            // calculateSegment directly). Returns null for <1 month tenure or
            // members without an active plan (D-07/D-08) — persisting null is
            // valid and simply means "no label".
            const newSegment = await segmentationService.calculateSegment(
              profile.userId,
            );

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

            // Monthly re-attempt for members who stay Ausente (per D-10).
            // Reuses ghost_reattempt_count / last_ghost_reattempt_at and the
            // ghost_monthly_reattempt template unchanged.
            if (
              newSegment === "ausente" &&
              oldSegment === "ausente" // No transition — member was already ausente
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
              memberErr instanceof Error ? memberErr.message : "Unknown error";
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
          const sixDaysFromNow = new Date(Date.now() + 6 * 24 * 60 * 60 * 1000);

          // enrolledAt + (durationWeeks * 7 days) = expiryDate
          // We want expiryDate to be ~7 days from now (check within a 1-day window)
          const renewalEnrollments = await db
            .select({
              userId: s.programEnrollments.userId,
              enrollmentId: s.programEnrollments.id,
            })
            .from(s.programEnrollments)
            .innerJoin(
              s.programs,
              eq(s.programEnrollments.programId, s.programs.id),
            )
            .where(
              and(
                eq(s.programEnrollments.status, "active"),
                sql`DATE_ADD(${s.programEnrollments.enrolledAt}, INTERVAL ${s.programs.durationWeeks} * 7 DAY) BETWEEN ${sixDaysFromNow} AND ${sevenDaysFromNow}`,
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
                renewErr instanceof Error ? renewErr.message : "Unknown error";
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
            renewalErr instanceof Error ? renewalErr.message : "Unknown error";
          log.error({ err: rMsg }, "Program renewal warning check failed");
        }

        // ── Plan Renewal Warning (per D-02, D-03, D-05) ──
        // Enqueue a "Planes" push at 7d / 3d / expiry-day before the member's
        // covered-until, suppressing anyone who already renewed (D-05).
        try {
          await runPlanRenewalWarnings(db, notificationService);
        } catch (planErr: unknown) {
          const pMsg =
            planErr instanceof Error ? planErr.message : "Unknown error";
          log.error({ err: pMsg }, "Plan renewal warning check failed");
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        log.error({ err: message }, "Batch segment recalculation cron failed");
      }
    },
    { timezone: "America/Argentina/Buenos_Aires" },
  );

  // ── 3. Morning Energy Reminder — 08:00 in each branch's local time ────
  // ── 4. Weekly Summary — Saturday 15:00 in each branch's local time ────
  //
  // These are user-facing, so one cron fires per distinct branch timezone
  // and targets only the members whose branch uses that tz.
  const tzs = await getDistinctBranchTimezones(db);

  for (const tz of tzs) {
    cron.schedule(
      "0 8 * * *",
      async () => {
        try {
          const { eligible, queued } = await runMorningEnergyForTz(db, tz);
          log.info(
            { tz, eligible, queued },
            "Morning energy reminders processed",
          );
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : "Unknown error";
          log.error(
            { err: message, tz },
            "Morning energy reminder cron failed",
          );
        }
      },
      { timezone: tz },
    );

    cron.schedule(
      "0 15 * * 6",
      async () => {
        try {
          const { total, queued } = await runWeeklySummaryForTz(db, tz);
          log.info(
            { tz, totalMembers: total, queued },
            "Weekly summary notifications processed",
          );
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : "Unknown error";
          log.error({ err: message, tz }, "Weekly summary cron failed");
        }
      },
      { timezone: tz },
    );
  }

  // ── 5. Auto-seed templates on startup ────────────────────────────────
  const seedService = new NotificationService(db, log);
  seedService.seedTemplates().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "Template seed failed");
  });

  log.info("Notification cron jobs scheduled");
}
