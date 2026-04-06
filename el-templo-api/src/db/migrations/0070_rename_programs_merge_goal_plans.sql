-- Rename micro_programs → programs and micro_program_content_blocks → program_content_blocks
-- Merge member_goal_plans into program_enrollments (table no longer needed)
-- Allow indefinite-duration programs (e.g., "Calistenia General")

RENAME TABLE `micro_programs` TO `programs`;
RENAME TABLE `micro_program_content_blocks` TO `program_content_blocks`;

DROP TABLE `member_goal_plans`;

ALTER TABLE `programs` MODIFY COLUMN `duration_weeks` int NULL;
