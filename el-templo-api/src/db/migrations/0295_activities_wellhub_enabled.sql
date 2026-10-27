-- 0295_activities_wellhub_enabled.sql
-- Wellhub (2026-10-22, decision de Franco): se publica en Wellhub solo General.
-- Tecnica y Combos son rutas dentro de General, no actividades. ROM y Open Gym quedan afuera.
-- Hasta hoy el sync publicaba toda actividad activa no especial.
-- wellhub_enabled es opt-in por actividad, NOT NULL DEFAULT 0 (las actividades nuevas no se publican).
-- El UPDATE apunta por nombre + tenant, nunca por id (los ids difieren entre local, staging y prod).
-- Idempotente: re-correr el UPDATE deja el mismo valor.
-- Escrita a mano (db:generate roto por deriva de goal_plan_type).
-- Sin punto y coma dentro de los comentarios (el runner splittea antes de strippear).

ALTER TABLE activities ADD COLUMN wellhub_enabled BOOLEAN NOT NULL DEFAULT 0;

UPDATE activities SET wellhub_enabled = 1 WHERE tenant_id = 1 AND name = 'General';
