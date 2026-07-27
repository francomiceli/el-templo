// Module: member-notes
import {
  mysqlTable,
  int,
  text,
  timestamp,
  index,
} from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";
import { users } from "./users";
import { tenantIdColumn } from "./tenant-column";

export const memberNotes = mysqlTable(
  "member_notes",
  {
    id: int("id").primaryKey().autoincrement(),
    // Fase 167 (COL-01): tenancy. Valor server-side, nunca de payload. Ver src/db/schema/tenant-column.ts
    tenantId: tenantIdColumn(),
    userId: int("user_id")
      .references(() => users.id)
      .notNull(),
    authorId: int("author_id")
      .references(() => users.id)
      .notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (t) => ({
    userIdx: index("idx_member_notes_user_id").on(t.userId),
  }),
);

export const memberNotesRelations = relations(memberNotes, ({ one }) => ({
  user: one(users, {
    fields: [memberNotes.userId],
    references: [users.id],
    relationName: "memberNotes",
  }),
  author: one(users, {
    fields: [memberNotes.authorId],
    references: [users.id],
    relationName: "authoredNotes",
  }),
}));
