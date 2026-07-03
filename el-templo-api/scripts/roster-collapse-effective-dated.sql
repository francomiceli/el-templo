-- One-off data cleanup for the effective-dated roster (feat/roster-effective-dated).
--
-- Context: class_coach_assignments changed from "one snapshot row per week" to
-- "one CHANGE-POINT per (branch, day, slot)". Existing data (incl. the 26 future
-- weeks bulk-copied on 2026-07-03) has many redundant rows: consecutive weeks
-- that repeat the same coach for a slot. This collapses each run to its first
-- row, leaving only real change-points. Reads (latest change-point <= week) are
-- unchanged by this; writes need it so future edits propagate correctly.
--
-- SAFETY: run this ONLY AFTER the new code (effective-dated reads) is deployed,
-- so there is no window where old exact-week reads see collapsed data. Take a
-- backup first (mysqldump class_coach_assignments).
--
-- Idempotent: re-running finds nothing to delete once collapsed.

DELETE FROM class_coach_assignments
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           CASE
             WHEN coach_id = LAG(coach_id) OVER (
               PARTITION BY branch_id, day_of_week, slot
               ORDER BY week_start_date
             ) THEN 1 ELSE 0
           END AS redundant
    FROM class_coach_assignments
  ) ranked
  WHERE ranked.redundant = 1
);
