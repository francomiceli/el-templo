-- Rework "Progresión por ruta + Habilidad" (reemplaza el modelo de sub-familia).
-- Migración ADITIVA sobre 0137/0138 (que pudieron ya aplicarse al server de
-- staging) -- por eso NO se reescriben esas migraciones, se dropea lo viejo aquí.
--
-- Cambios:
--   exercises   -- drop subfamily_id (+ FK + index) y leverage
--               -- add progression_step INT NULL (rank del escalón por ruta)
--               -- add habilidad VARCHAR(100) NULL (variante paralela)
--   exercise_subfamilies          -- drop (deja de ser eje)
--   routes      -- add excluded_from_tree TINYINT(1) (movilidad/games fuera del árbol)
--               -- completar las rutas faltantes y sembrar el flag de exclusión
--   exercise_dimension_proposals  -- proposed_subfamily/leverage -> proposed_step/habilidad
--
-- Reversibilidad: aditiva-equivalente -- el rollback recrea exercise_subfamilies,
-- las columnas subfamily_id/leverage y las columnas proposed_subfamily/leverage,
-- y dropea progression_step/habilidad/excluded_from_tree. No altera filas de
-- catálogo (route/dificultad_lineal/canonical/route_pending intactos).
--
-- Comment safety (Phase 103-01 invariant): el runner splittea por punto y coma
-- ANTES de strippear los comentarios de línea, así que ningún comentario lleva
-- ese caracter. Cada statement termina con un único terminador en su propia línea.
--
-- Hand-written SQL (drizzle-kit meta journal desincronizado, mismo patrón que
-- 0108, 0111, 0121, 0125, 0137, 0138, 0139).

ALTER TABLE exercises
  DROP FOREIGN KEY exercises_subfamily_id_exercise_subfamilies_id_fk;

DROP INDEX exercises_subfamily_idx ON exercises;

ALTER TABLE exercises
  DROP COLUMN subfamily_id;

ALTER TABLE exercises
  DROP COLUMN leverage;

DROP TABLE exercise_subfamilies;

ALTER TABLE exercises
  ADD COLUMN progression_step INT NULL DEFAULT NULL AFTER route;

ALTER TABLE exercises
  ADD COLUMN habilidad VARCHAR(100) NULL DEFAULT NULL AFTER progression_step;

CREATE INDEX exercises_route_step_idx ON exercises(route, progression_step);

ALTER TABLE routes
  ADD COLUMN excluded_from_tree TINYINT(1) NOT NULL DEFAULT 0;

INSERT IGNORE INTO routes (code, display_name, excluded_from_tree) VALUES
  ('SPAGAT', 'Spagat', 1),
  ('BRIDGE', 'Bridge', 1),
  ('PIKE', 'Pike', 1),
  ('AF', 'Animal Flow', 1),
  ('SIDE PCK', 'Side Pike Compression', 0),
  ('REVERSE HYPER', 'Reverse Hyper', 0);

UPDATE routes SET excluded_from_tree = 1 WHERE code IN ('SPAGAT', 'BRIDGE', 'PIKE', 'HS', 'AF', 'HR');

ALTER TABLE exercise_dimension_proposals
  DROP COLUMN proposed_subfamily;

ALTER TABLE exercise_dimension_proposals
  DROP COLUMN proposed_leverage;

ALTER TABLE exercise_dimension_proposals
  ADD COLUMN proposed_step INT NULL DEFAULT NULL AFTER exercise_id;

ALTER TABLE exercise_dimension_proposals
  ADD COLUMN proposed_habilidad VARCHAR(100) NULL DEFAULT NULL AFTER proposed_step;
