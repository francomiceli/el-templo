// Module: audit-log — phase 111
import {
  mysqlTable,
  int,
  varchar,
  json,
  text,
  timestamp,
  index,
} from "drizzle-orm/mysql-core";
import { users } from "./users";
import { tenantIdColumn } from "./tenant-column";

/**
 * Audit log — forensic trail for financial actions.
 *
 * Phase 111. Three core actions: subscription_cancelled, transaction_voided,
 * plan_assigned. Plus 'reconciliation' used by the Phase 111 reconcile
 * migration (Soledad Mailland case).
 *
 * Heterogeneous target_kind / target_id pattern (no FK on target_id) follows
 * transaction_links.ts precedent — referential integrity by target_kind is
 * enforced at the service layer.
 *
 * Writes occur INSIDE the caller's db.transaction(...). Atomicity contract
 * is owned by `auditLog.write` helper in modules/shared/audit-log.ts:
 * the helper accepts a required tx handle and does NOT open its own
 * transaction. If the surrounding transaction rolls back, the audit row
 * vanishes too (T-111-09 mitigation).
 *
 * Tampering mitigation (T-111-05): no code path in Phase 111 issues UPDATE
 * or DELETE on this table. The helper is write-only by design. SQL-level
 * REVOKE UPDATE/DELETE from the app user is deferred to a future phase.
 */
export const auditLog = mysqlTable(
  "audit_log",
  {
    id: int("id").primaryKey().autoincrement(),
    // Fase 167 (COL-01): tenancy. Valor server-side, nunca de payload. Ver src/db/schema/tenant-column.ts
    tenantId: tenantIdColumn(),
    actorId: int("actor_id")
      .references(() => users.id)
      .notNull(),
    action: varchar("action", { length: 50 }).notNull(),
    targetKind: varchar("target_kind", { length: 30 }).notNull(),
    targetId: int("target_id").notNull(),
    payloadJson: json("payload_json")
      .$type<Record<string, unknown>>()
      .notNull(),
    reason: text("reason"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_audit_log_action_created").on(table.action, table.createdAt),
    index("idx_audit_log_target").on(table.targetKind, table.targetId),
    index("idx_audit_log_actor_created").on(table.actorId, table.createdAt),
  ],
);
