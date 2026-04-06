-- Seed the 5 continuum programs (no price — pricing lives on subscription_plans)
-- Step 0: 30 Días — Crea el Hábito (regular sessions, 4 weeks)
-- Step 1: Foundation — Cuerpo Completo (regular sessions, indefinite)
-- Step 2A: Piernas y Glúteos (goal plan: gluteos, 12 weeks)
-- Step 2B: Cero a Atleta (regular sessions, 12 weeks)
-- Step 2C: Tu Front Lever (goal plan: front_lever, 12 weeks)

INSERT INTO `programs` (`name`, `description`, `goal_plan_type`, `duration_weeks`, `sessions_per_week_to_advance`, `aura_weekly_bonus`, `aura_completion_bonus`, `is_active`)
VALUES
  ('30 Dias — Crea el Habito', 'Tu primer paso en El Templo. 30 dias de entrenamiento en casa para instalar el habito.', NULL, 4, 3, 15, 100, 1),
  ('Foundation — Cuerpo Completo', 'El programa base de El Templo. Fuerza general, calistenia, movilidad y habito de entrenamiento.', NULL, NULL, 3, 15, 100, 1),
  ('Piernas y Gluteos', 'Resultado estetico visible en piernas y gluteos con metodo y progresion real. 12 semanas.', 'gluteos', 12, 3, 15, 100, 1),
  ('Cero a Atleta', 'De cero a moverte como atleta. Transformacion de identidad en 12 semanas.', NULL, 12, 3, 15, 100, 1),
  ('Tu Front Lever', 'Progresion estructurada para dominar el front lever en 12 semanas.', 'front_lever', 12, 3, 15, 100, 1);

-- Link all presencial plans to Foundation — Cuerpo Completo
-- Foundation is the program every presencial member gets through their membership
SET @foundation_id = (SELECT id FROM `programs` WHERE `name` = 'Foundation — Cuerpo Completo' LIMIT 1);

UPDATE `subscription_plans`
SET `linked_program_id` = @foundation_id
WHERE `plan_category` = 'presencial' AND `linked_program_id` IS NULL;

-- Create online subscription plans linked to their respective programs

-- 30 Días Online ($15,000/month)
SET @p30dias = (SELECT id FROM `programs` WHERE `name` = '30 Dias — Crea el Habito' LIMIT 1);
INSERT INTO `subscription_plans` (`name`, `description`, `plan_tier`, `booking_mode`, `plan_category`, `linked_program_id`, `price_regular`, `price_zero`, `duration_days`, `is_active`)
VALUES ('30 Dias Online', 'Plan online de 30 dias para crear el habito de entrenamiento.', 'other', 'flexible', 'online_regular', @p30dias, 15000, 15000, 30, 1);

-- Foundation Online ($25,000/month)
INSERT INTO `subscription_plans` (`name`, `description`, `plan_tier`, `booking_mode`, `plan_category`, `linked_program_id`, `price_regular`, `price_zero`, `duration_days`, `is_active`)
VALUES ('Foundation Online', 'Acceso online al programa Foundation — Cuerpo Completo.', 'other', 'flexible', 'online_regular', @foundation_id, 25000, 25000, 30, 1);

-- Piernas y Glúteos ($25,000/month)
SET @pgluteos = (SELECT id FROM `programs` WHERE `name` = 'Piernas y Gluteos' LIMIT 1);
INSERT INTO `subscription_plans` (`name`, `description`, `plan_tier`, `booking_mode`, `plan_category`, `linked_program_id`, `price_regular`, `price_zero`, `duration_days`, `is_active`)
VALUES ('Piernas y Gluteos', 'Plan online de 12 semanas enfocado en piernas y gluteos.', 'other', 'flexible', 'online_goal', @pgluteos, 25000, 25000, 84, 1);

-- Cero a Atleta ($25,000/month)
SET @pcero = (SELECT id FROM `programs` WHERE `name` = 'Cero a Atleta' LIMIT 1);
INSERT INTO `subscription_plans` (`name`, `description`, `plan_tier`, `booking_mode`, `plan_category`, `linked_program_id`, `price_regular`, `price_zero`, `duration_days`, `is_active`)
VALUES ('Cero a Atleta', 'De cero a moverte como atleta en 12 semanas.', 'other', 'flexible', 'online_regular', @pcero, 25000, 25000, 84, 1);

-- Tu Front Lever ($25,000/month)
SET @pfrontlever = (SELECT id FROM `programs` WHERE `name` = 'Tu Front Lever' LIMIT 1);
INSERT INTO `subscription_plans` (`name`, `description`, `plan_tier`, `booking_mode`, `plan_category`, `linked_program_id`, `price_regular`, `price_zero`, `duration_days`, `is_active`)
VALUES ('Tu Front Lever', 'Progresion estructurada para lograr tu front lever en 12 semanas.', 'other', 'flexible', 'online_goal', @pfrontlever, 25000, 25000, 84, 1);
