-- 0293_conquer_catalogo_anexo.sql
-- Fase 201 (Conquer v2), plan 201-25: alinea el catalogo con el anexo de Nacho
-- (conquer-catalogo.md), hallazgo 3 del UAT local.
--
-- La 0292 sembro la sintesis (8 escaleras compartidas, offset de peldanos para
-- Novillo y Ternero). El anexo es mas fino y manda. Esta migracion NUEVA lo
-- aplica sin tocar la 0292, que ya esta aplicada en la base local de Franco
-- (DA-1).
--
-- Resumen de decisiones:
--   DA-2  una escalera por ejercicio. Se crean 6 y palanca queda solo para los
--         combos. La escalera lsit queda inactiva y ninguna fila se borra.
--   DA-3  conquer_exercises.hold_ladder_id: escalera propia del hold final.
--         NULL significa que el hold usa la escalera de E1 a E3.
--   DA-4  conquer_exercises.brazos_rectos: la marca vive en el ejercicio. La
--         columna conquer_rungs.brazos_rectos queda sin uso.
--   DA-5  start_steps_novillo y start_steps_ternero: tablas explicitas del
--         anexo, reemplazan el offset de peldanos.
--   DA-6  musculos del anexo mapeados a las zonas de BodyFigure como la fase 200.
--   DA-8  remapeo de conquer_steps y conquer_session_steps existentes: mismo
--         code en la escalera nueva y si no existe, el peldano activo mas facil.
--
-- Orden: A DDL, B escaleras, C peldanos, D ejercicios, E finishers, F remapeo.
--
-- Solo tenant 1. Idempotente en datos (INSERT IGNORE y UPDATE con el mismo
-- resultado). Los ALTER van primero: si el runner corta a mitad, el reintento
-- pega Duplicate column name y sigue. Ids resueltos por code, nunca fijos. Cero
-- datos de prueba (staging y prod comparten servidor MySQL).
--
-- Un statement de datos por linea, con el marcador de statement del runner
-- entre statements. Un comentario SQL nunca debe contener el separador de
-- statements ni un literal de texto con ese caracter.
--
ALTER TABLE `conquer_exercises` ADD COLUMN `hold_ladder_id` int DEFAULT NULL;
--> statement-breakpoint
ALTER TABLE `conquer_exercises` ADD COLUMN `brazos_rectos` boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE `conquer_exercises` ADD COLUMN `start_steps_novillo` json DEFAULT NULL;
--> statement-breakpoint
ALTER TABLE `conquer_exercises` ADD COLUMN `start_steps_ternero` json DEFAULT NULL;
--> statement-breakpoint
ALTER TABLE `conquer_exercises` ADD CONSTRAINT `conquer_exercises_hold_ladder_id_conquer_ladders_id_fk` FOREIGN KEY (`hold_ladder_id`) REFERENCES `conquer_ladders` (`id`);
--> statement-breakpoint
INSERT IGNORE INTO conquer_ladders (tenant_id, code, name, sort_order, is_active) VALUES (1, 'planche_hold', 'Planche hold', 1, 1);
--> statement-breakpoint
INSERT IGNORE INTO conquer_ladders (tenant_id, code, name, sort_order, is_active) VALUES (1, 'planche_press', 'Planche press', 2, 1);
--> statement-breakpoint
INSERT IGNORE INTO conquer_ladders (tenant_id, code, name, sort_order, is_active) VALUES (1, 'lsit_plancha', 'L-sit a plancha', 3, 1);
--> statement-breakpoint
INSERT IGNORE INTO conquer_ladders (tenant_id, code, name, sort_order, is_active) VALUES (1, 'front_hold', 'Front lever hold', 4, 1);
--> statement-breakpoint
INSERT IGNORE INTO conquer_ladders (tenant_id, code, name, sort_order, is_active) VALUES (1, 'front_pullups', 'Pull-ups en front lever', 5, 1);
--> statement-breakpoint
INSERT IGNORE INTO conquer_ladders (tenant_id, code, name, sort_order, is_active) VALUES (1, 'front_raises', 'Front lever raises', 6, 1);
--> statement-breakpoint
INSERT IGNORE INTO conquer_ladders (tenant_id, code, name, sort_order, is_active) VALUES (1, 'hspu_hold', 'HSPU · hold final', 13, 1);
--> statement-breakpoint
INSERT IGNORE INTO conquer_ladders (tenant_id, code, name, sort_order, is_active) VALUES (1, 'press_90_hold', '90° press · hold final', 14, 1);
--> statement-breakpoint
INSERT IGNORE INTO conquer_ladders (tenant_id, code, name, sort_order, is_active) VALUES (1, 'planche_pushup_hold', 'Planche push-up · hold final', 15, 1);
--> statement-breakpoint
INSERT IGNORE INTO conquer_ladders (tenant_id, code, name, sort_order, is_active) VALUES (1, 'one_arm_archer_hold', 'One arm / archer · hold final', 16, 1);
--> statement-breakpoint
INSERT IGNORE INTO conquer_ladders (tenant_id, code, name, sort_order, is_active) VALUES (1, 'muscle_up_hold', 'Muscle-up · hold final', 17, 1);
--> statement-breakpoint
INSERT IGNORE INTO conquer_ladders (tenant_id, code, name, sort_order, is_active) VALUES (1, 'fondo_pelicano_hold', 'Fondo a pelícano · hold final', 18, 1);
--> statement-breakpoint
UPDATE conquer_ladders SET name = 'HSPU', sort_order = 7, is_active = 1 WHERE tenant_id = 1 AND code = 'hspu';
--> statement-breakpoint
UPDATE conquer_ladders SET name = '90° press', sort_order = 8, is_active = 1 WHERE tenant_id = 1 AND code = 'p90';
--> statement-breakpoint
UPDATE conquer_ladders SET name = 'Planche push-up', sort_order = 9, is_active = 1 WHERE tenant_id = 1 AND code = 'ppu';
--> statement-breakpoint
UPDATE conquer_ladders SET name = 'One arm / archer', sort_order = 10, is_active = 1 WHERE tenant_id = 1 AND code = 'trac';
--> statement-breakpoint
UPDATE conquer_ladders SET name = 'Muscle-up', sort_order = 11, is_active = 1 WHERE tenant_id = 1 AND code = 'mu';
--> statement-breakpoint
UPDATE conquer_ladders SET name = 'Fondo a pelícano', sort_order = 12, is_active = 1 WHERE tenant_id = 1 AND code = 'fondo';
--> statement-breakpoint
UPDATE conquer_ladders SET name = 'Palanca (combos)', sort_order = 19, is_active = 1 WHERE tenant_id = 1 AND code = 'palanca';
--> statement-breakpoint
UPDATE conquer_ladders SET name = 'L-sit a plancha (sin uso)', sort_order = 20, is_active = 0 WHERE tenant_id = 1 AND code = 'lsit';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'full', 'full', 0, 1, 0, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'planche_hold';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'half_lay', 'half lay', 1, 1, 0, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'planche_hold';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'straddle', 'straddle', 2, 1, 0, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'planche_hold';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'super_adv_tuck', 'super adv tuck', 3, 1, 0, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'planche_hold';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'adv_tuck', 'adv tuck', 4, 1, 0, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'planche_hold';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'tuck', 'tuck', 5, 1, 0, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'planche_hold';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'lean', 'lean', 6, 1, 0, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'planche_hold';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'full', 'full', 0, 1, 0, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'planche_press';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'half_lay', 'half lay', 1, 1, 0, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'planche_press';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'straddle', 'straddle', 2, 1, 0, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'planche_press';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'super_adv_tuck', 'super adv tuck', 3, 1, 0, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'planche_press';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'adv_tuck', 'adv tuck', 4, 1, 0, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'planche_press';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'tuck', 'tuck', 5, 1, 0, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'planche_press';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'lean', 'lean', 6, 1, 0, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'planche_press';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'a_full', 'a full', 0, 1, 0, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'lsit_plancha';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'a_half_lay', 'a half lay', 1, 1, 0, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'lsit_plancha';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'a_straddle', 'a straddle', 2, 1, 0, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'lsit_plancha';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'a_super_adv_tuck', 'a super adv tuck', 3, 1, 0, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'lsit_plancha';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'a_adv_tuck', 'a adv tuck', 4, 1, 0, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'lsit_plancha';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'a_tuck', 'a tuck', 5, 1, 0, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'lsit_plancha';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'a_lean', 'a lean', 6, 1, 0, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'lsit_plancha';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'full', 'full', 0, 1, 0, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'front_hold';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'half_lay', 'half lay', 1, 1, 0, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'front_hold';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'straddle', 'straddle', 2, 1, 0, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'front_hold';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'super_adv_tuck', 'super adv tuck', 3, 1, 0, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'front_hold';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'adv_tuck', 'adv tuck', 4, 1, 0, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'front_hold';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'tuck', 'tuck', 5, 1, 0, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'front_hold';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'full', 'full', 0, 0, 0, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'front_pullups';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'half_lay', 'half lay', 1, 0, 0, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'front_pullups';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'straddle', 'straddle', 2, 0, 0, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'front_pullups';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'super_adv_tuck', 'super adv tuck', 3, 0, 0, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'front_pullups';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'adv_tuck', 'adv tuck', 4, 0, 0, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'front_pullups';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'tuck', 'tuck', 5, 0, 0, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'front_pullups';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'full', 'full', 0, 1, 0, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'front_raises';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'half_lay', 'half lay', 1, 1, 0, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'front_raises';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'straddle', 'straddle', 2, 1, 0, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'front_raises';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'super_adv_tuck', 'super adv tuck', 3, 1, 0, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'front_raises';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'adv_tuck', 'adv tuck', 4, 1, 0, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'front_raises';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'tuck', 'tuck', 5, 1, 0, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'front_raises';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'vertical_libre', 'vertical libre', 0, 0, 0, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'hspu_hold';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'vertical_en_pared', 'vertical en pared', 1, 0, 0, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'hspu_hold';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'pike', 'pike', 2, 0, 0, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'hspu_hold';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'full', 'full', 0, 0, 0, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'press_90_hold';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'half_lay', 'half lay', 1, 0, 0, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'press_90_hold';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'straddle', 'straddle', 2, 0, 0, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'press_90_hold';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'super_adv_tuck', 'super adv tuck', 3, 0, 0, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'press_90_hold';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'adv_tuck', 'adv tuck', 4, 0, 0, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'press_90_hold';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'tuck', 'tuck', 5, 0, 0, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'press_90_hold';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'full', 'full', 0, 0, 0, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'planche_pushup_hold';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'straddle', 'straddle', 1, 0, 0, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'planche_pushup_hold';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'super_adv_tuck', 'super adv tuck', 2, 0, 0, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'planche_pushup_hold';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'adv_tuck', 'adv tuck', 3, 0, 0, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'planche_pushup_hold';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'tuck', 'tuck', 4, 0, 0, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'planche_pushup_hold';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'pseudo', 'pseudo', 5, 0, 0, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'planche_pushup_hold';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'one_arm', 'one arm', 0, 0, 1, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'one_arm_archer_hold';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'dominada', 'dominada', 1, 0, 0, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'one_arm_archer_hold';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'estricto', 'estricto', 0, 0, 0, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'muscle_up_hold';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'dominada', 'dominada', 1, 0, 0, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'muscle_up_hold';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'pelicano', 'pelícano', 0, 0, 0, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'fondo_pelicano_hold';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'anillas', 'anillas', 1, 0, 0, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'fondo_pelicano_hold';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'paralelas', 'paralelas', 2, 0, 0, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'fondo_pelicano_hold';
--> statement-breakpoint
UPDATE conquer_exercises SET ladder_id = (SELECT l.id FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'planche_hold'), hold_ladder_id = NULL, brazos_rectos = 1, muscles = '[{"zone":"deltoids","role":"principal"},{"zone":"chest","role":"principal"},{"zone":"biceps","role":"secundario"},{"zone":"abs","role":"secundario"},{"zone":"triceps","role":"secundario"}]', start_steps_novillo = '[{"step":"e1","rung":"half_lay","mode":"hold"},{"step":"e2","rung":"super_adv_tuck","mode":"hold"},{"step":"e3","rung":"tuck","mode":"hold"},{"step":"hold","rung":"lean","mode":"hold"}]', start_steps_ternero = '[{"step":"e1","rung":"straddle","mode":"hold"},{"step":"e2","rung":"adv_tuck","mode":"hold"},{"step":"e3","rung":"lean","mode":"hold"},{"step":"hold","rung":"lean","mode":"hold"}]' WHERE tenant_id = 1 AND code = 'planche_hold';
--> statement-breakpoint
UPDATE conquer_exercises SET ladder_id = (SELECT l.id FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'planche_press'), hold_ladder_id = NULL, brazos_rectos = 1, muscles = '[{"zone":"deltoids","role":"principal"},{"zone":"trapezius","role":"secundario"},{"zone":"chest","role":"secundario"},{"zone":"abs","role":"secundario"}]', start_steps_novillo = '[{"step":"e1","rung":"lean","mode":"completa"},{"step":"e2","rung":"lean","mode":"negativa"},{"step":"e3","rung":"lean","mode":"completa"},{"step":"hold","rung":"lean","mode":"hold"}]', start_steps_ternero = '[{"step":"e1","rung":"lean","mode":"completa"},{"step":"e2","rung":"lean","mode":"negativa"},{"step":"e3","rung":"lean","mode":"completa"},{"step":"hold","rung":"lean","mode":"hold"}]' WHERE tenant_id = 1 AND code = 'planche_press';
--> statement-breakpoint
UPDATE conquer_exercises SET ladder_id = (SELECT l.id FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'lsit_plancha'), hold_ladder_id = NULL, brazos_rectos = 1, muscles = '[{"zone":"deltoids","role":"principal"},{"zone":"abs","role":"principal"},{"zone":"chest","role":"secundario"},{"zone":"triceps","role":"secundario"}]', start_steps_novillo = '[{"step":"e1","rung":"a_lean","mode":"completa"},{"step":"e2","rung":"a_lean","mode":"negativa"},{"step":"e3","rung":"a_lean","mode":"completa"},{"step":"hold","rung":"a_lean","mode":"hold"}]', start_steps_ternero = '[{"step":"e1","rung":"a_lean","mode":"completa"},{"step":"e2","rung":"a_lean","mode":"negativa"},{"step":"e3","rung":"a_lean","mode":"completa"},{"step":"hold","rung":"a_lean","mode":"hold"}]' WHERE tenant_id = 1 AND code = 'lsit_plancha';
--> statement-breakpoint
UPDATE conquer_exercises SET ladder_id = (SELECT l.id FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'front_hold'), hold_ladder_id = NULL, brazos_rectos = 1, muscles = '[{"zone":"upper-back","role":"principal"},{"zone":"deltoids","role":"principal"},{"zone":"biceps","role":"secundario"},{"zone":"abs","role":"secundario"}]', start_steps_novillo = '[{"step":"e1","rung":"half_lay","mode":"hold"},{"step":"e2","rung":"super_adv_tuck","mode":"hold"},{"step":"e3","rung":"tuck","mode":"hold"},{"step":"hold","rung":"tuck","mode":"hold"}]', start_steps_ternero = '[{"step":"e1","rung":"straddle","mode":"hold"},{"step":"e2","rung":"adv_tuck","mode":"hold"},{"step":"e3","rung":"tuck","mode":"hold"},{"step":"hold","rung":"tuck","mode":"hold"}]' WHERE tenant_id = 1 AND code = 'front_hold';
--> statement-breakpoint
UPDATE conquer_exercises SET ladder_id = (SELECT l.id FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'front_pullups'), hold_ladder_id = NULL, brazos_rectos = 0, muscles = '[{"zone":"upper-back","role":"principal"},{"zone":"biceps","role":"principal"},{"zone":"deltoids","role":"secundario"},{"zone":"abs","role":"secundario"}]', start_steps_novillo = '[{"step":"e1","rung":"tuck","mode":"completa"},{"step":"e2","rung":"tuck","mode":"negativa"},{"step":"e3","rung":"tuck","mode":"completa"},{"step":"hold","rung":"tuck","mode":"hold"}]', start_steps_ternero = '[{"step":"e1","rung":"tuck","mode":"completa"},{"step":"e2","rung":"tuck","mode":"negativa"},{"step":"e3","rung":"tuck","mode":"completa"},{"step":"hold","rung":"tuck","mode":"hold"}]' WHERE tenant_id = 1 AND code = 'front_pullups';
--> statement-breakpoint
UPDATE conquer_exercises SET ladder_id = (SELECT l.id FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'front_raises'), hold_ladder_id = NULL, brazos_rectos = 1, muscles = '[{"zone":"upper-back","role":"principal"},{"zone":"abs","role":"principal"},{"zone":"deltoids","role":"secundario"}]', start_steps_novillo = '[{"step":"e1","rung":"super_adv_tuck","mode":"completa"},{"step":"e2","rung":"super_adv_tuck","mode":"negativa"},{"step":"e3","rung":"tuck","mode":"completa"},{"step":"hold","rung":"tuck","mode":"hold"}]', start_steps_ternero = '[{"step":"e1","rung":"adv_tuck","mode":"completa"},{"step":"e2","rung":"adv_tuck","mode":"negativa"},{"step":"e3","rung":"tuck","mode":"completa"},{"step":"hold","rung":"tuck","mode":"hold"}]' WHERE tenant_id = 1 AND code = 'front_raises';
--> statement-breakpoint
UPDATE conquer_exercises SET ladder_id = (SELECT l.id FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'hspu'), hold_ladder_id = (SELECT h.id FROM conquer_ladders h WHERE h.tenant_id = 1 AND h.code = 'hspu_hold'), brazos_rectos = 0, muscles = '[{"zone":"deltoids","role":"principal"},{"zone":"triceps","role":"principal"},{"zone":"trapezius","role":"secundario"}]', start_steps_novillo = '[{"step":"e1","rung":"pared","mode":"completa"},{"step":"e2","rung":"pared","mode":"negativa"},{"step":"e3","rung":"pike_elevado","mode":"completa"},{"step":"hold","rung":"pike","mode":"hold"}]', start_steps_ternero = '[{"step":"e1","rung":"wide_en_piso","mode":"completa"},{"step":"e2","rung":"wide_en_piso","mode":"negativa"},{"step":"e3","rung":"pike","mode":"completa"},{"step":"hold","rung":"pike","mode":"hold"}]' WHERE tenant_id = 1 AND code = 'hspu';
--> statement-breakpoint
UPDATE conquer_exercises SET ladder_id = (SELECT l.id FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'p90'), hold_ladder_id = (SELECT h.id FROM conquer_ladders h WHERE h.tenant_id = 1 AND h.code = 'press_90_hold'), brazos_rectos = 0, muscles = '[{"zone":"deltoids","role":"principal"},{"zone":"triceps","role":"principal"},{"zone":"chest","role":"secundario"},{"zone":"abs","role":"secundario"}]', start_steps_novillo = '[{"step":"e1","rung":"straddle","mode":"completa"},{"step":"e2","rung":"straddle","mode":"negativa"},{"step":"e3","rung":"pike_elevado","mode":"completa"},{"step":"hold","rung":"tuck","mode":"hold"}]', start_steps_ternero = '[{"step":"e1","rung":"adv_tuck","mode":"completa"},{"step":"e2","rung":"adv_tuck","mode":"negativa"},{"step":"e3","rung":"pike_elevado","mode":"completa"},{"step":"hold","rung":"tuck","mode":"hold"}]' WHERE tenant_id = 1 AND code = 'press_90';
--> statement-breakpoint
UPDATE conquer_exercises SET ladder_id = (SELECT l.id FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'ppu'), hold_ladder_id = (SELECT h.id FROM conquer_ladders h WHERE h.tenant_id = 1 AND h.code = 'planche_pushup_hold'), brazos_rectos = 0, muscles = '[{"zone":"chest","role":"principal"},{"zone":"deltoids","role":"principal"},{"zone":"triceps","role":"principal"},{"zone":"abs","role":"secundario"}]', start_steps_novillo = '[{"step":"e1","rung":"pseudo","mode":"completa"},{"step":"e2","rung":"pseudo","mode":"negativa"},{"step":"e3","rung":"flexion","mode":"completa"},{"step":"hold","rung":"pseudo","mode":"hold"}]', start_steps_ternero = '[{"step":"e1","rung":"flexion","mode":"completa"},{"step":"e2","rung":"flexion","mode":"negativa"},{"step":"e3","rung":"flexion","mode":"completa"},{"step":"hold","rung":"pseudo","mode":"hold"}]' WHERE tenant_id = 1 AND code = 'planche_pushup';
--> statement-breakpoint
UPDATE conquer_exercises SET ladder_id = (SELECT l.id FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'trac'), hold_ladder_id = (SELECT h.id FROM conquer_ladders h WHERE h.tenant_id = 1 AND h.code = 'one_arm_archer_hold'), brazos_rectos = 0, muscles = '[{"zone":"upper-back","role":"principal"},{"zone":"biceps","role":"principal"},{"zone":"deltoids","role":"secundario"},{"zone":"forearm","role":"secundario"}]', start_steps_novillo = '[{"step":"e1","rung":"archer","mode":"completa"},{"step":"e2","rung":"oap_asistida","mode":"negativa"},{"step":"e3","rung":"dominada","mode":"completa"},{"step":"hold","rung":"dominada","mode":"hold"}]', start_steps_ternero = '[{"step":"e1","rung":"estricta_lenta","mode":"completa"},{"step":"e2","rung":"archer","mode":"negativa"},{"step":"e3","rung":"al_pecho","mode":"completa"},{"step":"hold","rung":"dominada","mode":"hold"}]' WHERE tenant_id = 1 AND code = 'one_arm_archer';
--> statement-breakpoint
UPDATE conquer_exercises SET ladder_id = (SELECT l.id FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'mu'), hold_ladder_id = (SELECT h.id FROM conquer_ladders h WHERE h.tenant_id = 1 AND h.code = 'muscle_up_hold'), brazos_rectos = 0, muscles = '[{"zone":"upper-back","role":"principal"},{"zone":"biceps","role":"principal"},{"zone":"triceps","role":"principal"},{"zone":"chest","role":"secundario"},{"zone":"forearm","role":"secundario"}]', start_steps_novillo = '[{"step":"e1","rung":"con_impulso","mode":"completa"},{"step":"e2","rung":"con_impulso","mode":"negativa"},{"step":"e3","rung":"dominada","mode":"completa"},{"step":"hold","rung":"dominada","mode":"hold"}]', start_steps_ternero = '[{"step":"e1","rung":"al_pecho","mode":"completa"},{"step":"e2","rung":"al_pecho","mode":"negativa"},{"step":"e3","rung":"dominada","mode":"completa"},{"step":"hold","rung":"dominada","mode":"hold"}]' WHERE tenant_id = 1 AND code = 'muscle_up';
--> statement-breakpoint
UPDATE conquer_exercises SET ladder_id = (SELECT l.id FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'fondo'), hold_ladder_id = (SELECT h.id FROM conquer_ladders h WHERE h.tenant_id = 1 AND h.code = 'fondo_pelicano_hold'), brazos_rectos = 0, muscles = '[{"zone":"biceps","role":"principal"},{"zone":"chest","role":"principal"},{"zone":"deltoids","role":"secundario"},{"zone":"triceps","role":"secundario"}]', start_steps_novillo = '[{"step":"e1","rung":"supinado_profundo","mode":"completa"},{"step":"e2","rung":"supinado_profundo","mode":"negativa"},{"step":"e3","rung":"anillas_profundo","mode":"completa"},{"step":"hold","rung":"paralelas","mode":"hold"}]', start_steps_ternero = '[{"step":"e1","rung":"anillas_profundo","mode":"completa"},{"step":"e2","rung":"anillas_profundo","mode":"negativa"},{"step":"e3","rung":"anillas","mode":"completa"},{"step":"hold","rung":"paralelas","mode":"hold"}]' WHERE tenant_id = 1 AND code = 'fondo_pelicano';
--> statement-breakpoint
UPDATE conquer_template_days SET finisher_text = 'Tuck planche hold o planche lean, 20–30 s' WHERE tenant_id = 1 AND days_count = 4 AND day_key = 'plancha';
--> statement-breakpoint
UPDATE conquer_template_days SET finisher_text = 'Retracciones escapulares + hold en barra' WHERE tenant_id = 1 AND days_count = 4 AND day_key = 'front';
--> statement-breakpoint
UPDATE conquer_template_days SET finisher_text = 'Fondos o push-ups, 15–20 reps' WHERE tenant_id = 1 AND days_count = 4 AND day_key = 'vertical';
--> statement-breakpoint
UPDATE conquer_template_days SET finisher_text = 'Curl de bíceps en anillas o pelícanos, 15–20 reps' WHERE tenant_id = 1 AND days_count = 4 AND day_key = 'dominadas';
--> statement-breakpoint
UPDATE conquer_template_days SET finisher_text = 'Fondos o push-ups, 15–20 reps' WHERE tenant_id = 1 AND days_count = 3 AND day_key = 'empuje';
--> statement-breakpoint
UPDATE conquer_template_days SET finisher_text = 'Curl de bíceps en anillas o pelícanos, 15–20 reps' WHERE tenant_id = 1 AND days_count = 3 AND day_key = 'traccion';
--> statement-breakpoint
UPDATE conquer_template_days SET finisher_text = 'Retracciones escapulares + hold en barra' WHERE tenant_id = 1 AND days_count = 3 AND day_key = 'mixto';
--> statement-breakpoint
UPDATE conquer_template_days SET finisher_text = 'Fondos o push-ups, 15–20 reps' WHERE tenant_id = 1 AND days_count = 2 AND day_key = 'empuje';
--> statement-breakpoint
UPDATE conquer_template_days SET finisher_text = 'Curl de bíceps en anillas o pelícanos, 15–20 reps' WHERE tenant_id = 1 AND days_count = 2 AND day_key = 'traccion';
--> statement-breakpoint
UPDATE conquer_steps s JOIN conquer_exercises e ON e.id = s.exercise_id AND e.tenant_id = 1 JOIN conquer_rungs o ON o.id = s.rung_id AND o.tenant_id = 1
  JOIN conquer_rungs n ON n.tenant_id = 1 AND n.ladder_id = IF(s.step = 'hold', COALESCE(e.hold_ladder_id, e.ladder_id), e.ladder_id) AND n.code = o.code
  SET s.rung_id = n.id
  WHERE s.tenant_id = 1 AND o.ladder_id <> n.ladder_id;
--> statement-breakpoint
UPDATE conquer_steps s JOIN conquer_exercises e ON e.id = s.exercise_id AND e.tenant_id = 1 JOIN conquer_rungs o ON o.id = s.rung_id AND o.tenant_id = 1
  JOIN (SELECT r.ladder_id, MAX(r.`position`) AS pos FROM conquer_rungs r WHERE r.tenant_id = 1 AND r.is_active = 1 GROUP BY r.ladder_id) m ON m.ladder_id = IF(s.step = 'hold', COALESCE(e.hold_ladder_id, e.ladder_id), e.ladder_id)
  JOIN conquer_rungs n ON n.tenant_id = 1 AND n.ladder_id = m.ladder_id AND n.`position` = m.pos
  SET s.rung_id = n.id
  WHERE s.tenant_id = 1 AND o.ladder_id <> m.ladder_id;
--> statement-breakpoint
UPDATE conquer_session_steps s JOIN conquer_exercises e ON e.id = s.exercise_id AND e.tenant_id = 1 JOIN conquer_rungs o ON o.id = s.rung_id AND o.tenant_id = 1
  JOIN conquer_rungs n ON n.tenant_id = 1 AND n.ladder_id = IF(s.step = 'hold', COALESCE(e.hold_ladder_id, e.ladder_id), e.ladder_id) AND n.code = o.code
  SET s.rung_id = n.id
  WHERE s.tenant_id = 1 AND o.ladder_id <> n.ladder_id;
--> statement-breakpoint
UPDATE conquer_session_steps s JOIN conquer_exercises e ON e.id = s.exercise_id AND e.tenant_id = 1 JOIN conquer_rungs o ON o.id = s.rung_id AND o.tenant_id = 1
  JOIN (SELECT r.ladder_id, MAX(r.`position`) AS pos FROM conquer_rungs r WHERE r.tenant_id = 1 AND r.is_active = 1 GROUP BY r.ladder_id) m ON m.ladder_id = IF(s.step = 'hold', COALESCE(e.hold_ladder_id, e.ladder_id), e.ladder_id)
  JOIN conquer_rungs n ON n.tenant_id = 1 AND n.ladder_id = m.ladder_id AND n.`position` = m.pos
  SET s.rung_id = n.id
  WHERE s.tenant_id = 1 AND o.ladder_id <> m.ladder_id;
