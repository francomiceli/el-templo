-- Adds optional reason for why a schedule slot was deactivated.
-- Surfaced to members in the toast when they try to reserve a deactivated slot
-- (booking-service.ts:reserve), so admins can communicate the cause inline
-- instead of needing a separate announcement.
ALTER TABLE schedules
  ADD COLUMN inactive_reason VARCHAR(255) NULL AFTER is_active;
