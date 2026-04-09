import { mysqlTable, int, varchar, uniqueIndex } from "drizzle-orm/mysql-core";

export const dayModes = mysqlTable(
  "day_modes",
  {
    id: int("id").primaryKey().autoincrement(),
    dayOfWeek: int("day_of_week").notNull(), // 1=Mon, 2=Tue, ..., 6=Sat
    sessionMode: varchar("session_mode", { length: 10 })
      .default("regular")
      .notNull(),
  },
  (table) => [uniqueIndex("day_modes_day_of_week_unique").on(table.dayOfWeek)],
);
