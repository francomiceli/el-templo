-- Yoga en Moreno con la profe Cami Petran (pedido 2026-09-29). Linea de pase
-- especial nueva 'Yoga' (columna special_line de la 0242): los pases de yoga
-- solo habilitan las clases de yoga y no se cruzan con los de Aura.
--
-- Tres piezas, todas idempotentes por NOT EXISTS:
--   1. Actividades especiales "Yoga para calisténicos" y "Yoga regenerativo"
--      (is_special = 1, special_line = 'Yoga', cupo hereda el de la sede).
--   2. Horarios en Moreno (day_of_week ISO):
--        Yoga para calisténicos martes (2) y jueves (4) 16:00 a 17:00
--        Yoga regenerativo      miercoles (3) y viernes (5) 11:00 a 12:00
--      coach_user_id queda NULL: la profe se asigna desde Horarios del admin
--      cuando su usuario exista (no hay id fijo que sembrar).
--   3. Seis pases especiales AR/ARS, 30 dias, multi_branch = 1, linea 'Yoga'.
--      General = requires_presencial 0. Alumnos = requires_presencial 1 (exige
--      plan presencial activo, 20 por ciento menos):
--        Clase suelta     1 clase    18000 / 14400
--        Pack 4 clases    4 clases   40000 / 32000
--        2 x semana       8 clases   65000 / 52000
--      classes_per_week NULL a proposito: si se carga, pisa el budget
--      (ceil(30/7) x 2 = 10 en vez de 8). No hay tope semanal para especiales.
--
-- Sede por code (MORENO), actividades por nombre dentro del tenant 1, nunca
-- ids fijos. tenant_id no se especifica en las tablas con DEFAULT 1.
-- Nombres de plan con prefijo "Yoga" para no chocar (collation ai_ci) con los
-- planes archivados "CLASE SUELTA" del import de marzo 2026 (ver 0229).

INSERT INTO activities (`name`, `description`, `is_active`, `max_capacity`, `is_special`, `special_line`)
SELECT 'Yoga para calisténicos', 'Yoga pensado para quienes entrenan calistenia: movilidad, flexibilidad y control. Con la profe Cami.', 1, NULL, 1, 'Yoga'
WHERE NOT EXISTS (
  SELECT 1 FROM activities a WHERE a.tenant_id = 1 AND a.name = 'Yoga para calisténicos'
);
--> statement-breakpoint
INSERT INTO activities (`name`, `description`, `is_active`, `max_capacity`, `is_special`, `special_line`)
SELECT 'Yoga regenerativo', 'Yoga suave para recuperar, respirar y soltar tensiones. Con la profe Cami.', 1, NULL, 1, 'Yoga'
WHERE NOT EXISTS (
  SELECT 1 FROM activities a WHERE a.tenant_id = 1 AND a.name = 'Yoga regenerativo'
);
--> statement-breakpoint
INSERT INTO schedules (`branch_id`, `activity_id`, `day_of_week`, `start_time`, `end_time`, `is_active`)
SELECT b.id, a.id, 2, '16:00', '17:00', 1
FROM branches b JOIN activities a ON a.tenant_id = 1 AND a.name = 'Yoga para calisténicos'
WHERE b.code = 'MORENO'
  AND NOT EXISTS (
    SELECT 1 FROM schedules s
    WHERE s.branch_id = b.id AND s.activity_id = a.id AND s.day_of_week = 2 AND s.start_time = '16:00'
  );
--> statement-breakpoint
INSERT INTO schedules (`branch_id`, `activity_id`, `day_of_week`, `start_time`, `end_time`, `is_active`)
SELECT b.id, a.id, 4, '16:00', '17:00', 1
FROM branches b JOIN activities a ON a.tenant_id = 1 AND a.name = 'Yoga para calisténicos'
WHERE b.code = 'MORENO'
  AND NOT EXISTS (
    SELECT 1 FROM schedules s
    WHERE s.branch_id = b.id AND s.activity_id = a.id AND s.day_of_week = 4 AND s.start_time = '16:00'
  );
--> statement-breakpoint
INSERT INTO schedules (`branch_id`, `activity_id`, `day_of_week`, `start_time`, `end_time`, `is_active`)
SELECT b.id, a.id, 3, '11:00', '12:00', 1
FROM branches b JOIN activities a ON a.tenant_id = 1 AND a.name = 'Yoga regenerativo'
WHERE b.code = 'MORENO'
  AND NOT EXISTS (
    SELECT 1 FROM schedules s
    WHERE s.branch_id = b.id AND s.activity_id = a.id AND s.day_of_week = 3 AND s.start_time = '11:00'
  );
--> statement-breakpoint
INSERT INTO schedules (`branch_id`, `activity_id`, `day_of_week`, `start_time`, `end_time`, `is_active`)
SELECT b.id, a.id, 5, '11:00', '12:00', 1
FROM branches b JOIN activities a ON a.tenant_id = 1 AND a.name = 'Yoga regenerativo'
WHERE b.code = 'MORENO'
  AND NOT EXISTS (
    SELECT 1 FROM schedules s
    WHERE s.branch_id = b.id AND s.activity_id = a.id AND s.day_of_week = 5 AND s.start_time = '11:00'
  );
--> statement-breakpoint
INSERT INTO subscription_plans
  (name, description, plan_tier, booking_mode, plan_category, price_regular, price_zero,
   duration_days, classes_per_week, monthly_class_budget, requires_presencial, special_line,
   multi_branch, is_active, country, currency)
SELECT v.name, v.description, 'other', 'flexible', 'especial', v.price, v.price,
       30, NULL, v.budget, v.requires_presencial, 'Yoga',
       1, 1, 'AR', 'ARS'
FROM (
  SELECT 'Yoga — Clase suelta · General' AS name, 'Pase Yoga: 1 clase, válido 30 días.' AS description, 18000 AS price, 1 AS budget, 0 AS requires_presencial
  UNION ALL SELECT 'Yoga — Clase suelta · Alumnos', 'Pase Yoga para alumnos de El Templo: 1 clase, válido 30 días.', 14400, 1, 1
  UNION ALL SELECT 'Yoga — Pack 4 clases · General', 'Pase Yoga: 4 clases, vencen a los 30 días.', 40000, 4, 0
  UNION ALL SELECT 'Yoga — Pack 4 clases · Alumnos', 'Pase Yoga para alumnos de El Templo: 4 clases, vencen a los 30 días.', 32000, 4, 1
  UNION ALL SELECT 'Yoga — 2 x semana · General', 'Pase Yoga: 2 clases por semana (8 en 30 días).', 65000, 8, 0
  UNION ALL SELECT 'Yoga — 2 x semana · Alumnos', 'Pase Yoga para alumnos de El Templo: 2 clases por semana (8 en 30 días).', 52000, 8, 1
) v
WHERE NOT EXISTS (
  SELECT 1 FROM subscription_plans p
  WHERE p.tenant_id = 1 AND p.name = v.name AND p.country = 'AR'
);
