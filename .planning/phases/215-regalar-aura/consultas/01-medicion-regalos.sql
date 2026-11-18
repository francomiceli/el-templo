-- Fase 215, D-21: medición de regalos de Aura, últimas 4 semanas
-- SOLO LECTURA. No correr sin OK de Franco. Contra la base `eltemplo` en modo lectura, no modifica nada.
-- Agregado por semana y por sede, sin nombres ni ids de personas.
--
-- Misma definición que la pantalla "Regalos de Aura" del admin (`weeklyGiftUsage`):
--   Semanas de lunes a domingo, la actual primero. La semana se agrupa por la fecha de la clase (session_date),
--   que ya es fecha local de la sede: no hace falta convertir zonas (CONVERT_TZ da NULL en producción).
--   Regalos de alumnos y de profes: solo los vigentes. Los anulados se cuentan aparte.
--   Alumnos que asistieron: personas que no son staff, con asistencia por QR o manual en la semana.
--   Wellhub no entra, porque no puede regalar.
--   Alumnos que regalaron: dadores distintos de regalos vigentes de alumno en la semana.
--   Porcentaje = alumnos que regalaron sobre alumnos que asistieron, redondeado y nunca mayor a 100.
--
-- Cómo correrla: el bloque A da el detalle por sede y el bloque B el total del gimnasio.
-- Una persona que asistió en dos sedes la misma semana cuenta una vez en cada sede del bloque A
-- y una sola vez en el bloque B. Por eso el total del bloque B es el número de referencia.
-- En las primeras 4 semanas correrla cada lunes.
--
-- Cambiar @hoy si hace falta la fecha de la sede y no la del servidor (por ejemplo, 'AAAA-MM-DD').

SET SESSION TRANSACTION READ ONLY;
SET SESSION max_execution_time = 60000;
SET @hoy = CURDATE();
SET @lunes_actual = DATE_SUB(@hoy, INTERVAL WEEKDAY(@hoy) DAY);
SET @desde = DATE_SUB(@lunes_actual, INTERVAL 21 DAY);
SET @hasta = DATE_ADD(@lunes_actual, INTERVAL 6 DAY);

-- A. Por semana y por sede
-- Esperado: una fila por semana y sede con actividad. Las semanas sin regalos salen con 0 regalos
-- y su cantidad de asistentes. Con el módulo apagado o antes del lanzamiento, todo en 0.
WITH semanas AS (
  SELECT 0 AS n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3
),
regalos AS (
  SELECT g.tenant_id,
         g.branch_id,
         DATE_SUB(g.session_date, INTERVAL WEEKDAY(g.session_date) DAY) AS lunes,
         SUM(g.status = 'vigente' AND g.giver_kind = 'alumno') AS regalos_alumnos,
         SUM(g.status = 'vigente' AND g.giver_kind = 'profe') AS regalos_profes,
         SUM(g.status = 'anulado') AS regalos_anulados,
         COUNT(DISTINCT CASE WHEN g.status = 'vigente' AND g.giver_kind = 'alumno' THEN g.giver_user_id END) AS alumnos_que_regalaron
  FROM aura_gifts g
  WHERE g.session_date BETWEEN @desde AND @hasta
  GROUP BY g.tenant_id, g.branch_id, DATE_SUB(g.session_date, INTERVAL WEEKDAY(g.session_date) DAY)
),
asistentes AS (
  SELECT a.tenant_id,
         a.branch_id,
         DATE_SUB(a.session_date, INTERVAL WEEKDAY(a.session_date) DAY) AS lunes,
         COUNT(DISTINCT a.member_id) AS alumnos_que_asistieron
  FROM attendance a
  JOIN users u ON u.id = a.member_id AND u.tenant_id = a.tenant_id
  WHERE a.source IN ('qr', 'manual')
    AND a.session_date BETWEEN @desde AND @hasta
    AND u.role NOT IN ('coach', 'admin', 'owner', 'gestion', 'recepcion', 'admin_sede', 'coach_actividad')
  GROUP BY a.tenant_id, a.branch_id, DATE_SUB(a.session_date, INTERVAL WEEKDAY(a.session_date) DAY)
)
SELECT DATE_SUB(@lunes_actual, INTERVAL 7 * s.n DAY) AS semana_desde,
       b.tenant_id,
       b.name AS sede,
       COALESCE(r.regalos_alumnos, 0) AS regalos_alumnos,
       COALESCE(r.regalos_profes, 0) AS regalos_profes,
       COALESCE(r.regalos_anulados, 0) AS regalos_anulados,
       COALESCE(t.alumnos_que_asistieron, 0) AS alumnos_que_asistieron,
       COALESCE(r.alumnos_que_regalaron, 0) AS alumnos_que_regalaron,
       CASE
         WHEN COALESCE(t.alumnos_que_asistieron, 0) = 0 THEN 0
         ELSE LEAST(100, ROUND(100 * LEAST(COALESCE(r.alumnos_que_regalaron, 0), t.alumnos_que_asistieron) / t.alumnos_que_asistieron))
       END AS porcentaje_que_regalo
FROM semanas s
CROSS JOIN branches b
LEFT JOIN regalos r
  ON r.tenant_id = b.tenant_id AND r.branch_id = b.id AND r.lunes = DATE_SUB(@lunes_actual, INTERVAL 7 * s.n DAY)
LEFT JOIN asistentes t
  ON t.tenant_id = b.tenant_id AND t.branch_id = b.id AND t.lunes = DATE_SUB(@lunes_actual, INTERVAL 7 * s.n DAY)
WHERE r.lunes IS NOT NULL OR t.lunes IS NOT NULL
ORDER BY s.n, b.tenant_id, b.name;

-- B. Total del gimnasio por semana (sin separar sedes)
-- Esperado: es el número que muestra la página "Regalos de Aura" del admin sin filtro de sede.
WITH semanas AS (
  SELECT 0 AS n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3
),
regalos AS (
  SELECT g.tenant_id,
         DATE_SUB(g.session_date, INTERVAL WEEKDAY(g.session_date) DAY) AS lunes,
         SUM(g.status = 'vigente' AND g.giver_kind = 'alumno') AS regalos_alumnos,
         SUM(g.status = 'vigente' AND g.giver_kind = 'profe') AS regalos_profes,
         SUM(g.status = 'anulado') AS regalos_anulados,
         COUNT(DISTINCT CASE WHEN g.status = 'vigente' AND g.giver_kind = 'alumno' THEN g.giver_user_id END) AS alumnos_que_regalaron
  FROM aura_gifts g
  WHERE g.session_date BETWEEN @desde AND @hasta
  GROUP BY g.tenant_id, DATE_SUB(g.session_date, INTERVAL WEEKDAY(g.session_date) DAY)
),
asistentes AS (
  SELECT a.tenant_id,
         DATE_SUB(a.session_date, INTERVAL WEEKDAY(a.session_date) DAY) AS lunes,
         COUNT(DISTINCT a.member_id) AS alumnos_que_asistieron
  FROM attendance a
  JOIN users u ON u.id = a.member_id AND u.tenant_id = a.tenant_id
  WHERE a.source IN ('qr', 'manual')
    AND a.session_date BETWEEN @desde AND @hasta
    AND u.role NOT IN ('coach', 'admin', 'owner', 'gestion', 'recepcion', 'admin_sede', 'coach_actividad')
  GROUP BY a.tenant_id, DATE_SUB(a.session_date, INTERVAL WEEKDAY(a.session_date) DAY)
),
gimnasios AS (
  SELECT DISTINCT tenant_id FROM branches
)
SELECT DATE_SUB(@lunes_actual, INTERVAL 7 * s.n DAY) AS semana_desde,
       gm.tenant_id,
       COALESCE(r.regalos_alumnos, 0) AS regalos_alumnos,
       COALESCE(r.regalos_profes, 0) AS regalos_profes,
       COALESCE(r.regalos_anulados, 0) AS regalos_anulados,
       COALESCE(t.alumnos_que_asistieron, 0) AS alumnos_que_asistieron,
       COALESCE(r.alumnos_que_regalaron, 0) AS alumnos_que_regalaron,
       CASE
         WHEN COALESCE(t.alumnos_que_asistieron, 0) = 0 THEN 0
         ELSE LEAST(100, ROUND(100 * LEAST(COALESCE(r.alumnos_que_regalaron, 0), t.alumnos_que_asistieron) / t.alumnos_que_asistieron))
       END AS porcentaje_que_regalo
FROM semanas s
CROSS JOIN gimnasios gm
LEFT JOIN regalos r
  ON r.tenant_id = gm.tenant_id AND r.lunes = DATE_SUB(@lunes_actual, INTERVAL 7 * s.n DAY)
LEFT JOIN asistentes t
  ON t.tenant_id = gm.tenant_id AND t.lunes = DATE_SUB(@lunes_actual, INTERVAL 7 * s.n DAY)
ORDER BY s.n, gm.tenant_id;
