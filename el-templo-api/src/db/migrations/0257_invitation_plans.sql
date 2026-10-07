-- 0257_invitation_plans.sql
-- Fase 194 (D-02/D-14): planes "Invitación", uno por país. Son los 3 accesos
-- gratis del invitado: suscripción de 0 pesos que el servidor asigna con
-- priceOverrideAmount 0 (membership_kind bonificada).
--
--   plan_category = paquete, is_trial = 1 (la marca con la que el servidor lo
--   identifica: is_trial AND paquete), multi_branch = 1 (cualquier sede del
--   país, D-14), precio 0, allows_invitation_discount = 0 (nunca da descuento).
--   duration_days = 6 y classes_per_week = 3: classesRemaining = ceil(6/7)*3 = 3
--   sale del plan. La vigencia real (10 días hábiles) la fija el servidor con
--   endDateOverride al activar. 6 días (no 7) evita el recordatorio de
--   vencimiento (mínimo 7), el módulo Renovaciones (mínimo 7) y el choque con la
--   semana de regalo de partners (que busca paquete de 7 días y 3 por semana).
--   "Accesos (3)" configurable = classes_per_week de este plan, editable desde
--   el admin de planes.
--   is_trial = 1 lo oculta del catálogo de la app. Nada que ver con las
--   Sesiones de Prueba (bookings is_trial).
--
-- Dos INSERT idempotentes por NOT EXISTS (tenant 1 + nombre + país), mismo
-- criterio que la 0244. AR con ARS y ES con EUR, tenant 1 explícito.
-- Hand-written, NUNCA drizzle-kit push o migrate.

INSERT INTO subscription_plans
  (tenant_id, name, description, plan_tier, booking_mode, plan_category, price_regular, price_zero,
   duration_days, classes_per_week, monthly_class_budget, requires_presencial, special_line,
   multi_branch, is_trial, is_active, allows_invitation_discount, country, currency)
SELECT 1, 'Invitación', '3 accesos gratis para invitados (10 días hábiles)',
       'other', 'flexible', 'paquete', 0, 0,
       6, 3, NULL, 0, NULL,
       1, 1, 1, 0, 'AR', 'ARS'
WHERE NOT EXISTS (
  SELECT 1 FROM subscription_plans p
  WHERE p.tenant_id = 1 AND p.name = 'Invitación' AND p.country = 'AR'
);

INSERT INTO subscription_plans
  (tenant_id, name, description, plan_tier, booking_mode, plan_category, price_regular, price_zero,
   duration_days, classes_per_week, monthly_class_budget, requires_presencial, special_line,
   multi_branch, is_trial, is_active, allows_invitation_discount, country, currency)
SELECT 1, 'Invitación', '3 accesos gratis para invitados (10 días hábiles)',
       'other', 'flexible', 'paquete', 0, 0,
       6, 3, NULL, 0, NULL,
       1, 1, 1, 0, 'ES', 'EUR'
WHERE NOT EXISTS (
  SELECT 1 FROM subscription_plans p
  WHERE p.tenant_id = 1 AND p.name = 'Invitación' AND p.country = 'ES'
);
