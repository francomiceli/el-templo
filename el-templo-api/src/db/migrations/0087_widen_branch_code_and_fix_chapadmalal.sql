-- Widens branches.code from varchar(10) to varchar(20) and converges
-- Chapadmalal across envs. 0086 failed on prod (strict mode) and silently
-- truncated on staging ("CHAPADMALA"), so this migration:
--   1. widens the column
--   2. fixes the truncated code on staging (no-op on prod)
--   3. idempotently inserts the branch + schedules (no-op on staging, fires on prod)

ALTER TABLE branches MODIFY code VARCHAR(20) NOT NULL;

UPDATE branches SET code = 'CHAPADMALAL' WHERE code = 'CHAPADMALA';

INSERT IGNORE INTO branches (name, code, max_capacity) VALUES ('El Templo Chapadmalal', 'CHAPADMALAL', 8);

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
WHERE b.code = 'CHAPADMALAL' AND a.name = 'Sesion Grupal' AND s.id IS NULL;
