-- Phase 98: Multi-currency and country-scoped plans
-- 1. Adds `country` to subscription_plans, promo_plans, gladius_products
-- 2. Adds `currency` to subscription_plans, subscriptions, payments
-- 3. Defensively backfills AR/ARS on any pre-existing row (NOT NULL DEFAULT
--    already backfills on ALTER; these UPDATEs are belt-and-suspenders and
--    make re-runs safe even after manual column tweaks).
-- 4. Creates a unique index on subscription_plans(name, country) so the ES
--    seed INSERT IGNORE below is genuinely dedup-keyed (without a unique key,
--    INSERT IGNORE has no dedup target and would duplicate rows on re-apply).
-- 5. Seeds 12 ES plans with exact EUR prices per SPEC Requirement 4.
--
-- Idempotency: the _migrations tracker prevents a successful file from running
-- twice. The unique index + INSERT IGNORE provide a second layer of safety for
-- accidental manual re-runs against the ES seed. Partial failures are NOT
-- recorded as applied, so the next run replays every statement -- the defensive
-- backfill + IGNORE-on-duplicate-key behavior make that replay safe.

-- ---------------------------------------------------------------------------
-- Section 1: ALTER TABLE statements (6 columns total)
-- ---------------------------------------------------------------------------

ALTER TABLE subscription_plans ADD COLUMN country VARCHAR(2) NOT NULL DEFAULT 'AR';
ALTER TABLE subscription_plans ADD COLUMN currency VARCHAR(3) NOT NULL DEFAULT 'ARS';
ALTER TABLE subscriptions     ADD COLUMN currency VARCHAR(3) NOT NULL DEFAULT 'ARS';
ALTER TABLE payments          ADD COLUMN currency VARCHAR(3) NOT NULL DEFAULT 'ARS';
ALTER TABLE promo_plans       ADD COLUMN country  VARCHAR(2) NOT NULL DEFAULT 'AR';
ALTER TABLE gladius_products  ADD COLUMN country  VARCHAR(2) NOT NULL DEFAULT 'AR';

-- ---------------------------------------------------------------------------
-- Section 2: Defensive backfill UPDATE statements (6 total, one per new column)
-- Safe no-ops on a fresh ALTER (DEFAULT already populated the column) but
-- indispensable in any scenario where the ALTER's DEFAULT was omitted,
-- overridden, or a manual column tweak left a NULL.
-- ---------------------------------------------------------------------------

UPDATE subscription_plans SET country  = 'AR'  WHERE country  IS NULL OR country  = '';
UPDATE subscription_plans SET currency = 'ARS' WHERE currency IS NULL OR currency = '';
UPDATE subscriptions      SET currency = 'ARS' WHERE currency IS NULL OR currency = '';
UPDATE payments           SET currency = 'ARS' WHERE currency IS NULL OR currency = '';
UPDATE promo_plans        SET country  = 'AR'  WHERE country  IS NULL OR country  = '';
UPDATE gladius_products   SET country  = 'AR'  WHERE country  IS NULL OR country  = '';

-- ---------------------------------------------------------------------------
-- Section 3: Unique index on subscription_plans(name, country)
-- Enables genuine INSERT IGNORE idempotency on the ES seed below. Without
-- this key, INSERT IGNORE would not dedupe against existing rows and a
-- re-apply would create 12 additional ES plan duplicates.
-- Plain CREATE UNIQUE INDEX (no IF NOT EXISTS) -- the run-migrations.ts runner
-- already handles "Duplicate key name" as a skip-safe error for re-runs.
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX ux_subscription_plans_name_country
  ON subscription_plans (name, country);

-- ---------------------------------------------------------------------------
-- Section 4: Seed 12 ES plans (country='ES', currency='EUR')
-- Attribute values (plan_tier, booking_mode, plan_category, duration_days,
-- classes_per_week, multi_branch, is_trial, is_group, group_max_members,
-- linked_program_id) copied from the matching AR plan queried from eltemplo
-- DB on 2026-04-21. ES names use SPEC Requirement 4 canonical (accented) form.
-- price_credit_card is NULL for all ES plans: the AR Foundation/Foundation+/
-- Performance rows have non-null credit-card surcharge prices in ARS, but no
-- proportional EUR value was specified -- documented in SUMMARY.
-- price_zero equals price_regular for ES plans (no zero-payment discount
-- specified for ES; SPEC gives a single EUR price per plan).
-- ---------------------------------------------------------------------------

-- Presenciales
INSERT IGNORE INTO subscription_plans
  (name, plan_tier, booking_mode, plan_category, linked_program_id,
   price_regular, price_zero, price_credit_card,
   duration_days, classes_per_week, multi_branch, is_trial, is_group,
   group_max_members, is_active, is_archived, country, currency,
   created_at, updated_at)
VALUES
  ('Flex', 'flex', 'fixed', 'presencial', 3,
   7000, 7000, NULL,
   30, 2, 0, 0, 0,
   NULL, 1, 0, 'ES', 'EUR',
   NOW(), NOW());

INSERT IGNORE INTO subscription_plans
  (name, plan_tier, booking_mode, plan_category, linked_program_id,
   price_regular, price_zero, price_credit_card,
   duration_days, classes_per_week, multi_branch, is_trial, is_group,
   group_max_members, is_active, is_archived, country, currency,
   created_at, updated_at)
VALUES
  ('Flex+', 'flex', 'flexible', 'presencial', 3,
   9000, 9000, NULL,
   30, 6, 0, 0, 0,
   NULL, 1, 0, 'ES', 'EUR',
   NOW(), NOW());

INSERT IGNORE INTO subscription_plans
  (name, plan_tier, booking_mode, plan_category, linked_program_id,
   price_regular, price_zero, price_credit_card,
   duration_days, classes_per_week, multi_branch, is_trial, is_group,
   group_max_members, is_active, is_archived, country, currency,
   created_at, updated_at)
VALUES
  ('Foundation', 'foundation', 'fixed', 'presencial', 3,
   21000, 21000, NULL,
   120, 2, 0, 0, 0,
   NULL, 1, 0, 'ES', 'EUR',
   NOW(), NOW());

INSERT IGNORE INTO subscription_plans
  (name, plan_tier, booking_mode, plan_category, linked_program_id,
   price_regular, price_zero, price_credit_card,
   duration_days, classes_per_week, multi_branch, is_trial, is_group,
   group_max_members, is_active, is_archived, country, currency,
   created_at, updated_at)
VALUES
  ('Foundation+', 'foundation', 'flexible', 'presencial', 3,
   30000, 30000, NULL,
   120, 6, 1, 0, 0,
   NULL, 1, 0, 'ES', 'EUR',
   NOW(), NOW());

INSERT IGNORE INTO subscription_plans
  (name, plan_tier, booking_mode, plan_category, linked_program_id,
   price_regular, price_zero, price_credit_card,
   duration_days, classes_per_week, multi_branch, is_trial, is_group,
   group_max_members, is_active, is_archived, country, currency,
   created_at, updated_at)
VALUES
  ('Performance', 'performance', 'flexible', 'presencial', 3,
   50000, 50000, NULL,
   240, 6, 1, 0, 0,
   NULL, 1, 0, 'ES', 'EUR',
   NOW(), NOW());

INSERT IGNORE INTO subscription_plans
  (name, plan_tier, booking_mode, plan_category, linked_program_id,
   price_regular, price_zero, price_credit_card,
   duration_days, classes_per_week, multi_branch, is_trial, is_group,
   group_max_members, is_active, is_archived, country, currency,
   created_at, updated_at)
VALUES
  ('Sesión de Prueba', 'other', 'fixed', 'presencial', 3,
   0, 0, NULL,
   1, 1, 0, 1, 0,
   NULL, 1, 0, 'ES', 'EUR',
   NOW(), NOW());

-- Online
INSERT IGNORE INTO subscription_plans
  (name, plan_tier, booking_mode, plan_category, linked_program_id,
   price_regular, price_zero, price_credit_card,
   duration_days, classes_per_week, multi_branch, is_trial, is_group,
   group_max_members, is_active, is_archived, country, currency,
   created_at, updated_at)
VALUES
  ('30 Días Online', 'other', 'flexible', 'online_regular', 2,
   2000, 2000, NULL,
   30, NULL, 0, 0, 0,
   NULL, 1, 0, 'ES', 'EUR',
   NOW(), NOW());

INSERT IGNORE INTO subscription_plans
  (name, plan_tier, booking_mode, plan_category, linked_program_id,
   price_regular, price_zero, price_credit_card,
   duration_days, classes_per_week, multi_branch, is_trial, is_group,
   group_max_members, is_active, is_archived, country, currency,
   created_at, updated_at)
VALUES
  ('Cero a Atleta', 'other', 'flexible', 'online_regular', 5,
   3000, 3000, NULL,
   30, NULL, 0, 0, 0,
   NULL, 1, 0, 'ES', 'EUR',
   NOW(), NOW());

INSERT IGNORE INTO subscription_plans
  (name, plan_tier, booking_mode, plan_category, linked_program_id,
   price_regular, price_zero, price_credit_card,
   duration_days, classes_per_week, multi_branch, is_trial, is_group,
   group_max_members, is_active, is_archived, country, currency,
   created_at, updated_at)
VALUES
  ('Foundation Online', 'other', 'flexible', 'online_regular', 3,
   3000, 3000, NULL,
   30, NULL, 0, 0, 0,
   NULL, 1, 0, 'ES', 'EUR',
   NOW(), NOW());

INSERT IGNORE INTO subscription_plans
  (name, plan_tier, booking_mode, plan_category, linked_program_id,
   price_regular, price_zero, price_credit_card,
   duration_days, classes_per_week, multi_branch, is_trial, is_group,
   group_max_members, is_active, is_archived, country, currency,
   created_at, updated_at)
VALUES
  ('Piernas y Glúteos', 'other', 'flexible', 'online_goal', 4,
   3000, 3000, NULL,
   30, NULL, 0, 0, 0,
   NULL, 1, 0, 'ES', 'EUR',
   NOW(), NOW());

INSERT IGNORE INTO subscription_plans
  (name, plan_tier, booking_mode, plan_category, linked_program_id,
   price_regular, price_zero, price_credit_card,
   duration_days, classes_per_week, multi_branch, is_trial, is_group,
   group_max_members, is_active, is_archived, country, currency,
   created_at, updated_at)
VALUES
  ('Promo Gratuito 30 Días', 'other', 'flexible', 'online_regular', NULL,
   0, 0, NULL,
   30, NULL, 0, 1, 0,
   NULL, 1, 0, 'ES', 'EUR',
   NOW(), NOW());

INSERT IGNORE INTO subscription_plans
  (name, plan_tier, booking_mode, plan_category, linked_program_id,
   price_regular, price_zero, price_credit_card,
   duration_days, classes_per_week, multi_branch, is_trial, is_group,
   group_max_members, is_active, is_archived, country, currency,
   created_at, updated_at)
VALUES
  ('Tu Primer Front Lever', 'other', 'flexible', 'online_goal', 6,
   3000, 3000, NULL,
   30, NULL, 0, 0, 0,
   NULL, 1, 0, 'ES', 'EUR',
   NOW(), NOW());
