-- Fix backfilled Foundation enrollments: set enrolled_at to subscription start_date
-- and calculate currentWeek based on elapsed weeks since subscription start
UPDATE `program_enrollments` pe
INNER JOIN `subscriptions` sub ON sub.user_id = pe.user_id
  AND sub.subscription_status IN ('active', 'paused')
INNER JOIN `subscription_plans` sp ON sp.id = sub.plan_id
  AND sp.plan_category = 'presencial'
SET
  pe.enrolled_at = sub.start_date,
  pe.current_week = GREATEST(1, FLOOR(DATEDIFF(NOW(), sub.start_date) / 7) + 1)
WHERE pe.status = 'active'
  AND pe.enrolled_at >= '2026-04-06';
