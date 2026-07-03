-- PROF-DATA follow-up -- split the single post-class rating into two explicit
-- dimensions PROFE and CLASE. The existing `stars` column stays as the PROFE
-- rating that backs /puntuaciones (per-coach average). The new `class_stars`
-- column is the CLASE rating that backs the "Clases" analytics tab (trend plus
-- branch plus turno breakdowns).
--
-- Comment safety (Phase 103-01 invariant, same as 0141)
--   The migration runner splits this file on semicolons BEFORE stripping line
--   comments, so no semicolon character may appear inside any comment line.
--
-- Escrita A MANO db:generate choca con el drift interactivo pre-existente de
-- sessions.goal_plan_type (igual que 0154/0158/0161/0163) y meta/_journal.json
-- esta desactualizado. Siguiente numero secuencial es 0164 (ultima aplicada
-- 0163). NUNCA drizzle-kit push o migrate -- la tabla _migrations es la fuente
-- de verdad.
--
-- NULLABLE a proposito las filas historicas (previas al split) no tienen nota
-- de clase, quedan en NULL y su `stars` se preserva como historial del profe. El
-- service exige class_stars 1-5 en todo submit NUEVO (schema mas validacion), no
-- a nivel DB. El nombre coincide byte-for-byte con coach-ratings.ts (classStars).

ALTER TABLE `coach_ratings`
  ADD COLUMN `class_stars` tinyint NULL AFTER `stars`;
