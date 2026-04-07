-- Add session_date column to attendance table.
-- Separates "which date was this attendance for" from "when was the check-in recorded".
-- Backfill existing rows from DATE(checked_in_at) which is correct for real-time check-ins.

ALTER TABLE `attendance`
  ADD COLUMN `session_date` date DEFAULT NULL AFTER `schedule_id`;

UPDATE `attendance`
  SET `session_date` = DATE(`checked_in_at`)
  WHERE `session_date` IS NULL;

ALTER TABLE `attendance`
  MODIFY COLUMN `session_date` date NOT NULL;

-- Replace the index used by slot attendance queries
ALTER TABLE `attendance`
  ADD INDEX `idx_attendance_schedule_session_date` (`schedule_id`, `session_date`);
