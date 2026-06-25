-- Phase 144-01 — add 'planes' notification category (D-01) + backfill prefs
-- Hand-written: db:generate hits the pre-existing sessions.goal_plan_type
-- interactive drift (same reason 0153/0154/0155 were hand-written) and the
-- meta/_journal.json is stale at 0059, so generate would mis-number this file.
-- Next sequential number on this branch is 0158 (v5.2 occupies 0153-0157).
-- NEVER drizzle-kit push/migrate -- the _migrations table is the source of truth.
--
-- The enum COLUMN is named `notification_category` on BOTH tables (1st arg of
-- mysqlEnum in notifications.ts), NOT `category`. The new value 'planes' is
-- APPENDED last so the four existing values keep their byte-for-byte order
-- (enum drift = CI "Unknown column" that tsc cannot detect).
-- The backfill seeds one enabled='planes' preference row per existing user via
-- NOT EXISTS so a re-run cannot duplicate rows or violate the
-- unique(user_id, notification_category) constraint (idempotent, T-144-02).

ALTER TABLE `notification_templates`
  MODIFY COLUMN `notification_category`
  enum('entrenamiento','programas','motivacion','anuncios','planes')
  NOT NULL;

ALTER TABLE `notification_preferences`
  MODIFY COLUMN `notification_category`
  enum('entrenamiento','programas','motivacion','anuncios','planes')
  NOT NULL;

INSERT INTO `notification_preferences` (`user_id`, `notification_category`, `enabled`)
SELECT u.`id`, 'planes', true
FROM `users` u
WHERE NOT EXISTS (
  SELECT 1 FROM `notification_preferences` p
  WHERE p.`user_id` = u.`id` AND p.`notification_category` = 'planes'
);
