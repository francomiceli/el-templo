-- Phase 104 R2: seed the "Todos los Programas" bundle plan.
-- This is the single canonical row with grants_all_programs=true. Service
-- layer (Plan 02) reads this flag at assignPlan time and creates one
-- program_enrollment per active program. Pricing and duration are locked
-- by SPEC R2 (20.000 ARS, 30 days, AR-only). plan_tier='other' and
-- booking_mode='flexible' because this is not a presencial plan.
-- linked_program_id is NULL on purpose — the bundle does not link to a
-- single program, the grants_all_programs flag drives multi-enrollment.
--
-- Idempotency note: this is a one-shot seed. Re-running the migration is
-- prevented by the _migrations tracker (run-migrations.ts). If a seed row
-- with this name already exists in the target DB (manual experimentation),
-- the INSERT will succeed only because there is no UNIQUE on name. Do not
-- add ON DUPLICATE KEY UPDATE — this seed is a single source of truth.

INSERT INTO `subscription_plans` (
  `name`,
  `description`,
  `plan_tier`,
  `booking_mode`,
  `plan_category`,
  `linked_program_id`,
  `price_regular`,
  `price_zero`,
  `duration_days`,
  `multi_branch`,
  `is_trial`,
  `is_group`,
  `is_active`,
  `is_archived`,
  `country`,
  `currency`,
  `grants_all_programs`
) VALUES (
  'Todos los Programas',
  'Acceso a todos los programas virtuales activos durante 30 dias.',
  'other',
  'flexible',
  'online_regular',
  NULL,
  20000,
  20000,
  30,
  FALSE,
  FALSE,
  FALSE,
  TRUE,
  FALSE,
  'AR',
  'ARS',
  TRUE
);
