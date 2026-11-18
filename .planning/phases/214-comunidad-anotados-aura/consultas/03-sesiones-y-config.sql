-- Fase 214: datos para decidir el contador de sesiones del encabezado
--   y confirmar la configuración vigente de Aura
-- SOLO LECTURA. Se corre contra la base de producción con OK de Franco
-- Devuelve solo agregados y filas de configuración, ningún dato personal

SET SESSION TRANSACTION READ ONLY;
SET SESSION max_execution_time = 30000;

-- A. Desde cuándo hay sesiones registradas, por tipo
SELECT CASE
         WHEN c.goal_plan_type IS NULL THEN 'app, entrenamiento'
         WHEN c.goal_plan_type = 'presencial' THEN 'presencial (espejo del check-in)'
         ELSE 'app, plan a medida'
       END AS tipo,
       COUNT(*) AS filas,
       COUNT(DISTINCT c.user_id) AS alumnos,
       MIN(c.date) AS desde,
       MAX(c.date) AS hasta
FROM completed_sessions c
GROUP BY tipo
ORDER BY filas DESC;

-- B. Desde cuándo hay asistencias registradas
SELECT COUNT(*) AS filas,
       COUNT(DISTINCT a.member_id) AS alumnos,
       MIN(a.session_date) AS desde,
       MAX(a.session_date) AS hasta
FROM attendance a;

-- C. Alumnos activos por antigüedad: sesiones totales, días distintos y asistencias
--    activo = con al menos una asistencia en los últimos 56 días
WITH base AS (
  SELECT u.id,
         CASE
           WHEN TIMESTAMPDIFF(MONTH, u.created_at, NOW()) < 3 THEN '1. menos de 3 meses'
           WHEN TIMESTAMPDIFF(MONTH, u.created_at, NOW()) < 6 THEN '2. de 3 a 5 meses'
           WHEN TIMESTAMPDIFF(MONTH, u.created_at, NOW()) < 12 THEN '3. de 6 a 11 meses'
           WHEN TIMESTAMPDIFF(MONTH, u.created_at, NOW()) < 24 THEN '4. de 1 a 2 años'
           ELSE '5. más de 2 años'
         END AS antiguedad,
         (SELECT COUNT(*) FROM completed_sessions c WHERE c.user_id = u.id) AS sesiones,
         (SELECT COUNT(DISTINCT c.date) FROM completed_sessions c WHERE c.user_id = u.id) AS dias,
         (SELECT COUNT(*) FROM attendance a WHERE a.member_id = u.id) AS asistencias
  FROM users u
  WHERE u.role = 'member'
    AND u.deleted_at IS NULL
    AND EXISTS (
      SELECT 1
      FROM attendance a
      WHERE a.member_id = u.id
        AND a.session_date >= CURDATE() - INTERVAL 56 DAY
    )
),
r AS (
  SELECT b.antiguedad,
         b.sesiones,
         b.dias,
         b.asistencias,
         PERCENT_RANK() OVER (PARTITION BY b.antiguedad ORDER BY b.sesiones) AS pr
  FROM base b
)
SELECT r.antiguedad,
       COUNT(*) AS alumnos,
       MIN(CASE WHEN r.pr >= 0.50 THEN r.sesiones END) AS sesiones_mediana,
       MAX(r.sesiones) AS sesiones_max,
       ROUND(AVG(r.sesiones)) AS sesiones_prom,
       ROUND(AVG(r.dias)) AS dias_prom,
       ROUND(AVG(r.asistencias)) AS asistencias_prom,
       SUM(r.sesiones > r.dias) AS con_mas_sesiones_que_dias
FROM r
GROUP BY r.antiguedad
ORDER BY r.antiguedad;

-- D. Altas por mes: para ver si la fecha de alta de los importados es la de importación
SELECT DATE_FORMAT(u.created_at, '%Y-%m') AS mes_alta,
       COUNT(*) AS alumnos,
       MAX(x.mismo_dia) AS max_altas_en_un_dia
FROM users u
JOIN (
  SELECT DATE(created_at) AS dia, COUNT(*) AS mismo_dia
  FROM users
  WHERE role = 'member'
  GROUP BY DATE(created_at)
) x ON x.dia = DATE(u.created_at)
WHERE u.role = 'member'
  AND u.deleted_at IS NULL
GROUP BY DATE_FORMAT(u.created_at, '%Y-%m')
ORDER BY mes_alta;

-- E. Configuración vigente de Aura
SELECT aura_config_source_type AS fuente, default_amount AS monto, is_active AS activa
FROM aura_config
ORDER BY aura_config_source_type;

-- F. Ajustes de rachas y de invitaciones (solo esas claves)
SELECT setting_key, setting_value
FROM system_settings
WHERE setting_key LIKE 'streak.%'
   OR setting_key LIKE 'referral.%'
ORDER BY setting_key;
