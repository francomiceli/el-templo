// Module: holidays
import {
  mysqlTable,
  int,
  varchar,
  date,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/mysql-core";

export const holidays = mysqlTable(
  "holidays",
  {
    id: int("id").primaryKey().autoincrement(),
    country: varchar("country", { length: 2 }).notNull(),
    date: date("date", { mode: "string" }).notNull(),
    name: varchar("name", { length: 150 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("idx_holidays_country_date").on(table.country, table.date),
  ],
);
