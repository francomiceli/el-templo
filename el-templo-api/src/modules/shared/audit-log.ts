// Module: shared — phase 111, migrado a tenancy en la 173-04 (D-01/T-173-04-01)
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
//
// Fase 173-04 (D-01, T-173-04-01): `ctx: TenantContext` es el PRIMER
// parámetro, ANTES de `tx`. `audit_log` va a entrar a `TENANT_STRICT_MODULES`
// en el switch de esta fase (users, plan del switch) y esta función es su
// única entrada de escritura — un call site viejo con los argumentos
// corridos NO COMPILA, en vez de escribir una auditoría sin gimnasio en
// silencio. El insert pasa por
// `tenantValues(ctx, {...})` con el tenant estampado DESPUÉS del spread, así
// que un `tenantId` que viniera dentro del payload no puede ganar
// (mitigación de mass-assignment a nivel de tipo y de runtime). `tenant_id`
// jamás sale de payload ni de JWT — ver `shared/tenant.ts`.
import { auditLog as auditLogTable } from "../../db/schema/audit-log";
import type { TxHandle } from "../finance/balance-service";
import { tenantValues, type TenantContext } from "./tenant";

export type AuditAction =
  | "subscription_cancelled"
  | "transaction_voided"
  | "plan_assigned"
  | "reconciliation"
  | "days_compensated"
  // Phase 137 (D-08): validation state machine transitions reuse audit-log
  // instead of a dedicated validation_events table. targetKind 'transaction'
  // already exists below — no change there.
  | "transaction_validated"
  | "transaction_observed"
  | "transaction_corrected";

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
 *
 * Fase 173-04 (D-01): `ctx` PRIMERO, antes de `tx`. Un call site que todavía
 * pase `(tx, params)` queda con los argumentos corridos y no compila.
 */
export const auditLog = {
  async write(
    ctx: TenantContext,
    tx: TxHandle,
    params: AuditWriteParams,
  ): Promise<void> {
    await tx.insert(auditLogTable).values(
      tenantValues(ctx, {
        actorId: params.actorId,
        action: params.action,
        targetKind: params.targetKind,
        targetId: params.targetId,
        payloadJson: params.payload,
        reason: params.reason ?? null,
      }),
    );
  },
};
