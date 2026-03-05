-- Add weighted flag to session_prescriptions (indicates exercise uses external weight like kettlebell)
ALTER TABLE `session_prescriptions` ADD COLUMN `weighted` tinyint(1) NOT NULL DEFAULT 0 AFTER `exercise_type`;
