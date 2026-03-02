ALTER TABLE `franchise_applications`
  ADD COLUMN `notes` text NULL AFTER `status`,
  ADD COLUMN `ai_strategy` text NULL AFTER `notes`,
  ADD COLUMN `ai_outreach` text NULL AFTER `ai_strategy`,
  ADD COLUMN `ai_followup` text NULL AFTER `ai_outreach`,
  ADD COLUMN `ai_negotiation` text NULL AFTER `ai_followup`;
