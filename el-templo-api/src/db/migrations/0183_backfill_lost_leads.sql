-- 0183_backfill_lost_leads.sql
-- Phase 163 (AUTO-05, D-08): backfill retroactivo de la maquina de estados.
-- Hand-written (db:generate pega contra el drift interactivo de
-- sessions.goal_plan_type, igual que 0154/0158/0161/0162/0170/0182, y
-- meta/_journal.json esta stale). NEVER drizzle-kit push/migrate -- la tabla
-- _migrations es la unica fuente de verdad, local y prod.
--
-- Numeracion: 0182 la introduce 163-01 (fundacion). Existe un 0181_debt_management
-- en una rama sin mergear -- este archivo es el siguiente libre real tras 0182.
--
-- Un comentario SQL NUNCA debe contener el separador de statements -- el runner
-- parte los statements crudos primero y recien despues borra los comentarios de
-- doble guion.
--
-- Que hace:
--   1. Snapshot de las columnas de lead en users_lead_backup_0183 (todo user con
--      lead_status seteado o converted_at seteado) para poder auditar/revertir la
--      reclasificacion retroactiva. Patron exacto del backup de 0170:29-34. Los
--      deploys NO respaldan la DB, por eso el backup vive en la migracion.
--   2. Aplica UNA vez la regla del cron (src/jobs/expire-lost-leads.ts, D-02):
--      lead En seguimiento (o NULL efectivo) cuya ULTIMA booking is_trial no
--      cancelada (MAX(id) por miembro, misma derivacion que 0170/0182/reporte)
--      quedo fuera de la ventana X -> lead_status='perdido', source='auto'.
--      X se lee de system_settings.leads.perdido_window_days (sembrada por 0182)
--      via subquery, para usar EXACTAMENTE el mismo valor que el cron. Sin guard
--      de asistencia (D-02: el campo Asistio NO toca el estado). NUNCA pisa un
--      estado manual (lead_status_source='manual'), ni convertidos, ni con plan,
--      ni borrados, ni activos/staff (status IN prueba/freemium).
--
-- Referencia del brief (15/07): ~112 En seguimiento vencidos deberian mover a
-- Perdido. El dry-run contra prod (src/db/scripts/0183_backfill_lost_leads_dryrun.sql)
-- es item de verificacion humana ANTES de que el pipeline aplique esta migracion.

CREATE TABLE users_lead_backup_0183 AS
SELECT id, status, lead_status, lead_status_source, converted_at, updated_at
FROM users
WHERE lead_status IS NOT NULL
   OR converted_at IS NOT NULL;

UPDATE users u
JOIN (
  SELECT b2.member_id, MAX(b2.id) AS booking_id
  FROM bookings b2
  WHERE b2.is_trial = 1 AND b2.booking_status <> 'cancelado'
  GROUP BY b2.member_id
) lt ON lt.member_id = u.id
JOIN bookings b ON b.id = lt.booking_id
SET u.lead_status = 'perdido',
    u.lead_status_source = 'auto'
WHERE (u.lead_status = 'en_seguimiento' OR u.lead_status IS NULL)
  AND u.converted_at IS NULL
  AND u.purchased_plan_id IS NULL
  AND u.deleted_at IS NULL
  AND u.status IN ('prueba', 'freemium')
  AND (u.lead_status_source <> 'manual' OR u.lead_status_source IS NULL)
  AND DATE_ADD(
        b.booking_date,
        INTERVAL (
          SELECT GREATEST(CAST(ss.setting_value AS SIGNED), 1)
          FROM system_settings ss
          WHERE ss.setting_key = 'leads.perdido_window_days'
          LIMIT 1
        ) DAY
      ) < CURDATE();
