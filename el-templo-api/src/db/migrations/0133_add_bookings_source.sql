-- Phase 119 (D-02): add bookings.source for funnel attribution
--
-- Records how a booking originated: 'self_service' (member reserved their own
-- trial via the app) or 'admin' (staff booked it). Existing rows stay NULL,
-- which the funnel (D-18) treats as historical admin bookings.
--
-- Comment safety (Phase 103-01 invariant)
--   The runner splits on semicolons BEFORE stripping line comments, so NO
--   semicolon character may appear inside any comment line.
--
-- Hand-written SQL. ADD COLUMN without IF NOT EXISTS per project convention.

ALTER TABLE bookings ADD COLUMN source VARCHAR(16) NULL AFTER is_trial;
