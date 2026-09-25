import {
  mysqlTable,
  int,
  varchar,
  timestamp,
  mysqlEnum,
  index,
} from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";
import { users } from "./users";
import { tenantIdColumn } from "./tenant-column";

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
  "optima",
  "regular",
  "alerta",
  "ausente",
]);

export const memberProfiles = mysqlTable(
  "member_profiles",
  {
    id: int("id").primaryKey().autoincrement(),
    // Fase 167 (COL-01): tenancy. Valor server-side, nunca de payload. Ver src/db/schema/tenant-column.ts
    tenantId: tenantIdColumn(),
    userId: int("user_id")
      .references(() => users.id)
      .notNull()
      .unique(),
    goalType: goalTypeEnum,
    experienceLevel: experienceLevelEnum,
    trainingFocus: trainingFocusEnum,
    motivationStyle: motivationStyleEnum,
    ageRange: varchar("age_range", { length: 10 }),
    trainingBackground: varchar("training_background", { length: 20 }),
    painPoint: varchar("pain_point", { length: 20 }),
    trainingFrequency: varchar("training_frequency", { length: 10 }),
    avatarType: varchar("avatar_type", { length: 2 }),
    onboardingCompletedAt: timestamp("onboarding_completed_at"),
    segment: memberSegmentEnum,
    segmentUpdatedAt: timestamp("segment_updated_at"),
    currentStreak: int("current_streak").default(0),
    longestStreak: int("longest_streak").default(0),
    streakUpdatedAt: timestamp("streak_updated_at"),
    ghostReattemptCount: int("ghost_reattempt_count").default(0),
    lastGhostReattemptAt: timestamp("last_ghost_reattempt_at"),
    // SPEC "Empezá acá" B (persistencia y métrica), migración 0240:
    // `introStoriesSeenAt` se estampa la PRIMERA vez que el socio abrió las
    // historias (aunque las haya cerrado antes de terminar);
    // `introStoriesCompletedAt` solo si llegó al último slide;
    // `introStoriesLastSlide` es el índice donde quedó (métrica, no gatea
    // nada). Los tres NULL hasta la primera apertura.
    introStoriesSeenAt: timestamp("intro_stories_seen_at"),
    introStoriesCompletedAt: timestamp("intro_stories_completed_at"),
    introStoriesLastSlide: int("intro_stories_last_slide"),
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
