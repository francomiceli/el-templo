-- Backfill completed_sessions rows from attendance check-ins so that
-- presencial members who have been showing up to class get credit for
-- their sessions — same way an online/autonomous session completion
-- counts. Marked with goal_plan_type='presencial' so downstream code
-- can filter or distinguish them.
--
-- Window: from Monday of last week (2026-04-27) through CURDATE() at
-- migration runtime. Anything older stays unbackfilled by intent.
--
-- Idempotent: NOT EXISTS guard prevents double-insert if re-applied or
-- if an attendance record was already mirrored by a prior run / by the
-- live code path.

INSERT INTO completed_sessions (
  user_id,
  day_id,
  session_level,
  date,
  branch_id,
  started_at,
  completed_at,
  blocks_completed,
  goal_plan_type
)
SELECT
  a.member_id,
  CONCAT('presencial-', DATE_FORMAT(a.checked_in_at, '%Y-%m-%d')),
  u.level,
  DATE_FORMAT(a.checked_in_at, '%Y-%m-%d'),
  a.branch_id,
  a.checked_in_at,
  a.checked_in_at,
  -- Full coached class = all standard blocks. Deuteros defaults to
  -- DEUTEROS_1 only (not the online DEUTEROS_1+DEUTEROS_2 split).
  JSON_ARRAY('INITIUM', 'NUCLEUS', 'DEUTEROS_1', 'ATHLOS'),
  'presencial'
FROM attendance a
JOIN users u ON u.id = a.member_id
WHERE DATE(a.checked_in_at) >= '2026-04-27'
  AND DATE(a.checked_in_at) <= CURDATE()
  AND NOT EXISTS (
    SELECT 1 FROM completed_sessions cs
    WHERE cs.user_id = a.member_id
      AND cs.date = DATE_FORMAT(a.checked_in_at, '%Y-%m-%d')
      AND cs.goal_plan_type = 'presencial'
  );
