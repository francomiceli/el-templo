-- simulacion: si se filman los K ejercicios de movilidad sin video mas prescritos, que % de asistencias queda con >=3 (y >=4) estiramientos con video
WITH vid AS (SELECT UPPER(TRIM(exercise)) nm FROM exercises WHERE tenant_id=1 AND video_url IS NOT NULL AND video_url<>'' GROUP BY UPPER(TRIM(exercise))),
pres AS (
  SELECT DISTINCT s.day_id, UPPER(TRIM(e.exercise)) exn, (v.nm IS NOT NULL) tiene
  FROM sessions s JOIN session_blocks sb ON sb.session_id=s.id JOIN session_prescriptions p ON p.block_id=sb.id
  JOIN exercises e ON e.id=p.exercise_id LEFT JOIN vid v ON v.nm=UPPER(TRIM(e.exercise))
  WHERE s.tenant_id=1 AND s.goal_plan_type IS NULL AND s.status='approved' AND s.week BETWEEN 29 AND 38
    AND (p.exercise_type='mobility' OR (e.pattern='MOVILIDAD' AND sb.role<>'INITIUM'))
), att AS (
  SELECT CONCAT('W', FLOOR(DATEDIFF(a.session_date,'2026-02-23')/7)+1, '-', ELT(WEEKDAY(a.session_date)+1,'lunes','martes','miercoles','jueves','viernes','sabado','domingo'), '-',
      IF(WEEKDAY(a.session_date)=5, IF(u.level IN ('kairos','alfa'),'alfa','delta'), u.level)) did, COUNT(*) w
  FROM attendance a JOIN users u ON u.id=a.member_id JOIN schedules s ON s.id=a.schedule_id
  WHERE a.session_date BETWEEN CURDATE() - INTERVAL 56 DAY AND CURDATE() - INTERVAL 1 DAY AND s.activity_id IN (1,2) GROUP BY did
), rk AS (
  SELECT exn, ROW_NUMBER() OVER (ORDER BY SUM(w) DESC) r FROM pres JOIN att ON att.did=pres.day_id WHERE tiene=0 GROUP BY exn
), ks AS (SELECT 0 k UNION ALL SELECT 10 UNION ALL SELECT 20 UNION ALL SELECT 30 UNION ALL SELECT 45 UNION ALL SELECT 200),
per AS (
  SELECT ks.k, pres.day_id, SUM(pres.tiene=1 OR IFNULL(rk.r,9999) <= ks.k) nv
  FROM ks JOIN pres LEFT JOIN rk ON rk.exn=pres.exn GROUP BY ks.k, pres.day_id
)
SELECT per.k videos_nuevos, SUM(att.w) asistencias, ROUND(100*SUM(att.w*(nv>=3))/SUM(att.w)) pct_3omas, ROUND(100*SUM(att.w*(nv>=4))/SUM(att.w)) pct_4omas, ROUND(100*SUM(att.w*(nv=0))/SUM(att.w)) pct_cero
FROM per JOIN att ON att.did=per.day_id GROUP BY per.k ORDER BY per.k;
SELECT COUNT(*) sin_video_usados FROM rk;
