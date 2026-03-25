import { eq } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { Logger } from "pino";
import { memberProfiles, onboardingAnalytics } from "../../db/schema";
import type { AuraService } from "../aura/service";
import type * as schema from "../../db/schema";
import type {
  CompleteOnboardingInput,
  OnboardingProfile,
  AnalyticsEventInput,
} from "./types";

type DbInstance = MySql2Database<typeof schema>;

export class OnboardingService {
  constructor(
    private readonly db: DbInstance,
    private readonly auraService: AuraService,
    private readonly log?: Logger,
  ) {}

  async completeOnboarding(
    input: CompleteOnboardingInput,
  ): Promise<{ profile: OnboardingProfile; auraAwarded: number }> {
    // Check if user already completed onboarding (prevent duplicates)
    const existing = await this.db
      .select({ id: memberProfiles.id })
      .from(memberProfiles)
      .where(eq(memberProfiles.userId, input.userId))
      .limit(1);

    if (existing.length > 0) {
      throw new DuplicateOnboardingError(input.userId);
    }

    // Insert profile
    const now = new Date();
    await this.db.insert(memberProfiles).values({
      userId: input.userId,
      goalType: input.goalType,
      experienceLevel: input.experienceLevel,
      trainingFocus: input.trainingFocus,
      motivationStyle: input.motivationStyle,
      onboardingCompletedAt: now,
    });

    // Award 50 AURA (per D-22)
    let auraAwarded = 0;
    try {
      auraAwarded = await this.auraService.award({
        userId: input.userId,
        sourceType: "onboarding_completion",
        amount: 50,
        description: "Onboarding quiz completed",
      });
    } catch (err: unknown) {
      // AURA failure should not fail onboarding (graceful degradation)
      this.log?.error(
        { err, userId: input.userId },
        "Failed to award AURA for onboarding",
      );
    }

    this.log?.info({ userId: input.userId }, "Onboarding completed");

    return {
      profile: {
        goalType: input.goalType,
        experienceLevel: input.experienceLevel,
        trainingFocus: input.trainingFocus,
        motivationStyle: input.motivationStyle,
        onboardingCompletedAt: now.toISOString(),
      },
      auraAwarded,
    };
  }

  async getProfile(userId: number): Promise<OnboardingProfile | null> {
    const rows = await this.db
      .select({
        goalType: memberProfiles.goalType,
        experienceLevel: memberProfiles.experienceLevel,
        trainingFocus: memberProfiles.trainingFocus,
        motivationStyle: memberProfiles.motivationStyle,
        onboardingCompletedAt: memberProfiles.onboardingCompletedAt,
      })
      .from(memberProfiles)
      .where(eq(memberProfiles.userId, userId))
      .limit(1);

    if (rows.length === 0) return null;

    const row = rows[0];
    return {
      goalType: row.goalType,
      experienceLevel: row.experienceLevel,
      trainingFocus: row.trainingFocus,
      motivationStyle: row.motivationStyle,
      onboardingCompletedAt: row.onboardingCompletedAt?.toISOString() ?? null,
    };
  }

  async hasCompletedOnboarding(userId: number): Promise<boolean> {
    const rows = await this.db
      .select({ completedAt: memberProfiles.onboardingCompletedAt })
      .from(memberProfiles)
      .where(eq(memberProfiles.userId, userId))
      .limit(1);

    return rows.length > 0 && rows[0].completedAt !== null;
  }

  async recordAnalyticsEvent(input: AnalyticsEventInput): Promise<void> {
    await this.db.insert(onboardingAnalytics).values({
      userId: input.userId,
      eventType: input.eventType,
      questionIndex: input.questionIndex ?? null,
      answerValue: input.answerValue ?? null,
      durationMs: input.durationMs ?? null,
    });
  }
}

export class DuplicateOnboardingError extends Error {
  constructor(userId: number) {
    super(`User ${userId} has already completed onboarding`);
    this.name = "DuplicateOnboardingError";
  }
}
