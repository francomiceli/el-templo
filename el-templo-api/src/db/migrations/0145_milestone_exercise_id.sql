-- Phase 133 Plan 01 (R1-MIG) -- eje hito/variante.
--   exercises                     -- add milestone_exercise_id INT NULL (self-FK)
--                                 -- NULL = hito o sin clasificar (backbone)
--                                 -- NOT NULL = variante colgando del hito apuntado
--   exercise_milestone_proposals  -- new table holding PENDING heuristic proposals
--
-- La heurística/bootstrap inserta SOLO filas pending en la tabla de propuestas.
-- La columna truth exercises.milestone_exercise_id se escribe únicamente cuando
-- un profe acepta una propuesta (accept transaccional). El default NULL no
-- altera ningún node-set del backbone hasta ese momento.
--
-- FK rules
--   exercises.milestone_exercise_id  -- self-FK ON DELETE SET NULL (la variante
--                                       huérfana vuelve a hito, nunca cuelga)
--   proposals.exercise_id            -- ON DELETE CASCADE (la propuesta no tiene
--                                       peso histórico sin su ejercicio)
--   proposals.proposed_milestone_exercise_id -- ON DELETE SET NULL (degrada a
--                                       "propuesto como hito")
--
-- Idempotency at the data layer
--   UNIQUE KEY sobre exercise_id en la tabla de propuestas garantiza "a lo sumo
--   una propuesta viva por ejercicio", respaldando el guard NOT-EXISTS del
--   bootstrap para que sea idempotente/reanudable.
--
-- Reversibilidad
--   Rollback: DROP FOREIGN KEY exercises_milestone_exercise_id_exercises_id_fk,
--   DROP INDEX exercises_milestone_idx, DROP COLUMN milestone_exercise_id y
--   DROP TABLE exercise_milestone_proposals. DDL puramente aditivo -- no altera
--   ni borra filas existentes, el rollback es lossless.
--
-- FK convention
--   exercises_milestone_exercise_id_exercises_id_fk sigue la convención Drizzle
--   <tabla>_<col>_<reftabla>_<refcol>_fk. Para proposed_milestone_exercise_id el
--   nombre completo Drizzle-convergente excede el límite de 64 chars de MySQL,
--   por eso se usa el acortado exercise_milestone_proposals_proposed_milestone_exercise_id_fk
--   (62 chars).
--
-- Comment safety (Phase 103-01 invariant): el runner splittea por punto y coma
-- ANTES de strippear los comentarios de línea, así que ningún comentario lleva
-- ese caracter. Cada statement termina con un único terminador en su propia línea.
--
-- Hand-written SQL (drizzle-kit meta journal desincronizado, mismo patrón que
-- 0108, 0111, 0121, 0125, 0137, 0138, 0139, 0143).

ALTER TABLE exercises
  ADD COLUMN milestone_exercise_id INT NULL DEFAULT NULL AFTER canonical_exercise_id;

CREATE INDEX exercises_milestone_idx ON exercises(milestone_exercise_id);

ALTER TABLE exercises
  ADD CONSTRAINT exercises_milestone_exercise_id_exercises_id_fk
    FOREIGN KEY (milestone_exercise_id) REFERENCES exercises(id) ON DELETE SET NULL;

CREATE TABLE exercise_milestone_proposals (
  id INT NOT NULL AUTO_INCREMENT,
  exercise_id INT NOT NULL,
  proposed_milestone_exercise_id INT NULL DEFAULT NULL,
  movement_token VARCHAR(100) NULL DEFAULT NULL,
  step_rank INT NULL DEFAULT NULL,
  status ENUM('pending','accepted','rejected') NOT NULL DEFAULT 'pending',
  engine VARCHAR(30) NOT NULL,
  confidence INT NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY exercise_milestone_proposals_exercise_uq (exercise_id),
  INDEX exercise_milestone_proposals_status_idx (status),
  CONSTRAINT exercise_milestone_proposals_exercise_id_exercises_id_fk
    FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE CASCADE,
  CONSTRAINT exercise_milestone_proposals_proposed_milestone_exercise_id_fk
    FOREIGN KEY (proposed_milestone_exercise_id) REFERENCES exercises(id) ON DELETE SET NULL
);
