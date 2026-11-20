-- 0355_reactivar_invitacion_sofia_racedo.sql
-- Hotfix de datos (2026-11-20, pedido de Franco): Sofía Racedo (users.id 8608)
-- activó sola su invitación desde la app el 2026-10-30 (invitación 3, sub de
-- accesos 9871, plan "Invitación"), nadie la contactó a tiempo y sus 3 accesos
-- vencieron el 2026-11-11 sin usar (cero reservas, cero asistencias).
-- Se le vuelven a dar los mismos 3 accesos con vigencia nueva: arranca HOY
-- 2026-11-20 y dura 10 días hábiles, con la MISMA regla que la activación
-- (business-days.ts addBusinessDays): cuenta desde el día siguiente, lunes a
-- sábado, sin los feriados AR del gimnasio cargados en holidays.
-- No es una invitación nueva: no consume cupo del invitador ni toca la
-- ventana de 90 días. Solo se mueven las fechas y la sub vuelve a active.
-- Guardas: ids + apellido + estado actual. En una base donde esas filas no
-- sean las de Sofía (staging) el UPDATE no toca nada. Idempotente.
-- Hand-written, NUNCA drizzle-kit push o migrate.
WITH RECURSIVE dias (d, n) AS (
  SELECT DATE('2026-11-20'), 0
  UNION ALL
  SELECT dias.d + INTERVAL 1 DAY,
         dias.n + IF(
           DAYOFWEEK(dias.d + INTERVAL 1 DAY) <> 1
             AND NOT EXISTS (
               SELECT 1 FROM holidays h
               WHERE h.tenant_id = 1
                 AND h.country = 'AR'
                 AND h.date = dias.d + INTERVAL 1 DAY
             ),
           1, 0)
  FROM dias
  WHERE dias.n < 10
)
UPDATE invitations i
JOIN subscriptions s ON s.id = i.subscription_id AND s.tenant_id = i.tenant_id
JOIN users u ON u.id = i.invited_user_id AND u.tenant_id = i.tenant_id
JOIN (SELECT MIN(d) AS fin FROM dias WHERE n = 10) x
SET i.access_starts_on = '2026-11-20',
    i.access_expires_on = x.fin,
    s.start_date = '2026-11-20',
    s.end_date = x.fin,
    s.subscription_status = 'active'
WHERE i.id = 3
  AND i.tenant_id = 1
  AND i.invited_user_id = 8608
  AND i.subscription_id = 9871
  AND i.status = 'active'
  AND i.converted_at IS NULL
  AND u.last_name = 'Racedo'
  AND s.user_id = 8608
  AND s.classes_remaining = 3
  AND s.subscription_status IN ('expired', 'active');
