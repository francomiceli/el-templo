import { mysqlTable, int, uniqueIndex, index } from "drizzle-orm/mysql-core";
import { users } from "./users";
import { branches } from "./branches";

/**
 * Phase 110 REQ-2: Junction table for staff multi-branch operational scope.
 *
 * Applies ONLY to coach and recepción roles. Each row authorizes the user
 * to operate (read/write/admin) on the linked branch. `canAccessBranch`
 * (shared/branch-access.ts) reads this table for those roles.
 *
 * - admin/gestion are NOT in this table — their scope is country-wide via
 *   `users.country`.
 * - owner is NOT in this table — their scope is global by role.
 * - member is NOT in this table — their access is governed by `users.branch_id`.
 *
 * D-13: `user_branches` IS a security restriction. A coach with rows
 * [Palermo, Belgrano] receives 403 when operating on Caballito.
 *
 * Codebase convention: `id` autoincrement PK + unique index on (user_id, branch_id).
 * This deviates from SPEC R2 literal "PRIMARY KEY (user_id, branch_id)" but
 * follows every existing junction table (blog_post_tags, etc.).
 */
export const userBranches = mysqlTable(
  "user_branches",
  {
    id: int("id").primaryKey().autoincrement(),
    userId: int("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    branchId: int("branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "cascade" }),
  },
  (table) => [
    uniqueIndex("user_branch_unique").on(table.userId, table.branchId),
    index("idx_user_branches_user_id").on(table.userId),
    index("idx_user_branches_branch_id").on(table.branchId),
  ],
);
