SELECT template_key, notification_category cat, is_enabled en, kind, sent_count, opened_count, ROUND(100*opened_count/NULLIF(sent_count,0),1) pct_open, route, destination_section ds
FROM notification_templates WHERE tenant_id=1 ORDER BY sent_count DESC;
-- asistentes de 8 semanas: token y preferencias
WITH asis AS (SELECT a.member_id uid, COUNT(*) c FROM attendance a JOIN schedules s ON s.id=a.schedule_id WHERE a.session_date >= CURDATE() - INTERVAL 56 DAY AND s.activity_id IN (1,2) GROUP BY a.member_id)
SELECT COUNT(*) asistentes, SUM(c) asistencias,
  ROUND(100*SUM(EXISTS(SELECT 1 FROM device_tokens d WHERE d.user_id=asis.uid))/COUNT(*),1) pct_con_token,
  ROUND(100*SUM(c*EXISTS(SELECT 1 FROM device_tokens d WHERE d.user_id=asis.uid))/SUM(c),1) pct_asistencias_con_token,
  ROUND(100*SUM(EXISTS(SELECT 1 FROM device_tokens d WHERE d.user_id=asis.uid AND d.device_platform='ios'))/COUNT(*),1) pct_ios,
  ROUND(100*SUM(EXISTS(SELECT 1 FROM device_tokens d WHERE d.user_id=asis.uid AND d.device_platform='android'))/COUNT(*),1) pct_android,
  ROUND(100*SUM(EXISTS(SELECT 1 FROM notification_preferences p WHERE p.user_id=asis.uid AND p.notification_category='entrenamiento' AND p.enabled=0))/COUNT(*),1) pct_entrenamiento_off,
  ROUND(100*SUM(EXISTS(SELECT 1 FROM notification_preferences p WHERE p.user_id=asis.uid AND p.notification_category='motivacion' AND p.enabled=0))/COUNT(*),1) pct_motivacion_off,
  ROUND(100*SUM(EXISTS(SELECT 1 FROM device_tokens d WHERE d.user_id=asis.uid) AND NOT EXISTS(SELECT 1 FROM notification_preferences p WHERE p.user_id=asis.uid AND p.notification_category='entrenamiento' AND p.enabled=0))/COUNT(*),1) pct_alcanzable_entrenamiento
FROM asis;
-- frescura de tokens de asistentes
SELECT ROUND(100*SUM(d.updated_at >= NOW() - INTERVAL 14 DAY)/COUNT(*)) pct_tokens_tocados_14d, ROUND(100*SUM(d.updated_at >= NOW() - INTERVAL 56 DAY)/COUNT(*)) pct_56d, COUNT(*) tokens
FROM device_tokens d WHERE d.user_id IN (SELECT member_id FROM attendance WHERE session_date >= CURDATE() - INTERVAL 56 DAY);
-- cola actual (24 h): que se manda y a que hora local AR
SELECT t.template_key, n.notification_status st, COUNT(*) n, MIN(HOUR(n.scheduled_at - INTERVAL 3 HOUR)) h_min, MAX(HOUR(n.scheduled_at - INTERVAL 3 HOUR)) h_max
FROM pending_notifications n LEFT JOIN notification_templates t ON t.id=n.template_id GROUP BY t.template_key, n.notification_status ORDER BY n DESC LIMIT 25;
-- sesiones completadas en la app (no presencial) por asistentes el mismo dia de clase
SELECT COUNT(*) asistencias, SUM(EXISTS(SELECT 1 FROM completed_sessions c WHERE c.user_id=a.member_id AND c.date=DATE_FORMAT(a.session_date,'%Y-%m-%d') AND c.day_id NOT LIKE 'presencial-%')) con_sesion_app_mismo_dia,
       SUM(EXISTS(SELECT 1 FROM completed_sessions c WHERE c.user_id=a.member_id AND c.date=DATE_FORMAT(a.session_date,'%Y-%m-%d') AND c.day_id LIKE 'presencial-%')) con_espejo
FROM attendance a WHERE a.session_date >= CURDATE() - INTERVAL 56 DAY;
