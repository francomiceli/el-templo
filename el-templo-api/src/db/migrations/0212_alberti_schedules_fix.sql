-- Fix: la 0211 creo la sede Alberti pero sus horarios quedaron sin insertar.
-- El segundo INSERT de la 0211 filtraba por activity name 'Calistenia', nombre
-- que no existe en prod: las clases usan la actividad 'General' (id 1). El
-- INSERT...SELECT matcheo 0 filas y Alberti quedo sin schedules.
--
-- Esta migracion copia la plantilla de horarios de lunes a viernes de MORENO
-- (sede activa de referencia) a Alberti, preservando activity_id, dia y horas.
-- Es agnostica de la DB: no hardcodea nombre ni id de actividad, asi corre
-- igual en prod (General) que en staging/test (cualquiera sea su actividad).
-- Solo dias 1..5 (sin sabado, por pedido). El cupo 16 lo aporta
-- branches.max_capacity de Alberti (ya seteado en la 0211).
--
-- Cambio de dato de prod via migracion, nunca via seed. Idempotente: el
-- NOT EXISTS por (branch, dia, hora de inicio) evita duplicar en reejecuciones.

INSERT INTO schedules (tenant_id, branch_id, activity_id, day_of_week, start_time, end_time)
SELECT alberti.tenant_id, alberti.id, src.activity_id, src.day_of_week, src.start_time, src.end_time
FROM schedules src
JOIN branches srcb ON srcb.id = src.branch_id AND srcb.code = 'MORENO'
JOIN branches alberti ON alberti.code = 'ALBERTI'
WHERE src.is_active = 1
  AND src.day_of_week BETWEEN 1 AND 5
  AND NOT EXISTS (
    SELECT 1 FROM schedules x
    WHERE x.branch_id = alberti.id
      AND x.day_of_week = src.day_of_week
      AND x.start_time = src.start_time
  );
