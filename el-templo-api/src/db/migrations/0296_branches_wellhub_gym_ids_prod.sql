-- 0296_branches_wellhub_gym_ids_prod.sql
-- Wellhub (2026-10-22): gym IDs de PRODUCCION asignados por Wellhub a 6 sedes de Argentina.
--   Juan B Justo 856832 (code ALEM) . Constitucion 856831 (CONST) . Jujuy 856833 (JUJUY)
--   Alberti 856834 (ALBERTI) . Mario Bravo 856835 (MOGOTES) . Moreno 856836 (MORENO)
-- GUARD OBLIGATORIO DATABASE() = 'eltemplo': staging y prod comparten host MySQL y corren las
-- mismas migraciones. Sin el guard, staging (eltemplo_staging, mapeado al gym sandbox 546)
-- quedaria apuntando a gyms de produccion que no existen en el sandbox. En staging y en las
-- DBs de test cada UPDATE matchea 0 filas.
-- Mapear antes de cargar los secrets es inofensivo: sin WELLHUB_API_KEY + WELLHUB_WEBHOOK_SECRET
-- la integracion esta apagada y el cron no publica nada.
-- Apunta por code + tenant, nunca por id. Idempotente.
-- Escrita a mano (db:generate roto por deriva de goal_plan_type).
-- Sin punto y coma dentro de los comentarios (el runner splittea antes de strippear).

UPDATE branches SET wellhub_gym_id = 856832 WHERE tenant_id = 1 AND code = 'ALEM' AND DATABASE() = 'eltemplo';
UPDATE branches SET wellhub_gym_id = 856831 WHERE tenant_id = 1 AND code = 'CONST' AND DATABASE() = 'eltemplo';
UPDATE branches SET wellhub_gym_id = 856833 WHERE tenant_id = 1 AND code = 'JUJUY' AND DATABASE() = 'eltemplo';
UPDATE branches SET wellhub_gym_id = 856834 WHERE tenant_id = 1 AND code = 'ALBERTI' AND DATABASE() = 'eltemplo';
UPDATE branches SET wellhub_gym_id = 856835 WHERE tenant_id = 1 AND code = 'MOGOTES' AND DATABASE() = 'eltemplo';
UPDATE branches SET wellhub_gym_id = 856836 WHERE tenant_id = 1 AND code = 'MORENO' AND DATABASE() = 'eltemplo';
