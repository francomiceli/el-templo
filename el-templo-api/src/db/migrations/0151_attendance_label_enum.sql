-- Phase 136-01 — Attendance label enum (D-01, D-09)
-- Replaces the legacy 6-value behavioral segment with the 4 attendance bands.
-- Clean recompute (D-09)  no old-to-new mapping. All existing rows are reset
-- to NULL BEFORE the ALTER so no row holds a value outside the new enum, then
-- the nightly 3AM batch + on-login recalc repopulate with the new logic.

-- Step 1: reset every row to NULL (clean recompute, D-09).
UPDATE `member_profiles` SET `member_segment` = NULL;

-- Step 2: replace the enum definition with the 4 attendance bands (D-01).
-- The column name member_segment must match mysqlEnum 1st-arg in the schema.
ALTER TABLE `member_profiles`
  MODIFY COLUMN `member_segment` enum('optima','regular','alerta','ausente') DEFAULT NULL;

-- Step 3: drop the now-orphaned configurable threshold settings (D-03  cut
-- points are fixed in code, no longer tuneable via system_settings).
DELETE FROM `system_settings` WHERE `setting_key` IN (
  'segment.espartano_pct',
  'segment.intermitente_pct',
  'segment.en_riesgo_weeks',
  'segment.ghost_weeks',
  'segment.nuevo_days',
  'segment.nuevo_guerrero_days',
  'segment.window_days',
  'segment.frequency_zero_visit_window_days'
);
