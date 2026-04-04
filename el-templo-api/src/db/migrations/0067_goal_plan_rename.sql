-- Migration 0067: Goal plan rename + plan category enum + linked programs
-- Phase 89: Planes Online Infrastructure (Plan 01)
--
-- Renames personalizada -> goalPlan across DB, replaces boolean flags with
-- plan_category enum, adds linked_program_id FK, updates AURA enums,
-- updates session dayId prefixes from P- to GP-.

-- ============================================================================
-- Section 1: Add plan_category enum column to subscription_plans
-- ============================================================================

ALTER TABLE `subscription_plans`
  ADD COLUMN `plan_category` ENUM('presencial','online_regular','online_goal','online_coach')
  DEFAULT NULL;

-- ============================================================================
-- Section 2: Populate plan_category from existing boolean flags (per D-08)
-- ============================================================================

UPDATE `subscription_plans`
  SET `plan_category` = CASE
    WHEN `is_personalizada` = 1 THEN 'online_goal'
    WHEN `is_online` = 1 THEN 'online_regular'
    ELSE 'presencial'
  END;

-- ============================================================================
-- Section 3: Make plan_category NOT NULL, drop old booleans + personalizada_type
-- Per D-07 REVISED: goalPlanType does NOT belong on subscription_plans.
-- personalizada_type is DROPPED entirely (not renamed).
-- ============================================================================

ALTER TABLE `subscription_plans`
  MODIFY COLUMN `plan_category` ENUM('presencial','online_regular','online_goal','online_coach') NOT NULL;

ALTER TABLE `subscription_plans` DROP COLUMN `is_personalizada`;
ALTER TABLE `subscription_plans` DROP COLUMN `is_online`;
ALTER TABLE `subscription_plans` DROP COLUMN `personalizada_type`;

-- ============================================================================
-- Section 4: Rename personalizada_type -> goal_plan_type on 3 tables
-- NOTE: subscription_plans is NOT included — its personalizada_type was
-- dropped in Section 3 per D-07 REVISED.
-- ============================================================================

ALTER TABLE `sessions`
  CHANGE COLUMN `personalizada_type` `goal_plan_type` varchar(30);

ALTER TABLE `completed_sessions`
  CHANGE COLUMN `personalizada_type` `goal_plan_type` varchar(30);

ALTER TABLE `member_personalizadas`
  CHANGE COLUMN `personalizada_type` `goal_plan_type` varchar(30) NOT NULL;

-- ============================================================================
-- Section 5: Rename member_personalizadas table -> member_goal_plans
-- ============================================================================

RENAME TABLE `member_personalizadas` TO `member_goal_plans`;

-- ============================================================================
-- Section 6: Update session dayIds from P- prefix to GP- prefix
-- ============================================================================

UPDATE `sessions`
  SET `day_id` = CONCAT('GP', SUBSTRING(`day_id`, 2))
  WHERE `day_id` LIKE 'P-%';

UPDATE `completed_sessions`
  SET `day_id` = CONCAT('GP', SUBSTRING(`day_id`, 2))
  WHERE `day_id` LIKE 'P-%';

-- ============================================================================
-- Section 7: Update AURA enum values
-- AURA enum values discovered from schema:
-- aura_config.aura_config_source_type: training_completion, attendance,
--   streak_bonus, referral, subscription_discount, manual_adjustment,
--   challenge, social, personalizada_completion, onboarding_completion,
--   program_week_completion, program_completion
-- aura_transactions.source_type: training_completion, attendance,
--   streak_bonus, referral, subscription_discount, manual_adjustment,
--   challenge, social, personalizada_completion, onboarding_completion,
--   program_week_completion, program_completion
-- VERIFY: every value above appears in the MODIFY COLUMN below
--   (personalizada_completion replaced with goal_plan_completion)
-- ============================================================================

-- First, expand enum to include BOTH old and new values (safe transition)
ALTER TABLE `aura_config`
  MODIFY COLUMN `aura_config_source_type` ENUM(
    'training_completion',
    'attendance',
    'streak_bonus',
    'referral',
    'subscription_discount',
    'manual_adjustment',
    'challenge',
    'social',
    'personalizada_completion',
    'goal_plan_completion',
    'onboarding_completion',
    'program_week_completion',
    'program_completion'
  ) NOT NULL;

-- Migrate existing data
UPDATE `aura_config` SET `aura_config_source_type` = 'goal_plan_completion'
  WHERE `aura_config_source_type` = 'personalizada_completion';

-- Now remove old value from enum (all rows already migrated)
ALTER TABLE `aura_config`
  MODIFY COLUMN `aura_config_source_type` ENUM(
    'training_completion',
    'attendance',
    'streak_bonus',
    'referral',
    'subscription_discount',
    'manual_adjustment',
    'challenge',
    'social',
    'goal_plan_completion',
    'onboarding_completion',
    'program_week_completion',
    'program_completion'
  ) NOT NULL;

-- Same safe transition for aura_transactions
ALTER TABLE `aura_transactions`
  MODIFY COLUMN `source_type` ENUM(
    'training_completion',
    'attendance',
    'streak_bonus',
    'referral',
    'subscription_discount',
    'manual_adjustment',
    'challenge',
    'social',
    'personalizada_completion',
    'goal_plan_completion',
    'onboarding_completion',
    'program_week_completion',
    'program_completion'
  ) NOT NULL;

-- Migrate existing data
UPDATE `aura_transactions` SET `source_type` = 'goal_plan_completion'
  WHERE `source_type` = 'personalizada_completion';

-- Remove old value from enum
ALTER TABLE `aura_transactions`
  MODIFY COLUMN `source_type` ENUM(
    'training_completion',
    'attendance',
    'streak_bonus',
    'referral',
    'subscription_discount',
    'manual_adjustment',
    'challenge',
    'social',
    'goal_plan_completion',
    'onboarding_completion',
    'program_week_completion',
    'program_completion'
  ) NOT NULL;

-- ============================================================================
-- Section 8: Add goal_plan_type column to micro_programs (per D-30)
-- ============================================================================

ALTER TABLE `micro_programs`
  ADD COLUMN `goal_plan_type` varchar(30) DEFAULT NULL;

-- ============================================================================
-- Section 9: Add linked_program_id FK to subscription_plans (per D-25)
-- ============================================================================

ALTER TABLE `subscription_plans`
  ADD COLUMN `linked_program_id` int DEFAULT NULL,
  ADD CONSTRAINT `fk_plans_linked_program` FOREIGN KEY (`linked_program_id`) REFERENCES `micro_programs`(`id`);
