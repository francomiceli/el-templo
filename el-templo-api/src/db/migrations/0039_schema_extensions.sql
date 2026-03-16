-- Phase 59: Schema Extensions for Data Import
-- Adds document_type and address to users table
-- Adds is_archived to subscription_plans table

ALTER TABLE `users` ADD COLUMN `document_type` ENUM('DNI', 'Pasaporte', 'NIE', 'NIF', 'Otro') DEFAULT NULL AFTER `dni`;

--> statement-breakpoint

ALTER TABLE `users` ADD COLUMN `address` VARCHAR(500) DEFAULT NULL AFTER `document_type`;

--> statement-breakpoint

ALTER TABLE `subscription_plans` ADD COLUMN `is_archived` BOOLEAN NOT NULL DEFAULT FALSE AFTER `is_active`;
