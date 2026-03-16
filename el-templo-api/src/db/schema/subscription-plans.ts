// Module: subscriptions
import {
  mysqlTable,
  int,
  varchar,
  text,
  boolean,
  timestamp,
  mysqlEnum,
} from "drizzle-orm/mysql-core";

export const planTierEnum = mysqlEnum("plan_tier", [
  "flex",
  "foundation",
  "performance",
  "other",
]);

export const bookingModeEnum = mysqlEnum("booking_mode", ["fixed", "flexible"]);

export const subscriptionPlans = mysqlTable("subscription_plans", {
  id: int("id").primaryKey().autoincrement(),
  name: varchar("name", { length: 150 }).notNull(),
  description: text("description"),
  planTier: planTierEnum.notNull(),
  bookingMode: bookingModeEnum.notNull(),
  priceRegular: int("price_regular").notNull(),
  priceZero: int("price_zero").notNull(),
  priceCreditCard: int("price_credit_card"),
  durationDays: int("duration_days").notNull(),
  classesPerWeek: int("classes_per_week"),
  multiBranch: boolean("multi_branch").default(false).notNull(),
  isTrial: boolean("is_trial").default(false).notNull(),
  isGroup: boolean("is_group").default(false).notNull(),
  groupMaxMembers: int("group_max_members"),
  isActive: boolean("is_active").default(true).notNull(),
  isArchived: boolean("is_archived").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});
