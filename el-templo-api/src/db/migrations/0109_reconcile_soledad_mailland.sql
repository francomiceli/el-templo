-- Phase 111: Salvaguardas operativas - reconciliacion caso Soledad Mailland
--
-- Background. On 30/04/2026 a member (Soledad Mailland) ended up with two
-- parallel accounts after a failed virtual-to-physical conversion. Account
-- 5588 was soft-deleted and account 5912 is the active one on branch 1.
-- Financial state was left inconsistent. This migration atomically fixes:
--
--   1. financial_transactions id 34 was attributed to member 5588
--      (deleted). Reassign to member 5912.
--   2. transaction_links for tx 34 pointed at sub 6132 (cancelled).
--      Move to sub 6382 (active scheduled, the live one for member 5912).
--   3. Orphan balances rows 14, 16, 20 reference cancelled subs of the
--      deleted account. Delete them.
--   4. balance for sub 6382 shows 65000 ARS owed even though the cash
--      already entered the system. After step 2 reassigns the link, the
--      next applyDelta touch would recompute it to zero. We explicitly
--      set the amount to 0 so the state is correct without waiting for
--      a touch (per CONTEXT D-19, eliminating the inseguro lazy path).
--   5. program_enrollments id 1125 has status active under the deleted
--      user 5588. Mark cancelled.
--   6. Insert an audit_log row documenting the reconciliation.
--
-- Idempotency. The _migrations tracker prevents this file from running
-- twice through pnpm db:migrate. Defensive WHERE clauses also make manual
-- re-application a no-op. Each UPDATE checks the BEFORE state in WHERE so
-- a row already migrated will not be touched. DELETE is naturally
-- idempotent. INSERT uses NOT EXISTS guard.
--
-- Audit actor. There is no real admin actor for this migration. We use
-- the first user with role owner. If staging or production has no owner
-- role, fall back to user id 1 (the founder seed). Verify with
--   SELECT id, role FROM users WHERE role = owner ORDER BY id LIMIT 1
-- before running pnpm db:migrate.
--
-- Note (Phase 103-01 precedent): SQL line comments must NOT contain
-- inline semicolons because run-migrations.ts splits the file on the
-- semicolon BEFORE stripping comments.

UPDATE financial_transactions
SET member_id = 5912
WHERE id = 34 AND member_id = 5588;

UPDATE transaction_links
SET target_id = 6382
WHERE transaction_id = 34
  AND target_kind = 'subscription'
  AND target_id = 6132;

DELETE FROM balances
WHERE id IN (14, 16, 20)
  AND member_id IN (5588, 5912);

UPDATE balances
SET amount = 0
WHERE target_kind = 'subscription'
  AND target_id = 6382
  AND amount <> 0;

UPDATE program_enrollments
SET status = 'cancelled', cancelled_at = NOW()
WHERE id = 1125 AND status = 'active';

INSERT INTO audit_log (actor_id, action, target_kind, target_id, payload_json, reason, created_at)
SELECT
  COALESCE(
    (SELECT id FROM users WHERE role = 'owner' ORDER BY id LIMIT 1),
    1
  ),
  'reconciliation',
  'member',
  5912,
  JSON_OBJECT(
    'originalMember', 5588,
    'mergedInto', 5912,
    'actions', JSON_ARRAY('tx_reassigned', 'link_moved', 'balances_cleared', 'balance_zeroed', 'enrollment_cancelled'),
    'transactionId', 34,
    'fromSubId', 6132,
    'toSubId', 6382,
    'enrollmentId', 1125
  ),
  'Reconciliación caso Soledad Mailland — phase 111',
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM audit_log
  WHERE action = 'reconciliation'
    AND target_id = 5912
    AND reason LIKE 'Reconciliación caso Soledad Mailland%'
);
