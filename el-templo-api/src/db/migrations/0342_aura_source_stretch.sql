-- Migration 0342: Aura source type 'stretch'
-- Fase 213 D-08: fuente nueva para el estiramiento post-clase.
--
-- Agrega el valor 'stretch' AL FINAL del enum en las dos tablas de Aura.
-- Completar el estiramiento suma 5 Aura una sola vez por dia, solo si el socio
-- marco todos los estiramientos y pasaron al menos 3 minutos medidos por el
-- servidor. El candado "uno por dia" es el unique unique_user_source_ref de
-- aura_transactions con reference_type='stretch_day' y reference_id = fecha
-- local de la sede como entero YYYYMMDD.
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
    'stretch'
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
    'stretch'
  ) NOT NULL;
--> statement-breakpoint

-- ============================================================================
-- Section 3: Seed de config (monto D-08)
-- Idempotente: INSERT IGNORE sobre el unique de aura_config_source_type.
-- ============================================================================

INSERT IGNORE INTO `aura_config` (`aura_config_source_type`, `default_amount`, `description`, `is_active`)
VALUES ('stretch', 5, 'Estiramiento post-clase del día', 1);
