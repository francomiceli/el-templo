-- Phase 158-02 — add 'referidos' notification category (D-32) + backfill prefs
-- Hand-written: db:generate hits the pre-existing sessions.goal_plan_type
-- interactive drift (same reason 0158/0173 were hand-written) and the
-- meta/_journal.json is stale at 0059, so generate would mis-number this file.
-- Next sequential number on this branch is 0177 (last is 0176_referrals_core.sql).
-- NEVER drizzle-kit push/migrate -- the _migrations table is the source of truth.
--
-- The enum COLUMN is named `notification_category` on BOTH tables (1st arg of
-- mysqlEnum in notifications.ts), NOT `category`. The new value 'referidos' is
-- APPENDED last so the five existing values keep their byte-for-byte order
-- (enum drift = CI "Unknown column" that tsc cannot detect).
-- The backfill seeds one enabled='referidos' preference row per existing user via
-- NOT EXISTS so a re-run cannot duplicate rows or violate the
-- unique(user_id, notification_category) constraint (idempotent, T-158-06).

ALTER TABLE `notification_templates`
  MODIFY COLUMN `notification_category`
  enum('entrenamiento','programas','motivacion','anuncios','planes','referidos')
  NOT NULL;

ALTER TABLE `notification_preferences`
  MODIFY COLUMN `notification_category`
  enum('entrenamiento','programas','motivacion','anuncios','planes','referidos')
  NOT NULL;

INSERT INTO `notification_preferences` (`user_id`, `notification_category`, `enabled`)
SELECT u.`id`, 'referidos', true
FROM `users` u
WHERE NOT EXISTS (
  SELECT 1 FROM `notification_preferences` p
  WHERE p.`user_id` = u.`id` AND p.`notification_category` = 'referidos'
);
