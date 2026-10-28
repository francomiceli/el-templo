-- 0292_conquer_catalog_seed.sql
-- Fase 201 (Conquer v2), plan 201-02: semilla del catalogo de Conquer.
--
-- Contenido (sintesis de Nacho 2026-10-21): 8 escaleras y 45 peldanos (8.1),
-- 12 ejercicios con la tabla de arranque de Toro (8.2) y las plantillas de 4,
-- 3 y 2 dias (1.3 y 2.1) como datos (D-14).
--
-- Marcas brazos_rectos y unilateral, zonas musculares de cada ejercicio y
-- finishers de las plantillas de 2 y 3 dias: semilla PROPUESTA, Nacho la valida
-- en la prueba (D-20) y se edita desde el admin sin tocar codigo.
--
-- Solo tenant 1: el metodo es exclusivo de El Templo. Otros gimnasios nacen sin
-- catalogo.
--
-- Idempotente: INSERT IGNORE sobre los UNIQUE de 0290 (tenant_id, code), se
-- puede correr dos veces sin duplicar. Los ids se resuelven por code, nunca
-- fijos. Cero datos de prueba (staging y prod comparten servidor MySQL).
--
-- position 0 es el peldano MAS DIFICIL de la escalera, igual que el oraculo
-- conquer-app.html (LAD) y la seccion 8.1.
--
-- Un statement por fila, separados con el marcador de statement del runner.
-- Un comentario SQL NUNCA debe contener el separador de statements ni un
-- literal de texto con ese caracter.
--
INSERT IGNORE INTO conquer_ladders (tenant_id, code, name, sort_order, is_active) VALUES (1, 'palanca', 'Palanca', 1, 1);
--> statement-breakpoint
INSERT IGNORE INTO conquer_ladders (tenant_id, code, name, sort_order, is_active) VALUES (1, 'hspu', 'HSPU', 2, 1);
--> statement-breakpoint
INSERT IGNORE INTO conquer_ladders (tenant_id, code, name, sort_order, is_active) VALUES (1, 'p90', '90° press', 3, 1);
--> statement-breakpoint
INSERT IGNORE INTO conquer_ladders (tenant_id, code, name, sort_order, is_active) VALUES (1, 'ppu', 'Planche push-up', 4, 1);
--> statement-breakpoint
INSERT IGNORE INTO conquer_ladders (tenant_id, code, name, sort_order, is_active) VALUES (1, 'trac', 'Tracción vertical', 5, 1);
--> statement-breakpoint
INSERT IGNORE INTO conquer_ladders (tenant_id, code, name, sort_order, is_active) VALUES (1, 'mu', 'Muscle-up', 6, 1);
--> statement-breakpoint
INSERT IGNORE INTO conquer_ladders (tenant_id, code, name, sort_order, is_active) VALUES (1, 'fondo', 'Fondo', 7, 1);
--> statement-breakpoint
INSERT IGNORE INTO conquer_ladders (tenant_id, code, name, sort_order, is_active) VALUES (1, 'lsit', 'L-sit a plancha', 8, 1);
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'full', 'full', 0, 1, 0, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'palanca';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'half_lay', 'half lay', 1, 1, 0, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'palanca';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'straddle', 'straddle', 2, 1, 0, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'palanca';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'super_adv_tuck', 'super adv tuck', 3, 1, 0, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'palanca';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'adv_tuck', 'adv tuck', 4, 1, 0, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'palanca';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'tuck', 'tuck', 5, 1, 0, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'palanca';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'lean', 'lean', 6, 1, 0, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'palanca';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'libre_deficit', 'libre déficit', 0, 0, 0, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'hspu';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'libre', 'libre', 1, 0, 0, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'hspu';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'paralelas_profundas', 'paralelas profundas', 2, 0, 0, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'hspu';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'pared', 'pared', 3, 0, 0, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'hspu';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'wide_en_piso', 'wide en piso', 4, 0, 0, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'hspu';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'pike_elevado', 'pike elevado', 5, 0, 0, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'hspu';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'pike', 'pike', 6, 0, 0, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'hspu';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'full', 'full', 0, 0, 0, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'p90';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'straddle', 'straddle', 1, 0, 0, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'p90';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'adv_tuck', 'adv tuck', 2, 0, 0, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'p90';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'tuck', 'tuck', 3, 0, 0, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'p90';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'pike_elevado', 'pike elevado', 4, 0, 0, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'p90';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'full', 'full', 0, 0, 0, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'ppu';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'straddle', 'straddle', 1, 0, 0, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'ppu';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'super_adv_tuck', 'super adv tuck', 2, 0, 0, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'ppu';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'adv_tuck', 'adv tuck', 3, 0, 0, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'ppu';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'tuck', 'tuck', 4, 0, 0, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'ppu';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'pseudo', 'pseudo', 5, 0, 0, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'ppu';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'flexion', 'flexión', 6, 0, 0, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'ppu';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'one_arm', 'one arm', 0, 0, 1, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'trac';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'oap_asistida', 'OAP asistida', 1, 0, 1, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'trac';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'archer', 'archer', 2, 0, 1, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'trac';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'estricta_lenta', 'estricta lenta', 3, 0, 0, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'trac';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'dominada', 'dominada', 4, 0, 0, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'trac';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'al_pecho', 'al pecho', 5, 0, 0, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'trac';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'estricto', 'estricto', 0, 0, 0, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'mu';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'con_impulso', 'con impulso', 1, 0, 0, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'mu';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'al_pecho', 'al pecho', 2, 0, 0, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'mu';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'dominada', 'dominada', 3, 0, 0, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'mu';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'pelicano', 'pelícano', 0, 0, 0, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'fondo';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'supinado_profundo', 'supinado profundo', 1, 0, 0, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'fondo';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'anillas_profundo', 'anillas profundo', 2, 0, 0, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'fondo';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'anillas', 'anillas', 3, 0, 0, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'fondo';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'paralelas_profundo', 'paralelas profundo', 4, 0, 0, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'fondo';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'a_straddle', 'a straddle', 0, 1, 0, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'lsit';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'a_adv_tuck', 'a adv tuck', 1, 1, 0, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'lsit';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'a_tuck', 'a tuck', 2, 1, 0, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'lsit';
--> statement-breakpoint
INSERT IGNORE INTO conquer_rungs (tenant_id, ladder_id, code, name, `position`, brazos_rectos, unilateral, is_active) SELECT 1, l.id, 'a_lean', 'a lean', 3, 1, 0, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'lsit';
--> statement-breakpoint
INSERT IGNORE INTO conquer_exercises (tenant_id, code, name, ladder_id, unit, muscles, start_steps, sort_order, is_active) SELECT 1, 'planche_hold', 'Planche hold', l.id, 's', '[{"zone":"deltoids","role":"principal"},{"zone":"chest","role":"principal"},{"zone":"abs","role":"principal"},{"zone":"triceps","role":"secundario"},{"zone":"forearm","role":"secundario"},{"zone":"obliques","role":"secundario"},{"zone":"biceps","role":"secundario"}]', '[{"step":"e1","rung":"full","mode":"hold"},{"step":"e2","rung":"straddle","mode":"hold"},{"step":"e3","rung":"adv_tuck","mode":"hold"},{"step":"hold","rung":"tuck","mode":"hold"}]', 1, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'palanca';
--> statement-breakpoint
INSERT IGNORE INTO conquer_exercises (tenant_id, code, name, ladder_id, unit, muscles, start_steps, sort_order, is_active) SELECT 1, 'planche_press', 'Planche press', l.id, 'reps', '[{"zone":"deltoids","role":"principal"},{"zone":"chest","role":"principal"},{"zone":"abs","role":"principal"},{"zone":"triceps","role":"secundario"},{"zone":"forearm","role":"secundario"},{"zone":"obliques","role":"secundario"},{"zone":"biceps","role":"secundario"}]', '[{"step":"e1","rung":"tuck","mode":"completa"},{"step":"e2","rung":"tuck","mode":"negativa"},{"step":"e3","rung":"lean","mode":"completa"},{"step":"hold","rung":"lean","mode":"hold"}]', 2, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'palanca';
--> statement-breakpoint
INSERT IGNORE INTO conquer_exercises (tenant_id, code, name, ladder_id, unit, muscles, start_steps, sort_order, is_active) SELECT 1, 'lsit_plancha', 'L-sit a plancha', l.id, 'reps', '[{"zone":"deltoids","role":"principal"},{"zone":"chest","role":"principal"},{"zone":"abs","role":"principal"},{"zone":"triceps","role":"secundario"},{"zone":"forearm","role":"secundario"},{"zone":"obliques","role":"secundario"},{"zone":"biceps","role":"secundario"}]', '[{"step":"e1","rung":"a_tuck","mode":"completa"},{"step":"e2","rung":"a_tuck","mode":"negativa"},{"step":"e3","rung":"a_lean","mode":"completa"},{"step":"hold","rung":"a_tuck","mode":"hold"}]', 3, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'lsit';
--> statement-breakpoint
INSERT IGNORE INTO conquer_exercises (tenant_id, code, name, ladder_id, unit, muscles, start_steps, sort_order, is_active) SELECT 1, 'front_hold', 'Front lever hold', l.id, 's', '[{"zone":"upper-back","role":"principal"},{"zone":"abs","role":"principal"},{"zone":"lower-back","role":"secundario"},{"zone":"biceps","role":"secundario"},{"zone":"forearm","role":"secundario"},{"zone":"trapezius","role":"secundario"},{"zone":"deltoids","role":"secundario"}]', '[{"step":"e1","rung":"full","mode":"hold"},{"step":"e2","rung":"straddle","mode":"hold"},{"step":"e3","rung":"adv_tuck","mode":"hold"},{"step":"hold","rung":"tuck","mode":"hold"}]', 4, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'palanca';
--> statement-breakpoint
INSERT IGNORE INTO conquer_exercises (tenant_id, code, name, ladder_id, unit, muscles, start_steps, sort_order, is_active) SELECT 1, 'front_pullups', 'Pull-ups en front lever', l.id, 'reps', '[{"zone":"upper-back","role":"principal"},{"zone":"abs","role":"principal"},{"zone":"lower-back","role":"secundario"},{"zone":"biceps","role":"secundario"},{"zone":"forearm","role":"secundario"},{"zone":"trapezius","role":"secundario"},{"zone":"deltoids","role":"secundario"}]', '[{"step":"e1","rung":"adv_tuck","mode":"completa"},{"step":"e2","rung":"adv_tuck","mode":"negativa"},{"step":"e3","rung":"tuck","mode":"completa"},{"step":"hold","rung":"tuck","mode":"hold"}]', 5, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'palanca';
--> statement-breakpoint
INSERT IGNORE INTO conquer_exercises (tenant_id, code, name, ladder_id, unit, muscles, start_steps, sort_order, is_active) SELECT 1, 'front_raises', 'Front lever raises', l.id, 'reps', '[{"zone":"upper-back","role":"principal"},{"zone":"abs","role":"principal"},{"zone":"lower-back","role":"secundario"},{"zone":"biceps","role":"secundario"},{"zone":"forearm","role":"secundario"},{"zone":"trapezius","role":"secundario"},{"zone":"deltoids","role":"secundario"}]', '[{"step":"e1","rung":"straddle","mode":"completa"},{"step":"e2","rung":"straddle","mode":"negativa"},{"step":"e3","rung":"tuck","mode":"completa"},{"step":"hold","rung":"adv_tuck","mode":"hold"}]', 6, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'palanca';
--> statement-breakpoint
INSERT IGNORE INTO conquer_exercises (tenant_id, code, name, ladder_id, unit, muscles, start_steps, sort_order, is_active) SELECT 1, 'hspu', 'HSPU', l.id, 'reps', '[{"zone":"deltoids","role":"principal"},{"zone":"triceps","role":"principal"},{"zone":"chest","role":"secundario"},{"zone":"trapezius","role":"secundario"},{"zone":"abs","role":"secundario"},{"zone":"forearm","role":"secundario"}]', '[{"step":"e1","rung":"paralelas_profundas","mode":"completa"},{"step":"e2","rung":"paralelas_profundas","mode":"negativa"},{"step":"e3","rung":"wide_en_piso","mode":"completa"},{"step":"hold","rung":"pike","mode":"hold"}]', 7, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'hspu';
--> statement-breakpoint
INSERT IGNORE INTO conquer_exercises (tenant_id, code, name, ladder_id, unit, muscles, start_steps, sort_order, is_active) SELECT 1, 'press_90', '90° press', l.id, 'reps', '[{"zone":"deltoids","role":"principal"},{"zone":"triceps","role":"principal"},{"zone":"chest","role":"secundario"},{"zone":"trapezius","role":"secundario"},{"zone":"abs","role":"secundario"},{"zone":"forearm","role":"secundario"}]', '[{"step":"e1","rung":"full","mode":"completa"},{"step":"e2","rung":"full","mode":"negativa"},{"step":"e3","rung":"pike_elevado","mode":"completa"},{"step":"hold","rung":"tuck","mode":"hold"}]', 8, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'p90';
--> statement-breakpoint
INSERT IGNORE INTO conquer_exercises (tenant_id, code, name, ladder_id, unit, muscles, start_steps, sort_order, is_active) SELECT 1, 'planche_pushup', 'Planche push-up', l.id, 'reps', '[{"zone":"chest","role":"principal"},{"zone":"deltoids","role":"principal"},{"zone":"triceps","role":"principal"},{"zone":"abs","role":"secundario"},{"zone":"forearm","role":"secundario"},{"zone":"biceps","role":"secundario"}]', '[{"step":"e1","rung":"tuck","mode":"completa"},{"step":"e2","rung":"tuck","mode":"negativa"},{"step":"e3","rung":"pseudo","mode":"completa"},{"step":"hold","rung":"pseudo","mode":"hold"}]', 9, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'ppu';
--> statement-breakpoint
INSERT IGNORE INTO conquer_exercises (tenant_id, code, name, ladder_id, unit, muscles, start_steps, sort_order, is_active) SELECT 1, 'one_arm_archer', 'One arm / archer', l.id, 'reps', '[{"zone":"upper-back","role":"principal"},{"zone":"biceps","role":"principal"},{"zone":"forearm","role":"secundario"},{"zone":"abs","role":"secundario"},{"zone":"obliques","role":"secundario"},{"zone":"deltoids","role":"secundario"}]', '[{"step":"e1","rung":"oap_asistida","mode":"completa"},{"step":"e2","rung":"one_arm","mode":"negativa"},{"step":"e3","rung":"estricta_lenta","mode":"completa"},{"step":"hold","rung":"dominada","mode":"hold"}]', 10, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'trac';
--> statement-breakpoint
INSERT IGNORE INTO conquer_exercises (tenant_id, code, name, ladder_id, unit, muscles, start_steps, sort_order, is_active) SELECT 1, 'muscle_up', 'Muscle-up', l.id, 'reps', '[{"zone":"upper-back","role":"principal"},{"zone":"triceps","role":"principal"},{"zone":"chest","role":"principal"},{"zone":"biceps","role":"secundario"},{"zone":"deltoids","role":"secundario"},{"zone":"abs","role":"secundario"},{"zone":"forearm","role":"secundario"}]', '[{"step":"e1","rung":"estricto","mode":"completa"},{"step":"e2","rung":"estricto","mode":"negativa"},{"step":"e3","rung":"al_pecho","mode":"completa"},{"step":"hold","rung":"dominada","mode":"hold"}]', 11, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'mu';
--> statement-breakpoint
INSERT IGNORE INTO conquer_exercises (tenant_id, code, name, ladder_id, unit, muscles, start_steps, sort_order, is_active) SELECT 1, 'fondo_pelicano', 'Fondo a pelícano', l.id, 'reps', '[{"zone":"chest","role":"principal"},{"zone":"triceps","role":"principal"},{"zone":"deltoids","role":"secundario"},{"zone":"abs","role":"secundario"}]', '[{"step":"e1","rung":"pelicano","mode":"completa"},{"step":"e2","rung":"pelicano","mode":"negativa"},{"step":"e3","rung":"supinado_profundo","mode":"completa"},{"step":"hold","rung":"anillas","mode":"hold"}]', 12, 1 FROM conquer_ladders l WHERE l.tenant_id = 1 AND l.code = 'fondo';
--> statement-breakpoint
INSERT IGNORE INTO conquer_template_days (tenant_id, days_count, day_key, label, sort_order, finisher_text, exercise_codes, opening_combo_key) VALUES (1, 4, 'plancha', 'Plancha', 1, 'Tuck planche hold o lean, 20–30 s', '["planche_hold","planche_press","lsit_plancha"]', 'plancha');
--> statement-breakpoint
INSERT IGNORE INTO conquer_template_days (tenant_id, days_count, day_key, label, sort_order, finisher_text, exercise_codes, opening_combo_key) VALUES (1, 4, 'front', 'Front', 2, 'Retracciones escapulares + hold en barra', '["front_hold","front_pullups","front_raises"]', 'front');
--> statement-breakpoint
INSERT IGNORE INTO conquer_template_days (tenant_id, days_count, day_key, label, sort_order, finisher_text, exercise_codes, opening_combo_key) VALUES (1, 4, 'vertical', 'Vertical', 3, 'Fondos o push-ups, 15–20', '["hspu","press_90","planche_pushup"]', 'vertical');
--> statement-breakpoint
INSERT IGNORE INTO conquer_template_days (tenant_id, days_count, day_key, label, sort_order, finisher_text, exercise_codes, opening_combo_key) VALUES (1, 4, 'dominadas', 'Dominadas', 4, 'Curl de bíceps en anillas, 15–20', '["one_arm_archer","muscle_up","fondo_pelicano"]', 'dominadas');
--> statement-breakpoint
INSERT IGNORE INTO conquer_template_days (tenant_id, days_count, day_key, label, sort_order, finisher_text, exercise_codes, opening_combo_key) VALUES (1, 3, 'empuje', 'Empuje', 1, 'Fondos o push-ups, 15–20', '["planche_hold","hspu","planche_pushup"]', NULL);
--> statement-breakpoint
INSERT IGNORE INTO conquer_template_days (tenant_id, days_count, day_key, label, sort_order, finisher_text, exercise_codes, opening_combo_key) VALUES (1, 3, 'traccion', 'Tracción', 2, 'Retracciones escapulares + hold en barra', '["front_hold","front_pullups","muscle_up"]', NULL);
--> statement-breakpoint
INSERT IGNORE INTO conquer_template_days (tenant_id, days_count, day_key, label, sort_order, finisher_text, exercise_codes, opening_combo_key) VALUES (1, 3, 'mixto', 'Mixto', 3, 'Curl de bíceps en anillas, 15–20', '["planche_press","one_arm_archer","press_90"]', NULL);
--> statement-breakpoint
INSERT IGNORE INTO conquer_template_days (tenant_id, days_count, day_key, label, sort_order, finisher_text, exercise_codes, opening_combo_key) VALUES (1, 2, 'empuje', 'Empuje', 1, 'Fondos o push-ups, 15–20', '["planche_hold","hspu","planche_pushup"]', NULL);
--> statement-breakpoint
INSERT IGNORE INTO conquer_template_days (tenant_id, days_count, day_key, label, sort_order, finisher_text, exercise_codes, opening_combo_key) VALUES (1, 2, 'traccion', 'Tracción', 2, 'Retracciones escapulares + hold en barra', '["front_hold","one_arm_archer","muscle_up"]', NULL);
