-- Drop semana_20/40/60 columns from member_goal_plans
-- Goal plan sessions are now always full sessions, no per-duration week tracking
ALTER TABLE `member_goal_plans` DROP COLUMN `semana_20`;
ALTER TABLE `member_goal_plans` DROP COLUMN `semana_40`;
ALTER TABLE `member_goal_plans` DROP COLUMN `semana_60`;
