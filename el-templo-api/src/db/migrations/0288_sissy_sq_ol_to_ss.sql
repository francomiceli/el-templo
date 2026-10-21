-- 0288_sissy_sq_ol_to_ss.sql
-- Fase 200 (Anatomia funcional), decision D2: los cinco ejercicios SISSY SQ OL
-- venian del CSV con la ruta vacia. Pasan a la ruta SS (Sissy Squat).
-- Efecto en el generador: los 5 entran al pool de SS (estrategia linear por
-- dificultad_lineal 9-11, omega/spartan) porque el generador filtra por
-- exercises.route. El grafo de progresiones (exercise_progressions) no se
-- reconstruye aca: queda para correr rebuild-progression-graph.ts si se quiere
-- que tengan vecinos en el ajuste dentro de la sesion y en el arbol.
-- Escrita a mano (db:generate roto por deriva de goal_plan_type).
-- Idempotente: tras la primera corrida la ruta ya no esta vacia y no matchea.
-- Apunta por nombre + ruta vacia + categoria + tenant, nunca por id (los ids difieren entre local y prod).
-- Sin punto y coma dentro de los comentarios (el runner splittea antes de strippear).

UPDATE exercises SET route = 'SS' WHERE tenant_id = 1 AND TRIM(route) = '' AND TRIM(exercise) LIKE 'SISSY SQ OL%' AND TRIM(category) = 'KNEE DOMINANT';
