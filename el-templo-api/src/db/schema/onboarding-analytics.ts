import {
  mysqlTable,
  int,
  varchar,
  timestamp,
  mysqlEnum,
} from "drizzle-orm/mysql-core";
import { users } from "./users";
import { tenantIdColumn } from "./tenant-column";

export const onboardingEventTypeEnum = mysqlEnum("onboarding_event_type", [
  "quiz_started",
  "question_answered",
  "quiz_completed",
  "quiz_abandoned",
  "avatar_assigned",
]);

export const onboardingAnalytics = mysqlTable("onboarding_analytics", {
  id: int("id").primaryKey().autoincrement(),
  // Fase 167 (COL-01): tenancy. Valor server-side, nunca de payload. Ver src/db/schema/tenant-column.ts
  tenantId: tenantIdColumn(),
  userId: int("user_id")
    .references(() => users.id)
    .notNull(),
  eventType: onboardingEventTypeEnum.notNull(),
  questionIndex: int("question_index"), // 0-3 for Q1-Q4
  answerValue: varchar("answer_value", { length: 100 }), // the selected option value
  durationMs: int("duration_ms"), // time spent on this step
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
