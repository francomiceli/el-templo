-- Extend approved goal-plan (online "por objetivos") sessions to cover the
-- next 4-week cycle, taking the current global week as the cycle start.
--
-- Background: the weekly training view resolves content by a GLOBAL calendar
-- week anchored at WEEK_ONE_MONDAY = 2026-02-23 (sessions/routes.ts). Approved
-- goal sessions only existed through week 13, but the current calendar week is
-- 14, so every online goal member sees empty days ("Sin sesion").
--
-- This migration replicates the last complete 4-week cycle into the next 4
-- weeks so the cycle restarts this week:
--   W10 -> W14   (cycle week 1, current week)
--   W11 -> W15   (cycle week 2)
--   W12 -> W16   (cycle week 3)
--   W13 -> W17   (cycle week 4)
--
-- Applies to all active goal programs: full_body, tren_inferior, tren_superior.
-- Source weeks remain untouched. Targets are full copies: sessions + blocks +
-- prescriptions. day_id format: GP-{goal_plan_type}-W{week}-{day}-{level}.
-- block_id format: W{week}-{day}-{level}-{role}.
--
-- Idempotency note: target weeks 14-17 are empty for goal types at write time.
-- In staging there are no source goal sessions, so this inserts zero rows.

INSERT INTO sessions (
  day_id, week, day, level_group, block_count, trace_json,
  status, approved_at, approved_by, approved_by_system,
  algorithm_snapshot, goal_plan_type, session_mode, created_at
)
SELECT
  REPLACE(s.day_id, CONCAT('-W', s.week, '-'), CONCAT('-W', m.tgt, '-')),
  m.tgt,
  s.day, s.level_group, s.block_count, s.trace_json,
  'approved', NOW(), s.approved_by, s.approved_by_system,
  s.algorithm_snapshot, s.goal_plan_type, s.session_mode, NOW()
FROM sessions s
JOIN (
  SELECT 10 AS src, 14 AS tgt
  UNION ALL SELECT 11, 15
  UNION ALL SELECT 12, 16
  UNION ALL SELECT 13, 17
) m ON m.src = s.week
WHERE s.goal_plan_type IN ('full_body', 'tren_inferior', 'tren_superior')
  AND s.status = 'approved'
  AND s.week BETWEEN 10 AND 13;

INSERT INTO session_blocks (
  session_id, block_id, role, route, pattern, intensity, reps_budget,
  format_id, format_name, exercise_count, sort_order, format_params, custom_title
)
SELECT
  new_sess.id,
  REPLACE(sb.block_id, CONCAT('W', old_sess.week, '-'), CONCAT('W', m.tgt, '-')),
  sb.role, sb.route, sb.pattern, sb.intensity, sb.reps_budget,
  sb.format_id, sb.format_name, sb.exercise_count, sb.sort_order, sb.format_params, sb.custom_title
FROM session_blocks sb
JOIN sessions old_sess ON old_sess.id = sb.session_id
JOIN (
  SELECT 10 AS src, 14 AS tgt
  UNION ALL SELECT 11, 15
  UNION ALL SELECT 12, 16
  UNION ALL SELECT 13, 17
) m ON m.src = old_sess.week
JOIN sessions new_sess
  ON new_sess.day_id = REPLACE(old_sess.day_id, CONCAT('-W', old_sess.week, '-'), CONCAT('-W', m.tgt, '-'))
  AND new_sess.week = m.tgt
  AND new_sess.goal_plan_type = old_sess.goal_plan_type
WHERE old_sess.goal_plan_type IN ('full_body', 'tren_inferior', 'tren_superior')
  AND old_sess.status = 'approved'
  AND old_sess.week BETWEEN 10 AND 13;

INSERT INTO session_prescriptions (
  block_id, exercise_id, exercise_name, contraction, reps, reps_max, seconds, seconds_max,
  increment, rest, notes, sort_order, difficulty, exercise_type, weighted
)
SELECT
  new_sb.id,
  sp.exercise_id, sp.exercise_name, sp.contraction, sp.reps, sp.reps_max, sp.seconds, sp.seconds_max,
  sp.increment, sp.rest, sp.notes, sp.sort_order, sp.difficulty, sp.exercise_type, sp.weighted
FROM session_prescriptions sp
JOIN session_blocks old_sb ON old_sb.id = sp.block_id
JOIN sessions old_sess ON old_sess.id = old_sb.session_id
JOIN (
  SELECT 10 AS src, 14 AS tgt
  UNION ALL SELECT 11, 15
  UNION ALL SELECT 12, 16
  UNION ALL SELECT 13, 17
) m ON m.src = old_sess.week
JOIN sessions new_sess
  ON new_sess.day_id = REPLACE(old_sess.day_id, CONCAT('-W', old_sess.week, '-'), CONCAT('-W', m.tgt, '-'))
  AND new_sess.week = m.tgt
  AND new_sess.goal_plan_type = old_sess.goal_plan_type
JOIN session_blocks new_sb
  ON new_sb.session_id = new_sess.id
  AND new_sb.role = old_sb.role
WHERE old_sess.goal_plan_type IN ('full_body', 'tren_inferior', 'tren_superior')
  AND old_sess.status = 'approved'
  AND old_sess.week BETWEEN 10 AND 13;
