-- Phase 161 (PASE-01, ACT-01): Núcleo del pase "Actividades con Aura".
-- Hand-written (db:generate roto por drift de goal_plan_type -- ver skill el-templo-db-migrations).
-- Secciones:
--   Section 1 (D-12): MODIFY del enum plan_category -- agrega el valor 'especial'
--     al FINAL, byte-for-byte con planCategoryEnum en subscription-plans.ts.
--   Section 2 (D-03/D-04): monthly_class_budget (budget mensual explícito del pase,
--     NULL para planes no-especiales) + requires_presencial (discriminador Socio↔Externo).
--   Section 3 (D-14, GATE-01): is_special en activities (flag de gating, default 0 →
--     actividades existentes no gatean).
--   Section 4 (D-12, D-14): seed de los 2 planes AR/ARS del pase vía INSERT IGNORE.
--     El índice único ux_subscription_plans_name_country (creado en 0091) YA existe en
--     prod, así que INSERT IGNORE dedupe por (name, country) y es idempotente en re-runs.
-- Regla dura (skill Hard Rule 2): NUNCA un punto-y-coma dentro de un comentario porque
--   el runner splitea por ese caracter antes de stripear comentarios (incidente 0119).

-- ---------------------------------------------------------------------------
-- Section 1: enum plan_category -- append 'especial' last (byte-for-byte con el schema TS)
-- ---------------------------------------------------------------------------

ALTER TABLE subscription_plans
  MODIFY plan_category enum('presencial','online_regular','online_goal','online_coach','especial') NOT NULL;

-- ---------------------------------------------------------------------------
-- Section 2: columnas nuevas en subscription_plans
-- monthly_class_budget nullable sin default → planes no-especiales quedan NULL.
-- requires_presencial NOT NULL DEFAULT 0 → planes no-especiales quedan false.
-- ---------------------------------------------------------------------------

ALTER TABLE subscription_plans ADD COLUMN monthly_class_budget INT NULL;
ALTER TABLE subscription_plans ADD COLUMN requires_presencial BOOLEAN NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------------
-- Section 3: flag de gating en activities (default 0 → cero cambio de comportamiento)
-- ---------------------------------------------------------------------------

ALTER TABLE activities ADD COLUMN is_special BOOLEAN NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------------
-- Section 4: seed de los 2 planes AR del pase (D-12, D-14)
-- Socio $10.000 (requires_presencial=1), Externo $20.000 (requires_presencial=0).
-- Ambos: plan_category='especial', classes_per_week=NULL, monthly_class_budget=2,
-- duration_days=30 (período rolling, D-03), country='AR', currency='ARS'.
-- INSERT IGNORE dedupe por (name, country) vía ux_subscription_plans_name_country.
-- ---------------------------------------------------------------------------

INSERT IGNORE INTO subscription_plans
  (name, plan_tier, booking_mode, plan_category, linked_program_id,
   price_regular, price_zero, price_credit_card,
   duration_days, classes_per_week, monthly_class_budget, requires_presencial,
   multi_branch, is_trial, is_group, group_max_members,
   is_active, is_archived, country, currency, grants_all_programs,
   created_at, updated_at)
VALUES
  ('Actividades con Aura — Socio', 'other', 'flexible', 'especial', NULL,
   10000, 10000, NULL,
   30, NULL, 2, 1,
   1, 0, 0, NULL,
   1, 0, 'AR', 'ARS', 0,
   NOW(), NOW());

INSERT IGNORE INTO subscription_plans
  (name, plan_tier, booking_mode, plan_category, linked_program_id,
   price_regular, price_zero, price_credit_card,
   duration_days, classes_per_week, monthly_class_budget, requires_presencial,
   multi_branch, is_trial, is_group, group_max_members,
   is_active, is_archived, country, currency, grants_all_programs,
   created_at, updated_at)
VALUES
  ('Actividades con Aura — Externo', 'other', 'flexible', 'especial', NULL,
   20000, 20000, NULL,
   30, NULL, 2, 0,
   1, 0, 0, NULL,
   1, 0, 'AR', 'ARS', 0,
   NOW(), NOW());
