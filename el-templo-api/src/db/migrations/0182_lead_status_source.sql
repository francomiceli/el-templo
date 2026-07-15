-- 0182_lead_status_source.sql
-- Phase 163 (D-05/D-06/D-07): fundación de la máquina de estados del lead.
-- Hand-written (db:generate pega contra el drift interactivo de
-- sessions.goal_plan_type, igual que 0154/0158/0161/0162/0170, y
-- meta/_journal.json está stale). NEVER drizzle-kit push/migrate -- la tabla
-- _migrations es la única fuente de verdad, local y prod.
--
-- Numeración: la última aplicada es 0180. Existe un 0181_debt_management.sql en
-- una rama sin mergear -- este archivo es el siguiente libre real (0182), no se
-- reusa 0181.
--
-- Un comentario SQL NUNCA debe contener el separador de statements -- el runner
-- parte los statements crudos primero y recién después borra los comentarios de
-- doble guion.
--
-- Qué hace:
--   1. Agrega users.lead_status_source enum('auto','manual') NULL (D-07). Lista
--      de valores byte-idéntica al leadStatusSourceEnum del schema.
--   2. Siembra leads.perdido_window_days en system_settings (D-05/D-06) con el
--      p90 calculado dinámicamente sobre la distribución de días-a-convertir de
--      los leads Ganado en la DB donde corre. Fallback a 14 días si hay menos de
--      20 casos usables. Idempotente vía WHERE NOT EXISTS -- nunca pisa un valor
--      seteado a mano por un PUT previo.
--
-- Derivación "última booking is_trial no cancelada" = misma que 0170:98-118 y
-- que ReportsService.getTrialSessionsReport, para que cron/reporte/backfill
-- cuenten siempre la misma sesión. Toda la aritmética de fechas vive en el
-- dominio SQL DATE (DATEDIFF), nunca en JS.

ALTER TABLE `users`
  ADD COLUMN `lead_status_source` enum('auto','manual') NULL AFTER `lead_status`;

INSERT INTO `system_settings` (`setting_key`, `setting_value`)
WITH days_dist AS (
  SELECT DATEDIFF(fs.first_sub_created, b.booking_date) AS days_to_convert
  FROM users u
  JOIN (
    SELECT b2.member_id, MAX(b2.id) AS booking_id
    FROM bookings b2
    WHERE b2.is_trial = 1 AND b2.booking_status <> 'cancelado'
    GROUP BY b2.member_id
  ) lt ON lt.member_id = u.id
  JOIN bookings b ON b.id = lt.booking_id
  JOIN (
    SELECT user_id, MIN(created_at) AS first_sub_created
    FROM subscriptions
    GROUP BY user_id
  ) fs ON fs.user_id = u.id
  WHERE u.converted_at IS NOT NULL
    AND DATEDIFF(fs.first_sub_created, b.booking_date) >= 0
),
ranked AS (
  SELECT days_to_convert,
         PERCENT_RANK() OVER (ORDER BY days_to_convert) AS pr
  FROM days_dist
),
p90 AS (
  SELECT CEIL(MIN(days_to_convert)) AS p90_days
  FROM ranked
  WHERE pr >= 0.9
),
usable AS (
  SELECT COUNT(*) AS n FROM days_dist
)
SELECT
  'leads.perdido_window_days',
  CAST(
    CASE
      WHEN (SELECT n FROM usable) >= 20
        THEN GREATEST(COALESCE((SELECT p90_days FROM p90), 14), 1)
      ELSE 14
    END AS CHAR
  )
WHERE NOT EXISTS (
  SELECT 1 FROM `system_settings` WHERE `setting_key` = 'leads.perdido_window_days'
);
