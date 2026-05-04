-- Phase 112: program_enrollments add-on columns + paused status + backfill
--
-- Adds 4 columns required by the EnrollmentService refactor and admin add-on feature
--   source ENUM NOT NULL (plan_linked plan_bundle admin_addon) - D-01
--   price_paid INT NULL                                         - D-01 ADDON-SCHEMA-02
--   assigned_by INT NULL FK users.id                            - D-01 ADDON-SCHEMA-03
--   subscription_id INT NULL FK subscriptions.id                - D-01 ADDON-SCHEMA-04
-- Extends status enum with paused                               - D-02
-- Backfills existing rows deterministically                     - D-03 D-05
--
-- Idempotency D-04 - tracked by _migrations row 0111 prevents replay - all
-- intra-file UPDATE statements are guarded by WHERE-on-BEFORE-state so a
-- manual replay outside the runner is a 0-row no-op
--
-- Hand-written SQL (the kit-generator path is unsafe here - meta journal is
-- desynced - see phase 86, 90, 103-01, 111 precedent)
--
-- run-migrations.ts splits on semicolons BEFORE stripping comments so this
-- file MUST NOT contain inline semicolons inside comment lines

-- Step 1 — Extend status enum with paused (preserve existing values + default)
ALTER TABLE program_enrollments
  MODIFY COLUMN status ENUM('active','completed','expired','cancelled','paused')
  NOT NULL DEFAULT 'active';

-- Step 2 — Add the 4 new columns. source is added as NULL-tolerant first so
-- the backfill (Step 3) can populate every row before Step 5 tightens it to
-- NOT NULL.
ALTER TABLE program_enrollments
  ADD COLUMN source ENUM('plan_linked','plan_bundle','admin_addon') NULL AFTER notes,
  ADD COLUMN price_paid INT NULL AFTER source,
  ADD COLUMN assigned_by INT NULL AFTER price_paid,
  ADD COLUMN subscription_id INT NULL AFTER assigned_by,
  ADD CONSTRAINT fk_enrollments_assigned_by FOREIGN KEY (assigned_by) REFERENCES users(id),
  ADD CONSTRAINT fk_enrollments_subscription_id FOREIGN KEY (subscription_id) REFERENCES subscriptions(id),
  ADD INDEX idx_enrollments_subscription_id (subscription_id),
  ADD INDEX idx_enrollments_source (source);

-- Step 3a — Backfill source = 'plan_linked' for enrollments whose program_id
-- matches a subscription_plan.linked_program_id of one of the user's
-- subscriptions whose period covers enrolled_at.
-- Guarded by source IS NULL so a manual replay is a 0-row no-op.
UPDATE program_enrollments pe
INNER JOIN subscriptions s ON s.user_id = pe.user_id
INNER JOIN subscription_plans sp ON sp.id = s.plan_id
SET pe.source = 'plan_linked'
WHERE pe.source IS NULL
  AND sp.linked_program_id = pe.program_id
  AND s.start_date <= DATE(pe.enrolled_at)
  AND (s.end_date IS NULL OR s.end_date >= DATE(pe.enrolled_at));

-- Step 3b — Backfill source = 'plan_bundle' for enrollments whose user has a
-- bundle subscription (grants_all_programs=true) covering enrolled_at and
-- which was not classified as plan_linked above.
UPDATE program_enrollments pe
INNER JOIN subscriptions s ON s.user_id = pe.user_id
INNER JOIN subscription_plans sp ON sp.id = s.plan_id
SET pe.source = 'plan_bundle'
WHERE pe.source IS NULL
  AND sp.grants_all_programs = 1
  AND s.start_date <= DATE(pe.enrolled_at)
  AND (s.end_date IS NULL OR s.end_date >= DATE(pe.enrolled_at));

-- Step 3c — Default fallback for any remaining row: admin_addon. Expected
-- count today is 0 (there are no manual enrollments yet), but this is the
-- safe default classification rule for any row whose origin cannot be
-- resolved from sub history.
UPDATE program_enrollments pe
SET pe.source = 'admin_addon'
WHERE pe.source IS NULL;

-- Step 4 — Backfill subscription_id for plan_linked rows: the unique sub
-- whose plan.linked_program_id matches AND period covers enrolled_at. If
-- 0 or >1 subs match, subscription_id stays NULL (documented gap — Plan 03
-- lifecycle hooks ignore subscription_id IS NULL rows).
UPDATE program_enrollments pe
INNER JOIN (
  SELECT pe2.id AS enrollment_id, MIN(s.id) AS sub_id, COUNT(s.id) AS n
  FROM program_enrollments pe2
  INNER JOIN subscriptions s ON s.user_id = pe2.user_id
  INNER JOIN subscription_plans sp ON sp.id = s.plan_id
  WHERE pe2.source = 'plan_linked'
    AND sp.linked_program_id = pe2.program_id
    AND s.start_date <= DATE(pe2.enrolled_at)
    AND (s.end_date IS NULL OR s.end_date >= DATE(pe2.enrolled_at))
  GROUP BY pe2.id
) m ON m.enrollment_id = pe.id
SET pe.subscription_id = m.sub_id
WHERE pe.subscription_id IS NULL
  AND m.n = 1;

-- Step 4b — Backfill subscription_id for plan_bundle rows: the unique
-- bundle sub whose period covers enrolled_at.
UPDATE program_enrollments pe
INNER JOIN (
  SELECT pe2.id AS enrollment_id, MIN(s.id) AS sub_id, COUNT(s.id) AS n
  FROM program_enrollments pe2
  INNER JOIN subscriptions s ON s.user_id = pe2.user_id
  INNER JOIN subscription_plans sp ON sp.id = s.plan_id
  WHERE pe2.source = 'plan_bundle'
    AND sp.grants_all_programs = 1
    AND s.start_date <= DATE(pe2.enrolled_at)
    AND (s.end_date IS NULL OR s.end_date >= DATE(pe2.enrolled_at))
  GROUP BY pe2.id
) m ON m.enrollment_id = pe.id
SET pe.subscription_id = m.sub_id
WHERE pe.subscription_id IS NULL
  AND m.n = 1;

-- Step 5 — Tighten source to NOT NULL now that every row has a value.
ALTER TABLE program_enrollments
  MODIFY COLUMN source ENUM('plan_linked','plan_bundle','admin_addon') NOT NULL;
