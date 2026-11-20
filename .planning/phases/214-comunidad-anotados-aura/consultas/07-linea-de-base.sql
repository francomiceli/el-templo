-- Fase 214, D-36: reservas y asistencias por alumno activo por semana
-- SOLO LECTURA. No correr sin OK de Franco. Agregados, sin datos personales
-- Sin CONVERT_TZ (en prod da NULL): booking_date y session_date ya son fecha local de la sede
-- Activo en la semana S = asistio (no Wellhub) al menos una vez en las 8 semanas ANTERIORES al lunes de S
--   (la semana misma no cuenta: si contara, quien vino esa semana seria activo por definicion)
-- Los datos son historicos (bookings conserva las filas canceladas, attendance es inmutable):
--   la medicion de las 4 semanas previas se puede correr cualquier dia, no hace falta capturarla antes del lanzamiento.
-- Separa las reservas desde la app (source = 'self_service') de las automaticas o del admin:
--   las de la app son las que la lista puede mover. no_show cuenta como reserva hecha.
-- Variante por pais: agregar b.country (JOIN branches b ON b.id = u.branch_id) al SELECT y al GROUP BY.

SET SESSION TRANSACTION READ ONLY;
SET SESSION max_execution_time = 60000;
SET @lanzamiento = 'YYYY-MM-DD';   -- lunes de la semana en que se prende la lista
SET @desde = DATE_SUB(@lanzamiento, INTERVAL 28 DAY);   -- ANTES: las 4 semanas previas
-- Para "despues": @desde = @lanzamiento y @hasta = DATE_ADD(@lanzamiento, INTERVAL 28 DAY)
SET @hasta = @lanzamiento;

WITH RECURSIVE semanas AS (
  SELECT @desde AS lunes
  UNION ALL
  SELECT DATE_ADD(lunes, INTERVAL 7 DAY) FROM semanas WHERE DATE_ADD(lunes, INTERVAL 7 DAY) < @hasta
),
activos AS (
  SELECT s.lunes, a.member_id
  FROM semanas s
  JOIN attendance a ON a.tenant_id = 1
   AND a.session_date >= DATE_SUB(s.lunes, INTERVAL 56 DAY) AND a.session_date < s.lunes
   AND a.attendance_source IN ('qr','manual')
  JOIN users u ON u.id = a.member_id AND u.tenant_id = 1 AND u.role = 'member' AND u.deleted_at IS NULL
  GROUP BY s.lunes, a.member_id
),
reservas AS (
  SELECT s.lunes, b.member_id, COUNT(*) AS n, SUM(b.source = 'self_service') AS n_app
  FROM semanas s
  JOIN bookings b ON b.tenant_id = 1
   AND b.booking_date >= s.lunes AND b.booking_date < DATE_ADD(s.lunes, INTERVAL 7 DAY)
   AND b.is_trial = 0
   AND b.booking_status IN ('reservado','qr_escaneado','confirmado','no_show')
   AND (b.source IS NULL OR b.source <> 'wellhub')
  GROUP BY s.lunes, b.member_id
),
asist AS (
  SELECT s.lunes, a.member_id, COUNT(*) AS n
  FROM semanas s
  JOIN attendance a ON a.tenant_id = 1
   AND a.session_date >= s.lunes AND a.session_date < DATE_ADD(s.lunes, INTERVAL 7 DAY)
   AND a.attendance_source IN ('qr','manual')
  GROUP BY s.lunes, a.member_id
)
SELECT ac.lunes AS semana,
  COUNT(*) AS alumnos_activos,
  ROUND(SUM(COALESCE(r.n, 0)) / COUNT(*), 3) AS reservas_por_alumno,
  ROUND(SUM(COALESCE(r.n_app, 0)) / COUNT(*), 3) AS reservas_desde_app_por_alumno,
  ROUND(SUM(COALESCE(x.n, 0)) / COUNT(*), 3) AS asistencias_por_alumno
FROM activos ac
LEFT JOIN reservas r ON r.lunes = ac.lunes AND r.member_id = ac.member_id
LEFT JOIN asist x ON x.lunes = ac.lunes AND x.member_id = ac.member_id
GROUP BY ac.lunes
ORDER BY ac.lunes;
