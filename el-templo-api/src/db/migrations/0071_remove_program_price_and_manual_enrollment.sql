-- Programs don't have prices — pricing lives on subscription_plans
-- Enrollments are auto-created by subscription assignment, not manual
ALTER TABLE `programs` DROP COLUMN `price`;
ALTER TABLE `program_enrollments` DROP COLUMN `payment_amount`;
ALTER TABLE `program_enrollments` DROP COLUMN `payment_method`;
