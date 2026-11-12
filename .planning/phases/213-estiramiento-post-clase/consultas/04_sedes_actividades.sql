SELECT CONVERT_TZ('2026-11-11 12:00:00','UTC','America/Argentina/Buenos_Aires') tz_test;
SELECT b.id, b.code, b.timezone, b.country, b.is_virtual, b.is_active, b.rom_enabled, COUNT(a.id) asist_8sem, COUNT(DISTINCT a.member_id) alumnos
FROM branches b LEFT JOIN attendance a ON a.branch_id=b.id AND a.session_date >= CURDATE() - INTERVAL 56 DAY GROUP BY b.id;
SELECT ac.id, ac.name, ac.is_special, ac.special_line, COUNT(a.id) asist_8sem, COUNT(DISTINCT s.id) horarios, MIN(s.start_time) desde, MAX(s.end_time) hasta,
       GROUP_CONCAT(DISTINCT TIMESTAMPDIFF(MINUTE, STR_TO_DATE(s.start_time,'%H:%i'), STR_TO_DATE(s.end_time,'%H:%i'))) duraciones
FROM attendance a JOIN schedules s ON s.id=a.schedule_id JOIN activities ac ON ac.id=s.activity_id
WHERE a.session_date >= CURDATE() - INTERVAL 56 DAY GROUP BY ac.id ORDER BY asist_8sem DESC;
SELECT table_name AS t, GROUP_CONCAT(CONCAT(column_name, ':', column_type) ORDER BY ordinal_position SEPARATOR ' | ') cols, MAX(table_rows) FROM information_schema.columns c JOIN information_schema.tables t USING (table_schema, table_name) WHERE table_schema=DATABASE() AND table_name IN ('member_logins','day_modes') GROUP BY table_name;
SELECT MIN(logged_in_at), MAX(logged_in_at), COUNT(*) FROM member_logins WHERE logged_in_at >= NOW() - INTERVAL 56 DAY;
SELECT * FROM day_modes;
