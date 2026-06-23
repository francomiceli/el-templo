/**
 * Segmentation Service
 *
 * Calculates the Attendance label for members based 100% on the percentage of
 * membership usage (attendance vs plan budget) over a rolling 28-day window.
 * The label is plan-relative and recalculates on login (with a 1h cooldown).
 *
 * Phase 136 (D-01..D-09): collapsed the legacy 6-value behavioral segment
 * (nuevo/espartano/intermitente/en_riesgo/digital_warrior/ghost + golden case +
 * inactivity-by-weeks) into the 4 attendance bands. Cut points are fixed in
 * code (types.ts), no longer read from system_settings.
 *
 * Uses constructor DI pattern (Phase 56 convention).
 */

import { MySql2Database } from "drizzle-orm/mysql2";
import { eq, and, gte, sql, desc, inArray } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import type { MemberSegment } from "./types";
import {
  ATTENDANCE_OPTIMA_PCT,
  ATTENDANCE_REGULAR_PCT,
  ATTENDANCE_WINDOW_DAYS,
} from "./types";
import { computeSeniority } from "../shared/date-utils";

/** Skip recalculation if segment was updated within this many milliseconds */
const RECALC_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

export class SegmentationService {
  constructor(
    private db: MySql2Database<typeof schema>,
    private log: FastifyBaseLogger,
  ) {}

  /**
   * Calculate the Attendance label for a member (D-01..D-08).
   *
   * Returns NULL when no label applies:
   *  - tenure < 1 month (D-07): not enough history, must not fall unfairly into
   *    Alerta/Ausente during the first month;
   *  - no active/paused subscription or plan without classesPerWeek (D-08): no
   *    denominator for the percentage.
   *
   * Otherwise classifies by attendance percentage over the 28-day window:
   *  - pct >= 75            → optima (D-04: >100% stays optima)
   *  - 50 <= pct < 75       → regular
   *  - 0  <  pct < 50       → alerta
   *  - pct == 0             → ausente
   */
  async calculateSegment(userId: number): Promise<MemberSegment | null> {
    // Step 1: tenure guard (D-07). Members with < 1 month since registration
    // have no Attendance label — the column stays NULL.
    const [user] = await this.db
      .select({ createdAt: schema.users.createdAt })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);

    if (!user) {
      this.log.warn({ userId }, "User not found for segment calculation");
      return null;
    }

    // Guard uses the exact same "nuevo" tenure boundary as the Antigüedad pill
    // (computeSeniority, D-06) so the two can never disagree: a member tagged
    // "Nuevo" must never carry an Attendance label.
    if (computeSeniority(user.createdAt) === "nuevo") {
      return null;
    }

    // Step 2: active plan budget (D-08). Without an active/paused subscription
    // that carries classesPerWeek there is no denominator → NULL.
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
      return null;
    }

    // Step 3: expected classes in the rolling window.
    const expectedClasses =
      activeSub.classesPerWeek * (ATTENDANCE_WINDOW_DAYS / 7);

    if (expectedClasses <= 0) {
      return null;
    }

    // Step 4: count attendance in the rolling 28-day window.
    const windowStart = new Date(
      Date.now() - ATTENDANCE_WINDOW_DAYS * 24 * 60 * 60 * 1000,
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

    const attendanceCount = attendanceResult?.count ?? 0;

    // Step 5: attendance percentage and 4-band classification.
    const attendancePct = (attendanceCount / expectedClasses) * 100;

    if (attendancePct >= ATTENDANCE_OPTIMA_PCT) {
      return "optima";
    }

    if (attendancePct >= ATTENDANCE_REGULAR_PCT) {
      return "regular";
    }

    if (attendancePct > 0) {
      return "alerta";
    }

    return "ausente";
  }

  /**
   * Calculate the Attendance label and persist it to member_profiles.
   * Skips recalculation if segment was updated within the last hour.
   *
   * NULL is a valid result to persist (D-07/D-08: no label applies).
   */
  async calculateAndUpdate(userId: number): Promise<MemberSegment | null> {
    // Check cooldown: skip if recently updated and a label is already set.
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

    // Update or skip if no member_profiles row exists (member may not have
    // completed onboarding). NULL is persisted intentionally.
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
