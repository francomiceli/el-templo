-- Backfill orphan program_enrollments + recompute users.status.
--
-- Context: prior to this fix, autoExpireSubscriptions and cancelSubscription
-- only tore down BUNDLE enrollments (grants_all_programs=true). Single-program
-- plans (linkedProgramId) and any case where the bundle teardown failed left
-- program_enrollments rows with status='active' even after the underlying
-- subscription expired/cancelled. The frontend gate
--   canEnterTraining = hasPresencialPlan || allActiveEnrollments.length > 0
-- and the backend /sessions/* gate (resolveSessionView, view=program) accepted
-- those orphan enrollments as valid → users kept consuming Foundation #2 (W*
-- presencial content) and other goal-plan content indefinitely after their
-- sub ended.
--
-- autoExpireSubscriptions also never called recomputeUserStatus, so a member
-- whose sub expired by date kept users.status='activo' forever.
--
-- This migration:
--   1. Cancels every active program_enrollment whose user has NO active,
--      paused, or scheduled subscription (the runtime helpers' new contract).
--      Excludes user 5606 (comunidad@eltemplo.org / Tutorial El Templo —
--      seed account whose sub end_date is set in 2027 but operates as a
--      special-case content host - manual review required separately).
--   2. NULLs users.current_program_enrollment_id when the pointer references
--      any of the just-cancelled rows (mirrors the runtime helper).
--   3. Flips users.status from 'activo' to 'inactivo' for any user with no
--      currently-valid sub. Mirrors recomputeUserStatus exactly: never
--      downgrades freemium/prueba (D-04 — paying history is preserved one
--      direction only).
--
-- All three steps are idempotent: re-running the migration is a no-op once
-- the runtime fix lands and there are no new orphans.

-- Step 1 — cancel orphan program_enrollments
UPDATE program_enrollments pe
INNER JOIN users u ON u.id = pe.user_id
SET pe.status = 'cancelled', pe.cancelled_at = NOW()
WHERE pe.status = 'active'
  AND u.deleted_at IS NULL
  AND u.id <> 5606
  AND NOT EXISTS (
    SELECT 1 FROM subscriptions s
    WHERE s.user_id = pe.user_id
      AND s.subscription_status IN ('active','paused','scheduled')
  );

-- Step 2 — clear stale users.current_program_enrollment_id pointers
UPDATE users u
LEFT JOIN program_enrollments pe ON pe.id = u.current_program_enrollment_id
SET u.current_program_enrollment_id = NULL
WHERE u.current_program_enrollment_id IS NOT NULL
  AND (pe.id IS NULL OR pe.status <> 'active');

-- Step 3 — recompute users.status (mirror src/modules/subscriptions/service.ts
-- recomputeUserStatus). Only the activo→inactivo direction is needed here:
-- users left as activo from the autoExpire bug now flip down. Never touches
-- freemium/prueba (preserves D-04: once paying, can't regress to those).
UPDATE users u
SET u.status = 'inactivo'
WHERE u.status = 'activo'
  AND u.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM subscriptions s
    WHERE s.user_id = u.id
      AND s.subscription_status IN ('active','paused')
      AND s.start_date <= CURDATE()
      AND (s.end_date IS NULL OR s.end_date >= CURDATE())
  );
