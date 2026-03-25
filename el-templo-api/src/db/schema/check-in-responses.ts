import {
  mysqlTable,
  int,
  varchar,
  timestamp,
  mysqlEnum,
  uniqueIndex,
  index,
} from "drizzle-orm/mysql-core";
import { users } from "./users";

export const checkInQuestionTypeEnum = mysqlEnum("question_type", [
  "energy",
  "soreness",
  "sleep",
]);

export const checkInResponses = mysqlTable(
  "check_in_responses",
  {
    id: int("id").primaryKey().autoincrement(),
    userId: int("user_id")
      .notNull()
      .references(() => users.id),
    questionType: checkInQuestionTypeEnum.notNull(),
    value: varchar("value", { length: 20 }).notNull(),
    bodyArea: varchar("body_area", { length: 20 }),
    date: varchar("date", { length: 10 }).notNull(), // YYYY-MM-DD
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("uq_check_in_daily").on(
      table.userId,
      table.questionType,
      table.date,
    ),
    index("idx_check_in_user").on(table.userId),
  ],
);
