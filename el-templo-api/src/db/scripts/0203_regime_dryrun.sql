-- 0203_regime_dryrun.sql
-- Fase 159 (SEM-05, D-18) -- PREVIEW READ-ONLY de las firmas de deteccion que
-- sustentan el backfill 0203 (session_week_regime, W12-W26).
--
-- Este archivo vive en src/db/scripts/ (NO en migrations/) a proposito: el
-- runner solo globea migrations/*.sql, asi que este script NUNCA se aplica
-- solo. Es material de verificacion humana ANTES de que el pipeline aplique
-- 0203 -- lo corre Franco por SSH contra staging/prod, no el ejecutor.
--
-- Lista, por (semana, dia), el formato del bloque NUCLEUS de cada sesion
-- 'regular' aprobada en el rango W12-W26 (jueves y miercoles unicamente, que
-- es donde vive el regimen combos/tecnica) -- la misma firma que uso el
-- discovery: 'Complex' = combos, 'For Quality'/'Flow Guiado' = tecnica.
-- No muta nada: es un unico SELECT.
--
-- Uso:
--   mysql -u <user> -p <db> < src/db/scripts/0203_regime_dryrun.sql
--
-- Comparar la salida contra las filas literales de
-- src/db/migrations/0203_backfill_regime_w12_w26.sql ANTES de aplicar la
-- migracion: si una semana no matchea, el backfill tiene un dato mal
-- transcripto y hay que corregirlo antes del deploy, no despues.
--
-- Un comentario SQL NUNCA debe contener el separador de statements -- el
-- runner parte los statements crudos primero y recien despues borra los
-- comentarios de doble guion (no aplica a este script porque nunca lo corre
-- el runner, pero se mantiene la convencion por consistencia).

SELECT
  s.week,
  s.day,
  sb.format_name,
  COUNT(*) AS blocks_with_format
FROM sessions s
JOIN session_blocks sb ON sb.session_id = s.id
WHERE s.week BETWEEN 12 AND 26
  AND s.day IN ('miercoles', 'jueves')
  AND s.status = 'approved'
  AND s.goal_plan_type IS NULL
  AND sb.role = 'NUCLEUS'
  AND sb.format_name NOT IN ('Ladder', 'Ladder corta')
GROUP BY s.week, s.day, sb.format_name
ORDER BY s.week, s.day, sb.format_name;
