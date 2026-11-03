-- 0317_branches_wellhub_gym_id_alberti.sql
-- Wellhub (2026-11-03): segunda sucursal habilitada en produccion, Alberti (gym 856834).
-- Misma receta que 0296 (Moreno). Se publica solo General (activities.wellhub_enabled, 0295).
-- GUARD OBLIGATORIO DATABASE() = 'eltemplo': staging y prod comparten host MySQL y corren las
-- mismas migraciones. Sin el guard, staging (mapeado al gym sandbox 546) quedaria apuntando a
-- un gym de produccion que no existe en el sandbox. En staging y en las DBs de test el UPDATE
-- matchea 0 filas.
-- Apunta por code + tenant, nunca por id. Idempotente.
-- Escrita a mano (db:generate roto por deriva de goal_plan_type).
-- Sin punto y coma dentro de los comentarios (el runner splittea antes de strippear).

UPDATE branches SET wellhub_gym_id = 856834 WHERE tenant_id = 1 AND code = 'ALBERTI' AND DATABASE() = 'eltemplo';
