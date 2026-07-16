-- 0183_backfill_lost_leads_dryrun.sql
-- Phase 163 (AUTO-05, D-08) -- PREVIEW COUNT-ONLY del backfill 0183.
--
-- Este archivo vive en src/db/scripts/ (NO en migrations/) a proposito: el runner
-- solo globea migrations/*.sql, asi que este script NUNCA se aplica solo. Es la
-- verificacion humana previa al deploy (D-08): correlo a mano contra staging/prod
-- ANTES de que el pipeline aplique 0183 y confirma que la cantidad de filas que
-- moveria es la esperada (~112 En seguimiento vencidos segun el brief del 15/07).
--
-- El predicado WHERE es IDENTICO al UPDATE de reclasificacion de la migracion
-- 0183, y lee la misma ventana X de system_settings.leads.perdido_window_days
-- (sembrada por 0182), de modo que cron / backfill / dry-run cuentan lo mismo.
-- No muta nada: es un unico SELECT COUNT(*).
--
-- Uso:
--   mysql -u <user> -p <db> < src/db/scripts/0183_backfill_lost_leads_dryrun.sql

SELECT COUNT(*) AS would_flip_to_perdido
FROM users u
JOIN (
  SELECT b2.member_id, MAX(b2.id) AS booking_id
  FROM bookings b2
  WHERE b2.is_trial = 1 AND b2.booking_status <> 'cancelado'
  GROUP BY b2.member_id
) lt ON lt.member_id = u.id
JOIN bookings b ON b.id = lt.booking_id
WHERE (u.lead_status = 'en_seguimiento' OR u.lead_status IS NULL)
  AND u.converted_at IS NULL
  AND u.purchased_plan_id IS NULL
  AND u.deleted_at IS NULL
  AND u.status = 'prueba'
  AND (u.lead_status_source <> 'manual' OR u.lead_status_source IS NULL)
  AND DATE_ADD(
        b.booking_date,
        INTERVAL (
          SELECT COALESCE(
            (SELECT CASE
                      WHEN FLOOR(ss.setting_value) > 0 THEN FLOOR(ss.setting_value)
                      ELSE 14
                    END
             FROM system_settings ss
             WHERE ss.setting_key = 'leads.perdido_window_days'
             LIMIT 1),
            14
          )
        ) DAY
      ) < CURDATE();
