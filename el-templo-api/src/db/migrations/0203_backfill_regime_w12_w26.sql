-- @data-only
-- 0203_backfill_regime_w12_w26.sql
-- Fase 159 (SEM-05, D-18): retro-etiquetado W12-W26 del ancla
-- session_week_regime (migracion 0202). Puebla, como METADATA, que dia de
-- cada semana fue combos y cual tecnica -- el historico de `sessions` dice
-- 'regular' en esos dias (el coach lo hackeaba sobre 'regular'), asi que el
-- regimen real NO es derivable del session_mode historico y hay que
-- persistirlo aparte.
--
-- Este archivo SOLO hace INSERT en session_week_regime. No corre ningun
-- UPDATE ni DELETE sobre `sessions` -- el conteo de filas de `sessions` queda
-- identico antes y despues (verificado por
-- test/migrations/0202-session-week-regime.test.ts). No hace falta tabla de
-- backup: no muta ninguna fila existente.
--
-- Idempotente: cada INSERT se saltea si la fila (tenant_id, week, day) ya
-- existe (WHERE NOT EXISTS), mismo patron que 0172/0183.
--
-- De donde salen los datos (dos fuentes, marcadas por columna `source`):
--
--   W12-W20 (source='signature'): firmas de deteccion del discovery
--   [.docs/coach-improvements/DISCOVERY-SEMANA-NUEVA-2026-07-07.md, verificadas
--   contra prod, ver 159-RESEARCH.md Hallazgo 8]. Dia de combos: bloques
--   NUCLEUS/DEUTEROS en formato Complex con >=3 ejercicios main, reps 1-6 con
--   al menos un 1-3, holds intercalados. Dia de tecnica: bloque final
--   (EPIKOS/ATHLOS) = Flow Guiado + hold_pct alto. Complementario perfecto del
--   dia de combos desde W12. Excluye Ladder/Ladder corta (reps bajas
--   legitimas, falso positivo por nombre de formato) -- ninguna semana de este
--   rango los necesito excluir aparte porque no caen en mie/jue de W12-W20.
--   Anomalia conocida: W17 tuvo Flow Guiado final mie Y jue (el regimen mie
--   combos / jue tecnica se mantiene: la deteccion primaria es el formato
--   Complex del dia de combos, no la ausencia de Flow Guiado en el otro dia).
--
--   W21-W26 (source='manual'): relevamiento SSH read-only contra prod
--   (2026-08-13, DB eltemplo), transcripto verbatim en 159-CONTEXT.md
--   §evidencia_prod. Sin score de confianza (confidence=NULL): es una lectura
--   directa del formato NUCLEUS por semana, no una inferencia estadistica.
--
-- Trampa de data-quality NO aplica a este rango: W20-viernes-sigma tiene
-- format_name/format_params inconsistentes, pero viernes no es un dia del
-- regimen combos/tecnica (solo mie/jue) -- no se cruza format_name<->
-- format_params para decidir estas filas (Pitfall 8), se usa directamente
-- la tabla de deteccion ya resuelta del research/evidencia_prod.
--
-- Un comentario SQL NUNCA debe contener el separador de statements -- el
-- runner parte los statements crudos primero y recien despues borra los
-- comentarios de doble guion.

-- ── W12: jue=combos (firma Complex x3), mie=tecnica (complementario) ──────
INSERT INTO session_week_regime (tenant_id, week, day, inferred_mode, source, confidence, evidence)
SELECT 1, 12, 'miercoles', 'tecnica', 'signature', NULL, JSON_OBJECT('complementary_of', 'jueves', 'note', 'complementario del dia de combos detectado por firma')
WHERE NOT EXISTS (SELECT 1 FROM session_week_regime WHERE tenant_id = 1 AND week = 12 AND day = 'miercoles');

INSERT INTO session_week_regime (tenant_id, week, day, inferred_mode, source, confidence, evidence)
SELECT 1, 12, 'jueves', 'combos', 'signature', NULL, JSON_OBJECT('note', 'Complex x3 en NUCLEUS/DEUTEROS, reps 1-6 con holds intercalados')
WHERE NOT EXISTS (SELECT 1 FROM session_week_regime WHERE tenant_id = 1 AND week = 12 AND day = 'jueves');

-- ── W13: mie=combos, jue=tecnica ───────────────────────────────────────────
INSERT INTO session_week_regime (tenant_id, week, day, inferred_mode, source, confidence, evidence)
SELECT 1, 13, 'miercoles', 'combos', 'signature', NULL, JSON_OBJECT('note', 'Complex x3 en NUCLEUS/DEUTEROS, reps 1-6 con holds intercalados')
WHERE NOT EXISTS (SELECT 1 FROM session_week_regime WHERE tenant_id = 1 AND week = 13 AND day = 'miercoles');

INSERT INTO session_week_regime (tenant_id, week, day, inferred_mode, source, confidence, evidence)
SELECT 1, 13, 'jueves', 'tecnica', 'signature', NULL, JSON_OBJECT('complementary_of', 'miercoles', 'note', 'complementario del dia de combos detectado por firma')
WHERE NOT EXISTS (SELECT 1 FROM session_week_regime WHERE tenant_id = 1 AND week = 13 AND day = 'jueves');

-- ── W14: jue=combos, mie=tecnica ───────────────────────────────────────────
INSERT INTO session_week_regime (tenant_id, week, day, inferred_mode, source, confidence, evidence)
SELECT 1, 14, 'miercoles', 'tecnica', 'signature', NULL, JSON_OBJECT('complementary_of', 'jueves', 'note', 'complementario del dia de combos detectado por firma')
WHERE NOT EXISTS (SELECT 1 FROM session_week_regime WHERE tenant_id = 1 AND week = 14 AND day = 'miercoles');

INSERT INTO session_week_regime (tenant_id, week, day, inferred_mode, source, confidence, evidence)
SELECT 1, 14, 'jueves', 'combos', 'signature', NULL, JSON_OBJECT('note', 'Complex x3 en NUCLEUS/DEUTEROS, reps 1-6 con holds intercalados')
WHERE NOT EXISTS (SELECT 1 FROM session_week_regime WHERE tenant_id = 1 AND week = 14 AND day = 'jueves');

-- ── W15: mie=combos, jue=tecnica ───────────────────────────────────────────
INSERT INTO session_week_regime (tenant_id, week, day, inferred_mode, source, confidence, evidence)
SELECT 1, 15, 'miercoles', 'combos', 'signature', NULL, JSON_OBJECT('note', 'Complex x3 en NUCLEUS/DEUTEROS, reps 1-6 con holds intercalados')
WHERE NOT EXISTS (SELECT 1 FROM session_week_regime WHERE tenant_id = 1 AND week = 15 AND day = 'miercoles');

INSERT INTO session_week_regime (tenant_id, week, day, inferred_mode, source, confidence, evidence)
SELECT 1, 15, 'jueves', 'tecnica', 'signature', NULL, JSON_OBJECT('complementary_of', 'miercoles', 'note', 'complementario del dia de combos detectado por firma')
WHERE NOT EXISTS (SELECT 1 FROM session_week_regime WHERE tenant_id = 1 AND week = 15 AND day = 'jueves');

-- ── W16: jue=combos, mie=tecnica ───────────────────────────────────────────
INSERT INTO session_week_regime (tenant_id, week, day, inferred_mode, source, confidence, evidence)
SELECT 1, 16, 'miercoles', 'tecnica', 'signature', NULL, JSON_OBJECT('complementary_of', 'jueves', 'note', 'complementario del dia de combos detectado por firma')
WHERE NOT EXISTS (SELECT 1 FROM session_week_regime WHERE tenant_id = 1 AND week = 16 AND day = 'miercoles');

INSERT INTO session_week_regime (tenant_id, week, day, inferred_mode, source, confidence, evidence)
SELECT 1, 16, 'jueves', 'combos', 'signature', NULL, JSON_OBJECT('note', 'Complex x3 en NUCLEUS/DEUTEROS, reps 1-6 con holds intercalados')
WHERE NOT EXISTS (SELECT 1 FROM session_week_regime WHERE tenant_id = 1 AND week = 16 AND day = 'jueves');

-- ── W17: mie=combos, jue=tecnica (anomalia: Flow Guiado final mie Y jue) ──
INSERT INTO session_week_regime (tenant_id, week, day, inferred_mode, source, confidence, evidence)
SELECT 1, 17, 'miercoles', 'combos', 'signature', NULL, JSON_OBJECT('note', 'Complex x3 en NUCLEUS/DEUTEROS, reps 1-6 con holds intercalados', 'anomaly', 'Flow Guiado final tambien presente este dia, no cambia la deteccion primaria (formato Complex)')
WHERE NOT EXISTS (SELECT 1 FROM session_week_regime WHERE tenant_id = 1 AND week = 17 AND day = 'miercoles');

INSERT INTO session_week_regime (tenant_id, week, day, inferred_mode, source, confidence, evidence)
SELECT 1, 17, 'jueves', 'tecnica', 'signature', NULL, JSON_OBJECT('complementary_of', 'miercoles', 'note', 'complementario del dia de combos detectado por firma')
WHERE NOT EXISTS (SELECT 1 FROM session_week_regime WHERE tenant_id = 1 AND week = 17 AND day = 'jueves');

-- ── W18: jue=combos, mie=tecnica ───────────────────────────────────────────
INSERT INTO session_week_regime (tenant_id, week, day, inferred_mode, source, confidence, evidence)
SELECT 1, 18, 'miercoles', 'tecnica', 'signature', NULL, JSON_OBJECT('complementary_of', 'jueves', 'note', 'complementario del dia de combos detectado por firma')
WHERE NOT EXISTS (SELECT 1 FROM session_week_regime WHERE tenant_id = 1 AND week = 18 AND day = 'miercoles');

INSERT INTO session_week_regime (tenant_id, week, day, inferred_mode, source, confidence, evidence)
SELECT 1, 18, 'jueves', 'combos', 'signature', NULL, JSON_OBJECT('note', 'Complex x3 en NUCLEUS/DEUTEROS, reps 1-6 con holds intercalados')
WHERE NOT EXISTS (SELECT 1 FROM session_week_regime WHERE tenant_id = 1 AND week = 18 AND day = 'jueves');

-- ── W19: mie=combos, jue=tecnica ───────────────────────────────────────────
INSERT INTO session_week_regime (tenant_id, week, day, inferred_mode, source, confidence, evidence)
SELECT 1, 19, 'miercoles', 'combos', 'signature', NULL, JSON_OBJECT('note', 'Complex x3 en NUCLEUS/DEUTEROS, reps 1-6 con holds intercalados')
WHERE NOT EXISTS (SELECT 1 FROM session_week_regime WHERE tenant_id = 1 AND week = 19 AND day = 'miercoles');

INSERT INTO session_week_regime (tenant_id, week, day, inferred_mode, source, confidence, evidence)
SELECT 1, 19, 'jueves', 'tecnica', 'signature', NULL, JSON_OBJECT('complementary_of', 'miercoles', 'note', 'complementario del dia de combos detectado por firma')
WHERE NOT EXISTS (SELECT 1 FROM session_week_regime WHERE tenant_id = 1 AND week = 19 AND day = 'jueves');

-- ── W20: mie=combos (senal mas debil, ~3% lowrep_pct, igual con Complex x3
--   en NUCLEUS+DEUTEROS), jue=tecnica ────────────────────────────────────
INSERT INTO session_week_regime (tenant_id, week, day, inferred_mode, source, confidence, evidence)
SELECT 1, 20, 'miercoles', 'combos', 'signature', NULL, JSON_OBJECT('note', 'senal mas debil del rango (~3% lowrep_pct) pero con Complex x3 en NUCLEUS+DEUTEROS')
WHERE NOT EXISTS (SELECT 1 FROM session_week_regime WHERE tenant_id = 1 AND week = 20 AND day = 'miercoles');

INSERT INTO session_week_regime (tenant_id, week, day, inferred_mode, source, confidence, evidence)
SELECT 1, 20, 'jueves', 'tecnica', 'signature', NULL, JSON_OBJECT('complementary_of', 'miercoles', 'note', 'complementario del dia de combos detectado por firma')
WHERE NOT EXISTS (SELECT 1 FROM session_week_regime WHERE tenant_id = 1 AND week = 20 AND day = 'jueves');

-- ── W21-W26: relevamiento SSH read-only contra prod (2026-08-13, DB eltemplo),
--   verbatim de 159-CONTEXT.md §evidencia_prod. Formato NUCLEUS por semana:
--   mie=Combos/jue=For Quality(tecnica), mie=For Quality(tecnica)/jue=Complex
--   (combos), etc. Sin score de confianza: lectura directa, no inferencia.

-- W21: mie=combos, jue=tecnica
INSERT INTO session_week_regime (tenant_id, week, day, inferred_mode, source, confidence, evidence)
SELECT 1, 21, 'miercoles', 'combos', 'manual', NULL, JSON_OBJECT('nucleus_format', 'Combos', 'note', 'SSH prod 2026-08-13')
WHERE NOT EXISTS (SELECT 1 FROM session_week_regime WHERE tenant_id = 1 AND week = 21 AND day = 'miercoles');

INSERT INTO session_week_regime (tenant_id, week, day, inferred_mode, source, confidence, evidence)
SELECT 1, 21, 'jueves', 'tecnica', 'manual', NULL, JSON_OBJECT('nucleus_format', 'For Quality', 'note', 'SSH prod 2026-08-13')
WHERE NOT EXISTS (SELECT 1 FROM session_week_regime WHERE tenant_id = 1 AND week = 21 AND day = 'jueves');

-- W22: mie=tecnica, jue=combos
INSERT INTO session_week_regime (tenant_id, week, day, inferred_mode, source, confidence, evidence)
SELECT 1, 22, 'miercoles', 'tecnica', 'manual', NULL, JSON_OBJECT('nucleus_format', 'For Quality', 'note', 'SSH prod 2026-08-13')
WHERE NOT EXISTS (SELECT 1 FROM session_week_regime WHERE tenant_id = 1 AND week = 22 AND day = 'miercoles');

INSERT INTO session_week_regime (tenant_id, week, day, inferred_mode, source, confidence, evidence)
SELECT 1, 22, 'jueves', 'combos', 'manual', NULL, JSON_OBJECT('nucleus_format', 'Complex', 'note', 'SSH prod 2026-08-13')
WHERE NOT EXISTS (SELECT 1 FROM session_week_regime WHERE tenant_id = 1 AND week = 22 AND day = 'jueves');

-- W23: mie=combos, jue=tecnica
INSERT INTO session_week_regime (tenant_id, week, day, inferred_mode, source, confidence, evidence)
SELECT 1, 23, 'miercoles', 'combos', 'manual', NULL, JSON_OBJECT('nucleus_format', 'Combos', 'note', 'SSH prod 2026-08-13')
WHERE NOT EXISTS (SELECT 1 FROM session_week_regime WHERE tenant_id = 1 AND week = 23 AND day = 'miercoles');

INSERT INTO session_week_regime (tenant_id, week, day, inferred_mode, source, confidence, evidence)
SELECT 1, 23, 'jueves', 'tecnica', 'manual', NULL, JSON_OBJECT('nucleus_format', 'For Quality', 'note', 'SSH prod 2026-08-13')
WHERE NOT EXISTS (SELECT 1 FROM session_week_regime WHERE tenant_id = 1 AND week = 23 AND day = 'jueves');

-- W24: mie=tecnica, jue=combos
INSERT INTO session_week_regime (tenant_id, week, day, inferred_mode, source, confidence, evidence)
SELECT 1, 24, 'miercoles', 'tecnica', 'manual', NULL, JSON_OBJECT('nucleus_format', 'For Quality', 'note', 'SSH prod 2026-08-13')
WHERE NOT EXISTS (SELECT 1 FROM session_week_regime WHERE tenant_id = 1 AND week = 24 AND day = 'miercoles');

INSERT INTO session_week_regime (tenant_id, week, day, inferred_mode, source, confidence, evidence)
SELECT 1, 24, 'jueves', 'combos', 'manual', NULL, JSON_OBJECT('nucleus_format', 'Combos', 'note', 'SSH prod 2026-08-13')
WHERE NOT EXISTS (SELECT 1 FROM session_week_regime WHERE tenant_id = 1 AND week = 24 AND day = 'jueves');

-- W25: mie=tecnica, jue=combos
INSERT INTO session_week_regime (tenant_id, week, day, inferred_mode, source, confidence, evidence)
SELECT 1, 25, 'miercoles', 'tecnica', 'manual', NULL, JSON_OBJECT('nucleus_format', 'For Quality', 'note', 'SSH prod 2026-08-13')
WHERE NOT EXISTS (SELECT 1 FROM session_week_regime WHERE tenant_id = 1 AND week = 25 AND day = 'miercoles');

INSERT INTO session_week_regime (tenant_id, week, day, inferred_mode, source, confidence, evidence)
SELECT 1, 25, 'jueves', 'combos', 'manual', NULL, JSON_OBJECT('nucleus_format', 'Combos', 'note', 'SSH prod 2026-08-13')
WHERE NOT EXISTS (SELECT 1 FROM session_week_regime WHERE tenant_id = 1 AND week = 25 AND day = 'jueves');

-- W26: mie=tecnica, jue=combos ("Planis del 17-23" = semana 26, creada 2026-08-11)
INSERT INTO session_week_regime (tenant_id, week, day, inferred_mode, source, confidence, evidence)
SELECT 1, 26, 'miercoles', 'tecnica', 'manual', NULL, JSON_OBJECT('nucleus_format', 'For Quality', 'note', 'SSH prod 2026-08-13')
WHERE NOT EXISTS (SELECT 1 FROM session_week_regime WHERE tenant_id = 1 AND week = 26 AND day = 'miercoles');

INSERT INTO session_week_regime (tenant_id, week, day, inferred_mode, source, confidence, evidence)
SELECT 1, 26, 'jueves', 'combos', 'manual', NULL, JSON_OBJECT('nucleus_format', 'Combos', 'note', 'SSH prod 2026-08-13')
WHERE NOT EXISTS (SELECT 1 FROM session_week_regime WHERE tenant_id = 1 AND week = 26 AND day = 'jueves');
