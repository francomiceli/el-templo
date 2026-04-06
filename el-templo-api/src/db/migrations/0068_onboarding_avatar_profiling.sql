-- Phase 90: Onboarding Quiz Redesign & Avatar Profiling
-- Make existing quiz columns nullable for backward compat
ALTER TABLE `member_profiles` MODIFY COLUMN `goal_type` enum('muscle_up','fitness','weight_loss','flexibility','wellness') NULL;
ALTER TABLE `member_profiles` MODIFY COLUMN `experience_level` enum('beginner','intermediate','advanced') NULL;
ALTER TABLE `member_profiles` MODIFY COLUMN `training_focus` enum('upper_body','lower_body','core','full_body') NULL;
ALTER TABLE `member_profiles` MODIFY COLUMN `motivation_style` enum('discipline','community','results','challenges') NULL;

-- Add 5 new nullable columns for avatar profiling
ALTER TABLE `member_profiles` ADD COLUMN `age_range` varchar(10) NULL;
ALTER TABLE `member_profiles` ADD COLUMN `training_background` varchar(20) NULL;
ALTER TABLE `member_profiles` ADD COLUMN `pain_point` varchar(20) NULL;
ALTER TABLE `member_profiles` ADD COLUMN `training_frequency` varchar(10) NULL;
ALTER TABLE `member_profiles` ADD COLUMN `avatar_type` varchar(2) NULL;

-- Add avatar_assigned to onboarding analytics event type enum
ALTER TABLE `onboarding_analytics` MODIFY COLUMN `onboarding_event_type` enum('quiz_started','question_answered','quiz_completed','quiz_abandoned','avatar_assigned') NOT NULL;

-- Increase answer_value length from 50 to 100
ALTER TABLE `onboarding_analytics` MODIFY COLUMN `answer_value` varchar(100) NULL;
