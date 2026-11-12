-- cobertura ponderada por asistencia real: asistencia -> (semana, dia, nivel del alumno) -> sesion aprobada -> movilidad
WITH vid AS (SELECT UPPER(TRIM(exercise)) nm FROM exercises WHERE tenant_id=1 AND video_url IS NOT NULL AND video_url<>'' GROUP BY UPPER(TRIM(exercise))),
ses AS (
  SELECT s.id sid, s.day_id, s.session_mode,
    COUNT(DISTINCT UPPER(TRIM(e.exercise))) n_dist,
    COUNT(DISTINCT IF(v.nm IS NOT NULL, UPPER(TRIM(e.exercise)), NULL)) n_vid,
    COUNT(DISTINCT IF(v.nm IS NOT NULL AND e.equipment='ninguno', UPPER(TRIM(e.exercise)), NULL)) n_vid_casa,
    COUNT(DISTINCT e.mobility_related) n_familias
  FROM sessions s JOIN session_blocks sb ON sb.session_id=s.id JOIN session_prescriptions p ON p.block_id=sb.id
  JOIN exercises e ON e.id=p.exercise_id LEFT JOIN vid v ON v.nm=UPPER(TRIM(e.exercise))
  WHERE s.tenant_id=1 AND s.goal_plan_type IS NULL AND s.status='approved' AND s.week BETWEEN 29 AND 38
    AND (p.exercise_type='mobility' OR (e.pattern='MOVILIDAD' AND sb.role<>'INITIUM'))
  GROUP BY s.id, s.day_id, s.session_mode
), att AS (
  SELECT a.id, u.level, FLOOR(DATEDIFF(a.session_date,'2026-02-23')/7)+1 wk, WEEKDAY(a.session_date) wd, s.activity_id,
    CONCAT('W', FLOOR(DATEDIFF(a.session_date,'2026-02-23')/7)+1, '-', ELT(WEEKDAY(a.session_date)+1,'lunes','martes','miercoles','jueves','viernes','sabado','domingo'), '-',
      IF(WEEKDAY(a.session_date)=5, IF(u.level IN ('kairos','alfa'),'alfa','delta'), u.level)) did
  FROM attendance a JOIN users u ON u.id=a.member_id JOIN schedules s ON s.id=a.schedule_id
  WHERE a.session_date BETWEEN CURDATE() - INTERVAL 56 DAY AND CURDATE() - INTERVAL 1 DAY AND s.activity_id IN (1,2)
)
SELECT IFNULL(ses.session_mode,'(sin sesion aprobada)') modo, COUNT(*) asistencias,
  ROUND(AVG(n_dist),1) mov_distintas, ROUND(AVG(n_vid),1) con_video,
  ROUND(100*SUM(n_vid=0)/COUNT(*)) pct_0_video, ROUND(100*SUM(n_vid=1)/COUNT(*)) pct_1, ROUND(100*SUM(n_vid=2)/COUNT(*)) pct_2, ROUND(100*SUM(n_vid>=3)/COUNT(*)) pct_3omas, ROUND(100*SUM(n_vid>=4)/COUNT(*)) pct_4omas,
  ROUND(100*SUM(n_vid_casa>=3)/COUNT(*)) pct_3omas_video_y_sin_elementos, ROUND(AVG(n_familias),1) familias
FROM att LEFT JOIN ses ON ses.day_id=att.did GROUP BY modo WITH ROLLUP;
-- niveles de los asistentes
SELECT u.level, COUNT(*) asistencias, COUNT(DISTINCT a.member_id) alumnos FROM attendance a JOIN users u ON u.id=a.member_id WHERE a.session_date >= CURDATE() - INTERVAL 56 DAY GROUP BY u.level;
-- capacidad de completado: pool MOVILIDAD con video, por familia (mobility_related), nombres distintos
SELECT IFNULL(mobility_related,'(sin familia)') familia, COUNT(DISTINCT UPPER(TRIM(exercise))) nombres,
  COUNT(DISTINCT IF(video_url IS NOT NULL AND video_url<>'', UPPER(TRIM(exercise)), NULL)) con_video,
  COUNT(DISTINCT IF(video_url IS NOT NULL AND video_url<>'' AND equipment='ninguno', UPPER(TRIM(exercise)), NULL)) con_video_sin_elem,
  GROUP_CONCAT(DISTINCT IF(video_url IS NOT NULL AND video_url<>'', UPPER(TRIM(exercise)), NULL) ORDER BY exercise SEPARATOR ', ') lista_con_video
FROM exercises WHERE tenant_id=1 AND pattern='MOVILIDAD' GROUP BY familia;
