-- Online plans are monthly billing ($X/month), not one-shot
-- Program duration (12 weeks etc) lives on the programs table, not the plan
UPDATE `subscription_plans`
SET `duration_days` = 30
WHERE `plan_category` IN ('online_regular', 'online_goal', 'online_coach')
  AND `duration_days` != 30;
