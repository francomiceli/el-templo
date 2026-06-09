-- Saca PROGRAMA 3 MESES y PROGRAMA 6 MESES de legacy (jun 2026) para que
-- puedan asignarse y renovarse como planes vigentes. Eran is_active=0 +
-- is_archived=1 desde la importacion inicial, con precio 0. El precio pasa
-- a ser el que se cobra hoy en la practica (P3M 195000 / P6M 360000 ARS,
-- confirmado contra las renovaciones registradas en produccion).
-- Matchea por nombre exacto para ser no-op seguro en entornos sin estos
-- planes (CI / local / staging).
UPDATE subscription_plans
SET is_active = 1, is_archived = 0, price_regular = 195000
WHERE name = 'PROGRAMA 3 MESES' AND plan_category = 'presencial' AND country = 'AR';

UPDATE subscription_plans
SET is_active = 1, is_archived = 0, price_regular = 360000
WHERE name = 'PROGRAMA 6 MESES' AND plan_category = 'presencial' AND country = 'AR';
