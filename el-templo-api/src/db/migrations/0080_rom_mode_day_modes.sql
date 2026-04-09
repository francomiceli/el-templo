-- Phase 97: ROM Mode — Add session_mode column and day_modes table

-- Add session_mode column to sessions table (D-05, D-34)
ALTER TABLE `sessions` ADD `session_mode` varchar(10) NOT NULL DEFAULT 'regular';

-- Create day_modes table (D-14, D-15)
CREATE TABLE `day_modes` (
  `id` int AUTO_INCREMENT NOT NULL,
  `day_of_week` int NOT NULL,
  `session_mode` varchar(10) NOT NULL DEFAULT 'regular',
  CONSTRAINT `day_modes_id` PRIMARY KEY(`id`),
  CONSTRAINT `day_modes_day_of_week_unique` UNIQUE(`day_of_week`)
);

-- Seed day_modes with 6 rows: Mon-Fri regular, Sat rom (D-15)
INSERT INTO `day_modes` (`day_of_week`, `session_mode`) VALUES
  (1, 'regular'),
  (2, 'regular'),
  (3, 'regular'),
  (4, 'regular'),
  (5, 'regular'),
  (6, 'rom');
