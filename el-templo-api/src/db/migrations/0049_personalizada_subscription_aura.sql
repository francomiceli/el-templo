-- Add isPersonalizada flag to subscription_plans
ALTER TABLE `subscription_plans` ADD `is_personalizada` boolean NOT NULL DEFAULT false;

-- Extend aura_config_source_type enum to include personalizada_completion
ALTER TABLE `aura_config` MODIFY COLUMN `aura_config_source_type` enum('training_completion','attendance','streak_bonus','referral','subscription_discount','manual_adjustment','challenge','social','personalizada_completion') NOT NULL;

-- Extend source_type enum on aura_transactions to include personalizada_completion
ALTER TABLE `aura_transactions` MODIFY COLUMN `source_type` enum('training_completion','attendance','streak_bonus','referral','subscription_discount','manual_adjustment','challenge','social','personalizada_completion') NOT NULL;

-- Seed aura_config for personalizada_completion
INSERT INTO aura_config (aura_config_source_type, default_amount, description, is_active)
VALUES ('personalizada_completion', 10, 'Completed a personalizada session', true);
