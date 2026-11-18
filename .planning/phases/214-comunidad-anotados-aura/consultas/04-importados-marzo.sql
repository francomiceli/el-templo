-- Fase 214, D-29: importados de marzo con la fecha del import como alta
-- SOLO LECTURA. No correr sin OK de Franco. Agregados, sin datos personales
--
-- Contexto (RESEARCH 3): tres pasadas de importacion ya corrigieron users.created_at
--   1) import-members.ts (2026-03-16): usa "Fecha de ingreso" del CSV de sede si viene
--   2) import-vigentes.ts (2026-04-01): adelanta created_at a la vigencia mas vieja
--   3) import-fecha-ingreso.ts (2026-04-18): pisa created_at con la fecha mas vieja por email
-- Lo esperado es que la base NO tenga la fecha real de los 367 que quedaron con la fecha del import.
-- Si la consulta D devuelve filas, la correccion va por una migracion aparte
-- que se planifica con ese resultado (no se corrige nada desde esta fase).
--
-- Orden: correr A, completar @dia con el resultado de A (B), correr C y D.

SET SESSION TRANSACTION READ ONLY;
SET SESSION max_execution_time = 30000;

-- A. El dia del pico de altas de marzo
SELECT DATE(u.created_at) AS dia, COUNT(*) AS altas, MIN(TIME(u.created_at)) AS primera, MAX(TIME(u.created_at)) AS ultima
FROM users u
WHERE u.tenant_id = 1 AND u.role = 'member'
  AND u.created_at >= '2026-03-01' AND u.created_at < '2026-04-01'
GROUP BY DATE(u.created_at) ORDER BY altas DESC LIMIT 3;

-- B. Completar con el dia de A
SET @dia = 'YYYY-MM-DD';

-- C. Que datos tienen esos alumnos que podrian dar la fecha real
SELECT COUNT(*) AS total,
  SUM(u.deleted_at IS NULL) AS vivos,
  SUM(u.status = 'activo') AS activos_hoy,
  SUM(u.email IS NULL OR u.email = '') AS sin_email,
  SUM(EXISTS (SELECT 1 FROM subscriptions s WHERE s.user_id = u.id AND s.notes LIKE 'Importado desde CSV%')) AS con_sub_importada,
  SUM(EXISTS (SELECT 1 FROM subscriptions s WHERE s.user_id = u.id AND s.start_date < DATE(u.created_at))) AS con_sub_anterior_al_alta,
  SUM(EXISTS (SELECT 1 FROM financial_transactions f WHERE f.member_id = u.id AND f.created_at < u.created_at)) AS con_cobro_anterior,
  SUM(EXISTS (SELECT 1 FROM member_notes n WHERE n.user_id = u.id)) AS con_notas_de_import
FROM users u
WHERE u.tenant_id = 1 AND u.role = 'member' AND DATE(u.created_at) = @dia;

-- D. Si C da con_sub_anterior_al_alta > 0: distribucion por anio de la fecha candidata
SELECT YEAR(x.candidata) AS anio, COUNT(*) AS alumnos
FROM (
  SELECT u.id, (SELECT MIN(s.start_date) FROM subscriptions s WHERE s.user_id = u.id) AS candidata
  FROM users u
  WHERE u.tenant_id = 1 AND u.role = 'member' AND DATE(u.created_at) = @dia
) x
WHERE x.candidata < @dia
GROUP BY YEAR(x.candidata) ORDER BY anio;
