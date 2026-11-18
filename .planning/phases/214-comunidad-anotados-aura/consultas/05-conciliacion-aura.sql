-- Fase 214 (D-38, D-49, D-64): conciliación de Aura alrededor de la migración 0344
-- SOLO LECTURA. No correr sin OK de Franco.
-- Devuelve solo conteos, ningún id ni dato personal.
--
-- Cuándo correr cada bloque:
--   Antes del merge (con la base de producción todavía en la escala vieja): bloques 0 y 1.
--   Después del deploy de la 0344 y después del repaso de D-49: bloques 2 a 6
--   (y el 1 de nuevo, que también sirve después).
--   El control previo a mostrar puntos en las pantallas: bloques 1, 4 y 6 en staging
--   antes y después del repaso. Los bloques 4 y 6 tienen que dar 0 después del repaso.

SET SESSION TRANSACTION READ ONLY;
SET SESSION max_execution_time = 60000;

-- 0. Programas que la 0344 va a tocar (nombres de programas, no datos personales)
-- Esperado: solo programas con el valor por defecto. Si alguno se cargó a mano con
-- 15 o 100, Franco decide y se corrige con una migración aparte.
SELECT id, name, aura_weekly_bonus, aura_completion_bonus
FROM programs
WHERE aura_weekly_bonus = 15 OR aura_completion_bonus = 100;

-- 1. Control previo: filas que ninguna regla mapea, agrupadas
-- Esperado: vacío o casos conocidos (la posible fila de antigüedad fuera de 50/100/250).
-- Sirve antes y después: acepta la escala vieja y la nueva. La asistencia puede valer
-- 10 (vieja) o entre 0 y 5 (nueva), la app y el plan a medida 10 (viejo), 3 o 0 (nuevo).
SELECT source_type, IFNULL(reference_type, '-') AS ref, amount, COUNT(*) AS filas
FROM aura_transactions
WHERE NOT (
     (source_type = 'attendance' AND (amount = 10 OR amount BETWEEN 0 AND 5))
  OR (source_type = 'manual_adjustment' AND reference_type = 'attendance_reversal' AND amount IN (-10, -5))
  OR (source_type = 'onboarding_completion' AND amount IN (50, 5))
  OR (source_type = 'tenure_milestone' AND (
         (reference_id = 3 AND amount IN (50, 15))
      OR (reference_id = 6 AND amount IN (100, 25))
      OR (reference_id >= 12 AND amount IN (250, 50))))
  OR (source_type = 'streak_bonus' AND (reference_id, amount) IN
        ((7, 20), (7, 5), (14, 35), (14, 10), (30, 50), (30, 15), (60, 100), (60, 25), (100, 200), (100, 50)))
  OR (source_type IN ('training_completion', 'goal_plan_completion') AND amount IN (10, 3, 0))
  OR (source_type = 'extra_block' AND amount IN (5, 2))
  OR (source_type = 'stretch' AND amount IN (5, 1))
  OR (source_type = 'program_week_completion' AND amount IN (15, 8))
  OR (source_type = 'program_completion' AND amount IN (100, 50))
  OR (source_type = 'referral' AND amount = 0)
)
GROUP BY source_type, ref, amount;

-- 2. Saldo guardado = suma del ledger, por usuario
-- Esperado: difieren = 0 después de la 0344.
SELECT COUNT(*) AS usuarios,
       SUM(b.balance = COALESCE(x.s, 0)) AS coinciden,
       SUM(b.balance <> COALESCE(x.s, 0)) AS difieren
FROM aura_balances b
LEFT JOIN (SELECT user_id, SUM(amount) AS s FROM aura_transactions GROUP BY user_id) x
  ON x.user_id = b.user_id;

-- 3. Canjes: Aura ganada = saldo mientras no haya canjes
-- Esperado: 0 y 0.
SELECT SUM(source_type = 'manual_adjustment' AND reference_type = 'subscription') AS canjes,
       SUM(source_type = 'subscription_discount') AS filas_subscription_discount
FROM aura_transactions;

-- 4. Filas en escala vieja de las fuentes que paga el código de la API vieja
-- Esperado: ninguna fila (sin resultados) después del repaso de D-49.
SELECT source_type, COUNT(*) AS filas
FROM aura_transactions
WHERE (source_type = 'attendance' AND amount = 10)
   OR (source_type = 'manual_adjustment' AND reference_type = 'attendance_reversal' AND amount = -10)
   OR (source_type = 'onboarding_completion' AND amount = 50)
   OR (source_type = 'tenure_milestone' AND ((reference_id = 3 AND amount = 50) OR (reference_id = 6 AND amount = 100) OR (reference_id >= 12 AND amount = 250)))
   OR (source_type = 'streak_bonus' AND (reference_id, amount) IN ((7, 20), (14, 35), (30, 50), (60, 100), (100, 200)))
GROUP BY source_type;

-- 5. Conciliación de la definición que usa la app (Aura ganada, D-02)
-- Por usuario: SUM(amount) sin subscription_discount ni canjes contra aura_balances.balance.
-- Esperado: difieren = 0 mientras no haya canjes.
SELECT COUNT(*) AS usuarios,
       SUM(b.balance = COALESCE(g.ganada, 0)) AS coinciden,
       SUM(b.balance <> COALESCE(g.ganada, 0)) AS difieren
FROM aura_balances b
LEFT JOIN (
  SELECT user_id, SUM(amount) AS ganada
  FROM aura_transactions
  WHERE source_type <> 'subscription_discount'
    AND NOT (source_type = 'manual_adjustment' AND reference_type = 'subscription')
  GROUP BY user_id
) g ON g.user_id = b.user_id;

-- 6. Tope del día (D-64), sin falsos positivos con dos asistencias
-- app = suma de training_completion y goal_plan_completion del usuario-día.
-- min_asist = MENOR monto positivo de asistencia de ese día. Dos asistencias de 5 en
-- categorías distintas el mismo día NO son violación.
-- Esperado: usuario_dias_que_violan = 0 y filas_app_sin_dia = 0 después de la 0344 y del repaso.
SELECT COUNT(*) AS usuario_dias_que_violan
FROM (
  SELECT p.user_id, p.dia, p.app
  FROM (
    SELECT z.user_id, z.dia, SUM(z.amount) AS app
    FROM (
      SELECT x.user_id, x.amount,
             CASE
               WHEN x.reference_type IN ('training_day', 'goal_plan_day')
                 THEN STR_TO_DATE(CAST(x.reference_id AS CHAR), '%Y%m%d')
               WHEN x.reference_type IN ('completed_session', 'goal_plan_session')
                 THEN STR_TO_DATE(cs.date, '%Y-%m-%d')
               ELSE NULL
             END AS dia
      FROM aura_transactions x
      LEFT JOIN completed_sessions cs
        ON cs.id = x.reference_id
       AND cs.user_id = x.user_id
       AND x.reference_type IN ('completed_session', 'goal_plan_session')
      WHERE x.source_type IN ('training_completion', 'goal_plan_completion')
    ) z
    WHERE z.dia IS NOT NULL
    GROUP BY z.user_id, z.dia
  ) p
  LEFT JOIN (
    SELECT att.user_id, a.session_date AS dia, MIN(att.amount) AS min_asist
    FROM aura_transactions att
    JOIN attendance a ON a.id = att.reference_id AND a.member_id = att.user_id
    WHERE att.source_type = 'attendance'
      AND att.reference_type = 'attendance'
      AND att.amount > 0
    GROUP BY att.user_id, a.session_date
  ) s ON s.user_id = p.user_id AND s.dia = p.dia
  WHERE p.app > 3
     OR (s.min_asist IS NOT NULL AND s.min_asist + p.app > 5)
) v;

-- 6b. Filas de app o plan a medida con monto y un reference_type cuyo día no se puede reconstruir
SELECT COUNT(*) AS filas_app_sin_dia
FROM aura_transactions x
LEFT JOIN completed_sessions cs
  ON cs.id = x.reference_id
 AND cs.user_id = x.user_id
 AND x.reference_type IN ('completed_session', 'goal_plan_session')
WHERE x.source_type IN ('training_completion', 'goal_plan_completion')
  AND x.amount > 0
  AND CASE
        WHEN x.reference_type IN ('training_day', 'goal_plan_day')
          THEN STR_TO_DATE(CAST(x.reference_id AS CHAR), '%Y%m%d')
        WHEN x.reference_type IN ('completed_session', 'goal_plan_session')
          THEN STR_TO_DATE(cs.date, '%Y-%m-%d')
        ELSE NULL
      END IS NULL;
