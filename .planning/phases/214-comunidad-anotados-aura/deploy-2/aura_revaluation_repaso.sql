-- NNNN_aura_revaluation_repaso.sql  (sin numero todavia, ver README.md de esta carpeta)
-- Fase 214 (D-49, D-64, D-21): repaso de la re-valorizacion del historial de Aura.
-- Va en un deploy POSTERIOR al de la 0344_aura_revaluation.sql. Entre la 0344 y el
-- reinicio de la API, la API vieja sigue acreditando con los montos fijos de su
-- codigo, y este repaso los lleva a la escala nueva.
-- Escrita a mano. NUNCA drizzle-kit push ni migrate.
--
-- Idempotente: cada UPDATE de mapeo exige el valor VIEJO exacto y el valor nuevo
-- nunca cumple la condicion de otra regla. Las filas que acredite el codigo nuevo
-- no se tocan: la asistencia nueva vale 5 o 2 y nunca 10.
--
-- Fuentes que incluye: solo las que la API vieja paga con literales en el codigo.
-- Asistencia, su reversa, onboarding, antiguedad y rachas. No incluye las fuentes
-- que la API vieja lee de la configuracion de Aura ni de la fila del programa
-- porque la 0344 ya las dejo al dia, y repasarlas podria pisar un bonus de programa
-- cargado a mano despues del deploy.
--
-- Tope del dia (D-64) ACOTADO. No se reaplican tal cual los UPDATE de la 0344,
-- porque con el codigo nuevo un dia con app 3 y asistencia 2 es legitimo. Una fila
-- de app o de plan a medida de 3 pasa a 0 solo si se cumplen las tres condiciones.
-- a) Ese dia hay una asistencia de 5 o de 10, es decir de la escala vieja.
-- b) Ese dia NO hay ninguna asistencia con monto entre 1 y 4, que es la senal de
--    que el codigo nuevo ya aplico el tope.
-- c) La fila fue creada antes de una hora despues de applied_at de la 0344 en la
--    tabla de migraciones, la ventana hasta el reinicio de la API.
-- El dia de una fila de app sale de reference_id en formato YYYYMMDD cuando
-- reference_type es training_day o goal_plan_day, y de completed_sessions.date
-- cuando es completed_session o goal_plan_session. Un tipo cuyo dia no se pueda
-- reconstruir no se toca. La derivada con GROUP BY evita ER_UPDATE_TABLE_USED.
--
-- App y plan a medida el mismo dia: igual que en la 0344, el codigo nuevo tampoco
-- produce esa combinacion, asi que no lleva la ventana.
--
-- Sin respaldo propio. La tabla aura_transactions_backup_0344 de la 0344 queda como
-- foto previa a todo. Sin datos de prueba.
--
-- Orden: 1 mapeo por valor viejo, 2 tope del dia acotado, 3 app y plan a medida,
-- 4 recalculo de saldos.
--
-- Un comentario SQL NUNCA debe contener el separador de statements, el runner
-- parte el archivo crudo primero y recien despues borra los comentarios.

UPDATE aura_transactions SET amount = 5
WHERE source_type = 'attendance' AND amount = 10;

UPDATE aura_transactions SET amount = -5
WHERE source_type = 'manual_adjustment' AND reference_type = 'attendance_reversal' AND amount = -10;

UPDATE aura_transactions SET amount = 5
WHERE source_type = 'onboarding_completion' AND amount = 50;

UPDATE aura_transactions SET amount = 15
WHERE source_type = 'tenure_milestone' AND reference_id = 3 AND amount = 50;

UPDATE aura_transactions SET amount = 25
WHERE source_type = 'tenure_milestone' AND reference_id = 6 AND amount = 100;

UPDATE aura_transactions SET amount = 50
WHERE source_type = 'tenure_milestone' AND reference_id >= 12 AND amount = 250;

UPDATE aura_transactions SET amount = 5
WHERE source_type = 'streak_bonus' AND reference_id = 7 AND amount = 20;

UPDATE aura_transactions SET amount = 10
WHERE source_type = 'streak_bonus' AND reference_id = 14 AND amount = 35;

UPDATE aura_transactions SET amount = 15
WHERE source_type = 'streak_bonus' AND reference_id = 30 AND amount = 50;

UPDATE aura_transactions SET amount = 25
WHERE source_type = 'streak_bonus' AND reference_id = 60 AND amount = 100;

UPDATE aura_transactions SET amount = 50
WHERE source_type = 'streak_bonus' AND reference_id = 100 AND amount = 200;

UPDATE aura_transactions t
JOIN (
  SELECT c.id
  FROM (
    SELECT x.id,
           x.user_id,
           x.created_at,
           CASE
             WHEN x.reference_type IN ('training_day', 'goal_plan_day')
               THEN STR_TO_DATE(CAST(x.reference_id AS CHAR), '%Y%m%d')
             WHEN x.reference_type IN ('completed_session', 'goal_plan_session')
               THEN STR_TO_DATE(xcs.date, '%Y-%m-%d')
             ELSE NULL
           END AS app_day
    FROM aura_transactions x
    LEFT JOIN completed_sessions xcs
      ON xcs.id = x.reference_id
     AND xcs.user_id = x.user_id
     AND x.reference_type IN ('completed_session', 'goal_plan_session')
    WHERE x.source_type IN ('training_completion', 'goal_plan_completion')
      AND x.amount = 3
  ) c
  JOIN aura_transactions att
    ON att.user_id = c.user_id
   AND att.source_type = 'attendance'
   AND att.reference_type = 'attendance'
   AND att.amount IN (5, 10)
  JOIN attendance a
    ON a.id = att.reference_id
   AND a.member_id = att.user_id
   AND a.session_date = c.app_day
  WHERE c.created_at < (
          SELECT DATE_ADD(m.applied_at, INTERVAL 1 HOUR)
          FROM _migrations m
          WHERE m.name = '0344_aura_revaluation.sql'
        )
    AND NOT EXISTS (
          SELECT 1
          FROM aura_transactions sm
          JOIN attendance sa
            ON sa.id = sm.reference_id
           AND sa.member_id = sm.user_id
          WHERE sm.user_id = c.user_id
            AND sm.source_type = 'attendance'
            AND sm.reference_type = 'attendance'
            AND sm.amount BETWEEN 1 AND 4
            AND sa.session_date = c.app_day
        )
  GROUP BY c.id
) d ON d.id = t.id
SET t.amount = 0;

UPDATE aura_transactions t
JOIN (
  SELECT g.id
  FROM aura_transactions g
  LEFT JOIN completed_sessions gcs
    ON gcs.id = g.reference_id
   AND gcs.user_id = g.user_id
   AND g.reference_type IN ('completed_session', 'goal_plan_session')
  JOIN aura_transactions tr
    ON tr.user_id = g.user_id
   AND tr.source_type = 'training_completion'
   AND tr.amount = 3
  LEFT JOIN completed_sessions tcs
    ON tcs.id = tr.reference_id
   AND tcs.user_id = tr.user_id
   AND tr.reference_type IN ('completed_session', 'goal_plan_session')
  WHERE g.source_type = 'goal_plan_completion'
    AND g.amount = 3
    AND CASE
          WHEN g.reference_type IN ('training_day', 'goal_plan_day')
            THEN STR_TO_DATE(CAST(g.reference_id AS CHAR), '%Y%m%d')
          WHEN g.reference_type IN ('completed_session', 'goal_plan_session')
            THEN STR_TO_DATE(gcs.date, '%Y-%m-%d')
          ELSE NULL
        END = CASE
          WHEN tr.reference_type IN ('training_day', 'goal_plan_day')
            THEN STR_TO_DATE(CAST(tr.reference_id AS CHAR), '%Y%m%d')
          WHEN tr.reference_type IN ('completed_session', 'goal_plan_session')
            THEN STR_TO_DATE(tcs.date, '%Y-%m-%d')
          ELSE NULL
        END
  GROUP BY g.id
) d ON d.id = t.id
SET t.amount = 0;

UPDATE aura_balances b
LEFT JOIN (
  SELECT user_id, SUM(amount) AS s
  FROM aura_transactions
  GROUP BY user_id
) x ON x.user_id = b.user_id
SET b.balance = COALESCE(x.s, 0);
