-- 0166_seed_pricing_card_surcharge.sql
-- Phase 154 (ALUM-03 / D-03): seed the card-surcharge pricing rule ON for the
-- El Templo installation, so current prod behavior (tarjeta usa priceCreditCard)
-- is unchanged. Reuses system_settings (NO new table). Idempotent: skip if the
-- key already exists so a re-run (or a prior PUT-set value) is never clobbered.
-- A fresh white-label install without this seed defaults OFF (no surcharge).
-- NOTE: no semicolons inside these comment lines (the custom runner splits on the
-- semicolon BEFORE stripping the double-dash comments).
INSERT INTO `system_settings` (`setting_key`, `setting_value`)
SELECT 'pricing.card_surcharge_enabled', 'on'
WHERE NOT EXISTS (
  SELECT 1 FROM `system_settings` WHERE `setting_key` = 'pricing.card_surcharge_enabled'
);
