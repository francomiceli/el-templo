-- Add reps_max, seconds_max, increment columns to session_prescriptions
-- for format-specific prescriptions (AMRAP ranges, Death By increment, etc.)
ALTER TABLE `session_prescriptions` ADD COLUMN `reps_max` int DEFAULT NULL;
ALTER TABLE `session_prescriptions` ADD COLUMN `seconds_max` int DEFAULT NULL;
ALTER TABLE `session_prescriptions` ADD COLUMN `increment` int DEFAULT NULL;
