-- Alta de la sede Alberti (Argentina). Pedido 2026-08-24.
--
-- Clases de lunes a viernes en el horario canonico de las demas sedes
-- (8 slots por dia: 07-11 y 17-21) con actividad Calistenia. Sin sabado.
-- Cupo 16 por clase via branches.max_capacity: la actividad Calistenia tiene
-- max_capacity NULL, asi que el cupo lo aporta la sede (mismo mecanismo que la
-- 0175 en Mogotes).
--
-- name corto 'Alberti' acorde a la 0208 (branches.name es solo display). La app
-- de miembros muestra "Sede Alberti" via el shim appBranchName, que reconstruye
-- el prefijo "El Templo" en el handler -- sin build de tiendas. Pais AR y
-- timezone America/Argentina/Buenos_Aires por default. Sin Wellhub (gym_id NULL).
--
-- Cambio de dato de prod via migracion, nunca via seed (regla del repo).
-- Idempotente: la sede se inserta con NOT EXISTS por code y los schedules con
-- LEFT JOIN IS NULL, asi re-ejecutar no duplica.

INSERT INTO branches (name, code, max_capacity)
SELECT 'Alberti', 'ALBERTI', 16 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM branches WHERE code = 'ALBERTI');
--> statement-breakpoint
INSERT INTO schedules (branch_id, activity_id, day_of_week, start_time, end_time)
SELECT b.id, a.id, d.day_of_week, t.start_time, t.end_time
FROM branches b
CROSS JOIN activities a
CROSS JOIN (
  SELECT 1 AS day_of_week UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5
) d
CROSS JOIN (
  SELECT '07:00' AS start_time, '08:00' AS end_time
  UNION SELECT '08:00', '09:00'
  UNION SELECT '09:00', '10:00'
  UNION SELECT '10:00', '11:00'
  UNION SELECT '17:00', '18:00'
  UNION SELECT '18:00', '19:00'
  UNION SELECT '19:00', '20:00'
  UNION SELECT '20:00', '21:00'
) t
LEFT JOIN schedules s
  ON s.branch_id = b.id
  AND s.activity_id = a.id
  AND s.day_of_week = d.day_of_week
  AND s.start_time = t.start_time
WHERE b.code = 'ALBERTI'
  AND a.name = 'Calistenia'
  AND a.tenant_id = b.tenant_id
  AND s.id IS NULL;
