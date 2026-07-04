// Module: activities
import {
  mysqlTable,
  int,
  varchar,
  text,
  boolean,
  timestamp,
} from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";
import { schedules } from "./schedules";

export const activities = mysqlTable("activities", {
  id: int("id").primaryKey().autoincrement(),
  name: varchar("name", { length: 150 }).notNull(),
  description: text("description"),
  isActive: boolean("is_active").default(true).notNull(),
  // D-05 (HOR-03): cupo por actividad. NULL = hereda branch.max_capacity.
  // Sin default ni notNull -- datos existentes quedan NULL (cero cambio de comportamiento).
  maxCapacity: int("max_capacity"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const activitiesRelations = relations(activities, ({ many }) => ({
  schedules: many(schedules),
}));
