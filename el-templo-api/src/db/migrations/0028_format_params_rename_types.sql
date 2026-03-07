-- Rename legacy format param types in session_blocks.format_params:
-- for_max → for_max_reps
-- unbroken → unbroken_reps
-- chipper: remove rounds field (always 1 pass)
-- i_go_you_go: backfill totalRounds=4 where missing

UPDATE session_blocks
SET format_params = JSON_SET(
  JSON_REMOVE(format_params, '$.rounds'),
  '$.type', 'for_max_reps'
)
WHERE JSON_EXTRACT(format_params, '$.type') = 'for_max';

UPDATE session_blocks
SET format_params = JSON_SET(format_params, '$.type', 'unbroken_reps')
WHERE JSON_EXTRACT(format_params, '$.type') = 'unbroken';

UPDATE session_blocks
SET format_params = JSON_REMOVE(format_params, '$.rounds')
WHERE JSON_EXTRACT(format_params, '$.type') = 'chipper';

UPDATE session_blocks
SET format_params = JSON_SET(format_params, '$.totalRounds', 4)
WHERE JSON_EXTRACT(format_params, '$.type') = 'i_go_you_go'
  AND JSON_EXTRACT(format_params, '$.totalRounds') IS NULL;

-- Add Acropolis format to the formats table
INSERT INTO formats (name, type, description)
VALUES ('Acropolis', 'Structure-based', 'Estructura en fases progresivas, cada una mas desafiante');
