-- Clases "Flexi" en Barcelona (profe Daniela Pucciarelli, pedido de Nacho
-- 2026-09-18). Se reutiliza el sistema de actividades especiales de la fase
-- 161 (el de "Actividades con Aura"): una actividad is_special queda aislada
-- de los planes regulares (un socio Flex no la reserva sin pase, quien solo
-- tiene el pase no reserva regulares), no cuenta para el limite semanal y el
-- check-in descuenta del pase correcto.
--
-- Tres piezas, todas idempotentes por NOT EXISTS o INSERT IGNORE:
--   1. Actividad "Flexi" (is_special = 1, cupo hereda el de la sede).
--   2. Horarios en Barcelona: martes y jueves 16:00 a 17:00, sabado 08:00 a
--      09:00 (day_of_week ISO: 2 martes, 4 jueves, 6 sabado).
--   3. Dos pases en euros, categoria especial, 30 dias de vigencia, modelo
--      del plan "Actividades con Aura -- Externo 4 accesos" (id 142 en prod):
--        "Flexi -- 4 clases"     40 EUR, 4 clases al mes
--        "Flexi -- Clase suelta" 15 EUR, 1 clase
--      requires_presencial = 0 (externos, no necesitan plan presencial),
--      multi_branch = 1 igual que el modelo. La unique
--      ux_subscription_plans_tenant_name_country hace el INSERT IGNORE
--      idempotente.
--
-- Sede resuelta por code (BCN), actividad por nombre dentro del tenant 1,
-- nunca ids fijos. tenant_id no se especifica (DEFAULT 1, patron 0207/0229).
-- Sin punto-y-coma dentro de comentarios (regla dura del skill).

INSERT INTO activities (`name`, `description`, `is_active`, `max_capacity`, `is_special`)
SELECT 'Flexi', 'Clases Flexi en Barcelona. Acceso con pase Flexi.', 1, NULL, 1
WHERE NOT EXISTS (
  SELECT 1 FROM activities a WHERE a.tenant_id = 1 AND a.name = 'Flexi'
);
--> statement-breakpoint
INSERT INTO schedules (`branch_id`, `activity_id`, `day_of_week`, `start_time`, `end_time`, `is_active`)
SELECT b.id, a.id, 2, '16:00', '17:00', 1
FROM branches b JOIN activities a ON a.tenant_id = 1 AND a.name = 'Flexi'
WHERE b.code = 'BCN'
  AND NOT EXISTS (
    SELECT 1 FROM schedules s
    WHERE s.branch_id = b.id AND s.activity_id = a.id AND s.day_of_week = 2 AND s.start_time = '16:00'
  );
--> statement-breakpoint
INSERT INTO schedules (`branch_id`, `activity_id`, `day_of_week`, `start_time`, `end_time`, `is_active`)
SELECT b.id, a.id, 4, '16:00', '17:00', 1
FROM branches b JOIN activities a ON a.tenant_id = 1 AND a.name = 'Flexi'
WHERE b.code = 'BCN'
  AND NOT EXISTS (
    SELECT 1 FROM schedules s
    WHERE s.branch_id = b.id AND s.activity_id = a.id AND s.day_of_week = 4 AND s.start_time = '16:00'
  );
--> statement-breakpoint
INSERT INTO schedules (`branch_id`, `activity_id`, `day_of_week`, `start_time`, `end_time`, `is_active`)
SELECT b.id, a.id, 6, '08:00', '09:00', 1
FROM branches b JOIN activities a ON a.tenant_id = 1 AND a.name = 'Flexi'
WHERE b.code = 'BCN'
  AND NOT EXISTS (
    SELECT 1 FROM schedules s
    WHERE s.branch_id = b.id AND s.activity_id = a.id AND s.day_of_week = 6 AND s.start_time = '08:00'
  );
--> statement-breakpoint
INSERT IGNORE INTO subscription_plans
  (name, description, plan_tier, booking_mode, plan_category, linked_program_id,
   price_regular, price_zero, price_credit_card,
   duration_days, classes_per_week, monthly_class_budget, requires_presencial,
   multi_branch, is_trial, is_group, group_max_members,
   is_active, is_archived, country, currency, grants_all_programs,
   created_at, updated_at)
VALUES
  ('Flexi — 4 clases', 'Pase Flexi Barcelona: 4 clases en 30 días.',
   'other', 'flexible', 'especial', NULL,
   40, 40, NULL,
   30, NULL, 4, 0,
   1, 0, 0, NULL,
   1, 0, 'ES', 'EUR', 0,
   NOW(), NOW()),
  ('Flexi — Clase suelta', 'Pase Flexi Barcelona: 1 clase, válido 30 días.',
   'other', 'flexible', 'especial', NULL,
   15, 15, NULL,
   30, NULL, 1, 0,
   1, 0, 0, NULL,
   1, 0, 'ES', 'EUR', 0,
   NOW(), NOW());
