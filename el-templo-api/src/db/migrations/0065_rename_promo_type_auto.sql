-- Rename promo_type enum value from 'qr_auto' to 'auto'
ALTER TABLE `promo_plans`
  MODIFY COLUMN `promo_type` enum('auto','admin_assignable') NOT NULL DEFAULT 'auto';
