-- modos por dia en las ultimas semanas
SELECT week, GROUP_CONCAT(CONCAT(day, '=', modes) ORDER BY FIELD(day,'lunes','martes','miercoles','jueves','viernes','sabado') SEPARATOR ' ') dias
FROM (SELECT week, day, GROUP_CONCAT(DISTINCT CONCAT(session_mode, '/', status, 'x', cnt)) modes FROM (SELECT week, day, session_mode, status, COUNT(*) cnt FROM sessions WHERE tenant_id=1 AND goal_plan_type IS NULL AND week BETWEEN 30 AND 39 GROUP BY week, day, session_mode, status) a GROUP BY week, day) b GROUP BY week;
-- cobertura por sesion (W30-W38, aprobadas, entrenamiento general)
WITH vid AS (
  SELECT UPPER(TRIM(exercise)) nm FROM exercises WHERE tenant_id=1 AND video_url IS NOT NULL AND video_url<>'' GROUP BY UPPER(TRIM(exercise))
), mob AS (
  SELECT s.id sid, s.session_mode, s.week, s.day, sb.role, p.exercise_type, p.exercise_id, UPPER(TRIM(e.exercise)) nm, p.contraction, p.reps, p.seconds,
         e.equipment, (e.video_url IS NOT NULL AND e.video_url<>'') v_dir, (v.nm IS NOT NULL) v_fb
  FROM sessions s JOIN session_blocks sb ON sb.session_id=s.id JOIN session_prescriptions p ON p.block_id=sb.id
  JOIN exercises e ON e.id=p.exercise_id LEFT JOIN vid v ON v.nm=UPPER(TRIM(e.exercise))
  WHERE s.tenant_id=1 AND s.goal_plan_type IS NULL AND s.status='approved' AND s.week BETWEEN 30 AND 38
    AND (p.exercise_type='mobility' OR (e.pattern='MOVILIDAD' AND sb.role<>'INITIUM'))
), per AS (
  SELECT sid, session_mode, COUNT(*) n, COUNT(DISTINCT nm) n_dist, SUM(v_fb) n_vid, COUNT(DISTINCT IF(v_fb,nm,NULL)) n_dist_vid,
         COUNT(DISTINCT IF(equipment='ninguno',nm,NULL)) n_dist_casa, COUNT(DISTINCT IF(equipment IS NULL,nm,NULL)) n_dist_eqnull,
         COUNT(DISTINCT IF(v_fb AND equipment='ninguno',nm,NULL)) n_dist_vid_casa,
         SUM(IF(contraction='ISO', seconds, reps*3)) seg_dosis
  FROM mob GROUP BY sid, session_mode
)
SELECT session_mode, COUNT(*) sesiones, ROUND(AVG(n),1) mob_prom, MIN(n) mn, MAX(n) mx, ROUND(AVG(n_dist),1) dist_prom,
       ROUND(AVG(n_dist_vid),1) dist_con_video, SUM(n_dist_vid=0) ses_sin_ningun_video, SUM(n_dist_vid>=3) ses_3omas_video,
       ROUND(AVG(n_dist_casa),1) dist_eq_ninguno, ROUND(AVG(n_dist_eqnull),1) dist_eq_null, ROUND(AVG(n_dist_vid_casa),1) dist_video_y_casa,
       ROUND(AVG(seg_dosis)) seg_dosis_prom
FROM per GROUP BY session_mode;
-- sesiones aprobadas sin ninguna movilidad
SELECT s.session_mode, COUNT(*) total, SUM(NOT EXISTS (SELECT 1 FROM session_blocks sb JOIN session_prescriptions p ON p.block_id=sb.id JOIN exercises e ON e.id=p.exercise_id WHERE sb.session_id=s.id AND (p.exercise_type='mobility' OR (e.pattern='MOVILIDAD' AND sb.role<>'INITIUM')))) sin_mov
FROM sessions s WHERE s.tenant_id=1 AND s.goal_plan_type IS NULL AND s.status='approved' AND s.week BETWEEN 30 AND 38 GROUP BY s.session_mode;
