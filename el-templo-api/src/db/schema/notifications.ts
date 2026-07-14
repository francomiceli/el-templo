import {
  mysqlTable,
  int,
  varchar,
  text,
  timestamp,
  mysqlEnum,
  boolean,
  index,
  unique,
} from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";
import { users } from "./users";

// Shared enum: used by both notification_templates and notification_preferences
export const notificationCategoryEnum = mysqlEnum("notification_category", [
  "entrenamiento",
  "programas",
  "motivacion",
  "anuncios",
  "planes",
  "referidos",
]);

export const notificationStatusEnum = mysqlEnum("notification_status", [
  "pending",
  "sent",
  "failed",
]);

export const devicePlatformEnum = mysqlEnum("device_platform", [
  "android",
  "ios",
]);

// ── device_tokens ───────────────────────────────────────────────────────────

export const deviceTokens = mysqlTable(
  "device_tokens",
  {
    id: int("id").primaryKey().autoincrement(),
    userId: int("user_id")
      .references(() => users.id)
      .notNull(),
    token: varchar("token", { length: 500 }).notNull().unique(),
    platform: devicePlatformEnum.notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [index("idx_device_tokens_user_id").on(table.userId)],
);

export const deviceTokensRelations = relations(deviceTokens, ({ one }) => ({
  user: one(users, {
    fields: [deviceTokens.userId],
    references: [users.id],
  }),
}));

// ── notification_templates ──────────────────────────────────────────────────

export const notificationTemplates = mysqlTable("notification_templates", {
  id: int("id").primaryKey().autoincrement(),
  templateKey: varchar("template_key", { length: 100 }).notNull().unique(),
  category: notificationCategoryEnum.notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  body: text("body").notNull(),
  titleFemale: varchar("title_female", { length: 200 }),
  bodyFemale: text("body_female"),
  route: varchar("route", { length: 200 }).default("/mi-templo"),
  isEnabled: boolean("is_enabled").default(true).notNull(),
  sentCount: int("sent_count").default(0).notNull(),
  openedCount: int("opened_count").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

// ── notification_preferences ────────────────────────────────────────────────

export const notificationPreferences = mysqlTable(
  "notification_preferences",
  {
    id: int("id").primaryKey().autoincrement(),
    userId: int("user_id")
      .references(() => users.id)
      .notNull(),
    category: notificationCategoryEnum.notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    unique("uq_notification_preferences_user_category").on(
      table.userId,
      table.category,
    ),
    index("idx_notification_preferences_user_id").on(table.userId),
  ],
);

export const notificationPreferencesRelations = relations(
  notificationPreferences,
  ({ one }) => ({
    user: one(users, {
      fields: [notificationPreferences.userId],
      references: [users.id],
    }),
  }),
);

// ── pending_notifications ───────────────────────────────────────────────────

export const pendingNotifications = mysqlTable(
  "pending_notifications",
  {
    id: int("id").primaryKey().autoincrement(),
    userId: int("user_id")
      .references(() => users.id)
      .notNull(),
    templateId: int("template_id").references(() => notificationTemplates.id),
    title: varchar("title", { length: 200 }).notNull(),
    body: text("body").notNull(),
    route: varchar("route", { length: 200 }).default("/mi-templo"),
    status: notificationStatusEnum.default("pending").notNull(),
    scheduledAt: timestamp("scheduled_at").notNull(),
    sentAt: timestamp("sent_at"),
    errorMessage: varchar("error_message", { length: 500 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_pending_notifications_queue").on(
      table.status,
      table.scheduledAt,
    ),
    index("idx_pending_notifications_user_id").on(table.userId),
  ],
);

export const pendingNotificationsRelations = relations(
  pendingNotifications,
  ({ one }) => ({
    user: one(users, {
      fields: [pendingNotifications.userId],
      references: [users.id],
    }),
    template: one(notificationTemplates, {
      fields: [pendingNotifications.templateId],
      references: [notificationTemplates.id],
    }),
  }),
);
