-- Rename segment 'nuevo_guerrero' to 'nuevo'
-- Step 1: Alter enum to include new value
ALTER TABLE `member_profiles`
  MODIFY COLUMN `member_segment` enum('nuevo_guerrero','nuevo','espartano','intermitente','en_riesgo','digital_warrior','ghost') DEFAULT NULL;

-- Step 2: Update existing rows
UPDATE `member_profiles` SET `member_segment` = 'nuevo' WHERE `member_segment` = 'nuevo_guerrero';

-- Step 3: Remove old enum value
ALTER TABLE `member_profiles`
  MODIFY COLUMN `member_segment` enum('nuevo','espartano','intermitente','en_riesgo','digital_warrior','ghost') DEFAULT NULL;

-- Step 4: Rename settings key
UPDATE `system_settings` SET `key` = 'segment.nuevo_days' WHERE `key` = 'segment.nuevo_guerrero_days';
