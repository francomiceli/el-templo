// Module: subscriptions
import {
  mysqlTable,
  int,
  varchar,
  text,
  boolean,
  timestamp,
  date,
  mysqlEnum,
  index,
} from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";
import { users } from "./users";
import { subscriptionPlans } from "./subscription-plans";
import { branches } from "./branches";

export const subscriptionStatusEnum = mysqlEnum("subscription_status", [
  "active",
  "paused",
  "cancelled",
  "expired",
  "completed",
  "changed",
  "scheduled",
]);

export const priceTypeAppliedEnum = mysqlEnum("price_type_applied", [
  "regular",
  "zero",
  "credit_card",
]);

/**
 * Subscriptions table.
 *
 * Note: "One active/paused subscription per member" is enforced at the service layer.
 * MySQL does not support partial unique indexes, so we cannot use a DB-level constraint
 * that only applies to active/paused rows while allowing multiple cancelled/expired rows.
 */
export const subscriptions = mysqlTable(
  "subscriptions",
  {
    id: int("id").primaryKey().autoincrement(),
    userId: int("user_id")
      .references(() => users.id)
      .notNull(),
    planId: int("plan_id")
      .references(() => subscriptionPlans.id)
      .notNull(),
    branchId: int("branch_id")
      .references(() => branches.id)
      .notNull(),
    status: subscriptionStatusEnum.default("active").notNull(),
    startDate: date("start_date", { mode: "string" }).notNull(),
    endDate: date("end_date", { mode: "string" }),
    pricePaid: int("price_paid").notNull(),
    currency: varchar("currency", { length: 3 }).default("ARS").notNull(),
    priceTypeApplied: priceTypeAppliedEnum.notNull(),
    auraDiscount: int("aura_discount"),
    auraDiscountPercent: int("aura_discount_percent"),
    // Phase 157 (D-23): descuento por referido, materializado en columnas NUEVAS
    // separadas de auraDiscount* — el gasto AURA discrecional escribe aquellas y
    // colisionaría. Los dos mecanismos componen de forma independiente sobre pricePaid.
    // Nullable: NULL en cobros sin descuento por referido.
    referralDiscountPercent: int("referral_discount_percent"),
    referralDiscountAmount: int("referral_discount_amount"),
    boardingPassUsed: boolean("boarding_pass_used").default(false).notNull(),
    priceOverrideAmount: int("price_override_amount"),
    priceOverrideReason: text("price_override_reason"),
    // nullable — NULL for all rows before migration 0136; captures the plan's
    // current price_regular at each new membership charge for the faithful
    // ticket discount (D-05).
    priceRegularSnapshot: int("price_regular_snapshot"),
    pausedAt: timestamp("paused_at"),
    pauseEndDate: date("pause_end_date", { mode: "string" }),
    resumedAt: timestamp("resumed_at"),
    cancelledAt: timestamp("cancelled_at"),
    notes: text("notes"),
    classesRemaining: int("classes_remaining"),
    classesBudget: int("classes_budget"),
    previousSubscriptionId: int("previous_subscription_id"),
    replacementCredits: int("replacement_credits").default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index("idx_subscriptions_user_id").on(table.userId),
    index("idx_subscriptions_plan_id").on(table.planId),
    index("idx_subscriptions_status_end_date").on(table.status, table.endDate),
    index("idx_subscriptions_branch_id").on(table.branchId),
  ],
);

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  user: one(users, {
    fields: [subscriptions.userId],
    references: [users.id],
  }),
  plan: one(subscriptionPlans, {
    fields: [subscriptions.planId],
    references: [subscriptionPlans.id],
  }),
  branch: one(branches, {
    fields: [subscriptions.branchId],
    references: [branches.id],
  }),
}));
