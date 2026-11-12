-- 0333_branches_wellhub_gym_id_otras_4_sedes.sql
-- Wellhub (2026-11-12): Wellhub confirmo las 4 unidades restantes configuradas en produccion
-- (verificado contra la API de partners: las 4 tienen producto Clases y la API key de prod accede).
-- Juan B Justo (ALEM) 856832, Constitucion (CONST) 856831, Jujuy (JUJUY) 856833, Mario Bravo (MOGOTES) 856835.
-- Misma receta que 0296 (Moreno) y 0317 (Alberti). Se publica solo General (activities.wellhub_enabled, 0295).
-- GUARD OBLIGATORIO DATABASE() = 'eltemplo': staging y prod comparten host MySQL y corren las
-- mismas migraciones. Sin el guard, staging (mapeado al gym sandbox 546) quedaria apuntando a
-- gyms de produccion que no existen en el sandbox. En staging y en las DBs de test el UPDATE
-- matchea 0 filas.
-- Apunta por code + tenant, nunca por id. Idempotente.
-- Escrita a mano (db:generate roto por deriva de goal_plan_type).
-- Sin punto y coma dentro de los comentarios (el runner splittea antes de strippear).

UPDATE branches SET wellhub_gym_id = 856832 WHERE tenant_id = 1 AND code = 'ALEM' AND DATABASE() = 'eltemplo';
UPDATE branches SET wellhub_gym_id = 856831 WHERE tenant_id = 1 AND code = 'CONST' AND DATABASE() = 'eltemplo';
UPDATE branches SET wellhub_gym_id = 856833 WHERE tenant_id = 1 AND code = 'JUJUY' AND DATABASE() = 'eltemplo';
UPDATE branches SET wellhub_gym_id = 856835 WHERE tenant_id = 1 AND code = 'MOGOTES' AND DATABASE() = 'eltemplo';
