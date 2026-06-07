-- Nombres completos para las rutas del árbol de progresiones (UI del mapa y
-- editor muestran display_name con fallback al code). Hasta ahora casi todas
-- tenían display_name NULL y el admin mostraba la sigla.
--
-- Fuente de los nombres: PROGRESIONES-POR-RUTA-DRAFT.md (revisión de profes).
-- HR / HT / NC / QC quedan en NULL a propósito -- su significado todavía no
-- está confirmado por los profes y es mejor la sigla que un nombre equivocado.
--
-- Comment safety (Phase 103-01 invariant): el runner splittea por punto y coma
-- ANTES de strippear los comentarios de línea, así que ningún comentario lleva
-- ese caracter. Cada statement termina con un único terminador en su propia línea.
--
-- Hand-written SQL (drizzle-kit meta journal desincronizado, mismo patrón que
-- 0143).

UPDATE routes SET display_name = 'Back Lever' WHERE code = 'BL';

UPDATE routes SET display_name = 'Dragon Squat' WHERE code = 'DS';

UPDATE routes SET display_name = 'Front Lever' WHERE code = 'FL';

UPDATE routes SET display_name = 'Front Lever Row' WHERE code = 'FLR';

UPDATE routes SET display_name = 'Fondos (Dips)' WHERE code = 'HD/ID';

UPDATE routes SET display_name = 'Handstand' WHERE code = 'HS';

UPDATE routes SET display_name = 'Handstand Push Up' WHERE code = 'HSPU';

UPDATE routes SET display_name = 'Lunge' WHERE code = 'L';

UPDATE routes SET display_name = 'Manna' WHERE code = 'MN/RP';

UPDATE routes SET display_name = 'Muscle Up' WHERE code = 'MU';

UPDATE routes SET display_name = 'One Arm Pull Up' WHERE code = 'OAP';

UPDATE routes SET display_name = 'One Arm Push Up' WHERE code = 'OAPU';

UPDATE routes SET display_name = 'One Arm Row' WHERE code = 'OAR';

UPDATE routes SET display_name = 'Press Handstand' WHERE code = 'PHS';

UPDATE routes SET display_name = 'Planche' WHERE code = 'PL';

UPDATE routes SET display_name = 'Planche Push Up' WHERE code = 'PLPU';

UPDATE routes SET display_name = 'Pistol Squat' WHERE code = 'PS';

UPDATE routes SET display_name = 'Sissy Squat' WHERE code = 'SS';

UPDATE routes SET display_name = 'Step Up' WHERE code = 'SU';

UPDATE routes SET display_name = 'Toes To Bar' WHERE code = 'TTB';
