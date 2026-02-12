-- Add exercises_completed JSON column to completed_sessions
-- Phase 16-06: Per-exercise completion tracking
-- Format: { "NUCLEUS": [123, 456], "DEUTEROS_1": [789] } maps block role to completed prescription IDs

ALTER TABLE completed_sessions ADD COLUMN exercises_completed JSON;
