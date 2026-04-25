-- Phase 103: User Status Enum + staff_disabled split + drop is_active
-- See .planning/phases/103-user-status-enum/103-SPEC.md for full rationale.
--
-- Idempotency: runner skips Duplicate/already-exists/Can't DROP errors.
-- Backfill UPDATEs are guarded by WHERE status IS NULL so re-runs no-op.
-- Order matters: status backfill MUST run BEFORE dropping is_active because
-- step 5 (legacy override) reads the legacy column.
--
-- D-12: status DEFAULT NULL at the DB level. Staff inserts that omit the
-- field stay NULL. Member-creating endpoints set the value explicitly in
-- Plan 03 (POST /register --> 'freemium', POST /api/admin/members --> 'prueba',
-- POST /api/admin/trials --> 'prueba').

-- Section 1: Add new columns
ALTER TABLE `users`
  ADD COLUMN `status` ENUM('freemium','prueba','activo','inactivo') DEFAULT NULL;

ALTER TABLE `users`
  ADD COLUMN `staff_disabled` BOOLEAN NOT NULL DEFAULT FALSE;

-- Section 2: Backfill data (idempotent, each guarded by status IS NULL where applicable)
-- ADD COLUMN with DEFAULT NULL leaves all existing rows with status=NULL, ready for rules below

-- 2.1 Active subscribers go to activo
UPDATE users u
  SET u.status = 'activo'
  WHERE u.role = 'member'
    AND u.status IS NULL
    AND EXISTS (
      SELECT 1 FROM subscriptions s
      WHERE s.user_id = u.id
        AND s.subscription_status IN ('active','paused')
        AND (s.end_date IS NULL OR s.end_date >= CURDATE())
    );

-- 2.2 Trial leads go to prueba
UPDATE users u
  SET u.status = 'prueba'
  WHERE u.role = 'member'
    AND u.status IS NULL
    AND EXISTS (
      SELECT 1 FROM bookings b
      WHERE b.member_id = u.id AND b.is_trial = 1
    );

-- 2.3 Online self-registered without sub or trial go to freemium
UPDATE users u
  SET u.status = 'freemium'
  WHERE u.role = 'member'
    AND u.status IS NULL
    AND u.branch_id = (SELECT id FROM branches WHERE code = 'ONLINE');

-- 2.4 Everyone else (presential users without sub or trial, ex-alumnos) go to inactivo
UPDATE users u
  SET u.status = 'inactivo'
  WHERE u.role = 'member'
    AND u.status IS NULL;

-- 2.5 Override: legacy deactivated members go to inactivo
UPDATE users u
  SET u.status = 'inactivo'
  WHERE u.role = 'member'
    AND u.is_active = FALSE
    AND u.deleted_at IS NULL;

-- 2.6 Staff: status stays NULL (default), staff_disabled mirrors NOT is_active
UPDATE users u
  SET u.staff_disabled = NOT u.is_active
  WHERE u.role != 'member';

-- Section 3: Drop legacy column and index, add new index
DROP INDEX `idx_users_is_active` ON `users`;

ALTER TABLE `users` DROP COLUMN `is_active`;

CREATE INDEX `idx_users_status` ON `users` (`status`);
