-- 0296_branches_wellhub_gym_ids_prod.sql
-- Wellhub (2026-10-27): PILOTO solo en Moreno, la unica sucursal que Wellhub configuro en produccion.
-- Gym IDs de produccion ya asignados para las otras 5 sedes, a mapear en una migracion aparte
-- cuando Wellhub las active:
--   Juan B Justo 856832 (code ALEM) . Constitucion 856831 (CONST) . Jujuy 856833 (JUJUY)
--   Alberti 856834 (ALBERTI) . Mario Bravo 856835 (MOGOTES)
-- GUARD OBLIGATORIO DATABASE() = 'eltemplo': staging y prod comparten host MySQL y corren las
-- mismas migraciones. Sin el guard, staging (eltemplo_staging, mapeado al gym sandbox 546)
-- quedaria apuntando a un gym de produccion que no existe en el sandbox. En staging y en las
-- DBs de test el UPDATE matchea 0 filas.
-- Mapear antes de cargar los secrets es inofensivo: sin WELLHUB_API_KEY + WELLHUB_WEBHOOK_SECRET
-- la integracion esta apagada y el cron no publica nada.
-- Apunta por code + tenant, nunca por id. Idempotente.
-- Escrita a mano (db:generate roto por deriva de goal_plan_type).
-- Sin punto y coma dentro de los comentarios (el runner splittea antes de strippear).

UPDATE branches SET wellhub_gym_id = 856836 WHERE tenant_id = 1 AND code = 'MORENO' AND DATABASE() = 'eltemplo';
