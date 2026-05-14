-- Phase backfill walk-in bookings
-- Restores the booking row for every attendance that was recorded via
-- coachCheckIn without a matching active booking. These are coach
-- walk-ins where the slot was not pre-reserved (or the prior booking was
-- cancelled/no_show/waitlisted) and the conteo of alumnos por clase plus
-- slot-occupancy analytics under-reported as a result.
--
-- Two phases inside this migration
--   1 INSERT IGNORE rows where no booking exists for the tuple
--     (member_id, schedule_id, booking_date). The unique index protects
--     against accidental duplicates if the runner partially completed.
--   2 UPDATE bookings whose status is cancelado, no_show, or lista_espera
--     to confirmado, clearing cancelled_at and waitlist_position. Only
--     rows that have a matching attendance row are touched.
--
-- Idempotency rationale
--   The _migrations table tracks this filename and prevents replay. Both
--   statements are also safe to re-run by hand should the need arise
--   the INSERT is IGNORE on the unique index and the UPDATE filters on
--   the prior status set so a second pass affects zero rows.
--
-- Comment safety invariant from phase 103-01
--   The migration runner splits this file on semicolons BEFORE stripping
--   line comments, so no semicolon character may appear inside any
--   comment line.

INSERT IGNORE INTO bookings (member_id, schedule_id, booking_date, booking_status, is_trial, booked_at)
SELECT a.member_id, a.schedule_id, a.session_date, 'confirmado', 0, a.checked_in_at
FROM attendance a
LEFT JOIN bookings b
  ON b.member_id = a.member_id
  AND b.schedule_id = a.schedule_id
  AND b.booking_date = a.session_date
WHERE a.schedule_id IS NOT NULL
  AND b.id IS NULL;

UPDATE bookings b
INNER JOIN attendance a
  ON a.member_id = b.member_id
  AND a.schedule_id = b.schedule_id
  AND a.session_date = b.booking_date
SET b.cancelled_at = NULL,
    b.waitlist_position = NULL,
    b.booking_status = 'confirmado'
WHERE b.booking_status IN ('cancelado', 'no_show', 'lista_espera');
