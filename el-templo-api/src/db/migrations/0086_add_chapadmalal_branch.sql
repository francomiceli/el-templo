-- @data-only
INSERT INTO branches (name, code, max_capacity) VALUES ('El Templo Chapadmalal', 'CHAPADMALAL', 8);

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
WHERE b.code = 'CHAPADMALAL' AND a.name = 'Sesion Grupal';
