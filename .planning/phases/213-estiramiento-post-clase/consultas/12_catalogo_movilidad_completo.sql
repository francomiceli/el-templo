WITH pres AS (
  SELECT UPPER(TRIM(e.exercise)) exn, COUNT(*) c FROM sessions s JOIN session_blocks sb ON sb.session_id=s.id JOIN session_prescriptions p ON p.block_id=sb.id JOIN exercises e ON e.id=p.exercise_id
  WHERE s.tenant_id=1 AND s.goal_plan_type IS NULL AND s.status='approved' AND s.week BETWEEN 29 AND 38 AND (p.exercise_type='mobility' OR (e.pattern='MOVILIDAD' AND sb.role<>'INITIUM')) GROUP BY exn
)
SELECT UPPER(TRIM(e.exercise)) nombre, GROUP_CONCAT(DISTINCT IFNULL(e.mobility_related,'-')) familia, MIN(e.id) id_min, COUNT(*) filas,
  MAX(e.video_url IS NOT NULL AND e.video_url<>'') video, GROUP_CONCAT(DISTINCT IFNULL(e.equipment,'?')) eq, GROUP_CONCAT(DISTINCT IF(e.effort='','-',e.effort)) effort,
  MIN(e.dificultad_lineal) dif_min, MAX(e.dificultad_lineal) dif_max, GROUP_CONCAT(DISTINCT e.category) cat, GROUP_CONCAT(DISTINCT IFNULL(e.position,'-')) pos, IFNULL(MAX(pr.c),0) presc
FROM exercises e LEFT JOIN pres pr ON pr.exn=UPPER(TRIM(e.exercise))
WHERE e.tenant_id=1 AND e.pattern='MOVILIDAD' GROUP BY nombre ORDER BY familia, dif_min, nombre;
