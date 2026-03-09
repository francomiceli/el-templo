// Module: payments
import {
  mysqlTable,
  int,
  varchar,
  text,
  timestamp,
  date,
  mysqlEnum,
  index,
} from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";
import { users } from "./users";
import { subscriptions } from "./subscriptions";

export const paymentMethodEnum = mysqlEnum("payment_method", [
  "cash",
  "transfer",
  "card",
]);

export const payments = mysqlTable(
  "payments",
  {
    id: int("id").primaryKey().autoincrement(),
    memberId: int("member_id")
      .references(() => users.id)
      .notNull(),
    subscriptionId: int("subscription_id").references(() => subscriptions.id),
    amount: int("amount").notNull(),
    paymentMethod: paymentMethodEnum.notNull(),
    paymentDate: date("payment_date", { mode: "string" }).notNull(),
    reference: varchar("reference", { length: 255 }),
    notes: text("notes"),
    recordedBy: int("recorded_by")
      .references(() => users.id)
      .notNull(),
    voidedAt: timestamp("voided_at"),
    voidedBy: int("voided_by").references(() => users.id),
    voidReason: text("void_reason"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_payments_member_id").on(table.memberId),
    index("idx_payments_subscription_id").on(table.subscriptionId),
  ],
);

export const paymentsRelations = relations(payments, ({ one }) => ({
  member: one(users, {
    fields: [payments.memberId],
    references: [users.id],
    relationName: "paymentMember",
  }),
  recorder: one(users, {
    fields: [payments.recordedBy],
    references: [users.id],
    relationName: "paymentRecorder",
  }),
  voider: one(users, {
    fields: [payments.voidedBy],
    references: [users.id],
    relationName: "paymentVoider",
  }),
  subscription: one(subscriptions, {
    fields: [payments.subscriptionId],
    references: [subscriptions.id],
  }),
}));
