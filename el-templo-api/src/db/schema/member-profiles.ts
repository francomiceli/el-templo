import {
  mysqlTable,
  int,
  timestamp,
  mysqlEnum,
  index,
} from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";
import { users } from "./users";

export const goalTypeEnum = mysqlEnum("goal_type", [
  "muscle_up",
  "fitness",
  "weight_loss",
  "flexibility",
  "wellness",
]);

export const experienceLevelEnum = mysqlEnum("experience_level", [
  "beginner",
  "intermediate",
  "advanced",
]);

export const trainingFocusEnum = mysqlEnum("training_focus", [
  "upper_body",
  "lower_body",
  "core",
  "full_body",
]);

export const motivationStyleEnum = mysqlEnum("motivation_style", [
  "discipline",
  "community",
  "results",
  "challenges",
]);

export const memberSegmentEnum = mysqlEnum("member_segment", [
  "nuevo_guerrero",
  "espartano",
  "intermitente",
  "en_riesgo",
  "digital_warrior",
  "ghost",
]);

export const memberProfiles = mysqlTable(
  "member_profiles",
  {
    id: int("id").primaryKey().autoincrement(),
    userId: int("user_id")
      .references(() => users.id)
      .notNull()
      .unique(),
    goalType: goalTypeEnum.notNull(),
    experienceLevel: experienceLevelEnum.notNull(),
    trainingFocus: trainingFocusEnum.notNull(),
    motivationStyle: motivationStyleEnum.notNull(),
    onboardingCompletedAt: timestamp("onboarding_completed_at"),
    segment: memberSegmentEnum,
    segmentUpdatedAt: timestamp("segment_updated_at"),
    currentStreak: int("current_streak").default(0),
    longestStreak: int("longest_streak").default(0),
    streakUpdatedAt: timestamp("streak_updated_at"),
    ghostReattemptCount: int("ghost_reattempt_count").default(0),
    lastGhostReattemptAt: timestamp("last_ghost_reattempt_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [index("idx_member_profiles_user_id").on(table.userId)],
);

export const memberProfilesRelations = relations(memberProfiles, ({ one }) => ({
  user: one(users, {
    fields: [memberProfiles.userId],
    references: [users.id],
  }),
}));
