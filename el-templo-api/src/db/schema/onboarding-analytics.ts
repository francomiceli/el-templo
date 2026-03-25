import {
  mysqlTable,
  int,
  varchar,
  timestamp,
  mysqlEnum,
} from "drizzle-orm/mysql-core";
import { users } from "./users";

export const onboardingEventTypeEnum = mysqlEnum("onboarding_event_type", [
  "quiz_started",
  "question_answered",
  "quiz_completed",
  "quiz_abandoned",
]);

export const onboardingAnalytics = mysqlTable("onboarding_analytics", {
  id: int("id").primaryKey().autoincrement(),
  userId: int("user_id")
    .references(() => users.id)
    .notNull(),
  eventType: onboardingEventTypeEnum.notNull(),
  questionIndex: int("question_index"), // 0-3 for Q1-Q4
  answerValue: varchar("answer_value", { length: 50 }), // the selected option value
  durationMs: int("duration_ms"), // time spent on this step
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
