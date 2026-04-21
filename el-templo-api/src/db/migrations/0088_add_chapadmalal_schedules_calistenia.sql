-- Inserts Chapadmalal weekday schedules on envs missing them.
-- 0087 tried to insert using activity name "Sesion Grupal" but production had
-- since renamed the activity to "Calistenia", so INSERT...SELECT matched 0 rows
-- and the branch was left with no schedules. This uses the canonical name.
-- Idempotent: staging already has the 20 rows from 0086.

INSERT INTO schedules (branch_id, activity_id, day_of_week, start_time, end_time)
SELECT b.id, a.id, d.day_of_week, t.start_time, t.end_time
FROM branches b
CROSS JOIN activities a
CROSS JOIN (
  SELECT 1 AS day_of_week UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5
) d
CROSS JOIN (
  SELECT '08:00' AS start_time, '09:00' AS end_time
  UNION SELECT '09:00', '10:00'
  UNION SELECT '17:00', '18:00'
  UNION SELECT '18:00', '19:00'
) t
LEFT JOIN schedules s
  ON s.branch_id = b.id
  AND s.activity_id = a.id
  AND s.day_of_week = d.day_of_week
  AND s.start_time = t.start_time
WHERE b.code = 'CHAPADMALAL' AND a.name = 'Calistenia' AND s.id IS NULL;
