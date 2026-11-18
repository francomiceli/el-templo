-- Fase 214: insumo para simular esquemas de montos de Aura
-- SOLO LECTURA. Se corre contra la base de producción con OK de Franco
-- Una fila por alumno con Aura o con asistencia reciente, SIN identificadores:
--   ni id, ni nombre, ni sede. Solo conteos por fuente
-- Con esto se recalcula en local cuánto tendría cada alumno con otros montos,
--   sin volver a consultar producción

SET SESSION TRANSACTION READ ONLY;
SET SESSION max_execution_time = 30000;

SELECT
  EXISTS (
    SELECT 1
    FROM attendance a
    WHERE a.member_id = u.id
      AND a.session_date >= CURDATE() - INTERVAL 56 DAY
  ) AS activo_56d,
  (
    SELECT COUNT(*)
    FROM attendance a
    WHERE a.member_id = u.id
      AND a.session_date >= CURDATE() - INTERVAL 56 DAY
  ) AS asistencias_56d,
  TIMESTAMPDIFF(MONTH, u.created_at, NOW()) AS meses_desde_alta,
  COALESCE(t.asistencias, 0) AS asistencias,
  COALESCE(t.reversas, 0) AS reversas,
  COALESCE(t.onboarding, 0) AS onboarding,
  COALESCE(t.hito_50, 0) AS hito_50,
  COALESCE(t.hito_100, 0) AS hito_100,
  COALESCE(t.hito_250, 0) AS hito_250,
  COALESCE(t.hito_otro_puntos, 0) AS hito_otro_puntos,
  COALESCE(t.entrenos_app, 0) AS entrenos_app,
  COALESCE(t.semanas_programa, 0) AS semanas_programa,
  COALESCE(t.racha_puntos, 0) AS racha_puntos,
  COALESCE(t.otros_puntos, 0) AS otros_puntos,
  COALESCE(t.total, 0) AS total
FROM users u
LEFT JOIN (
  SELECT
    x.user_id,
    SUM(x.source_type = 'attendance' AND x.amount > 0) AS asistencias,
    SUM(COALESCE(x.reference_type, '') = 'attendance_reversal') AS reversas,
    SUM(x.source_type = 'onboarding_completion') AS onboarding,
    SUM(x.source_type = 'tenure_milestone' AND x.amount = 50) AS hito_50,
    SUM(x.source_type = 'tenure_milestone' AND x.amount = 100) AS hito_100,
    SUM(x.source_type = 'tenure_milestone' AND x.amount = 250) AS hito_250,
    SUM(CASE
          WHEN x.source_type = 'tenure_milestone' AND x.amount NOT IN (50, 100, 250)
          THEN x.amount ELSE 0
        END) AS hito_otro_puntos,
    SUM(x.source_type = 'training_completion') AS entrenos_app,
    SUM(x.source_type = 'program_week_completion') AS semanas_programa,
    SUM(CASE WHEN x.source_type = 'streak_bonus' THEN x.amount ELSE 0 END) AS racha_puntos,
    SUM(CASE
          WHEN x.source_type IN (
                 'attendance', 'onboarding_completion', 'tenure_milestone',
                 'training_completion', 'program_week_completion', 'streak_bonus'
               )
            OR COALESCE(x.reference_type, '') = 'attendance_reversal'
          THEN 0 ELSE x.amount
        END) AS otros_puntos,
    SUM(x.amount) AS total
  FROM aura_transactions x
  GROUP BY x.user_id
) t ON t.user_id = u.id
WHERE u.role = 'member'
  AND u.deleted_at IS NULL
  AND (
    t.user_id IS NOT NULL
    OR EXISTS (
      SELECT 1
      FROM attendance a
      WHERE a.member_id = u.id
        AND a.session_date >= CURDATE() - INTERVAL 56 DAY
    )
  )
ORDER BY RAND();
