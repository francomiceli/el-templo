-- Rename role 'recepcionista' to 'gestion' in users table.
-- Step 1: Add 'gestion' to the enum
-- Step 2: Migrate existing users
-- Step 3: Remove 'recepcionista' from the enum

ALTER TABLE `users` MODIFY COLUMN `role` enum('member','coach','admin','owner','recepcionista','gestion') NOT NULL;

UPDATE `users` SET `role` = 'gestion' WHERE `role` = 'recepcionista';

ALTER TABLE `users` MODIFY COLUMN `role` enum('member','coach','admin','owner','gestion') NOT NULL;
