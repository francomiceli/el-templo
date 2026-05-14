-- Backfill: reactivate `cancelado` future bookings that should be live.
--
-- Context: prior to the booking-population.ts fix replacing INSERT IGNORE
-- with INSERT ON DUPLICATE KEY UPDATE, each plan change or renewal that
-- re-used the same scheduleIds left members with stale `cancelado` rows
-- blocking the new `reservado` rows (silent INSERT IGNORE drop). The
-- symptom: admin sees the member's fixed assignment in
-- subscription_schedules but QR check-in fails because no `reservado`
-- booking exists for the date.
--
-- This migration restores those rows by flipping `cancelado` back to
-- `reservado` for future bookings whose (member, schedule) tuple is
-- still part of a live subscription_schedules row of an active or
-- scheduled subscription, with the subscription's end_date covering the
-- booking_date and the schedule still active.
--
-- Out of scope:
--   - Past `cancelado` rows (historical, untouched).
--   - Bookings where the member's current subscription does NOT include
--     that slot (correct cancellation, leave as-is).
--   - Subscriptions in `paused`, `expired`, `cancelled`, `changed`
--     (intentional cancel, leave as-is).
--
-- Tradeoff accepted: when the original cancellation already triggered
-- waitlist promotion, reactivating may push the slot capacity by 1 over
-- the configured limit. Considered acceptable vs leaving members
-- without their fixed slots.

UPDATE bookings b
SET
  b.booking_status = 'reservado',
  b.cancelled_at = NULL,
  b.waitlist_position = NULL
WHERE b.booking_status = 'cancelado'
  AND b.booking_date >= CURDATE()
  AND EXISTS (
    SELECT 1
    FROM subscription_schedules ss
    INNER JOIN subscriptions s ON s.id = ss.subscription_id
    INNER JOIN schedules sch ON sch.id = ss.schedule_id
    WHERE ss.schedule_id = b.schedule_id
      AND s.user_id = b.member_id
      AND s.subscription_status IN ('active', 'scheduled')
      AND s.end_date >= b.booking_date
      AND sch.is_active = 1
  );
