// Module: user-status-history — phase 117 (D-10)
import {
  mysqlTable,
  int,
  varchar,
  timestamp,
  index,
  mysqlEnum,
} from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";
import { users, USER_STATUS_VALUES } from "./users";

/**
 * User status history — forward-only audit of `users.status` transitions.
 *
 * Phase 117 (D-10). FOUNDATION table: it starts accumulating transitions now
 * but is NOT consumed in this phase. Phase 118 (funnel de conversión
 * freemium→prueba→activo + retención por cohortes de ciclos) reads it.
 *
 * Each row records a single forward transition of `users.status`
 * (`freemium|prueba|activo|inactivo`). `from_status` is nullable because the
 * very first recorded transition (e.g. the initial state seeded by the
 * backfill) has no prior origin. `source` distinguishes how the row was
 * created:
 *   - 'recompute' — written by SubscriptionService.recomputeUserStatus when a
 *     subscription create/cancel/renew effectively changes the status.
 *   - 'backfill'  — written by migration 0129 reconstructing approximate history.
 *   - 'admin'     — reserved for future admin-driven status flips.
 *
 * `changed_at` defaults to NOW(). The (user_id, changed_at) composite index
 * backs the cohort/retention queries of Phase 118; the single-column user_id
 * index backs per-user lookups.
 *
 * FK user_id ON DELETE CASCADE mirrors refresh-tokens.ts. Current
 * delete-account is a soft-delete (anonymize + deletedAt) so the cascade does
 * not fire today — it is future-proofing.
 */
export const userStatusHistory = mysqlTable(
  "user_status_history",
  {
    id: int("id").primaryKey().autoincrement(),
    userId: int("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    fromStatus: mysqlEnum("from_status", USER_STATUS_VALUES),
    toStatus: mysqlEnum("to_status", USER_STATUS_VALUES).notNull(),
    source: varchar("source", { length: 16 }).notNull().default("recompute"),
    changedAt: timestamp("changed_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_user_status_history_user_id").on(table.userId),
    index("idx_user_status_history_user_changed").on(
      table.userId,
      table.changedAt,
    ),
  ],
);

export const userStatusHistoryRelations = relations(
  userStatusHistory,
  ({ one }) => ({
    user: one(users, {
      fields: [userStatusHistory.userId],
      references: [users.id],
    }),
  }),
);
