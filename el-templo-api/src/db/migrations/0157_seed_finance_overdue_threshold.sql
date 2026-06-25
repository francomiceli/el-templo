-- 0157_seed_finance_overdue_threshold.sql
-- Phase 142 (MIG-01 / D-04): seed the pending-overdue threshold config (default 3).
-- Reuses system_settings (NO new table). Idempotent: skip if the key already exists
-- so a re-run (or a prior PUT-set value) is never clobbered.
-- NOTE: no semicolons inside these comment lines (the custom runner splits on the
-- semicolon BEFORE stripping the double-dash comments).
INSERT INTO `system_settings` (`setting_key`, `setting_value`)
SELECT 'finance.pending_overdue_days', '3'
WHERE NOT EXISTS (
  SELECT 1 FROM `system_settings` WHERE `setting_key` = 'finance.pending_overdue_days'
);
