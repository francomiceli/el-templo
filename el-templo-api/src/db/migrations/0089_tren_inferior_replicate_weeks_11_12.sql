-- Replicate tren_inferior approved sessions from weeks 7 and 8 into new weeks 11 and 12.
-- Source weeks (7 = 6-12 abr, 8 = 13-19 abr) remain untouched.
-- New weeks 11 (4-10 may) and 12 (11-17 may) are full copies: sessions + blocks + prescriptions.
-- Week shift is +4 so W7 -> W11 and W8 -> W12.

-- Step 1: copy sessions. day_id is rewritten W7 -> W11 and W8 -> W12.
INSERT INTO sessions (
  day_id, week, day, level_group, block_count, trace_json,
  status, approved_at, approved_by, approved_by_system,
  algorithm_snapshot, goal_plan_type, session_mode, created_at
)
SELECT
  REPLACE(day_id, CONCAT('-W', week, '-'), CONCAT('-W', week + 4, '-')),
  week + 4,
  day, level_group, block_count, trace_json,
  'approved', NOW(), approved_by, approved_by_system,
  algorithm_snapshot, goal_plan_type, session_mode, NOW()
FROM sessions
WHERE goal_plan_type = 'tren_inferior'
  AND status = 'approved'
  AND week IN (7, 8);

-- Step 2: copy session_blocks. block_id varchar is rewritten from W7/W8 prefix to W11/W12.
-- Target session matched via the rewritten day_id (unique key).
INSERT INTO session_blocks (
  session_id, block_id, role, route, pattern, intensity, reps_budget,
  format_id, format_name, exercise_count, sort_order, format_params
)
SELECT
  new_sess.id,
  REPLACE(sb.block_id, CONCAT('W', old_sess.week, '-'), CONCAT('W', old_sess.week + 4, '-')),
  sb.role, sb.route, sb.pattern, sb.intensity, sb.reps_budget,
  sb.format_id, sb.format_name, sb.exercise_count, sb.sort_order, sb.format_params
FROM session_blocks sb
JOIN sessions old_sess ON old_sess.id = sb.session_id
JOIN sessions new_sess
  ON new_sess.day_id = REPLACE(old_sess.day_id, CONCAT('-W', old_sess.week, '-'), CONCAT('-W', old_sess.week + 4, '-'))
  AND new_sess.week = old_sess.week + 4
WHERE old_sess.goal_plan_type = 'tren_inferior'
  AND old_sess.status = 'approved'
  AND old_sess.week IN (7, 8);

-- Step 3: copy session_prescriptions. Match new block via (new_session_id, role) which is unique per session.
INSERT INTO session_prescriptions (
  block_id, exercise_id, exercise_name, contraction, reps, seconds, rest,
  notes, sort_order, difficulty, exercise_type, weighted, reps_max, seconds_max
)
SELECT
  new_sb.id,
  sp.exercise_id, sp.exercise_name, sp.contraction, sp.reps, sp.seconds, sp.rest,
  sp.notes, sp.sort_order, sp.difficulty, sp.exercise_type, sp.weighted, sp.reps_max, sp.seconds_max
FROM session_prescriptions sp
JOIN session_blocks old_sb ON old_sb.id = sp.block_id
JOIN sessions old_sess ON old_sess.id = old_sb.session_id
JOIN sessions new_sess
  ON new_sess.day_id = REPLACE(old_sess.day_id, CONCAT('-W', old_sess.week, '-'), CONCAT('-W', old_sess.week + 4, '-'))
  AND new_sess.week = old_sess.week + 4
JOIN session_blocks new_sb
  ON new_sb.session_id = new_sess.id
  AND new_sb.role = old_sb.role
WHERE old_sess.goal_plan_type = 'tren_inferior'
  AND old_sess.status = 'approved'
  AND old_sess.week IN (7, 8);
