-- lag entre fin de clase y la proxima apertura de la app (member_logins) el mismo dia local
WITH att AS (
  SELECT a.id, a.member_id, s.end_time, a.attendance_source src, a.created_at,
         TIMESTAMP(a.session_date, CONCAT(s.end_time,':00')) + INTERVAL IF(b.country='AR',3,IF(a.session_date<'2026-10-25',-2,-1)) HOUR fin_utc,
         TIMESTAMP(a.session_date, '23:59:59') + INTERVAL IF(b.country='AR',3,IF(a.session_date<'2026-10-25',-2,-1)) HOUR medianoche_utc
  FROM attendance a JOIN schedules s ON s.id=a.schedule_id JOIN branches b ON b.id=a.branch_id
  WHERE a.session_date BETWEEN CURDATE() - INTERVAL 56 DAY AND CURDATE() - INTERVAL 1 DAY AND s.activity_id IN (1,2)
), lg AS (
  SELECT att.*, (SELECT MIN(l.logged_in_at) FROM member_logins l WHERE l.user_id=att.member_id AND l.logged_in_at > att.fin_utc AND l.logged_in_at <= att.medianoche_utc) prox
  FROM att
)
SELECT CASE WHEN end_time <= '13:00' THEN '1 manana (fin<=13)' WHEN end_time <= '19:00' THEN '2 tarde (fin 17-19)' WHEN end_time='20:00' THEN '3 fin 20:00' ELSE '4 fin 21:00' END franja,
  COUNT(*) n,
  ROUND(100*SUM(prox IS NOT NULL)/COUNT(*)) pct_abre_mismo_dia,
  ROUND(100*SUM(TIMESTAMPDIFF(MINUTE, fin_utc, prox) < 15)/COUNT(*)) 'lt15',
  ROUND(100*SUM(TIMESTAMPDIFF(MINUTE, fin_utc, prox) < 30)/COUNT(*)) 'lt30',
  ROUND(100*SUM(TIMESTAMPDIFF(MINUTE, fin_utc, prox) < 60)/COUNT(*)) 'lt60',
  ROUND(100*SUM(TIMESTAMPDIFF(MINUTE, fin_utc, prox) < 90)/COUNT(*)) 'lt90',
  ROUND(100*SUM(TIMESTAMPDIFF(MINUTE, fin_utc, prox) < 120)/COUNT(*)) 'lt120',
  ROUND(100*SUM(TIMESTAMPDIFF(MINUTE, fin_utc, prox) < 180)/COUNT(*)) 'lt180'
FROM lg GROUP BY franja WITH ROLLUP;
-- % de asistencias que todavia NO estaban registradas X minutos despues del fin de clase (por fuente)
SELECT a.attendance_source src, COUNT(*) n,
  ROUND(100*SUM(a.checked_in_at > TIMESTAMP(a.session_date, CONCAT(s.end_time,':00')) + INTERVAL IF(b.country='AR',3,IF(a.session_date<'2026-10-25',-2,-1)) HOUR)/COUNT(*),1) tarde_fin,
  ROUND(100*SUM(a.checked_in_at > TIMESTAMP(a.session_date, CONCAT(s.end_time,':00')) + INTERVAL IF(b.country='AR',3,IF(a.session_date<'2026-10-25',-2,-1)) HOUR + INTERVAL 30 MINUTE)/COUNT(*),1) tarde_30,
  ROUND(100*SUM(a.checked_in_at > TIMESTAMP(a.session_date, CONCAT(s.end_time,':00')) + INTERVAL IF(b.country='AR',3,IF(a.session_date<'2026-10-25',-2,-1)) HOUR + INTERVAL 60 MINUTE)/COUNT(*),1) tarde_60,
  ROUND(100*SUM(a.checked_in_at > TIMESTAMP(a.session_date, CONCAT(s.end_time,':00')) + INTERVAL IF(b.country='AR',3,IF(a.session_date<'2026-10-25',-2,-1)) HOUR + INTERVAL 120 MINUTE)/COUNT(*),1) tarde_120
FROM attendance a JOIN schedules s ON s.id=a.schedule_id JOIN branches b ON b.id=a.branch_id
WHERE a.session_date BETWEEN CURDATE() - INTERVAL 56 DAY AND CURDATE() - INTERVAL 1 DAY AND s.activity_id IN (1,2) GROUP BY a.attendance_source WITH ROLLUP;
-- hora local de las aperturas de la app de quienes asistieron ese dia (solo AR), despues del fin de clase
SELECT HOUR(l.logged_in_at - INTERVAL 3 HOUR) hora_local, COUNT(*) aperturas
FROM attendance a JOIN schedules s ON s.id=a.schedule_id JOIN branches b ON b.id=a.branch_id AND b.country='AR'
JOIN member_logins l ON l.user_id=a.member_id AND l.logged_in_at > TIMESTAMP(a.session_date, CONCAT(s.end_time,':00')) + INTERVAL 3 HOUR AND l.logged_in_at <= TIMESTAMP(a.session_date,'23:59:59') + INTERVAL 3 HOUR
WHERE a.session_date BETWEEN CURDATE() - INTERVAL 56 DAY AND CURDATE() - INTERVAL 1 DAY AND s.activity_id IN (1,2) GROUP BY hora_local ORDER BY hora_local;
