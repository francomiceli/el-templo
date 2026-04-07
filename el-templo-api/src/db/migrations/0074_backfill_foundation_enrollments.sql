-- Backfill: enroll all active presencial members in Foundation program
-- These members already had presencial plans but no program enrollment
-- Going forward, subscription assignment auto-creates enrollments via linkedProgramId
SET @foundation_id = (SELECT id FROM `programs` WHERE `name` = 'Foundation — Cuerpo Completo' LIMIT 1);

INSERT INTO `program_enrollments` (`user_id`, `program_id`, `status`, `current_week`, `sessions_completed_this_week`, `enrolled_at`)
SELECT DISTINCT s.user_id, @foundation_id, 'active', 1, 0, NOW()
FROM `subscriptions` s
INNER JOIN `subscription_plans` sp ON sp.id = s.plan_id
WHERE sp.plan_category = 'presencial'
  AND s.status IN ('active', 'paused')
  AND s.user_id NOT IN (
    SELECT pe.user_id FROM `program_enrollments` pe WHERE pe.status = 'active'
  );
