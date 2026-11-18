-- Fase 214, D-20: calibracion del tiempo propuesto antes de que la regla de Aura lo use
-- SOLO LECTURA. No correr sin OK de Franco. Agregados, sin ids ni nombres
-- Aproximacion en SQL de sessions/proposed-time.ts (plan 08). Si difieren, manda el codigo.
--
-- Pregunta que responde: de las sesiones reales de la app (ultimos 90 dias), cuantas pasarian el 80 %
-- del tiempo propuesto (duration >= 0,8 x propuesto). Sirve para no negarle Aura a quien entrena de verdad.
--
-- Universo: completed_sessions de los ultimos 90 dias que vienen de la app
--   (goal_plan_type IS NULL OR goal_plan_type <> 'presencial'), con duration y blocks_completed no nulos.
-- Bloques que cuentan: los de sessions/session_blocks cuyo role esta en blocks_completed
--   y que no son alternativos (COMBOS_II_ALT, TECNICA_II_ALT).
-- Tiempo propuesto por bloque (segundos), con piso de 60 s por bloque:
--   amrap, amrap_series, time_cap, for_tech, open_style    -> minutes x 60
--   emom, every_x_seconds                                  -> totalMinutes x 60
--   tabata                                                 -> (workSeconds + restSeconds) x rounds
--   on_the_x                                               -> intervalSeconds x rounds
--   interval, hiit                                         -> (workSeconds + restSeconds) x rounds x exercise_count
--   for_time, for_max_reps, for_max_distancia, death_by,
--   death_by_unbroken, rounds_for_time                     -> LEAST(estimacion, timeCapMinutes x 60) si hay tope
--   resto                                                  -> estimacion
-- estimacion = SUM por prescripcion de (IF(seconds > 0, seconds, reps x 3) + GREATEST(rest, 0))
--              x COALESCE(rounds, totalRounds, 1). Incluye las prescripciones de movilidad del bloque.
-- Formatos con tiempo que no estan en el CASE (por ejemplo emom_for_time) caen a la estimacion.
-- completed_sessions.duration esta en minutos: ratio = duration x 60 / propuesto_segundos.

SET SESSION TRANSACTION READ ONLY;
SET SESSION max_execution_time = 60000;

WITH base AS (
  SELECT cs.id AS cs_id,
         cs.duration AS duracion_min,
         s.session_mode,
         sb.id AS bloque_id,
         sb.exercise_count,
         JSON_UNQUOTE(JSON_EXTRACT(sb.format_params, '$.type')) AS tipo,
         CAST(JSON_UNQUOTE(JSON_EXTRACT(sb.format_params, '$.minutes')) AS DECIMAL(10,2)) AS minutes,
         CAST(JSON_UNQUOTE(JSON_EXTRACT(sb.format_params, '$.totalMinutes')) AS DECIMAL(10,2)) AS total_minutes,
         CAST(JSON_UNQUOTE(JSON_EXTRACT(sb.format_params, '$.workSeconds')) AS DECIMAL(10,2)) AS work_s,
         CAST(JSON_UNQUOTE(JSON_EXTRACT(sb.format_params, '$.restSeconds')) AS DECIMAL(10,2)) AS rest_s,
         CAST(JSON_UNQUOTE(JSON_EXTRACT(sb.format_params, '$.intervalSeconds')) AS DECIMAL(10,2)) AS interval_s,
         CAST(JSON_UNQUOTE(JSON_EXTRACT(sb.format_params, '$.rounds')) AS DECIMAL(10,2)) AS rounds,
         CAST(JSON_UNQUOTE(JSON_EXTRACT(sb.format_params, '$.totalRounds')) AS DECIMAL(10,2)) AS total_rounds,
         CAST(JSON_UNQUOTE(JSON_EXTRACT(sb.format_params, '$.timeCapMinutes')) AS DECIMAL(10,2)) AS tope_min
  FROM completed_sessions cs
  JOIN sessions s ON s.day_id = cs.day_id AND s.tenant_id = cs.tenant_id
  JOIN session_blocks sb ON sb.session_id = s.id
  WHERE cs.tenant_id = 1
    AND cs.date >= DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 90 DAY), '%Y-%m-%d')
    AND (cs.goal_plan_type IS NULL OR cs.goal_plan_type <> 'presencial')
    AND cs.duration IS NOT NULL
    AND cs.blocks_completed IS NOT NULL
    AND JSON_CONTAINS(cs.blocks_completed, JSON_QUOTE(sb.role))
    AND sb.role NOT IN ('COMBOS_II_ALT', 'TECNICA_II_ALT')
),
por_vuelta AS (
  SELECT p.block_id,
         SUM(IF(p.seconds > 0, p.seconds, p.reps * 3) + GREATEST(p.rest, 0)) AS segundos
  FROM session_prescriptions p
  WHERE p.block_id IN (SELECT bloque_id FROM base)
  GROUP BY p.block_id
),
bloques AS (
  SELECT b.cs_id, b.duracion_min, b.session_mode,
         GREATEST(60, CASE
           WHEN b.tipo IN ('amrap', 'amrap_series', 'time_cap', 'for_tech', 'open_style') AND b.minutes IS NOT NULL
             THEN b.minutes * 60
           WHEN b.tipo IN ('emom', 'every_x_seconds') AND b.total_minutes IS NOT NULL
             THEN b.total_minutes * 60
           WHEN b.tipo = 'tabata' AND b.work_s IS NOT NULL AND b.rest_s IS NOT NULL AND b.rounds IS NOT NULL
             THEN (b.work_s + b.rest_s) * b.rounds
           WHEN b.tipo = 'on_the_x' AND b.interval_s IS NOT NULL AND b.rounds IS NOT NULL
             THEN b.interval_s * b.rounds
           WHEN b.tipo IN ('interval', 'hiit') AND b.work_s IS NOT NULL AND b.rest_s IS NOT NULL AND b.rounds IS NOT NULL
             THEN (b.work_s + b.rest_s) * b.rounds * b.exercise_count
           WHEN b.tipo IN ('for_time', 'for_max_reps', 'for_max_distancia', 'death_by', 'death_by_unbroken', 'rounds_for_time')
                AND b.tope_min IS NOT NULL
             THEN LEAST(COALESCE(v.segundos, 0) * COALESCE(b.rounds, b.total_rounds, 1), b.tope_min * 60)
           ELSE COALESCE(v.segundos, 0) * COALESCE(b.rounds, b.total_rounds, 1)
         END) AS propuesto_s
  FROM base b
  LEFT JOIN por_vuelta v ON v.block_id = b.bloque_id
),
sesiones AS (
  SELECT cs_id,
         MAX(duracion_min) AS duracion_min,
         MAX(session_mode) AS session_mode,
         SUM(propuesto_s) AS propuesto_s
  FROM bloques
  GROUP BY cs_id
),
con_ratio AS (
  SELECT session_mode,
         duracion_min * 60 / propuesto_s AS ratio
  FROM sesiones
  WHERE propuesto_s > 0
),
ordenadas AS (
  SELECT session_mode, ratio,
         ROW_NUMBER() OVER (ORDER BY ratio) AS rn_total,
         COUNT(*) OVER () AS n_total,
         ROW_NUMBER() OVER (PARTITION BY session_mode ORDER BY ratio) AS rn_modo,
         COUNT(*) OVER (PARTITION BY session_mode) AS n_modo
  FROM con_ratio
)
-- A. Total y por session_mode (la fila 'total' es el agregado de todas)
SELECT 'total' AS grupo,
       COUNT(*) AS sesiones,
       SUM(ratio < 0.5) AS ratio_menor_0_5,
       SUM(ratio >= 0.5 AND ratio < 0.8) AS ratio_0_5_a_0_8,
       SUM(ratio >= 0.8 AND ratio <= 1.2) AS ratio_0_8_a_1_2,
       SUM(ratio > 1.2) AS ratio_mayor_1_2,
       ROUND(AVG(IF(rn_total IN (FLOOR((n_total + 1) / 2), CEIL((n_total + 1) / 2)), ratio, NULL)), 3) AS mediana_ratio,
       SUM(ratio >= 0.8) AS pasarian_el_80,
       ROUND(100 * SUM(ratio >= 0.8) / COUNT(*), 1) AS pct_pasarian_el_80
FROM ordenadas
UNION ALL
SELECT session_mode AS grupo,
       COUNT(*) AS sesiones,
       SUM(ratio < 0.5),
       SUM(ratio >= 0.5 AND ratio < 0.8),
       SUM(ratio >= 0.8 AND ratio <= 1.2),
       SUM(ratio > 1.2),
       ROUND(AVG(IF(rn_modo IN (FLOOR((n_modo + 1) / 2), CEIL((n_modo + 1) / 2)), ratio, NULL)), 3),
       SUM(ratio >= 0.8),
       ROUND(100 * SUM(ratio >= 0.8) / COUNT(*), 1)
FROM ordenadas
GROUP BY session_mode;
