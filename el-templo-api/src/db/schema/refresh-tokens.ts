// Module: refresh-tokens — phase 116
import {
  mysqlTable,
  int,
  varchar,
  timestamp,
  index,
  type AnyMySqlColumn,
} from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";
import { users } from "./users";
import { tenantIdColumn } from "./tenant-column";

/**
 * Refresh tokens — long-lived (30d sliding) session credentials.
 *
 * Phase 116. Replaces the single 7d JWT with access (30m) + refresh (30d)
 * scheme with mandatory rotation and reuse detection.
 *
 * Security (T-116-01): only the sha256 hex of the opaque token is persisted
 * in `token_hash`. The plaintext token is NEVER written to the DB — it is
 * returned to the client once on issue/rotate and only re-derived for lookup
 * via sha256 on subsequent calls.
 *
 * Rotation (T-116-02): on rotate, the old row is marked `revoked_at = NOW()`
 * and `replaced_by_id` points to the new row. Replaying a rotated (already
 * revoked) token revokes the whole family for that user.
 *
 * FK user_id ON DELETE CASCADE is a future-proofing defense (D-05): current
 * delete-account is a soft-delete (anonymize + deletedAt), so the cascade does
 * not fire today — explicit revocation lives in the route handlers (Plan 02).
 */
export const refreshTokens = mysqlTable(
  "refresh_tokens",
  {
    id: int("id").primaryKey().autoincrement(),
    // Fase 167 (COL-01): tenancy. Valor server-side, nunca de payload. Ver src/db/schema/tenant-column.ts
    tenantId: tenantIdColumn(),
    userId: int("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
    expiresAt: timestamp("expires_at").notNull(),
    revokedAt: timestamp("revoked_at"),
    replacedById: int("replaced_by_id").references(
      (): AnyMySqlColumn => refreshTokens.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("idx_refresh_tokens_user_id").on(table.userId)],
);

export const refreshTokensRelations = relations(refreshTokens, ({ one }) => ({
  user: one(users, {
    fields: [refreshTokens.userId],
    references: [users.id],
  }),
}));
