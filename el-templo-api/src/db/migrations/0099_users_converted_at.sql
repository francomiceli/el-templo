-- Phase 102-07: trial→alumno conversion timestamp.
-- Set once on first subscription creation IF the user has any is_trial=1
-- booking (any status). Nullable — never populated for non-converted users
-- or for members who never trialed. No backfill: trials are a new concept
-- (phase 102), so no historical is_trial=1 rows exist prior to this column.

ALTER TABLE `users`
  ADD COLUMN `converted_at` TIMESTAMP NULL;

CREATE INDEX `idx_users_converted_at` ON `users` (`converted_at`);
