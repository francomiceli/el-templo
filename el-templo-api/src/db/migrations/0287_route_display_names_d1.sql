-- 0287_route_display_names_d1.sql
-- Fase 200 (Anatomia funcional), decision D1: nombres oficiales de cinco rutas.
-- HR pasa a Espinales y planchas laterales, MN/RP a Manna, SIDE PCK a Side
-- Pancake, HD/ID a Fondos y FLR a Front Lever Row. Espeja ROUTE_LABELS de las
-- tres copias de route-labels.ts (API, app y admin).
-- HT, NC y QC NO se tocan (R4) y siguen con display_name NULL.
-- Escrita a mano (db:generate roto por deriva de goal_plan_type).
-- Idempotente: cada UPDATE fija un valor absoluto, correrla dos veces da lo mismo.
-- Apunta por codigo de ruta + tenant, nunca por id (los ids difieren entre local y prod).
-- Sin punto y coma dentro de los comentarios (el runner splittea antes de strippear).

UPDATE routes SET display_name = 'Espinales y planchas laterales' WHERE code = 'HR' AND tenant_id = 1;

UPDATE routes SET display_name = 'Fondos' WHERE code = 'HD/ID' AND tenant_id = 1;

UPDATE routes SET display_name = 'Side Pancake' WHERE code = 'SIDE PCK' AND tenant_id = 1;

UPDATE routes SET display_name = 'Manna' WHERE code = 'MN/RP' AND tenant_id = 1;

UPDATE routes SET display_name = 'Front Lever Row' WHERE code = 'FLR' AND tenant_id = 1;
