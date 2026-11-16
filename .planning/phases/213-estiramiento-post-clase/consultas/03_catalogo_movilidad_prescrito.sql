WITH vid AS (SELECT UPPER(TRIM(exercise)) nm FROM exercises WHERE tenant_id=1 AND video_url IS NOT NULL AND video_url<>'' GROUP BY UPPER(TRIM(exercise))),
mob AS (
  SELECT UPPER(TRIM(e.exercise)) nm, p.exercise_type, sb.role, s.session_mode, p.contraction, p.reps, p.seconds, e.equipment, e.mobility_related mr, e.route, e.effort, (v.nm IS NOT NULL) v_fb
  FROM sessions s JOIN session_blocks sb ON sb.session_id=s.id JOIN session_prescriptions p ON p.block_id=sb.id
  JOIN exercises e ON e.id=p.exercise_id LEFT JOIN vid v ON v.nm=UPPER(TRIM(e.exercise))
  WHERE s.tenant_id=1 AND s.goal_plan_type IS NULL AND s.status='approved' AND s.week BETWEEN 30 AND 38
    AND (p.exercise_type='mobility' OR (e.pattern='MOVILIDAD' AND sb.role<>'INITIUM'))
)
SELECT nm, COUNT(*) presc, MAX(v_fb) video, GROUP_CONCAT(DISTINCT IFNULL(equipment,'?')) eq, GROUP_CONCAT(DISTINCT IFNULL(mr,'-')) mobrel, GROUP_CONCAT(DISTINCT contraction) contr,
       GROUP_CONCAT(DISTINCT IF(contraction='ISO', CONCAT(seconds,'s'), CONCAT(reps,'r')) ORDER BY reps, seconds) dosis, SUM(exercise_type='mobility') como_mob, SUM(role='STRETCHING') en_stretching, SUM(role LIKE 'ROM%') en_rom
FROM mob GROUP BY nm ORDER BY presc DESC;
