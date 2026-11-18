-- 0344_aura_revaluation.sql
-- Fase 214 (D-18, D-19, D-21, D-49, D-64): re-valorizacion del historial de Aura
-- con la escala nueva (clase 5, onboarding 5, entrenar 3, plan a medida 3, bloque
-- libre 2, estirar 1, antiguedad 15/25/50, rachas 5/10/15/25/50, programas 8/50).
-- Escrita a mano (db:generate esta bloqueado por el drift de goal_plan_type y
-- meta/_journal.json esta stale). NUNCA drizzle-kit push ni migrate.
--
-- Idempotente: cada UPDATE exige el valor VIEJO exacto y el valor nuevo nunca
-- cumple la condicion de otra regla del mismo source_type. Sin formulas sobre
-- amount, solo valores literales. Una fila que no encaja en ninguna regla NO se
-- toca y queda medida por la consulta de conciliacion 05 bloque 1.
--
-- Respaldo previo (los deploys no respaldan la base): aura_transactions_backup_0344
-- y aura_balances_backup_0344, sin tenant_id ni indices (el verificador de uniques
-- reconoce el sufijo _backup_NNNN como tabla efimera). Van PRIMERO porque si el
-- runner vuelve a correr el archivo el CREATE falla con already exists y el runner
-- saltea los errores siguientes, que son todos idempotentes.
--
-- Orden: 1 respaldo, 2 mapeo por valor viejo, 3 programas, 4 aura_config,
-- 5 tope del dia (D-64), 6 recalculo de saldos.
--
-- Tope del dia (D-64) en el historial: la asistencia queda en 5 y lo que se pone
-- en 0 es la fila de app o de plan a medida (la de menor valor). El dia de una fila
-- de app sale de reference_id en formato YYYYMMDD cuando reference_type es
-- training_day o goal_plan_day, y de completed_sessions.date (por id) cuando es
-- completed_session o goal_plan_session. Verificado en git (commit 91bd5cfc3) que
-- los tipos viejos guardaban el id de completed_sessions. Un tipo cuyo dia no se
-- pueda reconstruir no se toca. Limitacion conocida: la reversa de una asistencia
-- no tiene reference_id, asi que una asistencia revertida igual cuenta como
-- asistencia del dia.
--
-- Programas: un programa al que se le puso a mano exactamente 15 o 100 es
-- indistinguible del default y tambien pasa a 8 o 50. La consulta 05 bloque 0 los
-- lista antes del merge.
--
-- La migracion de repaso de D-49 (filas que la API vieja acredite entre esta
-- migracion y el reinicio) NO va aca, va en un deploy posterior.
--
-- Un comentario SQL NUNCA debe contener el separador de statements, el runner
-- parte el archivo crudo primero y recien despues borra los comentarios.

CREATE TABLE aura_transactions_backup_0344 AS
SELECT id, user_id, source_type, reference_type, reference_id, amount, created_at
FROM aura_transactions;

CREATE TABLE aura_balances_backup_0344 AS
SELECT user_id, balance
FROM aura_balances;

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

UPDATE aura_transactions SET amount = 3
WHERE source_type IN ('training_completion', 'goal_plan_completion') AND amount = 10;

UPDATE aura_transactions SET amount = 2
WHERE source_type = 'extra_block' AND amount = 5;

UPDATE aura_transactions SET amount = 1
WHERE source_type = 'stretch' AND amount = 5;

UPDATE aura_transactions SET amount = 8
WHERE source_type = 'program_week_completion' AND amount = 15;

UPDATE aura_transactions SET amount = 50
WHERE source_type = 'program_completion' AND amount = 100;

UPDATE programs SET aura_weekly_bonus = 8 WHERE aura_weekly_bonus = 15;

UPDATE programs SET aura_completion_bonus = 50 WHERE aura_completion_bonus = 100;

ALTER TABLE programs ALTER COLUMN aura_weekly_bonus SET DEFAULT 8;

ALTER TABLE programs ALTER COLUMN aura_completion_bonus SET DEFAULT 50;

UPDATE aura_config SET default_amount = 3
WHERE aura_config_source_type IN ('training_completion', 'goal_plan_completion');

UPDATE aura_config SET default_amount = 2
WHERE aura_config_source_type = 'extra_block';

UPDATE aura_config SET default_amount = 1
WHERE aura_config_source_type = 'stretch';

UPDATE aura_config SET default_amount = 5
WHERE aura_config_source_type = 'onboarding_completion';

UPDATE aura_config SET default_amount = 5
WHERE aura_config_source_type = 'attendance';

UPDATE aura_transactions t
JOIN (
  SELECT x.id
  FROM aura_transactions x
  LEFT JOIN completed_sessions xcs
    ON xcs.id = x.reference_id
   AND xcs.user_id = x.user_id
   AND x.reference_type IN ('completed_session', 'goal_plan_session')
  JOIN aura_transactions att
    ON att.user_id = x.user_id
   AND att.source_type = 'attendance'
   AND att.reference_type = 'attendance'
   AND att.amount > 0
  JOIN attendance a
    ON a.id = att.reference_id
   AND a.member_id = att.user_id
  WHERE x.source_type IN ('training_completion', 'goal_plan_completion')
    AND x.amount = 3
    AND a.session_date = CASE
          WHEN x.reference_type IN ('training_day', 'goal_plan_day')
            THEN STR_TO_DATE(CAST(x.reference_id AS CHAR), '%Y%m%d')
          WHEN x.reference_type IN ('completed_session', 'goal_plan_session')
            THEN STR_TO_DATE(xcs.date, '%Y-%m-%d')
          ELSE NULL
        END
  GROUP BY x.id
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
