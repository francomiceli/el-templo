-- Yoga: plan de la clase de prueba gratis (pedido 2026-09-29). Un alumno con
-- plan presencial activo que toca un horario de Yoga bloqueado puede tomar UNA
-- clase de prueba gratis: el servidor le asigna este pase de 0 pesos y le
-- reserva el turno (ver scheduling/especial-trial-service.ts).
--
-- Un solo plan, idempotente por NOT EXISTS (mismo criterio que la 0243):
--   plan_category = especial, special_line = Yoga, precio 0, 7 dias, 1 clase.
--   requires_presencial = 1 (solo para socios), multi_branch = 1.
--   is_trial = 1 lo oculta del catalogo de planes de la app y es la marca con
--   la que el servidor lo identifica como el plan de prueba de la linea. No
--   tiene nada que ver con las Sesiones de Prueba (bookings is_trial).
-- Aparece en Vender otro pase del admin a proposito.
-- classes_per_week NULL a proposito: si se carga, pisa el budget.
-- El vencimiento real lo recorta el servidor al del plan presencial del alumno.
-- AR y ARS, tenant 1 (DEFAULT de la columna).

INSERT INTO subscription_plans
  (name, description, plan_tier, booking_mode, plan_category, price_regular, price_zero,
   duration_days, classes_per_week, monthly_class_budget, requires_presencial, special_line,
   multi_branch, is_trial, is_active, country, currency)
SELECT 'Yoga — Clase de prueba', 'Primera clase de Yoga gratis para alumnos de El Templo. Válida por 7 días.',
       'other', 'flexible', 'especial', 0, 0,
       7, NULL, 1, 1, 'Yoga',
       1, 1, 1, 'AR', 'ARS'
WHERE NOT EXISTS (
  SELECT 1 FROM subscription_plans p
  WHERE p.tenant_id = 1 AND p.name = 'Yoga — Clase de prueba' AND p.country = 'AR'
);
