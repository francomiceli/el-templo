-- Fase 177 (D-01, D-02, D-03, D-04, D-05, D-07, D-08, D-09, D-12, D-14): matriz
-- de "Paquete de clases" corto plazo (Opcion B -- planes reales por migracion).
-- Hand-written (db:generate roto por drift de goal_plan_type -- ver skill
-- el-templo-db-migrations).
-- Secciones:
--   Section 1 (D-01): MODIFY del enum plan_category -- agrega el valor 'paquete'
--     al FINAL, byte-for-byte con planCategoryEnum en subscription-plans.ts.
--   Section 2 (D-03, D-04, D-05, D-07, D-08, D-09, D-12, D-14): 36 INSERT IGNORE
--     de la matriz semanas(1-3) x frecuencia(1-6) x pais(AR/ARS, ES/EUR) --
--     18 filas por pais. Precio ya calculado por la formula (D-05), copiado
--     EXACTO de las grillas D-07 (ARS) y D-08 (EUR) del plan -- NO se recalcula
--     acá. plan_tier='other', booking_mode='flexible', plan_category='paquete',
--     duration_days=semanas*7, classes_per_week=frecuencia, monthly_class_budget
--     NULL (el budget deriva de classes_per_week, no es un pase con budget
--     explicito como 'especial'), price_zero=price_regular y
--     price_credit_card=NULL (D-14, no hay Precio Zero ni recargo de tarjeta
--     para paquetes por ahora), requires_presencial=0, tenant_id NO se
--     especifica (cae al DEFAULT 1, patron 0179). Nombre "Paquete · N sem ·
--     M/sem" con el separador · (D-12). El indice unico
--     ux_subscription_plans_tenant_name_country (0196) hace INSERT IGNORE
--     idempotente en re-runs, dedupe por (tenant_id, name, country).
-- Regla dura (skill Hard Rule 2): NUNCA un punto-y-coma dentro de un comentario
--   porque el runner splitea por ese caracter antes de stripear comentarios
--   (incidente 0119).
-- Numeracion: renumerada a 0207 al 2026-08-21 al portar la fase 177 a master
--   como hotfix. Las 0205 (tv_deuteros_auto_rotate) y 0206 (tv_show_alternative)
--   ya estaban tomadas en origin/master, asi que este paquete toma el siguiente
--   libre real: 0207. Ver 177-01-SUMMARY.md para el detalle original.

-- ---------------------------------------------------------------------------
-- Section 1: enum plan_category -- append 'paquete' last (byte-for-byte con el schema TS)
-- ---------------------------------------------------------------------------

ALTER TABLE subscription_plans
  MODIFY plan_category enum('presencial','online_regular','online_goal','online_coach','especial','paquete') NOT NULL;

-- ---------------------------------------------------------------------------
-- Section 2: 36 filas de la matriz (18 AR/ARS + 18 ES/EUR)
-- ---------------------------------------------------------------------------

INSERT IGNORE INTO subscription_plans
  (name, plan_tier, booking_mode, plan_category, linked_program_id,
   price_regular, price_zero, price_credit_card,
   duration_days, classes_per_week, monthly_class_budget, requires_presencial,
   multi_branch, is_trial, is_group, group_max_members,
   is_active, is_archived, country, currency, grants_all_programs,
   created_at, updated_at)
VALUES
  ('Paquete · 1 sem · 1/sem', 'other', 'flexible', 'paquete', NULL,
   12000, 12000, NULL,
   7, 1, NULL, 0,
   0, 0, 0, NULL,
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
  ('Paquete · 1 sem · 2/sem', 'other', 'flexible', 'paquete', NULL,
   21500, 21500, NULL,
   7, 2, NULL, 0,
   0, 0, 0, NULL,
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
  ('Paquete · 1 sem · 3/sem', 'other', 'flexible', 'paquete', NULL,
   27500, 27500, NULL,
   7, 3, NULL, 0,
   0, 0, 0, NULL,
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
  ('Paquete · 1 sem · 4/sem', 'other', 'flexible', 'paquete', NULL,
   31500, 31500, NULL,
   7, 4, NULL, 0,
   0, 0, 0, NULL,
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
  ('Paquete · 1 sem · 5/sem', 'other', 'flexible', 'paquete', NULL,
   35000, 35000, NULL,
   7, 5, NULL, 0,
   0, 0, 0, NULL,
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
  ('Paquete · 1 sem · 6/sem', 'other', 'flexible', 'paquete', NULL,
   40500, 40500, NULL,
   7, 6, NULL, 0,
   0, 0, 0, NULL,
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
  ('Paquete · 2 sem · 1/sem', 'other', 'flexible', 'paquete', NULL,
   21500, 21500, NULL,
   14, 1, NULL, 0,
   0, 0, 0, NULL,
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
  ('Paquete · 2 sem · 2/sem', 'other', 'flexible', 'paquete', NULL,
   38500, 38500, NULL,
   14, 2, NULL, 0,
   0, 0, 0, NULL,
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
  ('Paquete · 2 sem · 3/sem', 'other', 'flexible', 'paquete', NULL,
   49000, 49000, NULL,
   14, 3, NULL, 0,
   0, 0, 0, NULL,
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
  ('Paquete · 2 sem · 4/sem', 'other', 'flexible', 'paquete', NULL,
   55500, 55500, NULL,
   14, 4, NULL, 0,
   0, 0, 0, NULL,
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
  ('Paquete · 2 sem · 5/sem', 'other', 'flexible', 'paquete', NULL,
   62500, 62500, NULL,
   14, 5, NULL, 0,
   0, 0, 0, NULL,
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
  ('Paquete · 2 sem · 6/sem', 'other', 'flexible', 'paquete', NULL,
   72000, 72000, NULL,
   14, 6, NULL, 0,
   0, 0, 0, NULL,
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
  ('Paquete · 3 sem · 1/sem', 'other', 'flexible', 'paquete', NULL,
   30000, 30000, NULL,
   21, 1, NULL, 0,
   0, 0, 0, NULL,
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
  ('Paquete · 3 sem · 2/sem', 'other', 'flexible', 'paquete', NULL,
   54000, 54000, NULL,
   21, 2, NULL, 0,
   0, 0, 0, NULL,
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
  ('Paquete · 3 sem · 3/sem', 'other', 'flexible', 'paquete', NULL,
   68500, 68500, NULL,
   21, 3, NULL, 0,
   0, 0, 0, NULL,
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
  ('Paquete · 3 sem · 4/sem', 'other', 'flexible', 'paquete', NULL,
   78000, 78000, NULL,
   21, 4, NULL, 0,
   0, 0, 0, NULL,
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
  ('Paquete · 3 sem · 5/sem', 'other', 'flexible', 'paquete', NULL,
   87500, 87500, NULL,
   21, 5, NULL, 0,
   0, 0, 0, NULL,
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
  ('Paquete · 3 sem · 6/sem', 'other', 'flexible', 'paquete', NULL,
   101000, 101000, NULL,
   21, 6, NULL, 0,
   0, 0, 0, NULL,
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
  ('Paquete · 1 sem · 1/sem', 'other', 'flexible', 'paquete', NULL,
   14, 14, NULL,
   7, 1, NULL, 0,
   0, 0, 0, NULL,
   1, 0, 'ES', 'EUR', 0,
   NOW(), NOW());

INSERT IGNORE INTO subscription_plans
  (name, plan_tier, booking_mode, plan_category, linked_program_id,
   price_regular, price_zero, price_credit_card,
   duration_days, classes_per_week, monthly_class_budget, requires_presencial,
   multi_branch, is_trial, is_group, group_max_members,
   is_active, is_archived, country, currency, grants_all_programs,
   created_at, updated_at)
VALUES
  ('Paquete · 1 sem · 2/sem', 'other', 'flexible', 'paquete', NULL,
   24, 24, NULL,
   7, 2, NULL, 0,
   0, 0, 0, NULL,
   1, 0, 'ES', 'EUR', 0,
   NOW(), NOW());

INSERT IGNORE INTO subscription_plans
  (name, plan_tier, booking_mode, plan_category, linked_program_id,
   price_regular, price_zero, price_credit_card,
   duration_days, classes_per_week, monthly_class_budget, requires_presencial,
   multi_branch, is_trial, is_group, group_max_members,
   is_active, is_archived, country, currency, grants_all_programs,
   created_at, updated_at)
VALUES
  ('Paquete · 1 sem · 3/sem', 'other', 'flexible', 'paquete', NULL,
   32, 32, NULL,
   7, 3, NULL, 0,
   0, 0, 0, NULL,
   1, 0, 'ES', 'EUR', 0,
   NOW(), NOW());

INSERT IGNORE INTO subscription_plans
  (name, plan_tier, booking_mode, plan_category, linked_program_id,
   price_regular, price_zero, price_credit_card,
   duration_days, classes_per_week, monthly_class_budget, requires_presencial,
   multi_branch, is_trial, is_group, group_max_members,
   is_active, is_archived, country, currency, grants_all_programs,
   created_at, updated_at)
VALUES
  ('Paquete · 1 sem · 4/sem', 'other', 'flexible', 'paquete', NULL,
   37, 37, NULL,
   7, 4, NULL, 0,
   0, 0, 0, NULL,
   1, 0, 'ES', 'EUR', 0,
   NOW(), NOW());

INSERT IGNORE INTO subscription_plans
  (name, plan_tier, booking_mode, plan_category, linked_program_id,
   price_regular, price_zero, price_credit_card,
   duration_days, classes_per_week, monthly_class_budget, requires_presencial,
   multi_branch, is_trial, is_group, group_max_members,
   is_active, is_archived, country, currency, grants_all_programs,
   created_at, updated_at)
VALUES
  ('Paquete · 1 sem · 5/sem', 'other', 'flexible', 'paquete', NULL,
   42, 42, NULL,
   7, 5, NULL, 0,
   0, 0, 0, NULL,
   1, 0, 'ES', 'EUR', 0,
   NOW(), NOW());

INSERT IGNORE INTO subscription_plans
  (name, plan_tier, booking_mode, plan_category, linked_program_id,
   price_regular, price_zero, price_credit_card,
   duration_days, classes_per_week, monthly_class_budget, requires_presencial,
   multi_branch, is_trial, is_group, group_max_members,
   is_active, is_archived, country, currency, grants_all_programs,
   created_at, updated_at)
VALUES
  ('Paquete · 1 sem · 6/sem', 'other', 'flexible', 'paquete', NULL,
   49, 49, NULL,
   7, 6, NULL, 0,
   0, 0, 0, NULL,
   1, 0, 'ES', 'EUR', 0,
   NOW(), NOW());

INSERT IGNORE INTO subscription_plans
  (name, plan_tier, booking_mode, plan_category, linked_program_id,
   price_regular, price_zero, price_credit_card,
   duration_days, classes_per_week, monthly_class_budget, requires_presencial,
   multi_branch, is_trial, is_group, group_max_members,
   is_active, is_archived, country, currency, grants_all_programs,
   created_at, updated_at)
VALUES
  ('Paquete · 2 sem · 1/sem', 'other', 'flexible', 'paquete', NULL,
   24, 24, NULL,
   14, 1, NULL, 0,
   0, 0, 0, NULL,
   1, 0, 'ES', 'EUR', 0,
   NOW(), NOW());

INSERT IGNORE INTO subscription_plans
  (name, plan_tier, booking_mode, plan_category, linked_program_id,
   price_regular, price_zero, price_credit_card,
   duration_days, classes_per_week, monthly_class_budget, requires_presencial,
   multi_branch, is_trial, is_group, group_max_members,
   is_active, is_archived, country, currency, grants_all_programs,
   created_at, updated_at)
VALUES
  ('Paquete · 2 sem · 2/sem', 'other', 'flexible', 'paquete', NULL,
   43, 43, NULL,
   14, 2, NULL, 0,
   0, 0, 0, NULL,
   1, 0, 'ES', 'EUR', 0,
   NOW(), NOW());

INSERT IGNORE INTO subscription_plans
  (name, plan_tier, booking_mode, plan_category, linked_program_id,
   price_regular, price_zero, price_credit_card,
   duration_days, classes_per_week, monthly_class_budget, requires_presencial,
   multi_branch, is_trial, is_group, group_max_members,
   is_active, is_archived, country, currency, grants_all_programs,
   created_at, updated_at)
VALUES
  ('Paquete · 2 sem · 3/sem', 'other', 'flexible', 'paquete', NULL,
   56, 56, NULL,
   14, 3, NULL, 0,
   0, 0, 0, NULL,
   1, 0, 'ES', 'EUR', 0,
   NOW(), NOW());

INSERT IGNORE INTO subscription_plans
  (name, plan_tier, booking_mode, plan_category, linked_program_id,
   price_regular, price_zero, price_credit_card,
   duration_days, classes_per_week, monthly_class_budget, requires_presencial,
   multi_branch, is_trial, is_group, group_max_members,
   is_active, is_archived, country, currency, grants_all_programs,
   created_at, updated_at)
VALUES
  ('Paquete · 2 sem · 4/sem', 'other', 'flexible', 'paquete', NULL,
   65, 65, NULL,
   14, 4, NULL, 0,
   0, 0, 0, NULL,
   1, 0, 'ES', 'EUR', 0,
   NOW(), NOW());

INSERT IGNORE INTO subscription_plans
  (name, plan_tier, booking_mode, plan_category, linked_program_id,
   price_regular, price_zero, price_credit_card,
   duration_days, classes_per_week, monthly_class_budget, requires_presencial,
   multi_branch, is_trial, is_group, group_max_members,
   is_active, is_archived, country, currency, grants_all_programs,
   created_at, updated_at)
VALUES
  ('Paquete · 2 sem · 5/sem', 'other', 'flexible', 'paquete', NULL,
   74, 74, NULL,
   14, 5, NULL, 0,
   0, 0, 0, NULL,
   1, 0, 'ES', 'EUR', 0,
   NOW(), NOW());

INSERT IGNORE INTO subscription_plans
  (name, plan_tier, booking_mode, plan_category, linked_program_id,
   price_regular, price_zero, price_credit_card,
   duration_days, classes_per_week, monthly_class_budget, requires_presencial,
   multi_branch, is_trial, is_group, group_max_members,
   is_active, is_archived, country, currency, grants_all_programs,
   created_at, updated_at)
VALUES
  ('Paquete · 2 sem · 6/sem', 'other', 'flexible', 'paquete', NULL,
   86, 86, NULL,
   14, 6, NULL, 0,
   0, 0, 0, NULL,
   1, 0, 'ES', 'EUR', 0,
   NOW(), NOW());

INSERT IGNORE INTO subscription_plans
  (name, plan_tier, booking_mode, plan_category, linked_program_id,
   price_regular, price_zero, price_credit_card,
   duration_days, classes_per_week, monthly_class_budget, requires_presencial,
   multi_branch, is_trial, is_group, group_max_members,
   is_active, is_archived, country, currency, grants_all_programs,
   created_at, updated_at)
VALUES
  ('Paquete · 3 sem · 1/sem', 'other', 'flexible', 'paquete', NULL,
   34, 34, NULL,
   21, 1, NULL, 0,
   0, 0, 0, NULL,
   1, 0, 'ES', 'EUR', 0,
   NOW(), NOW());

INSERT IGNORE INTO subscription_plans
  (name, plan_tier, booking_mode, plan_category, linked_program_id,
   price_regular, price_zero, price_credit_card,
   duration_days, classes_per_week, monthly_class_budget, requires_presencial,
   multi_branch, is_trial, is_group, group_max_members,
   is_active, is_archived, country, currency, grants_all_programs,
   created_at, updated_at)
VALUES
  ('Paquete · 3 sem · 2/sem', 'other', 'flexible', 'paquete', NULL,
   60, 60, NULL,
   21, 2, NULL, 0,
   0, 0, 0, NULL,
   1, 0, 'ES', 'EUR', 0,
   NOW(), NOW());

INSERT IGNORE INTO subscription_plans
  (name, plan_tier, booking_mode, plan_category, linked_program_id,
   price_regular, price_zero, price_credit_card,
   duration_days, classes_per_week, monthly_class_budget, requires_presencial,
   multi_branch, is_trial, is_group, group_max_members,
   is_active, is_archived, country, currency, grants_all_programs,
   created_at, updated_at)
VALUES
  ('Paquete · 3 sem · 3/sem', 'other', 'flexible', 'paquete', NULL,
   79, 79, NULL,
   21, 3, NULL, 0,
   0, 0, 0, NULL,
   1, 0, 'ES', 'EUR', 0,
   NOW(), NOW());

INSERT IGNORE INTO subscription_plans
  (name, plan_tier, booking_mode, plan_category, linked_program_id,
   price_regular, price_zero, price_credit_card,
   duration_days, classes_per_week, monthly_class_budget, requires_presencial,
   multi_branch, is_trial, is_group, group_max_members,
   is_active, is_archived, country, currency, grants_all_programs,
   created_at, updated_at)
VALUES
  ('Paquete · 3 sem · 4/sem', 'other', 'flexible', 'paquete', NULL,
   91, 91, NULL,
   21, 4, NULL, 0,
   0, 0, 0, NULL,
   1, 0, 'ES', 'EUR', 0,
   NOW(), NOW());

INSERT IGNORE INTO subscription_plans
  (name, plan_tier, booking_mode, plan_category, linked_program_id,
   price_regular, price_zero, price_credit_card,
   duration_days, classes_per_week, monthly_class_budget, requires_presencial,
   multi_branch, is_trial, is_group, group_max_members,
   is_active, is_archived, country, currency, grants_all_programs,
   created_at, updated_at)
VALUES
  ('Paquete · 3 sem · 5/sem', 'other', 'flexible', 'paquete', NULL,
   104, 104, NULL,
   21, 5, NULL, 0,
   0, 0, 0, NULL,
   1, 0, 'ES', 'EUR', 0,
   NOW(), NOW());

INSERT IGNORE INTO subscription_plans
  (name, plan_tier, booking_mode, plan_category, linked_program_id,
   price_regular, price_zero, price_credit_card,
   duration_days, classes_per_week, monthly_class_budget, requires_presencial,
   multi_branch, is_trial, is_group, group_max_members,
   is_active, is_archived, country, currency, grants_all_programs,
   created_at, updated_at)
VALUES
  ('Paquete · 3 sem · 6/sem', 'other', 'flexible', 'paquete', NULL,
   121, 121, NULL,
   21, 6, NULL, 0,
   0, 0, 0, NULL,
   1, 0, 'ES', 'EUR', 0,
   NOW(), NOW());
