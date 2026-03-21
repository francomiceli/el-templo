-- Deactivate Park branch — free outdoor location, not a gym branch
-- No plans, schedules, or payments apply to Park
UPDATE `branches` SET `is_active` = 0 WHERE `code` = 'PARK';
