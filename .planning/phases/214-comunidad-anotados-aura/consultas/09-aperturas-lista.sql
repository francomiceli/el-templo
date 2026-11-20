-- Fase 214, plan de lanzamiento: cuantos alumnos abren la lista de anotados (semana 1, 2 y 4)
-- SOLO LECTURA. No correr sin OK de Franco. Agregados, sin datos personales
-- Sin CONVERT_TZ (en prod da NULL): session_date ya es la fecha local de la clase, igual que en bookings y attendance
-- Fuente: community_list_opens (mig 0354), una fila por alumno + horario + fecha de clase,
--   con open_count = veces que la API respondio bien la lista de esa clase. Cuenta toda respuesta 200,
--   la vea completa o solo el total (alumno sin plan u oculto).
-- La semana es la de la CLASE (lunes a domingo de session_date), no la del momento de abrir la lista:
--   la lista se puede abrir hasta 31 dias antes, asi que una apertura de hoy para una clase del mes que viene cae en esa semana.
-- "Abrio en 3+ dias distintos" = 3 o mas fechas de clase distintas dentro de la semana (la tabla no guarda un dia por apertura).
-- La tabla empieza a llenarse el dia del deploy: clases anteriores no figuran. Para el porcentaje, comparar
--   contra los alumnos activos de 07-linea-de-base.sql (misma semana).
-- Solo cuentas de rol member y no borradas. Wellhub y freemium entran como cualquier alumno.

SET SESSION TRANSACTION READ ONLY;
SET SESSION max_execution_time = 60000;
SET @desde = 'YYYY-MM-DD';   -- lunes de la semana en que se prende la lista (semana 1)

-- 1) Por semana: alumnos distintos que abrieron al menos una vez, aperturas totales, alumnos con 3+ fechas distintas
WITH por_alumno AS (
  SELECT DATE_SUB(o.session_date, INTERVAL WEEKDAY(o.session_date) DAY) AS lunes,
    o.user_id,
    SUM(o.open_count) AS aperturas,
    COUNT(DISTINCT o.session_date) AS dias
  FROM community_list_opens o
  JOIN users u ON u.id = o.user_id AND u.tenant_id = 1 AND u.role = 'member' AND u.deleted_at IS NULL
  WHERE o.tenant_id = 1
    AND o.session_date >= @desde
  GROUP BY lunes, o.user_id
)
SELECT lunes AS semana,
  COUNT(*) AS alumnos_que_abrieron,
  SUM(aperturas) AS aperturas_totales,
  SUM(dias >= 3) AS alumnos_en_3_o_mas_dias
FROM por_alumno
GROUP BY lunes
ORDER BY lunes;

-- 2) Alumnos distintos que abrieron la lista, por sede (la del horario de la clase) y semana
SELECT DATE_SUB(o.session_date, INTERVAL WEEKDAY(o.session_date) DAY) AS semana,
  b.id AS sede_id,
  b.name AS sede,
  COUNT(DISTINCT o.user_id) AS alumnos_que_abrieron,
  SUM(o.open_count) AS aperturas_totales
FROM community_list_opens o
JOIN schedules s ON s.id = o.schedule_id AND s.tenant_id = 1
JOIN branches b ON b.id = s.branch_id AND b.tenant_id = 1
JOIN users u ON u.id = o.user_id AND u.tenant_id = 1 AND u.role = 'member' AND u.deleted_at IS NULL
WHERE o.tenant_id = 1
  AND o.session_date >= @desde
GROUP BY semana, b.id, b.name
ORDER BY semana, b.name;
