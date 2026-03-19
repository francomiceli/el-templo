-- Add EXC (eccentric) variants for 4 HR route exercises.
-- These are identical to their CON versions except effort = 'EXC'.
-- Fixes: tren_superior personalizada generation failure due to missing EXC exercises on HR route.

INSERT INTO exercises (pattern, category, category_secondary, exercise, exercise_2, position, effort, level, code_number, difficulty, dificultad_lineal, route)
VALUES
  ('CORE', 'CORE POSTERIOR', 'ESPINALES', 'ESPINAL CAJON', 'ESPINAL CAJON', NULL, 'EXC', 'alfa', 1, 3, 3, 'HR'),
  ('CORE', 'CORE POSTERIOR', 'ESPINALES', 'ESPINAL JEFFERSON', 'ESPINAL JEFFERSON', NULL, 'EXC', 'delta', 2, 1, 4, 'HR'),
  ('CORE', 'CORE POSTERIOR', 'ESPINALES', 'ESPINAL A 1', 'ESPINAL A 1', NULL, 'EXC', 'sigma', 3, 1, 7, 'HR'),
  ('CORE', 'CORE POSTERIOR', 'ESPINALES', 'ESPINAL A 1 TORSION', 'ESPINAL A 1 TORSION', NULL, 'EXC', 'sigma', 3, 2, 8, 'HR');
