// Module: campaigns — phase 119 (D-12, D-15, D-18)
import {
  mysqlTable,
  int,
  varchar,
  text,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";
import { users } from "./users";

/**
 * Reusable email-campaign schema (Phase 119, D-12).
 *
 * FOUNDATION tables for any future marketing/transactional broadcast over
 * Resend, not just the freemium trial campaign. Four tables:
 *
 *   - campaigns            — one row per broadcast (subject + lifecycle status).
 *   - campaign_sends       — one row per (campaign, recipient) with an email
 *                            snapshot + Resend message id. UNIQUE(campaign_id,
 *                            user_id) gives audience idempotency (D-12): a user
 *                            cannot be double-enrolled in the same campaign, so
 *                            re-running send() converges instead of duplicating.
 *   - campaign_events      — forward-only open/click/bounce tracking (D-18),
 *                            mirroring user-status-history's append-only ethos.
 *                            index(send_id, type) backs the funnel aggregates.
 *   - campaign_unsubscribes — marketing suppression list (D-15). UNIQUE(email)
 *                            makes unsubscribe idempotent so duplicate rows
 *                            cannot dilute the NOT EXISTS audience filter.
 *
 * Soft-enum convention: status / type are varchar(16) (no DB enum) consistent
 * with user-status-history.ts `source`. All FKs to users/campaigns use
 * ON DELETE CASCADE (future-proofing — delete-account is soft today).
 */
export const campaigns = mysqlTable("campaigns", {
  id: int("id").primaryKey().autoincrement(),
  name: varchar("name", { length: 255 }).notNull(),
  subject: varchar("subject", { length: 255 }).notNull(),
  // 'draft' | 'sending' | 'sent'
  status: varchar("status", { length: 16 }).notNull().default("draft"),
  createdBy: int("created_by")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  // Optional country scope ('AR' | 'ES'); NULL = global.
  country: varchar("country", { length: 2 }),
  // Phase 119 (CR-02): the admin-entered email copy (copySlots), persisted so
  // the send pipeline renders the real headline/subheadline/body instead of
  // hard-coded placeholders. headline mirrors the schema's 255-char limit;
  // body is TEXT (schema allows up to 5000 chars).
  headline: varchar("headline", { length: 255 }),
  subheadline: varchar("subheadline", { length: 255 }),
  body: text("body"),
  // Self-hosted hero image URL (D-27); stored as-is, never fetched.
  heroImageUrl: varchar("hero_image_url", { length: 500 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  sentAt: timestamp("sent_at"),
});

export const campaignSends = mysqlTable(
  "campaign_sends",
  {
    id: int("id").primaryKey().autoincrement(),
    campaignId: int("campaign_id")
      .references(() => campaigns.id, { onDelete: "cascade" })
      .notNull(),
    userId: int("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    // Email snapshot at send time (the user's email may change later).
    email: varchar("email", { length: 255 }).notNull(),
    // 'pending' | 'sent' | 'bounced' | 'failed'
    status: varchar("status", { length: 16 }).notNull().default("pending"),
    resendMessageId: varchar("resend_message_id", { length: 64 }),
    sentAt: timestamp("sent_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    // Audience idempotency (D-12): one send per (campaign, user).
    uniqueIndex("uniq_campaign_user").on(table.campaignId, table.userId),
  ],
);

export const campaignEvents = mysqlTable(
  "campaign_events",
  {
    id: int("id").primaryKey().autoincrement(),
    sendId: int("send_id")
      .references(() => campaignSends.id, { onDelete: "cascade" })
      .notNull(),
    // 'open' | 'click' | 'bounce'
    type: varchar("type", { length: 16 }).notNull(),
    // Optional tracking metadata (e.g. click destination); forward-only.
    metadata: varchar("metadata", { length: 512 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    // Backs the funnel aggregates (D-18): COUNT(DISTINCT send_id) per type.
    index("idx_campaign_events_send_type").on(table.sendId, table.type),
  ],
);

export const campaignUnsubscribes = mysqlTable(
  "campaign_unsubscribes",
  {
    id: int("id").primaryKey().autoincrement(),
    userId: int("user_id").references(() => users.id, { onDelete: "cascade" }),
    email: varchar("email", { length: 255 }).notNull(),
    campaignId: int("campaign_id").references(() => campaigns.id, {
      onDelete: "cascade",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    // Suppression idempotency (D-15): one unsubscribe row per email.
    uniqueIndex("uniq_campaign_unsubscribe_email").on(table.email),
  ],
);

export const campaignsRelations = relations(campaigns, ({ many, one }) => ({
  sends: many(campaignSends),
  createdByUser: one(users, {
    fields: [campaigns.createdBy],
    references: [users.id],
  }),
}));

export const campaignSendsRelations = relations(
  campaignSends,
  ({ one, many }) => ({
    campaign: one(campaigns, {
      fields: [campaignSends.campaignId],
      references: [campaigns.id],
    }),
    user: one(users, {
      fields: [campaignSends.userId],
      references: [users.id],
    }),
    events: many(campaignEvents),
  }),
);

export const campaignEventsRelations = relations(campaignEvents, ({ one }) => ({
  send: one(campaignSends, {
    fields: [campaignEvents.sendId],
    references: [campaignSends.id],
  }),
}));
