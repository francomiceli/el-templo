import {
  mysqlTable,
  int,
  varchar,
  text,
  timestamp,
  mysqlEnum,
  boolean,
  json,
  index,
  unique,
  uniqueIndex,
} from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";
import type { AnyMySqlColumn } from "drizzle-orm/mysql-core";
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

// Pedido de Franco (2026-09-03): homogeneidad sistema/propias -- 'system'
// son las 17 filas de TEMPLATE_SEEDS (types.ts), 'custom' las que crea el
// admin con una condicion recetada (ver notificationTriggerTypeEnum abajo).
export const notificationTemplateKindEnum = mysqlEnum(
  "kind",
  ["system", "custom"],
);

// Catalogo cerrado de condiciones recetadas. Fuente de verdad del
// vocabulario + validacion de rango: src/modules/notifications/rules.ts
// (RULE_TRIGGERS) -- mantenerlos sincronizados es responsabilidad de quien
// toque cualquiera de los dos.
export const notificationTriggerTypeEnum = mysqlEnum("trigger_type", [
  "plan_expires_in_days",
  "plan_expired_days_ago",
  "days_without_attendance",
  "member_since_days",
  "segment_is",
]);

// Pedido de Franco (2026-09-03): mismos VALORES que `memberSegmentEnum` de
// member-profiles.ts (byte a byte), pero un `mysqlEnum` PROPIO — su 1er
// argumento es el nombre de columna físico (trampa documentada en
// `reference_drizzle_enum_column_name.md`), así que reusar directamente
// `memberSegmentEnum` (bound a "member_segment") haría que Drizzle emita
// esa columna en vez de "trigger_segment" (bug real, encontrado por
// test/notifications/custom-rules-engine.test.ts: ER_BAD_FIELD_ERROR
// "Unknown column 'member_segment'"). Mantener sincronizados los VALORES
// de los dos enums es responsabilidad de quien toque cualquiera.
export const notificationTriggerSegmentEnum = mysqlEnum("trigger_segment", [
  "optima",
  "regular",
  "alerta",
  "ausente",
]);

// Fase 193 (D-01): mismo vocabulario que `modules/communications/destinations.ts`
// (DestinationType). Duplicado a proposito -- ese modulo es puro (sin db) y
// este archivo es el unico lugar del repo donde un mysqlEnum define un tipo
// de columna fisica; mantenerlos sincronizados es responsabilidad de quien
// toque cualquiera de los dos (mismo criterio de "espejo sin paquete
// compartido" que ya usan los otros dos espejos de destinations.ts).
export const destinationTypeEnum = mysqlEnum("destination_type", [
  "app_section",
  "whatsapp_sales",
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
    // Fase 193 (D-04): `route` NO se borra — es la ruta de FALLBACK que
    // consume la app vieja y los callers internos (`queueNotification` con
    // `routeOverride`, `TEMPLATE_SEEDS`). El destino nuevo viaja en las 3
    // columnas de abajo.
    route: varchar("route", { length: 200 }).default("/mi-templo"),
    destinationType: destinationTypeEnum.default("app_section").notNull(),
    destinationSection: varchar("destination_section", { length: 40 }),
    whatsappText: varchar("whatsapp_text", { length: 300 }),
    isEnabled: boolean("is_enabled").default(true).notNull(),
    sentCount: int("sent_count").default(0).notNull(),
    openedCount: int("opened_count").default(0).notNull(),
    // Pedido de Franco (2026-09-03, migración 0219): homogeneidad
    // sistema/propias + reglas recetadas para las propias.
    kind: notificationTemplateKindEnum.default("system").notNull(),
    name: varchar("name", { length: 120 }),
    triggerType: notificationTriggerTypeEnum,
    triggerValue: int("trigger_value"),
    triggerSegment: notificationTriggerSegmentEnum,
    scopeBranchIds: json("scope_branch_ids").$type<number[] | null>(),
    scopeCountries: json("scope_countries").$type<string[] | null>(),
    cooldownDays: int("cooldown_days").default(30).notNull(),
    createdBy: int("created_by").references(
      (): AnyMySqlColumn => users.id,
      { onDelete: "set null" },
    ),
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
    // Migración 0219: el motor de reglas (jobs/notification-rules.ts)
    // filtra por tenant + kind='custom' una vez por gimnasio, todos los días.
    index("idx_notification_templates_tenant_kind").on(
      table.tenantId,
      table.kind,
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
    // Migración 0219: ON DELETE SET NULL -- ahora se puede borrar CUALQUIER
    // template (homogéneo, también los de sistema); el histórico de
    // pending_notifications ya enviadas queda con template_id NULL.
    templateId: int("template_id").references(
      () => notificationTemplates.id,
      { onDelete: "set null" },
    ),
    title: varchar("title", { length: 200 }).notNull(),
    body: text("body").notNull(),
    // Fase 193 (D-04): `route` NO se borra — es la ruta de FALLBACK que
    // consume la app vieja y los callers internos (`queueNotification` con
    // `routeOverride`, `TEMPLATE_SEEDS`). El destino nuevo viaja en las 3
    // columnas de abajo.
    route: varchar("route", { length: 200 }).default("/mi-templo"),
    destinationType: destinationTypeEnum.default("app_section").notNull(),
    destinationSection: varchar("destination_section", { length: 40 }),
    whatsappText: varchar("whatsapp_text", { length: 300 }),
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
