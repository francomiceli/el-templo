-- Migration 0285: Aura source type 'extra_block'
-- Fase 197 D-12: fuente nueva para el bloque libre de la tab Libre de Entrenar.
--
-- Agrega el valor 'extra_block' al enum source_type en las dos tablas de Aura.
-- El primer bloque libre del dia que llega a 10 minutos suma 5 Aura. El candado
-- "uno por dia" es el unique unique_user_source_ref de aura_transactions con
-- reference_type='extra_block_day' y reference_id = fecha local de la sede como
-- entero YYYYMMDD: el segundo intento del mismo dia falla y se captura.
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
-- Numeracion: 0285 porque la 0284 queda reservada para la fase 196.
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
    'extra_block'
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
    'extra_block'
  ) NOT NULL;
--> statement-breakpoint

-- ============================================================================
-- Section 3: Seed de config (monto decidido por Franco, D-12)
-- Idempotente: INSERT IGNORE sobre el unique de aura_config_source_type.
-- ============================================================================

INSERT IGNORE INTO `aura_config` (`aura_config_source_type`, `default_amount`, `description`, `is_active`)
VALUES ('extra_block', 5, 'Bloque libre del día (primero que llega a 10 minutos)', 1);
