-- 0330_wellhub_visitas_sin_horario_alberti.sql
-- Wellhub (2026-11-11): las visitas de check-in SIN reserva se guardaban sin horario.
-- El codigo nuevo las ubica por la hora (regla del QR, +-20 min del inicio, solo clases
-- que Wellhub vende). Esta migracion aplica la misma regla a las 3 visitas viejas que
-- entran en la ventana. Verificado en prod (solo lectura) el 2026-11-11, Alberti:
--   attendance 38213  mie 04/11 07:04  -> horario 429 (General mie 07:00)
--   attendance 38626  jue 05/11 08:59  -> horario 419 (General jue 09:00)
--   attendance 38712  jue 05/11 16:55  -> horario 417 (General jue 17:00)
-- Las otras 2 (06/11 13:32 y 10/11 12:17) no tienen clase en la ventana y quedan sin horario.
-- GUARD OBLIGATORIO DATABASE() = 'eltemplo': staging y prod comparten host MySQL y los ids
-- son de prod. En staging y en las DBs de test cada UPDATE matchea 0 filas.
-- Cada UPDATE exige ademas que la visita siga sin horario, sea Wellhub, de Alberti, y que el
-- horario sea de Alberti y del mismo dia de la semana. Idempotente.
-- Escrita a mano. Sin punto y coma dentro de los comentarios (el runner splittea antes de strippear).

UPDATE attendance a JOIN branches b ON b.id = a.branch_id AND b.code = 'ALBERTI' AND b.tenant_id = 1 JOIN schedules s ON s.id = 429 AND s.branch_id = b.id AND s.day_of_week = WEEKDAY(a.session_date) + 1 SET a.schedule_id = s.id WHERE a.id = 38213 AND a.schedule_id IS NULL AND a.attendance_source = 'wellhub' AND DATABASE() = 'eltemplo';

UPDATE attendance a JOIN branches b ON b.id = a.branch_id AND b.code = 'ALBERTI' AND b.tenant_id = 1 JOIN schedules s ON s.id = 419 AND s.branch_id = b.id AND s.day_of_week = WEEKDAY(a.session_date) + 1 SET a.schedule_id = s.id WHERE a.id = 38626 AND a.schedule_id IS NULL AND a.attendance_source = 'wellhub' AND DATABASE() = 'eltemplo';

UPDATE attendance a JOIN branches b ON b.id = a.branch_id AND b.code = 'ALBERTI' AND b.tenant_id = 1 JOIN schedules s ON s.id = 417 AND s.branch_id = b.id AND s.day_of_week = WEEKDAY(a.session_date) + 1 SET a.schedule_id = s.id WHERE a.id = 38712 AND a.schedule_id IS NULL AND a.attendance_source = 'wellhub' AND DATABASE() = 'eltemplo';
