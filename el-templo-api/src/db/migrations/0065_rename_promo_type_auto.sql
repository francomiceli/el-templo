-- Rename promo_type enum value from 'qr_auto' to 'auto'
-- Step 1: Add 'auto' to the enum (keeping 'qr_auto' temporarily)
ALTER TABLE `promo_plans`
  MODIFY COLUMN `promo_type` enum('qr_auto','auto','admin_assignable') NOT NULL DEFAULT 'qr_auto';

-- Step 2: Update existing rows
UPDATE `promo_plans` SET `promo_type` = 'auto' WHERE `promo_type` = 'qr_auto';

-- Step 3: Remove 'qr_auto' from the enum
ALTER TABLE `promo_plans`
  MODIFY COLUMN `promo_type` enum('auto','admin_assignable') NOT NULL DEFAULT 'auto';
