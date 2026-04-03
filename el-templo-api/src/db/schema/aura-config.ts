// Module: aura
import {
  mysqlTable,
  int,
  varchar,
  boolean,
  timestamp,
  mysqlEnum,
} from "drizzle-orm/mysql-core";

export const auraConfigSourceTypeEnum = mysqlEnum("aura_config_source_type", [
  "training_completion",
  "attendance",
  "streak_bonus",
  "referral",
  "subscription_discount",
  "manual_adjustment",
  "challenge",
  "social",
  "goal_plan_completion",
  "onboarding_completion",
  "program_week_completion",
  "program_completion",
]);

export const auraConfig = mysqlTable("aura_config", {
  id: int("id").primaryKey().autoincrement(),
  sourceType: auraConfigSourceTypeEnum.notNull().unique(),
  defaultAmount: int("default_amount").notNull(),
  description: varchar("description", { length: 255 }),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});
