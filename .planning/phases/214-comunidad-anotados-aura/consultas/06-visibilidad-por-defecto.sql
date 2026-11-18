-- Fase 214, D-11 y D-47: visibilidad por defecto en la lista de anotados
-- SOLO LECTURA. No correr sin OK de Franco. Agregados, sin datos personales
--   D-47: un alumno sin fecha de nacimiento cuenta como adulto
--   con_foto_del_staff: cuantos aparecerian con foto de ficha (D-43)
--   menores = fecha de nacimiento posterior a hoy menos 18 anios
--   exterior = sede con country distinto de AR

SET SESSION TRANSACTION READ ONLY;
SET SESSION max_execution_time = 30000;

-- A. Total de activos
SELECT COUNT(*) AS activos,
  SUM(u.date_of_birth IS NULL) AS sin_nacimiento,
  SUM(u.date_of_birth > DATE_SUB(CURDATE(), INTERVAL 18 YEAR)) AS menores,
  SUM(b.country <> 'AR') AS exterior,
  SUM(u.photo_url IS NOT NULL) AS con_foto_del_staff
FROM users u JOIN branches b ON b.id = u.branch_id
WHERE u.tenant_id = 1 AND u.role = 'member' AND u.status = 'activo' AND u.deleted_at IS NULL;

-- B. Lo mismo por pais de la sede
SELECT b.country AS pais,
  COUNT(*) AS activos,
  SUM(u.date_of_birth IS NULL) AS sin_nacimiento,
  SUM(u.date_of_birth > DATE_SUB(CURDATE(), INTERVAL 18 YEAR)) AS menores,
  SUM(b.country <> 'AR') AS exterior,
  SUM(u.photo_url IS NOT NULL) AS con_foto_del_staff
FROM users u JOIN branches b ON b.id = u.branch_id
WHERE u.tenant_id = 1 AND u.role = 'member' AND u.status = 'activo' AND u.deleted_at IS NULL
GROUP BY b.country
ORDER BY activos DESC;
