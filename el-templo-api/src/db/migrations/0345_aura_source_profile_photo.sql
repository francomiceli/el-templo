-- Migration 0345: Aura source type 'profile_photo'
-- Fase 214 D-30: fuente nueva para la foto de perfil propia.
--
-- Agrega el valor 'profile_photo' AL FINAL del enum en las dos tablas de Aura.
-- La primera foto subida por el alumno que el staff aprueba suma 5 Aura una
-- sola vez en la vida. El candado es el unique unique_user_source_ref de
-- aura_transactions con reference_id = user_id (no NULL). El monto real vive
-- en AURA_AMOUNTS.profilePhoto, la fila de aura_config es solo el espejo.
--
-- El nombre fisico de la columna difiere por tabla (mysqlEnum 1er-arg = nombre
-- de columna): source_type en aura_transactions, aura_config_source_type en
-- aura_config.
--
-- aura_config es global (sin override por gimnasio), deuda ya asumida en
-- tenant-tables.ts. La fila sembrada abajo toma tenant_id DEFAULT 1.
--
-- Hand-written: nunca drizzle-kit push/migrate, la tabla _migrations es la
-- unica fuente de verdad. Cero datos de prueba (staging y prod comparten
-- servidor MySQL).
--
-- Un comentario SQL NUNCA debe contener el separador de statements, el
-- runner parte los statements crudos primero y recien despues borra los
-- comentarios de doble guion.

-- ============================================================================
-- Section 1: aura_transactions.source_type
-- ============================================================================

ALTER TABLE `aura_transactions`
  MODIFY COLUMN `source_type` ENUM(
    'training_completion',
    'attendance',
    'streak_bonus',
    'referral',
    'subscription_discount',
    'manual_adjustment',
    'challenge',
    'social',
    'goal_plan_completion',
    'onboarding_completion',
    'program_week_completion',
    'program_completion',
    'tenure_milestone',
    'extra_block',
    'stretch',
    'profile_photo'
  ) NOT NULL;
--> statement-breakpoint

-- ============================================================================
-- Section 2: aura_config.aura_config_source_type
-- ============================================================================

ALTER TABLE `aura_config`
  MODIFY COLUMN `aura_config_source_type` ENUM(
    'training_completion',
    'attendance',
    'streak_bonus',
    'referral',
    'subscription_discount',
    'manual_adjustment',
    'challenge',
    'social',
    'goal_plan_completion',
    'onboarding_completion',
    'program_week_completion',
    'program_completion',
    'tenure_milestone',
    'extra_block',
    'stretch',
    'profile_photo'
  ) NOT NULL;
--> statement-breakpoint

-- ============================================================================
-- Section 3: Seed de config (monto D-30)
-- Idempotente: INSERT IGNORE sobre el unique de aura_config_source_type.
-- ============================================================================

INSERT IGNORE INTO `aura_config` (`aura_config_source_type`, `default_amount`, `description`, `is_active`)
VALUES ('profile_photo', 5, 'Foto de perfil aprobada', 1);
