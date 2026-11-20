-- 0356_reactivar_invitacion_barbara_romani.sql
-- Hotfix de datos (2026-11-20, pedido de Franco): mismo caso que la 0355.
-- Barbara Romani (users.id 8466), invitada por Paola Ansaldi, activó sola su
-- invitación desde la app el 2026-10-27 (invitación 1, sub de accesos 9789,
-- plan "Invitación"), nadie la contactó y sus 3 accesos vencieron el
-- 2026-11-07 sin usar (cero reservas, cero asistencias).
-- Se le vuelven a dar los mismos 3 accesos: arranca HOY 2026-11-20 y dura 10
-- días hábiles con la MISMA regla que la activación (business-days.ts
-- addBusinessDays): desde el día siguiente, lunes a sábado, sin los feriados
-- AR del gimnasio cargados en holidays.
-- No es una invitación nueva: no consume cupo de Paola ni toca la ventana de
-- 90 días. Solo se mueven las fechas y la sub vuelve a active.
-- Va en un archivo aparte (no en la 0355) porque la 0355 ya está en staging.
-- Guardas: ids + apellido + estado actual. En una base donde esas filas no
-- sean las de Barbara (staging) el UPDATE no toca nada. Idempotente.
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
WHERE i.id = 1
  AND i.tenant_id = 1
  AND i.invited_user_id = 8466
  AND i.subscription_id = 9789
  AND i.status = 'active'
  AND i.converted_at IS NULL
  AND u.last_name = 'Romani'
  AND s.user_id = 8466
  AND s.classes_remaining = 3
  AND s.subscription_status IN ('expired', 'active');
