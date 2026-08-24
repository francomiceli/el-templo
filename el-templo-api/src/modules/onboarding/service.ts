import { and, eq } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyBaseLogger } from "fastify";
import { memberProfiles, onboardingAnalytics } from "../../db/schema";
import { users } from "../../db/schema/users";
import type { AuraService } from "../aura/service";
import type * as schema from "../../db/schema";
import {
  tenantWhere,
  tenantValues,
  type TenantContext,
} from "../shared/tenant";
import type {
  CompleteOnboardingInput,
  OnboardingProfile,
  CompleteOnboardingInputV2,
  OnboardingProfileV2,
  AnalyticsEventInput,
} from "./types";
import { resolveAvatar } from "./avatar-resolution.js";

type DbInstance = MySql2Database<typeof schema>;

export class OnboardingService {
  constructor(
    private readonly db: DbInstance,
    private readonly auraService: AuraService,
    private readonly log?: FastifyBaseLogger,
  ) {}

  async completeOnboarding(
    ctx: TenantContext,
    input: CompleteOnboardingInput,
  ): Promise<{ profile: OnboardingProfile; auraAwarded: number }> {
    // Check if user already completed onboarding (prevent duplicates)
    const existing = await this.db
      .select({ id: memberProfiles.id })
      .from(memberProfiles)
      .where(
        and(
          tenantWhere(memberProfiles, ctx),
          eq(memberProfiles.userId, input.userId),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      throw new DuplicateOnboardingError(input.userId);
    }

    // Insert profile
    const now = new Date();
    await this.db.insert(memberProfiles).values(
      tenantValues(ctx, {
        userId: input.userId,
        goalType: input.goalType,
        experienceLevel: input.experienceLevel,
        trainingFocus: input.trainingFocus,
        motivationStyle: input.motivationStyle,
        onboardingCompletedAt: now,
      }),
    );

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

  async completeOnboardingV2(
    ctx: TenantContext,
    input: CompleteOnboardingInputV2,
  ): Promise<{ profile: OnboardingProfileV2; auraAwarded: number }> {
    // Idempotent: if the user already has a profile, overwrite it with the
    // latest answers so they can re-do the quiz. AURA is only awarded on the
    // first completion — re-submissions return auraAwarded: 0.
    const existing = await this.db
      .select({ id: memberProfiles.id })
      .from(memberProfiles)
      .where(
        and(
          tenantWhere(memberProfiles, ctx),
          eq(memberProfiles.userId, input.userId),
        ),
      )
      .limit(1);

    const isRepeat = existing.length > 0;

    // Resolve avatar from quiz answers + gender
    const { avatarType, suggestedProgram } = resolveAvatar({
      gender: input.gender,
      ageRange: input.ageRange,
      trainingBackground: input.trainingBackground,
      goal: input.goal,
      painPoint: input.painPoint,
      trainingFrequency: input.trainingFrequency,
    });

    const now = new Date();
    const profileValues = {
      userId: input.userId,
      ageRange: input.ageRange,
      trainingBackground: input.trainingBackground,
      painPoint: input.painPoint,
      trainingFrequency: input.trainingFrequency,
      avatarType,
      onboardingCompletedAt: now,
    };

    if (isRepeat) {
      await this.db
        .update(memberProfiles)
        .set(profileValues)
        .where(
          and(
            tenantWhere(memberProfiles, ctx),
            eq(memberProfiles.userId, input.userId),
          ),
        );
    } else {
      await this.db
        .insert(memberProfiles)
        .values(tenantValues(ctx, profileValues));
    }

    // Update user level if they selected one (el_templo training background)
    if (input.level) {
      await this.db
        .update(users)
        .set({ level: input.level })
        .where(and(tenantWhere(users, ctx), eq(users.id, input.userId)));
    }

    // Award 50 AURA only on first completion (graceful degradation)
    let auraAwarded = 0;
    if (!isRepeat) {
      try {
        auraAwarded = await this.auraService.award({
          userId: input.userId,
          sourceType: "onboarding_completion",
          amount: 50,
          description: "Onboarding quiz completed",
        });
      } catch (err: unknown) {
        this.log?.error(
          { err, userId: input.userId },
          "Failed to award AURA for onboarding",
        );
      }
    }

    // Record avatar_assigned analytics event (per D-23)
    try {
      await this.recordAnalyticsEvent({
        userId: input.userId,
        eventType: "avatar_assigned",
        answerValue: avatarType,
      });
    } catch (err: unknown) {
      this.log?.error(
        { err, userId: input.userId, avatarType },
        "Failed to record avatar_assigned analytics event",
      );
    }

    this.log?.info(
      { userId: input.userId, avatarType },
      "Onboarding V2 completed",
    );

    return {
      profile: {
        ageRange: input.ageRange,
        trainingBackground: input.trainingBackground,
        goal: input.goal,
        painPoint: input.painPoint,
        trainingFrequency: input.trainingFrequency,
        avatarType,
        suggestedProgram,
        onboardingCompletedAt: now.toISOString(),
      },
      auraAwarded,
    };
  }

  async getProfileV2(
    ctx: TenantContext,
    userId: number,
  ): Promise<OnboardingProfileV2 | null> {
    const rows = await this.db
      .select({
        ageRange: memberProfiles.ageRange,
        trainingBackground: memberProfiles.trainingBackground,
        painPoint: memberProfiles.painPoint,
        trainingFrequency: memberProfiles.trainingFrequency,
        avatarType: memberProfiles.avatarType,
        onboardingCompletedAt: memberProfiles.onboardingCompletedAt,
      })
      .from(memberProfiles)
      .where(
        and(
          tenantWhere(memberProfiles, ctx),
          eq(memberProfiles.userId, userId),
        ),
      )
      .limit(1);

    if (rows.length === 0 || !rows[0].avatarType) return null;

    const row = rows[0];
    const { AVATAR_PROGRAM_MAP } = await import("./avatar-resolution.js");

    return {
      ageRange: row.ageRange as OnboardingProfileV2["ageRange"],
      trainingBackground:
        row.trainingBackground as OnboardingProfileV2["trainingBackground"],
      goal: "" as OnboardingProfileV2["goal"], // goal not stored in DB — derived from avatar
      painPoint: row.painPoint as OnboardingProfileV2["painPoint"],
      trainingFrequency:
        row.trainingFrequency as OnboardingProfileV2["trainingFrequency"],
      avatarType: row.avatarType as OnboardingProfileV2["avatarType"],
      suggestedProgram:
        AVATAR_PROGRAM_MAP[row.avatarType as OnboardingProfileV2["avatarType"]],
      onboardingCompletedAt: row.onboardingCompletedAt?.toISOString() ?? null,
    };
  }

  async getProfile(
    ctx: TenantContext,
    userId: number,
  ): Promise<OnboardingProfile | null> {
    const rows = await this.db
      .select({
        goalType: memberProfiles.goalType,
        experienceLevel: memberProfiles.experienceLevel,
        trainingFocus: memberProfiles.trainingFocus,
        motivationStyle: memberProfiles.motivationStyle,
        onboardingCompletedAt: memberProfiles.onboardingCompletedAt,
      })
      .from(memberProfiles)
      .where(
        and(
          tenantWhere(memberProfiles, ctx),
          eq(memberProfiles.userId, userId),
        ),
      )
      .limit(1);

    if (rows.length === 0) return null;

    const row = rows[0];
    return {
      goalType: row.goalType as OnboardingProfile["goalType"],
      experienceLevel:
        row.experienceLevel as OnboardingProfile["experienceLevel"],
      trainingFocus: row.trainingFocus as OnboardingProfile["trainingFocus"],
      motivationStyle:
        row.motivationStyle as OnboardingProfile["motivationStyle"],
      onboardingCompletedAt: row.onboardingCompletedAt?.toISOString() ?? null,
    };
  }

  async hasCompletedOnboarding(
    ctx: TenantContext,
    userId: number,
  ): Promise<boolean> {
    const rows = await this.db
      .select({ completedAt: memberProfiles.onboardingCompletedAt })
      .from(memberProfiles)
      .where(
        and(
          tenantWhere(memberProfiles, ctx),
          eq(memberProfiles.userId, userId),
        ),
      )
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
