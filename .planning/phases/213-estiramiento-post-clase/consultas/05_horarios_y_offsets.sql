-- distribucion de hora de fin por sede (asistencia real, 8 semanas, General + ROM)
SELECT b.code, COUNT(*) n,
  ROUND(100*SUM(s.end_time <= '10:00')/COUNT(*)) 'fin<=10', ROUND(100*SUM(s.end_time > '10:00' AND s.end_time <= '13:00')/COUNT(*)) '10-13',
  ROUND(100*SUM(s.end_time > '13:00' AND s.end_time <= '17:00')/COUNT(*)) '13-17', ROUND(100*SUM(s.end_time > '17:00' AND s.end_time <= '19:00')/COUNT(*)) '17-19',
  ROUND(100*SUM(s.end_time = '20:00')/COUNT(*)) 'fin20', ROUND(100*SUM(s.end_time = '21:00')/COUNT(*)) 'fin21', ROUND(100*SUM(s.end_time > '21:00')/COUNT(*)) 'fin>21', MAX(s.end_time) max_fin
FROM attendance a JOIN schedules s ON s.id=a.schedule_id JOIN branches b ON b.id=a.branch_id
WHERE a.session_date >= CURDATE() - INTERVAL 56 DAY AND s.activity_id IN (1,2) GROUP BY b.code WITH ROLLUP;
-- hora local del push por offset: % que cae a las 21:30 o mas tarde / 22:00 o mas tarde
SELECT o.off_min, COUNT(*) n,
  ROUND(100*SUM(ADDTIME(STR_TO_DATE(s.end_time,'%H:%i'), SEC_TO_TIME(o.off_min*60)) >= '1900-01-01 21:00:00' AND TIME(ADDTIME(STR_TO_DATE(s.end_time,'%H:%i'), SEC_TO_TIME(o.off_min*60))) >= '21:00:00')/COUNT(*),1) pct_21_o_mas,
  ROUND(100*SUM(TIME(ADDTIME(STR_TO_DATE(s.end_time,'%H:%i'), SEC_TO_TIME(o.off_min*60))) >= '21:30:00')/COUNT(*),1) pct_2130_o_mas,
  ROUND(100*SUM(TIME(ADDTIME(STR_TO_DATE(s.end_time,'%H:%i'), SEC_TO_TIME(o.off_min*60))) >= '22:00:00')/COUNT(*),1) pct_22_o_mas,
  ROUND(100*SUM(TIME(ADDTIME(STR_TO_DATE(s.end_time,'%H:%i'), SEC_TO_TIME(o.off_min*60))) >= '22:30:00')/COUNT(*),1) pct_2230_o_mas
FROM attendance a JOIN schedules s ON s.id=a.schedule_id
JOIN (SELECT 15 off_min UNION ALL SELECT 30 UNION ALL SELECT 60 UNION ALL SELECT 90 UNION ALL SELECT 120) o
WHERE a.session_date >= CURDATE() - INTERVAL 56 DAY AND s.activity_id IN (1,2) GROUP BY o.off_min;
-- choque con otra clase del mismo dia (asistida o reservada) que empieza despues del inicio de esta y antes del momento del push
SELECT o.off_min, COUNT(*) n,
  ROUND(100*SUM(EXISTS (SELECT 1 FROM attendance a2 JOIN schedules s2 ON s2.id=a2.schedule_id WHERE a2.member_id=a.member_id AND a2.session_date=a.session_date AND a2.id<>a.id AND s2.start_time >= s.start_time AND s2.id<>s.id
       AND STR_TO_DATE(s2.start_time,'%H:%i') < ADDTIME(STR_TO_DATE(s.end_time,'%H:%i'), SEC_TO_TIME(o.off_min*60))))/COUNT(*),2) pct_choca_asistencia,
  ROUND(100*SUM(EXISTS (SELECT 1 FROM bookings k JOIN schedules s2 ON s2.id=k.schedule_id WHERE k.member_id=a.member_id AND k.booking_date=a.session_date AND k.schedule_id<>a.schedule_id AND k.booking_status IN ('reservado','qr_escaneado','confirmado','no_show') AND s2.start_time >= s.start_time
       AND STR_TO_DATE(s2.start_time,'%H:%i') < ADDTIME(STR_TO_DATE(s.end_time,'%H:%i'), SEC_TO_TIME(o.off_min*60))))/COUNT(*),2) pct_choca_reserva
FROM attendance a JOIN schedules s ON s.id=a.schedule_id
JOIN (SELECT 30 off_min UNION ALL SELECT 60 UNION ALL SELECT 90 UNION ALL SELECT 120) o
WHERE a.session_date >= CURDATE() - INTERVAL 56 DAY AND s.activity_id IN (1,2) GROUP BY o.off_min;
-- dos asistencias el mismo dia
SELECT COUNT(*) pares_alumno_dia, SUM(c>1) con_2_o_mas FROM (SELECT member_id, session_date, COUNT(*) c FROM attendance WHERE session_date >= CURDATE() - INTERVAL 56 DAY GROUP BY member_id, session_date) x;
-- check-in respecto del inicio de la clase (minutos), para saber si el check-in sirve de reloj
SELECT attendance_source, COUNT(*) n,
  ROUND(AVG(TIMESTAMPDIFF(MINUTE, TIMESTAMP(a.session_date, CONCAT(s.start_time,':00')), a.checked_in_at - INTERVAL IF(b.country='AR',3,IF(a.session_date<'2026-10-25',-2,-1)) HOUR))) prom_min_desde_inicio,
  ROUND(100*SUM(TIMESTAMPDIFF(MINUTE, TIMESTAMP(a.session_date, CONCAT(s.start_time,':00')), a.checked_in_at - INTERVAL IF(b.country='AR',3,IF(a.session_date<'2026-10-25',-2,-1)) HOUR) BETWEEN -20 AND 20)/COUNT(*)) pct_dentro_20min,
  ROUND(100*SUM(TIMESTAMPDIFF(MINUTE, TIMESTAMP(a.session_date, CONCAT(s.start_time,':00')), a.checked_in_at - INTERVAL IF(b.country='AR',3,IF(a.session_date<'2026-10-25',-2,-1)) HOUR) > 60)/COUNT(*)) pct_despues_del_fin
FROM attendance a JOIN schedules s ON s.id=a.schedule_id JOIN branches b ON b.id=a.branch_id
WHERE a.session_date >= CURDATE() - INTERVAL 56 DAY AND s.activity_id IN (1,2) GROUP BY attendance_source;
