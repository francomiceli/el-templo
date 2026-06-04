/**
 * Segmentation Service
 *
 * Calculates behavioral segments for members based on attendance frequency,
 * app usage, and subscription plan budget. Segments are plan-relative
 * (percentage of classesPerWeek budget) and recalculate on login.
 *
 * Uses constructor DI pattern (Phase 56 convention).
 */

import { MySql2Database } from "drizzle-orm/mysql2";
import { eq, and, gte, sql, desc, inArray } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import type { MemberSegment, SegmentThresholds } from "./types";
import { SEGMENT_SETTINGS_KEYS, SEGMENT_DEFAULTS } from "./types";

/** Minimum app usage signals (logins + session completions) to qualify as Digital Warrior */
const DIGITAL_WARRIOR_MIN_APP_USAGE = 4;

/** Skip recalculation if segment was updated within this many milliseconds */
const RECALC_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

export class SegmentationService {
  constructor(
    private db: MySql2Database<typeof schema>,
    private log: FastifyBaseLogger,
  ) {}

  /**
   * Load segment thresholds from system_settings.
   * Falls back to SEGMENT_DEFAULTS for any missing key.
   */
  async getThresholds(): Promise<SegmentThresholds> {
    const keys = Object.values(SEGMENT_SETTINGS_KEYS);

    const rows = await this.db
      .select({
        key: schema.systemSettings.settingKey,
        value: schema.systemSettings.settingValue,
      })
      .from(schema.systemSettings)
      .where(inArray(schema.systemSettings.settingKey, [...keys]));

    const settingsMap = new Map<string, string>();
    for (const row of rows) {
      settingsMap.set(row.key, row.value);
    }

    const parseOrDefault = (key: string, defaultVal: number): number => {
      const raw = settingsMap.get(key);
      if (raw === undefined) return defaultVal;
      const parsed = parseInt(raw, 10);
      return Number.isNaN(parsed) ? defaultVal : parsed;
    };

    return {
      espartanoPct: parseOrDefault(
        SEGMENT_SETTINGS_KEYS.ESPARTANO_PCT,
        SEGMENT_DEFAULTS.ESPARTANO_PCT,
      ),
      intermitentePct: parseOrDefault(
        SEGMENT_SETTINGS_KEYS.INTERMITENTE_PCT,
        SEGMENT_DEFAULTS.INTERMITENTE_PCT,
      ),
      enRiesgoWeeks: parseOrDefault(
        SEGMENT_SETTINGS_KEYS.EN_RIESGO_WEEKS,
        SEGMENT_DEFAULTS.EN_RIESGO_WEEKS,
      ),
      ghostWeeks: parseOrDefault(
        SEGMENT_SETTINGS_KEYS.GHOST_WEEKS,
        SEGMENT_DEFAULTS.GHOST_WEEKS,
      ),
      nuevoDays: parseOrDefault(
        SEGMENT_SETTINGS_KEYS.NUEVO_DAYS,
        SEGMENT_DEFAULTS.NUEVO_DAYS,
      ),
      windowDays: parseOrDefault(
        SEGMENT_SETTINGS_KEYS.WINDOW_DAYS,
        SEGMENT_DEFAULTS.WINDOW_DAYS,
      ),
      frequencyZeroVisitWindowDays: parseOrDefault(
        SEGMENT_SETTINGS_KEYS.FREQUENCY_ZERO_VISIT_WINDOW_DAYS,
        SEGMENT_DEFAULTS.FREQUENCY_ZERO_VISIT_WINDOW_DAYS,
      ),
    };
  }

  /**
   * Calculate the behavioral segment for a member.
   *
   * Priority order (per D-02 through D-10):
   * 1. Nuevo — first N days after registration (overrides all)
   * 2. Ghost — inactive 8+ weeks (no attendance, no app usage)
   * 3. En Riesgo — inactive 2-8 weeks
   * 4. Digital Warrior — low physical attendance but high app usage
   * 5. Espartano — 80%+ of plan budget used
   * 6. Intermitente — 40-80% of plan budget used
   * 7. En Riesgo — <40% of plan budget (fallback)
   */
  async calculateSegment(
    userId: number,
    opts?: { isFrequencyGoldenCase?: boolean },
  ): Promise<MemberSegment> {
    const thresholds = await this.getThresholds();

    // Step 1: Get user's registration date
    const [user] = await this.db
      .select({ createdAt: schema.users.createdAt })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);

    if (!user) {
      this.log.warn({ userId }, "User not found for segment calculation");
      return "ghost";
    }

    // Step 2: Nuevo check (per D-07) — wins over the golden case so a brand-new
    // member is never forced to en_riesgo for not having shown up yet.
    const daysSinceRegistration =
      (Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24);

    if (daysSinceRegistration < thresholds.nuevoDays) {
      return "nuevo";
    }

    // Step 2b: Frequency golden case (FREQ-05/06, D-123-02). The ONLY frequency
    // → segment override: an ACTIVE (paying) member with 0 visits in the
    // tuneable window (or cooling down) gets `en_riesgo`. Gated on active-paid-
    // sub so it never clobbers non-paying or higher-engagement results, and
    // placed after the nuevo guard so brand-new members stay "nuevo". The fine
    // multi-band → segment mapping is explicitly NOT introduced (deferred).
    //
    // The nightly batch pre-computes the golden-case set once and threads it in
    // via `opts.isFrequencyGoldenCase` (DRY/perf — single batched query). When
    // absent (the login path), the per-user signal is computed inline so the
    // login recalc keeps working without a frequency pre-fetch.
    if (await this.isFrequencyGoldenCase(userId, thresholds, opts)) {
      return "en_riesgo";
    }

    // Step 3: Get last activity dates
    const now = new Date();

    // Last attendance
    const [lastAttendance] = await this.db
      .select({ checkedInAt: schema.attendance.checkedInAt })
      .from(schema.attendance)
      .where(eq(schema.attendance.memberId, userId))
      .orderBy(desc(schema.attendance.checkedInAt))
      .limit(1);

    // Last login
    const [lastLogin] = await this.db
      .select({ loggedInAt: schema.memberLogins.loggedInAt })
      .from(schema.memberLogins)
      .where(eq(schema.memberLogins.userId, userId))
      .orderBy(desc(schema.memberLogins.loggedInAt))
      .limit(1);

    // Last session completion
    const [lastSession] = await this.db
      .select({ completedAt: schema.completedSessions.completedAt })
      .from(schema.completedSessions)
      .where(eq(schema.completedSessions.userId, userId))
      .orderBy(desc(schema.completedSessions.completedAt))
      .limit(1);

    // Step 4: Compute last activity date
    const activityDates: Date[] = [];
    if (lastAttendance) activityDates.push(lastAttendance.checkedInAt);
    if (lastLogin) activityDates.push(lastLogin.loggedInAt);
    if (lastSession) activityDates.push(lastSession.completedAt);

    if (activityDates.length === 0) {
      return "ghost";
    }

    const lastActivityDate = new Date(
      Math.max(...activityDates.map((d) => d.getTime())),
    );

    // Step 5: Weeks since last activity
    const weeksSinceLastActivity =
      (now.getTime() - lastActivityDate.getTime()) / (1000 * 60 * 60 * 24 * 7);

    // Step 6: Ghost check (per D-09)
    if (weeksSinceLastActivity >= thresholds.ghostWeeks) {
      return "ghost";
    }

    // Step 7: En Riesgo from inactivity (per D-09)
    if (weeksSinceLastActivity >= thresholds.enRiesgoWeeks) {
      return "en_riesgo";
    }

    // Step 8: Get subscription plan budget
    const windowStart = new Date(
      now.getTime() - thresholds.windowDays * 24 * 60 * 60 * 1000,
    );

    const [activeSub] = await this.db
      .select({
        classesPerWeek: schema.subscriptionPlans.classesPerWeek,
      })
      .from(schema.subscriptions)
      .innerJoin(
        schema.subscriptionPlans,
        eq(schema.subscriptions.planId, schema.subscriptionPlans.id),
      )
      .where(
        and(
          eq(schema.subscriptions.userId, userId),
          inArray(schema.subscriptions.status, ["active", "paused"]),
        ),
      )
      .orderBy(desc(schema.subscriptions.createdAt))
      .limit(1);

    if (!activeSub || !activeSub.classesPerWeek) {
      // No active subscription or plan has no classesPerWeek
      // Check if they have any attendance in window to avoid misclassifying
      return "en_riesgo";
    }

    // Step 9: Expected classes in window
    const expectedClasses =
      activeSub.classesPerWeek * (thresholds.windowDays / 7);

    // Step 10: Count attendance in rolling window
    const [attendanceResult] = await this.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(schema.attendance)
      .where(
        and(
          eq(schema.attendance.memberId, userId),
          gte(schema.attendance.checkedInAt, windowStart),
        ),
      );

    const attendanceCount = attendanceResult?.count ?? 0;

    // Step 11: Attendance percentage
    const attendancePct =
      expectedClasses > 0 ? (attendanceCount / expectedClasses) * 100 : 0;

    // Step 12: App usage signals in window (session completions + distinct login days)
    const [sessionCount] = await this.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(schema.completedSessions)
      .where(
        and(
          eq(schema.completedSessions.userId, userId),
          gte(schema.completedSessions.completedAt, windowStart),
        ),
      );

    const [loginDayCount] = await this.db
      .select({
        count: sql<number>`COUNT(DISTINCT DATE(${schema.memberLogins.loggedInAt}))`,
      })
      .from(schema.memberLogins)
      .where(
        and(
          eq(schema.memberLogins.userId, userId),
          gte(schema.memberLogins.loggedInAt, windowStart),
        ),
      );

    const appUsageCount =
      (sessionCount?.count ?? 0) + (loginDayCount?.count ?? 0);

    // Step 13: Digital Warrior check (per D-04)
    if (
      attendancePct < thresholds.intermitentePct &&
      appUsageCount >= DIGITAL_WARRIOR_MIN_APP_USAGE
    ) {
      return "digital_warrior";
    }

    // Step 14-16: Attendance-based segments
    if (attendancePct >= thresholds.espartanoPct) {
      return "espartano";
    }

    if (attendancePct >= thresholds.intermitentePct) {
      return "intermitente";
    }

    return "en_riesgo";
  }

  /**
   * The frequency "golden case" (FREQ-05/06, D-123-02): an ACTIVE (active/paused
   * subscription) member with ZERO visits in the tuneable
   * `frequencyZeroVisitWindowDays` window. This is the ONLY frequency → segment
   * override added by Phase 123.
   *
   * When the nightly batch supplies `opts.isFrequencyGoldenCase` it is used
   * directly (the batch computes the set once via a single batched query —
   * D-123-01); otherwise the per-user signal is computed inline (active-sub
   * lookup + attendance COUNT in the window) so the login path keeps working
   * without a frequency pre-fetch. The batch signal additionally captures the
   * cooling-down case; the inline path covers the zero-visits case directly.
   */
  private async isFrequencyGoldenCase(
    userId: number,
    thresholds: SegmentThresholds,
    opts?: { isFrequencyGoldenCase?: boolean },
  ): Promise<boolean> {
    if (opts?.isFrequencyGoldenCase !== undefined) {
      return opts.isFrequencyGoldenCase;
    }

    // Inline per-user signal: gate on an active/paused subscription first.
    const [activeSub] = await this.db
      .select({ id: schema.subscriptions.id })
      .from(schema.subscriptions)
      .where(
        and(
          eq(schema.subscriptions.userId, userId),
          inArray(schema.subscriptions.status, ["active", "paused"]),
        ),
      )
      .limit(1);

    if (!activeSub) {
      return false;
    }

    // Zero visits in the rolling golden-case window → golden case.
    const windowStart = new Date(
      Date.now() -
        thresholds.frequencyZeroVisitWindowDays * 24 * 60 * 60 * 1000,
    );

    const [attendanceResult] = await this.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(schema.attendance)
      .where(
        and(
          eq(schema.attendance.memberId, userId),
          gte(schema.attendance.checkedInAt, windowStart),
        ),
      );

    return (attendanceResult?.count ?? 0) === 0;
  }

  /**
   * Calculate segment and persist to member_profiles.
   * Skips recalculation if segment was updated within the last hour.
   */
  async calculateAndUpdate(userId: number): Promise<MemberSegment> {
    // Check cooldown: skip if recently updated
    const [profile] = await this.db
      .select({
        segment: schema.memberProfiles.segment,
        segmentUpdatedAt: schema.memberProfiles.segmentUpdatedAt,
      })
      .from(schema.memberProfiles)
      .where(eq(schema.memberProfiles.userId, userId))
      .limit(1);

    if (profile?.segmentUpdatedAt) {
      const elapsed = Date.now() - profile.segmentUpdatedAt.getTime();
      if (elapsed < RECALC_COOLDOWN_MS && profile.segment) {
        return profile.segment as MemberSegment;
      }
    }

    const segment = await this.calculateSegment(userId);

    // Update or skip if no member_profiles row exists (member may not have completed onboarding)
    if (profile) {
      await this.db
        .update(schema.memberProfiles)
        .set({
          segment,
          segmentUpdatedAt: new Date(),
        })
        .where(eq(schema.memberProfiles.userId, userId));
    }

    return segment;
  }

  /**
   * Record a login event for the user.
   */
  async recordLogin(userId: number): Promise<void> {
    await this.db.insert(schema.memberLogins).values({
      userId,
      loggedInAt: new Date(),
    });
  }
}
