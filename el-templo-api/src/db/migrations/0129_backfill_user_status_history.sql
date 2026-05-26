-- Phase 117 (D-10): approximate backfill of user_status_history
--
-- Reconstructs an APPROXIMATE backward history so Phase 118 (funnel +
-- retencion) has some signal for users who existed before the live hook in
-- recomputeUserStatus started recording transitions. This is a best-effort
-- approximation, not an exact audit -- real timestamps for past transitions
-- were never captured.
--
-- Two passes, both for members only (users.status IS NOT NULL, role 'member'):
--
--   Pass 1 -- initial state. One row per member at users.created_at with
--   to_status='freemium' (the plausible first lifecycle state -- POST
--   /register seeds 'freemium' and admin-created members start 'prueba', but
--   we cannot distinguish them retroactively, so 'freemium' is the
--   conservative floor of the funnel). from_status NULL (no prior origin).
--   source 'backfill'.
--
--   Pass 2 -- approximate activation. For members who have at least one
--   subscription, a transition freemium -> activo at the first
--   subscriptions.created_at. source 'backfill'. This is the only forward
--   transition we can place a timestamp on with existing data.
--
-- Idempotency
--   Each INSERT ... SELECT is guarded by WHERE NOT EXISTS against a prior
--   backfill row of the same shape for that user, so a manual re-run is a
--   0-row no-op (pattern 0127 / 111-06). The _migrations tracker already
--   prevents replay by the project runner -- this is defense in depth.
--
-- Safety (T-117-03)
--   ONLY INSERT statements. This migration NEVER issues UPDATE or DELETE
--   against users or subscriptions (or any table) -- it cannot corrupt
--   existing data.
--
-- Comment safety (Phase 103-01 invariant)
--   The runner splits on semicolons BEFORE stripping line comments, so NO
--   semicolon may appear inside any comment line.

INSERT INTO user_status_history (user_id, from_status, to_status, source, changed_at)
SELECT u.id, NULL, 'freemium', 'backfill', u.created_at
FROM users u
WHERE u.status IS NOT NULL
  AND u.role = 'member'
  AND NOT EXISTS (
    SELECT 1 FROM user_status_history h
    WHERE h.user_id = u.id
      AND h.source = 'backfill'
      AND h.from_status IS NULL
      AND h.to_status = 'freemium'
  );

INSERT INTO user_status_history (user_id, from_status, to_status, source, changed_at)
SELECT u.id, 'freemium', 'activo', 'backfill', firstsub.first_created
FROM users u
INNER JOIN (
  SELECT s.user_id, MIN(s.created_at) AS first_created
  FROM subscriptions s
  GROUP BY s.user_id
) firstsub ON firstsub.user_id = u.id
WHERE u.status IS NOT NULL
  AND u.role = 'member'
  AND NOT EXISTS (
    SELECT 1 FROM user_status_history h
    WHERE h.user_id = u.id
      AND h.source = 'backfill'
      AND h.from_status = 'freemium'
      AND h.to_status = 'activo'
  );
