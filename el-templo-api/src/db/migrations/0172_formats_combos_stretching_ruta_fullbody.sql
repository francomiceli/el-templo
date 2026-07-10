-- @data-only
-- v5.6 (primera tanda chica): formatos "Combos" y "Stretching" + ruta FULLBODY
-- Combos: reemplaza el uso de Complex para los dias de combos (rondas y reps editables)
-- Stretching: reemplaza el uso de Flow Guiado para bloques de solo movilidad
-- FULLBODY: ruta que acepta todos los ejercicios en el pool del bloque
--   (special-case en exercise-swap-service, como INITIUM) y queda fuera del
--   arbol de progresion (excluded_from_tree=1)
-- Idempotente: cada insert se saltea si la fila ya existe

INSERT INTO formats (name, type, description)
SELECT 'Combos', 'Technical', 'Combo de ejercicios encadenados sin descanso, rondas y reps editables'
WHERE NOT EXISTS (SELECT 1 FROM formats WHERE name = 'Combos');

INSERT INTO formats (name, type, description)
SELECT 'Stretching', 'Technical', 'Bloque de estiramiento / movilidad guiada, sin prescripcion de reps'
WHERE NOT EXISTS (SELECT 1 FROM formats WHERE name = 'Stretching');

INSERT INTO routes (code, display_name, excluded_from_tree)
SELECT 'FULLBODY', 'Full Body', 1
WHERE NOT EXISTS (SELECT 1 FROM routes WHERE code = 'FULLBODY');
