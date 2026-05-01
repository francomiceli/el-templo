// Module: shared — phase 111
//
// Audit log helper. The atomicity contract (D-14) is owned here:
//
//   - `tx` is REQUIRED (not optional) — every Phase 111 call site already
//     wraps in db.transaction(...). Forcing the caller to pass `tx` makes
//     it impossible to write an audit row outside a transaction.
//
//   - The helper does NOT open its own transaction. If the caller's
//     surrounding transaction rolls back, the audit row vanishes too
//     (T-111-09 mitigation).
//
//   - The helper is write-only by design. There is no update / delete
//     surface. Tampering mitigation T-111-05 (REVOKE UPDATE/DELETE at
//     the SQL level) is deferred to a future phase.
//
// Repudiation mitigation T-111-07: actorId is sourced from the
// authenticated principal (request.user.userId) at the route layer. This
// helper does NOT infer the actor — it must be passed explicitly.

import { auditLog as auditLogTable } from "../../db/schema/audit-log";
import type { TxHandle } from "../finance/balance-service";

export type AuditAction =
  | "subscription_cancelled"
  | "transaction_voided"
  | "plan_assigned"
  | "reconciliation";

export type AuditTargetKind = "subscription" | "transaction" | "member";

export interface AuditWriteParams {
  actorId: number;
  action: AuditAction;
  targetKind: AuditTargetKind;
  targetId: number;
  payload: Record<string, unknown>;
  reason?: string | null;
}

/**
 * Write a single audit_log row inside the caller's transaction.
 *
 * Per CONTEXT D-14: helper does NOT open its own transaction — atomicity
 * is the caller's responsibility (the audit row must rollback together
 * with the main action it records).
 */
export const auditLog = {
  async write(tx: TxHandle, params: AuditWriteParams): Promise<void> {
    await tx.insert(auditLogTable).values({
      actorId: params.actorId,
      action: params.action,
      targetKind: params.targetKind,
      targetId: params.targetId,
      payloadJson: params.payload,
      reason: params.reason ?? null,
    });
  },
};
