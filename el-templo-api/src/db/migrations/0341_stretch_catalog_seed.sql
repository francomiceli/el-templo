-- 0341_stretch_catalog_seed.sql
-- Fase 213 Estiramiento post-clase (D-02): carga inicial de la lista curada.
--
-- Son los 20 ejercicios de la lista curada del SPEC seccion 4.1, agrupados en
-- 5 familias (LS, MN, FL, TTB, TS). Los 5 con base_order no nulo forman la
-- lista de base, que tiene orden propio (1 CAT COW, 2 PIKE STANDING,
-- 3 QUAD STANDING STRETCH, 4 WALL CHEST STRETCH, 5 STANDING LATERAL STRETCH).
--
-- La lista es la del SPEC sin firma de kinesiologo, por decision de Franco
-- (2026-11-11). Se corrige por migracion cambiando datos, sin tocar codigo
-- (D-02). LAYED DOWN HAM BENT va en MN aunque la base de ejercicios la tenga en
-- LS, porque manda la familia de la lista.
--
-- Solo tenant 1: el metodo es exclusivo de El Templo.
--
-- Idempotente y a prueba de ids equivocados: INSERT IGNORE sobre el UNIQUE de
-- 0340 (tenant_id, exercise_id), y el SELECT filtra por id Y por nombre del
-- ejercicio. Si el id apunta a otro ejercicio, o si la tabla exercises esta
-- vacia (CI), inserta 0 filas y no rompe. Cero datos de prueba (staging y prod
-- comparten servidor MySQL).
--
-- Un statement por fila, separados con el marcador de statement del runner.
-- Un comentario SQL NUNCA debe contener el separador de statements.
--
INSERT IGNORE INTO `stretch_catalog` (tenant_id, exercise_id, exercise_name, family, sort_order, sides, base_order, is_active) SELECT 1, e.id, e.exercise, 'LS', 1, 2, 3, 1 FROM exercises e WHERE e.tenant_id = 1 AND e.id = 4180 AND e.exercise = 'QUAD STANDING STRETCH';
--> statement-breakpoint
INSERT IGNORE INTO `stretch_catalog` (tenant_id, exercise_id, exercise_name, family, sort_order, sides, base_order, is_active) SELECT 1, e.id, e.exercise, 'LS', 2, 2, NULL, 1 FROM exercises e WHERE e.tenant_id = 1 AND e.id = 4182 AND e.exercise = 'SITTED GLUTE STRETCH';
--> statement-breakpoint
INSERT IGNORE INTO `stretch_catalog` (tenant_id, exercise_id, exercise_name, family, sort_order, sides, base_order, is_active) SELECT 1, e.id, e.exercise, 'LS', 3, 2, NULL, 1 FROM exercises e WHERE e.tenant_id = 1 AND e.id = 4188 AND e.exercise = 'WARRIOR STRETCH';
--> statement-breakpoint
INSERT IGNORE INTO `stretch_catalog` (tenant_id, exercise_id, exercise_name, family, sort_order, sides, base_order, is_active) SELECT 1, e.id, e.exercise, 'LS', 4, 2, NULL, 1 FROM exercises e WHERE e.tenant_id = 1 AND e.id = 4184 AND e.exercise = 'LAYED DOWN GLUTE STRETCH';
--> statement-breakpoint
INSERT IGNORE INTO `stretch_catalog` (tenant_id, exercise_id, exercise_name, family, sort_order, sides, base_order, is_active) SELECT 1, e.id, e.exercise, 'LS', 5, 2, NULL, 1 FROM exercises e WHERE e.tenant_id = 1 AND e.id = 4185 AND e.exercise = 'COUCH STRETCH';
--> statement-breakpoint
INSERT IGNORE INTO `stretch_catalog` (tenant_id, exercise_id, exercise_name, family, sort_order, sides, base_order, is_active) SELECT 1, e.id, e.exercise, 'MN', 1, 1, 2, 1 FROM exercises e WHERE e.tenant_id = 1 AND e.id = 3892 AND e.exercise = 'PIKE STANDING';
--> statement-breakpoint
INSERT IGNORE INTO `stretch_catalog` (tenant_id, exercise_id, exercise_name, family, sort_order, sides, base_order, is_active) SELECT 1, e.id, e.exercise, 'MN', 2, 1, NULL, 1 FROM exercises e WHERE e.tenant_id = 1 AND e.id = 3893 AND e.exercise = 'STR PIKE STANDING';
--> statement-breakpoint
INSERT IGNORE INTO `stretch_catalog` (tenant_id, exercise_id, exercise_name, family, sort_order, sides, base_order, is_active) SELECT 1, e.id, e.exercise, 'MN', 3, 2, NULL, 1 FROM exercises e WHERE e.tenant_id = 1 AND e.id = 4181 AND e.exercise = 'LAYED DOWN HAM BENT';
--> statement-breakpoint
INSERT IGNORE INTO `stretch_catalog` (tenant_id, exercise_id, exercise_name, family, sort_order, sides, base_order, is_active) SELECT 1, e.id, e.exercise, 'MN', 4, 2, NULL, 1 FROM exercises e WHERE e.tenant_id = 1 AND e.id = 3897 AND e.exercise = 'STANDING WINDMILL';
--> statement-breakpoint
INSERT IGNORE INTO `stretch_catalog` (tenant_id, exercise_id, exercise_name, family, sort_order, sides, base_order, is_active) SELECT 1, e.id, e.exercise, 'FL', 1, 1, 1, 1 FROM exercises e WHERE e.tenant_id = 1 AND e.id = 3105 AND e.exercise = 'CAT COW';
--> statement-breakpoint
INSERT IGNORE INTO `stretch_catalog` (tenant_id, exercise_id, exercise_name, family, sort_order, sides, base_order, is_active) SELECT 1, e.id, e.exercise, 'FL', 2, 1, NULL, 1 FROM exercises e WHERE e.tenant_id = 1 AND e.id = 3106 AND e.exercise = 'TABLE';
--> statement-breakpoint
INSERT IGNORE INTO `stretch_catalog` (tenant_id, exercise_id, exercise_name, family, sort_order, sides, base_order, is_active) SELECT 1, e.id, e.exercise, 'FL', 3, 1, NULL, 1 FROM exercises e WHERE e.tenant_id = 1 AND e.id = 3108 AND e.exercise = 'SHOULDER BRIDGE';
--> statement-breakpoint
INSERT IGNORE INTO `stretch_catalog` (tenant_id, exercise_id, exercise_name, family, sort_order, sides, base_order, is_active) SELECT 1, e.id, e.exercise, 'FL', 4, 1, NULL, 1 FROM exercises e WHERE e.tenant_id = 1 AND e.id = 3111 AND e.exercise = 'SEAL REPS';
--> statement-breakpoint
INSERT IGNORE INTO `stretch_catalog` (tenant_id, exercise_id, exercise_name, family, sort_order, sides, base_order, is_active) SELECT 1, e.id, e.exercise, 'FL', 5, 2, NULL, 1 FROM exercises e WHERE e.tenant_id = 1 AND e.id = 3109 AND e.exercise = 'TABLE TWIST';
--> statement-breakpoint
INSERT IGNORE INTO `stretch_catalog` (tenant_id, exercise_id, exercise_name, family, sort_order, sides, base_order, is_active) SELECT 1, e.id, e.exercise, 'TTB', 1, 2, 5, 1 FROM exercises e WHERE e.tenant_id = 1 AND e.id = 3284 AND e.exercise = 'STANDING LATERAL STRETCH';
--> statement-breakpoint
INSERT IGNORE INTO `stretch_catalog` (tenant_id, exercise_id, exercise_name, family, sort_order, sides, base_order, is_active) SELECT 1, e.id, e.exercise, 'TS', 1, 2, 4, 1 FROM exercises e WHERE e.tenant_id = 1 AND e.id = 5090 AND e.exercise = 'WALL CHEST STRETCH';
--> statement-breakpoint
INSERT IGNORE INTO `stretch_catalog` (tenant_id, exercise_id, exercise_name, family, sort_order, sides, base_order, is_active) SELECT 1, e.id, e.exercise, 'TS', 2, 1, NULL, 1 FROM exercises e WHERE e.tenant_id = 1 AND e.id = 4474 AND e.exercise = 'BUTCHER FLOOR STRETCH';
--> statement-breakpoint
INSERT IGNORE INTO `stretch_catalog` (tenant_id, exercise_id, exercise_name, family, sort_order, sides, base_order, is_active) SELECT 1, e.id, e.exercise, 'TS', 3, 1, NULL, 1 FROM exercises e WHERE e.tenant_id = 1 AND e.id = 4610 AND e.exercise = 'LAY DOWN ARMS UP';
--> statement-breakpoint
INSERT IGNORE INTO `stretch_catalog` (tenant_id, exercise_id, exercise_name, family, sort_order, sides, base_order, is_active) SELECT 1, e.id, e.exercise, 'TS', 4, 1, NULL, 1 FROM exercises e WHERE e.tenant_id = 1 AND e.id = 4872 AND e.exercise = 'COBRA STRETCH';
--> statement-breakpoint
INSERT IGNORE INTO `stretch_catalog` (tenant_id, exercise_id, exercise_name, family, sort_order, sides, base_order, is_active) SELECT 1, e.id, e.exercise, 'TS', 5, 1, NULL, 1 FROM exercises e WHERE e.tenant_id = 1 AND e.id = 4818 AND e.exercise = 'ANGELS AND DEMONS';
