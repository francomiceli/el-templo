-- D-03: con que frecuencia la movilidad prescrita ya trae tren superior, y con que frecuencia hay bloques de empuje/traccion
WITH ses AS (
  SELECT s.day_id, s.session_mode,
    MAX(sb.route IN ('HS','HSPU','PHS','OAPU','PLPU','PL','DS','MU','OAP','OAR','BL','FL','FLR')) hay_tren_sup,
    MAX(p.exercise_type='mobility' AND UPPER(TRIM(e.exercise)) IN ('WALL CHEST STRETCH','BUTCHER FLOOR STRETCH','LAY DOWN ARMS UP','COBRA STRETCH','ANGELS AND DEMONS')) mov_trae_ts,
    MAX((p.exercise_type='mobility' OR sb.role='STRETCHING') AND e.pattern='MOVILIDAD' AND e.mobility_related IS NULL) mov_sin_familia
  FROM sessions s JOIN session_blocks sb ON sb.session_id=s.id AND sb.role<>'INITIUM' JOIN session_prescriptions p ON p.block_id=sb.id JOIN exercises e ON e.id=p.exercise_id
  WHERE s.tenant_id=1 AND s.goal_plan_type IS NULL AND s.status='approved' AND s.week BETWEEN 29 AND 38 AND s.session_mode<>'rom' GROUP BY s.day_id, s.session_mode
), att AS (
  SELECT CONCAT('W', FLOOR(DATEDIFF(a.session_date,'2026-02-23')/7)+1, '-', ELT(WEEKDAY(a.session_date)+1,'lunes','martes','miercoles','jueves','viernes','sabado','domingo'), '-', u.level) did, COUNT(*) w
  FROM attendance a JOIN users u ON u.id=a.member_id JOIN schedules s ON s.id=a.schedule_id
  WHERE a.session_date BETWEEN CURDATE() - INTERVAL 56 DAY AND CURDATE() - INTERVAL 1 DAY AND s.activity_id=1 GROUP BY did
)
SELECT SUM(w) asistencias, ROUND(100*SUM(w*hay_tren_sup)/SUM(w)) pct_con_bloque_empuje_o_traccion, ROUND(100*SUM(w*mov_trae_ts)/SUM(w)) pct_movilidad_ya_trae_ts,
  ROUND(100*SUM(w*(hay_tren_sup AND NOT mov_trae_ts))/SUM(w)) pct_complemento_actuaria, ROUND(100*SUM(w*mov_sin_familia)/SUM(w)) pct_con_movilidad_sin_familia
FROM att JOIN ses ON ses.day_id=att.did;
SELECT sb.route, COUNT(*) bloques FROM sessions s JOIN session_blocks sb ON sb.session_id=s.id WHERE s.tenant_id=1 AND s.goal_plan_type IS NULL AND s.status='approved' AND s.week BETWEEN 29 AND 38 AND sb.role NOT IN ('INITIUM','STRETCHING') AND s.session_mode<>'rom' GROUP BY sb.route ORDER BY bloques DESC;
