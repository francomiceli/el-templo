-- Seed aura_config with onboarding_completion source type (50 AURA for quiz completion)
-- Also seed training_completion (10 AURA per session, Phase 81)
-- Uses INSERT IGNORE to skip if rows already exist

INSERT IGNORE INTO `aura_config` (`aura_config_source_type`, `default_amount`, `description`, `is_active`)
VALUES ('onboarding_completion', 50, 'AURA reward for completing onboarding quiz', 1);
--> statement-breakpoint
INSERT IGNORE INTO `aura_config` (`aura_config_source_type`, `default_amount`, `description`, `is_active`)
VALUES ('training_completion', 10, 'AURA reward for completing a training session', 1);
