// Module: streaks
import { eq, and, inArray, sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyBaseLogger } from "fastify";
import type * as schema from "../../db/schema";
import {
  memberProfiles,
  subscriptions,
  subscriptionSchedules,
  schedules,
  subscriptionPlans,
  completedSessions,
  systemSettings,
} from "../../db/schema";
import type { AuraService } from "../aura/service";
import {
  STREAK_SETTINGS_KEYS,
  STREAK_DEFAULTS,
  STREAK_MILESTONES,
  MILESTONE_TO_CONFIG_KEY,
  type StreakMilestoneConfig,
} from "./types";

type DbInstance = MySql2Database<typeof schema>;

interface StreakUpdateResult {
  currentStreak: number;
  longestStreak: number;
  milestoneReached: number | null;
}

/**
 * StreakService manages attendance streak tracking per member.
 *
 * Streaks are plan-aware: rest days between planned training days do NOT break
 * the streak. A streak only breaks when a member misses a planned training day.
 */
export class StreakService {
  constructor(
    private readonly db: DbInstance,
    private readonly auraService: AuraService,
    private readonly log: FastifyBaseLogger,
  ) {}

  /**
   * Get the ISO day-of-week numbers when the member is expected to train.
   * Returns array of 1=Monday..6=Saturday values.
   *
   * Priority:
   * 1. Subscription schedules (fixed days from schedule slots)
   * 2. Plan's classesPerWeek (distribute evenly Mon-Sat)
   * 3. Default: every day Mon-Sat
   */
  async getExpectedTrainingDays(userId: number): Promise<number[]> {
    // Find active subscription
    const activeSubs = await this.db
      .select({ id: subscriptions.id, planId: subscriptions.planId })
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.userId, userId),
          inArray(subscriptions.status, ["active", "paused"]),
        ),
      )
      .limit(1);

    if (activeSubs.length === 0) {
      // No active subscription: assume daily Mon-Sat
      return [1, 2, 3, 4, 5, 6];
    }

    const sub = activeSubs[0];

    // Check subscription_schedules for fixed schedule slots
    const scheduleSlots = await this.db
      .select({ dayOfWeek: schedules.dayOfWeek })
      .from(subscriptionSchedules)
      .innerJoin(schedules, eq(subscriptionSchedules.scheduleId, schedules.id))
      .where(eq(subscriptionSchedules.subscriptionId, sub.id));

    if (scheduleSlots.length > 0) {
      // Unique day-of-week values from schedule slots
      const days = [...new Set(scheduleSlots.map((s) => s.dayOfWeek))];
      return days.sort((a, b) => a - b);
    }

    // Fall back to plan's classesPerWeek
    const [plan] = await this.db
      .select({ classesPerWeek: subscriptionPlans.classesPerWeek })
      .from(subscriptionPlans)
      .where(eq(subscriptionPlans.id, sub.planId));

    if (plan?.classesPerWeek) {
      return this.distributeTrainingDays(plan.classesPerWeek);
    }

    // Default: every day Mon-Sat
    return [1, 2, 3, 4, 5, 6];
  }

  /**
   * Distribute N training days evenly across Mon-Sat (1-6).
   * E.g., 3 classes/week -> [1, 3, 5] (Mon, Wed, Fri)
   */
  private distributeTrainingDays(classesPerWeek: number): number[] {
    const availableDays = [1, 2, 3, 4, 5, 6]; // Mon-Sat
    if (classesPerWeek >= 6) return availableDays;
    if (classesPerWeek <= 0) return availableDays;

    const step = availableDays.length / classesPerWeek;
    const result: number[] = [];
    for (let i = 0; i < classesPerWeek; i++) {
      result.push(availableDays[Math.floor(i * step)]);
    }
    return result;
  }

  /**
   * Update the member's streak after a session completion.
   *
   * Logic:
   * 1. Get expected training days
   * 2. Read current streak data from member_profiles
   * 3. Check for missed planned training days since last update
   * 4. Increment streak for today's session
   * 5. Update longestStreak if needed
   * 6. Check for milestone AURA bonus
   */
  async updateStreak(userId: number): Promise<StreakUpdateResult> {
    const noStreakResult: StreakUpdateResult = {
      currentStreak: 0,
      longestStreak: 0,
      milestoneReached: null,
    };

    // Get or create member profile
    const profiles = await this.db
      .select({
        currentStreak: memberProfiles.currentStreak,
        longestStreak: memberProfiles.longestStreak,
        streakUpdatedAt: memberProfiles.streakUpdatedAt,
      })
      .from(memberProfiles)
      .where(eq(memberProfiles.userId, userId));

    if (profiles.length === 0) {
      // No profile row — onboarding creates this. Skip streak update.
      this.log.debug({ userId }, "No member_profiles row — skipping streak update");
      return noStreakResult;
    }

    const profile = profiles[0];
    let currentStreak = profile.currentStreak ?? 0;
    let longestStreak = profile.longestStreak ?? 0;
    const lastUpdated = profile.streakUpdatedAt;

    // Get expected training days for this member
    const expectedDays = await this.getExpectedTrainingDays(userId);

    // Check for missed planned training days since last streak update
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Determine the start date to check from
    let checkFrom: Date;
    if (lastUpdated) {
      checkFrom = new Date(lastUpdated);
      checkFrom.setHours(0, 0, 0, 0);
      // Start checking from the day after the last update
      checkFrom.setDate(checkFrom.getDate() + 1);
    } else {
      // If never updated, check from yesterday
      checkFrom = new Date(today);
      checkFrom.setDate(checkFrom.getDate() - 1);
    }

    // Walk through each day from checkFrom to yesterday (not today, since today's session just happened)
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    let streakBroken = false;
    const currentDate = new Date(checkFrom);
    while (currentDate <= yesterday) {
      const dayOfWeek = currentDate.getDay(); // 0=Sun..6=Sat
      // Convert JS getDay() (0=Sun) to ISO (1=Mon..7=Sun)
      const isoDayOfWeek = dayOfWeek === 0 ? 7 : dayOfWeek;

      if (expectedDays.includes(isoDayOfWeek)) {
        // This was a planned training day — check if member trained
        const dateStr = currentDate.toISOString().split("T")[0];
        const sessions = await this.db
          .select({ id: completedSessions.id })
          .from(completedSessions)
          .where(
            and(
              eq(completedSessions.userId, userId),
              eq(completedSessions.date, dateStr),
            ),
          )
          .limit(1);

        if (sessions.length === 0) {
          // Missed a planned training day — streak broken
          streakBroken = true;
          break;
        }
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }

    if (streakBroken) {
      currentStreak = 0;
    }

    // Increment for today's session
    currentStreak += 1;

    // Update longestStreak if current exceeds it (D-05: only increases)
    if (currentStreak > longestStreak) {
      longestStreak = currentStreak;
    }

    // Persist updated streak data
    await this.db
      .update(memberProfiles)
      .set({
        currentStreak,
        longestStreak,
        streakUpdatedAt: new Date(),
      })
      .where(eq(memberProfiles.userId, userId));

    // Check for milestone AURA bonus
    let milestoneReached: number | null = null;
    if ((STREAK_MILESTONES as readonly number[]).includes(currentStreak)) {
      milestoneReached = currentStreak;
      try {
        const config = await this.getStreakMilestoneConfig();
        const configKey = MILESTONE_TO_CONFIG_KEY[currentStreak];
        const bonusAmount = configKey ? config[configKey] : 0;

        if (bonusAmount > 0) {
          await this.auraService.award({
            userId,
            sourceType: "streak_bonus",
            referenceType: "streak_milestone",
            referenceId: currentStreak,
            amount: bonusAmount,
            description: `Racha de ${currentStreak} dias`,
          });
          this.log.info(
            { userId, milestone: currentStreak, bonusAmount },
            "Streak milestone AURA bonus awarded",
          );
        }
      } catch (auraErr: unknown) {
        this.log.warn(
          { err: auraErr, userId, milestone: currentStreak },
          "Failed to award streak milestone AURA bonus",
        );
        // Graceful degradation: streak update succeeds even if AURA fails
      }
    }

    return { currentStreak, longestStreak, milestoneReached };
  }

  /**
   * Read streak milestone AURA configuration from system_settings.
   * Falls back to STREAK_DEFAULTS if settings are not configured.
   */
  async getStreakMilestoneConfig(): Promise<StreakMilestoneConfig> {
    const keys = Object.values(STREAK_SETTINGS_KEYS);

    const rows = await this.db
      .select({
        settingKey: systemSettings.settingKey,
        settingValue: systemSettings.settingValue,
      })
      .from(systemSettings)
      .where(inArray(systemSettings.settingKey, [...keys]));

    const settingsMap = new Map(
      rows.map((r) => [r.settingKey, r.settingValue]),
    );

    const parseOrDefault = (key: string, defaultVal: number): number => {
      const val = settingsMap.get(key);
      if (val === undefined) return defaultVal;
      const parsed = parseInt(val, 10);
      return isNaN(parsed) ? defaultVal : parsed;
    };

    return {
      milestone7Aura: parseOrDefault(
        STREAK_SETTINGS_KEYS.MILESTONE_7_AURA,
        STREAK_DEFAULTS.MILESTONE_7_AURA,
      ),
      milestone14Aura: parseOrDefault(
        STREAK_SETTINGS_KEYS.MILESTONE_14_AURA,
        STREAK_DEFAULTS.MILESTONE_14_AURA,
      ),
      milestone30Aura: parseOrDefault(
        STREAK_SETTINGS_KEYS.MILESTONE_30_AURA,
        STREAK_DEFAULTS.MILESTONE_30_AURA,
      ),
      milestone60Aura: parseOrDefault(
        STREAK_SETTINGS_KEYS.MILESTONE_60_AURA,
        STREAK_DEFAULTS.MILESTONE_60_AURA,
      ),
      milestone100Aura: parseOrDefault(
        STREAK_SETTINGS_KEYS.MILESTONE_100_AURA,
        STREAK_DEFAULTS.MILESTONE_100_AURA,
      ),
    };
  }
}
