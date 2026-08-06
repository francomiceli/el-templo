-- Migration 0198: Aura source type 'tenure_milestone'
-- Feature: Avisos de aniversarios de permanencia (3m, 6m, 1 año, anuales).
--
-- Agrega el valor 'tenure_milestone' al enum source_type en las dos tablas de
-- Aura, para que el job diario pueda registrar el regalo de puntos por hito de
-- antiguedad. El asiento en aura_transactions con
-- reference_type='tenure_milestone' y reference_id=<meses> es ademas el candado
-- de idempotencia (unique unique_user_source_ref): garantiza que cada hito
-- regala Aura y dispara el push una sola vez, sin tabla de logros aparte.
--
-- El nombre fisico de la columna difiere por tabla (mysqlEnum 1er-arg = nombre
-- de columna): source_type en aura_transactions, aura_config_source_type en
-- aura_config.

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
    'tenure_milestone'
  ) NOT NULL;

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
    'tenure_milestone'
  ) NOT NULL;

-- ============================================================================
-- Section 3: Seed de config (consistencia con el resto de las fuentes)
-- El monto REAL por hito vive en codigo (milestoneAura: 3m=50, 6m=100,
-- 1 año+=250) y el job SIEMPRE lo pasa explicito, asi que este default_amount
-- de 0 nunca se usa. La fila existe solo para que la fuente aparezca en
-- cualquier listado de aura_config. tenant_id toma el DEFAULT 1.
-- ============================================================================

INSERT IGNORE INTO `aura_config` (`aura_config_source_type`, `default_amount`, `description`, `is_active`)
VALUES ('tenure_milestone', 0, 'Aniversario de permanencia (monto real por hito en codigo)', 1);
