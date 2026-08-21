-- 0207_seed_module_flags.sql
-- Fase 176 (MOD-01): siembra los 4 flags `module.<nombre>.enabled` en ON para
-- la instalación de El Templo (tenant_id = 1), sobre la tabla EXISTENTE
-- `tenant_settings` (NO tabla nueva). Escrita a mano porque `db:generate`
-- (drizzle-kit generate) está roto por el drift de `sessions.goal_plan_type`
-- (ver skill de migraciones). El default en código (`module-flags.ts`) es OFF
-- fail-closed: una instalación white-label sin este seed arranca con los 4
-- módulos apagados. Este seed existe para que el dia del deploy el
-- comportamiento de prod sea idéntico al de hoy (los 4 módulos ya activos).
-- Idempotente: cada bloque se salta si la key ya existe, asi un re-run (o un
-- valor apagado a mano despues via el futuro admin de flags) nunca se pisa.
-- NOTE: no semicolons inside these comment lines (the custom runner splits on
-- the semicolon BEFORE stripping the double-dash comments).
INSERT INTO `tenant_settings` (`tenant_id`, `setting_key`, `setting_value`)
SELECT 1, 'module.templo-training.enabled', 'true'
WHERE NOT EXISTS (
  SELECT 1 FROM `tenant_settings` WHERE `tenant_id` = 1 AND `setting_key` = 'module.templo-training.enabled'
);

INSERT INTO `tenant_settings` (`tenant_id`, `setting_key`, `setting_value`)
SELECT 1, 'module.templo-gamification.enabled', 'true'
WHERE NOT EXISTS (
  SELECT 1 FROM `tenant_settings` WHERE `tenant_id` = 1 AND `setting_key` = 'module.templo-gamification.enabled'
);

INSERT INTO `tenant_settings` (`tenant_id`, `setting_key`, `setting_value`)
SELECT 1, 'module.templo-marketing.enabled', 'true'
WHERE NOT EXISTS (
  SELECT 1 FROM `tenant_settings` WHERE `tenant_id` = 1 AND `setting_key` = 'module.templo-marketing.enabled'
);

INSERT INTO `tenant_settings` (`tenant_id`, `setting_key`, `setting_value`)
SELECT 1, 'module.templo-onboarding.enabled', 'true'
WHERE NOT EXISTS (
  SELECT 1 FROM `tenant_settings` WHERE `tenant_id` = 1 AND `setting_key` = 'module.templo-onboarding.enabled'
);
