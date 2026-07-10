-- @data-only
-- Renombra el codigo de la ruta full body de FULLBODY a FB (sigla corta)
-- El nombre visible sigue siendo 'Full Body' (display_name + route-labels)
-- Actualiza tambien los bloques ya creados con el codigo viejo
-- Idempotente: el rename solo corre si FB no existe todavia

UPDATE routes SET code = 'FB'
WHERE code = 'FULLBODY'
  AND NOT EXISTS (SELECT 1 FROM (SELECT 1 FROM routes r2 WHERE r2.code = 'FB') t);

UPDATE session_blocks SET route = 'FB' WHERE route = 'FULLBODY';
