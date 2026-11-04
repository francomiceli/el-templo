// Module: office — Fase 205 (Oficina, central de temas de gestión)
import {
  mysqlTable,
  int,
  varchar,
  text,
  timestamp,
  json,
  index,
  uniqueIndex,
} from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";
import { users } from "./users";
import { branches } from "./branches";
import { tenantIdColumn } from "./tenant-column";

/**
 * Fase 205 (Oficina), migración 0320. Cinco tablas gym-owned que nacen strict
 * (módulo `office`): tenant_id NOT NULL DEFAULT 1 + FK, y todo UNIQUE empieza
 * por `tenantId`.
 *
 * `status` y `origin` son varchar con uniones TS (no mysqlEnum), igual que el
 * resto de los estados nuevos.
 */

// ── Tipos de dominio ────────────────────────────────────────────────

export const OFFICE_TOPIC_STATUSES = ["abierto", "dormido", "cerrado"] as const;
export type OfficeTopicStatus = (typeof OFFICE_TOPIC_STATUSES)[number];

export const OFFICE_TOPIC_ORIGINS = ["manual", "sistema"] as const;
export type OfficeTopicOrigin = (typeof OFFICE_TOPIC_ORIGINS)[number];

export const OFFICE_TARGET_KINDS = [
  "socio",
  "jornada",
  "wellhub_evento",
  "horario",
  // 205 (D-23/D-24/D-25): vínculos que solo crea el job de temas automáticos.
  "caja",
  "sede",
  "tablero",
] as const;
export type OfficeTargetKind = (typeof OFFICE_TARGET_KINDS)[number];

export const OFFICE_EVENT_TYPES = [
  "creado",
  "comentario",
  "asignado",
  "tomado",
  "desasignado",
  "dormido",
  "cerrado",
  "reabierto",
  "editado",
  "sistema",
] as const;
export type OfficeEventType = (typeof OFFICE_EVENT_TYPES)[number];

// ── Tablas ──────────────────────────────────────────────────────────

export const officeTopics = mysqlTable(
  "office_topics",
  {
    id: int("id").primaryKey().autoincrement(),
    tenantId: tenantIdColumn(),
    title: varchar("title", { length: 160 }).notNull(),
    body: text("body"),
    status: varchar("status", { length: 16 })
      .$type<OfficeTopicStatus>()
      .default("abierto")
      .notNull(),
    origin: varchar("origin", { length: 16 })
      .$type<OfficeTopicOrigin>()
      .default("manual")
      .notNull(),
    sourceKey: varchar("source_key", { length: 120 }),
    targetKind: varchar("target_kind", {
      length: 32,
    }).$type<OfficeTargetKind>(),
    targetId: int("target_id"),
    targetLabel: varchar("target_label", { length: 160 }),
    branchId: int("branch_id").references(() => branches.id, {
      onDelete: "set null",
    }),
    createdBy: int("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    closedBy: int("closed_by").references(() => users.id, {
      onDelete: "set null",
    }),
    closedAt: timestamp("closed_at"),
    snoozedUntil: varchar("snoozed_until", { length: 10 }),
    lastActivityAt: timestamp("last_activity_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    uniqueIndex("uq_office_topics_tenant_source").on(
      table.tenantId,
      table.sourceKey,
    ),
    index("idx_office_topics_tenant_status_activity").on(
      table.tenantId,
      table.status,
      table.lastActivityAt,
    ),
    index("idx_office_topics_tenant_target").on(
      table.tenantId,
      table.targetKind,
      table.targetId,
    ),
  ],
);

// Responsables del tema: varios por tema (conjunto), sin orden propio.
export const officeTopicAssignees = mysqlTable(
  "office_topic_assignees",
  {
    id: int("id").primaryKey().autoincrement(),
    tenantId: tenantIdColumn(),
    topicId: int("topic_id")
      .references(() => officeTopics.id, { onDelete: "cascade" })
      .notNull(),
    userId: int("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("uq_office_topic_assignees_tenant_topic_user").on(
      table.tenantId,
      table.topicId,
      table.userId,
    ),
    index("idx_office_topic_assignees_tenant_user").on(
      table.tenantId,
      table.userId,
    ),
  ],
);

export const officeTopicEvents = mysqlTable(
  "office_topic_events",
  {
    id: int("id").primaryKey().autoincrement(),
    tenantId: tenantIdColumn(),
    topicId: int("topic_id")
      .references(() => officeTopics.id, { onDelete: "cascade" })
      .notNull(),
    // NULL = el sistema (job) hizo el cambio.
    actorId: int("actor_id").references(() => users.id, {
      onDelete: "set null",
    }),
    type: varchar("type", { length: 24 }).$type<OfficeEventType>().notNull(),
    body: text("body"),
    payload: json("payload").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_office_topic_events_tenant_topic").on(
      table.tenantId,
      table.topicId,
      table.createdAt,
    ),
  ],
);

export const officeTopicReads = mysqlTable(
  "office_topic_reads",
  {
    id: int("id").primaryKey().autoincrement(),
    tenantId: tenantIdColumn(),
    topicId: int("topic_id")
      .references(() => officeTopics.id, { onDelete: "cascade" })
      .notNull(),
    userId: int("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("uq_office_topic_reads_tenant_topic_user").on(
      table.tenantId,
      table.topicId,
      table.userId,
    ),
    index("idx_office_topic_reads_tenant_user").on(
      table.tenantId,
      table.userId,
    ),
  ],
);

export const officeMentions = mysqlTable(
  "office_mentions",
  {
    id: int("id").primaryKey().autoincrement(),
    tenantId: tenantIdColumn(),
    topicId: int("topic_id")
      .references(() => officeTopics.id, { onDelete: "cascade" })
      .notNull(),
    eventId: int("event_id")
      .references(() => officeTopicEvents.id, { onDelete: "cascade" })
      .notNull(),
    userId: int("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    readAt: timestamp("read_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("uq_office_mentions_tenant_event_user").on(
      table.tenantId,
      table.eventId,
      table.userId,
    ),
    index("idx_office_mentions_tenant_user_read").on(
      table.tenantId,
      table.userId,
      table.readAt,
    ),
  ],
);

/**
 * Avisos automáticos silenciados (migración 0321). Fila presente = el detector
 * `detector` está apagado para el gimnasio entero (`branchId = 0`) o para una
 * sede; ausencia = activo. `branch_id = 0` es "todo el gimnasio", por eso no
 * lleva FK a `branches`. La unique empieza por `tenantId`.
 */
export const officeAutoTopicMutes = mysqlTable(
  "office_auto_topic_mutes",
  {
    id: int("id").primaryKey().autoincrement(),
    tenantId: tenantIdColumn(),
    detector: varchar("detector", { length: 40 }).notNull(),
    branchId: int("branch_id").default(0).notNull(),
    createdBy: int("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("uq_office_auto_topic_mutes_tenant_detector_branch").on(
      table.tenantId,
      table.detector,
      table.branchId,
    ),
  ],
);

// ── Relations ───────────────────────────────────────────────────────

export const officeTopicsRelations = relations(
  officeTopics,
  ({ one, many }) => ({
    creator: one(users, {
      fields: [officeTopics.createdBy],
      references: [users.id],
      relationName: "officeTopicCreator",
    }),
    events: many(officeTopicEvents),
    assignees: many(officeTopicAssignees),
  }),
);

export const officeTopicAssigneesRelations = relations(
  officeTopicAssignees,
  ({ one }) => ({
    topic: one(officeTopics, {
      fields: [officeTopicAssignees.topicId],
      references: [officeTopics.id],
    }),
    user: one(users, {
      fields: [officeTopicAssignees.userId],
      references: [users.id],
    }),
  }),
);

export const officeTopicEventsRelations = relations(
  officeTopicEvents,
  ({ one }) => ({
    topic: one(officeTopics, {
      fields: [officeTopicEvents.topicId],
      references: [officeTopics.id],
    }),
    actor: one(users, {
      fields: [officeTopicEvents.actorId],
      references: [users.id],
    }),
  }),
);

// ── Tipos inferidos ─────────────────────────────────────────────────

export type OfficeTopicRow = typeof officeTopics.$inferSelect;
export type OfficeTopicAssigneeRow = typeof officeTopicAssignees.$inferSelect;
export type OfficeTopicEventRow = typeof officeTopicEvents.$inferSelect;
export type OfficeTopicReadRow = typeof officeTopicReads.$inferSelect;
export type OfficeMentionRow = typeof officeMentions.$inferSelect;
export type OfficeAutoTopicMuteRow = typeof officeAutoTopicMutes.$inferSelect;
