/**
 * WhatsApp Bot Schema
 *
 * Tables for WhatsApp conversations and messages.
 * Used by both the bot process (writes) and API (admin reads).
 */

import {
  mysqlTable,
  int,
  varchar,
  timestamp,
  text,
  json,
  mysqlEnum,
  index,
} from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";
import { users } from "./users";

// ─── Enums ───────────────────────────────────────────────────────────────────

export const conversationStatusEnum = mysqlEnum("conversation_status", [
  "active",
  "human_takeover",
  "closed",
]);

export const clientStateEnum = mysqlEnum("client_state", [
  "lead",
  "trial",
  "active_member",
  "lapsed",
  "returning",
]);

export const messageDirectionEnum = mysqlEnum("message_direction", [
  "inbound",
  "outbound_bot",
  "outbound_human",
]);

export const messageTypeEnum = mysqlEnum("wa_message_type", [
  "text",
  "image",
  "audio",
  "document",
  "template",
]);

// ─── Tables ──────────────────────────────────────────────────────────────────

export const whatsappConversations = mysqlTable(
  "whatsapp_conversations",
  {
    id: int("id").primaryKey().autoincrement(),
    phone: varchar("phone", { length: 20 }).notNull().unique(),
    contactName: varchar("contact_name", { length: 100 }),
    status: conversationStatusEnum.default("active").notNull(),
    clientState: clientStateEnum.default("lead").notNull(),
    assignedAdminId: int("assigned_admin_id").references(() => users.id),
    linkedMemberId: int("linked_member_id").references(() => users.id),
    lastMessageAt: timestamp("last_message_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_wa_conv_status").on(table.status),
    index("idx_wa_conv_linked_member").on(table.linkedMemberId),
    index("idx_wa_conv_last_message").on(table.lastMessageAt),
  ],
);

export const whatsappMessages = mysqlTable(
  "whatsapp_messages",
  {
    id: int("id").primaryKey().autoincrement(),
    conversationId: int("conversation_id")
      .references(() => whatsappConversations.id)
      .notNull(),
    direction: messageDirectionEnum.notNull(),
    content: text("content").notNull(),
    messageType: messageTypeEnum.default("text").notNull(),
    whatsappMessageId: varchar("whatsapp_message_id", { length: 100 }).unique(),
    metadata: json("metadata"),
    rawPayload: json("raw_payload"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_wa_msg_conversation_created").on(
      table.conversationId,
      table.createdAt,
    ),
    index("idx_wa_msg_whatsapp_id").on(table.whatsappMessageId),
  ],
);

// ─── Relations ───────────────────────────────────────────────────────────────

export const whatsappConversationRelations = relations(
  whatsappConversations,
  ({ one, many }) => ({
    assignedAdmin: one(users, {
      fields: [whatsappConversations.assignedAdminId],
      references: [users.id],
      relationName: "assignedAdmin",
    }),
    linkedMember: one(users, {
      fields: [whatsappConversations.linkedMemberId],
      references: [users.id],
      relationName: "linkedMember",
    }),
    messages: many(whatsappMessages),
  }),
);

export const whatsappMessageRelations = relations(
  whatsappMessages,
  ({ one }) => ({
    conversation: one(whatsappConversations, {
      fields: [whatsappMessages.conversationId],
      references: [whatsappConversations.id],
    }),
  }),
);
