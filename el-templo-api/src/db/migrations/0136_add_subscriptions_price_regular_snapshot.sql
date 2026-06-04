-- Phase 120 (D-05/D-06): add subscriptions.price_regular_snapshot for ticket discount base
--
-- Captures the plan's current price_regular at each new membership charge so the
-- ticket discount (block 6) is faithful going forward. Existing rows stay NULL
-- (historical discount falls back to the plan's current price_regular with a
-- disclaimer). No backfill possible -- the list price was never stored.
-- This is the ONLY migration in Phase 120 (D-06): duration_tier does NOT migrate.
--
-- Comment safety (Phase 103-01 invariant)
--   The runner splits on semicolons BEFORE stripping line comments, so NO
--   semicolon character may appear inside any comment line.
--
-- Hand-written SQL. ADD COLUMN without IF NOT EXISTS per project convention.

ALTER TABLE subscriptions ADD COLUMN price_regular_snapshot INT NULL AFTER price_override_reason;
