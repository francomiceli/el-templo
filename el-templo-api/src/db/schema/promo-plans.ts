// Module: subscriptions (promo campaigns)
import {
  mysqlTable,
  int,
  varchar,
  boolean,
  timestamp,
  datetime,
  mysqlEnum,
} from "drizzle-orm/mysql-core";

export const promoTypeEnum = mysqlEnum("promo_type", [
  "auto",
  "admin_assignable",
]);

export const promoPlans = mysqlTable("promo_plans", {
  id: int("id").primaryKey().autoincrement(),
  name: varchar("name", { length: 150 }).notNull(),
  promoCode: varchar("promo_code", { length: 50 }).notNull().unique(),
  planDurationDays: int("plan_duration_days").notNull().default(30),
  subscriptionPlanId: int("subscription_plan_id").notNull(),
  startDate: datetime("start_date").notNull(),
  expiryDate: datetime("expiry_date").notNull(),
  promoType: promoTypeEnum.notNull().default("auto"),
  isActive: boolean("is_active").default(true).notNull(),
  redemptionCount: int("redemption_count").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});
