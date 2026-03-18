-- Step 1: Add owner and recepcionista to enum (keeping superadmin temporarily)
ALTER TABLE `users` MODIFY COLUMN `role` enum('member','coach','admin','superadmin','owner','recepcionista') NOT NULL DEFAULT 'member';

-- Step 2: Migrate superadmin -> owner
UPDATE `users` SET `role` = 'owner' WHERE `role` = 'superadmin';

-- Step 3: Remove superadmin from enum
ALTER TABLE `users` MODIFY COLUMN `role` enum('member','coach','admin','owner','recepcionista') NOT NULL DEFAULT 'member';
