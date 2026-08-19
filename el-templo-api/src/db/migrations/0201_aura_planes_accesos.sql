-- 0201_aura_planes_accesos.sql
-- Feature: Actividades con Aura — nuevos tiers de acceso (2026-08-11)
-- Agrega 4 planes plan_category='especial' que conviven con los 2 existentes
-- (Socio $10.000 / Externo $20.000, ambos budget=2, ids 134/135).
--
-- Nuevos tiers:
--   Socio   4 accesos   -> $15.000  (requires_presencial=1, monthly_class_budget=4)
--   Socio   Ilimitado   -> $20.000  (requires_presencial=1, monthly_class_budget=NULL)
--   Externo 4 accesos   -> $25.000  (requires_presencial=0, monthly_class_budget=4)
--   Externo Ilimitado   -> $30.000  (requires_presencial=0, monthly_class_budget=NULL)
--
-- monthly_class_budget=NULL significa acceso ilimitado (classesRemaining queda NULL,
-- el enforcement en booking-service/attendance lo trata como sin tope).
-- Hand-written (db:generate roto por drift). Datos de prod van por migracion, no seed.
-- Idempotente por name (INSERT ... SELECT ... WHERE NOT EXISTS). tenant_id=1 (templo default),
-- igual que los planes 134/135. Numerado 0201 = siguiente al tope del tren v6.0 en staging (0200).

INSERT INTO subscription_plans
  (name, plan_tier, booking_mode, price_regular, price_zero, duration_days,
   multi_branch, is_active, plan_category, country, currency,
   monthly_class_budget, requires_presencial, tenant_id)
SELECT 'Actividades con Aura — Socio 4 accesos', 'other', 'flexible', 15000, 15000, 30,
       1, 1, 'especial', 'AR', 'ARS',
       4, 1, 1
WHERE NOT EXISTS (
  SELECT 1 FROM subscription_plans WHERE name = 'Actividades con Aura — Socio 4 accesos'
);

INSERT INTO subscription_plans
  (name, plan_tier, booking_mode, price_regular, price_zero, duration_days,
   multi_branch, is_active, plan_category, country, currency,
   monthly_class_budget, requires_presencial, tenant_id)
SELECT 'Actividades con Aura — Socio Ilimitado', 'other', 'flexible', 20000, 20000, 30,
       1, 1, 'especial', 'AR', 'ARS',
       NULL, 1, 1
WHERE NOT EXISTS (
  SELECT 1 FROM subscription_plans WHERE name = 'Actividades con Aura — Socio Ilimitado'
);

INSERT INTO subscription_plans
  (name, plan_tier, booking_mode, price_regular, price_zero, duration_days,
   multi_branch, is_active, plan_category, country, currency,
   monthly_class_budget, requires_presencial, tenant_id)
SELECT 'Actividades con Aura — Externo 4 accesos', 'other', 'flexible', 25000, 25000, 30,
       1, 1, 'especial', 'AR', 'ARS',
       4, 0, 1
WHERE NOT EXISTS (
  SELECT 1 FROM subscription_plans WHERE name = 'Actividades con Aura — Externo 4 accesos'
);

INSERT INTO subscription_plans
  (name, plan_tier, booking_mode, price_regular, price_zero, duration_days,
   multi_branch, is_active, plan_category, country, currency,
   monthly_class_budget, requires_presencial, tenant_id)
SELECT 'Actividades con Aura — Externo Ilimitado', 'other', 'flexible', 30000, 30000, 30,
       1, 1, 'especial', 'AR', 'ARS',
       NULL, 0, 1
WHERE NOT EXISTS (
  SELECT 1 FROM subscription_plans WHERE name = 'Actividades con Aura — Externo Ilimitado'
);
