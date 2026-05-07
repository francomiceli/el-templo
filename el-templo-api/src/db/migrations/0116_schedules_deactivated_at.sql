-- Tracks when a schedule was last deactivated so we can later distinguish
-- bookings cancelled by the deactivation (cancelledAt >= deactivated_at)
-- from bookings cancelled by the member or by individual admin actions.
-- On reactivation we restore the former and leave the latter untouched.
ALTER TABLE schedules
  ADD COLUMN deactivated_at TIMESTAMP NULL AFTER inactive_reason;
