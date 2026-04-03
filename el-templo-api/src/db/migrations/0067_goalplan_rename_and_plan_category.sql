-- Phase 89: Planes Online Infrastructure (Plan 01)
-- Full personalizada-to-goalPlan rename and boolean-to-planCategory enum migration

-- ============================================================
-- Section 1: Add plan_category enum column (nullable first)
-- ============================================================

ALTER TABLE `subscription_plans`
  ADD COLUMN `plan_category` ENUM('presencial','online_regular','online_goal','online_coach')
  DEFAULT NULL;

-- ============================================================
-- Section 2: Populate planCategory from existing booleans (D-08)
-- Existing gym plans -> presencial, personalizada -> online_goal, online -> online_regular
-- ============================================================

UPDATE `subscription_plans`
  SET `plan_category` = CASE
    WHEN `is_personalizada` = 1 THEN 'online_goal'
    WHEN `is_online` = 1 THEN 'online_regular'
    ELSE 'presencial'
  END;

-- ============================================================
-- Section 3: Make plan_category NOT NULL
-- ============================================================

ALTER TABLE `subscription_plans`
  MODIFY COLUMN `plan_category` ENUM('presencial','online_regular','online_goal','online_coach') NOT NULL;

-- ============================================================
-- Section 4: Drop old boolean columns
-- ============================================================

ALTER TABLE `subscription_plans` DROP COLUMN `is_personalizada`;
ALTER TABLE `subscription_plans` DROP COLUMN `is_online`;

-- ============================================================
-- Section 5: Rename personalizada_type -> goal_plan_type across 4 tables
-- ============================================================

ALTER TABLE `subscription_plans`
  CHANGE COLUMN `personalizada_type` `goal_plan_type` varchar(30);

ALTER TABLE `sessions`
  CHANGE COLUMN `personalizada_type` `goal_plan_type` varchar(30);

ALTER TABLE `completed_sessions`
  CHANGE COLUMN `personalizada_type` `goal_plan_type` varchar(30);

ALTER TABLE `member_personalizadas`
  CHANGE COLUMN `personalizada_type` `goal_plan_type` varchar(30) NOT NULL;

-- ============================================================
-- Section 6: Rename member_personalizadas table -> member_goal_plans
-- ============================================================

RENAME TABLE `member_personalizadas` TO `member_goal_plans`;

-- ============================================================
-- Section 7: Update AURA enum values (must list ALL existing values)
-- Replaces personalizada_completion with goal_plan_completion
-- ============================================================

ALTER TABLE `aura_config`
  MODIFY COLUMN `aura_config_source_type` ENUM(
    'training_completion','attendance','streak_bonus','referral',
    'subscription_discount','manual_adjustment','challenge','social',
    'goal_plan_completion','onboarding_completion',
    'program_week_completion','program_completion'
  ) NOT NULL;
UPDATE `aura_config` SET `aura_config_source_type` = 'goal_plan_completion'
  WHERE `aura_config_source_type` = 'personalizada_completion';

ALTER TABLE `aura_transactions`
  MODIFY COLUMN `source_type` ENUM(
    'training_completion','attendance','streak_bonus','referral',
    'subscription_discount','manual_adjustment','challenge','social',
    'goal_plan_completion','onboarding_completion',
    'program_week_completion','program_completion'
  ) NOT NULL;
UPDATE `aura_transactions` SET `source_type` = 'goal_plan_completion'
  WHERE `source_type` = 'personalizada_completion';

-- ============================================================
-- Section 8: Update session dayIds from P- prefix to GP- prefix
-- ============================================================

UPDATE `sessions`
  SET `day_id` = CONCAT('GP', SUBSTRING(`day_id`, 2))
  WHERE `day_id` LIKE 'P-%';

UPDATE `completed_sessions`
  SET `day_id` = CONCAT('GP', SUBSTRING(`day_id`, 2))
  WHERE `day_id` LIKE 'P-%';
