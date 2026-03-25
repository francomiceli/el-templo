-- Phase 81: Add streak tracking columns to member_profiles
ALTER TABLE `member_profiles`
  ADD COLUMN `current_streak` int DEFAULT 0,
  ADD COLUMN `longest_streak` int DEFAULT 0,
  ADD COLUMN `streak_updated_at` timestamp NULL;
