SELECT s.day_id, s.session_mode modo, sb.sort_order ord, sb.role, sb.route ruta, p.exercise_type tipo, UPPER(TRIM(e.exercise)) ejercicio, IFNULL(e.mobility_related,'-') familia
FROM sessions s JOIN session_blocks sb ON sb.session_id=s.id JOIN session_prescriptions p ON p.block_id=sb.id JOIN exercises e ON e.id=p.exercise_id
WHERE s.tenant_id=1 AND s.goal_plan_type IS NULL AND s.status='approved'
  AND s.day_id IN ('W38-lunes-alfa','W38-lunes-delta','W38-martes-kairos','W38-martes-alfa','W37-miercoles-alfa','W37-jueves-delta','W37-jueves-kairos','W37-viernes-alfa','W37-viernes-sigma','W37-sabado-alfa','W38-miercoles-alfa','W37-lunes-kairos')
  AND (p.exercise_type='mobility' OR (e.pattern='MOVILIDAD' AND sb.role<>'INITIUM'))
ORDER BY s.week, FIELD(s.day,'lunes','martes','miercoles','jueves','viernes','sabado'), s.day_id, sb.sort_order, p.sort_order;
-- rutas principales de esas sesiones (contexto para el kinesiologo)
SELECT s.day_id, GROUP_CONCAT(CONCAT(sb.role,':',sb.route) ORDER BY sb.sort_order SEPARATOR ' ') bloques
FROM sessions s JOIN session_blocks sb ON sb.session_id=s.id
WHERE s.tenant_id=1 AND s.goal_plan_type IS NULL AND s.status='approved'
  AND s.day_id IN ('W38-lunes-alfa','W38-lunes-delta','W38-martes-kairos','W38-martes-alfa','W37-miercoles-alfa','W37-jueves-delta','W37-jueves-kairos','W37-viernes-alfa','W37-viernes-sigma','W37-sabado-alfa','W38-miercoles-alfa','W37-lunes-kairos') GROUP BY s.day_id;
-- pushes por alumno por semana si se manda uno por asistencia (para el tope de frecuencia)
SELECT c asistencias_en_la_semana, COUNT(*) alumno_semanas, ROUND(100*COUNT(*)/SUM(COUNT(*)) OVER (),1) pct, ROUND(100*c*COUNT(*)/SUM(c*COUNT(*)) OVER (),1) pct_de_asistencias
FROM (SELECT a.member_id, YEARWEEK(a.session_date,3) yw, COUNT(DISTINCT a.session_date) c FROM attendance a JOIN schedules s ON s.id=a.schedule_id
      WHERE a.session_date BETWEEN CURDATE() - INTERVAL 56 DAY AND CURDATE() - INTERVAL 1 DAY AND s.activity_id=1 GROUP BY a.member_id, yw) x GROUP BY c ORDER BY c;
