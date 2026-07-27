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
  uniqueIndex,
} from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";
import { users } from "./users";
import { tenantIdColumn } from "./tenant-column";

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
    // Fase 167 (COL-01): tenancy. Valor server-side, nunca de payload. Ver src/db/schema/tenant-column.ts
    tenantId: tenantIdColumn(),
    userId: int("user_id")
      .references(() => users.id)
      .notNull(),
    // tenant-global (M8) a proposito: token de push con lookup pre-scope — el token lo emite el dispositivo y se busca por su valor antes de conocer el tenant, asi que componer por tenant seria circular. NO es un olvido de la fase 168: el motivo esta registrado en TENANT_GLOBAL_UNIQUES de src/db/tenant-tables.ts (lista M8, aprobada 2026-07-26, doc 06 §8-Q4).
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

export const notificationTemplates = mysqlTable(
  "notification_templates",
  {
    id: int("id").primaryKey().autoincrement(),
    // Fase 167 (COL-01): tenancy. Valor server-side, nunca de payload. Ver src/db/schema/tenant-column.ts
    tenantId: tenantIdColumn(),
    // Fase 168 (CON-01): la clave de template dejó de ser única global — la unique
    // vive en el callback de tabla como uq_notification_templates_tenant_key.
    templateKey: varchar("template_key", { length: 100 }).notNull(),
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
  },
  (table) => [
    // Fase 168 (CON-01): unicidad POR TENANT — cada gimnasio tiene su propio juego
    // de templates con las mismas claves. Sin índice secundario (D-06):
    // notification_templates es un catálogo chico. Índice byte-for-byte con la
    // migración 0196.
    uniqueIndex("uq_notification_templates_tenant_key").on(
      table.tenantId,
      table.templateKey,
    ),
  ],
);

// ── notification_preferences ────────────────────────────────────────────────

export const notificationPreferences = mysqlTable(
  "notification_preferences",
  {
    id: int("id").primaryKey().autoincrement(),
    // Fase 167 (COL-01): tenancy. Valor server-side, nunca de payload. Ver src/db/schema/tenant-column.ts
    tenantId: tenantIdColumn(),
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
    // Fase 167 (COL-01): tenancy. Valor server-side, nunca de payload. Ver src/db/schema/tenant-column.ts
    tenantId: tenantIdColumn(),
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
