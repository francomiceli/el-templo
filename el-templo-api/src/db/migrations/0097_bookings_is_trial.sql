-- Phase 102 R1: Add is_trial flag to bookings.
-- Trial bookings are excluded from capacity counts and used to infer
-- leads (user has is_trial=TRUE booking AND no active subscription).
-- Existing rows backfill to FALSE via NOT NULL DEFAULT FALSE.

ALTER TABLE `bookings`
  ADD COLUMN `is_trial` BOOLEAN NOT NULL DEFAULT FALSE;
