ALTER TABLE `member_journeys` RENAME TO `member_personalizadas`;
ALTER TABLE `member_personalizadas` CHANGE COLUMN `journey_type` `personalizada_type` varchar(30) NOT NULL;
ALTER TABLE `sessions` CHANGE COLUMN `journey_type` `personalizada_type` varchar(30);
ALTER TABLE `completed_sessions` CHANGE COLUMN `journey_type` `personalizada_type` varchar(30);
UPDATE `sessions` SET `day_id` = REPLACE(`day_id`, 'J-', 'P-') WHERE `day_id` LIKE 'J-%';
UPDATE `completed_sessions` SET `day_id` = REPLACE(`day_id`, 'J-', 'P-') WHERE `day_id` LIKE 'J-%';
