-- Migration 0120: backfill bug en changePlanNow con startDate futura
--
-- BUG (corregido en el dispatcher de changePlan en service.ts)
-- changePlanNow hardcodeaba subscription_status = 'active' aunque
-- input.startDate fuera mayor a hoy. Cuando un admin usaba "Cambiar
-- plan ahora" con fecha futura el flow:
--   1) Cerraba la sub anterior como 'changed' inmediatamente
--      (perdiendo dias ya pagados de cobertura)
--   2) Creaba la nueva como 'active' con start_date futura
--   3) recomputeUserStatus marcaba al user como 'inactivo' porque
--      ninguna sub tenia start_date <= today AND active|paused
--   4) El cron activateDueScheduledSubs nunca la levantaba porque
--      solo busca status='scheduled', NO 'active'+future
-- Resultado: el alumno quedaba inactivo desde el dia del cambio
-- hasta indefinidamente.
--
-- ALCANCE EN PROD AL 2026-05-09
-- 10 casos con prev='changed' + new='active'(start_date futura)
-- 4 casos con sub activa ya iniciada pero user stuck en 'inactivo'
-- (recomputeUserStatus nunca volvio a correr cuando llego el start)
--
-- ESTRATEGIA
-- Step 1: reabrir las prev cerradas como 'changed' que todavia tienen
--         end_date >= hoy (la cobertura pagada no expiro).
-- Step 2: bajar las new de 'active' a 'scheduled' para que el cron
--         diario las active el dia que corresponde.
-- Step 3: recomputar users.status para todos los miembros con sub
--         activa+iniciada que esten 'inactivo'. Cubre los 14 casos.
-- Step 4: restaurar 3 bookings canceladas por cancelFutureBookings
--         del flow buggeado (Felipe Mandagaran, Valentina Malaguti,
--         Evelina Fregocini). Capacidad verificada al 2026-05-09 con
--         cupo holgado en cada slot. Guarda de capacidad inline para
--         idempotencia y proteccion ante re-ejecucion concurrente.

UPDATE subscriptions prev
INNER JOIN subscriptions new_sub ON new_sub.previous_subscription_id = prev.id
SET
  prev.subscription_status = 'active',
  prev.notes = CASE
    WHEN prev.notes LIKE '% | Cambiado a %'
      THEN SUBSTRING_INDEX(prev.notes, ' | Cambiado a ', 1)
    WHEN prev.notes REGEXP '^Cambiado a [^|]+$'
      THEN NULL
    ELSE prev.notes
  END
WHERE prev.subscription_status = 'changed'
  AND prev.end_date >= CURDATE()
  AND new_sub.subscription_status = 'active'
  AND new_sub.start_date > CURDATE();

UPDATE subscriptions
SET subscription_status = 'scheduled'
WHERE subscription_status = 'active'
  AND start_date > CURDATE()
  AND previous_subscription_id IS NOT NULL;

UPDATE users u
SET
  u.status = 'activo',
  u.converted_at = CASE
    WHEN u.converted_at IS NULL
      AND EXISTS (
        SELECT 1 FROM bookings b
        WHERE b.member_id = u.id AND b.is_trial = 1
      )
    THEN CURRENT_TIMESTAMP
    ELSE u.converted_at
  END
WHERE u.role = 'member'
  AND u.status = 'inactivo'
  AND EXISTS (
    SELECT 1 FROM subscriptions s
    WHERE s.user_id = u.id
      AND s.subscription_status IN ('active', 'paused')
      AND s.start_date <= CURDATE()
      AND (s.end_date IS NULL OR s.end_date >= CURDATE())
  );

UPDATE bookings b
INNER JOIN schedules sch ON sch.id = b.schedule_id
INNER JOIN branches br ON br.id = sch.branch_id
LEFT JOIN (
  SELECT schedule_id, booking_date, COUNT(*) AS cnt
  FROM bookings
  WHERE booking_status IN ('reservado', 'qr_escaneado', 'confirmado')
  GROUP BY schedule_id, booking_date
) occupancy
  ON occupancy.schedule_id = b.schedule_id
  AND occupancy.booking_date = b.booking_date
SET
  b.booking_status = 'reservado',
  b.cancelled_at = NULL,
  b.waitlist_position = NULL
WHERE b.id IN (5545, 266, 2206)
  AND b.booking_status = 'cancelado'
  AND b.booking_date >= CURDATE()
  AND COALESCE(occupancy.cnt, 0) < br.max_capacity;
